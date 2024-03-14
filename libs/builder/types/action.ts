import { EntryMetadata, MarkdownEntry } from '../engine';
import { NgDocActionOutput } from '../interfaces';

export type NgDocAction = (entry: EntryMetadata<MarkdownEntry>) => NgDocActionOutput;
