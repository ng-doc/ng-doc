import { jsDocAction } from './actions/js-doc.action';
import { jsDocHasTagAction } from './actions/js-doc-has-tag.action';
import { jsDocTagAction } from './actions/js-doc-tag.action';
import { jsDocTagsAction } from './actions/js-doc-tags.action';
import { BaseAction } from './base-action';

export class JSDoc extends BaseAction {
  description(declarationPath: string): string {
    return this.perform(jsDocAction(declarationPath)).output;
  }

  tag(declarationPath: string, tagName: string): string {
    return this.perform(jsDocTagAction(declarationPath, tagName)).output;
  }

  tags(declarationPath: string, tagName: string): string {
    return this.perform(jsDocTagsAction(declarationPath, tagName)).output;
  }

  hasTag(declarationPath: string, tagName: string): boolean {
    return this.perform(jsDocHasTagAction(declarationPath, tagName)).output;
  }
}
