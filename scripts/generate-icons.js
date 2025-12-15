/**
 * Simple script to generate placeholder PNG icons
 * Creates minimal valid PNG files with a simple eye design
 */

import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { deflateSync } from 'zlib';

const __dirname = dirname(fileURLToPath(import.meta.url));
const iconsDir = join(__dirname, '..', 'public', 'icons');

// Ensure icons directory exists
if (!existsSync(iconsDir)) {
  mkdirSync(iconsDir, { recursive: true });
}

// CRC32 implementation for PNG
let crcTable = null;
function getCRCTable() {
  if (crcTable) return crcTable;
  
  crcTable = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      if (c & 1) {
        c = 0xEDB88320 ^ (c >>> 1);
      } else {
        c = c >>> 1;
      }
    }
    crcTable[n] = c;
  }
  return crcTable;
}

function crc32(data) {
  let crc = 0xFFFFFFFF;
  const table = getCRCTable();
  
  for (let i = 0; i < data.length; i++) {
    crc = (crc >>> 8) ^ table[(crc ^ data[i]) & 0xFF];
  }
  
  return crc ^ 0xFFFFFFFF;
}

function createChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  
  const typeBuffer = Buffer.from(type, 'ascii');
  const crcData = Buffer.concat([typeBuffer, data]);
  const crc = crc32(crcData);
  
  const crcBuffer = Buffer.alloc(4);
  crcBuffer.writeUInt32BE(crc >>> 0, 0);
  
  return Buffer.concat([length, typeBuffer, data, crcBuffer]);
}

function generateIcon(size) {
  // PNG signature
  const signature = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  
  // IHDR chunk
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(size, 0);  // width
  ihdrData.writeUInt32BE(size, 4);  // height
  ihdrData.writeUInt8(8, 8);        // bit depth
  ihdrData.writeUInt8(2, 9);        // color type (RGB)
  ihdrData.writeUInt8(0, 10);       // compression
  ihdrData.writeUInt8(0, 11);       // filter
  ihdrData.writeUInt8(0, 12);       // interlace
  const ihdrChunk = createChunk('IHDR', ihdrData);
  
  // Create pixel data - eye icon design
  const rawData = [];
  const centerX = size / 2;
  const centerY = size / 2;
  const outerRadius = size * 0.38;
  const innerRadius = size * 0.12;
  const irisRadius = size * 0.22;
  
  for (let y = 0; y < size; y++) {
    rawData.push(0); // Filter byte for each row
    for (let x = 0; x < size; x++) {
      const dx = x - centerX + 0.5;
      const dy = y - centerY + 0.5;
      const dist = Math.sqrt(dx * dx + dy * dy);
      
      // Eye shape (almond/ellipse)
      const eyeX = dx / outerRadius;
      const eyeY = dy / (outerRadius * 0.55);
      const eyeDist = Math.sqrt(eyeX * eyeX + eyeY * eyeY);
      
      let r, g, b;
      
      if (dist < innerRadius) {
        // Pupil - very dark blue
        r = 15;
        g = 25;
        b = 50;
      } else if (dist < irisRadius && eyeDist < 1) {
        // Iris - gradient blue
        const t = (dist - innerRadius) / (irisRadius - innerRadius);
        r = Math.floor(40 + t * 48);
        g = Math.floor(80 + t * 86);
        b = Math.floor(180 + t * 75);
      } else if (eyeDist < 1) {
        // Eye white/sclera - light bluish white
        r = 220;
        g = 230;
        b = 245;
      } else if (eyeDist < 1.1) {
        // Eye outline - blue accent
        r = 88;
        g = 166;
        b = 255;
      } else {
        // Background - dark theme color
        r = 13;
        g = 17;
        b = 23;
      }
      
      rawData.push(r, g, b);
    }
  }
  
  // Compress image data
  const compressedData = deflateSync(Buffer.from(rawData));
  const idatChunk = createChunk('IDAT', compressedData);
  
  // IEND chunk
  const iendChunk = createChunk('IEND', Buffer.alloc(0));
  
  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

// Generate icons at required sizes
const sizes = [16, 32, 48, 128];

for (const size of sizes) {
  console.log(`Generating ${size}x${size} icon...`);
  const png = generateIcon(size);
  const path = join(iconsDir, `icon${size}.png`);
  writeFileSync(path, png);
  console.log(`  Created ${path}`);
}

console.log('\n✓ All icons generated successfully!');
