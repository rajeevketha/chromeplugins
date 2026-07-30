import { QUICK_LINKS, decodeKeyPrefix } from "../lib/quick-links.js";
import {
  isSalesforceUrl,
  normalizeSfId,
  to18,
  buildRecordUrl,
  DEFAULT_API_VERSION
} from "../lib/salesforce.js";
import { generateSoql } from "../lib/nl-soql.js";
import { analyzeFlow } from "../lib/flow-analyzer.js";
import { predictGovernorLimits } from "../lib/governor.js";
import { summarizeOrgLimits } from "../lib/org-limits.js";
import { decodeError, decodeErrorWithAi } from "../lib/error-decoder.js";
import { analyzeDebugLog } from "../lib/debug-log.js";
import { buildFormula, FORMULA_HELPERS } from "../lib/formula-builder.js";
import { DEPLOY_CHECKLIST, assessDeploymentReadiness } from "../lib/deployment.js";
import { analyzePermissions, buildPermissionQueries } from "../lib/permissions.js";
import { reviewApex } from "../lib/apex-review.js";
import { aiComplete } from "../lib/ai.js";
import {
  summarizeField,
  filterFields,
  findDependentPairs,
  buildDependentMap
} from "../lib/describe-browser.js";
import { METADATA_SEARCH_TYPES, lightningBaseFromOrg } from "../lib/metadata-open.js";
import { PACKAGE_TYPES, buildPackageXml, packageVersion } from "../lib/package-xml.js";
import { buildFieldReferenceHint } from "../lib/flow-cleaner.js";
import {
  recordsToTable,
  tableToCsv,
  tableToTsv,
  tableToExcelXml,
  downloadTextFile,
  defaultExportBasename,
  copyText
} from "../lib/query-export.js";
import {
  listSavedSoql,
  saveSoqlEntry,
  deleteSavedSoql,
  togglePinnedSoql
} from "../lib/soql-library.js";
import {
  extractFromObject,
  getTokenAtCursor,
  filterApiNames,
  applySuggestion,
  isValidSObjectName
} from "../lib/soql-assist.js";
import {
  isSalesforceId,
  isCustomMetadataType,
  detectSObjectType,
  extractRecordId,
  buildRecordEditorFields,
  buildUpdatePayload
} from "../lib/record-editor.js";
import {
  APEX_SNIPPETS,
  summarizeExecuteAnonymous,
  extractDebugOutput
} from "../lib/anonymous-apex.js";

const FEATURES = [
  { id: "soql-run", title: "SOQL Runner", blurb: "Autocomplete, All data edit, Tooling" },
  { id: "anon-apex", title: "Anonymous Apex", blurb: "Execute + pull debug output" },
  { id: "describe", title: "Describe Browser", blurb: "Fields, picklists, dependencies" },
  { id: "meta-open", title: "Metadata Quick Open", blurb: "Jump to class, flow, LWC…" },
  { id: "package", title: "Package.xml Builder", blurb: "Multi-select → package.xml" },
  { id: "flow-clean", title: "Inactive Flow Cleaner", blurb: "Delete versions blocking fields" },
  { id: "nl-soql", title: "NL → SOQL", blurb: "Standard, CMDT, Tooling + optional AI" },
  { id: "flow", title: "Flow Analyzer", blurb: "Spot DML-in-loop & fault gaps" },
  { id: "governor", title: "Governor Predictor", blurb: "Estimate limit risk in Apex" },
  { id: "errors", title: "Error Decoder", blurb: "Explain Salesforce exceptions" },
  { id: "logs", title: "Debug Log Analyzer", blurb: "Limits, SOQL, exceptions" },
  { id: "formula", title: "Formula Builder", blurb: "AI / template formulas" },
  { id: "deploy", title: "Deploy Readiness", blurb: "Checklist + org signals" },
  { id: "perms", title: "Permission Investigator", blurb: "User CRUD / FLS view" },
  { id: "apex", title: "Apex Review", blurb: "Security & bulkification scan" }
];

const TITLES = {
  home: "OrgKit",
  describe: "Describe Browser",
  "meta-open": "Metadata Quick Open",
  package: "Package.xml Builder",
  "flow-clean": "Inactive Flow Cleaner",
  "nl-soql": "NL → SOQL",
  flow: "Flow Analyzer",
  governor: "Governor Predictor",
  errors: "Error Decoder",
  logs: "Debug Log Analyzer",
  formula: "Formula Builder",
  deploy: "Deploy Readiness",
  perms: "Permission Investigator",
  apex: "Apex Review",
  links: "Setup Links",
  "soql-run": "SOQL Runner",
  "anon-apex": "Anonymous Apex",
  ids: "ID Tools",
  favs: "Favorites"
};

const state = {
  tab: null,
  org: null,
  session: null,
  favorites: [],
  lastSoqlJson: "",
  lastQueryJson: {
    soql: "",
    nl: ""
  },
  lastQueryTables: {
    soql: null,
    nl: null
  },
  lastQueryRecords: {
    soql: null,
    nl: null
  },
  recordEditor: {
    open: false,
    key: null,
    sobject: null,
    id: null,
    tooling: false,
    fields: [],
    record: null,
    deletable: false,
    updateable: false
  },
  lastGenSoql: "",
  lastGenApiMode: "rest",
  toolingObjects: null,
  lastFormula: "",
  deployChecked: [],
  deploySignals: {},
  describe: null,
  describeFields: [],
  packageSelections: [],
  packageMembersCache: [],
  lastPackageXml: "",
  inactiveFlows: [],
  inactiveFlowSelected: [],
  soqlLibrary: [],
  editingSoqlId: null,
  soqlAssist: {
    mode: "rest",
    objectNames: [],
    fieldsByKey: {},
    activeObject: null,
    suggestions: [],
    activeIndex: 0,
    token: null,
    loadSeq: 0,
    suppressSuggest: false,
    suggestTimer: null
  },
  apexClassResults: [],
  orgLimits: null
};

const $ = (sel) => document.querySelector(sel);

init();

async function init() {
  await applyShellMode();
  window.addEventListener("resize", () => {
    applyShellMode();
  });
  renderFeatureGrid();
  bindNav();
  bindFeatureActions();
  bindUtilityActions();
  bindRecordDrawer();
  fillApiVersions();
  fillMetaTypeSelect();
  fillPackageTypeSelect();
  fillApexSnippets();
  renderLinks();
  renderFormulaHelpers();
  await loadFavorites();
  await loadDeployChecklist();
  await refreshOrg();
  await refreshSoqlLibrary();
  const deepView = new URLSearchParams(location.search).get("view");
  showView(deepView && TITLES[deepView] ? deepView : "home");
}

/**
 * Action popups stay compact; opening popup.html as a Chrome tab fills the window.
 */
async function applyShellMode() {
  let asTab = false;
  try {
    const tab = await chrome.tabs.getCurrent();
    asTab = Boolean(tab?.id);
  } catch {
    asTab = false;
  }
  const wide = asTab || window.innerWidth >= 820 || window.matchMedia("(min-width: 820px)").matches;
  document.documentElement.classList.toggle("shell-wide", wide);
}

function renderFeatureGrid() {
  const grid = $("#featureGrid");
  grid.innerHTML = "";
  FEATURES.forEach((f) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "feature-card";
    btn.innerHTML = `<strong>${f.title}</strong><span>${f.blurb}</span>`;
    btn.addEventListener("click", () => showView(f.id));
    grid.appendChild(btn);
  });
}

function bindNav() {
  $("#openOptions").addEventListener("click", () => chrome.runtime.openOptionsPage());
  $("#homeOpenSettings")?.addEventListener("click", () => chrome.runtime.openOptionsPage());
  $("#backBtn").addEventListener("click", () => showView("home"));
  document.querySelectorAll("[data-open]").forEach((btn) => {
    btn.addEventListener("click", () => showView(btn.getAttribute("data-open")));
  });
}

function showView(id) {
  document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
  const el = $(`#view-${id}`);
  if (el) el.classList.add("active");
  $("#headerTitle").textContent = TITLES[id] || "OrgKit";
  $("#backBtn").classList.toggle("hidden", id === "home");
  if (id === "describe" && !state.globalObjects) {
    preloadGlobalObjects().catch(() => {});
  }
  if (id === "soql-run") {
    refreshSoqlLibrary().catch(() => {});
    ensureSoqlObjectList().catch(() => {});
  }
  if (id === "governor" && !state.orgLimits) {
    loadOrgLimits().catch(() => {});
  }
  if (id === "apex" && !state.apexClassResults.length) {
    searchApexClasses("").catch(() => {});
  }
}

function bindFeatureActions() {
  $("#genSoql").addEventListener("click", onGenSoql);
  $("#runGenSoql").addEventListener("click", onRunGenSoql);
  $("#copyGenSoql").addEventListener("click", async () => {
    if (state.lastGenSoql) await navigator.clipboard.writeText(state.lastGenSoql);
  });

  $("#loadFlows").addEventListener("click", onLoadFlows);
  $("#analyzeFlowPaste").addEventListener("click", () => {
    renderFlowReport(analyzeFlow($("#flowPaste").value));
  });

  $("#runGovernor").addEventListener("click", () => {
    renderGovernor(predictGovernorLimits($("#govInput").value));
  });
  $("#loadOrgLimits").addEventListener("click", () => loadOrgLimits());

  $("#decodeErr").addEventListener("click", () => renderError(decodeError($("#errInput").value)));
  $("#decodeErrAi").addEventListener("click", async () => {
    const out = await decodeErrorWithAi($("#errInput").value, aiComplete);
    renderError(out);
  });

  $("#analyzeLog").addEventListener("click", () => renderLog(analyzeDebugLog($("#logInput").value)));

  $("#buildFormula").addEventListener("click", onBuildFormula);
  $("#copyFormula").addEventListener("click", async () => {
    if (state.lastFormula) await navigator.clipboard.writeText(state.lastFormula);
  });

  $("#refreshDeploySignals").addEventListener("click", refreshDeploySignals);
  $("#assessDeploy").addEventListener("click", assessDeploy);

  $("#investigatePerms").addEventListener("click", onInvestigatePerms);
  $("#reviewApex").addEventListener("click", onReviewApex);
  $("#searchApexClasses").addEventListener("click", () => searchApexClasses($("#apexClassSearch").value));
  $("#apexClassSearch").addEventListener("keydown", (e) => {
    if (e.key === "Enter") searchApexClasses($("#apexClassSearch").value);
  });

  $("#loadDescribe").addEventListener("click", onLoadDescribe);
  $("#describeFieldFilter").addEventListener("input", () => renderDescribeFields());
  $("#describeObjectSearch").addEventListener("keydown", (e) => {
    if (e.key === "Enter") onLoadDescribe();
  });

  $("#searchMeta").addEventListener("click", onSearchMeta);
  $("#metaQuery").addEventListener("keydown", (e) => {
    if (e.key === "Enter") onSearchMeta();
  });

  $("#loadPackageMembers").addEventListener("click", onLoadPackageMembers);
  $("#packageMemberFilter").addEventListener("input", () => renderPackageMembers());
  $("#clearPackageSel").addEventListener("click", () => {
    state.packageSelections = [];
    renderPackageSelection();
    renderPackageMembers();
  });
  $("#genPackageXml").addEventListener("click", onGenPackageXml);
  $("#copyPackageXml").addEventListener("click", async () => {
    if (state.lastPackageXml) await navigator.clipboard.writeText(state.lastPackageXml);
  });

  $("#loadInactiveFlows").addEventListener("click", () => onLoadInactiveFlows(false));
  $("#scanFlowFieldRefs").addEventListener("click", () => onLoadInactiveFlows(true));
  $("#flowCleanFilter").addEventListener("input", () => renderInactiveFlows());
  $("#selectAllInactiveFlows").addEventListener("click", () => {
    state.inactiveFlowSelected = state.inactiveFlows.filter((f) => f.canDelete).map((f) => f.id);
    renderInactiveFlows();
  });
  $("#clearInactiveFlows").addEventListener("click", () => {
    state.inactiveFlowSelected = [];
    renderInactiveFlows();
  });
  $("#deleteInactiveFlows").addEventListener("click", onDeleteInactiveFlows);
}

function bindUtilityActions() {
  $("#linkSearch").addEventListener("input", () => renderLinks($("#linkSearch").value));
  $("#runSoql").addEventListener("click", runSoqlManual);
  $("#saveSoqlBtn").addEventListener("click", onSaveSoqlToLibrary);
  $("#soqlLibraryFilter").addEventListener("input", () => renderSoqlLibrary());
  bindSoqlAssist();
  bindQueryExportPanel($("#soqlQueryPanel"), "soql", $("#soqlQueryStatus"));
  bindQueryExportPanel($("#nlQueryPanel"), "nl", $("#nlQueryStatus"));
  $("#runAnonApex").addEventListener("click", onRunAnonApex);
  $("#fetchAnonDebug").addEventListener("click", onFetchAnonDebug);
  $("#copyAnonApex").addEventListener("click", async () => {
    const body = $("#anonApexInput").value;
    if (body) await navigator.clipboard.writeText(body);
  });
  $("#apexSnippet").addEventListener("change", () => {
    const snip = APEX_SNIPPETS.find((s) => s.id === $("#apexSnippet").value);
    if (snip) $("#anonApexInput").value = snip.body;
  });
  $("#idInput").addEventListener("input", updateIdInfo);
  $("#openRecord").addEventListener("click", openRecord);
  $("#copy15").addEventListener("click", () => copyIdLength(15));
  $("#copy18").addEventListener("click", () => copyIdLength(18));
  $("#scanPageIds").addEventListener("click", scanPageIds);
  $("#addFav").addEventListener("click", addFavorite);
  $("#saveCurrent").addEventListener("click", saveCurrentPage);
  updateIdInfo();
}

function bindQueryExportPanel(panel, key, statusEl) {
  if (!panel) return;
  panel.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-export]");
    if (!btn) return;
    const table = state.lastQueryTables[key];
    const json = state.lastQueryJson[key] || "";
    try {
      await handleQueryExport(btn.dataset.export, table, json, statusEl);
    } catch (err) {
      if (statusEl) statusEl.textContent = err.message || String(err);
    }
  });
}

async function handleQueryExport(kind, table, json, statusEl) {
  if (!table && kind !== "json") {
    throw new Error("Run a query first.");
  }
  const base = defaultExportBasename("soql-results");
  if (kind === "sheets") {
    await copyText(tableToTsv(table));
    if (statusEl) statusEl.textContent = "Copied for Google Sheets / Excel paste (TSV).";
    return;
  }
  if (kind === "excel") {
    downloadTextFile(
      `${base}.xls`,
      tableToExcelXml(table, "SOQL"),
      "application/vnd.ms-excel"
    );
    if (statusEl) statusEl.textContent = `Downloaded ${base}.xls`;
    return;
  }
  if (kind === "csv") {
    downloadTextFile(`${base}.csv`, tableToCsv(table), "text/csv;charset=utf-8");
    if (statusEl) statusEl.textContent = `Downloaded ${base}.csv`;
    return;
  }
  if (kind === "json") {
    if (!json) throw new Error("No JSON result to copy.");
    await copyText(json);
    if (statusEl) statusEl.textContent = "Copied JSON.";
  }
}

function renderQueryResult(panel, statusEl, key, queryResult, soqlText = "", options = {}) {
  const table = recordsToTable(queryResult);
  const records = Array.isArray(queryResult?.records) ? queryResult.records : [];
  const sobjectType = detectSObjectType(queryResult, soqlText);
  const tooling =
    options.tooling === true ||
    (options.tooling !== false && key === "soql" && soqlApiMode() === "tooling") ||
    (key === "nl" && state.lastGenApiMode === "tooling");
  state.lastQueryTables[key] = table;
  state.lastQueryJson[key] = JSON.stringify(queryResult, null, 2);
  state.lastQueryRecords[key] = { records, sobjectType, tooling, soqlText };
  state.lastSoqlJson = state.lastQueryJson[key];

  if (!panel) return;
  panel.classList.remove("hidden");
  const meta = panel.querySelector("[data-query-meta]");
  const wrap = panel.querySelector("[data-query-table]");
  if (meta) {
    const more = table.done === false ? " · more rows available" : "";
    const typeBit = sobjectType ? ` · ${sobjectType}` : "";
    meta.textContent = `${table.recordCount} row${table.recordCount === 1 ? "" : "s"} · ${table.columns.length} column${
      table.columns.length === 1 ? "" : "s"
    }${typeof table.totalSize === "number" ? ` · totalSize ${table.totalSize}` : ""}${typeBit}${more}`;
  }
  if (!wrap) return;
  wrap.replaceChildren();

  if (!table.recordCount) {
    const empty = document.createElement("div");
    empty.className = "query-empty";
    empty.textContent = "Query returned 0 records.";
    wrap.appendChild(empty);
    setQueryStatus(statusEl, "Ready to export an empty sheet, or adjust the query.", "ok");
    return;
  }

  const idColIdx = table.columns.findIndex((c) => c === "Id");
  const tableEl = document.createElement("table");
  tableEl.className = "query-table";
  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");
  const thAct = document.createElement("th");
  thAct.textContent = "Actions";
  headRow.appendChild(thAct);
  for (const col of table.columns) {
    const th = document.createElement("th");
    th.textContent = col;
    th.title = col;
    headRow.appendChild(th);
  }
  thead.appendChild(headRow);
  tableEl.appendChild(thead);

  const tbody = document.createElement("tbody");
  table.rows.forEach((row, rowIdx) => {
    const tr = document.createElement("tr");
    const record = records[rowIdx] || null;
    const recordId = extractRecordId(record, row, table.columns);
    const type = record?.attributes?.type || sobjectType;

    const tdAct = document.createElement("td");
    tdAct.className = "actions";
    const actions = document.createElement("div");
    actions.className = "row-actions";
    if (recordId && type) {
      const openBtn = document.createElement("button");
      openBtn.type = "button";
      openBtn.className = "btn";
      openBtn.textContent = "Open";
      openBtn.title = "Open in Salesforce";
      openBtn.addEventListener("click", () => {
        openQueryRecord(recordId).catch((e) => {
          setQueryStatus(statusEl, e.message, "error");
        });
      });
      const allBtn = document.createElement("button");
      allBtn.type = "button";
      allBtn.className = "btn primary";
      allBtn.textContent = "All data";
      allBtn.title = "Show all fields — edit or delete";
      allBtn.addEventListener("click", () => {
        openRecordDrawer({
          key,
          sobject: type,
          id: recordId,
          tooling
        }).catch((e) => {
          setQueryStatus(statusEl, e.message, "error");
        });
      });
      actions.appendChild(openBtn);
      actions.appendChild(allBtn);
    } else {
      const miss = document.createElement("span");
      miss.className = "hint";
      miss.textContent = "Add Id";
      miss.title = "Include Id in SELECT to open / edit records";
      actions.appendChild(miss);
    }
    tdAct.appendChild(actions);
    tr.appendChild(tdAct);

    row.forEach((cell, colIdx) => {
      const td = document.createElement("td");
      if (colIdx === idColIdx && isSalesforceId(cell)) {
        const a = document.createElement("a");
        a.href = "#";
        a.className = "record-id-link";
        a.textContent = cell;
        a.title = "Open in Salesforce";
        a.addEventListener("click", (e) => {
          e.preventDefault();
          openQueryRecord(cell).catch((err) => {
            setQueryStatus(statusEl, err.message, "error");
          });
        });
        td.appendChild(a);
      } else {
        td.textContent = cell;
      }
      td.title = cell;
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  tableEl.appendChild(tbody);
  wrap.appendChild(tableEl);
  setQueryStatus(
    statusEl,
    recordIdHint(table)
      ? "Click Id / Open for Lightning, or All data to view every field and edit/delete."
      : "Include Id in SELECT to enable Open and All data.",
    "ok"
  );
}

function recordIdHint(table) {
  return table.columns.includes("Id");
}

async function openQueryRecord(recordId) {
  await refreshOrg();
  if (!state.org) throw new Error("Open a Salesforce org tab first.");
  const url = buildRecordUrl(state.org, recordId, true);
  await chrome.tabs.create({ url });
}

function clearQueryResult(panel, statusEl, key, message, kind = "info") {
  state.lastQueryTables[key] = null;
  state.lastQueryJson[key] = "";
  state.lastQueryRecords[key] = null;
  if (panel) {
    panel.classList.add("hidden");
    const wrap = panel.querySelector("[data-query-table]");
    if (wrap) wrap.replaceChildren();
    const meta = panel.querySelector("[data-query-meta]");
    if (meta) meta.textContent = "";
  }
  setQueryStatus(statusEl, message || "", kind);
}

function setQueryStatus(statusEl, message, kind = "info") {
  if (!statusEl) return;
  statusEl.textContent = message || "";
  statusEl.classList.remove("is-error", "is-ok", "is-busy");
  if (!message) return;
  if (kind === "error") statusEl.classList.add("is-error");
  else if (kind === "ok") statusEl.classList.add("is-ok");
  else if (kind === "busy") statusEl.classList.add("is-busy");
}

function setStatusMessage(el, message, kind = "info") {
  if (!el) return;
  el.textContent = message || "";
  el.classList.remove("is-error", "is-ok", "is-busy");
  if (!message) return;
  if (kind === "error") el.classList.add("is-error");
  else if (kind === "ok") el.classList.add("is-ok");
  else if (kind === "busy") el.classList.add("is-busy");
}

function bindRecordDrawer() {
  const drawer = $("#recordDrawer");
  if (!drawer) return;
  drawer.querySelectorAll("[data-record-close]").forEach((el) => {
    el.addEventListener("click", () => closeRecordDrawer());
  });
  $("#recordOpenSf")?.addEventListener("click", async () => {
    try {
      if (!state.recordEditor.id) return;
      await openQueryRecord(state.recordEditor.id);
    } catch (e) {
      setRecordDrawerStatus(e.message);
    }
  });
  $("#recordSave")?.addEventListener("click", () => saveRecordDrawer().catch((e) => setRecordDrawerStatus(e.message)));
  $("#recordDelete")?.addEventListener("click", () => deleteRecordDrawer().catch((e) => setRecordDrawerStatus(e.message)));
  $("#recordFieldFilter")?.addEventListener("input", () => renderRecordFieldList());
}

async function openRecordDrawer({ key, sobject, id, tooling = false }) {
  if (!sobject || !id) throw new Error("Record type and Id are required.");
  const drawer = $("#recordDrawer");
  const status = $("#recordDrawerStatus");
  if (!drawer) return;
  setRecordDrawerStatus("Loading all fields…");
  drawer.classList.remove("hidden");
  drawer.setAttribute("aria-hidden", "false");
  $("#recordDrawerTitle").textContent = "Show all data";
  $("#recordDrawerSub").textContent = `${sobject} · ${id}${tooling ? " · Tooling" : ""}`;
  $("#recordFieldFilter").value = "";
  $("#recordFieldList").replaceChildren();

  await ensureSalesforceSiteAccess();
  const tabUrl = await requireTabUrl();
  const [describeRes, recordRes] = await Promise.all([
    send("describeSObject", { tabUrl, sobject, apiVersion: apiVersion(), tooling }),
    send("getSObject", { tabUrl, sobject, id, apiVersion: apiVersion(), tooling })
  ]);
  if (!describeRes.ok) throw new Error(describeRes.error);
  if (!recordRes.ok) throw new Error(recordRes.error);

  const fields = buildRecordEditorFields(describeRes.result, recordRes.result);
  const cmdt = isCustomMetadataType(sobject);
  const canUpdate =
    describeRes.result?.updateable !== false || cmdt || fields.some((f) => f.updateable);
  const canDelete = describeRes.result?.deletable !== false && !cmdt;
  state.recordEditor = {
    open: true,
    key,
    sobject,
    id,
    tooling: !!tooling,
    fields,
    record: recordRes.result,
    deletable: canDelete,
    updateable: canUpdate,
    isCmdt: cmdt
  };
  $("#recordSave").disabled = !state.recordEditor.updateable;
  $("#recordDelete").disabled = !state.recordEditor.deletable;
  renderRecordFieldList();
  setRecordDrawerStatus(
    cmdt
      ? `${fields.length} fields · custom metadata — editable fields save via Tooling CustomMetadata.`
      : `${fields.length} fields · ${fields.filter((f) => f.updateable).length} editable. Change values then Save, or Delete.`
  );
}

function closeRecordDrawer() {
  const drawer = $("#recordDrawer");
  if (drawer) {
    drawer.classList.add("hidden");
    drawer.setAttribute("aria-hidden", "true");
  }
  state.recordEditor.open = false;
}

function setRecordDrawerStatus(msg) {
  const el = $("#recordDrawerStatus");
  if (el) el.textContent = msg || "";
}

function renderRecordFieldList() {
  const root = $("#recordFieldList");
  if (!root) return;
  const filter = ($("#recordFieldFilter")?.value || "").trim().toLowerCase();
  const fields = (state.recordEditor.fields || []).filter((f) => {
    if (!filter) return true;
    return `${f.name} ${f.label} ${f.type}`.toLowerCase().includes(filter);
  });
  root.replaceChildren();
  for (const f of fields) {
    const row = document.createElement("div");
    row.className = `record-field${f.updateable ? "" : " readonly"}`;
    const lab = document.createElement("label");
    lab.htmlFor = `rf_${f.name}`;
    lab.innerHTML = `<strong>${escapeHtml(f.name)}</strong>${escapeHtml(f.label)} · ${escapeHtml(f.type)}`;
    row.appendChild(lab);

    if (!f.updateable) {
      const ro = document.createElement("div");
      ro.className = "field-ro";
      ro.textContent = f.value === "" || f.value == null ? "—" : String(f.value);
      row.appendChild(ro);
    } else if (f.type === "boolean") {
      const sel = document.createElement("select");
      sel.id = `rf_${f.name}`;
      sel.dataset.field = f.name;
      sel.innerHTML = `<option value="false">false</option><option value="true">true</option>`;
      const cur = f.value === true || f.value === "true" || f.value === "TRUE";
      sel.value = cur ? "true" : "false";
      row.appendChild(sel);
    } else if (f.picklistValues?.length && (f.type === "picklist" || f.type === "combobox")) {
      const sel = document.createElement("select");
      sel.id = `rf_${f.name}`;
      sel.dataset.field = f.name;
      const empty = document.createElement("option");
      empty.value = "";
      empty.textContent = f.nillable ? "(blank)" : "";
      sel.appendChild(empty);
      for (const p of f.picklistValues) {
        const opt = document.createElement("option");
        opt.value = p.value;
        opt.textContent = p.label;
        sel.appendChild(opt);
      }
      sel.value = f.value == null ? "" : String(f.value);
      row.appendChild(sel);
    } else if (f.type === "textarea" || f.type === "encryptedstring" || (f.length && f.length > 80)) {
      const ta = document.createElement("textarea");
      ta.id = `rf_${f.name}`;
      ta.dataset.field = f.name;
      ta.value = f.value == null ? "" : String(f.value);
      row.appendChild(ta);
    } else {
      const input = document.createElement("input");
      input.type = "text";
      input.id = `rf_${f.name}`;
      input.dataset.field = f.name;
      input.value = f.value == null ? "" : String(f.value);
      row.appendChild(input);
    }
    root.appendChild(row);
  }
  if (!fields.length) {
    const empty = document.createElement("div");
    empty.className = "query-empty";
    empty.textContent = "No fields match this filter.";
    root.appendChild(empty);
  }
}

async function saveRecordDrawer() {
  const ed = state.recordEditor;
  if (!ed?.sobject || !ed?.id) return;
  if (!ed.updateable) throw new Error("This object is not updateable.");
  const { body, changed } = buildUpdatePayload(ed.fields, (name) => {
    const el = document.querySelector(`[data-field="${CSS.escape(name)}"]`);
    if (!el) return "";
    return el.value;
  });
  if (!changed) {
    setRecordDrawerStatus("No changes to save.");
    return;
  }
  const fieldList = Object.keys(body).join(", ");
  const ok = confirm(
    `Update ${ed.sobject} ${ed.id}?\n\nFields: ${fieldList}\n\nThis writes to your Salesforce org using your current session.`
  );
  if (!ok) {
    setRecordDrawerStatus("Save cancelled.");
    return;
  }
  setRecordDrawerStatus(`Saving ${changed} field${changed === 1 ? "" : "s"}…`);
  const res = await send("updateSObject", {
    tabUrl: await requireTabUrl(),
    sobject: ed.sobject,
    id: ed.id,
    fields: body,
    apiVersion: apiVersion(),
    tooling: ed.tooling
  });
  if (!res.ok) throw new Error(res.error);
  setRecordDrawerStatus(`Saved: ${res.result.fields.join(", ")}. Reloading…`);
  await openRecordDrawer({
    key: ed.key,
    sobject: ed.sobject,
    id: ed.id,
    tooling: ed.tooling
  });
  setRecordDrawerStatus(`Saved: ${Object.keys(body).join(", ")}.`);
}

async function deleteRecordDrawer() {
  const ed = state.recordEditor;
  if (!ed?.sobject || !ed?.id) return;
  if (!ed.deletable) throw new Error("This object is not deletable.");
  const ok = confirm(`Delete ${ed.sobject} ${ed.id}? This cannot be undone from OrgKit.`);
  if (!ok) return;
  setRecordDrawerStatus("Deleting…");
  const res = await send("deleteSObject", {
    tabUrl: await requireTabUrl(),
    sobject: ed.sobject,
    id: ed.id,
    apiVersion: apiVersion(),
    tooling: ed.tooling
  });
  if (!res.ok) throw new Error(res.error);
  closeRecordDrawer();
  const status =
    ed.key === "nl" ? $("#nlQueryStatus") : $("#soqlQueryStatus");
  if (status) status.textContent = `Deleted ${ed.sobject} ${ed.id}. Re-run the query to refresh rows.`;
}

function fillApiVersions() {
  const select = $("#apiVersion");
  for (let v = 62; v >= 50; v -= 1) {
    const opt = document.createElement("option");
    opt.value = `${v}.0`;
    opt.textContent = `v${v}.0`;
    if (`${v}.0` === DEFAULT_API_VERSION) opt.selected = true;
    select.appendChild(opt);
  }
  chrome.storage.sync.get({ apiVersion: DEFAULT_API_VERSION }, (data) => {
    if (data.apiVersion) select.value = data.apiVersion;
  });
}

async function refreshOrg() {
  const res = await send("getActiveTabOrg");
  if (!res.ok) {
    setOrgBanner(null, null);
    return;
  }
  state.tab = res.result.tab;
  state.org = res.result.org;
  state.session = res.result.session;
  setOrgBanner(state.org, state.session);
  await refreshSoqlLibrary();
}

function currentOrgKey() {
  return (
    state.session?.userInfo?.organization_id ||
    state.org?.myDomain ||
    state.org?.hostname ||
    "default"
  );
}

function fillApexSnippets() {
  const select = $("#apexSnippet");
  if (!select) return;
  select.innerHTML = "";
  const blank = document.createElement("option");
  blank.value = "";
  blank.textContent = "Choose a snippet…";
  select.appendChild(blank);
  for (const s of APEX_SNIPPETS) {
    const opt = document.createElement("option");
    opt.value = s.id;
    opt.textContent = s.label;
    select.appendChild(opt);
  }
}

async function refreshSoqlLibrary() {
  try {
    state.soqlLibrary = await listSavedSoql(currentOrgKey());
  } catch {
    state.soqlLibrary = [];
  }
  renderSoqlLibrary();
}

function renderSoqlLibrary() {
  const root = $("#soqlLibraryList");
  const hint = $("#soqlLibraryHint");
  if (!root) return;
  const filter = ($("#soqlLibraryFilter")?.value || "").trim().toLowerCase();
  const rows = state.soqlLibrary.filter((r) => {
    if (!filter) return true;
    return `${r.name} ${r.soql}`.toLowerCase().includes(filter);
  });
  if (hint) {
    hint.textContent = `Org key: ${currentOrgKey()} · ${state.soqlLibrary.length} saved (local only).`;
  }
  root.replaceChildren();
  if (!rows.length) {
    const empty = document.createElement("div");
    empty.className = "query-empty";
    empty.textContent = filter ? "No saved queries match this filter." : "No saved queries yet. Run one and click Save to library.";
    root.appendChild(empty);
    return;
  }
  for (const row of rows) {
    const item = document.createElement("div");
    item.className = "pkg-item soql-lib-item";
    const main = document.createElement("div");
    main.className = "soql-lib-main";
    const title = document.createElement("strong");
    title.textContent = `${row.pinned ? "★ " : ""}${row.name}${row.apiMode === "tooling" ? " · Tooling" : ""}`;
    const preview = document.createElement("code");
    preview.textContent = row.soql.length > 120 ? `${row.soql.slice(0, 117)}…` : row.soql;
    main.appendChild(title);
    main.appendChild(document.createElement("br"));
    main.appendChild(preview);

    const actions = document.createElement("div");
    actions.className = "soql-lib-actions";
    const mkBtn = (label, cls, onClick) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = cls || "btn";
      b.textContent = label;
      b.addEventListener("click", onClick);
      return b;
    };
    actions.appendChild(
      mkBtn("Load", "btn", () => {
        $("#soqlInput").value = row.soql;
        $("#soqlSaveName").value = row.name;
        if ($("#soqlApiMode")) $("#soqlApiMode").value = row.apiMode === "tooling" ? "tooling" : "rest";
        state.editingSoqlId = row.id;
        setQueryStatus($("#soqlQueryStatus"), `Loaded “${row.name}”.`, "ok");
        onSoqlApiModeChange().catch(() => {});
        refreshSoqlSuggestions();
      })
    );
    actions.appendChild(
      mkBtn("Run", "btn primary", async () => {
        $("#soqlInput").value = row.soql;
        $("#soqlSaveName").value = row.name;
        if ($("#soqlApiMode")) $("#soqlApiMode").value = row.apiMode === "tooling" ? "tooling" : "rest";
        state.editingSoqlId = row.id;
        await runSoqlManual();
      })
    );
    actions.appendChild(
      mkBtn(row.pinned ? "Unpin" : "Pin", "btn ghost", async () => {
        state.soqlLibrary = await togglePinnedSoql(currentOrgKey(), row.id);
        renderSoqlLibrary();
      })
    );
    actions.appendChild(
      mkBtn("Delete", "btn danger", async () => {
        if (!confirm(`Delete saved query “${row.name}”?`)) return;
        state.soqlLibrary = await deleteSavedSoql(currentOrgKey(), row.id);
        if (state.editingSoqlId === row.id) state.editingSoqlId = null;
        renderSoqlLibrary();
      })
    );
    item.appendChild(main);
    item.appendChild(actions);
    root.appendChild(item);
  }
}

async function onSaveSoqlToLibrary() {
  const status = $("#soqlQueryStatus");
  try {
    const name = ($("#soqlSaveName").value || "").trim() || guessSoqlName($("#soqlInput").value);
    state.soqlLibrary = await saveSoqlEntry(currentOrgKey(), {
      id: state.editingSoqlId,
      name,
      soql: $("#soqlInput").value,
      apiMode: soqlApiMode()
    });
    $("#soqlSaveName").value = name;
    const match = state.soqlLibrary.find((r) => r.name === name && r.soql === String($("#soqlInput").value).trim());
    state.editingSoqlId = match?.id || state.editingSoqlId;
    renderSoqlLibrary();
    setQueryStatus(status, `Saved “${name}” to library.`, "ok");
  } catch (e) {
    setQueryStatus(status, e.message, "error");
  }
}

function guessSoqlName(soql) {
  const m = String(soql || "").match(/\bFROM\s+([A-Za-z][A-Za-z0-9_]*)/i);
  return m ? `${m[1]} query` : `Query ${new Date().toLocaleString()}`;
}

async function onRunAnonApex() {
  const box = $("#anonApexResult");
  const debug = $("#anonApexDebug");
  box.innerHTML = `<div class="summary-bar">Executing…</div>`;
  debug.textContent = "";
  try {
    const res = await send("executeAnonymous", {
      tabUrl: await requireTabUrl(),
      apex: $("#anonApexInput").value,
      apiVersion: apiVersion()
    });
    if (!res.ok) throw new Error(res.error);
    const summary = summarizeExecuteAnonymous(res.result);
    box.innerHTML = `<div class="finding ${summary.ok ? "info" : "high"}">
      <span class="tag">${summary.ok ? "success" : "failed"}</span>
      <strong>${escapeHtml(summary.summary)}</strong>
      <p>${escapeHtml(summary.detail || "")}</p>
    </div>
    <div class="finding info"><strong>Raw</strong><pre class="inline-pre">${escapeHtml(
      JSON.stringify(res.result, null, 2)
    )}</pre></div>`;
  } catch (e) {
    box.innerHTML = `<div class="finding high"><span class="tag">error</span><strong>${escapeHtml(
      e.message
    )}</strong></div>`;
  }
}

async function onFetchAnonDebug() {
  const debug = $("#anonApexDebug");
  const box = $("#anonApexResult");
  debug.textContent = "Fetching latest Apex log…";
  try {
    const res = await send("fetchLatestApexDebug", {
      tabUrl: await requireTabUrl(),
      apiVersion: apiVersion()
    });
    if (!res.ok) throw new Error(res.error);
    const extracted = extractDebugOutput(res.result.body);
    const header = `Log ${res.result.logId} · ${res.result.startTime || ""} · ${extracted.debugCount} USER_DEBUG`;
    debug.textContent = extracted.preview
      ? `${header}\n\n${extracted.preview}`
      : `${header}\n\nNo USER_DEBUG / FATAL_ERROR lines found in the latest log.\n\n${String(res.result.body || "").slice(0, 2000)}`;
    if (box && !box.innerHTML.includes("finding")) {
      box.innerHTML = `<div class="summary-bar">${escapeHtml(header)}</div>`;
    }
  } catch (e) {
    debug.textContent = e.message;
  }
}

function setOrgBanner(org, session) {
  const banner = $("#orgBanner");
  const pill = $("#envPill");
  const host = $("#orgHost");
  const meta = $("#orgMeta");
  if (!org) {
    banner.classList.add("muted");
    pill.textContent = "—";
    pill.className = "pill";
    host.textContent = "Open a Salesforce tab";
    meta.textContent = "Org-connected tools need an active Salesforce session.";
    return;
  }
  banner.classList.remove("muted");
  pill.textContent = org.envLabel;
  pill.className = `pill ${org.isSandbox ? "sandbox" : org.isDevEd ? "deved" : "prod"}`;
  host.textContent = org.hostname;
  const user =
    session?.userInfo?.preferred_username ||
    session?.userInfo?.username ||
    session?.userInfo?.email ||
    session?.userInfo?.name ||
    "";
  const orgId = session?.userInfo?.organization_id || "";
  meta.textContent = [user, orgId ? `Org: ${orgId}` : "", session?.sid ? "Session: connected" : "Session: navigation only"]
    .filter(Boolean)
    .join(" · ");
}

function apiVersion() {
  return $("#apiVersion")?.value || DEFAULT_API_VERSION;
}

async function requireTabUrl() {
  if (state.tab?.url && isSalesforceUrl(state.tab.url)) {
    return state.tab.url;
  }
  await refreshOrg();
  if (!state.tab?.url || !isSalesforceUrl(state.tab.url)) {
    throw new Error("Open a logged-in Salesforce tab first.");
  }
  return state.tab.url;
}

/* —— Features —— */

async function onGenSoql() {
  const out = $("#nlSoqlOut");
  const status = $("#nlQueryStatus");
  setStatusMessage(out, "Generating…", "busy");
  setQueryStatus(status, "", "info");
  try {
    const apiMode = nlApiMode();
    let sobjects = await loadNlSObjects(apiMode);
    const result = await generateSoql($("#nlInput").value, { sobjects, apiMode });
    state.lastGenSoql = result.soql;
    state.lastGenApiMode = result.apiMode || apiMode;
    setStatusMessage(
      out,
      `${result.soql}\n\n// source: ${result.source}\n// api: ${state.lastGenApiMode}\n${result.notes
        .map((n) => `// ${n}`)
        .join("\n")}`,
      "ok"
    );
    setQueryStatus(status, "SOQL ready — click Run to execute against your org session.", "ok");
  } catch (e) {
    setStatusMessage(out, e.message, "error");
    setQueryStatus(status, e.message, "error");
  }
}

function nlApiMode() {
  return $("#nlApiMode")?.value === "tooling" ? "tooling" : "rest";
}

async function loadNlSObjects(apiMode) {
  const tooling = apiMode === "tooling";
  if (tooling) {
    if (Array.isArray(state.toolingObjects) && state.toolingObjects.length && typeof state.toolingObjects[0] !== "string") {
      return state.toolingObjects;
    }
  } else if (Array.isArray(state.globalObjects) && state.globalObjects.length && typeof state.globalObjects[0] !== "string") {
    return state.globalObjects;
  }

  const out = $("#nlSoqlOut");
  if (out) out.textContent = tooling ? "Loading Tooling objects…" : "Loading org objects…";
  const res = await send("describeGlobal", {
    tabUrl: await requireTabUrl(),
    apiVersion: apiVersion(),
    tooling
  });
  if (!res.ok) throw new Error(res.error);
  const sobjects = res.result?.sobjects || [];
  if (tooling) state.toolingObjects = sobjects;
  else {
    state.globalObjects = sobjects;
    fillDescribeObjectDatalist(sobjects);
  }
  return sobjects;
}

async function onRunGenSoql() {
  const panel = $("#nlQueryPanel");
  const status = $("#nlQueryStatus");
  if (!state.lastGenSoql) {
    clearQueryResult(panel, status, "nl", "Generate a query first.", "info");
    return;
  }
  clearQueryResult(panel, status, "nl", "Running…", "busy");
  try {
    const tooling = state.lastGenApiMode === "tooling";
    const res = await send(tooling ? "toolingQuery" : "runSoql", {
      tabUrl: await requireTabUrl(),
      query: state.lastGenSoql,
      apiVersion: apiVersion()
    });
    if (!res.ok) throw new Error(res.error);
    renderQueryResult(panel, status, "nl", res.result, state.lastGenSoql, { tooling });
  } catch (e) {
    clearQueryResult(panel, status, "nl", e.message, "error");
  }
}

async function onLoadFlows() {
  $("#flowOut").innerHTML = `<div class="summary-bar">Loading flows…</div>`;
  try {
    const res = await send("listFlows", { tabUrl: await requireTabUrl(), apiVersion: apiVersion() });
    if (!res.ok) throw new Error(res.error);
    const report = analyzeFlow(res.result);
    renderFlowReport(report);
  } catch (e) {
    $("#flowOut").innerHTML = `<div class="finding high"><span class="tag">error</span><strong>${escapeHtml(e.message)}</strong></div>`;
  }
}

function renderFlowReport(report) {
  $("#flowOut").innerHTML =
    `<div class="summary-bar">${escapeHtml(report.summary)}</div>` +
    report.findings
      .map(
        (f) => `<div class="finding ${f.severity}">
      <span class="tag">${f.severity}</span>
      <strong>${escapeHtml(f.rule)} · ${escapeHtml(f.flow)}</strong>
      <p>${escapeHtml(f.detail)}</p>
    </div>`
      )
      .join("");
}

function renderGovernor(report) {
  const meters = report.estimates
    .map(
      (e) => `<div class="finding ${e.risk}">
      <div class="meter ${e.risk}"><span>${escapeHtml(e.name)}</span>
      <div class="bar"><i style="width:${e.pct}%"></i></div>
      <span>${e.used}/${e.max}</span></div>
    </div>`
    )
    .join("");
  const risks = report.risks
    .map((r) => `<div class="finding ${r.level}"><span class="tag">${r.level}</span><p>${escapeHtml(r.msg)}</p></div>`)
    .join("");
  const advice = `<div class="finding info"><strong>Advice</strong><ul>${report.advice
    .map((a) => `<li>${escapeHtml(a)}</li>`)
    .join("")}</ul></div>`;
  $("#govOut").innerHTML = `<div class="summary-bar">${escapeHtml(report.summary)}</div>${meters}${risks}${advice}`;
}

function renderError(report) {
  const matches = (report.matches || [])
    .map(
      (m) => `<div class="finding high">
      <span class="tag">${escapeHtml(m.id)}</span>
      <strong>${escapeHtml(m.title)}</strong>
      <p>${escapeHtml(m.meaning)}</p>
      <ul>${m.fixes.map((f) => `<li>${escapeHtml(f)}</li>`).join("")}</ul>
    </div>`
    )
    .join("");
  const tips = (report.tips || []).map((t) => `<li>${escapeHtml(t)}</li>`).join("");
  const ai = report.ai
    ? `<div class="finding info"><strong>AI assist</strong><p>${escapeHtml(report.ai)}</p></div>`
    : report.aiError
      ? `<div class="finding medium"><strong>AI</strong><p>${escapeHtml(report.aiError)}</p></div>`
      : "";
  $("#errOut").innerHTML = `<div class="summary-bar">${escapeHtml(report.summary)}</div>${matches}${
    tips ? `<div class="finding info"><ul>${tips}</ul></div>` : ""
  }${ai}`;
}

function renderLog(report) {
  const limits = report.limits
    .map(
      (l) => `<div class="finding ${l.risk}">
      <div class="meter ${l.risk}"><span>${escapeHtml(l.key)}</span>
      <div class="bar"><i style="width:${l.pct}%"></i></div>
      <span>${l.used}/${l.max}</span></div>
    </div>`
    )
    .join("");
  const ex = report.exceptions.length
    ? `<div class="finding high"><strong>Exceptions</strong><ul>${report.exceptions
        .map((e) => `<li><code>${escapeHtml(e)}</code></li>`)
        .join("")}</ul></div>`
    : "";
  const soql = report.soql.length
    ? `<div class="finding info"><strong>SOQL</strong><ul>${report.soql
        .map((s) => `<li><code>${escapeHtml(s)}</code></li>`)
        .join("")}</ul></div>`
    : "";
  const warnings = report.warnings.length
    ? `<div class="finding medium"><strong>Warnings</strong><ul>${report.warnings
        .map((w) => `<li>${escapeHtml(w)}</li>`)
        .join("")}</ul></div>`
    : "";
  $("#logOut").innerHTML = `<div class="summary-bar">${escapeHtml(report.summary)}</div>${limits}${ex}${soql}${warnings}`;
}

async function onBuildFormula() {
  const out = $("#formulaOut");
  out.textContent = "Building…";
  try {
    const result = await buildFormula($("#formulaInput").value);
    state.lastFormula = result.formula;
    out.textContent = `${result.formula}\n\n// source: ${result.source}\n${result.notes.map((n) => `// ${n}`).join("\n")}`;
  } catch (e) {
    out.textContent = e.message;
  }
}

function renderFormulaHelpers() {
  $("#formulaHelpers").innerHTML = FORMULA_HELPERS.map(
    (h) => `<div><code>${escapeHtml(h.fn)}</code> — ${escapeHtml(h.desc)}</div>`
  ).join("");
}

async function loadDeployChecklist() {
  const data = await chrome.storage.sync.get({ deployChecklist: [] });
  state.deployChecked = data.deployChecklist || [];
  renderDeployChecklist();
}

function renderDeployChecklist() {
  const root = $("#deployChecklist");
  root.innerHTML = DEPLOY_CHECKLIST.map((c) => {
    const checked = state.deployChecked.includes(c.id) ? "checked" : "";
    return `<label><input type="checkbox" data-check="${c.id}" ${checked} /> <span>${escapeHtml(c.label)} <em style="color:var(--muted)">(${c.severity})</em></span></label>`;
  }).join("");
  root.querySelectorAll("input[data-check]").forEach((input) => {
    input.addEventListener("change", async () => {
      const id = input.getAttribute("data-check");
      if (input.checked) state.deployChecked.push(id);
      else state.deployChecked = state.deployChecked.filter((x) => x !== id);
      state.deployChecked = [...new Set(state.deployChecked)];
      await chrome.storage.sync.set({ deployChecklist: state.deployChecked });
    });
  });
}

async function refreshDeploySignals() {
  $("#deploySignals").textContent = "Checking org…";
  try {
    const tabUrl = await requireTabUrl();
    const [cov, fails] = await Promise.all([
      send("getApexCoverage", { tabUrl, apiVersion: apiVersion() }),
      send("getRecentDeployFailures", { tabUrl, apiVersion: apiVersion() })
    ]);
    state.deploySignals = {
      coveragePercent: cov.ok ? cov.result.coveragePercent : null,
      recentDeployFailures: fails.ok ? fails.result.count : 0,
      isProduction: state.org ? !state.org.isSandbox && !state.org.isDevEd : false,
      coverageError: cov.ok ? cov.result.error : cov.error
    };
    const parts = [];
    if (state.deploySignals.coveragePercent != null) {
      parts.push(`Coverage ~${state.deploySignals.coveragePercent}%`);
    } else {
      parts.push(`Coverage unavailable${state.deploySignals.coverageError ? `: ${state.deploySignals.coverageError}` : ""}`);
    }
    parts.push(`Failed deploys: ${state.deploySignals.recentDeployFailures}`);
    const envText = state.org?.isSandbox
      ? "Environment: Sandbox"
      : state.org?.isDevEd
        ? "Environment: Developer Edition"
        : "Environment: Production";
    parts.push(envText);
    $("#deploySignals").textContent = parts.join(" · ");
  } catch (e) {
    $("#deploySignals").textContent = e.message;
  }
}

function assessDeploy() {
  const report = assessDeploymentReadiness(state.deployChecked, state.deploySignals);
  const findings = report.findings
    .map(
      (f) => `<div class="finding ${f.severity}"><span class="tag">${f.severity}</span><strong>${escapeHtml(f.title)}</strong><p>${escapeHtml(f.detail)}</p></div>`
    )
    .join("");
  $("#deployOut").innerHTML = `<div class="summary-bar">${escapeHtml(report.summary)}</div>${findings}`;
}

async function onInvestigatePerms() {
  const userKey = $("#permUser").value.trim();
  const objectApiName = $("#permObject").value.trim();
  if (!userKey || !objectApiName) {
    $("#permOut").innerHTML = `<div class="finding medium"><p>User and object API name are required.</p></div>`;
    return;
  }
  if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(objectApiName)) {
    $("#permOut").innerHTML = `<div class="finding high"><p>Invalid object API name.</p></div>`;
    return;
  }
  $("#permOut").innerHTML = `<div class="summary-bar">Investigating…</div>`;
  try {
    const tabUrl = await requireTabUrl();
    const qs = buildPermissionQueries(userKey, objectApiName);
    const userRes = await send("runSoql", { tabUrl, query: qs.user, apiVersion: apiVersion() });
    if (!userRes.ok) throw new Error(userRes.error);
    const user = userRes.result.records?.[0];
    if (!user) throw new Error("User not found");

    const fill = (q) => q.replaceAll("{USER_ID}", user.Id);
    const [assignRes, objRes, fieldRes, describeRes] = await Promise.all([
      send("runSoql", { tabUrl, query: fill(qs.assignments), apiVersion: apiVersion() }),
      send("runSoql", { tabUrl, query: fill(qs.objectPerms), apiVersion: apiVersion() }),
      send("runSoql", { tabUrl, query: fill(qs.fieldPerms), apiVersion: apiVersion() }),
      send("describeSObject", { tabUrl, sobject: objectApiName, apiVersion: apiVersion() })
    ]);

    const report = analyzePermissions({
      user,
      objectApiName,
      objectDescribe: describeRes.ok ? describeRes.result : null,
      objectPerms: objRes.ok ? objRes.result.records || [] : [],
      fieldPerms: fieldRes.ok ? fieldRes.result.records || [] : [],
      assignments: assignRes.ok ? assignRes.result.records || [] : []
    });

    $("#permOut").innerHTML =
      `<div class="summary-bar">${escapeHtml(report.summary)}</div>` +
      report.findings
        .map(
          (f) => `<div class="finding ${f.severity}"><span class="tag">${f.severity}</span><strong>${escapeHtml(f.title)}</strong><p>${escapeHtml(f.detail)}</p></div>`
        )
        .join("");
  } catch (e) {
    $("#permOut").innerHTML = `<div class="finding high"><strong>Error</strong><p>${escapeHtml(e.message)}</p></div>`;
  }
}

async function onReviewApex() {
  $("#apexOut").innerHTML = `<div class="summary-bar">Reviewing…</div>`;
  try {
    const report = await reviewApex($("#apexInput").value);
    const findings = report.findings
      .map(
        (f) => `<div class="finding ${f.severity}">
        <span class="tag">${f.severity}${f.lineHint ? ` · line ${f.lineHint}` : ""}</span>
        <strong>${escapeHtml(f.rule)}</strong>
        <p>${escapeHtml(f.detail)}</p>
      </div>`
      )
      .join("");
    const ai = report.ai
      ? `<div class="finding info"><strong>AI review</strong><p>${escapeHtml(report.ai)}</p></div>`
      : "";
    $("#apexOut").innerHTML = `<div class="summary-bar">${escapeHtml(report.summary)}</div>${findings}${ai}`;
  } catch (e) {
    $("#apexOut").innerHTML = `<div class="finding high"><p>${escapeHtml(e.message)}</p></div>`;
  }
}

async function searchApexClasses(query) {
  const status = $("#apexClassStatus");
  const root = $("#apexClassList");
  if (status) status.textContent = "Loading Apex classes…";
  if (root) root.innerHTML = `<div class="query-empty">Loading…</div>`;
  try {
    await ensureSalesforceSiteAccess();
    const res = await send("listApexClasses", {
      tabUrl: await requireTabUrl(),
      query: query || "",
      apiVersion: apiVersion()
    });
    if (!res.ok) throw new Error(res.error);
    state.apexClassResults = res.result.records || [];
    renderApexClassList();
    if (status) {
      status.textContent = `Loaded ${state.apexClassResults.length} class(es)${query ? ` for “${query}”` : ""}.`;
    }
  } catch (e) {
    state.apexClassResults = [];
    if (root) root.innerHTML = "";
    if (status) status.textContent = e.message;
  }
}

function renderApexClassList() {
  const root = $("#apexClassList");
  if (!root) return;
  root.replaceChildren();
  if (!state.apexClassResults.length) {
    const empty = document.createElement("div");
    empty.className = "query-empty";
    empty.textContent = "No Apex classes found.";
    root.appendChild(empty);
    return;
  }
  for (const row of state.apexClassResults) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "describe-item";
    const ns = row.namespace ? `${row.namespace}.` : "";
    btn.innerHTML = `<strong>${escapeHtml(ns + row.name)}</strong>
      <span>${escapeHtml(row.lastModifiedDate || "")}${row.apiVersion != null ? ` · API ${escapeHtml(String(row.apiVersion))}` : ""}</span>`;
    btn.addEventListener("click", () => loadApexClassForReview(row.id, ns + row.name));
    root.appendChild(btn);
  }
}

async function loadApexClassForReview(id, label) {
  const status = $("#apexClassStatus");
  if (status) status.textContent = `Loading ${label}…`;
  try {
    await ensureSalesforceSiteAccess();
    const res = await send("getApexClassBody", {
      tabUrl: await requireTabUrl(),
      id,
      apiVersion: apiVersion()
    });
    if (!res.ok) throw new Error(res.error);
    $("#apexInput").value = res.result.body || "";
    if (status) status.textContent = `Loaded ${res.result.name} (${(res.result.body || "").length} chars). Click Review.`;
    $("#apexOut").innerHTML = "";
  } catch (e) {
    if (status) status.textContent = e.message;
  }
}

async function loadOrgLimits() {
  const status = $("#orgLimitsStatus");
  const out = $("#orgLimitsOut");
  if (status) status.textContent = "Loading org limits…";
  try {
    await ensureSalesforceSiteAccess();
    const res = await send("getOrgLimits", {
      tabUrl: await requireTabUrl(),
      apiVersion: apiVersion()
    });
    if (!res.ok) throw new Error(res.error);
    state.orgLimits = res.result;
    const summary = summarizeOrgLimits(res.result);
    renderOrgLimits(summary);
    if (status) status.textContent = summary.summary;
  } catch (e) {
    state.orgLimits = null;
    if (out) out.innerHTML = `<div class="finding high"><p>${escapeHtml(e.message)}</p></div>`;
    if (status) status.textContent = e.message;
  }
}

function renderOrgLimits(summary) {
  const out = $("#orgLimitsOut");
  if (!out) return;
  // Show preferred limits first; keep list readable (top 18 by risk then name)
  const rows = [...summary.rows].sort((a, b) => {
    const rank = { critical: 0, high: 1, medium: 2, low: 3 };
    const d = (rank[a.risk] ?? 9) - (rank[b.risk] ?? 9);
    if (d !== 0) return d;
    return a.label.localeCompare(b.label);
  }).slice(0, 18);

  out.innerHTML =
    `<div class="summary-bar">${escapeHtml(summary.summary)}</div>` +
    rows
      .map((r) => {
        const usedLabel =
          r.used != null && r.remaining != null
            ? `${r.used.toLocaleString()} / ${r.max.toLocaleString()} used · ${r.remaining.toLocaleString()} left`
            : `Max ${r.max.toLocaleString()}`;
        const pct = r.pct != null ? `${r.pct}%` : "";
        return `<div class="finding ${r.risk}">
          <div class="meter ${r.risk}"><span>${escapeHtml(r.label)}</span>
          <div class="bar"><i style="width:${Math.min(r.pct || 0, 100)}%"></i></div>
          <span>${escapeHtml(pct)}</span></div>
          <p>${escapeHtml(usedLabel)}</p>
        </div>`;
      })
      .join("");
}

/* —— Describe / Metadata / Package.xml —— */

function fillMetaTypeSelect() {
  const sel = $("#metaType");
  sel.innerHTML = `<option value="">All types</option>`;
  METADATA_SEARCH_TYPES.forEach((t) => {
    const opt = document.createElement("option");
    opt.value = t.id;
    opt.textContent = t.label;
    sel.appendChild(opt);
  });
}

function fillPackageTypeSelect() {
  const sel = $("#packageType");
  sel.innerHTML = "";
  PACKAGE_TYPES.forEach((t) => {
    const opt = document.createElement("option");
    opt.value = t.name;
    opt.textContent = t.label;
    sel.appendChild(opt);
  });
}

async function preloadGlobalObjects() {
  try {
    const res = await send("describeGlobal", { tabUrl: await requireTabUrl(), apiVersion: apiVersion() });
    if (!res.ok) return;
    const sobjects = res.result.sobjects || [];
    state.globalObjects = sobjects;
    fillDescribeObjectDatalist(sobjects);
  } catch {
    /* optional */
  }
}

function fillDescribeObjectDatalist(sobjects) {
  const list = $("#describeObjectList");
  if (!list) return;
  const names = (sobjects || [])
    .map((s) => (typeof s === "string" ? s : s.name))
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));
  list.innerHTML = names
    .slice(0, 500)
    .map((n) => `<option value="${escapeHtml(n)}"></option>`)
    .join("");
}

async function onLoadDescribe() {
  const sobject = $("#describeObjectSearch").value.trim();
  if (!sobject) return;
  if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(sobject)) {
    $("#describeSummary").textContent = "Invalid object API name.";
    return;
  }
  $("#describeSummary").textContent = "Loading describe…";
  $("#describeFields").innerHTML = "";
  $("#describeDetail").innerHTML = "";
  $("#describeDependent").innerHTML = "";
  try {
    const res = await send("describeSObject", {
      tabUrl: await requireTabUrl(),
      sobject,
      apiVersion: apiVersion()
    });
    if (!res.ok) throw new Error(res.error);
    const fields = (res.result.fields || []).map(summarizeField);
    state.describe = res.result;
    state.describeFields = fields;
    $("#describeSummary").textContent = `${res.result.name} · ${fields.length} fields · keyPrefix ${res.result.keyPrefix || "—"}`;
    renderDescribeFields();
    renderDependentPicker(fields);
  } catch (e) {
    $("#describeSummary").textContent = e.message;
  }
}

function renderDescribeFields() {
  const root = $("#describeFields");
  if (!state.describeFields?.length) {
    root.innerHTML = "";
    return;
  }
  const filtered = filterFields(state.describeFields, $("#describeFieldFilter").value);
  root.innerHTML = filtered
    .map((f) => {
      const deps = f.dependentPicklist ? " · dependent" : f.controllerName ? "" : "";
      const refs = f.referenceTo?.length ? ` → ${f.referenceTo.join(",")}` : "";
      return `<button type="button" class="describe-item" data-field="${escapeHtml(f.name)}">
        <strong>${escapeHtml(f.name)}</strong>
        <span>${escapeHtml(f.label)} · ${escapeHtml(f.type)}${escapeHtml(refs)}${deps}</span>
      </button>`;
    })
    .join("");
  root.querySelectorAll(".describe-item").forEach((btn) => {
    btn.addEventListener("click", () => showFieldDetail(btn.getAttribute("data-field")));
  });
}

function showFieldDetail(fieldName) {
  const field = state.describeFields.find((f) => f.name === fieldName);
  if (!field) return;
  const picks = field.picklistValues?.length
    ? `<ul>${field.picklistValues
        .map((p) => `<li><code>${escapeHtml(p.value)}</code> — ${escapeHtml(p.label)}</li>`)
        .join("")}</ul>`
    : "";
  $("#describeDetail").innerHTML = `
    <div class="finding info">
      <div class="row wrap">
        <strong>${escapeHtml(field.name)}</strong>
        <button type="button" class="btn" id="copyFieldApi">Copy API name</button>
      </div>
      <p>${escapeHtml(field.label)} · ${escapeHtml(field.type)} · custom:${field.custom} · nillable:${field.nillable} · create:${field.createable} · update:${field.updateable}</p>
      ${
        field.controllerName
          ? (() => {
              const ctrl = state.describeFields.find((f) => f.name === field.controllerName);
              return `<p>Depends on controlling field: <strong>${escapeHtml(ctrl?.label || field.controllerName)}</strong> <code>${escapeHtml(field.controllerName)}</code></p>`;
            })()
          : ""
      }
      ${field.relationshipName ? `<p>Relationship: <code>${escapeHtml(field.relationshipName)}</code></p>` : ""}
      ${picks}
    </div>`;
  $("#copyFieldApi")?.addEventListener("click", async () => {
    await navigator.clipboard.writeText(field.name);
  });

  if (field.dependentPicklist && field.controllerName) {
    const controller = state.describeFields.find((f) => f.name === field.controllerName);
    if (controller) {
      const pairs = findDependentPairs(state.describeFields || []);
      const idx = pairs.findIndex((p) => p.dependent.name === field.name);
      const pairSel = $("#depPairSelect");
      if (pairSel && idx >= 0) pairSel.value = String(idx);
      renderDependentInteractive(buildDependentMap(controller, field));
    }
  }
}

function fieldDisplayName(field) {
  if (!field) return "";
  const label = field.label || field.name;
  return label === field.name ? field.name : `${label} (${field.name})`;
}

function renderDependentPicker(fields) {
  const pairs = findDependentPairs(fields);
  if (!pairs.length) {
    $("#describeDependent").innerHTML = `<div class="hint">No field dependencies (dependent picklists) on this object.</div>`;
    return;
  }
  $("#describeDependent").innerHTML = `
    <div class="summary-bar">Field dependencies (${pairs.length})</div>
    <p class="hint dep-intro">Shows which dependent picklist options are available for each controlling value — same idea as Setup → Object Manager → Fields → Field Dependencies.</p>
    <label class="label" for="depPairSelect">Dependency</label>
    <select id="depPairSelect" class="select block-select"></select>
    <div id="depInteractive"></div>`;
  const sel = $("#depPairSelect");
  pairs.forEach((p, i) => {
    const opt = document.createElement("option");
    opt.value = String(i);
    opt.textContent = `${fieldDisplayName(p.controller)} → ${fieldDisplayName(p.dependent)}`;
    sel.appendChild(opt);
  });
  const render = () => {
    const pair = pairs[Number(sel.value)];
    renderDependentInteractive(buildDependentMap(pair.controller, pair.dependent));
  };
  sel.addEventListener("change", render);
  render();
}

function renderDependentInteractive(map) {
  const host = $("#depInteractive") || $("#describeDependent");
  if (!map) return;
  const controllerTitle = map.controllerLabel || map.controllerName;
  const dependentTitle = map.dependentLabel || map.dependentName;
  host.innerHTML = `
    <div class="dep-panel">
      <div class="dep-map" aria-label="Controlling and dependent fields">
        <div class="dep-field">
          <span class="dep-role">Controlling field</span>
          <strong>${escapeHtml(controllerTitle)}</strong>
          <code>${escapeHtml(map.controllerName)}</code>
        </div>
        <div class="dep-arrow" aria-hidden="true">→</div>
        <div class="dep-field">
          <span class="dep-role">Dependent field</span>
          <strong>${escapeHtml(dependentTitle)}</strong>
          <code>${escapeHtml(map.dependentName)}</code>
        </div>
      </div>
      <label class="label" for="depControllerValue">When <strong>${escapeHtml(controllerTitle)}</strong> equals</label>
      <select id="depControllerValue" class="select block-select"></select>
      <div id="depValuesOut" class="dep-result"></div>
    </div>`;
  const sel = $("#depControllerValue");
  map.controllerValues.forEach((v) => {
    const opt = document.createElement("option");
    opt.value = v.value;
    opt.textContent = v.label === v.value ? v.label : `${v.label}  ·  ${v.value}`;
    sel.appendChild(opt);
  });
  const paint = () => {
    const vals = map.byController[sel.value] || [];
    const controlling = map.controllerValues.find((v) => v.value === sel.value);
    const controllingLabel = controlling?.label || sel.value;
    const out = $("#depValuesOut");
    if (!vals.length) {
      out.innerHTML = `<p class="dep-empty">No active options on <strong>${escapeHtml(dependentTitle)}</strong> when <strong>${escapeHtml(controllerTitle)}</strong> is <em>${escapeHtml(controllingLabel)}</em>.</p>`;
      return;
    }
    out.innerHTML = `
      <p class="dep-result-title">Then <strong>${escapeHtml(dependentTitle)}</strong> can be one of these <span class="dep-count">${vals.length}</span></p>
      <div class="dep-table-wrap">
        <table class="dep-table">
          <thead>
            <tr>
              <th scope="col">Label (what users see)</th>
              <th scope="col">API value</th>
            </tr>
          </thead>
          <tbody>
            ${vals
              .map(
                (v) => `<tr>
              <td>${escapeHtml(v.label)}</td>
              <td><code>${escapeHtml(v.value)}</code></td>
            </tr>`
              )
              .join("")}
          </tbody>
        </table>
      </div>
      <div class="row wrap dep-actions">
        <button type="button" class="btn" id="copyDepLabels">Copy labels</button>
        <button type="button" class="btn" id="copyDepValues">Copy API values</button>
      </div>`;
    $("#copyDepLabels")?.addEventListener("click", async () => {
      await navigator.clipboard.writeText(vals.map((v) => v.label).join("\n"));
    });
    $("#copyDepValues")?.addEventListener("click", async () => {
      await navigator.clipboard.writeText(vals.map((v) => v.value).join("\n"));
    });
  };
  sel.addEventListener("change", paint);
  paint();
}

async function onSearchMeta() {
  const query = $("#metaQuery").value.trim();
  const typeId = $("#metaType").value || null;
  $("#metaResults").innerHTML = `<div class="summary-bar">Searching…</div>`;
  try {
    const res = await send("searchMetadata", {
      tabUrl: await requireTabUrl(),
      query,
      typeId,
      apiVersion: apiVersion()
    });
    if (!res.ok) throw new Error(res.error);
    const hits = (res.result.results || []).filter((r) => !r.error && r.name);
    const errors = (res.result.results || []).filter((r) => r.error);
    if (!hits.length) {
      $("#metaResults").innerHTML = `<div class="finding medium"><p>No matches.${errors[0] ? " " + escapeHtml(errors[0].typeLabel + ": " + errors[0].error) : ""}</p></div>`;
      return;
    }
    $("#metaResults").innerHTML =
      `<div class="summary-bar">${hits.length} match(es)</div>` +
      hits
        .map(
          (h, i) => `<div class="finding info">
          <strong>${escapeHtml(h.typeLabel)} · ${escapeHtml(h.name)}</strong>
          <p>${h.lastModifiedDate ? escapeHtml(h.lastModifiedDate) : ""}</p>
          <button type="button" class="btn" data-meta-open="${i}">Open in Setup</button>
        </div>`
        )
        .join("");
    $("#metaResults").querySelectorAll("[data-meta-open]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const h = hits[Number(btn.getAttribute("data-meta-open"))];
        const base = lightningBaseFromOrg(state.org) || state.org?.origin;
        const url = h.openPath.startsWith("http") ? h.openPath : `${base}${h.openPath}`;
        await chrome.tabs.create({ url });
      });
    });
  } catch (e) {
    $("#metaResults").innerHTML = `<div class="finding high"><p>${escapeHtml(e.message)}</p></div>`;
  }
}

async function onLoadPackageMembers() {
  const typeName = $("#packageType").value;
  $("#packageMembers").innerHTML = `<div class="hint">Loading…</div>`;
  try {
    const res = await send("listPackageTypeMembers", {
      tabUrl: await requireTabUrl(),
      typeName,
      apiVersion: apiVersion()
    });
    if (!res.ok) throw new Error(res.error);
    state.packageMembersCache = (res.result.members || []).map((m) => ({
      ...m,
      type: res.result.type
    }));
    renderPackageMembers();
    renderPackageSelection();
  } catch (e) {
    $("#packageMembers").innerHTML = `<div class="finding high"><p>${escapeHtml(e.message)}</p></div>`;
  }
}

function renderPackageMembers() {
  const root = $("#packageMembers");
  const q = ($("#packageMemberFilter").value || "").trim().toLowerCase();
  const members = state.packageMembersCache.filter(
    (m) => !q || m.member.toLowerCase().includes(q) || (m.label || "").toLowerCase().includes(q)
  );
  if (!state.packageMembersCache.length) {
    root.innerHTML = `<div class="hint">Load a metadata type to multi-select members.</div>`;
    return;
  }
  root.innerHTML = members
    .map((m) => {
      const checked = state.packageSelections.some((s) => s.type === m.type && s.member === m.member);
      return `<label class="pkg-item"><input type="checkbox" data-type="${escapeHtml(m.type)}" data-member="${escapeHtml(m.member)}" ${checked ? "checked" : ""}/> <span><code>${escapeHtml(m.member)}</code></span></label>`;
    })
    .join("");
  root.querySelectorAll("input[type=checkbox]").forEach((input) => {
    input.addEventListener("change", () => {
      const type = input.getAttribute("data-type");
      const member = input.getAttribute("data-member");
      if (input.checked) {
        if (!state.packageSelections.some((s) => s.type === type && s.member === member)) {
          state.packageSelections.push({ type, member });
        }
      } else {
        state.packageSelections = state.packageSelections.filter(
          (s) => !(s.type === type && s.member === member)
        );
      }
      renderPackageSelection();
    });
  });
}

function renderPackageSelection() {
  const grouped = {};
  for (const s of state.packageSelections) {
    grouped[s.type] = grouped[s.type] || [];
    grouped[s.type].push(s.member);
  }
  const parts = Object.entries(grouped).map(([t, ms]) => `${t}(${ms.length})`);
  $("#packageSelection").textContent = parts.length
    ? `Selected: ${parts.join(", ")}`
    : "Nothing selected yet.";
}

function onGenPackageXml() {
  if (!state.packageSelections.length) {
    $("#packageXmlOut").textContent = "Select at least one member.";
    return;
  }
  state.lastPackageXml = buildPackageXml(state.packageSelections, packageVersion(apiVersion()));
  $("#packageXmlOut").textContent = state.lastPackageXml;
}

async function onLoadInactiveFlows(scanField) {
  $("#flowCleanStatus").textContent = scanField
    ? "Loading inactive versions and scanning metadata for field references…"
    : "Loading inactive flow versions…";
  $("#flowCleanOut").innerHTML = "";
  $("#flowCleanList").innerHTML = `<div class="hint">Loading…</div>`;
  try {
    const needle = buildFieldReferenceHint($("#flowCleanObject").value, $("#flowCleanField").value);
    const res = await send("listInactiveFlowVersions", {
      tabUrl: await requireTabUrl(),
      // Only apply field needle when scanning; otherwise use the list filter box only.
      needle: scanField ? needle : "",
      includeMetadata: Boolean(scanField && needle),
      apiVersion: apiVersion()
    });
    if (!res.ok) throw new Error(res.error);
    state.inactiveFlows = res.result.versions || [];
    state.inactiveFlowSelected = [];
    $("#flowCleanStatus").textContent = `Loaded ${res.result.matched}/${res.result.total} inactive version(s)${
      scanField && needle ? ` · field scan: ${needle}` : ""
    }${res.result.scannedMetadata ? " · metadata scanned" : ""}`;
    renderInactiveFlows();
  } catch (e) {
    $("#flowCleanList").innerHTML = "";
    $("#flowCleanStatus").textContent = e.message;
  }
}

function renderInactiveFlows() {
  const root = $("#flowCleanList");
  const q = ($("#flowCleanFilter").value || "").trim().toLowerCase();
  const rows = state.inactiveFlows.filter((f) => {
    if (!q) return true;
    return [f.label, f.definitionName, f.status, String(f.versionNumber || "")]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(q);
  });
  if (!state.inactiveFlows.length) {
    root.innerHTML = `<div class="hint">No inactive versions loaded.</div>`;
    return;
  }
  root.innerHTML = rows
    .map((f) => {
      const checked = state.inactiveFlowSelected.includes(f.id);
      return `<label class="pkg-item">
        <input type="checkbox" data-flow-id="${escapeHtml(f.id)}" ${checked ? "checked" : ""} ${f.canDelete ? "" : "disabled"} />
        <span><code>v${escapeHtml(String(f.versionNumber ?? "?"))}</code> ${escapeHtml(f.label)}
        <br/><span style="color:var(--muted);font-size:11px">${escapeHtml(f.definitionName || "")} · ${escapeHtml(f.status)} · ${escapeHtml(f.processType || "")}</span></span>
      </label>`;
    })
    .join("");
  root.querySelectorAll("input[data-flow-id]").forEach((input) => {
    input.addEventListener("change", () => {
      const id = input.getAttribute("data-flow-id");
      if (input.checked) {
        if (!state.inactiveFlowSelected.includes(id)) state.inactiveFlowSelected.push(id);
      } else {
        state.inactiveFlowSelected = state.inactiveFlowSelected.filter((x) => x !== id);
      }
      $("#flowCleanStatus").textContent = `Selected ${state.inactiveFlowSelected.length} version(s)`;
    });
  });
}

async function onDeleteInactiveFlows() {
  if (!state.inactiveFlowSelected.length) {
    $("#flowCleanStatus").textContent = "Select at least one inactive version.";
    return;
  }
  const names = state.inactiveFlows
    .filter((f) => state.inactiveFlowSelected.includes(f.id))
    .map((f) => `v${f.versionNumber} ${f.label} (${f.status})`)
    .slice(0, 15);
  const ok = confirm(
    `Delete ${state.inactiveFlowSelected.length} inactive flow version(s)?\n\n${names.join("\n")}${
      state.inactiveFlowSelected.length > 15 ? "\n…" : ""
    }\n\nActive versions are never deleted. This cannot be undone.`
  );
  if (!ok) return;

  $("#flowCleanStatus").textContent = "Deleting…";
  try {
    const res = await send("deleteFlowVersions", {
      tabUrl: await requireTabUrl(),
      ids: state.inactiveFlowSelected,
      apiVersion: apiVersion()
    });
    if (!res.ok) throw new Error(res.error);
    const { deleted, failed, results } = res.result;
    $("#flowCleanOut").innerHTML =
      `<div class="summary-bar">Deleted ${deleted}, failed ${failed}</div>` +
      results
        .map(
          (r) =>
            `<div class="finding ${r.ok ? "info" : "high"}"><span class="tag">${r.ok ? "deleted" : "failed"}</span><p>${escapeHtml(
              r.label || r.id
            )}${r.error ? " — " + escapeHtml(r.error) : ""}</p></div>`
        )
        .join("");
    // refresh list
    await onLoadInactiveFlows(false);
  } catch (e) {
    $("#flowCleanStatus").textContent = e.message;
  }
}

/* —— Utilities (links / soql / ids / favs) —— */

function renderLinks(filter = "") {
  const q = filter.trim().toLowerCase();
  const root = $("#linkList");
  root.innerHTML = "";
  QUICK_LINKS.forEach((group) => {
    const items = group.items.filter((i) => !q || i.label.toLowerCase().includes(q) || i.id.includes(q));
    if (!items.length) return;
    const title = document.createElement("div");
    title.className = "group-title";
    title.textContent = group.group;
    root.appendChild(title);
    items.forEach((item) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "link-item";
      btn.textContent = item.label;
      btn.addEventListener("click", () => openQuickLink(item));
      root.appendChild(btn);
    });
  });
}

async function openQuickLink(item) {
  if (item.external) {
    await chrome.tabs.create({ url: item.path });
    return;
  }
  if (!state.org) {
    alert("Open a Salesforce org tab first.");
    return;
  }
  let url;
  if (item.path.startsWith("http")) url = item.path;
  else if (item.path.startsWith("/_ui/")) url = `${state.session?.apiBase || state.org.apiBase}${item.path}`;
  else {
    const lightningHost = state.org.hostname.includes("lightning.force.com")
      ? state.org.origin
      : state.org.origin.replace(".my.salesforce.com", ".lightning.force.com");
    url = `${lightningHost}${item.path}`;
  }
  if (item.newTab) await chrome.tabs.create({ url });
  else if (state.tab?.id) {
    await chrome.tabs.update(state.tab.id, { url });
    window.close();
  } else await chrome.tabs.create({ url });
}

async function runSoqlManual() {
  const panel = $("#soqlQueryPanel");
  const status = $("#soqlQueryStatus");
  clearQueryResult(panel, status, "soql", "Running…", "busy");
  hideSoqlSuggest();
  try {
    await ensureSalesforceSiteAccess();
    const tooling = soqlApiMode() === "tooling";
    const res = await send(tooling ? "toolingQuery" : "runSoql", {
      tabUrl: await requireTabUrl(),
      query: $("#soqlInput").value,
      apiVersion: apiVersion()
    });
    if (!res.ok) throw new Error(res.error);
    renderQueryResult(panel, status, "soql", res.result, $("#soqlInput").value);
  } catch (e) {
    clearQueryResult(panel, status, "soql", e.message, "error");
  }
}

function soqlApiMode() {
  return $("#soqlApiMode")?.value === "tooling" ? "tooling" : "rest";
}

function bindSoqlAssist() {
  const input = $("#soqlInput");
  const mode = $("#soqlApiMode");
  const obj = $("#soqlObjectHint");
  const loadBtn = $("#soqlLoadFields");
  if (!input || !mode) return;

  mode.addEventListener("change", () => {
    onSoqlApiModeChange().catch((e) => {
      setQueryStatus($("#soqlQueryStatus"), e.message, "error");
    });
  });
  loadBtn?.addEventListener("click", () => {
    ensureSoqlFieldsForActiveObject(true)
      .then(() => refreshSoqlSuggestions())
      .catch((e) => {
        setQueryStatus($("#soqlQueryStatus"), e.message, "error");
      });
  });
  obj?.addEventListener("change", () => {
    const name = (obj.value || "").trim();
    if (!isValidSObjectName(name)) return;
    seedSoqlFromObject(name);
    ensureSoqlFieldsForActiveObject(true)
      .then(() => refreshSoqlSuggestions())
      .catch(() => {});
  });
  obj?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      loadBtn?.click();
    }
  });

  let timer = null;
  const schedule = () => {
    // User is typing again — allow suggestions to reopen.
    state.soqlAssist.suppressSuggest = false;
    clearTimeout(timer);
    clearTimeout(state.soqlAssist.suggestTimer);
    timer = setTimeout(() => {
      refreshSoqlSuggestions();
      ensureSoqlFieldsForActiveObject(false).catch(() => {});
    }, 120);
    state.soqlAssist.suggestTimer = timer;
  };
  input.addEventListener("input", schedule);
  input.addEventListener("click", () => {
    // Click reposition: refresh only if not just closed by a pick.
    if (state.soqlAssist.suppressSuggest) return;
    schedule();
  });
  input.addEventListener("keyup", (e) => {
    if (["ArrowDown", "ArrowUp", "Enter", "Tab", "Escape"].includes(e.key)) return;
    schedule();
  });
  input.addEventListener("keydown", onSoqlSuggestKeydown);
  input.addEventListener("blur", () => {
    setTimeout(() => hideSoqlSuggest(), 150);
  });
  document.addEventListener("click", (e) => {
    if (!e.target.closest?.(".soql-editor")) hideSoqlSuggest();
  });
}

async function onSoqlApiModeChange() {
  state.soqlAssist.mode = soqlApiMode();
  state.soqlAssist.objectNames = [];
  state.soqlAssist.activeObject = null;
  const hint = $("#soqlAssistHint");
  if (hint) {
    hint.textContent =
      state.soqlAssist.mode === "tooling"
        ? "Tooling API — suggestions use tooling objects and fields."
        : "Standard API — suggestions use org objects and fields.";
  }
  const obj = $("#soqlObjectHint");
  if (obj) {
    obj.placeholder =
      state.soqlAssist.mode === "tooling" ? "Object API name" : "Object API name";
  }
  await ensureSoqlObjectList(true);
  await ensureSoqlFieldsForActiveObject(true);
  refreshSoqlSuggestions();
}

async function ensureSoqlObjectList(force = false) {
  const mode = soqlApiMode();
  if (!force && state.soqlAssist.objectNames.length && state.soqlAssist.mode === mode) {
    fillSoqlObjectDatalist();
    return;
  }
  state.soqlAssist.mode = mode;
  try {
    await ensureSalesforceSiteAccess();
    const res = await send("describeGlobal", {
      tabUrl: await requireTabUrl(),
      apiVersion: apiVersion(),
      tooling: mode === "tooling"
    });
    if (!res.ok) throw new Error(res.error);
    const sobjects = res.result?.sobjects || [];
    state.soqlAssist.objectNames = sobjects
      .map((o) => o.name)
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));
    fillSoqlObjectDatalist();
    const status = $("#soqlQueryStatus");
    if (status && !status.textContent) {
      status.textContent = `${state.soqlAssist.objectNames.length} ${mode === "tooling" ? "Tooling" : "standard"} objects available for autocomplete.`;
    }
  } catch (e) {
    /* leave list empty; user can still type */
    fillSoqlObjectDatalist();
    throw e;
  }
}

function fillSoqlObjectDatalist() {
  const list = $("#soqlObjectList");
  if (!list) return;
  list.replaceChildren();
  for (const name of state.soqlAssist.objectNames) {
    const opt = document.createElement("option");
    opt.value = name;
    list.appendChild(opt);
  }
}

function resolveSoqlObjectName() {
  const fromQuery = extractFromObject($("#soqlInput")?.value || "");
  const hint = ($("#soqlObjectHint")?.value || "").trim();
  if (fromQuery && isValidSObjectName(fromQuery)) return fromQuery;
  if (hint && isValidSObjectName(hint)) return hint;
  return null;
}

function fieldCacheKey(objectName) {
  return `${soqlApiMode()}:${objectName}`;
}

async function ensureSoqlFieldsForActiveObject(force = false) {
  const objectName = resolveSoqlObjectName();
  if (!objectName) return null;
  const key = fieldCacheKey(objectName);
  if (!force && state.soqlAssist.fieldsByKey[key]) {
    state.soqlAssist.activeObject = objectName;
    return state.soqlAssist.fieldsByKey[key];
  }
  const seq = ++state.soqlAssist.loadSeq;
  const hintEl = $("#soqlAssistHint");
  if (hintEl) hintEl.textContent = `Loading fields for ${objectName}…`;
  await ensureSalesforceSiteAccess();
  const res = await send("describeSObject", {
    tabUrl: await requireTabUrl(),
    sobject: objectName,
    apiVersion: apiVersion(),
    tooling: soqlApiMode() === "tooling"
  });
  if (!res.ok) throw new Error(res.error);
  if (seq !== state.soqlAssist.loadSeq) return null;
  const fields = (res.result?.fields || []).map((f) => ({
    name: f.name,
    label: f.label,
    type: f.type
  }));
  state.soqlAssist.fieldsByKey[key] = fields;
  state.soqlAssist.activeObject = objectName;
  if ($("#soqlObjectHint") && !$("#soqlObjectHint").value) {
    $("#soqlObjectHint").value = objectName;
  }
  if (hintEl) {
    hintEl.textContent = `${objectName} · ${fields.length} fields available for suggestions.`;
  }
  return fields;
}

function seedSoqlFromObject(objectName) {
  const ta = $("#soqlInput");
  if (!ta) return;
  const current = ta.value.trim();
  if (current) {
    if (!extractFromObject(current)) {
      ta.value = `${current.replace(/\s+$/, "")} FROM ${objectName} LIMIT 100`;
    }
    return;
  }
  ta.value = `SELECT Id,  FROM ${objectName} LIMIT 100`;
  // Place cursor after "SELECT Id, "
  const cursor = "SELECT Id, ".length;
  ta.focus();
  ta.setSelectionRange(cursor, cursor);
}

function refreshSoqlSuggestions() {
  const ta = $("#soqlInput");
  const box = $("#soqlSuggest");
  if (!ta || !box) return;
  if (state.soqlAssist.suppressSuggest) {
    hideSoqlSuggest();
    return;
  }
  const tokenInfo = getTokenAtCursor(ta.value, ta.selectionStart);
  state.soqlAssist.token = tokenInfo;

  if (!tokenInfo.context) {
    hideSoqlSuggest();
    return;
  }

  let items = [];
  if (tokenInfo.context === "select") {
    const objectName = resolveSoqlObjectName();
    const fields = objectName ? state.soqlAssist.fieldsByKey[fieldCacheKey(objectName)] : null;
    if (!fields?.length) {
      hideSoqlSuggest();
      return;
    }
    items = filterApiNames(fields, tokenInfo.token, 40);
  } else if (tokenInfo.context === "from") {
    items = filterApiNames(
      state.soqlAssist.objectNames.map((name) => ({ name, label: "", type: "" })),
      tokenInfo.token,
      40
    );
    // Exact object already chosen — close list
    if (
      tokenInfo.token &&
      state.soqlAssist.objectNames.some((n) => n.toLowerCase() === tokenInfo.token.toLowerCase()) &&
      items.length === 1 &&
      items[0].name.toLowerCase() === tokenInfo.token.toLowerCase()
    ) {
      hideSoqlSuggest();
      return;
    }
  }

  state.soqlAssist.suggestions = items;
  state.soqlAssist.activeIndex = 0;
  if (!items.length) {
    hideSoqlSuggest();
    return;
  }
  renderSoqlSuggest();
}

function renderSoqlSuggest() {
  const box = $("#soqlSuggest");
  if (!box) return;
  const items = state.soqlAssist.suggestions;
  box.replaceChildren();
  items.forEach((item, idx) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `soql-suggest-item${idx === state.soqlAssist.activeIndex ? " active" : ""}`;
    btn.setAttribute("role", "option");
    const strong = document.createElement("strong");
    strong.textContent = item.name;
    const span = document.createElement("span");
    span.textContent = [item.label, item.type].filter(Boolean).join(" · ");
    btn.appendChild(strong);
    if (span.textContent) btn.appendChild(span);
    btn.addEventListener("mousedown", (e) => {
      e.preventDefault();
      applySoqlSuggestion(idx);
    });
    box.appendChild(btn);
  });
  box.classList.remove("hidden");
}

function hideSoqlSuggest() {
  const box = $("#soqlSuggest");
  if (box) {
    box.classList.add("hidden");
    box.replaceChildren();
  }
  state.soqlAssist.suggestions = [];
  state.soqlAssist.activeIndex = 0;
}

function onSoqlSuggestKeydown(e) {
  const open = state.soqlAssist.suggestions.length && !$("#soqlSuggest")?.classList.contains("hidden");
  if (!open) return;
  if (e.key === "ArrowDown") {
    e.preventDefault();
    state.soqlAssist.activeIndex = (state.soqlAssist.activeIndex + 1) % state.soqlAssist.suggestions.length;
    renderSoqlSuggest();
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    state.soqlAssist.activeIndex =
      (state.soqlAssist.activeIndex - 1 + state.soqlAssist.suggestions.length) % state.soqlAssist.suggestions.length;
    renderSoqlSuggest();
  } else if (e.key === "Enter" || e.key === "Tab") {
    e.preventDefault();
    applySoqlSuggestion(state.soqlAssist.activeIndex);
  } else if (e.key === "Escape") {
    e.preventDefault();
    state.soqlAssist.suppressSuggest = true;
    hideSoqlSuggest();
  }
}

function applySoqlSuggestion(index) {
  const ta = $("#soqlInput");
  const item = state.soqlAssist.suggestions[index];
  const tokenInfo = state.soqlAssist.token;
  if (!ta || !item || !tokenInfo) return;
  const appendComma = tokenInfo.context === "select";
  const { text, cursor } = applySuggestion(ta.value, tokenInfo.start, tokenInfo.end, item.name, {
    appendComma
  });
  ta.value = text;
  ta.focus();
  ta.setSelectionRange(cursor, cursor);

  // Close and stay closed until the user types again (do not auto-reopen).
  state.soqlAssist.suppressSuggest = true;
  clearTimeout(state.soqlAssist.suggestTimer);
  hideSoqlSuggest();

  if (tokenInfo.context === "from") {
    if ($("#soqlObjectHint")) $("#soqlObjectHint").value = item.name;
    ensureSoqlFieldsForActiveObject(true).catch(() => {});
  }
}

/** Ask Chrome for Salesforce host access on a user gesture (fixes “Failed to fetch”). */
async function ensureSalesforceSiteAccess() {
  const origins = [
    "https://*.salesforce.com/*",
    "https://*.force.com/*",
    "https://*.cloudforce.com/*",
    "https://*.salesforce-setup.com/*"
  ];
  try {
    const has = await chrome.permissions.contains({ origins });
    if (has) return true;
    const granted = await chrome.permissions.request({ origins });
    if (!granted) {
      throw new Error(
        "Chrome blocked Salesforce access. Open chrome://extensions → OrgKit → Details → Site access → turn ON each Salesforce domain (or “On all sites”), then Reload the extension."
      );
    }
    return true;
  } catch (e) {
    if (/Chrome blocked Salesforce/.test(e.message || "")) throw e;
    return false;
  }
}

function updateIdInfo() {
  const raw = $("#idInput").value.trim();
  const info = $("#idInfo");
  if (!raw) {
    info.textContent = "Paste a Salesforce ID to decode prefix and convert 15 ↔ 18.";
    return;
  }
  const id18 = raw.length === 15 ? to18(raw) : normalizeSfId(raw);
  const id15 = raw.length >= 15 ? raw.slice(0, 15) : raw;
  const type = decodeKeyPrefix(id15);
  if (!id18 && raw.length !== 15 && raw.length !== 18) {
    info.textContent = "Not a valid 15/18 character Salesforce ID.";
    return;
  }
  info.innerHTML = `<div><strong>Type:</strong> ${type || "Unknown"}</div>
    <div><strong>15:</strong> <code>${id15}</code></div>
    <div><strong>18:</strong> <code>${id18 || to18(id15)}</code></div>`;
}

async function openRecord() {
  if (!state.org) return alert("Open a Salesforce org tab first.");
  const id = normalizeSfId($("#idInput").value.trim()) || $("#idInput").value.trim();
  if (!id) return;
  await chrome.tabs.create({ url: buildRecordUrl(state.org, id, true) });
}

async function copyIdLength(len) {
  const raw = $("#idInput").value.trim();
  if (!raw) return;
  const id15 = raw.slice(0, 15);
  await navigator.clipboard.writeText(len === 15 ? id15 : to18(id15));
}

async function scanPageIds() {
  const list = $("#scannedIds");
  list.innerHTML = "";
  if (!state.tab?.id) {
    list.innerHTML = "<li>Open a Salesforce tab first.</li>";
    return;
  }
  try {
    // Declared content script only — no chrome.scripting permission.
    const res = await chrome.tabs.sendMessage(state.tab.id, { type: "orgkitScanIds" });
    const result = Array.isArray(res?.ids) ? res.ids : [];
    if (!result.length) {
      list.innerHTML = "<li>No IDs found on page text.</li>";
      return;
    }
    result.forEach((id) => {
      const li = document.createElement("li");
      li.innerHTML = `<span class="fav-meta"><code>${id}</code> · ${decodeKeyPrefix(id.slice(0, 15)) || "?"}</span>`;
      const open = document.createElement("button");
      open.type = "button";
      open.textContent = "Use";
      open.addEventListener("click", () => {
        $("#idInput").value = id;
        updateIdInfo();
      });
      li.appendChild(open);
      list.appendChild(li);
    });
  } catch (err) {
    list.innerHTML = `<li>Scan failed — refresh the Salesforce tab and retry (${escapeHtml(err.message)})</li>`;
  }
}

async function loadFavorites() {
  const data = await chrome.storage.sync.get({ favorites: [] });
  state.favorites = data.favorites || [];
  renderFavorites();
}

function renderFavorites() {
  const list = $("#favList");
  list.innerHTML = "";
  if (!state.favorites.length) {
    list.innerHTML = "<li class='hint'>No favorites yet.</li>";
    return;
  }
  state.favorites.forEach((fav, index) => {
    const li = document.createElement("li");
    const meta = document.createElement("button");
    meta.type = "button";
    meta.className = "fav-meta";
    meta.textContent = fav.label;
    meta.title = fav.url;
    meta.addEventListener("click", () => chrome.tabs.create({ url: fav.url }));
    const del = document.createElement("button");
    del.type = "button";
    del.textContent = "✕";
    del.addEventListener("click", async () => {
      state.favorites.splice(index, 1);
      await chrome.storage.sync.set({ favorites: state.favorites });
      renderFavorites();
    });
    li.append(meta, del);
    list.appendChild(li);
  });
}

async function addFavorite() {
  const label = $("#favLabel").value.trim();
  let path = $("#favPath").value.trim();
  if (!label || !path) return;
  if (!path.startsWith("http")) {
    if (!state.org) return alert("Full URL required when no Salesforce tab is open.");
    path = path.startsWith("/") ? `${state.org.origin}${path}` : `${state.org.origin}/${path}`;
  }
  state.favorites.unshift({ label, url: path });
  await chrome.storage.sync.set({ favorites: state.favorites.slice(0, 50) });
  $("#favLabel").value = "";
  $("#favPath").value = "";
  renderFavorites();
}

async function saveCurrentPage() {
  if (!state.tab?.url) return;
  const label = state.tab.title?.replace(/\s*~\s*Salesforce.*$/i, "").trim() || "Current page";
  state.favorites.unshift({ label, url: state.tab.url });
  await chrome.storage.sync.set({ favorites: state.favorites.slice(0, 50) });
  renderFavorites();
  showView("favs");
}

function send(type, payload = {}) {
  return chrome.runtime.sendMessage({ type, ...payload });
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
