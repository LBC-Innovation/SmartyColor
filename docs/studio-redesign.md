# Studio redesign: one screen from photo to purchase

Status: design spec, v2 (2026-11-14), revised after a UX audit. **Section 12 overrides anything
earlier in this document that it contradicts.** Owner feedback is the source of truth; this document turns it
into a buildable design. Read `docs/agent-reference.md` first: its hard rules (no "AI" in copy, no
hardcoded prices, production database, stub generation in tests, vocabulary) all still apply.

## 1. Goal

A parent on a phone, arriving from an ad, should go from **photos → coloring pages → paid book** on
one screen, with as few decisions as possible, before they lose interest.

Today the path is: studio (side rail of photos + a big preview pane + layout toggle + toolbar) →
"Make a book" → a separate 5-step wizard at `/studio/order` (book, pages, cover, check, checkout)
→ order page. Too many screens, and the book is configured far from the pages it is made of.

New model:

```
/studio
┌──────────────────────────────── desktop ≥1024px ───────────────────────────────┐
│ Album ▾ "Gift book"   12 pages            [+ Add photos]  (●) Make pages as I add│
├───────────────────────────────────────────────┬─────────────────────────────────┤
│  GALLERY  (60%)                               │  YOUR BOOK  (40%, sticky)       │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐       │  ① Format    Spiral · 8.5×11  ✓ │
│  │  photo   │ │  photo   │ │  photo   │       │  ② Pages     12 pages        ✓ │
│  │     ┌───┐│ │     ┌───┐│ │  [Create]│       │  ③ Cover     "Grandma's…"   ✓ │
│  │  1  │pg ││ │  2  │pg ││ │  3       │       │  ④ Ship to   [address form]    │
│  └─────┴───┘┘ └─────┴───┘┘ └──────────┘       │  ─────────────────────────────  │
│  ...drag to reorder...                        │  Total $XX.XX                   │
│                                               │  [ Confirm and buy ]            │
└───────────────────────────────────────────────┴─────────────────────────────────┘
```

```
phone (<1024px)
┌──────────────────────┐
│ Album ▾      [+ Add] │
│ (●) Make pages as I  │
│     add · {pagePrice}│
│ ┌────────┐┌────────┐ │
│ │ photo  ││ photo  │ │   2-column gallery, full width
│ │   ┌──┐ ││   ┌──┐ │ │
│ │ 1 │pg│ ││ 2 │pg│ │ │
│ └───┴──┘┘└───┴──┘┘ │ │
│ ...                  │
├──────────────────────┤
│ 12 pages · $XX  [Make│   sticky book bar above the tab bar
│ my book ▲]           │   → opens the same wizard as a bottom sheet
└──────────────────────┘
```

## 2. What goes away

- The photo side rail (`V2PhotoLibraryList` inside `V2LibraryWorkspace`) on `/studio`.
- The layout toggle (`V2StudioLayoutToggle`), the big single-page preview pane, `V2StudioToolbar`,
  "Make all pages" as a separate action (replaced by per-card Create + the upload toggle + a
  "Make the rest" link, section 4.4).
- `/studio/order` as a destination. It becomes a redirect to `/studio` that keeps `?cart=` and
  `?step=review` working (saved carts, `/orders` "Finish and pay" links, Stripe return URLs).
  The wizard's logic moves into the order panel; do not delete the server APIs it calls.
- The separate "proof" step: proofing moves into the confirm modal (section 6).

Keep (reuse, do not rewrite): `V2StudioProvider` (state, persistence, cloud/guest modes),
`useV2PhotoIngest`, `useV2PhotoTransforms` (mirror), `V2SheetEditChat`, `V2PrintSheetModal`,
`V2SharePageModal`, `V2SheetRevisionStrip` (as the version strip in the editor),
`BookBindingPicker`, `BookShippingAddressForm`, `BookAddressSuggestion`, `BookCoverDesigner`,
`BookFlipThroughModal` / `BookProofStep` internals, `BookOrderPriceBar` maths, all of
`src/lib/print`, `src/lib/orders`, `api.*` order calls, `V2AddCreditModal`,
`V2GuestLimitModal`, `V2LibraryMigrationBanner`, `V2SavePromptCard`, `V2Modal`.

Story book (`/storybook`) still uses `V2LibraryWorkspace`; leave it alone.

## 3. Page header (both sizes)

One row above the gallery:

- **Album switcher**: the album name as a button with a chevron. Opens the existing
  `V2ProjectSwitcher` content in a popover (desktop) or bottom sheet (phone): switch, new album,
  rename, share album, delete album. This replaces the rail's switcher.
- **Page count**: "12 pages" (coloring pages that exist), muted.
- **Add photos** (primary button on an empty album, outline once there are photos).
- **Make pages as I add** toggle (section 4.5). On phones it sits on its own line under the header
  so the label and cost fit at 320px.

Drag-and-drop files anywhere on the gallery on desktop (reuse `V2UploadDropzone` behaviour).

## 4. Gallery (left 60% on desktop, full width on phones)

### 4.1 Grid

- CSS grid of cards. Phone: 2 columns, 12px gap, 16px side gutter. Tablet (640–1023): 3 columns.
  Desktop: `repeat(auto-fill, minmax(200px, 1fr))` inside the 60% column (usually 3 columns).
- Cards are portrait 3:4 (the page is 8.5×11), image `object-fit: cover` anchored with
  `photoThumbObjectPosition`.
- The gallery scrolls with the page on phones; on desktop the gallery column scrolls and the order
  panel is `position: sticky; top: <header height>` with its own scroll if taller than the viewport.

### 4.2 Card anatomy

```
┌────────────────────┐
│ ③          ⋮       │  page number badge (top-left), overflow menu (top-right, 44px hit)
│                    │
│      PHOTO         │  the uploaded photo, large
│                    │
│           ┌───────┐│
│           │ page  ││  inset tile: the coloring page, bottom-right,
│           │ thumb ││  ~45% card width, 3:4, white bg, 2px white border + shadow
└───────────┴───────┘┘
```

Inset tile states (this is what the owner calls the "lower quarter overlay"):

| State | Inset shows | Card tap |
|---|---|---|
| No page yet | White tile with a pencil icon and **Create** (button, 44px). Signed in: a second line "{pagePrice}". Guest: "Free". | Opens the editor on the photo with a large **Make coloring page** button. |
| Queued | Tile with "Waiting…" and a small clock | Opens editor (shows status) |
| Drawing | The existing drawing loader (`V2SheetGeneratingPlaceholder`, compact variant) | Opens editor (shows progress) |
| Failed | Tile with "Try again" (button) and a red dot | Opens editor with the error and retry |
| Ready | The coloring page thumbnail | Opens editor |
| Uploading (pending) | Whole card is a skeleton with a progress ring | Not tappable |

Tapping **Create** directly starts that one page (does not open the editor). The rest of the card
opens the editor (section 5).

Cards without a coloring page are **not in the book**. Show a small "Not in book yet" caption under
those cards so the page count in the order panel never surprises anyone.

### 4.3 Reorder

- dnd-kit `SortableContext` with `rectSortingStrategy` over the grid (`V2StudioPhotoGrid` already
  has the sensor setup; reuse it).
- Phone: `TouchSensor` with `delay: 250, tolerance: 8` (long-press to lift) so normal scrolling never
  starts a drag. On lift: card scales to 1.04, shadow, `navigator.vibrate?.(10)`. Auto-scroll on
  edges is on.
- Desktop: `PointerSensor` with `distance: 6`.
- Keyboard: `KeyboardSensor` + `sortableKeyboardCoordinates`; announcements via dnd-kit's
  `accessibility.announcements` ("Page 3 moved to position 1").
- Also in the card's ⋮ menu: **Move to start**, **Move earlier**, **Move later**, **Move to end**
  (for people who never discover long-press, and for screen readers).
- First visit with 2+ pages: one-time hint chip above the grid: "Press and hold a photo to change the
  order" (phone) / "Drag photos to change the order" (desktop). Dismiss on first drag or ×.
- Order persists through `replacePhotos` exactly as the rail does today. The book's page order is
  the gallery order. There is no second ordering in the order panel.

### 4.4 Bulk actions

- Above the grid, only when 2+ photos have no page: a slim bar "3 photos have no page yet ·
  **Make the rest** ({total cost})". Runs them through the queue (section 4.6).
- Selection mode for deleting: ⋮ in the header → **Select photos** → checkboxes on cards → sticky
  "Delete 3 photos" bar. Reuse `useV2LibraryDeletion` and `V2DeletePagesConfirmModal`.

### 4.5 "Make pages as I add" toggle

A switch with a label and a live cost line:

- Guest: "Make pages as I add · Free to try".
- Signed in: "Make pages as I add · {pagePrice} each · You have {balance}".
- Default **on** (it is the fastest path and what nearly every user wants). Remember the choice per
  device in `localStorage` key `cm_autopage`.
- When files are picked with the toggle on, before anything is spent (signed in only), an inline
  confirm line appears in the upload strip for 4 seconds with the total, e.g. "Making 5 pages ·
  {total}" and **Undo** (cancels the queued, not-yet-started ones). No modal: no extra tap on the
  happy path, but nobody is surprised by a charge.
- If the balance covers fewer pages than were picked: queue as many as it covers, then show
  "Add credit to make 2 more" with the existing `V2AddCreditModal`.
- Guests: the queue respects the daily limit. When the server answers `GUEST_LIMIT`, stop the
  queue, mark the rest "Queued" → back to "Create", and show `V2GuestLimitModal` once.
- The old "first-time guest's first page starts by itself" behaviour is subsumed: guests have the
  toggle on by default. Keep the "exactly once per photo" guarantee.

### 4.6 Parallel page making (new)

Today one global lock (`coloringApiLockRef`) means one page at a time. Replace it with a small
queue:

- New hook `useSheetQueue` (in `src/components/v2/studio/`). API:
  `enqueue(photoIds)`, `cancel(photoIds)`, `status(photoId)`, `running`, `queued`.
- Concurrency **3** (constant `PAGE_QUEUE_CONCURRENCY`). Each job calls the existing
  `generateForPhoto` logic, refactored to take a **per-photo** lock instead of the global one.
- Per-photo lock: a `Set<string>` of busy photo ids, shared by generation, edits (`V2SheetEditChat`),
  mirror/rotate, and portrait. A photo never has two operations at once; different photos can.
- Batch toast: one summary toast when a batch ends ("5 coloring pages ready" / "4 ready, 1 needs
  another try"), not one per page.
- Wallet race: parallel requests can each pass the server's pre-check and then fail to charge. The
  client must not enqueue more pages than `floor(balance / pagePrice)` (signed in). Also check
  `src/app/api/photo-coloring/route.ts` and `walletUsageGuard.ts`: if the charge can fail after the
  model ran, make sure the client shows the page anyway or refunds are handled; flag in the PR if
  not.
- `beforeunload` warning while the queue is running ("Pages are still being made").
- Guest IndexedDB writes: `mutatePhotos` must stay functional-update based so 3 completions in the
  same tick don't overwrite each other. Add a test-by-hand note for this.

## 5. Page editor modal

Opens on card tap. Full-screen on phones (slides up), a large centred dialog on desktop
(max-width 960px). Built on `V2Modal` (focus trap, Esc, scroll lock). Phone Back button closes it
(push a history entry on open, like `mobileStudioOpen` does now).

### 5.1 Layout

```
phone                                     desktop
┌──────────────────────────┐              ┌───────────────────────────────────────────┐
│ ×   Page 3 of 12   ‹  ›  │              │ ×  Page 3 of 12                    ‹  ›   │
│                          │              │ ┌──────────────────┐  Quick fixes         │
│   ┌──────────────────┐   │              │ │                  │  [Flip][Rotate][Fit] │
│   │                  │   │              │ │   COLORING PAGE  │  [Bolder lines]      │
│   │  COLORING PAGE   │   │              │ │  (hold to see    │                      │
│   │  (hold = photo)  │   │              │ │   the photo)     │  Change the drawing  │
│   └──────────────────┘   │              │ └──────────────────┘  [Edit with a note]  │
│ ○ ○ ● versions strip     │              │ versions: ○ ○ ●       [Draw it again]     │
│ ─────────────────────────│              │                       ──────────          │
│ [Flip][Rotate][Fit][Bold]│  ← scrolls   │                       [Print free][Share] │
│ [Edit with a note · $x]  │    sideways  │                       [Leave out][Delete] │
│ [Draw again · $x] [⋯]    │              │                                           │
└──────────────────────────┘              └───────────────────────────────────────────┘
```

- **‹ ›** and swipe left/right move between pages without closing (follows gallery order). Phones:
  horizontal swipe on the image; disabled while pinch-zoomed.
- **Hold to see the photo**: press-and-hold (or hover on desktop, plus a "Photo" toggle chip for
  accessibility) cross-fades to the original photo. Answers "is this really my kid?" without a
  separate view.
- Pinch-zoom / double-tap zoom on the page (phones) so people can check faces.
- If there is no page yet the main area shows the photo with one big **Make coloring page** button
  (cost shown); the quick fixes act on the photo.

### 5.2 Quick fixes (no generation, no cost, instant)

Every quick fix makes a **new version** (`SheetVersion`), drawn on a canvas client-side, so the
versions strip doubles as undo. For cloud photos upload the new version with
`uploadRevisionToLibrary` (already exists); guests keep it in IndexedDB. Show a small "Undo" toast
after each one that re-selects the previous version.

| Fix | What it does | Notes |
|---|---|---|
| **Flip** | Mirror left-right | For the page only. (The existing "mirror photo" in `useV2PhotoTransforms` mirrors the photo and every version; keep it in the ⋯ menu as "Flip the photo too".) |
| **Rotate** | 90° clockwise | Changes the version's orientation (portrait ↔ landscape). Book pages are portrait; the print pipeline already rotates/fits landscape art, check `src/lib/print` and `BookPrintPagePreview` so a rotated version prints the way the preview shows. |
| **Fit / Fill** | Whether the page art fits inside the printable area with white margins, or fills it (cropping edges) | Already exists as `BookPageFitPicker` / print prefs per page. Surface it here instead of in the wizard. |
| **Bolder lines** | Thickens dark lines (canvas: threshold + 1px dilate, run once per tap, max 2 levels) | Great for little kids and crayons. Pure pixel work, white stays white. |
| **Lighter / cleaner** (⋯ menu) | Removes faint gray specks (threshold to pure black/white) | Helps print quality; the interior prints 4-bit gray. |
| **Restore original** (⋯ menu) | Selects the first drawn version | |

Not doing (considered): free-hand eraser/draw tools (too fiddly on a phone, low value for this
buyer), crop of the coloring page (Fit/Fill covers the real need), text captions (the print prompt
forbids text on pages today; a caption feature is a separate decision for the owner).

### 5.3 Changes that cost (generation)

- **Edit with a note**: opens the existing `V2SheetEditChat` as an inline panel/sheet. Show "Free"
  while `editCount < freeEditsPerSheet`, else "{editPrice}".
- **Draw it again**: new drawing from the photo (`generateForPhoto` with `addVersion`). Shows cost.
- Both go through the per-photo lock and the queue's concurrency (they count as jobs).

### 5.4 Other actions

**Print free** (`V2PrintSheetModal`), **Share** (`V2SharePageModal`), **Leave out of book**
(see below), **Delete photo** (confirm). On phones these are in a "⋯" sheet; on desktop they are
visible buttons.

**Leave out of book** (new, small): a boolean on the photo (`excludedFromBook`, persisted the same
way as other photo fields; for cloud photos check whether the library API can store it, otherwise
keep it in the project session JSON). Excluded cards show a dimmed inset with "Left out" and are
skipped by the order panel. This lets people keep a page in the album without paying to print it.

## 6. Order panel ("Your book", right 40% / phone bottom sheet)

### 6.1 Container

- Desktop: sticky right column, `v2-panel` look, its own scroll.
- Phone: a sticky **book bar** above the bottom tab bar: "**12 pages** · {total or 'from {price}'}"
  and a primary **Make my book** button. Tapping opens a bottom sheet (90vh, drag handle, swipe down
  to close, Back closes it) containing the same rows. The gallery stays scrollable underneath when
  the sheet is closed. The bar hides while the editor modal is open.
- Empty album: the panel (desktop) reads "Your book appears here. Add photos to start." with the
  format rows disabled; phone bar hidden until there is at least 1 page.

### 6.2 Rows

Each row is an accordion item: collapsed it is one line (label, current choice, ✓ or "!" ), expanded
it shows only the controls it needs. Only one row is expanded at a time. After a row is completed
the next incomplete row opens automatically. Rows never take more height than their content.

1. **Format**: `BookBindingPicker` in compact list form (radio cards, one line each: name, page
   range, price for this page count). Best fit preselected (same ordering rule as today: best fit,
   other printed, unavailable, print-at-home PDF last). Collapsed: "Spiral · 12 pages".
2. **Pages**: no reordering here (the gallery is the order). Contents: page count, blank-page padding the format adds ("2 blank pages added
   to fill the book"), capacity errors ("Stapled holds 48 pages, you have 52: leave 4 out or choose
   Spiral"), and a link "Change order in the gallery" (scrolls/closes sheet). Pages still being
   drawn: "2 pages still being made: they'll be added when ready" and **Confirm and buy** waits.
   Collapsed: "12 pages ✓".
   (Multi-album books: today the wizard can pull from several albums. Keep that as an "Add pages
   from another album" link that opens `BookAlbumSelect` in a sheet; the added pages appear after
   this album's pages. Low priority; can ship in a follow-up if it complicates v1.)
3. **Cover** (printed formats only): title field (prefilled with the album name) and a row of
   cover picture choices (the first 6 pages + "No picture"), drawing a live mini cover with
   `BookCoverCanvas`. **More cover options** opens the full `BookCoverDesigner` in a modal.
   Collapsed: "“Grandma's book” · picture 1".
4. **Ship to** (printed formats only): `BookShippingAddressForm` with saved address prefilled
   (collapsed straight to the address line when a saved address exists), the
   `BookAddressSuggestion`, the **This is a gift** checkbox (with recipient address + note as
   today). `/gift` intent still pre-ticks it.
   For the PDF format this row is replaced by "Delivered as a download in My orders".
5. **Total** (always visible at the bottom of the panel, not an accordion row): price lines from the
   quote (book, shipping, tax, credit applied), "Shipping and tax are estimated until the address is
   complete", and the account balance. Reuse `BookOrderPriceBar` maths and the `/api/orders/quote`
   call exactly as the wizard does.
6. **Confirm and buy** (primary, full width, sticky at the bottom of the panel/sheet). Disabled with
   a reason underneath until rows 1–4 are valid ("Add a shipping address").

State: everything the wizard keeps today (binding, cover design, address, gift, cart id, draft
order id) moves into a `useBookOrder` hook in `src/components/v2/studio/order/`, extracted from
`V2BookOrderWizard.tsx`. The saved cart (`/api/carts`) keeps working so `/home` "Continue your
book" still restores a half-made book. `book_started` fires when the panel first becomes usable for
a signed-in person.

### 6.3 Guests

Guests can open the panel, pick a format and see the example price (no address yet). Rows 3–4 show
a single card instead: "Create a free account to finish your book. Your pages come with you."
with **Create free account** / **I already have an account** (same flag
`cm_migrate_after_signup` and `next=/studio` as `V2GuestGate`). After sign-in the migration banner
moves the pages and the panel picks up where it was (persist the chosen format in sessionStorage).

## 7. Confirm-and-buy modal

Full-screen on phones, large dialog on desktop. A step indicator at the top: "Page 3 of 12" with a
thin progress bar.

### 7.1 Flip-through (proof)

- Opens on the **front cover**, then each interior page in book order (including the gift note
  page and blank padding pages, shown as they will print), then the back cover. Reuse
  `BookFlipThroughModal` rendering (phones one page at a time, desktop the open spread) and
  `BookPrintPagePreview` with the trim/safe guides toggle.
- Each step has **Looks good →** (primary) and **Fix this page** (secondary). "Fix this page" closes
  the modal and opens that page's editor; the proof restarts from that page when they come back
  (pages already confirmed stay confirmed unless they changed: reuse `proofKey` logic per page).
- Swipe / arrow keys go forward and back. The primary button can't skip ahead: every page is seen
  once, which is what "proof confirmed" means today (keep `proofConfirmed` semantics for the order
  API).
- One page (phone) or one spread (desktop) per tap; spreads already halve the taps on desktop.
- PDF format: same flip-through (it is still worth checking), no covers.

### 7.2 Overview (last step)

- Mini cover, title, format, page count, ship-to address (or recipient + "Gift" tag), price lines,
  credit applied, balance after. Each section has an **Edit** link that closes the modal and opens
  that row.
- One checkbox is not needed: flipping through every page is the confirmation.
- **Complete purchase · {total}** (primary). Copy under it: "You'll get an email with your order".
- If the balance is short: the button reads **Add {shortfall} and complete purchase**. It starts the
  existing Stripe top-up with a return path of `/studio?checkout=resume&cart=<id>`. On return
  (`useCreditCheckoutReturn` already confirms the top-up) the modal reopens straight on the
  overview, proof still confirmed (the proof key is stored with the cart), and the button now reads
  **Complete purchase**. This keeps today's money flow (wallet) unchanged, per the owner's earlier
  decision, but removes the "find your way back" step.
- While placing: button shows a spinner and "Placing your order…"; the modal can't be closed.
- Errors stay in the modal (inline, above the button). The `placeBookOrder` insufficient-credit
  fallback still routes to `/orders/<id>?confirmed=1`.

### 7.3 Thanks screen

Replaces the modal content after a successful place (no navigation away):

- Confetti burst: a small dependency-free canvas confetti (~80 pieces, brand colours, 1.5s, then
  stops). `prefers-reduced-motion`: no confetti, a gentle fade-in of a check icon instead.
- **Thanks for ordering!** (headline), then:
  - Order number (short form of the id, as `/orders` shows it), with copy button.
  - **Estimated delivery**: `estimatedDeliveryMin`–`estimatedDeliveryMax` from the placed order /
    quote when present, formatted "Nov 21 – Nov 25". When absent: "We'll email you a delivery date
    once the printer schedules your book." Never invent a date.
  - **Tracking**: there is no tracking number at purchase time (it arrives from Lulu after
    shipping). Say "Tracking appears in My orders and in your email once it ships." Do not fake one.
  - "We've emailed your receipt to {email}."
  - Buttons: **See my order** (`/orders/<id>`) and **Make another book** (closes; leaves the album).
- PDF format: headline the same, then **Download your book** (the existing digital download), no
  delivery lines.
- Analytics unchanged: `checkout_started`, `purchase` (via `trackPurchaseOnce`).

## 8. Mobile details (primary platform)

- Test at 320, 375, 390, 768, 1024, 1440. No horizontal scroll at 320.
- All tap targets ≥44px. Card ⋮ and Create are 44px hit areas even if visually smaller (`v2-hit`).
- Bottom sheet and full-screen modal respect `env(safe-area-inset-bottom)`.
- Sticky book bar + bottom tab bar must not cover the last row of cards: pad the gallery bottom by
  their combined height (measure, as `V2LibraryWorkspace` does for its dock).
- Long-press to drag must not trigger the iOS image callout: `-webkit-touch-callout: none;
  user-select: none` on cards, `draggable={false}` on `<img>`.
- The toggle and upload strip must not wrap awkwardly at 320px (label on one line, cost on the next).
- Keyboard on phones: when the address form is focused inside the bottom sheet, the sheet must
  scroll the field into view (use `visualViewport` resize, or let the sheet be a scroll container
  with `scroll-padding-bottom`).

## 9. Copy

Follow `docs/agent-reference.md` section 3: "coloring page" (never "sheet"), "album" (never
"project"), no "AI", no em dashes, no hardcoded prices (use the price list / tokens). New strings:

| Where | Copy |
|---|---|
| Toggle | Make pages as I add |
| Inset, no page | Create |
| Bulk bar | {n} photos have no page yet · Make the rest |
| Editor quick fixes | Flip · Rotate · Fit · Fill · Bolder lines |
| Editor paid | Edit with a note · Draw it again |
| Phone book bar | {n} pages · Make my book |
| Panel CTA | Confirm and buy |
| Proof | Looks good · Fix this page |
| Final | Complete purchase · {total} |
| Thanks | Thanks for ordering! |

## 10. Build plan (suggested order)

1. Extract `useBookOrder` from `V2BookOrderWizard.tsx` (pure move, wizard still works).
2. Per-photo lock + `useSheetQueue`; refactor `generateForPhoto` out of `ColorfulMemoriesApp` into
   the queue. Auto-make toggle.
3. New `StudioGallery` + `GalleryCard` with reorder; header with album switcher.
4. `PageEditorModal` with quick fixes (canvas helpers in `src/lib/photo/` or `src/lib/v2/`).
5. `BookOrderPanel` (rows) + phone book bar/bottom sheet.
6. `ConfirmPurchaseModal` (proof + overview + thanks + confetti), Stripe resume.
7. `/studio/order` redirect; remove dead code paths from `/studio` only (do not delete files other
   pages still import).
8. Verify (section 11).

## 11. Acceptance checks

- `npx tsc --noEmit` clean; `npx eslint src` adds no new errors over the baseline; `npm run build`
  passes (dev server stopped).
- Browser (built-in preview, `/api/photo-coloring` stubbed, no real generation, no sign-in, no
  orders): guest at 375px and 1440px can add 3 photos with the toggle on and see 3 pages drawing at
  once; reorder by long-press (phone) and drag (desktop); open the editor, flip, rotate, bolder lines,
  undo via versions; swipe to next page; book bar opens the sheet; guest sees the account card in
  rows 3–4. No dialog on first load, no horizontal scroll at 320px.
- Signed-in flows (panel rows 3–4, confirm modal, Stripe resume, thanks screen) are code-reviewed
  only unless the owner allows a test account; say so in the PR.
- Every dialog: focus moves in, Tab stays inside, Esc closes only the top one, focus returns.

## 12. Audit revisions (v2, these win over sections 1–11)

A usability audit (mobile and desktop) counted about 29 taps from "Make my book" to a placed order
for a 24-page book on a phone, most of them in the proof. These changes bring that to about 4.

### 12.1 Proof without a tap per page (replaces the per-page "Looks good" in 7.1)

- **Phone:** the proof is one vertical scroll: front cover, each page full width, back cover. A
  sticky top bar reads "Page 7 of 24" with a progress bar. Each page has a small **Fix this page**
  button. Pages are marked seen with an `IntersectionObserver` (≥60% visible).
- **Desktop:** open-book spreads with ‹ › buttons and arrow keys, as `BookFlipThroughModal` does.
- One sticky **Everything looks good** button. It is enabled once every page has been seen (on
  desktop: every spread shown). That single tap sets `proofConfirmed`, replacing today's
  seen-everything plus checkbox in `BookProofStep`. Then the overview step.
- After **Fix this page** and coming back: show only the changed pages ("1 page changed. Check
  it."), not the whole book again.
- The front cover comes first, so a wrong title is the first thing they see (see 12.9).

### 12.2 Credit top-up completes the purchase (amends 7.2)

- Show any shortfall early: the Total block in the order panel shows "Your credit: {balance} ·
  Add {shortfall} at checkout" before the proof starts.
- The overview button reads **Add {shortfall} and complete purchase**. On return from Stripe
  (`/studio?checkout=resume&cart=<id>`), when the top-up is confirmed and the quote is unchanged,
  the modal reopens on the overview and **places the order automatically**: "Placing your
  order…" with a **Cancel** button visible for 3 seconds before the place call. The person already
  tapped "complete purchase"; they should not have to tap it twice. If the quote changed, show the
  new total and the normal **Complete purchase** button instead.
- If the return lands signed out (bank apps can reopen a different browser): after sign-in, resume
  from the cart id the same way.
- Do not change how money moves on the server (wallet top-up, then place). This is client flow only.

### 12.3 Guest sign-up must not strand people (amends 6.3)

- Before building 6.3, check whether production sign-up returns a session immediately
  (`src/server/authService.ts` `register`, `V2SignUpStudio`). If email confirmation is required,
  people from in-app browsers will lose their guest pages. **Report this in the PR as a launch
  blocker for the owner**; do not change Supabase auth settings yourself.
- Persist the chosen format **and** cover title in sessionStorage across sign-up.

### 12.4 Auto-make toggle (replaces the defaults in 4.5)

- **Guests:** on by default. Auto-make only the **first 3** photos of a batch; the rest show the
  **Make page** button. Handle `GUEST_LIMIT` (personal) and `GUEST_BUSY` (global) separately, each
  with its existing modal copy.
- **Signed in:** never spend credit without a clear choice (agent-reference: "Never automatic for
  signed-in people"). The first batch on a device shows an inline choice in the upload strip:
  "Make 5 pages · {total} · You have {balance}" with **Make pages** and **Just add photos**. That
  choice sets the toggle; after that, respect the toggle and show the cost line on it.
- No timed undo. While anything is queued, a strip stays visible: "Making 5 pages · {total} ·
  **Stop the rest**", and each queued (not started) card has an × to cancel it.
- The toggle lives in the upload strip (shown when adding photos and while the queue runs), not as
  a permanent header line.

### 12.5 Charge race is a requirement, not a flag (replaces the wallet note in 4.6)

`src/app/api/photo-coloring/route.ts` charges after the model has run and returns 402 if the
charge fails, so a finished page is thrown away. Change the route so that **when the model has
already produced a page and the charge then fails for insufficient credit, the page is still
returned** (log it with the user id, and return `creditsBalanceCents`). No database migration. The
client cap of `floor(balance / pagePrice)` stays as the first line of defence.

### 12.6 Less fixed chrome on phones (amends 3 and 6.1)

- Hide the bottom tab bar on `/studio` once the book bar is showing (`V2StudioFrame` has
  `hideBottomNav`). The header has a menu to reach the other tabs.
- Header on phones is one row: album switcher + **Add photos**. The toggle moved to the upload strip.

### 12.7 Card legibility (amends 4.2; keeps the owner's layout)

The owner asked for the photo as the large image with the coloring page overlaid at the bottom.
Keep that, but size it to be readable on a 2-column phone grid:

- The inset is **at least 50% of the card width** (3:4), bottom-right, white background.
- No price text inside the inset. Before a page exists the bottom of the card has a full-width
  **Make page** bar (44px+); the cost is on the toggle and the bulk bar, not on every card.
- Tapping the inset on its own opens the editor straight to the page view.
- (Option for the owner, not built: once a page exists, swap so the page is the hero and the photo
  is the inset. The audit recommends it.)

### 12.8 Copy fixes (amends 9)

- "Create" → **Make page** (matches the vocabulary, and "Create" is a tab name).
- Phone book bar: never "from {price}". Show the price of the book at the current page count plus
  "+ shipping" (from the quote), or just "{n} pages" while there is no quote yet.

### 12.9 Cover title check (amends 6.2 row 3)

While the cover title still equals an automatic album name ("Gift book", "Birthday book", "My first
album", etc., see `PLACEHOLDER_ALBUM_NAME` in `ColorfulMemoriesApp.tsx`), the Cover row shows "!"
and "Check your cover title". It does not block the purchase.

### 12.10 Gestures and layers (amends 5 and 8)

- Editor: replace hold-to-see-photo with a visible **Photo / Page** segmented toggle. Keep swipe
  between pages and pinch-zoom; swipe is off while zoomed.
- Quick fixes are a 2-row grid on phones, not a sideways scroller, so the paid actions are visible.
- Gallery cards: `contextmenu` `preventDefault`, `touch-action: manipulation`,
  `-webkit-touch-callout: none`.
- Bottom sheet: swipe-to-close only from the handle, plus a visible **Close** button.
- One shared history helper for the editor, bottom sheet and confirm modal, so Back closes exactly
  one layer at a time.

### 12.11 Interrupted pages (amends 4.6)

`beforeunload` is unreliable on iOS and in in-app browsers. On load and on `visibilitychange` to
visible: signed-in, refetch the album; guests, any photo still flagged `generating` with no live
request becomes "Try again" with "This page was interrupted. Tap to try again."

### 12.12 Rotate (amends 5.2)

Check how `src/lib/print` places landscape art on a portrait page before building Rotate. If the
pipeline auto-rotates landscape art, a 90° rotate would either do nothing in the book or print
sideways: ship **Rotate 180°** only in v1 and say so in the PR. If the preview and print honour
the version's orientation exactly, 90° steps are fine. The book preview must always match the print.

### 12.13 Order rows (amends 6.2)

- Never auto-collapse or auto-advance a row that contains the focused element.
- Address fields get `autocomplete="shipping given-name"`, `shipping address-line1`, etc.
- Pages row states: too few pages ("Add 1 more page for Spiral"), pages that failed, pages still
  drawing, and padding as a prompt ("Add 3 more photos to fill your book, or 3 pages stay blank").
- The card badge is the **book page number**, shown only on pages that are in the book.
- **Leave out of book** is also in the card ⋮ menu.

### 12.14 Accessibility (amends 11)

- **Make page** and ⋮ are sibling buttons of the card's open button, never nested inside it.
- One polite live region for queue progress ("3 of 5 pages ready"), not one per page.
- Thanks screen: focus moves to the headline, confetti canvas is `aria-hidden`, the message uses
  `role="status"`.
- Accordion headers use `aria-expanded` / `aria-controls`; opening the next row must not move focus.
- The compact drawing loader must respect `prefers-reduced-motion`.

### 12.15 Thanks screen (amends 7.3)

- Add "Order by {date} for Christmas" style lines only through the existing `{date}` token, and
  only if it is set. Never a delivery promise.
- Check that the order confirmation email (`src/server/email/`) is sent when an order is placed
  before writing "We've emailed your receipt". If it is not, say "Your receipt is in My orders".
- The insufficient-credit fallback that sends people to `/orders/<id>?confirmed=1` skips the thanks
  screen; that is acceptable, but the order page must still show the existing
  `OrderPlacedThanks` there once it is paid.

### 12.16 Owner changes after the first build (2026-11-14)

- Nothing in the buy flow is chosen for the customer: format and picture fit both start empty and
  must be picked. Picking one opens and scrolls to the next step.
- **Fit / Fill is not in the page editor.** It is one choice for the whole book ("Framed" or "Edge to
  edge"), in the order panel's Pages step, using `BookPageFitPicker` with the customer's own page
  shown both ways (as the old wizard did).
- Gallery cards with a finished page have a **printer** button beside ⋮. It opens "Print or share"
  (`PagePrintShareModal`): print through the browser's print dialog, download the PDF, or send the
  page by email (server email with the share link and a "Create a free account" invitation) or by
  text message (`sms:` link with the share link). Guests are asked to create an account to send.
  The shared page (`/p/<token>`) now asks visitors who aren't signed in to create a free account.
