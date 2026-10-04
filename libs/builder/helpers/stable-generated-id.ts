import { createHash } from 'node:crypto';

/** Stable identifier for a generated role; tuple encoding avoids separator collisions. */
export function stableGeneratedId(project: string, entity: string, role: string): string {
  return createHash('sha256')
    .update(JSON.stringify([project, entity, role]))
    .digest('hex')
    .slice(0, 24);
}
