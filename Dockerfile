# Oreo Nails API (Hono + Postgres). TypeScript runs through tsx, so there is no build step.
FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
# tsx is a devDependency but needed at runtime.
RUN npm ci --include=dev && npm cache clean --force
COPY tsconfig.json ./
COPY src ./src
RUN mkdir -p /app/data/uploads && chown -R node:node /app/data
USER node
EXPOSE 4000
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s CMD wget -qO- http://127.0.0.1:4000/health || exit 1
CMD ["node", "--import", "tsx", "src/index.ts"]
