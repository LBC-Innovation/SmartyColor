"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Archive, ArchiveRestore, Check, Copy, Link2 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { LANDING_ORDER, LANDING_PAGES } from "@/content/marketing";
import * as api from "@/lib/api/client";
import type { MarketingLink } from "@/lib/marketing/acquisitionTypes";
import { classifyChannel, CHANNEL_LABELS } from "@/lib/marketing/channel";
import { DataTable, type Column } from "@/components/v2/admin/DataTable";
import { count, relativeTime } from "@/components/v2/admin/format";
import { EmptyState, ErrorPanel, PageHeader, PageLoading, RefreshButton, Section } from "@/components/v2/admin/ui";

/** Suggested values, so every campaign is tagged the same way. Free text is allowed. */
const SOURCES = ["meta", "instagram", "facebook", "tiktok", "google", "pinterest", "youtube", "newsletter", "creator", "school", "flyer", "qr"];
const MEDIUMS = [
  { id: "paid_social", hint: "Meta, TikTok, Pinterest ads" },
  { id: "cpc", hint: "Google or Bing search ads" },
  { id: "social", hint: "Your own posts, bio links, stories" },
  { id: "influencer", hint: "Creators and partners" },
  { id: "email", hint: "Newsletters and emails" },
  { id: "qr", hint: "Printed QR codes" },
  { id: "print", hint: "Flyers, inserts, packaging" },
  { id: "referral", hint: "Another site linking to you" },
];

/** Ad platform URL parameters with their dynamic macros, pasted into each platform once. */
const AD_TEMPLATES = [
  {
    platform: "Meta (Facebook & Instagram)",
    where: "Ad → Destination → URL parameters",
    value: "utm_source=meta&utm_medium=paid_social&utm_campaign={{campaign.name}}&utm_content={{ad.name}}&utm_term={{adset.name}}",
  },
  {
    platform: "TikTok",
    where: "Ad → Destination → URL, after the page address",
    value: "utm_source=tiktok&utm_medium=paid_social&utm_campaign=__CAMPAIGN_NAME__&utm_content=__CID_NAME__&utm_term=__AID_NAME__",
  },
  {
    platform: "Google Ads",
    where: "Account settings → Tracking → Final URL suffix (keep auto-tagging on)",
    value: "utm_source=google&utm_medium=cpc&utm_campaign={campaignid}&utm_content={creative}&utm_term={keyword}",
  },
  {
    platform: "Pinterest",
    where: "Ad → Destination URL, after the page address",
    value: "utm_source=pinterest&utm_medium=paid_social&utm_campaign={campaign_name}&utm_content={adid}",
  },
];

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function tag(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_.-]/g, "");
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          /* selectable */
        }
      }}
      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-v2-muted hover:bg-gray-100 hover:text-v2-ink"
      aria-label={copied ? "Copied" : label}
    >
      {copied ? <Check className="h-4 w-4 text-emerald-600" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
    </button>
  );
}

export function LinksStudio() {
  const { user } = useAuth();
  const canEdit = Boolean(user?.permissions?.includes("finance:manage"));
  const [links, setLinks] = useState<MarketingLink[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showArchived, setShowArchived] = useState(false);

  const [destination, setDestination] = useState("/");
  const [source, setSource] = useState("");
  const [medium, setMedium] = useState("social");
  const [campaign, setCampaign] = useState("");
  const [content, setContent] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [created, setCreated] = useState<MarketingLink | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const r = await api.adminListLinks();
    setLoading(false);
    if (api.isError(r)) setError(r.error.message);
    else {
      setError(null);
      setLinks(r.data);
    }
  }, []);

  useEffect(() => {
    let alive = true;
    void api.adminListLinks().then((r) => {
      if (!alive) return;
      setLoading(false);
      if (api.isError(r)) setError(r.error.message);
      else setLinks(r.data);
    });
    return () => {
      alive = false;
    };
  }, []);

  const autoSlug = slugify([source, campaign, content].filter(Boolean).join("-"));
  const effectiveSlug = slugTouched ? slug : autoSlug;
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const fullUrl = useMemo(() => {
    const qs = new URLSearchParams();
    if (source) qs.set("utm_source", tag(source));
    if (medium) qs.set("utm_medium", tag(medium));
    if (campaign) qs.set("utm_campaign", tag(campaign));
    if (content) qs.set("utm_content", tag(content));
    const q = qs.toString();
    return `${origin}${destination}${q ? `${destination.includes("?") ? "&" : "?"}${q}` : ""}`;
  }, [origin, destination, source, medium, campaign, content]);
  const channel = classifyChannel({ utm_source: tag(source), utm_medium: tag(medium) });

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setCreated(null);
    setSaving(true);
    const r = await api.adminCreateLink({
      slug: effectiveSlug,
      destination,
      utmSource: source,
      utmMedium: medium,
      utmCampaign: campaign,
      utmContent: content || null,
      promoNote: note || null,
    });
    setSaving(false);
    if (api.isError(r)) {
      setFormError(r.error.message);
      return;
    }
    setLinks((list) => [r.data, ...(list ?? [])]);
    setCreated(r.data);
    setContent("");
    setSlug("");
    setSlugTouched(false);
    setNote("");
  }

  async function archive(link: MarketingLink) {
    const r = await api.adminArchiveLink(link.id, !link.archived);
    if (api.isError(r)) setError(r.error.message);
    else setLinks((list) => (list ?? []).map((l) => (l.id === link.id ? r.data : l)));
  }

  const rows = (links ?? []).filter((l) => showArchived || !l.archived);

  const columns: Column<MarketingLink>[] = [
    {
      key: "slug",
      header: "Link",
      cell: (r) => (
        <span className="flex min-w-0 items-center gap-1">
          <span className={`truncate font-mono text-xs ${r.archived ? "text-v2-muted line-through" : "text-v2-ink"}`}>/go/{r.slug}</span>
          <CopyButton text={r.url} label={`Copy /go/${r.slug}`} />
        </span>
      ),
      sortValue: (r) => r.slug,
    },
    { key: "dest", header: "Goes to", hideBelow: "md", cell: (r) => <span className="font-mono text-xs">{r.destination}</span> },
    {
      key: "tags",
      header: "Tags",
      hideBelow: "lg",
      cell: (r) => <span className="text-xs text-v2-muted">{[r.utmSource, r.utmMedium, r.utmCampaign, r.utmContent].filter(Boolean).join(" · ")}</span>,
    },
    { key: "clicks", header: "Clicks", align: "right", cell: (r) => count(r.clicks), sortValue: (r) => r.clicks },
    { key: "last", header: "Last click", align: "right", hideBelow: "md", cell: (r) => (r.lastClickAt ? relativeTime(r.lastClickAt) : "—"), sortValue: (r) => r.lastClickAt },
    ...(canEdit
      ? [
          {
            key: "archive",
            header: <span className="sr-only">Archive</span>,
            align: "right" as const,
            cell: (r: MarketingLink) => (
              <button
                type="button"
                onClick={() => void archive(r)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-md text-v2-muted hover:bg-gray-100 hover:text-v2-ink"
                aria-label={r.archived ? `Restore /go/${r.slug}` : `Archive /go/${r.slug}`}
                title={r.archived ? "Restore" : "Archive (stops redirecting)"}
              >
                {r.archived ? <ArchiveRestore className="h-4 w-4" aria-hidden /> : <Archive className="h-4 w-4" aria-hidden />}
              </button>
            ),
          },
        ]
      : []),
  ];

  return (
    <div className="space-y-8">
      <PageHeader
        title="Campaign links"
        description="Short links with campaign tags for bios, QR codes, flyers, creators and emails. Every visit through one is credited to its campaign on the Acquisition page."
        actions={<RefreshButton onClick={() => void load()} loading={loading} />}
      />
      {error ? <ErrorPanel>{error}</ErrorPanel> : null}

      {canEdit ? (
        <Section id="new" title="New link">
          <form onSubmit={create} className="v2-panel space-y-4 p-4 sm:p-5">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <label className="text-sm font-medium text-v2-ink">
                Page
                <select value={destination} onChange={(e) => setDestination(e.target.value)} className="v2-input mt-1 w-full">
                  {LANDING_ORDER.filter((i) => LANDING_PAGES[i].ready).map((i) => (
                    <option key={i} value={LANDING_PAGES[i].path}>
                      {LANDING_PAGES[i].path}
                    </option>
                  ))}
                  <option value="/sign-up">/sign-up</option>
                  <option value="/studio">/studio</option>
                </select>
              </label>
              <label className="text-sm font-medium text-v2-ink">
                Source
                <input
                  value={source}
                  onChange={(e) => setSource(e.target.value)}
                  list="link-sources"
                  placeholder="tiktok, instagram, school…"
                  className="v2-input mt-1 w-full"
                  required
                />
                <datalist id="link-sources">
                  {SOURCES.map((s) => (
                    <option key={s} value={s} />
                  ))}
                </datalist>
              </label>
              <label className="text-sm font-medium text-v2-ink">
                Medium
                <select value={medium} onChange={(e) => setMedium(e.target.value)} className="v2-input mt-1 w-full">
                  {MEDIUMS.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.id}: {m.hint}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm font-medium text-v2-ink">
                Campaign
                <input value={campaign} onChange={(e) => setCampaign(e.target.value)} placeholder="holiday_2026" className="v2-input mt-1 w-full" required />
              </label>
              <label className="text-sm font-medium text-v2-ink">
                Content <span className="font-normal text-v2-muted">(optional)</span>
                <input value={content} onChange={(e) => setContent(e.target.value)} placeholder="which post, flyer or creator" className="v2-input mt-1 w-full" />
              </label>
              <label className="text-sm font-medium text-v2-ink">
                Short name
                <input
                  value={effectiveSlug}
                  onChange={(e) => {
                    setSlugTouched(true);
                    setSlug(slugify(e.target.value));
                  }}
                  placeholder="tiktok-bio"
                  className="v2-input mt-1 w-full font-mono"
                  required
                />
              </label>
              <label className="text-sm font-medium text-v2-ink sm:col-span-2">
                Note <span className="font-normal text-v2-muted">(optional: promo code, who it&apos;s for)</span>
                <input value={note} onChange={(e) => setNote(e.target.value)} className="v2-input mt-1 w-full" />
              </label>
            </div>
            <div className="rounded-xl bg-v2-bg-subtle p-3 text-sm">
              <p className="text-v2-muted">
                Short link to share: <span className="break-all font-mono text-v2-ink">{origin}/go/{effectiveSlug || "…"}</span> · counted as{" "}
                <span className="font-semibold text-v2-ink">{CHANNEL_LABELS[channel]}</span>
              </p>
              <p className="mt-1 text-xs text-v2-muted">Only visits through the short link add to Clicks. Copy it from the list once the link is created.</p>
              <details className="mt-2 text-xs text-v2-muted">
                <summary className="cursor-pointer">Where it sends visitors</summary>
                <p className="mt-1 break-all font-mono">{fullUrl}</p>
                <p className="mt-1">
                  Opening this address directly still credits the campaign on the Acquisition page, but it skips the short link, so it isn&apos;t
                  counted as a click.
                </p>
              </details>
            </div>
            {created ? (
              <p className="flex flex-wrap items-center gap-1 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900" role="status">
                Created. Share <span className="break-all font-mono">{created.url}</span>
                <CopyButton text={created.url} label={`Copy /go/${created.slug}`} />
              </p>
            ) : null}
            {formError ? <p className="text-sm text-red-700">{formError}</p> : null}
            <button type="submit" disabled={saving} className="v2-btn-primary min-h-11">
              {saving ? "Creating…" : "Create link"}
            </button>
          </form>
        </Section>
      ) : null}

      <Section
        id="links"
        title="Links"
        action={
          <label className="flex min-h-11 items-center gap-2 text-sm text-v2-muted">
            <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
            Show archived
          </label>
        }
      >
        {links ? (
          <DataTable
            caption="Campaign links"
            columns={columns}
            rows={rows}
            rowKey={(r) => r.id}
            defaultSort={{ key: "clicks", dir: "desc" }}
            empty={<EmptyState icon={Link2} title="No campaign links yet" />}
          />
        ) : error ? null : (
          <PageLoading label="Loading links" />
        )}
      </Section>

      <Section
        id="ad-templates"
        title="Ad platform tracking templates"
        description="Paste these into each ad platform once, so every ad arrives tagged with its campaign and ad name. Click ids (gclid, fbclid, ttclid) are recorded automatically."
      >
        <ul className="space-y-3">
          {AD_TEMPLATES.map((t) => (
            <li key={t.platform} className="v2-panel p-4">
              <p className="text-sm font-semibold text-v2-ink">{t.platform}</p>
              <p className="text-xs text-v2-muted">{t.where}</p>
              <p className="mt-2 flex items-start gap-1 break-all font-mono text-xs text-v2-ink">
                <span className="flex-1">{t.value}</span>
                <CopyButton text={t.value} label={`Copy ${t.platform} template`} />
              </p>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}
