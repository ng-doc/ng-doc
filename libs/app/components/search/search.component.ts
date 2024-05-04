import { AsyncPipe, NgFor, NgIf, NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, HostBinding, inject, Input } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { NgDocSearchDialogComponent } from '@ng-doc/app/components/search-dialog';
import { NgDocSanitizeHtmlPipe } from '@ng-doc/app/pipes';
import {
  NgDocAutofocusDirective,
  NgDocButtonIconComponent,
  NgDocComponentContent,
  NgDocDataListComponent,
  NgDocDialogService,
  NgDocDropdownComponent,
  NgDocDropdownOriginDirective,
  NgDocExecutePipe,
  NgDocFocusCatcherDirective,
  NgDocHighlighterPipe,
  NgDocHotkeyDirective,
  NgDocIconComponent,
  NgDocInputStringDirective,
  NgDocInputWrapperComponent,
  NgDocLetDirective,
  NgDocSpinnerComponent,
  NgDocTagComponent,
  NgDocTextComponent,
} from '@ng-doc/ui-kit';

@Component({
  selector: 'ng-doc-search',
  templateUrl: './search.component.html',
  styleUrls: ['./search.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: [
    NgDocLetDirective,
    NgIf,
    NgDocButtonIconComponent,
    NgDocDropdownOriginDirective,
    NgDocIconComponent,
    NgDocDropdownComponent,
    NgDocInputWrapperComponent,
    NgDocInputStringDirective,
    FormsModule,
    NgDocAutofocusDirective,
    NgTemplateOutlet,
    NgDocFocusCatcherDirective,
    NgDocHotkeyDirective,
    NgDocTagComponent,
    NgDocDataListComponent,
    RouterLink,
    NgDocTextComponent,
    NgFor,
    NgDocSpinnerComponent,
    AsyncPipe,
    NgDocHighlighterPipe,
    NgDocExecutePipe,
    NgDocSanitizeHtmlPipe,
  ],
})
export class NgDocSearchComponent {
  @Input()
  @HostBinding('attr.data-ng-doc-mod')
  mod: 'input' | 'icon' = 'input';

  protected readonly dialog = inject(NgDocDialogService);

  open(): void {
    this.dialog.open(new NgDocComponentContent(NgDocSearchDialogComponent), {
      hasBackdrop: true,
      backdropClass: 'ng-doc-blur-backdrop',
      panelClass: 'ng-doc-transparent-dialog',
      positionStrategy: this.dialog.positionStrategy().centerHorizontally().top(),
    });
  }
}
