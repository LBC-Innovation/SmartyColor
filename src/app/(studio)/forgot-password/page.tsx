import type { Metadata } from "next";
import { V2ForgotPasswordStudio } from "@/components/v2/auth/V2ForgotPasswordStudio";

export const metadata: Metadata = {
  title: "Forgot password | Colorful Memories",
  alternates: { canonical: "/forgot-password" },
  robots: { index: false },
};

export default function Page() {
  return <V2ForgotPasswordStudio />;
}
