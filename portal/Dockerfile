FROM node:24-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY . .
ENV NODE_ENV=production HOST=0.0.0.0 PORTAL_DATA_DIR=/data/portal STUDIO_ROOT=/data/studio
EXPOSE 4400
CMD ["npm", "start"]
