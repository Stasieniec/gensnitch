# GenSnitch

🕵️ **Chrome/Chromium extension to detect AI-generated images using local analysis**

GenSnitch helps you identify potentially AI-generated images by analyzing their metadata. It runs entirely locally in your browser - no images are ever uploaded anywhere.

## Features

- **Right-click context menu** - Check any image on any webpage
- **C2PA/Content Credentials verification** - Full manifest reading with cryptographic validation
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

GenSnitch now includes **full C2PA manifest verification** using the official CAI SDK:

- **Manifest Detection** - Checks if the image contains C2PA content credentials
- **Cryptographic Validation** - Verifies the digital signature is valid
- **Trust Verification** - Checks if the signer is in the local trust list
- **AI Assertions** - Detects specific AI-generation assertions in the manifest

#### C2PA Status Indicators

| Status | Meaning |
|--------|---------|
| ✓ Signature Valid | Cryptographic signature verified successfully |
| ✗ Signature Invalid | Signature verification failed (possibly tampered) |
| ✓ Trusted Issuer | Signer is in the local trust list |
| ⚠ Unknown Issuer | Signer not in trust list (doesn't mean invalid!) |

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

## Testing with C2PA Images

### Finding Test Images

1. **Content Authenticity Initiative samples**: https://contentauthenticity.org/
2. **Adobe Stock** - Many images now include Content Credentials
3. **Truepic** - Provides C2PA-signed images
4. Create your own using Adobe Photoshop/Lightroom (with Content Credentials enabled)

### What to Expect

When analyzing a C2PA-signed image:

```
Content Credentials Found
✓ Signature Valid     ⚠ Unknown Issuer

Claim Generator: Adobe Photoshop 25.0
Signed By: Adobe Inc.
Actions: c2pa.created, c2pa.edited
```

### Understanding "Unknown Issuer"

- **"Unknown Issuer" does NOT mean the signature is invalid**
- It simply means the signer's certificate isn't in GenSnitch's local trust list
- The signature can still be cryptographically valid
- To add a trusted issuer, add their certificate SHA-256 hash to `src/assets/trust/allowed.sha256.txt`

### Adding Trusted Issuers

Edit `src/assets/trust/allowed.sha256.txt`:

```
# Add certificate SHA-256 fingerprints (lowercase, no colons)
abc123def456...  # Adobe
xyz789abc012...  # Your organization
```

## Limitations

⚠️ **Important**: GenSnitch is NOT a guarantee of authenticity!

- Metadata can be easily stripped or modified
- Many AI images have no identifying metadata
- Some legitimate photos may trigger false positives
- This is a heuristic tool, not a forensic detector
- "Unknown issuer" doesn't mean untrustworthy

## Privacy

GenSnitch is designed with privacy as a core principle:

- **All processing happens locally** in your browser
- **No images are ever uploaded** to any server
- **No analytics or tracking** of any kind
- **No external API calls** (placeholder for future ML feature exists but is disabled)
- **WASM runs locally** - C2PA validation uses bundled WebAssembly

See [PRIVACY.md](PRIVACY.md) for full details.

## Permissions Explained

| Permission | Why Needed |
|------------|------------|
| `contextMenus` | Create the right-click menu option |
| `storage` | Save analysis reports temporarily |
| `scripting` | Fetch blob: URLs from page context |
| `activeTab` | Access the current tab when analyzing |
| `https://*/*` (optional) | Fetch images from websites (requested on first use) |

### Content Security Policy

The extension uses `wasm-unsafe-eval` to run the C2PA WebAssembly module locally. This is required for C2PA validation and does NOT allow loading external code.

## Testing Checklist

- [ ] Right-click image on Google Images
- [ ] Right-click image on Wikipedia  
- [ ] Right-click image on Twitter/X
- [ ] Test with `data:` URL images (inline images)
- [ ] Test with `blob:` URL images (canvas-based sites)
- [ ] Test with large images (>10MB) - should show size error
- [ ] Test with a known AI-generated PNG (should show parameters)
- [ ] Test with a C2PA-signed image (should show credentials)
- [ ] Test C2PA signature validation (valid vs. tampered)

## Development

```bash
# Install dependencies
npm install

# Build once
npm run build

# Build and watch for changes
npm run dev
```

### Project Structure

```
gensnitch/
├── src/
│   ├── background.ts          # Service worker
│   ├── lib/
│   │   ├── types.ts           # TypeScript interfaces
│   │   ├── imageBytes.ts      # Image fetching
│   │   ├── report.ts          # Report generation
│   │   └── analyzers/
│   │       ├── c2pa.ts        # C2PA verification (with WASM)
│   │       ├── metadata.ts    # EXIF/XMP analysis
│   │       └── pngText.ts     # PNG chunk parsing
│   ├── assets/
│   │   └── trust/
│   │       └── allowed.sha256.txt  # Local trust list
│   └── ui/
│       ├── result.html
│       ├── result.css
│       └── result.ts
├── manifest.json
└── vite.config.ts
```

## Tech Stack

- **Manifest V3** - Modern Chrome extension format
- **TypeScript** - Type-safe development
- **Vite** - Fast build tooling
- **c2pa** - Official CAI C2PA verification library
- **exifr** - EXIF/XMP metadata parsing

## Roadmap

- [x] v0.1 - Basic metadata detection
- [x] v0.2 - Full C2PA validation with WASM
- [ ] v1.0 - ML-based detection fallback (opt-in)
- [ ] v1.1 - Batch checking for pages
- [ ] v1.2 - Custom trust list management UI

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

MIT - See [LICENSE](LICENSE)

---

Made with 🔍 by the GenSnitch community
