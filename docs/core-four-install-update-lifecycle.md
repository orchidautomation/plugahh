# Core-Four Install And Update Lifecycle

Last updated: 2026-05-13

This doc explains the practical install, update, and reload behavior for the four primary Pluxx targets:

- Claude Code
- Cursor
- Codex
- OpenCode

Use this doc when the question is not “what files does the host support?” but:

- how does a user install the plugin
- how does a user update it later
- how does the host pick up the new version
- does the host need a reload or a restart

For the official-doc-backed host capability audit, use [Core-Four Provider Docs Audit](./core-four-provider-docs-audit.md).

## Lifecycle Matrix

| Host | Install surface | Update flow | Pick up changes | Notes |
|---|---|---|---|---|
| Claude Code | Plugin marketplace or local install path | rerun install flow or update marketplace source | `/reload-plugins` | Claude has the cleanest documented reload story |
| Cursor | local plugin dir / local plugin install | replace local bundle or rerun installer | `Developer: Reload Window` or restart Cursor | official docs support reload-window or restart behavior |
| Codex | local plugin dir plus marketplace catalog entry | replace local bundle or rerun installer | use `Plugins > Refresh` if available in the current UI, otherwise restart Codex | plugin-bundled MCP servers may show on the plugin detail page without appearing in the global MCP servers page |
| OpenCode | local plugin dir, entry wrapper, or config-based plugin loading | replace local bundle or update config/plugin reference | restart or reload OpenCode | the supplied docs do not document a dedicated hot-reload plugin command |

## Important Distinction

There are two different update cases:

1. editing a local skill or config file that the host may notice quickly
2. replacing an installed plugin bundle that the host may only notice on refresh or restart

Pluxx should treat plugin updates conservatively.

That means:

- Claude Code: tell the user to run `/reload-plugins`
- Cursor: tell the user to use `Developer: Reload Window` or restart
- Codex: tell the user to use `Plugins > Refresh` if present in the current UI, otherwise restart
- OpenCode: tell the user to restart or reload

## Codex Note

The official Codex plugin docs audited in April 2026 still describe plugin updates in restart-oriented terms.

Separately, the current Codex desktop UI observed on 2026-04-23 also exposes a plugin refresh action in the Plugins view.

So the most truthful current guidance is:

- first-party docs basis: restart after updating the local plugin bundle
- current observed UI: use `Plugins > Refresh` if available
- safe fallback: restart Codex

Codex plugin-bundled MCP visibility has one extra wrinkle.

When a Pluxx-generated Codex plugin includes `.mcp.json`, Codex may display that MCP server inside the plugin detail page while not listing it in the global **MCP servers** settings page. That does not automatically mean the MCP failed to install. The safer check is:

- run `pluxx verify-install --target codex`
- inspect the installed bundle with `pluxx doctor --consumer ~/.codex/plugins/<plugin-name>`
- refresh/restart Codex if the plugin UI still shows stale state
- confirm tools are visible from the plugin inside chat

If the installed Codex bundle also declares plugin-bundled hooks, `doctor --consumer` and `verify-install` now warn when the checked project and user Codex config layers do not enable `[features] plugin_hooks = true`. These warnings do not mean the bundle is malformed. They mean plugin-bundled hook activation is missing a known prerequisite, not that activation is guaranteed once that prerequisite exists. The general `hooks = true` flag covers non-plugin hook config and defaults on, while `codex_hooks` is deprecated and should not be treated as a plugin-bundled hook fallback.

Those consumer checks now also warn when the checked project is not trusted in the user Codex config, because Codex can keep project-local hooks disabled until that trust entry exists. `verify-install` now carries those `doctor --consumer` issue details through directly, so operators see the specific warning code, explanation, and fix instead of only a warning count.

If the installed Codex bundle also includes `.codex/config.generated.toml`, `doctor --consumer` and `verify-install` now inspect the checked project and user `config.toml` layers for matching per-tool `approval_mode = "approve"` stanzas. When those generated approvals have not been merged yet, Pluxx warns explicitly instead of assuming the companion file was actually applied. This is still an external merge step, not plugin-bundled enforcement.

The newest live Codex proof on 2026-05-13 narrowed the remaining gap further:

- Pluxx now emits the official nested Codex hook shape at `hooks/hooks.json`
- the maintained `bun scripts/probe-codex-hooks-runtime.ts --json` probe now runs isolated authenticated headless `codex exec` checks against project-local hooks
- that probe currently reports `headless-response-no-hook` for `hooks-no-trust`, `hooks-trusted`, and `codex-hooks-trusted`: each scenario returns `OK`, each emits `turn.completed`, and none executes the hook side effect
- the maintained `bun scripts/probe-codex-hooks-interactive-runtime.ts --json` probe now checks trusted `UserPromptSubmit` and `SessionStart` scenarios against project-local `.codex/hooks.json`
- on May 13, 2026, that maintained interactive probe timed out with no hook side effect and no `/hooks` review gate for:
  - `user-prompt-submit-codex-hooks-trusted`
  - `user-prompt-submit-hooks-trusted`
  - `session-start-codex-hooks-trusted-unreviewed`
  - `session-start-hooks-trusted-unreviewed`
- the `codex_hooks` prompt scenario emitted `"[features].codex_hooks is deprecated. Use [features].hooks instead."`
- the optional `--include-enable-hooks-cli` probe scenarios sharpen that further: headless `enable-hooks-trusted` still returned `OK` with no hook side effect, and trusted interactive `user-prompt-submit-enable-hooks-trusted` plus `session-start-enable-hooks-trusted` still timed out with no hook side effect and no `/hooks` review gate

Treat that as a runtime activation caveat plus a current runtime/docs drift, not a bundle-shape defect. The remaining live-proof gap is trusted-and-reviewed interactive hook execution, plus whether reviewed hooks can ever fire headlessly under `codex exec`.

If a Codex plugin-owned MCP needs an API key, install-time `userConfig` is the expected Pluxx path. Codex may not provide a global MCP settings form for that plugin-owned secret, so reinstall with the real env var exported or rerun the installer interactively. Generated `pluxx publish` installer scripts should prompt consumers for required secrets, materialize them into the installed bundle, reject obvious placeholder values, and let `doctor --consumer` warn if an older install contains one.

## Installer-Owned Runtime Scripts

Some files are intentionally installer-owned after a local install.

The most important current example is:

- `scripts/check-env.sh`

When Pluxx materializes required `userConfig` into an installed local bundle, install rewrites `scripts/check-env.sh` into a no-op marker file.

That means plugin runtime must not depend on sourcing or chaining through `scripts/check-env.sh` for critical startup behavior.

Treat it as:

- install-time validation only
- mutable after install
- unsafe as a runtime dependency for MCP startup or richer startup hooks

This now exists as an explicit product contract because SendLens failed in Claude after install when runtime startup still sourced `check-env.sh` even though install had already rewritten it.

## Claude Local Stdio Runtime Contract

Claude Code should not be treated as guaranteeing plugin-root cwd for stdio MCP launch.

For project-local Claude stdio runtimes, the generated `.mcp.json` should anchor runtime paths under `${CLAUDE_PLUGIN_ROOT}` instead of assuming relative `./...` paths will resolve from the plugin root after install.

The practical rule is:

- relative source paths in a Pluxx project are fine
- generated Claude bundle output should be plugin-root anchored for local stdio runtime paths
- plugin authors should reason about installed Claude runtime using `${CLAUDE_PLUGIN_ROOT}`, not cwd assumptions

## Portable Native Runtime Pattern

If a plugin needs native Node dependencies such as `@duckdb/node-api`, do not assume a CI-built `node_modules` tree is portable across user machines.

The safer pattern is:

- `load-env.sh` for runtime env loading
- `bootstrap-runtime.sh` for first-run local native dependency install
- `start-mcp.sh` as the MCP entrypoint
- no runtime dependence on installer-mutated `check-env.sh`

This is now also a compiler-owned contract, not only doc guidance:

- `lint` and `doctor` read from one shared runtime-script contract for the installer-owned `check-env.sh` rule
- the recommended portable runtime role split is centralized alongside that rule so follow-on runtime validation work can reuse it instead of restating it
- Codex local installs now rewrite plugin-owned stdio MCP command/arg paths to absolute installed plugin paths so installed MCP launch does not depend on the active workspace cwd
- source-project runtime payload checks now treat bundled `scripts/`, `assets/`, and `passthrough` payload as one runtime surface when validating local stdio MCP startup paths
- `doctor --consumer` now also reports which known runtime script-role files are actually present in an installed bundle
- `install`, `doctor --consumer`, and `verify-install` now fail installed bundles whose real stdio entry scripts still chain runtime startup back through installer-owned `scripts/check-env.sh`
- `doctor --consumer` and `verify-install` now also smoke-launch installed stdio MCP commands, so an installed bundle fails if its runtime exits immediately instead of only checking file presence

This is the pattern that stabilized SendLens on macOS after the earlier Linux-built `node_modules` release failed to run with DuckDB native bindings.

## What Pluxx Should Emit

Pluxx install and publish surfaces should communicate lifecycle behavior like this:

- Claude Code: `/reload-plugins`
- Cursor: `Developer: Reload Window` or restart
- Codex: `Plugins > Refresh` if available, otherwise restart; plugin-bundled MCP may be visible from the plugin detail page rather than the global MCP servers page
- OpenCode: restart or reload

That is the wording users should see in:

- `pluxx install`
- generated installer scripts
- host-facing docs
- walkthroughs and demo assets

The repo now also asserts these follow-up notes directly in install-surface tests, so lifecycle wording is no longer only doc guidance.

## No-Context Install Success Contract

`pluxx install`, `pluxx test --install`, `pluxx autopilot --install`, and generated release installers should leave a user with the same minimum next-step clarity:

- which host bundle was installed
- where that host-visible bundle lives
- the exact `pluxx verify-install --target <host>` command to run next
- the host-specific reload or restart action
- auth guidance before install, not after the user opens a host UI that may not expose plugin-owned MCP secrets

When verification fails, `pluxx verify-install` should print a concrete recovery action:

- missing build: run `pluxx build --target <host>`
- missing install: run `pluxx install --target <host>`
- stale symlink or stale version: rerun install for that host
- Codex cache mismatch: refresh plugins if available or restart Codex
- unknown consumer failure: run `pluxx doctor --consumer <installed-path>`

When verification passes with warnings, `pluxx verify-install` should still print the concrete issue code, explanation, and fix for those warnings instead of hiding them behind a count.
