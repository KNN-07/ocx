import type { UserConfig } from "@commitlint/types"

const config: UserConfig = {
	extends: ["@commitlint/config-conventional"],
	rules: {
		"type-enum": [
			2,
			"always",
			[
				"feat",
				"fix",
				"docs",
				"style",
				"refactor",
				"perf",
				"test",
				"build",
				"ci",
				"chore",
				"revert",
			],
		],
		"scope-enum": [
			1,
			"always",
			["cli", "config", "profile", "registry", "commands", "schemas", "utils", "deps", "release"],
		],
		"header-max-length": [2, "always", 100],
	},
}

export default config
