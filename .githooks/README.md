# Secret safety net (git hooks)

Dependency-free git hooks that **block secrets from being committed or pushed** — your
defense against the #1 GitHub mistake (a public repo with a leaked key).

| Hook | When | What it blocks |
|------|------|----------------|
| `pre-commit` | every `git commit` | staging a `.env` file, or any line that looks like a secret (private keys, `sk_live`/`sk_test`, AWS/Google/GitHub/Slack/GitLab tokens, JWTs, DB URLs with embedded passwords) |
| `pre-push` | every `git push` | the same, scanned across the commits being pushed (backstop for anything that slipped in) |

`.env.example` templates are allowed (they hold placeholders, not real values).

## Activate (once per clone)
`core.hooksPath` is a local git setting, so a fresh `git clone` doesn't carry it. Run:

```bash
bash .githooks/install.sh
```

## If a hook blocks you
- It's usually right — move the secret to a `.env` file (gitignored) or your host's env
  settings (Vercel / Supabase dashboard), then commit again.
- The Supabase **anon** key is public-by-design; if a flagged JWT is just that, it's safe.
- Genuine false alarm? Bypass for one command: `git commit --no-verify` / `git push --no-verify`.
  Use sparingly — the net only helps if you trust it.

> This is a *local* guard. Also enable **GitHub → Settings → Code security → Secret scanning + Push protection** as a server-side backstop.
