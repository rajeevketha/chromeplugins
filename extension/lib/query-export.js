/**
 * Flatten SOQL / Tooling query results for table display and Excel/Sheets export.
 */

function isPlainObject(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

/** Flatten one Salesforce record; nested relationship fields become dotted paths. */
export function flattenRecord(record, prefix = "", out = {}) {
  if (!isPlainObject(record)) return out;
  for (const [key, value] of Object.entries(record)) {
    if (key === "attributes") continue;
    const path = prefix ? `${prefix}.${key}` : key;
    if (isPlainObject(value) && value.attributes && typeof value.attributes.type === "string") {
      flattenRecord(value, path, out);
    } else if (isPlainObject(value)) {
      flattenRecord(value, path, out);
    } else if (Array.isArray(value)) {
      out[path] = value
        .map((item) => (isPlainObject(item) ? JSON.stringify(item) : String(item ?? "")))
        .join("; ");
    } else if (value === null || value === undefined) {
      out[path] = "";
    } else {
      out[path] = value;
    }
  }
  return out;
}

export function recordsToTable(queryResult) {
  const records = Array.isArray(queryResult?.records)
    ? queryResult.records
    : Array.isArray(queryResult)
      ? queryResult
      : [];
  const flat = records.map((r) => flattenRecord(r));
  const columns = [];
  const seen = new Set();
  for (const row of flat) {
    for (const key of Object.keys(row)) {
      if (!seen.has(key)) {
        seen.add(key);
        columns.push(key);
      }
    }
  }
  const rows = flat.map((row) => columns.map((c) => cellToString(row[c])));
  return {
    columns,
    rows,
    totalSize: queryResult?.totalSize ?? records.length,
    done: queryResult?.done !== false,
    recordCount: records.length
  };
}

function cellToString(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function escapeCsvCell(value) {
  const s = cellToString(value);
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function escapeTsvCell(value) {
  return cellToString(value).replace(/\t/g, " ").replace(/\r?\n/g, " ");
}

/** UTF-8 CSV with BOM — opens cleanly in Excel. */
export function tableToCsv(table) {
  const lines = [
    table.columns.map(escapeCsvCell).join(","),
    ...table.rows.map((row) => row.map(escapeCsvCell).join(","))
  ];
  return `\uFEFF${lines.join("\r\n")}`;
}

/** Tab-separated — paste into Google Sheets / Excel. */
export function tableToTsv(table) {
  const lines = [
    table.columns.map(escapeTsvCell).join("\t"),
    ...table.rows.map((row) => row.map(escapeTsvCell).join("\t"))
  ];
  return lines.join("\n");
}

function escapeXml(s) {
  return cellToString(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** SpreadsheetML .xls that Excel opens without a CSV import wizard. */
export function tableToExcelXml(table, sheetName = "Query") {
  const safeName = String(sheetName || "Query")
    .replace(/[\\/*?:\[\]]/g, "_")
    .slice(0, 31) || "Query";
  const header = `<Row>${table.columns
    .map((c) => `<Cell><Data ss:Type="String">${escapeXml(c)}</Data></Cell>`)
    .join("")}</Row>`;
  const body = table.rows
    .map((row) => {
      const cells = row
        .map((cell) => {
          const text = cellToString(cell);
          const isNum = text !== "" && /^-?\d+(\.\d+)?$/.test(text);
          const type = isNum ? "Number" : "String";
          return `<Cell><Data ss:Type="${type}">${escapeXml(text)}</Data></Cell>`;
        })
        .join("");
      return `<Row>${cells}</Row>`;
    })
    .join("");
  return `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Worksheet ss:Name="${escapeXml(safeName)}">
  <Table>
${header}
${body}
  </Table>
 </Worksheet>
</Workbook>`;
}

export function downloadTextFile(filename, content, mime) {
  const blob = new Blob([content], { type: mime || "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export function defaultExportBasename(prefix = "soql-results") {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  return `${prefix}-${stamp}`;
}

export async function copyText(text) {
  await navigator.clipboard.writeText(text);
}
