import nx from '@nx/eslint-plugin';
import prettier from 'eslint-config-prettier';
import jsdoc from 'eslint-plugin-jsdoc';
import preferArrow from 'eslint-plugin-prefer-arrow';
import simpleImportSort from 'eslint-plugin-simple-import-sort';

export default [
  {
    ignores: ['**/__mocks__/**'],
  },
  ...nx.configs['flat/base'],
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
    ignores: ['**/__mocks__/**'],
    plugins: {
      jsdoc,
      'prefer-arrow': preferArrow,
      'simple-import-sort': simpleImportSort,
    },
    rules: {
      ...prettier.rules,
      ...jsdoc.configs['flat/recommended'].rules,
      'jsdoc/require-param-type': 'off',
      'jsdoc/require-returns-type': 'off',
      'jsdoc/require-returns': 'off',
      'simple-import-sort/imports': 'error',
      'simple-import-sort/exports': 'error',
      '@nx/enforce-module-boundaries': [
        'error',
        {
          enforceBuildableLibDependency: true,
          allowCircularSelfDependency: true,
          allow: [],
          depConstraints: [
            {
              sourceTag: 'type:app',
              onlyDependOnLibsWithTags: ['type:lib'],
            },
            {
              sourceTag: 'lib:app',
              onlyDependOnLibsWithTags: ['lib:builder', 'lib:ui-kit', 'lib:core'],
            },
            {
              sourceTag: 'lib:builder',
              onlyDependOnLibsWithTags: ['lib:core', 'lib:utils'],
            },
            {
              sourceTag: 'lib:ui-kit',
              onlyDependOnLibsWithTags: ['lib:core'],
            },
            {
              sourceTag: 'lib:utils',
              onlyDependOnLibsWithTags: ['lib:core'],
            },
            {
              sourceTag: 'lib:keywords-loaders',
              onlyDependOnLibsWithTags: ['lib:core'],
            },
          ],
        },
      ],
      'prefer-const': [
        'error',
        {
          destructuring: 'any',
        },
      ],
    },
  },
  ...nx.configs['flat/typescript'],
  {
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      // Newly enabled by the typescript-eslint v8 preset; these were not enforced before the upgrade.
      '@typescript-eslint/no-empty-object-type': 'off',
      '@typescript-eslint/no-unused-expressions': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-empty-function': 'off',
      '@typescript-eslint/typedef': [
        'error',
        {
          arrowParameter: false,
          memberVariableDeclaration: false,
          objectDestructuring: false,
          parameter: true,
          propertyDeclaration: true,
          variableDeclaration: false,
          variableDeclarationIgnoreFunction: true,
        },
      ],
      '@typescript-eslint/consistent-type-definitions': ['error', 'interface'],
      '@typescript-eslint/array-type': [
        'error',
        {
          default: 'array-simple',
        },
      ],
      '@typescript-eslint/explicit-member-accessibility': [
        'error',
        {
          accessibility: 'no-public',
          overrides: {
            constructors: 'off',
          },
        },
      ],
      '@typescript-eslint/no-inferrable-types': 'off',
    },
  },
  ...nx.configs['flat/javascript'],
  {
    files: ['**/*.js', '**/*.jsx'],
    // Override or add rules here
    rules: {},
    ignores: ['**/__mocks__/**'],
  },
  {
    files: ['**/*.spec.ts'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
    ignores: ['**/__mocks__/**'],
  },
];
