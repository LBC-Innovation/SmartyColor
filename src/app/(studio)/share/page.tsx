import type { Metadata } from "next";
import { V2ShareWithFriendStudio } from "@/components/v2/share/V2ShareWithFriendStudio";

export const metadata: Metadata = {
  title: "Share with a friend · Colorful Memories",
  robots: { index: false, follow: false },
};

export default function SharePage() {
  return <V2ShareWithFriendStudio />;
}
