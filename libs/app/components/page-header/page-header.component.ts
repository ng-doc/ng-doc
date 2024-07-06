import { ChangeDetectionStrategy, Component } from '@angular/core';
import { NgDocSanitizeHtmlPipe } from '@ng-doc/app/pipes';

@Component({
  selector: 'ng-doc-page-header',
  standalone: true,
  imports: [NgDocSanitizeHtmlPipe],
  templateUrl: './page-header.component.html',
  styleUrl: './page-header.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    ngSkipHydration: 'true',
  },
})
export class NgDocPageHeaderComponent {}
