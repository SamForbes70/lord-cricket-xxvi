# Protecting `main`

On 13 November 2026 five commits reached `main` with no pull request and no review (see [REVIEW_2026-11-13.md](REVIEW_2026-11-13.md)). The project rule is that changes go through a pull request with green checks. GitHub can enforce that, but the setting needs repository admin rights and the AI working on this repository was not permitted to change it. **The owner must apply it.**

## Recommended rule for `main`

- Require a pull request before merging. Required approving reviews: `0` (a single owner cannot approve their own pull request; raise this if a second reviewer is added).
- Require status checks to pass: `pass07a` and `windows-browser-acceptance`.
- Apply the rules to administrators too (`enforce_admins`). This is what stops an admin-credentialed tool pushing straight to `main`. The owner can switch it off temporarily for a genuine emergency.
- Block force pushes and deletion.

## Apply it in the browser

Repository, Settings, Branches, Add branch ruleset (or Add classic branch protection rule), target `main`, then set the options above.

## Apply it with the command line

Run as the repository owner (needs the GitHub CLI signed in with admin rights):

```bash
cat > protect.json <<'JSON'
{
  "required_status_checks": { "strict": false, "contexts": ["pass07a", "windows-browser-acceptance"] },
  "enforce_admins": true,
  "required_pull_request_reviews": { "required_approving_review_count": 0 },
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false
}
JSON
gh api -X PUT repos/SamForbes70/lord-cricket-xxvi/branches/main/protection --input protect.json
```

Check it took effect:

```bash
gh api repos/SamForbes70/lord-cricket-xxvi/branches/main --jq .protected
```

## What it does not do

It cannot tell who wrote a commit, and a pull request is not a review on its own. It makes sure CI ran on what was merged. Read the diff before merging code you did not write.
