import { NgDocGlobalKeyword } from '../interfaces/keyword-map';

/**
 * NgDoc keywords loader function, that returns a promise with the global keywords
 */
export type NgDocKeywordsLoader = () => Promise<Record<string, NgDocGlobalKeyword>>;
