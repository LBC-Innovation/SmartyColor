import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Comic_Neue, Fredoka, Luckiest_Guy } from "next/font/google";
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

export const metadata: Metadata = {
  title: "SmartyColor",
  description:
    "Kids describe something they want to color. We turn it into a printable coloring sheet.",
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
    >
      <body className="min-h-full bg-cream font-body text-ink">{children}</body>
    </html>
  );
}
