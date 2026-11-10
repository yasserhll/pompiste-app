# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Standalone fuel (gasoil) distribution app: pump attendants scan a vehicle QR code, enter dispenser readings and photos; stock per tank is updated and Excel reports are generated in the format of the field file `mobile 1.xlsx`. UI text and code comments are in French.

## Layout
- `backend/` — Laravel 12 + Sanctum (token auth), MySQL `pompiste_app` (tests: `pompiste_app_test`).
- `frontend/` — React 18 (Vite + TypeScript + Tailwind), mobile-first.

## Commands (Windows / XAMPP)
XAMPP's PHP crashes with opcache enabled ("Opcode handlers are unusable due to ASLR"): always pass `-d opcache.enable_cli=0`.

```bash
cd backend
php -d opcache.enable_cli=0 artisan serve
php -d opcache.enable_cli=0 artisan migrate
php -d opcache.enable_cli=0 artisan db:seed                         # shifts + admin from ADMIN_EMAIL/ADMIN_PASSWORD
php -d opcache.enable_cli=0 vendor/bin/phpunit                      # all tests (MySQL test DB must exist)
php -d opcache.enable_cli=0 vendor/bin/phpunit --filter test_field_vouchers_d222_and_d265
php -d opcache.enable_cli=0 artisan fuel:import-materiel "<Affectation de materiels….xlsx>" --dry-run
php -d opcache.enable_cli=0 artisan fuel:verify-stock               # tank cache = movement journal = vouchers
```
Composer: `php -d opcache.enable_cli=0 /c/ProgramData/ComposerSetup/bin/composer.phar …`. MySQL CLI: `/c/xampp/mysql/bin/mysql.exe`.

```bash
cd frontend
npm run dev            # http://localhost:5173, /api proxied to API_PROXY_TARGET (default http://127.0.0.1:8000)
npm run dev:https      # HTTPS on the LAN (.env.https) — phones only open the camera over HTTPS
npm test               # vitest (src/**/*.test.ts); single file: npx vitest run src/lib/num.test.ts
npm run build          # tsc -b + vite build
```
Ports 5173/8000 may already be used by another local project; pass `--port` / `API_PROXY_TARGET` to avoid hitting the wrong backend.

## Architecture (frontend)
- React 18 + react-router 6 + TanStack Query + Tailwind (no component library; primitives in `src/components/ui.tsx`). All API calls go through `src/lib/api.ts` (`ApiError` exposes `status`, field `errors`, `warnings`, `requiresConfirmation` for 409, `offline`).
- `pages/RefuelPage.tsx` is the pompiste flow: scan (`html5-qrcode`, or manual search) → entry → photos → summary → validate. The draft (incl. `client_uuid` and uploaded attachment ids) is kept in localStorage so a network cut or reload loses nothing and a retry cannot duplicate the voucher. `/scan/:token` is the URL printed in the QR codes.
- `src/lib/num.ts` mirrors `Num::parse` for instant feedback; the raw string is still what is sent.
- Dates: display the wall-clock digits from the API string (`format.ts`), never convert with `Intl` time zones — browser tz data disagrees on Africa/Casablanca (Chrome 156 gives UTC+0, PHP/MySQL/Windows UTC+1).
- Role-based route guards in `App.tsx` are cosmetic; the backend enforces access.

## Architecture (backend)
- **Stock is a ledger.** `fuel_stock_movements` is append-only; `fuel_tanks.current_stock_l` is a cache written only by `App\Services\Fuel\StockService::apply()`, inside a transaction with the tank row locked (`lockTank`). Never update stock or `last_voucher_seq` any other way.
- **Vouchers are immutable.** `FuelRefuel` rows are never edited/deleted; cancellation adds a compensating movement, correction = cancel + new refuel with `corrects_refuel_id` (`RefuelService::cancel/correct`, via `fuel_correction_requests` approved by an admin).
- **Snapshot.** Each refuel stores vehicle/driver/shift/site denormalized columns + `snapshot` JSON at the time of the operation; reports read these, not live relations.
- **Controls.** `RefuelService::evaluate()` returns warnings `bloquant` (422) / `alerte` / `info`. `create()` re-runs every check under lock; alert codes not listed in `confirmed_warnings` → 409 (`ConfirmationRequired`). Confirmed alerts become `fuel_anomalies`.
- **Idempotency.** Refuels, deliveries and inventories require a client-generated `client_uuid`; a replay returns the existing record (`replayed: true`).
- **Numbers.** Litres/indexes/counters are DECIMAL and handled as strings with bcmath (`App\Services\Fuel\Num`). `Num::parse` normalizes handwritten input ("66 4508" → 664508) and rejects ambiguous forms ("664,508").
- **Driver resolution.** `AssignmentResolver`: shift from `work_shifts` (site-specific overrides global; end ≤ start means it crosses midnight and belongs to the previous work day), then `driver_assignments` for the matching `team_slot` (replacement > most recent start; same-level conflict = ambiguous → selection required).
- **Authorization** is server-side only, in `App\Services\Fuel\FuelAccess` (roles `admin`, `responsable_site` scoped by `site_user`, `pompiste` scoped by `fuel_tank_user`). Every controller calls `requireModule`/`tankFor`/`scopeRefuels`.
- **Excel.** `TankReportExporter` reproduces `mobile 1.xlsx` (rows 5–6 headers, row 7 opening balance, one row per stock movement, `M = M(prev) + B − I`) plus `Synthèse` and `Anomalies` sheets. Monthly period runs from `report_month_start_day` (default 27) of the previous month.
- **QR codes** contain only `FUEL_QR_BASE_URL/<random 40-char token>`; `vehicle_qr_codes` can be revoked/regenerated.
- Time zone is `Africa/Casablanca` (`APP_TIMEZONE`); models use `Concerns\LocalDates` so JSON dates carry the local offset.

## Data notes
- Vehicles come from `fuel:import-materiel` (keyed by immatriculation; code parc is not unique). The "DEPLACEMENT" sheet is reported, not applied.
- SINOTRUK trucks use hour counters (field vouchers D222 "3808 H", D265 "834 H").
- Tank capacities, initial stocks and driver assignments must come from real data — do not invent them.
