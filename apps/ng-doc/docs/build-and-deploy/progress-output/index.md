---
keyword: ProgressOutputPage
---

The new engine reports what it is doing while it builds the documentation. You see one line that
updates while the site builds, a summary when it is ready, and then one line for each edit. Progress
never changes the generated files. The legacy builders keep their own output.

## 👀 What you see

On a terminal, the first build shows a live line that is redrawn in place. It names the current
step, counts the pages of the steps that go page by page, and shows how much of the build is done:

```text
⠹ NgDoc [2/4] rendering 307/445 pages (50%) · 10s ━━━━━━──────
```

A build has four steps:

| Step      | What NgDoc does                                                                                     |
| --------- | --------------------------------------------------------------------------------------------------- |
| preparing | Starts its worker, reads the configuration, analyzes the TypeScript program and collects the pages. |
| rendering | Renders the content of every page, then combines the keywords.                                      |
| linking   | Links every page's keywords and assembles the generated files.                                      |
| writing   | Writes its cache, hands the result over and writes the generated files.                             |

The live line is cleared when the build ends, and also when the build is stopped, for example with
Ctrl-C. Every build then prints its diagnostics, followed by exactly one summary line, with the time
the main steps took:

```text
NgDoc: OK generated 445 pages in 17s; 4453 files written; analyze 2.8s, render 7.9s, link 2.5s, write 2.6s; 7 warnings
```

When the development server restarts and no file it read has changed, NgDoc publishes the pages of
its last run without generating them again and says so:

```text
NgDoc: OK restored 445 pages in 3.2s (inputs unchanged); 4453 files unchanged
```

A failed build ends with `NgDoc: FAILED generation failed after …` instead, and a build that the
`ng-doc` command stopped on Ctrl-C ends with `NgDoc: generation cancelled after …`. In the
development server, each edit that changes the site prints one line:

```text
NgDoc: updated 1 of 445 pages in 1.6s (/docs/get-started/installation)
```

An edit that is still running after two seconds first prints `NgDoc: updating (1 file changed)...`.
The Angular CLI builders and the `summary` mode leave this notice out and print only the edit's line.
When NgDoc could not limit the edit to the pages it reaches and rebuilds every page, the line says
why instead, for example `NgDoc: rebuilding all pages (discovery: configuration changed)...`. With
the targeted rebuild switched off (`NGDOC_TARGETED_REBUILD=0`), every edit rebuilds every page and
the line stays `updating`.
A failed edit prints `NgDoc: update failed (1 error above); the site keeps the last good version`,
and the next good edit starts with `NgDoc: error resolved;`.

When an environment switch from `*BuildersReference#environment-switches` is set to a value that
turns it off, or to `verify`, NgDoc prints one line that names it before its first build, because it
can make builds and edits slower. Every switch in that list counts, `NGDOC_ANGULAR_SHARED_PASS`
included:

```text
NgDoc: engine switches set: NGDOC_ANGULAR_SHARED_PASS=0 (one Angular pass per generated module); builds and edits may be slower
```

## Modes

| Mode      | Output                                                                                                                                     |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `auto`    | The default. A live line on a terminal that NgDoc has to itself, and plain lines otherwise: in CI, in a pipe and in shared Nx task output. |
| `live`    | A live line wherever the terminal can redraw, and plain lines elsewhere.                                                                   |
| `plain`   | Plain lines: one when each step starts, such as `NgDoc: [2/4] rendering 445 pages (35%), 5.3s elapsed`, and a heartbeat while it runs.     |
| `verbose` | Plain lines, plus the time of each phase, the reason for a full rebuild and background work such as the worker's warm-up.                  |
| `summary` | Only the summary and edit lines.                                                                                                           |
| `off`     | Nothing.                                                                                                                                   |
| `json`    | The `ng-doc` command only: progress events as JSON lines on stdout.                                                                        |

## Choose a mode

The first of these that is set wins:

1. The `--progress <mode>` flag of the `ng-doc` command. `--progress=<mode>` works too.
2. The `NGDOC_PROGRESS` environment variable, in every entry point. An unknown value prints one
   `NGDOC_PROGRESS_VALUE` warning and counts as unset.
3. The `progress` option of the Vite plugin (`*BuildersReference#vite-plugin`), or `ngDoc.progress`
   of the Angular CLI builders (`*BuildersReference#angular-cli-builders`). Both accept every mode
   except `json`. The dev server target's own value wins over its build target's.
4. The host's own quiet settings (below).
5. `auto`.

```bash
NGDOC_PROGRESS=plain npx vite
```

### Quiet hosts

- **Vite:** a `logLevel` of `warn`, `error` or `silent` turns progress off. A mode other than `auto`
  set by the variable or the plugin option still prints, straight to stderr and without timestamps.
- **Angular CLI builders:** the application option `progress: false` means `summary`.

An explicit `auto` still follows these settings.

## Where the output goes

| Entry point          | Output                                                                                                                                                                                                                                                                                                       |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `ng-doc` command     | Progress on stderr; diagnostics and the summary on stdout. With `--json`, stdout keeps only its JSON lines unless the mode is `json`. The `Generated …` line is printed only in `verbose`. After `ng-doc dev` starts a command, only summary and edit lines.                                                 |
| Vite plugin          | Vite's log. The live line is on stderr until the server listens; after that, lines carry Vite's timestamp.                                                                                                                                                                                                   |
| Vite builders        | The same as the Vite plugin, whose configuration they run. With a server bundle, `vite-application` still prints one summary: the server build uses the browser build's generation.                                                                                                                          |
| Angular CLI builders | The Angular CLI log. The live line is on stderr until the Angular build starts; after that, only summary and edit lines. The first build also reports its step and progress to Architect (`reportStatus`, `reportProgress`), for tools that run builders themselves; the Angular CLI and Nx don't show them. |

## Nx

- **One task in a terminal** (`nx run`, or a target without dependencies): the live line. It is at
  most 55 columns wide and has no bar, because Nx gives a task the width of the whole terminal, not
  of its pane.
- **The Nx terminal UI and `--output-style=stream`**: several tasks share the screen, so NgDoc prints
  short plain lines, such as `NgDoc: rendering 209/445 pages, 45%, 9.5s`, at most every 5 seconds.
  They wrap in a narrow pane without piling up.
- **Other `nx run-many` output styles**: Nx collects each task's output and prints it when the task
  ends. The Angular CLI builders then print plain lines. An `nx:run-commands` target, such as one
  that runs `ng-doc generate`, still runs in a terminal of its own, so NgDoc draws the live line and
  Nx prints its frames at the end. Set `NGDOC_PROGRESS=plain` in the target's `env` option, or pass
  `--progress plain`, when you run such a target with `nx run-many`.
- **Nx in CI**: `CI` wins over the task's terminal, so every target, `nx:run-commands` included,
  prints plain lines.
- **Nx cache:** Nx replays a task's terminal output on a cache hit, live-line redraws included.
  Teams that share an Nx remote cache can set `NGDOC_PROGRESS=plain`, so that replayed logs hold
  plain lines only.

## CI

In CI, `auto` prints plain ASCII lines with a heartbeat every 15 seconds. `CI` wins over a terminal,
so a CI system that runs commands in one, such as Buildkite, gets plain lines too. On Azure
Pipelines and TeamCity, NgDoc also sends the progress as their hidden progress messages, except in
`plain` mode and under Nx's prefixed output.

Set `NGDOC_PROGRESS_SECTIONS=1` (or `true`, `on`, `yes`) to fold the progress lines into a
collapsible group on GitHub Actions and GitLab CI. On GitHub Actions it also adds the summary to the
job's step summary. Nx's prefixed output (`--output-style=stream`) leaves both out, because a
prefix breaks their commands.

Colour marks only the `OK` and `FAILED` words. `NO_COLOR` turns it off even when `FORCE_COLOR` is set,
which Nx does for every task; otherwise `FORCE_COLOR` turns it on, or off with `0` or `false`.

{% index false %}

## Related

- `*DevServerAndBuildsPage`
- `*BuildersReference`
- `*TroubleshootingPage`

{% endindex %}

Next: `*PerformanceAndCachingPage`
