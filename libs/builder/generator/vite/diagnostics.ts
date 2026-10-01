import type { BuildResult, Diagnostic } from '../contracts';

export function diagnosticText(diagnostic: Diagnostic): string {
  const source = diagnostic.source
    ? ` (${diagnostic.source.path}${diagnostic.source.line ? `:${diagnostic.source.line}` : ''})`
    : '';
  return `[${diagnostic.code}] ${diagnostic.message}${source}`;
}

export function resultError(result: BuildResult, fallback: string): Error {
  const diagnostics = result.diagnostics.filter((item) => item.severity === 'error');
  const text = (diagnostics.length ? diagnostics : result.diagnostics)
    .map(diagnosticText)
    .join('\n');
  return new Error(text || fallback);
}

export function hostDiagnostic(code: string, message: string): Diagnostic {
  return { code, message, severity: 'error', stage: 'host' };
}
