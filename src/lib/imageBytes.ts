/**
 * Image Bytes Retrieval Module
 * Handles fetching image data from various URL schemes
 * 
 * IMPORTANT: We must get the RAW file bytes, not re-encoded data.
 * Canvas-based methods strip all metadata including C2PA!
 */

const MAX_IMAGE_SIZE = 25 * 1024 * 1024; // 25MB
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
  return false;
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
    justification: 'C2PA WASM analysis and file:// URL fetching',
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
 * Decode a base64 data URL to ArrayBuffer
 */
function decodeDataUrl(dataUrl: string): ArrayBuffer {
  // Format: data:[<mediatype>][;base64],<data>
  const commaIndex = dataUrl.indexOf(',');
  if (commaIndex === -1) {
    throw new Error('Invalid data URL format');
  }
  
  const base64Data = dataUrl.slice(commaIndex + 1);
  const binaryString = atob(base64Data);
  const bytes = new Uint8Array(binaryString.length);
  
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  
  return bytes.buffer;
}

/**
 * Fetch file:// URL via offscreen document
 * The offscreen document is an extension page and can fetch file:// URLs
 */
async function fetchFileViaOffscreen(url: string): Promise<ArrayBuffer> {
  console.log('[GenSnitch] Fetching file via offscreen document:', url.substring(0, 80));
  
  await ensureOffscreenDocument();
  
  const response = await chrome.runtime.sendMessage({
    type: 'FETCH_FILE',
    url,
  });
  
  if (!response || !response.success) {
    throw new Error(response?.error || 'Offscreen file fetch failed');
  }
  
  if (!response.data) {
    throw new Error('No data received from offscreen fetch');
  }
  
  console.log('[GenSnitch] Offscreen file fetch succeeded:', response.data.length, 'bytes');
  return new Uint8Array(response.data).buffer;
}

/**
 * Content script function for ISOLATED world - has extension permissions
 * This can access file:// URLs when extension has file access permission
 */
const fetchFileInIsolatedWorld = async (fileUrl: string, maxSize: number): Promise<{ success: boolean; data?: number[]; error?: string }> => {
  console.log('[GenSnitch Isolated] Attempting to fetch:', fileUrl);
  
  // Try XHR first - content scripts in isolated world may have file:// access
  const tryXHR = (): Promise<ArrayBuffer | null> => {
    return new Promise((resolve) => {
      try {
        const xhr = new XMLHttpRequest();
        xhr.open('GET', fileUrl, true);
        xhr.responseType = 'arraybuffer';
        xhr.timeout = 30000;
        
        xhr.onload = () => {
          if (xhr.status === 200 || xhr.status === 0) {
            console.log('[GenSnitch Isolated] XHR succeeded:', xhr.response?.byteLength, 'bytes');
            resolve(xhr.response);
          } else {
            console.log('[GenSnitch Isolated] XHR failed:', xhr.status);
            resolve(null);
          }
        };
        
        xhr.onerror = (e) => {
          console.log('[GenSnitch Isolated] XHR error:', e);
          resolve(null);
        };
        
        xhr.ontimeout = () => {
          console.log('[GenSnitch Isolated] XHR timeout');
          resolve(null);
        };
        
        xhr.send();
      } catch (e) {
        console.log('[GenSnitch Isolated] XHR exception:', e);
        resolve(null);
      }
    });
  };

  // Try fetch
  const tryFetch = async (): Promise<ArrayBuffer | null> => {
    try {
      const response = await fetch(fileUrl);
      if (!response.ok) {
        console.log('[GenSnitch Isolated] Fetch failed:', response.status);
        return null;
      }
      const buffer = await response.arrayBuffer();
      console.log('[GenSnitch Isolated] Fetch succeeded:', buffer.byteLength, 'bytes');
      return buffer;
    } catch (e) {
      console.log('[GenSnitch Isolated] Fetch error:', e);
      return null;
    }
  };

  // Try XHR first
  let buffer = await tryXHR();
  
  // Try fetch if XHR failed
  if (!buffer) {
    buffer = await tryFetch();
  }

  if (!buffer) {
    return {
      success: false,
      error: 'Could not fetch file in isolated world',
    };
  }

  if (buffer.byteLength > maxSize) {
    return {
      success: false,
      error: `File too large: ${buffer.byteLength} bytes`,
    };
  }

  return {
    success: true,
    data: Array.from(new Uint8Array(buffer)),
  };
};

/**
 * Content script function that runs in the page context (MAIN world)
 * Tries multiple methods to get ORIGINAL image bytes (not re-encoded)
 * 
 * CRITICAL: Canvas-based methods strip metadata! Only use as last resort.
 */
const fetchImageInPage = async (imageUrl: string, maxSize: number): Promise<{ success: boolean; data?: number[]; error?: string; method?: string }> => {
  
  // Method 1: Direct fetch (best - preserves all metadata)
  const tryFetch = async (credentials: RequestCredentials = 'omit'): Promise<ArrayBuffer | null> => {
    try {
      const response = await fetch(imageUrl, {
        credentials,
        cache: 'force-cache',
      });
      
      if (!response.ok) {
        console.log(`[GenSnitch] Fetch failed: ${response.status} ${response.statusText}`);
        return null;
      }
      
      const buffer = await response.arrayBuffer();
      console.log(`[GenSnitch] Fetch succeeded: ${buffer.byteLength} bytes`);
      return buffer;
    } catch (e) {
      console.log(`[GenSnitch] Fetch error:`, e);
      return null;
    }
  };

  // Method 2: XHR (also preserves metadata)
  const tryXHR = (withCredentials = false): Promise<ArrayBuffer | null> => {
    return new Promise((resolve) => {
      try {
        const xhr = new XMLHttpRequest();
        xhr.open('GET', imageUrl, true);
        xhr.responseType = 'arraybuffer';
        xhr.withCredentials = withCredentials;
        xhr.timeout = 30000;
        
        xhr.onload = () => {
          // status 0 is valid for file:// URLs
          if (xhr.status === 200 || xhr.status === 0) {
            console.log(`[GenSnitch] XHR succeeded: ${xhr.response?.byteLength} bytes`);
            resolve(xhr.response);
          } else {
            console.log(`[GenSnitch] XHR failed: ${xhr.status}`);
            resolve(null);
          }
        };
        
        xhr.onerror = (e) => {
          console.log(`[GenSnitch] XHR error:`, e);
          resolve(null);
        };
        xhr.ontimeout = () => {
          console.log(`[GenSnitch] XHR timeout`);
          resolve(null);
        };
        
        xhr.send();
      } catch (e) {
        console.log(`[GenSnitch] XHR exception:`, e);
        resolve(null);
      }
    });
  };

  // Method 3: Canvas (LAST RESORT - strips all metadata!)
  // Only use this if we absolutely cannot get the original bytes
  const tryCanvas = async (): Promise<ArrayBuffer | null> => {
    console.warn('[GenSnitch] WARNING: Using canvas method - metadata will be LOST!');
    try {
      // Try to find existing image element
      const images = document.querySelectorAll('img');
      let targetImg: HTMLImageElement | null = null;
      
      for (const img of images) {
        if (img.src === imageUrl || img.currentSrc === imageUrl) {
          targetImg = img;
          break;
        }
      }
      
      if (!targetImg || !targetImg.complete || targetImg.naturalWidth === 0) {
        // Create new image
        targetImg = new Image();
        targetImg.crossOrigin = 'anonymous';
        await new Promise<void>((resolve, reject) => {
          targetImg!.onload = () => resolve();
          targetImg!.onerror = () => reject(new Error('Image load failed'));
          targetImg!.src = imageUrl;
        });
      }

      const canvas = document.createElement('canvas');
      canvas.width = targetImg.naturalWidth;
      canvas.height = targetImg.naturalHeight;
      
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      
      ctx.drawImage(targetImg, 0, 0);
      
      // Check if canvas is tainted
      try {
        ctx.getImageData(0, 0, 1, 1);
      } catch {
        console.log('[GenSnitch] Canvas is tainted');
        return null;
      }
      
      return new Promise((resolve) => {
        canvas.toBlob(async (blob) => {
          if (!blob) {
            resolve(null);
            return;
          }
          try {
            const buffer = await blob.arrayBuffer();
            console.log(`[GenSnitch] Canvas succeeded: ${buffer.byteLength} bytes (METADATA STRIPPED!)`);
            resolve(buffer);
          } catch {
            resolve(null);
          }
        }, 'image/png');
      });
    } catch (e) {
      console.log(`[GenSnitch] Canvas error:`, e);
      return null;
    }
  };

  console.log(`[GenSnitch] Fetching image in page context: ${imageUrl.substring(0, 100)}`);

  let arrayBuffer: ArrayBuffer | null = null;
  let method = '';

  // Try fetch without credentials first (most CDN images)
  arrayBuffer = await tryFetch('omit');
  if (arrayBuffer) {
    method = 'fetch-no-creds';
  }

  // Try XHR without credentials
  if (!arrayBuffer) {
    arrayBuffer = await tryXHR(false);
    if (arrayBuffer) {
      method = 'xhr-no-creds';
    }
  }

  // Try fetch with credentials (authenticated resources)
  if (!arrayBuffer) {
    arrayBuffer = await tryFetch('include');
    if (arrayBuffer) {
      method = 'fetch-with-creds';
    }
  }

  // Try XHR with credentials
  if (!arrayBuffer) {
    arrayBuffer = await tryXHR(true);
    if (arrayBuffer) {
      method = 'xhr-with-creds';
    }
  }

  // LAST RESORT: Canvas (strips metadata!)
  // Only use if all other methods failed
  if (!arrayBuffer) {
    console.warn('[GenSnitch] All fetch methods failed, falling back to canvas (metadata will be lost!)');
    arrayBuffer = await tryCanvas();
    if (arrayBuffer) {
      method = 'canvas-METADATA-LOST';
    }
  }

  if (!arrayBuffer) {
    return {
      success: false,
      error: 'Could not fetch image bytes. The site may have strict security policies.',
    };
  }

  if (arrayBuffer.byteLength > maxSize) {
    return {
      success: false,
      error: `Image too large: ${arrayBuffer.byteLength} bytes (max ${maxSize})`,
    };
  }

  return {
    success: true,
    data: Array.from(new Uint8Array(arrayBuffer)),
    method,
  };
};

/**
 * Fetch file:// URL using content script in ISOLATED world
 */
async function fetchFileInIsolated(tabId: number, url: string): Promise<ArrayBuffer> {
  console.log('[GenSnitch] Fetching file in ISOLATED world:', url.substring(0, 80));
  
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: fetchFileInIsolatedWorld,
      args: [url, MAX_IMAGE_SIZE],
      // ISOLATED world (default) - runs with extension permissions
    });

    if (!results || results.length === 0) {
      throw new Error('Script execution returned no results');
    }

    const result = results[0].result as { success: boolean; data?: number[]; error?: string } | undefined;
    
    if (!result || !result.success) {
      throw new Error(result?.error || 'Failed to fetch file in isolated world');
    }
    
    if (!result.data) {
      throw new Error('No data received');
    }

    console.log('[GenSnitch] ISOLATED world fetch succeeded:', result.data.length, 'bytes');
    return new Uint8Array(result.data).buffer;
  } catch (err) {
    console.error('[GenSnitch] ISOLATED world fetch failed:', err);
    throw err;
  }
}

/**
 * Fetch URL from within the page context using content script injection
 */
async function fetchInPageContext(tabId: number, url: string): Promise<ArrayBuffer> {
  console.log('[GenSnitch] Fetching via page context (MAIN world):', url.substring(0, 80));
  
  let results;
  try {
    results = await chrome.scripting.executeScript({
      target: { tabId },
      func: fetchImageInPage,
      args: [url, MAX_IMAGE_SIZE],
      world: 'MAIN', // Run in page's main world
    });
  } catch (scriptErr) {
    console.log('[GenSnitch] MAIN world failed, trying ISOLATED:', scriptErr);
    try {
      results = await chrome.scripting.executeScript({
        target: { tabId },
        func: fetchImageInPage,
        args: [url, MAX_IMAGE_SIZE],
      });
    } catch (isolatedErr) {
      throw new Error(`Cannot access page: ${isolatedErr instanceof Error ? isolatedErr.message : String(isolatedErr)}`);
    }
  }

  if (!results || results.length === 0) {
    throw new Error('Script execution returned no results');
  }

  const result = results[0].result as { success: boolean; data?: number[]; error?: string; method?: string } | undefined;
  
  if (!result) {
    throw new Error('Script execution failed - no result returned');
  }
  
  if (!result.success) {
    throw new Error(result.error || 'Failed to fetch image');
  }
  
  if (!result.data) {
    throw new Error('No image data received');
  }

  console.log(`[GenSnitch] Successfully fetched ${result.data.length} bytes via ${result.method}`);
  
  // Warn if canvas was used (metadata lost)
  if (result.method?.includes('canvas')) {
    console.warn('[GenSnitch] WARNING: Image was fetched via canvas - C2PA and other metadata may be lost!');
  }
  
  return new Uint8Array(result.data).buffer;
}

/**
 * Fetch image directly from service worker (for URLs we have permission for)
 */
async function fetchHttpImageDirect(url: string): Promise<ArrayBuffer> {
  const response = await fetch(url, {
    credentials: 'omit',
  });
  
  if (!response.ok) {
    throw new Error(`HTTP error: ${response.status} ${response.statusText}`);
  }
  
  const contentLength = response.headers.get('content-length');
  if (contentLength && parseInt(contentLength, 10) > MAX_IMAGE_SIZE) {
    throw new Error(`Image too large: ${contentLength} bytes (max ${MAX_IMAGE_SIZE})`);
  }
  
  const arrayBuffer = await response.arrayBuffer();
  
  if (arrayBuffer.byteLength > MAX_IMAGE_SIZE) {
    throw new Error(`Image too large: ${arrayBuffer.byteLength} bytes (max ${MAX_IMAGE_SIZE})`);
  }
  
  return arrayBuffer;
}

/**
 * Check if we have host permission for the given URL
 */
async function hasHostPermission(url: string): Promise<boolean> {
  try {
    const urlObj = new URL(url);
    const origin = `${urlObj.protocol}//${urlObj.host}/*`;
    
    return await chrome.permissions.contains({
      origins: [origin],
    });
  } catch {
    return false;
  }
}

/**
 * Main function to get image bytes from any source URL
 */
export async function getImageBytes(
  tabId: number,
  srcUrl: string
): Promise<ArrayBuffer> {
  if (!srcUrl) {
    throw new Error('No image URL provided');
  }

  console.log('[GenSnitch] Getting image bytes for:', srcUrl.substring(0, 80));

  // Handle data URLs - decode locally (preserves data as-is)
  if (srcUrl.startsWith('data:')) {
    console.log('[GenSnitch] Decoding data URL');
    const buffer = decodeDataUrl(srcUrl);
    if (buffer.byteLength > MAX_IMAGE_SIZE) {
      throw new Error(`Image too large: ${buffer.byteLength} bytes (max ${MAX_IMAGE_SIZE})`);
    }
    return buffer;
  }

  // Handle file:// URLs - try multiple approaches
  if (srcUrl.startsWith('file://')) {
    console.log('[GenSnitch] Attempting to fetch file:// URL');
    
    // Method 1: Try ISOLATED world content script (extension permissions)
    try {
      console.log('[GenSnitch] Trying ISOLATED world...');
      return await fetchFileInIsolated(tabId, srcUrl);
    } catch (err) {
      console.log('[GenSnitch] ISOLATED world failed:', err);
    }
    
    // Method 2: Try offscreen document
    try {
      console.log('[GenSnitch] Trying offscreen document...');
      const buffer = await fetchFileViaOffscreen(srcUrl);
      if (buffer.byteLength > MAX_IMAGE_SIZE) {
        throw new Error(`Image too large: ${buffer.byteLength} bytes (max ${MAX_IMAGE_SIZE})`);
      }
      return buffer;
    } catch (err) {
      console.log('[GenSnitch] Offscreen fetch failed:', err);
    }
    
    // Method 3: Fall back to page context (will likely use canvas and lose metadata)
    console.warn('[GenSnitch] All file:// methods failed, using page context (metadata will be lost!)');
    return fetchInPageContext(tabId, srcUrl);
  }

  // Handle blob URLs - must fetch from page context
  if (srcUrl.startsWith('blob:')) {
    console.log('[GenSnitch] Fetching blob URL from page context');
    return fetchInPageContext(tabId, srcUrl);
  }

  // Handle HTTP/HTTPS URLs
  if (srcUrl.startsWith('http://') || srcUrl.startsWith('https://')) {
    // Check if we have explicit host permission
    const hasPermission = await hasHostPermission(srcUrl);
    
    if (hasPermission) {
      console.log('[GenSnitch] Have host permission, trying direct fetch');
      try {
        return await fetchHttpImageDirect(srcUrl);
      } catch (err) {
        console.log('[GenSnitch] Direct fetch failed:', err);
      }
    }
    
    // Fetch from within the page context
    console.log('[GenSnitch] Using page context fetch');
    return fetchInPageContext(tabId, srcUrl);
  }

  throw new Error(`Unsupported URL scheme: ${srcUrl.substring(0, 30)}...`);
}
