// Minimal, dependency-free CSV parser. Handles quoted fields, escaped
// quotes (""), commas and newlines inside quotes, and CRLF line endings.
// Safe to import from client components (no server-only deps).

export type ParsedCsv = { headers: string[]; rows: Record<string, string>[] };

export function parseCsv(text: string): ParsedCsv {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;

  // Strip a leading BOM if present (common in Excel exports).
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
      continue;
    }
    if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      // Handle CRLF as a single break.
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      // Skip fully blank lines.
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  // Flush the final field/row (files without a trailing newline).
  if (field !== "" || row.length > 0) {
    row.push(field);
    if (row.length > 1 || row[0] !== "") rows.push(row);
  }

  if (rows.length === 0) return { headers: [], rows: [] };
  const headers = rows[0].map((h) => h.trim());
  const out: Record<string, string>[] = [];
  for (let r = 1; r < rows.length; r++) {
    const rec: Record<string, string> = {};
    headers.forEach((h, idx) => {
      rec[h] = (rows[r][idx] ?? "").trim();
    });
    out.push(rec);
  }
  return { headers, rows: out };
}
