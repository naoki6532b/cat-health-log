import * as React from "react";
import { cn } from "@/lib/utils";

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "w-full rounded-2xl border bg-white px-3 py-2.5 text-sm outline-none shadow-sm",
        "focus:ring-4 focus:ring-zinc-900/10",
        className
      )}
      {...props}
    />
  );
}

export function Select({ className, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "w-full rounded-2xl border bg-white px-3 py-2.5 text-sm outline-none shadow-sm",
        "focus:ring-4 focus:ring-zinc-900/10",
        className
      )}
      {...props}
    />
  );
}

export function Textarea({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        "w-full rounded-2xl border bg-white px-3 py-2.5 text-sm outline-none shadow-sm",
        "focus:ring-4 focus:ring-zinc-900/10",
        className
      )}
      {...props}
    />
  );
}
