# Proof And Install

Last updated: 2026-05-17

## Doc Links

- Role: public-facing proof and install landing page
- Related:
  - [README.md](../README.md)
  - [docs/first-proof-demo-asset-pack.md](./first-proof-demo-asset-pack.md)
  - [docs/pluxx-self-hosted-core-four-proof.md](./pluxx-self-hosted-core-four-proof.md)
  - [docs/docs-ops-core-four-proof.md](./docs-ops-core-four-proof.md)
  - [docs/docs-ops-authenticated-publish-path.md](./docs-ops-authenticated-publish-path.md)
  - [docs/exa-research-example.md](./exa-research-example.md)
  - [docs/orchid-docs-ops-codex-walkthrough.md](./orchid-docs-ops-codex-walkthrough.md)
  - [docs/core-four-install-update-lifecycle.md](./core-four-install-update-lifecycle.md)
  - [docs/strategy/docs-ingestion-scaffold-before-after.md](./strategy/docs-ingestion-scaffold-before-after.md)
  - [docs/core-four-provider-docs-audit.md](./core-four-provider-docs-audit.md)
- Update together:
  - [README.md](../README.md)
  - [docs/first-proof-demo-asset-pack.md](./first-proof-demo-asset-pack.md)

This is the shortest current repo-native path to:

- understand what Pluxx already proves
- install the released self-hosted plugin in your host of choice
- run the strongest current demos in the right order

## The Story In One Screen

```text
raw MCP or host-native plugin
        ->
one maintained Pluxx source project
        ->
native Claude / Cursor / Codex / OpenCode bundles
        ->
install in the host you actually use
        ->
verify the installed bundle instead of trusting dist alone
```

## Fastest Proof Path

If you want the shortest credible answer to "is this real yet?", use this order:

1. [Self-hosted core-four proof](./pluxx-self-hosted-core-four-proof.md)
   What it proves: one maintained `example/pluxx` source project builds, installs, and passes `verify-install` across Claude Code, Cursor, Codex, and OpenCode.

2. [Docs Ops core-four proof](./docs-ops-core-four-proof.md)
   What it proves: the flagship `example/docs-ops` source project builds, installs, passes `verify-install`, and completes read-only inspect/rewrite workflows through the official Claude Code, Cursor, Codex, and OpenCode CLIs.

3. [Docs Ops live Codex walkthrough](./orchid-docs-ops-codex-walkthrough.md)
   What it proves: one maintained `docs-ops` source project compiles into a real in-app Codex plugin and talks to Orchid's live Docsalot MCP.

4. [Docs Ops authenticated publish path](./docs-ops-authenticated-publish-path.md)
   What it proves: the flagship example no longer treats Orchid's public MCP endpoint as a publish surface; the private write lane is separately modeled, install/runtime-configurable, and mechanically guarded.

5. [Orchid Accordion before/after rewrite](../example/docs-ops/demo-rewrites/orchid-components-accordion.after.md)
   What it proves: the flagship example produces user-visible output, not just config files.

6. [Exa Research Example](./exa-research-example.md)
   What it proves: Exa-style research workflows can ship natively across Claude Code, Cursor, Codex, and OpenCode from one maintained source project, while keeping bundled MCP wiring, specialist agents, and host-native install surfaces.

7. [Docs-ingestion scaffold before/after demo](./strategy/docs-ingestion-scaffold-before-after.md)
   What it proves: Firecrawl-backed sourced context changes the real generated scaffold, not just an eval row.

8. [Core-four provider docs audit](./core-four-provider-docs-audit.md)
   What it proves: the compatibility story is grounded in first-party provider docs, not hand-waving.

## Public Proof Panels

If you need the public story in the fewest moving parts, use these four proof panels:

| Panel | Read this | Supported claim |
| --- | --- | --- |
| Self-hosted core four | [pluxx-self-hosted-core-four-proof](./pluxx-self-hosted-core-four-proof.md) | one maintained source project can build, install, and verify across the core four |
| Flagship read-only workflow | [docs-ops-core-four-proof](./docs-ops-core-four-proof.md) | the flagship example is real across the official CLIs, not just one host |
| Flagship authenticated publish split | [docs-ops-authenticated-publish-path](./docs-ops-authenticated-publish-path.md) | read-only Orchid access is not being mislabeled as a publish path |
| Exa distribution proof | [exa-research-example](./exa-research-example.md) | Exa-style research workflows can ship natively across the core four from one maintained source project |
| Docs-ingestion improvement | [docs-ingestion scaffold before/after](./strategy/docs-ingestion-scaffold-before-after.md) | sourced product/docs context materially improves the generated scaffold |

## Install The Released Pluxx Plugin

These commands install the released self-hosted `pluxx-plugin` from GitHub Releases.

### Claude Code

```bash
curl -fsSL https://github.com/orchidautomation/pluxx-plugin/releases/latest/download/install-claude-code.sh | bash
```

Then run `/reload-plugins`.

### Cursor

```bash
curl -fsSL https://github.com/orchidautomation/pluxx-plugin/releases/latest/download/install-cursor.sh | bash
```

Then reload the window or restart Cursor.

### Codex

```bash
curl -fsSL https://github.com/orchidautomation/pluxx-plugin/releases/latest/download/install-codex.sh | bash
```

Then use `Plugins > Refresh` if available, otherwise restart Codex.

### OpenCode

```bash
curl -fsSL https://github.com/orchidautomation/pluxx-plugin/releases/latest/download/install-opencode.sh | bash
```

Then reload or restart OpenCode.

For the fuller per-host install, update, and reload behavior, use [docs/core-four-install-update-lifecycle.md](./core-four-install-update-lifecycle.md).

Those follow-up notes are now backed by repo install-surface tests, not just walkthrough copy.

## Run Pluxx From Source

If you want to prove the product without installing the released self-hosted plugin first, use the source workflow directly:

```bash
npx @orchid-labs/pluxx init --from-mcp https://example.com/mcp --name my-plugin --yes

cd my-plugin
npx @orchid-labs/pluxx doctor
npx @orchid-labs/pluxx lint
npx @orchid-labs/pluxx build
npx @orchid-labs/pluxx install --target codex --trust
npx @orchid-labs/pluxx verify-install --target codex
```

Swap `codex` for `claude-code`, `cursor`, or `opencode` when you want to validate a different host.

If you installed the published CLI globally, the shortest lifecycle commands are:

```bash
pluxx --version
pluxx upgrade
```

`pluxx upgrade` upgrades the global npm install on your PATH. Repo-local `node ../../bin/pluxx.js ...` and `npx @orchid-labs/pluxx ...` flows stay separate.

## Install The Exa Example From Source

These installers build the public Exa example from the repo source and then install the native bundle into the selected host.

Important:

- the Exa example includes a local `sessionStart` hook: `scripts/check-exa-setup.sh`
- the hook only reports whether `EXA_API_KEY` is set and prints setup guidance
- the direct installers intentionally trust that hook on your behalf
- the equivalent source-path install command is `pluxx install --target <host> --trust`

### Claude Code

```bash
curl -fsSL https://raw.githubusercontent.com/orchidautomation/pluxx/main/example/exa-plugin/release/install-claude-code.sh | bash
```

### Cursor

```bash
curl -fsSL https://raw.githubusercontent.com/orchidautomation/pluxx/main/example/exa-plugin/release/install-cursor.sh | bash
```

### Codex

```bash
curl -fsSL https://raw.githubusercontent.com/orchidautomation/pluxx/main/example/exa-plugin/release/install-codex.sh | bash
```

### OpenCode

```bash
curl -fsSL https://raw.githubusercontent.com/orchidautomation/pluxx/main/example/exa-plugin/release/install-opencode.sh | bash
```

Current release note:

- the latest published npm package is `@orchid-labs/pluxx@0.1.20`
- the published npm package now includes the Claude plugin-agent manifest fix
- the public `pluxx test --install --trust --behavioral` path now matches the repo-local Exa proof state

## Best Demo Flow

Use this when you want a clean founder demo, customer walkthrough, or investor pass:

1. Start with [README](../README.md)
   Frame: one maintained plugin source project, four native destinations.

2. Show [Self-hosted core-four proof](./pluxx-self-hosted-core-four-proof.md)
   Frame: installed-state verification is real.

3. Show [Docs Ops core-four proof](./docs-ops-core-four-proof.md)
   Frame: the flagship example is mechanically real across the core four, not only inside one host.

4. Show [Docs Ops live Codex walkthrough](./orchid-docs-ops-codex-walkthrough.md)
   Frame: raw MCP is not enough; shaped workflows matter.

5. Show [Docs Ops authenticated publish path](./docs-ops-authenticated-publish-path.md)
   Frame: read-only public MCP access is not being passed off as write/publish support.

6. Show [Exa Research Example](./exa-research-example.md)
   Frame: Pluxx can take a Claude-first research-operator shape with specialist agents, rich branding, and command surfaces and compile it across the core four from one source.

7. Show the [Accordion before/after output](../example/docs-ops/demo-rewrites/orchid-components-accordion.after.md)
   Frame: the product changes user-visible output, not only internals.

8. Show [Docs-ingestion scaffold before/after demo](./strategy/docs-ingestion-scaffold-before-after.md)
   Frame: sourced product/docs context materially improves the scaffold.

9. Close with [Core-four provider docs audit](./core-four-provider-docs-audit.md)
   Frame: the compatibility story is truthful and provider-backed.

## What This Page Does Not Claim

This page is intentionally narrow.

It does not claim:

- the website is already the strongest public surface
- every host already has equally polished in-app flagship proof yet
- Orchid authenticated publish is already proven end to end
- the trust/distribution layer is already the main product

It does claim:

- the core product thesis is now backed by real repo-native proof
- the released self-hosted plugin has one-command install paths
- the current strongest demos can be followed without digging through maintainer notes
