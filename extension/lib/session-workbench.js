/**
 * Session Workbench — per-org activity ("Continue") + scratch pad.
 * Uses chrome.storage.local; never stores sid or secrets.
 */

const ACTIVITY_KEY = "orgkitSessionActivity";
const SCRATCH_KEY = "orgkitSessionScratch";
const MAX_ACTIVITY = 12;
const MAX_DETAIL = 160;
const MAX_TITLE = 80;
const MAX_SCRATCH = 20000;

function newId() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return `a_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export function normalizeOrgKey(orgKey) {
  const key = String(orgKey || "").trim();
  return key || "default";
}

/**
 * @param {string} orgKey
 * @param {{ type: string, title: string, detail?: string, view?: string, payload?: object }} entry
 */
export async function recordActivity(orgKey, entry) {
  const key = normalizeOrgKey(orgKey);
  const type = String(entry?.type || "action").slice(0, 32);
  const title = String(entry?.title || "Activity").trim().slice(0, MAX_TITLE) || "Activity";
  const detail = String(entry?.detail || "").trim().slice(0, MAX_DETAIL);
  const view = String(entry?.view || "").slice(0, 40);
  const payload = entry?.payload && typeof entry.payload === "object" ? sanitizePayload(entry.payload) : {};

  const data = await chrome.storage.local.get({ [ACTIVITY_KEY]: {} });
  const all = { ...(data[ACTIVITY_KEY] || {}) };
  const rows = Array.isArray(all[key]) ? [...all[key]] : [];

  // Dedupe consecutive identical actions
  const head = rows[0];
  if (
    head &&
    head.type === type &&
    head.title === title &&
    head.detail === detail &&
    JSON.stringify(head.payload || {}) === JSON.stringify(payload)
  ) {
    rows[0] = { ...head, at: new Date().toISOString() };
  } else {
    rows.unshift({
      id: newId(),
      type,
      title,
      detail,
      view,
      payload,
      at: new Date().toISOString()
    });
  }

  all[key] = rows.slice(0, MAX_ACTIVITY);
  await chrome.storage.local.set({ [ACTIVITY_KEY]: all });
  return all[key];
}

export async function listActivity(orgKey) {
  const key = normalizeOrgKey(orgKey);
  const data = await chrome.storage.local.get({ [ACTIVITY_KEY]: {} });
  const all = data[ACTIVITY_KEY] || {};
  return Array.isArray(all[key]) ? all[key] : [];
}

export async function clearActivity(orgKey) {
  const key = normalizeOrgKey(orgKey);
  const data = await chrome.storage.local.get({ [ACTIVITY_KEY]: {} });
  const all = { ...(data[ACTIVITY_KEY] || {}) };
  all[key] = [];
  await chrome.storage.local.set({ [ACTIVITY_KEY]: all });
  return [];
}

export async function getScratchPad(orgKey) {
  const key = normalizeOrgKey(orgKey);
  const data = await chrome.storage.local.get({ [SCRATCH_KEY]: {} });
  const all = data[SCRATCH_KEY] || {};
  const row = all[key] || {};
  return {
    soql: String(row.soql || ""),
    apex: String(row.apex || "")
  };
}

export async function saveScratchPad(orgKey, { soql, apex } = {}) {
  const key = normalizeOrgKey(orgKey);
  const data = await chrome.storage.local.get({ [SCRATCH_KEY]: {} });
  const all = { ...(data[SCRATCH_KEY] || {}) };
  all[key] = {
    soql: String(soql ?? all[key]?.soql ?? "").slice(0, MAX_SCRATCH),
    apex: String(apex ?? all[key]?.apex ?? "").slice(0, MAX_SCRATCH),
    updatedAt: new Date().toISOString()
  };
  await chrome.storage.local.set({ [SCRATCH_KEY]: all });
  return all[key];
}

function sanitizePayload(payload) {
  const out = {};
  for (const [k, v] of Object.entries(payload)) {
    if (typeof v === "string") out[k] = v.slice(0, MAX_SCRATCH);
    else if (typeof v === "boolean" || typeof v === "number") out[k] = v;
  }
  return out;
}

export function formatActivityTime(iso) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit"
    });
  } catch {
    return "";
  }
}

export function activityTypeLabel(type) {
  switch (type) {
    case "soql":
      return "SOQL";
    case "apex":
      return "Apex";
    case "describe":
      return "Describe";
    case "meta":
      return "Metadata";
    default:
      return "Action";
  }
}
