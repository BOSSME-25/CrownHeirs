/* Crown Heirs Dolls: the drawn doll, modelled on Coletta's crochet dolls.
 *
 *   DollArt.render(o, id)  → SVG markup for a 200×290 viewBox: the whole doll
 *   DollArt.tile(style, hair1, hair2, skin, id) → SVG markup for a 60×60 head-and-hair tile
 *
 * o = { skin, hair1, hair2?, style, kind, topC, botC, shoe, shoeC, bow, bowC, glasses, crown }
 * hair2 is the highlight colour: whole strands of it mixed through hair1.
 * `id` keeps gradient, pattern and clip ids unique when several dolls share a page.
 *
 * Her dolls are tall and slim, with a big oval head, shiny black eyes, a
 * small nose and a stitched smile; long yarn locs or braids that hang behind
 * and over the shoulders (often with strands of a second colour); a crown on
 * the shirt; and chunky sneakers. Everything wears a faint crochet-stitch texture.
 */
(function (root) {
  const f = n => +(+n).toFixed(1);
  const clamp = n => Math.max(0, Math.min(255, Math.round(n)));
  function shade(hex, amt) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex || ''); if (!m) return hex;
    const n = parseInt(m[1], 16); let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    if (amt < 0) { r *= 1 + amt; g *= 1 + amt; b *= 1 + amt; } else { r += (255 - r) * amt; g += (255 - g) * amt; b += (255 - b) * amt; }
    return '#' + [r, g, b].map(v => clamp(v).toString(16).padStart(2, '0')).join('');
  }
  function lum(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex || ''); if (!m) return 0.5;
    const n = parseInt(m[1], 16); return ((n >> 16) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114) / 255;
  }

  function defs(id, h, c1, c2) {
    const top = h.cy - h.ry * 1.2, bot = h.cy + h.ry * 3.3;
    const grad = (gid, c) => `<linearGradient id="${gid}" gradientUnits="userSpaceOnUse" x1="0" y1="${f(top)}" x2="0" y2="${f(bot)}"><stop offset="0" stop-color="${shade(c, 0.06)}"/><stop offset="1" stop-color="${shade(c, -0.14)}"/></linearGradient>`;
    const k = h.ry / 36;
    return `<defs>
      <pattern id="${id}-knit" width="${f(5 * k)}" height="${f(4 * k)}" patternUnits="userSpaceOnUse"><path d="M0 ${f(.8 * k)}l${f(1.25 * k)} ${f(1.7 * k)} ${f(1.25 * k)} ${f(-1.7 * k)}M${f(2.5 * k)} ${f(.8 * k)}l${f(1.25 * k)} ${f(1.7 * k)} ${f(1.25 * k)} ${f(-1.7 * k)}" fill="none" stroke="rgba(0,0,0,.14)" stroke-width="${f(.6 * k)}"/></pattern>
      ${grad(`${id}-hair`, c1)}${c2 ? grad(`${id}-hl`, c2) : ''}
    </defs>`;
  }

  /* Hair: { back } is drawn behind the body, { over } in front of the
     shoulders, { front } on top of the head. P is the hair paint; Q, when
     there is a second colour, paints the highlights: whole strands of it
     from root to tip, mixed through the first. */
  function hair(style, P, Q, h, c1, K, id, S) {
    const { cx, cy, rx, ry } = h; const s = ry / 36;
    const dark = shade(c1, -0.35);
    const hl = i => Q && i % 3 === 1;                              // every third strand is a highlight
    const line = (d, w, paint, tex) => `<path d="${d}" fill="none" stroke="${paint}" stroke-width="${f(w)}" stroke-linecap="round" stroke-linejoin="round"/>`
      + (tex ? `<path d="${d}" fill="none" stroke="${tex.c}" stroke-width="${f(w * tex.w)}" stroke-dasharray="${tex.d}" stroke-linecap="round"/>` : '');
    const strand = (x0, y0, x1, y1, w, bend, tex, paint) =>
      line(`M${f(x0)} ${f(y0)}Q${f((x0 + x1) / 2 + bend)} ${f((y0 + y1) / 2)} ${f(x1)} ${f(y1)}`, w, paint || P, tex);
    // A loose curl: a soft S-wave that starts flat at the root and opens up toward the tip.
    const curl = (x0, y0, x1, y1, w, amp, per, tex, paint) => {
      const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy), nx = -dy / L, ny = dx / L;
      const n = Math.max(12, Math.round(L / (per / 14)));
      let d = '';
      for (let j = 0; j <= n; j++) {
        const u = j / n, a = amp * Math.min(1, u * 3) * Math.sin(u * L / per * Math.PI * 2);
        d += (j ? 'L' : 'M') + f(x0 + dx * u + nx * a) + ' ' + f(y0 + dy * u + ny * a);
      }
      return line(d, w, paint || P, tex);
    };
    const hang = (n, w, endY, spread, tex, frontEach, frontLen, draw) => {
      draw = draw || strand;
      let back = '', over = '';
      for (let i = 0; i < n; i++) {
        const t = n === 1 ? 0.5 : i / (n - 1);
        const a = Math.PI * (0.97 + 1.06 * t);                    // from beside one ear, over the top, to the other
        const x0 = cx + Math.cos(a) * rx * 0.94, y0 = cy + Math.sin(a) * ry * 0.94;
        const x1 = cx + (x0 - cx) * spread, y1 = endY - Math.abs(t - 0.5) * 14 * s;
        back += draw(x0, y0, x1, y1, w, (t - 0.5) * 8 * s, tex, hl(i) ? Q : P);
      }
      for (let k = 0; k < frontEach; k++) for (const side of [-1, 1]) {
        const x0 = cx + side * rx * (0.88 - k * 0.1), y0 = cy - ry * (0.3 - k * 0.1);
        const x1 = cx + side * rx * (0.96 + k * 0.16), y1 = cy + ry * (frontLen - k * 0.2);
        over += draw(x0, y0, x1, y1, w, side * 3 * s, tex, hl(k + (side > 0 ? 1 : 0)) ? Q : P);
      }
      return { back, over };
    };
    const capD = `M${f(cx - rx * 1.03)} ${f(cy + ry * 0.12)}C${f(cx - rx * 1.1)} ${f(cy - ry * 1.42)} ${f(cx + rx * 1.1)} ${f(cy - ry * 1.42)} ${f(cx + rx * 1.03)} ${f(cy + ry * 0.12)}`
      + `C${f(cx + rx * 0.86)} ${f(cy - ry * 0.18)} ${f(cx + rx * 0.5)} ${f(cy - ry * 0.56)} ${f(cx)} ${f(cy - ry * 0.5)}`
      + `C${f(cx - rx * 0.5)} ${f(cy - ry * 0.56)} ${f(cx - rx * 0.86)} ${f(cy - ry * 0.18)} ${f(cx - rx * 1.03)} ${f(cy + ry * 0.12)}Z`;
    // Highlights carry on over the top of the head: streaks fanned from the
    // crown to the hairline, trimmed to the cap.
    const capHl = (n, w) => {
      if (!Q) return '';
      let d = '';
      for (let i = 0; i < n; i++) {
        if (!hl(i)) continue;
        const u = n === 1 ? 0 : i / (n - 1) * 2 - 1;
        const x0 = cx + u * rx * 0.25, y0 = cy - ry * 1.2, x1 = cx + u * rx * 1.15, y1 = cy - ry * 0.45 + Math.abs(u) * ry * 0.75;
        d += `M${f(x0)} ${f(y0)}Q${f(cx + u * rx * 0.95)} ${f(cy - ry * 1.05)} ${f(x1)} ${f(y1)}`;
      }
      return `<clipPath id="${id}-cap"><path d="${capD}"/></clipPath><g clip-path="url(#${id}-cap)">${line(d, w, Q)}</g>`;
    };
    const cap = (n, w) => `<path d="${capD}" fill="${P}"/>` + capHl(n || 13, w || 4.2 * s) + `<path d="${capD}" fill="${K}"/>`;
    const blob = (x, y, r, paint) => `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}" fill="${paint || P}"/><circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}" fill="${K}"/>`;
    const ring = (x, y, r, n, br) => Array.from({ length: n }, (_, i) => { const a = (i / n) * Math.PI * 2; return blob(x + Math.cos(a) * r, y + Math.sin(a) * r, br, hl(i) ? Q : P); }).join('');
    const tie = (x, y, r) => `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}" fill="none" stroke="#c8952a" stroke-width="${f(2.2 * s)}"/>`;
    // Streaks down a solid shape (a silk press, a ponytail), trimmed to it.
    const sheet = (key, d, paths, w) => `<path d="${d}" fill="${P}"/>`
      + (Q ? `<clipPath id="${id}-${key}"><path d="${d}"/></clipPath><g clip-path="url(#${id}-${key})">${line(paths, w, Q)}</g>` : '')
      + `<path d="${d}" fill="${K}"/>`;
    switch (style) {
      case 'locs': { const H = hang(19, 7.6 * s, cy + ry * 3.4, 1.78, { c: 'rgba(0,0,0,.22)', w: .5, d: `${f(2.2 * s)} ${f(2.6 * s)}` }, 3, 3.0); return { back: H.back, over: H.over, front: cap(11, 6 * s) }; }
      case 'box-braids': { const H = hang(27, 4.8 * s, cy + ry * 3.55, 1.72, { c: 'rgba(255,255,255,.22)', w: .45, d: `${f(1.8 * s)} ${f(1.6 * s)}` }, 4, 3.1); return { back: H.back, over: H.over, front: cap(16, 3.6 * s) }; }
      case 'twists': { const H = hang(21, 5.8 * s, cy + ry * 2.75, 1.75, { c: 'rgba(0,0,0,.3)', w: .6, d: `${f(1.5 * s)} ${f(2.2 * s)}` }, 3, 2.3); return { back: H.back, over: H.over, front: cap(13, 4.6 * s) }; }
      case 'loose-curls': {
        const draw = (x0, y0, x1, y1, w, bend, tex, paint) => curl(x0, y0, x1, y1, w, 4.6 * s, 17 * s, tex, paint);
        const H = hang(16, 6.4 * s, cy + ry * 2.75, 1.85, null, 2, 2.3, draw);
        return { back: H.back, over: H.over, front: cap(13, 4.6 * s) };
      }
      case 'cornrows': {
        let rows = '';
        for (let i = 0; i < 6; i++) {
          const x = cx - rx * 0.72 + i * rx * 0.288;
          const d = `M${f(x)} ${f(cy - ry * 0.48)}Q${f(x + (x - cx) * 0.15)} ${f(cy - ry * 0.95)} ${f(cx + (x - cx) * 0.45)} ${f(cy - ry * 1.08)}`;
          if (Q && i % 2) rows += `<path d="${d}" fill="none" stroke="${Q}" stroke-width="${f(3.8 * s)}" stroke-linecap="round"/>`;
          rows += `<path d="${d}" fill="none" stroke="${dark}" stroke-width="${f(1.3 * s)}" stroke-dasharray="${f(2 * s)} ${f(1.2 * s)}"/>`;
        }
        let back = '';
        for (let i = 0; i < 6; i++) { const x = cx - rx * 0.55 + i * rx * 0.22; back += strand(x, cy + ry * 0.3, x + (x - cx) * 0.25, cy + ry * 1.75, 3.6 * s, 0, { c: 'rgba(255,255,255,.2)', w: .45, d: `${f(1.8 * s)} ${f(1.6 * s)}` }, Q && i % 2 ? Q : P); }
        return { back, over: '', front: `<path d="${capD}" fill="${P}"/><path d="${capD}" fill="${K}"/><clipPath id="${id}-rows"><path d="${capD}"/></clipPath><g clip-path="url(#${id}-rows)">${rows}</g>` };
      }
      case 'afro-puffs': {
        const L = [cx - rx * 0.98, cy - ry * 0.78], R = [cx + rx * 0.98, cy - ry * 0.78], r = rx * 0.6;
        const puff = ([x, y]) => blob(x, y, r) + ring(x, y, r * 0.92, 10, r * 0.24) + (Q ? blob(x - r * 0.25, y - r * 0.2, r * 0.22, Q) + blob(x + r * 0.3, y + r * 0.25, r * 0.2, Q) : '');
        return { back: puff(L) + puff(R), over: '', front: cap(13, 4.2 * s) + tie(L[0] + rx * 0.32, L[1] + ry * 0.36, 3.2 * s) + tie(R[0] - rx * 0.32, R[1] + ry * 0.36, 3.2 * s) };
      }
      case 'curly-afro': {
        const x = cx, y = cy - ry * 0.32, r = rx * 1.48;
        let fringe = '';
        for (let i = 0; i < 7; i++) { const a = Math.PI * (1.12 + 0.76 * (i / 6)); fringe += blob(cx + Math.cos(a) * rx * 0.86, cy - ry * 0.18 + Math.sin(a) * ry * 0.62, rx * 0.2, Q && i % 2 ? Q : P); }
        return { back: blob(x, y, r) + ring(x, y, r * 0.95, 16, r * 0.22), over: '', front: cap(13, 4.2 * s) + fringe };
      }
      case 'bantu-knots': {
        let knots = '';
        for (let i = 0; i < 5; i++) {
          const a = Math.PI * (1.12 + 0.76 * (i / 4)), x = cx + Math.cos(a) * rx * 0.9, y = cy - ry * 0.2 + Math.sin(a) * ry * 0.98, r = rx * 0.25;
          knots += blob(x, y, r, Q && i % 2 ? Q : P) + `<path d="M${f(x)} ${f(y - r * 0.55)}a${f(r * 0.55)} ${f(r * 0.55)} 0 1 1 ${f(-r * 0.5)} ${f(r * 0.6)}" fill="none" stroke="${dark}" stroke-width="${f(1.1 * s)}"/>`;
        }
        return { back: '', over: '', front: cap(13, 4.2 * s) + knots };
      }
      case 'straight': {
        const d = `M${f(cx - rx * 1.06)} ${f(cy - ry * 0.3)}C${f(cx - rx * 1.28)} ${f(cy + ry * 1.1)} ${f(cx - rx * 1.22)} ${f(cy + ry * 1.9)} ${f(cx - rx * 1.02)} ${f(cy + ry * 2.3)}L${f(cx + rx * 1.02)} ${f(cy + ry * 2.3)}C${f(cx + rx * 1.22)} ${f(cy + ry * 1.9)} ${f(cx + rx * 1.28)} ${f(cy + ry * 1.1)} ${f(cx + rx * 1.06)} ${f(cy - ry * 0.3)}Z`;
        const part = `<path d="M${f(cx - rx * 0.32)} ${f(cy - ry * 1.02)}Q${f(cx - rx * 0.3)} ${f(cy - ry * 0.75)} ${f(cx - rx * 0.22)} ${f(cy - ry * 0.52)}" fill="none" stroke="${dark}" stroke-width="${f(1.2 * s)}"/>`;
        let lines = '';
        for (const u of [-1.12, -0.84, 0.84, 1.12]) lines += `M${f(cx + u * rx * 0.94)} ${f(cy - ry * 0.4)}C${f(cx + u * rx * 1.1)} ${f(cy + ry * 1.1)} ${f(cx + u * rx * 1.04)} ${f(cy + ry * 1.9)} ${f(cx + u * rx * 0.9)} ${f(cy + ry * 2.4)}`;
        return { back: sheet('sheet', d, lines, 4.4 * s), over: '', front: cap(13, 4.2 * s) + part };
      }
      case 'ponytail': {
        const x = cx + rx * 0.5, y = cy - ry * 0.86;
        const d = `M${f(x)} ${f(y)}C${f(x + rx * 0.95)} ${f(y + ry * 0.2)} ${f(x + rx * 0.75)} ${f(y + ry * 1.7)} ${f(x + rx * 0.35)} ${f(y + ry * 2.95)}C${f(x + rx * 0.05)} ${f(y + ry * 2.2)} ${f(x + rx * 0.15)} ${f(y + ry * 0.95)} ${f(x - rx * 0.2)} ${f(y + ry * 0.25)}Z`;
        let lines = '';
        for (const u of [0.22, 0.55]) lines += `M${f(x + rx * u * 0.4)} ${f(y)}C${f(x + rx * (0.3 + u * 0.6))} ${f(y + ry * 0.4)} ${f(x + rx * (0.25 + u * 0.4))} ${f(y + ry * 1.8)} ${f(x + rx * 0.35)} ${f(y + ry * 3)}`;
        return { back: sheet('tail', d, lines, 3.6 * s), over: '', front: cap(13, 4.2 * s) + tie(x, y + ry * 0.05, 3.4 * s) };
      }
      case 'bun': {
        const x = cx, y = cy - ry * 1.16, r = rx * 0.5;
        const swirl = `M${f(x)} ${f(y - r * 0.6)}a${f(r * 0.6)} ${f(r * 0.6)} 0 1 1 ${f(-r * 0.55)} ${f(r * 0.65)}`;
        return { back: '', over: '', front: cap(13, 4.2 * s) + blob(x, y, r) + (Q ? `<path d="${swirl}" fill="none" stroke="${Q}" stroke-width="${f(4 * s)}" stroke-linecap="round"/>` : '') + `<path d="${swirl}" fill="none" stroke="${dark}" stroke-width="${f(1.3 * s)}"/>` };
      }
      case 'short-curls': {
        // A close cap of tight curls, faded at the temples.
        const capS = `M${f(cx - rx * 1.0)} ${f(cy - ry * 0.05)}C${f(cx - rx * 1.06)} ${f(cy - ry * 1.3)} ${f(cx + rx * 1.06)} ${f(cy - ry * 1.3)} ${f(cx + rx * 1.0)} ${f(cy - ry * 0.05)}`
          + `C${f(cx + rx * 0.84)} ${f(cy - ry * 0.3)} ${f(cx + rx * 0.5)} ${f(cy - ry * 0.62)} ${f(cx)} ${f(cy - ry * 0.58)}`
          + `C${f(cx - rx * 0.5)} ${f(cy - ry * 0.62)} ${f(cx - rx * 0.84)} ${f(cy - ry * 0.3)} ${f(cx - rx * 1.0)} ${f(cy - ry * 0.05)}Z`;
        const fade = `<linearGradient id="${id}-fade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${S}" stop-opacity="0"/><stop offset="1" stop-color="${S}" stop-opacity=".85"/></linearGradient>`
          + `<clipPath id="${id}-sc"><path d="${capS}"/></clipPath><g clip-path="url(#${id}-sc)">`
          + [-1, 1].map(side => `<rect x="${f(side < 0 ? cx - rx * 1.1 : cx + rx * 0.6)}" y="${f(cy - ry * 0.62)}" width="${f(rx * 0.5)}" height="${f(ry * 0.6)}" fill="url(#${id}-fade)"/>`).join('') + '</g>';
        let curls = '', k = 0;
        for (const [n, rr, from, to, r] of [[12, 0.97, 1.16, 1.84, 0.15], [8, 0.66, 1.2, 1.8, 0.13]]) {
          for (let i = 0; i < n; i++, k++) {
            const a = Math.PI * (from + (to - from) * (i / (n - 1)));
            const x = cx + Math.cos(a) * rx * rr, y = cy - ry * 0.08 + Math.sin(a) * ry * rr;
            curls += blob(x, y, rx * r, hl(k) ? Q : P) + `<path d="M${f(x - rx * r * 0.45)} ${f(y)}a${f(rx * r * 0.45)} ${f(rx * r * 0.45)} 0 1 1 ${f(rx * r * 0.5)} ${f(rx * r * 0.35)}" fill="none" stroke="${dark}" stroke-width="${f(0.7 * s)}" opacity=".7"/>`;
          }
        }
        return { back: '', over: '', front: `<path d="${capS}" fill="${P}"/><path d="${capS}" fill="${K}"/>` + fade + curls };
      }
      default: return { back: '', over: '', front: cap() };
    }
  }

  function face(h, S, lashes) {
    const { cx, cy, rx, ry } = h; const s = ry / 36;
    const ex = rx * 0.38, ey = cy + ry * 0.16, er = 4.3 * s;
    const eye = x => `<circle cx="${f(x)}" cy="${f(ey)}" r="${f(er)}" fill="#141210"/><circle cx="${f(x + er * 0.32)}" cy="${f(ey - er * 0.36)}" r="${f(er * 0.3)}" fill="#fff"/>`;
    const brow = x => `<path d="M${f(x - 5 * s)} ${f(ey - 9 * s)}q${f(5 * s)} ${f(-3 * s)} ${f(10 * s)} 0" fill="none" stroke="#2a1d17" stroke-width="${f(1.5 * s)}" stroke-linecap="round"/>`;
    const lash = (x, side) => `<path d="M${f(x + side * er * 0.7)} ${f(ey - er * 0.7)}l${f(side * 2.2 * s)} ${f(-1.6 * s)}" stroke="#141210" stroke-width="${f(1.1 * s)}" stroke-linecap="round"/>`;
    return eye(cx - ex) + eye(cx + ex) + brow(cx - ex) + brow(cx + ex) + (lashes ? lash(cx - ex, -1) + lash(cx + ex, 1) : '')
      + `<ellipse cx="${cx}" cy="${f(cy + ry * 0.44)}" rx="${f(3.8 * s)}" ry="${f(3.1 * s)}" fill="${shade(S, -0.18)}"/>`
      + `<path d="M${f(cx - 6 * s)} ${f(cy + ry * 0.66)}q${f(6 * s)} ${f(4.5 * s)} ${f(12 * s)} 0" fill="none" stroke="#5a2a22" stroke-width="${f(1.8 * s)}" stroke-linecap="round"/>`;
  }

  /* The whole doll, in the Doll Maker's layer order: hair that sits behind,
     the body, bottoms, top (with any Crown Heirs mark placed from its source
     file, never drawn), shoes, the head and face, the hair in front, then
     accessories.
       o = { base, skin, hair1, hair2?, style,
             top: { look, color, brand }, bottom: { look, color },
             shoes: { look, main, trim }, accessories: [ids], brandSrc? } */
  function render(o, id) {
    id = id || 'doll';
    const S = o.skin || '#7d4a2c', h = { cx: 100, cy: 66, rx: 33, ry: 36 };
    const c1 = o.hair1 || '#1b1b1b', P = `url(#${id}-hair)`, Q = o.hair2 ? `url(#${id}-hl)` : null, K = `url(#${id}-knit)`;
    const style = o.style || 'locs';
    const H = style === 'none' ? { back: '', over: '', front: '' } : hair(style, P, Q, h, c1, K, id, S);
    const fp = (d, fill, extra) => `<path d="${d}" fill="${fill}"${extra || ''}/><path d="${d}" fill="${K}"/>`;
    const limb = (x1, y1, x2, y2, w, c) => [c, K].map(p => `<path d="M${x1} ${y1}L${x2} ${y2}" fill="none" stroke="${p}" stroke-width="${w}" stroke-linecap="round"/>`).join('');
    const ball = (x, y, r, c) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${c}"/><circle cx="${x}" cy="${y}" r="${r}" fill="${K}"/>`;
    const top = o.top || { look: 'tee', color: '#c0392b' }, bot = o.bottom || { look: 'jeans', color: '#4a6a94' };
    const sh = o.shoes || { look: 'sneakers', main: '#f7f4ee', trim: '#f7f4ee' }, acc = new Set(o.accessories || []);
    const logo = o.brandSrc || '/doll-maker/brand-source/brand_source_ch_monogram.png';   // the approved CH mark, as supplied
    const gd = '#c8952a', cream = '#f7f4ee';
    let pdefs = '';

    // 05 Bottoms
    const bc = bot.color || '#4a6a94', bdk = shade(bc, -0.2);
    const bottoms = {
      joggers: () => fp('M70 180 H130 L126 250 H104 L101 204 H99 L96 250 H74 Z', bc)
        + `<path d="M70 180 H130 V187 H70 Z" fill="${bdk}"/><path d="M74 243 H96 V251 H74 Z M104 243 H126 V251 H104 Z" fill="${bdk}"/>`
        + `<path d="M97 187 l-1.5 9 M103 187 l1.5 9" stroke="${cream}" stroke-width="1.3" stroke-linecap="round"/>`,
      jeans: () => fp('M70 180 H130 L125 254 H104 L101 204 H99 L96 254 H75 Z', bc)
        + `<path d="M100 184 V203 M75 188 Q81 195 88 188 M125 188 Q119 195 112 188" fill="none" stroke="${shade(bc, 0.35)}" stroke-width=".9" stroke-dasharray="2 1.4"/>`
        + `<path d="M75 247 H96 V254 H75 Z M104 247 H125 V254 H104 Z" fill="${shade(bc, 0.14)}"/>`,
      shorts: () => fp('M70 180 H130 L131 214 H104 L101 200 H99 L96 214 H69 Z', bc) + `<path d="M69 209 H96 M104 209 H131" stroke="${bdk}" stroke-width="1.4"/>`,
      skirt: () => fp('M70 180 L130 180 L140 224 Q100 233 60 224 Z', bc) + `<path d="M70 180 H130 V186 H70 Z" fill="${bdk}"/>`,
      wide: () => fp('M70 180 H130 L137 254 H103 L100 208 L97 254 H63 Z', bc) + `<path d="M84 196 V253 M116 196 V253" stroke="${bdk}" stroke-width="1" opacity=".55"/><path d="M70 180 H130 V185 H70 Z" fill="${bdk}"/>`
    };
    const bottomL = (bottoms[bot.look] || bottoms.jeans)();

    // 06 Top, 10 brand overlay
    const T = 'M71 112 Q100 100 129 112 L132 188 Q100 196 68 188 Z';
    const tc = top.color || '#c0392b', tdk = shade(tc, -0.18);
    const longS = (p, cuff) => limb(73, 119, 64, 180, 17.5, p) + limb(127, 119, 136, 180, 17.5, p) + (cuff ? limb(64.6, 177, 63.8, 183, 18, cuff) + limb(135.4, 177, 136.2, 183, 18, cuff) : '');
    const shortS = p => limb(73, 119, 69, 141, 18.5, p) + limb(127, 119, 131, 141, 18.5, p);
    const scoop = fp('M91 108 Q100 120 109 108 Z', S);
    const mark = (x, y, w) => `<image href="${logo}" x="${x}" y="${y}" width="${w}" height="${f(w * 449 / 202)}" preserveAspectRatio="xMidYMid meet"/>`;
    const tops = {
      hoodie: () => fp(T, tc) + longS(tc, tdk)
        + `<path d="M82 111 Q100 128 118 111 Q114 103 100 104 Q86 103 82 111 Z" fill="${tdk}"/>`
        + `<path d="M81 170 H119 L122 187 Q100 191 78 187 Z" fill="${tdk}" opacity=".55"/>`
        + `<path d="M93.5 116 L92.5 126 M106.5 116 L107.5 126" stroke="${cream}" stroke-width="1.4" stroke-linecap="round"/>`
        + (top.brand ? mark(91.5, 128, 17) : ''),
      sweater: () => fp(T, tc) + longS(tc, tdk)
        + `<path d="M88 107 Q100 121 112 107" fill="none" stroke="${tdk}" stroke-width="4"/>`
        + `<path d="M69 183 Q100 191 131 183 L132 188 Q100 196 68 188 Z" fill="${tdk}"/>`
        + (top.brand ? `<rect x="87" y="124" width="26" height="46" rx="2.5" fill="${cream}" stroke="${shade(tc, -0.3)}" stroke-width=".8"/>` + mark(91, 126, 18.6) : ''),
      tee: () => fp(T, tc) + shortS(tc) + scoop,
      jacket: () => {
        const dn = '#5b7fae', ddk = shade(dn, -0.2);
        return fp(T, dn) + fp('M91 108 L109 108 L107 193 L93 193 Z', tc) + longS(dn, ddk)
          + `<path d="M89 108 L97 136 L92 111 Z M111 108 L103 136 L108 111 Z" fill="${ddk}"/>`
          + `<path d="M77 132 H89 V140 H77 Z M111 132 H123 V140 H111 Z" fill="none" stroke="${shade(dn, 0.3)}" stroke-width=".9" stroke-dasharray="1.6 1.2"/>`
          + `<circle cx="90" cy="150" r="1.4" fill="${gd}"/><circle cx="90" cy="168" r="1.4" fill="${gd}"/><circle cx="110" cy="150" r="1.4" fill="${gd}"/><circle cx="110" cy="168" r="1.4" fill="${gd}"/>`;
      },
      cardigan: () => {
        pdefs += `<pattern id="${id}-fuzz" width="4" height="4" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="1" fill="rgba(255,255,255,.4)"/><circle cx="3" cy="3" r=".9" fill="rgba(0,0,0,.07)"/></pattern>`;
        const Z = `url(#${id}-fuzz)`;
        return fp(T, cream) + scoop
          + [`M71 112 Q84 106 92 109 L95 193 Q80 193 68 188 Z`, `M129 112 Q116 106 108 109 L105 193 Q120 193 132 188 Z`].map(d => fp(d, tc) + `<path d="${d}" fill="${Z}"/>`).join('')
          + longS(tc) + limb(73, 119, 64, 180, 17.5, Z) + limb(127, 119, 136, 180, 17.5, Z);
      },
      flannel: () => {
        pdefs += `<pattern id="${id}-plaid" width="12" height="12" patternUnits="userSpaceOnUse"><rect width="12" height="12" fill="${tc}"/><rect y="4" width="12" height="4" fill="${shade(tc, -0.4)}" opacity=".5"/><rect x="4" width="4" height="12" fill="${shade(tc, -0.4)}" opacity=".5"/><path d="M0 10H12M10 0V12" stroke="${cream}" stroke-width=".7" opacity=".6"/></pattern>`;
        const PL = `url(#${id}-plaid)`;
        return fp(T, PL) + longS(PL, shade(tc, -0.3)) + scoop
          + `<path d="M88 107 L96 121 L99 110 Z M112 107 L104 121 L101 110 Z" fill="${shade(tc, -0.25)}"/>`
          + [132, 148, 164, 180].map(y => `<circle cx="100" cy="${y}" r="1.3" fill="${cream}"/>`).join('');
      }
    };
    const topL = (tops[top.look] || tops.tee)();

    // 07 Shoes: drawn for the right foot, mirrored for the left.
    const shoeR = x => {
      const m = sh.main || cream, t = sh.trim || m;
      const sole = lum(m) > 0.75 && lum(t) > 0.75 ? '#d9d2c6' : t, lace = lum(m) > 0.5 ? '#3a2f28' : cream;
      switch (sh.look) {
        case 'boots': return fp(`M${x - 9} 226 H${x + 9} V250 Q${x + 17} 251 ${x + 17} 259 V265 H${x - 10} Z`, m) + `<path d="M${x - 10} 262 H${x + 17}" stroke="${shade(m, -0.35)}" stroke-width="3"/>`;
        case 'flats': return fp(`M${x - 10} 255 Q${x - 10} 250 ${x - 3} 250 H${x + 5} Q${x + 15} 252 ${x + 16} 262 V265 H${x - 10} Z`, m, ` stroke="${shade(m, -0.4)}" stroke-width=".8"`)
          + `<path d="M${x - 8} 251 Q${x - 1} 246 ${x + 6} 251" fill="none" stroke="${shade(m, -0.3)}" stroke-width="1.6"/><circle cx="${x + 5}" cy="251" r="1.1" fill="${gd}"/>`;
        default: return fp(`M${x - 11} 254 Q${x - 11} 246 ${x - 3} 246 H${x + 5} Q${x + 15} 248 ${x + 17} 259 V266 H${x - 12} Z`, m, ` stroke="${shade(m, -0.45)}" stroke-width=".9"`)
          + (t !== m ? `<path d="M${x + 7} 248.5 Q${x + 15} 250 ${x + 17} 259 V262 H${x + 5} Q${x + 4} 254 ${x + 7} 248.5 Z" fill="${t}"/>` : '')
          + `<path d="M${x - 12} 262 H${x + 17}" stroke="${sole}" stroke-width="3.2"/>`
          + `<path d="M${x - 3} 250 l4 4 M${x + 1} 249 l4 4" stroke="${lace}" stroke-width="1.2" stroke-linecap="round"/>`;
      }
    };
    const shoes = `<g transform="translate(174 0) scale(-1 1)">${shoeR(87)}</g>` + shoeR(113);

    // 09 Accessories
    const hatTop = style === 'short-curls' ? 30 : 26;
    const accL = (acc.has('hat') ? `<path d="M72 ${hatTop + 18} Q72 ${hatTop - 6} 100 ${hatTop - 8} Q128 ${hatTop - 6} 128 ${hatTop + 18} Z" fill="#1f1d1b"/><path d="M72 ${hatTop + 18} Q72 ${hatTop - 6} 100 ${hatTop - 8} Q128 ${hatTop - 6} 128 ${hatTop + 18} Z" fill="${K}"/><ellipse cx="100" cy="${hatTop + 19}" rx="40" ry="7" fill="#2b2826"/><path d="M73 ${hatTop + 13} H127" stroke="${gd}" stroke-width="2"/>` : '')
      + (acc.has('bow') ? `<path d="M122 40 l13 -8 v17z M122 40 l-13 -8 v17z" fill="#e07fa8"/><circle cx="122" cy="40" r="3.6" fill="#e07fa8" stroke="rgba(0,0,0,.2)"/>` : '')
      + (acc.has('glasses') ? `<g fill="none" stroke="#1f1d1b" stroke-width="2"><circle cx="87.5" cy="72" r="8.5"/><circle cx="112.5" cy="72" r="8.5"/><path d="M96 72 h8"/></g>` : '')
      + (acc.has('jewelry') ? `<g fill="none" stroke="${gd}" stroke-width="1.6"><circle cx="66" cy="82" r="4.5"/><circle cx="134" cy="82" r="4.5"/></g><path d="M89 110 Q100 126 111 110" fill="none" stroke="${gd}" stroke-width="1.2"/><circle cx="100" cy="122" r="2.2" fill="${gd}"/>` : '')
      + (acc.has('bag') ? `<path d="M78 113 L126 174" stroke="#8a5a32" stroke-width="2.6" stroke-linecap="round"/><rect x="116" y="168" width="22" height="18" rx="3" fill="#b07a45"/><path d="M116 171 Q127 180 138 171 V168 H116 Z" fill="#8a5a32"/><circle cx="127" cy="176" r="1.6" fill="${gd}"/>` : '')
      + (acc.has('crown') && o.crownSrc ? `<image href="${o.crownSrc}" x="76" y="${hatTop - 22}" width="48" height="30" preserveAspectRatio="xMidYMax meet"/>` : '');

    return defs(id, h, c1, o.hair2) + (pdefs ? `<defs>${pdefs}</defs>` : '')
      + H.back                                                                        // 04 hair behind
      + limb(87, 186, 87, 252, 17, S) + limb(113, 186, 113, 252, 17, S)                 // 02 legs
      + limb(73, 120, 63, 188, 14, S) + limb(127, 120, 137, 188, 14, S)                 //    arms
      + `<rect x="91" y="94" width="18" height="20" rx="4" fill="${S}"/>`               //    neck
      + bottomL + topL                                                                 // 05, 06 (+10)
      + ball(62, 193, 8, S) + ball(138, 193, 8, S)                                     //    hands, over the cuffs
      + shoes                                                                           // 07
      + ball(67, 72, 6, S) + ball(133, 72, 6, S)                                       //    ears
      + `<ellipse cx="${h.cx}" cy="${h.cy}" rx="${h.rx}" ry="${h.ry}" fill="${S}"/><ellipse cx="${h.cx}" cy="${h.cy}" rx="${h.rx}" ry="${h.ry}" fill="${K}"/>`
      + face(h, S, o.base !== 'boy')
      + H.over + H.front                                                               // 08 hair in front
      + accL;                                                                           // 09
  }

  /* A close crop of one part of the doll, for an option's thumbnail. */
  const CROPS = { top: '56 98 88 100', bottom: '54 176 92 84', shoes: '64 236 72 34', head: '50 8 100 104',
    bag: '66 104 84 96', glasses: '62 44 76 56', hat: '50 0 100 80', bow: '66 18 76 60', jewelry: '58 58 84 74', crown: '50 0 100 80' };
  function crop(part) { return CROPS[part] || '0 0 200 290'; }

  /* The reveal: the finished doll set in a scene, for a 300×380 viewBox.
     Settings are drawn environment only; no crown or mark is drawn into
     them (Crown Heirs marks are placed from their source files by the page). */
  function reveal(o, bg, id) {
    id = id || 'rv';
    const doll = `<g transform="translate(50 62)">${render(o, id)}</g>`;
    const shadow = `<ellipse cx="150" cy="329" rx="54" ry="7" fill="rgba(0,0,0,.2)"/>`;
    if (bg === 'neutral') {
      return `<defs><radialGradient id="${id}-glow" cx=".5" cy=".42" r=".6"><stop offset="0" stop-color="#fbf3e2"/><stop offset="1" stop-color="#e8d7b8"/></radialGradient></defs>`
        + `<rect width="300" height="380" fill="url(#${id}-glow)"/>`
        + `<path d="M58 318 V128 Q58 40 150 40 Q242 40 242 128 V318" fill="none" stroke="#c8952a" stroke-width="1.6" opacity=".7"/>`
        + `<path d="M66 318 V130 Q66 50 150 50 Q234 50 234 130 V318" fill="none" stroke="#c8952a" stroke-width=".7" opacity=".5"/>`
        + `<rect y="318" width="300" height="62" fill="#d9c4a0"/><path d="M0 318 H300" stroke="#c8952a" stroke-width="1"/>` + shadow + doll;
    }
    const G = `url(#${id}-gold)`, V = `url(#${id}-tuft)`;
    const post = x => `<rect x="${x - 7}" y="72" width="14" height="258" rx="3" fill="${G}"/><circle cx="${x}" cy="66" r="8" fill="${G}"/><path d="M${x - 3} 60 L${x} 44 L${x + 3} 60 Z" fill="${G}"/>`
      + [120, 190, 260].map(y => `<rect x="${x - 9}" y="${y}" width="18" height="6" rx="2" fill="${G}"/>`).join('');
    const arm = side => { const x = 150 + side * 86; return `<path d="M${x} 206 Q${x + side * 26} 200 ${x + side * 30} 222 Q${x + side * 30} 238 ${x + side * 14} 238 L${x} 238 Z" fill="${G}"/><circle cx="${x + side * 24}" cy="224" r="9" fill="${G}" stroke="#8a6414" stroke-width="1"/><circle cx="${x + side * 24}" cy="224" r="4" fill="none" stroke="#8a6414" stroke-width="1"/>`; };
    return `<defs>
        <linearGradient id="${id}-gold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f6dc8c"/><stop offset=".45" stop-color="#d4a640"/><stop offset="1" stop-color="#9c7020"/></linearGradient>
        <linearGradient id="${id}-wall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f4ead8"/><stop offset="1" stop-color="#e2cfae"/></linearGradient>
        <linearGradient id="${id}-floor" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7a4e2c"/><stop offset="1" stop-color="#4f2f19"/></linearGradient>
        <pattern id="${id}-tuft" width="16" height="16" patternUnits="userSpaceOnUse"><rect width="16" height="16" fill="#2b1c17"/><path d="M0 8 L8 0 L16 8 L8 16 Z" fill="none" stroke="#1d120e" stroke-width="1"/><circle cx="8" cy="8" r="1.4" fill="#4a332a"/></pattern>
      </defs>`
      + `<rect width="300" height="320" fill="url(#${id}-wall)"/>`
      + `<rect x="0" width="26" height="320" fill="#efe2c9"/><rect x="274" width="26" height="320" fill="#efe2c9"/><path d="M26 0 V320 M274 0 V320" stroke="#d9c39c" stroke-width="2"/>`
      + `<rect y="312" width="300" height="68" fill="url(#${id}-floor)"/>`
      + `<ellipse cx="150" cy="338" rx="124" ry="22" fill="#7a1f2b"/><ellipse cx="150" cy="338" rx="116" ry="18" fill="none" stroke="#c8952a" stroke-width="1.4"/>`
      + `<path d="M68 310 V100 Q68 36 150 22 Q232 36 232 100 V310 Z" fill="${G}"/>`
      + `<path d="M82 304 V106 Q82 52 150 40 Q218 52 218 106 V304 Z" fill="${V}"/>`
      + `<ellipse cx="150" cy="24" rx="15" ry="10" fill="${G}" stroke="#8a6414" stroke-width="1"/><path d="M135 26 q-12 -10 -22 2 M165 26 q12 -10 22 2" fill="none" stroke="#9c7020" stroke-width="2.2" stroke-linecap="round"/>`
      + post(62) + post(238) + arm(-1) + arm(1)
      + `<rect x="74" y="236" width="152" height="22" rx="8" fill="#3a2620"/>`
      + `<path d="M70 256 H230 V276 Q190 288 150 280 Q110 288 70 276 Z" fill="${G}"/><path d="M84 266 q8 8 16 0 q8 8 16 0 M184 266 q8 8 16 0 q8 8 16 0" fill="none" stroke="#8a6414" stroke-width="1.2"/>`
      + `<rect x="80" y="278" width="14" height="44" rx="3" fill="${G}"/><rect x="206" y="278" width="14" height="44" rx="3" fill="${G}"/>`
      + shadow + doll;
  }

  function tile(style, hair1, hair2, skin, id) {
    const h = { cx: 30, cy: 30, rx: 12.5, ry: 13.6 }, S = skin || '#7d4a2c';
    const c1 = hair1 || '#1b1b1b', P = `url(#${id}-hair)`, Q = hair2 ? `url(#${id}-hl)` : null, K = `url(#${id}-knit)`;
    const H = hair(style, P, Q, h, c1, K, id, S);
    const er = 1.7;
    return defs(id, h, c1, hair2) + H.back
      + `<rect x="26.5" y="40" width="7" height="12" rx="2" fill="${S}"/>`
      + `<ellipse cx="${h.cx}" cy="${h.cy}" rx="${h.rx}" ry="${h.ry}" fill="${S}"/><ellipse cx="${h.cx}" cy="${h.cy}" rx="${h.rx}" ry="${h.ry}" fill="${K}"/>`
      + `<circle cx="25.3" cy="32.3" r="${er}" fill="#141210"/><circle cx="34.7" cy="32.3" r="${er}" fill="#141210"/>`
      + H.over + H.front;
  }

  root.DollArt = { render, reveal, tile, crop, shade };
})(typeof window !== 'undefined' ? window : globalThis);
