import type { Metadata } from "next";
import { V2LandingPage } from "@/components/v2/marketing/V2LandingPage";

export const metadata: Metadata = {
  title: "Turn family photos into coloring books | Colorful Memories",
  description:
    "Turn the photos already on your phone into coloring pages your kids will actually recognize. Print at home free, or order a real printed book.",
};

export default function HomePage() {
  return <V2LandingPage />;
}
