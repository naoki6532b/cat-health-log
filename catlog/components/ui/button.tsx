import * as React from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "danger";

export function Button({
  className,
  variant = "primary",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-medium transition active:scale-[0.99] disabled:opacity-50 disabled:pointer-events-none";
  const variants: Record<Variant, string> = {
    primary:
      "bg-zinc-900 text-white shadow-sm hover:bg-zinc-800 focus:outline-none focus:ring-4 focus:ring-zinc-900/10",
    secondary:
      "border bg-white text-zinc-900 hover:bg-zinc-50 shadow-sm focus:outline-none focus:ring-4 focus:ring-zinc-900/10",
    ghost: "text-zinc-700 hover:bg-zinc-100/70",
    danger:
      "bg-red-600 text-white shadow-sm hover:bg-red-500 focus:outline-none focus:ring-4 focus:ring-red-600/15",
  };

  return <button className={cn(base, variants[variant], className)} {...props} />;
}
