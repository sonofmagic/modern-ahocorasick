# Contributing

Development, releases and documentation deployment for modern-ahocorasick. For package usage, see the [README](./README.md).

## Development

Use Node.js 22.22.1+, 24.11+, or 26+ and pnpm 12.5.1. The private root workspace manages
repoctl, Turborepo and shared tooling. The published library lives in
`packages/modern-ahocorasick`; v3 replaces grouped matches with UTF-16 ranges while preserving module entry paths.

```sh
pnpm install --frozen-lockfile
pnpm repo:doctor --strict
pnpm validate
pnpm repo:check --full
```

`pnpm validate` builds the library, runs lint, TypeScript and declaration checks,
runs the unit tests, and checks an actual tarball in isolated ESM/CommonJS consumers.
Use `pnpm dev` for build watching and `pnpm test:dev` for unit-test watching.
The build target remains ES2022; the development Node requirement does not impose
a new engine requirement on consumers of the library.

## Releases

The root and documentation workspaces are private. Only `packages/modern-ahocorasick`
is published. Changes to its metadata or README need a package release to update npm.

1. Record publishable changes with `pnpm change modern-ahocorasick --bump patch --summary "Describe the change"`.
2. Inspect the plan with `pnpm change status`. Do not bump the package version by hand.
3. Merge the change PR into `main`. The **Release** workflow validates the workspace
   and prepares or updates a version PR, consuming the intents and updating the
   package version and repository changelog.
4. Review the version PR and ensure its CI passes. Merge it using the generated
   `chore(release): version packages` title. The workflow recognizes that prefix
   in the main push's head commit message and publishes the prepared packages.

Merging a version PR is the publication step. To prepare a version without publishing,
leave that PR open. An ordinary main commit only prepares versions. A merge commit
whose subject starts with `Merge pull request` does not match the release prefix;
use a squash merge with the generated title, or the manual publish fallback.

For recovery, run **Release** manually on `main`: `mode: prepare` prepares a version
PR, and `mode: publish` publishes already prepared versions without incrementing them.
Check the Actions logs, npm registry version and package tag/GitHub release afterward.
repoctl uses package-qualified release names such as `modern-ahocorasick@3.0.0`;
`v3.0.0` is also available as a compatibility release link.

The workflow uses `GITHUB_TOKEN` for repository operations and npm trusted publishing
via GitHub OIDC. Actions settings must allow GitHub Actions to create pull requests.
If a version PR is created with `GITHUB_TOKEN`, manually run CI for its branch before
merging when checks have not started: GitHub does not automatically trigger workflows
from that token's events. Preserve automatic preparation, publication on version
commits and both manual modes when upgrading repoctl managed assets.

## Documentation and algorithm workbench

Read the [English documentation](https://aho.icebreaker.top/) or [中文文档](https://aho.icebreaker.top/zh/), and try the [algorithm workbench](https://aho.icebreaker.top/visualization).

The bilingual VitePress 2 site (pinned to `2.0.0-alpha.20`) lives in `apps/docs` (English by default, Chinese at `/zh/`). Start it with `pnpm docs:dev`, then open the local URL printed in the terminal. The command builds the workspace library automatically.

- `pnpm docs:build`: build the library and static documentation.
- `pnpm docs:preview`: serve the built documentation locally.
- `pnpm benchmark:docs`: measure dictionary reuse, rescan time and retained/transfer heap; see [workbench measurements](./docs/workbench-performance.md).
- `pnpm test:docs:e2e`: build and run Playwright desktop/mobile checks. Install the browser engines once with `pnpm --filter @modern-ahocorasick/docs exec playwright install chromium firefox webkit`.

The workbench includes strategy comparison, safe original-text highlighting, literal replacement preview, copyable TypeScript, versioned JSON import/export and explicit share links. Playback supports backward steps, timeline seeking and jumps to matches. Grapheme/UTF-16 coordinates, state prefix/suffix inspection and inherited-output origins stay linked to the scan. Computation runs in a cancellable Worker with dictionary reuse, bounded inputs and paginated displays; the graph supports dragging, zooming and failure links. See the bilingual visualization pages for input limits and sharing behavior. It uses a shared repository-internal builder without exposing automaton state in the npm API. The private docs workspace is not published. The site is deployed to Cloudflare Workers Static Assets.

Original library and visualization credit: [BrunoRB/ahocorasick](https://github.com/BrunoRB/ahocorasick), [reference visualization](https://brunorb.github.io/ahocorasick/visualization.html). Modern library maintained by SonOfMagic.

### Website deployment and rollback

`apps/docs/wrangler.jsonc` configures `modern-ahocorasick-docs`, the static build directory, clean URLs, real 404 responses and the `aho.icebreaker.top` Custom Domain. Cloudflare manages its DNS and HTTPS. There is no server-side application code or database.

The CI deployment job runs only for `main` pushes or manual CI runs on `main`, after the six Node/OS checks and the local Cloudflare browser suite succeed. Deployments are serialized and skip commits that are no longer the tip of `main`. The job uses the `icelib` organization Secrets `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN`. The token needs access to Workers deployment and the domain's zone; credentials are not embedded in site assets.

After building, deployment stamps `/build-info.json` with the checkout SHA, outside Turbo's cached build. The job verifies the HTTPS pages, 404 behavior and exact SHA, then runs the browser suite against production. `pnpm docs:verify-deployment https://aho.icebreaker.top <commit-sha>` repeats the HTTP checks.

For local Cloudflare routing checks, build with `pnpm docs:build`, then run `pnpm --filter @modern-ahocorasick/docs preview:cloudflare --port 8789`. Set `DOCS_E2E_CLOUDFLARE=1` when running `pnpm test:docs:e2e` to test that server. Set `DOCS_E2E_BASE_URL=https://aho.icebreaker.top` when running the docs workspace's `test:e2e` command to test production. A local `deploy:check` dry run validates the Wrangler configuration without publishing.

To roll back normally, revert the affected commit on `main` and push; CI validates and deploys the reverted tree. For an urgent rollback with Cloudflare credentials available, run `pnpm --filter @modern-ahocorasick/docs exec wrangler versions list`, then `pnpm --filter @modern-ahocorasick/docs exec wrangler rollback <version-id>`. Verify `/build-info.json` afterward and follow with a Git revert so the next successful CI deployment preserves the rollback. npm publication follows the version PR workflow above and remains independent of website deployments.
