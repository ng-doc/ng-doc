import { NgDocAction } from '../../types';
import { apiAction } from './actions/api.action';
import { apiDetailsAction } from './actions/api-details.action';
import { BaseAction } from './base-action';

export class NgDocApi extends BaseAction {
  api(declarationPath: string): string {
    return this.performAction(apiAction(declarationPath));
  }

  details(declarationPath: string): string {
    return this.performAction(apiDetailsAction(declarationPath));
  }

  performAction<T>(action: NgDocAction<T>): string {
    const output = super.perform(action);

    return `\n${output.output}\n`;
  }
}
