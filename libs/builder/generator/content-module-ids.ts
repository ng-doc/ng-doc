import type { ContentModule, LinkedContent } from './contracts';
import { sha256Hex } from './kernel/canonical';

/**
 * The public source identity, independent of the payload revision. It and the payload revision
 * are written into generated files, so their formulas stay fixed.
 */
export function contentModuleIdentity(projectId: string, contentId: string): string {
  return sha256Hex(JSON.stringify([projectId, contentId, 'content-module'])).slice(0, 24);
}

/** The payload of one generated content module (`*.content.mjs`). */
export function createContentModule(projectId: string, linked: LinkedContent): ContentModule {
  const id = contentModuleIdentity(projectId, linked.ir.id);
  return {
    schemaVersion: 1,
    id,
    revision: sha256Hex(
      JSON.stringify({ id, html: linked.html, keywordDigest: linked.keywordDigest }),
    ),
    html: linked.html,
  };
}
