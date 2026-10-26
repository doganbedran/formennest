// Testet 🏠 mitten im Spiel in allen fünf Spielen: danach bleibt alles still (keine Ansage, kein Klang, kein
// Weiterschalten durch Zeitgeber, auch nicht durch „nach 3 Versuchen legt die App selbst“), und ein Neustart beginnt
// sauber von vorn. Außerdem: 🔊 doppelt getippt sagt den Auftrag nur einmal. Frisches Profil.
(async function () {
  const fehler = [];
  const pruefe = (b, t) => { if (!b) fehler.push(t); };
  const warte = (ms) => new Promise((r) => setTimeout(r, ms));
  const bis = async (fn, ms = 5000) => {
    const ende = Date.now() + ms;
    while (!fn() && Date.now() < ende) await warte(20);
    return fn();
  };
  const aktiv = (id) => $(`#${id}`).classList.contains('active');
  await startFertig;

  // Alles, was hörbar ist, wird mitgeschrieben; Ansagen dauern 150 ms (so kann 🏠 mitten hinein)
  const log = [];
  folgeAbspielen = async (folge) => { log.push(...folge.map((q) => q.url.replace('audio/ansage-', '').replace('.wav', ''))); await warte(150); };
  zaehlenMitLeuchten = async (name) => { log.push(name); await warte(150); };
  glockenspiel = () => log.push('glocke');
  paKlack = () => log.push('klack');
  muKlick = () => log.push('klick');
  msQuiek = () => log.push('quiek');
  klKlang = (a) => log.push(`klang-${a}`);
  // Zeitgeber kurz, damit sie im Test sicher ablaufen würden
  Object.assign(PASST_ZEIT, { hilfe: 300, rundenPause: 30 });
  Object.assign(MAUS_ZEIT, { weiterOhneTipp: 300, nochmalFragen: 300, antwort: 300, pause: 20 });
  Object.assign(FORMEN_ZEIT, { weiterOhneTipp: 300, nochmalFragen: 300, antwort: 300, auchWeiter: 300, pause: 20 });
  Object.assign(KLATSCH_ZEIT, { nochmal: 300, pause: 20 });
  Object.assign(MUSTER_ZEIT, { hilfe: 300, pause: 20 });

  const mitte = (el) => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; };
  const ev = (el, typ, p) => el.dispatchEvent(new PointerEvent(typ, { bubbles: true, pointerId: 1, isPrimary: true, clientX: p.x, clientY: p.y }));
  const schieben = async (el, ziel) => {
    await warte(350);
    const von = mitte(el), z = mitte(ziel);
    ev(el, 'pointerdown', von);
    for (let i = 1; i <= 6; i++) ev(document, 'pointermove', { x: von.x + ((z.x - von.x) * i) / 6, y: von.y + ((z.y + 30 - von.y) * i) / 6 });
    ev(document, 'pointerup', { x: z.x, y: z.y + 30 });
    await warte(30);
  };

  speicher.schreiben('spieleAus', []);
  einstellungenLaden();
  spieleZeigen();
  const starten = (id) => { $(`#home .spiel-btn[data-spiel="${id}"]`).click(); pruefe(aktiv(id), `${id}: nicht geöffnet`); };
  // 🏠 drücken, dann 1,5 s horchen: nichts darf mehr kommen
  const heimUndStill = async (id, wann) => {
    $(`#btn-${id}-home`).click();
    await bis(() => aktiv('home'), 1000);
    pruefe(aktiv('home'), `${id} (${wann}): 🏠 führt nicht zur Startseite`);
    const vorher = log.length;
    await warte(1500);
    pruefe(log.length === vorher, `${id} (${wann}): nach 🏠 noch ${log.slice(vorher)}`);
  };

  // Passt rein: 🏠 während der ersten Ansage
  starten('passt');
  await warte(50);
  await heimUndStill('passt', 'Ansage');
  // … und direkt nach dem 3. Fehlversuch (die App würde den Einsatz nach 450 ms selbst einsetzen) – mitten im Ziehen
  starten('passt');
  await bis(() => !pa.gesperrt);
  const kr = pa.teile.find((t) => t.form === 'kreis');
  const fremdeMulde = () => pa.mulden.find((m) => m.form !== 'kreis' && !m.belegt).el;
  for (let i = 0; i < 3; i++) await schieben(kr.el, fremdeMulde());
  const q = pa.teile.find((t) => t.form === 'quadrat');
  ev(q.el, 'pointerdown', mitte(q.el));
  ev(document, 'pointermove', { x: mitte(q.el).x + 30, y: mitte(q.el).y - 30 });
  await heimUndStill('passt', '3. Versuch + Ziehen');
  ev(document, 'pointerup', { x: 10, y: 10 });
  pruefe(!pa.ziehen && !kr.drin, 'passt: nach 🏠 noch eingesetzt oder Ziehen hängt');
  // Neustart sauber: Runde 0, drei lose Einsätze, Start-Ansage
  log.length = 0;
  starten('passt');
  await bis(() => !pa.gesperrt);
  pruefe(pa.runde === 0 && pa.teile.every((t) => !t.drin) && log[0] === 'passt-start', `passt: Neustart nicht sauber (${log})`);
  // 🔊 doppelt getippt: Auftrag nur einmal
  await bis(() => !pa.offen);   // 🔊 gilt erst, wenn die Stimme fertig ist
  log.length = 0;
  $('#btn-passt-laut').click(); $('#btn-passt-laut').click();
  await bis(() => !pa.offen && log.length > 0);
  pruefe(log.filter((g) => g === 'passt-start').length === 1, `passt: 🔊 doppelt → ${log}`);
  await heimUndStill('passt', 'nach 🔊');

  // Wo ist die Maus?: 🏠 während „Die Maus ist …“ und nach einem Tipp auf die Maus
  starten('maus');
  await warte(450);
  await heimUndStill('maus', 'Ansage');
  starten('maus');
  await bis(() => !ms.gesperrt);
  ms.maus.click();
  await warte(30);
  await heimUndStill('maus', 'Tipp auf die Maus');
  log.length = 0;
  starten('maus');
  await bis(() => !ms.gesperrt);
  pruefe(ms.stufe === 0 && ms.schritt === 0 && ms.punkte === 0 && /^maus-ist-/.test(log[0]), `maus: Neustart nicht sauber (${log})`);
  await heimUndStill('maus', 'wartet');

  // Zeig mir den Kreis: 🏠 nach einem Tipp (Antwort läuft), dann sauberer Neustart
  starten('formen');
  await bis(() => !fo.gesperrt);
  await warte(420);
  $('#formen-karten .form-karte').click();
  await warte(30);
  await heimUndStill('formen', 'Antwort');
  log.length = 0;
  starten('formen');
  await bis(() => !fo.gesperrt);
  pruefe(fo.stufe === 0 && fo.punkte === 0 && log[0] === 'formen-ist-kreis', `formen: Neustart nicht sauber (${log})`);
  await heimUndStill('formen', 'wartet');

  // Klatsch – Stampf: 🏠 direkt nach einem unpassenden Tipp (Lücke wackelt, Reihe käme nochmal) und nach dem 3.
  starten('klatsch');
  await bis(() => !kl.gesperrt);
  await warte(420);
  $(`#klatsch-feld .klatsch-knopf[data-art="${KLATSCH_RUNDEN[0].fehlt === 'k' ? 's' : 'k'}"]`).click();
  await warte(30);
  await heimUndStill('klatsch', 'unpassender Tipp');
  starten('klatsch');
  for (let i = 0; i < 3; i++) {
    await bis(() => !kl.gesperrt);
    await warte(420);
    $(`#klatsch-feld .klatsch-knopf[data-art="${KLATSCH_RUNDEN[0].fehlt === 'k' ? 's' : 'k'}"]`).click();
  }
  await warte(750);   // App setzt gleich selbst ein
  await heimUndStill('klatsch', '3. Versuch');
  pruefe(kl.runde === 0, `klatsch: nach 🏠 weitergeschaltet (Runde ${kl.runde})`);

  // Muster legen: 🏠 direkt nach dem 3. Fehlversuch (die App würde nach 450 ms selbst legen)
  starten('muster');
  await bis(() => !mu.gesperrt);
  const z0 = mu.ziele[0];
  const fremd = mu.teile.find((t) => t.form !== z0.form);
  for (let i = 0; i < 3; i++) await schieben(fremd.el, z0.el);
  await heimUndStill('muster', '3. Versuch');
  pruefe(!z0.belegt, 'muster: nach 🏠 noch gelegt');

  const d = document.createElement('div');
  d.style.cssText = 'position:fixed;left:0;right:0;bottom:0;color:#fff;font:12px monospace;padding:6px;z-index:9;background:'
    + (fehler.length ? '#c62828' : '#1b7f3a');
  d.textContent = fehler.length ? 'FEHLER: ' + fehler.join(' | ') : 'STOPP OK';
  document.body.appendChild(d);
})().catch((e) => {
  document.body.insertAdjacentHTML('beforeend', `<div style="position:fixed;bottom:0;background:#c62828;color:#fff;padding:6px;z-index:9">ABSTURZ: ${e}</div>`);
});
