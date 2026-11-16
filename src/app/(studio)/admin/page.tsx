"use client";

import { AdminOverviewScreen } from "@/components/v2/admin/overview/AdminOverviewScreen";

/** Admin home. The admin layout gates it; each block checks its own permission. */
export default function AdminOverviewPage() {
  return <AdminOverviewScreen />;
}
