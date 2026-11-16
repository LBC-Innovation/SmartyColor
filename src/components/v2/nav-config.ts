import type { LucideIcon } from "lucide-react";
import type { ProductFeature } from "@/lib/auth/features";
import type { Permission } from "@/lib/auth/permissionMeta";
import {
  BookOpen,
  ClipboardList,
  Globe,
  HardDrive,
  Home,
  LayoutDashboard,
  LineChart,
  Palette,
  Package,
  Sparkles,
  Tags,
  Ticket,
  Users,
} from "lucide-react";

export type V2NavItem = {
  id: string;
  label: string;
  icon: LucideIcon;
  /** When set, the item navigates to this route. */
  href?: string;
  /** When set, only admins and users with this permission see the item. */
  permission?: Permission;
  /** When set, only accounts with this product line turned on see the item. */
  feature?: ProductFeature;
  /** Only shown to signed-in accounts. */
  signedIn?: boolean;
};

export const STUDIO_HOME = "/studio";
/** Signed-in home: a book to finish, the albums, and the seasonal prompt. */
export const SIGNED_IN_HOME = "/home";

export const v2TopNav: V2NavItem[] = [
  { id: "home", label: "Home", icon: Home, href: SIGNED_IN_HOME, feature: "projects", signedIn: true },
  { id: "projects", label: "My albums", icon: ClipboardList, href: STUDIO_HOME, feature: "projects" },
  { id: "storybook", label: "Story book", icon: BookOpen, href: "/storybook", feature: "storybook" },
  { id: "orders", label: "My orders", icon: Package, href: "/orders" },
];

/** Real routes only — keeps the mobile tab bar on a single row. */
export const v2BottomNav: V2NavItem[] = [
  { id: "home", label: "Home", icon: Home, href: SIGNED_IN_HOME, feature: "projects", signedIn: true },
  { id: "create", label: "Create", icon: Palette, href: STUDIO_HOME, feature: "projects" },
  { id: "storybook", label: "Story book", icon: BookOpen, href: "/storybook", feature: "storybook" },
  { id: "orders", label: "Orders", icon: Package, href: "/orders" },
];

export type V2AdminNavItem = V2NavItem & {
  group: "overview" | "operate" | "money";
  /** Any one of these opens the page (`permission` is the first). */
  anyPermission?: Permission[];
};

/** The admin sidebar, in order. Overview opens for any admin permission; each card checks its own. */
export const v2AdminNav: V2AdminNavItem[] = [
  { id: "overview", label: "Overview", icon: LayoutDashboard, href: "/admin", group: "overview" },
  {
    id: "orders",
    label: "Orders",
    icon: Package,
    href: "/admin/orders",
    permission: "usermanage:manageorders",
    group: "operate",
  },
  { id: "users", label: "Customers", icon: Users, href: "/admin/users", permission: "usermanage:listusers", group: "operate" },
  {
    id: "purchase-codes",
    label: "Purchase codes",
    icon: Ticket,
    href: "/admin/purchase-codes",
    permission: "usermanage:adjustcredits",
    group: "operate",
  },
  {
    id: "finance",
    label: "Financials",
    icon: LineChart,
    href: "/admin/finance",
    permission: "finance:view",
    group: "money",
  },
  {
    id: "vision-costs",
    label: "AI usage",
    icon: Sparkles,
    href: "/admin/vision-costs",
    permission: "costs:viewai",
    group: "money",
  },
  {
    id: "guests",
    label: "Guests",
    icon: Globe,
    href: "/admin/guests",
    permission: "costs:viewai",
    group: "money",
  },
  {
    id: "files",
    label: "Files & storage",
    icon: HardDrive,
    href: "/admin/files",
    permission: "costs:viewai",
    anyPermission: ["costs:viewai", "finance:view"],
    group: "money",
  },
  {
    id: "pricing",
    label: "Pricing & promos",
    icon: Tags,
    href: "/admin/pricing",
    permission: "pricing:manage",
    anyPermission: ["pricing:manage", "usermanage:adjustcredits"],
    group: "money",
  },
];

/** Permissions that make someone an admin: any one of them opens /admin. */
export const ADMIN_PERMISSIONS: Permission[] = [
  ...new Set(v2AdminNav.flatMap((item) => item.anyPermission ?? (item.permission ? [item.permission] : []))),
];

export function canOpenAdminItem(permissions: readonly string[], item: V2AdminNavItem): boolean {
  if (item.id === "overview") return ADMIN_PERMISSIONS.some((p) => permissions.includes(p));
  const needed = item.anyPermission ?? (item.permission ? [item.permission] : []);
  return needed.length === 0 || needed.some((p) => permissions.includes(p));
}

export function isV2NavItemActive(pathname: string, item: V2NavItem): boolean {
  if (!item.href) return false;
  if (item.href === "/admin") return pathname === "/admin";
  if (item.href === STUDIO_HOME) {
    return pathname === STUDIO_HOME || pathname.startsWith(`${STUDIO_HOME}/`);
  }
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}
