/**
 * Angular API modernization rules for the runtime libraries (`libs/app`, `libs/ui-kit`).
 *
 * They keep the libraries on signal inputs, outputs and queries, `host` metadata and `@Service()`.
 * `libs/app` and `libs/ui-kit` use them as errors, so converted code cannot regress; a library
 * lowers a rule to a warning only for the files named in its own ESLint config, with the reason.
 *
 * `no-uncalled-signals` needs type information, so its block parses the library's sources with
 * the library's `tsconfig.eslint.json`.
 * @param {string} projectRoot - Absolute path of the library (the directory of its ESLint config).
 * @param {'warn' | 'error'} [severity] - Severity of every rule.
 * @returns {import('eslint').Linter.Config[]} Flat config blocks.
 */
export function modernizationRules(projectRoot, severity = 'warn') {
  const sources = ['**/*.ts'];
  const tests = ['**/*.spec.ts', '**/testing/**', '**/vitest*.config.ts', '**/test-setup*.ts'];

  return [
    {
      files: sources,
      ignores: tests,
      rules: {
        '@angular-eslint/prefer-signals': severity,
        '@angular-eslint/prefer-signal-model': severity,
        '@angular-eslint/prefer-output-emitter-ref': severity,
        '@angular-eslint/prefer-host-metadata-property': severity,
        '@angular-eslint/prefer-service-decorator': severity,
      },
    },
    {
      files: sources,
      ignores: tests,
      languageOptions: {
        parserOptions: {
          // The libraries' tsconfig.json files are solution-style (no files of their own), so a
          // lint-only tsconfig lists the sources.
          project: './tsconfig.eslint.json',
          tsconfigRootDir: projectRoot,
        },
      },
      rules: {
        '@angular-eslint/no-uncalled-signals': severity,
      },
    },
    {
      files: ['**/*.html'],
      rules: {
        '@angular-eslint/template/prefer-control-flow': severity,
      },
    },
  ];
}
