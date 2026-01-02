# Contributing to OCX

Thank you for your interest in contributing to OCX (OpenCode Extensions)!

## Creating a Registry

OCX uses a "copy-and-own" philosophy. Components are built from source into a versioned registry format.

### 1. Registry Structure

Create a directory for your registry source:

```
my-registry/
├── registry.json       # Required: metadata and component definitions
└── files/              # Component source files
    ├── agent/          # .md files
    ├── skill/          # Directories with SKILL.md
    └── plugin/         # .ts files
```

### 2. Registry Manifest (registry.json)

Your `registry.json` defines a namespace for all components:

```json
{
  "name": "My Registry",
  "namespace": "my",
  "version": "1.0.0",
  "author": "your-name",
  "components": [
    {
      "name": "component",
      "type": "ocx:plugin",
      "description": "What it does",
      "files": [
        {
          "path": "plugin/my-plugin.ts",
          "target": ".opencode/plugin/component.ts"
        }
      ],
      "dependencies": []
    }
  ]
}
```

**Note:** Component names are clean (no prefix). The namespace is used for CLI references: `ocx add my/component`

### 3. Building the Registry

Use the OCX CLI to validate and build your registry:

```bash
ocx build ./my-registry --out ./dist
```

The build command enforces:
- Valid namespace identifier
- Valid semver
- Valid OpenCode target paths

## Development

### Setup

```bash
git clone https://github.com/kdcokenny/ocx
cd ocx
bun install
```

### Building the CLI

```bash
cd packages/cli
bun run scripts/build.ts         # Build JS
bun run scripts/build-binary.ts  # Build standalone binaries
```

### Running Tests

```bash
cd packages/cli
bun test
```

### Local Testing (End-to-End)

Before pushing changes, test the full CLI flow using local registry sources.

**Important notes:**
- The registry must be **built** before testing (source `registry.json` → built `index.json`)
- Use **absolute paths** with `file://` URLs (use `$(pwd)` to expand)

```bash
# 1. Clean slate - wipe all generated files
rm -rf .opencode opencode.json ocx.lock ocx.jsonc

# 2. Rebuild the CLI
cd packages/cli && bun run build && cd ../..

# 3. Build the local registry
./packages/cli/dist/index.js build registry/src/kdco --out registry/src/kdco/dist

# 4. Initialize fresh project
./packages/cli/dist/index.js init

# 5. Add local registry (MUST use absolute path with file://)
./packages/cli/dist/index.js registry add "file://$(pwd)/registry/src/kdco/dist" --name kdco

# 6. Install components (using namespace/component syntax)
./packages/cli/dist/index.js add kdco/philosophy kdco/workspace --yes

# 7. Verify the result
cat opencode.json
```

#### Expected Output

After installation, `opencode.json` should contain:
- `mcp` section with MCP server definitions
- `tools` section with globally disabled MCP tools (`"context7_*": false`, etc.)
- `agent` section with per-agent tool overrides (`"context7_*": true`, etc.)

Example structure:
```json
{
  "mcp": { "context7": { ... }, "gh_grep": { ... }, "exa": { ... } },
  "tools": { "context7_*": false, "gh_grep_*": false, "exa_*": false },
  "agent": { "librarian": { "tools": { "context7_*": true, ... } } }
}
```

#### Quick Reset Script

For repeated testing (assumes registry is already built):

```bash
rm -rf .opencode opencode.json ocx.lock ocx.jsonc && \
./packages/cli/dist/index.js init && \
./packages/cli/dist/index.js registry add "file://$(pwd)/registry/src/kdco/dist" --name kdco && \
./packages/cli/dist/index.js add kdco/workspace --yes && \
cat opencode.json
```

## Code Philosophy

OCX follows the **5 Laws of Elegant Defense**:
1. **Early Exit**: Guard clauses at the top.
2. **Parse, Don't Validate**: Use Zod at boundaries.
3. **Atomic Predictability**: Pure functions, immutable returns.
4. **Fail Fast, Fail Loud**: Throw clear errors immediately.
5. **Intentional Naming**: Logic should read like a sentence.

## Questions?

Open an issue or start a discussion!
