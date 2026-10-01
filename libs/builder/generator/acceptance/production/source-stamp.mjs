import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstatSync, readdirSync, readFileSync, readlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Which sources a production output was built from, so that the parity gate never compares
// outputs of different trees. Run it right after a build:
//
//   node libs/builder/generator/acceptance/production/source-stamp.mjs dist/apps/ng-doc/browser
//
// It writes `ngdoc-source.json` beside the browser folder: the commit, a digest of the
// uncommitted changes (tracked edits and untracked files) and a digest of the built packages
// that `node_modules/@ng-doc/*` link to (`dist/libs/*`), which the builds load instead of the
// sources. The acceptance harnesses themselves are not build inputs and are left out, so
// updating an accepted set keeps the stamp. Any other local edit, related or not, changes it.
const root = path.resolve(fileURLToPath(new URL('../../../../..', import.meta.url)));
const EXCLUDED = ['libs/builder/generator/acceptance'];
/** The built packages that `node_modules/@ng-doc/*` link to. */
const PACKAGES = ['app', 'builder', 'core', 'keywords-loaders', 'ui-kit', 'utils'];

const git = (...args) => execFileSync('git', args, { cwd: root, maxBuffer: 1 << 30 });

/** The commit and the digest of the uncommitted changes of the checkout. */
export function sourceStamp() {
  const exclude = EXCLUDED.map((item) => `:(exclude)${item}`);
  const hash = createHash('sha256');
  hash.update(git('diff', 'HEAD', '--binary', '--', '.', ...exclude));
  const untracked = git('ls-files', '--others', '--exclude-standard', '-z', '--', '.', ...exclude)
    .toString()
    .split('\0')
    .filter(Boolean)
    .sort();
  for (const file of untracked) {
    hash.update(`\0${file}\0`);
    hash.update(readFileSync(path.join(root, file)));
  }
  return {
    commit: git('rev-parse', 'HEAD').toString().trim(),
    uncommitted: hash.digest('hex'),
    packages: packagesDigest(),
  };
}

/** A digest of the files and links of the built packages, in path order. */
function packagesDigest() {
  const hash = createHash('sha256');
  const walk = (relative) => {
    const absolute = path.join(root, relative);
    const stat = lstatSync(absolute, { throwIfNoEntry: false });
    if (!stat) {
      hash.update(`\0missing\0${relative}\0`);
    } else if (stat.isSymbolicLink()) {
      hash.update(`\0link\0${relative}\0${readlinkSync(absolute)}\0`);
    } else if (stat.isDirectory()) {
      for (const name of readdirSync(absolute).sort()) walk(path.posix.join(relative, name));
    } else {
      hash.update(`\0file\0${relative}\0`);
      hash.update(readFileSync(absolute));
    }
  };
  for (const name of PACKAGES) walk(`dist/libs/${name}`);
  return hash.digest('hex');
}

/** The stamp file of a production output's browser folder. */
export function stampFile(browserFolder) {
  return path.join(path.resolve(root, browserFolder), '..', 'ngdoc-source.json');
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const [browserFolder] = process.argv.slice(2);
  if (!browserFolder) throw new Error('Pass the browser folder of a production output');
  const stamp = { ...sourceStamp(), stampedAt: new Date().toISOString() };
  writeFileSync(stampFile(browserFolder), JSON.stringify(stamp, null, 2) + '\n');
  console.log(JSON.stringify(stamp));
}
