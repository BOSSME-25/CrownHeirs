import type { CSSProperties } from "react";

export type PillTone = "warn" | "bad" | "ok" | "info";

const toneStyle: Record<PillTone, CSSProperties> = {
  warn: { background: "#fdf3e0", color: "#9a6a1a", border: "1px solid #f0d9a8" },
  bad: { background: "#fbe9e7", color: "#a0392a", border: "1px solid #f0c1b8" },
  ok: { background: "#eaf3e6", color: "#3f6b34", border: "1px solid #cfe3c4" },
  info: { background: "#e8eef7", color: "#2f5c8f", border: "1px solid #c3d4ea" },
};

// Small rounded status pill used for credential and acknowledgment states.
export default function StatusPill({ label, tone }: { label: string; tone: PillTone }) {
  return (
    <span
      style={{
        ...toneStyle[tone],
        display: "inline-block",
        padding: "2px 9px",
        borderRadius: 999,
        fontSize: "0.74rem",
        fontWeight: 600,
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </span>
  );
}
