/**
 * C2PA / Content Credentials Analyzer
 * 
 * Uses an offscreen document to run C2PA WASM analysis,
 * since service workers don't have access to window/DOM APIs.
 */

import type { C2PAResult, C2PAInput } from '../types';

const OFFSCREEN_DOCUMENT_PATH = 'offscreen/offscreen.html';

// Track if offscreen document is being created
let creatingOffscreenDocument: Promise<void> | null = null;

/**
 * Check if offscreen document exists
 */
async function hasOffscreenDocument(): Promise<boolean> {
  // @ts-expect-error - getContexts is available in Chrome 116+
  if (chrome.runtime.getContexts) {
    // @ts-expect-error - getContexts API
    const contexts = await chrome.runtime.getContexts({
      contextTypes: ['OFFSCREEN_DOCUMENT'],
      documentUrls: [chrome.runtime.getURL(OFFSCREEN_DOCUMENT_PATH)],
    });
    return contexts.length > 0;
  }
  
  // Fallback for older Chrome versions
  try {
    // Try to send a ping message
    const response = await chrome.runtime.sendMessage({ type: 'PING' });
    return response?.success === true;
  } catch {
    return false;
  }
}

/**
 * Ensure offscreen document is created
 */
async function ensureOffscreenDocument(): Promise<void> {
  const exists = await hasOffscreenDocument();
  if (exists) {
    return;
  }

  if (creatingOffscreenDocument) {
    await creatingOffscreenDocument;
    return;
  }

  creatingOffscreenDocument = chrome.offscreen.createDocument({
    url: OFFSCREEN_DOCUMENT_PATH,
    reasons: [chrome.offscreen.Reason.WORKERS],
    justification: 'C2PA WASM analysis requires DOM/window APIs',
  });

  try {
    await creatingOffscreenDocument;
    console.log('[GenSnitch] Offscreen document created');
    
    // Give it a moment to initialize
    await new Promise(resolve => setTimeout(resolve, 100));
  } catch (err) {
    console.error('[GenSnitch] Failed to create offscreen document:', err);
    throw err;
  } finally {
    creatingOffscreenDocument = null;
  }
}

/**
 * Send analysis request to offscreen document
 */
async function analyzeViaOffscreen(imageBytes: number[], mimeType?: string): Promise<C2PAResult> {
  await ensureOffscreenDocument();
  
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'ANALYZE_C2PA',
      imageBytes,
      mimeType,
    });
    
    if (response?.success) {
      return response.result as C2PAResult;
    } else {
      return {
        available: false,
        present: false,
        validated: 'unknown',
        trust: 'unknown',
        errors: [response?.error || 'Offscreen analysis failed'],
      };
    }
  } catch (err) {
    console.error('[GenSnitch] Offscreen communication error:', err);
    return {
      available: false,
      present: false,
      validated: 'unknown',
      trust: 'unknown',
      errors: [`Offscreen error: ${err instanceof Error ? err.message : String(err)}`],
    };
  }
}

/**
 * Analyze image for C2PA content credentials
 */
export async function analyzeC2PA(input: C2PAInput): Promise<C2PAResult> {
  const { bytes, mimeType } = input;
  
  try {
    // Convert Uint8Array to regular array for message passing
    const imageBytes = Array.from(bytes);
    
    return await analyzeViaOffscreen(imageBytes, mimeType);
  } catch (err) {
    console.error('[GenSnitch] C2PA analysis error:', err);
    return {
      available: false,
      present: false,
      validated: 'unknown',
      trust: 'unknown',
      errors: [`C2PA error: ${err instanceof Error ? err.message : String(err)}`],
    };
  }
}

/**
 * Legacy function signature for backward compatibility
 */
export async function analyzeC2PALegacy(data: ArrayBuffer): Promise<C2PAResult> {
  return analyzeC2PA({
    bytes: new Uint8Array(data),
  });
}

/**
 * Stub for future Cloudflare Worker integration
 */
export async function analyzeC2PARemote(
  _imageUrl: string
): Promise<C2PAResult> {
  return {
    available: false,
    present: false,
    validated: 'unknown',
    trust: 'unknown',
    errors: ['Remote C2PA analysis not implemented yet'],
  };
}

