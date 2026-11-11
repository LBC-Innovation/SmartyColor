import type { Metadata } from "next";
import { V2MarketingHeader } from "@/components/v2/marketing/V2MarketingHeader";
import { V2Unsubscribe } from "@/components/v2/email/V2Unsubscribe";
import { verifyToken } from "@/server/email/signedLinks";

export const metadata: Metadata = {
  title: "Email settings · Colorful Memories",
  robots: { index: false },
};

export default async function UnsubscribePage({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const { t } = await searchParams;
  const valid = Boolean(verifyToken("unsubscribe", t));
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-v2-bg text-v2-ink">
      <V2MarketingHeader />
      <main className="v2-gutter-x mx-auto w-full max-w-xl py-10 sm:py-14">
        {valid && t ? (
          <V2Unsubscribe token={t} />
        ) : (
          <>
            <h1 className="v2-brand-title text-3xl tracking-tight">This link is not valid</h1>
            <p className="mt-3 text-[15px] leading-relaxed text-v2-navy">
              Please use the Unsubscribe link from one of our emails.
            </p>
          </>
        )}
      </main>
    </div>
  );
}
