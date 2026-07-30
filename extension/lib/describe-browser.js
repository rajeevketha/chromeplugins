/**
 * Object describe helpers + dependent picklist decoding (validFor bitmaps).
 */

/** Decode Salesforce picklist validFor (base64 bitmap) into controlling-value indexes. */
export function decodeValidFor(validFor) {
  if (!validFor) return [];
  const binary = atob(validFor);
  const indexes = [];
  for (let i = 0; i < binary.length; i++) {
    const byte = binary.charCodeAt(i);
    for (let bit = 0; bit < 8; bit++) {
      if (byte & (1 << (7 - bit))) {
        indexes.push(i * 8 + bit);
      }
    }
  }
  return indexes;
}

/**
 * Build dependent picklist map:
 * controllingValue -> [dependent values]
 */
export function buildDependentMap(controllerField, dependentField) {
  const controllerValues = (controllerField?.picklistValues || []).filter((v) => v.active !== false);
  const dependentValues = (dependentField?.picklistValues || []).filter((v) => v.active !== false);
  const map = {};
  for (const cv of controllerValues) {
    map[cv.value] = [];
  }
  for (const dv of dependentValues) {
    const idxs = decodeValidFor(dv.validFor);
    for (const idx of idxs) {
      const controller = controllerValues[idx];
      if (!controller) continue;
      map[controller.value] = map[controller.value] || [];
      map[controller.value].push({
        value: dv.value,
        label: dv.label,
        defaultValue: !!dv.defaultValue
      });
    }
  }
  return {
    controllerName: controllerField?.name,
    dependentName: dependentField?.name,
    controllerValues: controllerValues.map((v) => ({ value: v.value, label: v.label })),
    byController: map
  };
}

export function summarizeField(field) {
  return {
    name: field.name,
    label: field.label,
    type: field.type,
    length: field.length,
    precision: field.precision,
    scale: field.scale,
    custom: !!field.custom,
    nillable: !!field.nillable,
    externalId: !!field.externalId,
    unique: !!field.unique,
    calculated: !!field.calculated,
    updateable: !!field.updateable,
    createable: !!field.createable,
    filterable: !!field.filterable,
    sortable: !!field.sortable,
    referenceTo: field.referenceTo || [],
    relationshipName: field.relationshipName || null,
    controllerName: field.controllerName || null,
    dependentPicklist: !!field.dependentPicklist,
    picklistValues: (field.picklistValues || []).filter((v) => v.active !== false).map((v) => ({
      value: v.value,
      label: v.label,
      defaultValue: !!v.defaultValue,
      validFor: v.validFor || null
    }))
  };
}

export function filterFields(fields, query) {
  const q = String(query || "").trim().toLowerCase();
  if (!q) return fields;
  return fields.filter(
    (f) =>
      f.name.toLowerCase().includes(q) ||
      (f.label || "").toLowerCase().includes(q) ||
      (f.type || "").toLowerCase().includes(q)
  );
}

export function findDependentPairs(fields) {
  const byName = Object.fromEntries(fields.map((f) => [f.name, f]));
  const pairs = [];
  for (const f of fields) {
    if (f.dependentPicklist && f.controllerName && byName[f.controllerName]) {
      pairs.push({
        controller: byName[f.controllerName],
        dependent: f
      });
    }
  }
  return pairs;
}
