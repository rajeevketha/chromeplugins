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
  campaigns: "Campaign",
  products: "Product2",
  product: "Product2",
  contracts: "Contract",
  orders: "Order",
  quotes: "Quote",
  assets: "Asset",
  knowledge: "Knowledge__kav"
};

/**
 * Convert natural language to SOQL using rules, optionally enhanced by AI.
 * @returns {Promise<{ soql: string, source: 'rules'|'ai', notes: string[] }>}
 */
export async function generateSoql(naturalLanguage, { preferAi = true } = {}) {
  const text = naturalLanguage.trim();
  if (!text) throw new Error("Describe the query in plain English.");

  if (preferAi && (await isAiReady())) {
    try {
      const raw = await aiComplete(
        `You are a Salesforce SOQL expert. Reply with ONLY a valid SOQL query. Use standard objects/fields. Prefer selective filters. Never use SOSL. No markdown.`,
        text
      );
      const soql = stripCodeFence(raw);
      if (/^select\s+/i.test(soql)) {
        return { soql, source: "ai", notes: ["Generated with AI. Review before running in production."] };
      }
    } catch {
      // fall through to rules
    }
  }

  return ruleBasedSoql(text);
}

function ruleBasedSoql(text) {
  const notes = [];
  const lower = text.toLowerCase();

  let limit = 100;
  const lim =
    lower.match(/\b(?:limit|top|first)\s+(\d+)\b/) ||
    lower.match(/\b(\d+)\s+records?\b/) ||
    lower.match(/\b(\d+)\s+(?:accounts?|contacts?|leads?|opportunit(?:y|ies)|cases?|users?|tasks?)\b/);
  if (lim) limit = Math.min(parseInt(lim[1], 10), 2000);

  const countOnly = /\b(count|how many|number of)\b/.test(lower);

  let objectName = null;
  for (const [alias, api] of Object.entries(OBJECT_ALIASES)) {
    if (new RegExp(`\\b${alias}\\b`, "i").test(lower)) {
      objectName = api;
      break;
    }
  }
  if (!objectName) {
    const custom = lower.match(/\b([a-z][a-z0-9_]*__c)\b/);
    if (custom) objectName = text.match(new RegExp(custom[1], "i"))[0];
  }
  if (!objectName) {
    objectName = "Account";
    notes.push("Could not detect object; defaulted to Account. Name the object for better results.");
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
  if (/\bstage\b/.test(lower) && objectName === "Opportunity") {
    /* already have StageName */
  }

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
