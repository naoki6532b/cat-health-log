import * as React from "react";

function cn(...classes: Array<string | undefined | false | null>) {
  return classes.filter(Boolean).join(" ");
}

export type BadgeProps = React.HTMLAttributes<HTMLSpanElement> & {
  variant?: "default" | "secondary" | "outline";
};

export function Badge({ className, variant = "default", ...props }: BadgeProps) {
  const base =
    "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium transition-colors";

  const styles =
    variant === "secondary"
      ? "bg-zinc-100 text-zinc-900"
      : variant === "outline"
      ? "border border-zinc-300 text-zinc-900"
      : "bg-zinc-900 text-white";

  return <span className={cn(base, styles, className)} {...props} />;
}
