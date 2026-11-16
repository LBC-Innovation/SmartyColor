# Admin redesign: run the business from one place

Status: spec, 2026-11-16. Parts 1–2 are the business review and product requirements; part 3 is the UX
design; part 4 is the build plan. Read `docs/agent-reference.md` first: its hard rules (no hardcoded
prices, production database, vocabulary) still apply.

## 1. Business review of today's admin

Colorful Memories sells two things: **AI coloring pages** (paid from a prepaid wallet) and **books**
(print-at-home PDF or a printed book fulfilled by Lulu). Customers top up a wallet by card; promo
credit (welcome, referral, admin grants) sits in the same wallet. Scale today (production, 2026-11-16):
6 accounts, 25 book orders, 330 AI calls, 266 wallet entries, 0 entered fixed costs.

That scale matters: the owner is one person checking in a few times a week. The admin has to answer
"does anything need me?" in seconds, and "am I making money on each sale?" in a minute. Everything
else is reference.

| Page | Original intent | What's wrong with it |
|---|---|---|
| **Users** | Find an account and fix it: verify, reset password, suspend, grant credit, permissions, delete. | A list of names with "Promo $", status and "N permissions granted". Nothing tells you who is a customer: no orders, no spend, no last activity, no search. Every action lives in one 685-line modal that stacks profile, auth, security, orders, wallet, product access, 17 permission checkboxes and delete in one scroll. |
| **Orders** | See every book order and cancel/refund while Lulu still allows it. | A text list where each row is one dense line of `ID · email · pages · total · time`. No counts per status, no search, no money per order (what we paid Lulu vs. charged), "View detail" opens the *customer's* order page in a new tab. Failed orders that need action look like every other row. |
| **Financials** | Cash vs. accrual P&L, contribution margin by product, balances, unit economics, fixed costs, assumptions. | The analysis is solid; the presentation buries it. Six KPI tiles, an insights table, a chart, two statements, a 10-column product table, two fact lists, a cost editor and a methodology note on one 780-line scroll. Setup (fixed costs, card-fee rate, opening cash) is mixed in with reporting. |
| **Vision costs** | Track what Gemini calls cost and catch provider failures. | Built as a developer debug screen: session IDs, server log path, in-memory instance totals, model rate cards, raw token counts, a black log-tail box, and a 4-second auto-poll. Operation names are code (`sheet_edit`). The one thing the owner needs, "is AI broken right now and what does a page cost me", is a small red box only when billing fails. |
| **Prices** | Set cost → markup → list price for every billable item; see margin; audit changes. | Each SKU is a full card with a 4-field form and a 4-stat result box, so nine items is a very long page and items can't be compared. Current price, margin and "losing money" aren't scannable. |
| **Promo credits** | Set the welcome and referral credit amounts. | Two numbers on a whole page. It shows nothing about what promos *cost* (granted, redeemed, outstanding), which already exists in the finance report. **It should not be its own page.** |

Cross-cutting problems:
- No landing page. `/admin` doesn't exist; the owner has to open four pages to know if anything's wrong.
- Navigation is a thin tab strip; pages are a narrow `max-w-5xl` column, so desktop width is wasted and
  wide tables scroll sideways.
- Every page re-implements loading, errors, KPI tiles, tables and toggles slightly differently, and
  mixes legacy styles (`slate-*`, the old `VisionCostDashboard` "default" variant) with the v2 theme.
- Developer vocabulary leaks into an owner's tool: SKUs, operations, tokens, "COGS", migration numbers.

## 2. What the owner should care about (product requirements)

### 2.1 The questions, in priority order

1. **Does anything need me right now?** Failed orders, orders stuck at the printer, orders still
   cancelable that a customer asked about, AI provider errors (billing/quota stops the product), items
   priced below cost.
2. **Is the business working?** Last 30 days: revenue, orders, gross profit after variable costs, new
   customers, and the trend vs. the previous 30 days.
3. **Am I making money on each thing I sell?** Price, cost and margin per product; AI cost per page.
4. **Who are my customers?** Who has bought, how much, how recently; fix an account when they write in.
5. **Change a lever.** Prices, markups, free edits, welcome/referral credit, a one-off credit to a customer.
6. **Reference.** Full P&L / cash flow, fixed costs and assumptions, change history, raw AI call log.

### 2.2 Information architecture

Left sidebar on desktop, grouped. Existing URLs are kept so bookmarks and permissions still work.

| Group | Item | Route | Permission | Replaces |
|---|---|---|---|---|
| — | **Overview** | `/admin` (new) | any admin permission; each card checks its own | — |
| Operate | **Orders** | `/admin/orders` | `usermanage:manageorders` | Orders |
| Operate | **Customers** | `/admin/users` | `usermanage:listusers` | Users |
| Money | **Financials** | `/admin/finance` | `finance:view` | Financials |
| Money | **AI usage** | `/admin/vision-costs` | `costs:viewai` | Vision costs |
| Money | **Pricing & promos** | `/admin/pricing` | `pricing:manage` or `usermanage:adjustcredits` | Prices + Promo credits |

`/admin/promo-credits` redirects to `/admin/pricing#promotions`.

### 2.3 Requirements per screen

**Overview (new)**
- "Needs attention" list first: failed orders, orders in production past their due date, AI
  billing/auth/quota errors in the last 24h, price items losing money, finance insights tagged
  critical/warning. Each item links to where it's fixed. Empty state says "Nothing needs you."
- KPIs for the last 30 days with change vs. previous 30: net revenue, orders, contribution margin,
  new sign-ups; each with a small trend.
- One chart: revenue vs. costs over the last 30 days.
- Recent orders (5) and recent sign-ups (5), each linking to the full page.

**Orders**
- Status tabs with counts: Needs attention (failed + stuck), In progress, Shipped, Canceled, All.
- Search by order ID, customer email, album title.
- Table: order (album + ID), customer, format/pages, status, charged, our cost, margin, placed.
- Click a row → side drawer: status timeline facts, customer (links to their customer drawer), money
  breakdown (charged = subtotal + shipping + tax; Lulu cost; margin; refunded), Lulu job, actions:
  Cancel & refund (when allowed), Resubmit to Lulu (when failed), open the customer's order page.

**Customers**
- Search by name/email; filters: All, Paying, Staff (has any permission), Suspended, Unverified.
- Table: customer, joined, last active, orders, lifetime spend, wallet balance, status.
- Click → side drawer with tabs: **Overview** (key facts + recent orders), **Wallet** (balance,
  grant/revoke with note + email option, ledger), **Access** (product access + permissions grouped
  by area, only for editors), **Account** (name, email, verification, magic link, password, suspend,
  delete in a danger zone).
- "Add user" stays for `usermanage:add`.

**Financials**
- Period control at the top (30d, 90d, this month, last month, YTD, 12m, all, custom).
- KPI row (4): net revenue, contribution margin, operating profit, cash on hand (or owed to customers).
- "What to pay attention to" insights, as a compact callout list.
- Chart: cash in vs. cash out with net line (existing chart, re-skinned).
- Tabs below for depth: **Products** (margin table), **Statements** (P&L and cash flow side by side),
  **Balances** (wallet liability, promo exposure, unit economics), **Costs & assumptions** (fixed
  costs editor, card fees, opening cash; manage permission only), with "How these numbers work" at
  the bottom of Statements.

**AI usage**
- Health banner: green "Working normally" or red/amber with the latest billing/quota/auth error.
- Period control (today, 7d, 30d, all). KPIs: spend, calls, failed calls (rate), average cost per call.
- Chart: daily spend for the last 30 days.
- Table: cost by action in plain words (Make a coloring page, Edit a page, …), calls, spend, avg per call,
  share of spend.
- Recent failures table, recent calls table (with customer).
- "Diagnostics" collapsed: model rates, server instance, log tail. No auto-polling; a Refresh button.

**Pricing & promos**
- One comparison table per group (Coloring pages & edits, Print-at-home, Printed books): item, our
  cost, markup, minimum, list price, margin, charging on/off, with a red flag when losing money.
- Click a row → side drawer editor with the live preview of list price/margin, observed AI cost
  (avg/p90/max, "use p90"), Lulu sample cost for books, Save/Reset.
- **Promotions** section: welcome credit and referral credit (inline edit), plus what promos cost in
  the last 30 days (granted, redeemed, outstanding balance, est. cost to honor) from the finance report
  when the viewer has `finance:view`.
- Change history (collapsed list, latest 20).

### 2.4 Non-goals

No new database tables or migrations. No CSV export, no role system, no charts library dependency.
Data additions are read-only aggregations on existing tables.

### 2.5 Data additions

- `AdminUser` gains `ordersCount`, `lifetimeSpendCents` (paid, not canceled/refunded order totals),
  `lastActiveAt` (latest `account_activity.occurred_at`, falling back to auth `last_sign_in_at`).
- `AdminUserOrderSummary` gains `subtotalCents`, `shippingCents`, `taxCents`, `luluCostCents`.
- `VisionPersistedSummary` gains `daily: Array<{ date; costUsd; calls; errors }>` for 30 days.

## 3. UX design

Principles: **answer first, detail on demand.** Every page opens with the one or two things the owner
needs (a status, 3–4 numbers, one chart), then a table to act on, then depth behind tabs, drawers or a
collapsed section. Calm and neutral: white surfaces on `v2-bg`, ink/navy text, violet only for actions,
selection and the active nav item. Color in data means something (red = losing money / broken, amber =
watch, green = good) and is always paired with an icon or word. No cream/butter/plum bands.

### 3.1 Admin shell

```
┌──────────────────────────────────────── V2TopBar (unchanged) ────────────────────────────────────────┐
├───────────────┬───────────────────────────────────────────────────────────────────────────────────────┤
│ ADMIN         │  Orders                                         [Search…] [⟳ Refresh]               │
│ ◉ Overview    │  Every book order, newest first.                                                     │
│               │  ─────────────────────────────────────────────────────────────────────────────────── │
│ OPERATE       │  page content (max-w-[1400px], px-8, py-6, space-y-8)                                │
│ ▸ Orders   (2)│                                                                                      │
│ ▸ Customers   │                                                                                      │
│               │                                                                                      │
│ MONEY         │                                                                                      │
│ ▸ Financials  │                                                                                      │
│ ▸ AI usage (!)│                                                                                      │
│ ▸ Pricing &   │                                                                                      │
│   promos      │                                                                                      │
│               │                                                                                      │
│ ← Back to app │                                                                                      │
└───────────────┴───────────────────────────────────────────────────────────────────────────────────────┘
```

- **`AdminShell`** wraps `V2StudioFrame` (top bar kept; bottom nav kept on phones). Children:
  `AdminSidebar` + a scrolling `<main>` (`lg:overflow-y-auto`, `lg:min-h-0`).
- **Sidebar** (≥1024px): `w-60` fixed, `border-r border-gray-200 bg-white`, own scroll, `py-5 px-3`.
  Group labels use `v2-section-title px-3 mb-1 mt-5` ("Operate", "Money"; Overview has no group).
  Item: `h-10 rounded-lg px-3 gap-3 text-sm font-semibold`, Lucide icon `h-4 w-4`.
  Inactive `text-v2-navy hover:bg-v2-bg-subtle`; active `bg-v2-primary-light text-v2-primary` plus
  `aria-current="page"`. Items the user lacks permission for are hidden; empty groups are hidden.
  Footer link "Back to the app" → `/home`.
- **Sidebar badges**: Orders shows the count of orders needing attention (red pill `bg-red-600 text-white
  text-[11px] min-w-5 h-5 rounded-full`); AI usage shows a red dot when a billing/quota/auth error
  happened in the last 24h. Badge data comes from one lightweight `useAdminAlerts()` hook (orders
  `active` list + vision summary), fetched once per shell mount and on Refresh; never polls. Badges have
  `aria-label` ("2 orders need attention").
- **Content**: `mx-auto w-full max-w-[1400px] px-8 py-6` (≥1024), `px-4 py-5` below. Sections stack
  with `space-y-8`.
- **Below 1024px**: sidebar becomes a horizontal, scrollable tab strip under the top bar
  (`overflow-x-auto`, same items, same active style, badges inline), the current item scrolled into view.
  Tables collapse to card lists (see DataTable). Drawers go full-screen.

**PageHeader** pattern: one row, `flex items-start justify-between gap-6 mb-6`.
Left: `h1.v2-brand-title text-[1.75rem] text-v2-ink` + one-line `p.text-sm text-v2-muted max-w-2xl mt-1`.
Right: actions in this order — search (if the page has one), period control, Refresh (icon button with
"Updated 2 min ago" tooltip), primary action (`v2-btn-primary`, at most one per page).

### 3.2 Shared components (`src/components/v2/admin/`)

| Component | Props | Behaviour |
|---|---|---|
| `PageHeader` | `title, description?, actions?: ReactNode` | As above. Title is the only Fredoka text on the page. |
| `Section` | `title, description?, action?: ReactNode, children, id?` | `h2.text-base font-semibold text-v2-ink` + optional `text-sm text-v2-muted`; `action` right-aligned (e.g. "View all →" link `text-sm font-semibold text-v2-link`). `id` makes it a link target. |
| `KpiTile` | `label, value: string, delta?: {value: number; format: (n)=>string; goodWhen: "up"\|"down"\|"none"}, sub?: string, trend?: number[], tone?: "default"\|"bad", href?` | `v2-panel p-5`. Label `text-sm font-medium text-v2-muted`; value `text-[1.75rem] font-semibold tabular-nums text-v2-ink` (red-700 when `tone="bad"`); delta line `text-xs`: arrow icon + signed value + "vs. previous 30 days", green-700 when it moved the good way, red-700 the bad way, muted when flat or `goodWhen="none"`. Sparkline (`trend`) sits bottom-right, 96×28. Whole tile is a link when `href`. KPI rows: `grid grid-cols-2 lg:grid-cols-4 gap-4`. |
| `DataTable<T>` | `columns: Column<T>[]` (`key, header, cell(row), align?: "left"\|"right", sortValue?(row), width?, hideBelow?: "md"\|"lg"`), `rows, rowKey, onRowClick?, selectedKey?, loading?, empty?: ReactNode, footer?: ReactNode, defaultSort?, mobileCard?(row)` | Inside `v2-panel overflow-hidden`. Header `sticky top-0 bg-v2-bg-subtle text-xs font-semibold text-v2-muted`, `h-10`. Rows `h-12 border-t border-gray-100 text-sm`, hover `bg-v2-bg-subtle/60`, selected `bg-v2-primary-light/60`. Numbers right-aligned + `tabular-nums`. Sortable headers are `<button>` inside `<th aria-sort>` with a chevron; click toggles asc/desc. Clickable rows: `tabIndex=0`, `role="button"` is NOT used on `<tr>`; instead the first cell holds a real `<button>`/`<Link>` that stretches (`after:absolute after:inset-0`) so Enter/Space and screen readers work; row `relative`. Loading: 5 skeleton rows (`animate-pulse bg-gray-100 h-3 rounded`). Empty: `empty` slot spanning all columns. `footer` renders a totals `<tfoot>` row `font-semibold border-t border-gray-200`. Below `md`, if `mobileCard` is given, render a `<ul>` of cards instead. |
| `StatusPill` | `tone: "neutral"\|"info"\|"progress"\|"good"\|"warn"\|"bad", children, icon?` | `inline-flex h-6 items-center gap-1 rounded-full px-2.5 text-xs font-semibold`. neutral `bg-gray-100 text-gray-700`; info `bg-sky-50 text-sky-800`; progress `bg-v2-primary-light text-v2-primary-dark`; good `bg-v2-success-bg text-v2-success-text`; warn `bg-amber-50 text-amber-800`; bad `bg-red-50 text-red-700`. Order status → tone: awaiting_payment warn, paid/submitting/submitted progress, in_production progress, shipped info, delivered good, failed bad, canceled/refunded neutral. |
| `SegmentedControl` | `options: {id,label}[], value, onChange, ariaLabel` | Period pickers and table filters. `inline-flex rounded-lg bg-v2-bg-subtle p-1`; option `h-8 px-3 text-sm font-semibold rounded-md`; selected `bg-white text-v2-ink shadow-sm`. `role="radiogroup"` / `role="radio"`, arrow keys move. |
| `Tabs` | `tabs: {id,label,count?}[], value, onChange` + `TabPanel` | Underline tabs for switching page sections: `border-b border-gray-200`, tab `h-10 px-1 mr-6 text-sm font-semibold`, selected `text-v2-ink border-b-2 border-v2-primary`, idle `text-v2-muted`. Count as a small grey pill. WAI-ARIA tabs (`tablist/tab/tabpanel`, arrows, Home/End). Selected tab mirrors to `?tab=` so it survives reload. |
| `Drawer` | `open, onClose, title, subtitle?, headerActions?, footer?, width?: "md"\|"lg", children` | Right panel `fixed inset-y-0 right-0 w-full sm:w-[560px]` (lg = 720px), `bg-white shadow-2xl`, backdrop `bg-v2-ink/30`. Header `px-6 py-4 border-b` with title `text-lg font-semibold`, subtitle muted, actions + close (X, `aria-label="Close"`). Body scrolls. `footer` is sticky `border-t px-6 py-3 flex justify-end gap-2` (Save / Reset). `role="dialog" aria-modal="true" aria-labelledby`, focus trap, Esc closes, focus returns to the row that opened it. Slide-in 200ms; none with reduced motion. Phones: full screen. Drawer state lives in the URL (`?order=ID`, `?user=ID`, `?item=sku`) so it deep-links from Overview. |
| `AttentionList` / `AttentionItem` | item: `tone: "critical"\|"warning"\|"info", title, detail?, href?, actionLabel?` | Stacked rows in one `v2-panel divide-y`: left 3px tone bar (red-600 / amber-500 / sky-600) + icon (AlertOctagon / AlertTriangle / Info), title `text-sm font-semibold`, detail `text-sm text-v2-muted`, right `actionLabel →` link. Critical first. |
| `Callout` | `tone: "good"\|"warning"\|"critical"\|"info", title, children?` | Banner for page-level state (AI health, setup missing). `rounded-xl border px-4 py-3` with icon. |
| `EmptyState` | `icon, title, children?, action?` | Centered in its panel, `py-12`, icon `h-8 w-8 text-v2-muted`, title `font-semibold`, body muted. |
| `Sparkline` | `values: number[], tone?: "default"\|"good"\|"bad"` | SVG polyline 96×28, stroke 1.5 `#303a4d` (or green-700 / red-700), last point dot. `aria-hidden` (the tile states the number). |
| `TrendChart` | `series: {label, points: number[], color, kind: "bar"\|"line"}[], xLabels, format, height=240` | Generalisation of `V2FinanceCashChart`. Rules: max 3 series; `#2a78d6` primary/positive, `#eb6834` costs/negative, `#303a4d` net line; gridlines `#e5e7eb`, 4 nice ticks, y labels left `text-xs text-v2-muted`, ≤8 x labels. Legend above, left. Hover/focus shows a tooltip with all series for that bucket; a visually hidden `<table>` carries the same data for screen readers. When there's one series, draw it in `#2a78d6`. |
| `DefinitionList` | `items: {label, value, note?, tone?}[]` | For drawer facts and balances: label left muted, value right `tabular-nums font-semibold`. |
| `InlineMoneyInput` | `value, onChange, invalid, prefix="$", decimals` | `v2-input` with a `$` adornment, right-aligned text. |

**Formatting** (`src/components/v2/admin/format.ts`):
- Money: `$1,234.56` everywhere (`formatCredits`); KPI values ≥ $10,000 may round to `$12.3K`.
  Negatives as `−$12.34` in red-700 only where negative means bad. Sub-cent values round to `$0.00`.
- AI amounts show 4 decimals (`$0.0412`) only on the AI usage page and the AI rows of the pricing
  editor; everywhere else round to cents.
- Percent: one decimal for margins (`42.5%`), none in KPI deltas over 10%.
- Counts: `1,234`. Change: `+12%` / `−$40.00`.
- Dates: tables show relative ("3 days ago", "Today 2:14 pm") with the full local date-time in
  `title` and `<time dateTime>`; anything older than 7 days shows `Nov 3` (`Nov 3, 2025` if a past
  year). Order IDs show as the first 8 characters upper-cased in `font-mono text-xs`.

### 3.3 Overview (`/admin`)

```
Overview                                                     [30 days ▾ fixed]  [⟳]
Good morning. Here's what needs you and how the last 30 days went.

┌ Needs attention ─────────────────────────────────────────────────────────────────┐
│▌⛔ Order 3F2A91C0 failed at the printer      Lulu rejected the cover file.  Open → │
│▌⚠  AI billing error 2 h ago                  New pages can't be made.       Open → │
│▌⚠  "Edit a page" is priced below cost         Charging $0.04, costs $0.06.   Fix → │
└──────────────────────────────────────────────────────────────────────────────────┘
(empty: ✓ "Nothing needs you right now." in a green Callout)

┌ Net revenue ──┐┌ Orders ───────┐┌ Gross profit ─┐┌ New customers ┐
│ $412.80       ││ 9             ││ $151.20       ││ 4             │
│ ▲ +$88 vs prev││ ▲ +3          ││ 36.6% margin  ││ ▼ −1          │
└───────────────┘└───────────────┘└───────────────┘└───────────────┘
┌ Revenue and costs, last 30 days ───────────────────────────────────── View financials → ┐
│  bars: net revenue (#2a78d6) per day · bars below: variable costs (#eb6834) · net line   │
└──────────────────────────────────────────────────────────────────────────────────────────┘
┌ Recent orders ─────────────── View all → ┐┌ New customers ────────────── View all → ┐
│ Album · customer · status pill · $ · when ││ avatar · name/email · joined · spend    │
│ (5 rows; row opens the order drawer)      ││ (5 rows; row opens the customer drawer)  │
└───────────────────────────────────────────┘└─────────────────────────────────────────┘
```

- Balance: 1 list, 4 numbers, 1 chart, 2 short tables. No prose beyond the header line.
- Each block renders only with its permission; with none of the money permissions the page is just
  attention + recent orders/customers. Blocks load independently with their own skeleton.
- Attention sources: orders with status `failed`; `in_production` whose `luluProductionDueAt` is >3
  days past; AI errors of kind billing/quota/auth in 24h (critical for billing/auth, warning for quota);
  price items whose list price is below observed p90 cost; finance insights with tone critical/warning.
- KPIs: Net revenue (`goodWhen up`), Orders (paid, not canceled; up), Gross profit = contribution
  margin with "% margin" sub (up), New customers = sign-ups (up). Each links to its page.
- Copy: header "Here's what needs you and how the last 30 days went." Empty recent orders: "No orders
  yet. They'll show up here as soon as someone buys a book."

### 3.4 Orders (`/admin/orders`)

```
Orders                                            [🔍 Order, email or album…] [⟳]
Every book order, newest first. Click one to see the money and take action.

 Needs attention (2) │ In progress (5) │ Shipped (14) │ Canceled (4) │ All (25)
┌──────────────────────────────────────────────────────────────────────────────────────────────┐
│ Order                 Customer            Book             Status        Charged  Our cost Margin  Placed │
│ Grandma's garden      ana@…               Spiral · 24 pp   ⛔ Failed      $38.40   $21.10   45%   2 d ago│
│ 3F2A91C0                                                                                              │
│ …                                                                                                     │
├──────────────────────────────────────────────────────────────────────────────────────────────┤
│ 25 orders                                                    $812.40  $401.22  51%             │
└──────────────────────────────────────────────────────────────────────────────────────────────┘
```

Columns (exact): **Order** (album title bold, ID mono muted below) · **Customer** (email, or "Deleted
account" muted) · **Book** (`Printed · Spiral · 24 pages` / `Print at home · 24 pages`; hide < lg) ·
**Status** (StatusPill; under it `text-xs` "Cancel by Nov 18, 3 pm" when cancelable) · **Charged**
(right) · **Our cost** (Lulu cost; "—" for print-at-home) · **Margin** (% of charged minus tax;
red when < 0) · **Placed** (relative). Footer: count, sums, blended margin. Default sort Placed desc.

- Tabs: Needs attention = failed + in production past due; In progress = awaiting payment → in
  production; Shipped = shipped + delivered; Canceled = canceled + refunded; All. Counts come from one
  fetch of all orders (≤500) filtered client-side; the first tab with rows is selected on load
  (Needs attention if non-empty, else In progress).
- Search filters the current tab instantly (ID prefix, email, title; case-insensitive).
- Empty per tab: Needs attention → ✓ "No orders need you."; others → "No orders here."

**Order drawer** (`?order=ID`, width md):
```
Grandma's garden                                    [Open customer view ↗]  [×]
3F2A91C0 · placed Nov 14, 2:10 pm · ⛔ Failed
───────────────────────────────────────────────
⛔ Callout: what's wrong / what to do (failed: "The printer rejected this order. Resubmit it,
   or cancel and refund the customer.")
Customer      ana@example.com  → (opens customer drawer)
Book          Printed · Spiral bound · 24 pages · lined backs
Printer job   Lulu #128833 · "Production delayed"
Money         Book $28.00 · Shipping $6.40 · Tax $4.00 · Charged $38.40
              Our cost (Lulu) $21.10 · Margin $13.30 (45%) · Refunded —
Cancel reason "…" (if any)
───────────────────── sticky footer ─────────────────────
                         [Resubmit to printer]  [Cancel and refund]
```
- Footer actions only when allowed: Resubmit when `failed`; Cancel and refund when `adminCanCancel`
  (opens existing `CancelOrderModal` above the drawer). After an action: success toast-style
  `role="status"` line in the drawer, list refreshes, drawer stays open on the updated order.

### 3.5 Customers (`/admin/users`)

```
Customers                                       [🔍 Name or email…] [⟳] [+ Add user]
Everyone with an account. Click one to see their orders, wallet and access.

 All (6) │ Paying (3) │ Staff (2) │ Suspended (0) │ Unverified (1)
┌──────────────────────────────────────────────────────────────────────────────────────┐
│ Customer                   Joined     Last active   Orders  Spent     Wallet   Status │
│ (●) Ana Lopez              Oct 2      Today          4      $152.80   $5.00    Active │
│     ana@example.com                                                                    │
└──────────────────────────────────────────────────────────────────────────────────────┘
```
Columns: **Customer** (avatar 32, name or email bold, email muted; a small "Staff" neutral pill when
they hold any permission) · **Joined** · **Last active** · **Orders** (right) · **Spent** (lifetime,
right) · **Wallet** (balance, right) · **Status** (Active good / Suspended bad / "Unverified" warn
when email not confirmed). Default sort Last active desc. Filters as SegmentedControl-style tabs.

**Customer drawer** (`?user=ID`, width lg) — header: avatar, name, email, status pill; header action
"Send sign-in link" (if permitted). Tabs:
- **Overview**: DefinitionList (Joined, Last active, Email verified, Orders, Lifetime spend, Wallet
  balance) + compact orders table (Album, Status, Charged, Placed; row → order drawer).
- **Wallet** (`usermanage:adjustcredits`): big balance; quick grant chips `+$5 +$10 +$25`; form
  "Amount (use − to remove)", "Note shown in their history", checkbox "Email them about it"; Apply.
  Ledger table: Date, Change (green +/red −), Balance after, Note.
- **Access** (`usermanage:editpermissions`, else read-only): Product access switches; Permissions
  grouped in 4 fieldsets — Customers (listusers, add, editprofile, changeemail, verifyemail,
  magiclink, suspend, updatepassword, deleteusers, editpermissions, selfmanage), Orders
  (manageorders), Money (finance:view, finance:manage, costs:viewai, pricing:manage),
  Promotions (adjustcredits). Each is a labelled checkbox row with description; saves on change with
  an inline "Saved" status.
- **Account**: Display name (Save), Email (editable only when unverified), Verification (Verify /
  Mark unverified / Resend email), Reset password, Suspend/Unsuspend, then a red-bordered
  **Danger zone** "Delete account" with a two-step confirm that requires typing the email.

### 3.6 Financials (`/admin/finance`)

```
Financials                [30 days│90 days│This month│Last month│YTD│12 months│All]  [📅 custom] [⟳]
Profit counts revenue when customers spend their wallet; cash counts money that moved.

┌ Net revenue ┐┌ Gross profit ┐┌ Operating profit ┐┌ Cash on hand / Owed to customers ┐   (KpiTiles + sparklines)
AttentionList "What to pay attention to" (finance insights, max 5, "Show all" expands)
┌ Cash in vs. cash out ──────────────────────────────────────────────── (TrendChart) ┐
 Products │ Statements │ Balances │ Costs & assumptions
 [tab panel]
```
- **Products**: DataTable — Product · Sold · Gross sales · Promo · Net revenue · Variable cost ·
  Gross profit · Margin · List margin; footer totals; "Card fees aren't split by product" note.
  "AI calls" moves to a `title` tooltip on Sold. Red margin cells when negative.
- **Statements**: P&L and Cash flow side by side (`lg:grid-cols-2`), columns This period · Previous ·
  % of revenue (P&L only). Labels: "Gross profit" replaces "Contribution margin" in headings, with
  "(contribution margin)" in the row's title tooltip. "How these numbers are worked out" `<details>` below.
- **Balances**: two DefinitionLists — "What you hold and owe" (cash on hand, prepaid customer balance,
  promo credit outstanding, est. cost to honor promos) and "Customers & break-even" (sign-ups, paying
  customers, conversion, average top-up, fixed costs/mo, break-even revenue/mo, burn & runway).
- **Costs & assumptions** (edit needs `finance:manage`; others see read-only): fixed cost table (Name,
  Vendor, Category, Every, Amount, From–To) with "+ Add cost" → Drawer form; assumptions card (card fee
  %, fixed fee, opening cash + date) with its own Save.
- Setup missing: info Callout "Fixed costs and assumptions aren't set up yet, so profit leaves them
  out." (no migration numbers).

### 3.7 AI usage (`/admin/vision-costs`)

```
AI usage                                         [Today│7 days│30 days│All time]  [⟳]
What making and editing pages costs, and whether it's working.

✓ Callout good: "Working normally. No failed calls in the last 24 hours."
  (or ⛔ critical: "Billing problem with the image service — new pages can't be made. Last seen 2 h ago.")
┌ Spend ┐┌ Calls ┐┌ Failed ┐┌ Avg per call ┐
┌ Daily spend, last 30 days (single-series bars #2a78d6, failed calls as #eb6834 dots on top) ┐
┌ Cost by action ────────────────────────────────────────────────────────────────────────┐
│ Action                  Calls   Spend     Avg per call   Share of spend (inline bar)     │
└────────────────────────────────────────────────────────────────────────────────────────┘
 Recent failures │ Recent calls        (Tabs)
▸ Diagnostics (collapsed <details>: model rates, server instance, log tail)
```
- Operation → plain label (also used in tables and tooltips):
  `photoToColoring` "Make a coloring page" · `correctPhotoColoring` "Fix a coloring page" ·
  `photoToPortrait` "Turn a photo portrait" · `generateImage` "Draw a picture" · `refine` "Edit a page" ·
  `storybookPhotoChat` "Story book: describe photo" · `storybookGenerate` "Story book: write story".
  Unknown operations fall back to the raw name.
- Recent failures columns: When · Customer · Action · Problem (StatusPill: Billing bad, Sign-in bad,
  Quota warn, Safety warn, Other neutral) · Message (truncated, full in `title`).
  Recent calls: When · Customer · Action · Model (mono xs, hide < lg) · Cost.
- Shows 4-decimal amounts. No auto-poll. Empty: "No AI calls in this period."

### 3.8 Pricing & promos (`/admin/pricing`)

```
Pricing & promos                                                                   [⟳]
What customers pay, what it costs you, and the credit you give away.

⚠ AttentionList (only if any item loses money)
┌ Coloring pages & edits ────────────────────────────────────────────────────────────────────┐
│ Item                 Our cost   Markup   Minimum   Price     Margin   Charging              │
│ Make a coloring page $0.0410    200%     $0.25     $0.25     83.6%    ● On                  │
│ Edit a page          $0.0410    …                                    3 free per page        │
└────────────────────────────────────────────────────────────────────────────────────────────┘
┌ Print at home ─┐  ┌ Printed books (cost for a [24] page book) ┐   same columns; book cost from Lulu
┌ Promotions (#promotions) ──────────────────────────────────────────────────────────────────┐
│ Welcome credit   $5.00  [Edit]   Given once when a new account confirms its email.          │
│ Referral credit  $5.00  [Edit]   Given to both people when a referred friend's first order is paid. │
│ Last 30 days: granted $40.00 · redeemed $22.10 · outstanding $63.00 · est. cost to honor $18.90 │
└────────────────────────────────────────────────────────────────────────────────────────────┘
▸ Change history (collapsed, latest 20: When · Item · What changed · By)
```
- Columns: Item (name + one-line description muted) · Our cost (4 decimals for AI rows; Lulu sample
  cost for books) · Markup (%) · Minimum · Price (what customers pay now; "Free" muted when off; books
  "At cost" when markup off) · Margin (red + ⚠ icon when below observed p90 cost) · Charging (StatusPill
  On good / Off neutral). Rows open the editor.
- **Price editor drawer** (`?item=sku`): fields Our cost (AI/digital only), Markup %, Minimum price,
  Free per page (edit only), Charging switch; "Observed over 30 days: avg · typical high (p90) · max"
  with a "Use typical high" link; live preview DefinitionList (Price, Profit per sale, Margin; books:
  customer total incl. shipping and tax); warning Callout when losing money. Sticky footer Reset / Save.
  "COGS" is never shown; "Our cost" everywhere.
- Promotions rows edit inline: Edit swaps the amount for an `InlineMoneyInput` + Save/Cancel. Visible
  with `usermanage:adjustcredits`; the 30-day line needs `finance:view`. Page visible with either
  `pricing:manage` or `usermanage:adjustcredits`; price tables need `pricing:manage`.

### 3.9 Accessibility

- Every interactive element gets the existing `.v2-shell :focus-visible` ring; nothing removes outlines.
- Contrast: body text ink/navy on white; muted (`#5c6478`) only for secondary text ≥ 12px; never rely
  on color alone — tones always carry an icon or word; chart series are also distinguished by form
  (bar vs. line) and listed in the legend and SR table.
- Landmarks: sidebar `<nav aria-label="Admin">`, one `<main>`, one `<h1>` per page, `h2` per Section.
- Tables are real `<table>` with `<th scope="col">`, `aria-sort` on sorted headers, and a `<caption
  class="sr-only">`. Row activation via a real link/button in the first cell.
- Tabs/segmented controls follow WAI-ARIA patterns with arrow keys; drawers are modal dialogs with
  focus trap, Esc, and focus return; async results announce through `role="status"`.
- `prefers-reduced-motion`: no drawer slide, no skeleton pulse, no chart transitions.
- Touch: 44px targets via `.v2-hit` only under `pointer: coarse`; desktop density stays (h-10 rows
  in nav, h-12 table rows, h-8 segmented options).

## 4. Build

- **Shared kit** `src/components/v2/admin/`: `AdminShell` (sidebar, phone tabs, alert badges via
  `useAdminAlerts`), `ui.tsx` (PageHeader, Section, KpiTile, StatusPill, SegmentedControl, Tabs,
  Callout, AttentionList, EmptyState, DefinitionList, Switch, MoneyInput, Sparkline), `DataTable`,
  `Drawer`, `TrendChart`, `format.ts`, `orderAttention.ts` (one definition of "needs attention" for the
  badge, Overview and Orders) and `useUrlParam` (drawer and tab state in the URL).
- **Routing**: `src/app/(studio)/admin/layout.tsx` gates on any admin permission and renders the shell
  once, so the sidebar and its badges persist between pages. Each page keeps its own permission gate.
  The user menu's admin link now opens `/admin`.
- **Data** (read-only, no migrations): customer order counts, lifetime spend and last activity in
  `listAdminUsers`; subtotal/shipping/tax/Lulu cost on admin order summaries; a 30-day daily series in
  the AI usage summary.
- **Removed**: the tab-strip `V2AdminSubNav`, the per-page `V2StudioFrame` wrappers, the legacy
  `VisionCostDashboard`, the user-management modal, and the standalone promo-credits page (now a
  redirect to `/admin/pricing#promotions`).
