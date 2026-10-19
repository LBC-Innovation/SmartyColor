import { LandingRoute, landingMetadata } from "@/components/v2/marketing/landingRoute";

// Prices are cached for a day; the page re-renders hourly so the holiday banner ends on time.
export const revalidate = 3600;

export const metadata = landingMetadata("default");

export default function HomePage() {
  return <LandingRoute intent="default" />;
}
