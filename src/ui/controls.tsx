/** Small instrument controls: section, segmented control, button, field, toggle, readout. */

import { useState, type ReactNode } from "react";
import { cn } from "../lib/cn";
import { IconChevron } from "./icons";

export function Section({
  title,
  children,
  defaultOpen = true,
  aside,
}: {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
  aside?: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const id = `section-${title.toLowerCase().replace(/\W+/g, "-")}`;
  return (
    <section className="border-b border-edge">
      <div className="flex h-8 items-center gap-2 px-3">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen(!open)}
          className="flex flex-1 items-center gap-1.5 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-muted hover:text-ink"
        >
          <IconChevron open={open} />
          {title}
        </button>
        {aside}
      </div>
      {open && (
        <div id={id} className="flex flex-col gap-2 px-3 pb-3">
          {children}
        </div>
      )}
    </section>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
  disabled,
}: {
  value: T;
  options: { value: T; label: string; title?: string }[];
  onChange: (v: T) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex h-7 rounded-md border border-edge bg-bg p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          title={o.title}
          disabled={disabled}
          onClick={() => onChange(o.value)}
          className={cn(
            "flex-1 rounded-[4px] px-2 text-[11px] font-medium disabled:opacity-40",
            value === o.value ? "bg-raised text-accent" : "text-muted hover:text-ink",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Button({
  children,
  onClick,
  tone = "default",
  disabled,
  title,
  pressed,
  className,
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  tone?: "default" | "accent" | "danger";
  disabled?: boolean;
  title?: string;
  pressed?: boolean;
  className?: string;
  type?: "button" | "submit";
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-pressed={pressed}
      className={cn(
        "h-7 rounded-md border px-2.5 text-[11px] font-medium disabled:cursor-not-allowed disabled:opacity-40",
        tone === "default" && "border-edge bg-raised text-ink hover:border-muted/60",
        tone === "accent" && "border-accent/50 bg-accent/10 text-accent hover:bg-accent/20",
        tone === "danger" && "border-danger/60 bg-danger/15 text-danger hover:bg-danger/25",
        pressed && "border-accent/60 text-accent",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] text-muted">{label}</span>
      {children}
      {hint && <span className="text-[10px] text-muted/80">{hint}</span>}
    </label>
  );
}

export const inputClass =
  "h-7 w-full rounded-md border border-edge bg-bg px-2 font-mono text-[11px] text-ink placeholder:text-muted/60 focus:border-accent/60 focus:outline-none disabled:opacity-50";

export function Toggle({
  label,
  checked,
  onChange,
  title,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  title?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      title={title}
      onClick={() => onChange(!checked)}
      className="flex h-7 items-center justify-between gap-2 rounded-md border border-edge bg-bg px-2 text-[11px] text-ink hover:border-muted/60"
    >
      <span>{label}</span>
      <span className={cn("relative h-3.5 w-6 rounded-full", checked ? "bg-accent/70" : "bg-edge")}>
        <span
          className={cn(
            "absolute top-0.5 h-2.5 w-2.5 rounded-full bg-ink transition-[left]",
            checked ? "left-3" : "left-0.5",
          )}
        />
      </span>
    </button>
  );
}

export function Readout({ label, value, tone }: { label: string; value: string; tone?: "ok" | "warn" | "danger" | "accent" | "muted" }) {
  return (
    <div className="flex min-w-0 flex-col rounded-md border border-edge bg-bg px-2 py-1">
      <span className="text-[10px] uppercase tracking-[0.08em] text-muted">{label}</span>
      <span
        className={cn(
          "truncate font-mono text-[12px] text-ink",
          tone === "ok" && "text-ok",
          tone === "warn" && "text-warn",
          tone === "danger" && "text-danger",
          tone === "accent" && "text-accent",
          tone === "muted" && "text-muted",
        )}
      >
        {value}
      </span>
    </div>
  );
}
