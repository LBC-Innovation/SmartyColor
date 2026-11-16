import type { Metadata } from "next";
import { V2RedeemEntry } from "@/components/v2/redeem/V2RedeemCode";

export const metadata: Metadata = {
  title: "Redeem a book code | Colorful Memories",
  robots: { index: false, follow: false },
};

/** Type in a purchase code by hand (printed cards also carry a QR code to /redeem/<code>). */
export default function RedeemPage() {
  return <V2RedeemEntry />;
}
