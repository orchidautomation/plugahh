# Start Here

Last updated: 2026-05-13

## Doc Links

- Role: repo orientation
- Related:
  - [docs/todo/queue.md](./todo/queue.md)
  - [docs/todo/master-backlog.md](./todo/master-backlog.md)
  - [docs/todo/success-checklist.md](./todo/success-checklist.md)
  - [docs/roadmap.md](./roadmap.md)
  - [docs/oss-wedge-and-trust-layer.md](./oss-wedge-and-trust-layer.md)
  - [docs/flagship-docs-ops-plugin.md](./flagship-docs-ops-plugin.md)
  - [docs/platform-change-ops-reference-plugin.md](./platform-change-ops-reference-plugin.md)
  - [docs/docs-ops-core-four-proof.md](./docs-ops-core-four-proof.md)
  - [docs/docs-ops-authenticated-publish-path.md](./docs-ops-authenticated-publish-path.md)
  - [docs/exa-research-example.md](./exa-research-example.md)
  - [docs/core-four-provider-docs-audit.md](./core-four-provider-docs-audit.md)
  - [docs/core-four-translation-hit-list.md](./core-four-translation-hit-list.md)
  - [docs/pluxx-self-hosted-core-four-proof.md](./pluxx-self-hosted-core-four-proof.md)
  - [README.md](../README.md)
- Update together:
  - [docs/todo/queue.md](./todo/queue.md)
  - [docs/todo/master-backlog.md](./todo/master-backlog.md)
  - [docs/roadmap.md](./roadmap.md)

If you are new to Pluxx, read this file first.

This is the shortest accurate explanation of what Pluxx is, what is already real, what is not the product yet, and where to look next.

If you want the broadest completeness checklist after reading this, use [docs/todo/success-checklist.md](./todo/success-checklist.md).

If you want the shortest public proof and install path after this file, use [docs/proof-and-install.md](./proof-and-install.md).

## What Pluxx Is

Pluxx turns raw MCPs or strong host-native agent plugins into one maintained source project that can ship native plugin outputs for:

- Claude Code
- Cursor
- Codex
- OpenCode

Pluxx exists because raw MCP access is usually not enough.

Most products still need:

- better workflow grouping
- stronger instructions
- hooks and commands
- clearer auth and setup guidance
- installable native packaging per host
- repeatable validation and install verification

Pluxx is the authoring, maintenance, and compilation layer for that work.

## The Product In One Sentence

Pluxx helps teams maintain one plugin source project and ship installable, opinionated native experiences across Claude Code, Cursor, Codex, and OpenCode.

## The Two-Layer Model

Pluxx has two layers.

### 1. OSS Authoring Substrate

This is the product that is real today.

It includes:

- `init`
- `autopilot`
- `doctor`
- `lint`
- `eval`
- `build`
- `test`
- `install`
- `upgrade`
- `verify-install`
- `migrate`
- `sync`
- `mcp proxy`

The goal of this layer is simple:

> Make Pluxx the default way to author and maintain a real cross-host plugin from one source project.

The CLI is the engine, but the self-hosted Pluxx plugin is part of the real product surface for average users.

That means near-term product quality is not only about compiler depth.
It is also about making the plugin-guided path feel obvious, safe, and understandable on top of the same CLI truth.

### 2. Later Trust / Distribution Layer

This is a plausible later product, not the current build center.

Potential surfaces:

- organization-wide rollout
- managed distribution
- version channels
- policy and approval controls
- adoption analytics
- runtime health and governance

This is important strategically, but it should not drive the near-term roadmap.

## Who Pluxx Is For Right Now

The current best-fit users are:

- MCP vendors who have a raw MCP and need a better native agent experience
- teams that already have one good host-native plugin and want core-four portability
- advanced plugin authors who want one maintained source of truth

The strongest design-partner audience for the later trust layer is:

- internal AI platform teams
- DevEx / productivity teams
- engineering orgs standardizing internal agent workflows across multiple hosts

## What Is Already Real

The repo already proves a lot.

- `@orchid-labs/pluxx` is published on npm
- the public website is live at `https://pluxx.dev`
- the docs site is live at `https://docs.pluxx.dev`
- the published CLI runs on Node `>=18`
- the published CLI now has first-class lifecycle helpers for global installs:
  - `pluxx --version`
  - `pluxx upgrade`
- the core-four compiler work is materially shipped
- `verify-install` exists and is tested
- consumer-side `doctor --consumer` exists and is tested
- `migrate`, `eval`, and `mcp proxy --record/--replay` are shipped
- the self-hosted Pluxx plugin exists as a real source project in `example/pluxx`
- the repo-local Codex dogfood plugin exists in `plugins/pluxx`
- the self-hosted Pluxx plugin has now been rebuilt, installed, and `verify-install` checked from the canonical source project across the core four:
  - `docs/pluxx-self-hosted-core-four-proof.md`
- the self-hosted plugin surface is also documented as a thin operator layer over the CLI rather than a second engine:
  - `docs/pluxx-plugin-surface-audit.md`
- the self-hosted plugin now also exposes an explicit runtime-bootstrap workflow for the common “plugin is installed but the underlying CLI is missing or stale” case:
  - `pluxx-bootstrap-runtime`
  - `/pluxx:bootstrap-runtime`
- the self-hosted plugin now also exposes guided refinement and proof workflows so average users do not need to compose as many adjacent micro-steps by hand:
  - `pluxx-refine-plugin`
  - `/pluxx:refine-plugin`
  - `pluxx-prove-plugin`
  - `/pluxx:prove-plugin`
- the self-hosted plugin now also exposes a guided host-translation review workflow for preserve / translate / degrade / drop truth across the core four:
  - `pluxx-translate-hosts`
  - `/pluxx:translate-hosts`
- the self-hosted plugin now also exposes an explicit install-troubleshooting workflow instead of leaving installed-bundle diagnosis only as a secondary hint:
  - `pluxx-troubleshoot-install`
  - `/pluxx:troubleshoot-install`
- the flagship `example/docs-ops` source project exists and is wired to a live public Orchid Docsalot MCP endpoint for read-only proof
- the flagship example has now also been rebuilt, installed, and `verify-install` checked from the source project across Claude Code, Cursor, Codex, and OpenCode:
  - `docs/docs-ops-core-four-proof.md`
- the flagship example also has a concrete Orchid Accordion before/after rewrite artifact under `example/docs-ops/demo-rewrites/`
- the flagship example has now been installed and used successfully in Codex against the live Orchid Docsalot MCP
- the flagship example now also completes the same read-only inspect and rewrite workflow headlessly through the official Claude Code, Cursor, Codex, and OpenCode CLIs:
  - `docs/docs-ops-core-four-proof.md`
- the flagship example now also separates the private write/publish lane from the public Orchid MCP proof, and that install/runtime contract has been exercised mechanically:
  - `docs/docs-ops-authenticated-publish-path.md`
- a second major public example now exists:
  - `example/exa-plugin`
- that Exa example is a clean-room rebuild of the workflow shape of Exa's official Claude plugin against Exa's public MCP:
  - `docs/exa-research-example.md`
- the Exa example now also builds, installs, and passes `verify-install` across Claude Code, Cursor, Codex, and OpenCode
- the Exa example has now also completed real workflows through:
  - Claude Code app
  - Cursor CLI
  - Codex Desktop app
  - OpenCode CLI
- that Exa proof closes the main workflow path, not every advanced Claude plugin-agent edge:
- managed Claude settings behavior beyond the current file-based verifier, broader Claude hook-event coverage, and advanced plugin-agent unsupported-field constraints are still tracked as open reliability gaps in `docs/core-four-reliability-register.md`
- the published npm package now includes the Claude plugin-agent manifest fix, so the public `pluxx test --install --trust --behavioral` path matches the repo-local Exa proof state
- the remaining Exa rerun blockers are now narrower and host-local:
  - Cursor CLI currently hits a local macOS keychain/auth error on fresh rerun (`SecItemCopyMatching failed -50`)
  - the older Claude CLI and Codex CLI headless failures are still ambient host-runtime issues on this machine, not generator-shape issues
- the Exa example also pressured and improved the compiler itself:
  - a real Claude agent translation bug was exposed and fixed while making the example install cleanly
- the Exa example also clarified a still-open product gap:
  - raw `init --from-mcp`, `autopilot`, and `migrate` can already produce a credible starting point, but the final Exa-quality workflow taxonomy, specialist-agent graph, and install/polish layer still benefited from explicit refinement
- a third maintained example now exists as the repo's maximal enterprise reference plugin:
  - `example/platform-change-ops`
  - `docs/platform-change-ops-reference-plugin.md`
- that Platform Change Ops example intentionally combines:
  - multiple remote MCP servers
  - a bundled local stdio runtime
  - runtime readiness
  - risky-action hooks
  - canonical permissions
  - delegated agents
  - rich install/distribution metadata
- that Platform Change Ops example has now also been installed and `verify-install` checked from the source project across Claude Code, Cursor, Codex, and OpenCode
- native Claude install verification now follows Claude's real cache install path (`~/.claude/plugins/cache/<marketplace>/<plugin>/<version>`) instead of the old direct plugin-directory assumption
- the new shared `src/skills.ts` parser is now the common skill reader for lint, Agent Mode, migrate, and Claude skill rewrites instead of four separate ad hoc parsers
- canonical skill metadata is now richer than a frontmatter-only slice:
  - Agent Mode now sees adjacent support files such as `examples/`, helper `scripts/`, and neighboring references as part of the skill surface
  - migrate now preserves canonical skill titles and richer skill frontmatter through one shared metadata path instead of rebuilding that meaning ad hoc
- commands are now less lossy as canonical authoring surfaces:
  - `src/commands.ts` now preserves `when_to_use`, argument arrays, examples, explicit command-to-skill routing, agent routing, and context hints
  - Codex and OpenCode command companions now carry that richer routing metadata instead of flattening commands to `argument-hint` plus body template only
  - `init --from-mcp` now emits `when_to_use`, canonical `arguments`, and explicit `skill` routing into generated command frontmatter instead of only the older `argument-hint` slice
  - Agent Mode manual-project context now includes command routing metadata and examples so refinement/review flows see the same truth the generators use
- installed behavioral proof is now stronger than simple file-shape verification:
  - the behavioral harness now supports host-specific runner args plus expected-failure cases without treating intentional nonzero exits as harness failures
  - maintained smoke fixtures can now declare an explicit `commandId` plus required output markers, so command-proof cases fail if the prompt does not reference the command or the response shape is too vague
  - `example/docs-ops`, `example/exa-plugin`, and `example/platform-change-ops` now each carry maintained behavioral smoke fixtures with command-specific output assertions instead of relying only on "did not bail" checks or one-off walkthroughs
  - `doctor --consumer` and `verify-install` now execute bundled Claude and Cursor permission-hook scripts and fail if the generated decisions are not actually usable
- primitive-by-primitive core-four reliability tracking is now explicit instead of spread across proof docs and translation tables:
  - `docs/core-four-reliability-register.md`
- same-worktree full-suite proof now fails fast instead of creating misleading cross-test flakes:
  - `npm test` now acquires a worktree-local suite lock before running the full Vitest pass
  - `tests/run-vitest-exclusive.test.ts` now proves both active-lock refusal and stale-lock cleanup
  - deeper fixture isolation is still follow-on work
- agent explainability is now less generator-local:
  - `src/agent-translation-registry.ts` now backs degraded-field messaging for Cursor, Codex, and OpenCode instead of parallel per-target strings
  - generated Cursor and Codex agent surfaces now emit the same registry-backed translation notes that `lint` uses
- migrate is now less lossy across instruction and distribution surfaces:
  - manifest-less Claude sources can now migrate from `CLAUDE.md` alone instead of requiring a separate manifest file
  - Cursor nested `rules/**/*.mdc` files and nested `AGENTS.md` provenance now survive migrate and are copied into the canonical source project
  - Codex-native `AGENTS.override.md` and adjacent interface/app config now survive import without clobbering one another
  - OpenCode configured instruction files and package entrypoints now survive import and are copied into the maintained source project
  - MCP migrate now merges generic and host-native MCP sources instead of first-file-wins, so native auth blobs such as Codex `auth = { type = "platform" }`, `env_http_headers`, and multi-header header maps are preserved under `platforms.<host>.mcpServers.<server>` instead of being silently lost
- installed-MCP import now preserves richer native auth intent end to end:
  - `pluxx discover-mcp` now surfaces preserved host-native auth overrides alongside the canonical auth shape for discovered MCP servers
  - `pluxx init --from-installed-mcp <host:name>` now carries those preserved native auth blobs back into generated `platforms.<host>.mcpServers.<server>` config instead of flattening multi-header or platform-managed auth back to one canonical header only
  - generated scaffold `userConfig` now derives extra env vars from preserved native MCP auth overrides, so install-time prompts do not lose secondary header requirements such as workspace or tenant ids
- richer canonical skill metadata now survives into more emitted host surfaces:
  - Codex now writes `.codex/skills.generated.json` from the shared `src/skills.ts` seam
  - OpenCode now writes `skills.generated.json` from the same seam
  - those companions now preserve support-file, helper-script, and example-path awareness beyond Agent Mode and migrate
- docs/website ingestion has a provider model and writes deterministic artifacts:
  - `.pluxx/sources.json`
  - `.pluxx/docs-context.json`
- a real connector-backed Firecrawl comparison now exists on the current fixture set:
  - `docs/strategy/firecrawl-connector-docs-ingestion-proof.md`
- the keyed local fixture harness rerun now also exists:
  - `docs/strategy/docs-ingestion-fixture-eval.md`
- the visible scaffold before/after demo now also exists:
  - `docs/strategy/docs-ingestion-scaffold-before-after.md`
- release smoke exists for the core four
- a first-party provider-doc audit now exists at:
  - `docs/core-four-provider-docs-audit.md`
- a concrete closure tracker now exists for turning the audits into documented and proven translation behavior:
  - `docs/core-four-translation-hit-list.md`
- the raw-MCP scaffold intelligence is now more explicit in the product itself:
  - agent/autopilot prompt packs now teach native shaping from raw MCP intent into commands, argument-bearing entrypoints, and specialist agents/subagents instead of stopping at a flat skill dump
- local stdio MCP imports now recover more of the executable runtime automatically:
  - `init --from-mcp` infers `passthrough` directories for project-relative stdio runtimes such as `./build/index.js`
  - `lint` now warns when a local stdio runtime will not be bundled into installed outputs
  - `doctor --consumer` now warns when an installed bundle's `.mcp.json` points at missing stdio runtime files
  - Claude-generated local stdio MCP config now anchors project-local runtime paths under `${CLAUDE_PLUGIN_ROOT}` instead of assuming plugin-root cwd after install
  - `lint` now warns if MCP startup or custom runtime hooks depend on installer-owned `scripts/check-env.sh`, which local install may rewrite into a no-op after config materialization
  - build output and install-time MCP materialization now share the same stdio path normalization, so host-specific root vars no longer leak from Claude-style source config into Cursor or Codex bundles
  - Codex local installs now rewrite plugin-owned stdio MCP command/arg paths to absolute installed plugin paths, so installed MCP launch no longer depends on workspace cwd
- `lint` now warns when global stdio MCP config uses host-specific root vars such as `${CLAUDE_PLUGIN_ROOT}` instead of a cross-host source expression
- `doctor --consumer` now warns when an installed bundle still contains the wrong host root contract in stdio MCP config
- the docs now capture a portable native-runtime pattern for plugins that need first-run local bootstrap scripts such as `load-env.sh`, `bootstrap-runtime.sh`, and `start-mcp.sh`
- source-project runtime payload checks now treat `scripts/`, `assets/`, and `passthrough` as one bundled runtime surface when validating local stdio startup paths
- `doctor --consumer` now reports which known runtime script-role files are present in an installed bundle
- `install`, `doctor --consumer`, and `verify-install` now fail bundles whose actual stdio entry scripts still chain runtime startup through installer-owned `scripts/check-env.sh`
- `doctor --consumer` and `verify-install` now also smoke-launch installed stdio MCP commands, so bundles no longer pass on file shape alone when the installed runtime exits immediately
- the `platform-change-ops` local MCP fixture is now a real long-lived stdio runtime with the advertised tools instead of a one-line process that exits on start
- runtime readiness is now a first-class runtime primitive:
  - plugin authors can declare background refresh dependencies and gate policies once in source config
  - Claude Code, Cursor, and OpenCode now generate host-native readiness behavior from that shared primitive
  - Codex now bundles translated hook output at `hooks/hooks.json`, with `.codex/hooks.generated.json` retained as a companion/debug mirror
  - Codex now gets explicit generated readiness guidance through `.codex/readiness.generated.json`, alongside bundled `hooks/hooks.json` and the companion `.codex/hooks.generated.json`
  - `doctor --consumer`, `verify-install`, and `lint` now distinguish Codex plugin-bundled hooks from general project or user hook config: plugin bundles need `[features] plugin_hooks = true`, `hooks` remains the general non-plugin hook flag and defaults on, and `codex_hooks` is deprecated rather than a plugin-bundled hook fallback
  - `doctor --consumer` and `verify-install` now also warn when the checked project is not trusted in the user Codex config, because project-local hooks may stay disabled until Codex trusts that project
  - Claude bundles now fail `doctor --consumer` and `verify-install` when the manifest redundantly points `hooks` at the standard `./hooks/hooks.json` file that current Claude auto-loads anyway
  - hook-bearing Claude installs now also warn when a checked Claude settings layer sets `disableAllHooks = true`, because current Claude CLI `2.1.140` probes showed that suppressing `SessionStart` settings-hook execution across user, project, and local layers
  - `verify-install` now prints the concrete Codex warning code, explanation, and fix inline for hook activation gaps instead of only surfacing a warning count
  - generated Codex hooks now use the official nested matcher-group schema instead of the older flat entry shape
  - `bun scripts/probe-codex-agents-runtime.ts --json` now provides a maintained isolated headless Codex custom-agent probe; on 2026-05-13 it showed an explicit project-local `proof` agent request producing `spawn_agent` plus `wait` in `codex exec --json` and returning `CUSTOM_AGENT_PROOF`, a project-local `explorer.toml` override returning `CUSTOM_EXPLORER_OVERRIDE`, a project-local `proof.toml` beating a same-name user-local `~/.codex/agents/proof.toml` by returning `PROJECT_AGENT_PROOF`, a discovered project `.agents/skills/proof-skill/SKILL.md` being inherited cleanly and returning `SKILL_PROOF_TOKEN_PROJECT_DISCOVERY`, a parent `.codex/config.toml` `[[skills.config]] enabled = false` entry being ignored and still returning `SKILL_PROOF_TOKEN_DISABLED_IGNORED`, an agent-local `[[skills.config]] path = "./skills/proof-skill/SKILL.md"` entry failing to preload an undiscovered `skills/` path and instead returning `SKILL_PROOF_MISSING`, the maintained `sandbox-readonly` scenario still writing `sandbox-proof.txt` and returning `SANDBOX_WRITE_PROOF` despite `sandbox_mode = "read-only"`, and a targeted invalid-model rerun still emitting `spawn_agent` plus `wait` while the parent surfaced `The proof agent errored: ... model is not supported ...`, which pins that agent-local `model` is honored strongly enough to affect live runtime even when the parent wraps the failure
  - targeted maintained live reruns on 2026-05-13 now also closed the two model-precedence cases that were previously only in source/test coverage: `project-no-model-does-not-inherit-user-invalid-model` returned `PROJECT_NO_MODEL_PROOF`, which shows a project-local same-name agent without an explicit `model` did not inherit the user-local invalid model, and `project-valid-model-overrides-user-invalid-model` returned `PROJECT_VALID_MODEL_PROOF`, which shows an explicit valid project-local model overrode the same-name user-local invalid model
  - `bun scripts/probe-codex-agents-interactive-runtime.ts --json` now keeps that trusted interactive Codex proof maintained too: on 2026-05-13 the `sandbox-readonly-trusted` scenario stayed `interactive-proof-observed`, surfaced `SANDBOX_WRITE_PROOF`, and wrote `sandbox-proof.txt` with `interactive-readonly`, while the writable control stayed matched with `interactive-writable`
  - `bun scripts/probe-codex-mcp-runtime.ts --json` now provides a maintained isolated headless Codex MCP probe too: on 2026-05-13 it showed default project-scoped `.codex/config.toml`, user-scoped `CODEX_HOME/config.toml`, and inline custom-agent `mcp_servers` all reaching `initialize`, `notifications/initialized`, and `tools/list`; the default project-scoped and user-scoped root paths then emitted a real `mcp_tool_call` item for `get_allowed_marker` but failed it with `user cancelled MCP tool call` before any server-side `tools/call`, while the default inline-agent path still returned `MCP_PROOF_MARKER_MISSING` after `spawn_agent` plus `wait`. The same maintained suite now also includes five approved controls: `project-config-root-approve`, `user-config-root-approve`, `agent-inline-approve`, `project-config-agent-inherit-approve`, and `user-config-agent-inherit-approve` all reached real server-side `tools/call` and returned `MCP_PROOF_MARKER_ALLOWED` once explicit `[mcp_servers.probe.tools.get_allowed_marker] approval_mode = "approve"` was present in the relevant root or agent-local layer. All three approved custom-agent paths still avoided a root `mcp_tool_call` item in the parent `codex exec --json` stream and instead surfaced child `agents_states` moving through `pending_init` to `completed`; `codex mcp list` still did not expose the project-scoped server, and the same command did expose the user-scoped server
  - `pluxx migrate` is now more honest about Codex-native custom agents too: if a native `.codex/agents/*.toml` file declares agent-local `mcp_servers` or approval stanzas, the migrated scaffold now carries an explicit warning in `pluxx.config.ts` and CLI output because current canonical agent migration does not preserve that Codex-specific MCP shape automatically
  - Codex permission companions are now a little more native too: Pluxx still emits `.codex/permissions.generated.json` as the full advisory mirror, but it now also emits `.codex/config.generated.toml` when top-level canonical `MCP(...)` allow rules are concrete enough to materialize the live-proven `approval_mode = "approve"` path into per-tool Codex config stanzas
  - `doctor --consumer` and `verify-install` now also inspect checked Codex config layers for those generated per-tool approval stanzas and warn when `.codex/config.generated.toml` exists but has not actually been merged into active project or user config yet
  - `pluxx lint` now also warns when a Codex target combines canonical `agents/` plus root MCP config, because maintained local proof now includes an explicit custom-agent `mcp_servers = {}` scenario that still inherited approved root MCP, and upstream Codex issue `#20135` reports the same ceiling: custom agents inherit parent MCP servers from active project/user config, and there is still no documented reliable opt-out for non-MCP or least-privilege subagents
  - `bun scripts/probe-claude-hooks-runtime.ts --json` now provides a maintained isolated headless Claude probe; on 2026-05-13 it showed user, project, and local `SessionStart` settings hooks firing by default, `--setting-sources user,project` dropping local hooks, a user-layer `disableAllHooks` suppressing an otherwise-present local hook, installed plugin `SessionStart` hooks executing before the expected unauthenticated `/login` response, and duplicate-manifest plugin bundles surfacing Claude's duplicate hooks-file load error
  - managed Claude settings proof is intentionally bounded here: the opt-in managed-shadow `SessionStart` scenarios run through a synthetic managed-settings path in the probe/test harness, not the real Claude managed-settings delivery surface, so registry/plist/MDM/server-managed precedence and managed-scope plugin behavior remain unproven in this environment
  - `bun scripts/probe-codex-hooks-runtime.ts --json` now provides a maintained isolated headless Codex hook probe; on 2026-05-13 it showed `hooks-no-trust`, `hooks-trusted`, and `codex-hooks-trusted` all returning `OK` with no hook side effect
  - the maintained `bun scripts/probe-codex-hooks-interactive-runtime.ts --json` Codex probe now pins the current interactive result more sharply: on May 13, 2026 both trusted `UserPromptSubmit` variants and both trusted `SessionStart` variants timed out with no project-local hook side effect and no `/hooks` review gate, while the `codex_hooks` prompt path emitted a deprecation message pointing users to `hooks`
  - a targeted maintained `session-start-hooks-trusted-reviewed` rerun on 2026-05-13 also ended `runner-timed-out` with no project-local hook side effect and no `/hooks` review gate, so the current local reviewed interactive path still has no maintained successful hook execution
  - the optional `--include-enable-hooks-cli` Codex hook scenarios now show that the current CLI feature path does not rescue activation either: headless `enable-hooks-trusted` still returned `OK` with no hook side effect, and trusted interactive `user-prompt-submit-enable-hooks-trusted` plus `session-start-enable-hooks-trusted` still timed out with no hook side effect and no `/hooks` review gate
  - `lint` and `doctor` now explain where readiness is preserved vs degraded, especially for the remaining Codex feature-gate and named skill/command prompt-entry scoping caveats
  - the compiler now also treats `runtime` more explicitly as internal MCP/auth, readiness, and payload subcontracts rather than one undifferentiated blob
  - the readiness translation notes used by Codex output, `lint`, and `doctor` now come from one shared registry instead of parallel hand-written strings
- host-visible branding completeness is now surfaced earlier:
  - `lint` warns when Cursor or Codex can render richer branding but the plugin is missing `brand.icon` and/or `brand.screenshots`
  - `doctor` now surfaces the same source-project warning before a plugin is treated as finished
- installed MCP discovery is now a first-class import path:
  - `pluxx discover-mcp` lists MCP servers already configured in Claude Code, Cursor, Codex, and OpenCode
  - `pluxx init --from-installed-mcp <host:name>` turns one discovered server into a Pluxx source project
  - discovery preserves stdio command/args, env-var auth intent, and richer native MCP auth overrides while redacting literal secret values
  - Claude MCP discovery now follows the real live CLI sources: project `.mcp.json` plus user/local `~/.claude.json`, and it no longer treats `settings.json` `mcpServers` as active install sources
- example and packaged-runtime parity is current again:
  - `examples/prospeo-mcp` now bundles its `scripts/` payload into built outputs
  - the example now points at the official `@prospeo/prospeo-mcp-server` package instead of a stale repo-local runtime path
- the current release gate is green again as of 2026-05-13:
  - `npm test` passed
  - `npm run release:check` passed
- OpenCode-native agent output is now permission-first:
  - legacy agent `tools` input is translated forward where possible
  - native OpenCode `skill` and `task` permission keys are treated as real first-class surfaces
  - canonical agents that already carry `permission` frontmatter no longer trigger the old deprecated-tools lint warning just because they retain cross-host `tools` hints

## What Pluxx Is Not Yet

Do not confuse the current product with the future company.

Pluxx is not yet:

- a hosted AI control plane
- an enterprise governance suite
- a marketplace business
- a private registry product
- an org analytics platform
- a “support every host equally” framework

The prime-time path is still:

- Claude Code
- Cursor
- Codex
- OpenCode

Other generators can exist, but they are not the main story.

OpenClaw is now a documented beta-target candidate:

- it looks strong enough to keep in scope as a future standalone native target
- it is not promoted into the prime-time target set yet
- see [docs/openclaw-target-evaluation.md](./openclaw-target-evaluation.md)

## Current Build Priorities

These are the current near-term priorities, in order.

### 1. Product Clarity

Make the repo, docs, README, TODO, and Linear all tell the same story.

That includes:

- one clear project brief
- cleaner public framing
- fewer stale planning artifacts
- truthful public metadata and links
- close any remaining Linear drift where already-shipped work is still sitting in backlog or unlabeled release-readiness state
- first-party provider docs reflected accurately in the compatibility story
- the remaining delta between:
  - a credible imported or migrated source project
  - and the final polished Exa-style workflow pack
- the remaining translation papercuts that are now narrower and more obvious:
  - duplicated hook/runtime translation truth that should move into one shared registry
  - lossy import paths in `migrate` and installed-MCP discovery
  - general installed hook-env parity outside the special Claude wrapper path
- every mapped cross-host delta documented as preserve/translate/degrade/drop with a concrete closure path:
  - row-level translation docs now live in:
    - `docs/core-four-primitive-matrix.md`
    - `docs/core-four-branding-metadata-audit.md`
  - the old closure block is now materially absorbed into code, tests, and docs:
    - richer Claude-style skill fixture proof
    - runtime/MCP fixture proof
    - instruction-intent proof
    - native Cursor/Codex/OpenCode fixture proof
    - migration normalization proof for agents and permission intent
    - lint/build/doctor explainability for translated rows
  - [docs/core-four-translation-hit-list.md](./core-four-translation-hit-list.md) now functions mainly as a maintenance and packaging tracker rather than a list of unresolved core row mappings

### 2. Flagship Depth Example

Build one maximal reference plugin that proves Pluxx handles richer host surfaces, not just basic `SKILL.md` scaffolds.

The chosen first flagship example is still:

- a Docsalot-style `docs-ops` plugin built from one maintained source project

This should exercise advanced features like:

- supporting files
- scripts
- stronger command surfaces
- advanced Claude skill behavior
- hooks
- richer agent/subagent patterns where the host allows them

See [docs/flagship-docs-ops-plugin.md](./flagship-docs-ops-plugin.md).

The strongest enterprise all-primitive reference example is now:

- `example/platform-change-ops`

See [docs/platform-change-ops-reference-plugin.md](./platform-change-ops-reference-plugin.md).

The read-only Orchid Docsalot proof is documented in:

- `example/docs-ops/ORCHID-READONLY-DEMO.md`

The cross-host build/install/verify proof is documented in:

- `docs/docs-ops-core-four-proof.md`

The first concrete rewrite proof lives in:

- `example/docs-ops/demo-rewrites/orchid-components-accordion.before.md`
- `example/docs-ops/demo-rewrites/orchid-components-accordion.after.md`

The full installed-plugin walkthrough lives in:

- `docs/orchid-docs-ops-codex-walkthrough.md`

The next proof steps are:

- capture at least one polished in-app walkthrough outside Codex
- prove a real authenticated publish plus rollback against a safe private target
- keep turning the repo and site proof surfaces into cleaner public-facing assets

### 3. Docs Ingestion Proof

Turn docs ingestion from “implemented” into “obviously useful.”

That means:

- using the captured connector-backed Firecrawl comparison to prove the value of the ingestion lane:
  - `docs/strategy/firecrawl-connector-docs-ingestion-proof.md`
- using the keyed local fixture snapshot to keep `baseline`, `local`, and `firecrawl` comparable:
  - `docs/strategy/docs-ingestion-fixture-eval.md`
- using the committed Sumble before/after demo to show the scaffold delta plainly:
  - `docs/strategy/docs-ingestion-scaffold-before-after.md`
- improving weak fixtures and tightening extracted signal quality

### 4. Release-Grade Pluxx Plugin

Make the self-hosted Pluxx plugin feel like a real install surface, not just dogfood.

The workflow coverage gap called out in:

- `docs/pluxx-plugin-surface-audit.md`

is now closed in the maintained source project and the repo-local Codex dogfood plugin.

The plugin architecture is still right:

- thin plugin
- CLI as the execution engine

The latest local core-four self-hosted plugin proof is documented in:

- `docs/pluxx-self-hosted-core-four-proof.md`

The next plugin-specific work is now:

- hardening metadata, prompts, screenshots, and install/update guidance
- treating [docs/proof-and-install.md](./proof-and-install.md) as the first repo-native public proof/install landing page, then pushing it into a cleaner visual public asset
- tightening release automation and distribution UX

### 5. Customer Discovery

Run two lanes in parallel:

- MCP vendor lane
- internal AI platform / design-partner lane

### 6. Next Release

The code and packaged tarball are now mechanically ready for the next cut.

The remaining release checklist is:

- bump `package.json` from `0.1.7` to the next version
- commit the release-prep fixes and doc/source-of-truth sync
- push `main`
- push the matching `vX.Y.Z` tag so GitHub Actions publishes to npm
- verify the npm package version, GitHub release, and attached tarball after the workflow completes

## Working Rules

Use these rules when deciding what to build.

### Rule 1

If it makes Pluxx a better OSS authoring substrate for real plugin authors, it is probably near-term roadmap material.

### Rule 2

If it mostly assumes a hosted trust/business layer that does not exist yet, it is probably not near-term roadmap material.

### Rule 3

Do not widen the promise faster than the repo can prove it.

### Rule 4

Keep GTM-sensitive material out of the public repo.

## Repo Map

Use this map if you are trying to orient quickly.

- `src/`
  - CLI, config loading, generators, validation, compilation logic
- `example/pluxx/`
  - canonical self-hosted Pluxx plugin source project
- `example/docs-ops/`
  - flagship docs-ops source project scaffold for the rich host-depth example
  - includes a live Orchid read-only Docsalot demo target
- `plugins/pluxx/`
  - repo-local Codex dogfood plugin surface
- `tests/`
  - CLI, package, generator, migrate, install, verify-install, release-smoke coverage
- `docs/`
  - source-of-truth product, strategy, and operational docs
- `apps/web/`
  - public website

## Which Doc To Read Next

After this file:

- read [docs/todo/queue.md](./todo/queue.md) for the short operational queue
- read [docs/todo/master-backlog.md](./todo/master-backlog.md) for the broadest repo-native backlog
- read [roadmap.md](./roadmap.md) for execution direction
- read [mcp-first-command-lifecycle.md](./mcp-first-command-lifecycle.md) for the exact MCP-first CLI order
- read [pluxx-plugin-surface-audit.md](./pluxx-plugin-surface-audit.md) for how the self-hosted plugin works and where the remaining polish is
- read [strategy/gh-skill-and-agent-skills-note.md](./strategy/gh-skill-and-agent-skills-note.md) for what GitHub's new `gh skill` workflow changes and does not change for Pluxx
- read [oss-wedge-and-trust-layer.md](./oss-wedge-and-trust-layer.md) for product framing
- read [enterprise-adoption-thesis.md](./enterprise-adoption-thesis.md) for the stronger future enterprise thesis
- read [status-quo-vs-pluxx-story.md](./status-quo-vs-pluxx-story.md) for the broader positioning narrative
- read [Linear](https://linear.app/orchid-automation) for ticket-level detail and current execution state

## External Metadata Rule

Keep public repo metadata aligned with this brief:

- GitHub About description
- GitHub About homepage URL
- README top section
