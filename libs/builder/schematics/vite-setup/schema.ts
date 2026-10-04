/** The options of the `vite-setup` schematic, which `ng add` runs for the Vite engine. */
export interface NgDocViteSetupSchema {
  /** The project to set up. */
  project: string;
  /** Do not install the added dependencies. */
  skipInstall?: boolean;
}
