# Deployment & Setup

Full-stack app: a Node/Express server serves the React frontend **and** the
`/api` backend, backed by **Postgres** (Supabase). Quiz images live in the DB,
so the only external thing you need is one Postgres connection string.

## 1. Create a Supabase database (free)
1. Create a project at https://supabase.com.
2. Project Settings → **Database** → **Connection string** → **URI**. Copy it
   and put your DB password in place of `[PASSWORD]`. It looks like:
   `postgresql://postgres:YOURPASS@db.xxxxx.supabase.co:5432/postgres`

(You can also use Render Postgres or any Postgres — just use its connection
string. Set `PGSSL=true` for any managed/hosted Postgres.)

## 2. Configure environment variables
Local dev: copy `.env.example` to `.env` and fill it in.
On Render: set these in the service's **Environment** tab.

| Variable | What it is |
|---|---|
| `DATABASE_URL` | Postgres connection string (from step 1) |
| `PGSSL` | `true` for Supabase/managed Postgres, `false` for local |
| `ADMIN_PASSWORD` | password for the `/admin` panel |
| `ADMIN_VOUCHER` | the master voucher code (unlimited, never scored), e.g. `ADMIN-ALL-ACCESS` |
| `JWT_SECRET` | a long random string (signs admin + test-session tokens) |
| `PORT` | set automatically by Render |

## 3. Deploy on Render
Use the existing service (or the included `render.yaml`):
- **Build command:** `npm install --include=dev && npm run build`
- **Start command:** `npm start`

On first boot the server **auto-creates the schema and seeds the 100 questions**
(only if the questions table is empty) and creates the master voucher. No manual
step needed. To force a re-seed later: run `npm run seed`.

## 4. Use it
- Visit `/` → enter name + a voucher to take the test.
- `/scoreboard` → public leaderboard.
- `/admin` → log in with `ADMIN_PASSWORD` to generate vouchers, manage the
  scoreboard, and add/edit/remove questions.

## Local development
```bash
# one-time: local Postgres
createdb iqtest   # or use the DATABASE_URL in .env

npm install
npm run seed       # create schema + load the 100 questions
npm run server     # API + built app on http://localhost:3001
# in another terminal, for hot-reload frontend:
npm run dev        # Vite on http://localhost:5173, proxies /api to :3001
```

## Regenerating / verifying questions
```bash
npm run generate   # re-create the 100 seed puzzles (scripts/seed_assets + seed_data.json)
npm run verify     # independently verify every seed puzzle is unambiguous
npm run seed       # load them into the DB
```

## Notes
- **Server-side scoring:** correct answers never reach the browser; the server
  scores submissions, so the scoreboard can't be faked from the client.
- **Vouchers:** single-use vouchers are consumed when the test *starts*.
- **Admin voucher:** unlimited, never expires, runs are practice-only (not on
  the scoreboard).
- **Screenshots** still can't be fully blocked on the web (deterrents only).
