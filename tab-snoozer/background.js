const STORAGE_KEY = "snoozedTabs";

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function computeWakeAt(preset) {
  const now = new Date();

  if (preset === "1h") {
    return now.getTime() + 60 * 60 * 1000;
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

async function getSnoozedTabs() {
  const data = await chrome.storage.local.get(STORAGE_KEY);
  return Array.isArray(data[STORAGE_KEY]) ? data[STORAGE_KEY] : [];
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

async function scheduleAlarm(entry) {
  await chrome.alarms.create(entry.id, { when: entry.wakeAt });
}

async function clearAlarm(id) {
  await chrome.alarms.clear(id);
}

export async function snoozeTab(tab, preset) {
  if (!tab?.id || !tab.url || tab.url.startsWith("chrome://") || tab.url.startsWith("chrome-extension://")) {
    throw new Error("This page can't be snoozed.");
  }

  const entry = {
    id: uid(),
    url: tab.url,
    title: tab.title || tab.url,
    favIconUrl: tab.favIconUrl || "",
    wakeAt: computeWakeAt(preset),
    createdAt: Date.now(),
    preset
  };

  const tabs = await getSnoozedTabs();
  tabs.unshift(entry);
  await setSnoozedTabs(tabs);
  await scheduleAlarm(entry);
  await chrome.tabs.remove(tab.id);
  return entry;
}

export async function restoreTab(id, { open = true } = {}) {
  const tabs = await getSnoozedTabs();
  const entry = tabs.find((t) => t.id === id);
  if (!entry) return null;

  await clearAlarm(id);
  await setSnoozedTabs(tabs.filter((t) => t.id !== id));

  if (open) {
    await chrome.tabs.create({ url: entry.url, active: true });
  }
  return entry;
}

export async function cancelSnooze(id) {
  return restoreTab(id, { open: false });
}

async function wakeEntry(id) {
  const tabs = await getSnoozedTabs();
  const entry = tabs.find((t) => t.id === id);
  if (!entry) return;

  await clearAlarm(id);
  await setSnoozedTabs(tabs.filter((t) => t.id !== id));
  await chrome.tabs.create({ url: entry.url, active: true });

  try {
    await chrome.notifications.create(entry.id, {
      type: "basic",
      iconUrl: "icons/icon128.png",
      title: "Tab Snoozer",
      message: `Restored: ${entry.title}`,
      priority: 2
    });
  } catch {
    // Notifications may be blocked; tab restore still happened.
  }
}

async function recoverMissed() {
  const now = Date.now();
  const tabs = await getSnoozedTabs();
  const due = tabs.filter((t) => t.wakeAt <= now);
  const pending = tabs.filter((t) => t.wakeAt > now);

  for (const entry of pending) {
    await scheduleAlarm(entry);
  }

  for (const entry of due) {
    await wakeEntry(entry.id);
  }

  await updateBadge();
}

chrome.runtime.onInstalled.addListener(() => {
  recoverMissed();
});

chrome.runtime.onStartup.addListener(() => {
  recoverMissed();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  wakeEntry(alarm.name);
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "snooze-1-hour") return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;
  try {
    await snoozeTab(tab, "1h");
  } catch (err) {
    console.warn(err);
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  (async () => {
    try {
      if (message?.type === "getSnoozed") {
        sendResponse({ ok: true, tabs: await getSnoozedTabs() });
        return;
      }
      if (message?.type === "snoozeActive") {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        const entry = await snoozeTab(tab, message.preset);
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
      sendResponse({ ok: false, error: "Unknown message" });
    } catch (error) {
      sendResponse({ ok: false, error: error?.message || String(error) });
    }
  })();
  return true;
});

updateBadge();
