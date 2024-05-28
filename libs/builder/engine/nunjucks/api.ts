import { apiAction } from './actions/api.action';
import { apiDetailsAction } from './actions/api-details.action';
import { BaseAction } from './base-action';

export class NgDocApi extends BaseAction {
  api(declarationPath: string): string {
    return this.perform(apiAction(declarationPath)).output;
  }

  details(declarationPath: string): string {
    return this.perform(apiDetailsAction(declarationPath)).output;
  }
}
