# Core-Four Primitive Matrix

This document defines how the Pluxx authoring model should map across the core four hosts:

- Claude Code
- Cursor
- Codex
- OpenCode

The goal is not to copy one host's files into the others.

The goal is to normalize author intent once, then compile it into the best native surface each host exposes.

If you want the maintainer-facing build plan that follows from this matrix, read [Core-Four Primitive Implementation Plan](./core-four-primitive-implementation-plan.md).

If you want the April 2026 first-party host audit that compares Pluxx's current assumptions against official provider docs, read [Core-Four Provider Docs Audit](./core-four-provider-docs-audit.md).

## Compiler Buckets

These are the eight buckets Pluxx should compile from:

| Bucket | Includes |
|---|---|
| `instructions` | shared host guidance and routing rules |
| `skills` | reusable workflows plus taxonomy-derived workflow metadata |
| `commands` | explicit slash-command style entrypoints |
| `agents` | specialist or delegated execution surfaces |
| `hooks` | deterministic lifecycle automation |
| `permissions` | portable `allow` / `ask` / `deny` intent |
| `runtime` | MCP, runtime auth, runtime readiness, local runtimes, passthrough dirs, helper scripts |
| `distribution` | user config, brand, packaging, install, publish, and install-surface metadata |

`taxonomy` remains an internal compiler input. It drives how skills, commands, instructions, and agents are rendered, but it is not itself a host-facing extension primitive.

## Canonical Shape

```ts
interface PluxxPrimitiveModel {
  instructions?: InstructionsSpec
  skills?: SkillSpec[]
  commands?: CommandSpec[]
  agents?: AgentSpec[]
  hooks?: HookSpec[]
  permissions?: PermissionSpec[]
  runtime?: {
    mcp?: {
      servers?: McpSpec
      auth?: RuntimeAuthSpec[]
    }
    readiness?: RuntimeReadinessSpec[]
    payload?: {
      passthrough?: string[]
      scripts?: string[]
      assets?: string[]
    }
  }
  distribution?: {
    identity?: IdentitySpec
    branding?: BrandSpec
    install?: {
      userConfig?: UserConfigSpec[]
      surface?: InstallSurfaceSpec
    }
    output?: {
      targets?: TargetPlatform[]
      outDir?: string
    }
    publish?: PublishSurfaceSpec
  }
  taxonomy: TaxonomySpec
}
```

This is a compiler-facing model. It is not a claim that each host has one identical manifest or one identical config file.

The important compiler nuance is that two of these public buckets already need finer internal seams:

- `runtime` should be reasoned about as MCP/auth, readiness, and generic bundled payload support
- `distribution` should be reasoned about as identity/branding, install-time config surface, and build/output surface

## Mapping Rules

| Bucket | Claude Code | Cursor | Codex | OpenCode | Pluxx mapping rule |
|---|---|---|---|---|---|
| `instructions` | `CLAUDE.md` plus plugin-level guidance surfaces | `rules/` plus `AGENTS.md` support | `AGENTS.md`, `AGENTS.override.md`, and config fallback instruction files | `AGENTS.md`, `CLAUDE.md` fallback, and config-driven instruction files | Keep one instruction source of truth and compile it into the host-native guidance surface rather than duplicating prose by hand. Also keep host-specific caveats explicit, like Cursor rules not affecting Tab. |
| `skills` | `skills/<skill>/SKILL.md` with the richest documented frontmatter | `skills/<skill>/SKILL.md` with a narrower documented frontmatter set and compatibility dirs | `skills/<skill>/SKILL.md`, optionally bundled through plugins or discovered through `.agents/skills` | `skills/<skill>/SKILL.md` plus compatibility dirs inside host config space | Skills stay the semantic center. Preserve shared metadata and strip or downgrade host-only frontmatter during migration and build. |
| `commands` | native `commands/` markdown command files, with increasing convergence toward skills | native command and slash-command surfaces | no documented plugin-packaged command directory today | native command system through markdown or config definitions | Treat commands as first-class where the host exposes them. For Codex, degrade commands into skills and instruction routing instead of pretending parity exists. |
| `agents` | plugin `agents/` with rich frontmatter and isolation settings, but explicit plugin-agent limits | plugin agents plus Cursor subagents | custom agents in `.codex/agents/*.toml` and subagent workflows | primary agents and subagents with model and permission-first config | Treat agents as specialist execution surfaces. Compile one specialist concept into each host's native agent or subagent format, even when the storage location differs. Do not assume the same knobs survive everywhere. |
| `hooks` | `hooks/hooks.json`, inline plugin hooks, settings hooks, and skill or agent frontmatter hooks | `hooks/hooks.json` plus project and user hook locations | `hooks/hooks.json` in the plugin bundle gated by `[features].plugin_hooks = true`, with `.codex/hooks.json` and `~/.codex/hooks.json` still documented for broader project/user hook config where `[features].hooks` is the general flag and `codex_hooks` is deprecated | JS or TS plugin event handlers | Normalize hook intent and compile per host. Do not assume event names or return contracts are portable 1:1. |
| `permissions` | tool scoping and approval controls live in Claude-specific agent, hook, and runtime surfaces | hook allow or deny decisions, CLI permission config, and subagent tool access | approvals, sandbox policy, hook matchers, and custom-agent config | first-class permission config plus per-agent overrides, keyed by tool name and patterns | Keep `allow` / `ask` / `deny` as the canonical authoring model. When one host lacks a per-skill field, move the policy to its native agent, hook, or runtime control plane. |
| `runtime` | `.mcp.json` or inline MCP config, plus plugin support files | `mcp.json`, host `mcp.json` config, plugin support files, and richer auth surfaces | `.mcp.json` in plugins plus active MCP state in `config.toml`, with optional `.app.json` | config-driven MCP plus JS or TS plugin runtime | Runtime owns MCP, auth, readiness/env wiring, helper code, local runtimes, and passthrough dirs. Compile into bundle-local files when possible and external host config when required. |
| `distribution` | `.claude-plugin/plugin.json`, marketplaces, install scopes, user configuration, reload surface, and adjacent plugin assets like themes/monitors/LSP/output styles | `.cursor-plugin/plugin.json`, marketplace metadata, publish surface, local install path, reload-window flow | `.codex-plugin/plugin.json`, marketplace catalogs, cache install path, interface metadata, restart-after-update flow | npm or local JS plugin distribution plus config-based loading rather than one shared manifest | Distribution owns `userConfig`, brand, legal links, icons, screenshots, install metadata, and publish metadata. Emit rich manifest fields where supported and install shims where they are not. |

## Practical Consequences

This matrix implies a few hard rules for Pluxx:

1. Migration should be semantic, not syntactic.
   Import the source host's intent, not its exact file format.

2. Skills are the stable workflow layer.
   Commands and agents should compile from the same workflow model rather than forking meaning.

3. Permissions are portable intent, not portable syntax.
   A Claude-only field such as `allowed-tools` should become a host-agnostic policy that Pluxx re-expresses for Cursor, Codex, and OpenCode in their native control planes.

4. Codex is not command-parity with Claude, Cursor, or OpenCode today.
   That is a translation problem for Pluxx, not a reason to leak host differences into the authoring model.

5. OpenCode is code-first for plugins.
   Hooks, runtime extensions, and some distribution behavior need real JS or TS generation rather than manifest-only generation.

6. Install and update behavior are part of compatibility truth, not just packaging trivia.
   The host story includes reload behavior, restart requirements, cache semantics, and marketplace or local install paths.

## What Users Should Expect

If you are trying to predict what Pluxx will actually do to your project, use these examples:

### Commands

- Claude Code: preserve native command intent through Claude-native command and skill surfaces
- Cursor: preserve command intent through native slash-command surfaces
- Codex: degrade command intent into skills plus instruction routing because Codex does not document a plugin-packaged custom command directory equivalent
- OpenCode: preserve command intent through native markdown or config-defined commands

### Hooks

- Claude Code: preserve or translate hook intent into plugin hooks, settings hooks, or skill/agent frontmatter hooks
- Cursor: translate hook intent into Cursor hook JSON plus documented Agent and Tab event names
- Codex: translate hook intent into bundled `hooks/hooks.json`, while still documenting `.codex/hooks.json` and `~/.codex/hooks.json` as broader host config surfaces
- OpenCode: translate hook intent into runtime JS or TS plugin handlers

### Runtime And MCP

- Claude Code: preserve MCP intent inside `.mcp.json` or inline plugin config
- Cursor: preserve MCP intent, but compile transport and auth into Cursor's `mcp.json` model
- Codex: preserve MCP bundle intent where possible, but expect active state and install behavior to involve `config.toml`, marketplace catalogs, and bundle caches; current maintained headless probes now also show default project-scoped, user-scoped, and inline-agent MCP config reaching startup plus `tools/list`, with default root MCP auto-cancelling a real `mcp_tool_call` before server `tools/call`, the default inline-agent path falling back to `MCP_PROOF_MARKER_MISSING`, and explicit `approval_mode = "approve"` unlocking real headless `tools/call` for project-root, user-root, agent-local inline, and inherited project-root or user-root delegated MCP paths; Pluxx now compiles the proven root allow-path into `.codex/config.generated.toml` when canonical MCP rules can be materialized
- OpenCode: translate runtime intent into config plus code-first plugin runtime artifacts rather than a manifest-only bundle

### Distribution

- Claude Code: install, update, and reload are part of the product surface, including `/reload-plugins`
- Cursor: install/update tends to resolve through reload-window or restart behavior
- Codex: install/update is marketplace plus bundle based, with `Plugins > Refresh` when available and restart as the safe fallback
- OpenCode: distribution is config/runtime oriented and does not currently present the same marketplace-first install loop as the others

The short rule is:

- preserve when the host has a truthful native surface
- translate when the same intent belongs in a different native surface
- degrade when the host only has a weaker equivalent
- drop only when there is no honest native equivalent at all

## Row-Level Translation Appendix

Use this appendix when the bucket-level matrix is too coarse.

Each cell names the current Pluxx translation contract for that row and the strongest honest native surface we should target.

The current audited prime-time rows are now materially closed in generators and explainability, with stronger proof coverage than before but still-open live runtime gaps called out in the reliability register.

Use the hit list to track future host-drift refreshes and public-proof packaging work rather than assuming the row-level contract is still mostly aspirational.

Use [Core-Four Translation Hit List](./core-four-translation-hit-list.md) to track which rows are already:

- documented only
- encoded in the capability registry
- emitted by generators
- explained by lint/build
- proven by fixtures or release smoke

This is intentionally closure-oriented:

- if a row says `preserve`, the host has a real native surface
- if a row says `translate`, the intent survives but moves to a different native surface
- if a row says `degrade`, the host only gets a weaker equivalent today
- if a row says `drop`, there is no honest native equivalent today

### Skills

| Skill row | Claude Code | Cursor | Codex | OpenCode | User-visible effect |
|---|---|---|---|---|---|
| Shared Agent Skills frontmatter: `name`, `description`, `license`, `compatibility`, `metadata`, `disable-model-invocation` | `preserve -> SKILL.md` frontmatter | `preserve -> SKILL.md` frontmatter | `preserve -> SKILL.md` frontmatter | `preserve -> SKILL.md` frontmatter | The basic skill identity and discovery contract remains portable across the core four. |
| Skill body, supporting files, and bundled scripts | `preserve -> skills/<skill>/` | `preserve -> skills/<skill>/` | `preserve -> skills/<skill>/` | `preserve -> skills/<skill>/` | Workflow instructions stay shared even when discovery and execution differ by host. |
| Claude discovery hints: `when_to_use` | `preserve -> SKILL.md` frontmatter | `degrade -> compatibility metadata kept in SKILL.md; Cursor only documents the shared frontmatter set` | `degrade -> compatibility metadata kept in SKILL.md and can also inform generated command/routing guidance` | `degrade -> compatibility metadata kept in SKILL.md and can also inform generated command/runtime guidance` | Rich Claude auto-invocation hints do not currently become a first-class native discovery surface elsewhere. |
| Claude argument UX: `argument-hint`, `arguments` | `preserve -> SKILL.md` frontmatter | `degrade -> compatibility metadata only` | `degrade -> compatibility metadata only` | `degrade -> compatibility metadata only` | Argument-aware autocomplete and named argument UX is Claude-first today. |
| Claude visibility control: `user-invocable` | `preserve -> SKILL.md` frontmatter | `degrade -> compatibility metadata only` | `degrade -> compatibility metadata only` | `degrade -> compatibility metadata only` | Menu visibility is currently strongest in Claude; other hosts should not be assumed to honor the same field directly even when Pluxx preserves the hint for round-tripping. |
| Tool/model tuning inside a skill: `allowed-tools`, `model`, `effort` | `preserve -> SKILL.md` frontmatter | `translate -> move intent to permissions, hooks, or subagent surfaces; raw field itself is not Cursor-native` | `translate -> move intent to permissions companion, approvals, sandboxing, or `.codex/agents/*.toml`; raw field itself is not Codex-native` | `translate -> move intent to permission maps or agent/config surfaces; raw field itself is not OpenCode-native` | The intent survives best when Pluxx promotes it out of the skill file into the host's real control plane. |
| Delegation from a skill: `context`, `agent` | `preserve -> SKILL.md` frontmatter | `translate -> agents/subagents` | `translate -> custom agents and subagent workflows` | `translate -> agents/config-driven specialists` | Delegated workflow intent is portable, but it usually belongs in the host's native agent system rather than raw skill frontmatter. |
| Skill-scoped hook intent: `hooks` | `preserve -> skill frontmatter hooks` | `degrade -> move to hooks/hooks.json; skill-local hook scoping is lost` | `degrade -> move to bundled hooks/hooks.json; skill-local hook scoping is lost` | `translate -> runtime event handlers in plugin code; skill-local scoping becomes runtime logic` | Hook behavior can survive, but not always at the same attachment point. |
| Path/shell activation hints: `paths`, `shell` | `preserve -> SKILL.md` frontmatter | `degrade -> compatibility metadata only` | `degrade -> compatibility metadata only` | `degrade -> compatibility metadata only` | Path-conditioned activation and shell selection are currently Claude-first in the shared skill format. |

### Commands

| Command row | Claude Code | Cursor | Codex | OpenCode | User-visible effect |
|---|---|---|---|---|---|
| Canonical command markdown entry | `preserve -> commands/*.md` | `preserve -> commands/*` slash-command surface | `degrade -> .codex/commands.generated.json plus AGENTS.md routing guidance` | `preserve -> commands/*.md or config command definitions` | The workflow remains invocable everywhere, but Codex does not currently get a true plugin-native slash command. |
| Command description and discovery text | `preserve -> command metadata` | `preserve -> slash-command listing` | `degrade -> description becomes AGENTS.md routing text plus .codex/commands.generated.json companion metadata` | `preserve -> command/config listing` | Codex users can still find the workflow, but through guidance and companion metadata rather than a native command palette. |
| Command arguments and templates | `preserve -> native command template` | `preserve -> slash-command template` | `degrade -> route the same request through the matching skill or instruction flow, with argument hints/examples/context mirrored in AGENTS.md and .codex/commands.generated.json` | `preserve -> markdown/config command template` | Exact invocation UX varies, but the underlying workflow should stay consistent. |

### Agents

| Agent row | Claude Code | Cursor | Codex | OpenCode | User-visible effect |
|---|---|---|---|---|---|
| Specialist prompt/body | `preserve -> agents/*.md` | `translate -> agents/*.md with Cursor-native framing` | `translate -> .codex/agents/*.toml developer_instructions` | `preserve -> agents/*.md or config agent definitions` | Specialist behavior survives, but the storage format differs substantially. |
| Agent identity: `name`, `description` | `preserve -> frontmatter` | `preserve -> frontmatter` | `translate -> TOML fields` | `preserve -> config definition fields` | Agent names and descriptions remain visible across all four. |
| Model and execution tuning: `model`, `model_reasoning_effort`, `sandbox_mode` | `preserve -> frontmatter` | `translate -> only a subset currently lands natively` | `translate -> TOML fields where Codex documents them` | `translate -> model lands natively; some tuning remains host-specific` | Tuning fields generate cleanly, but runtime trust is not uniform: current live Codex headless and trusted interactive probes still let a child agent declared as `sandbox_mode = "read-only"` write to the workspace, and the current headless suite also showed Codex custom-agent `skills.config` semantics behaving unevenly. |
| Delegation posture: `mode`, `hidden`, nested permission/tool policy | `preserve -> frontmatter` | `degrade -> turned into translation notes and subagent-oriented framing` | `degrade -> turned into TOML plus generated delegation notes` | `preserve/translate -> config-native agent fields such as mode, hidden, permission; legacy tools only as backwards-compat input` | Subagent intent survives semantically, but not every host exposes the same knobs directly. Cursor is also more dynamic here than older Pluxx docs implied because child subagents are real. |

### Hooks

| Hook row | Claude Code | Cursor | Codex | OpenCode | User-visible effect |
|---|---|---|---|---|---|
| Command-based lifecycle hooks on common events | `preserve -> hooks/hooks.json, manifest hooks, settings hooks, frontmatter hooks` | `preserve -> hooks/hooks.json plus project/user hook files` | `translate -> bundled hooks/hooks.json plus .codex/hooks.generated.json companion guidance` | `translate -> JS/TS runtime event handlers` | Hook automation is real across the four. Codex now bundles the translated hook contract in the official nested matcher-group shape and documents `[features].plugin_hooks = true` for plugin-bundled activation, but maintained May 13, 2026 probes still timed out without a project-local hook signal under the general hook flag or deprecated alias, so live activation remains an open runtime gap rather than a bundle-shape gap. |
| Prompt-based hooks | `preserve -> Claude-supported lifecycle events keep prompt hooks in hooks/hooks.json` | `preserve -> hooks/hooks.json prompt entries` | `drop -> current generator does not emit prompt hooks` | `drop -> current runtime wrapper only emits command hooks today` | Prompt-driven hook automation is partially portable today: Claude and Cursor preserve it, Codex and OpenCode still do not. |
| Hook `matcher` field | `preserve -> hook entries` | `preserve -> hook entries` | `translate -> matcher survives on documented Codex matcher-capable events in bundled hook groups and .codex/hooks.generated.json` | `translate -> matcher survives in runtime hook definitions` | Matching logic is portable enough to keep, even when the storage layer changes. |
| Hook `failClosed` | `degrade -> current Claude-family generator drops it` | `preserve -> hook entries` | `drop -> not carried into Codex hook output` | `translate -> runtime hook definitions` | Strict failure behavior is not yet consistent across hosts. |
| Hook `loop_limit` | `degrade -> dropped today` | `preserve -> supported on documented Cursor events` | `drop -> not carried into Codex hook output` | `drop -> not carried into OpenCode runtime output` | Recursive hook protection is currently Cursor-first in Pluxx. |
| Event fidelity | `preserve -> richest event spread of the four` | `preserve -> documented Cursor Agent and Tab hook events` | `degrade -> only the supported Codex event subset is emitted` | `translate -> canonical events mapped into runtime event names` | Hook intent is portable, but event names and supported event counts are not. |

### Permissions

| Permission row | Claude Code | Cursor | Codex | OpenCode | User-visible effect |
|---|---|---|---|---|---|
| Canonical `allow` / `ask` / `deny` DSL | `translate -> runtime approvals, hook decisions, and agent surfaces` | `translate -> generated permission hook plus CLI/subagent control planes` | `translate -> approvals, sandbox policy, hook matchers, custom agents, .codex/permissions.generated.json, and the live-proven MCP allow-path in .codex/config.generated.toml` | `preserve -> config-native permission map plus per-agent overrides` | The user-facing permission story stays coherent, but only OpenCode has a closer direct config analog today. |
| Tool-family rules: `Bash(...)`, `Edit(...)`, `Read(...)`, `MCP(...)` | `translate -> permission hook/runtime enforcement` | `translate -> generated permission hook script` | `translate -> companion file plus external runtime/admin enforcement` | `preserve/translate -> native permission keys for read/edit/bash plus best-effort MCP tool-name patterns` | The core permission DSL is useful across all four even though the enforcement layer differs. |
| Skill-scoped rules: `Skill(...)` and migrated Claude `allowed-tools` intent | `translate -> keep the idea in skill/agent/runtime controls` | `translate -> permission hook can still reason about skill invocations` | `translate -> compiler-intent skillPolicies in .codex/permissions.generated.json` | `preserve -> native skill permission key` | Skill-specific permission nuance is still weakest in Cursor, not OpenCode. |

### Runtime

| Runtime row | Claude Code | Cursor | Codex | OpenCode | User-visible effect |
|---|---|---|---|---|---|
| Local `stdio` MCP server | `preserve -> .mcp.json` | `preserve -> mcp.json` | `preserve -> .mcp.json` | `translate -> plugin runtime builds local MCP config in code` | Local MCP servers work everywhere, but OpenCode materializes them through runtime code rather than a bundle-local JSON file. |
| Remote MCP transport | `preserve -> .mcp.json with http/sse` | `preserve -> mcp.json with stdio/sse/streamable-http` | `preserve -> .mcp.json with stdio/streamable-http` | `translate -> opencode.json/config mcp using local/remote semantics` | The same remote server may need a different transport spelling or config shape per host. |
| Bearer token auth | `preserve -> inline env-backed headers or platform-managed auth` | `preserve -> inline headers or platform-managed auth` | `translate -> bearer_token_env_var when Codex can express it` | `translate -> runtime builds Authorization header from env/user config` | Bearer-token MCP auth is a strong portable case today. |
| Custom header auth | `preserve -> inline headers` | `preserve -> inline headers` | `translate/degrade -> env_http_headers or static http_headers when Codex can express them exactly; otherwise warn and omit` | `translate -> runtime header materialization` | Custom headers are portable, but Codex cannot express every templated variant exactly. |
| Platform-managed OAuth/auth | `preserve -> platform-managed auth when configured` | `preserve -> platform-managed auth when configured` | `degrade -> external host config/runtime still required` | `degrade -> external host config/runtime still required` | OAuth-ready plugins are Claude/Cursor-first in current Pluxx outputs. |
| Runtime readiness dependency, session-start refresh, and gate polling | `translate -> generated SessionStart / PreToolUse / UserPromptSubmit hooks plus helper runtime script` | `translate -> generated sessionStart / beforeMCPExecution / beforeSubmitPrompt hooks plus helper runtime script` | `translate -> bundled hooks/hooks.json plus .codex/readiness.generated.json and .codex/hooks.generated.json companions` | `translate -> runtime/pluxx-readiness.mjs plus event-handler calls from plugin code` | Runtime readiness is operational intent, not manual per-host hook glue. Codex now bundles the translated hook path, though named skill/command scoping still degrades to prompt-entry gating with best-effort matching and live activation still depends on a feature flag plus trust and runtime-path differences. |
| Helper scripts, assets, passthrough runtime dirs | `preserve -> scripts/, assets/, passthrough` | `preserve -> scripts/, assets/, passthrough` | `preserve -> scripts/, assets/, passthrough` | `preserve -> scripts/, assets/, passthrough plus runtime wrapper` | Shared support files remain portable even when the runtime host is code-first. |

### Distribution

| Distribution row | Claude Code | Cursor | Codex | OpenCode | User-visible effect |
|---|---|---|---|---|---|
| Plugin entry and package identity | `translate -> optional .claude-plugin/plugin.json plus marketplace install` | `preserve -> required .cursor-plugin/plugin.json` | `preserve -> required .codex-plugin/plugin.json` | `translate -> package.json plus JS/TS plugin entrypoint and config loading` | Plugin identity exists everywhere, but OpenCode is runtime/package-first and Claude can auto-discover more without a required manifest. Claude also has adjacent plugin-owned assets that do not fit one narrow manifest-only mental model. |
| Brand/listing metadata | `drop -> no shared manifest-backed brand contract today` | `translate -> homepage/logo only` | `preserve -> rich interface block` | `drop -> no shared manifest-backed brand contract today` | Rich listing polish is Codex-first today. Use [Core-Four Branding Metadata Audit](./core-four-branding-metadata-audit.md) for the row-level brand field map. |
| Install, update, and reload surface | `preserve -> marketplace/local install plus /reload-plugins` | `preserve -> local install plus reload-window/restart` | `preserve -> bundle install plus marketplace catalog and refresh/restart behavior` | `translate -> local dir/config install plus reload/restart` | Distribution truth includes lifecycle behavior, not just which files get emitted. |
| Marketplace and catalog registration | `preserve -> plugin marketplace support` | `preserve -> marketplace metadata and local marketplace path` | `preserve -> repo/home marketplace catalogs` | `degrade -> config/package distribution rather than a marketplace-first flow` | Discovery and updates are not one universal runtime pattern across the four. |
| `userConfig` and secret setup | `translate -> install/runtime config, env materialization, and wrapped hook commands` | `translate -> install/runtime config, env materialization, and wrapped hook commands` | `translate -> install/runtime config, env materialization, companion files, and wrapped hook commands` | `translate -> .pluxx-user.json consumed by runtime wrapper and hook subprocess env injection` | Users should enter secrets once during install instead of editing generated bundles by hand, and plugin-owned hook commands should see the same installed secret material as the runtime. |

## Official Docs Basis

### Claude Code

- [Extend Claude Code](https://code.claude.com/docs/en/features-overview)
- [Create plugins](https://code.claude.com/docs/en/plugins)
- [Plugins reference](https://code.claude.com/docs/en/plugins-reference)
- [Hooks](https://code.claude.com/docs/en/hooks)
- [Settings](https://code.claude.com/docs/en/settings)
- [Permissions](https://code.claude.com/docs/en/permissions)
- [Create custom subagents](https://code.claude.com/docs/en/sub-agents)
- [How Claude Code works](https://code.claude.com/docs/en/how-claude-code-works)

### Cursor

- [Plugins](https://cursor.com/docs/plugins)
- [Agent Skills](https://cursor.com/docs/skills)
- [Subagents](https://cursor.com/docs/subagents)
- [Hooks](https://cursor.com/docs/hooks)
- [Rules](https://cursor.com/docs/rules)
- [MCP](https://cursor.com/docs/mcp)
- [Slash commands](https://cursor.com/docs/cli/reference/slash-commands)
- [Authentication](https://cursor.com/docs/cli/reference/authentication)
- [Permissions](https://cursor.com/docs/cli/reference/permissions)

### Codex

- [Plugins](https://developers.openai.com/codex/plugins)
- [Build plugins](https://developers.openai.com/codex/plugins/build)
- [Agent Skills](https://developers.openai.com/codex/skills)
- [Subagents](https://developers.openai.com/codex/subagents)
- [Hooks](https://developers.openai.com/codex/hooks)
- [Model Context Protocol](https://developers.openai.com/codex/mcp)
- [Basic config](https://developers.openai.com/codex/config-basic)
- [Agent approvals and security](https://developers.openai.com/codex/agent-approvals-security)
- [Custom instructions with AGENTS.md](https://developers.openai.com/codex/guides/agents-md)
- [Advanced config](https://developers.openai.com/codex/config-advanced)

### OpenCode

- [SDK](https://opencode.ai/docs/sdk/)
- [Server](https://opencode.ai/docs/server/)
- [Config](https://opencode.ai/docs/config/)
- [Plugins](https://opencode.ai/docs/plugins/)
- [Skills](https://opencode.ai/docs/skills/)
- [Commands](https://opencode.ai/docs/commands/)
- [Agents](https://opencode.ai/docs/agents/)
- [MCP servers](https://opencode.ai/docs/mcp-servers/)
- [Permissions](https://opencode.ai/docs/permissions/)
- [Rules](https://opencode.ai/docs/rules/)

## Related Docs

- [Portable Delegation Model](./portable-delegation-model.md)
- [Core-Four Provider Docs Audit](./core-four-provider-docs-audit.md)
