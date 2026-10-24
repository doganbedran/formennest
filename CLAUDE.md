# Formennest – Arbeitsanweisung für Claude

Montessori-inspirierte Lern-App (PWA) für Kinder ab 3: Formen erkennen, Muster fortsetzen, Lage im Raum verstehen.
Dritte App der Nest-Familie (Absender **Lauschling**, „Formennest · eine App vom Lauschling“); Geschwister-Apps
**Wortnest** (`../Kinder-Lernapp`, live https://doganbedran.github.io/buchstaben/) und **Zahlennest** (`../Zahlennest`,
live https://doganbedran.github.io/zahlennest/). Das Grundgerüst stammt aus Zahlennest (Version 31). Läuft offline im
Browser, keine Cloud, kein Tracking. Adresse: https://doganbedran.github.io/formennest/ (GitHub Pages aus `main`,
Repo `doganbedran/formennest`, **öffentlich**). Alles auf Deutsch: Oberfläche, Bezeichner, Kommentare, Commits.

Konzept: `docs/konzept.md`. Gestaltungsrichtlinie der Familie: https://claude.ai/artifact/Gz3dEtZzQPZcjPagrsc398

## Wichtigste Regeln
- **Adresse nie ändern**, sobald sie online ist (Daten hängen an der Origin).
- **Wortnest und Zahlennest nie verändern.** Alle drei Apps teilen die Origin `doganbedran.github.io` und damit
  localStorage/IndexedDB:
  - eigene IndexedDB **`formennest`** (nie `lernapp` oder `zahlennest` öffnen; Übernehmen aus den anderen Apps nur mit
    einem Datenvertrag wie `../Kinder-Lernapp/docs/datenvertrag.md`, Test `daten` dann anpassen);
  - alle localStorage-Schlüssel mit Präfix **`fn:`** (Wortnest: ungepräfixt wie `sterne`, `kind`; Zahlennest: `zn:` –
    nie schreiben);
  - gemeinsam mit beiden nur die Pause: `nest:spielzeit`, `nest:pauseNach`, `nest:pauseAm` (Format nur in allen Apps
    zugleich ändern);
  - Offline-Speicher nur `formennest-v…` (sw.js räumt nur eigene Caches ab).
- **Nichts Privates ins Repo:** keine Namen, Fotos oder Aufnahmen der Familie, keine Sicherungsdateien. Ausnahme:
  die Stimme des Users als Sprecher. Nie Kinderstimmen/Namen; Push von Aufnahmen nur mit ausdrücklicher Freigabe.
- Keine Cloud-KI/-Dienste einbauen oder vorschlagen, außer der User fragt ausdrücklich.
- Zielgruppe 3–4 (ein Kind ist 3, eines 4): große Knöpfe, keine Texte für Kinder, kein „falsch“, Eltern-Funktionen
  hinter ⚙️ (2 s halten), 👍 für Erwachsene (gedrückt halten).
- Formen-/Muster-Regeln: Formen unterscheiden sich in Gestalt **und Helligkeit, nie nur in der Farbe**; in einem
  Spiel gleich groß und gleiche Farbe, damit nach Form (nicht nach Farbe/Größe) sortiert wird; ein Merkmal wechselt.
  Erst mit der Hand (einsetzen, umfahren, schieben), dann benennen; Selbstkontrolle durch das Material (passt/passt
  nicht). Quadrat nicht um 45° drehen (wird sonst „Raute“). Muster: AB vor AAB vor ABC, kein Takt/Tempo prüfen.
  Raum: „auf/in/unter“ vor „neben/hinter/vor“. Nach 2 Versuchen Hilfe, nach 3 Lösung zeigen und weiter.
  Jede Runde endet mit einem Auftrag in der echten Welt (vormachen → „Jetzt in echt!“ → Erwachsener hält 👍).
- Farben: Akzent **Violett `#7a3e9d`** (Weiß 7,0:1; deutlich anders als Wortnest-Orange und Zahlennest-Petrol, auch bei
  Farbsehschwächen). Beim Nachspuren/Umfahren nur Blau `#1d5fbf` (Start) + Orange `#b8470b` (Pfeile) wie Wortnest.
- Ansagen als ganze Sätze; „ein/eine“ richtig je Wort (der Kreis, das Dreieck, das Quadrat).

## Arbeitsablauf je Änderung
1. Testserver: `.venv/bin/python werkzeuge/testserver.py 8767 &` (Port 8767; Wortnest 8765, Zahlennest 8766).
2. Bauen; bei neuer Funktion Test `tests/<name>.js` + Eintrag in `werkzeuge/testseiten_erzeugen.sh` und
   `werkzeuge/alle_tests.sh`. Neues Spiel: in `ALLE_SPIELE`/`SPIEL_INFO` eintragen, Stopp-Funktion in `SPIEL_STOPPEN`.
3. `APP_VERSION` in `app.js` und `CACHE` in `sw.js` gemeinsam um 1 erhöhen; neue Offline-Dateien in `DATEIEN`.
4. `./werkzeuge/alle_tests.sh` – alle OK. **Push nur gekoppelt an den Exit-Code** und ohne nicht freigegebene `.wav`.
5. Commit + Push; danach live prüfen (`sw.js` mit neuer Cache-Nummer).
6. Kurzer Bericht auf Deutsch ohne Fachjargon: neu / getestet / nur am Handy prüfbar.

## Team und Abläufe (`.claude/`)
- Rollen: `paedagogin`, `bildungsplan`, `kinderpsychologin`, `ux-kinder`, `testerin`, `reviewer`, `datenschutz`,
  `kinder-tester` – Befunde als Muss / Sollte / Idee. `/neuer-inhalt`, `/veroeffentlichen`.
- Echte Beobachtungen der Kinder gehen vor dem virtuellen Team. Kinderwohl und Projektregeln entscheiden Widersprüche.

## Testen – Stolperfallen (wie Zahlennest)
- `.venv` und `.stimmen` sind lokale Verweise auf `../Kinder-Lernapp/` (Piper „Thorsten“); `./werkzeuge/alle_tests.sh start`
  startet nur Läufe, deren Name so beginnt. Testserver nach einem Neustart des Rechners neu starten (sonst „KEIN BILD“).
- Solange es kaum Spiele gibt, legen Tests mit `probeSpiele([...])` (`tests/probespiele.js`) vorgetäuschte Spiele an.
- **Sicherheitsregel (CSP):** keine eingebetteten `<script>`, keine `on…`-Attribute, kein `eval`, keine fremden
  Adressen – auch nicht in Testseiten. Test `sicherheit`, Beschreibung `docs/technik.md`.
- Firefox-Snap: Profile/Screenshots nur unter `~/snap/firefox/common/formennest-test/`; Firefox direkt starten.
- Asynchrone Tests: `/_warten?ms=…` als iframe; auf `startFertig` warten. Skripte nie ändern, während Tests laufen.
- Animationen: Hüpfen/Wackeln nie am Element, das per `transform` positioniert ist (inneres Element animieren);
  vor dem Greifen im Test warten, bis Übergänge fertig sind.
