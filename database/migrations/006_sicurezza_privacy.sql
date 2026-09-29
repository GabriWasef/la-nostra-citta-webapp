-- ============================================================
-- 006 — Sicurezza e privacy (problema P10)
-- * password_hash a lunghezza limitata;
-- * consenso privacy, ultimo accesso, data di aggiornamento;
-- * sessioni applicative salvate nel database (revocabili);
-- * token di recupero password (si salva solo l'hash SHA-256);
-- * registro delle operazioni importanti.
-- ============================================================

ALTER TABLE utente
  MODIFY password_hash VARCHAR(255) NOT NULL,
  ADD COLUMN data_consenso_privacy TIMESTAMP NULL AFTER data_registrazione,
  ADD COLUMN data_ultimo_accesso TIMESTAMP NULL AFTER data_consenso_privacy,
  ADD COLUMN data_aggiornamento TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;

CREATE TABLE sessione (
  session_id VARCHAR(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL PRIMARY KEY,
  id_utente BIGINT NULL,
  scadenza TIMESTAMP NOT NULL,
  dati MEDIUMTEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  INDEX idx_sessione_scadenza (scadenza),
  INDEX idx_sessione_utente (id_utente),
  CONSTRAINT fk_sessione_utente FOREIGN KEY (id_utente) REFERENCES utente(id_utente) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE token_recupero_password (
  id_token BIGINT AUTO_INCREMENT PRIMARY KEY,
  id_utente BIGINT NOT NULL,
  token_hash CHAR(64) NOT NULL,
  data_creazione TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  data_scadenza TIMESTAMP NOT NULL,
  data_utilizzo TIMESTAMP NULL,
  CONSTRAINT uq_token_hash UNIQUE (token_hash),
  CONSTRAINT ck_token_scadenza CHECK (data_scadenza > data_creazione),
  CONSTRAINT fk_token_utente FOREIGN KEY (id_utente) REFERENCES utente(id_utente) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE log_operazione (
  id_log BIGINT AUTO_INCREMENT PRIMARY KEY,
  data_operazione TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  id_utente BIGINT NULL,
  azione VARCHAR(60) NOT NULL,
  entita VARCHAR(40) NULL,
  id_entita BIGINT NULL,
  dettagli JSON NULL,
  indirizzo_ip VARCHAR(45) NULL,
  INDEX idx_log_data (data_operazione),
  INDEX idx_log_entita (entita, id_entita),
  CONSTRAINT fk_log_utente FOREIGN KEY (id_utente) REFERENCES utente(id_utente) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
