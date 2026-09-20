# Multi-stage production build for JellyTube
FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# Nginx production stage
FROM nginx:alpine

COPY --from=builder /app/dist /usr/share/nginx/html

# nginx:alpine's entrypoint runs envsubst over /etc/nginx/templates/*.template,
# so the Jellyfin upstream is configurable at run time instead of baked into the image.
COPY nginx.conf.template /etc/nginx/templates/default.conf.template

ENV JELLYFIN_UPSTREAM=http://host.docker.internal:8097

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
