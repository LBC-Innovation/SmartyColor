# Book Packages and Design Themes: UX spec

Companion to `00-work-definitions.md`. Design only: this file says what each screen shows, says,
and does. It does not change the data model or the money rules in `00`. Where this file and `00`
disagree on money, `00` wins.

Rules carried from `docs/agent-reference.md` that every line of copy below already follows:

- No "AI" in customer text. No em dashes in customer text.
- "coloring page" / "page", "album", "Make a book". Never "sheet", "project", "generate".
- No price, count or date is written into code. Every number is a `{token}` filled from the server.
  A line whose token cannot be filled hides itself (same rule as `fillCopy` in marketing copy).
- No invented facts: no delivery promises, no "most popular", no ratings, no savings claims.

All customer copy in this spec goes into `src/content/marketing.ts` under a new `BOOK_PACKAGES`
export (and `DESIGN_THEMES`), not inline in components.

---

## 0. Tokens used in copy

| Token | Meaning | Source |
|---|---|---|
| `{packagePrice}` | Flat package price, formatted ("$24.00") | `book_packages.price_cents` via `formatCredits` |
| `{bindingName}` | Customer binding name: "Stapled booklet", "Spiral bound", "Paperback" | `BOOK_BINDINGS[id].shortLabel` |
| `{bindingNameLower}` | Same, lower case, for mid-sentence use | same |
| `{includedPhotos}` | Photo pages in the package (N) | `book_packages.included_photos` |
| `{editsEach}` | Free touch-ups per included page (E) | `book_packages.edits_per_photo` |
| `{photosUsed}` | Included photos used so far | `AlbumPurchaseCode.pagesUsed` (+ included photos queued, see 6.1) |
| `{photosLeft}` | `{includedPhotos} - {photosUsed}`, never below 0 | computed |
| `{touchUpsLeft}` | Free touch-ups left on one page | `editsPerPage - editCount` for that photo |
| `{pagePrice}` | Wallet price of one extra page | `sheetUsageCostCents(prices, "generation")` |
| `{editPrice}` | Wallet price of one extra touch-up | `sheetUsageCostCents(prices, "edit", MAX)` |
| `{extraCount}`, `{includedCount}`, `{pickedCount}` | Counts in the upload split (6.3) | computed |
| `{extraTotal}` | `{extraCount} x {pagePrice}` | computed |
| `{balance}` | Wallet balance | `user.creditsBalanceCents` |
| `{balanceAfter}` | Balance minus package price | computed |
| `{shipping}` | Shipping for the chosen speed | order quote |
| `{shippingTax}` | Sales tax on shipping (and on extras) | order quote |
| `{extraPrint}` | Print cost of pages past the package | order quote, `total - covered - shipping - tax` |
| `{due}` | What the book order will charge the wallet | `order.dueCents` |
| `{minPages}`, `{maxPages}` | Binding page limits | `bookBindings.ts` |

Formatting: money always via `formatCredits`. Counts use the singular form at 1 ("1 photo",
"1 touch-up"). Every count sentence below has a singular variant where it matters; write a tiny
`plural(n, "photo", "photos")` helper rather than branching in JSX.

---

## 1. Visual language: included vs extra

One pair of treatments, used on every screen in this feature (wizard, studio, edit chat, order
panel). It extends what `AlbumCodeBanner`, `BookBindingPicker` and the edit chat already do for
purchase codes, so package albums and code albums look the same.

| | Included (paid by the package) | Extra (paid from credit) |
|---|---|---|
| Meaning | Nothing more to pay | Costs `{pagePrice}` / `{editPrice}` / `{extraPrint}` from credit |
| Chip | `IncludedChip`: `bg-v2-success-bg border border-v2-success-border text-v2-success-text`, `Check` icon 14px, text "Included" | `ExtraChip`: `bg-amber-50 border border-amber-200 text-amber-900`, `Coins` icon 14px, text "{price} extra" |
| Inline price text | `text-v2-success-text font-semibold` "Included" | `text-v2-ink font-semibold` "{price} extra" (the amount is ink, not colored) |
| Notice box | none needed (calm), or `text-v2-muted` line with `Sparkles` in `text-v2-primary` | `rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-amber-900`, `Coins` icon (exactly the edit chat's `tone: "cost"` box) |
| Buttons | Normal `v2-btn-primary` / `v2-btn-outline` with no price | Same button classes, label carries the price ("... · {pagePrice} each from your credit"). Never a red or danger button |
| Meter | `bg-v2-primary` fill on `bg-white` track | When the package is used up: full violet bar, plus the amber notice line under it |

Rules:

- Never use red (`text-red-*`, `danger` modal tone) for anything about extras. Red stays for
  errors and deletes only.
- The word "extra" always appears next to an extra amount, and "from your credit" appears at
  least once on any screen where an extra can be confirmed.
- "Included" never appears without the thing it refers to being free right now.
- Build the two chips once as `src/components/v2/book-packages/AllowanceChips.tsx`
  (`IncludedChip`, `ExtraChip`) and use them everywhere below. Text is 13px (`text-xs`) bold,
  `rounded-full px-2 py-0.5`, `inline-flex items-center gap-1`, never smaller than 12px.

---

## 2. Flow overview

### 2.1 Entry points

| Where | Today | After this change |
|---|---|---|
| `/home` "New album" tile (`V2HomeStudio.createAlbum`) | Creates "Album N", opens it | Goes to `/studio/new` (no album is created yet) |
| Album switcher "New album" (`AlbumSwitcherPanel.onCreate` via `V2ProjectSwitcher`) | Creates album, switches to it | Signed in: goes to `/studio/new`. Guest: goes to `/studio/new` too (tiles are visible to guests; the gate comes at Pay) |
| `StudioEmptyAlbum` ("New album" landing) | Shown for any empty album | Unchanged for pay-as-you-go albums. Package albums get the package variant (screen 5) |
| Marketing "Try a free coloring page" | `/studio?intent=...` | **Unchanged.** The free first page stays the first thing a guest from an ad does. Packages are offered later (6.8) |
| "Turn this into a book" card, Make a book | Order panel | Unchanged for pay-as-you-go albums |

Flag: ship the new entry behind `BOOK_PACKAGES_ENABLED` (feature switch in
`src/lib/auth/features.ts`). When off, or when the server returns zero active priced packages,
every "New album" keeps today's behavior and `/studio/new` redirects to "Just make pages".

### 2.2 Paths

```
Signed in
  New album ─► /studio/new  [1 Book] ─┬─ Just make pages ─► creates album ─► /studio?project={id} (today's landing)
                                      └─ tile ─► [2 Pay] ─┬─ card ─► Stripe Checkout ─► /studio/new?step=paid&session_id=…
                                                          │                                  └─► [3 Theme]
                                                          └─ credit ─► (one request) ─► [3 Theme]
  [3 Theme] ─ Save / Skip ─► /studio?project={id}  [4 Photos] (package empty-album landing) ─► album studio

Guest
  New album ─► /studio/new [1 Book] ─ tile ─► [2 Pay] shows V2GuestGate
     ─► /sign-up?next=/studio/new?book={bindingId}&step=pay  (or /sign-in?next=…)
     ─► back at [2 Pay] with the same book chosen, signed in now
     Guest albums move into the account as today (cm_migrate_after_signup) but are NOT put into the package.
  Guest "Just make pages" ─► today's local createProject, unchanged
```

### 2.3 Keeping the choice

- The chosen binding lives in the URL (`?book=coil_bound&step=pay`), so it survives sign-up,
  email confirmation in the same browser, reload and the phone Back button.
- Also write it to `sessionStorage` `cm_package_choice` (`{ bindingId, at }`) so a confirmation
  email opened in a new tab of the same browser can restore it when `/studio/new` opens with no
  `book` param. Drop it after 24 hours or after a successful purchase.
- Every `next` value goes through `safeNextPath` (`src/lib/auth/nextPath.ts`). `bindingId` from the
  URL is validated against the server's package list; an unknown value falls back to step 1.

### 2.4 Return from Stripe

Stripe success URL: `/studio/new?step=paid&session_id={CHECKOUT_SESSION_ID}`.
Cancel URL: `/studio/new?book={bindingId}&step=pay&package=canceled`.
Screen 3 handles both. The confirm call is idempotent on the session id; the page may call it any
number of times.

### 2.5 Resuming an unfinished wizard

| Left at | What happens when they come back |
|---|---|
| Step 1 or 2 (nothing paid) | Nothing is saved server side. `/studio/new` opens on step 1, or on step 2 if `cm_package_choice` is set. No nagging card anywhere |
| Stripe page, closed the tab after paying | The webhook creates the album. It appears in `/home` albums and the switcher with the package meter. Opening it shows screen 5 (the package landing), which also offers the theme |
| Step 3 (paid, theme not saved) | Same: the album exists. The package landing (screen 5) shows the theme row "No theme yet · Add a theme" so the step is never lost |
| Step 4 (paid, no photos yet) | Album opens on screen 5 |

`/home` additionally shows the existing "Continue" card pattern for a package album with zero
photos: title "Your {bindingNameLower} is ready to fill", button "Add photos". Uses the same card
component as "Continue your book".

---

## 3. Route and step structure

- New route: `src/app/(studio)/studio/new/page.tsx` (client component inside the studio frame,
  `V2StudioFrame`), public (add to `src/lib/marketing/routes.ts` only as an app route, not to the
  sitemap; `noindex`).
- Components: `src/components/v2/book-packages/` with `NewAlbumWizard.tsx` (reads `step`),
  `PackageTiles.tsx`, `PackagePay.tsx`, `PackageReturn.tsx`, `ThemeStep.tsx`, `WizardProgress.tsx`,
  `AllowanceChips.tsx`, `PackageMeter.tsx`, `ExtraPhotosConfirm.tsx`, `PackagePriceSummary.tsx`.

### 3.1 Steps

| # | `step` param | Progress label | Screen | Back goes to |
|---|---|---|---|---|
| 1 | (none) or `book` | Book | Choose your book | Where they came from (`router.back()`, or `/home` if no history) |
| 2 | `pay` | Pay | Package summary and pay | Step 1 |
| - | `paid` | (Pay, working) | Payment return | not shown: `replace`d by step 3 |
| 3 | `theme` (`&album={id}`) | Theme | Design theme | No Back. "Skip for now" instead (they have paid; going back to Pay would confuse) |
| 4 | studio `/studio?project={id}` | Photos | Package landing (screen 5) | Studio's normal Back |

"Just make pages" is not a step. It leaves the wizard.

### 3.2 Progress indicator

`WizardProgress`: four labeled segments in one row, used on steps 1 to 3 and on screen 5 (while
the package album has no photos).

```
 375px                                     desktop (max-w-2xl, centered)
 Step 2 of 4 · Pay                          ● Book ── ● Pay ── ○ Theme ── ○ Photos
 ████████████░░░░░░░░░░░░                   (done = violet dot with Check, current = violet ring,
                                             todo = gray ring; labels text-xs under each dot)
```

- Phone (<640px): text line "Step {n} of 4 · {label}" (`text-xs font-semibold text-v2-muted`)
  above a 4-segment bar (`h-1.5 rounded-full`, done/current `bg-v2-primary`, todo `bg-gray-200`,
  2px gaps).
- `sm` and up: dots with labels.
- Markup: `<nav aria-label="Steps"><ol>`; current item `aria-current="step"`; done items have
  `sr-only` "done". Segments are not buttons (no jumping ahead; paid steps cannot be revisited).

### 3.3 Back behavior

- Steps 1 to 2 use `router.push` so the phone Back button walks back one step. The on-screen Back
  link ("Back", `ChevronLeft`, `v2-hit`, top left of the step, 44px target) does the same.
- Leaving for Stripe is a normal navigation. Stripe's own back returns to step 2 (cancel URL).
- After payment succeeds, enter step 3 with `router.replace`, so phone Back from Theme does not
  reopen Pay or the Stripe page. Phone Back from Theme leaves to the page before the wizard; the
  theme is simply skipped (it can be set later, screen 8).
- Step 3 to 4 uses `router.replace` too, so Back from the album does not return to the Theme step.
- A Back press while a payment request is in flight (credit path) is ignored by disabling the
  button; the phone Back button is allowed and the request still completes server side (the album
  then shows up in their albums).

---

## 4. Screen specs

### Screen 1: Choose your book (`step=book`)

**Purpose:** pick a package or leave for pay-as-you-go.

**Layout**

```
375px                                   Desktop (max-w-5xl)
┌───────────────────────────────┐        ┌──────────────────────────────────────────────────────┐
│ < Back                        │        │ < Back                     ● Book ─ ○ Pay ─ ○ ─ ○     │
│ Step 1 of 4 · Book            │        │                                                      │
│ ████░░░░░░░░░░░░              │        │        Start with the book                           │
│                               │        │   Pick a book, pay once, then fill it with photos.   │
│ Start with the book           │        │                                                      │
│ Pick a book, pay once, then   │        │ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐   │
│ fill it with photos.          │        │ │ [photo 4:3]  │ │ [photo 4:3]  │ │ [photo 4:3]  │   │
│                               │        │ │ Stapled      │ │ Spiral bound │ │ Paperback    │   │
│ ┌───────────────────────────┐ │        │ │ booklet      │ │              │ │              │   │
│ │ [binding photo, 16:9]     │ │        │ │ 20 photos    │ │ 30 photos    │ │ 40 photos    │   │
│ │ Stapled booklet  {price}  │ │        │ │ 2 free touch-│ │ ...          │ │ ...          │   │
│ │ ✓ 20 photos               │ │        │ │ ups each     │ │              │ │              │   │
│ │ ✓ 2 free touch-ups each   │ │        │ │ Printed book │ │              │ │              │   │
│ │ ✓ The printed book        │ │        │ │ {price}      │ │              │ │              │   │
│ │ Shipping added at checkout│ │        │ │ Shipping ... │ │              │ │              │   │
│ │ [ Choose Stapled booklet ]│ │        │ │ [Choose ...] │ │ [Choose ...] │ │ [Choose ...] │   │
│ └───────────────────────────┘ │        │ └──────────────┘ └──────────────┘ └──────────────┘   │
│ ┌ Spiral bound ... ─────────┐ │        │                                                      │
│ ┌ Paperback ... ────────────┐ │        │ ─────────────── or ───────────────                   │
│                               │        │ Just make pages                                       │
│ ──────────── or ────────────  │        │ Start an album and pay for each page as you go.      │
│ Just make pages               │        │ [ Just make pages ]  (v2-btn-outline)                │
│ Start an album and pay for    │        └──────────────────────────────────────────────────────┘
│ each page as you go.          │
│ [ Just make pages ]           │
└───────────────────────────────┘
```

- Phone: one column, tiles full width, `gap-4`, page padding 16px (`px-4`). At 320px nothing
  scrolls sideways: tile photo is `w-full aspect-[16/9] object-cover`.
- `sm` (640+): two columns. `lg` (1024+): one row of up to 3 tiles (`grid-cols-3`). If only one or
  two packages are active, tiles keep their 1/3 width and the row is centered.
- Each tile: `v2-panel` (overflow-hidden), photo from `BINDING_PHOTOS[bindingId]` (alt from the
  same object), body `p-4`. The whole tile is not a link; the "Choose" button is the action (one
  clear target per tile, simpler for screen readers).
- Tile order: `sort_order` from the server. No "Most popular" or "Best value" badge (no data backs
  it).

**Copy**

| Element | Text |
|---|---|
| Page title (`h1`, `v2-brand-title text-2xl sm:text-3xl`) | Start with the book |
| Subtitle (`text-v2-muted`) | Pick a book, pay once, then fill it with photos. |
| Tile name (`h2 text-lg font-bold`) | {bindingName} |
| Tile price (right of name, `text-lg font-bold tabular-nums`) | {packagePrice} |
| Line 1 (`Check` icon, `text-v2-success-text` icon, ink text) | {includedPhotos} photos, each made into a coloring page |
| Line 2 | {editsEach} free touch-ups on each page |
| Line 3 | The printed {bindingNameLower} |
| Small print (`text-xs text-v2-muted`, `Truck` icon) | Shipping is added when you order the book. |
| Button (`v2-btn-primary w-full min-h-11`) | Choose {bindingName} |
| Divider | or |
| Alt heading (`h2 text-base font-semibold`) | Just make pages |
| Alt line (`text-sm text-v2-muted`) | Start an album and pay for each page as you go. |
| Alt line, signed in, `{pagePrice}` known | Start an album and pay for each page as you go. Each page uses {pagePrice} of your credit. |
| Alt line, guest | Start an album and try a free coloring page. |
| Alt button (`v2-btn-outline min-h-11`) | Just make pages |

Line 1 for a package whose binding is stapled can additionally show (`text-xs text-v2-muted`)
"Each photo gets its own page, back left blank." on all tiles, once, under the tiles rather than
per tile: "Each photo prints on its own page with a blank back, so it's easy to color."

**Behavior**

- Choose: `router.push("/studio/new?book={bindingId}&step=pay")`, fire `package_selected`.
- Just make pages: signed in, call the existing `library.createProject(defaultName)` then
  `router.replace(albumHref(id))`; guest, call the studio's local `createProject` then
  `router.replace("/studio")`. Button shows `Loader2` and is disabled while creating. Fire
  `album_started { mode: "pages" }`.

**States**

| State | Shows |
|---|---|
| Loading packages | 3 tile skeletons (`v2-panel` with `bg-v2-bg-subtle animate-pulse` blocks for photo, two lines, button). `aria-busy="true"` on the list. "Just make pages" is shown and usable at once |
| Zero packages returned | Redirect straight to "Just make pages" behavior (no empty screen) |
| Load error | `v2-panel p-4`: "We couldn't load the books just now." + `v2-btn-outline` "Try again". "Just make pages" stays usable below |
| `{pagePrice}` unknown | The alt line without its second sentence |

**Accessibility**

- `h1` once; each tile is an `article` with `aria-labelledby` its name.
- The Choose button has `aria-describedby` pointing at the tile's price and lines, so a screen
  reader hears "Choose Stapled booklet, $X, 20 photos ...".
- Focus starts on the `h1` (`tabIndex={-1}`) on mount so the step change is announced.
- Images `alt=""` (decorative, the name is text).

---

### Screen 2: Package summary and pay (`step=pay&book={id}`)

**Layout**

```
375px                                        Desktop (max-w-xl, centered, v2-panel p-8)
┌───────────────────────────────┐
│ < Back      Step 2 of 4 · Pay │
│ ██████████░░░░░░              │
│ [binding photo, small 72x72]  │
│ Your Spiral bound             │
│ {packagePrice}                │
│                               │
│ What's included               │
│ ✓ 30 photos made into pages   │
│ ✓ 2 free touch-ups each       │
│ ✓ Printing your spiral bound  │
│                               │
│ Not included                  │
│ • Shipping, added when you    │
│   order the book              │
│ • Photos past 30: {pagePrice} │
│   each from your credit       │
│ • More touch-ups: {editPrice} │
│   each from your credit       │
│                               │
│ How would you like to pay?    │  (only when balance covers the price)
│ (•) My credit  {balance}      │
│     You'll have {balanceAfter}│
│     left.                     │
│ ( ) Card                      │
│                               │
│ [ Pay {packagePrice} from my  │
│   credit ]                    │
│ This is a one-time payment    │
│ for this album's book.        │
└───────────────────────────────┘
```

- Phone: content in a single column, the primary button sticks to the bottom of the viewport
  (`sticky bottom-0` bar, `bg-white/95 border-t px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]`)
  so it is reachable with a thumb.
- Desktop: one `v2-panel` (`max-w-xl mx-auto p-8`), button inside the panel, not sticky.
- Reuse: `v2-panel`, `v2-btn-primary`, the radio card style from `BlankBacksOption`
  (bordered row, `min-h-14`, checked = `border-v2-primary bg-v2-primary-light/40`).

**Copy**

| Element | Text |
|---|---|
| Title (`h1`) | Your {bindingName} |
| Price (`text-2xl font-bold tabular-nums`) | {packagePrice} |
| Section heading | What's included |
| Included 1 | {includedPhotos} photos made into coloring pages |
| Included 2 | {editsEach} free touch-ups on each of those pages |
| Included 3 | Printing your {bindingNameLower}, up to {includedPhotos} photos |
| Section heading | Not included |
| Not included 1 (`Truck` icon) | Shipping. You'll see the price when you order the book. |
| Not included 2 (`Coins` icon), `{pagePrice}` known | Photos past {includedPhotos}: {pagePrice} each from your credit |
| Not included 3 (`Coins` icon), `{editPrice}` known | More touch-ups on a page: {editPrice} each from your credit |
| Note under the lists (`text-xs text-v2-muted`) | This package belongs to one album. It can't be used for another album. |
| Pay heading (credit covers price) | How would you like to pay? |
| Option credit | My credit · {balance} |
| Option credit sub | You'll have {balanceAfter} left for extras. |
| Option card | Card |
| Option card sub | Pay securely with Stripe. Your credit stays as it is. |
| Button, credit selected | Pay {packagePrice} from my credit |
| Button, card (or credit does not cover) | Pay {packagePrice} by card |
| Under the button (`text-xs text-v2-muted text-center`) | One payment for this album's book. You'll see what's left of it as you go. |
| Credit does not cover, balance > 0 (`text-xs text-v2-muted`, under the button) | Your credit ({balance}) stays for extras. |

Default selection: "My credit" is preselected when `{balance} >= {packagePrice}` (no card form, one
tap). When the balance does not cover the full price, no choice is shown at all: the only button is
"Pay {packagePrice} by card". There is no split payment.

**Guest version** (not signed in): the summary (title, price, included, not included) is shown
the same, and the pay area is replaced by `V2GuestGate` (already used for the book), embedded
under the summary instead of in a separate page:

| Prop | Value |
|---|---|
| `icon` | `BookOpen` |
| `title` | Create a free account to get your book |
| `body` | Your book and its photos are kept in your account, so you can fill it on any device. |
| `creditLine` | (omit: the sign-up gift is wallet credit and would muddle the package price) |
| `primary` | "Create free account" → `/sign-up?next=` + encoded `/studio/new?book={id}&step=pay` |
| `secondary` | "I already have an account" → `/sign-in?next=` + same |
| `onClick` (both) | `requestMigrationAfterSignup()` (as the book gate does) + write `cm_package_choice` |

**Behavior**

- Credit: POST `/api/book-packages/buy` `{ bindingId, method: "credit" }`. Button shows
  `Loader2` + "Paying…", disabled, Back disabled. On success `router.replace` to
  `/studio/new?step=theme&album={id}` with a toast (`useV2Toast().success`): title "Your book is
  ready", message "{includedPhotos} photos and the printing are paid for."
- Card: POST `/api/book-packages/checkout` `{ bindingId }`, then `window.location.assign(url)`.
  Button shows "Opening secure payment…". Fire `package_pay_started { method }` before the request.
- The price shown is the server's at load; the server re-checks. If it changed, the server answers
  409 with the new price; show the error state below and reload the summary.

**States**

| State | Shows |
|---|---|
| Loading | Summary skeleton; button disabled with "Loading…" |
| `book` param unknown / package hidden since | Back to step 1 with toast info "That book isn't available right now. Please pick another." |
| Price changed (409) | Inline `rounded-xl bg-amber-50 border-amber-200 text-amber-900 p-3` box above the button: "The price of this book changed to {packagePrice}. Please check it before you pay." Button re-enabled with the new price |
| Credit 402 (balance dropped meanwhile) | Switch selection to Card, inline note "Your credit no longer covers this. You can pay by card." |
| Network / 500 | Inline `role="alert"` under the button: "That didn't go through, and you weren't charged. Please try again." |

**Accessibility**

- Radio choice is a real `fieldset` + `legend` ("How would you like to pay?") with
  `input type="radio"`, each row a `label` with `min-h-14`.
- Included/not included are two `ul` lists under `h2` headings.
- The sticky bar must not cover the last line: add bottom padding to the scroll area equal to the
  bar height.

---

### Screen 3: Payment return (`step=paid&session_id=…`, or `package=canceled`)

Centered single panel (`v2-panel max-w-md mx-auto p-6 sm:p-8 text-center`), same at 375px and
desktop. Progress shows "Step 2 of 4 · Pay". Region `role="status" aria-live="polite"`.

| State | Trigger | Icon | Title | Body | Actions |
|---|---|---|---|---|---|
| Confirming | Page opens with `session_id`; POST `/api/book-packages/confirm` | `Loader2` spinning in violet circle | Confirming your payment | This takes a few seconds. | none |
| Success | Confirm returns the album | `Check` in `bg-v2-success-bg text-v2-success-text` circle | Your book is paid for | {includedPhotos} photos and the printing of your {bindingNameLower} are ready to use. | Auto-continue to Theme after 1.2s (`router.replace`); also a `v2-btn-primary` "Continue" for people who want to tap. `prefers-reduced-motion`: no auto-continue, button only |
| Pending | Confirm says Stripe has not finished (status `pending`); poll confirm every 3s, up to 10 times | `Clock` in violet circle | Still confirming your payment | Your bank is taking a moment. You can wait here, or leave: your book will show up in your albums as soon as it's confirmed. | `v2-btn-outline` "Go to my albums" (`/home`). Keeps polling while open |
| Pending, gave up (after 10 polls) | | `Clock` | We're still waiting on your bank | Your book will show up in your albums once the payment is confirmed. If it doesn't, write to us at {email}. | "Go to my albums", "Check again" |
| Canceled | `package=canceled` param | `Info` in gray circle | Payment canceled | No charge was made. Your book choice is kept. | Renders as step 2 (the pay screen) with this as a dismissible `bg-v2-bg-subtle` note at the top, not a separate screen |
| Failure | Confirm returns `failed` / Stripe session expired / unpaid | `AlertCircle` in `bg-amber-50 text-amber-900` circle (not red) | That payment didn't go through | You weren't charged. You can try again with another card or your credit. | `v2-btn-primary` "Try again" → step 2 with the same book; text link "Pick another book" → step 1 |
| Already used | Confirm finds this session already turned into a package (second visit, reload) | same as Success | Your book is paid for | (same as Success) | "Open my album" → `/studio?project={id}` (skips theme on repeat visits only if the album already has a theme) |

Rules: the URL params are removed with `history.replaceState` once read (as
`useCreditCheckoutReturn` does), so reload does not re-run the cancel note. Confirm is idempotent
server side; the client may call it again safely. Do not use the generic credit toast
("credit added"): no credit was added.

---

### Screen 4: Design theme (`step=theme&album={id}`)

**Layout**

```
375px                                       Desktop (max-w-2xl, v2-panel p-8)
┌───────────────────────────────┐
│ Step 3 of 4 · Theme           │
│ ████████████████░░░░          │
│ Pick a world for your pages   │
│ Optional. Every page in this  │
│ album is drawn in it, and     │
│ everyone still looks like     │
│ themselves.                   │
│                               │
│ [example photo] → [example pg]│  (only if a real static pair exists; else nothing)
│                               │
│ Your theme                    │
│ ┌───────────────────────────┐ │
│ │ We're superheroes saving  │ │  textarea, 3 rows
│ │ the city                  │ │
│ └───────────────────────────┘ │
│                      162/200  │  (from 160 chars on)
│ Ideas                         │
│ (Superheroes saving the city) │  chips wrap, 44px tall
│ (Toy brick town) (Under the   │
│ sea) (Space explorers) ...    │
│                               │
│ [ Use this theme ]            │  sticky bottom bar on phones
│   Skip for now                │
└───────────────────────────────┘
```

- Input: `textarea.v2-input` (3 rows, `text-base` on phones so iOS does not zoom), `maxLength=200`.
- Chips: buttons, `rounded-full border border-v2-primary/25 bg-white px-4 min-h-11 text-sm
  font-semibold text-v2-link`, selected look (`bg-v2-primary-light border-v2-primary`) when the
  textarea text equals that chip's text. Same "fill, don't send" rule as the edit chat chips.
- Example pair: a static marketing image pair only (add to `src/content/marketing.ts` as
  `THEME_EXAMPLE` with `src`, `alt`, both images; `null` hides the row). Never a generated
  example made for this screen.

**Copy**

| Element | Text |
|---|---|
| Title | Pick a world for your pages |
| Subtitle | Optional. Every page in this album is drawn in this world, and everyone still looks like themselves. |
| Example caption (if shown) | A beach photo, drawn as "Under the sea" |
| Label (visible) | Your theme |
| Placeholder | For example: we're all space explorers |
| Help text (`text-xs text-v2-muted`, `aria-describedby`) | A few words is plenty. You can change it later in album settings. |
| Counter (from 160 chars) | {count}/200 |
| Chips label | Ideas |
| Chips | Superheroes saving the city · Toy brick town · Under the sea · Space explorers · Fairy tale castle · Dinosaur safari |
| Primary button (text not empty) | Use this theme |
| Primary button (text empty) | Continue without a theme |
| Secondary (text link, `min-h-11`) | Skip for now |
| Saving | Saving… |
| Saved toast | Theme saved. Your pages will be drawn in it. |

When the textarea is empty, the primary button becomes "Continue without a theme" and "Skip for
now" is hidden (one action, not two that do the same thing).

**Behavior**

- Chip tap: sets the textarea value to the chip text, moves focus to the textarea with the caret
  at the end, does not submit. Fire nothing (selection is reported on save).
- Save: PATCH `/api/library/projects/{id}` `{ designTheme }` (trimmed). Then `router.replace`
  to `/studio?project={id}`. Fire `theme_set { source: "starter" | "typed" | "starter_edited", starter_id? }`.
- Skip / empty continue: no request. `router.replace` to the album. Fire `theme_skipped { where: "wizard" }`.

**States**

| State | Shows |
|---|---|
| Over 200 (paste) | Prevented by `maxLength`; counter shows 200/200 |
| Server rejects as unsafe (`THEME_NOT_ALLOWED`) | Under the box, `role="alert"`, amber box (1): "That theme won't work for a family coloring book. Try something like “Under the sea” or “Space explorers”." Text stays in the box for editing. Focus moves to the textarea |
| Server rejects length (should not happen) | "Please keep it under 200 characters." |
| Save fails (network) | `role="alert"`: "We couldn't save your theme. Try again, or skip and add it later." Both buttons stay usable |
| Album missing / not theirs | Redirect to `/home` with toast "We couldn't find that album." |

Brand names: no message. The server/prompt turns them into look-alike descriptions silently; the
customer's text is stored as typed.

**Accessibility**

- Visible `label` tied to the textarea; help text and counter linked with `aria-describedby`;
  counter is `aria-live="polite"` only once it appears.
- Chips are in a `div role="group" aria-label="Theme ideas"`, each a `button type="button"` with
  `aria-pressed` when it matches.
- Sticky button bar on phones as in screen 2.

---

### Screen 5: Upload first photos (package variant of `StudioEmptyAlbum`)

The album is created at payment, so this is the real studio (`/studio?project={id}`), showing
`StudioEmptyAlbum` with a new `pkg` prop. Shown while the package album has zero photos. The
existing name field, suggestions, dropzone, example pair and tips stay.

**Changes to `StudioEmptyAlbum` when `pkg` is set**

```
375px
┌───────────────────────────────┐
│ Step 4 of 4 · Photos          │   WizardProgress
│ ████████████████████████      │
│ Name your album ___________   │   (existing)
│ (Family favorites) (Our trip) │   (existing suggestions)
│                               │
│ ┌ IncludedChip ─────────────┐ │
│ │ ✓ 30 photos included      │ │   new: package line
│ │ Spiral bound · 2 free     │ │
│ │ touch-ups each            │ │
│ └───────────────────────────┘ │
│ Theme: Under the sea  Change  │   new: theme row
│                               │
│ Add your first photos         │   (existing drop title)
│ Pick up to 30. Each becomes a │   new line
│ coloring page.                │
│ [ Choose photos ]             │   (existing button)
└───────────────────────────────┘
```

Desktop: same content in the existing two-column landing (left column), the example pair stays
on the right.

| Element | Text |
|---|---|
| Package line (with `IncludedChip` style box, `rounded-xl p-3`) | {includedPhotos} photos included |
| Package sub | {bindingName} · {editsEach} free touch-ups on each page |
| Theme row, set | Theme: {theme} · button "Change" (opens screen 8's modal) |
| Theme row, not set | No theme yet · button "Add a theme" (opens screen 8's modal) |
| Line under drop title | Pick up to {photosLeft}. Each one becomes a coloring page, already paid for. |
| Size line (existing) | up to {size} each |

The theme text is shown truncated to one line (`truncate`, full text in `title` attribute).

**Behavior**

- Picking more files than `{photosLeft}`: the split confirm (6.3) opens before anything uploads.
- Package albums start making included pages automatically after upload (they are prepaid; the
  reason signed-in albums never auto-start, spending credit, does not apply). Only included
  photos auto-start; extra photos wait with a "Make page · {pagePrice} extra" action. This is
  open question Q4; if the owner says no, keep today's manual "Make all pages" button and label
  it "Make {n} pages · included".

**States:** the existing landing's upload progress (`UploadProgressBar`) and errors apply.
Loading the package (meter data) shows the landing without the package line; it fades in when
`useAlbumPurchaseCode` resolves. Never show "0 photos included" while loading.

---

### Screen 6: The album studio afterwards

#### 6.1 Allowance meter (`PackageMeter`, extends `AlbumCodeBanner`)

`AlbumCodeBanner` gains a `variant: "code" | "package"` (read from `code.source`). Package variant
copy and layout:

```
375px (collapsed by default after the first visit)          Desktop (full width above gallery)
┌───────────────────────────────┐   ┌───────────────────────────────────────────────────────────┐
│ [Book] Your spiral bound      │   │ [Book] Your spiral bound                12 of 30 photos used │
│ 12 of 30 photos used          │   │ ███████████░░░░░░░░░░░░░░░░░  18 left, already paid for.   │
│ ████████░░░░░░░░░░░           │   │ [1 ✓ Add photos] [2 · 12 of 30 pages made] [3 Order my book]│
│ 18 left, already paid for.    │   │ What your book includes ⌄                                  │
│ What your book includes ⌄     │   └───────────────────────────────────────────────────────────┘
└───────────────────────────────┘
```

| State | Main line | Sub line |
|---|---|---|
| Photos left | {photosUsed} of {includedPhotos} photos used | {photosLeft} left, already paid for. |
| Exactly 1 left | {photosUsed} of {includedPhotos} photos used | 1 left, already paid for. |
| All used | All {includedPhotos} photos used | Your book's photos are all in. Extra photos are {pagePrice} each from your credit. (amber notice style, section 1) |
| Book ordered | Book ordered | Your package paid for printing your {bindingNameLower}. + link "View order" |

- Title: "Your {bindingNameLower}" (replaces "Your {campaign} book"). No code string shown for
  packages (the customer never saw a code).
- Steps row (existing three steps) relabeled: "Add up to {includedPhotos} photos" / "{n} of
  {includedPhotos} pages made" / "Order my book".
- "What your book includes" disclosure, package lines:
  - {includedPhotos} photos made into coloring pages
  - {editsEach} free touch-ups on each of those pages
  - Printing your {bindingNameLower}
  - Not included: shipping, added when you order the book
  - Then the existing paragraph, reworded: "You can add more photos and touch-ups. Those come from
    your credit, never from your book, and always show their price first."
- Phone: the banner is collapsible to one line ("12 of 30 photos used" + thin bar) with a
  chevron, so it doesn't push the gallery off the first screen. Expanded by default on the first
  visit to the album (sessionStorage `cm_pkg_meter_seen_{albumId}`), collapsed after.
- `{photosUsed}` counts pages the server has charged to the package (`pagesUsed`) plus included
  photos queued or uploading in this tab, so the number moves the moment they pick photos.
- Progress bar: existing `role="progressbar"` with `aria-label="Included photos used"`,
  `aria-valuetext="{photosUsed} of {includedPhotos} photos used"`.

#### 6.2 Per-page touch-ups (gallery cards and editor)

On each `GalleryCard` of an included page, a small line under the card in `text-xs`:

| Touch-ups left | Text | Style |
|---|---|---|
| 2+ | {touchUpsLeft} free touch-ups left | `text-v2-muted`, `Sparkles` icon violet |
| 1 | 1 free touch-up left | same |
| 0 | Touch-ups used | `text-v2-muted` (no amber here: nothing is being charged yet) |
| Extra page (not included) | ExtraChip "Extra page" | amber chip |

On cards of extra pages there is no touch-ups line (they get the normal free-edit rule, see Q6).

#### 6.3 Upload: button and multi-file split

**Header button (`StudioHeader`)**

| Album state | Phone label (≥360px) | `sm`+ label | `aria-label` |
|---|---|---|---|
| Photos left | Add | Add photos | Add photos, {photosLeft} included left |
| All used | Add extra | Add extra photos | Add extra photos, {pagePrice} each from your credit |

The header has no room for the full price on phones; the full sentence appears in `AddPhotosModal`
and in the meter. The button keeps `v2-btn-outline` in both states.

**`AddPhotosModal` (and `StudioEmptyAlbum` dropzone) in a package album**

| Album state | Modal title | Description under title |
|---|---|---|
| Photos left | Add photos | {photosLeft} more photos are included in your book. |
| All used | Add extra photos | Your book's {includedPhotos} photos are all in. Extra photos are {pagePrice} each from your credit. Your book package isn't used. |

The "Choose photos" button inside reads "Choose photos" when photos are left, and
"Add extra photos · {pagePrice} each from your credit" when all are used.

**Split confirm (`ExtraPhotosConfirm`, a `V2Modal`, `tone="brand"`)**

Opens after the file picker returns when `{pickedCount} > {photosLeft}` and `{photosLeft} >= 0`.
Nothing uploads or charges before the person answers.

```
375px (bottom-aligned V2Modal, full width)
┌───────────────────────────────┐
│ You picked 8 photos           │
│ 5 are included in your book.  │
│ 3 are extra.                  │
│                               │
│ [t][t][t][t][t]  ✓ Included   │  thumbnails, first K in pick order
│ [t][t][t]        3 x $X extra │
│                               │
│ Extra photos: {extraTotal}    │
│ from your credit, charged as  │
│ each page is made. Your book  │
│ package isn't used for them.  │
│                               │
│ [ Add all 8 · {extraTotal}    │
│   extra ]                     │
│ [ Add only the 5 included ]   │
│   Cancel                      │
└───────────────────────────────┘
```

| Element | Text |
|---|---|
| Title | You picked {pickedCount} photos |
| Description | {includedCount} are included in your book. {extraCount} are extra. |
| Included row label | IncludedChip "Included" |
| Extra row label | ExtraChip "{pagePrice} extra each" |
| Note (amber notice style) | Extra photos cost {extraTotal} from your credit, charged as each page is made. Your book package isn't used for them. |
| Primary (`v2-btn-primary`) | Add all {pickedCount} · {extraTotal} extra |
| Secondary (`v2-btn-outline`) | Add only the {includedCount} included |
| Tertiary (text button) | Cancel |
| Variant: `{photosLeft} = 0` | Title "These photos are extra"; description "Your book's {includedPhotos} photos are all in. These {pickedCount} photos are {pagePrice} each from your credit."; buttons "Add {pickedCount} extra photos · {extraTotal}" and "Cancel" |
| Variant: wallet short for all extras | Under the note: "Your credit is {balance}. You can add credit after, when a page is made." Buttons unchanged (charging happens per page; a short wallet opens the add-credit modal then) |

- Which photos are included: the first `{photosLeft}` in the order the picker returned them
  (shown as thumbnails so the person can see which). Reordering inside this dialog is out of v1;
  "Add only the included" is the way out.
- `{includedCount}` = 0 is the variant row above. `{photosLeft}` is computed including in-flight
  uploads so two quick picks cannot both claim the same included slots.
- Thumbnails: `object-cover rounded-lg h-14 w-14`, max 10 shown per row then "+{n} more".
- Fire `package_extra_confirmed { kind: "photos", count: extraCount }` on primary; nothing on cancel.

#### 6.4 Edit (touch-up) send button (`V2SheetEditChat`)

The round icon send button stays (`h-10 w-10`, `aria-label="Send"`) while the page has free
touch-ups. When the next touch-up is extra, the button becomes a labeled pill so the price is on
the button itself:

| Page state | Send button | `costNotice` under the box |
|---|---|---|
| Included page, touch-ups left | Icon button, `aria-label="Send touch-up, included"` | tone `info`: "{touchUpsLeft} of {editsEach} free touch-ups left on this page." (1 left: "1 free touch-up left on this page. After that, {editPrice} each from your credit.") |
| Included page, touch-ups used | Pill `v2-btn-primary min-h-11 px-4`: "Touch up · {editPrice}" | tone `cost`: "This page's free touch-ups are used. Each touch-up from here is {editPrice} from your credit. Your book package isn't used." |
| Extra page (not included) | Pill: "Touch up · {editPrice}" | tone `cost`: "This is an extra page, so touch-ups are {editPrice} each from your credit." (only once the album's normal free edits, if any, are used; see Q6) |

- Pill label on phones that are narrow (<360px): "{editPrice}" with `Send` icon, full label in
  `aria-label` ("Send touch-up, {editPrice} from your credit").
- The textarea `placeholder` stays. The four suggestion chips stay (fill, don't send).
- Extend `SheetEditCostNotice` with an optional `buttonLabel` so the parent decides the pill text;
  the chat stays dumb.

#### 6.5 Add-credit modal when the wallet is short (402 `INSUFFICIENT_CREDITS`)

Reuse `V2AddCreditModal`. Add an optional prop `packageNote?: { bindingName: string; photosLeft: number }`
passed by `useSheetUsageCredits` when the open album has a package. Copy:

| Element | Text |
|---|---|
| Title | Add credit |
| Description (existing, kept) | Your credit covers {balance}. Add {shortfall} for {shortfallFor}, or add more for later. |
| `shortfallFor` values (package album) | "this extra page", "this extra touch-up", "these extra pages" |
| Package note (new, `rounded-xl bg-v2-success-bg border border-v2-success-border text-v2-success-text p-3 text-sm`, `ShieldCheck` icon), photos left > 0 | Your {bindingNameLower} package is untouched. Its {photosLeft} included photos and the printing are still saved for this album. |
| Package note, photos left = 0 | Your {bindingNameLower} package is untouched. The printing is still paid for. |
| Package note, book already ordered | (omit the note) |

The note sits between the description and `V2AddCreditForm`. Return path stays the studio album.
After the top-up returns, the existing credit toast shows; nothing about the package changes.

#### 6.6 Single-page "Make page" and "Make the rest" labels

Keep the existing `makeCost` / `restCostLabel` logic (already says "Included" / "{price} extra"
for code albums) and swap the wording for package albums:

- `restCostLabel`: "included in your book" (was "included with your code"); "{k} included,
  {total} extra" unchanged.
- Editor shape change and make-page cost: unchanged ("Included" / "{price} extra").

#### 6.7 Order button in the studio (`bookPriceLabel`)

Package album: "Printing included" when the only charge would be shipping and tax; otherwise
"{due} extra". Since shipping is not included, before an address is entered show
"Printing included · shipping at checkout".

#### 6.8 Offering a package to someone already making pages (light, v1)

On a pay-as-you-go album the existing "Turn this into a book" card is unchanged. No package
upsell inside an existing album in v1 (moving an album onto a package is out of scope).

---

### Screen 7: Order wizard changes (`BookOrderPanel`)

**Format row**

- `BookBindingPicker` already accepts `includedId`; pass the package binding. The package
  binding shows "Included" and "Printing paid by your package" (replaces "Paid by your code" for
  packages: add a `includedNote` prop).
- Row summary when on the package binding: "{bindingName} · {n} pages · blank backs · included".
- `BlankBacksOption` in a package album: "Blank backs" is on and the off option is disabled with
  the note "Blank backs come with your package, so each photo has its own page." Lined backs, if
  `backsIncluded`, stay available.

**Switching binding warning**

Tapping another binding does not switch at once. It opens a `V2Modal` (`tone="brand"`, not
danger):

| Element | Text |
|---|---|
| Title | Switch to {otherBindingName}? |
| Body | Your package pays for printing a {bindingNameLower}. If you switch, it won't pay toward printing this book, and the full printing price of {otherPrintPrice} comes from your credit. |
| Body 2 | Your included photos and touch-ups are not affected. You can switch back any time before you order. |
| Primary | Keep my {bindingNameLower} |
| Secondary (`v2-btn-outline`) | Switch to {otherBindingName} |

`{otherPrintPrice}` comes from `order.formatPrices`; if not loaded the sentence ends at "comes
from your credit." The PDF ("Print at home") follows the same dialog with "{otherBindingName}" =
"Print at home".

**Price box (`PackagePriceSummary`, modeled on `CodePriceSummary`)**

```
┌──────────────────────────────────────┐
│ You pay                     {due}    │   (bg-white; bg-v2-success-bg only if due = 0)
│ Your package pays for printing. You  │
│ pay for shipping.                    │
│ ──────────────────────────────────── │
│ Printing ({n} pages)   Included ✓    │   green text
│ Extra pages (3)        {extraPrint}  │   only when > included; ink + "extra" chip
│ Shipping · Standard    {shipping}    │
│ Sales tax              {shippingTax} │
│ Total                  {due}         │
└──────────────────────────────────────┘
```

| Line | Text | When |
|---|---|---|
| Head | You pay · {due} | quote ready |
| Head sub (on package binding, no extras) | Your package pays for printing. You pay for shipping and its tax. | |
| Head sub (extra pages) | Your package pays for printing {includedPhotos} photos. The {k} extra pages and shipping come from your credit. | |
| Head sub (other binding) | You chose a {otherBindingNameLower}, so your package isn't paying toward printing. Switch back to your {bindingNameLower} to use it. (+ text button "Switch back") | |
| Printing | Printing: included by your package | package binding |
| Extra pages | Extra pages ({k}): {extraPrint} | content pages beyond included |
| Shipping, not chosen | Shipping: choose a speed | |
| Shipping | Shipping · {speed}: {shipping} | chosen |
| Tax | Sales tax: {shippingTax} | |
| Total | Total: {due} | |
| Under (existing wallet lines) | Paid from your credit. You have {balance}. / Your credit covers {balance}. You pay {shortfall}. | as today; the existing "Add $X and continue" top-up applies to shipping |
| Before address | Shipping and tax are estimated until the address is complete. | existing |

- Faster shipping: priced at its full price (no "included" speed for packages, unlike codes).
  `ShippingSpeedPicker` shows plain prices for package albums (pass no `includedLevel`).
- Loading: "Checking your price…" in place of the amounts, as today.
- After the order is placed the meter shows "Book ordered" (6.1).

---

### Screen 8: Album settings, theme field

There is no album settings screen today; album actions live in `AlbumSwitcherPanel`
(`ActionRow`: Rename, Share, Delete). Add one `ActionRow`:

- Icon `Palette`, label "Theme", trailing text the current theme truncated, or "None".
- Opens `V2Modal` (`eyebrow="Album theme"`, `title={albumName}`, `icon={<Palette />}`,
  `maxWidthClass="max-w-md"`). The same control is opened from screen 5's "Change" / "Add a theme".

```
375px (V2Modal)
┌───────────────────────────────┐
│ ALBUM THEME                   │
│ Our trip                      │
│ New pages in this album are   │
│ drawn in this world.          │
│ Your theme                    │
│ ┌───────────────────────────┐ │
│ │ Under the sea             │ │
│ └───────────────────────────┘ │
│ Ideas (chips, same as step 3) │
│ Pages you've already made     │
│ stay as they are.             │
│ [ Save theme ]                │
│   Remove theme                │
└───────────────────────────────┘
```

| Element | Text |
|---|---|
| Description | New pages in this album are drawn in this world. Everyone still looks like themselves. |
| Label / placeholder / counter / chips | Same as screen 4 |
| Note (`text-xs text-v2-muted`) | Pages you've already made stay as they are. |
| Primary | Save theme |
| Secondary text button (only when a theme is set) | Remove theme |
| Saved toast | Theme saved. New pages will use it. |
| Removed toast | Theme removed. New pages will look like your photos. |
| Unsafe rejection | Same as screen 4 |
| Shared album, not owner | Row hidden (only the owner sets the theme), same rule as rename |
| Guest (local album) | Row hidden (themes are signed-in only in v1) |

Fire `theme_set { source, where: "settings" }` / `theme_removed`. The theme text is never sent.
Focus returns to the "Theme" row on close (`V2Modal` handles it).

---

### Screen 9: Admin package editor (`/admin/pricing`, light spec)

Admin wording rules are looser (agent reference: leave admin wording alone), but still no hardcoded
prices.

- New section in `PricingStudio` after the price items, `id="packages"`, title "Book packages",
  using the same section and table components (`DataTable`) as the price list.
- Columns: Binding (shortLabel + id in mono), Included photos, Touch-ups each, Price, Status
  (Live / Hidden: no price / Off), Order, Edit.
- Edit opens `PriceEditorDrawer`-style drawer (`Drawer.tsx`) with fields:
  - Included photos (number, 1 to 400), Touch-ups per photo (0 to 10), Price in dollars (empty =
    hidden), Active (switch), Sort order (number).
  - Live check under photos: "Prints {2N} pages with blank backs (+ cover). {bindingName} allows
    {minPages} to {maxPages}." Shown red-free amber if out of range, and Save is disabled out of
    range.
  - Cost hint (read only): "Printing this book costs about {printCost}. Pages at the current page
    price would be {N x pagePrice}." So the owner can see margin; uses the existing quote helper.
  - Save writes, then the change appears in the existing price change log.
- Finance (`/admin/finance`): a "Book packages" tile with count and revenue for the selected
  period, split by binding. Light: reuse the existing tile component.

---

## 5. Analytics

All through `track()`; add to `TrackEventParams` in `src/lib/marketing/events.ts` and
`VENDOR_EVENT_NAMES`. Params are fixed enums or numbers. **Never the theme text, album name or
file names.** `format` uses the existing `TrackFormat` mapping (`trackFormat(bindingId)`).

| Event | Fires where | Params | Vendor mapping |
|---|---|---|---|
| `package_viewed` | Screen 1, once per mount, after tiles load | `count` (tiles shown), `signed_in`, `intent` | GA4 custom; Meta `ViewContent` (custom: false); TikTok `ViewContent` |
| `package_selected` | Screen 1 Choose tap | `format`, `value` (package price, dollars), `currency` | GA4 custom; Meta custom `PackageSelected` |
| `album_started` | "Just make pages" (and the package album creation, server side) | `mode`: `pages` \| `package` | GA4 custom only |
| `package_pay_started` | Screen 2 pay button tap | `format`, `value`, `currency`, `method`: `card` \| `credit` | GA4 `begin_checkout`; Meta `InitiateCheckout`; TikTok `InitiateCheckout` |
| `package_purchased` | Server, in the idempotent create (webhook or confirm, whichever wins), plus browser copy on screen 3 success guarded by `cm_package_tracked_{sessionId}` | `format`, `value`, `currency`, `method`, `package_id` (opaque id) | See Q8: GA4 `purchase` with `item_category=package`, or custom. Decide before shipping |
| `package_payment_canceled` | Screen 3 cancel param | `format` | GA4 custom |
| `package_payment_failed` | Screen 3 failure | `format`, `reason`: `declined` \| `expired` \| `unknown` | GA4 custom |
| `theme_set` | Screen 4 save, screen 8 save | `where`: `wizard` \| `settings`, `source`: `starter` \| `typed` \| `starter_edited`, `starter_id` (fixed id: `superheroes`, `toy_bricks`, `under_sea`, `space`, `fairy_castle`, `dinosaurs`; omitted when typed) | GA4 custom |
| `theme_skipped` | Screen 4 skip / empty continue | `where`: `wizard` | GA4 custom |
| `theme_removed` | Screen 8 | none | GA4 custom |
| `theme_rejected` | Screen 4/8 server rejection | `where` | GA4 custom |
| `package_extra_confirmed` | 6.3 primary, 6.4 first paid touch-up send on a page | `kind`: `photos` \| `touch_up`, `count` | GA4 custom |
| `package_binding_switched` | Screen 7 "Switch to" confirmed | `from`, `to` (TrackFormat) | GA4 custom |

`book_started`, `checkout_started` and `purchase` for the later book order keep firing as today;
their `value` is the wallet charge (shipping and extras), which is correct for that event.

---

## 6. Accessibility checklist (all screens)

- Every tap target ≥ 44px (`min-h-11`, or `v2-hit` / `v2-hit-y` for small visual targets).
- One `h1` per wizard step; focus moves to it on step change (`tabIndex={-1}`, `focus({ preventScroll: false })`).
- Prices and counts are text, never only color: "Included" and "extra" are words, the chips have
  icons and text.
- Amber notice text `text-amber-900` on `bg-amber-50` and success text on `bg-v2-success-bg` both
  pass AA; do not lighten them.
- All dialogs via `V2Modal` (focus trap, Esc closes only the top, focus returns).
- Live regions: payment return status (`role="status"`), meter count changes (`aria-live="polite"`
  on the main line only, not the bar), form errors (`role="alert"`).
- 320px: no horizontal scroll on any screen; long binding names wrap.
- `prefers-reduced-motion`: no auto-advance on payment success, no meter width animation.

---

## 7. Open questions for the owner

1. **Package sizes**: stapled 20 photos is yours. Spiral 30 and paperback 40 are proposals. Confirm
   or replace. (Paperback needs at least 16 photos with blank backs to reach its 32-page minimum.)
2. **Prices**: all three are empty, so no tile shows until you set them on `/admin/pricing`.
3. **Refunds**: refunds of an unused package are out of v1. What should support say if someone asks
   (for example before any page is made)? We need one sentence for the help text and `/terms`.
4. **Auto-make included pages**: in a package album, should included photos start their pages as
   soon as they upload (proposed), or wait for "Make all pages" as signed-in albums do today?
5. **Default pay method**: when credit covers the package, the spec preselects "My credit". Prefer
   card by default to keep credit for extras?
6. **Extra pages' touch-ups**: does a page past the package get the normal free edits from the
   price list, or none? (Spec assumes the normal rule.)
7. **Lined backs** with packages: allowed at no extra cost, as with codes?
8. **Analytics**: should `package_purchased` count as the ad platforms' Purchase (it is real
   revenue, but the book order later also fires Purchase for shipping)? Proposal: package is the
   Purchase; the later book order fires Purchase only when `value > 0`.
9. **Ad landing**: keep "Try a free coloring page" as the only marketing button (spec assumes yes),
   or add a "Pick your book" path from `/gift`?
10. **Theme example images**: do you have a real before/after pair (photo and themed page) we may
    show on the theme step? Without one the step shows no example.
