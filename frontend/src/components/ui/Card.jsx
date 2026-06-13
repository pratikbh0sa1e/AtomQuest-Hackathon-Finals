import React from "react";

/**
 * Card component with optional gold accent top border and hover effect.
 *
 * Props:
 *   accentTop   — adds a 2px gold top border (uses --accent color)
 *   hoverEffect — enables border + shadow transition on hover
 *   className   — additional classes
 *   children    — card content
 */
export function Card({
  accentTop = false,
  hoverEffect = false,
  className = "",
  children,
  ...props
}) {
  const base =
    "bg-[var(--card)] border border-[var(--border)] rounded-lg shadow-sm " +
    "transition-all duration-200";

  const accentTopCls = accentTop ? "border-t-2 border-t-[var(--accent)]" : "";

  const hoverCls = hoverEffect
    ? "hover:border-[var(--accent)]/40 hover:shadow-md"
    : "";

  return (
    <div
      className={`${base} ${accentTopCls} ${hoverCls} ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}

export default Card;
