"use client";

import { useRef, useState } from "react";

const FRAME = 240; // on-screen crop frame size (px)
const OUT = 512; // exported square size (px)

// Profile-photo field with drag-to-position + zoom cropping.
// Writes the cropped JPEG into a hidden <input name={name}> so the existing
// server action (which reads formData.get("photo")) works unchanged.
export default function PhotoCropField({
  name = "photo",
  currentUrl,
  label = "Profile photo",
}: {
  name?: string;
  currentUrl?: string | null;
  label?: string;
}) {
  const submitRef = useRef<HTMLInputElement>(null); // the file that gets submitted
  const pickRef = useRef<HTMLInputElement>(null); // hidden chooser
  const imgRef = useRef<HTMLImageElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const pointers = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinch = useRef<{ dist: number; zoom: number; natX: number; natY: number } | null>(null);

  const [src, setSrc] = useState<string | null>(null); // image being cropped
  const [nat, setNat] = useState<{ w: number; h: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [preview, setPreview] = useState<string | null>(null); // cropped result
  const [err, setErr] = useState<string | null>(null);

  const cover = nat ? Math.max(FRAME / nat.w, FRAME / nat.h) : 1;
  const scale = cover * zoom;
  const drawW = nat ? nat.w * scale : 0;
  const drawH = nat ? nat.h * scale : 0;

  function clampWith(o: { x: number; y: number }, dW: number, dH: number) {
    const mX = Math.max(0, (dW - FRAME) / 2);
    const mY = Math.max(0, (dH - FRAME) / 2);
    return { x: Math.max(-mX, Math.min(mX, o.x)), y: Math.max(-mY, Math.min(mY, o.y)) };
  }

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file later
    if (!f) return;
    if (!f.type.startsWith("image/")) { setErr("Please choose an image file."); return; }
    if (f.size > 15 * 1024 * 1024) { setErr("That image is too large (max 15 MB)."); return; }
    setErr(null);
    if (src) URL.revokeObjectURL(src);
    setSrc(URL.createObjectURL(f));
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  }

  function onImgLoad() {
    const img = imgRef.current!;
    setNat({ w: img.naturalWidth, h: img.naturalHeight });
    setOffset({ x: 0, y: 0 });
  }

  // Frame-local coordinates for a pointer event.
  function local(e: React.PointerEvent) {
    const r = frameRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  // Capture the natural-image point under the current two-finger midpoint so
  // it stays put while pinching.
  function startPinch() {
    const pts = [...pointers.current.values()];
    if (pts.length < 2) return;
    const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
    const midX = (pts[0].x + pts[1].x) / 2;
    const midY = (pts[0].y + pts[1].y) / 2;
    const lx = (FRAME - drawW) / 2 + offset.x;
    const ly = (FRAME - drawH) / 2 + offset.y;
    pinch.current = { dist, zoom, natX: (midX - lx) / scale, natY: (midY - ly) / scale };
    drag.current = null;
  }

  function down(e: React.PointerEvent) {
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, local(e));
    if (pointers.current.size >= 2) {
      startPinch();
    } else {
      const p = local(e);
      drag.current = { x: p.x, y: p.y, ox: offset.x, oy: offset.y };
    }
  }

  function move(e: React.PointerEvent) {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, local(e));

    if (pointers.current.size >= 2 && pinch.current && nat) {
      const pts = [...pointers.current.values()];
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const midX = (pts[0].x + pts[1].x) / 2;
      const midY = (pts[0].y + pts[1].y) / 2;
      const z = Math.max(1, Math.min(3, (pinch.current.zoom * dist) / pinch.current.dist));
      const sN = cover * z;
      const dW = nat.w * sN;
      const dH = nat.h * sN;
      const ox = midX - pinch.current.natX * sN - FRAME / 2 + dW / 2;
      const oy = midY - pinch.current.natY * sN - FRAME / 2 + dH / 2;
      setZoom(z);
      setOffset(clampWith({ x: ox, y: oy }, dW, dH));
      return;
    }

    if (drag.current) {
      const p = local(e);
      const nx = drag.current.ox + (p.x - drag.current.x);
      const ny = drag.current.oy + (p.y - drag.current.y);
      setOffset(clampWith({ x: nx, y: ny }, drawW, drawH));
    }
  }

  function up(e: React.PointerEvent) {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size === 1) {
      // Dropped to one finger — hand off to a fresh drag so it doesn't jump.
      pinch.current = null;
      const [p] = [...pointers.current.values()];
      drag.current = { x: p.x, y: p.y, ox: offset.x, oy: offset.y };
    } else if (pointers.current.size === 0) {
      drag.current = null;
      pinch.current = null;
    }
  }

  function onZoom(e: React.ChangeEvent<HTMLInputElement>) {
    if (!nat) return;
    const z = parseFloat(e.target.value);
    const ns = cover * z;
    setZoom(z);
    setOffset((o) => clampWith(o, nat.w * ns, nat.h * ns));
  }

  async function save() {
    if (!nat || !imgRef.current) return;
    const left = (FRAME - drawW) / 2 + offset.x;
    const top = (FRAME - drawH) / 2 + offset.y;
    const sx = -left / scale;
    const sy = -top / scale;
    const sSize = FRAME / scale;
    const canvas = document.createElement("canvas");
    canvas.width = OUT;
    canvas.height = OUT;
    const ctx = canvas.getContext("2d")!;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(imgRef.current, sx, sy, sSize, sSize, 0, 0, OUT, OUT);
    const blob: Blob = await new Promise((res) =>
      canvas.toBlob((b) => res(b!), "image/jpeg", 0.9),
    );
    const file = new File([blob], "photo.jpg", { type: "image/jpeg" });
    const dt = new DataTransfer();
    dt.items.add(file);
    if (submitRef.current) submitRef.current.files = dt.files;
    if (preview) URL.revokeObjectURL(preview);
    setPreview(URL.createObjectURL(blob));
    if (src) URL.revokeObjectURL(src);
    setSrc(null);
  }

  function cancel() {
    if (src) URL.revokeObjectURL(src);
    setSrc(null);
  }

  function clearChosen() {
    if (submitRef.current) submitRef.current.value = "";
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
  }

  const shown = preview ?? currentUrl ?? null;

  return (
    <div className="field">
      <label>{label}</label>
      {/* the file that actually gets submitted */}
      <input ref={submitRef} type="file" name={name} accept="image/*" hidden />
      {/* hidden chooser — not named, so never submitted raw */}
      <input ref={pickRef} type="file" accept="image/*" hidden onChange={onPick} />

      {src ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 12, alignItems: "flex-start" }}>
          <div
            ref={frameRef}
            onPointerDown={down}
            onPointerMove={move}
            onPointerUp={up}
            onPointerCancel={up}
            style={{
              position: "relative",
              width: FRAME,
              height: FRAME,
              maxWidth: "80vw",
              overflow: "hidden",
              borderRadius: "var(--r-m)",
              background: "#000",
              cursor: "grab",
              touchAction: "none",
              userSelect: "none",
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              ref={imgRef}
              src={src}
              alt=""
              onLoad={onImgLoad}
              draggable={false}
              style={{
                position: "absolute",
                width: drawW || "auto",
                height: drawH || "auto",
                left: (FRAME - drawW) / 2 + offset.x,
                top: (FRAME - drawH) / 2 + offset.y,
                maxWidth: "none",
                pointerEvents: "none",
              }}
            />
            {/* circular guide — dims the corners outside the avatar circle */}
            <div
              style={{
                position: "absolute",
                inset: 0,
                borderRadius: "50%",
                boxShadow: "0 0 0 9999px rgba(0,0,0,0.45)",
                pointerEvents: "none",
              }}
            />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, width: FRAME, maxWidth: "80vw" }}>
            <span aria-hidden style={{ fontSize: "0.9rem" }}>🔍</span>
            <input
              type="range"
              min={1}
              max={3}
              step={0.01}
              value={zoom}
              onChange={onZoom}
              aria-label="Zoom"
              style={{ flex: 1 }}
            />
          </div>
          <p className="muted" style={{ fontSize: "0.78rem", margin: 0 }}>
            Drag to reposition · pinch or slide to zoom.
          </p>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className="btn" onClick={save}>Use photo</button>
            <button type="button" className="btn btn-ghost" onClick={cancel}>Cancel</button>
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          {shown && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={shown}
              alt=""
              style={{ width: 64, height: 64, borderRadius: "50%", objectFit: "cover", display: "block" }}
            />
          )}
          <button type="button" className="btn btn-ghost" onClick={() => pickRef.current?.click()}>
            {shown ? "Change photo" : "Choose photo"}
          </button>
          {preview && (
            <button type="button" className="btn btn-ghost" onClick={clearChosen}>Remove</button>
          )}
        </div>
      )}

      {err && <p className="muted" style={{ color: "var(--terra)", fontSize: "0.8rem", marginTop: 6 }}>{err}</p>}
    </div>
  );
}
