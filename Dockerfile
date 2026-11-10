# TenderAgent all-in-one image: compiled Express API + built frontend (dist/).
# A private VM running Coolify builds this and binds the container to the
# private network interface only.
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && npm run build:server

FROM node:22-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
# Production deps only; the server is a pre-compiled bundle, so no tsx or
# devDependency is needed (or network-fetched) at container start.
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY --from=build /app/dist-server ./dist-server
EXPOSE 3001
CMD ["node", "dist-server/server.mjs"]
