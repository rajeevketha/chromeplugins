(() => {
  if (window.__TAB_SNOOZER_CONTENT__) return;
  window.__TAB_SNOOZER_CONTENT__ = true;

  // Prefer above mid so we usually sit clear of OrgKit (~58%) and Inspector-style tabs.
  const EDGE = {
    preferredRatio: 0.34,
    gap: 12,
    sampleStep: 10,
    maxTabWidth: 120,
    edgePad: 64,
    margin: 12,
    // Sample several X positions — scrollbar often occupies the far-right pixels.
    sampleOffsets: [8, 18, 28, 40, 54]
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

    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (!message?.type) return;
      if (message.type === "ping") {
        sendResponse({ ok: true });
        return;
      }
      if (message.type === "readyPrompt") {
        showReadyNotice(message.entry);
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

  function isOwnEdgeNode(el) {
    if (!el || el.nodeType !== 1) return false;
    const id = el.id || "";
    return (
      id === "tabsnoozer-side-tab" ||
      id === "tabsnoozer-side-panel" ||
      id === "tabsnoozer-restore-tab" ||
      id === "tabsnoozer-ready-toast" ||
      id === "tabsnoozer-root"
    );
  }

  function looksLikeEdgeTab(el, vw) {
    const style = window.getComputedStyle(el);
    if (style.position !== "fixed" && style.position !== "sticky") return null;
    if (style.visibility === "hidden" || style.display === "none") return null;
    if (Number(style.opacity) === 0) return null;
    const rect = el.getBoundingClientRect();
    if (rect.height < 20 || rect.width < 6 || rect.width > EDGE.maxTabWidth) return null;
    // Must hug the right side (allow room for scrollbar).
    if (rect.right < vw - EDGE.edgePad) return null;
    if (rect.left < vw - EDGE.maxTabWidth - 48) return null;
    return rect;
  }

  /** Scan right edge for other fixed tabs — sample multiple X columns (scrollbar-safe). */
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
          if (el === excludeEl || isOwnEdgeNode(el) || excludeEl?.contains?.(el)) continue;
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

    for (let top = preferred; top <= maxTop; top += 6) {
      const t = clamp(top);
      if (fits(t)) return t;
    }
    for (let top = preferred; top >= minTop; top -= 6) {
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
      }, 180);
    });
    obs.observe(document.documentElement, { childList: true, subtree: false });
    if (document.body) obs.observe(document.body, { childList: true, subtree: false });

    state.edgeWatch = { onResize, obs };
    for (const ms of [300, 800, 1600, 3000]) {
      window.setTimeout(() => {
        state.edgeTopPx = null;
        positionEdgeControls();
      }, ms);
    }
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
      <button type="button" data-preset="1m">1 minute</button>
      <button type="button" data-preset="15m">15 minutes</button>
      <button type="button" data-preset="30m">30 minutes</button>
      <button type="button" data-preset="1h">1 hour</button>
      <button type="button" data-preset="2h">2 hours</button>
      <button type="button" data-preset="tonight">Tonight</button>
      <button type="button" data-preset="tomorrow">Tomorrow</button>
      <div class="tabsnoozer-panel-custom">
        <p class="tabsnoozer-panel-title">Custom</p>
        <div class="tabsnoozer-custom-row">
          <input id="ts-hours" type="number" min="0" max="720" value="0" aria-label="Hours" />
          <span>h</span>
          <input id="ts-minutes" type="number" min="0" max="59" value="15" aria-label="Minutes" />
          <span>m</span>
          <button type="button" class="tabsnoozer-go" data-action="custom">Snooze</button>
        </div>
      </div>
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
    requestAnimationFrame(() => positionEdgeControls());
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
    requestAnimationFrame(() => positionEdgeControls());
  }

  async function setMinimized(minimized) {
    state.minimized = !!minimized;
    state.open = false;
    try {
      await chrome.storage.local.set({ launcherMinimized: state.minimized });
    } catch {
      // ignore
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

  function readCustomDurationMinutes() {
    const hours = Number(state.panel?.querySelector("#ts-hours")?.value);
    const minutes = Number(state.panel?.querySelector("#ts-minutes")?.value);
    if (!Number.isFinite(hours) || !Number.isFinite(minutes) || hours < 0 || minutes < 0) {
      throw new Error("Enter a valid timer.");
    }
    if (minutes > 59) throw new Error("Minutes must be 0–59.");
    const total = Math.floor(hours) * 60 + Math.floor(minutes);
    if (total < 1) throw new Error("Timer must be at least 1 minute.");
    return total;
  }

  async function onPanelClick(e) {
    const btn = e.target.closest("button");
    if (!btn) return;

    if (btn.dataset.action === "minimize") {
      await setMinimized(true);
      return;
    }

    if (btn.dataset.action === "custom") {
      setPanelError("");
      let durationMinutes;
      try {
        durationMinutes = readCustomDurationMinutes();
      } catch (error) {
        setPanelError(error?.message || "Invalid timer.");
        return;
      }
      btn.disabled = true;
      try {
        const res = await chrome.runtime.sendMessage({ type: "snoozeActive", durationMinutes });
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

  function showReadyNotice(entry) {
    if (!entry?.id) return;
    document.getElementById("tabsnoozer-ready-toast")?.remove();
    const card = document.createElement("div");
    card.id = "tabsnoozer-ready-toast";
    card.className = "tabsnoozer-ready-toast";
    card.innerHTML = `
      <p class="kicker">Tab Snoozer · ready</p>
      <p class="title"></p>
      <div class="actions">
        <button type="button" data-act="open">Open</button>
        <button type="button" data-act="s15">+15m</button>
        <button type="button" data-act="later">Later</button>
      </div>
    `;
    card.querySelector(".title").textContent = entry.title || "Snoozed tab";
    card.addEventListener("click", async (e) => {
      const act = e.target.getAttribute("data-act");
      if (!act) return;
      if (act === "later") {
        card.remove();
        await chrome.runtime.sendMessage({ type: "dismissReadyNotice", id: entry.id });
        return;
      }
      if (act === "open") {
        await chrome.runtime.sendMessage({ type: "restore", id: entry.id });
        card.remove();
        return;
      }
      if (act === "s15") {
        await chrome.runtime.sendMessage({
          type: "reschedule",
          id: entry.id,
          durationMinutes: 15
        });
        card.remove();
      }
    });
    document.documentElement.appendChild(card);
  }
})();
