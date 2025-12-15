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

const VERSION = '0.2.0';

// Known AI tool identifiers in C2PA claim generators or issuers
const AI_TOOL_PATTERNS = [
  'chatgpt', 'gpt-4', 'gpt4', 'openai',
  'stable diffusion', 'stablediffusion',
  'midjourney', 'dall-e', 'dalle',
  'firefly', 'imagen', 'flux',
  'comfyui', 'automatic1111', 'a1111',
  'invoke', 'diffusers',
  'ideogram', 'leonardo',
  'runway', 'pika',
  'sora', 'kling', 'haiper',
  'copilot', 'gemini', 'claude',
];

/**
 * Check if a string contains AI tool indicators
 */
function containsAIToolPattern(text: string | undefined): boolean {
  if (!text) return false;
  const lower = text.toLowerCase();
  return AI_TOOL_PATTERNS.some(pattern => lower.includes(pattern));
}

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
  // Check C2PA for AI evidence
  if (signals.c2pa.present) {
    // Check for AI-related assertions in C2PA
    if (signals.c2pa.summary?.aiAssertions && signals.c2pa.summary.aiAssertions.length > 0) {
      return 'AI_EVIDENCE';
    }
    
    // Check claim generator for AI tools
    if (containsAIToolPattern(signals.c2pa.summary?.claimGenerator)) {
      return 'AI_EVIDENCE';
    }
    
    // Check issuer for AI tools (e.g., OpenAI)
    if (containsAIToolPattern(signals.c2pa.summary?.issuer)) {
      return 'AI_EVIDENCE';
    }
    
    // Check certificate subject/issuer
    if (containsAIToolPattern(signals.c2pa.summary?.certificate?.subject)) {
      return 'AI_EVIDENCE';
    }
    if (containsAIToolPattern(signals.c2pa.summary?.certificate?.issuer)) {
      return 'AI_EVIDENCE';
    }
    
    // Check actions for AI-related terms
    if (signals.c2pa.summary?.actions) {
      for (const action of signals.c2pa.summary.actions) {
        if (action.includes('c2pa.created') || action.includes('generated')) {
          // Check if we have AI tool in claim generator/issuer
          if (containsAIToolPattern(signals.c2pa.summary?.claimGenerator) ||
              containsAIToolPattern(signals.c2pa.summary?.issuer)) {
            return 'AI_EVIDENCE';
          }
        }
      }
    }
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
    if (containsAIToolPattern(sw)) {
      return 'AI_EVIDENCE';
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
    // C2PA with valid signature is strong provenance evidence
    if (signals.c2pa.present && signals.c2pa.validated === 'valid') {
      return 'high';
    }
    if (signals.metadata.found || signals.pngText.found) {
      return 'medium';
    }
    return 'low';
  }

  // AI_EVIDENCE verdict
  let score = 0;

  // C2PA with AI tool as claim generator/issuer is strong evidence
  if (signals.c2pa.present) {
    if (containsAIToolPattern(signals.c2pa.summary?.claimGenerator) ||
        containsAIToolPattern(signals.c2pa.summary?.issuer)) {
      score += 4;
    }
    
    // AI assertions are very strong evidence
    if (signals.c2pa.summary?.aiAssertions?.length) {
      score += 3;
    }
    
    // Validated signature increases confidence
    if (signals.c2pa.validated === 'valid') {
      score += 2;
    }
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
  if (signals.c2pa.present) {
    notes.push('Content Credentials (C2PA) found in image');
    
    // Validation status - note that "invalid" in c2pa-web often means untrusted, not crypto failure
    if (signals.c2pa.validated === 'valid') {
      notes.push('Signature cryptographically verified');
    } else if (signals.c2pa.validated === 'invalid') {
      // Check if it's an untrusted issuer vs actual crypto failure
      if (signals.c2pa.trust === 'untrusted' || signals.c2pa.trust === 'unknown') {
        notes.push('Signature valid but issuer not in trust list');
      } else {
        notes.push('Signature verification failed');
      }
    }
    
    if (signals.c2pa.trust === 'trusted') {
      notes.push('Issuer is in local trust list');
    } else if (signals.c2pa.trust === 'untrusted') {
      notes.push('Issuer is NOT in local trust list');
    }
    
    if (signals.c2pa.summary?.claimGenerator) {
      notes.push(`Claim Generator: ${signals.c2pa.summary.claimGenerator}`);
    }
    if (signals.c2pa.summary?.issuer) {
      notes.push(`Signed by: ${signals.c2pa.summary.issuer}`);
    }
    if (signals.c2pa.summary?.certificate?.subject) {
      notes.push(`Certificate: ${signals.c2pa.summary.certificate.subject}`);
    }
    if (signals.c2pa.summary?.aiAssertions?.length) {
      notes.push(`AI Assertions: ${signals.c2pa.summary.aiAssertions.join(', ')}`);
    }
    if (signals.c2pa.summary?.actions?.length) {
      notes.push(`Actions: ${signals.c2pa.summary.actions.join(', ')}`);
    }
  } else if (signals.c2pa.available) {
    notes.push('No Content Credentials (C2PA) found');
  }
  
  if (signals.c2pa.errors && signals.c2pa.errors.length > 0) {
    notes.push(...signals.c2pa.errors);
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
      'Evidence suggests this image was created or modified by AI tools'
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
      c2pa: { 
        available: false, 
        present: false, 
        validated: 'unknown',
        trust: 'unknown',
        errors: [error] 
      },
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
