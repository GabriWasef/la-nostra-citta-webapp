-- ============================================================
-- Nascondere una segnalazione (moderazione).
-- Una segnalazione nascosta non compare in elenchi, classifica, mappa e statistiche
-- pubblici e non si può sostenere; la vedono solo l'autore e il comitato.
-- È reversibile e non cambia lo stato di avanzamento.
-- ============================================================

ALTER TABLE segnalazione
  ADD COLUMN nascosta BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN motivo_nascondimento VARCHAR(500) NULL,
  ADD COLUMN data_nascondimento TIMESTAMP NULL;

CREATE OR REPLACE VIEW v_segnalazioni_pubbliche AS
SELECT s.id_segnalazione, s.titolo, s.descrizione, s.data_inserimento,
       s.latitudine, s.longitudine, s.indirizzo, s.visibilita,
       s.id_quartiere, q.nome AS quartiere,
       st.id_stato, st.codice AS codice_stato, st.nome AS stato,
       CASE WHEN s.visibilita = 'ANONIMA' THEN NULL ELSE CONCAT(u.nome, ' ', u.cognome) END AS autore_visualizzato,
       (SELECT COUNT(*) FROM sostegno so WHERE so.id_segnalazione = s.id_segnalazione) AS numero_sostegni
FROM segnalazione s
JOIN utente u ON u.id_utente = s.id_autore
JOIN quartiere q ON q.id_quartiere = s.id_quartiere
JOIN stato_segnalazione st ON st.id_stato = s.id_stato_corrente
WHERE st.pubblica = TRUE AND s.visibilita IN ('PUBBLICA', 'ANONIMA') AND s.nascosta = FALSE;
