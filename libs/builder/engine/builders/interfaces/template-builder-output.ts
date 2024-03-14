import { AsyncFileOutput } from '../../core';
import { MarkdownEntry } from './entry';
import { EntryMetadata } from './entry-metadata';

export interface TemplateBuilderOutput {
  metadata: EntryMetadata<MarkdownEntry>;
  output: AsyncFileOutput;
}
