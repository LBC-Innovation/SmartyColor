import type { ReactNode } from "react";
import { DM_Sans } from "next/font/google";

const dmSans = DM_Sans({ subsets: ["latin"], variable: "--font-dm-sans" });

/** Shared pages sit outside the studio shell: no app chrome, the page scrolls normally. */
export default function SharedPageLayout({ children }: { children: ReactNode }) {
  return (
    <div
      className={`${dmSans.variable} min-h-dvh bg-v2-bg text-v2-ink`}
      style={{ fontFamily: "var(--font-dm-sans), ui-sans-serif, system-ui, sans-serif" }}
    >
      {children}
    </div>
  );
}
