import type { Permission } from "@/lib/auth/permissionMeta";

/** The admin Files page shows storage costs: open to anyone who can see AI costs or the financials. */
export const FILES_PAGE_PERMISSIONS: Permission[] = ["costs:viewai", "finance:view"];
