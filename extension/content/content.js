(() => {
  if (window.__SF_DEV_TOOLKIT__) return;
  window.__SF_DEV_TOOLKIT__ = true;

  const PREFIXES = {
    "001": "Account",
    "003": "Contact",
    "005": "User",
    "006": "Opportunity",
    "00Q": "Lead",
    "00T": "Task",
    "500": "Case",
    "701": "Campaign",
    "01p": "ApexClass",
    "01q": "ApexTrigger",
    "07L": "ApexLog",
    "0PS": "PermissionSet",
    "800": "Contract"
  };

  const state = {
    showToolbar: true,
    showBadge: true,
    toolbar: null,
    badge: null
  };

  init();

  async function init() {
    const settings = await chrome.storage.sync.get({ showToolbar: true, showBadge: true });
    state.showToolbar = settings.showToolbar;
    state.showBadge = settings.showBadge;

    if (state.showBadge) mountBadge();
    if (state.showToolbar) mountToolbar();

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "sync") return;
      if (changes.showBadge) {
        state.showBadge = changes.showBadge.newValue;
        state.showBadge ? mountBadge() : state.badge?.remove();
      }
      if (changes.showToolbar) {
        state.showToolbar = changes.showToolbar.newValue;
        state.showToolbar ? mountToolbar() : state.toolbar?.remove();
      }
    });

    document.addEventListener("mouseup", onSelectionHint);
  }

  function envInfo() {
    const host = location.hostname.toLowerCase();
    const isSandbox =
      host.includes(".sandbox.") ||
      host.includes("--") ||
      host.startsWith("cs") ||
      host.includes("scratch");
    return {
      host,
      isSandbox,
      label: isSandbox ? "Sandbox" : "Prod"
    };
  }

  function mountBadge() {
    state.badge?.remove();
    const env = envInfo();
    const el = document.createElement("div");
    el.id = "sfdev-org-badge";
    el.className = `sfdev-badge ${env.isSandbox ? "sandbox" : "prod"}`;
    el.title = env.host;
    el.textContent = env.label;
    document.documentElement.appendChild(el);
    state.badge = el;
  }

  function mountToolbar() {
    state.toolbar?.remove();
    const bar = document.createElement("div");
    bar.id = "sfdev-toolbar";
    bar.className = "sfdev-toolbar";
    bar.innerHTML = `
      <button type="button" data-action="setup" title="Setup">Setup</button>
      <button type="button" data-action="objects" title="Object Manager">Objects</button>
      <button type="button" data-action="logs" title="Debug Logs">Logs</button>
      <button type="button" data-action="flows" title="Flows">Flows</button>
      <button type="button" data-action="users" title="Users">Users</button>
      <button type="button" data-action="devconsole" title="Developer Console">Console</button>
      <button type="button" data-action="copy-url" title="Copy page URL">URL</button>
      <button type="button" data-action="hide" title="Hide toolbar">✕</button>
    `;
    bar.addEventListener("click", onToolbarClick);
    document.documentElement.appendChild(bar);
    state.toolbar = bar;
  }

  function lightningBase() {
    if (location.hostname.includes("lightning.force.com")) return location.origin;
    return location.origin.replace(".my.salesforce.com", ".lightning.force.com");
  }

  function apiBase() {
    if (location.hostname.includes("lightning.force.com")) {
      return location.origin.replace(".lightning.force.com", ".my.salesforce.com");
    }
    if (location.hostname.includes("salesforce-setup.com")) {
      return location.origin.replace(".salesforce-setup.com", ".my.salesforce.com");
    }
    return location.origin;
  }

  async function onToolbarClick(e) {
    const btn = e.target.closest("button[data-action]");
    if (!btn) return;
    const action = btn.dataset.action;
    const L = lightningBase();
    const routes = {
      setup: `${L}/lightning/setup/SetupOneHome/home`,
      objects: `${L}/lightning/setup/ObjectManager/home`,
      logs: `${L}/lightning/setup/ApexDebugLogs/home`,
      flows: `${L}/lightning/setup/Flows/home`,
      users: `${L}/lightning/setup/ManageUsers/home`,
      devconsole: `${apiBase()}/_ui/common/apex/debug/ApexCSIPage`
    };

    if (action === "hide") {
      await chrome.storage.sync.set({ showToolbar: false });
      state.toolbar?.remove();
      return;
    }
    if (action === "copy-url") {
      await navigator.clipboard.writeText(location.href);
      flash(btn, "Copied");
      return;
    }
    if (routes[action]) {
      if (action === "devconsole") window.open(routes[action], "_blank");
      else location.href = routes[action];
    }
  }

  function flash(el, text) {
    const prev = el.textContent;
    el.textContent = text;
    setTimeout(() => {
      el.textContent = prev;
    }, 900);
  }

  function onSelectionHint() {
    const sel = window.getSelection()?.toString().trim() || "";
    if (!/^[a-zA-Z0-9]{15}$|^[a-zA-Z0-9]{18}$/.test(sel)) {
      document.getElementById("sfdev-id-tip")?.remove();
      return;
    }
    showIdTip(sel);
  }

  function showIdTip(id) {
    document.getElementById("sfdev-id-tip")?.remove();
    const type = PREFIXES[id.slice(0, 3)] || (id.startsWith("a") ? "Custom" : "Record");
    const tip = document.createElement("div");
    tip.id = "sfdev-id-tip";
    tip.className = "sfdev-id-tip";
    tip.innerHTML = `
      <strong>${type}</strong>
      <code>${id}</code>
      <button type="button" data-act="open">Open</button>
      <button type="button" data-act="copy">Copy</button>
    `;
    tip.addEventListener("click", async (e) => {
      const act = e.target.getAttribute("data-act");
      if (act === "open") window.open(`${location.origin}/${id}`, "_blank");
      if (act === "copy") await navigator.clipboard.writeText(id);
    });
    document.documentElement.appendChild(tip);
    setTimeout(() => tip.remove(), 6000);
  }
})();
