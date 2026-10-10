import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Calistoga, DM_Sans } from "next/font/google";
import { V2RootProviders } from "@/components/v2/V2RootProviders";
import "./v2-theme.css";

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
});

const calistoga = Calistoga({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-calistoga",
});

export const metadata: Metadata = {
  title: "ColorfulMoments",
  description:
    "Turn your family photos into coloring memories with a clean, modern studio.",
};

export default function V2Layout({ children }: { children: ReactNode }) {
  return (
    <div
      className={`v2-shell flex h-dvh flex-col overflow-hidden bg-v2-bg text-v2-ink ${dmSans.variable} ${calistoga.variable}`}
    >
      <V2RootProviders>
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {children}
        </div>
      </V2RootProviders>
    </div>
  );
}
