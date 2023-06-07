import {NgDocGlobalKeyword} from '@ng-doc/core';

/**
 * NgDoc keyword loader function, that returns a promise with the global keywords
 */
export type NgDocKeywordLoader = () => Promise<Record<string, NgDocGlobalKeyword>>;
