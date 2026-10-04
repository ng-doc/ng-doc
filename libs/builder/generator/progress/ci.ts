import { appendFileSync } from 'node:fs';

import type { CiVendor } from './detect';

/**
 * CI vendor extras. None of them changes the text of a line.
 * - Azure `##vso[task.setprogress]` and TeamCity `progressMessage` are hidden progress signals and
 *   are on by default (decided); they follow the LINES cadence.
 * - GitHub groups, GitLab sections and the GitHub step summary are opt-in with
 *   `NGDOC_PROGRESS_SECTIONS=1` (decided).
 */

/** TeamCity service-message escaping. */
export function escapeTeamCity(text: string): string {
  return text.replace(/[|'[\]\n\r\u0085\u2028\u2029]/g, (char) => {
    switch (char) {
      case '\n':
        return '|n';
      case '\r':
        return '|r';
      case '\u0085':
        return '|x';
      case '\u2028':
        return '|l';
      case '\u2029':
        return '|p';
      default:
        return `|${char}`;
    }
  });
}

/**
 * Free text (routes, reasons, project names) must never start a CI service message: Azure and
 * TeamCity act on `##vso[`, `##[` and `##teamcity[` in any log line.
 */
export const neutralizeServiceMessages = (text: string): string =>
  // Every `#` of the run goes: removing only two would turn `####vso[` back into `##vso[`.
  text.replace(/#+(?=(?:vso|teamcity)?\[)/gi, '');

/** Azure logging commands end at the line end; the message must stay on one line. */
const oneLine = (text: string): string => text.replace(/[\r\n]+/g, ' ');

/** The hidden progress line for `vendor`, or `undefined` when the vendor has none. */
export function ciProgressMessage(
  vendor: CiVendor | undefined,
  text: string,
  percent: number | undefined,
): string | undefined {
  if (vendor === 'azure') {
    if (percent === undefined) return undefined;
    const value = Math.max(0, Math.min(100, Math.floor(percent)));
    return `##vso[task.setprogress value=${value};]${oneLine(text)}`;
  }
  if (vendor === 'teamcity') return `##teamcity[progressMessage '${escapeTeamCity(text)}']`;
  return undefined;
}

const SECTION = 'ngdoc_generation';

/** Opens a collapsible group; the summary line is printed after `sectionEnd`, so it stays visible. */
export function sectionStart(
  vendor: CiVendor | undefined,
  title: string,
  nowMs: number,
): string | undefined {
  if (vendor === 'github') return `::group::${oneLine(title)}`;
  if (vendor === 'gitlab')
    return `\x1b[0Ksection_start:${Math.floor(nowMs / 1000)}:${SECTION}[collapsed=true]\r\x1b[0K${oneLine(title)}`;
  return undefined;
}

export function sectionEnd(vendor: CiVendor | undefined, nowMs: number): string | undefined {
  if (vendor === 'github') return '::endgroup::';
  if (vendor === 'gitlab')
    return `\x1b[0Ksection_end:${Math.floor(nowMs / 1000)}:${SECTION}\r\x1b[0K`;
  return undefined;
}

/** Appends one markdown line to `$GITHUB_STEP_SUMMARY`. Failures are ignored: it is decoration. */
export function appendStepSummary(
  env: NodeJS.ProcessEnv,
  text: string,
  append: (file: string, data: string) => void = appendFileSync,
): boolean {
  const file = env['GITHUB_STEP_SUMMARY'];
  if (!file) return false;
  try {
    append(file, `${text.replace(/^NgDoc: /, '**NgDoc:** ')}\n`);
    return true;
  } catch {
    return false;
  }
}
