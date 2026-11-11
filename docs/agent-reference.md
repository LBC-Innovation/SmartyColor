# Colorful Memories: agent reference

Read this before you change anything in this repo. It records what was learned in a full audit of
the live site and codebase on 2026-11-11, the user journeys, the rules that were broken in the past,
and where things live. It is written for an agent that has no other context.

If something here disagrees with the code, the code wins: check the file named next to the claim,
then fix this document.

---

## 1. What the product is

- **Name:** Colorful Memories. Live at `https://colorfulmemories.net`. Repo folder is `SmartyColor`.
- **What it does:** a person uploads a family photo, gets a black-and-white coloring page made from
  it, can fix the page by typing a note, can print it free, and can turn several pages into a
  printed book that is shipped.
- **Who it is for:** parents and grandparents, mostly on phones, mostly arriving from TikTok,
  Instagram and Facebook ads. The big season is Black Friday to Christmas.
- **Positioning:** a personalized gift and memory brand, not a tool. Brand line:
  **"Color the moments that matter."**
- **How it makes money:** printed books (stapled, spiral, paperback) and a $1-class print-at-home
  PDF of a whole book. Making pages while signed in spends a small amount of account credit.

## 2. Stack and hard rules

| Thing | Fact |
|---|---|
| Framework | Next.js 16, React 19, Tailwind 4, TypeScript |
| Backend | Supabase (auth, Postgres, storage). Project ref `dltkblbezsfjoadgpjga` |
| Payments | Stripe, used only to top up a credit wallet |
| Printing | Lulu print API (see section 9, it is not fully wired) |
| Image model | Google Gemini, called from the server |
| Email | Resend |
| Hosting | Vercel, project `smarty-color` |

**Rules you must follow. Each one exists because something went wrong.**

1. **Read `AGENTS.md` first.** This Next.js version is different from older ones. Read the guide in
   `node_modules/next/dist/docs/` before writing routes, metadata, sitemap or config code.
2. **Local development uses the PRODUCTION database and a REAL paid image model.** There is no
   separate test database. So, unless the owner says yes in the chat:
   - do not create accounts, sign in, place orders or add credit;
   - do not run SQL or apply migrations (ask for each migration, every time);
   - do not trigger real page generations. Stub `window.fetch` for `/api/photo-coloring` instead.
3. **A page reload removes fetch stubs.** Re-install and re-check the stub before any action that
   could make or edit a page. A past test run sent a real paid request this way.
4. **Never invent marketing facts.** No made-up testimonials, ratings, customer counts, deadlines,
   delivery times, discounts, bundles, guarantees or partner terms. Section 8 lists what is true.
5. **Never hardcode a price, credit amount or date in copy.** Use tokens (section 7).
6. **Never trust a token or session that arrives in a URL.** A past change let a crafted link sign a
   visitor into someone else's account. Sign-in only ever stores a session returned by our own API.
7. **Any "next" redirect path must go through `safeNextPath`** in `src/lib/auth/nextPath.ts`.
   A hand-rolled check was bypassed with a tab character.
8. **Do not use the word "AI" in text customers see.**
9. **Do not commit or push unless the owner asks.** Do not touch `.claude/` (it holds live git
   worktrees).
10. **Do not start the dev server from the shell.** Use the browser preview tool with the
    `next-dev` entry in `.claude/launch.json` (port 3000).

**How to check your work**

```bash
npx tsc --noEmit
```

```bash
npx eslint src
```

```bash
npm run build
```

- `eslint src` reports **13 errors on a clean tree**. They are old (`react-hooks/set-state-in-effect`
  and two others). Do not add new ones and do not "fix" the old ones.
- Do not run `npm run build` while the dev server is running.

## 3. Words to use

The app once mixed three vocabularies. It now uses one. Keep it.

| Say this | Never say this (in visible text) |
|---|---|
| coloring page, page | sheet, coloring sheet |
| album | project |
| Make a book | Create Book |
| Make coloring page / Make all pages | Generate sheet / Generate all |
| Delete photos (it deletes the photo and its page) | Delete pages |
| Try a free coloring page (the one marketing button) | Make a free page, Start a gift book |

Variable names, file names, routes and database fields still say `sheet` and `project`. That is
fine. Do not rename them.

Copy style: short plain sentences. No em dashes. Lead with the child, the person or the moment.

## 4. Site map

**Public marketing pages** (one component, `src/components/v2/marketing/V2LandingPage.tsx`, driven
by `LANDING_PAGES` in `src/content/marketing.ts`):

| Path | Purpose | State |
|---|---|---|
| `/` | Homepage, gifting-led | On |
| `/gift` | Gift book for grandparents, Christmas when a date is set | On |
| `/partners` | Photographers, schools, events. Contact by email | On |
| `/birthday` | Birthday kid | Built, **off** (`ready: false`): no fitting photo yet |
| `/pets` | Pet as a coloring page | Built, **off** (`ready: false`): no fitting photo yet |
| `/story` | Story mode | Redirects to `/` while story mode is off |
| `/terms` | Terms and privacy | On |

A page with `ready: false` still opens by address but is `noindex`, and is left out of the sitemap,
robots allow list, homepage cards and footer. Flip `ready` to `true` in `LANDING_PAGES` to turn it on.

**Account pages:** `/sign-in`, `/sign-up`, `/forgot-password`, `/reset-password`.

**App pages:** `/studio` (make pages), `/studio/order` (book wizard), `/home` (signed-in home),
`/orders`, `/orders/[id]`, `/account`, `/activity`, `/storybook` (locked), `/p/[token]` (shared page).

**Admin pages:** `/admin/users`, `/admin/finance`, `/admin/pricing`, `/admin/promo-credits`,
`/admin/vision-costs`. Leave their wording alone.

## 5. Journeys

Each journey lists what the person sees, then the files that make it happen.

### 5.1 Guest: ad to first free page (the most important path)

1. Lands on `/`, `/gift` or `/partners`. Reads the headline. Taps **Try a free coloring page**.
   - The landing "intent" (`gift`, `birthday`, `pets`...) is remembered in sessionStorage
     (`cm_intent`) and passed as `/studio?intent=...`.
2. Arrives at `/studio`. **No tour opens.** The empty album says "Choose a photo to start", with
   three photo tips and a "How it works" link. The first album is named to match the intent
   ("Gift book", "Birthday book").
3. Picks a photo. **For a guest who has never made a page on this device, the first page starts
   generating by itself**, and on a phone the page view opens to show progress.
   - Never automatic for signed-in people: it would spend their credit.
4. About 20 to 40 seconds later the page appears. Under it, one card shows:
   - "Save this page and get {credit}..." (after page 1, and again after page 3), **or**
   - "Turn this into a book" (the rest of the time). Never both.
5. Can tap **Print** (free PDF), **Edit page** (chat with four suggestion chips; a chip fills the
   box but does not send), or **Make a book**.

Files: `src/components/v2/ColorfulMemoriesApp.tsx` (the studio; `autoGenerateFirstPage`,
`generateForPhoto`, `mobileStudioOpen`), `src/components/v2/library/V2LibraryWorkspace.tsx` (empty
state), `src/components/v2/V2SheetEditChat.tsx`, `src/components/v2/V2PrintSheetModal.tsx`,
`src/components/v2/marketing/V2SavePromptCard.tsx`, `V2BookUpsellCard.tsx`,
`src/app/api/photo-coloring/route.ts`.

Guest data lives only in the browser: IndexedDB `smartycolor-v2-studio`, plus the storage keys in
section 10. The photo is sent to the server and on to Google only to draw the page. The server does
not store it.

### 5.2 Guest hits the free limit

- Server counts guest page attempts per network per day in the `guest_usage` table.
- Defaults: 8 pages, 15 edits, 60 photo conversions per day per network, and 2000 guest pages per
  day across everyone. Env vars: `GUEST_DAILY_PAGES`, `GUEST_DAILY_EDITS`, `GUEST_DAILY_PREPARES`,
  `GUEST_DAILY_PAGES_GLOBAL`, `GUEST_USAGE_SALT`.
- Over the limit the API returns HTTP 429 with code `GUEST_LIMIT` (personal) or `GUEST_BUSY`
  (global). The studio shows `V2GuestLimitModal`: "You've made today's free pages" with
  "Create free account".
- The network address is stored only as a one-way hash. IPv6 is grouped by its /64 so one device
  cannot rotate addresses. Rows older than 7 days are deleted.
- A count is refunded **only** when the failure happened before the paid model was called.
- If the database call fails, the guard **allows the request** (fails open) and logs a warning.

Files: `src/server/guestUsageGuard.ts`, `supabase/migrations/0027_guest_usage.sql` (applied to
production on 2026-11-11), `src/lib/guestLimit.ts`, `src/components/v2/auth/V2GuestLimitModal.tsx`.

### 5.3 Guest to account (pages come along)

1. Guest taps **Make a book**. Goes to `/studio/order`. A guest sees **no stepper**, only a card:
   "Create a free account to make your book", the sign-up credit, an example price, and two
   buttons: **Create free account** and **I already have an account**.
2. Both buttons set a flag (`cm_migrate_after_signup`) and send the person to `/sign-up?next=/studio`
   or `/sign-in?next=/studio`.
3. `/sign-up` is **one screen**: email, password (with show/hide), the credit badge. No confirm
   field, no steps.
4. After sign-up:
   - If Supabase returns a session: go straight to `/studio`.
   - If email confirmation is required: "Check your email". The link in that email lands on
     `/sign-in?confirmed=1&next=%2Fstudio` and shows "Email confirmed. Sign in to keep going."
     **The link never signs anyone in by itself.**
5. In `/studio`, `V2LibraryMigrationBanner` sees the flag and moves the browser albums into the
   account automatically, then shows a bar with **Make your book**.
6. The person taps **Make a book** again; the wizard now works.

Known gap: if the confirmation email is opened in a different browser (for example a mail app's
built-in browser), the guest pages are not there to move.

Files: `src/components/v2/auth/V2GuestGate.tsx`, `V2SignUpStudio.tsx`, `V2SignInStudio.tsx`,
`V2AuthShell.tsx`, `V2PasswordField.tsx`, `src/lib/auth/nextPath.ts`,
`src/lib/auth/friendlyAuthError.ts`, `src/lib/marketing/savePrompt.ts`,
`src/lib/v2/migrateLocalLibrary.ts`, `src/components/v2/V2LibraryMigrationBanner.tsx`,
`src/server/authService.ts` (`register`).

### 5.4 Forgot password

1. `/sign-in` → **Forgot password?** → `/forgot-password`. Enter email.
2. Always shows the same message: "If there's an account for that address, we've sent a link."
3. The emailed link opens `/reset-password#access_token=...&type=recovery`. The page reads the
   token once, removes it from the address bar, and asks for a new password.
4. Success goes to `/sign-in?reset=1`. An expired or bad link shows "This link has expired" with
   **Get a new link**.

The token is used only to set the password. It is never stored as a session.

Files: `src/components/v2/auth/V2ForgotPasswordStudio.tsx`, `V2ResetPasswordStudio.tsx`,
`src/lib/auth/recoveryLink.ts`, `src/app/api/auth/password-reset/request/route.ts`,
`.../confirm/route.ts`.

### 5.5 Signed-in: build and order a book

Wizard at `/studio/order`. Steps (label in brackets is what the stepper shows):

1. **book [Book]**: pick the album(s), then the format. Order of formats: best fit first, other
   printed formats, unavailable ones, then print-at-home PDF last.
2. **pages [Pages]**: drag pages into order, flip or remove.
3. **cover [Cover]**: design the cover. (Skipped for the PDF.)
4. **proof [Check]**: the person must turn through every page, cover to cover, and tick a box.
   (Skipped for the PDF.)
5. **review [Checkout]**: address, optional "This is a gift" (ship to someone else, add a note
   that prints on the first page and adds a page to the price), exact price, place order.

Payment is a **credit wallet**:
- The order is paid from the account's credit balance.
- If the balance is short, the button reads "Add $X and continue" and opens a Stripe top-up. After
  Stripe returns, the person still has to tap **Place order · $TOTAL**.
- This two-step payment is the biggest known friction in the product. It was left as it is on
  purpose: changing it changes how money moves and cannot be tested safely on the live database.

A visitor who came from `/gift` gets "This is a gift" ticked **and** the recipient address form
open. (Before 2026-11-11 the box was ticked but the address stayed the buyer's.) This fix has not
been tested in a browser.

Files: `src/components/v2/book-order/V2BookOrderWizard.tsx` (1800+ lines, the whole wizard),
`BookBindingPicker.tsx`, `BookOrderStepper.tsx`, `BookOrderPriceBar.tsx`, `BookProofStep.tsx`,
`src/components/v2/orders/BookOrderCheckoutPanel.tsx`, `src/lib/print/bookBindings.ts`,
`src/server/ordersService.ts`, `src/app/api/orders/*`.

### 5.6 Signed-in: come back later

- `/home` shows "Continue your book" (the saved cart), the albums, and a seasonal card.
- `/orders` lists orders. An unpaid order (`draft` or `awaiting_payment`) shows **Finish and pay**.
- `/orders` signed out says "Sign in to see your orders" (not "No orders yet").
- `/account` shows the credit balance, top-up buttons, saved address, the referral link
  ("Give $5, get $5") and the transaction list.

### 5.7 Business visitor

- `/partners` → **Email us about a book** (a mailto with a set subject). The address is also shown
  as text with a **Copy email** button, because in-app browsers often ignore mailto links.
- There is no partner program, no wholesale price and no sign-up form. Larger orders are "quoted
  individually" by email.

## 6. Where things live

| Need | File |
|---|---|
| Every marketing word | `src/content/marketing.ts` |
| Landing page component and sections | `src/components/v2/marketing/V2LandingPage.tsx`, `LandingSections.tsx`, `landingParts.tsx`, `landingRoute.tsx` |
| Header, footer, holiday banner | `V2MarketingHeader.tsx`, `MarketingFooter.tsx`, `HolidayBanner.tsx` |
| Design tokens and component classes | `src/app/(studio)/v2-theme.css` (`v2-btn-primary`, `v2-btn-outline`, `v2-input`, `v2-panel`, `v2-hit`, `v2-hit-y`) |
| Dialogs (focus trap, Esc, scroll lock) | `src/components/v2/ui/V2Modal.tsx`, `useModalLayer.ts` |
| Top bar and phone bottom nav | `src/components/v2/V2Chrome.tsx`, `nav-config.ts` |
| Auth state in the browser | `src/context/AuthContext.tsx`, `src/lib/api/client.ts` |
| Which pages are public | `src/lib/marketing/routes.ts` |
| Feature switches | `src/lib/auth/features.ts` (`DEFAULT_FEATURE_ACCESS`, `STORY_MODE_PUBLIC`) |
| Prices shown in marketing | `src/server/marketing/marketingNumbers.ts`, `src/lib/marketing/useMarketingNumbers.ts` |
| Holiday date | `src/lib/marketing/holiday.ts` |
| Analytics | `src/lib/track.ts`, `src/lib/marketing/events.ts`, `src/server/marketing/serverTrack.ts`, `src/components/marketing/Analytics.tsx` |
| Ad attribution | `src/lib/marketing/attribution.ts` |
| Share images (1200x630) | `scripts/generate-share-images.mjs` → `public/share/*.png` |
| Sitemap, robots, 404 | `src/app/sitemap.ts`, `src/app/robots.ts`, `src/app/not-found.tsx` |
| Security headers | `next.config.ts` |
| Database changes | `supabase/migrations/` (numbered files) |

## 7. Marketing copy tokens

Text in `src/content/marketing.ts` uses tokens that are filled from real data. **A line whose token
cannot be filled hides itself.** Text inside `[[ ... ]]` is optional and drops out the same way.

| Token | Meaning |
|---|---|
| `{price}` | Price of the reference book (a 24-page stapled booklet, US shipping, before tax) |
| `{refPages}`, `{refFormat}` | Page count and format name of that reference book |
| `{credit}` | Sign-up credit |
| `{pdfPrice}` | Print-at-home PDF price |
| `{pagePrice}` | Credit cost of one new page when signed in |
| `{date}` | Christmas order-by date, only when `NEXT_PUBLIC_HOLIDAY_ORDER_BY` is set and not past |
| `{email}` | Contact address (`CONTACT_EMAIL`) |
| `{min}`, `{max}`, `{format}`, `{more}`, `{count}`, `{size}` | Binding limits, page counts, file size |

Prices are edited by the owner at `/admin/pricing` (table `price_items`). Never write one in code.

## 8. What marketing may and may not say

Checked against the code on 2026-11-11.

**True, may be said**

- A coloring page is free to try without an account (up to a daily limit).
- Any page can be changed by typing a note.
- A single page prints free as a letter-size PDF, as many copies as wanted.
- Printed formats and page ranges: stapled 4 to 48, spiral 2 to 470, paperback 32 to 800.
  Pages are 8.5 by 11 inches, black and white inside. (`src/lib/print/bookBindings.ts`)
- A whole book can be bought as a print-at-home PDF and downloaded again from My orders.
- For a printed book, the person turns through every page before ordering.
- The exact price is shown before paying.
- Each order is one book. There is no quantity field.
- "This is a gift" ships to another address; the note prints on the first page and adds a page to
  the book and its price.
- With an account, each new page uses a little credit; the sign-up credit covers the first ones.
- Photos are sent to our image provider only to draw the page. We never use photos for ads.
  Guest photos are not stored by our server.

**Do NOT say (each was written once and had to be removed)**

| Claim | Why it is wrong |
|---|---|
| "Free to build" / "pay only when you order" | Making pages while signed in costs credit |
| "Printed books from $X" / "start at $X" | The number is one example book, not the minimum |
| "Order by {date} for Christmas delivery" | Nothing guarantees arrival. Say "Order by {date} for Christmas" and point to checkout for delivery dates |
| "No price on the packing slip" | No code controls the slip (still present in the wizard; owner's call) |
| "Never shared" / "Nothing is uploaded" / "stays on this device" | Photos go to the image provider |
| "Order again from My orders" | There is no reorder button |
| Bulk discounts, bundles, multiple copies, gift wrap | None exist |
| Any testimonial, rating or customer count | None are on file (`src/content/testimonials.ts` is empty) |

**The owner must confirm, the code cannot:** "Printed in the US", "ships to them" in practice,
"first page in about a minute", and what Google does with images under the owner's API terms.

## 9. Known problems and open work

**Unverified or risky**

- **No code submits orders to the printer.** `src/server/lulu/printJobs.ts` only reads and cancels
  jobs. Orders are recorded and paid; how they reach Lulu is outside this repo or manual. Ask the
  owner before assuming anything about fulfilment.
- **Stripe and Lulu may still be in test mode in production.** Older notes say so. Not re-checked.
- **Signed-in screens were reviewed in code only** during the audit: wizard footer, format picker,
  checkout wording, the gift address fix, unpaid orders. Nobody has watched them run.
- **iOS Safari was never tested.** The preview tool emulates Android Chrome.
- **Real sign-up, confirmation and reset emails were never sent** in testing.
- **Supabase redirect allow-list must contain** `https://colorfulmemories.net/sign-in` and
  `https://colorfulmemories.net/reset-password`, or those emails land in the wrong place.

**Supabase security warnings that already existed** (not fixed):

- `public.handle_new_user()` can be called by anyone through the database API.
- Leaked-password protection is off in auth settings.
- `set_updated_at`, `has_permission`, `admin_unverify_user` have no fixed search path.

**Waiting on the owner**

- A pet photo pair and a birthday photo pair (then set `ready: true`).
- Photos of real printed books (fill `PRODUCT_PHOTOS` in `src/content/marketing.ts`).
- Real, permissioned testimonials (fill `src/content/testimonials.ts`).
- The Christmas order-by date (`NEXT_PUBLIC_HOLIDAY_ORDER_BY`, format `YYYY-MM-DD`).
- A decision on story mode: on for everyone, or keep its marketing hidden.

**Not built, in rough priority order**

1. One-step card payment at checkout (replace top-up-then-place).
2. Multiple copies per order, then gift bundles.
3. "Order again" on past orders.
4. Abandoned-book, post-purchase and occasion emails (needs a consent record and a scheduler).
5. A repeat-purchase flag in tracking.
6. Partner pricing or a partner sign-up flow.
7. A Content-Security-Policy header.

**Small things left as they are**

- The same file can be uploaded twice.
- Reloading while a page is generating loses that page with no message.
- The landing page sections are client components; they could be server components.

## 10. Browser storage keys

All start with `cm_`. Useful when you need a "fresh visitor" or need to fake a state.

| Key | Where | Meaning |
|---|---|---|
| `cm_access_token`, `cm_refresh_token`, `cm_session_hint` | localStorage | Signed-in session |
| `cm_pages_made` | localStorage | How many pages this device has made. `0` or missing = first-time guest |
| `cm_save_prompt` | localStorage | Which stage the "Save this page" card is at |
| `cm_migrate_after_signup` | localStorage | Move browser albums into the account after sign-in |
| `cm_intent`, `cm_intent_named` | sessionStorage | Landing page intent, and whether the album was renamed for it |
| `cm_book_card_dismissed` | sessionStorage | "Turn this into a book" card closed for this visit |
| `cm_library_migration_dismissed` | sessionStorage | Migration banner closed |
| `cm_attr` | cookie, 30 days | Ad attribution: `utm_*`, click ids, landing path |
| `cm_ads_optout` | cookie | "Do not sell or share" choice. Turns all tracking off |
| `cm_purchase_tracked` | localStorage | Stops the purchase event firing twice |

Guest albums and pages: IndexedDB database `smartycolor-v2-studio`.

## 11. Analytics events

All events go through `track()` in `src/lib/track.ts`. Nothing is sent when the visitor has opted
out or sends Global Privacy Control. **Event parameters must never contain a name, email, album
title, caption, photo or free text.**

| Event | Fires when | Parameters |
|---|---|---|
| `cta_click` | A marketing button, the header Sign up link, or the upsell "Make a book" is tapped | `location` (hero, sticky, products, final, occasion, header, upsell), `intent` |
| `page_generated` | A coloring page finishes | `is_first`, `signed_in`, `intent` |
| `sign_up` | An account is created | `method` |
| `book_started` | The wizard opens for a signed-in person, after the saved cart is restored | `format`, `intent` |
| `checkout_started` | Order placement begins | `value`, `currency`, `page_count`, `format`, `is_gift` |
| `purchase` | An order is placed (browser and server copies) | `value`, `currency`, `order_id`, `format`, `is_gift`, `intent` |
| `partner_inquiry` | The partners email link or Copy email is tapped | `location` (hero, final) |

`partner_inquiry` is sent as a custom event, not as a "Lead": a tap is not proof an email was sent.
Average order value and repeat rate are read from `purchase` in GA4 (same device only).

## 12. How to test safely

1. Run `npx tsc --noEmit` and `npm run build` **before** starting the preview server.
2. Start the app with the preview tool (`next-dev`). Test at 375 pixels wide first, then 320, 768
   and desktop.
3. The preview browser has no file picker. To upload a photo:
   - fetch `/marketing/boys-photo-400.webp`, draw it to a canvas, `toBlob` as JPEG;
   - wrap it in a `File`, put it in a `DataTransfer`, assign that to the hidden
     `input[type=file]`, and dispatch a bubbling `change` event.
4. Stub `/api/photo-coloring` and `/api/auth/*` with `window.fetch` so nothing real is sent. To see
   the limit screen, return HTTP 429 with the body the route really sends (read the route).
5. Under phone emulation, clicking by element reference can miss. Click by coordinates from a
   fresh screenshot and confirm what happened.
6. To test a signed-in screen without signing in, read the component and reason about it, and say
   clearly in your report that it was code review only.
7. Stop the preview server and reset the viewport when you finish.

Things to always re-check after touching the studio or auth:

- `/studio` opens with no dialog.
- A first-time guest's first page starts by itself, exactly once, even with several files.
- On a phone, the browser Back button closes the page view and stays on `/studio`.
- `/sign-up?next=%2F%09%2Fexample.com` stays on this site after a (stubbed) successful sign-up.
- `/studio#access_token=FAKE&refresh_token=X&type=signup` stores nothing in localStorage.
- Every dialog: focus moves in, Tab stays inside, Esc closes only the top one, focus returns.
- No horizontal scrolling at 320 pixels wide. Touch targets are at least 44 pixels.

## 13. How this work was done (for context)

- Branch: `feature/holiday-launch-readiness`, cut from `main` on 2026-11-11.
- A lead agent audited the live site as a guest and signed in, then directed a developer agent and
  a QA agent through several rounds. QA found real problems in every round, including two security
  holes introduced by the developer's own changes. **Do not skip the browser test.**
- Lesson that keeps repeating: a change that was "verified by reading the code" is not verified.
  Say which checks were run in a browser and which were not.
