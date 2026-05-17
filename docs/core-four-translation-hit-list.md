# Core-Four Translation Hit List

Last updated: 2026-05-17

## Doc Links

- Role: concrete closure tracker for turning core-four audit research into documented, implemented, and proven translation behavior
- Related:
  - [docs/core-four-primitive-matrix.md](./core-four-primitive-matrix.md)
  - [docs/core-four-provider-docs-audit.md](./core-four-provider-docs-audit.md)
  - [docs/core-four-branding-metadata-audit.md](./core-four-branding-metadata-audit.md)
  - [docs/core-four-primitive-implementation-plan.md](./core-four-primitive-implementation-plan.md)
  - [docs/compatibility.md](./compatibility.md)
  - [docs/todo/queue.md](./todo/queue.md)
  - [docs/roadmap.md](./roadmap.md)
- Update together:
  - [docs/core-four-primitive-matrix.md](./core-four-primitive-matrix.md)
  - [docs/compatibility.md](./compatibility.md)
  - [docs/todo/queue.md](./todo/queue.md)
  - [docs/todo/master-backlog.md](./todo/master-backlog.md)
  - [docs/roadmap.md](./roadmap.md)

Use this doc when the question is:

- what exactly do we still need to close from the core-four audits
- which mapped features are already implemented vs only researched
- what concrete steps remain before we can honestly say every mapped feature has a documented translation story

This is the execution bridge between:

- audit research
- compiler rules
- generator behavior
- lint/build explainability
- proof fixtures

## Definition Of Done For A Mapped Feature

Do not mark a mapped feature “closed” just because it appears in an audit doc.

A mapped feature is only truly closed when all of these are true:

1. its canonical intent is described clearly
2. its per-host outcome is documented as `preserve`, `translate`, `degrade`, or `drop`
3. the capability registry encodes that outcome
4. the relevant generator actually emits the strongest honest native form
5. lint/doctor/build explain the outcome clearly
6. at least one fixture or proof surface exercises it

## Current Status

What is already materially true:

- the first provider-audit refresh pass landed in:
  - `src/validation/platform-rules.ts`
  - `docs/compatibility.md`
  - `docs/core-four-primitive-matrix.md`
  - `docs/core-four-install-update-lifecycle.md`
- the branding audit already proved that rich shared `brand` metadata is Codex-first, narrower in Cursor, and mostly absent as a manifest-backed surface in Claude Code and OpenCode
- the flagship `docs-ops` and self-hosted `pluxx` examples already prove the core install/verify loop across all four hosts

What is still not fully closed:

- public-facing proof packaging still lags the underlying generator and fixture truth
- visual install and distribution assets still need to feel as polished as the code and tests already are
- future host-doc changes still need the same audit -> registry -> generator -> proof loop

What just moved materially closer to closed:

- agent/autopilot prompts now explicitly teach native shaping from raw MCP intent into commands, argument-bearing entrypoints, and specialist agents/subagents
- lint now uses the audited registry for Cursor, Codex, and OpenCode skill-frontmatter explainability instead of only hardcoded Cursor assumptions
- build and doctor summaries now include row-level native-surface detail lines for non-preserve buckets
- hook translation closure is stronger because Cursor no longer emits unsupported `loop_limit` fields on non-supported hook events, and the hook translation fixture now asserts the Claude/Cursor/Codex/OpenCode outcomes directly
- a rich Claude-style skill fixture with supporting files and advanced frontmatter now rebuilds cleanly to Claude Code, Cursor, Codex, and OpenCode
- runtime and MCP fixture closure now covers bearer auth, OAuth-shaped runtime auth, and local stdio MCP across the core four, with lint and doctor calling out external runtime state explicitly
- preserved native MCP auth no longer stops at migrate: installed-MCP discovery now keeps host-native auth overrides, `init --from-installed-mcp` carries them into generated `platforms.<host>.mcpServers.<server>` config, and build/install now consume those preserved overrides when materializing host bundles
- installed hook env parity now translates across Claude Code, Cursor, Codex, and OpenCode, so plugin-owned command hooks rehydrate `.pluxx-user.json` instead of only the Claude wrapper path doing that
- runtime readiness is now modeled as first-class runtime intent, with generated Claude/Cursor/OpenCode behavior and bundled Codex hook output plus companion explainability
- shared instruction intent is now proven across all four native surfaces: `CLAUDE.md`, `AGENTS.md`, and OpenCode runtime instruction injection
- Codex command degradation closure is tighter because `AGENTS.md` routing guidance and `.codex/commands.generated.json` now read from the same richer command metadata seam
- Codex/OpenCode skill-frontmatter explainability now explicitly covers `when_to_use`, `user-invocable`, `model`, and `effort` instead of falling back to generic unsupported-field prose
- hook explainability closure is tighter because prompt/failClosed/loop_limit lint messaging now routes through the shared hook registry, and Claude prompt-hook warnings are event-aware instead of claiming the generator drops all prompt hooks
- hook generator closure is tighter because Cursor now drops unsupported hook events from generated bundles instead of only warning in lint, so the emitted `hooks/hooks.json` matches the documented Cursor event surface
- non-command hook-type degradation is now less silent because Codex and OpenCode lint warnings route through the shared hook registry, and the generated Codex hook companion now records dropped `http` / `mcp_tool` / `agent` hook types explicitly
- migrate/import fidelity is tighter for native Codex specialists because `sandbox_mode` now survives the TOML -> canonical markdown -> rebuilt TOML path instead of being shaved off during migrate

The previous “remaining P0 fixture/proof rows” are now closed.
The remaining work is now mainly public-proof packaging and future host-refresh maintenance, not unresolved core translation behavior.

## P0 Closure Rules

These are the non-negotiable rules for the remaining work:

- do not fake parity where the host has no honest native equivalent
- do not leave translation behavior as tribal knowledge
- do not ship a host-specific implementation without a corresponding documented translation rule
- do not say a surface is “supported” unless we can point to both generator behavior and proof

## P0 Hit List

### 1. Document the row-level translation contract for every compiler bucket

- [x] Add a row-level translation appendix to [docs/core-four-primitive-matrix.md](./core-four-primitive-matrix.md) for:
  - skills
  - commands
  - agents
  - hooks
  - permissions
  - runtime
  - distribution
- [x] For each row, state one of:
  - `preserve`
  - `translate`
  - `degrade`
  - `drop`
- [x] For each row, include the native target surface, not just the abstract bucket
- [x] For each row, include one sentence on the user-visible effect

### 2. Turn the branding audit into an explicit translation table

The branding audit is already strong, but it is still audit-shaped instead of closure-shaped.

For each field below, make the translation outcome explicit in docs and tests:

| Field | Expected outcome | Concrete next step |
| --- | --- | --- |
| `displayName` | preserve in Codex, drop elsewhere for manifest-backed metadata | add row-level translation table entry and snapshot/assertion coverage |
| `shortDescription` | preserve in Codex, drop elsewhere for manifest-backed metadata | same |
| `longDescription` | preserve in Codex, drop elsewhere | same |
| `category` | preserve in Codex, drop elsewhere | same |
| `color` | preserve in Codex, drop elsewhere | same |
| `icon` | translate to Cursor logo, preserve in Codex interface, drop as shared manifest metadata elsewhere | document exact mapping and add generator assertions |
| `defaultPrompts` | preserve in Codex only | document Codex-first treatment and assert no misleading emission elsewhere |
| `websiteURL` | translate to Cursor homepage, preserve in Codex, drop elsewhere | document and test |
| `screenshots` | preserve in Codex only | document Codex-first treatment and add proof asset assertions |
| `privacyPolicyURL` | preserve in Codex only | document and test |
| `termsOfServiceURL` | preserve in Codex only | document and test |

Status:

- [x] Row-level translation table now exists in [docs/core-four-branding-metadata-audit.md](./core-four-branding-metadata-audit.md)
- [x] Generator assertions now cover the full shared brand field set row by row; remaining brand work is public-facing packaging rather than compiler ambiguity

### 3. Close the skills translation matrix

We already know skills are the most portable layer. The remaining work is documenting and proving the deltas.

- [x] Create an explicit Claude-first frontmatter translation table covering:
  - `when_to_use`
  - `argument-hint`
  - `arguments`
  - `disable-model-invocation`
  - `user-invocable`
  - `allowed-tools`
  - `model`
  - `effort`
  - `context`
  - `agent`
  - `hooks`
  - `paths`
  - `shell`
- [x] For each field, state:
  - Claude outcome
  - Cursor outcome
  - Codex outcome
  - OpenCode outcome
- [x] Add one fixture that uses the richer Claude-style skill surface and rebuilds to all four
- [x] Add lint/build output that explains the strongest interesting degradations instead of generic warnings

### 4. Close the commands translation matrix

- [x] Document the exact rule that commands are:
  - preserved in Claude
  - preserved in Cursor
  - degraded into skills/routing in Codex
  - preserved in OpenCode
- [x] Add a fixture that starts with command-rich source intent and snapshot the four outputs
- [x] Make build summaries explicitly call out the Codex degradation path
- [x] Add a shared canonical command metadata seam so Codex and OpenCode stop normalizing command alias fields differently
- [x] Make lint explicitly call out Codex-only degradation for command `agent` / `subtask` / `model` metadata

### 5. Close the agents translation matrix

- [x] Document the strongest native mapping for:
  - Claude plugin `agents/`
  - Cursor agents/subagents
  - Codex `.codex/agents/*.toml`
  - OpenCode agents/config-driven specialists
- [x] Add one real imported or synthetic fixture that proves:
  - source host specialist intent
  - successful translation into the other three hosts
- [x] Make migration tests prove we normalize agent intent semantically, not syntactically
- [x] Add a shared canonical agent metadata seam so Claude, Cursor, Codex, and OpenCode stop re-parsing frontmatter aliases differently
- [x] Make lint explicitly call out agent fields that still degrade on Cursor and Codex instead of hiding that loss inside generated prose notes

### 6. Close the hooks translation matrix

- [x] Add a row-level hook translation table for:
  - event surface
  - storage location
  - runtime behavior
  - whether the outcome is preserve, translate, or degrade
- [x] Add one fixture with meaningful hook intent and assert:
  - Claude preserve/translate path
  - Cursor hook JSON path
  - Codex bundled hook path plus broader host-config caveats
  - OpenCode runtime handler path
- [x] Make lint/build surface hook degradation explicitly instead of burying it in warnings

### 7. Close the permissions translation matrix

This is still the most important under-documented bucket.

- [x] Document the canonical permission intent model:
  - `allow`
  - `ask`
  - `deny`
- [x] Document where that intent lands per host:
  - Claude skill/agent/runtime surfaces
  - Cursor permission config and hook/subagent control planes
  - Codex approvals, sandbox, hook matchers, and agents
  - OpenCode permission config and per-agent overrides
- [x] Add at least one permission-rich fixture that proves the translation path
- [x] Make `migrate` normalize host-specific permission syntax into canonical intent
- [x] Make lint call out the Cursor multi-plane permission translation explicitly instead of only warning about Codex and OpenCode caveats

### 8. Close the runtime and MCP translation matrix

- [x] Document transport mapping explicitly:
  - Claude `stdio` / `http` / `sse`
  - Cursor `stdio` / `sse` / `streamable http`
  - Codex `stdio` / `streamable HTTP`
  - OpenCode local/remote MCP config
- [x] Document auth mapping explicitly:
  - env interpolation
  - bearer token
  - OAuth
  - static OAuth credentials where supported
- [x] Add fixtures for:
  - remote bearer token MCP
  - OAuth-ready MCP shape
  - local stdio MCP
- [x] Make `doctor` and `lint` say clearly when the target host needs external config/runtime state rather than bundle-local state

### 9. Close the instructions translation matrix

- [x] Document the fallback hierarchy per host:
  - Claude `CLAUDE.md`
  - Cursor `rules/` plus `AGENTS.md`
  - Codex `AGENTS.md`, `AGENTS.override.md`, config fallbacks
  - OpenCode `AGENTS.md`, `CLAUDE.md`, config `instructions`
- [x] Add proof that migration/build preserve instruction intent across all four without hand-copying prose
- [x] Make examples stop implying there is only one universal instruction file shape
- [x] Make the compiler and lint use the configured instructions source path directly instead of only assuming root-level fallback filenames

### 10. Close the install/update/distribution matrix

- [x] Keep [docs/core-four-install-update-lifecycle.md](./core-four-install-update-lifecycle.md) in sync with the provider audit
- [x] Add one row-level distribution table covering:
  - install surface
  - update surface
  - reload behavior
  - restart requirement
  - update discovery model
- [x] Keep branding metadata, install scripts, and published proof artifacts aligned with this matrix

## P1 Proof And Fixture Hit List

These are the concrete fixtures that should exist so the translation docs are backed by runnable proof.

- [x] Claude-rich skill fixture:
  - supporting files
  - advanced frontmatter
  - hooks
  - `context: fork`
- [x] Cursor-native fixture:
  - slash commands
  - hook events
  - MCP auth/config nuance
  - subagents
- [x] Codex-native fixture:
  - plugin interface metadata
  - `.app.json`
  - hooks guidance path
  - agents metadata
- [x] OpenCode-native fixture:
  - JS or TS plugin runtime
  - runtime hook handlers
  - config-driven instructions
  - permission-rich agents

## P1 Explainability Hit List

- [x] `lint` should explain not only that a feature degrades, but where it lands in the target host
- [x] `build` summaries should name the native surface emitted for each major translation
- [x] `doctor` should explain when an imported project still carries source-host assumptions
- [x] `compatibility.md` should be regenerated after each material closure pass, not only after audit refreshes

## Order Of Execution

If we want to close this without thrashing, do it in this order:

1. row-level docs for translation outcomes
2. capability registry closure
3. generator closure
4. lint/build/doctor explainability
5. fixture and proof closure
6. public proof packaging

## Current Closure State

For the current prime-time core four, the mapped translation rows are now materially closed across:

- row-level docs
- capability registry behavior
- generator behavior
- lint/build/doctor explainability
- fixture and migration proof
- installed bundled permission-hook proof for Claude and Cursor bundles
- shared agent translation explainability for Cursor, Codex, and OpenCode
- manifest-less Claude, nested Cursor rule plus `AGENTS.md` provenance, Codex override-instructions, and OpenCode configured-instruction plus entrypoint migrate fidelity
- richer emitted skill companion metadata for Codex and OpenCode

What remains is not “can Pluxx translate this row truthfully?” but:

- does the public proof surface make that truth obvious quickly
- do the install and listing assets feel polished enough
- do future host-doc changes keep the matrix current

## What “Closed” Looks Like

We can say the audit work is truly absorbed when:

- every mapped row has a documented translation outcome
- every non-trivial row points to the generator and proof that back it up
- the examples prove the strongest interesting native deltas
- users can predict how Pluxx will translate a feature before they build

That bar is now materially met for the current audited core four.
