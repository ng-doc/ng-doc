import { createHash } from 'node:crypto';
import path from 'node:path';

import type {
  ArtifactSnapshot,
  FileOutput,
  PublishedGeneratorConfiguration,
} from '../../contracts';

export const digest = (value: string): string => createHash('sha256').update(value).digest('hex');

export function configuration(
  root: string,
  overrides: Partial<PublishedGeneratorConfiguration> = {},
): PublishedGeneratorConfiguration {
  return {
    outputRoot: path.resolve(root, 'output').replace(/\\/g, '/'),
    cacheRoot: path.resolve(root, 'cache').replace(/\\/g, '/'),
    assetDirectory: 'assets',
    themes: { light: 'github-light', dark: 'github-dark' },
    digest: 'configuration-one',
    ...overrides,
  };
}

export function snapshot(
  config: PublishedGeneratorConfiguration | undefined,
  value: string = 'generated',
  revision: string = 'revision-one',
): ArtifactSnapshot {
  const output: FileOutput = {
    path: 'content.txt',
    role: 'content',
    encoding: 'utf8',
    content: value,
    digest: digest(value),
  };
  return {
    ...(config ? { configuration: config } : {}),
    projectId: 'project',
    revision,
    artifacts: [
      {
        id: 'artifact',
        identity: { projectId: 'project', entryId: 'entry', role: 'content' },
        revision: `artifact-${revision}`,
        fingerprint: {
          schemaVersion: 4,
          compilerVersion: 'compiler',
          toolchainDigest: 'toolchain',
          configurationDigest: config?.digest ?? 'missing',
          inputDigest: 'input',
          keywordDigest: 'keywords',
        },
        dependencies: [],
        content: [],
        exportedKeywords: [],
        usedKeywords: [],
        searchRecords: [],
        routes: [],
        apiList: [],
        outputs: [output],
        diagnostics: [],
      },
    ],
    globalKeywords: [],
    remoteKeywords: [],
  };
}
