import {
  APP_BASE_HREF,
  NgComponentOutlet,
  NgTemplateOutlet,
  PlatformLocation,
} from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DOCUMENT,
  ElementRef,
  inject,
  input,
  linkedSignal,
  Signal,
  signal,
  Type,
  untracked,
  viewChild,
  viewChildren,
} from '@angular/core';
import { NgDocRootPage } from '@ng-doc/app/classes/root-page';
import { NgDocCodeComponent } from '@ng-doc/app/components/code';
import { NgDocCopyButtonComponent } from '@ng-doc/app/components/copy-button';
import { NgDocDemoFrameComponent } from '@ng-doc/app/components/demo-frame';
import { NgDocFullscreenButtonComponent } from '@ng-doc/app/components/fullscreen-button';
import { NgDocFullscreenToggleComponent } from '@ng-doc/app/components/fullscreen-toggle';
import { NgDocDemoAsset } from '@ng-doc/app/interfaces';
import { asArray } from '@ng-doc/core/helpers/as-array';
import { NgDocDemoActionOptions } from '@ng-doc/core/interfaces';
import {
  NgDocButtonIconComponent,
  NgDocFullscreenDirective,
  NgDocIconComponent,
  NgDocSelectionComponent,
  NgDocSelectionHostDirective,
  NgDocSelectionOriginDirective,
  NgDocTooltipDirective,
} from '@ng-doc/ui-kit';

/** Widths the demo can be previewed at. */
export type NgDocDemoPreviewWidth = 'full' | '480' | '280';

/** The preview widths, in the order of their buttons. */
const PREVIEW_WIDTHS: ReadonlyArray<{
  readonly width: NgDocDemoPreviewWidth;
  readonly label: string;
  readonly readout: string;
}> = [
  { width: 'full', label: 'Full width', readout: '100% × auto' },
  { width: '480', label: '480 pixels wide', readout: '480 × auto' },
  { width: '280', label: '280 pixels wide', readout: '280 × auto' },
];

let nextId = 0;

/**
 * Renders a demo of the page in a panel: a toolbar with Preview and source tabs, the preview
 * width, copy and fullscreen controls, over the demo on a dot-grid stage. The fullscreen control
 * shows the stage fullscreen with the browser Fullscreen API; it is hidden where the browser does
 * not support it.
 *
 * When the Vite engine built demo pages for the page (`NgDocRootPage.demoRoute`), the toolbar
 * opens the demo's page in a new tab, and an isolated demo (the `isolated` option, or
 * `isolatedDemos`) is shown in an iframe of its page: the preview widths are then the width of the
 * iframe's viewport, so media queries inside the demo respond to them. Otherwise the demo renders
 * in the page, and the preview widths set the width of its container only.
 */
@Component({
  selector: 'ng-doc-demo',
  templateUrl: './demo.component.html',
  styleUrls: ['./demo.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    NgComponentOutlet,
    NgTemplateOutlet,
    NgDocCodeComponent,
    NgDocButtonIconComponent,
    NgDocCopyButtonComponent,
    NgDocDemoFrameComponent,
    NgDocFullscreenButtonComponent,
    NgDocFullscreenDirective,
    NgDocFullscreenToggleComponent,
    NgDocIconComponent,
    NgDocSelectionComponent,
    NgDocSelectionHostDirective,
    NgDocSelectionOriginDirective,
    NgDocTooltipDirective,
  ],
  host: {
    '[class]': 'options().class ?? ""',
    '[attr.data-ng-doc-container]': 'options().container ?? true',
  },
})
export class NgDocDemoComponent {
  private readonly rootPage = inject(NgDocRootPage);
  private readonly document = inject(DOCUMENT);
  private readonly platformLocation = inject(PlatformLocation);
  private readonly appBaseHref = inject(APP_BASE_HREF, { optional: true });

  /** Name of the demo component in the page's `demos`. */
  readonly componentName = input<string | undefined>(undefined);

  /** Options of the `demo` action. */
  readonly options = input<NgDocDemoActionOptions>({});

  /** The demo component. */
  readonly demo: Signal<Type<unknown> | undefined> = computed(() => {
    const name: string | undefined = this.componentName();

    return name ? this.rootPage.page?.demos?.[name] : undefined;
  });

  /**
   * The URL of the demo's page, when the page has demo pages and the demo exists: the generated
   * demo route and the demo's name under the base href, with the `inputs` option as a query
   * parameter.
   */
  readonly demoUrl: Signal<string | undefined> = computed(() => {
    const route: string | undefined = this.rootPage.demoRoute;
    const name: string | undefined = this.componentName();

    if (!route || !name || !this.demo()) return undefined;
    // The demo pages are files under the document's base href, whatever the location strategy.
    const baseHref: string = (
      this.appBaseHref ??
      this.platformLocation.getBaseHrefFromDOM() ??
      '/'
    ).replace(/^\/+|\/+$/g, '');
    const path: string = [...baseHref.split('/'), ...route.split('/'), name]
      .filter(Boolean)
      .map((segment: string) => encodeURIComponent(segment))
      .join('/');
    const inputs: Record<string, unknown> | undefined = this.options().inputs;
    const query: string =
      inputs && Object.keys(inputs).length
        ? `?inputs=${encodeURIComponent(JSON.stringify(inputs))}`
        : '';

    return `/${path}${query}`;
  });

  /** Whether the demo is shown in an iframe of its page. */
  readonly isolated: Signal<boolean> = computed(
    () =>
      !!this.demoUrl() &&
      !this.options().fullscreenRoute &&
      (this.options().isolated ?? this.rootPage.isolatedDemos ?? false),
  );

  /** The accessible title of the demo's iframe. */
  protected readonly frameTitle: Signal<string> = computed(() => `${this.componentName()} demo`);

  /** Whether the stage is fullscreen. */
  protected readonly fullscreen: Signal<boolean> = computed(() => this.stage()?.active() ?? false);

  private readonly stage = viewChild(NgDocFullscreenDirective);

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

  /**
   * The open view: `preview`, or the title of a source file. It starts on the preview, or on the
   * default source file when the `expanded` option is set.
   */
  readonly view = linkedSignal<string>(() => {
    const options: NgDocDemoActionOptions = this.options();

    return options.expanded ? this.defaultAsset()?.title ?? 'preview' : 'preview';
  });

  /** The width the demo is previewed at. */
  readonly previewWidth = signal<NgDocDemoPreviewWidth>('full');

  protected readonly previewWidths = PREVIEW_WIDTHS;

  /** Readout of the preview width. */
  protected readonly widthReadout: Signal<string> = computed(
    () =>
      PREVIEW_WIDTHS.find(({ width }) => width === this.previewWidth())?.readout ?? '100% × auto',
  );

  /** The views in tab order: the preview, then the source files. */
  protected readonly views: Signal<string[]> = computed(() => [
    'preview',
    ...this.assets().map((asset: NgDocDemoAsset) => asset.title),
  ]);

  /** Prefix of the ids that tie the view tabs to their panels. */
  protected readonly idPrefix: string = `ng-doc-demo-${nextId++}`;

  /** Reads the code of the open source file (or the default one) when copy is pressed. */
  protected readonly copyText = (): string => {
    const assets: NgDocDemoAsset[] = this.assets();
    const asset: NgDocDemoAsset | undefined =
      assets.find((item: NgDocDemoAsset) => item.title === this.view()) ?? this.defaultAsset();
    const template: HTMLTemplateElement = this.document.createElement('template');

    template.innerHTML = asset?.code ?? '';

    return template.content.textContent ?? '';
  };

  private readonly viewTabs = viewChildren<ElementRef<HTMLElement>>('viewTab');

  /**
   * The source file that opens first: the snippet marked `opened`, then `defaultTab`, then the
   * first file (the order the demo has always used).
   */
  private readonly defaultAsset: Signal<NgDocDemoAsset | undefined> = computed(() => {
    const assets: NgDocDemoAsset[] = this.assets();
    const defaultTab: string | undefined = this.options().defaultTab;

    return (
      assets.find((asset: NgDocDemoAsset) => asset.opened) ??
      assets.find((asset: NgDocDemoAsset) => asset.title === defaultTab) ??
      assets[0]
    );
  });

  /**
   * Opens a view.
   * @param view - `preview` or the title of a source file.
   */
  openView(view: string): void {
    untracked(() => this.view.set(view));
  }

  /**
   * Moves between the view tabs with the keyboard.
   * @param event - The key press on a view tab.
   */
  protected onViewKeydown(event: KeyboardEvent): void {
    const views: string[] = this.views();
    const current: number = Math.max(views.indexOf(this.view()), 0);
    const next: number | undefined = {
      ArrowRight: (current + 1) % views.length,
      ArrowLeft: (current - 1 + views.length) % views.length,
      Home: 0,
      End: views.length - 1,
    }[event.key];

    if (next !== undefined) {
      event.preventDefault();
      this.openView(views[next]);
      this.viewTabs()[next]?.nativeElement.focus();
    }
  }
}
