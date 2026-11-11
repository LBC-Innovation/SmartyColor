import type { Metadata } from "next";
import { V2ResetPasswordStudio } from "@/components/v2/auth/V2ResetPasswordStudio";

export const metadata: Metadata = {
  title: "Choose a new password | Colorful Memories",
  alternates: { canonical: "/reset-password" },
  robots: { index: false },
};

export default function Page() {
  return <V2ResetPasswordStudio />;
}
