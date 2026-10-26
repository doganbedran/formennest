// Testet „Zeig mir den Kreis“: Drei-Stufen-Lektion mit Kreis/Quadrat/Dreieck, erst zwei Karten, nach zwei Treffern drei,
// kein „falsch“ (1. benennen, 2. Ecken leuchten und werden gezählt – Kreis „keine Ecken“, 3. Lösung), Stufe 4 „Auch das
// ist ein …“ (Quadrat nie auf der Spitze), alle Formen gleiche Farbe, Auftrag „Such … bei dir zu Hause!“, kein Text.
// Frisches Profil. Ansicht am Ende: Hilfe mit leuchtenden Ecken.
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

  const gesagt = [];
  folgeAbspielen = async (folge) => { gesagt.push(...folge.map((q) => q.url.replace('audio/ansage-', '').replace('.wav', ''))); await warte(5); };
  zaehlenMitLeuchten = async (name, el) => { gesagt.push(name); el.forEach((e) => e.classList.add('leuchtet')); await warte(5); };
  Object.assign(FORMEN_ZEIT, { weiterOhneTipp: 150, nochmalFragen: 6000, antwort: 150, auchWeiter: 100, pause: 20, daumen: 100, auftragNochmal: 3000 });
  const zuletzt = () => gesagt[gesagt.length - 1];
  const karte = (f) => $(`#formen-karten .form-karte[data-form="${f}"]`);
  const bereit = (stufe) => bis(() => fo.stufe === stufe && !fo.gesperrt);

  // 1. Ansagen (der Kreis, das Quadrat, das Dreieck)
  pruefe(ANSAGEN['formen-wo-kreis'][0] === 'Wo ist der Kreis?' && ANSAGEN['formen-such-kreis'][0] === 'Such einen Kreis bei dir zu Hause!'
    && ANSAGEN['formen-ist-quadrat'][0] === 'Das ist ein Quadrat.', 'Ansagen');
  pruefe((await fetch('audio/ansage-formen-ecken-dreieck.wav')).ok, 'Ansage-Datei fehlt');
  // Quadrat-Abwandlungen höchstens leicht gekippt (sonst „Raute“)
  pruefe(FORMEN_AUCH.quadrat.every((d) => !d.drehung || d.drehung <= 15), 'Quadrat zu stark gedreht');

  // 2. Stufe 1: der Reihe nach benennen, eine Karte; Tippen = nochmal hören; gleiche Farbe
  speicher.schreiben('spieleAus', []);
  einstellungenLaden();
  spieleZeigen();
  const kachel = $('#home .spiel-btn[data-spiel="formen"]');
  pruefe(!kachel.hidden && kachel.querySelectorAll('svg').length === 3, 'Kachel fehlt');
  FORMEN_ZEIT.weiterOhneTipp = 2000;
  kachel.click();
  pruefe(aktiv('formen'), 'Spiel nicht geöffnet');
  await bereit(0);
  pruefe(zuletzt() === 'formen-ist-kreis' && $('#formen-karten').children.length === 1, `Stufe 1: ${gesagt}`);
  pruefe(!/[A-Za-zÄÖÜäöüß0-9]/.test($('#formen').innerText), `Text auf dem Kinder-Bildschirm: ${$('#formen').innerText}`);
  karte('kreis').click();
  await bis(() => zuletzt() === 'formen-ist-quadrat');
  pruefe(gesagt.filter((g) => g === 'formen-ist-kreis').length === 2, 'Tippen in Stufe 1 benennt nicht nochmal');
  FORMEN_ZEIT.weiterOhneTipp = 150;
  await bereit(1);

  // 3. Stufe 2: zwei Karten; zwei Treffer → drei Karten
  pruefe($('#formen-karten').children.length === 2 && zuletzt() === `formen-wo-${fo.ziel}`, 'Stufe 2 Start');
  const farben = new Set([...document.querySelectorAll('#formen-karten [fill]')].map((e) => e.getAttribute('fill')).filter((f) => f !== 'transparent'));
  pruefe(farben.size === 1, `Formen nicht gleichfarbig: ${[...farben]}`);
  for (let i = 0; i < 2; i++) { const s = fo.schritt; karte(fo.ziel).click(); await bis(() => fo.schritt === s + 1 && !fo.gesperrt); }
  pruefe(fo.drei && $('#formen-karten').children.length === 3, 'Nach zwei Treffern keine drei Karten');

  // 4. Daneben: 1. benennen; 2. Ecken leuchten und werden gezählt; 3. Lösung
  const ziel = fo.ziel, falsch = PASST_FORMEN.find((f) => f !== ziel);
  const schritt = fo.schritt;
  karte(falsch).click();
  await bis(() => zuletzt() === `formen-wo-${ziel}` && !fo.gesperrt);
  pruefe(gesagt.slice(-2).join() === `formen-ist-${falsch},formen-wo-${ziel}`, `1. daneben: ${gesagt.slice(-2)}`);
  await warte(450);
  karte(falsch).click();
  await bis(() => gesagt.includes(`formen-ecken-${ziel}`));
  pruefe(gesagt.includes(`formen-ecken-${ziel}`), `2. daneben: keine Ecken-Hilfe (${ziel})`);
  if (ziel !== 'kreis') pruefe(karte(ziel).querySelectorAll('.ecke').length === (ziel === 'dreieck' ? 3 : 4), 'Ecken fehlen');
  await bis(() => zuletzt() === `formen-wo-${ziel}` && !fo.gesperrt);
  await warte(450);
  karte(falsch).click();
  await bis(() => fo.schritt === schritt + 1 || fo.stufe === 2);
  pruefe(!gesagt.some((g) => /falsch|nein/.test(g)) && fo.unsicher.has(ziel), '3. daneben');

  // 5. Rest, Stufe 3 (Sag es), Stufe 4 (Auch das), Auftrag
  while (fo.stufe === 1) {
    await bis(() => !fo.gesperrt || fo.stufe !== 1);
    if (fo.stufe !== 1) break;
    const s = fo.schritt;
    karte(fo.ziel).click();
    await bis(() => fo.schritt !== s || fo.stufe !== 1);
  }
  await bis(() => fo.stufe === 3, 8000);
  await bis(() => fo.inEcht && !$('#btn-formen-daumen').hidden, 8000);
  pruefe(gesagt.filter((g) => g.startsWith('formen-auch-')).length === 3, 'Stufe 4 „Auch das“ fehlt');
  pruefe(zuletzt() === `formen-such-${fo.welt}` && gesagt.includes('formen-sag-es'), `Auftrag: ${gesagt.slice(-3)}`);
  $('#btn-formen-daumen').click();
  await bis(() => $('#formen .spiel-ende') && !$('#formen .spiel-ende').hidden);
  pruefe(zuletzt() === `formen-gefunden-${fo.welt}`, `Schluss: ${zuletzt()}`);

  // 6. Kurzfassung (je Kind): drei Gruppen, nach „Sag es“ gleich der Auftrag (ohne 🔍)
  zustand.kurz = true;
  formenStoppen();
  Object.assign(fo, { stufe: 2, schritt: 0, fertig: false, inEcht: false });
  foRundenZeichnen();
  pruefe($('#formen-runden').children.length === 3, 'Kurzfassung: nicht drei Gruppen');
  const n6 = gesagt.length;
  foNaechsteStufe();
  await bis(() => fo.inEcht, 4000);
  pruefe(fo.inEcht && !gesagt.slice(n6).some((g) => g.startsWith('formen-auch-')), `Kurzfassung: ${gesagt.slice(n6)}`);
  zustand.kurz = false;

  // Ansicht: Stufe 2, drei Karten, das Dreieck zeigt seine Ecken
  $('#formen .ende-nochmal').click();
  formenStoppen();
  Object.assign(fo, { stufe: 1, schritt: 0, drei: true, auftraege: ['dreieck', 'kreis', 'quadrat', 'dreieck'] });
  $('#formen-symbol').textContent = FORMEN_SYMBOL[1];
  foStufe2();
  await bereit(1);
  karte('dreieck').querySelectorAll('.ecke').forEach((e) => e.classList.add('leuchtet'));

  const d = document.createElement('div');
  d.style.cssText = 'position:fixed;left:0;right:0;bottom:0;color:#fff;font:12px monospace;padding:6px;z-index:9;background:'
    + (fehler.length ? '#c62828' : '#1b7f3a');
  d.textContent = fehler.length ? 'FEHLER: ' + fehler.join(' | ') : 'FORMEN OK';
  document.body.appendChild(d);
})().catch((e) => {
  document.body.insertAdjacentHTML('beforeend', `<div style="position:fixed;bottom:0;background:#c62828;color:#fff;padding:6px;z-index:9">ABSTURZ: ${e}</div>`);
});
