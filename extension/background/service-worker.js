import {
  isSalesforceUrl,
  parseOrgFromUrl,
  restUrl,
  normalizeSfId,
  DEFAULT_API_VERSION
} from "../lib/salesforce.js";

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.get({ favorites: [], apiVersion: DEFAULT_API_VERSION, showToolbar: true, showBadge: true }, (data) => {
    chrome.storage.sync.set(data);
  });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const handlers = {
    getOrgSession: () => getOrgSession(message.tabUrl || sender.tab?.url),
    runSoql: () => runSoql(message.tabUrl, message.query, message.apiVersion),
    restGet: () => restGet(message.tabUrl, message.path, message.apiVersion),
    openUrl: async () => {
      await chrome.tabs.create({ url: message.url });
      return { ok: true };
    },
    getActiveTabOrg: () => getActiveTabOrg()
  };

  const fn = handlers[message.type];
  if (!fn) return false;

  fn()
    .then((result) => sendResponse({ ok: true, result }))
    .catch((error) => sendResponse({ ok: false, error: error.message || String(error) }));
  return true;
});

async function getActiveTabOrg() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url || !isSalesforceUrl(tab.url)) {
    return { tab, org: null, session: null };
  }
  const org = parseOrgFromUrl(tab.url);
  const session = await getSessionForOrg(org);
  return { tab, org, session };
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

  const hostsToTry = unique([
    org.hostname,
    org.hostname.replace(".lightning.force.com", ".my.salesforce.com"),
    org.hostname.replace(".salesforce-setup.com", ".my.salesforce.com"),
    org.hostname.replace(".my.salesforce.com", ".lightning.force.com")
  ]);

  let sid = null;
  let cookieHost = null;
  for (const host of hostsToTry) {
    const cookie = await chrome.cookies.get({
      url: `https://${host}/`,
      name: "sid"
    });
    if (cookie?.value) {
      sid = cookie.value;
      cookieHost = host;
      break;
    }
  }

  if (!sid) {
    // Broader search across SF cookies
    const all = await chrome.cookies.getAll({ name: "sid" });
    const match = all.find((c) =>
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
    ? `https://${cookieHost.replace(".lightning.force.com", ".my.salesforce.com").replace(".salesforce-setup.com", ".my.salesforce.com")}`
    : org.apiBase;

  let userInfo = null;
  try {
    userInfo = await sfFetch(apiBase, sid, "/services/oauth2/userinfo", false);
  } catch {
    try {
      const identity = await sfFetch(apiBase, sid, restUrl("", "/chatter/users/me").replace(apiBase, ""), true);
      userInfo = identity;
    } catch {
      // Session may be UI-only; still usable for navigation helpers
    }
  }

  return { sid, apiBase, cookieHost, userInfo };
}

async function runSoql(tabUrl, query, apiVersion = DEFAULT_API_VERSION) {
  if (!query?.trim()) throw new Error("SOQL query is empty");
  const { org, session } = await getOrgSession(tabUrl);
  if (!session?.sid) throw new Error("No Salesforce session cookie found. Open a logged-in Salesforce tab.");

  const path = `/query?q=${encodeURIComponent(query.trim())}`;
  const url = restUrl(session.apiBase, path, apiVersion);
  return sfFetchUrl(url, session.sid);
}

async function restGet(tabUrl, path, apiVersion = DEFAULT_API_VERSION) {
  const { session } = await getOrgSession(tabUrl);
  if (!session?.sid) throw new Error("No Salesforce session cookie found.");
  const url = path.startsWith("http") ? path : restUrl(session.apiBase, path, apiVersion);
  return sfFetchUrl(url, session.sid);
}

async function sfFetch(apiBase, sid, path, isRestRelative) {
  const url = isRestRelative
    ? `${apiBase}${path.startsWith("/") ? path : `/${path}`}`
    : path.startsWith("http")
      ? path
      : `${apiBase}${path}`;
  return sfFetchUrl(url, sid);
}

async function sfFetchUrl(url, sid) {
  const res = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${sid}`,
      Accept: "application/json"
    },
    credentials: "omit"
  });

  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }

  if (!res.ok) {
    const msg =
      (Array.isArray(body) && body[0]?.message) ||
      body?.message ||
      `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return body;
}

function unique(arr) {
  return [...new Set(arr.filter(Boolean))];
}
