"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

export function V2AdminPermissionGate({
  permission,
  children,
}: {
  permission: string;
  children: ReactNode;
}) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) router.replace(`/sign-in?next=/admin/users`);
    else if (!user.permissions.includes(permission) && user.role !== "admin") {
      router.replace("/");
    }
  }, [user, loading, permission, router]);

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-v2-muted">
        <Loader2 className="h-8 w-8 animate-spin text-v2-primary" aria-label="Loading" />
      </div>
    );
  }
  if (!user) return null;
  if (!user.permissions.includes(permission) && user.role !== "admin") return null;
  return <>{children}</>;
}
