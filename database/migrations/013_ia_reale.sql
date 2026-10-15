-- ============================================================
-- 013 — IA reale (docs/piano-ia-reale.md)
-- * nuovo tipo di analisi VERIFICA_AUTENTICITA (coerenza EXIF, foto riutilizzate);
-- * hash percettivo degli allegati: trova le foto già usate in altre segnalazioni
--   anche se ricodificate o ridimensionate (hash_sha256 trova solo le copie identiche);
-- * data di scatto letta dall'EXIF all'upload (la ricodifica rimuove i metadati);
-- * job rimandati (limite di richieste del provider raggiunto, attesa tra i tentativi)
--   senza consumare tentativi.
--
-- Rollback (da eseguire a mano, dopo aver eliminato le righe VERIFICA_AUTENTICITA):
--   DELETE FROM analisi_ia WHERE tipo_analisi = 'VERIFICA_AUTENTICITA';
--   DELETE FROM job_elaborazione WHERE tipo_analisi = 'VERIFICA_AUTENTICITA';
--   ALTER TABLE analisi_ia DROP CHECK ck_ai_tipo;
--   ALTER TABLE analisi_ia ADD CONSTRAINT ck_ai_tipo CHECK (tipo_analisi IN (
--     'MODERAZIONE_TESTO', 'CLASSIFICAZIONE_TESTO', 'ANALISI_IMMAGINE',
--     'ANALISI_VIDEO', 'ESTRAZIONE_EXIF', 'VERIFICA_PERTINENZA'));
--   ALTER TABLE job_elaborazione DROP CHECK ck_job_tipo;
--   ALTER TABLE job_elaborazione DROP INDEX idx_job_disponibile, DROP COLUMN disponibile_dal,
--     ADD CONSTRAINT ck_job_tipo CHECK (tipo_analisi IN (
--     'MODERAZIONE_TESTO', 'CLASSIFICAZIONE_TESTO', 'ANALISI_IMMAGINE',
--     'ANALISI_VIDEO', 'ESTRAZIONE_EXIF', 'VERIFICA_PERTINENZA'));
--   ALTER TABLE allegato DROP CHECK ck_all_hash_percettivo, DROP INDEX idx_all_hash_percettivo,
--     DROP COLUMN hash_percettivo, DROP COLUMN data_scatto_exif;
--   DELETE FROM schema_migrazioni WHERE nome = '013_ia_reale.sql';
-- ============================================================

ALTER TABLE analisi_ia DROP CHECK ck_ai_tipo;

ALTER TABLE analisi_ia
  ADD CONSTRAINT ck_ai_tipo CHECK (tipo_analisi IN (
    'MODERAZIONE_TESTO', 'CLASSIFICAZIONE_TESTO', 'ANALISI_IMMAGINE',
    'ANALISI_VIDEO', 'ESTRAZIONE_EXIF', 'VERIFICA_PERTINENZA', 'VERIFICA_AUTENTICITA'
  ));

ALTER TABLE job_elaborazione DROP CHECK ck_job_tipo;

ALTER TABLE job_elaborazione
  ADD CONSTRAINT ck_job_tipo CHECK (tipo_analisi IN (
    'MODERAZIONE_TESTO', 'CLASSIFICAZIONE_TESTO', 'ANALISI_IMMAGINE',
    'ANALISI_VIDEO', 'ESTRAZIONE_EXIF', 'VERIFICA_PERTINENZA', 'VERIFICA_AUTENTICITA'
  )),
  -- NULL = subito disponibile; altrimenti il worker non lo prende prima di questa data.
  ADD COLUMN disponibile_dal TIMESTAMP NULL AFTER tentativi,
  ADD INDEX idx_job_disponibile (stato, disponibile_dal);

ALTER TABLE allegato
  -- pHash a 64 bit in esadecimale minuscolo (solo immagini).
  ADD COLUMN hash_percettivo CHAR(16) NULL AFTER hash_sha256,
  ADD COLUMN data_scatto_exif TIMESTAMP NULL AFTER longitudine_exif,
  ADD CONSTRAINT ck_all_hash_percettivo CHECK (hash_percettivo IS NULL OR REGEXP_LIKE(hash_percettivo, '^[0-9a-f]{16}$', 'c')),
  ADD INDEX idx_all_hash_percettivo (hash_percettivo);
