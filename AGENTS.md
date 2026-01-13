# AGENTS.md

Guidelines for AI agents working in the OCX codebase.

## Project Overview

OCX is a monorepo for the OpenCode extension CLI tool. It manages component registries,
configuration files, and provides commands for adding/building/searching components.

- **Runtime:** Bun (v1.3.5+)
- **Build System:** Turbo
- **Language:** TypeScript (strict mode, ESNext)

## Build/Lint/Test Commands

### Root Commands (via Turbo)

```bash
bun run build          # Build all packages
bun run test           # Run all tests
bun run check          # Lint (Biome) + type check (tsc)
bun run format         # Auto-fix formatting with Biome
```

### Running a Single Test

```bash
# Run a specific test file
bun test packages/cli/tests/add.test.ts

# Run tests matching a pattern
bun test --grep "should resolve"

# Run tests in watch mode
bun test --watch
```

### Package-Specific Commands

From `packages/cli/`:
```bash
bun test               # Run CLI tests only
bun run check:biome    # Biome lint only
bun run check:types    # TypeScript type check only
bun run build          # Build CLI package
```

## Code Style Guidelines

### Formatting (Biome)

- **Indentation:** Tabs (width 2)
- **Line width:** 100 characters max
- **Quotes:** Double quotes for strings
- **Semicolons:** As needed (omit when possible)
- **Trailing commas:** All (including multi-line)

### Imports

```typescript
// Use `import type` for type-only imports
import type { Config } from "./types"
import { parseConfig } from "./parser"

// Imports are auto-organized - don't manually sort
// Order: external packages, then internal modules
```

### TypeScript

- **Strict mode:** Always enabled
- **No unused variables:** Error (prefix with `_` if intentional)
- **No unused imports:** Error (auto-removed by Biome)
- **Explicit return types:** Recommended for public APIs
- **Use `z.infer<typeof Schema>`** for Zod schema types

### Naming Conventions

| Element | Convention | Example |
|---------|------------|---------|
| Functions/variables | camelCase | `fetchRegistry`, `configPath` |
| Types/interfaces | PascalCase | `RegistryConfig`, `ComponentMeta` |
| Classes | PascalCase | `OCXError`, `NetworkError` |
| Constants | SCREAMING_SNAKE | `EXIT_CODES`, `DEFAULT_TIMEOUT` |
| Files | kebab-case | `handle-error.ts`, `json-output.ts` |

### Functions

```typescript
/**
 * Brief description of what the function does.
 * @param name - Description of parameter
 * @returns Description of return value
 */
export async function fetchComponent(baseUrl: string, name: string): Promise<ComponentManifest> {
  // Implementation
}
```

- Use JSDoc comments for public APIs
- Prefer `async/await` over `.then()` chains
- Use early returns to reduce nesting
- Keep functions focused and single-purpose

## Error Handling

### Custom Error Classes

All errors extend `OCXError` base class in `packages/cli/src/utils/errors.ts`:

```typescript
import { NotFoundError, NetworkError, ConfigError } from "./utils/errors"

// Throw specific error types
throw new NotFoundError("Component not found", "my-component")
throw new NetworkError("Failed to fetch", url, originalError)
throw new ConfigError("Invalid configuration", "missing 'name' field")
```

### Available Error Types

| Error Class | Use Case |
|-------------|----------|
| `NotFoundError` | Resource doesn't exist |
| `NetworkError` | HTTP/fetch failures |
| `ConfigError` | Invalid configuration |
| `ValidationError` | Schema/input validation failures |
| `ConflictError` | Resource already exists |
| `IntegrityError` | Checksum/hash mismatches |

### Exit Codes

Use `EXIT_CODES` constant for consistent exit behavior:
```typescript
import { EXIT_CODES } from "./utils/errors"
process.exit(EXIT_CODES.VALIDATION_ERROR)
```

### CLI Error Wrapper

Wrap command handlers with `handleError()`:
```typescript
import { handleError } from "./utils/handle-error"

program
  .command("add")
  .action(handleError(async (options) => {
    // Command implementation
  }))
```

## Patterns & Conventions

### Schemas (Zod)

```typescript
import { z } from "zod"

// Define schema with JSDoc
/** Configuration for a component */
export const componentManifestSchema = z.object({
  name: z.string(),
  version: z.string().optional(),
})

// Export inferred type
export type ComponentManifest = z.infer<typeof componentManifestSchema>
```

### CLI Commands (Commander)

```typescript
import { Command } from "commander"

export function registerAddCommand(program: Command) {
  program
    .command("add <component>")
    .description("Add a component to your project")
    .option("-r, --registry <url>", "Registry URL")
    .action(handleError(addCommand))
}
```

### File I/O

```typescript
// Use Bun.file() API
const file = Bun.file(path)
const content = await file.text()

// JSONC for config files (supports comments)
import { parse } from "jsonc-parser"
const config = parse(content)
```

### Testing (bun:test)

```typescript
import { describe, it, expect, beforeAll, afterAll } from "bun:test"

describe("add command", () => {
  beforeAll(async () => {
    // Setup
  })

  it("should add component to project", async () => {
    const result = await addComponent("button")
    expect(result.success).toBe(true)
  })
})
```

## Project Structure

```
packages/cli/          # Main CLI tool (@ocx/cli)
  src/
    commands/          # CLI command implementations
      ghost/           # Ghost mode commands (init, config, add, opencode, etc.)
    config/            # Config providers (Local, Ghost)
    ghost/             # Ghost mode configuration utilities
    registry/          # Registry fetching/resolution
    schemas/           # Zod schemas and config parsing
    utils/             # Shared utilities, errors, logging
  tests/               # Test files (*.test.ts)

registry/              # Component registry source files
  src/kdco/            # KDCO registry components

workers/               # Cloudflare Workers
  ocx/                 # Main OCX worker
  registry/            # Registry API worker
```

## Ghost Mode Architecture

Ghost mode enables working in repositories without modifying them:

### Key Components

| Component | Location | Purpose |
|-----------|----------|---------|
| `ProfileManager` | `src/profile/manager.ts` | Static factory for profile CRUD operations |
| `profile/paths.ts` | `src/profile/paths.ts` | Path constants and helpers for profile directories |

| `GhostConfigProvider` | `src/config/provider.ts` | Provides config from current profile |
| Ghost commands | `src/commands/ghost/` | init, config, registry, add, search, opencode |
| Profile commands | `src/commands/ghost/profile/` | list, add, remove, use, show, config |

### Directory Structure

```
~/.config/opencode/profiles/
├── current -> default       # Symlink to active profile
├── default/
│   ├── ghost.jsonc          # Ghost mode settings
│   ├── opencode.jsonc       # OpenCode config (optional)
│   └── AGENTS.md            # Agent instructions (optional)
└── work/
    ├── ghost.jsonc
    ├── opencode.jsonc
    └── AGENTS.md
```

### Profile Resolution Priority

`ProfileManager.getCurrent()` resolves the active profile in this order:

1. `--profile <name>` flag (explicit override)
2. `OCX_PROFILE` environment variable
3. `current` symlink in `~/.config/opencode/profiles/`
4. `default` profile (fallback)

### How `ghost opencode` Works

1. Resolves current profile using priority: `--profile` flag > `OCX_PROFILE` env > `current` symlink > `default`
2. Sets terminal/tmux window name to `ghost[profile]:repo/branch` for session identification (if `renameWindow` enabled)
3. **Discovers project instruction files:**
   - Walks UP from project directory to git root
   - Finds AGENTS.md, CLAUDE.md, CONTEXT.md at each level
   - Filters by `exclude`/`include` patterns from ghost.jsonc
   - Include patterns override exclude patterns (TypeScript/Vite style)
4. Spawns OpenCode with environment variables:
   - `OPENCODE_DISABLE_PROJECT_DISCOVERY=true` - prevents loading project configs
   - `OPENCODE_CONFIG_DIR` - points to profile directory
   - `OPENCODE_CONFIG_CONTENT` - serialized config with discovered instructions
   - `OCX_PROFILE` - current profile name
5. OpenCode runs directly in the project directory

**Note:** This requires OpenCode with PR #8093 support for `OPENCODE_DISABLE_PROJECT_DISCOVERY`.

#### Migration Note

For profiles that previously had `AGENTS.md`, `CLAUDE.md`, or `CONTEXT.md` files in the profile directory that should be included, add them to the `opencode.jsonc` configuration:

```jsonc
{
  "instructions": ["./AGENTS.md"]  // and/or CLAUDE.md, CONTEXT.md
}
```

This ensures these files are loaded as instruction files when OpenCode starts.

### Instruction File Discovery

Ghost mode discovers project instruction files and passes them to OpenCode. By default, all project instruction files are excluded so only your profile's files are used.

**Default exclude patterns:**
- `**/AGENTS.md`
- `**/CLAUDE.md`
- `**/CONTEXT.md`
- `**/.opencode/**`
- `**/opencode.jsonc`
- `**/opencode.json`

**To include project files**, modify your profile's `ghost.jsonc`:

```jsonc
{
  // Include all project AGENTS.md files
  "exclude": ["**/CLAUDE.md", "**/CONTEXT.md", "**/.opencode/**", "**/opencode.jsonc", "**/opencode.json"],
  
  // Or exclude all but include specific ones (TypeScript/Vite style)
  "exclude": ["**/AGENTS.md"],
  "include": ["./docs/AGENTS.md"]
}
```

Files are discovered deepest-first and profile instructions come last (highest priority).

### GhostConfigProvider vs ProfileManager

- **`GhostConfigProvider`**: Reads config from the current profile, used at runtime by ghost commands
- **`ProfileManager`**: Manages profile lifecycle (create, delete, switch, list)

### Ghost Mode Profiles

Profile commands for managing multiple ghost configurations:

#### Profile Commands

| Command | Alias | Description |
|---------|-------|-------------|
| `ocx ghost profile list` | `ocx g p ls` | List all profiles (* = current) |
| `ocx ghost profile add <name>` | `ocx g p add` | Create new profile |
| `ocx ghost profile remove <name>` | `ocx g p rm` | Delete profile |
| `ocx ghost profile use <name>` | `ocx g p use` | Set current profile |
| `ocx ghost profile show [name]` | `ocx g p show` | Display profile contents |
| `ocx ghost profile config [name]` | `ocx g p config` | Edit ghost.jsonc in $EDITOR |

#### Profile Command Examples

```bash
# Create and switch to a work profile
ocx ghost profile add work
ocx ghost profile use work

# Run OpenCode with a specific profile
ocx ghost opencode --profile work

# Or use environment variable
OCX_PROFILE=work ocx ghost opencode

# Clone settings from existing profile
ocx ghost profile add client-x --from work

# List all profiles
ocx ghost profile list
```

## Quick Reference

```bash
# Development workflow
bun install            # Install dependencies
bun run build          # Build all
bun run check          # Verify code quality
bun run test           # Run tests
bun run format         # Fix formatting

# Single test
bun test packages/cli/tests/add.test.ts
```

## Schema Synchronization

OCX schemas mirror OpenCode's configuration format. To update schemas when OpenCode releases new config options:

### Reference Sources

- **Official JSON Schema:** https://opencode.ai/config.json
- **Source Code:** https://github.com/sst/opencode/blob/dev/packages/opencode/src/config/config.ts

### Sync Process

1. Check the OpenCode changelog or config.ts for new fields
2. Update `packages/cli/src/schemas/registry.ts` with new Zod schemas
3. Follow existing patterns (JSDoc comments, `.passthrough()` for objects)
4. Run `bun run check` and `bun run test` to verify
5. Update this document with sync date

### Last Synced

- **Date:** 2026-01-05
- **OpenCode Version:** Latest (dev branch)
