export const PERMISSION_META = [
  { key: "usermanage:listusers", name: "View users", description: "Can access the user management page" },
  { key: "usermanage:add", name: "Create users", description: "Can create new accounts" },
  { key: "usermanage:suspend", name: "Suspend users", description: "Can suspend and unsuspend accounts" },
  { key: "usermanage:updatepassword", name: "Reset passwords", description: "Can reset passwords for other users" },
  { key: "usermanage:deleteusers", name: "Delete users", description: "Can permanently delete accounts" },
  { key: "usermanage:editpermissions", name: "Edit permissions", description: "Can grant or revoke permissions for other users" },
  { key: "usermanage:selfmanage", name: "Full self-management", description: "Can manage all aspects of their own account" },
] as const;
