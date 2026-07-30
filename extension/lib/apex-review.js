import { aiComplete, isAiReady } from "./ai.js";

/**
 * Static Apex review against Salesforce security & coding standards.
 * @returns {Promise<{ findings: Array, score: number, summary: string, ai?: string }>}
 */
export async function reviewApex(source, { preferAi = true } = {}) {
  const code = String(source || "");
  if (!code.trim()) throw new Error("Paste Apex code to review.");

  const findings = [];

  const add = (severity, rule, detail, lineHint) => {
    findings.push({ severity, rule, detail, lineHint });
  };

  if (/\bwithout\s+sharing\b/i.test(code)) {
    add("high", "Sharing", "Class uses without sharing. Document justification or switch to with sharing.", findLine(code, /without\s+sharing/i));
  } else if (!/\bwith\s+sharing\b/i.test(code) && /\b(class)\s+\w+/i.test(code)) {
    add("medium", "Sharing", "No explicit sharing declared. Prefer with sharing on entry-point classes.", null);
  }

  if (/Database\.query\s*\(\s*['"][^'"]*\+/i.test(code) || /\[*\s*SELECT[^\]]*\'\s*\+/i.test(code) || /'(\s*\+|,\s*\w+\s*\+)/i.test(code) && /SELECT/i.test(code)) {
    add("critical", "SOQL Injection", "Possible dynamic SOQL via string concatenation. Use bind variables or allowlists.", findLine(code, /Database\.query|SELECT/i));
  }

  if (/for\s*\([^)]+\)\s*\{[^}]*\[?\s*SELECT\b/is.test(code) || hasSoqlInLoop(code)) {
    add("critical", "Bulkification", "SOQL appears inside a loop. Query before the loop into a Map.", findLine(code, /for\s*\(/i));
  }

  if (hasDmlInLoop(code)) {
    add("critical", "Bulkification", "DML appears inside a loop. Collect records and perform one DML.", findLine(code, /insert|update|delete|upsert/i));
  }

  if (!/USER_MODE|Security\.stripInaccessible|isAccessible\(|isCreateable\(|isUpdateable\(|WITH SECURITY_ENFORCED/i.test(code)) {
    if (/\b(insert|update|delete|upsert|undelete)\b/i.test(code) || /\[SELECT\b/i.test(code)) {
      add("high", "CRUD/FLS", "No USER_MODE / stripInaccessible / describe checks detected. Enforce CRUD/FLS.", null);
    }
  }

  if (/System\.debug\s*\(/i.test(code) && /(password|secret|token|sid|session)/i.test(code)) {
    add("critical", "Secrets", "Debug may log sensitive values. Remove or redact.", findLine(code, /System\.debug/i));
  }

  if (/SeeAllData\s*=\s*true/i.test(code)) {
    add("high", "Tests", "SeeAllData=true detected. Prefer test data factories.", findLine(code, /SeeAllData/i));
  }

  if (/\bHttp\b|\bHttpRequest\b/i.test(code) && !/NamedCredential|callout:/i.test(code)) {
    add("medium", "Callouts", "HTTP callout without Named Credential pattern. Prefer Named/External Credentials.", findLine(code, /HttpRequest|Http\b/i));
  }

  if (/@future/i.test(code) && /callout\s*=\s*true/i.test(code) && /\b(insert|update|delete)\b/i.test(code)) {
    add("medium", "Async", "Future with callout+DML — ensure ordering avoids uncommitted-work issues.", null);
  }

  if (/\beval\b/i.test(code)) {
    add("critical", "Unsafe", "Avoid dynamic evaluation patterns.", null);
  }

  // Hard-coded IDs
  if (/['"][a-zA-Z0-9]{15,18}['"]/.test(code)) {
    add("medium", "Hard-coded IDs", "Hard-coded Salesforce Ids found. Prefer Custom Metadata / Custom Labels.", findLine(code, /['"][a-zA-Z0-9]{15,18}['"]/));
  }

  if (!findings.length) {
    add("info", "Clean scan", "No major static issues detected. Still run tests and peer review.", null);
  }

  const score = scoreFindings(findings);
  const summary = `Score ${score}/100 · ${findings.filter((f) => f.severity === "critical" || f.severity === "high").length} high-priority finding(s)`;

  let ai = null;
  if (preferAi && (await isAiReady())) {
    try {
      ai = await aiComplete(
        "You are a Salesforce Apex reviewer enforcing CRUD/FLS, sharing, bulkification, and secure coding. Give concise bullet findings and fixes.",
        code.slice(0, 12000)
      );
    } catch (e) {
      ai = `(AI review skipped: ${e.message})`;
    }
  }

  return { findings, score, summary, ai };
}

function hasSoqlInLoop(code) {
  const loops = code.split(/for\s*\(/i);
  if (loops.length < 2) return false;
  return loops.slice(1).some((chunk) => /SELECT\b/i.test(chunk.slice(0, 400)));
}

function hasDmlInLoop(code) {
  const loops = code.split(/for\s*\(/i);
  if (loops.length < 2) return false;
  return loops.slice(1).some((chunk) => /\b(insert|update|delete|upsert)\s+/i.test(chunk.slice(0, 400)));
}

function findLine(code, re) {
  const lines = code.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    if (re.test(lines[i])) return i + 1;
  }
  return null;
}

function scoreFindings(findings) {
  let score = 100;
  for (const f of findings) {
    if (f.severity === "critical") score -= 25;
    else if (f.severity === "high") score -= 15;
    else if (f.severity === "medium") score -= 8;
    else if (f.severity === "info") score -= 0;
  }
  return Math.max(0, score);
}
