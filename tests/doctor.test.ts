import { describe, expect, it } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { resolve } from 'path'
import { doctorConsumer, doctorProject } from '../src/cli/doctor'

const ROOT = resolve(import.meta.dir, '..')

function createProjectFixture(): string {
  const dir = mkdtempSync(resolve(tmpdir(), 'pluxx-doctor-'))
  mkdirSync(resolve(dir, 'skills/hello'), { recursive: true })
  writeFileSync(
    resolve(dir, 'skills/hello/SKILL.md'),
    '---\nname: hello\ndescription: Say hello\nversion: 0.1.0\n---\n\n# Hello\n',
  )
  writeFileSync(resolve(dir, 'INSTRUCTIONS.md'), '# Instructions\n')
  writeFileSync(
    resolve(dir, 'pluxx.config.json'),
    JSON.stringify({
      name: 'doctor-fixture',
      version: '0.1.0',
      description: 'Doctor fixture',
      author: { name: 'Test Author' },
      license: 'MIT',
      userConfig: [
        {
          key: 'fixture-api-key',
          title: 'Fixture API Key',
          description: 'Access token used by the fixture MCP.',
          type: 'secret',
          required: true,
          envVar: 'FIXTURE_API_KEY',
        },
      ],
      skills: './skills/',
      instructions: './INSTRUCTIONS.md',
      hooks: {
        sessionStart: [
          { type: 'command', command: 'bash "${PLUGIN_ROOT}/scripts/check-env.sh"' },
        ],
      },
      mcp: {
        fixture: {
          transport: 'http',
          url: 'https://example.com/mcp',
          auth: {
            type: 'bearer',
            envVar: 'FIXTURE_API_KEY',
            headerName: 'Authorization',
            headerTemplate: 'Bearer ${value}',
          },
        },
      },
      targets: ['claude-code', 'cursor'],
      outDir: './dist',
    }, null, 2),
  )
  return dir
}

function createConsumerFixture(): string {
  const dir = mkdtempSync(resolve(tmpdir(), 'pluxx-doctor-consumer-'))
  mkdirSync(resolve(dir, '.cursor-plugin'), { recursive: true })
  mkdirSync(resolve(dir, 'skills/hello'), { recursive: true })
  mkdirSync(resolve(dir, 'scripts'), { recursive: true })
  writeFileSync(
    resolve(dir, '.cursor-plugin/plugin.json'),
    JSON.stringify({
      name: 'consumer-fixture',
      version: '0.1.0',
      skills: './skills/',
      mcpServers: './mcp.json',
    }, null, 2),
  )
  writeFileSync(
    resolve(dir, 'mcp.json'),
    JSON.stringify({
      mcpServers: {
        fixture: {
          type: 'http',
          url: 'https://example.com/mcp',
          headers: {
            Authorization: 'Bearer shh-secret',
          },
        },
      },
    }, null, 2),
  )
  writeFileSync(
    resolve(dir, '.pluxx-user.json'),
    JSON.stringify({
      values: {
        'fixture-api-key': 'shh-secret',
      },
      env: {
        FIXTURE_API_KEY: 'shh-secret',
      },
    }, null, 2),
  )
  writeFileSync(
    resolve(dir, 'scripts/check-env.sh'),
    '#!/usr/bin/env bash\nset -euo pipefail\n# pluxx install materialized required config for this local plugin install.\nexit 0\n',
  )
  writeFileSync(resolve(dir, 'skills/hello/SKILL.md'), '# Hello\n')
  return dir
}

function createBrokenClaudeConsumerFixture(): string {
  const dir = mkdtempSync(resolve(tmpdir(), 'pluxx-doctor-claude-consumer-'))
  mkdirSync(resolve(dir, '.claude-plugin'), { recursive: true })
  mkdirSync(resolve(dir, 'skills/research'), { recursive: true })
  mkdirSync(resolve(dir, 'hooks'), { recursive: true })

  writeFileSync(
    resolve(dir, '.claude-plugin/plugin.json'),
    JSON.stringify({
      name: 'claude-consumer-fixture',
      version: '0.1.0',
      commands: './commands/',
      skills: './skills/',
    }, null, 2),
  )
  writeFileSync(resolve(dir, 'skills/research/SKILL.md'), '# Research\n')
  writeFileSync(
    resolve(dir, 'hooks/hooks.json'),
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
    }, null, 2),
  )

  return dir
}

function createHealthyClaudeHookConsumerFixture(options: {
  includeManifestHooks?: boolean
} = {}): string {
  const dir = mkdtempSync(resolve(tmpdir(), 'pluxx-doctor-claude-hook-consumer-'))
  mkdirSync(resolve(dir, '.claude-plugin'), { recursive: true })
  mkdirSync(resolve(dir, 'skills/research'), { recursive: true })
  mkdirSync(resolve(dir, 'hooks'), { recursive: true })
  mkdirSync(resolve(dir, 'scripts'), { recursive: true })

  writeFileSync(
    resolve(dir, '.claude-plugin/plugin.json'),
    JSON.stringify({
      name: 'claude-hook-consumer-fixture',
      version: '0.1.0',
      skills: './skills/',
      ...(options.includeManifestHooks ? { hooks: './hooks/hooks.json' } : {}),
    }, null, 2),
  )
  writeFileSync(resolve(dir, 'skills/research/SKILL.md'), '# Research\n')
  writeFileSync(resolve(dir, 'scripts/session-start.sh'), '#!/usr/bin/env bash\nexit 0\n')
  writeFileSync(
    resolve(dir, 'hooks/hooks.json'),
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
    }, null, 2),
  )

  return dir
}

function createMalformedClaudeHookConsumerFixture(): string {
  const dir = mkdtempSync(resolve(tmpdir(), 'pluxx-doctor-claude-hooks-'))
  mkdirSync(resolve(dir, '.claude-plugin'), { recursive: true })
  mkdirSync(resolve(dir, 'skills/research'), { recursive: true })
  mkdirSync(resolve(dir, 'hooks'), { recursive: true })

  writeFileSync(
    resolve(dir, '.claude-plugin/plugin.json'),
    JSON.stringify({
      name: 'claude-hook-fixture',
      version: '0.1.0',
      skills: './skills/',
    }, null, 2),
  )
  writeFileSync(resolve(dir, 'skills/research/SKILL.md'), '# Research\n')
  writeFileSync(resolve(dir, 'hooks/hooks.json'), '{"hooks":')

  return dir
}

function createMalformedCodexHookConsumerFixture(): string {
  const dir = mkdtempSync(resolve(tmpdir(), 'pluxx-doctor-codex-hooks-'))
  mkdirSync(resolve(dir, '.codex-plugin'), { recursive: true })
  mkdirSync(resolve(dir, 'skills/hello'), { recursive: true })
  mkdirSync(resolve(dir, 'hooks'), { recursive: true })

  writeFileSync(
    resolve(dir, '.codex-plugin/plugin.json'),
    JSON.stringify({
      name: 'codex-hook-fixture',
      version: '0.1.0',
      skills: './skills/',
      hooks: './hooks/hooks.json',
    }, null, 2),
  )
  writeFileSync(resolve(dir, 'skills/hello/SKILL.md'), '# Hello\n')
  writeFileSync(resolve(dir, 'hooks/hooks.json'), '{"version":1,"hooks":')

  return dir
}

function createCodexHookConsumerFixture(): string {
  const dir = mkdtempSync(resolve(tmpdir(), 'pluxx-doctor-codex-hook-flag-'))
  mkdirSync(resolve(dir, '.codex-plugin'), { recursive: true })
  mkdirSync(resolve(dir, 'skills/hello'), { recursive: true })
  mkdirSync(resolve(dir, 'hooks'), { recursive: true })
  mkdirSync(resolve(dir, 'scripts'), { recursive: true })

  writeFileSync(
    resolve(dir, '.codex-plugin/plugin.json'),
    JSON.stringify({
      name: 'codex-hook-flag-fixture',
      version: '0.1.0',
      skills: './skills/',
      hooks: './hooks/hooks.json',
    }, null, 2),
  )
  writeFileSync(resolve(dir, 'skills/hello/SKILL.md'), '# Hello\n')
  writeFileSync(resolve(dir, 'scripts/session-start.sh'), '#!/usr/bin/env bash\nexit 0\n')
  writeFileSync(
    resolve(dir, 'hooks/hooks.json'),
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
    }, null, 2),
  )

  return dir
}

function createCodexAppConsumerFixture(options: {
  includeAppFile?: boolean
} = {}): string {
  const dir = mkdtempSync(resolve(tmpdir(), 'pluxx-doctor-codex-app-'))
  mkdirSync(resolve(dir, '.codex-plugin'), { recursive: true })
  mkdirSync(resolve(dir, 'skills/hello'), { recursive: true })

  writeFileSync(
    resolve(dir, '.codex-plugin/plugin.json'),
    JSON.stringify({
      name: 'codex-app-fixture',
      version: '0.1.0',
      skills: './skills/',
      apps: './.app.json',
    }, null, 2),
  )
  writeFileSync(resolve(dir, 'skills/hello/SKILL.md'), '# Hello\n')

  if (options.includeAppFile !== false) {
    writeFileSync(
      resolve(dir, '.app.json'),
      JSON.stringify({
        capabilities: ['Read'],
      }, null, 2),
    )
  }

  return dir
}

function createCodexConsumerFixture(options: {
  includeRuntime?: boolean
  useScriptEntrypoint?: boolean
  scriptChainsCheckEnv?: boolean
  immediateExit?: boolean
  permissionApprovals?: Array<{ serverName: string; toolName: string }>
} = {}): string {
  const dir = mkdtempSync(resolve(tmpdir(), 'pluxx-doctor-codex-consumer-'))
  mkdirSync(resolve(dir, '.codex-plugin'), { recursive: true })
  mkdirSync(resolve(dir, 'skills/hello'), { recursive: true })
  if (options.includeRuntime) {
    mkdirSync(resolve(dir, 'scripts'), { recursive: true })
    mkdirSync(resolve(dir, 'mcp-server/dist'), { recursive: true })
    writeFileSync(
      resolve(dir, 'mcp-server/dist/index.js'),
      options.immediateExit
        ? 'process.exit(0)\n'
        : 'setInterval(() => {}, 10_000)\n',
    )
    writeFileSync(
      resolve(dir, 'scripts/start-mcp.sh'),
      options.scriptChainsCheckEnv
        ? '#!/usr/bin/env bash\nbash "./scripts/check-env.sh"\nexit 0\n'
        : options.immediateExit
          ? '#!/usr/bin/env bash\nexit 0\n'
          : '#!/usr/bin/env bash\nsleep 10\n',
    )
    writeFileSync(resolve(dir, 'scripts/check-env.sh'), '#!/usr/bin/env bash\nexit 0\n')
  }
  writeFileSync(
    resolve(dir, '.codex-plugin/plugin.json'),
    JSON.stringify({
      name: 'codex-consumer-fixture',
      version: '0.1.0',
      skills: './skills/',
      mcpServers: './.mcp.json',
    }, null, 2),
  )
  writeFileSync(
    resolve(dir, '.mcp.json'),
    JSON.stringify({
      mcpServers: {
        hosted: {
          url: 'https://example.com/mcp',
        },
        localFixture: {
          command: options.useScriptEntrypoint ? 'bash' : 'node',
          args: options.useScriptEntrypoint
            ? ['./scripts/start-mcp.sh']
            : ['./mcp-server/dist/index.js', '--stdio'],
          env: {
            LOCAL_FIXTURE_TOKEN: '${LOCAL_FIXTURE_TOKEN}',
          },
        },
      },
    }, null, 2),
  )
  if ((options.permissionApprovals?.length ?? 0) > 0) {
    mkdirSync(resolve(dir, '.codex'), { recursive: true })
    const lines = [
      '# Generated by test fixture',
    ]
    for (const entry of options.permissionApprovals ?? []) {
      lines.push('')
      lines.push(`[mcp_servers.${JSON.stringify(entry.serverName)}.tools.${JSON.stringify(entry.toolName)}]`)
      lines.push('approval_mode = "approve"')
    }
    writeFileSync(resolve(dir, '.codex/config.generated.toml'), `${lines.join('\n')}\n`)
  }
  writeFileSync(resolve(dir, 'skills/hello/SKILL.md'), '# Hello\n')
  return dir
}

function createOpenCodeConsumerFixture(options: { includeEntry?: boolean; includeSyncedSkills?: boolean } = {}): string {
  const includeEntry = options.includeEntry ?? true
  const includeSyncedSkills = options.includeSyncedSkills ?? true

  const root = mkdtempSync(resolve(tmpdir(), 'pluxx-doctor-opencode-'))
  const pluginDir = resolve(root, '.config/opencode/plugins/megamind')
  const skillDir = resolve(pluginDir, 'skills/client-intel')

  mkdirSync(skillDir, { recursive: true })
  writeFileSync(
    resolve(pluginDir, 'package.json'),
    JSON.stringify({
      name: 'opencode-megamind',
      version: '0.1.0',
      keywords: ['opencode-plugin'],
      peerDependencies: {
        '@opencode-ai/plugin': '*',
      },
    }, null, 2),
  )
  writeFileSync(resolve(pluginDir, 'index.ts'), 'export const MegamindPlugin = async () => ({});\n')
  writeFileSync(
    resolve(pluginDir, 'skills/client-intel/SKILL.md'),
    '---\nname: client-intel\ndescription: Client intel\n---\n\n# Client Intel\n',
  )

  if (includeEntry) {
    writeFileSync(
      resolve(root, '.config/opencode/plugins/megamind.ts'),
      [
        'import type { Plugin } from "@opencode-ai/plugin"',
        'import { join } from "path"',
        '',
        'import * as PluginModule from "./megamind/index.ts"',
        '',
        'const pluginFactory = Object.values(PluginModule).find((value): value is Plugin => typeof value === "function")',
        '',
        'if (!pluginFactory) {',
        '  throw new Error("OpenCode plugin bundle for megamind did not export a plugin function.")',
        '}',
        '',
        'export const Megamind: Plugin = async (context) =>',
        '  pluginFactory({',
        '    ...context,',
        '    directory: join(context.directory, "megamind"),',
        '  })',
        '',
      ].join('\n'),
    )
  }

  if (includeSyncedSkills) {
    const syncedSkillDir = resolve(root, '.config/opencode/skills/megamind-client-intel')
    mkdirSync(syncedSkillDir, { recursive: true })
    writeFileSync(
      resolve(syncedSkillDir, 'SKILL.md'),
      '---\nname: megamind/client-intel\ndescription: Client intel\n---\n\n# Client Intel\n',
    )
  }

  return pluginDir
}

describe('doctorProject', () => {
  it('returns warnings and infos without failing a healthy project', async () => {
    const dir = createProjectFixture()

    try {
      const report = await doctorProject(dir)

      expect(report.ok).toBe(true)
      expect(report.errors).toBe(0)
      expect(report.warnings).toBeGreaterThanOrEqual(1)
      expect(report.checks.some((check) => check.code === 'node-version' && check.level === 'success')).toBe(true)
      expect(report.checks.some((check) => check.code === 'hooks-trust-required' && check.level === 'warning')).toBe(true)
      expect(report.checks.some((check) => check.code === 'mcp-auth-env' && check.level === 'info')).toBe(true)
      expect(report.checks.some((check) => check.code === 'user-config-declared' && check.level === 'info')).toBe(true)
      expect(report.checks.some((check) => check.code === 'primitive-preserve' && check.level === 'success')).toBe(true)
      expect(report.checks.some((check) => check.code === 'primitive-translate' && check.level === 'info' && check.title.includes('distribution') && check.title.includes('claude-code'))).toBe(true)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('explains runtime readiness translation and Codex external wiring', async () => {
    const dir = createProjectFixture()
    writeFileSync(
      resolve(dir, 'pluxx.config.json'),
      JSON.stringify({
        name: 'doctor-fixture',
        version: '0.1.0',
        description: 'Doctor fixture',
        author: { name: 'Test Author' },
        skills: './skills/',
        commands: './commands/',
        targets: ['codex', 'opencode'],
        readiness: {
          dependencies: [
            {
              id: 'runtime-cache',
              path: './runtime/status.json',
              refresh: {
                command: '${PLUGIN_ROOT}/scripts/refresh-runtime.sh',
              },
            },
          ],
          gates: [
            {
              dependency: 'runtime-cache',
              applyTo: ['skills', 'commands'],
              skills: ['hello'],
              commands: ['review'],
            },
          ],
        },
      }, null, 2),
    )

    try {
      const report = await doctorProject(dir)
      expect(report.checks.some((check) => check.code === 'runtime-readiness-configured' && check.level === 'success')).toBe(true)
      expect(report.checks.some((check) => check.code === 'runtime-readiness-prompt-scope' && check.level === 'warning')).toBe(true)
      expect(report.checks.some((check) => check.code === 'runtime-readiness-codex-external' && check.level === 'warning')).toBe(true)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('fails when no config is present', async () => {
    const dir = mkdtempSync(resolve(tmpdir(), 'pluxx-doctor-empty-'))

    try {
      const report = await doctorProject(dir)
      expect(report.ok).toBe(false)
      expect(report.errors).toBe(1)
      expect(report.checks.some((check) => check.code === 'config-not-found')).toBe(true)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('reports malformed MCP scaffold metadata as a blocking error', async () => {
    const dir = createProjectFixture()
    mkdirSync(resolve(dir, '.pluxx'), { recursive: true })
    writeFileSync(resolve(dir, '.pluxx/mcp.json'), '{broken')

    try {
      const report = await doctorProject(dir)
      expect(report.ok).toBe(false)
      expect(report.checks.some((check) => check.code === 'mcp-metadata-invalid' && check.level === 'error')).toBe(true)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('warns when MCP scaffold metadata has weak tool metadata', async () => {
    const dir = createProjectFixture()
    mkdirSync(resolve(dir, '.pluxx'), { recursive: true })
    writeFileSync(
      resolve(dir, '.pluxx/mcp.json'),
      JSON.stringify({
        version: 1,
        source: {
          transport: 'http',
          url: 'https://example.com/mcp',
        },
        serverInfo: {
          name: 'fixture',
        },
        settings: {
          pluginName: 'doctor-fixture',
          displayName: 'Doctor Fixture',
          skillGrouping: 'workflow',
          requestedHookMode: 'none',
          generatedHookMode: 'none',
          generatedHookEvents: [],
        },
        tools: [
          { name: 'tool_1', description: 'N/A' },
          { name: 'search_accounts' },
        ],
        skills: [],
        managedFiles: ['INSTRUCTIONS.md'],
      }, null, 2),
    )

    try {
      const report = await doctorProject(dir)
      expect(report.checks.some((check) => check.code === 'mcp-metadata-quality-weak' && check.level === 'warning')).toBe(true)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('does not warn on terse but valid tool descriptions', async () => {
    const dir = createProjectFixture()
    mkdirSync(resolve(dir, '.pluxx'), { recursive: true })
    writeFileSync(
      resolve(dir, '.pluxx/mcp.json'),
      JSON.stringify({
        version: 1,
        source: {
          transport: 'http',
          url: 'https://example.com/mcp',
        },
        serverInfo: {
          name: 'fixture',
        },
        settings: {
          pluginName: 'doctor-fixture',
          displayName: 'Doctor Fixture',
          skillGrouping: 'workflow',
          requestedHookMode: 'none',
          generatedHookMode: 'none',
          generatedHookEvents: [],
        },
        tools: [
          { name: 'check_status', description: 'Check status' },
          { name: 'list_tables', description: 'List tables' },
        ],
        skills: [],
        managedFiles: ['INSTRUCTIONS.md'],
      }, null, 2),
    )

    try {
      const report = await doctorProject(dir)
      expect(report.checks.some((check) => check.code === 'mcp-metadata-quality-weak')).toBe(false)
      expect(report.checks.some((check) => check.code === 'mcp-metadata-quality-ok' && check.level === 'success')).toBe(true)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('explains when migrated source-host assumptions still influence compilation', async () => {
    const dir = createProjectFixture()
    mkdirSync(resolve(dir, '.pluxx'), { recursive: true })
    writeFileSync(
      resolve(dir, '.pluxx/compiler-intent.json'),
      JSON.stringify({
        version: 1,
        skillPolicies: [
          {
            skillDir: 'hello',
            title: 'hello',
            source: {
              kind: 'claude-allowed-tools',
              platform: 'claude-code',
            },
            permissions: {
              allow: ['Read(*)'],
            },
          },
        ],
      }, null, 2),
    )

    try {
      const report = await doctorProject(dir)
      expect(report.checks.some((check) => check.code === 'compiler-intent-source-host' && check.level === 'info')).toBe(true)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('warns when host-supported branding metadata is absent', async () => {
    const dir = createProjectFixture()
    writeFileSync(
      resolve(dir, 'pluxx.config.json'),
      JSON.stringify({
        name: 'doctor-fixture',
        version: '0.1.0',
        description: 'Doctor fixture',
        author: { name: 'Test Author' },
        skills: './skills/',
        targets: ['cursor', 'codex'],
        brand: {
          displayName: 'Doctor Fixture',
        },
      }, null, 2),
    )

    try {
      const report = await doctorProject(dir)
      expect(report.checks.some((check) => check.code === 'cursor-branding-metadata-missing' && check.level === 'warning')).toBe(true)
      expect(report.checks.some((check) => check.code === 'codex-branding-metadata-missing' && check.level === 'warning')).toBe(true)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('prints stable JSON from the CLI', async () => {
    const dir = createProjectFixture()

    try {
      const proc = Bun.spawn(['bun', resolve(ROOT, 'bin/pluxx.js'), 'doctor', '--json'], {
        cwd: dir,
        stdout: 'pipe',
        stderr: 'pipe',
      })
      const stdout = await new Response(proc.stdout).text()
      const stderr = await new Response(proc.stderr).text()
      const exitCode = await proc.exited

      expect(exitCode).toBe(0)
      expect(stderr).toBe('')

      const report = JSON.parse(stdout) as {
        ok: boolean
        errors: number
        warnings: number
        infos: number
        checks: Array<{ code: string }>
      }

      expect(report.ok).toBe(true)
      expect(typeof report.errors).toBe('number')
      expect(typeof report.warnings).toBe('number')
      expect(typeof report.infos).toBe('number')
      expect(Array.isArray(report.checks)).toBe(true)
      expect(report.checks.some((check) => check.code === 'config-valid')).toBe(true)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('doctorConsumer', () => {
  it('reports installed bundle health for a materialized consumer install', async () => {
    const dir = createConsumerFixture()

    try {
      const report = await doctorConsumer(dir)
      expect(report.ok).toBe(true)
      expect(report.checks.some((check) => check.code === 'consumer-platform-detected' && check.level === 'success')).toBe(true)
      expect(report.checks.some((check) => check.code === 'consumer-manifest-valid' && check.level === 'success')).toBe(true)
      expect(report.checks.some((check) => check.code === 'consumer-bundle-integrity-valid' && check.level === 'success')).toBe(true)
      expect(report.checks.some((check) => check.code === 'consumer-user-config-valid' && check.level === 'success')).toBe(true)
      expect(report.checks.some((check) => check.code === 'consumer-env-script-materialized' && check.level === 'success')).toBe(true)
      expect(report.checks.some((check) => check.code === 'consumer-mcp-inline-auth' && check.level === 'success')).toBe(true)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('warns when a materialized consumer install contains placeholder-looking secrets', async () => {
    const dir = createConsumerFixture()

    try {
      writeFileSync(
        resolve(dir, '.pluxx-user.json'),
        JSON.stringify({
          values: {
            'fixture-api-key': 'dummy API key',
          },
          env: {
            FIXTURE_API_KEY: 'dummy API key',
          },
        }, null, 2),
      )

      const report = await doctorConsumer(dir)
      expect(report.ok).toBe(true)
      expect(report.checks.some((check) => check.code === 'consumer-user-config-placeholder-secret' && check.level === 'warning')).toBe(true)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('fails when an installed Claude bundle is missing manifest or hook-referenced files', async () => {
    const dir = createBrokenClaudeConsumerFixture()

    try {
      const report = await doctorConsumer(dir)
      expect(report.ok).toBe(false)
      expect(report.checks.some((check) => check.code === 'consumer-bundle-integrity-invalid' && check.level === 'error')).toBe(true)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('fails when a generated-shape Claude installed hook config is malformed', async () => {
    const dir = createMalformedClaudeHookConsumerFixture()

    try {
      const report = await doctorConsumer(dir)
      expect(report.ok).toBe(false)
      expect(report.checks.some((check) => check.code === 'consumer-bundle-integrity-invalid' && check.level === 'error')).toBe(true)
      expect(report.checks.some((check) => check.detail.includes('hooks config at ./hooks/hooks.json is not parseable'))).toBe(true)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('fails when an installed Claude bundle redundantly declares the standard hooks file in the manifest', async () => {
    const dir = createHealthyClaudeHookConsumerFixture({ includeManifestHooks: true })

    try {
      const report = await doctorConsumer(dir)
      expect(report.ok).toBe(false)
      expect(report.checks.some((check) => check.code === 'consumer-bundle-integrity-invalid' && check.level === 'error')).toBe(true)
      expect(report.checks.some((check) => check.detail.includes('Claude auto-loads hooks/hooks.json'))).toBe(true)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('warns when a hook-bearing Claude install is checked with disableAllHooks in user settings', async () => {
    const dir = createHealthyClaudeHookConsumerFixture()
    const projectRoot = mkdtempSync(resolve(tmpdir(), 'pluxx-doctor-claude-project-'))
    const homeDir = mkdtempSync(resolve(tmpdir(), 'pluxx-doctor-claude-home-'))
    const originalHome = process.env.HOME
    process.env.HOME = homeDir
    mkdirSync(resolve(homeDir, '.claude'), { recursive: true })
    writeFileSync(resolve(homeDir, '.claude/settings.json'), JSON.stringify({ disableAllHooks: true }, null, 2))

    try {
      const report = await doctorConsumer(dir, { projectRoot })
      expect(report.ok).toBe(true)
      expect(report.checks.some((check) => check.code === 'consumer-claude-hooks-disabled' && check.level === 'warning')).toBe(true)
      expect(report.checks.some((check) => check.code === 'consumer-claude-hook-settings-clear')).toBe(false)
    } finally {
      process.env.HOME = originalHome
      rmSync(dir, { recursive: true, force: true })
      rmSync(projectRoot, { recursive: true, force: true })
      rmSync(homeDir, { recursive: true, force: true })
    }
  })

  it('reports success when a hook-bearing Claude install has no disableAllHooks blocker in checked settings', async () => {
    const dir = createHealthyClaudeHookConsumerFixture()
    const projectRoot = mkdtempSync(resolve(tmpdir(), 'pluxx-doctor-claude-project-'))
    const homeDir = mkdtempSync(resolve(tmpdir(), 'pluxx-doctor-claude-home-'))
    const originalHome = process.env.HOME
    process.env.HOME = homeDir

    try {
      const report = await doctorConsumer(dir, { projectRoot })
      expect(report.ok).toBe(true)
      expect(report.checks.some((check) => check.code === 'consumer-claude-hook-settings-clear' && check.level === 'success')).toBe(true)
      expect(report.checks.some((check) => check.code === 'consumer-claude-hooks-disabled')).toBe(false)
    } finally {
      process.env.HOME = originalHome
      rmSync(dir, { recursive: true, force: true })
      rmSync(projectRoot, { recursive: true, force: true })
      rmSync(homeDir, { recursive: true, force: true })
    }
  })

  it('fails when an installed bundled hook config is malformed', async () => {
    const dir = createMalformedCodexHookConsumerFixture()

    try {
      const report = await doctorConsumer(dir)
      expect(report.ok).toBe(false)
      expect(report.checks.some((check) => check.code === 'consumer-bundle-integrity-invalid' && check.level === 'error')).toBe(true)
      expect(report.checks.some((check) => check.detail.includes('hooks config at ./hooks/hooks.json is not parseable'))).toBe(true)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('warns when an installed codex bundle includes hooks but host config does not enable hooks', async () => {
    const dir = createCodexHookConsumerFixture()
    const projectRoot = mkdtempSync(resolve(tmpdir(), 'pluxx-doctor-codex-project-'))
    const originalHome = process.env.HOME
    const originalCodexHome = process.env.CODEX_HOME
    const homeDir = mkdtempSync(resolve(tmpdir(), 'pluxx-doctor-codex-home-'))
    process.env.HOME = homeDir
    delete process.env.CODEX_HOME

    try {
      const report = await doctorConsumer(dir, { projectRoot })
      expect(report.ok).toBe(true)
      expect(report.checks.some((check) => check.code === 'consumer-codex-hooks-feature-flag-missing' && check.level === 'warning')).toBe(true)
      expect(report.checks.some((check) => check.code === 'consumer-codex-hooks-feature-flag-enabled')).toBe(false)
    } finally {
      process.env.HOME = originalHome
      if (originalCodexHome === undefined) {
        delete process.env.CODEX_HOME
      } else {
        process.env.CODEX_HOME = originalCodexHome
      }
      rmSync(dir, { recursive: true, force: true })
      rmSync(projectRoot, { recursive: true, force: true })
      rmSync(homeDir, { recursive: true, force: true })
    }
  })

  it('reports success when a project Codex config enables hooks for a hook-bearing install', async () => {
    const dir = createCodexHookConsumerFixture()
    const projectRoot = mkdtempSync(resolve(tmpdir(), 'pluxx-doctor-codex-project-'))
    const originalHome = process.env.HOME
    const originalCodexHome = process.env.CODEX_HOME
    const homeDir = mkdtempSync(resolve(tmpdir(), 'pluxx-doctor-codex-home-'))
    process.env.HOME = homeDir
    delete process.env.CODEX_HOME
    mkdirSync(resolve(projectRoot, '.codex'), { recursive: true })
    mkdirSync(resolve(homeDir, '.codex'), { recursive: true })
    writeFileSync(resolve(projectRoot, '.codex/config.toml'), '[features]\nplugin_hooks = true\n')
    writeFileSync(
      resolve(homeDir, '.codex/config.toml'),
      `[projects.${JSON.stringify(resolve(projectRoot))}]\ntrust_level = "trusted"\n`,
    )

    try {
      const report = await doctorConsumer(dir, { projectRoot })
      expect(report.ok).toBe(true)
      expect(report.checks.some((check) => check.code === 'consumer-codex-hooks-feature-flag-enabled' && check.level === 'success')).toBe(true)
      expect(report.checks.some((check) => check.code === 'consumer-codex-project-trust-enabled' && check.level === 'success')).toBe(true)
      expect(report.checks.some((check) => check.code === 'consumer-codex-hooks-feature-flag-missing')).toBe(false)
      expect(report.checks.some((check) => check.code === 'consumer-codex-project-trust-missing')).toBe(false)
    } finally {
      process.env.HOME = originalHome
      if (originalCodexHome === undefined) {
        delete process.env.CODEX_HOME
      } else {
        process.env.CODEX_HOME = originalCodexHome
      }
      rmSync(dir, { recursive: true, force: true })
      rmSync(projectRoot, { recursive: true, force: true })
      rmSync(homeDir, { recursive: true, force: true })
    }
  })

  it('reports success when a user Codex config enables hooks for a hook-bearing install', async () => {
    const dir = createCodexHookConsumerFixture()
    const projectRoot = mkdtempSync(resolve(tmpdir(), 'pluxx-doctor-codex-project-'))
    const originalHome = process.env.HOME
    const originalCodexHome = process.env.CODEX_HOME
    const homeDir = mkdtempSync(resolve(tmpdir(), 'pluxx-doctor-codex-home-'))
    process.env.HOME = homeDir
    delete process.env.CODEX_HOME
    mkdirSync(resolve(homeDir, '.codex'), { recursive: true })
    writeFileSync(
      resolve(homeDir, '.codex/config.toml'),
      `[features]\nhooks = true\n\n[projects.${JSON.stringify(resolve(projectRoot))}]\ntrust_level = "trusted"\n`,
    )

    try {
      const report = await doctorConsumer(dir, { projectRoot })
      expect(report.ok).toBe(true)
      expect(report.checks.some((check) => check.code === 'consumer-codex-hooks-feature-flag-enabled' && check.level === 'success')).toBe(true)
      expect(report.checks.some((check) => check.code === 'consumer-codex-project-trust-enabled' && check.level === 'success')).toBe(true)
      expect(report.checks.some((check) => check.code === 'consumer-codex-hooks-feature-flag-missing')).toBe(false)
      expect(report.checks.some((check) => check.code === 'consumer-codex-project-trust-missing')).toBe(false)
    } finally {
      process.env.HOME = originalHome
      if (originalCodexHome === undefined) {
        delete process.env.CODEX_HOME
      } else {
        process.env.CODEX_HOME = originalCodexHome
      }
      rmSync(dir, { recursive: true, force: true })
      rmSync(projectRoot, { recursive: true, force: true })
      rmSync(homeDir, { recursive: true, force: true })
    }
  })

  it('warns when a hook-bearing Codex install is not trusted even when the feature flag is enabled', async () => {
    const dir = createCodexHookConsumerFixture()
    const projectRoot = mkdtempSync(resolve(tmpdir(), 'pluxx-doctor-codex-project-'))
    const originalHome = process.env.HOME
    const originalCodexHome = process.env.CODEX_HOME
    const homeDir = mkdtempSync(resolve(tmpdir(), 'pluxx-doctor-codex-home-'))
    process.env.HOME = homeDir
    delete process.env.CODEX_HOME
    mkdirSync(resolve(projectRoot, '.codex'), { recursive: true })
    writeFileSync(resolve(projectRoot, '.codex/config.toml'), '[features]\nplugin_hooks = true\n')

    try {
      const report = await doctorConsumer(dir, { projectRoot })
      expect(report.ok).toBe(true)
      expect(report.checks.some((check) => check.code === 'consumer-codex-hooks-feature-flag-enabled' && check.level === 'success')).toBe(true)
      expect(report.checks.some((check) => check.code === 'consumer-codex-plugin-hooks-feature-flag-general-only')).toBe(false)
      expect(report.checks.some((check) => check.code === 'consumer-codex-project-trust-enabled')).toBe(false)
      expect(report.checks.some((check) => check.code === 'consumer-codex-project-trust-missing' && check.level === 'warning')).toBe(true)
    } finally {
      process.env.HOME = originalHome
      if (originalCodexHome === undefined) {
        delete process.env.CODEX_HOME
      } else {
        process.env.CODEX_HOME = originalCodexHome
      }
      rmSync(dir, { recursive: true, force: true })
      rmSync(projectRoot, { recursive: true, force: true })
      rmSync(homeDir, { recursive: true, force: true })
    }
  })

  it('reports success when a hook-bearing Codex install finds plugin_hooks in the checked config layers', async () => {
    const dir = createCodexHookConsumerFixture()
    const projectRoot = mkdtempSync(resolve(tmpdir(), 'pluxx-doctor-codex-project-'))
    const originalHome = process.env.HOME
    const originalCodexHome = process.env.CODEX_HOME
    const homeDir = mkdtempSync(resolve(tmpdir(), 'pluxx-doctor-codex-home-'))
    process.env.HOME = homeDir
    delete process.env.CODEX_HOME
    mkdirSync(resolve(projectRoot, '.codex'), { recursive: true })
    mkdirSync(resolve(homeDir, '.codex'), { recursive: true })
    writeFileSync(resolve(projectRoot, '.codex/config.toml'), '[features]\nplugin_hooks = true\n')
    writeFileSync(
      resolve(homeDir, '.codex/config.toml'),
      `[projects.${JSON.stringify(resolve(projectRoot))}]\ntrust_level = "trusted"\n`,
    )

    try {
      const report = await doctorConsumer(dir, { projectRoot })
      expect(report.ok).toBe(true)
      expect(report.checks.some((check) => check.code === 'consumer-codex-hooks-feature-flag-enabled' && check.level === 'success')).toBe(true)
      expect(report.checks.some((check) => check.code === 'consumer-codex-hooks-feature-flag-legacy-only')).toBe(false)
      expect(report.checks.some((check) => check.code === 'consumer-codex-plugin-hooks-feature-flag-general-only')).toBe(false)
      expect(report.checks.some((check) => check.code === 'consumer-codex-hooks-feature-flag-missing')).toBe(false)
      expect(report.checks.some((check) => check.code === 'consumer-codex-project-trust-enabled' && check.level === 'success')).toBe(true)
      expect(report.checks.some((check) => check.code === 'consumer-codex-project-trust-missing')).toBe(false)
    } finally {
      process.env.HOME = originalHome
      if (originalCodexHome === undefined) {
        delete process.env.CODEX_HOME
      } else {
        process.env.CODEX_HOME = originalCodexHome
      }
      rmSync(dir, { recursive: true, force: true })
      rmSync(projectRoot, { recursive: true, force: true })
      rmSync(homeDir, { recursive: true, force: true })
    }
  })

  it('warns when generated Codex MCP approval stanzas have not been merged into active config', async () => {
    const dir = createCodexConsumerFixture({
      includeRuntime: true,
      permissionApprovals: [{ serverName: 'hosted', toolName: 'search' }],
    })
    const projectRoot = mkdtempSync(resolve(tmpdir(), 'pluxx-doctor-codex-project-'))
    const originalHome = process.env.HOME
    const originalCodexHome = process.env.CODEX_HOME
    const homeDir = mkdtempSync(resolve(tmpdir(), 'pluxx-doctor-codex-home-'))
    process.env.HOME = homeDir
    delete process.env.CODEX_HOME

    try {
      const report = await doctorConsumer(dir, { projectRoot })
      expect(report.ok).toBe(true)
      expect(report.checks.some((check) => check.code === 'consumer-codex-mcp-approval-config-missing' && check.level === 'warning')).toBe(true)
      expect(report.checks.some((check) => check.detail.includes('.codex/config.generated.toml'))).toBe(true)
    } finally {
      process.env.HOME = originalHome
      if (originalCodexHome === undefined) {
        delete process.env.CODEX_HOME
      } else {
        process.env.CODEX_HOME = originalCodexHome
      }
      rmSync(dir, { recursive: true, force: true })
      rmSync(projectRoot, { recursive: true, force: true })
      rmSync(homeDir, { recursive: true, force: true })
    }
  })

  it('reports success when generated Codex MCP approval stanzas are merged into project config', async () => {
    const dir = createCodexConsumerFixture({
      includeRuntime: true,
      permissionApprovals: [{ serverName: 'hosted', toolName: 'search' }],
    })
    const projectRoot = mkdtempSync(resolve(tmpdir(), 'pluxx-doctor-codex-project-'))
    const originalHome = process.env.HOME
    const originalCodexHome = process.env.CODEX_HOME
    const homeDir = mkdtempSync(resolve(tmpdir(), 'pluxx-doctor-codex-home-'))
    process.env.HOME = homeDir
    delete process.env.CODEX_HOME
    mkdirSync(resolve(projectRoot, '.codex'), { recursive: true })
    writeFileSync(
      resolve(projectRoot, '.codex/config.toml'),
      '[mcp_servers.hosted.tools.search]\napproval_mode = "approve"\n',
    )

    try {
      const report = await doctorConsumer(dir, { projectRoot })
      expect(report.ok).toBe(true)
      expect(report.checks.some((check) => check.code === 'consumer-codex-mcp-approval-config-merged' && check.level === 'success')).toBe(true)
      expect(report.checks.some((check) => check.code === 'consumer-codex-mcp-approval-config-missing')).toBe(false)
    } finally {
      process.env.HOME = originalHome
      if (originalCodexHome === undefined) {
        delete process.env.CODEX_HOME
      } else {
        process.env.CODEX_HOME = originalCodexHome
      }
      rmSync(dir, { recursive: true, force: true })
      rmSync(projectRoot, { recursive: true, force: true })
      rmSync(homeDir, { recursive: true, force: true })
    }
  })

  it('fails when an installed codex bundle references a missing .app.json surface', async () => {
    const dir = createCodexAppConsumerFixture({ includeAppFile: false })

    try {
      const report = await doctorConsumer(dir)
      expect(report.ok).toBe(false)
      expect(report.checks.some((check) => check.code === 'consumer-bundle-integrity-invalid' && check.level === 'error')).toBe(true)
      expect(report.checks.some((check) => check.detail.includes('manifest references missing path: ./.app.json'))).toBe(true)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('warns when a hook-bearing Codex install finds only general hook flags in the checked config layers', async () => {
    const dir = createCodexHookConsumerFixture()
    const projectRoot = mkdtempSync(resolve(tmpdir(), 'pluxx-doctor-codex-project-'))
    const originalHome = process.env.HOME
    const originalCodexHome = process.env.CODEX_HOME
    const homeDir = mkdtempSync(resolve(tmpdir(), 'pluxx-doctor-codex-home-'))
    process.env.HOME = homeDir
    delete process.env.CODEX_HOME
    mkdirSync(resolve(projectRoot, '.codex'), { recursive: true })
    mkdirSync(resolve(homeDir, '.codex'), { recursive: true })
    writeFileSync(resolve(projectRoot, '.codex/config.toml'), '[features]\nhooks = true\n')
    writeFileSync(
      resolve(homeDir, '.codex/config.toml'),
      `[projects.${JSON.stringify(resolve(projectRoot))}]\ntrust_level = "trusted"\n`,
    )

    try {
      const report = await doctorConsumer(dir, { projectRoot })
      expect(report.ok).toBe(true)
      expect(report.checks.some((check) => check.code === 'consumer-codex-plugin-hooks-feature-flag-general-only' && check.level === 'warning')).toBe(true)
      expect(report.checks.some((check) => check.code === 'consumer-codex-hooks-feature-flag-enabled')).toBe(false)
      expect(report.checks.some((check) => check.code === 'consumer-codex-hooks-feature-flag-missing' && check.level === 'warning')).toBe(true)
    } finally {
      process.env.HOME = originalHome
      if (originalCodexHome === undefined) {
        delete process.env.CODEX_HOME
      } else {
        process.env.CODEX_HOME = originalCodexHome
      }
      rmSync(dir, { recursive: true, force: true })
      rmSync(projectRoot, { recursive: true, force: true })
      rmSync(homeDir, { recursive: true, force: true })
    }
  })

  it('fails cleanly when consumer mode points at a source project', async () => {
    const dir = createProjectFixture()

    try {
      const report = await doctorConsumer(dir)
      expect(report.ok).toBe(false)
      expect(report.checks.some((check) => check.code === 'consumer-source-project' && check.level === 'error')).toBe(true)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('prints stable JSON from the CLI in consumer mode', async () => {
    const dir = createConsumerFixture()

    try {
      const proc = Bun.spawn(['bun', resolve(ROOT, 'bin/pluxx.js'), 'doctor', '--consumer', '--json', dir], {
        cwd: ROOT,
        stdout: 'pipe',
        stderr: 'pipe',
      })
      const stdout = await new Response(proc.stdout).text()
      const stderr = await new Response(proc.stderr).text()
      const exitCode = await proc.exited

      expect(exitCode).toBe(0)
      expect(stderr).toBe('')

      const report = JSON.parse(stdout) as {
        ok: boolean
        checks: Array<{ code: string }>
      }

      expect(report.ok).toBe(true)
      expect(report.checks.some((check) => check.code === 'consumer-platform-detected')).toBe(true)
      expect(report.checks.some((check) => check.code === 'consumer-mcp-inline-auth')).toBe(true)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('reports stdio and runtime-auth expectations for Codex-style installed bundles', async () => {
    const dir = createCodexConsumerFixture()

    try {
      const report = await doctorConsumer(dir)
      expect(report.ok).toBe(false)
      expect(report.checks.some((check) => check.code === 'consumer-platform-detected' && check.level === 'success')).toBe(true)
      expect(report.checks.some((check) => check.code === 'consumer-codex-mcp-bundled-visibility' && check.level === 'info')).toBe(true)
      expect(report.checks.some((check) => check.code === 'consumer-mcp-stdio' && check.level === 'info')).toBe(true)
      expect(report.checks.some((check) => check.code === 'consumer-mcp-stdio-runtime-missing' && check.level === 'warning')).toBe(true)
      expect(report.checks.some((check) => check.code === 'consumer-mcp-stdio-launch-failed' && check.level === 'error')).toBe(true)
      expect(report.checks.some((check) => check.code === 'consumer-mcp-remote-auth-runtime' && check.level === 'info')).toBe(true)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('clears the missing-runtime warning when the bundled stdio files are present', async () => {
    const dir = createCodexConsumerFixture({ includeRuntime: true })

    try {
      const report = await doctorConsumer(dir)
      expect(report.checks.some((check) => check.code === 'consumer-mcp-stdio' && check.level === 'info')).toBe(true)
      expect(report.checks.some((check) => check.code === 'consumer-mcp-stdio-runtime-missing')).toBe(false)
      expect(report.checks.some((check) => check.code === 'consumer-mcp-stdio-launch-valid' && check.level === 'success')).toBe(true)
      expect(report.checks.some((check) => check.code === 'consumer-runtime-script-roles' && check.level === 'info')).toBe(true)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('fails when an installed stdio MCP runtime exits immediately', async () => {
    const dir = createCodexConsumerFixture({ includeRuntime: true, immediateExit: true })

    try {
      const report = await doctorConsumer(dir)
      expect(report.ok).toBe(false)
      expect(report.checks.some((check) => check.code === 'consumer-mcp-stdio-launch-failed' && check.level === 'error')).toBe(true)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('warns when an installed non-Claude bundle still contains another host root variable', async () => {
    const dir = createCodexConsumerFixture({ includeRuntime: true })
    writeFileSync(
      resolve(dir, '.mcp.json'),
      JSON.stringify({
        mcpServers: {
          localFixture: {
            command: 'bash',
            args: ['${CLAUDE_PLUGIN_ROOT}/scripts/start-mcp.sh'],
            env: {
              LOCAL_FIXTURE_TOKEN: '${LOCAL_FIXTURE_TOKEN}',
            },
          },
        },
      }, null, 2),
    )

    try {
      const report = await doctorConsumer(dir)
      expect(report.checks.some((check) => check.code === 'consumer-mcp-stdio-host-root-leak' && check.level === 'warning')).toBe(true)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('fails when an installed stdio runtime script still chains through check-env.sh', async () => {
    const dir = createCodexConsumerFixture({
      includeRuntime: true,
      useScriptEntrypoint: true,
      scriptChainsCheckEnv: true,
    })

    try {
      const report = await doctorConsumer(dir)
      expect(report.ok).toBe(false)
      expect(report.checks.some((check) => check.code === 'consumer-bundle-integrity-invalid' && check.level === 'error')).toBe(true)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('validates OpenCode host-visible wrapper and exported skills for installed bundles', async () => {
    const dir = createOpenCodeConsumerFixture()

    try {
      const report = await doctorConsumer(dir)
      expect(report.ok).toBe(true)
      expect(report.checks.some((check) => check.code === 'consumer-opencode-entry-valid' && check.level === 'success')).toBe(true)
      expect(report.checks.some((check) => check.code === 'consumer-opencode-skill-sync-valid' && check.level === 'success')).toBe(true)
    } finally {
      rmSync(resolve(dir, '..', '..', '..', '..'), { recursive: true, force: true })
    }
  })

  it('fails OpenCode consumer checks when the host entry file is missing', async () => {
    const dir = createOpenCodeConsumerFixture({ includeEntry: false })

    try {
      const report = await doctorConsumer(dir)
      expect(report.ok).toBe(false)
      expect(report.checks.some((check) => check.code === 'consumer-opencode-entry-missing' && check.level === 'error')).toBe(true)
    } finally {
      rmSync(resolve(dir, '..', '..', '..', '..'), { recursive: true, force: true })
    }
  })

  it('fails OpenCode consumer checks when exported skills are not synced globally', async () => {
    const dir = createOpenCodeConsumerFixture({ includeSyncedSkills: false })

    try {
      const report = await doctorConsumer(dir)
      expect(report.ok).toBe(false)
      expect(report.checks.some((check) => check.code === 'consumer-opencode-skill-sync-incomplete' && check.level === 'error')).toBe(true)
    } finally {
      rmSync(resolve(dir, '..', '..', '..', '..'), { recursive: true, force: true })
    }
  })

  it('fails Cursor consumer checks when the manifest rules path is missing from the installed bundle', async () => {
    const dir = createConsumerFixture()
    mkdirSync(resolve(dir, 'rules'), { recursive: true })
    writeFileSync(
      resolve(dir, '.cursor-plugin/plugin.json'),
      JSON.stringify({
        name: 'consumer-fixture',
        version: '0.1.0',
        skills: './skills/',
        rules: './rules/',
        mcpServers: './mcp.json',
      }, null, 2),
    )
    writeFileSync(resolve(dir, 'rules/policy.mdc'), '# Policy\n')
    rmSync(resolve(dir, 'rules'), { recursive: true, force: true })

    try {
      const report = await doctorConsumer(dir)
      expect(report.ok).toBe(false)
      expect(report.checks.some((check) => check.code === 'consumer-bundle-integrity-invalid' && check.level === 'error')).toBe(true)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
