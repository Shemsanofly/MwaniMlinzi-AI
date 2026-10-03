# Security & privacy

| Control | Implementation |
|---|---|
| Password hashing | bcryptjs, cost 12. Login (by phone or email) uses a constant-time dummy hash for unknown accounts and the same error message for a wrong account or password (no account enumeration). Password change requires the current password. |
| Authentication | JWT (HS256) signed with `JWT_SECRET` (the server refuses to start without it), expiry `JWT_EXPIRES_IN`. The user is reloaded from PostgreSQL on every request, so disabled accounts and role changes take effect immediately. |
| Authorization | `authenticate` + `authorize(...roles)` middleware on every protected route; object-level checks via `assertFarmAccess` / `farmScope` (farmers → own farms, admins → all farms). Writes to farm records require ownership or ADMIN. Admins cannot remove their own admin role or disable themselves. |
| Registration | Public sign-up (web or USSD) can only create FARMER accounts; ADMIN can only be assigned by admins. The first admin is created by `npm run seed` from `ADMIN_EMAIL`/`ADMIN_PASSWORD` (≥ 12 characters) or with a generated password saved once to the git-ignored `backend/ADMIN_CREDENTIALS.local.txt`. Explicit consent is required and stored (`consent_given`, `consent_at`). |
| Input validation | Zod schemas for every body/query (types, ranges, enums, string lengths, phone format, password policy). Unknown fields are stripped. Invalid UUIDs return 404. |
| SQL injection | All queries go through Prisma's parameterised API; the two raw queries use tagged templates (parameterised). |
| HTTP hardening | Helmet security headers, `x-powered-by` disabled, CORS allow-list (`CORS_ORIGIN`), JSON body limit 200 kB, URL-encoded limit 50 kB. |
| Rate limiting | Global 1500 req/15 min/IP; auth endpoints (incl. password change) 30/15 min; AI chat 30/min; Africa's Talking callbacks 300/min. |
| File uploads | Memory upload limited to `MAX_UPLOAD_MB` and 1 file; MIME allow-list (JPEG/PNG/WebP) **and** magic-byte verification; random UUID filenames (original names never used on disk); `wx` write flag; metadata in `event_logs` (UPLOAD); served only through an authorised route with `X-Content-Type-Options: nosniff`. Storage is behind a small abstraction (`storage` column) so cloud storage can replace local disk. |
| Error handling | Central handler returns `{ success:false, error:{code,message} }` — no stack traces, SQL, or internal paths. Database outages return 503 `DATABASE_UNAVAILABLE`; the server keeps running. |
| Secrets | Only via environment variables (`backend/.env`, git-ignored). No secrets in the database, logs or API responses; `/api/health` reports provider *names* only. Password hashes are never serialised. |
| Audit logging | `event_logs` (AUDIT) records logins, logouts, registration, farm/record creation, reviews, validations, setting changes (before/after), model activation, job runs, uploads, simulations and AI chats (intent only, not message text). Viewable in Admin → Audit. |
| AI safety | Recommendations only come from the Action Library; the LLM can only rephrase and never answers treatment questions; the safety policy redirects to field/admin review; insufficient data yields no recommendation. |
| Data honesty | No demo data exists in the product. Every environmental record carries `source` (LIVE/CACHED) and its provider; every prediction carries `data_source` (LIVE/CACHED/UNAVAILABLE/SIMULATION). Missing values stay `null` and are never invented. What-if results are never shown as real risk or sent to farmers. |
| SMS/USSD (Africa's Talking) | Farmers are identified by their registered phone number, normalised to `+255XXXXXXXXX` and unique. AT does not sign callbacks, so every callback URL must carry the shared secret `AT_CALLBACK_SECRET` (`?secret=` or `X-Callback-Secret`). It is compared via SHA-256 digests in constant time and redacted from access logs; without it, callbacks are refused (503). Callbacks are validated, rate-limited (300/min) and logged in `event_logs` (INTEGRATION) with masked phone numbers; duplicate deliveries are detected. The AT API key lives only in the backend environment and is sent only to AT. It never reaches the browser, logs or API responses; the admin panel shows only whether it is set. The old web SMS/USSD simulators were removed. |

## Privacy

- Farmers' personal data (name, phone) is visible to admins for field operations.
- Farmers can see and update their own profile and language; admins can deactivate accounts.
- Photos are private to the farm's authorised viewers.

## Production checklist

- Long random `JWT_SECRET` (≥ 48 bytes), `NODE_ENV=production`, HTTPS only (TLS at Nginx/Caddy or the host).
- Dedicated PostgreSQL user with least privilege; `prisma migrate deploy`; regular `pg_dump` backups.
- `CORS_ORIGIN` set to the real frontend origin(s).
- Set a strong `ADMIN_PASSWORD` (or delete `backend/ADMIN_CREDENTIALS.local.txt` after noting the generated one) and change the first admin's password after the first login.
- Keep `ENABLE_JOBS=true` on exactly one API instance.
- Put `uploads/` on persistent storage and include it in backups.
- Review and validate every Action Library entry with local experts; consider `actions.requireValidated = true`.
