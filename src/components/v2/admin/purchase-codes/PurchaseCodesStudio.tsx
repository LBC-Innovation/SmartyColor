"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { Ban, Copy, Loader2, Mail, MessageSquare, Plus, Printer, Ticket } from "lucide-react";
import { isError } from "@/lib/api/client";
import { parseDollarsToCents } from "@/lib/credits/money";
import { BOOK_BINDINGS, PRINT_BINDING_IDS, type BookBindingId } from "@/lib/print/bookBindings";
import { SITE_URL } from "@/lib/siteUrl";
import {
  adminCreatePurchaseCodes,
  adminListPurchaseCodes,
  adminSendPurchaseCode,
  adminVoidPurchaseCode,
} from "@/lib/purchaseCodes/client";
import {
  MAX_CODES_PER_BATCH,
  bindingName,
  bundleLines,
  campaignSlug,
  coveredPrintPages,
  purchaseCodeLink,
  type AdminPurchaseCode,
  type PurchaseCodeChannel,
  type PurchaseCodeStatus,
} from "@/lib/purchaseCodes/types";
import { DataTable, type Column } from "@/components/v2/admin/DataTable";
import { Drawer } from "@/components/v2/admin/Drawer";
import { fullDateTime, money, shortDate, type Tone } from "@/components/v2/admin/format";
import {
  Callout,
  EmptyState,
  ErrorPanel,
  MoneyInput,
  PageHeader,
  PageLoading,
  RefreshButton,
  SearchInput,
  Section,
  SegmentedControl,
  StatusPill,
  Switch,
} from "@/components/v2/admin/ui";
import { PrintableCodeCards } from "@/components/v2/admin/purchase-codes/PrintableCodeCards";

const STATUS_LABEL: Record<PurchaseCodeStatus, string> = {
  active: "Not used yet",
  redeemed: "In use",
  book_ordered: "Book ordered",
  expired: "Expired",
  void: "Void",
};

const STATUS_TONE: Record<PurchaseCodeStatus, Tone> = {
  active: "info",
  redeemed: "progress",
  book_ordered: "good",
  expired: "neutral",
  void: "bad",
};

const CHANNEL_LABEL: Record<PurchaseCodeChannel, string> = {
  email: "Emailed",
  sms: "Texted",
  print: "Printed",
  link: "Link copied",
};

type Filter = "all" | "active" | "redeemed" | "book_ordered" | "closed";

function smsBody(code: AdminPurchaseCode): string {
  const greeting = code.recipientName ? `Hi ${code.recipientName}! ` : "";
  return `${greeting}Here's your Colorful Memories coloring book, already paid for. Start it here: ${purchaseCodeLink(SITE_URL, code, "sms")} (code ${code.code})`;
}

/** `sms:` link that opens the admin's Messages app with the text filled in. */
function smsHref(code: AdminPurchaseCode, phone: string): string {
  const to = phone.replace(/[^\d+]/g, "");
  return `sms:${to}?&body=${encodeURIComponent(smsBody(code))}`;
}

// ---- create form --------------------------------------------------------------------------------

type Draft = {
  campaign: string;
  quantity: string;
  includedPages: string;
  editsPerPage: string;
  portraitsPerPage: string;
  bindingId: BookBindingId;
  backsIncluded: boolean;
  cap: string;
  expiresAt: string;
  recipientName: string;
  recipientEmail: string;
  recipientPhone: string;
  note: string;
};

const EMPTY_DRAFT: Draft = {
  campaign: "",
  quantity: "1",
  includedPages: "15",
  editsPerPage: "3",
  portraitsPerPage: "1",
  bindingId: "saddle_stitch",
  backsIncluded: true,
  cap: "",
  expiresAt: "",
  recipientName: "",
  recipientEmail: "",
  recipientPhone: "",
  note: "",
};

function Field({ id, label, hint, children }: { id: string; label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <label className="v2-label" htmlFor={id}>
        {label}
      </label>
      {children}
      {hint ? <p className="mt-1 text-xs text-v2-muted">{hint}</p> : null}
    </div>
  );
}

function CreateCodesForm({ onCreated }: { onCreated: (codes: AdminPurchaseCode[]) => void }) {
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }));

  const quantity = Number.parseInt(draft.quantity, 10);
  const pages = Number.parseInt(draft.includedPages, 10);
  const single = quantity === 1;
  const capCents = draft.cap.trim() ? parseDollarsToCents(draft.cap) : null;
  const capInvalid = draft.cap.trim() !== "" && (capCents == null || capCents <= 0);
  const fits =
    Number.isInteger(pages) && pages > 0
      ? coveredPrintPages({ includedPages: pages, bindingId: draft.bindingId, backsIncluded: draft.backsIncluded }) >=
        (draft.backsIncluded ? pages * 2 : pages)
      : true;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    const result = await adminCreatePurchaseCodes({
      campaign: draft.campaign,
      quantity,
      includedPages: pages,
      editsPerPage: Number.parseInt(draft.editsPerPage, 10),
      portraitsPerPage: Number.parseInt(draft.portraitsPerPage, 10),
      bindingId: draft.bindingId,
      backsIncluded: draft.backsIncluded,
      shippingLevel: "MAIL",
      maxBookCents: capCents,
      // End of the chosen day, in the admin's time zone.
      expiresAt: draft.expiresAt ? new Date(`${draft.expiresAt}T23:59:59`).toISOString() : null,
      recipientName: single ? draft.recipientName : null,
      recipientEmail: single ? draft.recipientEmail : null,
      recipientPhone: single ? draft.recipientPhone : null,
      note: draft.note,
    });
    setSaving(false);
    if (isError(result)) {
      setError(result.error.message);
      return;
    }
    setDraft((d) => ({ ...EMPTY_DRAFT, campaign: d.campaign, includedPages: d.includedPages, bindingId: d.bindingId }));
    onCreated(result.data);
  }

  const preview = Number.isInteger(pages) && pages > 0
    ? bundleLines({
        includedPages: pages,
        editsPerPage: Number.parseInt(draft.editsPerPage, 10) || 0,
        portraitsPerPage: Number.parseInt(draft.portraitsPerPage, 10) || 0,
        bindingId: draft.bindingId,
        backsIncluded: draft.backsIncluded,
        shippingLevel: "MAIL",
        maxBookCents: capCents,
      })
    : [];

  return (
    <form onSubmit={submit} className="v2-panel grid gap-6 p-5 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="pc-campaign" label="Campaign name" hint={draft.campaign ? `Tracked as utm_campaign=${campaignSlug(draft.campaign)}` : "e.g. Black Friday 2026. Used for tracking."}>
          <input id="pc-campaign" className="v2-input" value={draft.campaign} onChange={(e) => set("campaign", e.target.value)} maxLength={80} required />
        </Field>
        <Field id="pc-quantity" label="How many codes" hint={single ? "One code, for one person." : "Each code works once. Recipient fields are for single codes."}>
          <input
            id="pc-quantity"
            className="v2-input"
            type="number"
            min={1}
            max={MAX_CODES_PER_BATCH}
            value={draft.quantity}
            onChange={(e) => set("quantity", e.target.value)}
            required
          />
        </Field>
        <Field id="pc-pages" label="Coloring pages included">
          <input id="pc-pages" className="v2-input" type="number" min={1} max={200} value={draft.includedPages} onChange={(e) => set("includedPages", e.target.value)} required />
        </Field>
        <Field id="pc-binding" label="Book binding" hint={fits ? undefined : "That many pages doesn't fit this binding."}>
          <select id="pc-binding" className="v2-input" value={draft.bindingId} onChange={(e) => set("bindingId", e.target.value as BookBindingId)}>
            {PRINT_BINDING_IDS.map((id) => (
              <option key={id} value={id}>
                {BOOK_BINDINGS[id].shortLabel}
              </option>
            ))}
          </select>
        </Field>
        <Field id="pc-edits" label="Free edits per page">
          <input id="pc-edits" className="v2-input" type="number" min={0} max={20} value={draft.editsPerPage} onChange={(e) => set("editsPerPage", e.target.value)} required />
        </Field>
        <Field id="pc-portraits" label="Free “convert to portrait” per page">
          <input id="pc-portraits" className="v2-input" type="number" min={0} max={5} value={draft.portraitsPerPage} onChange={(e) => set("portraitsPerPage", e.target.value)} required />
        </Field>
        <div className="flex items-center justify-between gap-3 sm:col-span-2">
          <div>
            <p className="text-sm font-medium text-v2-ink">Blank or lined backs included</p>
            <p className="text-xs text-v2-muted">Each page printed on its own sheet, the back left blank or ruled.</p>
          </div>
          <Switch checked={draft.backsIncluded} onChange={(v) => set("backsIncluded", v)} label="Blank or lined backs included" />
        </div>
        <Field id="pc-cap" label="Most the code pays for the book (optional)" hint="Standard shipping is included. Leave empty for no cap.">
          <MoneyInput id="pc-cap" value={draft.cap} onChange={(v) => set("cap", v)} invalid={capInvalid} />
        </Field>
        <Field id="pc-expires" label="Redeem by (optional)">
          <input id="pc-expires" className="v2-input" type="date" value={draft.expiresAt} onChange={(e) => set("expiresAt", e.target.value)} />
        </Field>
        {single ? (
          <>
            <Field id="pc-name" label="Recipient's name (optional)">
              <input id="pc-name" className="v2-input" value={draft.recipientName} onChange={(e) => set("recipientName", e.target.value)} maxLength={120} />
            </Field>
            <Field id="pc-email" label="Recipient's email (optional)">
              <input id="pc-email" className="v2-input" type="email" value={draft.recipientEmail} onChange={(e) => set("recipientEmail", e.target.value)} />
            </Field>
            <Field id="pc-phone" label="Recipient's mobile (optional)">
              <input id="pc-phone" className="v2-input" type="tel" value={draft.recipientPhone} onChange={(e) => set("recipientPhone", e.target.value)} maxLength={32} />
            </Field>
          </>
        ) : null}
        <div className={single ? "" : "sm:col-span-2"}>
          <Field id="pc-note" label="Note to the recipient (optional)" hint="Shown in the email, on the card and on the redeem page.">
            <textarea id="pc-note" className="v2-input min-h-[4.5rem]" value={draft.note} onChange={(e) => set("note", e.target.value)} maxLength={500} />
          </Field>
        </div>
      </div>
      <aside className="flex flex-col gap-3 rounded-xl bg-v2-bg p-4">
        <p className="text-sm font-semibold text-v2-ink">What the customer gets</p>
        <ul className="space-y-1.5 text-sm text-v2-muted">
          {preview.map((line) => (
            <li key={line}>• {line}</li>
          ))}
          {capCents ? <li>• The code pays up to {money(capCents)} toward the book</li> : null}
        </ul>
        <p className="text-xs text-v2-muted">
          Anything beyond this (more pages or edits, another binding, faster shipping) is charged to the customer&apos;s wallet
          and marked as extra. The code value is generated for you.
        </p>
        {error ? (
          <p className="text-sm text-red-700" role="alert">
            {error}
          </p>
        ) : null}
        <button type="submit" className="v2-btn-sm v2-btn-sm-primary mt-auto h-11" disabled={saving || capInvalid || !fits || !draft.campaign.trim()}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Plus className="h-4 w-4" aria-hidden />}
          {Number.isInteger(quantity) && quantity > 1 ? `Generate ${quantity} codes` : "Generate code"}
        </button>
      </aside>
    </form>
  );
}

// ---- detail drawer ------------------------------------------------------------------------------

function CodeDrawer({
  code,
  onClose,
  onChanged,
  onPrint,
}: {
  code: AdminPurchaseCode;
  onClose: () => void;
  onChanged: () => void;
  onPrint: (codes: AdminPurchaseCode[]) => void;
}) {
  const [email, setEmail] = useState(code.recipientEmail ?? "");
  const [phone, setPhone] = useState(code.recipientPhone ?? "");
  const [busy, setBusy] = useState<"email" | "void" | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const usable = code.status === "active";
  const link = purchaseCodeLink(SITE_URL, code, "link");

  async function log(channel: PurchaseCodeChannel, to?: string | null) {
    const r = await adminSendPurchaseCode(code.id, channel, to);
    if (!isError(r)) onChanged();
  }

  async function sendEmail(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setStatus(null);
    setBusy("email");
    const r = await adminSendPurchaseCode(code.id, "email", email);
    setBusy(null);
    if (isError(r)) {
      setError(r.error.message);
      return;
    }
    setStatus(`Emailed to ${email}`);
    onChanged();
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(link);
      setStatus("Link copied");
      void log("link");
    } catch {
      setError("Couldn't copy. Select the link and copy it by hand.");
    }
  }

  async function voidCode() {
    if (!window.confirm(`Void ${code.code}? It stops working at once and can't be turned back on.`)) return;
    setBusy("void");
    const r = await adminVoidPurchaseCode(code.id);
    setBusy(null);
    if (isError(r)) {
      setError(r.error.message);
      return;
    }
    onChanged();
    onClose();
  }

  return (
    <Drawer
      onClose={onClose}
      title={<span className="font-mono tracking-wider">{code.code}</span>}
      subtitle={code.campaign}
      headerActions={<StatusPill tone={STATUS_TONE[code.status]}>{STATUS_LABEL[code.status]}</StatusPill>}
    >
      <div className="space-y-6">
        <section>
          <h3 className="text-sm font-semibold text-v2-ink">Includes</h3>
          <ul className="mt-2 space-y-1 text-sm text-v2-muted">
            {bundleLines(code).map((line) => (
              <li key={line}>• {line}</li>
            ))}
            {code.maxBookCents ? <li>• Pays up to {money(code.maxBookCents)} toward the book</li> : null}
          </ul>
          {code.note ? <p className="mt-3 whitespace-pre-line rounded-lg bg-v2-bg p-3 text-sm text-v2-ink">{code.note}</p> : null}
        </section>

        {code.redeemedAt ? (
          <section className="text-sm">
            <h3 className="font-semibold text-v2-ink">Use</h3>
            <p className="mt-1 text-v2-muted">
              Redeemed {fullDateTime(code.redeemedAt)} by {code.redeemedByEmail ?? "a customer"}
              {code.projectName ? ` on album “${code.projectName}”` : ""}.
            </p>
            <p className="mt-1 text-v2-muted">
              {code.pagesUsed} of {code.includedPages} pages used.
              {code.bookOrderId ? (
                <>
                  {" "}
                  Book ordered (
                  <Link className="text-v2-link underline" href={`/admin/orders?order=${code.bookOrderId}`}>
                    view order
                  </Link>
                  ){code.bookCoveredCents != null ? `, code paid ${money(code.bookCoveredCents)}` : ""}.
                </>
              ) : null}
            </p>
          </section>
        ) : null}

        {usable ? (
          <section className="space-y-4">
            <h3 className="text-sm font-semibold text-v2-ink">Send it</h3>
            <form onSubmit={sendEmail} className="flex flex-wrap items-end gap-2">
              <div className="min-w-0 flex-1">
                <label className="v2-label" htmlFor="pc-send-email">
                  Email
                </label>
                <input id="pc-send-email" type="email" className="v2-input" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>
              <button type="submit" className="v2-btn-sm v2-btn-sm-primary h-11" disabled={busy != null || !email.trim()}>
                {busy === "email" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Mail className="h-4 w-4" aria-hidden />}
                Send email
              </button>
            </form>
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-0 flex-1">
                <label className="v2-label" htmlFor="pc-send-sms">
                  Text message
                </label>
                <input id="pc-send-sms" type="tel" className="v2-input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Mobile number" />
              </div>
              <a
                href={smsHref(code, phone)}
                className="v2-btn-sm h-11"
                onClick={() => void log("sms", phone || null)}
                aria-disabled={!phone.trim()}
              >
                <MessageSquare className="h-4 w-4" aria-hidden />
                Open in Messages
              </a>
            </div>
            <p className="-mt-2 text-xs text-v2-muted">
              Opens your phone or Mac&apos;s Messages with the text written for you; you press send.
            </p>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="v2-btn-sm" onClick={() => onPrint([code])}>
                <Printer className="h-4 w-4" aria-hidden />
                Print card
              </button>
              <button type="button" className="v2-btn-sm" onClick={() => void copyLink()}>
                <Copy className="h-4 w-4" aria-hidden />
                Copy link
              </button>
            </div>
            <p className="break-all rounded-lg bg-v2-bg p-2 font-mono text-xs text-v2-muted">{link}</p>
          </section>
        ) : null}

        {status ? (
          <p role="status" className="text-sm font-semibold text-v2-success-text">
            {status}
          </p>
        ) : null}
        {error ? (
          <p className="text-sm text-red-700" role="alert">
            {error}
          </p>
        ) : null}

        <section>
          <h3 className="text-sm font-semibold text-v2-ink">History</h3>
          <ul className="mt-2 space-y-1 text-sm text-v2-muted">
            <li>Created {fullDateTime(code.createdAt)}</li>
            {code.sends.map((s, i) => (
              <li key={`${s.sentAt}-${i}`}>
                {CHANNEL_LABEL[s.channel]}
                {s.recipient ? ` to ${s.recipient}` : ""} · {fullDateTime(s.sentAt)}
              </li>
            ))}
            {code.expiresAt ? <li>Redeem by {shortDate(code.expiresAt)}</li> : null}
          </ul>
        </section>

        {code.status === "active" || code.status === "redeemed" ? (
          <button type="button" className="v2-btn-sm text-red-700" onClick={() => void voidCode()} disabled={busy != null}>
            <Ban className="h-4 w-4" aria-hidden />
            Void this code
          </button>
        ) : null}
      </div>
    </Drawer>
  );
}

// ---- page ---------------------------------------------------------------------------------------

export function PurchaseCodesStudio() {
  const [codes, setCodes] = useState<AdminPurchaseCode[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [printing, setPrinting] = useState<AdminPurchaseCode[] | null>(null);
  const [justMade, setJustMade] = useState<AdminPurchaseCode[] | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const r = await adminListPurchaseCodes();
    setLoading(false);
    if (isError(r)) {
      setError(r.error.message);
      return;
    }
    setError(null);
    setCodes(r.data);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- first load
    void load();
  }, [load]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (codes ?? []).filter((c) => {
      if (filter === "active" && c.status !== "active") return false;
      if (filter === "redeemed" && c.status !== "redeemed") return false;
      if (filter === "book_ordered" && c.status !== "book_ordered") return false;
      if (filter === "closed" && c.status !== "void" && c.status !== "expired") return false;
      if (!q) return true;
      return [c.code, c.campaign, c.recipientName, c.recipientEmail, c.redeemedByEmail]
        .filter(Boolean)
        .some((v) => v!.toLowerCase().includes(q));
    });
  }, [codes, filter, search]);

  const open = codes?.find((c) => c.id === openId) ?? null;

  const columns: Column<AdminPurchaseCode>[] = [
    {
      key: "code",
      header: "Code",
      cell: (c) => <span className="font-mono font-semibold tracking-wider text-v2-ink">{c.code}</span>,
      sortValue: (c) => c.code,
    },
    { key: "campaign", header: "Campaign", cell: (c) => c.campaign, sortValue: (c) => c.campaign },
    {
      key: "bundle",
      header: "Bundle",
      cell: (c) => `${c.includedPages} pages · ${bindingName(c.bindingId)}`,
      hideBelow: "lg",
    },
    {
      key: "who",
      header: "For",
      cell: (c) => c.redeemedByEmail ?? c.recipientName ?? c.recipientEmail ?? <span className="text-v2-muted">—</span>,
      hideBelow: "md",
    },
    {
      key: "used",
      header: "Pages used",
      align: "right",
      cell: (c) => (c.redeemedAt ? `${c.pagesUsed} / ${c.includedPages}` : "—"),
      sortValue: (c) => c.pagesUsed,
      hideBelow: "md",
    },
    {
      key: "status",
      header: "Status",
      cell: (c) => <StatusPill tone={STATUS_TONE[c.status]}>{STATUS_LABEL[c.status]}</StatusPill>,
      sortValue: (c) => c.status,
    },
    { key: "created", header: "Created", cell: (c) => shortDate(c.createdAt), sortValue: (c) => c.createdAt, hideBelow: "lg" },
  ];

  return (
    <>
      <PageHeader
        title="Purchase codes"
        description="Pre-paid books: each code gives one album a set number of pages, edits and a printed book with standard shipping. Send it by email, text or a printed card with a QR code."
        actions={<RefreshButton onClick={() => void load()} loading={loading} />}
      />

      <div className="space-y-8">
        <Section id="new-codes" title="Generate codes">
          <CreateCodesForm
            onCreated={(made) => {
              setCodes((current) => [...made, ...(current ?? [])]);
              setJustMade(made);
              if (made.length === 1) setOpenId(made[0].id);
            }}
          />
          {justMade && justMade.length > 1 ? (
            <Callout tone="good" title={`${justMade.length} codes made`} className="mt-4">
              <button type="button" className="v2-btn-sm mt-2" onClick={() => setPrinting(justMade)}>
                <Printer className="h-4 w-4" aria-hidden />
                Print all {justMade.length} cards
              </button>
            </Callout>
          ) : null}
        </Section>

        <Section
          id="codes"
          title="Codes"
          action={
            <SegmentedControl<Filter>
              ariaLabel="Show"
              value={filter}
              onChange={setFilter}
              options={[
                { id: "all", label: "All" },
                { id: "active", label: "Not used" },
                { id: "redeemed", label: "In use" },
                { id: "book_ordered", label: "Ordered" },
                { id: "closed", label: "Void / expired" },
              ]}
            />
          }
        >
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <SearchInput value={search} onChange={setSearch} label="Search codes" placeholder="Search code, campaign, name or email" />
            {rows.some((c) => c.status === "active") ? (
              <button type="button" className="v2-btn-sm" onClick={() => setPrinting(rows.filter((c) => c.status === "active"))}>
                <Printer className="h-4 w-4" aria-hidden />
                Print unused ({rows.filter((c) => c.status === "active").length})
              </button>
            ) : null}
          </div>
          {error ? (
            <ErrorPanel>{error}</ErrorPanel>
          ) : codes == null ? (
            <PageLoading label="Loading codes" />
          ) : codes.length === 0 ? (
            <EmptyState icon={Ticket} title="No codes yet">
              Generate one above.
            </EmptyState>
          ) : (
            <div className="v2-panel overflow-hidden">
              <DataTable
                columns={columns}
                rows={rows}
                rowKey={(c) => c.id}
                caption="Purchase codes"
                onRowClick={(c) => setOpenId(c.id)}
                rowLabel={(c) => `Open code ${c.code}`}
                selectedKey={openId}
                defaultSort={{ key: "created", dir: "desc" }}
              />
            </div>
          )}
        </Section>
      </div>

      {open ? (
        <CodeDrawer code={open} onClose={() => setOpenId(null)} onChanged={() => void load()} onPrint={setPrinting} />
      ) : null}
      {printing ? (
        <PrintableCodeCards
          codes={printing}
          onClose={() => setPrinting(null)}
          onPrinted={() => {
            for (const c of printing) void adminSendPurchaseCode(c.id, "print", null);
            void load();
          }}
        />
      ) : null}
    </>
  );
}
