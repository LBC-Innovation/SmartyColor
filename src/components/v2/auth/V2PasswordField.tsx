"use client";

import { useId, useState, type ReactNode } from "react";
import { Eye, EyeOff } from "lucide-react";

type V2PasswordFieldProps = {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: "current-password" | "new-password";
  enterKeyHint?: "next" | "go";
  minLength?: number;
  /** Shown beside the label, e.g. a "Forgot password?" link. */
  labelAside?: ReactNode;
  /** The password rule, shown under the field and read out with it. */
  hint?: string;
  autoFocus?: boolean;
  /** The field has an error; `errorId` is the element that explains it. */
  invalid?: boolean;
  errorId?: string;
};

/** A password input with a show/hide button (a real button that never submits the form). */
export function V2PasswordField({
  id,
  label,
  value,
  onChange,
  autoComplete,
  enterKeyHint,
  minLength,
  labelAside,
  hint,
  autoFocus,
  invalid,
  errorId,
}: V2PasswordFieldProps) {
  const [visible, setVisible] = useState(false);
  const hintId = useId();

  return (
    // Grid so the aside link sits beside the label on screen but comes after the field in tab order.
    <div className="grid grid-cols-[1fr_auto] items-center gap-x-3">
      <label className="v2-label col-start-1 row-start-1 !mb-0 py-1.5" htmlFor={id}>
        {label}
      </label>
      <div className="relative col-span-2 row-start-2">
        <input
          name="password"
          id={id}
          type={visible ? "text" : "password"}
          required
          minLength={minLength}
          autoComplete={autoComplete}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint={enterKeyHint}
          autoFocus={autoFocus}
          aria-invalid={invalid ? true : undefined}
          aria-describedby={[hint ? hintId : null, invalid ? errorId : null].filter(Boolean).join(" ") || undefined}
          className="v2-input pr-12"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-pressed={visible}
          aria-label="Show password"
          className="absolute inset-y-0 right-0 inline-flex w-11 items-center justify-center rounded-r-xl text-v2-muted transition hover:text-v2-ink focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-v2-primary"
        >
          {visible ? <EyeOff className="h-5 w-5" aria-hidden /> : <Eye className="h-5 w-5" aria-hidden />}
        </button>
      </div>
      {labelAside ? <div className="col-start-2 row-start-1 justify-self-end">{labelAside}</div> : null}
      {hint ? (
        <p id={hintId} className="col-span-2 mt-1.5 text-xs text-v2-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
