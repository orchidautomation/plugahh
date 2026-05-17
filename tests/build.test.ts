import { describe, it, expect, beforeAll, afterAll } from 'bun:test'
import { mkdirSync, rmSync, existsSync, readFileSync, writeFileSync } from 'fs'
import { resolve } from 'path'
import { spawnSync } from 'child_process'
import { build } from '../src/generators'
import type { PluginConfig } from '../src/schema'

const TEST_DIR = resolve(import.meta.dir, '.fixture')
const OUT_DIR = resolve(TEST_DIR, 'dist')

function extractGeneratedJson<T>(source: string, constantName: string): T {
  const match = source.match(new RegExp(`const ${constantName} = ([\\s\\S]*?)\\n\\nconst `))
  if (!match?.[1]) {
    throw new Error(`Could not locate ${constantName} in generated source.`)
  }
  return JSON.parse(match[1]) as T
}

function runPermissionHookScript(
  scriptPath: string,
  mode: string,
  event: Record<string, unknown>,
): Record<string, unknown> {
  const result = spawnSync('node', [scriptPath, mode], {
    input: JSON.stringify(event),
    encoding: 'utf-8',
  })

  expect(result.status).toBe(0)
  expect(result.stderr).toBe('')
  return JSON.parse(result.stdout || '{}') as Record<string, unknown>
}

interface CodexCommandHookHandler {
  type: 'command'
  command: string
  timeout?: number
}

interface CodexHookMatcherGroup {
  matcher?: string
  hooks: CodexCommandHookHandler[]
}

const testConfig: PluginConfig = {
  name: 'test-plugin',
  version: '1.0.0',
  description: 'A test plugin',
  author: { name: 'Test Author' },
  license: 'MIT',
  skills: './skills/',
  brand: {
    displayName: 'Test Plugin',
    shortDescription: 'A test plugin for testing',
    longDescription: 'A longer test plugin description for rich host listings.',
    category: 'Productivity',
    color: '#FF0000',
    icon: './assets/icon.svg',
    screenshots: ['./assets/screenshots/overview.svg'],
    defaultPrompts: ['Hello from test plugin'],
    websiteURL: 'https://example.com',
    privacyPolicyURL: 'https://example.com/privacy',
    termsOfServiceURL: 'https://example.com/terms',
  },
  mcp: {
    'test-server': {
      url: 'https://test.example.com/mcp',
      transport: 'http',
      auth: {
        type: 'bearer',
        envVar: 'TEST_API_KEY',
        headerName: 'Authorization',
        headerTemplate: 'Bearer ${value}',
      },
    },
  },
  hooks: {
    sessionStart: [{
      command: '${PLUGIN_ROOT}/scripts/validate.sh',
    }],
    beforeSubmitPrompt: [{
      command: '${PLUGIN_ROOT}/scripts/check-prompt.sh',
    }],
  },
  commands: './commands/',
  agents: './agents/',
  scripts: './scripts/',
  assets: './assets/',
  passthrough: ['./mcp-server/'],
  instructions: './INSTRUCTIONS.md',
  platforms: {
    codex: {
      app: {
        capabilities: ['Interactive', 'Read'],
        actions: {
          openComposer: true,
        },
      },
    },
    cursor: {
      rules: [{
        description: 'Megamind operating conventions',
        alwaysApply: true,
        globs: ['**/*.ts', '**/*.tsx'],
        content: 'Always verify account context before responding.',
      }],
    },
  },
  targets: [
    'claude-code',
    'cursor',
    'codex',
    'opencode',
    'github-copilot',
    'openhands',
    'warp',
    'gemini-cli',
    'roo-code',
    'cline',
    'amp',
  ],
  outDir: './dist',
}

beforeAll(async () => {
  mkdirSync(resolve(TEST_DIR, 'skills/hello/'), { recursive: true })
  await Bun.write(
    resolve(TEST_DIR, 'skills/hello/SKILL.md'),
    '---\nname: hello\ndescription: Say hello\n---\n\nSay hello to the user.\n',
  )
  mkdirSync(resolve(TEST_DIR, 'skills/deep-research/examples'), { recursive: true })
  mkdirSync(resolve(TEST_DIR, 'skills/deep-research/scripts'), { recursive: true })
  await Bun.write(
    resolve(TEST_DIR, 'skills/deep-research/SKILL.md'),
    [
      '---',
      'name: deep-research',
      'description: "Run a deep research pass with strong routing guidance."',
      'when_to_use: "Use when the user wants a thorough investigation with sourced evidence."',
      'argument-hint: "[company] [region]"',
      'arguments: [company, region]',
      'disable-model-invocation: true',
      'user-invocable: true',
      'allowed-tools: Read Grep Bash(git status *)',
      'model: inherit',
      'effort: high',
      'context: fork',
      'agent: Explore',
      'hooks: {"sessionStart":[{"type":"command","command":"bash ${CLAUDE_SKILL_DIR}/scripts/assist.sh"}]}',
      'paths: ["src/**","docs/**"]',
      'shell: bash',
      '---',
      '',
      '# Deep Research',
      '',
      'Use this skill when the request needs a sourced, specialist investigation.',
      'Start with `escalation` when the request needs a bounded specialist pass before synthesis.',
      '',
      '## Extra context',
      '',
      '- Load [reference.md](reference.md) before you summarize.',
      '- Use [examples/sample.md](examples/sample.md) to match the expected output shape.',
      '- Run `${CLAUDE_SKILL_DIR}/scripts/assist.sh` if you need a helper command.',
      '',
    ].join('\n'),
  )
  await Bun.write(
    resolve(TEST_DIR, 'skills/deep-research/reference.md'),
    '# Research Reference\n\nPrefer concrete evidence over vague summaries.\n',
  )
  await Bun.write(
    resolve(TEST_DIR, 'skills/deep-research/examples/sample.md'),
    '# Sample Output\n\n- Problem\n- Evidence\n- Recommendation\n',
  )
  await Bun.write(
    resolve(TEST_DIR, 'skills/deep-research/scripts/assist.sh'),
    '#!/usr/bin/env bash\necho deep-research-helper\n',
  )
  mkdirSync(resolve(TEST_DIR, 'commands/'), { recursive: true })
  await Bun.write(resolve(TEST_DIR, 'commands/pulse.md'), '# Pulse\n')
  await Bun.write(
    resolve(TEST_DIR, 'commands/research.md'),
    [
      '---',
      'description: Run the deep research wrapper',
      'when_to_use: Use when the user wants a routed investigation entrypoint.',
      'argument-hint: [company] [region]',
      'arguments: [company, region]',
      'examples:',
      '  - /research acme us',
      '  - /research acme eu',
      'skill: deep-research',
      'agent: escalation',
      'subtask: true',
      'context: fork',
      '---',
      '',
      'Use the `deep-research` skill.',
      '',
      'Arguments: $ARGUMENTS',
      '',
    ].join('\n'),
  )
  mkdirSync(resolve(TEST_DIR, 'agents/'), { recursive: true })
  await Bun.write(
    resolve(TEST_DIR, 'agents/escalation.md'),
    [
      '---',
      'name: escalation',
      'description: "Escalation specialist."',
      'mode: subagent',
      'hidden: true',
      'tools: Read, Grep, Glob',
      'skills: deep-research',
      'memory: "project"',
      'background: true',
      'isolation: "worktree"',
      'color: "purple"',
      'permission:',
      '  edit: deny',
      '  task:',
      '    "*": ask',
      '---',
      '',
      '# Escalation',
      '',
      'Escalate tricky issues with a constrained tool policy.',
      '',
    ].join('\n'),
  )
  await Bun.write(
    resolve(TEST_DIR, 'agents/legacy-review.md'),
    [
      '---',
      'name: legacy-review',
      'description: "Legacy review agent."',
      'mode: subagent',
      'steps: 5',
      'disable: false',
      'color: accent',
      'topP: 0.2',
      'tools:',
      '  write: false',
      '  bash: false',
      '  "gh_grep_*": true',
      '---',
      '',
      '# Legacy Review',
      '',
      'Review code without direct edits unless explicitly allowed.',
      '',
    ].join('\n'),
  )
  await Bun.write(
    resolve(TEST_DIR, 'agents/mcp-researcher.md'),
    [
      '---',
      'name: mcp-researcher',
      'description: "MCP research specialist."',
      'mode: subagent',
      'steps: 4',
      'tools: Read, Grep, Glob, mcp__exa__web_search_exa, mcp__exa__web_fetch_exa',
      'permission:',
      '  edit: deny',
      '  bash: deny',
      '---',
      '',
      '# MCP Researcher',
      '',
      'Use inherited MCP tools to gather research evidence.',
      '',
    ].join('\n'),
  )
  mkdirSync(resolve(TEST_DIR, 'scripts/'), { recursive: true })
  await Bun.write(resolve(TEST_DIR, 'scripts/validate.sh'), '#!/usr/bin/env bash\n')
  await Bun.write(resolve(TEST_DIR, 'scripts/confirm-mutation.sh'), '#!/usr/bin/env bash\n')
  mkdirSync(resolve(TEST_DIR, 'assets/'), { recursive: true })
  await Bun.write(resolve(TEST_DIR, 'assets/icon.svg'), '<svg />\n')
  mkdirSync(resolve(TEST_DIR, 'assets/screenshots'), { recursive: true })
  await Bun.write(resolve(TEST_DIR, 'assets/screenshots/overview.svg'), '<svg />\n')
  mkdirSync(resolve(TEST_DIR, 'mcp-server/dist'), { recursive: true })
  await Bun.write(resolve(TEST_DIR, 'mcp-server/dist/index.js'), 'console.log("mcp")\n')
  await Bun.write(
    resolve(TEST_DIR, 'INSTRUCTIONS.md'),
    [
      '# Test Plugin Instructions',
      '',
      'Use test-plugin consistently.',
      'If a workflow repeats, promote it into a command or specialist agent instead of hiding it in generic skills.',
      'Prefer the strongest honest native surface for each host.',
      '',
    ].join('\n'),
  )
})

afterAll(() => {
  rmSync(TEST_DIR, { recursive: true, force: true })
})

describe('build', () => {
  it('generates all platform outputs', async () => {
    await build(testConfig, TEST_DIR)

    // Claude Code
    expect(existsSync(resolve(OUT_DIR, 'claude-code/.claude-plugin/plugin.json'))).toBe(true)
    expect(existsSync(resolve(OUT_DIR, 'claude-code/.mcp.json'))).toBe(true)
    expect(existsSync(resolve(OUT_DIR, 'claude-code/hooks/hooks.json'))).toBe(true)
    expect(existsSync(resolve(OUT_DIR, 'claude-code/mcp-server/dist/index.js'))).toBe(true)

    // Cursor
    expect(existsSync(resolve(OUT_DIR, 'cursor/.cursor-plugin/plugin.json'))).toBe(true)
    expect(existsSync(resolve(OUT_DIR, 'cursor/mcp.json'))).toBe(true)
    expect(existsSync(resolve(OUT_DIR, 'cursor/hooks/hooks.json'))).toBe(true)
    expect(existsSync(resolve(OUT_DIR, 'cursor/rules/megamind-operating-conventions.mdc'))).toBe(true)
    expect(existsSync(resolve(OUT_DIR, 'cursor/mcp-server/dist/index.js'))).toBe(true)

    // Codex
    expect(existsSync(resolve(OUT_DIR, 'codex/.codex-plugin/plugin.json'))).toBe(true)
    expect(existsSync(resolve(OUT_DIR, 'codex/.mcp.json'))).toBe(true)
    expect(existsSync(resolve(OUT_DIR, 'codex/hooks.json'))).toBe(false)
    expect(existsSync(resolve(OUT_DIR, 'codex/.codex/hooks.generated.json'))).toBe(true)
    expect(existsSync(resolve(OUT_DIR, 'codex/.codex/commands.generated.json'))).toBe(true)
    expect(existsSync(resolve(OUT_DIR, 'codex/commands/pulse.md'))).toBe(false)
    expect(existsSync(resolve(OUT_DIR, 'codex/mcp-server/dist/index.js'))).toBe(true)

    // OpenCode
    expect(existsSync(resolve(OUT_DIR, 'opencode/package.json'))).toBe(true)
    expect(existsSync(resolve(OUT_DIR, 'opencode/index.ts'))).toBe(true)
    expect(existsSync(resolve(OUT_DIR, 'opencode/agents/escalation.md'))).toBe(true)
    expect(existsSync(resolve(OUT_DIR, 'opencode/mcp-server/dist/index.js'))).toBe(true)

    // GitHub Copilot
    expect(existsSync(resolve(OUT_DIR, 'github-copilot/.claude-plugin/plugin.json'))).toBe(true)

    // OpenHands should use .plugin/ (not .claude-plugin/)
    expect(existsSync(resolve(OUT_DIR, 'openhands/.plugin/plugin.json'))).toBe(true)
    expect(existsSync(resolve(OUT_DIR, 'openhands/.claude-plugin/plugin.json'))).toBe(false)

    // Warp
    expect(existsSync(resolve(OUT_DIR, 'warp/AGENTS.md'))).toBe(true)
    expect(existsSync(resolve(OUT_DIR, 'warp/mcp.json'))).toBe(true)

    // Gemini CLI
    expect(existsSync(resolve(OUT_DIR, 'gemini-cli/gemini-extension.json'))).toBe(true)

    // Roo Code
    expect(existsSync(resolve(OUT_DIR, 'roo-code/.roo/mcp.json'))).toBe(true)
    expect(existsSync(resolve(OUT_DIR, 'roo-code/.roorules'))).toBe(true)

    // Cline
    expect(existsSync(resolve(OUT_DIR, 'cline/.cline/mcp.json'))).toBe(true)
    expect(existsSync(resolve(OUT_DIR, 'cline/.clinerules'))).toBe(true)

    // AMP
    expect(existsSync(resolve(OUT_DIR, 'amp/AGENT.md'))).toBe(true)
    expect(existsSync(resolve(OUT_DIR, 'amp/.amp/settings.json'))).toBe(true)
  })

  it('generates correct Claude Code MCP config', async () => {
    const mcpJson = JSON.parse(
      readFileSync(resolve(OUT_DIR, 'claude-code/.mcp.json'), 'utf-8')
    )
    expect(mcpJson.mcpServers['test-server'].type).toBe('http')
    expect(mcpJson.mcpServers['test-server'].url).toBe('https://test.example.com/mcp')
    expect(mcpJson.mcpServers['test-server'].headers.Authorization).toContain('TEST_API_KEY')
  })

  it('generates correct Codex MCP config with bearer_token_env_var', async () => {
    const mcpJson = JSON.parse(
      readFileSync(resolve(OUT_DIR, 'codex/.mcp.json'), 'utf-8')
    )
    expect(mcpJson.mcpServers['test-server'].bearer_token_env_var).toBe('TEST_API_KEY')
    expect(mcpJson.mcpServers['test-server'].url).toBe('https://test.example.com/mcp')
  })

  it('generates correct Codex MCP config with env_http_headers for header auth', async () => {
    const headerAuthConfig: PluginConfig = {
      ...testConfig,
      name: 'header-auth-plugin',
      mcp: {
        'header-server': {
          url: 'https://header.example.com/mcp',
          transport: 'http',
          auth: {
            type: 'header',
            envVar: 'PLAYKIT_API_KEY',
            headerName: 'X-API-Key',
            headerTemplate: '${value}',
          },
        },
      },
      outDir: './header-dist',
    }

    await build(headerAuthConfig, TEST_DIR)

    const mcpJson = JSON.parse(
      readFileSync(resolve(TEST_DIR, 'header-dist/codex/.mcp.json'), 'utf-8')
    )
    expect(mcpJson.mcpServers['header-server'].url).toBe('https://header.example.com/mcp')
    expect(mcpJson.mcpServers['header-server'].env_http_headers).toEqual({
      'X-API-Key': 'PLAYKIT_API_KEY',
    })
    expect(mcpJson.mcpServers['header-server'].bearer_token_env_var).toBeUndefined()
  })

  it('preserves richer native Codex MCP auth overrides during build', async () => {
    const nativeCodexAuthConfig: PluginConfig = {
      ...testConfig,
      name: 'native-codex-auth-plugin',
      mcp: {
        metrics: {
          url: 'https://metrics.example.com/mcp',
          transport: 'http',
          auth: {
            type: 'header',
            envVar: 'PLAYKIT_API_KEY',
            headerName: 'X-API-Key',
            headerTemplate: '${value}',
          },
        },
      },
      platforms: {
        ...testConfig.platforms,
        codex: {
          mcpServers: {
            metrics: {
              env_http_headers: {
                'X-API-Key': 'PLAYKIT_API_KEY',
                'X-Workspace': 'PLAYKIT_WORKSPACE_ID',
              },
            },
          },
        },
      },
      outDir: './native-codex-auth-dist',
    }

    await build(nativeCodexAuthConfig, TEST_DIR)

    const mcpJson = JSON.parse(
      readFileSync(resolve(TEST_DIR, 'native-codex-auth-dist/codex/.mcp.json'), 'utf-8')
    )
    expect(mcpJson.mcpServers.metrics.url).toBe('https://metrics.example.com/mcp')
    expect(mcpJson.mcpServers.metrics.env_http_headers).toEqual({
      'X-API-Key': 'PLAYKIT_API_KEY',
      'X-Workspace': 'PLAYKIT_WORKSPACE_ID',
    })
  })

  it('omits inline auth headers for Claude Code and Cursor when runtime auth is platform-managed', async () => {
    const oauthishConfig: PluginConfig = {
      ...testConfig,
      name: 'oauthish-plugin',
      platforms: {
        ...testConfig.platforms,
        'claude-code': {
          mcpAuth: 'platform',
        },
        cursor: {
          ...testConfig.platforms?.cursor,
          mcpAuth: 'platform',
        },
      },
      hooks: {
        sessionStart: [{
          command: '${PLUGIN_ROOT}/scripts/check-env.sh',
        }],
        beforeSubmitPrompt: [{
          command: '${PLUGIN_ROOT}/scripts/check-prompt.sh',
        }],
      },
      outDir: './oauthish-dist',
    }

    await build(oauthishConfig, TEST_DIR)

    const claudeMcp = JSON.parse(
      readFileSync(resolve(TEST_DIR, 'oauthish-dist/claude-code/.mcp.json'), 'utf-8')
    )
    const cursorMcp = JSON.parse(
      readFileSync(resolve(TEST_DIR, 'oauthish-dist/cursor/mcp.json'), 'utf-8')
    )
    const claudeHooks = JSON.parse(
      readFileSync(resolve(TEST_DIR, 'oauthish-dist/claude-code/hooks/hooks.json'), 'utf-8')
    )
    const cursorHooks = JSON.parse(
      readFileSync(resolve(TEST_DIR, 'oauthish-dist/cursor/hooks/hooks.json'), 'utf-8')
    )

    expect(claudeMcp.mcpServers['test-server'].headers).toBeUndefined()
    expect(cursorMcp.mcpServers['test-server'].headers).toBeUndefined()
    expect(claudeHooks.hooks.SessionStart).toBeUndefined()
    expect(cursorHooks.hooks.sessionStart).toBeUndefined()
    expect(claudeHooks.hooks.UserPromptSubmit).toBeDefined()
    expect(cursorHooks.hooks.beforeSubmitPrompt).toBeDefined()
  })

  it('wraps command hooks across hosts so installed userConfig env reaches runtime hook commands', async () => {
    const multilineSecret = 'secret-token\nline-two'
    const hookEnvConfig: PluginConfig = {
      ...testConfig,
      name: 'hook-env-plugin',
      version: '1.1.0',
      userConfig: [
        {
          key: 'sendlens-instantly-api-key',
          title: 'SendLens Instantly API Key',
          description: 'API key used by the startup refresh flow.',
          type: 'secret',
          required: true,
          envVar: 'SENDLENS_INSTANTLY_API_KEY',
        },
      ],
      hooks: {
        sessionStart: [{
          command: 'node "${PLUGIN_ROOT}/scripts/print-hook-env.mjs"',
        }],
      },
      outDir: './hook-env-dist',
    }

    await Bun.write(
      resolve(TEST_DIR, 'scripts/print-hook-env.mjs'),
      [
        'if (!process.env.SENDLENS_INSTANTLY_API_KEY) {',
        '  console.error("missing env")',
        '  process.exit(1)',
        '}',
        'process.stdout.write(JSON.stringify(process.env.SENDLENS_INSTANTLY_API_KEY))',
      ].join('\n'),
    )

    await build(hookEnvConfig, TEST_DIR)

    const claudeHooks = JSON.parse(
      readFileSync(resolve(TEST_DIR, 'hook-env-dist/claude-code/hooks/hooks.json'), 'utf-8'),
    )
    const cursorHooks = JSON.parse(
      readFileSync(resolve(TEST_DIR, 'hook-env-dist/cursor/hooks/hooks.json'), 'utf-8'),
    )
    const codexHooks = JSON.parse(
      readFileSync(resolve(TEST_DIR, 'hook-env-dist/codex/hooks/hooks.json'), 'utf-8'),
    )
    const opencodeIndex = readFileSync(resolve(TEST_DIR, 'hook-env-dist/opencode/index.ts'), 'utf-8')

    expect(claudeHooks.hooks.SessionStart[0].hooks[0].command).toBe(
      'bash "${CLAUDE_PLUGIN_ROOT}/hooks/pluxx-hook-command-1.sh"',
    )
    expect(cursorHooks.hooks.sessionStart[0].command).toBe('bash ./hooks/pluxx-hook-command-1.sh')
    expect(codexHooks.hooks.SessionStart[0].hooks[0].type).toBe('command')
    expect(codexHooks.hooks.SessionStart[0].hooks[0].command).toBe('bash ./hooks/pluxx-hook-command-1.sh')
    expect(opencodeIndex).toContain('const buildHookShellCommand = (rawCommand: string): string => {')
    expect(opencodeIndex).toContain('const userEnv = loadUserConfig(directory).env ?? {}')

    const wrapperPath = resolve(TEST_DIR, 'hook-env-dist/claude-code/hooks/pluxx-hook-command-1.sh')
    const wrapper = readFileSync(wrapperPath, 'utf-8')
    expect(wrapper).toContain('.pluxx-user.json')
    expect(wrapper).toContain('CLAUDE_ENV_FILE')
    expect(wrapper).toContain('print-hook-env.mjs')

    const cursorWrapper = readFileSync(resolve(TEST_DIR, 'hook-env-dist/cursor/hooks/pluxx-hook-command-1.sh'), 'utf-8')
    const codexWrapper = readFileSync(resolve(TEST_DIR, 'hook-env-dist/codex/hooks/pluxx-hook-command-1.sh'), 'utf-8')
    expect(cursorWrapper).toContain('.pluxx-user.json')
    expect(cursorWrapper).toContain('print-hook-env.mjs')
    expect(codexWrapper).toContain('.pluxx-user.json')
    expect(codexWrapper).toContain('print-hook-env.mjs')

    writeFileSync(
      resolve(TEST_DIR, 'hook-env-dist/claude-code/.pluxx-user.json'),
      JSON.stringify({
        values: {
          'sendlens-instantly-api-key': multilineSecret,
        },
        env: {
          SENDLENS_INSTANTLY_API_KEY: multilineSecret,
        },
      }, null, 2),
    )
    writeFileSync(resolve(TEST_DIR, 'hook-env-dist/claude-code/.claude-env.sh'), '')

    const run = spawnSync('bash', [wrapperPath], {
      cwd: resolve(TEST_DIR, 'hook-env-dist/claude-code'),
      encoding: 'utf-8',
      env: {
        ...process.env,
        CLAUDE_PLUGIN_ROOT: resolve(TEST_DIR, 'hook-env-dist/claude-code'),
        CLAUDE_ENV_FILE: resolve(TEST_DIR, 'hook-env-dist/claude-code/.claude-env.sh'),
      },
    })

    expect(run.status).toBe(0)
    expect(run.stdout).toBe(JSON.stringify(multilineSecret))

    const sourcedEnv = spawnSync('bash', [
      '-lc',
      'source "$1" && node -e \'process.stdout.write(JSON.stringify(process.env.SENDLENS_INSTANTLY_API_KEY ?? ""))\'',
      'pluxx-env-check',
      resolve(TEST_DIR, 'hook-env-dist/claude-code/.claude-env.sh'),
    ], {
      cwd: resolve(TEST_DIR, 'hook-env-dist/claude-code'),
      encoding: 'utf-8',
      env: {
        ...process.env,
      },
    })

    expect(sourcedEnv.status).toBe(0)
    expect(sourcedEnv.stdout).toBe(JSON.stringify(multilineSecret))

    for (const platform of ['cursor', 'codex'] as const) {
      writeFileSync(
        resolve(TEST_DIR, `hook-env-dist/${platform}/.pluxx-user.json`),
        JSON.stringify({
          values: {
            'sendlens-instantly-api-key': multilineSecret,
          },
          env: {
            SENDLENS_INSTANTLY_API_KEY: multilineSecret,
          },
        }, null, 2),
      )

      const runWrappedHook = spawnSync('bash', [resolve(TEST_DIR, `hook-env-dist/${platform}/hooks/pluxx-hook-command-1.sh`)], {
        cwd: resolve(TEST_DIR, `hook-env-dist/${platform}`),
        encoding: 'utf-8',
        env: {
          ...process.env,
          ...(platform === 'cursor'
            ? { CURSOR_PLUGIN_ROOT: resolve(TEST_DIR, `hook-env-dist/${platform}`) }
            : { CODEX_PLUGIN_ROOT: resolve(TEST_DIR, `hook-env-dist/${platform}`) }),
        },
      })

      expect(runWrappedHook.status).toBe(0)
      expect(runWrappedHook.stdout).toBe(JSON.stringify(multilineSecret))
    }
  })

  it('carries a rich Claude-style skill fixture and supporting files into all core-four outputs', async () => {
    const expectedPhrase = 'Use this skill when the request needs a sourced, specialist investigation.'

    for (const platform of ['claude-code', 'cursor', 'codex', 'opencode'] as const) {
      const skillRoot = resolve(OUT_DIR, platform, 'skills/deep-research')
      const skillFile = readFileSync(resolve(skillRoot, 'SKILL.md'), 'utf-8')

      expect(existsSync(resolve(skillRoot, 'reference.md'))).toBe(true)
      expect(existsSync(resolve(skillRoot, 'examples/sample.md'))).toBe(true)
      expect(existsSync(resolve(skillRoot, 'scripts/assist.sh'))).toBe(true)
      expect(skillFile).toContain('when_to_use:')
      expect(skillFile).toContain('argument-hint:')
      expect(skillFile).toContain('arguments: [company, region]')
      expect(skillFile).toContain('disable-model-invocation: true')
      expect(skillFile).toContain(platform === 'claude-code' ? 'user-invocable: false' : 'user-invocable: true')
      expect(skillFile).toContain('allowed-tools: Read Grep Bash(git status *)')
      expect(skillFile).toContain('model: inherit')
      expect(skillFile).toContain('effort: high')
      expect(skillFile).toContain('context: fork')
      expect(skillFile).toContain('agent: Explore')
      expect(skillFile).toContain('hooks: {"sessionStart":[{"type":"command","command":"bash ${CLAUDE_SKILL_DIR}/scripts/assist.sh"}]}')
      expect(skillFile).toContain('paths: ["src/**","docs/**"]')
      expect(skillFile).toContain('shell: bash')
      expect(skillFile).toContain(expectedPhrase)
    }

    const codexSkills = JSON.parse(
      readFileSync(resolve(OUT_DIR, 'codex/.codex/skills.generated.json'), 'utf-8'),
    ) as {
      skills: Array<{
        id: string
        whenToUse?: string
        helperScripts?: string[]
        examplePaths?: string[]
      }>
    }
    const opencodeSkills = JSON.parse(
      readFileSync(resolve(OUT_DIR, 'opencode/skills.generated.json'), 'utf-8'),
    ) as {
      skills: Array<{
        id: string
        whenToUse?: string
        helperScripts?: string[]
        examplePaths?: string[]
      }>
    }

    expect(codexSkills.skills.find((skill) => skill.id === 'deep-research')?.whenToUse).toBe(
      'Use when the user wants a thorough investigation with sourced evidence.',
    )
    expect(codexSkills.skills.find((skill) => skill.id === 'deep-research')?.helperScripts).toEqual(['scripts/assist.sh'])
    expect(opencodeSkills.skills.find((skill) => skill.id === 'deep-research')?.examplePaths).toEqual(['examples/sample.md'])
  })

  it('hides command-wrapped Claude skills from direct slash invocation while keeping their names stable', async () => {
    const claudeSkill = readFileSync(
      resolve(OUT_DIR, 'claude-code/skills/deep-research/SKILL.md'),
      'utf-8',
    )

    expect(claudeSkill).toContain('name: deep-research')
    expect(claudeSkill).toContain('user-invocable: false')
    expect(claudeSkill).not.toContain('name: deep-research-skill')
  })

  it('preserves remote bearer, runtime OAuth, and local stdio MCP intent across the core four', async () => {
    const runtimeConfig: PluginConfig = {
      ...testConfig,
      name: 'runtime-fixture-plugin',
      mcp: {
        'bearer-server': {
          url: 'https://bearer.example.com/mcp',
          transport: 'http',
          auth: {
            type: 'bearer',
            envVar: 'RUNTIME_TOKEN',
            headerName: 'Authorization',
            headerTemplate: 'Bearer ${value}',
          },
        },
        'oauth-server': {
          url: 'https://oauth.example.com/mcp',
          transport: 'http',
          auth: {
            type: 'platform',
            mode: 'oauth',
          },
        },
        'local-server': {
          transport: 'stdio',
          command: 'node',
          args: ['./mcp-server/dist/index.js', '--stdio'],
          env: {
            LOCAL_FIXTURE_TOKEN: '${LOCAL_FIXTURE_TOKEN}',
          },
        },
      },
      targets: ['claude-code', 'cursor', 'codex', 'opencode'],
      outDir: './runtime-dist',
    }

    await build(runtimeConfig, TEST_DIR)

    const claudeMcp = JSON.parse(
      readFileSync(resolve(TEST_DIR, 'runtime-dist/claude-code/.mcp.json'), 'utf-8')
    )
    const cursorMcp = JSON.parse(
      readFileSync(resolve(TEST_DIR, 'runtime-dist/cursor/mcp.json'), 'utf-8')
    )
    const codexMcp = JSON.parse(
      readFileSync(resolve(TEST_DIR, 'runtime-dist/codex/.mcp.json'), 'utf-8')
    )
    const opencodeIndex = readFileSync(resolve(TEST_DIR, 'runtime-dist/opencode/index.ts'), 'utf-8')

    expect(claudeMcp.mcpServers['bearer-server'].headers.Authorization).toContain('RUNTIME_TOKEN')
    expect(cursorMcp.mcpServers['bearer-server'].headers.Authorization).toContain('RUNTIME_TOKEN')
    expect(codexMcp.mcpServers['bearer-server'].bearer_token_env_var).toBe('RUNTIME_TOKEN')

    expect(claudeMcp.mcpServers['oauth-server'].headers).toBeUndefined()
    expect(cursorMcp.mcpServers['oauth-server'].headers).toBeUndefined()
    expect(codexMcp.mcpServers['oauth-server'].bearer_token_env_var).toBeUndefined()
    expect(codexMcp.mcpServers['oauth-server'].env_http_headers).toBeUndefined()

    expect(claudeMcp.mcpServers['local-server']).toEqual({
      command: 'node',
      args: ['${CLAUDE_PLUGIN_ROOT}/mcp-server/dist/index.js', '--stdio'],
      env: {
        LOCAL_FIXTURE_TOKEN: '${LOCAL_FIXTURE_TOKEN}',
      },
    })
    expect(cursorMcp.mcpServers['local-server']).toEqual({
      command: 'node',
      args: ['./mcp-server/dist/index.js', '--stdio'],
      env: {
        LOCAL_FIXTURE_TOKEN: '${LOCAL_FIXTURE_TOKEN}',
      },
    })
    expect(codexMcp.mcpServers['local-server']).toEqual({
      command: 'node',
      args: ['./mcp-server/dist/index.js', '--stdio'],
      env: {
        LOCAL_FIXTURE_TOKEN: '${LOCAL_FIXTURE_TOKEN}',
      },
    })

    expect(opencodeIndex).toContain('"bearer-server"')
    expect(opencodeIndex).toContain('"oauth-server"')
    expect(opencodeIndex).toContain('"local-server"')
    expect(opencodeIndex).toContain('"transport": "stdio"')
    expect(opencodeIndex).toContain('"command": "node"')
    expect(opencodeIndex).toContain('"LOCAL_FIXTURE_TOKEN": "${LOCAL_FIXTURE_TOKEN}"')
    expect(opencodeIndex).not.toContain('"type": "platform"')
  })

  it('normalizes host-specific stdio root vars back to the target-local contract during build', async () => {
    const runtimeConfig: PluginConfig = {
      ...testConfig,
      name: 'runtime-normalization-fixture',
      mcp: {
        'local-server': {
          transport: 'stdio',
          command: 'bash',
          args: ['${CLAUDE_PLUGIN_ROOT}/scripts/start-mcp.sh'],
          env: {
            LOCAL_FIXTURE_TOKEN: '${LOCAL_FIXTURE_TOKEN}',
          },
        },
      },
      targets: ['claude-code', 'cursor', 'codex'],
      outDir: './runtime-normalization-dist',
    }

    await build(runtimeConfig, TEST_DIR)

    const claudeMcp = JSON.parse(
      readFileSync(resolve(TEST_DIR, 'runtime-normalization-dist/claude-code/.mcp.json'), 'utf-8')
    )
    const cursorMcp = JSON.parse(
      readFileSync(resolve(TEST_DIR, 'runtime-normalization-dist/cursor/mcp.json'), 'utf-8')
    )
    const codexMcp = JSON.parse(
      readFileSync(resolve(TEST_DIR, 'runtime-normalization-dist/codex/.mcp.json'), 'utf-8')
    )

    expect(claudeMcp.mcpServers['local-server']).toEqual({
      command: 'bash',
      args: ['${CLAUDE_PLUGIN_ROOT}/scripts/start-mcp.sh'],
      env: {
        LOCAL_FIXTURE_TOKEN: '${LOCAL_FIXTURE_TOKEN}',
      },
    })
    expect(cursorMcp.mcpServers['local-server']).toEqual({
      command: 'bash',
      args: ['./scripts/start-mcp.sh'],
      env: {
        LOCAL_FIXTURE_TOKEN: '${LOCAL_FIXTURE_TOKEN}',
      },
    })
    expect(codexMcp.mcpServers['local-server']).toEqual({
      command: 'bash',
      args: ['./scripts/start-mcp.sh'],
      env: {
        LOCAL_FIXTURE_TOKEN: '${LOCAL_FIXTURE_TOKEN}',
      },
    })
  })

  it('generates Codex manifest with interface metadata', async () => {
    const manifest = JSON.parse(
      readFileSync(resolve(OUT_DIR, 'codex/.codex-plugin/plugin.json'), 'utf-8')
    )
    expect(manifest.interface.displayName).toBe('Test Plugin')
    expect(manifest.interface.shortDescription).toBe('A test plugin for testing')
    expect(manifest.interface.longDescription).toBe('A longer test plugin description for rich host listings.')
    expect(manifest.interface.category).toBe('Productivity')
    expect(manifest.interface.brandColor).toBe('#FF0000')
    expect(manifest.interface.composerIcon).toBe('./assets/icon.svg')
    expect(manifest.interface.logo).toBe('./assets/icon.svg')
    expect(manifest.interface.screenshots).toEqual(['./assets/screenshots/overview.svg'])
    expect(manifest.interface.websiteURL).toBe('https://example.com')
    expect(manifest.interface.defaultPrompt).toEqual(['Hello from test plugin'])
    expect(manifest.interface.privacyPolicyURL).toBe('https://example.com/privacy')
    expect(manifest.interface.termsOfServiceURL).toBe('https://example.com/terms')
  })

  it('applies shared brand metadata only to truthful native listing surfaces', async () => {
    const claudeManifest = JSON.parse(
      readFileSync(resolve(OUT_DIR, 'claude-code/.claude-plugin/plugin.json'), 'utf-8')
    )
    const cursorManifest = JSON.parse(
      readFileSync(resolve(OUT_DIR, 'cursor/.cursor-plugin/plugin.json'), 'utf-8')
    )
    const codexManifest = JSON.parse(
      readFileSync(resolve(OUT_DIR, 'codex/.codex-plugin/plugin.json'), 'utf-8')
    )
    const opencodePackage = JSON.parse(
      readFileSync(resolve(OUT_DIR, 'opencode/package.json'), 'utf-8')
    )
    const opencodeIndex = readFileSync(resolve(OUT_DIR, 'opencode/index.ts'), 'utf-8')

    expect(codexManifest.interface).toEqual({
      displayName: 'Test Plugin',
      shortDescription: 'A test plugin for testing',
      longDescription: 'A longer test plugin description for rich host listings.',
      category: 'Productivity',
      brandColor: '#FF0000',
      composerIcon: './assets/icon.svg',
      logo: './assets/icon.svg',
      defaultPrompt: ['Hello from test plugin'],
      websiteURL: 'https://example.com',
      privacyPolicyURL: 'https://example.com/privacy',
      termsOfServiceURL: 'https://example.com/terms',
      screenshots: ['./assets/screenshots/overview.svg'],
      developerName: 'Test Author',
    })

    expect(cursorManifest.homepage).toBe('https://example.com')
    expect(cursorManifest.logo).toBe('./assets/icon.svg')
    expect(cursorManifest.interface).toBeUndefined()
    expect(cursorManifest.displayName).toBeUndefined()
    expect(cursorManifest.defaultPrompt).toBeUndefined()

    expect(claudeManifest.interface).toBeUndefined()
    expect(claudeManifest.homepage).toBeUndefined()
    expect(claudeManifest.logo).toBeUndefined()

    expect(opencodePackage.description).toBe('A test plugin (OpenCode plugin)')
    expect(opencodePackage.homepage).toBeUndefined()
    expect(opencodeIndex).not.toContain('defaultPrompt')
    expect(opencodeIndex).not.toContain('privacyPolicyURL')
    expect(opencodeIndex).not.toContain('termsOfServiceURL')
    expect(opencodeIndex).not.toContain('screenshots')
  })

  it('generates Cursor manifest with homepage and logo metadata', async () => {
    const manifest = JSON.parse(
      readFileSync(resolve(OUT_DIR, 'cursor/.cursor-plugin/plugin.json'), 'utf-8')
    )
    expect(manifest.homepage).toBe('https://example.com')
    expect(manifest.logo).toBe('./assets/icon.svg')
  })

  it('compiles a native Cursor fixture with slash commands, hook events, MCP auth, and subagent translation', async () => {
    const cursorManifest = JSON.parse(
      readFileSync(resolve(OUT_DIR, 'cursor/.cursor-plugin/plugin.json'), 'utf-8')
    )
    const cursorHooks = JSON.parse(
      readFileSync(resolve(OUT_DIR, 'cursor/hooks/hooks.json'), 'utf-8')
    )
    const cursorMcp = JSON.parse(
      readFileSync(resolve(OUT_DIR, 'cursor/mcp.json'), 'utf-8')
    )
    const cursorAgent = readFileSync(resolve(OUT_DIR, 'cursor/agents/escalation.md'), 'utf-8')

    expect(cursorManifest.commands).toBe('./commands/')
    expect(cursorManifest.agents).toBe('./agents/')
    expect(cursorManifest.hooks).toBe('./hooks/hooks.json')
    expect(existsSync(resolve(OUT_DIR, 'cursor/commands/pulse.md'))).toBe(true)
    expect(cursorHooks.hooks.sessionStart?.[0]?.command).toBe('bash ./hooks/pluxx-hook-command-1.sh')
    expect(cursorHooks.hooks.beforeSubmitPrompt?.[0]?.command).toBe('bash ./hooks/pluxx-hook-command-2.sh')
    expect(readFileSync(resolve(OUT_DIR, 'cursor/hooks/pluxx-hook-command-1.sh'), 'utf-8')).toContain('./scripts/validate.sh')
    expect(readFileSync(resolve(OUT_DIR, 'cursor/hooks/pluxx-hook-command-2.sh'), 'utf-8')).toContain('./scripts/check-prompt.sh')
    expect(cursorMcp.mcpServers['test-server'].headers.Authorization).toContain('TEST_API_KEY')
    expect(cursorAgent).toContain('Cursor translation note: stay read-only unless the parent task explicitly asks for file edits.')
    expect(cursorAgent).toContain('Cursor translation note: only delegate further subtasks when the work clearly benefits from another specialist.')
  })

  it('drops unsupported Cursor hook events from generated hook bundles', async () => {
    const rootDir = resolve(TEST_DIR, 'cursor-unsupported-hooks')
    const outDir = resolve(rootDir, 'dist')
    rmSync(rootDir, { recursive: true, force: true })
    mkdirSync(resolve(rootDir, 'skills/basic'), { recursive: true })
    mkdirSync(resolve(rootDir, 'scripts'), { recursive: true })
    writeFileSync(resolve(rootDir, 'skills/basic/SKILL.md'), '---\nname: basic\ndescription: Basic skill\n---\n\nBasic skill body.\n')
    writeFileSync(resolve(rootDir, 'scripts/check.sh'), '#!/usr/bin/env bash\nexit 0\n')

    const config: PluginConfig = {
      name: 'cursor-unsupported-hooks',
      version: '1.0.0',
      description: 'Cursor unsupported hook fixture',
      author: { name: 'Test Author' },
      skills: './skills/',
      hooks: {
        preToolUse: [{ command: '${PLUGIN_ROOT}/scripts/check.sh' }],
        unknownEvent: [{ command: '${PLUGIN_ROOT}/scripts/check.sh' }],
      },
      scripts: './scripts/',
      targets: ['cursor'],
      outDir: './dist',
    }

    await build(config, rootDir)

    const cursorHooks = JSON.parse(
      readFileSync(resolve(outDir, 'cursor/hooks/hooks.json'), 'utf-8')
    )

    expect(cursorHooks.hooks.preToolUse?.[0]?.command).toBe('bash ./hooks/pluxx-hook-command-1.sh')
    expect(cursorHooks.hooks.unknownEvent).toBeUndefined()
  })

  it('compiles a native Codex fixture with interface metadata, bundled hooks, companion guidance, and agent metadata', async () => {
    const codexManifest = JSON.parse(
      readFileSync(resolve(OUT_DIR, 'codex/.codex-plugin/plugin.json'), 'utf-8')
    )
    const codexApp = JSON.parse(
      readFileSync(resolve(OUT_DIR, 'codex/.app.json'), 'utf-8')
    )
    const codexBundledHooks = JSON.parse(
      readFileSync(resolve(OUT_DIR, 'codex/hooks/hooks.json'), 'utf-8')
    )
    const codexHooks = JSON.parse(
      readFileSync(resolve(OUT_DIR, 'codex/.codex/hooks.generated.json'), 'utf-8')
    )
    const codexCommands = JSON.parse(
      readFileSync(resolve(OUT_DIR, 'codex/.codex/commands.generated.json'), 'utf-8')
    )
    const codexAgent = readFileSync(resolve(OUT_DIR, 'codex/.codex/agents/escalation.toml'), 'utf-8')
    const codexAgentsMd = readFileSync(resolve(OUT_DIR, 'codex/AGENTS.md'), 'utf-8')

    expect(codexManifest.interface.displayName).toBe('Test Plugin')
    expect(codexManifest.apps).toBe('./.app.json')
    expect(codexApp).toEqual({
      capabilities: ['Interactive', 'Read'],
      actions: {
        openComposer: true,
      },
    })
    expect(codexManifest.hooks).toBe('./hooks/hooks.json')
    expect(codexBundledHooks.hooks.SessionStart?.[0]?.hooks?.[0]?.type).toBe('command')
    expect(codexBundledHooks.hooks.SessionStart?.[0]?.hooks?.[0]?.command).toBe('bash ./hooks/pluxx-hook-command-1.sh')
    expect(codexHooks.pluginBundleFeatureFlag).toBe('plugin_hooks')
    expect(codexHooks.generalFeatureFlag).toBe('hooks')
    expect(codexHooks.deprecatedGeneralFeatureFlag).toBe('codex_hooks')
    expect(codexHooks.hooks.SessionStart?.[0]?.hooks?.[0]?.command).toBe('bash ./hooks/pluxx-hook-command-1.sh')
    expect(readFileSync(resolve(OUT_DIR, 'codex/hooks/pluxx-hook-command-1.sh'), 'utf-8')).toContain('./scripts/validate.sh')
    expect(codexCommands.commands[0]?.id).toBe('pulse')
    expect(codexAgent).toContain('name = "escalation"')
    expect(codexAgent).toContain('description = "Escalation specialist."')
    expect(codexAgentsMd).toContain('## Command Routing')
  })

  it('generates OpenCode plugin wrapper with env var check', async () => {
    const indexTs = readFileSync(resolve(OUT_DIR, 'opencode/index.ts'), 'utf-8')
    expect(indexTs).toContain('TestPluginPlugin')
    expect(indexTs).toContain('TEST_API_KEY')
    expect(indexTs).toContain('.pluxx-user.json')
    expect(indexTs).toContain('loadUserConfig')
    expect(indexTs).toContain('const AGENT_DEFINITIONS =')
    expect(indexTs).toContain('"escalation"')
    expect(indexTs).toContain('"mode": "subagent"')
    expect(indexTs).toContain('"hidden": true')
    expect(indexTs).toContain('"task": {')
    expect(indexTs).toContain('config.agent = {')
  })

  it('compiles a native OpenCode fixture with runtime hooks, config-driven instructions, MCP auth, and permission-rich agents', async () => {
    const opencodePackage = JSON.parse(
      readFileSync(resolve(OUT_DIR, 'opencode/package.json'), 'utf-8')
    )
    const indexTs = readFileSync(resolve(OUT_DIR, 'opencode/index.ts'), 'utf-8')
    const opencodeSkill = readFileSync(resolve(OUT_DIR, 'opencode/skills/deep-research/SKILL.md'), 'utf-8')
    const agentDefinitions = extractGeneratedJson<Record<string, Record<string, unknown>>>(indexTs, 'AGENT_DEFINITIONS')
    const commandDefinitions = extractGeneratedJson<Record<string, Record<string, unknown>>>(indexTs, 'TUI_COMMANDS')

    expect(opencodePackage.name).toBe('opencode-test-plugin')
    expect(existsSync(resolve(OUT_DIR, 'opencode/agents/escalation.md'))).toBe(true)
    expect(indexTs).toContain('const INSTRUCTIONS =')
    expect(indexTs).toContain('applyInstructions(output.system)')
    expect(indexTs).toContain('const MCP_DEFINITIONS =')
    expect(indexTs).toContain('"headerName": "Authorization"')
    expect(indexTs).toContain('remote.headers = { Authorization: `Bearer ${token}` }')
    expect(indexTs).toContain('const EVENT_HOOKS')
    expect(indexTs).toContain('"session.created"')
    expect(indexTs).toContain('"chat.message"')
    expect(indexTs).toContain('"escalation"')
    expect(indexTs).toContain('"mode": "subagent"')
    expect(indexTs).toContain('"hidden": true')
    expect(indexTs).toContain('"permission": {')
    expect(indexTs).toContain('"edit": "deny"')
    expect(opencodeSkill).toContain('`@escalation`')
    expect(commandDefinitions.research).toMatchObject({
      description: 'Run the deep research wrapper',
      whenToUse: 'Use when the user wants a routed investigation entrypoint.',
      argumentHint: '[company] [region]',
      arguments: ['company', 'region'],
      examples: ['/research acme us', '/research acme eu'],
      skill: 'deep-research',
      skills: ['deep-research'],
      agent: 'escalation',
      subtask: true,
      context: 'fork',
    })
    expect(agentDefinitions['legacy-review']).toEqual({
      description: 'Legacy review agent.',
      prompt: '# Legacy Review\n\nReview code without direct edits unless explicitly allowed.',
      mode: 'subagent',
      steps: 5,
      disable: false,
      color: 'accent',
      topP: 0.2,
      permission: {
        edit: 'deny',
        bash: 'deny',
        'gh_grep_*': 'allow',
      },
    })
    expect(JSON.stringify(agentDefinitions['legacy-review'])).not.toContain('"tools"')
  })

  it('writes documented hook outputs for Claude Code and Codex bundles', async () => {
    const claudeHooks = JSON.parse(
      readFileSync(resolve(OUT_DIR, 'claude-code/hooks/hooks.json'), 'utf-8')
    )
    const codexHooks = JSON.parse(
      readFileSync(resolve(OUT_DIR, 'codex/hooks/hooks.json'), 'utf-8')
    )

    expect(claudeHooks.hooks.UserPromptSubmit).toBeDefined()
    expect(codexHooks.hooks.SessionStart).toBeDefined()
  })

  it('generates runtime permission outputs for Claude Code, Cursor, OpenCode, and Codex external config', async () => {
    const permissionConfig: PluginConfig = {
      ...testConfig,
      name: 'permission-plugin',
      hooks: undefined,
      permissions: {
        allow: ['Read(src/**)', 'MCP(test-server.search)'],
        ask: ['Bash(git commit *)'],
        deny: ['Edit(.env)', 'Skill(review-scaffold)'],
      },
      targets: ['claude-code', 'cursor', 'opencode', 'codex'],
      outDir: './permission-dist',
    }

    await build(permissionConfig, TEST_DIR)

    const claudeManifest = JSON.parse(
      readFileSync(resolve(TEST_DIR, 'permission-dist/claude-code/.claude-plugin/plugin.json'), 'utf-8')
    )
    const claudeHooks = JSON.parse(
      readFileSync(resolve(TEST_DIR, 'permission-dist/claude-code/hooks/hooks.json'), 'utf-8')
    )
    const claudePermissionScript = readFileSync(
      resolve(TEST_DIR, 'permission-dist/claude-code/hooks/pluxx-permissions.mjs'),
      'utf-8'
    )
    const cursorManifest = JSON.parse(
      readFileSync(resolve(TEST_DIR, 'permission-dist/cursor/.cursor-plugin/plugin.json'), 'utf-8')
    )
    const cursorHooks = JSON.parse(
      readFileSync(resolve(TEST_DIR, 'permission-dist/cursor/hooks/hooks.json'), 'utf-8')
    )
    const opencodeIndex = readFileSync(resolve(TEST_DIR, 'permission-dist/opencode/index.ts'), 'utf-8')
    const codexPermissions = JSON.parse(
      readFileSync(resolve(TEST_DIR, 'permission-dist/codex/.codex/permissions.generated.json'), 'utf-8')
    )
    const codexConfigCompanion = readFileSync(
      resolve(TEST_DIR, 'permission-dist/codex/.codex/config.generated.toml'),
      'utf-8'
    )
    const claudePermissionDecision = runPermissionHookScript(
      resolve(TEST_DIR, 'permission-dist/claude-code/hooks/pluxx-permissions.mjs'),
      'claude-pretool',
      {
        tool_name: 'Read',
        tool_input: {
          file_path: 'src/index.ts',
        },
      },
    ) as {
      hookSpecificOutput?: {
        permissionDecision?: string
      }
    }
    const claudeAskDecision = runPermissionHookScript(
      resolve(TEST_DIR, 'permission-dist/claude-code/hooks/pluxx-permissions.mjs'),
      'claude-pretool',
      {
        tool_name: 'Bash',
        tool_input: {
          command: 'git commit -m "ship it"',
        },
      },
    ) as {
      hookSpecificOutput?: {
        permissionDecision?: string
      }
    }
    const cursorDenyDecision = runPermissionHookScript(
      resolve(TEST_DIR, 'permission-dist/cursor/hooks/pluxx-permissions.mjs'),
      'cursor',
      {
        tool_name: 'Edit',
        tool_input: {
          file_path: '.env',
        },
      },
    ) as {
      permission?: string
    }

    expect(claudeManifest.hooks).toBeUndefined()
    expect(existsSync(resolve(TEST_DIR, 'permission-dist/claude-code/hooks/pluxx-permissions.mjs'))).toBe(true)
    expect(claudeHooks.hooks.PreToolUse).toBeDefined()
    expect(claudePermissionScript).toContain('hookEventName: "PreToolUse"')
    expect(claudePermissionDecision.hookSpecificOutput?.permissionDecision).toBe('allow')
    expect(claudeAskDecision.hookSpecificOutput?.permissionDecision).toBe('ask')

    expect(cursorManifest.hooks).toBe('./hooks/hooks.json')
    expect(existsSync(resolve(TEST_DIR, 'permission-dist/cursor/hooks/pluxx-permissions.mjs'))).toBe(true)
    expect(cursorHooks.hooks.preToolUse).toBeDefined()
    expect(cursorHooks.hooks.beforeShellExecution).toBeDefined()
    expect(cursorDenyDecision.permission).toBe('deny')

    expect(opencodeIndex).toContain('const PERMISSIONS =')
    expect(opencodeIndex).toContain('"read": {')
    expect(opencodeIndex).toContain('"src/**": "allow"')
    expect(opencodeIndex).toContain('"edit": {')
    expect(opencodeIndex).toContain('".env": "deny"')
    expect(opencodeIndex).toContain('"skill": {')
    expect(opencodeIndex).toContain('"review-scaffold": "deny"')

    expect(codexPermissions.model).toBe('pluxx.permissions.v1')
    expect(codexPermissions.enforcedByPluginBundle).toBe(false)
    expect(codexPermissions.rules.some((rule: { raw: string }) => rule.raw === 'Read(src/**)')).toBe(true)
    expect(codexConfigCompanion).toContain('[mcp_servers."test-server".tools."search"]')
    expect(codexConfigCompanion).toContain('approval_mode = "approve"')
  })

  it('generates runtime readiness outputs across Claude Code, Cursor, Codex, and OpenCode', async () => {
    const readinessConfig: PluginConfig = {
      ...testConfig,
      name: 'readiness-plugin',
      hooks: undefined,
      readiness: {
        dependencies: [
          {
            id: 'runtime-cache',
            path: './runtime/status.json',
            statusField: 'status',
            readyValues: ['ready'],
            pendingValues: ['pending'],
            failedValues: ['failed'],
            refresh: {
              command: '${PLUGIN_ROOT}/scripts/refresh-runtime.sh',
            },
          },
        ],
        gates: [
          {
            dependency: 'runtime-cache',
            applyTo: ['mcp-tools'],
            tools: ['test-server.search'],
            timeoutMs: 2000,
            pollMs: 100,
            onTimeout: 'fail',
          },
          {
            dependency: 'runtime-cache',
            applyTo: ['skills', 'commands'],
            skills: ['deep-research'],
            commands: ['research'],
            timeoutMs: 2000,
            pollMs: 100,
            onTimeout: 'warn',
          },
        ],
      },
      targets: ['claude-code', 'cursor', 'codex', 'opencode'],
      outDir: './readiness-dist',
    }

    await build(readinessConfig, TEST_DIR)

    const claudeHooks = JSON.parse(
      readFileSync(resolve(TEST_DIR, 'readiness-dist/claude-code/hooks/hooks.json'), 'utf-8')
    )
    const cursorHooks = JSON.parse(
      readFileSync(resolve(TEST_DIR, 'readiness-dist/cursor/hooks/hooks.json'), 'utf-8')
    )
    const codexHooks = JSON.parse(
      readFileSync(resolve(TEST_DIR, 'readiness-dist/codex/.codex/hooks.generated.json'), 'utf-8')
    )
    const codexBundledHooks = JSON.parse(
      readFileSync(resolve(TEST_DIR, 'readiness-dist/codex/hooks/hooks.json'), 'utf-8')
    )
    const codexReadiness = JSON.parse(
      readFileSync(resolve(TEST_DIR, 'readiness-dist/codex/.codex/readiness.generated.json'), 'utf-8')
    )
    const opencodeIndex = readFileSync(resolve(TEST_DIR, 'readiness-dist/opencode/index.ts'), 'utf-8')

    expect(existsSync(resolve(TEST_DIR, 'readiness-dist/claude-code/hooks/pluxx-readiness.mjs'))).toBe(true)
    expect(claudeHooks.hooks.SessionStart?.[0]?.hooks?.[0]?.command).toContain('pluxx-readiness.mjs session-start')
    expect(claudeHooks.hooks.PreToolUse?.[0]?.matcher).toBe('MCP')
    expect(claudeHooks.hooks.PreToolUse?.[0]?.hooks?.[0]?.command).toContain('pluxx-readiness.mjs mcp-gate')
    expect(claudeHooks.hooks.UserPromptSubmit?.[0]?.hooks?.[0]?.command).toContain('pluxx-readiness.mjs prompt-gate')

    expect(existsSync(resolve(TEST_DIR, 'readiness-dist/cursor/hooks/pluxx-readiness.mjs'))).toBe(true)
    expect(cursorHooks.hooks.sessionStart?.[0]?.command).toBe('node ./hooks/pluxx-readiness.mjs session-start')
    expect(cursorHooks.hooks.beforeMCPExecution?.[0]?.command).toBe('node ./hooks/pluxx-readiness.mjs mcp-gate')
    expect(cursorHooks.hooks.beforeSubmitPrompt?.[0]?.command).toBe('node ./hooks/pluxx-readiness.mjs prompt-gate')

    expect(existsSync(resolve(TEST_DIR, 'readiness-dist/codex/.codex/pluxx-readiness.mjs'))).toBe(true)
    expect(codexBundledHooks.hooks.SessionStart?.[0]?.hooks?.[0]?.type).toBe('command')
    expect(codexBundledHooks.hooks.SessionStart?.[0]?.hooks?.[0]?.command).toBe('node ./.codex/pluxx-readiness.mjs session-start')
    expect(codexBundledHooks.hooks.PreToolUse?.[0]?.matcher).toBe('MCP')
    expect(codexBundledHooks.hooks.PreToolUse?.[0]?.hooks?.[0]?.command).toBe('node ./.codex/pluxx-readiness.mjs mcp-gate')
    expect(codexHooks.pluginBundleFeatureFlag).toBe('plugin_hooks')
    expect(codexHooks.generalFeatureFlag).toBe('hooks')
    expect(codexHooks.deprecatedGeneralFeatureFlag).toBe('codex_hooks')
    expect(codexHooks.hooks.SessionStart?.[0]?.hooks?.[0]?.command).toBe('node ./.codex/pluxx-readiness.mjs session-start')
    expect(codexHooks.hooks.PreToolUse?.[0]?.matcher).toBe('MCP')
    expect(codexHooks.hooks.PreToolUse?.[0]?.hooks?.[0]?.command).toBe('node ./.codex/pluxx-readiness.mjs mcp-gate')
    expect(codexHooks.hooks.UserPromptSubmit?.[0]?.hooks?.[0]?.command).toBe('node ./.codex/pluxx-readiness.mjs prompt-gate')
    expect(codexReadiness.model).toBe('pluxx.readiness.v1')
    expect(codexReadiness.translatedHooks.mcpGate).toBe('node ./.codex/pluxx-readiness.mjs mcp-gate')

    expect(existsSync(resolve(TEST_DIR, 'readiness-dist/opencode/runtime/pluxx-readiness.mjs'))).toBe(true)
    expect(opencodeIndex).toContain('const READINESS_SCRIPT = "runtime/pluxx-readiness.mjs"')
    expect(opencodeIndex).toContain('await runReadiness("mcp-gate"')
    expect(opencodeIndex).toContain('await runReadiness("prompt-gate"')
    expect(opencodeIndex).toContain('await runReadiness("session-start"')
  })

  it('generates a Codex hook companion with mapped native event names', async () => {
    const codexBundledHooks = JSON.parse(
      readFileSync(resolve(OUT_DIR, 'codex/hooks/hooks.json'), 'utf-8')
    ) as {
      hooks: Record<string, CodexHookMatcherGroup[]>
    }
    const codexHooks = JSON.parse(
      readFileSync(resolve(OUT_DIR, 'codex/.codex/hooks.generated.json'), 'utf-8')
    ) as {
      model: string
      pluginBundleFeatureFlag: string
      generalFeatureFlag: string
      deprecatedGeneralFeatureFlag: string
      hooks: Record<string, CodexHookMatcherGroup[]>
    }

    expect(codexBundledHooks.hooks.SessionStart?.[0]?.hooks?.[0]).toEqual({
      type: 'command',
      command: 'bash ./hooks/pluxx-hook-command-1.sh',
    })
    expect(codexBundledHooks.hooks.UserPromptSubmit?.[0]?.hooks?.[0]).toEqual({
      type: 'command',
      command: 'bash ./hooks/pluxx-hook-command-2.sh',
    })
    expect(codexHooks.model).toBe('pluxx.codex-hooks.v1')
    expect(codexHooks.pluginBundleFeatureFlag).toBe('plugin_hooks')
    expect(codexHooks.generalFeatureFlag).toBe('hooks')
    expect(codexHooks.deprecatedGeneralFeatureFlag).toBe('codex_hooks')
    expect(codexHooks.hooks.SessionStart?.[0]?.hooks?.[0]?.command).toBe('bash ./hooks/pluxx-hook-command-1.sh')
    expect(codexHooks.hooks.UserPromptSubmit?.[0]?.hooks?.[0]?.command).toBe('bash ./hooks/pluxx-hook-command-2.sh')
    expect(readFileSync(resolve(OUT_DIR, 'codex/hooks/pluxx-hook-command-1.sh'), 'utf-8')).toContain('./scripts/validate.sh')
    expect(readFileSync(resolve(OUT_DIR, 'codex/hooks/pluxx-hook-command-2.sh'), 'utf-8')).toContain('./scripts/check-prompt.sh')
  })

  it('preserves hook fields only where the target can honestly carry them', async () => {
    const hookConfig: PluginConfig = {
      ...testConfig,
      name: 'hook-translation-plugin',
      hooks: {
        beforeSubmitPrompt: [{
          type: 'prompt',
          prompt: 'Confirm before sending the prompt.',
          model: 'gpt-5',
        }],
        preToolUse: [{
          command: '${PLUGIN_ROOT}/scripts/confirm-mutation.sh',
          matcher: 'Bash',
          failClosed: true,
          loop_limit: 2,
        }],
        permissionRequest: [{
          command: '${PLUGIN_ROOT}/scripts/confirm-mutation.sh',
          matcher: 'Edit',
          failClosed: true,
        }],
        stop: [{
          command: '${PLUGIN_ROOT}/scripts/confirm-mutation.sh',
          loop_limit: 3,
        }],
        notification: [{
          type: 'http',
          url: 'https://example.com/hooks/notify',
          headers: { Authorization: 'Bearer $HOOK_TOKEN' },
        }],
      },
      targets: ['claude-code', 'cursor', 'codex', 'opencode'],
      outDir: './hook-translation-dist',
    }

    await build(hookConfig, TEST_DIR)

    const claudeHooks = JSON.parse(
      readFileSync(resolve(TEST_DIR, 'hook-translation-dist/claude-code/hooks/hooks.json'), 'utf-8')
    )
    const cursorHooks = JSON.parse(
      readFileSync(resolve(TEST_DIR, 'hook-translation-dist/cursor/hooks/hooks.json'), 'utf-8')
    )
    const codexHooks = JSON.parse(
      readFileSync(resolve(TEST_DIR, 'hook-translation-dist/codex/.codex/hooks.generated.json'), 'utf-8')
    )
    const codexBundledHooks = JSON.parse(
      readFileSync(resolve(TEST_DIR, 'hook-translation-dist/codex/hooks/hooks.json'), 'utf-8')
    )
    const opencodeIndex = readFileSync(resolve(TEST_DIR, 'hook-translation-dist/opencode/index.ts'), 'utf-8')

    expect(claudeHooks.hooks.UserPromptSubmit?.[0]?.hooks?.[0]?.type).toBe('prompt')
    expect(claudeHooks.hooks.UserPromptSubmit?.[0]?.hooks?.[0]?.prompt).toContain('Confirm before sending the prompt')
    expect(claudeHooks.hooks.UserPromptSubmit?.[0]?.hooks?.[0]?.model).toBe('gpt-5')
    expect(claudeHooks.hooks.PreToolUse?.[0]?.matcher).toBe('Bash')
    expect(claudeHooks.hooks.PreToolUse?.[0]?.failClosed).toBeUndefined()
    expect(claudeHooks.hooks.Stop?.[0]?.loop_limit).toBeUndefined()

    expect(cursorHooks.hooks.beforeSubmitPrompt?.[0]?.type).toBe('prompt')
    expect(cursorHooks.hooks.beforeSubmitPrompt?.[0]?.prompt).toContain('Confirm before sending the prompt')
    expect(cursorHooks.hooks.preToolUse?.[0]?.matcher).toBe('Bash')
    expect(cursorHooks.hooks.preToolUse?.[0]?.failClosed).toBe(true)
    expect(cursorHooks.hooks.preToolUse?.[0]?.loop_limit).toBeUndefined()
    expect(cursorHooks.hooks.stop?.[0]?.loop_limit).toBe(3)

    expect(codexBundledHooks.hooks.PreToolUse?.[0]?.matcher).toBe('Bash')
    expect(codexBundledHooks.hooks.PreToolUse?.[0]?.hooks?.[0]).toEqual({
      type: 'command',
      command: 'bash ./hooks/pluxx-hook-command-1.sh',
    })
    expect(codexBundledHooks.hooks.PermissionRequest?.[0]?.matcher).toBe('Edit')
    expect(codexBundledHooks.hooks.PermissionRequest?.[0]?.hooks?.[0]).toEqual({
      type: 'command',
      command: 'bash ./hooks/pluxx-hook-command-2.sh',
    })
    expect(codexBundledHooks.hooks.UserPromptSubmit).toBeUndefined()
    expect(codexHooks.hooks.PreToolUse?.[0]?.matcher).toBe('Bash')
    expect(codexHooks.hooks.PreToolUse?.[0]?.hooks?.[0]?.command).toBe('bash ./hooks/pluxx-hook-command-1.sh')
    expect(codexHooks.hooks.PermissionRequest?.[0]?.matcher).toBe('Edit')
    expect(codexHooks.hooks.PermissionRequest?.[0]?.hooks?.[0]?.command).toBe('bash ./hooks/pluxx-hook-command-2.sh')
    expect(codexHooks.hooks.PreToolUse?.[0]?.hooks?.[0]?.timeout).toBeUndefined()
    expect(codexHooks.hooks.UserPromptSubmit).toBeUndefined()
    expect(codexHooks.unsupported).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          canonicalEvent: 'notification',
          codexEvent: 'Notification',
          type: 'http',
        }),
      ]),
    )

    expect(opencodeIndex).toContain('"matcher": "Bash"')
    expect(opencodeIndex).toContain('"failClosed": true')
    expect(opencodeIndex).not.toContain('Confirm before sending the prompt.')
    expect(opencodeIndex).not.toContain('https://example.com/hooks/notify')
    expect(opencodeIndex).not.toContain('"loop_limit": 3')
  })

  it('preserves richer Claude-native hook handler types', async () => {
    const hookConfig: PluginConfig = {
      ...testConfig,
      name: 'claude-rich-hook-types',
      hooks: {
        postToolUse: [{
          type: 'http',
          url: 'https://example.com/hooks/post-tool',
          headers: { Authorization: 'Bearer $HOOK_TOKEN' },
          allowedEnvVars: ['HOOK_TOKEN'],
          timeout: 30,
        }],
        taskCompleted: [{
          type: 'agent',
          prompt: 'Verify that the task is actually complete before allowing Claude to stop.',
          model: 'claude-3-5-haiku',
        }],
        sessionStart: [{
          type: 'mcp_tool',
          server: 'memory',
          tool: 'load_context',
          input: {
            session: '${session_id}',
          },
        }],
      },
      targets: ['claude-code'],
      outDir: './claude-rich-hook-types-dist',
    }

    await build(hookConfig, TEST_DIR)

    const claudeHooks = JSON.parse(
      readFileSync(resolve(TEST_DIR, 'claude-rich-hook-types-dist/claude-code/hooks/hooks.json'), 'utf-8')
    )

    expect(claudeHooks.hooks.PostToolUse?.[0]?.hooks?.[0]).toEqual({
      type: 'http',
      url: 'https://example.com/hooks/post-tool',
      timeout: 30,
      headers: { Authorization: 'Bearer $HOOK_TOKEN' },
      allowedEnvVars: ['HOOK_TOKEN'],
    })
    expect(claudeHooks.hooks.TaskCompleted?.[0]?.hooks?.[0]).toEqual({
      type: 'agent',
      prompt: 'Verify that the task is actually complete before allowing Claude to stop.',
      model: 'claude-3-5-haiku',
    })
    expect(claudeHooks.hooks.SessionStart?.[0]?.hooks?.[0]).toEqual({
      type: 'mcp_tool',
      server: 'memory',
      tool: 'load_context',
      input: {
        session: '${session_id}',
      },
    })
  })

  it('normalizes shared agent metadata aliases before rebuilding host-native outputs', async () => {
    const agentConfig: PluginConfig = {
      ...testConfig,
      name: 'agent-metadata-aliases',
      agents: './agents/',
      targets: ['claude-code', 'cursor', 'codex', 'opencode'],
      outDir: './agent-metadata-aliases-dist',
    }

    mkdirSync(resolve(TEST_DIR, 'agents'), { recursive: true })
    await Bun.write(
      resolve(TEST_DIR, 'agents/alias-agent.md'),
      [
        '---',
        'name: alias-agent',
        'description: "Alias normalization specialist."',
        'model: "gpt-5.4"',
        'effort: "high"',
        'maxSteps: 7',
        'top_p: 0.35',
        '---',
        '',
        '# Alias Agent',
        '',
        'Validate that shared agent metadata aliases normalize cleanly.',
        '',
      ].join('\n'),
    )

    await build(agentConfig, TEST_DIR)

    const claudeAgent = readFileSync(
      resolve(TEST_DIR, 'agent-metadata-aliases-dist/claude-code/agents/alias-agent.md'),
      'utf-8',
    )
    const cursorAgent = readFileSync(
      resolve(TEST_DIR, 'agent-metadata-aliases-dist/cursor/agents/alias-agent.md'),
      'utf-8',
    )
    const codexAgent = readFileSync(
      resolve(TEST_DIR, 'agent-metadata-aliases-dist/codex/.codex/agents/alias-agent.toml'),
      'utf-8',
    )
    const opencodeIndex = readFileSync(
      resolve(TEST_DIR, 'agent-metadata-aliases-dist/opencode/index.ts'),
      'utf-8',
    )

    expect(claudeAgent).toContain('effort: "high"')
    expect(claudeAgent).toContain('maxTurns: 7')
    expect(cursorAgent).toContain('Cursor translation note:')
    expect(cursorAgent).toContain('"steps"')
    expect(cursorAgent).toContain('"topP"')
    expect(codexAgent).toContain('model_reasoning_effort = "high"')
    expect(codexAgent).toContain('Host translation note:')
    expect(codexAgent).toContain('"steps"')
    expect(opencodeIndex).toContain('"alias-agent"')
    expect(opencodeIndex).toContain('"steps": 7')
    expect(opencodeIndex).toContain('"topP": 0.35')
  })

  it('carries compiler-intent skill policies into the Codex permissions companion when present', async () => {
    mkdirSync(resolve(TEST_DIR, '.pluxx'), { recursive: true })
    await Bun.write(
      resolve(TEST_DIR, '.pluxx/compiler-intent.json'),
      JSON.stringify({
        version: 1,
        skillPolicies: [{
          skillDir: 'hello',
          title: 'hello',
          description: 'Say hello',
          source: {
            kind: 'claude-allowed-tools',
            platform: 'claude-code',
          },
          permissions: {
            allow: ['Read(*)', 'MCP(test-server.greet)'],
          },
        }],
      }, null, 2) + '\n',
    )

    const permissionConfig: PluginConfig = {
      ...testConfig,
      name: 'intent-plugin',
      permissions: {
        allow: ['Read(src/**)'],
      },
      targets: ['codex'],
      outDir: './intent-dist',
    }

    await build(permissionConfig, TEST_DIR)

    const codexPermissions = JSON.parse(
      readFileSync(resolve(TEST_DIR, 'intent-dist/codex/.codex/permissions.generated.json'), 'utf-8')
    ) as {
      skillPolicies?: Array<{ skillDir: string; permissions: { allow?: string[] } }>
    }

    expect(codexPermissions.skillPolicies).toHaveLength(1)
    expect(codexPermissions.skillPolicies?.[0]?.skillDir).toBe('hello')
    expect(codexPermissions.skillPolicies?.[0]?.permissions.allow).toEqual(['Read(*)', 'MCP(test-server.greet)'])
  })

  it('expands single-server MCP wildcards into Codex approval stanzas and suppresses denied tools', async () => {
    try {
      mkdirSync(resolve(TEST_DIR, '.pluxx'), { recursive: true })
      writeFileSync(
        resolve(TEST_DIR, '.pluxx/mcp.json'),
        JSON.stringify({
          version: 1,
          tools: [
            { name: 'search' },
            { name: 'dangerous' },
            { name: 'lookup' },
          ],
        }, null, 2) + '\n',
      )

      const permissionConfig: PluginConfig = {
        ...testConfig,
        name: 'codex-wildcard-permissions-plugin',
        hooks: undefined,
        permissions: {
          allow: ['MCP(test-server.*)', 'MCP(test-server.search)'],
          deny: ['MCP(test-server.dangerous)'],
        },
        targets: ['codex'],
        outDir: './codex-wildcard-permission-dist',
      }

      await build(permissionConfig, TEST_DIR)

      const codexConfigCompanion = readFileSync(
        resolve(TEST_DIR, 'codex-wildcard-permission-dist/codex/.codex/config.generated.toml'),
        'utf-8'
      )

      expect(codexConfigCompanion).toContain('[mcp_servers."test-server".tools."lookup"]')
      expect(codexConfigCompanion).toContain('[mcp_servers."test-server".tools."search"]')
      expect(codexConfigCompanion).not.toContain('[mcp_servers."test-server".tools."dangerous"]')
    } finally {
      rmSync(resolve(TEST_DIR, '.pluxx'), { recursive: true, force: true })
    }
  })

  it('writes documented manifest paths for Claude Code, Cursor, and Codex plugin components', async () => {
    const claudeManifest = JSON.parse(
      readFileSync(resolve(OUT_DIR, 'claude-code/.claude-plugin/plugin.json'), 'utf-8')
    )
    const cursorManifest = JSON.parse(
      readFileSync(resolve(OUT_DIR, 'cursor/.cursor-plugin/plugin.json'), 'utf-8')
    )
    const codexManifest = JSON.parse(
      readFileSync(resolve(OUT_DIR, 'codex/.codex-plugin/plugin.json'), 'utf-8')
    )

    expect(claudeManifest.commands).toBe('./commands/')
    expect(claudeManifest.agents).toEqual([
      './agents/escalation.md',
      './agents/legacy-review.md',
      './agents/mcp-researcher.md',
    ])
    expect(claudeManifest.hooks).toBeUndefined()
    expect(claudeManifest.mcpServers).toBe('./.mcp.json')

    expect(cursorManifest.skills).toBe('./skills/')
    expect(cursorManifest.commands).toBe('./commands/')
    expect(cursorManifest.agents).toBe('./agents/')
    expect(cursorManifest.rules).toBe('./rules/')
    expect(cursorManifest.hooks).toBe('./hooks/hooks.json')
    expect(cursorManifest.mcpServers).toBe('./mcp.json')

    expect(codexManifest.skills).toBe('./skills/')
    expect(codexManifest.mcpServers).toBe('./.mcp.json')
    expect(codexManifest.hooks).toBe('./hooks/hooks.json')
  })

  it('translates canonical agents into Claude-native agent files', async () => {
    const claudeEscalationAgent = readFileSync(resolve(OUT_DIR, 'claude-code/agents/escalation.md'), 'utf-8')
    expect(claudeEscalationAgent).toContain('name: "escalation"')
    expect(claudeEscalationAgent).toContain('description: "Escalation specialist."')
    expect(claudeEscalationAgent).toContain('tools: Read, Grep, Glob')
    expect(claudeEscalationAgent).toContain('skills: deep-research')
    expect(claudeEscalationAgent).toContain('memory: "project"')
    expect(claudeEscalationAgent).toContain('background: true')
    expect(claudeEscalationAgent).toContain('isolation: "worktree"')
    expect(claudeEscalationAgent).toContain('color: "purple"')
    expect(claudeEscalationAgent).toContain('disallowedTools: Write, Edit, MultiEdit')
    expect(claudeEscalationAgent).not.toContain('\nmode:')
    expect(claudeEscalationAgent).not.toContain('\nhidden:')
    expect(claudeEscalationAgent).not.toContain('\npermission:')
    expect(claudeEscalationAgent).toContain('Delegation contract:')

    const claudeLegacyReviewAgent = readFileSync(resolve(OUT_DIR, 'claude-code/agents/legacy-review.md'), 'utf-8')
    expect(claudeLegacyReviewAgent).toContain('maxTurns: 5')
    expect(claudeLegacyReviewAgent).toContain('disallowedTools: Write, Edit, MultiEdit, Bash')
    expect(claudeLegacyReviewAgent).not.toContain('\ntools:')

    const claudeMcpResearcherAgent = readFileSync(resolve(OUT_DIR, 'claude-code/agents/mcp-researcher.md'), 'utf-8')
    expect(claudeMcpResearcherAgent).toContain('maxTurns: 4')
    expect(claudeMcpResearcherAgent).toContain('disallowedTools: Write, Edit, MultiEdit, Bash')
    expect(claudeMcpResearcherAgent).not.toContain('\ntools:')
  })

  it('preserves shared instruction intent across the core four native instruction surfaces', async () => {
    const sourceInstructions = readFileSync(resolve(TEST_DIR, 'INSTRUCTIONS.md'), 'utf-8').trim()
    const sharedLine = 'If a workflow repeats, promote it into a command or specialist agent instead of hiding it in generic skills.'

    const claudeInstructions = readFileSync(resolve(OUT_DIR, 'claude-code/CLAUDE.md'), 'utf-8')
    const cursorInstructions = readFileSync(resolve(OUT_DIR, 'cursor/AGENTS.md'), 'utf-8')
    const codexInstructions = readFileSync(resolve(OUT_DIR, 'codex/AGENTS.md'), 'utf-8')
    const opencodeIndex = readFileSync(resolve(OUT_DIR, 'opencode/index.ts'), 'utf-8')

    expect(claudeInstructions).toContain(sourceInstructions)
    expect(cursorInstructions).toContain(sourceInstructions)
    expect(codexInstructions).toContain(sourceInstructions)
    expect(opencodeIndex).toContain(JSON.stringify(sourceInstructions))
    expect(opencodeIndex).toContain('const INSTRUCTIONS =')
    expect(opencodeIndex).toContain('applyInstructions(output.system)')
    expect(opencodeIndex).toContain(sharedLine)
  })

  it('compiles canonical agents into native Codex custom-agent TOML files', async () => {
    const codexAgent = readFileSync(resolve(OUT_DIR, 'codex/.codex/agents/escalation.toml'), 'utf-8')
    expect(codexAgent).toContain('name = "escalation"')
    expect(codexAgent).toContain('description = "Escalation specialist."')
    expect(codexAgent).toContain('developer_instructions = """')
    expect(codexAgent).toContain('Delegation contract:')
    expect(codexAgent).toContain('This specialist is intended primarily for delegated use')
    expect(codexAgent).toContain('Only delegate further subtasks when the work clearly benefits from another specialist.')
    expect(codexAgent).toContain('Escalate tricky issues with a constrained tool policy.')
  })

  it('degrades canonical commands into Codex routing guidance and a generated companion', async () => {
    const codexAgentsMd = readFileSync(resolve(OUT_DIR, 'codex/AGENTS.md'), 'utf-8')
    const codexCommands = JSON.parse(
      readFileSync(resolve(OUT_DIR, 'codex/.codex/commands.generated.json'), 'utf-8')
    ) as {
      model: string
      commands: Array<{
        id: string
        title: string
        argumentHint?: string
        arguments?: string[]
        examples?: string[]
        skill?: string
        agent?: string
        subtask?: boolean
        whenToUse?: string
        context?: string
      }>
    }

    expect(codexAgentsMd).toContain('## Command Routing')
    expect(codexAgentsMd).toContain('`/pulse`')
    expect(codexAgentsMd).toContain('`/research` - Run the deep research wrapper (arguments: [company] [region]; skill: deep-research; agent: escalation; subtask: yes)')
    expect(codexAgentsMd).toContain('When to use: Use when the user wants a routed investigation entrypoint.')
    expect(codexAgentsMd).toContain('Examples: `/research acme us`, `/research acme eu`')
    expect(codexAgentsMd).toContain('Context hint: fork')
    expect(codexCommands.model).toBe('pluxx.commands.v1')
    expect(codexCommands.commands[0]?.id).toBe('pulse')
    expect(codexCommands.commands.find((command) => command.id === 'research')?.argumentHint).toBe('[company] [region]')
    expect(codexCommands.commands.find((command) => command.id === 'research')?.arguments).toEqual(['company', 'region'])
    expect(codexCommands.commands.find((command) => command.id === 'research')?.examples).toEqual(['/research acme us', '/research acme eu'])
    expect(codexCommands.commands.find((command) => command.id === 'research')?.skill).toBe('deep-research')
    expect(codexCommands.commands.find((command) => command.id === 'research')?.agent).toBe('escalation')
    expect(codexCommands.commands.find((command) => command.id === 'research')?.subtask).toBe(true)
    expect(codexCommands.commands.find((command) => command.id === 'research')?.whenToUse).toBe('Use when the user wants a routed investigation entrypoint.')
    expect(codexCommands.commands.find((command) => command.id === 'research')?.context).toBe('fork')
  })

  it('preserves Linear-style preToolUse matchers in Claude Code and Cursor outputs', async () => {
    const linearMatchers = [
      'mcp__linear-mcp__create_attachment',
      'mcp__linear-mcp__create_document',
      'mcp__linear-mcp__create_issue_label',
      'mcp__linear-mcp__delete_attachment',
      'mcp__linear-mcp__delete_comment',
      'mcp__linear-mcp__delete_status_update',
      'mcp__linear-mcp__extract_images',
    ] as const

    const matcherConfig: PluginConfig = {
      ...testConfig,
      name: 'linear-matcher-plugin',
      hooks: {
        preToolUse: linearMatchers.map(matcher => ({
          command: '${PLUGIN_ROOT}/scripts/confirm-mutation.sh',
          matcher,
        })),
      },
      targets: ['claude-code', 'cursor'],
      outDir: './matcher-dist',
    }

    await build(matcherConfig, TEST_DIR)

    const claudeHooks = JSON.parse(
      readFileSync(resolve(TEST_DIR, 'matcher-dist/claude-code/hooks/hooks.json'), 'utf-8')
    )
    const cursorHooks = JSON.parse(
      readFileSync(resolve(TEST_DIR, 'matcher-dist/cursor/hooks/hooks.json'), 'utf-8')
    )

    expect(claudeHooks.hooks.PreToolUse).toHaveLength(linearMatchers.length)
    expect(
      claudeHooks.hooks.PreToolUse.map((group: { matcher?: string }) => group.matcher)
    ).toEqual([...linearMatchers])
    expect(
      claudeHooks.hooks.PreToolUse.every((group: { hooks: Array<{ command: string }> }) =>
        group.hooks[0]?.command.startsWith('bash "${CLAUDE_PLUGIN_ROOT}/hooks/pluxx-hook-command-')
      )
    ).toBe(true)
    expect(
      readFileSync(resolve(TEST_DIR, 'matcher-dist/claude-code/hooks/pluxx-hook-command-1.sh'), 'utf-8')
    ).toContain('${CLAUDE_PLUGIN_ROOT}/scripts/confirm-mutation.sh')

    expect(cursorHooks.hooks.preToolUse).toHaveLength(linearMatchers.length)
    expect(
      cursorHooks.hooks.preToolUse.map((entry: { matcher?: string }) => entry.matcher)
    ).toEqual([...linearMatchers])
    expect(
      cursorHooks.hooks.preToolUse.every((entry: { command: string }) =>
        entry.command.startsWith('bash ./hooks/pluxx-hook-command-')
      )
    ).toBe(true)
    expect(readFileSync(resolve(TEST_DIR, 'matcher-dist/cursor/hooks/pluxx-hook-command-1.sh'), 'utf-8')).toContain('./scripts/confirm-mutation.sh')
  })

  it('copies skills to all targets', async () => {
    for (const platform of [
      'claude-code',
      'cursor',
      'codex',
      'opencode',
      'github-copilot',
      'openhands',
      'warp',
      'gemini-cli',
      'amp',
    ]) {
      expect(
        existsSync(resolve(OUT_DIR, platform, 'skills/hello/SKILL.md'))
      ).toBe(true)
    }

    // Roo Code and Cline use platform-specific skill dirs
    expect(existsSync(resolve(OUT_DIR, 'roo-code/.roo/skills/hello/SKILL.md'))).toBe(true)
    expect(existsSync(resolve(OUT_DIR, 'cline/.cline/skills/hello/SKILL.md'))).toBe(true)
  })

  it('keeps Claude commands visible when names collide with semantic skills', async () => {
    mkdirSync(resolve(TEST_DIR, 'skills/read-and-triage-mail'), { recursive: true })
    await Bun.write(
      resolve(TEST_DIR, 'skills/read-and-triage-mail/SKILL.md'),
      '---\nname: read-and-triage-mail\ndescription: triage flow\n---\n',
    )
    await Bun.write(resolve(TEST_DIR, 'commands/read-and-triage-mail.md'), '# Read and triage mail\n')

    const collisionConfig: PluginConfig = {
      ...testConfig,
      outDir: './collision-dist',
      targets: ['claude-code', 'cursor'],
    }

    await build(collisionConfig, TEST_DIR)

    const claudeSkill = readFileSync(
      resolve(TEST_DIR, 'collision-dist/claude-code/skills/read-and-triage-mail/SKILL.md'),
      'utf-8',
    )
    expect(
      existsSync(resolve(TEST_DIR, 'collision-dist/claude-code/skills/read-and-triage-mail/SKILL.md'))
    ).toBe(true)
    expect(
      existsSync(resolve(TEST_DIR, 'collision-dist/claude-code/commands/read-and-triage-mail.md'))
    ).toBe(true)
    expect(claudeSkill).toContain('name: read-and-triage-mail-skill')
    expect(claudeSkill).toContain('user-invocable: false')

    expect(
      existsSync(resolve(TEST_DIR, 'collision-dist/cursor/skills/read-and-triage-mail/SKILL.md'))
    ).toBe(true)
    expect(
      existsSync(resolve(TEST_DIR, 'collision-dist/cursor/commands/read-and-triage-mail.md'))
    ).toBe(true)
  })

  it('copies commands and agents to Cursor plugin roots', async () => {
    expect(existsSync(resolve(OUT_DIR, 'cursor/commands/pulse.md'))).toBe(true)
    expect(existsSync(resolve(OUT_DIR, 'cursor/agents/escalation.md'))).toBe(true)
    const cursorAgent = readFileSync(resolve(OUT_DIR, 'cursor/agents/escalation.md'), 'utf-8')
    expect(cursorAgent).toContain('name: "escalation"')
    expect(cursorAgent).toContain('description: "Escalation specialist."')
    expect(cursorAgent).not.toContain('permission:')
    expect(cursorAgent).not.toContain('mode: subagent')
    expect(cursorAgent).toContain('Cursor translation note: stay read-only unless the parent task explicitly asks for file edits.')
    expect(cursorAgent).toContain('Cursor translation note: only delegate further subtasks when the work clearly benefits from another specialist.')
  })

  it('writes Cursor rules to rules/', async () => {
    const rulePath = resolve(OUT_DIR, 'cursor/rules/megamind-operating-conventions.mdc')
    expect(existsSync(rulePath)).toBe(true)

    const content = readFileSync(rulePath, 'utf-8')
    expect(content).toContain('globs: ["**/*.ts","**/*.tsx"]')
  })

  it('guards against path traversal outDir values', async () => {
    const unsafeConfig: PluginConfig = {
      ...testConfig,
      outDir: '..',
    }

    await expect(build(unsafeConfig, TEST_DIR)).rejects.toThrow(
      'resolves outside the project root'
    )
  })

  it('guards against path traversal for configured content paths', async () => {
    const guardedPathKeys = [
      'skills',
      'commands',
      'agents',
      'scripts',
      'assets',
      'instructions',
    ] as const

    for (const key of guardedPathKeys) {
      const unsafeConfig: PluginConfig = {
        ...testConfig,
        [key]: '../outside',
      }

      await expect(build(unsafeConfig, TEST_DIR)).rejects.toThrow(
        `${key} path "../outside" resolves outside the project root`
      )
    }
  })
})
