const express = require('express');
const path = require('path');
const translate = require('@vitalets/google-translate-api');

// Fallback: direct Google Translate API
async function translateText(text, target = 'fr') {
  if (!text || text.length > 5000) return text;
  try {
    const res = await fetch(
      `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${target}&dt=t&q=${encodeURIComponent(text)}`,
      { headers: { 'User-Agent': 'Mozilla/5.0' } }
    );
    if (!res.ok) throw new Error('API error');
    const data = await res.json();
    return data[0].map(s => s[0]).join('');
  } catch (_) {
    // Fallback to package
    try {
      const result = await translate(text, { to: target });
      return result.text;
    } catch {
      return text;
    }
  }
}

const app = express();
const PORT = process.env.PORT || 4000;

const STEAM_STORE_API = 'https://store.steampowered.com/api';
const STEAM_API = 'https://api.steampowered.com';
const CACHE_DURATION = 60 * 60 * 1000;
const cache = {};

function getCached(key) {
  if (cache[key] && Date.now() - cache[key].time < CACHE_DURATION) return cache[key].data;
  return null;
}

function setCache(key, data) {
  cache[key] = { data, time: Date.now() };
}

app.use(express.static(path.join(__dirname, 'public')));

async function fetchJson(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10000);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  } finally {
    clearTimeout(timer);
  }
}

app.get('/api/search', async (req, res) => {
  try {
    const query = req.query.q?.trim();
    if (!query || query.length < 2) return res.json([]);
    const data = await fetchJson(`${STEAM_STORE_API}/storesearch?term=${encodeURIComponent(query)}&cc=FR&l=fr`);
    const results = (data.items || []).filter(i => i.type === 'app').map(i => ({
      appid: i.id, name: i.name, tiny_image: i.tiny_image
    }));
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const transCache = {};
app.get('/api/translate', async (req, res) => {
  try {
    const text = req.query.text?.trim();
    if (!text || text.length > 5000) return res.json({ text });
    if (transCache[text]) return res.json({ text: transCache[text] });
    const result = await translateText(text);
    transCache[text] = result;
    res.json({ text: result });
  } catch (err) {
    res.json({ text: req.query.text });
  }
});

app.get('/api/app/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const cached = getCached(`app_${id}`);
    if (cached) return res.json(cached);
    const data = await fetchJson(`${STEAM_STORE_API}/appdetails?appids=${id}&cc=fr&l=fr`);
    const app = data[id];
    if (!app || !app.success) return res.status(404).json({ error: 'App not found' });
    // Detect DRM/AC from raw data
    const d = app.data;
    const texts = [
      d.legal_notice || '', d.about_the_game || '', d.detailed_description || '',
      d.short_description || '', d.supported_languages || '', d.pc_requirements?.minimum || ''
    ];
    const drmList = [];
    const acList = [];
    const numId = Number(id);
    // Database checks
    try {
      const dd = require('./data/denuvo.json');
      if (dd.games?.includes(numId)) drmList.push('Denuvo');
      const aa = require('./data/anticheat.json');
      if (aa.games?.easy_anti_cheat?.includes(numId) && !acList.includes('Easy Anti-Cheat')) acList.push('Easy Anti-Cheat');
    } catch {}
    // DRM patterns (broad)
    const drmPat = [
      { n: 'Denuvo',       r: /denuvo/i },
      { n: 'VMProtect',    r: /vmprotect/i },
      { n: 'NProtect',     r: /nprotect/i },
      { n: 'GameGuard',    r: /gameguard/i },
      { n: 'StarForce',    r: /starforce/i },
      { n: 'SecuROM',      r: /securom/i },
      { n: 'SafeDisc',     r: /safedisc/i },
      { n: 'ARXAN',        r: /arxan/i },
      { n: 'Caphyon',      r: /caphyon/i },
      { n: 'EasyAntiCheat (EOS SDK)', r: /eos\s*sdk|epic\s*online\s*sdk/i },
    ];
    const acPat = [
      { n: 'Easy Anti-Cheat',  r: /easy\s*[-]?\s*anti\s*[-]?\s*(cheat|triche)|easyanticheat|\beac\b/i },
      { n: 'BattlEye',         r: /battleye/i },
      { n: 'Valve Anti-Cheat', r: /valve\s*[-]?\s*anti\s*[-]?\s*(cheat|triche)|\bvac\b/i },
      { n: 'nProtect GameGuard', r: /nprotect|gameguard/i },
      { n: 'PunkBuster',       r: /punkbuster/i },
      { n: 'FaceIt',           r: /faceit/i },
      { n: 'RICOCHET',         r: /ricochet/i },
      { n: 'Xbox Live',        r: /xbox\s*live/i },
      { n: 'PlayStation Network', r: /playstation\s*network|psn/i },
      { n: 'Epic Online Services', r: /epic\s*online\s*services|epic.*eos\b|eos.*epic/i },
      { n: 'Nexon Anti-Cheat',  r: /nexon\s*anti.?cheat|blackcipher|be?hod/i },
      { n: 'AhnLab',           r: /ahnlab|hackshield/i },
      { n: 'Tencent',          r: /tencent\s*(anti.?cheat|protect)|tenten/i },
      { n: 'EQU8',             r: /\bequ8\b/i },
      { n: 'MUnique',          r: /munique/i },
      { n: 'FPSAC',            r: /fpsac/i },
      { n: 'Denuvo Anti-Cheat', r: /denuvo\s*anti.?cheat/i },
    ];
    for (const t of texts) {
      for (const p of drmPat) { if (!drmList.includes(p.n) && p.r.test(t)) drmList.push(p.n); }
      for (const p of acPat) { if (!acList.includes(p.n) && p.r.test(t)) acList.push(p.n); }
    }
    // Also check Steam categories
    for (const c of d.categories || []) {
      if (/vac|anti.?cheat/i.test(c.description) && !acList.includes('Valve Anti-Cheat')) acList.push('Valve Anti-Cheat');
      if (/battleye/i.test(c.description) && !acList.includes('BattlEye')) acList.push('BattlEye');
    }
    d._drm = drmList;
    d._ac = acList;
    setCache(`app_${id}`, d);
    res.json(d);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/players/:id', async (req, res) => {
  try {
    const cached = getCached(`players_${req.params.id}`);
    if (cached) return res.json(cached);
    const data = await fetchJson(`${STEAM_API}/ISteamUserStats/GetNumberOfCurrentPlayers/v1/?appid=${req.params.id}`);
    setCache(`players_${req.params.id}`, data);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/achievements/:id', async (req, res) => {
  try {
    const cached = getCached(`ach_${req.params.id}`);
    if (cached) return res.json(cached);
    const data = await fetchJson(`${STEAM_API}/ISteamUserStats/GetGlobalAchievementPercentagesForApp/v0002/?gameid=${req.params.id}`);
    setCache(`ach_${req.params.id}`, data);
    res.json(data);
  } catch (err) {
    res.json({});
  }
});

app.get('/api/news/:id', async (req, res) => {
  try {
    const cached = getCached(`news_${req.params.id}`);
    if (cached) return res.json(cached);
    const data = await fetchJson(`${STEAM_API}/ISteamNews/GetNewsForApp/v2/?appid=${req.params.id}&count=20&maxlength=1000`);
    setCache(`news_${req.params.id}`, data);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Resolve Steam vanity URL to Steam ID
app.get('/api/resolve', async (req, res) => {
  try {
    const { vanity } = req.query;
    if (!vanity) return res.json({ error: 'Missing vanity' });
    const apiKey = process.env.STEAM_API_KEY || '';
    if (!apiKey) return res.json({ error: 'STEAM_API_KEY manquante' });
    const data = await fetchJson(`${STEAM_API}/ISteamUser/ResolveVanityURL/v0001/?vanityurl=${encodeURIComponent(vanity)}&key=${apiKey}`);
    res.json(data.response);
  } catch (err) {
    res.json({ error: err.message });
  }
});

// Get owned games (requires API key)
app.get('/api/library/:steamId', async (req, res) => {
  try {
    const { steamId } = req.params;
    const apiKey = req.query.key || process.env.STEAM_API_KEY || '';
    if (!apiKey) return res.json({ error: 'STEAM_API_KEY manquante', demo: true });
    const cached = getCached(`library_${steamId}`);
    if (cached) return res.json(cached);
    const data = await fetchJson(`${STEAM_API}/IPlayerService/GetOwnedGames/v1/?steamid=${steamId}&include_appinfo=true&include_played_free_games=true&key=${apiKey}`);
    if (data.response) {
      setCache(`library_${steamId}`, data.response);
      res.json(data.response);
    } else {
      res.json({ error: 'Erreur API Steam' });
    }
  } catch (err) {
    res.json({ error: err.message });
  }
});

// Get recent playtime (2 weeks)
app.get('/api/recent/:steamId', async (req, res) => {
  try {
    const { steamId } = req.params;
    const apiKey = req.query.key || process.env.STEAM_API_KEY || '';
    if (!apiKey) return res.json({ error: 'STEAM_API_KEY manquante' });
    const data = await fetchJson(`${STEAM_API}/IPlayerService/GetRecentlyPlayedGames/v1/?steamid=${steamId}&count=10&key=${apiKey}`);
    res.json(data.response || { error: 'Erreur' });
  } catch (err) {
    res.json({ error: err.message });
  }
});

app.listen(PORT, () => {
  if (process.env.VERCEL !== '1') {
    console.log(`Steam Site: http://localhost:${PORT}`);
  }
});

module.exports = app;
