'use strict';

// Bei jeder Änderung zusammen mit CACHE in sw.js erhöhen (wird im Elternbereich angezeigt)
const APP_VERSION = 2;

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
const ALLE_SPIELE = ['passt'];
const START_REGAL = ['passt'];
const START_AUS = ALLE_SPIELE.filter((id) => !START_REGAL.includes(id));
// Für Eltern: was jedes Spiel tut (die Kacheln zeigen den Kindern nur ein Bild)
const SPIEL_INFO = {
  passt: 'Formen in die passende Mulde schieben – Kreis, Quadrat, Dreieck (ab 3)',
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
