import type { ComponentProps, ReactNode } from "react";

export function cx(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

export function Button({
  variant = "primary",
  className,
  ...props
}: ComponentProps<"button"> & { variant?: "primary" | "secondary" | "dark" | "ghost" }) {
  return (
    <button
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60",
        variant === "primary" && "bg-hivis text-ink hover:bg-hivis-dark",
        variant === "secondary" &&
          "border border-line bg-white text-ink hover:bg-chalk",
        variant === "dark" && "bg-ink text-chalk hover:bg-ink-2",
        variant === "ghost" && "text-kerb hover:bg-line/60",
        className,
      )}
      {...props}
    />
  );
}

const fieldClass =
  "w-full rounded-[10px] border border-line bg-white px-3 py-2.5 text-base text-ink placeholder:text-stone-400 focus:border-ink focus:outline-none focus:ring-2 focus:ring-hivis";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cx(fieldClass, className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cx(fieldClass, "min-h-20", className)} {...props} />;
}

export function Select({ className, ...props }: ComponentProps<"select">) {
  return <select className={cx(fieldClass, className)} {...props} />;
}

export function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-sm font-medium text-ink">
        {label}
      </label>
      {children}
      {error ? (
        <p className="text-sm text-signal">{error}</p>
      ) : hint ? (
        <p className="text-sm text-kerb">{hint}</p>
      ) : null}
    </div>
  );
}

export function Card({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cx("rounded-[20px] border border-line bg-white p-5", className)}
      {...props}
    />
  );
}

export function FormMessage({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-lg bg-signal-soft px-3 py-2 text-sm text-signal">
      {message}
    </p>
  );
}

/** The Layisha mark: a bold L with road-marking chevrons on a safety-amber tile. */
export function LogoMark({
  size = 32,
  label,
  className,
}: {
  size?: number;
  label?: string;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      className={className}
      {...(label ? { role: "img", "aria-label": label } : { "aria-hidden": true })}
    >
      <rect width="64" height="64" rx="14" fill="#FFB020" />
      <polygon points="14,12 26,12 26,40 50,40 50,52 14,52" fill="#14181F" />
      <polygon points="34,12 41,12 33,30 26,30" fill="#14181F" />
      <polygon points="45,12 52,12 44,30 37,30" fill="#14181F" />
    </svg>
  );
}

export function Logo({
  size = "md",
  inverted = false,
  className,
}: {
  size?: "sm" | "md" | "lg";
  inverted?: boolean;
  className?: string;
}) {
  const mark = size === "lg" ? 44 : size === "sm" ? 26 : 32;
  const text = size === "lg" ? "text-3xl" : size === "sm" ? "text-lg" : "text-xl";
  return (
    <span className={cx("inline-flex items-center gap-2.5", className)}>
      <LogoMark size={mark} />
      <span
        className={cx(
          "font-display font-bold tracking-tight",
          text,
          inverted ? "text-chalk" : "text-ink",
        )}
      >
        Layisha
      </span>
    </span>
  );
}
