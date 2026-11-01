#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// Checks the inputs of the release workflow before anything is built, and decides where the
// release goes. The version is always given by hand; this script never derives one.
//
// - `main` releases a stable version on the `latest` dist-tag, and a prerelease `X.Y.Z-beta.N`
//   on `beta`. Only a stable release from main deploys ng-doc.com.
// - An `N.x` maintenance branch releases versions of major N on `release-N.x` (a dist-tag must
//   not be a semver range, so it can't be `N.x`), and never moves `latest`.
// - The release notes start at the previous release: the newest released version below this one
//   (stable versions only, for a stable release). It is named here because Nx would otherwise take
//   the newest tag it can reach from the branch, and releases up to 22.1.0 were tagged on a
//   `release` branch that main never contains.

const SEMVER = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;
const BETA = /^beta\.\d+$/;
const MAINTENANCE = /^(\d+)\.x$/;

/** Compares two versions matched by {@link SEMVER} (prerelease identifiers in semver order). */
export function compareVersions(a, b) {
  const [, ...left] = SEMVER.exec(a);
  const [, ...right] = SEMVER.exec(b);
  for (let index = 0; index < 3; index++) {
    const difference = Number(left[index]) - Number(right[index]);
    if (difference) return Math.sign(difference);
  }
  if (!left[3] || !right[3]) return left[3] ? -1 : right[3] ? 1 : 0;
  const x = left[3].split('.');
  const y = right[3].split('.');
  for (let index = 0; index < Math.max(x.length, y.length); index++) {
    if (x[index] === undefined) return -1;
    if (y[index] === undefined) return 1;
    const numeric = /^\d+$/.test(x[index]) && /^\d+$/.test(y[index]);
    const difference = numeric
      ? Number(x[index]) - Number(y[index])
      : x[index].localeCompare(y[index], 'en');
    if (difference) return Math.sign(difference);
  }
  return 0;
}

/**
 * The tag of the release that `version`'s notes start after: the newest released version below
 * `version`, among stable versions for a stable `version`. `undefined` for a first release.
 */
export function previousReleaseTag(version, released) {
  const stable = !SEMVER.exec(version)[4];
  const previous = released
    .filter((value) => (!stable || !SEMVER.exec(value)[4]) && compareVersions(value, version) < 0)
    .sort(compareVersions)
    .at(-1);
  return previous && `v${previous}`;
}

/**
 * The release plan for `version` from `branch`, given the existing tags (`v<version>`): the npm
 * dist-tag, whether to deploy ng-doc.com, and the previous release tag (`from`).
 * Throws with the reason when the release is not allowed.
 */
export function planRelease({ version, branch, refType = 'branch', tags = [] }) {
  if (refType !== 'branch') throw new Error(`Release from a branch, not a ${refType}.`);
  const match = SEMVER.exec(version ?? '');
  if (!match) throw new Error(`"${version}" is not a version such as 22.2.0 or 22.2.0-beta.1.`);
  const prerelease = match[4];
  if (prerelease && !BETA.test(prerelease))
    throw new Error(`Prereleases are beta.N (22.2.0-beta.1), not "${prerelease}".`);
  const released = tags
    .map((tag) => /^v(.+)$/.exec(tag)?.[1])
    .filter((value) => value && SEMVER.test(value));
  if (released.includes(version)) throw new Error(`v${version} is already released.`);

  const maintenance = MAINTENANCE.exec(branch);
  if (maintenance) {
    if (match[1] !== maintenance[1])
      throw new Error(`${branch} releases ${maintenance[1]}.x.y versions, not ${version}.`);
    if (prerelease) throw new Error(`Release prereleases from main, not from ${branch}.`);
    const line = released.filter((value) => SEMVER.exec(value)[1] === match[1]);
    const newest = line.sort(compareVersions).at(-1);
    if (newest && compareVersions(version, newest) <= 0)
      throw new Error(`${version} is not newer than ${newest}, the newest ${branch} release.`);
    return {
      distTag: `release-${branch}`,
      deploy: false,
      from: previousReleaseTag(version, released),
    };
  }
  if (branch !== 'main') throw new Error(`Release from main or an N.x branch, not ${branch}.`);
  const stable = released.filter((value) => !SEMVER.exec(value)[4]).sort(compareVersions);
  const newest = stable.at(-1);
  if (newest && compareVersions(version, newest) <= 0)
    throw new Error(`${version} is not newer than ${newest}, the newest release.`);
  const from = previousReleaseTag(version, released);
  return prerelease
    ? { distTag: 'beta', deploy: false, from }
    : { distTag: 'latest', deploy: true, from };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const tags = execFileSync('git', ['tag', '--list', 'v*'], { encoding: 'utf8' })
    .split('\n')
    .filter(Boolean);
  try {
    const plan = planRelease({
      version: process.env.VERSION,
      branch: process.env.BRANCH,
      refType: process.env.REF_TYPE,
      tags,
    });
    console.error(
      `Release ${process.env.VERSION} from ${process.env.BRANCH}: dist-tag ${plan.distTag}, ` +
        `deploy ng-doc.com: ${plan.deploy ? 'yes' : 'no'}, ` +
        `notes since ${plan.from ?? 'no previous release'}.`,
    );
    console.log(`dist-tag=${plan.distTag}`);
    console.log(`deploy=${plan.deploy}`);
    console.log(`from=${plan.from ?? ''}`);
  } catch (error) {
    console.error(`release-plan: ${error.message}`);
    process.exitCode = 1;
  }
}
