# Contributing to Backend Butler

Thanks for helping improve Butler. Open an issue describing the behavior you want to change before a large contribution. Small fixes can go straight to a pull request.

## Development

Use Node.js 22, pnpm 12, Python 3.13, and uv 0.13.0. Copy `.env.example` to `.env` for local configuration; never commit credentials, home inventories, transcripts, or deployment overrides.

```sh
cd card
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm exec playwright install chromium
pnpm test:browser
pnpm build
cd ../agent
uv sync --frozen
uv run ruff check .
uv run pytest -q
cd ../ha-notify-scheduler
uv sync --frozen
uv run pytest -q
cd ../backend_butler
npm ci --ignore-scripts
npm test
npm run typecheck
npm run build
```

The generated card bundle in `custom_components/backend_butler/frontend/` is committed because Home Assistant does not build it. Include a fresh build with card changes. Keep lockfiles reproducible; the voice worker deliberately pins draft LiveKit APIs to Git commits. See `agent/patches/` before changing those pins.

Include the problem, resulting behavior, and relevant test results in your PR. Use synthetic people/devices in tests and redact logs/screenshots. Browser fixtures in `card/tests/` require Playwright and its browsers; see each script for its fixture and assertions. Test voice controls at narrow widths, with keyboard navigation and reduced motion. Live hardware, paid inference, and deployment tests are opt-in and must use your own credentials.

## CI and release validation

Every PR, push to `main`, manual CI run, and weekly scheduled run uses `.github/workflows/ci.yml`. The `CI required` check requires the card, app, Python, security, Docker, and repository-hygiene workflows to pass. HACS is required in public repositories; it cannot run against a private repository. Configure branch protection to require `CI required` when your GitHub plan/repository visibility supports it.

The card job rebuilds the frontend and fails if the bundle is missing from Git or differs from the committed version. Run `pnpm --dir card build` and commit the bundle with its source changes; CI never commits to `main`.

Security gates run `pnpm audit --audit-level high`, `npm audit --audit-level=high`, strict `pip-audit` against both installed frozen Python environments, and a checksum-verified Gitleaks scan of all fetched Git history. JavaScript high/critical advisories, any reported Python advisory or audit failure, and secret findings fail CI. Audits include development dependencies. Package-metadata audits do not assess unpublished changes inside Git-pinned upstream dependencies; retain review of those pins and patches.

Docker checks build the worker, scheduler, and HA app for `linux/amd64`, with separate build caches. They do not push images, start services, or use deployment credentials. ARM64 image validation and real HA/LiveKit smoke tests remain separate release checks.

Version-tag pushes run this same CI pipeline at the tagged commit before creating a draft release. Beta tags remain prereleases. Running the `release` workflow manually validates the full pipeline without creating a tag or release. Only the draft-release job has write permissions; validation jobs are read-only and receive no production secrets. Publishing a draft remains a maintainer action after the beta smoke tests pass.

## License and branding

Contributions to project code use the [MIT license](LICENSE). Third-party media keeps its original license; see [NOTICE](NOTICE.md). Arkitect orange is `#FC6B02`. Preserve the approved Butler logo's white jacket and orange bow tie; do not recolor the whole logo. See [security reporting](SECURITY.md) for private vulnerability reports.
