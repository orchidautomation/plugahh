import { afterEach, describe, expect, it } from 'bun:test'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { spawnSync } from 'child_process'
import { resolve } from 'path'
import type { PluginConfig, TargetPlatform } from '../src/schema'
import { planPublish, runPublish } from '../src/cli/publish'

const ROOT = resolve(import.meta.dir, '.publish-fixture')

function makeConfig(): PluginConfig {
  return {
    name: 'publish-plugin',
    version: '1.2.3',
    description: 'A publish test plugin',
    author: { name: 'Test Author' },
    license: 'MIT',
    repository: 'https://github.com/orchidautomation/publish-plugin',
    skills: './skills/',
    instructions: './INSTRUCTIONS.md',
    targets: ['claude-code', 'opencode'],
    outDir: './dist',
  }
}

function prepareBuiltTarget(platform: string, extraFiles: Record<string, string> = {}): void {
  const dir = resolve(ROOT, 'dist', platform)
  mkdirSync(dir, { recursive: true })
  for (const [relativePath, content] of Object.entries(extraFiles)) {
    const fullPath = resolve(dir, relativePath)
    mkdirSync(resolve(fullPath, '..'), { recursive: true })
    writeFileSync(fullPath, content)
  }
}

interface CodexInstallerRunOptions {
  configText?: string
  env?: Record<string, string>
}

interface CodexInstallerRunResult {
  status: number | null
  stdout: string
  stderr: string
  configText?: string
  installerContent: string
}

const CODEX_HOOK_FILES = {
  '.codex-plugin/plugin.json': JSON.stringify({
    name: 'publish-plugin',
    version: '1.2.3',
    hooks: './hooks/hooks.json',
  }),
  'hooks/hooks.json': JSON.stringify({
    hooks: {
      SessionStart: [
        {
          hooks: [
            { type: 'command', command: 'echo startup' },
          ],
        },
      ],
    },
  }),
}

const GENERATED_INSTALLER_FIXTURE_FILES: Record<TargetPlatform, Record<string, string>> = {
  'claude-code': {
    '.claude-plugin/plugin.json': JSON.stringify({
      name: 'publish-plugin',
      version: '1.2.3',
      description: 'A publish test plugin',
    }),
  },
  cursor: {
    '.cursor-plugin/plugin.json': JSON.stringify({
      name: 'publish-plugin',
      version: '1.2.3',
      description: 'A publish test plugin',
    }),
  },
  codex: {
    '.codex-plugin/plugin.json': JSON.stringify({
      name: 'publish-plugin',
      version: '1.2.3',
    }),
  },
  opencode: {
    'package.json': JSON.stringify({
      name: '@orchid/publish-plugin-opencode',
      version: '1.2.3',
      type: 'module',
    }),
    'index.ts': 'export const PublishPlugin = async () => ({})\n',
  },
  'github-copilot': {},
  openhands: {},
  warp: {},
  'gemini-cli': {},
  'roo-code': {},
  cline: {},
  amp: {},
}

let generatedInstallerRunCount = 0

function prepareBuiltTargetAt(rootDir: string, platform: string, extraFiles: Record<string, string> = {}): void {
  const dir = resolve(rootDir, 'dist', platform)
  mkdirSync(dir, { recursive: true })
  for (const [relativePath, content] of Object.entries(extraFiles)) {
    const fullPath = resolve(dir, relativePath)
    mkdirSync(resolve(fullPath, '..'), { recursive: true })
    writeFileSync(fullPath, content)
  }
}

function makeUserConfigInstallerConfig(platform: TargetPlatform, required = true): PluginConfig {
  return {
    ...makeConfig(),
    targets: [platform],
    userConfig: [
      {
        key: 'instantly-api-key',
        title: 'Instantly API Key',
        type: 'secret',
        required,
        envVar: 'SENDLENS_INSTANTLY_API_KEY',
      },
    ],
  }
}

interface GeneratedInstallerRunOptions {
  config?: PluginConfig
  env?: Record<string, string>
  existingUserConfig?: unknown
  extraFiles?: Record<string, string>
}

interface GeneratedInstallerRunResult {
  status: number | null
  stdout: string
  stderr: string
  installerContent: string
  installedUserConfig?: {
    values?: Record<string, unknown>
    env?: Record<string, unknown>
  }
}

function getGeneratedInstallerPaths(platform: TargetPlatform, rootDir: string): {
  installDir: string
  pluginInstallDir: string
  env: Record<string, string>
} {
  if (platform === 'claude-code') {
    const installRoot = resolve(rootDir, 'claude-marketplace')
    return {
      installDir: installRoot,
      pluginInstallDir: resolve(installRoot, 'plugins/publish-plugin'),
      env: {
        PLUXX_CLAUDE_MARKETPLACE_DIR: installRoot,
        PLUXX_CLAUDE_SKIP_INSTALL: '1',
      },
    }
  }

  if (platform === 'cursor') {
    const installDir = resolve(rootDir, 'installed-cursor')
    return {
      installDir,
      pluginInstallDir: installDir,
      env: { PLUXX_CURSOR_INSTALL_DIR: installDir },
    }
  }

  if (platform === 'codex') {
    const installDir = resolve(rootDir, 'installed-codex')
    return {
      installDir,
      pluginInstallDir: installDir,
      env: {
        PLUXX_CODEX_INSTALL_DIR: installDir,
        PLUXX_CODEX_MARKETPLACE_PATH: resolve(rootDir, 'codex-marketplace.json'),
        PLUXX_CODEX_CONFIG_PATH: resolve(rootDir, 'codex-config.toml'),
      },
    }
  }

  if (platform === 'opencode') {
    const installDir = resolve(rootDir, 'installed-opencode')
    return {
      installDir,
      pluginInstallDir: installDir,
      env: {
        PLUXX_OPENCODE_INSTALL_DIR: installDir,
        PLUXX_OPENCODE_ENTRY_PATH: resolve(rootDir, 'publish-plugin.ts'),
        PLUXX_OPENCODE_SKILLS_ROOT: resolve(rootDir, 'opencode-skills'),
      },
    }
  }

  throw new Error(`Unsupported generated installer test platform: ${platform}`)
}

function runGeneratedInstaller(
  platform: TargetPlatform,
  options: GeneratedInstallerRunOptions = {},
): GeneratedInstallerRunResult {
  const rootDir = resolve(ROOT, `generated-installer-${platform}-${generatedInstallerRunCount++}`)
  const config = options.config ?? makeUserConfigInstallerConfig(platform)
  const paths = getGeneratedInstallerPaths(platform, rootDir)
  const fixtureFiles = {
    ...GENERATED_INSTALLER_FIXTURE_FILES[platform],
    ...(options.extraFiles ?? {}),
  }
  prepareBuiltTargetAt(rootDir, platform, fixtureFiles)

  if (options.existingUserConfig !== undefined) {
    mkdirSync(paths.pluginInstallDir, { recursive: true })
    writeFileSync(
      resolve(paths.pluginInstallDir, '.pluxx-user.json'),
      JSON.stringify(options.existingUserConfig, null, 2) + '\n',
    )
  }

  let installerRun: GeneratedInstallerRunResult | undefined
  const result = runPublish(config, {
    rootDir,
    requestedChannels: ['github-release'],
    runCommand: (command, args, commandOptions) => {
      if (command === 'tar') {
        const proc = spawnSync(command, args, {
          cwd: commandOptions?.cwd,
          encoding: 'utf-8',
        })
        return {
          status: proc.status,
          stdout: proc.stdout ?? '',
          stderr: proc.stderr ?? '',
        }
      }

      if (command === 'git') return { status: 0, stdout: '', stderr: '' }
      if (command === 'gh' && args[0] === 'auth') return { status: 0, stdout: '', stderr: '' }
      if (command === 'gh' && args[0] === 'release' && args[1] === 'view') return { status: 1, stdout: '', stderr: 'missing' }
      if (command === 'gh' && args[0] === 'release' && args[1] === 'create') {
        const scriptName = platform === 'claude-code' ? 'install-claude-code.sh' : `install-${platform}.sh`
        const installerPath = args.find((value) => typeof value === 'string' && value.endsWith(`/${scriptName}`))
        const archivePath = args.find((value) => typeof value === 'string' && value.endsWith(`/${config.name}-${platform}-latest.tar.gz`))

        const env: Record<string, string> = {
          ...process.env,
          HOME: resolve(rootDir, 'home'),
          ...paths.env,
          ...options.env,
        }

        if (platform === 'claude-code') env.PLUXX_CLAUDE_BUNDLE_PATH = archivePath!
        if (platform === 'cursor') env.PLUXX_CURSOR_BUNDLE_PATH = archivePath!
        if (platform === 'codex') env.PLUXX_CODEX_BUNDLE_PATH = archivePath!
        if (platform === 'opencode') env.PLUXX_OPENCODE_BUNDLE_PATH = archivePath!

        const proc = spawnSync('bash', [installerPath!], {
          encoding: 'utf-8',
          env,
        })
        const userConfigPath = resolve(paths.pluginInstallDir, '.pluxx-user.json')
        installerRun = {
          status: proc.status,
          stdout: proc.stdout ?? '',
          stderr: proc.stderr ?? '',
          installerContent: readFileSync(installerPath!, 'utf-8'),
          installedUserConfig: existsSync(userConfigPath)
            ? JSON.parse(readFileSync(userConfigPath, 'utf-8'))
            : undefined,
        }
        return { status: 0, stdout: 'created', stderr: '' }
      }
      return { status: 0, stdout: '', stderr: '' }
    },
  })

  expect(result.ok).toBe(true)
  expect(installerRun).toBeDefined()
  return installerRun!
}

function runGeneratedCodexInstaller(
  extraFiles: Record<string, string>,
  options: CodexInstallerRunOptions = {},
): CodexInstallerRunResult {
  const config: PluginConfig = {
    ...makeConfig(),
    targets: ['codex'],
  }
  prepareBuiltTarget('codex', extraFiles)

  const configPath = resolve(ROOT, 'codex-config.toml')
  if (options.configText !== undefined) {
    mkdirSync(resolve(configPath, '..'), { recursive: true })
    writeFileSync(configPath, options.configText)
  }

  let installerRun: CodexInstallerRunResult | undefined
  const result = runPublish(config, {
    rootDir: ROOT,
    requestedChannels: ['github-release'],
    runCommand: (command, args, commandOptions) => {
      if (command === 'tar') {
        const proc = spawnSync(command, args, {
          cwd: commandOptions?.cwd,
          encoding: 'utf-8',
        })
        return {
          status: proc.status,
          stdout: proc.stdout ?? '',
          stderr: proc.stderr ?? '',
        }
      }

      if (command === 'git') return { status: 0, stdout: '', stderr: '' }
      if (command === 'gh' && args[0] === 'auth') return { status: 0, stdout: '', stderr: '' }
      if (command === 'gh' && args[0] === 'release' && args[1] === 'view') return { status: 1, stdout: '', stderr: 'missing' }
      if (command === 'gh' && args[0] === 'release' && args[1] === 'create') {
        const installerPath = args.find((value) => typeof value === 'string' && value.endsWith('/install-codex.sh'))
        const archivePath = args.find((value) => typeof value === 'string' && value.endsWith('/publish-plugin-codex-latest.tar.gz'))
        const proc = spawnSync('bash', [installerPath!], {
          encoding: 'utf-8',
          env: {
            ...process.env,
            ...options.env,
            PLUXX_CODEX_BUNDLE_PATH: archivePath!,
            PLUXX_CODEX_INSTALL_DIR: resolve(ROOT, 'installed-codex'),
            PLUXX_CODEX_MARKETPLACE_PATH: resolve(ROOT, 'codex-marketplace.json'),
            PLUXX_CODEX_CONFIG_PATH: configPath,
          },
        })
        installerRun = {
          status: proc.status,
          stdout: proc.stdout ?? '',
          stderr: proc.stderr ?? '',
          configText: existsSync(configPath) ? readFileSync(configPath, 'utf-8') : undefined,
          installerContent: readFileSync(installerPath!, 'utf-8'),
        }
        return { status: 0, stdout: 'created', stderr: '' }
      }
      return { status: 0, stdout: '', stderr: '' }
    },
  })

  expect(result.ok).toBe(true)
  expect(installerRun).toBeDefined()
  return installerRun!
}

afterEach(() => {
  rmSync(ROOT, { recursive: true, force: true })
})

describe('planPublish', () => {
  it('resolves target-aware default channels from built outputs', () => {
    const config = makeConfig()
    prepareBuiltTarget('claude-code', { '.claude-plugin/plugin.json': '{}' })
    prepareBuiltTarget('opencode', {
      'package.json': JSON.stringify({ name: '@orchid/publish-plugin-opencode' }),
      'index.ts': 'export {}',
    })

    const plan = planPublish(config, {
      rootDir: ROOT,
      dryRun: true,
      runCommand: (command) => {
        if (command === 'git') return { status: 0, stdout: '', stderr: '' }
        if (command === 'npm') return { status: 0, stdout: 'orchidautomation\n', stderr: '' }
        if (command === 'gh') return { status: 0, stdout: '', stderr: '' }
        return { status: 0, stdout: '', stderr: '' }
      },
    })

    expect(plan.channels.npm.enabled).toBe(true)
    expect(plan.channels.githubRelease.enabled).toBe(true)
    expect(plan.channels.npm.packageName).toBe('@orchid/publish-plugin-opencode')
    expect(plan.channels.githubRelease.repo).toBe('orchidautomation/publish-plugin')
    expect(plan.channels.githubRelease.assets.map((asset) => asset.name)).toEqual([
      'publish-plugin-claude-code-v1.2.3.tar.gz',
      'publish-plugin-claude-code-latest.tar.gz',
      'publish-plugin-opencode-v1.2.3.tar.gz',
      'publish-plugin-opencode-latest.tar.gz',
      'install-claude-code.sh',
      'install-opencode.sh',
      'install-all.sh',
      'release-manifest.json',
      'SHA256SUMS.txt',
    ])
    expect(plan.checks.every((check) => check.ok)).toBe(true)
  })

  it('disables npm by default when no npm-backed target is built', () => {
    const config = makeConfig()
    prepareBuiltTarget('claude-code', { '.claude-plugin/plugin.json': '{}' })

    const plan = planPublish(config, {
      rootDir: ROOT,
      dryRun: true,
      runCommand: (command) => {
        if (command === 'git') return { status: 0, stdout: '', stderr: '' }
        if (command === 'gh') return { status: 0, stdout: '', stderr: '' }
        return { status: 0, stdout: '', stderr: '' }
      },
    })

    expect(plan.channels.npm.enabled).toBe(false)
    expect(plan.channels.githubRelease.enabled).toBe(true)
  })

  it('reports failed prechecks for dirty git and missing npm auth', () => {
    const config = makeConfig()
    prepareBuiltTarget('opencode', {
      'package.json': JSON.stringify({ name: '@orchid/publish-plugin-opencode' }),
      'index.ts': 'export {}',
    })

    const plan = planPublish(config, {
      rootDir: ROOT,
      dryRun: true,
      requestedChannels: ['npm'],
      runCommand: (command) => {
        if (command === 'git') return { status: 0, stdout: ' M README.md\n', stderr: '' }
        if (command === 'npm') return { status: 1, stdout: '', stderr: 'not logged in' }
        return { status: 0, stdout: '', stderr: '' }
      },
    })

    expect(plan.checks.some((check) => check.code === 'git-clean' && !check.ok)).toBe(true)
    expect(plan.checks.some((check) => check.code === 'npm-auth' && !check.ok)).toBe(true)
  })
})

describe('runPublish', () => {
  it('executes npm publish for the npm channel when checks pass', () => {
    const config = makeConfig()
    prepareBuiltTarget('opencode', {
      'package.json': JSON.stringify({ name: '@orchid/publish-plugin-opencode' }),
      'index.ts': 'export {}',
    })

    const calls: Array<{ command: string; args: string[]; cwd?: string }> = []
    const result = runPublish(config, {
      rootDir: ROOT,
      requestedChannels: ['npm'],
      runCommand: (command, args, options) => {
        calls.push({ command, args, cwd: options?.cwd })
        if (command === 'git') return { status: 0, stdout: '', stderr: '' }
        if (command === 'npm' && args[0] === 'whoami') return { status: 0, stdout: 'orchidautomation\n', stderr: '' }
        if (command === 'npm' && args[0] === 'publish') return { status: 0, stdout: 'published', stderr: '' }
        return { status: 0, stdout: '', stderr: '' }
      },
    })

    expect(result.ok).toBe(true)
    expect(result.execution?.npm?.ok).toBe(true)
    expect(calls.some((call) => call.command === 'npm' && call.args[0] === 'publish')).toBe(true)
  })

  it('packages consumer-facing release assets for github releases', () => {
    const config = makeConfig()
    prepareBuiltTarget('claude-code', { '.claude-plugin/plugin.json': JSON.stringify({ name: 'publish-plugin', version: '1.2.3' }) })
    prepareBuiltTarget('opencode', {
      'package.json': JSON.stringify({ name: '@orchid/publish-plugin-opencode' }),
      'index.ts': 'export {}',
    })

    const calls: Array<{ command: string; args: string[]; cwd?: string }> = []
    const result = runPublish(config, {
      rootDir: ROOT,
      requestedChannels: ['github-release'],
      runCommand: (command, args, options) => {
        calls.push({ command, args, cwd: options?.cwd })

        if (command === 'tar') {
          const proc = spawnSync(command, args, {
            cwd: options?.cwd,
            encoding: 'utf-8',
          })
          return {
            status: proc.status,
            stdout: proc.stdout ?? '',
            stderr: proc.stderr ?? '',
          }
        }

        if (command === 'git') return { status: 0, stdout: '', stderr: '' }
        if (command === 'gh' && args[0] === 'auth') return { status: 0, stdout: '', stderr: '' }
        if (command === 'gh' && args[0] === 'release' && args[1] === 'view') return { status: 1, stdout: '', stderr: 'missing' }
        if (command === 'gh' && args[0] === 'release' && args[1] === 'create') return { status: 0, stdout: 'created', stderr: '' }
        return { status: 0, stdout: '', stderr: '' }
      },
    })

    expect(result.ok).toBe(true)
    expect(result.execution?.githubRelease?.ok).toBe(true)

    const ghCreateCall = calls.find((call) => call.command === 'gh' && call.args[0] === 'release' && call.args[1] === 'create')
    expect(ghCreateCall).toBeDefined()

    const uploadedAssetNames = (ghCreateCall?.args ?? [])
      .filter((value) => value.startsWith('/') && !value.endsWith('.tmp'))
      .map((value) => value.split('/').pop())
      .filter(Boolean)

    expect(uploadedAssetNames).toEqual(expect.arrayContaining([
      'publish-plugin-claude-code-v1.2.3.tar.gz',
      'publish-plugin-claude-code-latest.tar.gz',
      'publish-plugin-opencode-v1.2.3.tar.gz',
      'publish-plugin-opencode-latest.tar.gz',
      'install-claude-code.sh',
      'install-opencode.sh',
      'install-all.sh',
      'release-manifest.json',
      'SHA256SUMS.txt',
    ]))
  })

  it('generates installers that prompt and materialize user config for consumers', () => {
    const config: PluginConfig = {
      name: 'publish-plugin',
      version: '1.2.3',
      description: 'A publish test plugin',
      author: { name: 'Test Author' },
      license: 'MIT',
      repository: 'https://github.com/orchidautomation/publish-plugin',
      skills: './skills/',
      mcp: {
        fixture: {
          transport: 'http',
          url: 'https://example.com/mcp',
          auth: {
            type: 'bearer',
            envVar: 'TEST_API_KEY',
          },
        },
      },
      targets: ['codex'],
      outDir: './dist',
    }
    prepareBuiltTarget('codex', {
      ...CODEX_HOOK_FILES,
      '.mcp.json': JSON.stringify({
        mcpServers: {
          fixture: { url: 'https://example.com/mcp', bearer_token_env_var: 'TEST_API_KEY' },
          local: { command: 'bash', args: ['./scripts/start-mcp.sh'] },
        },
      }),
      'scripts/bootstrap-runtime.sh': '#!/usr/bin/env bash\nexit 0\n',
    })

    let installerContent = ''
    const result = runPublish(config, {
      rootDir: ROOT,
      requestedChannels: ['github-release'],
      runCommand: (command, args, options) => {
        if (command === 'tar') {
          const proc = spawnSync(command, args, {
            cwd: options?.cwd,
            encoding: 'utf-8',
          })
          return {
            status: proc.status,
            stdout: proc.stdout ?? '',
            stderr: proc.stderr ?? '',
          }
        }

        if (command === 'git') return { status: 0, stdout: '', stderr: '' }
        if (command === 'gh' && args[0] === 'auth') return { status: 0, stdout: '', stderr: '' }
        if (command === 'gh' && args[0] === 'release' && args[1] === 'view') return { status: 1, stdout: '', stderr: 'missing' }
        if (command === 'gh' && args[0] === 'release' && args[1] === 'create') {
          const installerPath = args.find((value) => typeof value === 'string' && value.endsWith('/install-codex.sh'))
          installerContent = readFileSync(installerPath!, 'utf-8')
          return { status: 0, stdout: 'created', stderr: '' }
        }
        return { status: 0, stdout: '', stderr: '' }
      },
    })

    expect(result.ok).toBe(true)
    expect(installerContent).toContain('pluxx_prompt_secret_config "test-api-key" "TEST_API_KEY"')
    expect(installerContent).toContain('Refusing placeholder-looking secret for $env_var')
    expect(installerContent).toContain("path.join(installDir, '.pluxx-user.json')")
    expect(installerContent).toContain('server.http_headers')
    expect(installerContent).toContain('delete server.bearer_token_env_var')
    expect(installerContent).toContain('Preparing local plugin runtime dependencies...')
    expect(installerContent).toContain('bash "$INSTALL_DIR/scripts/bootstrap-runtime.sh"')
    expect(installerContent).toContain('PLUXX_CODEX_ENABLE_PLUGIN_HOOKS')
    expect(installerContent).toContain('Codex requires [features].plugin_hooks = true')
    expect(installerContent).toContain('plugin_hooks = true')
    expect(installerContent).toContain('materializeInstalledStdioPath')
    expect(installerContent).toContain("path.resolve(installDir, normalized)")
    expect(installerContent.indexOf('PLUXX_USER_CONFIG_SPEC')).toBeLessThan(
      installerContent.indexOf('Preparing local plugin runtime dependencies...'),
    )
    expect(installerContent.indexOf('Preparing local plugin runtime dependencies...')).toBeLessThan(
      installerContent.indexOf('PLUXX_CODEX_ENABLE_PLUGIN_HOOKS'),
    )
    expect(installerContent.indexOf('PLUXX_CODEX_ENABLE_PLUGIN_HOOKS')).toBeLessThan(
      installerContent.indexOf('Updated Codex marketplace catalog'),
    )
  })

  it('reuses saved generated-installer user config across core host updates', () => {
    const platforms: TargetPlatform[] = ['claude-code', 'cursor', 'codex', 'opencode']

    for (const platform of platforms) {
      const run = runGeneratedInstaller(platform, {
        existingUserConfig: {
          values: { 'instantly-api-key': 'saved-instantly-key' },
          env: { SENDLENS_INSTANTLY_API_KEY: 'saved-instantly-key' },
        },
      })

      expect(run.status).toBe(0)
      expect(run.stderr).toBe('')
      expect(run.stdout).toContain('Found existing plugin config; reusing saved install values.')
      expect(run.installedUserConfig?.values?.['instantly-api-key']).toBe('saved-instantly-key')
      expect(run.installedUserConfig?.env?.SENDLENS_INSTANTLY_API_KEY).toBe('saved-instantly-key')
    }
  })

  it('lets explicit env vars override saved generated-installer user config', () => {
    const run = runGeneratedInstaller('codex', {
      existingUserConfig: {
        values: { 'instantly-api-key': 'old-saved-key' },
        env: { SENDLENS_INSTANTLY_API_KEY: 'old-saved-key' },
      },
      env: { SENDLENS_INSTANTLY_API_KEY: 'fresh-env-key' },
    })

    expect(run.status).toBe(0)
    expect(run.stderr).toBe('')
    expect(run.stdout).not.toContain('Found existing plugin config; reusing saved install values.')
    expect(run.installedUserConfig?.values?.['instantly-api-key']).toBe('fresh-env-key')
    expect(run.installedUserConfig?.env?.SENDLENS_INSTANTLY_API_KEY).toBe('fresh-env-key')
  })

  it('lets PLUXX_RECONFIGURE skip saved generated-installer user config', () => {
    const run = runGeneratedInstaller('codex', {
      existingUserConfig: {
        values: { 'instantly-api-key': 'old-saved-key' },
        env: { SENDLENS_INSTANTLY_API_KEY: 'old-saved-key' },
      },
      env: {
        PLUXX_RECONFIGURE: '1',
        SENDLENS_INSTANTLY_API_KEY: 'reconfigured-key',
      },
    })

    expect(run.status).toBe(0)
    expect(run.stderr).toBe('')
    expect(run.stdout).not.toContain('Found existing plugin config; reusing saved install values.')
    expect(run.installerContent).toContain('PLUXX_RECONFIGURE')
    expect(run.installedUserConfig?.values?.['instantly-api-key']).toBe('reconfigured-key')
    expect(run.installedUserConfig?.env?.SENDLENS_INSTANTLY_API_KEY).toBe('reconfigured-key')
  })

  it('ignores placeholder-looking saved generated-installer secret values', () => {
    const run = runGeneratedInstaller('codex', {
      config: makeUserConfigInstallerConfig('codex', false),
      existingUserConfig: {
        values: { 'instantly-api-key': 'your api key here' },
        env: { SENDLENS_INSTANTLY_API_KEY: 'your api key here' },
      },
    })

    expect(run.status).toBe(0)
    expect(run.stdout).not.toContain('Found existing plugin config; reusing saved install values.')
    expect(run.stderr).toContain('Ignoring placeholder-looking saved config for SENDLENS_INSTANTLY_API_KEY.')
    expect(run.installedUserConfig?.values?.['instantly-api-key']).toBeUndefined()
    expect(run.installedUserConfig?.env?.SENDLENS_INSTANTLY_API_KEY).toBeUndefined()
  })

  it('enables Codex plugin-bundled hooks in generated installers when automation opts in', () => {
    const run = runGeneratedCodexInstaller(CODEX_HOOK_FILES, {
      configText: '[features]\nhooks = true\n',
      env: { PLUXX_CODEX_ENABLE_PLUGIN_HOOKS: '1' },
    })

    expect(run.status).toBe(0)
    expect(run.stderr).toBe('')
    expect(run.stdout).toContain('Enabled Codex plugin-bundled hooks')
    expect(run.stdout).toContain('Restart or refresh Codex')
    expect(run.configText).toContain('[features]\nplugin_hooks = true\nhooks = true\n')
    expect(run.installerContent).toContain('PLUXX_CODEX_ENABLE_PLUGIN_HOOKS')
    expect(run.installerContent).toContain('features\\.plugin_hooks')
  })

  it('prints exact Codex hook TOML and leaves config unchanged when explicitly skipped', () => {
    const run = runGeneratedCodexInstaller(CODEX_HOOK_FILES, {
      env: { PLUXX_CODEX_ENABLE_PLUGIN_HOOKS: '0' },
    })

    expect(run.status).toBe(0)
    expect(run.configText).toBeUndefined()
    expect(run.stderr).toContain('[features]')
    expect(run.stderr).toContain('plugin_hooks = true')
    expect(run.stderr).toContain('Then restart or refresh Codex')
    expect(run.stderr).toContain('PLUXX_CODEX_ENABLE_PLUGIN_HOOKS=1')
  })

  it('does not touch Codex hook config for bundles without plugin hooks', () => {
    const run = runGeneratedCodexInstaller({
      '.codex-plugin/plugin.json': JSON.stringify({ name: 'publish-plugin', version: '1.2.3' }),
    }, {
      env: { PLUXX_CODEX_ENABLE_PLUGIN_HOOKS: '1' },
    })

    expect(run.status).toBe(0)
    expect(run.configText).toBeUndefined()
    expect(run.stdout).not.toContain('Enabled Codex plugin-bundled hooks')
    expect(run.stderr).not.toContain('plugin_hooks = true')
  })
})
