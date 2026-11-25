# Book Packages and Design Themes: work definitions

Branch: `feat/book-packages` (cut from `origin/main` on 2026-11-25).
Read `docs/agent-reference.md` first. Its hard rules apply to every task here (production database,
real paid image model, no migrations applied without the owner, no "AI" in customer text, no
hardcoded prices).

---

## Epic A: Book Packages ("pick your book, pay once, make it")

### Why

Today a person builds an album page by page, spending wallet credit on each page, and only at the
end discovers what a book costs. The owner wants the opposite: start from the book. The person
picks a binding, sees one flat price, pays it up front, and then fills the book. Everything the
package promised (the photos, two free edits per photo, the printed book itself) is protected:
it can never be eaten by something else, so the person is never surprised by "out of funds".

### Core rule (the one that must never break)

**Package money is not wallet money.** When a package is bought, the payment is turned straight into
an *allowance bound to one album* (N photo pages, E edits per photo, one printed book in that
binding). The allowance is not a balance and cannot be spent anywhere else: not on another album,
not on extra pages, not on extra edits, not on shipping. Anything beyond the allowance is paid from
the ordinary wallet, and the screen says so before the person acts.

### Design decision: build on purchase codes

The purchase codes feature (migration 0037, `src/server/purchaseCodesService.ts`) already is an
album-bound prepaid bundle, enforced in SQL:

- `purchase_code_covers()` inside `charge_photo_usage` pays for included pages and edits before the
  wallet is touched.
- `place_book_order_with_credits` charges the wallet only `total - covered_cents`.
- A trigger frees the book allowance if that order is canceled.
- `AlbumCodeBanner` / `useAlbumPurchaseCode` already show an album's allowance in the studio.

A Book Package is a purchase code the customer buys for themselves. Reuse that machinery; do not
build a second allowance system.

What differs from an admin purchase code:

| | Purchase code | Book package |
|---|---|---|
| Created by | admin | customer, at purchase |
| Bound to album | on redeem | at purchase (the wizard creates the album) |
| Shipping | included (`max_book_cents` covers print + standard shipping + tax) | **not included**: package pays printing only; shipping and its tax are charged at checkout |
| Portraits per page | configurable | 0 by default |
| Paid with | nothing (gift) | card (Stripe Checkout, straight to the package) or wallet balance |

### Package catalog (owner-editable, never hardcoded)

New table `book_packages`, edited on `/admin/pricing`:

| Column | Meaning |
|---|---|
| `binding_id` (PK) | `saddle_stitch`, `coil_bound`, `perfect_bound` |
| `included_photos` | photo pages included |
| `edits_per_photo` | free edits per included page |
| `price_cents` | flat price; **null hides the package** |
| `active`, `sort_order` | show/hide, tile order |

Seed values (owner to confirm, prices left null so nothing shows until the owner sets one):

| Binding | Customer name | Included photos | Edits each | Printed sides (blank backs on) | Fits limits? |
|---|---|---|---|---|---|
| saddle_stitch | Stapled booklet | 20 | 2 | 40 (+ cover) | yes, max 48 |
| coil_bound | Spiral bound | 30 | 2 | 60 | yes, 2 to 470 |
| perfect_bound | Paperback | 40 | 2 | 80 | yes, min 32 |

Blank backs stay on for package books (each photo is one sheet, back left blank), matching the
owner's "20 images = 40 pages" description. The 20 is the stapled number the owner gave; 30 and 40
are proposals the owner must confirm.

### User stories

**A1. Choose a book (tiles).** As a parent starting a new album, I see one tile per available
package (binding photo, name, "N photos", "2 free touch-ups each", flat price, "Shipping added at
checkout"), plus a quieter "Just make pages" option for the old pay-as-you-go album.
- Tiles come from `book_packages` where active and priced; order by `sort_order`.
- Price comes from the server, never from code. Hidden packages never render.
- "Just make pages" opens the existing new-album landing unchanged.
- Works at 320 px wide; tiles are one column on phones.

**A2. Pay once.** As a parent, after choosing a package I see a plain summary (what's included,
what isn't: shipping) and pay the flat price.
- Guests are asked to create an account first (reuse `V2GuestGate`), then return to this step with
  their choice kept.
- Card: a Stripe Checkout session dedicated to the package (metadata `kind=book_package`,
  `binding_id`, `user_id`, pending package id). Money does **not** land in the wallet.
- Wallet: if the balance covers the full price, "Pay $X from my credit" is offered too. Debit and
  package creation happen in one SQL transaction.
- On success (webhook **and** confirm-on-return, idempotent on the Stripe session id, like credit
  top-ups) the server creates the album and a `purchase_codes` row with `source='package'`,
  `shipping_included=false`, `project_id` set, `redeemed_by/at` set.
- Paying twice for the same session never creates two packages.
- The ledger/activity shows "Stapled booklet package" as its own line.

**A3. Design theme (optional step).** See Epic B. Sits between payment and upload.

**A4. Fill the book.** As a parent, I upload photos into my package album and see how many of my
included photos are left ("12 of 20 photos used") and each page's free touch-ups left.
- Upload accepts up to the remaining included count without any price shown.
- Each included page shows "2 free touch-ups left / 1 left / Touch-ups used".
- The allowance meter is always visible in the album header (extend `AlbumCodeBanner`).

**A5. Going past the package (clearly paid extra).** As a parent who has used all included photos
(or a page's free touch-ups), I can still add more, and the action itself tells me it will use my
credit balance, never my package.
- Upload button changes to "Add extra photos · {pagePrice} each from your credit".
- Edit send button reads "Touch up · {editPrice} from your credit".
- If the wallet is short, the existing add-credit modal opens with copy that says the package is
  untouched.
- Choosing more files than remain included: the first K are included, the rest are marked "extra"
  before anything is charged, and the person confirms.

**A6. Order the book.** As a parent with a package album, "Make my book" opens the order wizard with
the package binding fixed, blank backs on, and the price bar showing "Printing: included by your
package" and "Shipping: $X".
- `covered_cents` = print cost of the included book (up to `included_photos` pages) for package
  codes; shipping and shipping tax are charged from the wallet (top-up if short, as today).
- More pages than included: the extra print cost is charged too, labeled.
- Choosing a different binding: allowed, but the package then covers nothing toward printing, and
  the screen says so before they switch.
- After the book order is placed the package is spent (existing `book_order_id`); a cancel frees it
  (existing trigger).

**A7. Admin.** As the owner, I set each package's photos, edits and price on `/admin/pricing`, and
see package purchases (count, revenue) on `/admin/finance`.

### Tasks

| ID | Task | Files (expected) |
|---|---|---|
| A-T1 | Migration `0043_book_packages.sql` (**write only, do not apply**): `book_packages` table + seed; `purchase_codes.source` (`admin`/`package`), `shipping_included` (default true), `package_price_cents`, `stripe_session_id` unique; make `campaign` nullable or default `'package'`; SQL `buy_book_package_with_credits(user, binding)` atomic wallet path; `create_book_package_from_stripe(session, user, binding, amount)` idempotent | `supabase/migrations/` |
| A-T2 | Server service: list packages, quote, buy with wallet, create Stripe session, confirm, webhook branch | `src/server/bookPackagesService.ts`, `src/server/stripe/*`, `src/app/api/book-packages/*`, webhook route |
| A-T3 | Coverage: package codes exclude shipping from `covered_cents` | `src/server/ordersService.ts`, purchase code coverage helpers |
| A-T4 | Wizard UI: tiles, summary/pay, theme, first upload | new `src/components/v2/book-packages/*`, route under `(studio)` |
| A-T5 | Studio allowance meter and "extra" labeling on upload/edit buttons | `AlbumCodeBanner`, `useAlbumPurchaseCode`, `ColorfulMemoriesApp`, `V2SheetEditChat` |
| A-T6 | Order wizard: fixed binding, price bar lines | `src/components/v2/studio/order/*` |
| A-T7 | Admin package editor | `/admin/pricing` section |
| A-T8 | Analytics: `package_viewed`, `package_selected`, `package_purchased` (binding, value; no free text) | `src/lib/marketing/events.ts` |

---

## Epic B: Design Themes

### Why

A theme turns a pile of vacation photos into a story: "we're all superheroes protecting the world",
"we live in a toy brick city". Every page in the album is drawn in that world, while each person
stays recognizable.

### User stories

**B1. Set a theme in the wizard.** As a parent, after paying I can type a theme or pick a starter
("Superheroes saving the city", "Toy brick town", "Under the sea", "Space explorers", "Fairy tale
castle", "Dinosaur safari"), or skip.
- Optional, max 200 characters, plain text.
- Starter chips fill the box; they do not submit.
- The step shows a before/after example (static marketing image pair if available, otherwise none;
  never a fake generated example).
- Copy never says "AI".

**B2. Theme shapes every new page.** As a parent, every coloring page made from a photo in that
album (initial generation) is drawn in the theme: the same people, faces and poses, transformed into
the theme's world.
- The theme is stored on the album (`library_projects.design_theme`).
- The photo prompt gets a theme block that explicitly **relaxes** the "do not cartoonify / do not
  invent backgrounds" faithfulness rules for setting, costume and style, while **keeping**: same
  number of people, each recognizable (face shape, hair, expression), same poses and composition,
  all line-art and black/white output rules.
- Edits/corrections on an existing page do not re-inject the theme (the page already carries it).
- The theme is never sent to analytics.

**B3. Theme safety.** Themes follow the same kid-safe rules as the refine prompt: no violence,
gore, weapons used to hurt, adult themes. Brand names become look-alike descriptions with no logos
or brand text ("lego" → "plastic toy bricks").
- Server validates length and trims. The prompt block instructs the model to apply the brand and
  safety rules. A theme the server rejects returns a friendly message.

**B4. Change or turn off the theme.** As a parent, I can edit the album's theme later (album
settings), and the change applies to pages made after it. A per-page "Remake without theme" is a
follow-up, not v1.

**B5. Works for any album.** Themes are not package-only: the album settings field exists on every
album, the wizard just puts it front and center.

### Tasks

| ID | Task | Files |
|---|---|---|
| B-T1 | Migration (same file as A-T1): `library_projects.design_theme text check (char_length <= 200)` | migration |
| B-T2 | Prompt: `designThemePromptBlock(theme)` and an optional `theme` argument to `buildPhotoColoringPrompt` | `src/lib/ai/prompts.ts` |
| B-T3 | Route: load the album theme for generation requests; pass to prompt; never for edits | `src/app/api/photo-coloring/route.ts`, `photoHandlers.ts` |
| B-T4 | Library API: read/write `designTheme` on albums | `src/server/libraryService.ts`, `/api/library/*` |
| B-T5 | Wizard theme step + album settings field | UI |

---

## Out of scope for v1 (named so nobody builds them by accident)

- Refunds of unused package allowance.
- Moving a package to a different album.
- Per-page "remake without theme".
- Package for the print-at-home PDF.
- Guest (signed-out) themes in the browser-only studio.

## Definition of done

- `npx tsc --noEmit` clean; `npx eslint src` adds no errors over the 13 baseline; `npm run build`
  passes.
- Migration written, reviewed, **not applied** (owner applies it).
- Wizard viewed in the browser at 375 px and desktop with `fetch` stubbed (no real payment, no real
  generation), every step screenshotted.
- Fund isolation reasoned through in SQL: no code path lets package allowance pay for extras, and no
  path lets wallet extras draw down the allowance.
- `docs/agent-reference.md` updated with the new journey.
