import assert from 'node:assert/strict';
import test from 'node:test';

import { compareVersions, planRelease } from '../release-plan.mjs';

const TAGS = ['v21.1.1', 'v22.0.0-beta.1', 'v22.0.0-beta.2', 'v22.0.0', 'v22.1.0', 'other'];

test('versions compare in semver order, prereleases before their release', () => {
  const ordered = [
    '21.1.1',
    '22.0.0-beta.1',
    '22.0.0-beta.2',
    '22.0.0-beta.10',
    '22.0.0',
    '22.1.0',
    '22.10.0',
  ];
  for (let index = 1; index < ordered.length; index++) {
    assert.equal(compareVersions(ordered[index - 1], ordered[index]), -1, ordered[index]);
    assert.equal(compareVersions(ordered[index], ordered[index - 1]), 1, ordered[index]);
  }
  assert.equal(compareVersions('22.1.0', '22.1.0'), 0);
});

test('main releases a stable version on latest and deploys the site', () => {
  assert.deepEqual(planRelease({ version: '22.2.0', branch: 'main', tags: TAGS }), {
    distTag: 'latest',
    deploy: true,
  });
});

test('main releases a beta on the beta dist-tag without deploying', () => {
  assert.deepEqual(planRelease({ version: '22.2.0-beta.1', branch: 'main', tags: TAGS }), {
    distTag: 'beta',
    deploy: false,
  });
  assert.throws(
    () => planRelease({ version: '22.2.0-rc.1', branch: 'main', tags: TAGS }),
    /Prereleases are beta\.N/,
  );
});

test('a maintenance branch releases its own major on release-N.x', () => {
  assert.deepEqual(planRelease({ version: '21.1.2', branch: '21.x', tags: TAGS }), {
    distTag: 'release-21.x',
    deploy: false,
  });
  assert.throws(
    () => planRelease({ version: '22.1.1', branch: '21.x', tags: TAGS }),
    /21\.x releases 21\.x\.y versions/,
  );
  assert.throws(
    () => planRelease({ version: '21.1.1', branch: '21.x', tags: TAGS }),
    /already released/,
  );
  assert.throws(
    () => planRelease({ version: '21.1.0', branch: '21.x', tags: TAGS }),
    /not newer than 21\.1\.1/,
  );
  assert.throws(
    () => planRelease({ version: '21.2.0-beta.1', branch: '21.x', tags: TAGS }),
    /prereleases from main/,
  );
});

test('anything else is refused with the reason', () => {
  for (const [input, reason] of [
    [{ version: '22.2', branch: 'main' }, /not a version/],
    [{ version: 'v22.2.0', branch: 'main' }, /not a version/],
    [{ version: '22.2.0', branch: 'release' }, /main or an N\.x branch/],
    [{ version: '22.2.0', branch: 'v22.2.0', refType: 'tag' }, /not a tag/],
    [{ version: '22.1.0', branch: 'main' }, /already released/],
    [{ version: '22.0.5', branch: 'main' }, /not newer than 22\.1\.0/],
  ])
    assert.throws(() => planRelease({ tags: TAGS, ...input }), reason, JSON.stringify(input));
});
