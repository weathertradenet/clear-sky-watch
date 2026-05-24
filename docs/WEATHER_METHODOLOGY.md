# Weather methodology

## Objective

Clear Sky Watch compares destinations for travel comfort during selected trip dates.

## Primary ranking rule

The ranking is intentionally not a generic weather score. It follows the user's travel priority:

1. No rain / lowest rain probability
2. Humidity-adjusted temperature / feels-like temperature
3. Lowest wind speed

The rating is dynamic and relative between the selected destinations, because in some seasons it is impossible for any compared location to reach ideal temperatures. Rain remains the primary criterion even in relative mode.

Best conditions are: sunny weather, wind speed below 36 km/h, and humidity-adjusted temperature within 20-28°C. Temperatures above 30°C are penalised. Temperatures above 35°C are treated as dangerous heat: a destination above this threshold can never rank above a non-dangerous destination.

Temperature rating anchors:

| Feels-like temperature | Temperature rating |
|---:|---:|
| 16°C | 44 |
| 24°C | 100 |
| 27°C | 100 |
| 28°C | 92 |
| 29°C | 80 |
| 30°C | 68 |
| 32°C | 44 |
| 35°C | 8 |

## Real forecast mode

When trip dates are within the available forecast range, the extension uses forecast data for those dates.

Metrics include:

- Rain / precipitation probability
- Wind speed
- Feels-like maximum and minimum temperature, when available
- Air temperature as a fallback only when feels-like temperature is unavailable
- Sunny hours / cloud indicators, where available or derived

## Monthly statistics mode

If trip dates are outside the available forecast range or the trip duration is longer than 7 days, the extension can use historical weather statistics for the same calendar month at the same location.

Example:

A trip to Lisbon in August can use historical August data for Lisbon when real August forecast data is unavailable.

This should be displayed as typical weather, not a real forecast. Monthly statistics use the same comfort-temperature logic as forecast rows. When no apparent-temperature climatology is available, the app uses monthly air temperature as the best available proxy for feels-like comfort.

## Ranking interpretation

A high-ranked destination means it is likely to be better according to the current method: less rain first, then better humidity-adjusted temperature, then calmer wind. The final score is relative to the destinations selected in that comparison.

The “Heat index [air temp & humidity]” column uses feels-like temperature when available, because humidity can make the same air temperature feel more or less comfortable. Air temperature is used only as a fallback.

## Important limitation

Weather forecasts and climate statistics are uncertain. The output is a decision-support comparison, not a guarantee.


## Fast stats behavior

Monthly statistics are cached locally by rounded coordinate and month. Cached stats are shown immediately. When NASA POWER climatology is slow or unavailable, Clear Sky Watch returns a fast typical-stats estimate so the comparison table remains responsive.


## Dangerous heat rule

If the average humidity-adjusted / feels-like maximum temperature is above 35°C, the location is marked as dangerous heat. It cannot rank above any destination at or below 35°C, even if it has less rain. This prevents unsafe heat from appearing as the top recommendation.


## Comfort score visual color scale
The displayed Comfort score is color-coded from green to yellow to orange to red. Higher scores are greener; lower scores move toward orange and red. The comparison row contour uses the same color as the Comfort score text so that weak and strong destinations are visible at a glance.


### Per-destination date rule
Each saved destination keeps the date range captured at the exact moment the user clicks “Add destination”. Clear Sky Watch never imposes the previous destination’s dates on a newly added destination. Weather or monthly climate data is prefetched immediately for that destination’s own stored dates. Forecast-compatible dates may show a short preview right away; dates beyond the forecast window are saved and prefetched without showing a forecast preview. The relative weather rating is calculated only when the user clicks “Compare destinations”.

### Comparison table visual rule
Comparison row contours are light grey by default. Only the #1 ranked destination uses the same contour color as its Comfort score text. The comparison sun icon uses #ffd60a.


Final summary table sorting: the comparison table is re-sorted dynamically after every destination finishes loading, using the live relative Comfort score. The best-rated destination is always kept at the top and is highlighted as #1. In the Dates column, forecast rows are labelled “weather forecast” and climatology rows are labelled “climate statistics”.


### Daytime-only weather scoring

For forecast-based comparisons, Clear Sky Watch evaluates rain, wind, sun and cloud coverage using local daytime hours only. Night-time rainfall, night-time wind and night-time cloud/sun conditions are ignored. The sun icons are based on daytime hours with cloud coverage below 50% and on how many selected trip days are mostly clear during the day. The displayed Sun % and the number of sun icons are driven by the same monotonic daytime-sun score: 0-24% shows clouds, 25-49% shows 1 sun, 50-74% shows 2 suns, and 75-100% shows 3 suns.

### v1.11.64 - French weekday date parsing fix
- French weekday words and abbreviations such as mardi and mar. are ignored during date parsing, so mar. is not misread as March.
- Month names such as mars still parse correctly.

## Favourable daytime time-share scoring

From v1.11.65, Clear Sky Watch avoids average-only scoring because averages can make different cities look identical. For forecast rows, it evaluates local daytime hours only and calculates the share of favourable time:

- **Dry time**: daytime hours with precipitation probability below 30%.
- **Good heat**: daytime hours with feels-like / heat-index temperature between 20°C and 28°C.
- **Danger heat**: daytime hours with feels-like / heat-index temperature above 35°C.
- **Calm wind**: daytime hours with wind speed below 36 km/h.
- **Sunny time**: daytime hours with cloud cover below 50%, combined with the share of mostly-clear daytime trip days.

The Comfort score is calculated as:

`45% dry time + 30% good heat + 15% calm wind + 10% sunny time - dangerous heat penalty`

The score is still relative between the selected destinations, but it is now anchored to those favourable-time shares. This gives more differentiated and useful results than simple averages.
