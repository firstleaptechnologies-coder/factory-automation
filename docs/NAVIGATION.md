# Navigation

> Generated from `packages/shared/src/navigation.ts`. That file is the one
> source of truth: the web sidebar, the app menu and this document all read
> it, and a test on each client fails when a registered screen is missing
> from it.

## How to keep this true

1. Add the screen to `NAV_GROUPS` (or `children`, when it is reached from
   another screen rather than from the menu).
2. Run `npm --workspace @decor/shared run docs:nav` to rewrite this file.
3. The coverage specs — `apps/web/src/app/coverage.spec.ts` and
   `apps/mobile/src/navigation/coverage.spec.ts` — fail until both are done.

## The map

```mermaid
flowchart LR
  Home([Home])
  subgraph cat_orders["Order management"]
    direction TB
    punch["Punch order"]
    orders["Orders"]
    order_board["Board"]
    orders --> order_board
    order_detail["One order"]
    orders --> order_detail
    order_payments["Payments"]
    order_detail --> order_payments
    order_payouts["Payouts on this order"]
    order_detail --> order_payouts
    order_photos["Photos"]
    order_detail --> order_photos
    leads["Leads"]
    lead_board["Board"]
    leads --> lead_board
    lead_archive["Archived"]
    leads --> lead_archive
    lead_new["New lead"]
    leads --> lead_new
    lead_detail["One enquiry"]
    leads --> lead_detail
    lead_convert["Convert to an order"]
    lead_detail --> lead_convert
    quotes["Quotes"]
    quote_new["New quote"]
    quotes --> quote_new
    quote_detail["One quote"]
    quotes --> quote_detail
    subgraph cat_order_settings["Order settings"]
      direction TB
    materials["Materials"]
    sizes["Sizes"]
    flow["Status flow"]
    flow_canvas["Flow builder"]
    flow --> flow_canvas
    main_card["Main card"]
    flow --> main_card
    lead_fields["Lead fields"]
    end
  end
  Home --> cat_orders
  subgraph cat_finances["Finances"]
    direction TB
    transactions["Transactions"]
    payouts["Payout ledger"]
  end
  Home --> cat_finances
  subgraph cat_vendors["Vendor management"]
    direction TB
    clients["Clients"]
    client_detail["One client"]
    clients --> client_detail
    client_firm["Billing details"]
    client_detail --> client_firm
  end
  Home --> cat_vendors
  subgraph cat_workspace["Workspace"]
    direction TB
    firm["Firm details"]
    settings["Settings"]
  end
  Home --> cat_workspace
```

## Home

| Screen | Web | App route | Permission |
| --- | --- | --- | --- |
| Home | `/` | `Home` | — |
|   ↳ Notifications | — | `Notifications` | — |
|   ↳ Search | — | `Search` | — |

## Categories

### Order management

*Taking work in and moving it along*

| Screen | Web | App route | Permission |
| --- | --- | --- | --- |
| Punch order | `/punch` | `PunchTab` | `order.punch` |
| Orders | `/orders` | `Orders` | `order.view` |
|   ↳ Board | `/board` | `Board` | — |
|   ↳ One order | `/orders/[id]` | `OrderDetail` | — |
|     ↳ Payments | `/orders/[id]/payments` | `Payments` | — |
|     ↳ Payouts on this order | `/orders/[id]/disbursements` | `Disbursements` | — |
|     ↳ Photos | — | `OrderPhotos` | — |
| Leads | `/leads` | `Leads` | `lead.view` |
|   ↳ Board | `/leads/board` | `LeadBoard` | — |
|   ↳ Archived | `/leads/archived` | `ArchivedLeads` | — |
|   ↳ New lead | — | `LeadCreate` | — |
|   ↳ One enquiry | `/leads/[id]` | `LeadDetail` | — |
|     ↳ Convert to an order | — | `LeadConvert` | — |
| Quotes | `/quotes` | `Estimates` | `estimate.view` |
|   ↳ New quote | `/quotes/new` | `EstimateEdit` | — |
|   ↳ One quote | `/quotes/[id]` | `EstimateDetail` | — |

#### Order settings

*What punching offers, and the journey work follows*

| Screen | Web | App route | Permission |
| --- | --- | --- | --- |
| Materials | `/admin/materials` | `AdminMaterials` | `config.view` |
| Sizes | `/admin/sizes` | `AdminSizes` | `config.view` |
| Status flow | `/admin/flow` | `AdminFlow` | `config.view` |
|   ↳ Flow builder | — | `FlowCanvas` | — |
|   ↳ Main card | `/admin/main-card` | `MainCard` | — |
| Lead fields | `/admin/lead-fields` | `AdminLeadFields` | `config.view` |

### Finances

*Money in, money out, and where it is sitting*

| Screen | Web | App route | Permission |
| --- | --- | --- | --- |
| Transactions | `/transactions` | `Transactions` | `payment.cash_position` |
| Payout ledger | `/disbursements` | `DisbursementLedger` | `disbursement.view` |

### Vendor management

*Everyone the shop deals with*

| Screen | Web | App route | Permission |
| --- | --- | --- | --- |
| Clients | `/clients` | `Clients` | `client.view` |
|   ↳ One client | `/clients/[id]` | `ClientDetail` | — |
|     ↳ Billing details | `/clients/[id]/firm` | `ClientFirm` | — |

### Workspace

*The shop itself, and this device*

| Screen | Web | App route | Permission |
| --- | --- | --- | --- |
| Firm details | `/admin/firm` | `FirmProfile` | `config.view` |
| Settings | — | `Settings` | — |

## Outside the menu

*Signing in happens before there is a menu; the platform screens belong to
whoever runs the product rather than to a shop.*

| Screen | Web | App route | Permission |
| --- | --- | --- | --- |
| Sign in | `/login` | `Login` | — |
| Workspaces | `/platform/tenants` | `Tenants` | `platform.tenant.view` |
| Releases | `/platform/releases` | — | `platform.release.view` |
