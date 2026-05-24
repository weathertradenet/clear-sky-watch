# Clear Sky Watch

Clear Sky Watch is a Chrome Extension that helps users save travel destinations from supported travel websites and compare weather conditions for their trip dates.

this is a DEMO VERSION.

Product owner company: [Demetra](https://www.pappers.fr/entreprise/demetra-941049322)
Technology and intellectual property owner: [Demetra](https://www.pappers.fr/entreprise/demetra-941049322)
Partnership proposals: For collaboration, partnership or commercial proposals, please feel free to reach out: contact@demetra-tech.com
Licence contact / author attribution: [Elena Maksimovich](https://www.linkedin.com/in/elena-maksimovich/)
Version: `1.0` demo package

Welcome to contribute to this project via github: **weathertradenet/clear-sky-watch.git** and via **Reddit** !

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


