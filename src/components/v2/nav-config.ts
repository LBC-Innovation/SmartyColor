import type { LucideIcon } from "lucide-react";
import type { ProductFeature } from "@/lib/auth/features";
import {
  BookOpen,
  CircleDollarSign,
  ClipboardList,
  Gift,
  Home,
  Package,
  Users,
} from "lucide-react";

export type V2NavItem = {
  id: string;
  label: string;
  icon: LucideIcon;
  /** When set, the item navigates to this route. */
  href?: string;
  /** When set, only admins and users with this permission see the item. */
  permission?: string;
  /** When set, only accounts with this product line turned on see the item. */
  feature?: ProductFeature;
};

export const STUDIO_HOME = "/studio";

export const v2TopNav: V2NavItem[] = [
  { id: "projects", label: "My projects", icon: ClipboardList, href: STUDIO_HOME, feature: "projects" },
  { id: "storybook", label: "Story book", icon: BookOpen, href: "/storybook", feature: "storybook" },
  { id: "orders", label: "My orders", icon: Package, href: "/orders" },
];

/** Real routes only — keeps the mobile tab bar on a single row. */
export const v2BottomNav: V2NavItem[] = [
  { id: "home", label: "Create", icon: Home, href: STUDIO_HOME, feature: "projects" },
  { id: "storybook", label: "Story book", icon: BookOpen, href: "/storybook", feature: "storybook" },
  { id: "orders", label: "Orders", icon: Package, href: "/orders" },
];

/** Secondary menu shown on admin pages. */
export const v2AdminNav: V2NavItem[] = [
  { id: "users", label: "Users", icon: Users, href: "/admin/users" },
  {
    id: "vision-costs",
    label: "Vision costs",
    icon: CircleDollarSign,
    href: "/admin/vision-costs",
  },
  {
    id: "promo-credits",
    label: "Promo credits",
    icon: Gift,
    href: "/admin/promo-credits",
    permission: "usermanage:adjustcredits",
  },
];

export function isV2NavItemActive(pathname: string, item: V2NavItem): boolean {
  if (!item.href) return false;
  if (item.href === STUDIO_HOME) {
    return pathname === STUDIO_HOME || pathname.startsWith(`${STUDIO_HOME}/`);
  }
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}
