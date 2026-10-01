/**
 * A Windows path with an upper-case drive letter. The drive letter is case-insensitive, and its
 * spellings meet in the Vite host: the engine publishes realpaths (`C:/…`), while Vite's root and
 * watcher follow the working directory as the shell reported it (a terminal may give `c:\…`).
 * Other paths are returned unchanged, so this is a no-op outside Windows.
 */
export function canonicalDrive(file: string): string {
  return /^[a-z]:/.test(file) ? `${file[0].toUpperCase()}${file.slice(1)}` : file;
}
