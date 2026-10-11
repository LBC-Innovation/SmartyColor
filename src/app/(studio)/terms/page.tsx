import type { Metadata } from "next";
import Link from "next/link";
import { V2MarketingHeader } from "@/components/v2/marketing/V2MarketingHeader";

export const metadata: Metadata = {
  title: "Terms & privacy · ColorfulMemories",
  description: "How ColorfulMemories uses your information and what it stores in cookies and your browser.",
};

const UPDATED = "October 10, 2026";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="text-xl font-semibold text-v2-ink">{title}</h2>
      <div className="mt-3 space-y-3 text-[15px] leading-relaxed text-v2-navy">{children}</div>
    </section>
  );
}

function Table({ rows }: { rows: Array<[string, string, string]> }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200">
      <table className="min-w-full text-sm">
        <thead className="bg-v2-bg-subtle text-left text-xs font-semibold uppercase tracking-wider text-v2-muted">
          <tr>
            <th className="px-4 py-2">Name</th>
            <th className="px-4 py-2">Where</th>
            <th className="px-4 py-2">What it’s for</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map(([name, where, why]) => (
            <tr key={name}>
              <td className="px-4 py-2 font-mono text-xs text-v2-ink">{name}</td>
              <td className="px-4 py-2 text-v2-muted">{where}</td>
              <td className="px-4 py-2">{why}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function TermsPage() {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-v2-bg text-v2-ink">
      <V2MarketingHeader />
      <main className="v2-gutter-x mx-auto w-full max-w-3xl py-10 sm:py-14">
        <p className="text-xs font-bold uppercase tracking-wider text-v2-primary">Terms &amp; privacy</p>
        <h1 className="v2-brand-title mt-2 text-3xl text-v2-ink sm:text-4xl">How we use your information</h1>
        <p className="mt-3 text-sm text-v2-muted">Last updated {UPDATED}</p>
        <p className="mt-6 text-[15px] leading-relaxed text-v2-navy">
          ColorfulMemories turns your family photos into coloring pages and printed books. This page
          explains, in plain language, what information the app collects, where it goes, and what it
          keeps in cookies and your browser. By using the app you agree to the terms below.
        </p>

        <Section title="What we store about you">
          <p>
            <strong>Your account.</strong> Email address, display name, optional avatar, and a promo-credit
            balance. Passwords are handled by our sign-in provider (Supabase) and are never visible to us.
          </p>
          <p>
            <strong>Your photos and coloring pages.</strong> When you are signed in, the photos you upload,
            the coloring pages generated from them, and every revision you make are stored privately in your
            account in our cloud storage. Only you can access them. When you use the studio without an
            account, nothing is uploaded — your photos stay in your browser.
          </p>
          <p>
            <strong>Your orders.</strong> Book configuration, the shipping address you enter, order status and
            tracking, and your credit history.
          </p>
        </Section>

        <Section title="Who we share it with">
          <p>
            <strong>Google (Gemini).</strong> To turn a photo into a coloring page, the photo is sent to
            Google’s Gemini API for processing. We send only what’s needed to draw the page.
          </p>
          <p>
            <strong>Lulu.</strong> When you order a printed book, your shipping address, contact email and the
            book’s PDF are sent to Lulu, our print partner, to print and ship it.
          </p>
          <p>
            <strong>Stripe.</strong> Credit purchases are handled by Stripe on Stripe’s own checkout page. We
            never see or store your card details — only that a payment succeeded and for how much.
          </p>
          <p>We don’t sell your information and we don’t use it for advertising.</p>
        </Section>

        <Section title="Cookies">
          <p>We set one cookie ourselves:</p>
          <Table
            rows={[
              ["cm_welcome_guide_dismissed", "Cookie · 1 year", "Remembers that you asked not to see the welcome guide again."],
            ]}
          />
          <p>
            Sign-in links and password resets may set short-lived cookies from our sign-in provider to
            complete that step. Stripe sets its own cookies on its checkout page, under its own policy. We
            use no advertising or analytics cookies.
          </p>
        </Section>

        <Section title="What the app keeps in your browser">
          <p>
            Besides cookies, the app uses your browser’s local storage so it works quickly and remembers a
            few things between visits:
          </p>
          <Table
            rows={[
              ["cm_access_token", "Local storage", "Keeps you signed in. Removed when you sign out."],
              ["cm_session_hint", "Local storage", "Your name and email, so the app can show them before it finishes loading."],
              ["cm_shipping_address", "Local storage", "The last shipping address you typed, so you don’t re-enter it."],
              ["cm_quote_shipping_zip", "Local storage", "The ZIP used for a price estimate."],
              ["cm_guest_try_free", "Session storage", "Marks that you chose to try the studio without an account. Cleared when the tab closes."],
              ["Studio library", "IndexedDB", "Guests: your photos and coloring pages. Signed in: a local copy of your images so they load without re-downloading."],
            ]}
          />
          <p>You can clear all of this at any time through your browser’s site-data settings.</p>
        </Section>

        <Section title="Deleting your information">
          <p>
            Deleting an album in the studio permanently deletes its photos and coloring pages from our
            storage. Deleting your account removes your account, every album and image, and your order
            history, except records we must keep for completed purchases.
          </p>
        </Section>

        <Section title="Terms of use">
          <p>
            Only upload photos you have the right to use and that everyone pictured is comfortable sharing.
            Coloring pages are generated by an AI model and may not be perfect; you can edit and regenerate
            them. Printed books are produced by our print partner; delivery times are estimates shown at
            checkout. Credits are non-refundable once applied to an order that has been sent to print.
          </p>
          <p>
            We may update this page as the product changes; the date at the top will change when we do.
          </p>
        </Section>

        <Section title="Contact">
          <p>
            Questions about your data? Email{" "}
            <a href="mailto:hello@colorfulmemories.net" className="font-semibold text-v2-link">
              hello@colorfulmemories.net
            </a>
            .
          </p>
        </Section>

        <p className="mt-12 text-sm text-v2-muted">
          <Link href="/" className="font-semibold text-v2-link">
            ← Back to home
          </Link>
        </p>
      </main>
      <footer className="border-t border-gray-200 bg-white py-6">
        <div className="v2-gutter-x mx-auto w-full max-w-3xl text-xs text-v2-muted">
          © {new Date().getFullYear()} ColorfulMemories · LBC Innovation
        </div>
      </footer>
    </div>
  );
}
