# DigiLicence

Better than SARATHI

## shadcn/ui monorepo template

This is a TanStack Start monorepo template with shadcn/ui.

### Adding components

To add components to your app, run the following command from the repo root:

```bash
pnpm dlx shadcn@latest add button -c apps/web
```

This will place UI components in `packages/ui/src/components`.

### Using components

Import components from the `ui` package:

```tsx
import { Button } from "@workspace/ui/components/button"
```
