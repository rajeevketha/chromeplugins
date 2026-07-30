/** Predict governor-limit risk from Apex (or operation descriptions). */

export function predictGovernorLimits(input) {
  const text = String(input || "");
  if (!text.trim()) {
    return { summary: "Paste Apex or describe the transaction.", risks: [], estimates: [], advice: [] };
  }

  const estimates = [];
  const advice = [];
  const risks = [];

  const soqlCount = countMatches(text, /\[SELECT\b/gi) + countMatches(text, /Database\.query\s*\(/gi);
  const dmlCount =
    countMatches(text, /\b(insert|update|delete|upsert|undelete)\s+/gi) +
    countMatches(text, /Database\.(insert|update|delete|upsert)/gi);
  const loops = countMatches(text, /\bfor\s*\(/gi) + countMatches(text, /\bwhile\s*\(/gi);
  const callouts = countMatches(text, /HttpRequest|HTTP\.callout|callout:/gi);
  const aggregates = countMatches(text, /\b(aggregate|COUNT\(|GROUP BY)/gi);

  const soqlInLoop = /for\s*\([^)]*\)[\s\S]{0,300}SELECT\b/i.test(text);
  const dmlInLoop = /for\s*\([^)]*\)[\s\S]{0,300}\b(insert|update|delete|upsert)\s+/i.test(text);

  // Heuristic multipliers for loops
  const assumedLoopSize = soqlInLoop || dmlInLoop ? 50 : 1;
  const predSoql = soqlInLoop ? Math.min(soqlCount * assumedLoopSize, 200) : soqlCount;
  const predDml = dmlInLoop ? Math.min(dmlCount * assumedLoopSize, 200) : dmlCount;
  const predCpu = Math.min(100 + loops * 20 + soqlCount * 15 + dmlCount * 10 + (soqlInLoop ? 5000 : 0), 20000);
  const predHeap = Math.min(1000 + soqlCount * 2000 + (aggregates ? 3000 : 0), 12000000);

  estimates.push(est("SOQL Queries", predSoql, 100));
  estimates.push(est("DML Statements", predDml, 150));
  estimates.push(est("Callouts", callouts, 100));
  estimates.push(est("CPU Time (ms, rough)", predCpu, 10000));
  estimates.push(est("Heap (bytes, rough)", predHeap, 6000000));

  if (soqlInLoop) {
    risks.push({ level: "critical", msg: "SOQL inside loop — likely to hit 100 SOQL queries when bulkified data arrives." });
    advice.push("Query once into Map<Id, SObject> before the loop.");
  }
  if (dmlInLoop) {
    risks.push({ level: "critical", msg: "DML inside loop — high risk under bulk triggers (200 records)." });
    advice.push("Accumulate List<SObject> and perform a single DML outside the loop.");
  }
  if (predSoql > 70) risks.push({ level: "high", msg: `Predicted ~${predSoql} SOQL queries (limit 100).` });
  if (predDml > 100) risks.push({ level: "high", msg: `Predicted ~${predDml} DML statements (limit 150).` });
  if (callouts > 50) risks.push({ level: "high", msg: "Many callouts — consider bulk APIs or Queueable chaining." });
  if (callouts && dmlCount) {
    risks.push({ level: "medium", msg: "Callouts + DML in same class — watch uncommitted work pending errors." });
    advice.push("Perform callouts before DML or separate via Queueable.");
  }
  if (/\b@seealldata\b/i.test(text)) {
    risks.push({ level: "medium", msg: "SeeAllData tests can hide bulk/governor issues until production volumes." });
  }

  if (!risks.length) {
    risks.push({ level: "low", msg: "No critical static patterns detected. Still validate with a 200-record test." });
  }

  advice.push("Run a bulk test (200 records) and inspect LIMIT_USAGE_FOR_NS in the debug log.");
  advice.push("Use Queueable/Batch for heavy operations; keep triggers thin.");

  const worst = risks.some((r) => r.level === "critical")
    ? "critical"
    : risks.some((r) => r.level === "high")
      ? "high"
      : "moderate";

  return {
    summary: `Predicted risk: ${worst} · ~${predSoql} SOQL, ~${predDml} DML, ~${predCpu}ms CPU (heuristic)`,
    risks,
    estimates,
    advice: [...new Set(advice)]
  };
}

function countMatches(text, re) {
  return (text.match(re) || []).length;
}

function est(name, used, max) {
  const pct = Math.min(100, Math.round((used / max) * 100));
  return {
    name,
    used,
    max,
    pct,
    risk: pct >= 90 ? "critical" : pct >= 70 ? "high" : pct >= 40 ? "medium" : "low"
  };
}
