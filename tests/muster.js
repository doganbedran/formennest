// Testet „Muster legen“: Runde 1 nachlegen (nur passende Teile auf die Plätze), ab Runde 2 weiterlegen mit vorgesprochener
// Reihe; unpassendes Teil gleitet zurück, Reihe nochmal, 2. Mal leuchtet das passende Teil, 3. Mal legt die App; Teile
// unterscheiden sich in Form und Helligkeit; fünf Runden (AB, BA, AAB, ABB, ABC); Auftrag mit echten Dingen; kein Text.
// Frisches Profil. Ansicht am Ende: Runde 5 (ABC) mit Hinweis.
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
  Object.assign(MUSTER_ZEIT, { pause: 20, vormachen: 30, daumen: 100, auftragNochmal: 3000 });
  const zuletzt = () => gesagt[gesagt.length - 1];
  const mitte = (el) => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; };
  const ev = (el, typ, p) => el.dispatchEvent(new PointerEvent(typ, { bubbles: true, pointerId: 1, isPrimary: true, clientX: p.x, clientY: p.y }));
  const schieben = async (t, ziel) => {
    await warte(350);
    const von = mitte(t.el), z = mitte(ziel.el);
    ev(t.el, 'pointerdown', von);
    for (let i = 1; i <= 6; i++) ev(document, 'pointermove', { x: von.x + ((z.x - von.x) * i) / 6, y: von.y + ((z.y + 30 - von.y) * i) / 6 });
    ev(document, 'pointerup', { x: z.x, y: z.y + 30 });
    await warte(30);
  };
  const los = (form) => mu.teile.find((t) => !t.drin && t.form === form);
  const bereit = () => bis(() => !mu.gesperrt);

  // 1. Ansagen und Teile: Form UND Helligkeit verschieden
  pruefe(ANSAGEN['muster-reihe-2'][0] === 'Dreieck, Kreis, Dreieck, Kreis, Dreieck. Und dann?' && ANSAGEN['muster-voll-1'][0] === 'Kreis, Dreieck, Kreis, Dreieck. Ein Muster!', 'Ansagen');
  const fuellung = (f) => new DOMParser().parseFromString(musterSvg(f), 'image/svg+xml').querySelector('[fill]').getAttribute('fill');
  pruefe(new Set(['kreis', 'dreieck', 'quadrat'].map(fuellung)).size === 3, 'Teile nicht verschieden hell');
  pruefe(MUSTER_RUNDEN.every((r, i) => ANSAGEN[`muster-voll-${i + 1}`][0].split(/[,.]/).filter((w) => /kreis|dreieck|quadrat/i.test(w)).length === r.reihe.length + (r.fehlt ? 1 : 0)), 'Reihe und Aufnahme passen nicht');

  // 2. Runde 1 nachlegen: vier Plätze unter der Vorlage, vier Teile
  speicher.schreiben('spieleAus', []);
  einstellungenLaden();
  spieleZeigen();
  const kachel = $('#home .spiel-btn[data-spiel="muster"]');
  pruefe(!kachel.hidden, 'Kachel fehlt');
  kachel.click();
  pruefe(aktiv('muster'), 'Spiel nicht geöffnet');
  await bereit();
  pruefe(mu.vorlage.length === 4 && mu.ziele.length === 4 && mu.teile.length === 4 && zuletzt() === 'muster-nachlegen', `Start: ${gesagt}`);
  pruefe(!/[A-Za-zÄÖÜäöüß0-9]/.test($('#muster').innerText), `Text auf dem Kinder-Bildschirm: ${$('#muster').innerText}`);
  // falsches Teil auf Platz 1 (unter dem Kreis): gleitet zurück
  await schieben(los('dreieck'), mu.ziele[0]);
  pruefe(!mu.ziele[0].belegt && mu.teile.every((t) => !t.drin), 'Falsches Teil bleibt liegen');
  for (const z of mu.ziele) await schieben(los(z.form), z);
  await bis(() => mu.runde === 1 && !mu.gesperrt);
  pruefe(gesagt.includes('muster-voll-1') && zuletzt() === 'muster-reihe-2', `Runde 1 fertig: ${gesagt.slice(-3)}`);

  // 3. Runde 2 weiterlegen: eine Lücke; falsch → zurück, Reihe nochmal; 2. Mal Hinweis; 3. Mal legt die App
  pruefe(mu.ziele.length === 1 && mu.teile.length === 2, 'Runde 2: nicht eine Lücke und zwei Teile');
  const ziel = mu.ziele[0];
  const falsch = mu.teile.find((t) => t.form !== ziel.form);
  await schieben(falsch, ziel);
  await bis(() => !mu.gesperrt && gesagt.filter((g) => g === 'muster-reihe-2').length === 2);
  pruefe(!ziel.belegt && gesagt.filter((g) => g === 'muster-reihe-2').length === 2, 'Falsch: Reihe nicht nochmal');
  await schieben(falsch, ziel);
  await bis(() => !mu.gesperrt);
  pruefe(los(ziel.form).el.classList.contains('hinweis'), '2. Mal: passendes Teil leuchtet nicht');
  await schieben(falsch, ziel);
  await bis(() => mu.runde === 2);
  pruefe(gesagt.includes('muster-voll-2') && !gesagt.some((g) => /falsch|nein/.test(g)), '3. Mal: App legt nicht');

  // 4. Runden 3–5 richtig, dann Auftrag
  for (let r = 2; r < MUSTER_RUNDEN.length; r++) {
    await bis(() => mu.runde === r && !mu.gesperrt);
    if (r === 4) pruefe(mu.teile.length === 3 && mu.ziele[0].form === 'quadrat', 'ABC-Runde nicht mit drei Formen');
    await schieben(los(mu.ziele[0].form), mu.ziele[0]);
  }
  await bis(() => mu.inEcht && !$('#btn-muster-daumen').hidden);
  const welt = gesagt.slice(gesagt.lastIndexOf('muster-voll-5'));
  pruefe(welt.join() === 'muster-voll-5,jetzt-in-echt,muster-welt', `Auftrag: ${welt}`);
  $('#btn-muster-daumen').click();
  await bis(() => $('#muster .spiel-ende') && !$('#muster .spiel-ende').hidden);
  pruefe(gesagt.slice(-2).join() === 'zeig-mal,muster-welt-fertig', `Schluss: ${gesagt.slice(-2)}`);

  // 5. Anordnung (Runde 1: zwei Reihen und Vorrat) im Bild, ohne Überlappen
  $('#muster .ende-nochmal').click();
  await bereit();
  const feldR = $('#muster-feld').getBoundingClientRect();
  const alle = [...mu.vorlage.map((v) => v.el), ...mu.ziele.map((z) => z.el), ...mu.teile.map((t) => t.el)].map((e) => e.getBoundingClientRect());
  pruefe(alle.every((r) => r.left >= feldR.left - 1 && r.right <= feldR.right + 1 && r.top >= feldR.top - 1 && r.bottom <= feldR.bottom + 1), 'Etwas ragt heraus');
  pruefe(!alle.some((a, i) => alle.some((b, k) => k > i && a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1)), 'Teile überlappen');
  const vorratBreiten = mu.teile.map((t) => Math.round(t.el.getBoundingClientRect().width));
  pruefe(vorratBreiten.every((b) => b >= 72 && b >= mu.mass.S), `Lose Teile zu klein: ${vorratBreiten} (Reihe ${Math.round(mu.mass.S)})`);

  // 6. Schnelles Hin-und-her: nach dem 3. Fehlversuch legt die App nach 450 ms selbst – legt das Kind in dieser Zeit
  // das andere passende Teil auf denselben Platz, dürfen dort nicht zwei liegen, und die Runde muss fertig werden
  musterStoppen();
  mu.runde = 0;
  muRundenZeichnen();
  musterNeueRunde();
  await bereit();
  const z0 = mu.ziele[0];
  const fremd = mu.teile.find((t) => t.form !== z0.form);
  for (let i = 0; i < 3; i++) await schieben(fremd, z0);
  const zweites = mu.teile.filter((t) => !t.drin && t.form === z0.form)[1];
  { // sofort, ohne die 350 ms Wartezeit von schieben()
    const von = mitte(zweites.el), z = mitte(z0.el);
    ev(zweites.el, 'pointerdown', von);
    for (let i = 1; i <= 6; i++) ev(document, 'pointermove', { x: von.x + ((z.x - von.x) * i) / 6, y: von.y + ((z.y + 30 - von.y) * i) / 6 });
    ev(document, 'pointerup', { x: z.x, y: z.y + 30 });
  }
  await warte(700);
  const aufZ0 = mu.teile.filter((t) => t.drin === z0).length;
  pruefe(aufZ0 <= 1, `Schnell nach 3. Versuch: ${aufZ0} Teile auf einem Platz`);
  const eingelegt = mu.teile.find((t) => t.drin === z0);
  pruefe(eingelegt && Math.abs(eingelegt.el.getBoundingClientRect().width - mu.mass.S) < 1.5, `Eingelegtes Teil nicht so groß wie die Reihe: ${eingelegt && eingelegt.el.getBoundingClientRect().width} statt ${mu.mass.S}`);
  for (const z of mu.ziele.filter((x) => !x.belegt)) { if (los(z.form)) await schieben(los(z.form), z); }
  await bis(() => mu.runde === 1, 3000);
  pruefe(mu.runde === 1, `Schnell nach 3. Versuch: Runde bleibt hängen (frei: ${mu.ziele.filter((x) => !x.belegt).map((x) => x.form)}, Vorrat: ${mu.teile.filter((t) => !t.drin).map((t) => t.form)})`);

  // 7. Hand: zweimal nur angetippt → die Hand schiebt das Teil ein Stück zur Lücke und zurück;
  // lange nichts versucht: 2. Erinnerung Hand, 3. die App legt selbst
  musterStoppen();
  mu.runde = 1;
  muRundenZeichnen();
  musterNeueRunde();
  await bereit();
  const t7 = los(mu.ziele[0].form);
  const antippen = async (t) => { await warte(350); const p = mitte(t.el); ev(t.el, 'pointerdown', p); ev(document, 'pointerup', p); await warte(30); };
  await antippen(t7);
  pruefe(!$('#muster-feld .zeige-hand'), '1. Antippen: schon die Hand');
  await antippen(t7);
  pruefe($('#muster-feld .zeige-hand') && mu.gesperrt, '2. Antippen: keine Hand');
  await bis(() => !$('#muster-feld .zeige-hand') && !mu.gesperrt);
  pruefe(!t7.drin && t7.x === t7.heim[0] && t7.y === t7.heim[1], 'Nach der Hand nicht zurück');
  MUSTER_ZEIT.hilfe = 150;
  muHilfeAbwarten(mu.nummer);
  await bis(() => $('#muster-feld .zeige-hand'), 4000);
  pruefe(mu.hilfen === 2, `Hand nicht bei der 2. Erinnerung (${mu.hilfen})`);
  await bis(() => mu.runde === 2, 6000);
  MUSTER_ZEIT.hilfe = 12000;
  pruefe(mu.runde === 2, '3. Erinnerung: App legt nicht selbst');

  // 8. Kurzfassung (je Kind): nur nachlegen, dann der Auftrag
  zustand.kurz = true;
  const n8 = gesagt.length;
  musterNeu();
  await bis(() => gesagt.length > n8 && !mu.gesperrt);
  pruefe(document.querySelectorAll('#muster-runden .gruppe span').length === 1, 'Kurzfassung: nicht ein Runden-Punkt');
  for (const z of mu.ziele) await schieben(los(z.form), z);
  await bis(() => mu.inEcht, 4000);
  pruefe(mu.inEcht && mu.runde === 1, `Kurzfassung: kein Auftrag nach dem Nachlegen (Runde ${mu.runde})`);
  zustand.kurz = false;
  musterNeu();

  // 9. Nachlegen schon während „Leg das Muster genauso darunter!“; Ansagen nie übereinander
  const echt = folgeAbspielen, echtZ = zaehlenMitLeuchten;
  let spricht = 0, zugleich = false;
  const lange = async (name) => { if (spricht) zugleich = true; spricht++; gesagt.push(name); await warte(900); spricht--; };
  folgeAbspielen = (folge) => lange(folge[0].url.replace('audio/ansage-', '').replace('.wav', ''));
  zaehlenMitLeuchten = (name) => lange(name);
  const n9 = gesagt.length;
  musterNeu();
  await warte(400);
  pruefe(!mu.gesperrt && spricht === 1, 'Während „Leg das Muster …“ gesperrt');
  await schieben(los(mu.ziele[0].form), mu.ziele[0]);
  pruefe(mu.ziele[0].belegt && spricht === 1, 'Während der Ansage nicht gelegt');
  for (const z of mu.ziele.filter((x) => !x.belegt)) await schieben(los(z.form), z);
  await bis(() => gesagt.slice(n9).includes('muster-voll-1'), 6000);
  pruefe(gesagt.slice(n9, n9 + 2).join() === 'muster-nachlegen,muster-voll-1' && !zugleich, `Nacheinander: ${gesagt.slice(n9)}, zugleich ${zugleich}`);
  folgeAbspielen = echt;
  zaehlenMitLeuchten = echtZ;
  await bis(() => !mu.offen, 4000);

  // Ansicht: Runde 5 (ABC), das passende Teil leuchtet
  musterStoppen();
  mu.runde = 4;
  muRundenZeichnen();
  musterNeueRunde();
  await bereit();
  los('quadrat').el.classList.add('hinweis');

  const d = document.createElement('div');
  d.style.cssText = 'position:fixed;left:0;right:0;bottom:0;color:#fff;font:12px monospace;padding:6px;z-index:9;background:'
    + (fehler.length ? '#c62828' : '#1b7f3a');
  d.textContent = fehler.length ? 'FEHLER: ' + fehler.join(' | ') : 'MUSTER OK';
  document.body.appendChild(d);
})().catch((e) => {
  document.body.insertAdjacentHTML('beforeend', `<div style="position:fixed;bottom:0;background:#c62828;color:#fff;padding:6px;z-index:9">ABSTURZ: ${e}</div>`);
});
