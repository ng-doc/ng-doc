import {NgFor, NgIf, NgTemplateOutlet} from '@angular/common';
import {ChangeDetectionStrategy, Component, HostBinding, Input, OnInit, Type} from '@angular/core';
import {NgDocRootPage} from '@ng-doc/app/classes/root-page';
import {NgDocCodeComponent} from '@ng-doc/app/components/code';
import {NgDocDemoDisplayerComponent} from '@ng-doc/app/components/demo-displayer';
import {NgDocDemoAsset, NgDocDemoConfig} from '@ng-doc/core';
import {asArray} from '@ng-doc/core/helpers/as-array';
import {NgDocDemoActionOptions} from '@ng-doc/core/interfaces';
import {NgDocTabComponent, NgDocTabGroupComponent} from '@ng-doc/ui-kit';
import {NgDocContent} from '@ng-doc/ui-kit/types';
import {PolymorpheusComponent, PolymorpheusModule} from '@tinkoff/ng-polymorpheus';

@Component({
	selector: 'ng-doc-demo',
	templateUrl: './demo.component.html',
	styleUrls: ['./demo.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
	standalone: true,
	imports: [
		NgIf,
		NgDocDemoDisplayerComponent,
		NgTemplateOutlet,
		NgFor,
		NgDocCodeComponent,
		NgDocTabGroupComponent,
		NgDocTabComponent,
		PolymorpheusModule,
	],
})
export class NgDocDemoComponent implements OnInit {
	@Input()
	componentName: string = '';

	@Input()
	options: NgDocDemoActionOptions = {};

	demo?: NgDocContent<object>;
	assets: NgDocDemoAsset[] = [];
	config?: NgDocDemoConfig;

	constructor(private readonly rootPage: NgDocRootPage) {}

	@HostBinding('class')
	protected get classes(): string | string[] {
		return this.options.class ?? '';
	}

	ngOnInit(): void {
		this.demo = this.getDemo();
		this.config = this.rootPage.demoConfigs?.[this.componentName];
		this.assets = this.getAssets();
	}

	private getDemo(): NgDocContent<object> | undefined {
		const component: Type<unknown> | undefined =
			this.rootPage.page?.demos && this.rootPage.page.demos[this.componentName];

		return component ? new PolymorpheusComponent(component as Type<object>) : undefined;
	}

	private getAssets(): NgDocDemoAsset[] {
		return (this.config?.assets ?? []).filter(
			(asset: NgDocDemoAsset) => !this.options.tabs?.length || asArray(this.options.tabs).includes(asset.title),
		);
	}
}
