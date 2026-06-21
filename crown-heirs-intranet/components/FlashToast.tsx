"use client";

import { Suspense, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

function FlashToastInner() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const msg = params.get("ok");
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!msg) return;
    setVisible(true);
    const hide = setTimeout(() => setVisible(false), 3500);
    // Strip ?ok from the URL so a refresh won't re-show it.
    const clean = setTimeout(() => {
      const sp = new URLSearchParams(Array.from(params.entries()));
      sp.delete("ok");
      const qs = sp.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    }, 3800);
    return () => {
      clearTimeout(hide);
      clearTimeout(clean);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [msg]);

  if (!msg || !visible) return null;
  return (
    <div className="flash-toast" role="status" aria-live="polite">
      <span className="flash-toast-check">✓</span> {msg}
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
