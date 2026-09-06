# PokeComparator

A clone of the Android app *Poke-Comparator*: pick two (or up to four) Pokémon and see their
stats, abilities and typing side by side. Fully offline. Includes every Pokémon and form on
PokéAPI as of the data snapshot, including the Pokémon Legends: Z-A Megas, regional forms,
Gigantamax forms and so on.

Ready-to-share builds live in `release/` (copy new builds there after rebuilding).

Builds:

- **Android** — `android/` (Capacitor). Output: `android/app/build/outputs/apk/release/app-release.apk`
- **Windows** — `dist-pc/PokeComparator-<version>-portable.exe` (Electron, single file, no install)
- **Web** — https://cama6670.github.io/pokecomparator/ (deployed from `www/` by GitHub Actions on every push; installable as a PWA). Locally: `npm run serve` and open http://localhost:8123

## Features

- Search by name or National Dex number, with filters for forms, Megas, type and generation.
- Stats with colour-coded bars and total; the higher stat in each row is highlighted.
- Abilities (hidden ability marked), tap for the description.
- Type badges plus a defensive matchup summary (weak to / resists / immune).
- "Game Version" button per column shows a Pokémon as it was in an older generation
  (past types such as pre-Fairy Clefable, past stats, past ability slots).
- Up to four columns on wide screens (the + button); selections are remembered.

## Updating the data

The Pokédex is generated from [PokéAPI](https://pokeapi.co) and bundled into the app so it works
offline. When new Pokémon or forms appear on PokéAPI:

```
npm install
npm run data          # fetches everything into .cache/ and writes www/data + www/img
```

Then rebuild the Android and/or Windows app as below. Responses and images are cached in
`.cache/`, so re-runs are fast. Delete `.cache/` for a completely fresh pull.

## Building

Requirements: Node 18+, and for Android a JDK 17 and the Android SDK (set `ANDROID_HOME`).

```
npm run android:apk   # signed release APK  -> android/app/build/outputs/apk/release/app-release.apk
npm run android:debug # debug APK           -> android/app/build/outputs/apk/debug/app-debug.apk
npm run pc:build      # portable Windows exe -> dist-pc/
npm run pc            # run the desktop app without packaging
```

Install the APK on a phone by copying it over and opening it (allow installs from unknown
sources), or with `adb install -r <apk>`.

The release APK is signed with `android/keystore/pokecomparator.jks`, configured in
`android/keystore.properties` (both kept out of git). Keep using the same keystore so updates
install over the old version instead of requiring an uninstall. Without the keystore the build
falls back to an unsigned release APK.

## Layout

```
scripts/build-data.mjs   PokéAPI -> www/data/pokedex.js(.json) + www/img/*.webp
www/                     the app (index.html, app.js, style.css, sw.js, data/, img/)
electron/main.js         Windows/desktop wrapper
android/                 Capacitor Android project
capacitor.config.json    Capacitor settings
```

Pokémon and Pokémon character names are trademarks of Nintendo. This is an unofficial fan tool.
