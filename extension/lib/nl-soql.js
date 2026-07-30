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

/** Tooling API object aliases (NL → SOQL in Tooling mode). */
const TOOLING_ALIASES = {
  "apex class": "ApexClass",
  "apex classes": "ApexClass",
  apexclass: "ApexClass",
  apex: "ApexClass",
  "apex trigger": "ApexTrigger",
  "apex triggers": "ApexTrigger",
  trigger: "ApexTrigger",
  triggers: "ApexTrigger",
  lwc: "LightningComponentBundle",
  "lightning web component": "LightningComponentBundle",
  "lightning web components": "LightningComponentBundle",
  aura: "AuraDefinitionBundle",
  "aura component": "AuraDefinitionBundle",
  flow: "FlowDefinition",
  flows: "FlowDefinition",
  "flow definition": "FlowDefinition",
  "flow definitions": "FlowDefinition",
  "flow version": "Flow",
  "flow versions": "Flow",
  "flow version history": "Flow",
  "custom object": "CustomObject",
  "custom objects": "CustomObject",
  "custom field": "CustomField",
  "custom fields": "CustomField",
  "validation rule": "ValidationRule",
  "validation rules": "ValidationRule",
  profile: "Profile",
  profiles: "Profile",
  "permission set": "PermissionSet",
  "permission sets": "PermissionSet",
  "compact layout": "CompactLayout",
  "flexipage": "FlexiPage",
  "lightning page": "FlexiPage",
  "entity definition": "EntityDefinition",
  "field definition": "FieldDefinition"
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
 * Pass org `sobjects` from describeGlobal (standard or Tooling) so custom objects
 * and Tooling entities resolve from labels / phrases.
 * @returns {Promise<{ soql: string, source: 'rules'|'ai', notes: string[], apiMode: 'rest'|'tooling' }>}
 */
export async function generateSoql(
  naturalLanguage,
  { preferAi = true, sobjects = [], apiMode = "rest" } = {}
) {
  const text = naturalLanguage.trim();
  if (!text) throw new Error("Describe the query in plain English.");
  const mode = apiMode === "tooling" ? "tooling" : "rest";

  const resolved = resolveObject(text, sobjects, mode);
  const objectHints = buildObjectHints(text, sobjects, resolved);

  if (preferAi && (await isAiReady())) {
    try {
      const hintBlock = objectHints.length
        ? ` Prefer these org objects when they fit: ${objectHints.join(", ")}.`
        : mode === "tooling"
          ? " Prefer Tooling API names (ApexClass, FlowDefinition, Flow, CustomObject, CustomField, etc.). For flows use FlowDefinition (API name); Flow is versions and has MasterLabel/Status/VersionNumber — not DeveloperName."
          : " Prefer exact API names including custom __c and custom metadata __mdt objects.";
      const raw = await aiComplete(
        `You are a Salesforce SOQL expert${mode === "tooling" ? " for the Tooling API" : ""}. Reply with ONLY a valid SOQL query. Use real Salesforce API names (including __c and __mdt). Prefer selective filters. Never use SOSL. No markdown.${hintBlock}`,
        text
      );
      const soql = stripCodeFence(raw);
      if (/^select\s+/i.test(soql)) {
        return {
          soql,
          source: "ai",
          apiMode: mode,
          notes: ["Generated with AI. Review before running in production."]
        };
      }
    } catch {
      /* fall through to rules */
    }
  }

  const result = ruleBasedSoql(text, sobjects, resolved, mode);
  return { ...result, apiMode: mode };
}

/** Exported for tests / UI previews. */
export function resolveObject(text, sobjects = [], apiMode = "rest") {
  const lower = String(text || "").toLowerCase();
  const mode = apiMode === "tooling" ? "tooling" : "rest";

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
  // Tooling-style PascalCase API names when listed in describe
  const pascal = String(text || "").match(/\b([A-Z][A-Za-z0-9_]{2,})\b/);
  if (pascal && mode === "tooling") {
    const hit = (sobjects || []).find((o) => o.name === pascal[1]);
    if (hit) return { objectName: hit.name, via: "api-name", score: 98 };
  }

  // Tooling: prefer known aliases before org describe. Short words like "flow"
  // otherwise match Tooling entity Flow (versions) via name substring, even when
  // users usually want FlowDefinition (API names).
  if (mode === "tooling") {
    const toolingAlias = matchAlias(lower, TOOLING_ALIASES);
    if (toolingAlias) return toolingAlias;
  }

  // Match against org describe (labels + API names)
  const orgHit = matchOrgObject(text, sobjects);
  if (orgHit && orgHit.score >= 70) return orgHit;

  // Standard-mode aliases (longest keys first)
  if (mode === "rest") {
    const aliasKeys = Object.keys(OBJECT_ALIASES).sort((a, b) => b.length - a.length);
    for (const alias of aliasKeys) {
      if (!new RegExp(`\\b${alias.replace(/\s+/g, "\\s+")}\\b`, "i").test(lower)) continue;
      if ((alias === "product" || alias === "products") && hasProductQualifier(lower)) {
        if (orgHit) return orgHit;
        continue;
      }
      return { objectName: OBJECT_ALIASES[alias], via: "alias", score: 60 };
    }
  }

  if (orgHit) return orgHit;

  // 4) Guess custom object / custom metadata API name
  const guessed = guessCustomObjectApi(text);
  if (guessed) return { objectName: guessed, via: "guessed-api", score: 55 };

  return { objectName: null, via: null, score: 0 };
}

function guessCustomObjectApi(text) {
  const lower = String(text || "").toLowerCase();
  const wantsMdt = /\b(custom\s+metadata|metadata\s+type|cmdt|__mdt)\b/i.test(lower);
  let phrase = significantPhrase(text)
    .replace(/\b(custom\s+metadata|metadata|cmdt|type|types|records?)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  const words = phrase.split(/\s+/).filter(Boolean);
  if (words.length < 1) return null;
  if (words.length === 1 && !wantsMdt) return null;
  if (/^(accounts?|contacts?|leads?|opportunit(?:y|ies)|cases?|users?|tasks?)$/i.test(words.join(" "))) {
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
  const suffix = wantsMdt ? "__mdt" : "__c";
  const api = `${singular.join("_")}${suffix}`;
  if (!new RegExp(`^[A-Za-z][A-Za-z0-9_]*${suffix}$`).test(api)) return null;
  return api;
}

function hasProductQualifier(lower) {
  // "sap products", "custom products", "foo product" — not bare "products"
  return /\b([a-z0-9]+)\s+products?\b/i.test(lower);
}

function matchAlias(lower, aliases) {
  const aliasKeys = Object.keys(aliases || {}).sort((a, b) => b.length - a.length);
  for (const alias of aliasKeys) {
    if (!new RegExp(`\\b${alias.replace(/\s+/g, "\\s+")}\\b`, "i").test(lower)) continue;
    return { objectName: aliases[alias], via: "alias", score: 85 };
  }
  return null;
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

    // Prefer custom objects / CMDT when scores tie-ish
    if (score && /__c$/i.test(name)) score += 2;
    if (score && /__mdt$/i.test(name)) score += 3;
    if (score && /__mdt$/i.test(name) && /\b(metadata|cmdt)\b/i.test(text)) score += 8;

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
    .replace(/__(c|mdt|e|kav|x|b|p)$/i, "")
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
    if (!/__(c|mdt)$/i.test(obj.name) && !/__/i.test(obj.name)) continue;
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

function ruleBasedSoql(text, sobjects = [], resolved = null, apiMode = "rest") {
  const notes = [];
  const lower = text.toLowerCase();
  const mode = apiMode === "tooling" ? "tooling" : "rest";

  let limit = 100;
  const lim =
    lower.match(/\b(?:limit|top|first)\s+(\d+)\b/) ||
    lower.match(/\b(\d+)\s+records?\b/) ||
    lower.match(/\b(\d+)\s+(?:accounts?|contacts?|leads?|opportunit(?:y|ies)|cases?|users?|tasks?)\b/);
  if (lim) limit = Math.min(parseInt(lim[1], 10), 2000);

  const countOnly = /\b(count|how many|number of)\b/.test(lower);

  const resolvedObj = resolved || resolveObject(text, sobjects, mode);
  let objectName = resolvedObj.objectName;
  if (objectName) {
    if (resolvedObj.via === "org-describe") {
      notes.push(
        `Matched org object ${objectName}${resolvedObj.label ? ` (“${resolvedObj.label}”)` : ""} from your describe.`
      );
    } else if (resolvedObj.via === "api-name") {
      notes.push(`Used API name ${objectName} from your prompt.`);
    } else if (resolvedObj.via === "guessed-api") {
      notes.push(
        `Guessed ${objectName} from your wording. If wrong, use the exact API name or keep a Salesforce tab open.`
      );
    } else if (resolvedObj.via === "alias" && mode === "tooling") {
      notes.push(`Tooling object ${objectName}.`);
    }
  } else {
    objectName = mode === "tooling" ? "ApexClass" : "Account";
    notes.push(
      mode === "tooling"
        ? "Could not detect Tooling object; defaulted to ApexClass. Name the API (e.g. ApexClass, Flow)."
        : "Could not detect object; defaulted to Account. Use an API name (e.g. MyType__mdt) or open a Salesforce tab."
    );
  }

  const fields = ["Id"];
  if (/__mdt$/i.test(objectName)) fields.push("DeveloperName", "MasterLabel");
  else if (objectName === "ApexClass" || objectName === "ApexTrigger") fields.push("Name", "NamespacePrefix", "ApiVersion", "Status");
  else if (objectName === "FlowDefinition") {
    // Tooling FlowDefinition has the API name; Flow is version rows (no DeveloperName).
    fields.push("DeveloperName", "MasterLabel", "ActiveVersionId", "LatestVersionId");
    notes.push("FlowDefinition = one row per flow (API name). For versions, ask for “flow versions” (Flow).");
  } else if (objectName === "Flow") {
    fields.push("MasterLabel", "Status", "ProcessType", "VersionNumber", "ManageableState", "DefinitionId");
    notes.push("Tooling Flow = flow versions. API name lives on FlowDefinition (or Definition.DeveloperName).");
  } else if (objectName === "CustomObject") fields.push("DeveloperName", "NamespacePrefix", "ManageableState");
  else if (objectName === "CustomField") fields.push("DeveloperName", "TableEnumOrId", "ManageableState");
  else if (objectName === "LightningComponentBundle" || objectName === "AuraDefinitionBundle") {
    fields.push("DeveloperName", "NamespacePrefix", "ApiVersion");
  } else if (objectName === "User") fields.push("Name", "Username", "Email", "IsActive");
  else if (objectName === "Case") fields.push("CaseNumber", "Subject", "Status", "Priority");
  else if (objectName === "Opportunity") fields.push("Name", "StageName", "Amount", "CloseDate");
  else if (objectName === "Task") fields.push("Subject", "Status", "Priority", "ActivityDate");
  else fields.push("Name");

  if (/\bemail\b/.test(lower) && !fields.includes("Email")) fields.push("Email");
  if (/\bphone\b/.test(lower) && !fields.includes("Phone")) fields.push("Phone");
  if (/\bindustr/.test(lower) && objectName === "Account") fields.push("Industry");

  if (mode === "tooling") notes.push("Tooling API mode.");
  if (/__mdt$/i.test(objectName)) {
    notes.push("Custom metadata type — query via standard API; All data can update records via Tooling CustomMetadata.");
  }

  const wheres = [];

  const named = text.match(/(?:named|name(?:\s+is|\s+equals)?|called)\s+["']?([^"'\n,]+?)["']?(?:\s|$)/i);
  if (named) {
    const col = nameFilterColumn(objectName);
    wheres.push(`${col} LIKE '%${escapeSoql(named[1].trim())}%'`);
  }

  const email = text.match(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/i);
  if (email) wheres.push(`Email = '${escapeSoql(email[0])}'`);

  if (/\bactive\b/.test(lower) && objectName === "User") wheres.push("IsActive = true");
  if (/\binactive\b/.test(lower) && objectName === "User") wheres.push("IsActive = false");
  if (/\bactive\b/.test(lower) && objectName === "Flow") wheres.push("Status = 'Active'");
  if (/\b(draft|inactive)\b/.test(lower) && objectName === "Flow") wheres.push("Status = 'Draft'");
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

/** Best text column for “named / called …” filters by object. */
function nameFilterColumn(objectName) {
  if (/__mdt$/i.test(objectName)) return "DeveloperName";
  if (
    objectName === "FlowDefinition" ||
    objectName === "CustomObject" ||
    objectName === "CustomField" ||
    objectName === "LightningComponentBundle" ||
    objectName === "AuraDefinitionBundle" ||
    objectName === "ValidationRule" ||
    objectName === "FlexiPage" ||
    objectName === "PermissionSet" ||
    objectName === "Profile"
  ) {
    return "DeveloperName";
  }
  if (objectName === "Flow") return "MasterLabel";
  if (objectName === "ApexClass" || objectName === "ApexTrigger") return "Name";
  return "Name";
}
