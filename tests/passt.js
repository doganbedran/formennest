// Testet „Passt rein“: drei Mulden und drei Einsätze (gleiche Farbe, etwa gleiche Fläche), Einsatz rastet nur in der
// eigenen Mulde ein, falsche Mulde: wackelt und bleibt daneben (nicht auf dem Brett), 2. Versuch: Mulde leuchtet,
// 3. Versuch: gleitet von selbst hinein; Runde 3 gedreht (Quadrat nur wenig); Auftrag „Such etwas Rundes“; kein Text.
// Frisches Profil. Ansicht am Ende: Runde 3, ein Einsatz drin.
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
  Object.assign(PASST_ZEIT, { rundenPause: 30, vormachen: 30, rundherum: 30, daumen: 100, auftragNochmal: 3000 });
  const zuletzt = () => gesagt[gesagt.length - 1];
  const mitte = (el) => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; };
  const ev = (el, typ, p) => el.dispatchEvent(new PointerEvent(typ, { bubbles: true, pointerId: 1, isPrimary: true, clientX: p.x, clientY: p.y }));
  // Einsatz zur Mitte eines Ziels schieben (er sitzt 30 px über dem Finger); vorher Übergänge abwarten
  const schieben = async (t, ziel) => {
    await warte(350);
    const von = mitte(t.el);
    ev(t.el, 'pointerdown', von);
    for (let i = 1; i <= 6; i++) ev(document, 'pointermove', { x: von.x + ((ziel.x - von.x) * i) / 6, y: von.y + ((ziel.y + 30 - von.y) * i) / 6 });
    ev(document, 'pointerup', { x: ziel.x, y: ziel.y + 30 });
    await warte(30);
  };
  // Runde 1: die eingesetzte Form einmal umfahren (Finger fährt den Umriss entlang)
  const umfahren = async () => {
    await bis(() => pa.umfahren && pa.umfahren.bereit);
    await warte(400);   // Ansicht ploppt erst auf
    const u = pa.umfahren, p = u.bildschirm();
    ev(u.box, 'pointerdown', { x: p[0][0], y: p[0][1] });
    p.forEach(([x, y]) => ev(u.box, 'pointermove', { x, y }));
    ev(u.box, 'pointerup', { x: p[0][0], y: p[0][1] });
    await bis(() => !pa.umfahren);
  };
  const teil = (form) => pa.teile.find((t) => t.form === form);
  const mulde = (form) => pa.mulden.find((m) => m.form === form);
  const andere = (form) => pa.mulden.find((m) => m.form !== form && !m.belegt);

  // 1. Start: Kachel im Start-Regal, drei Mulden, drei Einsätze
  pruefe(JSON.stringify(START_REGAL) === '["passt"]', 'Passt rein nicht im Start-Regal');
  const kachel = $('#home .spiel-btn[data-spiel="passt"]');
  pruefe(!kachel.hidden && kachel.querySelector('svg'), 'Kachel fehlt');
  kachel.click();
  pruefe(aktiv('passt'), 'Spiel nicht geöffnet');
  await bis(() => !pa.gesperrt);
  pruefe(pa.mulden.length === 3 && pa.teile.length === 3 && zuletzt() === 'passt-start', `Start: ${gesagt}`);
  pruefe(!/[A-Za-zÄÖÜäöüß0-9]/.test($('#passt').innerText), `Text auf dem Kinder-Bildschirm: ${$('#passt').innerText}`);
  // gleiche Farbe aller Einsätze, Mulden deutlich dunkler
  const farben = new Set(pa.teile.map((t) => t.el.querySelector('svg [fill]').getAttribute('fill')));
  pruefe(farben.size === 1, `Einsätze nicht gleichfarbig: ${[...farben]}`);
  pruefe(pa.teile.every((t, i) => pa.mulden[i].form !== t.form), 'Einsatz liegt genau unter seiner Mulde');

  // 2. Antippen: nichts; falsche Mulde: wackelt, bleibt daneben (nicht auf dem Brett); 2. Mal: Mulde leuchtet
  const k = teil('kreis');
  ev(k.el, 'pointerdown', mitte(k.el)); ev(document, 'pointerup', mitte(k.el));
  await warte(50);
  pruefe(!k.drin, 'Antippen setzt ein');
  await schieben(k, mitte(andere('kreis').el));
  const brettR = $('#passt-feld .brett').getBoundingClientRect(), kR = k.el.getBoundingClientRect();
  const aufBrett = kR.left < brettR.right && brettR.left < kR.right && kR.top < brettR.bottom && brettR.top < kR.bottom;
  pruefe(!k.drin && !aufBrett && k.el.classList.contains('wackelt'), 'Falsche Mulde nimmt an oder Einsatz bleibt auf dem Brett');
  pruefe(!gesagt.some((g) => /falsch|nein/.test(g)), 'Etwas wie „falsch“ gesagt');
  await schieben(k, mitte(andere('kreis').el));
  pruefe(mulde('kreis').el.classList.contains('hinweis'), 'Nach 2 Versuchen leuchtet die richtige Mulde nicht');
  // 3. Mal: gleitet von selbst hinein
  await schieben(k, mitte(andere('kreis').el));
  await bis(() => k.drin);
  pruefe(k.drin === mulde('kreis') && !mulde('kreis').el.classList.contains('hinweis'), 'Nach 3 Versuchen nicht von selbst eingesetzt');

  // 3a. Umfahren (Runde 1): groß, ohne Startpunkt/Pfeile; halb herum reicht nicht, gut zwei Drittel schon
  await bis(() => pa.umfahren && pa.umfahren.bereit);
  await warte(400);
  pruefe(zuletzt() === 'passt-rundherum' && $('#passt-feld .umfahren svg').getBoundingClientRect().width > 150, 'Umfahren: nicht groß angezeigt');
  pruefe(!/[A-Za-zÄÖÜäöüß0-9]/.test($('#passt').innerText), 'Umfahren: Text auf dem Bildschirm');
  {
    const u = pa.umfahren, p = u.bildschirm();
    ev(u.box, 'pointerdown', { x: p[0][0], y: p[0][1] });
    p.slice(0, Math.floor(p.length / 2)).forEach(([x, y]) => ev(u.box, 'pointermove', { x, y }));
    ev(u.box, 'pointerup', { x: 0, y: 0 });
    await warte(100);
    pruefe(pa.umfahren && !u.fertig, 'Umfahren: halb herum zählt schon');
    // weiter, nach dem Absetzen (kein Neuanfang nötig)
    ev(u.box, 'pointerdown', { x: p[Math.floor(p.length / 2)][0], y: p[Math.floor(p.length / 2)][1] });
    p.slice(Math.floor(p.length / 2), Math.floor(p.length * 0.8)).forEach(([x, y]) => ev(u.box, 'pointermove', { x, y }));
    ev(u.box, 'pointerup', { x: 0, y: 0 });
    await bis(() => !pa.umfahren);
    pruefe(gesagt.includes('passt-rund-kreis') && !pa.umfahren && !$('#passt-feld .umfahren'), `Umfahren: nicht fertig nach 80 % (${gesagt.slice(-2)})`);
  }

  // 4. Richtig einsetzen: rastet ein; Runde fertig → „Alles passt!“, Runde 2
  await schieben(teil('quadrat'), mitte(mulde('quadrat').el));
  pruefe(teil('quadrat').drin, 'Quadrat rastet nicht ein');
  // Ecken leuchten beim Umfahren auf
  await bis(() => pa.umfahren && pa.umfahren.bereit);
  const uq = pa.umfahren;
  await umfahren();
  pruefe(uq.ecken.size === 4 && uq.box.querySelectorAll('.umfahren-ecke.leuchtet').length === 4, `Quadrat: Ecken nicht gespürt (${uq.ecken.size})`);
  await schieben(teil('dreieck'), mitte(mulde('dreieck').el));
  await umfahren();
  await bis(() => pa.runde === 1 && !pa.gesperrt);
  pruefe(gesagt.includes('passt-fertig') && zuletzt() === 'passt-start', `Runde 1 fertig: ${gesagt.slice(-3)}`);

  // 5. Runde 2 und 3 (3: gedreht, Quadrat höchstens 15°), eingesetzte Teile übernehmen die Drehung
  for (const f of PASST_FORMEN) await schieben(teil(f), mitte(mulde(f).el));
  await bis(() => pa.runde === 2 && !pa.gesperrt);
  pruefe(mulde('dreieck').drehung > 0 && mulde('quadrat').drehung > 0 && mulde('quadrat').drehung <= 15, 'Runde 3 nicht (passend) gedreht');
  await schieben(teil('dreieck'), mitte(mulde('dreieck').el));
  pruefe(teil('dreieck').el.querySelector('.einsatz-bild').style.transform.includes(`${mulde('dreieck').drehung}deg`), 'Einsatz übernimmt die Drehung nicht');

  // 6. Anordnung: alles im Bild, Einsätze überlappen nicht mit dem Brett (solange sie lose sind)
  const feldR = $('#passt-feld').getBoundingClientRect();
  const alle = [...pa.mulden.map((m) => m.el), ...pa.teile.map((t) => t.el)].map((el) => el.getBoundingClientRect());
  pruefe(alle.every((r) => r.left >= feldR.left - 1 && r.right <= feldR.right + 1 && r.top >= feldR.top - 1 && r.bottom <= feldR.bottom + 1), 'Etwas ragt heraus');
  const brett2 = $('#passt-feld .brett').getBoundingClientRect();
  pruefe(pa.teile.filter((t) => !t.drin).every((t) => { const r = t.el.getBoundingClientRect(); return !(r.left < brett2.right && brett2.left < r.right && r.top < brett2.bottom && brett2.top < r.bottom); }),
    'Lose Einsätze liegen auf dem Brett');

  // 7. Rest einsetzen → Auftrag: vormachen – „Jetzt in echt!“ – „Such etwas Rundes …“ – 👍 – Ende
  for (const f of ['kreis', 'quadrat']) await schieben(teil(f), mitte(mulde(f).el));
  await bis(() => pa.inEcht && !$('#btn-passt-daumen').hidden);
  const welt = gesagt.slice(gesagt.lastIndexOf('passt-fertig'));
  pruefe(welt.join() === 'passt-fertig,passt-welt-vor,jetzt-in-echt,passt-welt', `Auftrag: ${welt}`);
  $('#btn-passt-daumen').click();
  await bis(() => $('#passt .spiel-ende') && !$('#passt .spiel-ende').hidden);
  pruefe(gesagt.slice(-2).join() === 'passt-welt-zeig,passt-welt-fertig', `Schluss: ${gesagt.slice(-2)}`);

  // 8. Nach dem 3. Fehlversuch gleitet der Einsatz nach 450 ms selbst hinein – hält das Kind ihn genau dann schon
  // wieder fest und zieht weiter, muss er trotzdem in der Mulde sitzen (nicht „drin“ zählen und daneben liegen)
  $('#passt .ende-nochmal').click();
  await bis(() => !pa.gesperrt);
  const k2 = teil('kreis');
  for (let i = 0; i < 3; i++) await schieben(k2, mitte(andere('kreis').el));
  const von2 = mitte(k2.el);
  ev(k2.el, 'pointerdown', von2);
  ev(document, 'pointermove', { x: von2.x + 20, y: von2.y + 20 });
  await warte(600);
  ev(document, 'pointermove', { x: von2.x + 40, y: von2.y + 60 });
  ev(document, 'pointerup', { x: von2.x + 40, y: von2.y + 60 });
  await warte(50);
  const daneben = k2.drin ? Math.round(Math.hypot(k2.x - k2.drin.x, k2.y - k2.drin.y)) : 0;
  pruefe(!pa.ziehen && daneben < 2, `Festgehalten beim Selbst-Einsetzen: zählt als drin, liegt aber ${daneben} px neben der Mulde`);

  // 9. Hand: zweimal nur angetippt → die Hand schiebt den Einsatz ein Stück zur Mulde und wieder zurück;
  // lange nichts versucht: 1. Erinnerung hüpft, 2. Hand, 3. die App setzt selbst ein
  passtNeu();
  passtStoppen();
  paRundenZeichnen();
  passtNeueRunde();
  await bis(() => !pa.gesperrt);
  const t9 = pa.teile[0], m9 = mulde(t9.form);
  const antippen = async (t) => { await warte(350); const p = mitte(t.el); ev(t.el, 'pointerdown', p); ev(document, 'pointerup', p); await warte(30); };
  await antippen(t9);
  pruefe(!$('#passt-feld .zeige-hand'), '1. Antippen: schon die Hand');
  await antippen(t9);
  pruefe($('#passt-feld .zeige-hand') && pa.gesperrt, '2. Antippen: keine Hand');
  const start9 = [t9.x, t9.y];
  await warte(900);
  pruefe(Math.hypot(t9.x - m9.x, t9.y - m9.y) < Math.hypot(start9[0] - m9.x, start9[1] - m9.y) - 20, 'Hand schiebt den Einsatz nicht zur Mulde');
  await bis(() => !$('#passt-feld .zeige-hand') && !pa.gesperrt);
  pruefe(!t9.drin && t9.x === start9[0] && t9.y === start9[1], 'Nach der Hand nicht zurück');
  const n9 = gesagt.length;
  PASST_ZEIT.hilfe = 150;
  paHilfeAbwarten(pa.nummer);
  await bis(() => $('#passt-feld .zeige-hand'), 4000);
  pruefe(pa.hilfen === 2, `Hand nicht bei der 2. Erinnerung (${pa.hilfen})`);
  await bis(() => pa.teile.some((t) => t.drin), 6000);
  PASST_ZEIT.hilfe = 12000;
  const hilfen9 = gesagt.slice(n9).filter((g) => g === 'passt-hilfe').length;
  pruefe(pa.teile.filter((t) => t.drin).length === 1 && hilfen9 === 3, `3. Erinnerung: nicht selbst eingesetzt (${hilfen9} Erinnerungen)`);

  // 10. Umfahren, lange nichts: 1. die Hand fährt einmal herum, 2. die App fährt selbst herum – weiter
  PASST_ZEIT.umfahrenHilfe = 150;
  await bis(() => $('#passt-feld .umfahren-hand'), 14000);
  pruefe($('#passt-feld .umfahren-hand') && pa.umfahren && pa.umfahren.besucht.size === 0, 'Umfahren: Hand fehlt oder zählt schon');
  await bis(() => !pa.umfahren && !pa.gesperrt, 12000);
  PASST_ZEIT.umfahrenHilfe = 10000;
  pruefe(!pa.umfahren && gesagt.some((g) => g.startsWith('passt-rund-')), 'Umfahren: App fährt nicht selbst herum');

  // 11. Kurzfassung: nur der Kreis wird umfahren
  zustand.kurz = true;
  passtNeu();
  await bis(() => !pa.gesperrt);
  const fq = teil('quadrat');
  await schieben(fq, mitte(mulde('quadrat').el));
  await warte(300);
  pruefe(fq.drin && !pa.umfahren, 'Kurzfassung: Quadrat wird umfahren');
  await schieben(teil('kreis'), mitte(mulde('kreis').el));
  await bis(() => pa.umfahren, 2000);
  pruefe(pa.umfahren && pa.umfahren.form === 'kreis', 'Kurzfassung: Kreis wird nicht umfahren');
  zustand.kurz = false;

  // Ansicht: Runde 3, ein Einsatz drin
  passtNeu();
  passtStoppen();
  pa.runde = 2;
  paRundenZeichnen();
  passtNeueRunde();
  await bis(() => !pa.gesperrt);
  paEinsetzen(teil('dreieck'), mulde('dreieck'));
  await warte(500);

  const d = document.createElement('div');
  d.style.cssText = 'position:fixed;left:0;right:0;bottom:0;color:#fff;font:12px monospace;padding:6px;z-index:9;background:'
    + (fehler.length ? '#c62828' : '#1b7f3a');
  d.textContent = fehler.length ? 'FEHLER: ' + fehler.join(' | ') : 'PASST OK';
  document.body.appendChild(d);
})().catch((e) => {
  document.body.insertAdjacentHTML('beforeend', `<div style="position:fixed;bottom:0;background:#c62828;color:#fff;padding:6px;z-index:9">ABSTURZ: ${e}</div>`);
});
