import { NgIf, NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  Input,
  OnChanges,
  OnInit,
  Renderer2,
} from '@angular/core';
import { Params, RouterLink } from '@angular/router';
import { NgDocDecodeUriComponentPipe } from '@ng-doc/app/pipes';
import { NgDocIconComponent } from '@ng-doc/ui-kit';

@Component({
  selector: 'ng-doc-page-link',
  templateUrl: './page-link.component.html',
  styleUrls: ['./page-link.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: [NgIf, RouterLink, NgTemplateOutlet, NgDocIconComponent, NgDocDecodeUriComponentPipe],
})
export class NgDocPageLinkComponent implements OnInit, OnChanges {
  @Input({ required: true })
  href: string = '';

  @Input()
  classes: string = '';

  protected isInCode: boolean = false;

  private link: HTMLAnchorElement | undefined;

  private readonly elementRef: ElementRef<HTMLElement> = inject(ElementRef);
  private readonly renderer: Renderer2 = inject(Renderer2);

  ngOnInit(): void {
    this.isInCode = this.elementRef.nativeElement.closest('code') !== null;
  }

  ngOnChanges(): void {
    this.link = this.renderer.createElement('a') as HTMLAnchorElement;
    this.link.href = this.href;
  }

  get isExternalLink(): boolean {
    return this.href.startsWith('http') || this.href.startsWith('mailto:');
  }

  get path(): string {
    return (!this.isExternalLink ? this.link?.pathname : this.href) ?? '';
  }

  get fragment(): string | undefined {
    return this.link?.hash.replace(/^#/, '') || undefined;
  }

  get queryParams(): Params {
    return Object.fromEntries(
      new URLSearchParams(this.link?.search.replace(/^\?/, '') ?? '').entries(),
    );
  }
}
