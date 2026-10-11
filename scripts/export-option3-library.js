#!/usr/bin/env node
'use strict';
/**
 * Crown Heirs Doll Maker: Option 3 library exporter.
 *
 * Renders one finished image per combination, for store listings:
 *   base × complexion × hair style × main hair colour × top × bottom × shoes
 * (each garment colour counts as its own variant). Highlights, accessories,
 * reveal settings and side or back views are left out.
 *
 * In full that is 2 × 5 × 12 × 12 = 1,440 batches of 15 × 19 × 9 = 2,565
 * images: about 3.7 million images (roughly 100 GB as SVG), so run it in
 * slices or on a machine sized for it. Use --dry-run to count first.
 *
 * Each batch is one base, complexion, hair style and hair colour:
 *   <out>/<base>/<shade>/<style>/<hairColor>/images/<file>
 *   <out>/<base>/<shade>/<style>/<hairColor>/manifest.csv   one row per image
 *   <out>/<base>/<shade>/<style>/<hairColor>/batch.json     counts, when done
 *   <out>/manifests/batches.csv                              every finished batch
 * Each manifest row carries a product title and a link that reopens the look
 * in the Doll Maker. Files already on disk are skipped, so a stopped run
 * picks up where it left off; manifests are rewritten, never duplicated.
 *
 * Rasters (png, webp) are drawn by headless Chromium, the same engine that
 * draws the doll on the site (needs `playwright-core` and a Chromium; set
 * CHROME_PATH if it isn't found). --renderer imagemagick uses `magick` or
 * `convert` instead. Crown Heirs marks are embedded from their source files.
 *
 * Examples:
 *   node scripts/export-option3-library.js --dry-run
 *   node scripts/export-option3-library.js --base girl --shade caramel --style locs --hair-color black --format webp
 *   node scripts/export-option3-library.js --all --format webp --out ./exports/option3 --zip
 */
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const run = promisify(execFile);

const D = require('../lib/doll-catalog');             // the live catalog (no server code, runs anywhere)
require('../public/doll-art.js');
const A = globalThis.DollArt;

const PUBLIC = path.join(__dirname, '..', 'public');
const VIEW = { w: 200, h: 290 };
const SITE = process.env.SITE_URL || 'https://crown-heirs.vercel.app';

// ---------- CLI ----------

function parseArgs(argv) {
  const args = { all: false, base: null, shade: null, style: null, hairColor: null, format: 'svg', out: path.resolve('exports', 'option3'),
    renderer: 'chromium', width: 1200, quality: 0.9, background: null, skipExisting: true, zip: false, zipImages: 500, contactSheet: false, dryRun: false, limit: null, concurrency: 4 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i], next = () => { const v = argv[++i]; if (v == null) throw new Error(`${a} needs a value`); return v; };
    if (a === '--all') args.all = true;
    else if (a === '--base') args.base = next();
    else if (a === '--shade') args.shade = next();
    else if (a === '--style') args.style = next();
    else if (a === '--hair-color') args.hairColor = next();
    else if (a === '--format') args.format = next();
    else if (a === '--out') args.out = path.resolve(next());
    else if (a === '--renderer') args.renderer = next();
    else if (a === '--width') args.width = Math.max(50, Number(next()) || 1200);
    else if (a === '--quality') args.quality = Math.min(1, Math.max(0.1, Number(next()) || 0.9));
    else if (a === '--background') args.background = next();
    else if (a === '--no-skip-existing') args.skipExisting = false;
    else if (a === '--resume') args.skipExisting = true;         // kept for the original CLI; skipping is the default
    else if (a === '--contact-sheet') args.contactSheet = true;
    else if (a === '--zip-images') { args.zipImages = Number(next()); if (!Number.isSafeInteger(args.zipImages) || args.zipImages < 1) throw new Error('--zip-images must be a positive integer'); }
    else if (a === '--zip') args.zip = true;
    else if (a === '--dry-run') args.dryRun = true;
    else if (a === '--limit') args.limit = Math.max(1, Number(next()) || 1);
    else if (a === '--concurrency') args.concurrency = Math.max(1, Number(next()) || 1);
    else if (a === '--help' || a === '-h') args.help = true;
    else throw new Error(`Unknown argument: ${a}`);
  }
  if (!['svg', 'png', 'webp', 'both'].includes(args.format)) throw new Error('--format must be svg, png, webp or both (svg + webp)');
  if (!['chromium', 'imagemagick'].includes(args.renderer)) throw new Error('--renderer must be chromium or imagemagick');
  if (args.background && !/^(#[0-9a-f]{3}|#[0-9a-f]{6}|[a-z]+)$/i.test(args.background)) throw new Error('--background must be a colour like #ffffff');
  if (!args.help && !args.all && !args.base && !args.shade && !args.style && !args.hairColor && !args.dryRun) throw new Error('Pick a slice (--base, --shade, --style, --hair-color), or --all for everything');
  return args;
}

const HELP = `
Crown Heirs Option 3 exporter: one image per base, complexion, hair, top, bottom and shoes.

  node scripts/export-option3-library.js [filters] [output] [control]

Filters (leave one out to include all of it):
  --base girl|boy   --shade <id>   --style <id>   --hair-color <id>   --all

Output:
  --format svg|png|webp|both     default svg; both = svg + webp
  --out <dir>                    default ./exports/option3
  --width <px>                   raster width, default 1200 (height follows, 200:290)
  --quality <0.1-1>              webp quality, default 0.9
  --background <colour>          raster background, default transparent
  --renderer chromium|imagemagick
  --zip                          zip each batch in numbered parts (500 images per part)
  --zip-images <n>               maximum images per ZIP part
  --contact-sheet                include a 16-look SVG contact sheet

Control:
  --dry-run                      count and show a sample name; writes nothing
  --limit <n>                    first n images of each batch (smoke tests)
  --concurrency <n>              default 4
  --no-skip-existing             re-render files already on disk
`;

// ---------- Catalog ----------

const byId = (list, id) => list.find(x => x.id === id);
const hex = id => (byId(D.GARMENT_COLORS, id) || {}).hex;
function variants(list) {
  return list.flatMap(it => (it.colors && it.colors.length ? it.colors : [null]).map(color => ({ id: it.id, color, token: color ? `${it.id}-${color}` : it.id })));
}
const TOPS = variants(D.TOPS), BOTTOMS = variants(D.BOTTOMS), SHOES = variants(D.SHOES);
const PER_BATCH = TOPS.length * BOTTOMS.length * SHOES.length;

function garment(list, id, color) {
  const it = byId(list, id), c = hex(color || (it.colors || [])[0]);
  return { look: it.look, color: c, brand: !!it.brand, main: it.main || c, trim: it.trim || it.main || c };
}
function dollOf(row) {
  return { base: row.base, skin: byId(D.SHADES, row.shade).hex, hair1: byId(D.HAIR_COLORS, row.hairColor).hex, hair2: null, style: row.style,
    top: garment(D.TOPS, row.top.id, row.top.color), bottom: garment(D.BOTTOMS, row.bottom.id, row.bottom.color), shoes: garment(D.SHOES, row.shoes.id, row.shoes.color), accessories: [] };
}
// Words for a listing, as the site writes them.
function titleOf(row) {
  const lower = s => s.toLowerCase().replace(/crown heirs/g, 'Crown Heirs');
  const doll = `${byId(D.SHADES, row.shade).name} ${row.base}, ${lower(byId(D.HAIR_COLORS, row.hairColor).name)} ${lower(byId(D.HAIR_STYLES, row.style).name)}`;
  return `${doll} · ${D.itemName(D.TOPS, row.top.id, row.top.color)}, ${D.itemName(D.BOTTOMS, row.bottom.id, row.bottom.color)}, ${D.itemName(D.SHOES, row.shoes.id, row.shoes.color)}`;
}
// The Doll Maker link that reopens this exact look.
function lookUrl(row) {
  const g = v => v.id + (v.color ? '.' + v.color : '');       // every garment with colours carries one
  return `${SITE}/dolls?b=${row.base}&c=${row.shade}&h=${row.style}&hc=${row.hairColor}&t=${g(row.top)}&p=${g(row.bottom)}&s=${g(row.shoes)}&step=reveal`;
}

function batchesFor(args) {
  const pick = (list, id, what) => { if (id && !byId(list, id)) throw new Error(`Unknown ${what}: ${id}`); return id ? list.filter(x => x.id === id) : list; };
  const out = [];
  for (const b of pick(D.BASES, args.base, 'base')) for (const s of pick(D.SHADES, args.shade, 'shade'))
    for (const h of pick(D.HAIR_STYLES, args.style, 'hair style')) for (const c of pick(D.HAIR_COLORS, args.hairColor, 'hair colour'))
      out.push({ base: b.id, shade: s.id, style: h.id, hairColor: c.id });
  return out;
}
const batchKey = b => [b.base, b.shade, b.style, b.hairColor].join('__');
const batchDir = (out, b) => path.join(out, b.base, b.shade, b.style, b.hairColor);
function rowsFor(batch) {
  const rows = [];
  for (const top of TOPS) for (const bottom of BOTTOMS) for (const shoes of SHOES) rows.push({ ...batch, top, bottom, shoes });
  return rows;
}
const stemOf = r => [r.base, r.shade, r.style, r.hairColor, r.top.token, r.bottom.token, r.shoes.token].join('_');

// ---------- SVG ----------

const embedded = new Map();
function svgOf(row) {
  const body = A.render(dollOf(row), 'doll').replace(/<image href="([^"]+)"/g, (m, src) => {
    if (!embedded.has(src)) embedded.set(src, 'data:image/png;base64,' + fs.readFileSync(path.join(PUBLIC, src)).toString('base64'));
    return `<image xlink:href="${embedded.get(src)}" href="${embedded.get(src)}"`;
  });
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
  // width and height are set, so any renderer draws it at full size rather than enlarging a small one.
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${VIEW.w} ${VIEW.h}" width="${VIEW.w}" height="${VIEW.h}">\n<title>${esc(titleOf(row))}</title>\n${body}\n</svg>\n`;
}

// ---------- Rasterizers ----------

async function chromiumRenderer(args) {
  let pw;
  for (const name of ['playwright-core', 'playwright']) { try { pw = require(name); break; } catch (e) { /* try the next */ } }
  if (!pw) throw new Error('png/webp need playwright-core or playwright (npm i --no-save playwright-core) and a Chromium, or use --renderer imagemagick');
  const browser = await pw.chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
  const pages = await Promise.all(Array.from({ length: args.concurrency }, () => browser.newPage()));
  const free = pages.slice();
  const height = Math.round(args.width * VIEW.h / VIEW.w);
  return {
    async draw(svg, file, type) {
      while (!free.length) await new Promise(r => setTimeout(r, 5));
      const page = free.pop();
      try {
        const data = await page.evaluate(async ({ svg, w, h, type, q, bg }) => {
          const img = new Image(); img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg))); await img.decode();
          const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d');
          if (bg) { x.fillStyle = bg; x.fillRect(0, 0, w, h); }
          x.drawImage(img, 0, 0, w, h);
          return c.toDataURL(type === 'webp' ? 'image/webp' : 'image/png', q).split(',')[1];
        }, { svg, w: args.width, h: height, type, q: args.quality, bg: args.background });
        await fsp.writeFile(file, Buffer.from(data, 'base64'));
      } finally { free.push(page); }
    },
    close: () => browser.close()
  };
}

async function imagemagickRenderer(args) {
  const bin = await run('magick', ['-version']).then(() => 'magick', () => run('convert', ['-version']).then(() => 'convert', () => null));
  if (!bin) throw new Error('ImageMagick (magick or convert) not found');
  // Density is set so the 200-unit-wide SVG is drawn at the target width, not drawn small and enlarged.
  const density = String(96 * args.width / VIEW.w);
  return {
    async draw(svg, file, type) {
      const tmp = file + '.tmp.svg'; await fsp.writeFile(tmp, svg);
      try { await run(bin, ['-background', args.background || 'none', '-density', density, tmp, ...(type === 'webp' ? ['-quality', String(Math.round(args.quality * 100))] : []), `${type}:${file}`]); }
      finally { await fsp.unlink(tmp).catch(() => {}); }
    },
    close: async () => {}
  };
}

// ---------- CSV ----------

const ROW_HEAD = ['filename', 'title', 'base', 'shade', 'hair_style', 'hair_color', 'top_id', 'top_color', 'bottom_id', 'bottom_color', 'shoe_id', 'shoe_color', 'format', 'width', 'height', 'batch_key', 'relative_path', 'look_url'];
const BATCH_HEAD = ['batch_key', 'base', 'shade', 'hair_style', 'hair_color', 'expected_count', 'image_count', 'zip_file', 'status', 'completed_at'];
const cell = v => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const csv = (head, rows) => [head, ...rows].map(r => r.map(cell).join(',')).join('\n') + '\n';

// ---------- Export ----------

async function exportBatch(batch, args, renderer) {
  const dir = batchDir(args.out, batch), imagesDir = path.join(dir, 'images');
  let rows = rowsFor(batch); if (args.limit) rows = rows.slice(0, args.limit);
  await fsp.mkdir(imagesDir, { recursive: true });
  const ext = args.format === 'png' ? 'png' : args.format === 'svg' ? 'svg' : 'webp';
  const height = Math.round(args.width * VIEW.h / VIEW.w);
  let i = 0, made = 0;
  const lines = [];
  await Promise.all(Array.from({ length: Math.min(args.concurrency, rows.length) }, async () => {
    while (i < rows.length) {
      const row = rows[i++], stem = stemOf(row), file = path.join(imagesDir, `${stem}.${ext}`);
      if (!(args.skipExisting && fs.existsSync(file) && (args.format !== 'both' || fs.existsSync(path.join(imagesDir, `${stem}.svg`))))) {
        const svg = svgOf(row);
        if (args.format === 'svg' || args.format === 'both') await fsp.writeFile(path.join(imagesDir, `${stem}.svg`), svg);
        if (args.format !== 'svg') await renderer.draw(svg, file, ext);
        made++;
      }
      lines.push([path.basename(file), titleOf(row), row.base, row.shade, row.style, row.hairColor, row.top.id, row.top.color, row.bottom.id, row.bottom.color, row.shoes.id, row.shoes.color,
        ext, ext === 'svg' ? '' : args.width, ext === 'svg' ? '' : height, batchKey(batch), path.relative(args.out, file), lookUrl(row)]);
    }
  }));
  lines.sort((a, b) => a[0] < b[0] ? -1 : 1);
  await fsp.writeFile(path.join(dir, 'manifest.csv'), csv(ROW_HEAD, lines));
  const meta = { batchKey: batchKey(batch), ...batch, expectedCount: PER_BATCH, imageCount: lines.length, renderedThisRun: made, format: args.format, width: ext === 'svg' ? null : args.width,
    status: lines.length === PER_BATCH ? 'complete' : 'partial', completedAt: new Date().toISOString() };
  if (args.contactSheet) {
    // Evenly spaced looks cover the catalog rather than only the first top.
    const selected = Array.from({ length: Math.min(16, rows.length) }, (_, n) => rows[Math.round(n * (rows.length - 1) / Math.max(1, Math.min(16, rows.length) - 1))]);
    const tiles = selected.map((row, n) => {
      const data = fs.readFileSync(path.join(imagesDir, `${stemOf(row)}.${ext}`)).toString('base64');
      const mime = ext === 'svg' ? 'image/svg+xml' : `image/${ext}`;
      return `<g transform="translate(${(n % 4) * 220} ${Math.floor(n / 4) * 320})"><image href="data:${mime};base64,${data}" width="200" height="290"/><text x="100" y="306" text-anchor="middle" font-size="12">${n + 1}</text></g>`;
    }).join('');
    await fsp.writeFile(path.join(dir, 'contact-sheet.svg'), `<svg xmlns="http://www.w3.org/2000/svg" width="880" height="1280" viewBox="0 0 880 1280"><rect width="880" height="1280" fill="#f7f4ee"/>${tiles}</svg>`);
    await fsp.writeFile(path.join(dir, 'contact-sheet.csv'), csv(['number', 'filename'], selected.map((row, n) => [n + 1, `${stemOf(row)}.${ext}`])));
    meta.contactSheet = 'contact-sheet.svg';
  }
  meta.zipFiles = args.zip ? Array.from({ length: Math.ceil(lines.length / args.zipImages) }, (_, n) => `${batchKey(batch)}__part-${String(n + 1).padStart(3, '0')}.zip`) : [];
  await fsp.writeFile(path.join(dir, 'batch.json'), JSON.stringify(meta, null, 2) + '\n');
  for (const [n, zipFile] of meta.zipFiles.entries()) {
    await fsp.unlink(path.join(dir, zipFile)).catch(() => {});
    const files = lines.slice(n * args.zipImages, (n + 1) * args.zipImages).flatMap(line => {
      const file = `images/${line[0]}`;
      return args.format === 'both' ? [file, file.replace(/\.webp$/, '.svg')] : [file];
    });
    await run('zip', ['-q', zipFile, ...files, 'manifest.csv', 'batch.json', ...(args.contactSheet ? ['contact-sheet.svg', 'contact-sheet.csv'] : [])], { cwd: dir }).catch(e => { throw new Error('--zip needs the zip command: ' + e.message); });
  }
  return meta;
}

// Rebuilt from every batch.json under the output, so re-runs never duplicate a line.
async function writeBatchesCsv(out) {
  const found = [];
  const walk = async dir => { for (const e of await fsp.readdir(dir, { withFileTypes: true }).catch(() => [])) {
    const p = path.join(dir, e.name);
    if (e.isDirectory() && e.name !== 'images' && e.name !== 'manifests') await walk(p);
    else if (e.name === 'batch.json') found.push(JSON.parse(await fsp.readFile(p, 'utf8')));
  } };
  await walk(out);
  found.sort((a, b) => a.batchKey < b.batchKey ? -1 : 1);
  await fsp.mkdir(path.join(out, 'manifests'), { recursive: true });
  await fsp.writeFile(path.join(out, 'manifests', 'batches.csv'), csv(BATCH_HEAD, found.map(m => [m.batchKey, m.base, m.shade, m.style, m.hairColor, m.expectedCount, m.imageCount,
    (m.zipFiles || (fs.existsSync(path.join(batchDir(out, m), `${m.batchKey}.zip`)) ? [`${m.batchKey}.zip`] : [])).join(';'), m.status, m.completedAt])));
}

async function main(argv) {
  const args = parseArgs(argv);
  if (args.help) return console.log(HELP);
  const batches = batchesFor(args);
  const each = args.limit ? Math.min(args.limit, PER_BATCH) : PER_BATCH;
  console.log(`Crown Heirs Option 3 export\n  batches: ${batches.length.toLocaleString()}\n  images per batch: ${each.toLocaleString()} (of ${PER_BATCH.toLocaleString()})\n  total: ${(batches.length * each).toLocaleString()}\n  format: ${args.format}${args.format === 'svg' ? '' : ` at ${args.width}px, ${args.renderer}`}\n  out: ${args.out}`);
  if (args.dryRun) { if (batches.length) console.log(`  sample: ${stemOf(rowsFor(batches[0])[0])}\n  title:  ${titleOf(rowsFor(batches[0])[0])}`); return; }
  const renderer = args.format === 'svg' ? null : await (args.renderer === 'imagemagick' ? imagemagickRenderer(args) : chromiumRenderer(args));
  try {
    for (const [n, batch] of batches.entries()) {
      const t = Date.now(), meta = await exportBatch(batch, args, renderer);
      console.log(`[${n + 1}/${batches.length}] ${meta.batchKey}: ${meta.imageCount} images (${meta.renderedThisRun} new) in ${((Date.now() - t) / 1000).toFixed(1)}s, ${meta.status}`);
      await writeBatchesCsv(args.out);
    }
  } finally { if (renderer) await renderer.close(); }
  console.log('Done.');
}

if (require.main === module) main(process.argv.slice(2)).catch(e => { console.error('\nExport failed:', e.message || e); process.exitCode = 1; });
module.exports = { parseArgs, batchesFor, rowsFor, stemOf, titleOf, lookUrl, svgOf, PER_BATCH, TOPS, BOTTOMS, SHOES };
