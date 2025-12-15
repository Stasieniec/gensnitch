/**
 * GenSnitch Type Definitions
 */

export interface C2PAResult {
  available: boolean;
  present: boolean;
  summary?: {
    creator?: string;
    actions?: string[];
    generator?: string;
  };
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

