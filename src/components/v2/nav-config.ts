import type { LucideIcon } from "lucide-react";
import type { ProductFeature } from "@/lib/auth/features";
import type { Permission } from "@/lib/auth/permissionMeta";
import {
  BookOpen,
  CircleDollarSign,
  ClipboardList,
  Gift,
  Home,
  LineChart,
  MessageSquareQuote,
  Palette,
  Package,
  Tags,
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
  { id: "projects", label: "My projects", icon: ClipboardList, href: STUDIO_HOME, feature: "projects" },
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

/** Secondary menu shown on admin pages. */
export const v2AdminNav: V2NavItem[] = [
  { id: "users", label: "Users", icon: Users, href: "/admin/users", permission: "usermanage:listusers" },
  {
    id: "finance",
    label: "Financials",
    icon: LineChart,
    href: "/admin/finance",
    permission: "finance:view",
  },
  {
    id: "vision-costs",
    label: "Vision costs",
    icon: CircleDollarSign,
    href: "/admin/vision-costs",
    permission: "costs:viewai",
  },
  {
    id: "pricing",
    label: "Prices",
    icon: Tags,
    href: "/admin/pricing",
    permission: "pricing:manage",
  },
  {
    id: "promo-credits",
    label: "Promo credits",
    icon: Gift,
    href: "/admin/promo-credits",
    permission: "usermanage:adjustcredits",
  },
  {
    id: "testimonials",
    label: "Customer stories",
    icon: MessageSquareQuote,
    href: "/admin/testimonials",
    permission: "marketing:testimonials",
  },
];

export function isV2NavItemActive(pathname: string, item: V2NavItem): boolean {
  if (!item.href) return false;
  if (item.href === STUDIO_HOME) {
    return pathname === STUDIO_HOME || pathname.startsWith(`${STUDIO_HOME}/`);
  }
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}
