import {ChangeDetectionStrategy, Component, Input, Type} from '@angular/core';
import {NgDocRootPage} from '@ng-doc/app/classes/root-page';
import {NgDocDemoAsset} from '@ng-doc/app/interfaces';
import {ngDocMakePure} from '@ng-doc/ui-kit/decorators';
import {PolymorpheusComponent} from '@tinkoff/ng-polymorpheus';

@Component({
	selector: 'ng-doc-demo',
	templateUrl: './demo.component.html',
	styleUrls: ['./demo.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NgDocDemoComponent {
	@Input()
	componentName?: string;

	@Input()
	container: boolean = true;

	constructor(private readonly rootPage: NgDocRootPage) {}

	@ngDocMakePure
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
