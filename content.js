(function () {
  const STORAGE_KEY = "bookingWeatherSearches";
  const WEATHERAPI_KEY_STORAGE = "clearSkyWatchWeatherApiKey";
  const OPENWEATHER_KEY_STORAGE = "clearSkyWatchOpenWeatherApiKey";
  const MONTHLY_STATS_CACHE_STORAGE = "clearSkyWatchMonthlyStatsCache";
  const WEATHER_PREFETCH_CACHE_STORAGE = "clearSkyWatchWeatherPrefetchCache";
  const WIDGET_ID = "wtn-weather-widget";
  const WIDGET_LAUNCHER_ID = "wtn-weather-widget-launcher";
  const TOAST_ID = "wtn-weather-toast";
  const MODAL_ID = "wtn-weather-modal";
  const WIDGET_POSITION_STORAGE = "clearSkyWatchWidgetPosition";
  const LAUNCHER_POSITION_STORAGE = "clearSkyWatchLauncherPosition";
  const LAST_TRIP_DATES_STORAGE = "clearSkyWatchLastTripDates";
  const WIDGET_DISMISSED_SESSION = "clearSkyWatchWidgetDismissed";
  let bookingLiveDestinationOverride = null;
  let bookingLiveDestinationTouchedAtMs = 0;
  let bookingLiveRenderTimer = null;
  let clearSkyWatchSaveInProgress = false;

  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  function cleanText(value) {
    return value ? String(value).replace(/\s+/g, " ").trim() : "";
  }

  function escapeHtml(value) {
    return String(value || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }


  function normalizeLabelToken(value) {
    return cleanText(value)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  }


  function normalizeDestinationDisplayText(value) {
    // Clean noisy destination strings from travel sites before saving/displaying.
    // Examples: "A...barcelone", "À Barcelone", "To Barcelona", "Destination: Barcelona" -> "Barcelona/Barcelone".
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

  function getUserLanguage() {
    return (navigator.language || navigator.userLanguage || "en").split("-")[0] || "en";
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
      const compact = words.map((word, index) => {
        if (index === 0 || word.length <= 4) return word;
        return `${word.slice(0, 1)}.`;
      }).join(" ");
      if (compact.length <= 30) return compact;
    }

    return `${text.slice(0, 29)}…`;
  }

  function simpleDestinationName(value) {
    // UI rule: keep destination names simple.
    // Selected destinations show only one short city/local-area label, never dates, source site,
    // geocoding administrative text, or a complex full address.
    let text = normalizeDestinationDisplayText(value);
    if (!text) return "";

    text = cleanBookingDestinationCandidate(text) || text;
    text = normalizeDestinationDisplayText(text
      .replace(/\s+[-–—|•>]\s+.*$/g, "")
      .replace(/\b(check[-\s]?in|check[-\s]?out|dates?|guests?|adults?|children|rooms?|search|rechercher|chercher)\b.*$/i, "")
      .replace(/^[,;:|•\-]+|[,;:|•\-]+$/g, "")
    );

    // If a site returns "City, Country" or a full address, keep the local name for UI display.
    const firstPart = cleanText(text.split(",")[0]);
    if (firstPart && !isBadDestinationText(firstPart)) text = firstPart;

    return abbreviateDestinationName(text);
  }

  function isCountryOnlyLocation(input, location) {
    const raw = normalizeLabelToken(input);
    const name = normalizeLabelToken(location?.name || "");
    const country = normalizeLabelToken(location?.country || "");
    const featureCode = cleanText(location?.featureCode || "").toUpperCase();
    const locationType = normalizeLabelToken(location?.type || location?.osmValue || "");
    const locationClass = normalizeLabelToken(location?.className || location?.osmKey || "");

    if (!raw || !location) return false;
    if (/^PCL[A-Z]?/.test(featureCode)) return true;
    if (locationType === "country" || locationType === "administrative" && locationClass === "place") return true;
    if (locationClass === "boundary" && locationType === "administrative" && name && country && name === country && raw === country) return true;
    if (country && raw === country && (!location.admin1 && !location.admin2 && !location.admin3)) return true;
    if (name && country && name === country && raw === name) return true;
    return false;
  }

  function destinationBaseName(search, location) {
    return simpleDestinationName(search?.rawDestination || search?.destination || location?.name || "");
  }

  function formatDestinationLabel(search, location, showCountry) {
    const base = destinationBaseName(search, location);
    const country = cleanText(location?.country || "");
    const label = showCountry && country ? `${base}, ${country}` : base;
    return abbreviateDestinationName(label);
  }

  function showDestinationError(message) {
    injectStyles();
    const existing = document.getElementById(TOAST_ID);
    if (existing) existing.remove();
    const toast = document.createElement("div");
    toast.id = TOAST_ID;
    toast.innerHTML = `<div class="wtn-ok-row"><div class="wtn-ok-icon">!</div><div><div class="wtn-ok-text">${escapeHtml(message)}</div><div class="wtn-ok-preview">Use a municipality, district or county, not a whole country.</div></div></div>`;
    document.body.appendChild(toast);
    window.setTimeout(() => toast.remove(), 4200);
  }

  async function validateDestinationForSave(destination) {
    const cleaned = cleanText(destination);
    if (!cleaned) return null;

    // Saving must never be blocked by slow or unavailable weather/geocoding services.
    // Geocoding is still attempted immediately so prefetch can start, but if it fails
    // the destination is saved with the typed/parsed name and weather loads later.
    let location = null;
    try {
      location = await Promise.race([
        geocodeDestination(cleaned),
        new Promise((resolve) => window.setTimeout(() => resolve(null), 4500))
      ]);
    } catch (_) {
      location = null;
    }

    if (location && isCountryOnlyLocation(cleaned, location)) {
      showDestinationError("Please select a city, district or county");
      return null;
    }

    return {
      location,
      destination: simpleDestinationName(cleaned),
      validationPending: !location
    };
  }

  function formatShortDate(dateString) {
    if (!dateString) return "";
    const date = new Date(`${dateString}T00:00:00`);
    if (Number.isNaN(date.getTime())) return dateString;
    return `${String(date.getDate()).padStart(2, "0")} ${MONTHS[date.getMonth()]}`;
  }

  function ensureTripDates(dates) {
    const validCheckin = normalizeDate(dates?.checkin || "");
    const validCheckout = normalizeDate(dates?.checkout || "");
    if (validCheckin || validCheckout) {
      const checkin = validCheckin || validCheckout;
      const checkout = validCheckout || validCheckin || checkin;
      return {
        ...dates,
        checkin,
        checkout,
        label: `${checkin} → ${checkout}`,
        isDefault: Boolean(dates?.isDefault)
      };
    }

    const label = cleanText(dates?.label || "");
    if (label) {
      const parsed = parseHumanDateRange(label);
      if (parsed?.checkin && parsed?.checkout) return { ...parsed, isDefault: false };
    }

    return getDefaultTripDates();
  }

  function formatDateRange(dates) {
    const safeDates = ensureTripDates(dates);
    const start = formatShortDate(safeDates.checkin) || "?";
    const end = formatShortDate(safeDates.checkout) || start;
    return `${start} - ${end}`;
  }

  function getSiteName() {
    const host = window.location.hostname.replace(/^www\./, "").toLowerCase();
    const known = [
      ["abritel", "Abritel"], ["aegeanair", "Aegean Airlines"], ["aerlingus", "Aer Lingus"], ["aeromexico", "Aeromexico"],
      ["agoda", "Agoda"], ["airbnb", "Airbnb"], ["aircanada", "Air Canada"], ["airchina", "Air China"],
      ["aireuropa", "Air Europa"], ["airfrance", "Air France"], ["alaskaair", "Alaska Airlines"], ["americanairlines", "American Airlines"],
      ["austrian", "Austrian Airlines"], ["bahn.de", "Bahn.de"], ["ba.com", "British Airways"], ["britishairways", "British Airways"],
      ["booking", "Booking.com"], ["brusselsairlines", "Brussels Airlines"], ["cathaypacific", "Cathay Pacific"], ["delta", "Delta"],
      ["easyjet", "easyJet"], ["emirates", "Emirates"], ["etihad", "Etihad Airways"], ["eurowings", "Eurowings"],
      ["expedia", "Expedia"], ["finnair", "Finnair"], ["flights.google", "Google Flights"], ["google", "Google Flights"],
      ["flysas", "SAS"], ["flytap", "TAP Air Portugal"], ["gites.fr", "Gites.fr"], ["greengo", "GreenGo"],
      ["holidu", "Holidu"], ["hostelworld", "Hostelworld"], ["hotels", "Hotels.com"], ["iberia", "Iberia"],
      ["ita-airways", "ITA Airways"], ["jet2", "Jet2"], ["kayak", "Kayak"], ["klm", "KLM"], ["klook", "Klook"],
      ["lastminute", "lastminute.com"], ["latamairlines", "LATAM Airlines"], ["liligo", "Liligo"], ["lufthansa", "Lufthansa"],
      ["momondo", "Momondo"], ["norwegian", "Norwegian"], ["opodo", "Opodo"], ["orbitz", "Orbitz"], ["priceline", "Priceline"],
      ["qantas", "Qantas"], ["qatarairways", "Qatar Airways"], ["ryanair", "Ryanair"], ["sas.dk", "SAS"],
      ["singaporeair", "Singapore Airlines"], ["skyscanner", "Skyscanner"], ["swiss", "SWISS"], ["transavia", "Transavia"],
      ["travelocity", "Travelocity"], ["travix", "Travix"], ["trivago", "Trivago"], ["trip.com", "Trip.com"],
      ["tripadvisor", "Tripadvisor"], ["turkishairlines", "Turkish Airlines"], ["united", "United Airlines"], ["volotea", "Volotea"],
      ["vrbo", "Vrbo"], ["vueling", "Vueling"], ["wizzair", "Wizz Air"]
    ];
    const found = known.find(([needle]) => host.includes(needle));
    return found ? found[1] : host;
  }

  function isSupportedTravelHost() {
    const host = window.location.hostname.toLowerCase();
    const knownTravelHosts = [
      "abritel", "aegeanair", "aerlingus", "aeromexico", "agoda", "airbnb", "aircanada", "airchina", "aireuropa", "airfrance",
      "alaskaair", "americanairlines", "austrian", "bahn.de", "ba.com", "britishairways", "booking", "brusselsairlines",
      "cathaypacific", "delta", "easyjet", "emirates", "etihad", "eurowings", "expedia", "finnair", "flights.google", "flysas", "flytap",
      "gites.fr", "google", "greengo", "holidu", "hostelworld", "hotels", "iberia", "ita-airways", "jet2", "kayak", "klm", "klook",
      "lastminute", "latamairlines", "liligo", "lufthansa", "momondo", "norwegian", "opodo", "orbitz", "priceline", "qantas",
      "qatarairways", "ryanair", "sas.dk", "singaporeair", "skyscanner", "swiss", "transavia", "travelocity", "travix", "trivago", "trip.com",
      "tripadvisor", "turkishairlines", "united", "volotea", "vrbo", "vueling", "wizzair"
    ];
    if (host.includes("google") && !/\/travel\/flights|\/flights|tbm=flm/.test(window.location.href)) return false;
    return knownTravelHosts.some((name) => host.includes(name));
  }

  function isLikelyTravelPage() {
    // Keep Clear Sky Watch callable but not invasive: the floating panel is only
    // allowed to auto-appear on the supported travel websites listed in the docs.
    return isSupportedTravelHost();
  }

  function isBadDestinationText(text) {
    const value = cleanText(text).toLowerCase();
    if (!value) return true;
    if (value.length < 2 || value.length > 80) return true;

    // Generic travel UI labels. These are not destinations.
    const exactBadValues = new Set([
      "home",
      "homes",
      "stays",
      "rooms",
      "experiences",
      "airbnb",
      "anywhere",
      "i'm flexible",
      "im flexible",
      "flexible",
      "search destinations",
      "start your search"
    ]);

    if (exactBadValues.has(value)) return true;

    return /destination|where|location|going|city|hotel|search|arrival|departure|date|check|guest|adult|children|room|voyage|chercher|rechercher|destination\/hotel/i.test(value);
  }


  function cleanBookingDestinationCandidate(value) {
    let text = normalizeDestinationDisplayText(value)
      .replace(/^destination\s*[:\-]?\s*/i, "")
      .replace(/^where\s*to\??\s*/i, "")
      .replace(/^going\s*to\??\s*/i, "")
      .replace(/^search\s*[:\-]?\s*/i, "")
      .replace(/^ville\s*[:\-]?\s*/i, "")
      .replace(/^où\s*[:\-]?\s*/i, "");
    text = cleanText(text);
    if (!text) return "";
    text = text
      .replace(/\b(check[-\s]?in|check[-\s]?out|dates?|guests?|adults?|children|rooms?|search|rechercher|chercher)\b.*$/i, "")
      .replace(/\b(properties|stays|hotels?)\b.*$/i, "");
    text = normalizeDestinationDisplayText(text.replace(/^[,;:|•\-]+|[,;:|•\-]+$/g, ""));
    const lower = text.toLowerCase();
    const exactBad = new Set(["destination", "where", "where to", "going", "city", "ville", "search", "rechercher", "chercher", "destination/hotel", "destination / hotel"]);
    if (exactBad.has(lower)) return "";
    if (text.length < 2 || text.length > 80) return "";
    if (/\b(check[-\s]?in|check[-\s]?out|guest|adult|children|room|date|calendar|rechercher|chercher)\b/i.test(text)) return "";
    return text;
  }

  function isBadBookingDestinationCandidate(value) {
    const text = cleanBookingDestinationCandidate(value);
    const lower = text.toLowerCase();
    if (!text) return true;
    const exactBad = new Set([
      "results", "search results", "popular", "popular destinations", "recent", "recent searches",
      "nearby", "current location", "all destinations", "destination", "city", "where", "where to",
      "select destination", "choose destination", "choose a destination"
    ]);
    if (exactBad.has(lower)) return true;
    if (/^(search|select|choose|enter|type|start typing|destination|where|city)$/i.test(text)) return true;
    if (/\b(check[-\s]?in|check[-\s]?out|guest|adult|children|room|date|calendar|rechercher|chercher|search results|popular destinations)\b/i.test(text)) return true;
    return false;
  }

  function firstBookingDestinationFromRawText(raw) {
    const source = String(raw || "");
    const pieces = source
      .split(/\n|\r|\t|\||•|›|→| {2,}/)
      .map((part) => cleanBookingDestinationCandidate(part))
      .filter((part) => part && !isBadBookingDestinationCandidate(part));
    if (pieces.length) return pieces[0];
    const candidate = cleanBookingDestinationCandidate(source);
    return isBadBookingDestinationCandidate(candidate) ? "" : candidate;
  }

  function getUrlParam(...names) {
    const url = new URL(window.location.href);
    for (const name of names) {
      const value = url.searchParams.get(name);
      if (value) return cleanText(decodeURIComponent(value.replace(/\+/g, " ")));
    }
    return "";
  }

  function getJsonLdLocation() {
    const scripts = Array.from(document.querySelectorAll('script[type="application/ld+json"]'));
    for (const script of scripts) {
      try {
        const data = JSON.parse(script.textContent);
        const items = Array.isArray(data) ? data : [data];
        for (const item of items) {
          const candidates = [item.address?.addressLocality, item.address?.addressRegion, item.location?.name, item.areaServed?.name, item.name];
          for (const candidate of candidates) {
            const cleaned = cleanText(candidate);
            if (cleaned && !isBadDestinationText(cleaned)) return cleaned;
          }
        }
      } catch (_) {}
    }
    return "";
  }

  function isBookingHost() {
    return window.location.hostname.toLowerCase().includes("booking");
  }

  function isVisibleElement(el) {
    if (!el || !el.getBoundingClientRect) return false;
    const rect = el.getBoundingClientRect();
    const style = window.getComputedStyle(el);
    return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
  }

  function getElementTextValue(el) {
    if (!el) return "";
    return cleanText(
      el.value ||
      el.getAttribute?.("value") ||
      el.innerText ||
      el.textContent ||
      el.getAttribute?.("aria-label") ||
      el.getAttribute?.("title") ||
      el.getAttribute?.("data-label") ||
      ""
    );
  }

  function isBookingDestinationElement(el) {
    if (!isBookingHost() || !el || el === document.body || el === document.documentElement) return false;
    const tag = (el.tagName || "").toLowerCase();
    const attrs = [
      el.getAttribute?.("name"),
      el.getAttribute?.("id"),
      el.getAttribute?.("placeholder"),
      el.getAttribute?.("aria-label"),
      el.getAttribute?.("data-testid"),
      el.getAttribute?.("data-testid-name"),
      el.getAttribute?.("role"),
      el.className
    ].map((v) => cleanText(v)).join(" ").toLowerCase();

    if (tag === "input" && cleanText(el.getAttribute("name")).toLowerCase() === "ss") return true;
    const inputType = cleanText(el.getAttribute("type") || "text").toLowerCase();
    if (
      tag === "input" &&
      /^(search|text|hidden)$/.test(inputType) &&
      /destination|where|going|city|place|location|ss|search|ville|où|ou|accommodation|breadcrumb/.test(attrs)
    ) {
      return true;
    }
    if (tag === "input" && targetLooksInsideBookingDestinationSearch(el)) return true;
    if (tag === "textarea" && /destination|where|going|city|place|location|ville|où|ou/.test(attrs)) return true;
    if (el.isContentEditable && /destination|where|going|city|place|location|ville|où|ou|search/.test(attrs)) return true;
    return false;
  }

  function targetLooksInsideBookingDestinationSearch(el) {
    if (!isBookingHost() || !el) return false;
    const container = el.closest?.('[data-testid*="searchbox" i], [data-testid*="destination" i], [role="combobox"], form, header, [class*="search" i], [class*="destination" i]');
    if (!container) return false;
    const text = cleanText([
      container.getAttribute?.("data-testid"),
      container.getAttribute?.("aria-label"),
      container.getAttribute?.("class"),
      container.textContent
    ].join(" ")).toLowerCase();
    return /destination|where|going|city|place|location|ss|search|ville|où|ou/.test(text);
  }

  function getBookingDestinationFromVisibleInputs() {
    if (!isBookingHost()) return null;
    const active = document.activeElement;
    if (isBookingDestinationElement(active)) {
      const value = cleanBookingDestinationCandidate(getElementTextValue(active));
      if (!value) return "";
      return value;
    }

    const selectors = [
      'input[name="ss"]',
      'input[name*="ss" i]',
      'input[name*="destination" i]',
      'input[id*="destination" i]',
      'input[placeholder*="Where" i]',
      'input[placeholder*="destination" i]',
      'input[placeholder*="city" i]',
      'input[placeholder*="ville" i]',
      'input[placeholder*="où" i]',
      'input[aria-label*="destination" i]',
      'input[aria-label*="where" i]',
      'input[aria-label*="city" i]',
      'input[aria-label*="ville" i]',
      '[contenteditable="true"][aria-label*="destination" i]',
      '[contenteditable="true"][aria-label*="where" i]',
      '[data-testid*="destination" i] input',
      '[data-testid*="searchbox" i] input[type="search"]',
      '[data-testid*="searchbox" i] input[type="text"]'
    ];

    for (const selector of selectors) {
      let elements = [];
      try { elements = Array.from(document.querySelectorAll(selector)); } catch (_) { elements = []; }
      for (const el of elements) {
        if (!isVisibleElement(el)) continue;
        const value = cleanBookingDestinationCandidate(getElementTextValue(el));
        if (value) return value;
      }
    }
    return null;
  }

  function getBookingLiveDestinationOverride() {
    if (!isBookingHost()) return null;
    if (bookingLiveDestinationOverride === null) return null;
    if (Date.now() - bookingLiveDestinationTouchedAtMs > 1000 * 60 * 10) return null;
    return bookingLiveDestinationOverride;
  }


  function setBookingLiveDestinationOverride(value) {
    if (!isBookingHost()) return false;
    const cleaned = cleanBookingDestinationCandidate(value);
    if (!cleaned) return false;
    bookingLiveDestinationOverride = cleaned;
    bookingLiveDestinationTouchedAtMs = Date.now();
    scheduleBookingLiveRender();
    return true;
  }

  function extractBookingSuggestionDestinationFromElement(target) {
    if (!isBookingHost() || !target) return "";
    const container = target.closest?.('[role="option"], [aria-selected="true"], [role="listitem"], li, button, a, [data-testid*="autocomplete" i], [data-testid*="destination" i], [data-testid*="searchbox" i], [data-testid*="suggest" i], [data-testid*="option" i], [role="button"]') || target;
    const rawText = container?.innerText || container?.textContent || container?.getAttribute?.("aria-label") || container?.getAttribute?.("title") || "";
    return firstBookingDestinationFromRawText(rawText);
  }


  function getBookingSelectedDestinationFromDom() {
    if (!isBookingHost()) return "";
    const selectors = [
      '[data-testid="destination-container"]',
      '[data-testid="destination"]',
      '[data-testid*="destination" i]',
      '[data-testid*="searchbox" i]',
      'button[aria-label*="destination" i]',
      'button[aria-label*="Where" i]',
      '[role="combobox"][aria-expanded="false"]',
      '[aria-haspopup="listbox"][aria-expanded="false"]'
    ];
    for (const selector of selectors) {
      let elements = [];
      try { elements = Array.from(document.querySelectorAll(selector)); } catch (_) { elements = []; }
      for (const el of elements) {
        if (!isVisibleElement(el)) continue;
        const candidate = firstBookingDestinationFromRawText(el.value || el.getAttribute?.("value") || el.getAttribute?.("aria-label") || el.getAttribute?.("title") || el.innerText || el.textContent || "");
        if (candidate) return candidate;
      }
    }
    return "";
  }

  function getBookingDestinationFromVisibleSearchControls() {
    if (!isBookingHost()) return "";
    const selectors = [
      'input[name="ss"]',
      'input[name*="ss" i]',
      'input[aria-label*="destination" i]',
      'input[placeholder*="destination" i]',
      'input[placeholder*="Where" i]',
      'input[placeholder*="ville" i]',
      '[data-testid="destination-container"]',
      '[data-testid*="destination" i]',
      '[data-testid*="searchbox" i] input',
      '[data-testid*="searchbox" i] button',
      'button[aria-label*="destination" i]',
      'button[aria-label*="Where" i]',
      'button[aria-label*="ville" i]',
      '[role="combobox"]',
      '[aria-haspopup="listbox"]'
    ];
    for (const selector of selectors) {
      let elements = [];
      try { elements = Array.from(document.querySelectorAll(selector)); } catch (_) { elements = []; }
      for (const el of elements) {
        if (!isVisibleElement(el)) continue;
        const candidate = firstBookingDestinationFromRawText(el.value || el.getAttribute?.("value") || el.innerText || el.textContent || el.getAttribute?.("aria-label") || el.getAttribute?.("title") || "");
        if (candidate) return candidate;
      }
    }
    return "";
  }

  function refreshBookingDestinationAfterSelection(target = null) {
    if (!isBookingHost()) return;
    forceBookingDestinationRefreshFromPage(target);

    // Booking.com writes the selected city to a controlled input/button shortly after
    // suggestion selection. Re-read the DOM across a few frames without remounting the popup.
    [0, 10, 25, 60, 120, 240, 420, 800, 1400].forEach((delay) => {
      window.setTimeout(() => forceBookingDestinationRefreshFromPage(target), delay);
    });
  }


  function isDestinationOnlyField(el) {
    if (!el) return false;
    const attrs = [
      el.getAttribute?.("name"), el.getAttribute?.("id"), el.getAttribute?.("placeholder"), el.getAttribute?.("aria-label"),
      el.getAttribute?.("data-testid"), el.getAttribute?.("data-cy"), el.getAttribute?.("autocomplete"), el.className
    ].map((v) => cleanText(v)).join(" ").toLowerCase();
    const negative = /\b(from|origin|departure|depart|départ|departing|leaving|source|pickup|pick-up)\b/.test(attrs);
    const positive = /\b(to|destination|arrival|arrive|where|going|city|place|location|ville|destination airport|aéroport d'arrivée|gare d'arrivée)\b/.test(attrs);
    return positive && !negative;
  }

  function getDestinationOnlyFromInputs() {
    const selectors = [
      'input[name*="destination" i]', 'input[id*="destination" i]', 'input[placeholder*="destination" i]', 'input[aria-label*="destination" i]',
      'input[name="to"]', 'input[id="to"]', 'input[name*="arrival" i]', 'input[id*="arrival" i]', 'input[placeholder*="arrival" i]', 'input[aria-label*="arrival" i]',
      'input[name*="city" i]', 'input[id*="city" i]', 'input[placeholder*="city" i]', 'input[aria-label*="city" i]',
      'input[placeholder*="Where" i]', 'input[placeholder*="going" i]', 'input[placeholder*="ville" i]',
      '[contenteditable="true"][aria-label*="destination" i]', '[contenteditable="true"][aria-label*="arrival" i]', '[contenteditable="true"][aria-label*="where" i]'
    ];
    for (const selector of selectors) {
      let elements = [];
      try { elements = Array.from(document.querySelectorAll(selector)); } catch (_) { elements = []; }
      for (const el of elements) {
        if (!isVisibleElement(el) || !isDestinationOnlyField(el)) continue;
        const cleaned = getElementTextValue(el)
          .replace(/^where\s*to\??\s*/i, "")
          .replace(/^destination\s*/i, "")
          .replace(/^arrival\s*/i, "")
          .replace(/^to\s*/i, "")
          .replace(/^search\s*/i, "");
        if (cleaned && !isBadDestinationText(cleaned)) return cleaned;
      }
    }
    return "";
  }

  function updateBookingLiveDestinationFromElement(el) {
    if (!isBookingHost() || !el) return false;
    if (!isBookingDestinationElement(el) && !targetLooksInsideBookingDestinationSearch(el)) return false;
    const value = cleanBookingDestinationCandidate(getElementTextValue(el));
    if (!value || isBadBookingDestinationCandidate(value)) return false;
    bookingLiveDestinationOverride = value;
    bookingLiveDestinationTouchedAtMs = Date.now();
    return true;
  }

  function forceBookingDestinationRefreshFromPage(target = null) {
    if (!isBookingHost()) return false;
    const candidates = [];
    if (target) {
      candidates.push(extractBookingSuggestionDestinationFromElement(target));
      candidates.push(cleanBookingDestinationCandidate(getElementTextValue(target)));
    }
    const active = document.activeElement;
    if (active) candidates.push(cleanBookingDestinationCandidate(getElementTextValue(active)));
    candidates.push(getBookingDestinationFromVisibleInputs());
    candidates.push(getBookingSelectedDestinationFromDom());
    candidates.push(getBookingDestinationFromVisibleSearchControls());
    const picked = candidates.find((candidate) => candidate && !isBadBookingDestinationCandidate(candidate));
    if (!picked) return false;
    bookingLiveDestinationOverride = picked;
    bookingLiveDestinationTouchedAtMs = Date.now();
    scheduleBookingLiveRender();
    return true;
  }



  function buildSelectedDestinationsMarkup(searches) {
    const normalized = dedupeByDestination(Array.isArray(searches) ? searches : []);
    const count = normalized.length;
    if (!count) return "";
    const visible = normalized.slice(0, 8);
    const savedPills = visible.map((search) => {
      const id = escapeHtml(search.id || savedDestinationKey(search));
      const label = escapeHtml(simpleDestinationName(search.rawDestination || search.destination || "Destination"));
      return `<span class="wtn-destination-pill" data-destination-id="${id}"><span class="wtn-pill-name">${label}</span><button class="wtn-pill-remove" type="button" data-remove-id="${id}" aria-label="Remove ${label}" title="Remove destination">×</button></span>`;
    }).join("");
    return `<div class="wtn-saved-list"><div class="wtn-saved-title">Selected destinations</div><div class="wtn-destination-pill-list">${savedPills}${count > 8 ? `<span class="wtn-destination-pill">+${count - 8} more</span>` : ""}</div><a class="wtn-clear-all" id="wtn-clear-all-link">Clear ALL</a></div>`;
  }

  function bindSelectedDestinationControls(root = document) {
    root.querySelectorAll?.(".wtn-pill-remove")?.forEach((button) => {
      if (button.dataset.wtnBound === "1") return;
      button.dataset.wtnBound = "1";
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        removeDestination(button.getAttribute("data-remove-id"), { refreshComparison: false });
      });
    });
    const clearLink = root.querySelector?.("#wtn-clear-all-link");
    if (clearLink && clearLink.dataset.wtnBound !== "1") {
      clearLink.dataset.wtnBound = "1";
      clearLink.addEventListener("click", clearAllDestinations);
    }
  }

  async function updateSelectedDestinationsInPlace() {
    const widget = document.getElementById(WIDGET_ID);
    if (!widget) return;
    const searches = dedupeByDestination(await getSavedSearches());
    const count = searches.length;
    const actions = widget.querySelector(".wtn-actions");
    if (actions) {
      let compareButton = widget.querySelector("#wtn-compare-btn");
      if (count > 0 && !compareButton) {
        compareButton = document.createElement("button");
        compareButton.className = "wtn-btn wtn-btn-compare";
        compareButton.id = "wtn-compare-btn";
        compareButton.type = "button";
        compareButton.textContent = "Compare destinations";
        compareButton.dataset.wtnBound = "1";
        compareButton.addEventListener("click", (event) => { event.preventDefault(); event.stopPropagation(); compareDestinations().catch((error) => showToast(error?.message || "Comparison could not be opened.")); });
        actions.appendChild(compareButton);
      } else if (compareButton && count < 1) {
        compareButton.remove();
      } else if (compareButton && compareButton.dataset.wtnBound !== "1") {
        compareButton.dataset.wtnBound = "1";
        compareButton.addEventListener("click", (event) => { event.preventDefault(); event.stopPropagation(); compareDestinations().catch((error) => showToast(error?.message || "Comparison could not be opened.")); });
      }
    }

    let list = widget.querySelector(".wtn-saved-list");
    const body = widget.querySelector(".wtn-widget-body");
    if (count > 0) {
      const markup = buildSelectedDestinationsMarkup(searches);
      if (list) {
        list.outerHTML = markup;
      } else if (body) {
        body.insertAdjacentHTML("beforeend", markup);
      }
      bindSelectedDestinationControls(widget);
    } else if (list) {
      list.remove();
    }
  }

  function updateWidgetDestinationAreaInPlace() {
    const widget = document.getElementById(WIDGET_ID);
    if (!widget || !isBookingHost() || isWidgetDismissed()) {
      renderWidget();
      return;
    }
    const data = readBookingSearchData();
    const area = widget.querySelector("[data-wtn-detected-area]");
    if (area) {
      if (data.destination) {
        area.innerHTML = `<div class="wtn-current-destination"><div class="wtn-current-city">${escapeHtml(simpleDestinationName(data.destination))}</div></div>`;
      } else {
        area.innerHTML = `<p class="wtn-helper-note">Destination not detected on this page. Add it manually below.</p><div class="wtn-inline-manual"><input id="wtn-widget-city-input" class="wtn-manual-input" placeholder="Add destination"><button class="wtn-btn wtn-btn-save" id="wtn-widget-add-btn">Add</button></div>`;
        widget.querySelector("#wtn-widget-add-btn")?.addEventListener("click", addManualDestinationFromWidget);
        widget.querySelector("#wtn-widget-city-input")?.addEventListener("keydown", (event) => { if (event.key === "Enter") addManualDestinationFromWidget(); });
      }
    }
    const saveButton = widget.querySelector("#wtn-save-btn");
    if (saveButton) {
      saveButton.disabled = !Boolean(data.destination);
    }
    updateSelectedDestinationsInPlace();
  }

  function scheduleBookingLiveRender() {
    if (bookingLiveRenderTimer) window.clearTimeout(bookingLiveRenderTimer);
    // Do not re-render/rebuild the floating card while the user types on Booking.com.
    // Updating only the detected-destination area removes the one-second disappear/reappear flicker.
    updateWidgetDestinationAreaInPlace();
    bookingLiveRenderTimer = window.setTimeout(() => {
      bookingLiveRenderTimer = null;
      updateWidgetDestinationAreaInPlace();
    }, 40);
  }

  function setupBookingLiveDestinationListeners() {
    if (!isBookingHost() || window.__clearSkyWatchBookingLiveListeners) return;
    window.__clearSkyWatchBookingLiveListeners = true;
    const handler = (event) => {
      if (updateBookingLiveDestinationFromElement(event.target)) scheduleBookingLiveRender();
      else forceBookingDestinationRefreshFromPage(event.target);
    };
    document.addEventListener("beforeinput", handler, true);
    document.addEventListener("input", handler, true);
    document.addEventListener("keyup", handler, true);
    document.addEventListener("change", handler, true);
    document.addEventListener("compositionend", handler, true);
    document.addEventListener("focusin", handler, true);
    const selectionHandler = (event) => refreshBookingDestinationAfterSelection(event.target);
    document.addEventListener("pointerdown", selectionHandler, true);
    document.addEventListener("pointerup", selectionHandler, true);
    document.addEventListener("mousedown", selectionHandler, true);
    document.addEventListener("mouseup", selectionHandler, true);
    document.addEventListener("click", selectionHandler, true);
    document.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === "Tab") refreshBookingDestinationAfterSelection(event.target);
    }, true);

    const observer = new MutationObserver(() => {
      forceBookingDestinationRefreshFromPage(document.activeElement);
    });
    observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["value", "aria-label"] });
  }

  function getAirbnbDestination() {
    if (!window.location.hostname.includes("airbnb")) return "";

    const url = new URL(window.location.href);

    // Airbnb search pages often look like /s/Paris--France/homes.
    // The last path segment is frequently the generic label "homes", so use the part after /s/ instead.
    const pathParts = url.pathname.split("/").filter(Boolean);
    const searchIndex = pathParts.findIndex((part) => part.toLowerCase() === "s");

    if (searchIndex >= 0 && pathParts[searchIndex + 1]) {
      const rawPathDestination = pathParts[searchIndex + 1];
      const cleanedPathDestination = cleanText(
        decodeURIComponent(rawPathDestination)
          .replace(/--/g, ", ")
          .replace(/[-_]+/g, " ")
      );

      if (cleanedPathDestination && !isBadDestinationText(cleanedPathDestination)) {
        return cleanedPathDestination;
      }
    }

    // In many Airbnb URLs, query contains the real searched city.
    const queryDestination = getUrlParam("query", "location", "destination", "place");
    if (queryDestination && !isBadDestinationText(queryDestination)) return queryDestination;

    // Airbnb renders the destination in buttons/labels rather than always in inputs.
    const airbnbSelectors = [
      '[data-testid="structured-search-input-field-query-button"]',
      '[data-testid="little-search-location"]',
      '[aria-label*="Search destinations" i]',
      'button[aria-label*="Where" i]',
      'button[aria-label*="destination" i]'
    ];

    for (const selector of airbnbSelectors) {
      for (const el of document.querySelectorAll(selector)) {
        const raw = el.textContent || el.getAttribute("aria-label") || el.getAttribute("title");
        const cleaned = cleanText(raw)
          .replace(/^where\s*/i, "")
          .replace(/^search destinations\s*/i, "")
          .replace(/^destination\s*/i, "");

        if (cleaned && !isBadDestinationText(cleaned)) return cleaned;
      }
    }

    return "";
  }

  function getTripadvisorDestination() {
    if (!window.location.hostname.toLowerCase().includes("tripadvisor")) return "";

    const urlDestination = getUrlParam("q", "query", "search", "searchQuery", "geoName", "location", "where");
    if (urlDestination && !isBadDestinationText(urlDestination)) return urlDestination;

    const selectors = [
      'input[type="search"]',
      'input[name="q"]',
      'input[placeholder*="Where" i]',
      'input[placeholder*="destination" i]',
      '[data-test-target*="search" i]',
      '[data-automation*="search" i]',
      '[aria-label*="Where" i]',
      '[aria-label*="destination" i]'
    ];
    for (const selector of selectors) {
      for (const el of document.querySelectorAll(selector)) {
        const value = el.value || el.getAttribute("value") || el.textContent || el.getAttribute("aria-label") || el.getAttribute("title");
        const cleaned = cleanText(value)
          .replace(/^where\s*to\??\s*/i, "")
          .replace(/^search\s*/i, "");
        if (cleaned && !isBadDestinationText(cleaned)) return cleaned;
      }
    }

    const path = decodeURIComponent(window.location.pathname.replace(/[-_]+/g, " "));
    const tourism = path.match(/Tourism\s+g\d+\s+([^/]+?)\s+(Vacations|Tourism|Travel|Hotels|Hotel|Restaurants)/i);
    if (tourism) {
      const cleaned = cleanText(tourism[1]);
      if (cleaned && !isBadDestinationText(cleaned)) return cleaned;
    }
    const hotel = path.match(/Hotels\s+g\d+\s+([^/]+?)\s+Hotels/i);
    if (hotel) {
      const cleaned = cleanText(hotel[1]);
      if (cleaned && !isBadDestinationText(cleaned)) return cleaned;
    }
    return "";
  }

  function getDestination() {
    const bookingOverride = getBookingLiveDestinationOverride();
    if (bookingOverride !== null) return bookingOverride;

    const bookingLiveInput = getBookingDestinationFromVisibleInputs() || getBookingSelectedDestinationFromDom() || getBookingDestinationFromVisibleSearchControls();
    if (bookingLiveInput) return bookingLiveInput;

    const tripadvisorDestination = getTripadvisorDestination();
    if (tripadvisorDestination) return tripadvisorDestination;

    const airbnbDestination = getAirbnbDestination();
    if (airbnbDestination) return airbnbDestination;

    const destinationOnlyInput = getDestinationOnlyFromInputs();
    if (destinationOnlyInput) return destinationOnlyInput;

    const urlDestination = getUrlParam(
      "ss", "destination", "destinationName", "dest", "to", "arrival", "arrivalCity",
      "location", "locationName", "where", "query", "q", "place", "placeName", "city",
      "selected_place", "search_query", "searchLocation", "regionName"
    );
    if (urlDestination && !isBadDestinationText(urlDestination)) return urlDestination;

    const selectors = [
      'input[name="ss"]',
      'input[name*="destination" i]',
      'input[id*="destination" i]',
      'input[name*="location" i]',
      'input[id*="location" i]',
      'input[name="query"]',
      'input[name="q"]',
      'input[placeholder*="destination" i]',
      'input[placeholder*="where" i]',
      'input[placeholder*="city" i]',
      'input[placeholder*="going" i]',
      'input[placeholder*="place" i]',
      'input[placeholder*="ville" i]',
      'input[placeholder*="où" i]',
      'input[aria-label*="destination" i]',
      'input[aria-label*="where" i]',
      'input[aria-label*="city" i]',
      'input[aria-label*="ville" i]',
      '[data-testid*="destination" i]',
      '[data-testid*="location" i]',
      '[data-testid*="place" i]',
      '[aria-label*="destination" i]',
      '[aria-label*="where" i]'
    ];

    for (const selector of selectors) {
      for (const el of document.querySelectorAll(selector)) {
        const value = el.value || el.getAttribute("value") || el.textContent || el.getAttribute("aria-label") || el.getAttribute("title");
        const cleaned = cleanText(value);
        if (cleaned && !isBadDestinationText(cleaned)) return cleaned;
      }
    }

    const jsonLdLocation = getJsonLdLocation();
    if (jsonLdLocation) return jsonLdLocation;

    const pathParts = window.location.pathname
      .split("/")
      .map((part) => cleanText(decodeURIComponent(part.replace(/[-_]+/g, " "))))
      .filter((part) => part && !/search|hotel|hotels|stays|homes|home|location|vacation|flights|vols|hebergement|accommodation|rooms/i.test(part));

    if (pathParts.length) {
      const candidate = pathParts[pathParts.length - 1];
      if (!isBadDestinationText(candidate)) return candidate;
    }

    return "";
  }

  function toLocalDateString(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  function addDays(date, days) {
    const copy = new Date(date);
    copy.setDate(copy.getDate() + days);
    return copy;
  }

  function getDefaultTripDates() {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = addDays(start, 4);
    return {
      checkin: toLocalDateString(start),
      checkout: toLocalDateString(end),
      label: "Next 5 days",
      isDefault: true
    };
  }

  const HUMAN_MONTHS = {
    jan: 0, january: 0, janvier: 0,
    feb: 1, february: 1, fevrier: 1, février: 1,
    mar: 2, march: 2, mars: 2,
    apr: 3, april: 3, avr: 3, avril: 3,
    may: 4, mai: 4,
    jun: 5, june: 5, juin: 5,
    jul: 6, july: 6, juillet: 6,
    aug: 7, august: 7, aout: 7, août: 7,
    sep: 8, sept: 8, september: 8, septembre: 8,
    oct: 9, october: 9, octobre: 9,
    nov: 10, november: 10, novembre: 10,
    dec: 11, december: 11, decembre: 11, décembre: 11
  };

  function normalizeHumanMonthName(value) {
    return cleanText(value).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  }

  function removeWeekdayWordsFromDateText(value) {
    // Booking.com can show French weekday labels such as "mardi" or "mar."
    // before a date. "mar." is Tuesday in French, not March. Remove weekday
    // tokens before month parsing so they are never interpreted as months.
    return cleanText(value)
      .replace(/\b(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)\b/gi, " ")
      .replace(/\b(lun|mar|mer|jeu|ven|sam|dim)\.(?=\s*\d)/gi, " ")
      .replace(/\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/gi, " ")
      .replace(/\b(mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)\.(?=\s*\d)/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function inferHumanDate(day, monthName) {
    const month = HUMAN_MONTHS[normalizeHumanMonthName(monthName)];
    const dayNumber = Number(day);
    if (!Number.isFinite(month) || !Number.isFinite(dayNumber)) return "";
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let candidate = new Date(today.getFullYear(), month, dayNumber);
    if (candidate < addDays(today, -1)) candidate = new Date(today.getFullYear() + 1, month, dayNumber);
    return toLocalDateString(candidate);
  }

  function parseSingleHumanDate(text) {
    const raw = removeWeekdayWordsFromDateText(text);
    if (!raw) return "";

    const ymd = raw.match(/(20\d{2})[-\/](\d{1,2})[-\/](\d{1,2})/);
    if (ymd) return normalizeDate(ymd[0]);

    const monthNames = Object.keys(HUMAN_MONTHS)
      .sort((a, b) => b.length - a.length)
      .map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join("|");

    const dayFirst = raw.match(new RegExp(`\b(\d{1,2})\s+(${monthNames})\.?\b`, "i"));
    if (dayFirst) return inferHumanDate(dayFirst[1], dayFirst[2]);

    const monthFirst = raw.match(new RegExp(`\b(${monthNames})\.?\s+(\d{1,2})\b`, "i"));
    if (monthFirst) return inferHumanDate(monthFirst[2], monthFirst[1]);

    return "";
  }

  function parseHumanDateRange(text) {
    const raw = removeWeekdayWordsFromDateText(text);
    if (!raw) return null;
    const yearDates = Array.from(raw.matchAll(/(20\d{2})[-\/](\d{1,2})[-\/](\d{1,2})/g)).map((m) => normalizeDate(m[0]));
    if (yearDates.length >= 2) return { checkin: yearDates[0], checkout: yearDates[1], label: `${yearDates[0]} → ${yearDates[1]}` };

    const monthNames = Object.keys(HUMAN_MONTHS)
      .sort((a, b) => b.length - a.length)
      .map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join("|");
    const monthFirst = Array.from(raw.matchAll(new RegExp(`\\b(${monthNames})\\.?\\s+(\\d{1,2})\\b`, "gi"))).map((m) => inferHumanDate(m[2], m[1]));
    const dayFirst = Array.from(raw.matchAll(new RegExp(`\\b(\\d{1,2})\\s+(${monthNames})\\.?\\b`, "gi"))).map((m) => inferHumanDate(m[1], m[2]));
    const parsed = [...monthFirst, ...dayFirst].filter(Boolean);
    if (parsed.length >= 2) return { checkin: parsed[0], checkout: parsed[1], label: `${parsed[0]} → ${parsed[1]}` };
    return null;
  }

  function normalizeDate(value) {
    const cleaned = cleanText(value);
    if (!cleaned) return "";
    const ymd = cleaned.match(/(20\d{2})[-\/](\d{1,2})[-\/](\d{1,2})/);
    if (ymd) return `${ymd[1]}-${ymd[2].padStart(2, "0")}-${ymd[3].padStart(2, "0")}`;
    const compact = cleaned.match(/(20\d{2})(\d{2})(\d{2})/);
    if (compact) return `${compact[1]}-${compact[2]}-${compact[3]}`;
    return "";
  }

  function getTripDates() {
    const checkinRaw = getUrlParam(
      "checkin", "checkIn", "check_in", "startDate", "start_date", "arrival", "arrivalDate",
      "fromDate", "dateFrom", "depart", "departureDate", "start", "d1", "chkin", "check_in_date"
    );
    const checkoutRaw = getUrlParam(
      "checkout", "checkOut", "check_out", "endDate", "end_date", "departure", "departureDate",
      "toDate", "dateTo", "return", "returnDate", "end", "d2", "chkout", "check_out_date"
    );
    const checkin = normalizeDate(checkinRaw);
    const checkout = normalizeDate(checkoutRaw);

    if (checkin || checkout) {
      return { checkin, checkout: checkout || checkin, label: `${checkin || "?"} → ${checkout || checkin || "?"}`, isDefault: false };
    }

    const selectors = [
      '[data-testid*="date" i]',
      '[data-stid*="date" i]',
      '[aria-label*="date" i]',
      '[class*="date" i]',
      'button[data-testid*="date" i]',
      'button[aria-label*="check" i]',
      'button[aria-label*="arrival" i]',
      'button[aria-label*="departure" i]'
    ];
    const foundTexts = [];
    for (const selector of selectors) {
      document.querySelectorAll(selector).forEach((el) => {
        const text = cleanText(el.textContent || el.value || el.getAttribute("aria-label") || el.getAttribute("title"));
        if (text && /\d/.test(text) && !foundTexts.includes(text) && text.length < 120) foundTexts.push(text);
      });
    }

    for (const text of foundTexts) {
      const parsed = parseHumanDateRange(text);
      if (parsed?.checkin && parsed?.checkout) return { ...parsed, isDefault: false };
    }

    const joined = foundTexts.slice(0, 4).join(" → ");
    const parsedJoined = parseHumanDateRange(joined);
    if (parsedJoined?.checkin && parsedJoined?.checkout) return { ...parsedJoined, isDefault: false };

    return getDefaultTripDates();
  }
  function extractSingleDateFromElement(el) {
    if (!el) return "";
    const values = [
      el.value,
      el.getAttribute?.("value"),
      el.getAttribute?.("data-date"),
      el.getAttribute?.("data-value"),
      el.getAttribute?.("datetime"),
      el.getAttribute?.("aria-label"),
      el.getAttribute?.("title"),
      el.textContent
    ];
    for (const value of values) {
      const cleaned = removeWeekdayWordsFromDateText(value);
      if (!cleaned) continue;
      const iso = normalizeDate(cleaned);
      if (iso) return iso;
      const single = parseSingleHumanDate(cleaned);
      if (single) return single;
    }
    return "";
  }

  function firstDateFromSelectors(scope, selectors, allowHiddenInputs = false) {
    for (const selector of selectors) {
      let elements = [];
      try { elements = Array.from(scope.querySelectorAll(selector)); } catch (_) { elements = []; }
      for (const el of elements) {
        const isHiddenInput = (el.tagName || "").toLowerCase() === "input" && cleanText(el.getAttribute("type")).toLowerCase() === "hidden";
        if (!allowHiddenInputs && !isVisibleElement(el)) continue;
        if (!isVisibleElement(el) && !isHiddenInput) continue;
        if (el.closest?.(`#${WIDGET_ID}, #${MODAL_ID}, #${TOAST_ID}`)) continue;
        const parsed = extractSingleDateFromElement(el);
        if (parsed) return parsed;
      }
    }
    return "";
  }

  function getBookingDateScopes() {
    if (!isBookingHost()) return [];
    const selectors = [
      '[data-testid="searchbox"]',
      '[data-testid*="searchbox" i]',
      'form[action*="searchresults" i]',
      'form[action*="search" i]',
      '[role="search"]'
    ];
    const scopes = [];
    const seen = new Set();
    selectors.forEach((selector) => {
      let elements = [];
      try { elements = Array.from(document.querySelectorAll(selector)); } catch (_) { elements = []; }
      elements.forEach((el) => {
        if (!el || el.closest?.(`#${WIDGET_ID}, #${MODAL_ID}, #${TOAST_ID}`)) return;
        const rect = el.getBoundingClientRect?.();
        const key = rect ? `${Math.round(rect.left)}:${Math.round(rect.top)}:${Math.round(rect.width)}:${Math.round(rect.height)}` : selector;
        if (!seen.has(key)) {
          seen.add(key);
          scopes.push(el);
        }
      });
    });
    scopes.push(document);
    return scopes;
  }

  function getBookingVisibleTripDates() {
    if (!isBookingHost()) return null;

    const startSelectors = [
      'input[name="checkin"]',
      'input[name*="checkin" i]',
      'input[id*="checkin" i]',
      '[data-testid*="date-display-field-start" i]',
      '[data-testid*="checkin" i]',
      '[data-testid*="check-in" i]',
      'button[aria-label*="check-in" i]',
      'button[aria-label*="arrival" i]',
      'button[aria-label*="arrivée" i]',
      'button[aria-label*="arrivee" i]',
      '[aria-label*="check-in" i]',
      '[aria-label*="arrival" i]',
      '[aria-label*="arrivée" i]',
      '[aria-label*="arrivee" i]'
    ];
    const endSelectors = [
      'input[name="checkout"]',
      'input[name*="checkout" i]',
      'input[id*="checkout" i]',
      '[data-testid*="date-display-field-end" i]',
      '[data-testid*="checkout" i]',
      '[data-testid*="check-out" i]',
      'button[aria-label*="check-out" i]',
      'button[aria-label*="departure" i]',
      'button[aria-label*="départ" i]',
      'button[aria-label*="depart" i]',
      '[aria-label*="check-out" i]',
      '[aria-label*="departure" i]',
      '[aria-label*="départ" i]',
      '[aria-label*="depart" i]'
    ];

    for (const scope of getBookingDateScopes()) {
      // Prefer visible date controls. Hidden inputs may still contain stale Booking.com SPA values.
      const checkin = firstDateFromSelectors(scope, startSelectors, false) || firstDateFromSelectors(scope, startSelectors, true);
      const checkout = firstDateFromSelectors(scope, endSelectors, false) || firstDateFromSelectors(scope, endSelectors, true);
      if (checkin || checkout) {
        const start = checkin || checkout;
        const end = checkout || checkin || start;
        return { checkin: start, checkout: end, label: `${start} → ${end}`, isDefault: false };
      }

      const foundTexts = [];
      const foundSingles = [];
      const addText = (value) => {
        const text = removeWeekdayWordsFromDateText(value);
        if (!text || !/\d/.test(text) || text.length >= 180 || foundTexts.includes(text)) return;
        foundTexts.push(text);
        const single = parseSingleHumanDate(text);
        if (single && !foundSingles.includes(single)) foundSingles.push(single);
      };

      const selectors = [
        '[data-testid*="date" i]',
        '[data-testid*="calendar" i]',
        '[aria-label*="date" i]',
        '[aria-label*="check" i]',
        '[aria-label*="arrival" i]',
        '[aria-label*="departure" i]',
        '[aria-label*="arrivée" i]',
        '[aria-label*="départ" i]',
        'button[data-testid*="date" i]',
        'button[aria-label*="date" i]',
        'button[aria-label*="check" i]',
        'button[aria-label*="arrival" i]',
        'button[aria-label*="departure" i]',
        'input[name*="date" i]',
        'input[name*="check" i]'
      ];
      for (const selector of selectors) {
        let elements = [];
        try { elements = Array.from(scope.querySelectorAll(selector)); } catch (_) { elements = []; }
        for (const el of elements) {
          const isHiddenInput = (el.tagName || "").toLowerCase() === "input" && cleanText(el.getAttribute("type")).toLowerCase() === "hidden";
          if (!isVisibleElement(el) && !isHiddenInput) continue;
          if (el.closest?.(`#${WIDGET_ID}, #${MODAL_ID}, #${TOAST_ID}`)) continue;
          addText(el.value);
          addText(el.getAttribute?.("value"));
          addText(el.getAttribute?.("data-date"));
          addText(el.getAttribute?.("data-value"));
          addText(el.getAttribute?.("datetime"));
          addText(el.getAttribute?.("aria-label"));
          addText(el.getAttribute?.("title"));
          addText(el.textContent);
        }
      }

      for (const text of foundTexts) {
        const parsed = parseHumanDateRange(text);
        if (parsed?.checkin && parsed?.checkout) return { ...parsed, isDefault: false };
      }
      if (foundSingles.length >= 2) {
        return { checkin: foundSingles[0], checkout: foundSingles[1], label: `${foundSingles[0]} → ${foundSingles[1]}`, isDefault: false };
      }
      const joined = foundTexts.slice(0, 10).join(" → ");
      const parsedJoined = parseHumanDateRange(joined);
      if (parsedJoined?.checkin && parsedJoined?.checkout) return { ...parsedJoined, isDefault: false };
    }
    return null;
  }

  function bookingHasVisibleDateControls() {
    if (!isBookingHost()) return false;
    const selectors = [
      '[data-testid*="date" i]',
      '[data-testid*="calendar" i]',
      'button[aria-label*="date" i]',
      'button[aria-label*="check" i]',
      'button[aria-label*="arrival" i]',
      'button[aria-label*="departure" i]',
      'button[aria-label*="arrivée" i]',
      'button[aria-label*="départ" i]'
    ];
    return selectors.some((selector) => {
      try { return Array.from(document.querySelectorAll(selector)).some((el) => isVisibleElement(el) && !el.closest?.(`#${WIDGET_ID}, #${MODAL_ID}, #${TOAST_ID}`)); }
      catch (_) { return false; }
    });
  }

  function getTripDatesFromVisiblePageControls() {
    const bookingDates = getBookingVisibleTripDates();
    if (bookingDates?.checkin || bookingDates?.checkout || bookingDates?.label) return bookingDates;

    const selectors = [
      '[data-testid*="date" i]',
      '[data-stid*="date" i]',
      '[aria-label*="date" i]',
      '[class*="date" i]',
      'button[data-testid*="date" i]',
      'button[aria-label*="check" i]',
      'button[aria-label*="arrival" i]',
      'button[aria-label*="departure" i]',
      'button[aria-label*="date" i]',
      '[data-testid*="calendar" i]',
      '[class*="calendar" i] button'
    ];

    const foundTexts = [];
    const foundSingles = [];
    const addText = (value) => {
      const text = removeWeekdayWordsFromDateText(value);
      if (text && /\d/.test(text) && text.length < 160 && !foundTexts.includes(text)) {
        foundTexts.push(text);
        const single = parseSingleHumanDate(text);
        if (single && !foundSingles.includes(single)) foundSingles.push(single);
      }
    };

    for (const selector of selectors) {
      let elements = [];
      try { elements = Array.from(document.querySelectorAll(selector)); } catch (_) { elements = []; }
      elements.forEach((el) => {
        if (!isVisibleElement(el)) return;
        if (el.closest?.(`#${WIDGET_ID}, #${MODAL_ID}, #${TOAST_ID}`)) return;
        addText(el.value);
        addText(el.getAttribute?.("value"));
        addText(el.getAttribute?.("data-date"));
        addText(el.getAttribute?.("data-value"));
        addText(el.getAttribute?.("datetime"));
        addText(el.getAttribute?.("aria-label"));
        addText(el.getAttribute?.("title"));
        addText(el.textContent);
      });
    }

    for (const text of foundTexts) {
      const parsed = parseHumanDateRange(text);
      if (parsed?.checkin && parsed?.checkout) return { ...parsed, isDefault: false };
    }

    if (foundSingles.length >= 2) {
      return { checkin: foundSingles[0], checkout: foundSingles[1], label: `${foundSingles[0]} → ${foundSingles[1]}`, isDefault: false };
    }

    const joined = foundTexts.slice(0, 8).join(" → ");
    const parsedJoined = parseHumanDateRange(joined);
    if (parsedJoined?.checkin && parsedJoined?.checkout) return { ...parsedJoined, isDefault: false };

    return null;
  }

  function getTripDatesFromUrlOnly() {
    const checkinRaw = getUrlParam(
      "checkin", "checkIn", "check_in", "startDate", "start_date", "arrival", "arrivalDate",
      "fromDate", "dateFrom", "depart", "departureDate", "start", "d1", "chkin", "check_in_date"
    );
    const checkoutRaw = getUrlParam(
      "checkout", "checkOut", "check_out", "endDate", "end_date", "departure", "departureDate",
      "toDate", "dateTo", "return", "returnDate", "end", "d2", "chkout", "check_out_date"
    );

    const checkin = normalizeDate(checkinRaw);
    const checkout = normalizeDate(checkoutRaw);

    if (checkin || checkout) {
      return {
        checkin,
        checkout: checkout || checkin,
        label: `${checkin || "?"} → ${checkout || checkin || "?"}`,
        isDefault: false
      };
    }

    return null;
  }

  function getTripDatesFromPageOnly() {
    // Exact Save/Add-click priority:
    // 1) visible current page controls, scoped especially to Booking.com's live searchbox;
    // 2) URL parameters only if no visible date controls exist;
    // 3) null, so the save flow may inherit previous dates only when this search has no dates at all.
    const visibleDates = getTripDatesFromVisiblePageControls();
    if (visibleDates?.checkin || visibleDates?.checkout || visibleDates?.label) {
      return visibleDates;
    }

    // Booking.com SPA URLs can contain old search dates while the visible controls are current.
    // If date controls exist but no date can be parsed from them, do not fall back to stale URL dates.
    if (bookingHasVisibleDateControls()) {
      return null;
    }

    const urlDates = getTripDatesFromUrlOnly();
    if (urlDates?.checkin || urlDates?.checkout || urlDates?.label) {
      return urlDates;
    }

    return null;
  }

  function readBookingSearchData() {
    return {
      destination: simpleDestinationName(getDestination()),
      dates: getTripDatesFromPageOnly() || getTripDates(),
      pageUrl: window.location.href,
      sourceSite: getSiteName(),
      savedAt: new Date().toISOString()
    };
  }

  async function getSavedSearches() {
    const result = await chrome.storage.local.get([STORAGE_KEY]);
    return Array.isArray(result[STORAGE_KEY]) ? result[STORAGE_KEY] : [];
  }

  async function setSavedSearches(searches) {
    const normalized = normalizeSavedSearchesForDisplay(searches);
    await chrome.storage.local.set({ [STORAGE_KEY]: normalized });
  }

  function tripDatesSignature(dates) {
    const safeDates = ensureTripDates(dates);
    return safeDates?.checkin && safeDates?.checkout ? `${safeDates.checkin}|${safeDates.checkout}` : "";
  }

  function savedDestinationKey(search) {
    // Selected destinations are unique by destination name only.
    // Dates are still stored per destination and are updated when the same destination is saved again.
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
        rawDestination: cleanText(search.rawDestination || search.destination),
        destination: simpleDestinationName(search.rawDestination || search.destination),
        dates: ensureTripDates(search.dates),
        savedAt: search.savedAt || new Date().toISOString()
      };
      const key = savedDestinationKey(safe) || safe.id;
      const previous = byKey.get(key);
      // Keep only one visible row per destination name. If the same city is saved again,
      // the newest saved copy wins and carries the newest dates into the final comparison.
      if (!previous || savedAtTime(safe) >= savedAtTime(previous)) byKey.set(key, safe);
    });
    return Array.from(byKey.values()).sort((a, b) => savedAtTime(b) - savedAtTime(a));
  }

  function weatherPrefetchKey(location, dates) {
    if (!location || !dates) return "";
    const lat = Number(location.latitude);
    const lon = Number(location.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return "";
    const dateKey = tripDatesSignature(ensureTripDates(dates));
    return `${lat.toFixed(3)}:${lon.toFixed(3)}:${dateKey}`;
  }

  async function getCachedPrefetchedWeather(location, dates) {
    try {
      const key = weatherPrefetchKey(location, dates);
      if (!key) return null;
      const stored = await chrome.storage.local.get([WEATHER_PREFETCH_CACHE_STORAGE]);
      const item = stored[WEATHER_PREFETCH_CACHE_STORAGE]?.[key];
      if (!item?.data) return null;
      const ageMs = Date.now() - Number(item.savedAtMs || 0);
      if (ageMs > 1000 * 60 * 60 * 6) return null;
      return item.data;
    } catch (_) {
      return null;
    }
  }

  async function setCachedPrefetchedWeather(location, dates, data) {
    try {
      const key = weatherPrefetchKey(location, dates);
      if (!key || !data) return;
      const stored = await chrome.storage.local.get([WEATHER_PREFETCH_CACHE_STORAGE]);
      const cache = stored[WEATHER_PREFETCH_CACHE_STORAGE] || {};
      cache[key] = { savedAt: new Date().toISOString(), savedAtMs: Date.now(), data };
      const keys = Object.keys(cache);
      if (keys.length > 30) {
        keys.sort((a, b) => Number(cache[a]?.savedAtMs || 0) - Number(cache[b]?.savedAtMs || 0));
        keys.slice(0, keys.length - 30).forEach((oldKey) => delete cache[oldKey]);
      }
      await chrome.storage.local.set({ [WEATHER_PREFETCH_CACHE_STORAGE]: cache });
    } catch (_) {
      // Prefetch cache failures must never block saving a destination.
    }
  }

  async function syncSavedSearchDatesForCurrentPage(_dates) {
    // Dates are intentionally NOT synchronized globally.
    // Each destination owns the trip dates captured at the exact “Add destination” click.
    // Never store or reuse a “last date range”, because mixed comparisons may include
    // next-5-days destinations and far-future booking dates in the same table.
  }

  function dedupeByDestination(searches) {
    return normalizeSavedSearchesForDisplay(searches);
  }

  function injectStyles() {
    if (document.getElementById("wtn-weather-styles")) return;
    const style = document.createElement("style");
    style.id = "wtn-weather-styles";
    style.textContent = `
      #${WIDGET_ID}, #${TOAST_ID}, #${MODAL_ID} { font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; box-sizing: border-box; }
      #${WIDGET_ID} *, #${TOAST_ID} *, #${MODAL_ID} * { box-sizing: border-box; }
      #${WIDGET_ID} { position: fixed; right: 24px; top: 88px; width: 350px; max-width: calc(100vw - 32px); background: #fff; color: #111827; border: 1px solid rgba(14,116,144,.14); border-radius: 20px; box-shadow: 0 18px 54px rgba(15,23,42,.16); z-index: 999999; overflow: hidden; }
      #${WIDGET_ID}.wtn-dragging { user-select: none; box-shadow: 0 22px 64px rgba(15,23,42,.22); }
      #${WIDGET_ID}.wtn-user-positioned { right: auto !important; bottom: auto !important; }
      #${WIDGET_LAUNCHER_ID} { position: fixed; right: 18px; top: 92px; width: 58px; height: 58px; border: 2px solid #7c7cff; border-radius: 999px; background: #caffca; color: #7c7cff; box-shadow: 0 12px 28px rgba(15,23,42,.16); z-index: 999999; display: inline-flex; align-items: center; justify-content: center; cursor: grab; padding: 0; overflow: hidden; touch-action: none; }
      #${WIDGET_LAUNCHER_ID}:hover { transform: translateY(-1px); box-shadow: 0 16px 34px rgba(15,23,42,.20); }
      #${WIDGET_LAUNCHER_ID}.wtn-launcher-dragging { cursor: grabbing; transform: none; box-shadow: 0 18px 38px rgba(15,23,42,.22); }
      #${WIDGET_LAUNCHER_ID}.wtn-user-positioned { right: auto !important; bottom: auto !important; }
      #${WIDGET_LAUNCHER_ID} img { width: 90%; height: auto; max-height: 90%; object-fit: contain; object-position: center center; display: block; flex: 0 0 auto; pointer-events: none; }
      .wtn-widget-header { position: relative; padding: 16px 46px 12px 16px; border-bottom: 1px solid #f1d7eb; background: linear-gradient(135deg, #fff7fd 0%, #ffffff 58%); cursor: grab; }
      .wtn-widget-header:active { cursor: grabbing; }
      .wtn-widget-title { display: flex; align-items: center; justify-content: flex-start; text-align: left; gap: 8px; font-size: 16px; font-weight: 850; margin: 0 0 6px; letter-spacing: -.01em; color: #7c7cff; }
      .wtn-brand-logo { width: 34px; height: 22px; flex: 0 0 auto; display: inline-block; object-fit: contain; object-position: left center; overflow: visible; }
      .wtn-widget-close { position: absolute; top: 10px; right: 10px; width: 28px; height: 28px; border: none; border-radius: 999px; background: rgba(255,255,255,.78); color: #64748b; font-size: 20px; line-height: 1; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; }
      .wtn-widget-close:hover { background: #f8fafc; color: #111827; }
      .wtn-widget-subtitle { font-size: 12.5px; color: #475569; margin: 0; line-height: 1.35; }
      .wtn-widget-body { padding: 14px 16px 16px; }
      .wtn-current-destination { background: transparent; border: none; border-radius: 0; padding: 0; margin-bottom: 12px; }
      .wtn-current-city { font-size: 14px; font-weight: 750; color: #111827; padding: 0 2px; }
      .wtn-helper-note { font-size: 12px; color: #64748b; line-height: 1.35; margin: 0 0 10px; }
      .wtn-inline-manual { display: grid; grid-template-columns: 1fr auto; gap: 8px; margin-bottom: 10px; }
      .wtn-inline-manual .wtn-manual-input { min-width: 0; }
      .wtn-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
      .wtn-btn { width: 100%; min-height: 42px; border: none; border-radius: 12px; font-size: 15.6px; font-weight: 750; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; text-align: center; line-height: 1.15; padding: 8px 10px; transition: transform .12s ease, box-shadow .12s ease, opacity .12s ease; }
      .wtn-btn:hover { transform: translateY(-1px); box-shadow: 0 8px 18px rgba(17,24,39,.12); }
      .wtn-btn-save { background: #CACAFF; color: #1f2937; }
      .wtn-btn-compare { background: #e0edbb; color: #1f2937; }
      .wtn-btn:disabled { opacity: .45; cursor: not-allowed; transform: none; box-shadow: none; }
      .wtn-saved-list { margin-top: 12px; padding-top: 12px; border-top: 1px solid #f1f1f1; }
      .wtn-saved-title { font-size: 12px; font-weight: 700; color: #6b7280; margin-bottom: 8px; }
      .wtn-destination-pill-list { display: flex; flex-wrap: wrap; gap: 6px; }
      .wtn-destination-pill { background: #f8fafc; border: 1px solid #e5e7eb; color: #374151; font-size: 12px; font-weight: 650; border-radius: 999px; padding: 5px 8px; }
      .wtn-destination-pill-removable { display: inline-flex; align-items: center; gap: 5px; padding-right: 5px; }
      .wtn-pill-date { color: #6b7280; font-size: 10px; font-weight: 700; margin-left: 1px; }
      .wtn-pill-remove { width: 18px; height: 18px; border: none; border-radius: 999px; background: #fff7fd; color: #9a5889; cursor: pointer; font-size: 14px; line-height: 1; display: inline-flex; align-items: center; justify-content: center; padding: 0; }
      .wtn-pill-remove:hover { background: #f1d7eb; color: #111827; }
      .wtn-clear-all { display: inline-block; margin-top: 9px; color: #0284c7; font-size: 12px; cursor: pointer; text-decoration: none; }
      .wtn-clear-all:hover { text-decoration: underline; }
      #${TOAST_ID} { position: fixed; right: 24px; top: 24px; min-width: 220px; max-width: 320px; background: rgba(255,255,255,.82); backdrop-filter: blur(12px); color: #111827; border: 1px solid rgba(22,163,74,.20); border-radius: 16px; box-shadow: 0 14px 34px rgba(17,24,39,.13); z-index: 1000000; padding: 12px 14px; animation: wtnSlideIn .18s ease-out; }
      @keyframes wtnSlideIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
      .wtn-ok-row { display: flex; align-items: center; gap: 9px; }
      .wtn-ok-icon { width: 24px; height: 24px; border-radius: 999px; background: #16a34a; color: white; display: flex; align-items: center; justify-content: center; font-weight: 900; }
      .wtn-ok-text { font-size: 13px; font-weight: 750; }
      .wtn-ok-preview { margin-top: 2px; font-size: 12px; color: #64748b; font-weight: 600; }
      #${MODAL_ID} { position: fixed; inset: 0; background: rgba(17,24,39,.48); z-index: 1000001; display: flex; align-items: center; justify-content: center; padding: 24px; }
      .wtn-modal-card { width: min(1180px, calc(100vw - 32px)); max-height: calc(100vh - 32px); display: flex; flex-direction: column; background: #fff; border-radius: 22px; box-shadow: 0 30px 80px rgba(17,24,39,.32); overflow: hidden; }
      .wtn-modal-header { padding: 20px 22px 16px; border-bottom: 1px solid #f1f1f1; display: flex; justify-content: space-between; gap: 16px; align-items: flex-start; }
      .wtn-modal-heading { min-width: 0; }
      .wtn-modal-brand { display: flex; align-items: center; justify-content: flex-start; gap: 8px; margin: 0 0 8px; color: #7c7cff; font-size: 18px; font-weight: 850; line-height: 1.1; }
      .wtn-modal-brand-logo { width: 34px; height: 22px; flex: 0 0 auto; display: inline-block; object-fit: contain; object-position: left center; overflow: visible; }
      .wtn-modal-title { font-size: 18px; font-weight: 850; margin: 0 0 4px; color: #374151; }
      .wtn-modal-subtitle { font-size: 13px; color: #6b7280; margin: 0; }
      .wtn-modal-close { border: none; background: transparent; color: #6b7280; cursor: pointer; font-size: 26px; line-height: 1; padding: 0; width: auto; height: auto; display: inline-flex; align-items: center; justify-content: center; }
      .wtn-modal-close:hover { color: #111827; background: transparent; }
      .wtn-modal-body { padding: 18px 22px 22px; overflow: auto; }
      .wtn-manual-row { display: grid; grid-template-columns: 1fr auto; gap: 8px; margin-bottom: 14px; }
      .wtn-manual-input { height: 42px; border: 1px solid #d1d5db; border-radius: 12px; padding: 0 12px; font-size: 14px; outline: none; }
      .wtn-manual-input:focus { border-color: #0284c7; box-shadow: 0 0 0 3px rgba(2,132,199,.12); }
      .wtn-add-manual { background: #CACAFF; color: #1f2937; min-width: 120px; }
      .wtn-loading { background: #f9fafb; border: 1px solid #eee; border-radius: 16px; padding: 18px; font-size: 14px; color: #6b7280; }
      .wtn-table { width: 100%; min-width: 940px; border-collapse: separate; border-spacing: 0 8px; }
      .wtn-table th { text-align: center; font-size: 11px; color: #6b7280; font-weight: 800; padding: 0 10px 3px; text-transform: uppercase; letter-spacing: .02em; }
      .wtn-two-line-th { display: inline-flex; flex-direction: column; align-items: center; gap: 1px; line-height: 1.05; white-space: nowrap; }
      .wtn-two-line-th span { display: block; font-size: 9px; font-weight: 700; letter-spacing: 0; text-transform: none; color: #8a93a3; }
      .wtn-table th:first-child { text-align: left; }
      .wtn-table td { background: #fff; border-top: 1px solid #e5e7eb; border-bottom: 1px solid #e5e7eb; padding: 12px 10px; font-size: 13px; vertical-align: middle; text-align: center; }
      .wtn-table td:first-child { text-align: left; }
      .wtn-weather-number { font-size: 12px; font-weight: 850; color: #111827; white-space: nowrap; }
      .wtn-pending-text { font-size: 12px; font-weight: 750; color: #64748b; white-space: nowrap; }
      .wtn-row-pending td { opacity: 0.72; }
      .wtn-mini-spinner { display: inline-block; width: 10px; height: 10px; border: 2px solid #cbd5e1; border-top-color: #0284c7; border-radius: 999px; animation: wtnSpin .8s linear infinite; margin-right: 6px; vertical-align: -1px; }
      @keyframes wtnSpin { to { transform: rotate(360deg); } }
      .wtn-table td:first-child { border-left: 1px solid #e5e7eb; border-radius: 14px 0 0 14px; }
      .wtn-table td:last-child { border-right: 1px solid #e5e7eb; border-radius: 0 14px 14px 0; }
      .wtn-city { font-weight: 850; font-size: 14px; color: #111827; }
      .wtn-score-number { font-size: 18px; font-weight: 900; color: var(--wtn-score-color, #49cc49); white-space: nowrap; }
      .wtn-scored-row td { border-top-color: #d1d5db; border-bottom-color: #d1d5db; }
      .wtn-scored-row td:first-child { border-left-color: #d1d5db; }
      .wtn-scored-row td:last-child { border-right-color: #d1d5db; }
      .wtn-scored-row.wtn-best-row td { border-top-color: var(--wtn-score-color, #49cc49); border-bottom-color: var(--wtn-score-color, #49cc49); }
      .wtn-scored-row.wtn-best-row td:first-child { border-left-color: var(--wtn-score-color, #49cc49); }
      .wtn-scored-row.wtn-best-row td:last-child { border-right-color: var(--wtn-score-color, #49cc49); }
      .wtn-date { color: #374151; white-space: nowrap; max-width: 96px; overflow: hidden; text-overflow: ellipsis; margin: 0 auto; }
      .wtn-date-mode { margin-top: 3px; color: #64748b; font-size: 11px; font-weight: 700; white-space: nowrap; }
      .wtn-temp-cell { min-width: 118px; }
      .wtn-temp-wrap { position: relative; width: 90px; padding-top: 18px; margin: 0 auto; }
      .wtn-temp-value { position: absolute; top: 0; transform: translateX(-50%); font-size: 12px; font-weight: 850; color: #111827; white-space: nowrap; }
      .wtn-temp-status { margin-top: 4px; font-size: 11px; font-weight: 800; color: #6b7280; text-align: center; white-space: nowrap; }
      .wtn-temp-bar { display: block; width: 90px; height: 10px; border-radius: 999px; background: linear-gradient(90deg, #2395ff 0%, #3ca2ff 4.8%, #56aeff 9.5%, #6fbaff 14.3%, #89c6ff 19.0%, #a2d2ff 23.8%, #bcdfff 28.6%, #ffffff 50%, #f7ecec 55%, #f0d9d9 60%, #e9c6c6 65%, #e2b3b3 70%, #dba0a0 75%, #d38d8d 80%, #cc7a7a 85%, #c56666 90%, #be5454 95%, #b74141 100%); overflow: visible; position: relative; box-shadow: inset 0 0 0 1px rgba(15,23,42,.08); }
      .wtn-temp-marker { position: absolute; top: -3px; transform: translateX(-50%); width: 5px; height: 16px; border-radius: 999px; background: #111827; }
      .wtn-best-row td { box-shadow: 0 8px 22px rgba(15,23,42,.08); }
      .wtn-windsock-icon { position: relative; display: inline-block; width: 18px; height: 13px; vertical-align: -2px; margin-right: 4px; }
      .wtn-windsock-icon::before { content: ""; position: absolute; left: 0; top: 1px; width: 2px; height: 12px; border-radius: 2px; background: #5c5cff; }
      .wtn-windsock-icon::after { content: ""; position: absolute; left: 3px; top: 1px; width: 14px; height: 8px; background: linear-gradient(90deg, #5c5cff 0 45%, #ffffff 45% 60%, #5c5cff 60% 100%); clip-path: polygon(0 0, 100% 18%, 78% 100%, 0 82%); border: 1px solid rgba(92,92,255,.35); }
      .wtn-wind-cell { min-width: 126px; }
      .wtn-wind-wrap { position: relative; width: 90px; padding-top: 18px; margin: 0 auto; }
      .wtn-wind-value { position: absolute; top: 0; transform: translateX(-50%); font-size: 12px; font-weight: 850; color: #0f172a; white-space: nowrap; }
      .wtn-wind-bar { display: block; width: 90px; height: 10px; border-radius: 999px; background: linear-gradient(90deg, #ffffff 0%, #eeeeff 10%, #dedeff 20%, #ceceff 30%, #bdbdff 40%, #adadff 50%, #9d9dff 60%, #8c8cff 70%, #7c7cff 80%, #6c6cff 90%, #5c5cff 100%); position: relative; overflow: visible; }
      .wtn-wind-marker { position: absolute; top: -3px; transform: translateX(-50%); width: 4px; height: 16px; border-radius: 999px; background: #0f172a; }
      .wtn-remove { border: none; background: transparent; color: #6b7280; cursor: pointer; font-size: 20px; line-height: 1; padding: 0; display: inline-flex; align-items: center; justify-content: center; }
      .wtn-remove:hover { color: #111827; background: transparent; }
      .wtn-sun-cell { white-space: nowrap; }
      .wtn-sun-icons { display: inline-flex; align-items: center; gap: 1px; min-width: 42px; letter-spacing: 0; justify-content: center; }
      .wtn-weather-svg-icon { display: inline-block; width: 15px; height: 15px; object-fit: contain; vertical-align: -3px; margin-right: 4px; }
      .wtn-sun-icon-img { display: inline-block; width: 15px; height: 15px; object-fit: contain; vertical-align: -3px; }
      .wtn-sun-hours { color: #111827; font-size: 12px; font-weight: 850; margin-left: 4px; white-space: nowrap; }
      .wtn-source { max-width: 145px; color: #64748b; font-size: 11px; line-height: 1.25; }
      .wtn-error-note { margin-top: 12px; background: #f9fafb; border: 1px solid #e5e7eb; color: #374151; border-radius: 14px; padding: 12px; font-size: 12px; }
    `;
    document.head.appendChild(style);
  }

  async function saveCurrentDestination(sourceData = null) {
    // The Save button must be a pure local-storage action first.
    // It must never depend on weather, geocoding, Booking.com SPA updates, or a later re-render.
    if (clearSkyWatchSaveInProgress) return true;
    clearSkyWatchSaveInProgress = true;
    const button = document.getElementById("wtn-save-btn");
    const previousLabel = button?.textContent || "Save destination";
    if (button) {
      button.disabled = true;
      button.textContent = "Saving...";
    }

    try {
      const data = sourceData || readBookingSearchData();
      const rawDestination = simpleDestinationName(data.destination || getDestination());
      if (!rawDestination) {
        showDestinationError("Destination not detected");
        return false;
      }

      const dates = await getDatesForNewDestination();

      const displayDestination = simpleDestinationName(rawDestination);
      const searches = await getSavedSearches();
      const newKey = savedDestinationKey({ rawDestination, destination: displayDestination });
      const existingIndex = searches.findIndex((item) => savedDestinationKey(item) === newKey);

      let savedSearch = {
        ...(existingIndex >= 0 ? searches[existingIndex] : {}),
        id: existingIndex >= 0 ? searches[existingIndex].id : crypto.randomUUID(),
        name: existingIndex >= 0 ? searches[existingIndex].name : `search #${searches.length + 1}`,
        destination: displayDestination,
        rawDestination,
        dates,
        pageUrl: data.pageUrl || window.location.href,
        sourceSite: data.sourceSite || getSiteName(),
        savedAt: new Date().toISOString(),
        saveStatus: "saved"
      };

      if (existingIndex >= 0) searches[existingIndex] = savedSearch; else searches.push(savedSearch);
      await setSavedSearches(searches);

      const canShowForecastPreview = shouldShowWeatherPreview(dates);
      showSavedToast(displayDestination, canShowForecastPreview ? "Saved. Preparing forecast in background..." : "Saved.");
      // Immediately refresh the selected list from the storage-first save.
      // renderWidget() rebuilds the card, so refresh again after it runs.
      await updateSelectedDestinationsInPlace();
      renderWidget();
      window.setTimeout(updateSelectedDestinationsInPlace, 0);
      window.setTimeout(updateSelectedDestinationsInPlace, 80);
      window.setTimeout(updateSelectedDestinationsInPlace, 250);

      // Enrich only after storage succeeds. This can update the saved item but must never undo the saved destination.
      window.setTimeout(() => {
        (async () => {
          try {
            const validated = await validateDestinationForSave(rawDestination);
            const latest = await getSavedSearches();
            const idx = latest.findIndex((item) => item.id === savedSearch.id);
            if (idx < 0) return;
            if (validated) {
              latest[idx] = {
                ...latest[idx],
                destination: latest[idx].destination || simpleDestinationName(rawDestination),
                location: validated.location || latest[idx].location || null,
                validationPending: Boolean(validated.validationPending)
              };
              savedSearch = latest[idx];
              await setSavedSearches(latest);
              renderWidget();
            }
            prefetchWeatherForSavedSearch(savedSearch, savedSearch.location || null, { updateToast: canShowForecastPreview && Boolean(savedSearch.location) });
          } catch (_) {
            prefetchWeatherForSavedSearch(savedSearch, savedSearch.location || null, { updateToast: false });
          }
        })();
      }, 0);
      return true;
    } finally {
      clearSkyWatchSaveInProgress = false;
      const freshButton = document.getElementById("wtn-save-btn");
      if (freshButton) {
        freshButton.disabled = !Boolean(readBookingSearchData().destination);
        freshButton.textContent = previousLabel;
      }
    }
  }

  async function getDatesForNewDestination() {
      // Exact click moment: use dates from the current search/page if they exist.
      const pageDates = getTripDatesFromPageOnly();

      if (pageDates?.checkin || pageDates?.checkout || pageDates?.label) {
        return ensureTripDates(pageDates);
      }

      // Only when there are no dates at all in this new search:
      // inherit dates from the previously added destination.
      const previous = dedupeByDestination(await getSavedSearches())[0];

      if (previous?.dates?.checkin || previous?.dates?.checkout || previous?.dates?.label) {
        return ensureTripDates(previous.dates);
      }

      // If this is the first destination and no dates exist anywhere, use Next 5 days.
      return getDefaultTripDates();
    }

  function shouldShowWeatherPreview(dates) {
    return Boolean(datesAreForecastCompatible(ensureTripDates(dates), 15));
  }

  function showSavedToast(destination, preview = "Saved") {
    injectStyles();
    const existing = document.getElementById(TOAST_ID);
    if (existing) existing.remove();
    const toast = document.createElement("div");
    toast.id = TOAST_ID;
    toast.innerHTML = `<div class="wtn-ok-row"><div class="wtn-ok-icon">✓</div><div><div class="wtn-ok-text">${escapeHtml(destination)} saved</div><div class="wtn-ok-preview" id="wtn-ok-preview">${escapeHtml(preview)}</div></div></div>`;
    document.body.appendChild(toast);
    window.setTimeout(() => { if (document.body.contains(toast)) toast.remove(); }, 5200);
  }

  function updateSavedToastPreview(preview) {
    const target = document.getElementById("wtn-ok-preview");
    if (target) target.textContent = preview;
  }

  async function prefetchWeatherForSavedSearch(search, knownLocation, options = {}) {
    try {
      const location = knownLocation || search.location || await geocodeDestination(search.destination);
      if (!location) {
        if (options.updateToast) updateSavedToastPreview("Saved. Weather will load during comparison.");
        return null;
      }
      const dates = ensureTripDates(search.dates);
      const cached = await getCachedPrefetchedWeather(location, dates);
      if (cached) {
        if (options.updateToast) {
          const weatherScore = scoreWeather(cached);
          updateSavedToastPreview(`Feels like ${weatherScore.avgFeelsLikeMax || weatherScore.avgMaxTemp}°C · ${rainRiskLabel(weatherScore.avgRain)}`);
        }
        return cached;
      }
      const forecast = await getWeatherForecast(location, dates);
      await setCachedPrefetchedWeather(location, dates, forecast);
      if (options.updateToast) {
        const weatherScore = scoreWeather(forecast);
        updateSavedToastPreview(`Feels like ${weatherScore.avgFeelsLikeMax || weatherScore.avgMaxTemp}°C · ${rainRiskLabel(weatherScore.avgRain)}`);
      }
      return forecast;
    } catch (_) {
      if (options.updateToast) updateSavedToastPreview("Saved. Weather will load during comparison.");
      return null;
    }
  }

  async function getWeatherForSearch(search, location) {
    const dates = ensureTripDates(search.dates);
    const cached = await getCachedPrefetchedWeather(location, dates);
    if (cached) return cached;
    const forecast = await getWeatherForecast(location, dates);
    await setCachedPrefetchedWeather(location, dates, forecast);
    return forecast;
  }

  function captureTripDatesAtAddClick() {
    // Capture page dates only at the moment the user clicks “Add destination”.
    // This prevents a previous destination’s dates from being imposed on the new one.
    return ensureTripDates(getTripDates());
  }

  async function clearAllDestinations() {
    await setSavedSearches([]);
    renderWidget();
    const modal = document.getElementById(MODAL_ID);
    if (modal) modal.remove();
  }

  async function removeDestination(idOrKey, options = {}) {
    const target = cleanText(idOrKey);
    const searches = await getSavedSearches();
    await setSavedSearches(
      searches.filter((item) => item.id !== target && savedDestinationKey(item) !== target)
    );
    await updateSelectedDestinationsInPlace();
    renderWidget();
    if (options.refreshComparison !== false && document.getElementById(MODAL_ID)) compareDestinations();
  }


  async function addManualDestinationFromWidget() {
    const input = document.getElementById("wtn-widget-city-input");
    if (!input) return;
    const city = simpleDestinationName(input.value);
    if (!city) return;
    const destination = simpleDestinationName(city);
    const searches = await getSavedSearches();
    const dates = await getDatesForNewDestination();
    const key = savedDestinationKey({ rawDestination: city, destination });
    let savedSearch = searches.find((item) => savedDestinationKey(item) === key);
    if (savedSearch) {
      savedSearch = { ...savedSearch, destination, rawDestination: city, dates, pageUrl: window.location.href, sourceSite: getSiteName(), savedAt: new Date().toISOString(), manual: true, saveStatus: "saved" };
      const idx = searches.findIndex((item) => item.id === savedSearch.id || savedDestinationKey(item) === key);
      if (idx >= 0) searches[idx] = savedSearch;
    } else {
      savedSearch = { id: crypto.randomUUID(), name: `manual #${searches.length + 1}`, destination, rawDestination: city, dates, location: null, pageUrl: window.location.href, sourceSite: getSiteName(), savedAt: new Date().toISOString(), manual: true, saveStatus: "saved" };
      searches.push(savedSearch);
    }
    await setSavedSearches(searches);
    const canShowForecastPreview = shouldShowWeatherPreview(dates);
    showSavedToast(destination, canShowForecastPreview ? "Saved. Preparing forecast in background..." : "Saved.");
    input.value = "";
    renderWidget();
    (async () => {
      try {
        const validated = await validateDestinationForSave(city);
        if (!validated) return;
        const latest = await getSavedSearches();
        const idx = latest.findIndex((item) => item.id === savedSearch.id || savedDestinationKey(item) === key);
        if (idx < 0) return;
        latest[idx] = { ...latest[idx], destination: latest[idx].destination || destination, location: validated.location || latest[idx].location || null };
        await setSavedSearches(latest);
        prefetchWeatherForSavedSearch(latest[idx], latest[idx].location, { updateToast: canShowForecastPreview && Boolean(latest[idx].location) });
        renderWidget();
      } catch (_) {}
    })();
  }

  async function addManualDestinationFromModal() {
    const input = document.getElementById("wtn-manual-city-input");
    if (!input) return;
    const city = simpleDestinationName(input.value);
    if (!city) return;
    const destination = simpleDestinationName(city);
    const searches = await getSavedSearches();
    const dates = await getDatesForNewDestination();
    const key = savedDestinationKey({ rawDestination: city, destination });
    let savedSearch = searches.find((item) => savedDestinationKey(item) === key);
    if (savedSearch) {
      savedSearch = { ...savedSearch, destination, rawDestination: city, dates, pageUrl: window.location.href, sourceSite: getSiteName(), savedAt: new Date().toISOString(), manual: true, saveStatus: "saved" };
      const idx = searches.findIndex((item) => item.id === savedSearch.id || savedDestinationKey(item) === key);
      if (idx >= 0) searches[idx] = savedSearch;
    } else {
      savedSearch = { id: crypto.randomUUID(), name: `manual #${searches.length + 1}`, destination, rawDestination: city, dates, location: null, pageUrl: window.location.href, sourceSite: getSiteName(), savedAt: new Date().toISOString(), manual: true, saveStatus: "saved" };
      searches.push(savedSearch);
    }
    await setSavedSearches(searches);
    input.value = "";
    renderWidget();
    compareDestinations();
    (async () => {
      try {
        const validated = await validateDestinationForSave(city);
        if (!validated) return;
        const latest = await getSavedSearches();
        const idx = latest.findIndex((item) => item.id === savedSearch.id || savedDestinationKey(item) === key);
        if (idx < 0) return;
        latest[idx] = { ...latest[idx], destination: latest[idx].destination || destination, location: validated.location || latest[idx].location || null };
        await setSavedSearches(latest);
        prefetchWeatherForSavedSearch(latest[idx], latest[idx].location, { updateToast: false });
        renderWidget();
        if (document.getElementById(MODAL_ID)) compareDestinations();
      } catch (_) {}
    })();
  }


  function getVisibleRect(element) {
    if (!element || typeof element.getBoundingClientRect !== "function") return null;
    const rect = element.getBoundingClientRect();
    if (rect.width < 80 || rect.height < 24) return null;
    if (rect.bottom <= 0 || rect.top >= window.innerHeight || rect.right <= 0 || rect.left >= window.innerWidth) return null;
    return rect;
  }

  function rectArea(rect) {
    return Math.max(0, rect?.width || 0) * Math.max(0, rect?.height || 0);
  }

  function rectFromElement(element) {
    const rect = getVisibleRect(element);
    if (!rect) return null;
    return {
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
      width: rect.width,
      height: rect.height
    };
  }

  function mergeRects(rects) {
    const valid = rects.filter(Boolean);
    if (!valid.length) return null;
    const left = Math.min(...valid.map((rect) => rect.left));
    const top = Math.min(...valid.map((rect) => rect.top));
    const right = Math.max(...valid.map((rect) => rect.right));
    const bottom = Math.max(...valid.map((rect) => rect.bottom));
    return { left, top, right, bottom, width: right - left, height: bottom - top };
  }

  function isReasonableSearchRect(rect) {
    if (!rect) return false;
    if (rect.width < 80 || rect.height < 24) return false;
    if (rect.height > Math.min(360, window.innerHeight * 0.45)) return false;
    if (rect.width > window.innerWidth * 0.98 && rect.height > 180) return false;
    return true;
  }

  function getSearchContainerRect(element) {
    if (!element) return null;
    const candidates = [];
    const selectors = [
      'form',
      '[role="search"]',
      '[data-testid*="searchbox" i]',
      '[data-testid*="search" i]',
      '[data-stid*="search" i]',
      '[data-stid*="lodging" i]',
      '[class*="searchbox" i]',
      '[class*="search-box" i]',
      '[class*="search" i]'
    ];

    selectors.forEach((selector) => {
      const candidate = element.closest?.(selector);
      const rect = rectFromElement(candidate);
      if (isReasonableSearchRect(rect)) candidates.push(rect);
    });

    const direct = rectFromElement(element);
    if (isReasonableSearchRect(direct)) candidates.push(direct);

    if (!candidates.length) return direct;

    // Prefer the widest reasonable container: this represents the full search line,
    // not only the destination input. It prevents the popup from sitting on top of
    // the check-in/check-out/guest controls on Booking.com, Hotels.com, etc.
    return candidates.sort((a, b) => rectArea(b) - rectArea(a))[0];
  }

  function collectSearchRects() {
    const host = window.location.hostname.toLowerCase();
    const siteSelectors = [];

    if (host.includes("booking")) {
      siteSelectors.push(
        '[data-testid="searchbox"]',
        '[data-testid*="searchbox" i]',
        'form[action*="searchresults" i]',
        'form[action*="search" i]',
        'input[name="ss"]',
        'input[name*="ss" i]',
        'button[data-testid*="date" i]',
        'button[data-testid*="occupancy" i]'
      );
    }

    if (host.includes("hotels")) {
      siteSelectors.push(
        '[data-stid="lodging-search-form"]',
        '[data-stid*="search-form" i]',
        '[data-testid*="search-form" i]',
        '[role="search"]',
        'button[data-stid*="destination" i]',
        'button[aria-label*="destination" i]',
        'button[aria-label*="going" i]',
        'input[name*="destination" i]',
        'input[placeholder*="destination" i]',
        '[data-stid*="destination" i]',
        '[data-testid*="destination" i]'
      );
    }

    if (host.includes("tripadvisor")) {
      siteSelectors.push(
        '[role="search"]',
        'form[action*="Search" i]',
        'input[type="search"]',
        'input[name="q"]',
        'input[placeholder*="Where" i]',
        '[data-test-target*="search" i]',
        '[data-automation*="search" i]'
      );
    }

    siteSelectors.push(
      '[role="search"]',
      'form[action*="search" i]',
      'input[name*="ss" i]',
      'input[name*="destination" i]',
      'input[name*="query" i]',
      'input[name*="location" i]',
      'input[id*="destination" i]',
      'input[id*="location" i]',
      'input[placeholder*="Where" i]',
      'input[placeholder*="destination" i]',
      'input[placeholder*="city" i]',
      'input[aria-label*="destination" i]',
      'input[aria-label*="where" i]',
      'button[aria-label*="destination" i]',
      'button[aria-label*="where" i]',
      '[data-testid*="destination" i]',
      '[data-testid*="location" i]',
      '[data-testid*="search" i]',
      '[data-stid*="destination" i]',
      '[class*="search" i]'
    );

    const rects = [];
    const seen = new Set();
    for (const selector of siteSelectors) {
      let elements = [];
      try { elements = Array.from(document.querySelectorAll(selector)); } catch (error) { elements = []; }
      for (const element of elements) {
        const containerRect = getSearchContainerRect(element);
        if (!isReasonableSearchRect(containerRect)) continue;
        const key = `${Math.round(containerRect.left)}:${Math.round(containerRect.top)}:${Math.round(containerRect.right)}:${Math.round(containerRect.bottom)}`;
        if (!seen.has(key)) {
          seen.add(key);
          rects.push(containerRect);
        }
      }
    }

    return rects.sort((a, b) => rectArea(b) - rectArea(a)).slice(0, 8);
  }

  function findSearchAnchorRect() {
    const rects = collectSearchRects();
    if (!rects.length) return null;
    return rects[0];
  }

  function rectIntersects(a, b, margin = 12) {
    return !(a.right + margin < b.left || a.left - margin > b.right || a.bottom + margin < b.top || a.top - margin > b.bottom);
  }

  function rectIntersectsAny(rect, avoidRects, margin = 12) {
    return avoidRects.some((avoid) => rectIntersects(rect, avoid, margin));
  }

  function getPopupSafetySpacing() {
    const host = window.location.hostname.toLowerCase();

    // Hotels.com/Expedia layouts have a compact horizontal search row with
    // action buttons close to the right edge. A larger safety distance keeps
    // the Clear Sky Watch card next to the search line without touching it.
    if (host.includes("hotels") || host.includes("expedia") || host.includes("vrbo") || host.includes("abritel")) {
      return { gap: 40, collisionMargin: 34 };
    }

    if (host.includes("booking")) {
      return { gap: 28, collisionMargin: 24 };
    }

    return { gap: 24, collisionMargin: 20 };
  }

  function clampWidgetPosition(left, top, width, height) {
    return {
      left: Math.max(16, Math.min(window.innerWidth - width - 16, left)),
      top: Math.max(16, Math.min(window.innerHeight - height - 16, top))
    };
  }

  async function getStoredWidgetPosition() {
    try {
      const data = await chrome.storage.local.get(WIDGET_POSITION_STORAGE);
      const allPositions = data[WIDGET_POSITION_STORAGE] || {};
      const host = window.location.hostname;
      return allPositions[host] || allPositions.global || null;
    } catch (error) {
      return null;
    }
  }

  async function setStoredWidgetPosition(position) {
    try {
      const data = await chrome.storage.local.get(WIDGET_POSITION_STORAGE);
      const allPositions = data[WIDGET_POSITION_STORAGE] || {};
      allPositions[window.location.hostname] = position;
      await chrome.storage.local.set({ [WIDGET_POSITION_STORAGE]: allPositions });
    } catch (error) {
      // Non-blocking: dragging should still work even if storage is unavailable.
    }
  }

  async function getStoredLauncherPosition() {
    try {
      const data = await chrome.storage.local.get(LAUNCHER_POSITION_STORAGE);
      const allPositions = data[LAUNCHER_POSITION_STORAGE] || {};
      const host = window.location.hostname;
      return allPositions[host] || allPositions.global || null;
    } catch (error) {
      return null;
    }
  }

  async function setStoredLauncherPosition(position) {
    try {
      const data = await chrome.storage.local.get(LAUNCHER_POSITION_STORAGE);
      const allPositions = data[LAUNCHER_POSITION_STORAGE] || {};
      allPositions[window.location.hostname] = position;
      await chrome.storage.local.set({ [LAUNCHER_POSITION_STORAGE]: allPositions });
    } catch (error) {
      // Non-blocking: dragging should still work even if storage is unavailable.
    }
  }

  async function positionWidgetLauncher(launcher) {
    if (!launcher) return;
    launcher.style.bottom = "auto";
    launcher.style.right = "auto";
    const width = launcher.offsetWidth || 58;
    const height = launcher.offsetHeight || 58;
    const stored = await getStoredLauncherPosition();
    if (stored && Number.isFinite(stored.left) && Number.isFinite(stored.top)) {
      const clamped = clampWidgetPosition(stored.left, stored.top, width, height);
      launcher.style.left = `${Math.round(clamped.left)}px`;
      launcher.style.top = `${Math.round(clamped.top)}px`;
      launcher.classList.add("wtn-user-positioned");
      return;
    }
    const clamped = clampWidgetPosition(window.innerWidth - width - 18, 92, width, height);
    launcher.style.left = `${Math.round(clamped.left)}px`;
    launcher.style.top = `${Math.round(clamped.top)}px`;
  }

  function makeWidgetLauncherDraggable(launcher) {
    if (!launcher || launcher.dataset.dragReady === "1") return;
    launcher.dataset.dragReady = "1";
    let dragging = false;
    let moved = false;
    let startX = 0;
    let startY = 0;
    let startLeft = 0;
    let startTop = 0;

    const onPointerMove = (event) => {
      if (!dragging) return;
      const deltaX = event.clientX - startX;
      const deltaY = event.clientY - startY;
      if (Math.abs(deltaX) + Math.abs(deltaY) > 4) moved = true;
      const width = launcher.offsetWidth || 58;
      const height = launcher.offsetHeight || 58;
      const next = clampWidgetPosition(startLeft + deltaX, startTop + deltaY, width, height);
      launcher.style.left = `${Math.round(next.left)}px`;
      launcher.style.top = `${Math.round(next.top)}px`;
      launcher.style.right = "auto";
      launcher.style.bottom = "auto";
      launcher.classList.add("wtn-user-positioned");
      event.preventDefault();
    };

    const onPointerUp = async (event) => {
      if (!dragging) return;
      dragging = false;
      launcher.classList.remove("wtn-launcher-dragging");
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerup", onPointerUp);
      await setStoredLauncherPosition({
        left: parseFloat(launcher.style.left) || 18,
        top: parseFloat(launcher.style.top) || 92
      });
      if (moved) {
        launcher.dataset.justDragged = "1";
        window.setTimeout(() => { delete launcher.dataset.justDragged; }, 0);
        event.preventDefault();
      }
    };

    launcher.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      dragging = true;
      moved = false;
      startX = event.clientX;
      startY = event.clientY;
      const rect = launcher.getBoundingClientRect();
      startLeft = rect.left;
      startTop = rect.top;
      launcher.classList.add("wtn-launcher-dragging");
      document.addEventListener("pointermove", onPointerMove);
      document.addEventListener("pointerup", onPointerUp);
      event.preventDefault();
    });
  }

  async function positionWidgetNearSearchArea(widget) {
    if (!widget) return;
    const width = Math.min(350, window.innerWidth - 32);
    const heightEstimate = Math.min(widget.offsetHeight || 260, window.innerHeight - 32);

    widget.style.width = `${width}px`;
    widget.style.bottom = "auto";
    widget.style.right = "auto";

    const avoidRects = collectSearchRects();
    const anchor = avoidRects[0] || null;
    const safety = getPopupSafetySpacing();
    const safeGap = safety.gap;
    const collisionMargin = safety.collisionMargin;

    const stored = await getStoredWidgetPosition();
    if (stored && Number.isFinite(stored.left) && Number.isFinite(stored.top)) {
      const clamped = clampWidgetPosition(stored.left, stored.top, width, heightEstimate);
      const storedRect = { left: clamped.left, top: clamped.top, right: clamped.left + width, bottom: clamped.top + heightEstimate };
      if (!rectIntersectsAny(storedRect, avoidRects, collisionMargin)) {
        widget.style.left = `${Math.round(clamped.left)}px`;
        widget.style.top = `${Math.round(clamped.top)}px`;
        widget.classList.add("wtn-user-positioned");
        return;
      }
      // Ignore a saved position that now overlaps the booking/search line.
      // This can happen after a site layout changes or after the widget content height changes.
      widget.classList.remove("wtn-user-positioned");
    }

    const clampTop = (value) => Math.max(16, Math.min(window.innerHeight - heightEstimate - 16, value));
    const place = (left, top) => {
      const clamped = clampWidgetPosition(left, top, width, heightEstimate);
      widget.style.left = `${Math.round(clamped.left)}px`;
      widget.style.top = `${Math.round(clamped.top)}px`;
    };

    if (anchor) {
      const candidates = [
        { left: anchor.right + safeGap, top: clampTop(anchor.top) },
        { left: anchor.left - width - safeGap, top: clampTop(anchor.top) },
        { left: anchor.right + safeGap, top: clampTop(anchor.bottom + safeGap) },
        { left: anchor.left - width - safeGap, top: clampTop(anchor.bottom + safeGap) },
        { left: window.innerWidth - width - safeGap, top: Math.max(16, anchor.bottom + safeGap) },
        { left: safeGap, top: Math.max(16, anchor.bottom + safeGap) },
        { left: Math.max(16, Math.min(window.innerWidth - width - 16, anchor.left)), top: Math.max(anchor.bottom + safeGap, 16) }
      ];

      for (const candidate of candidates) {
        const clamped = clampWidgetPosition(candidate.left, candidate.top, width, heightEstimate);
        const rect = { left: clamped.left, top: clamped.top, right: clamped.left + width, bottom: clamped.top + heightEstimate };
        if (!rectIntersectsAny(rect, avoidRects, collisionMargin)) {
          place(clamped.left, clamped.top);
          return;
        }
      }

      // Final fallback: below the full search line, never on top of it.
      place(Math.max(16, Math.min(window.innerWidth - width - 16, anchor.left)), anchor.bottom + safeGap);
      return;
    }

    place(window.innerWidth >= 720 ? window.innerWidth - width - 24 : 16, window.innerWidth >= 720 ? 88 : 16);
  }

  function makeWidgetDraggable(widget) {
    if (!widget) return;
    const handle = widget.querySelector(".wtn-widget-header");
    if (!handle || handle.dataset.dragReady === "1") return;
    handle.dataset.dragReady = "1";

    let dragging = false;
    let startX = 0;
    let startY = 0;
    let startLeft = 0;
    let startTop = 0;

    const onPointerMove = (event) => {
      if (!dragging) return;
      const width = widget.offsetWidth || 350;
      const height = widget.offsetHeight || 260;
      const next = clampWidgetPosition(startLeft + event.clientX - startX, startTop + event.clientY - startY, width, height);
      widget.style.left = `${Math.round(next.left)}px`;
      widget.style.top = `${Math.round(next.top)}px`;
      widget.style.right = "auto";
      widget.style.bottom = "auto";
      widget.classList.add("wtn-user-positioned");
      event.preventDefault();
    };

    const onPointerUp = async () => {
      if (!dragging) return;
      dragging = false;
      widget.classList.remove("wtn-dragging");
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerup", onPointerUp);
      await setStoredWidgetPosition({
        left: parseFloat(widget.style.left) || 24,
        top: parseFloat(widget.style.top) || 88
      });
    };

    handle.addEventListener("pointerdown", (event) => {
      if (event.target?.closest?.(".wtn-widget-close")) return;
      if (event.button !== 0) return;
      dragging = true;
      startX = event.clientX;
      startY = event.clientY;
      const rect = widget.getBoundingClientRect();
      startLeft = rect.left;
      startTop = rect.top;
      widget.classList.add("wtn-dragging");
      document.addEventListener("pointermove", onPointerMove);
      document.addEventListener("pointerup", onPointerUp);
      event.preventDefault();
    });
  }

  function getDismissalKey() {
    // Booking.com updates results inside the same tab. Keep a close action local to
    // the current exact URL so a new Booking search can show the panel again.
    return `${window.location.origin}${window.location.pathname}${window.location.search}`;
  }

  function isWidgetDismissed() {
    try { return sessionStorage.getItem(WIDGET_DISMISSED_SESSION) === getDismissalKey(); } catch (_) { return false; }
  }

  function clearWidgetDismissal() {
    try { sessionStorage.removeItem(WIDGET_DISMISSED_SESSION); } catch (_) {}
  }

  async function renderWidgetLauncher() {
    if (!isLikelyTravelPage()) {
      document.getElementById(WIDGET_LAUNCHER_ID)?.remove();
      return;
    }
    if (!isWidgetDismissed()) {
      document.getElementById(WIDGET_LAUNCHER_ID)?.remove();
      return;
    }
    let launcher = document.getElementById(WIDGET_LAUNCHER_ID);
    if (!launcher) {
      launcher = document.createElement("button");
      launcher.id = WIDGET_LAUNCHER_ID;
      launcher.type = "button";
      launcher.setAttribute("aria-label", "Open Clear Sky Watch");
      launcher.title = "Open Clear Sky Watch";
      launcher.innerHTML = `<img src="${chrome.runtime.getURL("icons/umbrella.svg")}" alt="" aria-hidden="true" />`;
      launcher.addEventListener("click", (event) => {
        if (launcher.dataset.justDragged === "1") {
          event.preventDefault();
          return;
        }
        clearWidgetDismissal();
        launcher.remove();
        renderWidget();
      });
      document.body.appendChild(launcher);
    }
    await positionWidgetLauncher(launcher);
    makeWidgetLauncherDraggable(launcher);
  }

  function dismissWidget() {
    try { sessionStorage.setItem(WIDGET_DISMISSED_SESSION, getDismissalKey()); } catch (_) {}
    document.getElementById(WIDGET_ID)?.remove();
    renderWidgetLauncher();
  }

  async function renderWidget() {
    injectStyles();
    const data = readBookingSearchData();
    await syncSavedSearchDatesForCurrentPage(data.dates);
    const existing = document.getElementById(WIDGET_ID);
    if (isWidgetDismissed()) { if (existing) existing.remove(); renderWidgetLauncher(); return; }
    const searches = dedupeByDestination(await getSavedSearches());
    const count = searches.length;
    const supportedHost = isLikelyTravelPage();
    const shouldShow = supportedHost && (Boolean(data.destination) || count > 0 || supportedHost);
    if (!shouldShow) {
      if (isBookingHost() && existing) {
        updateWidgetDestinationAreaInPlace();
        return;
      }
      if (existing) existing.remove();
      document.getElementById(WIDGET_LAUNCHER_ID)?.remove();
      return;
    }
    document.getElementById(WIDGET_LAUNCHER_ID)?.remove();

    const widget = existing || document.createElement("div");
    widget.id = WIDGET_ID;
    const detectedDestinationHtml = data.destination
      ? `<div class="wtn-current-destination"><div class="wtn-current-city">${escapeHtml(simpleDestinationName(data.destination))}</div></div>`
      : `<p class="wtn-helper-note">Destination not detected on this page. Add it manually below.</p><div class="wtn-inline-manual"><input id="wtn-widget-city-input" class="wtn-manual-input" placeholder="Add destination"><button class="wtn-btn wtn-btn-save" id="wtn-widget-add-btn">Add</button></div>`;
    const saveButtonHtml = data.destination
      ? `<button class="wtn-btn wtn-btn-save" id="wtn-save-btn">Save destination</button>`
      : `<button class="wtn-btn wtn-btn-save" id="wtn-save-btn" disabled>Save destination</button>`;

    widget.innerHTML = `
      <div class="wtn-widget-header">
        <button class="wtn-widget-close" id="wtn-widget-close-btn" type="button" aria-label="Close">×</button>
        <div class="wtn-widget-title"><img class="wtn-brand-logo" src="${chrome.runtime.getURL("icons/umbrella.svg")}" alt="" aria-hidden="true" /> Clear Sky Watch</div>
        <p class="wtn-widget-subtitle">Save destinations, then compare weather</p>
      </div>
      <div class="wtn-widget-body">
        <div data-wtn-detected-area>${detectedDestinationHtml}</div>
        <div class="wtn-actions">
          ${saveButtonHtml}
          ${count ? `<button class="wtn-btn wtn-btn-compare" id="wtn-compare-btn">Compare destinations</button>` : ""}
        </div>
        ${buildSelectedDestinationsMarkup(searches)}
      </div>`;
    if (!existing) {
      document.body.appendChild(widget);
      await positionWidgetNearSearchArea(widget);
    }
    makeWidgetDraggable(widget);
    document.getElementById("wtn-widget-close-btn")?.addEventListener("click", (event) => { event.preventDefault(); event.stopPropagation(); dismissWidget(); });
    // Save is handled by the robust capture-phase pointerdown handler to avoid Booking.com swallowing clicks.
    document.getElementById("wtn-widget-add-btn")?.addEventListener("click", addManualDestinationFromWidget);
    document.getElementById("wtn-widget-city-input")?.addEventListener("keydown", (event) => { if (event.key === "Enter") addManualDestinationFromWidget(); });
    document.getElementById("wtn-compare-btn")?.addEventListener("click", compareDestinations);
    bindSelectedDestinationControls(widget);
  }

  function normalizeGeocodedLocation(raw) {
    if (!raw) return null;
    const latitude = Number(raw.latitude ?? raw.lat);
    const longitude = Number(raw.longitude ?? raw.lon);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
    return {
      name: cleanText(raw.name || raw.display_name?.split(",")[0] || raw.city || raw.town || raw.village || raw.county || raw.label || "Location"),
      country: cleanText(raw.country || raw.address?.country || ""),
      countryCode: cleanText(raw.country_code || raw.countryCode || raw.address?.country_code || ""),
      admin1: cleanText(raw.admin1 || raw.state || raw.address?.state || ""),
      admin2: cleanText(raw.admin2 || raw.county || raw.address?.county || ""),
      admin3: cleanText(raw.admin3 || raw.district || raw.address?.city_district || raw.address?.suburb || ""),
      featureCode: cleanText(raw.feature_code || raw.featureCode || ""),
      type: cleanText(raw.type || ""),
      className: cleanText(raw.className || raw.class || ""),
      osmKey: cleanText(raw.osm_key || raw.osmKey || ""),
      osmValue: cleanText(raw.osm_value || raw.osmValue || ""),
      latitude,
      longitude,
      source: raw.source || "geocoding"
    };
  }

  async function geocodeOpenMeteo(destination) {
    const url = new URL("https://geocoding-api.open-meteo.com/v1/search");
    url.searchParams.set("name", destination);
    url.searchParams.set("count", "1");
    url.searchParams.set("language", getUserLanguage());
    url.searchParams.set("format", "json");
    const response = await fetch(url);
    if (!response.ok) throw new Error("Open-Meteo geocoding failed");
    const data = await response.json();
    const result = data.results?.[0];
    return normalizeGeocodedLocation(result && { ...result, source: "Open-Meteo geocoding" });
  }

  async function geocodeNominatim(destination) {
    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.searchParams.set("q", destination);
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("limit", "1");
    url.searchParams.set("addressdetails", "1");
    const response = await fetch(url, {
      headers: {
        "Accept": "application/json",
        "Accept-Language": navigator.language || "en"
      }
    });
    if (!response.ok) throw new Error("OpenStreetMap geocoding failed");
    const data = await response.json();
    const result = data?.[0];
    return normalizeGeocodedLocation(result && {
      name: result.name || result.display_name,
      country: result.address?.country,
      latitude: result.lat,
      longitude: result.lon,
      source: "OpenStreetMap Nominatim",
      className: result.class,
      type: result.type
    });
  }

  async function geocodePhoton(destination) {
    const url = new URL("https://photon.komoot.io/api/");
    url.searchParams.set("q", destination);
    url.searchParams.set("limit", "1");
    const response = await fetch(url);
    if (!response.ok) throw new Error("Photon geocoding failed");
    const data = await response.json();
    const feature = data.features?.[0];
    if (!feature) return null;
    const props = feature.properties || {};
    const coords = feature.geometry?.coordinates || [];
    return normalizeGeocodedLocation({
      name: props.name || props.city || props.county || destination,
      country: props.country || "",
      latitude: coords[1],
      longitude: coords[0],
      source: "Photon geocoding",
      osmKey: props.osm_key,
      osmValue: props.osm_value,
      type: props.type
    });
  }

  async function geocodeWeatherApi(destination, apiKey) {
    if (!apiKey) return null;
    const url = new URL("https://api.weatherapi.com/v1/search.json");
    url.searchParams.set("key", apiKey);
    url.searchParams.set("q", destination);
    const response = await fetch(url);
    if (!response.ok) throw new Error("WeatherAPI geocoding failed");
    const data = await response.json();
    const result = data?.[0];
    return normalizeGeocodedLocation(result && {
      name: result.name,
      country: result.country,
      latitude: result.lat,
      longitude: result.lon,
      source: "WeatherAPI geocoding"
    });
  }

  async function geocodeOpenWeather(destination, apiKey) {
    if (!apiKey) return null;
    const url = new URL("https://api.openweathermap.org/geo/1.0/direct");
    url.searchParams.set("q", destination);
    url.searchParams.set("limit", "1");
    url.searchParams.set("appid", apiKey);
    const response = await fetch(url);
    if (!response.ok) throw new Error("OpenWeather geocoding failed");
    const data = await response.json();
    const result = data?.[0];
    return normalizeGeocodedLocation(result && {
      name: result.name,
      country: result.country,
      latitude: result.lat,
      longitude: result.lon,
      source: "OpenWeather geocoding"
    });
  }

  async function geocodeDestination(destination) {
    const cleaned = cleanText(destination);
    if (!cleaned) return null;
    const keys = await getOptionalApiKeys();
    const attempts = [
      () => geocodeOpenMeteo(cleaned),
      () => geocodeNominatim(cleaned),
      () => geocodePhoton(cleaned),
      () => geocodeWeatherApi(cleaned, keys.weatherApiKey),
      () => geocodeOpenWeather(cleaned, keys.openWeatherKey)
    ];
    const errors = [];
    for (const attempt of attempts) {
      try {
        const location = await attempt();
        if (location) return location;
      } catch (error) {
        errors.push(error.message);
      }
    }
    console.warn("Clear Sky Watch geocoding failed", cleaned, errors);
    return null;
  }

  function parseDateOnly(value) {
    if (!value) return null;
    const date = new Date(`${value}T00:00:00`);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function daysBetween(start, end) {
    if (!start || !end) return 0;
    return Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
  }

  function datesAreForecastCompatible(dates, maxDaysAhead = 15) {
    if (!dates || !dates.checkin || !dates.checkout) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const start = parseDateOnly(dates.checkin);
    const end = parseDateOnly(dates.checkout);
    if (!start || !end) return false;
    const maxDate = new Date(today);
    maxDate.setDate(maxDate.getDate() + maxDaysAhead);
    return start >= today && start <= maxDate && end >= start && end <= maxDate;
  }

  function shouldUseMonthlyStats(dates) {
    if (!dates || !dates.checkin) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const start = parseDateOnly(dates.checkin);
    const end = parseDateOnly(dates.checkout || dates.checkin);
    if (!start || !end) return false;
    const daysUntilStart = Math.round((start.getTime() - today.getTime()) / 86400000);
    const tripDays = daysBetween(start, end);
    return daysUntilStart > 7 || tripDays > 7 || !datesAreForecastCompatible(dates, 15);
  }

  function getMonthInfoForClimatology(dates) {
    const start = parseDateOnly(dates?.checkin);
    const today = new Date();
    const target = start || today;
    const monthIndex = target.getMonth();
    return {
      monthIndex,
      monthNumber: monthIndex + 1,
      monthName: MONTHS[monthIndex],
      nasaMonthKey: MONTHS[monthIndex].toUpperCase()
    };
  }

  function powerValue(parameters, parameterName, monthInfo) {
    const values = parameters?.[parameterName];
    if (!values || typeof values !== "object") return null;

    const candidates = [
      monthInfo.nasaMonthKey,
      monthInfo.nasaMonthKey.toLowerCase(),
      String(monthInfo.monthNumber).padStart(2, "0"),
      String(monthInfo.monthNumber),
      monthInfo.monthName,
      monthInfo.monthName.toLowerCase()
    ];

    for (const key of candidates) {
      const value = Number(values[key]);
      if (Number.isFinite(value) && value > -900) return value;
    }

    const numericValues = Object.values(values).map(Number).filter((value) => Number.isFinite(value) && value > -900);
    return numericValues.length ? average(numericValues) : null;
  }

  function precipitationMmToRainRisk(mmPerDay) {
    if (!Number.isFinite(mmPerDay)) return 50;
    // Fast climatology proxy: turn average daily precipitation into an approximate rain-risk %.
    // This is not a real forecast probability; it is only used for “stats”.
    return Math.max(0, Math.min(100, Math.round(mmPerDay * 18)));
  }

  function solarToSunnyHours(kwhPerM2Day) {
    if (!Number.isFinite(kwhPerM2Day)) return 0;
    // Rough display proxy. It keeps the UI fast and readable without downloading hourly history.
    return Math.max(0, Math.min(12, Math.round(kwhPerM2Day * 1.35)));
  }

  function cloudAmountToCode(cloudAmount) {
    if (!Number.isFinite(cloudAmount)) return 2;
    if (cloudAmount < 25) return 0;
    if (cloudAmount < 50) return 1;
    if (cloudAmount < 75) return 2;
    return 3;
  }

  async function getOptionalApiKeys() {
    try {
      const result = await chrome.storage.local.get([WEATHERAPI_KEY_STORAGE, OPENWEATHER_KEY_STORAGE]);
      return {
        weatherApiKey: cleanText(result[WEATHERAPI_KEY_STORAGE]),
        openWeatherKey: cleanText(result[OPENWEATHER_KEY_STORAGE])
      };
    } catch (_) {
      return { weatherApiKey: "", openWeatherKey: "" };
    }
  }

  async function getOpenMeteoForecast(location, dates) {
    const url = new URL("https://api.open-meteo.com/v1/forecast");
    url.searchParams.set("latitude", location.latitude);
    url.searchParams.set("longitude", location.longitude);
    url.searchParams.set("daily", ["weather_code", "temperature_2m_max", "temperature_2m_min", "apparent_temperature_max", "apparent_temperature_min", "precipitation_probability_max", "wind_speed_10m_max", "sunshine_duration"].join(","));
    url.searchParams.set("hourly", ["temperature_2m", "apparent_temperature", "precipitation_probability", "wind_speed_10m", "cloud_cover", "is_day"].join(","));
    url.searchParams.set("timezone", "auto");
    if (datesAreForecastCompatible(dates, 15)) {
      url.searchParams.set("start_date", dates.checkin);
      url.searchParams.set("end_date", dates.checkout || dates.checkin);
    } else {
      url.searchParams.set("forecast_days", "7");
    }
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Open-Meteo forecast failed for ${location.name}`);
    const data = await response.json();
    data.cswSource = "Open-Meteo forecast";
    data.cswMode = "forecast";
    return applyDaytimeHourlyMetrics(data, dates, {
      time: "time",
      temperature: "temperature_2m",
      apparentTemperature: "apparent_temperature",
      rainProbability: "precipitation_probability",
      windSpeed: "wind_speed_10m",
      cloudCover: "cloud_cover",
      isDay: "is_day"
    });
  }

  function monthlyStatsCacheKey(location, dates) {
    const info = getMonthInfoForClimatology(dates);
    const lat = Number(location.latitude).toFixed(2);
    const lon = Number(location.longitude).toFixed(2);
    return `nasa-power:${lat}:${lon}:${info.monthName}`;
  }

  async function getCachedMonthlyStats(location, dates) {
    try {
      const key = monthlyStatsCacheKey(location, dates);
      const stored = await chrome.storage.local.get([MONTHLY_STATS_CACHE_STORAGE]);
      const cache = stored[MONTHLY_STATS_CACHE_STORAGE] || {};
      const item = cache[key];
      if (!item || !item.data) return null;
      return item.data;
    } catch (_) {
      return null;
    }
  }

  async function setCachedMonthlyStats(location, dates, data) {
    try {
      const key = monthlyStatsCacheKey(location, dates);
      const stored = await chrome.storage.local.get([MONTHLY_STATS_CACHE_STORAGE]);
      const cache = stored[MONTHLY_STATS_CACHE_STORAGE] || {};
      cache[key] = { savedAt: new Date().toISOString(), data };
      await chrome.storage.local.set({ [MONTHLY_STATS_CACHE_STORAGE]: cache });
    } catch (_) {
      // Cache failures should never block the comparison.
    }
  }

  function buildFastMonthlyStats(location, dates, reason = "fast fallback") {
    // Immediate browser-side fallback for long-range trips when climatology is slow.
    // It keeps stats rows responsive; NASA POWER still provides the preferred cached source when available.
    const info = getMonthInfoForClimatology(dates);
    const lat = Number(location.latitude);
    const absLat = Number.isFinite(lat) ? Math.min(65, Math.abs(lat)) : 35;
    const month = info.monthNumber;
    const summerPeakMonth = lat >= 0 ? 7 : 1;
    const seasonFactor = Math.cos(((month - summerPeakMonth) / 12) * Math.PI * 2);
    const tropicalBoost = Math.max(0, 1 - absLat / 28);
    const maxTemp = Math.round((26 - absLat * 0.12 + seasonFactor * (7 + absLat * 0.11) + tropicalBoost * 4) * 10) / 10;
    const minTemp = Math.round((maxTemp - (6 + absLat * 0.03)) * 10) / 10;
    const windKmh = Math.max(8, Math.min(34, Math.round(16 + absLat * 0.08 + Math.max(0, -seasonFactor) * 4)));
    const rainRisk = Math.max(10, Math.min(75, Math.round(28 + tropicalBoost * 20 + Math.max(0, -seasonFactor) * 12)));
    const sunnyHours = Math.max(2, Math.min(10, Math.round(6 + seasonFactor * 2 - tropicalBoost)));
    const dryShare = Math.max(0, Math.min(1, 1 - rainRisk / 100));
    const sunnyShare = Math.max(0, Math.min(1, sunnyHours / 12));
    const goodHeatShare = maxTemp > 35 ? 0.05 : Math.max(0, Math.min(1, temperatureComfortScore(maxTemp, minTemp) / 100));
    const dangerHeatShare = maxTemp > 35 ? 1 : 0;
    const calmWindShare = windKmh < 36 ? 1 : Math.max(0, Math.min(1, 1 - (windKmh - 36) / 24));

    return {
      daily: {
        time: [`${info.monthName} typical`],
        temperature_2m_max: [maxTemp],
        temperature_2m_min: [minTemp],
        apparent_temperature_max: [maxTemp],
        apparent_temperature_min: [minTemp],
        precipitation_probability_max: [rainRisk],
        wind_speed_10m_max: [windKmh],
        sunshine_duration: [sunnyHours * 3600],
        weather_code: [rainRisk > 55 ? 3 : rainRisk > 35 ? 2 : 1],
        csw_daylight_hours: [12],
        csw_clear_daylight_hours: [sunnyHours],
        csw_clear_day_fraction: [sunnyShare],
        csw_clear_day_flag: [sunnyShare >= 0.5 ? 1 : 0],
        csw_dry_daytime_fraction: [dryShare],
        csw_good_heat_fraction: [goodHeatShare],
        csw_danger_heat_fraction: [dangerHeatShare],
        csw_calm_wind_fraction: [calmWindShare]
      },
      cswSource: `Fast typical stats estimate (${info.monthName})`,
      cswMode: "monthly-stats",
      cswMonthName: info.monthName,
      cswFastStats: true,
      cswFastStatsReason: reason
    };
  }

  async function getOpenMeteoMonthlyStats(location, dates) {
    // Fast path for future / long-range trips: use NASA POWER monthly climatology.
    // This avoids downloading years of daily history in the browser.
    const cached = await getCachedMonthlyStats(location, dates);
    if (cached) {
      cached.cswCacheHit = true;
      return cached;
    }

    const info = getMonthInfoForClimatology(dates);
    const url = new URL("https://power.larc.nasa.gov/api/temporal/climatology/point");
    url.searchParams.set("parameters", ["T2M_MAX", "T2M_MIN", "PRECTOTCORR", "WS10M", "ALLSKY_SFC_SW_DWN", "CLOUD_AMT"].join(","));
    url.searchParams.set("community", "RE");
    url.searchParams.set("longitude", String(location.longitude));
    url.searchParams.set("latitude", String(location.latitude));
    url.searchParams.set("format", "JSON");

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 2500);

    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) throw new Error(`NASA POWER climatology failed for ${location.name}`);

      const payload = await response.json();
      const parameters = payload?.properties?.parameter || payload?.parameters || {};

      const maxTemp = powerValue(parameters, "T2M_MAX", info);
      const minTemp = powerValue(parameters, "T2M_MIN", info);
      const precipMmPerDay = powerValue(parameters, "PRECTOTCORR", info);
      const windMs = powerValue(parameters, "WS10M", info);
      const solarKwh = powerValue(parameters, "ALLSKY_SFC_SW_DWN", info);
      const cloudAmount = powerValue(parameters, "CLOUD_AMT", info);

      const windKmh = Number.isFinite(windMs) ? windMs * 3.6 : null;
      const rainRisk = precipitationMmToRainRisk(precipMmPerDay);
      const sunnyHours = solarToSunnyHours(solarKwh);
      const cloudCode = cloudAmountToCode(cloudAmount);

      const data = {
        daily: {
          time: [`${info.monthName} typical`],
          temperature_2m_max: [Number.isFinite(maxTemp) ? maxTemp : 0],
          temperature_2m_min: [Number.isFinite(minTemp) ? minTemp : Number.isFinite(maxTemp) ? maxTemp - 6 : 0],
          apparent_temperature_max: [Number.isFinite(maxTemp) ? maxTemp : 0],
          apparent_temperature_min: [Number.isFinite(minTemp) ? minTemp : Number.isFinite(maxTemp) ? maxTemp - 6 : 0],
          precipitation_probability_max: [rainRisk],
          wind_speed_10m_max: [Number.isFinite(windKmh) ? windKmh : 0],
          sunshine_duration: [sunnyHours * 3600],
          weather_code: [cloudCode],
          csw_daylight_hours: [12],
          csw_clear_daylight_hours: [sunnyHours],
          csw_clear_day_fraction: [Math.max(0, Math.min(1, sunnyHours / 12))],
          csw_clear_day_flag: [sunnyHours / 12 >= 0.5 ? 1 : 0],
          csw_dry_daytime_fraction: [Math.max(0, Math.min(1, 1 - rainRisk / 100))],
          csw_good_heat_fraction: [temperatureComfortScore(Number.isFinite(maxTemp) ? maxTemp : 0, Number.isFinite(minTemp) ? minTemp : 0) / 100],
          csw_danger_heat_fraction: [Number.isFinite(maxTemp) && maxTemp > 35 ? 1 : 0],
          csw_calm_wind_fraction: [Number.isFinite(windKmh) ? (windKmh < 36 ? 1 : Math.max(0, Math.min(1, 1 - (windKmh - 36) / 24))) : 0]
        },
        cswSource: `NASA POWER climatology (${info.monthName})`,
        cswMode: "monthly-stats",
        cswMonthName: info.monthName
      };

      await setCachedMonthlyStats(location, dates, data);
      return data;
    } catch (error) {
      return buildFastMonthlyStats(location, dates, error?.name === "AbortError" ? "NASA POWER timeout" : "NASA POWER unavailable");
    } finally {
      window.clearTimeout(timeout);
    }
  }

  async function getWeatherApiForecast(location, dates, apiKey) {
    if (!apiKey || !datesAreForecastCompatible(dates, 14)) throw new Error("WeatherAPI key or compatible dates missing");
    const start = parseDateOnly(dates.checkin);
    const end = parseDateOnly(dates.checkout || dates.checkin);
    const days = Math.min(14, Math.max(1, daysBetween(start, end)));
    const url = new URL("https://api.weatherapi.com/v1/forecast.json");
    url.searchParams.set("key", apiKey);
    url.searchParams.set("q", `${location.latitude},${location.longitude}`);
    url.searchParams.set("days", String(days));
    url.searchParams.set("aqi", "no");
    url.searchParams.set("alerts", "no");
    const response = await fetch(url);
    if (!response.ok) throw new Error(`WeatherAPI forecast failed for ${location.name}`);
    const data = await response.json();
    const daysData = data.forecast?.forecastday || [];
    return {
      daily: buildDaytimeDailyFromWeatherApiDays(daysData),
      cswSource: "WeatherAPI.com daytime forecast",
      cswMode: "forecast",
      cswDaytimeOnly: true
    };
  }

  async function getOpenWeatherForecast(location, dates, apiKey) {
    if (!apiKey || !datesAreForecastCompatible(dates, 5)) throw new Error("OpenWeather key or compatible dates missing");
    const url = new URL("https://api.openweathermap.org/data/2.5/forecast");
    url.searchParams.set("lat", location.latitude);
    url.searchParams.set("lon", location.longitude);
    url.searchParams.set("units", "metric");
    url.searchParams.set("appid", apiKey);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`OpenWeather forecast failed for ${location.name}`);
    const data = await response.json();
    const groups = new Map();
    (data.list || []).forEach((item) => {
      const dateString = localDateFromTimeString(item.dt_txt);
      if (!dateString || !isDateInsideTrip(dateString, dates)) return;
      if (!isDaytimeHour(localHourFromTimeString(item.dt_txt))) return;
      if (!groups.has(dateString)) groups.set(dateString, []);
      groups.get(dateString).push({
        temperature: finiteOrNull(item.main?.temp_max ?? item.main?.temp),
        apparentTemperature: finiteOrNull(item.main?.feels_like),
        rainProbability: finiteOrNull((item.pop || 0) * 100),
        windSpeed: finiteOrNull((item.wind?.speed || 0) * 3.6),
        cloudCover: finiteOrNull(item.clouds?.all)
      });
    });
    return {
      daily: aggregateHourlyDaytimeGroups(groups),
      cswSource: "OpenWeather daytime forecast",
      cswMode: "forecast",
      cswDaytimeOnly: true
    };
  }

  async function getMetNoForecast(location, dates) {
    if (!datesAreForecastCompatible(dates, 9)) throw new Error("MET Norway compatible dates missing");
    const url = new URL("https://api.met.no/weatherapi/locationforecast/2.0/compact");
    url.searchParams.set("lat", location.latitude);
    url.searchParams.set("lon", location.longitude);
    const response = await fetch(url, { headers: { "Accept": "application/json" } });
    if (!response.ok) throw new Error(`MET Norway forecast failed for ${location.name}`);
    const data = await response.json();
    const groups = new Map();
    (data.properties?.timeseries || []).forEach((item) => {
      const dateString = localDateFromTimeString(item.time);
      if (!dateString || !isDateInsideTrip(dateString, dates)) return;
      if (!isDaytimeHour(localHourFromTimeString(item.time))) return;
      if (!groups.has(dateString)) groups.set(dateString, []);
      const details = item.data?.instant?.details || {};
      const nextDetails = item.data?.next_6_hours?.details || item.data?.next_1_hours?.details || {};
      const precipAmount = finiteOrNull(nextDetails.precipitation_amount);
      groups.get(dateString).push({
        temperature: finiteOrNull(details.air_temperature),
        apparentTemperature: finiteOrNull(details.air_temperature),
        rainProbability: Number.isFinite(precipAmount) ? Math.min(100, precipAmount > 0.1 ? 65 : 0) : null,
        windSpeed: finiteOrNull((details.wind_speed || 0) * 3.6),
        cloudCover: finiteOrNull(details.cloud_area_fraction)
      });
    });
    return {
      daily: aggregateHourlyDaytimeGroups(groups),
      cswSource: "MET Norway daytime forecast",
      cswMode: "forecast",
      cswDaytimeOnly: true
    };
  }

  async function getWeatherForecast(location, dates) {
    const safeDates = ensureTripDates(dates);
    const keys = await getOptionalApiKeys();

    if (shouldUseMonthlyStats(safeDates)) {
      return await getOpenMeteoMonthlyStats(location, safeDates);
    }

    try {
      return await getOpenMeteoForecast(location, safeDates);
    } catch (openMeteoError) {
      try {
        return await getMetNoForecast(location, safeDates);
      } catch (_) {
        try {
          return await getWeatherApiForecast(location, safeDates, keys.weatherApiKey);
        } catch (_) {
          try {
            return await getOpenWeatherForecast(location, safeDates, keys.openWeatherKey);
          } catch (_) {
            throw openMeteoError;
          }
        }
      }
    }
  }

  function average(values) {
    const valid = values.filter((value) => Number.isFinite(value));
    return valid.length ? valid.reduce((sum, value) => sum + value, 0) / valid.length : 0;
  }

  function dailySeries(daily, primaryName, fallbackName) {
    const primary = daily[primaryName] || [];
    const fallback = daily[fallbackName] || [];
    const hasPrimary = primary.some((value) => Number.isFinite(value));
    return hasPrimary ? primary : fallback;
  }

  function localHourFromTimeString(value) {
    const text = String(value || "");
    const match = text.match(/[T\s](\d{1,2}):/);
    if (match) return Number(match[1]);
    const parsed = new Date(text);
    return Number.isNaN(parsed.getTime()) ? null : parsed.getHours();
  }

  function localDateFromTimeString(value) {
    const text = String(value || "");
    const match = text.match(/^(\d{4}-\d{2}-\d{2})/);
    if (match) return match[1];
    const parsed = new Date(text);
    return Number.isNaN(parsed.getTime()) ? "" : toLocalDateString(parsed);
  }

  function isDateInsideTrip(dateString, dates) {
    const date = parseDateOnly(dateString);
    const start = parseDateOnly(dates?.checkin);
    const end = parseDateOnly(dates?.checkout || dates?.checkin);
    if (!date || !start || !end) return true;
    return date >= start && date <= end;
  }

  function isDaytimeHour(hour, isDayValue = null) {
    if (Number.isFinite(Number(isDayValue))) return Number(isDayValue) === 1;
    if (!Number.isFinite(Number(hour))) return false;
    // Fallback when the provider does not expose sunrise/sunset or is_day.
    // Use local daytime proxy and ignore night-time rain, wind, sun and clouds.
    return Number(hour) >= 6 && Number(hour) < 20;
  }

  function finiteOrNull(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function aggregateHourlyDaytimeGroups(groups) {
    const datesOut = Array.from(groups.keys()).sort();
    const result = {
      time: [],
      weather_code: [],
      temperature_2m_max: [],
      temperature_2m_min: [],
      apparent_temperature_max: [],
      apparent_temperature_min: [],
      precipitation_probability_max: [],
      wind_speed_10m_max: [],
      sunshine_duration: [],
      csw_daylight_hours: [],
      csw_clear_daylight_hours: [],
      csw_clear_day_fraction: [],
      csw_clear_day_flag: [],
      csw_dry_daytime_fraction: [],
      csw_good_heat_fraction: [],
      csw_danger_heat_fraction: [],
      csw_calm_wind_fraction: []
    };

    datesOut.forEach((dateString) => {
      const items = groups.get(dateString) || [];
      const temps = items.map((item) => item.temperature).filter(Number.isFinite);
      const feels = items.map((item) => item.apparentTemperature).filter(Number.isFinite);
      const heatValues = items.map((item) => Number.isFinite(item.apparentTemperature) ? item.apparentTemperature : item.temperature).filter(Number.isFinite);
      const rains = items.map((item) => item.rainProbability).filter(Number.isFinite);
      const winds = items.map((item) => item.windSpeed).filter(Number.isFinite);
      const clouds = items.map((item) => item.cloudCover).filter(Number.isFinite);
      const clearHours = clouds.filter((value) => value < 50).length;
      const daylightHours = items.length;
      const avgCloud = clouds.length ? average(clouds) : null;
      const dryHours = rains.filter((value) => value < 30).length;
      const goodHeatHours = heatValues.filter((value) => value >= 20 && value <= 28).length;
      const dangerHeatHours = heatValues.filter((value) => value > 35).length;
      const calmWindHours = winds.filter((value) => value < 36).length;

      result.time.push(dateString);
      result.temperature_2m_max.push(temps.length ? Math.max(...temps) : null);
      result.temperature_2m_min.push(temps.length ? Math.min(...temps) : null);
      result.apparent_temperature_max.push(feels.length ? Math.max(...feels) : temps.length ? Math.max(...temps) : null);
      result.apparent_temperature_min.push(feels.length ? Math.min(...feels) : temps.length ? Math.min(...temps) : null);
      result.precipitation_probability_max.push(rains.length ? Math.max(...rains) : 0);
      result.wind_speed_10m_max.push(winds.length ? Math.max(...winds) : 0);
      result.sunshine_duration.push(clearHours * 3600);
      result.weather_code.push(avgCloud === null ? 2 : cloudAmountToCode(avgCloud));
      result.csw_daylight_hours.push(daylightHours);
      result.csw_clear_daylight_hours.push(clearHours);
      result.csw_clear_day_fraction.push(daylightHours && clouds.length ? clearHours / daylightHours : 0);
      result.csw_clear_day_flag.push(daylightHours && clouds.length && clearHours / daylightHours >= 0.5 ? 1 : 0);
      result.csw_dry_daytime_fraction.push(daylightHours && rains.length ? dryHours / daylightHours : null);
      result.csw_good_heat_fraction.push(daylightHours && heatValues.length ? goodHeatHours / daylightHours : null);
      result.csw_danger_heat_fraction.push(daylightHours && heatValues.length ? dangerHeatHours / daylightHours : null);
      result.csw_calm_wind_fraction.push(daylightHours && winds.length ? calmWindHours / daylightHours : null);
    });

    return result;
  }

  function applyDaytimeHourlyMetrics(data, dates, fields) {
    const hourly = data?.hourly || {};
    const times = hourly[fields.time] || [];
    if (!times.length) return data;

    const groups = new Map();
    times.forEach((timeValue, index) => {
      const dateString = localDateFromTimeString(timeValue);
      if (!dateString || !isDateInsideTrip(dateString, dates)) return;
      const hour = localHourFromTimeString(timeValue);
      const isDayValue = fields.isDay ? hourly[fields.isDay]?.[index] : null;
      if (!isDaytimeHour(hour, isDayValue)) return;
      if (!groups.has(dateString)) groups.set(dateString, []);
      groups.get(dateString).push({
        temperature: finiteOrNull(hourly[fields.temperature]?.[index]),
        apparentTemperature: finiteOrNull(hourly[fields.apparentTemperature]?.[index]),
        rainProbability: finiteOrNull(hourly[fields.rainProbability]?.[index]),
        windSpeed: finiteOrNull(hourly[fields.windSpeed]?.[index]),
        cloudCover: finiteOrNull(hourly[fields.cloudCover]?.[index])
      });
    });

    if (!groups.size) return data;
    data.daily = { ...(data.daily || {}), ...aggregateHourlyDaytimeGroups(groups) };
    data.cswDaytimeOnly = true;
    return data;
  }

  function buildDaytimeDailyFromWeatherApiDays(daysData) {
    const groups = new Map();
    (daysData || []).forEach((day) => {
      const dateString = day.date;
      const daytime = (day.hour || []).filter((hour) => isDaytimeHour(localHourFromTimeString(hour.time), hour.is_day));
      if (!dateString || !daytime.length) return;
      groups.set(dateString, daytime.map((hour) => ({
        temperature: finiteOrNull(hour.temp_c),
        apparentTemperature: finiteOrNull(hour.feelslike_c),
        rainProbability: finiteOrNull(hour.chance_of_rain ?? hour.will_it_rain ? hour.chance_of_rain : hour.chance_of_rain),
        windSpeed: finiteOrNull(hour.wind_kph),
        cloudCover: finiteOrNull(hour.cloud)
      })));
    });
    return aggregateHourlyDaytimeGroups(groups);
  }

  function interpolateTemperatureScore(tempC) {
    // Humidity-adjusted temperature rating curve, using feels-like temperature when available.
    // User-defined anchors: 16=44, 24=100, 27=100, 28=92, 29=80, 30=68, 32=44, 35=8. Above 35 is dangerous heat.
    const points = [
      [16, 44],
      [24, 100],
      [27, 100],
      [28, 92],
      [29, 80],
      [30, 68],
      [32, 44],
      [35, 8]
    ];
    if (!Number.isFinite(tempC)) return 0;
    if (tempC <= points[0][0]) return Math.max(0, Math.round(points[0][1] - (points[0][0] - tempC) * 4));
    if (tempC > 35) return 0;
    if (tempC >= points[points.length - 1][0]) return Math.max(0, Math.round(points[points.length - 1][1] - (tempC - points[points.length - 1][0]) * 6));
    for (let i = 0; i < points.length - 1; i += 1) {
      const [x1, y1] = points[i];
      const [x2, y2] = points[i + 1];
      if (tempC >= x1 && tempC <= x2) {
        const t = (tempC - x1) / (x2 - x1);
        return Math.max(0, Math.min(100, Math.round(y1 + (y2 - y1) * t)));
      }
    }
    return 0;
  }

  function temperatureComfortScore(feelsLikeMaxC, feelsLikeMinC) {
    let score = interpolateTemperatureScore(feelsLikeMaxC);

    // Nights staying very warm are a humidity/heat-stress signal. Keep the main curve based on
    // daytime feels-like temperature, then add a small extra penalty for uncomfortable warm nights.
    if (Number.isFinite(feelsLikeMinC) && feelsLikeMinC > 24) {
      score -= Math.min(16, (feelsLikeMinC - 24) * 3);
    }

    return Math.max(0, Math.min(100, Math.round(score)));
  }

  function temperatureLabel(feelsLikeMaxC) {
    if (feelsLikeMaxC > 35) return "Danger heat";
    if (feelsLikeMaxC > 30) return "Too hot";
    if (feelsLikeMaxC > 28) return "Hot";
    if (feelsLikeMaxC >= 20 && feelsLikeMaxC <= 28) return "Good";
    if (feelsLikeMaxC < 16) return "Too cool";
    return "Cool";
  }

  function relativeScoreLowerIsBetter(value, minValue, maxValue) {
    if (!Number.isFinite(value)) return 0;
    if (!Number.isFinite(minValue) || !Number.isFinite(maxValue) || Math.abs(maxValue - minValue) < 0.001) return 100;
    return Math.max(0, Math.min(100, Math.round(100 - ((value - minValue) / (maxValue - minValue)) * 100)));
  }

  function relativeScoreHigherIsBetter(value, minValue, maxValue) {
    if (!Number.isFinite(value)) return 0;
    if (!Number.isFinite(minValue) || !Number.isFinite(maxValue) || Math.abs(maxValue - minValue) < 0.001) return 100;
    return Math.max(0, Math.min(100, Math.round(((value - minValue) / (maxValue - minValue)) * 100)));
  }

  function applyRelativeWeatherRating(results) {
    const completed = results.filter((item) => item.weatherScore);
    if (!completed.length) return results;

    const dryValues = completed.map((item) => item.weatherScore.dryTimeShare).filter(Number.isFinite);
    const heatValues = completed.map((item) => item.weatherScore.goodHeatShare).filter(Number.isFinite);
    const calmValues = completed.map((item) => item.weatherScore.calmWindShare).filter(Number.isFinite);
    const sunValues = completed.map((item) => item.weatherScore.sunnyTimeShare).filter(Number.isFinite);
    const minDry = Math.min(...dryValues);
    const maxDry = Math.max(...dryValues);
    const minHeat = Math.min(...heatValues);
    const maxHeat = Math.max(...heatValues);
    const minCalm = Math.min(...calmValues);
    const maxCalm = Math.max(...calmValues);
    const minSun = Math.min(...sunValues);
    const maxSun = Math.max(...sunValues);

    completed.forEach((item) => {
      const score = item.weatherScore;
      const dryPct = Math.round(Math.max(0, Math.min(1, score.dryTimeShare || 0)) * 100);
      const goodHeatPct = Math.round(Math.max(0, Math.min(1, score.goodHeatShare || 0)) * 100);
      const calmPct = Math.round(Math.max(0, Math.min(1, score.calmWindShare || 0)) * 100);
      const sunnyPct = Math.round(Math.max(0, Math.min(1, score.sunnyTimeShare || 0)) * 100);
      const dryRelative = relativeScoreHigherIsBetter(score.dryTimeShare, minDry, maxDry);
      const heatRelative = relativeScoreHigherIsBetter(score.goodHeatShare, minHeat, maxHeat);
      const calmRelative = relativeScoreHigherIsBetter(score.calmWindShare, minCalm, maxCalm);
      const sunRelative = relativeScoreHigherIsBetter(score.sunnyTimeShare, minSun, maxSun);

      // Percentage-of-favourable-daytime methodology.
      // Score = dry daytime first, good heat second, calm wind third, sun as a bonus.
      const dryComponent = dryValues.length > 1 ? dryRelative * 0.45 + dryPct * 0.55 : dryPct;
      const heatComponent = heatValues.length > 1 ? heatRelative * 0.35 + goodHeatPct * 0.65 : goodHeatPct;
      const calmComponent = calmValues.length > 1 ? calmRelative * 0.35 + calmPct * 0.65 : calmPct;
      const sunComponent = sunValues.length > 1 ? sunRelative * 0.35 + sunnyPct * 0.65 : sunnyPct;
      const dangerPenalty = Math.min(60, Math.round((score.dangerHeatShare || 0) * 100));
      let relativeScore = Math.round(dryComponent * 0.45 + heatComponent * 0.30 + calmComponent * 0.15 + sunComponent * 0.10 - dangerPenalty);
      relativeScore = Math.max(0, Math.min(100, relativeScore));
      if (score.heatDanger) {
        // Dangerous heat remains a hard safety constraint.
        relativeScore = Math.min(relativeScore, 35);
      }

      score.relativeRainScore = Math.round(dryComponent);
      score.relativeTemperatureScore = Math.round(heatComponent);
      score.relativeWindScore = Math.round(calmComponent);
      score.relativeSunScore = Math.round(sunComponent);
      score.dryTimePercent = dryPct;
      score.goodHeatPercent = goodHeatPct;
      score.calmWindPercent = calmPct;
      score.sunnyTimePercent = sunnyPct;
      score.comfortScore = relativeScore;
      score.score = relativeScore;
    });
    return results;
  }

  function weatherCodeCloudSignal(code) {
    if (typeof code !== "number") return 0.5;
    if (code === 0) return 0.05;
    if (code === 1) return 0.25;
    if (code === 2) return 0.5;
    if (code === 3) return 0.8;
    if (code === 45 || code === 48) return 0.85;
    if (code >= 51 && code <= 67) return 0.75;
    if (code >= 71 && code <= 77) return 0.85;
    if (code >= 80) return 0.9;
    return 0.5;
  }

  function averageCloudSignal(codes) {
    const valid = codes.filter((code) => typeof code === "number");
    return valid.length ? average(valid.map(weatherCodeCloudSignal)) : 0.5;
  }

  function scoreWeather(forecast) {
    const daily = forecast.daily || {};
    const avgMaxTempRaw = average(daily.temperature_2m_max || []);
    const avgMinTempRaw = average(daily.temperature_2m_min || []);
    const avgFeelsLikeMaxRaw = average(dailySeries(daily, "apparent_temperature_max", "temperature_2m_max"));
    const avgFeelsLikeMinRaw = average(dailySeries(daily, "apparent_temperature_min", "temperature_2m_min"));
    const avgWindRaw = average(daily.wind_speed_10m_max || []);
    const daylightHoursSeries = (daily.csw_daylight_hours || []).filter(Number.isFinite);
    const clearHoursSeries = (daily.csw_clear_daylight_hours || []).filter(Number.isFinite);
    const clearFractionSeries = (daily.csw_clear_day_fraction || []).filter(Number.isFinite);
    const clearDayFlagSeries = (daily.csw_clear_day_flag || []).filter(Number.isFinite);
    const dryFractionSeries = (daily.csw_dry_daytime_fraction || []).filter(Number.isFinite);
    const goodHeatFractionSeries = (daily.csw_good_heat_fraction || []).filter(Number.isFinite);
    const dangerHeatFractionSeries = (daily.csw_danger_heat_fraction || []).filter(Number.isFinite);
    const calmWindFractionSeries = (daily.csw_calm_wind_fraction || []).filter(Number.isFinite);
    const avgClearDaytimeHours = clearHoursSeries.length ? average(clearHoursSeries) : average(daily.sunshine_duration || []) / 3600;
    const avgDaytimeHours = daylightHoursSeries.length ? average(daylightHoursSeries) : 12;
    const avgClearDayFraction = clearFractionSeries.length ? average(clearFractionSeries) : avgDaytimeHours ? avgClearDaytimeHours / avgDaytimeHours : 0;
    const clearDayShare = clearDayFlagSeries.length ? average(clearDayFlagSeries) : avgClearDayFraction;
    const avgSunHoursRaw = avgClearDaytimeHours;
    const avgCloudSignal = clearFractionSeries.length ? Math.max(0, Math.min(1, 1 - avgClearDayFraction)) : averageCloudSignal(daily.weather_code || []);

    let avgRainRaw = average(daily.precipitation_probability_max || []);
    if (forecast.cswMode === "monthly-stats") {
      const precip = daily.precipitation_sum || [];
      const validPrecip = precip.filter((value) => Number.isFinite(value));
      const rainyDays = validPrecip.filter((value) => value > 0.5).length;
      if (validPrecip.length) avgRainRaw = (rainyDays / validPrecip.length) * 100;
    }

    const tempScore = temperatureComfortScore(avgFeelsLikeMaxRaw, avgFeelsLikeMinRaw);
    const dryTimeShare = dryFractionSeries.length ? average(dryFractionSeries) : Math.max(0, Math.min(1, 1 - avgRainRaw / 100));
    const sunnyTimeShare = Math.max(0, Math.min(1, avgClearDayFraction || 0));
    const goodHeatShare = goodHeatFractionSeries.length ? average(goodHeatFractionSeries) : Math.max(0, Math.min(1, tempScore / 100));
    const dangerHeatShare = dangerHeatFractionSeries.length ? average(dangerHeatFractionSeries) : avgFeelsLikeMaxRaw > 35 ? 1 : 0;
    const calmWindShare = calmWindFractionSeries.length ? average(calmWindFractionSeries) : (avgWindRaw < 36 ? 1 : Math.max(0, Math.min(1, 1 - (avgWindRaw - 36) / 24)));
    const dryTimePercent = Math.round(dryTimeShare * 100);
    const goodHeatPercent = Math.round(goodHeatShare * 100);
    const calmWindPercent = Math.round(calmWindShare * 100);
    const sunnyTimePercent = Math.round(sunnyTimeShare * 100);
    const heatDanger = avgFeelsLikeMaxRaw > 35 || dangerHeatShare > 0;

    // Base score before the comparison-relative adjustment.
    // It uses shares of favourable local daytime hours/days, not simple averages.
    let comfortScore = Math.round(dryTimePercent * 0.45 + goodHeatPercent * 0.30 + calmWindPercent * 0.15 + sunnyTimePercent * 0.10 - Math.min(60, dangerHeatShare * 100));
    comfortScore = Math.max(0, Math.min(100, comfortScore));
    const cappedComfortScore = heatDanger ? Math.min(35, comfortScore) : comfortScore;

    return {
      comfortScore: Math.max(0, Math.min(100, Math.round(cappedComfortScore))),
      score: Math.max(0, Math.min(100, Math.round(cappedComfortScore))),
      heatDanger,
      rankRain: 100 - dryTimePercent,
      rankWind: 100 - calmWindPercent,
      tempComfortPenalty: Math.max(0, 100 - goodHeatPercent),
      temperatureComfortScore: tempScore,
      temperatureStatus: temperatureLabel(avgFeelsLikeMaxRaw),
      avgMaxTemp: Math.ceil(avgMaxTempRaw),
      avgMinTemp: Math.ceil(avgMinTempRaw),
      avgFeelsLikeMax: Math.ceil(avgFeelsLikeMaxRaw),
      avgFeelsLikeMin: Math.ceil(avgFeelsLikeMinRaw),
      avgRain: Math.max(0, Math.min(100, 100 - dryTimePercent)),
      avgWind: Math.ceil(avgWindRaw),
      avgSunHours: Math.ceil(avgSunHoursRaw || 0),
      avgClearDaytimeHours: avgSunHoursRaw || 0,
      avgDaytimeHours: avgDaytimeHours || 12,
      avgClearDayFraction: Math.max(0, Math.min(1, avgClearDayFraction || 0)),
      clearDayShare: Math.max(0, Math.min(1, clearDayShare || 0)),
      dryTimeShare: Math.max(0, Math.min(1, dryTimeShare || 0)),
      goodHeatShare: Math.max(0, Math.min(1, goodHeatShare || 0)),
      dangerHeatShare: Math.max(0, Math.min(1, dangerHeatShare || 0)),
      calmWindShare: Math.max(0, Math.min(1, calmWindShare || 0)),
      sunnyTimeShare: Math.max(0, Math.min(1, sunnyTimeShare || 0)),
      dryTimePercent,
      goodHeatPercent,
      calmWindPercent,
      sunnyTimePercent,
      avgCloudSignal,
      daytimeOnly: Boolean(forecast.cswDaytimeOnly),
      source: forecast.cswSource || "Open-Meteo forecast",
      mode: forecast.cswMode || "forecast",
      fastStats: Boolean(forecast.cswFastStats)
    };
  }

  function compareWeatherRank(a, b) {
    const aScore = a.weatherScore;
    const bScore = b.weatherScore;
    if (!aScore && !bScore) return 0;
    if (!aScore) return 1;
    if (!bScore) return -1;

    // Final summary table order must always follow the live relative Comfort score.
    // Dangerous heat is already penalised and capped in the score, so it should not
    // break the descending score sort. The only hard safety exception is handled
    // in renderComparisonModalLive(): if a dangerous-heat row would otherwise be #1
    // and a non-dangerous row exists, the best non-dangerous row is promoted to #1.
    if (aScore.comfortScore !== bScore.comfortScore) return bScore.comfortScore - aScore.comfortScore;

    // Tie-breakers keep ordering stable and aligned with the methodology.
    if (aScore.heatDanger !== bScore.heatDanger) return aScore.heatDanger ? 1 : -1;
    if (Math.abs(aScore.avgRain - bScore.avgRain) > 1) return aScore.avgRain - bScore.avgRain;
    if (aScore.temperatureComfortScore !== bScore.temperatureComfortScore) return bScore.temperatureComfortScore - aScore.temperatureComfortScore;
    if (Math.abs(aScore.avgWind - bScore.avgWind) > 1) return aScore.avgWind - bScore.avgWind;
    return aScore.tempComfortPenalty - bScore.tempComfortPenalty;
  }


  function weatherIcon(filename, className, alt = "") {
    return `<img class="${className}" src="${chrome.runtime.getURL(filename)}" alt="${escapeHtml(alt)}" aria-hidden="${alt ? "false" : "true"}" />`;
  }

  function sunScorePercent(weatherScore) {
    const clearFraction = Number(weatherScore?.avgClearDayFraction);
    const clearDayShare = Number(weatherScore?.clearDayShare);

    if (Number.isFinite(clearFraction) || Number.isFinite(clearDayShare)) {
      const fraction = Number.isFinite(clearFraction) ? Math.max(0, Math.min(1, clearFraction)) : 0;
      const dayShare = Number.isFinite(clearDayShare) ? Math.max(0, Math.min(1, clearDayShare)) : fraction;

      // One single score drives both the displayed Sun % and the number of sun icons.
      // This avoids inconsistent cases such as 1 sun at 34% and 2 suns at 33%.
      return Math.max(0, Math.min(100, Math.round((fraction * 0.7 + dayShare * 0.3) * 100)));
    }

    const sunHours = Number(weatherScore?.avgSunHours || 0);
    if (!Number.isFinite(sunHours)) return 0;
    return Math.max(0, Math.min(100, Math.round((sunHours / 12) * 100)));
  }

  function sunCloudIcons(weatherScore) {
    const sunPct = sunScorePercent(weatherScore);
    const sunIcon = weatherIcon("icons/sun.svg", "wtn-sun-icon-img", "sun");

    // Icons are now monotonic and tied to the exact same Sun % shown next to them.
    // 0-24% = clouds, 25-49% = 1 sun, 50-74% = 2 suns, 75-100% = 3 suns.
    if (sunPct >= 75) return `${sunIcon}${sunIcon}${sunIcon}`;
    if (sunPct >= 50) return `${sunIcon}${sunIcon}`;
    if (sunPct >= 25) return sunIcon;
    if (sunPct < 10) return "☁️☁️☁️";
    if (sunPct < 18) return "☁️☁️";
    return "☁️";
  }

  function sunPercent(weatherScore) {
    return sunScorePercent(weatherScore);
  }

  function rainRiskLabel(rain) {
    if (rain <= 20) return "low rain risk";
    if (rain <= 50) return "medium rain risk";
    return "high rain risk";
  }

  function temperatureMarkerPosition(temp) {
    const clamped = Math.max(-5, Math.min(40, temp));
    return Math.round(((clamped + 5) / 45) * 100);
  }

  function windMarkerPosition(wind) {
    const clamped = Math.max(0, Math.min(50, wind));
    return Math.round((clamped / 50) * 100);
  }

  function hexToRgb(hex) {
    const value = String(hex || "").replace("#", "");
    if (value.length !== 6) return { r: 73, g: 204, b: 73 };
    return {
      r: parseInt(value.slice(0, 2), 16),
      g: parseInt(value.slice(2, 4), 16),
      b: parseInt(value.slice(4, 6), 16)
    };
  }

  function rgbToHex({ r, g, b }) {
    return `#${[r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("")}`;
  }

  function blendHexColor(a, b, t) {
    const start = hexToRgb(a);
    const end = hexToRgb(b);
    return rgbToHex({
      r: start.r + (end.r - start.r) * t,
      g: start.g + (end.g - start.g) * t,
      b: start.b + (end.b - start.b) * t
    });
  }

  function comfortScoreColor(score) {
    const value = Math.max(0, Math.min(100, Number(score) || 0));
    const stops = [
      { score: 0, color: "#ef4444" },
      { score: 40, color: "#ff9f1c" },
      { score: 70, color: "#F5EC6D" },
      { score: 100, color: "#49cc49" }
    ];
    for (let i = 0; i < stops.length - 1; i += 1) {
      const left = stops[i];
      const right = stops[i + 1];
      if (value <= right.score) {
        const span = right.score - left.score || 1;
        return blendHexColor(left.color, right.color, (value - left.score) / span);
      }
    }
    return stops[stops.length - 1].color;
  }

  function buildComparisonRow(item, index, isBest, showCountryNames = false) {
    if (item.pending) {
      const pendingMode = shouldUseMonthlyStats(item.search.dates) ? "climate statistics" : "weather forecast";
      return `<tr class="wtn-row-pending">
          <td><div class="wtn-city">${escapeHtml(formatDestinationLabel(item.search, item.location, showCountryNames))}</div></td>
          <td><span class="wtn-pending-text"><span class="wtn-mini-spinner"></span>Loading</span></td>
          <td><span class="wtn-pending-text">—</span></td>
          <td><span class="wtn-pending-text">—</span></td>
          <td><span class="wtn-pending-text">—</span></td>
          <td><span class="wtn-pending-text">—</span></td>
          <td><div class="wtn-date">${escapeHtml(formatDateRange(item.search.dates))}</div><div class="wtn-date-mode">${pendingMode}</div></td>
          <td><button class="wtn-remove" data-remove-id="${escapeHtml(item.search.id)}" aria-label="Remove destination">×</button></td>
        </tr>`;
    }

    if (item.error) {
      return `<tr>
          <td><div class="wtn-city">${escapeHtml(formatDestinationLabel(item.search, item.location, showCountryNames))}</div></td>
          <td><span class="wtn-pending-text">—</span></td>
          <td><span class="wtn-pending-text">—</span></td>
          <td colspan="3"><span class="wtn-pending-text">${escapeHtml(item.error)}</span></td>
          <td><div class="wtn-date">${escapeHtml(formatDateRange(item.search.dates))}</div><div class="wtn-date-mode">Unavailable</div></td>
          <td><button class="wtn-remove" data-remove-id="${escapeHtml(item.search.id)}" aria-label="Remove destination">×</button></td>
        </tr>`;
    }

    const marker = temperatureMarkerPosition(item.weatherScore.avgFeelsLikeMax || item.weatherScore.avgMaxTemp);
    const windMarker = windMarkerPosition(item.weatherScore.avgWind);
    const sunPct = sunPercent(item.weatherScore);
    const bestRowClass = isBest ? "wtn-best-row" : "";
    const scoreColor = comfortScoreColor(item.weatherScore.comfortScore);
    return `<tr class="wtn-scored-row ${bestRowClass}" style="--wtn-score-color:${scoreColor}">
          <td><div class="wtn-city">${escapeHtml(formatDestinationLabel(item.search, item.location, showCountryNames))}</div></td>
          <td><div class="wtn-score-number">${item.weatherScore.comfortScore}</div></td>
          <td class="wtn-temp-cell" title="Air temperature: ${item.weatherScore.avgMaxTemp}°C"><div class="wtn-temp-wrap"><span class="wtn-temp-value" style="left:${marker}%">${item.weatherScore.avgFeelsLikeMax || item.weatherScore.avgMaxTemp}°C</span><span class="wtn-temp-bar"><span class="wtn-temp-marker" style="left:${marker}%"></span></span><div class="wtn-temp-status">${escapeHtml(item.weatherScore.heatDanger ? `${item.weatherScore.goodHeatPercent || 0}% good · ${Math.round((item.weatherScore.dangerHeatShare || 0) * 100)}% danger` : `${item.weatherScore.goodHeatPercent || 0}% good`)}</div></div></td>
          <td><span class="wtn-weather-number">Dry ${item.weatherScore.dryTimePercent ?? Math.max(0, 100 - item.weatherScore.avgRain)}%</span></td>
          <td class="wtn-sun-cell"><span class="wtn-sun-icons">${sunCloudIcons(item.weatherScore)}</span><span class="wtn-sun-hours">${sunPct}%</span></td>
          <td class="wtn-wind-cell" title="${item.weatherScore.avgWind} km/h average daytime wind"><div class="wtn-wind-wrap"><span class="wtn-wind-value" style="left:${windMarker}%">${item.weatherScore.avgWind} km/h</span><span class="wtn-wind-bar"><span class="wtn-wind-marker" style="left:${windMarker}%"></span></span><div class="wtn-temp-status">${item.weatherScore.calmWindPercent ?? 0}% calm</div></div></td>
          <td><div class="wtn-date">${escapeHtml(formatDateRange(item.search.dates))}</div><div class="wtn-date-mode">${item.weatherScore.mode === "monthly-stats" ? "climate statistics" : "weather forecast"}</div></td>
          <td><button class="wtn-remove" data-remove-id="${escapeHtml(item.search.id)}" aria-label="Remove destination">×</button></td>
        </tr>`;
  }

  async function compareDestinations() {
    injectStyles();
    const searches = dedupeByDestination(await getSavedSearches()).map((search) => ({
      ...search,
      dates: ensureTripDates(search.dates)
    }));
    if (searches.length < 1) {
      openComparisonModalLoading(0);
      renderComparisonModalLive([], true);
      showToast("Save at least one destination first.");
      return;
    }
    openComparisonModalLoading(searches.length);

    // Render the table immediately with one independent loading row per destination.
    // The previous version used Promise.allSettled() and rendered only after every row finished,
    // so one monthly-statistics row could make all fast forecast rows appear slow.
    const liveResults = searches.map((search) => ({ search, pending: true }));
    renderComparisonModalLive(liveResults);

    await Promise.allSettled(searches.map(async (search, index) => {
      try {
        const location = search.location || await geocodeDestination(search.destination);
        if (!location) {
          liveResults[index] = { search, error: "Location not found" };
        } else {
          const forecast = await getWeatherForSearch(search, location);
          liveResults[index] = { search, location, weatherScore: scoreWeather(forecast) };
        }
      } catch (error) {
        liveResults[index] = { search, error: error?.message || "Weather data unavailable" };
      }

      // Update as each destination finishes. Forecast rows can appear while monthly stats still load.
      renderComparisonModalLive(liveResults);
    }));

    renderComparisonModalLive(liveResults, true);
  }

  function openComparisonModalLoading(count) {
    const existing = document.getElementById(MODAL_ID);
    if (existing) existing.remove();
    const modal = document.createElement("div");
    modal.id = MODAL_ID;
    modal.innerHTML = `
      <div class="wtn-modal-card">
        <div class="wtn-modal-header">
          <div class="wtn-modal-heading"><div class="wtn-modal-brand"><img class="wtn-modal-brand-logo" src="${chrome.runtime.getURL("icons/umbrella.svg")}" alt="" aria-hidden="true" /> Clear Sky Watch</div><h2 class="wtn-modal-title">Comparing ${count} destinations</h2><p class="wtn-modal-subtitle">Ranking by dry daytime first, then good heat-index hours, then calm wind.</p></div>
          <button class="wtn-modal-close" id="wtn-modal-close-btn" aria-label="Close">×</button>
        </div>
        <div class="wtn-modal-body">
          <div class="wtn-manual-row"><input id="wtn-manual-city-input" class="wtn-manual-input" placeholder="Add destination manually"><button id="wtn-add-manual-btn" class="wtn-btn wtn-add-manual">Add destination</button></div>
          <div class="wtn-loading">Preparing comparison...</div>
        </div>
      </div>`;
    document.body.appendChild(modal);
    document.getElementById("wtn-modal-close-btn")?.addEventListener("click", () => modal.remove());
    document.getElementById("wtn-add-manual-btn")?.addEventListener("click", addManualDestinationFromModal);
    document.getElementById("wtn-manual-city-input")?.addEventListener("keydown", (event) => { if (event.key === "Enter") addManualDestinationFromModal(); });
  }

  function renderComparisonModalLive(results, final = false) {
    const modal = document.getElementById(MODAL_ID);
    if (!modal) return;
    applyRelativeWeatherRating(results);
    const completed = results.filter((item) => item.weatherScore).sort(compareWeatherRank);

    // Keep the table sorted by the live relative rating after every added/loaded row.
    // Safety rule: >35°C feels-like cannot be the highlighted/top destination when
    // at least one non-dangerous completed destination exists. In that special case,
    // promote the highest-scoring non-dangerous row to #1, then continue sorting by score.
    if (completed.length > 1 && completed[0]?.weatherScore?.heatDanger) {
      const safeIndex = completed.findIndex((item) => item.weatherScore && !item.weatherScore.heatDanger);
      if (safeIndex > 0) {
        const [safeTop] = completed.splice(safeIndex, 1);
        completed.unshift(safeTop);
      }
    }

    const pending = results.filter((item) => item.pending);
    const failed = results.filter((item) => item.error);
    const ordered = [...completed, ...pending, ...failed];
    const comparedCountries = new Set(completed.map((item) => normalizeLabelToken(item.location?.country || "")).filter(Boolean));
    const showCountryNames = comparedCountries.size > 1;


    const body = modal.querySelector(".wtn-modal-body");
    body.innerHTML = `
      <div class="wtn-manual-row"><input id="wtn-manual-city-input" class="wtn-manual-input" placeholder="Add destination manually"><button id="wtn-add-manual-btn" class="wtn-btn wtn-add-manual">Add destination</button></div>
      ${ordered.length ? `<table class="wtn-table"><thead><tr><th>Destination</th><th>Comfort score</th><th><span class="wtn-two-line-th">Heat index<span>[air temp &amp; humidity]</span></span></th><th>${weatherIcon("icons/droplet.svg", "wtn-weather-svg-icon", "dry daytime")}no rain</th><th>${weatherIcon("icons/sun.svg", "wtn-weather-svg-icon", "sun")}Sunny</th><th><span class="wtn-windsock-icon" aria-hidden="true"></span>wind</th><th>${weatherIcon("icons/calendar.svg", "wtn-weather-svg-icon", "dates")}Selected dates</th><th></th></tr></thead><tbody>${ordered.map((item, index) => buildComparisonRow(item, index, completed.length && item === completed[0], showCountryNames)).join("")}</tbody></table>` : `<div class="wtn-loading">No destinations to compare.</div>`}
      ${pending.length ? `<div class="wtn-loading">${pending.length} destination${pending.length === 1 ? " is" : "s are"} still loading. Available forecasts are shown above.</div>` : ""}
      ${failed.length && final ? `<div class="wtn-error-note">Some destinations could not be checked: ${failed.map((item) => escapeHtml(abbreviateDestinationName(item.search.destination))).join(", ")}</div>` : ""}`;

    document.getElementById("wtn-add-manual-btn")?.addEventListener("click", addManualDestinationFromModal);
    document.getElementById("wtn-manual-city-input")?.addEventListener("keydown", (event) => { if (event.key === "Enter") addManualDestinationFromModal(); });
    body.querySelectorAll(".wtn-remove").forEach((button) => {
      button.addEventListener("click", () => removeDestination(button.getAttribute("data-remove-id")));
    });
  }

  function renderComparisonModalResults(bestResults, allResults) {
    // Kept for compatibility with older popup/message flows; the live renderer is now used by compareDestinations().
    renderComparisonModalLive(allResults || bestResults || [], true);
  }

  function showToast(message) {
    injectStyles();
    const existing = document.getElementById(TOAST_ID);
    if (existing) existing.remove();

    const toast = document.createElement("div");
    toast.id = TOAST_ID;
    toast.innerHTML = `<div class="wtn-ok-row"><div class="wtn-ok-icon">!</div><div><div class="wtn-ok-text">${escapeHtml(message || "Something went wrong.")}</div></div></div>`;
    document.body.appendChild(toast);
    window.setTimeout(() => {
      if (document.body.contains(toast)) toast.remove();
    }, 4200);
  }

  function setupRobustCloseButtonHandler() {
    if (window.__clearSkyWatchRobustCloseButtonHandler) return;
    window.__clearSkyWatchRobustCloseButtonHandler = true;
    const handler = (event) => {
      const button = event.target?.closest?.(".wtn-widget-close, #wtn-widget-close-btn");
      if (!button) return;
      event.preventDefault();
      event.stopPropagation();
      if (typeof event.stopImmediatePropagation === "function") event.stopImmediatePropagation();
      dismissWidget();
    };
    document.addEventListener("pointerdown", handler, true);
    document.addEventListener("click", handler, true);
  }

  function setupRobustSaveButtonHandler() {
    if (window.__clearSkyWatchRobustSaveButtonHandler) return;
    window.__clearSkyWatchRobustSaveButtonHandler = true;

    const handler = (event) => {
      const saveButton = event.target?.closest?.("#wtn-save-btn");
      if (!saveButton || saveButton.disabled) return;

      // Booking.com can re-render parts of the page between pointerdown and click.
      // Capture the action immediately so the Save button cannot be lost by DOM updates.
      event.preventDefault();
      event.stopPropagation();
      if (typeof event.stopImmediatePropagation === "function") {
        event.stopImmediatePropagation();
      }

      saveCurrentDestination().catch((error) => {
        showToast(error?.message || "Destination could not be saved.");
      });
    };

    document.addEventListener("pointerdown", handler, true);
  }


  function setupRobustCompareButtonHandler() {
    if (window.__clearSkyWatchRobustCompareButtonHandler) return;
    window.__clearSkyWatchRobustCompareButtonHandler = true;
    const handler = (event) => {
      const compareButton = event.target?.closest?.("#wtn-compare-btn");
      if (!compareButton || compareButton.disabled) return;
      event.preventDefault();
      event.stopPropagation();
      if (typeof event.stopImmediatePropagation === "function") event.stopImmediatePropagation();
      compareDestinations().catch((error) => showToast(error?.message || "Comparison could not be opened."));
    };
    document.addEventListener("pointerdown", handler, true);
    document.addEventListener("click", handler, true);
  }

  // Toolbar popup fallback: the page exposes the comparison function so the
  // extension can open the modal even when chrome.runtime message passing is
  // interrupted by a travel-site SPA update.
  window.clearSkyWatchCompareDestinations = () => compareDestinations();
  window.clearSkyWatchSaveCurrentDestination = () => saveCurrentDestination();
  window.clearSkyWatchRenderWidget = () => renderWidget();

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "GET_BOOKING_SEARCH") { sendResponse(readBookingSearchData()); return true; }
    if (message.type === "SAVE_BOOKING_SEARCH") { saveCurrentDestination().then((ok) => sendResponse({ ok: Boolean(ok) })).catch((error) => sendResponse({ ok: false, error: error?.message || "Save failed" })); return true; }
    if (message.type === "COMPARE_DESTINATIONS") { compareDestinations().then(() => sendResponse({ ok: true })).catch((error) => sendResponse({ ok: false, error: error?.message || "Compare failed" })); return true; }
  });

  setupRobustCloseButtonHandler();
  setupRobustSaveButtonHandler();
  setupRobustCompareButtonHandler();

  chrome.storage?.onChanged?.addListener((changes, areaName) => {
    if (areaName === "local" && changes[STORAGE_KEY]) {
      renderWidget();
      window.setTimeout(updateSelectedDestinationsInPlace, 0);
      window.setTimeout(updateSelectedDestinationsInPlace, 120);
      if (document.getElementById(MODAL_ID)) compareDestinations();
    }
  });

  function scheduleRender() {
    // Render immediately so the floating panel does not disappear during SPA/search updates,
    // then refresh after the travel site finishes replacing its search content.
    renderWidget();
    window.setTimeout(renderWidget, 300);
    window.setTimeout(renderWidget, 1000);
    window.setTimeout(renderWidget, 2500);
  }

  function setupBookingPopupPersistenceWatchdog() {
    if (!isBookingHost() || window.__clearSkyWatchPopupPersistenceWatchdog) return;
    window.__clearSkyWatchPopupPersistenceWatchdog = true;
    let restoreTimer = null;
    const restoreIfNeeded = () => {
      if (restoreTimer) window.clearTimeout(restoreTimer);
      restoreTimer = window.setTimeout(() => {
        restoreTimer = null;
        if (!isWidgetDismissed() && isLikelyTravelPage() && !document.getElementById(WIDGET_ID)) {
          renderWidget();
        }
      }, 0);
    };
    const observer = new MutationObserver(restoreIfNeeded);
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  setupBookingLiveDestinationListeners();
  setupBookingPopupPersistenceWatchdog();

  // On Booking.com, clear any stale close-state at first injection so the popup appears on reload.
  if (isBookingHost()) {
    clearWidgetDismissal();
  }

  scheduleRender();
  let lastUrl = window.location.href;
  window.setInterval(() => {
    if (window.location.href !== lastUrl) {
      lastUrl = window.location.href;
      bookingLiveDestinationOverride = null;
      bookingLiveDestinationTouchedAtMs = 0;
      clearWidgetDismissal();
      scheduleRender();
      return;
    }
    if (isBookingHost()) {
      forceBookingDestinationRefreshFromPage(document.activeElement);
    }
  }, 1200);
})();
