/**
 * Anonymous Apex helpers — result formatting + debug-log USER_DEBUG extraction.
 */

export const APEX_SNIPPETS = [
  {
    id: "hello",
    label: "Hello debug",
    body: `System.debug('SF Dev Toolkit OK');`
  },
  {
    id: "query-json",
    label: "Query → JSON debug",
    body: `List<Account> rows = [SELECT Id, Name FROM Account LIMIT 5];
System.debug(JSON.serializePretty(rows));`
  },
  {
    id: "user-info",
    label: "Running user",
    body: `System.debug('UserId=' + UserInfo.getUserId());
System.debug('OrgId=' + UserInfo.getOrganizationId());
System.debug('ProfileId=' + UserInfo.getProfileId());`
  }
];

export function summarizeExecuteAnonymous(result) {
  if (!result || typeof result !== "object") {
    return { ok: false, summary: "No result from executeAnonymous.", detail: "" };
  }
  if (result.compiled === false) {
    return {
      ok: false,
      summary: `Compile error${result.line > 0 ? ` at line ${result.line}` : ""}`,
      detail: result.compileProblem || "Unknown compile problem."
    };
  }
  if (result.success === false) {
    return {
      ok: false,
      summary: `Runtime exception${result.line > 0 ? ` at line ${result.line}` : ""}`,
      detail: [result.exceptionMessage, result.exceptionStackTrace].filter(Boolean).join("\n")
    };
  }
  return {
    ok: true,
    summary: "Executed successfully.",
    detail: "Use Fetch debug log to pull USER_DEBUG output (requires an active Trace Flag)."
  };
}

/** Extract readable lines from an Apex debug log body. */
export function extractDebugOutput(logBody) {
  const text = String(logBody || "");
  const lines = text.split(/\r?\n/);
  const out = [];
  for (const line of lines) {
    if (
      line.includes("|USER_DEBUG|") ||
      line.includes("|EXCEPTION_THROWN|") ||
      line.includes("|FATAL_ERROR|") ||
      line.includes("|VALIDATION_ERROR|")
    ) {
      const parts = line.split("|");
      const level = parts[1] || "";
      const msg = parts.length >= 5 ? parts.slice(4).join("|") : line;
      out.push({ level, message: msg.trim(), raw: line });
    }
  }
  return {
    debugCount: out.filter((l) => l.level === "USER_DEBUG").length,
    lines: out,
    preview: out.map((l) => `[${l.level}] ${l.message}`).join("\n")
  };
}
