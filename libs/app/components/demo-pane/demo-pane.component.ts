import { NgComponentOutlet, NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  Signal,
  Type,
} from '@angular/core';
import { NgDocRootPage } from '@ng-doc/app/classes/root-page';
import { NgDocCodeComponent } from '@ng-doc/app/components/code';
import { NgDocFullscreenButtonComponent } from '@ng-doc/app/components/fullscreen-button';
import { NgDocFullscreenToggleComponent } from '@ng-doc/app/components/fullscreen-toggle';
import { NgDocDemoAsset } from '@ng-doc/app/interfaces';
import { asArray } from '@ng-doc/core/helpers/as-array';
import { NgDocDemoPaneActionOptions } from '@ng-doc/core/interfaces';
import {
  NgDocFullscreenDirective,
  NgDocIconComponent,
  NgDocPaneBackDirective,
  NgDocPaneComponent,
  NgDocPaneFrontDirective,
  NgDocTabComponent,
  NgDocTabGroupComponent,
} from '@ng-doc/ui-kit';

/**
 * Renders a demo of the page in front of its source files, which the reader reveals by dragging
 * the pane's resizer. The demo sits on the dot-grid canvas of demos, with a control that shows it
 * fullscreen with the browser Fullscreen API where the browser supports it.
 */
@Component({
  selector: 'ng-doc-demo-pane',
  templateUrl: './demo-pane.component.html',
  styleUrls: ['./demo-pane.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    NgDocPaneComponent,
    NgTemplateOutlet,
    NgDocPaneBackDirective,
    NgDocPaneFrontDirective,
    NgDocCodeComponent,
    NgDocTabGroupComponent,
    NgDocTabComponent,
    NgDocFullscreenButtonComponent,
    NgDocFullscreenDirective,
    NgDocFullscreenToggleComponent,
    NgComponentOutlet,
    NgDocIconComponent,
  ],
  host: {
    '[class]': 'options().class ?? ""',
  },
})
export class NgDocDemoPaneComponent {
  private readonly rootPage = inject(NgDocRootPage);

  /** Name of the demo component in the page's `demos`. */
  readonly componentName = input<string | undefined>(undefined);

  /** Options of the `demoPane` action. */
  readonly options = input<NgDocDemoPaneActionOptions>({});

  /** The demo component. */
  readonly demo: Signal<Type<unknown> | undefined> = computed(() => {
    const name: string | undefined = this.componentName();

    return name ? this.rootPage.page?.demos?.[name] : undefined;
  });

  /** Source files of the demo, filtered by the `tabs` option. */
  readonly assets: Signal<NgDocDemoAsset[]> = computed(() => {
    const name: string | undefined = this.componentName();
    const tabs: string | string[] | undefined = this.options().tabs;

    return name
      ? (this.rootPage.demoAssets?.[name] ?? []).filter(
          (asset: NgDocDemoAsset) => !tabs?.length || asArray(tabs).includes(asset.title),
        )
      : [];
  });
}
