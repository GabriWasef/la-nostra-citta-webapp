-- ============================================================
-- 009 — Predisposizione IA (problema P11)
-- * analisi video;
-- * esito dell'analisi e revisione del moderatore;
-- * coda di elaborazione asincrona per le analisi lente.
-- ============================================================

ALTER TABLE analisi_ia DROP CHECK ck_ai_tipo;

ALTER TABLE analisi_ia
  ADD CONSTRAINT ck_ai_tipo CHECK (tipo_analisi IN (
    'MODERAZIONE_TESTO', 'CLASSIFICAZIONE_TESTO', 'ANALISI_IMMAGINE',
    'ANALISI_VIDEO', 'ESTRAZIONE_EXIF', 'VERIFICA_PERTINENZA'
  )),
  ADD COLUMN esito VARCHAR(20) NULL AFTER punteggio,
  ADD COLUMN esito_revisione VARCHAR(20) NULL,
  ADD COLUMN id_revisore BIGINT NULL,
  ADD COLUMN data_revisione TIMESTAMP NULL,
  ADD CONSTRAINT ck_ai_esito CHECK (esito IS NULL OR esito IN ('OK', 'DA_REVISIONARE', 'BLOCCATO')),
  ADD CONSTRAINT ck_ai_revisione CHECK (esito_revisione IS NULL OR esito_revisione IN ('CONFERMATA', 'CORRETTA', 'RESPINTA')),
  ADD CONSTRAINT fk_ai_revisore FOREIGN KEY (id_revisore) REFERENCES utente(id_utente) ON DELETE SET NULL;

CREATE TABLE job_elaborazione (
  id_job BIGINT AUTO_INCREMENT PRIMARY KEY,
  tipo_analisi VARCHAR(40) NOT NULL,
  stato VARCHAR(20) NOT NULL DEFAULT 'IN_CODA',
  tentativi SMALLINT NOT NULL DEFAULT 0,
  ultimo_errore TEXT NULL,
  data_creazione TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  data_aggiornamento TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  id_segnalazione BIGINT NOT NULL,
  id_allegato BIGINT NULL,
  CONSTRAINT ck_job_tipo CHECK (tipo_analisi IN (
    'MODERAZIONE_TESTO', 'CLASSIFICAZIONE_TESTO', 'ANALISI_IMMAGINE',
    'ANALISI_VIDEO', 'ESTRAZIONE_EXIF', 'VERIFICA_PERTINENZA'
  )),
  CONSTRAINT ck_job_stato CHECK (stato IN ('IN_CODA', 'IN_CORSO', 'COMPLETATO', 'ERRORE')),
  CONSTRAINT ck_job_tentativi CHECK (tentativi >= 0),
  INDEX idx_job_stato (stato, id_job),
  CONSTRAINT fk_job_seg FOREIGN KEY (id_segnalazione) REFERENCES segnalazione(id_segnalazione) ON DELETE CASCADE,
  CONSTRAINT fk_job_all FOREIGN KEY (id_allegato) REFERENCES allegato(id_allegato) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
