// Testet „Wo ist die Maus?“: Drei-Stufen-Lektion auf/in/unter – Stufe 1 benennt (Maus huscht hin), Stufe 2 schiebt
// das Kind die Maus (woanders = „Jetzt ist sie …“, 2. Mal Platz leuchtet, 3. Mal läuft sie selbst hin), Stufe 3 „Sag
// es!“ ohne Prüfung; „in“ liegt hinter der Vorderwand; Auftrag mit dem Kuscheltier; kein Text. Frisches Profil.
// Ansicht am Ende: Stufe 2, der gesuchte Platz leuchtet.
(async function () {
  const fehler = [];
  const pruefe = (b, t) => { if (!b) fehler.push(t); };
  const warte = (ms2) => new Promise((r) => setTimeout(r, ms2));
  const bis = async (fn, dauer = 5000) => {
    const ende = Date.now() + dauer;
    while (!fn() && Date.now() < ende) await warte(20);
    return fn();
  };
  const aktiv = (id) => $(`#${id}`).classList.contains('active');
  await startFertig;

  const gesagt = [];
  folgeAbspielen = async (folge) => { gesagt.push(...folge.map((q) => q.url.replace('audio/ansage-', '').replace('.wav', ''))); await warte(5); };
  Object.assign(MAUS_ZEIT, { weiterOhneTipp: 150, nochmalFragen: 8000, antwort: 150, pause: 20, vormachen: 30, daumen: 100, auftragNochmal: 3000 });
  const zuletzt = () => gesagt[gesagt.length - 1];
  const mitte = (el) => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; };
  const ev = (el, typ, p) => el.dispatchEvent(new PointerEvent(typ, { bubbles: true, pointerId: 1, isPrimary: true, clientX: p.x, clientY: p.y }));
  const feldPunkt = (lage) => { const r = $('#maus-feld').getBoundingClientRect(); const [x, y] = ms.mass.plaetze[lage]; return { x: r.left + x, y: r.top + y }; };
  const setzen = async (lage) => {
    await warte(400);
    const von = mitte(ms.maus), ziel = feldPunkt(lage);
    ev(ms.maus, 'pointerdown', von);
    for (let i = 1; i <= 6; i++) ev(document, 'pointermove', { x: von.x + ((ziel.x - von.x) * i) / 6, y: von.y + ((ziel.y + 30 - von.y) * i) / 6 });
    ev(document, 'pointerup', { x: ziel.x, y: ziel.y + 30 });
    await warte(30);
  };
  const bereit = (stufe) => bis(() => ms.stufe === stufe && !ms.gesperrt);

  // 1. Ansagen (wo: „auf der Kiste“, wohin: „auf die Kiste“)
  pruefe(ANSAGEN['maus-ist-unter'][0] === 'Die Maus ist unter der Kiste.' && ANSAGEN['maus-setz-in'][0] === 'Setz die Maus in die Kiste!', 'Ansagen');
  pruefe((await fetch('audio/ansage-maus-jetzt-auf.wav')).ok, 'Ansage-Datei fehlt');

  // 2. Stufe 1: auf, in, unter – die Maus huscht hin und wird benannt; „in“ hinter der Vorderwand
  speicher.schreiben('spieleAus', []);
  einstellungenLaden();
  spieleZeigen();
  const kachel = $('#home .spiel-btn[data-spiel="maus"]');
  pruefe(!kachel.hidden, 'Kachel fehlt');
  kachel.click();
  pruefe(aktiv('maus'), 'Spiel nicht geöffnet');
  await bereit(0);
  pruefe(zuletzt() === 'maus-ist-auf' && ms.lage === 'auf', `Stufe 1: ${gesagt}`);
  pruefe(!/[A-Za-zÄÖÜäöüß0-9]/.test($('#maus').innerText), `Text auf dem Kinder-Bildschirm: ${$('#maus').innerText}`);
  await bis(() => ms.lage === 'in' && !ms.gesperrt);
  pruefe(ms.maus.classList.contains('drin') && getComputedStyle(ms.maus).zIndex < getComputedStyle($('#maus-feld .kiste-vorn')).zIndex, '„in“ nicht hinter der Vorderwand');
  await bis(() => ms.lage === 'unter' && !ms.gesperrt);
  // Maus liegt bei „unter“ unter dem Kasten, bei „auf“ darüber
  pruefe(ms.mass.plaetze.unter[1] > ms.mass.y0 + ms.mass.kH && ms.mass.plaetze.auf[1] < ms.mass.y0, 'Plätze auf/unter liegen falsch');

  // 3. Stufe 2: „Setz die Maus … !“ – richtig: Quieken, benennen, weiter
  await bereit(1);
  const ziel1 = ms.ziel;
  pruefe(zuletzt() === `maus-setz-${ziel1}` && ms.lage === 'start', `Stufe 2 Start: ${zuletzt()}`);
  await setzen(ziel1);
  await bis(() => ms.schritt === 1 && !ms.gesperrt);
  pruefe(gesagt.includes(`maus-ist-${ziel1}`), 'Richtig gesetzt: nicht benannt');

  // 4. Woanders hingesetzt: „Jetzt ist sie …“, dann nochmal; 2. Mal: Platz leuchtet; 3. Mal: läuft selbst hin
  const ziel2 = ms.ziel;
  const falsch = MAUS_LAGEN.find((l) => l !== ziel2);
  await setzen(falsch);
  await bis(() => zuletzt() === `maus-setz-${ziel2}` && !ms.gesperrt);
  pruefe(gesagt.slice(-2).join() === `maus-jetzt-${falsch},maus-setz-${ziel2}`, `1. daneben: ${gesagt.slice(-2)}`);
  await setzen(falsch);
  await bis(() => zuletzt() === `maus-setz-${ziel2}` && !ms.gesperrt);
  pruefe(msPlatzEl(ziel2).classList.contains('hinweis'), '2. daneben: Platz leuchtet nicht');
  const n3 = gesagt.length;
  await setzen(falsch);
  await bis(() => ms.lage === ziel2 || ms.schritt === 2);
  pruefe(ms.lage === ziel2, '3. daneben: Maus läuft nicht selbst hin');
  await bis(() => ms.schritt === 2);
  pruefe(gesagt.slice(n3).join() === `maus-jetzt-${falsch},maus-ist-${ziel2}` && !gesagt.some((g) => /falsch|nein/.test(g)), `3. daneben: ${gesagt.slice(n3)}`);

  // 5. Rest von Stufe 2, dann Stufe 3 „Sag es!“ (die App antwortet selbst), dann Auftrag
  await bis(() => !ms.gesperrt);
  await setzen(ms.ziel);
  await bis(() => ms.stufe === 2);
  await bis(() => gesagt.includes('maus-sag-es'));
  await bis(() => ms.inEcht && !$('#btn-maus-daumen').hidden, 8000);
  const welt = gesagt.slice(gesagt.lastIndexOf('jetzt-in-echt') - 1);
  pruefe(welt.join() === `maus-ist-${ms.welt},jetzt-in-echt,maus-welt-${ms.welt}`, `Auftrag (mit Vormachen): ${welt}`);
  $('#btn-maus-daumen').click();
  await bis(() => $('#maus .spiel-ende') && !$('#maus .spiel-ende').hidden);
  pruefe(zuletzt() === `maus-welt-fertig-${ms.welt}`, `Schluss: ${zuletzt()}`);

  // 6. Anordnung: Kiste und Maus im Bild
  $('#maus .ende-nochmal').click();
  await bereit(0);
  const feldR = $('#maus-feld').getBoundingClientRect();
  const teile = [$('#maus-feld .kiste-vorn'), ...MAUS_LAGEN.map((l) => msPlatzEl(l))].map((el) => el.getBoundingClientRect());
  pruefe(teile.every((r) => r.left >= feldR.left - 1 && r.right <= feldR.right + 1 && r.top >= feldR.top - 1 && r.bottom <= feldR.bottom + 1), 'Etwas ragt heraus');

  // 7. Hand: zweimal nur angetippt → die Hand schiebt die Maus ein Stück zum Platz und zurück;
  // lange nichts versucht: 1. Platz leuchtet, 2. Hand, 3. die Maus läuft selbst hin
  mausStoppen();
  Object.assign(ms, { stufe: 1, schritt: 0, folge: ['unter', 'auf', 'in'] });
  msStufe2();
  await bereit(1);
  const antippen = async () => { await warte(400); const p = mitte(ms.maus); ev(ms.maus, 'pointerdown', p); ev(document, 'pointerup', p); await warte(30); };
  await antippen();
  pruefe(!$('#maus-feld .zeige-hand'), '1. Antippen: schon die Hand');
  await antippen();
  pruefe($('#maus-feld .zeige-hand') && ms.gesperrt, '2. Antippen: keine Hand');
  await bis(() => !$('#maus-feld .zeige-hand') && !ms.gesperrt);
  pruefe(ms.lage === 'start' && ms.schritt === 0, 'Hand setzt die Maus ab');
  const n7 = gesagt.length;
  MAUS_ZEIT.nochmalFragen = 150;
  msFragen(ms.nummer);
  await bis(() => $('#maus-feld .zeige-hand'), 4000);
  pruefe(ms.hilfen === 2, `Hand nicht bei der 2. Erinnerung (${ms.hilfen})`);
  await bis(() => ms.schritt === 1, 6000);
  MAUS_ZEIT.nochmalFragen = 8000;
  pruefe(gesagt.slice(n7).includes('maus-ist-unter'), `3. Erinnerung: Maus läuft nicht selbst hin (${gesagt.slice(n7)})`);

  // 8. Die Maus schon während „Setz die Maus …!“ setzen; die Antwort kommt erst, wenn die Stimme fertig ist
  const echt = folgeAbspielen;
  let spricht = 0, zugleich = false;
  folgeAbspielen = async (folge) => {
    if (spricht) zugleich = true;
    spricht++;
    gesagt.push(...folge.map((q) => q.url.replace('audio/ansage-', '').replace('.wav', '')));
    await warte(900);
    spricht--;
  };
  mausStoppen();
  Object.assign(ms, { stufe: 1, schritt: 0, folge: ['unter', 'auf', 'in'] });
  const n8 = gesagt.length;
  msStufe2();
  await bis(() => gesagt.length > n8);
  pruefe(!ms.gesperrt && spricht === 1, 'Während „Setz die Maus …“ gesperrt');
  await setzen('unter');
  await bis(() => gesagt.slice(n8).includes('maus-ist-unter'), 4000);
  pruefe(gesagt.slice(n8, n8 + 2).join() === 'maus-setz-unter,maus-ist-unter' && !zugleich, `Nacheinander: ${gesagt.slice(n8)}, zugleich ${zugleich}`);
  folgeAbspielen = echt;
  await bis(() => !ms.offen, 4000);

  // Ansicht: Stufe 2, gesuchter Platz leuchtet
  mausStoppen();
  Object.assign(ms, { stufe: 1, schritt: 0, folge: ['unter', 'auf', 'in'] });
  $('#maus-symbol').textContent = MAUS_SYMBOL[1];
  msStufe2();
  await bereit(1);
  msPlatzEl('unter').classList.add('hinweis');

  const d = document.createElement('div');
  d.style.cssText = 'position:fixed;left:0;right:0;bottom:0;color:#fff;font:12px monospace;padding:6px;z-index:9;background:'
    + (fehler.length ? '#c62828' : '#1b7f3a');
  d.textContent = fehler.length ? 'FEHLER: ' + fehler.join(' | ') : 'MAUS OK';
  document.body.appendChild(d);
})().catch((e) => {
  document.body.insertAdjacentHTML('beforeend', `<div style="position:fixed;bottom:0;background:#c62828;color:#fff;padding:6px;z-index:9">ABSTURZ: ${e}</div>`);
});
