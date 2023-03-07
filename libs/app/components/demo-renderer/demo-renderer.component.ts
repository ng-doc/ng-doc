import {ChangeDetectionStrategy, Component, Input, ViewEncapsulation} from '@angular/core';
import {NgDocContent} from '@ng-doc/ui-kit';

@Component({
	selector: 'ng-doc-demo-renderer',
	template: `<ng-container *polymorpheusOutlet="demo ?? ''; context: {}"></ng-container>`,
	changeDetection: ChangeDetectionStrategy.OnPush,
	encapsulation: ViewEncapsulation.ShadowDom,
})
export class NgDocDemoRendererComponent {
	@Input()
	demo: NgDocContent = '';
}
