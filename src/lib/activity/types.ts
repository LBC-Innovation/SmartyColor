/** Everything a signed-in user did, or that happened to their wallet. */

export const ACTIVITY_CATEGORIES = ["photos", "sheets", "albums", "orders", "wallet"] as const;
export type ActivityCategory = (typeof ACTIVITY_CATEGORIES)[number];

export const ACTIVITY_CATEGORY_LABELS: Record<ActivityCategory, string> = {
  photos: "Photos",
  sheets: "Coloring sheets",
  albums: "Albums",
  orders: "Orders",
  wallet: "Wallet",
};

/** Types within each category; ids match account_activity.type. */
export const ACTIVITY_TYPES = {
  photos: [
    { id: "photo_uploaded", label: "Photo uploaded" },
    { id: "photo_deleted", label: "Photo deleted" },
    { id: "photo_portrait", label: "Portrait version" },
  ],
  sheets: [
    { id: "sheet_generated", label: "Sheet generated" },
    { id: "sheet_edited", label: "Sheet edited" },
  ],
  albums: [
    { id: "album_created", label: "Album created" },
    { id: "album_deleted", label: "Album deleted" },
  ],
  orders: [
    { id: "book_ordered", label: "Book ordered" },
    { id: "digital_book_ordered", label: "Digital book" },
    { id: "order_canceled", label: "Order canceled" },
  ],
  wallet: [
    { id: "funds_added", label: "Funds added" },
    { id: "credit_granted", label: "Promo credit" },
    { id: "credit_removed", label: "Credit adjustment" },
    { id: "refund", label: "Refund" },
  ],
} as const satisfies Record<ActivityCategory, readonly { id: string; label: string }[]>;

export type ActivityType = (typeof ACTIVITY_TYPES)[ActivityCategory][number]["id"];

export function isActivityCategory(value: unknown): value is ActivityCategory {
  return (ACTIVITY_CATEGORIES as readonly string[]).includes(value as string);
}

export function activityCategoryOfType(type: string): ActivityCategory | null {
  for (const category of ACTIVITY_CATEGORIES) {
    if (ACTIVITY_TYPES[category].some((t) => t.id === type)) return category;
  }
  return null;
}

export function activityTypeLabel(type: string): string {
  for (const category of ACTIVITY_CATEGORIES) {
    const found = ACTIVITY_TYPES[category].find((t) => t.id === type);
    if (found) return found.label;
  }
  const humanized = type.replace(/[_-]+/g, " ").trim();
  return humanized ? humanized[0].toUpperCase() + humanized.slice(1) : "Activity";
}

export type ActivityEntry = {
  id: string;
  category: ActivityCategory;
  type: string;
  description: string;
  /** Wallet change in USD cents; null when the wallet was not touched. */
  amountCents: number | null;
  balanceAfterCents: number | null;
  occurredAt: string;
  /** Card top-ups have a Stripe receipt. */
  hasReceipt: boolean;
  /** Set when the entry is about a book order. */
  orderId: string | null;
};

export type ActivityFilter = {
  category?: ActivityCategory;
  type?: string;
  /** Only entries that changed the wallet balance. */
  moneyOnly?: boolean;
};

export type ActivityPage = {
  items: ActivityEntry[];
  hasMore: boolean;
};

export const ACTIVITY_PAGE_SIZE = 50;
