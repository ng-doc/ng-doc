import {CommonModule} from '@angular/common';
import {NgModule, Provider} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {provideTypeControl} from '@ng-doc/app/helpers';
import {NgDocComboboxModule} from '@ng-doc/ui-kit';

import {NgDocTypeAliasControlComponent} from './type-alias-control.component';

const provider: Provider = provideTypeControl('NgDocTypeAlias', NgDocTypeAliasControlComponent, {order: 10});

@NgModule({
    imports: [
    CommonModule,
    NgDocComboboxModule,
    FormsModule,
    NgDocTypeAliasControlComponent,
],
    providers: [provider],
    exports: [NgDocTypeAliasControlComponent],
})
export class NgDocTypeAliasControlModule {}
