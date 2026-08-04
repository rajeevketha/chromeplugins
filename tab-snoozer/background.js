const STORAGE_KEY = "snoozedTabs";
const SETTINGS_KEY = "settings";
const MAX_TITLE_LENGTH = 200;
const MAX_SNOOZED = 100;
const WATCHDOG_ALARM = "__tabsnoozer_watchdog__";

const DEFAULT_SETTINGS = {
  autoOpenOnDue: false,
  showPageLauncher: true
};

const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function notificationIdFor(entryId) {
  return `wake-${entryId}`;
}

function sanitizeTitle(title, url) {
  const raw = (title || url || "Untitled").replace(/\s+/g, " ").trim();
  if (raw.length <= MAX_TITLE_LENGTH) return raw;
  return `${raw.slice(0, MAX_TITLE_LENGTH - 1)}…`;
}

export function isAllowedUrl(urlString) {
  if (!urlString || typeof urlString !== "string") return false;
  try {
    const parsed = new URL(urlString);
    return ALLOWED_PROTOCOLS.has(parsed.protocol);
  } catch {
    return false;
  }
}

const PRESET_MS = {
  "1m": 1 * 60 * 1000,
  "15m": 15 * 60 * 1000,
  "30m": 30 * 60 * 1000,
  "1h": 60 * 60 * 1000,
  "2h": 2 * 60 * 60 * 1000
};

export function computeWakeAt(preset) {
  const now = new Date();

  if (Object.prototype.hasOwnProperty.call(PRESET_MS, preset)) {
    return now.getTime() + PRESET_MS[preset];
  }

  if (preset === "tonight") {
    const tonight = new Date(now);
    tonight.setHours(20, 0, 0, 0);
    if (tonight.getTime() <= now.getTime() + 5 * 60 * 1000) {
      tonight.setDate(tonight.getDate() + 1);
    }
    return tonight.getTime();
  }

  if (preset === "tomorrow") {
    const morning = new Date(now);
    morning.setDate(morning.getDate() + 1);
    morning.setHours(9, 0, 0, 0);
    return morning.getTime();
  }

  throw new Error(`Unknown preset: ${preset}`);
}

function resolveWakeAt({ preset, wakeAt, durationMinutes } = {}) {
  if (typeof wakeAt === "number" && Number.isFinite(wakeAt)) {
    if (wakeAt <= Date.now() + 30 * 1000) {
      throw new Error("Pick a time at least 1 minute ahead.");
    }
    return wakeAt;
  }

  if (typeof durationMinutes === "number" && Number.isFinite(durationMinutes)) {
    const mins = Math.floor(durationMinutes);
    if (mins < 1 || mins > 30 * 24 * 60) {
      throw new Error("Timer must be between 1 minute and 30 days.");
    }
    return Date.now() + mins * 60 * 1000;
  }

  if (preset) return computeWakeAt(preset);
  throw new Error("Choose a snooze time.");
}

async function getSnoozedTabs() {
  const data = await chrome.storage.local.get(STORAGE_KEY);
  return Array.isArray(data[STORAGE_KEY]) ? data[STORAGE_KEY] : [];
}

async function getSettings() {
  const data = await chrome.storage.local.get(SETTINGS_KEY);
  return { ...DEFAULT_SETTINGS, ...(data[SETTINGS_KEY] || {}) };
}

async function setSettings(patch) {
  const current = await getSettings();
  const next = { ...current, ...patch };
  await chrome.storage.local.set({ [SETTINGS_KEY]: next });
  if (Object.prototype.hasOwnProperty.call(patch, "showPageLauncher")) {
    await chrome.storage.local.set({ showPageLauncher: next.showPageLauncher });
  }
  return next;
}

async function setSnoozedTabs(tabs) {
  await chrome.storage.local.set({ [STORAGE_KEY]: tabs });
  await updateBadge(tabs);
}

async function updateBadge(tabs) {
  const list = tabs ?? (await getSnoozedTabs());
  const ready = list.filter((t) => t.wakeAt <= Date.now()).length;
  const pending = list.length;
  const text = pending ? String(pending) : "";
  await chrome.action.setBadgeText({ text });
  await chrome.action.setBadgeBackgroundColor({
    color: ready ? "#C45C26" : "#1A5F6E"
  });
}

async function ensureWatchdog() {
  await chrome.alarms.create(WATCHDOG_ALARM, {
    periodInMinutes: 1,
    delayInMinutes: 1
  });
}

async function scheduleAlarm(entry) {
  const when = Math.max(entry.wakeAt, Date.now() + 15 * 1000);
  await chrome.alarms.create(entry.id, { when });
}

async function clearAlarm(id) {
  await chrome.alarms.clear(id);
}

async function clearNotification(entryId) {
  try {
    await chrome.notifications.clear(notificationIdFor(entryId));
  } catch {
    // ignore
  }
}

async function openUrl(url) {
  if (!isAllowedUrl(url)) {
    throw new Error("Only regular web pages (http/https) can be opened.");
  }
  const tabs = await chrome.tabs.query({});
  const existing = tabs.find((t) => t.url === url);
  if (existing?.id) {
    await chrome.tabs.update(existing.id, { active: true });
    if (existing.windowId != null) {
      await chrome.windows.update(existing.windowId, { focused: true });
    }
    return;
  }
  await chrome.tabs.create({ url, active: true });
}

function shortLabel(entry) {
  return entry.title.length > 80 ? `${entry.title.slice(0, 79)}…` : entry.title;
}

async function notifyReady(entry) {
  await chrome.notifications.create(notificationIdFor(entry.id), {
    type: "basic",
    iconUrl: chrome.runtime.getURL("icons/icon128.png"),
    title: "Tab Snoozer — tab is ready",
    message: shortLabel(entry),
    contextMessage: "Tap to open · or snooze again",
    priority: 2,
    requireInteraction: true,
    buttons: [{ title: "Snooze 15 min" }, { title: "Snooze 1 hour" }]
  });
}

export async function snoozeTab(tab, options = {}) {
  if (!tab?.id) throw new Error("No active tab to snooze.");
  if (!isAllowedUrl(tab.url)) {
    throw new Error("Only regular web pages (http/https) can be snoozed.");
  }

  const tabs = await getSnoozedTabs();
  if (tabs.length >= MAX_SNOOZED) {
    throw new Error(`Snooze limit reached (${MAX_SNOOZED}). Open or clear some first.`);
  }

  const wakeAt = resolveWakeAt(options);
  const entry = {
    id: uid(),
    url: tab.url,
    title: sanitizeTitle(tab.title, tab.url),
    wakeAt,
    createdAt: Date.now(),
    preset: options.preset || (options.durationMinutes != null ? "custom-timer" : "custom")
  };

  tabs.unshift(entry);
  await setSnoozedTabs(tabs);
  await scheduleAlarm(entry);
  await ensureWatchdog();
  await chrome.tabs.remove(tab.id);
  return entry;
}

export async function restoreTab(id, { open = true } = {}) {
  const tabs = await getSnoozedTabs();
  const entry = tabs.find((t) => t.id === id);
  if (!entry) return null;

  await clearAlarm(id);
  await clearNotification(id);
  await setSnoozedTabs(tabs.filter((t) => t.id !== id));

  if (open) {
    if (!isAllowedUrl(entry.url)) {
      throw new Error("Stored URL is not allowed to open.");
    }
    await openUrl(entry.url);
  }
  return entry;
}

export async function cancelSnooze(id) {
  return restoreTab(id, { open: false });
}

export async function rescheduleSnooze(id, durationMinutes) {
  const mins = Math.floor(Number(durationMinutes));
  if (!Number.isFinite(mins) || mins < 1) {
    throw new Error("Invalid snooze duration.");
  }
  const tabs = await getSnoozedTabs();
  const entry = tabs.find((t) => t.id === id);
  if (!entry) throw new Error("Snoozed tab not found.");

  const next = {
    ...entry,
    wakeAt: Date.now() + mins * 60 * 1000,
    preset: "custom-timer",
    notifiedAt: undefined,
    lastPromptAt: undefined
  };
  await setSnoozedTabs(tabs.map((t) => (t.id === id ? next : t)));
  await scheduleAlarm(next);
  await clearNotification(id);
  await ensureWatchdog();
  return next;
}

export async function clearAllSnoozed() {
  const tabs = await getSnoozedTabs();
  for (const entry of tabs) {
    await clearAlarm(entry.id);
    await clearNotification(entry.id);
  }
  await setSnoozedTabs([]);
  return tabs.length;
}

async function markNotified(entryId) {
  const tabs = await getSnoozedTabs();
  await setSnoozedTabs(
    tabs.map((t) => (t.id === entryId ? { ...t, notifiedAt: Date.now() } : t))
  );
}

async function ensureContentScript(tabId) {
  try {
    await chrome.tabs.sendMessage(tabId, { type: "ping" });
    return true;
  } catch {
    // fall through
  }
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["content/content.js"]
    });
    return true;
  } catch {
    return false;
  }
}

async function deliverReadyReminder(entry) {
  try {
    await notifyReady(entry);
  } catch (error) {
    console.warn("OS notification failed", error);
  }

  try {
    const [active] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (active?.id && isAllowedUrl(active.url)) {
      await ensureContentScript(active.id);
      await chrome.tabs.sendMessage(active.id, { type: "readyPrompt", entry });
    }
  } catch (error) {
    console.warn("In-page ready toast failed", error);
  }
}

async function remindEntry(id) {
  if (id === WATCHDOG_ALARM) {
    await processDueTabs();
    return;
  }

  const tabs = await getSnoozedTabs();
  const entry = tabs.find((t) => t.id === id);
  if (!entry) return;

  if (entry.wakeAt > Date.now() + 5 * 1000) {
    await scheduleAlarm(entry);
    return;
  }

  if (!isAllowedUrl(entry.url)) {
    await clearAlarm(id);
    await setSnoozedTabs(tabs.filter((t) => t.id !== id));
    return;
  }

  const settings = await getSettings();
  if (settings.autoOpenOnDue) {
    await openUrl(entry.url);
    await clearAlarm(id);
    await setSnoozedTabs((await getSnoozedTabs()).filter((t) => t.id !== id));
    return;
  }

  if (entry.notifiedAt) {
    await updateBadge();
    return;
  }

  await deliverReadyReminder(entry);
  await markNotified(entry.id);
  await clearAlarm(id);
  await updateBadge();
}

async function processDueTabs() {
  const now = Date.now();
  const tabs = await getSnoozedTabs();
  const due = tabs.filter((t) => t.wakeAt <= now);
  const pending = tabs.filter((t) => t.wakeAt > now);

  for (const entry of pending) await scheduleAlarm(entry);
  for (const entry of due) await remindEntry(entry.id);
  if (pending.length || due.length) await ensureWatchdog();
  await updateBadge();
  return { due: due.length, pending: pending.length };
}

function entryIdFromNotification(notificationId) {
  if (!notificationId?.startsWith("wake-")) return null;
  return notificationId.slice("wake-".length);
}

chrome.runtime.onInstalled.addListener(() => {
  ensureWatchdog();
  processDueTabs();
});

chrome.runtime.onStartup.addListener(() => {
  ensureWatchdog();
  processDueTabs();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  remindEntry(alarm.name).catch((error) => {
    console.error("Alarm handler failed", alarm.name, error);
  });
});

chrome.notifications.onClicked.addListener((notificationId) => {
  const id = entryIdFromNotification(notificationId);
  if (!id) return;
  restoreTab(id, { open: true }).catch(console.error);
});

chrome.notifications.onButtonClicked.addListener((notificationId, buttonIndex) => {
  const id = entryIdFromNotification(notificationId);
  if (!id) return;
  const minutes = buttonIndex === 0 ? 15 : 60;
  rescheduleSnooze(id, minutes).catch(console.error);
});

chrome.commands.onCommand.addListener(async (command) => {
  try {
    if (command === "snooze-15-min") {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      await snoozeTab(tab, { preset: "15m" });
      return;
    }
    if (command === "snooze-1-hour") {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      await snoozeTab(tab, { preset: "1h" });
    }
  } catch (err) {
    console.warn(err);
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    try {
      if (message?.type === "getSnoozed") {
        await processDueTabs();
        sendResponse({
          ok: true,
          tabs: await getSnoozedTabs(),
          settings: await getSettings()
        });
        return;
      }
      if (message?.type === "getSettings") {
        sendResponse({ ok: true, settings: await getSettings() });
        return;
      }
      if (message?.type === "setSettings") {
        const settings = await setSettings(message.patch || {});
        sendResponse({ ok: true, settings });
        return;
      }
      if (message?.type === "snoozeActive") {
        let tab = sender.tab;
        if (!tab?.id) {
          [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        }
        const entry = await snoozeTab(tab, {
          preset: message.preset,
          wakeAt: message.wakeAt,
          durationMinutes: message.durationMinutes
        });
        sendResponse({ ok: true, entry });
        return;
      }
      if (message?.type === "restore") {
        await restoreTab(message.id, { open: true });
        sendResponse({ ok: true });
        return;
      }
      if (message?.type === "cancel") {
        await cancelSnooze(message.id);
        sendResponse({ ok: true });
        return;
      }
      if (message?.type === "reschedule") {
        const entry = await rescheduleSnooze(message.id, message.durationMinutes);
        sendResponse({ ok: true, entry });
        return;
      }
      if (message?.type === "clearAll") {
        const removed = await clearAllSnoozed();
        sendResponse({ ok: true, removed });
        return;
      }
      if (message?.type === "dismissReadyNotice") {
        sendResponse({ ok: true });
        return;
      }
      sendResponse({ ok: false, error: "Unknown message" });
    } catch (error) {
      sendResponse({ ok: false, error: error?.message || String(error) });
    }
  })();
  return true;
});

ensureWatchdog();
processDueTabs();
updateBadge();
