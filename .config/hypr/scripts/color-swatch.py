#!/usr/bin/env python3
"""Generate color swatch images for rofi wallpaper selector."""

import sys
import os

def create_color_swatch(hex_colors, output_path, size=48):
    """Create a horizontal colored stripe image with multiple colors."""
    try:
        from PIL import Image
        
        # Parse hex colors (can be 1-3 colors)
        colors = []
        for hex_color in hex_colors:
            hex_color = hex_color.lstrip('#')
            if len(hex_color) == 6:
                r = int(hex_color[0:2], 16)
                g = int(hex_color[2:4], 16)
                b = int(hex_color[4:6], 16)
                colors.append((r, g, b))
        
        if not colors:
            colors = [(0, 0, 0)]
        
        # Create image with width = size * num_colors, height = size
        num_colors = len(colors)
        width = size * num_colors
        height = size
        
        img = Image.new('RGB', (width, height))
        
        # Fill with colors
        for i, color in enumerate(colors):
            for x in range(i * size, (i + 1) * size):
                for y in range(height):
                    img.putpixel((x, y), color)
        
        # Ensure output directory exists
        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        
        img.save(output_path)
        return True
    except ImportError:
        print("PIL not available", file=sys.stderr)
        return False
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        return False

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: color_swatch.py <hex_color1> [hex_color2] [hex_color3] <output_path>")
        sys.exit(1)
    
    # Last argument is output path, rest are colors
    hex_colors = sys.argv[1:-1]
    output_path = sys.argv[-1]
    
    success = create_color_swatch(hex_colors, output_path)
    sys.exit(0 if success else 1)
