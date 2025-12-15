/**
 * GenSnitch Background Service Worker
 * Handles context menu and image analysis coordination
 */

import { getImageBytes } from './lib/imageBytes';
import { analyzeC2PA } from './lib/analyzers/c2pa';
import { analyzeMetadata } from './lib/analyzers/metadata';
import { analyzePngText } from './lib/analyzers/pngText';
import { runAnalysis, createErrorReport } from './lib/report';
import type { Report, C2PAResult } from './lib/types';

const MENU_ID = 'gensnitch-check';
const RESULT_WIDTH = 420;
const RESULT_HEIGHT = 640;

/**
 * Create context menu on installation
 */
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: MENU_ID,
    title: 'GenSnitch: Check if AI-generated',
    contexts: ['image'],
  });
  console.log('[GenSnitch] Context menu created');
});

/**
 * Generate storage key for report
 */
function getStorageKey(tabId: number): string {
  return `lastReport:${tabId}:${Date.now()}`;
}

/**
 * Save report to session storage
 */
async function saveReport(key: string, report: Report): Promise<void> {
  await chrome.storage.session.set({ [key]: report });
}

/**
 * Open results window
 */
async function openResultsWindow(key: string): Promise<void> {
  const url = chrome.runtime.getURL(`ui/result.html?key=${encodeURIComponent(key)}`);
  
  await chrome.windows.create({
    url,
    type: 'popup',
    width: RESULT_WIDTH,
    height: RESULT_HEIGHT,
  });
}

/**
 * Detect MIME type from image bytes
 */
function detectMimeType(bytes: Uint8Array): string {
  // PNG signature: 89 50 4E 47 0D 0A 1A 0A
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) {
    return 'image/png';
  }
  // JPEG signature: FF D8 FF
  if (bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) {
    return 'image/jpeg';
  }
  // WebP signature: 52 49 46 46 ... 57 45 42 50 (RIFF...WEBP)
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
      bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) {
    return 'image/webp';
  }
  // GIF signature: 47 49 46 38
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) {
    return 'image/gif';
  }
  // AVIF/HEIC: Look for 'ftyp' box
  if (bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) {
    const brand = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]);
    if (brand === 'avif') return 'image/avif';
    if (brand === 'heic' || brand === 'heix') return 'image/heic';
  }
  
  return 'application/octet-stream';
}

/**
 * Wrapper to call C2PA analyzer with the new input format
 */
async function analyzeC2PAWrapper(data: ArrayBuffer): Promise<C2PAResult> {
  const bytes = new Uint8Array(data);
  const mimeType = detectMimeType(bytes);
  
  return analyzeC2PA({
    bytes,
    mimeType,
  });
}

/**
 * Handle context menu click
 */
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== MENU_ID) return;
  if (!info.srcUrl) {
    console.error('[GenSnitch] No image URL found');
    return;
  }

  const tabId = tab?.id;
  if (!tabId) {
    console.error('[GenSnitch] No tab ID found');
    return;
  }

  const srcUrl = info.srcUrl;
  const storageKey = getStorageKey(tabId);

  console.log('[GenSnitch] Analyzing image:', srcUrl.substring(0, 100));

  try {
    // Get image bytes
    const imageData = await getImageBytes(tabId, srcUrl);
    console.log('[GenSnitch] Got image data:', imageData.byteLength, 'bytes');

    // Run analysis
    const report = await runAnalysis(imageData, srcUrl, {
      analyzeC2PA: analyzeC2PAWrapper,
      analyzeMetadata,
      analyzePngText,
    });

    console.log('[GenSnitch] Analysis complete:', report.verdict);

    // Save report
    await saveReport(storageKey, report);

    // Open results window
    await openResultsWindow(storageKey);
  } catch (err) {
    console.error('[GenSnitch] Analysis error:', err);

    // Create error report
    const errorReport = createErrorReport(
      srcUrl,
      err instanceof Error ? err.message : 'Unknown error occurred'
    );

    // Save and show error report
    await saveReport(storageKey, errorReport);
    await openResultsWindow(storageKey);
  }
});

// Log that the service worker started
console.log('[GenSnitch] Service worker started');
