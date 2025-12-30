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

Your `registry.json` must enforce a prefix for all components:

```json
{
  "name": "My Registry",
  "prefix": "my",
  "version": "1.0.0",
  "author": "your-name",
  "components": [
    {
      "name": "my-component",
      "type": "ocx:plugin",
      "description": "What it does",
      "files": [
        {
          "path": "plugin/my-plugin.ts",
          "target": ".opencode/plugin/my-plugin.ts"
        }
      ],
      "dependencies": []
    }
  ]
}
```

### 3. Building the Registry

Use the OCX CLI to validate and build your registry:

```bash
ocx build ./my-registry --out ./dist
```

The build command enforces:
- All component names start with your prefix
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

## Code Philosophy

OCX follows the **5 Laws of Elegant Defense**:
1. **Early Exit**: Guard clauses at the top.
2. **Parse, Don't Validate**: Use Zod at boundaries.
3. **Atomic Predictability**: Pure functions, immutable returns.
4. **Fail Fast, Fail Loud**: Throw clear errors immediately.
5. **Intentional Naming**: Logic should read like a sentence.

## Questions?

Open an issue or start a discussion!
