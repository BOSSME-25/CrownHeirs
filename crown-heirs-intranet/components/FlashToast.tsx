"use client";

import { Suspense, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

function FlashToastInner() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const ok = params.get("ok");
  const err = params.get("err");
  const msg = ok ?? err;
  const isError = !!err && !ok;
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!msg) return;
    setVisible(true);
    // Errors linger a little longer so they're easy to read.
    const hide = setTimeout(() => setVisible(false), isError ? 6000 : 3500);
    // Strip ?ok/?err from the URL so a refresh won't re-show it.
    const clean = setTimeout(() => {
      const sp = new URLSearchParams(Array.from(params.entries()));
      sp.delete("ok");
      sp.delete("err");
      const qs = sp.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    }, (isError ? 6000 : 3500) + 300);
    return () => {
      clearTimeout(hide);
      clearTimeout(clean);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [msg]);

  if (!msg || !visible) return null;
  return (
    <div
      className="flash-toast"
      role="status"
      aria-live="polite"
      style={isError ? { background: "#a0392a", color: "#fff" } : undefined}
    >
      <span className="flash-toast-check">{isError ? "⚠" : "✓"}</span> {msg}
    </div>
  );
}

export default function FlashToast() {
  return (
    <Suspense fallback={null}>
      <FlashToastInner />
    </Suspense>
  );
}
