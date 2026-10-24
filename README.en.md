<p align="center">
  <img src="docs/screenshots/theme-toxic.jpg" alt="CS2 Prop Spots — Dust II overview in the toxic theme" width="100%">
</p>

<h1 align="center">CS2 Prop Spots</h1>

<p align="center">
  A personal library for CS2 utility line-ups. Pin standing positions on a radar image, attach smokes, flashes,<br>
  molotovs and grenades to each position with aim screenshots, throw inputs and notes. Data is stored in a JSON<br>
  file inside the project folder.
</p>

<p align="center">
  <img alt="license" src="https://img.shields.io/badge/license-MIT-blue">
  <img alt="python" src="https://img.shields.io/badge/python-3.8%2B-3776ab">
  <img alt="dependencies" src="https://img.shields.io/badge/dependencies-0-brightgreen">
  <img alt="build" src="https://img.shields.io/badge/build-none-informational">
</p>

<p align="center">
  English · <a href="README.md">简体中文</a>
</p>

---

## Overview

The tool manages personal CS2 utility spots and addresses three concrete problems: spot data scattered across recordings and screenshots with no way to look it up by map; several utilities sharing one standing position but recorded separately; and no connection between an aim screenshot, the throw inputs, and the note describing the position.

It is a single-page application written in plain HTML, CSS and JavaScript, paired with a local server that uses only the Python standard library. The server serves static files, reads and writes `data.json`, and stores uploaded screenshots. The project has no framework, no build step, no npm packages, no CDN assets and no account system; all data stays on the local disk.

The repository includes example data for 11 maps, 38 spots and 52 props (17 smokes, 21 flashes, 11 molotovs, 3 grenades) referencing 63 aim screenshots. It can be used as-is, or cleared and replaced with your own.

Scope is deliberately limited to one user on one machine: no multi-user access, no cloud sync, no merge logic.

## Screenshots

**Viewer**: the left column lists every prop on that standing position together with its note, the right side shows the aim screenshot, and the footer carries the usage inputs.

![viewer](docs/screenshots/viewer.jpg)

**Editor**: a docked panel on the right, with the map left clickable.

![editor](docs/screenshots/editor.jpg)

**Search**: matching markers stay highlighted, the rest are dimmed.

![search](docs/screenshots/search.jpg)

**Spot list for the current map**

![list](docs/screenshots/list.jpg)

## Themes

Seven dark themes ship with the project. They are selected from the theme button in the toolbar (hover to expand), stored in `localStorage`, and cycled with `T`. Every image below shows the same map and the same set of spots under a different theme.

| **Aurum** `aurum` | **Neon** `neon` |
|:--:|:--:|
| ![aurum](docs/screenshots/theme-aurum.jpg) | ![neon](docs/screenshots/theme-neon.jpg) |
| **Verdant** `verdant` | **Magma** `magma` |
| ![verdant](docs/screenshots/theme-verdant.jpg) | ![magma](docs/screenshots/theme-magma.jpg) |
| **Glacier** `glacier` | **Violet** `violet` |
| ![glacier](docs/screenshots/theme-glacier.jpg) | ![violet](docs/screenshots/theme-violet.jpg) |
| **Toxic** `toxic` | **Theme dropdown** |
| ![toxic](docs/screenshots/theme-toxic.jpg) | ![theme menu](docs/screenshots/theme-menu.jpg) |

Side colours are defined per theme: the T side always uses a yellow hue, the CT side always uses a cool hue outside the yellow range, so the two sides remain distinguishable in every theme.

## Features

**Radar placement.** Coordinates are stored as percentages of the map image, so they are independent of zoom level and screen resolution. The map supports wheel zoom and drag panning.

**Spots and props are separate.** One standing position can hold any number of props, the marker shows how many, and the viewer switches between them on the left. Utilities thrown from the same spot do not need duplicate markers.

**Structured usage.** Each prop records key (left, right, both), throw (jump, no-jump) and movement (forward, back, left, right) as three independent fields.

**Aim screenshots.** Each prop can hold any number of screenshots. The local server writes them to `resource/props/` and names them `<prop name>-<n>`, incrementing to avoid collisions. The viewer supports arrows, dots, drag and double-click to fullscreen.

**Side labels and filtering.** Every prop is T, CT or both; marker colour follows the side, and the right rail can filter the current map to a single side.

**Label layout without collisions.** Name labels are laid out in screen space: directions that would overlap another marker or an existing label are discarded first, then the direction facing the nearest map edge is chosen from the remainder.

**Full-field search.** Matching covers prop names, notes and usage text. Non-matching markers are dimmed instead of hidden, so the surrounding context is preserved.

**Image clean-up.** Lists files in `resource/props/` that no prop references any more and deletes them after a confirmation.

**Backup before write.** Every save of `data.json` keeps the previous version as `data.json.bak`.

## Running

Requirements: Python 3.8 or newer (standard library only), and any Chromium-based browser.

```bash
git clone https://github.com/nc3021/cs-prop-spots.git
cd cs-prop-spots
python server.py
```

Open <http://127.0.0.1:8778/>.

The server listens on `127.0.0.1` only, on a fixed port of 8778. Data writes and image uploads both go through it, so the page must be opened from that address. If the port is already in use the server exits with code 0, which makes it safe to start repeatedly or to add to a login item.

A windowless launcher is provided for Windows:

```bat
start-server.bat
```

Edit the `set "PY=..."` line at the top of the file to point at your own `python.exe` before using it.

## Adding a spot

1. Press `N`, or click **＋ 添加道具点位** in the toolbar.
2. Choose the map in the left rail.
3. Click **在地图上点选**, then click the standing position on the map. Percentage coordinates are filled in automatically.
4. Fill in each prop: type (smoke, flash, molotov, grenade), name, side, and the key / throw / movement rows.
5. Drag screenshots into the image strip or click to browse. Files are written to `resource/props/` immediately.
6. Click **保存点位** to write `data.json`; the previous version is kept as `data.json.bak`.

To edit, click a marker to open the viewer and click **编辑**. Deleting a spot is done from the viewer footer and also keeps a backup.

## Keyboard shortcuts

| Key | Action |
|---|---|
| `/` | Focus the search box |
| `N` | New spot |
| `T` | Switch to the next theme |
| `Esc` | Close the topmost layer (fullscreen image → theme menu → picker → viewer → editor → list) |

## Data format

`data.json` is the only data file. The server writes it with two-space indentation, which keeps it editable by hand and readable in diffs.

```json
{
  "meta": { "version": 3, "updated": "2026-10-24T08:47:46.659Z", "app": "cs2-props" },
  "mapOrder": ["dust2", "ancient", "inferno"],
  "spots": [
    {
      "id": "s_muf7pyb51qria",
      "map": "dust2",
      "x": 6.24,
      "y": 48.08,
      "props": [
        {
          "id": "p_muf7pyb509eid",
          "side": "T",
          "type": "smoke",
          "name": "B door smoke",
          "keys": ["left"],
          "toss": ["nojump"],
          "move": [],
          "note": "Aim at the small window at the top of the pillar on the left, two fifths above the upper line, flush against it.",
          "imgs": ["resource/props/B门烟-2.jpg"]
        }
      ]
    }
  ]
}
```

| Field | Meaning |
|---|---|
| `spots[].x` / `y` | Percentage coordinates (0–100) of the map image, resolution independent |
| `props[].side` | `T`, `CT` or `both` |
| `props[].type` | `smoke`, `flash`, `fire`, `he` |
| `props[].keys` | `left`, `right`, `both` |
| `props[].toss` | `jump`, `nojump` |
| `props[].move` | any of `fwd`, `back`, `left`, `right` |
| `props[].imgs` | Image paths relative to the project root |
| `mapOrder` | Left rail ordering; a UI preference, not part of the spot data |

A spot's side is derived from its props: all T means a T spot, all CT means a CT spot, and a mix is labelled as shared.

## Local server API

`server.py` exposes six endpoints, all bound to the loopback interface:

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/ping` | Availability probe; returns `ok`, `dataExists`, `propsDir` |
| `GET` | `/api/data` | The raw contents of `data.json` |
| `POST` | `/api/data` | Validate, normalise and atomically write (`os.replace`); the previous version becomes `data.json.bak` |
| `GET` | `/api/images` | File names currently in `resource/props/` |
| `POST` | `/api/upload` | Raw image bytes, file name in the `X-Filename` header, 32 MB limit |
| `POST` | `/api/images/delete` | `{"names":[...]}`; plain file names only, path traversal rejected |

Write requests check `Origin` and accept only `127.0.0.1:8778` and `localhost:8778`. Every other path is served as a static file. All responses carry `Cache-Control: no-store`, so a refresh is enough to see file changes.

## Project layout

```
index.html              the only page
assets/theme.css        colour tokens, background FX layer, 7 dark themes
assets/style.css        layout and components, all values from tokens
assets/app.js           all behaviour, no framework, no build
server.py               local server: static files + JSON/image persistence
start-server.bat        windowless launcher for Windows
data.json               the dataset (spots, props, map order)
resource/maps/          11 radar images
resource/props/         aim screenshots
docs/screenshots/       images used by these READMEs
backup/                 pre-change copies, git-ignored
```

## Known limitations

- **Single user, single machine.** One `data.json`, no multi-user access, no sync, no merge. Copy the file to move between machines and avoid editing on both at once.
- **Map list lives in code.** Adding a map means adding an entry to `MAPS` in `assets/app.js` and dropping the radar image into `resource/maps/`.
- **Cache busting is manual.** After editing CSS or JavaScript, update the three `?v=` query strings in `index.html` and the `#statVer` label in the status bar.
- **`start-server.bat` is Windows-only.** The application itself is cross-platform; the script and the windowless launch are not.
- **Radar images are outside the MIT license.** They belong to Valve; see the disclaimer.

## FAQ

**How do I move data between machines?**
Copy `data.json` and the `resource/props/` directory. There is no automatic sync, and editing on two machines at once produces inconsistent state.

**I deleted a spot by mistake.**
`data.json.bak` holds the previous version. Stop the server, then copy it back over `data.json`.

**Why not a database?**
The dataset is small and maintained by hand. A plain text file can be edited, diffed and versioned without migration scripts.

**How are screenshot files named?**
Uploads are named `<prop name>-<n>`, where `n` is the lowest free number, so existing files are never overwritten. Characters that are illegal in file names are replaced with underscores.

**How do I add or replace a map?**
Add an entry to `MAPS` in `assets/app.js` (id, Chinese and English names, file name, native size) and put the radar image in `resource/maps/`. Coordinates are stored as percentages, so a map with the same aspect ratio needs no changes to existing spots.

## Contributing

Issues and pull requests are welcome. For anything other than a typo fix, please open an issue to agree on the approach before writing code.

- [Report a bug](https://github.com/nc3021/cs-prop-spots/issues/new?template=bug_report.yml)
- [Request a feature](https://github.com/nc3021/cs-prop-spots/issues/new?template=feature_request.yml)
- [Browse open issues](https://github.com/nc3021/cs-prop-spots/issues)

The project stays dependency-free: no frameworks, no npm packages, no CDN assets. UI text is Simplified Chinese; code comments use the same language.

## License

[MIT](LICENSE) © 2026 nc3021

## Disclaimer

Counter-Strike 2, its map radar images and related assets are trademarks and copyright of Valve Corporation. This is a non-commercial personal tool; the MIT license covers the code only. The map images in `resource/maps/` and the game screenshots in `resource/props/` are included as personal reference and are not relicensed. If you use this project publicly, replace those assets or confirm that your use qualifies as fair use in your jurisdiction.
