import {ModuleWithProviders, NgModule} from '@angular/core';
import {CommonModule} from '@angular/common';
import {NgDocRootModule} from './components/root/root.module';

@NgModule({
  imports: [CommonModule],
  exports: [NgDocRootModule],
})
export class NgDocModule {
  public static forRoot(): ModuleWithProviders<NgDocModule> {
    return {
      ngModule: NgDocModule,
    };
  }
}
