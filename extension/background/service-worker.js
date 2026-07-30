import {
  isSalesforceUrl,
  parseOrgFromUrl,
  restUrl,
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

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.get(
    {
      favorites: [],
      apiVersion: DEFAULT_API_VERSION,
      showToolbar: true,
      showBadge: true,
      deployChecklist: []
    },
    (data) => chrome.storage.sync.set(data)
  );
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const handlers = {
    getOrgSession: () => getOrgSession(message.tabUrl || sender.tab?.url),
    runSoql: () => runSoql(message.tabUrl, message.query, message.apiVersion),
    toolingQuery: () => toolingQuery(message.tabUrl, message.query, message.apiVersion),
    restGet: () => restGet(message.tabUrl, message.path, message.apiVersion),
    describeGlobal: () => describeGlobal(message.tabUrl, message.apiVersion),
    describeSObject: () => describeSObject(message.tabUrl, message.sobject, message.apiVersion),
    listFlows: () => listFlows(message.tabUrl, message.apiVersion),
    getApexCoverage: () => getApexCoverage(message.tabUrl, message.apiVersion),
    getRecentDeployFailures: () => getRecentDeployFailures(message.tabUrl, message.apiVersion),
    openUrl: async () => {
      await chrome.tabs.create({ url: message.url });
      return { ok: true };
    },
    getActiveTabOrg: () => getActiveTabOrg(),
    searchMetadata: () => searchMetadata(message.tabUrl, message.query, message.typeId, message.apiVersion),
    listPackageTypeMembers: () =>
      listPackageTypeMembers(message.tabUrl, message.typeName, message.apiVersion),
    listInactiveFlowVersions: () =>
      listInactiveFlowVersions(message.tabUrl, message.needle, message.includeMetadata, message.apiVersion),
    deleteFlowVersions: () => deleteFlowVersions(message.tabUrl, message.ids, message.apiVersion),
    getExtensionVersion: async () => ({
      version: "1.3.0",
      hasSearchMetadata: typeof searchMetadata === "function",
      hasFlowCleaner: typeof listInactiveFlowVersions === "function",
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
    org.hostname.replace(".lightning.force.com", ".my.salesforce.com"),
    org.hostname.replace(".salesforce-setup.com", ".my.salesforce.com"),
    org.apiBase ? new URL(org.apiBase).hostname : null,
    org.hostname,
    org.hostname.replace(".my.salesforce.com", ".lightning.force.com")
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
    const all = await chrome.cookies.getAll({ name: "sid" });
    // Prefer classic/API host cookies over lightning/setup UI cookies.
    const ranked = [...all].sort((a, b) => apiCookieRank(b.domain) - apiCookieRank(a.domain));
    const match = ranked.find((c) =>
      /\.(salesforce|force|cloudforce)\.com$/i.test(c.domain.replace(/^\./, ""))
    );
    if (match) {
      sid = match.value;
      cookieHost = match.domain.replace(/^\./, "");
    }
  }

  if (!sid) {
    return { sid: null, apiBase: org.apiBase, cookieHost: null, userInfo: null };
  }

  const apiBase = cookieHost
    ? `https://${cookieHost
        .replace(".lightning.force.com", ".my.salesforce.com")
        .replace(".salesforce-setup.com", ".my.salesforce.com")}`
    : org.apiBase;

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

async function requireSession(tabUrl) {
  const { org, session } = await getOrgSession(tabUrl);
  if (!session?.sid) throw new Error("No Salesforce session cookie found. Open a logged-in Salesforce tab.");
  return { org, session };
}

async function runSoql(tabUrl, query, apiVersion = DEFAULT_API_VERSION) {
  if (!query?.trim()) throw new Error("SOQL query is empty");
  // Security: caller must not concatenate untrusted input without binds — UI tools use fixed templates.
  const { session } = await requireSession(tabUrl);
  const url = restUrl(session.apiBase, `/query?q=${encodeURIComponent(query.trim())}`, apiVersion);
  return sfFetchUrl(url, session.sid);
}

async function toolingQuery(tabUrl, query, apiVersion = DEFAULT_API_VERSION) {
  if (!query?.trim()) throw new Error("Tooling query is empty");
  const { session } = await requireSession(tabUrl);
  const url = restUrl(session.apiBase, `/tooling/query?q=${encodeURIComponent(query.trim())}`, apiVersion);
  return sfFetchUrl(url, session.sid);
}

async function restGet(tabUrl, path, apiVersion = DEFAULT_API_VERSION) {
  const { session } = await requireSession(tabUrl);
  const url = path.startsWith("http") ? path : restUrl(session.apiBase, path, apiVersion);
  return sfFetchUrl(url, session.sid);
}

async function describeGlobal(tabUrl, apiVersion = DEFAULT_API_VERSION) {
  return restGet(tabUrl, "/sobjects", apiVersion);
}

async function describeSObject(tabUrl, sobject, apiVersion = DEFAULT_API_VERSION) {
  if (!sobject) throw new Error("Object API name required");
  if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(sobject)) throw new Error("Invalid object API name");
  return restGet(tabUrl, `/sobjects/${sobject}/describe`, apiVersion);
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

async function sfFetchUrl(url, sid, options = {}) {
  const method = options.method || "GET";
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${sid}`,
      Accept: "application/json"
    },
    credentials: "omit"
  });

  if (method === "DELETE" && (res.status === 204 || res.status === 200)) {
    return { ok: true };
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
  return body;
}

function unique(arr) {
  return [...new Set(arr.filter(Boolean))];
}
