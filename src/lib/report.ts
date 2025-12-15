/**
 * Report Generation Module
 * Creates analysis reports from analyzer outputs
 */

import type {
  Report,
  Verdict,
  Confidence,
  AnalysisSignals,
  C2PAResult,
  MetadataResult,
  PngTextResult,
} from './types';

const VERSION = '0.1.0';

/**
 * Generate a unique report ID
 */
function generateId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `${timestamp}-${random}`;
}

/**
 * Determine verdict based on analysis signals
 */
function determineVerdict(signals: AnalysisSignals): Verdict {
  // Check C2PA for explicit AI generation indication
  if (signals.c2pa.present) {
    // If C2PA is present, it might indicate provenance
    // But we can't fully parse it in v0, so note it
    return 'AI_EVIDENCE';
  }

  // Check metadata for AI indicators
  if (signals.metadata.aiIndicators.length > 0) {
    return 'AI_EVIDENCE';
  }

  // Check PNG text chunks for AI indicators
  if (signals.pngText.aiIndicators.length > 0) {
    return 'AI_EVIDENCE';
  }

  // Check for AI-related software in metadata
  const softwareIndicators = [
    signals.metadata.software,
    signals.metadata.creatorTool,
  ].filter(Boolean);

  for (const sw of softwareIndicators) {
    if (sw) {
      const lower = sw.toLowerCase();
      if (
        lower.includes('stable diffusion') ||
        lower.includes('midjourney') ||
        lower.includes('dall-e') ||
        lower.includes('comfyui') ||
        lower.includes('automatic1111') ||
        lower.includes('flux')
      ) {
        return 'AI_EVIDENCE';
      }
    }
  }

  return 'NO_EVIDENCE';
}

/**
 * Calculate confidence level based on signal strength
 */
function calculateConfidence(
  verdict: Verdict,
  signals: AnalysisSignals
): Confidence {
  if (verdict === 'ERROR') {
    return 'low';
  }

  if (verdict === 'NO_EVIDENCE') {
    // No evidence doesn't mean "real" - confidence is how sure we are about the analysis
    // If we had metadata to analyze, we're more confident
    if (signals.metadata.found || signals.pngText.found) {
      return 'medium';
    }
    return 'low';
  }

  // AI_EVIDENCE verdict
  let score = 0;

  // C2PA presence is significant
  if (signals.c2pa.present) {
    score += 2;
  }

  // Multiple metadata indicators increase confidence
  const metadataIndicatorCount = signals.metadata.aiIndicators.length;
  if (metadataIndicatorCount > 0) {
    score += Math.min(metadataIndicatorCount, 3);
  }

  // PNG text indicators
  const pngIndicatorCount = signals.pngText.aiIndicators.length;
  if (pngIndicatorCount > 0) {
    score += Math.min(pngIndicatorCount, 3);
  }

  // Check for explicit SD parameters (very strong signal)
  const hasSDParams = signals.pngText.chunks.some(
    chunk =>
      chunk.key.toLowerCase() === 'parameters' &&
      chunk.value.toLowerCase().includes('steps:')
  );
  if (hasSDParams) {
    score += 3;
  }

  if (score >= 5) {
    return 'high';
  } else if (score >= 2) {
    return 'medium';
  }
  return 'low';
}

/**
 * Generate analysis notes
 */
function generateNotes(signals: AnalysisSignals, verdict: Verdict): string[] {
  const notes: string[] = [];

  // C2PA notes
  if (signals.c2pa.errors && signals.c2pa.errors.length > 0) {
    notes.push(...signals.c2pa.errors);
  }
  if (signals.c2pa.present) {
    notes.push('C2PA/Content Credentials signature detected in image');
  }

  // Metadata notes
  if (signals.metadata.found) {
    if (signals.metadata.software) {
      notes.push(`Software: ${signals.metadata.software}`);
    }
    if (signals.metadata.creatorTool) {
      notes.push(`Creator Tool: ${signals.metadata.creatorTool}`);
    }
    if (signals.metadata.aiIndicators.length > 0) {
      notes.push(
        `Metadata AI indicators: ${signals.metadata.aiIndicators.join(', ')}`
      );
    }
  } else {
    notes.push('No EXIF/XMP metadata found in image');
  }

  // PNG notes
  if (signals.pngText.found) {
    const relevantChunks = signals.pngText.chunks.filter(chunk =>
      ['parameters', 'prompt', 'workflow', 'comment', 'description'].includes(
        chunk.key.toLowerCase()
      )
    );
    if (relevantChunks.length > 0) {
      notes.push(`Found ${relevantChunks.length} relevant PNG text chunk(s)`);
    }
    if (signals.pngText.aiIndicators.length > 0) {
      notes.push(
        `PNG text AI indicators: ${signals.pngText.aiIndicators.join(', ')}`
      );
    }
  }

  // Verdict explanation
  if (verdict === 'AI_EVIDENCE') {
    notes.push(
      'Evidence suggests this image may have been created or modified by AI tools'
    );
  } else if (verdict === 'NO_EVIDENCE') {
    notes.push(
      'No evidence of AI generation found in available metadata. This does NOT guarantee the image is authentic.'
    );
  }

  return notes;
}

/**
 * Create a report from analysis signals
 */
export function createReport(
  url: string,
  signals: AnalysisSignals
): Report {
  const verdict = determineVerdict(signals);
  const confidence = calculateConfidence(verdict, signals);
  const notes = generateNotes(signals, verdict);

  return {
    id: generateId(),
    url,
    timestamp: Date.now(),
    verdict,
    confidence,
    signals,
    notes,
    version: VERSION,
  };
}

/**
 * Create an error report
 */
export function createErrorReport(url: string, error: string): Report {
  return {
    id: generateId(),
    url,
    timestamp: Date.now(),
    verdict: 'ERROR',
    confidence: 'low',
    signals: {
      c2pa: { available: false, present: false, errors: [error] },
      metadata: { found: false, aiIndicators: [] },
      pngText: { found: false, chunks: [], aiIndicators: [] },
    },
    notes: [`Analysis failed: ${error}`],
    version: VERSION,
  };
}

/**
 * Run all analyzers and create a report
 */
export async function runAnalysis(
  data: ArrayBuffer,
  url: string,
  analyzers: {
    analyzeC2PA: (data: ArrayBuffer) => Promise<C2PAResult>;
    analyzeMetadata: (data: ArrayBuffer) => Promise<MetadataResult>;
    analyzePngText: (data: ArrayBuffer) => Promise<PngTextResult>;
  }
): Promise<Report> {
  try {
    // Run all analyzers in parallel
    const [c2pa, metadata, pngText] = await Promise.all([
      analyzers.analyzeC2PA(data),
      analyzers.analyzeMetadata(data),
      analyzers.analyzePngText(data),
    ]);

    const signals: AnalysisSignals = {
      c2pa,
      metadata,
      pngText,
    };

    return createReport(url, signals);
  } catch (err) {
    return createErrorReport(
      url,
      err instanceof Error ? err.message : 'Unknown analysis error'
    );
  }
}

