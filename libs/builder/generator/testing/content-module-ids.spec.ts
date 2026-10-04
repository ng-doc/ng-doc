import { createHash } from 'node:crypto';
import { expect, it } from 'vitest';

import { contentModuleIdentity, createContentModule } from '../content-module-ids';
import type { LinkedContent } from '../contracts';

it('preserves the public payload identity and revision formulas', () => {
  const linked = {
    ir: { id: 'owner:body' },
    html: '<h1>Привет</h1>',
    keywordDigest: 'bindings',
  } as LinkedContent;
  const payload = createContentModule('project', linked);
  const digest = (value: unknown) =>
    createHash('sha256').update(JSON.stringify(value)).digest('hex');
  expect(payload).toEqual({
    schemaVersion: 1,
    id: digest(['project', 'owner:body', 'content-module']).slice(0, 24),
    html: linked.html,
    revision: digest({ id: payload.id, html: linked.html, keywordDigest: 'bindings' }),
  });
  const changed = createContentModule('project', { ...linked, html: 'new' });
  expect(changed.id).toBe(payload.id);
  expect(changed.revision).not.toBe(payload.revision);
  expect(contentModuleIdentity('another', linked.ir.id)).not.toBe(payload.id);
});
