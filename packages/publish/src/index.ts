/**
 * publishTo — the gated entry point. Content is linted against the fact
 * store BEFORE it goes anywhere; failing content is refused unless force
 * is explicit, and forcing is recorded in the result.
 */

import { lintFabrication } from '@fastergeo/content';
import type { FabricationIssue, FactStore } from '@fastergeo/content';
import {
  publishGithub, publishWebhook, publishWordpress,
} from './connectors.js';
import type { ConnectorOptions } from './connectors.js';
import type { PublishInput, PublishResult, PublishTarget } from './types.js';

export interface PublishOptions extends ConnectorOptions {
  /** Fact store for the fabrication gate. Omit ONLY for content that never
   * makes factual claims; the gate is the point of this package. */
  facts?: FactStore;
  /** Publish even when the gate fails — recorded as gateForced. */
  force?: boolean;
}

export interface GatedPublishResult extends PublishResult {
  gateIssues?: FabricationIssue[];
}

export async function publishTo(
  target: PublishTarget,
  input: PublishInput,
  opts: PublishOptions = {},
): Promise<GatedPublishResult> {
  let gateIssues: FabricationIssue[] = [];
  let gateForced = false;
  if (opts.facts) {
    gateIssues = lintFabrication(input.markdown, opts.facts);
    if (gateIssues.length > 0) {
      if (!opts.force) {
        return {
          ok: false,
          target: target.name,
          error: `fabrication gate: ${gateIssues.length} issue(s) — fix them or pass force (forcing is recorded)`,
          gateIssues,
        };
      }
      gateForced = true;
    }
  }
  const result =
    target.type === 'wordpress' ? await publishWordpress(target, input, opts)
    : target.type === 'github' ? await publishGithub(target, input, opts)
    : await publishWebhook(target, input, opts);
  return { ...result, ...(gateForced ? { gateForced } : {}), ...(gateIssues.length ? { gateIssues } : {}) };
}

export { publishWordpress, publishGithub, publishWebhook } from './connectors.js';
export { markdownToHtml, slugify } from './markdown.js';
export type {
  PublishTarget, WordpressTarget, GithubTarget, WebhookTarget,
  PublishInput, PublishResult, FetchLike,
} from './types.js';
export type { ConnectorOptions } from './connectors.js';
