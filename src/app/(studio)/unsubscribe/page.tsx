import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Unsubscribe | Colorful Memories",
  robots: { index: false, follow: false },
};

type Props = { searchParams: Promise<{ u?: string; t?: string; done?: string; error?: string }> };

/**
 * Landing page for the unsubscribe link in reminder emails. Opting out takes a button press (a
 * POST), so link scanners that open every URL in an email don't unsubscribe anyone.
 */
export default async function UnsubscribePage({ searchParams }: Props) {
  const { u = "", t = "", done, error } = await searchParams;

  return (
    <main className="flex min-h-[60vh] items-center justify-center px-4 py-10">
      <div className="v2-panel w-full max-w-md p-6 text-center">
        {done ? (
          <>
            <h1 className="text-xl font-semibold text-v2-ink">You&apos;re unsubscribed</h1>
            <p className="mt-2 text-sm text-v2-muted">
              No more reminders or review requests. You&apos;ll still get emails about your orders and your account.
            </p>
          </>
        ) : error || !u || !t ? (
          <>
            <h1 className="text-xl font-semibold text-v2-ink">This link didn&apos;t work</h1>
            <p className="mt-2 text-sm text-v2-muted">Use the unsubscribe link in the most recent email, or reply to it and we&apos;ll take care of it.</p>
          </>
        ) : (
          <form method="post" action="/api/unsubscribe">
            <input type="hidden" name="u" value={u} />
            <input type="hidden" name="t" value={t} />
            <h1 className="text-xl font-semibold text-v2-ink">Stop reminder emails?</h1>
            <p className="mt-2 text-sm text-v2-muted">
              We&apos;ll stop sending book reminders and review requests. Order and account emails still arrive.
            </p>
            <button type="submit" className="v2-btn-primary mt-5 min-h-11 px-6">
              Unsubscribe
            </button>
          </form>
        )}
        <Link href="/" className="mt-5 inline-block text-sm font-semibold text-v2-link hover:underline">
          Back to Colorful Memories
        </Link>
      </div>
    </main>
  );
}
