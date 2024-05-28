import { EntryMetadata, MarkdownEntry } from '../engine';
import { NgDocActionOutput } from '../interfaces';

export type NgDocAction<T> = (entry: EntryMetadata<MarkdownEntry>) => NgDocActionOutput<T>;
