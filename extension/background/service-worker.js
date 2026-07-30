import {
  isSalesforceUrl,
  parseOrgFromUrl,
  restUrl,
  toSalesforceApiHost,
  toSalesforceApiBase,
  DEFAULT_API_VERSION
} from "../lib/salesforce.js";
import { METADATA_SEARCH_TYPES } from "../lib/metadata-open.js";
import { PACKAGE_TYPES } from "../lib/package-xml.js";
import {
  buildInactiveFlowsQuery,
  flowMatchesNeedle,
  summarizeFlowVersion,
  INACTIVE_FLOW_STATUSES
} from "../lib/flow-cleaner.js";

chrome.runtime.onInstalled.addListener((details) => {
  chrome.storage.sync.get(
    {
      favorites: [],
      apiVersion: DEFAULT_API_VERSION,
      showToolbar: true,
      showBadge: true,
      launcherMinimized: false,
      deployChecklist: []
    },
    (data) => {
      // Older "Hide tab" turned the launcher fully off (showToolbar=false) with no on-page restore.
      // On upgrade, bring it back as minimized so a Show control remains on the page.
      if (details.reason === "update" && data.showToolbar === false) {
        data.showToolbar = true;
        data.launcherMinimized = true;
      }
      chrome.storage.sync.set(data);
    }
  );
});

/** Toolbar icon / Alt+Shift+O → open OrgKit in a full tab (not a tiny popup). */
chrome.action.onClicked.addListener(() => {
  openOrgKitTab().catch(() => {});
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const handlers = {
    getOrgSession: () => getOrgSession(message.tabUrl || sender.tab?.url),
    runSoql: () => runSoql(message.tabUrl, message.query, message.apiVersion),
    toolingQuery: () => toolingQuery(message.tabUrl, message.query, message.apiVersion),
    restGet: () => restGet(message.tabUrl, message.path, message.apiVersion),
    describeGlobal: () => describeGlobal(message.tabUrl, message.apiVersion, message.tooling),
    describeSObject: () =>
      describeSObject(message.tabUrl, message.sobject, message.apiVersion, message.tooling),
    getSObject: () =>
      getSObject(message.tabUrl, message.sobject, message.id, message.apiVersion, message.tooling),
    updateSObject: () =>
      updateSObject(
        message.tabUrl,
        message.sobject,
        message.id,
        message.fields,
        message.apiVersion,
        message.tooling
      ),
    deleteSObject: () =>
      deleteSObject(message.tabUrl, message.sobject, message.id, message.apiVersion, message.tooling),
    listFlows: () => listFlows(message.tabUrl, message.apiVersion),
    getApexCoverage: () => getApexCoverage(message.tabUrl, message.apiVersion),
    getRecentDeployFailures: () => getRecentDeployFailures(message.tabUrl, message.apiVersion),
    getOrgLimits: () => getOrgLimits(message.tabUrl, message.apiVersion),
    listApexClasses: () => listApexClasses(message.tabUrl, message.query, message.apiVersion),
    getApexClassBody: () => getApexClassBody(message.tabUrl, message.id, message.apiVersion),
    openUrl: async () => {
      await chrome.tabs.create({ url: message.url });
      return { ok: true };
    },
    openOrgKit: () => openOrgKitTab(message.view),
    getActiveTabOrg: () => getActiveTabOrg(),
    searchMetadata: () => searchMetadata(message.tabUrl, message.query, message.typeId, message.apiVersion),
    listPackageTypeMembers: () =>
      listPackageTypeMembers(message.tabUrl, message.typeName, message.apiVersion),
    listInactiveFlowVersions: () =>
      listInactiveFlowVersions(message.tabUrl, message.needle, message.includeMetadata, message.apiVersion),
    deleteFlowVersions: () => deleteFlowVersions(message.tabUrl, message.ids, message.apiVersion),
    executeAnonymous: () => executeAnonymous(message.tabUrl, message.apex, message.apiVersion),
    fetchLatestApexDebug: () => fetchLatestApexDebug(message.tabUrl, message.apiVersion),
    getExtensionVersion: async () => ({
      version: "1.6.6",
      hasSearchMetadata: typeof searchMetadata === "function",
      hasFlowCleaner: typeof listInactiveFlowVersions === "function",
      hasExecuteAnonymous: typeof executeAnonymous === "function",
      hasOrgLimits: typeof getOrgLimits === "function",
      hasRecordCrud: typeof updateSObject === "function",
      privacyPolicy: "privacy.html",
      metadataTypeCount: METADATA_SEARCH_TYPES.length,
      packageTypeCount: PACKAGE_TYPES.length
    })
  };

  const fn = handlers[message.type];
  if (!fn) return false;

  Promise.resolve()
    .then(() => fn())
    .then((result) => sendResponse({ ok: true, result }))
    .catch((error) => sendResponse({ ok: false, error: error.message || String(error) }));
  return true;
});

async function getActiveTabOrg() {
  const tab = await findSalesforceTab();
  if (!tab?.url || !isSalesforceUrl(tab.url)) {
    return { tab: tab || null, org: null, session: null };
  }
  const org = parseOrgFromUrl(tab.url);
  const session = await getSessionForOrg(org);
  return { tab, org, session };
}

async function openOrgKitTab(view) {
  const base = chrome.runtime.getURL("popup/popup.html");
  const url = view ? `${base}?view=${encodeURIComponent(view)}` : base;
  const all = await chrome.tabs.query({});
  const existing = all.find((t) => typeof t.url === "string" && t.url.startsWith(base));
  if (existing?.id) {
    await chrome.tabs.update(existing.id, { active: true, url });
    if (existing.windowId != null) {
      await chrome.windows.update(existing.windowId, { focused: true });
    }
    return { ok: true, tabId: existing.id, reused: true };
  }
  const tab = await chrome.tabs.create({ url });
  return { ok: true, tabId: tab.id, reused: false };
}

/**
 * Run a Salesforce REST/Tooling request. Prefer service-worker fetch; if Chrome
 * blocks it ("Failed to fetch"), retry via scripting inside a Salesforce tab.
 */
async function sfFetchUrl(url, sid, options = {}) {
  try {
    return await sfFetchUrlDirect(url, sid, options);
  } catch (e) {
    const msg = e?.message || String(e);
    if (!/Failed to fetch|Failed to reach Salesforce|NetworkError|Load failed/i.test(msg)) {
      throw e;
    }
    try {
      return await sfFetchViaSalesforceTab(url, sid, options);
    } catch (e2) {
      throw new Error(
        `${networkBlockedMessage(url, e)} Fallback via Salesforce tab also failed: ${e2.message || e2}`
      );
    }
  }
}

async function sfFetchUrlDirect(url, sid, options = {}) {
  const method = options.method || "GET";
  const headers = {
    Authorization: `Bearer ${sid}`,
    Accept: "application/json",
    ...(options.headers || {})
  };
  if (options.body != null && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }
  let res;
  try {
    res = await fetch(url, {
      method,
      headers,
      body: options.body != null ? (typeof options.body === "string" ? options.body : JSON.stringify(options.body)) : undefined,
      credentials: "omit"
    });
  } catch (e) {
    throw new Error(networkBlockedMessage(url, e));
  }

  if ((method === "DELETE" || method === "PATCH" || method === "PUT") && (res.status === 204 || res.status === 200)) {
    if (res.status === 204) return { ok: true };
  }

  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }

  if (!res.ok) {
    const msg =
      (Array.isArray(body) && body[0]?.message) || body?.message || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return body == null ? { ok: true } : body;
}

async function sfFetchViaSalesforceTab(url, sid, options = {}) {
  const tab = await findSalesforceTab();
  if (!tab?.id) {
    throw new Error("No Salesforce tab available for API fallback.");
  }
  const method = options.method || "GET";
  const requestBody =
    options.body == null ? null : typeof options.body === "string" ? options.body : JSON.stringify(options.body);
  // Pass token only into the extension isolated world; never log it.
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    world: "ISOLATED",
    args: [url, sid, method, requestBody],
    func: async (fetchUrl, token, httpMethod, bodyText) => {
      try {
        const headers = {
          Authorization: `Bearer ${token}`,
          Accept: "application/json"
        };
        if (bodyText != null) headers["Content-Type"] = "application/json";
        const res = await fetch(fetchUrl, {
          method: httpMethod,
          headers,
          body: bodyText == null ? undefined : bodyText,
          credentials: "omit"
        });
        const text = await res.text();
        return { status: res.status, ok: res.ok, text };
      } catch (err) {
        return { error: String(err && err.message ? err.message : err) };
      }
    }
  });

  if (!result) throw new Error("Empty response from Salesforce tab fetch.");
  if (result.error) throw new Error(result.error);
  if (
    (method === "DELETE" || method === "PATCH" || method === "PUT") &&
    (result.status === 204 || result.status === 200)
  ) {
    if (result.status === 204) return { ok: true };
  }

  let body;
  try {
    body = result.text ? JSON.parse(result.text) : null;
  } catch {
    body = result.text;
  }
  if (!result.ok) {
    const msg =
      (Array.isArray(body) && body[0]?.message) || body?.message || `HTTP ${result.status}`;
    throw new Error(msg);
  }
  return body == null ? { ok: true } : body;
}

async function sfFetchText(url, sid) {
  try {
    return await sfFetchTextDirect(url, sid);
  } catch (e) {
    const msg = e?.message || String(e);
    if (!/Failed to fetch|Failed to reach Salesforce|NetworkError|Load failed/i.test(msg)) {
      throw e;
    }
    const body = await sfFetchViaSalesforceTab(url, sid, { method: "GET" });
    return typeof body === "string" ? body : JSON.stringify(body);
  }
}

async function sfFetchTextDirect(url, sid) {
  let res;
  try {
    res = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${sid}`,
        Accept: "text/plain, application/json"
      },
      credentials: "omit"
    });
  } catch (e) {
    throw new Error(networkBlockedMessage(url, e));
  }
  const text = await res.text();
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const body = JSON.parse(text);
      msg = (Array.isArray(body) && body[0]?.message) || body?.message || msg;
    } catch {
      /* keep status */
    }
    throw new Error(msg);
  }
  return text;
}

/** Prefer the active tab; otherwise any Salesforce org tab in this window / all windows. */
async function findSalesforceTab() {
  const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (active?.url && isSalesforceUrl(active.url) && !isLoginOnlyUrl(active.url)) {
    return active;
  }

  const currentWindow = await chrome.tabs.query({ currentWindow: true });
  const inWindow = currentWindow.find((t) => t.url && isSalesforceUrl(t.url) && !isLoginOnlyUrl(t.url));
  if (inWindow) return inWindow;

  const all = await chrome.tabs.query({});
  return all.find((t) => t.url && isSalesforceUrl(t.url) && !isLoginOnlyUrl(t.url)) || active || null;
}

function isLoginOnlyUrl(url) {
  try {
    const u = new URL(url);
    return /^(login|test)\.salesforce\.com$/i.test(u.hostname);
  } catch {
    return false;
  }
}

async function getOrgSession(tabUrl) {
  if (!tabUrl || !isSalesforceUrl(tabUrl)) {
    throw new Error("Not a Salesforce tab");
  }
  const org = parseOrgFromUrl(tabUrl);
  const session = await getSessionForOrg(org);
  return { org, session };
}

async function getSessionForOrg(org) {
  if (!org) throw new Error("Missing org");

  // Prefer my.salesforce.com sid for REST/Tooling. Lightning/setup sids are
  // host-scoped and return "Session expired or invalid" against apiBase.
  const hostsToTry = unique([
    toSalesforceApiHost(org.hostname),
    org.apiBase ? new URL(org.apiBase).hostname : null,
    org.hostname,
    org.hostname.includes("lightning.force.com")
      ? org.hostname
      : toSalesforceApiHost(org.hostname).replace(".my.salesforce.com", ".lightning.force.com")
  ]);

  let sid = null;
  let cookieHost = null;
  for (const host of hostsToTry) {
    if (!host) continue;
    const cookie = await chrome.cookies.get({ url: `https://${host}/`, name: "sid" });
    if (cookie?.value) {
      sid = cookie.value;
      cookieHost = host;
      break;
    }
  }

  if (!sid) {
    // Only read sid cookies on Salesforce-related domains (never scan unrelated sites).
    const sfCookies = await listSalesforceSidCookies();
    const ranked = [...sfCookies].sort((a, b) => apiCookieRank(b.domain) - apiCookieRank(a.domain));
    const match = ranked[0];
    if (match?.value) {
      sid = match.value;
      cookieHost = match.domain.replace(/^\./, "");
    }
  }

  if (!sid) {
    return { sid: null, apiBase: org.apiBase, cookieHost: null, userInfo: null };
  }

  const apiBase = cookieHost ? toSalesforceApiBase(cookieHost) : toSalesforceApiBase(org.apiBase || org.hostname);

  let userInfo = null;
  try {
    userInfo = await sfFetchUrl(`${apiBase}/services/oauth2/userinfo`, sid);
  } catch {
    try {
      userInfo = await sfFetchUrl(restUrl(apiBase, "/chatter/users/me"), sid);
    } catch {
      /* navigation-only session */
    }
  }

  return { sid, apiBase, cookieHost, userInfo };
}

/** Higher = better for Salesforce REST API Authorization: Bearer. */
function apiCookieRank(domain) {
  const d = String(domain || "").replace(/^\./, "").toLowerCase();
  if (d.endsWith(".my.salesforce.com")) return 3;
  if (d.endsWith(".salesforce.com") && !d.includes("setup")) return 2;
  if (d.endsWith(".lightning.force.com") || d.endsWith(".salesforce-setup.com")) return 0;
  return 1;
}

/**
 * Privacy: only request sid cookies for known Salesforce registrable domains.
 * Do not call cookies.getAll({ name: "sid" }) across the whole browser profile.
 */
async function listSalesforceSidCookies() {
  const domains = [
    ".salesforce.com",
    ".force.com",
    ".cloudforce.com",
    ".salesforce-setup.com",
    ".visualforce.com"
  ];
  const out = [];
  for (const domain of domains) {
    try {
      const part = await chrome.cookies.getAll({ name: "sid", domain });
      if (Array.isArray(part)) out.push(...part);
    } catch {
      /* ignore per-domain failures */
    }
  }
  // De-dupe by domain+value length marker (never log values)
  const seen = new Set();
  return out.filter((c) => {
    const key = `${c.domain}|${c.path}|${String(c.value || "").length}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function requireSession(tabUrl) {
  const { org, session } = await getOrgSession(tabUrl);
  if (!session?.sid) throw new Error("No Salesforce session cookie found. Open a logged-in Salesforce tab.");
  return { org, session };
}

async function runSoql(tabUrl, query, apiVersion = DEFAULT_API_VERSION) {
  if (!query?.trim()) throw new Error("SOQL query is empty");
  // Security: caller must not concatenate untrusted input without binds — UI tools use fixed templates.
  const { session } = await requireSession(tabUrl);
  await ensureHostFetchAllowed(session.apiBase);
  const url = restUrl(session.apiBase, `/query?q=${encodeURIComponent(query.trim())}`, apiVersion);
  return sfFetchUrl(url, session.sid);
}

async function toolingQuery(tabUrl, query, apiVersion = DEFAULT_API_VERSION) {
  if (!query?.trim()) throw new Error("Tooling query is empty");
  const { session } = await requireSession(tabUrl);
  await ensureHostFetchAllowed(session.apiBase);
  const url = restUrl(session.apiBase, `/tooling/query?q=${encodeURIComponent(query.trim())}`, apiVersion);
  return sfFetchUrl(url, session.sid);
}

async function restGet(tabUrl, path, apiVersion = DEFAULT_API_VERSION) {
  const { session } = await requireSession(tabUrl);
  await ensureHostFetchAllowed(session.apiBase);
  const url = path.startsWith("http") ? path : restUrl(session.apiBase, path, apiVersion);
  return sfFetchUrl(url, session.sid);
}

async function describeGlobal(tabUrl, apiVersion = DEFAULT_API_VERSION, tooling = false) {
  return restGet(tabUrl, tooling ? "/tooling/sobjects" : "/sobjects", apiVersion);
}

async function describeSObject(tabUrl, sobject, apiVersion = DEFAULT_API_VERSION, tooling = false) {
  if (!sobject) throw new Error("Object API name required");
  if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(sobject)) throw new Error("Invalid object API name");
  const path = tooling
    ? `/tooling/sobjects/${sobject}/describe`
    : `/sobjects/${sobject}/describe`;
  return restGet(tabUrl, path, apiVersion);
}

function assertRecordId(id) {
  const clean = String(id || "").trim();
  if (!/^[a-zA-Z0-9]{15,18}$/.test(clean)) throw new Error("Invalid Salesforce record Id.");
  return clean;
}

function assertSObjectName(sobject) {
  const name = String(sobject || "").trim();
  if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(name)) throw new Error("Invalid object API name");
  return name;
}

async function getSObject(tabUrl, sobject, id, apiVersion = DEFAULT_API_VERSION, tooling = false) {
  const type = assertSObjectName(sobject);
  const recordId = assertRecordId(id);
  const prefix = tooling ? "/tooling" : "";
  return restGet(tabUrl, `${prefix}/sobjects/${type}/${recordId}`, apiVersion);
}

async function updateSObject(
  tabUrl,
  sobject,
  id,
  fields,
  apiVersion = DEFAULT_API_VERSION,
  tooling = false
) {
  const type = assertSObjectName(sobject);
  const recordId = assertRecordId(id);
  if (!fields || typeof fields !== "object" || Array.isArray(fields)) {
    throw new Error("Update fields object required.");
  }
  // Security: never allow Id / attributes in PATCH body; only simple field map.
  const body = {};
  for (const [key, value] of Object.entries(fields)) {
    if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(key)) continue;
    if (key === "Id" || key === "attributes") continue;
    body[key] = value;
  }
  if (!Object.keys(body).length) throw new Error("No updatable fields provided.");

  // Custom metadata records: standard sObject PATCH is usually blocked — use Tooling CustomMetadata.
  if (/__mdt$/i.test(type) && !tooling) {
    return updateCustomMetadataRecord(tabUrl, type, recordId, body, apiVersion);
  }

  const { session } = await requireSession(tabUrl);
  await ensureHostFetchAllowed(session.apiBase);
  const prefix = tooling ? "/tooling" : "";
  const url = restUrl(session.apiBase, `${prefix}/sobjects/${type}/${recordId}`, apiVersion);
  await sfFetchUrl(url, session.sid, { method: "PATCH", body });
  return { ok: true, id: recordId, sobject: type, fields: Object.keys(body) };
}

/**
 * Update a Custom Metadata Type record via Tooling API CustomMetadata.
 * FullName format: MyType__mdt.RecordDeveloperName
 */
async function updateCustomMetadataRecord(tabUrl, sobject, id, fields, apiVersion) {
  const current = await getSObject(tabUrl, sobject, id, apiVersion, false);
  const developerName = current?.DeveloperName;
  if (!developerName || !/^[A-Za-z][A-Za-z0-9_]*$/.test(developerName)) {
    throw new Error("Custom metadata record is missing DeveloperName; cannot update via Tooling.");
  }
  const label =
    fields.MasterLabel ??
    fields.Label ??
    current.MasterLabel ??
    current.Label ??
    developerName;

  const skip = new Set([
    "Id",
    "DeveloperName",
    "QualifiedApiName",
    "NamespacePrefix",
    "MasterLabel",
    "Label",
    "Language",
    "SystemModstamp",
    "CreatedDate",
    "CreatedById",
    "LastModifiedDate",
    "LastModifiedById",
    "attributes"
  ]);
  const values = [];
  for (const [key, value] of Object.entries(fields)) {
    if (skip.has(key)) continue;
    values.push({
      field: key,
      value: value === null || value === undefined ? null : value
    });
  }

  const { session } = await requireSession(tabUrl);
  await ensureHostFetchAllowed(session.apiBase);
  const fullName = `${sobject}.${developerName}`;
  const url = restUrl(
    session.apiBase,
    `/tooling/sobjects/CustomMetadata/${encodeURIComponent(sobject)}.${encodeURIComponent(developerName)}`,
    apiVersion
  );
  await sfFetchUrl(url, session.sid, {
    method: "PATCH",
    body: {
      Metadata: {
        label: String(label),
        values
      }
    }
  });
  return {
    ok: true,
    id,
    sobject,
    fields: Object.keys(fields),
    via: "tooling-custom-metadata",
    fullName
  };
}

async function deleteSObject(tabUrl, sobject, id, apiVersion = DEFAULT_API_VERSION, tooling = false) {
  const type = assertSObjectName(sobject);
  const recordId = assertRecordId(id);
  const { session } = await requireSession(tabUrl);
  await ensureHostFetchAllowed(session.apiBase);
  const prefix = tooling ? "/tooling" : "";
  const url = restUrl(session.apiBase, `${prefix}/sobjects/${type}/${recordId}`, apiVersion);
  await sfFetchUrl(url, session.sid, { method: "DELETE" });
  return { ok: true, id: recordId, sobject: type };
}

async function listFlows(tabUrl, apiVersion = DEFAULT_API_VERSION) {
  const q =
    "SELECT Id, ApiName, Label, ProcessType, TriggerType, IsActive, LastModifiedDate FROM FlowDefinitionView ORDER BY LastModifiedDate DESC LIMIT 50";
  try {
    return await runSoql(tabUrl, q, apiVersion);
  } catch {
    const tooling =
      "SELECT Id, DeveloperName, MasterLabel, ManageableState, LastModifiedDate FROM FlowDefinition ORDER BY LastModifiedDate DESC LIMIT 50";
    return toolingQuery(tabUrl, tooling, apiVersion);
  }
}

async function getApexCoverage(tabUrl, apiVersion = DEFAULT_API_VERSION) {
  // Aggregate coverage from ApexCodeCoverageAggregate when available
  try {
    const q =
      "SELECT ApexClassOrTriggerId, ApexClassOrTrigger.Name, NumLinesCovered, NumLinesUncovered FROM ApexCodeCoverageAggregate LIMIT 200";
    const data = await toolingQuery(tabUrl, q, apiVersion);
    const records = data.records || [];
    let covered = 0;
    let uncovered = 0;
    for (const r of records) {
      covered += r.NumLinesCovered || 0;
      uncovered += r.NumLinesUncovered || 0;
    }
    const total = covered + uncovered;
    const coveragePercent = total ? Math.round((covered / total) * 1000) / 10 : null;
    return { coveragePercent, classCount: records.length, covered, uncovered };
  } catch (e) {
    return { coveragePercent: null, error: e.message };
  }
}

async function getOrgLimits(tabUrl, apiVersion = DEFAULT_API_VERSION) {
  return restGet(tabUrl, "/limits", apiVersion);
}

function escapeSoqlLike(value) {
  return String(value || "")
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/%/g, "\\%")
    .replace(/_/g, "\\_");
}

async function listApexClasses(tabUrl, query = "", apiVersion = DEFAULT_API_VERSION) {
  const needle = String(query || "").trim();
  // Security: only allowlist-safe characters in LIKE; escape remaining quotes/wildcards.
  if (needle && !/^[A-Za-z0-9_.\- ]{1,80}$/.test(needle)) {
    throw new Error("Search may only use letters, numbers, spaces, underscore, dot, or hyphen.");
  }
  let q =
    "SELECT Id, Name, NamespacePrefix, ApiVersion, LengthWithoutComments, LastModifiedDate FROM ApexClass ORDER BY Name ASC LIMIT 100";
  if (needle) {
    const like = escapeSoqlLike(needle);
    q = `SELECT Id, Name, NamespacePrefix, ApiVersion, LengthWithoutComments, LastModifiedDate FROM ApexClass WHERE Name LIKE '%${like}%' ORDER BY LastModifiedDate DESC LIMIT 50`;
  }
  const data = await toolingQuery(tabUrl, q, apiVersion);
  return {
    totalSize: data.totalSize ?? (data.records || []).length,
    records: (data.records || []).map((r) => ({
      id: r.Id,
      name: r.Name,
      namespace: r.NamespacePrefix || null,
      apiVersion: r.ApiVersion,
      length: r.LengthWithoutComments,
      lastModifiedDate: r.LastModifiedDate
    }))
  };
}

async function getApexClassBody(tabUrl, id, apiVersion = DEFAULT_API_VERSION) {
  const cleanId = String(id || "").trim();
  if (!/^[a-zA-Z0-9]{15,18}$/.test(cleanId)) throw new Error("Invalid Apex class Id.");
  const q = `SELECT Id, Name, NamespacePrefix, Body, ApiVersion, LengthWithoutComments, LastModifiedDate FROM ApexClass WHERE Id = '${cleanId}' LIMIT 1`;
  const data = await toolingQuery(tabUrl, q, apiVersion);
  const row = data.records?.[0];
  if (!row) throw new Error("Apex class not found.");
  return {
    id: row.Id,
    name: row.Name,
    namespace: row.NamespacePrefix || null,
    body: row.Body || "",
    apiVersion: row.ApiVersion,
    length: row.LengthWithoutComments,
    lastModifiedDate: row.LastModifiedDate
  };
}

async function getRecentDeployFailures(tabUrl, apiVersion = DEFAULT_API_VERSION) {
  try {
    const q =
      "SELECT Id, Status, CreatedDate, ErrorMessage FROM DeployRequest WHERE Status = 'Failed' ORDER BY CreatedDate DESC LIMIT 5";
    const data = await toolingQuery(tabUrl, q, apiVersion);
    return { count: data.records?.length || 0, records: data.records || [] };
  } catch {
    return { count: 0, records: [], error: "DeployRequest not accessible" };
  }
}

async function searchMetadata(tabUrl, query, typeId, apiVersion = DEFAULT_API_VERSION) {
  const q = String(query || "").trim();
  if (q.length < 2) throw new Error("Type at least 2 characters to search.");
  // Security: only allowlisted metadata type handlers; query values are SOQL-escaped in lib.
  const types = typeId
    ? METADATA_SEARCH_TYPES.filter((t) => t.id === typeId)
    : METADATA_SEARCH_TYPES;

  const results = [];
  for (const typeDef of types) {
    try {
      const data = typeDef.tooling
        ? await toolingQuery(tabUrl, typeDef.query(q), apiVersion)
        : await runSoql(tabUrl, typeDef.query(q), apiVersion);
      for (const record of data.records || []) {
        results.push({
          typeId: typeDef.id,
          typeLabel: typeDef.label,
          id: record.Id || record.DurableId || null,
          name: typeDef.displayName ? typeDef.displayName(record) : record.Name || record.DeveloperName || record.ApiName,
          lastModifiedDate: record.LastModifiedDate || null,
          record,
          openPath: typeDef.openPath(record)
        });
      }
    } catch (e) {
      if (typeDef.fallback) {
        try {
          const fb = typeDef.fallback;
          const data = fb.tooling
            ? await toolingQuery(tabUrl, fb.query(q), apiVersion)
            : await runSoql(tabUrl, fb.query(q), apiVersion);
          for (const record of data.records || []) {
            results.push({
              typeId: typeDef.id,
              typeLabel: typeDef.label,
              id: record.Id || null,
              name: fb.displayName ? fb.displayName(record) : record.Name || record.DeveloperName,
              lastModifiedDate: record.LastModifiedDate || null,
              record,
              openPath: fb.openPath(record)
            });
          }
        } catch (e2) {
          results.push({
            typeId: typeDef.id,
            typeLabel: typeDef.label,
            error: e2.message || e.message
          });
        }
      } else {
        results.push({ typeId: typeDef.id, typeLabel: typeDef.label, error: e.message });
      }
    }
  }
  return { query: q, results };
}

async function listPackageTypeMembers(tabUrl, typeName, apiVersion = DEFAULT_API_VERSION) {
  const typeDef = PACKAGE_TYPES.find((t) => t.name === typeName);
  if (!typeDef) throw new Error("Unknown metadata type");

  try {
    const data = typeDef.tooling
      ? await toolingQuery(tabUrl, typeDef.listQuery, apiVersion)
      : await runSoql(tabUrl, typeDef.listQuery, apiVersion);
    return {
      type: typeDef.name,
      label: typeDef.label,
      members: (data.records || []).map((r) => ({
        id: r.Id || null,
        member: typeDef.memberName(r),
        label: typeDef.memberName(r),
        lastModifiedDate: r.LastModifiedDate || null
      }))
    };
  } catch (e) {
    if (!typeDef.fallback) throw e;
    const fb = typeDef.fallback;
    const data = fb.tooling
      ? await toolingQuery(tabUrl, fb.listQuery, apiVersion)
      : await runSoql(tabUrl, fb.listQuery, apiVersion);
    return {
      type: typeDef.name,
      label: typeDef.label,
      members: (data.records || []).map((r) => ({
        id: r.Id || null,
        member: fb.memberName(r),
        label: fb.memberName(r),
        lastModifiedDate: r.LastModifiedDate || null
      }))
    };
  }
}

async function listInactiveFlowVersions(
  tabUrl,
  needle = "",
  includeMetadata = false,
  apiVersion = DEFAULT_API_VERSION
) {
  // Salesforce Tooling rule: Metadata/FullName cannot be queried for multiple Flow rows.
  // Always list without Metadata, then optionally GET each version when scanning field refs.
  const q = buildInactiveFlowsQuery({ includeMetadata: false, limit: 200 });
  const data = await toolingQuery(tabUrl, q, apiVersion);
  let records = data.records || [];
  const needleText = String(needle || "").trim();

  if (includeMetadata && needleText) {
    const { session } = await requireSession(tabUrl);
    const scanned = [];
    for (const flow of records) {
      try {
        const detailUrl = restUrl(session.apiBase, `/tooling/sobjects/Flow/${flow.Id}`, apiVersion);
        const detail = await sfFetchUrl(detailUrl, session.sid);
        const merged = { ...flow, Metadata: detail?.Metadata, FullName: detail?.FullName };
        if (flowMatchesNeedle(merged, needleText)) scanned.push(merged);
      } catch {
        // If detail fetch fails, still keep label-only match
        if (flowMatchesNeedle(flow, needleText)) scanned.push(flow);
      }
    }
    records = scanned;
  } else if (needleText) {
    records = records.filter((f) => flowMatchesNeedle(f, needleText));
  }

  return {
    total: data.totalSize ?? (data.records || []).length,
    matched: records.length,
    statuses: INACTIVE_FLOW_STATUSES,
    scannedMetadata: Boolean(includeMetadata && needleText),
    versions: records.map(summarizeFlowVersion)
  };
}

async function deleteFlowVersions(tabUrl, ids, apiVersion = DEFAULT_API_VERSION) {
  if (!Array.isArray(ids) || !ids.length) throw new Error("No flow version Ids provided.");
  // Security: only delete Tooling Flow records; validate Id shape; never trust client status alone.
  const cleanIds = [...new Set(ids.map((id) => String(id || "").trim()).filter((id) => /^[a-zA-Z0-9]{15,18}$/.test(id)))];
  if (!cleanIds.length) throw new Error("No valid Salesforce Ids.");
  if (cleanIds.length > 50) throw new Error("Delete at most 50 versions at a time.");

  const { session } = await requireSession(tabUrl);
  const results = [];
  for (const id of cleanIds) {
    try {
      // Verify status before delete — refuse Active
      const detailUrl = restUrl(session.apiBase, `/tooling/sobjects/Flow/${id}`, apiVersion);
      const detail = await sfFetchUrl(detailUrl, session.sid);
      if (detail?.Status === "Active") {
        results.push({ id, ok: false, error: "Refused: Active flow versions cannot be deleted." });
        continue;
      }
      if (detail?.Status && !INACTIVE_FLOW_STATUSES.includes(detail.Status)) {
        results.push({ id, ok: false, error: `Refused: status ${detail.Status} is not deletable via this tool.` });
        continue;
      }
      await sfFetchUrl(detailUrl, session.sid, { method: "DELETE" });
      results.push({
        id,
        ok: true,
        status: detail?.Status,
        label: detail?.MasterLabel || id
      });
    } catch (e) {
      results.push({ id, ok: false, error: e.message || String(e) });
    }
  }
  return {
    deleted: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    results
  };
}

async function executeAnonymous(tabUrl, apex, apiVersion = DEFAULT_API_VERSION) {
  const body = String(apex || "").trim();
  if (!body) throw new Error("Apex body is empty.");
  if (body.length > 12000) {
    throw new Error("Apex body is too long for the Tooling executeAnonymous URL limit (~12k). Shorten it.");
  }
  // Security: execute only via authenticated user session; never log/store the body or sid.
  const { session } = await requireSession(tabUrl);
  const url = restUrl(
    session.apiBase,
    `/tooling/executeAnonymous/?anonymousBody=${encodeURIComponent(body)}`,
    apiVersion
  );
  const result = await sfFetchUrl(url, session.sid);
  return {
    ...result,
    executedAt: new Date().toISOString()
  };
}

async function fetchLatestApexDebug(tabUrl, apiVersion = DEFAULT_API_VERSION) {
  const { session } = await requireSession(tabUrl);
  const userId = session.userInfo?.user_id || session.userInfo?.userId;
  let q = "SELECT Id, StartTime, Status, LogLength, LogUserId FROM ApexLog ORDER BY StartTime DESC LIMIT 1";
  if (userId && /^[a-zA-Z0-9]{15,18}$/.test(userId)) {
    q = `SELECT Id, StartTime, Status, LogLength, LogUserId FROM ApexLog WHERE LogUserId = '${userId}' ORDER BY StartTime DESC LIMIT 1`;
  }
  const data = await toolingQuery(tabUrl, q, apiVersion);
  const log = data.records?.[0];
  if (!log?.Id) {
    throw new Error("No Apex debug log found. Set a Trace Flag for your user in Setup, then execute again.");
  }
  const bodyUrl = restUrl(session.apiBase, `/tooling/sobjects/ApexLog/${log.Id}/Body`, apiVersion);
  const bodyText = await sfFetchText(bodyUrl, session.sid);
  return {
    logId: log.Id,
    startTime: log.StartTime,
    status: log.Status,
    logLength: log.LogLength,
    body: bodyText
  };
}

async function ensureHostFetchAllowed(apiBase) {
  if (!apiBase) throw new Error("Missing Salesforce API host.");
  let origin;
  try {
    origin = new URL(apiBase).origin;
  } catch {
    throw new Error(`Invalid Salesforce API host: ${apiBase}`);
  }
  // Host permissions are declared in the manifest; if the user set Site access to
  // "On click", Chrome still blocks fetch with a bare "Failed to fetch".
  try {
    const originPattern = `${origin}/*`;
    const hasExact = await chrome.permissions.contains({ origins: [originPattern] });
    if (!hasExact) {
      const granted = await chrome.permissions.request({ origins: [originPattern] });
      if (!granted) {
        throw new Error(
          `Chrome blocked access to ${origin}. Open chrome://extensions → OrgKit → Details → Site access → “On all sites”, then reload and retry.`
        );
      }
    }
  } catch (e) {
    if (/Chrome blocked access|Invalid Salesforce|Missing Salesforce/.test(e.message || "")) throw e;
    // permissions.request can fail from SW without a user gesture — continue; fetch error handler clarifies.
  }
}

function networkBlockedMessage(url, err) {
  let host = url;
  try {
    host = new URL(url).host;
  } catch {
    /* keep raw */
  }
  return (
    `Failed to reach Salesforce API (${host}). ` +
    `Usually Chrome Site access is restricted: chrome://extensions → OrgKit → Details → Site access → turn ON each Salesforce domain (or “On all sites”). ` +
    `Listing the URLs is not enough if their toggles are gray/off. ` +
    `Then Reload the extension and keep a logged-in Salesforce tab open. ` +
    `Detail: ${err?.message || err}`
  );
}

function unique(arr) {
  return [...new Set(arr.filter(Boolean))];
}
