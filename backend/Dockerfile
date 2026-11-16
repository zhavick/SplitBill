FROM node:20-alpine

RUN apk add --no-cache openssl libc6-compat

WORKDIR /app

# Copy root manifest dan workspace packages
COPY package.json package-lock.json ./
COPY shared/package.json ./shared/
COPY backend/package.json ./backend/
COPY frontend/package.json ./frontend/

# Install dependencies monorepo
RUN npm install --no-audit --no-fund

# Copy source code shared dan backend
COPY shared/ ./shared/
COPY backend/ ./backend/

WORKDIR /app/backend

# Generate Prisma Client
RUN npx prisma generate

EXPOSE 4000

ENV PORT=4000
ENV HOST=0.0.0.0

CMD ["sh", "-c", "npx prisma migrate deploy && npx tsx src/server.ts"]
