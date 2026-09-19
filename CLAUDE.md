# Adlytic — Claude / Cursor project rules

## GG = use all skills

If the user ends a message with **`GG`**:

- Activate **maximal skill usage** for that request.
- Read and apply **all relevant** skills in `.claude/skills/` (SaaS + analytics + UI + process), not just one.
- If something useful is not installed, **download it from GitHub / skill registries** (see `.claude/skills/ADLYTIC_SKILLS_CATALOG.md`) and use it.
- Do not wait for permission to load skills when GG is present.

Full protocol: see `AGENTS.md`.
