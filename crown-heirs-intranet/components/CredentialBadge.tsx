import type { CSSProperties } from "react";
import type { CredState } from "@/lib/credentials-constants";

const toneStyle: Record<CredState["tone"], CSSProperties> = {
  warn: { background: "#fdf3e0", color: "#9a6a1a", border: "1px solid #f0d9a8" },
  bad: { background: "#fbe9e7", color: "#a0392a", border: "1px solid #f0c1b8" },
  ok: { background: "#eaf3e6", color: "#3f6b34", border: "1px solid #cfe3c4" },
  info: { background: "#e8eef7", color: "#2f5c8f", border: "1px solid #c3d4ea" },
};

// Small rounded status pill for a credential's state.
export default function CredentialBadge({ s }: { s: CredState }) {
  return (
    <span
      style={{
        ...toneStyle[s.tone],
        display: "inline-block",
        padding: "2px 9px",
        borderRadius: 999,
        fontSize: "0.74rem",
        fontWeight: 600,
        whiteSpace: "nowrap",
      }}
    >
      {s.label}
    </span>
  );
}
