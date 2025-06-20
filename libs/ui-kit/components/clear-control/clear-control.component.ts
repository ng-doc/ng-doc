import { AfterContentInit, ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NgDocInputHost } from '@ng-doc/ui-kit/classes/input-host';
import { NgDocButtonIconComponent } from '@ng-doc/ui-kit/components/button-icon';
import { NgDocIconComponent } from '@ng-doc/ui-kit/components/icon';
import { NgDocFocusableDirective } from '@ng-doc/ui-kit/directives/focusable';
import { DIControl, injectHostControl } from 'di-controls';

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

  constructor() {
    super({
      host: injectHostControl(),
    });
  }

  ngAfterContentInit(): void {
    if (this.inputHost?.inputControl) {
      this.inputHost.inputControl.changes
        .pipe(takeUntilDestroyed(this['destroyRef']))
        .subscribe(() => this.changeDetectorRef.detectChanges());
    }
  }

  get isVisible(): boolean {
    return this.inputHost?.inputControl?.hasValue || this.hasValue;
  }

  clear(): void {
    this.inputHost?.inputControl?.writeValueFromHost(null);
    this.updateModel(null);
  }
}
