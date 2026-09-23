# Demo guide

Everything below runs against the real backend and PostgreSQL. Demo data is labelled as such throughout the UI.

## Setup (once)

```bash
cd backend && npm install && npx prisma migrate dev && npm run seed && npm run dev
cd frontend && npm install && npm run dev        # http://localhost:5173
```

The seed prints the **demo password** (or uses `DEMO_PASSWORD` from `backend/.env`) and saves it to
`backend/DEMO_CREDENTIALS.local.txt`. Re-run `npm run seed` any time to reset the demo.

Optional — show the ML pipeline: `npm run ai:dataset && npm run ai:train` then activate a model in **Admin → Models**
(the UI will label it *trained on synthetic data*).

## Demo accounts

| Role | Email | Notes |
|---|---|---|
| Farmer | farmer@demo.mwanimlinzi.local | Mwanaisha Haji, phone +255777000001, farms FARM001 & FARM002 (Paje) |
| Cooperative | cooperative@demo.mwanimlinzi.local | Paje Demo Seaweed Cooperative |
| Extension officer | extension@demo.mwanimlinzi.local | sees all farms |
| Buyer | buyer@demo.mwanimlinzi.local | anonymised supply only |
| Admin | admin@demo.mwanimlinzi.local | everything |

## Scenario farms

| Farm | Scenario | What you should see |
|---|---|---|
| FARM001 | Marine heatwave, 39-day-old Cottonii, whitening reported | Heat/Ice-Ice **HIGH (~78%)** → "Kagua mistari ndani ya saa 24…" |
| FARM002 | Near harvest (44/45 days), dry weather | Harvest window favourable, HARVEST_WINDOW alert |
| FARM003 | Storm, exposed site, sand-bag anchors | Storm/Line damage **HIGH** → "Inspect anchors and secure loose lines…" |
| FARM004 | Poor growth: low salinity & nutrients, slow growth | Poor growth **HIGH** → ask extension officer to review seedlings/site |
| FARM005 | Normal | All LOW → "Continue normal monitoring" |

Farms without a recent report generate **missing report** alerts.

## Walkthrough (≈10 minutes)

1. **Open the app** — http://localhost:5173. The landing page explains Monitor → Predict → Act → Learn. Click *Try Demo*.
2. **Login as farmer** (`farmer@…`). The app defaults to Kiswahili; switch EN/SW at the top.
3. **Dashboard** — "Habari, Mwanaisha", farm FARM001, crop age 39 days, current risks, **HATUA INAYOFUATA** with *Why?*
   reasons from the backend factors, environment snapshot labelled **Demo environmental data**, model status *Rule-based baseline*.
4. **Risk page** — all four risks with probability, confidence, 72 h horizon, factors (↑/↓) and risk history chart.
5. **Record observation** — wizard: condition *Poor* → whitening *Yes* → breakage *No* → unusual growth *No* → details: disease
   symptoms, 30% affected → (optional photo) → submit. The backend saves it and **re-runs the AI**: heat risk becomes
   **CRITICAL**, the recommendation changes to *escalate to an extension officer*, and a **HEAT_CRITICAL alert** is created
   (bell icon; SMS logged as simulated).
6. **Record action** — on the dashboard press *I did this* on the next action (stored as a farmer action linked to the recommendation).
7. **Record outcome / harvest** — History page → *Record outcome* (e.g. Minor loss 5%) → stored and auto-labelled as model
   feedback. Harvest page → record a harvest: the difference and loss % vs. the forecast are computed.
8. **Ask AI** — "Kwa nini hatari yangu iko juu?", "Nifanye nini?", "Nitumie dawa gani?" (safety answer), "Naona mwani mweupe
   asilimia 20" (creates an observation draft to confirm).
9. **Login as cooperative** — cards (farmers, active farms, high-risk farms, critical alerts, expected harvest, missing reports),
   charts, **risk map** (markers coloured by risk, popups with farmer/crop age/risk/expected harvest), **forecast** (7/14/30 days
   with ranges), alerts (acknowledge/resolve).
10. **Login as extension officer** — visit-priority list, risk map, **Reviews** (review/flag the farmer's observation and the
    recommendation, flag a prediction), **Action library** (validate an action), farm detail with notes.
11. **Login as buyer** — expected supply next 7/14/30 days in tonnes with uncertainty ranges, by cooperative/district; post demand.
12. **AI simulation** (`/demo/simulation`, any staff or the farmer) — choose FARM005, apply the *Storm* or *Marine heatwave*
    preset, **RUN AI** → before/after risk, new factors, new recommendation and simulation alerts (stored as simulations, never
    shown as real risk).
13. **USSD simulator** (`/demo/ussd`) — dial `*123#` → `1` (Angalia Hatari) → choose farm → risk + action; `2` walks the symptom report.
14. **SMS simulator** (`/demo/sms`) — send `RISK FARM001` → *"FARM001: Shamba lako lina hatari … Hatua: …"*; try
    `RIPOTI FARM001 WEUPE 20%`, `MAVUNO FARM002 120`, `MSAADA`.
15. **Admin** — dashboard (system health, jobs **Run now**), users & roles, action library, **models** (metrics, confusion matrix,
    field evaluation from outcomes, SYNTHETIC badge), settings (risk thresholds stored in PostgreSQL), **audit log** of everything above.
16. **pgAdmin** — open `mwanimlinzi` → `risk_predictions`, `risk_factors`, `action_recommendations`, `farmer_actions`,
    `action_outcomes`, `model_feedback` to see the stored loop (queries in [DATABASE.md](DATABASE.md)).
