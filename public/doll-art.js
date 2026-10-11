/* Crown Heirs Dolls: the drawn doll, modelled on Coletta's crochet dolls.
 *
 *   DollArt.render(o, id)  → SVG markup for a 200×290 viewBox: the whole doll
 *   DollArt.tile(style, hair1, hair2, skin, id) → SVG markup for a 60×60 head-and-hair tile
 *
 * o = { skin, hair1, hair2?, style, kind, topC, botC, shoe, shoeC, bow, bowC, glasses, crown }
 * `id` keeps gradient and pattern ids unique when several dolls share a page.
 *
 * Her dolls are tall and slim, with a big oval head, shiny black eyes, a
 * small nose and a stitched smile; long yarn locs or braids that hang behind
 * and over the shoulders (often with ombre ends); a crown on the shirt; and
 * chunky sneakers. Everything wears a faint crochet-stitch texture.
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
    const stops = c2
      ? `<stop offset="0" stop-color="${c1}"/><stop offset=".4" stop-color="${c1}"/><stop offset=".78" stop-color="${c2}"/><stop offset="1" stop-color="${c2}"/>`
      : `<stop offset="0" stop-color="${shade(c1, 0.06)}"/><stop offset="1" stop-color="${shade(c1, -0.14)}"/>`;
    const k = h.ry / 36;
    return `<defs>
      <pattern id="${id}-knit" width="${f(5 * k)}" height="${f(4 * k)}" patternUnits="userSpaceOnUse"><path d="M0 ${f(.8 * k)}l${f(1.25 * k)} ${f(1.7 * k)} ${f(1.25 * k)} ${f(-1.7 * k)}M${f(2.5 * k)} ${f(.8 * k)}l${f(1.25 * k)} ${f(1.7 * k)} ${f(1.25 * k)} ${f(-1.7 * k)}" fill="none" stroke="rgba(0,0,0,.14)" stroke-width="${f(.6 * k)}"/></pattern>
      <linearGradient id="${id}-hair" gradientUnits="userSpaceOnUse" x1="0" y1="${f(top)}" x2="0" y2="${f(bot)}">${stops}</linearGradient>
    </defs>`;
  }

  /* Hair: { back } is drawn behind the body, { over } in front of the
     shoulders, { front } on top of the head. P is the hair paint. */
  function hair(style, P, h, c1, K) {
    const { cx, cy, rx, ry } = h; const s = ry / 36;
    const dark = shade(c1, -0.35);
    const strand = (x0, y0, x1, y1, w, bend, tex) => {
      const d = `M${f(x0)} ${f(y0)}Q${f((x0 + x1) / 2 + bend)} ${f((y0 + y1) / 2)} ${f(x1)} ${f(y1)}`;
      return `<path d="${d}" fill="none" stroke="${P}" stroke-width="${f(w)}" stroke-linecap="round"/>`
        + (tex ? `<path d="${d}" fill="none" stroke="${tex.c}" stroke-width="${f(w * tex.w)}" stroke-dasharray="${tex.d}" stroke-linecap="round"/>` : '');
    };
    const hang = (n, w, endY, spread, tex, frontEach, frontLen) => {
      let back = '', over = '';
      for (let i = 0; i < n; i++) {
        const t = n === 1 ? 0.5 : i / (n - 1);
        const a = Math.PI * (0.97 + 1.06 * t);                    // from beside one ear, over the top, to the other
        const x0 = cx + Math.cos(a) * rx * 0.94, y0 = cy + Math.sin(a) * ry * 0.94;
        const x1 = cx + (x0 - cx) * spread, y1 = endY - Math.abs(t - 0.5) * 14 * s;
        back += strand(x0, y0, x1, y1, w, (t - 0.5) * 8 * s, tex);
      }
      for (let k = 0; k < frontEach; k++) for (const side of [-1, 1]) {
        const x0 = cx + side * rx * (0.88 - k * 0.1), y0 = cy - ry * (0.3 - k * 0.1);
        const x1 = cx + side * rx * (0.96 + k * 0.16), y1 = cy + ry * (frontLen - k * 0.2);
        over += strand(x0, y0, x1, y1, w, side * 3 * s, tex);
      }
      return { back, over };
    };
    const capD = `M${f(cx - rx * 1.03)} ${f(cy + ry * 0.12)}C${f(cx - rx * 1.1)} ${f(cy - ry * 1.42)} ${f(cx + rx * 1.1)} ${f(cy - ry * 1.42)} ${f(cx + rx * 1.03)} ${f(cy + ry * 0.12)}`
      + `C${f(cx + rx * 0.86)} ${f(cy - ry * 0.18)} ${f(cx + rx * 0.5)} ${f(cy - ry * 0.56)} ${f(cx)} ${f(cy - ry * 0.5)}`
      + `C${f(cx - rx * 0.5)} ${f(cy - ry * 0.56)} ${f(cx - rx * 0.86)} ${f(cy - ry * 0.18)} ${f(cx - rx * 1.03)} ${f(cy + ry * 0.12)}Z`;
    const cap = `<path d="${capD}" fill="${P}"/><path d="${capD}" fill="${K}"/>`;
    const blob = (x, y, r) => `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}" fill="${P}"/><circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}" fill="${K}"/>`;
    const ring = (x, y, r, n, br) => Array.from({ length: n }, (_, i) => { const a = (i / n) * Math.PI * 2; return blob(x + Math.cos(a) * r, y + Math.sin(a) * r, br); }).join('');
    const tie = (x, y, r) => `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}" fill="none" stroke="#c8952a" stroke-width="${f(2.2 * s)}"/>`;
    switch (style) {
      case 'locs': { const H = hang(19, 7.6 * s, cy + ry * 3.4, 1.78, { c: 'rgba(0,0,0,.22)', w: .5, d: `${f(2.2 * s)} ${f(2.6 * s)}` }, 3, 3.0); return { back: H.back, over: H.over, front: cap }; }
      case 'box-braids': { const H = hang(27, 4.8 * s, cy + ry * 3.55, 1.72, { c: 'rgba(255,255,255,.22)', w: .45, d: `${f(1.8 * s)} ${f(1.6 * s)}` }, 4, 3.1); return { back: H.back, over: H.over, front: cap }; }
      case 'twists': { const H = hang(21, 5.8 * s, cy + ry * 2.75, 1.75, { c: 'rgba(0,0,0,.3)', w: .6, d: `${f(1.5 * s)} ${f(2.2 * s)}` }, 3, 2.3); return { back: H.back, over: H.over, front: cap }; }
      case 'cornrows': {
        let rows = '';
        for (let i = 0; i < 6; i++) {
          const x = cx - rx * 0.72 + i * rx * 0.288;
          rows += `<path d="M${f(x)} ${f(cy - ry * 0.48)}Q${f(x + (x - cx) * 0.15)} ${f(cy - ry * 0.95)} ${f(cx + (x - cx) * 0.45)} ${f(cy - ry * 1.08)}" fill="none" stroke="${dark}" stroke-width="${f(1.3 * s)}" stroke-dasharray="${f(2 * s)} ${f(1.2 * s)}"/>`;
        }
        let back = '';
        for (let i = 0; i < 6; i++) { const x = cx - rx * 0.55 + i * rx * 0.22; back += strand(x, cy + ry * 0.3, x + (x - cx) * 0.25, cy + ry * 1.75, 3.6 * s, 0, { c: 'rgba(255,255,255,.2)', w: .45, d: `${f(1.8 * s)} ${f(1.6 * s)}` }); }
        return { back, over: '', front: cap + rows };
      }
      case 'afro-puffs': {
        const L = [cx - rx * 0.98, cy - ry * 0.78], R = [cx + rx * 0.98, cy - ry * 0.78], r = rx * 0.6;
        const puff = ([x, y]) => blob(x, y, r) + ring(x, y, r * 0.92, 10, r * 0.24);
        return { back: puff(L) + puff(R), over: '', front: cap + tie(L[0] + rx * 0.32, L[1] + ry * 0.36, 3.2 * s) + tie(R[0] - rx * 0.32, R[1] + ry * 0.36, 3.2 * s) };
      }
      case 'curly-afro': {
        const x = cx, y = cy - ry * 0.32, r = rx * 1.48;
        let fringe = '';
        for (let i = 0; i < 7; i++) { const a = Math.PI * (1.12 + 0.76 * (i / 6)); fringe += blob(cx + Math.cos(a) * rx * 0.86, cy - ry * 0.18 + Math.sin(a) * ry * 0.62, rx * 0.2); }
        return { back: blob(x, y, r) + ring(x, y, r * 0.95, 16, r * 0.22), over: '', front: cap + fringe };
      }
      case 'bantu-knots': {
        let knots = '';
        for (let i = 0; i < 5; i++) {
          const a = Math.PI * (1.12 + 0.76 * (i / 4)), x = cx + Math.cos(a) * rx * 0.9, y = cy - ry * 0.2 + Math.sin(a) * ry * 0.98, r = rx * 0.25;
          knots += blob(x, y, r) + `<path d="M${f(x)} ${f(y - r * 0.55)}a${f(r * 0.55)} ${f(r * 0.55)} 0 1 1 ${f(-r * 0.5)} ${f(r * 0.6)}" fill="none" stroke="${dark}" stroke-width="${f(1.1 * s)}"/>`;
        }
        return { back: '', over: '', front: cap + knots };
      }
      case 'straight': {
        const d = `M${f(cx - rx * 1.06)} ${f(cy - ry * 0.3)}C${f(cx - rx * 1.28)} ${f(cy + ry * 1.1)} ${f(cx - rx * 1.22)} ${f(cy + ry * 1.9)} ${f(cx - rx * 1.02)} ${f(cy + ry * 2.3)}L${f(cx + rx * 1.02)} ${f(cy + ry * 2.3)}C${f(cx + rx * 1.22)} ${f(cy + ry * 1.9)} ${f(cx + rx * 1.28)} ${f(cy + ry * 1.1)} ${f(cx + rx * 1.06)} ${f(cy - ry * 0.3)}Z`;
        const part = `<path d="M${f(cx - rx * 0.32)} ${f(cy - ry * 1.02)}Q${f(cx - rx * 0.3)} ${f(cy - ry * 0.75)} ${f(cx - rx * 0.22)} ${f(cy - ry * 0.52)}" fill="none" stroke="${dark}" stroke-width="${f(1.2 * s)}"/>`;
        return { back: `<path d="${d}" fill="${P}"/><path d="${d}" fill="${K}"/>`, over: '', front: cap + part };
      }
      case 'ponytail': {
        const x = cx + rx * 0.5, y = cy - ry * 0.86;
        const d = `M${f(x)} ${f(y)}C${f(x + rx * 0.95)} ${f(y + ry * 0.2)} ${f(x + rx * 0.75)} ${f(y + ry * 1.7)} ${f(x + rx * 0.35)} ${f(y + ry * 2.95)}C${f(x + rx * 0.05)} ${f(y + ry * 2.2)} ${f(x + rx * 0.15)} ${f(y + ry * 0.95)} ${f(x - rx * 0.2)} ${f(y + ry * 0.25)}Z`;
        return { back: `<path d="${d}" fill="${P}"/><path d="${d}" fill="${K}"/>`, over: '', front: cap + tie(x, y + ry * 0.05, 3.4 * s) };
      }
      case 'bun': {
        const x = cx, y = cy - ry * 1.16, r = rx * 0.5;
        return { back: '', over: '', front: cap + blob(x, y, r) + `<path d="M${f(x)} ${f(y - r * 0.6)}a${f(r * 0.6)} ${f(r * 0.6)} 0 1 1 ${f(-r * 0.55)} ${f(r * 0.65)}" fill="none" stroke="${dark}" stroke-width="${f(1.3 * s)}"/>` };
      }
      default: return { back: '', over: '', front: cap };
    }
  }

  function face(h, S) {
    const { cx, cy, rx, ry } = h; const s = ry / 36;
    const ex = rx * 0.38, ey = cy + ry * 0.16, er = 4.3 * s;
    const eye = x => `<circle cx="${f(x)}" cy="${f(ey)}" r="${f(er)}" fill="#141210"/><circle cx="${f(x + er * 0.32)}" cy="${f(ey - er * 0.36)}" r="${f(er * 0.3)}" fill="#fff"/>`;
    const brow = x => `<path d="M${f(x - 5 * s)} ${f(ey - 9 * s)}q${f(5 * s)} ${f(-3 * s)} ${f(10 * s)} 0" fill="none" stroke="#2a1d17" stroke-width="${f(1.5 * s)}" stroke-linecap="round"/>`;
    return eye(cx - ex) + eye(cx + ex) + brow(cx - ex) + brow(cx + ex)
      + `<ellipse cx="${cx}" cy="${f(cy + ry * 0.44)}" rx="${f(3.8 * s)}" ry="${f(3.1 * s)}" fill="${shade(S, -0.18)}"/>`
      + `<path d="M${f(cx - 6 * s)} ${f(cy + ry * 0.66)}q${f(6 * s)} ${f(4.5 * s)} ${f(12 * s)} 0" fill="none" stroke="#5a2a22" stroke-width="${f(1.8 * s)}" stroke-linecap="round"/>`;
  }

  function render(o, id) {
    id = id || 'doll';
    const S = o.skin || '#c4986c', h = { cx: 100, cy: 66, rx: 33, ry: 36 };
    const c1 = o.hair1 || '#2a1d17', P = `url(#${id}-hair)`, K = `url(#${id}-knit)`;
    const H = hair(o.style || 'locs', P, h, c1, K);
    const fp = (d, fill, extra) => `<path d="${d}" fill="${fill}"${extra || ''}/><path d="${d}" fill="${K}"/>`;
    const limb = (x1, y1, x2, y2, w, c) => [c, K].map(p => `<path d="M${x1} ${y1}L${x2} ${y2}" fill="none" stroke="${p}" stroke-width="${w}" stroke-linecap="round"/>`).join('');
    const ball = (x, y, r, c) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${c}"/><circle cx="${x}" cy="${y}" r="${r}" fill="${K}"/>`;
    const topC = o.topC || '#a0624a', botC = o.botC || '#4a6a94', kind = o.kind || 'pants';

    // Bottoms, then the top over the waistband.
    const T = 'M71 112 Q100 100 129 112 L132 188 Q100 196 68 188 Z';
    let bottoms = '', over = '';
    if (kind === 'skirt')  bottoms = fp('M70 180 L130 180 L140 224 Q100 233 60 224 Z', botC);
    if (kind === 'shorts') bottoms = fp('M70 180 H130 L131 214 H104 L101 200 H99 L96 214 H69 Z', botC);
    if (kind === 'pants')  bottoms = fp('M70 180 H130 L125 256 H104 L101 204 H99 L96 256 H75 Z', botC);
    if (kind === 'tutu')   bottoms = fp('M66 180 Q100 172 134 180 L152 212 Q100 226 48 212 Z', botC, ' opacity=".85"') + fp('M68 182 Q100 175 132 182 L144 206 Q100 216 56 206 Z', shade(botC, 0.15));
    if (kind === 'dress')  over = fp('M70 168 L130 168 L144 232 Q100 244 56 232 Z', topC);
    const sleeves = limb(73, 119, 68, 150, 18.5, topC) + limb(127, 119, 132, 150, 18.5, topC);
    const neckline = fp('M91 108 Q100 120 109 108 Z', S);
    const crownC = lum(topC) > 0.6 ? '#7a5512' : '#e0aa35';
    const emblem = `<path d="M92 147 l1.8 -9 l4 5 l2.2 -7 l2.2 7 l4 -5 l1.8 9 z" fill="${crownC}"/>`;

    const shoeC = o.shoeC || '#f7f4ee', sole = lum(shoeC) > 0.75 ? '#d9d2c6' : shade(shoeC, -0.3), line = lum(shoeC) > 0.5 ? '#3a2f28' : '#f3efe8';
    const shoeR = x => {
      switch (o.shoe) {
        case 'boots':   return fp(`M${x - 9} 226 H${x + 9} V250 Q${x + 17} 251 ${x + 17} 259 V265 H${x - 10} Z`, shoeC);
        case 'sandals': return `<path d="M${x - 10} 260 H${x + 16} V265 H${x - 10} Z" fill="${shoeC}"/><path d="M${x - 7} 254 L${x + 10} 254 M${x - 3} 249 L${x + 9} 258" stroke="${shoeC}" stroke-width="3" stroke-linecap="round"/>`;
        case 'heels':   return fp(`M${x - 9} 252 Q${x - 9} 247 ${x - 3} 247 H${x + 4} Q${x + 15} 251 ${x + 16} 262 H${x - 4} L${x - 6} 266 H${x - 9} Z`, shoeC);
        case 'flats':   return fp(`M${x - 10} 255 Q${x - 10} 250 ${x - 3} 250 H${x + 5} Q${x + 15} 252 ${x + 16} 262 V265 H${x - 10} Z`, shoeC) + `<path d="M${x - 6} 252 H${x + 7}" stroke="${line}" stroke-width="1.6" opacity=".55"/>`;
        default:        return fp(`M${x - 11} 254 Q${x - 11} 246 ${x - 3} 246 H${x + 5} Q${x + 15} 248 ${x + 17} 259 V266 H${x - 12} Z`, shoeC, ` stroke="${shade(shoeC, -0.45)}" stroke-width=".9"`)
                          + `<path d="M${x - 12} 262 H${x + 17}" stroke="${sole}" stroke-width="3.2"/>`
                          + `<path d="M${x - 3} 250 l4 4 M${x + 1} 249 l4 4" stroke="${line}" stroke-width="1.2" stroke-linecap="round"/>`;
      }
    };
    const shoes = `<g transform="translate(174 0) scale(-1 1)">${shoeR(87)}</g>` + shoeR(113);

    const crownTop = o.style === 'curly-afro' ? h.cy - h.ry * 1.8 : o.style === 'bun' ? h.cy - h.ry * 0.82 : h.cy - h.ry * 1.1;   // in front of a top bun, not over it
    const extras = (o.crown ? `<path d="M84 ${crownTop} l3 -15 l6.5 8 l6.5 -12 l6.5 12 l6.5 -8 l3 15 z" fill="#c8952a" stroke="#8a6414" stroke-width="1"/>` : '')
      + (o.bow ? (bx => `<path d="M${bx} 40 l13 -8 v17z M${bx} 40 l-13 -8 v17z" fill="${o.bowC || '#e07fa8'}"/><circle cx="${bx}" cy="40" r="3.6" fill="${o.bowC || '#e07fa8'}" stroke="rgba(0,0,0,.2)"/>`)(122) : '')
      + (o.glasses ? `<g fill="none" stroke="#1f1d1b" stroke-width="2"><circle cx="87.5" cy="72" r="8.5"/><circle cx="112.5" cy="72" r="8.5"/><path d="M96 72 h8"/></g>` : '');

    return defs(id, h, c1, o.hair2)
      + H.back
      + limb(87, 186, 87, 252, 17, S) + limb(113, 186, 113, 252, 17, S)                 // legs
      + limb(73, 120, 63, 188, 14, S) + limb(127, 120, 137, 188, 14, S)                 // arms
      + ball(62, 193, 8, S) + ball(138, 193, 8, S)                                         // hands
      + `<rect x="91" y="94" width="18" height="20" rx="4" fill="${S}"/>`
      + bottoms + fp(T, topC) + over + sleeves + neckline + emblem
      + shoes
      + ball(67, 72, 6, S) + ball(133, 72, 6, S)                                           // ears
      + `<ellipse cx="${h.cx}" cy="${h.cy}" rx="${h.rx}" ry="${h.ry}" fill="${S}"/><ellipse cx="${h.cx}" cy="${h.cy}" rx="${h.rx}" ry="${h.ry}" fill="${K}"/>`
      + face(h, S)
      + H.over + H.front + extras;
  }

  function tile(style, hair1, hair2, skin, id) {
    const h = { cx: 30, cy: 30, rx: 12.5, ry: 13.6 }, S = skin || '#c4986c';
    const c1 = hair1 || '#2a1d17', P = `url(#${id}-hair)`, K = `url(#${id}-knit)`;
    const H = hair(style, P, h, c1, K);
    const er = 1.7;
    return defs(id, h, c1, hair2) + H.back
      + `<rect x="26.5" y="40" width="7" height="12" rx="2" fill="${S}"/>`
      + `<ellipse cx="${h.cx}" cy="${h.cy}" rx="${h.rx}" ry="${h.ry}" fill="${S}"/><ellipse cx="${h.cx}" cy="${h.cy}" rx="${h.rx}" ry="${h.ry}" fill="${K}"/>`
      + `<circle cx="25.3" cy="32.3" r="${er}" fill="#141210"/><circle cx="34.7" cy="32.3" r="${er}" fill="#141210"/>`
      + H.over + H.front;
  }

  root.DollArt = { render, tile, shade };
})(typeof window !== 'undefined' ? window : globalThis);
