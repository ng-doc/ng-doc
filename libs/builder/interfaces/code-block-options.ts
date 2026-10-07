export interface NgDocCodeBlockParams {
  language?: string;
  lineNumbers?: boolean;
  name?: string;
  group?: string;
  active?: boolean;
  file?: string;
  icon?: string;
  fileLineStart?: number;
  fileLineEnd?: number;
  /**
   * The snippet of `file` to show, from `file="./x.ts"#<id>`: the lines between the two
   * `snippet#<id>` markers. Only the Vite engine reads it.
   */
  snippet?: string;
  highlightedLines?: number[];
}
