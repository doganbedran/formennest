# Technik (für Entwickler)

## Schutz gegen Angriffe (wie Wortnest)
- **Sicherheitsregel (Content Security Policy)** als `<meta>` in `index.html`: Skripte, Stile, Schriften, Bilder, Töne
  und Verbindungen nur von der eigenen Adresse; Fotos vom Gerät als `blob:`/`data:`. Damit laufen eingeschleuste
  Skripte, `onerror`-/`onclick`-Attribute und `javascript:`-Links nicht, und nichts kann Daten an fremde Adressen
  schicken. `object-src 'none'`, `base-uri 'self'`, `form-action 'none'`.
  Folgen für den Code: **keine eingebetteten `<script>`-Blöcke, keine `on…`-Attribute, kein `eval`/`new Function`,
  keine fremden Adressen** – auch nicht in Testseiten: deren Vorbereitung steht in `tests/<name>.vorher.js` (erzeugt),
  die „fertig“-Meldung an den Testserver in `tests/fertig-melden.js`. Stil-Attribute sind erlaubt (`style-src-attr`).
- **Nicht einbettbar:** Läuft die App in einem fremden Rahmen (`window.top !== window.self`), zeigt sie nur einen Link
  „in einem eigenen Fenster öffnen“ und startet nicht (Schutz vor Klick-Fallen). GitHub Pages erlaubt keine eigenen
  HTTP-Header, darum per Skript.
- **Link-Schutz:** `<meta name="referrer" content="no-referrer">`; externe Links mit `rel="noopener"`.
- Test `sicherheit` versucht all das (Skript einschleusen, Attribut, `javascript:`, fremdes Skript, Bild und `fetch` an
  fremde Adresse, Einbetten) und prüft, dass eigene Fotos weiter funktionieren. Gegenprobe: ohne die Regel ist er rot.
- Grenze: Wer das GitHub-Konto übernimmt, kann auch diese Regeln ändern – Konto-Schutz steht in Wortnests
  `docs/betrieb.md` (gleiches Konto).

## Daten neben Wortnest und Zahlennest
Eigene Datenbank `formennest`, Schlüssel nur mit `fn:`, gemeinsam nur die Pause (`nest:…`). Die Datenbanken der anderen
Apps (`lernapp`, `zahlennest`) werden nie geöffnet; Übernehmen von Kindern/Stimmen erst mit einem eigenen Datenvertrag
(Vorbild `../Kinder-Lernapp/docs/datenvertrag.md`). Der Offline-Speicher räumt nur eigene Caches (`formennest-…`) auf
und füllt sich beim Start selbst nach (`cache-pruefen`). Test `daten`.

**Eigene Stimmen** (Elternbereich „Stimmen“): Menschen = Store `profile` (`{ id 'p-…', name, erstellt, wortnestId? }`),
Fotos und Aufnahmen im Store `medien` mit Schlüssel `<profil>|<platz>|<art>` wie in Wortnest (`ich|bild`,
`datei:ansage-<name>.wav|stimme`). Wer spricht: `kind.stimme`, ohne Kinder `fn:stimme`; `null` = Computerstimme.
`stimmeLaden()` legt die Aufnahmen der aktiven Stimme als Objekt-URLs bereit, `ansageUrl(name)` nimmt sie vor
`audio/ansage-<name>.wav`. Studio wie Wortnest (gedrückt halten, 22 050 Hz, Stille abschneiden, angleichen);
Mikrofon nur im Studio, beim Verlassen/im Hintergrund zu. Test `stimme`.

**Ton am iPhone:** ein einziges Tonelement, beim ersten Tipp still entsperrt (Safari spielt sonst nur direkt nach einem
Tipp). Test `ton`. **👍 für Erwachsene:** gedrückt halten (`DAUMEN_HALTEN`), Test `daumen`.
