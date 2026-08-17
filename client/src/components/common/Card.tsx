import type { HTMLAttributes } from "react";

export function Card({ className = "", ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`rounded-xl border border-[rgba(0,0,0,0.06)] bg-white shadow-sm dark:border-white/8 dark:bg-[#1c1e22] ${className}`}
      {...props}
    />
  );
}
