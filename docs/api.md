# API

Base URL `http://localhost:3001/api`. All routes require a bearer token except
`POST /auth/login`. Roles are enforced per route; `ADMIN` passes everything.

## Auth
- `POST /auth/login` — `{identifier, password}`; identifier is employee code, phone or email
- `GET /auth/me`

## Masters
- `GET /materials/categories`, `POST /materials/categories`
- `GET /materials`, `GET /materials/:id`, `POST /materials`, `PATCH /materials/:id`, `DELETE /materials/:id`
- `GET /customers`, `GET /customers/:id`, `POST /customers`, `PATCH /customers/:id`
- `GET /users` … (MANAGER only)

## Inventory
- `GET /inventory/locations`, `POST /inventory/locations`
- `GET /inventory/stock` — filter by material, location, kind, status, `offcutsOnly`
- `GET /inventory/stock/summary` — on-hand by material and kind, with reorder flags
- `GET /inventory/stock/:id`, `GET /inventory/stock/:id/movements`
- `POST /inventory/receive` — creates one labelled piece per unit received
- `POST /inventory/issue` — `{jobId, stockUnitIds}`
- `POST /inventory/close-sheet` — **the waste-capture call**: `{stockUnitId, jobId, offcuts:[{lengthMm,widthMm}]}`. Offcuts above the reuse threshold become new `StockUnit`s; the rest is booked as trim waste
- `POST /inventory/transfer`, `POST /inventory/adjust`

## Machines
- `GET /machines`, `GET /machines/:id`, `POST /machines`
- `GET /machines/board` — live board: status, current job, queue
- `GET /machines/downtime-reasons`
- `PATCH /machines/:id/status` — closes the open run-log slice and opens the next

## Orders
- `GET /orders`, `GET /orders/:id`, `POST /orders`
- `PATCH /orders/:id/status` — transitions are validated
- `GET /orders/pending-planning` — confirmed lines with no job yet

## Production
- `GET /jobs`, `GET /jobs/:id`, `POST /jobs`
- `GET /jobs/my-queue` — the operator's screen
- `PATCH /jobs/:id/assign`, `POST /jobs/resequence`
- `POST /jobs/:id/start`, `POST /jobs/:id/pause`, `POST /jobs/:id/complete`
- `PATCH /jobs/:id/progress`
- `POST /jobs/:id/quality-check` — a rejection also writes a waste record

## Nesting
- `POST /nesting/preview` — runs the nest, persists nothing. Returns placements, utilisation, recoverable offcuts (with positions) and the cost of what is lost
- `POST /nesting/plans`, `GET /nesting/plans`, `GET /nesting/plans/:id`, `PATCH /nesting/plans/:id/status`

## Waste and reports
- `GET /waste`, `POST /waste`, `PATCH /waste/:id/disposition`
- `GET /waste/analytics` — totals, recovery rate, by type / material / disposition
- `GET /waste/offcut-inventory` — value of offcuts held
- `GET /reports/dashboard`
- `GET /reports/machine-utilization?from&to`
- `GET /reports/material-yield?from&to`
- `GET /reports/job-performance?from&to`
