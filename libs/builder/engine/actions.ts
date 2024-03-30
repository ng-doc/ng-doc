import {
  minifyHtml,
  NgDocDemoActionOptions,
  NgDocDemoPaneActionOptions,
  NgDocPlaygroundOptions,
} from '@ng-doc/core';

import { ObservableSet } from '../classes';
import { NgDocActionOutput } from '../interfaces';
import { NgDocAction } from '../types';
import { apiAction } from './actions/api.action';
import { demoAction } from './actions/demo.action';
import { demoPaneAction } from './actions/demo-pane.action';
import { playgroundAction } from './actions/playground.action';
import { EntryMetadata, MarkdownEntry } from './builders';

export class NgDocActions {
  constructor(
    private readonly metadata: EntryMetadata<MarkdownEntry>,
    private readonly dependencies: ObservableSet<string>,
  ) {}

  demo(className: string, options?: NgDocDemoActionOptions): string {
    return this.performAction(demoAction(className, options)).output;
  }

  demoPane(className: string, options?: NgDocDemoPaneActionOptions): string {
    return this.performAction(demoPaneAction(className, options)).output;
  }

  playground(playgroundId: string, options?: NgDocPlaygroundOptions): string {
    return this.performAction(playgroundAction(playgroundId, options)).output;
  }

  api(declarationPath: string): string {
    return this.performAction(apiAction(declarationPath)).output;
  }

  private performAction(action: NgDocAction): NgDocActionOutput {
    const output: NgDocActionOutput = action(this.metadata);

    this.dependencies.add(...(output.dependencies ?? []));

    return {
      ...output,
      output: minifyHtml(output.output),
    };
  }
}
