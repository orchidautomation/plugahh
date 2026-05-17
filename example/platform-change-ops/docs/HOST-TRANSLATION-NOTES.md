# Host Translation Notes

This example is intentionally richer than any one host can preserve 1:1.

## Claude Code

- best native surface for hook richness and skill frontmatter
- strongest place to preserve matcher-based pre-tool and post-tool policy hooks
- preserves prompt hooks on Claude-supported lifecycle events

## Cursor

- preserves commands well
- preserves hook `matcher`, `failClosed`, and supported-event `loop_limit`
- narrows skill and agent metadata more than Claude

## Codex

- commands degrade into generated routing guidance and companion files
- bundles translated hooks at `hooks/hooks.json`
- keeps `.codex/hooks.generated.json` as a companion/debug mirror
- readiness keeps `.codex/readiness.generated.json` guidance because plugin-bundled hook activation requires `[features].plugin_hooks = true`; `[features].hooks = true` is the general non-plugin hook flag, while older docs or configs may still mention deprecated `codex_hooks`

## OpenCode

- runtime- and permission-centric target
- hook intent translates into generated runtime handlers
- command and agent semantics survive, but not in the same manifest shape as Claude or Cursor
