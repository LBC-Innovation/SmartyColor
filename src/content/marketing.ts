/**
 * Every word on the marketing pages lives here, so it can be changed without touching components.
 *
 * Style: short plain sentences, no em dashes, no "AI" in headlines. Lead with the kid, the person
 * or the moment. Never write a price, credit amount or date by hand: use the tokens below, which
 * are filled from the real pricing code and settings. A line whose token can't be filled is hidden.
 *
 *   {price}     Price of the reference printed book, shipping included (e.g. "$14.37")
 *   {pdfPrice}  Price of the print-at-home PDF of a whole book
 *   {credit}    The sign-up credit (e.g. "$5")
 *   {date}      The Christmas order-by date (e.g. "December 7"). Only exists while the owner sets
 *               NEXT_PUBLIC_HOLIDAY_ORDER_BY and the date is still ahead.
 *   {min} {max} {format}  Page limits and name of a binding, read from src/lib/print/bookBindings.ts
 *
 * Only say what the product does today: one book per order (no multi-copy, bulk pricing, gift wrap
 * or partner program), a free coloring page with no account, edits by typing, a free letter-size
 * PDF of a single page, a print-at-home PDF of a whole book, printed books made in the US.
 *
 * This file is plain data (no imports) so scripts/generate-share-images.mjs can read it too.
 */

export type LandingIntent = "default" | "gift" | "birthday" | "pets" | "partners" | "story";

/** The one primary call to action on every marketing page (the partners page adds a contact one). */
export const PRIMARY_CTA = "Try a free coloring page";

/** Where on a marketing page a call to action sits. Sent with the `cta_click` event. */
export type CtaLocation = "hero" | "sticky" | "products" | "final" | "occasion" | "header" | "upsell";

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
  sections: LandingSections;
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
};

const BOYS_CATFISH: HeroPair = {
  photoSrc: "/marketing/boys-photo.webp",
  sheetSrc: "/marketing/boys-sheet.webp",
  photoAlt: "Three boys in a field, one holding a catfish they caught",
  sheetAlt: "The same photo as a black-and-white coloring page",
  width: 900,
  height: 1200,
  srcSetWidths: [400, 800],
};

export const BEST_PHOTOS = {
  title: "Photos that come out best",
  items: ["One to three people, facing the camera", "Daylight or a bright room", "A simple background, or ask to simplify it"],
};

export const WHY_FAMILIES: WhyBlock = {
  eyebrow: "Why families love it",
  title: "It's them on the page",
  body: "Generic coloring books are fine. A page of your kid, your dog and your backyard is the one that ends up on the fridge.",
  points: [
    { icon: "message", title: "Fix anything by typing", body: "“Thicker lines.” “Take out the stroller.” It redraws the page." },
    { icon: "truck", title: "Real books, real paper", body: "Stapled, spiral or paperback, printed in the US and shipped where you choose." },
    {
      icon: "shield",
      title: "Your photos stay yours",
      body: "Private to your account and not shown to other customers. Sent to our image provider only to draw your page. Never used for ads.",
    },
  ],
  example: BOYS_CATFISH,
  useCasesTitle: "Perfect for",
  useCases: ["Grandparent gifts", "Birthday parties", "Rainy afternoons", "Road trips", "Classrooms", "Family reunions"],
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
};

const CONSUMER_SECTIONS: LandingSections = {
  ...ALL_SECTIONS_OFF,
  howItWorks: true,
  finishedBook: true,
  products: true,
  reassurance: true,
  priceLine: true,
  bestPhotos: true,
};

export const LANDING_PAGES: Record<LandingIntent, LandingPageCopy> = {
  default: {
    intent: "default",
    path: "/",
    title: "Color the moments that matter | Colorful Memories",
    description:
      "Turn photos from your phone into a coloring book that stars the people you love. Try a free coloring page, no account needed. Order a printed book as a gift.",
    shareImage: "/share/home.png",
    shareImageAlt: "A family photo next to the coloring page made from it",
    eyebrow: "Personalized coloring books",
    eyebrowIcon: "sparkles",
    ready: true,
    coverTitle: "Our Family Book",
    headline: ["Color the moments", "that matter."],
    subhead:
      "Turn the photos already on your phone into a coloring book that stars the people you love. A gift made from a picture you already have.",
    primaryCta: PRIMARY_CTA,
    trustBullets: ["No account to start", "First page in about a minute", "Your photos stay private"],
    hero: FAMILY_BALCONY,
    sections: { ...CONSUMER_SECTIONS, occasions: true },
    why: WHY_FAMILIES,
    faq: [],
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
    trustBullets: ["Ships to them, not you", "Printed in the US", "Exact price before you pay"],
    // TODO(owner): swap in a photo of a grandparent with a grandkid and the page made from it, with
    // written consent. Replace `hero` and `why.example` with the new HeroPair.
    hero: FAMILY_BALCONY,
    sections: { ...CONSUMER_SECTIONS, occasions: true, giftTiming: true },
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
        a: "Order by {date} for Christmas. Delivery dates for your address are shown at checkout before you pay.",
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
          body: "“Thicker lines.” “Take out the car.” It redraws the page.",
        },
      ],
      // TODO(owner): a birthday-party pair (child with a cake or friends), with written consent.
      example: BOYS_CATFISH,
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
          body: "“Thicker lines.” “Remove the leash.” It redraws the page.",
        },
        {
          icon: "gift",
          title: "A gift for pet lovers",
          body: "Make a book from photos of their dog or cat and ship it to them with a note.",
        },
      ],
      // TODO(owner): a dog or cat pair, with written consent.
      example: BOYS_CATFISH,
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
    trustBullets: ["Try a free page first", "Printed in the US", "Larger orders quoted individually"],
    // TODO(owner): swap in a photographer-session or event photo and its coloring page, with written consent.
    hero: FAMILY_BALCONY,
    sections: { ...ALL_SECTIONS_OFF, howItWorks: true, partnerContact: true, bestPhotos: true },
    why: {
      eyebrow: "The idea",
      title: "A keepsake from the day they were there",
      body: "Families remember a day through its photos. Turn those photos into coloring pages and a book, and the day comes home with them.",
      points: [
        { icon: "image", title: "Starts with a photo", body: "A session favorite, a class picture or a day-out snapshot." },
        { icon: "message", title: "Easy to adjust", body: "Type a note like “thicker lines” and the page redraws." },
        { icon: "truck", title: "Printed in the US", body: "Printed books are made to order and shipped." },
      ],
      // TODO(owner): a photographer-session or event pair, with written consent.
      example: BOYS_CATFISH,
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
    trustBullets: ["Captions you can edit", "Printed in the US", "Your photos stay private"],
    // TODO(owner): swap in a trip photo and a captioned story page, with written consent.
    hero: FAMILY_BALCONY,
    sections: { ...CONSUMER_SECTIONS },
    why: WHY_FAMILIES,
    faq: [],
  },
};

/** Landing pages in the order they are listed in the sitemap, footer and occasion cards. */
export const LANDING_ORDER: LandingIntent[] = ["default", "gift", "birthday", "pets", "partners", "story"];

/** Shown under the hero CTA and on the pricing card when the reference price is known. */
export const PRICE_LINE =
  "A {refPages}-page {refFormat} is about {price} with US shipping, before tax.";

/**
 * Slim banner at the top of the home and gift pages, and next to the delivery estimate at checkout.
 * It never promises arrival; delivery dates for the address are shown at checkout.
 */
export const HOLIDAY_LINE = "Order by {date} for Christmas.";
export const HOLIDAY_CHECKOUT_NOTE = "Delivery dates for your address are shown at checkout before you pay.";

/** Homepage block under the hero. Shown only while the Christmas order-by date is set. */
export const HOLIDAY_BLOCK = {
  title: "Giving a book for Christmas?",
  body: "Ship it straight to the grandparents, or anyone you choose, with a note from you.",
  /** Shown under the body together with HOLIDAY_LINE. */
  note: HOLIDAY_CHECKOUT_NOTE,
  link: "See Christmas gifts",
  href: "/gift",
};

export const HERO_SECONDARY_CTA = "See how it works";
export const HERO_DEMO_NOTE = ["Real pages made in the studio. Type a note like", "thicker lines", "and it redraws."] as const;

/** Placeholder in the gift note box: Christmas-flavored only while the order-by date is set. */
export const GIFT_NOTE_PLACEHOLDER = { christmas: "Merry Christmas! Love, Grandma", neutral: "Love, Grandma" };

/** Phone-only sticky footer button. */
export const STICKY_CTA = PRIMARY_CTA;

export const HEADER = {
  signIn: "Sign in",
  signUp: "Sign up",
  /** Shown instead of Sign in when a session exists. The page never redirects. */
  signedIn: "Go to your albums",
};

/** The occasions cards. The card for the page you are on is left out. */
export const OCCASIONS = {
  eyebrow: "Occasions",
  title: "Made for the moments that matter",
  cards: [
    {
      intent: "gift",
      icon: "gift",
      title: "A gift book",
      /** Used instead of `title` while the Christmas order-by date is set. */
      holidayTitle: "Christmas gifts",
      body: "A printed book starring the grandkids, shipped to them with a note.",
    },
    {
      intent: "birthday",
      icon: "cake",
      title: "Birthdays",
      body: "A book starring the birthday kid, or pages to print for every guest.",
    },
    {
      intent: "pets",
      icon: "paw",
      title: "Pets",
      body: "Their dog or cat as a coloring page, for the pet lover in your life.",
    },
    {
      intent: "partners",
      icon: "briefcase",
      title: "Photographers and businesses",
      body: "Turn a session, a class or an event into a coloring book families keep.",
      /** This card goes to its page instead of starting a free page. */
      link: "See how it works for businesses",
    },
  ] satisfies {
    intent: LandingIntent;
    icon: IconName;
    title: string;
    holidayTitle?: string;
    body: string;
    link?: string;
  }[],
  /** Plain text, no links. Items tied to a page are listed here while that page is not ready. */
  othersLead: "Also made for",
  others: [
    { label: "birthdays", intent: "birthday" },
    { label: "pets", intent: "pets" },
    { label: "weddings" },
    { label: "vacations" },
    { label: "family reunions" },
    { label: "new homes" },
  ] as { label: string; intent?: LandingIntent }[],
};

export const HOW_IT_WORKS = {
  eyebrow: "How it works",
  title: "Three steps. No design skills.",
  body: "If you can send a photo, you can make a coloring book.",
  steps: [
    {
      icon: "image",
      title: "Upload a photo",
      body: "Any family picture from your phone. Birthdays, the beach, the dog. HEIC works too.",
    },
    {
      icon: "sparkles",
      title: "Get a coloring page",
      body: "In about a minute it becomes clean black-and-white line art your kid can color.",
    },
    {
      icon: "printer",
      title: "Print or order a book",
      body: "Download a free PDF for your home printer, or turn your pages into a real stapled, spiral or paperback book, shipped where you choose.",
    },
  ],
} as const;

/**
 * "See the finished book". While PRODUCT_PHOTOS is empty the page shows a CSS mock of a printed
 * cover instead; the formats below come from src/lib/print/bookBindings.ts.
 */
export const FINISHED_BOOK = {
  eyebrow: "See the finished book",
  title: "A real book, printed and shipped",
  body: "Your coloring pages, printed in the US and mailed to you, or to someone you are giving it to.",
  mockCaption: "A sample cover. Yours is made from your own pages.",
  sizeNote: "Letter-size pages (8.5 by 11 inches), black and white inside, ready to color.",
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

/** "Before you order": true statements only, each tied to code (see the build notes). */
export const REASSURANCE = {
  title: "Before you order",
  items: [
    { icon: "shield", text: "You see the exact price before you pay" },
    { icon: "truck", text: "Printed in the US and shipped" },
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
    title: "Order by {date} for Christmas",
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
  line: "We'll turn it into a coloring page in about a minute.",
  button: "Choose a photo",
  /** Mouse and trackpad only; touch screens don't drag files in. */
  dragHint: "Or drag a photo in.",
  /** "{size}" is the upload limit per photo. */
  formats: "JPG, PNG, WebP or HEIC, up to {size} each.",
  /** Guests only. */
  guestNote: "No account needed. Your photo is only used to draw your page. It is not saved to an account.",
  howItWorks: "How it works",
  /** Replaces `line` for visitors who arrived from a landing page. Other intents use `line`. */
  lineByIntent: {
    gift: "Pick a photo of the grandkids. We'll turn it into a coloring page in about a minute.",
    birthday: "Pick a photo of the birthday kid. We'll turn it into a coloring page in about a minute.",
    pets: "Pick a photo of your dog, cat or favorite animal. We'll turn it into a coloring page in about a minute.",
  } as Partial<Record<LandingIntent, string>>,
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
    },
    {
      icon: "book",
      name: "Printed coloring book",
      tagline: "A real book of your family, shipped where you choose",
      price: PRICE_LINE,
      points: [
        "Pages your kids recognize: their faces, their dog, their house",
        "Stapled, spiral or paperback, printed in the US",
        "Exact price shown before you pay",
      ],
      cta: PRIMARY_CTA,
      note: "Sign up and get a {credit} credit toward it.",
      featured: true,
      badge: "Best for gifts",
    },
    {
      icon: "message",
      name: "Story book",
      tagline: "Turn a trip into a story they can color",
      price: "Included with your pages",
      points: ["Turn an album into a story", "Captions you can edit", "Color it, read it, keep it"],
      cta: PRIMARY_CTA,
      feature: "storybook",
    },
  ] satisfies ProductCopy[],
};

/** Shared questions. Landing pages pick from these by `id` (see LandingPageCopy.commonFaq). */
export const FAQ: { eyebrow: string; title: string; items: (FaqEntry & { id: string })[] } = {
  eyebrow: "Questions",
  title: "Good to know",
  items: [
    {
      id: "account",
      q: "Do I need an account?",
      a: "No. Tap Try a free coloring page and start right away. Create a free account when you want to save albums across devices or order a printed book.",
    },
    {
      id: "cost",
      q: "What does it cost to make pages?",
      a: "Trying a page without an account is free, up to a daily limit. With an account, each new page uses [[{pagePrice} of ]]credit[[, and your {credit} sign-up credit covers the first ones]]. You see the exact price of a book before you pay.",
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
      id: "deadline",
      q: "When do I need to order for Christmas?",
      a: "Order by {date} for Christmas. Delivery dates for your address are shown at checkout before you pay.",
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
  body: "Pick a photo from your camera roll. You'll have a coloring page before the kettle boils.",
  creditBadge: "Sign up free and get a {credit} credit toward your first book",
  cta: PRIMARY_CTA,
  points: ["Free to try, no account", "Exact price before you pay", "Printed in the US"],
  signIn: "Already have an account? Sign in",
};

export const FOOTER: {
  copyright: string;
  links: { href: string; label: string; intent: LandingIntent; feature?: "storybook" }[];
  legal: { href: string; label: string }[];
  contact: string;
  signIn: string;
} = {
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
  title: "Save this page and get {credit} toward a printed book.",
  /** Used when there is no sign-up credit. */
  titleNoCredit: "Save this page to your free account.",
  body: "Every page you made here moves into your account. Downloading the free PDF still works without one.",
  save: "Save it",
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
  /** "{more}" pages short of the smallest printed format. One line, so the card stays small. */
  needMore: "Add {more} more pages to print and ship a book.",
  needMoreOne: "Add 1 more page to print and ship a book.",
  enough: "Your pages, printed in the US and shipped.",
  cta: "Make a book",
  addPhotos: "Add more photos",
  dismiss: "Dismiss",
};

/** Shown wherever a guest is asked to make an account. "{credit}" is the sign-up credit. */
export const ACCOUNT_CREDIT_LINE = "You'll get {credit} toward your first book";

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
};
