export const PERMISSION_META = [
  { key: "usermanage:listusers", name: "View users", description: "Can access the user management page" },
  { key: "usermanage:add", name: "Create users", description: "Can create new accounts" },
  { key: "usermanage:suspend", name: "Suspend users", description: "Can suspend and unsuspend accounts" },
  { key: "usermanage:updatepassword", name: "Reset passwords", description: "Can reset passwords for other users" },
  { key: "usermanage:deleteusers", name: "Delete users", description: "Can permanently delete accounts" },
  { key: "usermanage:editpermissions", name: "Edit permissions", description: "Can grant or revoke permissions for other users" },
  { key: "usermanage:adjustcredits", name: "Adjust promo credits", description: "Can add or remove promo wallet balance (USD) on user accounts" },
  { key: "usermanage:manageorders", name: "Manage user orders", description: "Can view, cancel, and hide book orders on user accounts" },
  { key: "usermanage:selfmanage", name: "Full self-management", description: "Can manage all aspects of their own account" },
] as const;
