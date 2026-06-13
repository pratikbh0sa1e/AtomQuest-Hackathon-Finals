import React from "react";

const shimmerStyle = {
  background:
    "linear-gradient(90deg, var(--muted) 25%, #ece9e4 37%, var(--muted) 63%)",
  backgroundSize: "400% 100%",
  animation: "shimmer 1.4s ease infinite",
};

export function SkeletonBlock({ className = "", style = {} }) {
  return (
    <div
      className={`rounded-lg ${className}`}
      style={{ ...shimmerStyle, ...style }}
    />
  );
}

export function SkeletonText({ lines = 3, className = "" }) {
  return (
    <div className={`space-y-2.5 ${className}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className="h-3.5 rounded"
          style={{
            ...shimmerStyle,
            width: i === lines - 1 ? "60%" : "100%",
          }}
        />
      ))}
    </div>
  );
}

export function SkeletonCard({ className = "" }) {
  return (
    <div
      className={`rounded-xl border p-5 ${className}`}
      style={{ borderColor: "var(--border)", background: "var(--card)" }}
    >
      <SkeletonBlock className="h-3 w-24 mb-3" />
      <SkeletonBlock className="h-8 w-16 mb-2" />
      <SkeletonBlock className="h-2.5 w-32" />
    </div>
  );
}

export function SkeletonRow({ cols = 5, className = "" }) {
  return (
    <tr className={className}>
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="py-3 pr-4 pl-4">
          <SkeletonBlock
            className="h-4"
            style={{ width: i === 1 ? "180px" : i === 0 ? "100px" : "60px" }}
          />
        </td>
      ))}
    </tr>
  );
}

export function SkeletonSessionCard({ className = "" }) {
  return (
    <div
      className={`rounded-xl border p-4 ${className}`}
      style={{
        borderColor: "var(--border)",
        background: "var(--card)",
        borderTop: "3px solid var(--border)",
      }}
    >
      <div className="flex justify-between items-center mb-3">
        <SkeletonBlock className="h-3 w-32" />
        <SkeletonBlock className="h-6 w-16 rounded-full" />
      </div>
      <SkeletonBlock className="h-3 w-48 mb-2" />
      <SkeletonBlock className="h-3 w-24" />
    </div>
  );
}
