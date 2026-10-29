// Testet „Klatsch – Stampf“: Reihe mit Lücke wird vorgespielt (jedes Bild leuchtet, mit Klang), 👏/🦶 tippen; passt:
// ganze Reihe; passt nicht: blass + wackeln, Reihe nochmal, 2. Mal leuchtet der richtige Knopf, 3. Mal setzt die App
// ein; Doppeltipps zählen nicht; vier Runden (AB, BA, AAB, ABB); Auftrag mit Mitmachen; kein Text. Frisches Profil.
// Ansicht am Ende: Runde 3 mit leuchtendem Hinweis-Knopf.
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
  const klaenge = [];
  folgeAbspielen = async (folge) => { gesagt.push(...folge.map((q) => q.url.replace('audio/ansage-', '').replace('.wav', ''))); await warte(5); };
  zaehlenMitLeuchten = async (name, el, beiJedem) => { gesagt.push(name); el.forEach((e, i) => { e.classList.add('leuchtet'); if (beiJedem) beiJedem(i); }); await warte(5); };
  klKlang = (art) => klaenge.push(art);
  Object.assign(KLATSCH_ZEIT, { nochmal: 6000, pause: 20, daumen: 100, auftragNochmal: 3000 });
  const zuletzt = () => gesagt[gesagt.length - 1];
  const knopf = (art) => $(`#klatsch-feld .klatsch-knopf[data-art="${art}"]`);
  const bereit = () => bis(() => !kl.gesperrt);
  const tipp = async (art) => { await warte(420); knopf(art).click(); await warte(30); };

  // 1. Ansagen: Reihen als ganze Aufnahme, letzter Satz ist ein eigener Schritt
  pruefe(ANSAGEN['klatsch-reihe-1'][0] === 'Klatsch, stampf, klatsch, stampf. Und dann?'
    && ANSAGEN['klatsch-voll-4'][0] === 'Klatsch, stampf, stampf, klatsch, stampf, stampf. Ein Muster!', 'Ansagen');
  pruefe(KLATSCH_RUNDEN.every((r, i) => ANSAGEN[`klatsch-reihe-${i + 1}`][0].split(/[,.]/).filter((w) => /klatsch|stampf/i.test(w)).length === r.reihe.length), 'Reihe und Aufnahme passen nicht');

  // 2. Runde 1: Reihe vorgespielt (Bilder leuchten mit Klang), dann warten auf das Kind
  speicher.schreiben('spieleAus', []);
  einstellungenLaden();
  spieleZeigen();
  const kachel = $('#home .spiel-btn[data-spiel="klatsch"]');
  pruefe(!kachel.hidden, 'Kachel fehlt');
  kachel.click();
  pruefe(aktiv('klatsch'), 'Spiel nicht geöffnet');
  await bereit();
  pruefe(zuletzt() === 'klatsch-reihe-1' && klaenge.join('') === 'ksks', `Vorspielen: ${gesagt} / ${klaenge}`);
  pruefe(document.querySelectorAll('#klatsch-feld .klatsch-bild').length === 5 && $('#klatsch-feld .luecke'), 'Reihe mit Lücke fehlt');
  pruefe(!/[A-Za-zÄÖÜäöüß0-9]/.test($('#klatsch').innerText), `Text auf dem Kinder-Bildschirm: ${$('#klatsch').innerText}`);

  // 3. Passt nicht (🦶): blass, wackelt, Reihe nochmal; 2. Mal: Hinweis-Knopf; Doppeltipp zählt nicht
  await tipp('s');
  pruefe($('#klatsch-feld .luecke').classList.contains('blass'), 'Falsches Bild nicht blass');
  await bis(() => kl.versuche === 1 && !kl.gesperrt);
  pruefe(gesagt.filter((g) => g === 'klatsch-reihe-1').length === 2 && !$('#klatsch-feld .luecke').textContent, 'Nach Fehlgriff Reihe nicht nochmal / Lücke nicht leer');
  await tipp('s');
  knopf('s').click();   // Doppeltipp
  await bis(() => kl.versuche >= 2 && !kl.gesperrt);
  pruefe(kl.versuche === 2 && knopf('k').classList.contains('hinweis'), `2. Mal: Hinweis fehlt / Doppeltipp gezählt (${kl.versuche})`);
  // 4. Richtig (👏): ganze Reihe, nächste Runde
  await tipp('k');
  await bis(() => kl.runde === 1 && !kl.gesperrt);
  pruefe(gesagt[gesagt.indexOf('klatsch-voll-1') - 1] === 'klatsch-mach-mit', '„Mach mit!“ fehlt vor der ganzen Reihe');
  pruefe(gesagt.includes('klatsch-voll-1') && zuletzt() === 'klatsch-reihe-2' && !gesagt.some((g) => /falsch|nein/.test(g)), `Runde 2: ${gesagt.slice(-3)}`);

  // 5. Runde 2 richtig; Runde 3: dreimal falsch → App setzt ein
  await tipp('s');
  await bis(() => kl.runde === 2 && !kl.gesperrt);
  for (let i = 0; i < 3; i++) { await tipp('k'); await bis(() => !kl.gesperrt || kl.runde === 3); }
  await bis(() => kl.runde === 3);
  pruefe(gesagt.includes('klatsch-voll-3'), 'Nach drei Fehlgriffen nicht eingesetzt');

  // 6. Runde 4 richtig → Auftrag – 👍 – mitmachen – Ende
  await bereit();
  await tipp('s');
  await bis(() => kl.inEcht && !$('#btn-klatsch-daumen').hidden);
  pruefe(zuletzt() === 'klatsch-welt', `Auftrag: ${gesagt.slice(-3)}`);
  $('#btn-klatsch-daumen').click();
  await bis(() => $('#klatsch .spiel-ende') && !$('#klatsch .spiel-ende').hidden);
  pruefe(gesagt.slice(-3).join() === 'klatsch-welt-mit,klatsch-voll-1,klatsch-ende', `Schluss: ${gesagt.slice(-3)}`);

  // 7. Anordnung: Reihe und Knöpfe im Bild
  $('#klatsch .ende-nochmal').click();

  // 8. Ohne Antwort: die Reihe höchstens zweimal wiederholt, danach leuchtet still der passende Knopf;
  //    tippt weiter niemand, setzt die App selbst ein und es geht weiter
  Object.assign(KLATSCH_ZEIT, { nochmal: 100, selbst: 900 });
  klatschStoppen();
  kl.runde = 0;
  klRundenZeichnen();
  const n8 = gesagt.length;
  klatschNeueRunde();
  await bis(() => knopf('k').classList.contains('hinweis'), 4000);
  await warte(400);
  const reihen8 = gesagt.slice(n8).filter((g) => g === 'klatsch-reihe-1').length;
  pruefe(reihen8 === 3 && knopf('k').classList.contains('hinweis') && kl.runde === 0, `Ohne Antwort: ${reihen8}× vorgespielt, Hinweis ${knopf('k').classList.contains('hinweis')}`);
  await bis(() => kl.runde === 1, 4000);
  pruefe(kl.runde === 1 && gesagt.slice(n8).includes('klatsch-mach-mit') && klaenge.includes('k'), `Ohne Antwort setzt die App nicht selbst ein: ${gesagt.slice(n8)}`);
  klatschStoppen();
  Object.assign(KLATSCH_ZEIT, { nochmal: 6000, selbst: 10000 });

  // 9. Kurzfassung (je Kind): nur die zwei leichten Runden, dann der Auftrag
  zustand.kurz = true;
  const n9 = gesagt.length;
  klatschNeu();
  await bis(() => gesagt.length > n9 && !kl.gesperrt);
  pruefe(document.querySelectorAll('#klatsch-runden .gruppe span').length === 2, 'Kurzfassung: nicht zwei Runden-Punkte');
  await tipp('k');
  await bis(() => kl.runde === 1 && !kl.gesperrt);
  await tipp('s');
  await bis(() => kl.inEcht, 4000);
  pruefe(kl.inEcht && kl.runde === 2, `Kurzfassung: kein Auftrag nach zwei Runden (Runde ${kl.runde})`);
  zustand.kurz = false;
  klatschNeu();

  klatschStoppen();
  kl.runde = 2;
  klRundenZeichnen();
  klatschNeueRunde();
  await bereit();
  const feldR = $('#klatsch-feld').getBoundingClientRect();
  const teile = [...document.querySelectorAll('#klatsch-feld .klatsch-bild, #klatsch-feld .klatsch-knopf')].map((e) => e.getBoundingClientRect());
  pruefe(teile.every((r) => r.left >= feldR.left - 1 && r.right <= feldR.right + 1 && r.top >= feldR.top - 1 && r.bottom <= feldR.bottom + 1), 'Etwas ragt heraus');
  knopf('s').classList.add('hinweis');

  const d = document.createElement('div');
  d.style.cssText = 'position:fixed;left:0;right:0;bottom:0;color:#fff;font:12px monospace;padding:6px;z-index:9;background:'
    + (fehler.length ? '#c62828' : '#1b7f3a');
  d.textContent = fehler.length ? 'FEHLER: ' + fehler.join(' | ') : 'KLATSCH OK';
  document.body.appendChild(d);
})().catch((e) => {
  document.body.insertAdjacentHTML('beforeend', `<div style="position:fixed;bottom:0;background:#c62828;color:#fff;padding:6px;z-index:9">ABSTURZ: ${e}</div>`);
});
