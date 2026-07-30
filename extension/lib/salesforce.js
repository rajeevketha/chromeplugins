/** Salesforce org / session helpers shared by popup & background. */

const SF_HOST_RE =
  /^(?<sub>[a-z0-9-]+)\.(?<rest>my\.salesforce\.com|lightning\.force\.com|salesforce\.com|cloudforce\.com|visual\.force\.com|vf\.force\.com|salesforce-setup\.com|my\.salesforce-setup\.com)$/i;

export function isSalesforceUrl(url) {
  try {
    const u = new URL(url);
    return /\.(salesforce|force|cloudforce|salesforce-setup|visualforce)\.com$/i.test(u.hostname);
  } catch {
    return false;
  }
}

/**
 * Map Lightning / Setup hostnames to the REST API host (*.my.salesforce.com).
 * Critical: *.my.salesforce-setup.com must become *.my.salesforce.com
 * (NOT *.my.my.salesforce.com).
 */
export function toSalesforceApiHost(hostname) {
  let h = String(hostname || "")
    .trim()
    .replace(/^\./, "")
    .toLowerCase();
  if (!h) return h;
  // Repair already-broken hosts from older builds
  h = h.replace(/\.my\.my\.salesforce\.com$/i, ".my.salesforce.com");
  if (h.endsWith(".my.salesforce.com")) return h;
  if (h.endsWith(".lightning.force.com")) {
    return h.replace(/\.lightning\.force\.com$/i, ".my.salesforce.com");
  }
  if (h.endsWith(".my.salesforce-setup.com")) {
    return h.replace(/\.my\.salesforce-setup\.com$/i, ".my.salesforce.com");
  }
  if (h.endsWith(".salesforce-setup.com")) {
    return h.replace(/\.salesforce-setup\.com$/i, ".my.salesforce.com");
  }
  return h;
}

export function toSalesforceApiBase(hostnameOrOrigin) {
  const raw = String(hostnameOrOrigin || "").trim();
  if (!raw) return "";
  try {
    if (raw.includes("://")) {
      const u = new URL(raw);
      return `${u.protocol}//${toSalesforceApiHost(u.hostname)}`;
    }
  } catch {
    /* treat as hostname */
  }
  return `https://${toSalesforceApiHost(raw)}`;
}

export function parseOrgFromUrl(url) {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    const match = host.match(SF_HOST_RE);
    const isLightning = host.includes("lightning.force.com") || u.pathname.startsWith("/lightning");
    const isSetup = host.includes("salesforce-setup.com") || u.pathname.includes("/lightning/setup/");
    const isDevEd = host.includes("-dev-ed.") || host.includes("develop.my.salesforce.com");
    const isSandbox =
      host.includes(".sandbox.") ||
      host.includes("--") ||
      /^[a-z0-9]+--[a-z0-9]+\./i.test(host) ||
      host.startsWith("cs") ||
      host.includes("scratch");

    let instanceBase = `${u.protocol}//${u.hostname}`;
    const apiHost = toSalesforceApiHost(host);

    const myDomain = host.split(".")[0].replace(/--.*$/, "");
    const envLabel = isSandbox ? "Sandbox" : isDevEd ? "Developer" : "Production";

    return {
      hostname: host,
      origin: u.origin,
      pathname: u.pathname,
      instanceBase,
      apiBase: `${u.protocol}//${apiHost}`,
      myDomain,
      isLightning,
      isSetup,
      isSandbox,
      isDevEd,
      envLabel,
      url: u.href
    };
  } catch {
    return null;
  }
}

/** Convert 15-char Salesforce ID to 18-char. */
export function to18(id15) {
  if (!id15 || id15.length !== 15) return id15;
  const suffix = [];
  for (let block = 0; block < 3; block++) {
    let flags = 0;
    for (let i = 0; i < 5; i++) {
      const c = id15.charAt(block * 5 + i);
      if (c >= "A" && c <= "Z") flags += 1 << i;
    }
    suffix.push("ABCDEFGHIJKLMNOPQRSTUVWXYZ012345".charAt(flags));
  }
  return id15 + suffix.join("");
}

export function normalizeSfId(id) {
  if (!id) return null;
  const clean = String(id).trim();
  if (!/^[a-zA-Z0-9]{15}([a-zA-Z0-9]{3})?$/.test(clean)) return null;
  return clean.length === 15 ? to18(clean) : clean;
}

export function extractIdsFromText(text) {
  if (!text) return [];
  const re = /\b([a-zA-Z0-9]{15}|[a-zA-Z0-9]{18})\b/g;
  const found = new Set();
  let m;
  while ((m = re.exec(text)) !== null) {
    const id = m[1];
    // Heuristic: SF IDs usually start with digit or specific letters
    if (/^[0-9a-zA-Z]{3}/.test(id) && /[0-9]/.test(id.slice(0, 3))) {
      found.add(id);
    } else if (/^[a-zA-Z][0-9a-zA-Z]{2}/.test(id) && /[0-9]/.test(id)) {
      found.add(id);
    }
  }
  return [...found];
}

export function buildRecordUrl(org, recordId, useLightning = true) {
  const id = normalizeSfId(recordId) || recordId;
  if (useLightning) {
    return `${org.origin}/${id}`;
  }
  return `${org.apiBase || org.origin}/${id}`;
}

export function buildSetupUrl(org, lightningPath, classicPath) {
  if (org?.isLightning !== false) {
    // Prefer lightning path on lightning hosts
    const base = org.origin.includes("lightning")
      ? org.origin
      : org.origin.replace(".my.salesforce.com", ".lightning.force.com");
    return `${base}${lightningPath}`;
  }
  return `${org.apiBase || org.origin}${classicPath || lightningPath}`;
}

export const DEFAULT_API_VERSION = "59.0";

export function restUrl(apiBase, path, apiVersion = DEFAULT_API_VERSION) {
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${apiBase}/services/data/v${apiVersion}${p}`;
}
