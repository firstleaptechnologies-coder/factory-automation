# Navigation

> Generated from `packages/shared/src/navigation.ts`. That file is the one
> source of truth: the web sidebar, the app menu and this document all read
> it, and a test on each client fails when a registered screen is missing
> from it.

## How to keep this true

1. Add the screen to `NAV_GROUPS` (or `children`, when it is reached from
   another screen rather than from the menu).
2. Run `npm --workspace @fas/shared run docs:nav` to rewrite this file.
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
    order_invoice["Invoice and challans"]
    order_detail --> order_invoice
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
    gst["GST rates"]
    lead_fields["Lead fields"]
    end
  end
  Home --> cat_orders
  subgraph cat_finances["Finances"]
    direction TB
    transactions["Transactions"]
    payouts["Payout ledger"]
    invoices["Invoices"]
    invoice_detail["One invoice"]
    invoices --> invoice_detail
    reports["Reports"]
    report_new["Ask for a report"]
    reports --> report_new
    expenses["Expenses"]
    expense_form["Record an expense"]
    expenses --> expense_form
    expense_detail["One expense"]
    expenses --> expense_detail
    expense_analytics["Where the money went"]
    expenses --> expense_analytics
    expense_options["Expense dropdowns"]
    expenses --> expense_options
  end
  Home --> cat_finances
  subgraph cat_people["People"]
    direction TB
    employees["Employees"]
    employee_form["Add an employee"]
    employees --> employee_form
    employee_detail["One employee"]
    employees --> employee_detail
    employee_letters["Their letters"]
    employee_detail --> employee_letters
    letter_templates["Letter templates"]
    employees --> letter_templates
    salary["Salary"]
    salary_run["One month"]
    salary --> salary_run
    salary_pay["How people are paid"]
    salary --> salary_pay
    salary_advances["Advances"]
    salary --> salary_advances
    attendance["Attendance"]
    attendance_month["The month, per person"]
    attendance --> attendance_month
  end
  Home --> cat_people
  subgraph cat_vendors["Vendor management"]
    direction TB
    vendor_list["Vendors"]
    vendor_new["Add a vendor"]
    vendor_list --> vendor_new
    vendor_detail["One vendor"]
    vendor_list --> vendor_detail
    purchases["Purchases"]
    purchase_new["New order"]
    purchases --> purchase_new
    purchase_detail["One purchase"]
    purchases --> purchase_detail
    stock["Stock"]
    stock_material["One material’s moves"]
    stock --> stock_material
    stock_waste["Waste"]
    stock --> stock_waste
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
    roles["Roles and people"]
    settings["Settings"]
  end
  Home --> cat_workspace
```

## Home

| Screen | Web | App route | Permission |
| --- | --- | --- | --- |
| Home | `/` | `Home` | — |
|   ↳ Notifications | `/notifications` | `Notifications` | — |
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
|     ↳ Invoice and challans | `/orders/[id]/invoice` | `OrderInvoice` | — |
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
| GST rates | `/admin/gst` | `AdminGst` | `gst.manage` |
| Lead fields | `/admin/lead-fields` | `AdminLeadFields` | `config.view` |

### Finances

*Money in, money out, and where it is sitting*

| Screen | Web | App route | Permission |
| --- | --- | --- | --- |
| Transactions | `/transactions` | `Transactions` | `payment.cash_position` |
| Payout ledger | `/disbursements` | `DisbursementLedger` | `disbursement.view` |
| Invoices | `/invoices` | `Invoices` | `invoice.view` |
|   ↳ One invoice | `/invoices/[id]` | `InvoiceDetail` | — |
| Reports | `/reports` | `Reports` | `report.view` |
|   ↳ Ask for a report | `/reports/new` | `ReportRequest` | `report.run` |
| Expenses | `/expenses` | `Expenses` | `expense.view` |
|   ↳ Record an expense | `/expenses/new` | `ExpenseForm` | — |
|   ↳ One expense | `/expenses/[id]` | `ExpenseDetail` | — |
|   ↳ Where the money went | `/expenses/analytics` | `ExpenseAnalytics` | — |
|   ↳ Expense dropdowns | `/admin/expense-options` | `AdminExpenseOptions` | `expense.config` |

### People

*Who works here, and what they are paid*

| Screen | Web | App route | Permission |
| --- | --- | --- | --- |
| Employees | `/employees` | `Employees` | `employee.view` |
|   ↳ Add an employee | `/employees/new` | `EmployeeForm` | `employee.manage` |
|   ↳ One employee | `/employees/[id]` | `EmployeeDetail` | — |
|     ↳ Their letters | `/employees/[id]/letters` | `EmployeeLetters` | — |
|   ↳ Letter templates | `/admin/letter-templates` | `AdminLetterTemplates` | `employee.manage` |
| Salary | `/salary` | `Salary` | `salary.view` |
|   ↳ One month | `/salary/[id]` | `SalaryRun` | — |
|   ↳ How people are paid | `/salary/structures` | `PayStructures` | `salary.manage` |
|   ↳ Advances | `/salary/advances` | `SalaryAdvances` | `salary.manage` |
| Attendance | `/attendance` | `Attendance` | `attendance.view` |
|   ↳ The month, per person | `/attendance/month` | `AttendanceMonth` | — |

### Vendor management

*Everyone the shop deals with*

| Screen | Web | App route | Permission |
| --- | --- | --- | --- |
| Vendors | `/vendors` | `Vendors` | `vendor.view` |
|   ↳ Add a vendor | `/vendors/new` | — | `vendor.manage` |
|   ↳ One vendor | `/vendors/[id]` | `VendorDetail` | — |
| Purchases | `/purchases` | `Purchases` | `purchase.view` |
|   ↳ New order | `/purchases/new` | `PurchaseEdit` | `purchase.manage` |
|   ↳ One purchase | `/purchases/[id]` | `PurchaseDetail` | — |
| Stock | `/stock` | `Stock` | `stock.view` |
|   ↳ One material’s moves | `/stock/[materialId]` | `StockMoves` | — |
|   ↳ Waste | `/stock/waste` | `Waste` | — |
| Clients | `/clients` | `Clients` | `client.view` |
|   ↳ One client | `/clients/[id]` | `ClientDetail` | — |
|     ↳ Billing details | `/clients/[id]/firm` | `ClientFirm` | — |

### Workspace

*The shop itself, and this device*

| Screen | Web | App route | Permission |
| --- | --- | --- | --- |
| Firm details | `/admin/firm` | `FirmProfile` | `config.view` |
| Roles and people | `/admin/roles` | `AdminRoles` | `user.view` |
| Settings | `/settings` | `Settings` | — |

## FirstLeap’s own console

*Where the product is run rather than used. Nothing here is gated by a
module — a client’s plan cannot decide what we may see about them — and
every screen needs a platform permission, which no tenant role can hold.*

### The business

*Who is on the platform and what they are worth*

| Screen | Web | App route | Permission |
| --- | --- | --- | --- |
| Overview | `/platform` | `PlatformOverview` | `platform.tenant.view` |
| Workspaces | `/platform/tenants` | `Tenants` | `platform.tenant.view` |
|   ↳ One workspace | `/platform/tenants/[id]` | `TenantDetail` | `platform.tenant.view` |

### What we sell

*Tiers, module prices and what each workspace pays*

| Screen | Web | App route | Permission |
| --- | --- | --- | --- |
| Tiers and prices | `/platform/plans` | `PlatformPlans` | `platform.tenant.view` |
| Billing | `/platform/billing` | `PlatformBilling` | `platform.tenant.view` |

### Ourselves

*Our own people, and the app they ship*

| Screen | Web | App route | Permission |
| --- | --- | --- | --- |
| Staff and roles | `/platform/staff` | `PlatformStaff` | `platform.staff.view` |
| Releases | `/platform/releases` | `PlatformReleases` | `platform.release.view` |

## Outside the menu

*Signing in happens before there is a menu at all.*

| Screen | Web | App route | Permission |
| --- | --- | --- | --- |
| Sign in | `/login` | `Login` | — |
