import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

// The internal notes folder is not part of the published repository, so product, test and CI code
// must neither read from it nor write into it: a harness that does passes only where the folder
// happens to exist. Spelled in pieces so this file does not match itself.
const INTERNAL = 'docs architecture'.split(' ');
const REFERENCE = new RegExp(`${INTERNAL[0]}(?:[\\\\/]|['"\`],\\s*['"\`])${INTERNAL[1]}`);
const SCOPES = ['libs', 'tools', '.github'];
const repository = path.resolve(fileURLToPath(new URL('../../..', import.meta.url)));

test('the pattern matches joined and separate path segments only', () => {
  const name = INTERNAL.join('/');
  for (const text of [
    `'${name}/evidence'`,
    `"${INTERNAL.join('\\')}"`,
    `path.join(root, '${INTERNAL[0]}', '${INTERNAL[1]}')`,
    `new URL('../../${name}/x', import.meta.url)`,
  ])
    assert.match(text, REFERENCE, text);
  for (const text of [
    `'${INTERNAL[0]}/api'`,
    `'${INTERNAL[1]}.md'`,
    `${INTERNAL[0]}-${INTERNAL[1]}`,
  ])
    assert.doesNotMatch(text, REFERENCE, text);
});

test('nothing under libs, tools or .github references the internal notes folder', () => {
  const files = execFileSync(
    'git',
    ['ls-files', '-z', '--cached', '--others', '--exclude-standard', '--', ...SCOPES],
    { cwd: repository, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  )
    .split('\0')
    .filter(Boolean);
  assert.ok(files.length > 100, `Expected the tracked sources, found ${files.length} files`);
  const offenders = [];
  for (const file of files) {
    const absolute = path.join(repository, file);
    // A file deleted in the working tree is still listed until the deletion is staged.
    if (!existsSync(absolute)) continue;
    readFileSync(absolute, 'utf8')
      .split('\n')
      .forEach((line, index) => {
        if (REFERENCE.test(line)) offenders.push(`${file}:${index + 1}: ${line.trim()}`);
      });
  }
  assert.deepEqual(
    offenders,
    [],
    'Write results under tmp/ and keep reference fixtures in the harness',
  );
});
