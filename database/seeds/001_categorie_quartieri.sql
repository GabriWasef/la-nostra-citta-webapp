-- ============================================================
-- Seed — categorie e quartieri iniziali (idempotente)
-- Gli stati sono inseriti dalla migrazione 002.
-- ============================================================

INSERT INTO categoria (nome, descrizione) VALUES
('Ambiente','Problemi ambientali e inquinamento.'),
('Mobilità urbana','Trasporto pubblico, traffico e spostamenti.'),
('Politiche giovanili','Esigenze e iniziative per i giovani.'),
('Decoro urbano','Pulizia, rifiuti e spazi pubblici.'),
('Sicurezza','Sicurezza dei cittadini.'),
('Illuminazione','Illuminazione pubblica.'),
('Manutenzione stradale','Buche, marciapiedi e strade.'),
('Verde pubblico','Parchi, alberi e aree verdi.'),
('Viabilità','Segnaletica e organizzazione del traffico.'),
('Rischio idrogeologico','Allagamenti e dissesto del territorio.')
AS nuovo ON DUPLICATE KEY UPDATE descrizione = nuovo.descrizione;

INSERT INTO quartiere (nome, descrizione, municipio) VALUES
('Centro Storico','Area centrale della città.',1),
('Navigli','Zona dei Navigli.',6),
('Isola','Quartiere Isola.',9),
('Bicocca','Area Bicocca.',9),
('Lambrate','Quartiere Lambrate.',3),
('San Siro','Zona San Siro.',7)
AS nuovo ON DUPLICATE KEY UPDATE descrizione = nuovo.descrizione, municipio = nuovo.municipio;
