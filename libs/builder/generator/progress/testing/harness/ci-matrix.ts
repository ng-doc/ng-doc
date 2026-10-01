import type { CiVendor, ProgressStyle } from '../../detect';

/**
 * The CI-like environment matrix. Every case runs the harness child
 * in a pipe (or a PTY where the vendor uses one) and checks the style, escape bytes and vendor
 * extras.
 */
export interface CiCase {
  name: string;
  env: NodeJS.ProcessEnv;
  /** Buildkite runs commands in a PTY by default. */
  pty?: boolean;
  expected: {
    ci: CiVendor | undefined;
    style: ProgressStyle;
    /** `OK` is coloured (SGR). No other escape bytes appear, except opt-in GitLab sections. */
    color: boolean;
    sections?: boolean;
    /** A vendor service line that must appear. */
    marker?: RegExp;
  };
}

export const CI_MATRIX: readonly CiCase[] = [
  {
    name: 'github',
    env: { CI: 'true', GITHUB_ACTIONS: 'true' },
    expected: { ci: 'github', style: 'lines', color: false },
  },
  {
    name: 'github-sections',
    env: { CI: 'true', GITHUB_ACTIONS: 'true', NGDOC_PROGRESS_SECTIONS: '1' },
    expected: {
      ci: 'github',
      style: 'lines',
      color: false,
      marker: /^::group::NgDoc: generating documentation/m,
    },
  },
  {
    name: 'gitlab',
    env: { CI: 'true', GITLAB_CI: 'true' },
    expected: { ci: 'gitlab', style: 'lines', color: false },
  },
  {
    name: 'gitlab-sections',
    env: { CI: 'true', GITLAB_CI: 'true', NGDOC_PROGRESS_SECTIONS: 'yes' },
    expected: {
      ci: 'gitlab',
      style: 'lines',
      color: false,
      sections: true,
      // The markers are terminal escape sequences.
      // eslint-disable-next-line no-control-regex
      marker: /\x1b\[0Ksection_start:\d+:ngdoc_generation\[collapsed=true\]\r\x1b\[0KNgDoc/,
    },
  },
  {
    name: 'azure',
    env: { TF_BUILD: 'True' },
    expected: {
      ci: 'azure',
      style: 'lines',
      color: false,
      marker: /^##vso\[task\.setprogress value=\d+;\]NgDoc: /m,
    },
  },
  {
    name: 'teamcity',
    env: { TEAMCITY_VERSION: '2025.1' },
    expected: {
      ci: 'teamcity',
      style: 'lines',
      color: false,
      marker: /^##teamcity\[progressMessage 'NgDoc: .*'\]$/m,
    },
  },
  {
    name: 'jenkins',
    env: { JENKINS_URL: 'http://ci', BUILD_NUMBER: '7' },
    expected: { ci: 'jenkins', style: 'lines', color: false },
  },
  {
    name: 'jenkins-nx-force-color',
    env: { JENKINS_URL: 'http://ci', FORCE_COLOR: 'true' },
    // eslint-disable-next-line no-control-regex
    expected: { ci: 'jenkins', style: 'lines', color: true, marker: /\x1b\[32mOK\x1b\[39m/ },
  },
  {
    name: 'buildkite-pty',
    env: { CI: 'true', BUILDKITE: 'true', TERM: 'xterm-256color' },
    pty: true,
    expected: { ci: 'buildkite', style: 'lines', color: true },
  },
  {
    name: 'circleci',
    env: { CI: 'true', CIRCLECI: 'true' },
    expected: { ci: 'circleci', style: 'lines', color: false },
  },
  {
    name: 'generic-ci',
    env: { CI: '1' },
    expected: { ci: 'generic', style: 'lines', color: false },
  },
  { name: 'plain-pipe', env: {}, expected: { ci: undefined, style: 'lines', color: false } },
  {
    name: 'dumb-pty',
    env: { TERM: 'dumb' },
    pty: true,
    expected: { ci: undefined, style: 'lines', color: false },
  },
  {
    name: 'no-color-beats-force-color',
    env: { CI: 'true', NO_COLOR: '1', FORCE_COLOR: 'true' },
    expected: { ci: 'generic', style: 'lines', color: false },
  },
  {
    name: 'azure-under-nx-prefix',
    env: { TF_BUILD: 'True', NX_TASK_TARGET_PROJECT: 'docs', NX_PREFIX_OUTPUT: 'true' },
    expected: { ci: 'azure', style: 'lines', color: false },
  },
];
