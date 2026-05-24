# Demo hosting and distribution guide

## Recommended demo options

### Option 1: Manual demo zip

Best for quick demos, investor discussions, and internal testing.

1. Host the zip file on a private link, company website, Google Drive, Notion, or GitHub release.
2. Ask testers to unzip it.
3. Ask testers to load it through chrome://extensions using Developer mode and Load unpacked.

This is the fastest approach but it is not a normal one-click installation flow.

### Option 2: Chrome Web Store unlisted publication

Best for professional demos with selected users.

1. Create a Chrome Web Store Developer account.
2. Prepare store assets: icon, screenshots, description, privacy policy URL, and support contact.
3. Upload the extension zip with manifest.json at the zip root.
4. Choose Unlisted visibility if you want only people with the link to install it.
5. Submit for review.
6. Share the Chrome Web Store link with demo users.

This is the cleanest option for external demos.

### Option 3: Private Chrome Web Store distribution

Best for company-internal testing or controlled user groups.

Use Chrome Web Store private publishing or managed enterprise deployment where appropriate.

## What cannot be hosted as a normal website

A Chrome extension is not installed like a normal web page. You can host the zip file online, but users generally cannot install a modern Chrome extension directly from an arbitrary website on Windows or macOS. For normal external installation, use the Chrome Web Store.

## API key warning

Do not publish private API keys directly in a public extension package. For a public product, use a backend proxy or a controlled key-management strategy. For private MVP testing, temporary keys can be entered by testers in the extension settings, but this is not a production security model.

## Pre-publication checklist

- Confirm all third-party API terms allow your intended use.
- Add a hosted privacy policy page.
- Add support contact email.
- Prepare screenshots and extension description.
- Test on the main target travel sites.
- Remove debug logs if any.
- Review permissions and host permissions.
- Confirm the extension has a single clear purpose.
- Confirm the package contains no remotely hosted executable code.
