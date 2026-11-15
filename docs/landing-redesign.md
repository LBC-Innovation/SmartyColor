# Landing page redesign (Nov 2026)

What we learned from legacybox.com, what we changed on our landing pages, and the image prompts
for the new lifestyle photos.

## 1. What Legacybox does well

**Look and feel**

- **Warm, papery base.** The page background is an off-white cream (`#FBFAF7`), not a cool
  SaaS white. Body text is a near-black green (`#091715`).
- **Strong section rhythm.** Bands alternate cream → butter yellow (`#FBF7C9`) → deep green
  (`#073F35`) → near-black (`#091715`). Every scroll lands on a new "room", so the page never
  feels like one long list of white cards.
- **Two typefaces with jobs.** A big editorial serif (Sentient, 56–94px, italic for the price)
  for headlines, and DM Sans for everything else. Headlines are huge and short: "Just add
  memories." "If it matters to you, we can preserve it."
- **One loud CTA color.** Chartreuse pill buttons (`#E4F26C`) on dark, red for promos. You
  always know what to click.
- **People first, product second.** The hero is a full-bleed photo of a toddler walking with
  their parents. The product box sits in the corner. Further down is a band of family photos
  (newborn, grandparents' wedding, a day on a boat).
- **Hand-drawn "How it works".** Three line-drawn illustrations on a butter-yellow band. It's warm
  and human, and it breaks up the photography.

**Sales funnel**

1. Entry modal: "Who are you shopping for today? Myself / Someone else". It splits buyers from
   gifters on the first tap.
2. Countdown bar plus a price-led hero ("Our $778 Closet… Only $239. Includes everything.").
3. Tier cards right on the homepage (Starter → Trunk), each with a picture, the crossed-out price
   and a "Save $X" badge. You can buy without leaving the homepage.
4. How it works (3 steps), then what we digitize (format grid), then the app/sharing story, then
   trust (2M families, reviews, support, made in the USA), then a big emotional quote, then the
   factory story.
5. Product page: star rating and review count at the top, tier picker, output picker, what's
   included, FAQ, then thousands of reviews.

**What we should not copy:** fake-looking anchor prices, countdown timers that reset, an entry
modal that blocks the page, and tearful nostalgia. Our marketing copy rules
(`src/content/marketing.ts`) only let us say things the product actually does.

## 2. Where our page fell short

- **Cool and generic.** We used a cool white background with the same white-card, icon-chip pattern
  in every section. It reads like a SaaS template, not a family keepsake.
- **The magic is hidden.** The photo-to-coloring-page transformation is our whole pitch, but the
  hero showed it as two small tilted thumbnails.
- **Almost no people.** We had two real photos and no pictures of anyone coloring, gifting or
  putting a page on the fridge, so there was nothing to feel.
- **No visual rhythm.** Every section was white or near-white, with no dark or warm bands.
- **Weak product cards.** They were all icons and text. There was no picture of what you get and
  the price was small.
- **"How it works" was icon boilerplate**, even though we sell drawings and the step visuals
  could be our own line art.

## 3. What changed

| Area | Change |
| --- | --- |
| Palette | The landing pages use a warm cream base (`--color-v2-cream`), a butter band (`--color-v2-butter`) and a deep plum band (`--color-v2-plum`). Violet stays the one CTA color, and the logo's coral, amber and blue are used for accents. |
| Headline | The second line is solid violet with a hand-drawn crayon underline, replacing the gradient text. It's playful and on-theme, and it wraps cleanly. |
| Hero | A **drag-to-compare slider** turns the family photo into its coloring page under your finger. It sweeps once on load (skipped with reduced motion) and works with the keyboard and screen readers. The printed book is tucked on the corner, and the price is now a pill under the button. |
| Photo band | **New**: a band of lifestyle photos ("Grandma's kitchen table", "A rainy Saturday"…). It only shows once the images exist (see §4). |
| How it works | Moved to the butter band. Each step shows a real visual (phone with the photo, the coloring page, the printed book), uses big colored numbers and has a dashed path between steps. |
| Why section | Now the dark plum band, the page's one dark "room", with the before/after as framed prints. |
| Occasions | Cards show a lifestyle photo on top once one is ready. |
| Products | Each card leads with a picture of what you get (a coloring page, the printed book), and the price is bigger. |
| Final CTA | Shows the "mail day" lifestyle photo next to the pitch once it is ready. |

Things we deliberately did **not** add: fake discounts, countdowns, review counts or customer
numbers we don't have. The testimonials section still renders only real, consented quotes.

## 4. Lifestyle images

Slots are listed in `LIFESTYLE_PHOTOS` in `src/content/marketing.ts`. Each one stays hidden until
its `ready` is `true`.

**To add one:**

1. Generate it in ChatGPT with the prompt below. Use the size it asks for (landscape 3:2 or
   portrait 2:3, the closest ChatGPT offers).
2. Save the PNG as `public/marketing/lifestyle/<id>.png` (for example `kitchen-table.png`).
3. Run `node scripts/prepare-lifestyle-images.mjs`. It writes `<id>.webp` plus `-400` and `-800`
   siblings, and prints the width and height.
4. In `LIFESTYLE_PHOTOS`, set `ready: true` and the printed width and height.

These are illustrative scenes, not customers. Don't caption them as reviews or real orders. The
"See the finished book" gallery (`PRODUCT_PHOTOS`) is still for **real** photos of printed books.

### Shared style block (paste at the end of every prompt)

> Photorealistic candid lifestyle photograph, shot on a full-frame camera with a 50mm lens at
> f/2, natural window light, warm late-afternoon tones, soft shallow depth of field, real skin
> texture and natural imperfections, true-to-life hands with five fingers. Colour palette: warm
> creams, honey wood, white, with pops of coral, sunny yellow, sky blue and violet from crayons
> and clothing. Mood: joyful, playful, mid-laugh, energetic, everyday. Not sentimental: no tears,
> no sepia, no vintage filter, no grain overlay, no heavy vignette. The coloring pages in the
> scene are clean black-and-white line-art drawings (bold even outlines, no shading) that
> clearly show the same people in the scene, some areas colored in with crayon. No text, no
> logos, no brand names, no watermarks, no captions.

### 1. `kitchen-table`: grandparent and grandkid (landscape 3:2)

> A grandmother in her late 60s with silver hair in a loose bun and a chunky cardigan sits at a
> sunny kitchen table beside her 6-year-old granddaughter. They are both laughing at something
> the girl just colored. The girl kneels on her chair to reach, holding up a violet crayon. On
> the table is a coloring page that is a line drawing of the two of them together, half colored
> in, plus a scattered box of crayons and a mug of tea. Camera at table height, slightly to the
> side, both faces visible.

### 2. `living-room-floor`: siblings on a rainy day (landscape 3:2)

> Two siblings, a boy about 8 and a girl about 5, lie belly-down on a soft rug in a bright
> living room on a rainy afternoon. Raindrops are visible on the big window behind them and
> they're in cozy socks. Each is coloring a page that is a line drawing of their own family on
> a beach. The little girl is pointing at her brother's page and giggling. Crayons and a few
> finished pages are fanned out around them. Shot from a low angle near the floor.

### 3. `fridge`: proudly on the fridge (portrait 2:3)

> A 5-year-old boy with a gap-toothed grin stands on tiptoe, pressing a colored-in coloring page
> onto a white refrigerator with a colorful magnet. The page is a line drawing of him with his
> dad and their dog, colored in with bright, slightly-outside-the-lines crayon. Other kids'
> drawings and a family calendar are on the fridge too. Morning light from a kitchen window.
> Shot from slightly behind and to the side so his proud face is visible in three-quarter view.

### 4. `birthday-table`: party activity (landscape 3:2)

> Four kids aged 5 to 7 sit around a party table decorated with balloons and paper party
> hats. They're coloring pages that are line drawings of the birthday girl, a 6-year-old with
> curly hair and a paper crown. She is in the middle, beaming and showing her page to a friend.
> Cups of crayons, a half-eaten cake in the soft-focus background, confetti on the table. Bright,
> cheerful backyard daylight.

### 5. `dog-coloring`: the pet is the star (landscape 3:2)

> A 7-year-old girl sits cross-legged on a sunlit wooden floor coloring a page that is a line
> drawing of her golden retriever. The real golden retriever lies right beside her with its
> head on her knee, looking at the page. She is laughing and holding the page up next to the
> dog's face to compare. Crayons scattered. Warm, playful, funny.

### 6. `mail-day`: the book arrives (landscape 3:2)

> At a sunny front door, a mom in her 30s and her 6-year-old son kneel on the doormat opening
> a padded mailer. The boy pulls out a letter-size, spiral-bound coloring book whose cover is a
> line drawing of their family, and his mouth is open in a delighted "whoa". Mom is laughing.
> Autumn leaves and a potted plant on the porch, golden hour light. Focus on the kid's face and
> the book.

**Tips:** if ChatGPT draws the coloring page as a cartoon, add "the coloring page looks like a
traced outline of a photo, realistic proportions". If faces look waxy, add "unretouched, editorial
documentary style". Keep the families varied across the set.

## 5. Round 2: edge to edge and photo-led (Nov 15)

Feedback on round 1: it still felt generic, used too few of our photos, and sat in fixed-width
columns. What changed:

- **Hero**: an edge-to-edge photo card (8–12px inset, rounded) like Legacybox. Each page picks its
  own photo (`heroPhoto` in `LANDING_PAGES`). On desktop the photo fills the right and fades into
  plum behind the text; on a phone the photo sits on top and the text below. It's preloaded as the
  page's main image.
- **Price card** in the hero: "Printed coloring books · from {price} · 24-page stapled booklet, US
  shipping included. Spiral and paperback too." "From" is anchored to `REFERENCE_BOOK`.
- **Photo strip**: every lifestyle photo except the hero's, edge to edge across the screen (scrolls
  sideways on a phone).
- **Before/after**: its own section with a big drag slider and a switcher between our real pairs
  ("Beach day", "The big catch"). The sweep plays when it scrolls into view.
- **Why**: an edge-to-edge split with a lifestyle photo on one half and the plum pitch on the other.
- **Final CTA**: an edge-to-edge photo background.
- Content columns widened from `max-w-6xl` to `max-w-7xl`, and the landing header now spans the
  screen.
- Removed: the decorative stars and doodles, and the price tag on the book mock.
