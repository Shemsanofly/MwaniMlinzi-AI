# Walkthrough (≈10 minutes)

Everything below runs against the real backend and PostgreSQL, with live weather and ocean data. The system starts
empty: there are no prepared farmers, farms or histories. You create them in the steps below.

## Setup (once)

```bash
cd backend && npm install && npx prisma migrate dev && npm run seed && npm run dev
cd frontend && npm install && npm run dev        # http://localhost:5173
```

`npm run seed` loads reference data only and creates the first admin. The admin email is `ADMIN_EMAIL`
(default `admin@mwanimlinzi.local`). The password is `ADMIN_PASSWORD` from `backend/.env`, or a generated one that
the seed prints once and saves to `backend/ADMIN_CREDENTIALS.local.txt`.

The backend must be able to reach `api.open-meteo.com` and `marine-api.open-meteo.com` (free, no key) for live readings.

> **What to expect.** Risk is computed from today's real conditions at the farm. On a calm day the live risk will
> honestly be **LOW**. The farmer's report in step 5 is what raises it. Nothing is pre-set to look dramatic.

## Steps

1. **Register a farmer** — open http://localhost:5173 → *Create account* (`/register`). Enter a name, a Tanzanian
   phone number (e.g. `0777 123 456`, any format is accepted), a password, language, and tick the consent box.
   The cooperative field only appears if an admin has created cooperatives. You are logged in as the farmer.
2. **Add the farm** — *Add farm*: pick the location on the map (or use GPS). For a real lagoon site use Paje, just
   offshore at about **-6.268, 39.545**. Choose the species (*Kappaphycus* / *Eucheuma*), the number of lines and the
   planting date (e.g. 30 days ago), then save. The risk engine runs straight away.
3. **Dashboard** — current risk in words, icon and colour, plain-language reasons, and the next action with when to
   do it. Switch **English | Kiswahili** at the top (saved to the profile). Press **See details** to see the
   probabilities, the model status (*Rule-based baseline*) and the environmental reading labelled **Live data** with the
   provider name (`open-meteo`, `open-meteo-marine`). Salinity and chlorophyll have no value: Open-Meteo Marine does not
   provide them, and they are never filled in. If no live reading could be fetched, the page says so and the risk uses
   farm details and reports only, with lower confidence.
   Below it, **Today at sea** shows the next daylight low tide with the best hours to work, whether today is good for
   drying (with the approved advice — racks or tarpaulin, not the ground) and a 3-day strip, all from the live Open-Meteo
   forecast for the farm's point. On USSD the same answer is under `1 Hali ya shamba → 2 Maji kupwa na kukausha`.
4. **Risk page** — the four risks (Heat/Ice-Ice, Storm/Line damage, Poor growth, Harvest window) with probability,
   confidence, horizon and the factors that raise or lower each one.
5. **Report a problem** — record an observation: condition *Poor* → whitening *Yes* → breakage *No* → unusual growth
   *No* → details: disease symptoms, **30 %** of lines affected → (optional photo) → submit. The backend saves the
   report and re-runs the risk engine. Heat/Ice-Ice rises, and the new factors (*whitening reported*, *% affected*) are
   listed as the reason. If it reaches HIGH or CRITICAL an alert is created (bell icon) and, if Africa's Talking is
   configured and the farmer allows SMS, an SMS is sent; otherwise the attempt is logged as `NOT_CONFIGURED`.
6. **Act** — on the dashboard press **I did this** on the next action. It is stored as a farmer action linked to the
   recommendation.
6b. **Record book** — *More → Record book*: add a sale (e.g. 120 kg at TSh 1,000/kg, not yet paid), a cost (seedlings
   TSh 30,000) and today's work. The summary shows income, costs, profit and what is still owed — only from what was
   entered. The same entries can be made on USSD under *4 Rekodi mavuno*, and *1 → 3 Faida ya msimu* reads the profit.
7. **Record what happened** — *Record what happened* (e.g. minor loss, 5 %). It is stored and labelled as feedback on
   the prediction. On the Harvest page, record a harvest: the difference and loss % against the forecast are computed.
8. **Ask the AI assistant** — "Why is my risk high?", "What should I do?", "What medicine should I use?" (safety
   answer: no treatment advice), "I see whitening on 20% of my lines" (creates a report draft to confirm). Answers come
   from the farm's stored records and the approved Action Library.
9. **Log in as admin → Field operations** — *Field overview* (visit priority, portfolio), **Risk map** (the new farm
   coloured by risk), **Reviews** (review or flag the farmer's report and the recommendation, flag a prediction),
   **Alerts** (acknowledge/resolve), **Harvest forecast** (7/14/30 days with ranges), the farm detail with notes, and
   **Action library** (validate an entry; the 17 starter entries are marked as awaiting validation by local experts).
10. **What-if planner** (admin, `/tools/scenarios`) — choose the farm, change conditions (e.g. waves, wind, SST
    anomaly) and run. You see before/after risk, the new factors and the recommendation. Results are stored as
    `SIMULATION`, are never shown as real risk and are never sent to farmers.
11. **Admin console** — dashboard (system health, jobs with **Run now**), users, **Models** (the rule-based engine is in
    use; ML training needs recorded field outcomes, see [AI.md](AI.md)), settings (risk thresholds, **Africa's Talking**
    status and a real **Test SMS**), and the **audit log** of everything above.
12. **SMS and USSD (optional)** — only if the Africa's Talking sandbox is configured ([AFRICASTALKING.md](AFRICASTALKING.md)).
    In AT's phone simulator, use the phone number of the farmer you registered in step 1. Dial your USSD code → `1`
    (farm status: risk + action), `2` (report symptoms), `3` (record harvest), `5` (language), or send `HATARI` by SMS.
    A number that is not registered yet can register itself through the USSD menu.
13. **pgAdmin** — open `mwanimlinzi` → `environmental_observations` (the live reading with `source` and provider),
    `risk_predictions`, `action_recommendations`, `farmer_actions`, `farm_records` (OUTCOME), `event_logs` (FEEDBACK)
    to see the stored loop (queries in [DATABASE.md](DATABASE.md)).
