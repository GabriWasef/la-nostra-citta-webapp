-- ============================================================
-- 001 — Schema iniziale
-- Tabelle, indici, trigger e viste dello script ufficiale
-- (database/schema/database_la_nostra_citta_mysql.sql),
-- senza DROP e senza dati: può essere applicata a un database vuoto.
-- Le correzioni emerse dall'analisi tecnica sono nelle migrazioni successive.
-- ============================================================

CREATE TABLE quartiere (
 id_quartiere BIGINT AUTO_INCREMENT PRIMARY KEY,
 nome VARCHAR(100) NOT NULL UNIQUE,
 descrizione TEXT,
 municipio SMALLINT,
 CONSTRAINT ck_quartiere_municipio CHECK (municipio IS NULL OR municipio BETWEEN 1 AND 9)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE utente (
 id_utente BIGINT AUTO_INCREMENT PRIMARY KEY,
 nome VARCHAR(80) NOT NULL,
 cognome VARCHAR(80) NOT NULL,
 email VARCHAR(254) NOT NULL UNIQUE,
 password_hash TEXT NOT NULL,
 ruolo VARCHAR(20) NOT NULL DEFAULT 'CITTADINO',
 data_registrazione TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 stato_account VARCHAR(20) NOT NULL DEFAULT 'ATTIVO',
 id_quartiere_residenza BIGINT,
 CONSTRAINT ck_utente_nome CHECK (CHAR_LENGTH(TRIM(nome)) >= 2),
 CONSTRAINT ck_utente_cognome CHECK (CHAR_LENGTH(TRIM(cognome)) >= 2),
 CONSTRAINT ck_utente_email CHECK (INSTR(email, '@') > 1),
 CONSTRAINT ck_utente_ruolo CHECK (ruolo IN ('CITTADINO','MODERATORE','AMMINISTRATORE')),
 CONSTRAINT ck_utente_stato CHECK (stato_account IN ('ATTIVO','SOSPESO','ELIMINATO')),
 CONSTRAINT fk_utente_quartiere FOREIGN KEY (id_quartiere_residenza)
   REFERENCES quartiere(id_quartiere) ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE stato_segnalazione (
 id_stato BIGINT AUTO_INCREMENT PRIMARY KEY,
 nome VARCHAR(80) NOT NULL UNIQUE,
 descrizione TEXT,
 ordine SMALLINT NOT NULL UNIQUE,
 CONSTRAINT ck_stato_ordine CHECK (ordine > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE categoria (
 id_categoria BIGINT AUTO_INCREMENT PRIMARY KEY,
 nome VARCHAR(100) NOT NULL UNIQUE,
 descrizione TEXT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE segnalazione (
 id_segnalazione BIGINT AUTO_INCREMENT PRIMARY KEY,
 titolo VARCHAR(150) NOT NULL,
 descrizione TEXT NOT NULL,
 data_inserimento TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 latitudine DECIMAL(9,6),
 longitudine DECIMAL(9,6),
 indirizzo VARCHAR(255),
 visibilita VARCHAR(20) NOT NULL DEFAULT 'PUBBLICA',
 id_autore BIGINT NOT NULL,
 id_quartiere BIGINT NOT NULL,
 id_stato_corrente BIGINT NOT NULL,
 CONSTRAINT ck_seg_titolo CHECK (CHAR_LENGTH(TRIM(titolo)) BETWEEN 5 AND 150),
 CONSTRAINT ck_seg_descrizione CHECK (CHAR_LENGTH(TRIM(descrizione)) BETWEEN 20 AND 5000),
 CONSTRAINT ck_seg_lat CHECK (latitudine IS NULL OR latitudine BETWEEN -90 AND 90),
 CONSTRAINT ck_seg_lon CHECK (longitudine IS NULL OR longitudine BETWEEN -180 AND 180),
 CONSTRAINT ck_seg_coord CHECK ((latitudine IS NULL AND longitudine IS NULL) OR (latitudine IS NOT NULL AND longitudine IS NOT NULL)),
 CONSTRAINT ck_seg_vis CHECK (visibilita IN ('PUBBLICA','PRIVATA','ANONIMA')),
 CONSTRAINT fk_seg_autore FOREIGN KEY (id_autore) REFERENCES utente(id_utente) ON UPDATE CASCADE ON DELETE RESTRICT,
 CONSTRAINT fk_seg_quartiere FOREIGN KEY (id_quartiere) REFERENCES quartiere(id_quartiere) ON UPDATE CASCADE ON DELETE RESTRICT,
 CONSTRAINT fk_seg_stato FOREIGN KEY (id_stato_corrente) REFERENCES stato_segnalazione(id_stato) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE allegato (
 id_allegato BIGINT AUTO_INCREMENT PRIMARY KEY,
 nome_file VARCHAR(255) NOT NULL,
 percorso_file TEXT NOT NULL,
 tipo_mime VARCHAR(100) NOT NULL,
 tipo_media VARCHAR(10) NOT NULL,
 dimensione_bytes BIGINT NOT NULL,
 data_caricamento TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 latitudine_exif DECIMAL(9,6),
 longitudine_exif DECIMAL(9,6),
 risultato_analisi TEXT,
 id_segnalazione BIGINT NOT NULL,
 CONSTRAINT ck_all_tipo CHECK (tipo_media IN ('IMMAGINE','VIDEO')),
 CONSTRAINT ck_all_dim CHECK (dimensione_bytes > 0),
 CONSTRAINT ck_all_coord CHECK ((latitudine_exif IS NULL AND longitudine_exif IS NULL) OR (latitudine_exif IS NOT NULL AND longitudine_exif IS NOT NULL)),
 CONSTRAINT fk_all_seg FOREIGN KEY (id_segnalazione) REFERENCES segnalazione(id_segnalazione) ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE segnalazione_categoria (
 id_segnalazione BIGINT NOT NULL,
 id_categoria BIGINT NOT NULL,
 origine_assegnazione VARCHAR(20) NOT NULL DEFAULT 'MANUALE',
 affidabilita_ia DECIMAL(5,4),
 data_assegnazione TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY (id_segnalazione, id_categoria),
 CONSTRAINT ck_sc_origine CHECK (origine_assegnazione IN ('MANUALE','IA','IMPORTATA')),
 CONSTRAINT ck_sc_aff CHECK (affidabilita_ia IS NULL OR affidabilita_ia BETWEEN 0 AND 1),
 CONSTRAINT ck_sc_ia CHECK (origine_assegnazione <> 'IA' OR affidabilita_ia IS NOT NULL),
 FOREIGN KEY (id_segnalazione) REFERENCES segnalazione(id_segnalazione) ON DELETE CASCADE,
 FOREIGN KEY (id_categoria) REFERENCES categoria(id_categoria) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE sostegno (
 id_utente BIGINT NOT NULL,
 id_segnalazione BIGINT NOT NULL,
 data_sostegno TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY (id_utente, id_segnalazione),
 FOREIGN KEY (id_utente) REFERENCES utente(id_utente) ON DELETE CASCADE,
 FOREIGN KEY (id_segnalazione) REFERENCES segnalazione(id_segnalazione) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE storico_stato (
 id_storico BIGINT AUTO_INCREMENT PRIMARY KEY,
 data_cambio TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 motivazione TEXT,
 id_segnalazione BIGINT NOT NULL,
 id_stato BIGINT NOT NULL,
 id_utente_operatore BIGINT,
 FOREIGN KEY (id_segnalazione) REFERENCES segnalazione(id_segnalazione) ON DELETE CASCADE,
 FOREIGN KEY (id_stato) REFERENCES stato_segnalazione(id_stato) ON DELETE RESTRICT,
 FOREIGN KEY (id_utente_operatore) REFERENCES utente(id_utente) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE analisi_ia (
 id_analisi BIGINT AUTO_INCREMENT PRIMARY KEY,
 tipo_analisi VARCHAR(40) NOT NULL,
 modello VARCHAR(150) NOT NULL,
 risultato JSON NOT NULL,
 punteggio DECIMAL(5,4),
 data_analisi TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 id_segnalazione BIGINT,
 id_allegato BIGINT,
 CONSTRAINT ck_ai_tipo CHECK (tipo_analisi IN ('MODERAZIONE_TESTO','CLASSIFICAZIONE_TESTO','ANALISI_IMMAGINE','ESTRAZIONE_EXIF','VERIFICA_PERTINENZA')),
 CONSTRAINT ck_ai_punteggio CHECK (punteggio IS NULL OR punteggio BETWEEN 0 AND 1),
 CONSTRAINT ck_ai_target CHECK (id_segnalazione IS NOT NULL OR id_allegato IS NOT NULL),
 FOREIGN KEY (id_segnalazione) REFERENCES segnalazione(id_segnalazione) ON DELETE CASCADE,
 FOREIGN KEY (id_allegato) REFERENCES allegato(id_allegato) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE INDEX idx_utente_quartiere ON utente(id_quartiere_residenza);
CREATE INDEX idx_seg_autore ON segnalazione(id_autore);
CREATE INDEX idx_seg_quartiere ON segnalazione(id_quartiere);
CREATE INDEX idx_seg_stato ON segnalazione(id_stato_corrente);
CREATE INDEX idx_seg_data ON segnalazione(data_inserimento);
CREATE INDEX idx_all_seg ON allegato(id_segnalazione);
CREATE INDEX idx_sostegno_seg ON sostegno(id_segnalazione);
CREATE INDEX idx_storico_seg_data ON storico_stato(id_segnalazione, data_cambio);
CREATE INDEX idx_ai_seg ON analisi_ia(id_segnalazione);
CREATE INDEX idx_ai_all ON analisi_ia(id_allegato);

DELIMITER $$

CREATE TRIGGER trg_verifica_autore
BEFORE INSERT ON segnalazione
FOR EACH ROW
BEGIN
 DECLARE stato_autore VARCHAR(20);
 SELECT stato_account INTO stato_autore FROM utente WHERE id_utente=NEW.id_autore;
 IF stato_autore IS NULL OR stato_autore <> 'ATTIVO' THEN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='L autore deve avere un account ATTIVO';
 END IF;
END$$

CREATE TRIGGER trg_verifica_sostegno
BEFORE INSERT ON sostegno
FOR EACH ROW
BEGIN
 DECLARE autore BIGINT;
 DECLARE stato_utente VARCHAR(20);
 SELECT stato_account INTO stato_utente FROM utente WHERE id_utente=NEW.id_utente;
 IF stato_utente IS NULL OR stato_utente <> 'ATTIVO' THEN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Solo utenti ATTIVI possono esprimere sostegno';
 END IF;
 SELECT id_autore INTO autore FROM segnalazione WHERE id_segnalazione=NEW.id_segnalazione;
 IF autore=NEW.id_utente THEN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Non puoi sostenere la tua segnalazione';
 END IF;
END$$

CREATE TRIGGER trg_verifica_pubblicazione
BEFORE UPDATE ON segnalazione
FOR EACH ROW
BEGIN
 DECLARE nome_stato VARCHAR(80);
 DECLARE n_allegati INT;
 DECLARE n_categorie INT;
 SELECT nome INTO nome_stato FROM stato_segnalazione WHERE id_stato=NEW.id_stato_corrente;
 IF nome_stato IN ('Approvata','Presa in carico','In valutazione','Inserita nel documento programmatico','Inviata ai candidati','Chiusa') THEN
  SELECT COUNT(*) INTO n_allegati FROM allegato WHERE id_segnalazione=NEW.id_segnalazione;
  SELECT COUNT(*) INTO n_categorie FROM segnalazione_categoria WHERE id_segnalazione=NEW.id_segnalazione;
  IF n_allegati=0 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Serve almeno un allegato'; END IF;
  IF n_categorie=0 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Serve almeno una categoria'; END IF;
 END IF;
END$$

CREATE TRIGGER trg_storico_insert
AFTER INSERT ON segnalazione
FOR EACH ROW
BEGIN
 INSERT INTO storico_stato(id_segnalazione,id_stato,motivazione) VALUES(NEW.id_segnalazione,NEW.id_stato_corrente,'Creazione della segnalazione');
END$$

CREATE TRIGGER trg_storico_update
AFTER UPDATE ON segnalazione
FOR EACH ROW
BEGIN
 IF NOT (OLD.id_stato_corrente <=> NEW.id_stato_corrente) THEN
  INSERT INTO storico_stato(id_segnalazione,id_stato,motivazione) VALUES(NEW.id_segnalazione,NEW.id_stato_corrente,'Cambio automatico dello stato');
 END IF;
END$$

DELIMITER ;

CREATE OR REPLACE VIEW v_classifica_segnalazioni AS
SELECT s.id_segnalazione,s.titolo,s.descrizione,s.data_inserimento,q.nome AS quartiere,st.nome AS stato,COUNT(so.id_utente) AS numero_sostegni
FROM segnalazione s JOIN quartiere q ON q.id_quartiere=s.id_quartiere JOIN stato_segnalazione st ON st.id_stato=s.id_stato_corrente
LEFT JOIN sostegno so ON so.id_segnalazione=s.id_segnalazione
WHERE st.nome <> 'Rifiutata'
GROUP BY s.id_segnalazione,s.titolo,s.descrizione,s.data_inserimento,q.nome,st.nome;

CREATE OR REPLACE VIEW v_segnalazioni_pubbliche AS
SELECT s.id_segnalazione,s.titolo,s.descrizione,s.data_inserimento,s.latitudine,s.longitudine,s.indirizzo,q.nome AS quartiere,st.nome AS stato,
CASE WHEN s.visibilita='ANONIMA' THEN NULL ELSE CONCAT(u.nome,' ',u.cognome) END AS autore_visualizzato,
COUNT(DISTINCT so.id_utente) AS numero_sostegni
FROM segnalazione s JOIN utente u ON u.id_utente=s.id_autore JOIN quartiere q ON q.id_quartiere=s.id_quartiere JOIN stato_segnalazione st ON st.id_stato=s.id_stato_corrente
LEFT JOIN sostegno so ON so.id_segnalazione=s.id_segnalazione
WHERE s.visibilita IN ('PUBBLICA','ANONIMA') AND st.nome <> 'Rifiutata'
GROUP BY s.id_segnalazione,s.titolo,s.descrizione,s.data_inserimento,s.latitudine,s.longitudine,s.indirizzo,q.nome,st.nome,s.visibilita,u.nome,u.cognome;
