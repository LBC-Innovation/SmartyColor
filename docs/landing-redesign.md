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

## 6. Round 3 photos: the use cases, with the real books (Nov 17)

New scenes for the "Not just for kids" use cases (grandparents, the kids' table at a wedding, road
trips, reunions, new siblings, memory care, grown-ups). Same workflow as §4: save as
`public/marketing/lifestyle/<id>.png`, run `node scripts/prepare-lifestyle-images.mjs`, then add a
slot for the id in `LIFESTYLE_PHOTOS` (and the `LifestyleId` type). Still illustrative scenes, not
customers: never caption them as reviews or real orders.

**Build each prompt from four parts, in this order:**

1. the **scene** (§6.4)
2. its **look**: the lifestyle-shoot block or the phone-snapshot block (§6.1), as the scene says
3. the **book block** for the binding the scene names (§6.2), plus the page-orientation rule
4. the **avoid list** (§6.3)

### 6.1 The two looks

Both looks share this paragraph. Paste it right after the look block.

> **Real people.** Everyone looks like a real person, not a model: matte unretouched skin with
> visible pores, uneven tone, faint redness around noses and knuckles, fine lines and age spots on
> the adults, freckles, an uneven home haircut, a missing tooth on a kid. No shine or glow on
> foreheads, cheeks or noses. Hair has flyaways. Clothes are worn and a little wrinkled. The room
> is lived-in, with a few specific bits of everyday clutter. Expressions are mid-moment and
> nobody is posing for the camera. Hands are anatomically correct with five fingers and natural,
> short nails.

**Lifestyle-shoot look** (a semi-professional photographer following a real family):

> Editorial lifestyle photograph from a natural-light family photo session, shot on a full-frame
> camera with a 35mm lens at f/2.8, ISO 400. Light comes from a real window or doorway, shaped
> softly, with real shadows left in. Rich, natural colour with depth: warm highlights, clean
> whites, deep but open shadows, healthy contrast, skin tones true and warm. Colour graded like a
> modern lifestyle photographer's film-inspired edit (Kodak Portra feel), never flat or washed
> out, and never oversaturated. Composed with care but not posed: the photographer caught a real
> moment from a natural angle, with a little foreground in the frame for depth.

**Phone-snapshot look** (a family member grabbing the moment to remember it):

> Candid photo taken on a recent iPhone's main camera by a family member who wanted to remember
> the moment. Bright, clear, true-to-life colour with the crisp, punchy look of a modern phone
> photo: good contrast, vivid but real colour, everything fairly sharp front to back with only
> light background softness. Framed quickly from where they were standing or sitting: horizon a
> degree or two off, subjects a bit off centre, someone or something partly cut off at the edge,
> a little motion blur on a moving hand. Natural light as it was, a window or sky slightly bright.

### 6.2 The books, as Lulu prints them

Every printed book we sell is US Letter (8.5 × 11 in) portrait, black-and-white interior on 60#
uncoated white paper, with a matte full-colour cover (Lulu package codes
`0850X1100.BW.STD.{PB|SS|CO}.060UW444.MXX`). Blank backs are on by default, so each coloring
page sits on its own sheet. The binding pictures on the site (`public/marketing/binding-*.webp`)
show a violet matte cover, bright white page edges and, for spiral, a black plastic coil.

**Page-orientation rule (paste with every book block):**

> The coloring page always faces the person coloring it: the top of the drawing points away from
> them and the bottom of the drawing is nearest their body, exactly as you'd hold a page to
> color it. Do not turn the book or page to face the camera. The camera sees the drawing from the
> colorist's side or from over their shoulder, so it reads upright or at a slight angle in the
> photo. Only a person deliberately holding a page up to show someone may turn it outward.

**Interior (paste with every book block):**

> The pages are bright white uncoated paper, smooth and matte, not glossy. Each coloring page is
> clean black-and-white line art traced from a real photo, with realistic proportions, bold even
> outlines and no shading, set inside a plain half-inch white margin, with no page numbers or
> text. When the book is open, the coloring page is on the right and the facing left page is
> blank white. Parts of the open page are colored in with waxy crayon or colored pencil, with
> visible strokes and a few marks outside the lines.

**Stapled booklet** (saddle stitch, up to 48 pages):

> The book is a thin stapled booklet, US Letter size, about as thick as a school workbook. It is
> folded along its left edge with two silver staples in the fold. The cover is matte, full-colour
> card. Open on the table, it lies almost flat, the pages bowing gently near the fold.

**Paperback** (perfect bound, 32 pages and up):

> The book is a US Letter-size paperback, about a quarter inch thick, with a square glued spine,
> a matte full-colour cover and bright white page edges, like a bookstore paperback. A glued
> paperback doesn't lie flat on its own: the pages curve up toward the spine, and the person
> holds it open with their other hand flat on the left page, or has folded the cover back a
> little.

**Spiral-bound** (coil, lies flat):

> The book is a US Letter-size spiral-bound book with a black plastic coil running down the left
> long edge through small round punched holes. It is folded all the way back on itself, so only
> the one page being colored faces up, and it lies completely flat. The matte full-colour cover
> is folded round behind.

**Cover (when it's in view):**

> The front cover is a grid of the family's own colour photos under a soft dark tint, with a
> short title in big, white, rounded letters across the middle.

Keep the title to two or three words ("The Parkers", "Nana's Book") or leave the cover out of
view: image models often garble longer text.

**Print at home:** some scenes use loose pages instead of a book:

> Loose US Letter printer-paper pages, slightly curled, printed at home on an inkjet printer,
> the line art a little less crisp than a printed book.

### 6.3 Avoid list (paste last)

> Avoid: glossy or plastic-looking skin, airbrushing, beauty retouching, waxy faces, perfect
> teeth, studio flash, rim lighting, teal-and-orange grade, HDR halos, oversharpening, bokeh
> balls, glowing haze, flat or washed-out colour, everyone smiling at the camera, matching
> outfits, spotless rooms, sepia, vintage filter, heavy vignette, tears. No coloring page turned
> to face the camera while someone is coloring it. No watermarks, logos, brand names or captions,
> and no text anywhere except the short cover title.

### 6.4 Scenes

#### `grandma-armchair`: Grandma colors her own family (3:2). Lifestyle shoot, paperback

> A grandmother in her mid 70s with short white hair, reading glasses low on her nose and a
> soft rose cardigan with the sleeves pushed up sits in a well-worn armchair by a big window. A
> wooden lap tray rests on her knees with the paperback coloring book open on it. She holds the
> left page flat with her palm while she colors the right-hand page, a line drawing of her three
> grandkids sitting on a lake dock in life jackets, about a third colored in. She is concentrating,
> lips pressed together, coloring a life jacket orange with a short, worn-down crayon. Her phone
> leans against a mug of tea on the side table, showing the original colour photo. A crocheted
> throw, a TV remote and a small dish of crayons on the side table. Late-afternoon window light
> falling across her and the page. Shot from just behind and beside her shoulder at seated
> height, so the page reads upright in the photo and her face is in three-quarter profile.

#### `grandmas-together`: two friends compare books (3:2). Lifestyle shoot, paperback

> Two grandmothers in their early 70s, friends, sit side by side at a dining table with a
> patterned oilcloth tablecloth. Each has her own paperback coloring book open in front of her,
> turned toward herself. One, with dyed auburn hair showing grey roots, lifts her book up off the
> table and tilts it toward her friend to show the page she just finished (a line drawing of her
> grandson in a baseball uniform, colored in red and blue), laughing. The other, with curly grey
> hair and a fleece vest, leans in to look, a crayon still in her hand over her own book (a line
> drawing of her granddaughter at a ballet recital, half colored in pink). Crayons in a coffee
> can, a plate of store-bought cookies, reading glasses, a phone face-up. A cozy, slightly
> cluttered kitchen behind them. Soft window light plus a warm pendant lamp overhead. Shot from
> the end of the table at table height, the edge of a third chair soft in the foreground.

#### `wedding-kids-table`: quiet at the reception (3:2). Phone snapshot, stapled booklet

> A guest's phone photo at an evening wedding reception. Four kids aged 4 to 9 sit at a round
> kids' table with a white tablecloth that has a juice spill and crumbs on it. Their wedding
> clothes have clearly been worn all day: a flower girl with a crooked flower crown and a grass
> stain on her hem, a ring bearer with his shirt untucked and clip-on bow tie hanging loose, an
> older girl with her shoes kicked off under the chair. Each has a stapled coloring booklet open
> flat in front of them, turned toward themselves. The pages are line drawings of the bride and
> groom's engagement photos: the couple laughing on a wooden pier, the couple under a big oak
> tree. The ring bearer is coloring the groom's tie with his tongue poking out; the youngest has
> crayon on her fingers. One closed booklet lies on the table showing its cover. Name cards, a
> mason jar of crayons, a half-finished plate of chicken nuggets. String lights, guests talking
> and the dance floor behind them. Warm string-light glow mixed with blue dusk from tall windows.
> Taken by a guest standing behind the kids' chairs, looking down over their shoulders.

#### `road-trip`: coloring on the way to vacation (3:2). Phone snapshot, spiral-bound

> Taken on a phone by a parent turning around from the front passenger seat. The back seat of a
> family SUV on a highway, mid-morning. A 6-year-old boy in a booster seat and a 4-year-old girl
> in a car seat each have a spiral-bound coloring book folded back on itself on a lap tray, the
> page facing them. The pages are line drawings of the family on last summer's beach trip. The
> boy is coloring, head down, hair sticking up on one side. The girl lifts her book and turns it
> toward the camera to show off her page, mid-word, with crayon on her fingers. Crayons in a
> cupholder, one rolled into the seat crack, a bag of pretzels, a travel pillow, duffel bags in
> the cargo area. Bright sky, green fields and a guardrail streak past the side windows with
> motion blur; sun patches and window reflections across the kids. The front seat headrest cuts
> into the bottom corner of the frame.

#### `family-reunion`: everyone at the picnic table (3:2). Phone snapshot, print at home

> A phone photo at a summer family reunion in a park pavilion. A long picnic table with a
> plastic gingham tablecloth taped down at the corners. Three generations crowd one end: a
> grandfather in a baseball cap, two cousins about 7 and 10, an aunt in her 40s with sunglasses
> pushed up on her head. Each has a loose home-printed coloring page in front of them, turned
> toward themselves: line drawings of an old family photo of everyone at the same lake years ago.
> The aunt leans across and points at one figure on her cousin's page, explaining who it is.
> Paper plates, a cooler, a bottle of sunscreen, a stack of extra printed pages held down by a
> rock. Dappled midday light through the pavilion roof, some faces in shade, the grass outside
> bright green. Relatives by the grill in the background. Taken by someone standing at the end of
> the table, slightly above.

#### `big-sibling`: the new big sister (2:3 portrait). Phone snapshot, stapled booklet

> Taken on a phone by Dad, standing in the living room. A 4-year-old girl in pajama pants and a
> mismatched T-shirt kneels at the coffee table with a stapled coloring booklet open flat in front
> of her, turned toward herself. She is coloring a page that is a line drawing of herself holding
> her baby brother, pressing hard with a purple crayon. Behind her on the couch, her mom, in her
> early 30s with hair in a messy clip and a burp cloth over her shoulder, holds the sleeping
> newborn and looks down at the page over her daughter's head, tired but smiling. Baby wipes, a
> water bottle, a basket of unfolded laundry, crayons spread across the table. Soft daylight from
> a window. Shot from behind the girl and a little above, so the page reads upright.

#### `memory-care-visit`: coloring together on a visit (3:2). Lifestyle shoot, spiral-bound

> A bright, homey room in an assisted-living residence, with a quilt on the bed and framed family
> photos on the dresser. A woman in her late 80s with thin white hair and a soft blue knit sweater
> sits at a small table by the window, a spiral-bound coloring book folded back flat in front of
> her and turned toward her. Her daughter, in her late 50s with reading glasses on a chain, sits at
> her elbow on the same side, so they both look at the page the right way up. The page is a line
> drawing of the mother's own wedding photo from the 1960s. The mother colors the bouquet slowly
> with a chunky crayon, calm and focused; the daughter watches her, chin on her hand, smiling a
> little. A cup of water with a straw, a cardigan over the chair back. Soft midday daylight. Calm
> and warm, not sad and not clinical: no medical equipment in view. Shot from across the room at
> seated height, slightly to the side.

#### `grown-up-evening`: coloring for yourself (3:2). Lifestyle shoot, paperback

> Evening in a small apartment kitchen. A woman in her mid 30s in a hoodie and leggings, hair in a
> low ponytail with a few strands loose, sits at the counter with one foot up on the stool rung,
> a paperback coloring book open in front of her and turned toward her, her left hand holding the
> pages open. She is coloring a page that is a line drawing of her and her partner on a mountain
> hike, using colored pencils, with pencil marks on the side of her hand, half smiling to herself.
> A mug of tea, an open bag of chips, her phone face-down. Warm under-cabinet light pooling on the
> counter, the rest of the room in soft shadow, a dish rack and a plant behind her. Shot from
> beside and slightly behind her at counter height, a fruit bowl soft at the bottom edge of the
> frame.

### 6.5 Getting a real-looking result

- **Make 3 or 4 per scene and pick the one that looks most like a real moment.**
- **Check the page orientation first.** If the colorist's page faces the camera, regenerate and
  add: "she is coloring it, so the page is turned toward her and away from the camera".
- **Check the binding:** two staples in the fold for stapled, a square glued spine for
  paperback, a black coil for spiral. If the model draws a spiral on a paperback, repeat "square
  glued spine, no coil, no rings".
- **Colour too flat:** add "rich colour and contrast like a professional lifestyle photo, true
  blacks, warm highlights". **Colour too slick:** add "natural, not oversaturated, no HDR".
- **Shiny or waxy skin:** add "matte unretouched skin, visible pores".
- **Model-looking kids:** add "ordinary kids, not child models".
- **Cartoon coloring page:** add "the coloring page looks like a traced outline of a photo,
  realistic proportions".
- **Garbled cover text:** shorten the title or keep the cover out of frame.
- **Hands:** check every hand; regenerate rather than retouch.
- **Second pass (optional):** upload the pick and ask to "keep everything the same, remove any
  shine on skin and fix the colour to look like a real photo, not AI".
- **Keep families varied** across the set, and don't give `grandma-armchair` the same look as the
  `kitchen-table` grandmother.
