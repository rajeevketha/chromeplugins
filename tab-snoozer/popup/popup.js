const statusEl = document.getElementById("status");
const listEl = document.getElementById("list");
const emptyEl = document.getElementById("empty");
const countEl = document.getElementById("count");
const presetButtons = [...document.querySelectorAll(".preset")];

function send(message) {
  return chrome.runtime.sendMessage(message);
}

function setStatus(text, isError = false) {
  statusEl.textContent = text || "";
  statusEl.classList.toggle("error", Boolean(isError && text));
}

function formatWake(wakeAt) {
  const now = Date.now();
  if (wakeAt <= now) return "Ready now";

  const wake = new Date(wakeAt);
  const diffMs = wakeAt - now;
  const diffMin = Math.round(diffMs / 60000);

  if (diffMin < 60) return `In ${diffMin} min`;

  const opts = { hour: "numeric", minute: "2-digit" };
  const sameDay = wake.toDateString() === new Date().toDateString();
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);

  if (sameDay) return `Today ${wake.toLocaleTimeString([], opts)}`;
  if (wake.toDateString() === tomorrow.toDateString()) {
    return `Tomorrow ${wake.toLocaleTimeString([], opts)}`;
  }
  return wake.toLocaleString([], { month: "short", day: "numeric", ...opts });
}

function renderList(tabs) {
  countEl.textContent = String(tabs.length);
  listEl.innerHTML = "";

  if (!tabs.length) {
    listEl.classList.add("hidden");
    emptyEl.classList.remove("hidden");
    return;
  }

  listEl.classList.remove("hidden");
  emptyEl.classList.add("hidden");

  const now = Date.now();
  for (const tab of tabs) {
    const li = document.createElement("li");
    li.className = "item";

    const main = document.createElement("div");
    const title = document.createElement("p");
    title.className = "item-title";
    title.textContent = tab.title || tab.url;

    const meta = document.createElement("p");
    meta.className = "item-meta" + (tab.wakeAt <= now ? " ready" : "");
    meta.textContent = formatWake(tab.wakeAt);

    main.append(title, meta);

    const actions = document.createElement("div");
    actions.className = "item-actions";

    const restoreBtn = document.createElement("button");
    restoreBtn.type = "button";
    restoreBtn.className = "btn-restore";
    restoreBtn.textContent = "Open";
    restoreBtn.addEventListener("click", async () => {
      restoreBtn.disabled = true;
      const res = await send({ type: "restore", id: tab.id });
      if (!res?.ok) setStatus(res?.error || "Could not open tab.", true);
      await refresh();
    });

    const cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.className = "btn-cancel";
    cancelBtn.textContent = "Cancel";
    cancelBtn.addEventListener("click", async () => {
      cancelBtn.disabled = true;
      const res = await send({ type: "cancel", id: tab.id });
      if (!res?.ok) setStatus(res?.error || "Could not cancel.", true);
      await refresh();
    });

    actions.append(restoreBtn, cancelBtn);
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
}

async function snooze(preset) {
  setStatus("");
  presetButtons.forEach((b) => {
    b.disabled = true;
  });
  try {
    const res = await send({ type: "snoozeActive", preset });
    if (!res?.ok) {
      setStatus(res?.error || "Could not snooze this tab.", true);
      return;
    }
    setStatus("Snoozed. This tab will return later.");
    // Popup often closes because the active tab was removed; refresh if still open.
    await refresh();
  } finally {
    presetButtons.forEach((b) => {
      b.disabled = false;
    });
  }
}

for (const button of presetButtons) {
  button.addEventListener("click", () => snooze(button.dataset.preset));
}

refresh();
