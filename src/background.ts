/**
 * GenSnitch Background Service Worker
 * Handles context menu and image analysis coordination
 */

import { getImageBytes } from './lib/imageBytes';
import { analyzeC2PA } from './lib/analyzers/c2pa';
import { analyzeMetadata } from './lib/analyzers/metadata';
import { analyzePngText } from './lib/analyzers/pngText';
import { runAnalysis, createErrorReport } from './lib/report';
import type { Report } from './lib/types';

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
      analyzeC2PA,
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

