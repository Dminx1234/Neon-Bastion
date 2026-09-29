# Neon Bastion 🟦

A browser-based **wave-defense** game: build towers, earn gold from kills, upgrade them,
and hold your bastion against ever-growing enemy waves. Vanilla HTML5 Canvas + JS — no build step, no dependencies.

## Run it

Because it uses `<script>` tags (no modules), just open the file directly:

```
Sandbox/BaseDefense/index.html
```

Double-click `index.html`, or serve it so browsers don't complain about `file://`:

```bash
cd Sandbox/BaseDefense
python3 -m http.server 8080
# then visit http://localhost:8080
```

## Controls

- **Left panel** (or keys `1`–`4`): pick a tower type.
- **Click** the field to place it (grid-snapped). Left-click an existing tower to select/upgrade/sell it.
- **Right-click**: cancel placement / clear selection.
- **Space** or the **Start Wave** button: send the next wave.
- **1x / 2x**: toggle game speed.

## Towers

| Tower | Role |
|-------|------|
| Turret | Rapid single-target |
| Cannon | Splash/AoE shells |
| Tesla | Lightning that chains between enemies |
| Frost | Slows enemies down |
| Bank | Support: pays extra gold each wave |

Each tower upgrades with **no level cap** (cost rises each level) and can be sold for a 60% refund. Building **Bank** towers grants extra gold at the end of every wave, scaling with their level.

## Lanes

One colored lane runs in from each of the four screen sides, all converging on the central bastion. Every lane is orthogonal (right-angle turns only, never diagonal) and curves into the bastion from its own side — so each side has a lane to defend. Enemies spawn from the glowing markers at each edge entry.

## Enemies

Grunt (basic), Runner (fast/fragile), Swarm (cheap numbers), Brute (tanky). HP scales each wave.

## Juice (the "cool effects")

`src/particles.js` drives glow (`shadowBlur` + additive `lighter` blending), particle explosions, muzzle flashes, chain-lightning bolts, floating damage/gold text, and screen shake on impacts.

## Sound

`src/sounds.js` synthesizes every sound at runtime with the Web Audio API — no audio files to ship. SFX include per-tower firing (turret pew / cannon thud / frost ping / tesla zap), explosions, kills, base impacts, wave-start and wave-clear jingles, upgrade/sell/ui blips, a game-over theme, plus a soft ambient music bed. Press **M** or click the 🔊 button to mute/unmute (audio also resumes on first click per browser autoplay rules).

## Structure

```
index.html          # canvas + HUD/overlays + script load order
css/style.css        # neon UI
src/particles.js     # effects system (sparks, flashes, bolts, shake, text)
src/sounds.js        # procedural Web Audio SFX + ambient music (no audio files)
src/entities.js      # tower config + Enemy / Tower / Projectile classes
src/waves.js         # spawn scheduling + difficulty curve
src/game.js          # state, input, loop, rendering, HUD
```

## Next ideas to add

- More tower/enemy types, boss waves.
- Tower target-mode buttons (nearest / first / most-hp) and splash-upgrade paths.
- Enemy pathing around towers (A*) so you can build mazes.
- A persistent high-score / save file.
- Migrate to Phaser if you want sprites, tweening, and an asset pipeline.
