import { NgDocPlatform } from '../types';
/**
 * The repository configuration interface.
 */
export interface NgDocRepoConfig {
  /**
   * The URL of the repository (e.g. "https://github.com/ng-doc/ng-doc")
   */
  url: string;
  /**
   * The develop branch name (e.g. "master"/"main")
   */
  mainBranch: string;
  /**
   * The release branch name (e.g. "release"), uses to generate correct links for the "View source" button
   */
  releaseBranch: string;
  /**
   * The platform name (e.g. "github"/"gitlab")
   */
  platform?: NgDocPlatform;
}
