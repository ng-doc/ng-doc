import { describe, expect, it } from 'vitest';

import { projectWatchInputs } from '../watch-inputs';

describe('current-attempt WatchInputs projection', () => {
  it('projects every filesystem dependency deterministically and keeps empty globs', () => {
    const dependencies = [
      { kind: 'keyword', key: 'api', digest: 'keyword' },
      { kind: 'content', path: '/docs/a.md', digest: 'content' },
      { kind: 'existence', path: '/missing/header.njk', exists: false },
      {
        kind: 'glob',
        root: '/docs',
        include: ['**/*.md'],
        exclude: ['**/draft/**'],
        members: ['/docs/z.md', '/docs/a.md'],
      },
      { kind: 'semantic-reference', scopeId: 'program', digest: 'scope', reason: 'page' },
      {
        kind: 'semantic',
        scopeId: 'program',
        digest: 'scope',
        reason: 'program',
        files: ['/src/b.ts', '/src/a.ts'],
      },
      { kind: 'glob', root: '/missing', include: ['**/*.nunj'], exclude: [], members: [] },
      { kind: 'content', path: '/docs/a.md', digest: 'duplicate' },
    ];
    expect(projectWatchInputs(dependencies)).toEqual({
      files: ['/docs/a.md', '/docs/z.md', '/missing/header.njk', '/src/a.ts', '/src/b.ts'],
      globs: [
        { root: '/docs', include: ['**/*.md'], exclude: ['**/draft/**'] },
        { root: '/missing', include: ['**/*.nunj'], exclude: [] },
      ],
    });
    expect(projectWatchInputs([...dependencies].reverse())).toEqual(
      projectWatchInputs(dependencies),
    );
  });

  it('does not share output arrays with dependency DTOs', () => {
    const dependency = {
      kind: 'glob',
      root: '/docs',
      include: ['**/*.md'],
      exclude: [],
      members: ['/docs/a.md'],
    };
    const result = projectWatchInputs([dependency]);
    result.files.push('/consumer-change');
    result.globs[0].include.push('mutated');
    expect(projectWatchInputs([dependency])).toEqual({
      files: ['/docs/a.md'],
      globs: [{ root: '/docs', include: ['**/*.md'], exclude: [] }],
    });
  });

  it('accepts normalized drive-letter and UNC paths using forward slashes', () => {
    expect(
      projectWatchInputs([
        { kind: 'content', path: 'C:/docs/a.md', digest: 'content' },
        { kind: 'existence', path: '//server/share/missing.njk', exists: false },
        {
          kind: 'glob',
          root: 'C:/docs',
          include: ['**/*.md'],
          exclude: [],
          members: ['C:/docs/a.md'],
        },
        {
          kind: 'semantic',
          scopeId: 'scope',
          digest: 'digest',
          reason: 'program',
          files: ['//server/share/src/a.ts'],
        },
        { kind: 'semantic-reference', scopeId: 'scope', digest: 'digest', reason: 'page' },
      ]),
    ).toEqual({
      files: ['//server/share/missing.njk', '//server/share/src/a.ts', 'C:/docs/a.md'],
      globs: [{ root: 'C:/docs', include: ['**/*.md'], exclude: [] }],
    });
  });

  it('validates the non-physical kinds and never makes them watch inputs', () => {
    expect(
      projectWatchInputs([
        { kind: 'content', path: '/src/a.ts', digest: 'a' },
        { kind: 'semantic-closure', scopeId: 'program', key: 'unit', digest: 'closure' },
        { kind: 'evaluated', entryId: 'site:guide:docs/ng-doc.page.ts', digest: 'value' },
      ]),
    ).toEqual({ files: ['/src/a.ts'], globs: [] });
  });

  it.each([
    ['semantic closure without a key', [{ kind: 'semantic-closure', scopeId: 's', digest: 'd' }]],
    [
      'semantic closure with a path',
      [{ kind: 'semantic-closure', scopeId: 's', key: 'k', digest: 'd', path: '/src/a.ts' }],
    ],
    [
      'semantic closure with a numeric key',
      [{ kind: 'semantic-closure', scopeId: 's', key: 1, digest: 'd' }],
    ],
    ['evaluated digest without an entry', [{ kind: 'evaluated', digest: 'd' }]],
    [
      'evaluated digest with a path',
      [{ kind: 'evaluated', entryId: 'e', digest: 'd', path: '/a' }],
    ],
    ['evaluated digest with a numeric digest', [{ kind: 'evaluated', entryId: 'e', digest: 1 }]],
  ])('rejects a malformed non-physical kind: %s', (_name, dependencies) => {
    expect(() => projectWatchInputs(dependencies)).toThrow(/Invalid|must be/);
  });

  it.each([
    ['content path', 'D:\\a\\docs\\demo.html', { kind: 'content', digest: 'x' }],
    ['existence path', 'd:/a/../demo.html', { kind: 'existence', exists: true }],
  ])('names the refused %s and its value', (name, path, dependency) => {
    expect(() => projectWatchInputs([{ ...dependency, path }])).toThrow(
      `Invalid normalized absolute ${name}: ${JSON.stringify(path)}`,
    );
  });

  it('names a refused glob member and semantic file by their index', () => {
    const glob = { kind: 'glob', root: '/docs', include: [], exclude: [], members: ['/docs/a/'] };
    expect(() => projectWatchInputs([glob])).toThrow(
      'Invalid normalized absolute glob members[0]: "/docs/a/"',
    );
    expect(() =>
      projectWatchInputs([
        { kind: 'semantic', scopeId: 's', digest: 'd', reason: 'r', files: ['//srv'] },
      ]),
    ).toThrow('Invalid normalized absolute semantic files[0]: "//srv"');
  });

  it.each([
    ['unknown dependency', [{ kind: 'other', path: '/docs/a.md' }]],
    ['extra property', [{ kind: 'content', path: '/docs/a.md', digest: 'x', extra: true }]],
    ['relative path', [{ kind: 'content', path: 'docs/a.md', digest: 'x' }]],
    ['dot path', [{ kind: 'existence', path: '/docs/../a.md', exists: true }]],
    ['backslash path', [{ kind: 'content', path: '/docs\\a.md', digest: 'x' }]],
    ['triple-slash UNC path', [{ kind: 'content', path: '///server/share/a.md', digest: 'x' }]],
    ['dot UNC server', [{ kind: 'content', path: '//./share/a.md', digest: 'x' }]],
    ['dot-dot UNC share', [{ kind: 'content', path: '//server/../a.md', digest: 'x' }]],
    ['nul path', [{ kind: 'content', path: '/docs/a\u0000.md', digest: 'x' }]],
    [
      'malformed glob members',
      [{ kind: 'glob', root: '/docs', include: [], exclude: [], members: ['nope'] }],
    ],
    [
      'sparse glob patterns',
      [
        {
          kind: 'glob',
          root: '/docs',
          include: new Array<string>(1),
          exclude: [],
          members: [],
        },
      ],
    ],
    [
      'sparse semantic files',
      [
        {
          kind: 'semantic',
          scopeId: 'scope',
          digest: 'digest',
          reason: 'program',
          files: new Array<string>(1),
        },
      ],
    ],
    [
      'malformed JSON shape',
      JSON.parse('{"kind":"content","path":"/docs/a.md","digest":"x","__proto__":{"x":1}}'),
    ],
    [
      'unclosed semantic reference',
      [{ kind: 'semantic-reference', scopeId: 'scope', digest: 'one', reason: 'page' }],
    ],
    [
      'different semantic digest',
      [
        {
          kind: 'semantic',
          scopeId: 'scope',
          digest: 'one',
          reason: 'program',
          files: ['/src/a.ts'],
        },
        { kind: 'semantic-reference', scopeId: 'scope', digest: 'two', reason: 'page' },
      ],
    ],
  ])('rejects %s', (_name, dependencies) => {
    expect(() => projectWatchInputs(dependencies)).toThrow();
  });
});
