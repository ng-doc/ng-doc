import { ChangeDetectionStrategy, Component, DOCUMENT, inject } from '@angular/core';
import { NgDocThemeService } from '@ng-doc/app/services/theme';
import {
  NgDocButtonIconComponent,
  NgDocIconComponent,
  NgDocTooltipDirective,
} from '@ng-doc/ui-kit';

interface ToggleTheme {
  name: string;
  theme: string | null;
}

@Component({
  selector: 'ng-doc-theme-toggle',
  templateUrl: './theme-toggle.component.html',
  styleUrls: ['./theme-toggle.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgDocButtonIconComponent, NgDocTooltipDirective, NgDocIconComponent],
})
export class NgDocThemeToggleComponent {
  protected readonly themes: ToggleTheme[] = [
    { name: 'Auto', theme: 'auto' },
    { name: 'Light', theme: null },
    { name: 'Dark', theme: 'dark' },
  ];
  protected readonly documentElement = inject(DOCUMENT).documentElement;
  protected readonly themeService = inject(NgDocThemeService);

  get currentTheme(): ToggleTheme {
    const theme = this.documentElement.getAttribute('data-theme');

    return this.themes.find(({ theme: t }) => t === theme) ?? this.themes[0];
  }

  get nextTheme(): ToggleTheme {
    const index = this.themes.findIndex(({ theme }) => theme === this.currentTheme.theme);

    return this.themes[(index + 1) % this.themes.length];
  }

  toggleTheme(): void {
    const { theme } = this.nextTheme;

    this.themeService.set(theme ?? undefined);
  }
}
