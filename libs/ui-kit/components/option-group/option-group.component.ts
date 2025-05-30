import { NgIf } from '@angular/common';
import {
  AfterContentInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ContentChildren,
  DestroyRef,
  Directive,
  inject,
  QueryList,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NgDocOptionComponent } from '@ng-doc/ui-kit/components/option';
import { NgDocTextComponent } from '@ng-doc/ui-kit/components/text';
import { startWith } from 'rxjs/operators';

@Directive({
  selector: '[ngDocOptionGroupHeader]',
  standalone: true,
})
export class NgDocOptionGroupHeaderDirective {}

@Component({
  selector: 'ng-doc-option-group',
  templateUrl: './option-group.component.html',
  styleUrls: ['./option-group.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgIf, NgDocTextComponent],
})
export class NgDocOptionGroupComponent<T> implements AfterContentInit {
  @ContentChildren(NgDocOptionComponent, { descendants: true })
  options: QueryList<NgDocOptionComponent<T>> = new QueryList<NgDocOptionComponent<T>>();
  hasHeader: boolean = false;

  private readonly destroyRef = inject(DestroyRef);

  constructor(private changeDetectorRef: ChangeDetectorRef) {}

  ngAfterContentInit(): void {
    this.options.changes
      .pipe(startWith(this.options), takeUntilDestroyed(this.destroyRef))
      .subscribe((options: QueryList<NgDocOptionComponent<T>>) => {
        this.hasHeader = !!options.length;
        this.changeDetectorRef.markForCheck();
      });
  }
}
