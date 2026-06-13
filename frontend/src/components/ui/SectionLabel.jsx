import React from "react";

/**
 * SectionLabel — horizontal rule + centered IBM Plex Mono uppercase label in gold.
 * Pattern: <span rule /> <span label /> <span rule />
 */
export function SectionLabel({ children, className = "" }) {
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <span className="flex-1 h-px bg-[var(--border)]" aria-hidden="true" />
      <span
        className="
          font-mono text-xs font-medium uppercase tracking-widest
          text-[var(--accent)]
          whitespace-nowrap select-none
        "
        style={{ fontFamily: '"IBM Plex Mono", monospace' }}
      >
        {children}
      </span>
      <span className="flex-1 h-px bg-[var(--border)]" aria-hidden="true" />
    </div>
  );
}

export default SectionLabel;
