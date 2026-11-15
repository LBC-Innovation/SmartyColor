import type { Metadata } from "next";
import { V2JoinAlbum } from "@/components/v2/auth/V2JoinAlbum";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Join an album | Colorful Memories",
  robots: { index: false, follow: false },
};

type Props = { params: Promise<{ id: string }> };

/** Where an album invite link sent by text message (or any other app) lands. */
export default async function JoinAlbumPage({ params }: Props) {
  const { id } = await params;
  return <V2JoinAlbum inviteId={id} />;
}
