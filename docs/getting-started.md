# Getting Started With Pluxx

Pluxx is for one specific job: maintain one source project, compile truthful native bundles for Claude Code, Cursor, Codex, and OpenCode, and keep those outputs in sync over time.

The strongest path today is MCP-first: bring an existing MCP server, scaffold the plugin from it, verify the installed result in a real host, then keep shipping from one maintained source of truth. If you want the shortest path, `pluxx autopilot` can turn that raw MCP into a workflow-driven cross-platform native plugin in one flow. MCP is not a hard requirement. You can also start from an empty plugin and author the skills, instructions, hooks, and metadata yourself.

This walkthrough covers:

- choose an MCP-first or hand-authored starting point
- scaffold a plugin
- use `autopilot` when you want the one-shot path
- lint, build, install, and test it
- sync later when the MCP changes
- run the same checks in CI

## Current Proof To Inspect First

If you want proof before you want process, look at these first:

- [Proof and install guide](./proof-and-install.md)
  - the shortest repo-native path to current demos plus one-command install paths for the released self-hosted plugin
- [Self-hosted core-four proof](./pluxx-self-hosted-core-four-proof.md)
  - the canonical `example/pluxx` source project rebuilt, installed, and `verify-install` checked across Claude Code, Cursor, Codex, and OpenCode
- [Docs Ops core-four proof](./docs-ops-core-four-proof.md)
  - the flagship `example/docs-ops` source project rebuilt, installed, and `verify-install` checked across Claude Code, Cursor, Codex, and OpenCode
- [Orchid Docs Ops Codex walkthrough](./orchid-docs-ops-codex-walkthrough.md)
  - the flagship `docs-ops` example compiled into a real Codex plugin and used against Orchid's live Docsalot MCP
- [Orchid Accordion rewrite artifact](../example/docs-ops/demo-rewrites/orchid-components-accordion.after.md)
  - one concrete before/after output from the flagship example
- [Firecrawl connector docs-ingestion proof](./strategy/firecrawl-connector-docs-ingestion-proof.md)
  - the first real Firecrawl-backed comparison on the current fixture set
- [Docs-ingestion fixture snapshot](./strategy/docs-ingestion-fixture-eval.md)
  - the keyed local harness rerun with `baseline`, `local`, and `firecrawl` captured side by side
- [Docs-ingestion scaffold before/after demo](./strategy/docs-ingestion-scaffold-before-after.md)
  - a committed Sumble scaffold delta showing what Firecrawl-sourced context changes in real generated files

The biggest remaining docs-ingestion work is now improving the weak fixtures and turning the captured proof into cleaner public-facing demo assets.

Related docs:

- [Proof and install](./proof-and-install.md)
- [Create a Pluxx plugin](./create-a-pluxx-plugin.md)
- [MCP-first command lifecycle](./mcp-first-command-lifecycle.md)
- [Use Pluxx in host agents](./use-pluxx-in-host-agents.md)
- [Practical handbook](./practical-handbook.md)
- [How it works](./how-it-works.md)
- [Architecture](./architecture.md)
- [Customer journey](./customer-journey.md)
- [One-shot autopilot spec](./autopilot-spec.md)
- [Homepage messaging](./homepage-messaging.md)
- [PlayKit case study](./playkit-case-study.md)
- [Orchid Docs Ops Codex walkthrough](./orchid-docs-ops-codex-walkthrough.md)

## Product Boundary

Pluxx is the source-of-truth compiler and maintenance layer for cross-host plugins.

The best fit today is an MCP-backed plugin, because that is where import, auth translation, and sync save the most work. But Pluxx also works for plugins with no MCP.

Pluxx owns:

- one maintained source project
- source-plugin scaffolding from local or remote MCPs when you have one
- plugin validation, build, local install, install verification, and sync
- keeping generated plugin repos maintainable as MCPs and host surfaces evolve

Pluxx does not own:

- deploying or hosting the MCP backend service itself
- operating production MCP infrastructure
- the future trust or distribution layer as the current product center

## Lifecycle At A Glance

1. Start from a local stdio MCP, remote MCP, or empty plugin.
2. Generate and refine one maintained source repo.
3. Validate the source project.
4. Build and install one host locally.
5. Run `verify-install` so the host-visible bundle is actually present and shaped correctly.
6. If your plugin is MCP-backed, repoint sync to the remote endpoint when the backend is deployed.
7. Keep the plugin repo as your long-term source of truth.

## The 10-Minute MCP Path

If you have a raw MCP and want the shortest real proof, use autopilot to import, refine, build, install one host, and run `verify-install` in one flow:

```bash
pluxx autopilot \
  --from-mcp https://example.com/mcp \
  --runner codex \
  --mode standard \
  --install \
  --install-target codex \
  --trust
```

For an authenticated MCP, export the real secret first and declare how the MCP expects it:

```bash
export ACME_API_KEY='real_key'

pluxx autopilot \
  --from-mcp https://example.com/mcp \
  --runner codex \
  --mode standard \
  --auth-env ACME_API_KEY \
  --auth-type bearer \
  --install \
  --install-target codex \
  --trust
```

Use `--install-target codex` for the first run unless you already know which host you want to prove first. It keeps onboarding focused on one host-visible install instead of asking a new user to debug four hosts at once.

The success output should end with the installed host path, `verify-install` status, and the exact host reload instruction. If the MCP needs an API key, export the real env var before running autopilot; Pluxx rejects obvious placeholder secrets because many hosts do not expose a native settings form for plugin-owned MCP credentials after install.

## 1. Choose Your Starting Point

### Path A: Bring An MCP Server

Pluxx accepts three MCP source shapes today:

- remote HTTP: `npx @orchid-labs/pluxx init --from-mcp https://example.com/mcp`
- legacy SSE: `npx @orchid-labs/pluxx init --from-mcp https://example.com/sse --transport sse`
- local stdio: `npx @orchid-labs/pluxx init --from-mcp "npx -y -p @acme/mcp acme-mcp"`
- already-installed host config: `npx @orchid-labs/pluxx discover-mcp` then `npx @orchid-labs/pluxx init --from-installed-mcp codex:acme --yes`

For local stdio imports, pass the real executable command. Do not assume the npm package name is also the runnable bin name.

For already-installed MCPs, Pluxx reads the common Claude Code, Cursor, Codex, and OpenCode config locations and imports the selected server without copying literal secret values.

Examples:

- installed locally: `npx @orchid-labs/pluxx init --from-mcp "./node_modules/.bin/acme-mcp" --yes`
- one-shot via npm: `npx @orchid-labs/pluxx init --from-mcp "npx -y -p @acme/mcp acme-mcp" --yes`

If the remote server requires auth and responds with `401`, `402`, or `403`, Pluxx can scaffold it with either bearer auth or a custom header. Use the auth flags up front for non-interactive imports:

```bash
npx @orchid-labs/pluxx init \
  --from-mcp https://mcp.playkit.sh/mcp \
  --yes \
  --auth-env PLAYKIT_API_KEY \
  --auth-type header \
  --auth-header X-API-Key \
  --auth-template '${value}'
```

For OAuth-first MCPs, complete the provider OAuth flow first, then export the resulting access token/API key and reuse the same auth flags:

```bash
npx @orchid-labs/pluxx init \
  --from-mcp https://example.com/mcp \
  --yes \
  --auth-env OAUTH_ACCESS_TOKEN \
  --auth-type bearer
```

### Path B: Start Without MCP

If your plugin does not wrap an MCP server, initialize a source project and author the plugin directly:

```bash
npx @orchid-labs/pluxx init my-plugin
cd my-plugin
```

Then fill in:

- `pluxx.config.ts`
- `INSTRUCTIONS.md`
- `skills/<skill-name>/SKILL.md`
- optional `commands/`, `agents/`, `scripts/`, and `assets/`

## 2. Scaffold A Plugin

Interactive:

```bash
npx @orchid-labs/pluxx init --from-mcp https://example.com/mcp
```

Without MCP:

```bash
npx @orchid-labs/pluxx init my-plugin
```

Headless:

```bash
npx @orchid-labs/pluxx init \
  --from-mcp https://example.com/mcp \
  --yes \
  --name acme \
  --display-name "Acme" \
  --author "Acme" \
  --targets claude-code,cursor,codex,opencode \
  --grouping workflow \
  --hooks safe
```

One-shot autopilot:

```bash
npx @orchid-labs/pluxx autopilot \
  --from-mcp https://example.com/mcp \
  --runner codex \
  --yes \
  --name acme \
  --display-name "Acme" \
  --author "Acme" \
  --targets claude-code,cursor,codex,opencode \
  --grouping workflow \
  --hooks safe
```

One-shot autopilot with local install and `verify-install`:

```bash
npx @orchid-labs/pluxx autopilot \
  --from-mcp https://example.com/mcp \
  --runner codex \
  --mode standard \
  --install \
  --install-target codex \
  --trust
```

For raw MCPs with many low-level tools, the deterministic scaffold now keeps slash commands narrower than the full tool list. Commands are reserved for workflow-level entrypoints, prompt-backed surfaces, or tools with strong argument shape. Singleton tool wrappers remain available as skills, but Pluxx will warn when a scaffold still looks like command-per-tool output so you know to run taxonomy refinement before publishing.

By default, autopilot summarizes runner outcomes without streaming raw runner logs. Add `--verbose-runner` to stream full headless runner output.

Headless import with custom header auth:

```bash
npx @orchid-labs/pluxx init \
  --from-mcp https://mcp.playkit.sh/mcp \
  --yes \
  --name playkit \
  --display-name "PlayKit" \
  --author "PlayKit" \
  --targets claude-code,cursor,codex,opencode \
  --grouping workflow \
  --hooks safe \
  --auth-env PLAYKIT_API_KEY \
  --auth-type header \
  --auth-header X-API-Key \
  --auth-template '${value}'
```

Preview without writing files:

```bash
npx @orchid-labs/pluxx init --from-mcp https://example.com/mcp --yes --dry-run --json
```

## 3. What Gets Generated

Pluxx writes:

- `pluxx.config.ts`
- `INSTRUCTIONS.md`
- `skills/<skill-name>/SKILL.md`
- optional `scripts/` for safe generated hooks
- `.pluxx/mcp.json` ownership metadata for future syncs when the project was scaffolded from MCP

The important contract is:

- edit the source project
- do not hand-edit `dist/`
- rebuild and reinstall when you want fresh host outputs

Generated `INSTRUCTIONS.md` and `SKILL.md` files use mixed ownership:

- a Pluxx-managed generated block
- a preserved custom block for manual edits

That lets `pluxx sync --from-mcp` refresh discovered MCP content later without throwing away curated notes.

If you want to steer Agent Mode without editing generated prompt packs, add a project-owned `pluxx.agent.md` file. Pluxx will read it during `agent prepare`, `agent prompt`, `agent run`, and `autopilot`.

## 4. Check Project Health

Before building, run:

```bash
npx @orchid-labs/pluxx doctor
```

`pluxx doctor` is read-only. It checks:

- Node runtime availability for the published CLI
- config loadability
- configured paths like `skills/`, `instructions`, `agents`, `commands`, `scripts`, and `assets`
- MCP transport and auth shape
- scaffold metadata validity
- trust advisories for hook commands
- beta-target caveats

For CI or automation:

```bash
npx @orchid-labs/pluxx doctor --json
```

## 5. Lint, Build, Install, Test

```bash
npx @orchid-labs/pluxx lint
npx @orchid-labs/pluxx build
npx @orchid-labs/pluxx install --target claude-code
npx @orchid-labs/pluxx verify-install --target claude-code
npx @orchid-labs/pluxx test
```

Useful previews:

```bash
npx @orchid-labs/pluxx build --dry-run
npx @orchid-labs/pluxx install --dry-run
```

`pluxx verify-install` checks the actual installed host-visible bundle, not just generated files in `dist/`.

For Codex MCP-backed plugins, do not use the global **MCP servers** settings page as the only source of truth. A plugin-bundled MCP can appear on the plugin detail page without appearing in that global list. If Codex looks stale after install, run:

```bash
npx @orchid-labs/pluxx verify-install --target codex
npx @orchid-labs/pluxx doctor --consumer ~/.codex/plugins/<plugin-name>
```

Then use `Plugins > Refresh` if your Codex UI shows it, or restart Codex.

If the plugin requires an API key, Pluxx materializes that value into the installed bundle during `pluxx install` and in generated `pluxx publish` installer scripts. Published curl installers read the expected env var first and prompt interactively when it is missing. On update, the generated Claude Code, Cursor, Codex, and OpenCode installers reuse the installed `.pluxx-user.json` when it contains non-placeholder values, so users do not have to re-enter the same key on every curl reinstall. Set the env var to override the saved value, or run with `PLUXX_RECONFIGURE=1` to force fresh configuration. Codex may not expose plugin-owned MCP secrets in the global MCP settings UI. Pluxx refuses obvious placeholder secrets such as `dummy API key` and `pluxx doctor --consumer` warns if an older install already contains one.

`pluxx test` runs the default verification contract:

- config load / validate
- lint
- build
- generated output smoke checks

## 6. Sync Later

For MCP-derived projects, when the server changes:

```bash
npx @orchid-labs/pluxx sync
```

If your MCP moved from local stdio development to a deployed endpoint, repoint sync explicitly:

```bash
npx @orchid-labs/pluxx sync --from-mcp https://mcp.example.com/mcp
```

Preview sync changes first:

```bash
npx @orchid-labs/pluxx sync --dry-run --json
```

If the project is hand-authored with no MCP, `sync` is not part of the normal loop. The source repo itself is the maintained artifact.

Pluxx preserves custom mixed-ownership Markdown sections and reports:

- added files
- updated files
- removed files
- preserved files
- renamed skill directories

## 7. Publish And Distribute

After build/install validation, ship the generated plugin repo and bundles:

1. Commit and version the plugin source repo (`pluxx.config.ts`, `skills/`, `INSTRUCTIONS.md`, `.pluxx/mcp.json`).
2. Build release bundles with `npx @orchid-labs/pluxx build`.
3. Publish/share through your target channels (team repo, release artifacts, or platform-specific publish flows).

This keeps Pluxx as the distribution and maintenance layer while your MCP backend deployment stays separate.

## 8. Run In CI

Use the reusable workflow shipped in this repo:

```yaml
name: Plugin Check

on:
  pull_request:
  push:
    branches: [main]

jobs:
  verify:
    uses: orchidautomation/pluxx/.github/workflows/pluxx-plugin-check.yml@main
    with:
      working-directory: .
      pluxx-version: latest
```

If you want to run the CLI directly in a script:

```bash
npx @orchid-labs/pluxx doctor --json
npx @orchid-labs/pluxx test --json
```

## Prime-Time Path

The prime-time Pluxx path is:

- Claude Code
- Cursor
- Codex
- OpenCode

Other generators still exist, but they are less validated and should be treated as beta targets until they have stronger live coverage.
