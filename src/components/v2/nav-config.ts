import type { LucideIcon } from "lucide-react";
import {
  BookOpen,
  CircleDollarSign,
  ClipboardList,
  Home,
  Lightbulb,
} from "lucide-react";

export type V2NavItem = {
  id: string;
  label: string;
  icon: LucideIcon;
  /** When set, the item navigates to this route. */
  href?: string;
};

export const v2TopNav: V2NavItem[] = [
  { id: "projects", label: "My Projects", icon: ClipboardList, href: "/v2" },
  { id: "storybook", label: "Story book", icon: BookOpen, href: "/v2/storybook" },
  { id: "books", label: "Print Books", icon: BookOpen },
  { id: "inspiration", label: "Inspiration", icon: Lightbulb },
  {
    id: "vision-costs",
    label: "Vision costs",
    icon: CircleDollarSign,
    href: "/v2/vision-costs",
  },
];

export const v2BottomNav: V2NavItem[] = [
  { id: "home", label: "Create", icon: Home, href: "/v2" },
  { id: "projects", label: "My Projects", icon: ClipboardList },
  {
    id: "vision-costs",
    label: "Vision costs",
    icon: CircleDollarSign,
    href: "/v2/vision-costs",
  },
  { id: "storybook", label: "Story book", icon: BookOpen, href: "/v2/storybook" },
  { id: "books", label: "Print Books", icon: BookOpen },
  { id: "inspiration", label: "Inspiration", icon: Lightbulb },
];

export function isV2NavItemActive(pathname: string, item: V2NavItem): boolean {
  if (!item.href) return false;
  if (item.href === "/v2") {
    return pathname === "/v2" || pathname === "/v2/";
  }
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}
