import { DEFAULT_API_VERSION } from "../lib/salesforce.js";

const $ = (s) => document.querySelector(s);
const status = $("#status");

async function init() {
  const select = $("#apiVersion");
  for (let v = 62; v >= 50; v -= 1) {
    const opt = document.createElement("option");
    opt.value = `${v}.0`;
    opt.textContent = `v${v}.0`;
    select.appendChild(opt);
  }

  const sync = await chrome.storage.sync.get({
    showBadge: true,
    showToolbar: true,
    apiVersion: DEFAULT_API_VERSION
  });
  const local = await chrome.storage.local.get({
    aiEnabled: false,
    aiApiKey: "",
    aiBaseUrl: "https://api.openai.com/v1",
    aiModel: "gpt-4o-mini"
  });

  $("#showBadge").checked = sync.showBadge;
  $("#showToolbar").checked = sync.showToolbar;
  select.value = sync.apiVersion || DEFAULT_API_VERSION;
  $("#aiEnabled").checked = local.aiEnabled;
  $("#aiApiKey").value = local.aiApiKey || "";
  $("#aiBaseUrl").value = local.aiBaseUrl || "https://api.openai.com/v1";
  $("#aiModel").value = local.aiModel || "gpt-4o-mini";

  ["showBadge", "showToolbar", "apiVersion"].forEach((id) => {
    $(`#${id}`).addEventListener("change", saveSync);
  });
  ["aiEnabled", "aiApiKey", "aiBaseUrl", "aiModel"].forEach((id) => {
    $(`#${id}`).addEventListener("change", saveAi);
  });
  $("#clearFavs").addEventListener("click", clearFavorites);
}

async function saveSync() {
  await chrome.storage.sync.set({
    showBadge: $("#showBadge").checked,
    showToolbar: $("#showToolbar").checked,
    apiVersion: $("#apiVersion").value
  });
  flash("Saved.");
}

async function saveAi() {
  const aiEnabled = $("#aiEnabled").checked;
  const aiBaseUrl = $("#aiBaseUrl").value.trim() || "https://api.openai.com/v1";
  const aiApiKey = $("#aiApiKey").value.trim();
  const aiModel = $("#aiModel").value.trim() || "gpt-4o-mini";

  if (aiEnabled) {
    try {
      const origin = new URL(aiBaseUrl).origin + "/*";
      const granted = await chrome.permissions.request({ origins: [origin] });
      if (!granted) {
        flash("Host permission not granted — AI calls may fail.");
      }
    } catch {
      flash("Could not request host permission for AI base URL.");
    }
  }

  await chrome.storage.local.set({ aiEnabled, aiApiKey, aiBaseUrl, aiModel });
  flash("AI settings saved locally.");
}

async function clearFavorites() {
  if (!confirm("Clear all favorites?")) return;
  await chrome.storage.sync.set({ favorites: [] });
  flash("Favorites cleared.");
}

function flash(msg) {
  status.textContent = msg;
  setTimeout(() => {
    status.textContent = "";
  }, 1800);
}

init();
