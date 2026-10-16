import type { IncomingMessage, ServerResponse } from 'node:http'
import { handle, type Req } from './handler.js'
import { getStore } from './store.js'

function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {}
  for (const part of (header ?? '').split(';')) {
    const i = part.indexOf('=')
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim())
  }
  return out
}

async function readBody(req: IncomingMessage & { body?: unknown }): Promise<unknown> {
  if (req.body !== undefined) return req.body // Vercel pre-parses JSON
  const chunks: Buffer[] = []
  let size = 0
  for await (const c of req) {
    size += (c as Buffer).length
    if (size > 100_000) throw new Error('Body too large')
    chunks.push(c as Buffer)
  }
  const text = Buffer.concat(chunks).toString('utf8')
  if (!text) return undefined
  try { return JSON.parse(text) } catch { return undefined }
}

/**
 * On Vercel, vercel.json rewrites /api/* to /api?__p=<path>, so recover the real route from `__p`
 * when present. Locally (no rewrite) the request path is already correct.
 */
export function resolveRoute(rawUrl: string): { path: string; query: Record<string, string> } {
  const url = new URL(rawUrl, 'http://localhost')
  const forwarded = url.searchParams.get('__p')
  url.searchParams.delete('__p')
  return {
    path: forwarded !== null ? `/api/${forwarded}` : url.pathname,
    query: Object.fromEntries(url.searchParams),
  }
}

/** Adapter used by both the Vercel function and the local dev server. */
export async function nodeHandler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const route = resolveRoute(req.url ?? '/')
  const fwd = req.headers['x-forwarded-for']
  const ip = (Array.isArray(fwd) ? fwd[0] : fwd)?.split(',')[0].trim() || req.socket.remoteAddress || 'unknown'
  let body: unknown
  try { body = await readBody(req) } catch {
    res.statusCode = 413
    res.end(JSON.stringify({ error: 'Request too large' }))
    return
  }
  const r: Req = {
    method: req.method ?? 'GET',
    path: route.path,
    query: route.query,
    body,
    cookies: parseCookies(req.headers.cookie),
    ip,
    secure: req.headers['x-forwarded-proto'] === 'https',
  }
  const out = await handle(r, getStore())
  res.statusCode = out.status
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Cache-Control', 'no-store')
  for (const [k, v] of Object.entries(out.headers ?? {})) res.setHeader(k, v)
  res.end(JSON.stringify(out.body ?? {}))
}
