# Clear Sky Watch

Clear Sky Watch is a Chrome Extension that helps users save travel destinations from supported travel websites and compare weather conditions for their trip dates.

this is a DEMO VERSION.

Product owner company: [Demetra](https://www.pappers.fr/entreprise/demetra-941049322)
Technology and intellectual property owner: [Demetra](https://www.pappers.fr/entreprise/demetra-941049322)
Partnership proposals: For collaboration, partnership or commercial proposals, please feel free to reach out: contact@demetra-tech.com
Licence contact / author attribution: [Elena Maksimovich](https://www.linkedin.com/in/elena-maksimovich/)
Version: `1.0` demo package

Compare button visibility: the Compare destinations button is hidden until at least one destination is selected. The popup helper text is shortened to “Save destinations, then compare weather”.

Booking.com no-flicker city editing fix: the floating popup remains mounted while the user changes the destination field and updates the detected city in place.

## Main features

- Detects destination and trip dates from supported travel websites.
- Lets the user save destinations for comparison.
- Compares destinations using weather data.
- Ranks destinations by lowest rain first, then humidity-adjusted temperature, then wind.
- Uses real forecast data for near-future travel dates when available.
- Uses typical same-calendar-month weather statistics for longer trips or dates outside the forecast range.
- Supports multiple geocoding and weather sources.
- Shows a visual comparison table with rain, sun percentage, temperature colorbar, and wind colorbar.

## Supported travel websites

The extension is configured to run on supported travel, accommodation, rail, activity, and airline websites. The destination extractor uses destination/arrival/to fields only and avoids suggesting FROM/origin fields.

### Supported website list

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

Because travel websites frequently change their page structure, destination and date extraction should be tested regularly on the highest-priority websites.

## Weather sources

Current default and fallback sources include:

- Open-Meteo Forecast API
- Open-Meteo Historical Archive API
- Open-Meteo Geocoding API
- OpenStreetMap Nominatim geocoding
- Photon / Komoot geocoding
- MET Norway forecast API
- Optional WeatherAPI.com fallback, if an API key is provided
- Optional OpenWeather fallback, if an API key is provided

## Current status

This is a demo/MVP extension. It is suitable for testing, product demonstrations, and internal iteration. Before public distribution, review legal, privacy, API terms, branding, and Chrome Web Store compliance.

### Calling the extension manually
Clear Sky Watch is available from the Chrome Extensions menu with the umbrella icon. To keep it always visible in the toolbar, open Chrome's Extensions puzzle menu and pin Clear Sky Watch. Chrome does not allow extensions to pin themselves automatically.




Final summary table sorting: the comparison table is re-sorted dynamically after every destination finishes loading, using the live relative Comfort score. The best-rated destination is always kept at the top and is highlighted as #1. In the Dates column, forecast rows are labelled “weather forecast” and climatology rows are labelled “climate statistics”.

### Weather rating methodology

Clear Sky Watch uses a dynamic relative weather rating between the selected destinations. 
The summary table labels the temperature metric as “Heat index [air temp & humidity]” to make clear that air temperature and humidity are considered. 
Rain is always the primary criterion: no rain or minimum rain ranks first. 
Temperature comes second factor 
We show humidity-adjusted / feels-like temperature. 
Wind is third. 
Best conditions are sunny, wind speed below 36 km/h, and temperature within 20-28°C. 
Temperatures above 30°C are penalised
Temperatures above 35°C are treated as dangerous heat and cannot rank above non-dangerous destinations.

Temperature rating anchors: 16°C = 44, 24°C = 100, 27°C = 100, 28°C = 92, 29°C = 80, 30°C = 68, 32°C = 44, 35°C = 8.


### Movable umbrella launcher
On supported travel pages, when the floating panel is closed, Clear Sky Watch keeps a small draggable umbrella launcher available. The launcher can be moved manually by the user and reopened with one click. Its position is saved per website. The launcher uses a pale green background (#caffca), a #7c7cff circle contour, and a #7c7cff umbrella fitted inside the circle with a small margin.


### Visual comfort score scale
The "Comfort Score" column now uses a dynamic green → yellow → orange → red font color palette. The row contour uses the same color as the displayed Comfort score, so the table communicates relative quality visually as well as numerically.


### Per-destination date rule
Each saved destination keeps the date range captured at the exact moment the user clicks “Add destination”. Clear Sky Watch never imposes the previous destination’s dates on a newly added destination. Weather or monthly climate data is prefetched immediately for that destination’s own stored dates. Forecast-compatible dates may show a short preview right away; dates beyond the forecast window are saved and prefetched without showing a forecast preview. The relative weather rating is calculated only when the user clicks “Compare destinations”.

### Comparison table visual rule
Comparison row contours are light grey by default. Only the #1 ranked destination uses the same contour color as its Comfort score text. The comparison sun icon uses #ffd60a.


### Booking.com live city editing

On Booking.com, Clear Sky Watch now reads the city/destination field while the user types or edits it. The floating popup stays visible during city-field updates and does not wait for the Booking.com “Search/Rechercher” button.


Save destination repair: destinations are saved immediately at click time, with geocoding and weather prefetch running afterward in the background so the button remains responsive.


### Reliability note
The Save destination button stores the selected destination immediately. Geocoding and weather prefetch run afterward in the background, so slow weather services cannot block saving.


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


### v1.11.59 — Destination name cleaning

Destination names are cleaned before saving/displaying. Kayak-style noisy prefixes such as `A...barcelone`, travel arrows, origin/from fragments, and generic UI words are removed. Selected destinations remain simple and unique; country names are shown in comparison only when destinations are in different countries.


### Daytime-only weather scoring

For forecast-based comparisons, Clear Sky Watch evaluates rain, wind, sun and cloud coverage using local daytime hours only. Night-time rainfall, night-time wind and night-time cloud/sun conditions are ignored. The sun icons are based on daytime hours with cloud coverage below 50% and on how many selected trip days are mostly clear during the day. The displayed Sun % and the number of sun icons are driven by the same monotonic daytime-sun score: 0-24% shows clouds, 25-49% shows 1 sun, 50-74% shows 2 suns, and 75-100% shows 3 suns.

### v1.11.64 - French weekday date parsing fix
- French weekday words and abbreviations such as mardi and mar. are ignored during date parsing, so mar. is not misread as March.
- Month names such as mars still parse correctly.


### 1.11.64 - Exact per-destination visible-date repair
- Save/Add destination now reads Booking.com visible date controls scoped to the current searchbox before URL parameters.
- Previous destination dates are inherited only when the current search has no visible dates and no URL dates.
- Booking.com stale SPA URL dates are ignored when visible date controls are present.

Favourable daytime time-share scoring: the comparison table now scores and displays the percentage of useful daytime conditions instead of relying only on averages. The Comfort score uses 45% dry daytime share, 30% good heat-index share, 15% calm wind share, and 10% sunny daytime share, with a dangerous-heat penalty above 35°C.
