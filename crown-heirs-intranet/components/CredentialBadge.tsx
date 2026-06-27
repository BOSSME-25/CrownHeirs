import type { CredState } from "@/lib/credentials-constants";
import StatusPill from "@/components/StatusPill";

// Small rounded status pill for a credential's state.
export default function CredentialBadge({ s }: { s: CredState }) {
  return <StatusPill label={s.label} tone={s.tone} />;
}
