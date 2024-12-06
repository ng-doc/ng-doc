import { NgIf, NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  Input,
  OnChanges,
  OnInit,
} from '@angular/core';
import { Params, RouterLink } from '@angular/router';
import { NgDocDecodeUriComponentPipe } from '@ng-doc/app/pipes';
import { NgDocIconComponent } from '@ng-doc/ui-kit';
import { LOCATION } from '@ng-web-apis/common';

@Component({
  selector: 'ng-doc-page-link',
  templateUrl: './page-link.component.html',
  styleUrls: ['./page-link.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgIf, RouterLink, NgTemplateOutlet, NgDocIconComponent, NgDocDecodeUriComponentPipe],
})
export class NgDocPageLinkComponent implements OnInit, OnChanges {
  @Input({ required: true })
  href: string = '';

  @Input()
  classes: string = '';

  protected isInCode: boolean = false;

  private link: URL | undefined;

  private readonly location = inject(LOCATION);
  private readonly elementRef: ElementRef<HTMLElement> = inject(ElementRef);

  ngOnInit(): void {
    this.isInCode = this.elementRef.nativeElement.closest('code') !== null;
  }

  ngOnChanges(): void {
    this.link = new URL(this.href, this.location.origin);
  }

  get isExternalLink(): boolean {
    return this.link?.origin !== this.location.origin;
  }

  get path(): string {
    return (!this.isExternalLink ? this.link?.pathname : this.href) ?? '';
  }

  get fragment(): string | undefined {
    return this.link?.hash.replace(/^#/, '') || undefined;
  }

  get queryParams(): Params {
    return Object.fromEntries(this.link?.searchParams.entries() ?? []);
  }
}
