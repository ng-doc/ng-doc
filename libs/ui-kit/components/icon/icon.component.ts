import { HttpClient } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  input,
  numberAttribute,
  Signal,
  untracked,
} from '@angular/core';
import {
  NG_DOC_ASSETS_PATH,
  NG_DOC_CUSTOM_ICONS_PATH,
  NG_REQUEST_BASE_PATH,
} from '@ng-doc/ui-kit/tokens';
import { NgDocIconSize } from '@ng-doc/ui-kit/types';

import { NgDocIconRegistry } from './icon-registry.service';

/**
 * Converts the `size` input of the icon, which can be set as an attribute (`size="24"`).
 * @param value - Value bound to the input.
 * @returns The icon size.
 */
function iconSizeAttribute(value: NgDocIconSize | `${NgDocIconSize}`): NgDocIconSize {
  return numberAttribute(value, 16) as NgDocIconSize;
}

/**
 * Shows an SVG icon from the UI Kit assets or from the application's custom icons.
 */
@Component({
  selector: 'ng-doc-icon',
  template: '',
  styleUrls: ['./icon.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[attr.data-ng-doc-icon]': 'icon()',
    '[attr.data-ng-doc-custom-icon]': 'customIcon()',
    '[attr.data-ng-doc-size]': 'size()',
  },
})
export class NgDocIconComponent {
  private readonly elementRef = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly registry = inject(NgDocIconRegistry);
  // Injected here rather than in the root registry, so that an `HttpClient` provided in a lazy
  // injector (route providers) is used.
  private readonly httpClient = inject(HttpClient);
  private readonly baseUrl = inject(NG_REQUEST_BASE_PATH);
  private readonly assetsPath: string = inject(NG_DOC_ASSETS_PATH, { optional: true }) ?? '';
  private readonly customIconsPath: string =
    inject(NG_DOC_CUSTOM_ICONS_PATH, { optional: true }) ?? '';

  /** Icon name */
  readonly icon = input<string>('');

  /** Custom icon name, if not set, `icon` will be used */
  readonly customIcon = input<string>('');

  /** Icon size */
  readonly size = input<NgDocIconSize, NgDocIconSize | `${NgDocIconSize}`>(16, {
    transform: iconSizeAttribute,
  });

  /** URL of the SVG file that the icon shows. */
  readonly href: Signal<string> = computed(() => {
    const customIcon: string = this.customIcon();
    const icon: string = this.icon();

    return (
      this.baseUrl +
      (customIcon
        ? `${this.customIconsPath}/${customIcon}.svg#${customIcon}`
        : `${this.assetsPath}/icons/${this.size()}/${icon}.svg#${icon}`)
    );
  });

  private readonly svg: Signal<string | null> = computed(() =>
    this.registry.get(this.href(), this.httpClient)(),
  );

  constructor() {
    // A URL that failed before is requested again when an icon starts showing it (a new icon or
    // a new `href`), and only then: the failure itself must not trigger another request.
    effect(() => {
      const href: string = this.href();

      untracked(() => this.registry.retry(href, this.httpClient));
    });

    // The markup is written as is: binding it through `[innerHTML]` would sanitize the SVG away.
    // The previous icon stays until the next one has loaded, so switching icons does not flash.
    effect(() => {
      const svg: string | null = this.svg();

      if (svg !== null) {
        this.elementRef.nativeElement.innerHTML = svg;
      }
    });
  }
}
