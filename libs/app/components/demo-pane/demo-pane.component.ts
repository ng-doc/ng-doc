import { NgComponentOutlet, NgFor, NgIf, NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  HostBinding,
  Input,
  OnInit,
  Type,
} from '@angular/core';
import { NgDocRootPage } from '@ng-doc/app/classes/root-page';
import { NgDocCodeComponent } from '@ng-doc/app/components/code';
import { NgDocFullscreenButtonComponent } from '@ng-doc/app/components/fullscreen-button';
import { NgDocDemoAsset } from '@ng-doc/app/interfaces';
import { asArray } from '@ng-doc/core/helpers/as-array';
import { NgDocDemoPaneActionOptions } from '@ng-doc/core/interfaces';
import {
  NgDocPaneBackDirective,
  NgDocPaneComponent,
  NgDocPaneFrontDirective,
  NgDocTabComponent,
  NgDocTabGroupComponent,
} from '@ng-doc/ui-kit';

@Component({
  selector: 'ng-doc-demo-pane',
  templateUrl: './demo-pane.component.html',
  styleUrls: ['./demo-pane.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: [
    NgDocPaneComponent,
    NgTemplateOutlet,
    NgDocPaneBackDirective,
    NgDocPaneFrontDirective,
    NgIf,
    NgFor,
    NgDocCodeComponent,
    NgDocTabGroupComponent,
    NgDocTabComponent,
    NgDocFullscreenButtonComponent,
    NgComponentOutlet,
  ],
})
export class NgDocDemoPaneComponent implements OnInit {
  @Input()
  componentName?: string;

  @Input()
  options: NgDocDemoPaneActionOptions = {};

  demo?: Type<unknown>;
  assets: NgDocDemoAsset[] = [];

  constructor(private readonly rootPage: NgDocRootPage) {}

  @HostBinding('class')
  protected get classes(): string | string[] {
    return this.options.class ?? '';
  }

  ngOnInit(): void {
    this.demo = this.getDemo();
    this.assets = this.getAssets();
  }

  private getDemo(): Type<unknown> | undefined {
    if (this.componentName) {
      return this.rootPage.page?.demos && this.rootPage.page.demos[this.componentName];
    }

    return undefined;
  }

  private getAssets(): NgDocDemoAsset[] {
    if (this.componentName) {
      return (
        (this.rootPage.demoAssets && this.rootPage.demoAssets[this.componentName]) ??
        []
      ).filter(
        (asset: NgDocDemoAsset) =>
          !this.options.tabs?.length || asArray(this.options.tabs).includes(asset.title),
      );
    }

    return [];
  }
}
