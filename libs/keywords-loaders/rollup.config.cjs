// Built with `rollup -c` instead of the deprecated `@nx/rollup:rollup` executor. The options are
// the executor's former options, and `withNx` builds the same Rollup configuration from them.
const { withNx } = require('@nx/rollup/with-nx');

// The executor defaulted this before it built the configuration.
process.env.NODE_ENV ??= 'production';

const config = withNx({
  outputPath: 'dist/libs/keywords-loaders',
  project: 'libs/keywords-loaders/package.json',
  main: 'libs/keywords-loaders/index.ts',
  tsConfig: 'libs/keywords-loaders/tsconfig.lib.json',
  assets: [{ glob: '**/*.md', input: 'libs/keywords-loaders', output: './' }],
  generateExportsField: true,
  babelUpwardRootMode: true,
});

// `dts-bundle` writes an `index.d.ts` that re-exports the entry's declarations, for entries
// below the package root (`src/index.ts`). This entry is at the package root, so TypeScript
// already emits `index.d.ts` there, and the re-export would collide with it.
config.plugins = config.plugins.filter((plugin) => plugin.name !== 'dts-bundle');

module.exports = config;
