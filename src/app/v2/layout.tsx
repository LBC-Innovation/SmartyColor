import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Inter } from "next/font/google";
import "./v2-theme.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "ColorfulMoments",
  description:
    "Turn your family photos into coloring memories with a clean, modern studio.",
};

export default function V2Layout({ children }: { children: ReactNode }) {
  return (
    <div
      className={`v2-shell flex h-dvh flex-col overflow-hidden bg-v2-bg text-v2-ink ${inter.variable}`}
    >
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
    </div>
  );
}
