/**
 * Deployment readiness checks — local checklist + optional org signals.
 */

export const DEPLOY_CHECKLIST = [
  { id: "tests", label: "Apex tests written for new/changed code (positive, negative, bulk)", severity: "critical" },
  { id: "coverage", label: "Org test coverage ≥ 75% (API/Tooling verified when session available)", severity: "critical" },
  { id: "fls", label: "CRUD/FLS enforced (USER_MODE / stripInaccessible)", severity: "critical" },
  { id: "sharing", label: "Sharing model reviewed (with sharing on entry points)", severity: "high" },
  { id: "bulk", label: "Bulk-safe (no SOQL/DML in loops); 200-record test done", severity: "critical" },
  { id: "named-cred", label: "Callouts use Named/External Credentials — no secrets in code", severity: "critical" },
  { id: "hardcoded", label: "No hard-coded Ids / env-specific URLs", severity: "high" },
  { id: "automation", label: "Flows/triggers recursion & order of execution reviewed", severity: "high" },
  { id: "permsets", label: "Permission Sets updated (not only Profile)", severity: "medium" },
  { id: "destructive", label: "Destructive changes documented; backups/export taken", severity: "high" },
  { id: "sandbox", label: "Validated in sandbox mirroring prod config", severity: "high" },
  { id: "feature-flags", label: "Custom Metadata / feature toggles ready for rollback", severity: "medium" },
  { id: "deps", label: "Package dependencies / API versions aligned", severity: "medium" },
  { id: "monitor", label: "Debug logs / monitoring plan for post-deploy", severity: "medium" }
];

/**
 * @param {object} orgSignals optional { coveragePercent, recentDeployFailures, isProduction, pendingComponents }
 */
export function assessDeploymentReadiness(checkedIds = [], orgSignals = {}) {
  const items = DEPLOY_CHECKLIST.map((c) => ({
    ...c,
    done: checkedIds.includes(c.id)
  }));

  const findings = [];
  const missingCritical = items.filter((i) => i.severity === "critical" && !i.done);
  const missingHigh = items.filter((i) => i.severity === "high" && !i.done);

  if (missingCritical.length) {
    findings.push({
      severity: "critical",
      title: "Critical checklist gaps",
      detail: missingCritical.map((i) => i.label).join("; ")
    });
  }
  if (missingHigh.length) {
    findings.push({
      severity: "high",
      title: "High checklist gaps",
      detail: missingHigh.map((i) => i.label).join("; ")
    });
  }

  if (typeof orgSignals.coveragePercent === "number") {
    if (orgSignals.coveragePercent < 75) {
      findings.push({
        severity: "critical",
        title: "Test coverage below 75%",
        detail: `Reported coverage: ${orgSignals.coveragePercent}%`
      });
    } else {
      findings.push({
        severity: "info",
        title: "Test coverage OK",
        detail: `Reported coverage: ${orgSignals.coveragePercent}%`
      });
    }
  }

  if (orgSignals.isProduction) {
    findings.push({
      severity: "high",
      title: "Production org",
      detail: "You are pointed at Production. Prefer deploying via pipeline from validated sandbox."
    });
  }

  if (orgSignals.recentDeployFailures > 0) {
    findings.push({
      severity: "medium",
      title: "Recent deploy failures",
      detail: `${orgSignals.recentDeployFailures} recent failed deploy request(s) detected.`
    });
  }

  const doneCount = items.filter((i) => i.done).length;
  const score = Math.round((doneCount / items.length) * 100);
  const blocked = findings.some((f) => f.severity === "critical");

  return {
    summary: `${blocked ? "NOT READY" : score >= 80 ? "READY (review remaining)" : "NEEDS WORK"} · checklist ${doneCount}/${items.length} (${score}%)`,
    score,
    blocked,
    items,
    findings
  };
}
