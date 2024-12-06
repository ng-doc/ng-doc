import { isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  inject,
  input,
  OnInit,
  PLATFORM_ID,
  signal,
} from '@angular/core';
import { NgDocSanitizeHtmlPipe } from '@ng-doc/app/pipes';
import { NgDocThemeService } from '@ng-doc/app/services/theme';
import { NG_DOC_MERMAID } from '@ng-doc/app/tokens';
import {
  MagnifierControllerComponent,
  NgDocMagnifierComponent,
  NgDocSpinnerComponent,
} from '@ng-doc/ui-kit';
import type { Mermaid } from 'mermaid';

let id = 0;

@Component({
  selector: 'ng-doc-mermaid-viewer',
  imports: [
    NgDocMagnifierComponent,
    MagnifierControllerComponent,
    NgDocSanitizeHtmlPipe,
    NgDocSpinnerComponent,
  ],
  templateUrl: './mermaid-viewer.component.html',
  styleUrl: './mermaid-viewer.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NgDocMermaidViewerComponent implements OnInit {
  graph = input.required<string>();

  protected readonly html = signal('');
  protected readonly pending = signal(true);
  protected readonly error = signal<Error | null>(null);
  protected readonly mermaid: Mermaid;

  protected readonly changeDetectorRef = inject(ChangeDetectorRef);
  protected readonly platform = inject(PLATFORM_ID);

  protected readonly id = `ng-doc-mermaid-viewer-${id++}`;

  constructor() {
    const mermaid = inject(NG_DOC_MERMAID, { optional: true });

    if (!mermaid) {
      throw new Error(
        'Mermaid is not provided. Make sure that you provided mermaid using "provideMermaid" function.',
      );
    }

    this.mermaid = mermaid;

    inject(NgDocThemeService)
      .themeChanges()
      .subscribe(async () => {
        const { svg } = await this.mermaid.render(this.id, this.graph());

        this.html.set(svg);
      });
  }

  async ngOnInit(): Promise<void> {
    if (isPlatformBrowser(this.platform)) {
      try {
        const { svg } = await this.mermaid.render(this.id, this.graph());

        this.html.set(svg);
        this.pending.set(false);
      } catch (error: unknown) {
        this.error.set(error as Error);
        this.pending.set(false);
      }
    }
  }
}
