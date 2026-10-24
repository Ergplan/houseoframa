# House of Rama on one box (docs/DEPLOY.md): the app, built for production, with Chromium for Playwright
# captures and git for extracting sites. Secrets come from the environment at run time, never the image.
FROM node:22-bookworm
ARG GIT_SHA=unknown
ENV GIT_SHA=$GIT_SHA \
    NEXT_TELEMETRY_DISABLED=1 \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable \
 # Site clones in the work volume may come from another user (copied in, or a restored backup): git must
 # still read them. Every repository in this container is House of Rama's own site clone.
 && git config --global --add safe.directory '*'
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile \
 && pnpm --filter @rama/trace exec playwright install --with-deps chromium \
 && pnpm --filter @rama/app build
ENV NODE_ENV=production
EXPOSE 3000
CMD ["sh", "-c", "pnpm db:migrate && pnpm db:seed && pnpm --filter @rama/app start --hostname 0.0.0.0 --port 3000"]
