import test from 'node:test';
import assert from 'node:assert/strict';
import { describe, summarize, regression } from '../statistics.mjs';
const sample = (id, value, extra = {}) => ({
  id,
  mode: 'c-d',
  workload: 'guides-100',
  scenario: 'cold',
  lane: 'host',
  machine: 'local',
  sourceDigest: 'source',
  fixtureDigest: 'fixture',
  exitCode: 0,
  invalidations: [],
  correctnessPassed: true,
  cleanupComplete: true,
  exclusiveOwnership: true,
  clockContinuous: true,
  metrics: { foregroundMs: value },
  ...extra,
});
test('known nearest-rank, even median and sample variance', () => {
  const input = [4, 1, 3, 2];
  const stats = describe(input);
  assert.equal(stats.median, 2.5);
  assert.equal(stats.p95, 4);
  assert.equal(stats.medianAbsoluteDeviation, 1);
  assert.equal(stats.sampleStandardDeviation, Math.sqrt(5 / 3));
  assert.deepEqual(input, [4, 1, 3, 2]);
  assert.equal(describe(Array.from({ length: 20 }, (_, i) => i + 1)).p95, 19);
});
test('bad values rejected and zero baseline remains explicit', () => {
  for (const values of [[], [-1], [NaN], [Infinity]]) assert.throws(() => describe(values));
  assert.equal(describe([0]).coefficientOfVariation, null);
  assert.deepEqual(regression(0, 1), { ratio: null, investigationRequired: true });
  assert.equal(regression(100, 110).investigationRequired, false);
  assert.equal(regression(100, 111).investigationRequired, true);
});
test('invalid faster samples retained but cannot improve results', () => {
  const result = summarize([sample('bad', 1, { correctnessPassed: false }), sample('valid', 100)], {
    expectedCount: 2,
    metric: 'foregroundMs',
  });
  assert.equal(result.complete, false);
  assert.equal(result.statistics.median, 100);
  assert.deepEqual(result.rejected, [{ id: 'bad', reasons: ['correctnessPassed'] }]);
});
test('all lifecycle admission gates must pass', () => {
  for (const field of [
    'correctnessPassed',
    'cleanupComplete',
    'exclusiveOwnership',
    'clockContinuous',
  ]) {
    const result = summarize([sample(field, 1, { [field]: undefined })], {
      expectedCount: 1,
      metric: 'foregroundMs',
    });
    assert.equal(result.statistics, null);
    assert.deepEqual(result.rejected[0].reasons, [field]);
  }
});
test('cohorts, duplicates and excess valid trials cannot be pooled', () => {
  for (const field of [
    'mode',
    'workload',
    'scenario',
    'lane',
    'machine',
    'sourceDigest',
    'fixtureDigest',
  ])
    assert.throws(
      () =>
        summarize([sample('a', 1), sample('b', 2, { [field]: 'different' })], {
          expectedCount: 2,
          metric: 'foregroundMs',
        }),
      /Mixed/,
    );
  assert.throws(
    () => summarize([sample('a', 1), sample('a', 2)], { expectedCount: 2, metric: 'foregroundMs' }),
    /duplicate/,
  );
  assert.throws(
    () => summarize([sample('a', 1), sample('b', 2)], { expectedCount: 1, metric: 'foregroundMs' }),
    /preregistered/,
  );
});

test('zero exit and passed product never admit an invalidated sample', () => {
  for (const reason of ['forced-cleanup', 'log-overflow', 'protocol', 'timeout']) {
    const result = summarize([sample(reason, 1, { invalidations: [reason] })], {
      expectedCount: 1,
      metric: 'foregroundMs',
    });
    assert.equal(result.statistics, null);
    assert.equal(result.complete, false);
    assert.deepEqual(result.rejected[0].reasons, [`invalid:${reason}`]);
  }
});
