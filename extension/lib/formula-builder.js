import { aiComplete, isAiReady, stripCodeFence } from "./ai.js";

/**
 * Build Salesforce formula from natural language / snippets.
 */
export async function buildFormula(request, { preferAi = true } = {}) {
  const text = String(request || "").trim();
  if (!text) throw new Error("Describe the formula you need.");

  if (preferAi && (await isAiReady())) {
    try {
      const raw = await aiComplete(
        `You write Salesforce formulas only. Reply with the formula expression only (no explanation). Use Salesforce formula functions (IF, ISPICKVAL, TEXT, DATEVALUE, etc.).`,
        text
      );
      return {
        formula: stripCodeFence(raw),
        source: "ai",
        notes: ["AI-generated. Validate compile in Setup → Object Manager → Fields."],
        helpers: FORMULA_HELPERS
      };
    } catch {
      /* rules fallback */
    }
  }

  return ruleBasedFormula(text);
}

function ruleBasedFormula(text) {
  const lower = text.toLowerCase();
  const notes = ["Offline formula templates. Configure AI for freestyle requests."];

  if (/blank|empty|null/.test(lower) && /email/.test(lower)) {
    return {
      formula: `OR(ISBLANK(Email), NOT(CONTAINS(Email, "@")))`,
      source: "rules",
      notes,
      helpers: FORMULA_HELPERS
    };
  }

  if (/age|years?\s+since|how old/.test(lower) && /birth|created|date/.test(lower)) {
    const field = /created/.test(lower) ? "CreatedDate" : /birth/.test(lower) ? "Birthdate" : "MyDate__c";
    return {
      formula: `FLOOR((TODAY() - DATEVALUE(${field})) / 365)`,
      source: "rules",
      notes: [...notes, `Replace ${field} with your date field API name if needed.`],
      helpers: FORMULA_HELPERS
    };
  }

  if (/full name|first.*last|concat.*name/.test(lower)) {
    return {
      formula: `TRIM(FirstName & " " & LastName)`,
      source: "rules",
      notes,
      helpers: FORMULA_HELPERS
    };
  }

  if (/priority|high.*case|escalate/.test(lower)) {
    return {
      formula: `IF(OR(ISPICKVAL(Priority, "High"), ISPICKVAL(Status, "Escalated")), true, false)`,
      source: "rules",
      notes,
      helpers: FORMULA_HELPERS
    };
  }

  if (/business\s*days|working\s*days/.test(lower)) {
    return {
      formula: `CASE(MOD(StartDate__c - DATE(1900, 1, 7), 7),\n  0, EndDate__c - StartDate__c - 2*FLOOR((EndDate__c - StartDate__c)/7),\n  1, EndDate__c - StartDate__c - 2*FLOOR((EndDate__c - StartDate__c)/7),\n  /* simplify with AI for full business-day logic */\n  EndDate__c - StartDate__c\n)`,
      source: "rules",
      notes: [...notes, "Business-day math is tricky — enable AI for a precise formula."],
      helpers: FORMULA_HELPERS
    };
  }

  if (/checkbox|true when|flag if/.test(lower)) {
    return {
      formula: `IF(/* condition */, true, false)`,
      source: "rules",
      notes: [...notes, "Replace the condition. Example: Amount > 10000"],
      helpers: FORMULA_HELPERS
    };
  }

  return {
    formula: `IF(ISBLANK(TextField__c), \"Default\", TextField__c)`,
    source: "rules",
    notes: [
      ...notes,
      "Generic template returned. Mention object/fields (e.g. \"Account: if Industry is Banking show…\")."
    ],
    helpers: FORMULA_HELPERS
  };
}

export const FORMULA_HELPERS = [
  { fn: "IF(cond, a, b)", desc: "Conditional" },
  { fn: "ISPICKVAL(field, \"Value\")", desc: "Picklist equals" },
  { fn: "ISBLANK(field)", desc: "Blank check" },
  { fn: "TEXT(field)", desc: "To text" },
  { fn: "VALUE(text)", desc: "Text to number" },
  { fn: "DATEVALUE(dt)", desc: "Datetime → Date" },
  { fn: "TODAY() / NOW()", desc: "Current date/time" },
  { fn: "CONTAINS(text, bits)", desc: "Substring" },
  { fn: "AND / OR / NOT", desc: "Logic" },
  { fn: "CASE(...)", desc: "Multi-branch" }
];
