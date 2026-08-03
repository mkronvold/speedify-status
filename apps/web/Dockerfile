# syntax=docker/dockerfile:1

FROM node:26-bookworm-slim AS build
WORKDIR /src
ENV CI=1
RUN npm install -g pnpm@10.33.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY packages/contracts/package.json packages/contracts/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile --filter @speedify-status/web...
COPY packages/contracts packages/contracts
COPY apps/web apps/web
ARG VITE_GIT_SHA=dev
ENV VITE_GIT_SHA=$VITE_GIT_SHA
RUN pnpm --filter @speedify-status/contracts build \
  && pnpm --filter @speedify-status/web build

FROM nginx:1.27-alpine AS runtime
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /src/apps/web/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1/ || exit 1
