import type { BookOrderStatus, BookPaymentMethod } from "@/lib/orders/types";

export type AdminUserOrderSummary = {
  id: string;
  projectTitle: string | null;
  productName: string;
  pageCount: number;
  status: BookOrderStatus;
  totalCents: number | null;
  createdAt: string;
  canceledAt: string | null;
  deletedAt: string | null;
  luluPrintJobId: number | null;
};
