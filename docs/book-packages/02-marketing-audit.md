# Book-first marketing: audit and change plan

Companion to `00-work-definitions.md` and `01-ux-spec.md`. Written 2026-11-25 against branch
`feat/book-packages` (uncommitted work included) and the owner's dev server at `localhost:3000`
(guest view of `/` and `/gift`, viewed at 375px and desktop; nothing was clicked through to the
studio, nothing was signed in).

Every rule in `docs/agent-reference.md` sections 3, 7 and 8 applies to every line below. All copy
in this file already follows them: no "AI", no em dashes, no invented facts, no hardcoded numbers.
Tokens in `{braces}` are filled by the server; a line whose token can't be filled hides itself.

---

## 1. Brand voice and narrative

### 1.1 What the voice is today

The sentence-level voice is good and worth keeping. It is warm, plain and concrete. It names real
moments instead of abstractions: "the dog asleep on the couch", "Take out the stroller", "Grandma's
kitchen table", "the grown-ups argue about who's who". It avoids hype words. That is rare and it is
the brand's best asset.

The **story** the page tells is the problem. Today it says, in order: here is a free tool that makes
a coloring page in a minute; you can print it; you can also make a book; here is what one example
book costs; here are three products; sign up and get free pages; try a free page. The book is the
third or fourth idea, and it is presented as an optional upgrade of a free tool.

### 1.2 Where it is strong

- **The transformation is shown, not described.** The drag slider ("This started as an everyday
  photo") is the single most persuasive thing on the page.
- **People first.** The hero photo (toddler coloring a page of herself hugging the new baby) and the
  photo band carry real emotion without sentimentality.
- **Honesty.** The page never fakes urgency, never invents a review, and the gift copy is precise
  ("The note takes a page, so it is added to the book and its price").
- **The gift page headline** "A coloring book starring the grandkids." is the best line on the site:
  it names the product, the buyer and the recipient in seven words.

### 1.3 Where it is muddled

1. **Tool framing, not product framing.** "Family photos you can color.", "From one page to a whole
   book", "If you can text a photo, you can make one", "nothing to install". This sells software.
   The pivot sells a book.
2. **By-the-page and credit language that no longer matches.** "Sign up for 20 free pages" (top bar),
   "Sign up and get 20 free coloring pages to start", FAQ "each new page uses $0.10 of credit",
   FINAL_CTA badge. A book buyer pays one price; talk of per-page credit makes the product feel
   metered and cheapens it. It also cannot be spent on a package: there is no split payment, so a
   small welcome credit never reaches a package price (`01-ux-spec.md` screen 2).
3. **A price that will contradict the product.** "from $13.85 · 24-page stapled booklet, US shipping
   included" appears three times (hero card, finished-book section, product card). A package is a
   different book (20 photos, shipping not included, owner price). The landing would quote one
   price and the wizard another.
4. **"Free" is the loudest word on the page.** "Try a free coloring page" appears 6 times on `/`, plus
   "Free to try" 3 times and "No account" 5 times. It positions the brand as a free tool.
5. **Three products, one of them hidden.** Products cards: Coloring pages / Printed coloring book /
   Story book (hidden by flag). The new product, a book package, is not there at all.
6. **The differentiator is missing.** Design Themes, real ninja example pairs and all, is not on any
   landing page.
7. **The brand line is not on the site.** "Color the moments that matter." appears only in a code
   comment.

### 1.4 New positioning

**Positioning statement (internal):**
For parents and grandparents looking for a gift that means something, Colorful Memories is the
coloring book made from your own family photos. You choose the book, add your photos, and every
page becomes a coloring page of the people you love, printed and shipped. Unlike store-bought
coloring books or photo books, it is something the family does together, and with a theme every
page can be drawn into a world the kids pick while everyone still looks like themselves.

**Value proposition (one sentence, customer-facing):**
Choose your book, add your photos, and we turn each one into a coloring page of your family and
print it, for one price.

**Brand line:** keep "Color the moments that matter." It fits the book-first model better than the
old one (a book is a set of moments). Use it once, as the final section's headline, and in the
footer. Do not put it in the hero; the hero has to say what the product is.

**Voice rules for the new copy**

- Lead with the book and the people in it. The page, the photo and the price follow.
- Name the product as a thing you hold: "your book", "a stapled booklet", "a spiral bound book".
- Say "free" in one place only (the free-try path). Never pair "free" with the book.
- Money appears as one honest line per place: the price, then what is not included.

---

## 2. Landing page audit (as it renders today)

Order on `/` today (from `V2LandingPage.tsx`), 12 blocks plus a top bar, a toast and a sticky button.
At 375px the page is roughly 25 screens long.

| # | Block (component) | What it does for conversion | Problems |
|---|---|---|---|
| 0 | `SignUpOfferBar` "Sign up for 20 free pages" | Captures sign-ups | Sells the per-page model above the logo. Its credit can't pay for a package. Competes with the hero button. On `/` the `HolidayToast` also pops up, so there are two promos before the visitor reads a word. |
| 1 | Hero: eyebrow pill "Personalized coloring books", "Family photos / you can color.", subhead, "Try a free coloring page", "See how it works", price card "PRINTED COLORING BOOKS from $13.85", three check bullets | Sets the promise | Headline describes a capability, not a product. Subhead is 40 words. Price card quotes the reference book, which will disagree with package prices. "First page in about a minute" is on the owner-must-confirm list. Price card and bullets are below the fold at 375px, so on a phone the hero is photo, headline, button. On desktop the headline sits over the mother's face. Eyebrow pill + price card + bullet row is stacked badge furniture. |
| 2 | `PhotoBand` "WHO'S COLORING / Kids, grandparents and everyone in between" | Emotion | Fine, but it comes before the visitor knows what the product is, and 5 images in a sideways scroller is a lot of scrolling on a phone. Its body sentence repeats the captions. |
| 3 | `TransformSection` slider, "This started as an everyday photo", "Not quite right?" box, button | The proof | Strongest block. "Every page on this site was made from a real family photo" is not true of the lifestyle and gallery images (the pages in them were drawn by an image model inside a staged scene). The "Not quite right?" box and a third "Try a free coloring page" button crowd it. |
| 4 | `OccasionsSection` "A few good reasons to make one" | Routes to `/gift`, `/partners` | With birthday and pets off, it shows two cards (Christmas gifts, Photographers and businesses) plus a run-on sentence of eight occasions. A business card on a consumer homepage is out of place. Each card has its own "Try a free coloring page" button. |
| 5 | `HowItWorks` "If you can text a photo, you can make one" | Reduces effort anxiety | Describes the old flow (pick a photo, get a page, print or order). "No drawing, no design, nothing to install" is software talk. |
| 6 | `FinishedBookSection` "A real book, printed and shipped" | Shows formats | A CSS mock cover, a format table with page ranges ("2 to 24 pages", "1 to 235 pages") that will confuse people choosing a 20/30/40-photo package, a $1 PDF row (a product the owner's brief wants repriced), and the reference price again. "printed in the US". |
| 7 | `MadeGallery` "FROM FAMILIES LIKE YOURS / What people are making" | Social proof | **Trust risk.** Captions read like customer quotes ("Christmas morning. He hasn't put it down since", "Kept them busy the whole drive to the beach") under a heading that says these are families like yours. If these are staged or generated scenes (the repo has a `cm-make-marketing-selfie` prompt skill, and the commits call them "selfies" added in one day), this is an invented testimonial in all but name. Also duplicates the PhotoBand. |
| 8 | `WhySection` plum band "Color your own memories", 3 icon points, use-case pills, "Photos that come out best" box | Differentiation | Good first paragraph. Then icon points, six pills and a white checklist box inside a dark band: the densest block on the page. "Printed in the US" again. |
| 9 | `IdeasSection` "Not just for kids", 6 icon cards | SEO and range | Six icon-chip cards is the classic template tell. Most ideas are about printing loose pages at home (wedding kids' table, reunions), which pulls away from buying a book. |
| 10 | Products + `ReassuranceStrip` "From one page to a whole book" | Offer | Three cards with a "BEST FOR GIFTS" badge, every card's button is the same "Try a free coloring page", reference price a third time, then a six-item checklist with icon chips. None of it is the package. |
| 11 | FAQ "Good to know", 14 questions | Objections | Too many. Several answers describe the per-page model ("What does it cost to make pages?", "How much is a printed book?", "Can I order more than one copy?"). No question about packages, cancel, shipping in a package, extra photos or themes. |
| 12 | Final CTA "Start with one free coloring page", credit badge, 3 check bullets, button, sign-in link | Last push | Ends on the free tool, not the book. The sign-in link duplicates the header. |
| - | Sticky phone button "Try a free coloring page" | Persistent CTA | Fine mechanically (shows only once the hero button scrolls away). Will need the new label. |
| - | `HolidayToast` (home, while the date is set) | Christmas urgency | A pop-up on a phone over the sticky button. The top bar can carry the date alone. |

**Cross-page tells that make it read like a template ("slop"):**

- Ten uppercase eyebrows, one over every section heading.
- Green check bullets in six places (hero, products ×3, reassurance, best photos, final).
- The same claims repeated: "Exact price before you pay" ×5, "Printed in the US" ×6 on `/`,
  "No account" ×5.
- Icon-chip cards in Ideas, Reassurance, Why.
- One button label used 6 times, so no button means anything in particular.

**Trust gaps:**

- "Printed in the US" is on the owner-must-confirm list (`agent-reference.md` §8) and is used
  10 times in `src/content/marketing.ts`. Lulu routes print jobs; nothing in code guarantees the
  country. Remove until the owner confirms in writing.
- "First page in about a minute" (hero bullet) is on the same list.
- MadeGallery captions (above).
- TRANSFORM's "Every page on this site was made from a real family photo".
- No real photo of a printed book exists (`PRODUCT_PHOTOS` is empty). The binding photos
  (`binding-*.webp`) are close-ups of a violet cover and are fine as tile images, but nothing on the
  page shows a finished book of real family pages. This is the biggest proof gap for a book-first
  page and needs the owner (see §6, item 23).

**`/gift` today:** same skeleton with gift copy. Differences: holiday top bar "Order by December 7
for Christmas." instead of the offer bar, eyebrow "Christmas gifts", trust bullets "Ships to them,
not you / Printed in the US / Exact price before you pay", a timing pair ("Order by {date}" and a
$1 print-at-home "Need it sooner?"), and a "Why it works as a gift" band. Same problems as `/`
otherwise. Note: the holiday line says "Order by {date}". With packages, paying for the package is
not ordering the book; a buyer who pays on the 6th and orders on the 10th misses Christmas. The
copy must say "Place your book order by {date}".

**`/partners`:** structurally fine. Needs only the "Printed in the US" removals (trust bullet and
a why point).

---

## 3. The new landing page

### 3.1 Primary CTA decision

**Hero button: "Start your book" → `/studio/new`.** Secondary, directly under it as a text link:
**"Or try a free coloring page first" → `/studio`** (today's free flow, unchanged).

Why:

- The business now sells a book at one price. The highest-friction moment in the old funnel was
  discovering the price at the end and topping up a wallet. Book-first removes that, but only if the
  landing sends people into the book-first flow.
- `/studio/new` already works for guests: they see the tiles and prices, choose one, see what is and
  isn't included, and only then meet the sign-up gate (`01-ux-spec.md` §2.1). So "Start your book"
  is not a paywall in one tap; it is a price page that the visitor can leave.
- The free page stays one tap away for the cautious buyer, and it stays the way into the studio
  from every page that is not about buying (photo band, before/after link).
- A free page made as a guest does **not** count toward a package later (the pages move into the
  account as a separate album; moving an album onto a package is out of v1 scope). Leading cold
  traffic into the free path first therefore trains people into the pay-per-page album. That is a
  reason to put the book first and keep the free try as the secondary path.

Fallback: when no package is live (feature flag off, or no priced package), the hero reverts to
today's "Try a free coloring page" primary and "See how it works" secondary, and the "Choose your
book" section hides. See §5 for `packagesLive`.

The free-try path is never removed. On `/` and `/gift` it appears exactly twice: the hero text link
and the "Print as you go" line under the book tiles.

### 3.2 Target section order for `/`

| # | Section | Status |
|---|---|---|
| 0 | Top bar: Christmas date only (no sign-up offer) | Modify |
| 1 | Hero | Modify |
| 2 | Before and after (slider) | Modify (trim) |
| 3 | Design themes showcase | **New** |
| 4 | How it works (3 steps) | Modify (new copy) |
| 5 | Choose your book (package tiles) | **New** (replaces Products) |
| 6 | Who's coloring (photo band) | Modify (trim) |
| 7 | Gift strip | **New** (replaces Occasions) |
| 8 | FAQ (8 questions) | Modify |
| 9 | Final CTA with the brand line | Modify |

**Removed from `/`:** `FinishedBookSection`, `MadeGallery`, `WhySection`, `IdeasSection`,
`OccasionsSection`, Products cards, `ReassuranceStrip`, `HolidayToast`, `SignUpOfferBar`. Their
components stay in the repo (the gift and partner pages and future pages may use them); only the
section flags change.

Rhythm: cream hero band → white (slider) → **plum** (themes, the page's one dark room) → butter
(how it works) → cream (books) → white (photo band) → cream (gift strip) → white (FAQ) → plum photo
(final). No two adjacent bands share a color.

Eyebrows: keep them only on sections 2, 3 and 5 (three on the page, not ten). All other headings
stand alone.

---

#### Section 0: Top bar

**Purpose:** the one true urgency fact, and nothing else.

- Show `HolidayBanner` on `/` and `/gift` while the date is set. Remove the `SignUpOfferBar` from
  landing pages whenever `packagesLive` is true (keep the component; it may return if the owner
  wants it, see §6 decisions).
- Remove `HolidayToast` from `/` (the bar replaces it).
- Copy change, `HOLIDAY_LINE`: **"Place your book order by {date} for Christmas."**
- Layout: unchanged (`bg-v2-navy`, one line, 12px on phones). Not a link.

#### Section 1: Hero

**Purpose:** say what the product is, show the price honestly, one clear next step.

**Copy (`LANDING_PAGES.default`):**

| Element | Text |
|---|---|
| Eyebrow pill | (remove on `/`; `/gift` keeps "Christmas gifts" while the date is set) |
| Headline | **A coloring book** / **starring your family.** (second line keeps `v2-crayon-underline`) |
| Subhead | Choose your book and add your photos. Every page becomes a coloring page of the people you love, and we print it and ship it. |
| Primary button | **Start your book** |
| Secondary (text link under the button, not a second pill) | Or try a free coloring page first |
| Price line (replaces the price card) | Book packages from {packageFrom}. Shipping is added at checkout. |
| Trust bullets | (remove) |

Why "starring your family": it mirrors the gift page's proven line, names the product in the first
three words, and makes the people the subject.

**Layout:**

- 375px: photo on top (`aspect-[4/3]`, as today), then headline (keep `text-[2.6rem]`), subhead
  (max 3 lines at 375px; the copy above is 26 words), full-width white pill button, the text link
  centered under it (`min-h-11`, white, underline on hover), then the price line as plain text
  (`text-sm text-white/80`), not a card. Everything through the button must fit in the first screen
  at 375×812; the price line may sit just below.
- Desktop: as today (photo right, plum gradient left). Move the text block so it does not cover a
  face: cap the text column at `lg:max-w-[38rem]` and shift the photo's focal point with
  `object-position` (`object-[70%_center]` for `new-sibling`). Check at 1280 and 1440.
- Remove the price card component (`HERO_PRICE_TAG` block) and the `trustBullets` list from the
  hero markup for `/` and `/gift`. `/partners` keeps its bullets (see §3.5).

**Behavior:**

- Primary: `rememberIntent(intent)`, `trackCta("hero", intent, "book")` (see §4.4 for the new
  param), `router.push("/studio/new")`. No `markGuestTryFree()` on this path.
- Secondary: today's `startFree("hero")` with `target: "free"`.
- Image: keep `heroPhoto: "new-sibling"` on `/`, `kitchen-table` on `/gift`.

#### Section 2: Before and after

**Purpose:** prove the transformation with real photos.

**Copy (`TRANSFORM`):**

| Element | Text |
|---|---|
| Eyebrow | Before and after |
| Title | Made from your own photos |
| Body | These are real family photos and the coloring pages made from them. Drag to see both. |
| Fix box | (remove; touch-ups move into How it works) |
| Button | (remove) |
| Text link under the slider | Try it with one of your photos, free |

**Layout:** reuse `TransformSection` and `CompareSlider` as they are (switcher "Beach day" / "The big
catch"). Remove the `fixTitle/fixBody` box and the primary button. The text link calls
`startFree("hero", ...)` with location `transform` (add to `CtaLocation`), `target: "free"`.
375px: heading, switcher, slider, link. Desktop: unchanged two-column grid.

#### Section 3: Design themes (new)

**Purpose:** the differentiator. Nobody else draws your actual kids as ninjas.

**Copy (new `LANDING_THEMES` in `src/content/marketing.ts`):**

| Element | Text |
|---|---|
| Eyebrow | Themes |
| Title | Or draw them into another world |
| Body | Give your book a theme, like "Under the sea" or "Space explorers". Every page is drawn in that world, and everyone still looks like themselves. |
| Example caption | Theme: "Ninjas and warriors saving the city" |
| Ideas line (plain text, not chips) | Superheroes saving the city · Under the sea · Space explorers · Dinosaur safari · Fairy tale castle · Toy brick town |
| Small print | Optional. You choose a theme when you start your book, and you can change it later. |
| Button | Start your book |

(Quotes in body copy use the curly quotes the file already uses, “ and ”. The ideas line reads
from `DESIGN_THEMES.starters` so it can never drift from the wizard.)

**Images:** the three real pairs in `DESIGN_THEMES.examples` (`/marketing/theme-examples/ninja-{a,b,c}-{photo,page}.webp`).
Lead with **ninja-c** (two boys at a lake, the stick becomes a sword): it shows the best
"same kids, new world" contrast. Then b, then a.

**Layout:** plum band, edge to edge with the same inset and radius as `WhySection`
(`px-2 sm:px-3`, `rounded-[1.75rem] lg:rounded-[2.25rem]`), white text.

- Each example is one card: the **page** fills the card (white, `aspect-[3/4]`,
  `object-contain`, `rounded-2xl`), and the **photo** is pinned over its bottom-left corner as a
  small inset (`w-[34%]`, `aspect-[3/4]`, `rounded-xl`, 3px white ring, slight shadow, `-rotate-2`).
  Under the card, one line: "Photo → coloring page" is not needed; the inset makes it obvious.
  The inset is `alt=""`; the page carries the existing alt text.
- 375px: heading block, then ninja-c as one full-width card (max 20rem wide, centered), then b and a
  side by side in a 2-column grid at half size, then caption, ideas line, small print, and a
  full-width white button. No horizontal scroller.
- Desktop (`lg`): two columns, text left (`max-w-md`), three cards right in a row with the first one
  20% larger (`grid-cols-[1.2fr_1fr_1fr]`, items-end).
- Image size: the files are 480×640. At the desktop card size (about 300 CSS px) they are under 2x on
  retina. Ask the owner for 960×1280 exports (see §6 item 22); until then cap rendered width at
  `max-w-[20rem]` and use `loading="lazy"`.
- Fix the alt text of ninja-c in `DESIGN_THEMES.examples`: the boys are not holding hands. Use "Two
  boys at a lake, drawn as young warriors outside a castle".

**Behavior:** button → `/studio/new` with `trackCta("themes", intent, "book")` (add `themes` to
`CtaLocation`). Nothing on this section is interactive besides the button (no fake theme picker:
a guest cannot make a themed page, so a picker here would promise something the next screen
doesn't deliver).

**Honesty:** a free guest page is never themed (themes need an album in an account). Never write
"try a theme free".

#### Section 4: How it works

**Purpose:** three short steps so the price makes sense before the tiles.

**Copy (`HOW_IT_WORKS`, new `steps` when `packagesLive`; keep today's steps as `stepsPages` for the
fallback):**

| Element | Text |
|---|---|
| Title | How it works |
| Body | (remove) |
| Step 1 title | Choose your book |
| Step 1 body | A stapled booklet, a spiral bound book or a paperback. You pay once. |
| Step 2 title | Add your photos |
| Step 2 body | Each photo becomes a coloring page of the people in it. Not quite right? Type a touch-up, like “take out the stroller.” |
| Step 3 title | We print and ship it |
| Step 3 body | Check every page, then place your order. It ships to you, or straight to someone you're giving it to. |

**Layout:** reuse `HowItWorks` on the butter band, keep the numbered circles and arrows. Visuals:
step 1 the three `BINDING_PHOTOS` fanned (three small rotated images, `w-24`, overlapping), step 2
`StepPage` (unchanged), step 3 `StepBook` (or the `mail-day` lifestyle photo once it is `ready`).
Keep `id="how"` (the fallback hero link still points here). No button in this section.

#### Section 5: Choose your book (new, replaces Products)

**Purpose:** the offer. Mirrors the wizard's tiles so nothing changes between the landing and the
next screen.

**Copy (new `LANDING_BOOKS` in `src/content/marketing.ts`; tile lines reuse `BOOK_PACKAGES.tileLines`
and `BOOK_PACKAGES.tileButton` so the words are identical to the wizard):**

| Element | Text |
|---|---|
| Eyebrow | Books |
| Title | Choose your book |
| Body | One price covers your photos made into coloring pages[[, {touchUps} on each page]] and printing the book. Shipping is added at checkout. |
| Tile name | {bindingName} |
| Tile price | {packagePrice} |
| Tile line 1 | {includedPhotos} photos, each made into a coloring page |
| Tile line 2 | {touchUps} on each page |
| Tile line 3 | The printed {bindingNameLower} |
| Tile button | Choose {bindingName} |
| Under the tiles, line 1 | Each photo prints on its own page with a blank back, so markers don't bleed through. |
| Under the tiles, line 2 | Change your mind before you order the book? Cancel, and the unused value goes back to your account credit. |
| Print-as-you-go row (one row, not a card) | **Not ready for a whole book?** Make one page at a time and print it at home. [Try a free coloring page] |
| `/gift` only, under the tiles | Place your book order by {date} for Christmas. Delivery dates for your address are shown at checkout. |

The per-tile shipping note from the wizard ("Shipping is added when you order the book.") is said
once in the section body instead of three times.

**Layout:**

- Build `LandingBookTiles` in `src/components/v2/marketing/` that renders the same card as
  `PackageTiles` (binding photo 16:9, name and price on one line, three check lines, full-width
  primary button). Best: extract the single-tile markup from `PackageTiles.tsx` into an exported
  `PackageTileCard` and use it in both places, so the landing and the wizard can never differ. The
  "Print as you go" card is **not** rendered here; the landing uses the quiet row instead.
- 375px: one column, `gap-4`, tiles full width. Then the two small lines (`text-sm text-v2-muted`),
  then the print-as-you-go row (`rounded-2xl border border-gray-200 bg-white p-4`, title semibold,
  body muted, `v2-btn-outline min-h-11` button full width).
- `sm`: two columns. `lg`: three columns in one row, `max-w-6xl`. With 1 or 2 packages, keep tile
  width and center the row (as the wizard does).
- No "Most popular" or "Best value" badge (no data backs it). No crossed-out prices.
- Money: format with `formatCredits` exactly like `PackageTiles`, so "$24.00" on the landing is
  "$24.00" in the wizard. Tile order: `sortOrder`.

**Behavior:**

- Tile button: `rememberIntent(intent)`, write `cm_package_choice` the way the wizard does, fire
  `package_selected { format, value, currency }` plus `cta_click { location: "books", intent, target: "package" }`,
  then `router.push("/studio/new?book={bindingId}&step=pay")`. This lands on the wizard's summary
  ("What's included / Not included") with the choice kept, and a guest meets the sign-up gate there.
- Print-as-you-go button: `startFree("books")`, `target: "free"`.
- Hidden entirely when `packagesLive` is false.
- Server-rendered: the packages come with the landing's numbers (§5), so the tiles are in the HTML
  with no loading skeleton.

#### Section 6: Who's coloring

**Purpose:** a breath of emotion before the questions.

- Reuse `PhotoBand`. Title: **Kids, grandparents and everyone in between.** Remove the eyebrow and
  the body sentence (the captions already say it).
- Use at most four photos: `kitchen-table`, `living-room-floor`, `fridge`, `dog-coloring` (the hero's
  own photo is excluded as today). Set `PHOTO_BAND.ids` to those four.
- 375px: keep the sideways snap row. Desktop: four across.
- Captions stay scene labels ("Grandma's kitchen table"). Never captions that read like quotes.

#### Section 7: Gift strip (new, replaces Occasions on `/`)

**Purpose:** route gift buyers to `/gift` without a card grid.

**Copy (new `LANDING_GIFT_STRIP`):**

| Element | Text |
|---|---|
| Title | Giving it as a gift? |
| Body | It can ship straight to them, with a note from you on the first page. |
| Body while the date is set | It can ship straight to them, with a note from you on the first page. Place your book order by {date} for Christmas. |
| Link | Gift a book → `/gift` |

**Layout:** one cream band, `max-w-5xl`, a single row on desktop (`kitchen-table` lifestyle photo
`aspect-[3/2] w-64 rounded-2xl` left, text middle, `v2-btn-outline` link right); stacked on phones
(photo full width, text, full-width outline button). No icon chip. Track with
`trackCta("occasion", "gift")` (existing location value).

`/partners` is reachable from the footer ("For businesses"); it is removed from the homepage body.

#### Section 8: FAQ

**Purpose:** answer the real objections of a book buyer, honestly. Eight questions on `/`.
Answers use tokens; a question whose answer can't be filled uses its `fallback` or hides.

New shared entries in `FAQ.items` (ids in brackets); `/` uses `commonFaq` in this order:

1. **[package] How does a book package work?**
   Choose a stapled booklet, a spiral bound book or a paperback and pay once. The price covers your
   photos made into coloring pages[[, {touchUps} on each page]] and printing the book. Shipping is
   added when you order the book.
2. **[shipping] Is shipping included?**
   No. Shipping is added when you place your book order. You see the shipping price and delivery
   dates for your address before you pay.
3. **[morePhotos] What if I have more photos than my book includes?**
   You can still add them. Each extra photo is {pagePrice} from your account credit, and you see
   the price before anything is charged. Extra pages also add to the printing price of the book.
   *Fallback:* You can still add them. Extra photos are paid from your account credit, and you see
   the price before anything is charged. Extra pages also add to the printing price of the book.
4. **[cancel] Can I change my mind?**
   Yes, any time before you order the book. You get back what you paid, minus {pagePrice} for each
   coloring page already made. It goes to your account credit, not back to your card.
   *Fallback:* Yes, any time before you order the book. You get back what you paid, minus the price
   of the coloring pages already made. It goes to your account credit, not back to your card.
5. **[tryFree] Can I try it before I buy?**
   Yes. Make a coloring page from one of your photos without an account, up to a daily limit, and
   print it at home for free.
6. **[themes] What is a theme?**
   An optional world for your whole book, like “Under the sea.” Every new page is drawn in it, and
   everyone still looks like themselves. You can change or remove it later. Pages you've already
   made stay as they are.
7. **[bleed] Will markers bleed through?** (rewrite of the existing `bleed`)
   Not onto another picture. Each photo prints on its own page with the back left blank.
8. **[safe] Is it safe to upload photos of my kids?** (existing, unchanged)

Plus **[deadline]** (existing) between 2 and 3; it hides itself when no date is set. Rewrite its
answer: "Place your book order by {date} for Christmas. Delivery dates for your address are shown at
checkout before you pay."

Remove from `/`: `account`, `cost`, `photos`, `fix`, `price`, `adults`, `events`, `gift`, `time`,
`copies`, `business`. They stay in `FAQ.items` for other pages.

Accuracy notes for the developer (checked against `00`, `01`, `BOOK_PACKAGES`, and
`agent-reference.md` §5.8): refunds go to the wallet only, also for card purchases; refund =
price paid − pages made × the page price; extra print cost is charged at order (`orderExtraPages`);
blank backs are locked on for package books (`orderBlankBacksLocked`). If any of those change,
change the FAQ in the same PR.

Layout: unchanged `details` list, `max-w-3xl`. Heading **Questions**, no eyebrow, no "Good to know".
The JSON-LD in `landingRoute.tsx` follows automatically.

#### Section 9: Final CTA

**Copy (`FINAL_CTA`):**

| Element | Text |
|---|---|
| Title | Color the moments that matter. |
| Body | Choose your book, add your photos, and we'll print it for you. |
| Credit badge | (remove) |
| Points | (remove) |
| Primary button | Start your book |
| Secondary text link | Or try a free coloring page first |
| Sign-in link | (remove; it is in the header and footer) |

Layout: unchanged plum photo band. Photo: first ready of `FINAL_CTA_PHOTOS` (`mail-day` once ready,
else `dog-coloring`). Fallback when `!packagesLive`: title "Start with one free coloring page",
body as today, button "Try a free coloring page".

#### Sticky phone button

Label **"Start your book"** → `/studio/new` (`trackCta("sticky", intent, "book")`). Fallback label
"Try a free coloring page" when `!packagesLive`. `aria-label`: "Start your book".

#### Footer

Add the brand line above the copyright row: "Color the moments that matter." (`text-sm
font-semibold text-v2-ink`). Nothing else changes.

### 3.3 `/gift` deltas

Same component and order, with these differences:

| Section | `/gift` |
|---|---|
| Top bar | Holiday line (as today, new wording) |
| Hero | Eyebrow "Christmas gifts" while the date is set (pill stays, it's the only one). Headline unchanged: "A coloring book / starring the grandkids." Subhead: **Fill a book with this year's family photos. We print it and ship it straight to them, with a note from you on the first page.** Buttons and price line as on `/`. Trust bullets removed. |
| 2 | Before and after: as `/` |
| 3 | **Gift points** (reuse `WhySection` but in cream, not plum, and without the use-case pills and the best-photos box): "A gift only you can give" / "Anyone can buy a coloring book. Only you can fill one with the people they love." / points: Add a note, Ships to them, Check every page first (current text, unchanged). Photo: `fridge`. |
| 4 | Themes: plum band, as `/`, but body: "Make the grandkids superheroes, astronauts or ninjas. Every page is drawn in that world, and everyone still looks like themselves." |
| 5 | Choose your book, with the `/gift` Christmas line under the tiles |
| 6 | How it works: as `/` |
| 7 | (no photo band, no gift strip) |
| 8 | FAQ: the page's own gift questions first ("How does the gift note work?", "Can it ship straight to the grandparents?", "Can I see the book before I pay?"), then `package`, `shipping`, `deadline`, `cancel`, `tryFree`, `safe`. Remove "What if it won't arrive in time?" (it sells the $1 PDF, which the owner's brief wants repriced and which no package covers). |
| 9 | Final CTA as `/` |
| Removed | `GiftTimingSection` (the top bar and the line under the tiles carry the date), `MadeGallery`, `FinishedBookSection`, Products, Occasions |

**Gift intent check:** the landing must call `rememberIntent("gift")` before navigating to
`/studio/new`. The old wizard (`V2BookOrderWizard.tsx`) reads the intent to tick "This is a gift";
`src/components/v2/studio/order/useBookOrder.ts` starts with `isGift = false` and was not seen to
read the intent. Verify that a package album ordered from a `/gift` visit opens with "This is a
gift" ticked and the recipient form open (agent-reference §5.5); fix if not (§6 item 15).

### 3.4 What "packagesLive" changes, in one table

| Element | packagesLive | not live (flag off or no priced package) |
|---|---|---|
| Hero primary | Start your book → `/studio/new` | Try a free coloring page → `/studio` |
| Hero secondary | Or try a free coloring page first | See how it works (#how) |
| Hero price line | Book packages from {packageFrom}… | hidden |
| Top bar | holiday line only | holiday line, else `SignUpOfferBar` (today) |
| Themes button | Start your book | Try a free coloring page |
| How it works | book steps | today's steps (`stepsPages`) |
| Choose your book | shown | hidden |
| FAQ | package questions | today's list |
| Final CTA, sticky | Start your book | today |

### 3.5 `/partners` consistency fixes only

- `trustBullets`: replace "Printed in the US" with "Printed to order and shipped".
- `why.points[2]`: title "Printed to order", body "Printed books are made to order and shipped."
- Nothing else. The partners page keeps its email-first CTA and its own "Try a free coloring page".

---

## 4. Funnel recommendations

### 4.1 The path and where people drop

```
Ad (TikTok/IG/FB, phone, in-app browser)
 → / or /gift ─┬─ Start your book ─► /studio/new tiles ─► Choose ─► Pay summary
               │                                              └─ guest: sign-up gate ─► /sign-up ─► (email confirm?) ─► back to Pay
               │                                                   ─► Stripe Checkout ─► return ─► Theme ─► album: add photos
               │                                                   ─► make pages, touch-ups ─► Order: address, shipping ─► place order
               └─ Or try a free page ─► /studio ─► free page ─► save prompt / upsell ─► account ─► pay-per-page album
```

| Drop point | Why people leave | Change |
|---|---|---|
| Landing → wizard | Unclear product or price shock | The landing now shows the tiles and prices, so the wizard repeats what they already chose. Deep link the tile to `?book=…&step=pay`. |
| Pay → sign-up gate | Account wall in an in-app browser | Keep (account is needed to hold paid money). Keep the gate body short. If email confirmation opens in another browser, the `book` param in `next` still restores the choice. Make sure the confirmation email's `next` keeps `book` and `step` (verify with a stubbed sign-up). |
| Stripe | Normal payment drop | Nothing on the landing can fix this. Make sure Stripe Checkout shows the product name "Stapled booklet package" and the album, not a generic line. |
| After paying, filling 20 to 40 photos | Long task, done later | Home "Your {bindingNameLower} is ready to fill" card exists (spec §2.5). Reminder emails are not built (agent-reference §9, item 4); they are the biggest lever after launch. |
| **Order: shipping from the wallet** | The two-step "add $X and continue, then place order" comes back for shipping | **Biggest remaining funnel hole.** A package buyer finishes their book and then meets a wallet top-up for shipping and its tax (`00` A6: "shipping and shipping tax are charged from the wallet, top-up if short, as today"). The welcome credit rarely covers it. Fix with a one-step card payment for the order's due amount (Stripe Checkout, place the order on return, same idempotent pattern as packages). This is a money-flow change: owner decision, own branch, tested with Stripe test mode. See §6 item 16. |
| Free path → book | The free page lives in a pay-per-page album and can't join a package | See 4.2. |

### 4.2 In-studio nudges toward the book

1. **`V2BookUpsellCard` ("Turn this into a book") for guests and pay-per-page albums while
   `packagesLive`:**
   - Title: **Make it a book**
   - Line: **Book packages from {packageFrom}: your photos as coloring pages, printed and shipped.**
     (hide the line if the token is empty and fall back to today's "Add {more} more pages…")
   - Primary button: **See the books** → `/studio/new` (was "Make a book" → order panel).
   - Secondary: "Add more photos" (unchanged).
   - Keep "Make a book" → order panel for signed-in pay-per-page albums that already have enough
     pages for the smallest binding (they are ready to order; sending them to buy a package would
     double-charge their pages).
   - Needs `{packageFrom}` in the studio: extend `/api/marketing/numbers` (used by
     `useMarketingNumbers`) with the same package fields.
2. **`V2SavePromptCard`** (guest, after page 1 and page 3): keep, it is the account step. Keep
   `{freeSheets}` here, inside the studio: the credit is genuinely useful for extra photos and
   touch-ups. Body: "A free account keeps your pages safe and lets you start a book." (replace the
   current body).
3. **Guest limit modal (`V2GuestLimitModal`):** add a second line under the body when
   `packagesLive`: "Or start a book: your photos and the printing, for one price." with a text link
   "See the books" → `/studio/new`.
4. **Do not** add a package banner inside a pay-per-page album beyond the upsell card. `01-ux-spec.md`
   §6.8 keeps v1 light; a nag on every screen would undo the "calm" studio.
5. **Owner decision (later):** "Use the pages I already made" when a person who made free or
   pay-per-page pages buys a package (count them as included photos, no regeneration). Today those
   pages stay in their own album. Until this exists, the landing must not imply that a free page
   becomes part of a book; the copy in §3 does not.

### 4.3 Message match with ads

- Ads that show the ninja/superhero transformation should link to `/#themes` (give section 3
  `id="themes"` and `scroll-mt-20`).
- Ads about the grandparents' gift link to `/gift`.
- Keep `utm_*` handling as it is (`cm_attr`).

### 4.4 Analytics changes (fixed enums only, never free text)

- `cta_click`: add `target: "book" | "package" | "free"` (which path the tap starts). Add
  `CtaLocation` values `"transform"`, `"themes"`, `"books"`. Update `VENDOR_EVENT_NAMES` if the
  vendor mapping lists params.
- `package_selected`: add `from: "landing" | "wizard"`.
- `package_viewed` already carries `intent`; it works only if the landing calls `rememberIntent`
  before routing (it does in §3).
- Never send the theme text, the starter text shown on the landing, or a binding name string beyond
  the existing `TrackFormat` enum.
- Report to watch after launch: landing `cta_click{target}` split → `package_viewed` →
  `package_selected` → `package_pay_started` → `package_purchased`, by `intent` and `utm_source`.

---

## 5. New tokens

All computed on the server in `src/server/marketing/marketingNumbers.ts` from the same function the
wizard's API uses (`listBuyablePackages()` in `src/server/bookPackagesService.ts`: active, priced,
fitting packages, ordered by `sort_order`). Never from code constants.

### 5.1 Data added to `NumbersInput` (`src/lib/marketing/copy.ts`)

```ts
/** A package as the landing shows it. Same fields as BookPackage. */
export type MarketingPackage = {
  bindingId: BookBindingId;
  includedPhotos: number;
  editsPerPhoto: number;
  priceCents: number;
  sortOrder: number;
};

export type NumbersInput = {
  // ...existing fields...
  /** Buyable packages, or null when the feature is off (BOOK_PACKAGES_ENABLED false) or unreadable. Empty array = none priced. */
  packages: MarketingPackage[] | null;
};
```

- `getBookPackagesForMarketing()`: `unstable_cache(listBuyablePackages, ["marketing-book-packages-v1"], { revalidate: 60 * 60, tags: ["marketing-book-packages"] })`,
  throws on error so a failure is never cached, wrapped to return null on error (same pattern as
  `getPagePrice`). Returns null when `BOOK_PACKAGES_ENABLED` is false.
- `refreshBookPackages()`: `revalidateTag("marketing-book-packages", { expire: 0 })` and
  `revalidatePath` for every landing path. Call it from the admin package save route
  (`src/app/api/admin/book-packages/*`) after a successful update, exactly like
  `refreshWelcomeFreeSheets()`.
- `/api/marketing/numbers` returns the new field too (studio upsell card).

### 5.2 Page-level tokens (added to `CopyValues` and `numberValues()`)

| Token | Meaning | Computed as | Hidden when |
|---|---|---|---|
| `{packageFrom}` | Lowest package price | `formatCredits(min(priceCents))` over `packages` | `packages` null or empty |
| `{photosRange}` | Included photos across packages: "20 to 40" or "20" with one package | min and max of `includedPhotos` | same |
| `{editsEach}` | Free touch-ups per page, only when every package has the same number and it is above 0 | the shared `editsPerPhoto` | packages differ, or 0, or none |
| `{touchUps}` | `{editsEach}` as words: "2 free touch-ups", "1 free touch-up" | `plural(editsEach, "free touch-up", "free touch-ups")` | same as `{editsEach}` |
| `{pagePrice}` | (existing) wallet price of one page | existing | existing |
| `{date}` | (existing) | existing | existing |

`packagesLive` is not a token: it is a boolean the page computes (`(numbers.packages?.length ?? 0) > 0`)
to switch the layout per §3.4.

Note on "from": `agent-reference.md` §8 forbids "Printed books from $X" because the old number was
one example book, not a minimum. `{packageFrom}` **is** the minimum of what is sold as a package,
and the copy says "Book packages from", not "Books from" (a small pay-per-page book can cost less).
Keep that exact wording.

### 5.3 Tile tokens (per package, reused from the wizard)

Filled with `packageTokens(pkg)` from `src/lib/bookPackages/copy.ts` plus `{packagePrice}`:

| Token | Source |
|---|---|
| `{bindingName}`, `{bindingNameLower}` | `BOOK_BINDINGS[bindingId].shortLabel` (via `packageTokens`) |
| `{includedPhotos}` | `included_photos` |
| `{editsEach}`, `{touchUps}` | `edits_per_photo` (line 2 is dropped when 0, as the wizard does) |
| `{packagePrice}` | `formatCredits(price_cents)` |

Fill tile copy with `fillPackageCopy`, page copy with `fillCopy`. Both hide a line with a missing
token. A tile with no price never exists (the server filters it).

### 5.4 Tokens to retire from the landing

`{price}`, `{refPages}`, `{refFormat}` (the reference book) and `{freeSheets}` / `{freePages}` are no
longer used on `/` and `/gift` while `packagesLive`. Keep them in the code: the studio, the
fallback layout and `/partners` still use some of them.

---

## 6. Prioritized change list

Each item is one developer task. Files are the main ones; follow imports. Run `npx tsc --noEmit`,
`npx eslint src` (13 baseline errors) and view `/`, `/gift`, `/partners` at 375, 320 and desktop
after each group. Do not click through to generation; stub `/api/photo-coloring`.

**Must**

1. **Package numbers for marketing.** Add `MarketingPackage`, `packages` to `NumbersInput`,
   `getBookPackagesForMarketing()`, `refreshBookPackages()` (call from the admin package save route),
   page tokens `{packageFrom}`, `{photosRange}`, `{editsEach}`, `{touchUps}`, and the field in
   `/api/marketing/numbers`. Files: `src/server/marketing/marketingNumbers.ts`,
   `src/lib/marketing/copy.ts`, `src/lib/marketing/landingValues.ts`,
   `src/app/api/marketing/numbers/route.ts`, `src/app/api/admin/book-packages/*`.
2. **`packagesLive` switch and hero.** New hero copy for `/` and `/gift`, remove price card and trust
   bullets, primary "Start your book" → `/studio/new` with `rememberIntent`, secondary text link to
   the free flow, price line, fallback per §3.4, desktop focal point. Files:
   `src/content/marketing.ts` (`LANDING_PAGES`, new `HERO_BOOK` copy object), `V2LandingPage.tsx`.
3. **Choose your book section.** Extract `PackageTileCard` from `PackageTiles.tsx`, build
   `LandingBookTiles`, `LANDING_BOOKS` copy, deep link to `?book=…&step=pay`, print-as-you-go row,
   `package_selected` with `from: "landing"`. Replace the Products section and `ReassuranceStrip` on
   `/` and `/gift`. Files: `src/components/v2/book-packages/PackageTiles.tsx`, new
   `src/components/v2/marketing/LandingBookTiles.tsx`, `V2LandingPage.tsx`, `marketing.ts`.
4. **Themes showcase section.** `LANDING_THEMES` copy, `ThemesShowcase` component (page with photo
   inset, ninja-c first), `id="themes"`, fix the ninja-c alt text. Files: new
   `src/components/v2/marketing/ThemesShowcase.tsx`, `marketing.ts` (`DESIGN_THEMES.examples`),
   `V2LandingPage.tsx`.
5. **Remove unconfirmed claims everywhere.** Delete or reword every "Printed in the US" (10 strings
   in `marketing.ts`: `WHY_FAMILIES`, gift/partners/story `trustBullets`, partners why point,
   `FINISHED_BOOK.body`, `REASSURANCE`, `FINAL_CTA.points`, `UPSELL.enough`, `PRODUCTS`, header
   comment) to "printed to order and shipped" or remove; remove "First page in about a minute" from
   `trustBullets`; change `TRANSFORM.body` per §3.2.
6. **MadeGallery off the landing pages.** Set `madeGallery: false` in `CONSUMER_SECTIONS` until the
   owner confirms (item 21). File: `marketing.ts`.
7. **Section list for `/` and `/gift`.** Turn off `occasions`, `finishedBook`, `products`,
   `reassurance`, `priceLine`, `giftTiming` (gift), `bestPhotos`; drop `IdeasSection` and
   `WhySection` on `/`; add flags `themes`, `books`, `giftStrip`; render in the §3.2 / §3.3 order.
   Remove `HolidayToast` from `/`. Files: `marketing.ts` (`LandingSections`), `V2LandingPage.tsx`.
8. **Top bar.** Hide `SignUpOfferBar` on landing pages while `packagesLive`; `HOLIDAY_LINE` →
   "Place your book order by {date} for Christmas."; also on `/`. Files: `V2LandingPage.tsx`,
   `marketing.ts`.
9. **FAQ.** Add `package`, `shipping`, `morePhotos`, `cancel`, `tryFree`, `themes`; rewrite `bleed`
   and `deadline`; new `commonFaq` lists for `/` and `/gift`; heading "Questions". File:
   `marketing.ts`.
10. **How it works, final CTA, sticky button.** New steps with `stepsPages` fallback, binding-photo
    visual for step 1, final CTA with the brand line, sticky label. Files: `marketing.ts`,
    `V2LandingPage.tsx`.

**Should**

11. **Before/after trim.** Remove the fix box and button, add the "Try it with one of your photos,
    free" link with location `transform`. Files: `V2LandingPage.tsx` (`TransformSection`),
    `marketing.ts`.
12. **Gift strip** on `/`, replacing Occasions. New `GiftStrip` in `LandingSections.tsx`,
    `LANDING_GIFT_STRIP` copy.
13. **Photo band trim** (four photos, no eyebrow or body). `marketing.ts` (`PHOTO_BAND`).
14. **Analytics params.** `cta_click.target`, new `CtaLocation` values, `package_selected.from`.
    Files: `src/lib/marketing/events.ts`, `src/lib/track.ts` (`trackCta` signature),
    `src/content/marketing.ts` (`CtaLocation`).
15. **Gift intent on package orders.** Verify a `/gift` visit → package → order panel ticks "This is a
    gift" and opens the recipient form; wire `readIntent()` into `useBookOrder.ts` if not.
    Files: `src/components/v2/studio/order/useBookOrder.ts`, `BookOrderPanel.tsx`.
16. **One-step card payment for the book order's due amount** (shipping, tax, extras). Owner
    decision required (money flow). Own branch; Stripe test mode; reuse the package checkout's
    confirm-on-return pattern. Files: `src/server/ordersService.ts`, `src/app/api/orders/*`,
    `src/components/v2/studio/order/*`, Stripe webhook.
17. **Studio upsell for book packages.** `V2BookUpsellCard` copy and target per §4.2, save prompt
    body, guest limit modal line. Files: `V2BookUpsellCard.tsx`, `V2SavePromptCard.tsx`,
    `src/components/v2/auth/V2GuestLimitModal.tsx`, `marketing.ts` (`UPSELL`, `SAVE_PROMPT`,
    `GUEST_LIMIT`), the studio caller in `ColorfulMemoriesApp.tsx`.
18. **`/partners` consistency** (§3.5). File: `marketing.ts`.
19. **Share images and meta.** Update `LANDING_PAGES.default.title/description` to the book:
    title "A coloring book starring your family | Colorful Memories", description "Choose your book
    and add your family photos. Every page becomes a coloring page of the people you love, printed and
    shipped. Try a page free, no account needed." Re-run `node scripts/generate-share-images.mjs`.

**Could**

20. A `/themes` landing page (same component, `intent: "themes"`, hero = ninja-c pair) for theme
    ads, once item 4 has data.
21. **(Owner)** If the MadeGallery photos are real customer photos with written permission, bring
    the gallery back on `/` only, after section 6, with heading "Out in the world" and scene-label
    captions (no first-person or quote-like lines). If they are staged, delete the section.
22. **(Owner)** Export the ninja pairs at 960×1280 (and a 1200×900 crop of ninja-c for the share
    image). Add `-400`/`-800` siblings via the existing image script and use `marketingSrcSet`.
23. **(Owner)** Real photos of each printed package book (one per binding, closed and open, in a real
    home). Put them in `PRODUCT_PHOTOS` and use them as the tile images instead of the binding
    close-ups. This is the largest remaining proof gap.
24. `mail-day` lifestyle photo (prompt exists in `landing-redesign.md` §4) for step 3 and the final
    CTA.

### Owner decisions (with the default to use if no answer)

| # | Decision | Default |
|---|---|---|
| A | Hero primary is "Start your book" (book first) instead of "Try a free coloring page" | **Yes, book first**, free try as the visible secondary. Revisit after two weeks of `cta_click.target` and `package_purchased` data. |
| B | Sign-up offer bar on `/` and `/gift` | **Hidden while packages are live.** Its credit can't pay toward a package (no split payment). The gift stays in the studio save prompt. |
| C | MadeGallery photos: real customers with permission, or staged? | **Treat as staged: remove from landing pages.** |
| D | "Printed in the US" | **Remove** until confirmed in writing (Lulu's routing is not controlled in code). |
| E | One-step card payment for the order's shipping | **Build it** (item 16) before scaling ad spend; it is the only place the old two-step friction remains. |
| F | Shipping in the package price (the owner's brief recommends all-inclusive) | **Keep shipping separate for launch** (that's what is built and tested). Strongly consider including standard US shipping later; the brief itself names a shipping surprise at checkout as a top abandonment reason. If it changes, swap the price line to "Book packages from {packageFrom}, US shipping included." and remove FAQ `shipping`. |
| G | "Use my free pages in my book" | **Not in v1.** The landing copy promises nothing about it. |
| H | Headline "A coloring book starring your family." | **Use it.** |
| I | "First page in about a minute" | **Drop from the hero.** Keep "about a minute" in the studio only, where it describes what the person is about to see. |

---

## 7. Do-not-do list

1. **No numbers in code.** No "$24", "20 photos", "2 touch-ups", "December 7" in a component or in
   `marketing.ts`. Tokens only. The packages are test-priced today; any hardcoded number will be
   wrong in production.
2. **No "Books from {packageFrom}".** It must say "Book packages from". A small pay-per-page book can
   cost less.
3. **No invented proof.** No testimonials, star ratings, "loved by N families", customer counts,
   "most popular" or "best value" badges, review carousels, or quote-like photo captions. Captions
   are scene labels.
4. **No unconfirmed claims:** "Printed in the US", delivery times, "arrives by Christmas", "free
   shipping", "satisfaction guaranteed", "money-back", "full refund". The refund is partial and goes
   to account credit; say exactly that.
5. **No "AI"** in any customer-visible string, alt text, page title, meta description or share image.
   Not "smart", not "magic", not "generated" either. Say "drawn" or "made".
6. **No em dashes** (—) and no en dashes used as dashes. Use a period or a comma. Check with
   `grep -n "—" src/content/marketing.ts`.
7. **No "sheet", "project", "generate"** in visible text. "Coloring page", "album", "make".
8. **No badge soup.** One eyebrow pill in the hero at most (gift page only), three section eyebrows
   on the whole page, no stacked pills, no icon chips on every line, no check bullets outside the
   package tiles and the gift points.
9. **No repeated CTAs.** "Start your book" appears in the hero, themes, sticky button and final
   section. "Try a free coloring page" appears twice. Do not add buttons to the photo band, how it
   works, the FAQ or the before/after.
10. **No fake urgency.** No countdowns, no "only N left", no "offer ends", no pop-ups. The only
    urgency is the real Christmas order-by date, in the top bar and on `/gift`.
11. **No interactive theme picker on the landing.** A guest can't make a themed page; a picker would
    promise something the next screen doesn't do. No "try a theme free".
12. **No generated example pages.** The theme examples and before/after pairs are real photos with
    permission. Do not add a "sample" themed page made for marketing.
13. **Don't fork the tile.** The landing's package cards and the wizard's must be the same component
    and the same copy keys, formatted with `formatCredits`.
14. **Don't promise free pages carry into a book.** They don't in v1.
15. **Don't put the sign-up credit next to the book price.** It can't pay toward a package.
16. **Don't delete the fallback.** With `NEXT_PUBLIC_BOOK_PACKAGES=off` or no priced package the page
    must still render a complete, correct free-try landing.
17. **Don't touch the studio's free first page** (auto-generation for first-time guests, `/studio`
    with no dialog). The free path is unchanged.
18. **Don't send text to analytics.** New params are fixed enums. Never the theme, the starter's
    text, an album name or a file name.
19. **Don't make a wall of text.** Body copy under any heading is at most two sentences on a phone.
    If a section needs more, it is two sections or an FAQ answer.
20. **Don't trigger real generations, sign-ins or payments while testing.** Stub `fetch`
    (agent-reference §12). Verify in a browser at 375px and 320px; say which checks were browser
    checks and which were code review.
