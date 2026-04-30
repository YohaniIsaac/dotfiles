#
# ~/.zshrc
#

# --- Dotfiles bare repo ---
alias dotfiles='git --git-dir=$HOME/.dotfiles/ --work-tree=$HOME'

# --- Historial ---
HISTFILE=~/.zsh_history
HISTSIZE=10000
SAVEHIST=20000
setopt HIST_IGNORE_ALL_DUPS
setopt HIST_SAVE_NO_DUPS
setopt HIST_REDUCE_BLANKS
setopt SHARE_HISTORY
setopt APPEND_HISTORY

# --- Opciones de shell ---
setopt CORRECT
setopt INTERACTIVE_COMMENTS
setopt NO_BEEP

# --- Completado avanzado ---
autoload -Uz compinit
compinit

zstyle ':completion:*' menu select
zstyle ':completion:*' matcher-list 'm:{a-zA-Z}={A-Za-z}'
zstyle ':completion:*' list-colors ${(s.:.)LS_COLORS}
zstyle ':completion:*' group-name ''
zstyle ':completion:*:descriptions' format '%F{yellow}-- %d --%f'

# --- PATH ---
export PATH="$HOME/.local/bin:$PATH"
export EDITOR=nvim
export VISUAL=nvim

# --- Claude Code ---
export CLAUDE_CODE_NO_FLICKER=1

# --- Aliases ---
alias ls='ls --color=auto'
alias ll='ls -lah --color=auto'
alias la='ls -A --color=auto'
alias grep='grep --color=auto'
alias diff='diff --color=auto'
alias ip='ip -color=auto'
alias ..='cd ..'
alias ...='cd ../..'
alias mkdir='mkdir -pv'

# Fastfetch
command -v fastfetch &>/dev/null && fastfetch

# --- Starship ---
eval "$(starship init zsh)"

# --- Plugins ---
[[ -f /usr/share/zsh/plugins/zsh-autosuggestions/zsh-autosuggestions.zsh ]] && \
    source /usr/share/zsh/plugins/zsh-autosuggestions/zsh-autosuggestions.zsh

[[ -f /usr/share/zsh/plugins/zsh-syntax-highlighting/zsh-syntax-highlighting.zsh ]] && \
    source /usr/share/zsh/plugins/zsh-syntax-highlighting/zsh-syntax-highlighting.zsh

# --- fzf ---
command -v fzf &>/dev/null && source <(fzf --zsh)

# --- Atajos de teclado ---
bindkey -e
bindkey '^[[A' history-search-backward
bindkey '^[[B' history-search-forward
bindkey '^[[H' beginning-of-line
bindkey '^[[F' end-of-line
bindkey '^[[3~' delete-char

# opencode
export PATH=/home/yt/.opencode/bin:$PATH

# --- Zephyr workspaces ---
# Busca .venv hasta 2 niveles abajo desde $PWD.
# Se detiene al toparse con un subdirectorio que contenga .git (repo separado).
zenv() {
    local venv_path=""

    # Nivel 0: directorio actual
    if [[ -f "$PWD/.venv/bin/activate" ]]; then
        venv_path="$PWD/.venv"
    fi

    # Nivel 1
    if [[ -z "$venv_path" ]]; then
        for d1 in "$PWD"/*/; do
            [[ -d "$d1" ]] || continue
            [[ -d "${d1}.git" ]] && continue
            if [[ -f "${d1}.venv/bin/activate" ]]; then
                venv_path="${d1}.venv"
                break
            fi
        done
    fi

    # Nivel 2
    if [[ -z "$venv_path" ]]; then
        for d1 in "$PWD"/*/; do
            [[ -d "$d1" ]] || continue
            [[ -d "${d1}.git" ]] && continue
            for d2 in "${d1}"*/; do
                [[ -d "$d2" ]] || continue
                [[ -d "${d2}.git" ]] && continue
                if [[ -f "${d2}.venv/bin/activate" ]]; then
                    venv_path="${d2}.venv"
                    break 2
                fi
            done
        done
    fi

    if [[ -n "$venv_path" ]]; then
        source "$venv_path/bin/activate"

        # Setear ZEPHYR_BASE leyendo zephyr.base de .west/config
        local workspace_root="${venv_path:h}"
        local west_config=""
        if [[ -f "$workspace_root/.west/config" ]]; then
            west_config="$workspace_root/.west/config"
        elif [[ -f "${workspace_root:h}/.west/config" ]]; then
            west_config="${workspace_root:h}/.west/config"
            workspace_root="${workspace_root:h}"
        fi

        if [[ -n "$west_config" ]]; then
            local zbase
            zbase=$(grep -m1 '^\s*base\s*=' "$west_config" | sed 's/.*=\s*//')
            [[ -n "$zbase" ]] && export ZEPHYR_BASE="$workspace_root/$zbase"
        fi

        echo "venv activo: ${${venv_path:h}:t}"
    else
        echo "zenv: no se encontró .venv (máx. 2 niveles, sin cruzar repos git)" >&2
        return 1
    fi
}


# BEGIN opam configuration
# This is useful if you're using opam as it adds:
#   - the correct directories to the PATH
#   - auto-completion for the opam binary
# This section can be safely removed at any time if needed.
[[ ! -r '/home/yt/.opam/opam-init/init.zsh' ]] || source '/home/yt/.opam/opam-init/init.zsh' > /dev/null 2> /dev/null
# END opam configuration

export PATH=$PATH:/opt/ba2-toolchain/bin
