import {CommonModule} from '@angular/common';
import {NgModule} from '@angular/core';
import {NgDocIconModule, NgDocTagModule} from '@ng-doc/ui-kit';

@NgModule({
  imports: [CommonModule],
  // Declare you demo components here
  declarations: [],
  exports: [NgDocTagModule, NgDocIconModule],
})
export class PlaygroundModule {}
