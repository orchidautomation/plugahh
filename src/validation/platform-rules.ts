import type { PluxxCompilerBucket, TargetPlatform } from '../schema'
import { getRuntimeReadinessExternalConfigNote } from '../runtime-readiness-registry'

type RuleLevel = 'required' | 'supported' | 'fallback' | 'optional' | 'unknown'

export interface PlatformRuleSource {
  label: string
  url: string
}

export type PlatformLimitKind = 'hard' | 'advisory' | 'display'

export interface PlatformLimitPolicy {
  kind: PlatformLimitKind
  notes?: string
}

export interface PlatformLimits {
  skillDescriptionMax: number | null
  skillDescriptionDisplayMax: number | null
  skillListingBudgetMax: number | null
  skillNameMax: number
  skillNameMustMatchDir: boolean
  manifestPromptMax: number | null
  manifestPromptCountMax: number | null
  manifestPathPrefix: string | null
  instructionsMaxBytes: number | null
  hooksFeatureFlag: string | null
  rulesMaxLines: number | null
}

export interface PlatformLimitPolicies {
  skillDescriptionMax: PlatformLimitPolicy | null
  skillDescriptionDisplayMax: PlatformLimitPolicy | null
  skillListingBudgetMax: PlatformLimitPolicy | null
  skillNameMax: PlatformLimitPolicy
  skillNameMustMatchDir: PlatformLimitPolicy
  manifestPromptMax: PlatformLimitPolicy | null
  manifestPromptCountMax: PlatformLimitPolicy | null
  manifestPathPrefix: PlatformLimitPolicy | null
  instructionsMaxBytes: PlatformLimitPolicy | null
  hooksFeatureFlag: PlatformLimitPolicy | null
  rulesMaxLines: PlatformLimitPolicy | null
}

export interface PlatformRules {
  platform: TargetPlatform
  summary: string
  limits: PlatformLimits
  limitPolicies: PlatformLimitPolicies
  skillDiscoveryDirs: {
    path: string
    level: RuleLevel
    notes?: string
  }[]
  frontmatter: {
    standard: string[]
    additional: string[]
    notes?: string
  }
  manifest: {
    files: string[]
    required: boolean
    notes?: string
  }
  mcp: {
    files: string[]
    rootKey?: string
    transports: string[]
    auth: string[]
    notes?: string
  }
  hooks: {
    supported: boolean
    files: string[]
    eventNames: string[]
    notes?: string
  }
  instructions: {
    files: string[]
    format: string
    notes?: string
  }
  sources: PlatformRuleSource[]
}

export type PrimitiveTranslationMode = 'preserve' | 'translate' | 'degrade' | 'drop'

export type CoreFourPlatform = Extract<TargetPlatform, 'claude-code' | 'cursor' | 'codex' | 'opencode'>

export interface PlatformPrimitiveCapability {
  mode: PrimitiveTranslationMode
  nativeSurfaces: string[]
  notes?: string
}

export interface CoreFourPrimitiveCapabilities {
  platform: CoreFourPlatform
  buckets: Record<PluxxCompilerBucket, PlatformPrimitiveCapability>
  sources: PlatformRuleSource[]
}

const STANDARD_SKILL_FRONTMATTER = [
  'name',
  'description',
  'license',
  'compatibility',
  'metadata',
  'disable-model-invocation',
] as const

const NULL_LIMITS: PlatformLimits = {
  skillDescriptionMax: null,
  skillDescriptionDisplayMax: null,
  skillListingBudgetMax: null,
  skillNameMax: 64,
  skillNameMustMatchDir: false,
  manifestPromptMax: null,
  manifestPromptCountMax: null,
  manifestPathPrefix: null,
  instructionsMaxBytes: null,
  hooksFeatureFlag: null,
  rulesMaxLines: null,
}

const NULL_LIMIT_POLICIES: PlatformLimitPolicies = {
  skillDescriptionMax: null,
  skillDescriptionDisplayMax: null,
  skillListingBudgetMax: null,
  skillNameMax: { kind: 'hard' },
  skillNameMustMatchDir: { kind: 'hard' },
  manifestPromptMax: null,
  manifestPromptCountMax: null,
  manifestPathPrefix: null,
  instructionsMaxBytes: null,
  hooksFeatureFlag: null,
  rulesMaxLines: null,
}

export const PLATFORM_LIMITS: Record<TargetPlatform, PlatformLimits> = {
  'claude-code': {
    ...NULL_LIMITS,
    skillDescriptionMax: 1536,
    skillDescriptionDisplayMax: 250,
    skillListingBudgetMax: 8000,
  },
  'codex': {
    ...NULL_LIMITS,
    skillDescriptionMax: 1024,
    skillNameMustMatchDir: true,
    manifestPromptMax: 128,
    manifestPromptCountMax: 3,
    manifestPathPrefix: './',
    instructionsMaxBytes: 32768,
    hooksFeatureFlag: 'hooks',
  },
  'cursor': {
    ...NULL_LIMITS,
    skillNameMustMatchDir: true,
    rulesMaxLines: 500,
  },
  'opencode': {
    ...NULL_LIMITS,
    skillDescriptionMax: 1024,
    skillNameMustMatchDir: true,
  },
  'github-copilot': {
    ...NULL_LIMITS,
    skillDescriptionDisplayMax: 250,
  },
  'openhands': {
    ...NULL_LIMITS,
  },
  'warp': {
    ...NULL_LIMITS,
  },
  'gemini-cli': {
    ...NULL_LIMITS,
    skillNameMustMatchDir: true,
  },
  'roo-code': {
    ...NULL_LIMITS,
  },
  'cline': {
    ...NULL_LIMITS,
    skillDescriptionMax: 1024,
    skillNameMustMatchDir: true,
  },
  'amp': {
    ...NULL_LIMITS,
  },
}

export const PLATFORM_LIMIT_POLICIES: Record<TargetPlatform, PlatformLimitPolicies> = {
  'claude-code': {
    ...NULL_LIMIT_POLICIES,
    skillDescriptionMax: {
      kind: 'hard',
      notes: 'Claude skills listing caps description + when_to_use combined at 1,536 characters.',
    },
    skillDescriptionDisplayMax: {
      kind: 'display',
      notes: 'Claude surfaces commonly truncate long listing text around 250 characters.',
    },
    skillListingBudgetMax: {
      kind: 'advisory',
      notes: 'Pluxx warns at 8,000 aggregate characters to keep Claude listings readable and avoid crowded discovery surfaces.',
    },
  },
  'codex': {
    ...NULL_LIMIT_POLICIES,
    skillDescriptionMax: {
      kind: 'advisory',
      notes: 'Pluxx keeps Codex descriptions concise at 1,024 characters as a conservative compatibility heuristic; the current docs do not state this as an official hard cap.',
    },
    skillNameMustMatchDir: {
      kind: 'advisory',
      notes: 'Pluxx keeps Codex skill directory names aligned with skill names for portability and predictability, but the current docs do not state this as a formal hard requirement.',
    },
    manifestPromptMax: {
      kind: 'advisory',
      notes: 'Pluxx keeps Codex default prompts short at 128 characters as a conservative listing heuristic; the current docs do not publish this as a hard limit.',
    },
    manifestPromptCountMax: {
      kind: 'advisory',
      notes: 'Pluxx keeps Codex default prompt count to three as a conservative listing heuristic; the current docs do not publish this as a hard limit.',
    },
    manifestPathPrefix: { kind: 'hard' },
    instructionsMaxBytes: {
      kind: 'hard',
      notes: 'Codex AGENTS.md/project docs truncate at 32 KiB.',
    },
    hooksFeatureFlag: {
      kind: 'hard',
      notes: 'Hook support depends on the Codex hooks feature flag/runtime support.',
    },
  },
  'cursor': {
    ...NULL_LIMIT_POLICIES,
    skillNameMustMatchDir: { kind: 'hard' },
    rulesMaxLines: {
      kind: 'advisory',
      notes: 'Cursor docs treat 500 lines as practical guidance rather than a documented hard cap.',
    },
  },
  'opencode': {
    ...NULL_LIMIT_POLICIES,
    skillDescriptionMax: { kind: 'hard' },
    skillNameMustMatchDir: { kind: 'hard' },
  },
  'github-copilot': {
    ...NULL_LIMIT_POLICIES,
    skillDescriptionDisplayMax: { kind: 'display' },
  },
  'openhands': {
    ...NULL_LIMIT_POLICIES,
  },
  'warp': {
    ...NULL_LIMIT_POLICIES,
  },
  'gemini-cli': {
    ...NULL_LIMIT_POLICIES,
    skillNameMustMatchDir: { kind: 'hard' },
  },
  'roo-code': {
    ...NULL_LIMIT_POLICIES,
  },
  'cline': {
    ...NULL_LIMIT_POLICIES,
    skillDescriptionMax: { kind: 'hard' },
    skillNameMustMatchDir: { kind: 'hard' },
  },
  'amp': {
    ...NULL_LIMIT_POLICIES,
  },
}

type ResearchTarget = Extract<
  TargetPlatform,
  | 'claude-code'
  | 'cursor'
  | 'codex'
  | 'opencode'
  | 'openhands'
  | 'warp'
  | 'gemini-cli'
  | 'roo-code'
  | 'cline'
  | 'amp'
>

export const PLATFORM_VALIDATION_RULES: Record<ResearchTarget, PlatformRules> = {
  'claude-code': {
    platform: 'claude-code',
    summary: 'Claude Code plugins use an optional manifest at .claude-plugin/plugin.json with auto-discovery for skills, commands, agents, hooks, MCP, marketplaces, output styles, and adjacent plugin assets like LSP, monitors, and themes.',
    limits: PLATFORM_LIMITS['claude-code'],
    limitPolicies: PLATFORM_LIMIT_POLICIES['claude-code'],
    skillDiscoveryDirs: [
      { path: 'skills/', level: 'supported' },
    ],
    frontmatter: {
      standard: [...STANDARD_SKILL_FRONTMATTER],
      additional: [
        'when_to_use',
        'argument-hint',
        'arguments',
        'user-invocable',
        'allowed-tools',
        'model',
        'effort',
        'context',
        'agent',
        'hooks',
        'paths',
        'shell',
      ],
      notes: 'Claude exposes the richest documented skill frontmatter of the core four.',
    },
    manifest: {
      files: ['.claude-plugin/plugin.json'],
      required: false,
      notes: 'The manifest is optional; if present, name is the only required field.',
    },
    mcp: {
      files: ['.mcp.json', '~/.claude.json', 'managed-mcp.json', '.claude-plugin/plugin.json'],
      rootKey: 'mcpServers',
      transports: ['stdio', 'http', 'sse'],
      auth: ['headers', 'env interpolation', 'OAuth 2.0', 'bearer tokens', 'dynamic headers'],
      notes: 'Claude Code project-scoped MCP lives in .mcp.json, while local and user scopes live in ~/.claude.json; managed deployments can also pin managed-mcp.json. Current docs explicitly warn that settings.json does not read mcpServers.',
    },
    hooks: {
      supported: true,
      files: ['hooks/hooks.json', '.claude-plugin/plugin.json', 'managed settings', '~/.claude/settings.json', '.claude/settings.json', '.claude/settings.local.json'],
      eventNames: ['SessionStart', 'Setup', 'UserPromptSubmit', 'UserPromptExpansion', 'PreToolUse', 'PermissionRequest', 'PermissionDenied', 'PostToolUse', 'PostToolUseFailure', 'PostToolBatch', 'Notification', 'SubagentStart', 'SubagentStop', 'TaskCreated', 'TaskCompleted', 'Stop', 'StopFailure', 'TeammateIdle', 'InstructionsLoaded', 'ConfigChange', 'CwdChanged', 'FileChanged', 'WorktreeCreate', 'WorktreeRemove', 'PreCompact', 'PostCompact', 'Elicitation', 'ElicitationResult', 'SessionEnd'],
      notes: 'Hook configs can be stored in hooks/hooks.json, inlined in plugin.json, added in user/project/local settings files, or controlled by managed policy settings; Claude also documents a broader lifecycle event set than the older simplified Pluxx model.',
    },
    instructions: {
      files: ['CLAUDE.md'],
      format: 'markdown',
      notes: 'Claude keeps persistent instructions in CLAUDE.md and pushes longer procedures into skills. Related enforcement and distribution config also depends on managed, user, project, and local settings scopes.',
    },
    sources: [
      { label: 'Claude Code MCP docs', url: 'https://code.claude.com/docs/en/mcp' },
      { label: 'Claude Code plugin marketplaces docs', url: 'https://code.claude.com/docs/en/plugin-marketplaces' },
      { label: 'Claude Code plugin dependencies docs', url: 'https://code.claude.com/docs/en/plugin-dependencies' },
      { label: 'Claude Code features overview', url: 'https://code.claude.com/docs/en/features-overview' },
      { label: 'Claude Code best practices', url: 'https://code.claude.com/docs/en/best-practices' },
      { label: 'Claude Code CLI reference', url: 'https://code.claude.com/docs/en/cli-reference' },
      { label: 'Claude Code discover plugins docs', url: 'https://code.claude.com/docs/en/discover-plugins' },
      { label: 'Claude Code plugins docs', url: 'https://code.claude.com/docs/en/plugins' },
      { label: 'Claude Code plugins reference', url: 'https://code.claude.com/docs/en/plugins-reference' },
      { label: 'Claude Code hooks guide', url: 'https://code.claude.com/docs/en/hooks-guide' },
      { label: 'Claude Code hooks docs', url: 'https://code.claude.com/docs/en/hooks' },
      { label: 'Claude Code settings docs', url: 'https://code.claude.com/docs/en/settings' },
      { label: 'Claude Code permissions docs', url: 'https://code.claude.com/docs/en/permissions' },
      { label: 'Claude Code memory docs', url: 'https://code.claude.com/docs/en/memory' },
      { label: 'Claude Code skills docs', url: 'https://code.claude.com/docs/en/skills' },
      { label: 'Claude Code sub-agents docs', url: 'https://code.claude.com/docs/en/sub-agents' },
      { label: 'Claude Code env vars docs', url: 'https://code.claude.com/docs/en/env-vars' },
    ],
  },
  'cursor': {
    platform: 'cursor',
    summary: 'Cursor plugins use .cursor-plugin/plugin.json plus native rules, skills, hooks, MCP, marketplace metadata, and subagent surfaces, with additional project and user config outside the plugin bundle.',
    limits: PLATFORM_LIMITS['cursor'],
    limitPolicies: PLATFORM_LIMIT_POLICIES['cursor'],
    skillDiscoveryDirs: [
      { path: 'skills/', level: 'supported' },
      { path: '.cursor/skills/', level: 'supported' },
      { path: '~/.cursor/skills/', level: 'supported' },
      { path: '.agents/skills/', level: 'supported' },
      { path: '~/.agents/skills/', level: 'supported' },
      { path: '.claude/skills/', level: 'supported', notes: 'Compatibility directory' },
      { path: '.codex/skills/', level: 'supported', notes: 'Compatibility directory' },
    ],
    frontmatter: {
      standard: [...STANDARD_SKILL_FRONTMATTER],
      additional: [],
      notes: 'Cursor skills document the shared frontmatter set plus compatibility metadata and supporting-file patterns.',
    },
    manifest: {
      files: ['.cursor-plugin/plugin.json'],
      required: true,
      notes: 'Cursor documents plugin.json as the required plugin manifest.',
    },
    mcp: {
      files: ['mcp.json', '.cursor/mcp.json', '~/.cursor/mcp.json'],
      rootKey: 'mcpServers',
      transports: ['stdio', 'sse', 'streamable-http'],
      auth: ['headers', 'env interpolation', 'OAuth', 'static OAuth credentials'],
    },
    hooks: {
      supported: true,
      files: ['hooks/hooks.json', '.cursor/hooks.json', '~/.cursor/hooks.json'],
      eventNames: ['sessionStart', 'sessionEnd', 'preToolUse', 'postToolUse', 'postToolUseFailure', 'subagentStart', 'subagentStop', 'beforeShellExecution', 'afterShellExecution', 'beforeMCPExecution', 'afterMCPExecution', 'beforeReadFile', 'afterFileEdit', 'beforeSubmitPrompt', 'preCompact', 'stop', 'afterAgentResponse', 'afterAgentThought', 'beforeTabFileRead', 'afterTabFileEdit'],
      notes: 'Cursor plugin hooks live under hooks/hooks.json; project and user hooks also exist separately and reload on save. The official event surface spans both Agent and Tab flows.',
    },
    instructions: {
      files: ['rules/', 'AGENTS.md'],
      format: 'mdc + markdown',
      notes: 'rules/ is the plugin-native instruction surface. AGENTS.md remains useful as shared repo guidance. Cursor subagents use markdown files under .cursor/agents or ~/.cursor/agents (with .claude/.codex compatibility paths). Cursor rules do not apply to Tab.',
    },
    sources: [
      { label: 'Cursor plugins overview', url: 'https://cursor.com/docs/plugins' },
      { label: 'Cursor hooks docs', url: 'https://cursor.com/docs/hooks' },
      { label: 'Cursor skills docs', url: 'https://cursor.com/docs/skills' },
      { label: 'Cursor rules docs', url: 'https://cursor.com/docs/rules' },
      { label: 'Cursor MCP docs', url: 'https://cursor.com/docs/mcp' },
      { label: 'Cursor CLI headless docs', url: 'https://cursor.com/docs/cli/headless' },
      { label: 'Cursor CLI slash commands', url: 'https://cursor.com/docs/cli/reference/slash-commands' },
      { label: 'Cursor CLI parameters', url: 'https://cursor.com/docs/cli/reference/parameters' },
      { label: 'Cursor CLI authentication', url: 'https://cursor.com/docs/cli/reference/authentication' },
      { label: 'Cursor CLI permissions', url: 'https://cursor.com/docs/cli/reference/permissions' },
      { label: 'Cursor CLI configuration', url: 'https://cursor.com/docs/cli/reference/configuration' },
      { label: 'Cursor ACP docs', url: 'https://cursor.com/docs/cli/acp' },
      { label: 'Cursor subagents docs', url: 'https://cursor.com/docs/subagents' },
    ],
  },
  'codex': {
    platform: 'codex',
    summary: 'Codex plugins use .codex-plugin/plugin.json with skills, optional .mcp.json and .app.json, marketplace catalogs, cache installs, AGENTS.md instructions, and native bundled hook support plus broader project or user hook config.',
    limits: PLATFORM_LIMITS['codex'],
    limitPolicies: PLATFORM_LIMIT_POLICIES['codex'],
    skillDiscoveryDirs: [
      { path: 'skills/', level: 'supported' },
      { path: '$CWD/.agents/skills/', level: 'supported' },
      { path: 'ancestor .agents/skills/', level: 'supported', notes: 'Walks upward until repo root' },
      { path: '$HOME/.agents/skills/', level: 'supported' },
      { path: '/etc/codex/skills/', level: 'supported' },
    ],
    frontmatter: {
      standard: [...STANDARD_SKILL_FRONTMATTER],
      additional: [],
    },
    manifest: {
      files: ['.codex-plugin/plugin.json'],
      required: true,
      notes: 'The build plugins guide documents plugin.json, skills/, .mcp.json, .app.json, and assets/ as the standard plugin structure.',
    },
    mcp: {
      files: ['.mcp.json', '.codex/config.toml'],
      rootKey: 'mcpServers',
      transports: ['stdio', 'streamable-http'],
      auth: ['bearer token', 'OAuth', 'header env vars'],
      notes: 'The current build guide documents mcpServers as a path to .mcp.json in the plugin bundle, while active MCP state also lives in config.toml.',
    },
    hooks: {
      supported: true,
      files: ['hooks/hooks.json', '.codex/hooks.json', '~/.codex/hooks.json'],
      eventNames: ['SessionStart', 'PreToolUse', 'PermissionRequest', 'PostToolUse', 'UserPromptSubmit', 'Stop'],
      notes: 'Codex documents both project or user hook config and plugin-bundled hooks. Plugin-bundled hooks live at `hooks/hooks.json` in the plugin and require `[features].plugin_hooks = true`; the general `[features].hooks = true` flag covers non-plugin hook config and defaults on. `codex_hooks` is deprecated and should not be treated as a plugin-bundled hook fallback.',
    },
    instructions: {
      files: ['AGENTS.md', 'AGENTS.override.md'],
      format: 'markdown',
      notes: 'Codex also supports model instruction overrides plus configurable fallback filenames for project docs.',
    },
    sources: [
      { label: 'Codex plugins docs', url: 'https://developers.openai.com/codex/plugins' },
      { label: 'Codex build plugins docs', url: 'https://developers.openai.com/codex/plugins/build' },
      { label: 'Codex CLI features docs', url: 'https://developers.openai.com/codex/cli/features' },
      { label: 'Codex CLI reference docs', url: 'https://developers.openai.com/codex/cli/reference' },
      { label: 'Codex slash commands docs', url: 'https://developers.openai.com/codex/cli/slash-commands' },
      { label: 'Codex advanced config docs', url: 'https://developers.openai.com/codex/config-advanced' },
      { label: 'Codex rules docs', url: 'https://developers.openai.com/codex/rules' },
      { label: 'Codex hooks docs', url: 'https://developers.openai.com/codex/hooks' },
      { label: 'Codex skills docs', url: 'https://developers.openai.com/codex/skills' },
      { label: 'Codex MCP docs', url: 'https://developers.openai.com/codex/mcp' },
      { label: 'Codex basic config docs', url: 'https://developers.openai.com/codex/config-basic' },
      { label: 'Codex agent approvals and security docs', url: 'https://developers.openai.com/codex/agent-approvals-security' },
      { label: 'Codex app commands docs', url: 'https://developers.openai.com/codex/app/commands' },
      { label: 'Codex AGENTS.md guide', url: 'https://developers.openai.com/codex/guides/agents-md' },
      { label: 'Codex subagents docs', url: 'https://developers.openai.com/codex/subagents' },
      { label: 'Codex subagents concept docs', url: 'https://developers.openai.com/codex/concepts/subagents' },
      { label: 'Codex noninteractive docs', url: 'https://developers.openai.com/codex/noninteractive' },
      { label: 'Codex SDK docs', url: 'https://developers.openai.com/codex/sdk' },
      { label: 'Codex agents SDK guide', url: 'https://developers.openai.com/codex/guides/agents-sdk' },
    ],
  },
  'opencode': {
    platform: 'opencode',
    summary: 'OpenCode plugins are code-first JS or TS modules loaded from local plugin dirs or npm references in config, with native skills, commands, agents, MCP, permission, custom-tool, and plugin-event surfaces.',
    limits: PLATFORM_LIMITS['opencode'],
    limitPolicies: PLATFORM_LIMIT_POLICIES['opencode'],
    skillDiscoveryDirs: [
      { path: 'skills/', level: 'supported' },
      { path: '.opencode/skills/', level: 'supported' },
      { path: '~/.config/opencode/skills/', level: 'supported' },
      { path: '.claude/skills/', level: 'supported', notes: 'Compatibility directory' },
      { path: '.agents/skills/', level: 'supported', notes: 'Compatibility directory' },
    ],
    frontmatter: {
      standard: [...STANDARD_SKILL_FRONTMATTER],
      additional: [],
      notes: 'OpenCode supports Agent Skills semantics, but plugin runtime behavior is code-first rather than manifest-first.',
    },
    manifest: {
      files: ['opencode.json', '.opencode/plugins/', '~/.config/opencode/plugins/'],
      required: false,
      notes: 'OpenCode plugins are loaded as local modules or npm packages through config rather than a dedicated manifest-only bundle.',
    },
    mcp: {
      files: ['opencode.json'],
      rootKey: 'mcp',
      transports: ['local', 'remote'],
      auth: ['headers', 'env interpolation', 'OAuth'],
      notes: 'OpenCode config owns MCP; plugins can also extend runtime behavior programmatically.',
    },
    hooks: {
      supported: true,
      files: ['plugin module (index.ts/index.js)'],
      eventNames: ['command.executed', 'file.edited', 'file.watcher.updated', 'installation.updated', 'lsp.client.diagnostics', 'lsp.updated', 'message.part.removed', 'message.part.updated', 'message.removed', 'message.updated', 'permission.asked', 'permission.replied', 'server.connected', 'session.created', 'session.compacted', 'session.deleted', 'session.diff', 'session.error', 'session.idle', 'session.status', 'session.updated', 'todo.updated', 'shell.env', 'tool.execute.before', 'tool.execute.after', 'tui.prompt.append', 'tui.command.execute', 'tui.toast.show', 'experimental.session.compacting'],
      notes: 'OpenCode hooks are plugin event handlers implemented in code, not a separate hooks.json file. The official surface is an event bus rather than a small lifecycle-hook JSON schema.',
    },
    instructions: {
      files: ['AGENTS.md', 'CLAUDE.md', 'opencode.json'],
      format: 'markdown + json + code',
      notes: 'OpenCode supports AGENTS.md, CLAUDE.md fallback, config instructions, and plugin runtime instruction injection. Config layering also includes remote config, managed config files, and macOS managed preferences.',
    },
    sources: [
      { label: 'OpenCode SDK docs', url: 'https://opencode.ai/docs/sdk/' },
      { label: 'OpenCode server docs', url: 'https://opencode.ai/docs/server/' },
      { label: 'OpenCode config docs', url: 'https://opencode.ai/docs/config/' },
      { label: 'OpenCode plugins docs', url: 'https://opencode.ai/docs/plugins/' },
      { label: 'OpenCode skills docs', url: 'https://opencode.ai/docs/skills/' },
      { label: 'OpenCode commands docs', url: 'https://opencode.ai/docs/commands/' },
      { label: 'OpenCode agents docs', url: 'https://opencode.ai/docs/agents/' },
      { label: 'OpenCode MCP servers docs', url: 'https://opencode.ai/docs/mcp-servers/' },
      { label: 'OpenCode custom tools docs', url: 'https://opencode.ai/docs/custom-tools/' },
      { label: 'OpenCode permissions docs', url: 'https://opencode.ai/docs/permissions/' },
      { label: 'OpenCode rules docs', url: 'https://opencode.ai/docs/rules/' },
      { label: 'OpenCode ACP docs', url: 'https://opencode.ai/docs/acp/' },
    ],
  },
  'openhands': {
    platform: 'openhands',
    summary: 'OpenHands plugins use a Claude-style manifest at .plugin/plugin.json and support skills, hooks, and MCP.',
    limits: PLATFORM_LIMITS['openhands'],
    limitPolicies: PLATFORM_LIMIT_POLICIES['openhands'],
    skillDiscoveryDirs: [
      { path: '.openhands/skills/', level: 'supported' },
      { path: '.claude/skills/', level: 'supported' },
      { path: '.agents/skills/', level: 'supported' },
    ],
    frontmatter: {
      standard: [...STANDARD_SKILL_FRONTMATTER],
      additional: ['triggers'],
      notes: 'OpenHands skill docs mention support for trigger metadata in addition to Agent Skills frontmatter.',
    },
    manifest: {
      files: ['.plugin/plugin.json'],
      required: true,
      notes: 'OpenHands plugin docs require a manifest under .plugin.',
    },
    mcp: {
      files: ['.mcp.json'],
      rootKey: 'mcpServers',
      transports: ['stdio', 'http', 'sse'],
      auth: ['headers-based env interpolation'],
    },
    hooks: {
      supported: true,
      files: ['hooks/hooks.json'],
      eventNames: [],
      notes: 'OpenHands supports hook configuration via hooks/hooks.json; event names align with Claude-style hooks in current docs.',
    },
    instructions: {
      files: ['AGENTS.md'],
      format: 'markdown',
    },
    sources: [
      { label: 'OpenHands plugin guide', url: 'https://docs.openhands.dev/sdk/guides/plugins' },
      { label: 'OpenHands skill guide', url: 'https://docs.openhands.dev/sdk/guides/skill' },
    ],
  },
  'warp': {
    platform: 'warp',
    summary: 'Warp supports skills, rules, and MCP with AGENTS.md as the current rules anchor.',
    limits: PLATFORM_LIMITS['warp'],
    limitPolicies: PLATFORM_LIMIT_POLICIES['warp'],
    skillDiscoveryDirs: [
      { path: '.agents/skills/', level: 'supported' },
      { path: '.warp/skills/', level: 'supported' },
      { path: '.claude/skills/', level: 'supported', notes: 'Compatibility directory' },
      { path: '.codex/skills/', level: 'supported', notes: 'Compatibility directory' },
    ],
    frontmatter: {
      standard: [...STANDARD_SKILL_FRONTMATTER],
      additional: [],
    },
    manifest: {
      files: [],
      required: false,
      notes: 'Warp does not currently require a dedicated plugin manifest file.',
    },
    mcp: {
      files: ['mcp.json'],
      rootKey: 'mcpServers',
      transports: ['stdio', 'http', 'sse'],
      auth: ['headers', 'OAuth (remote server flows)'],
    },
    hooks: {
      supported: false,
      files: [],
      eventNames: [],
      notes: 'Warp docs reviewed for this ticket focus on skills, rules, and MCP; no standalone hooks schema found.',
    },
    instructions: {
      files: ['AGENTS.md', 'WARP.md'],
      format: 'markdown',
      notes: 'AGENTS.md is current; WARP.md is backward compatible.',
    },
    sources: [
      { label: 'Warp skills docs', url: 'https://docs.warp.dev/agent-platform/capabilities/skills' },
      { label: 'Warp MCP docs', url: 'https://docs.warp.dev/agent-platform/capabilities/mcp' },
      { label: 'Warp rules docs', url: 'https://docs.warp.dev/agent-platform/capabilities/rules' },
    ],
  },
  'gemini-cli': {
    platform: 'gemini-cli',
    summary: 'Gemini CLI uses gemini-extension.json, GEMINI.md instructions, and hook definitions in hooks/hooks.json.',
    limits: PLATFORM_LIMITS['gemini-cli'],
    limitPolicies: PLATFORM_LIMIT_POLICIES['gemini-cli'],
    skillDiscoveryDirs: [
      { path: 'skills/', level: 'supported' },
    ],
    frontmatter: {
      standard: [...STANDARD_SKILL_FRONTMATTER],
      additional: [],
    },
    manifest: {
      files: ['gemini-extension.json'],
      required: true,
      notes: 'Gemini extensions require a manifest file named gemini-extension.json.',
    },
    mcp: {
      files: ['gemini-extension.json'],
      rootKey: 'mcpServers',
      transports: ['stdio', 'http', 'sse'],
      auth: ['headers', 'env interpolation'],
    },
    hooks: {
      supported: true,
      files: ['hooks/hooks.json'],
      eventNames: [],
      notes: 'Gemini hook docs specify hooks/hooks.json; hook config is separate from gemini-extension.json.',
    },
    instructions: {
      files: ['GEMINI.md'],
      format: 'markdown',
    },
    sources: [
      { label: 'Gemini extensions docs', url: 'https://geminicli.com/docs/extensions/' },
      { label: 'Gemini extension reference', url: 'https://geminicli.com/docs/extensions/reference/' },
      { label: 'Gemini hooks docs', url: 'https://geminicli.com/docs/hooks/' },
    ],
  },
  'roo-code': {
    platform: 'roo-code',
    summary: 'Roo Code supports project and mode-specific rules, project-level MCP config, and custom modes metadata.',
    limits: PLATFORM_LIMITS['roo-code'],
    limitPolicies: PLATFORM_LIMIT_POLICIES['roo-code'],
    skillDiscoveryDirs: [
      { path: '.roo/skills/', level: 'supported' },
    ],
    frontmatter: {
      standard: [...STANDARD_SKILL_FRONTMATTER],
      additional: ['mode fields: slug, roleDefinition, whenToUse, customInstructions, groups'],
      notes: 'Additional fields apply to custom mode definitions, not SKILL.md frontmatter.',
    },
    manifest: {
      files: [],
      required: false,
      notes: 'Roo Code does not require a plugin manifest file.',
    },
    mcp: {
      files: ['.roo/mcp.json', 'mcp_settings.json'],
      rootKey: 'mcpServers',
      transports: ['stdio', 'http', 'sse', 'streamable-http'],
      auth: ['headers', 'OAuth', 'provider-specific env'],
    },
    hooks: {
      supported: false,
      files: [],
      eventNames: [],
      notes: 'No standalone hook event schema identified in Roo docs reviewed for this ticket.',
    },
    instructions: {
      files: ['.roo/rules/', '.roo/rules-{modeSlug}/', '.roorules', '.roorules-{modeSlug}'],
      format: 'markdown',
      notes: '.roo/rules/ and mode-specific rules are preferred over legacy .roorules files.',
    },
    sources: [
      { label: 'Roo custom instructions docs', url: 'https://docs.roocode.com/features/custom-instructions' },
      { label: 'Roo custom modes docs', url: 'https://docs.roocode.com/features/custom-modes' },
      { label: 'Roo MCP docs', url: 'https://docs.roocode.com/features/mcp/using-mcp-in-roo' },
      { label: 'Roo MCP transports docs', url: 'https://docs.roocode.com/features/mcp/server-transports' },
    ],
  },
  'cline': {
    platform: 'cline',
    summary: 'Cline supports layered rules, .cline/mcp.json, and conditional rules via frontmatter path globs.',
    limits: PLATFORM_LIMITS['cline'],
    limitPolicies: PLATFORM_LIMIT_POLICIES['cline'],
    skillDiscoveryDirs: [
      { path: '.cline/skills/', level: 'supported' },
      { path: '.agents/skills/', level: 'supported' },
    ],
    frontmatter: {
      standard: [...STANDARD_SKILL_FRONTMATTER],
      additional: ['paths (for conditional .clinerules entries)'],
      notes: 'The additional field applies to rule files, not SKILL.md.',
    },
    manifest: {
      files: [],
      required: false,
      notes: 'Cline does not require a dedicated plugin manifest file.',
    },
    mcp: {
      files: ['.cline/mcp.json'],
      rootKey: 'mcpServers',
      transports: ['stdio', 'http', 'sse'],
      auth: ['headers', 'env interpolation'],
      notes: 'Current Cline docs align with a Claude-style mcpServers object in project config.',
    },
    hooks: {
      supported: true,
      files: ['.clinerules/hooks/'],
      eventNames: [],
      notes: 'Hook scripts are documented under .clinerules/hooks/ conventions.',
    },
    instructions: {
      files: ['.clinerules/', 'AGENTS.md'],
      format: 'markdown',
      notes: '.clinerules supports both always-on and conditional rule files.',
    },
    sources: [
      { label: 'Cline rules docs', url: 'https://docs.cline.bot/customization/cline-rules' },
    ],
  },
  'amp': {
    platform: 'amp',
    summary: 'AMP uses AGENTS.md/AGENT.md for instruction hierarchy and .amp/settings.json for settings, hooks, and MCP.',
    limits: PLATFORM_LIMITS['amp'],
    limitPolicies: PLATFORM_LIMIT_POLICIES['amp'],
    skillDiscoveryDirs: [
      { path: '.agents/skills/', level: 'supported' },
      { path: '~/.config/amp/skills/', level: 'supported' },
    ],
    frontmatter: {
      standard: [...STANDARD_SKILL_FRONTMATTER],
      additional: [],
    },
    manifest: {
      files: [],
      required: false,
      notes: 'AMP does not require a standalone plugin manifest file.',
    },
    mcp: {
      files: ['.amp/settings.json', '~/.config/amp/settings.json'],
      rootKey: 'amp.mcpServers',
      transports: ['stdio', 'http'],
      auth: ['headers', 'env interpolation', 'OAuth via server support'],
    },
    hooks: {
      supported: true,
      files: ['.amp/settings.json'],
      eventNames: [],
      notes: 'AMP manual documents hooks within settings, but event naming/details are less explicit than other platforms.',
    },
    instructions: {
      files: ['AGENTS.md', 'AGENT.md'],
      format: 'markdown',
      notes: 'AMP prefers AGENTS.md and falls back to AGENT.md for compatibility.',
    },
    sources: [
      { label: 'AMP manual', url: 'https://ampcode.com/manual' },
    ],
  },
}

export const CORE_FOUR_PRIMITIVE_CAPABILITIES: Record<CoreFourPlatform, CoreFourPrimitiveCapabilities> = {
  'claude-code': {
    platform: 'claude-code',
    buckets: {
      instructions: {
        mode: 'preserve',
        nativeSurfaces: ['CLAUDE.md'],
        notes: 'Claude has a native persistent instructions surface and plugin-level guidance model.',
      },
      skills: {
        mode: 'preserve',
        nativeSurfaces: ['skills/<skill>/SKILL.md'],
      },
      commands: {
        mode: 'preserve',
        nativeSurfaces: ['commands/*.md', 'skills/<skill>/SKILL.md'],
        notes: 'Claude still supports command files, but the product is increasingly converging command workflows into skills.',
      },
      agents: {
        mode: 'preserve',
        nativeSurfaces: ['agents/*.md'],
        notes: 'Claude plugin agents are a first-class native surface with rich frontmatter.',
      },
      hooks: {
        mode: 'preserve',
        nativeSurfaces: ['hooks/hooks.json', '.claude-plugin/plugin.json', 'settings hooks', 'skill/agent frontmatter hooks'],
      },
      permissions: {
        mode: 'translate',
        nativeSurfaces: ['agent frontmatter', 'hook decisions', 'runtime approvals'],
        notes: 'Permission intent exists, but not as one single canonical plugin-level object.',
      },
      runtime: {
        mode: 'preserve',
        nativeSurfaces: ['.mcp.json', '.claude-plugin/plugin.json', 'scripts/', 'assets/'],
      },
      distribution: {
        mode: 'translate',
        nativeSurfaces: ['.claude-plugin/plugin.json', 'marketplaces', 'install scopes', 'user configuration', '/reload-plugins'],
        notes: 'Distribution surfaces are native, including plugin marketplaces and explicit reload behavior.',
      },
    },
    sources: PLATFORM_VALIDATION_RULES['claude-code'].sources,
  },
  'cursor': {
    platform: 'cursor',
    buckets: {
      instructions: {
        mode: 'preserve',
        nativeSurfaces: ['rules/', 'AGENTS.md'],
      },
      skills: {
        mode: 'preserve',
        nativeSurfaces: ['skills/<skill>/SKILL.md'],
        notes: 'Cursor skills preserve workflow meaning but document a narrower frontmatter set than Claude.',
      },
      commands: {
        mode: 'preserve',
        nativeSurfaces: ['commands/*', 'slash commands'],
      },
      agents: {
        mode: 'translate',
        nativeSurfaces: ['agents/', '.cursor/agents/', '~/.cursor/agents/'],
        notes: 'Cursor specialization and tool access often live more naturally in subagents than in skills.',
      },
      hooks: {
        mode: 'preserve',
        nativeSurfaces: ['hooks/hooks.json', '.cursor/hooks.json', '~/.cursor/hooks.json'],
      },
      permissions: {
        mode: 'translate',
        nativeSurfaces: ['hooks allow/deny', '.cursor/cli.json', '~/.cursor/cli-config.json', 'subagent tool access'],
        notes: 'Cursor can express permission intent, but it is spread across hooks, CLI permissions, and subagent configuration.',
      },
      runtime: {
        mode: 'preserve',
        nativeSurfaces: ['mcp.json', '.cursor/mcp.json', '~/.cursor/mcp.json', '.cursor-plugin/plugin.json', 'scripts/', 'assets/'],
      },
      distribution: {
        mode: 'preserve',
        nativeSurfaces: ['.cursor-plugin/plugin.json', '.cursor-plugin/marketplace.json', 'local marketplace install path', 'reload window / restart'],
      },
    },
    sources: PLATFORM_VALIDATION_RULES['cursor'].sources,
  },
  'codex': {
    platform: 'codex',
    buckets: {
      instructions: {
        mode: 'preserve',
        nativeSurfaces: ['AGENTS.md', 'AGENTS.override.md'],
      },
      skills: {
        mode: 'preserve',
        nativeSurfaces: ['skills/<skill>/SKILL.md'],
      },
      commands: {
        mode: 'degrade',
        nativeSurfaces: ['skills/', 'AGENTS.md', '.codex/commands.generated.json'],
        notes: 'Current Codex docs do not document plugin-packaged slash-command parity, so Pluxx keeps canonical command intent through routing guidance plus a generated companion mirror.',
      },
      agents: {
        mode: 'translate',
        nativeSurfaces: ['.codex/agents/*.toml', '~/.codex/agents/*.toml', 'subagent workflows'],
        notes: 'Codex custom agents and subagents are real native surfaces, but they are not packaged the same way as Claude or Cursor plugin agents. Local May 13, 2026 headless probes now prove explicit invocation, built-in-name override, project-local precedence, and discovered `.agents/skills` inheritance. The same maintained headless suite also showed two config-depth caveats: a parent `[[skills.config]] enabled = false` entry did not disable a discovered project skill, and an agent-local `[[skills.config]]` entry did not preload an undiscovered `skills/` path. The maintained `bun scripts/probe-codex-mcp-runtime.ts --json` headless probe now also shows a more precise MCP approval split: default project-scoped and user-scoped root MCP both emit a real `mcp_tool_call` item but fail it with `user cancelled MCP tool call` before any server-side `tools/call`, while the default inline-agent path reaches startup plus `tools/list` and then falls back to `MCP_PROOF_MARKER_MISSING`. The same maintained suite now also proves five approved allow-paths: explicit `[mcp_servers.<id>.tools.<tool>] approval_mode = "approve"` works for project-scoped root MCP, user-scoped root MCP, agent-local inline `mcp_servers`, and custom agents that inherit an approved project-scoped or user-scoped root MCP server. All three approved custom-agent MCP paths still avoid a root `mcp_tool_call` item in the parent `codex exec --json` stream and instead surface child `agents_states` moving through `pending_init` to `completed`; project-scoped servers still do not appear in `codex mcp list`, and user-scoped servers do appear there. The maintained `bun scripts/probe-codex-agents-interactive-runtime.ts --json` trusted interactive probe also showed the same `sandbox_mode = "read-only"` child agent still wrote to the workspace there too, so these fields are not yet uniformly trustworthy runtime boundaries.',
      },
      hooks: {
        mode: 'translate',
        nativeSurfaces: ['hooks/hooks.json', '.codex/hooks.json', '~/.codex/hooks.json'],
      notes: 'Hooks are native. Pluxx bundles translated Codex hooks in the plugin and still tracks the project/user config paths plus the mixed `[features].hooks` / `[features].codex_hooks` activation caveat and current runtime/doc drift.',
      },
      permissions: {
        mode: 'translate',
        nativeSurfaces: ['approvals', 'sandbox policy', 'hook matchers', 'custom agent config'],
        notes: 'Codex expresses permission intent through approvals, sandboxing, hooks, and custom agents rather than skill frontmatter. Pluxx now also emits `.codex/config.generated.toml` for the live-proven top-level MCP allow-path when canonical `MCP(...)` rules are concrete enough to materialize per-tool `approval_mode = "approve"` stanzas, while `.codex/permissions.generated.json` remains the broader advisory mirror.',
      },
      runtime: {
        mode: 'preserve',
        nativeSurfaces: ['.mcp.json', '.app.json', '.codex/config.toml', 'scripts/', 'assets/'],
        notes: `Bundle-local MCP config exists, but active MCP state also lives in config.toml. Local May 13, 2026 headless Codex MCP probes reached startup plus \`tools/list\` across project-scoped, user-scoped, and inline-agent config; default root MCP emitted a real \`mcp_tool_call\` item but failed it with \`user cancelled MCP tool call\` before any server-side \`tools/call\`, while the default inline-agent path fell back to \`MCP_PROOF_MARKER_MISSING\` after startup plus \`tools/list\`. The same maintained suite now proves five concrete approval paths: project-scoped root MCP, user-scoped root MCP, agent-local inline \`mcp_servers\`, a custom agent inheriting an approved project-scoped root MCP server, and a custom agent inheriting an approved user-scoped root MCP server all reach real server-side \`tools/call\` once explicit \`[mcp_servers.<id>.tools.<tool>] approval_mode = "approve"\` is present in the relevant layer. All three approved custom-agent MCP paths still avoid a root \`mcp_tool_call\` item in the parent \`codex exec --json\` stream and instead surface child \`agents_states\` moving through \`pending_init\` to \`completed\`; project-scoped servers still do not appear in \`codex mcp list\`, and user-scoped servers do appear there. ${getRuntimeReadinessExternalConfigNote()}`,
      },
      distribution: {
        mode: 'preserve',
        nativeSurfaces: ['.codex-plugin/plugin.json', '~/.agents/plugins/marketplace.json', '$REPO_ROOT/.agents/plugins/marketplace.json', 'cache install path', 'restart after update'],
      },
    },
    sources: PLATFORM_VALIDATION_RULES['codex'].sources,
  },
  'opencode': {
    platform: 'opencode',
    buckets: {
      instructions: {
        mode: 'translate',
        nativeSurfaces: ['AGENTS.md', 'CLAUDE.md', 'config instructions', 'plugin code'],
        notes: 'OpenCode instructions are native, but the surface is config- and code-driven rather than manifest markdown only.',
      },
      skills: {
        mode: 'preserve',
        nativeSurfaces: ['skills/<skill>/SKILL.md'],
      },
      commands: {
        mode: 'preserve',
        nativeSurfaces: ['commands/*.md', 'config command definitions'],
      },
      agents: {
        mode: 'preserve',
        nativeSurfaces: ['agents/*.md', 'config agent definitions'],
        notes: 'OpenCode agents are first-class native surfaces. Prefer permission-first agent config for new builds; legacy tools remains compatibility input, not the preferred emitted shape.',
      },
      hooks: {
        mode: 'translate',
        nativeSurfaces: ['plugin JS/TS event handlers'],
        notes: 'OpenCode hook behavior is native, but code-first rather than hooks.json-driven.',
      },
      permissions: {
        mode: 'preserve',
        nativeSurfaces: ['config permission', 'per-agent overrides'],
        notes: 'OpenCode permission is keyed by tool name and patterns, including native skill and task controls. Legacy tools booleans are deprecated in favor of permission.',
      },
      runtime: {
        mode: 'preserve',
        nativeSurfaces: ['opencode.json', 'config mcp', 'plugin JS/TS runtime', 'scripts/', 'assets/'],
      },
      distribution: {
        mode: 'translate',
        nativeSurfaces: ['.opencode/plugins/', '~/.config/opencode/plugins/', 'opencode.json', 'npm package', 'plugin JS/TS entrypoint'],
        notes: 'Distribution is native, but there is no single shared manifest analog to Claude, Cursor, or Codex.',
      },
    },
    sources: PLATFORM_VALIDATION_RULES['opencode'].sources,
  },
}

export function getPlatformRules(platform: ResearchTarget): PlatformRules {
  return PLATFORM_VALIDATION_RULES[platform]
}

export function getCoreFourPrimitiveCapabilities(platform: CoreFourPlatform): CoreFourPrimitiveCapabilities {
  return CORE_FOUR_PRIMITIVE_CAPABILITIES[platform]
}
