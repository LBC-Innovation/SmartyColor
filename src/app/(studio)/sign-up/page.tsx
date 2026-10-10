import { Suspense } from "react";
import { V2SignUpStudio } from "@/components/v2/auth/V2SignUpStudio";

export default function SignUpPage() {
  return (
    <Suspense fallback={null}>
      <V2SignUpStudio />
    </Suspense>
  );
}
