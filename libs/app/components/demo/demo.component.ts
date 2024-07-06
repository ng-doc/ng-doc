import { NgComponentOutlet, NgFor, NgIf, NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, Signal, Type } from '@angular/core';
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
  standalone: true,
  imports: [
    NgIf,
    NgDocDemoDisplayerComponent,
    NgTemplateOutlet,
    NgFor,
    NgDocCodeComponent,
    NgDocTabGroupComponent,
    NgDocTabComponent,
    NgDocIconComponent,
    NgDocExecutePipe,
    NgDocFullscreenButtonComponent,
    NgComponentOutlet,
  ],
  host: {
    '[class]': 'this.options().class ?? ""',
  },
})
export class NgDocDemoComponent {
  componentName = input.required<string>();
  options = input<NgDocDemoActionOptions>({});

  demo: Signal<Type<unknown>>;
  assets: Signal<NgDocDemoAsset[]>;
  openedAssetId: Signal<string | undefined>;

  constructor(private readonly rootPage: NgDocRootPage) {
    this.demo = computed(() => {
      if (this.componentName) {
        return this.rootPage.page?.demos && this.rootPage.page.demos[this.componentName()];
      }

      return null;
    });

    this.assets = computed(() => {
      if (this.componentName) {
        return (
          (this.rootPage.demoAssets && this.rootPage.demoAssets[this.componentName()]) ??
          []
        ).filter(
          (asset: NgDocDemoAsset) =>
            !this.options().tabs?.length || asArray(this.options().tabs).includes(asset.title),
        );
      }

      return [];
    });

    this.openedAssetId = computed(
      () => this.assets().find((asset: NgDocDemoAsset) => asset.opened)?.title ?? this.options().defaultTab,
    );
  }
}
