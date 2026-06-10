FROM node:20-slim AS build

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10.3.0 --activate

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build
RUN pnpm prune --prod

FROM node:20-slim AS runtime

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8787
ENV SOOTHSAY_DATA_DIR=/data

COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/dist-server ./dist-server

VOLUME ["/data"]
EXPOSE 8787

CMD ["node", "dist-server/index.js"]
