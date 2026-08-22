import { cn } from "@/lib/cn";
import { SmartyAvatar } from "@/components/SmartyAvatar";
import type { ChatMessage } from "@/lib/session/types";

type ChatBubbleProps = {
  message: ChatMessage;
  /** Float-up entrance for new Smarty replies only. */
  animateEnter?: boolean;
};

export function ChatBubble({ message, animateEnter = false }: ChatBubbleProps) {
  const isSmarty = message.role === "smarty";

  return (
    <article
      className={cn(
        "flex max-w-[min(36rem,90%)] flex-col gap-1.5",
        isSmarty ? "items-start self-start" : "items-end self-end",
        isSmarty && animateEnter && "chat-bubble-smarty-enter",
      )}
      aria-label={isSmarty ? "Smarty" : "You"}
    >
      <div
        className={cn(
          "flex items-center gap-2",
          isSmarty ? "flex-row" : "flex-row-reverse",
        )}
      >
        {isSmarty ? (
          <SmartyAvatar variant="chat" />
        ) : (
          <span
            className="size-7 shrink-0 rounded-full border-2 border-ink bg-user-label"
            aria-hidden
          />
        )}
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
