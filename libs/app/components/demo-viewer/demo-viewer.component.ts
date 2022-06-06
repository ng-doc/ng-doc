import {ChangeDetectionStrategy, Component, Type} from '@angular/core';
import {NgDocRootPage} from '@ng-doc/app/classes';
import {NgDocDemoAsset} from '@ng-doc/app/interfaces';
import {PolymorpheusComponent} from '@tinkoff/ng-polymorpheus';

@Component({
	selector: 'ng-doc-demo-viewer',
	templateUrl: './demo-viewer.component.html',
	styleUrls: ['./demo-viewer.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NgDocDemoViewerComponent {
	componentName?: string;

	constructor(private readonly rootPage: NgDocRootPage) {}

	get demo(): PolymorpheusComponent<object, object> | undefined {
		if (this.componentName) {
			const component: Type<object> | undefined = this.rootPage.demo && this.rootPage.demo[this.componentName];

			return component ? new PolymorpheusComponent(component) : undefined;
		}

		return undefined;
	}

	get assets(): NgDocDemoAsset[] {
		if (this.componentName) {
			return (this.rootPage.demoAssets && this.rootPage.demoAssets[this.componentName]) ?? [];
		}

		return [];
	}
}
