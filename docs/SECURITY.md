# Security & privacy

| Control | Implementation |
|---|---|
| Password hashing | bcryptjs, cost 12. Login uses a constant-time dummy hash for unknown emails and the same error message for wrong email/password (no account enumeration). |
| Authentication | JWT (HS256) signed with `JWT_SECRET` (the server refuses to start without it), expiry `JWT_EXPIRES_IN`. The user is reloaded from PostgreSQL on every request, so disabled accounts and role changes take effect immediately. |
| Authorization | `authenticate` + `authorize(...roles)` middleware on every protected route; object-level checks via `assertFarmAccess` / `farmScope` (farmers → own farms, cooperative admins → own cooperative, extension/admin → all, buyers → no farm-level data). Writes to farm records require ownership (or extension/admin). Admins cannot remove their own admin role or disable themselves. |
| Registration | Public sign-up can only create FARMER or BUYER accounts; staff roles are assigned by admins. Explicit consent is required and stored (`consent_given`, `consent_at`). |
| Input validation | Zod schemas for every body/query (types, ranges, enums, string lengths, phone format, password policy). Unknown fields are stripped. Invalid UUIDs return 404. |
| SQL injection | All queries go through Prisma's parameterised API; the two raw queries use tagged templates (parameterised). |
| HTTP hardening | Helmet security headers, `x-powered-by` disabled, CORS allow-list (`CORS_ORIGIN`), JSON body limit 200 kB, URL-encoded limit 50 kB. |
| Rate limiting | Global 1500 req/15 min/IP; auth endpoints 30/15 min; AI chat 30/min. |
| File uploads | Memory upload limited to `MAX_UPLOAD_MB` and 1 file; MIME allow-list (JPEG/PNG/WebP) **and** magic-byte verification; random UUID filenames (original names never used on disk); `wx` write flag; metadata in `uploaded_files`; served only through an authorised route with `X-Content-Type-Options: nosniff`. Storage is behind a small abstraction (`storage` column) so cloud storage can replace local disk. |
| Error handling | Central handler returns `{ success:false, error:{code,message} }` — no stack traces, SQL, or internal paths. Database outages return 503 `DATABASE_UNAVAILABLE`; the server keeps running. |
| Secrets | Only via environment variables (`backend/.env`, git-ignored). No secrets in the database, logs or API responses; `/api/health` reports provider *names* only. Password hashes are never serialised. |
| Audit logging | `audit_logs` records logins, logouts, registration, farm/record creation, reviews, validations, setting changes (before/after), model activation, job runs, uploads, simulations and AI chats (intent only, not message text). Viewable in Admin → Audit. |
| AI safety | Recommendations only come from the Action Library; the LLM can only rephrase and never answers treatment questions; the safety policy redirects to extension officers; insufficient data yields no recommendation. |
| Data honesty | Every environmental record and prediction carries `source` (LIVE/CACHED/DEMO/SIMULATION); demo/synthetic data flags are stored and shown in the UI. |
| SMS/USSD | Farmers are identified by registered phone numbers; simulators require login and farmers may only use their own number. The live USSD callback is disabled unless configured and can require a shared `?key=`. |

## Privacy

- Farmers' personal data (name, phone) is visible to their cooperative's managers and extension officers only.
- Buyers see anonymised supply (cooperative, district, dates, quantities, grades) — never farmer identities or farm locations.
- Farmers can see and update their own profile and language; admins can deactivate accounts.
- Photos are private to the farm's authorised viewers.

## Production checklist

- Long random `JWT_SECRET` (≥ 48 bytes), `NODE_ENV=production`, HTTPS only (TLS at Nginx/Caddy or the host).
- Dedicated PostgreSQL user with least privilege; `prisma migrate deploy`; regular `pg_dump` backups.
- `CORS_ORIGIN` set to the real frontend origin(s).
- Leave `DEMO_PASSWORD` empty and never run `npm run seed` against production (it wipes data; it refuses unless `--force`).
- Keep `ENABLE_JOBS=true` on exactly one API instance.
- Put `uploads/` on persistent storage and include it in backups.
- Review and validate every Action Library entry with local experts; consider `actions.requireValidated = true`.
