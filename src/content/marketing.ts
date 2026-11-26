/**
 * Every word on the marketing pages lives here, so it can be changed without touching components.
 *
 * Style: short plain sentences, no em dashes, no "AI" in headlines. Lead with the kid, the person
 * or the moment. Never write a price, credit amount or date by hand: use the tokens below, which
 * are filled from the real pricing code and settings. A line whose token can't be filled is hidden.
 *
 *   {price}     Price of the reference printed book, shipping included (e.g. "$14.37")
 *   {pdfPrice}  Price of the print-at-home PDF of a whole book
 *   {freeSheets} The sign-up gift as free sheets (e.g. "20 free coloring pages"), set on /admin/pricing
 *   {freePages}  The same, short (e.g. "20 free pages"), for buttons
 *   {date}      The Christmas order-by date (e.g. "December 7"). Only exists while the owner sets
 *               NEXT_PUBLIC_HOLIDAY_ORDER_BY and the date is still ahead.
 *   {min} {max} {format}  Page limits and name of a binding, read from src/lib/print/bookBindings.ts
 *   {packageFrom}  Lowest price among the book packages on sale
 *   {photosRange}  Photos the packages include ("20 to 40", or "20" when there is one number)
 *   {editsEach}    Free Creative Touch-Ups per page, only when every package has the same number above 0
 *   {touchUps}     The same as words ("2 free Creative Touch-Ups"). Hidden when {editsEach} is.
 *   All four come from the book_packages catalog and hide when no package is on sale.
 *
 * Only say what the product does today: one book per order (no multi-copy, bulk pricing, gift wrap
 * or partner program), a free coloring page with no account, edits by typing, a free letter-size
 * PDF of a single page, a print-at-home PDF of a whole book, printed books made to order.
 * Never "Printed in the US" or "first page in about a minute": the owner has not confirmed them.
 *
 * This file is plain data (no imports) so scripts/generate-share-images.mjs can read it too.
 */

export type LandingIntent = "default" | "gift" | "birthday" | "pets" | "partners" | "story";

/** The one primary call to action on every marketing page (the partners page adds a contact one). */
export const PRIMARY_CTA = "Try a free coloring page";

/** Where on a marketing page a call to action sits. Sent with the `cta_click` event. */
export type CtaLocation =
  | "hero"
  | "offer_bar"
  | "sticky"
  | "products"
  | "final"
  | "occasion"
  | "header"
  | "upsell"
  | "transform"
  | "themes"
  | "books";

/** Which path a tap starts: the book flow, one package's checkout, or a free coloring page. */
export type CtaTarget = "book" | "package" | "free";

export type HeroPair = {
  photoSrc: string;
  sheetSrc: string;
  photoAlt: string;
  sheetAlt: string;
  /** Intrinsic size of both images (same aspect). */
  width: number;
  height: number;
  /** Narrower `-<width>.webp` siblings next to the full-size file. */
  srcSetWidths: number[];
  /** Short name on the before/after switcher, e.g. "Beach day". */
  label?: string;
};

export type IconName =
  | "image"
  | "sparkles"
  | "printer"
  | "book"
  | "message"
  | "truck"
  | "shield"
  | "gift"
  | "cake"
  | "paw"
  | "camera"
  | "users"
  | "school"
  | "heart"
  | "briefcase"
  | "mail";

export type PointCopy = { icon: IconName; title: string; body: string };

export type FaqEntry = {
  q: string;
  a: string;
  /** Used instead of `a` when a token in `a` can't be filled. Omit to hide the question then. */
  fallback?: string;
  /** A link shown under the answer (not part of the structured data). */
  link?: { href: string; label: string };
};

/** The "why" block: a short pitch, three points, and a real before/after pair. */
export type WhyBlock = {
  eyebrow: string;
  title: string;
  body: string;
  points: PointCopy[];
  /** The photo and coloring page shown beside the points. */
  example: HeroPair;
  /** Lifestyle photo filling the band's other half. The before/after is shown instead until it is ready. */
  photo?: LifestyleId;
  useCasesTitle: string;
  useCases: string[];
};

/** Optional block of three ideas (party uses, pet ideas, partner examples). */
export type IdeasBlock = { eyebrow: string; title: string; body: string; items: PointCopy[] };

/** Which sections a landing page shows. Everything else is shared, so a page is just data. */
export type LandingSections = {
  /** "Made for the moments that matter" cards (the current page's own card is left out). */
  occasions: boolean;
  howItWorks: boolean;
  /** Printed book picture or gallery, and the binding formats. */
  finishedBook: boolean;
  /** Free page / printed book / story cards. */
  products: boolean;
  /** "Before you order" strip. */
  reassurance: boolean;
  /** Printed-book price under the hero button. */
  priceLine: boolean;
  /** Order-by and print-at-home cards for the gift page. */
  giftTiming: boolean;
  /** Contact block for businesses and groups; swaps the hero button to an email link. */
  partnerContact: boolean;
  /** Photos that come out best. */
  bestPhotos: boolean;
  /** "What people are making": the swipeable gallery of phone snapshots (MADE_PHOTOS). */
  madeGallery: boolean;
};

/** The sections of the book-first layout that can follow the hero. */
export type BookSectionId =
  | "made"
  | "transform"
  | "giftPoints"
  | "themes"
  | "how"
  | "books"
  | "photoBand"
  | "why"
  | "ideas"
  | "giftStrip";

/**
 * How a page reads while book packages are on sale: its own headline, subhead, section list (in
 * the order shown) and questions. A page without this, or any page while no package is priced,
 * uses the plain fields of LandingPageCopy (the free-try layout).
 */
export type BookFirstCopy = {
  headline: [string, string];
  subhead: string;
  /** The one pill above the headline, shown only while the Christmas order-by date is set. */
  holidayEyebrow?: string;
  order: BookSectionId[];
  /** Body under the themes heading. */
  themesBody: string;
  faq: FaqEntry[];
  commonFaq: string[];
};

export type LandingPageCopy = {
  intent: LandingIntent;
  path: string;
  /** <title> and share title. */
  title: string;
  description: string;
  /** 1200x630 share image in /public, built by scripts/generate-share-images.mjs. */
  shareImage: string;
  shareImageAlt: string;
  eyebrow: string;
  eyebrowIcon: IconName;
  /** Used instead of `eyebrow` while the Christmas order-by date is set. */
  holidayEyebrow?: string;
  /**
   * False until the page has a real photo that fits it. A page that is not ready is still
   * reachable by address, but is noindex, left out of the sitemap, the occasion cards and the
   * footer. Flip to true when the photo is in.
   */
  ready: boolean;
  /** Title printed on the sample book cover. */
  coverTitle: string;
  /** Headline: the first line plain, the second in the brand gradient. */
  headline: [string, string];
  subhead: string;
  primaryCta: string;
  trustBullets: string[];
  hero: HeroPair;
  /** Full-width photo behind the hero text. The hero pair's photo is used until it is ready. */
  heroPhoto: LifestyleId;
  sections: LandingSections;
  /** The book-first layout, used while packages are on sale. */
  bookFirst?: BookFirstCopy;
  why: WhyBlock;
  ideas?: IdeasBlock;
  /** This page's own questions, shown first. Its structured data is built from these and `commonFaq`. */
  faq: FaqEntry[];
  /** Ids of shared questions (see FAQ.items) to show after the page's own. Omit for all of them. */
  commonFaq?: string[];
};

// Two real example pairs exist today. A new page gets its own by pointing `hero` and `why.example`
// at a different HeroPair: add the files to /public/marketing (full size plus -400 and -800 webp
// siblings), add the pair here, then run node scripts/generate-share-images.mjs.
const FAMILY_BALCONY: HeroPair = {
  photoSrc: "/marketing/hero-photo.webp",
  sheetSrc: "/marketing/hero-sheet.webp",
  photoAlt: "A family of four smiling on a balcony above the beach",
  sheetAlt: "The same photo as a black-and-white coloring page",
  width: 1200,
  height: 900,
  srcSetWidths: [400, 800],
  label: "Beach day",
};

const BOYS_CATFISH: HeroPair = {
  photoSrc: "/marketing/boys-photo.webp",
  sheetSrc: "/marketing/boys-sheet.webp",
  photoAlt: "Three boys in a field, one holding a catfish they caught",
  sheetAlt: "The same photo as a black-and-white coloring page",
  width: 900,
  height: 1200,
  srcSetWidths: [400, 800],
  label: "The big catch",
};

export const BEST_PHOTOS = {
  title: "Photos that come out best",
  items: ["One to three people, facing the camera", "Daylight or a bright room", "A simple background, or ask to simplify it"],
};

export const WHY_FAMILIES: WhyBlock = {
  eyebrow: "Why it's different",
  title: "Color your own memories",
  body: "Most coloring books are full of pictures that mean nothing to you. These are yours: last summer's hike, the kids at the beach, your parents on their wedding day. They're the kind of pages you take your time with, and keep.",
  points: [
    { icon: "message", title: "Change anything by typing", body: "“Give him a shave.” “Take out the stroller.” It draws the page again." },
    { icon: "truck", title: "A real book on real paper", body: "Stapled, spiral or paperback. Printed to order and mailed wherever you like." },
    {
      icon: "shield",
      title: "Your photos stay yours",
      body: "Private to your account and not shown to other customers. Sent to our image provider only to draw your page. Never used for ads.",
    },
  ],
  example: BOYS_CATFISH,
  // Not "fridge": the home page's photo strip already shows that one just above.
  photo: "evening-counter",
  useCasesTitle: "People make them for",
  useCases: [
    "Grandparents who love to color",
    "A quiet evening to yourself",
    "Birthday parties",
    "Holiday visits",
    "Road trips",
    "Classrooms",
  ],
};

/** Homepage ideas: who colors these and where they get used, beyond the occasion pages. */
const HOME_IDEAS: IdeasBlock = {
  eyebrow: "Ideas",
  title: "Not just for kids",
  body: "A coloring page of people you know works at almost any age, and for more occasions than you'd think.",
  items: [
    {
      icon: "sparkles",
      title: "For grown-ups who color",
      body: "If coloring is how you unwind, ask for “more detail” and get a page with plenty to fill in. It's more fun when the faces are your own.",
    },
    {
      icon: "users",
      title: "Grandma and the grandkids",
      body: "Print the same page twice and color it side by side. Someone always starts telling the story behind the photo.",
    },
    {
      icon: "gift",
      title: "The kids' table at a wedding",
      body: "Print pages of the couple and set out crayons. The little guests stay busy right through the toasts.",
    },
    {
      icon: "camera",
      title: "Family reunions",
      body: "Bring a stack of pages from last year's photos. The kids color, and the grown-ups argue about who's who.",
    },
    {
      icon: "book",
      title: "A new big brother or sister",
      body: "A few pages of the family with the new baby help an older child feel like part of the big news.",
    },
    {
      icon: "heart",
      title: "Visiting someone in memory care",
      body: "Familiar faces give you something calm to do together, and something to talk about while you color.",
    },
  ],
};

const ALL_SECTIONS_OFF: LandingSections = {
  occasions: false,
  howItWorks: false,
  finishedBook: false,
  products: false,
  reassurance: false,
  priceLine: false,
  giftTiming: false,
  partnerContact: false,
  bestPhotos: false,
  madeGallery: false,
};

const CONSUMER_SECTIONS: LandingSections = {
  ...ALL_SECTIONS_OFF,
  howItWorks: true,
  finishedBook: true,
  products: true,
  reassurance: true,
  priceLine: true,
  bestPhotos: true,
  madeGallery: true,
};

/** The shared questions of the free-try layout, for pages that show them all. */
const FREE_TRY_FAQ = [
  "account",
  "cost",
  "photos",
  "fix",
  "price",
  "adults",
  "events",
  "bleed",
  "deadline",
  "gift",
  "time",
  "copies",
  "business",
  "safe",
];

export const LANDING_PAGES: Record<LandingIntent, LandingPageCopy> = {
  default: {
    intent: "default",
    path: "/",
    title: "A coloring book starring your family | Colorful Memories",
    description:
      "Choose your book and add your family photos. Every page becomes a coloring page of the people you love, printed and shipped. Try a page free, no account needed.",
    shareImage: "/share/home.png",
    shareImageAlt: "A family photo next to the coloring page made from it",
    eyebrow: "Personalized coloring books",
    eyebrowIcon: "sparkles",
    ready: true,
    coverTitle: "Our Family Book",
    headline: ["Family photos", "you can color."],
    subhead:
      "Pick a photo from your phone and get a coloring page of it. Print it at home, or put a few together into a real book for the kids, the grandparents, or yourself.",
    primaryCta: PRIMARY_CTA,
    trustBullets: ["No account to start", "Exact price before you pay", "Your photos stay private"],
    hero: FAMILY_BALCONY,
    heroPhoto: "new-sibling",
    sections: { ...CONSUMER_SECTIONS, occasions: true },
    bookFirst: {
      headline: ["A coloring book", "starring your family."],
      subhead:
        "Choose your book and add your photos. Every page becomes a coloring page of the people you love, and we print it and ship it.",
      // "What people are making" right under the hero; the why and ideas blocks after the books.
      order: ["made", "transform", "themes", "how", "books", "photoBand", "why", "ideas", "giftStrip"],
      themesBody:
        "Give your book a theme, like “Under the sea” or “Space explorers.” Every page is drawn in that world, and everyone still looks like themselves.",
      faq: [],
      commonFaq: ["package", "shipping", "deadline", "morePhotos", "cancel", "tryFree", "themes", "bleed", "safe"],
    },
    why: WHY_FAMILIES,
    ideas: HOME_IDEAS,
    faq: [],
    commonFaq: FREE_TRY_FAQ,
  },
  gift: {
    intent: "gift",
    path: "/gift",
    title: "Coloring book gift for grandparents | Colorful Memories",
    description:
      "Turn this year's family photos into a printed coloring book and ship it to the grandparents with a note. Try a free coloring page first, no account needed.",
    shareImage: "/share/gift.png",
    shareImageAlt: "A family photo next to the coloring page made from it",
    eyebrow: "Gifts",
    holidayEyebrow: "Christmas gifts",
    eyebrowIcon: "gift",
    ready: true,
    coverTitle: "For the Grandparents",
    headline: ["A coloring book", "starring the grandkids."],
    subhead:
      "Turn this year's family photos into a printed coloring book. It ships straight to the grandparents, or anyone you choose, with a note from you.",
    primaryCta: PRIMARY_CTA,
    trustBullets: ["Ships to them, not you", "Printed to order and shipped", "Exact price before you pay"],
    // TODO(owner): swap in a photo of a grandparent with a grandkid and the page made from it, with
    // written consent. Replace `hero` and `why.example` with the new HeroPair.
    hero: FAMILY_BALCONY,
    heroPhoto: "kitchen-table",
    sections: { ...CONSUMER_SECTIONS, occasions: true, giftTiming: true },
    bookFirst: {
      headline: ["A coloring book", "starring the grandkids."],
      subhead:
        "Fill a book with this year's family photos. We print it and ship it straight to them, with a note from you on the first page.",
      holidayEyebrow: "Christmas gifts",
      order: ["transform", "giftPoints", "themes", "books", "how"],
      themesBody:
        "Make the grandkids superheroes, astronauts or ninjas. Every page is drawn in that world, and everyone still looks like themselves.",
      faq: [
        {
          q: "How does the gift note work?",
          a: "Choose “This is a gift” when you order the book and write a short note. It prints on the book's first page. The note takes a page, so it is added to the book and its price.",
        },
        {
          q: "Can it ship straight to the grandparents?",
          a: "Yes. Choose “This is a gift,” then enter their address as the delivery address. Your own address stays on the order as the billing address.",
        },
        {
          q: "Can I see the book before it's printed?",
          a: "Yes. You turn through every page, cover to cover, and confirm it before you place your book order. You see the shipping price before you pay for it.",
        },
      ],
      commonFaq: ["package", "shipping", "deadline", "cancel", "tryFree", "safe"],
    },
    why: {
      eyebrow: "Why it works as a gift",
      title: "A gift only you can give",
      body: "Anyone can buy a coloring book. Only you can fill one with the people they love.",
      points: [
        {
          icon: "message",
          title: "Add a note",
          body: "Write a short note and it prints on the book's first page. The note takes a page, so it is added to the book and its price.",
        },
        {
          icon: "truck",
          title: "Ships to them",
          body: "Choose “This is a gift” at checkout and it ships straight to them, not to you.",
        },
        {
          icon: "shield",
          title: "Check every page first",
          body: "For a printed book, you turn through every page before you order. You see the exact price first.",
        },
      ],
      // TODO(owner): a grandparent-and-grandkid pair, with written consent.
      example: BOYS_CATFISH,
      photo: "fridge",
      useCasesTitle: "Great for",
      useCases: ["Grandparents", "Aunts and uncles", "Godparents", "Family friends"],
    },
    faq: [
      {
        q: "How does the gift note work?",
        a: "Choose “This is a gift” at checkout and write a short note. It prints on the book's first page. The note takes a page, so it is added to the book and its price.",
      },
      {
        q: "Can it ship straight to the grandparents?",
        a: "Yes. Choose “This is a gift,” then enter their address as the delivery address. Your own address stays on the order as the billing address.",
      },
      {
        q: "When should I order?",
        a: "Place your book order by {date} for Christmas. Delivery dates for your address are shown at checkout before you pay.",
        fallback:
          "Books are printed to order. Delivery dates for your address are shown at checkout before you pay.",
      },
      {
        q: "What if it won't arrive in time?",
        a: "Make the whole book as a print-at-home PDF. It downloads as soon as you order, you print it on your own printer, and you can download it again from My orders.",
      },
      {
        q: "Can I see the book before I pay?",
        a: "For a printed book, you turn through every page, cover to cover, and confirm it before you order. You see the exact price first.",
      },
    ],
    commonFaq: ["price", "cost", "account", "safe"],
  },
  birthday: {
    intent: "birthday",
    path: "/birthday",
    title: "Birthday coloring pages and books | Colorful Memories",
    description:
      "Make coloring pages from the birthday kid's photos. Print them at home for every guest, or order a printed book to keep. Try a free page, no account needed.",
    shareImage: "/share/birthday.png",
    shareImageAlt: "A photo of three boys next to the coloring page made from it",
    eyebrow: "Birthdays",
    eyebrowIcon: "cake",
    // TODO(owner): set ready: true once a real birthday photo and page are in (see hero below).
    ready: false,
    coverTitle: "Birthday Book",
    headline: ["A coloring book", "starring the birthday kid."],
    subhead:
      "Turn their photos into coloring pages. Print them at home for every guest at the party, or order a printed book as the keepsake gift.",
    primaryCta: PRIMARY_CTA,
    trustBullets: ["Print pages at home, free", "A printed book to keep", "No account to start"],
    // TODO(owner): swap in a birthday photo (kids at a party) and its coloring page, with written consent.
    hero: BOYS_CATFISH,
    heroPhoto: "birthday-table",
    sections: { ...CONSUMER_SECTIONS, occasions: true },
    why: {
      eyebrow: "Why it works for birthdays",
      title: "Make the birthday kid the star",
      body: "Every page is them: their face, their friends, their favorite spot. That is the page they keep.",
      points: [
        {
          icon: "printer",
          title: "Print for every guest",
          body: "Download a page as a free letter-size PDF and print it on your home printer.",
        },
        {
          icon: "book",
          title: "A printed book to keep",
          body: "Turn their favorite pages into a stapled booklet or a paperback.",
        },
        {
          icon: "message",
          title: "Fix it by typing",
          body: "“Make the cake say 6.” “Take out the car.” It redraws the page.",
        },
      ],
      // TODO(owner): a birthday-party pair (child with a cake or friends), with written consent.
      example: BOYS_CATFISH,
      photo: "living-room-floor",
      useCasesTitle: "Great for",
      useCases: ["Party activity", "Take-home pages", "A keepsake gift"],
    },
    ideas: {
      eyebrow: "At the party",
      title: "Coloring pages for the party",
      body: "Pages made from your own photos are a simple activity for the table.",
      items: [
        { icon: "printer", title: "At the table", body: "Print a page for each guest and set out the crayons." },
        { icon: "users", title: "Take-home pages", body: "Send every guest home with a page of the birthday kid." },
        {
          icon: "gift",
          title: "The keepsake gift",
          body: "Order a printed book for the birthday kid. It can ship straight to them with a note.",
        },
      ],
    },
    faq: [
      {
        q: "Can I print pages for all the party guests?",
        a: "Yes. Every coloring page has a free letter-size PDF you can print at home. To print a whole book yourself, choose the print-at-home PDF. You see its price before you order.",
      },
      {
        q: "Can I make a book for the birthday kid?",
        a: "Yes. Add their photos, turn them into coloring pages, then order a printed stapled booklet or paperback. It can ship straight to them with a note.",
      },
      {
        q: "How many photos do I need?",
        a: "One is enough to try a page. A printed book needs at least {min} pages in its smallest format ({format}). A print-at-home PDF has no minimum.",
      },
      {
        q: "Can I order books for all the guests?",
        a: "Each order is one book today. For a larger order, email us at {email}. To give every guest a page, print single pages at home for free.",
      },
    ],
    commonFaq: ["price", "cost", "account", "safe"],
  },
  pets: {
    intent: "pets",
    path: "/pets",
    title: "Turn your pet into a coloring page | Colorful Memories",
    description:
      "Turn a photo of your dog or cat into a coloring page. Print it free at home, or make a printed book for the pet lover in your life. No account needed to try.",
    shareImage: "/share/pets.png",
    shareImageAlt: "A photo of three boys next to the coloring page made from it",
    eyebrow: "Pets",
    eyebrowIcon: "paw",
    // TODO(owner): set ready: true once a real dog or cat photo and page are in (see hero below).
    ready: false,
    coverTitle: "My Pet Book",
    headline: ["Your pet,", "as a coloring page."],
    subhead:
      "Upload a photo of your dog, cat or favorite animal. Get a page to color, print it at home, or turn a few into a book for the pet lover in your life.",
    primaryCta: PRIMARY_CTA,
    trustBullets: ["No account to start", "Edit any page by typing", "Your photos stay private"],
    // TODO(owner): replace with a dog or cat photo and the coloring page made from it, with written
    // consent. The catfish photo is a stand-in until then.
    hero: BOYS_CATFISH,
    heroPhoto: "dog-coloring",
    sections: { ...CONSUMER_SECTIONS, occasions: true },
    why: {
      eyebrow: "Why pet lovers like it",
      title: "The pet is the star",
      body: "Pets are family. A page of yours beats a generic cartoon dog.",
      points: [
        {
          icon: "image",
          title: "Start with a photo you have",
          body: "The one where the dog finally sat still.",
        },
        {
          icon: "message",
          title: "Fix it by typing",
          body: "“Give her a bow.” “Remove the leash.” It redraws the page.",
        },
        {
          icon: "gift",
          title: "A gift for pet lovers",
          body: "Make a book from photos of their dog or cat and ship it to them with a note.",
        },
      ],
      // TODO(owner): a dog or cat pair, with written consent.
      example: BOYS_CATFISH,
      photo: "fridge",
      useCasesTitle: "Great for",
      useCases: ["Dogs", "Cats", "Family photos with pets", "Gifts for pet lovers"],
    },
    ideas: {
      eyebrow: "Ideas",
      title: "Ways to use it",
      body: "A few places to start.",
      items: [
        { icon: "paw", title: "Their own book", body: "A few pages of the dog, the cat or the whole pack." },
        { icon: "gift", title: "A gift for a pet lover", body: "Ship a printed book to them with a note." },
        {
          icon: "heart",
          title: "A keepsake",
          body: "A favorite photo of a pet you miss can become a page to keep. Take all the time you need.",
        },
      ],
    },
    faq: [
      {
        q: "What kind of pet photo works best?",
        a: "A clear, well-lit photo where your pet's face is easy to see. Daylight helps. If the background is busy, ask for it to be simplified.",
      },
      {
        q: "Can I put my pet and my family on the same page?",
        a: "Yes. Upload a photo with your pet and the family. If the page misses something, type what to change and it redraws.",
      },
      {
        q: "Can I make a keepsake of a pet who has passed?",
        a: "Yes. A favorite photo of a pet you miss can become a coloring page to print, or a page in a book. Take all the time you need.",
      },
      {
        q: "Can I give a pet book as a gift?",
        a: "Yes. Make a book from photos of a friend's dog or cat, then choose “This is a gift” at checkout to ship it to them with a note.",
      },
    ],
    commonFaq: ["price", "cost", "account", "safe"],
  },
  partners: {
    intent: "partners",
    path: "/partners",
    title: "Coloring books for businesses and events | Colorful Memories",
    description:
      "Turn a photo session, a class or an event into a coloring book families keep. For photographers, schools, attractions and event organizers. Email us.",
    shareImage: "/share/partners.png",
    shareImageAlt: "A family photo next to the coloring page made from it",
    eyebrow: "For businesses and groups",
    eyebrowIcon: "briefcase",
    ready: true,
    coverTitle: "Our Day Together",
    headline: ["Turn the day into", "a coloring book."],
    subhead:
      "For photographers, schools, family attractions and event organizers. A session, a class or an event becomes a coloring book that families keep.",
    primaryCta: "Email us about a book",
    trustBullets: ["Try a free page first", "Printed to order and shipped", "Larger orders quoted individually"],
    // TODO(owner): swap in a photographer-session or event photo and its coloring page, with written consent.
    hero: FAMILY_BALCONY,
    heroPhoto: "holiday-party",
    sections: { ...ALL_SECTIONS_OFF, howItWorks: true, partnerContact: true, bestPhotos: true },
    why: {
      eyebrow: "The idea",
      title: "A keepsake from the day they were there",
      body: "Families remember a day through its photos. Turn those photos into coloring pages and a book, and the day comes home with them.",
      points: [
        { icon: "image", title: "Starts with a photo", body: "A session favorite, a class picture or a day-out snapshot." },
        { icon: "message", title: "Easy to adjust", body: "Type a note like “take out the sign” and the page redraws." },
        { icon: "truck", title: "Printed to order", body: "Printed books are made to order and shipped." },
      ],
      // TODO(owner): a photographer-session or event pair, with written consent.
      example: BOYS_CATFISH,
      photo: "kitchen-table",
      useCasesTitle: "Works for",
      useCases: ["Photo sessions", "Classrooms", "Family attractions", "Events and reunions"],
    },
    ideas: {
      eyebrow: "Three ways to use it",
      title: "Ideas to start with",
      body: "These are starting points. Tell us what you have in mind.",
      items: [
        {
          icon: "camera",
          title: "A photo session",
          body: "A few favorites from a family session become coloring pages, a keepsake for the kids.",
        },
        {
          icon: "school",
          title: "A class or school event",
          body: "A class picture, a field trip or a school play becomes a coloring book of moments families remember.",
        },
        {
          icon: "users",
          title: "A family attraction or event",
          body: "A day out, a reunion or a party becomes a keepsake families color at home.",
        },
      ],
    },
    faq: [
      {
        q: "How much does it cost?",
        a: "A single printed book is priced when you build it, and you see the exact price before you pay. Pricing for larger or repeat orders is quoted individually. Email us with what you need.",
      },
      {
        q: "Can I order a lot of books at once?",
        a: "Each order in the app is one book. For larger or repeat orders, email us at {email} and tell us about it.",
      },
      {
        q: "Can I try it before I write to you?",
        a: "Yes. Try a free coloring page with no account to see what families would get.",
      },
    ],
    commonFaq: ["cost", "account", "safe"],
  },
  story: {
    intent: "story",
    path: "/story",
    title: "Your trip as a coloring storybook | Colorful Memories",
    description:
      "Pick a vacation album and add a line or two about what happened. Get a captioned coloring storybook to print at home or order as a real book.",
    shareImage: "/share/story.png",
    shareImageAlt: "A family photo next to the coloring page made from it",
    eyebrow: "Story mode",
    eyebrowIcon: "sparkles",
    ready: true,
    coverTitle: "Our Trip",
    headline: ["Your trip, as a storybook", "they can color."],
    subhead:
      "Pick a vacation album and add a line or two about what happened. Get a captioned coloring storybook to print at home or order as a real book.",
    primaryCta: PRIMARY_CTA,
    trustBullets: ["Captions you can edit", "Printed to order and shipped", "Your photos stay private"],
    // TODO(owner): swap in a trip photo and a captioned story page, with written consent.
    hero: FAMILY_BALCONY,
    heroPhoto: "living-room-floor",
    sections: { ...CONSUMER_SECTIONS },
    why: WHY_FAMILIES,
    faq: [],
    commonFaq: FREE_TRY_FAQ,
  },
};

/** Landing pages in the order they are listed in the sitemap, footer and occasion cards. */
export const LANDING_ORDER: LandingIntent[] = ["default", "gift", "birthday", "pets", "partners", "story"];

/** The reference book's price, on the pricing card and in the studio, when the price is known. */
export const PRICE_LINE = "{price} for a {refPages}-page {refFormat}, standard US shipping included. Plus tax.";

/**
 * The hero's price card, shown when the reference price is known. "From" is the reference book
 * (REFERENCE_BOOK in src/server/marketing/marketingNumbers.ts); larger books and other bindings cost more.
 */
export const HERO_PRICE_TAG = {
  label: "Printed coloring books",
  price: "from {price}",
  detail: "{refPages}-page {refFormat}, US shipping included. Spiral and paperback too.",
};

/**
 * Slim strip above the landing page header: the sign-up gift. Hidden when the gift is off, on the
 * partners page, while the Christmas banner shows, and for signed-in visitors. `short` is for phones.
 */
export const OFFER_BAR = {
  text: "Sign up free and get {freeSheets}",
  short: "Sign up for {freePages}",
};

/**
 * Slim banner at the top of the home and gift pages, and next to the delivery estimate at checkout.
 * It never promises arrival; delivery dates for the address are shown at checkout.
 */
export const HOLIDAY_LINE = "Place your book order by {date} for Christmas.";
export const HOLIDAY_CHECKOUT_NOTE = "Delivery dates for your address are shown at checkout before you pay.";

/** Homepage toast at the bottom of the screen. Shown only while the Christmas order-by date is set. */
export const HOLIDAY_BLOCK = {
  title: "Giving a book for Christmas?",
  line: "Place your book order by {date}. It ships to them with your note.",
  link: "See Christmas gifts",
  href: "/gift",
  dismiss: "Dismiss",
};

export const HERO_SECONDARY_CTA = "See how it works";

/**
 * The hero while book packages are on sale: the book is the primary path, the free page a quiet
 * second one. "Book packages from", never "Books from": a small pay-per-page book can cost less.
 */
export const HERO_BOOK = {
  primary: "Start your book",
  secondary: "Or try a free coloring page first",
  priceLine: "Book packages from {packageFrom}. Shipping is added at checkout.",
};
/** The hero's drag-to-compare slider. */
export const HERO_COMPARE = {
  photo: "Your photo",
  page: "Coloring page",
  hint: "Drag to compare",
  label: "Compare the photo with the coloring page made from it",
  sticker: "Made from a real photo",
};

/** Placeholder in the gift note box: Christmas-flavored only while the order-by date is set. */
export const GIFT_NOTE_PLACEHOLDER = { christmas: "Merry Christmas! Love, Grandma", neutral: "Love, Grandma" };

/** Phone-only sticky footer button. */
export const STICKY_CTA = PRIMARY_CTA;
/** The same button while book packages are on sale. */
export const STICKY_CTA_BOOK = HERO_BOOK.primary;

export const HEADER = {
  signIn: "Sign in",
  signUp: "Sign up",
  /** Shown instead of Sign in when a session exists. The page never redirects. */
  signedIn: "Go to your albums",
};

/** The occasions cards. The card for the page you are on is left out. */
export const OCCASIONS = {
  eyebrow: "Occasions",
  title: "A few good reasons to make one",
  cards: [
    {
      intent: "gift",
      icon: "gift",
      image: "kitchen-table",
      title: "For the grandparents",
      /** Used instead of `title` while the Christmas order-by date is set. */
      holidayTitle: "Christmas gifts",
      body: "A book of the grandkids, mailed straight to Grandma and Grandpa with a note from you.",
    },
    {
      intent: "birthday",
      icon: "cake",
      image: "birthday-table",
      title: "Birthdays",
      body: "Pages of the birthday kid for every guest to color, or a book they get to keep.",
    },
    {
      intent: "pets",
      icon: "paw",
      image: "dog-coloring",
      title: "Pets",
      body: "Your dog or cat on a page to color. A sweet gift for anyone who talks about their pet nonstop.",
    },
    {
      intent: "partners",
      icon: "briefcase",
      image: "holiday-party",
      title: "Photographers and businesses",
      body: "Photographers, schools and event planners: give families a coloring book of their day.",
      /** This card goes to its page instead of starting a free page. */
      link: "See how it works for businesses",
    },
  ] satisfies {
    intent: LandingIntent;
    icon: IconName;
    /** Lifestyle photo shown on top of the card once it is ready. */
    image?: LifestyleId;
    title: string;
    holidayTitle?: string;
    body: string;
    link?: string;
  }[],
  /** Plain text, no links. Items tied to a page are listed here while that page is not ready. */
  othersLead: "People also make them for",
  others: [
    { label: "birthdays", intent: "birthday" },
    { label: "pets", intent: "pets" },
    { label: "weddings" },
    { label: "anniversaries" },
    { label: "family reunions" },
    { label: "a new baby in the family" },
    { label: "vacations" },
    { label: "a move to a new house" },
  ] as { label: string; intent?: LandingIntent }[],
};

export const HOW_IT_WORKS = {
  title: "How it works",
  /** While book packages are on sale. */
  steps: [
    {
      icon: "book",
      title: "Choose your book",
      body: "A stapled booklet, a spiral bound book or a paperback. You pay once.",
    },
    {
      icon: "image",
      title: "Add your photos",
      body: "Each photo becomes a coloring page of the people in it. Not quite right? Type a Creative Touch-Up, like “take out the stroller.”",
    },
    {
      icon: "truck",
      title: "We print and ship it",
      body: "Check every page, then place your order. It ships to you, or straight to someone you're giving it to.",
    },
  ],
  /** The free-try layout (no packages on sale) and the partners page. */
  pagesEyebrow: "How it works",
  pagesTitle: "If you can text a photo, you can make one",
  pagesBody: "No drawing, no design, nothing to install.",
  stepsPages: [
    {
      icon: "image",
      title: "Pick a photo",
      body: "Any picture from your phone. The beach, a birthday, the dog asleep on the couch. iPhone and Android both work.",
    },
    {
      icon: "sparkles",
      title: "Get a coloring page",
      body: "You get clean black-and-white line art, ready for crayons, markers or colored pencils.",
    },
    {
      icon: "printer",
      title: "Print it or order a book",
      body: "Print a page free at home, or put your pages together into a stapled, spiral or paperback book and have it mailed wherever you like.",
    },
  ],
} as const;

/** "Choose your book": the landing's package tiles. Tile words come from BOOK_PACKAGES so they match the wizard. */
export const LANDING_BOOKS = {
  eyebrow: "Books",
  title: "Choose your book",
  body: "One price covers your photos made into coloring pages[[, {touchUps} on each page]] and printing the book. Shipping is added at checkout.",
  blankBacks: "Each photo prints on its own page with a blank back, so markers don't bleed through.",
  refund: "Change your mind before you order the book? Cancel, and the unused value goes back to your wallet balance.",
  freeTitle: "Not ready for a whole book?",
  freeBody: "Make one page at a time and print it at home.",
  freeButton: PRIMARY_CTA,
  /** Gift page only, under the tiles. Hidden when no order-by date is set. */
  giftDeadline: "Place your book order by {date} for Christmas. Delivery dates for your address are shown at checkout.",
};

/** The themes showcase. The pictures are DESIGN_THEMES.examples; the ideas are DESIGN_THEMES.starters. */
export const LANDING_THEMES = {
  eyebrow: "Themes",
  title: "Or draw them into another world",
  /** Which examples show, and in what order (indexes into DESIGN_THEMES.examples.pairs): the lake first. */
  order: [1, 0, 2] as number[],
  /** Starter theme ids named in the ideas line, in this order. */
  ideaIds: ["superheroes", "under_sea", "space", "dinosaurs", "fairy_castle", "toy_bricks"] as string[],
  smallPrint: "Optional. You choose a theme when you start your book, and you can change it later.",
  cta: "Start your book",
};

/** The homepage's gift strip: one row that sends gift buyers to /gift. */
export const LANDING_GIFT_STRIP = {
  title: "Giving it as a gift?",
  body: "It can ship straight to them, with a note from you on the first page.[[ Place your book order by {date} for Christmas.]]",
  link: "Gift a book",
  href: "/gift",
};

/**
 * "See the finished book". While PRODUCT_PHOTOS is empty the page shows a CSS mock of a printed
 * cover instead; the formats below come from src/lib/print/bookBindings.ts.
 */
export const FINISHED_BOOK = {
  eyebrow: "See the finished book",
  title: "A real book, printed and shipped",
  body: "Your coloring pages, printed to order and mailed to you, or to someone you are giving it to.",
  mockCaption: "A sample cover. Yours is made from your own pages.",
  sizeNote: "Letter-size pages (8.5 by 11 inches), black and white inside, ready to color. Each page gets its own sheet with a blank back, so markers don't bleed through.",
  formatsTitle: "Choose how to get it",
  /** "{min} to {max} pages" per printed format. */
  pages: "{min} to {max} pages",
  digital: {
    name: "Print at home",
    body: "A PDF of your whole book to print on your own printer. Download it again anytime from My orders.",
    pages: "Any number of pages",
    price: "{pdfPrice} for the whole book",
  },
};

export type ProductPhoto = {
  src: string;
  alt: string;
  width: number;
  height: number;
  caption: string;
};

/**
 * Real photos of finished printed books. The "See the finished book" gallery shows only when this
 * has entries, like TESTIMONIALS.
 * TODO(owner): add real photos of a printed stapled booklet, a spiral-bound book and a paperback
 * in a child's hands (written consent for anyone pictured). Put the files in /public/marketing,
 * then add { src, alt, width, height, caption } for each. Never use a stock or generated photo.
 */
export const PRODUCT_PHOTOS: ProductPhoto[] = [];

export type LifestyleId =
  | "new-sibling"
  | "holiday-party"
  | "kitchen-table"
  | "living-room-floor"
  | "fridge"
  | "birthday-table"
  | "dog-coloring"
  | "mail-day"
  | "evening-counter";

export type LifestylePhoto = {
  src: string;
  alt: string;
  /** Short scene label shown on the photo. Never phrased as a customer or a review. */
  caption: string;
  width: number;
  height: number;
  srcSetWidths: number[];
  /** False until the file is in /public/marketing/lifestyle. A photo that is not ready is never shown. */
  ready: boolean;
};

/**
 * Illustrative lifestyle scenes (people coloring, gifting, the fridge). They set the mood; they are
 * not customers, so never caption them as reviews. Prompts and the steps to add one are in
 * docs/landing-redesign.md: drop the PNG in /public/marketing/lifestyle, run
 * node scripts/prepare-lifestyle-images.mjs, then set `ready`, `width` and `height` here.
 */
export const LIFESTYLE_PHOTOS: Record<LifestyleId, LifestylePhoto> = {
  "new-sibling": {
    src: "/marketing/lifestyle/new-sibling.webp",
    alt: "A mom holding her newborn on the couch while her toddler colors a page of herself hugging the baby",
    caption: "Meet the new baby",
    width: 1536,
    height: 1024,
    srcSetWidths: [400, 800],
    ready: true,
  },
  "holiday-party": {
    src: "/marketing/lifestyle/holiday-party.webp",
    alt: "Four friends at a holiday party laughing and holding up colored-in pages of their trips together and their dog",
    caption: "Holiday night in",
    width: 1536,
    height: 1024,
    srcSetWidths: [400, 800],
    ready: true,
  },
  "kitchen-table": {
    src: "/marketing/lifestyle/kitchen-table.webp",
    alt: "A grandmother and her granddaughter laughing over a coloring page of the two of them",
    caption: "Grandma's kitchen table",
    width: 1536,
    height: 1024,
    srcSetWidths: [400, 800],
    ready: true,
  },
  "living-room-floor": {
    src: "/marketing/lifestyle/living-room-floor.webp",
    alt: "Two kids on a rug coloring pages of their family on a rainy afternoon",
    caption: "A rainy Saturday",
    width: 1536,
    height: 1024,
    srcSetWidths: [400, 800],
    ready: true,
  },
  fridge: {
    src: "/marketing/lifestyle/fridge.webp",
    alt: "A boy pressing his colored-in page onto the fridge with a magnet",
    caption: "Straight to the fridge",
    width: 1536,
    height: 1024,
    srcSetWidths: [400, 800],
    ready: true,
  },
  "birthday-table": {
    src: "/marketing/lifestyle/birthday-table.webp",
    alt: "Kids at a birthday table coloring pages of the birthday girl",
    caption: "The party table",
    width: 1536,
    height: 1024,
    srcSetWidths: [400, 800],
    ready: true,
  },
  "dog-coloring": {
    src: "/marketing/lifestyle/dog-coloring.webp",
    alt: "A girl holding up a coloring page of her golden retriever next to the dog",
    caption: "Starring the dog",
    width: 1536,
    height: 1024,
    srcSetWidths: [400, 800],
    ready: true,
  },
  "mail-day": {
    src: "/marketing/lifestyle/mail-day.webp",
    alt: "A boy and his mom opening a mailer with a coloring book of their family inside",
    caption: "Mail day",
    width: 1536,
    height: 1024,
    srcSetWidths: [400, 800],
    ready: false,
  },
  "evening-counter": {
    src: "/marketing/lifestyle/evening-counter.webp",
    alt: "A woman at the kitchen counter in the evening, coloring a page of her family on a mountain hike, with a cup of tea beside her",
    caption: "After the kids are in bed",
    width: 1536,
    height: 1024,
    srcSetWidths: [400, 800],
    ready: true,
  },
};

/**
 * The edge-to-edge strip of lifestyle photos under the hero. The page's own hero photo is left out;
 * the strip is hidden until at least three of the rest are ready.
 */
export const PHOTO_BAND = {
  title: "Kids, grandparents and everyone in between",
  ids: ["kitchen-table", "living-room-floor", "fridge", "dog-coloring"] as LifestyleId[],
};

/** One phone snapshot in the "What people are making" gallery. */
export type MadePhoto = {
  /** Built by scripts/prepare-made-images.mjs: <src> plus -400 and -800 siblings. */
  src: string;
  alt: string;
  /** Short line on the card, about the moment. No names, quotes or places unless the sender agreed to them. */
  caption: string;
  width: number;
  height: number;
};

/**
 * "What people are making": phone photos of finished pages out in the world. Newest first; the
 * gallery slides once there are more than fit. To add one: get the sender's permission to show it,
 * run node scripts/prepare-made-images.mjs <photo> <id>, then add the entry here.
 */
export const MADE_PHOTOS: MadePhoto[] = [
  {
    src: "/marketing/made/christmas-morning.webp",
    alt: "A dad and his son in pajamas on Christmas morning, the boy grinning and holding up a colored page of the two of them fishing off a dock",
    caption: "Christmas morning. He hasn't put it down since",
    width: 1024,
    height: 1536,
  },
  {
    src: "/marketing/made/bridal-shower.webp",
    alt: "Four friends at a garden party taking a selfie, each holding up a colored page made from one of their own photos",
    caption: "One for each of the girls at the bridal shower",
    width: 1024,
    height: 1536,
  },
  {
    src: "/marketing/made/road-trip.webp",
    alt: "Two kids in car seats coloring pages of their family at the beach; the girl holds hers up and laughs",
    caption: "Kept them busy the whole drive to the beach",
    width: 1024,
    height: 1536,
  },
  {
    src: "/marketing/made/picnic-dock.webp",
    alt: "A mom, grandpa and two kids at a picnic table, each holding a colored copy of the same family photo on a dock",
    caption: "Printed one for everybody at the family picnic",
    width: 1024,
    height: 1536,
  },
  {
    src: "/marketing/made/wedding-page.webp",
    alt: "An older woman coloring the flowers on a page made from her wedding photo while her daughter watches",
    caption: "Mom coloring her own wedding picture",
    width: 1024,
    height: 1536,
  },
];

export const MADE_GALLERY = {
  eyebrow: "From families like yours",
  title: "What people are making",
  body: "Car rides, family picnics, a visit with Grandma. Here are a few we love.",
  prev: "Previous photos",
  next: "More photos",
  shareLead: "Made something?",
  shareLink: "Send us a photo",
  shareSubject: "A photo of our coloring pages",
};

/** The real before/after, shown big. The switcher lists every real pair on the page. */
export const TRANSFORM = {
  eyebrow: "Before and after",
  title: "This started as an everyday photo",
  /** The title while book packages are on sale. */
  titleBook: "Made from your own photos",
  body: "These are real family photos and the coloring pages made from them. Drag to see both.",
  /** Under the slider while book packages are on sale (the touch-up box and the big button go). */
  tryLink: "Try it with one of your photos, free",
  fixTitle: "Not quite right?",
  fixBody: "Type what you'd change, like “take out the stroller” or “make the hat say Duke,” and it draws the page again. Want more to color? Ask for more detail.",
};

/** Photo behind the final call to action: the first one that is ready. */
export const FINAL_CTA_PHOTOS: LifestyleId[] = ["mail-day", "dog-coloring", "kitchen-table"];

/** "Before you order": true statements only, each tied to code (see the build notes). */
export const REASSURANCE = {
  title: "Before you order",
  items: [
    { icon: "shield", text: "You see the exact price before you pay" },
    { icon: "truck", text: "Printed to order and shipped" },
    { icon: "sparkles", text: "Try pages free, no account needed" },
    { icon: "message", text: "Edit any page before printing" },
    { icon: "book", text: "Look through every page before you order a printed book" },
    { icon: "image", text: "We never use your photos for ads" },
  ] satisfies { icon: IconName; text: string }[],
  contactLead: "Questions? Email",
};

/** The gift page's timing cards. The first reads right whether or not an order-by date is set. */
export const GIFT_TIMING = {
  withDate: {
    title: "Place your book order by {date} for Christmas",
    body: HOLIDAY_CHECKOUT_NOTE,
  },
  withoutDate: {
    title: "Printed to order",
    body: HOLIDAY_CHECKOUT_NOTE,
  },
  pdf: {
    title: "Need it sooner?",
    body: "Make the whole book as a print-at-home PDF. It downloads as soon as you order, and you print it on your own printer.",
    bodyWithPrice: "Make the whole book as a print-at-home PDF for {pdfPrice}. It downloads as soon as you order, and you print it on your own printer.",
  },
};

/** The partners page's contact block. The subject is prefilled; the body is left to the sender. */
export const PARTNER_CONTACT = {
  eyebrow: "Let's talk",
  title: "Tell us what you have in mind",
  body: "Email us about your session, class or event. Pricing for larger or repeat orders is quoted individually, so tell us roughly what you need.",
  cta: "Email us about a book",
  subject: "Colorful Memories for my business or event",
  askTitle: "Helpful to include",
  asks: ["What you do: photographer, school, attraction or event", "What you would like families to get", "Roughly how many books"],
  secondary: PRIMARY_CTA,
  emailLabel: "Or write to",
  copy: "Copy email",
  copied: "Copied",
};

/** The empty studio: the first thing a new visitor sees after "Try a free coloring page". */
export const STUDIO_EMPTY = {
  title: "Choose a photo to start",
  line: "We'll turn it into a coloring page.",
  button: "Choose a photo",
  /** Mouse and trackpad only; touch screens don't drag files in. */
  dragHint: "Or drag a photo in.",
  /** "{size}" is the upload limit per photo. */
  formats: "Any photo from your phone or computer, up to {size} each.",
  /** Guests only. */
  guestNote: "No account needed. Your photo is only used to draw your page.",
  howItWorks: "How it works",
  /** Replaces `line` for visitors who arrived from a landing page. Other intents use `line`. */
  lineByIntent: {
    gift: "Pick a photo of the grandkids. We'll turn it into a coloring page.",
    birthday: "Pick a photo of the birthday kid. We'll turn it into a coloring page.",
    pets: "Pick a photo of your dog, cat or favorite animal. We'll turn it into a coloring page.",
  } as Partial<Record<LandingIntent, string>>,
};

/** The landing inside a brand-new, empty album: name it, then add its first photos. */
export const NEW_ALBUM = {
  namePlaceholder: "Name your album",
  nameLabel: "Album name",
  nameSaved: "Saved",
  rename: "Rename",
  /** Tapping one names the album at once. "{year}" is this year. */
  suggestions: ["Family favorites", "Our trip", "The grandkids", "Holidays {year}"],
  dropTitle: "Add your first photos",
  dropTitleNamed: "Add photos to {name}",
  button: "Choose photos",
  /** Pointer devices only: touch screens can't drag files in. */
  dragHint: "Or drop them here",
  /** "{size}" is the per-photo upload limit. */
  sizeLimit: "up to {size} each",
  exampleCaption: "Your photo, as a page to color",
  exampleTime: "About a minute",
  guide: "How it works",
  // The guided setup on an empty album: theme, then name, then photos.
  setupEyebrow: "New album",
  setupTitle: "Let's set up your album",
  /** A book package's album. Tokens as in BOOK_PACKAGES. */
  setupEyebrowBook: "{bindingName} · {includedPhotos} photos included",
  setupTitleBook: "Let's set up your {bindingNameLower}",
  setupSub: "A couple of quick choices, then your photos. You can change anything later.",
  stepTheme: "Choose a theme",
  stepThemeDone: "Theme",
  stepThemeOptional: "Optional",
  stepThemeAsk: "Draw every page in a world you pick, like space explorers or under the sea. Or keep pages just like your photos.",
  stepThemeAdd: "Add a theme",
  stepThemeSkip: "No theme",
  stepThemeNone: "No theme",
  stepThemeNoneSub: "Pages look like your photos",
  stepName: "Name your album",
  stepNameDone: "Album name",
  stepNameNext: "Save name",
  stepNameSkip: "Skip for now",
  cancel: "Cancel",
  stepPhotos: "Add your photos",
  change: "Change",
  // The step-by-step guide beside the setup.
  guideEyebrow: "How it works",
  guideTitle: "From photo to coloring book",
  guideSteps: [
    { title: "Add a photo", body: "Any photo from your phone. One to three people facing the camera, in good light, works best." },
    { title: "We draw your page", body: "It becomes a black-and-white coloring page of the people in it." },
    { title: "Touch it up if you like", body: "Type a change, like “take out the stroller”, and the page is drawn again." },
    { title: "Print or order your book", body: "Print pages at home, or order the finished book. We print it and mail it to you." },
  ],
  guideMore: "See the full guide",
  // The home page's year album, once the book wizard has made it.
  yearPhotosLine: "Start with the photos you added in {year}. You can add others too.",
  yearPhotosButton: "Use my {year} photos",
  yearPhotosOther: "Choose other photos",
};

/** Asked when someone leaves a new album without naming it or adding photos. */
export const KEEP_ALBUM = {
  title: "Keep this album?",
  description: "You haven’t named it or added any photos yet. Keep it to come back to later, or let it go.",
  keep: "Keep album",
  discard: "Don’t keep it",
  discardFailed: "Couldn't remove the album",
};

/** Name of a brand-new first album for visitors who arrived from a landing page. */
export const INTENT_ALBUM_NAME: Partial<Record<LandingIntent, string>> = {
  gift: "Gift book",
  birthday: "Birthday book",
  pets: "Pet book",
};

/** Starting points in the edit box. Tapping one fills the box; it never sends. */
export const EDIT_SUGGESTIONS = [
  "Thicker lines",
  "Simplify the background",
  "Remove people in the background",
  "Add more detail",
];

export type ProductCopy = {
  icon: IconName;
  name: string;
  tagline: string;
  /** Price slot. "{price}" lines are hidden when the price is unknown. */
  price: string;
  points: string[];
  cta: string;
  note?: string;
  featured?: boolean;
  badge?: string;
  /** Product line behind this card; the card is hidden while that line is off by default. */
  feature?: "storybook";
  /** Picture at the top of the card: a real coloring page, the printed book, or the story icon. */
  visual: "page" | "book" | "story";
};

/** The address people write to. Shown on the terms page and in the footer. */
export const CONTACT_EMAIL = "hello@colorfulmemories.net";

export const PRODUCTS = {
  eyebrow: "What you can make",
  title: "From one page to a whole book",
  body: "Try a page free. You see the exact price before you order a printed book.",
  items: [
    {
      icon: "printer",
      name: "Coloring pages",
      tagline: "Print at home",
      price: "Free to try, no account",
      points: ["Letter-size PDF, ready to print", "Edit any page by typing a note", "No account needed"],
      cta: PRIMARY_CTA,
      visual: "page",
    },
    {
      icon: "book",
      name: "Printed coloring book",
      tagline: "A real book of your family, shipped where you choose",
      price: PRICE_LINE,
      points: [
        "Pages your kids recognize: their faces, their dog, their house",
        "Stapled, spiral or paperback, printed to order",
        "Exact price shown before you pay",
      ],
      cta: PRIMARY_CTA,
      note: "Sign up and get {freeSheets} to start.",
      featured: true,
      badge: "Best for gifts",
      visual: "book",
    },
    {
      icon: "message",
      name: "Story book",
      tagline: "Turn a trip into a story they can color",
      price: "Included with your pages",
      points: ["Turn an album into a story", "Captions you can edit", "Color it, read it, keep it"],
      cta: PRIMARY_CTA,
      feature: "storybook",
      visual: "story",
    },
  ] satisfies ProductCopy[],
};

/** Shared questions. Landing pages pick from these by `id` (see LandingPageCopy.commonFaq). */
export const FAQ: { title: string; items: (FaqEntry & { id: string })[] } = {
  title: "Questions",
  items: [
    {
      id: "package",
      q: "How does a book package work?",
      a: "Choose a stapled booklet, a spiral bound book or a paperback and pay once. The price covers your photos made into coloring pages[[, {touchUps} on each page]] and printing the book. Shipping is added when you order the book.",
    },
    {
      id: "shipping",
      q: "Is shipping included?",
      a: "No. Shipping is added when you place your book order. You see the shipping price and delivery dates for your address before you pay.",
    },
    {
      id: "morePhotos",
      q: "What if I have more photos than my book includes?",
      a: "You can still add them. Each extra photo is {pagePrice} from your wallet balance, and you see the price before anything is charged. Extra pages also add to the printing price of the book.",
      fallback:
        "You can still add them. Extra photos are paid from your wallet balance, and you see the price before anything is charged. Extra pages also add to the printing price of the book.",
    },
    {
      id: "cancel",
      q: "Can I change my mind?",
      a: "Yes, any time before you order the book. You get back what you paid, minus {pagePrice} for each coloring page already made. It goes to your wallet balance, not back to your card.",
      fallback:
        "Yes, any time before you order the book. You get back what you paid, minus the price of the coloring pages already made. It goes to your wallet balance, not back to your card.",
    },
    {
      id: "tryFree",
      q: "Can I try it before I buy?",
      a: "Yes. Make a coloring page from one of your photos without an account, up to a daily limit, and print it at home for free.",
    },
    {
      id: "themes",
      q: "What is a theme?",
      a: "An optional world for your whole book, like “Under the sea.” Every new page is drawn in it, and everyone still looks like themselves. You can change or remove it later. Pages you've already made stay as they are.",
    },
    {
      id: "account",
      q: "Do I need an account?",
      a: "No. Tap Try a free coloring page and start right away. Create a free account when you want to save albums across devices or order a printed book.",
    },
    {
      id: "cost",
      q: "What does it cost to make pages?",
      a: "Trying a page without an account is free, up to a daily limit. With an account, each new page uses [[{pagePrice} of ]]your wallet balance[[, and signing up gives you {freeSheets} to start]]. You see the exact price of a book before you pay.",
    },
    {
      id: "photos",
      q: "What photos work best?",
      a: "Clear, well-lit photos with one to three people or a simple scene come out best. Busy backgrounds still work. You can ask for them to be simplified.",
    },
    {
      id: "fix",
      q: "Can I fix a drawing I don't love?",
      a: "Yes. Every page has a chat where you can type things like “make the lines thicker” or “remove the car in the back,” and it redraws the page.",
    },
    {
      id: "price",
      q: "How much is a printed book?",
      a: "As an example, a {refPages}-page {refFormat} is about {price} with US shipping, before tax. The price depends on page count, binding and where it ships, and you see the exact price before you pay.",
      fallback:
        "It depends on page count, binding and where it ships. You'll see the exact price, printing and shipping included, before you pay.",
    },
    {
      id: "adults",
      q: "Is it only for kids?",
      a: "Not at all. Plenty of grown-ups color too. Ask for “more detail” on any page and you'll get finer lines and more to fill in.",
    },
    {
      id: "events",
      q: "Can I use it for a wedding or a family party?",
      a: "Yes. Print single pages free at home for the kids' table, or make the whole book as a print-at-home PDF and print as many copies as you need. A printed book order is one book.",
    },
    {
      id: "bleed",
      q: "Will markers bleed through the paper?",
      a: "Not onto another picture. Each photo prints on its own page with the back left blank.",
    },
    {
      id: "deadline",
      q: "When do I need to order for Christmas?",
      a: "Place your book order by {date} for Christmas. Delivery dates for your address are shown at checkout before you pay.",
    },
    {
      id: "gift",
      q: "Can I send a book as a gift?",
      a: "Yes. Choose “This is a gift” at checkout to ship it to someone else and add a note.",
      link: { href: "/gift", label: "More about gift books" },
    },
    {
      id: "time",
      q: "How long does a printed book take?",
      a: "Books are printed to order. Printing and shipping times are shown at checkout before you pay.",
    },
    {
      id: "copies",
      q: "Can I order more than one copy?",
      a: "Each order is one book today. For another copy, place a second order with the same pages. For a larger order, email us at {email}.",
    },
    {
      id: "business",
      q: "Can I make a book for a business or event?",
      a: "Yes. Pricing for larger or repeat orders is quoted individually, so email us at {email} with what you have in mind.",
      link: { href: "/partners", label: "For businesses and groups" },
    },
    {
      id: "safe",
      q: "Is it safe to upload photos of my kids?",
      a: "When you're signed in, your photos and coloring pages are stored privately in your account and are not shown to other customers. To draw a page, your photo is sent to our image provider, only for that. We never use your photos for ads. Delete an album or your account and they're gone. Without an account, the photo is sent only to draw your page and we don't keep it. The finished pages stay in your browser until you make an account.",
    },
  ],
};

export const FINAL_CTA = {
  title: "Start with one free coloring page",
  body: "Pick a photo from your camera roll. You'll have a page ready to print and color.",
  creditBadge: "Sign up free and get {freeSheets}",
  cta: PRIMARY_CTA,
  points: ["Free to try, no account", "Exact price before you pay", "Printed to order and shipped"],
  signIn: "Already have an account? Sign in",
  /** While book packages are on sale: the brand line, one button, one quiet link. */
  book: {
    title: "Color the moments that matter.",
    body: "Choose your book, add your photos, and we'll print it for you.",
    cta: HERO_BOOK.primary,
    secondary: HERO_BOOK.secondary,
  },
};

export const FOOTER: {
  /** The brand line above the copyright row. */
  brandLine: string;
  copyright: string;
  links: { href: string; label: string; intent: LandingIntent; feature?: "storybook" }[];
  legal: { href: string; label: string }[];
  contact: string;
  signIn: string;
} = {
  brandLine: "Color the moments that matter.",
  copyright: "Colorful Memories · LBC Innovation",
  /** First row: where to go next. */
  links: [
    { href: "/gift", label: "Gift a book", intent: "gift" },
    { href: "/birthday", label: "Birthdays", intent: "birthday" },
    { href: "/pets", label: "Pets", intent: "pets" },
    { href: "/partners", label: "For businesses", intent: "partners" },
    { href: "/story", label: "Story mode", intent: "story", feature: "storybook" },
  ],
  /** Second row, next to Contact and Sign in. */
  legal: [{ href: "/terms", label: "Terms & privacy" }],
  contact: "Contact",
  signIn: "Already have an account? Sign in",
};

/** Inline card under a guest's first coloring page (and again after the third). */
export const SAVE_PROMPT = {
  title: "Save this page and get {freeSheets}.",
  /** Used when there is no sign-up credit. */
  titleNoCredit: "Save this page to your free account.",
  body: "A free account keeps your pages safe and lets you start a book.",
  save: "Save my pages",
  dismiss: "Not now",
};

/** Card in an album with pages, nudging toward a printed book. */
export const BOOK_NUDGE = {
  title: "You have {count} pages. Make them a book.",
  titleOne: "You have 1 page. Make it a book.",
  /** Shown when the album is under the chosen format's minimum. */
  progress: "{count} of {min} pages for a {format}",
  cta: "Make a book",
};

/**
 * "Turn this into a book": the card under a finished coloring page in the studio. It shows when the
 * "Save this page" card isn't due, and can be dismissed for the session.
 */
export const UPSELL = {
  title: "Turn this into a book",
  /** While book packages are on sale (a person with too few pages for a book of their own). */
  bookTitle: "Make it a book",
  bookLine: "Book packages from {packageFrom}: your photos as coloring pages, printed and shipped.",
  bookCta: "See the books",
  /** "{more}" pages short of the smallest printed format. One line, so the card stays small. */
  needMore: "Add {more} more pages to print and ship a book.",
  needMoreOne: "Add 1 more page to print and ship a book.",
  enough: "Your pages, printed and shipped.",
  cta: "Make a book",
  addPhotos: "Add more photos",
  dismiss: "Dismiss",
};

/** Shown wherever a guest is asked to make an account. "{freeSheets}" is the sign-up gift. */
export const ACCOUNT_CREDIT_LINE = "You'll get {freeSheets} to start";

/** What a guest sees on pages that need an account. */
export const GUEST_GATES = {
  book: {
    title: "Create a free account to make your book",
    body: "Your pages come with you when you sign up. You see the exact price of a book before you pay.",
    primary: "Create free account",
    secondary: "I already have an account",
  },
  orders: {
    title: "Sign in to see your orders",
    body: "Your printed books and paid downloads show up here once you sign in.",
    primary: "Sign in",
    secondary: PRIMARY_CTA,
  },
};

export const SIGN_IN = {
  title: "Welcome back",
  subtitle: "Get back to your albums and orders.",
  emailConfirmed: "Email confirmed. Sign in to keep going.",
  forgot: "Forgot password?",
  submit: "Sign in",
  newHere: "New here?",
  createAccount: "Create an account",
  wrongPassword: "That email and password don't match. Check them and try again.",
  notConfirmed: "Please confirm your email first. We sent you a link when you signed up.",
  tooManyTries: "Too many tries. Please wait a few minutes and try again.",
  fallbackError: "We couldn't sign you in. Please try again.",
};

export const SIGN_UP = {
  title: "Create your free account",
  benefit: "Save your pages, pick up on any device, and order a printed book.",
  submit: "Create free account",
  passwordRule: "At least 6 characters.",
  haveAccount: "Already have an account?",
  signIn: "Sign in",
  alreadyExists: "There's already an account for that email.",
  tooManyTries: "Too many tries. Please wait a few minutes and try again.",
  weakPassword: "Choose a password with at least 6 characters.",
  fallbackError: "We couldn't create your account. Please try again.",
  checkEmailTitle: "Check your email",
  checkEmailBody: "We sent a link to confirm your address. Open it, then sign in to start.",
  goToSignIn: "Go to sign in",
};

export const PASSWORD_RESET = {
  forgotTitle: "Forgot your password?",
  forgotBody: "Enter your email and we'll send you a link to choose a new one.",
  forgotSubmit: "Send reset link",
  sentTitle: "Check your email",
  sentBody: "If there's an account for that address, we've sent a link. It can take a few minutes to arrive.",
  backToSignIn: "Back to sign in",
  rateLimited: "Too many tries. Please wait a few minutes and try again.",
  requestFailed: "We couldn't send the email just now. Please try again in a moment.",
  resetTitle: "Choose a new password",
  resetSubmit: "Save new password",
  newPassword: "New password",
  passwordRule: "At least 6 characters.",
  invalidTitle: "This link has expired",
  invalidBody: "Reset links only work once and for a short time. Request a new one and we'll send it right over.",
  requestNew: "Get a new link",
  resetFailed: "We couldn't save your new password. Please try again.",
  success: "Your password was changed. Sign in with your new password.",
};

/** Shown when a guest runs into the daily limit. */
export const GUEST_LIMIT = {
  pagesTitle: "You've made today's free pages",
  editsTitle: "You've used today's free edits",
  busyTitle: "We're very busy right now",
  body: "Create a free account to keep going. Your pages come with you.",
  busyBody: "Create a free account to keep going, or try again later.",
  primary: "Create free account",
  dismiss: "Not now",
  /** Under the body while book packages are on sale. */
  bookLine: "Or start a book: your photos and the printing, for one price.",
  bookLink: "See the books",
};

/**
 * Book packages: pick a book, pay once, then fill it. Numbers are tokens filled from the server's
 * catalog and the price list ({packagePrice}, {includedPhotos}, {editsEach}, {pagePrice}, ...);
 * a line whose token can't be filled hides itself (see fillCopy).
 */
export const BOOK_PACKAGES = {
  steps: ["Book", "Pay", "Theme", "Photos"],
  /** "Print as you go" has nothing to pay up front, so it skips the Pay step. */
  stepsPages: ["Book", "Theme", "Photos"],
  stepsLabel: "Steps",
  back: "Back",
  chooseTitle: "Start with the book",
  chooseSubtitle: "Pick a book, pay once, then fill it with photos.",
  /** Opened from the home page's year album. */
  chooseSubtitleYear: "Pick a book for “{albumName}”. Once it's set up, you'll bring in your {year} photos.",
  tileLines: [
    "{includedPhotos} photos, each made into a coloring page",
    "{touchUps} on each page",
    "The printed {bindingNameLower}",
  ],
  tileShipping: "Shipping is added when you order the book.",
  tileButton: "Choose {bindingName}",
  blankBacksNote: "Each photo prints on its own page with a blank back, so it's easy to color.",
  // The fourth card: the pay-per-page album (no package).
  justPagesTitle: "Print as you go",
  // After the per-page price on the card ("$0.10 / page").
  justPagesPriceUnit: " / page",
  justPagesLines: [
    "Pay only for the pages you make",
    "Print any page at home for free",
    "Make it into a book whenever you like",
  ],
  justPagesLinesGuest: [
    "Try a free coloring page, no account needed",
    "Print any page at home for free",
    "Make it into a book whenever you like",
  ],
  justPagesNote: "Each new page uses a little of your wallet balance.",
  justPagesNoteGuest: "Create a free account to save your pages.",
  justPagesButton: "Print as you go",
  loadError: "We couldn't load the books just now.",
  tryAgain: "Try again",

  payTitle: "Your {bindingName}",
  included: "What's included",
  includedLines: [
    "{includedPhotos} photos made into coloring pages",
    "{touchUps} on each of those pages",
    "Printing your {bindingNameLower}, up to {includedPhotos} photos",
  ],
  notIncluded: "Not included",
  notIncludedShipping: "Shipping. You'll see the price when you order the book.",
  // Paying the book's shipping with the package.
  shippingHeading: "Shipping",
  shippingNow: "Pay shipping now",
  shippingNowSub: "Tell us where the book goes. Your book will be fully paid, with nothing to pay when you order it.",
  shippingLater: "Pay shipping when I order the book",
  shippingLaterSub: "You'll see the price at checkout.",
  shippingChecking: "Checking shipping to this address…",
  shippingFillAddress: "Fill in the address to see the shipping price.",
  shippingQuoteFailed: "We couldn't price shipping to that address just now.",
  shippingRetry: "Try again",
  shippingSavedNote: "We'll save this address to your account and use it for your book.",
  shippingChanged: "The shipping price changed. Please check the new price before you pay.",
  includedShippingLine: "Standard shipping and tax to {city}",
  summaryShipping: "Standard shipping and tax",
  // The pay screen's ledger: what is charged, then how it is paid.
  ledgerHeading: "Your payment",
  ledgerPackage: "Book package",
  ledgerShipping: "Standard shipping",
  ledgerTax: "Tax",
  ledgerShippingPending: "Shipping and tax",
  ledgerShippingPendingValue: "Needs an address",
  ledgerShippingLater: "Shipping",
  ledgerShippingLaterValue: "Paid when you order",
  ledgerTotal: "Total",
  ledgerCredit: "From your wallet balance",
  ledgerDueCard: "Due on card",
  ledgerDueNothing: "Left to pay",
  ledgerCreditAfter: "Your remaining wallet balance after this: {balanceAfter}",
  ledgerTopUpNote: "Your card pays the rest. It's added to your wallet balance, and the book is paid from it in the same step.",
  notIncludedPhotos: "Photos past {includedPhotos}: {pagePrice} each from your wallet balance",
  notIncludedTouchUps: "More Creative Touch-Ups on a page: {editPrice} each from your wallet balance",
  oneAlbumNote: "This package belongs to one album. It can't be used for another album.",
  buttonCredit: "Pay {packagePrice} from my wallet balance",
  buttonCard: "Pay {packagePrice} by card",
  buttonPaying: "Paying…",
  buttonOpening: "Opening secure payment…",
  buttonFinishing: "Finishing your payment…",
  underButton: "One payment for this album's book. You'll see what's left of it as you go.",
  topUpPending:
    "Your bank is still confirming the card payment. Once it shows in your wallet balance, come back here to pay for your book from it.",
  topUpConfirmFailed:
    "We couldn't confirm the card payment just now. Anything you were charged goes to your wallet balance. Reload the page to try again.",
  topUpAddedRetry: "Your card payment is in your wallet balance. Check the amounts and pay again.",
  guestTitle: "Create a free account to get your book",
  guestBody: "Your book and its photos are kept in your account, so you can fill it on any device.",
  guestPrimary: "Create free account",
  guestSecondary: "I already have an account",
  unavailable: "That book isn't available right now. Please pick another.",
  priceChanged: "The price of this book changed to {packagePrice}. Please check it before you pay.",
  creditShort: "Your wallet balance changed. Check the new amounts and pay again.",
  payFailed: "That didn't go through, and you weren't charged. Please try again.",
  paidToastTitle: "Your book is ready",
  paidToastBody: "{includedPhotos} photos and the printing are paid for.",
  paidToastBodyShipping: "{includedPhotos} photos, the printing and shipping are paid for.",
  canceledNote: "Payment canceled. No charge was made. Your book choice is kept.",

  returnConfirmingTitle: "Confirming your payment",
  returnConfirmingBody: "This takes a few seconds.",
  returnPaidTitle: "Your book is paid for",
  returnPaidBody: "{includedPhotos} photos and the printing of your {bindingNameLower} are ready to use.",
  returnContinue: "Continue",
  returnPendingTitle: "Still confirming your payment",
  returnPendingBody:
    "Your bank is taking a moment. You can wait here, or leave: your book will show up in your albums as soon as it's confirmed.",
  returnGaveUpTitle: "We're still waiting on your bank",
  returnGaveUpBody:
    "Your book will show up in your albums once the payment is confirmed. If it doesn't, write to us at {email}.",
  returnGaveUpBodyNoEmail: "Your book will show up in your albums once the payment is confirmed.",
  returnAlbums: "Go to my albums",
  returnCheckAgain: "Check again",
  returnFailedTitle: "That payment didn't go through",
  returnFailedBody: "You weren't charged. You can try again with another card or your wallet balance.",
  returnTryAgain: "Try again",
  returnPickAnother: "Pick another book",
  returnOpenAlbum: "Open my album",

  // The package landing in an empty package album.
  landingIncluded: "{includedPhotos} photos included",
  landingSub: "{bindingName} · {touchUps} on each page",
  landingPick: "Pick up to {photosLeft}. Each one becomes a coloring page, already paid for.",
  landingPickNone: "Your included photos are used. New photos are extra pages, paid from your wallet balance.",
  themeRowSet: "Theme: {theme}",
  themeRowNone: "No theme yet",
  themeChange: "Change",
  themeAdd: "Add a theme",

  // The meter above the gallery.
  meterTitle: "Your {bindingNameLower}",
  meterMain: "{photosUsed} of {includedPhotos} photos used",
  // The slim strip: "4 of 40 photos" then a short status.
  meterCount: "{photosUsed} of {includedPhotos} photos",
  meterLeftShort: "{photosLeft} left, already paid for",
  meterLeftTiny: "{photosLeft} left",
  meterAllShort: "All included photos used",
  // A photo past what the package covers, on its gallery card.
  beyondCaption: "Not covered by your book",
  beyondAdd: "Add for {pagePrice}",
  beyondAddNoPrice: "Add for a fee",
  beyondAdding: "Adding…",
  beyondAddedBody: "It's paid from your wallet balance and goes in your book.",
  meterExtraChip: "Extras {pagePrice} each",
  meterDetails: "Details",
  meterAddPhotos: "Add photos",
  meterAllMain: "All {includedPhotos} photos used",
  meterOrderedMain: "Book ordered",
  meterViewOrder: "View order",
  meterStepOrder: "Order my book",
  meterDisclosure: "What your book includes",
  meterIncludes: [
    "{includedPhotos} photos made into coloring pages",
    "{touchUps} on each of those pages",
    "Printing your {bindingNameLower}",
    "Not included: shipping, added when you order the book",
  ],
  meterCancel: "Cancel package",
  // Canceling a package (refund to the wallet).
  cancelTitle: "Cancel your book package?",
  cancelLoading: "Checking your package…",
  cancelPaid: "You paid for your {bindingNameLower}",
  cancelPages: "{pagesUsed} pages made × {pagePrice}",
  cancelPagesNone: "No pages made yet",
  cancelRefund: "Back to your wallet balance",
  cancelRefundNote: "Refunds go to your wallet balance, ready for pages or a book anytime.",
  cancelKeep: "Keep my album and pages",
  cancelKeepSub: "It becomes a regular album. New pages use your wallet balance.",
  cancelDelete: "Delete the album and photos too",
  cancelDeleteSub: "Permanently deletes all {photos} and every coloring page made from them.",
  cancelDeleteWarning: "This can't be undone. Download or print any pages you want to keep first.",
  cancelDeleteSubEmpty: "Permanently deletes the album.",
  cancelConfirmKeep: "Refund {refund}",
  cancelConfirmDelete: "Refund {refund} and delete",
  cancelNever: "Keep package",
  cancelDoneTitle: "Package canceled",
  cancelDoneBody: "{refund} is back in your wallet balance.",
  cancelDoneDeleted: "{refund} is back in your wallet balance, and the album was deleted.",
  cancelDeleteFailed: "Your package was canceled and {refund} is back in your wallet balance, but the album couldn't be deleted. Try deleting it again.",
  cancelOrdered: "Your book has already been ordered with this package, so there's nothing to refund.",
  cancelError: "We couldn't check your package just now. Nothing was changed.",
  // Shown before paying.
  refundPolicy: "Change your mind before ordering the book? Cancel anytime and the unused value goes back to your wallet balance.",
  meterExtraNote:
    "You can add more photos and Creative Touch-Ups. Those come from your wallet balance, never from your book, and always show their price first.",

  // Upload.
  addTitleLeft: "Add photos",
  addLineLeft: "{photosLeft} more photos are included in your book.",
  addTitleAll: "Add extra photos",
  addLineAll:
    "Your book's {includedPhotos} photos are all in. Extra photos are {pagePrice} each from your wallet balance. Your book package isn't used.",
  addButtonExtra: "Add extra photos · {pagePrice} each from your wallet balance",
  splitTitle: "You picked {pickedCount} photos",
  splitDescription: "{includedCount} are included in your book. {extraCount} are extra.",
  splitNote:
    "Extra photos cost {extraTotal} from your wallet balance, charged as each page is made. Your book package isn't used for them.",
  splitPrimary: "Add all {pickedCount} · {extraTotal} extra",
  splitSecondary: "Add only the {includedCount} included",
  splitCancel: "Cancel",
  splitAllExtraTitle: "These photos are extra",
  splitAllExtraDescription:
    "Your book's {includedPhotos} photos are all in. These {pickedCount} photos are {pagePrice} each from your wallet balance.",
  splitAllExtraPrimary: "Add {pickedCount} extra photos · {extraTotal}",
  splitCredit: "Your wallet balance is {balance}. You can add to it after, when a page is made.",
  splitMore: "+{n} more",

  // Pages.
  touchUpsLeft: "{touchUpsLeft} free Creative Touch-Ups left",
  oneTouchUpLeft: "1 free Creative Touch-Up left",
  touchUpsUsed: "Creative Touch-Ups used",
  extraPage: "Extra page",
  deleteNote:
    "This photo's included slot stays used. Deleting it won't give the page back to your book, so you can't add another included photo in its place.",
  deleteNoteExtra: "This is an extra page, so nothing in your book package changes.",
  restIncluded: "included in your book",
  editInfoOne: "1 free Creative Touch-Up left on this page. After that, {editPrice} each from your wallet balance.",
  editInfoMany: "{touchUpsLeft} of {editsEach} free Creative Touch-Ups left on this page.",
  editCostUsed:
    "This page's free Creative Touch-Ups are used. Each Creative Touch-Up from here is {editPrice} from your wallet balance. Your book package isn't used.",
  editCostExtraPage: "This is an extra page, so Creative Touch-Ups are {editPrice} each from your wallet balance.",
  touchUpButton: "Touch up · {editPrice}",
  addCreditNote:
    "Your {bindingNameLower} package is untouched. Its {photosLeft} included photos and the printing are still saved for this album.",
  addCreditNoteNoPhotos: "Your {bindingNameLower} package is untouched. The printing is still paid for.",
  addCreditFor: ["this extra page", "this extra Creative Touch-Up", "these extra pages"],

  // Order panel.
  orderPrintingIncluded: "Your package pays for printing. You pay for shipping and its tax.",
  orderAllPaid: "Your package pays for printing and the shipping you paid for. Nothing left to pay.",
  orderShippingPrepaidLine: "Shipping paid with your package",
  orderExtraWithShipping:
    "Your package pays for printing {includedPhotos} photos and the shipping you paid for. The rest is extra, from your wallet balance.",
  orderExtraPages: "Your package pays for printing {includedPhotos} photos. The {k} extra pages and shipping come from your wallet balance.",
  orderOtherBinding:
    "You chose a {otherBindingNameLower}, so your package isn't paying toward printing. Switch back to your {bindingNameLower} to use it.",
  orderSwitchBack: "Switch back",
  orderPrintingLine: "Printing: included by your package",
  orderExtraLine: "Extra pages ({k})",
  orderShippingChoose: "Shipping: choose a speed",
  orderIncludedNote: "Printing paid by your package",
  orderBlankBacksLocked: "Blank backs come with your package, so each photo has its own page.",
  switchTitle: "Switch to {otherBindingName}?",
  switchBody:
    "Your package pays for printing a {bindingNameLower}. If you switch, it won't pay toward printing this book, and the full printing price of {otherPrintPrice} comes from your wallet balance.",
  switchBodyNoPrice:
    "Your package pays for printing a {bindingNameLower}. If you switch, it won't pay toward printing this book, and the full printing price comes from your wallet balance.",
  switchBody2: "Your included photos and Creative Touch-Ups are not affected. You can switch back any time before you order.",
  switchKeep: "Keep my {bindingNameLower}",
  switchConfirm: "Switch to {otherBindingName}",
  orderButtonPrintingIncluded: "Printing included",
  orderButtonPrintingIncludedShipping: "Printing included · shipping at checkout",
};

/** Design themes: an album-wide world every new page is drawn in. Never sent to analytics. */
export const DESIGN_THEMES = {
  title: "Want a theme?",
  subtitle: "Skip it and your pages look just like your photos. Add one and every page is drawn in a world you pick, with everyone still looking like themselves.",
  optionalBadge: "Optional",
  choiceLabel: "Theme or no theme",
  choiceNone: "No theme",
  choiceNoneSub: "Pages look just like your photos.",
  choiceTheme: "Add a theme",
  choiceThemeSub: "Every page is drawn in a world you pick.",
  continue: "Continue",
  examplesTitle: "What a theme does",
  examplesTheme: "Theme: “{theme}”",
  examplesPhoto: "Photo",
  examplesPage: "Coloring page",
  /** Real photo and page pairs made with one theme (the owner's own album, used with permission). */
  examples: {
    theme: "Ninjas and warriors saving the city",
    pairs: [
      {
        photo: "/marketing/theme-examples/ninja-b-photo.webp",
        page: "/marketing/theme-examples/ninja-b-page.webp",
        alt: "A toddler in a park, drawn as a smiling young ninja with a sword in front of a castle",
      },
      {
        photo: "/marketing/theme-examples/ninja-c-photo.webp",
        page: "/marketing/theme-examples/ninja-c-page.webp",
        alt: "Two boys at a lake, drawn as young warriors outside a castle",
      },
      {
        photo: "/marketing/theme-examples/ninja-a-photo.webp",
        page: "/marketing/theme-examples/ninja-a-page.webp",
        alt: "A boy playing with a toy drill, drawn as a ninja polishing his sword in a castle courtyard",
      },
    ],
  },
  label: "Your theme",
  placeholder: "For example: we're all space explorers",
  help: "A few words is plenty. You can change or remove it anytime from the album.",
  ideas: "Ideas",
  ideasLabel: "Theme ideas",
  /** `id` is the fixed analytics id; the text is what fills the box. */
  starters: [
    { id: "superheroes", text: "Superheroes saving the city" },
    { id: "toy_bricks", text: "Toy brick town" },
    { id: "under_sea", text: "Under the sea" },
    { id: "space", text: "Space explorers" },
    { id: "fairy_castle", text: "Fairy tale castle" },
    { id: "dinosaurs", text: "Dinosaur safari" },
  ] as const,
  use: "Use this theme",
  saving: "Saving…",
  saved: "Theme saved. Your pages will be drawn in it.",
  savedSettings: "Theme saved. New pages will use it.",
  removed: "Theme removed. New pages will look like your photos.",
  notAllowed: "That theme won't work for a family coloring book. Try something like “Under the sea” or “Space explorers”.",
  tooLong: "Please keep it under 200 characters.",
  saveFailed: "We couldn't save your theme. Try again, or skip and add it later.",
  albumMissing: "We couldn't find that album.",
  // Album menu and settings.
  rowLabel: "Theme",
  rowNone: "None",
  modalEyebrow: "Album theme",
  modalDescription: "New pages in this album are drawn in this world. Everyone still looks like themselves.",
  modalNote: "Pages you've already made stay as they are.",
  modalSave: "Save theme",
  modalRemove: "Remove theme",
};
