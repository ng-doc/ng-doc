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
import { NgDocSearchResult } from '@ng-doc/app/interfaces';
import { NgDocSanitizeHtmlPipe } from '@ng-doc/app/pipes';
import {
  NG_DOC_DIALOG_DATA,
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
  popupAnimation,
  StatedObservable,
} from '@ng-doc/ui-kit';
import { NgDocListHost, NgDocOverlayRef } from '@ng-doc/ui-kit/classes';

export interface NgDocSearchDialogData {
  term: string;
  search: (query: string) => void;
  searchResults: StatedObservable<NgDocSearchResult[]>;
}

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
export class NgDocSearchDialogComponent implements NgDocListHost {
  @ViewChild('inputElement', { read: ElementRef })
  inputElement!: ElementRef<HTMLElement>;

  @ViewChild('resultContent', { read: ElementRef })
  resultContent!: ElementRef<HTMLElement>;

  protected searchTerm: string = '';
  protected readonly elementRef = inject<ElementRef<HTMLElement>>(ElementRef);
  protected readonly overlayRef = inject(NgDocOverlayRef);
  protected readonly data = inject<NgDocSearchDialogData>(NG_DOC_DIALOG_DATA);

  constructor() {
    this.searchTerm = this.data.term;
  }

  search(query: string): void {
    this.data.search(query);
    this.resultContent.nativeElement.scrollTop = 0;
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
