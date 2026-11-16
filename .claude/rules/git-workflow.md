# Git workflow

## Permission
- Never commit, push, or open a pull request automatically. Always ask the user for permission first, every time.

## Branches and pull requests
- Never push directly to `main`.
- Create a separate branch for each implementation, then open a pull request into `main`.
- After a commit and push, give the user the link to create the pull request manually, in the form `https://github.com/<owner>/<repo>/compare/main...<branch>?expand=1`. Take owner and repo from `git remote get-url origin`. Add a suggested title and description.
- Do not merge the pull request yourself. The merge is done manually by a team member.

## Commits
- Never commit without a message. Write a short message that says what changed and why.
- If an implementation touches several parts of the application (for example `api/`, `web/`, `modules/gmail-import/`), create a separate commit for each part. Do this split automatically, without being asked, once the user has given permission to commit.

## Sensitive files
- Never commit or push files that contain secrets: API keys, tokens, account details, Google OAuth client secrets, or Google project IDs.
- Examples here: `modules/gmail-import/config.json`, `.env`, and any `client_secret*.json` or token file.
- Use the `*.example.json` pattern. Commit the example with placeholder values and keep the real file in `.gitignore`.
- If a secret was already committed, tell the user. Don't hide it with a new commit, because it stays in the history and has to be rotated.
