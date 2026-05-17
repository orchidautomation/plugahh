import { existsSync, lstatSync, readdirSync, readFileSync } from 'fs'
import { resolve, relative, basename, dirname } from 'path'
import { loadConfig } from '../config/load'
import { getConfiguredCompilerBuckets, getPluginCompilerBuckets, type McpServer, type PluginConfig, type PluxxCompilerBucket, type TargetPlatform } from '../schema'
import { PLATFORM_LIMITS, PLATFORM_LIMIT_POLICIES, getCoreFourPrimitiveCapabilities, getPlatformRules, type CoreFourPlatform, type PrimitiveTranslationMode } from '../validation/platform-rules'
import {
  getCodexCommandGuidanceNote,
  getCommandTranslationMessage,
  getTranslatedCommandFields,
} from '../command-translation-registry'
import { collectPermissionRules, permissionRulesNeedToolLevelDowngrade } from '../permissions'
import { getRuntimeReadinessPlan } from '../readiness'
import { readSkillMarkdownFile, walkSkillFiles, type ParsedSkillMarkdown } from '../skills'
import { getCanonicalCommandMetadata, readCanonicalCommandFiles } from '../commands'
import {
  getRuntimeReadinessCapability,
  getRuntimeReadinessExternalConfigNote,
  getRuntimeReadinessNamedPromptTargetNote,
} from '../runtime-readiness-registry'
import {
  ALTERNATE_CODEX_HOOKS_FEATURE_FLAG,
  PLUGIN_BUNDLED_CODEX_HOOKS_FEATURE_FLAG,
  isCodexPluginHooksFeatureEnabled,
  isCodexHooksFeatureEnabled,
  RECOMMENDED_CODEX_HOOKS_FEATURE_FLAG,
  usesAlternateCodexHooksFeatureFlagOnly,
} from '../codex-hooks-feature'
import { getCanonicalAgentMetadata, readCanonicalAgentFiles } from '../agents'
import { getAgentTranslationMessage, getTranslatedAgentFields } from '../agent-translation-registry'
import { buildPrimitiveTranslationSummary, renderPrimitiveTranslationSummary, type PrimitiveTranslationSummary } from './primitive-summary'
import { getBrandingCompletenessWarnings } from '../branding-completeness'
import {
  mapHookEventToPascalCase,
} from '../hook-events'
import { findHostPluginRootVars } from '../mcp-stdio-paths'
import {
  getHookFieldSupportedEvents,
  getHookFieldTranslationIssue,
  getHookTypeTranslationIssue,
  getPromptHookTranslationIssue,
  getSupportedHookEvents,
  getUnsupportedHookEventReason,
  isHookEventSupported,
  isHookTypeSupported,
} from '../hook-translation-registry'
import { readInstructionsContentSync, resolveInstructionsPath } from '../instructions'
import { getSkillFrontmatterTranslationIssue } from '../skill-translation-registry'
import {
  getInstallerOwnedCheckEnvHookMessage,
  getInstallerOwnedCheckEnvRuntimeMessage,
  referencesInstallerOwnedCheckEnv,
} from '../runtime-script-contract'
const AGENT_SKILLS_RULES = { name: { pattern: /^[a-z0-9-]+$/, maxLength: 64 }, description: { maxLength: 1024 } }
const CLAUDE_CODE_RULES = { description: { maxDisplayLength: 250 } }
const CODEX_RULES = {
  interface: { maxDefaultPrompts: 3, maxDefaultPromptLength: 128, brandColorPattern: /^#[0-9a-fA-F]{6}$/, knownCapabilities: ['Interactive', 'Write', 'Read'] as const },
  manifestPaths: { requiredPrefix: './' },
  mcp: { serverNamePattern: /^[a-z0-9_-]+$/ },
  agents: { maxThreadsMin: 1, maxDepthMin: 1 },
  settings: { validKeys: ['agent'] as const },
}

const CLAUDE_CODE_HOOK_EVENTS = [
  'SessionStart', 'Setup', 'PreToolUse', 'PostToolUse', 'UserPromptSubmit', 'UserPromptExpansion',
  'PermissionRequest', 'PermissionDenied', 'PostToolUseFailure',
  'PostToolBatch',
  'Notification', 'SubagentStart', 'SubagentStop',
  'TaskCreated', 'TaskCompleted', 'Stop', 'StopFailure',
  'TeammateIdle', 'InstructionsLoaded', 'ConfigChange', 'CwdChanged',
  'FileChanged', 'WorktreeCreate', 'WorktreeRemove',
  'PreCompact', 'PostCompact', 'Elicitation', 'ElicitationResult', 'SessionEnd',
] as const

const CLAUDE_CODE_HOOK_TYPES = ['command', 'http', 'mcp_tool', 'prompt', 'agent'] as const

const AGENT_FORBIDDEN_FRONTMATTER = ['hooks', 'mcpServers', 'permissionMode'] as const

const SEMVER_REGEX = /^\d+\.\d+\.\d+$/

const PLUGIN_NAME_KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/
const CORE_FOUR_TARGETS = new Set<CoreFourPlatform>(['claude-code', 'cursor', 'codex', 'opencode'])
const LINT_TRANSLATION_WARNING_BUCKETS = new Set<PluxxCompilerBucket>(['commands', 'agents', 'hooks', 'permissions', 'runtime'])

type LintLevel = 'error' | 'warning'

interface LintIssue {
  level: LintLevel
  code: string
  message: string
  file?: string
  platform?: string
}

interface ParsedFrontmatterFile {
  parsed: ParsedSkillMarkdown
}

export interface LintResult {
  errors: number
  warnings: number
  issues: LintIssue[]
  primitiveSummary?: PrimitiveTranslationSummary
}

export interface LintProjectOptions {
  targets?: TargetPlatform[]
}

const SKILL_NAME_REGEX = AGENT_SKILLS_RULES.name.pattern
const MAX_AGENT_SKILLS_DESCRIPTION = AGENT_SKILLS_RULES.description.maxLength
const MAX_CLAUDE_DESCRIPTION = CLAUDE_CODE_RULES.description.maxDisplayLength
const MAX_SKILL_NAME = AGENT_SKILLS_RULES.name.maxLength
const MAX_CODEX_DEFAULT_PROMPTS = CODEX_RULES.interface.maxDefaultPrompts
const MAX_CODEX_PROMPT_LENGTH = CODEX_RULES.interface.maxDefaultPromptLength
const HEX_COLOR_REGEX = CODEX_RULES.interface.brandColorPattern
const DIRECT_INSTALL_VALIDATION_HOOKS = new Set([
  'bash "${PLUGIN_ROOT}/scripts/check-env.sh"',
  'bash "${CLAUDE_PLUGIN_ROOT}/scripts/check-env.sh"',
  'bash "${CURSOR_PLUGIN_ROOT}/scripts/check-env.sh"',
  'bash "./scripts/check-env.sh"',
])

function pushIssue(issues: LintIssue[], issue: LintIssue): void {
  issues.push(issue)
}

function collectSkillFiles(dir: string): string[] {
  return walkSkillFiles(dir)
}

function getParsedFrontmatterFile(filePath: string, cache: Map<string, ParsedFrontmatterFile>): ParsedFrontmatterFile {
  const cached = cache.get(filePath)
  if (cached) return cached

  const entry = {
    parsed: readSkillMarkdownFile(filePath),
  }
  cache.set(filePath, entry)
  return entry
}

function needsQuotes(value: string): boolean {
  const startsWithSpecial = /^[\[\]{},&*!|>@`]/.test(value)
  const containsCommentChar = /\s#/.test(value)
  const containsYamlColon = /:\s/.test(value)
  const hasLeadingOrTrailingSpace = value !== value.trim()
  return startsWithSpecial || containsCommentChar || containsYamlColon || hasLeadingOrTrailingSpace
}

function normalizeWhitespace(value: string): string {
  return value.split(/\s+/).filter(Boolean).join(' ')
}

function isCodexTargetEnabled(config: PluginConfig): boolean {
  return config.targets.includes('codex')
}

function isCodexManifestRelativePath(path: string): boolean {
  if (!path.startsWith(CODEX_RULES.manifestPaths.requiredPrefix)) return false
  if (path === CODEX_RULES.manifestPaths.requiredPrefix) return false
  const relativePath = path.slice(CODEX_RULES.manifestPaths.requiredPrefix.length)
  if (relativePath.includes('..')) return false
  return !relativePath.startsWith('/') && !relativePath.startsWith('\\')
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function lintSkillFile(
  skillFile: string,
  targets: TargetPlatform[],
  issues: LintIssue[],
  frontmatterCache: Map<string, ParsedFrontmatterFile>,
): void {
  const { parsed } = getParsedFrontmatterFile(skillFile, frontmatterCache)

  if (!parsed.hasValidFrontmatter) {
    pushIssue(issues, {
      level: 'error',
      code: 'skill-frontmatter',
      message: 'SKILL.md must start with valid YAML frontmatter delimited by --- lines.',
      file: skillFile,
      platform: 'Agent Skills',
    })
    return
  }

  const nameField = parsed.frontmatterFields.get('name')
  const descriptionField = parsed.frontmatterFields.get('description')

  if (!nameField?.value) {
    pushIssue(issues, {
      level: 'error',
      code: 'skill-name-missing',
      message: 'Frontmatter must include a non-empty `name` field.',
      file: skillFile,
      platform: 'Agent Skills',
    })
  } else {
    if (!SKILL_NAME_REGEX.test(nameField.value)) {
      pushIssue(issues, {
        level: 'error',
        code: 'skill-name-format',
        message: 'Skill name must be lowercase with hyphens only.',
        file: skillFile,
        platform: 'Agent Skills',
      })
    }

    if (nameField.value.length > MAX_SKILL_NAME) {
      pushIssue(issues, {
        level: 'error',
        code: 'skill-name-length',
        message: `Skill name exceeds ${MAX_SKILL_NAME} characters.`,
        file: skillFile,
        platform: 'Agent Skills',
      })
    }

    // Check skill name must match directory for platforms that require it
    const expectedDirName = basename(dirname(skillFile))
    const platformsRequiringDirMatch = targets.filter(t => PLATFORM_LIMITS[t].skillNameMustMatchDir)
    const hardDirMatchPlatforms = platformsRequiringDirMatch.filter((target) => PLATFORM_LIMIT_POLICIES[target].skillNameMustMatchDir.kind === 'hard')
    const advisoryDirMatchPlatforms = platformsRequiringDirMatch.filter((target) => PLATFORM_LIMIT_POLICIES[target].skillNameMustMatchDir.kind !== 'hard')
    if (hardDirMatchPlatforms.length > 0 && nameField.value !== expectedDirName) {
      const platformNames = hardDirMatchPlatforms.join(', ')
      pushIssue(issues, {
        level: 'error',
        code: 'skill-name-dir-mismatch',
        message: `Skill name "${nameField.value}" must match directory name "${expectedDirName}" (required by ${platformNames}).`,
        file: skillFile,
        platform: hardDirMatchPlatforms[0],
      })
    } else if (advisoryDirMatchPlatforms.length > 0 && nameField.value !== expectedDirName) {
      const platformNames = advisoryDirMatchPlatforms.join(', ')
      pushIssue(issues, {
        level: 'warning',
        code: 'skill-name-dir-guideline',
        message: `Skill name "${nameField.value}" should match directory name "${expectedDirName}" for ${platformNames} compatibility.`,
        file: skillFile,
        platform: advisoryDirMatchPlatforms[0],
      })
    }

    if (!nameField.quoted && needsQuotes(nameField.rawValue)) {
      pushIssue(issues, {
        level: 'warning',
        code: 'yaml-quote-special-chars',
        message: 'Frontmatter name contains YAML-sensitive characters and should be quoted.',
        file: skillFile,
        platform: 'YAML',
      })
    }
  }

  if (!descriptionField?.value) {
    pushIssue(issues, {
      level: 'error',
      code: 'skill-description-missing',
      message: 'Frontmatter must include a non-empty `description` field.',
      file: skillFile,
      platform: 'Agent Skills',
    })
  } else {
    // Check hard description max for each platform
    for (const target of targets) {
      const limits = PLATFORM_LIMITS[target]
      if (limits.skillDescriptionMax !== null && descriptionField.value.length > limits.skillDescriptionMax) {
        const policy = PLATFORM_LIMIT_POLICIES[target].skillDescriptionMax
        pushIssue(issues, {
          level: policy?.kind === 'hard' ? 'error' : 'warning',
          code: policy?.kind === 'hard' ? 'skill-description-length' : 'skill-description-guideline',
          message: policy?.kind === 'hard'
            ? `Description exceeds ${target} max of ${limits.skillDescriptionMax} characters.`
            : `Description exceeds the Pluxx ${target} compatibility guideline of ${limits.skillDescriptionMax} characters.`,
          file: skillFile,
          platform: target,
        })
      }
    }

    // Check display truncation thresholds for each platform
    for (const target of targets) {
      const limits = PLATFORM_LIMITS[target]
      if (limits.skillDescriptionDisplayMax !== null && descriptionField.value.length > limits.skillDescriptionDisplayMax) {
        pushIssue(issues, {
          level: 'warning',
          code: 'skill-description-truncation',
          message: `Description will be truncated in ${target} (display limit: ${limits.skillDescriptionDisplayMax}).`,
          file: skillFile,
          platform: target,
        })
      }
    }

    if (!descriptionField.quoted && needsQuotes(descriptionField.rawValue)) {
      pushIssue(issues, {
        level: 'warning',
        code: 'yaml-quote-special-chars',
        message: 'Frontmatter description contains YAML-sensitive characters and should be quoted.',
        file: skillFile,
        platform: 'YAML',
      })
    }
  }
}

function lintBrandMetadata(config: PluginConfig, issues: LintIssue[]): void {
  if (config.brand?.color && !HEX_COLOR_REGEX.test(config.brand.color)) {
    pushIssue(issues, {
      level: 'error',
      code: 'brand-color-hex',
      message: 'Brand color must be a valid Codex hex color (#RRGGBB).',
      file: 'pluxx.config.ts',
      platform: 'Codex',
    })
  }

  if (config.brand?.defaultPrompts) {
    if (config.brand.defaultPrompts.length > MAX_CODEX_DEFAULT_PROMPTS) {
      pushIssue(issues, {
        level: 'error',
        code: 'codex-default-prompts-count',
        message: `Codex supports at most ${MAX_CODEX_DEFAULT_PROMPTS} default prompts.`,
        file: 'pluxx.config.ts',
        platform: 'Codex',
      })
    }

    for (const prompt of config.brand.defaultPrompts) {
      if (prompt.length > MAX_CODEX_PROMPT_LENGTH) {
        pushIssue(issues, {
          level: 'error',
          code: 'codex-default-prompt-length',
          message: `A default prompt exceeds ${MAX_CODEX_PROMPT_LENGTH} characters.`,
          file: 'pluxx.config.ts',
          platform: 'Codex',
        })
      }
    }
  }

  for (const warning of getBrandingCompletenessWarnings(config)) {
    pushIssue(issues, {
      level: 'warning',
      code: warning.code,
      message: warning.message,
      file: 'pluxx.config.ts',
      platform: warning.platform,
    })
  }
}

function lintCodexOverrides(config: PluginConfig, issues: LintIssue[]): void {
  if (!isCodexTargetEnabled(config)) return

  const iface = asRecord(config.platforms?.codex?.interface)
  if (!iface) return

  if (typeof iface.brandColor === 'string' && !HEX_COLOR_REGEX.test(iface.brandColor)) {
    pushIssue(issues, {
      level: 'error',
      code: 'codex-interface-brand-color-hex',
      message: 'Codex interface.brandColor must be a valid hex color (#RRGGBB).',
      file: 'pluxx.config.ts',
      platform: 'Codex',
    })
  }

  if (typeof iface.composerIcon === 'string' && !isCodexManifestRelativePath(iface.composerIcon)) {
    pushIssue(issues, {
      level: 'error',
      code: 'codex-interface-composer-icon-path',
      message: 'Codex interface.composerIcon must be a plugin-root-relative path starting with `./`.',
      file: 'pluxx.config.ts',
      platform: 'Codex',
    })
  }

  if (typeof iface.logo === 'string' && !isCodexManifestRelativePath(iface.logo)) {
    pushIssue(issues, {
      level: 'error',
      code: 'codex-interface-logo-path',
      message: 'Codex interface.logo must be a plugin-root-relative path starting with `./`.',
      file: 'pluxx.config.ts',
      platform: 'Codex',
    })
  }

  if (Array.isArray(iface.screenshots)) {
    for (const screenshot of iface.screenshots) {
      if (typeof screenshot !== 'string' || !isCodexManifestRelativePath(screenshot)) {
        pushIssue(issues, {
          level: 'error',
          code: 'codex-interface-screenshot-path',
          message: 'Codex interface.screenshots entries must be plugin-root-relative paths starting with `./`.',
          file: 'pluxx.config.ts',
          platform: 'Codex',
        })
        break
      }
    }
  }

  const defaultPrompt = iface.defaultPrompt
  const prompts = typeof defaultPrompt === 'string'
    ? [defaultPrompt]
    : Array.isArray(defaultPrompt) ? defaultPrompt : null

  if (prompts) {
    if (prompts.length > MAX_CODEX_DEFAULT_PROMPTS) {
      pushIssue(issues, {
        level: 'error',
        code: 'codex-default-prompts-count',
        message: `Codex supports at most ${MAX_CODEX_DEFAULT_PROMPTS} default prompts.`,
        file: 'pluxx.config.ts',
        platform: 'Codex',
      })
    }
    for (const prompt of prompts) {
      if (typeof prompt !== 'string') {
        pushIssue(issues, {
          level: 'error',
          code: 'codex-default-prompt-type',
          message: 'Codex interface.defaultPrompt must be a string or an array of strings.',
          file: 'pluxx.config.ts',
          platform: 'Codex',
        })
        break
      }
      const normalized = normalizeWhitespace(prompt)
      if (!normalized) {
        pushIssue(issues, {
          level: 'error',
          code: 'codex-default-prompt-empty',
          message: 'Codex default prompts must not be empty after whitespace normalization.',
          file: 'pluxx.config.ts',
          platform: 'Codex',
        })
      } else if (normalized.length > MAX_CODEX_PROMPT_LENGTH) {
        pushIssue(issues, {
          level: 'error',
          code: 'codex-default-prompt-length',
          message: `A default prompt exceeds ${MAX_CODEX_PROMPT_LENGTH} characters.`,
          file: 'pluxx.config.ts',
          platform: 'Codex',
        })
      }
    }
  }

  if (Array.isArray(iface.capabilities)) {
    for (const capability of iface.capabilities) {
      if (typeof capability !== 'string') {
        pushIssue(issues, {
          level: 'error',
          code: 'codex-interface-capability-type',
          message: 'Codex interface.capabilities must contain only strings.',
          file: 'pluxx.config.ts',
          platform: 'Codex',
        })
        break
      }
      if (!CODEX_RULES.interface.knownCapabilities.includes(capability as typeof CODEX_RULES.interface.knownCapabilities[number])) {
        pushIssue(issues, {
          level: 'warning',
          code: 'codex-interface-capability-unknown',
          message: `Capability "${capability}" is not in Codex's documented capability set (${CODEX_RULES.interface.knownCapabilities.join(', ')}).`,
          file: 'pluxx.config.ts',
          platform: 'Codex',
        })
      }
    }
  }
}

function lintMcpUrls(config: PluginConfig, issues: LintIssue[]): void {
  if (!config.mcp) return

  for (const [serverName, server] of Object.entries(config.mcp)) {
    if (!CODEX_RULES.mcp.serverNamePattern.test(serverName)) {
      pushIssue(issues, {
        level: 'error',
        code: 'mcp-server-name-format',
        message: `MCP server name "${serverName}" must match ${CODEX_RULES.mcp.serverNamePattern}.`,
        file: 'pluxx.config.ts',
        platform: 'MCP',
      })
    }

    if (!('url' in server) || !server.url) continue
    try {
      const parsed = new URL(server.url)
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        pushIssue(issues, {
          level: 'error',
          code: 'mcp-url-protocol',
          message: `MCP server "${serverName}" must use http:// or https:// URL.`,
          file: 'pluxx.config.ts',
          platform: 'MCP',
        })
      }
    } catch {
      pushIssue(issues, {
        level: 'error',
        code: 'mcp-url-invalid',
        message: `MCP server "${serverName}" has an invalid URL.`,
        file: 'pluxx.config.ts',
        platform: 'MCP',
      })
    }
  }
}

function lintMcpRuntimeState(rootDir: string, config: PluginConfig, issues: LintIssue[]): void {
  if (!config.mcp) return

  const claudeUsesPlatformAuth = config.targets.includes('claude-code')
    && config.platforms?.['claude-code']?.mcpAuth === 'platform'
  const cursorUsesPlatformAuth = config.targets.includes('cursor')
    && config.platforms?.cursor?.mcpAuth === 'platform'
  const bundledRuntimeDirs = getBundledRuntimePayloadDirs(rootDir, config)

  for (const [serverName, server] of Object.entries(config.mcp)) {
    if (server.transport === 'stdio') {
      pushIssue(issues, {
        level: 'warning',
        code: 'mcp-stdio-runtime-dependency',
        message: `MCP server "${serverName}" runs through a local stdio command. End users still need that command and its runtime dependencies available after install.`,
        file: 'pluxx.config.ts',
        platform: 'MCP',
      })

      for (const runtimePath of findLocalStdioRuntimePaths(rootDir, server)) {
        if (bundledRuntimeDirs.some((dir) => runtimePath === dir || runtimePath.startsWith(`${dir}/`))) continue

        const relativeDir = `./${relative(rootDir, runtimePath).replace(/\\/g, '/')}/`
        pushIssue(issues, {
          level: 'warning',
          code: 'mcp-stdio-runtime-unbundled',
          message: `MCP server "${serverName}" references a project-local stdio runtime under ${relativeDir}, but that directory is not included in the bundled runtime payload (` + '`scripts` / `assets` / `passthrough`' + `). Installed bundles may ship the MCP config without the executable payload.`,
          file: 'pluxx.config.ts',
          platform: 'MCP',
        })
      }
    }

    const runtimeAuthTargets: string[] = []
    if (server.auth?.type === 'platform') {
      for (const target of config.targets) {
        if (target === 'claude-code' || target === 'cursor' || target === 'codex' || target === 'opencode') {
          runtimeAuthTargets.push(target)
        }
      }
    } else {
      if (claudeUsesPlatformAuth) runtimeAuthTargets.push('claude-code')
      if (cursorUsesPlatformAuth) runtimeAuthTargets.push('cursor')
    }

    if (runtimeAuthTargets.length > 0) {
      pushIssue(issues, {
        level: 'warning',
        code: 'mcp-runtime-auth-external',
        message: `MCP server "${serverName}" depends on host-managed auth or runtime config on ${runtimeAuthTargets.join(', ')}. Verify the installed bundle in the real host instead of assuming the bundle alone materializes auth.`,
        file: 'pluxx.config.ts',
        platform: 'MCP',
      })
    }
  }
}

function getBundledRuntimePayloadDirs(rootDir: string, config: PluginConfig): string[] {
  const { payloadSurface } = getPluginCompilerBuckets(config).runtime
  return [
    payloadSurface.scriptsPath,
    payloadSurface.assetsPath,
    ...payloadSurface.passthroughPaths,
  ]
    .filter((entry): entry is string => typeof entry === 'string' && entry.length > 0)
    .map((entry) => resolveBundledPassthroughDir(rootDir, entry))
    .filter((entry): entry is string => Boolean(entry))
}

function resolveBundledPassthroughDir(rootDir: string, entry: string): string | null {
  const resolvedPath = resolve(rootDir, entry)
  if (!existsSync(resolvedPath)) return null
  try {
    const stats = lstatSync(resolvedPath)
    if (!stats.isDirectory()) return null
    return resolvedPath.replace(/\/+$/, '')
  } catch {
    return null
  }
}

function findLocalStdioRuntimePaths(rootDir: string, server: McpServer): string[] {
  if (server.transport !== 'stdio') return []

  const runtimeDirs = new Set<string>()
  const candidates = [server.command, ...(server.args ?? [])]

  for (const candidate of candidates) {
    if (!isLikelyLocalRuntimePath(candidate)) continue
    const resolvedPath = resolve(rootDir, candidate)
    if (!existsSync(resolvedPath)) continue

    try {
      const stats = lstatSync(resolvedPath)
      const runtimeDir = stats.isDirectory() ? resolvedPath : dirname(resolvedPath)
      runtimeDirs.add(runtimeDir.replace(/\/+$/, ''))
    } catch {
      // ignore unreadable local runtime hints here; doctor/build will surface harder failures
    }
  }

  return [...runtimeDirs].sort()
}

function isLikelyLocalRuntimePath(value: string): boolean {
  return value.startsWith('./')
    || value.startsWith('../')
    || value.startsWith('.\\')
    || value.startsWith('..\\')
}

function lintInstallerOwnedRuntimeScripts(config: PluginConfig, issues: LintIssue[]): void {
  if (config.mcp) {
    for (const [serverName, server] of Object.entries(config.mcp)) {
      if (server.transport !== 'stdio') continue

      const runtimeTokens = [server.command, ...(server.args ?? [])]
      if (!runtimeTokens.some((token) => referencesInstallerOwnedCheckEnv(token))) continue

      pushIssue(issues, {
        level: 'warning',
        code: 'installer-owned-check-env-runtime',
        message: getInstallerOwnedCheckEnvRuntimeMessage(serverName),
        file: 'pluxx.config.ts',
        platform: 'Runtime',
      })
    }
  }

  if (!config.hooks) return

  for (const [eventName, hookEntries] of Object.entries(config.hooks)) {
    if (!Array.isArray(hookEntries)) continue

    for (const entry of hookEntries) {
      if (!entry || typeof entry !== 'object') continue
      const command = (entry as Record<string, unknown>).command
      if (typeof command !== 'string' || !referencesInstallerOwnedCheckEnv(command)) continue
      if (DIRECT_INSTALL_VALIDATION_HOOKS.has(command.trim())) continue

      pushIssue(issues, {
        level: 'warning',
        code: 'installer-owned-check-env-hook',
        message: getInstallerOwnedCheckEnvHookMessage(eventName),
        file: 'pluxx.config.ts',
        platform: 'Runtime',
      })
    }
  }
}

function lintGlobalMcpHostRootVariables(config: PluginConfig, issues: LintIssue[]): void {
  if (!config.mcp) return

  for (const [serverName, server] of Object.entries(config.mcp)) {
    if (server.transport !== 'stdio') continue

    const values = [server.command, ...(server.args ?? [])]
    for (const [index, value] of values.entries()) {
      const hostSpecificVars = findHostPluginRootVars(value).filter((pluginRootVar) => pluginRootVar !== 'PLUGIN_ROOT')
      if (hostSpecificVars.length === 0) continue

      const location = index === 0 ? 'command' : `args[${index - 1}]`
      pushIssue(issues, {
        level: 'warning',
        code: 'mcp-stdio-host-root-var',
        message: `MCP server "${serverName}" uses host-specific plugin root variable ${hostSpecificVars.map((pluginRootVar) => `\${${pluginRootVar}}`).join(', ')} in ${location}. Author global stdio MCP paths as \`./...\` or \`\${PLUGIN_ROOT}/...\` so Pluxx can normalize them per host during build and install.`,
        file: 'pluxx.config.ts',
        platform: 'MCP',
      })
    }
  }
}

function lintCodexHookCompatibility(config: PluginConfig, issues: LintIssue[]): void {
  if (!isCodexTargetEnabled(config) || !config.hooks) return

  for (const hookEvent of Object.keys(config.hooks)) {
    const mappedEvent = mapHookEventToPascalCase(hookEvent)
    if (!isHookEventSupported('codex', mappedEvent)) {
      pushIssue(issues, {
        level: 'warning',
        code: 'codex-hook-event-unsupported',
        message: `${getUnsupportedHookEventReason('codex') ?? `Codex hooks only support ${getSupportedHookEvents('codex').join(', ')}`}; "${hookEvent}" maps to "${mappedEvent}", which is not supported.`,
        file: 'pluxx.config.ts',
        platform: 'Codex',
      })
    }
  }
}

function lintManifestPromptLimits(config: PluginConfig, issues: LintIssue[]): void {
  for (const target of config.targets) {
    const limits = PLATFORM_LIMITS[target]
    if (limits.manifestPromptCountMax === null && limits.manifestPromptMax === null) continue

    const prompts = config.brand?.defaultPrompts
    if (!prompts) continue

    if (limits.manifestPromptCountMax !== null && prompts.length > limits.manifestPromptCountMax) {
      const policy = PLATFORM_LIMIT_POLICIES[target].manifestPromptCountMax
      pushIssue(issues, {
        level: policy?.kind === 'hard' ? 'error' : 'warning',
        code: policy?.kind === 'hard' ? 'platform-prompt-count' : 'platform-prompt-count-guideline',
        message: policy?.kind === 'hard'
          ? `${target} supports at most ${limits.manifestPromptCountMax} default prompts (found ${prompts.length}).`
          : `Pluxx recommends keeping ${target} default prompts to ${limits.manifestPromptCountMax} or fewer (found ${prompts.length}).`,
        file: 'pluxx.config.ts',
        platform: target,
      })
    }

    if (limits.manifestPromptMax !== null) {
      for (const prompt of prompts) {
        if (prompt.length > limits.manifestPromptMax) {
          const policy = PLATFORM_LIMIT_POLICIES[target].manifestPromptMax
          pushIssue(issues, {
            level: policy?.kind === 'hard' ? 'error' : 'warning',
            code: policy?.kind === 'hard' ? 'platform-prompt-length' : 'platform-prompt-length-guideline',
            message: policy?.kind === 'hard'
              ? `A default prompt exceeds ${target} max of ${limits.manifestPromptMax} characters.`
              : `A default prompt exceeds the Pluxx ${target} compatibility guideline of ${limits.manifestPromptMax} characters.`,
            file: 'pluxx.config.ts',
            platform: target,
          })
        }
      }
    }
  }
}

function lintInstructionsFileLimits(config: PluginConfig, dir: string, issues: LintIssue[]): void {
  for (const target of config.targets) {
    const limits = PLATFORM_LIMITS[target]
    if (limits.instructionsMaxBytes === null) continue

    const configuredInstructionsPath = resolveInstructionsPath(dir, config)
    const instructionsFiles = new Set(['AGENTS.md', 'CLAUDE.md', 'INSTRUCTIONS.md'])
    if (configuredInstructionsPath) {
      instructionsFiles.add(relative(dir, configuredInstructionsPath).replace(/\\/g, '/'))
    }

    for (const file of instructionsFiles) {
      const filePath = resolve(dir, file)
      if (!existsSync(filePath)) continue

      const content = file === relative(dir, configuredInstructionsPath ?? '').replace(/\\/g, '/')
        ? readInstructionsContentSync(dir, config)
        : readFileSync(filePath, 'utf-8')
      if (content === null) continue
      const byteSize = Buffer.byteLength(content, 'utf-8')
      if (byteSize > limits.instructionsMaxBytes) {
        pushIssue(issues, {
          level: 'warning',
          code: 'platform-instructions-size',
          message: `${file} is ${byteSize} bytes, exceeding ${target} max of ${limits.instructionsMaxBytes} bytes.`,
          file,
          platform: target,
        })
      }
    }
  }
}

function lintRulesFileLimits(config: PluginConfig, dir: string, issues: LintIssue[]): void {
  for (const target of config.targets) {
    const limits = PLATFORM_LIMITS[target]
    if (limits.rulesMaxLines === null) continue

    // Check common rules files
    const rulesFiles = ['.cursorrules', '.clinerules']
    for (const file of rulesFiles) {
      const filePath = resolve(dir, file)
      if (!existsSync(filePath)) continue

      const content = readFileSync(filePath, 'utf-8')
      const lineCount = content.split(/\r?\n/).length
      if (lineCount > limits.rulesMaxLines) {
        pushIssue(issues, {
          level: 'warning',
          code: 'platform-rules-lines',
          message: `${file} has ${lineCount} lines, exceeding ${target} recommended max of ${limits.rulesMaxLines} lines.`,
          file,
          platform: target,
        })
      }
    }
  }
}

// ── Gotcha #1: Plugin directories must be at plugin root, not inside .claude-plugin/ ──
function lintPluginDirectoryPlacement(dir: string, issues: LintIssue[]): void {
  const pluginSubDirs = ['commands', 'agents', 'skills', 'hooks']
  const nestedParents = ['.claude-plugin', '.plugin']

  for (const parent of nestedParents) {
    for (const subDir of pluginSubDirs) {
      const nestedPath = resolve(dir, parent, subDir)
      if (existsSync(nestedPath)) {
        pushIssue(issues, {
          level: 'error',
          code: 'plugin-dir-nested',
          message: `"${subDir}/" must be at the plugin root, not inside ${parent}/. Move ${parent}/${subDir}/ to ./${subDir}/`,
          file: `${parent}/${subDir}/`,
          platform: 'Claude Code',
        })
      }
    }
  }
}

// ── Gotcha #2 & #3: Manifest paths must be relative with ./ prefix, no ../ traversal ──
function lintManifestPaths(config: PluginConfig, issues: LintIssue[]): void {
  const pathFields: { name: string; value: string | undefined }[] = [
    { name: 'skills', value: config.skills },
    { name: 'commands', value: config.commands },
    { name: 'agents', value: config.agents },
    { name: 'instructions', value: config.instructions },
    { name: 'scripts', value: config.scripts },
    { name: 'assets', value: config.assets },
    { name: 'outDir', value: config.outDir },
  ]

  for (const field of pathFields) {
    if (!field.value) continue

    if (!field.value.startsWith('./')) {
      pushIssue(issues, {
        level: 'error',
        code: 'manifest-path-prefix',
        message: `Config path "${field.name}" must start with "./" (got "${field.value}").`,
        file: 'pluxx.config.ts',
        platform: 'Plugin Structure',
      })
    }

    if (field.value.includes('..')) {
      pushIssue(issues, {
        level: 'error',
        code: 'manifest-path-traversal',
        message: `Config path "${field.name}" must not traverse outside plugin root (contains "..").`,
        file: 'pluxx.config.ts',
        platform: 'Plugin Structure',
      })
    }
  }
}

// ── Gotcha #4: Plugin name must be kebab-case ──
function lintPluginName(config: PluginConfig, issues: LintIssue[]): void {
  if (!PLUGIN_NAME_KEBAB.test(config.name)) {
    pushIssue(issues, {
      level: 'error',
      code: 'plugin-name-kebab',
      message: `Plugin name "${config.name}" must be kebab-case (lowercase letters, numbers, hyphens, no spaces).`,
      file: 'pluxx.config.ts',
      platform: 'Plugin Structure',
    })
  }
}

// ── Gotcha #5 & #6: Validate hook event names and hook types ──
function lintHookEvents(config: PluginConfig, issues: LintIssue[]): void {
  if (!config.hooks) return

  for (const [hookEvent, hookEntries] of Object.entries(config.hooks)) {
    const pascalEvent = mapHookEventToPascalCase(hookEvent)
    if (!(CLAUDE_CODE_HOOK_EVENTS as readonly string[]).includes(pascalEvent)) {
      pushIssue(issues, {
        level: 'warning',
        code: 'hook-event-unknown',
        message: `Hook event "${hookEvent}" (as "${pascalEvent}") is not a recognized Claude Code hook event. Valid events: ${CLAUDE_CODE_HOOK_EVENTS.join(', ')}`,
        file: 'pluxx.config.ts',
        platform: 'Claude Code',
      })
    }

    if (!Array.isArray(hookEntries)) continue
    for (const entry of hookEntries) {
      if (!entry || typeof entry !== 'object') continue
      const hookType = (entry as Record<string, unknown>).type as string | undefined
      if (hookType && !(CLAUDE_CODE_HOOK_TYPES as readonly string[]).includes(hookType)) {
        pushIssue(issues, {
          level: 'error',
          code: 'hook-type-invalid',
          message: `Hook type "${hookType}" in "${hookEvent}" is not valid. Must be one of: ${CLAUDE_CODE_HOOK_TYPES.join(', ')}`,
          file: 'pluxx.config.ts',
          platform: 'Claude Code',
        })
      }
    }
  }
}

// ── Gotcha #7: Agent frontmatter must not include hooks, mcpServers, permissionMode ──
function lintAgentFrontmatter(
  agentFiles: string[],
  issues: LintIssue[],
  frontmatterCache: Map<string, ParsedFrontmatterFile>,
): void {
  for (const file of agentFiles) {
    const { parsed } = getParsedFrontmatterFile(file, frontmatterCache)
    if (!parsed.hasValidFrontmatter) continue

    for (const forbidden of AGENT_FORBIDDEN_FRONTMATTER) {
      if (parsed.frontmatterFields.has(forbidden)) {
        pushIssue(issues, {
          level: 'warning',
          code: 'agent-forbidden-frontmatter',
          message: `Agent file uses "${forbidden}" in frontmatter. Plugin agents do not support hooks, mcpServers, or permissionMode.`,
          file,
          platform: 'Claude Code',
        })
      }
    }
  }
}

function collectMarkdownFiles(dir: string): string[] {
  if (!existsSync(dir)) return []
  const files: string[] = []
  const entries = readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = resolve(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...collectMarkdownFiles(fullPath))
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      files.push(fullPath)
    }
  }
  return files
}

// ── Gotcha #8: Agent isolation field only accepts "worktree" ──
function lintAgentIsolation(
  agentFiles: string[],
  issues: LintIssue[],
  frontmatterCache: Map<string, ParsedFrontmatterFile>,
): void {
  for (const file of agentFiles) {
    const { parsed } = getParsedFrontmatterFile(file, frontmatterCache)
    if (!parsed.hasValidFrontmatter) continue

    const isolation = parsed.frontmatterFields.get('isolation')
    if (isolation && isolation.value !== 'worktree') {
      pushIssue(issues, {
        level: 'error',
        code: 'agent-isolation-invalid',
        message: `Agent isolation field must be "worktree" (got "${isolation.value}").`,
        file,
        platform: 'Claude Code',
      })
    }
  }
}

function lintOpenCodeAgentFrontmatter(
  dir: string,
  config: PluginConfig,
  issues: LintIssue[],
): void {
  if (!config.targets.includes('opencode') || !config.agents) return

  const agents = readCanonicalAgentFiles(resolve(dir, config.agents))
  for (const agent of agents) {
    if (!('tools' in agent.frontmatter)) continue
    if (hasCanonicalAgentPermission(agent.frontmatter.permission)) continue

    pushIssue(issues, {
      level: 'warning',
      code: 'opencode-agent-tools-deprecated',
      message: 'OpenCode agent `tools` is deprecated. Add canonical `permission` frontmatter so Pluxx can keep the emitted OpenCode agent permission-first even when shared cross-host authoring still carries legacy tool hints.',
      file: relative(dir, agent.filePath).replace(/\\/g, '/'),
      platform: 'OpenCode',
    })
  }
}

function hasCanonicalAgentPermission(value: unknown): boolean {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function lintAgentTranslationExplainability(
  dir: string,
  config: PluginConfig,
  issues: LintIssue[],
): void {
  if (!config.agents) return

  const agents = readCanonicalAgentFiles(resolve(dir, config.agents))
  for (const agent of agents) {
    const metadata = getCanonicalAgentMetadata(agent)
    const relativePath = relative(dir, agent.filePath).replace(/\\/g, '/')

    if (config.targets.includes('cursor')) {
      const cursorDegradedFields = getTranslatedAgentFields('cursor', metadata)
      const message = getAgentTranslationMessage('cursor', cursorDegradedFields)
      if (message) {
        pushIssue(issues, {
          level: 'warning',
          code: 'cursor-agent-translation',
          message,
          file: relativePath,
          platform: 'Cursor',
        })
      }
    }

    if (config.targets.includes('codex')) {
      const codexDegradedFields = getTranslatedAgentFields('codex', metadata)
      const message = getAgentTranslationMessage('codex', codexDegradedFields)
      if (message) {
        pushIssue(issues, {
          level: 'warning',
          code: 'codex-agent-translation',
          message,
          file: relativePath,
          platform: 'Codex',
        })
      }
    }

    if (config.targets.includes('opencode')) {
      const opencodeDegradedFields = getTranslatedAgentFields('opencode', metadata)
      const message = getAgentTranslationMessage('opencode', opencodeDegradedFields)
      if (message) {
        pushIssue(issues, {
          level: 'warning',
          code: 'opencode-agent-translation',
          message,
          file: relativePath,
          platform: 'OpenCode',
        })
      }
    }
  }
}

function lintCommandTranslationExplainability(
  dir: string,
  config: PluginConfig,
  issues: LintIssue[],
): void {
  if (!config.commands) return

  const commands = readCanonicalCommandFiles(resolve(dir, config.commands))
  for (const command of commands) {
    const metadata = getCanonicalCommandMetadata(command)
    const relativePath = relative(dir, command.filePath).replace(/\\/g, '/')

    if (config.targets.includes('codex')) {
      const degradedFields = getTranslatedCommandFields('codex', metadata)
      const message = getCommandTranslationMessage('codex', degradedFields)

      if (degradedFields.length > 0 && message) {
        pushIssue(issues, {
          level: 'warning',
          code: 'codex-command-translation',
          message,
          file: relativePath,
          platform: 'Codex',
        })
      }
    }
  }
}

// ── Gotcha #9: Warn if absolute paths used in hooks/MCP instead of ${CLAUDE_PLUGIN_ROOT} ──
function lintAbsolutePaths(config: PluginConfig, issues: LintIssue[]): void {
  const absolutePathPattern = /^\/[a-zA-Z]|^[A-Z]:\\/

  // Check hooks commands
  if (config.hooks) {
    for (const [eventName, hookEntries] of Object.entries(config.hooks)) {
      if (!Array.isArray(hookEntries)) continue
      for (const entry of hookEntries) {
        if (!entry || typeof entry !== 'object') continue
        const cmd = (entry as Record<string, unknown>).command
        if (typeof cmd === 'string' && absolutePathPattern.test(cmd)) {
          pushIssue(issues, {
            level: 'warning',
            code: 'hook-absolute-path',
            message: `Hook "${eventName}" uses an absolute path in command. Use \${CLAUDE_PLUGIN_ROOT} for portability.`,
            file: 'pluxx.config.ts',
            platform: 'Claude Code',
          })
        }
      }
    }
  }

  // Check MCP server commands
  if (config.mcp) {
    for (const [serverName, server] of Object.entries(config.mcp)) {
      if ('command' in server && typeof server.command === 'string' && absolutePathPattern.test(server.command)) {
        pushIssue(issues, {
          level: 'warning',
          code: 'mcp-absolute-path',
          message: `MCP server "${serverName}" uses an absolute path in command. Use \${CLAUDE_PLUGIN_ROOT} for portability.`,
          file: 'pluxx.config.ts',
          platform: 'Claude Code',
        })
      }
    }
  }
}

// ── Gotcha #11: settings.json only supports "agent" key ──
function lintSettingsJson(dir: string, issues: LintIssue[]): void {
  const settingsPath = resolve(dir, 'settings.json')
  if (!existsSync(settingsPath)) return

  try {
    const content = JSON.parse(readFileSync(settingsPath, 'utf-8'))
    if (typeof content === 'object' && content !== null) {
      const keys = Object.keys(content)
      for (const key of keys) {
        if (!(CODEX_RULES.settings.validKeys as readonly string[]).includes(key)) {
          pushIssue(issues, {
            level: 'warning',
            code: 'settings-unknown-key',
            message: `settings.json key "${key}" is not recognized. Currently only "${CODEX_RULES.settings.validKeys.join(', ')}" is supported.`,
            file: 'settings.json',
            platform: 'Claude Code',
          })
        }
      }
    }
  } catch {
    // If settings.json can't be parsed, skip
  }
}

// ── Gotcha #12: Version must follow semver ──
function lintVersionFormat(config: PluginConfig, issues: LintIssue[]): void {
  if (!SEMVER_REGEX.test(config.version)) {
    pushIssue(issues, {
      level: 'error',
      code: 'version-semver',
      message: `Version "${config.version}" must follow semantic versioning (MAJOR.MINOR.PATCH).`,
      file: 'pluxx.config.ts',
      platform: 'Plugin Structure',
    })
  }
}

// ── Commands are a first-class optional surface alongside skills ──
function lintLegacyCommandsDir(dir: string, config: PluginConfig, issues: LintIssue[]): void {
  void dir
  void config
  void issues
}

// ── Gotcha #15: Codex agents.max_threads minimum is 1 ──
// ── Gotcha #16: Codex agents.max_depth minimum is 1 ──
function lintCodexAgentsConfig(config: PluginConfig, issues: LintIssue[]): void {
  if (!isCodexTargetEnabled(config)) return

  const codexOverrides = asRecord(config.platforms?.codex)
  if (!codexOverrides) return

  const agents = asRecord(codexOverrides.agents)
  if (!agents) return

  if (typeof agents.max_threads === 'number' && agents.max_threads < CODEX_RULES.agents.maxThreadsMin) {
    pushIssue(issues, {
      level: 'error',
      code: 'codex-agents-max-threads',
      message: `Codex agents.max_threads must be at least ${CODEX_RULES.agents.maxThreadsMin} (got ${agents.max_threads}).`,
      file: 'pluxx.config.ts',
      platform: 'Codex',
    })
  }

  if (typeof agents.max_depth === 'number' && agents.max_depth < CODEX_RULES.agents.maxDepthMin) {
    pushIssue(issues, {
      level: 'error',
      code: 'codex-agents-max-depth',
      message: `Codex agents.max_depth must be at least ${CODEX_RULES.agents.maxDepthMin} (got ${agents.max_depth}).`,
      file: 'pluxx.config.ts',
      platform: 'Codex',
    })
  }
}

// ── Gotcha #18: Codex hooks may still depend on a feature gate ──
function lintCodexHooksExternalConfig(config: PluginConfig, issues: LintIssue[]): void {
  if (!isCodexTargetEnabled(config) || !config.hooks) return
  if (Object.keys(config.hooks).length === 0) return

  const codexOverrides = asRecord(config.platforms?.codex)
  const features = codexOverrides ? asRecord(codexOverrides.features) : null
  const hasPluxxCodexPluginHooksFlag = isCodexPluginHooksFeatureEnabled(features)

  if (!hasPluxxCodexPluginHooksFlag) {
    pushIssue(issues, {
      level: 'warning',
      code: 'codex-hooks-external-config',
      message: `Pluxx now bundles Codex hooks at \`hooks/hooks.json\`, and Codex plugin-bundled hook loading requires \`${PLUGIN_BUNDLED_CODEX_HOOKS_FEATURE_FLAG} = true\` under \`[features]\`. The general \`${RECOMMENDED_CODEX_HOOKS_FEATURE_FLAG}\` flag covers non-plugin hook config and defaults on; \`${ALTERNATE_CODEX_HOOKS_FEATURE_FLAG}\` is deprecated and should not be treated as a plugin-bundled hook fallback. If bundled hooks do not activate, enable \`${PLUGIN_BUNDLED_CODEX_HOOKS_FEATURE_FLAG} = true\`, reload Codex, and retest in a trusted interactive session.`,
      file: 'pluxx.config.ts',
      platform: 'Codex',
    })
  }

  if (usesAlternateCodexHooksFeatureFlagOnly(features)) {
    pushIssue(issues, {
      level: 'warning',
      code: 'codex-hooks-legacy-feature-flag',
      message: `\`${ALTERNATE_CODEX_HOOKS_FEATURE_FLAG}\` is deprecated for general Codex hook config and should not be treated as a plugin-bundled hook fallback. Keep it only as a compatibility fallback for non-plugin hook wiring, prefer \`${RECOMMENDED_CODEX_HOOKS_FEATURE_FLAG} = true\` there, and use \`${PLUGIN_BUNDLED_CODEX_HOOKS_FEATURE_FLAG} = true\` for plugin-bundled hooks.`,
      file: 'pluxx.config.ts',
      platform: 'Codex',
    })
  }

  if (!hasPluxxCodexPluginHooksFlag && isCodexHooksFeatureEnabled(features)) {
    pushIssue(issues, {
      level: 'warning',
      code: 'codex-hooks-general-feature-flag-only',
      message: `This Codex config enables only general hook flags. Plugin-bundled hooks at \`hooks/hooks.json\` still need \`${PLUGIN_BUNDLED_CODEX_HOOKS_FEATURE_FLAG} = true\` under \`[features]\`; \`${RECOMMENDED_CODEX_HOOKS_FEATURE_FLAG}\` and \`${ALTERNATE_CODEX_HOOKS_FEATURE_FLAG}\` alone are not sufficient.`,
      file: 'pluxx.config.ts',
      platform: 'Codex',
    })
  }
}

function lintRuntimeReadiness(config: PluginConfig, issues: LintIssue[]): void {
  const readinessPlan = getRuntimeReadinessPlan(config.readiness)
  if (!readinessPlan.hasReadiness || !config.readiness) return
  const codexReadinessCapability = config.targets.includes('codex')
    ? getRuntimeReadinessCapability('codex')
    : null

  const hasMcpGate = config.readiness.gates.some((gate) => gate.applyTo.includes('mcp-tools'))
  const hasCommandGate = config.readiness.gates.some((gate) => gate.applyTo.includes('commands'))

  if (hasMcpGate && (!config.mcp || Object.keys(config.mcp).length === 0)) {
    pushIssue(issues, {
      level: 'warning',
      code: 'readiness-mcp-target-without-mcp',
      message: 'Runtime readiness targets `mcp-tools`, but this plugin does not configure any MCP servers.',
      file: 'pluxx.config.ts',
      platform: 'Runtime',
    })
  }

  if (hasCommandGate && !config.commands) {
    pushIssue(issues, {
      level: 'warning',
      code: 'readiness-commands-target-without-commands',
      message: 'Runtime readiness targets `commands`, but this plugin does not define a commands directory.',
      file: 'pluxx.config.ts',
      platform: 'Runtime',
    })
  }

  if (readinessPlan.hasNamedPromptTargets) {
    pushIssue(issues, {
      level: 'warning',
      code: 'readiness-prompt-target-best-effort',
      message: getRuntimeReadinessNamedPromptTargetNote(),
      file: 'pluxx.config.ts',
      platform: 'Runtime',
    })
  }

  if (codexReadinessCapability && !codexReadinessCapability.bundleEnforced) {
    pushIssue(issues, {
      level: 'warning',
      code: 'codex-readiness-external-config',
      message: `${getRuntimeReadinessExternalConfigNote()} Pluxx emits ${codexReadinessCapability.companionArtifacts.join(' plus ')} so you can verify the bundled hook translation and debug activation if the host feature gate is still required.`,
      file: 'pluxx.config.ts',
      platform: 'Codex',
    })
  }
}

// ── Cursor-specific hook + frontmatter checks (fixes failing test) ──
function lintCursorHooks(config: PluginConfig, issues: LintIssue[]): void {
  if (!config.targets.includes('cursor') || !config.hooks) return
  const supportedCursorEvents = getSupportedHookEvents('cursor')
  const unsupportedCursorEventReason = getUnsupportedHookEventReason('cursor')

  for (const [hookEvent, hookEntries] of Object.entries(config.hooks)) {
    if (!isHookEventSupported('cursor', hookEvent)) {
      pushIssue(issues, {
        level: 'warning',
        code: 'cursor-hook-event-unknown',
        message: unsupportedCursorEventReason
          ? `Cursor does not support hook event "${hookEvent}". ${unsupportedCursorEventReason}`
          : `Cursor does not support hook event "${hookEvent}". Supported: ${supportedCursorEvents.join(', ')}`,
        file: 'pluxx.config.ts',
        platform: 'Cursor',
      })
    }

    if (!Array.isArray(hookEntries)) continue
    for (const entry of hookEntries) {
      if (!entry || typeof entry !== 'object') continue
      const rec = entry as Record<string, unknown>

      if (typeof rec.type === 'string' && !isHookTypeSupported('cursor', rec.type as 'command' | 'http' | 'mcp_tool' | 'prompt' | 'agent')) {
        const issue = getHookTypeTranslationIssue('cursor', rec.type as 'http' | 'mcp_tool' | 'prompt' | 'agent')
        pushIssue(issues, {
          level: 'warning',
          code: issue?.code ?? 'cursor-hook-type-unsupported',
          message: issue?.message
            ?? `Cursor does not document hook type "${String(rec.type)}". Pluxx currently preserves only command and prompt hooks on the Cursor hook surface.`,
          file: 'pluxx.config.ts',
          platform: 'Cursor',
        })
      }

      const cursorLoopLimitEvents = getHookFieldSupportedEvents('cursor', 'loop_limit')
      if (rec.loop_limit !== undefined && !cursorLoopLimitEvents.includes(hookEvent)) {
        pushIssue(issues, {
          level: 'warning',
          code: 'cursor-hook-loop-limit-unsupported-event',
          message: `Hook "${hookEvent}" has loop_limit but Cursor only supports loop_limit on ${cursorLoopLimitEvents.join(', ')}.`,
          file: 'pluxx.config.ts',
          platform: 'Cursor',
        })
      }
    }
  }
}

function lintCursorSkillFrontmatter(
  config: PluginConfig,
  skillFiles: string[],
  issues: LintIssue[],
  frontmatterCache: Map<string, ParsedFrontmatterFile>,
): void {
  const supportedByTarget = new Map(
    (['cursor', 'codex', 'opencode'] as const)
      .filter(target => config.targets.includes(target))
      .map((target) => {
        const rules = getPlatformRules(target)
        return [target, new Set([...rules.frontmatter.standard, ...rules.frontmatter.additional])] as const
      }),
  )
  if (supportedByTarget.size === 0) return

  for (const skillFile of skillFiles) {
    const { parsed } = getParsedFrontmatterFile(skillFile, frontmatterCache)
    if (!parsed.hasValidFrontmatter) continue

    for (const [key] of parsed.frontmatterFields) {
      for (const [target, supported] of supportedByTarget.entries()) {
        if (supported.has(key)) continue

        const issue = getSkillFrontmatterTranslationIssue(
          target,
          key,
          [...supported],
        )

        pushIssue(issues, {
          level: 'warning',
          file: skillFile,
          ...issue,
          platform: target === 'cursor' ? 'Cursor' : target === 'codex' ? 'Codex' : 'OpenCode',
        })
      }
    }
  }
}

function lintHookFieldTranslations(config: PluginConfig, issues: LintIssue[]): void {
  if (!config.hooks) return

  const hasPromptHooks = Object.values(config.hooks).some(entries =>
    (entries ?? []).some(entry => entry.type === 'prompt'),
  )
  const hasFailClosed = Object.values(config.hooks).some(entries =>
    (entries ?? []).some(entry => entry.failClosed !== undefined),
  )
  const hasLoopLimit = Object.values(config.hooks).some(entries =>
    (entries ?? []).some(entry => entry.loop_limit !== undefined),
  )

  if (hasPromptHooks) {
    if (config.targets.includes('claude-code')) {
      const warnedEvents = new Set<string>()
      for (const [event, entries] of Object.entries(config.hooks)) {
        if (!(entries ?? []).some(entry => entry.type === 'prompt')) continue
        const mappedEvent = mapHookEventToPascalCase(event)
        const issue = getPromptHookTranslationIssue('claude-code', mappedEvent)
        if (!issue || warnedEvents.has(mappedEvent)) continue

        warnedEvents.add(mappedEvent)
        pushIssue(issues, {
          level: 'warning',
          file: 'pluxx.config.ts',
          platform: 'claude-code',
          ...issue,
        })
      }
    }

    if (config.targets.includes('codex')) {
      const issue = getPromptHookTranslationIssue('codex')
      if (issue) {
        pushIssue(issues, {
          level: 'warning',
          file: 'pluxx.config.ts',
          platform: 'codex',
          ...issue,
        })
      }
    }

    if (config.targets.includes('opencode')) {
      const issue = getPromptHookTranslationIssue('opencode')
      if (issue) {
        pushIssue(issues, {
          level: 'warning',
          file: 'pluxx.config.ts',
          platform: 'opencode',
          ...issue,
        })
      }
    }
  }

  if (hasFailClosed && config.targets.includes('claude-code')) {
    const issue = getHookFieldTranslationIssue('claude-code', 'failClosed')
    if (issue) {
      pushIssue(issues, {
        level: 'warning',
        file: 'pluxx.config.ts',
        platform: 'claude-code',
        ...issue,
      })
    }
  }

  if (hasFailClosed && config.targets.includes('codex')) {
    const issue = getHookFieldTranslationIssue('codex', 'failClosed')
    if (issue) {
      pushIssue(issues, {
        level: 'warning',
        file: 'pluxx.config.ts',
        platform: 'codex',
        ...issue,
      })
    }
  }

  if (hasLoopLimit) {
    if (config.targets.includes('claude-code')) {
      const issue = getHookFieldTranslationIssue('claude-code', 'loop_limit')
      if (issue) {
        pushIssue(issues, {
          level: 'warning',
          file: 'pluxx.config.ts',
          platform: 'claude-code',
          ...issue,
        })
      }
    }

    if (config.targets.includes('codex')) {
      const issue = getHookFieldTranslationIssue('codex', 'loop_limit')
      if (issue) {
        pushIssue(issues, {
          level: 'warning',
          file: 'pluxx.config.ts',
          platform: 'codex',
          ...issue,
        })
      }
    }

    if (config.targets.includes('opencode')) {
      const issue = getHookFieldTranslationIssue('opencode', 'loop_limit')
      if (issue) {
        pushIssue(issues, {
          level: 'warning',
          file: 'pluxx.config.ts',
          platform: 'opencode',
          ...issue,
        })
      }
    }
  }
}

function lintHookTypeTranslations(config: PluginConfig, issues: LintIssue[]): void {
  if (!config.hooks) return

  const seen = new Set<string>()

  for (const entries of Object.values(config.hooks)) {
    for (const entry of entries ?? []) {
      if (!entry.type || entry.type === 'command') continue

      for (const target of ['codex', 'opencode'] as const) {
        if (!config.targets.includes(target) || isHookTypeSupported(target, entry.type)) continue

        const key = `${target}:${entry.type}`
        if (seen.has(key)) continue
        seen.add(key)

        const issue = getHookTypeTranslationIssue(target, entry.type)
        if (!issue) continue

        pushIssue(issues, {
          level: 'warning',
          file: 'pluxx.config.ts',
          platform: target,
          ...issue,
        })
      }
    }
  }
}

function lintCodexCommandGuidance(config: PluginConfig, issues: LintIssue[]): void {
  if (!config.targets.includes('codex') || !config.commands) return

  pushIssue(issues, {
    level: 'warning',
    code: 'codex-commands-routing-guidance',
    message: `${getCodexCommandGuidanceNote()} Pluxx will degrade commands into skills plus those routing surfaces today.`,
    file: 'pluxx.config.ts',
    platform: 'codex',
  })
}

function lintSkillListingBudgets(
  skillFiles: string[],
  targets: TargetPlatform[],
  issues: LintIssue[],
  frontmatterCache: Map<string, ParsedFrontmatterFile>,
): void {
  for (const target of targets) {
    const budget = PLATFORM_LIMITS[target].skillListingBudgetMax
    if (budget === null) continue

    let total = 0
    for (const skillFile of skillFiles) {
      const { parsed } = getParsedFrontmatterFile(skillFile, frontmatterCache)
      if (!parsed.hasValidFrontmatter) continue
      const description = parsed.frontmatterFields.get('description')?.value
      if (description) total += description.length
    }

    if (total > budget) {
      pushIssue(issues, {
        level: 'warning',
        code: 'platform-skill-listing-budget',
        message: `Combined skill descriptions total ${total} characters, exceeding ${target} listing budget of ${budget} characters.`,
        file: 'skills/',
        platform: target,
      })
    }
  }
}

function lintCursorRuleContentLimits(config: PluginConfig, issues: LintIssue[]): void {
  if (!config.targets.includes('cursor')) return

  const maxLines = PLATFORM_LIMITS.cursor.rulesMaxLines
  if (maxLines === null) return

  for (const rule of config.platforms?.cursor?.rules ?? []) {
    const lineCount = (rule.content ?? '').split(/\r?\n/).length
    if (lineCount > maxLines) {
      pushIssue(issues, {
        level: 'warning',
        code: 'platform-rules-lines',
        message: `Cursor rule "${rule.description}" has ${lineCount} lines, exceeding the recommended max of ${maxLines} lines.`,
        file: 'pluxx.config.ts',
        platform: 'cursor',
      })
    }
  }
}

function lintPermissions(config: PluginConfig, issues: LintIssue[]): void {
  if (!config.permissions) return

  for (const action of ['allow', 'ask', 'deny'] as const) {
    const seen = new Set<string>()
    for (const raw of config.permissions[action] ?? []) {
      const trimmed = raw.trim()

      if (seen.has(trimmed)) {
        pushIssue(issues, {
          level: 'warning',
          code: 'permissions-duplicate',
          message: `Permission rule "${trimmed}" is duplicated in "${action}".`,
          file: 'pluxx.config.ts',
          platform: 'Permissions',
        })
      }

      seen.add(trimmed)
    }
  }

  const rules = collectPermissionRules(config.permissions)
  const seen = new Map<string, Set<string>>()

  for (const rule of rules) {
    const key = `${rule.kind}:${rule.pattern}`
    const actions = seen.get(key) ?? new Set<string>()
    actions.add(rule.action)
    seen.set(key, actions)
  }

  for (const [key, actions] of seen) {
    if (actions.size > 1) {
      pushIssue(issues, {
        level: 'warning',
        code: 'permissions-conflict',
        message: `Permission rule "${key}" is declared in multiple actions (${Array.from(actions).join(', ')}). Deny should win, but this intent should be made explicit.`,
        file: 'pluxx.config.ts',
        platform: 'Permissions',
      })
    }
  }

  if (config.targets.includes('codex')) {
    pushIssue(issues, {
      level: 'warning',
      code: 'codex-permissions-external-config',
      message: 'Codex does not currently support plugin-packaged permission enforcement. For real enforcement, merge .codex/config.generated.toml into active Codex config when Pluxx can materialize live-proven MCP approval stanzas, and use .codex/permissions.generated.json as the broader mirror for selectors that still remain external.',
      file: 'pluxx.config.ts',
      platform: 'Codex',
    })
  }

  if (config.targets.includes('cursor')) {
    const cursorNuance: string[] = []
    if (rules.some(rule => rule.kind === 'Skill')) cursorNuance.push('Skill(...)')
    if (rules.some(rule => rule.kind === 'MCP')) cursorNuance.push('MCP(...)')

    if (cursorNuance.length > 0) {
      pushIssue(issues, {
        level: 'warning',
        code: 'cursor-permissions-translation',
        message: `Cursor permission intent is split across generated hooks, CLI permission config, and subagent/tool framing. ${cursorNuance.join(' and ')} selectors are especially important to verify because they do not map to one first-class native Cursor permission field.`,
        file: 'pluxx.config.ts',
        platform: 'Cursor',
      })
    }
  }

  if (rules.some(rule => rule.kind === 'Skill')) {
    const limitedTargets = config.targets.filter(target => !['claude-code', 'codex', 'opencode'].includes(target))
    if (limitedTargets.length > 0) {
      pushIssue(issues, {
        level: 'warning',
        code: 'permissions-skill-selector-limited',
        message: `Skill(...) permission rules do not have the same native support on ${limitedTargets.join(', ')} and will require downgrade or translation there.`,
        file: 'pluxx.config.ts',
        platform: 'Permissions',
      })
    }
  }

  if (config.targets.includes('opencode') && permissionRulesNeedToolLevelDowngrade(config.permissions)) {
    pushIssue(issues, {
      level: 'warning',
      code: 'permissions-opencode-downgrade',
      message: 'OpenCode now preserves most canonical permission selectors natively, but MCP(...) rules still translate through OpenCode tool-name patterns and should be verified against the configured MCP server names.',
      file: 'pluxx.config.ts',
      platform: 'OpenCode',
    })
  }
}

function lintCodexAgentMcpInheritance(config: PluginConfig, issues: LintIssue[]): void {
  if (!config.targets.includes('codex')) return
  if (!config.agents) return
  if (!config.mcp || Object.keys(config.mcp).length === 0) return

  pushIssue(issues, {
    level: 'warning',
    code: 'codex-agent-mcp-inheritance',
    message: 'Codex custom agents currently inherit parent MCP servers from active project/user config. Maintained local probes now show that this still happens even when a custom agent explicitly sets `mcp_servers = {}`, and open upstream issue #20135 reports the same ceiling. Do not assume read-only or non-MCP agents are isolated from root MCP tools; keep the root MCP surface minimal, and use agent-local inline mcp_servers only when an agent truly needs a different native MCP shape.',
    file: 'pluxx.config.ts',
    platform: 'Codex',
  })
}

function isCoreFourPlatform(target: TargetPlatform): target is CoreFourPlatform {
  return CORE_FOUR_TARGETS.has(target as CoreFourPlatform)
}

function lintPrimitiveTranslations(config: PluginConfig, issues: LintIssue[]): void {
  const configuredBuckets = getConfiguredCompilerBuckets(config)

  for (const target of config.targets) {
    if (!isCoreFourPlatform(target)) continue

    const byMode = new Map<PrimitiveTranslationMode, string[]>()
    for (const bucket of configuredBuckets) {
      const capability = getCoreFourPrimitiveCapabilities(target).buckets[bucket]
      if (capability.mode === 'translate' && !LINT_TRANSLATION_WARNING_BUCKETS.has(bucket)) {
        continue
      }
      if (capability.mode === 'preserve') continue
      const buckets = byMode.get(capability.mode) ?? []
      buckets.push(bucket)
      byMode.set(capability.mode, buckets)
    }

    for (const [mode, buckets] of byMode) {
      const sortedBuckets = [...buckets].sort()
      const modeMessage = mode === 'translate'
        ? 'will be re-expressed through different native surfaces'
        : mode === 'degrade'
          ? 'will compile to weaker native equivalents'
          : 'have no truthful native equivalent and may be omitted'

      pushIssue(issues, {
        level: 'warning',
        code: `primitive-${mode}-summary`,
        message: `On ${target}, these active compiler buckets ${modeMessage}: ${sortedBuckets.join(', ')}.`,
        file: 'pluxx.config.ts',
        platform: target,
      })
    }
  }
}

function sortIssues(issues: LintIssue[]): LintIssue[] {
  return [...issues].sort((a, b) => {
    if (a.level === b.level) {
      return a.code.localeCompare(b.code)
    }
    return a.level === 'error' ? -1 : 1
  })
}

export async function lintProject(
  dir: string = process.cwd(),
  options: LintProjectOptions = {},
): Promise<LintResult> {
  const issues: LintIssue[] = []
  const frontmatterCache = new Map<string, ParsedFrontmatterFile>()

  let config: PluginConfig
  try {
    config = await loadConfig(dir)
  } catch (err) {
    pushIssue(issues, {
      level: 'error',
      code: 'config-invalid',
      message: err instanceof Error ? err.message : String(err),
      file: 'pluxx.config.ts',
      platform: 'Config',
    })
    return { errors: 1, warnings: 0, issues }
  }

  const lintConfig: PluginConfig = options.targets
    ? { ...config, targets: options.targets }
    : config

  // Plugin structure checks
  lintPluginName(lintConfig, issues)
  lintVersionFormat(lintConfig, issues)
  lintManifestPaths(lintConfig, issues)
  lintPluginDirectoryPlacement(dir, issues)
  lintAbsolutePaths(lintConfig, issues)
  lintSettingsJson(dir, issues)
  lintLegacyCommandsDir(dir, lintConfig, issues)

  // Hook and event validation
  lintHookEvents(lintConfig, issues)

  // Agent file checks
  const agentsDir = resolve(dir, lintConfig.agents ?? 'agents')
  const agentFiles = existsSync(agentsDir) ? collectMarkdownFiles(agentsDir) : []
  lintAgentFrontmatter(agentFiles, issues, frontmatterCache)
  lintAgentIsolation(agentFiles, issues, frontmatterCache)
  lintOpenCodeAgentFrontmatter(dir, { ...lintConfig, agents: lintConfig.agents ?? './agents/' }, issues)
  lintAgentTranslationExplainability(dir, { ...lintConfig, agents: lintConfig.agents ?? './agents/' }, issues)
  lintCommandTranslationExplainability(dir, lintConfig, issues)

  // MCP and brand
  lintMcpUrls(lintConfig, issues)
  lintMcpRuntimeState(dir, lintConfig, issues)
  lintInstallerOwnedRuntimeScripts(lintConfig, issues)
  lintGlobalMcpHostRootVariables(lintConfig, issues)
  lintBrandMetadata(lintConfig, issues)
  lintCodexOverrides(lintConfig, issues)
  lintCodexHookCompatibility(lintConfig, issues)
  lintCodexAgentsConfig(lintConfig, issues)
  lintCodexHooksExternalConfig(lintConfig, issues)
  lintRuntimeReadiness(lintConfig, issues)
  lintPermissions(lintConfig, issues)
  lintCodexAgentMcpInheritance(lintConfig, issues)
  lintPrimitiveTranslations(lintConfig, issues)
  lintHookFieldTranslations(lintConfig, issues)
  lintHookTypeTranslations(lintConfig, issues)
  lintCodexCommandGuidance(lintConfig, issues)

  // Cursor-specific checks
  lintCursorHooks(lintConfig, issues)
  lintCursorRuleContentLimits(lintConfig, issues)

  const skillsDir = resolve(dir, lintConfig.skills)
  let skillFiles: string[] = []
  if (!existsSync(skillsDir)) {
    pushIssue(issues, {
      level: 'error',
      code: 'skills-dir-missing',
      message: `Skills directory not found: ${lintConfig.skills}`,
      file: 'pluxx.config.ts',
      platform: 'Agent Skills',
    })
  } else {
    skillFiles = collectSkillFiles(skillsDir)
    if (skillFiles.length === 0) {
      pushIssue(issues, {
        level: 'warning',
        code: 'skills-none-found',
        message: `No SKILL.md files found in ${lintConfig.skills}`,
        file: 'pluxx.config.ts',
        platform: 'Agent Skills',
      })
    }

    for (const skillFile of skillFiles) {
      lintSkillFile(skillFile, lintConfig.targets, issues, frontmatterCache)
    }
  }

  // Cursor skill frontmatter checks
  lintCursorSkillFrontmatter(lintConfig, skillFiles, issues, frontmatterCache)
  lintSkillListingBudgets(skillFiles, lintConfig.targets, issues, frontmatterCache)

  // Platform limit checks for manifest prompts (Codex)
  lintManifestPromptLimits(lintConfig, issues)

  // Platform limit checks for instructions file size
  lintInstructionsFileLimits(lintConfig, dir, issues)

  // Platform limit checks for rules file line count
  lintRulesFileLimits(lintConfig, dir, issues)

  const sorted = sortIssues(issues)
  const visibleIssues = sorted.filter((issue) => !issue.code.startsWith('primitive-'))
  const errors = visibleIssues.filter(i => i.level === 'error').length
  const warnings = visibleIssues.filter(i => i.level === 'warning').length

  return {
    errors,
    warnings,
    issues: sorted,
    primitiveSummary: buildPrimitiveTranslationSummary(lintConfig, lintConfig.targets),
  }
}

export function printLintResult(result: LintResult, dir: string = process.cwd()): void {
  const visibleIssues = result.issues.filter((issue) => !issue.code.startsWith('primitive-'))

  for (const issue of visibleIssues) {
    const levelLabel = issue.level === 'error' ? 'ERROR' : 'WARN '
    const platformLabel = issue.platform ? `[${issue.platform}] ` : ''
    const loc = issue.file ? `${relative(dir, resolve(dir, issue.file))}: ` : ''
    console.log(`${levelLabel} ${issue.code} ${platformLabel}${loc}${issue.message}`)
  }

  const primitiveLines = renderPrimitiveTranslationSummary(result.primitiveSummary)
  if (primitiveLines.length > 0) {
    if (visibleIssues.length > 0) {
      console.log('')
    }
    for (const line of primitiveLines) {
      console.log(line)
    }
  }

  if (result.errors === 0 && result.warnings === 0) {
    console.log('No lint issues found.')
  } else {
    console.log('')
    console.log(`Lint summary: ${result.errors} error(s), ${result.warnings} warning(s)`)
  }
}

export async function runLint(dir: string = process.cwd()): Promise<number> {
  const result = await lintProject(dir)
  printLintResult(result, dir)
  return result.errors > 0 ? 1 : 0
}
