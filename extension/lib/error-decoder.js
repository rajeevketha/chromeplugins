/** Decode common Salesforce errors into plain-language guidance. */

const CATALOG = [
  {
    id: "UNABLE_TO_LOCK_ROW",
    pattern: /UNABLE_TO_LOCK_ROW|unable to obtain exclusive access|record currently unavailable/i,
    title: "Row lock contention",
    meaning: "Another transaction held a lock on the same record(s).",
    fixes: [
      "Reduce simultaneous updates on the same parent (Account, Opportunity, etc.).",
      "Move non-critical work async (Queueable/Batch) and retry on lock errors.",
      "Avoid long transactions that lock records early and update late.",
      "Check for recursive automation fighting over the same records."
    ]
  },
  {
    id: "FIELD_CUSTOM_VALIDATION_EXCEPTION",
    pattern: /FIELD_CUSTOM_VALIDATION_EXCEPTION|validation rule/i,
    title: "Validation rule blocked the save",
    meaning: "A validation rule (or similar) rejected the DML.",
    fixes: [
      "Read the rule message in the error — it usually names the business condition.",
      "Reproduce with the same field values in the UI.",
      "For data loads, fix source data or temporarily relax the rule in a sandbox only."
    ]
  },
  {
    id: "REQUIRED_FIELD_MISSING",
    pattern: /REQUIRED_FIELD_MISSING|Required fields are missing/i,
    title: "Required field missing",
    meaning: "A required field was null on insert/update.",
    fixes: [
      "Identify the field API name from the error details.",
      "Ensure before-save Flow/Apex populates it for all entry paths.",
      "Check record types / page layouts vs API-required fields."
    ]
  },
  {
    id: "STRING_TOO_LONG",
    pattern: /STRING_TOO_LONG|data value too large/i,
    title: "Field length exceeded",
    meaning: "A string value exceeds the field’s maximum length.",
    fixes: ["Truncate or split the value.", "Increase field length if business-approved.", "Validate lengths before DML in integrations."]
  },
  {
    id: "FIELD_INTEGRITY_EXCEPTION",
    pattern: /FIELD_INTEGRITY_EXCEPTION/i,
    title: "Field integrity exception",
    meaning: "Value is incompatible with field type, dependent picklist, or relationship.",
    fixes: [
      "Check picklist values / record type availability.",
      "Verify lookup IDs point to the correct object.",
      "For currency/number fields, ensure format and scale."
    ]
  },
  {
    id: "DUPLICATE_VALUE",
    pattern: /DUPLICATE_VALUE|duplicate value found/i,
    title: "Duplicate value",
    meaning: "Unique field or duplicate rule conflict.",
    fixes: ["Find the existing record with the same unique value.", "Adjust duplicate rules / matching rules if false positive."]
  },
  {
    id: "INSUFFICIENT_ACCESS",
    pattern: /INSUFFICIENT_ACCESS|insufficient access rights|INSUFFICIENT_ACCESS_OR_READONLY|ENTITY_IS_DELETED/i,
    title: "Access / sharing / deleted record",
    meaning: "User lacks CRUD/FLS/sharing, or the record is deleted/locked.",
    fixes: [
      "Verify object CRUD, field FLS, and sharing for the running user.",
      "Check if the record was deleted or merged.",
      "Prefer USER_MODE Apex so permission issues surface clearly."
    ]
  },
  {
    id: "CANNOT_INSERT_UPDATE_ACTIVATE_ENTITY",
    pattern: /CANNOT_INSERT_UPDATE_ACTIVATE_ENTITY|SYSTEM_ERROR/i,
    title: "Trigger / automation failure",
    meaning: "A trigger, Flow, or other automation threw while saving.",
    fixes: [
      "Open the Debug Log for the user and find the first exception.",
      "Look for NullPointerException, query exceptions, or callout-in-trigger issues.",
      "Disable automations temporarily in sandbox to isolate the culprit."
    ]
  },
  {
    id: "LIMIT_EXCEEDED",
    pattern: /Too many SOQL queries|Too many DML statements|Apex CPU time|heap size|LIMIT_EXCEEDED|Request runtime exceeded/i,
    title: "Governor limit exceeded",
    meaning: "The transaction hit a Salesforce governor limit.",
    fixes: [
      "Bulkify: no SOQL/DML in loops.",
      "Move heavy work to Queueable/Batch/Future.",
      "Use OrgKit’s Debug Log Analyzer and Governor Limit Predictor."
    ]
  },
  {
    id: "INVALID_FIELD",
    pattern: /No such column|INVALID_FIELD|Didn't understand relationship/i,
    title: "Invalid field / relationship in SOQL",
    meaning: "SOQL references a field or relationship that does not exist or isn’t accessible.",
    fixes: [
      "Confirm API names in Object Manager.",
      "Check FLS for the running user.",
      "Use __r for parent relationships and correct child relationship names."
    ]
  },
  {
    id: "INVALID_SESSION",
    pattern: /INVALID_SESSION_ID|Session expired|invalid session/i,
    title: "Session expired",
    meaning: "Auth session is invalid or timed out.",
    fixes: ["Re-login to the org.", "Refresh the Salesforce tab and retry."]
  },
  {
    id: "MIXED_DML",
    pattern: /MIXED_DML_OPERATION/i,
    title: "Mixed DML",
    meaning: "Setup and non-setup objects were updated in the same transaction incorrectly.",
    fixes: ["Split setup object DML into a future/queueable.", "Avoid updating User/Group with Account/Contact in one go."]
  },
  {
    id: "CALLLOUT_NOT_ALLOWED",
    pattern: /You have uncommitted work pending|callout.*not allowed/i,
    title: "Callout after DML",
    meaning: "HTTP callout was attempted after uncommitted DML in the same transaction.",
    fixes: ["Do callouts before DML, or use Queueable to separate transactions."]
  }
];

/**
 * @returns {{ matches: Array, summary: string, tips: string[] }}
 */
export function decodeError(raw) {
  const text = String(raw || "").trim();
  if (!text) {
    return { matches: [], summary: "Paste a Salesforce error message.", tips: [] };
  }

  const matches = CATALOG.filter((c) => c.pattern.test(text)).map((c) => ({
    id: c.id,
    title: c.title,
    meaning: c.meaning,
    fixes: c.fixes
  }));

  const tipExtras = [];
  const field = text.match(/\[([A-Za-z0-9_]+(?:__c)?)\]/);
  if (field) tipExtras.push(`Field mentioned: ${field[1]}`);
  const id = text.match(/\b([a-zA-Z0-9]{15}|[a-zA-Z0-9]{18})\b/);
  if (id) tipExtras.push(`Record Id mentioned: ${id[1]}`);

  if (!matches.length) {
    return {
      matches: [],
      summary: "No catalog match. Check Debug Logs for the root exception stack.",
      tips: [
        ...tipExtras,
        "Search Setup → Debug Logs for the running user.",
        "If AI is configured, retry with AI assist for a freestyle decode."
      ]
    };
  }

  return {
    matches,
    summary: `Matched ${matches.length} pattern(s): ${matches.map((m) => m.id).join(", ")}`,
    tips: tipExtras
  };
}

export async function decodeErrorWithAi(raw, aiCompleteFn) {
  const base = decodeError(raw);
  if (!aiCompleteFn) return { ...base, ai: null };
  try {
    const ai = await aiCompleteFn(
      "You are a Salesforce expert. Explain the error briefly, likely causes, and concrete fixes. Do not ask for credentials.",
      raw
    );
    return { ...base, ai };
  } catch (e) {
    return { ...base, ai: null, aiError: e.message };
  }
}
