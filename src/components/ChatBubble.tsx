import { cn } from "@/lib/cn";
import type { ChatMessage } from "@/lib/session/types";

type ChatBubbleProps = {
  message: ChatMessage;
};

export function ChatBubble({ message }: ChatBubbleProps) {
  const isSmarty = message.role === "smarty";

  return (
    <article
      className={cn(
        "flex max-w-[min(36rem,90%)] flex-col gap-1.5",
        isSmarty ? "items-start self-start" : "items-end self-end",
      )}
      aria-label={isSmarty ? "Smarty" : "You"}
    >
      <div
        className={cn(
          "flex items-center gap-2",
          isSmarty ? "flex-row" : "flex-row-reverse",
        )}
      >
        <span
          className={cn(
            "size-7 rounded-full border-2 border-ink",
            isSmarty ? "bg-smarty-label" : "bg-user-label",
          )}
          aria-hidden
        />
        <p
          className={cn(
            "font-display text-sm font-semibold",
            isSmarty ? "text-smarty-label" : "text-user-label",
          )}
        >
          {isSmarty ? "Smarty" : "You"}
        </p>
      </div>
      <div
        className={cn(
          "rounded-[1.25rem] border-2 border-ink px-4 py-3 font-body text-lg leading-snug text-ink",
          isSmarty ? "bg-smarty" : "bg-user",
        )}
      >
        {message.text}
      </div>
    </article>
  );
}
