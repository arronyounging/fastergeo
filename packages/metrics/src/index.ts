export type {
  Market, Sample, BrandConfig, RecognitionVerdict, RecognitionResult,
  RecognitionJudge, PlatformMetrics, MetricsReport,
  SentimentVerdict, SentimentResult, SentimentJudge,
} from './types.js';
export { classifySentiment, makeSentimentJudge } from './sentiment.js';
export { wilsonInterval } from './stats.js';
export { analyzeCitationSources } from './sources.js';
export { suggestAliases } from './aliases.js';
export type { AliasCandidate } from './aliases.js';
export type { CitationSource } from './sources.js';
export type { Interval } from './stats.js';
export { firstMentionIndex, mentions, brandRank, matchRanges } from './matching.js';
export type { MatchRange } from './matching.js';
export { classifyRecognition, makeLlmJudge } from './recognition.js';
export { computeMetrics } from './compute.js';
export type { ComputeOptions } from './compute.js';
export { parseGeoLookSamples } from './geolook.js';
export {
  renderSampleSheet, parseSampleSheet, enrichWithQuestionBank,
} from './sheet.js';
export type { SheetQuestion, SheetEngine, SheetImport } from './sheet.js';
