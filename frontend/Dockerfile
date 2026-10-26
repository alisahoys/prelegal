FROM node:22-alpine AS dependencies
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app/frontend
COPY --from=dependencies /app/frontend/node_modules ./node_modules
COPY frontend/ ./
COPY templates/ /app/templates/
COPY catalog.json /app/catalog.json
RUN npm run build

FROM node:22-alpine AS runner
ENV NODE_ENV=production
WORKDIR /app/frontend
COPY --from=dependencies /app/frontend/node_modules ./node_modules
COPY --from=builder /app/frontend/package.json ./package.json
COPY --from=builder /app/frontend/.next ./.next
COPY --from=builder /app/templates/ /app/templates/
COPY --from=builder /app/catalog.json /app/catalog.json
ENV HOSTNAME=0.0.0.0 PORT=3000
EXPOSE 3000
CMD ["npm", "start"]
