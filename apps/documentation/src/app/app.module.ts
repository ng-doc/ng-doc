import {NgModule} from '@angular/core';
import {BrowserModule} from '@angular/platform-browser';

import {AppComponent} from './app.component';
import {NxWelcomeComponent} from './nx-welcome.component';
import {BrowserAnimationsModule} from '@angular/platform-browser/animations';
import {RouterModule} from '@angular/router';
import {NG_DOC_ROUTING} from '@ng-doc/app/generated';
import {NgDocModule} from '@ng-doc/app';

@NgModule({
  declarations: [AppComponent, NxWelcomeComponent],
  imports: [
    BrowserModule,
    BrowserAnimationsModule,
    NgDocModule.forRoot(),
    RouterModule.forRoot(NG_DOC_ROUTING),
  ],
  providers: [],
  bootstrap: [AppComponent],
})
export class AppModule {}
