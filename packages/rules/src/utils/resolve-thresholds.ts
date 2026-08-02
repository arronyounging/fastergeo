/**
 * Per-content-type threshold resolution
 * Merges base thresholds with optional per-type overrides
 */

import type { ThresholdConfig } from '../config/types.js';
import type { ContentType } from '../types.js';
import { isCjkDominant } from './cjk.js';

/** Resolved thresholds for a specific content type (no byContentType nesting) */
export interface ResolvedThresholds {
  title: { minLength: number; maxLength: number; warnLength: number };
  description: { minLength: number; maxLength: number; warnLength: number };
  slug: { maxLength: number };
  content: { minWordCount: number; minReadabilityScore: number };
}

/**
 * Resolve thresholds for a specific content type.
 * Merges per-type overrides on top of base values.
 *
 * @example
 * resolveThresholds(config.thresholds, 'page')
 * // Returns base thresholds with any page-specific overrides applied
 */
export function resolveThresholds(
  thresholds: ThresholdConfig,
  contentType: ContentType,
): ResolvedThresholds {
  const override = thresholds.byContentType?.[contentType];
  if (!override) {
    return {
      title: thresholds.title,
      description: thresholds.description,
      slug: thresholds.slug,
      content: thresholds.content,
    };
  }

  return {
    title: { ...thresholds.title, ...override.title },
    description: { ...thresholds.description, ...override.description },
    slug: { ...thresholds.slug, ...override.slug },
    content: { ...thresholds.content, ...override.content },
  };
}

/** Length thresholds shape shared by title and description checks. */
export interface LengthThresholds {
  minLength: number;
  maxLength: number;
  warnLength: number;
}

/**
 * CJK title length profile. CJK characters carry ~2-3x the information of
 * Latin characters: Baidu and Google display roughly 28-32 Chinese characters
 * of a title (vs ~60 Latin characters), so Latin thresholds misfire badly on
 * Chinese titles (a perfectly good 25-char Chinese title fails the 30-char
 * Latin minimum).
 */
export const CJK_TITLE_THRESHOLDS: LengthThresholds = {
  minLength: 10,
  maxLength: 32,
  warnLength: 28,
};

/**
 * CJK meta-description profile: Baidu snippets show ~78 Chinese characters,
 * Google zh-serps ~80-90 (vs 160 Latin characters).
 */
export const CJK_DESCRIPTION_THRESHOLDS: LengthThresholds = {
  minLength: 40,
  maxLength: 90,
  warnLength: 78,
};

/**
 * Swap in the CJK length profile when the measured field is CJK-dominant.
 * Called by title/description rules after regular threshold resolution.
 */
export function cjkAwareLengths(
  resolved: LengthThresholds,
  fieldText: string | undefined,
  cjkProfile: LengthThresholds,
): LengthThresholds {
  return fieldText && isCjkDominant(fieldText)
    ? { ...resolved, ...cjkProfile }
    : resolved;
}
