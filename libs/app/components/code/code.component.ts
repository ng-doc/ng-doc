import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostBinding,
  inject,
  Input,
} from '@angular/core';
import { NgDocCopyButtonComponent } from '@ng-doc/app/components/copy-button';
import { NgDocSanitizeHtmlPipe } from '@ng-doc/app/pipes';
import { NgDocPageProcessorComponent } from '@ng-doc/app/processors/page-processor';
import { linkProcessor } from '@ng-doc/app/processors/processors/link';
import { tooltipProcessor } from '@ng-doc/app/processors/processors/tooltip';
import { provideMainPageProcessor } from '@ng-doc/app/tokens';
import { NgDocIconComponent, NgDocTextComponent } from '@ng-doc/ui-kit';

@Component({
  selector: 'ng-doc-code',
  templateUrl: './code.component.html',
  styleUrls: ['./code.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    NgDocTextComponent,
    NgDocIconComponent,
    NgDocPageProcessorComponent,
    NgDocCopyButtonComponent,
    NgDocSanitizeHtmlPipe,
  ],
  viewProviders: [provideMainPageProcessor([linkProcessor, tooltipProcessor])],
})
export class NgDocCodeComponent {
  private elementRef = inject<ElementRef<HTMLElement>>(ElementRef);

  @Input()
  html: string = '';

  @Input()
  copyButton: boolean = true;

  @Input()
  name?: string;

  @Input()
  icon?: string;

  constructor() {}

  @HostBinding('attr.data-ng-doc-has-header')
  get hasHeader(): boolean {
    return !!this.name || !!this.icon;
  }

  get codeElement(): HTMLElement | null {
    return this.elementRef?.nativeElement.querySelector('code') ?? null;
  }
}
