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
  Object.assign(PASST_ZEIT, { rundenPause: 30, vormachen: 30, daumen: 100, auftragNochmal: 3000 });
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

  // 4. Richtig einsetzen: rastet ein; Runde fertig → „Alles passt!“, Runde 2
  await schieben(teil('quadrat'), mitte(mulde('quadrat').el));
  pruefe(teil('quadrat').drin, 'Quadrat rastet nicht ein');
  await schieben(teil('dreieck'), mitte(mulde('dreieck').el));
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

  // Ansicht: Runde 3, ein Einsatz drin
  $('#passt .ende-nochmal').click();
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
