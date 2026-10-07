import type { LucideIcon } from "lucide-react";
import {
  BookOpen,
  ClipboardList,
  Heart,
  Home,
  ImagePlus,
  Images,
  LayoutGrid,
  Lightbulb,
  MoreHorizontal,
} from "lucide-react";

export type V2NavItem = {
  id: string;
  label: string;
  icon: LucideIcon;
  active?: boolean;
};

export const v2TopNav: V2NavItem[] = [
  { id: "home", label: "Home", icon: Home, active: true },
  { id: "projects", label: "My Projects", icon: ClipboardList },
  { id: "books", label: "Print Books", icon: BookOpen },
  { id: "inspiration", label: "Inspiration", icon: Lightbulb },
];

export const v2SideNav: V2NavItem[] = [
  { id: "create", label: "Create", icon: ImagePlus, active: true },
  { id: "photos", label: "My Photos", icon: Images },
  { id: "print-books", label: "Print Books", icon: BookOpen },
  { id: "templates", label: "Templates", icon: LayoutGrid },
  { id: "favorites", label: "Favorites", icon: Heart },
];

export const v2BottomNav: V2NavItem[] = [
  { id: "home", label: "Home", icon: Home, active: true },
  { id: "projects", label: "My Projects", icon: ClipboardList },
  { id: "books", label: "Print Books", icon: BookOpen },
  { id: "inspiration", label: "Inspiration", icon: Lightbulb },
  { id: "more", label: "More", icon: MoreHorizontal },
];
