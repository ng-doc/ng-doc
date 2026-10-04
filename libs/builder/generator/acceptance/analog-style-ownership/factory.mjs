import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { prepareAnalogCopy } from './prepare-copy.mjs';

const repository = path.resolve(import.meta.dirname, '../../../../..');
const destination = path.join(import.meta.dirname, '.runtime/analog-full-reset');

export const provenance = await prepareAnalogCopy({
  packageRoot: path.join(repository, 'node_modules/@analogjs/vite-plugin-angular'),
  destination,
  mode: 'full-reset',
});

export default (await import(pathToFileURL(path.join(destination, 'src/index.js')).href)).default;
