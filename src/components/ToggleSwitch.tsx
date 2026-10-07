import { cn } from "@/lib/cn";

type ToggleSwitchProps = {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
};

export function ToggleSwitch({ label, checked, onChange }: ToggleSwitchProps) {
  return (
    <label className="flex items-center justify-between gap-4 font-body text-base font-bold text-ink">
      <span>{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          "flex h-8 w-[52px] shrink-0 items-center rounded-full border-2 border-ink p-1",
          checked ? "justify-end bg-crayon-lime" : "justify-start bg-paper",
        )}
      >
        <span className="block size-[22px] rounded-full border-2 border-ink bg-white" />
      </button>
    </label>
  );
}
