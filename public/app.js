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

let denuvoList = [];
let anticheatDb = {};

// Theme
themeBtn.addEventListener('click', () => {
  document.body.classList.toggle('light');
  themeBtn.textContent = document.body.classList.contains('light') ? '☀️' : '🌙';
});

async function loadDatabases() {
  try {
    [denuvoList, anticheatDb] = await Promise.all([
      fetchJson('/api/denuvo'),
      fetchJson('/api/anticheat')
    ]);
  } catch (e) { denuvoList = []; anticheatDb = {}; }
}

async function loadCryptoPrices() {
  try {
    const data = await fetchJson('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=eur');
    btcPrice = data.bitcoin?.eur || 0;
    ethPrice = data.ethereum?.eur || 0;
  } catch {}
}

const DRM_KEYWORDS = [
  { name: 'Denuvo', pattern: /denuvo/i },
  { name: 'VMProtect', pattern: /vmprotect/i },
  { name: 'NProtect', pattern: /nprotect|gameguard/i },
  { name: 'StarForce', pattern: /starforce/i },
  { name: 'SecuROM', pattern: /securom/i },
  { name: 'SafeDisc', pattern: /safedisc/i },
];

const AC_KEYWORDS = [
  { name: 'Easy Anti-Cheat', pattern: /easy\s*anti[-\s]?(cheat|triche)|easyanticheat|eac/i },
  { name: 'BattlEye', pattern: /battleye/i },
  { name: 'Epic Online Services', pattern: /epic\s*online\s*services|epic.*eos|eos.*epic/i },
  { name: 'nProtect GameGuard', pattern: /nprotect|gameguard/i },
  { name: 'Valve Anti-Cheat', pattern: /valve\s*anti[-\s]?(cheat|triche)|vac/i },
  { name: 'PunkBuster', pattern: /punkbuster/i },
  { name: 'FaceIt', pattern: /faceit/i },
  { name: 'RICOCHET', pattern: /ricochet/i },
  { name: 'Xbox Live', pattern: /xbox\s*live/i },
  { name: 'PlayStation Network', pattern: /playstation\s*network|psn/i },
];

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

function detectProtections(texts, appId) {
  const drm = [];
  const ac = [];
  const id = Number(appId);
  if (denuvoList.includes(id)) drm.push('Denuvo');
  if (anticheatDb.easy_anti_cheat?.includes(id) && !ac.includes('Easy Anti-Cheat')) ac.push('Easy Anti-Cheat');
  for (const { name, pattern } of DRM_KEYWORDS) {
    if (drm.includes(name)) continue;
    for (const text of texts) { if (text && pattern.test(text)) { drm.push(name); break; } }
  }
  for (const { name, pattern } of AC_KEYWORDS) {
    if (ac.includes(name)) continue;
    for (const text of texts) { if (text && pattern.test(text)) { ac.push(name); break; } }
  }
  return { drm, ac };
}

function checkFamilySharing(texts) {
  for (const text of texts) {
    if (!text) continue;
    if (/family.?sharing.*(disabled?|not.?allowed?|not.?supported?)/i.test(text)) return false;
  }
  return null;
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
  navResults.classList.remove('show');
  homeSection.style.display = 'none';
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
    const detailedDesc = (app.detailed_description || '').replace(/<[^>]*>/g, '');
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
    const searchTexts = [desc, fullDesc || '', legal || ''];
    const { drm, ac } = detectProtections(searchTexts, appId);
    const fsStatus = checkFamilySharing(searchTexts);
    const drmHtml = drm.length
      ? drm.map(d => `<span class="tag-drm${d === 'Denuvo' ? ' tag-critical' : ''}">🔒 ${escapeHtml(d)}</span>`).join('')
      : '<span class="tag-none">Aucun DRM</span>';
    const acHtml = ac.length
      ? ac.map(a => `<span class="tag-ac${a === 'Easy Anti-Cheat' || a === 'Valve Anti-Cheat' ? ' tag-critical' : ''}">🛡️ ${escapeHtml(a)}</span>`).join('')
      : null;
    const fsHtml = fsStatus === false
      ? '<span class="tag-fs-disabled">❌ Désactivé</span>'
      : fsStatus === true
        ? '<span class="tag-fs-enabled">✅ Activé</span>'
        : '<span class="tag-none">Inconnu</span>';

    detailContent.innerHTML = `
      <div class="detail-header">
        <img src="${header}" alt="${name}" onerror="this.style.display='none'">
        <div class="dh-overlay">
          <h1>${name} <span class="app-id">#${appId}</span></h1>
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
        <div class="detail-card">
          <h3>🔒 DRM</h3>
          <div class="dc-tags">${drmHtml}</div>
        </div>
        <div class="detail-card">
          <h3>🛡️ Anti-Triche</h3>
          <div class="dc-tags">${acHtml || '<span class="tag-none">Aucun anti-triche</span>'}</div>
        </div>
        <div class="detail-card">
          <h3>👪 Partage familial</h3>
          <div class="dc-tags">${fsHtml}</div>
        </div>
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

function goHome() {
  homeSection.style.display = 'block';
  detailSection.style.display = 'none';
  detailContent.innerHTML = '';
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

async function loadNews(appId) {
  try {
    let news = await fetchJson(`/api/news/${appId}`);
    const items = (news?.appnews?.newsitems || []).slice(0, 5);
    const translated = await Promise.all(items.map(async n => ({
      title: await translateFr(n.title),
      contents: await translateFr((n.contents || '').replace(/<[^>]*>/g, '').slice(0, 300)),
      date: n.date
    })));
    const section = document.getElementById('newsSection');
    if (!section) return;
    if (!translated.length) {
      section.innerHTML = '<h3>📰 Actualités</h3><div class="text-muted" style="padding:12px 0">Aucune actualité récente</div>';
      return;
    }
    section.innerHTML = '<h3>📰 Actualités</h3><div class="news-list">' +
      translated.map(n => `
        <div class="news-item">
          <div class="ni-title">${escapeHtml(n.title)}</div>
          <div class="ni-desc">${escapeHtml(n.contents || '')}</div>
          <div class="ni-date">${new Date(n.date * 1000).toLocaleDateString('fr-FR')}</div>
        </div>
      `).join('') +
    '</div>';
  } catch {}
}

loadDatabases();
loadFeatured();
loadCryptoPrices();
