import { Suspense } from "react";
import { V2SignInStudio } from "@/components/v2/auth/V2SignInStudio";

export default function SignInPage() {
  return (
    <Suspense fallback={null}>
      <V2SignInStudio />
    </Suspense>
  );
}
