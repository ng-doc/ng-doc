import { ChangeDetectionStrategy, Component } from '@angular/core';
import { NgDocMembersFilterDirective } from '@ng-doc/app/directives/members-filter';

/**
 * The members table of an API page in the symbol view. The builder renders its tabs, filter and
 * rows as the component's content, and the component adds the member filter to them.
 */
@Component({
  selector: 'ng-doc-members',
  template: '<ng-content></ng-content>',
  changeDetection: ChangeDetectionStrategy.OnPush,
  hostDirectives: [NgDocMembersFilterDirective],
  host: { class: 'ng-doc-members' },
})
export class NgDocMembersComponent {}
