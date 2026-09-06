// Builds www/data/pokedex.json and www/img/<id>.webp from PokeAPI.
// Run: npm run data   (takes a few minutes; ~3000 API calls + ~1350 images)
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_JSON = path.join(ROOT, 'www', 'data', 'pokedex.json');
const OUT_IMG = path.join(ROOT, 'www', 'img');
const CACHE = path.join(ROOT, '.cache');
const API = 'https://pokeapi.co/api/v2';
const CONCURRENCY = 10;
const IMG_SIZE = 320;

await fs.mkdir(path.join(ROOT, 'www', 'data'), { recursive: true });
await fs.mkdir(OUT_IMG, { recursive: true });
await fs.mkdir(path.join(CACHE, 'api'), { recursive: true });
await fs.mkdir(path.join(CACHE, 'img'), { recursive: true });

function keyOf(url) {
  return url.replace(API + '/', '').replace(/\/$/, '').replace(/[\/?&=]/g, '_') + '.json';
}

async function fetchRetry(url, opts = {}, tries = 5) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, opts);
      if (r.status === 404) return null;
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r;
    } catch (e) {
      if (i === tries - 1) throw e;
      await new Promise((res) => setTimeout(res, 800 * (i + 1)));
    }
  }
}

async function getJson(url) {
  const cacheFile = path.join(CACHE, 'api', keyOf(url));
  try {
    return JSON.parse(await fs.readFile(cacheFile, 'utf8'));
  } catch {}
  const r = await fetchRetry(url);
  if (!r) return null;
  const j = await r.json();
  await fs.writeFile(cacheFile, JSON.stringify(j));
  return j;
}

async function getImage(url) {
  if (!url) return null;
  const cacheFile = path.join(CACHE, 'img', url.split('/sprites/pokemon/')[1].replace(/\//g, '_'));
  try {
    return await fs.readFile(cacheFile);
  } catch {}
  const r = await fetchRetry(url);
  if (!r) return null;
  const buf = Buffer.from(await r.arrayBuffer());
  await fs.writeFile(cacheFile, buf);
  return buf;
}

async function pool(items, fn) {
  const out = new Array(items.length);
  let next = 0;
  let done = 0;
  const label = fn.name || 'task';
  async function worker() {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
      done++;
      if (done % 100 === 0 || done === items.length) process.stdout.write(`  ${label}: ${done}/${items.length}\n`);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  return out;
}

const en = (arr, field) => (arr || []).find((e) => e.language?.name === 'en')?.[field] ?? null;
const genNum = (name) => {
  const m = /generation-([ivx]+)/.exec(name || '');
  if (!m) return null;
  const roman = { i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8, ix: 9, x: 10 };
  return roman[m[1]] ?? null;
};
const cap = (s) => s.replace(/(^|[-\s])([a-z])/g, (_, a, b) => a + b.toUpperCase());

console.log('Fetching generation / version-group map...');
const gensIdx = await getJson(`${API}/generation?limit=50`);
const vgToGen = {};
const generations = [];
for (const g of gensIdx.results) {
  const gd = await getJson(g.url);
  const n = genNum(gd.name);
  generations.push({ gen: n, name: en(gd.names, 'name') || cap(gd.name), region: gd.main_region?.name });
  for (const vg of gd.version_groups) vgToGen[vg.name] = n;
}
generations.sort((a, b) => a.gen - b.gen);

console.log('Fetching pokemon list...');
const list = await getJson(`${API}/pokemon?limit=100000`);
console.log(`  ${list.results.length} pokemon entries`);

console.log('Fetching pokemon...');
const raw = await pool(list.results, async function pokemon(entry) {
  return getJson(entry.url);
});

const speciesUrls = [...new Set(raw.filter(Boolean).map((p) => p.species.url))];
console.log('Fetching species...');
const speciesArr = await pool(speciesUrls, async function species(url) {
  return getJson(url);
});
const speciesByUrl = Object.fromEntries(speciesUrls.map((u, i) => [u, speciesArr[i]]));

const formUrls = [...new Set(raw.filter(Boolean).map((p) => p.forms?.[0]?.url).filter(Boolean))];
console.log('Fetching forms...');
const formsArr = await pool(formUrls, async function form(url) {
  return getJson(url);
});
const formByUrl = Object.fromEntries(formUrls.map((u, i) => [u, formsArr[i]]));

const abilityUrls = new Set();
for (const p of raw) {
  if (!p) continue;
  for (const a of p.abilities) if (a.ability) abilityUrls.add(a.ability.url);
  for (const pa of p.past_abilities || []) for (const a of pa.abilities) if (a.ability) abilityUrls.add(a.ability.url);
}
console.log('Fetching abilities...');
const abilityArr = await pool([...abilityUrls], async function ability(url) {
  return getJson(url);
});
const abilities = {};
for (const a of abilityArr) {
  if (!a) continue;
  const flavors = (a.flavor_text_entries || []).filter((e) => e.language.name === 'en');
  const flavor = flavors.length ? flavors[flavors.length - 1].flavor_text.replace(/\s+/g, ' ') : null;
  abilities[a.name] = {
    name: en(a.names, 'name') || cap(a.name),
    short: en(a.effect_entries, 'short_effect'),
    effect: en(a.effect_entries, 'effect')?.replace(/\s+/g, ' ') || flavor,
    gen: genNum(a.generation?.name),
  };
}

// Pretty display name for a form when PokeAPI lacks an English form name.
function fallbackName(p, speciesName) {
  const suffix = p.name.replace(speciesName.toLowerCase().replace(/[^a-z0-9-]/g, '') + '-', '');
  if (suffix === p.name) return speciesName;
  const s = suffix.split('-');
  if (s[0] === 'mega') return `Mega ${speciesName}${s[1] ? ' ' + s[1].toUpperCase() : ''}`;
  if (s[0] === 'gmax') return `Gigantamax ${speciesName}`;
  if (s[0] === 'alola') return `Alolan ${speciesName}`;
  if (s[0] === 'galar') return `Galarian ${speciesName}`;
  if (s[0] === 'hisui') return `Hisuian ${speciesName}`;
  if (s[0] === 'paldea') return `Paldean ${speciesName}${s[1] ? ' (' + cap(s.slice(1).join(' ')) + ')' : ''}`;
  return `${speciesName} (${cap(suffix.replace(/-/g, ' '))})`;
}

const STAT_ORDER = ['hp', 'attack', 'defense', 'special-attack', 'special-defense', 'speed'];
const statsArr = (stats) => STAT_ORDER.map((k) => stats.find((s) => s.stat.name === k)?.base_stat ?? 0);
const abilList = (list) =>
  list.filter((a) => a.ability).sort((a, b) => a.slot - b.slot).map((a) => ({ k: a.ability.name, h: !!a.is_hidden }));

console.log('Processing images...');
const imgResults = await pool(raw.filter(Boolean), async function image(p) {
  const outFile = path.join(OUT_IMG, `${p.id}.webp`);
  try {
    await fs.access(outFile);
    return true;
  } catch {}
  const candidates = [
    p.sprites?.other?.['official-artwork']?.front_default,
    p.sprites?.other?.home?.front_default,
    p.sprites?.front_default,
  ].filter(Boolean);
  for (const url of candidates) {
    try {
      const buf = await getImage(url);
      if (!buf) continue;
      await sharp(buf)
        .resize(IMG_SIZE, IMG_SIZE, { fit: 'inside', withoutEnlargement: true, kernel: 'lanczos3' })
        .webp({ quality: 82 })
        .toFile(outFile);
      return true;
    } catch (e) {
      // try next candidate
    }
  }
  return false;
});
const hasImg = {};
raw.filter(Boolean).forEach((p, i) => (hasImg[p.id] = imgResults[i]));

const pokemon = [];
for (const p of raw) {
  if (!p) continue;
  const sp = speciesByUrl[p.species.url];
  const form = p.forms?.[0] ? formByUrl[p.forms[0].url] : null;
  const speciesName = en(sp?.names, 'name') || cap(sp?.name || p.name);
  const formEn = form ? en(form.names, 'name') : null;
  const name = p.is_default ? speciesName : formEn || fallbackName(p, speciesName);
  const nationalDex = sp?.pokedex_numbers?.find((d) => d.pokedex.name === 'national')?.entry_number ?? sp?.id ?? p.id;
  const formGen = form?.version_group?.name ? vgToGen[form.version_group.name] : null;
  const gen = p.is_default ? genNum(sp?.generation?.name) : formGen || genNum(sp?.generation?.name);

  const entry = {
    id: p.id,
    key: p.name,
    name,
    species: speciesName,
    dex: nationalDex,
    gen,
    types: p.types.sort((a, b) => a.slot - b.slot).map((t) => t.type.name),
    stats: statsArr(p.stats),
    abilities: abilList(p.abilities),
    h: p.height,
    w: p.weight,
    img: hasImg[p.id] ? p.id : 0,
    def: p.is_default ? 1 : 0,
  };
  if (form?.is_mega) entry.mega = 1;
  if (form?.is_battle_only) entry.battle = 1;
  if (sp?.is_legendary) entry.leg = 1;
  if (sp?.is_mythical) entry.myth = 1;
  const genus = en(sp?.genera, 'genus');
  if (genus) entry.genus = genus;

  const past = {};
  if (p.past_types?.length) past.types = p.past_types.map((pt) => ({ g: genNum(pt.generation.name), v: pt.types.map((t) => t.type.name) }));
  if (p.past_abilities?.length) {
    // Each past_abilities entry lists slots that differed up to and including that generation.
    past.abilities = p.past_abilities.map((pa) => ({
      g: genNum(pa.generation.name),
      v: pa.abilities.map((a) => ({ slot: a.slot, k: a.ability?.name ?? null, h: !!a.is_hidden })),
    }));
  }
  if (p.past_stats?.length)
    past.stats = p.past_stats.map((ps) => {
      const v = [null, null, null, null, null, null];
      for (const s of ps.stats) {
        const idx = STAT_ORDER.indexOf(s.stat.name);
        if (idx >= 0) v[idx] = s.base_stat;
        else if (s.stat.name === 'special') v[3] = v[4] = s.base_stat;
      }
      return { g: genNum(ps.generation.name), v };
    });
  if (Object.keys(past).length) entry.past = past;

  pokemon.push(entry);
}
// Forms with no artwork borrow the species' default form image.
const defaultImgByDex = {};
for (const e of pokemon) if (e.def && e.img) defaultImgByDex[e.dex] = e.img;
for (const e of pokemon) if (!e.img && defaultImgByDex[e.dex]) e.img = defaultImgByDex[e.dex];

// Disambiguate duplicate display names (e.g. Mega Meowstic male/female).
const nameCount = {};
for (const e of pokemon) nameCount[e.name] = (nameCount[e.name] || 0) + 1;
for (const e of pokemon) {
  if (nameCount[e.name] < 2 || e.def) continue;
  const speciesKey = e.species.toLowerCase().replace(/[^a-z0-9-]/g, '');
  const extra = e.key.replace(speciesKey + '-', '').split('-').filter((t) => !['mega', 'x', 'y', 'z', 'gmax'].includes(t) && !/^\d+$/.test(t));
  if (extra.length) e.name = `${e.name} (${cap(extra.join(' '))})`;
}

pokemon.sort((a, b) => a.dex - b.dex || (b.def - a.def) || a.id - b.id);

const out = {
  generated: new Date().toISOString(),
  source: 'https://pokeapi.co',
  generations,
  abilities,
  pokemon,
};
await fs.writeFile(OUT_JSON, JSON.stringify(out));
await fs.writeFile(OUT_JSON.replace(/\.json$/, '.js'), 'window.POKEDEX=' + JSON.stringify(out) + ';');
const size = (await fs.stat(OUT_JSON)).size;
console.log(`Wrote ${pokemon.length} pokemon, ${Object.keys(abilities).length} abilities -> ${OUT_JSON} (${(size / 1024).toFixed(0)} KB)`);
console.log(`Images: ${Object.values(hasImg).filter(Boolean).length} ok, ${Object.values(hasImg).filter((v) => !v).length} missing`);
