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
const CACHE_DURATION = 5 * 60 * 1000;
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
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
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

app.get('/api/denuvo', (req, res) => {
  try {
    const data = JSON.parse(require('fs').readFileSync('./data/denuvo.json'));
    res.json(data.games);
  } catch (err) {
    res.json([]);
  }
});

app.get('/api/anticheat', (req, res) => {
  try {
    const data = JSON.parse(require('fs').readFileSync('./data/anticheat.json'));
    res.json(data.games);
  } catch (err) {
    res.json({});
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
    setCache(`app_${id}`, app.data);
    res.json(app.data);
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
    const data = await fetchJson(`${STEAM_API}/ISteamNews/GetNewsForApp/v2/?appid=${req.params.id}&count=5&maxlength=500`);
    setCache(`news_${req.params.id}`, data);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  if (process.env.VERCEL !== '1') {
    console.log(`Steam Site: http://localhost:${PORT}`);
  }
});

module.exports = app;
