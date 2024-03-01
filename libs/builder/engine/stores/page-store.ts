import { NgDocPage } from '@ng-doc/core';

import { ObservableMap } from '../../classes';
import { EntryMetadata } from '../builders/interfaces';

export const PageStore = new ObservableMap<string, EntryMetadata<NgDocPage>>();
