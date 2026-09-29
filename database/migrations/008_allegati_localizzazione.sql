-- ============================================================
-- 008 — Allegati e localizzazione (problemi P8, P9 e RF14)
-- * coerenza tipo_media / tipo_mime (dipendenza transitiva controllata);
-- * percorso univoco e impronta SHA-256 del file;
-- * allegato.risultato_analisi resta per compatibilità ma è deprecato;
-- * origine delle coordinate della segnalazione.
-- ============================================================

ALTER TABLE allegato
  MODIFY percorso_file VARCHAR(500) NOT NULL,
  MODIFY risultato_analisi TEXT NULL COMMENT 'Deprecato: i risultati delle analisi sono in analisi_ia',
  ADD COLUMN hash_sha256 CHAR(64) NULL AFTER dimensione_bytes,
  ADD CONSTRAINT uq_all_percorso UNIQUE (percorso_file),
  ADD CONSTRAINT ck_all_mime CHECK (
    (tipo_media = 'IMMAGINE' AND tipo_mime LIKE 'image/%') OR
    (tipo_media = 'VIDEO' AND tipo_mime LIKE 'video/%')
  );

ALTER TABLE segnalazione
  ADD COLUMN origine_coordinate VARCHAR(20) NULL AFTER longitudine;

UPDATE segnalazione SET origine_coordinate = 'UTENTE' WHERE latitudine IS NOT NULL;

ALTER TABLE segnalazione
  ADD CONSTRAINT ck_seg_origine CHECK (origine_coordinate IN ('UTENTE', 'MAPPA', 'EXIF', 'GEOCODIFICA')),
  ADD CONSTRAINT ck_seg_origine_coord CHECK (
    (latitudine IS NULL AND origine_coordinate IS NULL) OR
    (latitudine IS NOT NULL AND origine_coordinate IS NOT NULL)
  );
