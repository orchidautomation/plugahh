import { existsSync } from 'fs'
import { relative } from 'path'
import { Generator } from '../base'
import type { TargetPlatform } from '../../schema'
import { collectPermissionRules } from '../../permissions'
import { readInstructionsContent } from '../../instructions'
import {
  planCodexPermissionCompanion,
  renderCodexPermissionCompanion,
} from '../../codex-permissions-companion'
import { buildGeneratedReadinessScript, getRuntimeReadinessPlan } from '../../readiness'
import {
  getEnabledRuntimeReadinessBindings,
  getRuntimeReadinessCapability,
  getRuntimeReadinessExternalConfigNote,
} from '../../runtime-readiness-registry'
import {
  ALTERNATE_CODEX_HOOKS_FEATURE_FLAG,
  PLUGIN_BUNDLED_CODEX_HOOKS_FEATURE_FLAG,
  RECOMMENDED_CODEX_HOOKS_FEATURE_FLAG,
} from '../../codex-hooks-feature'
import { getCanonicalAgentMetadata, readCanonicalAgentFiles } from '../../agents'
import { getAgentTranslationMessage, getTranslatedAgentFields } from '../../agent-translation-registry'
import { getCanonicalCommandMetadata, readCanonicalCommandFiles } from '../../commands'
import { buildCodexCommandRoutingEntry, getCodexCommandGuidanceNote } from '../../command-translation-registry'
import { buildDelegationBehaviorNotes } from '../../delegation'
import { mapHookEventToPascalCase } from '../../hook-events'
import {
  getHookTypeTranslationIssue,
  isHookFieldPreserved,
  getSupportedHookEvents,
  getUnsupportedHookEventReason,
  isHookEventSupported,
  isHookTypeSupported,
} from '../../hook-translation-registry'
import { buildHookCommandWrapperScript } from '../../hook-command-env'
import { getCanonicalSkillMetadata, readCanonicalSkillFiles } from '../../skills'
import { getNativeCodexMcpEntryOverride } from '../../mcp-native-overrides'
import { warnDroppedHookFields } from '../hooks-warning'

interface CodexHookHandler {
  type: 'command'
  command: string
  timeout?: number
}

interface CodexHookMatcherGroup {
  matcher?: string
  hooks: CodexHookHandler[]
}

export class CodexGenerator extends Generator {
  readonly platform: TargetPlatform = 'codex'

  async generate(): Promise<void> {
    await Promise.all([
      this.generateManifest(),
      this.generateAppConfig(),
      this.generateMcpConfig('.mcp.json', {
        includeDefaultAuthHeaders: false,
        transformRemoteEntry: ({ name, server }) => {
          const entry: Record<string, unknown> = {
            url: server.url,
          }

          const nativeOverride = getNativeCodexMcpEntryOverride(this.config, name)
          if (nativeOverride) {
            Object.assign(entry, nativeOverride)
          } else if (server.auth?.type === 'bearer' && server.auth.envVar) {
            entry.bearer_token_env_var = server.auth.envVar
          } else if (server.auth?.type === 'header' && server.auth.envVar) {
            const isBearerAuthorizationHeader =
              server.auth.headerName === 'Authorization'
              && server.auth.headerTemplate === 'Bearer ${value}'

            if (isBearerAuthorizationHeader) {
              entry.bearer_token_env_var = server.auth.envVar
            } else if (server.auth.headerTemplate === '${value}') {
              entry.env_http_headers = {
                [server.auth.headerName]: server.auth.envVar,
              }
            } else if (!server.auth.headerTemplate.includes('${value}')) {
              entry.http_headers = {
                [server.auth.headerName]: server.auth.headerTemplate,
              }
            } else {
              console.warn(
                `[pluxx] codex generator: MCP server "${name}" uses auth.type "header" with a templated header Codex cannot express exactly. `
                + 'Supported Codex auth outputs are bearer_token_env_var, env_http_headers, and http_headers; this header was omitted.'
              )
            }
          }

          return entry
        },
      }),
      this.generateAgentsMd(),
      this.generateNativeAgents(),
      this.generateHooksCompanion(),
      this.generateReadinessCompanion(),
      this.generateCommandsCompanion(),
      this.generateSkillsCompanion(),
      this.generatePermissionsCompanion(),
    ])

    this.copySkills()
    this.copyAgents()
    this.copyScripts()
    this.copyAssets()
    this.copyPassthrough()
  }

  private async generateManifest(): Promise<void> {
    const manifest: Record<string, unknown> = {
      name: this.config.name,
      version: this.config.version,
      description: this.config.description,
      author: this.config.author,
    }

    if (this.config.repository) manifest.homepage = this.config.repository
    if (this.config.repository) manifest.repository = this.config.repository
    if (this.config.license) manifest.license = this.config.license
    if (this.config.keywords) manifest.keywords = this.config.keywords

    manifest.skills = './skills/'
    if (this.config.mcp) manifest.mcpServers = './.mcp.json'
    if (this.config.platforms?.codex?.app) manifest.apps = './.app.json'
    if (this.config.hooks || getRuntimeReadinessPlan(this.config.readiness).hasReadiness) {
      manifest.hooks = './hooks/hooks.json'
    }

    // Codex supports rich interface metadata
    if (this.config.brand) {
      const iface: Record<string, unknown> = {
        displayName: this.config.brand.displayName,
        shortDescription: this.config.brand.shortDescription ?? this.config.description,
        category: this.config.brand.category,
      }

      if (this.config.brand.longDescription) {
        iface.longDescription = this.config.brand.longDescription
      }
      if (this.config.brand.color) {
        iface.brandColor = this.config.brand.color
      }
      if (this.config.brand.icon) {
        iface.composerIcon = this.config.brand.icon
        iface.logo = this.config.brand.icon
      }
      if (this.config.brand.defaultPrompts) {
        iface.defaultPrompt = this.config.brand.defaultPrompts
      }
      if (this.config.brand.websiteURL) {
        iface.websiteURL = this.config.brand.websiteURL
      }
      if (this.config.brand.privacyPolicyURL) {
        iface.privacyPolicyURL = this.config.brand.privacyPolicyURL
      }
      if (this.config.brand.termsOfServiceURL) {
        iface.termsOfServiceURL = this.config.brand.termsOfServiceURL
      }
      if (this.config.brand.screenshots) {
        iface.screenshots = this.config.brand.screenshots
      }

      // Merge Codex-specific interface overrides
      const codexOverrides = this.config.platforms?.codex?.interface
      if (codexOverrides) {
        Object.assign(iface, codexOverrides)
      }

      iface.developerName = this.config.author.name

      manifest.interface = iface
    }

    await this.writeJson('.codex-plugin/plugin.json', manifest)
  }

  private async generateAppConfig(): Promise<void> {
    const appConfig = this.config.platforms?.codex?.app
    if (!appConfig || typeof appConfig !== 'object' || Array.isArray(appConfig)) return

    await this.writeJson('.app.json', appConfig as Record<string, unknown>)
  }

  private async generatePermissionsCompanion(): Promise<void> {
    const compilerIntent = this.getCompilerIntent()
    const rules = collectPermissionRules(this.config.permissions)
    const skillPolicies = compilerIntent?.skillPolicies ?? []
    if (rules.length === 0 && skillPolicies.length === 0) return

    const codexPermissionCompanion = renderCodexPermissionCompanion(
      planCodexPermissionCompanion(this.config, this.rootDir),
    )

    await this.writeJson('.codex/permissions.generated.json', {
      model: 'pluxx.permissions.v1',
      enforcedByPluginBundle: false,
      note: skillPolicies.length > 0
        ? `Codex permissions are configured externally. Use this file as a generated mirror of canonical rules for Codex user/admin policy or hook configuration.${codexPermissionCompanion ? ' Pluxx also emits .codex/config.generated.toml for the live-proven MCP allow-path when it can materialize per-tool approval stanzas.' : ''} skillPolicies preserves migrated skill-scoped intent that cannot yet be enforced directly by the plugin bundle.`
        : `Codex permissions are configured externally. Use this file as a generated mirror of canonical rules for Codex user/admin policy or hook configuration.${codexPermissionCompanion ? ' Pluxx also emits .codex/config.generated.toml for the live-proven MCP allow-path when it can materialize per-tool approval stanzas.' : ''}`,
      rules,
      ...(skillPolicies.length > 0 ? { skillPolicies } : {}),
    })

    if (codexPermissionCompanion) {
      await this.writeFile('.codex/config.generated.toml', codexPermissionCompanion)
    }
  }

  private async generateAgentsMd(): Promise<void> {
    const sections: string[] = []

    const instructions = await readInstructionsContent(this.rootDir, this.config)
    if (instructions?.trim()) {
      sections.push(instructions.trim())
    }

    const commandsSection = this.buildCodexCommandRoutingSection()
    if (commandsSection) {
      sections.push(commandsSection)
    }

    if (sections.length === 0) return
    await this.writeFile('AGENTS.md', sections.join('\n\n').trim() + '\n')
  }

  private async generateNativeAgents(): Promise<void> {
    if (!this.config.agents) return

    const agentsDir = this.resolveConfigPath(this.config.agents, 'agents')
    const agents = readCanonicalAgentFiles(agentsDir)
    if (agents.length === 0) return

    for (const agent of agents) {
      const metadata = getCanonicalAgentMetadata(agent)
      const relativePath = relative(agentsDir, agent.filePath).replace(/\\/g, '/').replace(/\.md$/i, '.toml')
      const lines = [
        `name = ${JSON.stringify(metadata.name)}`,
        `description = ${JSON.stringify(metadata.description)}`,
      ]

      if (metadata.model) {
        lines.push(`model = ${JSON.stringify(metadata.model)}`)
      }
      if (metadata.modelReasoningEffort) {
        lines.push(`model_reasoning_effort = ${JSON.stringify(metadata.modelReasoningEffort)}`)
      }
      if (metadata.sandboxMode) {
        lines.push(`sandbox_mode = ${JSON.stringify(metadata.sandboxMode)}`)
      }
      const delegationNotes = buildDelegationBehaviorNotes(agent.frontmatter)
      const fieldTranslationNote = getAgentTranslationMessage('codex', getTranslatedAgentFields('codex', metadata))
      const developerInstructions = [
        ...(fieldTranslationNote
          ? [
              'Host translation note:',
              `- ${fieldTranslationNote}`,
              '',
            ]
          : []),
        ...(delegationNotes.length > 0
          ? [
              'Delegation contract:',
              ...delegationNotes.map((note) => `- ${note}`),
              '',
            ]
          : []),
        metadata.body,
      ].filter(Boolean).join('\n')

      if (developerInstructions) {
        lines.push('developer_instructions = """')
        lines.push(developerInstructions.replace(/"""/g, '\\"\\"\\"'))
        lines.push('"""')
      }
      lines.push('')

      await this.writeFile(`.codex/agents/${relativePath}`, lines.join('\n'))
    }
  }

  private async generateHooksCompanion(): Promise<void> {
    const readinessPlan = getRuntimeReadinessPlan(this.config.readiness)
    const readinessCapability = getRuntimeReadinessCapability('codex')
    if (!this.config.hooks && !readinessPlan.hasReadiness) return

    const hooks: Record<string, CodexHookMatcherGroup[]> = {}
    const unsupported: Array<Record<string, string>> = []
    let nextWrapperIndex = 0

    if (readinessPlan.hasReadiness && this.config.readiness) {
      await this.writeFile('.codex/pluxx-readiness.mjs', buildGeneratedReadinessScript(this.config.readiness))

      for (const binding of getEnabledRuntimeReadinessBindings(readinessCapability, readinessPlan)) {
        hooks[binding.event] = [
          ...(hooks[binding.event] ?? []),
          this.buildCodexCommandHookGroup(binding.event, binding.command, binding.matcher),
        ]
      }
    }

    for (const [event, entries] of Object.entries(this.config.hooks ?? {})) {
      if (!entries || entries.length === 0) continue

      const codexEvent = mapHookEventToPascalCase(event)
      if (!isHookEventSupported('codex', codexEvent)) {
        for (const entry of entries) {
          const entryType = entry.type ?? 'command'
          unsupported.push({
            canonicalEvent: event,
            codexEvent,
            ...(entryType !== 'command' ? { type: entryType } : {}),
            reason: getUnsupportedHookEventReason('codex')
              ?? `Codex currently documents only ${getSupportedHookEvents('codex').join(', ')} for hook configuration.`,
          })
        }
        continue
      }

      warnDroppedHookFields(this.platform, codexEvent, entries)

      const mappedEntries: CodexHookMatcherGroup[] = []
      for (const entry of entries) {
        const entryType = entry.type ?? 'command'
        if (!isHookTypeSupported('codex', entryType)) {
          const issue = entryType === 'command' ? null : getHookTypeTranslationIssue('codex', entryType)
          unsupported.push({
            canonicalEvent: event,
            codexEvent,
            type: entryType,
            reason: issue?.message ?? `Codex currently bundles only command-hook entries from Pluxx. ${entryType} hooks will be dropped from the generated Codex bundle.`,
          })
          continue
        }

        if (!entry.command) continue

        nextWrapperIndex += 1
        const relativePath = `hooks/pluxx-hook-command-${nextWrapperIndex}.sh`
        await this.writeFile(
          relativePath,
          buildHookCommandWrapperScript(entry.command.replace('${PLUGIN_ROOT}', '.'), 'CODEX_PLUGIN_ROOT'),
        )

        const matcher = typeof entry.matcher === 'string' && isHookFieldPreserved('codex', 'matcher', codexEvent)
          ? entry.matcher
          : undefined

        mappedEntries.push(this.buildCodexCommandHookGroup(
          codexEvent,
          `bash ./${relativePath}`,
          matcher,
          entry.timeout,
        ))
      }

      if (mappedEntries.length === 0) continue

      hooks[codexEvent] = [
        ...(hooks[codexEvent] ?? []),
        ...mappedEntries,
      ]
    }

    if (Object.keys(hooks).length === 0 && unsupported.length === 0) return

    await this.writeJson('hooks/hooks.json', {
      version: 1,
      hooks,
    })

    await this.writeJson('.codex/hooks.generated.json', {
      model: 'pluxx.codex-hooks.v1',
      enforcedByPluginBundle: true,
      pluginBundleFeatureFlag: PLUGIN_BUNDLED_CODEX_HOOKS_FEATURE_FLAG,
      generalFeatureFlag: RECOMMENDED_CODEX_HOOKS_FEATURE_FLAG,
      deprecatedGeneralFeatureFlag: ALTERNATE_CODEX_HOOKS_FEATURE_FLAG,
      note: 'Codex plugin-bundled hook configuration is bundled at hooks/hooks.json in the plugin and currently requires `[features].plugin_hooks = true`. The general `[features].hooks` flag covers non-plugin hook config and defaults on, while `codex_hooks` is deprecated and should not be treated as a plugin-bundled hook fallback. This companion mirror preserves the translated native event names, matcher groups, and command handlers while highlighting any dropped events or fields.',
      hooks,
      ...(unsupported.length > 0 ? { unsupported } : {}),
    })
  }

  private async generateReadinessCompanion(): Promise<void> {
    const readinessPlan = getRuntimeReadinessPlan(this.config.readiness)
    const readinessCapability = getRuntimeReadinessCapability('codex')
    if (!readinessPlan.hasReadiness || !this.config.readiness) return

    const translatedHooks = Object.fromEntries(
      getEnabledRuntimeReadinessBindings(readinessCapability, readinessPlan).map((binding) => [
        binding.gate === 'session-start'
          ? 'sessionStart'
          : binding.gate === 'mcp-gate'
            ? 'mcpGate'
            : 'promptGate',
        binding.command,
      ]),
    ) as {
      sessionStart?: string
      mcpGate?: string
      promptGate?: string
    }

    await this.writeJson('.codex/readiness.generated.json', {
      model: 'pluxx.readiness.v1',
      enforcedByPluginBundle: readinessCapability.bundleEnforced,
      note: `${getRuntimeReadinessExternalConfigNote()} Use this file together with hooks/hooks.json and .codex/hooks.generated.json when verifying bundled readiness hooks or debugging translated event names.`,
      dependencies: this.config.readiness.dependencies,
      gates: this.config.readiness.gates,
      translatedHooks: {
        sessionStart: translatedHooks.sessionStart ?? null,
        mcpGate: translatedHooks.mcpGate ?? null,
        promptGate: translatedHooks.promptGate ?? null,
      },
    })
  }

  private buildCodexCommandHookGroup(
    event: string,
    command: string,
    matcher?: string,
    timeout?: number,
  ): CodexHookMatcherGroup {
    const handler: CodexHookHandler = {
      type: 'command',
      command,
      ...(timeout !== undefined ? { timeout } : {}),
    }

    return {
      ...(matcher !== undefined && isHookFieldPreserved('codex', 'matcher', event) ? { matcher } : {}),
      hooks: [handler],
    }
  }

  private async generateCommandsCompanion(): Promise<void> {
    if (!this.config.commands) return

    const commandsDir = this.resolveConfigPath(this.config.commands, 'commands')
    const commands = readCanonicalCommandFiles(commandsDir)
    if (commands.length === 0) return

    await this.writeJson('.codex/commands.generated.json', {
      model: 'pluxx.commands.v1',
      nativeSurface: 'degraded-to-guidance',
      note: `${getCodexCommandGuidanceNote()} Use these canonical command entries as workflow routing guidance alongside AGENTS.md.`,
      commands: commands.map((command) => {
        const metadata = getCanonicalCommandMetadata(command)
        return {
          id: metadata.commandId,
          title: metadata.title,
          ...(metadata.description ? { description: metadata.description } : {}),
          ...(metadata.whenToUse ? { whenToUse: metadata.whenToUse } : {}),
          ...(metadata.argumentHint ? { argumentHint: metadata.argumentHint } : {}),
          ...(metadata.arguments.length > 0 ? { arguments: metadata.arguments } : {}),
          ...(metadata.examples.length > 0 ? { examples: metadata.examples } : {}),
          ...(metadata.skill ? { skill: metadata.skill } : {}),
          ...(metadata.skills.length > 0 ? { skills: metadata.skills } : {}),
          ...(metadata.agent ? { agent: metadata.agent } : {}),
          ...(typeof metadata.subtask === 'boolean' ? { subtask: metadata.subtask } : {}),
          ...(metadata.model ? { model: metadata.model } : {}),
          ...(metadata.context ? { context: metadata.context } : {}),
          template: metadata.template,
        }
      }),
    })
  }

  private async generateSkillsCompanion(): Promise<void> {
    if (!this.config.skills) return

    const skillsDir = this.resolveConfigPath(this.config.skills, 'skills')
    const skills = readCanonicalSkillFiles(skillsDir)
    if (skills.length === 0) return

    await this.writeJson('.codex/skills.generated.json', {
      model: 'pluxx.skills.v1',
      nativeSurface: 'compatibility-skill-files-plus-guidance',
      note: 'Codex preserves canonical SKILL.md files, but richer discovery and support-file metadata may also need command or AGENTS.md guidance. Use this companion to keep that richer canonical metadata visible after translation.',
      skills: skills.map((skill) => {
        const metadata = getCanonicalSkillMetadata(skill)
        return {
          id: metadata.dirName,
          title: metadata.title,
          ...(metadata.description ? { description: metadata.description } : {}),
          ...(metadata.whenToUse ? { whenToUse: metadata.whenToUse } : {}),
          ...(metadata.argumentHint ? { argumentHint: metadata.argumentHint } : {}),
          ...(metadata.arguments.length > 0 ? { arguments: metadata.arguments } : {}),
          ...(typeof metadata.disableModelInvocation === 'boolean' ? { disableModelInvocation: metadata.disableModelInvocation } : {}),
          ...(typeof metadata.userInvocable === 'boolean' ? { userInvocable: metadata.userInvocable } : {}),
          ...(metadata.allowedTools.length > 0 ? { allowedTools: metadata.allowedTools } : {}),
          ...(metadata.model ? { model: metadata.model } : {}),
          ...(metadata.effort ? { effort: metadata.effort } : {}),
          ...(metadata.context ? { context: metadata.context } : {}),
          ...(metadata.agent ? { agent: metadata.agent } : {}),
          ...(metadata.paths.length > 0 ? { paths: metadata.paths } : {}),
          ...(metadata.shell ? { shell: metadata.shell } : {}),
          ...(metadata.helperScripts.length > 0 ? { helperScripts: metadata.helperScripts } : {}),
          ...(metadata.examplePaths.length > 0 ? { examplePaths: metadata.examplePaths } : {}),
          ...(metadata.referencePaths.length > 0 ? { referencePaths: metadata.referencePaths } : {}),
        }
      }),
    })
  }

  private buildCodexCommandRoutingSection(): string | null {
    if (!this.config.commands) return null

    const commandsDir = this.resolveConfigPath(this.config.commands, 'commands')
    const commands = readCanonicalCommandFiles(commandsDir)
    if (commands.length === 0) return null

    const lines = [
      '## Command Routing',
      '',
      'This plugin defines canonical command entrypoints. Codex does not package them as native slash commands today, so route those requests through the matching workflow directly.',
      '',
      ...commands.flatMap((command) => buildCodexCommandRoutingEntry(getCanonicalCommandMetadata(command))),
    ]

    return lines.join('\n')
  }
}
