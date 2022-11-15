import {Provider} from '@angular/core';
import {NG_DOC_KEYWORDS_DICTIONARY} from '@ng-doc/app/tokens';

export const ngDocKeywordsDictionaryProvider: Provider = {
	provide: NG_DOC_KEYWORDS_DICTIONARY,
	useValue: {},
};
