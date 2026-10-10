"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AlertCircle, Check, Info, X } from "lucide-react";
import { cn } from "@/lib/cn";

export type V2ToastVariant = "success" | "error" | "info";

export type V2ToastInput = {
  title?: string;
  message: string;
  variant?: V2ToastVariant;
  durationMs?: number;
};

type V2ToastItem = V2ToastInput & {
  id: string;
  variant: V2ToastVariant;
};

type V2ToastContextValue = {
  show: (toast: V2ToastInput) => void;
  success: (toast: Omit<V2ToastInput, "variant">) => void;
  error: (message: string, title?: string) => void;
  info: (message: string, title?: string) => void;
};

const V2ToastContext = createContext<V2ToastContextValue | null>(null);

const DEFAULT_DURATION_MS = 5200;

function newToastId() {
  return crypto.randomUUID();
}

export function V2ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<V2ToastItem[]>([]);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  );

  const dismiss = useCallback((id: string) => {
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const show = useCallback(
    (input: V2ToastInput) => {
      const id = newToastId();
      const item: V2ToastItem = {
        id,
        title: input.title,
        message: input.message,
        variant: input.variant ?? "info",
        durationMs: input.durationMs ?? DEFAULT_DURATION_MS,
      };

      setToasts((current) => [...current.slice(-2), item]);

      const timer = setTimeout(() => dismiss(id), item.durationMs);
      timersRef.current.set(id, timer);
    },
    [dismiss],
  );

  const value: V2ToastContextValue = {
    show,
    success: (toast) => show({ ...toast, variant: "success" }),
    error: (message, title) =>
      show({ message, title, variant: "error" }),
    info: (message, title) => show({ message, title, variant: "info" }),
  };

  useEffect(
    () => () => {
      for (const timer of timersRef.current.values()) clearTimeout(timer);
      timersRef.current.clear();
    },
    [],
  );

  return (
    <V2ToastContext.Provider value={value}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 top-[4.25rem] z-[60] flex flex-col items-center gap-2 px-4 sm:items-end sm:px-6 lg:top-4 lg:right-8 lg:left-auto xl:right-10"
        aria-live="polite"
        aria-relevant="additions"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role="status"
            className={cn(
              "pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-xl border px-4 py-3 shadow-lg shadow-slate-900/10",
              toast.variant === "success" &&
                "border-v2-success-border bg-v2-success-bg text-emerald-950",
              toast.variant === "error" &&
                "border-rose-200 bg-rose-50 text-rose-950",
              toast.variant === "info" &&
                "border-gray-200 bg-white text-v2-ink",
            )}
          >
            <span className="mt-0.5 shrink-0" aria-hidden>
              {toast.variant === "success" ? (
                <Check className="h-5 w-5 text-emerald-600" strokeWidth={2.5} />
              ) : toast.variant === "error" ? (
                <AlertCircle className="h-5 w-5 text-rose-600" />
              ) : (
                <Info className="h-5 w-5 text-v2-primary" />
              )}
            </span>
            <div className="min-w-0 flex-1">
              {toast.title ? (
                <p
                  className={cn(
                    "text-sm font-semibold",
                    toast.variant === "success" && "text-v2-success-text",
                    toast.variant === "error" && "text-rose-900",
                  )}
                >
                  {toast.title}
                </p>
              ) : null}
              <p
                className={cn(
                  "text-sm leading-snug",
                  toast.title && "mt-0.5",
                  !toast.title && "font-medium",
                  toast.variant === "success" && "text-emerald-800/90",
                  toast.variant === "error" && "text-rose-800",
                  toast.variant === "info" && "text-v2-muted",
                )}
              >
                {toast.message}
              </p>
            </div>
            <button
              type="button"
              onClick={() => dismiss(toast.id)}
              className="shrink-0 rounded-lg p-1 text-v2-muted transition hover:bg-black/5 hover:text-v2-ink"
              aria-label="Dismiss notification"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </V2ToastContext.Provider>
  );
}

export function useV2Toast() {
  const context = useContext(V2ToastContext);
  if (!context) {
    throw new Error("useV2Toast must be used within V2ToastProvider");
  }
  return context;
}
