/** Common Salesforce Setup / developer destinations (relative to org base). */
export const QUICK_LINKS = [
  {
    group: "Core Setup",
    items: [
      { id: "setup", label: "Setup Home", path: "/lightning/setup/SetupOneHome/home", classic: "/setup/forcecomHomepage.apexp" },
      { id: "object-manager", label: "Object Manager", path: "/lightning/setup/ObjectManager/home", classic: "/ui/setup/Setup?setupid=CustomObjects" },
      { id: "users", label: "Users", path: "/lightning/setup/ManageUsers/home", classic: "/005?setupid=ManageUsers" },
      { id: "profiles", label: "Profiles", path: "/lightning/setup/EnhancedProfiles/home", classic: "/00e?setupid=EnhancedProfiles" },
      { id: "permsets", label: "Permission Sets", path: "/lightning/setup/PermSets/home", classic: "/0PS?setupid=PermSets" },
      { id: "psg", label: "Permission Set Groups", path: "/lightning/setup/PermSetGroups/home", classic: "/0PG?setupid=PermSetGroups" }
    ]
  },
  {
    group: "Code & Automation",
    items: [
      { id: "apex", label: "Apex Classes", path: "/lightning/setup/ApexClasses/home", classic: "/01p?setupid=ApexClasses" },
      { id: "triggers", label: "Apex Triggers", path: "/lightning/setup/ApexTriggers/home", classic: "/01q?setupid=ApexTriggers" },
      { id: "lwc", label: "Lightning Components", path: "/lightning/setup/LightningComponentBundles/home", classic: "/0Rb?setupid=LightningComponentBundles" },
      { id: "flows", label: "Flows", path: "/lightning/setup/Flows/home", classic: "/300?setupid=InteractionProcesses" },
      { id: "flow-debug", label: "Flow Interviews", path: "/lightning/setup/FlowInterviews/home", classic: "/08n?setupid=FlowInterviews" },
      { id: "pb", label: "Process Builder", path: "/lightning/setup/ProcessAutomation/home", classic: "/process/ProcessAutomation.app" },
      { id: "wf", label: "Workflow Rules", path: "/lightning/setup/WorkflowRules/home", classic: "/01Q?setupid=WorkflowRules" },
      { id: "email-alerts", label: "Email Alerts", path: "/lightning/setup/WorkflowEmails/home", classic: "/01W?setupid=WorkflowEmails" }
    ]
  },
  {
    group: "Debug & Monitor",
    items: [
      { id: "debug-logs", label: "Debug Logs", path: "/lightning/setup/ApexDebugLogs/home", classic: "/setup/ui/listApexTraces.apexp" },
      { id: "trace-flags", label: "Trace Flags", path: "/lightning/setup/ApexDebugLogs/home", classic: "/setup/ui/listApexTraces.apexp" },
      { id: "apex-jobs", label: "Apex Jobs", path: "/lightning/setup/AsyncApexJobs/home", classic: "/apexpages/setup/listAsyncApexJobs.apexp" },
      { id: "scheduled", label: "Scheduled Jobs", path: "/lightning/setup/ScheduledJobs/home", classic: "/08e?setupid=ScheduledJobs" },
      { id: "deploy", label: "Deployment Status", path: "/lightning/setup/DeployStatus/home", classic: "/changemgmt/monitorDeployment.apexp" },
      { id: "setup-audit", label: "Setup Audit Trail", path: "/lightning/setup/SecurityEvents/home", classic: "/setup/org/orgsetupaudit.jsp" }
    ]
  },
  {
    group: "Integration & Security",
    items: [
      { id: "named-cred", label: "Named Credentials", path: "/lightning/setup/NamedCredential/home", classic: "/0XA?setupid=NamedCredential" },
      { id: "ext-cred", label: "External Credentials", path: "/lightning/setup/ExternalCredential/home", classic: "/0XU?setupid=ExternalCredential" },
      { id: "connected-apps", label: "Connected Apps", path: "/lightning/setup/ConnectedApplication/home", classic: "/0H4?setupid=ConnectedApplication" },
      { id: "remote-site", label: "Remote Site Settings", path: "/lightning/setup/SecurityRemoteProxy/home", classic: "/0rp?setupid=SecurityRemoteProxy" },
      { id: "cors", label: "CORS", path: "/lightning/setup/CorsWhitelistEntries/home", classic: "/0LE?setupid=CorsWhitelistEntries" },
      { id: "session", label: "Session Settings", path: "/lightning/setup/SecuritySession/home", classic: "/0me?setupid=SecuritySession" },
      { id: "login-history", label: "Login History", path: "/lightning/setup/OrgLoginHistory/home", classic: "/0Ya?setupid=OrgLoginHistory" }
    ]
  },
  {
    group: "Data & Metadata",
    items: [
      { id: "cmdt", label: "Custom Metadata Types", path: "/lightning/setup/CustomMetadata/home", classic: "/0HD?setupid=CustomMetadata" },
      { id: "custom-settings", label: "Custom Settings", path: "/lightning/setup/CustomSettings/home", classic: "/0nc?setupid=CustomSettings" },
      { id: "custom-labels", label: "Custom Labels", path: "/lightning/setup/ExternalStrings/home", classic: "/101?setupid=ExternalStrings" },
      { id: "static-resources", label: "Static Resources", path: "/lightning/setup/StaticResources/home", classic: "/081?setupid=StaticResources" },
      { id: "email-templates", label: "Email Templates", path: "/lightning/setup/CommunicationTemplatesEmail/home", classic: "/00X?setupid=CommunicationTemplatesEmail" },
      { id: "data-export", label: "Data Export", path: "/lightning/setup/DataManagementExport/home", classic: "/ui/setup/export/DataExportPage/d" },
      { id: "storage", label: "Storage Usage", path: "/lightning/setup/CompanyResourceDisk/home", classic: "/setup/org/diskusage.jsp" }
    ]
  },
  {
    group: "Developer Tools",
    items: [
      { id: "dev-console", label: "Developer Console", path: "/_ui/common/apex/debug/ApexCSIPage", classic: "/_ui/common/apex/debug/ApexCSIPage", newTab: true },
      { id: "workbench", label: "Workbench (external)", path: "https://workbench.developerforce.com/", external: true },
      { id: "api", label: "API Usage", path: "/lightning/setup/CompanyResourceApiUsage/home", classic: "/setup/org/apilimiting.jsp" },
      { id: "schema", label: "Schema Builder", path: "/lightning/setup/SchemaBuilder/home", classic: "/ui/setup/schemabuilder/SchemaBuilderUi" },
      { id: "custom-tabs", label: "Tabs", path: "/lightning/setup/CustomTabs/home", classic: "/01r?setupid=CustomTabs" },
      { id: "apps", label: "App Manager", path: "/lightning/setup/NavigationMenus/home", classic: "/0Ai?setupid=NavigationMenus" }
    ]
  }
];

/** Common Salesforce key prefixes for quick ID decoding. */
export const KEY_PREFIXES = {
  "001": "Account",
  "003": "Contact",
  "005": "User",
  "006": "Opportunity",
  "00Q": "Lead",
  "00T": "Task",
  "00U": "Event",
  "00e": "Profile",
  "00P": "Attachment",
  "015": "Document",
  "01t": "Product2",
  "01p": "ApexClass",
  "01q": "ApexTrigger",
  "02u": "PricebookEntry",
  "03u": "UserRole",
  "04v": "EmailTemplate",
  "068": "ContentVersion",
  "069": "ContentDocument",
  "07L": "ApexLog",
  "0A3": "ReportFolder",
  "0D5": "FeedItem",
  "0PS": "PermissionSet",
  "0PG": "PermissionSetGroup",
  "0Q0": "Quote",
  "0XO": "Macro",
  "0em": "EmailMessage",
  "0hn": "FlowDefinition",
  "0kd": "CustomMetadata",
  "0lV": "FlowInterview",
  "0t0": "OpportunityLineItem",
  "300": "Flow",
  "500": "Case",
  "701": "Campaign",
  "707": "AsyncApexJob",
  "708": "CronTrigger",
  "709": "CronJobDetail",
  "800": "Contract",
  "801": "Order",
  "802": "OrderItem",
  "a0": "Custom Object (a0*)",
  "0gf": "NamedCredential",
  "0XA": "NamedCredential",
  "0LQ": "ConnectedApplication",
  "081": "StaticResource"
};

export function decodeKeyPrefix(id) {
  if (!id || typeof id !== "string") return null;
  const clean = id.trim();
  if (clean.length !== 15 && clean.length !== 18) return null;
  const three = clean.slice(0, 3);
  if (KEY_PREFIXES[three]) return KEY_PREFIXES[three];
  if (clean.startsWith("a")) return "Custom Object / Custom Setting";
  return "Unknown object";
}
