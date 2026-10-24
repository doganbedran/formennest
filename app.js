'use strict';

// Bei jeder Änderung zusammen mit CACHE in sw.js erhöhen (wird im Elternbereich angezeigt)
const APP_VERSION = 5;

// Nie in fremden Seiten laufen (Schutz vor „Klick-Fallen“, bei denen eine fremde Seite die App unsichtbar einbettet):
// eingebettet → nur ein Hinweis mit Link, die App startet nicht
if (window.top !== window.self) {
  document.body.className = '';
  document.body.textContent = '';
  const a = document.createElement('a');
  a.href = location.href;
  a.target = '_blank';
  a.rel = 'noopener';
  a.textContent = 'Formennest in einem eigenen Fenster öffnen';
  document.body.append(a);
  throw new Error('Formennest läuft nicht eingebettet');
}

const $ = (sel) => document.querySelector(sel);

// ---------- Speicher (lokal auf dem Gerät) ----------

// Wortnest liegt unter derselben Adresse und nutzt Schlüssel ohne Präfix („sterne“, „kind“, „spielzeit“ …) – die
// dürfen wir nie schreiben. Darum bekommt hier jeder Schlüssel „fn:“; nur die gemeinsame Pause steht unter „nest:“.
const speicher = {
  schluessel: (key) => (key.startsWith('nest:') ? key : `fn:${key}`),
  lesen(key, standard) {
    try {
      const wert = localStorage.getItem(this.schluessel(key));
      return wert === null ? standard : JSON.parse(wert);
    } catch { return standard; }
  },
  schreiben(key, wert) {
    try { localStorage.setItem(this.schluessel(key), JSON.stringify(wert)); } catch { /* privat/voll: ignorieren */ }
  },
};

// Browser bitten, Fotos und Einstellungen nicht bei Speicherknappheit zu löschen – erst wenn es etwas zu schützen gibt
function speicherSchuetzen() {
  try {
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  } catch { /* egal */ }
}

const zustand = {
  kind: speicher.lesen('kind', null),
  spiele: [],
};

// ---------- Datenbank (IndexedDB „formennest“, nur auf diesem Gerät) ----------

// Eigene Datenbank: „lernapp“ (Wortnest) und „zahlennest“ werden hier nie geöffnet. Übernehmen aus den anderen Apps
// nur nach einem Datenvertrag wie ../Kinder-Lernapp/docs/datenvertrag.md (dort bisher nur für Zahlennest).
// „profile“ und „medien“ sind für Menschen/Stimmen schon angelegt, damit dafür keine neue Version nötig ist.
const datenbank = (() => {
  let dbPromise = null;
  function oeffnen() {
    if (!dbPromise) {
      dbPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open('formennest', 1);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains('kinder')) db.createObjectStore('kinder', { keyPath: 'id' });
          if (!db.objectStoreNames.contains('profile')) db.createObjectStore('profile', { keyPath: 'id' });
          if (!db.objectStoreNames.contains('medien')) db.createObjectStore('medien');
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    }
    return dbPromise;
  }
  async function aktion(store, modus, fn) {
    try {
      const db = await oeffnen();
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(store, modus);
        const req = fn(tx.objectStore(store));
        tx.oncomplete = () => resolve(req && req.result);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);   // z. B. Speicher voll: kommt oft nur als abort
      });
    } catch { return undefined; }
  }
  return {
    kinder: async () => ((await aktion('kinder', 'readonly', (s) => s.getAll())) || [])
      .sort((a, b) => a.erstellt - b.erstellt),
    kindSpeichern: (k) => aktion('kinder', 'readwrite', (s) => s.put(k)),
    kindLoeschen: (id) => aktion('kinder', 'readwrite', (s) => s.delete(id)),
    // Menschen (Profile) und ihre Fotos/Aufnahmen; Medien-Schlüssel <profil>|<platz>|<art> wie in Wortnest
    profile: async () => ((await aktion('profile', 'readonly', (s) => s.getAll())) || [])
      .sort((a, b) => a.erstellt - b.erstellt),
    profilSpeichern: (p) => aktion('profile', 'readwrite', (s) => s.put(p)),
    async profilLoeschen(id) {
      await aktion('medien', 'readwrite', (s) => s.delete(medienBereich(id)));
      return aktion('profile', 'readwrite', (s) => s.delete(id));
    },
    medium: (profil, platz, art) => aktion('medien', 'readonly', (s) => s.get(`${profil}|${platz}|${art}`)),
    // Alle Medien eines Profils als [{ platz, art, blob }] (Schlüssel und Inhalte aus derselben Transaktion)
    medienVon: async (profil) => (await aktion('medien', 'readonly', (s) => {
      const schluessel = s.getAllKeys(medienBereich(profil));
      const inhalte = s.getAll(medienBereich(profil));
      return { get result() {
        return schluessel.result.map((k, i) => {
          const teile = k.split('|');
          return { platz: teile.slice(1, -1).join('|'), art: teile[teile.length - 1], blob: inhalte.result[i] };
        });
      } };
    })) || [],
    // true, wenn gespeichert (sonst z. B. Speicher voll)
    medienSetzen: async (profil, platz, art, blob) =>
      (await aktion('medien', 'readwrite', (s) => s.put(blob, `${profil}|${platz}|${art}`))) !== undefined,
    medienEntfernen: (profil, platz, art) => aktion('medien', 'readwrite', (s) => s.delete(`${profil}|${platz}|${art}`)),
  };
})();

function medienBereich(profil) {
  return IDBKeyRange.bound(`${profil}|`, `${profil}|\uffff`);
}

function htmlText(text) {
  const d = document.createElement('div');
  d.textContent = text;
  return d.innerHTML;
}

// ---------- Kinder: jedes Kind hat eigene Einstellungen (keine Zähler, keine Sterne) ----------

const TIERE = ['🦊', '🐻', '🐰', '🐼', '🦁', '🐸', '🐯', '🐨', '🦄', '🐶', '🐱', '🐵', '🐧', '🐢', '🦋', '🐞'];
let kinder = [];
let kindFotos = {};   // Kind-ID -> Objekt-URL des Fotos

function aktivesKind() {
  return kinder.find((k) => k.id === zustand.kind) || null;
}

async function kinderLaden() {
  Object.values(kindFotos).forEach((url) => URL.revokeObjectURL(url));
  kindFotos = {};
  kinder = await datenbank.kinder();
  kinder.forEach((k) => { if (k.foto) kindFotos[k.id] = URL.createObjectURL(k.foto); });
}

function kindBildHtml(k) {
  return kindFotos[k.id]
    ? `<img class="bild-datei foto" src="${kindFotos[k.id]}" alt="${htmlText(k.name)}">`
    : htmlText(k.tier || '');
}

// ---------- Spiele-Regal ----------

// Reihenfolge = Reihenfolge im Konzept (so werden sie nach und nach gebaut und freigeschaltet).
// Montessori: ein Material kommt erst ins Regal, wenn es gezeigt wurde. Gespeichert wird, was AUSGEBLENDET ist.
const ALLE_SPIELE = ['passt', 'maus', 'formen', 'klatsch'];
const START_REGAL = ['passt'];
const START_AUS = ALLE_SPIELE.filter((id) => !START_REGAL.includes(id));
// Für Eltern: was jedes Spiel tut (die Kacheln zeigen den Kindern nur ein Bild)
const SPIEL_INFO = {
  passt: 'Formen in die passende Mulde schieben – Kreis, Quadrat, Dreieck (ab 3)',
  maus: 'Lagewörter auf, in, unter: die Maus an die Kiste setzen (ab 3)',
  formen: 'Kreis, Quadrat und Dreieck benennen und wiedererkennen, auch gedreht (ab 3½)',
  klatsch: 'Ein Muster aus Klatschen und Stampfen fortsetzen – kein Takt, nur die Reihenfolge (ab 3½)',
};
// Fertige Spiele: id -> Startfunktion. Was hier fehlt, erscheint weder auf der Startseite noch im Regal.
const SPIELE = {};
// Jedes Spiel trägt hier seine Stopp-Funktion ein (Zurück-Taste hält alle an)
const SPIEL_STOPPEN = [];
const fertigeSpiele = () => ALLE_SPIELE.filter((id) => SPIELE[id]);

const regalVon = (aus) => ALLE_SPIELE.filter((id) => !aus.includes(id));
const ausVon = (sichtbar) => ALLE_SPIELE.filter((id) => !sichtbar.includes(id));
const appWeitAus = () => speicher.lesen('spieleAus', START_AUS);

function einstellungenLaden() {
  const k = aktivesKind();
  zustand.spiele = regalVon(k ? (k.spieleAus || START_AUS) : appWeitAus());
  SPIEL_OPTIONEN.forEach((o) => { zustand[o] = k ? !!(k[o] ?? optionStandard(o)) : !!speicher.lesen(o, optionStandard(o)); });
  return stimmeLaden();
}

// Schalter einzelner Spiele (je Kind, ohne Kinder app-weit): Name = Feld beim Kind, Schlüssel fn:<Name>, data-option
const SPIEL_OPTIONEN = [];
// Standard „an“ (sonst aus)
const SPIEL_STANDARD = {};
const optionStandard = (o) => !!SPIEL_STANDARD[o];

// Einstellungen einzelner Spiele nur zeigen, wenn es das Spiel schon gibt
function spielOptionenZeigen() {
  document.querySelectorAll('.spiel-option').forEach((el) => { el.hidden = !SPIELE[el.dataset.spiel]; });
}

function regalWahlZeichnen(box, gewaehlt, aendern) {
  box.innerHTML = '';
  const fertig = fertigeSpiele();
  if (!fertig.length) {
    box.innerHTML = '<p class="hinweis">Die ersten Spiele kommen mit den nächsten Updates.</p>';
    return;
  }
  fertig.forEach((id) => {
    const vorlage = document.querySelector(`#home .spiel-btn[data-spiel="${id}"]`);
    const btn = document.createElement('button');
    const an = gewaehlt.includes(id);
    btn.className = `regal-spiel${an ? ' gewaehlt' : ''}`;
    btn.innerHTML = `<span>${vorlage.innerHTML}</span><b>${vorlage.getAttribute('aria-label')}</b><small>${SPIEL_INFO[id]}</small>`;
    btn.setAttribute('aria-pressed', an);
    btn.addEventListener('click', () => {
      const neu = an ? gewaehlt.filter((x) => x !== id) : ALLE_SPIELE.filter((x) => x === id || gewaehlt.includes(x));
      // Das letzte fertige Spiel lässt sich nicht abwählen (sonst stünde das Kind vor einer leeren Startseite)
      if (neu.some((x) => SPIELE[x])) aendern(neu);
    });
    box.appendChild(btn);
  });
}

function spieleZeigen() {
  let sichtbar = 0;
  document.querySelectorAll('#home .spiel-btn').forEach((btn) => {
    const zeigen = !!SPIELE[btn.dataset.spiel] && zustand.spiele.includes(btn.dataset.spiel);
    btn.hidden = !zeigen;
    if (zeigen) sichtbar++;
  });
  $('#home-leer').hidden = sichtbar > 0;
  // Hochkant 2 Spalten (ab 7 Kacheln 3), quer höchstens 2 Reihen (4 bis 7 Spalten) – so passt alles ohne Blättern
  const quer = innerWidth > innerHeight;
  const spalten = Math.max(1, Math.min(sichtbar, quer ? Math.min(7, Math.max(4, Math.ceil(sichtbar / 2))) : (sichtbar > 6 ? 3 : 2)));
  const raster = $('#home .spiele-raster');
  raster.style.setProperty('--spalten', spalten);
  raster.style.setProperty('--reihen', Math.max(1, Math.ceil(sichtbar / spalten)));
  const k = aktivesKind();
  $('#btn-kind').hidden = !k;
  $('#btn-kind').innerHTML = k ? kindBildHtml(k) : '';
}

document.querySelectorAll('#home .spiel-btn').forEach((btn) => {
  btn.addEventListener('click', () => spielStarten(btn.dataset.spiel));
});
window.addEventListener('resize', () => { if ($('#home').classList.contains('active')) spieleZeigen(); });

function spielStarten(id) {
  audio();
  if (pauseLaeuft()) { pauseBildZeigen(); return; }
  if (SPIELE[id]) SPIELE[id]();
}

// ---------- Ton & Sprache ----------

let audioCtx = null;
// Ton-Baustein starten; darf nie werfen – sonst bräche jeder Tipp ab (z. B. ohne Soundgerät oder wenn der Browser ablehnt)
function audio() {
  try {
    if (!audioCtx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (Ctx) audioCtx = new Ctx();
    }
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
  } catch { return null; }
  return audioCtx;
}

let deutscheStimme = null;
function stimmeWaehlen() {
  if (!('speechSynthesis' in window)) return;
  const stimmen = speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith('de'));
  // Nur Stimmen, die auf dem Gerät laufen: Online-Stimmen schicken den Text an einen Dienst
  deutscheStimme = stimmen.find((v) => v.localService) || null;
}
if ('speechSynthesis' in window) {
  stimmeWaehlen();
  speechSynthesis.onvoiceschanged = stimmeWaehlen;
}

function sprechen(text) {
  if (!('speechSynthesis' in window) || !deutscheStimme) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'de-DE';
  u.voice = deutscheStimme;
  u.rate = 0.8;
  u.pitch = 1.1;
  speechSynthesis.speak(u);
}

// Abspielen von Audiodateien nacheinander; ein neuer Aufruf bricht den laufenden ab
const wiedergabe = { audio: null, nummer: 0, beenden: null };

// Ein einziges Tonelement für alles: Safari auf dem iPhone spielt Töne nur direkt nach einem Tipp – außer über ein
// Element, das schon einmal bei einem Tipp gespielt hat. Darum wird es beim ersten Tipp mit einem stillen Ton
// „entsperrt“; danach dürfen auch Ansagen nach Pausen, Zeitgebern und Schieben erklingen.
const tonEl = new Audio();
tonEl.preload = 'auto';
let tonEntsperrt = false;
const STILLE = (() => {
  const v = new DataView(new ArrayBuffer(44 + 200));
  const text = (o, t) => [...t].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  text(0, 'RIFF'); v.setUint32(4, 36 + 200, true); text(8, 'WAVE'); text(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, 8000, true);
  v.setUint32(28, 16000, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); text(36, 'data'); v.setUint32(40, 200, true);
  return URL.createObjectURL(new Blob([v.buffer], { type: 'audio/wav' }));
})();
function tonEntsperren() {
  if (tonEntsperrt || !tonEl.paused) return;   // spielt gerade etwas: nicht unterbrechen
  tonEl.onended = tonEl.onerror = tonEl.onplaying = null;
  tonEl.src = STILLE;
  const p = tonEl.play();
  if (p) p.then(() => { tonEntsperrt = true; }).catch(() => {});
}
['touchend', 'pointerup', 'click', 'keydown'].forEach((art) => document.addEventListener(art, tonEntsperren, { capture: true, passive: true }));

// Anhalten meldet die laufende Aufnahme als beendet: wer auf sie wartet, läuft weiter und prüft dann selbst, ob er
// noch dran ist (ein angehaltenes Audio meldet sonst nie „zu Ende“ – der Ablauf dahinter bliebe für immer stehen)
function wiedergabeStoppen() {
  wiedergabe.nummer++;
  if (wiedergabe.audio) { wiedergabe.audio.pause(); wiedergabe.audio = null; }
  if (wiedergabe.beenden) { const fertig = wiedergabe.beenden; wiedergabe.beenden = null; fertig(); }
  if ('speechSynthesis' in window) speechSynthesis.cancel();
}

function abspielen(quelle) {
  return new Promise((resolve, reject) => {
    const a = tonEl;
    a.onplaying = null;
    a.src = quelle;
    wiedergabe.audio = a;
    wiedergabe.beenden = resolve;
    a.onended = resolve;
    a.onerror = reject;
    a.play().catch(reject);
  });
}

async function folgeAbspielen(folge, ersatzText) {
  wiedergabeStoppen();
  const nummer = wiedergabe.nummer;
  try {
    for (const q of folge) {
      if (nummer !== wiedergabe.nummer) return;
      await abspielen(q.url);
    }
  } catch {
    // Datei fehlt (z. B. offline ohne Cache): Notlösung Sprachausgabe des Geräts
    if (nummer === wiedergabe.nummer && ersatzText) sprechen(ersatzText);
  }
}

const ansage = (name) => folgeAbspielen([{ url: ansageUrl(name) }], ANSAGEN[name][0]);
const warten = (ms) => new Promise((r) => setTimeout(r, ms));
const zufall = (liste) => liste[Math.floor(Math.random() * liste.length)];
function mischen(liste) {
  const a = [...liste];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Zählfolge mit Leuchten: „Eins, zwei. Zwei!“ – die Dinge leuchten nacheinander im Takt der ganzen Aufnahme
// (gleichmäßig über die Dauer verteilt: n Zählwörter + die betonte letzte Zahl). Ohne Datei: Sprachausgabe.
async function zaehlenMitLeuchten(name, elemente, beiJedem = null) {
  wiedergabeStoppen();
  const nummer = wiedergabe.nummer;
  let gestartet = false;
  const leuchten = (dauer) => {
    if (gestartet) return;
    gestartet = true;
    elemente.forEach((el, i) => setTimeout(() => {
      if (nummer !== wiedergabe.nummer) return;
      el.classList.add('leuchtet');
      if (beiJedem) beiJedem(i);
    }, (dauer * 1000 * i) / (elemente.length + 1)));
  };
  try {
    await new Promise((resolve, reject) => {
      const a = tonEl;
      a.src = ansageUrl(name);
      wiedergabe.audio = a;
      wiedergabe.beenden = resolve;
      a.onended = resolve;
      a.onerror = reject;
      a.onplaying = () => leuchten(Number.isFinite(a.duration) ? a.duration : (elemente.length + 1) * 0.7);
      a.play().catch(reject);
    });
  } catch {
    if (nummer !== wiedergabe.nummer) return;
    leuchten((elemente.length + 1) * 0.8);
    sprechen(ANSAGEN[name][0]);
    await warten((elemente.length + 1) * 800);
  }
}

// Kleines Glockenspiel für Treffer und Stufenwechsel (kein Ton bei Daneben)
function glockenspiel() {
  const ctx = audio();
  if (!ctx) return;
  [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const start = ctx.currentTime + i * 0.12;
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(0.25, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, start + 0.6);
    osc.connect(gain).connect(ctx.destination);
    osc.start(start);
    osc.stop(start + 0.65);
  });
}

// ---------- Bildschirme & Navigation ----------

function zeigen(id, verlauf = true) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('active', s.id === id));
  // Android-Zurück-Taste soll zur Startseite führen, nicht die App schließen
  if (verlauf && id !== 'home') history.pushState({ screen: id }, '');
}

// Zurück-Taste: zum Bildschirm aus dem Verlauf (z. B. vom Kind zurück in den Elternbereich), sonst Startseite
window.addEventListener('popstate', () => {
  wiedergabeStoppen();
  SPIEL_STOPPEN.forEach((stoppen) => stoppen());
  studioAbbrechen();
  studioMikrofonZu();
  const ziel = (history.state && history.state.screen) || 'home';
  // Infoseite von der Begrüßung aus geöffnet: dorthin zurück
  if (ziel === 'home' && $('#info').classList.contains('active') && infoVonBegruessung) {
    infoVonBegruessung = false;
    zeigen('willkommen', false);
    return;
  }
  if (ziel === 'eltern') {
    elternZeichnen();
    zeigen('eltern', false);
    return;
  }
  if (ziel === 'mensch' && menschInArbeit) {
    menschZeichnen();
    zeigen('mensch', false);
    return;
  }
  spieleZeigen();
  zeigen('home', false);
});

function zurStartseite() {
  if (history.state && history.state.screen) history.back();
  else { spieleZeigen(); zeigen('home', false); }
}

// Spiel-Ende: großes Haus und kleineres Nochmal. Kein automatisches Weiterspielen – Kinder sollen ein natürliches Ende erleben.
function spielEnde(id, nochmal) {
  const screen = $(`#${id}`);
  if (pauseFaellig()) pauseBeginnen();
  if (pauseLaeuft()) { pauseBildZeigen(); return; }
  let ende = screen.querySelector('.spiel-ende');
  if (!ende) {
    ende = document.createElement('div');
    ende.className = 'spiel-ende';
    // „Nochmal“ zeigt das Bild des Spiels (wie seine Kachel) mit kleinem ↻ – 🔁 kennen Kinder meist nicht
    const kachel = $(`#home .spiel-btn[data-spiel="${id === 'hol' ? 'holmir' : id}"]`);
    ende.innerHTML = '<button class="ende-home" aria-label="Fertig">🏠</button>'
      + `<button class="ende-nochmal" aria-label="Nochmal"><span class="ende-bild">${kachel ? kachel.innerHTML : '🔁'}</span></button>`;
    ende.querySelector('.ende-home').addEventListener('click', zurStartseite);
    ende.querySelector('.ende-nochmal').addEventListener('click', () => { audio(); spielEndeWeg(id); ende.nochmal(); });
    screen.appendChild(ende);
  }
  ende.nochmal = nochmal;
  ende.hidden = false;
  screen.classList.add('am-ende');   // oben 🏠/🔊 ausblenden: sonst zwei Häuser auf dem Bild
}

function spielEndeWeg(id) {
  $(`#${id}`).classList.remove('ruhig', 'am-ende');
  const ende = $(`#${id}`).querySelector('.spiel-ende');
  if (ende) ende.hidden = true;
}

// ---------- Pause (gemeinsam mit Wortnest, je Gerät) ----------

// Nach X Minuten Spielzeit kommt am nächsten Spielende ein ruhiges Pausen-Bild – nie mitten im Spiel, kein Countdown.
// Danach zeigt jede der beiden Apps beim Öffnen eines Spiels eine halbe Stunde lang wieder das Pausen-Bild
// (wer von Formennest zu Wortnest wechselt, landet nicht im nächsten Spiel); Eltern können die Pause beenden.
// Gemeinsame Schlüssel (Wortnest nutzt dasselbe Format; Änderungen nur in beiden Apps zugleich):
//   nest:spielzeit = { ms: Spielzeit seit der letzten Pause, letzte: Zeitpunkt, tag: 'JJJJ-MM-TT', heute: ms an diesem Tag }
//   nest:pauseNach = Minuten (0 = aus) · nest:pauseAm = Zeitpunkt der letzten Pause (ms)
const PAUSE_NEUSTART = 30 * 60000;   // so lange nicht gespielt = Zählung beginnt neu
const PAUSE_DAUER = 30 * 60000;      // so lange gilt eine Pause (in beiden Apps)
const PAUSE_WAHL = [0, 10, 15, 20, 30];
const heuteTag = () => new Date().toLocaleDateString('sv');   // „2026-10-11“ in Ortszeit

function spielzeitLesen() {
  const s = speicher.lesen('nest:spielzeit', null) || {};
  const z = { ms: Number(s.ms) || 0, letzte: Number(s.letzte) || 0, tag: s.tag, heute: Number(s.heute) || 0 };
  if (z.letzte && Date.now() - z.letzte > PAUSE_NEUSTART) z.ms = 0;
  if (z.tag !== heuteTag()) { z.tag = heuteTag(); z.heute = 0; }
  return z;
}

// Nur sichtbare Spielzeit zählt (nicht im Elternbereich, nicht im Hintergrund)
function spielzeitZaehlen() {
  if (document.hidden || document.querySelector('.screen.eltern.active')) return;
  const z = spielzeitLesen();
  const jetzt = Date.now();
  const dazu = Math.max(0, Math.min(10000, z.letzte ? jetzt - z.letzte : 10000));
  z.ms += dazu;
  z.heute += dazu;
  z.letzte = jetzt;
  speicher.schreiben('nest:spielzeit', z);
}
setInterval(spielzeitZaehlen, 10000);

const pauseNach = () => Number(speicher.lesen('nest:pauseNach', 0)) || 0;
const pauseFaellig = () => pauseNach() > 0 && spielzeitLesen().ms >= pauseNach() * 60000;
const pauseLaeuft = () => {
  const seit = Date.now() - (Number(speicher.lesen('nest:pauseAm', 0)) || 0);
  return pauseNach() > 0 && seit >= 0 && seit < PAUSE_DAUER;
};

function pauseBeginnen() {
  speicher.schreiben('nest:pauseAm', Date.now());
  const z = spielzeitLesen();
  z.ms = 0;   // nach der Pause darf wieder gespielt werden
  speicher.schreiben('nest:spielzeit', z);
}

function pauseBildZeigen() {
  zeigen('pause', !(history.state && history.state.screen));
  ansage('pause');
}
$('#btn-pause-home').addEventListener('click', zurStartseite);

function pauseWahlZeichnen() {
  const box = $('#pause-wahl');
  const aktuell = pauseNach();
  box.innerHTML = '';
  PAUSE_WAHL.forEach((min) => {
    const btn = document.createElement('button');
    btn.className = `regal-spiel${min === aktuell ? ' gewaehlt' : ''}`;
    btn.textContent = min ? `nach ${min} Minuten` : 'aus';
    btn.setAttribute('aria-pressed', min === aktuell);
    btn.addEventListener('click', () => { speicher.schreiben('nest:pauseNach', min); pauseWahlZeichnen(); });
    box.appendChild(btn);
  });
  // Nur für Eltern, gerundet; beide Apps zählen in denselben Schlüssel
  const min = Math.round(spielzeitLesen().heute / 60000);
  $('#spielzeit-heute').textContent = `Heute gespielt: ${min < 1 ? 'noch keine Minute' : `ca. ${min} Min.`} `
    + '(Wortnest, Zahlennest und Formennest zusammen).';
  $('#btn-pause-aus').hidden = !pauseLaeuft();
}

$('#btn-pause-aus').addEventListener('click', () => {
  speicher.schreiben('nest:pauseAm', 0);
  pauseWahlZeichnen();
});

// ---------- Gemeinsame Bausteine der Spiele ----------

// Jedes Spiel hat einen Zustand mit nummer (jeder Neustart/Abbruch zählt hoch; alte Abläufe erkennen daran, dass sie
// überholt sind), gesperrt (Tipps zählen gerade nicht) und timer. Ansagen prüfen VOR dem Sprechen, ob das Spiel noch
// offen ist (z. B. 🏠 während einer kurzen Wartepause), und melden danach, ob es weitergehen darf.
function spielBausteine(id, z) {
  const aktuell = (nr) => nr === z.nummer && $(`#${id}`).classList.contains('active');
  return {
    aktuell,
    stoppen() { clearTimeout(z.timer); z.nummer++; z.gesperrt = true; },
    ansage: (nr, name) => (aktuell(nr)
      ? folgeAbspielen([{ url: ansageUrl(name) }], ANSAGEN[name][0]).then(() => aktuell(nr)) : Promise.resolve(false)),
    zaehlen: (nr, name, elemente, beiJedem) => (aktuell(nr)
      ? zaehlenMitLeuchten(name, elemente, beiJedem).then(() => aktuell(nr)) : Promise.resolve(false)),
  };
}

// ---------- Auftrag in der echten Welt (alle Spiele) ----------
// 👍 ist für Erwachsene: kurz gedrückt halten (DAUMEN_HALTEN ms, ein Ring füllt sich), ein kurzer Tipp löst nichts
// aus – Kinder tippen das „Toll!“-Zeichen sonst selbst und überspringen den Auftrag in der echten Welt.
// Programmatische Klicks (Tests) und Tastatur gehen weiter durch.
const DAUMEN_HALTEN = 900;
const daumenKlickErlaubt = (e, btn) => !e.isTrusted || e.detail === 0 || btn.dataset.gehalten === '1';
document.addEventListener('click', (e) => {
  const btn = e.target.closest && e.target.closest('.daumen-btn');
  if (!btn) return;
  if (!daumenKlickErlaubt(e, btn)) { e.stopImmediatePropagation(); e.preventDefault(); }
  delete btn.dataset.gehalten;
}, true);
// Halten über das Dokument (gilt auch für 👍, die erst später in die Seite kommen)
const daumenHalten = { btn: null, timer: null };
const daumenAb = () => {
  clearTimeout(daumenHalten.timer);
  if (daumenHalten.btn) daumenHalten.btn.classList.remove('haelt');
  daumenHalten.btn = null;
};
document.addEventListener('pointerdown', (e) => {
  const btn = e.target.closest && e.target.closest('.daumen-btn');
  if (!btn) return;
  daumenAb();
  daumenHalten.btn = btn;
  btn.classList.add('haelt');
  daumenHalten.timer = setTimeout(() => { daumenAb(); btn.dataset.gehalten = '1'; btn.click(); }, DAUMEN_HALTEN);
});
['pointerup', 'pointercancel'].forEach((art) => document.addEventListener(art, daumenAb));
document.addEventListener('pointerout', (e) => { if (daumenHalten.btn && e.target === daumenHalten.btn) daumenAb(); });
document.addEventListener('contextmenu', (e) => { if (e.target.closest && e.target.closest('.daumen-btn')) e.preventDefault(); });

// Ablauf (Team + User): 1. das Spiel macht es einmal vor; 2. „Jetzt in echt!“ – das Spielfeld leert sich, groß 👐,
// darüber nur eine kleine, flache Erinnerungskarte (nichts sieht greifbar aus; Tippen darauf lenkt einmal sanft um:
// „Mach es in echt, mit deinen Händen!“); 3. der Erwachsene tippt 👍 (klein, unten rechts), dann zeigt das Kind auf
// die echten Dinge, und die App zählt mit (die Karte leuchtet). Keine Zeitgrenze: nach einer Weile kommt der Auftrag
// einmal nochmal, dann wartet die App einfach. z.inEcht = in dieser Phase; z.echtSagen = Auftrag nochmal (🔊).
async function inEcht({ z, nr, aktuell, ansage, buehne, knopf, karteHtml, sagen, zeit, einleitung = true, karteKlasse = '' }) {
  z.inEcht = true;
  z.echtSagen = sagen;
  z.umgelenkt = false;
  buehne.closest('.screen').classList.add('ruhig');
  buehne.innerHTML = `<div class="in-echt"><div class="in-echt-karte ${karteKlasse}">${karteHtml}</div>`
    + '<div class="in-echt-haende" aria-hidden="true">👐</div></div>';
  const karte = buehne.querySelector('.in-echt-karte');
  buehne.querySelector('.in-echt').addEventListener('pointerdown', async () => {
    if (!aktuell(nr) || z.gesperrt || z.fertig || z.umgelenkt) return;
    z.umgelenkt = true;
    z.gesperrt = true;
    animieren(karte, 'wackelt');
    if ((await ansage(nr, 'echt-umlenken')) && !z.fertig) z.gesperrt = false;
  });
  if (einleitung && !(await ansage(nr, 'jetzt-in-echt'))) return;
  if (!(await sagen(nr))) return;   // „Jetzt in echt! … Leg drei Bausteine in einen Becher!“
  if (z.fertig) return;
  z.gesperrt = false;
  z.timer = setTimeout(() => {
    if (!aktuell(nr) || z.fertig) return;
    knopf.hidden = false;
    const nochmal = async () => {
      if (!aktuell(nr) || z.fertig) return;
      if (z.gesperrt) { z.timer = setTimeout(nochmal, 1000); return; }   // spricht gerade
      z.gesperrt = true;
      if ((await sagen(nr)) && !z.fertig) z.gesperrt = false;
    };
    z.timer = setTimeout(nochmal, zeit.auftragNochmal - zeit.daumen);
  }, zeit.daumen);
}

// Nach 👍 (auch während einer Ansage): fertig, Knopf weg; gibt die Karte zurück (zum Mitzählen)
function inEchtBestaetigt(z, knopf) {
  if (z.fertig || !z.inEcht) return null;
  z.fertig = true;
  z.gesperrt = true;
  clearTimeout(z.timer);
  knopf.hidden = true;
  return $(`#${knopf.closest('.screen').id} .in-echt-karte`);
}

// 🔊 in der Phase „in echt“: nur den Auftrag nochmal sagen (👍 bleibt, die Zeiten laufen weiter)
function inEchtNochmal(z) {
  if (z.fertig || z.gesperrt) return;
  const nr = z.nummer;
  z.gesperrt = true;
  z.echtSagen(nr).then((ok) => { if (ok && !z.fertig) z.gesperrt = false; });
}

// Kurze Bewegung neu starten (Klasse ab- und wieder anschalten)
function animieren(el, klasse) {
  el.classList.remove('huepft', 'wackelt', 'kommt', 'springt', klasse);
  void el.offsetWidth;
  el.classList.add(klasse);
}

// ---------- Passt rein (ab 3): Formen einsetzen – wie die erste Lade der Geometrischen Kommode ----------
// Oben ein Brett mit drei Mulden (Kreis, Quadrat, Dreieck), unten die Einsätze: gleiche Farbe, etwa gleiche Fläche
// (sonst sortiert das Kind nach Farbe oder Größe statt nach Form). Ein Einsatz rastet nur in seiner Mulde ein
// („klack“); in einer falschen wackelt er und bleibt daneben liegen – das Material kontrolliert selbst, kein „falsch“.
// Nach 2 Versuchen leuchtet die richtige Mulde, nach 3 gleitet der Einsatz von selbst hinein. Drei Runden: die Mulden
// liegen jedes Mal anders, in Runde 3 leicht gedreht (Quadrat nur wenig – auf der Spitze wäre es eine „Raute“).
// Zum Schluss in echt: „Such etwas Rundes bei dir zu Hause!“ – „Fahr mit dem Finger rundherum!“
const PASST_RUNDEN = 3;
const PASST_ZEIT = { hilfe: 12000, rundenPause: 900, vormachen: 2600, daumen: 6000, auftragNochmal: 16000 };
const PASST_FORMEN = ['kreis', 'quadrat', 'dreieck'];
// Drehung der Mulden in Runde 3 (Grad)
const PASST_DREHUNG = { kreis: 0, quadrat: 12, dreieck: 28 };
const pa = { runde: 0, mulden: [], teile: [], ziehen: null, gesperrt: true, timer: null, nummer: 0, fertig: false,
  inEcht: false, auftrag: false, mass: null, versuche: {} };
const paBausteine = spielBausteine('passt', pa);
const { aktuell: paAktuell, ansage: paAnsage } = paBausteine;
SPIEL_STOPPEN.push(() => passtStoppen());

function passtStoppen() {
  paBausteine.stoppen();
  pa.ziehen = null;
}

// Form als SVG-Inhalt (Bezug: Mittelpunkt 50/50, etwa gleiche Fläche ~4500)
function formInhalt(form, art) {
  const farbe = art === 'mulde' ? 'fill="#6e4a30" stroke="#4a3220" stroke-width="3"' : 'fill="#f3c56b" stroke="#7a5a2a" stroke-width="3"';
  if (form === 'kreis') return `<circle cx="50" cy="50" r="38" ${farbe}/>`;
  if (form === 'quadrat') return `<rect x="16.5" y="16.5" width="67" height="67" rx="3" ${farbe}/>`;
  return `<path d="M50 -8.9 L101 79.4 L-1 79.4 Z" ${farbe} stroke-linejoin="round" transform="translate(0 6)"/>`;
}
const formSvg = (form, art, drehung = 0) => `<svg viewBox="-12 -12 124 124" aria-hidden="true"><g transform="rotate(${drehung} 50 50)">${formInhalt(form, art)}</g></svg>`;

function paRundenZeichnen() {
  $('#passt-runden').innerHTML = `<span class="gruppe">${
    Array.from({ length: PASST_RUNDEN }, (_, i) => `<span class="${i < pa.runde ? 'voll' : ''}"></span>`).join('')}</span>`;
}

// Brett oben, Einsätze unten (gleicher Abstand); quer: Brett links, Einsätze rechts
function paMasse() {
  const feld = $('#passt-feld');
  const W = feld.clientWidth, H = feld.clientHeight;
  const quer = W > H;
  const S = quer ? Math.min(120, (W / 2 - 40) / 3.5, (H - 40) / 3.6) : Math.min(120, (W - 48) / 3.7, (H - 140) / 4.2);
  const abstand = S * 1.25;
  const brett = quer ? { x: 16, y: (H - S * 3.9) / 2, w: S * 1.6, h: S * 3.9 } : { x: 16, y: 16, w: W - 32, h: S * 1.6 };
  const muldeAn = (i) => (quer ? [brett.x + brett.w / 2, brett.y + brett.h / 2 + (i - 1) * abstand]
    : [W / 2 + (i - 1) * abstand, brett.y + brett.h / 2]);
  const teilAn = (i) => (quer ? [W * 0.72, H / 2 + (i - 1) * abstand]
    : [W / 2 + (i - 1) * abstand, brett.y + brett.h + (H - brett.y - brett.h - 96) / 2]);
  return { W, H, S, quer, brett, muldeAn, teilAn };
}

function paSetzen(t, x, y) {
  const { W, H, S } = pa.mass;
  t.x = Math.max(S / 2, Math.min(W - S / 2, x));
  t.y = Math.max(S / 2, Math.min(H - S / 2, y));
  t.el.style.transform = `translate(${t.x - S / 2}px, ${t.y - S / 2}px)`;
}

function paAnordnen() {
  const feld = $('#passt-feld');
  if (!feld.clientWidth || !pa.mulden.length) return;
  pa.mass = paMasse();
  const { S, brett, muldeAn, teilAn } = pa.mass;
  Object.assign(feld.querySelector('.brett').style, { left: `${brett.x}px`, top: `${brett.y}px`, width: `${brett.w}px`, height: `${brett.h}px` });
  pa.mulden.forEach((m, i) => {
    [m.x, m.y] = muldeAn(i);
    Object.assign(m.el.style, { left: `${m.x - S / 2}px`, top: `${m.y - S / 2}px`, width: `${S}px`, height: `${S}px` });
  });
  pa.teile.forEach((t, i) => {
    Object.assign(t.el.style, { width: `${S}px`, height: `${S}px` });
    if (t.drin) paSetzen(t, t.drin.x, t.drin.y); else paSetzen(t, ...teilAn(i));
  });
}

async function passtNeueRunde() {
  passtStoppen();
  const nr = pa.nummer;
  const feld = $('#passt-feld');
  feld.closest('.screen').classList.remove('ruhig');
  feld.innerHTML = '<div class="brett"></div>';
  const gedreht = pa.runde === PASST_RUNDEN - 1;
  // Mulden jedes Mal in neuer Reihenfolge, Einsätze in einer anderen (nie genau darunter)
  const muldenFolge = mischen(PASST_FORMEN);
  let teilFolge;
  do teilFolge = mischen(PASST_FORMEN); while (teilFolge.some((f, i) => f === muldenFolge[i]));
  pa.versuche = {};
  pa.mulden = muldenFolge.map((form) => {
    const el = document.createElement('div');
    el.className = 'mulde';
    el.dataset.form = form;
    const drehung = gedreht ? PASST_DREHUNG[form] : 0;
    el.innerHTML = formSvg(form, 'mulde', drehung);
    feld.appendChild(el);
    return { form, el, drehung, belegt: false, x: 0, y: 0 };
  });
  pa.teile = teilFolge.map((form) => {
    const el = document.createElement('div');
    el.className = 'einsatz';
    el.style.transition = 'none';
    el.innerHTML = `<span class="einsatz-bild">${formSvg(form, 'teil')}</span>`;
    feld.appendChild(el);
    const t = { form, el, drin: null, x: 0, y: 0 };
    el.teil = t;
    return t;
  });
  paAnordnen();
  void feld.offsetWidth;
  pa.teile.forEach((t) => { t.el.style.transition = ''; });
  pa.gesperrt = true;
  if (!(await paAnsage(nr, 'passt-start'))) return;
  pa.gesperrt = false;
  paHilfeAbwarten(nr);
}

// Lange nichts eingesetzt: Auftrag nochmal, ein loser Einsatz hüpft (kein Zeitdruck)
function paHilfeAbwarten(nr) {
  clearTimeout(pa.timer);
  pa.timer = setTimeout(async () => {
    if (!paAktuell(nr) || pa.gesperrt || pa.ziehen) { paHilfeAbwarten(nr); return; }
    pa.gesperrt = true;
    if (!(await paAnsage(nr, 'passt-hilfe'))) return;
    pa.gesperrt = false;
    const los = pa.teile.find((t) => !t.drin);
    if (los) animieren(los.el, 'huepft');
    paHilfeAbwarten(nr);
  }, PASST_ZEIT.hilfe);
}

$('#passt-feld').addEventListener('pointerdown', (e) => {
  const el = e.target.closest('.einsatz');
  if (!el || !el.teil || el.teil.drin) return;
  e.preventDefault();
  if (pa.ziehen || pa.gesperrt || pa.auftrag) return;
  audio();
  pa.ziehen = { t: el.teil, id: e.pointerId, sx: e.clientX, sy: e.clientY, bewegt: false, feld: $('#passt-feld').getBoundingClientRect(), nr: pa.nummer };
  el.classList.add('greift');
  try { el.setPointerCapture(e.pointerId); } catch { /* synthetische Ereignisse (Tests) */ }
});

document.addEventListener('pointermove', (e) => {
  const z = pa.ziehen;
  if (!z || e.pointerId !== z.id) return;
  if (Math.hypot(e.clientX - z.sx, e.clientY - z.sy) > 8) z.bewegt = true;
  // Der Einsatz sitzt ~30 px über dem Finger, damit das Kind ihn sieht
  if (z.bewegt) paSetzen(z.t, e.clientX - z.feld.left, e.clientY - z.feld.top - 30);
});

// Nicht auf dem Brett liegen lassen (dort sähe er aus wie eingesetzt): neben das Brett schieben
function paVomBrett(t) {
  const { brett, S, quer } = pa.mass;
  const aufBrett = t.x > brett.x - S / 2 && t.x < brett.x + brett.w + S / 2 && t.y > brett.y - S / 2 && t.y < brett.y + brett.h + S / 2;
  if (!aufBrett) return;
  if (quer) paSetzen(t, brett.x + brett.w + S * 0.7, t.y); else paSetzen(t, t.x, brett.y + brett.h + S * 0.7);
}

function paLoslassen(e) {
  const z = pa.ziehen;
  if (!z || e.pointerId !== z.id) return;
  pa.ziehen = null;
  z.t.el.classList.remove('greift');
  if (z.nr !== pa.nummer || !paAktuell(z.nr)) return;
  if (!z.bewegt) { animieren(z.t.el, 'huepft'); return; }
  const { S } = pa.mass;
  const naechste = pa.mulden.map((m) => ({ m, a: Math.hypot(m.x - z.t.x, m.y - z.t.y) })).sort((a, b) => a.a - b.a)[0];
  if (naechste.a > S * 0.6) { paVomBrett(z.t); return; }
  const m = naechste.m;
  if (m.form === z.t.form && !m.belegt) { paEinsetzen(z.t, m); return; }
  if (m.belegt) { paVomBrett(z.t); return; }
  paPasstNicht(z.nr, z.t);
}
document.addEventListener('pointerup', paLoslassen);
document.addEventListener('pointercancel', paLoslassen);

// Passt nicht: sanft wackeln, daneben liegen bleiben; 2. Mal: richtige Mulde leuchtet; 3. Mal: gleitet von selbst hinein
function paPasstNicht(nr, t) {
  paVomBrett(t);
  animieren(t.el, 'wackelt');
  const n = pa.versuche[t.form] = (pa.versuche[t.form] || 0) + 1;
  const richtig = pa.mulden.find((m) => m.form === t.form);
  if (n === 2) richtig.el.classList.add('hinweis');
  if (n >= 3) setTimeout(() => paAktuell(nr) && !t.drin && paEinsetzen(t, richtig), 450);
  paHilfeAbwarten(nr);
}

async function paEinsetzen(t, m) {
  const nr = pa.nummer;
  t.drin = m;
  m.belegt = true;
  m.el.classList.remove('hinweis');
  t.el.classList.add('drin');
  t.el.querySelector('.einsatz-bild').style.transform = `rotate(${m.drehung}deg)`;
  paSetzen(t, m.x, m.y);
  paKlack();
  try { if (navigator.vibrate) navigator.vibrate(30); } catch { /* egal */ }
  if (pa.teile.some((x) => !x.drin)) { paHilfeAbwarten(nr); return; }
  pa.gesperrt = true;
  clearTimeout(pa.timer);
  await warten(450);
  if (!paAktuell(nr)) return;
  glockenspiel();
  pa.teile.forEach((x) => x.el.classList.add('leuchtet'));
  if (!(await paAnsage(nr, 'passt-fertig'))) return;
  pa.runde++;
  paRundenZeichnen();
  await warten(PASST_ZEIT.rundenPause);
  if (!paAktuell(nr)) return;
  if (pa.runde < PASST_RUNDEN) passtNeueRunde(); else passtAuftrag();
}

// „Klack“: kurzer, dumpfer Ton beim Einrasten
function paKlack() {
  const c = audio();
  if (!c) return;
  const osc = c.createOscillator(), gain = c.createGain(), t = c.currentTime;
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(420, t);
  osc.frequency.exponentialRampToValueAtTime(160, t + 0.09);
  gain.gain.setValueAtTime(0.3, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
  osc.connect(gain).connect(c.destination);
  osc.start(t);
  osc.stop(t + 0.14);
}

// ----- Echte Welt: vormachen (ein Finger fährt um den Kreis), dann „Such etwas Rundes bei dir zu Hause!“ -----

async function passtAuftrag() {
  passtStoppen();
  const nr = pa.nummer;
  pa.auftrag = true;
  pa.fertig = false;
  $('#btn-passt-daumen').hidden = true;
  const feld = $('#passt-feld');
  feld.innerHTML = `<div class="passt-vormachen"><span class="rund-bild">${formSvg('kreis', 'teil')}</span><span class="rund-finger" aria-hidden="true">☝️</span></div>`;
  if (!(await paAnsage(nr, 'passt-welt-vor'))) return;
  await warten(PASST_ZEIT.vormachen);
  if (!paAktuell(nr)) return;
  inEcht({ z: pa, nr, aktuell: paAktuell, ansage: paAnsage, buehne: feld, knopf: $('#btn-passt-daumen'),
    karteHtml: `${formSvg('kreis', 'teil')}<span class="karte-bild">🔎</span>`, sagen: (nr2) => paAnsage(nr2, 'passt-welt'), zeit: PASST_ZEIT });
}

async function passtAuftragErledigt(nr) {
  const karte = inEchtBestaetigt(pa, $('#btn-passt-daumen'));
  if (!karte) return;
  if (!(await paAnsage(nr, 'passt-welt-zeig'))) return;
  await warten(PASST_ZEIT.vormachen);
  if (!paAktuell(nr)) return;
  glockenspiel();
  if (!(await paAnsage(nr, 'passt-welt-fertig'))) return;
  spielEnde('passt', passtNeu);
}

$('#btn-passt-daumen').addEventListener('click', () => { audio(); if (pa.inEcht) passtAuftragErledigt(pa.nummer); });

function passtNeu() {
  passtStoppen();
  Object.assign(pa, { runde: 0, fertig: false, inEcht: false, auftrag: false });
  $('#btn-passt-daumen').hidden = true;
  paRundenZeichnen();
  passtNeueRunde();
}

function passtStarten() {
  spielEndeWeg('passt');
  zeigen('passt');
  passtNeu();
}
SPIELE.passt = passtStarten;
$('#home .spiel-btn[data-spiel="passt"]').innerHTML = '<svg class="kachel-bild" viewBox="0 0 100 100" aria-hidden="true">'
  + '<rect x="4" y="30" width="92" height="40" rx="8" fill="#e9d2b0" stroke="#b98a5a" stroke-width="3"/>'
  + '<circle cx="24" cy="50" r="12" fill="#6e4a30"/><rect x="40" y="38" width="22" height="22" rx="2" fill="#f3c56b" stroke="#7a5a2a" stroke-width="2"/>'
  + '<path d="M80 36 L92 60 L68 60 Z" fill="#6e4a30"/></svg>';

$('#btn-passt-home').addEventListener('click', () => { passtStoppen(); wiedergabeStoppen(); zurStartseite(); });
$('#btn-passt-laut').addEventListener('click', () => {
  const ende = $('#passt .spiel-ende');
  if ((ende && !ende.hidden) || pa.fertig || pa.gesperrt || pa.ziehen) return;
  audio();
  if (pa.inEcht) { inEchtNochmal(pa); return; }
  pa.gesperrt = true;
  paAnsage(pa.nummer, 'passt-start').then((ok) => { if (ok) { pa.gesperrt = false; paHilfeAbwarten(pa.nummer); } });
});
window.addEventListener('resize', () => { if ($('#passt').classList.contains('active') && !pa.auftrag) paAnordnen(); });

// ---------- Wo ist die Maus? (ab 3): die Lagewörter „auf“, „in“, „unter“ – Drei-Stufen-Lektion ----------
// Eine Kiste auf Beinen (sonst gäbe es kein „unter“) mit halb offenem Deckel: auf dem Deckel sitzt die Maus „auf der
// Kiste“, in der Öffnung schaut nur ihr Kopf heraus („in der Kiste“), zwischen den Beinen ist „unter der Kiste“.
// 👀 Die Maus huscht hin: „Die Maus ist auf der Kiste.“ · 👂 „Setz die Maus in die Kiste!“ (schieben) ·
// 🗣️ „Wo ist die Maus? Sag es!“ (ohne Prüfung). Kein „falsch“: woanders hingesetzt sagt die App, wo sie jetzt ist
// („Jetzt ist sie unter der Kiste.“), beim zweiten Mal leuchtet der Platz, beim dritten läuft die Maus selbst hin.
// Zum Schluss in echt: „Setz dein Kuscheltier unter den Tisch!“ (oder „auf einen Stuhl“).
const MAUS_LAGEN = ['auf', 'in', 'unter'];
const MAUS_STUFEN = [3, 3, 3];
const MAUS_SYMBOL = ['👀', '👂', '🗣️'];
const MAUS_ZEIT = { weiterOhneTipp: 7000, nochmalFragen: 9000, antwort: 5000, pause: 900, daumen: 6000, auftragNochmal: 16000 };
const ms = { stufe: 0, schritt: 0, punkte: 0, folge: [], ziel: null, lage: 'start', versuche: 0, ziehen: null,
  gesperrt: true, timer: null, nummer: 0, fertig: false, inEcht: false, auftrag: false, mass: null, welt: 'unter' };
const msBausteine = spielBausteine('maus', ms);
const { aktuell: msAktuell, ansage: msAnsage } = msBausteine;
SPIEL_STOPPEN.push(() => mausStoppen());

function mausStoppen() {
  msBausteine.stoppen();
  ms.ziehen = null;
}

function msRundenZeichnen() {
  let n = 0;
  $('#maus-runden').innerHTML = MAUS_STUFEN.map((anzahl) => `<span class="gruppe">${
    Array.from({ length: anzahl }, () => `<span class="${n++ < ms.punkte ? 'voll' : ''}"></span>`).join('')}</span>`).join('');
}

// Kiste in der Mitte; Plätze der Maus in Feld-Pixeln
function msMasse() {
  const feld = $('#maus-feld');
  const W = feld.clientWidth, H = feld.clientHeight;
  const B = Math.min(W * 0.56, H * 0.42, 340);   // Breite der Kiste
  const kH = B * 0.5, beinH = B * 0.36, M = B * 0.34;
  const x0 = W / 2 - B / 2, y0 = Math.max(M * 1.1, (H - kH - beinH) / 2 - M * 0.2);
  const boden = y0 + kH + beinH;
  const plaetze = {
    auf: [x0 + B * 0.74, y0 - M * 0.42],
    in: [x0 + B * 0.27, y0 + M * 0.12],
    unter: [W / 2, boden - M * 0.5],
    start: [Math.max(M * 0.6, x0 - M * 0.9), boden - M * 0.5],
  };
  return { W, H, B, kH, beinH, M, x0, y0, boden, plaetze };
}

function msMausSetzen(x, y) {
  const { M } = ms.mass;
  ms.maus.style.transform = `translate(${x - M / 2}px, ${y - M / 2}px)`;
  ms.maus.dataset.x = x;
  ms.maus.dataset.y = y;
}

// Maus an ihren Platz; „in“ liegt hinter der Vorderwand (nur der Kopf schaut heraus)
function msMausAufPlatz() {
  ms.maus.classList.toggle('drin', ms.lage === 'in');
  msMausSetzen(...ms.mass.plaetze[ms.lage]);
}

function msAnordnen() {
  const feld = $('#maus-feld');
  if (!feld.clientWidth || !ms.maus) return;
  ms.mass = msMasse();
  const { B, kH, beinH, M, x0, y0 } = ms.mass;
  const kiste = feld.querySelector('.kiste-vorn'), hinten = feld.querySelector('.kiste-hinten');
  [kiste, hinten].forEach((el) => Object.assign(el.style, { left: `${x0}px`, top: `${y0 - B * 0.06}px`, width: `${B}px`, height: `${kH + beinH + B * 0.06}px` }));
  Object.assign(ms.maus.style, { width: `${M}px`, height: `${M}px`, fontSize: `${M * 0.82}px` });
  feld.querySelectorAll('.platz').forEach((el) => {
    const [x, y] = ms.mass.plaetze[el.dataset.lage];
    Object.assign(el.style, { left: `${x - M * 0.7}px`, top: `${y - M * 0.7}px`, width: `${M * 1.4}px`, height: `${M * 1.4}px` });
  });
  msMausAufPlatz();
}

// Kiste in zwei Ebenen: hinten das dunkle Innere, vorn Vorderwand, Deckel (rechte Hälfte) und Beine
function msFeldAufbauen() {
  const feld = $('#maus-feld');
  feld.closest('.screen').classList.remove('ruhig');
  const v = '0 0 100 92';   // Kiste 100 breit; oben 6 Rand, Kasten 50 hoch, Beine 36
  feld.innerHTML = `<svg class="kiste-hinten" viewBox="${v}" preserveAspectRatio="none" aria-hidden="true">`
    + '<rect x="2" y="6" width="96" height="10" fill="#5a3a22"/></svg>'
    + MAUS_LAGEN.map((l) => `<div class="platz" data-lage="${l}"></div>`).join('')
    + '<div class="maus" aria-hidden="true"><span class="figur-bild">🐭</span></div>'
    + `<svg class="kiste-vorn" viewBox="${v}" preserveAspectRatio="none" aria-hidden="true">`
    + '<rect x="2" y="14" width="96" height="42" rx="3" fill="#c98f4e" stroke="#4a3f35" stroke-width="2.5"/>'
    + '<path d="M8 28 H92 M8 42 H92" stroke="#a8743a" stroke-width="2"/>'
    + '<rect x="50" y="6" width="50" height="9" rx="2" fill="#d9a466" stroke="#4a3f35" stroke-width="2.5"/>'
    + '<rect x="8" y="56" width="9" height="36" rx="2" fill="#a8743a" stroke="#4a3f35" stroke-width="2.5"/>'
    + '<rect x="83" y="56" width="9" height="36" rx="2" fill="#a8743a" stroke="#4a3f35" stroke-width="2.5"/></svg>';
  ms.maus = feld.querySelector('.maus');
  ms.maus.style.transition = 'none';
  msAnordnen();
  void feld.offsetWidth;
  ms.maus.style.transition = '';
}

const msPlatzEl = (lage) => $(`#maus-feld .platz[data-lage="${lage}"]`);

// Maus huscht an einen Platz
function msHuschen(lage) {
  ms.lage = lage;
  msMausAufPlatz();
  animieren(ms.maus, 'huepft');
}

// Kleines Quieken (zwei kurze hohe Töne), wenn die Maus richtig sitzt
function msQuiek() {
  const c = audio();
  if (!c) return;
  [0, 0.12].forEach((v) => {
    const osc = c.createOscillator(), gain = c.createGain(), t = c.currentTime + v;
    osc.frequency.setValueAtTime(1800, t);
    osc.frequency.exponentialRampToValueAtTime(2600, t + 0.07);
    gain.gain.setValueAtTime(0.08, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
    osc.connect(gain).connect(c.destination);
    osc.start(t);
    osc.stop(t + 0.1);
  });
}

// Stufe 1: die Maus huscht hin, „Die Maus ist auf der Kiste.“ – Tippen auf die Maus: nochmal hören
async function msStufe1() {
  mausStoppen();
  const nr = ms.nummer;
  const lage = ms.folge[ms.schritt];
  msHuschen(lage);
  await warten(400);
  if (!(await msAnsage(nr, `maus-ist-${lage}`))) return;
  ms.gesperrt = false;
  ms.timer = setTimeout(() => msAktuell(nr) && !ms.gesperrt && msWeiter(nr), MAUS_ZEIT.weiterOhneTipp);
}

// Stufe 2: Maus sitzt neben der Kiste, „Setz die Maus in die Kiste!“ – das Kind schiebt
async function msStufe2() {
  mausStoppen();
  const nr = ms.nummer;
  ms.ziel = ms.folge[ms.schritt];
  ms.versuche = 0;
  document.querySelectorAll('#maus-feld .platz').forEach((p) => p.classList.remove('hinweis'));
  ms.lage = 'start';
  msMausAufPlatz();
  await warten(300);
  if (!msAktuell(nr)) return;
  msFragen(nr);
}

async function msFragen(nr) {
  if (!msAktuell(nr)) return;
  ms.gesperrt = true;
  if (!(await msAnsage(nr, `maus-setz-${ms.ziel}`))) return;
  ms.gesperrt = false;
  clearTimeout(ms.timer);
  ms.timer = setTimeout(() => { if (msAktuell(nr) && !ms.gesperrt && !ms.ziehen) { msPlatzEl(ms.ziel).classList.add('hinweis'); msFragen(nr); } }, MAUS_ZEIT.nochmalFragen);
}

// Stufe 3: Maus sitzt, „Wo ist die Maus? Sag es!“ – nach einer Weile sagt die App es selbst (keine Prüfung)
async function msStufe3() {
  mausStoppen();
  const nr = ms.nummer;
  const lage = ms.folge[ms.schritt];
  msHuschen(lage);
  await warten(400);
  if (!(await msAnsage(nr, 'maus-sag-es'))) return;
  ms.gesperrt = false;
  ms.timer = setTimeout(() => msAktuell(nr) && !ms.gesperrt && msAntwort(nr), MAUS_ZEIT.antwort);
}

async function msAntwort(nr) {
  ms.gesperrt = true;
  clearTimeout(ms.timer);
  animieren(ms.maus, 'huepft');
  if (!(await msAnsage(nr, `maus-ist-${ms.lage}`))) return;
  await warten(MAUS_ZEIT.pause);
  msWeiter(nr);
}

// Tippen auf die Maus (Stufe 1 und 3): sie sagt, wo sie ist
$('#maus-feld').addEventListener('click', (e) => {
  if (!e.target.closest('.maus') || ms.gesperrt || ms.stufe === 1 || ms.stufe > 2) return;
  audio();
  msAntwort(ms.nummer);
});

$('#maus-feld').addEventListener('pointerdown', (e) => {
  if (!e.target.closest('.maus') || ms.stufe !== 1) return;
  e.preventDefault();
  if (ms.ziehen || ms.gesperrt) return;
  audio();
  ms.ziehen = { id: e.pointerId, sx: e.clientX, sy: e.clientY, bewegt: false, feld: $('#maus-feld').getBoundingClientRect(), nr: ms.nummer };
  ms.maus.classList.add('greift');
  ms.maus.classList.remove('drin');
  try { ms.maus.setPointerCapture(e.pointerId); } catch { /* synthetische Ereignisse (Tests) */ }
});

document.addEventListener('pointermove', (e) => {
  const z = ms.ziehen;
  if (!z || e.pointerId !== z.id) return;
  if (Math.hypot(e.clientX - z.sx, e.clientY - z.sy) > 8) z.bewegt = true;
  if (z.bewegt) msMausSetzen(e.clientX - z.feld.left, e.clientY - z.feld.top - 30);
});

function msLoslassen(e) {
  const z = ms.ziehen;
  if (!z || e.pointerId !== z.id) return;
  ms.ziehen = null;
  ms.maus.classList.remove('greift');
  if (z.nr !== ms.nummer || !msAktuell(z.nr)) return;
  if (!z.bewegt) { msMausAufPlatz(); animieren(ms.maus, 'huepft'); return; }
  const x = Number(ms.maus.dataset.x), y = Number(ms.maus.dataset.y);
  const naechste = MAUS_LAGEN.map((l) => ({ l, a: Math.hypot(ms.mass.plaetze[l][0] - x, ms.mass.plaetze[l][1] - y) })).sort((a, b) => a.a - b.a)[0];
  // Weit weg von allen Plätzen: zurück neben die Kiste
  if (naechste.a > ms.mass.M * 1.25) { ms.lage = 'start'; msMausAufPlatz(); return; }
  ms.lage = naechste.l;
  msMausAufPlatz();
  msGesetzt(z.nr);
}
document.addEventListener('pointerup', msLoslassen);
document.addEventListener('pointercancel', msLoslassen);

async function msGesetzt(nr) {
  clearTimeout(ms.timer);
  ms.gesperrt = true;
  if (ms.lage === ms.ziel) {
    msPlatzEl(ms.ziel).classList.remove('hinweis');
    msQuiek();
    glockenspiel();
    animieren(ms.maus, 'huepft');
    await warten(400);
    if (!(await msAnsage(nr, `maus-ist-${ms.lage}`))) return;
    await warten(MAUS_ZEIT.pause);
    msWeiter(nr);
    return;
  }
  ms.versuche++;
  // Woanders hingesetzt: sagen, wo sie jetzt ist (benennen statt bewerten), dann die Bitte nochmal
  if (!(await msAnsage(nr, `maus-jetzt-${ms.lage}`))) return;
  if (ms.versuche === 2) msPlatzEl(ms.ziel).classList.add('hinweis');
  if (ms.versuche >= 3) {
    await warten(300);
    if (!msAktuell(nr)) return;
    msHuschen(ms.ziel);
    msPlatzEl(ms.ziel).classList.remove('hinweis');
    if (!(await msAnsage(nr, `maus-ist-${ms.ziel}`))) return;
    await warten(MAUS_ZEIT.pause);
    msWeiter(nr);
    return;
  }
  await warten(300);
  msFragen(nr);
}

function msWeiter(nr) {
  if (!msAktuell(nr)) return;
  ms.punkte++;
  ms.schritt++;
  msRundenZeichnen();
  if (ms.schritt < MAUS_STUFEN[ms.stufe]) { msSchritt(); return; }
  msNaechsteStufe();
}

function msSchritt() {
  $('#maus-symbol').textContent = MAUS_SYMBOL[ms.stufe] || '';
  [msStufe1, msStufe2, msStufe3, mausAuftrag][ms.stufe]();
}

async function msNaechsteStufe() {
  mausStoppen();
  const nr = ms.nummer;
  glockenspiel();
  ms.stufe++;
  ms.schritt = 0;
  ms.folge = mischen(MAUS_LAGEN);
  await warten(700);
  if (!msAktuell(nr)) return;
  msSchritt();
  animieren($('#maus-symbol'), 'huepft');
}

// ----- Echte Welt: „Setz dein Kuscheltier unter den Tisch!“ – nach 👍 „Dein Kuscheltier ist unter dem Tisch!“ -----

function mausAuftrag() {
  mausStoppen();
  const nr = ms.nummer;
  ms.auftrag = true;
  ms.fertig = false;
  $('#btn-maus-daumen').hidden = true;
  ms.welt = zufall(['unter', 'auf']);
  const bild = ms.welt === 'unter' ? '<span class="karte-bild">🧸</span><span class="karte-bild">⬇️</span>' : '<span class="karte-bild">🧸</span><span class="karte-bild">⬆️</span>';
  inEcht({ z: ms, nr, aktuell: msAktuell, ansage: msAnsage, buehne: $('#maus-feld'), knopf: $('#btn-maus-daumen'),
    karteHtml: bild, sagen: (nr2) => msAnsage(nr2, `maus-welt-${ms.welt}`), zeit: MAUS_ZEIT });
}

async function mausAuftragErledigt(nr) {
  const karte = inEchtBestaetigt(ms, $('#btn-maus-daumen'));
  if (!karte) return;
  animieren(karte, 'huepft');
  glockenspiel();
  await warten(400);
  if (!(await msAnsage(nr, `maus-welt-fertig-${ms.welt}`))) return;
  spielEnde('maus', mausNeu);
}

$('#btn-maus-daumen').addEventListener('click', () => { audio(); if (ms.inEcht) mausAuftragErledigt(ms.nummer); });

function mausNeu() {
  mausStoppen();
  Object.assign(ms, { stufe: 0, schritt: 0, punkte: 0, folge: [...MAUS_LAGEN], lage: 'start', fertig: false, inEcht: false, auftrag: false });
  $('#btn-maus-daumen').hidden = true;
  msFeldAufbauen();
  msRundenZeichnen();
  msSchritt();
}

function mausStarten() {
  spielEndeWeg('maus');
  zeigen('maus');
  mausNeu();
}
SPIELE.maus = mausStarten;
$('#home .spiel-btn[data-spiel="maus"]').innerHTML = '<span class="kachel-maus"><span class="k-maus">🐭</span>'
  + '<svg viewBox="0 0 100 60" aria-hidden="true"><rect x="2" y="2" width="96" height="34" rx="3" fill="#c98f4e" stroke="#4a3f35" stroke-width="3"/>'
  + '<rect x="8" y="36" width="9" height="22" fill="#a8743a" stroke="#4a3f35" stroke-width="2.5"/><rect x="83" y="36" width="9" height="22" fill="#a8743a" stroke="#4a3f35" stroke-width="2.5"/></svg></span>';

$('#btn-maus-home').addEventListener('click', () => { mausStoppen(); wiedergabeStoppen(); zurStartseite(); });
$('#btn-maus-laut').addEventListener('click', () => {
  const ende = $('#maus .spiel-ende');
  if ((ende && !ende.hidden) || ms.fertig || ms.gesperrt || ms.ziehen) return;
  audio();
  if (ms.inEcht) { inEchtNochmal(ms); return; }
  if (ms.stufe === 1) { clearTimeout(ms.timer); ms.nummer++; msFragen(ms.nummer); return; }
  msSchritt();
});
window.addEventListener('resize', () => { if ($('#maus').classList.contains('active') && !ms.auftrag && ms.maus) msAnordnen(); });

// ---------- Zeig mir den Kreis (ab 3½): Formen benennen – Drei-Stufen-Lektion, dann „Auch das ist ein Dreieck“ ----------
// 👀 „Das ist ein Dreieck.“ · 👂 „Wo ist das Dreieck?“ (erst zwei Karten, nach zwei sicheren Treffern drei) ·
// 🗣️ „Was ist das? Sag es!“ (ohne Prüfung) · 🔍 Auch das: spitze, flache, gedrehte Dreiecke, kleine/große Kreise …
// (sonst gilt nur das gerade, gleichseitige Dreieck als „echtes“). Das Quadrat steht nie auf der Spitze („Raute“).
// Kein „falsch“: 1. Daneben = benennen, was getippt wurde; 2. = die Ecken der gesuchten Form leuchten und werden
// gezählt („Eins, zwei, drei Ecken. Ein Dreieck!“; Kreis: „keine Ecken, er ist rund“); 3. = Lösung zeigen und weiter.
// Zum Schluss in echt: „Such ein Dreieck bei dir zu Hause!“
const FORMEN_STUFEN = [3, 4, 3, 3];
const FORMEN_SYMBOL = ['👀', '👂', '🗣️', '🔍'];
const FORMEN_ZEIT = { weiterOhneTipp: 7000, nochmalFragen: 8000, antwort: 5000, auchWeiter: 2200, pause: 900, daumen: 6000, auftragNochmal: 16000 };
const FORMEN_FARBE = '#5b4636';
// Formen in Ecken-Koordinaten (Kreis ohne Ecken); Bezug 100×100, gleiche Fläche wie bei „Passt rein“
const FORMEN_GRUND = {
  kreis: { kreis: [50, 50, 38] },
  quadrat: { ecken: [[16.5, 16.5], [83.5, 16.5], [83.5, 83.5], [16.5, 83.5]] },
  dreieck: { ecken: [[50, -2.9], [101, 85.4], [-1, 85.4]] },
};
// „Auch das“: Abwandlungen (Größe, Drehung, Gestalt) – Quadrat höchstens leicht gekippt
const FORMEN_AUCH = {
  kreis: [{ kreis: [50, 50, 22] }, { kreis: [50, 50, 46] }, { kreis: [50, 50, 32] }],
  quadrat: [{ ecken: [[30, 30], [70, 30], [70, 70], [30, 70]] }, { ecken: [[6, 6], [94, 6], [94, 94], [6, 94]], drehung: 0 },
    { ecken: [[18, 18], [82, 18], [82, 82], [18, 82]], drehung: 12 }],
  dreieck: [{ ecken: [[50, 0], [78, 96], [22, 96]] }, { ecken: [[50, 40], [104, 86], [-4, 86]] },
    { ecken: [[8, 8], [92, 92], [8, 92]] }, { ecken: [[50, 0], [100, 86], [0, 86]], drehung: 35 }],
};
const fo = { stufe: 0, schritt: 0, punkte: 0, auftraege: [], ziel: null, versuche: 0, unsicher: new Set(), serie: 0,
  drei: false, auch: null, gesperrt: true, timer: null, nummer: 0, letzterTipp: -Infinity, fertig: false, welt: null };
const foBausteine = spielBausteine('formen', fo);
const { aktuell: foAktuell, ansage: foAnsage, zaehlen: foZaehlen } = foBausteine;
SPIEL_STOPPEN.push(() => formenStoppen());

function formenStoppen() {
  foBausteine.stoppen();
}

function formBildSvg(d, farbe = FORMEN_FARBE) {
  const dreh = d.drehung ? ` transform="rotate(${d.drehung} 50 50)"` : '';
  if (d.kreis) {
    const [cx, cy, r] = d.kreis;
    return `<svg viewBox="-12 -12 124 124" aria-hidden="true"><circle cx="${cx}" cy="${cy}" r="${r}" fill="${farbe}"/></svg>`;
  }
  const punkte = d.ecken.map(([x, y]) => `${x},${y}`).join(' ');
  return `<svg viewBox="-12 -12 124 124" aria-hidden="true"><g${dreh}><polygon points="${punkte}" fill="${farbe}" stroke="${farbe}" stroke-width="4" stroke-linejoin="round"/>`
    + d.ecken.map(([x, y]) => `<circle class="ecke" cx="${x}" cy="${y}" r="9"/>`).join('') + '</g></svg>';
}

function foRundenZeichnen() {
  let n = 0;
  $('#formen-runden').innerHTML = FORMEN_STUFEN.map((anzahl) => `<span class="gruppe">${
    Array.from({ length: anzahl }, () => `<span class="${n++ < fo.punkte ? 'voll' : ''}"></span>`).join('')}</span>`).join('');
}

function foKarte(form, d = FORMEN_GRUND[form]) {
  const btn = document.createElement('button');
  btn.className = 'mengen-karte form-karte kommt';
  btn.dataset.form = form;
  btn.innerHTML = formBildSvg(d);
  btn.setAttribute('aria-label', form);
  btn.addEventListener('click', () => foGetippt(form, btn));
  return btn;
}

function foKarten(karten, art) {
  const box = $('#formen-karten');
  box.className = `mengen-karten ${art}`;
  box.replaceChildren(...karten);
  return karten;
}

const foZielKarte = () => $(`#formen-karten .form-karte[data-form="${fo.ziel}"]`);
const foNamen = (form) => `formen-ist-${form}`;

function foAuftraege() {
  for (;;) {
    const folge = mischen([...PASST_FORMEN, zufall(PASST_FORMEN)]);
    if (folge.every((f, i) => f !== folge[i - 1])) return folge;
  }
}

async function foStufe1() {
  formenStoppen();
  const nr = fo.nummer;
  const form = PASST_FORMEN[fo.schritt];
  const [karte] = foKarten([foKarte(form)], 'einzeln');
  if (!(await foAnsage(nr, foNamen(form)))) return;
  fo.gesperrt = false;
  karte.classList.add('pulsiert');
  fo.timer = setTimeout(() => foAktuell(nr) && !fo.gesperrt && foWeiter(nr), FORMEN_ZEIT.weiterOhneTipp);
}

async function foStufe2() {
  formenStoppen();
  const nr = fo.nummer;
  fo.ziel = fo.auftraege[fo.schritt];
  fo.versuche = 0;
  const andere = mischen(PASST_FORMEN.filter((f) => f !== fo.ziel)).slice(0, fo.drei ? 2 : 1);
  foKarten(mischen([fo.ziel, ...andere]).map((f) => foKarte(f)), fo.drei ? 'drei' : 'zwei');
  await warten(400);
  if (!foAktuell(nr)) return;
  foFragen(nr);
}

async function foFragen(nr) {
  if (!foAktuell(nr)) return;
  fo.gesperrt = true;
  if (!(await foAnsage(nr, `formen-wo-${fo.ziel}`))) return;
  fo.gesperrt = false;
  clearTimeout(fo.timer);
  fo.timer = setTimeout(async () => {
    if (!foAktuell(nr) || fo.gesperrt) return;
    fo.gesperrt = true;
    if (!(await foAnsage(nr, `formen-wo-${fo.ziel}`))) return;
    fo.gesperrt = false;
    fo.timer = setTimeout(() => foAktuell(nr) && foZielKarte() && foZielKarte().classList.add('pulsiert'), FORMEN_ZEIT.nochmalFragen);
  }, FORMEN_ZEIT.nochmalFragen);
}

async function foStufe3() {
  formenStoppen();
  const nr = fo.nummer;
  const form = fo.auftraege[fo.schritt];
  const [karte] = foKarten([foKarte(form)], 'einzeln');
  if (fo.unsicher.has(form)) {
    if (!(await foAnsage(nr, foNamen(form)))) return;
    fo.gesperrt = false;
    fo.timer = setTimeout(() => foAktuell(nr) && !fo.gesperrt && foWeiter(nr), FORMEN_ZEIT.pause * 2);
    return;
  }
  if (!(await foAnsage(nr, 'formen-sag-es'))) return;
  fo.gesperrt = false;
  fo.timer = setTimeout(() => foAktuell(nr) && !fo.gesperrt && foAntwort(nr, form, karte), FORMEN_ZEIT.antwort);
}

// „Auch das ist ein Dreieck.“ – eine Form in Abwandlungen, nacheinander (nur schauen und hören)
async function foStufe4() {
  formenStoppen();
  const nr = fo.nummer;
  const d = FORMEN_AUCH[fo.auch][fo.schritt % FORMEN_AUCH[fo.auch].length];
  foKarten([foKarte(fo.auch, d)], 'einzeln');
  if (!(await foAnsage(nr, `formen-auch-${fo.auch}`))) return;
  fo.gesperrt = false;
  fo.timer = setTimeout(() => foAktuell(nr) && !fo.gesperrt && foWeiter(nr), FORMEN_ZEIT.auchWeiter);
}

async function foAntwort(nr, form, karte) {
  fo.gesperrt = true;
  clearTimeout(fo.timer);
  karte.classList.remove('pulsiert');
  animieren(karte, 'huepft');
  if (!(await foAnsage(nr, foNamen(form)))) return;
  await warten(FORMEN_ZEIT.pause);
  foWeiter(nr);
}

// Hilfe: die Ecken der gesuchten Form leuchten und werden gezählt (Kreis: „keine Ecken, er ist rund“)
async function foEckenZeigen(nr, karte, form) {
  const ecken = [...karte.querySelectorAll('.ecke')];
  if (!ecken.length) { animieren(karte, 'huepft'); return foAnsage(nr, 'formen-ecken-kreis'); }
  const ok = await foZaehlen(nr, `formen-ecken-${form}`, ecken);
  ecken.forEach((e) => e.classList.remove('leuchtet'));
  return ok;
}

async function foGetippt(form, btn) {
  const jetzt = performance.now();
  if (fo.gesperrt || fo.stufe >= 4 || jetzt - fo.letzterTipp < 400) return;
  fo.letzterTipp = jetzt;
  audio();
  clearTimeout(fo.timer);
  const nr = fo.nummer;
  fo.gesperrt = true;
  btn.classList.remove('pulsiert');
  if (fo.stufe !== 1) { foAntwort(nr, form, btn); return; }
  if (form === fo.ziel) {
    btn.classList.add('richtig');
    animieren(btn, 'huepft');
    glockenspiel();
    if (fo.versuche === 0 && ++fo.serie >= 2) fo.drei = true;
    await warten(400);
    if (!(await foAnsage(nr, foNamen(form)))) return;
    await warten(FORMEN_ZEIT.pause);
    foWeiter(nr);
    return;
  }
  fo.versuche++;
  fo.serie = 0;
  fo.drei = false;
  fo.unsicher.add(fo.ziel);
  const ziel = foZielKarte();
  if (fo.versuche === 1) {
    animieren(btn, 'wackelt');
    if (!(await foAnsage(nr, foNamen(form)))) return;
    await warten(400);
    foFragen(nr);
  } else if (fo.versuche === 2) {
    document.querySelectorAll('#formen-karten .form-karte').forEach((k) => k.classList.toggle('blass', k !== ziel));
    animieren(btn, 'wackelt');
    if (!(await foEckenZeigen(nr, ziel, fo.ziel))) return;
    document.querySelectorAll('#formen-karten .form-karte').forEach((k) => k.classList.remove('blass'));
    await warten(400);
    foFragen(nr);
  } else {
    ziel.classList.add('richtig');
    animieren(ziel, 'huepft');
    if (!(await foAnsage(nr, foNamen(fo.ziel)))) return;
    await warten(FORMEN_ZEIT.pause);
    foWeiter(nr);
  }
}

function foWeiter(nr) {
  if (!foAktuell(nr)) return;
  fo.punkte++;
  fo.schritt++;
  foRundenZeichnen();
  if (fo.schritt < FORMEN_STUFEN[fo.stufe]) { foSchritt(); return; }
  foNaechsteStufe();
}

function foSchritt() {
  $('#formen-symbol').textContent = FORMEN_SYMBOL[fo.stufe] || '';
  [foStufe1, foStufe2, foStufe3, foStufe4, formenAuftrag][fo.stufe]();
}

async function foNaechsteStufe() {
  formenStoppen();
  const nr = fo.nummer;
  glockenspiel();
  fo.stufe++;
  fo.schritt = 0;
  if (fo.stufe === 1) fo.auftraege = foAuftraege();
  if (fo.stufe === 2) fo.auftraege = mischen(PASST_FORMEN);
  if (fo.stufe === 3) fo.auch = zufall(['dreieck', 'dreieck', 'quadrat', 'kreis']);
  await warten(700);
  if (!foAktuell(nr)) return;
  foSchritt();
  animieren($('#formen-symbol'), 'huepft');
}

// ----- Echte Welt: „Such ein Dreieck bei dir zu Hause!“ -----

function formenAuftrag() {
  formenStoppen();
  const nr = fo.nummer;
  fo.fertig = false;
  $('#btn-formen-daumen').hidden = true;
  fo.welt = zufall(PASST_FORMEN);
  const box = $('#formen-karten');
  box.className = 'mengen-karten';
  inEcht({ z: fo, nr, aktuell: foAktuell, ansage: foAnsage, buehne: box, knopf: $('#btn-formen-daumen'),
    karteHtml: `${formBildSvg(FORMEN_GRUND[fo.welt])}<span class="karte-bild">🔎</span>`, sagen: (nr2) => foAnsage(nr2, `formen-such-${fo.welt}`), zeit: FORMEN_ZEIT });
}

async function formenAuftragErledigt(nr) {
  const karte = inEchtBestaetigt(fo, $('#btn-formen-daumen'));
  if (!karte) return;
  animieren(karte, 'huepft');
  glockenspiel();
  await warten(400);
  if (!(await foAnsage(nr, `formen-gefunden-${fo.welt}`))) return;
  spielEnde('formen', formenNeu);
}

$('#btn-formen-daumen').addEventListener('click', () => { audio(); if (fo.inEcht) formenAuftragErledigt(fo.nummer); });

function formenNeu() {
  formenStoppen();
  Object.assign(fo, { stufe: 0, schritt: 0, punkte: 0, auftraege: [], unsicher: new Set(), serie: 0, drei: false, fertig: false, inEcht: false });
  $('#btn-formen-daumen').hidden = true;
  foRundenZeichnen();
  foSchritt();
}

function formenStarten() {
  spielEndeWeg('formen');
  zeigen('formen');
  formenNeu();
}
SPIELE.formen = formenStarten;
$('#home .spiel-btn[data-spiel="formen"]').innerHTML = '<span class="kachel-formen">'
  + ['kreis', 'dreieck', 'quadrat'].map((f) => formBildSvg(FORMEN_GRUND[f])).join('') + '</span>';

$('#btn-formen-home').addEventListener('click', () => { formenStoppen(); wiedergabeStoppen(); zurStartseite(); });
$('#btn-formen-laut').addEventListener('click', () => {
  const ende = $('#formen .spiel-ende');
  if ((ende && !ende.hidden) || fo.fertig || fo.gesperrt) return;
  audio();
  if (fo.inEcht) { inEchtNochmal(fo); return; }
  if (fo.stufe === 1) { clearTimeout(fo.timer); fo.nummer++; foFragen(fo.nummer); return; }
  foSchritt();
});

// ---------- Klatsch – Stampf (ab 3½): ein Muster aus Klatschen und Stampfen hören, sehen und fortsetzen ----------
// Eine Bildreihe 👏 🦶 👏 🦶 ⬜: die App spricht sie in einem Zug („Klatsch, stampf, klatsch, stampf …“), jedes Bild leuchtet
// mit seinem Klang. „Was kommt jetzt?“ – das Kind tippt 👏 oder 🦶. Passt es, spricht die App die ganze Reihe; sonst
// erscheint das Bild blass, wackelt und die Reihe kommt nochmal; 2. Mal: der passende Knopf leuchtet; 3. Mal: die App
// setzt es selbst. Kein Takt, kein Tempo – es zählt nur die Reihenfolge. Runden: AB, BA, AAB, ABB.
// Zum Schluss in echt: das Kind klatscht und stampft selbst, die App macht nach 👍 mit.
const KLATSCH_RUNDEN = [
  { reihe: ['k', 's', 'k', 's'], fehlt: 'k' },
  { reihe: ['s', 'k', 's', 'k'], fehlt: 's' },
  { reihe: ['k', 'k', 's', 'k', 'k'], fehlt: 's' },
  { reihe: ['k', 's', 's', 'k', 's'], fehlt: 's' },
];
const KLATSCH_BILD = { k: '👏', s: '🦶' };
const KLATSCH_ZEIT = { nochmal: 9000, pause: 700, daumen: 6000, auftragNochmal: 16000 };
const kl = { runde: 0, versuche: 0, gesperrt: true, timer: null, nummer: 0, letzterTipp: -Infinity, fertig: false, inEcht: false, auftrag: false };
const klBausteine = spielBausteine('klatsch', kl);
const { aktuell: klAktuell, ansage: klAnsage, zaehlen: klZaehlen } = klBausteine;
SPIEL_STOPPEN.push(() => klatschStoppen());
const klRunde = () => KLATSCH_RUNDEN[kl.runde];

function klatschStoppen() {
  klBausteine.stoppen();
}

function klRundenZeichnen() {
  $('#klatsch-runden').innerHTML = `<span class="gruppe">${
    KLATSCH_RUNDEN.map((_, i) => `<span class="${i < kl.runde ? 'voll' : ''}"></span>`).join('')}</span>`;
}

// Klänge: Klatschen = kurzes Rauschen, Stampfen = tiefer, dumpfer Schlag
function klKlang(art) {
  const c = audio();
  if (!c) return;
  const t = c.currentTime;
  if (art === 'k') {
    const puffer = c.createBuffer(1, Math.round(c.sampleRate * 0.08), c.sampleRate);
    const d = puffer.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (d.length / 6));
    const q = c.createBufferSource(), filter = c.createBiquadFilter(), gain = c.createGain();
    q.buffer = puffer;
    filter.type = 'bandpass';
    filter.frequency.value = 1800;
    gain.gain.value = 0.5;
    q.connect(filter).connect(gain).connect(c.destination);
    q.start(t);
    return;
  }
  const osc = c.createOscillator(), gain = c.createGain();
  osc.frequency.setValueAtTime(120, t);
  osc.frequency.exponentialRampToValueAtTime(45, t + 0.18);
  gain.gain.setValueAtTime(0.5, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
  osc.connect(gain).connect(c.destination);
  osc.start(t);
  osc.stop(t + 0.24);
}

function klFeldAufbauen() {
  const feld = $('#klatsch-feld');
  feld.closest('.screen').classList.remove('ruhig');
  const { reihe } = klRunde();
  feld.innerHTML = `<div class="klatsch-reihe">${reihe.map((a) => `<span class="klatsch-bild" data-art="${a}">${KLATSCH_BILD[a]}</span>`).join('')}`
    + '<span class="klatsch-bild luecke"></span></div>'
    + '<div class="klatsch-knoepfe"><button class="klatsch-knopf" data-art="k" aria-label="Klatschen">👏</button>'
    + '<button class="klatsch-knopf" data-art="s" aria-label="Stampfen">🦶</button></div>';
  feld.querySelectorAll('.klatsch-knopf').forEach((b) => b.addEventListener('click', () => klGetippt(b.dataset.art, b)));
}

const klBilder = () => [...document.querySelectorAll('#klatsch-feld .klatsch-bild:not(.luecke)')];

// Die Reihe in einem Zug: jedes Bild leuchtet mit seinem Klang (Aufnahme gleichmäßig verteilt)
async function klReiheVorspielen(nr, name, bilder) {
  bilder.forEach((b) => b.classList.remove('leuchtet'));
  const ok = await klZaehlen(nr, name, bilder, (i) => klKlang(bilder[i].dataset.art));
  bilder.forEach((b) => b.classList.remove('leuchtet'));
  return ok;
}

async function klatschNeueRunde() {
  klatschStoppen();
  const nr = kl.nummer;
  kl.versuche = 0;
  klFeldAufbauen();
  await warten(400);
  if (!klAktuell(nr)) return;
  klFragen(nr);
}

async function klFragen(nr) {
  if (!klAktuell(nr)) return;
  kl.gesperrt = true;
  document.querySelectorAll('#klatsch-feld .klatsch-knopf').forEach((b) => b.classList.remove('blass'));
  // „Klatsch, stampf, klatsch, stampf. Und dann?“ – eine Aufnahme, jedes Bild leuchtet mit seinem Klang
  if (!(await klReiheVorspielen(nr, `klatsch-reihe-${kl.runde + 1}`, klBilder()))) return;
  kl.gesperrt = false;
  clearTimeout(kl.timer);
  kl.timer = setTimeout(() => klAktuell(nr) && !kl.gesperrt && klFragen(nr), KLATSCH_ZEIT.nochmal);
}

async function klGetippt(art, btn) {
  const jetzt = performance.now();
  if (kl.gesperrt || kl.auftrag || jetzt - kl.letzterTipp < 400) return;   // Doppeltipps zählen nicht
  kl.letzterTipp = jetzt;
  audio();
  clearTimeout(kl.timer);
  const nr = kl.nummer;
  kl.gesperrt = true;
  klKlang(art);
  animieren(btn, 'huepft');
  const luecke = $('#klatsch-feld .luecke');
  luecke.textContent = KLATSCH_BILD[art];
  luecke.dataset.art = art;
  if (art === klRunde().fehlt) {
    luecke.classList.add('gefuellt');
    luecke.classList.remove('blass');
    await warten(450);
    if (!klAktuell(nr)) return;
    if (!(await klRichtig(nr))) return;
    return;
  }
  kl.versuche++;
  luecke.classList.add('blass');
  animieren(luecke, 'wackelt');
  await warten(700);
  if (!klAktuell(nr)) return;
  luecke.textContent = '';
  luecke.classList.remove('blass');
  const richtigKnopf = $(`#klatsch-feld .klatsch-knopf[data-art="${klRunde().fehlt}"]`);
  if (kl.versuche >= 3) {
    luecke.textContent = KLATSCH_BILD[klRunde().fehlt];
    luecke.dataset.art = klRunde().fehlt;
    luecke.classList.add('gefuellt');
    klKlang(klRunde().fehlt);
    await warten(450);
    klRichtig(nr);
    return;
  }
  if (kl.versuche === 2) richtigKnopf.classList.add('hinweis');
  klFragen(nr);
}

// Passt: die ganze Reihe einmal mit Klang, dann die nächste Runde
async function klRichtig(nr) {
  document.querySelectorAll('#klatsch-feld .klatsch-knopf').forEach((b) => b.classList.remove('hinweis'));
  const alle = [...document.querySelectorAll('#klatsch-feld .klatsch-bild')];
  if (!(await klReiheVorspielen(nr, `klatsch-voll-${kl.runde + 1}`, alle))) return false;
  glockenspiel();
  alle.forEach((b) => b.classList.add('leuchtet'));
  await warten(KLATSCH_ZEIT.pause);
  if (!klAktuell(nr)) return false;
  kl.runde++;
  klRundenZeichnen();
  if (kl.runde < KLATSCH_RUNDEN.length) klatschNeueRunde(); else klatschAuftrag();
  return true;
}

// ----- Echte Welt: „Jetzt du: klatsch, stampf, klatsch, stampf!“ – nach 👍 macht die App mit -----

function klatschAuftrag() {
  klatschStoppen();
  const nr = kl.nummer;
  kl.auftrag = true;
  kl.fertig = false;
  $('#btn-klatsch-daumen').hidden = true;
  inEcht({ z: kl, nr, aktuell: klAktuell, ansage: klAnsage, buehne: $('#klatsch-feld'), knopf: $('#btn-klatsch-daumen'),
    karteHtml: ['k', 's', 'k', 's', 'k'].map((a) => `<span class="karte-bild klatsch-karte-bild" data-art="${a}">${KLATSCH_BILD[a]}</span>`).join(''),
    sagen: (nr2) => klAnsage(nr2, 'klatsch-welt'), zeit: KLATSCH_ZEIT });
}

async function klatschAuftragErledigt(nr) {
  const karte = inEchtBestaetigt(kl, $('#btn-klatsch-daumen'));
  if (!karte) return;
  if (!(await klAnsage(nr, 'klatsch-welt-mit'))) return;
  const bilder = [...karte.querySelectorAll('.klatsch-karte-bild')];
  if (!(await klZaehlen(nr, 'klatsch-voll-1', bilder, (i) => klKlang(bilder[i].dataset.art)))) return;
  glockenspiel();
  await warten(400);
  if (!(await klAnsage(nr, 'klatsch-ende'))) return;
  spielEnde('klatsch', klatschNeu);
}

$('#btn-klatsch-daumen').addEventListener('click', () => { audio(); if (kl.inEcht) klatschAuftragErledigt(kl.nummer); });

function klatschNeu() {
  klatschStoppen();
  Object.assign(kl, { runde: 0, fertig: false, inEcht: false, auftrag: false });
  $('#btn-klatsch-daumen').hidden = true;
  klRundenZeichnen();
  klatschNeueRunde();
}

function klatschStarten() {
  spielEndeWeg('klatsch');
  zeigen('klatsch');
  klatschNeu();
}
SPIELE.klatsch = klatschStarten;
$('#home .spiel-btn[data-spiel="klatsch"]').innerHTML = '<span class="kachel-klatsch">👏<span>🦶</span></span>';

$('#btn-klatsch-home').addEventListener('click', () => { klatschStoppen(); wiedergabeStoppen(); zurStartseite(); });
$('#btn-klatsch-laut').addEventListener('click', () => {
  const ende = $('#klatsch .spiel-ende');
  if ((ende && !ende.hidden) || kl.fertig || kl.gesperrt) return;
  audio();
  if (kl.inEcht) { inEchtNochmal(kl); return; }
  clearTimeout(kl.timer);
  kl.nummer++;
  klFragen(kl.nummer);
});

// ---------- Elternbereich (2 Sekunden gedrückt halten) ----------

(() => {
  const btn = $('#btn-eltern');
  let timer = null;
  const abbrechen = () => { clearTimeout(timer); btn.classList.remove('halten'); };
  btn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    btn.classList.add('halten');
    timer = setTimeout(() => { abbrechen(); elternOeffnen(); }, 2000);
  });
  ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => btn.addEventListener(ev, abbrechen));
  btn.addEventListener('contextmenu', (e) => e.preventDefault());
})();

function elternOeffnen() {
  wiedergabeStoppen();
  elternZeichnen();
  zeigen('eltern');
}

function elternZeichnen() {
  kinderListeZeichnen();
  menschenListeZeichnen();
  // Mit Kindern stellt man das Regal beim Kind ein
  $('#karte-regal').hidden = kinder.length > 0;
  regalWahlZeichnen($('#spiele-wahl'), regalVon(appWeitAus()), (neu) => {
    speicher.schreiben('spieleAus', ausVon(neu));
    einstellungenLaden();
    elternZeichnen();
  });
  pauseWahlZeichnen();
  spielOptionenZeigen();
  document.querySelectorAll('#karte-regal [data-option]').forEach((box) => {
    box.checked = !!speicher.lesen(box.dataset.option, optionStandard(box.dataset.option));
  });
}

document.querySelectorAll('#karte-regal [data-option]').forEach((box) => box.addEventListener('change', () => {
  speicher.schreiben(box.dataset.option, box.checked);
  einstellungenLaden();
}));
document.querySelectorAll('#kind [data-option]').forEach((box) => box.addEventListener('change', () => {
  kindAendern((k) => { k[box.dataset.option] = box.checked; });
}));

$('#btn-eltern-zurueck').addEventListener('click', zurStartseite);

// --- Kinder ---

function kinderListeZeichnen() {
  const box = $('#kinder-liste');
  box.innerHTML = '';
  kinder.forEach((k) => {
    // Beschreiben statt zählen: welche Spiele das Kind sieht (keine Punkte, nichts zum Vergleichen)
    const spiele = regalVon(k.spieleAus || START_AUS).filter((id) => SPIELE[id])
      .map((id) => $(`#home .spiel-btn[data-spiel="${id}"]`).innerHTML).join(' ');
    const zeile = document.createElement('button');
    zeile.className = 'kind-zeile';
    zeile.innerHTML = `<span class="kind-bild">${kindBildHtml(k)}</span>`
      + `<span class="w">${htmlText(k.name)}<br><small>${spiele ? `Spiele: ${spiele}` : 'Spiele kommen mit den nächsten Updates'}</small></span>`
      + '<span class="pfeil">✏️</span>';
    zeile.addEventListener('click', () => kindBearbeiten(k.id));
    box.appendChild(zeile);
  });
}

// Kind anlegen und speichern (Name schon geprüft); extra = z. B. Tier und Foto aus Wortnest
async function kindAnlegen(name, extra = {}) {
  const erstesKind = kinder.length === 0;
  const kind = {
    id: `k-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    name: name.slice(0, 20),
    tier: extra.tier || TIERE.find((t) => !kinder.some((k) => k.tier === t)) || TIERE[0],
    // Das erste Kind übernimmt das bisherige Regal
    spieleAus: erstesKind ? appWeitAus() : START_AUS,
    // Spiel-Schalter: das erste Kind übernimmt die app-weiten
    ...Object.fromEntries(SPIEL_OPTIONEN.map((o) => [o, erstesKind ? !!speicher.lesen(o, optionStandard(o)) : optionStandard(o)])),
    erstellt: Date.now(),
  };
  if (extra.foto) kind.foto = extra.foto;
  if (extra.wortnestId) kind.wortnestId = extra.wortnestId;
  if (extra.stimme) kind.stimme = extra.stimme;
  await datenbank.kindSpeichern(kind);
  speicherSchuetzen();
  await kinderLaden();
  if (!aktivesKind()) { zustand.kind = kind.id; speicher.schreiben('kind', kind.id); einstellungenLaden(); }
  return kind;
}

// Neues Kind: Name abfragen, anlegen, Formular öffnen; gibt das Kind zurück (oder null bei Abbruch)
async function kindNeu() {
  const name = (prompt('Wie heißt das Kind?') || '').trim();
  if (!name) return null;
  const kind = await kindAnlegen(name);
  kindBearbeiten(kind.id);
  return kind;
}
$('#btn-kind-neu').addEventListener('click', kindNeu);

let kindInArbeit = null;

function kindBearbeiten(id) {
  kindInArbeit = kinder.find((k) => k.id === id);
  if (!kindInArbeit) return;
  kindFormularZeichnen();
  zeigen('kind');
}

async function kindAendern(fn) {
  fn(kindInArbeit);
  await datenbank.kindSpeichern(kindInArbeit);
  // Neu laden, damit Liste, Fotos und aktives Kind denselben Stand haben
  await kinderLaden();
  kindInArbeit = kinder.find((k) => k.id === kindInArbeit.id);
  einstellungenLaden();
  kindFormularZeichnen();
}

function kindFormularZeichnen() {
  const k = kindInArbeit;
  $('#kind-titel').textContent = k.name;
  const name = $('#kind-name');
  if (document.activeElement !== name) name.value = k.name;

  const tiere = $('#kind-tiere');
  tiere.innerHTML = '';
  TIERE.forEach((t) => {
    const btn = document.createElement('button');
    btn.className = `tier${!k.foto && k.tier === t ? ' gewaehlt' : ''}`;
    btn.textContent = t;
    btn.addEventListener('click', () => kindAendern((kk) => { kk.tier = t; kk.foto = null; }));
    tiere.appendChild(btn);
  });
  $('#btn-kind-foto-weg').hidden = !k.foto;
  regalWahlZeichnen($('#kind-spiele'), regalVon(k.spieleAus || START_AUS), (neu) => kindAendern((kk) => { kk.spieleAus = ausVon(neu); }));
  spielOptionenZeigen();
  stimmeWahlZeichnen($('#kind-stimme'), k.stimme || null, (id) => kindAendern((kk) => { kk.stimme = id; }));
  $('#karte-kind-stimme').hidden = !menschen.length;
  document.querySelectorAll('#kind [data-option]').forEach((box) => { box.checked = !!(k[box.dataset.option] ?? optionStandard(box.dataset.option)); });
}

$('#kind-name').addEventListener('change', (e) => {
  const name = e.target.value.trim().slice(0, 20);
  if (name) kindAendern((k) => { k.name = name; });
  else e.target.value = kindInArbeit.name;
});

$('#btn-kind-foto').addEventListener('click', () => fotoWaehlen((blob) => kindAendern((k) => { k.foto = blob; })));
$('#btn-kind-foto-weg').addEventListener('click', () => kindAendern((k) => { k.foto = null; }));

$('#btn-kind-loeschen').addEventListener('click', async () => {
  if (!confirm(`${kindInArbeit.name} löschen?`)) return;
  await datenbank.kindLoeschen(kindInArbeit.id);
  await kinderLaden();
  if (!aktivesKind()) {
    zustand.kind = kinder.length ? kinder[0].id : null;
    speicher.schreiben('kind', zustand.kind);
  }
  einstellungenLaden();
  history.back();
});

$('#btn-kind-zurueck').addEventListener('click', () => history.back());

// --- Wer spielt? ---

function werZeichnen() {
  const box = $('#wer-liste');
  box.innerHTML = '';
  kinder.forEach((k) => {
    const btn = document.createElement('button');
    btn.className = 'wer-kachel';
    btn.innerHTML = `<span class="wer-bild">${kindBildHtml(k)}</span><span class="wer-name">${htmlText(k.name)}</span>`;
    btn.addEventListener('click', () => {
      audio();
      kindWaehlen(k.id);
      spieleZeigen();
      zeigen('home', false);
    });
    box.appendChild(btn);
  });
}

function kindWaehlen(id) {
  zustand.kind = id;
  speicher.schreiben('kind', id);
  einstellungenLaden();
}

$('#btn-kind').addEventListener('click', () => {
  wiedergabeStoppen();
  werZeichnen();
  zeigen('wer', false);
});

// --- Fotos ---

let fotoFertig = null;
function fotoWaehlen(fertig) {
  fotoFertig = fertig;
  const input = $('#foto-input');
  input.value = '';
  input.click();
}

$('#foto-input').addEventListener('change', async (e) => {
  const datei = e.target.files && e.target.files[0];
  if (!datei || !fotoFertig) return;
  let blob;
  try {
    blob = await fotoVerkleinern(datei);
  } catch {
    alert('Das Foto konnte nicht geladen werden.');
    return;
  }
  await fotoFertig(blob);
});

// Quadratisch zuschneiden (Mitte) und auf 512 px verkleinern: spart Speicher, passt in jede Kachel
async function fotoVerkleinern(datei) {
  let bild;
  try {
    bild = await createImageBitmap(datei, { imageOrientation: 'from-image' });
  } catch {
    bild = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = URL.createObjectURL(datei);
    });
  }
  const kante = Math.min(bild.width, bild.height);
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  c.getContext('2d').drawImage(bild, (bild.width - kante) / 2, (bild.height - kante) / 2, kante, kante, 0, 0, 512, 512);
  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject()), 'image/jpeg', 0.85));
}

// ---------- Eigene Stimmen: Menschen sprechen die Sätze der Spiele selbst ein (alles bleibt auf dem Gerät) ----------
// Ein Mensch = Profil { id 'p-…', name (≤ 30), erstellt, wortnestId? }. Medien wie in Wortnest: Foto = ich|bild,
// Aufnahme eines Satzes = datei:ansage-<name>.wav|stimme (gleiche Form wie Wortnests Studio, für ein späteres Stimm-Paket).
// Wer spricht: beim Kind „stimme“ (ohne Kinder app-weit fn:stimme); null = Computerstimme. Was ein Mensch noch nicht
// eingesprochen hat, spricht die Computerstimme. Zählfolgen sind immer eine ganze Aufnahme – kein Wechsel mittendrin.

let menschen = [];
let menschFotos = {};      // Profil-ID -> Objekt-URL des Fotos
let eigeneAnsagen = {};    // Ansage-Name -> Objekt-URL der Aufnahme der aktiven Stimme
let stimmeLauf = 0;

const ansageUrl = (name) => eigeneAnsagen[name] || `audio/ansage-${name}.wav`;
const ansagePlatz = (name) => `datei:ansage-${name}.wav`;
const ansageVonPlatz = (platz) => { const t = /^datei:ansage-(.+)\.wav$/.exec(platz); return t && ANSAGEN[t[1]] ? t[1] : null; };

async function menschenLaden() {
  Object.values(menschFotos).forEach((url) => URL.revokeObjectURL(url));
  menschFotos = {};
  menschen = await datenbank.profile();
  for (const p of menschen) {
    const foto = await datenbank.medium(p.id, 'ich', 'bild');
    if (foto) menschFotos[p.id] = URL.createObjectURL(foto);
  }
}

function menschBildHtml(p) {
  if (!p) return '🤖';
  return menschFotos[p.id] ? `<img class="bild-datei foto" src="${menschFotos[p.id]}" alt="">` : '🙂';
}

function aktiveStimmeId() {
  const k = aktivesKind();
  const id = k ? k.stimme : speicher.lesen('stimme', null);
  return menschen.some((p) => p.id === id) ? id : null;
}

// Aufnahmen der aktiven Stimme bereitlegen (beim Start, Kindwechsel und nach dem Einsprechen)
async function stimmeLaden() {
  const lauf = ++stimmeLauf;
  const id = aktiveStimmeId();
  const neu = {};
  if (id) {
    (await datenbank.medienVon(id)).forEach((m) => {
      const name = ansageVonPlatz(m.platz);
      if (name && m.art === 'stimme' && m.blob instanceof Blob) neu[name] = URL.createObjectURL(m.blob);
    });
  }
  if (lauf !== stimmeLauf) { Object.values(neu).forEach((url) => URL.revokeObjectURL(url)); return; }
  Object.values(eigeneAnsagen).forEach((url) => URL.revokeObjectURL(url));
  eigeneAnsagen = neu;
}

// Auswahl „Wer spricht?“: Computerstimme oder ein Mensch
function stimmeWahlZeichnen(box, gewaehlt, aendern) {
  box.innerHTML = '';
  [null, ...menschen].forEach((p) => {
    const zeile = document.createElement('label');
    zeile.className = 'umschalter stimme-zeile';
    zeile.innerHTML = `<input type="radio" name="${box.id}" ${(p ? p.id : null) === gewaehlt ? 'checked' : ''}>`
      + `<span class="mensch-bild">${menschBildHtml(p)}</span><span>${p ? htmlText(p.name) : 'Computerstimme'}</span>`;
    zeile.querySelector('input').addEventListener('change', () => aendern(p ? p.id : null));
    box.appendChild(zeile);
  });
}

// --- Liste im Elternbereich ---

async function menschenListeZeichnen() {
  const box = $('#menschen-liste');
  box.innerHTML = '';
  for (const p of menschen) {
    const eigen = (await datenbank.medienVon(p.id)).filter((m) => m.art === 'stimme' && ansageVonPlatz(m.platz)).length;
    const zeile = document.createElement('button');
    zeile.className = 'kind-zeile';
    zeile.innerHTML = `<span class="kind-bild">${menschBildHtml(p)}</span>`
      + `<span class="w">${htmlText(p.name)}<br><small>${eigen} von ${Object.keys(ANSAGEN).length} Sätzen eingesprochen</small></span>`
      + '<span class="pfeil">✏️</span>';
    zeile.addEventListener('click', () => menschBearbeiten(p.id));
    box.appendChild(zeile);
  }
  // Ohne Kinder gilt die Wahl für die ganze App (mit Kindern beim Kind)
  $('#stimme-app').hidden = !!kinder.length || !menschen.length;
  if (!kinder.length) {
    stimmeWahlZeichnen($('#stimme-app-wahl'), aktiveStimmeId(), async (id) => {
      speicher.schreiben('stimme', id);
      await stimmeLaden();
    });
  }
}

async function menschNeu() {
  const name = (prompt('Wer spricht? Name, z. B. Mama, Papa, Oma:') || '').trim();
  if (!name) return null;
  const mensch = { id: `p-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, name: name.slice(0, 30), erstellt: Date.now() };
  await datenbank.profilSpeichern(mensch);
  speicherSchuetzen();
  await menschenLaden();
  menschBearbeiten(mensch.id);
  return mensch;
}
$('#btn-mensch-neu').addEventListener('click', menschNeu);

// --- Ein Mensch: Name, Foto, Sätze einsprechen, für wen ---

let menschInArbeit = null;

function menschBearbeiten(id) {
  menschInArbeit = menschen.find((p) => p.id === id) || null;
  if (!menschInArbeit) return;
  menschZeichnen();
  zeigen('mensch');
}

async function menschZeichnen() {
  const p = menschInArbeit;
  $('#mensch-titel').textContent = p.name;
  const name = $('#mensch-name');
  if (document.activeElement !== name) name.value = p.name;
  $('#mensch-foto').innerHTML = menschBildHtml(p);
  $('#btn-mensch-foto-weg').hidden = !menschFotos[p.id];
  const eigen = (await datenbank.medienVon(p.id)).filter((m) => m.art === 'stimme' && ansageVonPlatz(m.platz)).length;
  $('#mensch-stand').textContent = `${eigen} von ${Object.keys(ANSAGEN).length} Sätzen eingesprochen.`;
  const fuer = kinder.filter((k) => k.stimme === p.id).map((k) => k.name);
  $('#mensch-fuer').textContent = kinder.length
    ? (fuer.length ? `Spricht für: ${fuer.join(', ')}.` : 'Spricht noch für kein Kind – beim Kind unter „Stimme“ auswählen.')
    : (aktiveStimmeId() === p.id ? 'Spricht in der App.' : 'Spricht noch nicht – im Elternbereich unter „Stimmen“ auswählen.');
}

async function menschAendern(fn) {
  fn(menschInArbeit);
  await datenbank.profilSpeichern(menschInArbeit);
  await menschenLaden();
  menschInArbeit = menschen.find((p) => p.id === menschInArbeit.id);
  menschZeichnen();
}

$('#mensch-name').addEventListener('change', (e) => {
  const name = e.target.value.trim().slice(0, 30);
  if (name) menschAendern((p) => { p.name = name; });
  else e.target.value = menschInArbeit.name;
});
$('#btn-mensch-foto').addEventListener('click', () => fotoWaehlen(async (blob) => {
  if (!(await datenbank.medienSetzen(menschInArbeit.id, 'ich', 'bild', blob))) { alert('Speichern ging nicht – vielleicht ist der Speicher voll.'); return; }
  await menschAendern(() => {});
}));
$('#btn-mensch-foto-weg').addEventListener('click', async () => {
  await datenbank.medienEntfernen(menschInArbeit.id, 'ich', 'bild');
  await menschAendern(() => {});
});
$('#btn-mensch-studio').addEventListener('click', () => studioOeffnen(menschInArbeit.id));

$('#btn-mensch-loeschen').addEventListener('click', async () => {
  const p = menschInArbeit;
  if (!confirm(`„${p.name}“ mit allen Aufnahmen und dem Foto löschen? Dann spricht wieder die Computerstimme.`)) return;
  await datenbank.profilLoeschen(p.id);
  for (const k of kinder.filter((kk) => kk.stimme === p.id)) {
    k.stimme = null;
    await datenbank.kindSpeichern(k);
  }
  if (speicher.lesen('stimme', null) === p.id) speicher.schreiben('stimme', null);
  menschInArbeit = null;
  await kinderLaden();
  await menschenLaden();
  await einstellungenLaden();
  history.back();
});
$('#btn-mensch-zurueck').addEventListener('click', () => history.back());

// --- Studio: jeden Satz einmal einsprechen (gedrückt halten), anhören, speichern ---

const STUDIO_RATE = 22050;
const studio = { mensch: null, bereich: null, pos: 0, aufnahme: null, stream: null, rekorder: null, startet: false,
  gedrueckt: false, stoppTimer: null, lauf: 0, eigen: new Set() };
// lauf: zählt bei jedem Wechsel/Verlassen hoch – späte Ergebnisse (Mikrofon, Aufbereitung) gehören dann nicht mehr hierher
const studioAktuell = (lauf) => lauf === studio.lauf && $('#studio').classList.contains('active') && !document.hidden;
const studioBereiche = () => [...new Set(Object.values(ANSAGEN).map(([, spiel]) => spiel))];
const studioStuecke = (bereich) => Object.keys(ANSAGEN).filter((n) => ANSAGEN[n][1] === bereich);
const istZaehlfolge = (name) => /^Eins[,.!]/.test(ANSAGEN[name][0]);

function studioTipp(name) {
  if (istZaehlfolge(name)) return 'Zählen in einem Zug: langsam, etwa eine Sekunde pro Zahl mit kleiner Pause – die letzte Zahl betonen.';
  return `Ansage bei „${ANSAGEN[name][1]}“ – freundlich und ruhig, wie zu einem Kind neben Ihnen.`;
}

async function studioOeffnen(menschId) {
  const p = menschen.find((x) => x.id === menschId);
  if (!p) return;
  studio.mensch = p.id;
  studio.eigen = new Set((await datenbank.medienVon(p.id)).filter((m) => m.art === 'stimme').map((m) => ansageVonPlatz(m.platz)).filter(Boolean));
  $('#studio-titel').textContent = `Stimme: ${p.name}`;
  $('#studio-hinweis').hidden = !!speicher.lesen('studioHinweis', false);
  zeigen('studio');
  // Mit dem ersten Bereich beginnen, in dem noch etwas fehlt
  studio.bereich = studioBereiche().find((b) => studioStuecke(b).some((n) => !studio.eigen.has(n))) || studioBereiche()[0];
  studioErstesOffenes();
}

function studioZeichnen() {
  const stuecke = studioStuecke(studio.bereich);
  const name = stuecke[studio.pos];
  const reiter = $('#studio-reiter');
  reiter.innerHTML = '';
  studioBereiche().forEach((b) => {
    const btn = document.createElement('button');
    btn.className = b === studio.bereich ? 'aktiv' : '';
    btn.textContent = `${b} ${studioStuecke(b).filter((n) => studio.eigen.has(n)).length}/${studioStuecke(b).length}`;
    btn.addEventListener('click', () => { studioAbbrechen(); studio.bereich = b; studioErstesOffenes(); });
    reiter.appendChild(btn);
  });
  $('#studio-balken').style.width = `${(stuecke.filter((n) => studio.eigen.has(n)).length / stuecke.length) * 100}%`;
  $('#studio-text').textContent = ANSAGEN[name][0];
  $('#studio-text').classList.toggle('eigen', studio.eigen.has(name));
  $('#studio-tipp').textContent = studioTipp(name);
  $('#btn-studio-meins').disabled = !studio.eigen.has(name);
  $('#btn-studio-zuruecksetzen').hidden = !studio.eigen.has(name);
  $('#btn-studio-gut').disabled = !studio.aufnahme;
  $('#btn-studio-vor').disabled = studio.pos === 0;
  $('#btn-studio-weiter').disabled = studio.pos === stuecke.length - 1;
}

function studioMeldung(text, warnung = false) {
  const m = $('#studio-meldung');
  m.textContent = text;
  m.classList.toggle('warnung', warnung);
}

function studioGehe(pos) {
  studioAbbrechen();
  studio.pos = Math.max(0, Math.min(studioStuecke(studio.bereich).length - 1, pos));
  studioMeldung('Gedrückt halten und sprechen, dann loslassen.');
  studioZeichnen();
}

function studioErstesOffenes() {
  const i = studioStuecke(studio.bereich).findIndex((n) => !studio.eigen.has(n));
  studioGehe(i >= 0 ? i : 0);
}

// Mikrofon nur, solange das Studio offen ist; beim Verlassen oder im Hintergrund ganz schließen
function studioMikrofonZu() {
  clearTimeout(studio.stoppTimer);
  if (studio.rekorder && studio.rekorder.state === 'recording') { studio.rekorder.onstop = null; studio.rekorder.stop(); }
  studio.rekorder = null;
  if (studio.stream) studio.stream.getTracks().forEach((t) => t.stop());
  studio.stream = null;
  $('#btn-studio-mikro').classList.remove('aktiv');
}

function studioAbbrechen() {
  studio.lauf++;
  if (studio.rekorder) studioMikrofonZu();
  studio.aufnahme = null;
}

async function studioAufnahmeStart() {
  if (studio.rekorder || studio.startet) return;
  if (!navigator.mediaDevices || !window.MediaRecorder) { studioMeldung('Aufnehmen geht nur in der installierten App bzw. über https.', true); return; }
  studio.startet = true;
  wiedergabeStoppen();
  const lauf = studio.lauf;
  try {
    const stream = studio.stream || await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: true } });
    // Inzwischen verlassen (z. B. während der Berechtigungsfrage): Mikrofon sofort wieder schließen
    if (!studioAktuell(lauf)) { stream.getTracks().forEach((t) => t.stop()); studio.startet = false; return; }
    studio.stream = stream;
  } catch {
    studio.startet = false;
    studioMeldung('Kein Zugriff aufs Mikrofon. Bitte in den Einstellungen des Handys/Browsers das Mikrofon für diese App erlauben.', true);
    return;
  }
  studio.startet = false;
  if (!studio.gedrueckt) return;   // schon wieder losgelassen, während das Mikrofon aufging
  const teile = [];
  const r = new MediaRecorder(studio.stream);
  studio.rekorder = r;
  r.ondataavailable = (e) => { if (e.data.size) teile.push(e.data); };
  const name = studioStuecke(studio.bereich)[studio.pos];   // gehört zu diesem Satz, auch wenn danach weitergeblättert wird
  r.onstop = () => { studio.rekorder = null; $('#btn-studio-mikro').classList.remove('aktiv'); studioVerarbeiten(new Blob(teile, { type: r.mimeType }), name, lauf); };
  r.start();
  $('#btn-studio-mikro').classList.add('aktiv');
  studioMeldung('Ich höre zu …');
  studioPegelStarten(studio.stream, r);
  // Sicherheitsstopp: Zählen „eins … fünf“ langsam braucht länger als ein Satz
  studio.stoppTimer = setTimeout(() => { if (r.state === 'recording') r.stop(); }, istZaehlfolge(name) ? 14000 : 8000);
}

function studioAufnahmeStopp() {
  studio.gedrueckt = false;
  clearTimeout(studio.stoppTimer);
  if (studio.rekorder && studio.rekorder.state === 'recording') studio.rekorder.stop();
}

// Pegel-Balken während der Aufnahme: zeigt, dass die App hört (und ob es zu leise ist)
function studioPegelStarten(stream, rekorder) {
  const ctx = audio();
  const balken = $('#studio-pegel');
  if (!ctx || !balken) return;
  let quelle;
  try { quelle = ctx.createMediaStreamSource(stream); } catch { return; }
  const analyse = ctx.createAnalyser();
  analyse.fftSize = 512;
  quelle.connect(analyse);
  const daten = new Uint8Array(analyse.fftSize);
  const schritt = () => {
    if (rekorder.state !== 'recording') { balken.style.width = '0'; quelle.disconnect(); return; }
    analyse.getByteTimeDomainData(daten);
    let spitze = 0;
    for (const x of daten) spitze = Math.max(spitze, Math.abs(x - 128));
    balken.style.width = `${Math.min(100, (spitze / 128) * 160)}%`;
    requestAnimationFrame(schritt);
  };
  requestAnimationFrame(schritt);
}

// Auf 22050 Hz umrechnen, Stille am Anfang/Ende abschneiden, Lautstärke angleichen (wie in Wortnest)
async function studioAufbereiten(blob) {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  const ctx = new Ctx();
  let puffer;
  try { puffer = await ctx.decodeAudioData(await blob.arrayBuffer()); } finally { ctx.close(); }
  const off = new OfflineAudioContext(1, Math.ceil(puffer.duration * STUDIO_RATE), STUDIO_RATE);
  const q = off.createBufferSource();
  q.buffer = puffer;
  q.connect(off.destination);
  q.start();
  const d = (await off.startRendering()).getChannelData(0);
  const fenster = Math.round(STUDIO_RATE * 0.01);
  const energie = [];
  for (let i = 0; i < d.length; i += fenster) {
    let summe = 0;
    for (let j = i; j < Math.min(d.length, i + fenster); j++) summe += d[j] * d[j];
    energie.push(Math.sqrt(summe / fenster));
  }
  const spitze = Math.max(0, ...energie);
  if (spitze < 0.01) return null;
  const schwelle = Math.max(0.006, spitze * 0.1);
  const erstes = energie.findIndex((e) => e >= schwelle);
  const letztes = energie.length - 1 - [...energie].reverse().findIndex((e) => e >= schwelle);
  if (letztes - erstes < 6) return null;   // nur ein Klick
  const t = d.slice(Math.max(0, erstes - 4) * fenster, Math.min(energie.length, letztes + 10) * fenster);
  const hoch = t.reduce((m, x) => Math.max(m, Math.abs(x)), 1e-6);
  const blende = Math.round(STUDIO_RATE * 0.008);
  return t.map((x, i) => x / hoch * 0.9 * Math.min(1, i / blende, (t.length - 1 - i) / blende));
}

function studioWav(t) {
  const buf = new ArrayBuffer(44 + t.length * 2);
  const v = new DataView(buf);
  const text = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  text(0, 'RIFF'); v.setUint32(4, 36 + t.length * 2, true); text(8, 'WAVE');
  text(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, STUDIO_RATE, true); v.setUint32(28, STUDIO_RATE * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  text(36, 'data'); v.setUint32(40, t.length * 2, true);
  t.forEach((x, i) => v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, x)) * 32767, true));
  return new Blob([buf], { type: 'audio/wav' });
}

async function studioVerarbeiten(blob, name = studioStuecke(studio.bereich)[studio.pos], lauf = studio.lauf) {
  let t = null;
  try { t = await studioAufbereiten(blob); } catch { t = null; }
  if (lauf !== studio.lauf || !$('#studio').classList.contains('active')) return;   // inzwischen weitergeblättert/verlassen
  if (!t) { studio.aufnahme = null; studioZeichnen(); studioMeldung('Nichts gehört – bitte etwas lauter nochmal.', true); return; }
  studio.aufnahme = studioWav(t);
  studioZeichnen();
  studioMeldung('So klingt es im Spiel. Gut? Dann „Gut, weiter“ – sonst einfach nochmal halten.');
  studioAbspielen(studio.aufnahme);
}

function studioAbspielen(blob) {
  const url = URL.createObjectURL(blob);
  folgeAbspielen([{ url }]).finally(() => setTimeout(() => URL.revokeObjectURL(url), 1000));
}

async function studioSpeichern() {
  if (!studio.aufnahme) return;
  const name = studioStuecke(studio.bereich)[studio.pos];
  speicherSchuetzen();
  if (!(await datenbank.medienSetzen(studio.mensch, ansagePlatz(name), 'stimme', studio.aufnahme))) {
    studioMeldung('Speichern ging nicht – vielleicht ist der Speicher voll.', true);
    return;
  }
  studio.eigen.add(name);
  studio.aufnahme = null;
  if (aktiveStimmeId() === studio.mensch) await stimmeLaden();
  const naechstes = studioStuecke(studio.bereich).findIndex((n, i) => i > studio.pos && !studio.eigen.has(n));
  studioGehe(naechstes >= 0 ? naechstes : studio.pos);
  studioMeldung(`„${ANSAGEN[name][0]}“ gespeichert.`);
}

async function studioZuruecksetzen() {
  const name = studioStuecke(studio.bereich)[studio.pos];
  if (!confirm(`Ihre Aufnahme für „${ANSAGEN[name][0]}“ löschen? Dann spricht hier wieder die Computerstimme.`)) return;
  await datenbank.medienEntfernen(studio.mensch, ansagePlatz(name), 'stimme');
  studio.eigen.delete(name);
  if (aktiveStimmeId() === studio.mensch) await stimmeLaden();
  studioZeichnen();
}

const mikro = $('#btn-studio-mikro');
mikro.addEventListener('pointerdown', (e) => { e.preventDefault(); mikro.setPointerCapture(e.pointerId); studio.gedrueckt = true; studioAufnahmeStart(); });
['pointerup', 'pointercancel'].forEach((ev) => mikro.addEventListener(ev, studioAufnahmeStopp));
mikro.addEventListener('contextmenu', (e) => e.preventDefault());
$('#btn-studio-gut').addEventListener('click', studioSpeichern);
$('#btn-studio-standard').addEventListener('click', () => folgeAbspielen([{ url: `audio/ansage-${studioStuecke(studio.bereich)[studio.pos]}.wav` }]));
$('#btn-studio-meins').addEventListener('click', async () => {
  const blob = await datenbank.medium(studio.mensch, ansagePlatz(studioStuecke(studio.bereich)[studio.pos]), 'stimme');
  if (blob) studioAbspielen(blob);
});
$('#btn-studio-vor').addEventListener('click', () => studioGehe(studio.pos - 1));
$('#btn-studio-weiter').addEventListener('click', () => studioGehe(studio.pos + 1));
$('#btn-studio-zuruecksetzen').addEventListener('click', studioZuruecksetzen);
$('#btn-studio-ok').addEventListener('click', () => { speicher.schreiben('studioHinweis', true); $('#studio-hinweis').hidden = true; });
$('#btn-studio-zurueck').addEventListener('click', () => history.back());
document.addEventListener('visibilitychange', () => { if (document.hidden) { studioAbbrechen(); studioMikrofonZu(); } });

// ---------- Über die App & Datenschutz (für Eltern; erreichbar aus dem Elternbereich und der Begrüßung) ----------

let infoVonBegruessung = false;
function infoOeffnen() {
  infoVonBegruessung = $('#willkommen').classList.contains('active');
  $('#info-version').textContent = `Version ${APP_VERSION}`;
  zeigen('info');
}
$('#btn-info').addEventListener('click', infoOeffnen);
$('#btn-willkommen-info').addEventListener('click', infoOeffnen);
$('#btn-info-zurueck').addEventListener('click', () => history.back());

// ---------- Willkommen (erster Start) ----------

const willkommenNoetig = () => !kinder.length && !speicher.lesen('willkommen', false);

$('#btn-willkommen-los').addEventListener('click', () => {
  speicher.schreiben('willkommen', true);
  audio();
  spieleZeigen();
  zeigen('home', false);
});
// Kind anlegen: derselbe Weg wie im Elternbereich (Name, dann Bild/Einstellungen); zurück führt zur Startseite
$('#btn-willkommen-kind').addEventListener('click', async () => {
  if (await kindNeu()) speicher.schreiben('willkommen', true);
});

// ---------- Start ----------

// Promise, damit Tests auf das Ende des Starts warten können
const startFertig = (async () => {
  await kinderLaden();
  await menschenLaden();
  if (zustand.kind && !aktivesKind()) zustand.kind = kinder.length ? kinder[0].id : null;
  await einstellungenLaden();
  if (kinder.length) speicherSchuetzen();
  spieleZeigen();
  document.body.classList.remove('laedt');
  // Mit Kindern beginnt die App mit „Wer spielt?“, auf einem neuen Gerät mit der Begrüßung (einmalig)
  if (!$('#home').classList.contains('active')) return;
  if (kinder.length) { werZeichnen(); zeigen('wer', false); }
  else if (willkommenNoetig()) zeigen('willkommen', false);
})();

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  // Neue Version übernommen: einmal neu laden, damit sie sofort sichtbar ist (nicht beim allerersten Start)
  const hatteVersion = !!navigator.serviceWorker.controller;
  let neuGeladen = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hatteVersion || neuGeladen) return;
    neuGeladen = true;
    location.reload();
  });
  navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' })
    .then((reg) => reg.update())
    .catch(() => {});
  // Wortnest löscht bei seinen Updates fremde Offline-Speicher derselben Adresse mit: bei jedem Start nachfüllen lassen
  navigator.serviceWorker.ready.then((reg) => reg.active && reg.active.postMessage('cache-pruefen')).catch(() => {});
  // Auch beim Zurückholen aus dem Hintergrund nach Updates suchen (dabei wird die Seite nicht neu geladen)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    navigator.serviceWorker.getRegistration().then((reg) => reg && reg.update()).catch(() => {});
  });
}

$('#app-version').textContent = `Version ${APP_VERSION}`;

// Von Hand: Update holen und neu laden (falls ein Gerät hängen geblieben ist)
$('#btn-update').addEventListener('click', async () => {
  try {
    const reg = 'serviceWorker' in navigator && await navigator.serviceWorker.getRegistration();
    if (reg) await reg.update();
  } catch { /* offline: einfach neu laden */ }
  location.reload();
});
