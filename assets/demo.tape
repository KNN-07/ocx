# OCX Demo GIF
# Generate with: vhs assets/demo.tape
# Requires: brew install vhs

Output assets/demo.gif

Set Theme "Catppuccin Mocha"
Set FontSize 16
Set Width 900
Set Height 550
Set Padding 20

# Title
Type "# OCX - The missing package manager for OpenCode"
Sleep 1s
Enter
Enter

# Option A: Quick npm plugin
Type "# Option A: Add an npm plugin instantly"
Sleep 500ms
Enter
Type "ocx add npm:@franlol/opencode-md-table-formatter"
Sleep 500ms
Enter
Sleep 2s

Enter

# Option B: Registry bundle
Type "# Option B: Use a curated registry"
Sleep 500ms
Enter
Type "ocx add kdco/workspace"
Sleep 500ms
Enter
Sleep 2s

# Done
Sleep 1s
