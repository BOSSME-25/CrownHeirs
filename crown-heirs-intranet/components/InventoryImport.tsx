"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { parseCsv } from "@/lib/csv";
import { ITEM_CATEGORIES } from "@/lib/inventory-constants";
import { importInventory, type ImportResult, type ImportRow } from "@/app/inventory/actions";

// Target fields we can import into, with friendly labels and the header
// keywords we use to auto-guess the mapping from the spreadsheet.
const FIELDS: { key: keyof ImportRow; label: string; required?: boolean; guess: string[] }[] = [
  { key: "name", label: "Item name", required: true, guess: ["name", "item", "product", "description"] },
  { key: "brand", label: "Brand", guess: ["brand", "make", "line", "manufacturer"] },
  { key: "category", label: "Category", guess: ["category", "type", "dept", "department", "group"] },
  { key: "sku", label: "SKU / code", guess: ["sku", "code", "upc", "barcode", "id"] },
  { key: "size", label: "Size", guess: ["size", "volume", "oz", "ml"] },
  { key: "unit", label: "Unit", guess: ["unit", "uom", "each"] },
  { key: "cost", label: "Cost", guess: ["cost", "wholesale", "buy"] },
  { key: "retailPrice", label: "Retail price", guess: ["retail", "price", "sell", "msrp"] },
  { key: "onHand", label: "On-hand qty", guess: ["on hand", "onhand", "qty", "quantity", "stock", "count", "in stock"] },
  { key: "reorderPoint", label: "Reorder point", guess: ["reorder", "min", "par", "threshold"] },
  { key: "vendorName", label: "Vendor", guess: ["vendor", "supplier", "distributor"] },
];

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

function autoMap(headers: string[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const f of FIELDS) {
    const hit = headers.find((h) => {
      const n = norm(h);
      return f.guess.some((g) => n === norm(g) || n.includes(norm(g)));
    });
    if (hit) map[f.key] = hit;
  }
  return map;
}

const TEMPLATE =
  "Item name,Brand,Category,SKU,Size,Unit,Cost,Retail price,On-hand qty,Reorder point,Vendor\n" +
  "Hydrating Shampoo,Crown Heirs,Retail,SH-100,12 oz,bottle,8.50,24.00,15,5,Beauty Supply Co\n" +
  "Bond Builder,Olaplex,Back Bar,OLA-3,3.3 oz,bottle,14.00,,6,2,Salon Centric\n";

export default function InventoryImport() {
  const [raw, setRaw] = useState("");
  const [fileName, setFileName] = useState("");
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [defaultCategory, setDefaultCategory] = useState("retail");
  const [updateExisting, setUpdateExisting] = useState(true);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  const parsed = useMemo(() => (raw ? parseCsv(raw) : { headers: [], rows: [] }), [raw]);

  function ingest(text: string) {
    setResult(null);
    setError("");
    setRaw(text);
    const p = parseCsv(text);
    setMapping(autoMap(p.headers));
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => ingest(String(reader.result ?? ""));
    reader.readAsText(file);
  }

  // Build the normalized rows that will be sent to the server.
  const rows: ImportRow[] = useMemo(() => {
    if (!parsed.rows.length || !mapping.name) return [];
    return parsed.rows.map((rec) => {
      const r: ImportRow = {};
      for (const f of FIELDS) {
        const h = mapping[f.key];
        if (h && rec[h] != null && rec[h] !== "") r[f.key] = rec[h];
      }
      return r;
    });
  }, [parsed.rows, mapping]);

  const validRows = rows.filter((r) => (r.name ?? "").trim());
  const withCounts = validRows.filter((r) => r.onHand != null && r.onHand !== "").length;

  function downloadTemplate() {
    const blob = new Blob([TEMPLATE], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "inventory-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  function runImport() {
    setError("");
    startTransition(async () => {
      try {
        const res = await importInventory({ rows: validRows, updateExisting, defaultCategory });
        setResult(res);
      } catch (e) {
        setError((e as Error).message || "Import failed.");
      }
    });
  }

  return (
    <div className="prose">
      {/* Step 1 — choose a file */}
      <div className="card" style={{ cursor: "default", marginBottom: 20 }}>
        <h3>1 · Choose your CSV</h3>
        <p className="muted" style={{ margin: "4px 0 12px" }}>
          Export your spreadsheet as CSV, or{" "}
          <button type="button" className="btn-link" onClick={downloadTemplate}>download a template</button>.
        </p>
        <input type="file" accept=".csv,text/csv,text/plain" onChange={onFile} />
        {fileName && <span className="muted"> {fileName} · {parsed.rows.length} rows</span>}
        <details style={{ marginTop: 12 }}>
          <summary className="muted" style={{ cursor: "pointer" }}>…or paste CSV text</summary>
          <textarea
            rows={5}
            style={{ width: "100%", marginTop: 8, fontFamily: "monospace", fontSize: "0.82rem" }}
            placeholder="Item name,Cost,On-hand qty&#10;…"
            value={raw}
            onChange={(e) => ingest(e.target.value)}
          />
        </details>
      </div>

      {parsed.headers.length > 0 && (
        <>
          {/* Step 2 — map columns */}
          <div className="card" style={{ cursor: "default", marginBottom: 20 }}>
            <h3>2 · Match your columns</h3>
            <p className="muted" style={{ margin: "4px 0 12px" }}>
              We guessed where each field lives — adjust any that are wrong. Only <strong>Item name</strong> is required.
            </p>
            <div className="form-grid">
              {FIELDS.map((f) => (
                <div className="field" key={f.key}>
                  <label htmlFor={`map-${f.key}`}>{f.label}{f.required ? " *" : ""}</label>
                  <select
                    id={`map-${f.key}`}
                    value={mapping[f.key] ?? ""}
                    onChange={(e) => setMapping((m) => ({ ...m, [f.key]: e.target.value }))}
                  >
                    <option value="">— not in my file —</option>
                    {parsed.headers.map((h) => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>

            <div className="form-grid" style={{ marginTop: 12 }}>
              <div className="field">
                <label htmlFor="def-cat">Default category (for blank/unmatched rows)</label>
                <select id="def-cat" value={defaultCategory} onChange={(e) => setDefaultCategory(e.target.value)}>
                  {ITEM_CATEGORIES.map((c) => (
                    <option key={c.id} value={c.id}>{c.label}</option>
                  ))}
                </select>
              </div>
            </div>
            <label style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 12 }}>
              <input type="checkbox" checked={updateExisting} onChange={(e) => setUpdateExisting(e.target.checked)} />
              <span>Update items that already exist (matched by SKU, then name). Unchecked = skip them.</span>
            </label>
          </div>

          {/* Step 3 — preview + import */}
          <div className="card" style={{ cursor: "default", marginBottom: 20 }}>
            <h3>3 · Preview &amp; import</h3>
            {!mapping.name ? (
              <div className="notice">Map the <strong>Item name</strong> column to continue.</div>
            ) : (
              <>
                <p className="muted" style={{ margin: "4px 0 12px" }}>
                  {validRows.length} item{validRows.length === 1 ? "" : "s"} ready
                  {withCounts > 0 && <> · {withCounts} with starting counts</>}.
                </p>
                <table className="data-table">
                  <thead>
                    <tr><th>Item</th><th>Category</th><th>SKU</th><th className="num">Cost</th><th className="num">Retail</th><th className="num">On hand</th><th>Vendor</th></tr>
                  </thead>
                  <tbody>
                    {validRows.slice(0, 8).map((r, i) => (
                      <tr key={i}>
                        <td>{r.name}{r.brand ? <span className="muted"> · {r.brand}</span> : ""}</td>
                        <td><span className="tag">{r.category ?? "(default)"}</span></td>
                        <td>{r.sku ?? "—"}</td>
                        <td className="num">{r.cost ?? "—"}</td>
                        <td className="num">{r.retailPrice ?? "—"}</td>
                        <td className="num">{r.onHand ?? "—"}</td>
                        <td>{r.vendorName ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {validRows.length > 8 && <p className="muted" style={{ marginTop: 8 }}>…and {validRows.length - 8} more.</p>}

                <div style={{ display: "flex", gap: 12, marginTop: 16, alignItems: "center" }}>
                  <button className="btn" type="button" onClick={runImport} disabled={pending || validRows.length === 0}>
                    {pending ? "Importing…" : `Import ${validRows.length} item${validRows.length === 1 ? "" : "s"}`}
                  </button>
                  <Link className="btn btn-ghost" href="/inventory">Cancel</Link>
                </div>
                {error && <div className="notice" style={{ marginTop: 12 }}>{error}</div>}
              </>
            )}
          </div>
        </>
      )}

      {result && (
        <div className="card" style={{ cursor: "default" }}>
          <h3>Import complete</h3>
          <div className="stat-row" style={{ marginBottom: result.errors.length ? 12 : 0 }}>
            <div className="stat"><div className="stat-label">Created</div><div className="stat-value">{result.created}</div></div>
            <div className="stat"><div className="stat-label">Updated</div><div className="stat-value">{result.updated}</div></div>
            <div className="stat"><div className="stat-label">Skipped</div><div className="stat-value">{result.skipped}</div></div>
          </div>
          {result.errors.length > 0 && (
            <div className="notice">
              <strong>{result.errors.length} row(s) had problems:</strong>
              <ul style={{ margin: "8px 0 0 18px" }}>
                {result.errors.slice(0, 10).map((e, i) => <li key={i}>{e}</li>)}
              </ul>
            </div>
          )}
          <div style={{ marginTop: 14 }}>
            <Link className="btn" href="/inventory">View inventory</Link>
          </div>
        </div>
      )}
    </div>
  );
}
