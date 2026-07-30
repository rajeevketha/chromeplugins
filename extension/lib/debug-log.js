/** Parse Salesforce debug logs for limits, exceptions, and expensive operations. */

const LIMIT_PATTERNS = [
  { key: "SOQL Queries", re: /Number of SOQL queries:\s*(\d+)\s+out of\s+(\d+)/i },
  { key: "SOQL Rows", re: /Number of query rows:\s*(\d+)\s+out of\s+(\d+)/i },
  { key: "DML Statements", re: /Number of DML statements:\s*(\d+)\s+out of\s+(\d+)/i },
  { key: "DML Rows", re: /Number of DML rows:\s*(\d+)\s+out of\s+(\d+)/i },
  { key: "CPU Time", re: /Maximum CPU time:\s*(\d+)\s+out of\s+(\d+)/i },
  { key: "Heap Size", re: /Maximum heap size:\s*(\d+)\s+out of\s+(\d+)/i },
  { key: "Callouts", re: /Number of callouts:\s*(\d+)\s+out of\s+(\d+)/i },
  { key: "Future Calls", re: /Number of future calls:\s*(\d+)\s+out of\s+(\d+)/i },
  { key: "Queueable Jobs", re: /Number of queueable jobs added to the queue:\s*(\d+)\s+out of\s+(\d+)/i },
  { key: "SOSL Queries", re: /Number of SOSL queries:\s*(\d+)\s+out of\s+(\d+)/i }
];

export function analyzeDebugLog(raw) {
  const text = String(raw || "");
  if (!text.trim()) {
    return { summary: "Paste a debug log.", limits: [], exceptions: [], soql: [], dml: [], warnings: [] };
  }

  const limits = [];
  for (const p of LIMIT_PATTERNS) {
    const matches = [...text.matchAll(new RegExp(p.re.source, "gi"))];
    if (!matches.length) continue;
    const last = matches[matches.length - 1];
    const used = parseInt(last[1], 10);
    const max = parseInt(last[2], 10);
    const pct = max ? Math.round((used / max) * 100) : 0;
    limits.push({
      key: p.key,
      used,
      max,
      pct,
      risk: pct >= 90 ? "critical" : pct >= 70 ? "high" : pct >= 40 ? "medium" : "low"
    });
  }

  const exceptions = [];
  const exRe = /^(?:Exception|FATAL_ERROR|[A-Za-z.]*Exception):\s*(.+)$/gm;
  let m;
  while ((m = exRe.exec(text)) !== null) {
    exceptions.push(m[0].trim());
  }
  const caused = text.match(/Caused by: .+/g);
  if (caused) exceptions.push(...caused);

  const soql = [];
  const soqlRe = /SOQL_EXECUTE_(?:BEGIN|EXPLAIN).*?(SELECT\s.+?)(?:\||$)/gi;
  while ((m = soqlRe.exec(text)) !== null) {
    soql.push(cleanOp(m[1]));
  }
  // Fallback: lines containing SELECT in CODE_UNIT / USER_DEBUG less reliable
  if (!soql.length) {
    const sel = text.match(/\bSELECT\s+[\s\S]{0,120}?FROM\s+\w+/gi) || [];
    soql.push(...sel.slice(0, 30).map(cleanOp));
  }

  const dml = [];
  const dmlRe = /DML_BEGIN\|[^|]*\|(Insert|Update|Delete|Upsert|Undelete|Merge)\|([A-Za-z0-9_]+)/gi;
  while ((m = dmlRe.exec(text)) !== null) {
    dml.push(`${m[1]} ${m[2]}`);
  }

  const warnings = [];
  if (/SOQL_EXECUTE_BEGIN/i.test(text) && /for\s*\(/i.test(text)) {
    warnings.push("Log suggests iterative code paths — verify no SOQL/DML in loops.");
  }
  limits
    .filter((l) => l.risk === "critical" || l.risk === "high")
    .forEach((l) => warnings.push(`${l.key} at ${l.pct}% (${l.used}/${l.max}).`));

  if (/VALIDATION_RULE|FIELD_CUSTOM_VALIDATION/i.test(text)) {
    warnings.push("Validation rule activity detected in the log.");
  }
  if (/FLOW_ELEMENT_ERROR|FLOW_CREATE_INTERVIEW_ENDERROR/i.test(text)) {
    warnings.push("Flow errors present — open Flow interviews / fault paths.");
  }

  const worst = limits.slice().sort((a, b) => b.pct - a.pct)[0];
  const summary = [
    exceptions.length ? `${exceptions.length} exception line(s)` : "No exceptions parsed",
    worst ? `Highest limit: ${worst.key} ${worst.pct}%` : "No limit usage lines found",
    `${uniq(soql).length} SOQL snippet(s), ${uniq(dml).length} DML event(s)`
  ].join(" · ");

  return {
    summary,
    limits: limits.sort((a, b) => b.pct - a.pct),
    exceptions: uniq(exceptions).slice(0, 20),
    soql: uniq(soql).slice(0, 40),
    dml: uniq(dml).slice(0, 40),
    warnings
  };
}

function cleanOp(s) {
  return String(s).replace(/\s+/g, " ").trim().slice(0, 240);
}

function uniq(arr) {
  return [...new Set(arr.filter(Boolean))];
}
