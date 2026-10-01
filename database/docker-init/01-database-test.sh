#!/bin/sh
# Eseguito dal container MySQL solo al primo avvio (volume vuoto): crea il
# database di test e concede all'utente applicativo i permessi su di esso.
# Deve avere terminazioni di riga LF (vedi .gitattributes).
set -e
mysql -uroot -p"$MYSQL_ROOT_PASSWORD" <<SQL
CREATE DATABASE IF NOT EXISTS \`${TEST_DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
GRANT ALL PRIVILEGES ON \`${TEST_DB_NAME}\`.* TO '${MYSQL_USER}'@'%';
FLUSH PRIVILEGES;
SQL
