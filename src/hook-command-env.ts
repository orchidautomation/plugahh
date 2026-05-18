function shellSingleQuote(value: string): string {
  return `'${value.replace(/'/g, `'\"'\"'`)}'`
}

export function buildHookCommandWrapperScript(command: string, pluginRootVar: string, envFileVar?: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(pluginRootVar)) {
    throw new Error(`Invalid plugin root environment variable name: ${pluginRootVar}`)
  }

  const serializedCommand = shellSingleQuote(command)
  const exportLoader = [
    'import { readFileSync } from "node:fs"',
    '',
    'const shellSingleQuote = (input) => `\'${String(input ?? "").replace(/\'/g, `\'"\'"\'`)}\'`',
    '',
    'const filepath = process.argv[1]',
    'if (!filepath) process.exit(0)',
    'const payload = JSON.parse(readFileSync(filepath, "utf8"))',
    'const env = payload && typeof payload === "object" && payload.env && typeof payload.env === "object"',
    '  ? payload.env',
    '  : {}',
    '',
    'for (const [key, value] of Object.entries(env)) {',
    '  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue',
    '  process.stdout.write(`export ${key}=${shellSingleQuote(value)}\\0`)',
    '}',
  ].join('\n')

  const maybeAppendEnvFile = envFileVar
    ? [
        `      if [ -n "\${${envFileVar}:-}" ]; then`,
        `        printf '%s\\n' "$pluxx_export" >> "\${${envFileVar}}"`,
        '      fi',
      ]
    : []

  return [
    '#!/usr/bin/env bash',
    'set -euo pipefail',
    '',
    `PLUXX_PLUGIN_ROOT="\${${pluginRootVar}:-$(cd "$(dirname "$0")/.." && pwd)}"`,
    `export ${pluginRootVar}="$PLUXX_PLUGIN_ROOT"`,
    'export PLUGIN_ROOT="$PLUXX_PLUGIN_ROOT"',
    'PLUXX_USER_CONFIG_PATH="$PLUXX_PLUGIN_ROOT/.pluxx-user.json"',
    '',
    'if [ -f "$PLUXX_USER_CONFIG_PATH" ]; then',
    '  while IFS= read -r -d \'\' pluxx_export; do',
    '    if [ -n "$pluxx_export" ]; then',
    '      eval "$pluxx_export"',
    ...maybeAppendEnvFile,
    '    fi',
    '  done < <(',
    `    node --input-type=module -e ${shellSingleQuote(exportLoader)} "$PLUXX_USER_CONFIG_PATH"`,
    '  )',
    'fi',
    '',
    `PLUXX_HOOK_COMMAND=${serializedCommand}`,
    'eval "$PLUXX_HOOK_COMMAND"',
    '',
  ].join('\n')
}
