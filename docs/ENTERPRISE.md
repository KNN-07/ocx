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
ocx registry add https://registry.ocx.dev/kdco --version 0.1.0
```

This ensures that `ocx add` and updates will only pull components compatible with version `0.1.0` of that registry.

## Security Audit with `ocx.lock`

OCX automatically generates an `ocx.lock` file. This file acts as an audit log and integrity check for your installed extensions.

| Field | Purpose |
|-------|---------|
| `registry` | Tracks exactly which source provided the component. |
| `version` | Records the specific version installed. |
| `hash` | SHA-256 hash of the component files. OCX uses this to detect manual tampering during `ocx diff`. |
| `installedAt` | ISO timestamp of the installation. |

## Integrity Verification

Running `ocx diff` compares your local files against the upstream registry and uses the hash in `ocx.lock` to identify changes. This allows teams to audit exactly what modifications have been made to distributed agents or plugins.

## Air-Gapped Environments

Since OCX is a single binary and registries are simple static JSON files, you can easily mirror registries internally and point OCX to local network URLs.
