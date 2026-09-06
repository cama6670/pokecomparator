/* PokeComparator - side-by-side Pokémon comparison. Data bundled from PokeAPI (see scripts/build-data.mjs). */
(() => {
  'use strict';

  const DB = window.POKEDEX;
  if (!DB) {
    document.getElementById('loading').textContent = 'Pokédex data is missing. Run "npm run data" to build it.';
    return;
  }

  const LATEST_GEN = Math.max(...DB.generations.map((g) => g.gen));
  const STAT_NAMES = ['Hp', 'Atk', 'Def', 'S.Atk', 'S.Def', 'Spe'];
  const TYPE_COLORS = {
    normal: '#8f8f6e', fire: '#e0702a', water: '#4f7fe0', electric: '#e0b81a', grass: '#5faa3a', ice: '#5fb8b5',
    fighting: '#b52a24', poison: '#8d3a8b', ground: '#c9a34e', flying: '#8f78d8', psychic: '#e04a7a', bug: '#8fa118',
    rock: '#a08d2f', ghost: '#654c8b', dragon: '#5b2fd6', dark: '#5c4a3b', steel: '#8d8da3', fairy: '#c86d99',
    stellar: '#3aa19a', unknown: '#68a090', shadow: '#3a3a4a',
  };
  const TYPES = ['normal','fire','water','electric','grass','ice','fighting','poison','ground','flying','psychic','bug','rock','ghost','dragon','dark','steel','fairy'];
  // Attacking type -> { defending type: multiplier } (only non-1 entries)
  const CHART = {
    normal: { rock: .5, steel: .5, ghost: 0 },
    fire: { grass: 2, ice: 2, bug: 2, steel: 2, fire: .5, water: .5, rock: .5, dragon: .5 },
    water: { fire: 2, ground: 2, rock: 2, water: .5, grass: .5, dragon: .5 },
    electric: { water: 2, flying: 2, electric: .5, grass: .5, dragon: .5, ground: 0 },
    grass: { water: 2, ground: 2, rock: 2, fire: .5, grass: .5, poison: .5, flying: .5, bug: .5, dragon: .5, steel: .5 },
    ice: { grass: 2, ground: 2, flying: 2, dragon: 2, fire: .5, water: .5, ice: .5, steel: .5 },
    fighting: { normal: 2, ice: 2, rock: 2, dark: 2, steel: 2, poison: .5, flying: .5, psychic: .5, bug: .5, fairy: .5, ghost: 0 },
    poison: { grass: 2, fairy: 2, poison: .5, ground: .5, rock: .5, ghost: .5, steel: 0 },
    ground: { fire: 2, electric: 2, poison: 2, rock: 2, steel: 2, grass: .5, bug: .5, flying: 0 },
    flying: { grass: 2, fighting: 2, bug: 2, electric: .5, rock: .5, steel: .5 },
    psychic: { fighting: 2, poison: 2, psychic: .5, steel: .5, dark: 0 },
    bug: { grass: 2, psychic: 2, dark: 2, fire: .5, fighting: .5, poison: .5, flying: .5, ghost: .5, steel: .5, fairy: .5 },
    rock: { fire: 2, ice: 2, flying: 2, bug: 2, fighting: .5, ground: .5, steel: .5 },
    ghost: { psychic: 2, ghost: 2, dark: .5, normal: 0 },
    dragon: { dragon: 2, steel: .5, fairy: 0 },
    dark: { psychic: 2, ghost: 2, fighting: .5, dark: .5, fairy: .5 },
    steel: { ice: 2, rock: 2, fairy: 2, fire: .5, water: .5, electric: .5, steel: .5 },
    fairy: { fighting: 2, dragon: 2, dark: 2, fire: .5, poison: .5, steel: .5 },
  };

  const byKey = new Map(DB.pokemon.map((p) => [p.key, p]));
  const $ = (sel, el = document) => el.querySelector(sel);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pad = (n) => String(n).padStart(4, '0');
  const isCapacitor = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());

  // ---------- State ----------
  const DEFAULT_STATE = {
    cols: [{ key: 'venusaur', gen: LATEST_GEN }, { key: 'vileplume', gen: LATEST_GEN }],
    showDefense: true,
    highlightDiff: true,
    searchForms: true,
  };
  let state = loadState();
  function loadState() {
    try {
      const s = JSON.parse(localStorage.getItem('pc-state'));
      if (s && Array.isArray(s.cols) && s.cols.length) {
        s.cols = s.cols.slice(0, 4).map((c) => ({ key: byKey.has(c.key) ? c.key : null, gen: clampGen(c.gen) }));
        return { ...DEFAULT_STATE, ...s };
      }
    } catch {}
    return JSON.parse(JSON.stringify(DEFAULT_STATE));
  }
  function saveState() {
    try { localStorage.setItem('pc-state', JSON.stringify(state)); } catch {}
  }
  function clampGen(g) {
    g = Number(g);
    return Number.isFinite(g) && g >= 1 && g <= LATEST_GEN ? g : LATEST_GEN;
  }

  // ---------- Generation-aware views ----------
  function pickPast(list, gen) {
    // list entries: {g, v}; g = last generation the value applied to. Choose smallest g >= gen.
    if (!list) return null;
    let best = null;
    for (const e of list) if (e.g >= gen && (!best || e.g < best.g)) best = e;
    return best ? best.v : null;
  }
  function view(p, gen) {
    const types = pickPast(p.past?.types, gen) || p.types;
    let stats = p.stats.slice();
    if (p.past?.stats) {
      // Entries list only the stats that differed; apply from newest to oldest so the closest generation wins.
      const entries = p.past.stats.filter((e) => e.g >= gen).sort((a, b) => b.g - a.g);
      for (const e of entries) e.v.forEach((val, i) => { if (val != null) stats[i] = val; });
    }
    let abilities = p.abilities.map((a, i) => ({ slot: i + 1, k: a.k, h: a.h }));
    if (p.past?.abilities) {
      const entries = p.past.abilities.filter((e) => e.g >= gen).sort((a, b) => b.g - a.g);
      for (const e of entries) {
        for (const ov of e.v) {
          const idx = abilities.findIndex((a) => a.slot === ov.slot);
          const val = { slot: ov.slot, k: ov.k, h: ov.h };
          if (idx >= 0) abilities[idx] = val; else abilities.push(val);
        }
      }
    }
    abilities = abilities.filter((a) => a.k).sort((a, b) => a.slot - b.slot);
    if (gen < 5) abilities = abilities.filter((a) => !a.h);
    if (gen < 3) abilities = [];
    const notes = [];
    if (p.gen && p.gen > gen) notes.push(`Introduced in Gen ${p.gen}`);
    if (p.mega && gen < 6) notes.push('Mega Evolution was introduced in Gen 6');
    return { types, stats, abilities, notes };
  }
  function defenses(types) {
    const res = {};
    for (const atk of TYPES) {
      let m = 1;
      for (const d of types) if (CHART[atk] && CHART[atk][d] != null) m *= CHART[atk][d];
      res[atk] = m;
    }
    return res;
  }
  function statColor(v) {
    if (v < 30) return '#e03a3a';
    if (v < 60) return '#ee7f2a';
    if (v < 90) return '#e8c62a';
    if (v < 120) return '#9ed13a';
    if (v < 150) return '#3ec66d';
    return '#2bb7d6';
  }
  function genLabel(gen) {
    const g = DB.generations.find((x) => x.gen === gen);
    return g ? `Gen ${gen}` : `Gen ${gen}`;
  }
  function genSub(gen) {
    const g = DB.generations.find((x) => x.gen === gen);
    if (!g) return '';
    const region = g.region ? g.region.charAt(0).toUpperCase() + g.region.slice(1) : '';
    return gen === LATEST_GEN ? `${region} · latest` : region;
  }

  // ---------- Rendering ----------
  const columnsEl = $('#columns');
  const typeBadge = (t, cls = '') => `<span class="type ${cls}" style="background:${TYPE_COLORS[t] || '#666'}">${esc(t)}</span>`;
  const PLACEHOLDER = `<svg class="placeholder" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="none" stroke="#000" stroke-width="2"/><path d="M2 12h7a3 3 0 0 0 6 0h7" fill="none" stroke="#000" stroke-width="2"/><circle cx="12" cy="12" r="2" fill="#000"/></svg>`;
  const INFO_SVG = `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9.5" stroke="currentColor" stroke-width="1.8" fill="none"/><path d="M12 11v6" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><circle cx="12" cy="7.6" r="1.3" fill="currentColor"/></svg>`;
  const imgTag = (p, cls = '') =>
    p.img ? `<img class="${cls}" src="img/${p.img}.webp" alt="${esc(p.name)}" loading="lazy" decoding="async" />` : PLACEHOLDER;

  function render() {
    const views = state.cols.map((c) => (c.key ? view(byKey.get(c.key), c.gen) : null));
    const maxStat = STAT_NAMES.map((_, i) => Math.max(...views.map((v) => (v ? v.stats[i] : -1))));
    const maxTotal = Math.max(...views.map((v) => (v ? v.stats.reduce((a, b) => a + b, 0) : -1)));
    const multi = views.filter(Boolean).length > 1;

    columnsEl.dataset.n = String(state.cols.length);
    columnsEl.classList.toggle('no-diff', !state.highlightDiff);
    columnsEl.innerHTML = state.cols
      .map((c, i) => {
        const p = c.key ? byKey.get(c.key) : null;
        const v = views[i];
        let html = `<section class="col" data-i="${i}">`;
        html += `<h3>Game Version</h3>`;
        html += `<button class="genbtn" data-gen="${i}" title="Choose the generation to show stats, types and abilities for">${esc(genLabel(c.gen))} ${INFO_SVG}</button>`;
        if (!p) {
          html += `<button class="card empty" data-pick="${i}"><div class="pic">${PLACEHOLDER}</div><div class="name">Tap to choose a Pokémon</div></button>`;
          html += `</section>`;
          return html;
        }
        html += `<button class="card" data-pick="${i}" title="Tap to choose a different Pokémon">
          <span class="dex">${pad(p.dex)}</span>
          <div class="pic">${imgTag(p)}</div>
          <div class="name">${esc(p.name)}</div>
          ${p.genus ? `<div class="genus">${esc(p.genus)}</div>` : ''}
          <div class="types">${v.types.map((t) => typeBadge(t)).join('')}</div>
        </button>`;
        for (const n of v.notes) html += `<div class="note">⚠ ${esc(n)}</div>`;

        const total = v.stats.reduce((a, b) => a + b, 0);
        html += `<div class="stats"><h4>Stats</h4>`;
        v.stats.forEach((s, si) => {
          const win = multi && s === maxStat[si];
          html += `<div class="statrow${win ? ' win' : ''}"><span class="lbl">${STAT_NAMES[si]}</span><span class="track"><span class="bar" style="width:${Math.min(100, (s / 200) * 100)}%;background:${statColor(s)}"></span></span><span class="val">${s}</span></div>`;
        });
        html += `<div class="statrow total${multi && total === maxTotal ? ' win' : ''}"><span class="lbl">Total</span><span class="track"></span><span class="val">${total}</span></div>`;
        html += `</div>`;

        html += `<div class="abil">`;
        if (v.abilities.length) {
          for (const a of v.abilities) {
            const ab = DB.abilities[a.k];
            html += `<button class="abilbtn" data-ability="${esc(a.k)}"><span>${esc(ab ? ab.name : a.k)}${a.h ? '<span class="hid">(Hidden)</span>' : ''}</span>${INFO_SVG}</button>`;
          }
        } else if (c.gen < 3) {
          html += `<div class="abilbtn na">Abilities were introduced in Gen 3</div>`;
        } else {
          html += `<div class="abilbtn na">Abilities not yet known</div>`;
        }
        html += `</div>`;

        if (state.showDefense) {
          const d = defenses(v.types);
          const group = (test) => TYPES.filter((t) => test(d[t]));
          const chips = (arr, showMult) =>
            arr.length ? arr.map((t) => `<span class="type sm" style="background:${TYPE_COLORS[t]}">${t}${showMult ? `<span class="m">×${fmtMult(d[t])}</span>` : ''}</span>`).join('') : '<span class="none">none</span>';
          html += `<div class="def"><h4>Defenses</h4>
            <div class="defrow"><span class="k">Weak to</span>${chips(group((m) => m > 1), true)}</div>
            <div class="defrow"><span class="k">Resists</span>${chips(group((m) => m > 0 && m < 1), true)}</div>
            <div class="defrow"><span class="k">Immune</span>${chips(group((m) => m === 0), false)}</div>
          </div>`;
        }
        html += `<div class="extra">${(p.h / 10).toFixed(1)} m · ${(p.w / 10).toFixed(1)} kg${p.leg ? ' · Legendary' : ''}${p.myth ? ' · Mythical' : ''}</div>`;
        html += `</section>`;
        return html;
      })
      .join('');
    $('#btnAddCol').style.visibility = state.cols.length < 4 ? 'visible' : 'hidden';
    saveState();
  }
  function fmtMult(m) {
    return m === 0.25 ? '¼' : m === 0.5 ? '½' : String(m);
  }

  // ---------- Modals ----------
  const modal = $('#modal');
  const modalContent = $('#modalContent');
  function openModal(html) {
    modalContent.innerHTML = html;
    modal.classList.remove('hidden');
  }
  function closeModal() { modal.classList.add('hidden'); }

  function showAbility(key) {
    const ab = DB.abilities[key];
    if (!ab) return;
    openModal(`<h2>${esc(ab.name)}</h2><div class="sub">Ability${ab.gen ? ` · introduced in Gen ${ab.gen}` : ''}</div>
      ${ab.short ? `<p><b>${esc(ab.short)}</b></p>` : ''}
      ${ab.effect && ab.effect !== ab.short ? `<p>${esc(ab.effect)}</p>` : ''}
      <button class="close" data-close>Close</button>`);
  }
  function showGenPicker(i) {
    const cur = state.cols[i].gen;
    let html = `<h2>Game Version</h2><div class="sub">Show stats, types and abilities as they were in this generation.</div><div class="genlist">`;
    for (const g of DB.generations) {
      html += `<button class="genopt${g.gen === cur ? ' sel' : ''}" data-setgen="${g.gen}"><b>Gen ${g.gen}</b><small>${esc(genSub(g.gen))}</small></button>`;
    }
    html += `</div><button class="close" data-close>Close</button>`;
    openModal(html);
    modalContent.querySelectorAll('[data-setgen]').forEach((b) =>
      b.addEventListener('click', () => {
        state.cols[i].gen = Number(b.dataset.setgen);
        closeModal();
        render();
      })
    );
  }
  function showAbout() {
    const d = new Date(DB.generated);
    openModal(`<h2>Poke-Comparator</h2><div class="sub">Side-by-side Pokémon stats, abilities and typing.</div>
      <p>Tap a Pokémon card to search by name or National Dex number. Tap the purple version button to view a Pokémon as it was in an older generation. Tap an ability for its description.</p>
      <p>Includes ${DB.pokemon.length.toLocaleString()} Pokémon and forms (Megas, regional forms, Gigantamax and more), ${Object.keys(DB.abilities).length} abilities, across ${LATEST_GEN} generations.</p>
      <p class="sub">Data: <a href="https://pokeapi.co" target="_blank" rel="noopener">PokéAPI</a>, snapshot ${d.toLocaleDateString()}. Works fully offline. Pokémon is © Nintendo / Creatures / GAME FREAK; this is an unofficial fan tool.</p>
      <button class="close" data-close>Close</button>`);
  }

  // ---------- Menu ----------
  const menu = $('#menu');
  function openMenu() {
    $('#optDefense').checked = state.showDefense;
    $('#optDiff').checked = state.highlightDiff;
    $('#optForms').checked = state.searchForms;
    menu.classList.remove('hidden');
  }
  function closeMenu() { menu.classList.add('hidden'); }
  menu.addEventListener('click', (e) => {
    const t = e.target.closest('[data-action],[data-close]');
    if (!t) return;
    if (t.dataset.close != null) return closeMenu();
    const a = t.dataset.action;
    closeMenu();
    if (a === 'swap') swapColumns();
    if (a === 'add') addColumn();
    if (a === 'remove') removeColumn();
    if (a === 'reset') { state = JSON.parse(JSON.stringify(DEFAULT_STATE)); render(); }
    if (a === 'about') showAbout();
  });
  $('#optDefense').addEventListener('change', (e) => { state.showDefense = e.target.checked; render(); });
  $('#optDiff').addEventListener('change', (e) => { state.highlightDiff = e.target.checked; render(); });
  $('#optForms').addEventListener('change', (e) => { state.searchForms = e.target.checked; saveState(); });

  function swapColumns() {
    if (state.cols.length < 2) return;
    const [a, b] = [state.cols[0], state.cols[1]];
    state.cols[0] = b; state.cols[1] = a;
    render();
  }
  function addColumn() {
    if (state.cols.length >= 4) return;
    state.cols.push({ key: null, gen: LATEST_GEN });
    render();
    openSearch(state.cols.length - 1);
  }
  function removeColumn() {
    if (state.cols.length <= 1) return;
    state.cols.pop();
    render();
  }

  // ---------- Search ----------
  const search = $('#search');
  const searchInput = $('#searchInput');
  const searchResults = $('#searchResults');
  const fForms = $('#fForms'), fMega = $('#fMega'), fType = $('#fType'), fGen = $('#fGen');
  let searchFor = 0;
  let searchLimit = 60;
  for (const t of TYPES) fType.insertAdjacentHTML('beforeend', `<option value="${t}">${t.charAt(0).toUpperCase() + t.slice(1)}</option>`);
  for (const g of DB.generations) fGen.insertAdjacentHTML('beforeend', `<option value="${g.gen}">Gen ${g.gen}</option>`);

  const norm = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
  const index = DB.pokemon.map((p) => ({ p, n: norm(p.name), s: norm(p.species), k: norm(p.key) }));

  function openSearch(i) {
    searchFor = i;
    searchLimit = 60;
    fForms.checked = state.searchForms;
    search.classList.remove('hidden');
    searchInput.value = '';
    runSearch();
    setTimeout(() => searchInput.focus(), 50);
  }
  function closeSearch() {
    search.classList.add('hidden');
    searchInput.blur();
  }
  function runSearch() {
    const q = norm(searchInput.value);
    const qn = /^\d+$/.test(q) ? Number(q) : null;
    const wantForms = fForms.checked;
    const megaOnly = fMega.checked;
    const type = fType.value;
    const gen = fGen.value ? Number(fGen.value) : null;
    const scored = [];
    for (const e of index) {
      const p = e.p;
      if (megaOnly && !p.mega) continue;
      else if (!wantForms && !megaOnly && !p.def) continue;
      if (type && !p.types.includes(type)) continue;
      if (gen && p.gen !== gen) continue;
      let score = -1;
      if (!q) score = 0;
      else if (qn != null) {
        if (p.dex === qn) score = 100; else if (String(p.dex).startsWith(q)) score = 50;
      } else {
        if (e.n === q || e.s === q) score = 100;
        else if (e.n.startsWith(q) || e.s.startsWith(q)) score = 80;
        else if (e.n.includes(q) || e.k.includes(q)) score = 40;
      }
      if (score < 0) continue;
      scored.push({ p, score: score + (p.def ? 1 : 0) });
    }
    scored.sort((a, b) => b.score - a.score || a.p.dex - b.p.dex || a.p.id - b.p.id);
    const shown = scored.slice(0, searchLimit);
    if (!scored.length) {
      searchResults.innerHTML = `<div class="nores">No Pokémon found</div>`;
      return;
    }
    searchResults.innerHTML =
      shown
        .map(({ p }) => {
          const total = p.stats.reduce((a, b) => a + b, 0);
          return `<button class="result" data-key="${esc(p.key)}">
            ${p.img ? `<img src="img/${p.img}.webp" alt="" loading="lazy" decoding="async" />` : `<span class="pic" style="width:56px;height:56px">${PLACEHOLDER}</span>`}
            <span><span class="rn">${esc(p.name)}</span><br /><span class="rd">#${pad(p.dex)} · Gen ${p.gen ?? '?'}</span></span>
            <span><span class="types">${p.types.map((t) => typeBadge(t, 'sm')).join('')}</span><span class="stat-sum">BST ${total}</span></span>
          </button>`;
        })
        .join('') +
      (scored.length > shown.length ? `<div class="more"><button data-more>Show more (${scored.length - shown.length} left)</button></div>` : '');
  }
  let searchTimer = 0;
  searchInput.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchLimit = 60;
    searchTimer = setTimeout(runSearch, 60);
  });
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const first = searchResults.querySelector('.result');
      if (first) first.click();
    }
    if (e.key === 'Escape') closeSearch();
  });
  $('#searchClear').addEventListener('click', () => { searchInput.value = ''; runSearch(); searchInput.focus(); });
  [fForms, fMega, fType, fGen].forEach((el) => el.addEventListener('change', () => { searchLimit = 60; runSearch(); }));
  search.addEventListener('click', (e) => {
    if (e.target.closest('[data-close]')) return closeSearch();
    if (e.target.closest('[data-more]')) { searchLimit += 100; runSearch(); return; }
    const r = e.target.closest('.result');
    if (r) {
      state.cols[searchFor].key = r.dataset.key;
      closeSearch();
      render();
    }
  });

  // ---------- Global events ----------
  columnsEl.addEventListener('click', (e) => {
    const pick = e.target.closest('[data-pick]');
    if (pick) return openSearch(Number(pick.dataset.pick));
    const gen = e.target.closest('[data-gen]');
    if (gen) return showGenPicker(Number(gen.dataset.gen));
    const ab = e.target.closest('[data-ability]');
    if (ab) return showAbility(ab.dataset.ability);
  });
  modal.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) closeModal(); });
  $('#btnMenu').addEventListener('click', openMenu);
  $('#btnAbout').addEventListener('click', showAbout);
  $('#btnAddCol').addEventListener('click', addColumn);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { closeModal(); closeMenu(); closeSearch(); }
  });

  // Dark status bar with light icons on Android.
  if (isCapacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.StatusBar) {
    const sb = window.Capacitor.Plugins.StatusBar;
    Promise.resolve().then(() => sb.setStyle({ style: 'DARK' })).catch(() => {});
    Promise.resolve().then(() => sb.setBackgroundColor({ color: '#1b1b1f' })).catch(() => {});
  }

  // Android hardware back button (Capacitor) closes overlays before exiting.
  if (isCapacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App) {
    window.Capacitor.Plugins.App.addListener('backButton', () => {
      if (!search.classList.contains('hidden')) closeSearch();
      else if (!modal.classList.contains('hidden')) closeModal();
      else if (!menu.classList.contains('hidden')) closeMenu();
      else window.Capacitor.Plugins.App.exitApp();
    });
  }

  // Service worker for offline use in a normal browser (not needed inside Capacitor/Electron).
  if ('serviceWorker' in navigator && /^https?:/.test(location.protocol) && !isCapacitor) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  $('#loading').classList.add('hidden');
  render();
})();
