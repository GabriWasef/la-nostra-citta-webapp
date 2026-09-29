/**
 * Divide uno script SQL in singole istruzioni, gestendo il comando
 * DELIMITER del client mysql (che il server e il driver non conoscono),
 * le stringhe tra apici e i commenti.
 * @param {string} sql
 * @returns {string[]}
 */
export function splitSqlStatements(sql) {
  const statements = [];
  let delimiter = ';';
  let corrente = '';
  let i = 0;
  let inizioRiga = true;

  const chiudi = () => {
    const s = corrente.trim();
    if (s) statements.push(s);
    corrente = '';
  };

  while (i < sql.length) {
    // Comando DELIMITER a inizio riga
    if (inizioRiga) {
      const resto = sql.slice(i);
      const match = /^[ \t]*DELIMITER[ \t]+(\S+)[ \t]*(\r?\n|$)/i.exec(resto);
      if (match) {
        chiudi();
        delimiter = match[1];
        i += match[0].length;
        continue;
      }
    }

    const c = sql[i];

    // Commenti: -- fino a fine riga, # fino a fine riga, /* ... */
    if ((c === '-' && sql[i + 1] === '-' && /\s/.test(sql[i + 2] ?? ' ')) || c === '#') {
      const fine = sql.indexOf('\n', i);
      i = fine === -1 ? sql.length : fine;
      continue;
    }
    if (c === '/' && sql[i + 1] === '*') {
      const fine = sql.indexOf('*/', i + 2);
      i = fine === -1 ? sql.length : fine + 2;
      continue;
    }

    // Stringhe e identificatori quotati
    if (c === "'" || c === '"' || c === '`') {
      let j = i + 1;
      while (j < sql.length) {
        if (sql[j] === '\\' && c !== '`') {
          j += 2;
          continue;
        }
        if (sql[j] === c) {
          if (sql[j + 1] === c) {
            j += 2;
            continue;
          }
          break;
        }
        j++;
      }
      corrente += sql.slice(i, j + 1);
      i = j + 1;
      inizioRiga = false;
      continue;
    }

    if (sql.startsWith(delimiter, i)) {
      chiudi();
      i += delimiter.length;
      continue;
    }

    corrente += c;
    inizioRiga = c === '\n';
    i++;
  }
  chiudi();
  return statements;
}
