import path from 'node:path';

import { canonicalDrive } from './paths';

const identities = new Map<string, symbol>();
const outputRoots = new Map<string, symbol>();

export interface OutputLease {
  admit(outputRoot: string): void;
  seal(outputRoot: string): void;
  dispose(): void;
}

export function acquireOutputLease(identity: string, defaultOutputRoot: string): OutputLease {
  if (identities.has(identity)) {
    throw new Error(`[NGDOC_VITE_OUTPUT_LEASE] Output owner is already active for ${identity}.`);
  }
  const token = Symbol(identity);
  const initialRoot = canonicalDrive(path.resolve(defaultOutputRoot).replace(/\\/g, '/'));
  if (outputRoots.has(initialRoot)) {
    throw new Error(
      `[NGDOC_VITE_OUTPUT_LEASE] Default output root is already active: ${initialRoot}.`,
    );
  }
  identities.set(identity, token);
  outputRoots.set(initialRoot, token);
  let root = initialRoot;
  let sealed = false;
  let disposed = false;
  return {
    admit(value: string) {
      if (disposed) throw new Error('[NGDOC_VITE_OUTPUT_LEASE] Output lease is disposed.');
      const normalized = canonicalDrive(path.resolve(value).replace(/\\/g, '/'));
      const owner = outputRoots.get(normalized);
      if (owner && owner !== token) {
        throw new Error(
          `[NGDOC_VITE_OUTPUT_LEASE] Published output root is already active: ${normalized}.`,
        );
      }
      if (sealed && root !== normalized) {
        throw new Error(
          `[NGDOC_VITE_RESTART_REQUIRED] Published outputRoot changed from ${root} to ${normalized}.`,
        );
      }
      if (root !== normalized && outputRoots.get(root) === token) outputRoots.delete(root);
      root = normalized;
      outputRoots.set(root, token);
    },
    seal(value: string) {
      this.admit(value);
      sealed = true;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (identities.get(identity) === token) identities.delete(identity);
      if (outputRoots.get(root) === token) outputRoots.delete(root);
    },
  };
}
