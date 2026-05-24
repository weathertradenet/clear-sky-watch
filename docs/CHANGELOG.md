## 1.11.65 - Favourable daytime time-share scoring
- Replaced average-only scoring with percentage-of-favourable-daytime methodology.
- Comfort score now uses: dry daytime share 45%, good heat-index daytime share 30%, calm daytime wind share 15%, sunny daytime share 10%.
- Rain column now displays Dry time %, Heat index displays the share of daytime hours in the good 20-28°C range, and Wind displays Calm wind %.
- Night-time rain, wind, sun and cloud values remain ignored.
- Dangerous heat above 35°C remains capped and cannot be promoted as the best non-dangerous result.


## 1.11.61 - Daytime-only weather scoring

- Rainfall, wind, sun and cloud coverage are now evaluated during local daytime hours only when hourly forecast data is available.
- Night-time rain, night-time wind and night-time cloud/sun values are ignored for the Comfort score.
- Sun icons now reflect clear daytime hours and the share of trip days with daytime cloud coverage below 50%.

## 1.11.60 - Icon path repair and calendar header icon
- Repaired comparison-table weather icon loading by exposing `icons/*` to all pages via `web_accessible_resources`.
- Added `icons/calendar.svg` and displayed it in the Dates column header.
- Kept ZIP structure flat at the root.

## 1.11.59 - Destination name cleaning for travel sites

- Cleaned noisy destination strings before saving/displaying, including Kayak-style prefixes such as `A...barcelone`.
- Removed irrelevant symbols, arrows, origin/from fragments, and generic travel UI words from destination names.
- Kept selected-destination names simple and unique.
- Country names are appended in the comparison table only when compared destinations are in different countries.


## 1.11.58 - Manual-add dynamic sort repair
- Fixed the comparison table sort after adding a destination manually from the comparison card.
- The table now re-sorts by live relative Comfort score after every manual addition and every loaded row.
- Dangerous heat still cannot be highlighted as #1 when a non-dangerous destination is available, but dangerous rows remain sorted by score below that safety rule.

## 1.11.56 - Dynamic comparison sort and date labels

- Final summary table now re-sorts dynamically after every live weather/statistics update, using the current relative Comfort score so the best-rated destination stays at the top.
- Dates column labels changed from “Weather” to “weather forecast” and from “stats” to “climate statistics”.

## 1.11.55 - Simple destination names repair
- Simplified destination-name handling: selected-destination lists and current-destination labels show one short city/local-area name only.
- Geocoding enrichment no longer replaces the user-selected destination label with a complex administrative/geocoded name.
- Comparison still adds country name only when comparing destinations across different countries.


## 1.11.54 - Exact click-date save repair

- Repaired destination-date capture so Save destination always stores the dates visible at the exact click moment.
- Previous destination dates are copied only when the current search has no dates at all.
- Fixed toolbar popup date fallback so it no longer calls content-script-only date helpers.
- Removed duplicate direct Save click binding to avoid double-save conflicts.
- Booking.com reload clears stale close-state so the floating popup appears again.

## 1.11.52

- Restored immediate Booking.com destination display above the Save destination button while the user edits or selects a city.
- Broadened Booking.com live input/suggestion detection so the popup updates before Rechercher/Search.

## 1.11.51 - Immediate selected-list refresh repair
- Fixed the floating popup selected-destinations list after Save destination.
- The saved city now appears immediately below the Save destination button.
- Repaired the selected-list renderer so it no longer fails because of an undefined pill markup variable.
- Compare button visibility is refreshed from the saved destination list after every storage update.

## 1.11.50 - Popup selected-destination state repair

- Fixed the floating popup state after saving a destination.
- The currently detected Booking.com destination is shown above “Save destination” immediately when selected.
- The selected-destinations list refreshes immediately after saving and shows destination names only.
- The “Compare destinations” button appears as soon as at least one destination is saved.

## 1.11.48 - Booking.com selected-city live display repair

- Fixed Booking.com city suggestion detection so the selected city is visible in the Clear Sky Watch popup immediately after selection.
- The popup no longer waits for Booking.com's Rechercher/Search button to update the URL or results.
- Dates continue to be captured only at the exact Save destination click for that destination.

## 1.11.45 - Manifest match pattern fix

## 1.11.46 - Booking.com live city selection and close button repair

- Fixed the floating popup close X so it reliably dismisses the popup and leaves the small umbrella launcher available.
- Booking.com destination changes are now detected immediately when the user selects a city from the suggestion list, before clicking Rechercher/Search.
- Dates are still captured only at the exact Add destination click for each destination.

- Fixed invalid Chrome manifest match patterns for Google Flights/Search by using valid origin-wide Chrome patterns.
- Extension now loads again after the supported-sites expansion.

## 1.11.45 - Destination list, compare, and supported sites repair

- Repaired the selected-destination list so newly saved destinations appear immediately at the bottom of the popup card.
- Saved destinations are now deduplicated by destination + travel dates + source site, not by name alone.
- Repaired Compare destinations by allowing comparison with 1+ selected destination and by retrying content-script injection from the Chrome popup.
- Added live storage-change refresh so page popup and toolbar popup stay synchronized.
- Added Google Flights, Ryanair, easyJet, Klook, Bahn.de, and many major airline sites.
- Updated destination extraction for flight/rail sites to use only destination/arrival/to fields and ignore FROM/origin/departure fields.
- Sorted the supported travel website list alphabetically in the documentation.

## 1.11.41 - Save destination repair
- Repaired the Save destination action so it stores the destination immediately and no longer waits for geocoding or weather services.
- Added a Chrome popup timeout fallback so the button recovers quickly if the content script response is slow.
- Manual Add destination in the floating popup and comparison card now saves first, then enriches/prefetches weather in the background.

## 1.11.40 - Save button and logo fit fix
- Fixed Save destination so saving is not blocked by slow or unavailable geocoding/weather services.
- Added a Chrome popup fallback save path if the content script returns an incomplete response.
- Adjusted the umbrella SVG viewBox and brand-logo sizing so the umbrella lines are not cut on the initial popup or comparison card, and the icon height better matches the Clear Sky Watch text.

## 1.11.38 - Booking.com live city input detection

- Booking.com destination changes are detected while the user edits the city field, before clicking Search/Rechercher.
- The floating Clear Sky Watch popup stays mounted during Booking.com city/search field updates, removing the temporary disappear/reappear effect.
- The detected destination displayed in the popup refreshes from the active Booking.com input instead of waiting for URL/search-result changes.

## 1.11.36 - Per-destination date capture and comparison border refinement
- Fixed date handling so every destination stores the dates detected at the exact “Add destination” click.
- Removed reuse of previous/first destination dates for newly added manual destinations.
- Weather/climate data prefetch starts immediately using each destination’s own stored dates.
- Forecast-compatible date ranges, including next 5 days, can show a saved weather preview; far-future dates are saved and prefetched without a forecast preview.
- Relative weather rating is applied when the user clicks “Compare destinations”.
- Updated comparison sun icon color to #ffd60a.
- Comparison row contours are light grey by default; only the top-ranked destination uses the Comfort score color as its row contour.

## 1.11.35 - Launcher icon fit and popup subtitle
- Tightened and centered the umbrella SVG viewBox so the visible umbrella fits evenly inside the circular launcher.
- Kept the launcher circle at approximately 5% visual margin around the umbrella and border.
- Updated the popup helper text to: “Save destinations, then compare weather”.


## 1.11.34 - Brand header alignment on comparison card
- Added the umbrella logo and Clear Sky Watch brand header to the comparison card.
- Reduced the “Comparing X destinations” title size by 10% and changed it to dark grey.
- Reduced the umbrella logo size by 25% on the initial popup and comparison card.

## 1.11.34 - Heat index column label
- Renamed the summary table `Temperature` column to `Heat index [air temp & humidity]`.
- Split the long column label across two rows in the comparison table header.

## 1.11.32 - Comfort score color scale

- Replaced the flat green Comfort score text with a dynamic green → yellow → orange → red palette.
- Applied the same Comfort score color to the row contour in the comparison table.
- Kept the dangerous heat methodology and weather icon color rules from 1.11.31.

## 1.11.31 - Comparison icon colors and dangerous heat rule
- Updated comparison sun icon color to `#F5EC6D`.
- Updated comparison rain droplet icon color to `#2395ff`.
- Added a hard dangerous-heat rule: destinations above 35°C feels-like / adjusted temperature can never rank above non-dangerous destinations.
- Capped dangerous-heat displayed scores and labelled them as `Danger heat`.

## 1.11.30 - Launcher sizing and popup persistence
- Updated the active umbrella launcher background to #caffca.
- Kept the launcher draggable and saved per host.
- Resized the umbrella so it fits entirely inside the circle with about 5% margin.
- Kept the umbrella and circle contour color as #7c7cff, with a 2px contour.
- Removed the message “Weather preview hidden until comparison.” from save feedback.
- Rendered the floating panel immediately during travel-page search/URL updates to avoid the brief disappearing effect.

## 1.11.29 - Movable launcher icon
- Made the small active umbrella launcher draggable by the user on supported travel pages.
- Updated launcher circle background to #e3ffe3.
- Updated launcher circle contour and umbrella color to #7c7cff.
- Enlarged and centered the umbrella inside the launcher circle and doubled the circle contour thickness.

## 1.11.27 - Dynamic weather rating methodology

- Updated ranking methodology: rain is always primary, humidity-adjusted temperature is second, wind is third.
- Renamed the summary table `Temp comfort` column to `Heat index [air temp & humidity]`.
- Added dynamic relative rating between selected destinations.
- Added temperature scoring anchors: 16°C=44, 24°C=100, 27°C=100, 28°C=92, 29°C=80, 30°C=68, 32°C=44, 35°C=8.
- Penalised temperatures above 30°C and documented best conditions: sunny, wind below 36 km/h, temperature 20-28°C.


## 1.11.26 - Weather icon update
- Replaced rain droplet and sun emoji icons with custom SVG assets.
- Recolored the sun icon to #fff85e.

## 1.11.25 - Per-destination date preservation
- Fixed comparison logic so each saved destination keeps its own selected date range.
- Removed the global date synchronization side effect that could overwrite all saved destinations when Booking.com or another travel page changed dates.
- Manual additions now use the current page/modal date context without copying dates from unrelated saved destinations.


## 1.11.24 - Logo alignment fix

- Cropped the umbrella SVG viewBox so the visible logo starts at the same left edge as the popup card content.
- Reinforced left alignment for the brand/logo block in the Chrome popup and floating travel-page popup.

## 1.11.23 - Documentation partnership contact

- Added Demetra partnership contact email to the README documentation: contact@demetra-tech.com.


## 1.11.22 - Individual destination removal
- Added an individual remove button for each selected destination in the Chrome popup.
- Added removable destination pills in the floating travel-page popup.
- Users can now drop one location from comparison without using Clear ALL.

## 1.11.18
- Restored automatic Booking.com floating popup display while keeping close behavior URL-local.
- Added an in-page umbrella launcher after closing the popup so it can be reopened on supported travel pages.

## 1.11.12

## 1.11.16

- Destination validation now rejects country-only selections and asks for a municipality, district, or county.
- Destination display labels are capped at 30 characters with common abbreviations.
- Comparison labels show country names only when saved destinations are in different countries.


- Added a visible `Temp` column before `Comfort score` in the summary table.
- Updated comfort-temperature logic: comfortable range is now 22-28°C feels-like.
- Increased cold-temperature penalty so cool destinations around 16°C are not ranked as highly for comfort.
- Kept strong heat penalty above 28°C feels-like and `Too hot` label above 31°C.

## 1.11.14

- Limited the floating Clear Sky Watch panel to the supported travel websites listed in the documentation, instead of injecting it on every HTTP/HTTPS tab.
- Kept the extension callable from the browser toolbar with the umbrella icon.
- Reduced background re-rendering so the panel does not reappear repeatedly after being closed.

## 1.11.10

### 1.11.10
- Increased Hotels.com/Expedia popup safety spacing so the Clear Sky Watch card does not overlap the search line or action buttons.
- Added larger site-specific collision margins for compact booking search rows.

- Improved Booking.com and Hotels.com popup placement so the add-destination card avoids the full search line, not only the destination input.
- Saved manual widget positions are now ignored when they would overlap the booking/search controls after a page layout change.
- Added broader search-area collision checks for travel booking websites.

## 1.11.8

- Extended the wind colorbar to the full nine-step green palette.
- Updated Comfort score number color to `#849b88`.


## 1.11.7

- Keeps the summary table date column compact by always displaying only the start and end dates.
- Uses a default forecast window of the next 5 days, starting today, whenever no trip dates are detected.
- Normalizes saved destinations before comparison so older entries without dates are compared over the same default 5-day forecast period.
# Changelog

## 1.11.62 - Consistent sun percentage and icons

- Sun icons and the displayed Sun % now use the same monotonic daytime-sun score.
- The score combines clear daytime-hour share and mostly-clear daytime-trip-day share, so a higher Sun % always shows the same or more sun icons.
- Thresholds are: 0-24% = clouds, 25-49% = 1 sun, 50-74% = 2 suns, 75-100% = 3 suns.


## 1.11.45 - Selected destinations list refresh repair

- Fixed a bug where a newly saved city could show a saved confirmation but not appear in the selected destinations list.
- The selected list now uses a normalized destination + dates + source-site key and keeps the newest copy visible.
- The newest selected destinations appear first in the floating popup and Chrome popup.
- The popup refreshes when storage changes so Compare destinations uses the current selected list.

## 1.11.7 - draggable popup and layout fixes

- Improved floating widget placement on Hotels.com and other travel booking sites so it appears next to the search area rather than over original page content.
- Added manual drag positioning for the floating widget; the extension remembers the last position per website.
- Enlarged the comparison modal and enabled internal scrolling for wider/taller summary tables.
- Fixed the remove cross in the summary table so it removes the destination and refreshes the comparison.


## 1.11.7
- Set Comfort score numbers to #c4dd7f.
- Moved the Dates column to the right of the Wind column.
- Removed the stats fallback explanatory sentence from the comparison modal subtitle.

## 1.11.3

- Improved visibility beyond Booking.com by injecting the guarded content script on normal HTTP/HTTPS pages and showing the widget on detected travel pages even when automatic destination extraction fails.
- Added a manual destination input directly in the floating card when a destination cannot be detected.
- Reworked floating-card placement so it prefers a side position next to the search area instead of overlapping the original page content.
- Added an upper-corner fallback and below-search fallback only when there is no side space.

## 1.11.2

- Updated temperature colorbar to a pastel rainbow palette featuring `#edbbe0`.
- Updated wind colorbar to the requested green palette.
- Updated Save destination button to `#e0edbb` and Compare destinations button to `#edbbe0`.
- Replaced the Clear Sky Watch sun mark with a two-color umbrella mark.
- Moved the floating destination panel near the page search area when detectable, with an upper-corner fallback.


## 1.11.1 - Copy and documentation ownership update

- Removed the final dot from the card subtitle and changed “forecast” to “weather” in the phrase “Save destinations, then compare weather”.
- Made Elena Maksimovich clickable in documentation with her LinkedIn profile.
- Replaced Weather Trade Net licence/IP owner references with clickable Demetra company links where relevant.

## 1.11.0 - Comfort temperature scoring for forecasts and stats

- Renamed the visible rating column from Score to Comfort score.
- Added feels-like temperature / temperature ressentie as the default comfort-temperature input.
- Applied the same comfort-temperature logic to real forecast rows and monthly stats rows.
- Added strong heat penalty above 28°C feels-like and a Too hot label above 31°C feels-like.
- Added apparent-temperature fields from Open-Meteo, WeatherAPI, and OpenWeather where available.
- Kept air temperature as a fallback only when feels-like temperature is unavailable.
- Reduced NASA POWER monthly stats timeout and added a fast typical-stats fallback so stats rows show quickly.

## 1.9.0 demo documentation package

- Added documentation folder.
- Added proprietary licence/IP notice naming [Demetra](https://www.pappers.fr/entreprise/demetra-941049322) as technology and IP owner.
- Added [Elena Maksimovich](https://www.linkedin.com/in/elena-maksimovich/) as licence contact / attribution.
- Added privacy policy draft.
- Added terms of use draft.
- Added demo hosting guide.
- Added technical documentation and weather methodology notes.

## Previous MVP work

- Added multi-site travel support.
- Added saved destination workflow.
- Added comparison modal.
- Added weather ranking: no rain first, then low wind, then temperature comfort.
- Added horizontal temperature and wind colorbars.
- Added multiple geocoding and weather API fallbacks.
- Added monthly typical weather mode for dates outside short-term forecast range.

## 1.10.0 - Fast climatology mode
- Replaced slow browser-side multi-year daily-history aggregation with NASA POWER monthly climatology for future / long-range destinations.
- Added local caching for NASA POWER climatology by rounded coordinate and month.
- Added a 2.5-second timeout so climatology rows fail fast instead of blocking the comparison for minutes.

## 1.11.18
- Added explicit high-contrast toolbar/menu icons at 16, 32, 48 and 128 px.
- Confirmed the Chrome action opens `popup.html`, so the extension remains callable after the page popup is closed.
- Note: Chrome does not allow an extension to pin itself automatically to the main toolbar; users can pin it from the Chrome Extensions puzzle menu.


## 1.11.42 - Save button hard repair
- Repaired the Save destination action with a storage-first workflow: the destination is written immediately before any weather/geocoding work.
- Added a capture-phase handler so Booking.com DOM updates cannot remove the Save click before it is processed.
- Added Chrome popup retry logic that injects the content script when needed and falls back to URL parsing if the page response is unavailable.


### v1.11.48 — Selected destinations list repair
- The “Selected destinations” list now shows only destination names, never dates.
- The same destination is shown only once. Saving the same city again updates its stored travel dates instead of adding a duplicate.
- A destination is inserted into the selected list immediately after “Save destination” is clicked; weather/geocoding enrichment continues in the background.

### v1.11.64 - French weekday date parsing fix
- French weekday words and abbreviations such as mardi and mar. are ignored during date parsing, so mar. is not misread as March.
- Month names such as mars still parse correctly.


### 1.11.64 - Exact per-destination visible-date repair
- Save/Add destination now reads Booking.com visible date controls scoped to the current searchbox before URL parameters.
- Previous destination dates are inherited only when the current search has no visible dates and no URL dates.
- Booking.com stale SPA URL dates are ignored when visible date controls are present.
