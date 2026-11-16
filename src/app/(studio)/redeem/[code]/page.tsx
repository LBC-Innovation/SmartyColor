import type { Metadata } from "next";
import { V2RedeemCode } from "@/components/v2/redeem/V2RedeemCode";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Start your coloring book | Colorful Memories",
  robots: { index: false, follow: false },
};

type Props = { params: Promise<{ code: string }> };

/** Where a purchase code's link and QR code land. */
export default async function RedeemCodePage({ params }: Props) {
  const { code } = await params;
  return <V2RedeemCode code={decodeURIComponent(code)} />;
}
