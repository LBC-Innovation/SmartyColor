"use client";

import { useEffect, useState } from "react";
import { Check, Loader2, X } from "lucide-react";
import { V2StudioFrame } from "@/components/v2/V2Chrome";
import { ADMIN_CONTENT_CLASS, V2AdminToolbar } from "@/components/v2/auth/V2AdminSubNav";
import * as api from "@/lib/api/client";
import { cn } from "@/lib/cn";

type Submission = {
  id: string;
  orderId: string | null;
  quote: string;
  firstName: string;
  relation: string;
  photoUrl: string | null;
  consent: boolean;
  consentAt: string | null;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
};

/** The entry to paste into src/content/testimonials.ts. */
function snippet(s: Submission): string {
  const consentDate = (s.consentAt ?? s.createdAt).slice(0, 10);
  return `  {
    quote: ${JSON.stringify(s.quote)},
    firstName: ${JSON.stringify(s.firstName)},
    relation: ${JSON.stringify(s.relation)},
    consentDate: ${JSON.stringify(consentDate)},
  },`;
}

const STATUS_STYLE: Record<Submission["status"], string> = {
  pending: "bg-amber-50 text-amber-700",
  approved: "bg-emerald-50 text-emerald-700",
  rejected: "bg-gray-100 text-gray-500",
};

export function V2TestimonialsStudio() {
  const [rows, setRows] = useState<Submission[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void api.request<Submission[]>("/admin/testimonials").then((result) => {
      if (cancelled) return;
      if (api.isError(result)) setError(result.error.message);
      else {
        setError(null);
        setRows(result.data);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  async function review(id: string, status: Submission["status"]) {
    setBusyId(id);
    const result = await api.request<{ id: string }>(`/admin/testimonials/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    });
    setBusyId(null);
    if (api.isError(result)) setError(result.error.message);
    else setReloadKey((k) => k + 1);
  }

  return (
    <V2StudioFrame>
      <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden">
        <V2AdminToolbar />
        <main className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain pb-[calc(3.5rem+env(safe-area-inset-bottom))] lg:pb-6">
          <div className={`${ADMIN_CONTENT_CLASS} py-6 sm:py-8`}>
            <header className="mb-5">
              <h1 className="v2-brand-title text-2xl tracking-tight text-v2-ink sm:text-3xl">Customer stories</h1>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-v2-muted sm:text-base">
                Quotes and photos sent back from the &ldquo;How did it go?&rdquo; email. Only stories with permission can be
                approved. To show one on the site, approve it and paste its entry into src/content/testimonials.ts.
              </p>
            </header>

            {error ? <p className="mb-4 text-sm font-medium text-red-600">{error}</p> : null}
            {!rows ? (
              <Loader2 className="h-6 w-6 animate-spin text-v2-primary" aria-label="Loading" />
            ) : rows.length === 0 ? (
              <p className="text-sm text-v2-muted">No stories yet.</p>
            ) : (
              <ul className="space-y-4">
                {rows.map((s) => (
                  <li key={s.id} className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-5">
                    <div className="flex flex-col gap-4 sm:flex-row">
                      {s.photoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={s.photoUrl} alt="" className="h-32 w-32 shrink-0 rounded-xl object-cover" />
                      ) : null}
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <span className={cn("rounded-full px-2 py-0.5 font-semibold", STATUS_STYLE[s.status])}>{s.status}</span>
                          <span className={cn("rounded-full px-2 py-0.5 font-semibold", s.consent ? "bg-v2-primary-light text-v2-primary" : "bg-gray-100 text-gray-500")}>
                            {s.consent ? "Permission given" : "No permission"}
                          </span>
                          <span className="text-v2-muted">{new Date(s.createdAt).toLocaleDateString()}</span>
                        </div>
                        <p className="mt-2 text-[15px] leading-relaxed text-v2-ink">&ldquo;{s.quote}&rdquo;</p>
                        <p className="mt-1 text-sm text-v2-muted">
                          {s.firstName}
                          {s.relation ? `, ${s.relation}` : ""}
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {s.status !== "approved" && s.consent ? (
                            <button
                              type="button"
                              disabled={busyId === s.id}
                              onClick={() => void review(s.id, "approved")}
                              className="inline-flex items-center gap-1.5 rounded-full bg-v2-primary px-3.5 py-1.5 text-sm font-semibold text-white disabled:opacity-60"
                            >
                              <Check className="h-4 w-4" aria-hidden /> Approve
                            </button>
                          ) : null}
                          {s.status !== "rejected" ? (
                            <button
                              type="button"
                              disabled={busyId === s.id}
                              onClick={() => void review(s.id, "rejected")}
                              className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 px-3.5 py-1.5 text-sm font-semibold text-v2-navy disabled:opacity-60"
                            >
                              <X className="h-4 w-4" aria-hidden /> Reject
                            </button>
                          ) : null}
                        </div>
                        {s.status === "approved" ? (
                          <pre className="mt-3 overflow-x-auto rounded-xl bg-v2-bg-subtle p-3 text-xs text-v2-ink">{snippet(s)}</pre>
                        ) : null}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </main>
      </div>
    </V2StudioFrame>
  );
}
