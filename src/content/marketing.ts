/**
 * Every word on the marketing pages lives here, so it can be changed without touching components.
 *
 * Style: short plain sentences, no em dashes, no "AI" in headlines. Lead with the kid or the
 * transformation. Never write a price, credit amount or date by hand: use the tokens below, which
 * are filled from the real pricing code and settings. A line whose token can't be filled is hidden.
 *
 *   {price}   Price of the reference printed book, shipping included (e.g. "$14.37")
 *   {credit}  The sign-up credit (e.g. "$5")
 *   {date}    The Christmas order-by date (e.g. "December 7")
 *
 * This file is plain data (no imports) so scripts/generate-share-images.mjs can read it too.
 */

export type LandingIntent = "default" | "gift" | "story";

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
  /** Headline: the first line plain, the second in the brand gradient. */
  headline: [string, string];
  subhead: string;
  primaryCta: string;
  trustBullets: string[];
  hero: HeroPair;
};

const FAMILY_BALCONY: HeroPair = {
  photoSrc: "/marketing/hero-photo.webp",
  sheetSrc: "/marketing/hero-sheet.webp",
  photoAlt: "A family of four smiling on a balcony above the beach",
  sheetAlt: "The same photo as a black-and-white coloring page",
  width: 1200,
  height: 900,
  srcSetWidths: [400, 800],
};

export const LANDING_PAGES: Record<LandingIntent, LandingPageCopy> = {
  default: {
    intent: "default",
    path: "/",
    title: "Turn family photos into coloring books | Colorful Memories",
    description:
      "Turn the photos already on your phone into coloring pages your kids will recognize. Print at home free, or order a real book.",
    shareImage: "/share/home.png",
    shareImageAlt: "A family photo next to the coloring page made from it",
    eyebrow: "Made from your own photos",
    headline: ["Your photos.", "Their coloring book."],
    subhead:
      "Turn the photos already on your phone into coloring pages your kids will recognize. Print at home free, or order a real book.",
    primaryCta: "Make a free page",
    trustBullets: ["No account to start", "First page in about a minute", "Your photos stay private"],
    hero: FAMILY_BALCONY,
  },
  gift: {
    intent: "gift",
    path: "/gift",
    title: "A coloring book of the grandkids | Colorful Memories",
    description:
      "Turn this year's family photos into a printed coloring book. Beach days, birthdays, the dog. Every page is someone they love.",
    shareImage: "/share/gift.png",
    shareImageAlt: "A family photo next to the coloring page made from it",
    eyebrow: "Holiday gift",
    headline: ["A coloring book", "starring the grandkids."],
    subhead:
      "Turn this year's family photos into a printed coloring book. Beach days, birthdays, the dog. Every page is someone they love.",
    primaryCta: "Start a gift book",
    trustBullets: ["Ships to them, not you", "Printed in the US", "Exact price before you pay"],
    // TODO(Zach): swap in a grandparent-and-grandkid photo and its page, with written consent.
    hero: FAMILY_BALCONY,
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
    headline: ["Your trip, as a storybook", "they can color."],
    subhead:
      "Pick a vacation album and add a line or two about what happened. Get a captioned coloring storybook to print at home or order as a real book.",
    primaryCta: "Make a storybook",
    trustBullets: ["Captions you can edit", "Printed in the US", "Your photos stay private"],
    // TODO(Zach): swap in a trip photo and a captioned story page, with written consent.
    hero: FAMILY_BALCONY,
  },
};

/** Shown under the hero CTA and on the pricing card when the reference price is known. */
export const PRICE_LINE = "Printed books from {price}, shipping included.";

/** Slim banner at the top of marketing pages, and next to the delivery estimate at checkout. */
export const HOLIDAY_LINE = "Order by {date} for Christmas delivery.";

export const HERO_SECONDARY_CTA = "See how it works";
export const HERO_DEMO_NOTE = ["Real pages made in the studio. Type a note like", "thicker lines", "and it redraws."] as const;

/** Phone-only sticky footer button. */
export const STICKY_CTA = "Try it free";

export const HEADER = {
  signIn: "Sign in",
  signUp: "Sign up",
  /** Shown instead of Sign in when a session exists. The page never redirects. */
  signedIn: "Go to your albums",
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
      body: "Download a free PDF for your home printer, or turn your pages into a real stapled or paperback book, shipped to you.",
    },
  ],
} as const;

export const WHY_FAMILIES = {
  eyebrow: "Why families love it",
  title: "It's them on the page",
  body: "Generic coloring books are fine. A page of your kid, your dog and your backyard is the one that ends up on the fridge.",
  points: [
    { icon: "message", title: "Fix anything by typing", body: "“Thicker lines.” “Take out the stroller.” It redraws the page." },
    { icon: "truck", title: "Real books, real paper", body: "Stapled booklets or paperbacks, printed in the US and shipped to you." },
    {
      icon: "shield",
      title: "Your photos stay yours",
      body: "Stored privately in your account, never shared. Delete an album and it's really gone.",
    },
  ],
  example: {
    photoSrc: "/marketing/boys-photo.webp",
    sheetSrc: "/marketing/boys-sheet.webp",
    photoAlt: "Three boys in a field, one holding a catfish they caught",
    sheetAlt: "The same photo as a black-and-white coloring page",
    width: 900,
    height: 1200,
    srcSetWidths: [400, 800],
  } satisfies HeroPair,
  useCasesTitle: "Perfect for",
  useCases: ["Grandparent gifts", "Birthday parties", "Rainy afternoons", "Road trips", "Classrooms", "Family reunions"],
  bestPhotosTitle: "Photos that come out best",
  bestPhotos: ["One to three people, facing the camera", "Daylight or a bright room", "A simple background, or ask to simplify it"],
};

export type ProductCopy = {
  icon: "printer" | "book" | "message";
  name: string;
  tagline: string;
  /** Price slot. "{price}" lines are hidden when the price is unknown. */
  price: string;
  points: string[];
  cta: string;
  note?: string;
  featured?: boolean;
  badge?: string;
};

export const PRODUCTS = {
  eyebrow: "What you can make",
  title: "From one page to a whole book",
  body: "Start free. Pay only when you want something printed and shipped.",
  items: [
    {
      icon: "printer",
      name: "Coloring pages",
      tagline: "Print at home",
      price: "Free to try",
      points: ["Letter-size PDF, ready to print", "Edit any page by typing a note", "No account needed"],
      cta: "Make a free page",
    },
    {
      icon: "book",
      name: "Printed coloring book",
      tagline: "A real book of your family, shipped to your door",
      price: PRICE_LINE,
      points: [
        "Pages your kids recognize: their faces, their dog, their house",
        "Stapled booklet (up to 48 pages) or paperback (32+ pages)",
        "Exact price shown before you pay",
      ],
      cta: "Start a book",
      note: "Free to build. Sign up and get a {credit} credit toward it.",
      featured: true,
      badge: "Best for gifts",
    },
    {
      icon: "message",
      name: "Story book",
      tagline: "Turn a trip into a story they can color",
      price: "Included with your pages",
      points: ["Turn an album into a story", "Captions you can edit", "Color it, read it, keep it"],
      cta: "Try story mode",
    },
  ] satisfies ProductCopy[],
  trustStrip: [
    { icon: "shield", text: "Exact price shown before you pay" },
    { icon: "truck", text: "Printed in the US and shipped to you" },
    { icon: "image", text: "Photos stay private to your account" },
  ],
};

export type FaqEntry = {
  q: string;
  a: string;
  /** Used instead of `a` when a token in `a` can't be filled. Omit to hide the question then. */
  fallback?: string;
};

export const FAQ: { eyebrow: string; title: string; items: FaqEntry[] } = {
  eyebrow: "Questions",
  title: "Good to know",
  items: [
    {
      q: "Do I need an account?",
      a: "No. Tap Make a free page and start right away. Create a free account when you want to save projects across devices or order a printed book.",
    },
    {
      q: "What photos work best?",
      a: "Clear, well-lit photos with one to three people or a simple scene come out best. Busy backgrounds still work. You can ask for them to be simplified.",
    },
    {
      q: "Can I fix a drawing I don't love?",
      a: "Yes. Every page has a chat where you can type things like “make the lines thicker” or “remove the car in the back,” and it redraws the page.",
    },
    {
      q: "How much is a printed book?",
      a: "Printed books start at {price}, shipping included. The price depends on page count, binding and where it ships, and you see the exact price before you pay.",
      fallback:
        "It depends on page count, binding and where it ships. You'll see the exact price, printing and shipping included, before you pay.",
    },
    {
      q: "When do I need to order for Christmas?",
      a: "Order by {date} for Christmas delivery. Printing and shipping times for your address are shown at checkout before you pay.",
    },
    // Add once gift checkout (M9) ships:
    // { q: "Can I send a book as a gift?", a: "Yes. Choose “This is a gift” at checkout to ship it to someone else and add a note." },
    {
      q: "How long does a printed book take?",
      a: "Books are printed to order. Printing and shipping times are shown at checkout before you pay.",
    },
    {
      q: "Is it safe to upload photos of my kids?",
      a: "When you're signed in, your photos and coloring pages are stored privately in your account and never shared. Delete an album or your account and they're gone. Trying it without an account? Nothing is uploaded. Everything stays in your browser.",
    },
  ],
};

export const FINAL_CTA = {
  title: "Make your first page right now",
  body: "Pick a photo from your camera roll. You'll have a coloring page before the kettle boils.",
  creditBadge: "Sign up free and get a {credit} credit toward your first book",
  cta: "Make a free page",
  signIn: "Already have an account? Sign in",
};

export const FOOTER = {
  copyright: "Colorful Memories · LBC Innovation",
  links: [
    { href: "/gift", label: "Gift a book" },
    { href: "/story", label: "Story mode" },
    { href: "/terms", label: "Terms & privacy" },
  ],
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
