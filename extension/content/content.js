(() => {
  if (window.__ORGKIT_CONTENT__) return;
  window.__ORGKIT_CONTENT__ = true;

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
    showLauncher: true,
    showBadge: true,
    launcher: null,
    panel: null,
    badge: null,
    open: false
  };

  init();

  async function init() {
    const settings = await chrome.storage.sync.get({ showToolbar: true, showBadge: true });
    state.showLauncher = settings.showToolbar !== false;
    state.showBadge = settings.showBadge !== false;

    if (state.showBadge) mountBadge();
    if (state.showLauncher) mountLauncher();

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "sync") return;
      if (changes.showBadge) {
        state.showBadge = changes.showBadge.newValue !== false;
        state.showBadge ? mountBadge() : state.badge?.remove();
      }
      if (changes.showToolbar) {
        state.showLauncher = changes.showToolbar.newValue !== false;
        if (state.showLauncher) mountLauncher();
        else {
          state.launcher?.remove();
          state.panel?.remove();
          state.launcher = null;
          state.panel = null;
        }
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
    const isDevEd = host.includes("-dev-ed.") || host.includes("develop.my.salesforce.com");
    return {
      host,
      isSandbox,
      isDevEd,
      label: isSandbox ? "Sandbox" : isDevEd ? "Dev Ed" : "Prod"
    };
  }

  function mountBadge() {
    state.badge?.remove();
    const env = envInfo();
    const el = document.createElement("div");
    el.id = "orgkit-badge";
    el.className = `orgkit-badge ${env.isSandbox ? "sandbox" : env.isDevEd ? "deved" : "prod"}`;
    el.title = env.host;
    el.textContent = env.label;
    document.documentElement.appendChild(el);
    state.badge = el;
  }

  /** Compact right-edge tab (Inspector-style), not a wide bottom bar. */
  function mountLauncher() {
    state.launcher?.remove();
    state.panel?.remove();

    const tab = document.createElement("button");
    tab.type = "button";
    tab.id = "orgkit-side-tab";
    tab.className = "orgkit-side-tab";
    tab.title = "OrgKit";
    tab.setAttribute("aria-label", "Open OrgKit menu");
    tab.innerHTML = `<span>OrgKit</span>`;
    tab.addEventListener("click", () => togglePanel());

    const panel = document.createElement("div");
    panel.id = "orgkit-side-panel";
    panel.className = "orgkit-side-panel";
    panel.hidden = true;
    panel.innerHTML = `
      <button type="button" data-action="orgkit">Open OrgKit</button>
      <button type="button" data-action="setup">Setup</button>
      <button type="button" data-action="objects">Objects</button>
      <button type="button" data-action="logs">Logs</button>
      <button type="button" data-action="flows">Flows</button>
      <button type="button" data-action="console">Console</button>
      <button type="button" data-action="hide" class="orgkit-muted">Hide tab</button>
    `;
    panel.addEventListener("click", onPanelClick);

    document.documentElement.appendChild(tab);
    document.documentElement.appendChild(panel);
    state.launcher = tab;
    state.panel = panel;
    state.open = false;
  }

  function togglePanel(force) {
    state.open = typeof force === "boolean" ? force : !state.open;
    if (state.panel) state.panel.hidden = !state.open;
    if (state.launcher) state.launcher.classList.toggle("is-open", state.open);
  }

  function lightningBase() {
    if (location.hostname.includes("lightning.force.com")) return location.origin;
    if (location.hostname.includes("salesforce-setup.com")) {
      return location.origin.replace(".my.salesforce-setup.com", ".lightning.force.com");
    }
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

  async function onPanelClick(e) {
    const btn = e.target.closest("button[data-action]");
    if (!btn) return;
    const action = btn.dataset.action;
    const L = lightningBase();
    const routes = {
      setup: `${L}/lightning/setup/SetupOneHome/home`,
      objects: `${L}/lightning/setup/ObjectManager/home`,
      logs: `${L}/lightning/setup/ApexDebugLogs/home`,
      flows: `${L}/lightning/setup/Flows/home`,
      console: `${apiBase()}/_ui/common/apex/debug/ApexCSIPage`
    };

    if (action === "hide") {
      await chrome.storage.sync.set({ showToolbar: false });
      state.launcher?.remove();
      state.panel?.remove();
      return;
    }
    if (action === "orgkit") {
      await openOrgKit();
      togglePanel(false);
      return;
    }
    if (routes[action]) {
      if (action === "console") window.open(routes[action], "_blank");
      else location.href = routes[action];
      togglePanel(false);
    }
  }

  async function openOrgKit() {
    try {
      const res = await chrome.runtime.sendMessage({ type: "openOrgKit" });
      if (res?.ok === false) throw new Error(res.error || "Could not open OrgKit");
    } catch (err) {
      // Fallback when service worker is asleep / message fails
      try {
        window.open(chrome.runtime.getURL("popup/popup.html"), "_blank", "noopener");
      } catch {
        console.warn("OrgKit open failed", err);
      }
    }
  }

  function onSelectionHint() {
    const sel = window.getSelection()?.toString().trim() || "";
    if (!/^[a-zA-Z0-9]{15}$|^[a-zA-Z0-9]{18}$/.test(sel)) {
      document.getElementById("orgkit-id-tip")?.remove();
      return;
    }
    showIdTip(sel);
  }

  function showIdTip(id) {
    document.getElementById("orgkit-id-tip")?.remove();
    const type = PREFIXES[id.slice(0, 3)] || (id.startsWith("a") ? "Custom" : "Record");
    const tip = document.createElement("div");
    tip.id = "orgkit-id-tip";
    tip.className = "orgkit-id-tip";
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
