# Vendored agent skills

The skill folders in this directory are copied verbatim from
[mattpocock/skills](https://github.com/mattpocock/skills) so that every
Claude Code session on this repo (local or cloud) gets the same process.

- Upstream commit: `49dd158d1076134a641b33efb035946536778336` (2026-10-09)
- Plugin version: `mattpocock-skills` 1.3.1 — only the skills listed in its
  `.claude-plugin/plugin.json` (engineering + productivity) are included
- License: MIT, see `LICENSE-mattpocock-skills`

If the `mattpocock-skills` plugin is also installed in your local Claude Code,
disable it for this project to avoid every skill appearing twice.

To update: re-copy the folders listed in upstream `plugin.json` and bump the
commit above in the same commit.
