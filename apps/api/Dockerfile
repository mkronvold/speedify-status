# syntax=docker/dockerfile:1

FROM node:26-bookworm-slim AS build
WORKDIR /src
ENV CI=1
RUN npm install -g pnpm@10.33.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY packages/config/package.json packages/config/
COPY packages/contracts/package.json packages/contracts/
COPY apps/api/package.json apps/api/
RUN pnpm install --frozen-lockfile --filter @speedify-status/api...
COPY packages/config packages/config
COPY packages/contracts packages/contracts
COPY apps/api apps/api
RUN pnpm --filter @speedify-status/contracts build \
  && pnpm --filter @speedify-status/config build \
  && pnpm --filter @speedify-status/api build \
  && pnpm --filter @speedify-status/api deploy --prod --legacy /out

FROM node:26-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN groupadd --gid 10001 speedify \
  && useradd --uid 10001 --gid speedify --create-home --home-dir /app --shell /usr/sbin/nologin speedify
COPY --from=build --chown=speedify:speedify /out/ ./
USER speedify
EXPOSE 4090
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:4090/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/main.js"]
