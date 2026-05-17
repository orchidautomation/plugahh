# Core-Four Provider Docs Audit

Last updated: 2026-05-13

## Doc Links

- Role: official-doc-backed host capability audit
- Related:
  - [docs/core-four-primitive-matrix.md](./core-four-primitive-matrix.md)
  - [docs/compatibility.md](./compatibility.md)
  - [docs/core-four-translation-hit-list.md](./core-four-translation-hit-list.md)
  - [src/validation/platform-rules.ts](../src/validation/platform-rules.ts)
  - [docs/todo/queue.md](./todo/queue.md)
  - [docs/roadmap.md](./roadmap.md)
- Update together:
  - [docs/core-four-primitive-matrix.md](./core-four-primitive-matrix.md)
  - [docs/compatibility.md](./compatibility.md)
  - [src/validation/platform-rules.ts](../src/validation/platform-rules.ts)
  - [docs/todo/queue.md](./todo/queue.md)
  - [docs/roadmap.md](./roadmap.md)

This doc records the May 2026 first-party provider-doc audit refresh across:

- Claude Code
- Cursor
- Codex
- OpenCode

This is not the generated compatibility table.

This is the source audit that compares official docs against Pluxx's current assumptions in:

- `src/validation/platform-rules.ts`
- `docs/compatibility.md`
- `docs/core-four-primitive-matrix.md`

Method:

- one Firecrawl-backed subagent per host
- official provider docs only
- compare documented host surfaces against Pluxx's current machine-readable rules and public docs

## Executive Summary

The current Pluxx model is directionally right, but not fully current.

The biggest corrections are:

- OpenCode is not just "code-first"; it is also a real config platform with native commands, agents, permissions, remote config, managed config, and plugin event hooks that sit outside a manifest-only mental model
- Claude Code is richer than our current rules reflect, especially around plugin component breadth, hook events, settings scopes, plugin-agent restrictions, and distribution surfaces like themes, monitors, LSP, marketplaces, and output styles
- Codex is no longer just an external-hook guidance story; official docs now explicitly cover plugin-bundled hooks, richer config layering, app surfaces, and shared CLI or IDE MCP behavior
- Cursor is still close to our current model, but we were under-modeling the hook event surface, the Agent-vs-Tab rule split, child subagents, and broader host config outside the plugin bundle

If we want the compatibility story to stay truthful, the next updates should land in this order:

1. keep `src/validation/platform-rules.ts` current
2. regenerate `docs/compatibility.md`
3. tighten `docs/core-four-primitive-matrix.md`
4. keep the install/update/reload matrix current for end users

Status:

- the first refresh pass has already landed in:
  - `src/validation/platform-rules.ts`
  - `docs/compatibility.md`
  - `docs/core-four-primitive-matrix.md`
  - `docs/core-four-install-update-lifecycle.md`
- the row-level translation appendix has now landed in:
  - `docs/core-four-primitive-matrix.md`
- the row-level shared-brand translation contract has now landed in:
  - `docs/core-four-branding-metadata-audit.md`
- the current audited Codex extras now also have direct generator and fixture coverage:
  - optional `.app.json`
  - rich interface metadata
  - refresh/restart follow-up guidance in install notes
- a clean-room Exa research example now also exercises two of the sharper native-translation paths:
  - Claude-native agent frontmatter and manifest-agent emission
  - OpenCode permission-first agent output in a real subagent-heavy source project

This doc should now be treated as the audit source for future refreshes, not as a still-pending recommendation list from the first pass.

Use [docs/core-four-translation-hit-list.md](./core-four-translation-hit-list.md) as the concrete closure tracker for turning these audit rows into:

- row-level translation docs
- generator work
- explainability work
- fixture and proof work

## Capability Matrix

| Surface | Claude Code | Cursor | Codex | OpenCode |
|---|---|---|---|---|
| Manifest / plugin entry | Optional `.claude-plugin/plugin.json`; plugin can also auto-discover surfaces without a manifest | Required `.cursor-plugin/plugin.json`; marketplace metadata in `.cursor-plugin/marketplace.json` | Required `.codex-plugin/plugin.json`; marketplaces live in repo or home catalogs | Code-first JS or TS plugin module model; local dirs and npm-distributed plugins via config |
| Skills | Plugin skills at `skills/<name>/SKILL.md`; commands merged into skills; richest frontmatter of the four | Skills under `.cursor/skills/`, `~/.cursor/skills/`, `.agents/skills/`, `~/.agents/skills/`, plus compatibility dirs | Plugin-bundled `skills/`; non-plugin discovery through `.agents/skills` hierarchy; optional `agents/openai.yaml` metadata | Skills under `.opencode/skills/`, `~/.config/opencode/skills/`, plus `.claude/skills/` and `.agents/skills/` compatibility |
| Commands | Native command surface still exists, but skills are now the primary model | Slash-command surface is real; plugin-bundled command assumptions need more care than our current docs use | No documented plugin-packaged custom command directory equivalent; commands still degrade to skills plus routing, with Pluxx keeping a `.codex/commands.generated.json` companion and `AGENTS.md` routing guidance | Native command system via markdown files or config-defined commands |
| Agents / subagents | Plugin `agents/` supported, but plugin subagents explicitly do not support `hooks`, `mcpServers`, or `permissionMode` | Native subagents and compatibility dirs exist; subagents can spawn child subagents and inherit MCP tools | Project and user agents in `.codex/agents/` and `~/.codex/agents/`; app and CLI docs both expose subagent workflows | Agents are first-class through dirs and config, with primary and subagent modes plus permission-first control |
| Hooks | `hooks/hooks.json`, inline manifest hooks, settings hooks, and skill or agent frontmatter hooks; official event list is much broader than the old simplified model | Project and user `hooks.json`; plugin hooks also exist; official Agent and Tab events are documented and reload on save | `hooks/hooks.json` in plugin bundles plus `.codex/hooks.json` and `~/.codex/hooks.json`; official docs cover plugin-bundled hooks and a narrower event set | Hooks are plugin runtime event handlers in JS or TS, not a standalone JSON file convention |
| MCP | `.mcp.json` or inline manifest config; transports include `stdio`, `http`, `sse`; auth is richer than our current model | `.cursor/mcp.json` and `~/.cursor/mcp.json`; `stdio`, `sse`, `streamable http`; OAuth and static OAuth creds supported | `.codex/config.toml` and `.mcp.json`; `stdio` and streamable HTTP; bearer and OAuth auth; plugins can bundle `.mcp.json` | Config-native MCP under `opencode.json`; local and remote servers; auth and OAuth supported |
| Instructions / rules | `CLAUDE.md`; larger procedures should move into skills; settings scopes affect where related config is enforced | `.cursor/rules/` plus `AGENTS.md` support; rules do not apply to Cursor Tab; nested `AGENTS.md` is supported | `AGENTS.md`, `AGENTS.override.md`, model instruction overrides, and fallback filenames | `AGENTS.md`, `CLAUDE.md` fallback, config `instructions`, and host config files |
| Install / update / reload | Marketplace and local install surfaces exist; `/reload-plugins` is documented | Install/update is reload-window or restart oriented | Update local bundle or marketplace entry, then restart or refresh Codex; MCP config is shared between CLI and IDE extension | Startup config load model; desktop app and CLI share the same config-oriented story rather than a marketplace-first reload flow |

## Provider Findings

### Claude Code

Confirmed by official docs:

- `.claude-plugin/plugin.json` is optional, not required
- plugin components extend beyond the older "skills + hooks + MCP" simplification and include commands, agents, LSP servers, monitors, themes, and output styles
- plugin skills live at `skills/<skill-name>/SKILL.md`
- plugin skills can use richer Claude-only frontmatter fields such as:
  - `when_to_use`
  - `argument-hint`
  - `arguments`
  - `user-invocable`
  - `allowed-tools`
  - `model`
  - `effort`
  - `context`
  - `agent`
  - `hooks`
  - `paths`
  - `shell`
- hooks can live in `hooks/hooks.json`, in plugin manifest config, in settings files, and in skill or agent frontmatter
- official plugin hook events are much broader than the older simplified list and include events like `InstructionsLoaded`, `CwdChanged`, `FileChanged`, `WorktreeCreate`, `WorktreeRemove`, `PreCompact`, `PostCompact`, `Elicitation`, `ElicitationResult`, and `SessionEnd`
- plugin subagents exist, but do not inherit every capability from the main plugin surface
- plugin subagents explicitly do not support `hooks`, `mcpServers`, or `permissionMode`
- MCP can be declared in `.mcp.json` or inline in plugin config
- auth is broader than simple headers and env interpolation
- install, update, and reload are explicit product surfaces, including `/reload-plugins`
- settings scopes matter for plugin settings and hooks, while MCP uses its own managed / user-local / project scope model through `managed-mcp.json`, `~/.claude.json`, and `.mcp.json`

Current repo gaps:

- the main machine-readable Claude frontmatter, hook-surface, and MCP-auth gaps have now been corrected in `src/validation/platform-rules.ts`
- canonical Pluxx agents now also translate into Claude-native agent markdown and manifest entries instead of being copied through too raw
- Claude distribution is still easy to accidentally compress back down to "manifest plus skills plus hooks plus MCP" even though the official plugin surface is broader
- `docs/compatibility.md` and `docs/core-four-primitive-matrix.md` still need to stay aligned with that richer Claude shape when future provider changes land
- downstream maintainer docs can still drift back toward the older “one manifest, one hook file, one MCP file” simplification if they are not kept current

Concrete files to update:

- `src/validation/platform-rules.ts`
- `docs/compatibility.md`
- `docs/core-four-primitive-matrix.md`

### Cursor

Confirmed by official docs:

- `.cursor-plugin/plugin.json` is the plugin manifest
- `.cursor-plugin/marketplace.json` is a real packaging surface
- hooks live in project and user `hooks.json` files and reload on save
- official hook events are documented across both Agent and Tab flows
- skills are discovered from Cursor dirs, `.agents/skills`, and compatibility dirs
- skills support supporting files and scripts
- subagents are real and support compatibility with `.claude/agents/` and `.codex/agents/`
- subagents can create child subagents
- MCP config lives in project and user `mcp.json`
- Cursor documents `stdio`, `sse`, and streamable HTTP MCP transports
- OAuth and static OAuth credentials are documented
- install/update behavior is tied to restart or reload-window flows
- ACP and headless CLI surfaces are part of the real host environment
- `AGENTS.md` and nested `AGENTS.md` are real rule inputs, but rules do not apply to Cursor Tab

Current repo gaps:

- the main machine-readable Cursor transport, hook-event, and auth gaps have now been corrected in `src/validation/platform-rules.ts`
- we still need to avoid collapsing Cursor's hook story into just "tool hooks"; the official event list is significantly broader
- some wording in `docs/core-four-primitive-matrix.md` is stronger than the supplied docs justify for exact plugin command and agent storage paths
- `docs/compatibility.md` is directionally right but too compressed for lifecycle and auth nuance

Concrete files to update:

- `src/validation/platform-rules.ts`
- `docs/compatibility.md`
- `docs/core-four-primitive-matrix.md`

### Codex

Confirmed by official docs:

- `.codex-plugin/plugin.json` is required for plugins
- marketplaces live in repo-level and home-level catalogs
- installed plugin bundles are loaded from Codex cache, not directly from the source repo path
- plugin skills are bundled under `skills/`
- non-plugin skills are discovered through `.agents/skills` directories
- `agents/openai.yaml` is optional metadata for plugin skills
- hook config exists at project and user paths, while plugin bundles can also carry `hooks/hooks.json`; official docs now split activation between the general `[features].hooks` flag, which defaults on for non-plugin hook config, and `[features].plugin_hooks = true`, which is required for plugin-bundled hooks. The deprecated `[features].codex_hooks` alias still appears in local runtime behavior, and current `codex exec --help` exposes `--enable <FEATURE>` for the CLI path, but maintained local probes on May 13, 2026 still failed to execute the project-local hook under the general flag, deprecated alias, or `--enable hooks`.
- Codex documents `stdio` and streamable HTTP MCP transports
- Codex documents bearer-token and OAuth MCP auth
- `.app.json` is a real optional plugin surface
- instructions include `AGENTS.md`, `AGENTS.override.md`, model instruction overrides, and fallback filenames
- plugin updates are picked up by updating the bundle and restarting Codex
- MCP configuration is officially shared between the CLI and IDE extension
- the hooks page documents plugin-bundled hooks explicitly, not just external `.codex/hooks.json`

Current repo gaps:

- the main machine-readable Codex transport and hook-event gaps have now been corrected in `src/validation/platform-rules.ts`
- the current remaining drift is no longer about bundled-vs-external hooks; it is about proving real runtime activation across Codex versions now that plugin-bundled hooks have a separate `[features].plugin_hooks = true` gate, the local runtime still exposes the general hook flag plus deprecated `codex_hooks` alias for project/user hooks, current CLI help routes feature activation through `--enable <FEATURE>`, and the maintained probes still time out or no-op without a project-local hook signal under the general flag, deprecated alias, or `--enable hooks`
- current live probes also show docs-vs-runtime caveats for Codex subagents: `sandbox_mode` is documented and emitted, but both the maintained headless probe and the maintained trusted interactive probe still let a child agent declared as `read-only` write `sandbox-proof.txt`; discovered `.agents/skills` inheritance is live-proven, yet a parent `[[skills.config]] enabled = false` entry was ignored in the maintained headless probe and an agent-local `[[skills.config]]` entry did not preload an undiscovered `skills/` path
- current live probes now also show a sharper Codex MCP caveat: project-scoped, user-scoped, and inline-agent MCP config all reached `initialize`, `notifications/initialized`, and `tools/list` in headless `codex exec`, but the default root-scoped paths were still auto-cancelled with `user cancelled MCP tool call` before any server-side `tools/call`, while the default inline-agent path fell back to `MCP_PROOF_MARKER_MISSING`. The maintained suite now also proves five explicit approval unlock paths: project-scoped root MCP, user-scoped root MCP, agent-local inline `mcp_servers`, a custom agent inheriting an approved project-scoped root MCP server, and a custom agent inheriting an approved user-scoped root MCP server can all reach real server-side `tools/call` once `[mcp_servers.<id>.tools.<tool>] approval_mode = "approve"` is present. All three approved custom-agent runs still avoid a root `mcp_tool_call` item and instead surface child `agents_states` moving through `pending_init` to `completed`; project-scoped servers still do not appear in `codex mcp list`, and user-scoped servers do appear there. Pluxx already uses the root-config proof by generating `.codex/config.generated.toml` when canonical top-level MCP allow rules can be materialized safely
- several conservative Codex listing limits are now encoded as Pluxx advisory heuristics rather than official-doc-backed hard facts:
  - `skillDescriptionMax: 1024`
  - `skillNameMustMatchDir: true`
  - `manifestPromptMax: 128`
  - `manifestPromptCountMax: 3`
- `docs/compatibility.md` and `docs/core-four-primitive-matrix.md` still need to stay aligned with that more careful wording when future host behavior shifts again

Concrete files to update:

- `src/validation/platform-rules.ts`
- `docs/compatibility.md`
- `docs/core-four-primitive-matrix.md`

### OpenCode

Confirmed by official docs:

- OpenCode plugins are fundamentally code-first JS or TS modules
- plugin loading can come from local plugin dirs or npm package references in config
- there is no single required `index.ts` contract in the narrow way our current rules imply
- skills, commands, and agents each have native discovery dirs
- compatibility with `.claude/skills/` and `.agents/skills/` is real
- MCP is configured directly in host config and supports local and remote servers
- permissions are first-class host config and are keyed by tool name plus safety guards
- native `skill` and `task` permission keys are documented
- agent `tools` is deprecated in favor of `permission`, though still supported for backwards compatibility
- instructions can come from `AGENTS.md`, `CLAUDE.md`, and config `instructions`
- hooks are runtime plugin event handlers, not a standalone `hooks.json` convention
- plugins can also add custom tools and respond to a much broader event bus than the older Pluxx docs implied
- config precedence is richer than our old simplification: remote config, global config, custom config, project config, `.opencode` dirs, inline config, managed files, and macOS managed preferences are all documented
- default-agent behavior is documented across TUI, CLI, desktop app, and GitHub Action

Current repo gaps:

- the main machine-readable OpenCode mismatch has now been corrected in `src/validation/platform-rules.ts`
- the OpenCode generator now also prefers permission-first agent output and translates legacy agent `tools` into `permission` where possible
- lint now only flags OpenCode agent `tools` usage when canonical `permission` frontmatter is missing; permission-first source agents can keep cross-host `tools` hints without triggering a false-positive deprecation warning
- that permission-first output is now also exercised in a real public subagent-heavy example:
  - `example/exa-plugin`
- `docs/compatibility.md` now reflects OpenCode as a config/runtime host rather than a `package.json + index.ts` manifest host
- the remaining risk is downstream docs and examples slipping back into manifest-host framing or deprecated legacy-tool framing instead of code-first, permission-first runtime-host framing
- current skill discovery dirs and instruction surfaces need to stay current as OpenCode evolves
- current maintainer docs still need to remember that OpenCode's plugin surface is not just "hooks in code"; it is also commands, agents, permissions, remote config, managed config, and custom tools

Concrete files to update:

- `src/validation/platform-rules.ts`
- `docs/compatibility.md`
- `docs/core-four-primitive-matrix.md`

## Cross-Host Conclusions

The audit makes a few product truths clearer.

### 1. Skills remain the most portable workflow layer

This is still the strongest shared authoring center across the core four.

But the details matter:

- Claude has the richest skill frontmatter
- Cursor and Codex share more compatibility paths than the current docs emphasize
- OpenCode is compatible with skills, but its plugin runtime is much more code-first

### 2. Commands are not actually portable 1:1

Pluxx is still right to treat commands as a translation problem.

The current state is:

- Claude: commands are now effectively part of the broader skills model
- Cursor: commands are real, but the plugin-packaged storage assumptions need careful wording
- Codex: no documented plugin-packaged custom command dir parity
- OpenCode: commands are real and config-native

### 3. Hooks are the least portable surface

This audit reinforced that hook intent is portable, but hook representation is not.

- Claude spreads hooks across manifest, settings, skills, and agents
- Cursor uses hook JSON plus documented event names
- Codex uses feature-flagged hook JSON
- OpenCode uses plugin runtime handlers

### 4. OpenCode should be treated as a runtime host, not a manifest host

That is the biggest conceptual correction from this pass.

Pluxx should keep a portable authoring model, but the OpenCode compiler target needs to stay comfortable generating real JS or TS runtime artifacts and config, not just manifest-plus-markdown output.

### 5. Install and update behavior deserves its own user-facing matrix

The core-four capability story is not only about files.

It is also about:

- how a user installs
- how updates are discovered
- whether reload exists
- whether restart is required

The provider docs now justify a small separate lifecycle matrix for that.

## Recommended Fix Order

### 1. Refresh the machine-readable registry

Update `src/validation/platform-rules.ts` first.

That is the actual source of truth for:

- generated compatibility docs
- doctor/lint messaging
- compiler-facing capability assumptions

### 2. Regenerate the compatibility matrix

After the rules file is corrected, regenerate `docs/compatibility.md`.

### 3. Tighten the conceptual primitive matrix

Then update `docs/core-four-primitive-matrix.md` so the higher-level explanation matches the newly refreshed rules.

### 4. Keep the host lifecycle matrix current

The install/update/reload matrix now lives in [docs/core-four-install-update-lifecycle.md](./core-four-install-update-lifecycle.md).

Refresh it when provider docs or live proof change around:

- install surface
- update surface
- reload behavior
- restart requirement
- official update discovery model

## Official Docs Used

### Claude Code

- [MCP](https://code.claude.com/docs/en/mcp)
- [Discover plugins](https://code.claude.com/docs/en/discover-plugins)
- [Plugins](https://code.claude.com/docs/en/plugins)
- [Skills](https://code.claude.com/docs/en/skills)
- [Hooks guide](https://code.claude.com/docs/en/hooks-guide)
- [Sub-agents](https://code.claude.com/docs/en/sub-agents)
- [Plugin marketplaces](https://code.claude.com/docs/en/plugin-marketplaces)
- [Plugin dependencies](https://code.claude.com/docs/en/plugin-dependencies)
- [Features overview](https://code.claude.com/docs/en/features-overview)
- [Best practices](https://code.claude.com/docs/en/best-practices)
- [CLI reference](https://code.claude.com/docs/en/cli-reference)
- [Hooks](https://code.claude.com/docs/en/hooks)
- [Plugins reference](https://code.claude.com/docs/en/plugins-reference)
- [Environment variables](https://code.claude.com/docs/en/env-vars)

### Cursor

- [CLI headless](https://cursor.com/docs/cli/headless)
- [Plugins](https://cursor.com/docs/plugins)
- [Rules](https://cursor.com/docs/rules)
- [Skills](https://cursor.com/docs/skills)
- [Subagents](https://cursor.com/docs/subagents)
- [Hooks](https://cursor.com/docs/hooks)
- [MCP](https://cursor.com/docs/mcp)
- [Slash commands](https://cursor.com/docs/cli/reference/slash-commands)
- [Parameters](https://cursor.com/docs/cli/reference/parameters)
- [Authentication](https://cursor.com/docs/cli/reference/authentication)
- [Permissions](https://cursor.com/docs/cli/reference/permissions)
- [Configuration](https://cursor.com/docs/cli/reference/configuration)
- [ACP](https://cursor.com/docs/cli/acp)

### Codex

- [Subagents concept](https://developers.openai.com/codex/concepts/subagents)
- [CLI features](https://developers.openai.com/codex/cli/features)
- [CLI reference](https://developers.openai.com/codex/cli/reference)
- [Slash commands](https://developers.openai.com/codex/cli/slash-commands)
- [Advanced config](https://developers.openai.com/codex/config-advanced)
- [Rules](https://developers.openai.com/codex/rules)
- [Hooks](https://developers.openai.com/codex/hooks)
- [MCP](https://developers.openai.com/codex/mcp)
- [AGENTS.md guide](https://developers.openai.com/codex/guides/agents-md)
- [Plugins](https://developers.openai.com/codex/plugins)
- [Build plugins](https://developers.openai.com/codex/plugins/build)
- [Skills](https://developers.openai.com/codex/skills)
- [Subagents](https://developers.openai.com/codex/subagents)
- [Noninteractive](https://developers.openai.com/codex/noninteractive)
- [SDK](https://developers.openai.com/codex/sdk)
- [Agents SDK guide](https://developers.openai.com/codex/guides/agents-sdk)

### OpenCode

- [SDK](https://opencode.ai/docs/sdk/)
- [Server](https://opencode.ai/docs/server/)
- [MCP servers](https://opencode.ai/docs/mcp-servers/)
- [Plugins](https://opencode.ai/docs/plugins/)
- [Agents](https://opencode.ai/docs/agents/)
- [Config](https://opencode.ai/docs/config/)
- [Skills](https://opencode.ai/docs/skills/)
- [Custom tools](https://opencode.ai/docs/custom-tools/)
- [Commands](https://opencode.ai/docs/commands/)
- [Permissions](https://opencode.ai/docs/permissions/)
- [Rules](https://opencode.ai/docs/rules/)
- [ACP](https://opencode.ai/docs/acp/)
