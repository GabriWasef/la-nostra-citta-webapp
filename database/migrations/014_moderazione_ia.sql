-- ============================================================
-- 014 — Moderazione automatica IA e quote giornaliere dei provider
-- * ai_quota: richieste e token del giorno (UTC) per provider. Su Vercel le istanze non
--   condividono la memoria: i contatori stanno nel database e si aggiornano in modo atomico
--   (INSERT ... ON DUPLICATE KEY UPDATE). Il limite al minuto resta in limite_richieste.
-- * segnalazione.data_conferma_nascondimento: il comitato ha confermato una segnalazione
--   nascosta automaticamente dall'IA (motivazione "AUTO_IA: <motivo>"); NULL = da esaminare.
--
-- Rollback (da eseguire a mano):
--   DROP TABLE ai_quota;
--   ALTER TABLE segnalazione DROP COLUMN data_conferma_nascondimento;
--   DELETE FROM schema_migrazioni WHERE nome = '014_moderazione_ia.sql';
-- ============================================================

CREATE TABLE ai_quota (
  provider VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  giorno DATE NOT NULL,
  richieste INT NOT NULL DEFAULT 0,
  token BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY (provider, giorno),
  CONSTRAINT ck_quota_richieste CHECK (richieste >= 0),
  CONSTRAINT ck_quota_token CHECK (token >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

ALTER TABLE segnalazione
  ADD COLUMN data_conferma_nascondimento TIMESTAMP NULL AFTER data_nascondimento;
