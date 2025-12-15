# GenSnitch

🕵️ **Chrome/Chromium extension to detect AI-generated images using local analysis**

GenSnitch helps you identify potentially AI-generated images by analyzing their metadata. It runs entirely locally in your browser - no images are ever uploaded anywhere.

## Features

- **Right-click context menu** - Check any image on any webpage
- **C2PA/Content Credentials detection** - Detects presence of C2PA signatures
- **EXIF/XMP metadata analysis** - Finds AI tool signatures (Stable Diffusion, DALL-E, Midjourney, etc.)
- **PNG text chunk scanning** - Extracts generation parameters from SD images
- **100% local processing** - Your images never leave your browser
- **Privacy-first** - No analytics, no tracking, no data collection

## Installation

### From Source (Developer Mode)

1. Clone or download this repository
2. Install dependencies and build:

```bash
npm install
npm run build
```

3. Open Chrome/Chromium and navigate to `chrome://extensions`
4. Enable **Developer mode** (toggle in top right)
5. Click **Load unpacked**
6. Select the `dist` folder from this project

### Building a ZIP for Distribution

```bash
npm run zip
```

This creates `gensnitch.zip` containing the extension files ready for Chrome Web Store submission.

## Usage

1. **Right-click** on any image on a webpage
2. Select **"GenSnitch: Check if AI-generated"**
3. If prompted, allow the permission to access the site
4. A results window will show the analysis

## What GenSnitch Checks

### C2PA / Content Credentials
Checks for the presence of [C2PA](https://c2pa.org/) signatures in images. Full validation requires WASM support (coming in future versions), but basic signature detection works now.

### EXIF/XMP Metadata
Analyzes standard image metadata for known AI tool indicators:
- Software field (e.g., "Stable Diffusion", "ComfyUI")
- Creator Tool (e.g., "Adobe Firefly")
- Custom fields from AI generators

### PNG Text Chunks
For PNG images, scans embedded text chunks for:
- Generation parameters (`parameters` key)
- SD metadata (`sd-metadata` key)
- Workflow information
- Prompt text

## Limitations

⚠️ **Important**: GenSnitch is NOT a guarantee of authenticity!

- Metadata can be easily stripped or modified
- Many AI images have no identifying metadata
- Some legitimate photos may trigger false positives
- This is a heuristic tool, not a forensic detector

## Privacy

GenSnitch is designed with privacy as a core principle:

- **All processing happens locally** in your browser
- **No images are ever uploaded** to any server
- **No analytics or tracking** of any kind
- **No external API calls** (placeholder for future ML feature exists but is disabled)

See [PRIVACY.md](PRIVACY.md) for full details.

## Permissions Explained

| Permission | Why Needed |
|------------|------------|
| `contextMenus` | Create the right-click menu option |
| `storage` | Save analysis reports temporarily |
| `scripting` | Fetch blob: URLs from page context |
| `activeTab` | Access the current tab when analyzing |
| `https://*/*` (optional) | Fetch images from websites (requested on first use) |

## Testing Checklist

- [ ] Right-click image on Google Images
- [ ] Right-click image on Wikipedia  
- [ ] Right-click image on Twitter/X
- [ ] Test with `data:` URL images (inline images)
- [ ] Test with `blob:` URL images (canvas-based sites)
- [ ] Test with large images (>10MB) - should show size error
- [ ] Test with a known AI-generated PNG (should show parameters)

## Development

```bash
# Install dependencies
npm install

# Build once
npm run build

# Build and watch for changes
npm run dev
```

## Tech Stack

- **Manifest V3** - Modern Chrome extension format
- **TypeScript** - Type-safe development
- **Vite** - Fast build tooling
- **exifr** - EXIF/XMP metadata parsing

## Roadmap

- [ ] v0.1 - Basic metadata detection (current)
- [ ] v0.2 - Full C2PA validation with WASM
- [ ] v1.0 - ML-based detection fallback (opt-in)
- [ ] v1.1 - Batch checking for pages

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

MIT - See [LICENSE](LICENSE)

---

Made with 🔍 by the GenSnitch community

