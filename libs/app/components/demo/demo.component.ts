import { NgComponentOutlet, NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  HostBinding,
  inject,
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

@Component({
  selector: 'ng-doc-demo',
  templateUrl: './demo.component.html',
  styleUrls: ['./demo.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    NgDocDemoDisplayerComponent,
    NgTemplateOutlet,
    NgDocCodeComponent,
    NgDocTabGroupComponent,
    NgDocTabComponent,
    NgDocIconComponent,
    NgDocExecutePipe,
    NgDocFullscreenButtonComponent,
    NgComponentOutlet,
  ],
})
export class NgDocDemoComponent implements OnInit {
  private readonly rootPage = inject(NgDocRootPage);

  @Input()
  componentName?: string;

  @Input()
  options: NgDocDemoActionOptions = {};

  demo?: Type<unknown>;
  assets: NgDocDemoAsset[] = [];

  constructor() {}

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

  private getDemo(): Type<unknown> | undefined {
    if (this.componentName) {
      return this.rootPage.page?.demos && this.rootPage.page.demos[this.componentName];
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
