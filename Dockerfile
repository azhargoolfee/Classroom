# Production image for Khadi's Classroom
FROM node:18-alpine AS base
WORKDIR /app

# Install deps first for better layer caching
COPY package.json package-lock.json* ./
RUN npm install --omit=dev && npm cache clean --force

# Copy app source
COPY . .

# Ensure database path exists (mounted volume recommended in production)
RUN mkdir -p /app/data

ENV PORT=3000
EXPOSE 3000

CMD ["node", "server.js"]


