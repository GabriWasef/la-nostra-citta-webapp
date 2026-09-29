-- ============================================================
-- 003 — Integrità della pubblicazione (problemi P1, P2, P15)
-- * una segnalazione non può nascere già pubblicata;
-- * il controllo allegato/categoria usa il flag stato_segnalazione.pubblica;
-- * non si può rimuovere l'ultimo allegato o l'ultima categoria di una
--   segnalazione pubblicata (le cancellazioni in CASCADE non attivano i
--   trigger, quindi l'eliminazione dell'intera segnalazione resta possibile);
-- * un allegato non può essere spostato su un'altra segnalazione.
-- ============================================================

DROP TRIGGER IF EXISTS trg_verifica_autore;
DROP TRIGGER IF EXISTS trg_verifica_pubblicazione;
DROP TRIGGER IF EXISTS trg_verifica_pubblicazione_insert;
DROP TRIGGER IF EXISTS trg_allegato_before_delete;
DROP TRIGGER IF EXISTS trg_allegato_before_update;
DROP TRIGGER IF EXISTS trg_categoria_before_delete;

DELIMITER $$

CREATE TRIGGER trg_verifica_autore
BEFORE INSERT ON segnalazione
FOR EACH ROW
BEGIN
  DECLARE stato_autore VARCHAR(20);
  SELECT stato_account INTO stato_autore FROM utente WHERE id_utente = NEW.id_autore;
  IF stato_autore IS NULL OR stato_autore <> 'ATTIVO' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'L''autore deve avere un account ATTIVO';
  END IF;
END$$

CREATE TRIGGER trg_verifica_pubblicazione_insert
BEFORE INSERT ON segnalazione
FOR EACH ROW
FOLLOWS trg_verifica_autore
BEGIN
  DECLARE stato_pubblico BOOLEAN;
  SELECT pubblica INTO stato_pubblico FROM stato_segnalazione WHERE id_stato = NEW.id_stato_corrente;
  IF stato_pubblico THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Una segnalazione non può essere creata già pubblicata: servono prima allegato e categoria';
  END IF;
END$$

CREATE TRIGGER trg_verifica_pubblicazione
BEFORE UPDATE ON segnalazione
FOR EACH ROW
BEGIN
  DECLARE stato_pubblico BOOLEAN;
  DECLARE n_allegati INT;
  DECLARE n_categorie INT;
  SELECT pubblica INTO stato_pubblico FROM stato_segnalazione WHERE id_stato = NEW.id_stato_corrente;
  IF stato_pubblico THEN
    SELECT COUNT(*) INTO n_allegati FROM allegato WHERE id_segnalazione = NEW.id_segnalazione;
    SELECT COUNT(*) INTO n_categorie FROM segnalazione_categoria WHERE id_segnalazione = NEW.id_segnalazione;
    IF n_allegati = 0 THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Serve almeno un allegato per pubblicare la segnalazione';
    END IF;
    IF n_categorie = 0 THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Serve almeno una categoria per pubblicare la segnalazione';
    END IF;
  END IF;
END$$

CREATE TRIGGER trg_allegato_before_delete
BEFORE DELETE ON allegato
FOR EACH ROW
BEGIN
  DECLARE stato_pubblico BOOLEAN;
  DECLARE n_allegati INT;
  SELECT st.pubblica INTO stato_pubblico
    FROM segnalazione s JOIN stato_segnalazione st ON st.id_stato = s.id_stato_corrente
   WHERE s.id_segnalazione = OLD.id_segnalazione;
  IF stato_pubblico THEN
    SELECT COUNT(*) INTO n_allegati FROM allegato WHERE id_segnalazione = OLD.id_segnalazione;
    IF n_allegati <= 1 THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Non si può eliminare l''unico allegato di una segnalazione pubblicata';
    END IF;
  END IF;
END$$

CREATE TRIGGER trg_allegato_before_update
BEFORE UPDATE ON allegato
FOR EACH ROW
BEGIN
  IF NEW.id_segnalazione <> OLD.id_segnalazione THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Un allegato non può essere spostato su un''altra segnalazione';
  END IF;
END$$

CREATE TRIGGER trg_categoria_before_delete
BEFORE DELETE ON segnalazione_categoria
FOR EACH ROW
BEGIN
  DECLARE stato_pubblico BOOLEAN;
  DECLARE n_categorie INT;
  SELECT st.pubblica INTO stato_pubblico
    FROM segnalazione s JOIN stato_segnalazione st ON st.id_stato = s.id_stato_corrente
   WHERE s.id_segnalazione = OLD.id_segnalazione;
  IF stato_pubblico THEN
    SELECT COUNT(*) INTO n_categorie FROM segnalazione_categoria WHERE id_segnalazione = OLD.id_segnalazione;
    IF n_categorie <= 1 THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Una segnalazione pubblicata deve mantenere almeno una categoria';
    END IF;
  END IF;
END$$

DELIMITER ;
