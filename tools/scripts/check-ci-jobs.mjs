#!/usr/bin/env node
import { readdir, readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';

import { COMMANDS, ROOT, isMain } from './check-builder-modernization.mjs';

// Guards the one-check-per-job layout of .github/workflows/pr.yml: a runner group or a test
// target that has no job would otherwise never run in CI, and nothing would say so. Branch
// protection requires only the aggregate gate job, so a job the gate does not wait for would not
// block a merge either.

const require = createRequire(import.meta.url);
const WORKFLOW = '.github/workflows/pr.yml';
const SPEC = /\.(spec|test)\.[cm]?[jt]sx?$/;
const GATE = 'pr-checks-passed';

/** Expands a job matrix the way GitHub does: axes, then `exclude`, then `include`. */
export function expandMatrix(matrix = {}) {
  const axes = Object.entries(matrix).filter(([key]) => key !== 'include' && key !== 'exclude');
  let combinations = axes.length ? [{}] : [];
  for (const [key, values] of axes)
    combinations = combinations.flatMap((combination) =>
      values.map((value) => ({ ...combination, [key]: value })),
    );
  const matches = (combination, entry) =>
    Object.entries(entry).every(([key, value]) => combination[key] === value);
  combinations = combinations.filter(
    (combination) => !(matrix.exclude ?? []).some((entry) => matches(combination, entry)),
  );
  const axisKeys = new Set(axes.map(([key]) => key));
  const original = combinations.map((combination) => ({ ...combination }));
  for (const entry of matrix.include ?? []) {
    // An include entry joins every combination whose original axis values it does not change;
    // an entry that joins none becomes a combination of its own.
    const targets = combinations.filter((_, index) =>
      Object.entries(entry).every(
        ([key, value]) => !axisKeys.has(key) || original[index][key] === value,
      ),
    );
    if (targets.length) for (const combination of targets) Object.assign(combination, entry);
    else combinations.push({ ...entry });
  }
  return combinations;
}

const WINDOWS = 'windows-latest';
const LINUX = 'ubuntu-latest';
const jobKey = (os, group, shard) => `${os} ${group}${shard ? ` ${shard}` : ''}`;

/**
 * Every runner group runs on Linux, every core group also on Windows, each in its declared lane
 * (`lane` defaults to core), and no job names a group the runner does not have. A group with
 * `shards` runs as exactly that many shard jobs (`shard` 1..n, `shards` n) per OS and an unsharded
 * group as one job. Linux measures coverage; Windows runs the tests without it (`coverage: 'off'`).
 */
export function generatorJobProblems(combinations, commands = COMMANDS) {
  const expected = new Map();
  for (const command of commands)
    for (const os of command.lane === 'core' ? [LINUX, WINDOWS] : [LINUX])
      for (let index = 1; index <= (command.shards ?? 1); index++)
        expected.set(jobKey(os, command.id, command.shards && `${index}/${command.shards}`), {
          lane: command.lane,
          coverage: os === WINDOWS ? 'off' : undefined,
        });
  const problems = [];
  const actual = new Map();
  for (const combination of combinations) {
    const shard =
      combination.shard !== undefined || combination.shards !== undefined
        ? `${combination.shard}/${combination.shards}`
        : undefined;
    const key = jobKey(combination.os, combination.group, shard);
    if (actual.has(key)) problems.push(`duplicate generator job: ${key}`);
    actual.set(key, { lane: combination.lane ?? 'core', coverage: combination.coverage });
  }
  for (const [key, { lane, coverage }] of expected) {
    const job = actual.get(key);
    if (!job) problems.push(`no generator job for runner group: ${key}`);
    else {
      if (job.lane !== lane)
        problems.push(`generator job ${key} runs the ${job.lane} lane; the group is ${lane}`);
      if (job.coverage !== coverage)
        problems.push(
          coverage === 'off'
            ? `generator job ${key} measures coverage; Windows runs without it`
            : `generator job ${key} does not measure coverage; Linux gates it`,
        );
    }
  }
  for (const key of actual.keys())
    if (!expected.has(key)) problems.push(`generator job without a runner group on its OS: ${key}`);
  return problems;
}

/** Every sharded group has exactly one merge job, in its lane, and nothing else does. */
export function mergeJobProblems(combinations, commands = COMMANDS) {
  const expected = new Map(
    commands.filter((command) => command.shards).map((command) => [command.id, command.lane]),
  );
  const problems = [];
  const actual = new Map();
  for (const combination of combinations) {
    if (actual.has(combination.group))
      problems.push(`duplicate coverage merge job: ${combination.group}`);
    actual.set(combination.group, combination.lane ?? 'core');
  }
  for (const [group, lane] of expected) {
    if (!actual.has(group)) problems.push(`no coverage merge job for sharded group: ${group}`);
    else if (actual.get(group) !== lane)
      problems.push(
        `coverage merge job ${group} runs the ${actual.get(group)} lane; the group is ${lane}`,
      );
  }
  for (const group of actual.keys())
    if (!expected.has(group)) problems.push(`coverage merge job for an unsharded group: ${group}`);
  return problems;
}

/**
 * The steps that pass the matrix to the runner: every generator, shard and merge job passes its
 * lane (a sharded posix group runs its shards and its merge in the posix lane), every generator
 * job its coverage switch, a shard job its shard, and the merge job waits for the shards and
 * merges what they uploaded.
 */
export function stepProblems(jobs) {
  const runs = (job) => (job?.steps ?? []).map((step) => step.run ?? '').join('\n');
  const problems = [];
  for (const name of ['generator', 'generator-shard', 'generator-coverage'])
    if (!runs(jobs[name]).includes("--lane ${{ matrix.lane || 'core' }}"))
      problems.push(`${name} does not pass the matrix lane to the runner`);
  for (const name of ['generator', 'generator-shard'])
    if (!runs(jobs[name]).includes("${{ matrix.coverage == 'off' && '--no-coverage' || '' }}"))
      problems.push(`${name} does not pass the matrix coverage switch to the runner`);
  if (!runs(jobs['generator-shard']).includes('--shard ${{ matrix.shard }}/${{ matrix.shards }}'))
    problems.push('generator-shard does not pass its shard to the runner');
  const needs = [jobs['generator-coverage']?.needs ?? []].flat();
  if (!needs.includes('generator-shard'))
    problems.push('generator-coverage does not wait for generator-shard');
  if (!runs(jobs['generator-coverage']).includes('--merge-coverage'))
    problems.push('generator-coverage does not merge the shard coverage');
  return problems;
}

/**
 * The gate job exists, waits for every other job, and runs whatever their outcome: a gate that
 * is skipped after a failure would report as passing to branch protection.
 */
export function gateProblems(jobs) {
  const gate = jobs[GATE];
  if (!gate) return [`no ${GATE} job`];
  const needs = [gate.needs ?? []].flat();
  const problems = Object.keys(jobs)
    .filter((id) => id !== GATE && !needs.includes(id))
    .map((id) => `${GATE} does not need ${id}`);
  if (gate.if !== '${{ always() }}')
    problems.push(`${GATE} does not run with if: \${{ always() }}`);
  return problems;
}

/**
 * Whether a target runs the project's own specs with Vitest: the Angular unit-test builder, or a
 * command that runs `vitest run --config <project>/vitest.config.ts`. Such a target has nothing to
 * run in a project without specs.
 */
export function runsProjectSpecs(target) {
  if (target.executor === '@angular/build:unit-test') return true;
  if (target.executor !== 'nx:run-commands') return false;
  const commands = [target.options?.command, ...(target.options?.commands ?? [])]
    .map((command) => (typeof command === 'string' ? command : command?.command))
    .filter(Boolean);
  return commands.some((command) => /^vitest run --config \S+\/vitest\.config\.ts\b/.test(command));
}

/**
 * Every test target (`test*`) needs a job, except a target that runs the specs of a project
 * without specs; every job must name an existing test target.
 */
export function testJobProblems(jobTargets, projects) {
  const problems = [];
  const required = new Set();
  const existing = new Set();
  for (const project of projects)
    for (const [name, target] of Object.entries(project.targets)) {
      if (!name.startsWith('test')) continue;
      const id = `${project.name}:${name}`;
      existing.add(id);
      if (!runsProjectSpecs(target) || project.hasSpecs) required.add(id);
    }
  for (const id of required) if (!jobTargets.includes(id)) problems.push(`no test job for ${id}`);
  for (const id of jobTargets)
    if (!existing.has(id)) problems.push(`test job for a missing target: ${id}`);
    else if (!required.has(id)) problems.push(`test job for ${id}, whose project has no specs`);
  return problems;
}

async function hasSpecs(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name === 'node_modules') continue;
    const file = path.join(directory, entry.name);
    if (entry.isDirectory() ? await hasSpecs(file) : SPEC.test(entry.name)) return true;
  }
  return false;
}

/** The Nx projects under apps/ and libs/, with their targets and whether they contain specs. */
export async function readProjects(root = ROOT) {
  const projects = [];
  for (const parent of ['apps', 'libs'])
    for (const entry of await readdir(path.join(root, parent), {
      withFileTypes: true,
    })) {
      const directory = path.join(root, parent, entry.name);
      let json;
      try {
        json = JSON.parse(await readFile(path.join(directory, 'project.json'), 'utf8'));
      } catch (error) {
        if (error.code === 'ENOENT' || error.code === 'ENOTDIR') continue;
        throw error;
      }
      projects.push({
        name: json.name,
        targets: json.targets ?? {},
        hasSpecs: await hasSpecs(directory),
      });
    }
  return projects;
}

export async function checkWorkflow(root = ROOT) {
  const { parse } = require('yaml');
  const workflow = parse(await readFile(path.join(root, WORKFLOW), 'utf8'));
  const { jobs } = workflow;
  return [
    ...generatorJobProblems([
      ...expandMatrix(jobs.generator.strategy.matrix),
      ...expandMatrix(jobs['generator-shard']?.strategy.matrix),
    ]),
    ...mergeJobProblems(expandMatrix(jobs['generator-coverage']?.strategy.matrix)),
    ...stepProblems(jobs),
    ...testJobProblems(jobs.unit.strategy.matrix.target, await readProjects(root)),
    ...gateProblems(jobs),
  ];
}

if (await isMain(import.meta.url)) {
  const problems = await checkWorkflow();
  for (const problem of problems) console.error(`check-ci-jobs: ${problem}`);
  if (!problems.length)
    console.log(
      `check-ci-jobs: ${WORKFLOW} has a job for every runner group and test target, and ${GATE} needs every job`,
    );
  process.exitCode = problems.length ? 1 : 0;
}
