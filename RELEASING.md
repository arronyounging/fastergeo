# Releasing

Hard rules, each learned the expensive way:

1. **Publish with `pnpm publish --no-git-checks`, NEVER `npm publish`.**
   Internal deps are declared as `workspace:^`; pnpm rewrites them to real
   semver ranges at publish time, npm ships the literal string and the package
   is uninstallable (`EUNSUPPORTEDPROTOCOL`). This happened with
   fastergeo@0.10.4 / tickets@0.2.2 / report@0.4.1 — all deprecated.

2. **Fresh-install verification after EVERY publish, no exceptions.**
   From an empty temp dir: `npm i fastergeo@<ver> --registry https://registry.npmjs.org`,
   then require a symbol you just shipped and assert on it. The local repo can
   never catch a broken manifest.

3. **Poll the registry before verifying** — `npm view <pkg>@<ver>` until it
   resolves; propagation lag otherwise produces false-negative 404s.

4. **`npm deprecate` needs `--registry https://registry.npmjs.org`** — the
   local npmrc points reads at a China mirror, and deprecate ignores
   `publishConfig.registry`.

5. Dependent-range check for 0.x: bumping a package's MINOR (0.2 → 0.3)
   breaks consumers' `^0.2.x` ranges — republish consumers in the same chain,
   or stay on patch bumps for additive changes.

6. Version bump + publish + `bench/HISTORY.md` numbers land in the same
   commit; release notes state the measured before/after.
