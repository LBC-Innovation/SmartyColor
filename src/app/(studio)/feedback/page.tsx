import type { Metadata } from "next";
import { V2MarketingHeader } from "@/components/v2/marketing/V2MarketingHeader";
import { V2FeedbackForm } from "@/components/v2/email/V2FeedbackForm";
import { verifyToken } from "@/server/email/signedLinks";
import { getFeedbackOrder, NAME_MAX, QUOTE_MAX, RELATION_MAX } from "@/server/testimonials/testimonialsService";

export const metadata: Metadata = {
  title: "How did it go? · Colorful Memories",
  robots: { index: false },
};

export default async function FeedbackPage({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const { t } = await searchParams;
  const orderId = verifyToken("feedback", t);
  const order = orderId ? await getFeedbackOrder(orderId) : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-v2-bg text-v2-ink">
      <V2MarketingHeader />
      <main className="v2-gutter-x mx-auto w-full max-w-xl py-10 sm:py-14">
        {!order?.data || !t ? (
          <>
            <h1 className="v2-brand-title text-3xl tracking-tight">This link is not valid</h1>
            <p className="mt-3 text-[15px] leading-relaxed text-v2-navy">Please use the link from our email.</p>
          </>
        ) : order.data.alreadySent ? (
          <>
            <h1 className="v2-brand-title text-3xl tracking-tight">Thank you!</h1>
            <p className="mt-3 text-[15px] leading-relaxed text-v2-navy">We already have your story for this book.</p>
          </>
        ) : (
          <V2FeedbackForm
            token={t}
            bookTitle={order.data.title}
            limits={{ quote: QUOTE_MAX, name: NAME_MAX, relation: RELATION_MAX }}
          />
        )}
      </main>
    </div>
  );
}
