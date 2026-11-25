import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Comic_Neue, DM_Sans, Fredoka, Luckiest_Guy } from "next/font/google";
import { Analytics } from "@/components/marketing/Analytics";
import {
  PwaShellScript,
  PwaSplashDismissScript,
} from "@/components/PwaShellScript";
import { SITE_URL } from "@/lib/siteUrl";
import "./globals.css";

const fredoka = Fredoka({
  subsets: ["latin"],
  variable: "--font-fredoka",
});

// The studio's body face. Declared here, not in the studio layout, so dialogs and menus portaled
// into <body> (outside .v2-shell) can still read the variable.
const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
});

const comic = Comic_Neue({
  weight: ["400", "700"],
  subsets: ["latin"],
  variable: "--font-comic",
});

const luckiest = Luckiest_Guy({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-luckiest",
  // Legacy routes only: still loads on demand there, just not preloaded on every page.
  preload: false,
});

const APP_NAME = "Colorful Memories";
const APP_DESCRIPTION =
  "Turn family photos into coloring pages and printed coloring books.";
// Matches the white header so the browser chrome blends into the page.
const THEME_COLOR = "#ffffff";

/** Search-engine ownership checks, set in the deployment's environment (the code from each console). */
const GOOGLE_SITE_VERIFICATION = process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION?.trim();
const BING_SITE_VERIFICATION = process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION?.trim();
const PINTEREST_SITE_VERIFICATION = process.env.NEXT_PUBLIC_PINTEREST_SITE_VERIFICATION?.trim();
const META_DOMAIN_VERIFICATION = process.env.NEXT_PUBLIC_META_DOMAIN_VERIFICATION?.trim();

/** Social profiles, comma-separated full URLs, for the Organization structured data. */
const SOCIAL_PROFILES = (process.env.NEXT_PUBLIC_SOCIAL_PROFILES ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter((s) => /^https:\/\/[^\s"<>]+$/.test(s));

/** Tells search engines who runs the site and what it's called (Organization + WebSite). */
const STRUCTURED_DATA = JSON.stringify({
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${SITE_URL}/#organization`,
      name: APP_NAME,
      url: SITE_URL,
      logo: `${SITE_URL}/pwa/icon-512.png`,
      ...(SOCIAL_PROFILES.length ? { sameAs: SOCIAL_PROFILES } : {}),
    },
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      name: APP_NAME,
      url: SITE_URL,
      description: APP_DESCRIPTION,
      publisher: { "@id": `${SITE_URL}/#organization` },
    },
  ],
}).replace(/</g, "\\u003c");

const otherVerification: Record<string, string> = {};
if (BING_SITE_VERIFICATION) otherVerification["msvalidate.01"] = BING_SITE_VERIFICATION;
if (PINTEREST_SITE_VERIFICATION) otherVerification["p:domain_verify"] = PINTEREST_SITE_VERIFICATION;
if (META_DOMAIN_VERIFICATION) otherVerification["facebook-domain-verification"] = META_DOMAIN_VERIFICATION;

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  applicationName: APP_NAME,
  title: APP_NAME,
  description: APP_DESCRIPTION,
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: APP_NAME,
  },
  formatDetection: {
    telephone: false,
  },
  openGraph: {
    type: "website",
    siteName: APP_NAME,
  },
  twitter: {
    card: "summary_large_image",
  },
  verification: {
    ...(GOOGLE_SITE_VERIFICATION ? { google: GOOGLE_SITE_VERIFICATION } : {}),
    ...(Object.keys(otherVerification).length ? { other: otherVerification } : {}),
  },
  icons: {
    icon: [
      { url: "/pwa/icon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/pwa/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: "/pwa/apple-touch-icon.png", sizes: "180x180" }],
  },
};

export const viewport: Viewport = {
  themeColor: THEME_COLOR,
  viewportFit: "cover",
  // Android: shrink the layout when the keyboard opens so bottom sheets and composers stay visible.
  interactiveWidget: "resizes-content",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${fredoka.variable} ${dmSans.variable} ${comic.variable} ${luckiest.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <PwaShellScript />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: STRUCTURED_DATA }} />
      </head>
      <body
        className="min-h-full bg-white font-body text-ink"
        suppressHydrationWarning
      >
        <div id="pwa-splash" aria-hidden="true" suppressHydrationWarning>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className="pwa-splash-icon"
            src="/brand/mark.webp"
            alt=""
            width={768}
            height={722}
            // Only fetched when the splash is actually shown (installed app).
            loading="lazy"
            decoding="sync"
          />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className="pwa-splash-title"
            src="/brand/wordmark.svg"
            alt=""
            width={1468}
            height={177}
            loading="lazy"
            decoding="sync"
          />
        </div>
        {children}
        <PwaSplashDismissScript />
        <Analytics />
      </body>
    </html>
  );
}
