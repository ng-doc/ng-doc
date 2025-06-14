import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { NgDocSearchEngine } from '@ng-doc/app/classes';
import {
  NgDocSearchDialogComponent,
  NgDocSearchDialogData,
} from '@ng-doc/app/components/search-dialog';
import { NgDocSearchResult } from '@ng-doc/app/interfaces';
import {
  NgDocButtonIconComponent,
  NgDocComponentContent,
  NgDocDialogService,
  NgDocDropdownOriginDirective,
  NgDocHotkeyDirective,
  NgDocIconComponent,
  NgDocInputStringDirective,
  NgDocInputWrapperComponent,
  NgDocTagComponent,
  observableState,
  StatedObservable,
} from '@ng-doc/ui-kit';
import { BehaviorSubject, NEVER } from 'rxjs';
import { shareReplay, skip, switchMap } from 'rxjs/operators';

@Component({
  selector: 'ng-doc-search',
  templateUrl: './search.component.html',
  styleUrls: ['./search.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    NgDocButtonIconComponent,
    NgDocDropdownOriginDirective,
    NgDocIconComponent,
    NgDocInputWrapperComponent,
    NgDocInputStringDirective,
    FormsModule,
    NgDocHotkeyDirective,
    NgDocTagComponent,
  ],
})
export class NgDocSearchComponent {
  protected readonly query: BehaviorSubject<string> = new BehaviorSubject<string>('');
  protected readonly searchResults: StatedObservable<NgDocSearchResult[]>;
  protected readonly dialog = inject(NgDocDialogService);
  protected readonly searchEngine = inject(NgDocSearchEngine, { optional: true });

  constructor() {
    if (!this.searchEngine) {
      throw new Error(`NgDoc: Search engine is not provided,
			please check this article: https://ng-doc.com/docs/getting-started/installation#configuring-application
			to learn how to provide it.`);
    }

    this.searchResults = this.query.pipe(
      skip(1),
      switchMap((term: string) => this.searchEngine?.search(term).pipe(observableState()) ?? NEVER),
      shareReplay(1),
      takeUntilDestroyed(),
    );
  }

  open(): void {
    this.dialog.open<NgDocSearchDialogData>(new NgDocComponentContent(NgDocSearchDialogComponent), {
      hasBackdrop: true,
      backdropClass: 'ng-doc-blur-backdrop',
      panelClass: 'ng-doc-transparent-dialog',
      positionStrategy: this.dialog.positionStrategy().centerHorizontally().top('5vh'),
      data: {
        term: this.query.value,
        search: (query: string) => this.query.next(query),
        searchResults: this.searchResults,
      },
    });
  }
}
