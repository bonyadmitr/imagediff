---
name: deploy-github-pages
description: Deploy or update this static web app / PWA on GitHub Pages using the gh CLI. Use when the user wants to publish, deploy, ship, or update the site online (e.g. "залей на github pages", "deploy", "обнови сайт", "publish the app"). The app is static (no build step) — Pages serves the repo root; the entry is index.html → app/.
---

# Deploy to GitHub Pages

Publishes this repo as a GitHub Pages site. The app is **static** (vanilla ES modules, no build), so Pages serves the repository root directly. There is a root `index.html` that redirects to `app/`, and `app/` imports the engine from `../src/core/` — both live under the repo root, so relative paths resolve correctly under the `/<repo>/` Pages subpath.

**Publishing is an outward-facing action — only run when the user explicitly asks to deploy.**

## Preconditions

- `gh auth status` is logged in (scopes need `repo`; `workflow` helps). If not: tell the user to run `gh auth login` themselves.
- Working tree builds/tests green: `npm test`.
- `samples/` (third-party images) stays git-ignored — never publish it.

## First-time deploy

Run from the repo root. Replace `REPO` with a sensible name (default `imagediff`).

```bash
# 1. Commit everything
git add -A && git commit -m "chore: prepare GitHub Pages deploy" || echo "nothing to commit"

# 2. Make sure there is a default branch named main
git branch -M main

# 3. Create the public repo and push (gh sets the remote + pushes)
gh repo create REPO --public --source=. --remote=origin --push

# 4. Enable Pages from main branch root
OWNER=$(gh api user --jq .login)
gh api -X POST "repos/$OWNER/REPO/pages" \
  -f "source[branch]=main" -f "source[path]=/" 2>/dev/null \
  || gh api -X PUT "repos/$OWNER/REPO/pages" -f "source[branch]=main" -f "source[path]=/"

# 5. Print the URL (build takes ~1 min the first time)
echo "https://$OWNER.github.io/REPO/"
```

If the POST returns 409 (Pages already exists), the PUT fallback updates the source.

## Redeploy (after the first time)

Pages auto-rebuilds on every push to `main`:

```bash
git add -A && git commit -m "feat: <what changed>"
git push
```

## Verify

- Poll the deploy status: `gh api repos/$OWNER/REPO/pages/builds/latest --jq .status` until `built`.
- Check the page responds: `curl -sI https://$OWNER.github.io/REPO/ | head -1` (expect `200`, may be `404` for the first ~60 s while building).
- The app lives at `https://$OWNER.github.io/REPO/` (root redirects to `app/`).

## Notes / gotchas

- **Service worker caching:** after a redeploy, returning users may keep the old version until the SW updates. The SW uses a versioned cache name (`imagediff-vN` in `app/sw.js`); bump that version when shipping changes you need users to get immediately.
- **Subpath:** the site is served under `/<repo>/`, not the domain root. All asset paths in the app are relative, so this works — don't hardcode leading-slash absolute paths.
- **URL lands on `/<repo>/app/`, not `/<repo>/`** (by design). The app lives in `app/` (kept separate from the portable `src/core/` engine it imports via `../src/core/…`); the root `index.html` only redirects to `app/`. The bare `/<repo>/` URL works via that redirect. To serve the app directly at `/<repo>/`, move the app files to the repo root and fix relative paths (`../src/core/…` → `./src/core/…`, `sw.js` cache list, `manifest.webmanifest`), then drop the redirect. Decided to keep the redirect for simplicity (2026-06-30).
- **HTTPS only:** Pages is HTTPS, so the service worker and ES modules work (they require a secure context).
- Don't switch to a `gh-pages` branch or `/docs` folder unless asked — root-of-main is simplest for this repo.
