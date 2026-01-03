# OCX Enterprise Features

OCX is designed to be reliable in professional environments where supply-chain security and configuration stability are critical.

## Registry Locking

In team environments, you may want to prevent developers from adding unapproved registry sources. You can enable `lockRegistries` in `ocx.jsonc`:

```jsonc
{
  "registries": {
    "internal": { "url": "https://registry.corp.com" }
  },
  "lockRegistries": true
}
```

When `lockRegistries` is `true`, `ocx registry add` and `ocx registry remove` will fail. This configuration should be checked into your version control system.

## Version Pinning

You can pin a registry to a specific version to ensure reproducible environments:

```bash
ocx registry add https://registry.kdco.dev --version 0.1.0
```

This ensures that `ocx add` and updates will only pull components compatible with version `0.1.0` of that registry.

## Security Audit with `ocx.lock`

OCX automatically generates an `ocx.lock` file. This file acts as an audit log and integrity check for your installed extensions.

| Field | Purpose |
|-------|---------|
| `registry` | Tracks exactly which source provided the component. |
| `version` | Records the specific version installed. |
| `hash` | SHA-256 hash of the component files. OCX uses this to detect manual tampering during `ocx diff`. |
| `files` | Array of file paths installed by this component. |
| `installedAt` | ISO timestamp of the installation. |

## Integrity Verification

OCX provides both proactive and reactive integrity verification to protect against supply-chain attacks and accidental tampering.

### Install-Time Verification (Proactive)

When you run `ocx add`, OCX automatically verifies the integrity of the component before writing any files to your project. If a component is already present in your `ocx.lock` file, OCX computes the SHA-256 hash of the incoming content and compares it against the locked hash.

If the hashes do not match, the installation fails immediately with an `INTEGRITY_ERROR`. This prevents malicious or unauthorized updates from silently entering your codebase even if a registry is compromised.

### Security Audit with `ocx diff` (Reactive)

Running `ocx diff` compares your local files against the upstream registry and uses the hash in `ocx.lock` to identify changes. This allows teams to audit exactly what modifications have been made to distributed agents or plugins.

## Air-Gapped Environments

Since OCX is a single binary and registries are simple static JSON files, you can easily mirror registries internally and point OCX to local network URLs.
