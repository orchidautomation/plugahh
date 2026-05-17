import { afterEach, describe, expect, it } from 'bun:test'
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { resolve } from 'path'
import { runCodexInteractiveHookProbeSuite, type CodexInteractiveHookProbeScenario } from '../src/codex-interactive-hook-probe'

const TMP_ROOTS: string[] = []
const ORIGINAL_FAKE_MODE = process.env.PLUXX_FAKE_CODEX_INTERACTIVE_HOOK_MODE

function makeTempDir(prefix: string): string {
  const dir = mkdtempSync(resolve(tmpdir(), prefix))
  TMP_ROOTS.push(dir)
  return dir
}

function makeStubExecutable(path: string, body: string): void {
  writeFileSync(path, body)
  chmodSync(path, 0o755)
}

afterEach(() => {
  if (ORIGINAL_FAKE_MODE === undefined) {
    delete process.env.PLUXX_FAKE_CODEX_INTERACTIVE_HOOK_MODE
  } else {
    process.env.PLUXX_FAKE_CODEX_INTERACTIVE_HOOK_MODE = ORIGINAL_FAKE_MODE
  }

  while (TMP_ROOTS.length > 0) {
    rmSync(TMP_ROOTS.pop()!, { recursive: true, force: true })
  }
})

function makeAuthHome(rootDir: string): string {
  const authHome = resolve(rootDir, 'codex-home')
  mkdirSync(authHome, { recursive: true })
  writeFileSync(resolve(authHome, 'auth.json'), '{"access_token":"test"}\n')
  return authHome
}

function makeFakeScript(rootDir: string): string {
  const binDir = resolve(rootDir, '.bin')
  mkdirSync(binDir, { recursive: true })
  const binary = resolve(binDir, 'script')
  makeStubExecutable(binary, `#!/bin/sh
MODE="\${PLUXX_FAKE_CODEX_INTERACTIVE_HOOK_MODE:-codex-hooks-prompt}"
TRANSCRIPT=""
ENABLE_HOOKS="no"
ATTEMPT_FILE="$CODEX_HOME/interactive-hook-attempt.txt"
ATTEMPT="0"
if [ -f "$ATTEMPT_FILE" ]; then
  ATTEMPT="$(cat "$ATTEMPT_FILE")"
fi
ATTEMPT=$((ATTEMPT + 1))
printf '%s\\n' "$ATTEMPT" > "$ATTEMPT_FILE"
if [ "$1" = "-q" ]; then
  shift
fi
TRANSCRIPT="$1"
shift
while [ "$#" -gt 0 ]; do
  if [ "$1" = "--enable" ] && [ "\${2:-}" = "hooks" ]; then
    ENABLE_HOOKS="yes"
  fi
  shift
done
mkdir -p "$CODEX_HOME/log"
case "$MODE" in
  codex-hooks-prompt)
    cat > "$TRANSCRIPT" <<'EOF'
Reply only with OK
\`[features].codex_hooks\` is deprecated. Use \`[features].hooks\` instead.
EOF
    printf 'UserPromptSubmit\\n' > hook-ran.txt
    ;;
  hooks-prompt-warning)
    cat > "$TRANSCRIPT" <<'EOF'
Reply only with OK
EOF
    printf 'UserPromptSubmit\\n' > hook-ran.txt
    cat > "$CODEX_HOME/log/codex-tui.log" <<'EOF'
warn: unknown feature key in config: hooks
EOF
    ;;
  enable-hooks-prompt)
    cat > "$TRANSCRIPT" <<'EOF'
Reply only with OK
EOF
    if [ "$ENABLE_HOOKS" = "yes" ]; then
      printf 'UserPromptSubmit\\n' > hook-ran.txt
    fi
    ;;
  session-start-review)
    cat > "$TRANSCRIPT" <<'EOF'
1 hook needs review before it can run. Open /hooks to review it.
EOF
    ;;
  session-start-reviewed)
    if [ "$ATTEMPT" -eq 1 ]; then
      cat > "$TRANSCRIPT" <<'EOF'
1 hook needs review before it can run. Open /hooks to review it.
EOF
    else
      cat > "$TRANSCRIPT" <<'EOF'
Reply only with OK
EOF
      printf 'SessionStart\\n' > hook-ran.txt
    fi
    ;;
  ansi-review)
    printf '\\033]0;demo\\007\\033[1;1H1 hook needs review before it can run. Open /hooks to review it.\\n' > "$TRANSCRIPT"
    ;;
  linger)
    cat > "$TRANSCRIPT" <<'EOF'
Reply only with OK
EOF
    printf 'UserPromptSubmit\\n' > hook-ran.txt
    sleep 10
    ;;
  no-signal)
    cat > "$TRANSCRIPT" <<'EOF'
Reply only with OK
EOF
    ;;
  fail)
    echo 'interactive hook failure' >&2
    exit 1
    ;;
esac
`)
  return binary
}

function makeFakeCodex(rootDir: string): string {
  const binDir = resolve(rootDir, '.bin')
  mkdirSync(binDir, { recursive: true })
  const binary = resolve(binDir, 'codex')
  makeStubExecutable(binary, '#!/bin/sh\nexit 0\n')
  return binary
}

async function runScenario(scenario: CodexInteractiveHookProbeScenario, mode: string) {
  process.env.PLUXX_FAKE_CODEX_INTERACTIVE_HOOK_MODE = mode
  const rootDir = makeTempDir('pluxx-codex-interactive-hook-probe-')
  const authHome = makeAuthHome(rootDir)
  const scriptBinary = makeFakeScript(rootDir)
  const codexBinary = makeFakeCodex(rootDir)

  const suite = await runCodexInteractiveHookProbeSuite([scenario], {
    authSourceHome: authHome,
    scriptBinary,
    codexBinary,
    timeoutMs: 2_000,
  })

  expect(suite.results).toHaveLength(1)
  return suite.results[0]!
}

describe('codex interactive hook probe', () => {
  it('covers the documented trusted interactive prompt and session-start scenarios under both general hook feature-flag spellings', async () => {
    const rootDir = makeTempDir('pluxx-codex-interactive-hook-defaults-')
    const authHome = makeAuthHome(rootDir)
    const scriptBinary = makeFakeScript(rootDir)
    const codexBinary = makeFakeCodex(rootDir)
    process.env.PLUXX_FAKE_CODEX_INTERACTIVE_HOOK_MODE = 'no-signal'

    const suite = await runCodexInteractiveHookProbeSuite(undefined, {
      authSourceHome: authHome,
      scriptBinary,
      codexBinary,
      timeoutMs: 2_000,
    })

    expect(suite.results.map((result) => `${result.eventName}:${result.featureMode}`)).toEqual([
      'UserPromptSubmit:codex_hooks',
      'UserPromptSubmit:hooks',
      'SessionStart:codex_hooks',
      'SessionStart:hooks',
    ])
  })

  it('records interactive-hook-executed when a trusted UserPromptSubmit hook writes its side effect', async () => {
    const result = await runScenario({
      name: 'user-prompt-submit-codex-hooks-trusted',
      featureMode: 'codex_hooks',
      eventName: 'UserPromptSubmit',
      trustProject: true,
    }, 'codex-hooks-prompt')

    expect(result.status).toBe('interactive-hook-executed')
    expect(result.hookRan).toBe(true)
    expect(result.hookOutput).toBe('UserPromptSubmit')
    expect(result.sawReviewGate).toBe(false)
    expect(result.sawUnknownFeatureKeyWarning).toBe(false)
    expect(result.sawCodexHooksDeprecationWarning).toBe(true)
    expect(result.codexHooksDeprecationMessage).toContain('`[features].hooks`')
  })

  it('flags the alternate hooks warning when codex-tui.log reports unknown feature key in config: hooks', async () => {
    const result = await runScenario({
      name: 'user-prompt-submit-hooks-trusted',
      featureMode: 'hooks',
      eventName: 'UserPromptSubmit',
      trustProject: true,
    }, 'hooks-prompt-warning')

    expect(result.status).toBe('interactive-hook-executed')
    expect(result.hookRan).toBe(true)
    expect(result.sawUnknownFeatureKeyWarning).toBe(true)
    expect(result.tuiLogPreview).toContain('unknown feature key in config: hooks')
  })

  it('records review-gate-observed when SessionStart is blocked behind /hooks review', async () => {
    const result = await runScenario({
      name: 'session-start-codex-hooks-trusted-unreviewed',
      featureMode: 'codex_hooks',
      eventName: 'SessionStart',
      trustProject: true,
    }, 'session-start-review')

    expect(result.status).toBe('review-gate-observed')
    expect(result.hookRan).toBe(false)
    expect(result.sawReviewGate).toBe(true)
    expect(result.reviewGateMessage).toContain('Open /hooks to review it.')
  })

  it('normalizes ANSI-heavy transcripts before matching the review gate', async () => {
    const result = await runScenario({
      name: 'session-start-codex-hooks-trusted-unreviewed',
      featureMode: 'codex_hooks',
      eventName: 'SessionStart',
      trustProject: true,
    }, 'ansi-review')

    expect(result.status).toBe('review-gate-observed')
    expect(result.sawReviewGate).toBe(true)
    expect(result.normalizedTranscript).toContain('Open/hooks')
  })

  it('also supports the SessionStart hooks-flag variant', async () => {
    const result = await runScenario({
      name: 'session-start-hooks-trusted-unreviewed',
      featureMode: 'hooks',
      eventName: 'SessionStart',
      trustProject: true,
    }, 'session-start-review')

    expect(result.status).toBe('review-gate-observed')
    expect(result.hookRan).toBe(false)
    expect(result.sawReviewGate).toBe(true)
  })

  it('supports a two-phase reviewed SessionStart attempt and records both phases', async () => {
    const result = await runScenario({
      name: 'session-start-hooks-trusted-reviewed',
      featureMode: 'hooks',
      eventName: 'SessionStart',
      trustProject: true,
      executionMode: 'reviewed-session-start',
    }, 'session-start-reviewed')

    expect(result.executionMode).toBe('reviewed-session-start')
    expect(result.status).toBe('interactive-hook-executed')
    expect(result.hookRan).toBe(true)
    expect(result.hookOutput).toBe('SessionStart')
    expect(result.attempts).toHaveLength(2)
    expect(result.attempts.map((attempt) => `${attempt.phase}:${attempt.status}`)).toEqual([
      'pre-review:review-gate-observed',
      'post-review:interactive-hook-executed',
    ])
    expect(result.attempts[0]?.sawReviewGate).toBe(true)
    expect(result.attempts[0]?.hookRan).toBe(false)
    expect(result.attempts[1]?.sawReviewGate).toBe(false)
    expect(result.attempts[1]?.hookRan).toBe(true)
    expect(result.transcriptPath).toContain('post-review')
  })

  it('passes extra CLI activation args through to the interactive Codex runner', async () => {
    const result = await runScenario({
      name: 'user-prompt-submit-enable-hooks-trusted',
      featureMode: 'none',
      eventName: 'UserPromptSubmit',
      trustProject: true,
      extraCliArgs: ['--enable', 'hooks'],
    }, 'enable-hooks-prompt')

    expect(result.status).toBe('interactive-hook-executed')
    expect(result.hookRan).toBe(true)
    expect(result.hookOutput).toBe('UserPromptSubmit')
  })

  it('kills lingering interactive script sessions once the hook side effect lands', async () => {
    const result = await runScenario({
      name: 'user-prompt-submit-codex-hooks-trusted',
      featureMode: 'codex_hooks',
      eventName: 'UserPromptSubmit',
      trustProject: true,
    }, 'linger')

    expect(result.status).toBe('interactive-hook-executed')
    expect(result.exitCode).toBe(0)
    expect(result.killedAfterSignal).toBe(true)
    expect(result.timedOut).toBe(false)
  })

  it('reports no-signal-observed when the wrapper exits cleanly without a hook side effect or review gate', async () => {
    const result = await runScenario({
      name: 'user-prompt-submit-codex-hooks-trusted',
      featureMode: 'codex_hooks',
      eventName: 'UserPromptSubmit',
      trustProject: true,
    }, 'no-signal')

    expect(result.status).toBe('no-signal-observed')
    expect(result.hookRan).toBe(false)
    expect(result.sawReviewGate).toBe(false)
  })

  it('reports runner-failed when the interactive script wrapper exits non-zero without a hook signal', async () => {
    const result = await runScenario({
      name: 'user-prompt-submit-codex-hooks-trusted',
      featureMode: 'codex_hooks',
      eventName: 'UserPromptSubmit',
      trustProject: true,
    }, 'fail')

    expect(result.status).toBe('runner-failed')
    expect(result.exitCode).toBe(1)
    expect(result.hookRan).toBe(false)
  })
})
