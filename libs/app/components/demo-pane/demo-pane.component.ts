import {NgFor, NgIf, NgTemplateOutlet} from '@angular/common';
import {ChangeDetectionStrategy, Component, HostBinding, Input, OnInit, Type} from '@angular/core';
import {NgDocRootPage} from '@ng-doc/app/classes/root-page';
import {NgDocCodeComponent} from '@ng-doc/app/components/code';
import {NgDocDemoAsset} from '@ng-doc/core';
import {asArray} from '@ng-doc/core/helpers/as-array';
import {NgDocDemoPaneActionOptions} from '@ng-doc/core/interfaces';
import {
	NgDocPaneBackDirective,
	NgDocPaneComponent,
	NgDocPaneFrontDirective,
	NgDocTabComponent,
	NgDocTabGroupComponent,
} from '@ng-doc/ui-kit';
import {NgDocContent} from '@ng-doc/ui-kit/types';
import {PolymorpheusComponent, PolymorpheusModule} from '@tinkoff/ng-polymorpheus';

@Component({
	selector: 'ng-doc-demo-pane',
	templateUrl: './demo-pane.component.html',
	styleUrls: ['./demo-pane.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
	standalone: true,
	imports: [
		NgDocPaneComponent,
		NgTemplateOutlet,
		NgDocPaneBackDirective,
		NgDocPaneFrontDirective,
		PolymorpheusModule,
		NgIf,
		NgFor,
		NgDocCodeComponent,
		NgDocTabGroupComponent,
		NgDocTabComponent,
	],
})
export class NgDocDemoPaneComponent implements OnInit {
	@Input()
	componentName?: string;

	@Input()
	options: NgDocDemoPaneActionOptions = {};

	demo?: NgDocContent<object>;
	assets: NgDocDemoAsset[] = [];

	constructor(private readonly rootPage: NgDocRootPage) {}

	@HostBinding('class')
	protected get classes(): string | string[] {
		return this.options.class ?? '';
	}

	ngOnInit(): void {
		this.demo = this.getDemo();
		this.assets = this.getAssets();
	}

	private getDemo(): NgDocContent<object> | undefined {
		if (this.componentName) {
			const component: Type<unknown> | undefined =
				this.rootPage.page?.demos && this.rootPage.page.demos[this.componentName];

			return component ? new PolymorpheusComponent(component as Type<object>) : undefined;
		}

		return undefined;
	}

	private getAssets(): NgDocDemoAsset[] {
		if (this.componentName) {
			return ((this.rootPage.demoConfigs && this.rootPage.demoConfigs[this.componentName].assets) ?? []).filter(
				(asset: NgDocDemoAsset) => !this.options.tabs?.length || asArray(this.options.tabs).includes(asset.title),
			);
		}

		return [];
	}
}
