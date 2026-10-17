/**
 * Every permission an account can hold. There is no master role: each
 * capability is granted on its own, and every check names one of these.
 */
export const PERMISSION_META = [
  { key: "usermanage:listusers", name: "View users", description: "Can open the user management page and see accounts" },
  { key: "usermanage:add", name: "Create users", description: "Can create new accounts" },
  { key: "usermanage:editprofile", name: "Edit profiles", description: "Can change another account's display name and avatar" },
  { key: "usermanage:changeemail", name: "Change emails", description: "Can change the email address on another account" },
  { key: "usermanage:verifyemail", name: "Verify emails", description: "Can mark an email verified or unverified, and resend the verification email" },
  { key: "usermanage:magiclink", name: "Send sign-in links", description: "Can email a passwordless sign-in link to another account" },
  { key: "usermanage:suspend", name: "Suspend users", description: "Can suspend and unsuspend accounts" },
  { key: "usermanage:updatepassword", name: "Reset passwords", description: "Can reset passwords for other users" },
  { key: "usermanage:deleteusers", name: "Delete users", description: "Can permanently delete accounts" },
  { key: "usermanage:editpermissions", name: "Edit permissions", description: "Can grant or revoke permissions and product access, including their own" },
  { key: "usermanage:adjustcredits", name: "Adjust promo credits", description: "Can add or remove wallet balance on accounts and set the welcome credit" },
  { key: "usermanage:manageorders", name: "Manage user orders", description: "Can view, cancel, and hide book orders on user accounts" },
  { key: "pricing:manage", name: "Manage prices", description: "Can see costs and set the markup and list price of everything customers pay for" },
  { key: "finance:view", name: "View financials", description: "Can open the financials dashboard: cash flow, profit and loss, and margins by product" },
  { key: "finance:manage", name: "Manage financials", description: "Can enter fixed and operating costs, card fees and the opening cash balance on the financials dashboard" },
  { key: "costs:viewai", name: "View AI costs", description: "Can see what AI calls cost us on the AI costs page" },
  { key: "usermanage:selfmanage", name: "Full self-management", description: "Can manage their own profile, email, password and account (not their own permissions)" },
] as const;

export type Permission = (typeof PERMISSION_META)[number]["key"];

export const ALL_PERMISSIONS: readonly Permission[] = PERMISSION_META.map((p) => p.key);
