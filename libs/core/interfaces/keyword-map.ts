export const KEYWORD_ALLOWED_LANGUAGES = ['html'] as const;
export type NgDocKeywordLanguage = (typeof KEYWORD_ALLOWED_LANGUAGES)[number];
export type NgDocKeywordType = 'link';

export interface NgDocKeyword {
  title: string;
  path: string;
  description?: string;
  type?: NgDocKeywordType;
  languages?: NgDocKeywordLanguage[];
}

/**
 * Global keyword configuration.
 */
export interface NgDocGlobalKeyword {
  /**
   * Keyword title that will be displayed in the link.
   * If not provided, the keyword will be displayed as is.
   */
  title?: string;
  /**
   * Url that will be used to generate the link.
   */
  url: string;
  /**
   * Description that will be displayed in a tooltip on hover.
   */
  description?: string;
  /**
   * Determines how the keyword should be displayed. (rendered as a link in inline code by default)
   */
  type?: NgDocKeywordType;
}
