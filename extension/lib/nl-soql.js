import { aiComplete, isAiReady, stripCodeFence } from "./ai.js";

const OBJECT_ALIASES = {
  accounts: "Account",
  account: "Account",
  contacts: "Contact",
  contact: "Contact",
  leads: "Lead",
  lead: "Lead",
  opportunities: "Opportunity",
  opportunity: "Opportunity",
  opps: "Opportunity",
  cases: "Case",
  case: "Case",
  users: "User",
  user: "User",
  tasks: "Task",
  task: "Task",
  events: "Event",
  event: "Event",
  campaigns: "Campaign",
  campaign: "Campaign",
  // Prefer custom Product*__c via org matching before these aliases.
  products: "Product2",
  product: "Product2",
  contracts: "Contract",
  contract: "Contract",
  orders: "Order",
  order: "Order",
  quotes: "Quote",
  quote: "Quote",
  assets: "Asset",
  asset: "Asset",
  knowledge: "Knowledge__kav"
};

const STOP_WORDS = new Set([
  "a",
  "an",
  "the",
  "get",
  "show",
  "list",
  "give",
  "fetch",
  "find",
  "all",
  "me",
  "my",
  "of",
  "for",
  "with",
  "from",
  "to",
  "in",
  "on",
  "and",
  "or",
  "records",
  "record",
  "rows",
  "data",
  "query",
  "select",
  "please",
  "need",
  "want",
  "pull",
  "return",
  "display",
  "every",
  "each",
  "those",
  "these",
  "that",
  "this",
  "where",
  "which",
  "whose",
  "created",
  "updated",
  "modified",
  "open",
  "closed",
  "active",
  "inactive",
  "recent",
  "latest",
  "newest",
  "oldest",
  "today",
  "yesterday",
  "week",
  "month",
  "year",
  "days",
  "day",
  "last",
  "first",
  "top",
  "limit",
  "count",
  "how",
  "many",
  "number",
  "named",
  "called",
  "name",
  "is",
  "equals",
  "high",
  "low",
  "priority",
  "status",
  "email",
  "phone"
]);

/**
 * Convert natural language to SOQL using rules, optionally enhanced by AI.
 * Pass org `sobjects` from describeGlobal so custom objects (e.g. SAP_Product__c)
 * resolve from phrases like "sap products".
 * @returns {Promise<{ soql: string, source: 'rules'|'ai', notes: string[] }>}
 */
export async function generateSoql(naturalLanguage, { preferAi = true, sobjects = [] } = {}) {
  const text = naturalLanguage.trim();
  if (!text) throw new Error("Describe the query in plain English.");

  const resolved = resolveObject(text, sobjects);
  const objectHints = buildObjectHints(text, sobjects, resolved);

  if (preferAi && (await isAiReady())) {
    try {
      const hintBlock = objectHints.length
        ? ` Prefer these org objects when they fit: ${objectHints.join(", ")}.`
        : " Prefer exact custom object API names ending in __c when the user names a custom entity.";
      const raw = await aiComplete(
        `You are a Salesforce SOQL expert. Reply with ONLY a valid SOQL query. Use real Salesforce API names (including custom __c objects). Prefer selective filters. Never use SOSL. No markdown.${hintBlock}`,
        text
      );
      const soql = stripCodeFence(raw);
      if (/^select\s+/i.test(soql)) {
        return {
          soql,
          source: "ai",
          notes: ["Generated with AI. Review before running in production."]
        };
      }
    } catch {
      // fall through to rules
    }
  }

  return ruleBasedSoql(text, sobjects, resolved);
}

/** Exported for tests / UI previews. */
export function resolveObject(text, sobjects = []) {
  const lower = String(text || "").toLowerCase();

  // 1) Explicit API name in the prompt (highest priority)
  const explicit = String(text || "").match(/\b([A-Za-z][A-Za-z0-9_]*__(?:c|mdt|e|kav|x|b|p))\b/);
  if (explicit) {
    const api = explicit[1];
    const hit = (sobjects || []).find((o) => o.name?.toLowerCase() === api.toLowerCase());
    return {
      objectName: hit?.name || api,
      via: "api-name",
      score: 100
    };
  }

  // 2) Match against org describe (labels + API names) — beats generic aliases
  const orgHit = matchOrgObject(text, sobjects);
  if (orgHit && orgHit.score >= 70) return orgHit;

  // 3) Standard aliases (Account, Case, …). Skip Product2 if org matched a *Product* custom object weakly,
  // or if the phrase has a qualifier before "product(s)" (e.g. "sap products").
  for (const [alias, api] of Object.entries(OBJECT_ALIASES)) {
    if (!new RegExp(`\\b${alias}\\b`, "i").test(lower)) continue;
    if ((alias === "product" || alias === "products") && hasProductQualifier(lower)) {
      // Try a looser org match before falling through to Product2
      if (orgHit) return orgHit;
      continue;
    }
    return { objectName: api, via: "alias", score: 60 };
  }

  if (orgHit) return orgHit;

  // 4) No org list: guess CustomObject__c from multi-word phrases ("sap products" → Sap_Product__c)
  const guessed = guessCustomObjectApi(text);
  if (guessed) return { objectName: guessed, via: "guessed-api", score: 55 };

  return { objectName: null, via: null, score: 0 };
}

function guessCustomObjectApi(text) {
  const words = significantPhrase(text)
    .split(/\s+/)
    .filter(Boolean);
  if (words.length < 2) return null;
  // Avoid guessing from purely standard phrases already covered by aliases
  const joined = words.join(" ");
  if (/^(accounts?|contacts?|leads?|opportunit(?:y|ies)|cases?|users?|tasks?)$/i.test(joined)) {
    return null;
  }
  const singular = words.map((w, i) => {
    let x = w;
    if (i === words.length - 1) {
      if (x.endsWith("ies") && x.length > 4) x = `${x.slice(0, -3)}y`;
      else if (x.endsWith("ses") || x.endsWith("xes") || x.endsWith("zes")) x = x.slice(0, -2);
      else if (x.endsWith("s") && !x.endsWith("ss") && x.length > 3) x = x.slice(0, -1);
    }
    return x.charAt(0).toUpperCase() + x.slice(1).toLowerCase();
  });
  const api = `${singular.join("_")}__c`;
  if (!/^[A-Za-z][A-Za-z0-9_]*__c$/.test(api)) return null;
  return api;
}

function hasProductQualifier(lower) {
  // "sap products", "custom products", "foo product" — not bare "products"
  return /\b([a-z0-9]+)\s+products?\b/i.test(lower);
}

function matchOrgObject(text, sobjects) {
  const list = Array.isArray(sobjects) ? sobjects : [];
  if (!list.length) return null;

  const textNorm = normalizeKey(text);
  const phraseNorm = normalizeKey(significantPhrase(text));
  let best = null;

  for (const obj of list) {
    if (!obj?.name || obj.queryable === false) continue;
    const name = obj.name;
    const nameKey = normalizeKey(name.replace(/__(c|mdt|e|kav|x|b|p)$/i, ""));
    const fullNameKey = normalizeKey(name);
    const labelKey = normalizeKey(obj.label || "");
    const pluralKey = normalizeKey(obj.labelPlural || obj.pluralLabel || "");

    let score = 0;
    if (new RegExp(`\\b${escapeRegExp(name)}\\b`, "i").test(text)) score = 100;
    else if (phraseNorm && keysMatch(phraseNorm, nameKey)) score = 92;
    else if (phraseNorm && labelKey && keysMatch(phraseNorm, labelKey)) score = 90;
    else if (phraseNorm && pluralKey && keysMatch(phraseNorm, pluralKey)) score = 90;
    else if (nameKey.length >= 4 && textNorm.includes(nameKey)) score = 80;
    else if (labelKey.length >= 4 && textNorm.includes(labelKey)) score = 78;
    else if (pluralKey.length >= 4 && textNorm.includes(pluralKey)) score = 78;
    else if (fullNameKey.length >= 6 && textNorm.includes(fullNameKey)) score = 75;

    // Prefer custom objects slightly when scores tie-ish
    if (score && /__c$/i.test(name)) score += 2;

    if (!best || score > best.score) {
      best = { objectName: name, via: "org-describe", score, label: obj.label || "" };
    }
  }

  return best && best.score > 0 ? best : null;
}

function keysMatch(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  // pluralization: sapproducts ≈ sapproduct
  if (a === `${b}s` || b === `${a}s`) return true;
  if (a === `${b}es` || b === `${a}es`) return true;
  if (a.endsWith("ies") && b.endsWith("y") && a.slice(0, -3) === b.slice(0, -1)) return true;
  if (b.endsWith("ies") && a.endsWith("y") && b.slice(0, -3) === a.slice(0, -1)) return true;
  return false;
}

function significantPhrase(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9_\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w && !STOP_WORDS.has(w) && !/^\d+$/.test(w))
    .join(" ");
}

export function normalizeKey(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/__c$/i, "")
    .replace(/[^a-z0-9]/g, "");
}

function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildObjectHints(text, sobjects, resolved) {
  const hints = [];
  if (resolved?.objectName) hints.push(resolved.objectName);
  const list = Array.isArray(sobjects) ? sobjects : [];
  const phrase = significantPhrase(text);
  if (!phrase) return hints.slice(0, 8);
  const scored = [];
  for (const obj of list) {
    if (!obj?.name || obj.queryable === false) continue;
    if (!/__c$/i.test(obj.name) && !/__/i.test(obj.name)) continue;
    const hit = matchOrgObject(text, [obj]);
    if (hit && hit.score >= 60) scored.push([hit.score, obj.name]);
  }
  scored.sort((a, b) => b[0] - a[0]);
  for (const [, name] of scored) {
    if (!hints.includes(name)) hints.push(name);
    if (hints.length >= 8) break;
  }
  return hints;
}

function ruleBasedSoql(text, sobjects = [], resolved = null) {
  const notes = [];
  const lower = text.toLowerCase();

  let limit = 100;
  const lim =
    lower.match(/\b(?:limit|top|first)\s+(\d+)\b/) ||
    lower.match(/\b(\d+)\s+records?\b/) ||
    lower.match(/\b(\d+)\s+(?:accounts?|contacts?|leads?|opportunit(?:y|ies)|cases?|users?|tasks?)\b/);
  if (lim) limit = Math.min(parseInt(lim[1], 10), 2000);

  const countOnly = /\b(count|how many|number of)\b/.test(lower);

  const resolvedObj = resolved || resolveObject(text, sobjects);
  let objectName = resolvedObj.objectName;
  if (objectName) {
    if (resolvedObj.via === "org-describe") {
      notes.push(
        `Matched org object ${objectName}${resolvedObj.label ? ` (“${resolvedObj.label}”)` : ""} from your describe.`
      );
    } else if (resolvedObj.via === "api-name") {
      notes.push(`Used API name ${objectName} from your prompt.`);
    }
  } else {
    objectName = "Account";
    notes.push(
      "Could not detect object; defaulted to Account. Use the API name (e.g. SAP_Product__c) or open a Salesforce tab so OrgKit can match custom objects."
    );
  }

  const fields = ["Id"];
  if (objectName === "User") fields.push("Name", "Username", "Email", "IsActive");
  else if (objectName === "Case") fields.push("CaseNumber", "Subject", "Status", "Priority");
  else if (objectName === "Opportunity") fields.push("Name", "StageName", "Amount", "CloseDate");
  else if (objectName === "Task") fields.push("Subject", "Status", "Priority", "ActivityDate");
  else fields.push("Name");

  if (/\bemail\b/.test(lower) && !fields.includes("Email")) fields.push("Email");
  if (/\bphone\b/.test(lower) && !fields.includes("Phone")) fields.push("Phone");
  if (/\bindustr/.test(lower) && objectName === "Account") fields.push("Industry");

  const wheres = [];

  const named = text.match(/(?:named|name(?:\s+is|\s+equals)?|called)\s+["']?([^"'\n,]+?)["']?(?:\s|$)/i);
  if (named) {
    wheres.push(`Name LIKE '%${escapeSoql(named[1].trim())}%'`);
  }

  const email = text.match(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/i);
  if (email) wheres.push(`Email = '${escapeSoql(email[0])}'`);

  if (/\bactive\b/.test(lower) && objectName === "User") wheres.push("IsActive = true");
  if (/\binactive\b/.test(lower) && objectName === "User") wheres.push("IsActive = false");
  if (/\bclosed\b/.test(lower) && objectName === "Case") wheres.push("IsClosed = true");
  if (/\bopen\b/.test(lower) && objectName === "Case") wheres.push("IsClosed = false");
  if (/\bwon\b/.test(lower) && objectName === "Opportunity") wheres.push("IsWon = true");
  if (/\blast\s+week\b/.test(lower)) wheres.push("CreatedDate = LAST_WEEK");
  if (/\bthis\s+week\b/.test(lower)) wheres.push("CreatedDate = THIS_WEEK");
  if (/\btoday\b/.test(lower)) wheres.push("CreatedDate = TODAY");
  if (/\byesterday\b/.test(lower)) wheres.push("CreatedDate = YESTERDAY");
  if (/\blast\s+n?\s*days?\s*(\d+)?/.test(lower)) {
    const n = lower.match(/\blast\s+(\d+)\s+days?/);
    wheres.push(`CreatedDate = LAST_N_DAYS:${n ? n[1] : 7}`);
  }

  const industry = lower.match(/industry\s+(?:is\s+|=\s*)?([a-z0-9 &/-]+)/i);
  if (industry && objectName === "Account") {
    wheres.push(`Industry = '${escapeSoql(industry[1].trim())}'`);
  }

  if (countOnly) {
    const where = wheres.length ? ` WHERE ${wheres.join(" AND ")}` : "";
    notes.push("Offline rule engine. Configure AI in Settings for complex NL.");
    return {
      soql: `SELECT COUNT() FROM ${objectName}${where}`,
      source: "rules",
      notes
    };
  }

  const order = /\boldest\b/.test(lower)
    ? " ORDER BY CreatedDate ASC"
    : /\bnewest|latest|recent\b/.test(lower)
      ? " ORDER BY CreatedDate DESC"
      : "";

  const where = wheres.length ? ` WHERE ${wheres.join(" AND ")}` : "";
  notes.push("Offline rule engine. Configure AI in Settings for complex NL.");

  return {
    soql: `SELECT ${fields.join(", ")} FROM ${objectName}${where}${order} LIMIT ${limit}`,
    source: "rules",
    notes
  };
}

function escapeSoql(value) {
  return String(value).replace(/'/g, "\\'");
}
