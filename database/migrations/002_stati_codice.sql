-- ============================================================
-- 002 — Codici stabili per gli stati (problema P7)
-- I trigger e l'applicazione riconoscono gli stati dal codice e dal
-- flag "pubblica", non dal nome visualizzato: l'amministratore può
-- rinominare uno stato senza rompere le regole di integrità.
-- ============================================================

ALTER TABLE stato_segnalazione
  ADD COLUMN codice VARCHAR(40) NULL AFTER id_stato,
  ADD COLUMN pubblica BOOLEAN NOT NULL DEFAULT FALSE
    COMMENT 'Stato in cui la segnalazione è pubblicata: richiede allegato e categoria',
  ADD COLUMN finale BOOLEAN NOT NULL DEFAULT FALSE
    COMMENT 'Stato conclusivo del ciclo di vita';

-- Gli stati sono dati di riferimento necessari alla logica applicativa:
-- vengono inseriti qui (se mancanti) e non nei seed.
INSERT INTO stato_segnalazione (nome, descrizione, ordine) VALUES
('Inserita','Segnalazione appena inviata dal cittadino.',1),
('In verifica','Segnalazione in fase di controllo.',2),
('Approvata','Segnalazione verificata e pubblicabile.',3),
('Rifiutata','Segnalazione non approvata.',4),
('Presa in carico','Il problema è stato preso in carico.',5),
('In valutazione','La proposta è in fase di valutazione.',6),
('Inserita nel documento programmatico','Proposta inserita nel documento programmatico.',7),
('Inviata ai candidati','Proposta inviata ai candidati Sindaco.',8),
('Chiusa','Ciclo di vita concluso.',9)
ON DUPLICATE KEY UPDATE id_stato = id_stato;

UPDATE stato_segnalazione SET codice = 'INSERITA'                WHERE ordine = 1;
UPDATE stato_segnalazione SET codice = 'IN_VERIFICA'             WHERE ordine = 2;
UPDATE stato_segnalazione SET codice = 'APPROVATA',               pubblica = TRUE WHERE ordine = 3;
UPDATE stato_segnalazione SET codice = 'RIFIUTATA',               finale = TRUE   WHERE ordine = 4;
UPDATE stato_segnalazione SET codice = 'PRESA_IN_CARICO',         pubblica = TRUE WHERE ordine = 5;
UPDATE stato_segnalazione SET codice = 'IN_VALUTAZIONE',          pubblica = TRUE WHERE ordine = 6;
UPDATE stato_segnalazione SET codice = 'DOCUMENTO_PROGRAMMATICO', pubblica = TRUE WHERE ordine = 7;
UPDATE stato_segnalazione SET codice = 'INVIATA_CANDIDATI',       pubblica = TRUE WHERE ordine = 8;
UPDATE stato_segnalazione SET codice = 'CHIUSA', pubblica = TRUE, finale = TRUE   WHERE ordine = 9;

ALTER TABLE stato_segnalazione
  MODIFY codice VARCHAR(40) NOT NULL,
  ADD CONSTRAINT uq_stato_codice UNIQUE (codice),
  ADD CONSTRAINT ck_stato_codice CHECK (REGEXP_LIKE(codice, '^[A-Z_]+$', 'c'));
