/**
 * Package.xml builder — multi-select metadata members → package.xml
 */

export const PACKAGE_TYPES = [
  {
    name: "ApexClass",
    label: "Apex Class",
    tooling: true,
    listQuery:
      "SELECT Id, Name, NamespacePrefix, LastModifiedDate FROM ApexClass ORDER BY LastModifiedDate DESC LIMIT 100",
    memberName: (r) => (r.NamespacePrefix ? `${r.NamespacePrefix}__${r.Name}` : r.Name)
  },
  {
    name: "ApexTrigger",
    label: "Apex Trigger",
    tooling: true,
    listQuery:
      "SELECT Id, Name, NamespacePrefix, LastModifiedDate FROM ApexTrigger ORDER BY LastModifiedDate DESC LIMIT 100",
    memberName: (r) => (r.NamespacePrefix ? `${r.NamespacePrefix}__${r.Name}` : r.Name)
  },
  {
    name: "LightningComponentBundle",
    label: "LWC",
    tooling: true,
    listQuery:
      "SELECT Id, DeveloperName, NamespacePrefix, LastModifiedDate FROM LightningComponentBundle ORDER BY LastModifiedDate DESC LIMIT 100",
    memberName: (r) =>
      r.NamespacePrefix ? `${r.NamespacePrefix}__${r.DeveloperName}` : r.DeveloperName
  },
  {
    name: "AuraDefinitionBundle",
    label: "Aura Bundle",
    tooling: true,
    listQuery:
      "SELECT Id, DeveloperName, NamespacePrefix, LastModifiedDate FROM AuraDefinitionBundle ORDER BY LastModifiedDate DESC LIMIT 100",
    memberName: (r) =>
      r.NamespacePrefix ? `${r.NamespacePrefix}__${r.DeveloperName}` : r.DeveloperName
  },
  {
    name: "CustomObject",
    label: "Custom Object",
    tooling: true,
    listQuery:
      "SELECT Id, DeveloperName, NamespacePrefix, LastModifiedDate FROM CustomObject ORDER BY LastModifiedDate DESC LIMIT 100",
    memberName: (r) => {
      const ns = r.NamespacePrefix ? `${r.NamespacePrefix}__` : "";
      const n = r.DeveloperName || "";
      if (n.includes("__")) return `${ns}${n}`;
      // Standard objects sometimes appear; custom usually need __c
      return `${ns}${n}__c`;
    }
  },
  {
    name: "Flow",
    label: "Flow",
    tooling: false,
    listQuery:
      "SELECT ApiName, Label, LastModifiedDate FROM FlowDefinitionView ORDER BY LastModifiedDate DESC LIMIT 100",
    memberName: (r) => r.ApiName,
    fallback: {
      tooling: true,
      listQuery:
        "SELECT Id, DeveloperName, NamespacePrefix, LastModifiedDate FROM FlowDefinition ORDER BY LastModifiedDate DESC LIMIT 100",
      memberName: (r) =>
        r.NamespacePrefix ? `${r.NamespacePrefix}__${r.DeveloperName}` : r.DeveloperName
    }
  },
  {
    name: "Layout",
    label: "Layout",
    tooling: true,
    listQuery:
      "SELECT Id, Name, NamespacePrefix, TableEnumOrId, LastModifiedDate FROM Layout ORDER BY LastModifiedDate DESC LIMIT 100",
    memberName: (r) => {
      // Layout members are usually Object-LayoutName; TableEnumOrId may be key prefix / id
      const ns = r.NamespacePrefix ? `${r.NamespacePrefix}__` : "";
      return `${ns}${r.Name}`;
    }
  },
  {
    name: "PermissionSet",
    label: "Permission Set",
    tooling: false,
    listQuery:
      "SELECT Id, Name, NamespacePrefix, LastModifiedDate FROM PermissionSet WHERE IsOwnedByProfile = false ORDER BY LastModifiedDate DESC LIMIT 100",
    memberName: (r) => (r.NamespacePrefix ? `${r.NamespacePrefix}__${r.Name}` : r.Name)
  },
  {
    name: "Profile",
    label: "Profile",
    tooling: false,
    listQuery: "SELECT Id, Name, LastModifiedDate FROM Profile ORDER BY Name ASC LIMIT 100",
    memberName: (r) => r.Name
  },
  {
    name: "StaticResource",
    label: "Static Resource",
    tooling: false,
    listQuery:
      "SELECT Id, Name, NamespacePrefix, LastModifiedDate FROM StaticResource ORDER BY LastModifiedDate DESC LIMIT 100",
    memberName: (r) => (r.NamespacePrefix ? `${r.NamespacePrefix}__${r.Name}` : r.Name)
  },
  {
    name: "CustomTab",
    label: "Custom Tab",
    tooling: true,
    listQuery:
      "SELECT Id, DeveloperName, NamespacePrefix, LastModifiedDate FROM CustomTab ORDER BY LastModifiedDate DESC LIMIT 100",
    memberName: (r) =>
      r.NamespacePrefix ? `${r.NamespacePrefix}__${r.DeveloperName}` : r.DeveloperName
  },
  {
    name: "RemoteSiteSetting",
    label: "Remote Site Setting",
    tooling: true,
    listQuery:
      "SELECT Id, SiteName, LastModifiedDate FROM RemoteSiteSetting ORDER BY LastModifiedDate DESC LIMIT 100",
    memberName: (r) => r.SiteName
  }
];

/**
 * @param {Array<{ type: string, member: string }>} selections
 * @param {string} version e.g. 59.0
 */
export function buildPackageXml(selections, version = "59.0") {
  const byType = new Map();
  for (const sel of selections) {
    if (!sel?.type || !sel?.member) continue;
    if (!byType.has(sel.type)) byType.set(sel.type, new Set());
    byType.get(sel.type).add(sel.member);
  }

  const typesXml = [...byType.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([type, members]) => {
      const memberXml = [...members]
        .sort((a, b) => a.localeCompare(b))
        .map((m) => `        <members>${escapeXml(m)}</members>`)
        .join("\n");
      return `    <types>\n${memberXml}\n        <name>${escapeXml(type)}</name>\n    </types>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<Package xmlns="http://soap.sforce.com/2006/04/metadata">
${typesXml || "    <!-- select metadata members -->"}
    <version>${escapeXml(packageVersion(version))}</version>
</Package>
`;
}

function escapeXml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Normalize API version for package.xml (major.minor). */
export function packageVersion(apiVersion = "59.0") {
  const m = String(apiVersion).match(/(\d+)(?:\.(\d+))?/);
  if (!m) return "59.0";
  return `${m[1]}.${m[2] || "0"}`;
}
