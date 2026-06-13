import React from "react";

/**
 * Button component with primary, secondary, and ghost variants.
 * All variants meet minimum 44px touch target requirement.
 */
const variantClasses = {
  primary:
    "bg-[var(--accent)] text-[var(--accent-foreground)] border border-[var(--accent)] " +
    "hover:bg-[var(--accent-secondary)] hover:border-[var(--accent-secondary)] " +
    "active:scale-[0.98]",
  secondary:
    "bg-transparent text-[var(--accent)] border border-[var(--accent)] " +
    "hover:bg-[var(--accent)]/10 " +
    "active:scale-[0.98]",
  ghost:
    "bg-transparent text-[var(--foreground)] border border-transparent " +
    "hover:bg-[var(--muted)] hover:text-[var(--accent)] " +
    "active:scale-[0.98]",
  destructive:
    "bg-red-600 text-white border border-red-600 " +
    "hover:bg-red-700 hover:border-red-700 " +
    "active:scale-[0.98]",
};

export function Button({
  variant = "primary",
  className = "",
  disabled = false,
  children,
  type = "button",
  ...props
}) {
  const base =
    "inline-flex items-center justify-center gap-2 " +
    "min-h-[44px] px-5 py-2 " +
    "rounded-md font-medium text-sm " +
    "touch-manipulation " +
    "transition-all duration-200 " +
    "focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 " +
    "disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none " +
    "select-none cursor-pointer";

  const variantCls = variantClasses[variant] ?? variantClasses.primary;

  return (
    <button
      type={type}
      disabled={disabled}
      className={`${base} ${variantCls} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export default Button;
