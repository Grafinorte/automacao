FROM node:20-slim

RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Server deps
COPY server/package*.json ./server/
RUN cd server && npm install

# Client deps
COPY client/package*.json ./client/
RUN cd client && npm install

# Copy source
COPY server/ ./server/
COPY client/ ./client/

# Build server (gera prisma client + compila TS)
RUN cd server && npx prisma generate && npm run build

# Build client
RUN cd client && npm run build

RUN mkdir -p /data

EXPOSE 3000

CMD ["sh", "-c", "cd server && npx prisma db push --schema=prisma/schema.prisma --skip-generate && node dist/index.js"]
