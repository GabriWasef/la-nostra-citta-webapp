-- ============================================================
-- 010 — Contatori dei limiti di frequenza condivisi tra istanze
-- Su Vercel ogni richiesta può essere servita da un'istanza diversa: i contatori
-- in memoria non servirebbero a fermare, per esempio, i tentativi di accesso
-- ripetuti. Con RATE_LIMIT_STORE=mysql si contano qui.
-- La data di scadenza è sempre quella del database (UTC), non dei server applicativi.
-- ============================================================

CREATE TABLE limite_richieste (
  chiave VARCHAR(190) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
  conteggio INT NOT NULL,
  scadenza TIMESTAMP(3) NOT NULL,
  INDEX idx_limite_scadenza (scadenza),
  CONSTRAINT ck_limite_conteggio CHECK (conteggio >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
