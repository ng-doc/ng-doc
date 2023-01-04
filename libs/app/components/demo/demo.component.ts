import {ChangeDetectionStrategy, Component, Input, OnInit, Type} from '@angular/core';
import {NgDocRootPage} from '@ng-doc/app/classes/root-page';
import {NgDocDemoAsset} from '@ng-doc/app/interfaces';
import {PolymorpheusComponent} from '@tinkoff/ng-polymorpheus';

@Component({
	selector: 'ng-doc-demo',
	templateUrl: './demo.component.html',
	styleUrls: ['./demo.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NgDocDemoComponent implements OnInit {
	@Input()
	componentName?: string;

	@Input()
	container: boolean = true;

	demo?: PolymorpheusComponent<object, object>;
	assets: NgDocDemoAsset[] = [];

	constructor(private readonly rootPage: NgDocRootPage) {}

	ngOnInit(): void {
		this.demo = this.getDemo();
		this.assets = this.getAssets();
	}

	private getDemo(): PolymorpheusComponent<object, object> | undefined {
		if (this.componentName) {
			const component: Type<object> | undefined = this.rootPage.demo && this.rootPage.demo[this.componentName];

			return component ? new PolymorpheusComponent(component) : undefined;
		}

		return undefined;
	}

	private getAssets(): NgDocDemoAsset[] {
		if (this.componentName) {
			return (this.rootPage.demoAssets && this.rootPage.demoAssets[this.componentName]) ?? [];
		}

		return [];
	}
}
