import { redirect } from "next/navigation";

export default async function MakePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/legacy/create/${id}`);
}
