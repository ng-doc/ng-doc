import { ObservableSet } from '../../classes';
import { NgDocActionOutput } from '../../interfaces';
import { NgDocAction } from '../../types';
import { EntryMetadata, MarkdownEntry } from '../builders';

export abstract class BaseAction {
  constructor(
    protected readonly metadata: EntryMetadata<MarkdownEntry>,
    protected readonly dependencies: ObservableSet<string>,
  ) {}

  protected perform<T>(action: NgDocAction<T>): NgDocActionOutput<T> {
    const output: NgDocActionOutput<T> = action(this.metadata);

    this.dependencies.add(...(output.dependencies ?? []));

    return output;
  }
}
