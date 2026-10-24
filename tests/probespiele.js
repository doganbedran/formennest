// Nur für Tests: Formennest hat noch keine (oder wenige) Spiele. probeSpiele(['a', 'b']) legt vorgetäuschte Spiele an:
// im Regal (erstes = Start-Regal, wenn es keins gibt), mit Kachel auf der Startseite; der Start wird in probeGestartet notiert.
const probeGestartet = [];
function probeSpiele(ids) {
  ids.forEach((id) => {
    if (ALLE_SPIELE.includes(id)) return;
    ALLE_SPIELE.push(id);
    if (!START_REGAL.length) START_REGAL.push(id); else START_AUS.push(id);
    SPIEL_INFO[id] = `Probespiel ${id}`;
    SPIELE[id] = () => probeGestartet.push(id);
    const btn = document.createElement('button');
    btn.className = 'spiel-btn';
    btn.dataset.spiel = id;
    btn.setAttribute('aria-label', id);
    btn.textContent = '🔷';
    btn.addEventListener('click', () => spielStarten(id));
    $('#home .spiele-raster').appendChild(btn);
  });
  einstellungenLaden();
  spieleZeigen();
}
