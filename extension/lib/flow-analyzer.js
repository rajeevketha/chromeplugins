/**
 * Analyze Flow metadata JSON (Tooling API Flow / FlowDefinition) for common risks.
 * Accepts either API records or pasted Flow JSON/XML-ish text.
 */

export function analyzeFlow(input) {
  const raw = input;
  if (!raw || (typeof raw === "string" && !raw.trim())) {
    return { summary: "Load flows from the org or paste Flow JSON.", findings: [], stats: {} };
  }

  let flows = [];
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      flows = normalizeFlows(parsed);
    } catch {
      return analyzeFlowText(raw);
    }
  } else {
    flows = normalizeFlows(raw);
  }

  const findings = [];
  const stats = { flowCount: flows.length, active: 0, draft: 0 };

  for (const flow of flows) {
    const name = flow.ApiName || flow.DeveloperName || flow.FullName || flow.MasterLabel || flow.Id || "Flow";
    const status = flow.Status || flow.ManageableState || "";
    if (/Active/i.test(status)) stats.active += 1;
    else stats.draft += 1;

    const blob = JSON.stringify(flow);
    const label = name;

    if (/recordCreates|recordUpdates|recordDeletes|actionCalls/i.test(blob) && /loopRegion|loops/i.test(blob)) {
      findings.push({
        severity: "high",
        flow: label,
        rule: "DML in loop risk",
        detail: "Flow contains loops and record DML/actions — verify DML is not inside the loop."
      });
    }

    if (!/faultConnector|faultMessage/i.test(blob) && /recordCreates|recordUpdates|actionCalls/i.test(blob)) {
      findings.push({
        severity: "medium",
        flow: label,
        rule: "Missing fault path",
        detail: "DML/action elements without obvious fault connectors."
      });
    }

    if (/getRecords/i.test(blob) && /loopRegion|loops/i.test(blob)) {
      findings.push({
        severity: "high",
        flow: label,
        rule: "Get Records in/near loop",
        detail: "Get Records combined with loops can explode SOQL usage. Prefer collection filters."
      });
    }

    if (/AutomatedProcess|Workflow|ActionEmail/i.test(blob) && /Active/i.test(status)) {
      findings.push({
        severity: "info",
        flow: label,
        rule: "Active automation",
        detail: `Status: ${status}`
      });
    }

    if (/InterviewLabel|isTemplate\":true/i.test(blob)) {
      /* skip noise */
    }

    // Trigger order / before-save hints
    if (/RecordBeforeSave|RecordAfterSave|RecordBeforeDelete/i.test(blob)) {
      const when = blob.match(/Record(?:Before|After)(?:Save|Delete)/);
      findings.push({
        severity: "info",
        flow: label,
        rule: "Trigger type",
        detail: when ? `Detected ${when[0]}` : "Record-triggered flow"
      });
    }

    if (/SOBJECT_ROW_ACTION|UpdateRecords/i.test(blob) && /Same.?Record|\$Record/i.test(blob)) {
      findings.push({
        severity: "medium",
        flow: label,
        rule: "Same-record updates",
        detail: "Prefer before-save Flow for same-record field updates to avoid recursion/extra DML."
      });
    }
  }

  if (!findings.length && flows.length) {
    findings.push({
      severity: "info",
      flow: "—",
      rule: "No major patterns",
      detail: "Static scan found no high-risk patterns. Still review in Flow Builder."
    });
  }

  const high = findings.filter((f) => f.severity === "high").length;
  return {
    summary: `${stats.flowCount} flow(s) · ${stats.active} active · ${high} high finding(s)`,
    findings,
    stats
  };
}

function normalizeFlows(parsed) {
  if (Array.isArray(parsed)) return parsed;
  if (parsed?.records) return parsed.records;
  if (parsed?.Metadata || parsed?.ApiName || parsed?.DeveloperName) return [parsed];
  return [parsed];
}

function analyzeFlowText(text) {
  const findings = [];
  if (/<loops>|<loop /i.test(text) && /<recordUpdates>|<recordCreates>|<actionCalls>/i.test(text)) {
    findings.push({
      severity: "high",
      flow: "pasted",
      rule: "DML in loop risk",
      detail: "XML contains loops and DML/action elements."
    });
  }
  if (/<recordUpdates>|<recordCreates>/i.test(text) && !/<faultConnector>/i.test(text)) {
    findings.push({
      severity: "medium",
      flow: "pasted",
      rule: "Missing fault path",
      detail: "No faultConnector found in pasted metadata."
    });
  }
  return {
    summary: `${findings.length} finding(s) from pasted Flow text`,
    findings,
    stats: { flowCount: 1 }
  };
}
