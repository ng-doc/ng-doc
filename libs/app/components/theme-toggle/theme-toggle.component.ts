import { ChangeDetectionStrategy, Component, computed, inject, Signal } from '@angular/core';
import { NgDocThemeService } from '@ng-doc/app/services/theme';
import { NgDocButtonIconComponent, NgDocTooltipDirective } from '@ng-doc/ui-kit';

interface ToggleTheme {
  name: string;
  theme: string | null;
}

const THEMES: readonly ToggleTheme[] = [
  { name: 'Auto', theme: 'auto' },
  { name: 'Light', theme: null },
  { name: 'Dark', theme: 'dark' },
];

/**
 * Button that switches the theme in turn: Auto (follows the system), Light and Dark.
 *
 * It shows the current theme and follows theme changes made elsewhere through the theme service.
 */
@Component({
  selector: 'ng-doc-theme-toggle',
  templateUrl: './theme-toggle.component.html',
  styleUrls: ['./theme-toggle.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgDocButtonIconComponent, NgDocTooltipDirective],
})
export class NgDocThemeToggleComponent {
  protected readonly themeService = inject(NgDocThemeService);

  /**
   * The current theme. A custom theme id counts as Auto, because the toggle does not offer it.
   */
  protected readonly currentTheme: Signal<ToggleTheme> = computed(() => {
    const theme: string | null = this.themeService.theme();

    return THEMES.find(({ theme: t }) => t === theme) ?? THEMES[0];
  });

  /**
   * The theme the next press switches to.
   */
  protected readonly nextTheme: Signal<ToggleTheme> = computed(
    () => THEMES[(THEMES.indexOf(this.currentTheme()) + 1) % THEMES.length],
  );

  /**
   * Switches to the next theme.
   */
  toggleTheme(): void {
    const { theme } = this.nextTheme();

    this.themeService.set(theme ?? undefined);
  }
}
