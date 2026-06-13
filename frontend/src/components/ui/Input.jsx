import React from "react";

/**
 * Input component — h-12, rounded-md, transparent bg.
 * Focus state shifts border to --accent with ring.
 */
export function Input({ className = "", type = "text", ...props }) {
  const base =
    "w-full h-12 px-4 " +
    "bg-transparent " +
    "border border-[var(--border)] rounded-md " +
    "text-[var(--foreground)] text-sm " +
    "placeholder:text-[var(--muted-foreground)] " +
    "transition-all duration-150 " +
    "focus:outline-none " +
    "focus:border-[var(--accent)] " +
    "focus:ring-2 focus:ring-[var(--ring)] focus:ring-offset-2 " +
    "disabled:opacity-50 disabled:cursor-not-allowed";

  return <input type={type} className={`${base} ${className}`} {...props} />;
}

export default Input;
