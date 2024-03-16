import { AsyncFileOutput } from '../../core';
import { EntryMetadata } from './entry-metadata';
import { MarkdownEntry } from './markdown-entry';

export interface TemplateBuilderOutput {
  metadata: EntryMetadata<MarkdownEntry>;
  output: AsyncFileOutput;
}
