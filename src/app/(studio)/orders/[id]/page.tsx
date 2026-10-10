import { V2OrderDetailStudio } from "@/components/v2/orders/V2OrderDetailStudio";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export default async function OrderDetailPage({ params }: Props) {
  const { id } = await params;
  return <V2OrderDetailStudio orderId={id} />;
}
