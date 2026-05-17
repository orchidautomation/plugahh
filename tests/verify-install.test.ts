import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { cpSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'fs'
import { resolve } from 'path'
import { installPlugin } from '../src/cli/install'
import { printVerifyInstallResult, verifyInstall } from '../src/cli/verify-install'
import { buildGeneratedPermissionHookScript } from '../src/permissions'
import type { PluginConfig } from '../src/schema'

const ROOT = resolve(import.meta.dir, '.verify-install-fixture')
const DIST_DIR = resolve(ROOT, 'dist')
const HOME_DIR = resolve(ROOT, 'home')
const CURSOR_INSTALL_PATH = '.cursor/plugins/local/verify-plugin'
const OPENCODE_PLUGIN_PATH = '.config/opencode/plugins/verify-plugin'
const OPENCODE_ENTRY_PATH = '.config/opencode/plugins/verify-plugin.ts'
const OPENCODE_SKILL_PATH = '.config/opencode/skills/verify-plugin-client-intel'

function makeConfig(): PluginConfig {
  return {
    name: 'verify-plugin',
    version: '0.1.0',
    description: 'A verify test plugin',
    author: { name: 'Test Author' },
    license: 'MIT',
    skills: './skills/',
    instructions: './INSTRUCTIONS.md',
    targets: ['codex'],
    outDir: './dist',
  }
}

function makeCodexRuntimeConfig(): PluginConfig {
  return {
    name: 'verify-plugin',
    version: '0.1.0',
    description: 'A verify test plugin',
    author: { name: 'Test Author' },
    license: 'MIT',
    skills: './skills/',
    targets: ['codex'],
    outDir: './dist',
    mcp: {
      fixture: {
        transport: 'stdio',
        command: 'node',
        args: ['./mcp-server/dist/index.js', '--stdio'],
      },
    },
  }
}

function makeClaudeConfig(): PluginConfig {
  return {
    name: 'verify-plugin',
    version: '0.1.0',
    description: 'A verify test plugin',
    author: { name: 'Test Author' },
    license: 'MIT',
    skills: './skills/',
    targets: ['claude-code'],
    outDir: './dist',
  }
}

beforeEach(() => {
  rmSync(ROOT, { recursive: true, force: true })
  mkdirSync(DIST_DIR, { recursive: true })
  mkdirSync(HOME_DIR, { recursive: true })
  process.env.HOME = HOME_DIR
})

afterEach(() => {
  rmSync(ROOT, { recursive: true, force: true })
})

describe('verifyInstall', () => {
  it('passes for an installed codex bundle in its native local path', async () => {
    mkdirSync(resolve(DIST_DIR, 'codex/.codex-plugin'), { recursive: true })
    writeFileSync(
      resolve(DIST_DIR, 'codex/.codex-plugin/plugin.json'),
      JSON.stringify({
        name: 'verify-plugin',
        version: '0.1.0',
      }),
    )

    await installPlugin(DIST_DIR, 'verify-plugin', ['codex'])

    const result = await verifyInstall(makeConfig(), {
      rootDir: ROOT,
      targets: ['codex'],
    })

    expect(result.ok).toBe(true)
    expect(result.checks).toHaveLength(1)
    expect(result.checks[0]).toMatchObject({
      platform: 'codex',
      built: true,
      installed: true,
      stale: false,
      ok: true,
      errors: 0,
    })
  })

  it('passes for an installed cursor bundle in its native local path', async () => {
    mkdirSync(resolve(DIST_DIR, 'cursor/.cursor-plugin'), { recursive: true })
    mkdirSync(resolve(DIST_DIR, 'cursor/skills/hello'), { recursive: true })
    mkdirSync(resolve(DIST_DIR, 'cursor/hooks'), { recursive: true })
    mkdirSync(resolve(DIST_DIR, 'cursor/scripts'), { recursive: true })
    writeFileSync(
      resolve(DIST_DIR, 'cursor/.cursor-plugin/plugin.json'),
      JSON.stringify({
        name: 'verify-plugin',
        version: '0.1.0',
        skills: './skills/',
        hooks: './hooks/hooks.json',
        mcpServers: './mcp.json',
      }),
    )
    writeFileSync(resolve(DIST_DIR, 'cursor/skills/hello/SKILL.md'), '# Hello\n')
    writeFileSync(resolve(DIST_DIR, 'cursor/scripts/session-start.sh'), '#!/usr/bin/env bash\nexit 0\n')
    writeFileSync(
      resolve(DIST_DIR, 'cursor/hooks/hooks.json'),
      JSON.stringify({
        hooks: {
          sessionStart: [
            {
              type: 'command',
              command: 'bash ./scripts/session-start.sh',
            },
          ],
        },
      }),
    )
    writeFileSync(
      resolve(DIST_DIR, 'cursor/mcp.json'),
      JSON.stringify({
        mcpServers: {
          fixture: {
            url: 'https://example.com/mcp',
            headers: {
              Authorization: 'Bearer shh-secret',
            },
          },
        },
      }),
    )

    await installPlugin(DIST_DIR, 'verify-plugin', ['cursor'], { quiet: true, useNativeClaudeInstall: false })

    const result = await verifyInstall(makeConfig(), {
      rootDir: ROOT,
      targets: ['cursor'],
    })

    expect(result.ok).toBe(true)
    expect(result.checks).toHaveLength(1)
    expect(result.checks[0]).toMatchObject({
      platform: 'cursor',
      built: true,
      installed: true,
      stale: false,
      ok: true,
      errors: 0,
    })
  })

  it('fails when an installed cursor bundle is missing a hook-referenced file', async () => {
    mkdirSync(resolve(DIST_DIR, 'cursor/.cursor-plugin'), { recursive: true })
    mkdirSync(resolve(DIST_DIR, 'cursor/skills/hello'), { recursive: true })
    mkdirSync(resolve(DIST_DIR, 'cursor/hooks'), { recursive: true })
    mkdirSync(resolve(DIST_DIR, 'cursor/scripts'), { recursive: true })
    writeFileSync(
      resolve(DIST_DIR, 'cursor/.cursor-plugin/plugin.json'),
      JSON.stringify({
        name: 'verify-plugin',
        version: '0.1.0',
        skills: './skills/',
        hooks: './hooks/hooks.json',
      }),
    )
    writeFileSync(resolve(DIST_DIR, 'cursor/skills/hello/SKILL.md'), '# Hello\n')
    writeFileSync(resolve(DIST_DIR, 'cursor/scripts/session-start.sh'), '#!/usr/bin/env bash\nexit 0\n')
    writeFileSync(
      resolve(DIST_DIR, 'cursor/hooks/hooks.json'),
      JSON.stringify({
        hooks: {
          sessionStart: [
            {
              type: 'command',
              command: 'bash ./scripts/session-start.sh',
            },
          ],
        },
      }),
    )

    const installedCursorDir = resolve(HOME_DIR, CURSOR_INSTALL_PATH)
    mkdirSync(resolve(HOME_DIR, '.cursor/plugins/local'), { recursive: true })
    cpSync(resolve(DIST_DIR, 'cursor'), installedCursorDir, { recursive: true })
    rmSync(resolve(installedCursorDir, 'scripts/session-start.sh'), { force: true })

    const result = await verifyInstall(makeConfig(), {
      rootDir: ROOT,
      targets: ['cursor'],
    })

    expect(result.ok).toBe(false)
    expect(result.checks).toHaveLength(1)
    expect(result.checks[0]).toMatchObject({
      platform: 'cursor',
      built: true,
      installed: true,
      stale: false,
      ok: false,
    })
    expect(result.checks[0].errors).toBeGreaterThan(0)
  })

  it('fails when an installed cursor bundle is missing its rules path', async () => {
    mkdirSync(resolve(DIST_DIR, 'cursor/.cursor-plugin'), { recursive: true })
    mkdirSync(resolve(DIST_DIR, 'cursor/skills/hello'), { recursive: true })
    mkdirSync(resolve(DIST_DIR, 'cursor/rules'), { recursive: true })
    writeFileSync(
      resolve(DIST_DIR, 'cursor/.cursor-plugin/plugin.json'),
      JSON.stringify({
        name: 'verify-plugin',
        version: '0.1.0',
        skills: './skills/',
        rules: './rules/',
      }),
    )
    writeFileSync(resolve(DIST_DIR, 'cursor/skills/hello/SKILL.md'), '# Hello\n')
    writeFileSync(resolve(DIST_DIR, 'cursor/rules/policy.mdc'), '# Policy\n')

    const installedCursorDir = resolve(HOME_DIR, CURSOR_INSTALL_PATH)
    mkdirSync(resolve(HOME_DIR, '.cursor/plugins/local'), { recursive: true })
    cpSync(resolve(DIST_DIR, 'cursor'), installedCursorDir, { recursive: true })
    rmSync(resolve(installedCursorDir, 'rules'), { recursive: true, force: true })

    const result = await verifyInstall(makeConfig(), {
      rootDir: ROOT,
      targets: ['cursor'],
    })

    expect(result.ok).toBe(false)
    expect(result.checks).toHaveLength(1)
    expect(result.checks[0]).toMatchObject({
      platform: 'cursor',
      built: true,
      installed: true,
      stale: false,
      ok: false,
    })
    expect(result.checks[0].errors).toBeGreaterThan(0)
  })

  it('fails when the installed cursor bundle is stale relative to the current build', async () => {
    mkdirSync(resolve(DIST_DIR, 'cursor/.cursor-plugin'), { recursive: true })
    writeFileSync(
      resolve(DIST_DIR, 'cursor/.cursor-plugin/plugin.json'),
      JSON.stringify({
        name: 'verify-plugin',
        version: '0.2.0',
      }),
    )

    const installedCursorDir = resolve(HOME_DIR, CURSOR_INSTALL_PATH)
    mkdirSync(resolve(installedCursorDir, '.cursor-plugin'), { recursive: true })
    writeFileSync(
      resolve(installedCursorDir, '.cursor-plugin/plugin.json'),
      JSON.stringify({
        name: 'verify-plugin',
        version: '0.1.0',
      }),
    )

    const result = await verifyInstall(makeConfig(), {
      rootDir: ROOT,
      targets: ['cursor'],
    })

    expect(result.ok).toBe(false)
    expect(result.checks).toHaveLength(1)
    expect(result.checks[0]).toMatchObject({
      platform: 'cursor',
      built: true,
      installed: true,
      stale: true,
      ok: false,
    })
    expect(result.checks[0].staleReason).toContain('installed version 0.1.0 does not match built version 0.2.0')
    expect(result.checks[0].errors).toBeGreaterThan(0)
  })

  it('passes for an installed opencode bundle with host-visible entry and synced skills', async () => {
    mkdirSync(resolve(DIST_DIR, 'opencode/skills/client-intel'), { recursive: true })
    writeFileSync(
      resolve(DIST_DIR, 'opencode/package.json'),
      JSON.stringify({
        name: 'opencode-verify-plugin',
        version: '0.1.0',
        keywords: ['opencode-plugin'],
        peerDependencies: {
          '@opencode-ai/plugin': '*',
        },
      }),
    )
    writeFileSync(resolve(DIST_DIR, 'opencode/index.ts'), 'export const VerifyPlugin = async () => ({});\n')
    writeFileSync(
      resolve(DIST_DIR, 'opencode/skills/client-intel/SKILL.md'),
      '---\nname: client-intel\ndescription: Client intel\n---\n\n# Client Intel\n',
    )

    await installPlugin(DIST_DIR, 'verify-plugin', ['opencode'], { quiet: true, useNativeClaudeInstall: false })

    const result = await verifyInstall(makeConfig(), {
      rootDir: ROOT,
      targets: ['opencode'],
    })

    expect(result.ok).toBe(true)
    expect(result.checks).toHaveLength(1)
    expect(result.checks[0]).toMatchObject({
      platform: 'opencode',
      built: true,
      installed: true,
      stale: false,
      ok: true,
      errors: 0,
    })
  })

  it('fails OpenCode verification when the host-visible entry file is missing', async () => {
    mkdirSync(resolve(DIST_DIR, 'opencode/skills/client-intel'), { recursive: true })
    writeFileSync(
      resolve(DIST_DIR, 'opencode/package.json'),
      JSON.stringify({
        name: 'opencode-verify-plugin',
        version: '0.1.0',
        keywords: ['opencode-plugin'],
        peerDependencies: {
          '@opencode-ai/plugin': '*',
        },
      }),
    )
    writeFileSync(resolve(DIST_DIR, 'opencode/index.ts'), 'export const VerifyPlugin = async () => ({});\n')
    writeFileSync(
      resolve(DIST_DIR, 'opencode/skills/client-intel/SKILL.md'),
      '---\nname: client-intel\ndescription: Client intel\n---\n\n# Client Intel\n',
    )

    await installPlugin(DIST_DIR, 'verify-plugin', ['opencode'], { quiet: true, useNativeClaudeInstall: false })
    rmSync(resolve(HOME_DIR, OPENCODE_ENTRY_PATH), { force: true })

    const result = await verifyInstall(makeConfig(), {
      rootDir: ROOT,
      targets: ['opencode'],
    })

    expect(result.ok).toBe(false)
    expect(result.checks).toHaveLength(1)
    expect(result.checks[0]).toMatchObject({
      platform: 'opencode',
      built: true,
      installed: true,
      stale: false,
      ok: false,
    })
    expect(result.checks[0].errors).toBeGreaterThan(0)
  })

  it('fails OpenCode verification when exported skills are not synced globally', async () => {
    mkdirSync(resolve(DIST_DIR, 'opencode/skills/client-intel'), { recursive: true })
    writeFileSync(
      resolve(DIST_DIR, 'opencode/package.json'),
      JSON.stringify({
        name: 'opencode-verify-plugin',
        version: '0.1.0',
        keywords: ['opencode-plugin'],
        peerDependencies: {
          '@opencode-ai/plugin': '*',
        },
      }),
    )
    writeFileSync(resolve(DIST_DIR, 'opencode/index.ts'), 'export const VerifyPlugin = async () => ({});\n')
    writeFileSync(
      resolve(DIST_DIR, 'opencode/skills/client-intel/SKILL.md'),
      '---\nname: client-intel\ndescription: Client intel\n---\n\n# Client Intel\n',
    )

    await installPlugin(DIST_DIR, 'verify-plugin', ['opencode'], { quiet: true, useNativeClaudeInstall: false })
    rmSync(resolve(HOME_DIR, OPENCODE_SKILL_PATH), { recursive: true, force: true })

    const result = await verifyInstall(makeConfig(), {
      rootDir: ROOT,
      targets: ['opencode'],
    })

    expect(result.ok).toBe(false)
    expect(result.checks).toHaveLength(1)
    expect(result.checks[0]).toMatchObject({
      platform: 'opencode',
      built: true,
      installed: true,
      stale: false,
      ok: false,
    })
    expect(result.checks[0].errors).toBeGreaterThan(0)
  })

  it('fails when the installed opencode bundle is stale relative to the current build', async () => {
    mkdirSync(resolve(DIST_DIR, 'opencode/skills/client-intel'), { recursive: true })
    writeFileSync(
      resolve(DIST_DIR, 'opencode/package.json'),
      JSON.stringify({
        name: 'opencode-verify-plugin',
        version: '0.2.0',
        keywords: ['opencode-plugin'],
        peerDependencies: {
          '@opencode-ai/plugin': '*',
        },
      }),
    )
    writeFileSync(resolve(DIST_DIR, 'opencode/index.ts'), 'export const VerifyPlugin = async () => ({});\n')
    writeFileSync(
      resolve(DIST_DIR, 'opencode/skills/client-intel/SKILL.md'),
      '---\nname: client-intel\ndescription: Client intel\n---\n\n# Client Intel\n',
    )

    const installedPluginDir = resolve(HOME_DIR, OPENCODE_PLUGIN_PATH)
    mkdirSync(resolve(HOME_DIR, '.config/opencode/plugins'), { recursive: true })
    mkdirSync(resolve(HOME_DIR, '.config/opencode/skills'), { recursive: true })
    cpSync(resolve(DIST_DIR, 'opencode'), installedPluginDir, { recursive: true })
    writeFileSync(
      resolve(installedPluginDir, 'package.json'),
      JSON.stringify({
        name: 'opencode-verify-plugin',
        version: '0.1.0',
        keywords: ['opencode-plugin'],
        peerDependencies: {
          '@opencode-ai/plugin': '*',
        },
      }),
    )
    writeFileSync(
      resolve(HOME_DIR, OPENCODE_ENTRY_PATH),
      [
        'import type { Plugin } from "@opencode-ai/plugin"',
        'import { join } from "path"',
        '',
        'import * as PluginModule from "./verify-plugin/index.ts"',
        '',
        'const pluginFactory = Object.values(PluginModule).find((value): value is Plugin => typeof value === "function")',
        '',
        'if (!pluginFactory) {',
        '  throw new Error("OpenCode plugin bundle for verify-plugin did not export a plugin function.")',
        '}',
        '',
        'export const VerifyPlugin: Plugin = async (context) =>',
        '  pluginFactory({',
        '    ...context,',
        '    directory: join(context.directory, "verify-plugin"),',
        '  })',
        '',
      ].join('\n'),
    )
    mkdirSync(resolve(HOME_DIR, OPENCODE_SKILL_PATH), { recursive: true })
    writeFileSync(
      resolve(HOME_DIR, OPENCODE_SKILL_PATH, 'SKILL.md'),
      '---\nname: verify-plugin/client-intel\ndescription: Client intel\n---\n\n# Client Intel\n',
    )

    const result = await verifyInstall(makeConfig(), {
      rootDir: ROOT,
      targets: ['opencode'],
    })

    expect(result.ok).toBe(false)
    expect(result.checks).toHaveLength(1)
    expect(result.checks[0]).toMatchObject({
      platform: 'opencode',
      built: true,
      installed: true,
      stale: true,
      ok: false,
    })
    expect(result.checks[0].staleReason).toContain('installed version 0.1.0 does not match built version 0.2.0')
    expect(result.checks[0].errors).toBeGreaterThan(0)
  })

  it('fails when the target is not installed in the host-visible path', async () => {
    mkdirSync(resolve(DIST_DIR, 'codex/.codex-plugin'), { recursive: true })
    writeFileSync(
      resolve(DIST_DIR, 'codex/.codex-plugin/plugin.json'),
      JSON.stringify({
        name: 'verify-plugin',
        version: '0.1.0',
      }),
    )

    const result = await verifyInstall(makeConfig(), {
      rootDir: ROOT,
      targets: ['codex'],
    })

    expect(result.ok).toBe(false)
    expect(result.checks).toHaveLength(1)
    expect(result.checks[0]).toMatchObject({
      platform: 'codex',
      built: true,
      installed: false,
      stale: false,
      ok: false,
    })
    expect(result.checks[0].errors).toBeGreaterThan(0)
  })

  it('fails when the installed codex bundle is stale relative to the current build', async () => {
    mkdirSync(resolve(DIST_DIR, 'codex/.codex-plugin'), { recursive: true })
    writeFileSync(
      resolve(DIST_DIR, 'codex/.codex-plugin/plugin.json'),
      JSON.stringify({
        name: 'verify-plugin',
        version: '0.2.0',
      }),
    )

    const staleInstall = resolve(ROOT, 'stale-codex-install')
    mkdirSync(resolve(staleInstall, '.codex-plugin'), { recursive: true })
    writeFileSync(
      resolve(staleInstall, '.codex-plugin/plugin.json'),
      JSON.stringify({
        name: 'verify-plugin',
        version: '0.1.0',
      }),
    )
    mkdirSync(resolve(HOME_DIR, '.codex/plugins'), { recursive: true })
    symlinkSync(staleInstall, resolve(HOME_DIR, '.codex/plugins/verify-plugin'))

    const result = await verifyInstall(makeConfig(), {
      rootDir: ROOT,
      targets: ['codex'],
    })

    expect(result.ok).toBe(false)
    expect(result.checks[0]).toMatchObject({
      platform: 'codex',
      built: true,
      installed: true,
      stale: true,
      ok: false,
    })
    expect(result.checks[0].staleReason).toContain('not the current build')
    expect(result.checks[0].errors).toBeGreaterThan(0)
  })

  it('fails when Codex has a stale active cache for the installed plugin', async () => {
    mkdirSync(resolve(DIST_DIR, 'codex/.codex-plugin'), { recursive: true })
    writeFileSync(
      resolve(DIST_DIR, 'codex/.codex-plugin/plugin.json'),
      JSON.stringify({
        name: 'verify-plugin',
        version: '0.2.0',
      }),
    )

    await installPlugin(DIST_DIR, 'verify-plugin', ['codex'])

    const staleCache = resolve(HOME_DIR, '.codex/plugins/cache/local-plugins/verify-plugin/0.1.0')
    mkdirSync(resolve(staleCache, '.codex-plugin'), { recursive: true })
    writeFileSync(
      resolve(staleCache, '.codex-plugin/plugin.json'),
      JSON.stringify({
        name: 'verify-plugin',
        version: '0.1.0',
      }),
    )

    const result = await verifyInstall(makeConfig(), {
      rootDir: ROOT,
      targets: ['codex'],
    })

    expect(result.ok).toBe(false)
    expect(result.checks[0]).toMatchObject({
      platform: 'codex',
      built: true,
      installed: true,
      stale: true,
      ok: false,
    })
    expect(result.checks[0].staleReason).toContain('Codex active cache appears stale')
    expect(result.checks[0].errors).toBeGreaterThan(0)
  })

  it('passes after reinstall clears a stale Codex active cache for the installed plugin', async () => {
    mkdirSync(resolve(DIST_DIR, 'codex/.codex-plugin'), { recursive: true })
    writeFileSync(
      resolve(DIST_DIR, 'codex/.codex-plugin/plugin.json'),
      JSON.stringify({
        name: 'verify-plugin',
        version: '0.2.0',
      }),
    )

    const staleCache = resolve(HOME_DIR, '.codex/plugins/cache/local-plugins/verify-plugin/0.1.0')
    mkdirSync(resolve(staleCache, '.codex-plugin'), { recursive: true })
    writeFileSync(
      resolve(staleCache, '.codex-plugin/plugin.json'),
      JSON.stringify({
        name: 'verify-plugin',
        version: '0.1.0',
      }),
    )

    await installPlugin(DIST_DIR, 'verify-plugin', ['codex'])

    const result = await verifyInstall(makeConfig(), {
      rootDir: ROOT,
      targets: ['codex'],
    })

    expect(result.ok).toBe(true)
    expect(result.checks[0]).toMatchObject({
      platform: 'codex',
      built: true,
      installed: true,
      stale: false,
      ok: true,
      errors: 0,
    })
  })

  it('prints concrete recovery actions for failed verification', async () => {
    mkdirSync(resolve(DIST_DIR, 'codex/.codex-plugin'), { recursive: true })
    writeFileSync(
      resolve(DIST_DIR, 'codex/.codex-plugin/plugin.json'),
      JSON.stringify({
        name: 'verify-plugin',
        version: '0.1.0',
      }),
    )

    const result = await verifyInstall(makeConfig(), {
      rootDir: ROOT,
      targets: ['codex'],
    })
    const logs: string[] = []
    const originalLog = console.log
    console.log = (message?: unknown) => {
      logs.push(String(message ?? ''))
    }

    try {
      printVerifyInstallResult(result)
    } finally {
      console.log = originalLog
    }

    expect(logs.join('\n')).toContain('fix: run pluxx install --target codex')
    expect(logs.join('\n')).toContain('pluxx verify-install failed.')
  })

  it('prints concrete warning details for Codex hook activation gaps', async () => {
    mkdirSync(resolve(DIST_DIR, 'codex/.codex-plugin'), { recursive: true })
    mkdirSync(resolve(DIST_DIR, 'codex/skills/hello'), { recursive: true })
    mkdirSync(resolve(DIST_DIR, 'codex/hooks'), { recursive: true })
    mkdirSync(resolve(DIST_DIR, 'codex/scripts'), { recursive: true })
    mkdirSync(resolve(ROOT, '.codex'), { recursive: true })
    writeFileSync(resolve(ROOT, '.codex/config.toml'), '[features]\nhooks = true\n')
    writeFileSync(
      resolve(DIST_DIR, 'codex/.codex-plugin/plugin.json'),
      JSON.stringify({
        name: 'verify-plugin',
        version: '0.1.0',
        skills: './skills/',
        hooks: './hooks/hooks.json',
      }),
    )
    writeFileSync(resolve(DIST_DIR, 'codex/skills/hello/SKILL.md'), '# Hello\n')
    writeFileSync(resolve(DIST_DIR, 'codex/scripts/session-start.sh'), '#!/usr/bin/env bash\nexit 0\n')
    writeFileSync(
      resolve(DIST_DIR, 'codex/hooks/hooks.json'),
      JSON.stringify({
        version: 1,
        hooks: {
          SessionStart: [
            {
              hooks: [
                {
                  type: 'command',
                  command: 'bash ./scripts/session-start.sh',
                },
              ],
            },
          ],
        },
      }),
    )

    await installPlugin(DIST_DIR, 'verify-plugin', ['codex'], { quiet: true, useNativeClaudeInstall: false })

    const result = await verifyInstall(makeConfig(), {
      rootDir: ROOT,
      targets: ['codex'],
    })
    const logs: string[] = []
    const originalLog = console.log
    console.log = (message?: unknown) => {
      logs.push(String(message ?? ''))
    }

    try {
      printVerifyInstallResult(result)
    } finally {
      console.log = originalLog
    }

    expect(logs.join('\n')).toContain('consumer-codex-project-trust-missing')
    expect(logs.join('\n')).toContain('Codex project trust may still block hook activation')
    expect(logs.join('\n')).toContain('retry a trusted interactive prompt')
  })

  it('prints Codex MCP approval-companion warnings inline when generated stanzas are not merged', async () => {
    mkdirSync(resolve(DIST_DIR, 'codex/.codex-plugin'), { recursive: true })
    mkdirSync(resolve(DIST_DIR, 'codex/skills/hello'), { recursive: true })
    mkdirSync(resolve(DIST_DIR, 'codex/.codex'), { recursive: true })
    writeFileSync(
      resolve(DIST_DIR, 'codex/.codex-plugin/plugin.json'),
      JSON.stringify({
        name: 'verify-plugin',
        version: '0.1.0',
        skills: './skills/',
        mcpServers: './.mcp.json',
      }),
    )
    writeFileSync(resolve(DIST_DIR, 'codex/skills/hello/SKILL.md'), '# Hello\n')
    writeFileSync(
      resolve(DIST_DIR, 'codex/.mcp.json'),
      JSON.stringify({
        mcpServers: {
          hosted: {
            url: 'https://example.com/mcp',
          },
        },
      }),
    )
    writeFileSync(
      resolve(DIST_DIR, 'codex/.codex/config.generated.toml'),
      ['# Generated by test fixture', '', '[mcp_servers.hosted.tools.search]', 'approval_mode = "approve"', ''].join('\n'),
    )

    await installPlugin(DIST_DIR, 'verify-plugin', ['codex'], { quiet: true, useNativeClaudeInstall: false })

    const result = await verifyInstall(makeConfig(), {
      rootDir: ROOT,
      targets: ['codex'],
    })
    const logs: string[] = []
    const originalLog = console.log
    console.log = (message?: unknown) => {
      logs.push(String(message ?? ''))
    }

    try {
      printVerifyInstallResult(result)
    } finally {
      console.log = originalLog
    }

    expect(logs.join('\n')).toContain('consumer-codex-mcp-approval-config-missing')
    expect(logs.join('\n')).toContain('Generated Codex MCP approval stanzas are not fully merged into active config')
    expect(logs.join('\n')).toContain('Merge the missing stanza')
  })

  it('fails when an installed stdio MCP runtime exits immediately', async () => {
    mkdirSync(resolve(DIST_DIR, 'codex/.codex-plugin'), { recursive: true })
    mkdirSync(resolve(DIST_DIR, 'codex/skills/hello'), { recursive: true })
    mkdirSync(resolve(DIST_DIR, 'codex/mcp-server/dist'), { recursive: true })
    writeFileSync(
      resolve(DIST_DIR, 'codex/.codex-plugin/plugin.json'),
      JSON.stringify({
        name: 'verify-plugin',
        version: '0.1.0',
        skills: './skills/',
        mcpServers: './.mcp.json',
      }),
    )
    writeFileSync(resolve(DIST_DIR, 'codex/skills/hello/SKILL.md'), '# Hello\n')
    writeFileSync(
      resolve(DIST_DIR, 'codex/.mcp.json'),
      JSON.stringify({
        mcpServers: {
          fixture: {
            command: 'node',
            args: ['./mcp-server/dist/index.js', '--stdio'],
          },
        },
      }),
    )
    writeFileSync(resolve(DIST_DIR, 'codex/mcp-server/dist/index.js'), 'process.exit(0)\n')

    await installPlugin(DIST_DIR, 'verify-plugin', ['codex'], { quiet: true, useNativeClaudeInstall: false })

    const result = await verifyInstall(makeCodexRuntimeConfig(), {
      rootDir: ROOT,
      targets: ['codex'],
    })

    expect(result.ok).toBe(false)
    expect(result.checks[0]).toMatchObject({
      platform: 'codex',
      built: true,
      installed: true,
      ok: false,
    })
    expect(result.checks[0].errors).toBeGreaterThan(0)
  })

  it('passes with a warning for an installed codex bundle with plugin-bundled hooks when plugin_hooks is not enabled', async () => {
    mkdirSync(resolve(DIST_DIR, 'codex/.codex-plugin'), { recursive: true })
    mkdirSync(resolve(DIST_DIR, 'codex/skills/hello'), { recursive: true })
    mkdirSync(resolve(DIST_DIR, 'codex/hooks'), { recursive: true })
    mkdirSync(resolve(DIST_DIR, 'codex/scripts'), { recursive: true })
    writeFileSync(
      resolve(DIST_DIR, 'codex/.codex-plugin/plugin.json'),
      JSON.stringify({
        name: 'verify-plugin',
        version: '0.1.0',
        skills: './skills/',
        hooks: './hooks/hooks.json',
      }),
    )
    writeFileSync(resolve(DIST_DIR, 'codex/skills/hello/SKILL.md'), '# Hello\n')
    writeFileSync(resolve(DIST_DIR, 'codex/scripts/session-start.sh'), '#!/usr/bin/env bash\nexit 0\n')
    writeFileSync(
      resolve(DIST_DIR, 'codex/hooks/hooks.json'),
      JSON.stringify({
        version: 1,
        hooks: {
          SessionStart: [
            {
              hooks: [
                {
                  type: 'command',
                  command: 'bash ./scripts/session-start.sh',
                },
              ],
            },
          ],
        },
      }),
    )

    await installPlugin(DIST_DIR, 'verify-plugin', ['codex'], { quiet: true, useNativeClaudeInstall: false })

    const result = await verifyInstall(makeConfig(), {
      rootDir: ROOT,
      targets: ['codex'],
    })

    expect(result.ok).toBe(true)
    expect(result.checks[0]).toMatchObject({
      platform: 'codex',
      built: true,
      installed: true,
      ok: true,
      errors: 0,
    })
    expect(result.checks[0].warnings).toBeGreaterThan(0)
  })

  it('passes with a warning for an installed codex bundle with plugin-bundled hooks when only hooks is enabled but the project is not trusted', async () => {
    mkdirSync(resolve(DIST_DIR, 'codex/.codex-plugin'), { recursive: true })
    mkdirSync(resolve(DIST_DIR, 'codex/skills/hello'), { recursive: true })
    mkdirSync(resolve(DIST_DIR, 'codex/hooks'), { recursive: true })
    mkdirSync(resolve(DIST_DIR, 'codex/scripts'), { recursive: true })
    mkdirSync(resolve(ROOT, '.codex'), { recursive: true })
    writeFileSync(resolve(ROOT, '.codex/config.toml'), '[features]\nhooks = true\n')
    writeFileSync(
      resolve(DIST_DIR, 'codex/.codex-plugin/plugin.json'),
      JSON.stringify({
        name: 'verify-plugin',
        version: '0.1.0',
        skills: './skills/',
        hooks: './hooks/hooks.json',
      }),
    )
    writeFileSync(resolve(DIST_DIR, 'codex/skills/hello/SKILL.md'), '# Hello\n')
    writeFileSync(resolve(DIST_DIR, 'codex/scripts/session-start.sh'), '#!/usr/bin/env bash\nexit 0\n')
    writeFileSync(
      resolve(DIST_DIR, 'codex/hooks/hooks.json'),
      JSON.stringify({
        version: 1,
        hooks: {
          SessionStart: [
            {
              hooks: [
                {
                  type: 'command',
                  command: 'bash ./scripts/session-start.sh',
                },
              ],
            },
          ],
        },
      }),
    )

    await installPlugin(DIST_DIR, 'verify-plugin', ['codex'], { quiet: true, useNativeClaudeInstall: false })

    const result = await verifyInstall(makeConfig(), {
      rootDir: ROOT,
      targets: ['codex'],
    })

    expect(result.ok).toBe(true)
    expect(result.checks[0]).toMatchObject({
      platform: 'codex',
      built: true,
      installed: true,
      ok: true,
      errors: 0,
    })
    expect(result.checks[0].warnings).toBeGreaterThan(0)
    expect(result.checks[0].issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          level: 'warning',
          code: 'consumer-codex-plugin-hooks-feature-flag-general-only',
        }),
        expect.objectContaining({
          level: 'warning',
          code: 'consumer-codex-project-trust-missing',
          title: 'Codex project trust may still block hook activation',
        }),
      ]),
    )
  })

  it('passes cleanly for an installed codex bundle with plugin-bundled hooks when the project enables plugin_hooks and the user trusts the project', async () => {
    mkdirSync(resolve(DIST_DIR, 'codex/.codex-plugin'), { recursive: true })
    mkdirSync(resolve(DIST_DIR, 'codex/skills/hello'), { recursive: true })
    mkdirSync(resolve(DIST_DIR, 'codex/hooks'), { recursive: true })
    mkdirSync(resolve(DIST_DIR, 'codex/scripts'), { recursive: true })
    mkdirSync(resolve(ROOT, '.codex'), { recursive: true })
    mkdirSync(resolve(HOME_DIR, '.codex'), { recursive: true })
    writeFileSync(resolve(ROOT, '.codex/config.toml'), '[features]\nplugin_hooks = true\n')
    writeFileSync(
      resolve(HOME_DIR, '.codex/config.toml'),
      `[projects.${JSON.stringify(resolve(ROOT))}]\ntrust_level = "trusted"\n`,
    )
    writeFileSync(
      resolve(DIST_DIR, 'codex/.codex-plugin/plugin.json'),
      JSON.stringify({
        name: 'verify-plugin',
        version: '0.1.0',
        skills: './skills/',
        hooks: './hooks/hooks.json',
      }),
    )
    writeFileSync(resolve(DIST_DIR, 'codex/skills/hello/SKILL.md'), '# Hello\n')
    writeFileSync(resolve(DIST_DIR, 'codex/scripts/session-start.sh'), '#!/usr/bin/env bash\nexit 0\n')
    writeFileSync(
      resolve(DIST_DIR, 'codex/hooks/hooks.json'),
      JSON.stringify({
        version: 1,
        hooks: {
          SessionStart: [
            {
              hooks: [
                {
                  type: 'command',
                  command: 'bash ./scripts/session-start.sh',
                },
              ],
            },
          ],
        },
      }),
    )

    await installPlugin(DIST_DIR, 'verify-plugin', ['codex'], { quiet: true, useNativeClaudeInstall: false })

    const result = await verifyInstall(makeConfig(), {
      rootDir: ROOT,
      targets: ['codex'],
    })

    expect(result.ok).toBe(true)
    expect(result.checks[0]).toMatchObject({
      platform: 'codex',
      built: true,
      installed: true,
      ok: true,
      errors: 0,
      warnings: 0,
    })
  })

  it('passes with a warning for an installed codex bundle with plugin-bundled hooks when only codex_hooks is enabled', async () => {
    mkdirSync(resolve(DIST_DIR, 'codex/.codex-plugin'), { recursive: true })
    mkdirSync(resolve(DIST_DIR, 'codex/skills/hello'), { recursive: true })
    mkdirSync(resolve(DIST_DIR, 'codex/hooks'), { recursive: true })
    mkdirSync(resolve(DIST_DIR, 'codex/scripts'), { recursive: true })
    mkdirSync(resolve(ROOT, '.codex'), { recursive: true })
    writeFileSync(resolve(ROOT, '.codex/config.toml'), '[features]\ncodex_hooks = true\n')
    writeFileSync(
      resolve(DIST_DIR, 'codex/.codex-plugin/plugin.json'),
      JSON.stringify({
        name: 'verify-plugin',
        version: '0.1.0',
        skills: './skills/',
        hooks: './hooks/hooks.json',
      }),
    )
    writeFileSync(resolve(DIST_DIR, 'codex/skills/hello/SKILL.md'), '# Hello\n')
    writeFileSync(resolve(DIST_DIR, 'codex/scripts/session-start.sh'), '#!/usr/bin/env bash\nexit 0\n')
    writeFileSync(
      resolve(DIST_DIR, 'codex/hooks/hooks.json'),
      JSON.stringify({
        version: 1,
        hooks: {
          SessionStart: [
            {
              hooks: [
                {
                  type: 'command',
                  command: 'bash ./scripts/session-start.sh',
                },
              ],
            },
          ],
        },
      }),
    )

    await installPlugin(DIST_DIR, 'verify-plugin', ['codex'], { quiet: true, useNativeClaudeInstall: false })

    const result = await verifyInstall(makeConfig(), {
      rootDir: ROOT,
      targets: ['codex'],
    })

    expect(result.ok).toBe(true)
    expect(result.checks[0]).toMatchObject({
      platform: 'codex',
      built: true,
      installed: true,
      ok: true,
      errors: 0,
    })
    expect(result.checks[0].warnings).toBeGreaterThan(0)
    expect(result.checks[0].issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          level: 'warning',
          code: 'consumer-codex-hooks-feature-flag-legacy-only',
        }),
        expect.objectContaining({
          level: 'warning',
          code: 'consumer-codex-plugin-hooks-feature-flag-general-only',
        }),
      ]),
    )
  })

  it('passes for an installed codex bundle with a referenced .app.json surface', async () => {
    mkdirSync(resolve(DIST_DIR, 'codex/.codex-plugin'), { recursive: true })
    mkdirSync(resolve(DIST_DIR, 'codex/skills/hello'), { recursive: true })
    writeFileSync(
      resolve(DIST_DIR, 'codex/.codex-plugin/plugin.json'),
      JSON.stringify({
        name: 'verify-plugin',
        version: '0.1.0',
        skills: './skills/',
        apps: './.app.json',
      }),
    )
    writeFileSync(resolve(DIST_DIR, 'codex/skills/hello/SKILL.md'), '# Hello\n')
    writeFileSync(
      resolve(DIST_DIR, 'codex/.app.json'),
      JSON.stringify({
        capabilities: ['Read'],
      }),
    )

    await installPlugin(DIST_DIR, 'verify-plugin', ['codex'], { quiet: true, useNativeClaudeInstall: false })

    const result = await verifyInstall(makeConfig(), {
      rootDir: ROOT,
      targets: ['codex'],
    })

    expect(result.ok).toBe(true)
    expect(result.checks[0]).toMatchObject({
      platform: 'codex',
      built: true,
      installed: true,
      ok: true,
      errors: 0,
    })
  })

  it('fails when an installed codex bundle has malformed bundled hook JSON', async () => {
    mkdirSync(resolve(DIST_DIR, 'codex/.codex-plugin'), { recursive: true })
    mkdirSync(resolve(DIST_DIR, 'codex/skills/hello'), { recursive: true })
    mkdirSync(resolve(DIST_DIR, 'codex/hooks'), { recursive: true })
    writeFileSync(
      resolve(DIST_DIR, 'codex/.codex-plugin/plugin.json'),
      JSON.stringify({
        name: 'verify-plugin',
        version: '0.1.0',
        skills: './skills/',
        hooks: './hooks/hooks.json',
      }),
    )
    writeFileSync(resolve(DIST_DIR, 'codex/skills/hello/SKILL.md'), '# Hello\n')

    const installedCodexDir = resolve(HOME_DIR, '.codex/plugins/verify-plugin')
    mkdirSync(resolve(HOME_DIR, '.codex/plugins'), { recursive: true })
    cpSync(resolve(DIST_DIR, 'codex'), installedCodexDir, { recursive: true })
    writeFileSync(resolve(installedCodexDir, 'hooks/hooks.json'), '{"version":1,"hooks":')

    const result = await verifyInstall(makeConfig(), {
      rootDir: ROOT,
      targets: ['codex'],
    })

    expect(result.ok).toBe(false)
    expect(result.checks[0]).toMatchObject({
      platform: 'codex',
      built: true,
      installed: true,
      ok: false,
    })
    expect(result.checks[0].errors).toBeGreaterThan(0)
  })

  it('fails when an installed codex bundle references a missing .app.json surface', async () => {
    mkdirSync(resolve(DIST_DIR, 'codex/.codex-plugin'), { recursive: true })
    mkdirSync(resolve(DIST_DIR, 'codex/skills/hello'), { recursive: true })
    writeFileSync(
      resolve(DIST_DIR, 'codex/.codex-plugin/plugin.json'),
      JSON.stringify({
        name: 'verify-plugin',
        version: '0.1.0',
        skills: './skills/',
        apps: './.app.json',
      }),
    )
    writeFileSync(resolve(DIST_DIR, 'codex/skills/hello/SKILL.md'), '# Hello\n')

    const installedCodexDir = resolve(HOME_DIR, '.codex/plugins/verify-plugin')
    mkdirSync(resolve(HOME_DIR, '.codex/plugins'), { recursive: true })
    cpSync(resolve(DIST_DIR, 'codex'), installedCodexDir, { recursive: true })

    const result = await verifyInstall(makeConfig(), {
      rootDir: ROOT,
      targets: ['codex'],
    })

    expect(result.ok).toBe(false)
    expect(result.checks[0]).toMatchObject({
      platform: 'codex',
      built: true,
      installed: true,
      ok: false,
    })
    expect(result.checks[0].errors).toBeGreaterThan(0)
  })

  it('checks the actual Claude install path instead of the local marketplace staging bundle', async () => {
    mkdirSync(resolve(DIST_DIR, 'claude-code/.claude-plugin'), { recursive: true })
    mkdirSync(resolve(DIST_DIR, 'claude-code/commands'), { recursive: true })
    mkdirSync(resolve(DIST_DIR, 'claude-code/skills/research'), { recursive: true })
    mkdirSync(resolve(DIST_DIR, 'claude-code/scripts'), { recursive: true })
    mkdirSync(resolve(DIST_DIR, 'claude-code/hooks'), { recursive: true })

    writeFileSync(
      resolve(DIST_DIR, 'claude-code/.claude-plugin/plugin.json'),
      JSON.stringify({
        name: 'verify-plugin',
        version: '0.1.0',
        commands: './commands/',
        skills: './skills/',
      }),
    )
    writeFileSync(resolve(DIST_DIR, 'claude-code/commands/pulse.md'), '# pulse\n')
    writeFileSync(resolve(DIST_DIR, 'claude-code/skills/research/SKILL.md'), '# Research\n')
    writeFileSync(resolve(DIST_DIR, 'claude-code/scripts/session-start.sh'), '#!/usr/bin/env bash\nexit 0\n')
    writeFileSync(
      resolve(DIST_DIR, 'claude-code/hooks/hooks.json'),
      JSON.stringify({
        hooks: {
          SessionStart: [
            {
              hooks: [
                {
                  type: 'command',
                  command: 'bash "${CLAUDE_PLUGIN_ROOT}/scripts/session-start.sh"',
                },
              ],
            },
          ],
        },
      }),
    )

    const marketplaceBundle = resolve(HOME_DIR, '.claude/plugins/data/pluxx-local-verify-plugin/plugins/verify-plugin')
    mkdirSync(resolve(marketplaceBundle, '.claude-plugin'), { recursive: true })
    cpSync(resolve(DIST_DIR, 'claude-code'), marketplaceBundle, { recursive: true })

    const installedBundle = resolve(HOME_DIR, '.claude/plugins/cache/pluxx-local-verify-plugin/verify-plugin/0.1.0')
    mkdirSync(resolve(HOME_DIR, '.claude/plugins/cache/pluxx-local-verify-plugin/verify-plugin'), { recursive: true })
    cpSync(resolve(DIST_DIR, 'claude-code'), installedBundle, { recursive: true })
    rmSync(resolve(installedBundle, 'commands'), { recursive: true, force: true })

    const result = await verifyInstall(makeClaudeConfig(), {
      rootDir: ROOT,
      targets: ['claude-code'],
    })

    expect(result.ok).toBe(false)
    expect(result.checks).toHaveLength(1)
    expect(result.checks[0]).toMatchObject({
      platform: 'claude-code',
      built: true,
      installed: true,
      ok: false,
    })
    expect(result.checks[0].installPath).toBe(installedBundle)
    expect(result.checks[0].consumerPath).toBe(installedBundle)
    expect(result.checks[0].errors).toBeGreaterThan(0)
  })

  it('fails when an installed Claude bundle redundantly declares the standard hooks file in the manifest', async () => {
    mkdirSync(resolve(DIST_DIR, 'claude-code/.claude-plugin'), { recursive: true })
    mkdirSync(resolve(DIST_DIR, 'claude-code/skills/research'), { recursive: true })
    mkdirSync(resolve(DIST_DIR, 'claude-code/scripts'), { recursive: true })
    mkdirSync(resolve(DIST_DIR, 'claude-code/hooks'), { recursive: true })

    writeFileSync(
      resolve(DIST_DIR, 'claude-code/.claude-plugin/plugin.json'),
      JSON.stringify({
        name: 'verify-plugin',
        version: '0.1.0',
        skills: './skills/',
        hooks: './hooks/hooks.json',
      }),
    )
    writeFileSync(resolve(DIST_DIR, 'claude-code/skills/research/SKILL.md'), '# Research\n')
    writeFileSync(resolve(DIST_DIR, 'claude-code/scripts/session-start.sh'), '#!/usr/bin/env bash\nexit 0\n')
    writeFileSync(
      resolve(DIST_DIR, 'claude-code/hooks/hooks.json'),
      JSON.stringify({
        hooks: {
          SessionStart: [
            {
              hooks: [
                {
                  type: 'command',
                  command: 'bash "${CLAUDE_PLUGIN_ROOT}/scripts/session-start.sh"',
                },
              ],
            },
          ],
        },
      }),
    )

    const installedBundle = resolve(HOME_DIR, '.claude/plugins/cache/pluxx-local-verify-plugin/verify-plugin/0.1.0')
    mkdirSync(resolve(HOME_DIR, '.claude/plugins/cache/pluxx-local-verify-plugin/verify-plugin'), { recursive: true })
    cpSync(resolve(DIST_DIR, 'claude-code'), installedBundle, { recursive: true })

    const result = await verifyInstall(makeClaudeConfig(), {
      rootDir: ROOT,
      targets: ['claude-code'],
    })

    expect(result.ok).toBe(false)
    expect(result.checks[0]).toMatchObject({
      platform: 'claude-code',
      built: true,
      installed: true,
      ok: false,
    })
    expect(result.checks[0].issues.some((issue) => issue.detail.includes('Claude auto-loads hooks/hooks.json'))).toBe(true)
  })

  it('fails when a generated-shape Claude install has broken hook target paths', async () => {
    mkdirSync(resolve(DIST_DIR, 'claude-code/.claude-plugin'), { recursive: true })
    mkdirSync(resolve(DIST_DIR, 'claude-code/skills/research'), { recursive: true })
    mkdirSync(resolve(DIST_DIR, 'claude-code/hooks'), { recursive: true })

    writeFileSync(
      resolve(DIST_DIR, 'claude-code/.claude-plugin/plugin.json'),
      JSON.stringify({
        name: 'verify-plugin',
        version: '0.1.0',
        skills: './skills/',
      }),
    )
    writeFileSync(resolve(DIST_DIR, 'claude-code/skills/research/SKILL.md'), '# Research\n')
    writeFileSync(
      resolve(DIST_DIR, 'claude-code/hooks/hooks.json'),
      JSON.stringify({
        hooks: {
          SessionStart: [
            {
              hooks: [
                {
                  type: 'command',
                  command: 'bash "${CLAUDE_PLUGIN_ROOT}/scripts/session-start.sh"',
                },
              ],
            },
          ],
        },
      }),
    )

    const installedBundle = resolve(HOME_DIR, '.claude/plugins/cache/pluxx-local-verify-plugin/verify-plugin/0.1.0')
    mkdirSync(resolve(HOME_DIR, '.claude/plugins/cache/pluxx-local-verify-plugin/verify-plugin'), { recursive: true })
    cpSync(resolve(DIST_DIR, 'claude-code'), installedBundle, { recursive: true })

    const result = await verifyInstall(makeClaudeConfig(), {
      rootDir: ROOT,
      targets: ['claude-code'],
    })

    expect(result.ok).toBe(false)
    expect(result.checks[0]).toMatchObject({
      platform: 'claude-code',
      built: true,
      installed: true,
      ok: false,
    })
    expect(result.checks[0].issues.some((issue) => issue.code === 'consumer-bundle-integrity-invalid')).toBe(true)
  })

  it('passes with warnings when a hook-bearing Claude install is checked with disableAllHooks in user settings', async () => {
    mkdirSync(resolve(DIST_DIR, 'claude-code/.claude-plugin'), { recursive: true })
    mkdirSync(resolve(DIST_DIR, 'claude-code/skills/research'), { recursive: true })
    mkdirSync(resolve(DIST_DIR, 'claude-code/hooks'), { recursive: true })
    mkdirSync(resolve(DIST_DIR, 'claude-code/scripts'), { recursive: true })

    writeFileSync(
      resolve(DIST_DIR, 'claude-code/.claude-plugin/plugin.json'),
      JSON.stringify({
        name: 'verify-plugin',
        version: '0.1.0',
        skills: './skills/',
      }),
    )
    writeFileSync(resolve(DIST_DIR, 'claude-code/skills/research/SKILL.md'), '# Research\n')
    writeFileSync(resolve(DIST_DIR, 'claude-code/scripts/session-start.sh'), '#!/usr/bin/env bash\nexit 0\n')
    writeFileSync(
      resolve(DIST_DIR, 'claude-code/hooks/hooks.json'),
      JSON.stringify({
        hooks: {
          SessionStart: [
            {
              hooks: [
                {
                  type: 'command',
                  command: 'bash "${CLAUDE_PLUGIN_ROOT}/scripts/session-start.sh"',
                },
              ],
            },
          ],
        },
      }),
    )
    mkdirSync(resolve(HOME_DIR, '.claude'), { recursive: true })
    writeFileSync(resolve(HOME_DIR, '.claude/settings.json'), JSON.stringify({ disableAllHooks: true }, null, 2))

    const installedBundle = resolve(HOME_DIR, '.claude/plugins/cache/pluxx-local-verify-plugin/verify-plugin/0.1.0')
    mkdirSync(resolve(HOME_DIR, '.claude/plugins/cache/pluxx-local-verify-plugin/verify-plugin'), { recursive: true })
    cpSync(resolve(DIST_DIR, 'claude-code'), installedBundle, { recursive: true })

    const result = await verifyInstall(makeClaudeConfig(), {
      rootDir: ROOT,
      targets: ['claude-code'],
    })

    expect(result.ok).toBe(true)
    expect(result.checks[0]).toMatchObject({
      platform: 'claude-code',
      built: true,
      installed: true,
      ok: true,
    })
    expect(result.checks[0].warnings).toBeGreaterThan(0)
    expect(result.checks[0].issues.some((issue) => issue.code === 'consumer-claude-hooks-disabled' && issue.level === 'warning')).toBe(true)
  })

  it('passes when an installed Claude bundle can execute its bundled permission hook behavior', async () => {
    mkdirSync(resolve(DIST_DIR, 'claude-code/.claude-plugin'), { recursive: true })
    mkdirSync(resolve(DIST_DIR, 'claude-code/skills/research'), { recursive: true })
    mkdirSync(resolve(DIST_DIR, 'claude-code/hooks'), { recursive: true })

    writeFileSync(
      resolve(DIST_DIR, 'claude-code/.claude-plugin/plugin.json'),
      JSON.stringify({
        name: 'verify-plugin',
        version: '0.1.0',
        skills: './skills/',
      }),
    )
    writeFileSync(resolve(DIST_DIR, 'claude-code/skills/research/SKILL.md'), '# Research\n')
    writeFileSync(
      resolve(DIST_DIR, 'claude-code/hooks/hooks.json'),
      JSON.stringify({
        hooks: {
          PreToolUse: [
            {
              matcher: 'Read',
              hooks: [
                {
                  type: 'command',
                  command: 'node "${CLAUDE_PLUGIN_ROOT}/hooks/pluxx-permissions.mjs" claude-pretool',
                },
              ],
            },
          ],
        },
      }),
    )
    writeFileSync(
      resolve(DIST_DIR, 'claude-code/hooks/pluxx-permissions.mjs'),
      buildGeneratedPermissionHookScript({
        allow: ['Read(src/**)'],
        deny: ['Edit(.env)'],
      }) ?? '',
    )

    const installedBundle = resolve(HOME_DIR, '.claude/plugins/cache/pluxx-local-verify-plugin/verify-plugin/0.1.0')
    mkdirSync(resolve(HOME_DIR, '.claude/plugins/cache/pluxx-local-verify-plugin/verify-plugin'), { recursive: true })
    cpSync(resolve(DIST_DIR, 'claude-code'), installedBundle, { recursive: true })

    const result = await verifyInstall(makeClaudeConfig(), {
      rootDir: ROOT,
      targets: ['claude-code'],
    })

    expect(result.ok).toBe(true)
    expect(result.checks[0]).toMatchObject({
      platform: 'claude-code',
      built: true,
      installed: true,
      ok: true,
      errors: 0,
    })
  })

  it('fails when an installed Claude bundled permission hook no longer returns usable decisions', async () => {
    mkdirSync(resolve(DIST_DIR, 'claude-code/.claude-plugin'), { recursive: true })
    mkdirSync(resolve(DIST_DIR, 'claude-code/skills/research'), { recursive: true })
    mkdirSync(resolve(DIST_DIR, 'claude-code/hooks'), { recursive: true })

    writeFileSync(
      resolve(DIST_DIR, 'claude-code/.claude-plugin/plugin.json'),
      JSON.stringify({
        name: 'verify-plugin',
        version: '0.1.0',
        skills: './skills/',
      }),
    )
    writeFileSync(resolve(DIST_DIR, 'claude-code/skills/research/SKILL.md'), '# Research\n')
    writeFileSync(
      resolve(DIST_DIR, 'claude-code/hooks/hooks.json'),
      JSON.stringify({
        hooks: {
          PreToolUse: [
            {
              matcher: 'Read',
              hooks: [
                {
                  type: 'command',
                  command: 'node "${CLAUDE_PLUGIN_ROOT}/hooks/pluxx-permissions.mjs" claude-pretool',
                },
              ],
            },
          ],
        },
      }),
    )
    writeFileSync(
      resolve(DIST_DIR, 'claude-code/hooks/pluxx-permissions.mjs'),
      '#!/usr/bin/env node\nprocess.stdout.write("{}")\n',
    )

    const installedBundle = resolve(HOME_DIR, '.claude/plugins/cache/pluxx-local-verify-plugin/verify-plugin/0.1.0')
    mkdirSync(resolve(HOME_DIR, '.claude/plugins/cache/pluxx-local-verify-plugin/verify-plugin'), { recursive: true })
    cpSync(resolve(DIST_DIR, 'claude-code'), installedBundle, { recursive: true })

    const result = await verifyInstall(makeClaudeConfig(), {
      rootDir: ROOT,
      targets: ['claude-code'],
    })

    expect(result.ok).toBe(false)
    expect(result.checks[0]).toMatchObject({
      platform: 'claude-code',
      built: true,
      installed: true,
      ok: false,
    })
    expect(result.checks[0].errors).toBeGreaterThan(0)
  })
})
