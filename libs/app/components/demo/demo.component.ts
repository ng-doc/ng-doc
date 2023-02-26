import {ChangeDetectionStrategy, Component, Input, OnInit, Type} from '@angular/core';
import {NgDocRootPage} from '@ng-doc/app/classes/root-page';
import {NgDocDemoAsset} from '@ng-doc/app/interfaces';
import {asArray} from '@ng-doc/core/helpers/as-array';
import {NgDocDemoActionOptions} from '@ng-doc/core/interfaces';
import {NgDocContent} from '@ng-doc/ui-kit/types';
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
	options: NgDocDemoActionOptions = {};

	demo?: NgDocContent<object>;
	assets: NgDocDemoAsset[] = [];

	constructor(private readonly rootPage: NgDocRootPage) {}

	ngOnInit(): void {
		this.demo = this.getDemo();
		this.assets = this.getAssets();
	}

	private getDemo(): NgDocContent<object> | undefined {
		if (this.componentName) {
			const component: Type<unknown> | undefined =
				this.rootPage.dependencies?.demo && this.rootPage.dependencies.demo[this.componentName];

			return component ? new PolymorpheusComponent(component as Type<object>) : undefined;
		}

		return undefined;
	}

	private getAssets(): NgDocDemoAsset[] {
		if (this.componentName) {
			return ((this.rootPage.demoAssets && this.rootPage.demoAssets[this.componentName]) ?? []).filter(
				(asset: NgDocDemoAsset) =>
					!this.options.tabs?.length || asArray(this.options.tabs).includes(asset.title),
			);
		}

		return [];
	}
}
