/**
 * PNG Text Chunk Analyzer
 * Parses PNG files for tEXt, iTXt, and zTXt chunks containing AI generation metadata
 */

import type { PngTextResult } from '../types';

const PNG_SIGNATURE = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const MAX_CHUNK_DISPLAY_LENGTH = 500;

/**
 * AI-related keys commonly found in PNG text chunks
 */
const AI_RELATED_KEYS = [
  'parameters',
  'sd-metadata',
  'prompt',
  'negative_prompt',
  'negativeprompt',
  'workflow',
  'comfyui',
  'automatic1111',
  'a1111',
  'dream',
  'generation_data',
  'ai_metadata',
  'source',
  'comment',
  'description',
  'software',
  'creator',
];

/**
 * Patterns indicating AI generation in chunk values
 */
const AI_VALUE_PATTERNS = [
  'steps:',
  'sampler:',
  'cfg scale:',
  'seed:',
  'model:',
  'model hash:',
  'clip skip:',
  'lora:',
  'negative prompt:',
  'stable diffusion',
  'comfyui',
  'automatic1111',
  'midjourney',
  'dall-e',
  'flux',
  'sdxl',
];

/**
 * Check if PNG signature matches
 */
function isPNG(data: Uint8Array): boolean {
  if (data.length < 8) return false;
  for (let i = 0; i < 8; i++) {
    if (data[i] !== PNG_SIGNATURE[i]) return false;
  }
  return true;
}

/**
 * Read a 32-bit big-endian integer
 */
function readUint32BE(data: Uint8Array, offset: number): number {
  return (
    (data[offset] << 24) |
    (data[offset + 1] << 16) |
    (data[offset + 2] << 8) |
    data[offset + 3]
  ) >>> 0;
}

/**
 * Decode bytes to string, handling null terminators
 */
function decodeString(data: Uint8Array): string {
  const decoder = new TextDecoder('utf-8', { fatal: false });
  return decoder.decode(data);
}

/**
 * Try to decompress zlib data (for zTXt chunks)
 * Uses DecompressionStream if available
 */
async function tryDecompress(data: Uint8Array): Promise<string | null> {
  try {
    // Check for zlib header
    if (data.length < 2) return null;
    
    // zlib header check (CMF and FLG bytes)
    const cmf = data[0];
    const flg = data[1];
    if ((cmf * 256 + flg) % 31 !== 0) return null;
    
    // Use DecompressionStream API
    const ds = new DecompressionStream('deflate');
    const writer = ds.writable.getWriter();
    
    // Skip the 2-byte zlib header for raw deflate
    const rawDeflate = data.slice(2);
    
    writer.write(rawDeflate);
    writer.close();
    
    const reader = ds.readable.getReader();
    const chunks: Uint8Array[] = [];
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
    
    const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }
    
    return decodeString(result);
  } catch {
    // Decompression failed - return null
    return null;
  }
}

interface PngChunk {
  type: string;
  key: string;
  value: string;
}

/**
 * Parse PNG text chunks (tEXt, iTXt, zTXt)
 */
async function parsePngTextChunks(data: Uint8Array): Promise<PngChunk[]> {
  const chunks: PngChunk[] = [];
  let offset = 8; // Skip PNG signature

  while (offset < data.length - 12) {
    const length = readUint32BE(data, offset);
    const typeBytes = data.slice(offset + 4, offset + 8);
    const type = decodeString(typeBytes);
    
    if (length > data.length - offset - 12) {
      // Invalid chunk length
      break;
    }

    const chunkData = data.slice(offset + 8, offset + 8 + length);

    if (type === 'tEXt') {
      // tEXt: keyword\0text
      const nullIndex = chunkData.indexOf(0);
      if (nullIndex > 0) {
        const key = decodeString(chunkData.slice(0, nullIndex));
        const value = decodeString(chunkData.slice(nullIndex + 1));
        chunks.push({ type, key, value });
      }
    } else if (type === 'zTXt') {
      // zTXt: keyword\0compression_method\0compressed_text
      const nullIndex = chunkData.indexOf(0);
      if (nullIndex > 0 && nullIndex + 2 < chunkData.length) {
        const key = decodeString(chunkData.slice(0, nullIndex));
        const compressionMethod = chunkData[nullIndex + 1];
        
        if (compressionMethod === 0) {
          // zlib compression
          const compressedData = chunkData.slice(nullIndex + 2);
          const decompressed = await tryDecompress(compressedData);
          if (decompressed) {
            chunks.push({ type, key, value: decompressed });
          } else {
            chunks.push({ type, key, value: '[compressed - decompression failed]' });
          }
        }
      }
    } else if (type === 'iTXt') {
      // iTXt: keyword\0compression_flag\0compression_method\0language_tag\0translated_keyword\0text
      const nullIndex = chunkData.indexOf(0);
      if (nullIndex > 0) {
        const key = decodeString(chunkData.slice(0, nullIndex));
        const compressionFlag = chunkData[nullIndex + 1];
        
        // Find the text portion (after 4 null-terminated fields)
        let textStart = nullIndex + 3; // Skip compression_flag and compression_method
        
        // Skip language tag
        while (textStart < chunkData.length && chunkData[textStart] !== 0) {
          textStart++;
        }
        textStart++; // Skip null
        
        // Skip translated keyword
        while (textStart < chunkData.length && chunkData[textStart] !== 0) {
          textStart++;
        }
        textStart++; // Skip null
        
        if (textStart < chunkData.length) {
          const textData = chunkData.slice(textStart);
          
          if (compressionFlag === 1) {
            const decompressed = await tryDecompress(textData);
            if (decompressed) {
              chunks.push({ type, key, value: decompressed });
            } else {
              chunks.push({ type, key, value: '[compressed - decompression failed]' });
            }
          } else {
            chunks.push({ type, key, value: decodeString(textData) });
          }
        }
      }
    } else if (type === 'IEND') {
      // End of PNG
      break;
    }

    // Move to next chunk (length + type + data + CRC)
    offset += 12 + length;
  }

  return chunks;
}

/**
 * Find AI indicators in chunk value
 */
function findChunkAIIndicators(value: string): string[] {
  const lowerValue = value.toLowerCase();
  const found: string[] = [];
  
  for (const pattern of AI_VALUE_PATTERNS) {
    if (lowerValue.includes(pattern.toLowerCase())) {
      found.push(pattern);
    }
  }
  
  return found;
}

/**
 * Analyze PNG for text chunks containing AI generation metadata
 */
export async function analyzePngText(data: ArrayBuffer): Promise<PngTextResult> {
  const uint8Data = new Uint8Array(data);
  
  // Check if it's a PNG
  if (!isPNG(uint8Data)) {
    return {
      found: false,
      chunks: [],
      aiIndicators: [],
    };
  }

  try {
    const rawChunks = await parsePngTextChunks(uint8Data);
    
    if (rawChunks.length === 0) {
      return {
        found: false,
        chunks: [],
        aiIndicators: [],
      };
    }

    const chunks: PngTextResult['chunks'] = [];
    const aiIndicators: string[] = [];
    const seenIndicators = new Set<string>();

    for (const chunk of rawChunks) {
      // Check if this is an AI-related key
      const isAIKey = AI_RELATED_KEYS.some(
        aiKey => chunk.key.toLowerCase().includes(aiKey)
      );
      
      // Find AI indicators in value
      const valueIndicators = findChunkAIIndicators(chunk.value);
      
      // Add unique indicators
      for (const indicator of valueIndicators) {
        const lower = indicator.toLowerCase();
        if (!seenIndicators.has(lower)) {
          seenIndicators.add(lower);
          aiIndicators.push(indicator);
        }
      }
      
      // Mark key as indicator if it's AI-related
      if (isAIKey && !seenIndicators.has(chunk.key.toLowerCase())) {
        seenIndicators.add(chunk.key.toLowerCase());
        aiIndicators.push(`PNG key: ${chunk.key}`);
      }

      // Truncate long values
      const truncated = chunk.value.length > MAX_CHUNK_DISPLAY_LENGTH;
      const displayValue = truncated
        ? chunk.value.substring(0, MAX_CHUNK_DISPLAY_LENGTH)
        : chunk.value;

      chunks.push({
        key: chunk.key,
        value: displayValue,
        truncated,
      });
    }

    return {
      found: true,
      chunks,
      aiIndicators,
    };
  } catch (err) {
    return {
      found: false,
      chunks: [],
      aiIndicators: [],
    };
  }
}

