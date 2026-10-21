# Lord Cricket XXVI: GitHub and Codex on Windows

## Stage 1: Publish the recovered Git repository (PRIVATE)

1. Install **Git for Windows** from https://git-scm.com/downloads/win and **GitHub CLI** from https://cli.github.com/ . Close and reopen any open Terminal or Command Prompt after installation.
2. Extract the **entire** `Lord_Cricket_XXVI_GitHub_Codex_Windows_2026-10-21.zip` archive via **Extract All**. Do not launch commands inside Windows Explorer's compressed-folder view.
3. In the extracted outer folder, double-click **`SETUP_GITHUB_AND_CODEX.cmd`**. Allow the GitHub CLI to open your browser to log in as **SamForbes70**. This setup deliberately never asks you for a token to paste into ChatGPT.
4. The script checks the original Pass 22 commit, the clean Git working tree, the current GitHub account, no existing remote, and destination repository availability. It creates **`SamForbes70/lord-cricket-xxvi` as PRIVATE**, adds `origin`, pushes branch `main`, and verifies the pushed SHA and visibility. If it finds an existing repository or any unexpected situation, it stops without force pushing.
5. Check that GitHub displays a **Private** badge at https://github.com/SamForbes70/lord-cricket-xxvi and a `main` branch with source files. There should be a full commit history, not one ZIP file or one initial commit.

GitHub CLI's repository creation command preserves the existing local Git commits, unlike uploading source with GitHub's web drag-and-drop upload.

## Stage 2: Open on Windows in local Codex

1. Install the latest **ChatGPT desktop app for Windows** from https://chatgpt.com/download/ . Sign in with your ChatGPT account.
2. From the top-left menu choose **Codex** (or launch your installed Codex desktop app).
3. Choose **Open folder / Add project** (label may vary) and select the inner `Lord_Cricket_XXVI` folder. It is the folder containing `AGENTS.md`, `package.json`, `.git`, `apps`, `packages`, `scripts`, and `tests`. Do not select the outer migration folder or the zipped release.
4. On your Windows PC install **Node.js 22.12+**, **Python 3**, and Git. The source does not bundle dependencies, so Codex must run `npm ci` from the repo root with network access when permitted.
5. Paste the task in `docs/codex-migration/FIRST_CODEX_TASK.md`. Start with a **read-only baseline verification**, then separately authorise changes. Require fresh browser and save/resume evidence before accepting gameplay milestones.

Alternative: install the Codex CLI from its official documentation and open Terminal in the inner source folder; use the Codex CLI from there. Do not ask Codex to reinitialise Git.

## Stage 3: Connect the same GitHub repo to Codex Cloud

1. Open https://chatgpt.com/codex/ and sign in.
2. Choose **Connect GitHub** or **Manage environments**. Authorise the appropriate OpenAI GitHub connection for account `SamForbes70`, with access **only to** `lord-cricket-xxvi` if you use selected-repositories access.
3. Create/select an environment pointing at `SamForbes70/lord-cricket-xxvi`, branch `main`.
4. First task: `Inspect AGENTS.md, CODEX_START_HERE.md, docs/codex-migration/RECOVERY_AUDIT.md and docs/codex-migration/FIRST_CODEX_TASK.md. Verify repo provenance and run all available tests. Report exact results and remaining BLOCKED gates. Do not alter cricket rules, models or source until baseline verification is complete.`
5. Keep experimental Codex changes on task branches and review pull requests before merging to main.

Note: GitHub being connected to normal ChatGPT **does not prove** this new repository has been authorised for the separate Codex Cloud environment. Choose it in Codex and confirm GitHub app repository scope.

## Important project facts

- Original source Pass 22 / M7J commit: `5b8b9da990d657197fb56bbfd33152f87b875f5c`.
- `SYNTHETIC_ALPHA` gameplay remains the production model; empirical fitting research is not approved for production.
- Test evidence reported historically: 538 TypeScript tests, 72 Python research tests; local CI and browser acceptance must be rerun.
- Browser IndexedDB careers are separate and are not included in the Git repository.
- The original user-supplied Cricsheet `t20s_json.zip` is not included in source by design; respect dataset licensing.

## Troubleshooting

- If the launcher says Git or `gh` is missing, install the named tool, close and reopen the Command Prompt, then launch it again.
- If the GitHub username is wrong, run `gh auth status` and select the correct account with `gh auth switch`, then retry.
- If the GitHub repo already exists, the launcher will stop. Review its existing contents rather than forcibly overwriting it.
- If repo creation succeeded but pushing failed, use `git remote -v` and GitHub to diagnose. Do **not** rerun a force push.
- If Codex Cloud cannot see the repo, adjust the ChatGPT/Codex GitHub app installation's repository access to include just that repository; refresh Codex environments.
- Do not commit `.env`, API keys, browser saves, account credentials or downloaded third-party data.
