import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Comic_Neue, Fredoka, Luckiest_Guy } from "next/font/google";
import { Analytics } from "@/components/marketing/Analytics";
import {
  PwaShellScript,
  PwaSplashDismissScript,
} from "@/components/PwaShellScript";
import "./globals.css";

const fredoka = Fredoka({
  subsets: ["latin"],
  variable: "--font-fredoka",
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
const THEME_COLOR = "#7446f0";

/** Canonical site. Share images and canonical URLs resolve here, whichever host served the page. */
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://colorfulmemories.net";

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
  icons: {
    icon: [
      { url: "/pwa/icon.svg", type: "image/svg+xml" },
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
      className={`${fredoka.variable} ${comic.variable} ${luckiest.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <PwaShellScript />
      </head>
      <body
        className="min-h-full bg-cream font-body text-ink"
        suppressHydrationWarning
      >
        <div id="pwa-splash" aria-hidden="true" suppressHydrationWarning>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className="pwa-splash-icon"
            src="/brand/mark.svg"
            alt=""
            width={463}
            height={400}
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
