export interface NgDocSchema {
  buildTarget: string;
  main: string;
  watch?: boolean;
  ngDoc: {
    config: string;
  };
}
