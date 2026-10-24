"use client";

import { useState, type FormEvent } from "react";
import { Loader2 } from "lucide-react";

/** Longest edge of the photo we upload; phones take much bigger ones. */
const PHOTO_EDGE = 1600;

/** Scales a photo down in the browser so it fits the upload limit. Falls back to the original. */
async function shrink(file: File): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, PHOTO_EDGE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
    return blob ?? file;
  } catch {
    return file;
  }
}

const inputClass =
  "mt-1.5 w-full rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 text-[15px] text-v2-ink outline-none focus:border-v2-primary";

export function V2FeedbackForm({
  token,
  bookTitle,
  limits,
}: {
  token: string;
  bookTitle: string | null;
  limits: { quote: number; name: number; relation: number };
}) {
  const [quote, setQuote] = useState("");
  const [firstName, setFirstName] = useState("");
  const [relation, setRelation] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.set("quote", quote);
      form.set("firstName", firstName);
      form.set("relation", relation);
      form.set("consent", consent ? "true" : "false");
      if (photo) form.set("photo", await shrink(photo), "photo.jpg");
      const res = await fetch(`/api/feedback?t=${encodeURIComponent(token)}`, { method: "POST", body: form });
      const body = (await res.json().catch(() => null)) as { error?: { message?: string } | null } | null;
      if (!res.ok) setError(body?.error?.message ?? "Something went wrong. Please try again.");
      else setDone(true);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <>
        <h1 className="v2-brand-title text-3xl tracking-tight">Thank you!</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-v2-navy">
          {consent ? "We read every one. If we share yours, it will be just as you wrote it." : "We read every one."}
        </p>
      </>
    );
  }

  return (
    <form onSubmit={submit}>
      <h1 className="v2-brand-title text-3xl tracking-tight">How did it go?</h1>
      <p className="mt-3 text-[15px] leading-relaxed text-v2-navy">
        {bookTitle ? `Tell us about “${bookTitle}”. ` : ""}A photo of the kids coloring and one line about it is all we need.
      </p>

      <label className="mt-8 block text-sm font-semibold text-v2-ink">
        One line about it
        <textarea
          required
          rows={3}
          maxLength={limits.quote}
          value={quote}
          onChange={(e) => setQuote(e.target.value)}
          className={inputClass}
          placeholder="What did the kids think?"
        />
      </label>

      <div className="mt-5 grid gap-5 sm:grid-cols-2">
        <label className="block text-sm font-semibold text-v2-ink">
          Your first name
          <input required maxLength={limits.name} value={firstName} onChange={(e) => setFirstName(e.target.value)} className={inputClass} />
        </label>
        <label className="block text-sm font-semibold text-v2-ink">
          Who you are to the kids
          <input
            maxLength={limits.relation}
            value={relation}
            onChange={(e) => setRelation(e.target.value)}
            className={inputClass}
            placeholder="Mom of two, grandpa"
          />
        </label>
      </div>

      <label className="mt-5 block text-sm font-semibold text-v2-ink">
        A photo of the kids coloring (optional)
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
          className="mt-1.5 block w-full text-sm text-v2-navy file:mr-3 file:rounded-full file:border-0 file:bg-v2-primary-light file:px-4 file:py-2 file:text-sm file:font-semibold file:text-v2-primary"
        />
      </label>

      <label className="mt-6 flex items-start gap-3 text-[15px] leading-relaxed text-v2-navy">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-1 h-4 w-4 shrink-0 accent-v2-primary" />
        <span>You may use my quote, first name and photo on the Colorful Memories website.</span>
      </label>

      {error ? <p className="mt-4 text-sm font-medium text-red-600">{error}</p> : null}

      <button type="submit" disabled={busy} className="v2-btn-primary mt-6 inline-flex items-center gap-2">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
        Send
      </button>
    </form>
  );
}
