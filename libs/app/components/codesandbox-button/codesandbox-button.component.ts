import {CommonModule} from '@angular/common';
import {HttpClient} from '@angular/common/http';
import {Component, Input} from '@angular/core';
import {NgDocSandboxAsset} from '@ng-doc/core';
import {NgDocButtonIconComponent, NgDocIconComponent, NgDocTooltipDirective} from '@ng-doc/ui-kit';
import {getParameters} from 'codesandbox/lib/api/define';

@Component({
	selector: 'ng-doc-codesandbox-button',
	standalone: true,
	imports: [CommonModule, NgDocButtonIconComponent, NgDocIconComponent, NgDocTooltipDirective],
	templateUrl: './codesandbox-button.component.html',
	styleUrls: ['./codesandbox-button.component.scss'],
})
export class CodesandboxButtonComponent {
	@Input({required: true})
	sandboxId: string = '';

	@Input({required: true})
	componentName: string = '';

	constructor(private readonly httpClient: HttpClient) {}

	open(): void {
		this.httpClient
			.get<Record<string, NgDocSandboxAsset>>(`assets/ng-doc/sandbox/${this.sandboxId}.json`)
			.subscribe((assets: Record<string, NgDocSandboxAsset>) => {
				const {codesandbox = {}} = assets[this.componentName];
				const {files = {}} = codesandbox;

				const params: string = getParameters({
					template: "node",
					files: {
						...Object.keys(files).reduce((acc, key) => ({...acc, [key]: {content: files[key]}}), {}),
					},
				});

				const url: string = `https://codesandbox.io/api/v1/sandboxes/define?parameters=${params}`;

				window.open(url, '_blank');
			});
	}
}
