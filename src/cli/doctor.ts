import { spawn, spawnSync } from 'child_process'
import { accessSync, constants, existsSync, lstatSync, readFileSync, readdirSync, realpathSync } from 'fs'
import { homedir } from 'os'
import { basename, dirname, resolve } from 'path'
import { CONFIG_FILES, loadConfig } from '../config/load'
import { findInstalledBundleIntegrityIssues, listHookCommands } from './install'
import { PLATFORM_LIMITS, getCoreFourPrimitiveCapabilities, type CoreFourPlatform, type PrimitiveTranslationMode } from '../validation/platform-rules'
import { getConfiguredCompilerBuckets, type McpServer, type PluginConfig, type TargetPlatform } from '../schema'
import { PLUXX_COMPILER_INTENT_PATH, readCompilerIntent } from '../compiler-intent'
import { MCP_SCAFFOLD_METADATA_PATH, type McpScaffoldMetadata } from './init-from-mcp'
import { buildPrimitiveTranslationSummary, renderPrimitiveTranslationSummary, type PrimitiveTranslationSummary } from './primitive-summary'
import { isPlaceholderSecretValue } from '../user-config'
import { getBrandingCompletenessWarnings } from '../branding-completeness'
import { findLeakedPluginRootVars } from '../mcp-stdio-paths'
import { getRuntimeReadinessPlan } from '../readiness'
import {
  getConsumerEnvScriptActiveDetail,
  getConsumerEnvScriptMissingDetail,
  getConsumerRuntimeScriptRolesDetail,
  getRuntimeScriptRoleForPath,
  INSTALLER_OWNED_CHECK_ENV_PATH,
  type RuntimeScriptRole,
} from '../runtime-script-contract'
import {
  getRuntimeReadinessCapability,
  getRuntimeReadinessExternalConfigNote,
  getRuntimeReadinessNamedPromptTargetNote,
} from '../runtime-readiness-registry'
import {
  ALTERNATE_CODEX_HOOKS_FEATURE_FLAG,
  getCodexHooksFeatureState,
  PLUGIN_BUNDLED_CODEX_HOOKS_FEATURE_FLAG,
  RECOMMENDED_CODEX_HOOKS_FEATURE_FLAG,
} from '../codex-hooks-feature'
import {
  parseCodexApprovedMcpToolsFromToml,
  type CodexMcpApprovalEntry,
} from '../codex-permissions-companion'
import type { ParsedPermissionRule } from '../permissions'
import { parseTomlValue, stripTomlComment } from '../toml-lite'

export type DoctorLevel = 'error' | 'warning' | 'info' | 'success'

export interface DoctorCheck {
  level: DoctorLevel
  code: string
  title: string
  detail: string
  fix: string
  path?: string
}

export interface DoctorReport {
  ok: boolean
  errors: number
  warnings: number
  infos: number
  checks: DoctorCheck[]
  primitiveSummary?: PrimitiveTranslationSummary
}

const CORE_FOUR = new Set<TargetPlatform>(['claude-code', 'cursor', 'codex', 'opencode'])
const ENV_VAR_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/
const GENERIC_TOOL_NAME_PATTERNS = [
  /^tool[_-]?\d+$/i,
  /^function[_-]?\d+$/i,
  /^action[_-]?\d+$/i,
  /^untitled/i,
  /^mcp[-_]?tool/i,
]
const LOW_INFO_DESCRIPTION_PATTERNS = [
  /^n\/?a$/i,
  /^none$/i,
  /^todo$/i,
  /^tbd$/i,
  /^description$/i,
  /^no description provided\.?$/i,
]
const MATERIALIZED_ENV_MARKER = 'materialized required config'
const MIN_NODE_MAJOR = 18
const STDIO_LAUNCH_SMOKE_TIMEOUT_MS = 1200

const PRIMITIVE_MODE_LEVEL: Record<PrimitiveTranslationMode, DoctorLevel> = {
  preserve: 'success',
  translate: 'info',
  degrade: 'warning',
  drop: 'warning',
}

type ConsumerPlatform = 'claude-code' | 'cursor' | 'codex' | 'opencode'

interface ConsumerBundleLayout {
  kind: 'installed-platform'
  platform: ConsumerPlatform
  manifestPath: string
  mcpConfigPath?: string
}

export interface DoctorConsumerOptions {
  projectRoot?: string
}

interface InstalledStdioLaunchResult {
  serverName: string
  command: string
  ok: boolean
  detail: string
}

interface InstalledPermissionProbe {
  action: 'allow' | 'ask' | 'deny'
  raw: string
  mode: string
  event: Record<string, unknown>
}

interface CodexConfigCandidate {
  path: string
  scope: 'project' | 'user'
}

interface CodexHooksFeatureProbe extends CodexConfigCandidate {
  exists: boolean
  enabled: boolean
  pluginBundledEnabled: boolean
  recommendedEnabled: boolean
  alternateEnabled: boolean
  parseError?: string
}

interface CodexMcpApprovalProbe extends CodexConfigCandidate {
  exists: boolean
  approvals: CodexMcpApprovalEntry[]
  parseError?: string
}

interface CodexProjectTrustProbe {
  path: string
  exists: boolean
  trusted: boolean
  matchedProjectPaths: string[]
  parseError?: string
}

interface ClaudeSettingsCandidate {
  path: string
  scope: 'managed' | 'user' | 'project' | 'local'
}

interface ClaudeDisableAllHooksProbe extends ClaudeSettingsCandidate {
  exists: boolean
  disableAllHooks: boolean
  parseError?: string
}

function renderInstalledPluginRoot(value: string, rootDir: string): string {
  return value
    .replaceAll('${PLUGIN_ROOT}', rootDir)
    .replaceAll('${CLAUDE_PLUGIN_ROOT}', rootDir)
    .replaceAll('${CURSOR_PLUGIN_ROOT}', rootDir)
    .replaceAll('${CODEX_PLUGIN_ROOT}', rootDir)
    .replaceAll('${OPENCODE_PLUGIN_ROOT}', rootDir)
}

type ConsumerLayoutDetection =
  | ConsumerBundleLayout
  | { kind: 'source-project' }
  | { kind: 'multi-target-dist' }
  | { kind: 'unknown' }

function addCheck(checks: DoctorCheck[], check: DoctorCheck): void {
  checks.push(check)
}

function summarizeChecks(checks: DoctorCheck[]): DoctorReport {
  const visibleChecks = checks.filter((check) => !check.code.startsWith('primitive-'))
  const errors = visibleChecks.filter((check) => check.level === 'error').length
  const warnings = visibleChecks.filter((check) => check.level === 'warning').length
  const infos = visibleChecks.filter((check) => check.level === 'info').length

  return {
    ok: errors === 0,
    errors,
    warnings,
    infos,
    checks,
  }
}

function parseMajorVersion(version: string | undefined): number | null {
  if (!version) return null
  const match = version.match(/^(\d+)/)
  return match ? Number(match[1]) : null
}

function addRuntimeChecks(checks: DoctorCheck[], mode: 'project' | 'consumer'): void {
  const nodeVersion = process.versions.node
  const nodeMajor = parseMajorVersion(nodeVersion)
  const doctorCommand = mode === 'consumer' ? 'pluxx doctor --consumer' : 'pluxx doctor'

  if (!nodeVersion || nodeMajor === null || nodeMajor < MIN_NODE_MAJOR) {
    addCheck(checks, {
      level: 'error',
      code: 'node-version-unsupported',
      title: 'Unsupported Node runtime',
      detail: nodeVersion
        ? `Detected Node ${nodeVersion}. The published pluxx CLI requires Node >= ${MIN_NODE_MAJOR}.`
        : `Could not detect a supported Node runtime. The published pluxx CLI requires Node >= ${MIN_NODE_MAJOR}.`,
      fix: `Install Node ${MIN_NODE_MAJOR}+ and rerun ${doctorCommand}.`,
    })
  } else {
    addCheck(checks, {
      level: 'success',
      code: 'node-version',
      title: 'Supported Node runtime detected',
      detail: `Node ${nodeVersion} is available for published pluxx CLI commands.`,
      fix: 'No action needed.',
    })
  }
}

function checkReadablePath(
  checks: DoctorCheck[],
  rootDir: string,
  label: string,
  configuredPath: string | undefined,
  required: boolean,
): void {
  if (!configuredPath) {
    if (required) {
      addCheck(checks, {
        level: 'error',
        code: 'path-missing',
        title: `${label} path missing`,
        detail: `The config does not define a ${label.toLowerCase()} path.`,
        fix: `Add a valid ${label.toLowerCase()} path to pluxx.config.ts.`,
        path: 'pluxx.config.ts',
      })
    }
    return
  }

  const resolvedPath = resolve(rootDir, configuredPath)
  if (!existsSync(resolvedPath)) {
    addCheck(checks, {
      level: 'error',
      code: 'path-not-found',
      title: `${label} path not found`,
      detail: `Configured ${label.toLowerCase()} path does not exist: ${configuredPath}`,
      fix: `Create ${configuredPath} or update the path in pluxx.config.ts.`,
      path: configuredPath,
    })
    return
  }

  try {
    accessSync(resolvedPath, constants.R_OK)
    addCheck(checks, {
      level: 'success',
      code: 'path-readable',
      title: `${label} path readable`,
      detail: `${configuredPath} is present and readable.`,
      fix: 'No action needed.',
      path: configuredPath,
    })
  } catch {
    addCheck(checks, {
      level: 'error',
      code: 'path-unreadable',
      title: `${label} path unreadable`,
      detail: `Configured ${label.toLowerCase()} path is not readable: ${configuredPath}`,
      fix: `Adjust permissions on ${configuredPath}.`,
      path: configuredPath,
    })
  }
}

function checkTargetPlatforms(checks: DoctorCheck[], config: PluginConfig): void {
  const betaTargets = config.targets.filter((target) => !CORE_FOUR.has(target))

  if (betaTargets.length === 0) {
    addCheck(checks, {
      level: 'success',
      code: 'targets-core-four',
      title: 'Core-four target set',
      detail: `Configured targets stay within the primary launch path: ${config.targets.join(', ')}`,
      fix: 'No action needed.',
      path: 'pluxx.config.ts',
    })
    return
  }

  addCheck(checks, {
    level: 'warning',
    code: 'targets-beta',
    title: 'Beta targets configured',
    detail: `These targets are generated but less validated: ${betaTargets.join(', ')}`,
    fix: 'Prefer claude-code, cursor, codex, and opencode for prime-time support.',
    path: 'pluxx.config.ts',
  })
}

function isCoreFourPlatform(target: TargetPlatform): target is CoreFourPlatform {
  return CORE_FOUR.has(target)
}

function describePrimitiveTranslation(
  target: CoreFourPlatform,
  bucket: ReturnType<typeof getConfiguredCompilerBuckets>[number],
  mode: PrimitiveTranslationMode,
  nativeSurfaces: string[],
): { title: string; detail: string; fix: string } {
  const surfaceList = nativeSurfaces.join(', ')

  switch (mode) {
    case 'preserve':
      return {
        title: `${bucket} preserves on ${target}`,
        detail: `The active ${bucket} bucket maps directly to native ${target} surfaces: ${surfaceList}.`,
        fix: 'No action needed.',
      }
    case 'translate':
      return {
        title: `${bucket} translates on ${target}`,
        detail: `The active ${bucket} bucket is re-expressed for ${target} through native surfaces such as ${surfaceList}.`,
        fix: 'Review generated output if you rely on host-specific behavior in this bucket.',
      }
    case 'degrade':
      return {
        title: `${bucket} degrades on ${target}`,
        detail: `The active ${bucket} bucket only has a weaker ${target} equivalent. Pluxx falls back to native surfaces such as ${surfaceList}.`,
        fix: 'Expect reduced fidelity on this target and verify the generated output before shipping.',
      }
    case 'drop':
      return {
        title: `${bucket} drops on ${target}`,
        detail: `The active ${bucket} bucket has no truthful ${target} equivalent and may be omitted during compilation.`,
        fix: 'Redesign this bucket for portability or remove the target if this behavior is required.',
      }
  }
}

function checkPrimitiveTranslations(checks: DoctorCheck[], config: PluginConfig): void {
  const configuredBuckets = getConfiguredCompilerBuckets(config)

  for (const target of config.targets) {
    if (!isCoreFourPlatform(target)) continue

    const capabilities = getCoreFourPrimitiveCapabilities(target)
    for (const bucket of configuredBuckets) {
      const capability = capabilities.buckets[bucket]
      const description = describePrimitiveTranslation(
        target,
        bucket,
        capability.mode,
        capability.nativeSurfaces,
      )

      addCheck(checks, {
        level: PRIMITIVE_MODE_LEVEL[capability.mode],
        code: `primitive-${capability.mode}`,
        title: description.title,
        detail: description.detail,
        fix: description.fix,
        path: 'pluxx.config.ts',
      })
    }
  }
}

function checkRuntimeReadiness(checks: DoctorCheck[], config: PluginConfig): void {
  const readinessPlan = getRuntimeReadinessPlan(config.readiness)
  if (!readinessPlan.hasReadiness || !config.readiness) return
  const codexReadinessCapability = config.targets.includes('codex')
    ? getRuntimeReadinessCapability('codex')
    : null

  addCheck(checks, {
    level: 'success',
    code: 'runtime-readiness-configured',
    title: 'Runtime readiness primitive configured',
    detail: `Configured readiness dependencies: ${readinessPlan.dependencyIds.join(', ')}.`,
    fix: 'No action needed.',
    path: 'pluxx.config.ts',
  })

  if (readinessPlan.hasNamedPromptTargets) {
    addCheck(checks, {
      level: 'warning',
      code: 'runtime-readiness-prompt-scope',
      title: 'Named prompt-surface readiness is best-effort',
      detail: getRuntimeReadinessNamedPromptTargetNote(),
      fix: 'Prefer broad workflow-entry gating when exact per-command or per-skill interception matters.',
      path: 'pluxx.config.ts',
    })
  }

  if (codexReadinessCapability && !codexReadinessCapability.bundleEnforced) {
    addCheck(checks, {
      level: 'warning',
      code: 'runtime-readiness-codex-external',
      title: 'Codex readiness activation may still be feature-gated',
      detail: getRuntimeReadinessExternalConfigNote(),
      fix: `Keep ${codexReadinessCapability.companionArtifacts.join(' and ')} available when verifying the installed Codex bundle, and enable \`${RECOMMENDED_CODEX_HOOKS_FEATURE_FLAG} = true\` under \`[features]\` if bundled readiness does not activate.`,
      path: 'pluxx.config.ts',
    })
  }
}

function checkMcpServer(checks: DoctorCheck[], serverName: string, server: McpServer): void {
  const basePath = 'pluxx.config.ts'

  if (server.transport === 'stdio') {
    if (!server.command.trim()) {
      addCheck(checks, {
        level: 'error',
        code: 'mcp-stdio-command-empty',
        title: `MCP stdio command missing for ${serverName}`,
        detail: `The stdio MCP server "${serverName}" does not define a command.`,
        fix: `Set mcp.${serverName}.command to the executable used to start the server.`,
        path: basePath,
      })
    } else {
      addCheck(checks, {
        level: 'success',
        code: 'mcp-stdio-command',
        title: `MCP stdio command configured for ${serverName}`,
        detail: `The stdio MCP server "${serverName}" starts with "${server.command}".`,
        fix: 'No action needed.',
        path: basePath,
      })
    }

    for (const key of Object.keys(server.env ?? {})) {
      if (!ENV_VAR_NAME.test(key)) {
        addCheck(checks, {
          level: 'warning',
          code: 'mcp-env-key-invalid',
          title: `Invalid env var name for ${serverName}`,
          detail: `The env key "${key}" is not a shell-safe environment variable name.`,
          fix: `Rename ${key} to a shell-safe env var such as ${key.replace(/[^A-Za-z0-9_]/g, '_').toUpperCase()}.`,
          path: basePath,
        })
      }
    }
  } else {
    addCheck(checks, {
      level: 'success',
      code: 'mcp-remote-url',
      title: `Remote MCP URL configured for ${serverName}`,
      detail: `The ${server.transport.toUpperCase()} MCP server "${serverName}" points to ${server.url}.`,
      fix: 'No action needed.',
      path: basePath,
    })
  }

  if (server.auth?.type && server.auth.type !== 'none') {
    if (server.auth.type === 'platform') {
      addCheck(checks, {
        level: 'info',
        code: 'mcp-auth-platform',
        title: `Platform-managed auth declared for ${serverName}`,
        detail: `${serverName} expects native platform auth at runtime (${server.auth.mode}).`,
        fix: 'Complete the platform auth flow in Claude Code or Cursor before calling authenticated tools.',
        path: basePath,
      })
      return
    }

    if (!ENV_VAR_NAME.test(server.auth.envVar)) {
      addCheck(checks, {
        level: 'error',
        code: 'mcp-auth-env-invalid',
        title: `Invalid auth env var for ${serverName}`,
        detail: `Auth env var "${server.auth.envVar}" is not a valid shell environment variable name.`,
        fix: `Rename the env var for ${serverName} to a shell-safe name like ${server.auth.envVar.replace(/[^A-Za-z0-9_]/g, '_').toUpperCase()}.`,
        path: basePath,
      })
    } else {
      addCheck(checks, {
        level: 'info',
        code: 'mcp-auth-env',
        title: `Auth env var declared for ${serverName}`,
        detail: `${serverName} expects ${server.auth.envVar} to be provided at runtime.`,
        fix: `Export ${server.auth.envVar} before linting, building, or installing the generated plugin.`,
        path: basePath,
      })
    }
  }
}

function checkMcpConfig(checks: DoctorCheck[], config: PluginConfig): void {
  const servers = Object.entries(config.mcp ?? {})
  if (servers.length === 0) {
    addCheck(checks, {
      level: 'info',
      code: 'mcp-none-configured',
      title: 'No MCP servers configured',
      detail: 'This plugin does not currently define any MCP servers.',
      fix: 'No action needed unless this plugin should wrap an MCP server.',
      path: 'pluxx.config.ts',
    })
    return
  }

  for (const [serverName, server] of servers) {
    checkMcpServer(checks, serverName, server)
  }
}

function checkUserConfig(checks: DoctorCheck[], config: PluginConfig): void {
  const entries = config.userConfig ?? []
  if (entries.length === 0) {
    addCheck(checks, {
      level: 'info',
      code: 'user-config-none',
      title: 'No userConfig entries declared',
      detail: 'This plugin does not currently declare install-time config entries.',
      fix: 'No action needed unless this plugin needs install-time config or secret handling.',
      path: 'pluxx.config.ts',
    })
    return
  }

  const invalidEnvEntries = entries.filter((entry) => entry.envVar && !ENV_VAR_NAME.test(entry.envVar))
  if (invalidEnvEntries.length > 0) {
    addCheck(checks, {
      level: 'warning',
      code: 'user-config-env-invalid',
      title: 'Invalid userConfig env var name',
      detail: `${invalidEnvEntries.length} userConfig entr${invalidEnvEntries.length === 1 ? 'y' : 'ies'} use invalid env var names.`,
      fix: 'Rename the env var to a shell-safe name and keep userConfig aligned with the install/runtime config contract.',
      path: 'pluxx.config.ts',
    })
  }

  const secretEntriesWithoutEnv = entries.filter((entry) => entry.type === 'secret' && !entry.envVar)
  if (secretEntriesWithoutEnv.length > 0) {
    addCheck(checks, {
      level: 'warning',
      code: 'user-config-secret-missing-env',
      title: 'Secret userConfig entries should declare envVar',
      detail: `${secretEntriesWithoutEnv.length} secret userConfig entr${secretEntriesWithoutEnv.length === 1 ? 'y' : 'ies'} are missing envVar bindings.`,
      fix: 'Bind secret entries to env vars so Pluxx can persist and validate install-time config safely.',
      path: 'pluxx.config.ts',
    })
  }

  addCheck(checks, {
    level: 'info',
    code: 'user-config-declared',
    title: 'userConfig entries declared',
    detail: `${entries.length} install-time config entr${entries.length === 1 ? 'y' : 'ies'} are declared.`,
    fix: 'No action needed.',
    path: 'pluxx.config.ts',
  })
}

function checkHookTrust(checks: DoctorCheck[], config: PluginConfig): void {
  const commands = listHookCommands(config.hooks)
  if (commands.length === 0) {
    addCheck(checks, {
      level: 'success',
      code: 'hooks-no-commands',
      title: 'No command hooks configured',
      detail: 'This plugin does not define hook commands that execute shell code locally.',
      fix: 'No action needed.',
      path: 'pluxx.config.ts',
    })
    return
  }

  addCheck(checks, {
    level: 'warning',
    code: 'hooks-trust-required',
    title: 'Hook commands require install trust',
    detail: `This plugin defines local hook commands: ${commands.map((command) => `${command.event} -> ${command.command}`).join('; ')}`,
    fix: 'Review the commands carefully. Users will need to opt in with pluxx install --trust.',
    path: 'pluxx.config.ts',
  })
}

function checkBrandMetadataCompleteness(checks: DoctorCheck[], config: PluginConfig): void {
  for (const warning of getBrandingCompletenessWarnings(config)) {
    addCheck(checks, {
      level: 'warning',
      code: warning.code,
      title: warning.title,
      detail: warning.message,
      fix: warning.fix,
      path: 'pluxx.config.ts',
    })
  }
}

function isSafeManagedPath(path: string): boolean {
  return path !== '' && !path.startsWith('/') && !path.includes('..')
}

function formatSampleNames(values: string[]): string {
  if (values.length === 0) return 'none'
  const sample = values.slice(0, 3)
  return values.length > sample.length
    ? `${sample.join(', ')} (+${values.length - sample.length} more)`
    : sample.join(', ')
}

function normalizeMetadataText(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

function isLowInfoDescription(description: string): boolean {
  const normalizedDescription = normalizeMetadataText(description)
  return LOW_INFO_DESCRIPTION_PATTERNS.some((pattern) => pattern.test(normalizedDescription))
}

function checkMcpMetadataQuality(checks: DoctorCheck[], metadata: McpScaffoldMetadata): void {
  const tools = metadata.tools ?? []
  if (tools.length === 0) {
    return
  }

  const missingDescription = tools
    .filter((tool) => !tool.description || tool.description.trim() === '')
    .map((tool) => tool.name)
  const lowInfoDescription = tools
    .filter((tool) => {
      const description = tool.description?.trim()
      if (!description) return false
      return isLowInfoDescription(description)
    })
    .map((tool) => tool.name)
  const genericNames = tools
    .filter((tool) => GENERIC_TOOL_NAME_PATTERNS.some((pattern) => pattern.test(tool.name.trim())))
    .map((tool) => tool.name)

  const findings: string[] = []
  if (missingDescription.length > 0) {
    findings.push(`missing descriptions: ${formatSampleNames(missingDescription)}`)
  }
  if (lowInfoDescription.length > 0) {
    findings.push(`low-information descriptions: ${formatSampleNames(lowInfoDescription)}`)
  }
  if (genericNames.length > 0) {
    findings.push(`generic tool names: ${formatSampleNames(genericNames)}`)
  }

  if (findings.length === 0) {
    addCheck(checks, {
      level: 'success',
      code: 'mcp-metadata-quality-ok',
      title: 'MCP metadata quality looks strong',
      detail: `Tool metadata quality checks passed for ${tools.length} tool(s).`,
      fix: 'No action needed.',
      path: MCP_SCAFFOLD_METADATA_PATH,
    })
    return
  }

  addCheck(checks, {
    level: 'warning',
    code: 'mcp-metadata-quality-weak',
    title: 'MCP metadata quality is weak in scaffold source',
    detail: `Weak metadata signals detected across ${tools.length} tool(s): ${findings.join('; ')}`,
    fix: 'Before publishing, run `pluxx agent run review` and refine generated sections with concrete tool descriptions and product-shaped naming.',
    path: MCP_SCAFFOLD_METADATA_PATH,
  })
}

function checkCompilerIntent(checks: DoctorCheck[], rootDir: string): void {
  try {
    const compilerIntent = readCompilerIntent(rootDir)
    if (!compilerIntent) return

    if ((compilerIntent.skillPolicies?.length ?? 0) === 0) {
      addCheck(checks, {
        level: 'info',
        code: 'compiler-intent-empty',
        title: 'Compiler intent file present',
        detail: `${PLUXX_COMPILER_INTENT_PATH} exists but does not currently carry migrated source-host policy rows.`,
        fix: 'No action needed unless you expected migrated source-host policy to survive into generated outputs.',
        path: PLUXX_COMPILER_INTENT_PATH,
      })
      return
    }

    const sourceLabels = [...new Set(
      compilerIntent.skillPolicies.map((policy) => `${policy.source.platform}:${policy.source.kind}`),
    )]

    addCheck(checks, {
      level: 'info',
      code: 'compiler-intent-source-host',
      title: 'Imported source-host intent still influences compilation',
      detail: `${PLUXX_COMPILER_INTENT_PATH} preserves ${compilerIntent.skillPolicies.length} migrated skill polic${compilerIntent.skillPolicies.length === 1 ? 'y' : 'ies'} from ${sourceLabels.join(', ')} so Pluxx can translate that source-host intent into native target surfaces.`,
      fix: 'Review the generated permissions, agents, and host companions to confirm the migrated source-host assumptions still match the plugin you want to ship.',
      path: PLUXX_COMPILER_INTENT_PATH,
    })
  } catch (error) {
    addCheck(checks, {
      level: 'warning',
      code: 'compiler-intent-invalid',
      title: 'Compiler intent file could not be parsed',
      detail: error instanceof Error ? error.message : String(error),
      fix: `Repair or remove ${PLUXX_COMPILER_INTENT_PATH} and rerun pluxx doctor.`,
      path: PLUXX_COMPILER_INTENT_PATH,
    })
  }
}

function checkScaffoldMetadata(checks: DoctorCheck[], rootDir: string, config: PluginConfig): void {
  const metadataPath = resolve(rootDir, MCP_SCAFFOLD_METADATA_PATH)
  if (!existsSync(metadataPath)) {
    addCheck(checks, {
      level: 'info',
      code: 'mcp-metadata-missing',
      title: 'No MCP scaffold metadata found',
      detail: `No ${MCP_SCAFFOLD_METADATA_PATH} file was found in this project.`,
      fix: 'No action needed unless this project was created with pluxx init --from-mcp.',
      path: MCP_SCAFFOLD_METADATA_PATH,
    })
    return
  }

  try {
    const metadata = JSON.parse(readFileSync(metadataPath, 'utf-8')) as McpScaffoldMetadata
    const invalidManaged = metadata.managedFiles.filter((path) => !isSafeManagedPath(path))
    if (metadata.version !== 1) {
      addCheck(checks, {
        level: 'warning',
        code: 'mcp-metadata-version',
        title: 'Unexpected MCP scaffold metadata version',
        detail: `Found scaffold metadata version ${String(metadata.version)}.`,
        fix: 'Re-run pluxx sync --from-mcp to refresh the scaffold metadata.',
        path: MCP_SCAFFOLD_METADATA_PATH,
      })
    } else if (invalidManaged.length > 0) {
      addCheck(checks, {
        level: 'error',
        code: 'mcp-metadata-managed-paths',
        title: 'Unsafe managed file paths in MCP metadata',
        detail: `Managed file list contains unsafe relative paths: ${invalidManaged.join(', ')}`,
        fix: 'Re-run pluxx init --from-mcp or pluxx sync --from-mcp to regenerate the metadata.',
        path: MCP_SCAFFOLD_METADATA_PATH,
      })
    } else {
      addCheck(checks, {
        level: 'success',
        code: 'mcp-metadata-valid',
        title: 'MCP scaffold metadata parsed successfully',
        detail: `Managed scaffold metadata is present with ${metadata.managedFiles.length} managed files.`,
        fix: 'No action needed.',
        path: MCP_SCAFFOLD_METADATA_PATH,
      })
    }

    if (metadata.settings.pluginName !== config.name) {
      addCheck(checks, {
        level: 'warning',
        code: 'mcp-metadata-plugin-mismatch',
        title: 'MCP scaffold metadata name mismatch',
        detail: `Metadata was generated for "${metadata.settings.pluginName}" but the config name is "${config.name}".`,
        fix: 'If this plugin was renamed, run pluxx sync --from-mcp to refresh generated metadata.',
        path: MCP_SCAFFOLD_METADATA_PATH,
      })
    }

    checkMcpMetadataQuality(checks, metadata)
  } catch (error) {
    addCheck(checks, {
      level: 'error',
      code: 'mcp-metadata-invalid',
      title: 'MCP scaffold metadata is not parseable',
      detail: error instanceof Error ? error.message : String(error),
      fix: `Repair or delete ${MCP_SCAFFOLD_METADATA_PATH}, then re-run pluxx init --from-mcp or pluxx sync --from-mcp.`,
      path: MCP_SCAFFOLD_METADATA_PATH,
    })
  }
}

function detectConsumerLayout(rootDir: string): ConsumerLayoutDetection {
  if (existsSync(resolve(rootDir, '.claude-plugin/plugin.json'))) {
    return {
      kind: 'installed-platform',
      platform: 'claude-code',
      manifestPath: '.claude-plugin/plugin.json',
      mcpConfigPath: '.mcp.json',
    }
  }

  if (existsSync(resolve(rootDir, '.cursor-plugin/plugin.json'))) {
    return {
      kind: 'installed-platform',
      platform: 'cursor',
      manifestPath: '.cursor-plugin/plugin.json',
      mcpConfigPath: 'mcp.json',
    }
  }

  if (existsSync(resolve(rootDir, '.codex-plugin/plugin.json'))) {
    return {
      kind: 'installed-platform',
      platform: 'codex',
      manifestPath: '.codex-plugin/plugin.json',
      mcpConfigPath: '.mcp.json',
    }
  }

  const packagePath = resolve(rootDir, 'package.json')
  const indexPath = resolve(rootDir, 'index.ts')
  if (existsSync(packagePath) && existsSync(indexPath)) {
    try {
      const pkg = JSON.parse(readFileSync(packagePath, 'utf-8')) as {
        peerDependencies?: Record<string, string>
        keywords?: string[]
      }
      if (pkg.peerDependencies?.['@opencode-ai/plugin'] || pkg.keywords?.includes('opencode-plugin')) {
        return {
          kind: 'installed-platform',
          platform: 'opencode',
          manifestPath: 'package.json',
        }
      }
    } catch {
      return {
        kind: 'installed-platform',
        platform: 'opencode',
        manifestPath: 'package.json',
      }
    }
  }

  if (CONFIG_FILES.some((filename) => existsSync(resolve(rootDir, filename)))) {
    return { kind: 'source-project' }
  }

  if (['claude-code', 'cursor', 'codex', 'opencode'].some((dir) => existsSync(resolve(rootDir, dir)))) {
    return { kind: 'multi-target-dist' }
  }

  return { kind: 'unknown' }
}

function readJsonFile<T>(rootDir: string, relativePath: string): T {
  return JSON.parse(readFileSync(resolve(rootDir, relativePath), 'utf-8')) as T
}

function listCodexConfigCandidates(projectRoot: string | undefined): CodexConfigCandidate[] {
  const projectCandidate = resolve(projectRoot ?? process.cwd(), '.codex/config.toml')
  const homeDir = process.env.HOME?.trim() || homedir()
  const codexHome = process.env.CODEX_HOME?.trim() || resolve(homeDir, '.codex')
  const userCandidate = resolve(codexHome, 'config.toml')

  const seen = new Set<string>()
  const candidates: CodexConfigCandidate[] = []
  for (const candidate of [
    { path: projectCandidate, scope: 'project' as const },
    { path: userCandidate, scope: 'user' as const },
  ]) {
    if (seen.has(candidate.path)) continue
    seen.add(candidate.path)
    candidates.push(candidate)
  }

  return candidates
}

function readCodexHooksFeatureFlag(filePath: string): ReturnType<typeof getCodexHooksFeatureState> | undefined {
  let inFeaturesTable = false
  const lines = readFileSync(filePath, 'utf-8').split(/\r?\n/)
  let pluginBundled: boolean | undefined
  let recommended: boolean | undefined
  let alternate: boolean | undefined

  const assignFeatureFlag = (key: string, rawValue: string): void => {
    const parsed = parseTomlValue(rawValue.trim())
    if (typeof parsed !== 'boolean') return
    if (key === PLUGIN_BUNDLED_CODEX_HOOKS_FEATURE_FLAG) pluginBundled = parsed
    if (key === RECOMMENDED_CODEX_HOOKS_FEATURE_FLAG) recommended = parsed
    if (key === ALTERNATE_CODEX_HOOKS_FEATURE_FLAG) alternate = parsed
  }

  for (const rawLine of lines) {
    const line = stripTomlComment(rawLine).trim()
    if (!line) continue

    const sectionMatch = line.match(/^\[(.+)\]$/)
    if (sectionMatch) {
      inFeaturesTable = sectionMatch[1].trim() === 'features'
      continue
    }

    const dottedFeatureMatch = line.match(/^features\.(plugin_hooks|hooks|codex_hooks)\s*=\s*(.+)$/)
    if (dottedFeatureMatch) {
      assignFeatureFlag(dottedFeatureMatch[1], dottedFeatureMatch[2])
      continue
    }

    const inlineFeaturesMatch = line.match(/^features\s*=\s*(.+)$/)
    if (inlineFeaturesMatch) {
      const parsed = parseTomlValue(inlineFeaturesMatch[1].trim())
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const featureState = getCodexHooksFeatureState(parsed as Record<string, unknown>)
        pluginBundled = featureState.pluginBundled
        recommended = featureState.recommended
        alternate = featureState.alternate
      }
      continue
    }

    if (!inFeaturesTable) continue
    const featureMatch = line.match(/^(plugin_hooks|hooks|codex_hooks)\s*=\s*(.+)$/)
    if (!featureMatch) continue
    assignFeatureFlag(featureMatch[1], featureMatch[2])
  }

  if (pluginBundled === undefined && recommended === undefined && alternate === undefined) return undefined
  return {
    pluginBundled: pluginBundled === true,
    recommended: recommended === true,
    alternate: alternate === true,
  }
}

function probeCodexHooksFeatureFlags(projectRoot: string | undefined): CodexHooksFeatureProbe[] {
  return listCodexConfigCandidates(projectRoot).map((candidate) => {
    if (!existsSync(candidate.path)) {
      return {
        ...candidate,
        exists: false,
        enabled: false,
        pluginBundledEnabled: false,
        recommendedEnabled: false,
        alternateEnabled: false,
      }
    }

    try {
      const featureState = readCodexHooksFeatureFlag(candidate.path)
      return {
        ...candidate,
        exists: true,
        enabled: featureState?.pluginBundled === true,
        pluginBundledEnabled: featureState?.pluginBundled === true,
        recommendedEnabled: featureState?.recommended === true,
        alternateEnabled: featureState?.alternate === true,
      }
    } catch (error) {
      return {
        ...candidate,
        exists: true,
        enabled: false,
        pluginBundledEnabled: false,
        recommendedEnabled: false,
        alternateEnabled: false,
        parseError: error instanceof Error ? error.message : String(error),
      }
    }
  })
}

function probeCodexMcpApprovalEntries(projectRoot: string | undefined): CodexMcpApprovalProbe[] {
  return listCodexConfigCandidates(projectRoot).map((candidate) => {
    if (!existsSync(candidate.path)) {
      return {
        ...candidate,
        exists: false,
        approvals: [],
      }
    }

    try {
      return {
        ...candidate,
        exists: true,
        approvals: parseCodexApprovedMcpToolsFromToml(readFileSync(candidate.path, 'utf-8')),
      }
    } catch (error) {
      return {
        ...candidate,
        exists: true,
        approvals: [],
        parseError: error instanceof Error ? error.message : String(error),
      }
    }
  })
}

function getCodexProjectPathCandidates(projectRoot: string | undefined): string[] {
  if (!projectRoot) return []

  const candidates = new Set<string>()
  const resolvedProjectRoot = resolve(projectRoot)
  candidates.add(resolvedProjectRoot)

  try {
    candidates.add(realpathSync(resolvedProjectRoot))
  } catch {
    // Keep the resolved project root even when realpath resolution fails.
  }

  return [...candidates]
}

function parseCodexProjectKeySegment(segment: string): string | null {
  const trimmed = segment.trim()
  if (!trimmed) return null

  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    const parsed = parseTomlValue(trimmed)
    return typeof parsed === 'string' ? parsed : null
  }

  return null
}

function readCodexProjectTrust(filePath: string, projectPaths: Set<string>): string[] {
  const matchedPaths = new Set<string>()
  let currentProjectKey: string | null = null

  const lines = readFileSync(filePath, 'utf-8').split(/\r?\n/)
  for (const rawLine of lines) {
    const line = stripTomlComment(rawLine).trim()
    if (!line) continue

    const sectionMatch = line.match(/^\[(.+)\]$/)
    if (sectionMatch) {
      currentProjectKey = null
      const section = sectionMatch[1].trim()
      if (section.startsWith('projects.')) {
        currentProjectKey = parseCodexProjectKeySegment(section.slice('projects.'.length))
      }
      continue
    }

    const dottedTrustMatch = line.match(/^projects\.(.+)\.trust_level\s*=\s*(.+)$/)
    if (dottedTrustMatch) {
      const projectKey = parseCodexProjectKeySegment(dottedTrustMatch[1])
      const parsed = parseTomlValue(dottedTrustMatch[2].trim())
      if (projectKey && projectPaths.has(projectKey) && parsed === 'trusted') {
        matchedPaths.add(projectKey)
      }
      continue
    }

    if (!currentProjectKey || !projectPaths.has(currentProjectKey)) continue
    const trustMatch = line.match(/^trust_level\s*=\s*(.+)$/)
    if (!trustMatch) continue
    const parsed = parseTomlValue(trustMatch[1].trim())
    if (parsed === 'trusted') {
      matchedPaths.add(currentProjectKey)
    }
  }

  return [...matchedPaths]
}

function probeCodexProjectTrust(projectRoot: string | undefined): CodexProjectTrustProbe | undefined {
  const projectPaths = getCodexProjectPathCandidates(projectRoot)
  if (projectPaths.length === 0) return undefined

  const userConfig = listCodexConfigCandidates(projectRoot).find((candidate) => candidate.scope === 'user')
  if (!userConfig) return undefined

  if (!existsSync(userConfig.path)) {
    return {
      path: userConfig.path,
      exists: false,
      trusted: false,
      matchedProjectPaths: [],
    }
  }

  try {
    const matchedProjectPaths = readCodexProjectTrust(userConfig.path, new Set(projectPaths))
    return {
      path: userConfig.path,
      exists: true,
      trusted: matchedProjectPaths.length > 0,
      matchedProjectPaths,
    }
  } catch (error) {
    return {
      path: userConfig.path,
      exists: true,
      trusted: false,
      matchedProjectPaths: [],
      parseError: error instanceof Error ? error.message : String(error),
    }
  }
}

function getClaudeManagedSettingsPath(): string | undefined {
  switch (process.platform) {
    case 'darwin':
      return '/Library/Application Support/ClaudeCode/managed-settings.json'
    case 'linux':
      return '/etc/claude-code/managed-settings.json'
    case 'win32':
      return 'C:\\Program Files\\ClaudeCode\\managed-settings.json'
    default:
      return undefined
  }
}

function listClaudeSettingsCandidates(projectRoot: string | undefined): ClaudeSettingsCandidate[] {
  const homeDir = process.env.HOME?.trim() || homedir()
  const candidates: ClaudeSettingsCandidate[] = []
  const managedPath = getClaudeManagedSettingsPath()

  if (managedPath) {
    candidates.push({ path: managedPath, scope: 'managed' })
  }

  candidates.push({ path: resolve(homeDir, '.claude/settings.json'), scope: 'user' })

  if (projectRoot) {
    candidates.push({ path: resolve(projectRoot, '.claude/settings.json'), scope: 'project' })
    candidates.push({ path: resolve(projectRoot, '.claude/settings.local.json'), scope: 'local' })
  }

  const seen = new Set<string>()
  return candidates.filter((candidate) => {
    if (seen.has(candidate.path)) return false
    seen.add(candidate.path)
    return true
  })
}

function readClaudeDisableAllHooks(filePath: string): boolean | undefined {
  const parsed = readJsonFile<Record<string, unknown>>(dirname(filePath), basename(filePath))
  return typeof parsed.disableAllHooks === 'boolean' ? parsed.disableAllHooks : undefined
}

function probeClaudeDisableAllHooks(projectRoot: string | undefined): ClaudeDisableAllHooksProbe[] {
  return listClaudeSettingsCandidates(projectRoot).map((candidate) => {
    if (!existsSync(candidate.path)) {
      return {
        ...candidate,
        exists: false,
        disableAllHooks: false,
      }
    }

    try {
      return {
        ...candidate,
        exists: true,
        disableAllHooks: readClaudeDisableAllHooks(candidate.path) === true,
      }
    } catch (error) {
      return {
        ...candidate,
        exists: true,
        disableAllHooks: false,
        parseError: error instanceof Error ? error.message : String(error),
      }
    }
  })
}

function getInstalledClaudeHooksReference(rootDir: string, manifest: Record<string, unknown>): string | undefined {
  if (existsSync(resolve(rootDir, 'hooks/hooks.json'))) {
    return './hooks/hooks.json'
  }

  const manifestReference = typeof manifest.hooks === 'string' ? manifest.hooks : undefined
  return manifestReference
}

function checkConsumerBundlePath(checks: DoctorCheck[], rootDir: string): void {
  try {
    accessSync(rootDir, constants.R_OK)
    const details = lstatSync(rootDir)
    addCheck(checks, {
      level: 'success',
      code: 'consumer-path-readable',
      title: 'Consumer bundle path readable',
      detail: `${rootDir} is present and readable${details.isSymbolicLink() ? ' (symlinked install)' : ''}.`,
      fix: 'No action needed.',
      path: rootDir,
    })
  } catch {
    addCheck(checks, {
      level: 'error',
      code: 'consumer-path-unreadable',
      title: 'Consumer bundle path unreadable',
      detail: `The installed plugin path is not readable: ${rootDir}`,
      fix: 'Fix the path or permissions and rerun pluxx doctor --consumer.',
      path: rootDir,
    })
  }
}

function checkConsumerManifest(checks: DoctorCheck[], rootDir: string, layout: ConsumerBundleLayout): void {
  try {
    const manifest = readJsonFile<Record<string, unknown>>(rootDir, layout.manifestPath)
    const name = typeof manifest.name === 'string' && manifest.name.trim() !== ''
      ? manifest.name
      : layout.platform
    const version = typeof manifest.version === 'string' && manifest.version.trim() !== ''
      ? manifest.version
      : 'unknown'

    addCheck(checks, {
      level: 'success',
      code: 'consumer-manifest-valid',
      title: 'Installed plugin manifest parsed successfully',
      detail: `Detected ${name}@${version} for ${layout.platform}.`,
      fix: 'No action needed.',
      path: layout.manifestPath,
    })
  } catch (error) {
    addCheck(checks, {
      level: 'error',
      code: 'consumer-manifest-invalid',
      title: 'Installed plugin manifest is not parseable',
      detail: error instanceof Error ? error.message : String(error),
      fix: 'Rebuild or reinstall this plugin bundle and rerun pluxx doctor --consumer.',
      path: layout.manifestPath,
    })
  }
}

function checkInstalledUserConfig(checks: DoctorCheck[], rootDir: string): void {
  const userConfigPath = '.pluxx-user.json'
  const resolvedPath = resolve(rootDir, userConfigPath)
  if (!existsSync(resolvedPath)) {
    addCheck(checks, {
      level: 'info',
      code: 'consumer-user-config-missing',
      title: 'No local install config materialized',
      detail: 'This bundle does not include a .pluxx-user.json file.',
      fix: 'If tools require secrets or install-time config, reinstall the plugin and provide the requested values.',
      path: userConfigPath,
    })
    return
  }

  try {
    const payload = JSON.parse(readFileSync(resolvedPath, 'utf-8')) as {
      values?: Record<string, unknown>
      env?: Record<string, string>
    }
    const valueCount = Object.keys(payload.values ?? {}).length
    const envCount = Object.keys(payload.env ?? {}).length
    const placeholderKeys = [
      ...Object.entries(payload.values ?? {})
        .filter(([, value]) => isPlaceholderSecretValue(value))
        .map(([key]) => key),
      ...Object.entries(payload.env ?? {})
        .filter(([, value]) => isPlaceholderSecretValue(value))
        .map(([key]) => key),
    ]
    addCheck(checks, {
      level: 'success',
      code: 'consumer-user-config-valid',
      title: 'Local install config parsed successfully',
      detail: `.pluxx-user.json contains ${valueCount} saved value entr${valueCount === 1 ? 'y' : 'ies'} and ${envCount} env binding${envCount === 1 ? '' : 's'}.`,
      fix: 'No action needed.',
      path: userConfigPath,
    })
    if (placeholderKeys.length > 0) {
      addCheck(checks, {
        level: 'warning',
        code: 'consumer-user-config-placeholder-secret',
        title: 'Local install config contains placeholder-looking secret values',
        detail: `.pluxx-user.json contains placeholder-looking value${placeholderKeys.length === 1 ? '' : 's'} for ${placeholderKeys.join(', ')}.`,
        fix: 'Reinstall the plugin with real secret values, or edit .pluxx-user.json and refresh/restart the host.',
        path: userConfigPath,
      })
    }
  } catch (error) {
    addCheck(checks, {
      level: 'error',
      code: 'consumer-user-config-invalid',
      title: 'Local install config is not parseable',
      detail: error instanceof Error ? error.message : String(error),
      fix: 'Delete or repair .pluxx-user.json, then reinstall the plugin if needed.',
      path: userConfigPath,
    })
  }
}

function checkInstalledEnvValidation(checks: DoctorCheck[], rootDir: string): void {
  const envScriptPath = INSTALLER_OWNED_CHECK_ENV_PATH
  const resolvedPath = resolve(rootDir, envScriptPath)
  if (!existsSync(resolvedPath)) {
    addCheck(checks, {
      level: 'info',
      code: 'consumer-env-script-missing',
      title: 'No install-time env validation script found',
      detail: getConsumerEnvScriptMissingDetail(),
      fix: 'No action needed unless this plugin is expected to validate runtime secrets on install.',
      path: envScriptPath,
    })
    return
  }

  const content = readFileSync(resolvedPath, 'utf-8')
  if (content.includes(MATERIALIZED_ENV_MARKER)) {
    addCheck(checks, {
      level: 'success',
      code: 'consumer-env-script-materialized',
      title: 'Install-time env validation was disabled after materialization',
      detail: 'This local install already materialized required config, so the env validation hook is bypassed.',
      fix: 'No action needed.',
      path: envScriptPath,
    })
    return
  }

  addCheck(checks, {
    level: 'warning',
    code: 'consumer-env-script-active',
    title: 'Install-time env validation is still active',
    detail: getConsumerEnvScriptActiveDetail(),
    fix: 'If authenticated tools fail, reinstall the plugin and provide the requested userConfig values or required env vars.',
    path: envScriptPath,
  })
}

function checkInstalledRuntimeScriptRoles(checks: DoctorCheck[], rootDir: string): void {
  const roleFiles = [
    'scripts/check-env.sh',
    'scripts/load-env.sh',
    'scripts/bootstrap-runtime.sh',
    'scripts/start-mcp.sh',
  ]

  const presentRoles = roleFiles
    .filter((relativePath) => existsSync(resolve(rootDir, relativePath)))
    .map((relativePath) => getRuntimeScriptRoleForPath(relativePath))
    .filter((role): role is RuntimeScriptRole => role !== null)

  if (presentRoles.length === 0) return

  addCheck(checks, {
    level: 'info',
    code: 'consumer-runtime-script-roles',
    title: 'Known runtime script-role files detected',
    detail: getConsumerRuntimeScriptRolesDetail(presentRoles),
    fix: 'No action needed unless the runtime startup chain is unexpectedly missing a script you rely on.',
    path: 'scripts/',
  })
}

async function checkInstalledMcpConfig(checks: DoctorCheck[], rootDir: string, layout: ConsumerBundleLayout): Promise<void> {
  if (!layout.mcpConfigPath) {
    addCheck(checks, {
      level: 'info',
      code: 'consumer-mcp-config-not-applicable',
      title: 'No static MCP config file for this platform',
      detail: `${layout.platform} builds runtime MCP wiring inside the plugin wrapper rather than a standalone JSON file.`,
      fix: 'No action needed.',
      path: layout.manifestPath,
    })
    return
  }

  const resolvedPath = resolve(rootDir, layout.mcpConfigPath)
  if (!existsSync(resolvedPath)) {
    addCheck(checks, {
      level: 'info',
      code: 'consumer-mcp-config-missing',
      title: 'No MCP config file emitted in this bundle',
      detail: `This ${layout.platform} bundle does not include ${layout.mcpConfigPath}.`,
      fix: 'No action needed unless this plugin should expose MCP servers on this platform.',
      path: layout.mcpConfigPath,
    })
    return
  }

  try {
    const payload = readJsonFile<{ mcpServers?: Record<string, Record<string, unknown>> }>(rootDir, layout.mcpConfigPath)
    const servers = Object.values(payload.mcpServers ?? {})
    addCheck(checks, {
      level: 'success',
      code: 'consumer-mcp-config-valid',
      title: 'Installed MCP config parsed successfully',
      detail: `${layout.mcpConfigPath} defines ${servers.length} MCP server${servers.length === 1 ? '' : 's'}.`,
      fix: 'No action needed.',
      path: layout.mcpConfigPath,
    })

    if (servers.length === 0) {
      return
    }

    if (layout.platform === 'codex') {
      addCheck(checks, {
        level: 'info',
        code: 'consumer-codex-mcp-bundled-visibility',
        title: 'Codex plugin-bundled MCP visibility clarified',
        detail: `This Codex plugin bundle includes ${servers.length} MCP server${servers.length === 1 ? '' : 's'} through ${layout.mcpConfigPath}. Codex may show this on the plugin detail page without listing it on the global MCP servers settings page.`,
        fix: 'Use the plugin detail page, tool availability in chat, and `pluxx verify-install --target codex` as the source of truth for plugin-bundled MCP wiring. If the MCP remains unavailable after install, use Plugins > Refresh if present or restart Codex.',
        path: layout.mcpConfigPath,
      })
    }

    const namedServers = Object.entries(payload.mcpServers ?? {}).map(([name, server]) => ({ name, ...server }))
    const remoteEntries = namedServers.filter((server) => 'url' in server)
    const stdioEntries = namedServers.filter((server) => 'command' in server)
    const inlineHeaderEntries = servers.filter((server) => {
      if ('headers' in server && server.headers && typeof server.headers === 'object') return true
      if ('http_headers' in server && server.http_headers && typeof server.http_headers === 'object') return true
      return false
    })

    if (stdioEntries.length > 0) {
      addCheck(checks, {
        level: 'info',
        code: 'consumer-mcp-stdio',
        title: 'Local MCP servers configured',
        detail: `${stdioEntries.length} MCP server${stdioEntries.length === 1 ? '' : 's'} run via local stdio commands in this bundle.`,
        fix: 'If tools fail, verify the bundled command or its runtime dependencies on this machine.',
        path: layout.mcpConfigPath,
      })

      const missingRuntimePaths = findMissingInstalledStdioRuntimePaths(rootDir, stdioEntries)
      if (missingRuntimePaths.length > 0) {
        addCheck(checks, {
          level: 'warning',
          code: 'consumer-mcp-stdio-runtime-missing',
          title: 'Bundled stdio MCP runtime files are missing',
          detail: `This installed MCP config references local runtime path${missingRuntimePaths.length === 1 ? '' : 's'} that do not exist in the bundle: ${missingRuntimePaths.join(', ')}.`,
          fix: 'Rebuild the plugin with the MCP runtime directory included in passthrough, then reinstall the host bundle.',
          path: layout.mcpConfigPath,
        })
      }

      const leakedPluginRootVars = [...new Set(
        stdioEntries.flatMap((server) => {
          const serverRecord = server as Record<string, unknown>
          const serverArgs = Array.isArray(serverRecord.args)
            ? serverRecord.args.filter((value): value is string => typeof value === 'string')
            : []
          const values = [
            typeof server.command === 'string' ? server.command : '',
            ...serverArgs,
          ]
          return findLeakedPluginRootVars(layout.platform, values)
        }),
      )].sort()
      if (leakedPluginRootVars.length > 0) {
        addCheck(checks, {
          level: 'warning',
          code: 'consumer-mcp-stdio-host-root-leak',
          title: 'Installed stdio MCP config contains the wrong host root contract',
          detail: `This installed ${layout.platform} MCP config still contains plugin root variable${leakedPluginRootVars.length === 1 ? '' : 's'} that do not belong in this host bundle: ${leakedPluginRootVars.map((pluginRootVar) => `\${${pluginRootVar}}`).join(', ')}.`,
          fix: 'Author global stdio MCP paths as `./...` or `${PLUGIN_ROOT}/...`, then rebuild and reinstall so Pluxx can normalize the correct host-specific path.',
          path: layout.mcpConfigPath,
        })
      }

      const launchResults = await smokeCheckInstalledStdioServers(rootDir, stdioEntries)
      for (const result of launchResults) {
        addCheck(checks, {
          level: result.ok ? 'success' : 'error',
          code: result.ok ? 'consumer-mcp-stdio-launch-valid' : 'consumer-mcp-stdio-launch-failed',
          title: result.ok
            ? `Installed stdio MCP server launches for ${result.serverName}`
            : `Installed stdio MCP server failed to stay up for ${result.serverName}`,
          detail: `${result.command || '(empty command)'} — ${result.detail}`,
          fix: result.ok
            ? 'No action needed.'
            : 'Launch the installed command directly from the plugin directory, fix any missing runtime files/dependencies, then reinstall and rerun pluxx verify-install.',
          path: layout.mcpConfigPath,
        })
      }
    }

    if (remoteEntries.length > 0 && inlineHeaderEntries.length > 0) {
      addCheck(checks, {
        level: 'success',
        code: 'consumer-mcp-inline-auth',
        title: 'Remote MCP auth was materialized into this install',
        detail: `${inlineHeaderEntries.length} remote MCP server${inlineHeaderEntries.length === 1 ? '' : 's'} include inline auth headers in the installed bundle.`,
        fix: 'No action needed.',
        path: layout.mcpConfigPath,
      })
      return
    }

    if (remoteEntries.length > 0) {
      const fix = layout.platform === 'claude-code' || layout.platform === 'cursor'
        ? 'If authenticated tools fail, complete the platform auth flow in the host or reinstall with any required userConfig values.'
        : 'If authenticated tools fail, reinstall the plugin and provide any required userConfig or runtime env vars.'
      addCheck(checks, {
        level: 'info',
        code: 'consumer-mcp-remote-auth-runtime',
        title: 'Remote MCP auth is expected at runtime',
        detail: `${remoteEntries.length} remote MCP server${remoteEntries.length === 1 ? '' : 's'} are configured without inline auth headers in this installed bundle.`,
        fix,
        path: layout.mcpConfigPath,
      })
    }
  } catch (error) {
    addCheck(checks, {
      level: 'error',
      code: 'consumer-mcp-config-invalid',
      title: 'Installed MCP config is not parseable',
      detail: error instanceof Error ? error.message : String(error),
      fix: 'Rebuild or reinstall this platform bundle and rerun pluxx doctor --consumer.',
      path: layout.mcpConfigPath,
    })
  }
}

function checkInstalledBundleIntegrity(checks: DoctorCheck[], rootDir: string, layout: ConsumerBundleLayout): void {
  const issues = findInstalledBundleIntegrityIssues(rootDir, layout.platform)
  const details: string[] = []

  if (issues.manifestIssue) {
    details.push(issues.manifestIssue)
  }
  if (issues.hookConfigIssue) {
    details.push(issues.hookConfigIssue)
  }
  if (issues.missingManifestPaths.length > 0) {
    details.push(`manifest references missing path${issues.missingManifestPaths.length === 1 ? '' : 's'}: ${issues.missingManifestPaths.join(', ')}`)
  }
  if (issues.missingHookTargets.length > 0) {
    details.push(`hook commands reference missing bundle target${issues.missingHookTargets.length === 1 ? '' : 's'}: ${issues.missingHookTargets.join(', ')}`)
  }
  if (issues.invalidRuntimeScripts.length > 0) {
    details.push(`runtime startup still depends on installer-owned validation: ${issues.invalidRuntimeScripts.join(', ')}`)
  }

  if (details.length === 0) {
    addCheck(checks, {
      level: 'success',
      code: 'consumer-bundle-integrity-valid',
      title: 'Installed bundle references resolve inside the plugin',
      detail: 'Every manifest-declared path and bundle-relative hook target exists in this installed bundle.',
      fix: 'No action needed.',
      path: layout.manifestPath,
    })
    return
  }

  addCheck(checks, {
    level: 'error',
    code: 'consumer-bundle-integrity-invalid',
    title: 'Installed bundle integrity is broken',
    detail: details.join('; '),
    fix: 'Reinstall the plugin or rebuild the bundle so every manifest path, hook config, and hook target is valid inside the installed plugin.',
    path: layout.manifestPath,
  })
}

function checkInstalledClaudeHookSettings(
  checks: DoctorCheck[],
  rootDir: string,
  layout: ConsumerBundleLayout,
  options: DoctorConsumerOptions,
): void {
  if (layout.platform !== 'claude-code') return
  if (checks.some((check) => check.code === 'consumer-bundle-integrity-invalid')) return

  let manifest: Record<string, unknown>
  try {
    manifest = readJsonFile<Record<string, unknown>>(rootDir, layout.manifestPath)
  } catch {
    return
  }

  const hooksReference = getInstalledClaudeHooksReference(rootDir, manifest)
  if (!hooksReference) return

  const probes = probeClaudeDisableAllHooks(options.projectRoot)
  const disabled = probes.filter((probe) => probe.disableAllHooks)
  const parseErrors = probes
    .filter((probe) => probe.parseError)
    .map((probe) => `${probe.path}: ${probe.parseError}`)
  const checkedPaths = probes
    .map((probe) => `${probe.scope} ${probe.exists ? 'settings' : 'path'}: ${probe.path}${probe.exists ? '' : ' (missing)'}`)
    .join('; ')

  if (disabled.length > 0) {
    addCheck(checks, {
      level: 'warning',
      code: 'consumer-claude-hooks-disabled',
      title: 'Claude settings may currently suppress bundled hook activation',
      detail: `This installed Claude bundle uses hooks at ${hooksReference}, and \`disableAllHooks = true\` was found in ${disabled.map((probe) => `${probe.scope} settings ${probe.path}`).join(' and ')}. Live Claude CLI 2.1.140 headless probes on 2026-05-13 showed this setting suppressing SessionStart settings-hook execution across user, project, and local layers.${parseErrors.length > 0 ? ` Unparseable settings: ${parseErrors.join('; ')}.` : ''} This check only inspects the file-based managed path plus user/project/local settings; Claude enterprise policy can also arrive through registry, plist/MDM, or server-managed policy, and \`allowManagedHooksOnly\` is not evaluated here.`,
      fix: 'Remove or flip `disableAllHooks` in the active Claude settings layer, run /reload-plugins or restart Claude, rerun pluxx verify-install, and use Claude /status when enterprise managed policy may still control hook activation.',
      path: disabled[0].path,
    })
    return
  }

  if (parseErrors.length > 0) {
    addCheck(checks, {
      level: 'warning',
      code: 'consumer-claude-hook-settings-invalid',
      title: 'Claude hook settings could not be fully inspected',
      detail: `This installed Claude bundle uses hooks at ${hooksReference}, but some checked Claude settings files were not parseable. Checked ${checkedPaths}. Unparseable settings: ${parseErrors.join('; ')}. This check only inspects the file-based managed path plus user/project/local settings; it does not verify registry, plist/MDM, server-managed policy, or \`allowManagedHooksOnly\`.`,
      fix: 'Fix the malformed Claude settings JSON, reload Claude, rerun pluxx verify-install, and use Claude /status if enterprise policy may still control hook activation.',
      path: probes.find((probe) => probe.parseError)?.path ?? hooksReference,
    })
    return
  }

  addCheck(checks, {
    level: 'success',
    code: 'consumer-claude-hook-settings-clear',
    title: 'No checked Claude settings layer is disabling hooks',
    detail: `This installed Claude bundle uses hooks at ${hooksReference}, and no checked Claude settings layer currently sets \`disableAllHooks = true\`. Checked ${checkedPaths}. This success result only covers the file-based managed path plus user/project/local settings; it does not prove registry, plist/MDM, server-managed policy, or \`allowManagedHooksOnly\` are clear.`,
    fix: 'No action needed.',
    path: hooksReference,
  })
}

function checkInstalledCodexHooksFeatureFlag(
  checks: DoctorCheck[],
  rootDir: string,
  layout: ConsumerBundleLayout,
  options: DoctorConsumerOptions,
): void {
  if (layout.platform !== 'codex') return
  if (checks.some((check) => check.code === 'consumer-bundle-integrity-invalid')) return

  let manifest: Record<string, unknown>
  try {
    manifest = readJsonFile<Record<string, unknown>>(rootDir, layout.manifestPath)
  } catch {
    return
  }

  const hooksReference = typeof manifest.hooks === 'string' ? manifest.hooks : undefined
  if (!hooksReference) return

  const probes = probeCodexHooksFeatureFlags(options.projectRoot)
  const enabledProbes = probes.filter((probe) => probe.enabled)
  const checkedPaths = probes
    .map((probe) => `${probe.scope} ${probe.exists ? 'config' : 'path'}: ${probe.path}${probe.exists ? '' : ' (missing)'}`)
    .join('; ')
  const describeEnabledFlags = (probe: CodexHooksFeatureProbe): string => {
    const enabledFlags: string[] = []
    if (probe.pluginBundledEnabled) enabledFlags.push(PLUGIN_BUNDLED_CODEX_HOOKS_FEATURE_FLAG)
    if (probe.recommendedEnabled) enabledFlags.push(RECOMMENDED_CODEX_HOOKS_FEATURE_FLAG)
    if (probe.alternateEnabled) enabledFlags.push(ALTERNATE_CODEX_HOOKS_FEATURE_FLAG)
    return enabledFlags.join(' + ')
  }
  const generalOnlyProbes = probes.filter((probe) => !probe.pluginBundledEnabled && (probe.recommendedEnabled || probe.alternateEnabled))

  if (generalOnlyProbes.length > 0) {
    addCheck(checks, {
      level: 'warning',
      code: 'consumer-codex-plugin-hooks-feature-flag-general-only',
      title: 'Codex config enables only general hook flags, not the plugin-bundled hook gate',
      detail: `This installed Codex bundle declares plugin-bundled hooks at ${hooksReference}, but ${generalOnlyProbes.map((probe) => `${probe.scope} config ${probe.path}`).join(' and ')} enables only general hook flags (${generalOnlyProbes.map((probe) => describeEnabledFlags(probe)).join(' and ')}). Those general flags do not activate plugin-bundled hooks by themselves.`,
      fix: `Enable \`${PLUGIN_BUNDLED_CODEX_HOOKS_FEATURE_FLAG} = true\` under \`[features]\` in the active Codex config, reload Codex, and rerun pluxx verify-install.`,
      path: generalOnlyProbes[0].path,
    })
  }

  const legacyOnlyProbes = probes.filter((probe) => probe.alternateEnabled && !probe.recommendedEnabled)
  if (legacyOnlyProbes.length > 0) {
    addCheck(checks, {
      level: 'warning',
      code: 'consumer-codex-hooks-feature-flag-legacy-only',
      title: 'Codex config still uses the deprecated general hook compatibility flag',
      detail: `This installed Codex bundle declares plugin-bundled hooks at ${hooksReference}, and the checked Codex config enables only the deprecated general hook flag \`${ALTERNATE_CODEX_HOOKS_FEATURE_FLAG} = true\` in ${legacyOnlyProbes.map((probe) => `${probe.scope} config ${probe.path}`).join(' and ')}. That flag is not the plugin-bundled hook gate.`,
      fix: `Prefer \`${RECOMMENDED_CODEX_HOOKS_FEATURE_FLAG} = true\` only for non-plugin hook config if needed, and use \`${PLUGIN_BUNDLED_CODEX_HOOKS_FEATURE_FLAG} = true\` under \`[features]\` for plugin-bundled hooks. Reload Codex and rerun pluxx verify-install after updating the active config.`,
      path: legacyOnlyProbes[0].path,
    })
  }

  if (enabledProbes.length > 0) {
    addCheck(checks, {
      level: 'success',
      code: 'consumer-codex-hooks-feature-flag-enabled',
      title: 'Codex plugin-bundled hook feature flag found for this install',
      detail: `This installed Codex bundle declares plugin-bundled hooks at ${hooksReference}, and the plugin hook gate was found in ${enabledProbes.map((probe) => `${probe.scope} config ${probe.path} (${describeEnabledFlags(probe)})`).join(' and ')}. Treat that as a prerequisite, not proof of live hook execution.`,
      fix: 'No action needed.',
      path: enabledProbes[0].path,
    })
    return
  }

  const parseErrors = probes
    .filter((probe) => probe.parseError)
    .map((probe) => `${probe.path}: ${probe.parseError}`)

  addCheck(checks, {
    level: 'warning',
    code: 'consumer-codex-hooks-feature-flag-missing',
    title: 'Codex plugin-bundled hook activation is missing its known feature-gate prerequisite',
    detail: `This installed Codex bundle declares plugin-bundled hooks at ${hooksReference}, but \`${PLUGIN_BUNDLED_CODEX_HOOKS_FEATURE_FLAG} = true\` was not found in the checked Codex config layers. The general \`${RECOMMENDED_CODEX_HOOKS_FEATURE_FLAG}\` flag covers non-plugin hook config and defaults on, while \`${ALTERNATE_CODEX_HOOKS_FEATURE_FLAG}\` is deprecated and should not be treated as a plugin-bundled hook fallback. Checked ${checkedPaths}.${parseErrors.length > 0 ? ` Unparseable config: ${parseErrors.join('; ')}.` : ''}`,
    fix: `Enable \`${PLUGIN_BUNDLED_CODEX_HOOKS_FEATURE_FLAG} = true\` under \`[features]\` in the relevant project or user Codex config, reload Codex, and rerun pluxx verify-install.`,
    path: probes.find((probe) => probe.exists)?.path ?? hooksReference,
  })
}

function checkInstalledCodexProjectTrust(
  checks: DoctorCheck[],
  rootDir: string,
  layout: ConsumerBundleLayout,
  options: DoctorConsumerOptions,
): void {
  if (layout.platform !== 'codex') return
  if (checks.some((check) => check.code === 'consumer-bundle-integrity-invalid')) return
  if (!options.projectRoot) return

  let manifest: Record<string, unknown>
  try {
    manifest = readJsonFile<Record<string, unknown>>(rootDir, layout.manifestPath)
  } catch {
    return
  }

  const hooksReference = typeof manifest.hooks === 'string' ? manifest.hooks : undefined
  if (!hooksReference) return

  const trustProbe = probeCodexProjectTrust(options.projectRoot)
  if (!trustProbe) return

  const projectPaths = getCodexProjectPathCandidates(options.projectRoot)
  const displayProjectPaths = projectPaths.join(' or ')
  const parseErrorDetail = trustProbe.parseError ? ` Unparseable user config: ${trustProbe.parseError}.` : ''

  if (trustProbe.trusted) {
    addCheck(checks, {
      level: 'success',
      code: 'consumer-codex-project-trust-enabled',
      title: 'Codex trusted-project entry found for this install',
      detail: `This installed Codex bundle declares hooks at ${hooksReference}, and the user Codex config ${trustProbe.path} trusts ${trustProbe.matchedProjectPaths.join(' and ')} for project-local hook loading.`,
      fix: 'No action needed.',
      path: trustProbe.path,
    })
    return
  }

  addCheck(checks, {
    level: 'warning',
    code: 'consumer-codex-project-trust-missing',
    title: 'Codex project trust may still block hook activation',
    detail: `This installed Codex bundle declares hooks at ${hooksReference}, but the user Codex config ${trustProbe.exists ? trustProbe.path : `${trustProbe.path} (missing)`} does not currently trust ${displayProjectPaths}. Current Codex CLI releases can keep project-local config, hooks, and exec policies disabled until the project is trusted.${parseErrorDetail}`,
    fix: `Trust the project in Codex, or add a matching \`[projects.\"<absolute-project-path>\"]\\ntrust_level = \"trusted\"\` entry in ${trustProbe.path}, reload Codex, retry a trusted interactive prompt, and rerun pluxx verify-install if hooks still do not activate.`,
    path: trustProbe.path,
  })
}

function checkInstalledCodexPermissionCompanion(
  checks: DoctorCheck[],
  rootDir: string,
  layout: ConsumerBundleLayout,
  options: DoctorConsumerOptions,
): void {
  if (layout.platform !== 'codex') return
  if (checks.some((check) => check.code === 'consumer-bundle-integrity-invalid')) return

  const companionPath = resolve(rootDir, '.codex/config.generated.toml')
  const companionReference = '.codex/config.generated.toml'
  if (!existsSync(companionPath)) return

  let expectedEntries: CodexMcpApprovalEntry[]
  try {
    expectedEntries = parseCodexApprovedMcpToolsFromToml(readFileSync(companionPath, 'utf-8'))
  } catch (error) {
    addCheck(checks, {
      level: 'error',
      code: 'consumer-codex-mcp-approval-companion-invalid',
      title: 'Generated Codex MCP approval companion is malformed',
      detail: `${companionReference} could not be parsed: ${error instanceof Error ? error.message : String(error)}`,
      fix: 'Rebuild or reinstall the plugin so the generated Codex MCP approval companion is written correctly before you merge it into active Codex config.',
      path: companionReference,
    })
    return
  }

  if (expectedEntries.length === 0) return

  const probes = probeCodexMcpApprovalEntries(options.projectRoot)
  const checkedPaths = probes
    .map((probe) => `${probe.scope} ${probe.exists ? 'config' : 'path'}: ${probe.path}${probe.exists ? '' : ' (missing)'}`)
    .join('; ')
  const parseErrors = probes
    .filter((probe) => probe.parseError)
    .map((probe) => `${probe.path}: ${probe.parseError}`)
  const activeEntries = new Set(
    probes.flatMap((probe) => probe.approvals.map((entry) => `${entry.serverName}.${entry.toolName}`)),
  )
  const missingEntries = expectedEntries.filter((entry) => !activeEntries.has(`${entry.serverName}.${entry.toolName}`))

  const formatEntries = (entries: CodexMcpApprovalEntry[]): string =>
    entries.map((entry) => `${entry.serverName}.${entry.toolName}`).join(', ')

  if (missingEntries.length > 0) {
    addCheck(checks, {
      level: 'warning',
      code: 'consumer-codex-mcp-approval-config-missing',
      title: 'Generated Codex MCP approval stanzas are not fully merged into active config',
      detail: `This installed Codex bundle includes ${companionReference} with ${expectedEntries.length} per-tool approval stanza${expectedEntries.length === 1 ? '' : 's'}, but the checked Codex config layers are still missing ${missingEntries.length === expectedEntries.length ? 'all of them' : formatEntries(missingEntries)}. Checked ${checkedPaths}.${parseErrors.length > 0 ? ` Unparseable config: ${parseErrors.join('; ')}.` : ''} Live maintained Codex MCP probes on May 13, 2026 only proved this approval path once explicit per-tool \`approval_mode = "approve"\` entries were merged into active config.`,
      fix: `Merge the missing stanza${missingEntries.length === 1 ? '' : 's'} from ${companionReference} into the active project or user Codex config.toml, reload Codex, and rerun pluxx verify-install. Keep .codex/permissions.generated.json as the broader mirror for selectors that still remain external.`,
      path: companionReference,
    })
    return
  }

  if (parseErrors.length > 0) {
    addCheck(checks, {
      level: 'warning',
      code: 'consumer-codex-mcp-approval-config-unparseable',
      title: 'Codex MCP approval config could not be fully inspected',
      detail: `This installed Codex bundle includes ${companionReference}, and matching approval stanzas were found in the checked Codex config layers, but some config files were not parseable. Checked ${checkedPaths}. Unparseable config: ${parseErrors.join('; ')}.`,
      fix: 'Fix the malformed Codex config, reload Codex, and rerun pluxx verify-install so Pluxx can confirm the generated approval stanzas are still merged correctly.',
      path: probes.find((probe) => probe.parseError)?.path ?? companionReference,
    })
    return
  }

  addCheck(checks, {
    level: 'success',
    code: 'consumer-codex-mcp-approval-config-merged',
    title: 'Generated Codex MCP approval stanzas are present in active config',
    detail: `This installed Codex bundle includes ${companionReference} with ${expectedEntries.length} per-tool approval stanza${expectedEntries.length === 1 ? '' : 's'}, and matching entries were found in the checked Codex config layers. Checked ${checkedPaths}.`,
    fix: 'No action needed.',
    path: companionReference,
  })
}

function parseInstalledPermissionRules(scriptSource: string): ParsedPermissionRule[] {
  const match = scriptSource.match(/const RULES = (\[[\s\S]*?\]);\nconst ACTION_PRIORITY/)
  if (!match?.[1]) {
    throw new Error('Could not locate embedded RULES payload in hooks/pluxx-permissions.mjs.')
  }

  const parsed = JSON.parse(match[1]) as unknown
  if (!Array.isArray(parsed)) {
    throw new Error('Embedded RULES payload is not an array.')
  }

  return parsed as ParsedPermissionRule[]
}

function materializePermissionPattern(pattern: string): string {
  return pattern
    .replace(/\*\*/g, 'probe/path')
    .replace(/\*/g, 'probe')
}

function buildInstalledPermissionProbe(
  platform: ConsumerPlatform,
  rule: ParsedPermissionRule,
): InstalledPermissionProbe | null {
  const value = materializePermissionPattern(rule.pattern)

  if (rule.kind === 'Bash') {
    return {
      action: rule.action,
      raw: rule.raw,
      mode: platform === 'cursor' ? 'cursor-shell' : 'claude-pretool',
      event: platform === 'cursor'
        ? { command: value }
        : { tool_name: 'Bash', tool_input: { command: value } },
    }
  }

  if (rule.kind === 'Read') {
    return {
      action: rule.action,
      raw: rule.raw,
      mode: platform === 'cursor' ? 'cursor-read' : 'claude-pretool',
      event: platform === 'cursor'
        ? { file_path: value }
        : { tool_name: 'Read', tool_input: { file_path: value } },
    }
  }

  if (rule.kind === 'Edit') {
    return {
      action: rule.action,
      raw: rule.raw,
      mode: platform === 'cursor' ? 'cursor' : 'claude-pretool',
      event: { tool_name: 'Edit', tool_input: { file_path: value } },
    }
  }

  if (rule.kind === 'Skill') {
    return {
      action: rule.action,
      raw: rule.raw,
      mode: platform === 'cursor' ? 'cursor' : 'claude-pretool',
      event: { tool_name: 'Skill', tool_input: { name: value } },
    }
  }

  if (rule.kind === 'MCP') {
    const canonical = value.includes('.')
      ? value
      : `${value}.probe`
    const dotIndex = canonical.indexOf('.')
    const server = canonical.slice(0, dotIndex).trim()
    const tool = canonical.slice(dotIndex + 1).trim()
    if (!server || !tool) return null

    return {
      action: rule.action,
      raw: rule.raw,
      mode: platform === 'cursor' ? 'cursor-mcp' : 'claude-pretool',
      event: platform === 'cursor'
        ? { tool_name: `mcp__${server}__${tool.replace(/\./g, '__')}` }
        : { tool_name: `mcp__${server}__${tool.replace(/\./g, '__')}` },
    }
  }

  return null
}

function extractPermissionDecision(
  platform: ConsumerPlatform,
  payload: Record<string, unknown>,
): string | undefined {
  if (platform === 'claude-code') {
    const hookSpecificOutput = payload.hookSpecificOutput
    if (!hookSpecificOutput || typeof hookSpecificOutput !== 'object') return undefined
    const decision = (hookSpecificOutput as Record<string, unknown>).permissionDecision
    return typeof decision === 'string' ? decision : undefined
  }

  const decision = payload.permission
  return typeof decision === 'string' ? decision : undefined
}

function smokeCheckInstalledPermissionHook(
  rootDir: string,
  layout: ConsumerBundleLayout,
): {
  ok: boolean
  detail: string
} | null {
  if (layout.platform !== 'claude-code' && layout.platform !== 'cursor') {
    return null
  }

  const scriptPath = resolve(rootDir, 'hooks/pluxx-permissions.mjs')
  if (!existsSync(scriptPath)) {
    return null
  }

  const rules = parseInstalledPermissionRules(readFileSync(scriptPath, 'utf-8'))
  const selected = new Map<string, InstalledPermissionProbe>()

  for (const rule of rules) {
    if (selected.has(rule.action)) continue
    const probe = buildInstalledPermissionProbe(layout.platform, rule)
    if (!probe) continue
    selected.set(rule.action, probe)
  }

  if (selected.size === 0) {
    return {
      ok: false,
      detail: 'Permission hook script is present, but no supported canonical probe cases could be derived from its embedded rules.',
    }
  }

  const failures: string[] = []
  const successes: string[] = []

  for (const probe of selected.values()) {
    const result = spawnSync('node', [scriptPath, probe.mode], {
      cwd: rootDir,
      input: JSON.stringify(probe.event),
      encoding: 'utf-8',
      env: process.env,
    })

    if (result.status !== 0) {
      failures.push(`${probe.raw} exited ${result.status ?? 'null'}${result.stderr ? `: ${result.stderr.trim()}` : ''}`)
      continue
    }

    let payload: Record<string, unknown>
    try {
      payload = JSON.parse(result.stdout || '{}') as Record<string, unknown>
    } catch (error) {
      failures.push(`${probe.raw} returned non-JSON output: ${error instanceof Error ? error.message : String(error)}`)
      continue
    }

    const decision = extractPermissionDecision(layout.platform, payload)
    if (decision !== probe.action) {
      failures.push(`${probe.raw} returned ${decision ?? 'no decision'} instead of ${probe.action}`)
      continue
    }

    successes.push(`${probe.raw} -> ${decision}`)
  }

  return failures.length > 0
    ? { ok: false, detail: failures.join('; ') }
    : { ok: true, detail: `Validated ${successes.join(', ')}` }
}

function checkInstalledPermissionHook(checks: DoctorCheck[], rootDir: string, layout: ConsumerBundleLayout): void {
  const permissionScriptPath = 'hooks/pluxx-permissions.mjs'
  let scriptResult: ReturnType<typeof smokeCheckInstalledPermissionHook>
  try {
    scriptResult = smokeCheckInstalledPermissionHook(rootDir, layout)
  } catch (error) {
    addCheck(checks, {
      level: 'error',
      code: 'consumer-permission-hook-invalid',
      title: 'Installed bundled permission hook behavior is broken',
      detail: error instanceof Error ? error.message : String(error),
      fix: 'Rebuild or reinstall the plugin so the bundled permission hook script and hook wiring stay aligned with the declared permission rules.',
      path: permissionScriptPath,
    })
    return
  }

  if (!scriptResult) {
    addCheck(checks, {
      level: 'info',
      code: 'consumer-permission-hook-not-applicable',
      title: 'No bundled permission hook smoke check for this install',
      detail: layout.platform === 'claude-code' || layout.platform === 'cursor'
        ? 'This installed bundle does not include hooks/pluxx-permissions.mjs.'
        : 'This platform does not currently use a bundled pluxx-permissions.mjs hook script for permission enforcement.',
      fix: 'No action needed unless you expected bundled permission-hook enforcement in this installed bundle.',
      path: permissionScriptPath,
    })
    return
  }

  addCheck(checks, {
    level: scriptResult.ok ? 'success' : 'error',
    code: scriptResult.ok ? 'consumer-permission-hook-valid' : 'consumer-permission-hook-invalid',
    title: scriptResult.ok
      ? 'Installed bundled permission hook returns expected decisions'
      : 'Installed bundled permission hook behavior is broken',
    detail: scriptResult.detail,
    fix: scriptResult.ok
      ? 'No action needed.'
      : 'Rebuild or reinstall the plugin so the bundled permission hook script and hook wiring stay aligned with the declared permission rules.',
    path: permissionScriptPath,
  })
}

function findMissingInstalledStdioRuntimePaths(
  rootDir: string,
  stdioEntries: Array<Record<string, unknown>>,
): string[] {
  const missing = new Set<string>()

  for (const server of stdioEntries) {
    const command = typeof server.command === 'string' ? server.command : undefined
    const args = Array.isArray(server.args) ? server.args.filter((value): value is string => typeof value === 'string') : []

    for (const candidate of [command, ...args]) {
      if (!candidate || !isLikelyLocalRuntimePath(candidate)) continue
      const resolvedPath = resolve(rootDir, candidate)
      if (!existsSync(resolvedPath)) {
        missing.add(candidate)
      }
    }
  }

  return [...missing].sort()
}

async function smokeCheckInstalledStdioServers(
  rootDir: string,
  stdioEntries: Array<Record<string, unknown>>,
): Promise<InstalledStdioLaunchResult[]> {
  const results: InstalledStdioLaunchResult[] = []

  for (const server of stdioEntries) {
    const serverName = typeof server.name === 'string' ? server.name : 'unknown'
    const command = typeof server.command === 'string' ? renderInstalledPluginRoot(server.command, rootDir) : ''
    const args = Array.isArray(server.args)
      ? server.args
          .filter((value): value is string => typeof value === 'string')
          .map((value) => renderInstalledPluginRoot(value, rootDir))
      : []
    const envRecord = server.env && typeof server.env === 'object'
      ? Object.fromEntries(
          Object.entries(server.env as Record<string, unknown>)
            .filter((entry): entry is [string, string] => typeof entry[1] === 'string')
            .map(([key, value]) => [key, renderInstalledPluginRoot(value, rootDir)]),
        )
      : {}

    if (command.trim().length === 0) {
      results.push({
        serverName,
        command: '',
        ok: false,
        detail: 'stdio command is empty',
      })
      continue
    }

    const renderedCommand = [command, ...args].join(' ')
    const stdoutChunks: Buffer[] = []
    const stderrChunks: Buffer[] = []

    const child = spawn(command, args, {
      cwd: rootDir,
      env: {
        ...process.env,
        ...envRecord,
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    child.stdout?.on('data', (chunk) => {
      if (stdoutChunks.reduce((sum, entry) => sum + entry.length, 0) < 4096) {
        stdoutChunks.push(Buffer.from(chunk))
      }
    })
    child.stderr?.on('data', (chunk) => {
      if (stderrChunks.reduce((sum, entry) => sum + entry.length, 0) < 4096) {
        stderrChunks.push(Buffer.from(chunk))
      }
    })

    const exitResult = await new Promise<InstalledStdioLaunchResult>((resolveResult) => {
      let settled = false
      const settle = (result: InstalledStdioLaunchResult) => {
        if (settled) return
        settled = true
        clearTimeout(timeout)
        resolveResult(result)
      }

      const timeout = setTimeout(() => {
        child.stdin?.end()
        child.kill('SIGTERM')
        settle({
          serverName,
          command: renderedCommand,
          ok: true,
          detail: `process stayed alive for ${STDIO_LAUNCH_SMOKE_TIMEOUT_MS}ms before teardown`,
        })
      }, STDIO_LAUNCH_SMOKE_TIMEOUT_MS)

      child.once('error', (error) => {
        settle({
          serverName,
          command: renderedCommand,
          ok: false,
          detail: `failed to spawn: ${error.message}`,
        })
      })

      child.once('exit', (code, signal) => {
        const stdout = Buffer.concat(stdoutChunks).toString('utf-8').trim()
        const stderr = Buffer.concat(stderrChunks).toString('utf-8').trim()
        const output = [stderr, stdout].filter(Boolean).join(' | ')
        settle({
          serverName,
          command: renderedCommand,
          ok: false,
          detail: `process exited before ready window (code=${code ?? 'null'}, signal=${signal ?? 'null'})${output ? `: ${output}` : ''}`,
        })
      })
    })

    results.push(exitResult)
  }

  return results
}

function isLikelyLocalRuntimePath(value: string): boolean {
  return value.startsWith('./')
    || value.startsWith('../')
    || value.startsWith('.\\')
    || value.startsWith('..\\')
}

function isLikelyOpenCodeInstallPath(rootDir: string): boolean {
  const parent = dirname(rootDir)
  const grandparent = dirname(parent)
  return basename(parent) === 'plugins' && basename(grandparent) === 'opencode'
}

function checkInstalledOpenCodeHostBridge(checks: DoctorCheck[], rootDir: string): void {
  if (!isLikelyOpenCodeInstallPath(rootDir)) {
    addCheck(checks, {
      level: 'info',
      code: 'consumer-opencode-host-bridge-not-applicable',
      title: 'No OpenCode host bridge check for this path',
      detail: 'This OpenCode bundle is not located under ~/.config/opencode/plugins, so host-visible wrapper checks are skipped.',
      fix: 'Point --consumer at the installed OpenCode plugin directory to validate host-visible wiring.',
      path: 'package.json',
    })
    return
  }

  const pluginName = basename(rootDir)
  const entryPath = `${rootDir}.ts`
  const entryRelativePath = `${pluginName}.ts`
  if (!existsSync(entryPath)) {
    addCheck(checks, {
      level: 'error',
      code: 'consumer-opencode-entry-missing',
      title: 'OpenCode host entry file missing',
      detail: `OpenCode auto-loads top-level plugin files, but ${entryPath} does not exist for this installed bundle.`,
      fix: 'Reinstall the plugin so Pluxx can recreate the top-level OpenCode entry file.',
      path: entryRelativePath,
    })
    return
  }

  const entryContent = readFileSync(entryPath, 'utf-8')
  const expectedImport = `import * as PluginModule from "./${pluginName}/index.ts"`
  const expectedBridge = `directory: join(context.directory, "${pluginName}")`

  if (!entryContent.includes(expectedImport) || !entryContent.includes(expectedBridge)) {
    addCheck(checks, {
      level: 'error',
      code: 'consumer-opencode-entry-invalid',
      title: 'OpenCode host entry file does not match the installed bundle',
      detail: `${entryPath} exists, but it does not proxy into ./${pluginName}/index.ts with the expected plugin-root bridge.`,
      fix: 'Reinstall the plugin so Pluxx can rewrite the OpenCode entry wrapper.',
      path: entryRelativePath,
    })
  } else {
    addCheck(checks, {
      level: 'success',
      code: 'consumer-opencode-entry-valid',
      title: 'OpenCode host entry file is present',
      detail: `${entryRelativePath} proxies into the installed ${pluginName} bundle.`,
      fix: 'No action needed.',
      path: entryRelativePath,
    })
  }
}

function checkInstalledOpenCodeSkills(checks: DoctorCheck[], rootDir: string): void {
  if (!isLikelyOpenCodeInstallPath(rootDir)) {
    return
  }

  const pluginName = basename(rootDir)
  const sourceSkillsDir = resolve(rootDir, 'skills')
  if (!existsSync(sourceSkillsDir)) {
    addCheck(checks, {
      level: 'info',
      code: 'consumer-opencode-skill-sync-not-applicable',
      title: 'No OpenCode skills exported from this bundle',
      detail: 'This installed OpenCode bundle does not include a skills directory, so no global skill sync is required.',
      fix: 'No action needed.',
      path: 'skills',
    })
    return
  }

  const skillRoot = resolve(dirname(dirname(rootDir)), 'skills')
  const missingSkills: string[] = []
  const malformedSkills: string[] = []
  let expectedSkillCount = 0

  for (const entry of readdirSync(sourceSkillsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue

    const sourceSkillPath = resolve(sourceSkillsDir, entry.name, 'SKILL.md')
    if (!existsSync(sourceSkillPath)) continue
    expectedSkillCount++

    const installedSkillPath = resolve(skillRoot, `${pluginName}-${entry.name}`, 'SKILL.md')
    if (!existsSync(installedSkillPath)) {
      missingSkills.push(`${pluginName}-${entry.name}`)
      continue
    }

    const installedContent = readFileSync(installedSkillPath, 'utf-8')
    if (!installedContent.includes(`${pluginName}/`)) {
      malformedSkills.push(`${pluginName}-${entry.name}`)
    }
  }

  if (expectedSkillCount === 0) {
    addCheck(checks, {
      level: 'info',
      code: 'consumer-opencode-skill-sync-not-applicable',
      title: 'No OpenCode skills exported from this bundle',
      detail: 'This installed OpenCode bundle does not define any skill directories with SKILL.md files.',
      fix: 'No action needed.',
      path: 'skills',
    })
    return
  }

  if (missingSkills.length > 0 || malformedSkills.length > 0) {
    const missingDetail = missingSkills.length > 0
      ? `missing exported skills: ${missingSkills.join(', ')}`
      : undefined
    const malformedDetail = malformedSkills.length > 0
      ? `malformed exported skills: ${malformedSkills.join(', ')}`
      : undefined
    addCheck(checks, {
      level: 'error',
      code: 'consumer-opencode-skill-sync-incomplete',
      title: 'OpenCode exported skills are incomplete',
      detail: [missingDetail, malformedDetail].filter(Boolean).join('; '),
      fix: 'Reinstall the plugin so Pluxx can resync OpenCode skills into ~/.config/opencode/skills.',
      path: 'skills',
    })
    return
  }

  addCheck(checks, {
    level: 'success',
    code: 'consumer-opencode-skill-sync-valid',
    title: 'OpenCode exported skills are synced',
    detail: `Found ${expectedSkillCount} synced OpenCode skill${expectedSkillCount === 1 ? '' : 's'} under ~/.config/opencode/skills.`,
    fix: 'No action needed.',
    path: 'skills',
  })
}

export async function doctorConsumer(
  rootDir: string = process.cwd(),
  options: DoctorConsumerOptions = {},
): Promise<DoctorReport> {
  const checks: DoctorCheck[] = []
  addRuntimeChecks(checks, 'consumer')

  checkConsumerBundlePath(checks, rootDir)
  const layout = detectConsumerLayout(rootDir)

  if (layout.kind === 'source-project') {
    addCheck(checks, {
      level: 'error',
      code: 'consumer-source-project',
      title: 'Consumer doctor expects an installed or built platform bundle',
      detail: `Found a pluxx source project at ${rootDir}, not a built platform directory.`,
      fix: 'Run `pluxx doctor` in the source project, or run `pluxx doctor --consumer <dist/platform>` against an installed or built bundle.',
    })
    return summarizeChecks(checks)
  }

  if (layout.kind === 'multi-target-dist') {
    addCheck(checks, {
      level: 'error',
      code: 'consumer-dist-root',
      title: 'Consumer doctor expects one platform directory at a time',
      detail: `Found a multi-target dist root at ${rootDir}.`,
      fix: 'Point --consumer at one built platform directory such as dist/cursor or an installed plugin path.',
    })
    return summarizeChecks(checks)
  }

  if (layout.kind === 'unknown') {
    addCheck(checks, {
      level: 'error',
      code: 'consumer-platform-unknown',
      title: 'Could not detect an installed plugin layout',
      detail: `No known installed plugin markers were found in ${rootDir}.`,
      fix: 'Pass the root of a built platform bundle or installed plugin directory to pluxx doctor --consumer.',
    })
    return summarizeChecks(checks)
  }

  addCheck(checks, {
    level: 'success',
    code: 'consumer-platform-detected',
    title: 'Installed platform bundle detected',
    detail: `Detected a ${layout.platform} plugin bundle.`,
    fix: 'No action needed.',
    path: layout.manifestPath,
  })

  checkConsumerManifest(checks, rootDir, layout)
  checkInstalledBundleIntegrity(checks, rootDir, layout)
  checkInstalledClaudeHookSettings(checks, rootDir, layout, options)
  checkInstalledCodexHooksFeatureFlag(checks, rootDir, layout, options)
  checkInstalledCodexProjectTrust(checks, rootDir, layout, options)
  checkInstalledCodexPermissionCompanion(checks, rootDir, layout, options)
  checkInstalledPermissionHook(checks, rootDir, layout)
  checkInstalledUserConfig(checks, rootDir)
  checkInstalledEnvValidation(checks, rootDir)
  checkInstalledRuntimeScriptRoles(checks, rootDir)
  await checkInstalledMcpConfig(checks, rootDir, layout)
  if (layout.platform === 'opencode') {
    checkInstalledOpenCodeHostBridge(checks, rootDir)
    checkInstalledOpenCodeSkills(checks, rootDir)
  }

  return summarizeChecks(checks)
}

export async function doctorProject(rootDir: string = process.cwd()): Promise<DoctorReport> {
  const checks: DoctorCheck[] = []
  const configPath = CONFIG_FILES.find((filename) => existsSync(resolve(rootDir, filename)))
  addRuntimeChecks(checks, 'project')

  if (!configPath) {
    addCheck(checks, {
      level: 'error',
      code: 'config-not-found',
      title: 'pluxx config not found',
      detail: `Expected one of ${CONFIG_FILES.join(', ')} in ${rootDir}.`,
      fix: 'Create a pluxx.config.ts, pluxx.config.js, or pluxx.config.json file in the project root.',
    })
    return summarizeChecks(checks)
  }

  addCheck(checks, {
    level: 'success',
    code: 'config-found',
    title: 'pluxx config found',
    detail: `Detected ${configPath} in the project root.`,
    fix: 'No action needed.',
    path: configPath,
  })

  let config: PluginConfig
  try {
    config = await loadConfig(rootDir)
    addCheck(checks, {
      level: 'success',
      code: 'config-valid',
      title: 'Config parsed successfully',
      detail: `Loaded ${config.name}@${config.version} for ${config.targets.length} target(s).`,
      fix: 'No action needed.',
      path: configPath,
    })
  } catch (error) {
    addCheck(checks, {
      level: 'error',
      code: 'config-invalid',
      title: 'Config could not be loaded',
      detail: error instanceof Error ? error.message : String(error),
      fix: 'Fix the config error and rerun pluxx doctor.',
      path: configPath,
    })
    return summarizeChecks(checks)
  }

  checkReadablePath(checks, rootDir, 'Skills', config.skills, true)
  checkReadablePath(checks, rootDir, 'Instructions', config.instructions, false)
  checkReadablePath(checks, rootDir, 'Agents', config.agents, false)
  checkReadablePath(checks, rootDir, 'Commands', config.commands, false)
  checkReadablePath(checks, rootDir, 'Scripts', config.scripts, false)
  checkReadablePath(checks, rootDir, 'Assets', config.assets, false)
  checkTargetPlatforms(checks, config)
  checkPrimitiveTranslations(checks, config)
  checkRuntimeReadiness(checks, config)
  checkMcpConfig(checks, config)
  checkUserConfig(checks, config)
  checkScaffoldMetadata(checks, rootDir, config)
  checkCompilerIntent(checks, rootDir)
  checkHookTrust(checks, config)
  checkBrandMetadataCompleteness(checks, config)

  for (const target of config.targets) {
    const limits = PLATFORM_LIMITS[target]
    if (!CORE_FOUR.has(target) && limits) {
      addCheck(checks, {
        level: 'info',
        code: 'target-caveat',
        title: `Platform caveat for ${target}`,
        detail: `${target} is supported, but it is currently less validated than the core four targets.`,
        fix: 'Use pluxx lint and pluxx test before relying on beta targets in production.',
        path: 'pluxx.config.ts',
      })
    }
  }

  return {
    ...summarizeChecks(checks),
    primitiveSummary: buildPrimitiveTranslationSummary(config, config.targets),
  }
}

export function printDoctorReport(report: DoctorReport): void {
  const visibleChecks = report.checks.filter((check) => !check.code.startsWith('primitive-'))

  for (const check of visibleChecks) {
    const prefix = check.level.toUpperCase().padEnd(7, ' ')
    const pathLabel = check.path ? ` [${check.path}]` : ''
    console.log(`${prefix} ${check.code}${pathLabel} ${check.title}`)
    console.log(`         ${check.detail}`)
    console.log(`         Fix: ${check.fix}`)
  }

  const primitiveLines = renderPrimitiveTranslationSummary(report.primitiveSummary)
  if (primitiveLines.length > 0) {
    if (visibleChecks.length > 0) {
      console.log('')
    }
    for (const line of primitiveLines) {
      console.log(line)
    }
  }

  console.log('')
  console.log(
    `Doctor summary: ${report.errors} error(s), ${report.warnings} warning(s), ${report.infos} info message(s)`,
  )
}
