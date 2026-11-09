# GitHub publication

This checkout has no authenticated GitHub account. Repository and Pages URLs are therefore not available yet. Workflow definitions are prepared, not verified hosted executions. Authentication is the external prerequisite.

From PowerShell:

```powershell
& 'C:\Program Files\GitHub CLI\gh.exe' auth login
& 'C:\Program Files\GitHub CLI\gh.exe' auth status
```

After authentication, inspect `git status`, `git remote -v` and `gh api user --jq .login`. Do not reuse an unrelated remote. Create the dedicated repository only if no correct remote exists:

```powershell
gh repo create agentguard --public --source . --remote origin --description 'AgentGuard: Open-source AI agent evaluation, observability, and regression testing platform.'
git push -u origin main
```

The source is intentionally public for the portfolio. Only synthetic data belongs in committed reports. Git author identity must be configured with verified user details or a clearly labeled local build identity before commits; never guess the user's email.

In repository Settings → Pages, choose **GitHub Actions** as the source. Alternatively, after setting `$repo` to the actual authenticated owner/repository:

```powershell
gh api --method POST "repos/$repo/pages" -f build_type=workflow
gh workflow run pages.yml
gh run list --limit 10
```

If Pages is already configured, inspect its state rather than creating it again. Watch the deployment workflow and read the literal successful deployment URL from the job output. Verify the published URL, report loading, trace navigation and downloads under the repository subpath. `base: './'` and hash navigation avoid root asset and SPA fallback assumptions.

Action SHAs were resolved from official repository release tags on 2026-11-09. No workflow exposes secrets to pull-request code. Pages write and OIDC permissions are granted only to the deploy job. Manual deterministic evaluation does not accept arbitrary code, external endpoints or paid provider credentials.

The local Docker setup and hosted workflows remain unverified until they actually execute. Do not replace this status with “deployed” solely because YAML exists.
