/** Product lines an admin can turn on or off per account. Stored in auth app_metadata.features. */
export const PRODUCT_FEATURES = [
  {
    key: "projects",
    name: "My albums",
    description: "Can turn photos into coloring pages and arrange them into books",
    href: "/studio",
  },
  {
    key: "storybook",
    name: "Story book",
    description: "Can write illustrated stories from an album",
    href: "/storybook",
  },
] as const;

export type ProductFeature = (typeof PRODUCT_FEATURES)[number]["key"];
export type FeatureAccess = Record<ProductFeature, boolean>;

/** What an account gets until an admin changes it. Guests get the same. */
export const DEFAULT_FEATURE_ACCESS: FeatureAccess = { projects: true, storybook: false };

/**
 * Whether story mode is on for everyone, guests included. Marketing (the product card, footer link,
 * /story page and sitemap) follows this one flag, so turning the default on shows it everywhere.
 */
export const STORY_MODE_PUBLIC = DEFAULT_FEATURE_ACCESS.storybook;

/** Reads the toggles saved on an account, falling back to the default for any that are unset. */
export function storedFeatureAccess(raw: unknown): FeatureAccess {
  const saved = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const access = { ...DEFAULT_FEATURE_ACCESS };
  for (const { key } of PRODUCT_FEATURES) {
    if (typeof saved[key] === "boolean") access[key] = saved[key];
  }
  return access;
}

/** What the account can open: exactly the product lines turned on for it. */
export function effectiveFeatureAccess(raw: unknown): FeatureAccess {
  return storedFeatureAccess(raw);
}

export function featureLabel(feature: ProductFeature): string {
  return PRODUCT_FEATURES.find((f) => f.key === feature)?.name ?? feature;
}

/** Where the logo and "home" links should land for this account. */
export function homePathFor(access: FeatureAccess): string {
  const first = PRODUCT_FEATURES.find((f) => access[f.key]);
  return first?.href ?? PRODUCT_FEATURES[0].href;
}
