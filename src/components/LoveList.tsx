import type { LikedTrait } from "@/lib/session/types";

type LoveListProps = {
  likes: LikedTrait[];
  onChange: (id: string, text: string) => void;
  onRemove: (id: string) => void;
};

export function LoveList({ likes, onChange, onRemove }: LoveListProps) {
  return (
    <aside className="flex h-full flex-col gap-3 rounded-(--radius-card) border-[3px] border-ink bg-paper-sky p-5 shadow-crayon">
      <h2 className="font-display text-xl font-bold text-ink">We love this!</h2>
      <p className="font-body text-sm text-ink-soft">
        Keep this list. You can edit any item.
      </p>
      <ul className="flex flex-1 flex-col gap-2">
        {likes.length === 0 ? (
          <li className="rounded-2xl border-2 border-dashed border-ink/40 px-3 py-4 font-body text-sm text-ink-soft">
            Tap Yay on ideas you like. They will show up here.
          </li>
        ) : (
          likes.map((like) => (
            <li
              key={like.id}
              className="flex items-center gap-2 rounded-2xl border-2 border-ink bg-paper px-3 py-2"
            >
              <span aria-hidden className="text-like">
                ♥
              </span>
              <input
                value={like.text}
                onChange={(event) => onChange(like.id, event.target.value)}
                className="min-w-0 flex-1 bg-transparent font-body text-base font-bold text-ink outline-none"
              />
              <button
                type="button"
                onClick={() => onRemove(like.id)}
                className="font-display text-sm text-ink-soft"
              >
                Remove
              </button>
            </li>
          ))
        )}
      </ul>
    </aside>
  );
}
