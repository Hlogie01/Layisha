import { cx } from "@/components/ui";
import { formatChatTime, type ChatMessage } from "@/lib/chat";

/** One chat bubble, used by both the dashboard and the driver app. */
export function ChatBubble({
  message,
  mine,
  onRetry,
}: {
  message: ChatMessage;
  mine: boolean;
  onRetry?: () => void;
}) {
  const readByOther = mine
    ? message.sender_type === "dispatcher"
      ? message.read_by_driver_at
      : message.read_by_dispatch_at
    : null;

  return (
    <div className={cx("flex", mine ? "justify-end" : "justify-start")}>
      <div
        className={cx(
          "max-w-[85%] rounded-2xl px-3.5 py-2.5 text-[15px] leading-snug",
          mine ? "rounded-br-md bg-ink text-chalk" : "rounded-bl-md border border-line bg-white text-ink",
          message.failed && "ring-2 ring-signal",
        )}
      >
        {message.is_broadcast ? (
          <p className={cx("mb-1 text-xs font-semibold", mine ? "text-hivis" : "text-hivis-ink")}>
            Broadcast to all drivers
          </p>
        ) : null}
        {message.order_reference ? (
          <p
            className={cx(
              "mb-1 inline-flex rounded-md px-1.5 py-0.5 text-xs font-semibold",
              mine ? "bg-ink-2 text-hivis" : "bg-hivis-soft text-hivis-ink",
            )}
          >
            {message.order_reference}
          </p>
        ) : null}
        <p className="whitespace-pre-wrap break-words">{message.body}</p>
        <p
          className={cx(
            "mt-1 flex items-center justify-end gap-1 text-[11px]",
            mine ? "text-chalk/70" : "text-kerb",
          )}
        >
          <time dateTime={message.created_at}>{formatChatTime(message.created_at)}</time>
          {mine ? (
            message.failed ? (
              <button type="button" onClick={onRetry} className="font-semibold text-hivis underline">
                Not sent · retry
              </button>
            ) : message.pending ? (
              <span>· Sending…</span>
            ) : (
              <Ticks read={Boolean(readByOther)} />
            )
          ) : null}
        </p>
      </div>
    </div>
  );
}

function Ticks({ read }: { read: boolean }) {
  return (
    <span className={cx("inline-flex items-center", read ? "text-hivis" : "")}>
      <svg width="16" height="11" viewBox="0 0 16 11" role="img" aria-label={read ? "Read" : "Sent"}>
        <path d="M1 6l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        {read ? (
          <path d="M6 9l1 0.5 7-8" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        ) : null}
      </svg>
    </span>
  );
}

export function UnreadBadge({ count, className }: { count: number; className?: string }) {
  if (!count) return null;
  return (
    <span
      className={cx(
        "inline-flex min-w-5 items-center justify-center rounded-full bg-hivis px-1.5 text-xs font-bold text-ink",
        className,
      )}
      aria-label={`${count} unread`}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}
