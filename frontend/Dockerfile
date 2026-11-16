FROM node:20-alpine AS builder

RUN apk add --no-cache libc6-compat

WORKDIR /app

# Copy root manifest dan workspace packages
COPY package.json package-lock.json ./
COPY shared/package.json ./shared/
COPY backend/package.json ./backend/
COPY frontend/package.json ./frontend/

# Install dependencies monorepo
RUN npm install --no-audit --no-fund

# Copy source code shared dan frontend
COPY shared/ ./shared/
COPY frontend/ ./frontend/

WORKDIR /app/frontend

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

# Next.js Build
RUN npm run build

FROM node:20-alpine AS runner

RUN apk add --no-cache libc6-compat

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3385
ENV HOST=0.0.0.0

# Copy node_modules, shared, dan frontend hasil build
COPY --from=builder /app/package.json /app/package-lock.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/shared ./shared
COPY --from=builder /app/frontend ./frontend

WORKDIR /app/frontend

EXPOSE 3385

CMD ["npx", "next", "start", "-p", "3385", "-H", "0.0.0.0"]
