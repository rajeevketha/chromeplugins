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

  const data = await chrome.storage.sync.get({
    showBadge: true,
    showToolbar: true,
    apiVersion: DEFAULT_API_VERSION
  });

  $("#showBadge").checked = data.showBadge;
  $("#showToolbar").checked = data.showToolbar;
  select.value = data.apiVersion || DEFAULT_API_VERSION;

  $("#showBadge").addEventListener("change", save);
  $("#showToolbar").addEventListener("change", save);
  select.addEventListener("change", save);
  $("#clearFavs").addEventListener("click", clearFavorites);
}

async function save() {
  await chrome.storage.sync.set({
    showBadge: $("#showBadge").checked,
    showToolbar: $("#showToolbar").checked,
    apiVersion: $("#apiVersion").value
  });
  flash("Saved.");
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
  }, 1600);
}

init();
