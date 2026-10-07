import { redirect } from "next/navigation";

export default async function MakePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/create/${id}`);
}
