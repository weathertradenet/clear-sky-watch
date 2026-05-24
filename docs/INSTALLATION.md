# Installation guide

## Local demo installation

1. Download and unzip the extension package.
2. Open Chrome.
3. Go to chrome://extensions.
4. Enable Developer mode.
5. Click Load unpacked.
6. Select the unzipped folder that directly contains manifest.json.
7. Open a supported travel website.
8. Search for a destination.
9. Use the Clear Sky Watch card to save and compare destinations.

## Important folder rule

The folder selected in Chrome must contain manifest.json directly at its root. Do not select a parent folder that contains another extension folder inside it.

Correct:

clear-sky-watch/
  manifest.json
  content.js
  popup.html

Incorrect:

Downloads/
  clear-sky-watch/
    manifest.json

If Chrome shows an error, open chrome://extensions and check the extension card for details.
