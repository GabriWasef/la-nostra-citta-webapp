# Immagine della webapp. Le dipendenze (compresi i moduli nativi argon2 e
# sharp) vengono installate qui dentro, per Linux: non copiare mai la
# cartella node_modules del proprio computer (vedi .dockerignore).

FROM node:22-bookworm-slim AS dipendenze
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

FROM node:22-bookworm-slim
WORKDIR /app
COPY --from=dipendenze /app/node_modules ./node_modules
COPY package.json package-lock.json ./
COPY server ./server
COPY client ./client
COPY database ./database
# Cartella degli allegati scrivibile dall'utente non privilegiato "node".
RUN mkdir -p uploads && chown node:node uploads
USER node

EXPOSE 3000
# All'avvio applica le migrazioni mancanti e i dati di base (idempotenti), poi avvia il server.
CMD ["sh", "-c", "node server/scripts/migrate.js && node server/scripts/seed.js && exec node server/src/server.js"]
