import { ChangeDetectionStrategy, Component, HostListener } from '@angular/core';
import { DIStateControl, injectHostControl } from 'di-controls';

@Component({
  selector: '[ng-doc-button-toggle]',
  standalone: true,
  templateUrl: './button-toggle.component.html',
  styleUrl: './button-toggle.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NgDocButtonToggleComponent<T> extends DIStateControl<T> {
  constructor() {
    super({
      host: injectHostControl(),
    });
  }

  @HostListener('click')
  clickEvent() {
    this.updateModel(this.checked() ? null : this.value);
  }
}
