# Technical documentation

## Architecture

Clear Sky Watch is a Manifest V3 Chrome Extension.

Main files:

- manifest.json: Extension configuration, permissions, supported sites, icons, popup entry point.
- content.js: Runs on supported travel websites, detects destination/date data, injects the floating card and comparison modal, calls weather/geocoding APIs.
- popup.html: Extension toolbar popup markup.
- popup.css: Popup styling.
- popup.js: Popup logic, saved destination management, optional API key storage.
- icons/: Extension icons.
- docs/: Documentation and legal drafts.

## Browser storage

The extension stores saved destinations in chrome.storage.local.

Typical stored fields:

- destination
- dates
- pageUrl
- savedAt
- optional API keys

## Supported websites

The supported websites are listed alphabetically. The extension extracts only the travel destination/arrival/to city. It does not suggest FROM/origin/departure names for comparison.

- Abritel
- Aegean Airlines
- Aer Lingus
- Aeromexico
- Agoda
- Air Canada
- Air China
- Air Europa
- Air France
- Airbnb
- Alaska Airlines
- American Airlines
- Austrian Airlines
- Bahn.de
- Booking.com
- British Airways
- Brussels Airlines
- Cathay Pacific
- Delta
- easyJet
- Emirates
- Etihad Airways
- Eurowings
- Expedia
- Finnair
- Gites.fr
- Google Flights
- GreenGo
- Holidu
- Hostelworld
- Hotels.com
- Iberia
- ITA Airways
- Jet2
- Kayak
- KLM
- Klook
- lastminute.com
- LATAM Airlines
- Liligo
- Lufthansa
- Momondo
- Norwegian
- Opodo
- Orbitz
- Priceline
- Qantas
- Qatar Airways
- Ryanair
- SAS
- Singapore Airlines
- Skyscanner
- SWISS
- TAP Air Portugal
- Transavia
- Travelocity
- Travix
- Trip.com
- Tripadvisor
- Trivago
- Turkish Airlines
- United Airlines
- Volotea
- Vrbo
- Vueling
- Wizz Air

## Destination detection

The extension uses multiple strategies:

1. Website-specific URL patterns.
2. Query parameters such as destination, query, ss, checkin, checkout.
3. Search input values and aria labels.
4. Metadata and document title fallbacks.
5. Filtering to reject generic words such as homes, stays, rooms, search, hotels.

Travel websites should be tested individually because DOM structures change frequently.

## Weather workflow

1. Extract destination and dates.
2. Geocode destination to latitude/longitude.
3. Determine whether real forecast or monthly statistics should be used.
4. Fetch weather data.
5. Normalize weather metrics.
6. Rank destinations.
7. Render comparison table.

## Ranking methodology

Primary ranking criterion: lowest rain probability / no rain.
Secondary ranking criterion: humidity-adjusted temperature / feels-like temperature.
Tertiary ranking criterion: lowest wind speed.

The displayed Weather / Comfort score is dynamic and relative between the destinations selected for the current comparison. This prevents the app from unfairly penalising every destination in a season where the ideal 20-28°C range is unavailable, while still strongly penalising temperatures above 30°C.

Best conditions are sunny, wind speed below 36 km/h, and humidity-adjusted temperature between 20-28°C. Temperature anchors are: 16°C = 44, 24°C = 100, 27°C = 100, 28°C = 92, 29°C = 80, 30°C = 68, 32°C = 44, 35°C = 8.

A destination with meaningful rain should not rank ahead of a destination with no/minimum rain unless the rain values are effectively tied.

## Current limitations

- Some travel sites may require custom selectors.
- Browser extensions should not contain secret production API keys.
- Forecast availability depends on weather API limits.
- Historical monthly statistics are not a forecast and should be labelled as typical weather. Cached climatology is used first; if NASA POWER is slow or unavailable, a fast typical-stats estimate is returned to keep the table responsive.


Dangerous heat rule: if humidity-adjusted / feels-like temperature is above 35°C, the destination cannot rank above a non-dangerous destination.


## v1.11.32 Comfort score row coloring
Comparison rows expose a CSS variable `--wtn-score-color` derived from the destination Comfort score. The same value is used for the score text and row contour. The palette interpolates between red, orange, yellow, and green.


### Per-destination date rule
Each saved destination keeps the date range captured at the exact moment the user clicks “Add destination”. Clear Sky Watch never imposes the previous destination’s dates on a newly added destination. Weather or monthly climate data is prefetched immediately for that destination’s own stored dates. Forecast-compatible dates may show a short preview right away; dates beyond the forecast window are saved and prefetched without showing a forecast preview. The relative weather rating is calculated only when the user clicks “Compare destinations”.

### Comparison table visual rule
Comparison row contours are light grey by default. Only the #1 ranked destination uses the same contour color as its Comfort score text. The comparison sun icon uses #ffd60a.


## v1.11.38 Booking.com live city input detection

The content script listens to Booking.com destination input events (`input`, `keyup`, `change`, `compositionend`, and `focusin`) and observes searchbox mutations. The live input value takes priority over the URL query while editing, so the popup reflects city changes before the Booking.com page search is submitted. Rendering is debounced and keeps the existing popup node mounted to avoid the visible disappear/reappear effect during city edits.


Save destination repair: destinations are saved immediately at click time, with geocoding and weather prefetch running afterward in the background so the button remains responsive.


## v1.11.45 destination list and supported-site repair

Saved destinations are keyed by destination + stored travel dates + source site, so adding a second destination or the same place with different dates does not overwrite or hide a previous selection. The comparison action accepts any visible selected destination list with at least one item. Supported site documentation is alphabetically sorted, and flight/rail/activity pages now use destination-only extraction: arrival/to fields are accepted; FROM/origin/departure fields are ignored.


Booking.com destination changes are detected as soon as the user selects a city suggestion; clicking Rechercher/Search is not required. Each destination still stores the travel dates captured at its own Add destination click.


### v1.11.50 — Selected destinations list repair
- The “Selected destinations” list now shows only destination names, never dates.
- The same destination is shown only once. Saving the same city again updates its stored travel dates instead of adding a duplicate.
- A destination is inserted into the selected list immediately after “Save destination” is clicked; weather/geocoding enrichment continues in the background.


### Version 1.11.50 note
The popup now refreshes selected destinations immediately after saving, shows destination names only, and shows the Compare button as soon as at least one destination is selected. Booking.com selected cities are displayed in the popup without clicking Rechercher/Search.

### v1.11.52 — Immediate selected-list refresh repair
- Fixed the floating popup selected-destinations list after Save destination.
- The saved city now appears immediately below the Save destination button.
- Repaired the selected-list renderer so it no longer fails because of an undefined pill markup variable.
- Compare button visibility is refreshed from the saved destination list after every storage update.


Final summary table sorting: the comparison table is re-sorted dynamically after every destination finishes loading, using the live relative Comfort score. The best-rated destination is always kept at the top and is highlighted as #1. In the Dates column, forecast rows are labelled “weather forecast” and climatology rows are labelled “climate statistics”.


### Daytime-only weather scoring

For forecast-based comparisons, Clear Sky Watch evaluates rain, wind, sun and cloud coverage using local daytime hours only. Night-time rainfall, night-time wind and night-time cloud/sun conditions are ignored. The sun icons are based on daytime hours with cloud coverage below 50% and on how many selected trip days are mostly clear during the day. The displayed Sun % and the number of sun icons are driven by the same monotonic daytime-sun score: 0-24% shows clouds, 25-49% shows 1 sun, 50-74% shows 2 suns, and 75-100% shows 3 suns.

### v1.11.64 - French weekday date parsing fix
- French weekday words and abbreviations such as mardi and mar. are ignored during date parsing, so mar. is not misread as March.
- Month names such as mars still parse correctly.

Favourable daytime time-share scoring: the comparison table now scores and displays the percentage of useful daytime conditions instead of relying only on averages. The Comfort score uses 45% dry daytime share, 30% good heat-index share, 15% calm wind share, and 10% sunny daytime share, with a dangerous-heat penalty above 35°C.
