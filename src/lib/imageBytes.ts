/**
 * Image Bytes Retrieval Module
 * Handles fetching image data from various URL schemes
 */

const MAX_IMAGE_SIZE = 25 * 1024 * 1024; // 25MB

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
 * Fetch blob URL from within the page context
 */
async function fetchBlobInPage(tabId: number, blobUrl: string): Promise<ArrayBuffer> {
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: async (url: string) => {
      try {
        const response = await fetch(url);
        const arrayBuffer = await response.arrayBuffer();
        // Convert to array for serialization
        return Array.from(new Uint8Array(arrayBuffer));
      } catch (err) {
        throw new Error(`Failed to fetch blob: ${err}`);
      }
    },
    args: [blobUrl],
  });

  if (!results || results.length === 0 || !results[0].result) {
    throw new Error('Failed to retrieve blob data from page');
  }

  const byteArray = results[0].result as number[];
  return new Uint8Array(byteArray).buffer;
}

/**
 * Fetch image from HTTP/HTTPS URL
 */
async function fetchHttpImage(url: string): Promise<ArrayBuffer> {
  const response = await fetch(url);
  
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
 * Request host permissions for the given origin
 */
async function requestHostPermission(url: string): Promise<boolean> {
  try {
    const urlObj = new URL(url);
    const origin = `${urlObj.protocol}//${urlObj.host}/*`;
    
    // Try to request permission for this specific origin first
    const granted = await chrome.permissions.request({
      origins: [origin],
    });
    
    return granted;
  } catch {
    // If specific origin fails, try broad permissions
    try {
      const granted = await chrome.permissions.request({
        origins: ['https://*/*', 'http://*/*'],
      });
      return granted;
    } catch {
      return false;
    }
  }
}

/**
 * Check if we have permission for the given URL
 */
async function hasPermission(url: string): Promise<boolean> {
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

  // Handle data URLs
  if (srcUrl.startsWith('data:')) {
    const buffer = decodeDataUrl(srcUrl);
    if (buffer.byteLength > MAX_IMAGE_SIZE) {
      throw new Error(`Image too large: ${buffer.byteLength} bytes (max ${MAX_IMAGE_SIZE})`);
    }
    return buffer;
  }

  // Handle blob URLs
  if (srcUrl.startsWith('blob:')) {
    return fetchBlobInPage(tabId, srcUrl);
  }

  // Handle HTTP/HTTPS URLs
  if (srcUrl.startsWith('http://') || srcUrl.startsWith('https://')) {
    // Check if we have permission
    const hasAccess = await hasPermission(srcUrl);
    
    if (!hasAccess) {
      // Request permission
      const granted = await requestHostPermission(srcUrl);
      if (!granted) {
        throw new Error('Permission denied: Cannot access image. Please allow the permission and try again.');
      }
    }
    
    return fetchHttpImage(srcUrl);
  }

  throw new Error(`Unsupported URL scheme: ${srcUrl.substring(0, 20)}...`);
}

