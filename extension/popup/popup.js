import { QUICK_LINKS, decodeKeyPrefix } from "../lib/quick-links.js";
import {
  isSalesforceUrl,
  parseOrgFromUrl,
  normalizeSfId,
  to18,
  buildRecordUrl,
  DEFAULT_API_VERSION
} from "../lib/salesforce.js";

const state = {
  tab: null,
  org: null,
  session: null,
  favorites: [],
  lastSoqlJson: ""
};

const $ = (sel) => document.querySelector(sel);

init();

async function init() {
  bindTabs();
  bindActions();
  fillApiVersions();
  renderLinks();
  await loadSettings();
  await loadFavorites();
  await refreshOrg();
}

async function loadSettings() {
  const data = await chrome.storage.sync.get({ apiVersion: DEFAULT_API_VERSION });
  if (data.apiVersion) $("#apiVersion").value = data.apiVersion;
}

function bindTabs() {
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
      document.querySelectorAll(".panel").forEach((p) => p.classList.remove("active"));
      tab.classList.add("active");
      $(`#panel-${tab.dataset.tab}`).classList.add("active");
    });
  });
}

function bindActions() {
  $("#openOptions").addEventListener("click", () => chrome.runtime.openOptionsPage());
  $("#linkSearch").addEventListener("input", () => renderLinks($("#linkSearch").value));
  $("#runSoql").addEventListener("click", runSoql);
  $("#copySoqlResult").addEventListener("click", async () => {
    if (!state.lastSoqlJson) return;
    await navigator.clipboard.writeText(state.lastSoqlJson);
    toastResult("Copied.");
  });
  $("#idInput").addEventListener("input", updateIdInfo);
  $("#openRecord").addEventListener("click", openRecord);
  $("#copy15").addEventListener("click", () => copyIdLength(15));
  $("#copy18").addEventListener("click", () => copyIdLength(18));
  $("#scanPageIds").addEventListener("click", scanPageIds);
  $("#addFav").addEventListener("click", addFavorite);
  $("#saveCurrent").addEventListener("click", saveCurrentPage);
  $("#openDevConsole").addEventListener("click", openDevConsole);
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
    meta.textContent = "Quick links and SOQL need an active Salesforce session.";
    return;
  }

  banner.classList.remove("muted");
  pill.textContent = org.envLabel;
  pill.className = `pill ${org.isSandbox ? "sandbox" : "prod"}`;
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
  if (item.path.startsWith("http")) {
    url = item.path;
  } else if (item.path.startsWith("/_ui/") || item.classic?.startsWith("/_ui/")) {
    url = `${state.session?.apiBase || state.org.apiBase}${item.path}`;
  } else {
    const lightningHost = state.org.hostname.includes("lightning.force.com")
      ? state.org.origin
      : state.org.origin.replace(".my.salesforce.com", ".lightning.force.com");
    url = `${lightningHost}${item.path}`;
  }

  if (item.newTab) {
    await chrome.tabs.create({ url });
  } else if (state.tab?.id) {
    await chrome.tabs.update(state.tab.id, { url });
    window.close();
  } else {
    await chrome.tabs.create({ url });
  }
}

async function runSoql() {
  if (!state.tab?.url || !isSalesforceUrl(state.tab.url)) {
    toastResult("Open a Salesforce tab first.");
    return;
  }
  const query = $("#soqlInput").value;
  toastResult("Running…");
  const res = await send("runSoql", {
    tabUrl: state.tab.url,
    query,
    apiVersion: $("#apiVersion").value
  });
  if (!res.ok) {
    toastResult(`Error: ${res.error}`);
    state.lastSoqlJson = "";
    return;
  }
  state.lastSoqlJson = JSON.stringify(res.result, null, 2);
  toastResult(state.lastSoqlJson);
}

function toastResult(text) {
  $("#soqlResult").textContent = text;
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
  info.innerHTML = `
    <div><strong>Type:</strong> ${type || "Unknown"}</div>
    <div><strong>15:</strong> <code>${id15}</code></div>
    <div><strong>18:</strong> <code>${id18 || to18(id15)}</code></div>
  `;
}

async function openRecord() {
  if (!state.org) {
    alert("Open a Salesforce org tab first.");
    return;
  }
  const id = normalizeSfId($("#idInput").value.trim()) || $("#idInput").value.trim();
  if (!id) return;
  const url = buildRecordUrl(state.org, id, true);
  await chrome.tabs.create({ url });
}

async function copyIdLength(len) {
  const raw = $("#idInput").value.trim();
  if (!raw) return;
  const id15 = raw.slice(0, 15);
  const value = len === 15 ? id15 : to18(id15);
  await navigator.clipboard.writeText(value);
  updateIdInfo();
}

async function scanPageIds() {
  const list = $("#scannedIds");
  list.innerHTML = "";
  if (!state.tab?.id) return;

  try {
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: state.tab.id },
      func: () => {
        const re = /\b([a-zA-Z0-9]{15}|[a-zA-Z0-9]{18})\b/g;
        const text = document.body?.innerText || "";
        const found = new Set();
        let m;
        while ((m = re.exec(text)) !== null) {
          const id = m[1];
          if (/[0-9]/.test(id.slice(0, 3)) || /^[a-zA-Z][0-9]/.test(id)) found.add(id);
        }
        return [...found].slice(0, 40);
      }
    });

    if (!result?.length) {
      list.innerHTML = "<li>No IDs found on page text.</li>";
      return;
    }

    result.forEach((id) => {
      const li = document.createElement("li");
      const type = decodeKeyPrefix(id.slice(0, 15));
      li.innerHTML = `<span class="fav-meta"><code>${id}</code> · ${type || "?"}</span>`;
      const open = document.createElement("button");
      open.type = "button";
      open.textContent = "Use";
      open.addEventListener("click", () => {
        $("#idInput").value = id;
        updateIdInfo();
        document.querySelector('.tab[data-tab="ids"]').click();
      });
      li.appendChild(open);
      list.appendChild(li);
    });
  } catch (err) {
    list.innerHTML = `<li>Scan failed: ${err.message}</li>`;
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
    meta.addEventListener("click", async () => {
      await chrome.tabs.create({ url: fav.url });
    });
    const del = document.createElement("button");
    del.type = "button";
    del.textContent = "✕";
    del.title = "Remove";
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
    if (!state.org) {
      alert("Full URL required when no Salesforce tab is open.");
      return;
    }
    path = path.startsWith("/")
      ? `${state.org.origin}${path}`
      : `${state.org.origin}/${path}`;
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
  document.querySelector('.tab[data-tab="favs"]').click();
}

async function openDevConsole() {
  if (!state.org) {
    alert("Open a Salesforce org tab first.");
    return;
  }
  const base = state.session?.apiBase || state.org.apiBase;
  await chrome.tabs.create({ url: `${base}/_ui/common/apex/debug/ApexCSIPage` });
}

function send(type, payload = {}) {
  return chrome.runtime.sendMessage({ type, ...payload });
}

updateIdInfo();
