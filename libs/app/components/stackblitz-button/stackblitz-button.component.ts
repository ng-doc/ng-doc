import {CommonModule} from '@angular/common';
import {HttpClient} from '@angular/common/http';
import {Component, Input} from '@angular/core';
import {NgDocSandboxAsset} from '@ng-doc/core';
import {NgDocButtonIconComponent, NgDocIconComponent, NgDocTooltipDirective} from '@ng-doc/ui-kit';
import sdk from '@stackblitz/sdk';

@Component({
	selector: 'ng-doc-stackblitz-button',
	standalone: true,
	imports: [CommonModule, NgDocButtonIconComponent, NgDocTooltipDirective, NgDocIconComponent],
	templateUrl: './stackblitz-button.component.html',
	styleUrls: ['./stackblitz-button.component.scss'],
})
export class StackblitzButtonComponent {
	@Input({required: true})
	sandboxId: string = '';

	@Input({required: true})
	componentName: string = '';

	constructor(private readonly httpClient: HttpClient) {}

	open(): void {
		this.httpClient
			.get<Record<string, NgDocSandboxAsset>>(`assets/ng-doc/sandbox/${this.sandboxId}.json`)
			.subscribe((assets: Record<string, NgDocSandboxAsset>) => {
				const {stackblitz = {}} = assets[this.componentName];
				const {files = {}, dependencies = {}} = stackblitz;

				sdk.openProject(
					{
						title: 'NgDoc Demo',
						description: 'A demo of NgDoc',
						template: 'angular-cli',
						files,
						dependencies,
					},
					{},
				);
			});
	}
}
