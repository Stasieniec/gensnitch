# GenSnitch Privacy Policy

**Last updated:** December 2024

## Our Privacy Commitment

GenSnitch is designed with privacy as a core principle. We believe you should be able to analyze images without sharing them with anyone.

## Data Collection

**GenSnitch does NOT collect any data.**

- ❌ No images are uploaded anywhere
- ❌ No analytics or telemetry
- ❌ No usage tracking
- ❌ No personal information collection
- ❌ No cookies or browser fingerprinting
- ❌ No third-party services

## How GenSnitch Works

All analysis happens **100% locally** in your browser:

1. When you right-click an image, the extension fetches the image data
2. The image bytes are analyzed locally using JavaScript
3. Results are stored temporarily in browser session storage
4. Results are displayed in a local popup window
5. Nothing is ever sent to any server

## Permissions Explained

GenSnitch requests certain browser permissions to function. Here's why each is needed:

### Required Permissions

| Permission | Purpose |
|------------|---------|
| `contextMenus` | Creates the "Check if AI-generated" option in the right-click menu |
| `storage` | Temporarily stores analysis reports so the results window can display them |
| `scripting` | Required to fetch `blob:` URLs that exist within the page context |
| `activeTab` | Allows the extension to interact with the current tab when you trigger an analysis |

### Optional Permissions (Requested at Runtime)

| Permission | Purpose |
|------------|---------|
| `https://*/*` | Allows fetching image data from websites. Only requested when you actually use the extension on a site. |
| `http://*/*` | Same as above, for non-HTTPS sites |

**You can deny these optional permissions** - but the extension won't be able to analyze images from websites. It will still work for `data:` URLs and local images.

## Data Storage

GenSnitch uses Chrome's `session` storage to temporarily hold analysis reports. This data:

- Is stored only in your browser
- Is automatically cleared when you close your browser
- Is never transmitted anywhere
- Contains only the analysis results (not the full image)

## Third-Party Code

GenSnitch uses the following open-source libraries, all bundled locally:

- **exifr** - For parsing EXIF/XMP metadata (MIT License)
- No network requests are made by any dependencies

## Future Features

We plan to add an optional ML-based detection feature in the future. When implemented:

- It will be **opt-in only**
- Users will be clearly informed before any data leaves their device
- A separate, explicit consent will be required

## Open Source

GenSnitch is fully open source. You can audit our code at any time:

- [GitHub Repository](https://github.com/gensnitch/gensnitch)

## Contact

If you have privacy concerns or questions:

- Open an issue on [GitHub](https://github.com/gensnitch/gensnitch/issues)

## Changes to This Policy

If we make changes to this privacy policy, we will:

1. Update the "Last updated" date
2. Note significant changes in our release notes
3. Never retroactively collect data

---

**TL;DR**: GenSnitch runs locally. We don't collect anything. Your images stay on your device.

