# Pluxx Queue

Last updated: 2026-05-13

## Doc Links

- Role: short operational queue
- Related:
  - [docs/start-here.md](../start-here.md)
  - [master-backlog.md](./master-backlog.md)
  - [success-checklist.md](./success-checklist.md)
  - [docs/roadmap.md](../roadmap.md)
  - [docs/oss-wedge-and-trust-layer.md](../oss-wedge-and-trust-layer.md)
  - [docs/flagship-docs-ops-plugin.md](../flagship-docs-ops-plugin.md)
  - [docs/platform-change-ops-reference-plugin.md](../platform-change-ops-reference-plugin.md)
  - [docs/docs-ops-core-four-proof.md](../docs-ops-core-four-proof.md)
  - [docs/exa-research-example.md](../exa-research-example.md)
  - [docs/pluxx-plugin-surface-audit.md](../pluxx-plugin-surface-audit.md)
  - [docs/pluxx-self-hosted-core-four-proof.md](../pluxx-self-hosted-core-four-proof.md)
  - [docs/core-four-provider-docs-audit.md](../core-four-provider-docs-audit.md)
  - [docs/core-four-reliability-register.md](../core-four-reliability-register.md)
  - [docs/core-four-translation-hit-list.md](../core-four-translation-hit-list.md)
  - [author-once-hardening.md](./author-once-hardening.md)
  - [Linear](https://linear.app/orchid-automation)
- Update together:
  - [docs/start-here.md](../start-here.md)
  - [master-backlog.md](./master-backlog.md)
  - [docs/roadmap.md](../roadmap.md)

This file is the short operational queue for Pluxx.

If you are new to the repo, read [docs/start-here.md](../start-here.md) first.

If you want the broadest “make sure we are not missing anything” checklist, use [docs/todo/success-checklist.md](./success-checklist.md).

For broader context, use:

- [docs/todo/master-backlog.md](./master-backlog.md)
- [docs/todo/success-checklist.md](./success-checklist.md)
- [docs/roadmap.md](../roadmap.md)
- [docs/oss-wedge-and-trust-layer.md](../oss-wedge-and-trust-layer.md)
- [docs/enterprise-adoption-thesis.md](../enterprise-adoption-thesis.md)
- [docs/status-quo-vs-pluxx-story.md](../status-quo-vs-pluxx-story.md)
- [docs/strategy/docs-url-ingestion.md](../strategy/docs-url-ingestion.md)
- [docs/strategy/gh-skill-and-agent-skills-note.md](../strategy/gh-skill-and-agent-skills-note.md)
- [docs/strategy/pluxx-plugin-distribution-strategy.md](../strategy/pluxx-plugin-distribution-strategy.md)
- [docs/strategy/pluxx-plugin-operating-model.md](../strategy/pluxx-plugin-operating-model.md)
- [docs/core-four-provider-docs-audit.md](../core-four-provider-docs-audit.md)
- [docs/core-four-maintenance-routine.md](../core-four-maintenance-routine.md)
- [Linear workspace](https://linear.app/orchid-automation)

## Current Truth

The core-four compiler sprint is done.

The initial author-once hardening tranche is also materially done.

- the originally identified primitive, registry, migrate, behavioral-proof, and plugin-operator gaps are now closed as one core execution block
- the remaining work is narrower:
  - public proof and packaging polish
  - future host-refresh maintenance
  - extra behavioral depth for edge-case flows
  - continued average-user UX simplification through the self-hosted plugin

- canonical compiler buckets are defined
- host capability registry and translation modes exist
- semantic migration now preserves more host intent
- native compilation is materially stronger across Claude Code, Cursor, Codex, and OpenCode
- `doctor`, `lint`, and `build` explain preserve/translate/degrade/drop more clearly
- `pluxx verify-install` is shipped as an explicit host-state check
  - installed-bundle regression coverage now explicitly catches corrupted Cursor hook bundles, missing Cursor rules payloads, and stale installed Cursor versions
  - installed-bundle regression coverage now explicitly catches missing OpenCode host entry files, missing synced OpenCode skills, and stale installed OpenCode package versions
- `pluxx test --install` verifies installed consumer bundle state after install, not just `dist/`
- OpenCode translation is now more honestly native:
  - agent output prefers `permission` over deprecated legacy `tools`
  - native `skill` / `task` permission keys are modeled as real host surfaces
- local core-four proof is real in the host apps:
  - Claude
  - Cursor app
  - Codex
  - OpenCode
- `--approve-mcp-tools` can now scaffold canonical MCP-wide tool approval intent directly into generated config
- a second major public example now exists:
  - `example/exa-plugin`
- that Exa example now proves a clean-room subagent-heavy research architecture can also be built, installed, and `verify-install` checked across Claude Code, Cursor, Codex, and OpenCode:
  - `docs/exa-research-example.md`
- the Exa example now also has real live workflow proof across multiple host surfaces:
  - Claude Code app PASS
  - Cursor CLI PASS
  - Codex Desktop app PASS
  - OpenCode CLI PASS
- the published npm package now includes the Claude plugin-agent manifest fix:
  - the public `pluxx test --install --trust --behavioral` path now matches the repo-local Exa proof state
- the remaining Exa rerun blocker is now narrower:
  - fresh Cursor CLI reruns currently hit a local macOS keychain/auth issue on this machine, not a plugin-bundle issue
- local stdio MCP import and install diagnostics are now materially stronger:
  - `init --from-mcp` infers `passthrough` for project-relative runtimes like `./build/index.js`
  - `lint` warns when a local stdio runtime is not bundled into passthrough
  - `doctor --consumer` warns when installed `.mcp.json` files reference missing stdio runtime payloads
  - Claude-generated local stdio MCP output now anchors project-local runtime paths under `${CLAUDE_PLUGIN_ROOT}`
  - `lint` warns when MCP startup or custom runtime hooks depend on installer-owned `scripts/check-env.sh`
  - build output and install-time MCP materialization now share the same stdio path normalization, so host-specific root vars no longer leak between Claude, Cursor, and Codex bundles
  - Codex local installs now rewrite plugin-owned stdio MCP command/arg paths to absolute installed plugin paths, so installed MCP launch no longer depends on workspace cwd
  - `lint` now warns when global stdio MCP config uses host-specific root vars such as `${CLAUDE_PLUGIN_ROOT}`
  - `doctor --consumer` now warns when an installed bundle still carries the wrong host root contract in stdio MCP config
  - the install/runtime docs now recommend the `load-env.sh` + `bootstrap-runtime.sh` + `start-mcp.sh` split pattern for native Node deps
  - source-project runtime payload checks now treat `scripts/`, `assets/`, and `passthrough` as one bundled runtime surface when validating local stdio startup paths
  - `doctor --consumer` now reports which known runtime script-role files are present in an installed bundle
  - `install`, `doctor --consumer`, and `verify-install` now fail bundles whose actual stdio entry scripts still chain runtime startup through installer-owned `scripts/check-env.sh`
- runtime readiness is now a real shared runtime surface:
  - source config can declare refresh dependencies plus gate polling/timeout policy once
  - Claude Code, Cursor, and OpenCode now emit generated readiness behavior from that shared primitive
  - Codex now bundles translated hooks at `hooks/hooks.json` and keeps `.codex/readiness.generated.json` plus `.codex/hooks.generated.json` as companion/debug outputs
  - `lint` and `doctor` now explain the remaining Codex feature-gate and best-effort prompt-entry degradation for named skill/command targets
  - `runtime` is now also modeled more explicitly inside the compiler as MCP/auth, readiness, and payload support rather than one undifferentiated internal bucket
  - readiness translation notes for Codex external wiring and best-effort named prompt targeting now come from one shared registry used by generators, `lint`, and `doctor`
- host-visible branding completeness is now surfaced earlier:
  - `lint` warns when Cursor or Codex can render richer branding but the plugin is missing `brand.icon` and/or `brand.screenshots`
  - `doctor` now surfaces the same source-project warning before a plugin is treated as finished
- primitive-by-primitive reliability review is now explicit instead of only implied across multiple proof docs:
  - `docs/core-four-reliability-register.md`
- same-worktree full-suite proof is now serialized deliberately:
  - `npm test` now fails fast if another full-suite run is already active in the same worktree
  - `tests/run-vitest-exclusive.test.ts` now covers both active-lock refusal and stale-lock recovery
  - the remaining follow-on is moving more repo-local fixture paths and cwd-sensitive tests toward process-unique isolation
  - the current release gate is green again on 2026-05-13:
    - `npm test` passed
    - `npm run release:check` passed
- installed MCP discovery is now a first-class import path:
  - `pluxx discover-mcp` reads Claude Code, Cursor, Codex, and OpenCode config locations
  - `pluxx init --from-installed-mcp <host:name>` imports a selected discovered server into a Pluxx project
  - discovered stdio/env auth is normalized without copying literal secret values
  - Claude MCP discovery now follows the real live CLI sources: project `.mcp.json` plus user/local `~/.claude.json`, and it no longer treats `settings.json` `mcpServers` as active install sources
  - duplicate Claude same-name MCPs across `.mcp.json`, top-level `~/.claude.json`, and nested local `projects[...]` entries now get path-qualified selectors instead of ambiguous duplicate ids
  - duplicate Claude same-name MCPs across nested local `projects[...]` blocks in `~/.claude.json` now also stay distinct, and the path-qualified selector works through `init --from-installed-mcp`
- installed consumer bundle integrity is stricter:
  - generated-shape Claude bundles now fail `doctor --consumer` and `verify-install` when `hooks/hooks.json` is malformed or points at missing bundle-owned targets, even though the Claude manifest omits `hooks`
  - Claude bundles now also fail `doctor --consumer` and `verify-install` when the manifest redundantly points `hooks` at the standard `./hooks/hooks.json` file that current Claude auto-loads anyway
  - hook-bearing Claude installs now also warn when a checked Claude settings layer sets `disableAllHooks = true`, because current Claude CLI `2.1.140` probes showed that suppressing `SessionStart` settings-hook execution across user, project, and local layers
  - `bun scripts/probe-claude-hooks-runtime.ts --json` now gives maintained isolated headless Claude evidence that user, project, and local `SessionStart` settings hooks fire by default, `--setting-sources user,project` drops local hooks, a user-layer `disableAllHooks` suppresses an otherwise-present local hook, installed plugin `SessionStart` hooks execute before the unauthenticated `/login` response, and manifest-level `hooks: "./hooks/hooks.json"` still triggers Claude's duplicate hooks-file load error
  - managed Claude settings proof is intentionally bounded here: the opt-in managed-shadow `SessionStart` scenarios run through a synthetic managed-settings path in the probe/test harness, so live registry/plist/MDM/server-managed precedence proof is still outside the current environment
  - malformed bundled Codex `hooks/hooks.json` now fails `doctor --consumer` and `verify-install` instead of passing on file presence alone
  - missing Codex `.app.json` surfaces referenced by the manifest now also fail `doctor --consumer` and `verify-install`
  - hook-bearing Codex plugin installs now warn when the checked project and user Codex config both omit `[features] plugin_hooks = true`; `hooks` remains the general non-plugin hook flag and defaults on, while `codex_hooks` is deprecated and no longer presented as a plugin-bundled hook fallback
  - hook-bearing Codex installs now also warn when the checked project is not trusted in the user Codex config for project-local hook loading
  - `verify-install` now prints the concrete installed-bundle Codex warning code, explanation, and fix inline instead of only surfacing a warning count
  - generated Codex hooks now use the official nested matcher-group schema instead of the older flat entry shape
  - `bun scripts/probe-codex-agents-runtime.ts --json` now gives maintained isolated headless Codex custom-agent evidence; on 2026-05-13 it showed an explicit project-local `proof` agent request producing `spawn_agent` plus `wait` in `codex exec --json` and returning `CUSTOM_AGENT_PROOF`, a project-local `explorer.toml` override returning `CUSTOM_EXPLORER_OVERRIDE`, a project-local `proof.toml` beating a same-name user-local `~/.codex/agents/proof.toml` by returning `PROJECT_AGENT_PROOF`, a discovered project `.agents/skills/proof-skill/SKILL.md` being inherited cleanly and returning `SKILL_PROOF_TOKEN_PROJECT_DISCOVERY`, a parent `.codex/config.toml` `[[skills.config]] enabled = false` entry being ignored and still returning `SKILL_PROOF_TOKEN_DISABLED_IGNORED`, an agent-local `[[skills.config]] path = "./skills/proof-skill/SKILL.md"` entry failing to preload an undiscovered `skills/` path and instead returning `SKILL_PROOF_MISSING`, and the maintained `sandbox-readonly` scenario still writing `sandbox-proof.txt` and returning `SANDBOX_WRITE_PROOF` despite `sandbox_mode = "read-only"`
  - `bun scripts/probe-codex-agents-interactive-runtime.ts --json` now gives maintained trusted interactive Codex custom-agent evidence too: on 2026-05-13 the `sandbox-readonly-trusted` scenario stayed `interactive-proof-observed`, surfaced `SANDBOX_WRITE_PROOF`, and wrote `sandbox-proof.txt` with `interactive-readonly`, while the writable control stayed side-effect-matched with `interactive-writable`
  - `bun scripts/probe-codex-mcp-runtime.ts --json` now gives maintained isolated headless Codex MCP evidence too: on 2026-05-13 default project-scoped `.codex/config.toml`, user-scoped `CODEX_HOME/config.toml`, and inline custom-agent `mcp_servers` all reached `initialize`, `notifications/initialized`, and `tools/list`; the default project-scoped and user-scoped root paths then emitted a real `mcp_tool_call` item for `get_allowed_marker` but failed it with `user cancelled MCP tool call` before any server-side `tools/call`, while the default inline-agent path still returned `MCP_PROOF_MARKER_MISSING` after `spawn_agent` plus `wait`. The same maintained suite now also includes `project-config-root-approve`, `user-config-root-approve`, `agent-inline-approve`, `project-config-agent-inherit-approve`, and `user-config-agent-inherit-approve`, which all reached real server-side `tools/call` and returned `MCP_PROOF_MARKER_ALLOWED` once explicit `[mcp_servers.probe.tools.get_allowed_marker] approval_mode = "approve"` was present in the relevant root or agent-local layer, even though all three approved custom-agent paths still avoided a root `mcp_tool_call` item in the parent `codex exec --json` stream and instead surfaced child `agents_states` moving through `pending_init` to `completed`; `codex mcp list` still did not expose the project-scoped server, and the same command did expose the user-scoped server
  - `pluxx migrate` now warns when native Codex `.codex/agents/*.toml` files declare agent-local `mcp_servers` or approval stanzas, because current canonical agent migration still preserves only the simpler native agent fields and would otherwise silently drop the live-proven delegated MCP shape
  - `bun scripts/probe-codex-hooks-runtime.ts --json` now gives maintained isolated headless evidence that `hooks-no-trust`, `hooks-trusted`, and `codex-hooks-trusted` all return `OK` without firing the hook side effect
  - a targeted maintained `session-start-hooks-trusted-reviewed` rerun on 2026-05-13 also timed out with no project-local hook side effect and no `/hooks` review gate, so the current local reviewed interactive path still has no maintained successful hook execution
  - Pluxx now compiles that proven Codex MCP allow-path into `.codex/config.generated.toml` when top-level canonical `MCP(...)` rules are concrete enough to materialize per-tool approvals, while keeping `.codex/permissions.generated.json` as the broader advisory mirror
  - `pluxx lint` now also warns when a Codex target combines canonical `agents/` plus root MCP config, because maintained local proof now includes an explicit custom-agent `mcp_servers = {}` scenario that still inherited approved root MCP, and upstream Codex issue `#20135` reports the same ceiling: custom agents inherit parent MCP servers from active project/user config, and there is still no documented reliable opt-out for non-MCP or least-privilege subagents
  - the maintained optional `--include-enable-hooks-cli` Codex hook scenarios now also show that the current CLI feature path `--enable hooks` still does not execute the project-local hook in either headless or trusted interactive probes
  - `doctor --consumer` and `verify-install` now also inspect checked Codex project/user config layers for those generated approvals and warn when the companion exists but its per-tool stanzas have not actually been merged yet
  - the remaining Codex runtime gap is now narrower: whether reviewed hooks can ever fire at all, especially headlessly, why successful delegated MCP paths still do not surface a root `mcp_tool_call` item in the parent event stream, whether canonical authoring should learn to preserve agent-local MCP config instead of only warning during migrate, how far the new `.codex/config.generated.toml` approval companion should go now that it is live-proven for project-root, user-root, and inherited delegated MCP while agent-local inline approvals still require their own shape, and deeper custom-agent config proof beyond the now-pinned headless-plus-interactive read-only sandbox mismatch, the newly pinned headless `skills.config` disable/preload caveats, the newly pinned invalid-model failure path plus same-name user-local model precedence cases, and installed-plugin skill preload
- example and packaged-runtime parity is current again:
  - `examples/prospeo-mcp` now includes its `scripts/` payload in built/installable outputs
  - the example now targets the official `@prospeo/prospeo-mcp-server` package instead of a stale repo-local runtime path
- the repo release gate is green again as of 2026-05-13:
  - `npm test`
  - `npm run release:check`

The public baseline is also real.

- npm package is live as `@orchid-labs/pluxx`
- the next public package cut carries the core-four reliability proof tranche and release-gate fixes:
  - `0.1.16`
- published CLI runtime is Node `>=18`
- published CLI lifecycle ergonomics are now stronger for global installs:
  - `pluxx --version`
  - `pluxx upgrade`
- docs site is live
- Mintlify docs reflect the core compiler story more honestly
- `migrate`, `eval`, `doctor --consumer`, and `mcp proxy --record/--replay` are shipped
- the self-hosted Pluxx plugin exists:
  - canonical source project: `example/pluxx`
  - repo-local Codex dogfood surface: `plugins/pluxx`
- the self-hosted Pluxx plugin has now been rebuilt, installed, and `verify-install` checked from `example/pluxx` across:
  - Claude Code
  - Cursor
  - Codex
  - OpenCode
  - `docs/pluxx-self-hosted-core-four-proof.md`
- the self-hosted source project now also carries maintained behavioral smoke cases:
  - `example/pluxx/.pluxx/behavioral-smoke.json`
  - `verify-install`
  - `translate-hosts` with a Codex hooks focus
- docs/website ingestion is now a real surface with deterministic artifacts:
  - `.pluxx/sources.json`
  - `.pluxx/docs-context.json`
  - `--ingest-provider auto|local|firecrawl`

## Now

### 1. Product clarity and source-of-truth cleanup

Goal:

- make it obvious to any person or agent what Pluxx is, what is shipped, and what matters next

Open work:

- keep [docs/start-here.md](../start-here.md), this queue, the master backlog, and Linear aligned
- use [docs/core-four-reliability-register.md](../core-four-reliability-register.md) as the current Claude Code and Codex failure-mode inventory:
  - keep the documented break modes aligned with the actual proof stack
  - treat Cursor and OpenCode as secondary reliability follow-ons rather than flattening all four hosts into one identical work block
  - keep the new Codex hook split explicit: schema correctness is now fixed, but live execution still depends on trusted-project state plus `/hooks` review
- tighten the remaining top-level docs framing and entrypoint docs
- keep GTM-sensitive material out of the public repo
- continue reconciling stale planning artifacts that still describe already-shipped work as future work
- close the remaining Linear drift where shipped work like installed-MCP discovery is still marked as backlog
- keep OpenClaw in the documented beta-target lane, not the prime-time target set:
  - [docs/openclaw-target-evaluation.md](../openclaw-target-evaluation.md)
- keep `src/validation/platform-rules.ts`, `docs/compatibility.md`, and `docs/core-four-primitive-matrix.md` current from the first-party provider audit:
  - [docs/core-four-provider-docs-audit.md](../core-four-provider-docs-audit.md)
- use [docs/core-four-translation-hit-list.md](../core-four-translation-hit-list.md) as the concrete closure tracker for:
  - row-level translation docs in:
    - [docs/core-four-primitive-matrix.md](../core-four-primitive-matrix.md)
    - [docs/core-four-branding-metadata-audit.md](../core-four-branding-metadata-audit.md)
  - the now-closed registry, generator, migration, explainability, and fixture rows for the current audited core four
  - any future host-drift refreshes and public proof-packaging follow-ons
- use [docs/primitive-compiler-hardening-architecture.md](../primitive-compiler-hardening-architecture.md) as the current execution spec for:
  - IR boundary work
  - shared registry rollout
  - runtime/distribution internal seam hardening
- shared skill parsing is now materially less duplicated:
  - `src/skills.ts` is the common reader for lint, Agent Mode, migrate, and Claude skill rewrites
- use [docs/todo/author-once-hardening.md](./author-once-hardening.md) as the current initiative-level TODO for closing the remaining gap between:
  - the author-once product vision
  - the currently shipped compiler, proof, and install reality
- keep hardening the local proof harness so release-grade checks fail clearly instead of flaking:
  - the short-term guard is the new same-worktree full-suite lock on `npm test`
  - the longer follow-on is replacing remaining repo-local shared fixture paths with process-unique temp roots where practical
- treat the self-hosted `pluxx-plugin` as part of that same initiative for average-user product quality:
  - the CLI stays the engine
  - the plugin should be the guided operator surface
  - use [docs/pluxx-plugin-surface-audit.md](../pluxx-plugin-surface-audit.md) to keep plugin coverage and UX gaps honest
- treat the current compiler-hardening state as:
  - runtime/distribution internal seams are materially stronger
  - readiness translation is already shared through one registry
  - runtime script-role and installed-runtime enforcement are materially stronger
  - hook translation now has a first shared registry slice for event support and field-preservation truth
  - hook translation explainability is now less stale:
    - Claude prompt-hook lint warnings are event-aware and only fire for unsupported Claude lifecycle events instead of claiming all prompt hooks degrade
    - prompt/failClosed/loop_limit lint messaging now routes through `src/hook-translation-registry.ts` instead of parallel hard-coded strings
    - Cursor now also drops unsupported hook events from generated `hooks/hooks.json` instead of only warning in lint, so emitted hook bundles match the documented Cursor event surface
    - non-command hook types on Codex/OpenCode now warn through the same shared registry instead of disappearing silently, and the generated Codex hook companion records dropped `http` / `mcp_tool` / `agent` hook types explicitly
  - `migrate` now preserves richer hook intent on the first canonical pass:
    - prompt, http, and `mcp_tool` hook entries survive migrate instead of collapsing to command-only records
    - direct and Claude-nested hook forms now keep matcher, model, failClosed, loop_limit, async, asyncRewake, shell, headers, allowedEnvVars, and input payloads
    - `UserPromptSubmit` now normalizes back to canonical `beforeSubmitPrompt`
  - native Codex agent migrate fidelity is tighter:
    - `sandbox_mode` now survives the TOML -> canonical markdown -> rebuilt TOML path instead of being dropped during migrate
  - commands IR now preserves `argument-hint`, `when_to_use`, argument arrays, examples, explicit skill routing, agent routing, and context hints through Codex, OpenCode, and Agent Mode instead of flattening commands back into prose-only guidance
  - `init --from-mcp` now emits `when_to_use`, canonical `arguments`, and explicit `skill` routing into generated command frontmatter instead of stopping at `argument-hint`
  - canonical skill metadata now includes adjacent support-file awareness for `examples/`, helper `scripts/`, and neighboring references instead of treating skills as frontmatter plus opaque body only
  - installed behavioral proof is now materially stronger:
    - the behavioral harness supports expected-failure cases and host-specific runner args for maintained smoke fixtures
    - maintained smoke fixtures can now declare an explicit `commandId` plus required output markers, so command-proof cases fail when the prompt does not reference the command or the output shape stays vague
    - `example/docs-ops`, `example/exa-plugin`, and `example/platform-change-ops` now each carry maintained behavioral smoke configs with command-specific assertions instead of relying only on ad hoc walkthroughs
    - `doctor --consumer` and `verify-install` now execute generated Claude/Cursor bundled permission-hook scripts and fail if those installed decisions are invalid
  - agent translation explainability is now less duplicated:
    - `src/agent-translation-registry.ts` now drives degraded-field messaging for Cursor, Codex, and OpenCode
    - generated Cursor and Codex agent surfaces now emit the same translation story that `lint` uses
  - migrate now preserves more host-native instruction and distribution intent on the first canonical pass:
    - manifest-less Claude sources can now migrate directly from `CLAUDE.md`
    - Cursor nested rule files and nested `AGENTS.md` provenance now survive migrate and are copied into the maintained source project
    - Codex `AGENTS.override.md` survives alongside interface/app metadata instead of being dropped or clobbered
    - OpenCode configured instruction files and package entrypoints now survive import and are copied into the maintained source project
    - MCP migrate now merges generic and host-native MCP sources instead of first-file-wins, so native auth blobs such as platform auth and multi-header maps survive under `platforms.<host>.mcpServers.<server>`
  - installed-MCP auth recovery now follows through into authoring and install:
    - `discover-installed-mcp` now preserves host-native MCP auth overrides alongside the canonical auth shape
    - `init --from-installed-mcp` now carries those preserved auth blobs into generated `platforms.<host>.mcpServers.<server>` config
    - generated scaffold `userConfig` now derives extra env vars from native multi-header auth overrides instead of only the first canonical header
  - richer canonical skill metadata now survives into emitted host companions instead of mostly living in Agent Mode and migrate:
    - Codex now writes `.codex/skills.generated.json`
    - OpenCode now writes `skills.generated.json`
  - command/skill translation wording in `lint` is now less duplicated:
    - command degradation notes route through `src/command-translation-registry.ts`
    - skill frontmatter translation notes route through `src/skill-translation-registry.ts`
  - Codex command degradation truth is now more internally consistent:
    - `AGENTS.md` routing guidance and `.codex/commands.generated.json` now come from the same richer command metadata seam
    - capability docs and machine-readable platform rules now both treat `.codex/commands.generated.json` as part of the shipped Codex degrade surface
  - Codex/OpenCode skill-frontmatter explainability now explicitly covers:
    - `when_to_use`
    - `user-invocable`
    - `model`
    - `effort`
- use the Exa example as the next import-quality pressure test:
  - a raw `init --from-mcp`, `autopilot`, or `migrate` run should get closer to the final Exa workflow architecture without depending on as much maintainer hand-shaping
- close the now-clearer translation follow-ons behind the shipped readiness/runtime work:
  - keep pushing the richer `skills` metadata layer into more native host emission and proof consumers beyond Codex/OpenCode companions
  - keep pushing the richer `commands` IR into more native host emission and install-time proof instead of mostly companion and context surfaces
  - add more installed behavioral proof for delegated agents, reload/discovery quirks, and publish/recovery flows
  - continue simplifying the plugin-guided average-user path so more of the current proof state is obvious without maintainer-level CLI literacy

### 2. Flagship depth example

Goal:

- prove that Pluxx handles rich host-native agent surfaces, not just basic MCP wrappers

Open work:

- keep building the chosen flagship example:
  - a Docsalot-style `docs-ops` plugin from one maintained source project
- use [docs/flagship-docs-ops-plugin.md](../flagship-docs-ops-plugin.md) as the concrete build spec
- a second flagship-adjacent all-primitive reference example now exists:
  - `example/platform-change-ops`
  - [docs/platform-change-ops-reference-plugin.md](../platform-change-ops-reference-plugin.md)
- use that Platform Change Ops example as the enterprise stress fixture for:
  - runtime readiness
  - local stdio runtime packaging
  - risky-action hook translation
  - permission translation
  - install/distribution truth under a warning-heavy preserve / translate / degrade mix
- that Platform Change Ops example now also installs and passes `verify-install` across Claude Code, Cursor, Codex, and OpenCode from the source project
- the Claude native install path proof is now aligned with real host behavior:
  - installed bundles live under `~/.claude/plugins/cache/<marketplace>/<plugin>/<version>`
  - `install` and `verify-install` now validate that real cache path instead of assuming `~/.claude/plugins/<name>`
- installed stdio MCP proof is stricter now:
  - `doctor --consumer` and `verify-install` smoke-launch the installed stdio command instead of only validating bundle shape
  - `platform-change-ops` now backs that proof with a real long-lived local stdio runtime
- keep the new Exa clean-room example in the proof stack as the clearest non-docs showcase of:
  - raw MCP plus official-host workflow shape in
  - branded native core-four bundles out
- document and close the current Exa import delta:
  - what a raw MCP import already gets for free
  - what a host-native Claude-first migration already gets for free
  - what still required explicit workflow and packaging refinement
- finish the Exa host-runtime proof block when the local environment permits:
  - Claude CLI connection issue
  - Codex CLI model/account/runtime issue
- treat the current scaffold and Orchid read-only proof as complete:
  - `example/docs-ops`
  - `example/docs-ops/ORCHID-READONLY-DEMO.md`
- treat the core-four build/install/verify proof as complete:
  - `docs/docs-ops-core-four-proof.md`
- treat the first concrete rewrite proof as complete:
  - `example/docs-ops/demo-rewrites/orchid-components-accordion.before.md`
  - `example/docs-ops/demo-rewrites/orchid-components-accordion.after.md`
- treat the installed Codex plugin proof as complete:
  - `docs/orchid-docs-ops-codex-walkthrough.md`
- treat the official CLI inspect/rewrite proof as complete across:
  - Claude Code
  - Cursor
  - Codex
  - OpenCode
  - `docs/docs-ops-core-four-proof.md`
- treat the first cleaner public-facing packaging pass as in place:
  - `docs/proof-and-install.md`
  - `site/examples/docs-ops-flagship.mdx`
- capture at least one polished in-app walkthrough outside Codex
- document what the example preserves vs translates vs degrades across the core four
- explicitly cover richer Claude skill capabilities where useful:
  - supporting files / references
  - scripts
  - `context: fork`
  - more sophisticated skill behaviors
- treat the write/publish auth surface as mechanically separated and source-modeled:
  - `docs/docs-ops-authenticated-publish-path.md`
- prove a real authenticated publish plus rollback only after a safe private endpoint exists
- use that reference plugin as:
  - a proof fixture
  - a demo target
  - a regression surface

### 3. Docs and website ingestion

Goal:

- turn docs ingestion from “implemented” into “obviously useful”

Open work:

- treat the connector-backed comparison as captured:
  - [docs/strategy/firecrawl-connector-docs-ingestion-proof.md](../strategy/firecrawl-connector-docs-ingestion-proof.md)
- treat the keyed local fixture snapshot as captured:
  - [docs/strategy/docs-ingestion-fixture-eval.md](../strategy/docs-ingestion-fixture-eval.md)
- treat the live scaffold before/after demo as captured:
  - [docs/strategy/docs-ingestion-scaffold-before-after.md](../strategy/docs-ingestion-scaffold-before-after.md)
- use the fixture snapshots to improve the weak cases the harness now exposes
- tighten signal extraction further:
  - product description quality
  - workflow hint quality
  - code-snippet/chrome filtering in setup/auth hints

### 4. Release-grade Pluxx plugin

Goal:

- make the Pluxx plugin itself feel like a real install surface and operator UX

Open work:

- harden metadata, prompts, screenshots, and install guidance
- keep the plugin thin and the CLI as the execution engine
- keep `example/pluxx`, `plugins/pluxx`, and the published `pluxx-plugin` repo in sync
- keep [docs/pluxx-plugin-surface-audit.md](../pluxx-plugin-surface-audit.md) accurate now that lifecycle coverage is present
- the self-hosted plugin now also has an explicit runtime-bootstrap workflow instead of leaving average users to infer install or upgrade steps from the fallback path:
  - `pluxx-bootstrap-runtime`
  - `/pluxx:bootstrap-runtime`
- the self-hosted plugin now also has guided refinement and proof overlays on top of the lower-level lifecycle steps:
  - `pluxx-refine-plugin`
  - `/pluxx:refine-plugin`
  - `pluxx-prove-plugin`
  - `/pluxx:prove-plugin`
- the self-hosted plugin now also has a dedicated host-translation review path for preserve / translate / degrade / drop truth:
  - `pluxx-translate-hosts`
  - `/pluxx:translate-hosts`
- the self-hosted plugin now also has an explicit install-troubleshooting workflow instead of leaving `doctor --consumer` only as a secondary hint:
  - `pluxx-troubleshoot-install`
  - `/pluxx:troubleshoot-install`
- treat the local self-hosted core-four proof as complete:
  - [docs/pluxx-self-hosted-core-four-proof.md](../pluxx-self-hosted-core-four-proof.md)
- treat the first repo-native public proof/install landing page as complete:
  - [docs/proof-and-install.md](../proof-and-install.md)
- keep turning that landing page into a cleaner visual public asset
- keep the new flagship public example page aligned with the repo proof stack:
  - `site/examples/docs-ops-flagship.mdx`
- evaluate whether a `gh skill`-compatible export/publish path makes sense for the skills-only slice of a Pluxx project
- decide later whether distribution should stay in the main repo or move to a dedicated plugin/marketplace repo

### 5. GTM and audience

Goal:

- turn the shipped OSS product into a sharp outreach and learning motion without overcommitting to the later trust layer

Open work:

- run two explicit lanes:
  - MCP vendors that need a better native agent experience
  - internal AI platform / DevEx teams as design partners for the later trust layer
- turn the local core-four proof into demo and outreach material
- keep refining the public OSS wedge story:
  - one maintained source project
  - native bundles across the core four
  - install verification and truthful compatibility

### 6. Next release

Goal:

- cut the next npm release now that the code path and packaged tarball both pass the release gate

Open work:

- [x] validate the current self-hosting/plugin flow
- [x] run tests and release smoke
- [x] restore example/release-smoke parity for `examples/prospeo-mcp`
- [x] rerun the full release gate, including tarball install and `npm exec`
- [ ] bump `package.json` to the next version
- [ ] commit and push the release-prep fixes on `main`
- [ ] push the matching `vX.Y.Z` tag to trigger the GitHub Actions npm publish
- [ ] verify the npm version, GitHub release, and tarball artifact after the workflow completes

## Explicitly Deferred

These are real, but not the current queue:

- hosted governance / control-plane features
- marketplace / commerce complexity
- private registry / enterprise distribution complexity
- org-wide telemetry and adoption analytics as a product
- provenance / signing / trust-layer features beyond initial design
- deep governance features without present demand

## Working Rule

Right now the priority order is:

1. keep the product story and source-of-truth docs clean
2. make the OSS authoring substrate obviously useful
3. prove richer plugin depth with a flagship example
4. make the Pluxx plugin itself excellent
5. use customer discovery to learn where the later trust layer should go
6. then ship the next release
