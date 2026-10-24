// Ansagen der Spiele: Dateiname (audio/ansage-<name>.wav) -> [Text, Spiel].
// Eine Quelle für App, Offline-Speicher (sw.js) und Piper (werkzeuge/audio_erzeugen.py).
// Zählfolgen sind ganze Aufnahmen (nicht aus Einzelwörtern), die letzte Zahl betont; „eins“ beim Zählen.
const ANSAGEN = {
  'pause': ['Jetzt machen wir eine Pause.', 'Alle Spiele'],
  'zaehlen-1': ['Eins!', 'Alle Spiele'],
  'zaehlen-2': ['Eins, zwei. Zwei!', 'Alle Spiele'],
  'zaehlen-3': ['Eins, zwei, drei. Drei!', 'Alle Spiele'],
  'zaehlen-4': ['Eins, zwei, drei, vier. Vier!', 'Alle Spiele'],
  'zaehlen-5': ['Eins, zwei, drei, vier, fünf. Fünf!', 'Alle Spiele'],
  'schau-mal': ['Schau mal!', 'Alle Spiele'],
  'jetzt-in-echt': ['Jetzt in echt!', 'Alle Spiele'],
  'echt-umlenken': ['Mach es in echt, mit deinen Händen!', 'Alle Spiele'],
  'zeig-mal': ['Zeig mal!', 'Alle Spiele'],
  // Passt rein
  'passt-start': ['Jede Form hat ihren Platz. Schieb sie hinein!', 'Passt rein'],
  'passt-hilfe': ['Schau genau: Wo passt sie hinein?', 'Passt rein'],
  'passt-fertig': ['Alles passt!', 'Passt rein'],
  'passt-welt-vor': ['Schau: Rundherum, ganz rund!', 'Passt rein'],
  'passt-welt': ['Such etwas Rundes bei dir zu Hause!', 'Passt rein'],
  'passt-welt-zeig': ['Fahr mit dem Finger rundherum!', 'Passt rein'],
  'passt-welt-fertig': ['Rundherum – das ist rund!', 'Passt rein'],
};
