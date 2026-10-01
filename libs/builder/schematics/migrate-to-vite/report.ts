import { FindingLevel, MigrationFinding } from './analyze';
import { DependencyMismatch } from './setup/dependencies';

const SECTIONS: Array<{ level: FindingLevel; title: string; intro: string }> = [
  {
    level: 'blocking',
    title: 'Blocking',
    intro: 'The project was not migrated, and nothing was changed. Resolve these first:',
  },
  {
    level: 'manual',
    title: 'Needs a manual change',
    intro: 'These were not migrated. The site can behave differently until you handle them:',
  },
  {
    level: 'migrated',
    title: 'Migrated',
    intro: 'These options and settings moved to the Vite configuration or the new targets:',
  },
  {
    level: 'dropped',
    title: 'Dropped',
    intro: 'These have no effect under Vite, or Vite already behaves this way:',
  },
];

/** Everything the report describes besides the findings. */
export interface ReportInput {
  project: string;
  findings: MigrationFinding[];
  configFile?: string;
  targets?: { [name: string]: string };
  created?: string[];
  modified?: string[];
  deleted?: string;
  /** The generated folder both engines write. */
  generatedFolder?: string;
  dependencies?: { [name: string]: string };
  mismatches?: DependencyMismatch[];
}

function unique(findings: MigrationFinding[]): MigrationFinding[] {
  const seen = new Set<string>();
  return findings.filter((finding) => {
    const key = `${finding.level}\u0000${finding.subject}\u0000${finding.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Renders the migration report as Markdown. It depends only on its input, never on the time or on
 * what an earlier run did, so running the migration again rewrites the same report.
 */
export function renderReport(input: ReportInput): string {
  const findings = unique(input.findings);
  const blocked = findings.some((finding) => finding.level === 'blocking');
  const lines = [`# NgDoc migration to the Vite engine: ${input.project}`, ''];
  if (!blocked) {
    lines.push('## Changes', '');
    for (const [name, legacy] of Object.entries(input.targets ?? {})) {
      lines.push(
        `- Target \`${name}\` runs the Vite engine; the original is kept as \`${legacy}\`.`,
      );
    }
    for (const file of input.created ?? []) lines.push(`- Created \`${file}\`.`);
    for (const file of input.modified ?? []) lines.push(`- Changed \`${file}\`.`);
    if (input.deleted) {
      lines.push(
        `- Deleted the legacy generated folder \`${input.deleted}\`; the Vite engine writes it again.`,
      );
    }
    for (const [name, version] of Object.entries(input.dependencies ?? {})) {
      lines.push(`- Added \`${name}@${version}\` to \`devDependencies\`.`);
    }
    for (const mismatch of input.mismatches ?? []) {
      lines.push(
        `- \`${mismatch.name}\` is \`${mismatch.found}\`; the Vite engine is tested with \`${mismatch.expected}\`.`,
      );
    }
    lines.push('');
  }
  for (const section of SECTIONS) {
    const items = findings.filter((finding) => finding.level === section.level);
    if (!items.length) continue;
    lines.push(`## ${section.title}`, '', section.intro, '');
    for (const finding of items) lines.push(`- \`${finding.subject}\`: ${finding.message}`);
    lines.push('');
  }
  if (!blocked) {
    lines.push(
      '## Next steps',
      '',
      '1. Install the dependencies if the schematic did not (`npm install`).',
      '2. Run `ng serve` and `ng build`, and compare the pages with the legacy build (`ng run ' +
        `${input.project}:build-legacy\`).`,
      `3. Both engines write \`${input.generatedFolder ?? `ng-doc/${input.project}`}\`. Delete it ` +
        'whenever you switch between the `-legacy` targets and the Vite targets: the Vite engine ' +
        "refuses files it didn't write (`OUTPUT_UNOWNED_COLLISION`), and the legacy engine " +
        "replaces the Vite engine's files.",
      '4. Commit the changes, including this folder if you want to keep `--revert` available.',
      '',
      '## Roll back',
      '',
      `Run \`ng g @ng-doc/builder:migrate-to-vite --project ${input.project} --revert\`. It restores the`,
      'original targets and the changed files, and deletes the files it created unless you edited',
      'them. It keeps the added dependencies. Your version control remains the primary way back.',
      '',
    );
  }
  return lines.join('\n');
}
