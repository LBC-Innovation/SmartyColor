import type { Metadata } from "next";
import { V2FriendLanding } from "@/components/v2/share/V2FriendLanding";
import { getFriendInvite } from "@/server/referralService";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "A gift from a friend | Colorful Memories",
  robots: { index: false, follow: false },
};

type Props = { params: Promise<{ code: string }> };

/** Where a Share with a friend link and QR code land. An unknown code still gets the pitch. */
export default async function FriendPage({ params }: Props) {
  const code = decodeURIComponent((await params).code).trim().toUpperCase();
  const invite = await getFriendInvite(code);
  return <V2FriendLanding code={code} invite={invite.data} />;
}
