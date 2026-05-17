import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { createHash } from 'crypto'
import { resolve } from 'path'
import { spawnSync } from 'child_process'
import { tmpdir } from 'os'
import type { PluginConfig, TargetPlatform } from '../schema'
import { collectUserConfigEntries, defaultUserConfigEnvVar } from '../user-config'
import { getPublishReloadInstruction } from '../distribution-lifecycle'

type PublishChannel = 'npm' | 'github-release'
type PublishAssetKind = 'archive' | 'installer' | 'manifest' | 'checksum'
type ReleaseArchiveVariant = 'versioned' | 'latest'

interface CommandResult {
  status: number | null
  stdout: string
  stderr: string
}

type CommandRunner = (
  command: string,
  args: string[],
  options?: { cwd?: string },
) => CommandResult

export interface PublishPlanOptions {
  requestedChannels?: PublishChannel[]
  version?: string
  tag?: string
  dryRun?: boolean
  allowDirty?: boolean
  rootDir?: string
  runCommand?: CommandRunner
}

export interface PublishAssetPlan {
  kind: PublishAssetKind
  name: string
  path: string
  platform?: TargetPlatform
  variant?: ReleaseArchiveVariant
}

export interface PublishCheck {
  name: string
  ok: boolean
  code: string
  detail?: string
}

export interface PublishPlan {
  command: 'publish'
  dryRun: boolean
  version: string
  tag: string
  channels: {
    npm: {
      enabled: boolean
      explicit: boolean
      packageName?: string
      packageDir?: string
      wouldPublish: boolean
    }
    githubRelease: {
      enabled: boolean
      explicit: boolean
      repo?: string
      releaseTag?: string
      wouldCreateRelease: boolean
      assets: PublishAssetPlan[]
    }
  }
  checks: PublishCheck[]
}

export interface PublishRunResult extends PublishPlan {
  ok: boolean
  execution?: {
    npm?: { ok: boolean; detail?: string }
    githubRelease?: { ok: boolean; detail?: string }
  }
}

interface ReleaseArtifactContext {
  repo: string
  version: string
  releaseTag: string
  builtTargets: TargetPlatform[]
  installerTargets: Array<typeof INSTALLER_TARGETS[number]>
  assetBaseURL: string
}

const INSTALLER_TARGETS = ['claude-code', 'cursor', 'codex', 'opencode'] as const satisfies readonly TargetPlatform[]

function runCommandDefault(command: string, args: string[], options?: { cwd?: string }): CommandResult {
  const result = spawnSync(command, args, {
    cwd: options?.cwd,
    encoding: 'utf-8',
  })

  return {
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  }
}

function isTargetNpmBacked(platform: TargetPlatform): boolean {
  return platform === 'opencode'
}

function isInstallerTarget(platform: TargetPlatform): platform is typeof INSTALLER_TARGETS[number] {
  return INSTALLER_TARGETS.includes(platform as typeof INSTALLER_TARGETS[number])
}

function resolveRequestedChannels(options: PublishPlanOptions): {
  requested: Set<PublishChannel>
  explicit: { npm: boolean; githubRelease: boolean }
} {
  const requested = new Set<PublishChannel>(options.requestedChannels ?? [])
  return {
    requested,
    explicit: {
      npm: requested.has('npm'),
      githubRelease: requested.has('github-release'),
    },
  }
}

function getBuiltTargets(rootDir: string, config: PluginConfig): TargetPlatform[] {
  return config.targets.filter((platform) =>
    existsSync(resolve(rootDir, config.outDir, platform)),
  )
}

function getArchiveAssetName(pluginName: string, platform: TargetPlatform, version: string, variant: ReleaseArchiveVariant): string {
  return variant === 'versioned'
    ? `${pluginName}-${platform}-v${version}.tar.gz`
    : `${pluginName}-${platform}-latest.tar.gz`
}

function getInstallerScriptName(platform: typeof INSTALLER_TARGETS[number]): string {
  return `install-${platform}.sh`
}

function buildReleaseAssets(rootDir: string, config: PluginConfig, version: string, targets: TargetPlatform[]): PublishAssetPlan[] {
  const assets: PublishAssetPlan[] = []

  for (const platform of targets) {
    const bundlePath = resolve(rootDir, config.outDir, platform)
    assets.push({
      kind: 'archive',
      platform,
      variant: 'versioned',
      name: getArchiveAssetName(config.name, platform, version, 'versioned'),
      path: bundlePath,
    })
    assets.push({
      kind: 'archive',
      platform,
      variant: 'latest',
      name: getArchiveAssetName(config.name, platform, version, 'latest'),
      path: bundlePath,
    })
  }

  const installerTargets = targets.filter(isInstallerTarget)
  for (const platform of installerTargets) {
    assets.push({
      kind: 'installer',
      platform,
      name: getInstallerScriptName(platform),
      path: '(generated installer script)',
    })
  }

  if (installerTargets.length > 0) {
    assets.push({
      kind: 'installer',
      name: 'install-all.sh',
      path: '(generated installer script)',
    })
  }

  assets.push({
    kind: 'manifest',
    name: 'release-manifest.json',
    path: '(generated manifest)',
  })
  assets.push({
    kind: 'checksum',
    name: 'SHA256SUMS.txt',
    path: '(generated checksums)',
  })

  return assets
}

function readNpmPackageName(rootDir: string, config: PluginConfig): { packageName?: string; packageDir?: string } {
  const packageDir = resolve(rootDir, config.outDir, 'opencode')
  const packageJsonPath = resolve(packageDir, 'package.json')
  if (!existsSync(packageJsonPath)) {
    return {}
  }

  try {
    const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf-8')) as { name?: string }
    return {
      packageName: pkg.name,
      packageDir,
    }
  } catch {
    return {
      packageDir,
    }
  }
}

function parseGithubRepoSlug(value: string | undefined): string | undefined {
  if (!value) return undefined

  const normalized = value
    .trim()
    .replace(/^git\+/, '')
    .replace(/^ssh:\/\//, '')
    .replace(/\.git$/, '')

  const githubUrlMatch = normalized.match(/^https?:\/\/github\.com\/([^/]+\/[^/]+)$/i)
  if (githubUrlMatch) return githubUrlMatch[1]

  const sshMatch = normalized.match(/^git@github\.com:([^/]+\/[^/]+)$/i)
  if (sshMatch) return sshMatch[1]

  return undefined
}

function resolveGithubRepo(rootDir: string, config: PluginConfig, runCommand: CommandRunner): string | undefined {
  const configuredRepo = parseGithubRepoSlug(config.repository)
  if (configuredRepo) return configuredRepo

  const remote = runCommand('git', ['config', '--get', 'remote.origin.url'], { cwd: rootDir })
  if (remote.status === 0) {
    return parseGithubRepoSlug(remote.stdout.trim())
  }

  return undefined
}

function collectChecks(args: {
  rootDir: string
  config: PluginConfig
  npmEnabled: boolean
  githubReleaseEnabled: boolean
  allowDirty: boolean
  packageDir?: string
  packageName?: string
  githubRepo?: string
  runCommand: CommandRunner
}): PublishCheck[] {
  const builtTargets = getBuiltTargets(args.rootDir, args.config)
  const checks: PublishCheck[] = [
    {
      name: 'artifacts-exist',
      ok: builtTargets.length > 0,
      code: 'artifacts-exist',
      detail: builtTargets.length > 0
        ? `Built targets: ${builtTargets.join(', ')}`
        : `No built platform outputs found in ${args.config.outDir}/`,
    },
  ]

  const gitStatus = args.runCommand('git', ['status', '--porcelain'], { cwd: args.rootDir })
  checks.push({
    name: 'git-clean',
    ok: args.allowDirty || (gitStatus.status === 0 && gitStatus.stdout.trim() === ''),
    code: 'git-clean',
    detail: args.allowDirty
      ? 'Working tree cleanliness check skipped via --allow-dirty.'
      : gitStatus.status !== 0
      ? (gitStatus.stderr || gitStatus.stdout || 'Unable to read git status')
      : gitStatus.stdout.trim() === ''
        ? 'Working tree is clean.'
        : 'Working tree has uncommitted changes.',
  })

  if (args.npmEnabled) {
    checks.push({
      name: 'npm-package-ready',
      ok: Boolean(args.packageDir && existsSync(resolve(args.packageDir, 'package.json')) && args.packageName),
      code: 'npm-package-ready',
      detail: args.packageDir
        ? `OpenCode package dir: ${args.packageDir}`
        : 'No npm-backed target package found.',
    })

    const npmAuth = args.runCommand('npm', ['whoami'], { cwd: args.rootDir })
    checks.push({
      name: 'npm-auth',
      ok: npmAuth.status === 0,
      code: 'npm-auth',
      detail: npmAuth.status === 0
        ? (npmAuth.stdout.trim() || 'npm auth OK')
        : (npmAuth.stderr || npmAuth.stdout || 'npm auth unavailable'),
    })
  }

  if (args.githubReleaseEnabled) {
    const ghAuth = args.runCommand('gh', ['auth', 'status'], { cwd: args.rootDir })
    checks.push({
      name: 'github-release-auth',
      ok: ghAuth.status === 0,
      code: 'github-release-auth',
      detail: ghAuth.status === 0
        ? 'gh auth OK'
        : (ghAuth.stderr || ghAuth.stdout || 'gh auth unavailable'),
    })
    checks.push({
      name: 'github-release-repo',
      ok: Boolean(args.githubRepo),
      code: 'github-release-repo',
      detail: args.githubRepo
        ? `Resolved GitHub repo: ${args.githubRepo}`
        : 'Could not resolve a GitHub repository slug from config.repository or remote.origin.url.',
    })
  }

  return checks
}

export function planPublish(config: PluginConfig, options: PublishPlanOptions = {}): PublishPlan {
  const rootDir = options.rootDir ?? process.cwd()
  const runCommand = options.runCommand ?? runCommandDefault
  const builtTargets = getBuiltTargets(rootDir, config)
  const { requested, explicit } = resolveRequestedChannels(options)
  const defaultNpm = builtTargets.some(isTargetNpmBacked)
  const defaultGithubRelease = builtTargets.length > 0
  const npmEnabled = explicit.npm ? true : (requested.size === 0 ? defaultNpm : false)
  const githubReleaseEnabled = explicit.githubRelease ? true : (requested.size === 0 ? defaultGithubRelease : false)
  const version = options.version ?? config.version
  const tag = options.tag ?? 'latest'
  const { packageDir, packageName } = readNpmPackageName(rootDir, config)
  const githubRepo = githubReleaseEnabled
    ? resolveGithubRepo(rootDir, config, runCommand)
    : undefined
  const checks = collectChecks({
    rootDir,
    config,
    npmEnabled,
    githubReleaseEnabled,
    allowDirty: options.allowDirty ?? false,
    packageDir,
    packageName,
    githubRepo,
    runCommand,
  })

  return {
    command: 'publish',
    dryRun: options.dryRun ?? false,
    version,
    tag,
    channels: {
      npm: {
        enabled: npmEnabled,
        explicit: explicit.npm,
        packageName,
        packageDir,
        wouldPublish: npmEnabled,
      },
      githubRelease: {
        enabled: githubReleaseEnabled,
        explicit: explicit.githubRelease,
        repo: githubRepo,
        releaseTag: githubReleaseEnabled ? `v${version}` : undefined,
        wouldCreateRelease: githubReleaseEnabled,
        assets: githubReleaseEnabled ? buildReleaseAssets(rootDir, config, version, builtTargets) : [],
      },
    },
    checks,
  }
}

function getDisplayName(config: PluginConfig): string {
  return config.brand?.displayName ?? config.name
}

function getHomepageUrl(config: PluginConfig, repo: string): string {
  return config.brand?.websiteURL ?? config.repository ?? `https://github.com/${repo}`
}

function getAuthorName(config: PluginConfig): string {
  return config.author?.name ?? 'Pluxx'
}

function buildAssetBaseUrl(repo: string): string {
  return `https://github.com/${repo}/releases/latest/download`
}

function buildReleaseManifest(config: PluginConfig, context: ReleaseArtifactContext): string {
  const archives = context.builtTargets.map((platform) => ({
    platform,
    versionedAsset: getArchiveAssetName(config.name, platform, context.version, 'versioned'),
    latestAsset: getArchiveAssetName(config.name, platform, context.version, 'latest'),
    latestUrl: `${context.assetBaseURL}/${getArchiveAssetName(config.name, platform, context.version, 'latest')}`,
  }))

  const installers = context.installerTargets.map((platform) => ({
    platform,
    script: getInstallerScriptName(platform),
    url: `${context.assetBaseURL}/${getInstallerScriptName(platform)}`,
    command: `curl -fsSL ${context.assetBaseURL}/${getInstallerScriptName(platform)} | bash`,
  }))

  const manifest = {
    version: 1,
    plugin: {
      name: config.name,
      displayName: getDisplayName(config),
      description: config.description,
      version: context.version,
      author: config.author,
      license: config.license,
      repository: config.repository,
      homepage: getHomepageUrl(config, context.repo),
    },
    githubRelease: {
      repo: context.repo,
      tag: context.releaseTag,
      latestBaseUrl: context.assetBaseURL,
    },
    assets: {
      archives,
      installers,
      installAll: installers.length > 0
        ? {
            script: 'install-all.sh',
            url: `${context.assetBaseURL}/install-all.sh`,
            command: `curl -fsSL ${context.assetBaseURL}/install-all.sh | bash`,
          }
        : undefined,
      checksums: 'SHA256SUMS.txt',
    },
  }

  return `${JSON.stringify(manifest, null, 2)}\n`
}

function renderInstallAllScript(installerTargets: Array<typeof INSTALLER_TARGETS[number]>): string {
  const scriptNames = installerTargets.map((platform) => getInstallerScriptName(platform))
  return `#!/usr/bin/env bash
set -euo pipefail

REPO="\${PLUXX_PLUGIN_REPO:-__REPO__}"
TMP_DIR="$(mktemp -d)"
cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

for script in ${scriptNames.map((name) => `"${name}"`).join(' ')}; do
  curl -fsSL "https://github.com/\${REPO}/releases/latest/download/\${script}" -o "$TMP_DIR/\${script}"
  chmod +x "$TMP_DIR/\${script}"
  "$TMP_DIR/\${script}"
done

echo
echo "Installed __DISPLAY_NAME__ across ${installerTargets.join(', ')}."
`.replaceAll('__REPO__', 'REPO_PLACEHOLDER').replaceAll('__DISPLAY_NAME__', 'DISPLAY_PLACEHOLDER')
}

function renderInstallerUserConfigSnippet(config: PluginConfig, platform: TargetPlatform, installDirVariable: string): string {
  const entries = collectUserConfigEntries(config, [platform])
    .map((entry) => ({
      key: entry.key,
      title: entry.title,
      type: entry.type ?? 'string',
      required: entry.required !== false,
      envVar: entry.envVar ?? defaultUserConfigEnvVar(entry.key),
    }))

  if (entries.length === 0) return ''

  const promptLines = entries.map((entry) => {
    const functionName = entry.type === 'secret' ? 'pluxx_prompt_secret_config' : 'pluxx_prompt_text_config'
    return `${functionName} ${JSON.stringify(entry.envVar)} ${JSON.stringify(entry.title)} ${entry.required ? '1' : '0'}`
  })

  return `
PLUXX_USER_CONFIG_SPEC="$(cat <<'PLUXX_USER_CONFIG_JSON'
${JSON.stringify(entries)}
PLUXX_USER_CONFIG_JSON
)"

pluxx_is_placeholder_secret() {
  case "$1" in
    *dummy*|*Dummy*|*DUMMY*|*placeholder*|*Placeholder*|*PLACEHOLDER*|*changeme*|*CHANGE_ME*|*replace*me*|*Replace*Me*|*your*key*|*YOUR*KEY*|*api*key*here*|*API*KEY*HERE*|*token*here*|*TOKEN*HERE*)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

pluxx_prompt_secret_config() {
  local env_var="$1"
  local label="$2"
  local required="$3"
  local current_value="\${!env_var:-}"

  if [[ -z "$current_value" && "$required" == "1" ]]; then
    if [[ -t 0 || -r /dev/tty ]]; then
      read -r -s -p "$label [$env_var]: " current_value </dev/tty
      echo >/dev/tty
    else
      echo "Missing required config: export $env_var before running this installer." >&2
      exit 1
    fi
  fi

  if [[ -n "$current_value" ]] && pluxx_is_placeholder_secret "$current_value"; then
    echo "Refusing placeholder-looking secret for $env_var. Set a real value and rerun the installer." >&2
    exit 1
  fi

  export "$env_var=$current_value"
}

pluxx_prompt_text_config() {
  local env_var="$1"
  local label="$2"
  local required="$3"
  local current_value="\${!env_var:-}"

  if [[ -z "$current_value" && "$required" == "1" ]]; then
    if [[ -t 0 || -r /dev/tty ]]; then
      read -r -p "$label [$env_var]: " current_value </dev/tty
    else
      echo "Missing required config: export $env_var before running this installer." >&2
      exit 1
    fi
  fi

  export "$env_var=$current_value"
}

${promptLines.join('\n')}

export PLUXX_USER_CONFIG_SPEC
export PLUXX_INSTALL_DIR="${installDirVariable}"

node <<'NODE'
const fs = require('fs')
const path = require('path')

const installDir = process.env.PLUXX_INSTALL_DIR
const spec = JSON.parse(process.env.PLUXX_USER_CONFIG_SPEC || '[]')

if (installDir && spec.length > 0) {
  const env = {}
  const values = {}

  for (const entry of spec) {
    const value = process.env[entry.envVar]
    if (value === undefined || value === '') continue
    values[entry.key] = value
    env[entry.envVar] = value
  }

  fs.writeFileSync(
    path.join(installDir, '.pluxx-user.json'),
    JSON.stringify({ values, env }, null, 2) + '\\n',
  )

  const envScriptPath = path.join(installDir, 'scripts/check-env.sh')
  if (fs.existsSync(envScriptPath)) {
    fs.writeFileSync(
      envScriptPath,
      '#!/usr/bin/env bash\\nset -euo pipefail\\n# pluxx install materialized required config for this local plugin install.\\nexit 0\\n',
    )
  }

  const materialize = (value) =>
    typeof value === 'string'
      ? value.replace(/\\$\\{([A-Za-z_][A-Za-z0-9_]*)\\}/g, (_match, name) => env[name] || '${' + name + '}')
      : value

  const materializeRecord = (record) => {
    if (!record || typeof record !== 'object') return record
    const next = {}
    for (const [key, value] of Object.entries(record)) {
      next[key] = materialize(value)
    }
    return next
  }

  for (const relativePath of ['.mcp.json', 'mcp.json']) {
    const filepath = path.join(installDir, relativePath)
    if (!fs.existsSync(filepath)) continue

    const payload = JSON.parse(fs.readFileSync(filepath, 'utf8'))
    for (const server of Object.values(payload.mcpServers || {})) {
      if (!server || typeof server !== 'object') continue

      if (server.env) {
        server.env = materializeRecord(server.env)
      }

      if (server.bearer_token_env_var && env[server.bearer_token_env_var]) {
        server.http_headers = {
          ...(server.http_headers || {}),
          Authorization: 'Bearer ' + env[server.bearer_token_env_var],
        }
        delete server.bearer_token_env_var
      }

      if (server.env_http_headers && typeof server.env_http_headers === 'object') {
        server.http_headers = {
          ...(server.http_headers || {}),
        }
        for (const [headerName, envVar] of Object.entries(server.env_http_headers)) {
          if (env[envVar]) server.http_headers[headerName] = env[envVar]
        }
        delete server.env_http_headers
      }

      if (server.headers) {
        server.headers = materializeRecord(server.headers)
      }
      if (server.http_headers) {
        server.http_headers = materializeRecord(server.http_headers)
      }
    }

    fs.writeFileSync(filepath, JSON.stringify(payload, null, 2) + '\\n')
  }
}
NODE
`
}

function hasInstallerUserConfig(config: PluginConfig, platform: TargetPlatform): boolean {
  return collectUserConfigEntries(config, [platform]).length > 0
}

function renderInstallerMcpPathMaterializationSnippet(platform: TargetPlatform, installDirVariable: string): string {
  if (platform !== 'codex') return ''

  return `
export PLUXX_INSTALL_DIR="${installDirVariable}"

node <<'NODE'
const fs = require('fs')
const path = require('path')

const installDir = process.env.PLUXX_INSTALL_DIR

if (installDir) {
  const materializeInstalledStdioPath = (value) => {
    if (typeof value !== 'string') return value

    const normalized = value.replace(/\\\\/g, '/')
    const rootRef = normalized.match(/^\\$\\{(?:CLAUDE_PLUGIN_ROOT|CURSOR_PLUGIN_ROOT|PLUGIN_ROOT)\\}[\\\\/](.+)$/)

    if (rootRef) {
      return path.resolve(installDir, rootRef[1])
    }

    if (normalized.startsWith('./') || normalized.startsWith('../')) {
      return path.resolve(installDir, normalized)
    }

    return value
  }

  for (const relativePath of ['.mcp.json', 'mcp.json']) {
    const filepath = path.join(installDir, relativePath)
    if (!fs.existsSync(filepath)) continue

    const payload = JSON.parse(fs.readFileSync(filepath, 'utf8'))
    let changed = false

    for (const server of Object.values(payload.mcpServers || {})) {
      if (!server || typeof server !== 'object') continue

      if (typeof server.command === 'string') {
        const nextCommand = materializeInstalledStdioPath(server.command)
        changed ||= nextCommand !== server.command
        server.command = nextCommand
      }

      if (Array.isArray(server.args)) {
        const nextArgs = server.args.map(materializeInstalledStdioPath)
        changed ||= nextArgs.some((value, index) => value !== server.args[index])
        server.args = nextArgs
      }
    }

    if (changed) {
      fs.writeFileSync(filepath, JSON.stringify(payload, null, 2) + '\\n')
    }
  }
}
NODE
`
}

function renderInstallerRuntimeBootstrapSnippet(installDirVariable: string): string {
  return `
if [[ -f "${installDirVariable}/scripts/bootstrap-runtime.sh" ]]; then
  echo "Preparing local plugin runtime dependencies..."
  bash "${installDirVariable}/scripts/bootstrap-runtime.sh"
fi
`
}

function renderInstallerCodexPluginHooksSnippet(installDirVariable: string): string {
  return `
export PLUXX_INSTALL_DIR="${installDirVariable}"

set +e
node <<'NODE'
const fs = require('fs')
const path = require('path')

const installDir = process.env.PLUXX_INSTALL_DIR
if (!installDir) process.exit(0)

const manifestPath = path.join(installDir, '.codex-plugin/plugin.json')
const standardHooksPath = path.join(installDir, 'hooks/hooks.json')
let hasPluginHooks = fs.existsSync(standardHooksPath)

if (fs.existsSync(manifestPath)) {
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
    const manifestHooks = manifest.hooks
    hasPluginHooks ||= typeof manifestHooks === 'string' && manifestHooks.trim().length > 0
    hasPluginHooks ||= Array.isArray(manifestHooks) && manifestHooks.length > 0
    hasPluginHooks ||= manifestHooks && typeof manifestHooks === 'object' && Object.keys(manifestHooks).length > 0
    hasPluginHooks ||= manifestHooks === true
  } catch {}
}

process.exit(hasPluginHooks ? 0 : 2)
NODE
PLUXX_CODEX_BUNDLE_HAS_HOOKS="$?"
set -e

if [[ "$PLUXX_CODEX_BUNDLE_HAS_HOOKS" == "0" ]]; then
  CODEX_HOME_DIR="\${CODEX_HOME:-$HOME/.codex}"
  CODEX_CONFIG_PATH="\${PLUXX_CODEX_CONFIG_PATH:-$CODEX_HOME_DIR/config.toml}"
  PLUXX_CODEX_HOOKS_MODE="\${PLUXX_CODEX_ENABLE_PLUGIN_HOOKS:-prompt}"

  export CODEX_CONFIG_PATH
  if node <<'NODE'
const fs = require('fs')
const filepath = process.env.CODEX_CONFIG_PATH

function stripTomlComment(line) {
  let quote = null
  let escaped = false
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]
    if (escaped) {
      escaped = false
      continue
    }
    if (quote && char === '\\\\') {
      escaped = true
      continue
    }
    if (char === '"' || char === "'") {
      quote = quote === char ? null : quote || char
      continue
    }
    if (!quote && char === '#') return line.slice(0, index)
  }
  return line
}

function isTomlTrue(rawValue) {
  return /^true\\b/i.test(rawValue.trim())
}

let text = ''
try {
  text = fs.readFileSync(filepath, 'utf8')
} catch {
  process.exit(1)
}
const lines = text.split(/\\r?\\n/)
let tableName = ''
for (const line of lines) {
  const trimmed = stripTomlComment(line).trim()
  if (!trimmed) continue
  const tableMatch = trimmed.match(/^\\[([^\\]]+)\\]$/)
  if (tableMatch) {
    tableName = tableMatch[1].trim()
    continue
  }
  if (tableName === '') {
    const dottedMatch = trimmed.match(/^features\\.plugin_hooks\\s*=\\s*(.+)$/)
    if (dottedMatch && isTomlTrue(dottedMatch[1])) process.exit(0)
    const inlineMatch = trimmed.match(/^features\\s*=\\s*(.+)$/)
    if (inlineMatch && /\\bplugin_hooks\\s*=\\s*true\\b/i.test(inlineMatch[1])) process.exit(0)
  }
  if (tableName !== 'features') continue
  const match = trimmed.match(/^plugin_hooks\\s*=\\s*(.+)$/)
  if (match && isTomlTrue(match[1])) process.exit(0)
}
process.exit(1)
NODE
  then
    echo "Codex plugin-bundled hooks already enabled in $CODEX_CONFIG_PATH."
  else
    PLUXX_ENABLE_CODEX_HOOKS="0"
    case "$PLUXX_CODEX_HOOKS_MODE" in
      1|true|TRUE|yes|YES|always|ALWAYS)
        PLUXX_ENABLE_CODEX_HOOKS="1"
        ;;
      0|false|FALSE|no|NO|never|NEVER|skip|SKIP)
        PLUXX_ENABLE_CODEX_HOOKS="0"
        ;;
      *)
        if [[ -r /dev/tty ]]; then
          echo "This Codex plugin bundle includes startup hooks." >/dev/tty
          echo "Codex requires [features].plugin_hooks = true before plugin-bundled hooks can run." >/dev/tty
          read -r -p "Enable Codex plugin-bundled hooks in $CODEX_CONFIG_PATH now? [Y/n] " PLUXX_CODEX_HOOKS_REPLY </dev/tty
          case "$PLUXX_CODEX_HOOKS_REPLY" in
            n|N|no|NO)
              PLUXX_ENABLE_CODEX_HOOKS="0"
              ;;
            *)
              PLUXX_ENABLE_CODEX_HOOKS="1"
              ;;
          esac
        fi
        ;;
    esac

    if [[ "$PLUXX_ENABLE_CODEX_HOOKS" == "1" ]]; then
      mkdir -p "$(dirname "$CODEX_CONFIG_PATH")"
      node <<'NODE'
const fs = require('fs')
const path = require('path')

const filepath = process.env.CODEX_CONFIG_PATH

function stripTomlComment(line) {
  let quote = null
  let escaped = false
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]
    if (escaped) {
      escaped = false
      continue
    }
    if (quote && char === '\\\\') {
      escaped = true
      continue
    }
    if (char === '"' || char === "'") {
      quote = quote === char ? null : quote || char
      continue
    }
    if (!quote && char === '#') return line.slice(0, index)
  }
  return line
}

let text = ''
try {
  text = fs.readFileSync(filepath, 'utf8')
} catch {}

const lines = text.split(/\\r?\\n/)
if (lines.length === 1 && lines[0] === '') lines.pop()

let start = -1
let end = lines.length
let firstTopLevelFeaturesDotted = -1
let topLevelPluginHooksDotted = -1
let topLevelInlineFeatures = -1
let tableName = ''
for (let index = 0; index < lines.length; index += 1) {
  const trimmed = stripTomlComment(lines[index]).trim()
  const tableMatch = trimmed.match(/^\\[([^\\]]+)\\]$/)
  if (tableMatch) tableName = tableMatch[1].trim()

  if (trimmed === '[features]') {
    start = index
    break
  }

  if (tableName === '') {
    if (/^features\\.[A-Za-z0-9_-]+\\s*=/.test(trimmed) && firstTopLevelFeaturesDotted < 0) {
      firstTopLevelFeaturesDotted = index
    }
    if (/^features\\.plugin_hooks\\s*=/.test(trimmed)) {
      topLevelPluginHooksDotted = index
    }
    if (/^features\\s*=\\s*\\{/.test(trimmed)) {
      topLevelInlineFeatures = index
    }
  }
}

if (start >= 0) {
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^\\s*\\[[^\\]]+\\]/.test(stripTomlComment(lines[index]))) {
      end = index
      break
    }
  }

  let updated = false
  for (let index = start + 1; index < end; index += 1) {
    if (/^plugin_hooks\\s*=/.test(stripTomlComment(lines[index]).trim())) {
      lines[index] = 'plugin_hooks = true'
      updated = true
    }
  }
  if (!updated) lines.splice(start + 1, 0, 'plugin_hooks = true')
} else if (topLevelPluginHooksDotted >= 0) {
  lines[topLevelPluginHooksDotted] = 'features.plugin_hooks = true'
} else if (firstTopLevelFeaturesDotted >= 0) {
  lines.splice(firstTopLevelFeaturesDotted + 1, 0, 'features.plugin_hooks = true')
} else if (topLevelInlineFeatures >= 0 && lines[topLevelInlineFeatures].includes('}')) {
  if (/\\bplugin_hooks\\s*=/.test(lines[topLevelInlineFeatures])) {
    lines[topLevelInlineFeatures] = lines[topLevelInlineFeatures].replace(
      /\\bplugin_hooks\\s*=\\s*(true|false)\\b/i,
      'plugin_hooks = true',
    )
  } else {
    lines[topLevelInlineFeatures] = lines[topLevelInlineFeatures].replace(/}/, ', plugin_hooks = true }')
  }
} else {
  if (lines.length > 0 && lines[lines.length - 1] !== '') lines.push('')
  lines.push('[features]', 'plugin_hooks = true')
}

fs.mkdirSync(path.dirname(filepath), { recursive: true })
fs.writeFileSync(filepath, lines.join('\\n') + '\\n')
NODE
      echo "Enabled Codex plugin-bundled hooks in $CODEX_CONFIG_PATH."
      echo "Restart or refresh Codex before relying on plugin startup hooks."
    else
      echo "Codex plugin-bundled hooks are not enabled. Startup hooks from this plugin will not run until you add this to $CODEX_CONFIG_PATH:" >&2
      echo "[features]" >&2
      echo "plugin_hooks = true" >&2
      echo "Then restart or refresh Codex before relying on plugin startup hooks." >&2
      echo "Set PLUXX_CODEX_ENABLE_PLUGIN_HOOKS=1 before running this installer to enable it noninteractively." >&2
    fi
  fi
fi
`
}

function renderInstallClaudeCodeScript(config: PluginConfig): string {
  return `#!/usr/bin/env bash
set -euo pipefail

REPO="\${PLUXX_PLUGIN_REPO:-REPO_PLACEHOLDER}"
PLUGIN_NAME="\${PLUXX_PLUGIN_NAME:-PLUGIN_PLACEHOLDER}"
MARKETPLACE_NAME="\${PLUXX_CLAUDE_MARKETPLACE_NAME:-PLUGIN_PLACEHOLDER-releases}"
BUNDLE_URL="\${PLUXX_CLAUDE_BUNDLE_URL:-https://github.com/\${REPO}/releases/latest/download/CLAUDE_BUNDLE_PLACEHOLDER}"
INSTALL_ROOT="\${PLUXX_CLAUDE_MARKETPLACE_DIR:-$HOME/.claude/plugins/data/$MARKETPLACE_NAME}"
SKIP_INSTALL="\${PLUXX_CLAUDE_SKIP_INSTALL:-0}"
BUNDLE_PATH="\${PLUXX_CLAUDE_BUNDLE_PATH:-}"
AUTHOR_NAME="\${PLUXX_PLUGIN_AUTHOR:-AUTHOR_PLACEHOLDER}"
HOMEPAGE_URL="\${PLUXX_PLUGIN_HOMEPAGE:-HOMEPAGE_PLACEHOLDER}"
DESCRIPTION_FALLBACK="\${PLUXX_PLUGIN_DESCRIPTION:-DESCRIPTION_PLACEHOLDER}"

need_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

need_cmd tar
need_cmd mktemp
need_cmd grep
need_cmd sed
${hasInstallerUserConfig(config, 'claude-code') ? 'need_cmd node' : ''}

if [[ "$SKIP_INSTALL" != "1" ]]; then
  need_cmd curl
  need_cmd claude
fi

TMP_DIR="$(mktemp -d)"
cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

BUNDLE_ARCHIVE="$TMP_DIR/${config.name}-claude-code.tar.gz"

if [[ -n "$BUNDLE_PATH" ]]; then
  cp "$BUNDLE_PATH" "$BUNDLE_ARCHIVE"
else
  curl -fsSL "$BUNDLE_URL" -o "$BUNDLE_ARCHIVE"
fi

tar -xzf "$BUNDLE_ARCHIVE" -C "$TMP_DIR"

BUNDLE_DIR="$TMP_DIR/claude-code"
PLUGIN_MANIFEST="$BUNDLE_DIR/.claude-plugin/plugin.json"

if [[ ! -f "$PLUGIN_MANIFEST" ]]; then
  echo "Downloaded bundle does not contain a Claude plugin manifest." >&2
  exit 1
fi

VERSION="$(grep -E '"version"' "$PLUGIN_MANIFEST" | head -n1 | sed -E 's/.*"version"[[:space:]]*:[[:space:]]*"([^"]+)".*/\\1/')"
DESCRIPTION="$(grep -E '"description"' "$PLUGIN_MANIFEST" | head -n1 | sed -E 's/.*"description"[[:space:]]*:[[:space:]]*"([^"]+)".*/\\1/')"

mkdir -p "$INSTALL_ROOT/.claude-plugin" "$INSTALL_ROOT/plugins"
rm -rf "$INSTALL_ROOT/plugins/$PLUGIN_NAME"
cp -R "$BUNDLE_DIR" "$INSTALL_ROOT/plugins/$PLUGIN_NAME"
${renderInstallerUserConfigSnippet(config, 'claude-code', '$INSTALL_ROOT/plugins/$PLUGIN_NAME')}
${renderInstallerMcpPathMaterializationSnippet('claude-code', '$INSTALL_ROOT/plugins/$PLUGIN_NAME')}
${renderInstallerRuntimeBootstrapSnippet('$INSTALL_ROOT/plugins/$PLUGIN_NAME')}

cat > "$INSTALL_ROOT/.claude-plugin/marketplace.json" <<JSON
{
  "name": "$MARKETPLACE_NAME",
  "owner": {
    "name": "$AUTHOR_NAME"
  },
  "plugins": [
    {
      "name": "$PLUGIN_NAME",
      "source": "./plugins/$PLUGIN_NAME",
      "description": "\${DESCRIPTION:-$DESCRIPTION_FALLBACK}",
      "version": "\${VERSION:-${config.version}}",
      "author": {
        "name": "$AUTHOR_NAME"
      },
      "license": "${config.license}",
      "homepage": "$HOMEPAGE_URL"
    }
  ]
}
JSON

if [[ "$SKIP_INSTALL" == "1" ]]; then
  echo "Prepared Claude marketplace at: $INSTALL_ROOT"
  echo "Plugin bundle is at: $INSTALL_ROOT/plugins/$PLUGIN_NAME"
  exit 0
fi

if claude plugin marketplace list --json | grep -q "\\"name\\": \\"$MARKETPLACE_NAME\\""; then
  claude plugin marketplace update "$MARKETPLACE_NAME" >/dev/null
else
  claude plugin marketplace add "$INSTALL_ROOT" >/dev/null
fi

claude plugin uninstall "\${PLUGIN_NAME}@\${MARKETPLACE_NAME}" --scope user >/dev/null 2>&1 || true
claude plugin install "\${PLUGIN_NAME}@\${MARKETPLACE_NAME}" --scope user

echo
echo "Installed \${PLUGIN_NAME}@\${MARKETPLACE_NAME} into Claude Code user scope."
echo "${getPublishReloadInstruction('claude-code')}"
`
}

function renderInstallCursorScript(config: PluginConfig): string {
  return `#!/usr/bin/env bash
set -euo pipefail

REPO="\${PLUXX_PLUGIN_REPO:-REPO_PLACEHOLDER}"
PLUGIN_NAME="\${PLUXX_PLUGIN_NAME:-PLUGIN_PLACEHOLDER}"
BUNDLE_URL="\${PLUXX_CURSOR_BUNDLE_URL:-https://github.com/\${REPO}/releases/latest/download/CURSOR_BUNDLE_PLACEHOLDER}"
INSTALL_DIR="\${PLUXX_CURSOR_INSTALL_DIR:-$HOME/.cursor/plugins/local/$PLUGIN_NAME}"
BUNDLE_PATH="\${PLUXX_CURSOR_BUNDLE_PATH:-}"

need_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

need_cmd tar
need_cmd mktemp
need_cmd curl
${hasInstallerUserConfig(config, 'cursor') ? 'need_cmd node' : ''}

TMP_DIR="$(mktemp -d)"
cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

BUNDLE_ARCHIVE="$TMP_DIR/${config.name}-cursor.tar.gz"

if [[ -n "$BUNDLE_PATH" ]]; then
  cp "$BUNDLE_PATH" "$BUNDLE_ARCHIVE"
else
  curl -fsSL "$BUNDLE_URL" -o "$BUNDLE_ARCHIVE"
fi

tar -xzf "$BUNDLE_ARCHIVE" -C "$TMP_DIR"

BUNDLE_DIR="$TMP_DIR/cursor"
PLUGIN_MANIFEST="$BUNDLE_DIR/.cursor-plugin/plugin.json"

if [[ ! -f "$PLUGIN_MANIFEST" ]]; then
  echo "Downloaded bundle does not contain a Cursor plugin manifest." >&2
  exit 1
fi

mkdir -p "$(dirname "$INSTALL_DIR")"
rm -rf "$INSTALL_DIR"
cp -R "$BUNDLE_DIR" "$INSTALL_DIR"
${renderInstallerUserConfigSnippet(config, 'cursor', '$INSTALL_DIR')}
${renderInstallerMcpPathMaterializationSnippet('cursor', '$INSTALL_DIR')}
${renderInstallerRuntimeBootstrapSnippet('$INSTALL_DIR')}

echo "Installed $PLUGIN_NAME to $INSTALL_DIR"
echo "${getPublishReloadInstruction('cursor')}"
`
}

function renderInstallCodexScript(config: PluginConfig): string {
  return `#!/usr/bin/env bash
set -euo pipefail

REPO="\${PLUXX_PLUGIN_REPO:-REPO_PLACEHOLDER}"
PLUGIN_NAME="\${PLUXX_PLUGIN_NAME:-PLUGIN_PLACEHOLDER}"
BUNDLE_URL="\${PLUXX_CODEX_BUNDLE_URL:-https://github.com/\${REPO}/releases/latest/download/CODEX_BUNDLE_PLACEHOLDER}"
INSTALL_DIR="\${PLUXX_CODEX_INSTALL_DIR:-$HOME/.codex/plugins/$PLUGIN_NAME}"
MARKETPLACE_PATH="\${PLUXX_CODEX_MARKETPLACE_PATH:-$HOME/.agents/plugins/marketplace.json}"
BUNDLE_PATH="\${PLUXX_CODEX_BUNDLE_PATH:-}"
MARKETPLACE_NAME="\${PLUXX_CODEX_MARKETPLACE_NAME:-$PLUGIN_NAME-local}"
MARKETPLACE_DISPLAY_NAME="\${PLUXX_CODEX_MARKETPLACE_DISPLAY_NAME:-DISPLAY_PLACEHOLDER Local}"

need_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

need_cmd tar
need_cmd mktemp
need_cmd node

TMP_DIR="$(mktemp -d)"
cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

BUNDLE_ARCHIVE="$TMP_DIR/${config.name}-codex.tar.gz"

if [[ -n "$BUNDLE_PATH" ]]; then
  cp "$BUNDLE_PATH" "$BUNDLE_ARCHIVE"
else
  need_cmd curl
  curl -fsSL "$BUNDLE_URL" -o "$BUNDLE_ARCHIVE"
fi

tar -xzf "$BUNDLE_ARCHIVE" -C "$TMP_DIR"

BUNDLE_DIR="$TMP_DIR/codex"
PLUGIN_MANIFEST="$BUNDLE_DIR/.codex-plugin/plugin.json"

if [[ ! -f "$PLUGIN_MANIFEST" ]]; then
  echo "Downloaded bundle does not contain a Codex plugin manifest." >&2
  exit 1
fi

mkdir -p "$(dirname "$INSTALL_DIR")"
rm -rf "$INSTALL_DIR"
cp -R "$BUNDLE_DIR" "$INSTALL_DIR"
${renderInstallerUserConfigSnippet(config, 'codex', '$INSTALL_DIR')}
${renderInstallerMcpPathMaterializationSnippet('codex', '$INSTALL_DIR')}
${renderInstallerRuntimeBootstrapSnippet('$INSTALL_DIR')}
${renderInstallerCodexPluginHooksSnippet('$INSTALL_DIR')}

mkdir -p "$(dirname "$MARKETPLACE_PATH")"

export MARKETPLACE_PATH
export PLUGIN_NAME
export MARKETPLACE_NAME
export MARKETPLACE_DISPLAY_NAME

node <<'NODE'
const fs = require('fs')

const filepath = process.env.MARKETPLACE_PATH
const pluginName = process.env.PLUGIN_NAME
const marketplaceName = process.env.MARKETPLACE_NAME
const displayName = process.env.MARKETPLACE_DISPLAY_NAME

let marketplace = {
  name: marketplaceName,
  interface: { displayName },
  plugins: [],
}

if (fs.existsSync(filepath)) {
  marketplace = JSON.parse(fs.readFileSync(filepath, 'utf8'))
  marketplace.name ||= marketplaceName
  marketplace.interface ||= { displayName }
  marketplace.plugins = Array.isArray(marketplace.plugins) ? marketplace.plugins : []
}

const nextPlugins = marketplace.plugins.filter((plugin) => plugin.name !== pluginName)
nextPlugins.push({
  name: pluginName,
  source: {
    source: 'local',
    path: './.codex/plugins/' + pluginName,
  },
  policy: {
    installation: 'AVAILABLE',
    authentication: 'ON_INSTALL',
  },
  category: 'Productivity',
})

fs.writeFileSync(
  filepath,
  JSON.stringify(
    {
      name: marketplace.name,
      interface: marketplace.interface,
      plugins: nextPlugins,
    },
    null,
    2,
  ) + '\\n',
)
NODE

echo "Installed $PLUGIN_NAME to $INSTALL_DIR"
echo "Updated Codex marketplace catalog at $MARKETPLACE_PATH"
echo "${getPublishReloadInstruction('codex')}"
`
}

function renderInstallOpenCodeScript(config: PluginConfig): string {
  return `#!/usr/bin/env bash
set -euo pipefail

REPO="\${PLUXX_PLUGIN_REPO:-REPO_PLACEHOLDER}"
PLUGIN_NAME="\${PLUXX_PLUGIN_NAME:-PLUGIN_PLACEHOLDER}"
BUNDLE_URL="\${PLUXX_OPENCODE_BUNDLE_URL:-https://github.com/\${REPO}/releases/latest/download/OPENCODE_BUNDLE_PLACEHOLDER}"
PLUGIN_ROOT_DIR="\${PLUXX_OPENCODE_PLUGIN_ROOT_DIR:-$HOME/.config/opencode/plugins}"
INSTALL_DIR="\${PLUXX_OPENCODE_INSTALL_DIR:-$PLUGIN_ROOT_DIR/$PLUGIN_NAME}"
ENTRY_PATH="\${PLUXX_OPENCODE_ENTRY_PATH:-$PLUGIN_ROOT_DIR/$PLUGIN_NAME.ts}"
SKILLS_ROOT="\${PLUXX_OPENCODE_SKILLS_ROOT:-$HOME/.config/opencode/skills}"
BUNDLE_PATH="\${PLUXX_OPENCODE_BUNDLE_PATH:-}"

need_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

need_cmd tar
need_cmd mktemp
need_cmd node

TMP_DIR="$(mktemp -d)"
cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

BUNDLE_ARCHIVE="$TMP_DIR/${config.name}-opencode.tar.gz"

if [[ -n "$BUNDLE_PATH" ]]; then
  cp "$BUNDLE_PATH" "$BUNDLE_ARCHIVE"
else
  need_cmd curl
  curl -fsSL "$BUNDLE_URL" -o "$BUNDLE_ARCHIVE"
fi

tar -xzf "$BUNDLE_ARCHIVE" -C "$TMP_DIR"

BUNDLE_DIR="$TMP_DIR/opencode"
PLUGIN_PACKAGE="$BUNDLE_DIR/package.json"

if [[ ! -f "$PLUGIN_PACKAGE" ]]; then
  echo "Downloaded bundle does not contain an OpenCode package.json." >&2
  exit 1
fi

mkdir -p "$(dirname "$INSTALL_DIR")" "$SKILLS_ROOT"
rm -rf "$INSTALL_DIR"
cp -R "$BUNDLE_DIR" "$INSTALL_DIR"
${renderInstallerUserConfigSnippet(config, 'opencode', '$INSTALL_DIR')}
${renderInstallerMcpPathMaterializationSnippet('opencode', '$INSTALL_DIR')}
${renderInstallerRuntimeBootstrapSnippet('$INSTALL_DIR')}

export ENTRY_PATH
export PLUGIN_NAME

node <<'NODE'
const fs = require('fs')

const entryPath = process.env.ENTRY_PATH
const pluginName = process.env.PLUGIN_NAME
const exportName = pluginName
  .split(/[^A-Za-z0-9]+/)
  .filter(Boolean)
  .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
  .join('')

const content = [
  'import type { Plugin } from "@opencode-ai/plugin"',
  'import { join } from "path"',
  '',
  'import * as PluginModule from "./' + pluginName + '/index.ts"',
  '',
  '// OpenCode auto-loads plugin files placed directly in ~/.config/opencode/plugins.',
  '// Proxy into the installed plugin bundle while preserving its expected root.',
  'const pluginFactory = Object.values(PluginModule).find((value): value is Plugin => typeof value === "function")',
  '',
  'if (!pluginFactory) {',
  '  throw new Error("OpenCode plugin bundle for ' + pluginName + ' did not export a plugin function.")',
  '}',
  '',
  'export const ' + exportName + ': Plugin = async (context) =>',
  '  pluginFactory({',
  '    ...context,',
  '    directory: join(context.directory, "' + pluginName + '"),',
  '  })',
  '',
].join('\\n')

fs.writeFileSync(entryPath, content)
NODE

if [[ -d "$INSTALL_DIR/skills" ]]; then
  for skill_dir in "$INSTALL_DIR"/skills/*; do
    [[ -d "$skill_dir" ]] || continue
    skill_name="$(basename "$skill_dir")"
    installed_skill_dir="$SKILLS_ROOT/\${PLUGIN_NAME}-\${skill_name}"
    rm -rf "$installed_skill_dir"
    cp -R "$skill_dir" "$installed_skill_dir"

    export SKILL_PATH="$installed_skill_dir/SKILL.md"
    export SKILL_NAME="$skill_name"
    export PLUGIN_NAME

    node <<'NODE'
const fs = require('fs')

const filepath = process.env.SKILL_PATH
const pluginName = process.env.PLUGIN_NAME
const fallbackName = process.env.SKILL_NAME

if (!fs.existsSync(filepath)) process.exit(0)

const content = fs.readFileSync(filepath, 'utf8')
const match = content.match(/^---\\n([\\s\\S]*?)\\n---\\n?/)
const namespacedName = pluginName + '/' + fallbackName

if (!match) {
  fs.writeFileSync(filepath, '---\\nname: ' + namespacedName + '\\n---\\n\\n' + content)
  process.exit(0)
}

const frontmatter = match[1]
const nameMatch = frontmatter.match(/^name:\\s*(.+)$/m)
const existingName = nameMatch ? nameMatch[1].trim().replace(/^['"]|['"]$/g, '') : fallbackName
const nextName = existingName.startsWith(pluginName + '/') ? existingName : pluginName + '/' + existingName
const nextFrontmatter = nameMatch
  ? frontmatter.replace(/^name:\\s*.+$/m, 'name: ' + nextName)
  : 'name: ' + nextName + '\\n' + frontmatter

fs.writeFileSync(
  filepath,
  content.slice(0, match.index) + '---\\n' + nextFrontmatter + '\\n---\\n' + content.slice(match[0].length),
)
NODE
  done
fi

echo "Installed $PLUGIN_NAME plugin code to $INSTALL_DIR"
echo "Installed OpenCode wrapper at $ENTRY_PATH"
echo "Synced namespaced skills into $SKILLS_ROOT"
echo "${getPublishReloadInstruction('opencode')}"
`
}

function replaceInstallerPlaceholders(
  script: string,
  config: PluginConfig,
  context: ReleaseArtifactContext,
): string {
  return script
    .replaceAll('REPO_PLACEHOLDER', context.repo)
    .replaceAll('PLUGIN_PLACEHOLDER', config.name)
    .replaceAll('DISPLAY_PLACEHOLDER', getDisplayName(config))
    .replaceAll('AUTHOR_PLACEHOLDER', getAuthorName(config))
    .replaceAll('HOMEPAGE_PLACEHOLDER', getHomepageUrl(config, context.repo))
    .replaceAll('DESCRIPTION_PLACEHOLDER', config.brand?.shortDescription ?? config.description)
    .replaceAll('CLAUDE_BUNDLE_PLACEHOLDER', getArchiveAssetName(config.name, 'claude-code', context.version, 'latest'))
    .replaceAll('CURSOR_BUNDLE_PLACEHOLDER', getArchiveAssetName(config.name, 'cursor', context.version, 'latest'))
    .replaceAll('CODEX_BUNDLE_PLACEHOLDER', getArchiveAssetName(config.name, 'codex', context.version, 'latest'))
    .replaceAll('OPENCODE_BUNDLE_PLACEHOLDER', getArchiveAssetName(config.name, 'opencode', context.version, 'latest'))
}

function renderInstallerScript(
  asset: PublishAssetPlan,
  config: PluginConfig,
  context: ReleaseArtifactContext,
): string {
  if (asset.name === 'install-all.sh') {
    return replaceInstallerPlaceholders(renderInstallAllScript(context.installerTargets), config, context)
  }

  if (asset.platform === 'claude-code') {
    return replaceInstallerPlaceholders(renderInstallClaudeCodeScript(config), config, context)
  }
  if (asset.platform === 'cursor') {
    return replaceInstallerPlaceholders(renderInstallCursorScript(config), config, context)
  }
  if (asset.platform === 'codex') {
    return replaceInstallerPlaceholders(renderInstallCodexScript(config), config, context)
  }
  if (asset.platform === 'opencode') {
    return replaceInstallerPlaceholders(renderInstallOpenCodeScript(config), config, context)
  }

  throw new Error(`No installer template for asset ${asset.name}`)
}

function writeChecksumFile(tempRoot: string, files: string[]): string {
  const checksumPath = resolve(tempRoot, 'SHA256SUMS.txt')
  const lines = files
    .map((filePath) => {
      const digest = createHash('sha256').update(readFileSync(filePath)).digest('hex')
      const name = filePath.split('/').pop()!
      return `${digest}  ${name}`
    })
    .join('\n')
  writeFileSync(checksumPath, `${lines}\n`)
  return checksumPath
}

function createReleaseArtifacts(
  rootDir: string,
  config: PluginConfig,
  plan: PublishPlan,
  runCommand: CommandRunner,
): { tempRoot: string; files: string[] } {
  const tempRoot = mkdtempSync(resolve(tmpdir(), 'pluxx-publish-'))
  const created: string[] = []
  const githubRelease = plan.channels.githubRelease

  if (!githubRelease.repo || !githubRelease.releaseTag) {
    rmSync(tempRoot, { recursive: true, force: true })
    throw new Error('GitHub release publishing requires a resolved repository slug and release tag.')
  }

  const context: ReleaseArtifactContext = {
    repo: githubRelease.repo,
    version: plan.version,
    releaseTag: githubRelease.releaseTag,
    builtTargets: githubRelease.assets
      .filter((asset): asset is PublishAssetPlan & { platform: TargetPlatform } => asset.kind === 'archive' && asset.platform !== undefined)
      .map((asset) => asset.platform),
    installerTargets: githubRelease.assets
      .filter(
        (asset): asset is PublishAssetPlan & { platform: typeof INSTALLER_TARGETS[number] } =>
          asset.kind === 'installer'
          && asset.name !== 'install-all.sh'
          && asset.platform !== undefined
          && isInstallerTarget(asset.platform),
      )
      .map((asset) => asset.platform),
    assetBaseURL: buildAssetBaseUrl(githubRelease.repo),
  }

  try {
    for (const asset of githubRelease.assets) {
      if (asset.kind !== 'archive') continue
      const archivePath = resolve(tempRoot, asset.name)
      const result = runCommand(
        'tar',
        ['-czf', archivePath, '-C', resolve(rootDir, config.outDir), asset.platform!],
        { cwd: rootDir },
      )
      if (result.status !== 0) {
        throw new Error(result.stderr || result.stdout || `Failed to create archive for ${asset.platform}`)
      }
      created.push(archivePath)
    }

    for (const asset of githubRelease.assets) {
      if (asset.kind !== 'installer') continue
      const installerPath = resolve(tempRoot, asset.name)
      writeFileSync(installerPath, renderInstallerScript(asset, config, context))
      chmodSync(installerPath, 0o755)
      created.push(installerPath)
    }

    const manifestAsset = githubRelease.assets.find((asset) => asset.kind === 'manifest')
    if (manifestAsset) {
      const manifestPath = resolve(tempRoot, manifestAsset.name)
      writeFileSync(manifestPath, buildReleaseManifest(config, context))
      created.push(manifestPath)
    }

    const checksumAsset = githubRelease.assets.find((asset) => asset.kind === 'checksum')
    if (checksumAsset) {
      const checksumPath = writeChecksumFile(tempRoot, created)
      if (checksumPath !== resolve(tempRoot, checksumAsset.name)) {
        throw new Error(`Checksum output path mismatch for ${checksumAsset.name}`)
      }
      created.push(checksumPath)
    }

    return { tempRoot, files: created }
  } catch (error) {
    rmSync(tempRoot, { recursive: true, force: true })
    throw error
  }
}

export function formatPublishPlan(plan: PublishPlan): string[] {
  const lines: string[] = [
    `Resolved version: ${plan.version}`,
    `Resolved tag: ${plan.tag}`,
    `Channels: ${[
      plan.channels.npm.enabled ? `npm${plan.channels.npm.explicit ? ' (explicit)' : ' (auto)'}` : null,
      plan.channels.githubRelease.enabled ? `github-release${plan.channels.githubRelease.explicit ? ' (explicit)' : ' (auto)'}` : null,
    ].filter(Boolean).join(', ') || 'none'}`,
    '',
    'Checks:',
  ]

  for (const check of plan.checks) {
    lines.push(`  - ${check.name}: ${check.ok ? 'ok' : 'fail'}${check.detail ? ` — ${check.detail}` : ''}`)
  }

  lines.push('')
  if (plan.channels.npm.enabled) {
    lines.push(`npm package: ${plan.channels.npm.packageName ?? 'unknown'} (${plan.channels.npm.packageDir ?? 'missing'})`)
  }

  if (plan.channels.githubRelease.enabled) {
    lines.push(`GitHub repo: ${plan.channels.githubRelease.repo ?? 'unknown'}`)
    lines.push(`GitHub release tag: ${plan.channels.githubRelease.releaseTag}`)
    lines.push('Assets:')
    for (const asset of plan.channels.githubRelease.assets) {
      lines.push(`  - ${asset.name} <- ${asset.path}`)
    }
  }

  if (plan.dryRun) {
    lines.push('')
    lines.push('No remote changes were made.')
  }

  return lines
}

export function runPublish(config: PluginConfig, options: PublishPlanOptions = {}): PublishRunResult {
  const rootDir = options.rootDir ?? process.cwd()
  const runCommand = options.runCommand ?? runCommandDefault
  const plan = planPublish(config, options)

  const failedChecks = plan.checks.filter((check) => !check.ok)
  if (failedChecks.length > 0) {
    return {
      ...plan,
      ok: false,
    }
  }

  if (options.dryRun) {
    return {
      ...plan,
      ok: true,
    }
  }

  const execution: NonNullable<PublishRunResult['execution']> = {}

  if (plan.channels.npm.enabled) {
    const npmChannel = plan.channels.npm
    const result = runCommand(
      'npm',
      ['publish', '--tag', plan.tag, '--access', 'public'],
      { cwd: npmChannel.packageDir },
    )
    execution.npm = {
      ok: result.status === 0,
      detail: result.status === 0
        ? (result.stdout.trim() || 'npm publish complete')
        : (result.stderr || result.stdout || 'npm publish failed'),
    }
  }

  if (plan.channels.githubRelease.enabled) {
    const releaseTag = plan.channels.githubRelease.releaseTag!
    const { tempRoot, files } = createReleaseArtifacts(rootDir, config, plan, runCommand)

    try {
      const existing = runCommand('gh', ['release', 'view', releaseTag], { cwd: rootDir })

      const result = existing.status === 0
        ? runCommand('gh', ['release', 'upload', releaseTag, '--clobber', ...files], { cwd: rootDir })
        : runCommand(
          'gh',
          [
            'release',
            'create',
            releaseTag,
            ...files,
            '--title',
            `${config.name} ${plan.version}`,
            '--notes',
            `Release generated by pluxx publish for ${config.name}@${plan.version}.`,
          ],
          { cwd: rootDir },
        )

      execution.githubRelease = {
        ok: result.status === 0,
        detail: result.status === 0
          ? (result.stdout.trim() || `GitHub release ${releaseTag} updated`)
          : (result.stderr || result.stdout || 'GitHub release publish failed'),
      }
    } finally {
      rmSync(tempRoot, { recursive: true, force: true })
    }
  }

  const ok = Object.values(execution).every((channel) => channel.ok)
  return {
    ...plan,
    ok,
    execution,
  }
}
