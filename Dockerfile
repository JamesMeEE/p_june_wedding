FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production DATA_DIR=/data
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY server.js index.html edit.js ./
COPY assets ./assets
COPY music ./music
CMD ["node", "server.js"]
