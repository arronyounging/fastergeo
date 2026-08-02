export type {
  EvidenceGrade, Fact, FactStore, FabricationIssue, OutlineSection, Outline,
} from './types.js';
export { lintFabrication } from './fabrication.js';
export { buildOutline, draftPrompt } from './outline.js';
export {
  bootstrapProject, bootstrapPrompt, validateCompetitor,
} from './bootstrap.js';
export type {
  BootstrapResult, CompetitorCandidate, QuestionSeed, PageText,
} from './bootstrap.js';
