/**
 * Metadata Quick Open — search common metadata and build Setup URLs.
 */

export const METADATA_SEARCH_TYPES = [
  {
    id: "ApexClass",
    label: "Apex Class",
    tooling: true,
    query: (q) =>
      `SELECT Id, Name, NamespacePrefix, LastModifiedDate FROM ApexClass WHERE Name LIKE '%${escapeSoql(q)}%' ORDER BY LastModifiedDate DESC LIMIT 25`,
    openPath: (r) => `/lightning/setup/ApexClasses/page?address=%2F${r.Id}`
  },
  {
    id: "ApexTrigger",
    label: "Apex Trigger",
    tooling: true,
    query: (q) =>
      `SELECT Id, Name, TableEnumOrId, NamespacePrefix, LastModifiedDate FROM ApexTrigger WHERE Name LIKE '%${escapeSoql(q)}%' ORDER BY LastModifiedDate DESC LIMIT 25`,
    openPath: (r) => `/lightning/setup/ApexTriggers/page?address=%2F${r.Id}`
  },
  {
    id: "LightningComponentBundle",
    label: "LWC",
    tooling: true,
    query: (q) =>
      `SELECT Id, DeveloperName, MasterLabel, NamespacePrefix, LastModifiedDate FROM LightningComponentBundle WHERE DeveloperName LIKE '%${escapeSoql(q)}%' OR MasterLabel LIKE '%${escapeSoql(q)}%' ORDER BY LastModifiedDate DESC LIMIT 25`,
    openPath: (r) => `/lightning/setup/LightningComponentBundles/page?address=%2F${r.Id}`,
    displayName: (r) => r.DeveloperName || r.MasterLabel
  },
  {
    id: "AuraDefinitionBundle",
    label: "Aura",
    tooling: true,
    query: (q) =>
      `SELECT Id, DeveloperName, MasterLabel, NamespacePrefix, LastModifiedDate FROM AuraDefinitionBundle WHERE DeveloperName LIKE '%${escapeSoql(q)}%' OR MasterLabel LIKE '%${escapeSoql(q)}%' ORDER BY LastModifiedDate DESC LIMIT 25`,
    openPath: (r) => `/lightning/setup/LightningComponentBundles/page?address=%2F${r.Id}`,
    displayName: (r) => r.DeveloperName || r.MasterLabel
  },
  {
    id: "Flow",
    label: "Flow",
    tooling: false,
    query: (q) =>
      `SELECT DurableId, ApiName, Label, ProcessType, IsActive, LastModifiedDate FROM FlowDefinitionView WHERE ApiName LIKE '%${escapeSoql(q)}%' OR Label LIKE '%${escapeSoql(q)}%' ORDER BY LastModifiedDate DESC LIMIT 25`,
    openPath: (r) => `/builder_platform_interaction/flowBuilder.app?flowDefId=${encodeURIComponent(r.DurableId || r.ApiName)}&flowId=${encodeURIComponent(r.DurableId || "")}`,
    displayName: (r) => r.ApiName || r.Label,
    fallback: {
      tooling: true,
      query: (q) =>
        `SELECT Id, DeveloperName, MasterLabel, LastModifiedDate FROM FlowDefinition WHERE DeveloperName LIKE '%${escapeSoql(q)}%' OR MasterLabel LIKE '%${escapeSoql(q)}%' ORDER BY LastModifiedDate DESC LIMIT 25`,
      openPath: (r) => `/lightning/setup/Flows/home`,
      displayName: (r) => r.DeveloperName || r.MasterLabel
    }
  },
  {
    id: "CustomObject",
    label: "Custom Object",
    tooling: true,
    query: (q) =>
      `SELECT Id, DeveloperName, NamespacePrefix, LastModifiedDate FROM CustomObject WHERE DeveloperName LIKE '%${escapeSoql(q)}%' ORDER BY LastModifiedDate DESC LIMIT 25`,
    openPath: (r) => {
      const ns = r.NamespacePrefix ? `${r.NamespacePrefix}__` : "";
      const name = r.DeveloperName || "";
      const api = name.includes("__") ? `${ns}${name}` : `${ns}${name}__c`;
      return `/lightning/setup/ObjectManager/${encodeURIComponent(api)}/Details/view`;
    },
    displayName: (r) => {
      const ns = r.NamespacePrefix ? `${r.NamespacePrefix}__` : "";
      const name = r.DeveloperName || "";
      return name.includes("__") ? `${ns}${name}` : `${ns}${name}__c`;
    }
  },
  {
    id: "ValidationRule",
    label: "Validation Rule",
    tooling: true,
    query: (q) =>
      `SELECT Id, ValidationName, EntityDefinition.QualifiedApiName, Active, LastModifiedDate FROM ValidationRule WHERE ValidationName LIKE '%${escapeSoql(q)}%' ORDER BY LastModifiedDate DESC LIMIT 25`,
    openPath: (r) => `/lightning/setup/ObjectManager/home`,
    displayName: (r) => `${r.EntityDefinition?.QualifiedApiName || "?"}.${r.ValidationName}`
  },
  {
    id: "StaticResource",
    label: "Static Resource",
    tooling: false,
    query: (q) =>
      `SELECT Id, Name, NamespacePrefix, LastModifiedDate FROM StaticResource WHERE Name LIKE '%${escapeSoql(q)}%' ORDER BY LastModifiedDate DESC LIMIT 25`,
    openPath: (r) => `/lightning/setup/StaticResources/page?address=%2F${r.Id}`,
    displayName: (r) => r.Name
  },
  {
    id: "Profile",
    label: "Profile",
    tooling: false,
    query: (q) =>
      `SELECT Id, Name, LastModifiedDate FROM Profile WHERE Name LIKE '%${escapeSoql(q)}%' ORDER BY Name ASC LIMIT 25`,
    openPath: (r) => `/lightning/setup/Profiles/page?address=%2F${r.Id}`,
    displayName: (r) => r.Name
  },
  {
    id: "PermissionSet",
    label: "Permission Set",
    tooling: false,
    query: (q) =>
      `SELECT Id, Name, Label, LastModifiedDate FROM PermissionSet WHERE Name LIKE '%${escapeSoql(q)}%' OR Label LIKE '%${escapeSoql(q)}%' ORDER BY LastModifiedDate DESC LIMIT 25`,
    openPath: (r) => `/lightning/setup/PermSets/page?address=%2F${r.Id}`,
    displayName: (r) => r.Label || r.Name
  }
];

export function escapeSoql(value) {
  return String(value || "").replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

export function lightningBaseFromOrg(org) {
  if (!org) return null;
  if (org.hostname.includes("lightning.force.com")) return org.origin;
  return org.origin.replace(".my.salesforce.com", ".lightning.force.com");
}

export function buildOpenUrl(org, typeDef, record) {
  const base = lightningBaseFromOrg(org) || org?.origin;
  const path = typeDef.openPath(record);
  if (path.startsWith("http")) return path;
  return `${base}${path}`;
}
