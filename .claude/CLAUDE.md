# Global Claude Code Rules

## System Configuration (Dotfiles)

The user's system configuration is stored in a bare git repo at `$HOME/.dotfiles/`, managed via:

```bash
alias dotfiles='git --git-dir=$HOME/.dotfiles/ --work-tree=$HOME'
```

All dotfiles (shell config, AGS, Hyprland, etc.) live directly under `$HOME` and are tracked with this alias instead of regular `git`.

## Git Commits

- NEVER add a "Co-Authored-By" line or any signature at the end of commit messages.
- Do NOT sign commit with `--gpg-sign` or `-S` unless explicitly asked.
- Keep commit messages clean - no attribution footers.

## CLAUDE.md placement

- Any `CLAUDE.md` (project-level instructions/context) must always live inside a `.claude/` directory: `.claude/CLAUDE.md`. Never place it at the repository/project root or anywhere else.
- If `.claude/` doesn't exist yet in that repo/directory, create it first.
