/**
 * GenSnitch Result UI Script
 * Displays analysis results in a popup window
 */

import type { Report, C2PAResult } from '../lib/types';

// SVG Icons (no emojis!)
const ICONS = {
  aiDetected: `<path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>`,
  noEvidence: `<polyline points="20 6 9 17 4 12"/>`,
  error: `<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>`,
  check: `<polyline points="20 6 9 17 4 12"/>`,
  x: `<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>`,
  warning: `<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>`,
};

// DOM Elements
const loadingEl = document.getElementById('loading')!;
const resultsEl = document.getElementById('results')!;
const errorEl = document.getElementById('error')!;
const errorMessageEl = document.getElementById('error-message')!;

const verdictSectionEl = document.getElementById('verdict-section')!;
const verdictIconWrapperEl = document.getElementById('verdict-icon-wrapper')!;
const verdictIconEl = document.getElementById('verdict-icon')!;
const verdictTextEl = document.getElementById('verdict-text')!;
const confidenceEl = document.getElementById('confidence')!;
const confidenceLevelEl = document.getElementById('confidence-level')!;

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
 * Clean note text (remove emojis)
 */
function cleanNoteText(text: string): string {
  // Remove common emojis and symbols, keep text indicators
  return text
    .replace(/🤖/g, '[AI]')
    .replace(/✓/g, '[OK]')
    .replace(/✗/g, '[X]')
    .replace(/⚠/g, '[!]')
    .replace(/[?]/g, '[?]');
}

/**
 * Render verdict section
 */
function renderVerdict(report: Report) {
  let iconPath = '';
  let text = '';
  let verdictClass = '';

  switch (report.verdict) {
    case 'AI_EVIDENCE':
      iconPath = ICONS.aiDetected;
      text = 'AI Generation Evidence Found';
      verdictClass = 'ai-evidence';
      break;
    case 'NO_EVIDENCE':
      iconPath = ICONS.noEvidence;
      text = 'No AI Evidence Detected';
      verdictClass = 'no-evidence';
      break;
    case 'ERROR':
      iconPath = ICONS.error;
      text = 'Analysis Error';
      verdictClass = 'error';
      break;
  }

  verdictSectionEl.className = `verdict-section ${verdictClass}`;
  verdictIconWrapperEl.className = `verdict-icon-wrapper ${verdictClass}`;
  verdictIconEl.innerHTML = iconPath;
  verdictTextEl.textContent = text;

  confidenceLevelEl.className = `level ${report.confidence}`;
  confidenceLevelEl.textContent = report.confidence.toUpperCase();
}

/**
 * Render notes list
 */
function renderNotes(notes: string[]) {
  notesListEl.innerHTML = notes
    .map(note => {
      const cleanedNote = cleanNoteText(note);
      const isHighlight = note.includes('[AI]') || note.includes('AI Generation') || note.includes('Evidence');
      return `<li${isHighlight ? ' class="highlight"' : ''}>${escapeHtml(cleanedNote)}</li>`;
    })
    .join('');
}

/**
 * Get validation status badge HTML
 */
function getValidationBadge(c2pa: C2PAResult): string {
  if (!c2pa.present) return '';
  
  const status = c2pa.validated;
  let className = 'badge-unknown';
  let text = 'Unknown';
  
  if (status === 'valid') {
    className = 'badge-valid';
    text = 'Signature Valid';
  } else if (status === 'invalid') {
    className = 'badge-invalid';
    text = 'Signature Invalid';
  }
  
  return `<span class="validation-badge ${className}">${text}</span>`;
}

/**
 * Get trust status badge HTML
 */
function getTrustBadge(c2pa: C2PAResult): string {
  if (!c2pa.present) return '';
  
  const trust = c2pa.trust;
  let className = 'badge-unknown';
  let text = 'Unknown Issuer';
  
  if (trust === 'trusted') {
    className = 'badge-trusted';
    text = 'Trusted Issuer';
  } else if (trust === 'untrusted') {
    className = 'badge-untrusted';
    text = 'Untrusted Issuer';
  }
  
  return `<span class="trust-badge ${className}">${text}</span>`;
}

/**
 * Render C2PA signal
 */
function renderC2PA(report: Report) {
  const c2pa = report.signals.c2pa;
  
  // Set icon based on presence and validation
  if (c2pa.present) {
    if (c2pa.validated === 'valid') {
      c2paIconEl.className = 'signal-icon valid';
    } else if (c2pa.validated === 'invalid') {
      c2paIconEl.className = 'signal-icon partial';
    } else {
      c2paIconEl.className = 'signal-icon partial';
    }
  } else if (c2pa.available) {
    c2paIconEl.className = 'signal-icon not-found';
  } else {
    c2paIconEl.className = 'signal-icon partial';
  }

  let content = '';
  
  if (c2pa.present) {
    content += `<div class="c2pa-status">
      <div class="value c2pa-found">Content Credentials Found</div>
      <div class="c2pa-badges">
        ${getValidationBadge(c2pa)}
        ${getTrustBadge(c2pa)}
      </div>
    </div>`;
    
    // Summary info
    if (c2pa.summary) {
      if (c2pa.summary.claimGenerator) {
        content += `<span class="label">Claim Generator</span><div class="value">${escapeHtml(c2pa.summary.claimGenerator)}</div>`;
      }
      if (c2pa.summary.issuer) {
        content += `<span class="label">Signed By</span><div class="value">${escapeHtml(c2pa.summary.issuer)}</div>`;
      }
      if (c2pa.summary.certificate) {
        const cert = c2pa.summary.certificate;
        if (cert.subject) {
          content += `<span class="label">Certificate Subject</span><div class="value">${escapeHtml(cert.subject)}</div>`;
        }
      }
      if (c2pa.summary.actions && c2pa.summary.actions.length > 0) {
        content += `<span class="label">Actions</span>
          <div class="indicators">
            ${c2pa.summary.actions.map(a => `<span class="indicator-tag">${escapeHtml(a)}</span>`).join('')}
          </div>`;
      }
      if (c2pa.summary.aiAssertions && c2pa.summary.aiAssertions.length > 0) {
        content += `<span class="label">AI Assertions</span>
          <div class="indicators">
            ${c2pa.summary.aiAssertions.map(a => `<span class="indicator-tag ai-tag">${escapeHtml(a)}</span>`).join('')}
          </div>`;
      }
      if (c2pa.summary.ingredients && c2pa.summary.ingredients.length > 0) {
        content += `<span class="label">Ingredients (Source Materials)</span>
          <div class="value">${c2pa.summary.ingredients.map(i => escapeHtml(i)).join(', ')}</div>`;
      }
    }
    
    // Raw data (collapsible)
    if (c2pa.raw && Object.keys(c2pa.raw).length > 0) {
      content += `
        <details class="raw-details">
          <summary class="raw-summary">View Raw Data</summary>
          <pre>${escapeHtml(JSON.stringify(c2pa.raw, null, 2))}</pre>
        </details>
      `;
    }
  } else {
    content += `<div class="value">No Content Credentials (C2PA) found</div>`;
    if (!c2pa.available) {
      content += `<div class="value muted">C2PA analysis module not available</div>`;
    }
  }

  if (c2pa.errors && c2pa.errors.length > 0) {
    content += `<span class="label">Notes</span><div class="value muted">${c2pa.errors.map(e => escapeHtml(e)).join('<br>')}</div>`;
  }

  c2paContentEl.innerHTML = content;
}

/**
 * Render metadata signal
 */
function renderMetadata(report: Report) {
  const meta = report.signals.metadata;
  
  if (meta.aiIndicators.length > 0) {
    metadataIconEl.className = 'signal-icon found';
  } else if (meta.found) {
    metadataIconEl.className = 'signal-icon not-found';
  } else {
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
        <details class="raw-details">
          <summary class="raw-summary">View Raw Data</summary>
          <pre>${escapeHtml(JSON.stringify(meta.rawFields, null, 2))}</pre>
        </details>
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
    pngIconEl.className = 'signal-icon found';
  } else if (png.found) {
    pngIconEl.className = 'signal-icon not-found';
  } else {
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
