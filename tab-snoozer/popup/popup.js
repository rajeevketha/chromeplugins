const statusEl = document.getElementById("status");
const listEl = document.getElementById("list");
const emptyEl = document.getElementById("empty");
const countEl = document.getElementById("count");
const clearAllBtn = document.getElementById("clearAll");
const hoursEl = document.getElementById("hours");
const minutesEl = document.getElementById("minutes");
const customSnoozeBtn = document.getElementById("customSnooze");
const autoOpenEl = document.getElementById("autoOpenOnDue");
const showPageLauncherEl = document.getElementById("showPageLauncher");
const presetButtons = [...document.querySelectorAll(".chip")];
const actionControls = [...presetButtons, customSnoozeBtn, hoursEl, minutesEl];

function send(message) {
  return chrome.runtime.sendMessage(message);
}

function setStatus(text, isError = false) {
  statusEl.textContent = text || "";
  statusEl.classList.toggle("error", Boolean(isError && text));
}

function setBusy(busy) {
  for (const el of actionControls) el.disabled = busy;
}

function formatWake(wakeAt) {
  const now = Date.now();
  if (wakeAt <= now) return "Ready now";
  const diffMin = Math.round((wakeAt - now) / 60000);
  if (diffMin < 60) return `In ${diffMin}m`;
  if (diffMin < 24 * 60) {
    const hours = Math.floor(diffMin / 60);
    const mins = diffMin % 60;
    return mins ? `In ${hours}h ${mins}m` : `In ${hours}h`;
  }
  return new Date(wakeAt).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function button(label, className, onClick) {
  const el = document.createElement("button");
  el.type = "button";
  el.className = className;
  el.textContent = label;
  el.addEventListener("click", async () => {
    el.disabled = true;
    try {
      await onClick();
    } finally {
      el.disabled = false;
    }
  });
  return el;
}

function renderList(tabs) {
  countEl.textContent = String(tabs.length);
  listEl.innerHTML = "";

  if (!tabs.length) {
    listEl.classList.add("hidden");
    emptyEl.classList.remove("hidden");
    clearAllBtn.classList.add("hidden");
    return;
  }

  listEl.classList.remove("hidden");
  emptyEl.classList.add("hidden");
  clearAllBtn.classList.remove("hidden");

  const now = Date.now();
  const ordered = [...tabs].sort((a, b) => {
    const ar = a.wakeAt <= now ? 0 : 1;
    const br = b.wakeAt <= now ? 0 : 1;
    if (ar !== br) return ar - br;
    return a.wakeAt - b.wakeAt;
  });

  for (const tab of ordered) {
    const ready = tab.wakeAt <= now;
    const li = document.createElement("li");
    li.className = "item" + (ready ? " ready" : "");

    const main = document.createElement("div");
    const title = document.createElement("p");
    title.className = "item-title";
    title.textContent = tab.title || tab.url;
    title.title = tab.url || "";
    const meta = document.createElement("p");
    meta.className = "item-meta" + (ready ? " ready" : "");
    meta.textContent = formatWake(tab.wakeAt);
    main.append(title, meta);

    const actions = document.createElement("div");
    actions.className = "item-actions";
    actions.append(
      button(ready ? "Open" : "Open now", "primary", async () => {
        const res = await send({ type: "restore", id: tab.id });
        if (!res?.ok) setStatus(res?.error || "Could not open tab.", true);
        else setStatus("Opened.");
        await refresh();
      })
    );
    if (ready) {
      actions.append(
        button("+15m", "", async () => {
          const res = await send({ type: "reschedule", id: tab.id, durationMinutes: 15 });
          if (!res?.ok) setStatus(res?.error || "Could not snooze again.", true);
          else setStatus("Snoozed again for 15 minutes.");
          await refresh();
        })
      );
    }
    actions.append(
      button("Remove", "danger", async () => {
        const res = await send({ type: "cancel", id: tab.id });
        if (!res?.ok) setStatus(res?.error || "Could not remove snooze.", true);
        else setStatus("Removed from snooze list.");
        await refresh();
      })
    );

    li.append(main, actions);
    listEl.append(li);
  }
}

async function refresh() {
  const res = await send({ type: "getSnoozed" });
  if (!res?.ok) {
    setStatus(res?.error || "Could not load snoozed tabs.", true);
    return;
  }
  renderList(res.tabs || []);
  if (res.settings) {
    autoOpenEl.checked = Boolean(res.settings.autoOpenOnDue);
    showPageLauncherEl.checked = res.settings.showPageLauncher !== false;
  }
}

async function snooze(payload) {
  setStatus("");
  setBusy(true);
  try {
    const res = await send({ type: "snoozeActive", ...payload });
    if (!res?.ok) {
      setStatus(res?.error || "Could not snooze this tab.", true);
      return;
    }
    setStatus("Snoozed. It appears in the list below.");
    await refresh();
  } finally {
    setBusy(false);
  }
}

function readCustomDurationMinutes() {
  const hours = Number(hoursEl.value);
  const minutes = Number(minutesEl.value);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes) || hours < 0 || minutes < 0) {
    throw new Error("Enter a valid timer.");
  }
  if (minutes > 59) throw new Error("Minutes must be 0–59.");
  const total = Math.floor(hours) * 60 + Math.floor(minutes);
  if (total < 1) throw new Error("Timer must be at least 1 minute.");
  return total;
}

for (const buttonEl of presetButtons) {
  buttonEl.addEventListener("click", () => snooze({ preset: buttonEl.dataset.preset }));
}

customSnoozeBtn.addEventListener("click", async () => {
  try {
    await snooze({ durationMinutes: readCustomDurationMinutes() });
  } catch (error) {
    setStatus(error?.message || "Invalid timer.", true);
  }
});

clearAllBtn.addEventListener("click", async () => {
  if (!confirm("Remove all snoozed tabs from the list?")) return;
  const res = await send({ type: "clearAll" });
  if (!res?.ok) setStatus(res?.error || "Could not clear.", true);
  else setStatus(res.removed ? `Cleared ${res.removed}.` : "Nothing to clear.");
  await refresh();
});

async function saveSetting(patch, checkboxEl, onMsg, offMsg) {
  const res = await send({ type: "setSettings", patch });
  if (!res?.ok) {
    setStatus(res?.error || "Could not save setting.", true);
    checkboxEl.checked = !checkboxEl.checked;
    return;
  }
  const key = Object.keys(patch)[0];
  setStatus(patch[key] ? onMsg : offMsg);
}

autoOpenEl.addEventListener("change", () => {
  saveSetting(
    { autoOpenOnDue: autoOpenEl.checked },
    autoOpenEl,
    "Auto-open on.",
    "Reminder first."
  );
});

showPageLauncherEl.addEventListener("change", () => {
  saveSetting(
    { showPageLauncher: showPageLauncherEl.checked },
    showPageLauncherEl,
    "Page side tab on.",
    "Page side tab off."
  );
});

refresh();
setInterval(refresh, 5000);
