import { useState } from "react";

import { cn } from "@/lib/utils";

// lucide "Maximize" (corner brackets pointing out) and "Minimize" (pointing in)
const MAXIMIZE_PATHS = [
  "M8 3H5a2 2 0 0 0-2 2v3",
  "M21 8V5a2 2 0 0 0-2-2h-3",
  "M3 16v3a2 2 0 0 0 2 2h3",
  "M16 21h3a2 2 0 0 0 2-2v-3",
];
const MINIMIZE_PATHS = [
  "M8 3v3a2 2 0 0 1-2 2H3",
  "M21 8h-3a2 2 0 0 1-2-2V3",
  "M3 16h3a2 2 0 0 1 2 2v3",
  "M16 21v-3a2 2 0 0 1 2-2h3",
];
// Per-corner hover offset (top-left, top-right, bottom-left, bottom-right).
const OFFSETS = [
  [-2, -2],
  [2, -2],
  [-2, 2],
  [2, 2],
];

/**
 * Animated maximize / normalize toggle — the four corner brackets ease outward
 * (maximize) or inward (normalize) on hover. Mirrors gorm.ai's animated icon.
 */
export function MaximizeToggle({
  maximized,
  onToggle,
  className,
}: {
  maximized: boolean;
  onToggle: () => void;
  className?: string;
}) {
  const [hover, setHover] = useState(false);
  const paths = maximized ? MINIMIZE_PATHS : MAXIMIZE_PATHS;
  const sign = maximized ? -1 : 1;

  return (
    <button
      type="button"
      onClick={onToggle}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      aria-label={maximized ? "Normalize" : "Maximize"}
      title={maximized ? "Normalize" : "Maximize"}
      className={cn(
        "flex items-center text-muted-foreground transition-colors hover:text-foreground",
        className,
      )}
    >
      <svg
        width={16}
        height={16}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {paths.map((d, i) => (
          <path
            key={i}
            d={d}
            style={{
              transform: hover
                ? `translate(${OFFSETS[i][0] * sign}px, ${OFFSETS[i][1] * sign}px)`
                : "translate(0, 0)",
              transition: "transform 0.3s ease-in-out",
            }}
          />
        ))}
      </svg>
    </button>
  );
}
