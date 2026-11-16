import type { Permission } from "@/lib/auth/permissionMeta";

/** Purchase codes hand out paid-for books, so they sit with the other credit grants. */
export const PURCHASE_CODES_PERMISSION: Permission = "usermanage:adjustcredits";
