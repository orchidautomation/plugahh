# Master Backlog

Last updated: 2026-05-13

This is the most complete repo-native backlog for Pluxx.

Use this file when you want the broadest view of what still needs to happen across product, proof, docs, GTM, and the later trust layer.

If you want the broadest completeness checklist rather than the broadest backlog, use [success-checklist.md](./success-checklist.md).

This is not the same thing as the short queue.

- Use [queue.md](./queue.md) for the active operational queue.
- Use [start-here.md](../start-here.md) for orientation.
- Use [roadmap.md](../roadmap.md) for direction.
- Use [Linear](https://linear.app/orchid-automation) for ticket-level sequencing, ownership, and issue-by-issue detail.

## Doc Links

- Role: broadest repo-native backlog
- Related:
  - [docs/start-here.md](../start-here.md)
  - [queue.md](./queue.md)
  - [success-checklist.md](./success-checklist.md)
  - [docs/roadmap.md](../roadmap.md)
  - [docs/oss-wedge-and-trust-layer.md](../oss-wedge-and-trust-layer.md)
  - [docs/flagship-docs-ops-plugin.md](../flagship-docs-ops-plugin.md)
  - [docs/platform-change-ops-reference-plugin.md](../platform-change-ops-reference-plugin.md)
  - [docs/docs-ops-core-four-proof.md](../docs-ops-core-four-proof.md)
  - [docs/exa-research-example.md](../exa-research-example.md)
  - [docs/pluxx-plugin-surface-audit.md](../pluxx-plugin-surface-audit.md)
  - [docs/pluxx-self-hosted-core-four-proof.md](../pluxx-self-hosted-core-four-proof.md)
  - [docs/core-four-provider-docs-audit.md](../core-four-provider-docs-audit.md)
  - [docs/core-four-reliability-register.md](../core-four-reliability-register.md)
  - [docs/core-four-translation-hit-list.md](../core-four-translation-hit-list.md)
  - [author-once-hardening.md](./author-once-hardening.md)
  - [Linear](https://linear.app/orchid-automation)
- Update together:
  - [docs/start-here.md](../start-here.md)
  - [queue.md](./queue.md)
  - [docs/roadmap.md](../roadmap.md)

## How To Read This

The backlog is grouped by horizon:

- `Now`: work that should shape the next real execution block
- `Next`: work that matters soon, but is not the immediate center
- `Later`: work that is strategically important, but should not drive the current build

Within each section:

- `[ ]` means still open
- `[~]` means partially underway or structurally in place
- `[x]` means materially shipped and included here only when it unlocks follow-on work

## Source-Of-Truth Stack

If these files ever disagree, resolve them in this order:

1. `docs/start-here.md`
2. `docs/todo/queue.md`
3. `docs/todo/master-backlog.md`
4. `docs/roadmap.md`
5. Linear

The goal is simple:

Any person or agent should be able to enter the repo and answer:

- what Pluxx is
- what is already shipped
- what matters next
- what is deferred
- where the business could go later

## Now

### 1. Product clarity and front-door coherence

- [~] Keep [start-here.md](../start-here.md), [queue.md](./queue.md), this file, and Linear aligned
- [~] Close the remaining ticket-state drift where shipped work can still appear as backlog in Linear
- [~] Keep the README top section, website hero, GitHub About metadata, and docs homepage messaging aligned
- [ ] Remove or rewrite any stale docs that still describe already-shipped work as future work
- [ ] Decide which docs are public product docs vs strategy docs vs internal-only GTM docs
- [ ] Move account-specific GTM and customer notes out of the public repo
- [ ] Define a simple rule for when repo docs should be updated alongside Linear
- [~] Keep OpenClaw in the documented beta-target lane until native generator, doctor, and smoke proof exist:
  - [docs/openclaw-target-evaluation.md](../openclaw-target-evaluation.md)
- [~] Turn the provider and branding audits into an explicit closure tracker for every mapped cross-host feature:
  - [docs/core-four-translation-hit-list.md](../core-four-translation-hit-list.md)
- [~] Use [docs/primitive-compiler-hardening-architecture.md](../primitive-compiler-hardening-architecture.md) as the current execution spec for:
  - canonical IR boundary work
  - shared translation registry rollout
  - runtime/distribution internal seam hardening
  - first hook-registry slice is now in place for event support and field-preservation truth
  - prompt/failClosed/loop_limit lint explainability now also routes through the shared hook registry, and Claude prompt-hook warnings are event-aware instead of claiming all prompt hooks degrade
  - Cursor now also drops unsupported hook events from generated `hooks/hooks.json` instead of only warning in lint
  - Codex/OpenCode non-command hook-type degradation now warns through the shared hook registry, and the generated Codex hook companion records dropped `http` / `mcp_tool` / `agent` hook types explicitly
  - `migrate` now preserves richer hook entries instead of flattening them to command-only records, including prompt/http/mcp_tool types plus matcher, model, failClosed, loop_limit, async, shell, headers, allowedEnvVars, and input payloads
  - native Codex agent migrate now preserves `sandbox_mode` across the TOML -> canonical markdown -> rebuilt TOML path
  - commands IR now preserves `argument-hint`, `when_to_use`, argument arrays, examples, explicit skill routing, agent routing, and context hints through Codex, OpenCode, and Agent Mode
  - `init --from-mcp` now emits `when_to_use`, canonical `arguments`, and explicit `skill` routing into generated command frontmatter
  - the shared `src/skills.ts` seam now also emits canonical support-file metadata for `examples/`, helper `scripts/`, and neighboring references
  - command and skill translation wording in `lint` now routes through shared registries instead of hand-written per-target strings
  - Codex command routing guidance and `.codex/commands.generated.json` now read from the same richer command seam, reducing drift between AGENTS.md guidance and companion metadata
  - Codex/OpenCode skill-frontmatter translation notes now explicitly cover `when_to_use`, `user-invocable`, `model`, and `effort`
  - the behavioral proof lane is now materially stronger:
    - the harness supports expected-failure cases and host-specific runner args for maintained smoke fixtures
    - maintained smoke fixtures can now declare an explicit `commandId` plus required output markers, so command-proof cases fail when the prompt does not reference the command or the output shape stays vague
    - `example/docs-ops`, `example/exa-plugin`, and `example/platform-change-ops` now each carry behavioral smoke configs with command-specific assertions
    - `doctor --consumer` and `verify-install` now execute generated Claude/Cursor bundled permission-hook scripts and fail if they emit unusable decisions
    - `tests/verify-install.test.ts` now also covers corrupted installed Cursor hook bundles, missing Cursor rules payloads, stale installed Cursor versions, and missing entry, missing skill-sync, and stale package OpenCode install drift, so verifier regressions are pinned at the host-visible bundle layer instead of only `doctor --consumer`
  - agent translation explainability now has a shared registry slice:
    - `src/agent-translation-registry.ts` now drives degraded-field messaging for Cursor, Codex, and OpenCode
    - generated Cursor and Codex agent surfaces now emit the same translation story as `lint`
  - migrate now preserves more host-native instruction and distribution intent:
    - manifest-less Claude sources can migrate from `CLAUDE.md`
    - Cursor nested rule files and nested `AGENTS.md` provenance survive migrate and are copied into the maintained source project
    - Codex `AGENTS.override.md` survives alongside interface/app metadata
    - OpenCode configured instruction files and package entrypoints now survive import and are copied into the maintained source project
    - MCP migrate now merges generic and host-native MCP sources instead of first-file-wins, so native auth blobs such as platform auth and multi-header maps survive under `platforms.<host>.mcpServers.<server>`
  - installed-MCP auth recovery now follows through into authoring and install:
    - `discover-installed-mcp` now preserves host-native MCP auth overrides alongside the canonical auth shape
    - `init --from-installed-mcp` now carries those preserved auth blobs into generated `platforms.<host>.mcpServers.<server>` config
    - generated scaffold `userConfig` now derives extra env vars from native multi-header auth overrides instead of only the first canonical header
  - richer canonical skill metadata now survives into emitted host companions:
    - Codex now writes `.codex/skills.generated.json`
    - OpenCode now writes `skills.generated.json`
- [~] Keep [docs/core-four-reliability-register.md](../core-four-reliability-register.md) current as the concrete Claude Code and Codex failure register:
  - use it to separate generator defects from host-runtime issues and proof-harness issues
  - use it to drive the next proof-depth tranche for agents, hooks, settings/discovery, and distribution edges
  - the current register now also captures real Claude `.mcp.json` plus `~/.claude.json` MCP selector collisions, generated-shape Claude hook-integrity failures, Claude duplicate-hooks manifest failures, Claude `disableAllHooks` activation blockers, the maintained Claude settings-hook probe plus maintained installed-plugin default and duplicate-manifest proof, malformed bundled Codex hook JSON, missing manifest-wired Codex `.app.json` surfaces, missing current-hook-gate warnings plus legacy-alias warnings for hook-bearing Codex installs, the corrected nested Codex hook schema, trusted-project plus current interactive hook-activation drift, the maintained Codex custom-agent sandbox mismatch (`sandbox_mode = "read-only"` still writing in both the headless and maintained trusted interactive probes), the newly pinned Codex headless skill-config split (discovered `.agents/skills` inheritance works, a parent `[[skills.config]] enabled = false` entry was ignored, and an agent-local `[[skills.config]]` entry did not preload an undiscovered `skills/` path), and maintained self-hosted behavioral smoke coverage
- [~] Keep local proof orchestration honest:
  - `npm test` now fails fast when another full-suite run is already active in the same worktree
  - the follow-on work is removing more repo-local shared fixture and cwd assumptions so worktree-local serialization is no longer carrying as much reliability weight
  - the current worktree release gate is green again with a passing `npm test` and `npm run release:check`
- [x] Use [author-once-hardening.md](./author-once-hardening.md) as the initiative-level TODO for closing the main author-once gap between:
  - the author-once vision
  - the currently shipped compiler, proof, and onboarding reality
  - the remaining work is now follow-on proof packaging, host-refresh maintenance, and average-user UX polish rather than unresolved core hardening
- [x] Keep the self-hosted `pluxx-plugin` inside that same initiative as the average-user path:
  - the CLI remains the engine
  - the plugin should stay the guided operator surface
  - use [docs/pluxx-plugin-surface-audit.md](../pluxx-plugin-surface-audit.md) as the coverage and UX truth source
- [x] Close the last P0 fixture/proof rows from the translation hit list:
  - row-level translation docs are now in:
    - [docs/core-four-primitive-matrix.md](../core-four-primitive-matrix.md)
    - [docs/core-four-branding-metadata-audit.md](../core-four-branding-metadata-audit.md)
  - richer Claude-style skill fixture closure
  - remaining runtime/MCP fixture closure
  - remaining instructions proof closure
- [x] Close the remaining core translation-hit-list rows:
  - native Cursor/Codex/OpenCode fixture closure
  - migration normalization rows
  - lint/build/doctor explainability rows
  - install-lifecycle alignment rows
- [x] Tighten the OpenCode translation contract to match the current official docs:
  - permission-first agent output
  - legacy agent `tools` translated as compatibility input, not preferred output
  - native `skill` / `task` permission keys treated as real host surfaces
- [x] Tighten the local stdio MCP import path for the common "existing MCP to Pluxx plugin" workflow:
  - `init --from-mcp` now infers `passthrough` for project-relative runtimes like `./build/index.js`
  - `lint` now warns when a local stdio runtime is not bundled into passthrough
  - `doctor --consumer` now warns when installed `.mcp.json` files reference missing stdio runtime payloads
  - Claude-generated local stdio MCP output now anchors project-local runtime paths under `${CLAUDE_PLUGIN_ROOT}` instead of assuming plugin-root cwd
  - `lint` now warns when MCP startup or custom runtime hooks depend on installer-owned `scripts/check-env.sh`
  - build output and install-time MCP materialization now share the same stdio path normalization, so host-specific root vars no longer leak between Claude, Cursor, and Codex bundles
  - Codex local installs now rewrite plugin-owned stdio MCP command/arg paths to absolute installed plugin paths, so installed MCP launch no longer depends on workspace cwd
  - `lint` now warns when global stdio MCP config uses host-specific root vars such as `${CLAUDE_PLUGIN_ROOT}`
  - `doctor --consumer` now warns when an installed bundle still carries the wrong host root contract in stdio MCP config
  - docs now capture the portable `load-env.sh` / `bootstrap-runtime.sh` / `start-mcp.sh` pattern for native Node runtime dependencies
  - source-project runtime payload checks now treat `scripts/`, `assets/`, and `passthrough` as one bundled runtime surface when validating local stdio startup paths
  - `doctor --consumer` now reports which known runtime script-role files are present in an installed bundle
  - `install`, `doctor --consumer`, and `verify-install` now fail bundles whose actual stdio entry scripts still chain runtime startup through installer-owned `scripts/check-env.sh`
- [x] Make runtime readiness a first-class runtime primitive instead of manual per-host hook glue:
  - source config now models refresh dependencies and gate policy once
  - Claude Code, Cursor, and OpenCode now emit generated readiness behavior from that shared primitive
  - Codex now bundles translated hooks at `hooks/hooks.json` and keeps `.codex/readiness.generated.json` plus `.codex/hooks.generated.json` companions for explanation/debugging
  - generated Codex hooks now use the official nested matcher-group schema instead of the older flat entry shape
  - `lint` and `doctor` now explain the remaining Codex feature-gate and best-effort prompt-entry degradation for named skill/command readiness targets
  - `doctor --consumer` and `verify-install` now also warn when a hook-bearing installed Codex plugin bundle is missing `[features] plugin_hooks = true` in the checked project or user config layers; `hooks` remains the general non-plugin hook flag and defaults on, while `codex_hooks` is deprecated and no longer treated as a plugin-bundled hook fallback
  - `doctor --consumer` and `verify-install` now also warn when the checked project is not trusted in the user Codex config for project-local hook loading
  - `verify-install` now prints the concrete installed-bundle Codex warning code, explanation, and fix inline instead of only surfacing a warning count
  - `bun scripts/probe-codex-hooks-runtime.ts --json` now gives maintained isolated headless evidence that `hooks-no-trust`, `hooks-trusted`, and `codex-hooks-trusted` all return `OK` without firing the hook side effect
  - the remaining Codex runtime gap is now narrower: the targeted maintained reviewed `SessionStart` rerun still timed out with no project-local hook side effect and no `/hooks` review gate, so the real open question is whether reviewed hooks can ever fire at all, especially headlessly
  - the compiler now also treats `runtime` more explicitly as internal MCP/auth, readiness, and payload subcontracts
  - the readiness translation notes shared by generators, `lint`, and `doctor` are now centralized instead of repeated as drift-prone parallel strings
- [x] Surface host-visible branding gaps earlier in author workflows:
  - `lint` now warns when Cursor or Codex can render richer branding but the plugin is missing `brand.icon` and/or `brand.screenshots`
  - `doctor` now surfaces the same source-project warning before a plugin is treated as finished
- [x] Add installed MCP discovery for the common "I already configured this MCP in my agent" workflow:
  - `pluxx discover-mcp` reads Claude Code, Cursor, Codex, and OpenCode config locations
  - `pluxx init --from-installed-mcp <host:name>` imports a selected discovered server into a Pluxx project
  - discovered stdio/env auth is normalized without copying literal secret values
  - preserved native MCP auth overrides now survive that discovery/import path into generated `platforms.<host>.mcpServers.<server>` config and derived install-time `userConfig`
  - Claude MCP discovery now follows the real live CLI sources: project `.mcp.json` plus user/local `~/.claude.json`, and it no longer treats `settings.json` `mcpServers` as active install sources
  - duplicate Claude same-name MCPs across `.mcp.json`, top-level `~/.claude.json`, and nested local `projects[...]` entries now get path-qualified selectors instead of ambiguous duplicate ids
  - duplicate Claude same-name MCPs across nested local `projects[...]` blocks in `~/.claude.json` now also stay distinct, and the path-qualified selector is proven through `init --from-installed-mcp`
- [ ] Continue the post-closure follow-on work from the translation hit list:
  - public proof and packaging polish
  - install/distribution asset polish
  - future host-drift refreshes
- [ ] Consolidate the remaining translation papercuts that the readiness work made more obvious:
  - keep pushing the richer `skills` metadata layer into more native host emission and proof consumers
  - keep pushing the richer `commands` IR into more native host emission and install-time proof
  - add more installed behavioral proof for delegated agents, reload/discovery quirks, and publish/recovery flows
  - continue simplifying the plugin-guided average-user path so the proof state is easier to use without maintainer-level CLI literacy
- [ ] Close the highest-value open rows from the new reliability register:
  - deeper Codex custom-agent config-depth proof beyond the now-pinned headless-plus-interactive `sandbox_mode = "read-only"` mismatch, the newly pinned headless `skills.config` disable/preload caveats, the newly pinned `mcp_servers = {}` inheritance ceiling, the newly pinned invalid agent-local model failure path, and the now-pinned same-name user-local model precedence cases, including why successful delegated MCP paths still do not surface a root `mcp_tool_call` item in the parent event stream, installed-plugin skill preload, whether canonical authoring should preserve agent-local MCP config instead of only warning during migrate, how far generated `.codex/config.generated.toml` approval stanzas should go now that project-root, user-root, inherited delegated, agent-local inline approval, and explicit empty-agent-MCP override paths are all live-proven but not proven through the same config layer, and whether other approval or sandbox combinations behave differently
  - live Codex interactive-vs-headless hook execution proof across both `codex_hooks` and `hooks`
  - Claude managed-settings behavior beyond the current file-based verifier still requires a real managed-settings surface; the maintained probe now has shadow-scenario coverage for managed `disableAllHooks` and `allowManagedHooksOnly`, but registry, plist/MDM, server-managed policy, managed-scope plugin precedence, and broader hook-event proof are not closable from the current local environment alone
  - broader Codex and Claude adjunct distribution-surface proof

### 2. Flagship reference plugin

Goal:

- prove that Pluxx handles rich native plugin depth, not just basic MCP wrapping

Open work:

- [~] Build the chosen flagship example from a single maintained source project:
  - Docsalot-style `docs-ops`
- [ ] Use [docs/flagship-docs-ops-plugin.md](../flagship-docs-ops-plugin.md) as the concrete build spec
- [x] Add a maximal enterprise all-primitive reference example as a maintained source project:
  - `example/platform-change-ops`
  - [docs/platform-change-ops-reference-plugin.md](../platform-change-ops-reference-plugin.md)
- [~] Turn `platform-change-ops` into a full public proof stack instead of only a maintained stress fixture
  - it now installs and passes `verify-install` across Claude Code, Cursor, Codex, and OpenCode from the maintained source project
  - Claude native installed-state proof now follows the host's real cache layout instead of the old direct plugin-directory assumption
  - installed stdio MCP proof is now behavioral enough to smoke-launch the bundled runtime, not just validate files on disk
- [~] Keep the scaffold and live read-only Orchid proof in place:
  - `example/docs-ops`
  - `example/docs-ops/ORCHID-READONLY-DEMO.md`
- [x] Prove the flagship source project builds, installs, and passes `verify-install` across Claude Code, Cursor, Codex, and OpenCode:
  - `docs/docs-ops-core-four-proof.md`
- [x] Capture one cleaner before/after rewrite artifact on a real Orchid docs page:
  - `example/docs-ops/demo-rewrites/orchid-components-accordion.before.md`
  - `example/docs-ops/demo-rewrites/orchid-components-accordion.after.md`
- [x] Prove the generated plugin can be installed and used in Codex against the live Orchid Docsalot MCP:
  - `docs/orchid-docs-ops-codex-walkthrough.md`
- [x] Prove the same read-only inspect / pull / rewrite workflow through the official host CLIs across Claude Code, Cursor, Codex, and OpenCode:
  - `docs/docs-ops-core-four-proof.md`
- [x] Separate and mechanically prove the authenticated write/publish lane as distinct from the public Orchid MCP surface:
  - `docs/docs-ops-authenticated-publish-path.md`
- [~] Turn the cross-host workflow proof into a cleaner public-facing asset:
  - `docs/proof-and-install.md`
  - `site/examples/docs-ops-flagship.mdx`
  - the polished in-app walkthrough is still Codex-first today
- [x] Add a second clean-room public example that proves subagent-heavy research architecture and richer brand metadata from one maintained source project:
  - `example/exa-plugin`
  - `docs/exa-research-example.md`
- [~] Extend the Exa example from pure mechanical proof into real multi-host workflow proof:
  - Claude Code app PASS
  - Cursor CLI PASS
  - Codex Desktop app PASS
  - OpenCode CLI PASS
  - published npm package now includes the Claude plugin-agent manifest fix
  - public `pluxx test --install --trust --behavioral` now reflects the same Claude state as the repo-local proof
  - fresh Cursor CLI reruns currently hit a local macOS keychain/auth issue on this machine
  - older Claude CLI and Codex CLI headless failures are still ambient host-runtime issues on this machine
- [ ] Use the Exa example to tighten how much first-pass structure Pluxx can recover automatically from:
  - raw `init --from-mcp`
  - `autopilot`
  - `migrate` from a mature Claude-first plugin
- [ ] Reduce the remaining Exa delta between:
  - a credible imported or migrated starting point
  - and the final polished source project with specialist-agent taxonomy, richer packaging, and public install surfaces
- [ ] Exercise richer Claude skill surfaces where useful:
  - supporting files / references
  - scripts
  - `context: fork`
  - more advanced skill behavior
- [ ] Exercise the best equivalent native surfaces in Claude Code, Cursor, and OpenCode
- [ ] Use the reference plugin as:
  - a product demo
  - a regression fixture
  - a docs anchor
  - a sales proof asset
- [ ] Prove a real authenticated publish plus rollback against a safe private authoring target
- [ ] Document what is truly preserved vs translated vs degraded across the core four in this example

### 3. Docs and website ingestion proof

Goal:

- make docs ingestion visibly useful, not just implemented

Open work:

- [x] Capture a real connector-backed Firecrawl comparison on the current fixture set:
  - [docs/strategy/firecrawl-connector-docs-ingestion-proof.md](../strategy/firecrawl-connector-docs-ingestion-proof.md)
- [x] Rerun `npm run eval:docs-ingestion` with a real Firecrawl key
- [x] Compare `local` vs `firecrawl` results directly through the keyed local harness:
  - [docs/strategy/docs-ingestion-fixture-eval.md](../strategy/docs-ingestion-fixture-eval.md)
- [x] Capture a live before/after demo:
  - [docs/strategy/docs-ingestion-scaffold-before-after.md](../strategy/docs-ingestion-scaffold-before-after.md)
  - source URLs
  - selected pages
  - `.pluxx/sources.json`
  - `.pluxx/docs-context.json`
  - scaffold improvements
- [ ] Improve weak cases exposed by the fixture harness
- [ ] Tighten signal extraction:
  - product description quality
  - setup/auth hint quality
  - workflow hint quality
  - code-snippet/chrome filtering
- [ ] Decide whether ingestion should stay a context-prep layer or grow into a more explicit scaffold-quality comparison harness

### 4. Release-grade Pluxx plugin

Goal:

- make the Pluxx plugin itself feel polished and real

Open work:

- [ ] Harden metadata, prompts, screenshots, and install guidance
- [x] Verify the self-hosted plugin path across Claude Code, Cursor, Codex, and OpenCode:
  - [docs/pluxx-self-hosted-core-four-proof.md](../pluxx-self-hosted-core-four-proof.md)
- [x] Add the first repo-native public proof/install landing page:
  - [docs/proof-and-install.md](../proof-and-install.md)
- [ ] Keep the plugin thin and the CLI as the execution engine
- [x] Close the plugin workflow coverage gap documented in `docs/pluxx-plugin-surface-audit.md`
- [x] Promote runtime bootstrap to a first-class self-hosted plugin workflow:
  - `pluxx-bootstrap-runtime`
  - `/pluxx:bootstrap-runtime`
- [x] Promote guided refinement and proof to first-class self-hosted plugin workflows:
  - `pluxx-refine-plugin`
  - `/pluxx:refine-plugin`
  - `pluxx-prove-plugin`
  - `/pluxx:prove-plugin`
- [x] Promote host-translation review to a first-class self-hosted plugin workflow:
  - `pluxx-translate-hosts`
  - `/pluxx:translate-hosts`
- [x] Promote installed-bundle troubleshooting to a first-class self-hosted plugin workflow:
  - `pluxx-troubleshoot-install`
  - `/pluxx:troubleshoot-install`
- [ ] Keep `example/pluxx`, `plugins/pluxx`, and the published `pluxx-plugin` repo aligned
- [ ] Keep the self-hosted core-four proof current after major compatibility and lifecycle changes
- [ ] Decide what belongs in `example/pluxx` vs `plugins/pluxx`
- [ ] Evaluate a `gh skill`-compatible export/publish path for the skills-only slice of a Pluxx project
- [ ] Decide whether plugin distribution should stay in this repo or move later
- [ ] Decide the public install/distribution UX for docs and marketplace-like surfaces:
  - direct install commands
  - one-click install buttons where hosts support them
  - how much Pluxx should abstract host-specific install flows vs expose them clearly
- [ ] Turn the repo-native proof/install landing page into a stronger visual public asset

### 5. Public site and docs polish

- [~] Keep the homepage story centered on the one-to-many promise:
  - one maintained plugin source
  - four native destinations
  - no four drifting repos
- [ ] Add stronger proof sections to the site:
  - source project in
  - native bundles out
  - compatibility / truthful native mapping
  - install verification
- [ ] Tighten mobile layout bugs and overflow issues
- [ ] Make the docs/site structure easier for new visitors to scan quickly
- [ ] Turn the current proof assets into cleaner demo pages and screenshots

### 6. Customer discovery and GTM

Goal:

- learn where the strongest near-term pull actually is

Open work:

- [ ] Run two explicit customer lanes:
  - MCP vendors
  - internal AI platform / DevEx teams
- [ ] Build a short target list for each lane
- [ ] Create a lightweight outreach brief and demo flow for each lane
- [ ] Use real examples like PlayKit and the self-hosted Pluxx plugin as proof
- [ ] Keep public OSS messaging separate from later enterprise messaging
- [ ] Use the enterprise thesis in founder-led conversations, not as the public default story
- [ ] Keep named prospect lists, account research, and outreach notes in the private GTM workspace rather than the public repo
- [ ] Keep market/comparable-company notes in the private GTM workspace:
  - open-core references
  - pricing / packaging references
  - adjacent tooling like API/MCP infrastructure platforms

### 7. Next release readiness

- [x] Validate the current self-hosting flow end to end
- [x] Run tests, release smoke, and the packaged-runtime release gate before the next cut
- [x] Restore example parity for `examples/prospeo-mcp` so release smoke and the real package agree again
- [ ] Bump `package.json` to the next version
- [ ] Commit and push the release-prep fixes to `main`
- [ ] Push the matching `vX.Y.Z` tag so the GitHub Actions release workflow publishes to npm
- [ ] Verify the published npm version and GitHub release artifacts after the workflow completes

## Next

### 8. Import and discovery depth

These are already part of the strategy direction and should stay in view:

- [ ] Import beyond plain `tools/list` when possible
- [ ] Improve MCP resource and resource-template awareness
- [ ] Improve prompt-template awareness where useful
- [ ] Make imported projects feel less generic and more product-shaped from the start

### 9. Auth depth

- [ ] Improve truthful auth/import behavior for real remote MCPs
- [ ] Keep OAuth-ready scaffold support moving in the right direction
- [ ] Make auth hints and validation clearer in generated outputs

### 10. Eval depth and regression confidence

- [~] Keep `pluxx eval` meaningful as a product surface, not just a maintainer nicety
- [ ] Expand regression coverage where prompt-pack quality still feels too subjective
- [ ] Use the flagship plugin and docs-ingestion flow as stable eval fixtures

### 11. Migration and sync depth

- [ ] Keep `pluxx migrate` strong enough to be a true adoption wedge
- [ ] Keep `pluxx sync` safe enough that users trust refreshing from the MCP without losing human edits
- [ ] Improve change visibility after sync

### 12. Compatibility and truthfulness

- [ ] Keep the core-four compatibility matrix current
- [ ] Make preserve/translate/degrade/drop more visible in docs and demos
- [ ] Avoid promising equal support across hosts when the product cannot prove it
- [ ] Refresh the platform rules and generated compatibility docs from the first-party provider audit:
  - `src/validation/platform-rules.ts`
  - `docs/compatibility.md`
  - `docs/core-four-primitive-matrix.md`
  - `docs/core-four-provider-docs-audit.md`

## Later

### 13. Trust / distribution layer

This is a plausible later business, not the current build center.

- [ ] Organization-wide rollout
- [ ] Managed plugin distribution
- [ ] Version channels
- [ ] Approval and policy controls
- [ ] Runtime health visibility
- [ ] Adoption analytics
- [ ] Governance surfaces

### 14. Enterprise packaging

- [ ] Decide what the paid layer actually is
- [ ] Decide what stays OSS and what becomes operated product
- [ ] Decide whether enterprise features belong in this repo, a companion repo, or a hosted control plane

### 15. Marketplace and registry ideas

- [ ] Decide whether Pluxx should ever own a marketplace
- [ ] Decide whether Pluxx should ever own a private registry
- [ ] Avoid building commerce complexity before the authoring substrate is clearly winning

### 16. Provenance and trust

- [ ] Signing
- [ ] provenance
- [ ] trust-layer validation beyond the initial authoring workflow

## Explicitly Not The Current Build Center

These ideas may be real later, but they should not distort near-term prioritization:

- [ ] trying to support every host equally
- [ ] turning Pluxx into a generic AI control plane right now
- [ ] overbuilding analytics before real demand
- [ ] overbuilding enterprise governance before clear design-partner pull
- [ ] turning the public repo into a private GTM notebook

## Current Strategic Bets

These are the bets the repo is currently making.

### Bet 1

The OSS authoring substrate is the right first wedge.

### Bet 2

The one-to-many story is stronger than “cross-host compiler” alone.

### Bet 3

Raw MCP access is not enough; users need workflow shaping and native packaging.

### Bet 4

The later enterprise opportunity is real, but should be earned after the OSS wedge proves itself.

### Bet 5

The best near-term proof is not a longer strategy memo.

It is:

- one flagship reference plugin
- one live docs-ingestion demo
- one clean self-hosted plugin flow

## Suggested Immediate Sequence

If someone needs the next concrete path without reopening strategy debates:

1. Finish any remaining clarity drift between repo docs and Linear.
2. Build the flagship reference plugin.
3. Capture the live docs-ingestion proof.
4. Polish the self-hosted Pluxx plugin.
5. Run customer discovery in the two explicit lanes.
6. Cut the next release once those surfaces feel coherent together.

## Linear Note

This file is the comprehensive repo-native backlog.

Linear is where the detailed execution layer should live:

- issue-by-issue scope
- ownership
- project grouping
- state changes
- acceptance criteria when the work needs more precision

Workspace:

- [Orchid Automation Linear](https://linear.app/orchid-automation)
