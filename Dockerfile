FROM node:22-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY server.js expense-api.js invoice-api.js app.js index.html styles.css login.html login.css login.js session-ui.js ./
COPY assets/ ./assets/
COPY scripts/ ./scripts/
RUN mkdir -p /data && chown -R node:node /data /app
USER node
ENV NODE_ENV=production PORT=3000 DATA_DIR=/data
EXPOSE 3000
VOLUME ["/data"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD node -e "fetch('http://127.0.0.1:3000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node","server.js"]
