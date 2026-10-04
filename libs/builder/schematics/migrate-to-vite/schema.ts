/** The options of `ng g @ng-doc/builder:migrate-to-vite`. */
export interface NgDocMigrateToViteSchema {
  /** The project to migrate (default: the only project on the legacy builders). */
  project?: string;
  /** Undo an earlier migration of the project. */
  revert?: boolean;
  /** The Vite configuration file to create, workspace-relative. */
  viteConfig?: string;
  /** The root component's file, workspace-relative. */
  rootComponent?: string;
  /** Do not install the added dependencies. */
  skipInstall?: boolean;
}
