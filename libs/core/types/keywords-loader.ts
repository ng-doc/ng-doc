import {NgDocGlobalKeyword} from '@ng-doc/core';

/**
 * NgDoc keywords loader function, that returns a promise with the global keywords
 */
export type NgDocKeywordsLoader = () => Promise<Record<string, NgDocGlobalKeyword>>;
