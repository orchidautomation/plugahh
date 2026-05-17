import { afterEach, describe, expect, it } from 'bun:test'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { resolve } from 'path'
import { lintProject } from '../src/cli/lint'

const tempDirs: string[] = []

function createTempProject(): string {
  const dir = mkdtempSync(resolve(tmpdir(), 'pluxx-lint-'))
  tempDirs.push(dir)
  return dir
}

afterEach(() => {
  for (const dir of tempDirs.splice(0, tempDirs.length)) {
    rmSync(dir, { recursive: true, force: true })
  }
})

describe('lintProject', () => {
  it('passes for valid config and skill metadata', async () => {
    const projectDir = createTempProject()
    mkdirSync(resolve(projectDir, 'skills/valid-skill'), { recursive: true })

    writeFileSync(
      resolve(projectDir, 'pluxx.config.json'),
      JSON.stringify({
        name: 'valid-plugin',
        version: '0.1.0',
        description: 'Valid plugin config',
        author: { name: 'Test Author' },
        skills: './skills/',
        targets: ['claude-code', 'cursor', 'codex'],
        brand: {
          displayName: 'Valid Plugin',
          color: '#12AB34',
          icon: './assets/icon.svg',
          screenshots: ['./assets/screenshots/overview.svg'],
          defaultPrompts: ['Prompt 1', 'Prompt 2'],
        },
        mcp: {
          server: {
            url: 'https://example.com/mcp',
          },
        },
      }, null, 2),
    )

    writeFileSync(
      resolve(projectDir, 'skills/valid-skill/SKILL.md'),
      [
        '---',
        'name: valid-skill',
        'description: "A valid skill description"',
        '---',
        '',
        '# Valid Skill',
      ].join('\n'),
    )

    const result = await lintProject(projectDir)
    expect(result.errors).toBe(0)
    expect(result.warnings).toBe(0)
  })

  it('reports cross-platform warnings and errors', async () => {
    const projectDir = createTempProject()
    mkdirSync(resolve(projectDir, 'skills/dir-mismatch'), { recursive: true })

    writeFileSync(
      resolve(projectDir, 'pluxx.config.json'),
      JSON.stringify({
        name: 'test-plugin',
        version: '0.1.0',
        description: 'Invalid metadata plugin',
        author: { name: 'Test Author' },
        skills: './skills/',
        brand: {
          displayName: 'Invalid Brand',
          color: 'blue',
          defaultPrompts: [
            'short prompt',
            'another short prompt',
            'third short prompt',
            'fourth prompt not allowed',
            'x'.repeat(140),
          ],
        },
        mcp: {
          server: {
            url: 'ftp://example.com/mcp',
          },
        },
      }, null, 2),
    )

    writeFileSync(
      resolve(projectDir, 'skills/dir-mismatch/SKILL.md'),
      [
        '---',
        'name: Bad_Name',
        `description: ${'x'.repeat(290)}: detail`,
        '---',
        '',
        '# Invalid Skill',
      ].join('\n'),
    )

    const result = await lintProject(projectDir)
    expect(result.errors).toBeGreaterThan(0)
    expect(result.warnings).toBeGreaterThan(0)
    expect(result.issues.some(issue => issue.code === 'mcp-url-protocol')).toBe(true)
    expect(result.issues.some(issue => issue.code === 'brand-color-hex')).toBe(true)
    expect(result.issues.some(issue => issue.code === 'codex-default-prompts-count')).toBe(true)
    expect(result.issues.some(issue => issue.code === 'skill-name-format')).toBe(true)
    expect(result.issues.some(issue => issue.code === 'skill-name-dir-mismatch')).toBe(true)
    expect(result.issues.some(issue => issue.code === 'skill-description-truncation')).toBe(true)
    expect(result.issues.some(issue => issue.code === 'yaml-quote-special-chars')).toBe(true)
  })

  it('reports skill-description-length error when description exceeds hard max', async () => {
    const projectDir = createTempProject()
    mkdirSync(resolve(projectDir, 'skills/my-skill'), { recursive: true })

    writeFileSync(
      resolve(projectDir, 'pluxx.config.json'),
      JSON.stringify({
        name: 'test-plugin',
        version: '0.1.0',
        description: 'test',
        author: { name: 'Test Author' },
        skills: './skills/',
        targets: ['opencode'],
      }, null, 2),
    )

    writeFileSync(
      resolve(projectDir, 'skills/my-skill/SKILL.md'),
      [
        '---',
        'name: my-skill',
        `description: "${'x'.repeat(1100)}"`,
        '---',
        '',
        '# My Skill',
      ].join('\n'),
    )

    const result = await lintProject(projectDir)
    expect(result.issues.some(issue => issue.code === 'skill-description-length' && issue.platform === 'opencode')).toBe(true)
  })

  it('warns when a local stdio MCP runtime is not bundled through passthrough', async () => {
    const projectDir = createTempProject()
    mkdirSync(resolve(projectDir, 'skills/my-skill'), { recursive: true })
    mkdirSync(resolve(projectDir, 'build'), { recursive: true })
    writeFileSync(resolve(projectDir, 'build/index.js'), 'console.log("runtime")\n')

    writeFileSync(
      resolve(projectDir, 'pluxx.config.json'),
      JSON.stringify({
        name: 'test-plugin',
        version: '0.1.0',
        description: 'test',
        author: { name: 'Test Author' },
        skills: './skills/',
        targets: ['codex'],
        mcp: {
          localRuntime: {
            transport: 'stdio',
            command: 'node',
            args: ['./build/index.js'],
          },
        },
      }, null, 2),
    )

    writeFileSync(
      resolve(projectDir, 'skills/my-skill/SKILL.md'),
      [
        '---',
        'name: my-skill',
        'description: "A valid skill description"',
        '---',
        '',
        '# My Skill',
      ].join('\n'),
    )

    const result = await lintProject(projectDir)
    expect(result.issues.some(issue => issue.code === 'mcp-stdio-runtime-unbundled')).toBe(true)
  })

  it('warns when stdio runtime startup depends on installer-owned check-env.sh', async () => {
    const projectDir = createTempProject()
    mkdirSync(resolve(projectDir, 'skills/my-skill'), { recursive: true })

    writeFileSync(
      resolve(projectDir, 'pluxx.config.json'),
      JSON.stringify({
        name: 'test-plugin',
        version: '0.1.0',
        description: 'test',
        author: { name: 'Test Author' },
        skills: './skills/',
        targets: ['claude-code'],
        mcp: {
          localRuntime: {
            transport: 'stdio',
            command: 'bash',
            args: ['./scripts/check-env.sh'],
          },
        },
      }, null, 2),
    )

    writeFileSync(
      resolve(projectDir, 'skills/my-skill/SKILL.md'),
      ['---', 'name: my-skill', 'description: "A valid skill description"', '---', '', '# My Skill'].join('\n'),
    )

    const result = await lintProject(projectDir)
    expect(result.issues.some(issue => issue.code === 'installer-owned-check-env-runtime')).toBe(true)
  })

  it('warns when global stdio MCP config uses host-specific plugin root vars', async () => {
    const projectDir = createTempProject()
    mkdirSync(resolve(projectDir, 'skills/my-skill'), { recursive: true })

    writeFileSync(
      resolve(projectDir, 'pluxx.config.json'),
      JSON.stringify({
        name: 'test-plugin',
        version: '0.1.0',
        description: 'test',
        author: { name: 'Test Author' },
        skills: './skills/',
        targets: ['claude-code', 'cursor', 'codex'],
        mcp: {
          sendlens: {
            transport: 'stdio',
            command: 'bash',
            args: ['${CLAUDE_PLUGIN_ROOT}/scripts/start-mcp.sh'],
          },
        },
      }, null, 2),
    )

    writeFileSync(
      resolve(projectDir, 'skills/my-skill/SKILL.md'),
      ['---', 'name: my-skill', 'description: "A valid skill description"', '---', '', '# My Skill'].join('\n'),
    )

    const result = await lintProject(projectDir)
    expect(result.issues.some(issue => issue.code === 'mcp-stdio-host-root-var')).toBe(true)
  })

  it('does not warn for project-local stdio runtime shipped through scripts payload', async () => {
    const projectDir = createTempProject()
    mkdirSync(resolve(projectDir, 'skills/my-skill'), { recursive: true })
    mkdirSync(resolve(projectDir, 'scripts'), { recursive: true })

    writeFileSync(
      resolve(projectDir, 'pluxx.config.json'),
      JSON.stringify({
        name: 'test-plugin',
        version: '0.1.0',
        description: 'test',
        author: { name: 'Test Author' },
        skills: './skills/',
        scripts: './scripts/',
        targets: ['claude-code', 'cursor', 'codex'],
        mcp: {
          sendlens: {
            transport: 'stdio',
            command: 'bash',
            args: ['./scripts/start-mcp.sh'],
          },
        },
      }, null, 2),
    )

    writeFileSync(resolve(projectDir, 'scripts/start-mcp.sh'), '#!/usr/bin/env bash\nexit 0\n')
    writeFileSync(
      resolve(projectDir, 'skills/my-skill/SKILL.md'),
      ['---', 'name: my-skill', 'description: "A valid skill description"', '---', '', '# My Skill'].join('\n'),
    )

    const result = await lintProject(projectDir)
    expect(result.issues.some(issue => issue.code === 'mcp-stdio-runtime-unbundled')).toBe(false)
  })

  it('warns when Codex target is missing richer branding metadata', async () => {
    const projectDir = createTempProject()
    mkdirSync(resolve(projectDir, 'skills/my-skill'), { recursive: true })

    writeFileSync(
      resolve(projectDir, 'pluxx.config.json'),
      JSON.stringify({
        name: 'test-plugin',
        version: '0.1.0',
        description: 'test',
        author: { name: 'Test Author' },
        skills: './skills/',
        targets: ['codex'],
        brand: {
          displayName: 'Test Plugin',
        },
      }, null, 2),
    )

    writeFileSync(
      resolve(projectDir, 'skills/my-skill/SKILL.md'),
      ['---', 'name: my-skill', 'description: "A valid skill description"', '---', '', '# My Skill'].join('\n'),
    )

    const result = await lintProject(projectDir)
    expect(result.issues.some(issue => issue.code === 'codex-branding-metadata-missing' && issue.platform === 'Codex')).toBe(true)
  })

  it('warns when Cursor target is missing brand.icon', async () => {
    const projectDir = createTempProject()
    mkdirSync(resolve(projectDir, 'skills/my-skill'), { recursive: true })

    writeFileSync(
      resolve(projectDir, 'pluxx.config.json'),
      JSON.stringify({
        name: 'test-plugin',
        version: '0.1.0',
        description: 'test',
        author: { name: 'Test Author' },
        skills: './skills/',
        targets: ['cursor'],
        brand: {
          displayName: 'Test Plugin',
        },
      }, null, 2),
    )

    writeFileSync(
      resolve(projectDir, 'skills/my-skill/SKILL.md'),
      ['---', 'name: my-skill', 'description: "A valid skill description"', '---', '', '# My Skill'].join('\n'),
    )

    const result = await lintProject(projectDir)
    expect(result.issues.some(issue => issue.code === 'cursor-branding-metadata-missing' && issue.platform === 'Cursor')).toBe(true)
  })

  it('does not warn when Codex branding is satisfied through brand fields or interface overrides', async () => {
    const projectDir = createTempProject()
    mkdirSync(resolve(projectDir, 'skills/my-skill'), { recursive: true })

    writeFileSync(
      resolve(projectDir, 'pluxx.config.json'),
      JSON.stringify({
        name: 'test-plugin',
        version: '0.1.0',
        description: 'test',
        author: { name: 'Test Author' },
        skills: './skills/',
        targets: ['codex'],
        platforms: {
          codex: {
            interface: {
              composerIcon: './assets/icon.svg',
              screenshots: ['./assets/screenshots/overview.svg'],
            },
          },
        },
      }, null, 2),
    )

    writeFileSync(
      resolve(projectDir, 'skills/my-skill/SKILL.md'),
      ['---', 'name: my-skill', 'description: "A valid skill description"', '---', '', '# My Skill'].join('\n'),
    )

    const result = await lintProject(projectDir)
    expect(result.issues.some(issue => issue.code === 'codex-branding-metadata-missing')).toBe(false)
  })

  it('does not warn for the direct install-time check-env hook scaffold', async () => {
    const projectDir = createTempProject()
    mkdirSync(resolve(projectDir, 'skills/my-skill'), { recursive: true })

    writeFileSync(
      resolve(projectDir, 'pluxx.config.json'),
      JSON.stringify({
        name: 'test-plugin',
        version: '0.1.0',
        description: 'test',
        author: { name: 'Test Author' },
        skills: './skills/',
        targets: ['claude-code'],
        hooks: {
          sessionStart: [{
            type: 'command',
            command: 'bash "${PLUGIN_ROOT}/scripts/check-env.sh"',
          }],
        },
      }, null, 2),
    )

    writeFileSync(
      resolve(projectDir, 'skills/my-skill/SKILL.md'),
      ['---', 'name: my-skill', 'description: "A valid skill description"', '---', '', '# My Skill'].join('\n'),
    )

    const result = await lintProject(projectDir)
    expect(result.issues.some(issue => issue.code === 'installer-owned-check-env-hook')).toBe(false)
  })

  it('reports skill-description-truncation warning for display max', async () => {
    const projectDir = createTempProject()
    mkdirSync(resolve(projectDir, 'skills/my-skill'), { recursive: true })

    writeFileSync(
      resolve(projectDir, 'pluxx.config.json'),
      JSON.stringify({
        name: 'test-plugin',
        version: '0.1.0',
        description: 'test',
        author: { name: 'Test Author' },
        skills: './skills/',
        targets: ['claude-code'],
      }, null, 2),
    )

    writeFileSync(
      resolve(projectDir, 'skills/my-skill/SKILL.md'),
      [
        '---',
        'name: my-skill',
        `description: "${'x'.repeat(300)}"`,
        '---',
        '',
        '# My Skill',
      ].join('\n'),
    )

    const result = await lintProject(projectDir)
    expect(result.issues.some(issue => issue.code === 'skill-description-truncation' && issue.platform === 'claude-code')).toBe(true)
  })

  it('reports Claude Code hard description cap when a skill exceeds 1536 characters', async () => {
    const projectDir = createTempProject()
    mkdirSync(resolve(projectDir, 'skills/my-skill'), { recursive: true })

    writeFileSync(
      resolve(projectDir, 'pluxx.config.json'),
      JSON.stringify({
        name: 'test-plugin',
        version: '0.1.0',
        description: 'test',
        author: { name: 'Test Author' },
        skills: './skills/',
        targets: ['claude-code'],
      }, null, 2),
    )

    writeFileSync(
      resolve(projectDir, 'skills/my-skill/SKILL.md'),
      [
        '---',
        'name: my-skill',
        `description: "${'x'.repeat(1600)}"`,
        '---',
        '',
        '# My Skill',
      ].join('\n'),
    )

    const result = await lintProject(projectDir)
    expect(result.issues.some(issue => issue.code === 'skill-description-length' && issue.platform === 'claude-code')).toBe(true)
  })

  it('reports Codex description heuristic as a guideline warning', async () => {
    const projectDir = createTempProject()
    mkdirSync(resolve(projectDir, 'skills/my-skill'), { recursive: true })

    writeFileSync(
      resolve(projectDir, 'pluxx.config.json'),
      JSON.stringify({
        name: 'test-plugin',
        version: '0.1.0',
        description: 'test',
        author: { name: 'Test Author' },
        skills: './skills/',
        targets: ['codex'],
      }, null, 2),
    )

    writeFileSync(
      resolve(projectDir, 'skills/my-skill/SKILL.md'),
      [
        '---',
        'name: my-skill',
        `description: "${'x'.repeat(1100)}"`,
        '---',
        '',
        '# My Skill',
      ].join('\n'),
    )

    const result = await lintProject(projectDir)
    expect(result.issues.some(issue => issue.code === 'skill-description-guideline' && issue.platform === 'codex')).toBe(true)
    expect(result.issues.some(issue => issue.code === 'skill-description-length' && issue.platform === 'codex')).toBe(false)
  })

  it('reports skill-name-dir-mismatch error for platforms requiring dir match', async () => {
    const projectDir = createTempProject()
    mkdirSync(resolve(projectDir, 'skills/wrong-dir'), { recursive: true })

    writeFileSync(
      resolve(projectDir, 'pluxx.config.json'),
      JSON.stringify({
        name: 'test-plugin',
        version: '0.1.0',
        description: 'test',
        author: { name: 'Test Author' },
        skills: './skills/',
        targets: ['cursor'],
      }, null, 2),
    )

    writeFileSync(
      resolve(projectDir, 'skills/wrong-dir/SKILL.md'),
      [
        '---',
        'name: my-skill',
        'description: "A valid skill"',
        '---',
        '',
        '# My Skill',
      ].join('\n'),
    )

    const result = await lintProject(projectDir)
    expect(result.issues.some(issue => issue.code === 'skill-name-dir-mismatch')).toBe(true)
  })

  it('reports skill-name-dir-guideline warning for Codex portability heuristics', async () => {
    const projectDir = createTempProject()
    mkdirSync(resolve(projectDir, 'skills/wrong-dir'), { recursive: true })

    writeFileSync(
      resolve(projectDir, 'pluxx.config.json'),
      JSON.stringify({
        name: 'test-plugin',
        version: '0.1.0',
        description: 'test',
        author: { name: 'Test Author' },
        skills: './skills/',
        targets: ['codex'],
      }, null, 2),
    )

    writeFileSync(
      resolve(projectDir, 'skills/wrong-dir/SKILL.md'),
      [
        '---',
        'name: my-skill',
        'description: "A valid skill"',
        '---',
        '',
        '# My Skill',
      ].join('\n'),
    )

    const result = await lintProject(projectDir)
    expect(result.issues.some(issue => issue.code === 'skill-name-dir-guideline' && issue.platform === 'codex')).toBe(true)
    expect(result.issues.some(issue => issue.code === 'skill-name-dir-mismatch' && issue.platform === 'codex')).toBe(false)
  })

  it('does not report dir mismatch for platforms that do not require it', async () => {
    const projectDir = createTempProject()
    mkdirSync(resolve(projectDir, 'skills/wrong-dir'), { recursive: true })

    writeFileSync(
      resolve(projectDir, 'pluxx.config.json'),
      JSON.stringify({
        name: 'test-plugin',
        version: '0.1.0',
        description: 'test',
        author: { name: 'Test Author' },
        skills: './skills/',
        targets: ['claude-code'],
      }, null, 2),
    )

    writeFileSync(
      resolve(projectDir, 'skills/wrong-dir/SKILL.md'),
      [
        '---',
        'name: my-skill',
        'description: "A valid skill"',
        '---',
        '',
        '# My Skill',
      ].join('\n'),
    )

    const result = await lintProject(projectDir)
    expect(result.issues.some(issue => issue.code === 'skill-name-dir-mismatch')).toBe(false)
  })

  it('reports Codex prompt listing heuristics as guideline warnings', async () => {
    const projectDir = createTempProject()
    mkdirSync(resolve(projectDir, 'skills/my-skill'), { recursive: true })

    writeFileSync(
      resolve(projectDir, 'pluxx.config.json'),
      JSON.stringify({
        name: 'test-plugin',
        version: '0.1.0',
        description: 'test',
        author: { name: 'Test Author' },
        skills: './skills/',
        targets: ['codex'],
        brand: {
          displayName: 'Test',
          defaultPrompts: [
            'x'.repeat(200),
            'short',
            'another',
            'too many',
          ],
        },
      }, null, 2),
    )

    writeFileSync(
      resolve(projectDir, 'skills/my-skill/SKILL.md'),
      [
        '---',
        'name: my-skill',
        'description: "A valid skill"',
        '---',
        '',
        '# My Skill',
      ].join('\n'),
    )

    const result = await lintProject(projectDir)
    expect(result.issues.some(issue => issue.code === 'platform-prompt-count-guideline' && issue.platform === 'codex')).toBe(true)
    expect(result.issues.some(issue => issue.code === 'platform-prompt-length-guideline' && issue.platform === 'codex')).toBe(true)
  })

  it('reports platform-instructions-size warning when instructions file exceeds max bytes', async () => {
    const projectDir = createTempProject()
    mkdirSync(resolve(projectDir, 'skills/my-skill'), { recursive: true })

    writeFileSync(
      resolve(projectDir, 'pluxx.config.json'),
      JSON.stringify({
        name: 'test-plugin',
        version: '0.1.0',
        description: 'test',
        author: { name: 'Test Author' },
        skills: './skills/',
        targets: ['codex'],
      }, null, 2),
    )

    writeFileSync(
      resolve(projectDir, 'skills/my-skill/SKILL.md'),
      [
        '---',
        'name: my-skill',
        'description: "A valid skill"',
        '---',
        '',
        '# My Skill',
      ].join('\n'),
    )

    // Create an AGENTS.md that exceeds 32768 bytes
    writeFileSync(resolve(projectDir, 'AGENTS.md'), 'x'.repeat(40000))

    const result = await lintProject(projectDir)
    expect(result.issues.some(issue => issue.code === 'platform-instructions-size' && issue.platform === 'codex')).toBe(true)
  })

  it('reports platform-instructions-size warning for a configured nonstandard instructions path', async () => {
    const projectDir = createTempProject()
    mkdirSync(resolve(projectDir, 'skills/my-skill'), { recursive: true })
    mkdirSync(resolve(projectDir, 'docs'), { recursive: true })

    writeFileSync(
      resolve(projectDir, 'pluxx.config.json'),
      JSON.stringify({
        name: 'test-plugin',
        version: '0.1.0',
        description: 'test',
        author: { name: 'Test Author' },
        skills: './skills/',
        instructions: './docs/OPERATIONS.md',
        targets: ['codex'],
      }, null, 2),
    )

    writeFileSync(
      resolve(projectDir, 'skills/my-skill/SKILL.md'),
      [
        '---',
        'name: my-skill',
        'description: "A valid skill"',
        '---',
        '',
        '# My Skill',
      ].join('\n'),
    )

    writeFileSync(resolve(projectDir, 'docs/OPERATIONS.md'), 'x'.repeat(40000))

    const result = await lintProject(projectDir)
    expect(
      result.issues.some(
        issue => issue.code === 'platform-instructions-size'
          && issue.platform === 'codex'
          && issue.file === 'docs/OPERATIONS.md',
      ),
    ).toBe(true)
  })

  it('reports platform-rules-lines warning when rules file exceeds max lines', async () => {
    const projectDir = createTempProject()
    mkdirSync(resolve(projectDir, 'skills/my-skill'), { recursive: true })

    writeFileSync(
      resolve(projectDir, 'pluxx.config.json'),
      JSON.stringify({
        name: 'test-plugin',
        version: '0.1.0',
        description: 'test',
        author: { name: 'Test Author' },
        skills: './skills/',
        targets: ['cursor'],
      }, null, 2),
    )

    writeFileSync(
      resolve(projectDir, 'skills/my-skill/SKILL.md'),
      [
        '---',
        'name: my-skill',
        'description: "A valid skill"',
        '---',
        '',
        '# My Skill',
      ].join('\n'),
    )

    // Create a .cursorrules file with 600 lines
    writeFileSync(resolve(projectDir, '.cursorrules'), Array(601).fill('rule line').join('\n'))

    const result = await lintProject(projectDir)
    expect(result.issues.some(issue => issue.code === 'platform-rules-lines' && issue.platform === 'cursor')).toBe(true)
  })

  it('warns when canonical permissions need Codex external configuration or non-portable skill selectors', async () => {
    const projectDir = createTempProject()
    mkdirSync(resolve(projectDir, 'skills/my-skill'), { recursive: true })

    writeFileSync(
      resolve(projectDir, 'pluxx.config.json'),
      JSON.stringify({
        name: 'test-plugin',
        version: '0.1.0',
        description: 'test',
        author: { name: 'Test Author' },
        skills: './skills/',
        targets: ['claude-code', 'cursor', 'codex', 'opencode'],
        permissions: {
          allow: ['Skill(review-scaffold)', 'MCP(test-server.search)'],
          deny: ['Bash(rm -rf *)'],
        },
      }, null, 2),
    )

    writeFileSync(
      resolve(projectDir, 'skills/my-skill/SKILL.md'),
      ['---', 'name: my-skill', 'description: "A valid skill"', '---', '', '# My Skill'].join('\n'),
    )

    const result = await lintProject(projectDir)
    expect(result.issues.some(issue =>
      issue.code === 'codex-permissions-external-config'
      && issue.message.includes('.codex/config.generated.toml')
    )).toBe(true)
    expect(result.issues.some(issue => issue.code === 'permissions-skill-selector-limited')).toBe(true)
    expect(result.issues.some(issue => issue.code === 'cursor-permissions-translation')).toBe(true)
    expect(result.issues.some(issue => issue.code === 'permissions-opencode-downgrade')).toBe(true)
  })

  it('warns when Codex agents and root MCP config rely on inherited MCP visibility', async () => {
    const projectDir = createTempProject()
    mkdirSync(resolve(projectDir, 'skills/my-skill'), { recursive: true })
    mkdirSync(resolve(projectDir, 'agents'), { recursive: true })

    writeFileSync(
      resolve(projectDir, 'pluxx.config.json'),
      JSON.stringify({
        name: 'test-plugin',
        version: '0.1.0',
        description: 'test',
        author: { name: 'Test Author' },
        skills: './skills/',
        agents: './agents/',
        targets: ['codex'],
        mcp: {
          probe: {
            transport: 'http',
            url: 'https://example.com/mcp',
          },
        },
      }, null, 2),
    )

    writeFileSync(
      resolve(projectDir, 'skills/my-skill/SKILL.md'),
      ['---', 'name: my-skill', 'description: "A valid skill"', '---', '', '# My Skill'].join('\n'),
    )

    writeFileSync(
      resolve(projectDir, 'agents/research-agent.md'),
      ['---', 'name: research-agent', 'description: "A valid agent"', '---', '', '# Agent'].join('\n'),
    )

    const result = await lintProject(projectDir)
    expect(result.issues.some(issue =>
      issue.code === 'codex-agent-mcp-inheritance'
      && issue.message.includes('mcp_servers = {}')
      && issue.message.includes('inherit parent MCP servers')
    )).toBe(true)
  })

  it('warns when MCP auth or local runtimes depend on external host state', async () => {
    const projectDir = createTempProject()
    mkdirSync(resolve(projectDir, 'skills/my-skill'), { recursive: true })

    writeFileSync(
      resolve(projectDir, 'pluxx.config.json'),
      JSON.stringify({
        name: 'test-plugin',
        version: '0.1.0',
        description: 'test',
        author: { name: 'Test Author' },
        skills: './skills/',
        targets: ['claude-code', 'cursor', 'codex', 'opencode'],
        platforms: {
          'claude-code': {
            mcpAuth: 'platform',
          },
          cursor: {
            mcpAuth: 'platform',
          },
        },
        mcp: {
          oauthish: {
            transport: 'http',
            url: 'https://example.com/mcp',
          },
          hostedOauth: {
            transport: 'http',
            url: 'https://oauth.example.com/mcp',
            auth: {
              type: 'platform',
              mode: 'oauth',
            },
          },
          localFixture: {
            transport: 'stdio',
            command: 'node',
            args: ['./server.js'],
          },
        },
      }, null, 2),
    )

    writeFileSync(
      resolve(projectDir, 'skills/my-skill/SKILL.md'),
      ['---', 'name: my-skill', 'description: "A valid skill"', '---', '', '# My Skill'].join('\n'),
    )

    const result = await lintProject(projectDir)
    expect(result.issues.some(issue => issue.code === 'mcp-runtime-auth-external' && issue.message.includes('"oauthish"') && issue.message.includes('claude-code, cursor'))).toBe(true)
    expect(result.issues.some(issue => issue.code === 'mcp-runtime-auth-external' && issue.message.includes('"hostedOauth"') && issue.message.includes('claude-code, cursor, codex, opencode'))).toBe(true)
    expect(result.issues.some(issue => issue.code === 'mcp-stdio-runtime-dependency' && issue.message.includes('"localFixture"'))).toBe(true)
  })

  it('warns when OpenCode MCP permission output still relies on tool-name translation', async () => {
    const projectDir = createTempProject()
    mkdirSync(resolve(projectDir, 'skills/my-skill'), { recursive: true })

    writeFileSync(
      resolve(projectDir, 'pluxx.config.json'),
      JSON.stringify({
        name: 'test-plugin',
        version: '0.1.0',
        description: 'test',
        author: { name: 'Test Author' },
        skills: './skills/',
        targets: ['opencode'],
        permissions: {
          allow: ['MCP(exa.search_company)'],
        },
      }, null, 2),
    )

    writeFileSync(
      resolve(projectDir, 'skills/my-skill/SKILL.md'),
      [
        '---',
        'name: my-skill',
        'description: "A valid skill"',
        '---',
        '',
        '# My Skill',
      ].join('\n'),
    )

    const result = await lintProject(projectDir)
    expect(result.issues.some(issue => issue.code === 'permissions-opencode-downgrade')).toBe(true)
  })

  it('warns when canonical agents still use deprecated OpenCode legacy tools', async () => {
    const projectDir = createTempProject()
    mkdirSync(resolve(projectDir, 'skills/my-skill'), { recursive: true })
    mkdirSync(resolve(projectDir, 'agents'), { recursive: true })

    writeFileSync(
      resolve(projectDir, 'pluxx.config.json'),
      JSON.stringify({
        name: 'test-plugin',
        version: '0.1.0',
        description: 'test',
        author: { name: 'Test Author' },
        skills: './skills/',
        agents: './agents/',
        targets: ['opencode'],
      }, null, 2),
    )

    writeFileSync(
      resolve(projectDir, 'skills/my-skill/SKILL.md'),
      ['---', 'name: my-skill', 'description: "A valid skill"', '---', '', '# My Skill'].join('\n'),
    )

    writeFileSync(
      resolve(projectDir, 'agents/review.md'),
      [
        '---',
        'name: review',
        'description: "Legacy review agent"',
        'mode: subagent',
        'tools:',
        '  write: false',
        '  bash: false',
        '---',
        '',
        '# Review',
      ].join('\n'),
    )

    const result = await lintProject(projectDir)
    expect(result.issues.some(issue => issue.code === 'opencode-agent-tools-deprecated')).toBe(true)
  })

  it('does not warn on OpenCode agents that already carry canonical permission frontmatter', async () => {
    const projectDir = createTempProject()
    mkdirSync(resolve(projectDir, 'skills/my-skill'), { recursive: true })
    mkdirSync(resolve(projectDir, 'agents'), { recursive: true })

    writeFileSync(
      resolve(projectDir, 'pluxx.config.json'),
      JSON.stringify({
        name: 'test-plugin',
        version: '0.1.0',
        description: 'test',
        author: { name: 'Test Author' },
        skills: './skills/',
        agents: './agents/',
        targets: ['opencode'],
      }, null, 2),
    )

    writeFileSync(
      resolve(projectDir, 'skills/my-skill/SKILL.md'),
      ['---', 'name: my-skill', 'description: "A valid skill"', '---', '', '# My Skill'].join('\n'),
    )

    writeFileSync(
      resolve(projectDir, 'agents/review.md'),
      [
        '---',
        'name: review',
        'description: "Permission-first review agent"',
        'mode: subagent',
        'tools: Read, Grep, Glob',
        'permission:',
        '  edit: deny',
        '  bash: deny',
        '---',
        '',
        '# Review',
      ].join('\n'),
    )

    const result = await lintProject(projectDir)
    expect(result.issues.some(issue => issue.code === 'opencode-agent-tools-deprecated')).toBe(false)
  })

  it('summarizes non-preserve primitive translations for active targets', async () => {
    const projectDir = createTempProject()
    mkdirSync(resolve(projectDir, 'skills/my-skill'), { recursive: true })
    mkdirSync(resolve(projectDir, 'commands'), { recursive: true })

    writeFileSync(
      resolve(projectDir, 'pluxx.config.json'),
      JSON.stringify({
        name: 'test-plugin',
        version: '0.1.0',
        description: 'test',
        author: { name: 'Test Author' },
        skills: './skills/',
        commands: './commands/',
        hooks: {
          sessionStart: [{ command: 'echo setup' }],
        },
        targets: ['codex', 'opencode'],
      }, null, 2),
    )

    writeFileSync(
      resolve(projectDir, 'skills/my-skill/SKILL.md'),
      ['---', 'name: my-skill', 'description: "A valid skill"', '---', '', '# My Skill'].join('\n'),
    )
    writeFileSync(resolve(projectDir, 'commands/review.md'), '# Review\n')

    const result = await lintProject(projectDir)
    expect(result.issues.some(issue => issue.code === 'primitive-degrade-summary' && issue.platform === 'codex' && issue.message.includes('commands'))).toBe(true)
    expect(result.issues.some(issue => issue.code === 'primitive-translate-summary' && issue.platform === 'opencode' && issue.message.includes('hooks'))).toBe(true)
    expect(result.issues.some(issue => issue.code === 'codex-commands-routing-guidance')).toBe(true)
  })

  it('warns on duplicate permission rules before mapping them', async () => {
    const projectDir = createTempProject()
    mkdirSync(resolve(projectDir, 'skills/my-skill'), { recursive: true })

    writeFileSync(
      resolve(projectDir, 'pluxx.config.json'),
      JSON.stringify({
        name: 'test-plugin',
        version: '0.1.0',
        description: 'test',
        author: { name: 'Test Author' },
        skills: './skills/',
        targets: ['claude-code'],
        permissions: {
          allow: ['Read(src/**)', 'Read(src/**)'],
          ask: ['Bash(git commit *)'],
          deny: [],
        },
      }, null, 2),
    )

    writeFileSync(
      resolve(projectDir, 'skills/my-skill/SKILL.md'),
      ['---', 'name: my-skill', 'description: "A valid skill"', '---', '', '# My Skill'].join('\n'),
    )

    const result = await lintProject(projectDir)
    expect(result.issues.some(issue => issue.code === 'permissions-duplicate')).toBe(true)
  })

  it('warns when Claude Code skill listing budget exceeds 8000 characters', async () => {
    const projectDir = createTempProject()
    mkdirSync(resolve(projectDir, 'skills/skill-one'), { recursive: true })
    mkdirSync(resolve(projectDir, 'skills/skill-two'), { recursive: true })

    writeFileSync(
      resolve(projectDir, 'pluxx.config.json'),
      JSON.stringify({
        name: 'test-plugin',
        version: '0.1.0',
        description: 'test',
        author: { name: 'Test Author' },
        skills: './skills/',
        targets: ['claude-code'],
      }, null, 2),
    )

    const description = 'x'.repeat(4100)
    writeFileSync(
      resolve(projectDir, 'skills/skill-one/SKILL.md'),
      `---\nname: skill-one\ndescription: "${description}"\n---\n\n# Skill One\n`,
    )
    writeFileSync(
      resolve(projectDir, 'skills/skill-two/SKILL.md'),
      `---\nname: skill-two\ndescription: "${description}"\n---\n\n# Skill Two\n`,
    )

    const result = await lintProject(projectDir)
    expect(result.issues.some(issue => issue.code === 'platform-skill-listing-budget' && issue.platform === 'claude-code')).toBe(true)
  })

  it('warns when embedded Cursor rule content exceeds the 500-line guideline', async () => {
    const projectDir = createTempProject()
    mkdirSync(resolve(projectDir, 'skills/my-skill'), { recursive: true })

    writeFileSync(
      resolve(projectDir, 'pluxx.config.json'),
      JSON.stringify({
        name: 'test-plugin',
        version: '0.1.0',
        description: 'test',
        author: { name: 'Test Author' },
        skills: './skills/',
        targets: ['cursor'],
        platforms: {
          cursor: {
            rules: [
              {
                description: 'Very long rule',
                alwaysApply: true,
                content: Array.from({ length: 550 }, (_, index) => `Line ${index + 1}`).join('\n'),
              },
            ],
          },
        },
      }, null, 2),
    )

    writeFileSync(
      resolve(projectDir, 'skills/my-skill/SKILL.md'),
      [
        '---',
        'name: my-skill',
        'description: "A valid skill"',
        '---',
        '',
        '# My Skill',
      ].join('\n'),
    )

    const result = await lintProject(projectDir)
    expect(result.issues.some(issue => issue.code === 'platform-rules-lines' && issue.platform === 'cursor')).toBe(true)
  })

  it('enforces OpenCode skill limits through shared platform limits', async () => {
    const projectDir = createTempProject()
    mkdirSync(resolve(projectDir, 'skills/wrong-dir'), { recursive: true })

    writeFileSync(
      resolve(projectDir, 'pluxx.config.json'),
      JSON.stringify({
        name: 'test-plugin',
        version: '0.1.0',
        description: 'test',
        author: { name: 'Test Author' },
        skills: './skills/',
        targets: ['opencode'],
      }, null, 2),
    )

    writeFileSync(
      resolve(projectDir, 'skills/wrong-dir/SKILL.md'),
      [
        '---',
        'name: my-skill',
        `description: "${'x'.repeat(1100)}"`,
        '---',
        '',
        '# My Skill',
      ].join('\n'),
    )

    const result = await lintProject(projectDir)
    expect(result.issues.some(issue => issue.code === 'skill-name-dir-mismatch' && issue.platform === 'opencode')).toBe(true)
    expect(result.issues.some(issue => issue.code === 'skill-description-length' && issue.platform === 'opencode')).toBe(true)
  })

  // ── Gotcha #1: Plugin dirs nested inside .claude-plugin/ ──
  it('reports error when plugin directories are nested inside .claude-plugin/', async () => {
    const projectDir = createTempProject()
    mkdirSync(resolve(projectDir, '.claude-plugin/skills'), { recursive: true })
    mkdirSync(resolve(projectDir, 'skills/my-skill'), { recursive: true })

    writeFileSync(
      resolve(projectDir, 'pluxx.config.json'),
      JSON.stringify({
        name: 'test-plugin',
        version: '0.1.0',
        description: 'test',
        author: { name: 'Test Author' },
        skills: './skills/',
        targets: ['claude-code'],
      }, null, 2),
    )

    writeFileSync(
      resolve(projectDir, 'skills/my-skill/SKILL.md'),
      ['---', 'name: my-skill', 'description: "A skill"', '---', '', '# Skill'].join('\n'),
    )

    const result = await lintProject(projectDir)
    expect(result.issues.some(issue => issue.code === 'plugin-dir-nested')).toBe(true)
  })

  // ── Gotcha #2 & #3: Manifest path prefix and traversal ──
  it('reports error when config paths lack ./ prefix or contain ../', async () => {
    const projectDir = createTempProject()
    mkdirSync(resolve(projectDir, 'skills/my-skill'), { recursive: true })

    writeFileSync(
      resolve(projectDir, 'pluxx.config.json'),
      JSON.stringify({
        name: 'test-plugin',
        version: '0.1.0',
        description: 'test',
        author: { name: 'Test Author' },
        skills: 'skills/',
        targets: ['claude-code'],
      }, null, 2),
    )

    writeFileSync(
      resolve(projectDir, 'skills/my-skill/SKILL.md'),
      ['---', 'name: my-skill', 'description: "A skill"', '---', '', '# Skill'].join('\n'),
    )

    const result = await lintProject(projectDir)
    expect(result.issues.some(issue => issue.code === 'manifest-path-prefix')).toBe(true)
  })

  // ── Gotcha #4: Plugin name must be kebab-case ──
  it('reports error for non-kebab-case plugin name', async () => {
    const projectDir = createTempProject()
    mkdirSync(resolve(projectDir, 'skills/my-skill'), { recursive: true })

    writeFileSync(
      resolve(projectDir, 'pluxx.config.json'),
      JSON.stringify({
        name: 'My Plugin',
        version: '0.1.0',
        description: 'test',
        author: { name: 'Test Author' },
        skills: './skills/',
        targets: ['claude-code'],
      }, null, 2),
    )

    writeFileSync(
      resolve(projectDir, 'skills/my-skill/SKILL.md'),
      ['---', 'name: my-skill', 'description: "A skill"', '---', '', '# Skill'].join('\n'),
    )

    const result = await lintProject(projectDir)
    // The schema also rejects this at parse time, but if it got through the lint would catch it
    expect(result.errors).toBeGreaterThan(0)
  })

  // ── Gotcha #5: Validate hook event names ──
  it('warns on unknown hook event names', async () => {
    const projectDir = createTempProject()
    mkdirSync(resolve(projectDir, 'skills/my-skill'), { recursive: true })

    writeFileSync(
      resolve(projectDir, 'pluxx.config.json'),
      JSON.stringify({
        name: 'test-plugin',
        version: '0.1.0',
        description: 'test',
        author: { name: 'Test Author' },
        skills: './skills/',
        targets: ['claude-code'],
        hooks: {
          onSave: [{ command: 'echo saved' }],
        },
      }, null, 2),
    )

    writeFileSync(
      resolve(projectDir, 'skills/my-skill/SKILL.md'),
      ['---', 'name: my-skill', 'description: "A skill"', '---', '', '# Skill'].join('\n'),
    )

    const result = await lintProject(projectDir)
    expect(result.issues.some(issue => issue.code === 'hook-event-unknown')).toBe(true)
  })

  it('accepts refreshed Claude hook events and richer hook types', async () => {
    const projectDir = createTempProject()
    mkdirSync(resolve(projectDir, 'skills/my-skill'), { recursive: true })

    writeFileSync(
      resolve(projectDir, 'pluxx.config.json'),
      JSON.stringify({
        name: 'test-plugin',
        version: '0.1.0',
        description: 'test',
        author: { name: 'Test Author' },
        skills: './skills/',
        targets: ['claude-code'],
        hooks: {
          setup: [{ type: 'mcp_tool', server: 'memory', tool: 'load_context' }],
          userPromptExpansion: [{ type: 'agent', prompt: 'Check whether this command should expand.' }],
          postToolBatch: [{ type: 'http', url: 'https://example.com/hooks/post-tool-batch' }],
        },
      }, null, 2),
    )

    writeFileSync(
      resolve(projectDir, 'skills/my-skill/SKILL.md'),
      ['---', 'name: my-skill', 'description: "A skill"', '---', '', '# Skill'].join('\n'),
    )

    const result = await lintProject(projectDir)
    expect(result.issues.some(issue => issue.code === 'hook-event-unknown')).toBe(false)
    expect(result.issues.some(issue => issue.code === 'hook-type-invalid')).toBe(false)
  })

  // ── Gotcha #7: Agent forbidden frontmatter ──
  it('warns when agent files use forbidden frontmatter fields', async () => {
    const projectDir = createTempProject()
    mkdirSync(resolve(projectDir, 'skills/my-skill'), { recursive: true })
    mkdirSync(resolve(projectDir, 'agents'), { recursive: true })

    writeFileSync(
      resolve(projectDir, 'pluxx.config.json'),
      JSON.stringify({
        name: 'test-plugin',
        version: '0.1.0',
        description: 'test',
        author: { name: 'Test Author' },
        skills: './skills/',
        targets: ['claude-code'],
      }, null, 2),
    )

    writeFileSync(
      resolve(projectDir, 'skills/my-skill/SKILL.md'),
      ['---', 'name: my-skill', 'description: "A skill"', '---', '', '# Skill'].join('\n'),
    )

    writeFileSync(
      resolve(projectDir, 'agents/my-agent.md'),
      ['---', 'name: my-agent', 'hooks: true', 'mcpServers: server1', 'permissionMode: auto', '---', '', '# Agent'].join('\n'),
    )

    const result = await lintProject(projectDir)
    const forbiddenIssues = result.issues.filter(i => i.code === 'agent-forbidden-frontmatter')
    expect(forbiddenIssues.length).toBe(3)
  })

  // ── Gotcha #8: Agent isolation must be "worktree" ──
  it('reports error when agent isolation is not worktree', async () => {
    const projectDir = createTempProject()
    mkdirSync(resolve(projectDir, 'skills/my-skill'), { recursive: true })
    mkdirSync(resolve(projectDir, 'agents'), { recursive: true })

    writeFileSync(
      resolve(projectDir, 'pluxx.config.json'),
      JSON.stringify({
        name: 'test-plugin',
        version: '0.1.0',
        description: 'test',
        author: { name: 'Test Author' },
        skills: './skills/',
        targets: ['claude-code'],
      }, null, 2),
    )

    writeFileSync(
      resolve(projectDir, 'skills/my-skill/SKILL.md'),
      ['---', 'name: my-skill', 'description: "A skill"', '---', '', '# Skill'].join('\n'),
    )

    writeFileSync(
      resolve(projectDir, 'agents/isolated-agent.md'),
      ['---', 'name: isolated-agent', 'isolation: container', '---', '', '# Agent'].join('\n'),
    )

    const result = await lintProject(projectDir)
    expect(result.issues.some(issue => issue.code === 'agent-isolation-invalid')).toBe(true)
  })

  it('warns when agent fields degrade on Cursor, Codex, and OpenCode', async () => {
    const projectDir = createTempProject()
    mkdirSync(resolve(projectDir, 'skills/my-skill'), { recursive: true })
    mkdirSync(resolve(projectDir, 'agents'), { recursive: true })

    writeFileSync(
      resolve(projectDir, 'pluxx.config.json'),
      JSON.stringify({
        name: 'test-plugin',
        version: '0.1.0',
        description: 'test',
        author: { name: 'Test Author' },
        skills: './skills/',
        agents: './agents/',
        targets: ['cursor', 'codex', 'opencode'],
      }, null, 2),
    )

    writeFileSync(
      resolve(projectDir, 'skills/my-skill/SKILL.md'),
      ['---', 'name: my-skill', 'description: "A skill"', '---', '', '# Skill'].join('\n'),
    )

    writeFileSync(
      resolve(projectDir, 'agents/review.md'),
      [
        '---',
        'name: review',
        'description: "Review agent"',
        'mode: subagent',
        'hidden: true',
        'model_reasoning_effort: high',
        'sandbox_mode: workspace-write',
        'steps: 5',
        'topP: 0.25',
        'skills: research',
        'memory: "project"',
        'background: true',
        'isolation: worktree',
        'permission:',
        '  edit: deny',
        '---',
        '',
        '# Review',
      ].join('\n'),
    )

    const result = await lintProject(projectDir)
    const cursorIssue = result.issues.find(issue => issue.code === 'cursor-agent-translation')
    const codexIssue = result.issues.find(issue => issue.code === 'codex-agent-translation')
    const opencodeIssue = result.issues.find(issue => issue.code === 'opencode-agent-translation')

    expect(cursorIssue?.message).toContain('"mode"')
    expect(cursorIssue?.message).toContain('"model_reasoning_effort"')
    expect(cursorIssue?.message).toContain('"sandbox_mode"')
    expect(cursorIssue?.message).toContain('"steps"')
    expect(cursorIssue?.message).toContain('"topP"')
    expect(cursorIssue?.message).toContain('"permission"')

    expect(codexIssue?.message).toContain('"mode"')
    expect(codexIssue?.message).toContain('"steps"')
    expect(codexIssue?.message).toContain('"topP"')
    expect(codexIssue?.message).toContain('"permission"')
    expect(codexIssue?.message).not.toContain('"model_reasoning_effort"')
    expect(codexIssue?.message).not.toContain('"sandbox_mode"')

    expect(opencodeIssue?.message).toContain('"model_reasoning_effort"')
    expect(opencodeIssue?.message).toContain('"sandbox_mode"')
    expect(opencodeIssue?.message).toContain('"skills"')
    expect(opencodeIssue?.message).toContain('"memory"')
    expect(opencodeIssue?.message).toContain('"background"')
    expect(opencodeIssue?.message).toContain('"isolation"')
  })

  // ── Gotcha #9: Warn on absolute paths in hooks ──
  it('warns when hooks use absolute paths', async () => {
    const projectDir = createTempProject()
    mkdirSync(resolve(projectDir, 'skills/my-skill'), { recursive: true })

    writeFileSync(
      resolve(projectDir, 'pluxx.config.json'),
      JSON.stringify({
        name: 'test-plugin',
        version: '0.1.0',
        description: 'test',
        author: { name: 'Test Author' },
        skills: './skills/',
        targets: ['claude-code'],
        hooks: {
          sessionStart: [{ command: '/usr/local/bin/my-hook' }],
        },
      }, null, 2),
    )

    writeFileSync(
      resolve(projectDir, 'skills/my-skill/SKILL.md'),
      ['---', 'name: my-skill', 'description: "A skill"', '---', '', '# Skill'].join('\n'),
    )

    const result = await lintProject(projectDir)
    expect(result.issues.some(issue => issue.code === 'hook-absolute-path')).toBe(true)
  })

  // ── Gotcha #11: settings.json unknown keys ──
  it('warns on unknown keys in settings.json', async () => {
    const projectDir = createTempProject()
    mkdirSync(resolve(projectDir, 'skills/my-skill'), { recursive: true })

    writeFileSync(
      resolve(projectDir, 'pluxx.config.json'),
      JSON.stringify({
        name: 'test-plugin',
        version: '0.1.0',
        description: 'test',
        author: { name: 'Test Author' },
        skills: './skills/',
        targets: ['claude-code'],
      }, null, 2),
    )

    writeFileSync(
      resolve(projectDir, 'skills/my-skill/SKILL.md'),
      ['---', 'name: my-skill', 'description: "A skill"', '---', '', '# Skill'].join('\n'),
    )

    writeFileSync(
      resolve(projectDir, 'settings.json'),
      JSON.stringify({ agent: {}, theme: 'dark', debug: true }),
    )

    const result = await lintProject(projectDir)
    const settingsIssues = result.issues.filter(i => i.code === 'settings-unknown-key')
    expect(settingsIssues.length).toBe(2)
  })

  // ── Gotcha #12: Version semver validation ──
  it('reports error for non-semver version', async () => {
    const projectDir = createTempProject()
    mkdirSync(resolve(projectDir, 'skills/my-skill'), { recursive: true })

    writeFileSync(
      resolve(projectDir, 'pluxx.config.json'),
      JSON.stringify({
        name: 'test-plugin',
        version: '1.0',
        description: 'test',
        author: { name: 'Test Author' },
        skills: './skills/',
        targets: ['claude-code'],
      }, null, 2),
    )

    writeFileSync(
      resolve(projectDir, 'skills/my-skill/SKILL.md'),
      ['---', 'name: my-skill', 'description: "A skill"', '---', '', '# Skill'].join('\n'),
    )

    const result = await lintProject(projectDir)
    expect(result.issues.some(issue => issue.code === 'version-semver')).toBe(true)
  })

  // ── Commands are a first-class optional surface ──
  it('does not warn when commands/ directory exists alongside skills', async () => {
    const projectDir = createTempProject()
    mkdirSync(resolve(projectDir, 'skills/my-skill'), { recursive: true })
    mkdirSync(resolve(projectDir, 'commands'), { recursive: true })

    writeFileSync(
      resolve(projectDir, 'pluxx.config.json'),
      JSON.stringify({
        name: 'test-plugin',
        version: '0.1.0',
        description: 'test',
        author: { name: 'Test Author' },
        skills: './skills/',
        targets: ['claude-code'],
      }, null, 2),
    )

    writeFileSync(
      resolve(projectDir, 'skills/my-skill/SKILL.md'),
      ['---', 'name: my-skill', 'description: "A skill"', '---', '', '# Skill'].join('\n'),
    )

    const result = await lintProject(projectDir)
    expect(result.issues.some(issue => issue.code === 'commands-legacy')).toBe(false)
  })

  it('does not warn about commands/ when Claude Code is not a target', async () => {
    const projectDir = createTempProject()
    mkdirSync(resolve(projectDir, 'skills/my-skill'), { recursive: true })
    mkdirSync(resolve(projectDir, 'commands'), { recursive: true })

    writeFileSync(
      resolve(projectDir, 'pluxx.config.json'),
      JSON.stringify({
        name: 'test-plugin',
        version: '0.1.0',
        description: 'test',
        author: { name: 'Test Author' },
        skills: './skills/',
        targets: ['cursor'],
      }, null, 2),
    )

    writeFileSync(
      resolve(projectDir, 'skills/my-skill/SKILL.md'),
      ['---', 'name: my-skill', 'description: "A skill"', '---', '', '# Skill'].join('\n'),
    )

    const result = await lintProject(projectDir)
    expect(result.issues.some(issue => issue.code === 'commands-legacy')).toBe(false)
  })

  it('warns when Codex command fields degrade into routing guidance only', async () => {
    const projectDir = createTempProject()
    mkdirSync(resolve(projectDir, 'skills/my-skill'), { recursive: true })
    mkdirSync(resolve(projectDir, 'commands'), { recursive: true })

    writeFileSync(
      resolve(projectDir, 'pluxx.config.json'),
      JSON.stringify({
        name: 'test-plugin',
        version: '0.1.0',
        description: 'test',
        author: { name: 'Test Author' },
        skills: './skills/',
        commands: './commands/',
        targets: ['codex'],
      }, null, 2),
    )

    writeFileSync(
      resolve(projectDir, 'skills/my-skill/SKILL.md'),
      ['---', 'name: my-skill', 'description: "A skill"', '---', '', '# Skill'].join('\n'),
    )

    writeFileSync(
      resolve(projectDir, 'commands/research.md'),
      [
        '---',
        'description: Run research',
        'when_to_use: Use when routed research needs a specialist.',
        'argument-hint: [company]',
        'agent: escalation',
        'subtask: true',
        'model: gpt-5',
        'context: fork',
        '---',
        '',
        '# Research',
        '',
        'Do the work.',
      ].join('\n'),
    )

    const result = await lintProject(projectDir)
    expect(result.issues.some(issue => issue.code === 'codex-command-translation')).toBe(true)
    expect(result.issues.some(issue => issue.code === 'codex-command-translation' && issue.message.includes('"when_to_use"'))).toBe(true)
    expect(result.issues.some(issue => issue.code === 'codex-command-translation' && issue.message.includes('"argument-hint"'))).toBe(true)
    expect(result.issues.some(issue => issue.code === 'codex-command-translation' && issue.message.includes('"agent"'))).toBe(true)
    expect(result.issues.some(issue => issue.code === 'codex-command-translation' && issue.message.includes('"subtask"'))).toBe(true)
    expect(result.issues.some(issue => issue.code === 'codex-command-translation' && issue.message.includes('"model"'))).toBe(true)
    expect(result.issues.some(issue => issue.code === 'codex-command-translation' && issue.message.includes('"context"'))).toBe(true)
  })

  // ── Gotcha #15 & #16: Codex agents min threads/depth ──
  it('reports error when Codex agents.max_threads or max_depth is below minimum', async () => {
    const projectDir = createTempProject()
    mkdirSync(resolve(projectDir, 'skills/my-skill'), { recursive: true })

    writeFileSync(
      resolve(projectDir, 'pluxx.config.json'),
      JSON.stringify({
        name: 'test-plugin',
        version: '0.1.0',
        description: 'test',
        author: { name: 'Test Author' },
        skills: './skills/',
        targets: ['codex'],
        platforms: {
          codex: {
            agents: { max_threads: 0, max_depth: 0 },
          },
        },
      }, null, 2),
    )

    writeFileSync(
      resolve(projectDir, 'skills/my-skill/SKILL.md'),
      ['---', 'name: my-skill', 'description: "A skill"', '---', '', '# Skill'].join('\n'),
    )

    const result = await lintProject(projectDir)
    expect(result.issues.some(issue => issue.code === 'codex-agents-max-threads')).toBe(true)
    expect(result.issues.some(issue => issue.code === 'codex-agents-max-depth')).toBe(true)
  })

  // ── Gotcha #18: Codex hooks may still depend on a host feature gate ──
  it('warns when Codex hooks are configured without the current Codex hooks feature flag', async () => {
    const projectDir = createTempProject()
    mkdirSync(resolve(projectDir, 'skills/my-skill'), { recursive: true })

    writeFileSync(
      resolve(projectDir, 'pluxx.config.json'),
      JSON.stringify({
        name: 'test-plugin',
        version: '0.1.0',
        description: 'test',
        author: { name: 'Test Author' },
        skills: './skills/',
        targets: ['codex'],
        hooks: {
          sessionStart: [{ command: 'echo start' }],
        },
      }, null, 2),
    )

    writeFileSync(
      resolve(projectDir, 'skills/my-skill/SKILL.md'),
      ['---', 'name: my-skill', 'description: "A skill"', '---', '', '# Skill'].join('\n'),
    )

    const result = await lintProject(projectDir)
    expect(result.issues.some(issue => issue.code === 'codex-hooks-external-config')).toBe(true)
  })

  it('does not warn for supported Codex canonical hook aliases when the current feature flag is enabled', async () => {
    const projectDir = createTempProject()
    mkdirSync(resolve(projectDir, 'skills/my-skill'), { recursive: true })

    writeFileSync(
      resolve(projectDir, 'pluxx.config.json'),
      JSON.stringify({
        name: 'test-plugin',
        version: '0.1.0',
        description: 'test',
        author: { name: 'Test Author' },
        skills: './skills/',
        targets: ['codex'],
        hooks: {
          sessionStart: [{ command: 'echo start' }],
          beforeSubmitPrompt: [{ command: 'echo prompt' }],
        },
        platforms: {
          codex: {
            features: { hooks: true },
          },
        },
      }, null, 2),
    )

    writeFileSync(
      resolve(projectDir, 'skills/my-skill/SKILL.md'),
      ['---', 'name: my-skill', 'description: "A skill"', '---', '', '# Skill'].join('\n'),
    )

    const result = await lintProject(projectDir)
    expect(result.issues.some(issue => issue.code === 'codex-hooks-external-config')).toBe(false)
    expect(result.issues.some(issue => issue.code === 'codex-hooks-legacy-feature-flag')).toBe(false)
    expect(result.issues.some(issue => issue.code === 'codex-hook-event-unsupported')).toBe(false)
  })

  it('warns that general Codex hook flags do not enable plugin-bundled hooks by themselves', async () => {
    const projectDir = createTempProject()
    mkdirSync(resolve(projectDir, 'skills/my-skill'), { recursive: true })

    writeFileSync(
      resolve(projectDir, 'pluxx.config.json'),
      JSON.stringify({
        name: 'test-plugin',
        version: '0.1.0',
        description: 'test',
        author: { name: 'Test Author' },
        skills: './skills/',
        targets: ['codex'],
        hooks: {
          sessionStart: [{ command: 'echo start' }],
        },
        platforms: {
          codex: {
            features: { codex_hooks: true },
          },
        },
      }, null, 2),
    )

    writeFileSync(
      resolve(projectDir, 'skills/my-skill/SKILL.md'),
      ['---', 'name: my-skill', 'description: "A skill"', '---', '', '# Skill'].join('\n'),
    )

    const result = await lintProject(projectDir)
    expect(result.issues.some(issue => issue.code === 'codex-hooks-external-config')).toBe(true)
    expect(result.issues.some(issue => issue.code === 'codex-hooks-legacy-feature-flag')).toBe(true)
    expect(result.issues.some(issue => issue.code === 'codex-hooks-general-feature-flag-only')).toBe(true)
  })

  it('accepts plugin_hooks as the plugin-bundled Codex hook feature flag', async () => {
    const projectDir = createTempProject()
    mkdirSync(resolve(projectDir, 'skills/my-skill'), { recursive: true })

    writeFileSync(
      resolve(projectDir, 'pluxx.config.json'),
      JSON.stringify({
        name: 'test-plugin',
        version: '0.1.0',
        description: 'test',
        author: { name: 'Test Author' },
        skills: './skills/',
        targets: ['codex'],
        hooks: {
          sessionStart: [{ command: 'echo start' }],
        },
        platforms: {
          codex: {
            features: { plugin_hooks: true },
          },
        },
      }, null, 2),
    )

    writeFileSync(
      resolve(projectDir, 'skills/my-skill/SKILL.md'),
      ['---', 'name: my-skill', 'description: "A skill"', '---', '', '# Skill'].join('\n'),
    )

    const result = await lintProject(projectDir)
    expect(result.issues.some(issue => issue.code === 'codex-hooks-external-config')).toBe(false)
    expect(result.issues.some(issue => issue.code === 'codex-hooks-legacy-feature-flag')).toBe(false)
    expect(result.issues.some(issue => issue.code === 'codex-hooks-general-feature-flag-only')).toBe(false)
  })

  it('warns when runtime readiness depends on external Codex wiring or best-effort prompt scoping', async () => {
    const projectDir = createTempProject()
    mkdirSync(resolve(projectDir, 'skills/my-skill'), { recursive: true })

    writeFileSync(
      resolve(projectDir, 'pluxx.config.json'),
      JSON.stringify({
        name: 'test-plugin',
        version: '0.1.0',
        description: 'test',
        author: { name: 'Test Author' },
        skills: './skills/',
        targets: ['codex'],
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
              applyTo: ['mcp-tools', 'skills', 'commands'],
              skills: ['my-skill'],
              commands: ['review'],
            },
          ],
        },
      }, null, 2),
    )

    writeFileSync(
      resolve(projectDir, 'skills/my-skill/SKILL.md'),
      ['---', 'name: my-skill', 'description: "A skill"', '---', '', '# Skill'].join('\n'),
    )

    const result = await lintProject(projectDir)
    expect(result.issues.some(issue => issue.code === 'readiness-mcp-target-without-mcp')).toBe(true)
    expect(result.issues.some(issue => issue.code === 'readiness-commands-target-without-commands')).toBe(true)
    expect(result.issues.some(issue => issue.code === 'readiness-prompt-target-best-effort')).toBe(true)
    expect(result.issues.some(issue => issue.code === 'codex-readiness-external-config')).toBe(true)
  })

  it('reports unknown cursor hook, unsupported loop_limit, and unsupported skill frontmatter fields', async () => {
    const projectDir = createTempProject()
    mkdirSync(resolve(projectDir, 'skills/valid-skill'), { recursive: true })

    writeFileSync(
      resolve(projectDir, 'pluxx.config.json'),
      JSON.stringify({
        name: 'valid-plugin',
        version: '0.1.0',
        description: 'Valid plugin config',
        author: { name: 'Test Author' },
        skills: './skills/',
        hooks: {
          sessionStart: [
            {
              command: 'echo test',
              matcher: 'Bash',
            },
          ],
          unknownHook: [
            {
              command: 'echo test',
            },
          ],
          preToolUse: [
            {
              command: 'echo test',
              loop_limit: 3,
            },
          ],
          afterFileEdit: [
            {
              type: 'http',
              url: 'https://example.com/hooks/after-edit',
            },
          ],
          stop: [
            {
              command: 'echo stop',
              loop_limit: 3,
            },
          ],
        },
      }, null, 2),
    )

    writeFileSync(
      resolve(projectDir, 'skills/valid-skill/SKILL.md'),
      [
        '---',
        'name: valid-skill',
        'description: "A valid skill description"',
        'owner: team-platform',
        '---',
        '',
        '# Valid Skill',
      ].join('\n'),
    )

    const result = await lintProject(projectDir)
    expect(result.issues.filter(issue => issue.code === 'cursor-hook-event-unknown')).toHaveLength(1)
    expect(result.issues.some(issue => issue.code === 'cursor-hook-type-unsupported')).toBe(true)
    expect(result.issues.some(issue => issue.code === 'cursor-hook-loop-limit-unsupported-event')).toBe(true)
    expect(result.issues.some(issue => issue.code === 'cursor-skill-frontmatter-unsupported')).toBe(true)
  })

  it('warns about non-portable hook fields and richer frontmatter translations on Codex and OpenCode', async () => {
    const projectDir = createTempProject()
    mkdirSync(resolve(projectDir, 'skills/rich-skill'), { recursive: true })

    writeFileSync(
      resolve(projectDir, 'pluxx.config.json'),
      JSON.stringify({
        name: 'translation-fixture',
        version: '0.1.0',
        description: 'test',
        author: { name: 'Test Author' },
        skills: './skills/',
        commands: './commands/',
        hooks: {
          sessionStart: [
            {
              type: 'prompt',
              prompt: 'Prepare the session.',
            },
          ],
          beforeSubmitPrompt: [
            {
              type: 'prompt',
              prompt: 'Confirm the request before sending it.',
            },
          ],
          preToolUse: [
            {
              command: 'echo pretool',
              failClosed: true,
              loop_limit: 2,
            },
          ],
          notification: [
            {
              type: 'http',
              url: 'https://example.com/hooks/notify',
            },
          ],
        },
        targets: ['claude-code', 'codex', 'opencode'],
      }, null, 2),
    )

    mkdirSync(resolve(projectDir, 'commands'), { recursive: true })
    writeFileSync(resolve(projectDir, 'commands/run.md'), '# Run\n')

    writeFileSync(
      resolve(projectDir, 'skills/rich-skill/SKILL.md'),
      [
        '---',
        'name: rich-skill',
        'description: "A valid skill"',
        'when_to_use: "Use when deep analysis is needed"',
        'arguments: [target]',
        'user-invocable: false',
        'allowed-tools: Read',
        'model: claude-sonnet-4',
        'effort: high',
        'context: fork',
        'agent: Explore',
        '---',
        '',
        '# Rich Skill',
      ].join('\n'),
    )

    const result = await lintProject(projectDir)
    const claudePromptIssues = result.issues.filter(issue => issue.code === 'claude-prompt-hook-degrade')
    expect(claudePromptIssues).toHaveLength(1)
    expect(claudePromptIssues[0]?.message).toContain('SessionStart')
    expect(result.issues.some(issue => issue.code === 'claude-prompt-hook-degrade')).toBe(true)
    expect(result.issues.some(issue => issue.code === 'codex-prompt-hook-drop')).toBe(true)
    expect(result.issues.some(issue => issue.code === 'opencode-prompt-hook-drop')).toBe(true)
    expect(result.issues.some(issue => issue.code === 'codex-hook-type-drop' && issue.message.includes('http hooks'))).toBe(true)
    expect(result.issues.some(issue => issue.code === 'opencode-hook-type-drop' && issue.message.includes('http hooks'))).toBe(true)
    expect(result.issues.some(issue => issue.code === 'claude-hook-failclosed-degrade')).toBe(true)
    expect(result.issues.some(issue => issue.code === 'codex-hook-failclosed-drop')).toBe(true)
    expect(result.issues.some(issue => issue.code === 'codex-hook-loop-limit-drop')).toBe(true)
    expect(result.issues.some(issue => issue.code === 'opencode-hook-loop-limit-drop')).toBe(true)
    expect(result.issues.some(issue => issue.code === 'codex-skill-frontmatter-translation' && issue.message.includes('arguments'))).toBe(true)
    expect(result.issues.some(issue => issue.code === 'codex-skill-frontmatter-translation' && issue.message.includes('when_to_use'))).toBe(true)
    expect(result.issues.some(issue => issue.code === 'codex-skill-frontmatter-translation' && issue.message.includes('model'))).toBe(true)
    expect(result.issues.some(issue => issue.code === 'opencode-skill-frontmatter-translation' && issue.message.includes('arguments'))).toBe(true)
    expect(result.issues.some(issue => issue.code === 'opencode-skill-frontmatter-translation' && issue.message.includes('user-invocable'))).toBe(true)
    expect(result.issues.some(issue => issue.code === 'opencode-skill-frontmatter-translation' && issue.message.includes('effort'))).toBe(true)
  })
})
