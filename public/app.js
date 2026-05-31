const navSearch = document.getElementById('navSearch');
const navResults = document.getElementById('navResults');
const homeSection = document.getElementById('home');
const detailSection = document.getElementById('detail');
const detailContent = document.getElementById('detailContent');
const featuredGrid = document.getElementById('featuredGrid');
const themeBtn = document.getElementById('themeBtn');

let searchTimeout, currentSearch = '';
let btcPrice = 0, ethPrice = 0;

const POPULAR_IDS = [730, 570, 440, 550, 578080, 1599340, 236390, 252490, 1172470, 108600, 271590, 431960, 413150, 105600, 322330, 291550, 49520, 232050, 250900, 1222670, 1091500, 238960, 892970, 1151340, 367520, 427520, 945360, 289070, 444200, 1238810, 648800, 386360, 359550, 346110, 1517290, 275850, 377160, 990080, 2050650, 1446780, 1245620, 553850, 381210, 883710, 437530, 814380, 2357570, 2823260];

// Theme
themeBtn.addEventListener('click', () => {
  document.body.classList.toggle('light');
  themeBtn.textContent = document.body.classList.contains('light') ? '☀️' : '🌙';
});

async function loadCryptoPrices() {
  try {
    const data = await fetchJson('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=eur');
    btcPrice = data.bitcoin?.eur || 0;
    ethPrice = data.ethereum?.eur || 0;
  } catch {}
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function translateFr(text) {
  if (!text || text.length > 5000) return text;
  try {
    const data = await fetchJson(`/api/translate?text=${encodeURIComponent(text.slice(0, 5000))}`);
    return data.text || text;
  } catch { return text; }
}

function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

// Search
function debounceSearch(input, resultsDiv) {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => {
    const q = input.value.trim();
    if (q.length < 2 || q === currentSearch) return;
    currentSearch = q;
    doSearch(q, resultsDiv);
  }, 300);
}

navSearch.addEventListener('input', () => debounceSearch(navSearch, navResults));
navSearch.addEventListener('blur', () => setTimeout(() => navResults.classList.remove('show'), 200));
navSearch.addEventListener('focus', () => { if (navResults.children.length > 0) navResults.classList.add('show'); });

async function doSearch(query, resultsDiv) {
  resultsDiv.innerHTML = '<div class="search-item" style="color:var(--text-muted)">Recherche...</div>';
  resultsDiv.classList.add('show');
  try {
    const data = await fetchJson(`/api/search?q=${encodeURIComponent(query)}`);
    if (data.error) throw new Error(data.error);
    resultsDiv.innerHTML = data.length
      ? data.map(a => `
        <div class="search-item" onclick="showDetail(${a.appid})">
          <img src="${a.tiny_image || 'https://steamcdn-a.akamaihd.net/steam/apps/'+a.appid+'/capsule_sm_120.jpg'}" alt="" loading="lazy" onerror="this.style.display='none'">
          <span class="si-name">${escapeHtml(a.name)}</span>
          <span class="si-id">#${a.appid}</span>
        </div>
      `).join('')
      : '<div class="search-item" style="color:var(--text-muted)">Aucun résultat</div>';
  } catch (err) {
    resultsDiv.innerHTML = '<div class="search-item" style="color:#ff5555">Erreur: ' + err.message + '</div>';
  }
}

// Detail view
async function showDetail(appId) {
  hideAllSections();
  detailSection.style.display = 'block';
  detailContent.innerHTML = '<div class="loading">Chargement...</div>';
  window.scrollTo({ top: 0 });

  try {
    const [app, players, achievements] = await Promise.all([
      fetchJson(`/api/app/${appId}`),
      fetchJson(`/api/players/${appId}`),
      fetchJson(`/api/achievements/${appId}`)
    ]);

    if (!app) throw new Error('Jeu introuvable');

    loadNews(appId);

    const name = escapeHtml(app.name);
    const header = app.header_image || '';

    const rawDesc = (app.short_description || app.about_the_game || '').replace(/<[^>]*>/g, '');
    const desc = await translateFr(rawDesc) || 'Aucune description';

    const price = app.price_overview || null;
    const genres = app.genres || [];
    const devs = app.developers || [];
    const pubs = app.publishers || [];
    const release = app.release_date?.date || 'N/A';
    const categories = app.categories || [];
    const playerCount = players?.response?.player_count ?? null;
    const achData = achievements?.achievementpercentages?.achievements || [];
    // Price
    let priceHtml = '<span class="text-muted">Gratuit</span>';
    let promoHtml = '';
    let cryptoHtml = '';
    const platforms = app.platforms || {};
    const reqs = app.pc_requirements || {};
    const metacritic = app.metacritic || null;
    const dlc = app.dlc || [];
    const screenshots = app.screenshots || [];
    const website = app.website || '';
    const support = app.support_info || {};
    const legal = app.legal_notice || '';
    if (price) {
      const final = (price.final / 100).toFixed(2);
      const initial = (price.initial / 100).toFixed(2);
      const pct = price.discount_percent;
      if (pct > 0) {
        priceHtml = `<span class="price-old">${initial}€</span> <span class="price-disc">-${pct}%</span> <span class="price-curr">${final}€</span>`;
        promoHtml = '<span class="promo-badge">PROMO</span>';
      } else {
        priceHtml = `<span class="price-curr">${final}€</span>`;
      }
      // Crypto prices
      if (btcPrice > 0) {
        const btc = (price.final / 100 / btcPrice).toFixed(8);
        const eth = (price.final / 100 / ethPrice).toFixed(6);
        cryptoHtml = `<div class="crypto-prices">₿ ${btc} BTC &nbsp;⟐ ${eth} ETH</div>`;
      }
    }

    const platHtml = ['windows', 'mac', 'linux'].filter(p => platforms[p]).map(p =>
      `<span class="plat-icon" title="${p}">${p === 'windows' ? '🪟' : p === 'mac' ? '🍎' : '🐧'}</span>`
    ).join('');

    const catHtml = categories.map(c => `<span class="tag">${escapeHtml(c.description)}</span>`).join('');

    const minReqHtml = reqs.minimum ? reqs.minimum.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]*>/g, '') : 'Non spécifiés';

    const topAch = achData
      .filter(a => a.percent != null && !isNaN(Number(a.percent)))
      .sort((a, b) => Number(b.percent) - Number(a.percent))
      .slice(0, 10);

    const fullDesc = await translateFr((app.about_the_game || app.detailed_description || '').replace(/<[^>]*>/g, '').slice(0, 5000));
    // Use server-side detected protections
    const drm = app._drm || [];
    const ac = app._ac || [];
    const drmHtml = drm.length
      ? drm.map(d => `<span class="tag-critical">🔒 ${escapeHtml(d)}</span>`).join('')
      : null;
    const acHtml = ac.length
      ? ac.map(a => `<span class="tag-critical">🛡️ ${escapeHtml(a)}</span>`).join('')
      : null;
    const protectedBadge = (drm.length || ac.length)
      ? '<span class="tag-protected">🛡️ Protégé</span>'
      : '';

    detailContent.innerHTML = `
      <div class="detail-header">
        <img src="${header}" alt="${name}" onerror="this.style.display='none'">
        <div class="dh-overlay">
          <h1>${name} <span class="app-id">#${appId}</span> ${protectedBadge}</h1>
          <div class="dh-meta">
            <span>📅 ${release}</span>
            ${devs.length ? `<span>👨‍💻 ${escapeHtml(devs.join(', '))}</span>` : ''}
            ${pubs.length ? `<span>🏢 ${escapeHtml(pubs.join(', '))}</span>` : ''}
            ${platHtml}
          </div>
        </div>
      </div>

      <div class="detail-grid-3">
        <div class="detail-card">
          <h3>💰 Prix ${promoHtml}</h3>
          <div class="dc-value">${priceHtml}</div>
          ${cryptoHtml}
        </div>
        <div class="detail-card">
          <h3>👥 Joueurs en ligne</h3>
          <div class="dc-value c-players">${playerCount !== null ? playerCount.toLocaleString() : 'N/A'}</div>
          <div class="dc-sub">en ce moment</div>
        </div>
        ${drmHtml ? `<div class="detail-card">
          <h3>🔒 DRM</h3>
          <div class="dc-tags">${drmHtml}</div>
        </div>` : ''}
        ${acHtml ? `<div class="detail-card">
          <h3>🛡️ Anti-Triche</h3>
          <div class="dc-tags">${acHtml}</div>
        </div>` : ''}
        ${metacritic ? `
        <div class="detail-card">
          <h3>🏆 Metacritic</h3>
          <div class="dc-value c-meta">${metacritic.score}</div>
        </div>` : ''}
        <div class="detail-card">
          <h3>🏷️ Catégories</h3>
          <div class="dc-tags">${catHtml}</div>
        </div>
        ${dlc.length > 0 ? `
        <div class="detail-card">
          <h3>📦 DLCs</h3>
          <div class="dc-value c-dlc">${dlc.length}</div>
          <div class="dc-sub">contenus additionnels</div>
        </div>` : ''}
      </div>

      ${screenshots.length ? `
      <div class="detail-section">
        <h3>📸 Captures d'écran</h3>
        <div class="screenshots">
          ${screenshots.slice(0, 6).map(s =>
            `<img src="${s.path_full}" alt="Screenshot" loading="lazy" onerror="this.style.display='none'" class="ss-img">`
          ).join('')}
        </div>
      </div>` : ''}

      ${fullDesc ? `
      <div class="detail-section">
        <h3>📖 Description</h3>
        <div class="desc-text">${fullDesc}</div>
      </div>` : ''}

      <div class="detail-section">
        <h3>💻 Configuration requise</h3>
        <pre class="req-text">${minReqHtml}</pre>
      </div>

      ${website ? `<div class="detail-section"><h3>🔗 Liens</h3><div class="links-list"><a href="${escapeHtml(website)}" target="_blank">Site officiel</a> • <a href="https://store.steampowered.com/app/${appId}" target="_blank">Page Steam</a> • <a href="https://steamcommunity.com/app/${appId}" target="_blank">Communauté Steam</a></div></div>` : ''}

      ${support.url || support.email ? `
      <div class="detail-section">
        <h3>🆘 Support</h3>
        <div class="links-list">
          ${support.url ? `<a href="${escapeHtml(support.url)}" target="_blank">Site support</a>` : ''}
          ${support.email ? `<span>Email: ${escapeHtml(support.email)}</span>` : ''}
        </div>
      </div>` : ''}

      ${legal ? `
      <div class="detail-section">
        <h3>⚖️ Mentions légales</h3>
        <p class="legal-text">${escapeHtml(legal)}</p>
      </div>` : ''}

      ${topAch.length ? `
      <div class="detail-section">
        <h3>🏅 Succès (${achData.length})</h3>
        <div class="ach-list">
          ${topAch.map(a => {
            const pct = Number(a.percent);
            return `
            <div class="ach-item">
              <div class="ach-bar"><div class="ach-fill" style="width:${pct}%"></div></div>
              <span class="ach-name">${escapeHtml(a.name)}</span>
              <span class="ach-pct">${pct.toFixed(1)}%</span>
            </div>`;
          }).join('')}
        </div>
      </div>` : ''}

      <div class="detail-section" id="newsSection">
        <h3>📰 Actualités</h3>
        <div class="loading" style="padding:12px 0">Chargement des actualités...</div>
      </div>
    `;
  } catch (err) {
    detailContent.innerHTML = `<div style="text-align:center;padding:40px;color:#ff5555">❌ Erreur: ${err.message}</div>`;
  }
}

function hideAllSections() {
  navResults.classList.remove('show');
  homeSection.style.display = 'none';
  detailSection.style.display = 'none';
  const lib = document.getElementById('library'); if (lib) lib.style.display = 'none';
  const set = document.getElementById('settings'); if (set) set.style.display = 'none';
}

function goHome() {
  hideAllSections();
  homeSection.style.display = 'block';
  detailContent.innerHTML = '';
}

// Profile system
function getProfiles() {
  try { return JSON.parse(localStorage.getItem('slimedeals_profiles')) || []; }
  catch { return []; }
}
function saveProfiles(p) { localStorage.setItem('slimedeals_profiles', JSON.stringify(p)); }
function getActiveProfile() {
  const id = localStorage.getItem('slimedeals_active_profile');
  const profiles = getProfiles();
  return profiles.find(p => p.id === id) || profiles[0] || null;
}
function setActiveProfile(id) { localStorage.setItem('slimedeals_active_profile', id); }

function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

function showSettings() {
  hideAllSections();
  const s = document.getElementById('settings');
  if (!s) return;
  s.style.display = 'block';
  renderProfileList();
  document.getElementById('profileDetail').style.display = 'none';
}

function renderProfileList() {
  const profiles = getProfiles();
  const active = getActiveProfile();
  const el = document.getElementById('profileList');
  if (!profiles.length) {
    el.innerHTML = '<div class="text-muted" style="font-size:12px;padding:6px 0">Aucun profil. Créez-en un !</div>';
    return;
  }
  el.innerHTML = profiles.map(p => `
    <div class="profile-item${active?.id === p.id ? ' profile-active' : ''}" onclick="selectProfile('${p.id}')">
      <span style="font-weight:600">${escapeHtml(p.name || 'Sans nom')}</span>
      ${active?.id === p.id ? '<span style="font-size:10px;color:var(--accent)">✓ Actif</span>' : ''}
      <span style="font-size:10px;color:var(--text-dim)">${p.steamId ? '🟢 lié' : '⚪ non lié'}</span>
    </div>
  `).join('');
}

function selectProfile(id) {
  const profiles = getProfiles();
  const p = profiles.find(pr => pr.id === id);
  if (!p) return;
  setActiveProfile(id);
  renderProfileList();
  const detail = document.getElementById('profileDetail');
  detail.style.display = 'block';
  document.getElementById('profileDetailTitle').textContent = '📋 ' + (p.name || 'Profil');
  document.getElementById('profileNameInput').value = p.name || '';
  document.getElementById('profileSteamIdInput').value = p.steamId || '';
  document.getElementById('profileApiKeyInput').value = p.apiKey || '';
  document.getElementById('profileStatus').textContent = '';
  // Store editing id
  detail.dataset.editId = id;
}

function createProfile() {
  const name = document.getElementById('newProfileName').value.trim();
  if (!name) { alert('Entre un nom pour le profil'); return; }
  const profiles = getProfiles();
  const id = genId();
  profiles.push({ id, name, steamId: '', apiKey: '' });
  saveProfiles(profiles);
  document.getElementById('newProfileName').value = '';
  selectProfile(id);
}

function saveProfile() {
  const detail = document.getElementById('profileDetail');
  const id = detail.dataset.editId;
  if (!id) return;
  const profiles = getProfiles();
  const idx = profiles.findIndex(p => p.id === id);
  if (idx === -1) return;
  const name = document.getElementById('profileNameInput').value.trim() || 'Sans nom';
  let steamId = document.getElementById('profileSteamIdInput').value.trim();
  const apiKey = document.getElementById('profileApiKeyInput').value.trim();
  const status = document.getElementById('profileStatus');
  // Resolve vanity URL if needed
  if (steamId && !/^\d{17}$/.test(steamId)) {
    status.textContent = '🔍 Résolution...';
    fetchJson(`/api/resolve?vanity=${encodeURIComponent(steamId)}`).then(data => {
      if (data.steamid) {
        steamId = data.steamid;
        profiles[idx] = { ...profiles[idx], name, steamId, apiKey };
        saveProfiles(profiles);
        document.getElementById('profileSteamIdInput').value = steamId;
        status.textContent = '✅ Résolu et sauvegardé';
        status.style.color = 'var(--accent)';
        renderProfileList();
      } else {
        status.textContent = '❌ ' + (data.error || 'Échec résolution');
        status.style.color = '#ff5555';
      }
    }).catch(() => {
      status.textContent = '❌ Erreur réseau';
      status.style.color = '#ff5555';
    });
    return;
  }
  profiles[idx] = { ...profiles[idx], name, steamId, apiKey };
  saveProfiles(profiles);
  status.textContent = '✅ Sauvegardé';
  status.style.color = 'var(--accent)';
  document.getElementById('profileDetailTitle').textContent = '📋 ' + name;
  renderProfileList();
}

function deleteProfile() {
  const detail = document.getElementById('profileDetail');
  const id = detail.dataset.editId;
  if (!id || !confirm('Supprimer ce profil ?')) return;
  let profiles = getProfiles();
  profiles = profiles.filter(p => p.id !== id);
  saveProfiles(profiles);
  if (getActiveProfile()?.id === id) setActiveProfile(profiles[0]?.id || '');
  detail.style.display = 'none';
  renderProfileList();
}

// Library
async function showLibrary() {
  hideAllSections();
  const lib = document.getElementById('library');
  if (!lib) return;
  lib.style.display = 'block';
  const c = document.getElementById('libraryContent');
  const profile = getActiveProfile();
  if (!profile || !profile.steamId) {
    c.innerHTML = '<div class="settings-card"><h3>🔗 Configuration requise</h3><p class="text-muted" style="font-size:12px">Crée un profil et renseigne ton Steam ID dans ⚙️ Paramètres.</p><button class="btn" onclick="showSettings()" style="margin-top:8px">⚙️ Paramètres</button></div>';
    return;
  }
  c.innerHTML = '<div class="loading">Chargement de la bibliothèque...</div>';
  try {
    const data = await fetchJson(`/api/library/${profile.steamId}?key=${profile.apiKey || ''}`);
    if (data.demo) {
      c.innerHTML = demoLibrary();
      return;
    }
    if (data.error) {
      if (data.error === 'STEAM_API_KEY manquante') {
        c.innerHTML = '<div class="settings-card"><h3>❌ Clé API manquante</h3><p class="text-muted" style="font-size:12px">Ajoute ta clé API Steam dans le profil ⚙️ pour voir ta vraie bibliothèque.</p></div>';
        return;
      }
      c.innerHTML = `<div class="settings-card"><h3>❌ Erreur</h3><p class="text-muted" style="font-size:12px">${escapeHtml(data.error)}</p></div>`;
      return;
    }
    const games = data.games || [];
    if (!games.length) { c.innerHTML = '<div class="settings-card"><p class="text-muted">Aucun jeu trouvé</p></div>'; return; }
    libraryData = games;
    c.innerHTML = renderLibrary(games);
  } catch (err) {
    c.innerHTML = `<div class="settings-card"><h3>❌ Erreur</h3><p class="text-muted">${escapeHtml(err.message)}</p></div>`;
  }
}

function demoLibrary() {
  const demo = [
    { name: 'Counter-Strike 2', appid: 730, playtime_forever: 1234, playtime_2weeks: 12, img: 'https://steamcdn-a.akamaihd.net/steam/apps/730/header.jpg' },
    { name: 'Dota 2', appid: 570, playtime_forever: 892, playtime_2weeks: 0, img: 'https://steamcdn-a.akamaihd.net/steam/apps/570/header.jpg' },
    { name: 'Hogwarts Legacy', appid: 990080, playtime_forever: 67, playtime_2weeks: 8, img: 'https://steamcdn-a.akamaihd.net/steam/apps/990080/header.jpg' },
    { name: 'Team Fortress 2', appid: 440, playtime_forever: 456, playtime_2weeks: 3, img: 'https://steamcdn-a.akamaihd.net/steam/apps/440/header.jpg' },
  ];
  return `<div class="settings-card"><h3>🎮 Bibliothèque (démo)</h3><p class="text-muted" style="font-size:12px">Ajoute ta clé API Steam dans ⚙️ Paramètres pour voir ta vraie bibliothèque.</p></div><div class="library-header"><h2>Mes jeux</h2><span class="library-stats">${demo.length} jeux — ${demo.reduce((s,g) => s + g.playtime_forever, 0)}h total</span></div><input class="lib-search" type="text" id="libSearch" placeholder="Filtrer..." oninput="filterLibrary()">${demo.map(g => renderLibGame(g)).join('')}`;
}

function renderLibrary(games) {
  const total = games.length;
  const totalHours = games.reduce((s, g) => s + (g.playtime_forever || 0), 0);
  const sort = (games, key) => games.sort((a, b) => (b[key] || 0) - (a[key] || 0));
  const sorted = sort([...games], 'playtime_forever');
  return `<div class="library-header"><h2>📚 Ma Bibliothèque</h2><span class="library-stats">${total} jeux — ${(totalHours/60).toFixed(0)}h total</span></div>
    <input class="lib-search" type="text" id="libSearch" placeholder="Filtrer..." oninput="filterLibrary()">
    <div class="lib-sort" style="font-size:11px;color:var(--text-dim);margin-bottom:8px">Trier: <span class="nav-link" onclick="sortLibrary('playtime')" style="font-size:11px">⏱️ Temps</span> • <span class="nav-link" onclick="sortLibrary('name')" style="font-size:11px">🔤 Nom</span></div>
    <div id="libList">${sorted.map(g => renderLibGame(g)).join('')}</div>`;
}

function renderLibGame(g) {
  const h = (g.playtime_forever || 0) / 60;
  const maxH = 500;
  const pct = Math.min((h / maxH) * 100, 100);
  const img = g.img || `https://steamcdn-a.akamaihd.net/steam/apps/${g.appid}/header.jpg`;
  return `<div class="lib-game" onclick="showDetail(${g.appid})">
    <img src="${img}" alt="" loading="lazy" onerror="this.style.display='none'">
    <div class="lib-info">
      <div class="lib-name">${escapeHtml(g.name)}</div>
      <div class="lib-bar"><div class="lib-bar-fill" style="width:${pct}%"></div></div>
    </div>
    <span class="lib-hours">${h.toFixed(0)}h</span>
  </div>`;
}

let libraryData = [];
async function sortLibrary(by) {
  const c = document.getElementById('libraryContent');
  if (!libraryData.length) return;
  let sorted;
  if (by === 'name') sorted = [...libraryData].sort((a, b) => a.name.localeCompare(b.name));
  else sorted = [...libraryData].sort((a, b) => (b.playtime_forever || 0) - (a.playtime_forever || 0));
  const list = document.getElementById('libList');
  if (list) list.innerHTML = sorted.map(g => renderLibGame(g)).join('');
}
function filterLibrary() {
  const q = (document.getElementById('libSearch')?.value || '').toLowerCase();
  const games = document.querySelectorAll('.lib-game');
  games.forEach(g => { g.style.display = g.querySelector('.lib-name')?.textContent.toLowerCase().includes(q) ? '' : 'none'; });
}

// Enhanced loadNews with timeline tab
async function loadNews(appId) {
  try {
    const news = await fetchJson(`/api/news/${appId}`);
    const items = (news?.appnews?.newsitems || []).slice(0, 15);
    const translated = await Promise.all(items.map(async n => ({
      title: await translateFr(n.title),
      contents: await translateFr((n.contents || '').replace(/<[^>]*>/g, '').slice(0, 400)),
      date: n.date,
      dateStr: new Date(n.date * 1000).toLocaleDateString('fr-FR'),
      year: new Date(n.date * 1000).getFullYear()
    })));
    const section = document.getElementById('newsSection');
    if (!section) return;
    if (!translated.length) {
      section.innerHTML = '<h3>📰 Actualités</h3><div class="text-muted" style="padding:12px 0">Aucune actualité récente</div>';
      return;
    }
    // Build timeline from the same data
    const byYear = {};
    translated.forEach(n => { if (!byYear[n.year]) byYear[n.year] = []; byYear[n.year].push(n); });
    const timelineHtml = Object.keys(byYear).sort((a,b) => b - a).map(year => `
      <div class="tl-item">
        <div class="tl-year">${year}</div>
        ${byYear[year].map(n => `<div class="tl-title">${escapeHtml(n.title)}</div><div class="tl-desc">${escapeHtml(n.contents.slice(0, 200))}</div><div class="tl-tags"><span class="tl-tag">${n.dateStr}</span></div>`).join('')}
      </div>
    `).join('');
    const tabs = `
      <div style="display:flex;gap:8px;margin-bottom:12px">
        <span class="nav-link" onclick="document.querySelectorAll('.tab-content').forEach(e=>e.style.display='none');document.getElementById('tabNews').style.display='block'" style="font-size:12px;font-weight:600">📰 Actualités</span>
        <span class="nav-link" onclick="document.querySelectorAll('.tab-content').forEach(e=>e.style.display='none');document.getElementById('tabTimeline').style.display='block'" style="font-size:12px;font-weight:600">⏳ Timeline</span>
      </div>`;
    section.innerHTML = `<h3>📰 Actualités</h3>${tabs}
      <div id="tabNews" class="tab-content">
        <div class="news-list">${translated.slice(0, 10).map(n => `
          <div class="news-item">
            <div class="ni-title">${escapeHtml(n.title)}</div>
            <div class="ni-desc">${escapeHtml(n.contents || '')}</div>
            <div class="ni-date">${n.dateStr}</div>
          </div>
        `).join('')}</div>
      </div>
      <div id="tabTimeline" class="tab-content" style="display:none">
        <div class="timeline">${timelineHtml}</div>
      </div>`;
  } catch {}
}

function showPreview(name) {
  const labels = {
    library: '📚 Bibliothèque Steam — Importe ta bibliothèque via clé API Steam. Affiche tes jeux, heures de jeu, évaluations.',
    patchnotes: '📝 Patch Notes — Fil des mises à jour d\'un jeu traduites en français. Alimenté par l\'API Steam News.',
    timeline: '⏳ Timeline — Chronologie des mises à jour majeures. Version simplifiée des patch notes avec les dates clés.',
    playtime: '⏱️ Temps de jeu — Graphique de tes heures par jeu. Nécessite une clé API Steam. Moyenne hebdo/mensuelle.'
  };
  alert('🔬 ' + (labels[name] || 'Fonctionnalité à venir'));
}

async function loadFeatured() {
  featuredGrid.innerHTML = '<div class="loading" style="grid-column:1/-1">Chargement des jeux populaires...</div>';
  try {
    const results = await Promise.allSettled(POPULAR_IDS.slice(0, 12).map(id => fetchJson(`/api/app/${id}`)));
    const apps = results.filter(r => r.status === 'fulfilled' && r.value).map(r => r.value);
    featuredGrid.innerHTML = apps.map(app => `
      <div class="featured-card" onclick="showDetail(${app.steam_appid})">
        <img src="${app.header_image || ''}" alt="${escapeHtml(app.name)}" loading="lazy" onerror="this.style.display='none'">
        <div class="fc-body">
          <div class="fc-name">${escapeHtml(app.name)}</div>
          <div class="fc-meta">${app.genres?.slice(0, 2).map(g => g.description).join(', ') || 'N/A'}</div>
        </div>
      </div>
    `).join('');
  } catch (err) {
    featuredGrid.innerHTML = '<div style="grid-column:1/-1;color:#ff5555">Erreur de chargement</div>';
  }
}

loadFeatured();
loadCryptoPrices();
