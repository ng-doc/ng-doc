import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { NgDocColor, NgDocTagComponent } from '@ng-doc/ui-kit';

/** A color for the tags with a label. */
export interface TagCloudAccent {
  tag: string;
  color: NgDocColor;
}

/** One tag of the cloud, ready to render. */
interface TagCloudItem {
  label: string;
  size: number;
  color: NgDocColor;
}

@Component({
  selector: 'ng-doc-tag-cloud',
  template: `
    @for (item of items(); track $index) {
      <ng-doc-tag [color]="item.color" [style.font-size.px]="item.size">{{
        item.label
      }}</ng-doc-tag>
    } @empty {
      <span>No tags</span>
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgDocTagComponent],
})
export class TagCloudComponent {
  /** The labels of the tags, in order. */
  readonly tags = input<string[]>(['Angular', 'NgDoc', 'Playground']);

  /** The font size of each tag in pixels, by position. A tag without one is 14px. */
  readonly sizes = input<number[]>();

  /** The colors of some tags. The others are `primary`. */
  readonly accents = input<TagCloudAccent[]>([{ tag: 'NgDoc', color: 'success' }]);

  protected readonly items = computed<TagCloudItem[]>(() =>
    this.tags().map((label: string, index: number) => ({
      label,
      size: this.sizes()?.[index] ?? 14,
      color:
        this.accents().find((accent: TagCloudAccent) => accent.tag === label)?.color ?? 'primary',
    })),
  );
}
