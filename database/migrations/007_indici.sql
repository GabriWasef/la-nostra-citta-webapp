-- ============================================================
-- 007 — Indici per le ricerche di RF08
-- Gli indici composti sostituiscono quelli a colonna singola sulle
-- stesse chiavi esterne (restano utilizzabili dalle FK come prefisso).
-- ============================================================

ALTER TABLE segnalazione
  ADD COLUMN data_aggiornamento TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;

CREATE INDEX idx_seg_stato_data ON segnalazione (id_stato_corrente, data_inserimento);
CREATE INDEX idx_seg_quartiere_stato ON segnalazione (id_quartiere, id_stato_corrente);
DROP INDEX idx_seg_stato ON segnalazione;
DROP INDEX idx_seg_quartiere ON segnalazione;

CREATE FULLTEXT INDEX ft_seg_testo ON segnalazione (titolo, descrizione);
