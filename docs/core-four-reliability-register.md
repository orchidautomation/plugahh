# Core-Four Reliability Register

Last updated: 2026-05-13

## Doc Links

- Role: primitive-by-primitive failure register and evidence map for the core four
- Related:
  - [docs/core-four-primitive-matrix.md](./core-four-primitive-matrix.md)
  - [docs/core-four-provider-docs-audit.md](./core-four-provider-docs-audit.md)
  - [docs/core-four-install-update-lifecycle.md](./core-four-install-update-lifecycle.md)
  - [docs/compatibility.md](./compatibility.md)
  - [docs/pluxx-self-hosted-core-four-proof.md](./pluxx-self-hosted-core-four-proof.md)
  - [docs/docs-ops-core-four-proof.md](./docs-ops-core-four-proof.md)
  - [docs/exa-research-example.md](./exa-research-example.md)
  - [docs/platform-change-ops-reference-plugin.md](./platform-change-ops-reference-plugin.md)
  - [docs/todo/author-once-hardening.md](./todo/author-once-hardening.md)
  - [docs/todo/queue.md](./todo/queue.md)
  - [docs/todo/master-backlog.md](./todo/master-backlog.md)
  - [docs/roadmap.md](./roadmap.md)
- Update together:
  - [docs/todo/queue.md](./todo/queue.md)
  - [docs/todo/master-backlog.md](./todo/master-backlog.md)
  - [docs/roadmap.md](./roadmap.md)

Use this doc when the question is not only:

- what does Pluxx map to per host

but also:

- what can still break
- what already has strong proof
- what still needs deeper release-grade evidence

The priority order in this register is:

1. Claude Code
2. Codex
3. Cursor
4. OpenCode

## Current Baseline

As of 2026-05-13:

- a clean isolated `npm test` run passed on the current worktree state
- `npm run release:check` also passed end to end
- the strongest current evidence comes from:
  - generator fixtures
  - `doctor --consumer`
  - `verify-install`
  - release smoke on maintained example plugins
  - the maintained self-hosted `example/pluxx/.pluxx/behavioral-smoke.json` fixture
  - `bun scripts/probe-claude-hooks-runtime.ts --json`
  - `bun scripts/probe-codex-hooks-runtime.ts --json`
  - host walkthroughs and example proof docs
- the newest live Codex runtime evidence is now more specific:
  - the current local Codex runtime accepts both `[features].codex_hooks` and `[features].hooks`, even though the first-party docs and the runtime are now drifting
  - Pluxx now emits the official nested Codex hook shape: `event -> matcher group -> hooks[]`
  - the maintained `bun scripts/probe-codex-hooks-runtime.ts --json` probe now runs isolated authenticated headless `codex exec` checks against project-local hooks
  - on 2026-05-13, that probe reported `headless-response-no-hook` for `hooks-no-trust`, `hooks-trusted`, and `codex-hooks-trusted`: each scenario returned `OK`, each emitted `turn.completed`, and none executed the hook side effect
  - the maintained `bun scripts/probe-codex-agents-runtime.ts --json` probe now also covers headless custom-agent sandbox behavior; on 2026-05-13, the `sandbox-readonly` scenario still emitted `spawn_agent` plus `wait`, returned `SANDBOX_WRITE_PROOF`, and wrote `sandbox-proof.txt` despite `sandbox_mode = "read-only"`, while the `sandbox-workspace-write` control also wrote its expected side effect
  - the same maintained headless custom-agent suite now also pins skill-config behavior more sharply: on 2026-05-13, a discovered project `.agents/skills/proof-skill/SKILL.md` was inherited cleanly by a custom agent and returned `SKILL_PROOF_TOKEN_PROJECT_DISCOVERY` with no pre-spawn local work, a parent `.codex/config.toml` `[[skills.config]] enabled = false` entry for that discovered skill was ignored and still returned `SKILL_PROOF_TOKEN_DISABLED_IGNORED`, and an agent-local `[[skills.config]] path = "./skills/proof-skill/SKILL.md"` entry did not preload an undiscovered `skills/` path and instead returned `SKILL_PROOF_MISSING`
  - the maintained `bun scripts/probe-codex-agents-interactive-runtime.ts --json` probe now gives isolated trusted interactive custom-agent evidence too; on 2026-05-13, the `sandbox-readonly-trusted` scenario ended `interactive-proof-observed`, surfaced `proofToken = SANDBOX_WRITE_PROOF`, and wrote `sandbox-proof.txt` with `interactive-readonly` even though the child agent TOML still declared `sandbox_mode = "read-only"`, while the `sandbox-workspace-write-trusted` control stayed side-effect-matched with `interactive-writable`
  - the maintained `bun scripts/probe-codex-mcp-runtime.ts --json` probe now also covers headless Codex MCP availability across default project config, default user config, default inline custom-agent `mcp_servers`, `project-config-root-approve`, `user-config-root-approve`, `agent-inline-approve`, `project-config-agent-inherit-approve`, and `user-config-agent-inherit-approve`
  - on 2026-05-13, the three default scenarios all reached `initialize`, `notifications/initialized`, and `tools/list`, but only the default root paths emitted a real `mcp_tool_call` item, and both of those default root paths failed it with `user cancelled MCP tool call` even under `approval_policy = "never"`
  - the default inline custom-agent path still returned `MCP_PROOF_MARKER_MISSING` after `spawn_agent` plus `wait` without surfacing any root `mcp_tool_call` item
  - the maintained `project-config-root-approve`, `user-config-root-approve`, `agent-inline-approve`, `project-config-agent-inherit-approve`, and `user-config-agent-inherit-approve` controls then all reached real server-side `tools/call` and returned `MCP_PROOF_MARKER_ALLOWED` once explicit `[mcp_servers.probe.tools.get_allowed_marker] approval_mode = "approve"` was present in the relevant root or agent-local layer
  - all three approved custom-agent controls still completed without surfacing a root `mcp_tool_call` item in the parent `codex exec --json` stream, but the maintained probe now also records child `agents_states` moving through `pending_init` to `completed`, so child-agent MCP success is now proven from `spawn_agent` / `wait`, child agent state, plus server-side methods and side effects
  - the same maintained MCP probe also showed a discovery mismatch: the project-scoped `.codex/config.toml` server was used by `codex exec`, and the `project-config-root-approve` control stayed callable, but neither project-scoped variant appeared in `codex mcp list`, while the user-scoped `CODEX_HOME/config.toml` server did appear in `codex mcp list`
  - an earlier ad hoc interactive Codex TTY `SessionStart` probe did persist `[projects."<path>"].trust_level = "trusted"` and surface `1 hook needs review before it can run. Open /hooks to review it.`, but the maintained interactive hook probe no longer reproduces that gate on local Codex CLI `0.130.0`
  - the maintained `bun scripts/probe-codex-hooks-interactive-runtime.ts --json` probe now checks trusted `UserPromptSubmit` and `SessionStart` scenarios under both `hooks` and `codex_hooks`; on May 13, 2026 all four scenarios timed out with no project-local hook side effect and no `/hooks` review gate, while the `codex_hooks` prompt path emitted a deprecation message pointing users to `hooks`
  - a targeted maintained `session-start-hooks-trusted-reviewed` rerun on 2026-05-13 also ended `runner-timed-out` with no project-local hook side effect and no `/hooks` review gate, so the current local reviewed interactive path is now negative evidence rather than an unrerun placeholder
  - the optional `--include-enable-hooks-cli` maintained hook scenarios now sharpen that activation story further: on May 13, 2026 headless `enable-hooks-trusted` still returned `OK` with no hook side effect, and trusted interactive `user-prompt-submit-enable-hooks-trusted` plus `session-start-enable-hooks-trusted` both still timed out with no hook side effect and no `/hooks` review gate, so the current local runtime still no-ops hooks even through the current CLI feature path `--enable hooks`
  - the official CLI slash-command docs currently list `/skills`, `/review`, `/mcp`, and `/plugins`, but not `/hooks`
- the newest live Claude runtime evidence is also more specific:
  - the maintained `bun scripts/probe-claude-hooks-runtime.ts --json` probe now runs isolated headless `claude -p --output-format stream-json --include-hook-events --verbose --dangerously-skip-permissions` checks against user, project, and local settings hooks plus real installed-plugin scenarios in a temp Claude home
  - on 2026-05-13, that probe showed user, project, and local `SessionStart` settings hooks all firing by default even while unauthenticated
  - the same probe showed `--setting-sources user,project` dropping local settings hooks
  - the same probe also showed a user-layer `disableAllHooks: true` suppressing an otherwise-present local `SessionStart` settings hook
  - the maintained Claude hook probe now also has opt-in shadow scenarios for managed `disableAllHooks` and `allowManagedHooksOnly` with `SessionStart`, but those still run through a synthetic managed-settings path in the probe/test harness rather than the real Claude managed-settings delivery surface, so they do not upgrade registry/plist/MDM/server-managed precedence to live proof
  - the same maintained unauthenticated probe now also proved installed-plugin hook activation: the default plugin scenario loaded `probe-plugin@...`, emitted `hook_started` plus `hook_response`, and wrote the `SessionStart` side effect before the expected unauthenticated `Not logged in · Please run /login` response
  - the duplicate-manifest installed-plugin scenario also loaded and executed one successful `SessionStart` hook via the standard auto-loaded `hooks/hooks.json`, but `claude plugin list --json` reported `Hook load failed: Duplicate hooks file detected ...`, which confirms the current verifier rule that `manifest.hooks` must not redundantly point at `./hooks/hooks.json`
- the biggest newly observed local reliability issue is proof orchestration, not core-four generator collapse:
  - concurrent same-worktree full-suite runs can contaminate repo-local fixture paths and cwd-sensitive runner tests
  - `npm test` now fails fast with a worktree lock instead of producing misleading flaky failures
  - `tests/run-vitest-exclusive.test.ts` now pins both active-lock refusal and stale-lock cleanup
  - deeper fixture isolation is still follow-on work

## How To Read This Register

- `Strong proof` means the surface has generator coverage plus installed-state or release-smoke evidence.
- `Medium proof` means the translation is documented and tested structurally, but the live host proof is still narrower.
- `Gap` means the current product story is honest, but the evidence is still thinner than an enterprise buyer should ultimately expect.

## Primitive Register

### 1. Instructions

- Claude Code failure modes:
  - `CLAUDE.md` can stay mechanically valid while settings-scope behavior, manifest-less import, or larger routing guidance still lacks equivalent install/runtime proof.
  - command and skill routing can drift back into prose-only guidance if Claude-rich metadata stops flowing through shared seams.
- Codex failure modes:
  - `AGENTS.md` and `AGENTS.override.md` can stay present while command-routing truth degrades to guidance only.
  - the practical instruction surface can diverge from the fallback-file and model-override story if docs or generators drift.
- Cursor/OpenCode secondary notes:
  - Cursor rules do not apply to Tab.
  - OpenCode instructions are split across `AGENTS.md`, `CLAUDE.md`, and config/runtime surfaces.
- Strong proof:
  - migrate/import preserves Codex and Claude instruction surfaces
  - `docs-ops` proves cross-host inspect/rewrite flow through the official CLIs
- Current gaps:
  - Claude managed-settings behavior beyond the file-based/user/project/local checks is intentionally still unproven here; the maintained probe can shadow managed `disableAllHooks` and `allowManagedHooksOnly`, but registry, plist/MDM, server-managed policy, managed-scope plugin precedence, and the broader official hook-event list still require a real managed-settings surface
  - Codex command-routing guidance still needs more live workflow proof under ambiguous prompts

### 2. Skills

- Claude Code failure modes:
  - command-wrapped skills can surface twice if hiding and `user-invocable` adjustments regress
  - richer Claude frontmatter can silently degrade if parser and generator seams drift apart
- Codex failure modes:
  - skill behavior can still be correct while richer frontmatter survives only as companion metadata
  - conservative listing heuristics can feel like hard limits if docs and generator notes drift
- Cursor/OpenCode secondary notes:
  - both preserve skill meaning well, but much Claude-rich frontmatter is still compatibility metadata rather than native UX
- Strong proof:
  - shared `src/skills.ts`
  - rich skill fixture coverage
  - install/verify/release-smoke proof on maintained examples
- Current gaps:
  - deeper live proof for how Codex surfaces companion skill metadata to end users

### 3. Commands

- Claude Code failure modes:
  - same-name skill/command collisions can cause duplicate or confusing entrypoints if the hiding path regresses
  - argument UX can stay structurally present while routing intent drifts from the skill it is meant to invoke
- Codex failure modes:
  - there is still no documented native plugin-packaged slash-command parity, so the command contract depends on `AGENTS.md` plus `.codex/commands.generated.json`
  - ambiguous prompts can select the wrong workflow even if the source command metadata is correct
- Cursor/OpenCode secondary notes:
  - both preserve command intent more natively today than Codex
- Strong proof:
  - command metadata seam is shared
  - build/lint/doctor explain Codex degradation explicitly
  - maintained behavioral smoke fixtures require command-specific proof markers
- Current gaps:
  - more adversarial Codex command-routing behavior proof

### 4. Agents

- Claude Code failure modes:
  - plugin subagents do not support every main-plugin surface, especially `hooks`, `mcpServers`, and `permissionMode`
  - explicit Claude MCP tool allowlists can fail schema validation, so generator-level filtering must stay correct
- Codex failure modes:
  - `.codex/agents/*.toml` can be generated correctly while deeper runtime proof still needs to cover more than basic invocation, especially advanced config inheritance and override fields
  - documented tuning knobs can look native in TOML while current runtime behavior is weaker than the field suggests; local probes now show `sandbox_mode = "read-only"` not preventing a child agent from writing to the workspace under either `codex exec` or a trusted interactive Codex session
  - Codex skill config semantics are currently uneven in headless local runtime: discovered `.agents/skills` inheritance works, but a parent `[[skills.config]] enabled = false` entry was ignored in maintained local probes, and an agent-local `[[skills.config]]` entry did not preload an undiscovered `skills/` path
  - Codex MCP attachment is currently uneven in maintained headless local runtime: default project config, default user config, and default inline custom-agent `mcp_servers` all reached MCP startup plus `tools/list`, but default root MCP still auto-cancelled a real `mcp_tool_call` before server `tools/call`, and the default inline-agent path still fell back to `MCP_PROOF_MARKER_MISSING`; project-scoped MCP still did not surface in `codex mcp list`, while explicit per-tool `approval_mode = "approve"` is now live-proven for project-scoped root MCP, user-scoped root MCP, agent-local inline MCP, and delegated inherited-root MCP from either project or user config
  - non-native tuning or delegation knobs can look preserved in source while only surviving as translation notes
- Cursor/OpenCode secondary notes:
  - both are stronger native agent hosts than older Pluxx simplifications implied
- Strong proof:
  - migrate/build coverage for Claude, Codex, Cursor, and OpenCode agent translation
  - `agent run` coverage for Claude, Codex, Cursor, and OpenCode runners
  - `bun scripts/probe-codex-agents-runtime.ts --json` now gives maintained isolated headless Codex custom-agent evidence; on 2026-05-13 local Codex CLI `0.130.0` emitted `spawn_agent` plus `wait` for an explicit project-local `proof` agent request and returned `CUSTOM_AGENT_PROOF`, the implicit-control prompt returned `OK` without spawning any custom agent, a project-local `explorer.toml` override produced `CUSTOM_EXPLORER_OVERRIDE`, a project-local `proof.toml` beat a same-name user-local `~/.codex/agents/proof.toml` by returning `PROJECT_AGENT_PROOF`, a discovered project `.agents/skills/proof-skill/SKILL.md` was inherited cleanly by a custom agent and returned `SKILL_PROOF_TOKEN_PROJECT_DISCOVERY`, a parent `.codex/config.toml` `[[skills.config]] enabled = false` entry for that discovered skill was ignored and still returned `SKILL_PROOF_TOKEN_DISABLED_IGNORED`, an agent-local `[[skills.config]] path = "./skills/proof-skill/SKILL.md"` entry did not preload an undiscovered `skills/` path and instead returned `SKILL_PROOF_MISSING`, the maintained sandbox scenarios still showed `sandbox_mode = "read-only"` writing `sandbox-proof.txt` while the `workspace-write` control wrote as expected, and a targeted invalid-model rerun still emitted `spawn_agent` plus `wait` while surfacing `The proof agent errored: ... model is not supported ...`, which pins that agent-local `model` is honored strongly enough to affect live runtime even when the parent wraps the failure
  - targeted maintained live reruns on 2026-05-13 now also closed the two model-precedence cases that were previously only in source/test coverage: `project-no-model-does-not-inherit-user-invalid-model` returned `PROJECT_NO_MODEL_PROOF`, which shows a project-local same-name agent without an explicit `model` did not inherit the user-local invalid model, and `project-valid-model-overrides-user-invalid-model` returned `PROJECT_VALID_MODEL_PROOF`, which shows an explicit valid project-local model overrode the same-name user-local invalid model
  - `pluxx migrate` now also warns when a native Codex `.codex/agents/*.toml` file declares agent-local `mcp_servers` and per-tool approvals, because current canonical agent migration only preserves `name`, `description`, `model`, `model_reasoning_effort`, `sandbox_mode`, and `developer_instructions`; that delegated MCP shape is now explicitly review-required instead of silently downgraded
  - `bun scripts/probe-codex-agents-interactive-runtime.ts --json` now keeps that interactive proof maintained instead of anecdotal: the read-only sandbox mismatch is not just headless, and the trusted interactive control path still shows a writable side effect where expected
  - `bun scripts/probe-codex-mcp-runtime.ts --json` now gives maintained isolated headless Codex MCP evidence too; on 2026-05-13 local Codex CLI `0.130.0` reached `initialize`, `notifications/initialized`, and `tools/list` for the default project-scoped config, default user-scoped config, default inline custom-agent `mcp_servers`, `project-config-root-approve`, `user-config-root-approve`, `agent-inline-approve`, `project-config-agent-inherit-approve`, and `user-config-agent-inherit-approve`
  - in that maintained suite, the two default root paths emitted a real `mcp_tool_call` item for `get_allowed_marker` and failed it with `user cancelled MCP tool call`, the default inline custom-agent path returned `MCP_PROOF_MARKER_MISSING` after `spawn_agent` plus `wait`, and all five approved controls reached real server-side `tools/call` and returned `MCP_PROOF_MARKER_ALLOWED`; the three approved custom-agent controls still did not surface a root `mcp_tool_call` item in the parent `codex exec --json` stream, but they did surface child `agents_states` progressing through `pending_init` to `completed`
  - the same probe also showed the project-scoped server not appearing in `codex mcp list` even though both the default and approval-override project-scoped runs still touched it, while the user-scoped server did appear in `codex mcp list`
- Current gaps:
  - deeper Codex proof for advanced custom-agent config behavior beyond basic invocation, name resolution, project-local precedence, discovered `.agents/skills` inheritance, the now-pinned headless `skills.config` disable/preload caveats, the headless-plus-interactive `read-only` sandbox mismatch, the now-pinned invalid agent-local model failure path plus same-name user-local model precedence cases, why successful delegated MCP paths still do not surface a root `mcp_tool_call` item in the parent event stream, installed-plugin skill preload, whether canonical authoring should learn to preserve agent-local MCP config instead of only warning during migrate, how far generated `.codex/config.generated.toml` approval stanzas should go now that project-root, user-root, and inherited delegated approval paths are live-proven while agent-local inline approvals still require their own shape, and whether other approval or sandbox combinations behave differently
  - deeper Claude proof for advanced subagent constraints beyond basic generation
  - Pluxx now also warns at source-lint time when a Codex target combines canonical `agents/` plus root MCP config, because maintained local proof now includes an explicit custom-agent `mcp_servers = {}` scenario that still inherited approved root MCP, and upstream Codex issue `#20135` reports the same ceiling: custom agents inherit parent MCP servers from active config and there is still no documented reliable opt-out for least-privilege or non-MCP subagents

### 5. Hooks

- Claude Code failure modes:
  - prompt hooks are only preserved on a subset of events
  - `failClosed` and `loop_limit` still degrade/drop
  - plugin hooks, settings hooks, and frontmatter hooks can drift if one surface changes and the others are not re-audited
- Codex failure modes:
  - only command hooks are bundled today, even though the bundle now uses the official nested matcher-group hook schema instead of flat entries
  - prompt hooks and non-command hook types drop
  - `failClosed` and `loop_limit` do not survive into generated Codex hook output
  - hook activation can still depend on feature gates, project trust, hook review, and runtime support; official docs now split the gates between the general `[features].hooks` flag for project/user hooks and `[features].plugin_hooks = true` for plugin-bundled hooks, while maintained interactive probes on May 13, 2026 timed out without a project-local `.codex/hooks.json` side effect or `/hooks` review gate under both `[features].hooks = true` and the deprecated `[features].codex_hooks = true` alias
  - a targeted maintained `reviewed-session-start` rerun on 2026-05-13 also timed out after the post-review phase with no project-local hook side effect and no `/hooks` review gate, so the current local reviewed interactive path still does not produce maintained successful hook execution
  - readiness for named skills/commands still degrades to prompt-entry best-effort matching
- Cursor/OpenCode secondary notes:
  - Cursor has a strong but bounded event set
  - OpenCode runtime hooks are native but code-first and currently command-hook-centric in Pluxx
- Strong proof:
  - row-level hook registry
  - build fixture coverage, including the official nested Codex matcher-group shape
  - `doctor` and `lint` explain the degradation
  - installed-bundle integrity now fails malformed bundled `hooks/hooks.json`, not only missing hook files
  - `doctor --consumer`, `verify-install`, and `lint` now distinguish general Codex hook config from plugin-bundled hook activation: hook-bearing plugin installs need `[features].plugin_hooks = true`, while `[features].hooks` remains the general non-plugin hook flag and `codex_hooks` is deprecated
  - general-only flag guidance now warns that `[features].hooks = true` and deprecated `[features].codex_hooks = true` do not activate plugin-bundled hooks by themselves; maintained local probes on May 13, 2026 still no-oped the project-local hook under both general config flags and under the current CLI feature path `--enable hooks`
  - `doctor --consumer` and `verify-install` now also warn when the checked project is not trusted in the user Codex config for project-local hook loading
  - `verify-install` now surfaces those installed-bundle Codex warning codes, explanations, and fixes inline instead of hiding them behind a warning count
  - Codex bundles that include `.codex/config.generated.toml` now also warn when the checked project/user Codex config layers still do not contain the generated per-tool approval stanzas
  - `bun scripts/probe-codex-hooks-runtime.ts --json` now gives maintained headless runtime evidence for hooks-no-trust, hooks-trusted, and codex-hooks-trusted Codex hook scenarios
- Current gaps:
  - current local Codex still has no maintained reproduced reviewed-hook success: the targeted trusted `reviewed-session-start` rerun also timed out with no project-local side effect and no `/hooks` review gate even though schema shape, missing-flag, and trust states are now surfaced structurally
  - headless `codex exec` is now better pinned: hooks-no-trust, hooks-trusted, `codex-hooks-trusted`, and `enable-hooks-trusted` all no-op the hook, but reviewed-headless behavior is still unproven
  - maintained Claude settings-hook proof is now stronger, and installed-plugin activation is now maintained too, but broader official Claude hook-event regression coverage is still thin
  - richer Claude event regression fixture coverage for the broader official event list

### 6. Permissions

- Claude Code failure modes:
  - permission intent is translated through generated hook/runtime behavior, not one static manifest field
  - installed permission-hook wrappers must stay executable after install-time secret materialization
- Codex failure modes:
  - `.codex/permissions.generated.json` is advisory only, and `.codex/config.generated.toml` is still a starter snippet rather than auto-loaded enforcement
  - real enforcement still lives in approvals, sandboxing, hooks, and custom-agent or admin config
  - this is the easiest primitive to overclaim as “supported” when the bundle itself is not the enforcing layer
- Cursor/OpenCode secondary notes:
  - Cursor permission intent spans multiple surfaces
  - OpenCode is permission-first and comparatively native here
- Strong proof:
  - canonical permission model doc
  - permission-rich fixture coverage
  - installed Claude/Cursor permission-hook smoke checks
- Current gaps:
  - live end-user proof for the Codex external policy path

### 7. Runtime

- Claude Code failure modes:
  - local stdio MCP launch can break if runtime paths assume cwd instead of `${CLAUDE_PLUGIN_ROOT}`
  - native runtime bootstrap can break if startup chains through installer-owned `scripts/check-env.sh`
- Codex failure modes:
  - installed plugin-owned stdio MCP paths must be rewritten to absolute installed paths
  - active Codex cache can stay stale relative to the installed bundle
  - custom templated header auth can still be unrepresentable and therefore omitted
  - readiness can look generated correctly while still missing live hook activation
- Cursor/OpenCode secondary notes:
  - Cursor can still fail for host-local auth/keychain reasons that are not generator bugs
  - OpenCode runtime behavior is strong but still more code-wrapper-heavy than the current public proof narrative
- Strong proof:
  - `doctor --consumer`
  - `verify-install`
  - platform-change-ops stress fixture
  - docs-ops and self-hosted Pluxx install proof
  - installed-MCP discovery now disambiguates duplicate Claude same-name servers across project `.mcp.json`, top-level `~/.claude.json`, and nested local `projects[...]` scope entries with path-qualified selectors
  - nested Claude `projects[...]` MCP entries are now preserved as distinct discovered/importable sources instead of collapsing inside one `~/.claude.json` file
- Current gaps:
  - deeper publish/recovery and reload/discovery proof

### 8. Distribution

- Claude Code failure modes:
  - local marketplace/cache behavior can drift from bundle shape
  - broader Claude plugin surfaces such as LSP, monitors, themes, output styles, and settings scopes are documented but not equally proven in current Pluxx examples
- Codex failure modes:
  - plugin detail view and global MCP settings can disagree
  - `.app.json` and richer interface metadata are generated, but not yet equally proven through polished live walkthroughs
  - refresh/restart and cache semantics can make a healthy bundle look stale
- Cursor/OpenCode secondary notes:
  - the next evidence gap is more polish than missing generator behavior, especially for in-app walkthrough quality
- Strong proof:
  - install/uninstall tests
  - stale-cache detection
  - release smoke
  - Codex and Claude install/update docs
  - the self-hosted `example/pluxx` source project now has maintained behavioral smoke cases for `verify-install` and Codex-hook-focused `translate-hosts`
  - Codex `.app.json` is now wired through the manifest `apps` pointer and installed-bundle integrity checks, so missing app surfaces fail `doctor --consumer` and `verify-install`
- Current gaps:
  - polished Cursor and OpenCode in-app walkthroughs
  - live proof for Codex `.app.json` and more of the Claude adjunct plugin surface

## Cross-Cutting Findings From This Pass

- Do not treat local concurrent proof failures as generator failures until the worktree-level suite lock is accounted for.
- Separate ambient host-runtime issues from bundle-shape issues:
  - the Exa example still records host-local rerun friction that is not the same as a generator defect
- Installed-MCP discovery is structurally stronger for enterprise-like host setups:
  - current Claude CLI MCP discovery now follows the real live sources: project `.mcp.json` plus user/local `~/.claude.json`
  - `mcpServers` declared in Claude `settings.json` files are ignored by current Claude CLI releases and are no longer treated as discoverable installed MCP sources
  - duplicate Claude MCP names across `.mcp.json`, top-level `~/.claude.json`, and nested local `projects[...]` entries now get distinct path-qualified selectors instead of ambiguous duplicate ids
  - duplicate Claude MCP names across nested local `projects[...]` blocks in `~/.claude.json` now stay distinct, and `init --from-installed-mcp` can target the exact nested project-scoped selector end to end
- Installed consumer-bundle integrity is stricter:
  - generated-shape Claude bundles no longer look healthy when `hooks/hooks.json` is malformed or points at missing bundle-owned targets just because the manifest omits a `hooks` field
  - Claude bundles also no longer look healthy when the manifest redundantly points `hooks` at the standard `./hooks/hooks.json` file that current Claude auto-loads anyway
  - malformed bundled Codex hook JSON is now a release-blocking consumer defect instead of a silent pass
  - missing Codex `.app.json` surfaces referenced by the manifest now also fail consumer integrity checks instead of passing as a partially wired install
  - hook-bearing Codex plugin installs no longer look silently healthy when neither project nor user Codex config enables `plugin_hooks = true`
  - hook-bearing Codex installs also no longer look silently healthy when the checked project is not trusted in the user Codex config
  - hook-bearing Claude installs now warn when any checked Claude settings layer sets `disableAllHooks = true`, because current live Claude probes showed that suppressing SessionStart settings-hook execution across user, project, and local layers
- Separate Codex hook bundle shape from Codex runtime activation:
  - the generated Codex hook bundle now matches the official nested matcher-group schema
  - live runtime probes still show extra activation gates beyond schema correctness: project trust, interactive-vs-headless behavior, and inconsistent review UX
- Keep Claude Code and Codex as the current reliability-center hosts:
  - Claude because it is the broadest and most native surface
  - Codex because it carries the most important honest-degrade surfaces
- The release gate is green again on the current worktree state:
  - `npm test` passed
  - `npm run release:check` passed

## Next Proof Block

The highest-value next block is:

1. deepen Claude and Codex live proof for the remaining highest-risk edges:
   - Codex real hook execution after project trust, plus the remaining `codex exec` vs interactive hook-runtime distinction and the inconsistent review UX around pending hooks
   - managed Claude settings behavior beyond the current file-based verifier, especially registry, plist/MDM, server-managed policy, `allowManagedHooksOnly`, and broader hook-event coverage
   - deeper Codex custom-agent config-depth proof beyond the now-pinned headless-plus-interactive `sandbox_mode = "read-only"` mismatch, the newly pinned headless `skills.config` caveats, and the newly pinned invalid agent-local model failure path, especially valid-model precedence/inheritance, MCP, installed-plugin skill preload, other approval or sandbox combinations, plus the remaining Codex and Claude adjunct distribution-surface proof
2. keep this register current as the short release-readiness truth source
3. keep reducing proof-harness shared-state assumptions until worktree-local serialization is no longer needed
