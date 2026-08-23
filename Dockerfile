FROM node:22-alpine

WORKDIR /workspace

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/web/package.json apps/web/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/ui/package.json packages/ui/package.json

RUN pnpm install --frozen-lockfile

COPY . .

RUN DATABASE_URL='postgresql://placeholder:placeholder@localhost:5432/digilicense?sslmode=require' \
    pnpm --filter @digilicense/db build

RUN chown -R node:node /workspace

USER node

EXPOSE 3000

CMD ["pnpm", "--filter", "web", "exec", "vite", "dev", "--host", "0.0.0.0", "--port", "3000"]
