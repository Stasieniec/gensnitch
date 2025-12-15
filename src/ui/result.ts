/**
 * GenSnitch Result UI Script
 * Displays analysis results in a popup window
 */

import type { Report } from '../lib/types';

// DOM Elements
const loadingEl = document.getElementById('loading')!;
const resultsEl = document.getElementById('results')!;
const errorEl = document.getElementById('error')!;
const errorMessageEl = document.getElementById('error-message')!;

const verdictBadgeEl = document.getElementById('verdict-badge')!;
const verdictIconEl = document.getElementById('verdict-icon')!;
const verdictTextEl = document.getElementById('verdict-text')!;
const confidenceEl = document.getElementById('confidence')!;

const notesListEl = document.getElementById('notes-list')!;
const imageUrlEl = document.getElementById('image-url')!;

const c2paIconEl = document.getElementById('c2pa-icon')!;
const c2paContentEl = document.getElementById('c2pa-content')!;
const metadataIconEl = document.getElementById('metadata-icon')!;
const metadataContentEl = document.getElementById('metadata-content')!;
const pngIconEl = document.getElementById('png-icon')!;
const pngContentEl = document.getElementById('png-content')!;

const copyJsonBtn = document.getElementById('copy-json')!;

let currentReport: Report | null = null;

/**
 * Get report key from URL parameters
 */
function getReportKey(): string | null {
  const params = new URLSearchParams(window.location.search);
  return params.get('key');
}

/**
 * Load report from session storage
 */
async function loadReport(key: string): Promise<Report | null> {
  const result = await chrome.storage.session.get(key);
  return result[key] || null;
}

/**
 * Show loading state
 */
function showLoading() {
  loadingEl.classList.remove('hidden');
  resultsEl.classList.add('hidden');
  errorEl.classList.add('hidden');
}

/**
 * Show error state
 */
function showError(message: string) {
  loadingEl.classList.add('hidden');
  resultsEl.classList.add('hidden');
  errorEl.classList.remove('hidden');
  errorMessageEl.textContent = message;
}

/**
 * Render verdict section
 */
function renderVerdict(report: Report) {
  let icon = '';
  let text = '';
  let badgeClass = '';

  switch (report.verdict) {
    case 'AI_EVIDENCE':
      icon = '🤖';
      text = 'Evidence of AI-generation found';
      badgeClass = 'ai-evidence';
      break;
    case 'NO_EVIDENCE':
      icon = '✓';
      text = 'No AI-generation evidence found';
      badgeClass = 'no-evidence';
      break;
    case 'ERROR':
      icon = '⚠️';
      text = 'Analysis Error';
      badgeClass = 'error';
      break;
  }

  verdictBadgeEl.className = `verdict-badge ${badgeClass}`;
  verdictIconEl.textContent = icon;
  verdictTextEl.textContent = text;

  confidenceEl.innerHTML = `
    Confidence: <span class="level ${report.confidence}">${report.confidence}</span>
  `;
}

/**
 * Render notes list
 */
function renderNotes(notes: string[]) {
  notesListEl.innerHTML = notes
    .map(note => `<li>${escapeHtml(note)}</li>`)
    .join('');
}

/**
 * Render C2PA signal
 */
function renderC2PA(report: Report) {
  const c2pa = report.signals.c2pa;
  
  if (c2pa.present) {
    c2paIconEl.textContent = '●';
    c2paIconEl.className = 'signal-icon found';
  } else if (c2pa.available) {
    c2paIconEl.textContent = '○';
    c2paIconEl.className = 'signal-icon not-found';
  } else {
    c2paIconEl.textContent = '◐';
    c2paIconEl.className = 'signal-icon partial';
  }

  let content = '';
  
  if (c2pa.present) {
    content += `<div class="value">C2PA signature detected</div>`;
  } else {
    content += `<div class="value">No C2PA signature found</div>`;
  }

  if (c2pa.summary) {
    if (c2pa.summary.creator) {
      content += `<span class="label">Creator</span><div class="value">${escapeHtml(c2pa.summary.creator)}</div>`;
    }
    if (c2pa.summary.generator) {
      content += `<span class="label">Generator</span><div class="value">${escapeHtml(c2pa.summary.generator)}</div>`;
    }
  }

  if (c2pa.errors && c2pa.errors.length > 0) {
    content += `<span class="label">Notes</span><div class="value">${c2pa.errors.map(e => escapeHtml(e)).join('<br>')}</div>`;
  }

  c2paContentEl.innerHTML = content;
}

/**
 * Render metadata signal
 */
function renderMetadata(report: Report) {
  const meta = report.signals.metadata;
  
  if (meta.aiIndicators.length > 0) {
    metadataIconEl.textContent = '●';
    metadataIconEl.className = 'signal-icon found';
  } else if (meta.found) {
    metadataIconEl.textContent = '○';
    metadataIconEl.className = 'signal-icon not-found';
  } else {
    metadataIconEl.textContent = '○';
    metadataIconEl.className = 'signal-icon not-found';
  }

  let content = '';

  if (!meta.found) {
    content = '<div class="value">No EXIF/XMP metadata found in image</div>';
  } else {
    if (meta.software) {
      content += `<span class="label">Software</span><div class="value">${escapeHtml(meta.software)}</div>`;
    }
    if (meta.creatorTool) {
      content += `<span class="label">Creator Tool</span><div class="value">${escapeHtml(meta.creatorTool)}</div>`;
    }
    if (meta.artist) {
      content += `<span class="label">Artist</span><div class="value">${escapeHtml(meta.artist)}</div>`;
    }
    if (meta.make) {
      content += `<span class="label">Make</span><div class="value">${escapeHtml(meta.make)}</div>`;
    }
    if (meta.model) {
      content += `<span class="label">Model</span><div class="value">${escapeHtml(meta.model)}</div>`;
    }

    if (meta.aiIndicators.length > 0) {
      content += `
        <span class="label">AI Indicators Found</span>
        <div class="indicators">
          ${meta.aiIndicators.map(i => `<span class="indicator-tag">${escapeHtml(i)}</span>`).join('')}
        </div>
      `;
    }

    if (meta.rawFields && Object.keys(meta.rawFields).length > 0) {
      content += `
        <span class="label">Raw Metadata</span>
        <pre>${escapeHtml(JSON.stringify(meta.rawFields, null, 2))}</pre>
      `;
    }
  }

  metadataContentEl.innerHTML = content;
}

/**
 * Render PNG text signal
 */
function renderPngText(report: Report) {
  const png = report.signals.pngText;
  
  if (png.aiIndicators.length > 0) {
    pngIconEl.textContent = '●';
    pngIconEl.className = 'signal-icon found';
  } else if (png.found) {
    pngIconEl.textContent = '○';
    pngIconEl.className = 'signal-icon not-found';
  } else {
    pngIconEl.textContent = '○';
    pngIconEl.className = 'signal-icon not-found';
  }

  let content = '';

  if (!png.found) {
    content = '<div class="value">No PNG text chunks found (image may not be PNG)</div>';
  } else if (png.chunks.length === 0) {
    content = '<div class="value">PNG image with no text chunks</div>';
  } else {
    if (png.aiIndicators.length > 0) {
      content += `
        <span class="label">AI Indicators Found</span>
        <div class="indicators">
          ${png.aiIndicators.map(i => `<span class="indicator-tag">${escapeHtml(i)}</span>`).join('')}
        </div>
      `;
    }

    content += `<span class="label">Text Chunks (${png.chunks.length})</span>`;
    
    for (const chunk of png.chunks) {
      content += `
        <div style="margin-top: 8px;">
          <strong>${escapeHtml(chunk.key)}</strong>
          ${chunk.truncated ? '<span style="color: var(--text-muted);"> (truncated)</span>' : ''}
        </div>
        <pre>${escapeHtml(chunk.value)}</pre>
      `;
    }
  }

  pngContentEl.innerHTML = content;
}

/**
 * Render image URL
 */
function renderImageUrl(url: string) {
  const truncatedUrl = url.length > 100 
    ? url.substring(0, 100) + '...' 
    : url;
  imageUrlEl.textContent = truncatedUrl;
  imageUrlEl.title = url;
}

/**
 * Show results
 */
function showResults(report: Report) {
  currentReport = report;
  
  loadingEl.classList.add('hidden');
  errorEl.classList.add('hidden');
  resultsEl.classList.remove('hidden');

  renderVerdict(report);
  renderNotes(report.notes);
  renderC2PA(report);
  renderMetadata(report);
  renderPngText(report);
  renderImageUrl(report.url);
}

/**
 * Copy JSON report to clipboard
 */
async function copyJsonReport() {
  if (!currentReport) return;

  try {
    await navigator.clipboard.writeText(JSON.stringify(currentReport, null, 2));
    
    // Visual feedback
    const originalText = copyJsonBtn.innerHTML;
    copyJsonBtn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="20 6 9 17 4 12"></polyline>
      </svg>
      Copied!
    `;
    
    setTimeout(() => {
      copyJsonBtn.innerHTML = originalText;
    }, 2000);
  } catch (err) {
    console.error('Failed to copy:', err);
  }
}

/**
 * Escape HTML special characters
 */
function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Initialize the UI
 */
async function init() {
  showLoading();

  const key = getReportKey();
  if (!key) {
    showError('No report key provided');
    return;
  }

  try {
    const report = await loadReport(key);
    if (!report) {
      showError('Report not found. It may have expired.');
      return;
    }

    showResults(report);
  } catch (err) {
    showError(err instanceof Error ? err.message : 'Failed to load report');
  }
}

// Event listeners
copyJsonBtn.addEventListener('click', copyJsonReport);

// Start
init();

