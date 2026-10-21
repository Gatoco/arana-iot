/** Inline SVG icons (no icon library). Decorative: callers provide aria-labels. */

type P = { className?: string };

const base = {
  width: 12,
  height: 12,
  viewBox: "0 0 12 12",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.2,
  "aria-hidden": true,
} as const;

export const IconMinimize = ({ className }: P) => (
  <svg {...base} className={className}>
    <path d="M2 6.5h8" />
  </svg>
);

export const IconMaximize = ({ className }: P) => (
  <svg {...base} className={className}>
    <rect x="2.5" y="2.5" width="7" height="7" />
  </svg>
);

export const IconRestore = ({ className }: P) => (
  <svg {...base} className={className}>
    <rect x="2" y="4" width="6" height="6" />
    <path d="M4 4V2h6v6H8" />
  </svg>
);

export const IconClose = ({ className }: P) => (
  <svg {...base} className={className}>
    <path d="M2.5 2.5l7 7M9.5 2.5l-7 7" />
  </svg>
);

export const IconChevron = ({ className, open }: P & { open: boolean }) => (
  <svg {...base} className={className} style={{ transform: open ? "rotate(90deg)" : undefined, transition: "transform 140ms" }}>
    <path d="M4.5 2.5L8 6l-3.5 3.5" />
  </svg>
);

export const IconPanel = ({ className }: P) => (
  <svg {...base} className={className}>
    <rect x="1.5" y="2" width="9" height="8" />
    <path d="M7 2v8" />
  </svg>
);

/** Minimal top-view glyph of the four-legged kit (body + four splayed legs). */
export const IconMark = ({ className }: P) => (
  <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden className={className}>
    <rect x="4" y="3.5" width="4" height="5" rx="0.6" fill="currentColor" />
    <path d="M4 4L1.2 1.6M8 4l2.8-2.4M4 8l-2.8 2.4M8 8l2.8 2.4" stroke="currentColor" strokeWidth="1.2" />
  </svg>
);
