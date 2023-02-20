import {ChangeDetectionStrategy, Component, Input, OnInit, Type} from '@angular/core';
import {NgDocRootPage} from '@ng-doc/app/classes/root-page';
import {NgDocDemoAsset} from '@ng-doc/app/interfaces';
import {NgDocContent} from '@ng-doc/ui-kit';
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
			return (this.rootPage.demoAssets && this.rootPage.demoAssets[this.componentName]) ?? [];
		}

		return [];
	}
}
