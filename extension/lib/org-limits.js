/**
 * Format Salesforce REST /limits payload for the Governor view.
 */

/** High-signal org limits for day-to-day development. */
export const ORG_LIMIT_KEYS = [
  "DailyApiRequests",
  "DailyAsyncApexExecutions",
  "DailyBulkApiRequests",
  "DailyBulkApiBatches",
  "DailyDurableStreamingApiEvents",
  "DailyGenericStreamingApiEvents",
  "DailyWorkflowEmails",
  "SingleEmail",
  "MassEmail",
  "DataStorageMB",
  "FileStorageMB",
  "PermissionSets",
  "HourlyODataCallout",
  "HourlyPublishedPlatformEvents",
  "DailyAnalyticsDataflowJobExecutions",
  "Package2VersionCreates",
  "DailyEinsteinDiscoveryStoryCreation"
];

export function summarizeOrgLimits(limitsPayload) {
  if (!limitsPayload || typeof limitsPayload !== "object") {
    return { summary: "No org limits returned.", rows: [] };
  }

  const rows = [];
  const preferred = ORG_LIMIT_KEYS.filter((k) => limitsPayload[k]);
  const extras = Object.keys(limitsPayload)
    .filter((k) => !preferred.includes(k))
    .sort();
  const ordered = [...preferred, ...extras];

  for (const key of ordered) {
    const item = limitsPayload[key];
    if (!item || typeof item !== "object") continue;
    const max = Number(item.Max);
    const remaining = Number(item.Remaining);
    if (!Number.isFinite(max)) continue;
    const used = Number.isFinite(remaining) ? Math.max(0, max - remaining) : null;
    const pct = max > 0 && used != null ? Math.round((used / max) * 1000) / 10 : null;
    let risk = "low";
    if (pct != null) {
      if (pct >= 90) risk = "critical";
      else if (pct >= 75) risk = "high";
      else if (pct >= 50) risk = "medium";
    }
    rows.push({
      key,
      label: humanizeLimitKey(key),
      max,
      remaining: Number.isFinite(remaining) ? remaining : null,
      used,
      pct,
      risk
    });
  }

  const hot = rows.filter((r) => r.risk === "critical" || r.risk === "high");
  const summary = hot.length
    ? `${hot.length} org limit(s) at ≥75% usage`
    : `${rows.length} org limits loaded · none critically high`;

  return { summary, rows, fetchedAt: new Date().toISOString() };
}

function humanizeLimitKey(key) {
  return String(key)
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/MB$/i, " (MB)")
    .replace(/^Daily /i, "Daily ")
    .replace(/^Hourly /i, "Hourly ");
}
