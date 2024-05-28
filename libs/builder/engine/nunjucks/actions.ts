import {
  NgDocDemoActionOptions,
  NgDocDemoPaneActionOptions,
  NgDocPlaygroundOptions,
} from '@ng-doc/core';

import { demoAction } from './actions/demo.action';
import { demoPaneAction } from './actions/demo-pane.action';
import { playgroundAction } from './actions/playground.action';
import { BaseAction } from './base-action';

export class NgDocActions extends BaseAction {
  demo(className: string, options?: NgDocDemoActionOptions): string {
    return this.perform(demoAction(className, options)).output;
  }

  demoPane(className: string, options?: NgDocDemoPaneActionOptions): string {
    return this.perform(demoPaneAction(className, options)).output;
  }

  playground(playgroundId: string, options?: NgDocPlaygroundOptions): string {
    return this.perform(playgroundAction(playgroundId, options)).output;
  }
}
