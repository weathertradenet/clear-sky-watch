# Third-party API notes

Clear Sky Watch may use the following third-party APIs depending on availability and configuration.

## Open-Meteo

Purpose:

- Weather forecast
- Historical weather archive
- Geocoding

Key requirement: no key for common free usage.

## OpenStreetMap Nominatim

Purpose:

- Fallback geocoding when Open-Meteo geocoding does not find a destination.

Important:

- Respect usage policy and rate limits.
- For production, consider a dedicated geocoding service or server-side caching.

## Photon / Komoot

Purpose:

- Additional fallback geocoding.

## MET Norway

Purpose:

- Free forecast fallback for global locations.

Important:

- Respect API terms and user-agent/contact requirements if applicable.

## WeatherAPI.com

Purpose:

- Optional forecast fallback.

Key requirement: API key.

## OpenWeather

Purpose:

- Optional forecast fallback.

Key requirement: API key.

## Production recommendation

For a public product, do not expose private API keys in extension JavaScript. Use a backend proxy or controlled key-management system.

## NASA POWER Climatology API
Clear Sky Watch uses NASA POWER monthly climatology for destinations whose trip dates are outside the reliable short-term forecast window. This avoids downloading and aggregating multiple years of daily historical data in the browser.
