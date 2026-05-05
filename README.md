# CV Reformatter — Production Web UI

Companion frontend for the CV Reformatter FastAPI backend. Uses **Supabase Auth** (email/password in the browser) and wires the full session pipeline end-to-end with a Claude-inspired dark UI.

## Quick start

```bash
cd cv-reformatter-web
cp .env.example .env
# Edit .env with your Supabase URL + anon key and API base URL
npm install
npm run dev
```

Open http://localhost:5173 — sign in, then **New reformat**.

## Requirements

- Node.js **18+** recommended (matching local tooling). Python backend is unchanged.
- A Supabase project with **Auth** enabled and users who can sign in.
- The FastAPI server running (`uvicorn …`) with valid `.env`.

## Backend CORS

The API reads `CORS_ORIGINS` (see backend `api/config.py`). For local dev:

- either leave `CORS_ORIGINS=*` (default),
- or set e.g. `CORS_ORIGINS=http://localhost:5173`

So the browser can send `Authorization: Bearer <access_token>` to your API.

## How auth works

1. On app load, `createClient()` connects to Supabase (anon key only).
2. After **Sign in**, `session.access_token` is the JWT your backend validates (`get_current_user`).
3. All `/sessions/*` calls attach that Bearer token automatically.

## Scripts

| Command      | Purpose                |
|-------------|------------------------|
| `npm run dev`    | Vite dev server        |
| `npm run build`  | Production bundle       |
| `npm run preview`| Serve built app locally |

## Project layout

- `src/lib/supabase.ts` — Supabase client
- `src/lib/api.ts` — REST helpers for every backend endpoint
- `src/lib/recentSessions.ts` — local “recent sessions” (no backend list API)
- `src/pages/*` — login, home, wizard, workspace, settings

## Security

- `.env` is gitignored — never commit real keys.
- Use **anon** key in the SPA only; service role stays on the server.
