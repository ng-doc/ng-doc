import { NgFor, NgIf, NgTemplateOutlet } from '@angular/common';
import {
	ChangeDetectionStrategy,
	Component,
	HostBinding,
	Input,
	OnInit,
	Type,
} from '@angular/core';
import { NgDocRootPage } from '@ng-doc/app/classes/root-page';
import { NgDocCodeComponent } from '@ng-doc/app/components/code';
import { NgDocDemoDisplayerComponent } from '@ng-doc/app/components/demo-displayer';
import { NgDocFullscreenButtonComponent } from '@ng-doc/app/components/fullscreen-button';
import { NgDocDemoAsset } from '@ng-doc/app/interfaces';
import { asArray } from '@ng-doc/core/helpers/as-array';
import { NgDocDemoActionOptions } from '@ng-doc/core/interfaces';
import {
	NgDocExecutePipe,
	NgDocIconComponent,
	NgDocTabComponent,
	NgDocTabGroupComponent,
} from '@ng-doc/ui-kit';
import { NgDocContent } from '@ng-doc/ui-kit/types';
import { PolymorpheusComponent, PolymorpheusModule } from '@tinkoff/ng-polymorpheus';

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
		NgDocIconComponent,
		NgDocExecutePipe,
		NgDocFullscreenButtonComponent,
	],
})
export class NgDocDemoComponent implements OnInit {
	@Input()
	componentName?: string;

	@Input()
	options: NgDocDemoActionOptions = {};

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

	getOpenedAssetId(assets: NgDocDemoAsset[]): string | undefined {
		return assets.find((asset: NgDocDemoAsset) => asset.opened)?.title;
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
			return (
				(this.rootPage.demoAssets && this.rootPage.demoAssets[this.componentName]) ??
				[]
			).filter(
				(asset: NgDocDemoAsset) =>
					!this.options.tabs?.length || asArray(this.options.tabs).includes(asset.title),
			);
		}

		return [];
	}
}
