import { isPlatformBrowser } from '@angular/common';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  DOCUMENT,
  inject,
  PLATFORM_ID,
  signal,
} from '@angular/core';
import { NgDocSearchEngine } from '@ng-doc/app/classes';
import {
  NgDocCommandPaletteComponent,
  NgDocCommandPaletteData,
} from '@ng-doc/app/components/command-palette';
import type { NgDocSearchTexts } from '@ng-doc/app/interfaces';
import { NgDocShortcutsService } from '@ng-doc/app/services/shortcuts';
import { NG_DOC_TEXTS } from '@ng-doc/app/tokens';
import {
  NgDocButtonIconComponent,
  NgDocComponentContent,
  NgDocDialogService,
  NgDocOverlayService,
} from '@ng-doc/ui-kit';
import { NgDocOverlayRef } from '@ng-doc/ui-kit/classes';

/**
 * The search button of the navbar. It opens the search palette on click, with Command+K
 * (Control+K) and, while single-key shortcuts are on, with the slash key. Wide screens show a
 * search field with the key hint; narrow screens show an icon button.
 */
@Component({
  selector: 'ng-doc-search',
  templateUrl: './search.component.html',
  styleUrls: ['./search.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgDocButtonIconComponent],
  // The palette is created with this component's injector, not the root one: it reads the search
  // engine and the generated context, which may be provided by the route that holds the docs.
  providers: [NgDocDialogService, NgDocOverlayService],
})
export class NgDocSearchComponent {
  protected readonly dialog = inject(NgDocDialogService);
  protected readonly searchEngine = inject(NgDocSearchEngine, { optional: true });
  protected readonly shortcuts = inject(NgDocShortcutsService);
  protected readonly texts: NgDocSearchTexts = inject(NG_DOC_TEXTS).search;
  /** The chord that opens the search, as the reader's platform labels it. */
  protected readonly chord = signal(this.texts.shortcutMac);

  private readonly document = inject(DOCUMENT);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private dialogRef?: NgDocOverlayRef;

  constructor() {
    if (!this.searchEngine) {
      throw new Error(`NgDoc: Search engine is not provided,
			please check this article: https://ng-doc.com/docs/get-started/installation#4-add-the-providers
			to learn how to provide it.`);
    }

    const removeSlash = this.shortcuts.register({ key: '/', handler: () => this.open() });
    const removeChord = this.shortcuts.register({
      key: 'k',
      chord: true,
      handler: () => (this.dialogRef ? this.dialogRef.close() : this.open()),
    });

    inject(DestroyRef).onDestroy(() => {
      removeSlash();
      removeChord();
      this.dialogRef?.close();
    });

    // The platform is known only in the browser; the server renders the macOS label.
    afterNextRender(() => {
      if (!/Mac|iPhone|iPad/i.test(this.document.defaultView?.navigator.platform ?? '')) {
        this.chord.set(this.texts.shortcutOther);
      }
    });
  }

  /**
   * Opens the search palette. Focus returns to the element that had it when the palette closes.
   * @param query - The text the search field starts with.
   */
  open(query: string = ''): void {
    if (this.dialogRef || !this.browser) {
      return;
    }

    const opener = this.document.activeElement;
    const narrow = !!this.document.defaultView?.matchMedia?.('(max-width: 640px)').matches;
    const data: NgDocCommandPaletteData = { query };
    const dialogRef = this.dialog.open(new NgDocComponentContent(NgDocCommandPaletteComponent), {
      hasBackdrop: true,
      backdropClass: 'ng-doc-command-palette-backdrop',
      panelClass: ['ng-doc-transparent-dialog', 'ng-doc-command-palette-pane'],
      positionStrategy: this.dialog
        .positionStrategy()
        .centerHorizontally()
        .top(narrow ? '8px' : '10vh'),
      data,
    });

    this.dialogRef = dialogRef;
    dialogRef.afterClose().subscribe(() => {
      this.dialogRef = undefined;

      if (opener instanceof HTMLElement && opener.isConnected && opener !== this.document.body) {
        opener.focus({ preventScroll: true });
      }
    });
  }
}
