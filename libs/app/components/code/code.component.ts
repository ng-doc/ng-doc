import { NgIf } from '@angular/common';
import { ChangeDetectionStrategy, Component, ElementRef, HostBinding, Input } from '@angular/core';
import { NgDocCopyButtonComponent } from '@ng-doc/app/components/copy-button';
import { NgDocPageProcessorComponent } from '@ng-doc/app/processors/page-processor';
import {
  NgDocButtonIconComponent,
  NgDocIconComponent,
  NgDocSmoothResizeComponent,
  NgDocTextComponent,
  NgDocTooltipDirective,
} from '@ng-doc/ui-kit';

@Component({
  selector: 'ng-doc-code',
  templateUrl: './code.component.html',
  styleUrls: ['./code.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: [
    NgIf,
    NgDocTextComponent,
    NgDocButtonIconComponent,
    NgDocTooltipDirective,
    NgDocSmoothResizeComponent,
    NgDocIconComponent,
    NgDocPageProcessorComponent,
    NgDocCopyButtonComponent,
  ],
})
export class NgDocCodeComponent {
  @Input()
  html: string = '';

  @Input()
  copyButton: boolean = true;

  @Input()
  name?: string;

  @Input()
  icon?: string;

  @Input()
  lineNumbers: boolean = false;

  constructor(private elementRef: ElementRef<HTMLElement>) {}

  @HostBinding('attr.data-ng-doc-has-header')
  get hasHeader(): boolean {
    return !!this.name || !!this.icon;
  }

  get codeElement(): HTMLElement | null {
    return this.elementRef?.nativeElement.querySelector('code') ?? null;
  }
}
