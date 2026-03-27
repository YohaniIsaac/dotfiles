#!/usr/bin/env bash
## Wallpaper Selector with Matugen integration
## Uses JSON cache for fast color selection

wallpaperDir="$HOME/Pictures/wallpapers"
themesDir="$HOME/.config/rofi/themes"
CACHE_FILE="$HOME/.config/hypr/wallpaper-colors.json"
SWATCH_DIR="$HOME/.cache/hypr-wallswatches"

FPS=60
TYPE="any"
DURATION=3

declare -A SCHEME_TYPES=(
    ["1"]="scheme-tonal-spot"
    ["2"]="scheme-vibrant"
    ["3"]="scheme-expressive"
    ["4"]="scheme-content"
    ["5"]="scheme-fidelity"
    ["6"]="scheme-fruit-salad"
    ["7"]="scheme-monochrome"
    ["8"]="scheme-neutral"
)

declare -A SCHEME_NAMES=(
    ["1"]="Tonal Spot"
    ["2"]="Vibrant"
    ["3"]="Expressive"
    ["4"]="Content"
    ["5"]="Fidelity"
    ["6"]="Fruit Salad"
    ["7"]="Monochrome"
    ["8"]="Neutral"
)

# Load JSON cache
load_cache() {
    if [[ -f "$CACHE_FILE" ]]; then
        CACHE_DATA=$(cat "$CACHE_FILE")
    else
        CACHE_DATA="{}"
    fi
}

# Get colors for a wallpaper from JSON
get_wallpaper_colors() {
    local wallpaper="$1"
    local basename=$(basename "$wallpaper")
    echo "$CACHE_DATA" | python3 -c "
import json, sys
data = json.load(sys.stdin)
wallpapers = data.get('wallpapers', {})
if '$basename' in wallpapers:
    colors = wallpapers['$basename'].get('colors', {})
    for idx in range(6):
        print(colors.get(str(idx), '#000000'))
" 2>/dev/null || echo -e "#000000\n#000000\n#000000\n#000000\n#000000\n#000000"
}

# Get scheme colors for a wallpaper and color index from JSON
get_scheme_colors() {
    local wallpaper="$1"
    local color_idx="$2"
    local scheme="$3"
    local basename=$(basename "$wallpaper")
    
    echo "$CACHE_DATA" | python3 -c "
import json, sys
data = json.load(sys.stdin)
wallpapers = data.get('wallpapers', {})
if '$basename' in wallpapers:
    schemes = wallpapers['$basename'].get('schemes', {})
    if '$scheme' in schemes:
        scheme_data = schemes['$scheme'].get('$color_idx', {})
        print(scheme_data.get('primary', '#000000'))
        print(scheme_data.get('secondary', '#000000'))
        print(scheme_data.get('tertiary', '#000000'))
" 2>/dev/null || echo -e "#000000\n#000000\n#000000"
}

# Generate swatch for color selection
generate_color_swatch() {
    local color="$1"
    local output="$2"
    python3 "$HOME/.config/hypr/scripts/color-swatch.py" "$color" "$color" "$color" "$output" 2>/dev/null
}

# Generate combined swatch for scheme preview
generate_scheme_swatch() {
    local primary="$1"
    local secondary="$2"
    local tertiary="$3"
    local output="$4"
    python3 "$HOME/.config/hypr/scripts/color-swatch.py" "$primary" "$secondary" "$tertiary" "$output" 2>/dev/null
}

# Show color selection menu
show_color_menu() {
    local wallpaper="$1"
    local basename=$(basename "$wallpaper")
    
    # Get colors from JSON
    local colors=()
    while IFS= read -r line; do
        colors+=("$line")
    done < <(get_wallpaper_colors "$wallpaper")
    
    # Generate swatches for each color
    mkdir -p "$SWATCH_DIR"
    
    for i in {0..5}; do
        local color="${colors[$i]:-#000000}"
        local swatch_path="$SWATCH_DIR/${basename}_color_${i}.png"
        generate_color_swatch "$color" "$swatch_path"
        
        if [[ -f "$swatch_path" ]]; then
            printf "%d. %s\x00icon\x1f%s\n" "$i" "$color" "$swatch_path"
        else
            printf "%d. %s\n" "$i" "$color"
        fi
    done
}

# Show scheme menu with color index
show_scheme_menu() {
    local wallpaper="$1"
    local color_idx="$2"
    local basename=$(basename "$wallpaper")
    
    mkdir -p "$SWATCH_DIR"
    
    for i in {1..8}; do
        local scheme="${SCHEME_TYPES[$i]}"
        local name="${SCHEME_NAMES[$i]}"
        
        # Get colors from JSON
        local color_output=$(get_scheme_colors "$wallpaper" "$color_idx" "$scheme")
        local primary=$(echo "$color_output" | sed -n '1p')
        local secondary=$(echo "$color_output" | sed -n '2p')
        local tertiary=$(echo "$color_output" | sed -n '3p')
        
        primary="${primary:-#000000}"
        secondary="${secondary:-#000000}"
        tertiary="${tertiary:-#000000}"
        
        local swatch_path="$SWATCH_DIR/${basename}_${color_idx}_${scheme}_swatch.png"
        generate_scheme_swatch "$primary" "$secondary" "$tertiary" "$swatch_path"
        
        if [[ -f "$swatch_path" ]]; then
            printf "%d. %s\x00icon\x1f%s\n" "$i" "$name" "$swatch_path"
        else
            printf "%d. %s\n" "$i" "$name"
        fi
    done
}

if pidof swaybg > /dev/null; then
    pkill swaybg
fi

PICS=($(find -L "${wallpaperDir}" -type f \( -iname \*.jpg -o -iname \*.jpeg -o -iname \*.png -o -iname \*.gif \) | sort ))

randomNumber=$(( ($(date +%s) + RANDOM) + $$ ))
randomPicture="${PICS[$(( randomNumber % ${#PICS[@]} ))]}"
randomChoice="[${#PICS[@]}] Random"

executeCommand() {
    local wallpaper="$1"
    local color_idx="$2"
    local scheme_type="$3"
    
    echo "Setting wallpaper: $wallpaper"
    echo "Color index: $color_idx"
    echo "Color scheme: $scheme_type"
    
    # Apply using matugen with selected color index and scheme
    matugen image "$wallpaper" -m dark -t "$scheme_type" --source-color-index "$color_idx"
    
    ln -sf "$wallpaper" "$HOME/.current_wallpaper"
}

menu() {
    printf "$randomChoice\n"
    for i in "${!PICS[@]}"; do
        if [[ -z $(echo "${PICS[$i]}" | grep .gif$) ]]; then
            printf "$(basename "${PICS[$i]}" | cut -d. -f1)\x00icon\x1f${PICS[$i]}\n"
        else
            printf "$(basename "${PICS[$i]}")\n"
        fi
    done
}

if command -v awww &>/dev/null; then
    awww query || awww-daemon &
fi

main() {
    # Load cache
    load_cache
    
    # Check if cache exists
    if [[ ! -f "$CACHE_FILE" ]]; then
        echo "Color cache not found. Run 'hypr-generate-colors-wallpapers' first."
        exit 1
    fi
    
    # Step 1: Select wallpaper
    choice=$(menu | rofi -dmenu -theme ${themesDir}/wallpaper-select.rasi -i -p "Select wallpaper")
    
    if [[ -z $choice ]]; then
        echo "No wallpaper selected."
        exit 0
    fi
    
    # Handle random
    if [ "$choice" = "$randomChoice" ]; then
        selectedFile="$randomPicture"
    else
        for file in "${PICS[@]}"; do
            if [[ "$(basename "$file" | cut -d. -f1)" = "$choice" ]]; then
                selectedFile="$file"
                break
            fi
        done
    fi
    
    if [[ -z $selectedFile ]]; then
        echo "Image not found: $choice"
        exit 1
    fi
    
    # Step 2: Select color index
    color_choice=$(show_color_menu "$selectedFile" | rofi -dmenu -theme ${themesDir}/scheme-select.rasi -i -p "Select color")
    
    if [[ -z $color_choice ]]; then
        echo "No color selected."
        exit 0
    fi
    
    color_idx=$(echo "$color_choice" | cut -d. -f1)
    
    # Step 3: Select scheme
    scheme_choice=$(show_scheme_menu "$selectedFile" "$color_idx" | rofi -dmenu -theme ${themesDir}/scheme-select.rasi -i -p "Select scheme")
    
    if [[ -z $scheme_choice ]]; then
        echo "No scheme selected."
        exit 0
    fi
    
    scheme_key=$(echo "$scheme_choice" | cut -d. -f1)
    scheme_type="${SCHEME_TYPES[$scheme_key]:-scheme-tonal-spot}"
    
    # Apply
    executeCommand "$selectedFile" "$color_idx" "$scheme_type"
}

if pidof rofi > /dev/null; then
    pkill rofi
    exit 0
fi

main
