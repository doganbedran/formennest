# Formennest

Montessori-inspirierte Lern-App für Kinder ab 3: Formen erkennen, Muster fortsetzen, Lage im Raum verstehen
(auf, in, unter). Läuft im Browser als installierbare App (PWA), offline, ohne Werbung, ohne Konto und ohne Tracking;
alle Daten bleiben auf dem Gerät. Formennest · eine App vom Lauschling – Geschwister-Apps:
[Wortnest](https://doganbedran.github.io/buchstaben/) (Buchstaben) und
[Zahlennest](https://doganbedran.github.io/zahlennest/) (Mengen und Zahlen).

**Ausprobieren:** https://doganbedran.github.io/formennest/ – im Browser öffnen, auf dem Handy „Zum Startbildschirm
hinzufügen“. Elternbereich: ⚙️ oben rechts 2 Sekunden halten. Fragen und Ideen gern als Issue hier auf GitHub.

**Stand:** im Aufbau – das Grundgerüst steht (Elternbereich, Kinder, eigene Stimmen, gemeinsame Pause, offline), die
Spiele kommen eins nach dem anderen. Konzept: [`docs/konzept.md`](docs/konzept.md).

## Spiele
- 🔷 **Passt rein** (ab 3) – wie die Geometrische Kommode: Kreis, Quadrat und Dreieck (gleiche Farbe, etwa gleiche
  Fläche) in die passende Mulde schieben. Nur die richtige nimmt an („klack“); in einer falschen wackelt der Einsatz und
  bleibt daneben liegen. Nach 2 Versuchen leuchtet die richtige Mulde, nach 3 gleitet er von selbst hinein. Drei
  Runden, die Mulden liegen jedes Mal anders, in Runde 3 leicht gedreht. Zum Schluss: „Such etwas Rundes bei dir zu
  Hause!“ – „Fahr mit dem Finger rundherum!“

- 🐭 **Wo ist die Maus?** (ab 3) – Lagewörter als Drei-Stufen-Lektion an einer Kiste auf Beinen mit halb offenem
  Deckel: 👀 „Die Maus ist auf der Kiste.“ → 👂 „Setz die Maus unter die Kiste!“ (schieben) → 🗣️ „Wo ist die Maus? Sag
  es!“. Woanders hingesetzt: „Jetzt ist sie in der Kiste.“, dann leuchtet der Platz, dann läuft sie selbst hin. Zum
  Schluss: „Setz dein Kuscheltier unter den Tisch!“

Geplant: „Zeig mir den Kreis“ (Formen benennen), „Klatsch – Stampf“ (Klatschmuster), „Muster legen“. Jede Runde endet mit einer kleinen Aufgabe in der echten Welt; ein Erwachsener hält dann 👍 gedrückt.

## Daten neben Wortnest und Zahlennest
Alle drei Apps liegen unter `doganbedran.github.io` und teilen sich damit den Browser-Speicher. Formennest nutzt darum
eine eigene Datenbank `formennest`, nur Schlüssel mit `fn:` und gemeinsam mit den anderen nur die Pause
(`nest:spielzeit`, `nest:pauseNach`, `nest:pauseAm`). Der Offline-Speicher räumt nur eigene Caches (`formennest-…`) auf.
Technik: [`docs/technik.md`](docs/technik.md).

## Entwickeln
Testserver `.venv/bin/python werkzeuge/testserver.py 8767`, dann `./werkzeuge/alle_tests.sh` (Firefox headless).
Vorläufige Ansagen erzeugt `werkzeuge/audio_erzeugen.py` mit Piper („Thorsten“); App-Symbol: `werkzeuge/symbol_erzeugen.sh`.

## Lizenz
Programmcode: GNU AGPL 3.0 (`LICENSE`). Schrift Andika: SIL Open Font License 1.1 (`fonts/OFL.txt`).
Aufnahmen: siehe `audio/LIZENZ.md`.
