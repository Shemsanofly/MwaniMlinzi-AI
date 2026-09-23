# Deployment (no Docker)

MwaniMlinzi runs as three plain pieces: a **static frontend**, a **Node.js API** and a **PostgreSQL database**.

```
Static hosting (Vercel/Netlify/Nginx)  ──HTTPS──►  Node.js API (VPS, PM2, behind Nginx/Caddy)  ──►  PostgreSQL
```

## 1. Database

Use a managed PostgreSQL (e.g. DigitalOcean, AWS RDS, Supabase, Neon, Render) or PostgreSQL on the VPS (see
[DATABASE.md](DATABASE.md)). Create a database and a dedicated user, and note the connection string. Many managed providers
require TLS: append `?sslmode=require` to `DATABASE_URL`.

## 2. Backend on a VPS (Ubuntu example)

```bash
# Node.js 22 LTS
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt install -y nodejs
sudo npm install -g pm2

git clone <your-repo-url> /opt/mwanimlinzi
cd /opt/mwanimlinzi/backend
npm ci --omit=dev          # installs runtime deps (prisma CLI is a devDependency → see note)
```

> `prisma migrate deploy` needs the Prisma CLI. Either run `npm ci` (with dev deps) on the server, or run migrations from CI
> with the production `DATABASE_URL`.

Create `backend/.env` (never commit it):

```ini
NODE_ENV=production
PORT=5000
DATABASE_URL=postgresql://mwani_app:***@db-host:5432/mwanimlinzi?sslmode=require
JWT_SECRET=<output of: node -e "console.log(require('crypto').randomBytes(48).toString('hex'))">
JWT_EXPIRES_IN=7d
CORS_ORIGIN=https://app.example.org
DEMO_MODE=false
ENABLE_JOBS=true
WEATHER_PROVIDER=open-meteo
OCEAN_PROVIDER=open-meteo-marine
# optional
LLM_PROVIDER=
LLM_API_KEY=
SMS_PROVIDER=
SMS_API_KEY=
SMS_USERNAME=
UPLOAD_DIR=/var/lib/mwanimlinzi/uploads
MAX_UPLOAD_MB=5
```

```bash
npx prisma generate
npx prisma migrate deploy
# Reference data only (roles, permissions, species, settings, action library) + first admin — non-destructive:
ADMIN_EMAIL=admin@example.org ADMIN_PASSWORD='a-long-unique-password' npm run seed:reference

pm2 start src/server.js --name mwanimlinzi-api
pm2 save && pm2 startup     # restart on reboot
pm2 logs mwanimlinzi-api
```

`npm start` (`node src/server.js`) works too; PM2 adds restarts, logs and startup scripts. Run **one** instance with
`ENABLE_JOBS=true` (scheduled jobs); extra instances should set `ENABLE_JOBS=false`.

> **Never run `npm run seed` in production** — it wipes the database and loads demo data (it refuses when
> `NODE_ENV=production` unless `--force`). Use `npm run seed:reference`, which only upserts reference data and leaves
> existing Action Library entries (and their expert validations) untouched.

### Reverse proxy (Nginx) + HTTPS

```nginx
server {
  server_name api.example.org;
  client_max_body_size 6m;
  location / {
    proxy_pass http://127.0.0.1:5000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

`sudo certbot --nginx -d api.example.org` for TLS. The app sets `trust proxy` so rate limits see real client IPs.

Health check for monitoring: `GET https://api.example.org/api/health` (HTTP 503 if the database is down).

### Windows server

Install Node.js LTS and PostgreSQL (EDB installer), then in PowerShell:

```powershell
cd C:\mwanimlinzi\backend
copy .env.example .env   # edit values
npm ci
npx prisma migrate deploy
npm install -g pm2 pm2-windows-startup
pm2 start src/server.js --name mwanimlinzi-api
pm2 save
pm2-startup install
```

## 3. Frontend (static)

```bash
cd frontend
npm ci
VITE_API_URL=https://api.example.org/api npm run build     # Windows: set VITE_API_URL=... && npm run build
# output: frontend/dist/
```

- **Vercel**: import the repo, *Root Directory* `frontend`, build `npm run build`, output `dist`, environment variable
  `VITE_API_URL=https://api.example.org/api`. `frontend/vercel.json` rewrites all routes to `index.html` (SPA routing).
- **Netlify**: base `frontend`, build `npm run build`, publish `frontend/dist`; `public/_redirects` handles SPA routing.
- **Nginx**: serve `dist/` with `try_files $uri /index.html;`.

Add the frontend origin to the backend's `CORS_ORIGIN`.

Alternatively serve the frontend from the same domain as the API through Nginx (`/` → `dist`, `/api` → Node), in which
case `VITE_API_URL` can stay empty (defaults to `/api`).

## 4. Switching demo ↔ live

| Setting | Demo | Live |
|---|---|---|
| `DEMO_MODE` | `true` | `false` |
| Weather | demo provider | `WEATHER_PROVIDER=open-meteo` (no key) or `openweathermap` + `WEATHER_API_KEY` |
| Ocean | demo provider | `OCEAN_PROVIDER=open-meteo-marine` (no key) or `stormglass` + `OCEAN_API_KEY` |
| SMS | simulated (logged) | `SMS_PROVIDER=africastalking`, `SMS_API_KEY`, `SMS_USERNAME`, optional `SMS_SENDER_ID` |
| USSD | `/demo/ussd` simulator | `USSD_PROVIDER=africastalking`; register `https://api.example.org/api/ussd/callback?key=<USSD_API_KEY>` as the callback URL |
| LLM | templates | `LLM_PROVIDER=anthropic` (or `openai`), `LLM_API_KEY`, optional `LLM_MODEL` |

Restart the API after changing `.env` (`pm2 restart mwanimlinzi-api`). Check **Admin → Settings → System** or
`/api/health` to confirm which providers are active. If a live provider fails the system automatically uses cached, then
demo data, and labels it.

## 5. ML models in production

Model files live in `ai/models/` (configurable with `MODELS_DIR`). Train on the server or copy the JSON files, then activate
in **Admin → Models**. Models trained only on synthetic data should not be activated for real farmers.

## 6. Updating

```bash
cd /opt/mwanimlinzi && git pull
cd backend && npm ci && npx prisma migrate deploy && pm2 restart mwanimlinzi-api
cd ../frontend && npm ci && npm run build   # redeploy dist/
```
