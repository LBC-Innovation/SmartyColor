import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Comic_Neue, Fredoka, Luckiest_Guy } from "next/font/google";
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
});

const APP_NAME = "ColorfulMoments";
const APP_DESCRIPTION =
  "Turn family photos into coloring pages and printed coloring books.";
const THEME_COLOR = "#564fd0";

export const metadata: Metadata = {
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
            src="/pwa/icon-192.png"
            alt=""
            width={96}
            height={96}
            decoding="sync"
          />
          <span className="pwa-splash-title">
            <span className="pwa-splash-title-accent">Colorful</span>Moments
          </span>
        </div>
        {children}
        <PwaSplashDismissScript />
      </body>
    </html>
  );
}
