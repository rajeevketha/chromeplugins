/**
 * Helpers for query-result record actions (open / show all data / edit).
 */

const ID_RE = /^[a-zA-Z0-9]{15,18}$/;

export function isSalesforceId(value) {
  return ID_RE.test(String(value || "").trim());
}

export function isCustomMetadataType(name) {
  return /__mdt$/i.test(String(name || ""));
}

/** Prefer attributes.type from query rows; fall back to FROM clause. */
export function detectSObjectType(queryResult, soql = "") {
  const records = Array.isArray(queryResult?.records) ? queryResult.records : [];
  for (const r of records) {
    const t = r?.attributes?.type;
    if (t) return t;
  }
  const m = String(soql || "").match(/\bFROM\s+([A-Za-z][A-Za-z0-9_]*)/i);
  return m ? m[1] : null;
}

export function extractRecordId(record, flatRow, columns) {
  if (record?.Id && isSalesforceId(record.Id)) return String(record.Id);
  if (!flatRow || !columns) return null;
  const idIdx = columns.findIndex((c) => c === "Id" || c.endsWith(".Id"));
  if (idIdx >= 0 && isSalesforceId(flatRow[idIdx])) return String(flatRow[idIdx]);
  for (const cell of flatRow) {
    if (isSalesforceId(cell) && String(cell).length >= 15) return String(cell);
  }
  return null;
}

/**
 * Build editor field list from describe + record values.
 * Custom metadata (__mdt): allow editing MasterLabel + custom fields even when
 * describe.updateable is false (updates go through Tooling CustomMetadata).
 */
export function buildRecordEditorFields(describe, record = {}) {
  const fields = Array.isArray(describe?.fields) ? describe.fields : [];
  const cmdt = isCustomMetadataType(describe?.name);
  const rows = [];
  for (const f of fields) {
    if (!f?.name) continue;
    if (f.type === "address" || f.type === "location") continue;
    const name = f.name;
    let value = record[name];
    if (value !== null && typeof value === "object") {
      value = JSON.stringify(value);
    }
    let updateable = !!f.updateable;
    if (cmdt) {
      if (name === "MasterLabel" || name === "Label" || f.custom || /__c$/i.test(name)) {
        updateable = true;
      }
      if (
        ["Id", "DeveloperName", "QualifiedApiName", "NamespacePrefix", "Language", "SystemModstamp"].includes(
          name
        )
      ) {
        updateable = false;
      }
    }
    rows.push({
      name,
      label: f.label || name,
      type: f.type || "string",
      updateable,
      createable: !!f.createable,
      nillable: !!f.nillable,
      custom: !!f.custom,
      length: f.length,
      picklistValues: (f.picklistValues || [])
        .filter((p) => p.active !== false)
        .map((p) => ({ value: p.value, label: p.label || p.value })),
      value: value === undefined || value === null ? "" : value
    });
  }
  rows.sort((a, b) => {
    const rank = (f) => {
      if (f.name === "Id") return 0;
      if (f.name === "DeveloperName" || f.name === "Name") return 1;
      if (f.name === "MasterLabel" || f.name === "Label") return 2;
      if (f.updateable) return 3;
      return 4;
    };
    const d = rank(a) - rank(b);
    return d || a.name.localeCompare(b.name);
  });
  return rows;
}

/** Collect PATCH body from editor inputs; only updateable fields that changed. */
export function buildUpdatePayload(editorFields, getValue) {
  const body = {};
  let changed = 0;
  for (const f of editorFields) {
    if (!f.updateable || f.name === "Id") continue;
    const raw = getValue(f.name);
    let next = raw;
    if (f.type === "boolean") {
      next = raw === true || raw === "true" || raw === "TRUE" || raw === "1";
    } else if (f.type === "int" || f.type === "long") {
      if (raw === "" || raw == null) next = null;
      else next = parseInt(raw, 10);
      if (Number.isNaN(next)) throw new Error(`${f.name} must be an integer.`);
    } else if (f.type === "double" || f.type === "currency" || f.type === "percent") {
      if (raw === "" || raw == null) next = null;
      else next = Number(raw);
      if (Number.isNaN(next)) throw new Error(`${f.name} must be a number.`);
    } else if (raw === "" && f.nillable) {
      next = null;
    } else {
      next = raw == null ? "" : String(raw);
    }

    const prev = f.value === undefined || f.value === null ? "" : f.value;
    const prevCmp =
      f.type === "boolean"
        ? Boolean(prev) === true || prev === "true" || prev === "TRUE"
        : prev === null || prev === undefined
          ? ""
          : String(prev);
    const nextCmp =
      f.type === "boolean" ? Boolean(next) : next === null || next === undefined ? "" : String(next);

    if (nextCmp !== String(prevCmp)) {
      body[f.name] = next;
      changed += 1;
    }
  }
  return { body, changed };
}
