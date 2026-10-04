import { NgComponentOutlet, NgTemplateOutlet } from '@angular/common';
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
  viewChildren,
} from '@angular/core';
import { NgDocRootPage } from '@ng-doc/app/classes/root-page';
import { NgDocCodeComponent } from '@ng-doc/app/components/code';
import { NgDocCopyButtonComponent } from '@ng-doc/app/components/copy-button';
import { NgDocFullscreenButtonComponent } from '@ng-doc/app/components/fullscreen-button';
import { NgDocFullscreenToggleComponent } from '@ng-doc/app/components/fullscreen-toggle';
import { NgDocDemoAsset } from '@ng-doc/app/interfaces';
import { asArray } from '@ng-doc/core/helpers/as-array';
import { NgDocDemoActionOptions } from '@ng-doc/core/interfaces';
import {
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
 * The preview widths set the width of the demo's container; they do not emulate a device, so
 * media queries inside the demo do not respond to them.
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
    NgDocCopyButtonComponent,
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

  /** Name of the demo component in the page's `demos`. */
  readonly componentName = input<string | undefined>(undefined);

  /** Options of the `demo` action. */
  readonly options = input<NgDocDemoActionOptions>({});

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
