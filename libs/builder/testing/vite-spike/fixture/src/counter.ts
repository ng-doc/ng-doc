import { Component, inject, input, model } from '@angular/core';
import { MESSAGE } from '@fixture/token';
@Component({
  selector: 'fixture-counter',
  standalone: true,
  templateUrl: './counter.html',
  styleUrl: './counter.scss',
})
export class CounterComponent {
  readonly message = inject(MESSAGE);
  readonly caption = input('Initial', { alias: 'label' });
  readonly value = model(2, { alias: 'amount' });
  increment() {
    this.value.update((value) => value + 1);
  }
}
