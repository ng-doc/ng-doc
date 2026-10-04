import path from 'node:path';

import type { ArtifactSnapshot, PublishedGeneratorConfiguration } from '../contracts';

export function requirePublishedConfiguration(
  snapshot: ArtifactSnapshot,
): PublishedGeneratorConfiguration {
  const value = snapshot.configuration;
  if (!value) throw new Error('[NGDOC_VITE_CONFIGURATION] Candidate has no configuration.');
  if (
    !path.isAbsolute(value.outputRoot) ||
    !path.isAbsolute(value.cacheRoot) ||
    !value.assetDirectory ||
    path.isAbsolute(value.assetDirectory) ||
    value.assetDirectory.split(/[\\/]/).includes('..')
  ) {
    throw new Error('[NGDOC_VITE_CONFIGURATION] Candidate configuration paths are invalid.');
  }
  return value;
}

export function sameRuntimeConfiguration(
  left: PublishedGeneratorConfiguration,
  right: PublishedGeneratorConfiguration,
): boolean {
  return (
    left.outputRoot === right.outputRoot &&
    left.cacheRoot === right.cacheRoot &&
    left.assetDirectory === right.assetDirectory
  );
}
