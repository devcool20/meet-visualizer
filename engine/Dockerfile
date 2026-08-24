FROM node:20-slim AS builder

WORKDIR /app

COPY package*.json ./
COPY packages ./packages
COPY engine ./engine

RUN npm ci
RUN npm --prefix packages/card-spec run build || true
RUN npm --prefix packages/card-core run build || true
RUN npm --prefix packages/card-canvas run build || true
RUN npm --prefix packages/card-react run build || true
RUN npm --prefix engine run build

FROM node:20-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=5000

COPY --from=builder /app /app

EXPOSE 5000

WORKDIR /app/engine
CMD ["npm", "start"]
