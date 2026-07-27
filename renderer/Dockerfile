FROM mcr.microsoft.com/playwright:v1.61.1-noble@sha256:5b8f294aff9041b7191c34a4bab3ac270157a28774d4b0660e9743297b697e48

WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY src ./src
COPY scripts ./scripts

ENV PORT=3001
EXPOSE 3001
USER pwuser
CMD ["node", "src/server.js"]
