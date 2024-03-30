import { AsyncFileOutput } from '../../core';
import { DeclarationEntry } from './entry';
import { EntryMetadata } from './entry-metadata';
import { MarkdownEntry } from './markdown-entry';

export interface TemplateBuilderOutput {
  metadata: EntryMetadata<MarkdownEntry | DeclarationEntry>;
  output: AsyncFileOutput;
}
