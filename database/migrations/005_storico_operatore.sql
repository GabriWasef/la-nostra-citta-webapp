-- ============================================================
-- 005 — Storico con operatore e motivazione (problema P5)
-- L'applicazione imposta nella stessa connessione, prima dell'operazione:
--   SET @lnc_id_operatore = <id utente>, @lnc_motivazione = '<testo>';
-- e le azzera subito dopo. Senza variabili:
-- * alla creazione l'operatore è l'autore;
-- * al cambio di stato l'operatore resta NULL (modifica fuori applicazione).
-- ============================================================

DROP TRIGGER IF EXISTS trg_storico_insert;
DROP TRIGGER IF EXISTS trg_storico_update;

DELIMITER $$

CREATE TRIGGER trg_storico_insert
AFTER INSERT ON segnalazione
FOR EACH ROW
BEGIN
  INSERT INTO storico_stato (id_segnalazione, id_stato, id_utente_operatore, motivazione)
  VALUES (NEW.id_segnalazione, NEW.id_stato_corrente,
          COALESCE(@lnc_id_operatore, NEW.id_autore),
          COALESCE(@lnc_motivazione, 'Creazione della segnalazione'));
END$$

CREATE TRIGGER trg_storico_update
AFTER UPDATE ON segnalazione
FOR EACH ROW
BEGIN
  IF NOT (OLD.id_stato_corrente <=> NEW.id_stato_corrente) THEN
    INSERT INTO storico_stato (id_segnalazione, id_stato, id_utente_operatore, motivazione)
    VALUES (NEW.id_segnalazione, NEW.id_stato_corrente,
            @lnc_id_operatore,
            COALESCE(@lnc_motivazione, 'Cambio di stato'));
  END IF;
END$$

DELIMITER ;
