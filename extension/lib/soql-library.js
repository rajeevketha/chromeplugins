/**
 * Per-org saved SOQL library (chrome.storage.local — never stores sid).
 */

const STORAGE_KEY = "soqlLibrary";
const MAX_PER_ORG = 40;
const MAX_NAME = 80;
const MAX_SOQL = 20000;

function newId() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return `q_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export function normalizeOrgKey(orgKey) {
  const key = String(orgKey || "").trim();
  return key || "default";
}

export async function listSavedSoql(orgKey) {
  const key = normalizeOrgKey(orgKey);
  const data = await chrome.storage.local.get({ [STORAGE_KEY]: {} });
  const all = data[STORAGE_KEY] || {};
  const rows = Array.isArray(all[key]) ? all[key] : [];
  return sortLibrary(rows);
}

function sortLibrary(rows) {
  return [...rows].sort((a, b) => {
    if (Boolean(a.pinned) !== Boolean(b.pinned)) return a.pinned ? -1 : 1;
    return String(b.updatedAt || "").localeCompare(String(a.updatedAt || ""));
  });
}

export async function saveSoqlEntry(orgKey, { id, name, soql, pinned, apiMode } = {}) {
  const key = normalizeOrgKey(orgKey);
  const cleanName = String(name || "").trim().slice(0, MAX_NAME);
  const cleanSoql = String(soql || "").trim();
  const mode = apiMode === "tooling" ? "tooling" : "rest";
  if (!cleanName) throw new Error("Enter a name for this query.");
  if (!cleanSoql) throw new Error("SOQL is empty.");
  if (cleanSoql.length > MAX_SOQL) throw new Error(`SOQL exceeds ${MAX_SOQL} characters.`);

  const data = await chrome.storage.local.get({ [STORAGE_KEY]: {} });
  const all = { ...(data[STORAGE_KEY] || {}) };
  const rows = Array.isArray(all[key]) ? [...all[key]] : [];
  const now = new Date().toISOString();
  const existingIdx = id ? rows.findIndex((r) => r.id === id) : -1;

  if (existingIdx >= 0) {
    rows[existingIdx] = {
      ...rows[existingIdx],
      name: cleanName,
      soql: cleanSoql,
      apiMode: mode,
      pinned: pinned == null ? Boolean(rows[existingIdx].pinned) : Boolean(pinned),
      updatedAt: now
    };
  } else {
    rows.unshift({
      id: newId(),
      name: cleanName,
      soql: cleanSoql,
      apiMode: mode,
      pinned: Boolean(pinned),
      createdAt: now,
      updatedAt: now
    });
  }

  all[key] = sortLibrary(rows).slice(0, MAX_PER_ORG);
  await chrome.storage.local.set({ [STORAGE_KEY]: all });
  return all[key];
}

export async function deleteSavedSoql(orgKey, id) {
  const key = normalizeOrgKey(orgKey);
  const data = await chrome.storage.local.get({ [STORAGE_KEY]: {} });
  const all = { ...(data[STORAGE_KEY] || {}) };
  const rows = Array.isArray(all[key]) ? all[key] : [];
  all[key] = rows.filter((r) => r.id !== id);
  await chrome.storage.local.set({ [STORAGE_KEY]: all });
  return sortLibrary(all[key]);
}

export async function togglePinnedSoql(orgKey, id) {
  const key = normalizeOrgKey(orgKey);
  const data = await chrome.storage.local.get({ [STORAGE_KEY]: {} });
  const all = { ...(data[STORAGE_KEY] || {}) };
  const rows = Array.isArray(all[key]) ? [...all[key]] : [];
  const idx = rows.findIndex((r) => r.id === id);
  if (idx < 0) throw new Error("Saved query not found.");
  rows[idx] = {
    ...rows[idx],
    pinned: !rows[idx].pinned,
    updatedAt: new Date().toISOString()
  };
  all[key] = sortLibrary(rows);
  await chrome.storage.local.set({ [STORAGE_KEY]: all });
  return all[key];
}
