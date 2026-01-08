# OCX Demo GIF
# Generate with: vhs assets/demo.tape
# Requires: brew install vhs

Output assets/demo.gif

Set Theme "Catppuccin Mocha"
Set FontSize 16
Set Width 800
Set Height 500
Set Padding 20

# Initialize
Type "ocx init"
Sleep 500ms
Enter
Sleep 2s

Enter

# npm plugin (no registry needed)
Type "ocx add npm:@franlol/opencode-md-table-formatter"
Sleep 500ms
Enter
Sleep 3s

Enter

# Add registry
Type "ocx registry add https://registry.kdco.dev --name kdco"
Sleep 500ms
Enter
Sleep 2s

Enter

# Registry bundle
Type "ocx add kdco/workspace"
Sleep 500ms
Enter
Sleep 3s

# Done
Sleep 1s
