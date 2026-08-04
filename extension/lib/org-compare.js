/**
 * Org Compare — normalize REST describe inventories and diff custom object/field schema.
 * In-browser only; never touches sid.
 */

/** @typedef {{ name: string, label: string, custom: boolean, type: string, nillable: boolean, createable?: boolean, length?: number|null, precision?: number|null, scale?: number|null, referenceTo?: string[] }} FieldInv */
/** @typedef {{ name: string, label: string, custom: boolean, keyPrefix?: string|null, fields: Record<string, FieldInv> }} ObjectInv */
/** @typedef {{ orgKey: string, label: string, hostname?: string, objectCount: number, objects: Record<string, ObjectInv> }} OrgInventory */

export function isCustomObjectName(name, { includeMdt = true } = {}) {
  const n = String(name || "");
  if (n.endsWith("__c")) return true;
  if (includeMdt && n.endsWith("__mdt")) return true;
  return false;
}

export function filterGlobalObjects(sobjects, mode = "custom") {
  const list = Array.isArray(sobjects) ? sobjects : [];
  if (mode === "all") {
    return list.filter((o) => o?.name && o.queryable !== false);
  }
  const includeMdt = mode !== "custom-no-mdt";
  return list.filter((o) => o?.name && isCustomObjectName(o.name, { includeMdt }));
}

export function normalizeField(field) {
  if (!field?.name) return null;
  return {
    name: field.name,
    label: field.label || field.name,
    custom: !!field.custom,
    type: String(field.type || ""),
    nillable: !!field.nillable,
    createable: !!field.createable,
    length: field.length ?? null,
    precision: field.precision ?? null,
    scale: field.scale ?? null,
    referenceTo: Array.isArray(field.referenceTo) ? [...field.referenceTo].sort() : []
  };
}

export function normalizeObjectDescribe(desc) {
  if (!desc?.name) return null;
  const fields = {};
  for (const f of desc.fields || []) {
    const nf = normalizeField(f);
    if (nf) fields[nf.name] = nf;
  }
  return {
    name: desc.name,
    label: desc.label || desc.name,
    custom: !!desc.custom,
    keyPrefix: desc.keyPrefix || null,
    fields
  };
}

export function buildInventoryFromDescribes(orgMeta, objectDescribes) {
  const objects = {};
  for (const d of objectDescribes || []) {
    const obj = normalizeObjectDescribe(d);
    if (obj) objects[obj.name] = obj;
  }
  return {
    orgKey: orgMeta?.orgKey || orgMeta?.hostname || "org",
    label: orgMeta?.label || orgMeta?.hostname || "Org",
    hostname: orgMeta?.hostname || "",
    envLabel: orgMeta?.envLabel || "",
    objectCount: Object.keys(objects).length,
    objects
  };
}

function fieldSignature(f) {
  if (!f) return "";
  const refs = (f.referenceTo || []).join(",");
  return [
    f.type || "",
    f.nillable ? "1" : "0",
    f.custom ? "1" : "0",
    f.length ?? "",
    f.precision ?? "",
    f.scale ?? "",
    refs
  ].join("|");
}

function fieldDiffReasons(a, b) {
  const reasons = [];
  if ((a?.type || "") !== (b?.type || "")) reasons.push(`type: ${a?.type || "—"} → ${b?.type || "—"}`);
  if (!!a?.nillable !== !!b?.nillable) {
    reasons.push(`nillable: ${a?.nillable ? "yes" : "no"} → ${b?.nillable ? "yes" : "no"}`);
  }
  if (!!a?.custom !== !!b?.custom) reasons.push(`custom: ${a?.custom} → ${b?.custom}`);
  if ((a?.length ?? null) !== (b?.length ?? null) && (a?.type === "string" || b?.type === "string")) {
    reasons.push(`length: ${a?.length ?? "—"} → ${b?.length ?? "—"}`);
  }
  if ((a?.precision ?? null) !== (b?.precision ?? null) || (a?.scale ?? null) !== (b?.scale ?? null)) {
    if (["double", "currency", "percent", "int"].includes(a?.type) || ["double", "currency", "percent", "int"].includes(b?.type)) {
      reasons.push(
        `precision/scale: ${a?.precision ?? "—"}/${a?.scale ?? "—"} → ${b?.precision ?? "—"}/${b?.scale ?? "—"}`
      );
    }
  }
  const ar = (a?.referenceTo || []).join(",");
  const br = (b?.referenceTo || []).join(",");
  if (ar !== br) reasons.push(`referenceTo: ${ar || "—"} → ${br || "—"}`);
  return reasons;
}

/**
 * Diff two inventories.
 * @returns {{ onlyA: object[], onlyB: object[], differ: object[], sameObjects: number, summary: object }}
 */
export function compareInventories(left, right, { customFieldsOnly = false } = {}) {
  const aObjs = left?.objects || {};
  const bObjs = right?.objects || {};
  const names = new Set([...Object.keys(aObjs), ...Object.keys(bObjs)]);

  const onlyA = [];
  const onlyB = [];
  const differ = [];
  let sameObjects = 0;

  for (const name of [...names].sort((x, y) => x.localeCompare(y))) {
    const a = aObjs[name];
    const b = bObjs[name];
    if (a && !b) {
      onlyA.push({
        kind: "object",
        object: name,
        label: a.label,
        custom: a.custom,
        fieldCount: Object.keys(a.fields || {}).length,
        apiNames: [name]
      });
      continue;
    }
    if (b && !a) {
      onlyB.push({
        kind: "object",
        object: name,
        label: b.label,
        custom: b.custom,
        fieldCount: Object.keys(b.fields || {}).length,
        apiNames: [name]
      });
      continue;
    }

    const aFields = a.fields || {};
    const bFields = b.fields || {};
    const fieldNames = new Set([...Object.keys(aFields), ...Object.keys(bFields)]);
    const fieldOnlyA = [];
    const fieldOnlyB = [];
    const fieldDiffer = [];

    for (const fn of [...fieldNames].sort((x, y) => x.localeCompare(y))) {
      const af = aFields[fn];
      const bf = bFields[fn];
      if (customFieldsOnly) {
        const isCustom = !!(af?.custom || bf?.custom || String(fn).endsWith("__c"));
        if (!isCustom) continue;
      }
      if (af && !bf) {
        fieldOnlyA.push({ name: fn, field: af });
        continue;
      }
      if (bf && !af) {
        fieldOnlyB.push({ name: fn, field: bf });
        continue;
      }
      if (fieldSignature(af) !== fieldSignature(bf)) {
        fieldDiffer.push({
          name: fn,
          left: af,
          right: bf,
          reasons: fieldDiffReasons(af, bf)
        });
      }
    }

    if (!fieldOnlyA.length && !fieldOnlyB.length && !fieldDiffer.length) {
      sameObjects += 1;
      continue;
    }

    differ.push({
      kind: "object-fields",
      object: name,
      label: a.label || b.label,
      custom: !!(a.custom || b.custom),
      onlyA: fieldOnlyA,
      onlyB: fieldOnlyB,
      differ: fieldDiffer,
      apiNames: [
        ...fieldOnlyA.map((f) => `${name}.${f.name}`),
        ...fieldOnlyB.map((f) => `${name}.${f.name}`),
        ...fieldDiffer.map((f) => `${name}.${f.name}`)
      ]
    });
  }

  return {
    onlyA,
    onlyB,
    differ,
    sameObjects,
    summary: {
      leftObjects: Object.keys(aObjs).length,
      rightObjects: Object.keys(bObjs).length,
      onlyA: onlyA.length,
      onlyB: onlyB.length,
      differ: differ.length,
      sameObjects
    }
  };
}

/** Filter diff buckets by text needle and optional custom-only object rows. */
export function filterCompareResults(results, { query = "", customOnly = false } = {}) {
  const q = String(query || "").trim().toLowerCase();
  const match = (text) => !q || String(text || "").toLowerCase().includes(q);

  const filterRow = (row) => {
    if (customOnly && row.custom === false) return false;
    if (!q) return true;
    if (match(row.object) || match(row.label)) return true;
    if (row.apiNames?.some((n) => match(n))) return true;
    if (row.onlyA?.some((f) => match(f.name) || match(f.field?.label))) return true;
    if (row.onlyB?.some((f) => match(f.name) || match(f.field?.label))) return true;
    if (row.differ?.some((f) => match(f.name) || match(f.left?.label) || match(f.right?.label))) return true;
    return false;
  };

  return {
    ...results,
    onlyA: (results.onlyA || []).filter(filterRow),
    onlyB: (results.onlyB || []).filter(filterRow),
    differ: (results.differ || []).filter(filterRow)
  };
}

export function collectApiNames(rows, bucket) {
  const names = [];
  for (const row of rows || []) {
    if (bucket === "objects" || row.kind === "object") {
      names.push(row.object);
      continue;
    }
    if (bucket === "fields-a") {
      for (const f of row.onlyA || []) names.push(`${row.object}.${f.name}`);
    } else if (bucket === "fields-b") {
      for (const f of row.onlyB || []) names.push(`${row.object}.${f.name}`);
    } else if (bucket === "fields-differ") {
      for (const f of row.differ || []) names.push(`${row.object}.${f.name}`);
    } else {
      names.push(...(row.apiNames || [row.object]));
    }
  }
  return [...new Set(names)];
}

/** Handoff note: CustomObject members for package.xml (objects only). */
export function toPackageMemberList(objectApiNames) {
  const members = [...new Set((objectApiNames || []).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b)
  );
  if (!members.length) return "";
  const lines = members.map((m) => `        <members>${m}</members>`);
  return [
    "<!-- Org Compare handoff — CustomObject members -->",
    "<types>",
    ...lines,
    "        <name>CustomObject</name>",
    "</types>"
  ].join("\n");
}

export function formatFieldShort(f) {
  if (!f) return "—";
  const req = !f.nillable ? "required" : "nillable";
  const custom = f.custom ? "custom" : "standard";
  return `${f.type} · ${req} · ${custom}`;
}
