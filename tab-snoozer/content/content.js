(() => {
  if (window.__TAB_SNOOZER_CONTENT__) return;
  window.__TAB_SNOOZER_CONTENT__ = true;

  // Prefer slightly above mid so we usually sit above OrgKit (≈58%) and similar tools.
  const EDGE = {
    preferredRatio: 0.42,
    gap: 10,
    sampleStep: 14,
    maxTabWidth: 96,
    edgePad: 18,
    margin: 12
  };

  const state = {
    showLauncher: true,
    minimized: false,
    launcher: null,
    panel: null,
    restoreTab: null,
    open: false,
    edgeTopPx: null,
    edgeWatch: null,
    edgeResizeTimer: 0,
    edgeMutTimer: 0
  };

  init();

  async function init() {
    const settings = await chrome.storage.local.get({
      showPageLauncher: true,
      launcherMinimized: false
    });
    state.showLauncher = settings.showPageLauncher !== false;
    state.minimized = settings.launcherMinimized === true;

    if (state.showLauncher) mountLauncher();
    startEdgeWatch();

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local") return;
      if (changes.showPageLauncher) {
        state.showLauncher = changes.showPageLauncher.newValue !== false;
        if (state.showLauncher) mountLauncher();
        else clearLauncher();
      }
      if (changes.launcherMinimized) {
        state.minimized = changes.launcherMinimized.newValue === true;
        if (state.showLauncher) mountLauncher();
      }
    });
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

  function isTabSnoozerEdgeNode(el) {
    if (!el || el.nodeType !== 1) return false;
    const id = el.id || "";
    return (
      id === "tabsnoozer-side-tab" ||
      id === "tabsnoozer-side-panel" ||
      id === "tabsnoozer-restore-tab"
    );
  }

  /** Other extensions often park slim fixed tabs on the right edge — find their Y ranges. */
  function collectRightEdgeOccupancy(excludeEl) {
    const vh = window.innerHeight || 800;
    const vw = window.innerWidth || 1200;
    const x = Math.max(0, vw - 3);
    const ranges = [];
    const seen = new Set();

    for (let y = 0; y < vh; y += EDGE.sampleStep) {
      let els;
      try {
        els = document.elementsFromPoint(x, y);
      } catch {
        continue;
      }
      for (const el of els) {
        if (!el || el === document.documentElement || el === document.body) continue;
        if (el === excludeEl || isTabSnoozerEdgeNode(el) || excludeEl?.contains?.(el)) continue;
        if (seen.has(el)) continue;
        const style = window.getComputedStyle(el);
        if (style.position !== "fixed" && style.position !== "sticky") continue;
        if (style.visibility === "hidden" || style.display === "none") continue;
        const rect = el.getBoundingClientRect();
        if (rect.height < 24 || rect.width < 8 || rect.width > EDGE.maxTabWidth) continue;
        if (rect.right < vw - EDGE.edgePad) continue;
        if (rect.left < vw - EDGE.maxTabWidth - 24) continue;
        seen.add(el);
        ranges.push({
          top: rect.top - EDGE.gap,
          bottom: rect.bottom + EDGE.gap
        });
        break;
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

    // Walk down from preferred, then up — keep near preferred when possible.
    for (let top = preferred; top <= maxTop; top += 8) {
      const t = clamp(top);
      if (fits(t)) return t;
    }
    for (let top = preferred; top >= minTop; top -= 8) {
      const t = clamp(top);
      if (fits(t)) return t;
    }

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
      el.style.setProperty("--ts-edge-top", px);
      el.style.top = px;
    }
  }

  function positionEdgeControls() {
    if (!state.showLauncher) return;
    const tab = state.launcher || state.restoreTab;
    if (!tab || !tab.isConnected) return;
    const rect = tab.getBoundingClientRect();
    const height = rect.height > 10 ? rect.height : state.minimized ? 64 : 96;
    const top = findFreeEdgeTop(height);
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
    window.setTimeout(() => {
      state.edgeTopPx = null;
      positionEdgeControls();
    }, 400);
    window.setTimeout(() => {
      state.edgeTopPx = null;
      positionEdgeControls();
    }, 1500);
  }

  function mountLauncher() {
    clearLauncher();
    if (!state.showLauncher) return;

    if (state.minimized) {
      mountRestoreTab();
      return;
    }

    const tab = document.createElement("button");
    tab.type = "button";
    tab.id = "tabsnoozer-side-tab";
    tab.className = "tabsnoozer-side-tab";
    tab.title = "Tab Snoozer quick access";
    tab.setAttribute("aria-label", "Open Tab Snoozer quick access");
    tab.setAttribute("aria-expanded", "false");
    tab.innerHTML = `<span>Snooze</span>`;
    tab.addEventListener("click", () => togglePanel());

    const panel = document.createElement("div");
    panel.id = "tabsnoozer-side-panel";
    panel.className = "tabsnoozer-side-panel";
    panel.hidden = true;
    panel.innerHTML = `
      <p class="tabsnoozer-panel-title">Snooze this tab</p>
      <button type="button" data-preset="1h">1 hour</button>
      <button type="button" data-preset="tonight">Tonight</button>
      <button type="button" data-preset="tomorrow">Tomorrow morning</button>
      <p class="tabsnoozer-panel-error" data-role="error"></p>
      <button type="button" class="tabsnoozer-muted" data-action="minimize">Hide</button>
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
    tab.id = "tabsnoozer-restore-tab";
    tab.className = "tabsnoozer-side-tab tabsnoozer-restore-tab";
    tab.title = "Show Tab Snoozer";
    tab.setAttribute("aria-label", "Show Tab Snoozer");
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
      await chrome.storage.local.set({ launcherMinimized: state.minimized });
    } catch {
      // Still update UI if storage write fails.
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

  function setPanelError(text) {
    const el = state.panel?.querySelector('[data-role="error"]');
    if (!el) return;
    el.textContent = text || "";
    el.classList.toggle("show", Boolean(text));
  }

  async function onPanelClick(e) {
    const btn = e.target.closest("button");
    if (!btn) return;

    if (btn.dataset.action === "minimize") {
      await setMinimized(true);
      return;
    }

    const preset = btn.dataset.preset;
    if (!preset) return;

    setPanelError("");
    btn.disabled = true;
    try {
      const res = await chrome.runtime.sendMessage({ type: "snoozeActive", preset });
      if (!res?.ok) {
        setPanelError(res?.error || "Could not snooze this tab.");
        return;
      }
      togglePanel(false);
    } catch (error) {
      setPanelError(error?.message || "Could not snooze this tab.");
    } finally {
      btn.disabled = false;
    }
  }
})();
