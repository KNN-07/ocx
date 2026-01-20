/**
 * OCX URL Constants
 *
 * Centralized URL definitions to avoid hardcoding throughout the codebase.
 */

import pkg from "../package.json" with { type: "json" }

// Base domains
export const OCX_DOMAIN = "ocx.kdco.dev"
export const GITHUB_REPO = "kdcokenny/ocx"

// OCX URLs
export const OCX_SCHEMA_URL = `https://${OCX_DOMAIN}/schemas/ocx.json`

// CLI Version (single source of truth from package.json)
export const CLI_VERSION: string = pkg.version
