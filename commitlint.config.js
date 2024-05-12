module.exports = {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "body-max-length": [0, "always", Infinity],
    "body-max-line-length": [0, "always", Infinity],
    "type-case": [2, "always", "pascal-case"],
    "type-enum": [
      2,
      "always",
      [
        "Deploy",
        "Chore",
        "Ci",
        "Docs",
        "Feat",
        "Fix",
        "Perf",
        "Refactor",
        "Revert",
        "Style",
        "Test",
        "Env",
      ],
    ],
  },
}
