import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { NgDocSanitizeHtmlPipe } from '@ng-doc/app/pipes';
import { NgDocPageProcessorComponent } from '@ng-doc/app/processors';

@Component({
  selector: 'ng-doc-page-header',
  standalone: true,
  imports: [CommonModule, NgDocPageProcessorComponent, NgDocSanitizeHtmlPipe],
  templateUrl: './page-header.component.html',
  styleUrl: './page-header.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    ngSkipHydration: 'true',
  },
})
export class NgDocPageHeaderComponent {
  @Input({ required: true })
  headerContent!: string;
}
