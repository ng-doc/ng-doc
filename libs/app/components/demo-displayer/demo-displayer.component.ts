import {NgIf, NgTemplateOutlet} from '@angular/common';
import {ChangeDetectionStrategy, Component, HostBinding, inject, Input} from '@angular/core';
import {NgDocRootPage} from '@ng-doc/app/classes';
import {NgDocCodeComponent} from '@ng-doc/app/components/code';
import {CodesandboxButtonComponent} from '@ng-doc/app/components/codesandbox-button';
import {CopyButtonComponent} from '@ng-doc/app/components/copy-button';
import {ExpandButtonComponent} from '@ng-doc/app/components/expand-button';
import {StackblitzButtonComponent} from '@ng-doc/app/components/stackblitz-button';
import {NgDocCodeHighlighterDirective} from '@ng-doc/app/directives/code-highlighter';
import {NgDocDemoConfig} from '@ng-doc/core';
import {NgDocContent, NgDocExpanderComponent} from '@ng-doc/ui-kit';

@Component({
	selector: 'ng-doc-demo-displayer',
	templateUrl: './demo-displayer.component.html',
	styleUrls: ['./demo-displayer.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
	standalone: true,
	imports: [
		NgIf,
		NgTemplateOutlet,
		NgDocExpanderComponent,
		NgDocCodeComponent,
		NgDocCodeHighlighterDirective,
		CopyButtonComponent,
		StackblitzButtonComponent,
		ExpandButtonComponent,
		CodesandboxButtonComponent,
	],
})
export class NgDocDemoDisplayerComponent {
	@Input()
	componentName: string = '';

	@Input()
	codeContent: NgDocContent = '';

	@Input()
	code: string = '';

	@Input()
	language: string = 'typescript';

	@Input()
	container: boolean = true;

	@Input()
	@HostBinding('attr.data-ng-doc-border')
	border: boolean = true;

	@Input()
	expanded: boolean = false;

	@Input()
	config?: NgDocDemoConfig;

	protected rootPage: NgDocRootPage = inject(NgDocRootPage);
}
