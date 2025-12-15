/**
 * Offscreen Document for C2PA Analysis
 * 
 * This runs in a hidden document context that has access to window/DOM,
 * which is required by the c2pa-web WASM library.
 * 
 * It can also fetch file:// URLs since it's an extension page.
 */

import type { C2PAResult, TrustLevel, ValidationStatus } from '../lib/types';
import { createC2pa, type Reader } from '@contentauth/c2pa-web';

// Type for the C2PA SDK instance
type C2paInstance = Awaited<ReturnType<typeof createC2pa>>;

// C2PA instance (lazy loaded)
let c2paInstance: C2paInstance | null = null;
let trustList: Set<string> | null = null;
let initPromise: Promise<boolean> | null = null;
let initError: string | null = null;

/**
 * Fetch a file:// URL and return raw bytes
 * This works in the offscreen document because it's an extension page
 */
async function fetchFileUrl(url: string): Promise<{ success: boolean; data?: number[]; error?: string }> {
  console.log('[GenSnitch Offscreen] Fetching file URL:', url);
  
  try {
    // Try fetch first
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Fetch failed: ${response.status}`);
    }
    const buffer = await response.arrayBuffer();
    console.log('[GenSnitch Offscreen] File fetch succeeded:', buffer.byteLength, 'bytes');
    return {
      success: true,
      data: Array.from(new Uint8Array(buffer)),
    };
  } catch (fetchErr) {
    console.log('[GenSnitch Offscreen] Fetch failed, trying XHR:', fetchErr);
    
    // Try XHR as fallback
    return new Promise((resolve) => {
      const xhr = new XMLHttpRequest();
      xhr.open('GET', url, true);
      xhr.responseType = 'arraybuffer';
      xhr.timeout = 30000;
      
      xhr.onload = () => {
        if (xhr.status === 200 || xhr.status === 0) {
          const buffer = xhr.response as ArrayBuffer;
          console.log('[GenSnitch Offscreen] XHR succeeded:', buffer.byteLength, 'bytes');
          resolve({
            success: true,
            data: Array.from(new Uint8Array(buffer)),
          });
        } else {
          resolve({
            success: false,
            error: `XHR failed: ${xhr.status}`,
          });
        }
      };
      
      xhr.onerror = () => {
        resolve({
          success: false,
          error: 'XHR network error',
        });
      };
      
      xhr.ontimeout = () => {
        resolve({
          success: false,
          error: 'XHR timeout',
        });
      };
      
      xhr.send();
    });
  }
}

/**
 * Load and parse the trust list
 */
async function loadTrustList(): Promise<Set<string>> {
  if (trustList) return trustList;
  
  try {
    const response = await fetch(chrome.runtime.getURL('assets/allowed.sha256.txt'));
    const text = await response.text();
    
    trustList = new Set<string>();
    for (const line of text.split('\n')) {
      const trimmed = line.trim().toLowerCase();
      if (trimmed && !trimmed.startsWith('#')) {
        if (/^[a-f0-9]{64}$/.test(trimmed)) {
          trustList.add(trimmed);
        }
      }
    }
    
    console.log(`[GenSnitch Offscreen] Loaded ${trustList.size} trusted certificate hashes`);
    return trustList;
  } catch (err) {
    console.warn('[GenSnitch Offscreen] Failed to load trust list:', err);
    trustList = new Set();
    return trustList;
  }
}

/**
 * Initialize C2PA
 */
async function initC2PA(): Promise<boolean> {
  if (c2paInstance) return true;
  if (initError) return false;
  
  if (initPromise) {
    return initPromise;
  }
  
  initPromise = (async () => {
    try {
      console.log('[GenSnitch Offscreen] Starting C2PA initialization...');
      
      const wasmUrl = chrome.runtime.getURL('wasm/c2pa_bg.wasm');
      console.log('[GenSnitch Offscreen] WASM URL:', wasmUrl);
      
      // Verify WASM is accessible
      const wasmResponse = await fetch(wasmUrl);
      if (!wasmResponse.ok) {
        throw new Error(`WASM file not accessible: ${wasmResponse.status}`);
      }
      console.log('[GenSnitch Offscreen] WASM file accessible');
      
      c2paInstance = await createC2pa({
        wasmSrc: wasmUrl,
      });
      
      console.log('[GenSnitch Offscreen] C2PA initialized successfully');
      console.log('[GenSnitch Offscreen] C2PA instance methods:', Object.keys(c2paInstance));
      
      // Load trust list after C2PA is ready
      await loadTrustList();
      
      return true;
    } catch (err) {
      console.error('[GenSnitch Offscreen] C2PA init error:', err);
      initError = `C2PA initialization failed: ${err instanceof Error ? err.message : String(err)}`;
      return false;
    }
  })();
  
  return initPromise;
}

/**
 * Analyze image bytes for C2PA
 */
async function analyzeC2PA(imageBytes: number[], mimeType?: string): Promise<C2PAResult> {
  try {
    const initialized = await initC2PA();
    
    if (!initialized || !c2paInstance) {
      return {
        available: false,
        present: false,
        validated: 'unknown',
        trust: 'unknown',
        errors: [initError || 'C2PA initialization failed'],
      };
    }
    
    const bytes = new Uint8Array(imageBytes);
    const format = mimeType || 'application/octet-stream';
    const blob = new Blob([bytes], { type: format });
    
    console.log('[GenSnitch Offscreen] Reading C2PA from blob:', format, blob.size, 'bytes');
    
    // Use the correct API: c2pa.reader.fromBlob(format, blob)
    let reader: Reader | null = null;
    try {
      reader = await c2paInstance.reader.fromBlob(format, blob);
    } catch (readErr) {
      const errMsg = readErr instanceof Error ? readErr.message : String(readErr);
      const errLower = errMsg.toLowerCase();
      
      console.log('[GenSnitch Offscreen] C2PA read error:', errMsg);
      
      // These errors mean "no C2PA data" rather than a failure
      if (errLower.includes('no manifest') || 
          errLower.includes('not found') || 
          errLower.includes('jumbf') ||
          errLower.includes('no c2pa') ||
          errLower.includes('unsupported') ||
          errLower.includes('no embedded')) {
        return {
          available: true,
          present: false,
          validated: 'unknown',
          trust: 'unknown',
          errors: [],
        };
      }
      throw readErr;
    }
    
    // If reader is null, no C2PA data found
    if (!reader) {
      console.log('[GenSnitch Offscreen] No C2PA manifest found (reader is null)');
      return {
        available: true,
        present: false,
        validated: 'unknown',
        trust: 'unknown',
        errors: [],
      };
    }
    
    console.log('[GenSnitch Offscreen] C2PA manifest found, extracting data...');
    
    // Get the manifest store
    const manifestStore = await reader.manifestStore();
    console.log('[GenSnitch Offscreen] Manifest store:', JSON.stringify(manifestStore, null, 2).substring(0, 500));
    
    // Get active manifest
    const activeManifest = await reader.activeManifest();
    console.log('[GenSnitch Offscreen] Active manifest claim_generator:', activeManifest?.claim_generator);
    
    // Determine validation status and trust level
    // Note: c2pa-web's validation_state combines crypto AND trust:
    // - "Trusted" = signature valid + issuer trusted
    // - "Valid" = signature valid + issuer not in trust list  
    // - "Invalid" = signature invalid OR issuer untrusted (we need to check details)
    let validated: ValidationStatus = 'unknown';
    let trust: TrustLevel = 'unknown';
    const validationState = manifestStore.validation_state;
    
    // Check validation_results for detailed status
    const validationResults = (manifestStore as Record<string, unknown>).validation_results as {
      activeManifest?: {
        success?: Array<{ code?: string }>;
        failure?: Array<{ code?: string }>;
      };
    } | undefined;
    
    // Check if signature itself is valid (look for claimSignature.validated in success)
    const signatureValid = validationResults?.activeManifest?.success?.some(
      s => s.code === 'claimSignature.validated' || s.code === 'claimSignature.insideValidity'
    ) ?? false;
    
    // Check if the failure is just about trust, not crypto
    const onlyTrustFailure = validationResults?.activeManifest?.failure?.every(
      s => s.code?.includes('untrusted') || s.code?.includes('trust')
    ) ?? false;
    
    if (validationState === 'Trusted') {
      validated = 'valid';
      trust = 'trusted';
    } else if (validationState === 'Valid') {
      validated = 'valid';
      trust = 'untrusted'; // Valid crypto but not trusted
    } else if (validationState === 'Invalid') {
      // Check if signature is actually valid but just untrusted
      if (signatureValid && onlyTrustFailure) {
        validated = 'valid';
        trust = 'untrusted';
      } else if (signatureValid) {
        // Signature valid but there are other failures
        validated = 'valid';
        trust = 'unknown';
      } else {
        validated = 'invalid';
        trust = 'unknown';
      }
    } else if (manifestStore.validation_status) {
      // Fallback to checking validation_status array
      const hasSignatureFailure = manifestStore.validation_status.some(s => 
        s.code?.toLowerCase().includes('signature') && 
        (s.code?.toLowerCase().includes('error') || s.code?.toLowerCase().includes('invalid'))
      );
      validated = hasSignatureFailure ? 'invalid' : 'valid';
      
      const hasUntrusted = manifestStore.validation_status.some(s =>
        s.code?.toLowerCase().includes('untrusted')
      );
      trust = hasUntrusted ? 'untrusted' : 'unknown';
    }
    
    console.log('[GenSnitch Offscreen] Validation analysis:', { validationState, signatureValid, onlyTrustFailure, validated, trust });
    
    // Build summary
    const summary: C2PAResult['summary'] = {};
    
    if (activeManifest) {
      // Claim generator
      if (activeManifest.claim_generator) {
        summary.claimGenerator = activeManifest.claim_generator;
      } else if (activeManifest.claim_generator_info && activeManifest.claim_generator_info.length > 0) {
        const info = activeManifest.claim_generator_info[0];
        summary.claimGenerator = info.version ? `${info.name}/${info.version}` : info.name;
      }
      
      // Signature info
      if (activeManifest.signature_info) {
        summary.issuer = activeManifest.signature_info.issuer || undefined;
        if (activeManifest.signature_info.common_name || activeManifest.signature_info.issuer) {
          summary.certificate = {
            subject: activeManifest.signature_info.common_name || undefined,
            issuer: activeManifest.signature_info.issuer || undefined,
          };
        }
      }
      
      // Actions from assertions
      const actions: string[] = [];
      const aiAssertions: string[] = [];
      
      if (activeManifest.assertions) {
        for (const assertion of activeManifest.assertions) {
          const label = assertion.label?.toLowerCase() || '';
          
          // Check for AI-related assertions
          if (label.includes('ai') || 
              label.includes('generated') || 
              label.includes('synthetic') ||
              label.includes('c2pa.training-mining')) {
            aiAssertions.push(assertion.label);
          }
          
          // Extract actions
          if (label.includes('action') && assertion.data) {
            const data = assertion.data as { actions?: Array<{ action?: string; digitalSourceType?: string; softwareAgent?: { name?: string } }> };
            if (data.actions && Array.isArray(data.actions)) {
              for (const act of data.actions) {
                if (act.action) {
                  actions.push(act.action);
                }
                // Check for AI digital source type
                if (act.digitalSourceType?.includes('trainedAlgorithmicMedia') ||
                    act.digitalSourceType?.includes('algorithmicMedia')) {
                  aiAssertions.push(`digitalSourceType: ${act.digitalSourceType}`);
                }
                // Check for AI software agent
                if (act.softwareAgent?.name) {
                  const agentName = act.softwareAgent.name.toLowerCase();
                  if (agentName.includes('gpt') || agentName.includes('dall') || 
                      agentName.includes('midjourney') || agentName.includes('stable')) {
                    aiAssertions.push(`softwareAgent: ${act.softwareAgent.name}`);
                  }
                }
              }
            }
          }
        }
      }
      
      if (actions.length > 0) {
        summary.actions = [...new Set(actions)]; // Dedupe
      }
      if (aiAssertions.length > 0) {
        summary.aiAssertions = [...new Set(aiAssertions)];
      }
      
      // Ingredients
      if (activeManifest.ingredients && activeManifest.ingredients.length > 0) {
        summary.ingredients = activeManifest.ingredients
          .slice(0, 5)
          .map(i => i.title || 'Unknown ingredient');
      }
    }
    
    // Build raw output for details panel
    const raw: Record<string, unknown> = {
      validation_state: manifestStore.validation_state,
      active_manifest: manifestStore.active_manifest,
    };
    
    if (activeManifest) {
      raw.claim_generator = activeManifest.claim_generator;
      raw.title = activeManifest.title;
      raw.format = activeManifest.format;
      if (activeManifest.signature_info) {
        raw.signature_info = activeManifest.signature_info;
      }
    }
    
    // Free the reader to release WASM memory
    try {
      await reader.free();
    } catch {
      // Ignore free errors
    }
    
    console.log('[GenSnitch Offscreen] C2PA analysis complete:', { validated, trust, summary });
    
    return {
      available: true,
      present: true,
      validated,
      trust,
      summary,
      raw,
      errors: [],
    };
  } catch (err) {
    console.error('[GenSnitch Offscreen] C2PA analysis error:', err);
    return {
      available: true,
      present: false,
      validated: 'unknown',
      trust: 'unknown',
      errors: [`C2PA error: ${err instanceof Error ? err.message : String(err)}`],
    };
  }
}

// Listen for messages from the service worker
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'ANALYZE_C2PA') {
    const { imageBytes, mimeType } = message;
    
    analyzeC2PA(imageBytes, mimeType)
      .then(result => sendResponse({ success: true, result }))
      .catch(err => sendResponse({ 
        success: false, 
        error: err instanceof Error ? err.message : String(err) 
      }));
    
    return true; // Keep channel open for async response
  }
  
  if (message.type === 'FETCH_FILE') {
    const { url } = message;
    
    fetchFileUrl(url)
      .then(result => sendResponse(result))
      .catch(err => sendResponse({ 
        success: false, 
        error: err instanceof Error ? err.message : String(err) 
      }));
    
    return true; // Keep channel open for async response
  }
  
  if (message.type === 'PING') {
    sendResponse({ success: true, message: 'pong' });
    return true;
  }
  
  return false;
});

console.log('[GenSnitch Offscreen] Document ready');
