# Real by default — design

Date: 2026-09-30 · Status: approved in chat ("Proceed … keep everything real, not demo"; start state: empty + real)

## Goal

Judges (and farmers) should only ever see real things: real weather and ocean readings, farms and reports that a
person actually entered, and risk results computed from those inputs. The product should be simple to use and
leave nothing that looks invented, staged or contradictory.

## Decisions

1. **Live environmental data only.** `DEMO_MODE` and the demo weather/ocean profiles are removed. Providers default to
   Open-Meteo (weather) and Open-Meteo Marine (ocean) — free, no key. Fallback order: LIVE → CACHED (last real
   reading) → *unavailable*. Missing values stay `null`; nothing is invented. The UI says "No reading yet" instead.
2. **Empty start.** `npm run seed` is non-destructive and only loads reference data (species, zones, thresholds,
   action library, settings) and creates the admin account (password from `ADMIN_PASSWORD` or generated once and
   printed). No invented farmers, farms, observations, predictions or histories.
3. **No demo concept in the data model.** `is_demo` columns, `farms.demo_scenario` and the `DEMO` data source are
   dropped by a migration.
4. **Risk from real inputs.** The rule engine runs on live/cached readings plus farmer reports. Factors whose input is
   missing are skipped and lower the confidence; they are never filled with defaults.
5. **ML only from real outcomes.** The synthetic dataset generator is removed. Training uses recorded field outcomes
   only and refuses to train below a minimum sample size. The rule-based engine is the default.
6. **What-if planner stays**, clearly named, admin/farmer tool; results are stored as simulations and never shown as
   real risk.
7. **Simplicity pass.** Clear first-run path (Register → add farm on map → see risk → report → act), helpful empty
   states, no leftover references to removed roles, no demo wording in UI or docs.

## Testing

Tests keep deterministic data via test-only fixtures (`tests/fixtures`) and a fake environmental provider injected in
tests — never shipped in the product.
