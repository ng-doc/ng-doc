---
name: ng-doc-developer
description: Developer guide for the NgDoc monorepo (Nx, Angular 22). It covers the repo layout, build/test/lint/serve commands, code style and commit rules, the Angular runtime libraries, the documentation site, the builder's new generator engine and legacy engine, and safety rules for agents. Use it for any code, test, build or docs change in this repository. Read SKILL.md first, then the reference file for each area you touch.
---

# NgDoc developer guide

NgDoc is a documentation engine for Angular projects. This Nx monorepo contains:

- the published `@ng-doc/*` packages;
- the builder that turns a docs tree into an Angular application;
- NgDoc's own documentation site, which is built with NgDoc.

This skill is the single source of truth for agents working here. It is registered for Codex under `.agents/skills/` and for Claude Code under `.claude/skills/`, where it is a symlink to the same directory. The root `AGENTS.md` points to it, and the root `CLAUDE.md` imports it. See also `CONTRIBUTING.md`.

## Map of the repository

| Area                                                                             | Path                                                                                      | Reference                                                             |
| -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Workspace, commands, CI                                                          | root, `tools/scripts`                                                                     | [repo-and-commands.md](references/repo-and-commands.md)               |
| Code style, tests, commits                                                       | everywhere                                                                                | [code-style.md](references/code-style.md)                             |
| Runtime UI, shared libraries, `ng add`                                           | `libs/app`, `libs/ui-kit`, `libs/core`, `libs/utils`, `libs/keywords-loaders`, `libs/add` | [angular-libraries.md](references/angular-libraries.md)               |
| Documentation site and authoring (pages, demos, playgrounds, keywords, API docs) | `apps/ng-doc`                                                                             | [docs-app.md](references/docs-app.md)                                 |
| New generator engine                                                             | `libs/builder/generator`                                                                  | [builder-generator.md](references/builder-generator.md)               |
| Generator tests, runner, coverage gates                                          | `libs/builder/generator/**/testing`, `tools/scripts/check-builder-modernization.mjs`      | [builder-testing.md](references/builder-testing.md)                   |
| Builders, hosts, legacy engine, shared builder code                              | `libs/builder/{engine,application,dev-server,templates,helpers,schematics}`               | [builder-legacy-and-hosts.md](references/builder-legacy-and-hosts.md) |
| Safety rules: shared `dist`, generated files, processes                          | everywhere                                                                                | [agent-safety.md](references/agent-safety.md)                         |

Reference paths are relative to this skill's directory, `.agents/skills/ng-doc-developer/`.

## Which references to read

Before you edit, read [agent-safety.md](references/agent-safety.md) and [code-style.md](references/code-style.md) once per session. Then read the reference for each area your task touches.

- **Anything under `libs/builder/generator/`:** read [builder-generator.md](references/builder-generator.md) and [builder-testing.md](references/builder-testing.md) before changing code. The engine has strict determinism, incremental-equality and commit invariants that are not obvious from any single file.
- **`libs/builder/templates`, `helpers`, `parsers`, `types`, `libs/core` or `libs/utils`:** these are shared by both engines and the runtime. Read [builder-legacy-and-hosts.md](references/builder-legacy-and-hosts.md).
- **Components, directives, pipes, services or styles in `libs/app` or `libs/ui-kit`, or the `ng add` schematics in `libs/add`:** read [angular-libraries.md](references/angular-libraries.md).
- **Pages, demos, playgrounds, keywords or API docs, or a new author-facing feature:** read [docs-app.md](references/docs-app.md).
- **Running, building or serving anything:** read [repo-and-commands.md](references/repo-and-commands.md).

## Global rules

1. **Scope.** Change only what the task needs.
   - Don't reformat, rename or migrate unrelated code.
   - Don't upgrade dependencies or tool versions.
   - Don't commit, push, publish or deploy unless asked.
2. **Verify, don't assume.** Before documenting or running a command, check that it exists: the `package.json` scripts, the `project.json` targets, and the runner's `--list`. Report exactly what ran and what passed.
3. **Tests travel with behaviour.**
   - Every behaviour change updates or adds tests in the framework the area already uses: Vitest `*.spec.ts` for libraries, the site and the legacy builder (`nx test <project>`), Vitest `*.vitest.ts` for the generator, `node --test` for tool scripts.
   - Never weaken a test, a coverage gate or a lint rule to get a green run.
4. **Lint and format.** Run `npx nx lint <project>` for touched projects. Formatting follows Prettier: single quotes, trailing commas, 100 columns.
5. **Public API is deliberate.** Anything exported from a library barrel is public. Exported declarations in files matched by the scopes in `apps/ng-doc/docs/ng-doc.api.ts` also appear in the site's API reference.
   - Document exports with JSDoc.
   - Treat renames and removals as breaking (a `BREAKING CHANGE:` footer; see code-style.md) and provide a migration path.
6. **Two engines, one product.** The legacy engine (`application`/`dev-server` builders) and the new generator (`vite-application`/`vite-dev-server` builders, Vite plugin, `ng-doc` CLI) both ship. There is no third host.
   - New features go into the generator.
   - Changes to shared templates or helpers must keep both working.
   - User-visible behaviour must match between them.
7. **Generator invariants are non-negotiable.** They are:

   - deterministic output;
   - incremental results byte-identical to the reference full path and to a cold build;
   - exact recorded dependencies;
   - fingerprinted caches;
   - the transactional commit (manifest last);
   - JSON-only worker transport;
   - complete production output.

   Every optimization needs a kill switch or reference path, and a differential test.

8. **The default development mode is the Vite/Analog dev host with physical files.** It is the only optimized development host. The virtual content mode (`developmentContent: 'virtual'`) was removed; don't reintroduce a virtual content transport without an explicit decision.
9. **The shared `dist` is live.**
   - `node_modules/@ng-doc/*` link into it.
   - Don't rebuild while a dev server or suite is using it; use `build-generator.mjs --outdir` for private builds.
   - Rebuild after source changes before trusting any end-to-end result. Details are in [agent-safety.md](references/agent-safety.md).
10. **Never edit generated output:** `dist/`, `ng-doc/`, `ng-doc-legacy/`, caches, coverage, `.runtime/` test workspaces, generator manifests or stages. Fix the source that generates them.
11. **Leave no processes.** Stop every server, watcher and browser you started. Never kill processes you didn't start. For Nx in agent shells, use `NX_DAEMON=false NX_NO_CLOUD=true NX_TUI=false`.
12. **Commits** follow Conventional Commits with a project scope, for example `fix(builder): …` or `feat(app): …`. Breaking changes use a `BREAKING CHANGE:` footer, never `!`; the release rules are in [code-style.md](references/code-style.md). The commit-msg hook runs commitlint.
13. **Language.** Code, comments, docs and commit messages are in English. Comments explain _why_ (invariants, ordering, platform quirks) and never reference internal task or ticket numbers.

## Definition of done

- [ ] The change is limited to the task, with tests added or updated next to the behaviour.
- [ ] Lint passes for touched projects (`npx nx lint <project>`), and changed files are formatted.
- [ ] The relevant suites pass:
  - Specs: `npx nx test <project>` (and `test-zoneless` for `app` and `ui-kit`).
  - Generator: the matching runner groups, with their coverage gates, plus a strict `tsc --noEmit` of the touched generator area. See [builder-testing.md](references/builder-testing.md).
- [ ] Shared builder code has been checked against both engines.
- [ ] Author-facing features are documented in `apps/ng-doc/docs`.
- [ ] No generated files have been edited, no processes are left running, and nothing is committed or published unless asked.
- [ ] The final report states the commands that ran and their results.

## Keeping this skill current

This skill is part of the codebase. When a change alters something it describes, update the relevant reference in the same change. That includes:

- an architecture or invariant;
- a command, target or runner group;
- an environment switch;
- a convention or a directory.

Keep SKILL.md short (overview, routing, global rules). Put details in `references/`, one focused file per area, and link any new file from the map above.

Only add rules that are lasting repository conventions. Don't add notes about a single task, experiment results or temporary workarounds.
