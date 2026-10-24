# Formennest

Montessori-inspirierte Lern-App für Kinder ab 3: Formen erkennen, Muster fortsetzen, Lage im Raum verstehen
(auf, in, unter). Läuft im Browser als installierbare App (PWA), offline, ohne Werbung, ohne Konto und ohne Tracking;
alle Daten bleiben auf dem Gerät. Formennest · eine App vom Lauschling – Geschwister-Apps:
[Wortnest](https://doganbedran.github.io/buchstaben/) (Buchstaben) und
[Zahlennest](https://doganbedran.github.io/zahlennest/) (Mengen und Zahlen).

**Ausprobieren:** https://doganbedran.github.io/formennest/ – im Browser öffnen, auf dem Handy „Zum Startbildschirm
hinzufügen“. Elternbereich: ⚙️ oben rechts 2 Sekunden halten. Fragen und Ideen gern als Issue hier auf GitHub.

**Stand:** fünf Spiele zu Formen, Raum-Lage und Mustern; dazu Elternbereich, Kinder, eigene Stimmen, gemeinsame Pause, offline. Konzept: [`docs/konzept.md`](docs/konzept.md).

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

- ⚫ **Zeig mir den Kreis** (ab 3½) – Kreis, Quadrat und Dreieck benennen: 👀 „Das ist ein Dreieck.“ → 👂 „Wo ist das
  Dreieck?“ (erst 2, dann 3 Karten; daneben: benennen, dann leuchten die Ecken und werden gezählt, dann Lösung) →
  🗣️ „Was ist das? Sag es!“ → 🔍 „Auch das ist ein Dreieck.“ (spitz, flach, gedreht; Quadrat nie auf der Spitze).
  Zum Schluss: „Such ein Dreieck bei dir zu Hause!“

- 👏 **Klatsch – Stampf** (ab 3½) – ein Hör- und Bewegungsmuster fortsetzen: Die App spricht die Bildreihe 👏 🦶 👏 🦶
  ⬜ in einem Zug (jedes Bild leuchtet mit seinem Klang), das Kind tippt 👏 oder 🦶. Passt es nicht, kommt die Reihe
  nochmal, dann leuchtet der passende Knopf, dann setzt die App ihn ein. Kein Takt, kein Tempo. Vier Runden: AB, BA,
  AAB, ABB. Zum Schluss klatscht und stampft das Kind selbst.

- 🔺 **Muster legen** (ab 4; mit 3 die erste Runde) – Teile unterscheiden sich in Form und Helligkeit (dunkler Kreis,
  helles Dreieck, mittleres Quadrat). Runde 1: das Muster ● ▲ ● ▲ genauso darunter legen; ab Runde 2 weiterlegen
  („Rund, spitz, rund, spitz, rund. Und dann?“): AB, AAB, ABB, ABC. Ein unpassendes Teil gleitet zurück (sonst wäre
  das Muster kaputt), dann leuchtet das passende, dann legt die App es. Zum Schluss: „Leg ein Muster mit echten Dingen:
  Löffel, Becher, Löffel, Becher!“

Jede Runde endet mit einer kleinen Aufgabe in der echten Welt; ein Erwachsener hält dann 👍 gedrückt.

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
