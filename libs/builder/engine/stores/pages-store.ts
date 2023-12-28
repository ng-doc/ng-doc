import { NgDocPage } from '@ng-doc/core';

import { ObservableMap } from '../../classes';
import { EntryMetadata } from '../builders/interfaces';

export const PAGES_STORE = new ObservableMap<EntryMetadata<NgDocPage>>();
