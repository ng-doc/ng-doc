import assert from 'node:assert/strict';
import test from 'node:test';

import { COMMANDS } from '../check-builder-modernization.mjs';
import {
  checkWorkflow,
  expandMatrix,
  gateProblems,
  generatorJobProblems,
  mergeJobProblems,
  runsProjectSpecs,
  stepProblems,
  testJobProblems,
} from '../check-ci-jobs.mjs';

const core = (id, extra = {}) => ({ id, lane: 'core', ...extra });
const posix = (id, extra = {}) => ({ id, lane: 'posix', ...extra });

test('matrix expansion follows GitHub: axes, then exclude, then include', () => {
  const combinations = expandMatrix({
    os: ['ubuntu-latest', 'windows-latest'],
    group: ['a', 'p'],
    exclude: [{ os: 'windows-latest', group: 'p' }],
    include: [
      { group: 'p', lane: 'posix' },
      { os: 'macos-latest', group: 'extra' },
    ],
  });
  assert.deepEqual(combinations, [
    { os: 'ubuntu-latest', group: 'a' },
    { os: 'ubuntu-latest', group: 'p', lane: 'posix' },
    { os: 'windows-latest', group: 'a' },
    // Changes an original axis value of every combination, so it becomes its own.
    { os: 'macos-latest', group: 'extra' },
  ]);
  assert.deepEqual(expandMatrix({ include: [{ target: 'x' }] }), [{ target: 'x' }]);
});

test('generator jobs: every group on Linux, core groups on Windows, in their lanes', () => {
  const commands = [core('a'), posix('p')];
  const complete = [
    { os: 'ubuntu-latest', group: 'a' },
    { os: 'ubuntu-latest', group: 'p', lane: 'posix' },
    { os: 'windows-latest', group: 'a', coverage: 'off' },
  ];
  assert.deepEqual(generatorJobProblems(complete, commands), []);
  assert.deepEqual(generatorJobProblems(complete.slice(1), commands), [
    'no generator job for runner group: ubuntu-latest a',
  ]);
  assert.deepEqual(
    generatorJobProblems(
      [...complete.slice(0, 1), { os: 'ubuntu-latest', group: 'p' }, complete[2]],
      commands,
    ),
    ['generator job ubuntu-latest p runs the core lane; the group is posix'],
  );
  assert.deepEqual(
    generatorJobProblems(
      [...complete, { os: 'windows-latest', group: 'p', lane: 'posix', coverage: 'off' }],
      commands,
    ),
    ['generator job without a runner group on its OS: windows-latest p'],
  );
  assert.deepEqual(generatorJobProblems([...complete, complete[0]], commands), [
    'duplicate generator job: ubuntu-latest a',
  ]);
});

test('generator jobs: Linux measures coverage and Windows runs the tests without it', () => {
  const commands = [core('a')];
  assert.deepEqual(
    generatorJobProblems(
      [
        { os: 'ubuntu-latest', group: 'a', coverage: 'off' },
        { os: 'windows-latest', group: 'a' },
      ],
      commands,
    ),
    [
      'generator job ubuntu-latest a does not measure coverage; Linux gates it',
      'generator job windows-latest a measures coverage; Windows runs without it',
    ],
  );
});

test('generator jobs: a sharded group runs as exactly its shards on every OS', () => {
  const commands = [core('a', { shards: 3 }), posix('p', { shards: 2 })];
  const shards = (os, group, count, extra = {}) =>
    Array.from({ length: count }, (_, index) => ({
      os,
      group,
      shard: index + 1,
      shards: count,
      ...extra,
    }));
  const complete = [
    ...shards('ubuntu-latest', 'a', 3),
    ...shards('windows-latest', 'a', 3, { coverage: 'off' }),
    ...shards('ubuntu-latest', 'p', 2, { lane: 'posix' }),
  ];
  assert.deepEqual(generatorJobProblems(complete, commands), []);
  // A missing shard leaves its files out of every run and of the gate.
  assert.deepEqual(
    generatorJobProblems(
      complete.filter((job) => !(job.os === 'windows-latest' && job.shard === 2)),
      commands,
    ),
    ['no generator job for runner group: windows-latest a 2/3'],
  );
  // A shard count other than the runner's splits the files differently.
  assert.deepEqual(
    generatorJobProblems(
      [
        ...complete.filter((job) => job.group !== 'p'),
        ...shards('ubuntu-latest', 'p', 3, { lane: 'posix' }),
      ],
      commands,
    ),
    [
      'no generator job for runner group: ubuntu-latest p 1/2',
      'no generator job for runner group: ubuntu-latest p 2/2',
      'generator job without a runner group on its OS: ubuntu-latest p 1/3',
      'generator job without a runner group on its OS: ubuntu-latest p 2/3',
      'generator job without a runner group on its OS: ubuntu-latest p 3/3',
    ],
  );
  // An unsharded job of a sharded group, and a shard of an unsharded group.
  assert.deepEqual(
    generatorJobProblems([...complete, { os: 'ubuntu-latest', group: 'a' }], commands),
    ['generator job without a runner group on its OS: ubuntu-latest a'],
  );
  assert.deepEqual(
    generatorJobProblems(
      [
        { os: 'ubuntu-latest', group: 'b', shard: 1, shards: 1 },
        { os: 'windows-latest', group: 'b', coverage: 'off' },
      ],
      [core('b')],
    ),
    [
      'no generator job for runner group: ubuntu-latest b',
      'generator job without a runner group on its OS: ubuntu-latest b 1/1',
    ],
  );
});

test('coverage merge jobs: one per sharded group, in its lane, and nothing else', () => {
  const commands = [core('a', { shards: 3 }), posix('p', { shards: 2 }), core('u')];
  const complete = [{ group: 'a' }, { group: 'p', lane: 'posix' }];
  assert.deepEqual(mergeJobProblems(complete, commands), []);
  assert.deepEqual(mergeJobProblems(complete.slice(1), commands), [
    'no coverage merge job for sharded group: a',
  ]);
  assert.deepEqual(mergeJobProblems([complete[0], { group: 'p' }], commands), [
    'coverage merge job p runs the core lane; the group is posix',
  ]);
  assert.deepEqual(mergeJobProblems([...complete, { group: 'u' }, complete[0]], commands), [
    'duplicate coverage merge job: a',
    'coverage merge job for an unsharded group: u',
  ]);
});

test('the steps pass the lane, the coverage switch and the shard, and the merge waits for the shards', () => {
  const coverage = "${{ matrix.coverage == 'off' && '--no-coverage' || '' }}";
  const lane = "--lane ${{ matrix.lane || 'core' }}";
  const jobs = {
    generator: { steps: [{ run: `node runner ${lane} --group g ${coverage} --log-dir x` }] },
    'generator-shard': {
      steps: [
        { uses: 'actions/checkout' },
        {
          run: `node runner ${lane} --shard \${{ matrix.shard }}/\${{ matrix.shards }} ${coverage}`,
        },
      ],
    },
    'generator-coverage': {
      needs: ['build', 'generator-shard'],
      steps: [{ run: `node runner ${lane} --merge-coverage blobs` }],
    },
  };
  assert.deepEqual(stepProblems(jobs), []);
  assert.deepEqual(
    stepProblems({
      generator: { steps: [{ run: 'node runner --group g' }] },
      'generator-shard': { steps: [{ run: `node runner ${coverage}` }] },
      'generator-coverage': { needs: 'build', steps: [{ run: 'node runner' }] },
    }),
    [
      'generator does not pass the matrix lane to the runner',
      'generator-shard does not pass the matrix lane to the runner',
      'generator-coverage does not pass the matrix lane to the runner',
      'generator does not pass the matrix coverage switch to the runner',
      'generator-shard does not pass its shard to the runner',
      'generator-coverage does not wait for generator-shard',
      'generator-coverage does not merge the shard coverage',
    ],
  );
  assert.deepEqual(stepProblems({}).length, 8);
});

test('a posix group sharded into fewer shards than the axis: Linux only, in the posix lane', () => {
  const commands = [core('a', { shards: 4 }), posix('p', { shards: 3 })];
  const matrix = {
    os: ['ubuntu-latest', 'windows-latest'],
    group: ['a', 'p'],
    shard: [1, 2, 3, 4],
    exclude: [
      { os: 'windows-latest', group: 'p' },
      { group: 'p', shard: 4 },
    ],
    include: [
      { group: 'a', shards: 4 },
      { group: 'p', shards: 3, lane: 'posix' },
      { os: 'windows-latest', coverage: 'off' },
    ],
  };
  assert.deepEqual(generatorJobProblems(expandMatrix(matrix), commands), []);
  // Without an exclude, a Windows shard or a fourth shard of the posix group runs.
  assert.deepEqual(
    generatorJobProblems(expandMatrix({ ...matrix, exclude: matrix.exclude.slice(1) }), commands),
    [1, 2, 3].map(
      (shard) => `generator job without a runner group on its OS: windows-latest p ${shard}/3`,
    ),
  );
  assert.deepEqual(
    generatorJobProblems(
      expandMatrix({ ...matrix, exclude: matrix.exclude.slice(0, 1) }),
      commands,
    ),
    ['generator job without a runner group on its OS: ubuntu-latest p 4/3'],
  );
  // Without its lane, the posix shards would run the core lane, which refuses the group.
  assert.deepEqual(
    generatorJobProblems(
      expandMatrix({
        ...matrix,
        include: matrix.include.map((entry) =>
          entry.group === 'p' ? { group: 'p', shards: 3 } : entry,
        ),
      }),
      commands,
    ),
    [1, 2, 3].map(
      (shard) => `generator job ubuntu-latest p ${shard}/3 runs the core lane; the group is posix`,
    ),
  );
  assert.deepEqual(
    mergeJobProblems(
      expandMatrix({ group: ['a', 'p'], include: [{ group: 'p', lane: 'posix' }] }),
      commands,
    ),
    [],
  );
});

test('test jobs: every test target with specs, and nothing else', () => {
  const projects = [
    {
      name: 'app',
      hasSpecs: true,
      targets: {
        test: { executor: '@angular/build:unit-test' },
        'test-search-index': {
          executor: 'nx:run-commands',
          options: { command: 'vitest run -c libs/app/testing/search-index/vitest.config.ts' },
        },
        lint: {},
      },
    },
    {
      name: 'core',
      hasSpecs: false,
      targets: {
        test: {
          executor: 'nx:run-commands',
          options: { command: 'vitest run --config libs/core/vitest.config.ts' },
        },
      },
    },
  ];
  assert.deepEqual(testJobProblems(['app:test', 'app:test-search-index'], projects), []);
  assert.deepEqual(testJobProblems(['app:test'], projects), [
    'no test job for app:test-search-index',
  ]);
  assert.deepEqual(
    testJobProblems(['app:test', 'app:test-search-index', 'core:test', 'app:lint'], projects),
    [
      'test job for core:test, whose project has no specs',
      'test job for a missing target: app:lint',
    ],
  );
});

test('a spec target is the unit-test builder or a Vitest run of the project config', () => {
  assert.equal(runsProjectSpecs({ executor: '@angular/build:unit-test' }), true);
  const vitest = (command) => ({ executor: 'nx:run-commands', options: { command } });
  assert.equal(runsProjectSpecs(vitest('vitest run --config libs/core/vitest.config.ts')), true);
  assert.equal(
    runsProjectSpecs({
      executor: 'nx:run-commands',
      options: {
        commands: [
          { command: 'tsc -p libs/add/tsconfig.spec.json --noEmit', forwardAllArgs: false },
          'vitest run --config libs/add/vitest.config.ts',
        ],
      },
    }),
    true,
  );
  assert.equal(
    runsProjectSpecs(vitest('vitest run -c libs/app/testing/search-index/vitest.config.ts')),
    false,
  );
  assert.equal(runsProjectSpecs(vitest('node --test tools/scripts/testing/*.test.mjs')), false);
  assert.equal(runsProjectSpecs({ executor: '@nx/eslint:lint' }), false);
});

test('the gate job waits for every other job and runs whatever their outcome', () => {
  const always = '${{ always() }}';
  const jobs = {
    build: {},
    lint: { needs: 'build' },
    unit: { needs: ['build'] },
    'pr-checks-passed': { if: always, needs: ['build', 'lint', 'unit'] },
  };
  assert.deepEqual(gateProblems(jobs), []);
  // A job left out of `needs` would not block a merge.
  assert.deepEqual(
    gateProblems({ ...jobs, 'pr-checks-passed': { if: always, needs: ['build', 'lint'] } }),
    ['pr-checks-passed does not need unit'],
  );
  assert.deepEqual(gateProblems({ ...jobs, 'pr-checks-passed': { if: always, needs: 'build' } }), [
    'pr-checks-passed does not need lint',
    'pr-checks-passed does not need unit',
  ]);
  // Without always(), a failed job skips the gate, and branch protection reads a skip as a pass.
  assert.deepEqual(
    gateProblems({ ...jobs, 'pr-checks-passed': { needs: ['build', 'lint', 'unit'] } }),
    ['pr-checks-passed does not run with if: ${{ always() }}'],
  );
  assert.deepEqual(gateProblems({ build: {}, lint: { needs: 'build' } }), [
    'no pr-checks-passed job',
  ]);
});

test('the committed pull request workflow has a job for every runner group and test target', async () => {
  assert.ok(COMMANDS.length > 0);
  assert.deepEqual(await checkWorkflow(), []);
});
