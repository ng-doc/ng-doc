import { NgDocKeyword } from '@ng-doc/core';

import { ObservableMap } from '../../../classes';

class KeywordsStore extends ObservableMap<NgDocKeyword> {
  constructor() {
    super();
  }
}

export const keywordsStore = new KeywordsStore();
