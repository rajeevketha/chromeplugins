/**
 * Inactive Flow Version Cleaner — find/delete inactive versions that block field deletion.
 */

export const INACTIVE_FLOW_STATUSES = ["Draft", "InvalidDraft", "Obsolete"];

/**
 * @param {object} flow Tooling Flow record
 * @param {string} needle field API name or free text
 */
export function flowMatchesNeedle(flow, needle) {
  const q = String(needle || "").trim().toLowerCase();
  if (!q) return true;
  const hay = [
    flow.MasterLabel,
    flow.Definition?.DeveloperName,
    flow.Definition?.MasterLabel,
    flow.Status,
    flow.ProcessType,
    String(flow.VersionNumber ?? ""),
    // Metadata may be object or string depending on API
    typeof flow.Metadata === "string" ? flow.Metadata : JSON.stringify(flow.Metadata || {})
  ]
    .filter(Boolean)
    .join("\n")
    .toLowerCase();
  return hay.includes(q);
}

export function summarizeFlowVersion(flow) {
  return {
    id: flow.Id,
    label: flow.MasterLabel || flow.Definition?.MasterLabel || flow.Definition?.DeveloperName || flow.Id,
    definitionName: flow.Definition?.DeveloperName || null,
    status: flow.Status,
    versionNumber: flow.VersionNumber,
    processType: flow.ProcessType,
    lastModifiedDate: flow.LastModifiedDate,
    isActive: flow.Status === "Active",
    canDelete: INACTIVE_FLOW_STATUSES.includes(flow.Status)
  };
}

export function buildInactiveFlowsQuery({ includeMetadata = false, limit = 200 } = {}) {
  const fields = [
    "Id",
    "MasterLabel",
    "Status",
    "VersionNumber",
    "ProcessType",
    "LastModifiedDate",
    "Definition.DeveloperName",
    "Definition.MasterLabel"
  ];
  if (includeMetadata) fields.push("Metadata");
  const statuses = INACTIVE_FLOW_STATUSES.map((s) => `'${s}'`).join(", ");
  return `SELECT ${fields.join(", ")} FROM Flow WHERE Status IN (${statuses}) ORDER BY LastModifiedDate DESC LIMIT ${Math.min(limit, 200)}`;
}

export function buildFieldReferenceHint(objectApiName, fieldApiName) {
  const obj = String(objectApiName || "").trim();
  const field = String(fieldApiName || "").trim();
  if (!field) return "";
  // Flows often reference Object.Field or just Field__c
  if (obj && field.includes(".")) return field;
  if (obj && !field.includes(".")) return `${obj}.${field}`;
  return field;
}
