# Splitler

Split shared expenses with friends. The admin creates a group and shares its link (e.g. on WhatsApp); anyone with the link can add expenses themselves. No accounts. Groups auto-delete after 7 days of no activity.

- Frontend: Vite + React + TypeScript + Tailwind (`src/`)
- API: Vercel serverless function (`api/[...path].ts` -> `server/`), storage in Upstash Redis with a 7-day TTL

## Local development

```bash
npm install
cp .env.example .env.local   # set ADMIN_PASSWORD and SESSION_SECRET
npm run dev                  # API runs in-process with an in-memory store
npm test
```

Without `KV_REST_API_URL` / `KV_REST_API_TOKEN`, data lives in memory and resets when the dev server restarts.

## Deploy (Vercel)

1. Import the repo in Vercel (Vite preset, defaults are fine).
2. Storage tab -> add **Upstash Redis** from the Marketplace; it sets `KV_REST_API_URL` and `KV_REST_API_TOKEN`.
3. Settings -> Environment Variables: set `ADMIN_PASSWORD` and `SESSION_SECRET` (`openssl rand -hex 32`).
4. Redeploy. Open the site, sign in with the admin password, create a group, share the link.
