"use client";

import { useEffect, useState } from "react";
import { Check, X } from "lucide-react";
import * as api from "@/lib/api/client";
import { HEARD_FROM_DETAIL_MAX, HEARD_FROM_OPTIONS, type HeardFromAnswer } from "@/lib/marketing/heardFrom";
import { track } from "@/lib/track";

const DISMISSED_KEY = "cm_heard_from_dismissed";
/** How long the "Thanks!" note stays before it fades away on its own. */
const THANKS_MS = 4000;
const FADE_MS = 300;

function dismissedHere(): boolean {
  try {
    return localStorage.getItem(DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * "How did you hear about us?" on the signed-in home, until it's answered or skipped. One tap
 * answers; friend and other can add a short note. Optional: the X skips it for good.
 */
export function V2HeardFromCard() {
  const [show, setShow] = useState(false);
  const [picked, setPicked] = useState<HeardFromAnswer | null>(null);
  const [detail, setDetail] = useState("");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (dismissedHere()) return;
    let alive = true;
    void api.fetchHeardFrom().then((r) => {
      if (alive && !api.isError(r) && !r.data.answered) setShow(true);
    });
    return () => {
      alive = false;
    };
  }, []);

  // The thanks note pops off by itself after a few seconds.
  useEffect(() => {
    if (!done) return;
    const fade = window.setTimeout(() => setLeaving(true), THANKS_MS);
    return () => window.clearTimeout(fade);
  }, [done]);

  useEffect(() => {
    if (!leaving) return;
    const hide = window.setTimeout(() => setShow(false), FADE_MS);
    return () => window.clearTimeout(hide);
  }, [leaving]);

  async function save(answer: HeardFromAnswer, note = "") {
    setSaving(true);
    const r = await api.saveHeardFrom(answer, note);
    setSaving(false);
    try {
      localStorage.setItem(DISMISSED_KEY, "1");
    } catch {
      /* storage blocked: the server answer still hides it next time */
    }
    if (api.isError(r)) {
      setShow(false);
      return;
    }
    if (answer !== "skipped") track("heard_from", { answer });
    if (answer === "skipped") setShow(false);
    else setDone(true);
  }

  if (!show) return null;

  if (done) {
    return (
      <section
        className={`v2-panel flex items-center gap-3 py-2 pl-4 pr-2 transition-opacity duration-300 ${
          leaving ? "opacity-0" : "opacity-100"
        }`}
        aria-live="polite"
      >
        <Check className="h-5 w-5 shrink-0 text-v2-primary" aria-hidden />
        <p className="flex-1 text-sm text-v2-ink">Thanks! That helps us find more families like yours.</p>
        <button
          type="button"
          onClick={() => setShow(false)}
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-v2-muted hover:bg-gray-100"
          aria-label="Close"
        >
          <X className="h-5 w-5" aria-hidden />
        </button>
      </section>
    );
  }

  const pickedOption = HEARD_FROM_OPTIONS.find((o) => o.id === picked);
  const needsDetail = pickedOption && "detail" in pickedOption;

  return (
    <section className="v2-panel relative p-4 sm:p-5" aria-labelledby="heard-from-title">
      <button
        type="button"
        onClick={() => void save("skipped")}
        disabled={saving}
        className="absolute right-2 top-2 inline-flex h-11 w-11 items-center justify-center rounded-full text-v2-muted hover:bg-gray-100"
        aria-label="Skip this question"
      >
        <X className="h-5 w-5" aria-hidden />
      </button>
      <h2 id="heard-from-title" className="pr-10 text-base font-semibold text-v2-ink">
        Quick question: how did you hear about us?
      </h2>
      <p className="mt-0.5 text-sm text-v2-muted">One tap. It helps a small business know what&apos;s working.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {HEARD_FROM_OPTIONS.map((o) => (
          <button
            key={o.id}
            type="button"
            disabled={saving}
            aria-pressed={picked === o.id}
            onClick={() => {
              if ("detail" in o) setPicked(o.id);
              else void save(o.id);
            }}
            className={`min-h-11 rounded-full border px-3.5 text-sm font-medium transition ${
              picked === o.id
                ? "border-v2-primary bg-v2-primary-light text-v2-ink"
                : "border-gray-200 bg-white text-v2-ink hover:border-v2-primary/50"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
      {needsDetail && picked ? (
        <form
          className="mt-3 flex flex-col gap-2 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            void save(picked, detail);
          }}
        >
          <label className="sr-only" htmlFor="heard-from-detail">
            {pickedOption.detail}
          </label>
          <input
            id="heard-from-detail"
            value={detail}
            onChange={(e) => setDetail(e.target.value.slice(0, HEARD_FROM_DETAIL_MAX))}
            placeholder={pickedOption.detail}
            className="min-h-11 flex-1 rounded-xl border border-gray-200 px-3 text-base"
            autoFocus
          />
          <button type="submit" disabled={saving} className="v2-btn-primary min-h-11 px-5">
            Send
          </button>
        </form>
      ) : null}
    </section>
  );
}
