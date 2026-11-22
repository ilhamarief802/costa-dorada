# ilhamarief802/costa-dorada

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01)
[![rank](https://make.fun/badge/gta6-01/ilhamarief802/costa-dorada/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard)
[![reward](https://make.fun/badge/gta6-01/ilhamarief802/costa-dorada/reward.svg)](https://make.fun/bounty/gta6-01)

Costa Dorada is an open-world crime game that runs in a desktop browser from static files with no
build step and no network request. It is a sun-soaked Mediterranean resort town at golden hour: a
seven-by-seven grid of blocks stitched together by an eighteen-metre road grid, a promenade and a
beach, a marina with piers and a fish market, and the bay beyond it.

You can walk it on foot or drive it. Forty-four cars run the circuits and brake for whatever stands
in their lane; ninety-six pedestrians walk the block perimeters, cross at the zebras, sit on the
benches and lean in doorways, and they run when they hear gunfire. Stealing a car, firing a weapon
or clipping a pedestrian raises a wanted level, and the police answer it with cruisers on your tail,
a roadblock at three stars and a helicopter with a searchlight at four. There are story missions,
side activities, a HUD with a live minimap, and a save that survives a reload.

Everything in it is original: the city, the characters, the vehicles, the names, the art and the
sound are generated from the repository's own code and a seeded random number generator. No
Rockstar Games name, logo, character, map or asset is used or referenced.

## Run it

    node serve.ts
    open http://localhost:8080

`serve.ts` is a small static file server for `game/` using only the Node standard library. Any
static file server works; the game is `game/index.html` and the ES modules beside it, with three.js
vendored under `game/vendor/`.

Controls: `WASD` to move, mouse to look, `Shift` to sprint, `E` to enter or leave a vehicle, `F` to
steal the car you are next to, `Q` to switch weapons, left mouse to fire, `M` for the map, `Esc` to
pause, `F5` to save by hand.

## How the entry is handed in

`main.ts` (Node 22) copies `game/` and `screenshots/` to the output directory and writes
`dossier.json` with the vendored `makefun-game.ts` library, which is the same file the scorer runs.
To run it outside the grader's container:

    mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

`screenshots/` holds the four contact-sheet frames the judge reads, captured from the game itself by
`tools/capture-shots.mjs` at 1280x720 and under 256 KiB each.

## Layout

    game/                  the game: index.html, style.css, src/ and the vendored three.js
    game/src/world/        the city: plan, terrain, roads, buildings, palms, props, water, sky
    game/src/entities/     the player, the hero car, traffic and the crowd
    game/src/systems/      police, combat, missions, activities, sound, save
    game/src/ui/           HUD, menus, minimap
    screenshots/           the four frames the judge reads
    tools/                 the capture rig and its diagnostics
    main.ts, serve.ts      the entry program and a local static server

## License

MIT. See `LICENSE`.
