"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import QRCode from "qrcode";
import { Printer, X } from "lucide-react";
import { SITE_URL } from "@/lib/siteUrl";
import { bundleLines, purchaseCodeLink, type AdminPurchaseCode } from "@/lib/purchaseCodes/types";

const noopSubscribe = () => () => {};

function useQrSvgs(codes: AdminPurchaseCode[]): Record<string, string> {
  const [svgs, setSvgs] = useState<Record<string, string>>({});
  useEffect(() => {
    let alive = true;
    void Promise.all(
      codes.map(async (c) => {
        const svg = await QRCode.toString(purchaseCodeLink(SITE_URL, c, "print"), {
          type: "svg",
          errorCorrectionLevel: "M",
          margin: 0,
        });
        return [c.id, svg] as const;
      }),
    ).then((pairs) => {
      if (alive) setSvgs(Object.fromEntries(pairs));
    });
    return () => {
      alive = false;
    };
  }, [codes]);
  return svgs;
}

function displayHost(): string {
  try {
    return new URL(SITE_URL).host;
  } catch {
    return "colorfulmemories.net";
  }
}

/**
 * Full-screen preview of the codes as cards, two to a printed page, each with a QR code that opens
 * the redeem page (tagged utm_medium=print). Printing shows only the cards.
 */
export function PrintableCodeCards({
  codes,
  onClose,
  onPrinted,
}: {
  codes: AdminPurchaseCode[];
  onClose: () => void;
  /** Called once the print dialog has been opened, to log the send. */
  onPrinted: () => void;
}) {
  const onClient = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const svgs = useQrSvgs(codes);
  const ready = codes.every((c) => svgs[c.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!onClient) return null;
  const host = displayHost();

  return createPortal(
    <div id="purchase-code-print" className="fixed inset-0 z-[80] overflow-y-auto bg-gray-100" role="dialog" aria-modal aria-label="Print codes">
      <style>{`
        @media print {
          @page { size: letter; margin: 0.5in; }
          body * { visibility: hidden !important; }
          #purchase-code-print, #purchase-code-print * { visibility: visible !important; }
          #purchase-code-print { position: absolute !important; inset: 0 !important; overflow: visible !important; background: white !important; }
          #purchase-code-print .no-print { display: none !important; }
          #purchase-code-print .card { break-inside: avoid; box-shadow: none !important; }
          #purchase-code-print .card:nth-of-type(2n) { break-after: page; }
        }
      `}</style>
      <div className="no-print sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-gray-200 bg-white px-4 py-3">
        <p className="text-sm text-v2-ink">
          {codes.length} {codes.length === 1 ? "card" : "cards"}, two per page. Each QR code opens that code&apos;s page.
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            className="v2-btn-sm v2-btn-sm-primary"
            disabled={!ready}
            onClick={() => {
              window.print();
              onPrinted();
            }}
          >
            <Printer className="h-4 w-4" aria-hidden />
            Print
          </button>
          <button type="button" className="v2-btn-sm" onClick={onClose} aria-label="Close">
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </div>
      <div className="mx-auto flex max-w-[7.5in] flex-col gap-6 px-4 py-6 print:p-0">
        {codes.map((c) => (
          <article
            key={c.id}
            className="card flex min-h-[4.6in] flex-col justify-between rounded-2xl border-2 border-dashed border-violet-300 bg-white p-8 shadow-sm"
          >
            <div className="flex items-start justify-between gap-6">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">Colorful Memories · {c.campaign}</p>
                <h2 className="mt-2 text-2xl font-bold leading-tight text-gray-900">
                  {c.recipientName ? `${c.recipientName}, your` : "Your"} coloring book is ready to make
                </h2>
                {c.note ? <p className="mt-3 whitespace-pre-line text-sm text-gray-700">{c.note}</p> : null}
                <ul className="mt-4 space-y-1 text-sm text-gray-700">
                  {bundleLines(c).map((line) => (
                    <li key={line}>• {line}</li>
                  ))}
                </ul>
              </div>
              <div className="w-36 shrink-0 text-center">
                {svgs[c.id] ? (
                  // The SVG comes from the qrcode library, built from our own URL.
                  <div className="h-36 w-36 [&>svg]:h-full [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: svgs[c.id] }} />
                ) : (
                  <div className="h-36 w-36 animate-pulse rounded bg-gray-100" />
                )}
                <p className="mt-2 text-[11px] leading-tight text-gray-500">Scan with your phone&apos;s camera</p>
              </div>
            </div>
            <div className="mt-6 flex flex-wrap items-end justify-between gap-4 border-t border-gray-200 pt-4">
              <div>
                <p className="text-xs uppercase tracking-wide text-gray-500">Your code</p>
                <p className="font-mono text-3xl font-bold tracking-[0.12em] text-gray-900">{c.code}</p>
              </div>
              <p className="text-right text-sm text-gray-600">
                Or go to <span className="font-semibold text-gray-900">{host}/redeem</span>
                <br />
                and type the code.
                {c.expiresAt ? (
                  <>
                    <br />
                    Use by {new Date(c.expiresAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" })}.
                  </>
                ) : null}
              </p>
            </div>
          </article>
        ))}
      </div>
    </div>,
    document.body,
  );
}
