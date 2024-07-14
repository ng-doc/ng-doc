import {
  NgDocDemoActionOptions,
  NgDocDemoPaneActionOptions,
  NgDocPlaygroundOptions,
} from '@ng-doc/core';

import { NgDocAction } from '../../types';
import { demoAction } from './actions/demo.action';
import { demoPaneAction } from './actions/demo-pane.action';
import { playgroundAction } from './actions/playground.action';
import { BaseAction } from './base-action';

export class NgDocActions extends BaseAction {
  demo(className: string, options?: NgDocDemoActionOptions): string {
    return this.performAction(demoAction(className, options));
  }

  demoPane(className: string, options?: NgDocDemoPaneActionOptions): string {
    return this.performAction(demoPaneAction(className, options));
  }

  playground(playgroundId: string, options?: NgDocPlaygroundOptions): string {
    return this.performAction(playgroundAction(playgroundId, options));
  }

  performAction<T>(action: NgDocAction<T>): string {
    const output = super.perform(action);

    return `\n${output.output}\n`;
  }
}
