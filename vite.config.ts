import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { loadEnv, type Plugin } from 'vite'
import { defineConfig } from 'vitest/config'

/** Serve /api from server/ during `npm run dev` (in-memory store unless Upstash env is set). */
function devApi(mode: string): Plugin {
  return {
    name: 'splitler-dev-api',
    configureServer(server) {
      Object.assign(process.env, { ...loadEnv(mode, process.cwd(), ''), ...process.env })
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/')) return next()
        const mod = await server.ssrLoadModule('/server/node.ts')
        await mod.nodeHandler(req, res)
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss(), devApi(mode)],
  test: { environment: 'node' },
}))
