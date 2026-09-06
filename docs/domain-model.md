# Domain model

Entities grouped by the part of the business they serve. Full definitions live
in `apps/api/prisma/schema.prisma`.

## Material and stock

| Model | Purpose |
| --- | --- |
| `MaterialCategory` | Wood, Stone, Acrylic, Metal, WPC — extensible |
| `Material` | A specific board or slab: size, thickness, density, kerf, grain, cost, GST |
| `StockLocation` | Rack, floor, WIP, finished goods, offcut store, scrap yard |
| `StockUnit` | **One physical piece.** Sheet, slab, or offcut. Carries a barcode |
| `StockMovement` | Append-only ledger: receipt, issue, return, transfer, adjustment, scrap, offcut recovery |

`StockUnit.parentId` is the important relationship: an offcut points back at the
sheet it came from, so you can answer "how much of that ₹34,000 marble slab
actually became product?"

## Sales and design

`Customer` → `Order` → `OrderItem`. A line item may reference a `Design`, which
is versioned through `DesignVersion` so the shop floor is never looking at a
superseded ArtCAM file.

## Planning

`NestPlan` holds the sheet size, how many sheets, and the area accounting:
`partsAreaSqm`, `offcutAreaSqm`, `wasteAreaSqm`, `utilizationPct`. `NestPart`
holds each placement — sheet index, x/y in mm from the bottom-left, rotation.

## Production

`Job` is the unit of work on a machine: queue position, planned vs. actual
times, quantities. `JobOperation` is the routing (cut → sanding → QC → packing).
`JobMaterialIssue` links a job to the exact pieces it consumed.
`MachineRunLog` slices machine time into RUNNING / IDLE / SETUP / DOWN — every
utilisation and downtime number is derived from it, so machine status and the
log are always written in the same transaction.

## Quality and waste

`QualityCheck` records pass/fail/rework against a `RejectionReason`. A rejection
also writes a `WasteRecord`, because material that was bought and cut but cannot
ship is waste, not just a QC note.

`WasteRecord` types: `OFFCUT`, `KERF`, `TRIM`, `SETUP_LOSS`, `REJECTION`,
`DAMAGE`, `TEST_CUT`. Dispositions: `REUSE`, `RECYCLE`, `SELL`, `DISPOSE`,
`PENDING`. A reusable offcut carries `recoveredStockUnitId` pointing at the new
`StockUnit` it became — that link is what the recovery-rate metric counts.

## Dispatch and billing

`Dispatch`/`DispatchItem` and `Invoice`/`Payment` are modelled but not yet
exposed through the API or UI.
