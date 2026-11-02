# Security and private configuration

- Never commit real API keys, bot tokens, chat IDs, account IDs, database IDs, deployed Worker URLs, runtime reports or local configuration.
- Keep `.setup.env` readable only by its owner (`chmod 600`). It is plaintext, not encrypted storage. The setup wizard uploads runtime credentials as Cloudflare Worker Secrets.
- After successful setup, local `.setup.env` may be removed if credentials are safely stored elsewhere. Local management scripts then require environment variables or a securely restored configuration.
- `.gitignore` excludes local environment/configuration files, reports, logs, dependencies and key files. It does not remove files already tracked by Git. Check `git status`, `git diff --cached` and `git ls-files` before every publication.
- Do not place secrets in URLs, screenshots, shell arguments, CI output or public issues. Telegram API URLs contain the bot token; do not log them.
- Use a dedicated Telegram bot and the intended private chat. Webhook requests require a shared secret; commands additionally validate both sender and private-chat IDs. Management endpoints require a separate Bearer token.
- A deployed Worker has public HTTP endpoints; `/health` is intentionally public. Market data, reports and management access should remain private and comply with provider terms.
- If a credential leaks, revoke/rotate it with the provider immediately, update Worker Secrets and local configuration, and reset the webhook if needed. Removing a file or adding an ignore rule does not revoke a credential or erase Git history.
- Report vulnerabilities privately through the repository's GitHub security reporting feature if available; do not publish credentials or private infrastructure identifiers in an issue.
