# AI safety checkpoint for destructive commands

Prisma detects common AI-agent environments and blocks these commands until the user gives explicit consent:

- `prisma migrate reset`
- `prisma db push --force-reset`
- `prisma db push --accept-data-loss`

## Required workflow

1. Inspect the target database/config and explain exactly what can be deleted or reset.
2. Verify the target is a development, test, or synthetic database. Reject production, live, or government targets outright. User consent alone does not protect the wrong datasource.
3. Ask the user for explicit consent immediately before the action.
4. Run the command only after that consent.

For an agent-run subprocess, Prisma accepts the exact consent text through the `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION` environment variable. Read the message into a variable and expand it with double quotes. A `'` inside single-quoted text breaks the shell command and can execute injected syntax:

```bash
read -r -p 'Paste the exact consent message: ' consent
PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION="$consent" prisma migrate reset --force
```

The value must match the user's message exactly and must not contain added quotes or newlines. Never fabricate consent, reuse an old unrelated approval, or bypass the checkpoint by hiding agent-detection environment variables.

The MCP server has no `migrate-reset` tool. Use the shell command only after consent and only against a verified non-live target.

## Reference

- [Prisma ORM 7.9.0 release](https://github.com/prisma/prisma/releases/tag/7.9.0)
