# Record book (part 2 of 5) — design

Date: 2026-09-30 · Status: approved in chat · Guided by the pitch deck (slide 2: 82.9 % of farmers keep no production
records; slide 3: "complete farm records that open market access"; slide 11: ≥ 70 % farmers with usable records).

## Rules
Everything is the farmer's own entry — no estimates mixed in, nothing filled in for missing entries. Money in TZS
(whole shillings), quantities in kg of dried seaweed. Labelled "from your records".

## Data (new tables)
- **SaleRecord** `sale_records`: farmId, plantingCycleId?, harvestRecordId?, saleDate, quantityKg (>0), pricePerKg (TZS, >0),
  totalTzs (= round(quantityKg × pricePerKg)), buyerName?, qualityGrade?, paymentStatus PAID | PENDING, notes?, channel, createdById?.
- **FarmCost** `farm_costs`: farmId, plantingCycleId?, costDate, category (SEEDLINGS, ROPE_LINES, STAKES, TYING_MATERIAL, LABOUR,
  TRANSPORT, DRYING_MATERIALS, OTHER), amountTzs (>0), notes?, channel, createdById?.
- **WorkLog** `work_logs`: farmId, plantingCycleId?, workDate, activity (PLANTING, TYING_SEEDLINGS, CLEANING_LINES, REPAIRING_LINES,
  HARVESTING, DRYING, OTHER), notes?, channel, createdById?.
- **Cycle assignment:** the farm's ACTIVE cycle, else its most recent cycle (by planting date), else none. The web may pass an
  explicit cycleId of the same farm.
- **Harvest "sold now":** a harvest recorded with a price also creates a SaleRecord (same kg, price, date, PAID). Income comes
  only from SaleRecords — nothing is counted twice.
- **Delete:** the farm's farmer (or an admin) may delete an entry; every create/delete is audit-logged.

## Summary (per cycle, or all records when a farm has no cycle)
harvestedKg (sum of harvests, KG_DRY only), soldKg, unsoldKg (= max(harvested − sold, 0)), incomeTzs (sales), owedTzs (PENDING
sales), costsTzs, costsByCategory, profitTzs (= income − costs), profitPerLine (profit / linesPlanted when > 0), averagePricePerKg
(income / soldKg when soldKg > 0), counts (sales, costs, work, harvests). Null where the input is missing (e.g. no lines → null).

## Channels
- **API:** `GET /farms/:id/records/summary?cycleId=`, `GET|POST /farms/:id/sales|costs|work`, `DELETE /farms/:id/sales|costs|work/:recordId`.
- **USSD** (deck menu kept): `4 Rekodi mavuno` → `1 Mavuno` (existing kg flow) · `2 Mauzo` (kg → price per kg → confirm total)
  · `3 Gharama` (category → amount → confirm) · `4 Kazi` (activity → saved for today). `1 Hali ya shamba` → `3 Faida ya msimu`
  (income, costs, profit, owed for the current cycle, one screen). No SMS for these entries.
- **Web (farmer):** "Record book" page (More menu): cycle picker, summary cards, lists (sales, costs, work, harvests) with add
  forms and delete. Dashboard "This season" card (income, costs, profit; link). Harvest form: "Sold now?" price creates the sale.
- **Web (admin):** farm detail "Records" tab, read-only.

## Testing
Unit: summary maths (missing inputs → null, KG_WET excluded, owed). Integration: CRUD + access (other farmer 403, admin ok),
cycle assignment, harvest-with-price creates one sale, summary endpoint, USSD flows (sale/cost/work/season profit, validation,
cancel). Frontend: record book page states, add/delete, dashboard card, Kiswahili.
