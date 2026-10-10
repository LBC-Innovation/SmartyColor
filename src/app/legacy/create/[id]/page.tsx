import { RefineStudio } from "@/components/RefineStudio";

export default async function RefinePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <RefineStudio sessionId={id} />;
}
