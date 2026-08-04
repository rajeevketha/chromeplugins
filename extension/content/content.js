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

  const EDGE = {
    /** Prefer slightly below mid — many Salesforce edge tools sit near center. */
    preferredRatio: 0.58,
    gap: 12,
    sampleStep: 10,
    maxTabWidth: 120,
    edgePad: 64,
    margin: 12,
    sampleOffsets: [8, 18, 28, 40, 54]
  };

  const state = {
    showLauncher: true,
    showBadge: true,
    minimized: false,
    launcher: null,
    panel: null,
    restoreTab: null,
    badge: null,
    open: false,
    edgeTopPx: null,
    edgeWatch: null,
    edgeResizeTimer: 0,
    edgeMutTimer: 0
  };

  init();

  async function init() {
    const settings = await chrome.storage.sync.get({
      showToolbar: true,
      showBadge: true,
      launcherMinimized: false
    });
    state.showLauncher = settings.showToolbar !== false;
    state.showBadge = settings.showBadge !== false;
    state.minimized = settings.launcherMinimized === true;

    if (state.showBadge) mountBadge();
    if (state.showLauncher) mountLauncher();
    startEdgeWatch();

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "sync") return;
      if (changes.showBadge) {
        state.showBadge = changes.showBadge.newValue !== false;
        state.showBadge ? mountBadge() : state.badge?.remove();
      }
      if (changes.launcherMinimized) {
        state.minimized = changes.launcherMinimized.newValue === true;
        if (state.showLauncher) mountLauncher();
      }
      if (changes.showToolbar) {
        state.showLauncher = changes.showToolbar.newValue !== false;
        if (state.showLauncher) mountLauncher();
        else clearLauncher();
      }
    });

    document.addEventListener("mouseup", onSelectionHint);

    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message?.type !== "orgkitScanIds") return;
      try {
        sendResponse({ ok: true, ids: scanPageForIds() });
      } catch (err) {
        sendResponse({ ok: false, error: String(err?.message || err) });
      }
      return true;
    });
  }

  function scanPageForIds() {
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

  function clearLauncher() {
    state.launcher?.remove();
    state.panel?.remove();
    state.restoreTab?.remove();
    state.launcher = null;
    state.panel = null;
    state.restoreTab = null;
    state.open = false;
  }

  function isOrgKitEdgeNode(el) {
    if (!el || el.nodeType !== 1) return false;
    const id = el.id || "";
    return (
      id === "orgkit-side-tab" ||
      id === "orgkit-side-panel" ||
      id === "orgkit-restore-tab" ||
      id === "orgkit-badge" ||
      id === "orgkit-id-tip"
    );
  }

  function looksLikeEdgeTab(el, vw) {
    const style = window.getComputedStyle(el);
    if (style.position !== "fixed" && style.position !== "sticky") return null;
    if (style.visibility === "hidden" || style.display === "none") return null;
    if (Number(style.opacity) === 0) return null;
    const rect = el.getBoundingClientRect();
    if (rect.height < 20 || rect.width < 6 || rect.width > EDGE.maxTabWidth) return null;
    if (rect.right < vw - EDGE.edgePad) return null;
    if (rect.left < vw - EDGE.maxTabWidth - 48) return null;
    return rect;
  }

  /** Other extensions often park slim fixed tabs on the right edge — find their Y ranges. */
  function collectRightEdgeOccupancy(excludeEl) {
    const vh = window.innerHeight || 800;
    const vw = window.innerWidth || 1200;
    const ranges = [];
    const seen = new Set();

    for (const offset of EDGE.sampleOffsets) {
      const x = Math.max(0, vw - offset);
      for (let y = 0; y < vh; y += EDGE.sampleStep) {
        let els;
        try {
          els = document.elementsFromPoint(x, y);
        } catch {
          continue;
        }
        for (const el of els) {
          if (!el || el === document.documentElement || el === document.body) continue;
          if (el === excludeEl || isOrgKitEdgeNode(el) || excludeEl?.contains?.(el)) continue;
          if (seen.has(el)) continue;
          const rect = looksLikeEdgeTab(el, vw);
          if (!rect) continue;
          seen.add(el);
          ranges.push({
            top: rect.top - EDGE.gap,
            bottom: rect.bottom + EDGE.gap
          });
          break;
        }
      }
    }

    ranges.sort((a, b) => a.top - b.top);
    const merged = [];
    for (const r of ranges) {
      const last = merged[merged.length - 1];
      if (!last || r.top > last.bottom) merged.push({ ...r });
      else last.bottom = Math.max(last.bottom, r.bottom);
    }
    return merged;
  }

  function findFreeEdgeTop(tabHeight) {
    const vh = window.innerHeight || 800;
    const height = Math.max(40, Math.ceil(tabHeight || 88));
    const minTop = EDGE.margin;
    const maxTop = Math.max(minTop, vh - height - EDGE.margin);
    const preferred = Math.round(vh * EDGE.preferredRatio);
    const occupied = collectRightEdgeOccupancy(
      state.launcher || state.restoreTab || state.panel
    );

    const fits = (top) => {
      const bottom = top + height;
      return occupied.every((r) => bottom <= r.top || top >= r.bottom);
    };

    const clamp = (top) => Math.min(maxTop, Math.max(minTop, top));
    let candidate = clamp(preferred);
    if (fits(candidate)) return candidate;

    // Walk down from preferred, then up — keeps OrgKit near mid when possible.
    for (let top = preferred; top <= maxTop; top += 8) {
      const t = clamp(top);
      if (fits(t)) return t;
    }
    for (let top = preferred; top >= minTop; top -= 8) {
      const t = clamp(top);
      if (fits(t)) return t;
    }

    // Last resort: place just below the lowest occupied block, or at bottom.
    if (occupied.length) {
      const below = clamp(Math.ceil(occupied[occupied.length - 1].bottom));
      if (fits(below)) return below;
      const above = clamp(Math.floor(occupied[0].top - height));
      if (fits(above)) return above;
    }
    return clamp(preferred);
  }

  function applyEdgePosition(topPx) {
    const px = `${Math.round(topPx)}px`;
    state.edgeTopPx = Math.round(topPx);
    for (const el of [state.launcher, state.restoreTab, state.panel]) {
      if (!el) continue;
      el.style.setProperty("--orgkit-edge-top", px);
      el.style.top = px;
    }
  }

  function positionEdgeControls() {
    if (!state.showLauncher) return;
    const tab = state.launcher || state.restoreTab;
    if (!tab || !tab.isConnected) return;
    const rect = tab.getBoundingClientRect();
    const height = rect.height > 10 ? rect.height : state.minimized ? 64 : 96;
    // Hide ourselves so hit-testing can see other edge tabs underneath.
    const hide = [tab, state.panel].filter(Boolean);
    for (const el of hide) el.style.visibility = "hidden";
    let top;
    try {
      top = findFreeEdgeTop(height);
    } finally {
      for (const el of hide) el.style.visibility = "";
    }
    if (state.edgeTopPx != null && Math.abs(state.edgeTopPx - top) < 4) return;
    applyEdgePosition(top);
  }

  function startEdgeWatch() {
    if (state.edgeWatch) return;
    const onResize = () => {
      window.clearTimeout(state.edgeResizeTimer);
      state.edgeResizeTimer = window.setTimeout(() => {
        state.edgeTopPx = null;
        positionEdgeControls();
      }, 120);
    };
    window.addEventListener("resize", onResize);

    const obs = new MutationObserver(() => {
      window.clearTimeout(state.edgeMutTimer);
      state.edgeMutTimer = window.setTimeout(() => {
        state.edgeTopPx = null;
        positionEdgeControls();
      }, 200);
    });
    obs.observe(document.documentElement, { childList: true, subtree: false });
    if (document.body) obs.observe(document.body, { childList: true, subtree: false });

    state.edgeWatch = { onResize, obs };
    // Other extensions often inject a moment after us.
    for (const ms of [300, 800, 1600, 3000]) {
      window.setTimeout(() => {
        state.edgeTopPx = null;
        positionEdgeControls();
      }, ms);
    }
  }

  /** Compact right-edge tab (Inspector-style), or a slim Show control when minimized. */
  function mountLauncher() {
    clearLauncher();
    if (!state.showLauncher) return;

    if (state.minimized) {
      mountRestoreTab();
      return;
    }

    const tab = document.createElement("button");
    tab.type = "button";
    tab.id = "orgkit-side-tab";
    tab.className = "orgkit-side-tab";
    tab.title = "OrgKit quick links";
    tab.setAttribute("aria-label", "Open OrgKit quick links");
    tab.setAttribute("aria-expanded", "false");
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
      <button type="button" data-action="minimize" class="orgkit-muted">Hide</button>
    `;
    panel.addEventListener("click", onPanelClick);

    document.documentElement.appendChild(tab);
    document.documentElement.appendChild(panel);
    state.launcher = tab;
    state.panel = panel;
    state.open = false;
    state.edgeTopPx = null;
    positionEdgeControls();
  }

  function mountRestoreTab() {
    state.restoreTab?.remove();
    const tab = document.createElement("button");
    tab.type = "button";
    tab.id = "orgkit-restore-tab";
    tab.className = "orgkit-side-tab orgkit-restore-tab";
    tab.title = "Show OrgKit quick links";
    tab.setAttribute("aria-label", "Show OrgKit quick links");
    tab.innerHTML = `<span>Show</span>`;
    tab.addEventListener("click", () => setMinimized(false));
    document.documentElement.appendChild(tab);
    state.restoreTab = tab;
    state.edgeTopPx = null;
    positionEdgeControls();
  }

  async function setMinimized(minimized) {
    state.minimized = !!minimized;
    state.open = false;
    try {
      await chrome.storage.sync.set({ launcherMinimized: state.minimized });
    } catch {
      // Still update the page even if storage write fails.
    }
    mountLauncher();
  }

  function togglePanel(force) {
    state.open = typeof force === "boolean" ? force : !state.open;
    if (state.panel) state.panel.hidden = !state.open;
    if (state.launcher) {
      state.launcher.classList.toggle("is-open", state.open);
      state.launcher.setAttribute("aria-expanded", state.open ? "true" : "false");
    }
  }

  function lightningBase() {
    if (location.hostname.includes("lightning.force.com")) return location.origin;
    if (location.hostname.includes("salesforce-setup.com")) {
      return location.origin.replace(".my.salesforce-setup.com", ".lightning.force.com");
    }
    return location.origin.replace(".my.salesforce.com", ".lightning.force.com");
  }

  function apiBase() {
    const host = location.hostname.toLowerCase();
    if (host.endsWith(".my.salesforce.com")) return location.origin;
    if (host.endsWith(".lightning.force.com")) {
      return location.origin.replace(".lightning.force.com", ".my.salesforce.com");
    }
    if (host.endsWith(".my.salesforce-setup.com")) {
      return location.origin.replace(".my.salesforce-setup.com", ".my.salesforce.com");
    }
    if (host.endsWith(".salesforce-setup.com")) {
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

    if (action === "minimize") {
      await setMinimized(true);
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
        window.open(chrome.runtime.getURL("app/index.html"), "_blank", "noopener");
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
