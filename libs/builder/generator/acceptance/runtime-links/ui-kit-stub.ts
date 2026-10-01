import { Component, Input } from '@angular/core';

@Component({ selector: 'ng-doc-icon', standalone: true, template: '' })
export class NgDocIconComponent {
  @Input()
  icon: string = '';
}
