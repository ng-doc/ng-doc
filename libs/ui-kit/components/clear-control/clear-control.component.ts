import {
  AfterContentInit,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NgDocInputHost } from '@ng-doc/ui-kit/classes/input-host';
import { NgDocButtonIconComponent } from '@ng-doc/ui-kit/components/button-icon';
import { NgDocIconComponent } from '@ng-doc/ui-kit/components/icon';
import { NgDocFocusableDirective } from '@ng-doc/ui-kit/directives/focusable';
import { DIControl, injectHostControl } from 'di-controls';

/**
 * Button that clears the value of its host control and of the input of the surrounding input
 * host. It is shown only while there is a value to clear.
 */
@Component({
  selector: 'ng-doc-clear-control',
  templateUrl: './clear-control.component.html',
  styleUrls: ['./clear-control.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgDocButtonIconComponent, NgDocFocusableDirective, NgDocIconComponent],
})
export class NgDocClearControlComponent<T> extends DIControl<T> implements AfterContentInit {
  protected readonly inputHost: NgDocInputHost<T> | null = inject(NgDocInputHost, {
    optional: true,
  });
  private readonly clearControlDestroyRef = inject(DestroyRef);

  constructor() {
    super({
      host: injectHostControl(),
    });
  }

  ngAfterContentInit(): void {
    this.inputHost?.inputControl?.changes
      .pipe(takeUntilDestroyed(this.clearControlDestroyRef))
      .subscribe(() => this.changeDetectorRef.markForCheck());
  }

  /** Whether there is a value to clear. */
  get isVisible(): boolean {
    return this.inputHost?.inputControl?.hasValue || this.hasValue;
  }

  /** Clears the value. */
  clear(): void {
    this.inputHost?.inputControl?.writeValueFromHost(null);
    this.updateModel(null);
  }
}
