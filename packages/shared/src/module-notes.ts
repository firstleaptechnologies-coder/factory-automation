/**
 * What each module is for, and how work moves through it.
 *
 * The one part of the product manual that is written rather than derived. A
 * generator can list every screen and every field in a module; it cannot say
 * that an order is punched before it is priced because the floor cannot wait
 * for a number, or that a receipt is corrected by its opposite because money
 * rows are never edited. Somebody has to write that down.
 *
 * Kept here, beside MODULE_CATALOGUE, so the two cannot describe different
 * products — and so a module added to the catalogue with nothing written about
 * it fails `product-manual.spec.ts` rather than reaching a vendor as a heading
 * with nothing under it.
 *
 * Written for the person using the software, not the person building it. A
 * shop owner reads this to find out what they bought.
 */
export interface ModuleNote {
  /** What it is for and who uses it — a paragraph, not a label. */
  summary: string;
  /** How work moves through it, in the order it happens. */
  flow: string[];
}

export const MODULE_NOTES: Record<string, ModuleNote> = {
  orders: {
    summary:
      'The reason to buy this. An order is punched the moment it is agreed — usually on a phone, ' +
      'often mid-conversation — and then moves across the shop as work is done to it. Punching ' +
      'asks for as little as possible: who it is for, what is being made and how big. A price can ' +
      'arrive later, photographs can arrive later, the GST number can arrive later. What cannot ' +
      'wait is the job being on the board, because an order nobody wrote down is an order nobody ' +
      'makes. Every workspace has this; it is not a line on an invoice.',
    flow: [
      'Punch the order: who it is for, the material, the size and the quantity. If the client is ' +
        'not on file, their name and number are enough to create them.',
      'It appears on the board at the first stage of the shop’s own status flow.',
      'The floor moves it forward a stage at a time as work is done. Moving it back is a separate ' +
        'permission, because going backwards is usually a mistake and occasionally a correction.',
      'Price it when the price is known — repricing keeps the order and its history, rather than ' +
        'making a second one.',
      'Take payments against it. What is still owed is the order’s total less what has been ' +
        'received, and it is shown on the order rather than worked out by hand.',
      'Photographs, the invoice and the delivery challan hang off the finished order.',
    ],
  },

  clients: {
    summary:
      'Who the shop works for. A client can be created deliberately — from a visiting card, or ' +
      'from the phone’s address book — or appear as a side effect of punching an order for ' +
      'somebody new. Only the name is ever required: making a GSTIN a condition of writing a name ' +
      'down is how clients end up on the back of a job card. The billing details are filled in ' +
      'later, when somebody asks for a bill. Every workspace has this.',
    flow: [
      'Add a client from the phone book or by hand, or let one be created by punching an order ' +
        'for a name that is not on file.',
      'The phone number is what a client is found by, and the same number is refused twice: two ' +
        'records for one firm is a split ledger and a statement that is wrong on both.',
      'Firm details — GST number, state, billing and shipping addresses — are added when they ' +
        'matter, which is when a bill is being made.',
      'Their state against the shop’s decides whether an invoice shows CGST and SGST or a single ' +
        'IGST line, so it is a billing fact rather than an address.',
      'Everything the shop has done for them — orders, quotes, payments, what is outstanding — ' +
        'hangs off the one record.',
    ],
  },

  leads: {
    summary:
      'Enquiries, before there is an order. Somebody rings, or walks in, or sends a photograph on ' +
      'WhatsApp, and that is worth writing down even though nothing has been agreed. The pipeline ' +
      'is the shop’s own: the stages, and the questions asked at each, are configured rather than ' +
      'fixed, because what an architectural-decor shop needs to know is not what a joinery needs ' +
      'to know.',
    flow: [
      'Record the enquiry, with the source it came from — a walk-in and an Instagram message are ' +
        'worth telling apart when deciding where the next rupee of advertising goes.',
      'It sits on the lead board at whatever stage the shop starts enquiries at.',
      'Move it as it progresses. Extra questions the shop wants asked are custom fields, defined ' +
        'once and then present on every enquiry.',
      'Convert it to an order when it is agreed. The client, the sizes and the notes carry across ' +
        'rather than being retyped.',
      'An enquiry that goes nowhere is archived, not deleted — what was lost, and at which stage, ' +
        'is the most useful thing a pipeline knows.',
    ],
  },

  quotes: {
    summary:
      'Priced quotations, before there is an order. A shop loses work by quoting slowly, so a ' +
      'quote is built from the same materials, sizes and rates the rest of the product already ' +
      'knows, and comes out on the shop’s own letterhead. A quote that is accepted becomes an ' +
      'order without anybody retyping it.',
    flow: [
      'Start a quote against a client, or against a name typed in for somebody not yet on file.',
      'Add lines: material, thickness, size, quantity. The rates the shop has configured price ' +
        'them; anything unusual can be overridden on the line.',
      'The firm’s letterhead, colours and terms are set once under Firm details and appear on ' +
        'every quote.',
      'Send it. Its status says where it stands — sent, accepted, declined.',
      'An accepted quote converts to an order, carrying its lines and its prices, so the thing ' +
        'that was agreed is the thing that gets made.',
    ],
  },

  finance: {
    summary:
      'Money in, money out, and what is still owed. Every entry is append-only: a receipt is ' +
      'corrected by recording its opposite, never by editing or deleting it, so the ledger can ' +
      'always be read back to what actually happened. Payouts sit beside orders and are never ' +
      'netted off them — a shop that quietly reduces an order’s total by what it paid a fabricator ' +
      'cannot tell what it earned from what it spent.',
    flow: [
      'Record a payment against an order as it arrives, in whatever form it arrived — cash, UPI, ' +
        'transfer, cheque.',
      'What is outstanding is the order’s total less what has been received, shown on the order ' +
        'and totalled on Owed to you.',
      'A payment entered wrongly is reversed, which writes the opposite entry. The original stays ' +
        'visible, because a ledger that forgets is a ledger nobody can check.',
      'Payouts — what the shop pays out on a job to a fabricator, an installer, a transporter — ' +
        'are recorded against the order under their own headings, alongside it rather than ' +
        'inside it.',
      'Invoices are raised from finished orders, with the GST split the client’s state decides.',
    ],
  },

  expenses: {
    summary:
      'What the shop spends on itself, as opposed to what it spends on a job. Rent, electricity, ' +
      'tea, a replacement blade. The categories and the dropdowns are the shop’s own, because one ' +
      'shop’s "consumables" is another’s four separate headings. Like every money record here, an ' +
      'expense is corrected by its opposite rather than edited away.',
    flow: [
      'Record the expense: what it was for, how much, how it was paid and who authorised it.',
      'The headings and the dropdown options are configured by the shop and then reused, so the ' +
        'same thing is not spelt three ways across a year.',
      'A bill or receipt can be photographed onto it.',
      'An expense entered wrongly is reversed. Every edit is kept, so "who changed this and when" ' +
        'has an answer.',
      'Where the money went totals it by heading and by month.',
    ],
  },

  purchasing: {
    summary:
      'Vendors, what was bought from them, what is on the rack and what was thrown away. A decor ' +
      'shop’s material is most of its cost, and the difference between a profitable job and an ' +
      'unprofitable one is usually waste nobody measured.',
    flow: [
      'Keep the vendors: who they are, what they supply and their billing details.',
      'Raise a purchase order and place it.',
      'Receive it when it arrives — what actually turned up, which is not always what was ordered.',
      'Receiving moves stock onto the rack. Every movement in or out is recorded, so the level is ' +
        'derived from what happened rather than typed in and trusted.',
      'Record waste against a material, with a reason. Unmeasured waste is the cost that never ' +
        'appears anywhere.',
      'Bill and pay the vendor. What is owed to whom is the other side of Owed to you.',
    ],
  },

  hr: {
    summary:
      'The people who work in the shop, whether they are there today, and what they are paid. ' +
      'Built for a floor where some people are on a monthly salary, some on a daily rate, and ' +
      'advances against next month’s pay are normal rather than exceptional.',
    flow: [
      'Register an employee with how they are paid — monthly, daily, or piece work.',
      'Mark attendance for the day, per person. The month, per person, is the view that settles ' +
        'arguments.',
      'Advances taken against pay are recorded as they are given, and come off the month they ' +
        'belong to.',
      'Run salary for the month. What each person is owed comes from their pay structure, their ' +
        'attendance and their advances, rather than from a calculator.',
      'Payslips and letters — appointment, increment, experience — are generated from templates ' +
        'the shop keeps, on the firm’s own letterhead.',
      'Somebody who leaves is marked as having left, not deleted: their history is part of the ' +
        'shop’s records.',
    ],
  },

  reports: {
    summary:
      'Exports for the shop and for its accountant. Not yet built: the screens exist and the ' +
      'permissions exist, and nothing behind them does. Listed here so a shop can see what the ' +
      'module will be rather than discovering its shape after buying it.',
    flow: [
      'Ask for a report over a period.',
      'It is built in the background — a large export should not hold a screen open.',
      'Download it when it is ready. Built reports expire, because last quarter’s figures ' +
        'downloaded today are a support call waiting to happen.',
    ],
  },

  analytics: {
    summary:
      'Cycle times, conversion, and what is stuck. Named and priced but not built — no screens, ' +
      'no routes, nothing behind it yet. It is in the catalogue so the shape of the product is ' +
      'honest about where it is going; it should not be sold as though it exists.',
    flow: [],
  },

  ai: {
    summary:
      'Drafting orders and quotes from whatever arrives — a photograph, a voice note, a forwarded ' +
      'message. Named and priced but not built. Nothing behind it yet.',
    flow: [],
  },

  workspace: {
    summary:
      'What every workspace has, whatever they bought. The shop’s own details, its materials and ' +
      'sizes, the stages an order moves through, who works there and what each of them may do. ' +
      'None of it is a module because a shop with none of it could not be used at all — but it is ' +
      'most of what makes the software fit one shop rather than another.',
    flow: [
      'Set the firm’s details: name, GST number, state, letterhead and the terms that print on ' +
        'paperwork.',
      'Configure the materials the shop works in, their thicknesses, and the sizes it cuts to. ' +
        'These are what punching an order offers.',
      'Build the status flow: the stages an order moves through, and which ones can be moved ' +
        'between. Every shop’s floor is different and the software follows the floor.',
      'Add the people, and give each a role. A role is a set of permissions, so a shop that ' +
        'splits or renames jobs is not fighting the software.',
      'Settings, notifications and search are here too — they belong to the workspace rather than ' +
        'to any one part of it.',
    ],
  },

  platform: {
    summary:
      'FirstLeap’s own console, above every shop. Never sold, never shipped to a vendor, and ' +
      'deliberately not part of any exported manual: what we do above a shop is not that shop’s ' +
      'business. This is where workspaces are created, plans and modules are set, billing is run, ' +
      'our own staff are managed, and the app that every shop runs is released.',
    flow: [
      'Create a workspace for a new client, on a plan, with the modules that plan includes.',
      'Modules can be turned on for one shop without moving them up a tier — an exception ' +
        'recorded against them rather than a new price list.',
      'Billing runs from what each workspace is on. A shop that pays nothing is visible as such.',
      'Support can open a workspace with a reason recorded, so acting inside a shop’s data is ' +
        'never anonymous.',
      'Releases: a new app build arrives from the robot as a draft, is put in front of a share of ' +
        'installs, and is walked up or rolled back from here.',
    ],
  },
};
