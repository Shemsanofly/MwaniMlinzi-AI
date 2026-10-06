# Record Book Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Farmers keep sales, costs and daily work (web + USSD) and see profit per planting cycle.

**Architecture:** Three new tables (SaleRecord, FarmCost, WorkLog) assigned to a planting cycle; a pure `recordSummary()` computes
per-cycle totals; `RecordBookService` owns cycle resolution, CRUD and summaries; REST routes under `/farms/:id`; USSD submenus under
`4 Rekodi mavuno` and `1 → 3 Faida ya msimu`; a farmer Record book page, a dashboard card and a read-only admin tab.

**Tech Stack:** Node 22 ESM, Express 5, Prisma 6 / PostgreSQL, Zod, Jest + supertest; React 19, TanStack Query, i18next, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-30-record-book-design.md`

## Global Constraints

- Only the farmer's own entries; nothing estimated or filled in; missing input → null.
- TZS whole shillings (`totalTzs = Math.round(quantityKg × pricePerKg)`); kg of dried seaweed; KG_WET harvests excluded from harvestedKg.
- Cycle: explicit cycleId (must belong to the farm) → ACTIVE cycle → most recent cycle → null.
- Income only from SaleRecords; a harvest with a price creates exactly one PAID sale.
- USSD keeps the deck menu; screens ≤ 182 chars; amounts validated (kg as parseKg; price 1–1,000,000 TZS/kg; cost 1–100,000,000 TZS); no SMS for record entries.
- English + Kiswahili for every new string (i18n test requires identical key sets).

## Review Focus

- Deleting an entry of another farmer's farm → 403; admin may delete. (Task 2)
- A sale entered after the harvest closed the cycle lands on that (most recent) cycle, not "no cycle". (Task 2)
- Summary with sales but no harvest record → unsoldKg 0 (never negative), averagePrice computed; no lines → profitPerLine null. (Task 1)
- USSD price/amount input "1,000" or "1000.50" or "0" → re-prompt, never saves garbage. (Task 3)
- Web add forms reject 0/negative amounts client-side and show server errors. (Task 4)

---

### Task 1: Schema + pure summary
**Files:** `backend/prisma/schema.prisma`, migration `20260930160000_record_book`, `backend/src/services/recordBook.js` (pure `recordSummary({ cycle, harvests, sales, costs, work })`), test `backend/tests/unit/recordBook.test.js`.

### Task 2: Service + API
**Files:** `backend/src/services/recordBookService.js` (`resolveCycleId(farmId, cycleId?)`, `createSale/createCost/createWork(farmId, user, data, { channel })`, `list(kind, farmId, { cycleId })`, `remove(kind, farmId, recordId)`, `summary(farmId, { cycleId })`, `currentSeason(farmId)`), `recordService.createHarvest` (price → sale), validators (`saleSchema`, `costSchema`, `workSchema`), `farmController` + `farm.routes`, openapi; test `backend/tests/integration/recordBook.test.js`.

### Task 3: USSD
**Files:** `backend/src/services/ussdService.js` (RECORDS_MENU, SALE_KG/SALE_PRICE/SALE_CONFIRM, COST_CATEGORY/COST_AMOUNT/COST_CONFIRM, WORK_ACTIVITY, status option 3 season screen), tests in `backend/tests/integration/channels.test.js` (existing harvest paths become `4 → 1 …`).

### Task 4: Web
**Files:** `frontend/src/api/endpoints.js` (`recordsApi`), `frontend/src/pages/farmer/RecordBook.jsx` + components, route `/farmer/records`, FarmerLayout More item, dashboard `SeasonCard`, Harvest form "Sold now", admin FarmDetail "Records" tab (read-only), i18n en/sw; tests `frontend/src/pages/farmer/__tests__/RecordBook.test.jsx`, dashboard test update.

### Task 5: Docs
README feature line, `docs/API.md`, `docs/AFRICASTALKING.md` (menu 4 + 1→3), `docs/WALKTHROUGH.md` step.
