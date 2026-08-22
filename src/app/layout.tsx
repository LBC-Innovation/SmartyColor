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

const APP_NAME = "SmartyColor";
const APP_DESCRIPTION =
  "Kids describe something they want to color. We turn it into a printable coloring sheet.";
const THEME_COLOR = "#fff8ef";

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
            src="/smarty.png"
            alt=""
            width={168}
            height={168}
            decoding="sync"
          />
          <span className="pwa-splash-title">SmartyColor</span>
        </div>
        {children}
        <PwaSplashDismissScript />
      </body>
    </html>
  );
}
