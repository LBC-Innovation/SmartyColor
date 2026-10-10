import { redirect } from "next/navigation";

export default async function SheetPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/legacy/create/${id}`);
}
