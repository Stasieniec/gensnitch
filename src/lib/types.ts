/**
 * GenSnitch Type Definitions
 */

export type TrustLevel = 'trusted' | 'untrusted' | 'unknown';
export type ValidationStatus = 'valid' | 'invalid' | 'unknown';

export interface C2PAResult {
  /** Whether C2PA analysis was performed (WASM loaded successfully) */
  available: boolean;
  /** Whether C2PA manifest was found in the image */
  present: boolean;
  /** Whether the cryptographic signature is valid */
  validated: ValidationStatus;
  /** Trust level based on local trust list */
  trust: TrustLevel;
  /** Human-readable summary */
  summary?: {
    /** Claim generator (tool that created the manifest) */
    claimGenerator?: string;
    /** Signature issuer */
    issuer?: string;
    /** Certificate info */
    certificate?: {
      subject?: string;
      issuer?: string;
      serialNumber?: string;
    };
    /** Actions recorded in the manifest */
    actions?: string[];
    /** AI-related assertions found */
    aiAssertions?: string[];
    /** Ingredients (source materials) */
    ingredients?: string[];
  };
  /** Raw manifest data for details panel */
  raw?: Record<string, unknown>;
  /** Errors or warnings */
  errors?: string[];
}

export interface MetadataResult {
  found: boolean;
  software?: string;
  artist?: string;
  make?: string;
  model?: string;
  creatorTool?: string;
  aiIndicators: string[];
  rawFields?: Record<string, unknown>;
}

export interface PngTextResult {
  found: boolean;
  chunks: Array<{
    key: string;
    value: string;
    truncated: boolean;
  }>;
  aiIndicators: string[];
}

export interface AnalysisSignals {
  c2pa: C2PAResult;
  metadata: MetadataResult;
  pngText: PngTextResult;
}

export type Verdict = 'AI_EVIDENCE' | 'NO_EVIDENCE' | 'ERROR';
export type Confidence = 'low' | 'medium' | 'high';

export interface Report {
  id: string;
  url: string;
  timestamp: number;
  verdict: Verdict;
  confidence: Confidence;
  signals: AnalysisSignals;
  notes: string[];
  version: string;
}

export interface StoredReport {
  report: Report;
  key: string;
}

/** Input for C2PA analyzer */
export interface C2PAInput {
  bytes: Uint8Array;
  mimeType?: string;
  url?: string;
}
