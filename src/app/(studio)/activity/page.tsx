import type { Metadata } from "next";
import { V2ActivityStudio } from "@/components/v2/activity/V2ActivityStudio";

export const metadata: Metadata = { title: "Transaction history · Colorful Memories" };

export default function ActivityPage() {
  return <V2ActivityStudio />;
}
