import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  forwardRef,
  inject,
  ViewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { NgDocSearchEngine } from '@ng-doc/app/classes';
import { NgDocSearchResult } from '@ng-doc/app/interfaces';
import { NgDocSanitizeHtmlPipe } from '@ng-doc/app/pipes';
import {
  NgDocAutofocusDirective,
  NgDocDataListComponent,
  NgDocDropdownComponent,
  NgDocExecutePipe,
  NgDocFocusCatcherDirective,
  NgDocHighlighterPipe,
  NgDocHighlightPosition,
  NgDocIconComponent,
  NgDocInputStringDirective,
  NgDocInputWrapperComponent,
  NgDocLetDirective,
  NgDocSpinnerComponent,
  NgDocTagComponent,
  NgDocTextComponent,
  observableState,
  popupAnimation,
  StatedObservable,
} from '@ng-doc/ui-kit';
import { NgDocListHost, NgDocOverlayRef } from '@ng-doc/ui-kit/classes';
import { UntilDestroy, untilDestroyed } from '@ngneat/until-destroy';
import { BehaviorSubject, NEVER } from 'rxjs';
import { skip, switchMap } from 'rxjs/operators';

@Component({
  animations: [popupAnimation],
  selector: 'ng-doc-search-dialog',
  standalone: true,
  imports: [
    CommonModule,
    NgDocInputWrapperComponent,
    NgDocInputStringDirective,
    NgDocAutofocusDirective,
    NgDocIconComponent,
    NgDocDataListComponent,
    RouterLink,
    NgDocTagComponent,
    NgDocTextComponent,
    NgDocHighlighterPipe,
    NgDocSanitizeHtmlPipe,
    NgDocFocusCatcherDirective,
    NgDocDropdownComponent,
    NgDocLetDirective,
    NgDocSpinnerComponent,
    NgDocExecutePipe,
    FormsModule,
  ],
  templateUrl: './search-dialog.component.html',
  styleUrl: './search-dialog.component.scss',
  providers: [
    {
      provide: NgDocListHost,
      useExisting: forwardRef(() => NgDocSearchDialogComponent),
    },
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[@popupAnimation]': 'true',
  },
})
@UntilDestroy()
export class NgDocSearchDialogComponent implements NgDocListHost {
  @ViewChild('inputElement', { read: ElementRef })
  inputElement?: ElementRef<HTMLElement>;

  protected searchTerm: string = '';
  protected readonly query$: BehaviorSubject<string> = new BehaviorSubject<string>('');
  protected readonly search$: StatedObservable<NgDocSearchResult[]>;

  protected readonly elementRef = inject<ElementRef<HTMLElement>>(ElementRef);
  protected readonly searchEngine = inject(NgDocSearchEngine, { optional: true });
  protected readonly overlayRef = inject(NgDocOverlayRef);

  constructor() {
    if (!this.searchEngine) {
      throw new Error(`NgDoc: Search engine is not provided,
			please check this article: https://ng-doc.com/docs/getting-started/installation#configuring-application
			to learn how to provide it.`);
    }

    this.search$ = this.query$.pipe(
      skip(1),
      switchMap((term: string) => this.searchEngine?.search(term).pipe(observableState()) ?? NEVER),
      untilDestroyed(this),
    );
  }

  getPositions<T extends NgDocSearchResult, K extends keyof T['positions']>(
    key: K,
    item: T,
  ): NgDocHighlightPosition[] {
    return item.positions[key] ?? [];
  }

  get listHostOrigin(): ElementRef<HTMLElement> {
    return this.inputElement ?? this.elementRef;
  }
}
