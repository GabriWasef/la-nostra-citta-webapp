-- ============================================================
-- 004 — Sostegno e viste pubbliche (problemi P3, P4)
-- * il sostegno è ammesso solo su segnalazioni pubblicate e non PRIVATE;
-- * le viste espongono solo segnalazioni pubblicate e non PRIVATE;
-- * il numero di sostegni è sempre ricavato dalla tabella sostegno.
-- ============================================================

DROP TRIGGER IF EXISTS trg_verifica_sostegno;

DELIMITER $$

CREATE TRIGGER trg_verifica_sostegno
BEFORE INSERT ON sostegno
FOR EACH ROW
BEGIN
  DECLARE autore BIGINT;
  DECLARE vis VARCHAR(20);
  DECLARE stato_pubblico BOOLEAN;
  DECLARE stato_utente VARCHAR(20);

  SELECT stato_account INTO stato_utente FROM utente WHERE id_utente = NEW.id_utente;
  IF stato_utente IS NULL OR stato_utente <> 'ATTIVO' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Solo utenti ATTIVI possono esprimere sostegno';
  END IF;

  SELECT s.id_autore, s.visibilita, st.pubblica INTO autore, vis, stato_pubblico
    FROM segnalazione s JOIN stato_segnalazione st ON st.id_stato = s.id_stato_corrente
   WHERE s.id_segnalazione = NEW.id_segnalazione;

  IF autore = NEW.id_utente THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Non puoi sostenere la tua segnalazione';
  END IF;
  IF NOT stato_pubblico OR vis = 'PRIVATA' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Si possono sostenere solo segnalazioni pubblicate';
  END IF;
END$$

DELIMITER ;

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
WHERE st.pubblica = TRUE AND s.visibilita IN ('PUBBLICA', 'ANONIMA');

CREATE OR REPLACE VIEW v_classifica_segnalazioni AS
SELECT id_segnalazione, titolo, descrizione, data_inserimento,
       id_quartiere, quartiere, id_stato, codice_stato, stato, numero_sostegni
FROM v_segnalazioni_pubbliche;
