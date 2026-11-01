FROM node:24-bookworm-slim@sha256:c86ecead9e55a5210ac1727de38a4ca840bf03dcaf34dc9749addbf383b1920c AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig*.json ./
COPY apps ./apps
COPY packages ./packages
RUN npm run typecheck && npm run build && npx tsc -p tsconfig.server.json
RUN npm prune --omit=dev

FROM node:24-bookworm-slim@sha256:c86ecead9e55a5210ac1727de38a4ca840bf03dcaf34dc9749addbf383b1920c AS runtime
ARG REVISION
LABEL org.opencontainers.image.source="https://github.com/xLeitix/theflock" \
      org.opencontainers.image.revision="${REVISION}"
ENV NODE_ENV=production NODE_OPTIONS=--max-old-space-size=128 \
    FLOCK_REVISION=${REVISION} FLOCK_RUNTIME_FILE=/run/flock/runtime.json \
    FLOCK_STATIC_ROOT=/app/apps/web/dist
WORKDIR /app
COPY --from=build /app/package*.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/build ./build
COPY --from=build /app/apps/web/dist ./apps/web/dist
USER node
CMD ["node", "build/apps/api/src/index.js"]
