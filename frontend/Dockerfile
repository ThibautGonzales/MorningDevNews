# Frontend image, in two stages: Node builds the Angular app, then nginx serves the result.
# Only the nginx stage ends up in the final image, so Node is not shipped.

FROM node:24-alpine AS build
WORKDIR /app
# Dependencies first, so Docker reuses this layer while only the code changes.
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:1.29-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist/frontend/browser /usr/share/nginx/html
EXPOSE 80
