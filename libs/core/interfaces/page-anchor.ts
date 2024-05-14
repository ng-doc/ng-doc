export interface NgDocPageAnchor {
  anchor: string;
  title: string;
  type: NgDocPageAnchorType;
}

export type NgDocPageAnchorType = 'heading' | 'member';
