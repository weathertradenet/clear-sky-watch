const STORAGE_KEY = "bookingWeatherSearches";
const WEATHERAPI_KEY_STORAGE = "clearSkyWatchWeatherApiKey";
const OPENWEATHER_KEY_STORAGE = "clearSkyWatchOpenWeatherApiKey";

const addDestinationBtn = document.getElementById("addDestinationBtn");
const compareDestinationsBtn = document.getElementById("compareDestinationsBtn");
const clearBtn = document.getElementById("clearBtn");
const savedSearchesEl = document.getElementById("savedSearches");
const weatherApiKeyInput = document.getElementById("weatherApiKeyInput");
const openWeatherKeyInput = document.getElementById("openWeatherKeyInput");
const saveApiKeysBtn = document.getElementById("saveApiKeysBtn");
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function cleanText(value) {
  return value ? String(value).replace(/\s+/g, " ").trim() : "";
}


function normalizeDestinationDisplayText(value) {
  let text = cleanText(value)
    .replace(/[\u200B-\u200D\uFEFF]/g, " ")
    .replace(/[✈︎✈️🛫🛬🏨🧳📍]/g, " ")
    .replace(/\s+/g, " ");
  if (!text) return "";
  text = text
    .replace(/^(?:a|à|to|vers|destination|arrival|arrivée|arrive|going\s+to|where\s+to)\s*(?:\.{2,}|…|:|-|–|—)?\s*/i, "")
    .replace(/^\.{2,}|^…+/g, "")
    .replace(/^[^A-Za-zÀ-ÖØ-öø-ÿ0-9]+/u, "")
    .replace(/\b(from|origin|departure|départ|departing|leaving)\b.*$/i, "")
    .replace(/\b(check[-\s]?in|check[-\s]?out|dates?|guests?|adults?|children|rooms?|search|rechercher|chercher)\b.*$/i, "")
    .replace(/\s+[-–—|•>›→]\s+.*$/g, "")
    .replace(/^[,;:|•\-–—.\s]+|[,;:|•\-–—.\s]+$/g, "");
  return cleanText(text);
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}


function abbreviateDestinationName(value) {
  let text = normalizeDestinationDisplayText(value)
    .replace(/\bSaint\b/gi, "St.")
    .replace(/\bSainte\b/gi, "Ste.")
    .replace(/\bInternational\b/gi, "Intl.")
    .replace(/\bMunicipality\b/gi, "Mun.")
    .replace(/\bDepartment\b/gi, "Dept.")
    .replace(/\bDistrict\b/gi, "Dist.")
    .replace(/\bProvince\b/gi, "Prov.")
    .replace(/\bCounty\b/gi, "Co.")
    .replace(/\bRegion\b/gi, "Reg.");
  if (text.length <= 30) return text;
  const words = text.split(" ");
  if (words.length > 1) {
    const compact = words.map((word, index) => index === 0 || word.length <= 4 ? word : `${word.slice(0, 1)}.`).join(" ");
    if (compact.length <= 30) return compact;
  }
  return `${text.slice(0, 29)}…`;
}

function simpleDestinationName(value) {
  let text = normalizeDestinationDisplayText(value);
  if (!text) return "";
  text = normalizeDestinationDisplayText(text
    .replace(/^destination\s*[:\-]?\s*/i, "")
    .replace(/^where\s*to\??\s*/i, "")
    .replace(/^going\s*to\??\s*/i, "")
    .replace(/\s+[-–—|•>]\s+.*$/g, "")
    .replace(/\b(check[-\s]?in|check[-\s]?out|dates?|guests?|adults?|children|rooms?|search|rechercher|chercher)\b.*$/i, "")
    .replace(/^[,;:|•\-]+|[,;:|•\-]+$/g, "")
  );
  const firstPart = cleanText(text.split(",")[0]);
  if (firstPart) text = firstPart;
  return abbreviateDestinationName(text);
}


function formatShortDate(dateString) {
  if (!dateString) return "";
  const date = new Date(`${dateString}T00:00:00`);
  if (Number.isNaN(date.getTime())) return dateString;
  return `${String(date.getDate()).padStart(2, "0")} ${MONTHS[date.getMonth()]}`;
}

function formatDateRange(dates) {
  if (!dates) return "Dates not detected";
  if (dates.checkin || dates.checkout) {
    return `${formatShortDate(dates.checkin) || "?"} - ${formatShortDate(dates.checkout) || "?"}`;
  }
  return dates.label || "Dates not detected";
}

async function getSavedSearches() {
  const result = await chrome.storage.local.get([STORAGE_KEY]);
  return Array.isArray(result[STORAGE_KEY]) ? result[STORAGE_KEY] : [];
}

async function setSavedSearches(searches) {
  await chrome.storage.local.set({ [STORAGE_KEY]: normalizeSavedSearchesForDisplay(searches) });
}

function tripDatesSignature(dates) {
  return dates?.checkin && dates?.checkout ? `${dates.checkin}|${dates.checkout}` : "";
}

function normalizeLabelToken(value) {
  return cleanText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function savedDestinationKey(search) {
  return normalizeLabelToken(search?.rawDestination || search?.destination || "");
}

function savedAtTime(search) {
  const time = Date.parse(search?.savedAt || search?.updatedAt || "");
  return Number.isFinite(time) ? time : 0;
}

function normalizeSavedSearchesForDisplay(searches) {
  const source = Array.isArray(searches) ? searches : [];
  const byKey = new Map();
  source.forEach((search) => {
    if (!search || !cleanText(search.destination || search.rawDestination)) return;
    const safe = {
      ...search,
      id: search.id || (crypto?.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`),
      rawDestination: simpleDestinationName(search.rawDestination || search.destination),
      destination: simpleDestinationName(search.rawDestination || search.destination),
      savedAt: search.savedAt || new Date().toISOString()
    };
    const key = savedDestinationKey(safe) || safe.id;
    const previous = byKey.get(key);
    if (!previous || savedAtTime(safe) >= savedAtTime(previous)) byKey.set(key, safe);
  });
  return Array.from(byKey.values()).sort((a, b) => savedAtTime(b) - savedAtTime(a));
}

function dedupeByDestination(searches) {
  return normalizeSavedSearchesForDisplay(searches);
}

async function getCurrentTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

function getUrlParamFromString(urlString, ...names) {
  try {
    const url = new URL(urlString || "");
    for (const name of names) {
      const value = cleanText(url.searchParams.get(name));
      if (value) return value;
    }
  } catch (_) {}
  return "";
}

function readTravelDataFromTabUrl(tab) {
  const url = tab?.url || "";
  const destination = getUrlParamFromString(url,
    "ss", "destination", "destinationName", "dest", "to", "arrival", "arrivalCity",
    "location", "locationName", "where", "query", "q", "place", "placeName", "city",
    "selected_place", "search_query", "searchLocation", "regionName"
  );
  const checkin = getUrlParamFromString(url, "checkin", "checkIn", "check_in", "startDate", "start_date", "arrival", "arrivalDate", "fromDate", "dateFrom", "d1", "chkin", "check_in_date");
  const checkout = getUrlParamFromString(url, "checkout", "checkOut", "check_out", "endDate", "end_date", "departure", "departureDate", "toDate", "dateTo", "d2", "chkout", "check_out_date");
  return {
    destination,
    dates: checkin || checkout ? { checkin: checkin || checkout, checkout: checkout || checkin, label: `${checkin || "?"} → ${checkout || checkin || "?"}`, isDefault: false } : null,
    pageUrl: url,
    sourceSite: (new URL(url || "https://example.com")).hostname.replace(/^www\./, "") || "Travel page",
    savedAt: new Date().toISOString()
  };
}

async function sendMessageWithInjectedContent(tab, message) {
  try {
    return await chrome.tabs.sendMessage(tab.id, message);
  } catch (_) {
    try {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content.js"] });
      await new Promise((resolve) => window.setTimeout(resolve, 120));
      return await chrome.tabs.sendMessage(tab.id, message);
    } catch (error) {
      throw error;
    }
  }
}

async function getDatesForNewDestination(dataDates = null) {
  // Toolbar-safe helper: do not call content-page-only date functions here.
  // Use dates returned by the content script/URL fallback when present.
  if (dataDates?.checkin || dataDates?.checkout || dataDates?.label) {
    return dataDates;
  }

  // Only if the current save has no dates at all, inherit the previous destination dates.
  const previous = dedupeByDestination(await getSavedSearches())[0];
  if (previous?.dates?.checkin || previous?.dates?.checkout || previous?.dates?.label) {
    return previous.dates;
  }

  return null;
}


async function saveCurrentDestinationFallback(tab) {
  let data = null;
  try {
    data = await sendMessageWithInjectedContent(tab, { type: "GET_BOOKING_SEARCH" });
  } catch (_) {
    data = readTravelDataFromTabUrl(tab);
  }
  try {
    const destination = simpleDestinationName(data?.destination || "");
    if (!destination) return false;
    const searches = await getSavedSearches();
    const dates = await getDatesForNewDestination(data?.dates || null);
    const key = savedDestinationKey({ rawDestination: destination, destination });
    const existingIndex = searches.findIndex((item) => savedDestinationKey(item) === key);
    const savedSearch = {
      ...(existingIndex >= 0 ? searches[existingIndex] : {}),
      id: existingIndex >= 0 ? searches[existingIndex].id : crypto.randomUUID(),
      name: existingIndex >= 0 ? searches[existingIndex].name : `search #${searches.length + 1}`,
      destination,
      rawDestination: destination,
      dates,
      pageUrl: data?.pageUrl || tab.url || "",
      sourceSite: data?.sourceSite || "Travel page",
      savedAt: new Date().toISOString(),
      saveStatus: "saved"
    };
    if (existingIndex >= 0) searches[existingIndex] = savedSearch; else searches.push(savedSearch);
    await setSavedSearches(searches);
    return true;
  } catch (_) {
    return false;
  }
}


async function addCurrentDestination() {
  const tab = await getCurrentTab();
  if (!tab || !tab.id) return;
  const original = addDestinationBtn.textContent;
  addDestinationBtn.disabled = true;
  addDestinationBtn.textContent = "Saving...";
  try {
    const response = await Promise.race([
      sendMessageWithInjectedContent(tab, { type: "SAVE_BOOKING_SEARCH" }),
      new Promise((resolve) => window.setTimeout(() => resolve({ ok: false, timeout: true }), 1200))
    ]);
    let saved = Boolean(response?.ok);
    if (!saved) saved = await saveCurrentDestinationFallback(tab);
    addDestinationBtn.textContent = saved ? "Saved" : "Not saved";
    await renderSavedSearches();
  } catch (_) {
    const saved = await saveCurrentDestinationFallback(tab);
    addDestinationBtn.textContent = saved ? "Saved" : "Open on travel page";
    await renderSavedSearches();
  } finally {
    window.setTimeout(() => {
      addDestinationBtn.disabled = false;
      addDestinationBtn.textContent = original;
      renderSavedSearches();
    }, 900);
  }
}

async function compareOnPage() {
  const tab = await getCurrentTab();
  if (!tab || !tab.id) return;
  const original = compareDestinationsBtn.textContent;
  compareDestinationsBtn.disabled = true;
  compareDestinationsBtn.textContent = "Opening...";
  try {
    let response = null;
    try {
      response = await Promise.race([
        sendMessageWithInjectedContent(tab, { type: "COMPARE_DESTINATIONS" }),
        new Promise((resolve) => window.setTimeout(() => resolve({ ok: false, timeout: true }), 1200))
      ]);
    } catch (_) {
      response = { ok: false };
    }

    if (!response?.ok) {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content.js"] });
      await new Promise((resolve) => window.setTimeout(resolve, 120));
      const direct = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          if (typeof window.clearSkyWatchCompareDestinations === "function") {
            window.clearSkyWatchCompareDestinations();
            return true;
          }
          return false;
        }
      });
      if (!direct?.[0]?.result) throw new Error("Compare function unavailable");
    }
    window.close();
  } catch (_) {
    compareDestinationsBtn.textContent = "Open travel page";
    window.setTimeout(() => {
      compareDestinationsBtn.disabled = false;
      compareDestinationsBtn.textContent = original;
    }, 1400);
    return;
  }
  compareDestinationsBtn.disabled = false;
  compareDestinationsBtn.textContent = original;
}

async function removeSavedDestination(id, destination) {
  const searches = await getSavedSearches();
  const cleanId = cleanText(id);
  const cleanDestination = cleanText(destination).toLowerCase();
  const filtered = searches.filter((item) => {
    if (cleanId && item.id === cleanId) return false;
    if (!cleanId && cleanDestination && cleanText(item.destination).toLowerCase() === cleanDestination) return false;
    return true;
  });
  await setSavedSearches(filtered);
  await renderSavedSearches();
}

async function renderSavedSearches() {
  const uniqueSearches = dedupeByDestination(await getSavedSearches());
  savedSearchesEl.innerHTML = "";
  compareDestinationsBtn.hidden = uniqueSearches.length < 1;
  compareDestinationsBtn.disabled = uniqueSearches.length < 1;

  if (!uniqueSearches.length) {
    savedSearchesEl.innerHTML = `<div class="card"><div class="card-small">No saved destinations yet.</div></div>`;
    return;
  }

  uniqueSearches.forEach((search) => {
    const card = document.createElement("div");
    card.className = "card card-with-remove";
    const title = escapeHtml(simpleDestinationName(search.rawDestination || search.destination));
    card.innerHTML = `<div class="card-main"><div class="card-title">${title}</div></div><button class="remove-destination" type="button" aria-label="Remove ${title}" title="Remove destination">×</button>`;
    card.querySelector(".remove-destination")?.addEventListener("click", () => removeSavedDestination(search.id, search.destination));
    savedSearchesEl.appendChild(card);
  });
}

async function loadApiKeys() {
  const result = await chrome.storage.local.get([WEATHERAPI_KEY_STORAGE, OPENWEATHER_KEY_STORAGE]);
  if (weatherApiKeyInput) weatherApiKeyInput.value = result[WEATHERAPI_KEY_STORAGE] || "";
  if (openWeatherKeyInput) openWeatherKeyInput.value = result[OPENWEATHER_KEY_STORAGE] || "";
}

async function saveApiKeys() {
  await chrome.storage.local.set({
    [WEATHERAPI_KEY_STORAGE]: cleanText(weatherApiKeyInput?.value || ""),
    [OPENWEATHER_KEY_STORAGE]: cleanText(openWeatherKeyInput?.value || "")
  });
  if (saveApiKeysBtn) {
    const original = saveApiKeysBtn.textContent;
    saveApiKeysBtn.textContent = "Saved";
    window.setTimeout(() => { saveApiKeysBtn.textContent = original; }, 1400);
  }
}

addDestinationBtn.addEventListener("click", addCurrentDestination);
compareDestinationsBtn.addEventListener("click", compareOnPage);
clearBtn.addEventListener("click", async () => {
  await setSavedSearches([]);
  renderSavedSearches();
});
saveApiKeysBtn?.addEventListener("click", saveApiKeys);

renderSavedSearches();
loadApiKeys();

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "local" && changes[STORAGE_KEY]) renderSavedSearches();
});
