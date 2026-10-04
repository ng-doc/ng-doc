import { NgComponentOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, Type } from '@angular/core';
import { ActivatedRoute } from '@angular/router';

/**
 * Shows the demo of a demo page: the component in the route's `ngDocDemo` data, with the inputs
 * of the `inputs` query parameter (the JSON of the `inputs` option of the `demo` action).
 */
@Component({
  selector: 'ng-doc-demo-host',
  imports: [NgComponentOutlet],
  template: `
    @if (demo) {
      <ng-container *ngComponentOutlet="demo; inputs: inputs" />
    } @else {
      <p role="alert">This demo does not exist.</p>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NgDocDemoHostComponent {
  private readonly route = inject(ActivatedRoute);

  /** The demo component, or undefined on the page of a demo that does not exist. */
  protected readonly demo: Type<unknown> | undefined = this.route.snapshot.data['ngDocDemo'];

  /** The inputs of the demo. */
  protected readonly inputs: Record<string, unknown> = demoInputs(
    this.route.snapshot.queryParamMap.get('inputs'),
  );
}

/**
 * The inputs of the `inputs` query parameter: a JSON object, or none.
 * @param value - The parameter.
 */
function demoInputs(value: string | null): Record<string, unknown> {
  if (!value) return {};
  try {
    const parsed: unknown = JSON.parse(value);

    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}
