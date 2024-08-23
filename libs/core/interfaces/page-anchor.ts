export interface NgDocPageAnchor {
  /**
   * Real anchor value that was bound to the element id
   */
  anchorId: string;
  /**
   * Anchor value that can be used by user for keywords
   */
  anchor: string;
  /**
   * Title of the anchor
   */
  title: string;
  /**
   * Type of the anchor
   */
  type: NgDocPageAnchorType;
  /**
   * Scope of the anchor
   */
  scope?: NgDocScopedKeyword;
}

export interface NgDocScopedKeyword {
  key: string;
  title: string;
}

export type NgDocPageAnchorType = 'heading' | 'member';
