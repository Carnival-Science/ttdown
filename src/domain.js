/* Teardown domain logic: everything the app decides that is not analysis and not drawing.
 *
 * Teaching rules and genre guesses, the 13-step Build-it plan, the idea generator, the whole song as notes (songNotes), MIDI files,
 * zip packing, the lined-up reference WAV, Compare scoring, sample analysis and naming, curriculum data, share and review pages,
 * corrections (applyKey, applyTempo) and the coach's view of a song.
 *
 * Moved out of index.html (migration M3, docs/SVELTE_MIGRATION.md) so the current page and the Svelte application compute exactly
 * the same plans, ideas, notes and exported bytes. Declarations are verbatim and in their original order. The only changes are
 * small, behaviour-preserving splits that take page state as an explicit argument instead of reading it: applyKey and applyTempo
 * (the page's setKey/retempo now just call them, then re-render and save), makeIdeas (the page's ideasFor keeps its cache),
 * coachData(a, { ideas, lastCompare }), shareData(a, question, { planDone, log, lastCompare }) and keyFit(it, labKey).
 * IDEAS (the idea generator's style and weirdness settings, read by the generators) lives here; each createDomain() has its own.
 *
 * Framework-free: no DOM, no storage. alignedWav and analyzeSample need Web Audio types (AudioBuffer, OfflineAudioContext).
 *   index.html   inlined between marker comments (npm run sync:timemap): TTDomain = createDomain({ TimingStore, engine: TTEngine })
 *   Svelte app   import createDomain from "$domain"; createDomain({ TimingStore, engine })
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory;
  else root.TTDomain = factory({ TimingStore: root.TimingStore, engine: root.TTEngine });
})(typeof self !== "undefined" ? self : this, function createDomain(deps) {
"use strict";
const TimingStore = deps && deps.TimingStore, engine = deps && deps.engine;
if (!TimingStore || typeof TimingStore.ensure !== "function") throw new Error("Teardown domain: createDomain needs TimingStore (src/timing-store.js)");
if (!engine || typeof engine.mag !== "function") throw new Error("Teardown domain: createDomain needs the engine (src/engine.js)");
const { tick, mag, detrend, acfAt, NAMES, CAM_MAJ, CAM_MIN } = engine;
const BANDS = ["Sub 20–60 Hz", "Bass 60–250 Hz", "Low mids 250–800", "Mids 0.8–2.5 kHz", "Presence 2.5–6 kHz", "Air 6–11 kHz"];
const REF = [14, 32, 22, 16, 10, 6]; // rough modern electronic reference, % of energy
function genreOf(a) {
  const b = a.bpm, r = a.rhythm, air = a.balance[5] + a.balance[4], sub = a.balance[0];
  if (r.busy < 40) return "ambient";
  if (b >= 158) return r.hatDiv >= 16 || !r.fourFloor ? "dnb" : "hardstyle";
  if (b >= 135 && b < 158 && !r.fourFloor && r.kickPerBar <= 3 && sub + a.balance[1] > 45) return "dubstep";
  if (b >= 118 && b <= 134 && r.fourFloor) return air > 18 ? "house" : "techno";
  if ((b < 100 || (b >= 135 && b < 165)) && !r.fourFloor && r.hatDiv >= 8) return "trap";
  if (b >= 140 && air > 18) return "hyperpop";
  return "pop";
}
const GENRES = {
  house: { name: "House / dance", search: "house track FL Studio tutorial", drums: "909-style kick on every beat, clap on 2 and 4, open hats on the offbeats", bass: "Rolling bassline on the offbeats", plugs: ["FPC", "3x Osc", "Sytrus", "Fruity Limiter (sidechain)"] },
  techno: { name: "Techno", search: "techno FL Studio tutorial", drums: "Punchy kick on every beat, rumble under it, minimal percussion", bass: "Rumble bass made from a reverb'd kick", plugs: ["FPC", "Fruity Reeverb 2", "Fruity Parametric EQ 2", "Fruity Limiter"] },
  dnb: { name: "Drum & bass / footwork", search: "drum and bass FL Studio tutorial", drums: "Fast breakbeat: kick on 1, snare on 2 and 4 at double-time feel, busy 16th hats", bass: "Reese or sub bass following the kick", plugs: ["Slicex (chop breaks)", "Sytrus", "Fruity Fast Dist", "Fruity Limiter"] },
  hardstyle: { name: "Hard dance", search: "hard dance kick FL Studio tutorial", drums: "Distorted kick on every beat", bass: "The kick is the bass", plugs: ["Fruity Blood Overdrive", "Fruity Parametric EQ 2", "Maximus"] },
  dubstep: { name: "Dubstep / bass music (half-time)", search: "dubstep bass FL Studio tutorial", drums: "Half-time: kick on 1, big snare on 3", bass: "Wobble or growl bass with movement", plugs: ["Sytrus or Vital (free)", "Fruity Formula Controller / LFO", "Fruity Fast Dist", "OTT-style multiband (Maximus)"] },
  trap: { name: "Hip-hop / trap", search: "trap beat FL Studio tutorial", drums: "Sparse kicks, snare/clap on 3 (half-time), rolling hi-hats", bass: "808 that follows the kick, with glides", plugs: ["808 samples in Sampler (your 808s & Bass folder)", "Low Lifter", "Fruity Soft Clipper", "Gross Beat"] },
  hyperpop: { name: "Hyperpop / future bass", search: "hyperpop FL Studio tutorial", drums: "Hard, clipped drums; fast and glitchy fills", bass: "Distorted 808 or supersaw stabs", plugs: ["Sytrus / Vital supersaws", "Pitcher / NewTone on vocals", "Gross Beat (glitch)", "Fruity Soft Clipper"] },
  ambient: { name: "Ambient / downtempo", search: "ambient pad FL Studio tutorial", drums: "Light or no drums; texture first", bass: "Soft sub or none", plugs: ["FLEX or Sytrus pads", "Fruity Reeverb 2", "Fruity Delay 3", "Fruity Granulizer"] },
  pop: { name: "Electronic pop", search: "electronic pop beat FL Studio tutorial", drums: "Kick on 1 and 3, snare or clap on 2 and 4", bass: "Bass locked to the kick", plugs: ["FPC", "Sytrus", "Fruity Parametric EQ 2", "Fruity Compressor"] }
};
const COLORS = { Intro: "#6b7a99", Build: "#c98a12", Drop: "#f0531f", Groove: "#2f63e8", Breakdown: "#1f9d6a", Outro: "#6b7a99" };
const MIX_EX = {
  "Heavy sub": "Select the kick's mixer insert, right-click the small arrow at the bottom of the 808's insert → Sidechain to this track. On the 808's insert add Fruity Limiter → COMP: Ratio 4:1, SIDECHAIN box set to 1, Threshold down until the 808 dips 3–6 dB on each kick, Release about 100 ms.",
  "Light sub": "On the bass: band 1 set to High pass at 40 Hz.",
  "Thick low mids": "On the pad: band 3 at 300 Hz, −3 dB, medium width.",
  "Scooped mids": "On chords: band 4 at 400 Hz, −3 dB, wide.",
  "Bright top end": "On the synth bus: band 7 set to High shelf at 8 kHz, +2 dB. If hats hurt, pull 4 kHz down by 2 dB.",
  "Dark or warm top": "On pads: band 7 set to Low pass at 9 kHz. Pick hats from your library that sound dull rather than sizzly.",
  "Very wide": "Layer two pads and pan one 30% left, the other 30% right. Keep kick, 808 and lead vocal chop at center.",
  "Narrow, centered mix": "Pan the open hat 20% right and one percussion hit 20% left. Leave everything else centered.",
  "Loud and heavily limited": "Master chain: Fruity Soft Clipper, then Fruity Limiter with Ceiling at −0.3 dB. Raise Gain until the loudest part shows 3–4 dB of reduction, no more.",
  "Dynamic master": "On the drum bus: Fruity Compressor, Ratio 2:1, Attack 30 ms, Release 150 ms, Threshold until you see 2–3 dB of reduction.",
  "Always": "Band 1 → High pass: chords at 150 Hz, hats at 300 Hz, vocal chops at 200 Hz."
};
const MIX_SHEET = [
  ["Kick", "High-pass 30 Hz. +2 dB at 60–80 Hz for thump. −3 dB at 300–400 Hz to remove boxiness. +2 dB at 3–5 kHz for click.", "Usually none. Fruity Soft Clipper if it needs to hit harder.", "Loudest thing: peaks around −6 dB."],
  ["808 / bass", "−2 dB at 200–300 Hz if muddy. Low-pass at 5 kHz if it's noisy.", "Fruity Soft Clipper for grit. Low Lifter if it vanishes on phone speakers. Sidechain to the kick. Keep it mono.", "2–3 dB under the kick."],
  ["Snare / clap", "High-pass 120–150 Hz. +2 dB at 200 Hz for body. +3 dB at 5–8 kHz for crack.", "Fruity Reeverb 2: decay 0.6–1.0 s, wet 10–15%.", "About level with the kick, or 1–2 dB under."],
  ["Hi-hats", "High-pass 300–500 Hz. −2 dB shelf above 10 kHz if harsh.", "Pan 10–20% to one side. Vary velocity.", "Quiet: 10–14 dB under the kick."],
  ["Chords / pads", "High-pass 150–200 Hz. −3 dB at 300–500 Hz.", "Fruity Reeverb 2 wet 20–30%. Light sidechain to the kick for a pumping feel.", "Behind everything: 10–12 dB under the kick."],
  ["Melody / lead", "High-pass 200 Hz. +2 dB at 2–4 kHz so it cuts through.", "Fruity Delay 3: time 1/8, feedback 30%, wet 20%.", "6–8 dB under the kick."],
  ["Vocal chops", "High-pass 200 Hz. −3 dB at 300 Hz. +2 dB at 3–5 kHz for presence. −2 dB at 7–8 kHz if the 's' sounds are sharp.", "Reeverb 2 wet 15–25%, Delay 3 at 1/8. Pitcher to snap it to the key. Try one reversed copy before the downbeat.", "Just under the melody."],
  ["Master", "Leave flat while you learn.", "Fruity Soft Clipper → Fruity Limiter, ceiling −0.3 dB.", "Aim for 3–4 dB of limiting at most."]
];
function mixNotes(a) {
  const out = [];
  const r = a.balance.map((v, i) => v / REF[i]);
  if (r[0] > 1.5) out.push({ t: "Heavy sub", d: "This track leans on deep sub. Use a clean sine sub (3x Osc on sine, or an 808), keep it mono, and sidechain it to the kick with Fruity Limiter so they don't fight.", plug: "3x Osc, Fruity Limiter" });
  if (r[0] < 0.6) out.push({ t: "Light sub", d: "Not much deep sub. High-pass the bass around 40 Hz in Fruity Parametric EQ 2 and let the kick and mid-bass carry the low end.", plug: "Fruity Parametric EQ 2" });
  if (r[2] > 1.35) out.push({ t: "Thick low mids", d: "Full and warm around 250–800 Hz. Keep it, but cut 2–3 dB around 300 Hz on pads so the vocal and bass stay clear.", plug: "Fruity Parametric EQ 2" });
  if (r[2] < 0.65) out.push({ t: "Scooped mids", d: "The low mids are carved out, which sounds clean and modern. Try a wide 3 dB cut around 400 Hz on chords and pads.", plug: "Fruity Parametric EQ 2" });
  if (r[4] + r[5] > 2.8) out.push({ t: "Bright top end", d: "Lots of presence and air: crisp hats and shiny synths. A gentle high shelf (+2 dB from 8 kHz) on the synth bus gets you closer. Watch harsh 3–5 kHz.", plug: "Fruity Parametric EQ 2" });
  if (r[4] + r[5] < 1.2) out.push({ t: "Dark or warm top", d: "The top end is soft. Low-pass pads around 8–10 kHz and use darker, filtered hats.", plug: "Fruity Parametric EQ 2" });
  if (a.width > 0.45) out.push({ t: "Very wide", d: "Lots of stereo. Widen pads and leads (Fruity Stereo Shaper, or chorus), but keep kick, bass and sub dead center.", plug: "Fruity Stereo Shaper" });
  else if (a.width < 0.18) out.push({ t: "Narrow, centered mix", d: "Mostly mono, which gives punch. Don't over-widen. Use panning on a few small elements only.", plug: "Mixer panning" });
  if (a.crest < 9) out.push({ t: "Loud and heavily limited", d: `The loud parts only peak ${a.crest} dB above their average, so this was mastered hard. Put Fruity Limiter or Maximus on the master last, and turn it up only after the mix sounds good quiet.`, plug: "Fruity Limiter, Maximus" });
  else if (a.crest > 13) out.push({ t: "Dynamic master", d: `Peaks sit ${a.crest} dB above the average: punchy and not crushed. Use light compression and let drums hit.`, plug: "Fruity Compressor" });
  out.push({ t: "Always", d: "High-pass everything that isn't kick or bass (start at 100–150 Hz) so the low end stays clean.", plug: "Fruity Parametric EQ 2" });
  return out;
}
function hatFeel(h) {
  const c = h.filter(Boolean).length, off = [2, 6, 10, 14].filter(i => h[i]).length;
  if (c >= 12) return "busy 16th notes";
  if (off >= 3 && c <= 6) return "on the offbeats (between kicks), the classic dance hat";
  if (c >= 6) return "steady 8th notes";
  return "sparse, a few accents per bar";
}
const posOf = i => `${Math.floor(i / 4) + 1}.${i % 4 + 1}`;
function posList(arr) { return arr.map((v, i) => v ? posOf(i) : null).filter(Boolean); }
function stepsText(arr) { const p = posList(arr); return p.length ? "beats " + p.join(", ") : "none clearly detected"; }
const fmtT = s => Math.floor(s / 60) + ":" + String(Math.floor(s % 60)).padStart(2, "0");
function fixSectionTimes(a) { const fd = a.firstDown || 0; (a.sections || []).forEach(s => { if (s.timing === "tracked") return; s.start = +Math.max(0, fd + s.startBar * a.barSec).toFixed(2); s.end = +Math.min(a.duration || 1e9, fd + (s.startBar + s.bars) * a.barSec).toFixed(2); }); }
function chordList(a) {
  if (a.chords && a.chords.loop) return a.chords.loop;
  const r = NAMES.indexOf(a.key.split(" ")[0]), mi = /minor/.test(a.key), n = d => NAMES[(r + d) % 12];
  return mi ? [n(0) + "m", n(8), n(3), n(10)] : [n(0), n(7), n(9) + "m", n(5)];
}
function buildPlan(a, gk) {
  const P = arr => posList(arr), gh = a.pattern.ghost || {};
  const K = P(a.pattern.kick), S = P(a.pattern.snare), H = P(a.pattern.hats), SG = gh.snare ? P(gh.snare) : [], HG = gh.hats ? P(gh.hats) : [];
  const bpm = a.bpm, key = a.key, root = key.split(" ")[0], al = songAlign(a);
  const sub = is808(a, gk), bassName = sub ? "808" : "Bass";
  const ch = chordList(a), drop = a.sections.find(x => x.label === "Drop") || a.sections.find(x => x.label === "Groove") || a.sections[0];
  const dropBars = `${drop.startBar + 1}–${drop.startBar + drop.bars}`;
  const SN = songNotes(a), d0 = Math.min(drop.startBar, Math.max(0, (a.nBars || 4) - 4)), L4 = arr => loop4(arr, d0), lb = `${d0 + 1}–${d0 + 4}`;
  const kL = L4(SN.D.kick), sL = L4(SN.D.snare), hL = L4(SN.D.hats), hkL = L4(SN.hook);
  const bL = L4(SN.bass).length ? L4(SN.bass) : (a.bassline && a.bassline.notes ? foldBass(a.bassline.notes).filter(n => n.t < 64) : []);
  const kD = drumText(kL), sD = drumText(sL), hD = drumText(hL);
  const kickAt = new Set(kL.map(n => n.t)), snOver = sL.filter(n => kickAt.has(n.t)).length, snWarn = sL.length > 0 && snOver >= sL.length / 2;
  const dropCh = (a.chords && a.chords.bars || []).slice(d0, d0 + 4), chUse = dropCh.some(c => c && c !== "–") ? dropCh : ch;
  const chNames = chUse.filter(c => c && c !== "–"), oneChord = chNames.length >= 3 && new Set(chNames).size === 1;
  const cL = L4(SN.chords).length ? L4(SN.chords) : [].concat(...chUse.map((c, b) => c && c !== "–" ? chordFromName(c).notes.map(m => ({ t: b * 16, dur: 16, midi: m, vel: 85 })) : []));
  const MP = (name, notes, drum) => notes.length ? { name, notes, drum: !!drum, bars: lb, from: drop.label } : null;
  const drumSteps = (D, name, empty) => D ? (D.same ? [`On the C5 row, draw at beat ${D.text}. Draw bar 1 only (the MIDI picture below shows the same thing).`, "Ctrl+A, then Ctrl+B three times to make 4 bars."]
    : [`This part changes from bar to bar, so draw all 4 bars exactly like the MIDI picture below: ${D.text}.`]) : [empty];
  const bassBarsMissing = bL.length ? [0, 1, 2, 3].filter(b => !bL.some(n => Math.floor(n.t / 16) === b)) : [];
  const layout = a.sections.map(x => `${x.label} ${x.startBar + 1}–${x.startBar + x.bars}`).join(", ");
  const newPart = (name, sound) => [
    `Press F4 to make a new empty pattern. Type the name "${name}" and press Enter.`,
    `Add the sound (skip this if you did it in step 3): ${sound}`,
    `Click the new channel's name once to select it, then press F7. The Piano roll title should say the channel's name.`,
    `In the Piano roll, click the magnet icon (Snap) and choose "1/4 beat". Now each beat has 4 squares.`
  ];
  const place = (name, track, bars) => `Press F5 for the Playlist. Click "${name}" in the pattern list on the left, press B for the Paint tool, and drag along Track ${track} across bars ${bars}. Clips fill those bars. Press P to go back to the Draw tool.`;
  const L = [];
  L.push({ t: "Set up the project and the reference", m: 5, s: [
    "FILE → New, then FILE → Save as… and name it after this song.",
    `Right-click the tempo box at the top → Type in value… → ${bpm} → Enter.`,
    "Press the \"Download the song lined up to bar 1\" button below. That copy of the song is shifted so its first downbeat sits exactly on bar 1.",
    "Press F5 for the Playlist. Set Snap (the magnet menu at the top) to Bar. Drag the downloaded .wav from File Explorer onto Track 1 so it starts at bar 1.",
    "Right-click the name \"Track 1\" on the left → Rename → type Reference. Click its green light to mute it while you work; unmute to compare."
  ], c: "The song clip starts at bar 1, and the beat lines in the Playlist line up with its waveform peaks (the kicks).", ask: "How do I line up a reference song in the Playlist so the beats match the grid?", extra: "ref" });
  L.push({ t: "Fast start: load every part as MIDI", m: 10, s: [
    "Press the Download button below. You get one MIDI file per part, as long as the whole song. Every file starts at bar 1, and every note sits exactly on the grid.",
    "Unzip the folder.",
    "For each part (kick, snare, hats, " + bassName + ", chords): press F4 and name a new pattern after the part, click that part's channel from step 3 so it's selected, press F7, then in the Piano roll click the small arrow at the top-left → File → Import MIDI file… and pick that part's file.",
    `With Snap set to Bar, put each pattern at bar 1 on its own track (Track 2 = Kick, 3 = Snare, 4 = Hats, 5 = ${bassName}, 6 = Chords). One click with the Draw tool is enough, because each pattern already covers the whole song. Check the hint bar at the top-left: it should say 1:01:00 for each clip.`,
    "Skip this step if you'd rather build each part by hand: steps 5–10 show how (each one has a MIDI picture of the part)."
  ], c: "Unmute the reference and press Space in Song mode. Your parts hit at the same moments as the song. Where they don't, fix those notes by ear.", ask: "I imported the MIDI. How do I check which notes are wrong and fix them?", extra: "midi" });
  L.push({ t: `Check the key: ${key}`, m: 3, s: [
    `In this app's Overview tab, play the song and press ▶ ${key}. If it sounds at home, keep it; if it clashes, try the other options and tap Use.`,
    `In FL, in any Piano roll: small arrow at the top-left → View → Helpers → Scale highlighting → ${root} ${/minor/.test(key) ? "minor" : "major"}. The notes in the key are now shaded.`
  ], c: "Shaded rows appear in the Piano roll, and the key you picked sounds settled over the song.", ask: `How can I tell by ear if a song is in ${key} or its relative ${a.relKey}?` });
  L.push({ t: "Kick (its own pattern and track)", m: 6, s: newPart("Kick", `drag a kick from samples → Drums → Kicks (your NEWGEN kicks) into the empty space at the bottom of the Channel Rack (F6).`).concat([
    ...drumSteps(kD, "Kick", "No steady kick was found in this section. Draw one at beat 1.1 on the C5 row and listen."),
    place("Kick", 2, dropBars)
  ]), midi: MP("Kick", kL, true), c: `Your Piano roll matches the MIDI picture, and Track 2 has kick clips across bars ${dropBars}.`, ask: "My kick doesn't sound as punchy as the reference. What should I try?" });
  L.push({ t: "Snare or clap", m: 6, s: newPart("Snare", `drag a clap or snare from samples → Drums → Snares & Claps into the Channel Rack.`).concat([
    ...(snWarn ? [`⚠ Check by ear before you draw: ${snOver} of ${sL.length} snare hits land exactly on a kick. That usually means the app heard the kick, not a snare. Most songs put the snare on 2.1 and 4.1, or on 3.1 in half-time. Go to Song map → Check by ear and turn on Snare only. Draw what you hear.`] : []),
    ...drumSteps(sD, "Snare", "No clear snare was found. Try 2.1 and 4.1 (or 3.1 for half-time) and compare by ear."),
    place("Snare", 3, dropBars)
  ]), midi: MP("Snare", sL, true), c: `Track 3 has snare clips, and on playback the snare lands with the song's snare.`, ask: "How do I layer a snare and a clap so they sound like one sound?" });
  L.push({ t: "Hi-hats", m: 8, s: newPart("Hats", `drag a closed hat from samples → Drums → Hats & Cymbals into the Channel Rack.`).concat([
    ...drumSteps(hD, "Hats", (a.rhythm && a.rhythm.hatDiv === 16) ? "The app heard 16th-note hats: draw a hat on every square (1.1, 1.2, 1.3, 1.4 …) for bar 1." : "Draw a hat on the first and third square of every beat (1.1, 1.3, 2.1, 2.3 …) for bar 1."),
    "In the velocity lane at the bottom, pull every second hat down to about 60%. This is what makes hats bounce.",
    hL.length >= 48 ? "Rolls: set Snap to 1/2 step and draw 2–4 quick notes just before a snare." : "Optional: an open hat at beat 4.3 for a lift into the next bar.",
    place("Hats", 4, dropBars)
  ]), midi: MP("Hats", hL, true), c: "Track 4 has hat clips; the hats sound like they bounce, not like a machine gun.", ask: "Show me 3 hi-hat roll ideas for this song." });
  L.push({ t: `${bassName} in ${root}`, m: 10, s: (sub ? newPart("808", "drag an 808 from samples → 808s & Bass into the Channel Rack. Click the channel, and on the little keyboard at the bottom of its window, right-click the key that matches the 808's own note (Sample Lab tells you) so it plays in tune.") : newPart("Bass", "in the Channel Rack click + → FLEX (pick a bass preset) or BooBass.")).concat([
    bL.length >= 2 ? `Draw these notes, matching the MIDI picture below: ${noteList(bL).join(" · ")}.` + (bassBarsMissing.length ? ` No note was heard in bar ${bassBarsMissing.map(b => b + 1).join(" and ")}: hold the note before it, or repeat bar 1.` : "") + " The app's bass hearing is rough, so check each bar against the reference and move notes up or down until they match." : `Draw ${root} notes at the kick's positions (${K.join(", ") || "1.1"}), then follow the chord roots: ${ch.map(c => c.replace(/m$/, "")).join(" → ")}, one per bar.`,
    "Make each note last until the next one: Ctrl+A, then small arrow → Tools → Quick legato.",
    sub ? "For slides: open the 808's channel window → wrench tab → Polyphony → turn on Mono and Porta. Overlap two notes and it glides." : "Keep it in one octave. If it fights the kick, sidechain it (Quick mix step).",
    place(bassName, 5, dropBars)
  ]), midi: MP(bassName, bL), c: `With the reference unmuted, the ${bassName} sounds in tune with the song and moves with the kick.`, ask: sub ? "How do I make my 808 hit harder and glide like trap 808s?" : "How do I write a bassline that grooves with the kick?" });
  L.push({ t: "Chords", m: 10, s: newPart("Chords", "in the Channel Rack click + → FL Keys (piano) or FLEX (pads).").concat([
    ...(oneChord ? [`⚠ The app heard only one chord (${chNames[0]}) for all 4 bars. Some songs really sit on one chord, but it's also a sign the key might be ${chNames[0].replace(/m$/, "")} ${/m$/.test(chNames[0]) ? "minor" : "major"} rather than ${a.key}. In Overview, play the song and compare ▶ ${a.key} with ▶ ${chNames[0].replace(/m$/, "")} ${/m$/.test(chNames[0]) ? "minor" : "major"}; keep the one that sounds at home.`] : []),
    `Draw one chord per bar, matching the MIDI picture below: ${chUse.map(c => c && c !== "–" ? `${c} (${chordNotes(c)})` : "no chord (leave the bar empty)").join(" → ")}. Each chord is 3 notes stacked on top of each other.`,
    "Make each chord last until the next one: Ctrl+A, then small arrow → Tools → Quick legato. Drag the last chord's right edge to the end of bar 4.",
    "Lower the velocity to about 80% so the chords sit behind the drums.",
    place("Chords", 6, `1–${Math.min(a.nBars || 16, drop.startBar + drop.bars)}`)
  ]), midi: MP("Chords", cL), c: "The chords sound in key over the song. If one chord sounds sour, try the chord one step up or down the scale.", ask: `Give me 2 more interesting voicings for ${ch.join(" – ")}.` });
  L.push({ t: "Hook or melody", m: 15, s: newPart("Hook", "in the Channel Rack click + → FLEX (pluck or bell presets) or Harmless.").concat([
    a.hook && a.hook.notes && a.hook.notes.length >= 3 ? "The Song map tab shows the notes the app heard for the hook. Use them as a starting point, then change a few so it's yours." : "Write a 2-bar phrase using notes from the chords.",
    "Repeat it, and change only the last 2 notes the second time (call and answer).",
    "Space it out with Fruity Delay 3: Time 1/8, Feedback about 30%, Wet about 20%. Keep feedback under 50% to avoid screeching.",
    place("Hook", 7, dropBars)
  ]), midi: MP("Hook (rough)", hkL), c: "Track 7 has the hook in the loud sections only. It's the part you'd hum.", ask: "Write me a simple 2-bar hook idea for this key and these chords." });
  L.push({ t: "Arrange it like the song", m: 15, s: [
    `The song's layout: ${layout}.`,
    `Start small: build only bars 1–${Math.min(a.nBars || 32, Math.max(32, drop.startBar + drop.bars))} first (up to the end of the first ${drop.label}). Do the rest once that part sounds right.`,
    "Name your tracks: right-click each track name on the left of the Playlist → Rename (Kick, Snare, Hats, " + bassName + ", Chords, Hook).",
    `Fill the ${drop.label} (bars ${dropBars}) with everything first. Then copy clips to the other sections and delete parts to make them quieter: intros and breakdowns usually lose the kick and ${bassName}.`,
    "To copy a block: hold Ctrl and drag a box around the clips, then press Ctrl+B to repeat them right after.",
    "Transitions: in the last bar before a big section, delete the kick clip for that bar, or drag a riser from samples → FX & Transitions onto a new track."
  ], c: "Your Playlist has one row per instrument, and its blocks look like the Song map's layout.", ask: "Help me plan an 8-bar intro and a build-up into the drop for this song." });
  L.push({ t: "Quick mix", m: 10, s: [
    "In the Channel Rack, select all instruments (click the first, Shift-click the last) and press Ctrl+L. Each one gets its own mixer track.",
    "Press F9. Turn the faders down until the kick peaks around −6 dB on the master; bring everything else in around it.",
    "Fruity Parametric EQ 2 on every track except kick and " + bassName + ": high-pass at 100–150 Hz.",
    "On the master: Fruity Soft Clipper, then Fruity Limiter last."
  ], c: "Nothing turns the master meter red, and the kick and " + bassName + " are the loudest things.", ask: "What are the 3 most important mix moves for this style of song?" });
  L.push({ t: "Export and compare", m: 5, s: [
    "Mute the reference track. FILE → Export → MP3 file (Ctrl+Shift+R).",
    "Upload the MP3 in the Compare tab to see how close you got.",
    "Send it to Saman and ask for one fix."
  ], c: "You have an MP3 and a closeness score.", ask: "Based on how these songs are usually built, what should I fix first in my version?" });
  const iKey = L.findIndex(x => /^Check the key/.test(x.t)), keyStep = iKey >= 0 ? L.splice(iKey, 1)[0] : null;
  const hasHook = !!(a.hook && a.hook.notes && a.hook.notes.length >= 3);
  const sounds = { t: "Add your sounds (one channel per part)", m: 5, s: [
    "Press F6 for the Channel Rack. If the template added channels you won't use, right-click them → Delete.",
    `Drag in one sound per part from your samples folder: a kick (Drums → Kicks), a snare or clap (Drums → Snares & Claps), a closed hat (Drums → Hats & Cymbals)${sub ? ", and an 808 (808s & Bass)" : ""}.`,
    `Click + at the bottom of the Channel Rack → FLEX for the chords (pads or keys)${sub ? "" : ", + → FLEX (bass preset) for the bass"}${hasHook ? ", and + → FLEX (pluck) or Harmless for the hook" : ""}.`,
    `Rename each channel: right-click its name → Rename → Kick, Snare, Hats, ${bassName}, Chords${hasHook ? ", Hook" : ""}.`,
    ...(sub ? ["Tune the 808: open its channel, and on the little keyboard at the bottom right-click the key that matches the 808's own note (Sample Lab tells you). The 808 now plays in tune."] : [])
  ], c: `The Channel Rack has one named channel per part: Kick, Snare, Hats, ${bassName}, Chords${hasHook ? ", Hook" : ""}.`, ask: "Which kick, snare and 808 from my folders would suit this song?" };
  L.splice(1, 0, ...(keyStep ? [keyStep] : []), sounds);
  return L;
}
const rnd = n => Math.floor(Math.random() * n), pickR = arr => arr[rnd(arr.length)], chance = p => Math.random() < p;
const flNote = m => NAMES[((m % 12) + 12) % 12] + Math.floor(m / 12);
const B16 = idx => { const r = new Array(16).fill(false); idx.forEach(i => { if (i >= 0 && i < 16) r[i] = true; }); return r; };
const idxOf = arr => arr.map((v, i) => v ? i : -1).filter(i => i >= 0);
const EVENS = [0, 2, 4, 6, 8, 10, 12, 14], ALL16 = Array.from({ length: 16 }, (_, i) => i);
function keyInfo(a) { const root = NAMES.indexOf(a.key.split(" ")[0]), minor = /minor/.test(a.key); return { root, minor, sc: minor ? [0, 2, 3, 5, 7, 8, 10] : [0, 2, 4, 5, 7, 9, 11], pent: minor ? [0, 3, 5, 7, 10] : [0, 2, 4, 7, 9] }; }
function styleOf(a, gk) { const four = a.rhythm.fourFloor || ["house", "techno", "hardstyle"].includes(gk); const half = !four && (["trap", "dubstep"].includes(gk) || (a.pattern.snare[8] && !a.pattern.snare[4])); return four ? "four" : half ? "half" : "back"; }
const is808 = (a, gk) => a.balance[0] > REF[0] * 1.2 || ["trap", "dubstep", "hyperpop"].includes(gk);
const CH_RHY = [
  { label: "held, one chord per bar", steps: [0], len: 16 },
  { label: "3-3-2 stabs (steps 1, 4, 7, 9, 12, 15)", steps: [0, 3, 6, 8, 11, 14], len: 2 },
  { label: "offbeat stabs (steps 3, 7, 11, 15)", steps: [2, 6, 10, 14], len: 2 },
  { label: "two pushes per bar (steps 1 and 7)", steps: [0, 6], len: 5 },
  { label: "pulsing 8th notes", steps: EVENS, len: 2 }
];
const PROGS = { major: [[0, 4, 5, 3], [5, 3, 0, 4], [0, 5, 3, 4], [3, 0, 4, 5], [0, 3, 5, 4], [1, 4, 0, 5], [0, 2, 3, 4], [3, 4, 5, 5]], minor: [[0, 5, 2, 6], [0, 6, 5, 6], [5, 6, 0, 0], [0, 2, 6, 5], [3, 5, 0, 6], [0, 3, 5, 4], [0, 0, 5, 6], [0, 4, 5, 6]] };
function chordFromName(c) { const m = c.endsWith("m"), r = NAMES.indexOf(m ? c.slice(0, -1) : c), base = 48 + r; return { name: c, root: r, notes: [base, base + (m ? 3 : 4), base + 7] }; }
function chordFromDegree(k, d, seventh) {
  const base = 48 + k.root, n = i => base + k.sc[i % 7] + (i >= 7 ? 12 : 0);
  let notes = [n(d), n(d + 2), n(d + 4)]; if (seventh) notes.push(n(d + 6));
  if (notes[0] >= 59) notes = notes.map(x => x - 12);
  const third = notes[1] - notes[0], sev = seventh ? notes[3] - notes[0] : 0;
  return { name: NAMES[notes[0] % 12] + (third === 3 ? "m" : "") + (seventh ? (third === 4 && sev === 11 ? "maj7" : "7") : ""), root: notes[0] % 12, notes };
}
function genChords(a, first) {
  const k = keyInfo(a), loop = a.chords && a.chords.loop && a.chords.loop.every(c => c !== "–") ? a.chords.loop : null;
  if (first && loop) return { label: "The song's own chord loop", chords: loop.map(chordFromName), rhythm: CH_RHY[0], own: true };
  const w = IDEAS.weird || 0, seventh = chance(0.15 + 0.5 * w), prog = pickR(PROGS[k.minor ? "minor" : "major"]), chords = prog.map(d => chordFromDegree(k, d, seventh)); let extra = "";
  if (w > 0.5 && chance(w)) { const b = chordFromName(NAMES[(k.root + (k.minor ? 5 : 10)) % 12]); chords[1 + rnd(3)] = b; extra = `, with a borrowed ${b.name} chord for color`; }
  return { label: (seventh ? "7th chords (richer, more soulful)" : "Plain triads") + " in " + a.key + extra, chords, rhythm: w < 0.2 ? CH_RHY[0] : pickR(CH_RHY) };
}
function genDrums(a, gk, first) {
  const st = IDEAS.style || "song", w = IDEAS.weird || 0, own = first && st === "song" && idxOf(a.pattern.kick).length > 0;
  const sty = st === "house" ? "four" : st === "rage" ? "half" : st === "pop" ? "back" : st === "ukg" || st === "jersey" ? st : styleOf(a, gk);
  let kick, snare, hats, ghost = [], roll = [], open = [], label, swing = 0;
  if (own) { kick = idxOf(a.pattern.kick); snare = idxOf(a.pattern.snare); hats = idxOf(a.pattern.hats); ghost = a.pattern.ghost ? idxOf(a.pattern.ghost.snare) : []; label = "The song's own groove (as detected)"; }
  else if (sty === "ukg") { kick = pickR([[0, 10], [0, 7, 10], [0, 10, 13], [0, 6, 10]]); snare = [4, 12]; hats = pickR([[2, 6, 10, 14], [0, 2, 3, 6, 8, 10, 11, 14], [2, 3, 6, 10, 11, 14]]); open = chance(0.5) ? [6] : []; ghost = chance(0.6) ? [pickR([7, 9, 15])] : []; swing = 0.22; label = "2-step garage: skippy kick, clap on 2 and 4, swung hats (set the swing knob around 40–50%)"; }
  else if (sty === "jersey") { kick = [0, 4, 8, 11, 14]; snare = [4, 12].concat(chance(0.4) ? [15] : []); hats = pickR([EVENS, [2, 6, 10, 14], ALL16]); label = "Jersey club: the 5-kick bounce (beats 1.1, 2.1, 3.1, 3.4, 4.3), clap on 2 and 4"; }
  else if (sty === "four") {
    kick = [0, 4, 8, 12].concat(chance(0.35) ? [pickR([7, 10, 15])] : []); snare = [4, 12];
    const hv = pickR([{ h: [2, 6, 10, 14], n: "offbeat hats" }, { h: ALL16, n: "16th-note shaker hats" }, { h: [2, 6, 10, 14, 15], n: "offbeat hats with a pickup" }]); hats = hv.h; open = chance(0.5) ? [14] : [];
    label = "Four-on-the-floor kick, clap on 2 and 4, " + hv.n;
  } else if (sty === "half") {
    kick = pickR([[0, 10], [0, 6, 10], [0, 3, 10], [0, 7, 10], [0, 3, 6, 11], [0, 10, 13]]); snare = [8].concat(chance(0.3) ? [15] : []);
    const hv = pickR([{ h: EVENS, n: "8th-note hats" }, { h: ALL16, n: "16th-note hats" }, { h: [0, 2, 3, 4, 6, 8, 10, 11, 12, 14], n: "bouncy hats" }]); hats = hv.h;
    roll = chance(0.65) ? pickR([[6, 7], [14, 15], [12, 13, 14, 15]]) : []; ghost = chance(0.4) ? [pickR([5, 11, 13])] : [];
    label = "Half-time: clap on beat 3, " + hv.n + (roll.length ? `, hat roll at ${posOf(roll[0])}–${posOf(roll[roll.length - 1])}` : "");
  } else {
    kick = pickR([[0, 10], [0, 6, 10], [0, 7, 10], [0, 8, 10], [0, 3, 10], [0, 10, 14]]); snare = [4, 12].concat(chance(0.3) ? [15] : []);
    const hv = pickR([{ h: EVENS, n: "8th-note hats" }, { h: ALL16, n: "16th-note hats" }, { h: [0, 2, 4, 6, 7, 8, 10, 12, 14, 15], n: "8ths with pushes" }]); hats = hv.h; open = chance(0.4) ? [14] : []; ghost = chance(0.4) ? [pickR([7, 9, 15])] : [];
    label = "Backbeat: clap on 2 and 4, " + hv.n;
  }
  if (!own) {
    if (chance(w * 0.8)) { const c = [3, 5, 7, 9, 13, 15].filter(i => !kick.includes(i)); if (c.length) { const sx = pickR(c); kick = kick.concat([sx]); label += `, extra off-beat kick at ${posOf(sx)}`; } }
    if (chance(w * 0.7) && hats.length > 6) { const sx = 4 * rnd(4) + 2; hats = hats.filter(i => i !== sx && i !== sx + 1); label += ", a gap in the hats"; }
    if (chance(w * 0.7) && !ghost.length) ghost = [pickR([3, 7, 10, 14])];
  }
  ghost = ghost.filter(i => !snare.includes(i));
  const fs = pickR([{ s: [12, 13, 14, 15], n: "4 quick snares into the next bar" }, { s: [12, 14, 15], n: "snare triplet-feel pickup" }, { s: [10, 12, 14, 15], n: "building snare run" }, { s: [13, 14, 15], n: "3 late snares" }]);
  const fill = { kick: B16(kick.filter(i => i < 10)), snare: B16(snare.filter(i => i < 10).concat(fs.s)), hats: B16(hats.filter(i => i < 12)) };
  return { label, kick: B16(kick), snare: B16(snare), hats: B16(hats), ghost: B16(ghost), roll, open, swing, fill, fillLabel: "Fill: kick drops out after beat 3.2, " + fs.n + ", hats stop for the last beat" };
}
const SNARE_EX = [
  { n: "Backbeat (beats 2 and 4)", s: [4, 12], g: [], w: "The default for pop, house and most songs. Steady and danceable." },
  { n: "Half-time (beat 3)", s: [8], g: [], w: "Trap, rage and dubstep. Makes the same tempo feel slower and heavier." },
  { n: "Backbeat + pickup", s: [4, 12, 15], g: [], w: "The extra hit at 4.4 pulls you into the next bar. Use it on every 2nd or 4th bar." },
  { n: "Half-time + ghost notes", s: [8], g: [5, 15], w: "Quiet extra hits (about 30% velocity) add bounce without changing the groove." },
  { n: "Echo clap", s: [4, 12, 14], g: [], w: "A second clap right after beat 4. Good in a hook to make it feel busier than the verse." },
  { n: "Dembow bounce", s: [3, 6, 11, 14], g: [], w: "The reggaeton / Jersey-style syncopated pattern. Use it for a switch-up section." },
  { n: "Roll into the drop", s: [4, 8, 10, 12, 13, 14, 15], g: [], w: "Only for the last bar before a drop or hook: hits get closer together to build tension." }
];
const BASS_FLAVORS = ["Root notes locked to the kick", "Octave pop: the last kick of each bar jumps up an octave", "Fifth on the last kick, walking into the next chord", "Glide: the last note slides into the next bar (needs Mono + Porta on)"];
function genBass(a, ch, d, gk, first) {
  const sub = is808(a, gk), ks = idxOf(d.kick).length ? idxOf(d.kick) : [0], flavor = first ? 0 : 1 + rnd(3), notes = [];
  ch.chords.forEach((c, b) => { const low = 24 + c.root + (c.root < 4 ? 12 : 0);
    ks.forEach((s, j) => { const next = j + 1 < ks.length ? ks[j + 1] : 16, last = j === ks.length - 1 && ks.length > 1; let m = low, dur = Math.max(1, Math.min(next - s, sub ? 8 : 4));
      if (flavor === 1 && last) m += 12; if (flavor === 2 && last) m += 7; if (flavor === 3 && last) dur = 16 - s + 1;
      notes.push({ t: b * 16 + s, dur, midi: m, glide: flavor === 3 && last }); }); });
  return { label: BASS_FLAVORS[flavor], notes, sub };
}
const MEL_RHY = [
  { n: "3-3-2 bounce", s: [0, 3, 6, 8, 11, 14] }, { n: "offbeat pluck", s: [2, 4, 6, 10, 12, 14] }, { n: "long-then-short", s: [0, 6, 8, 10] },
  { n: "8th-note run", s: [0, 2, 4, 6, 8, 10, 12] }, { n: "sparse and spacey", s: [0, 7, 10] }, { n: "syncopated", s: [0, 3, 4, 7, 10, 12] }, { n: "two-note hook", s: [0, 6] }, { n: "late entry", s: [4, 6, 7, 10, 12] }
];
const MEL_ODD = [{ n: "every-third-step", s: [0, 3, 6, 9, 12, 15] }, { n: "stop-start bursts", s: [0, 1, 2, 8, 9, 10] }, { n: "off-grid stabs", s: [1, 4, 7, 11, 14] }];
function genMelody(a, ch) {
  const k = keyInfo(a), w = IDEAS.weird || 0, pool = w > 0.6 ? k.sc : k.pent, ladder = []; for (let m = 60; m <= 86; m++) if (pool.includes(((m - k.root) % 12 + 12) % 12)) ladder.push(m);
  const nearest = (target, pcs) => { let best = target, bd = 99; for (let m = 58; m <= 88; m++) if (pcs.includes(m % 12) && Math.abs(m - target) < bd) { bd = Math.abs(m - target); best = m; } return best; };
  const li = m => { let bi = 0, bd = 99; ladder.forEach((v, i) => { if (Math.abs(v - m) < bd) { bd = Math.abs(v - m); bi = i; } }); return bi; };
  const r1 = pickR(w < 0.25 ? MEL_RHY.slice(0, 4) : w > 0.65 ? MEL_RHY.concat(MEL_ODD) : MEL_RHY), short = MEL_RHY.filter(r => r.s.length <= 5 && r !== r1), r2 = pickR(short), contour = pickR(["arch", "falling", "rising", "zigzag"]);
  const nTot = r1.s.length + r2.s.length, n = ch.chords.length, pcs = c => c.notes.map(x => x % 12);
  const bias = i => contour === "arch" ? (i < nTot / 2 ? 1 : -1) : contour === "falling" ? -1 : contour === "rising" ? 1 : (i % 2 ? -1 : 1);
  const bar = (rh, c, startM, n0) => { const out = []; let cur = nearest(startM, pcs(c)); rh.s.forEach((s, i) => {
    if (i > 0) { const mv = chance(0.2) ? 0 : (chance(0.85 - 0.5 * w) ? 1 : 2 + rnd(2)) * (chance(0.8) ? bias(n0 + i) : -bias(n0 + i)); cur = ladder[Math.max(0, Math.min(ladder.length - 1, li(cur) + mv))]; }
    const next = i + 1 < rh.s.length ? rh.s[i + 1] : 16; out.push({ s, dur: Math.min(next - s, 6), midi: cur }); }); return out; };
  const start = contour === "rising" ? 64 + rnd(5) : contour === "falling" ? 74 + rnd(6) : 67 + rnd(8);
  const b1 = bar(r1, ch.chords[0], start, 0), b2 = bar(r2, ch.chords[1 % n], b1[b1.length - 1].midi, r1.s.length);
  const b3 = b1.map(x => Object.assign({}, x)), b4 = b2.map(x => Object.assign({}, x));
  b3[0].midi = nearest(b3[0].midi, pcs(ch.chords[2 % n]));
  const lastN = b4[b4.length - 1], home = nearest(lastN.midi, [k.root]); lastN.midi = home; lastN.dur = 16 - lastN.s;
  if (b4.length > 1) b4[b4.length - 2].midi = ladder[Math.max(0, Math.min(ladder.length - 1, li(home) + pickR([-1, 1, 2])))];
  let twist = "";
  if (chance(0.2 + 0.4 * w) && b2[b2.length - 1].midi <= 76) { b2[b2.length - 1].midi += 12; twist = ", octave leap at the end of the question"; }
  const notes = []; [b1, b2, b3, b4].forEach((bb, b) => bb.forEach(x => notes.push({ t: b * 16 + x.s, dur: x.dur, midi: x.midi })));
  return { label: `${r1.n} rhythm, ${contour} shape${w > 0.6 ? ", full scale (more color)" : ""}, call and answer${twist}`, notes };
}
function genChop(a) {
  const k = keyInfo(a), w = IDEAS.weird || 0, iv = k.pent.concat(w > 0.6 ? [12, -5, 14] : [12]), base = 60 + k.root;
  const rh = pickR([{ n: "3-3-4 push", s: [0, 3, 6, 10] }, { n: "offbeat answers", s: [2, 6, 10, 14] }, { n: "stutter then space", s: [0, 2, 3, 8, 10, 11] }, { n: "call on 1, reply late", s: [0, 6, 7, 12] }, { n: "every third step", s: [0, 3, 6, 9, 12] }, { n: "lazy backbeat", s: [0, 4, 7, 10, 14] }]);
  const b1 = rh.s.map((s, i) => ({ s, midi: base + (i === 0 ? 0 : pickR(iv)), dur: Math.min((i + 1 < rh.s.length ? rh.s[i + 1] : 16) - s, 3) }));
  let b2 = b1.map(x => Object.assign({}, x)), end = "last note jumps up";
  if (chance(0.3 + 0.5 * w)) { const p = b2[b2.length - 1].midi; b2 = b2.filter(x => x.s < 12).concat([12, 13, 14].map(s => ({ s, midi: p, dur: 1 }))); end = "bar 2 ends with a 3-hit stutter"; }
  else b2[b2.length - 1].midi = base + pickR([7, 12]);
  const notes = []; [b1, b2, b1, b2].forEach((bb, b) => bb.forEach(x => notes.push({ t: b * 16 + x.s, dur: x.dur, midi: x.midi })));
  return { label: `${rh.n}; ${end}`, notes, base };
}
const MOVES = [
  "Last bar: mute the kick and 808. The silence makes the next section hit harder.",
  "Riser from samples → FX & Transitions across the last 4 bars.",
  "Snare roll in the last 2 bars: 8th notes, then 16ths.",
  "Filter sweep: add Fruity Filter on the chords, right-click Cutoff → Create automation clip, and draw a ramp upward.",
  "Gross Beat on the master: pick a stutter preset for the last half bar only.",
  "Crash or impact on beat 1 of the new section.",
  "Reverse a vocal chop so it swells into the downbeat.",
  "Cut everything except the melody for the last 2 beats."
];
function genArrangement(a, gk) {
  const sty = styleOf(a, gk), mv = () => pickR(MOVES);
  const T = {
    drop: { n: "Classic build and drop", rows: [[8, "Intro", "Chords + vocal chop, filtered. No drums."], [8, "Build", "Add hats and clap. Bring the melody in quietly."], [16, "Drop", "Everything: full drums, 808/bass, chords, melody."], [8, "Breakdown", "Chords + melody only. Drums out."], [4, "Build", "Hats + snare roll."], [16, "Drop 2", "Everything, plus one new thing: melody an octave up or an extra hat layer."], [8, "Outro", "Drums + bass only, then strip a part every 2 bars."]] },
    beat: { n: "Beat-first (hook and verse)", rows: [[4, "Intro", "Melody alone, filtered or with reverb."], [8, "Hook", "Everything in."], [16, "Verse", "Drums + 808 + chords. Take the melody out or thin it to leave room."], [8, "Hook", "Everything in. Add the vocal chop."], [16, "Verse 2", "Switch-up: change the hat pattern, and drop the 808 for 2 bars in the middle."], [8, "Hook", "Everything, plus an open hat or extra percussion."], [4, "Outro", "Melody alone again."]] },
    burn: { n: "Slow burn (DJ-friendly)", rows: [[16, "Intro", "Kick + hats only, so a DJ can mix in."], [16, "Groove", "Add clap and bass."], [8, "Breakdown", "Kick out. Chords + vocal chop."], [8, "Build", "Hats, snare roll, filter opening."], [32, "Main", "Everything. Swap the hats or add a new sound every 8 bars."], [16, "Outro", "Remove melody, then bass. End on kick + hats."]] }
  };
  const t = T[pickR(sty === "four" ? ["burn", "drop"] : sty === "half" ? ["beat", "drop"] : ["drop", "beat"])];
  let bar = 1; const rows = t.rows.map(([len, name, on], i) => { const r = { bars: `${bar}–${bar + len - 1}`, name, on, move: i < t.rows.length - 1 ? mv() : "Let the last sound ring out with reverb." }; bar += len; return r; });
  return { label: `${t.n}, ${bar - 1} bars (about ${fmtT((bar - 1) * 240 / a.bpm)} at ${a.bpm} BPM)`, rows };
}
function drumBar(d, b, noFill) { return !noFill && b % 4 === 3 && d.fill ? Object.assign({ ghost: B16([]), roll: [], open: [] }, d.fill) : d; }
/* One Standard MIDI File (format 0, one track, 96 ticks per quarter). Note times are in 16th STEPS from bar 1 (n.t, n.dur), so what is written
   is grid-quantized: onsets are whole steps, 24 ticks each (docs/MIDI_EXPORT.md). Every note ends one tick early, a short release gap.
   Same-pitch notes never overlap in the file: a note still sounding when the next one of that pitch starts is cut off just before it
   (the SMF spec leaves overlapping same-pitch notes ambiguous, and players disagree), and a second note with the same pitch and onset
   is dropped as a duplicate. meta = { name, text } adds a track name and a text event; 4/4 is always stated, since exports are 4/4 only. */
/* Notes already in ticks ({ on, off, midi, vel }) -> sorted [tick, status, pitch, velocity] events. Same-pitch notes never overlap: a note
   still sounding when the next one of that pitch starts is cut just before it, and a second note with the same pitch and onset is dropped
   (the longer one stands). Velocity is clamped to 1..127 (missing = 100). At one tick the note-offs come before the note-ons. */
function noteEvents(notes) {
  const ev = [], byPitch = new Map();
  notes.forEach(n => { const x = { on: n.on, off: Math.max(n.on + 1, n.off), midi: n.midi, vel: Math.max(1, Math.min(127, Math.round(n.vel || 100))) }; (byPitch.get(n.midi) || byPitch.set(n.midi, []).get(n.midi)).push(x); });
  byPitch.forEach(list => {
    list.sort((x, y) => x.on - y.on || y.off - x.off);
    for (let i = 0; i < list.length; i++) {
      const x = list[i], nx = list.slice(i + 1).find(y => y.on > x.on); if (nx) x.off = Math.min(x.off, Math.max(x.on + 1, nx.on - 1));
      if (i && list[i - 1].on === x.on) continue;
      ev.push([x.on, 0x90, x.midi, x.vel], [x.off, 0x80, x.midi, 0]);
    }
  });
  return ev.sort((x, y) => x[0] - y[0] || x[1] - y[1] || x[2] - y[2]);
}
function midiBytes(notes, bpm, meta) {
  if (!(bpm >= 20 && bpm <= 400)) throw new Error("midiBytes: tempo " + bpm + " BPM is outside 20 to 400");
  const TPS = 24, ev = noteEvents(notes.map(n => {
    const on = Math.round(n.t * TPS); if (!(on >= 0)) throw new Error("midiBytes: a note starts before bar 1 (step " + n.t + ")");
    return { on, off: Math.max(on + 1, Math.round((n.t + n.dur) * TPS) - 1), midi: n.midi, vel: n.vel };
  }));
  const vl = v => { const b = [v & 0x7f]; while ((v >>= 7)) b.unshift((v & 0x7f) | 0x80); return b; };
  const us = Math.round(60000000 / bpm), trk = []; let last = 0;
  const text = (type, str) => { const b = Array.from(new TextEncoder().encode(str)); trk.push(0, 0xff, type, ...vl(b.length), ...b); };
  if (meta && meta.name) text(0x03, meta.name); if (meta && meta.text) text(0x01, meta.text);
  trk.push(0, 0xff, 0x51, 3, (us >> 16) & 255, (us >> 8) & 255, us & 255, 0, 0xff, 0x58, 4, 4, 2, 24, 8);
  ev.forEach(e => { trk.push(...vl(e[0] - last), e[1], e[2], e[3]); last = e[0]; }); trk.push(0, 0xff, 0x2f, 0);
  const n = trk.length; return new Uint8Array([0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 0, 0, 1, 0, 96, 0x4d, 0x54, 0x72, 0x6b, (n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].concat(trk));
}
let crcT = null;
function crc32(u8) { if (!crcT) { crcT = new Uint32Array(256); for (let i = 0; i < 256; i++) { let c = i; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcT[i] = c >>> 0; } } let c = 0xffffffff; for (let i = 0; i < u8.length; i++) c = crcT[(c ^ u8[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function zipStore(files) {
  const enc = new TextEncoder(), parts = [], central = []; let off = 0;
  const u16 = v => [v & 255, (v >> 8) & 255], u32 = v => [v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255];
  files.forEach(({ name, data }) => { const nm = enc.encode(name), crc = crc32(data);
    const head = [0x50, 0x4b, 3, 4, ...u16(20), ...u16(0x800), ...u16(0), ...u16(0), ...u16(0x21), ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(nm.length), ...u16(0)];
    parts.push(new Uint8Array(head), nm, data);
    central.push(new Uint8Array([0x50, 0x4b, 1, 2, ...u16(20), ...u16(20), ...u16(0x800), ...u16(0), ...u16(0), ...u16(0x21), ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(nm.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(off)]), nm);
    off += head.length + nm.length + data.length; });
  const cs = central.reduce((p, c) => p + c.length, 0);
  const end = new Uint8Array([0x50, 0x4b, 5, 6, ...u16(0), ...u16(0), ...u16(files.length), ...u16(files.length), ...u32(cs), ...u32(off), ...u16(0)]);
  const all = parts.concat(central, [end]), out = new Uint8Array(all.reduce((p, c) => p + c.length, 0)); let o = 0; all.forEach(c => { out.set(c, o); o += c.length; }); return out;
}
function ideaMidiFiles(a, I) {
  const drumNotes = key => { const out = []; for (let b = 0; b < 4; b++) { const d = drumBar(I.drums, b); d[key].forEach((on, s) => { if (on) { out.push({ t: b * 16 + s, dur: 1, midi: 60, vel: key === "hats" && s % 4 ? 75 : 100 }); if (key === "hats" && d.roll && d.roll.includes(s)) out.push({ t: b * 16 + s + 0.5, dur: 0.5, midi: 60, vel: 65 }); } }); if (key === "snare" && d.ghost) d.ghost.forEach((on, s) => { if (on) out.push({ t: b * 16 + s, dur: 1, midi: 60, vel: 38 }); }); } return out; };
  const chordNotesM = []; I.chords.chords.forEach((c, b) => I.chords.rhythm.steps.forEach(s => c.notes.forEach(m => chordNotesM.push({ t: b * 16 + s, dur: I.chords.rhythm.len, midi: m, vel: 85 }))));
  const mk = (name, notes) => ({ name, data: midiBytes(notes, a.bpm) });
  return [mk("1 Kick.mid", drumNotes("kick")), mk("2 Snare or clap.mid", drumNotes("snare")), mk("3 Hats.mid", drumNotes("hats")), mk(I.bass.sub ? "4 808.mid" : "4 Bass.mid", I.bass.notes.map(n => ({ t: n.t, dur: n.dur, midi: n.midi + 12 }))), mk("5 Chords.mid", chordNotesM), mk("6 Melody.mid", I.melody.notes), mk("7 Vocal chop.mid", I.chop.notes)].filter(f => f.data.length > 40);
}
function noteList(notes, labelFn) { const bars = {}; notes.forEach(n => { const b = Math.floor(n.t / 16); (bars[b] = bars[b] || []).push(`${(labelFn || flNote)(n.midi)} at ${posOf(n.t % 16)}${n.dur > 6 ? " (hold)" : ""}`); }); return Object.keys(bars).map(b => `Bar ${+b + 1}: ${bars[b].join(", ")}`); }
const IDEAS = { id: null, style: "song", weird: 0.3 };
const STYLES = { song: "Match the song", rage: "Rage / trap", house: "House", ukg: "UK garage (2-step)", jersey: "Jersey club", pop: "Pop backbeat" };
const wText = w => w < 0.2 ? "safe" : w < 0.5 ? "a little different" : w < 0.75 ? "adventurous" : "strange";
const KIT = { kick: null, snare: null, hat: null, bass: null, chop: null };
const KIT_SLOTS = [["kick", "Kick"], ["snare", "Snare / clap"], ["hat", "Hi-hat"], ["bass", "808 / bass"], ["chop", "Vocal chop"]];
const KIND_NAME = { drums: "Drums", bass: "808 / bass", chords: "Chords", melody: "Melody", chop: "Vocal chop", arr: "Arrangement" };
function makeIdeas(a, gk) {
  const I = { id: tdId(a) };
  I.drums = genDrums(a, gk, true); I.chords = genChords(a, true); I.bass = genBass(a, I.chords, I.drums, gk, true); I.melody = genMelody(a, I.chords); I.chop = genChop(a); I.arr = genArrangement(a, gk);
  return I;
}
function loop4(notes, startBar) { const s0 = startBar * 16; return notes.filter(n => n.t >= s0 && n.t < s0 + 64).map(n => Object.assign({}, n, { t: n.t - s0 })); }
function foldBass(notes) { if (!notes || !notes.length) return notes || []; const ms = notes.map(n => n.midi).sort((x, y) => x - y), med = ms[Math.floor(ms.length / 2)];
  return notes.map(n => { let m = n.midi; while (m > med + 6) m -= 12; while (m < med - 6) m += 12; return Object.assign({}, n, { midi: m }); }); }
/* Drum hits in a 4-bar loop: the same every bar, or bar by bar. */
function drumText(loop) { if (!loop.length) return null; const bars = [0, 1, 2, 3].map(b => loop.filter(n => Math.floor(n.t / 16) === b).map(n => n.t % 16).sort((x, y) => x - y)), k = bars.map(b => b.join(","));
  return k.every(x => x === k[0]) ? { same: true, text: bars[0].map(posOf).join(", ") } : { same: false, text: bars.map((b, i) => `Bar ${i + 1}: ${b.length ? b.map(posOf).join(", ") : "nothing"}`).join(" · ") }; }
function songNotes(a) {
  const stepSec = a.barSec / 16, nBars = a.nBars || Math.floor(a.duration / a.barSec);
  const parts = a.drumParts && a.drumParts.length ? a.drumParts : [{ startBar: 0, bars: nBars, kick: a.pattern.kick, snare: a.pattern.snare, hats: a.pattern.hats }];
  const D = { kick: [], snare: [], hats: [] }, kickBars = new Set();
  parts.forEach(pt => { for (let b = pt.startBar; b < Math.min(nBars, pt.startBar + pt.bars); b++) ["kick", "snare", "hats"].forEach(k => pt[k].forEach((on, i) => { if (on) { D[k].push({ t: b * 16 + i, dur: 1, midi: 60, vel: k === "hats" && i % 4 ? 80 : 105 }); if (k === "kick") kickBars.add(b); } })); });
  const loopOver = (notes, bars, start) => { const out = []; bars.forEach(b => { const ofs = ((b - (start || 0)) % 4 + 4) % 4; notes.forEach(n => { if (Math.floor(n.t / 16) === ofs) out.push({ t: b * 16 + (n.t % 16), dur: n.dur, midi: n.midi, vel: 100 }); }); }); return out; };
  const bass = a.bassline && a.bassline.notes ? loopOver(foldBass(a.bassline.notes), Array.from(kickBars).sort((p, q) => p - q), (a.bassline.bar != null ? a.bassline.bar : 1) - 1) : [];
  // each chord where it sounds (chordSpans: regions, else one per bar), from bar 1 to the last bar; a pickup chord is cut at bar 1
  const chords = []; chordSpans(a, null).forEach(sp => { const q0 = Math.max(sp.s, 0), q1 = Math.min(sp.e, nBars * 16); if (q1 > q0) chordFromName(sp.c).notes.forEach(m => chords.push({ t: q0, dur: q1 - q0, midi: m, vel: 85 })); });
  let hook = [];
  if (a.hook && a.hook.notes && a.hook.notes.length >= 3) { const bars = []; a.sections.filter(x => x.label === a.hook.from).forEach(x => { for (let b = x.startBar; b < x.startBar + x.bars && b < nBars; b++) bars.push(b); }); hook = loopOver(a.hook.notes, bars, (a.hook.bar != null ? a.hook.bar : 1) - 1); }
  return { stepSec, D, bass, chords, hook };
}
function songAlign(a) { return { lead: 0, ofs: 0, audioBar: 1, fd: a.firstDown || 0 }; }
function alignedWav(a) {
  const ab = a.__buf; if (!ab) return null;
  const sr = ab.sampleRate, fd = a.firstDown || 0, shift = Math.round(-fd * sr); // >0: pad silence, <0: trim the start
  const src = [ab.getChannelData(0), ab.numberOfChannels > 1 ? ab.getChannelData(1) : ab.getChannelData(0)];
  const len = Math.max(1, ab.length + shift), ch = len * 4 > 60e6 ? 1 : 2, data = new Uint8Array(44 + len * 2 * ch), dv = new DataView(data.buffer);
  const str = (o, t) => { for (let i = 0; i < t.length; i++) data[o + i] = t.charCodeAt(i); };
  str(0, "RIFF"); dv.setUint32(4, 36 + len * 2 * ch, true); str(8, "WAVEfmt "); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, ch, true);
  dv.setUint32(24, sr, true); dv.setUint32(28, sr * 2 * ch, true); dv.setUint16(32, 2 * ch, true); dv.setUint16(34, 16, true); str(36, "data"); dv.setUint32(40, len * 2 * ch, true);
  let o = 44;
  for (let i = 0; i < len; i++) { const j = i - shift;
    if (ch === 1) { const v = j >= 0 && j < ab.length ? (src[0][j] + src[1][j]) * 0.5 : 0; dv.setInt16(o, Math.max(-1, Math.min(1, v)) * 32767, true); o += 2; }
    else for (let c = 0; c < 2; c++) { const v = j >= 0 && j < ab.length ? src[c][j] : 0; dv.setInt16(o, Math.max(-1, Math.min(1, v)) * 32767, true); o += 2; } }
  return data;
}
/* The MIDI files. Quantized and rough, and labelled so in the file names and track metadata: Kick, Snare and Hi-hats are the detected pattern;
   808/Bass and Hook are the detected line folded to a 4-bar loop and repeated; Chords are SUGGESTED voicings built from the detected chord
   names, not notes heard in the audio. opts.tempo is the BPM to write: the app passes the TimeMap export grid's tempo (what the tracked
   beats actually follow, unrounded) so a long track does not drift off the audio; without it the analysis' tempo (a.bpm, 0.1 BPM steps) is used. */
function songMidiFiles(a, opts) {
  const N = songNotes(a), al = songAlign(a), sh = arr => arr.map(n => Object.assign({}, n, { t: n.t + al.ofs })), bpm = opts && opts.tempo != null ? opts.tempo : a.bpm;
  const q = `quantized to the 16th-note grid from bar 1 at ${Math.round(bpm * 1000) / 1000} BPM, 4/4; not the original timing`;
  // bass and hook: the full-track transcription at its real positions when the analysis has one; otherwise the 4-bar pattern repeated
  const nB = a.nBars || Math.floor(a.duration / a.barSec), tb = transcribedSteps(a, "bass", 0, nB + 1), th = transcribedSteps(a, "hook", 0, nB + 1);
  const bassNotes = tb || N.bass, hookNotes = th || N.hook;
  const bassHow = tb ? "rough transcription of the bass at its real positions in the song" : "detected bass line folded to 4 bars and repeated", hookHow = th ? "rough transcription of the top line at its real positions in the song" : "rough melody estimate folded to 4 bars and repeated";
  const files = [
    ["1 Kick", "1 Kick", N.D.kick, `Kick: detected pattern, ${q}`], ["2 Snare or clap", "2 Snare or clap", N.D.snare, `Snare or clap: detected pattern, ${q}`],
    ["3 Hi-hats", "3 Hi-hats", N.D.hats, `Hi-hats: detected pattern, ${q}`],
    is808(a, genreOf(a)) ? ["4 808", "4 808", bassNotes, `808: ${bassHow}, ${q}`] : ["4 Bass", "4 Bass", bassNotes, `Bass: ${bassHow}, ${q}`],
    ["5 Chords (suggested)", "5 Chords", N.chords, `Chords: SUGGESTED voicings generated from the detected chord names, not transcribed from the audio; ${q}`],
    ["6 Hook (rough)", "6 Hook", hookNotes, `Hook: ${hookHow}, ${q}`]];
  return files.filter(f => f[2].length).map(([n, label, notes, text]) => ({ name: `${n} - full song.mid`, data: midiBytes(sh(notes), bpm, { name: label, text }) }));
}
/* The full-track transcription (engine transcribeTrack: notes at their real positions, a.transcription) of one part, as 16th steps
   counted from bar startBar, for bars [startBar, endBar). A note that runs past endBar is cut there. null when the analysis has none
   (teardowns analysed before it existed): callers then fall back to the representative pattern and say so. */
/* The chords in time (docs/CHORDS.md): the analyzer's chord REGIONS (chordRegions, chords-v2: a chord where it changes, which need not be a
   bar line) when the teardown has them, else one chord per bar (chords.bars, saved teardowns from before regions). A bar the person
   corrected (a "chord" correction) shows their chord for that whole bar. Each span: { bar, s, e (16th steps from bar 1; end exclusive;
   negative in a pickup), t0, t1 (seconds; a per-bar span needs the grid), c, corrected }. Bars and regions without a chord are left out. */
function chordSpans(a, grid) {
  const bars = (a.chords && a.chords.bars) || [], R = a.chordRegions && a.chordRegions.regions, fixed = new Set((a.timingCorrections || []).filter(x => x.type === "chord").map(x => x.bar));
  const bt = b => grid ? grid.barStart(b) : null, isC = c => !!c && c !== "–", out = [];
  const perBar = b => { if (isC(bars[b])) out.push({ bar: b, s: b * 16, e: (b + 1) * 16, t0: bt(b), t1: bt(b + 1), c: bars[b], corrected: fixed.has(b) }); };
  if (!R || !R.length) { bars.forEach((_, b) => perBar(b)); return out; }
  R.forEach(r => {
    if (!isC(r.c)) return;
    const s = r.bar * 16 + Math.round(r.beat * 4), e = r.endBar != null ? r.endBar * 16 + Math.round(r.endBeat * 4) : s + 2; if (!(e > s)) return;
    const tAt = q => q === s ? r.t0 : q === e ? r.t1 : grid && q % 16 === 0 ? grid.barStart(q / 16) : r.t0 + (q - s) / (e - s) * (r.t1 - r.t0);
    // the parts of the region outside the corrected bars
    let q0 = s; for (let q = s; q <= e; q++) { const inFixed = q < e && fixed.has(Math.floor(q / 16));
      if (q === e || inFixed) { if (q > q0) out.push({ bar: Math.floor(q0 / 16), s: q0, e: q, t0: tAt(q0), t1: tAt(q), c: r.c, corrected: false }); q0 = q + 1; } }
  });
  fixed.forEach(b => perBar(b));
  return out.sort((p, q) => p.s - q.s);
}
/* a.transcription from the notes of a POLYPHONIC model (Basic Pitch): `notes` = [{ on, off, midi, vel }] in audio seconds. Split at C3
   (MIDI 48): below is the bass (`bass`), the rest is "Notes" (`lead`, the field the melody used, so every consumer keeps working).
   Each note gets its bar, beat (from bar 1, 16th resolution) and length in beats from the grid G (TimeMap wrapper: barOf, barStart),
   so a correction that moves the grid can relabel the same notes. method names the model and settings; nothing is quantized: on and
   off stay at their real times. */
const BASS_BELOW = 48;
function transcriptionFromNotes(a, G, notes, method) {
  const secOf = b => (a.sections || []).findIndex(sc => b >= sc.startBar && b < sc.startBar + sc.bars);
  const lab = n => {
    let b = G.barOf(n.on + 1e-6); const s0 = G.barStart(b), s1 = G.barStart(b + 1); let i = Math.round(16 * (n.on - s0) / (s1 - s0)); if (i >= 16) { b++; i -= 16; }
    return { on: +n.on.toFixed(3), off: +n.off.toFixed(3), midi: n.midi, vel: n.vel, bar: b, beat: +(b * 4 + i / 4).toFixed(3), dur: +((n.off - n.on) / ((s1 - s0) / 4)).toFixed(3), section: secOf(b) };
  };
  const all = (notes || []).filter(n => n.off > n.on && n.on >= 0).map(lab);
  return { version: 1, method: method || "basic-pitch", polyphonic: true, split: BASS_BELOW, grid: G.tracked ? "tracked" : "fallback", lead: all.filter(n => n.midi >= BASS_BELOW), bass: all.filter(n => n.midi < BASS_BELOW) };
}
/* The bar a whole-track file starts at: -1 when the transcription has a pickup (notes before bar 1), else 0. */
function pickupBar(a) { const T = a.transcription; return T && [...(T.lead || []), ...(T.bass || [])].some(n => n.bar < 0) ? -1 : 0; }
const startText = b => b < 0 ? "the file starts one bar before bar 1, so the pickup is kept" : `the file starts at bar ${b + 1}`;
function transcribedSteps(a, part, startBar, endBar) {
  const T = a.transcription, list = T && (part === "hook" ? T.lead : part === "bass" ? T.bass : null); if (!list) return null;
  const out = []; list.forEach(n => { if (n.bar < startBar || n.bar >= endBar) return; const t = Math.round(n.beat * 4) - startBar * 16, end = Math.min(t + Math.round(n.dur * 4), (endBar - startBar) * 16); if (end > t) out.push({ t, dur: end - t, midi: n.midi, vel: n.vel || 100 }); });
  return out;
}
/* One displayed part as a single small MIDI file, written by the same midiBytes as the full-song package (same 96-per-quarter grid, tempo
   and 4/4 events, same-pitch handling, labels). part "hook" or "bass": the phrase the piano roll shows (the detected 4-bar loop, notes in
   16th steps from its first bar), NOT the song-length repeat that songMidiFiles writes. part "chords": the detected chord of each bar of
   section {startBar, bars} as suggested triads, one per bar, starting at the section's first bar. opts.tempo is the export grid's BPM, as for
   songMidiFiles. Returns { name, data } or null when there is nothing to write. The caller checks exportGate first.
   opts.range = { startBar, endBar } (end exclusive) writes the transcribed notes in those bars, starting the file at startBar; opts.source
   "transcribed" | "pattern" chooses explicitly. Without either, hook/bass write the displayed 4-bar phrase, as before. */
function partMidi(a, part, opts) {
  if (opts && (opts.timing === "original" || opts.timing === "tempo-map")) return timedPartMidi(a, part, opts);
  const bpm = opts && opts.tempo != null ? opts.tempo : a.bpm, q = `quantized to the 16th-note grid at ${Math.round(bpm * 1000) / 1000} BPM, 4/4; not the original timing`;
  if (part === "hook" || part === "bass") {
    const label = part === "hook" ? (isPoly(a) ? "Notes" : "Top line") : isPoly(a) || !is808(a, genreOf(a)) ? "Bass" : "808", nBars = a.nBars || Math.floor(a.duration / a.barSec);
    // a range asks for the notes in those bars (the transcription when there is one); no range and no source keeps the displayed 4-bar phrase
    const src = opts && opts.source || (opts && opts.range && a.transcription ? "transcribed" : "pattern");
    if (src === "transcribed") {
      const r = opts && opts.range || { startBar: pickupBar(a), endBar: nBars + 1 }, notes = transcribedSteps(a, part, r.startBar, r.endBar); if (!notes || !notes.length) return null;
      const span = r.startBar <= 0 && r.endBar > nBars ? "entire track" : `bars ${r.startBar + 1}-${r.endBar}`;
      return { name: `${label} ${span} (rough transcription).mid`, data: midiBytes(notes, bpm, { name: label, text: `${label}: rough transcription at its real positions in the song, ${span === "entire track" ? "the entire track" : span} (${startText(r.startBar)}); ${q}` }) };
    }
    const pat = part === "hook" ? a.hook : a.bassline, min = part === "hook" ? 3 : 2; if (!pat || !pat.notes || pat.notes.length < min) return null;
    const from = pat.bar != null ? `bar ${pat.bar} of the song` : "the song";
    const notes = pat.notes.map(n => ({ t: n.t, dur: n.dur, midi: n.midi, vel: n.vel || 100 }));
    return { name: `${label} (rough, 4-bar phrase).mid`, data: midiBytes(notes, bpm, { name: label, text: `${label}: rough transcription read from ${from}, folded to a 4-bar phrase (a representative pattern, not every bar), ${q}` }) };
  }
  if (part === "chords") {
    // a range, else the section, else (neither: "Whole track") every bar from the pickup bar when the transcription has one
    const nB = a.nBars || Math.floor(a.duration / a.barSec), whole = !(opts && (opts.range || opts.section)), b0 = pickupBar(a);
    const sec = opts && opts.range ? { startBar: opts.range.startBar, bars: opts.range.endBar - opts.range.startBar } : opts && opts.section ? opts.section : { startBar: b0, bars: nB - b0 }; if (!(sec.bars > 0)) return null;
    const notes = [], lo = sec.startBar * 16, hi = (sec.startBar + sec.bars) * 16;
    chordSpans(a, null).forEach(sp => { const q0 = Math.max(sp.s, lo), q1 = Math.min(sp.e, hi); if (q1 > q0) chordFromName(sp.c).notes.forEach(m => notes.push({ t: q0 - lo, dur: q1 - q0, midi: m, vel: 85 })); });
    if (!notes.length) return null;
    const span = whole ? "the whole track" : `bars ${sec.startBar + 1} to ${sec.startBar + sec.bars}`;
    return { name: whole ? "Chords entire track (suggested voicings).mid" : `Chords bars ${sec.startBar + 1}-${sec.startBar + sec.bars} (suggested voicings).mid`, data: midiBytes(notes, bpm, { name: "Chords", text: `Chords: SUGGESTED voicings generated from the detected chord names for ${span}${whole && sec.startBar < 0 ? " (the file starts one bar before bar 1, so the pickup is kept)" : ""}, not transcribed from the audio; ${q}` }) };
  }
  throw new Error("partMidi: unknown part " + part);
}

/* ---- MIDI in three timings (docs/MIDI_EXPORT.md) ----
   "quantized"  notes snapped to the 16th grid at one tempo: only when exportGate allows it (a steady, verified grid).
   "original"   the transcription's onsets and ends in audio seconds, written at one reference tempo: correct whatever the beat grid is,
                as long as the file plays at that tempo (or the DAW imports the file's tempo). Bar lines in the DAW are not the song's.
   "tempo-map"  notes placed on the tracked beats and a tempo event wherever the beat length changes, so the file plays in the audio's time
                AND its bar lines follow the song. Needs tracked beats (not a fallback grid) and a result that is not stale.
   Chords are always SUGGESTED voicings of the detected chord names, one per bar, at the bar's position on the grid. grid = forAnalysis(a). */
const PPQ = 480, MODE_WORDS = { original: "original timing", "tempo-map": "tempo map", quantized: "quantized" };
function smfFile(tracks, tempos, title) {
  const vl = v => { const b = [v & 0x7f]; while ((v >>= 7)) b.unshift((v & 0x7f) | 0x80); return b; };
  const txt = (type, str) => { const b = Array.from(new TextEncoder().encode(str)); return [0xff, type, ...vl(b.length), ...b]; };
  const u32 = n => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
  tempos.forEach(t => { if (!(t.us >= 150000 && t.us <= 3000000)) throw new Error("smfFile: tempo " + (6e7 / t.us) + " BPM is outside 20 to 400"); });
  const conductor = tempos.map(t => [t.tick, [0xff, 0x51, 3, (t.us >> 16) & 255, (t.us >> 8) & 255, t.us & 255]]).concat([[0, [0xff, 0x58, 4, 4, 2, 24, 8]]]);
  const notesOf = tr => noteEvents(tr.notes).map(e => { if (!(e[0] >= 0)) throw new Error("smfFile: a note starts before the file"); return [e[0], [e[1], e[2], e[3]]]; });
  const chunk = (head, evs) => { evs = evs.slice().sort((x, y) => x[0] - y[0]); const out = []; head.filter(Boolean).forEach(h => out.push(0, ...h)); let last = 0;
    evs.forEach(([tk, b]) => { out.push(...vl(tk - last), ...b); last = tk; }); out.push(0, 0xff, 0x2f, 0); return [0x4d, 0x54, 0x72, 0x6b, ...u32(out.length)].concat(out); };
  const chunks = !title
    ? [chunk([txt(0x03, tracks[0].name), tracks[0].text && txt(0x01, tracks[0].text)], conductor.concat(notesOf(tracks[0])))]
    : [chunk([txt(0x03, title.name), title.text && txt(0x01, title.text)], conductor)].concat(tracks.map(tr => chunk([txt(0x03, tr.name), tr.text && txt(0x01, tr.text)], notesOf(tr))));
  const fmt = title ? 1 : 0, n = chunks.length;
  return new Uint8Array([0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, fmt, (n >> 8) & 255, n & 255, (PPQ >> 8) & 255, PPQ & 255].concat(...chunks));
}
/* The notes came from a polyphonic model (Basic Pitch, in the browser): every note it heard, split at C3 into Bass (below) and Notes (the
   rest), not a single melody. The older engine transcription is melody + bass. */
const isPoly = a => !!(a.transcription && a.transcription.polyphonic);
const partLabel = (a, part) => part === "hook" ? (isPoly(a) ? "Notes" : "Melody") : part === "bass" ? (isPoly(a) || !is808(a, genreOf(a)) ? "Bass" : "808") : "Chords";
const spanText = r => r ? `bars ${r.startBar + 1}-${r.endBar}` : "entire track";
/* The reference tempo for original timing: the export grid's tempo when beats were tracked, else the analysis tempo; returned as exactly
   what the file can hold (a whole number of microseconds per quarter), so ticks are converted with the tempo the reader will use. */
function refTempo(a, grid) { let bpm = a.bpm; try { const g = grid && grid.tracked && grid.map.exportGrid(); if (g && g.bpm >= 20 && g.bpm <= 400) bpm = g.bpm; } catch (e) {} return 6e7 / Math.round(6e7 / bpm); }
/* One part's notes in audio seconds ({ s0, s1, midi, vel }) for bars [range.startBar, range.endBar) (null = the whole track); null when
   there is nothing time-resolved to write. Melody and bass need the full-track transcription; chords come from the per-bar chord names. */
function partSeconds(a, part, grid, range) {
  const inR = b => !range || (b >= range.startBar && b < range.endBar), end = range ? Math.min(a.duration, grid.barStart(range.endBar)) : a.duration;
  if (part === "hook" || part === "bass") {
    const T = a.transcription, list = T && (part === "hook" ? T.lead : T.bass); if (!list) return null;
    const out = list.filter(n => inR(n.bar) && n.on < end).map(n => ({ s0: n.on, s1: Math.min(n.off, end), midi: n.midi, vel: n.vel || 100 })).filter(n => n.s1 > n.s0);
    return out.length ? out : null;
  }
  if (part === "chords") {
    // each chord where it sounds (chordSpans: regions when the analysis has them), cut at the range's bar lines
    const lo = range ? range.startBar * 16 : -Infinity, hi = range ? range.endBar * 16 : Infinity, out = [];
    chordSpans(a, grid).forEach(sp => { const q0 = Math.max(sp.s, lo), q1 = Math.min(sp.e, hi); if (!(q1 > q0)) return;
      const s0 = Math.max(0, q0 === sp.s ? sp.t0 : grid.barStart(q0 / 16)), s1 = Math.min(a.duration, q1 === sp.e ? sp.t1 : grid.barStart(q1 / 16));
      if (s1 > s0) chordFromName(sp.c).notes.forEach(m => out.push({ s0, s1, midi: m, vel: 85 })); });
    return out.length ? out : null;
  }
  throw new Error("partSeconds: unknown part " + part);
}
/* seconds -> ticks for one export, with the tempo events that make the ticks play back at those seconds. lists = every part's notes,
   so a whole-track tempo-map file can start at a pickup bar when a note comes before bar 1. */
function timeline(a, grid, timing, range, lists) {
  if (timing === "original") {
    const R = refTempo(a, grid), us = Math.round(6e7 / R), t0 = range ? Math.max(0, grid.barStart(range.startBar)) : 0;
    return { tempos: [{ tick: 0, us }], tick: s => Math.max(0, Math.round((s - t0) * 1e6 / us * PPQ)), refTempo: R, startSec: t0,
      words: `original timing: onsets and lengths as estimated in the audio, written at a reference tempo of ${+R.toFixed(3)} BPM. Play the file at that tempo (or import its tempo) to keep the timing; the DAW's bar lines are not the song's bars. File time 0 is ${fmtT(t0)} in the audio` };
  }
  if (timing === "tempo-map") {
    const map = grid.map, n = 4, first = Math.min(Infinity, ...lists.flat().map(x => x.s0));
    const startBar = range ? range.startBar : Math.min(0, isFinite(first) ? grid.barOf(first) : 0), q0 = (startBar + grid.barOffset) * n;
    const last = Math.max(0, ...lists.flat().map(x => x.s1)), K = Math.max(1, Math.ceil(map.timeToBeat(Math.max(last, grid.barStart(startBar))) - q0) + 1), t0 = map.beatToTime(q0), tempos = [];
    for (let k = 0, prev = 0; k < K; k++) { const us = Math.round((map.beatToTime(q0 + k + 1) - t0) * 1e6) - Math.round((map.beatToTime(q0 + k) - t0) * 1e6); if (us !== prev) tempos.push({ tick: k * PPQ, us }); prev = us; }
    return { tempos, tick: s => Math.max(0, Math.round((map.timeToBeat(s) - q0) * PPQ)), startSec: t0, startBar,
      words: `follows the song's tempo map: a tempo change wherever the tracked beat length changes, so notes play at their time in the audio and the bar lines follow the song. The file starts at bar ${startBar + 1} (${fmtT(Math.max(0, t0))} in the audio)` };
  }
  throw new Error("timeline: unknown timing " + timing);
}
const toTicks = (L, notes) => notes.map(x => { const on = L.tick(x.s0); return { on, off: Math.max(on + 1, L.tick(x.s1) - 1), midi: x.midi, vel: x.vel }; });
const kindOf = (part, a) => part === "chords" ? "SUGGESTED voicings generated from the detected chord names, not transcribed from the audio" : a && isPoly(a) ? "rough transcription of the audio by Spotify's Basic Pitch" : "rough transcription of the audio";
function timedPartMidi(a, part, opts) {
  const grid = opts.grid, r = opts.range || null, notes = partSeconds(a, part, grid, r); if (!notes) return null;
  const L = timeline(a, grid, opts.timing, r, [notes]), label = partLabel(a, part), kind = part === "chords" ? "suggested voicings" : "rough transcription";
  return { name: `${label} ${spanText(r)} (${kind}, ${MODE_WORDS[opts.timing]}).mid`, refTempo: L.refTempo,
    data: smfFile([{ name: label, text: `${label}: ${kindOf(part, a)}, ${spanText(r)}; ${L.words}.`, notes: toTicks(L, notes) }], L.tempos) };
}
/* Which MIDI timings this teardown can export now, and why not. confirmed = the person confirmed the bar lines (only quantized uses it). */
function midiModes(a, grid, confirmed) {
  const quantized = exportGate(a, grid && grid.map, confirmed), T = a.transcription;
  const parts = { hook: !!(T && T.lead && T.lead.length), bass: !!(T && T.bass && T.bass.length), chords: ((a.chords && a.chords.bars) || []).some(c => c && c !== "–") };
  const any = parts.hook || parts.bass || parts.chords;
  const original = { ok: any, parts, refTempo: refTempo(a, grid), why: any ? "" : "Nothing time-resolved to write. Analyse the track again to get its full transcription." };
  let tm = { ok: false, parts, caveats: [], why: "" };
  if (quantized.stale.length) tm.why = "Out of date after a correction. Upload the track again to follow its tempo.";
  else if (!grid || !grid.tracked) tm.why = "No tracked beats for this teardown, so there is no tempo map to follow. Use original timing.";
  else if (!any) tm.why = original.why;
  else {
    try { timeline(a, grid, "tempo-map", null, [[{ s0: 0, s1: a.duration }]]).tempos.forEach(t => { if (!(t.us >= 150000 && t.us <= 3000000)) throw new Error("tempo"); }); tm.ok = true; }
    catch (e) { tm.why = "The tracked beats include a tempo outside 20 to 400 BPM, so they can't be written as a tempo map. Use original timing."; }
    if (!confirmed && quantized.needs.includes("downbeat")) tm.caveats.push("Bar lines assume the analyzer's first downbeat; the note timing follows the audio either way.");
    if (!confirmed && quantized.needs.includes("meter")) tm.caveats.push("Bars assume 4/4.");
    if (quantized.reasons.some(x => /^tempo/.test(x))) tm.caveats.push("The tempo moves in this track; the file carries those changes.");
  }
  return { original, tempoMap: tm, quantized };
}
/* Every part in ONE Type 1 MIDI file: a tempo track, then Melody, Bass (or 808) and Chords (suggested), each with its own name and
   provenance text, all in one timing. Quantized uses opts.tempo (the export gate's tempo; the caller checks exportGate) and the
   transcription when the teardown has one, else the representative pattern repeated, as the full-song package does. */
function allPartsMidi(a, opts) {
  const timing = opts.timing || "quantized", r = opts.range || null, title = (a.title || "Teardown").trim(), tracks = [];
  let tempos, words, refT = null;
  if (timing === "quantized") {
    // a whole-track file starts at the pickup bar when there is one (step 0 = that bar), so the pickup is not dropped
    const bpm = opts.tempo != null ? opts.tempo : a.bpm, N = songNotes(a), nB = a.nBars || Math.floor(a.duration / a.barSec), b0 = r ? 0 : pickupBar(a), s0 = r ? r.startBar * 16 : 0, s1 = r ? r.endBar * 16 : Infinity;
    const src = { hook: transcribedSteps(a, "hook", b0, nB + 1) || N.hook, bass: transcribedSteps(a, "bass", b0, nB + 1) || N.bass, chords: [] };
    // chords are clipped to the exported bars, so a chord that began before the range and still sounds in it is kept
    { const lo = r ? r.startBar * 16 : b0 * 16, hi = r ? r.endBar * 16 : (nB + 1) * 16;
      chordSpans(a, null).forEach(sp => { const q0 = Math.max(sp.s, lo), q1 = Math.min(sp.e, hi); if (q1 > q0) chordFromName(sp.c).notes.forEach(m => src.chords.push({ t: q0 - b0 * 16, dur: q1 - q0, midi: m, vel: 85 })); }); }
    const T = 480 / 4; tempos = [{ tick: 0, us: Math.round(6e7 / bpm) }]; words = `quantized to the 16th-note grid at ${Math.round(bpm * 1000) / 1000} BPM, 4/4; not the original timing. ${startText(r ? r.startBar : b0).replace(/^t/, "T")}`;
    ["hook", "bass", "chords"].forEach(p => { const notes = src[p].filter(n => n.t >= s0 && n.t < s1).map(n => { const t = n.t - s0, e = Math.min(t + n.dur, s1 - s0); return { on: Math.round(t * T), off: Math.max(Math.round(t * T) + 1, Math.round(e * T) - 1), midi: n.midi, vel: n.vel || 100 }; });
      if (notes.length) tracks.push({ part: p, notes }); });
  } else {
    const lists = ["hook", "bass", "chords"].map(p => [p, partSeconds(a, p, opts.grid, r)]).filter(x => x[1]);
    const L = timeline(a, opts.grid, timing, r, lists.map(x => x[1])); tempos = L.tempos; words = L.words; refT = L.refTempo || null;
    lists.forEach(([p, notes]) => tracks.push({ part: p, notes: toTicks(L, notes) }));
  }
  if (!tracks.length) return null;
  const named = tracks.map(t => ({ name: t.part === "chords" ? "Chords (suggested)" : `${partLabel(a, t.part)} (rough)`, text: `${partLabel(a, t.part)}: ${kindOf(t.part, a)}, ${spanText(r)}.`, notes: t.notes }));
  return { name: `${title} - all parts ${spanText(r)} (${MODE_WORDS[timing]}).mid`, refTempo: refT,
    data: smfFile(named, tempos, { name: title, text: `Teardown export, ${spanText(r)}: ${words}.` }) };
}
/* The detected chord names for a section, as text to paste: bars separated by " | ", "N.C." where no chord was found. */
function chordNamesText(a, sec) {
  // one group per bar; a bar with more than one chord (chord regions) lists them in order
  const bars = (a.chords && a.chords.bars) || [], sp = chordSpans(a, null), out = [];
  for (let k = 0; k < sec.bars && sec.startBar + k < bars.length; k++) { const b = sec.startBar + k, lo = b * 16, hi = lo + 16;
    const here = sp.filter(x => x.s < hi && x.e > lo).map(x => x.c).filter((c, i, A) => i === 0 || c !== A[i - 1]); out.push(here.length ? here.join(" ") : "N.C."); }
  return out.join(" | ");
}
/* True when no kick and no snare was found anywhere (the main pattern or any section's pattern). Says nothing about vocals or other
   instruments; callers use it to stop offering drum tools for a track that has none to show, never to delete anything. */
function noDrumsFound(a) {
  const hit = p => !!p && ((p.kick || []).some(Boolean) || (p.snare || []).some(Boolean));
  return !hit(a.pattern) && !(a.drumParts || []).some(hit);
}
/* May the bar-aligned exports run, and why not. map is the TimeMap for this analysis (callers pass it: the domain has no TimeMap dependency);
   confirmed is whether the person has confirmed the downbeat and 4/4. A tempo or meter correction made without the audio blocks everything
   built on bars (stale), a refused grid (tempo changes, drift, other meters) stays refused whatever was confirmed, and a grid that is only
   an assumption needs the confirmation. Returns { canExport, state, stale, reasons, needs, caveats, tempo } where tempo is the BPM to write. */
function exportGate(a, map, confirmed) {
  const stale = staleReasons(a); let el;
  try { el = (confirmed ? map.confirmDownbeat().confirmMeter() : map).exportEligibility(); }
  catch (e) { el = { state: "refused", reasons: ["no-grid"], needs: [], caveats: [], exportGrid: null }; }
  const tempo = el.exportGrid ? el.exportGrid.bpm : null, canExport = !stale.length && el.state !== "refused" && (el.state === "allowed" || !!confirmed) && tempo != null;
  return { canExport, state: el.state, stale, reasons: el.reasons, needs: el.needs, caveats: el.caveats, tempo };
}
const PART_NAMES = [["tempo", "Tempo"], ["key", "Key"], ["drums", "Drums"], ["mix", "Mix balance"]];
function partScores(ref, me, c) {
  const pct = Math.abs(me.bpm - ref.bpm) / ref.bpm, hd = Math.abs(me.bpm * 2 - ref.bpm) / ref.bpm < 0.02 || Math.abs(me.bpm / 2 - ref.bpm) / ref.bpm < 0.02;
  const tempo = hd || pct <= 0.015 ? 100 : Math.max(0, Math.round(100 - pct * 1000));
  const kr = camRel(me.camelot, ref.camelot).ok, key = kr === 2 ? 100 : kr === 1 ? 60 : 0;
  const lanes = ["kick", "snare", "hats"].map(k => { const r = ref.pattern[k], m = me.pattern[k]; let both = 0, any = 0; r.forEach((v, i) => { if (v || m[i]) any++; if (v && m[i]) both++; }); return any ? both / any : 1; });
  const drums = Math.round(100 * lanes.reduce((p, q) => p + q, 0) / lanes.length);
  const gaps = ref.balance.map((rv, i) => Math.abs(10 * Math.log10((me.balance[i] + 0.05) / (rv + 0.05))));
  const mix = Math.round(gaps.reduce((p, g) => p + Math.max(0, 100 - g * 12), 0) / gaps.length);
  return { tempo, key, drums, mix };
}
function recomputeLoop(a) { const bars = a.chords.bars, loops = {}; for (let b = 0; b + 4 <= bars.length; b += 4) { const k = bars.slice(b, b + 4).join(" "); if (!k.includes("–")) loops[k] = (loops[k] || 0) + 1; } const best = Object.entries(loops).sort((p, q) => q[1] - p[1])[0]; if (best) { a.chords.loop = best[0].split(" "); a.chords.loopCount = best[1]; } }
function reviewHtml(a, q) {
  const secs = a.sections.map(x => ({ label: x.label, bars: `${x.startBar + 1}–${x.startBar + x.bars}`, at: fmtT(x.start) }));
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Review: ${esc(a.title || "my beat")}</title><style>
body{font:16px/1.5 system-ui,Segoe UI,sans-serif;color:#1a1c21;background:#f6f5f1;margin:0;padding:24px 16px}main{max-width:720px;margin:0 auto;background:#fff;border:1px solid #dddbd3;border-radius:14px;padding:24px}
h1{font-size:1.4rem;margin:0}.sub{color:#66645e;font-size:.9rem}.sec{border-top:1px solid #e7e5de;padding:12px 0;display:grid;gap:6px}.sec b{font-size:1rem}textarea{font:inherit;width:100%;min-height:54px;border:1px solid #cfccc2;border-radius:8px;padding:8px;box-sizing:border-box}
button{font:600 15px system-ui;background:#e8590c;color:#fff;border:0;border-radius:10px;padding:12px 18px;cursor:pointer}.q{border-left:4px solid #e8590c;background:#fff4ec;padding:10px 14px;border-radius:0 8px 8px 0;font-weight:600}</style></head><body><main>
<h1>Review: ${esc(a.title || "my beat")}</h1><p class="sub">${a.bpm} BPM · ${esc(a.key)} · from Ethan</p>
<p class="q">${esc(q || "What's the one thing you'd fix first?")}</p>
<p class="sub">Play my track alongside this page. Leave a note on any part (skip the ones that are fine), then press the button at the bottom and send me what it copies.</p>
${secs.map((x, i) => `<div class="sec"><b>${esc(x.label)} · bars ${x.bars} · starts ${x.at}</b><textarea data-i="${i}" placeholder="Your note on this part"></textarea></div>`).join("")}
<div class="sec"><b>Overall</b><textarea data-i="all" placeholder="Overall thoughts"></textarea></div>
<button id="copy">Copy my notes</button> <span id="ok" class="sub"></span>
<script>const S=${JSON.stringify(secs)};document.getElementById("copy").onclick=()=>{const t=[...document.querySelectorAll("textarea")].filter(x=>x.value.trim()).map(x=>x.dataset.i==="all"?"Overall: "+x.value.trim():S[+x.dataset.i].label+" (bars "+S[+x.dataset.i].bars+"): "+x.value.trim()).join("\\n");navigator.clipboard.writeText(t||"No notes").then(()=>{document.getElementById("ok").textContent="Copied. Paste it in your message to Ethan."},()=>{prompt("Copy this:",t)})};<\/script>
</main></body></html>`;
}
const loudestIdx = a => { let bi = 0, bv = -1; a.sections.forEach((x, i) => { const v = (x.label === "Drop" ? 3 : x.label === "Groove" ? 2 : x.label === "Build" ? 1 : 0) * 1000 + x.bars; if (v > bv) { bv = v; bi = i; } }); return bi; };
function swingText(a) {
  if (!a.swing) return "Swing: not enough in-between notes to measure. Keep notes on the grid unless your drums sound stiff next to the song.";
  const p = Math.round(a.swing.late * 100);
  return p < 4 ? "Swing: straight. Notes land right on the Piano roll grid, so keep Snap on and don't nudge anything."
    : p < 12 ? `Swing: light. The in-between 16th notes land about ${p}% of a square late. In the Piano roll, select those notes, hold Alt (turns snap off) and drag them a hair to the right. Match by ear.`
    : p < 22 ? `Swing: medium. The in-between 16th notes land about ${p}% of a square late. Select them in the Piano roll and Alt-drag them right by about a quarter of a square.`
    : `Swing: heavy, close to a triplet shuffle (about ${p}% of a square late). Set the Piano roll's Snap to 1/3 beat and draw the in-between notes on the triplet lines.`;
}
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
/* The mentor share page and message. `ctx` is page state: { planDone (ticked step ids), log (practice log), lastCompare }. Shared with the Svelte app. */
function shareData(a, question, ctx) {
  const g = GENRES[genreOf(a)], plan = buildPlan(a, genreOf(a)), done = ctx.planDone.length, st = logStats(ctx.log), c = ctx.lastCompare && ctx.lastCompare.ref === a ? ctx.lastCompare : null;
  const title = `${a.title || "Untitled song"}: teardown and my rebuild`;
  const facts = [["Tempo", a.bpm + " BPM"], ["Key", `${a.key} (${a.camelot})${a.keyFixed ? ", checked by ear" : ""}`], ["Style", g.name], ["Length", fmtT(a.duration)], ["Swing", a.swing ? Math.round(a.swing.late * 100) + "% of a step late" : "not measured"]];
  const drums = [["Kick", stepsText(a.pattern.kick)], ["Snare / clap", stepsText(a.pattern.snare)], ["Hi-hats", stepsText(a.pattern.hats)]];
  const arr = a.sections.map(s => `${s.label} (bars ${s.startBar + 1}–${s.startBar + s.bars})`);
  const chords = a.chords && a.chords.loop ? a.chords.loop.join(" → ") : "no clear loop found";
  const mine = c ? [`Closeness to the reference: ${c.score}%`].concat(c.fixes.slice(0, 3).map(f => `${f.area}: ${f.gap}`)) : ["Not compared yet."];
  const prog = [`Build plan: ${done} of ${plan.length} steps done`, `Practice: ${st.sessions} sessions, ${Math.round(st.minutes / 6) / 10} hours, ${st.streak}-day streak`];
  const q = question.trim() || "What is the one thing you would fix first?";
  const text = [title, "", facts.map(f => f.join(": ")).join(" · "), "", "Arrangement: " + arr.join(", "), "Drums (16 steps): " + drums.map(d => d.join(" ")).join("; "), "Chords: " + chords, "", "My version: " + mine.join(" | "), prog.join(" · "), "", "Question for you: " + q].join("\n");
  const grid = arrv => `<span class="g">${arrv.map((v, i) => `<i class="${v ? "on" : ""}${i % 4 === 0 ? " b" : ""}"></i>`).join("")}</span>`;
  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(title)}</title><style>
body{font:16px/1.5 system-ui,Segoe UI,sans-serif;color:#1a1c21;background:#f6f5f1;margin:0;padding:28px 18px}main{max-width:720px;margin:0 auto;background:#fff;border:1px solid #dddbd3;border-radius:14px;padding:26px}
h1{font-size:1.5rem;margin:0 0 4px}h2{font-size:.78rem;text-transform:uppercase;letter-spacing:.1em;color:#8a5a14;margin:22px 0 8px}p{margin:0 0 6px}.sub{color:#66645e;font-size:.9rem}
.facts{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:8px}.facts div{background:#f6f5f1;border-radius:8px;padding:8px 10px}.facts b{display:block;font-size:1.05rem}.facts span{font-size:.78rem;color:#66645e}
.dr{display:grid;grid-template-columns:96px 1fr;gap:8px;align-items:center;margin:4px 0;font-size:.85rem}.g{display:grid;grid-template-columns:repeat(16,1fr);gap:3px}.g i{height:16px;border-radius:3px;background:#e7e5de}.g i.b{background:#d6d3c9}.g i.on{background:#e8590c}
ul{margin:0;padding-left:20px}.q{border-left:4px solid #e8590c;background:#fff4ec;padding:10px 14px;border-radius:0 8px 8px 0;font-weight:600}</style></head><body><main>
<h1>${esc(a.title || "Untitled song")}</h1><p class="sub">Teardown and rebuild notes from Ethan · ${new Date().toLocaleDateString()}</p>
<h2>The song</h2><div class="facts">${facts.map(f => `<div><b>${esc(f[1])}</b><span>${esc(f[0])}</span></div>`).join("")}</div>
<h2>Arrangement</h2><p>${esc(arr.join(" → "))}</p>
<h2>Drum pattern (one bar, 16 steps)</h2>${[["Kick", a.pattern.kick], ["Snare / clap", a.pattern.snare], ["Hi-hats", a.pattern.hats]].map(d => `<div class="dr"><span>${d[0]}</span>${grid(d[1])}</div>`).join("")}
<h2>Chords</h2><p>${esc(chords)}</p>
<h2>My version</h2><ul>${mine.map(m => `<li>${esc(m)}</li>`).join("")}</ul>
<h2>Where I am</h2><ul>${prog.map(m => `<li>${esc(m)}</li>`).join("")}</ul>
<h2>My question for you</h2><p class="q">${esc(q)}</p>
<p class="sub" style="margin-top:18px">Numbers are estimates from an automatic analysis of the audio.</p></main></body></html>`;
  return { title, text, html };
}
const LIB = [["Drama","パソコン音楽クラブ, Mei Takahashi",137,"2B"],["Earth Beat","Yoshinori Sunahara",104,"3A"],["Cirrus","Bonobo",119,"7A"],["Sun Showered","Soichi Terada",122,"10A"],["Xtal","Aphex Twin",115,"8A"],["On the Run (feat. Grxve & Jake OHM)","Pdub",140,"3B"],["Snow","PLAUDO",123,"3B"],["Notice Me","George Clanton",107,"4A"],["Waitin' on Ya","Genesis Owusu",126,"7B"],["Beneath the Mask","Lyn",148,"7B"],["Coral Mimic","Iglooghost",162,"4B"],["MOMENTUM (feat. ilykimchi)","Skrillex, Zacari, Starrah",160,"9A"],["Once in a While (feat. Sonya Kitchell)","Break Science",170,"1A"],["Thinking About U","gum.mp3 & Dazegxd",170,"11B"],["Maybe","G Jones",164,"12B"],["Ssx","The Hellp",121,"7B"],["I Can't Feel At All","jssr",103,"10A"],["Wishes","Grant, McCall",99,"3B"],["Memory of the moment","Pasocom Music Club",139.5,"3B"],["@location","Peterparker69",132.5,"6B"],["Last of a Dying Breed","Joji, George Miller",166.8,"12B"],["what if?","Shelhiel, phritz",125,"11B"],["Self Love (Spider-Man: Across the Spider-Verse)","Metro Boomin",120.2,"11B"],["skyskysky","Peterparker69",166.8,"10B"],["music","Peterparker69, Jeter, Y Ohtrixpointnever",139.8,"11B"],["Monkey See","Peterparker69, Rosier, HUNA, tom huna, Jeter",135,"10B"],["Omatcha","Peterparker69, Jeter, Y Ohtrixpointnever",134.2,"1B"],["love it","Peterparker69, Jeter, Y Ohtrixpointnever",130,"10B"],["(null)","safmusic & Number Collector",139.8,"8B"],["pp home session","Peterparker69, Jeter, Y ohtrixpointnever",82,"7B"],["Hey phone","Peterparker69, Yojiro Noda, Jeter, Y ohtrixpointnever",105.5,"3B"],["Don't Stop the Music","Yurufuwa Gang, JayTrill, Malikai Hits, Ryugo Ishida, Sophiee",131,"3B"],["Heart(intro)","Pasocom Music Club",120.2,"4B"],["Go Slow","deca joins",110,"12B"],["spiderman4","Peterparker69, Jeter, Y ohtrixpointnever",127.8,"9B"],["Kaonashi","Tennyson",72.8,"7B"],["Spawn01 ft Cyst","Iglooghost, Cyst",170.2,"11B"],["left and right","play in stereo, phritz, Weatherson",134.2,"8B"],["turtle thief","PAS TASTA",113.5,"5B"],["cu","Peterparker69, Jeter, Y Ohtrixpointnever",124,"7B"],["Silver","uku kasai",136,"6B"],["Take my energy!","Syzy",143.5,"12B"],["blanc benzo","PAS TASTA, Peterparker69, Jeter, Y ohtrixpointnever",106,"2B"],["Remnant","G Jones",149.8,"12B"],["Dancing On the Edge","G Jones",117.5,"5B"],["DYKILY","Joji",166.8,"12A"],["LOVE YOU LESS","Joji",159.8,"10B"],["Rose Colored","Joji & Yeat",126,"2B"],["To Binge","Gorillaz",103.2,"10B"],["Magic Love","Fishmans, ZAK, Shinji Sato",147.8,"11B"],["Daydream","Fishmans",156.5,"9B"],["river relief","PAS TASTA, Soushi Sakiyama",122,"7B"],["Kyle (i found you)","Fred again.., Boo, Kyle Tran Myhre, Fred Gibson",112.2,"5B"],["Sweat Like Wine","Bloodbath64",130,"8B"],["ijustwannagoout","phritz, hirihiri",155,"5B"],["Machine Friends","Rosier",149.8,"1B"],["Revans","Sora",109,"5B"],["Glowing Experiences","G Jones",124,"12B"],["Lilaei mp3","Proc Fiskal",132.5,"6B"],["最後のメッセージ","kimj",128,"1B"],["fallpoi","Peterparker69, Jeter, Y ohtrixpointnever",123,"7B"],["H S K","NTsKi",120.2,"8B"],["need 2 kno","1-800 GIRLS, Jake Stewart",134.2,"3B"],["i know that","AOTO, M-3",139.8,"4B"],["Julia (deep diving)","Fred again.., Henry Counsell, Julia Michaels, Fred Gibson",128,"2B"],["Dawn (feat. Meesh meesh","Eliminate & Flux Pavilion",172.2,"10B"],["Yxguden","Evian Christ, Bladee",144.8,"4B"],["my passion is not a fashion, but style","AOTO, M-3",122,"10B"],["unlocking a hidden chapter☆","FREE JIMI & UHD",110,"11B"],["Si Llorarás","Thee Sinseers",148.8,"7B"],["loloi","Peterparker69, Jeter, Y ohtrixpointnever",100,"5B"],["Angie (i’ve been lost)","Fred again..",132.5,"1B"],["waiting for me & you :)","AOTO",160.2,"7B"],["no reply","Two Shell",156.8,"3B"],["I Think Of You","Ivy",110,"10B"],["Daisenn Park","Extra Small",145,"4B"],["Every Storm Hardens The Earth","Kenta204",138.5,"4B"],["Pokka Pokka","Fishmans",98,"8B"],["In My Room","G Jones",146.2,"11B"],["Third Coast","Teezo Touchdown",95,"3B"],["Goodbye Horses","Q Lazzarus",124.5,"8B"],["deadpool","Peterparker69, Jeter, Y ohtrixpointnever",112.5,"12B"],["Aruarian Dance","Nujabes",99.2,"2B"],["where 2人","Peterparker69, Jeter, Y ohtrixpointnever, phritz",137.2,"5B"],["Hello","Pasocom Music Club, Cwondo",132.5,"3B"],["Magazines Pt. II","Bloodbath64",159.8,"10B"],["EMOTION+LESS","o0o",96.8,"12B"],["Love Thru the Night (feat. Morgan Perry)","Mike Ault",128,"10B"],["Passkey of Hearts","Makay",126,"6B"],["Who's counting the days","Windows 96, Gavriel",166.8,"1B"],["FEEL IT","Disco Lines, Pluko",135,"1B"],["Me (heavy)","Fred again.., Henry Counsell, Fred Gibson",150,"9B"],["Child Replay","Pasocom Music Club, Shibata Satoko",113.2,"5B"],["KORABU (feat. Eurohead, Varg2™, Whitearmor & jamesjamesjames)","Skrillex, B-Girl & PARISI",149.8,"10B"],["アナグラム (99%除菌 screwed)","brain node",132.5,"2B"],["we are the90puggy","AOTO, M-3",116,"3B"],["SUNBURN","pluko, SHOOP, Sam Martinsen, Brandon Shoop",141.8,"5B"],["Fever Dream","plastic pet, Chelsea",139.8,"3B"],["I'm Gonna Miss You","Milli Vanilli",152,"11B"],["Marnie (wish i had u)","Fred again.., Alex Gibson, Fred Gibson",118,"8B"],["Be Mine","Amandla Stenberg",127,"8B"],["Boredom","Pasocom Music Club",136,"3B"],["Make It Forever","George Clanton",168,"8B"],["caminare solo","EthanUno, Kimj",114.2,"4B"],["Gravity/Chaos Flow (ft KUČKA)","Baauer & KUČKA",137,"6B"],["Matches","Underbelly",135,"3B"],["afraid gear (tellmeimlostw/ou)","es.cher, Choruses from the Rock",135,"3B"],["against all gods","m-flo",116.8,"10B"],["DITTO","Aries, Tim Aspan, Matt Jordan, Biskwiq",93,"12B"],["Knockin' On Heaven's Door","Bob Dylan",139.8,"9B"],["Ushirosugata","Fishmans",103.2,"11B"],["In My Mind","Lyn Lapid, Pom Pom, Katelyn Lapid, Kellen Pomeranz",136,"8B"],["22","Abstract, Delaney",110,"11B"],["Don't Fight It","Wavedash, Wylie Hopkins",164,"7B"],["untitled","semmmyq, shinra",172.2,"9B"],["LE SOURIRE D'UNE TOMBE","NeS",120.2,"1B"],["Sister","Frost Children",149.8,"11B"],["On Melancholy Hill","Gorillaz, Damon Albarn",120.2,"10B"],["Sweet Time","Porter Robinson",85,"10B"],["Key Of C","Dylan Brady, Dylan Marshall Brady",137.8,"10B"],["Can't Sleep Alone At Night","Leotrix",145,"3B"],["Bound2U","Frost Children",126,"8B"],["Any Noise","iVy",160.2,"2B"],["We Don't Need To Cross Our Paths Again","Lorenzi",130,"5B"],["Slide","George Clanton",91,"2B"],["Soulbreaker","A. G. Cook, Alexander Guy Cook",120.2,"12B"],["((( escape ))) (inst)","Kaede, Wendy Wander",111,"8B"],["You (Ha Ha Ha)","Charli xcx",132.5,"8B"],["solo","Fred again.. & Blanco",139.8,"3B"],["RECOVERY","Skrillex & Space Laces",149.8,"4A"],["Loop","Yoyou",137,"11B"],["Lula","uku kasai",129.2,"1B"],["Moss","Duskus, Simon White",136,"4B"],["No Broke Boys (AVELLO Remix)","Disco Lines, Tinashe, AVELLO",131,"1B"],["sunameri smoke","PAS TASTA, Cwondo",127.8,"1B"],["FASHION KILLA","FRIENDZONE",139.8,"1B"],["argyle","brakence, Randy Findell",139.5,"1B"],["Atarashi Karada","Dove",120.2,"6B"],["Waiting For The Clouds (feat. Substantial)","Nujabes",178.2,"3B"],["High Vision","safmusic",166.8,"11B"],["Clouds","uku kasai",173.8,"11B"],["Real Life","ear, Yaelle Avtan, Jonah Paz",145,"11B"],["Real Spring","Skrillex, Bladee, Benjamin Thage Dag Reichwald",156.5,"2B"],["long way home","phritz",110,"7B"],["Seeing What's Next","Hollywood Principle",139.8,"9B"],["Aquarium","Nosaj Thing",91,"8B"],["Horic","safmusic",110,"9B"],["Pretend","Pluko, Kota the Friend, Parker Livingston, Sam Martinsen",132.5,"3B"],["TALK2ME","pluko, Jukaa, EJEAN, Niko Rain, Sam Martinsen",139.8,"12B"],["I WANT SOMETHING MORE","kimj",143.5,"6B"],["It's Our Love","Thee Sacred Souls",120.8,"9B"],["Lil Thing","Knox Fortune",156.5,"9B"],["Come A Little Bit Closer","Jay & The Americans",132.5,"5B"],["Cut the Kid","Madeon, Hugo Leclercq",114.8,"10B"],["Ffroze","qquq",143.8,"7B"],["When I Forget Who I Am...?","Selfsteam",115.5,"10B"],["Believe What You Want","Virtual Riot, Valentin Brunn",149.8,"9B"],["burbank house","tsubi club",169.5,"11B"],["Divinity","Porter Robinson, Amy Millan",90,"10B"],["U Give Me Love","Baauer & Supafly",132.5,"1B"],["코카콜라","Effie",136,"1B"],["Boy’s Texture","Hakushi Hasegawa",160.2,"10B"],["I Got Demons in My Brain","Mare Interno",142.2,"1B"],["Ever (Foreign Flag)","Team Sleep",149.2,"11B"],["Public Beauty","Seba",87.5,"6A"],["hope(less) weekend","MAD DUBZ, qwaston",77.5,"4B"],["Industry Corporate Freak","Syzy",123.8,"10B"],["Unifier (feat. User2222)","AYEGY",135,"8B"],["Dream","Neggy Gemmy",105,"10B"],["Go!","Rosier",166.8,"1B"],["blush [2019]","damon r.",111,"11B"],["Summit","phritz",139.8,"7B"],["Houjou (Bonus Track)","safmusic, GREEN ROMANCE & asae morito",95,"3B"],["First Look","sysmo",117.2,"11B"],["Shimmer","Fabiana Palladino",95,"10B"],["Soap","ENTRO//",91,"11B"],["Forgotten, Fossilized, Archaic","Autumn's Grey Solace",160.2,"9B"],["Here<now","Y ohtrixpointnever",160.2,"10B"],["Hounds","Puma Blue",87,"3B"],["5wim!","Yoyou",126,"8B"],["Beautiful Superstar (Finn Keane Remix)","A. G. Cook, Finn Keane, Alexander Guy Cook",153,"2B"],["Butterflies","TV Girl, George Clanton",125,"6B"],["do-re-mi-fa-so-la-ti-do","Porter Robinson",114.8,"6B"],["eyes off the wheel, i'm a star","Jane Remover",90.5,"5B"],["Eternal","Athena & smle",155,"12B"],["Windcall","Atura",141.8,"10B"],["Coming In from the Cold (12\" Single Version)","Bob Marley & The Wailers",138.5,"8B"],["Too Far Gone","G Jones",120.2,"4B"],["You've Got Mail","iVy",107,"9B"],["Feathering","phritz & Weatherson",136,"4B"],["(Ding + Dong)","sysmo",124,"12B"],["Tours pt.2","Peterparker69, Jeter, Y ohtrixpointnever",117.5,"4B"],["New Energy","Virtual Riot, Valentin Brunn",145,"2B"],["I FEEL STRANGE","pluko, Sam Martinsen",132.5,"9B"],["Line Of Sight","ODESZA",179.8,"4B"],["Long Sardine","Oxis, tuna boon",120.2,"11B"],["Maybes","Giraffage, Japanese Breakfast",139.8,"2B"],["apple weather","Meltycanon",151,"4B"],["ariel","Tennyson, Luke Tennyson Pretty",139.8,"11B"],["Bone Dry","Tristam",160.2,"1B"],["The Avengers","Pandrezz & Epektase",87,"6B"],["Heaven","Ryan Leahan",155,"6B"],["Need You","Shin Sakiura",110,"8B"],["Feelwitchu","Tennyson",153,"3B"],["Love Exit","sysmo",143.5,"3B"],["Pixy Shadow","yunosame, Yew & サ柄直生",109.2,"5B"],["RIEN QUE POUR TOI","23wa, 0neo",115,"12B"],["Stream","somunia, hirihiri, Yaca",120.2,"8B"],["Japan","Throttle, Melle Stomp, Robert Bergin, Samuel Nicolosi",121.8,"12B"],["Closer Together","Baauer",128,"3B"],["condolence letter","Levi Ryan",110,"10B"],["iPod Touch","Ninajirachi",137.8,"5B"],["Surely There","OGRE YOU ASSHOLE",136.8,"1B"],["back2me","Yameii Online",125,"8B"],["This Song Reminds Me Of You","Jai Wolf",130,"3B"],["Moon Undah Water","Puma Blue",148.5,"2A"],["Reality Surf","Bladee",160.2,"9B"],["Ribs","Lorde, Joel Little, Ella Yelich O'Connor",128,"12A"],["Slipstream","Kiba",139.8,"3A"],["tell me","Dazegxd, MON",107.8,"11B"],["LIKE THIS","Atura",141.8,"5B"],["Need To Know (feat. ayrtn, cityboymoe, Korby, Rosier, Causier, JAHNI & LOLA)","BB, Jeshi & Maverick Sabre",136,"4A"],["Time After Time","Cyndi Lauper",130.2,"8B"],["Falling Down","Joe Walsh",118.8,"8B"],["Vale","Maribou State",145,"10B"],["d(-_-)b dreaming of your latte art d(-_-)b","Mietze Conte & 1tbsp",139.8,"8B"],["Lithium.Feedr","Proc Fiskal",100,"3B"],["Disco Bloodbath","Space Laces",114.8,"3B"],["Iron","Tennyson",116.5,"3B"],["1st kiss","horses_horses_horses",169.5,"11B"],["Souljaboi","mochi pop",99.2,"3B"],["ur name","i9bonsai",154.2,"10B"],["Paradise","Bazzi, Kevin White",122,"10B"],["Shelter","Porter Robinson, Madeon",100,"8B"],["Starlight","Jai Wolf, Mr Gabriel",85,"12B"],["Germ Chrism","Iglooghost",114.8,"12B"],["hed phon summr","Yoyou",152,"8B"],["i to i","Yoyou",136,"7B"],["ILUUUU","Syzy",145.8,"4B"],["bb u ok?","San Holo",156.5,"10B"],["be gentle with me","Two Shell, Samuel Charles Gellaitry",145,"8B"],["Chase It","WRLD, Savoi",110,"3B"],["Comfort Chain","Instupendo",110,"12B"],["Echo Lace","Iglooghost",139.8,"2A"],["Better","Baauer",130,"9B"],["White Flag","Dido",170.2,"7B"],["Night Cruising","Fishmans",142.5,"10B"],["A Day Like Any Other #2","In The Blue Shirt",136,"9B"],["Regret","New Order",129.2,"8B"],["WannaCry","Ninajirachi & Porter Robinson",136,"10B"],["Long Sardine (Flip)","OXIS & torr",120.2,"11B"],["10am Est.Rd 2018","Proc Fiskal",137.8,"11B"],["Immaterial","SOPHIE",100,"3B"],["Lay-By","Tennyson",117,"8B"],["stardust","ethn reis",152,"4B"],["你被我浪漫","白百EndlessWhite",137.8,"11B"],["The Flag is Raised","Bladee",137.8,"5B"],["Shanburuon","Texas 3000",126,"5B"],["SOJA","23wa",130,"6B"],["gray light","Soccer Mommy",136,"12B"],["Let's Dance","David Bowie, Nile Rodgers",114.8,"4B"],["let's go home","Jane Remover",134.2,"1B"],["Lure","Lokane",147.8,"12B"],["Building Steam With A Grain Of Salt","DJ Shadow, Jeremy Storch, Josh Davis",82.5,"5B"],["Chicago Loop","Wavedash, James Ivy",121,"6B"],["Somebody","Baauer",129.2,"7A"],["F.U.M.L.","George Clanton & Neggy Gemmy",126,"3B"],["Lay a Little Lovin' on Me","Redbone",107.5,"11B"],["risking all and everything","archive computer",95,"1B"],["Eyes (feat. Fox4g)","safmusic",122,"7B"],["Aco","sysmo",156.5,"7B"],["apollo","xo",113.2,"3B"],["FUCKMEUP","E.O.U, homarelanka, Vís",160.2,"8B"],["I Think...","Bladee",142.2,"8B"],["I'm God","Clams Casino, Imogen Heap",141.8,"10B"],["Jump the Turnstile","Jordana",160.2,"5B"],["Empire Ants","Gorillaz",99.5,"5B"],["Focus, move.","Adomiori & Otomachi Una",160,"3B"],["Enough","Atura",135,"10B"],["These Days","Dejector",136,"5B"],["Me Vs. Heidi","I Am Robot and Proud",122,"9B"],["Sono Inochi","Kaho Nakamura",90.2,"12B"],["Sirens","PLAUDO",179.8,"8B"],["Just My Imagination (Running Away With Me)","The Temptations",91.5,"8B"],["Ending the Episode","The broda",147.8,"8B"],["clove","saoirse dream & wishlane",118,"12B"],["UltraViolettt+","Pluko, demotapes",154.2,"3B"],["Un Coco","Bad Bunny",100,"1B"],["Second hand embarrassment","underscores, April Harper Grey",154.2,"10B"],["Social Bad Trip","JIN KAWAGUCHI",126,"11B"],["Hikikomori (Demo)","Jai Wolf, Sajeeb Saha",106.5,"11B"],["Linoleum","kmoe",120.2,"3B"],["Aadwark","Bert H",116,"10B"],["Assumptions","Sam Gellaitry",126,"11B"],["Beings","Madeon, Hugo Leclercq",106,"7B"],["Crush","Ethel Cain",94.8,"12B"],["Miss Mars","80Kidz",122,"8B"],["Missing You","Atura",139.8,"10B"],["Good Night Baby (feat. Moe Shop)","DENONBU,Moe Shop,Shian Inubousaki (CV: Rena Hasegawa)",125,"4B"],["Night Drive","Dove",120.2,"9A"],["Are Friends Electric?","Gary Numan & The Tubeway Army",96,"8B"],["Coming in Hot","Peter Tosh",156.5,"9B"],["uHazsh","Proc Fiskal",106.5,"9B"],["Memorias de Plástico","Rojuu, Carzé & Clutchill",149.8,"3B"],["FADE AWAY","San Holo & Tisoki",144.8,"2B"],["Mirai (pptime) [Peterparker69 Remix]","tofubeats",103.2,"1B"],["Lover's Hell","愛是唯一",100.5,"6B"],["the world ends (with) you.","lilbesh ramko",92.2,"10B"],["Ridiculous","Virtual Riot, Valentin Brunn",116,"1A"],["RUNNIN BACK TO YOU [03.27.21]","Pluko, Eldar Zeynalov, Parker Livingston",132.5,"5B"],["FALLING","pluko, Parker Livingston",145,"2B"],["Fresh Static Snow","Porter Robinson",91,"11B"],["Let's Go Outside","Far Caspian, Joel Johnston",141,"10B"],["Achilles","Shrimpnose, Riley Smithson",130,"10B"],["trauma","2hollis",145.8,"5B"],["whenyousayit","Atura & shy tea",139.8,"10B"],["How to Pretend","Lucy Bedroque",95,"10B"],["Fallen","Pauline Herr & Jon Casey",145,"8A"],["Sushi","Selfsteam",160.2,"8B"],["A Drink Before the War","Sun Angels",130,"6B"],["SHAKEN","WINK",70,"10B"],["jazz is for ordinary people","berlioz",119,"4B"],["way 2 good (idc)","Dazegxd",113.5,"12B"],["Wayside","Ninajirachi, Nina Jo Wilson, Jack Jody Laboz, Jack Laboz",145,"6B"],["We Are Young","fun., Janelle Monáe",92.2,"7B"],["Weird Fishes / Arpeggi","Radiohead",152,"10B"],["Western Union","Ecco2k",147.8,"12B"],["Mysëlf","Yeat, BNYX, Noah Smith",134.2,"6B"],["Star Level","Gavriel",160.2,"3B"],["That Look in Your Eye","G Jones",149.8,"11B"],["Flight To Mumbai (PAS TASTA Remix)","Peterparker69, Pas Tasta",130,"6B"],["deadpool (kimj Remix)","Peterparker69, Kimj",168.8,"12B"],["Who's Loving You","Jackson 5",166.8,"9B"],["Leave You Alone (feat. Ne-Yo)","Jeezy",94.5,"11A"],["Run + Ran","Ken Carson",141.8,"10B"],["Corner (feat. DELL & fc2united)","O.B.S",96.8,"11B"],["80Hd","Pocket",134.2,"3B"],["Escape (The Pina Colada Song)","Rupert Holmes",139.5,"8B"],["Waiting For the Sun","Yuransen",146.2,"12A"],["strawberry☆chop","tsubi club",100,"4B"],["two bad","2hollis",132.5,"6B"],["Where Do We Go","Eurohead, Simon Hessman, Barbara Braccini",145,"3B"],["Tennis Court","Lorde, Joel Little, Ella Yelich O'Connor",120.2,"8B"],["Gone","lucidbeatz, Ardeycat, Miras Narken, Daiana Storland",139.8,"8B"],["headlock","Purity Filter",120.2,"11B"],["Leave Me Like This","Skrillex",125,"7B"],["Life We Live","Project Pat",154.2,"12A"],["Be Nice 2 Me","Bladee",139.8,"10B"],["Beams","Reuben Vaun Smith",100,"5A"],["Better Not","Louis The Child",114,"12B"],["Bewitched","A. G. Cook, Alexander Guy Cook",95.2,"9B"],["Harlem in the 80s (feat. KoolKidKalvo)","AJ Snow",89,"12A"],["Take My Breath Away (Love Theme from \"Top Gun\")","Berlin",95.8,"4B"],["Fire for You","Cannons",102,"10B"],["2 seconds (Bonus)","Jhené Aiko",126,"9B"],["Quiereme","LATIN MAFIA, Fred again.. & bby",172.2,"6B"],["It's You","Ninajirachi & daine",130,"8B"],["Duro","Skrillex & Young Miko",149.8,"5B"],["Mumbai Power (feat. Beam)","Skrillex",139.8,"5B"],["Dumb Ways to Die","Tangerine Kitty",128.5,"8B"],["Here Comes the Sun","The Beatles",128.5,"11B"],["Duppy Conqueror","The Wailers",143.5,"8B"],["your clothes","Jane Remover",134.2,"4B"],["Nothing's Gonna Hurt You Baby","Cigarettes After Sex",97.5,"12B"],["Now","Yeat, Luh geeky, BNYX, BEAUTIFULMVN, Noah Smith",134.2,"11B"],["Party","Bad Bunny, Rauw Alejandro",97,"11B"],["Pixel Empire","Madeon, Hugo Leclercq",100,"7B"],["Gomenn","Cwondo",117.5,"6B"],["Had2Go","Wavedash",126,"5B"],["Heaven Knows I'm Miserable Now","The Smiths, John Porter, Johnny Marr, Morrissey",114.2,"2B"],["IT HURTS!","San Holo, Sander van Dijck, Rutger van Woudenberg",147.5,"10B"],["book of spells","ivri, tomcbumpz, Ivriana Wright",112.2,"5B"],["Come On Eileen","Dexys Midnight Runners",106,"8B"],["Daydreams","G Jones",149.8,"2B"],["Everybody's dead! (Virtual Riot Version)","underscores, April Harper Grey",106.5,"8B"],["Everything Perfect","James Ivy",91,"8B"],["Ptolemy","Aphex Twin",117.5,"3B"],["My Way","Frank Sinatra",153,"10B"],["Sabishikunai","Kaneko Ayano",109.8,"9B"],["Dreadlocks In Moonlight","Lee \"Scratch\" Perry",131.8,"9B"],["Top Dog","Magdalena Bay",145,"9B"],["In My Life","The Beatles",102.8,"11B"],["Somewhere","deca joins",179.8,"10B"],["Darling","愛是唯一",139.5,"9B"],["Until The Sun Dies","Isla Den, Fayt",147.8,"7B"],["Slowly","Giraffage, Matosic",108.8,"11B"],["fantasista","hirihiri, lilbesh ramko",135,"9B"],["Fork Funeral","Virtual Riot",128.2,"7B"],["It's Always Been You","Estle",95.2,"5B"],["IYKYK","San Holo, Amanda Joy",75,"10B"],["Lover Come Back (To Me)","Dead or Alive",125.2,"9B"],["Audio","Finn Keane",125,"3B"],["Baby My Phone","Yameii Online",97.5,"6B"],["bugging!","brakence, Randy Findell",120.2,"2B"],["Cut! Cut! Cut!","blednost.",139.8,"7B"],["Digital Love","Daft Punk",124.5,"11B"],["drank 3 of my parents' craft beers to make eye contact with you","brakence, login, Randy Findell, Logan Mcleod, ASMR Sharm",120.2,"11B"],["Talking Too Much (feat. Bawo)","ATRIP",135,"5B"],["Beetlebum (2012 Remaster)","Blur",179.8,"8B"],["Kismet","FREE JIMI",126,"3B"],["Make You Cry","George Clanton",101.2,"7B"],["Plymouth Simulation","Gupi",169.5,"10B"],["Lif3","HXG",143.5,"8B"],["Can't Keep a Good Man Down (feat. Jason Joshua)","Jason Joshua & The Beholders",109.2,"1A"],["Cómo Le Digo","KHEA",130,"9A"],["Back To You","Lorenzi",80,"7B"],["Last Surprise","Lyn",123,"7B"],["Have You Seen Her","MC Hammer",144.5,"12B"],["Battery Death","Ninajirachi",150,"11B"],["Swordfish","Pocket",99.2,"5B"],["SMILING/HIDING (feat. Au5)","San Holo, Kompany, Allegra Miles & Underbelly",143.5,"1B"],["Partner","Tom VR",127,"10B"],["renai circulation pluggnb","cadenkala",97.5,"12B"],["9TAiLF0X","kimj",152,"3B"],["Tiptoeing (Tommy Villiers Remix)","Hope Tala, Greg Kurstin, Maureen \"Mozella\" McDonald",147.8,"8B"],["Tokyo Nights","Digital Farm Animals",105,"10B"],["Vent","FIVE NEW OLD, Hiroshi Nakahara",128,"9B"],["Yes Way≠No Way","Yurufuwa Gang, Automatic, Ryugo Ishida, Sophiee",127,"7B"],["mokuyoubi:freestyle","lilbesh ramko",110,"9B"],["nerve","kmoe",109,"3B"],["Obedient","Bladee",117.5,"1B"],["Pretty Boy","Joji, Lil Yachty",156.5,"3B"],["Quiver","SILK, Oliver Ettridge",131,"3B"],["Rain","Papa Khan",149.8,"8B"],["Silver","A. G. Cook, Alexander Guy Cook",126.2,"7B"],["Feel It","Kiryano, roxas358",101.2,"10B"],["Flicker","Porter Robinson",92.2,"2B"],["fractions of infinity","Quadeca",138,"4B"],["Guess Who's Back","Rakim",94,"5A"],["LETTING GO!!!!!!","San Holo, Amanda Joy, Sander van Dijck",149.8,"7B"],["Magic I Want U","Jane Remover",132.5,"2B"],["16 Lines","Lil Peep",106,"8B"],["always somewhere","Deathbrain",145,"8B"],["Beetlebum","Blur",179.8,"8B"],["Cccan't You See (French Extended Mix)","Vicious Pink, Moss, Warden",124,"12A"],["cloak n dagger","glaive, ericdoa",110,"3B"],["Danger","Etro Anime",117.5,"8B"],["deepfake","brakence, Randy Findell",126.2,"11B"],["DIRT","Y2K",135,"4A"],["Dumb","George Clanton",179.8,"8B"],["Empathy","Crystal Castles, Alice Glass, Alex Bonenfant, Ethan Kath",110,"6B"],["entropy","lazydoll",147.8,"8B"],["Back To Black","Amy Winehouse",123.2,"7A"],["Caribbean Queen (No More Love On the Run)","Billy Ocean",113.8,"8B"],["Stir It Up","Bob Marley & The Wailers",149.8,"11B"],["Sun Is Shining","Bob Marley & The Wailers",129.2,"2A"],["!!-MAJOR","Friendzone",139.8,"5B"],["Some of your love (Remix)","Khromeheartsbam",139.8,"9B"],["Funkytown","Lipps, Inc.",122.2,"8B"],["Inferno","Mrs. GREEN APPLE",92.2,"12B"],["Hollow","Of The Trees & LYNY",139.8,"10B"],["Hold Out","Pocket & Matt Ryder",137,"5B"],["Your Arms","Pocket",139.5,"6B"],["dallas love (feat. Westwood & nxah)","Sebii & kimj",139.8,"12B"],["Control","Traci Lords",140.8,"7B"],["Downfall","acloudyskye",160.2,"7B"],["cyber milk is your waifu","cyber milkchan",121.5,"10B"],["time","xo",156.8,"7B"],["Where'd U Go (with Said the Sky)","Illenium, Said the Sky",87,"10B"],["No morë talk","Yeat, BNYX, Noah Smith, Benjamin Saint Fort",153,"8B"],["Reason","SILK",132.5,"10B"],["SAYONARA","Aries",152,"7B"],["Spoiled little brat","underscores, April Harper Grey",86,"7B"],["Mind Reader","gum.mp3, Alston Watson",161.5,"7B"],["((( escape )))","Kaede, Ikuko Harada, Wendy Wander",147.8,"8B"],["4EVER","Clairo",102.5,"8B"],["Ex-Factor","Lauryn Hill",160.2,"2B"],["Eyes Closed","Sebii",160,"8B"],["Warhorse","2hollis",106.8,"7B"],["Twwen","Cwondo",145,"5B"],["Had Enough (feat. Offset & Quavo)","Don Toliver",147.8,"11B"],["Push","Fog Lake",142.2,"8B"],["ten","Fred again.. & Jozzy",128.2,"10B"],["adore u","Fred again.. & Obongjayar",124,"8B"],["scared","Fred again.. & Young Thug",126,"5B"],["Winny","Fred again.., Sammy Virji & Winny",139.8,"1A"],["Chlorine","George Daniel",139.8,"8B"],["Pursuit of Happiness (Nightmare) [feat. MGMT & Ratatat]","Kid Cudi",115.5,"8B"],["Alvafro","LATIN MAFIA & Fred again..",137.8,"4B"],["Two-Way Mirror","Loathe",160.2,"11B"],["Overdue (feat. Travis Scott)","Metro Boomin",149.8,"10B"],["Nee","Perfume",128,"7B"],["Ladies and gentlemen we are floating in space","Spiritualized",100,"10B"],["Fauxllennium","TV Girl & George Clanton",97,"10B"],["Pantyhose","TV Girl",100.5,"9B"],["Light My Fire","The Doors",126,"2A"],["I Kno","Whitearmor",84,"8B"],["3:45/buslane","lavender",135,"3B"],["lust","rei harakami",114.8,"5B"],["BURNMATERIAL","tsubi club",139.8,"11B"],["without you","Senses",143.5,"3B"],["NOBODY","San Holo",142.2,"3B"],["On tha linë","Yeat",149,"9B"],["feelthisway","pluko, Sam Martinsen, Frank Dukes",130,"12B"],["Gradual Paths","Windows 96, Gabriel Eduardo",90,"8B"],["just4u","urboii., xHEIDIx",147.5,"11B"],["Luv Myself","Kvi Baba, AKLO, KEIJU, BACHLOGIC",100,"11B"],["21st Century Breakdown","Green Day",115,"3B"],["Air Supply","Sweet Trip",124,"7A"],["deficit","mindvacy",120.2,"11B"],["Signal","1-800 GIRLS",132.5,"12B"],["Now That I'm Falling","33 Below & Pola & Bryson",114.8,"4B"],["without U","Atura & Demotapes",132.5,"10B"],["Pogo","Digitalism",136,"6B"],["winter wing (feat. botanical anomaly)","DreamWeaver",156.8,"1B"],["Cut","Duskus",136,"1B"],["back2life","EthanUno",136,"8B"],["Jungle","Fred again..",134.2,"12B"],["Slow Country","Gorillaz",143.5,"12B"],["Melodie","IDIOTAPE",128,"12B"],["Fell For U","Jake Timothy",160.2,"10B"],["Hamabe","Keiichi Sokabe",166.8,"11B"],["Somebody's Doin' Me Right","Keith Whitley",87,"7B"],["Raspberry Sun","LOVE WONDERLAND",156.8,"10B"],["THE zone~","Lil Yachty",82,"3B"],["Poetry Of You","Love Remain",139.8,"4B"],["Pillow Talk","Lustt",126,"10B"],["BOUNCE N SLIDE","Machinedrum",139.8,"1B"],["Understand (feat. Brendan Yates)","Mall Grab",135,"1B"],["When You Left","Mechatok",129.2,"3B"],["I Feel Best When I'm Alone","Michael Seyer",136,"1B"],["真夜中のドア/Stay With Me","Miki Matsubara",106.5,"7B"],["How many miles","Mk.gee",137.8,"7B"],["Outside of the House","OGRE YOU ASSHOLE",106,"1B"],["Love & Pop (feat. Chanel Beads)","Oli XL",121,"8B"],["Calling Out","Overmono",137,"9A"],["1uwant","Pocket",139.8,"6B"],["Bugged","Refreshers",107.8,"6B"],["Material Lover","SIENNA SPIRO",103.2,"9B"],["BKK","Sebii & kimj",147.5,"12A"],["Last 1s Left","Skepta & Fred again..",137,"7A"],["Kill Everybody","Skrillex",127,"7A"],["Untitled","Starlit",155,"12B"],["Pillars","Sunny Day Real Estate",132.5,"9A"],["Monday Moon","The Quincey",117.5,"8B"],["Can't Fix You","The Red Clay Strays",136,"5B"],["Did U Ever Notice","Travis Bretzer",149.8,"9B"],["Windspeaks","Uyama Hiroto",123,"11B"],["die while loving","Xamd",139.8,"5B"],["Parachute","Yuransen",113.2,"3B"],["Lost You (feat. Twin Shadow & D'Angelo Lacy)","Zeds Dead",126,"8A"],["cannonball 〇〇〇〇〇〇〇〇〇〇〇〇〇〇〇〇〇〇〇〇〇〇〇〇〇","cratre",113.2,"1B"],["Coil","ear",157.8,"3B"],["Little Drummer Boy (Live)","for KING & COUNTRY",104,"10B"],["PSYCHO TECH","pluko & Kill Eva",103.2,"8B"],["Nighttime","re:plus",93,"10B"],["孤單女孩","李權哲",107.2,"7A"],["Take Me Home","PinkPantheress, Future Cut, kearneyonline",114.8,"11B"],["Jazz Club","Accelio, ROOXG",110,"5B"],["Ratrace","Elujay",101.2,"12A"],["Summer's Gone","honeydip",150,"10B"],["Hope","Duskus",132.5,"8B"],["Trying to Feel Alive","Porter Robinson",107.8,"2B"],["call me","play in stereo",139.8,"3B"],["finger frame","PAS TASTA, Mamiko Suzuki",132.5,"8B"],["Thinking About U","gum.mp3, Dazegxd",169.5,"11B"],["Look Mom I'm An Elephant","Lorenzi",145,"10B"],["INTO YOU","Wavedash",147.8,"3B"],["new year, still here","Peterparker69",139.8,"9B"],["Not alone","KOTONOHOUSE, rinahamu",160.2,"4B"],["squiz pt.2","AOTO, M-3",149.8,"8B"],["Angie (interlude)","Fred again..",132.5,"1B"],["yeah is back","AOTO, M-3",110,"3B"],["Charger","Shin Sakiura",90,"12A"],["Something Comforting","Porter Robinson",143.5,"5B"],["7 Stars!","Lorenzi",130,"4B"],["APRIL [eyes]","Pluko, Sam Martinsen, Parker Livingston, demotapes",139.8,"6B"],["時間があれば会おうね","kimj",127,"9B"],["wilmette","phritz",124,"8B"],["Roberto Baggio","AOTO, M-3",143.5,"1B"],["JUMP OUT","pluko, Daniel Allan",135,"7B"],["在日","kimj",129.2,"5B"],["RIPPED JEANS","pluko, Sam Martinsen",143.5,"9B"],["Lonely Cowboy Tales (Crayon Moon Remix)","Lorenzi, Crayon Moon",130,"9B"],["chōsenjin","kimj",143.8,"8B"],["Won't Make A Sound","ARMNHMR, NURKO, Micah Martin",141.5,"7B"],["SKYFALLING","Wavedash, Flux Pavilion, Meesh",155,"10B"],["hello everybody :)","kimj",156.8,"12B"],["LOVELY2*","Pluko, Sam Martinsen",124,"12B"],["crash out","kimj",127,"3B"],["Musician","Porter Robinson",120.2,"3B"],["Lucifer","A. G. Cook",107.8,"11B"],["OK YES","pluko, Reo Cragun, Daniel Allan, Sam Martinsen",143.5,"10B"],["FANTASMA","Jeter, Y ohtrixpointnever, SEEDA",110.8,"10B"],["Familiar Frontiers","G Jones",149.8,"3B"],["purification","Kabanagu",110,"5B"],["Wasurenaide (feat. Yuta Nakamura)","ShowyRENZO",128,"7B"],["Minamo","uku kasai",131,"7B"],["RUN INTO MY ARMS","Pluko, Sam Martinsen, Duskus, Simon White, Victor Simonelli",132.5,"1B"],["7-11","kimj, Cayenne, Linna Figg",130,"10B"],["Hotel California","Joji",92.2,"12B"],["Love Me Better","Joji",116.2,"9B"],["No Looking","Bloodbath64",129.2,"12B"],["SAVE ME","Pluko",126.8,"10B"],["SIREN","TUNA DISPLAY, Simone Marchiori",80,"5B"],["Are We Still Young (feat. Jessi Mason)","Grant",110,"5B"],["Cigarette","Joji",110,"6B"],["Tarmac","Joji",161.5,"3B"],["Drawing","uku kasai & tofubeats",148.8,"10B"],["Year of the Cup","Porter Robinson",123,"9B"],["nichijou:loopmania","lilbesh ramko",143.5,"3B"],["Lifelike","Porter Robinson",100.8,"6B"],["Magazines","Bloodbath64",78,"7B"],["BULLDOZER","PAS TASTA",170.2,"5B"],["Knock Yourself Out XD","Porter Robinson",87,"2B"],["August in the water","safmusic, One Boiling Point, suL",106.5,"12B"],["OCEANA","Pluko, Sam Martinsen",114.8,"4A"],["Running in Place","Bloodbath64",130,"8B"],["So Hot You're Hurting My Feelings","Caroline Polachek, Daniel Nigro, Teddy Geiger",112.2,"3B"],["Kiss City","Blondshell",166.8,"11B"],["change my mind","phritz",124,"5B"],["Limeade","phritz",134.2,"5B"]];
function sampleList(a, gk) {
  const root = String(a.key).split(" ")[0], minor = /minor/.test(a.key), bpm = Math.round(a.bpm);
  const mood = minor ? "dark" : "bright";
  const style = { house: "house", techno: "techno", dnb: "drum and bass", hardstyle: "hardstyle", dubstep: "dubstep", trap: "trap", hyperpop: "hyperpop", ambient: "ambient", pop: "pop" }[gk] || "electronic";
  const hats = a.pattern ? hatFeel(a.pattern.hats) : "";
  const subHeavy = a.balance && a.balance[0] > REF[0] * 1.2;
  const bright = a.balance && (a.balance[4] + a.balance[5]) > 20;
  const hasBuild = a.sections && a.sections.some(s => s.label === "Build" || s.label === "Drop");
  const L = [];
  L.push({ type: "Kick", folder: "Drums\\Kicks", q: `${style} kick one shot`, why: a.rhythm && a.rhythm.fourFloor ? "Four-on-the-floor song: pick a short, punchy kick with a clear click so it cuts through on every beat." : "Broken / half-time groove: pick a kick with a bit of body. Short if you're using an 808 under it.", tip: "Grab 3–5 and A/B them over the song. Keep the one whose thump matches the reference." });
  L.push({ type: "Snare / clap", folder: "Drums\\Snares & Claps", q: `${style} ${gk === "trap" || gk === "hyperpop" ? "clap" : "snare"} one shot`, why: "The backbeat. Layer a clap over a snare if one alone sounds thin.", tip: "Look for 'layered' or 'crispy' in names for modern sounds." });
  L.push({ type: "Hi-hats", folder: "Drums\\Hats & Cymbals", q: `${style} ${/16th|busy/.test(hats) ? "hi hat roll" : "closed hi hat"} one shot`, why: `This song's hats are ${hats || "steady"}. ${bright ? "The top end is bright, so pick crisp, sizzly hats." : "The top end is soft, so pick darker or filtered hats."}`, tip: "Also grab 1 open hat for accents." });
  L.push({ type: subHeavy ? "808" : "Bass", folder: "808s & Bass", q: subHeavy ? `808 one shot ${root}` : `${style} bass one shot ${root}`, why: subHeavy ? `This song is sub-heavy. Find an 808 tuned to ${root} so it fits ${a.key} without retuning.` : `Bass in ${root} so it sits in ${a.key}.`, tip: "Any 808 works if you set its root note: Channel settings → right-click the keyboard → set root note." });
  L.push({ type: "Melodic loop", folder: "Melodic", q: `${mood} ${style} melody loop ${bpm} bpm ${a.key}`, why: `Matches the tempo (${bpm}) and key (${a.key}), so it drops straight in. Use it as inspiration or chop it.`, tip: "If the BPM is off, drag it in anyway and use Stretch mode in the sample's channel settings." });
  L.push({ type: "Vocal chop", folder: "Vocals\\Chops & One-shots", q: `vocal chop ${root} ${minor ? "minor" : "major"}`, why: "A one-word or 'ahh' chop gives the hook a human feel. Key matters: get one in " + root + ".", tip: "Royalty-free acapellas are also fun to slice in Slicex." });
  L.push(hasBuild
    ? { type: "Riser + impact", folder: "FX & Transitions", q: `${style} riser impact fx`, why: "This song has builds and drops. A riser before and an impact on beat 1 of the drop sells the transition.", tip: "Pick risers 4 or 8 bars long at " + bpm + " BPM." }
    : { type: "Texture", folder: "Atmospheres & Textures", q: `${mood} atmosphere texture vinyl`, why: "This song stays on one groove, so the interest comes from small details. A background texture fills space.", tip: "Keep it quiet, -15 dB under the beat." });
  return L;
}
const SECTION_HOW = {
  Intro: "Drums thinned out or filtered. Introduce one element at a time.",
  Build: "Rising energy: snare roll, riser, filter sweep up. Cut the kick in the last bar.",
  Drop: "Everything in: full drums, bass and the main hook. Loudest part.",
  Groove: "Main groove without the full hook. Verse or mid-energy section.",
  Breakdown: "Drums out, pads and melody carry it. A breather before the next build.",
  Outro: "Strip layers away for DJs to mix out."
};
function moodTags(a) {
  const t = [];
  t.push(/minor/.test(a.key) ? "Dark / emotional" : "Bright / uplifting");
  t.push(a.bpm >= 140 ? "High-energy" : a.bpm >= 118 ? "Driving" : a.bpm >= 95 ? "Groovy" : "Laid-back");
  if (a.balance[0] + a.balance[1] > 50) t.push("Bass-heavy");
  if (a.balance[4] + a.balance[5] > 20) t.push("Crisp top end");
  if (a.width > 0.4) t.push("Wide / spacious");
  if (a.crest < 9) t.push("Loud, squashed master");
  if (a.steady) t.push("Hypnotic, one groove");
  return t;
}
const chordNotes = c => { if (!c || c === "–") return ""; const m = c.endsWith("m"), r = NAMES.indexOf(m ? c.slice(0, -1) : c); return [0, m ? 3 : 4, 7].map(d => NAMES[(r + d) % 12]).join(" · "); };
function keyChords(key) { const r = NAMES.indexOf(key.split(" ")[0]), mi = /minor/.test(key), n = (d, m) => NAMES[(r + d) % 12] + (m ? "m" : "");
  return new Set(mi ? [n(0, 1), n(3), n(5, 1), n(7, 1), n(7), n(8), n(10)] : [n(0), n(2, 1), n(4, 1), n(5), n(7), n(9, 1), n(10)]); } // incl. the common borrowed chord (bVII / major V)
function compress(list) { const out = []; list.forEach(c => { const last = out[out.length - 1]; if (last && last.c === c) last.n++; else out.push({ c, n: 1 }); }); return out.map(o => o.n > 1 ? `${o.c} ×${o.n}` : o.c).join("  ·  ") || "–"; }
/* ---- Corrections (Phase 2d, docs/ROADMAP.md step 7) -------------------------------------------------------------------------------
   A correction never overwrites what was measured without a trace. Every one is recorded on the result as
     { type, from, to, source: "user", at, ... }    in `timingCorrections` (types: bpm, key, downbeat, meter, chord, drum),
   so the original value is always recoverable ("from"), and nothing is given a made-up confidence (the old hard-coded 99 is gone: the
   measured bpmConf and keyConf stay as measured). What depends on a corrected value is then either
     recomputed: a tempo or first-downbeat correction re-runs the analysis from the same audio with that value fixed
                 (engine.analyzeDecoded(buffer, ..., forcedOf(a))), so the result IS a fresh analysis at those values; or
     invalidated: without the audio that is not possible, so everything built on the bar grid is marked stale (staleReasons) and must not
                 be shown as valid or exported until the track is analysed again. */
function recordCorrection(a, c) {
  const list = (a.timingCorrections || []).slice(), at = new Date().toISOString();
  const same = x => x.type === c.type && (c.type === "chord" ? x.bar === c.bar : c.type === "drum" ? x.lane === c.lane && x.step === c.step : false);
  const i = list.findIndex(same), entry = Object.assign({}, c, { source: "user", at });
  if (i >= 0) { entry.from = list[i].from; if (entry.from === entry.to) list.splice(i, 1); else list[i] = entry; } else list.push(entry); // repeated edits of one chord or step keep the ORIGINAL value
  a.timingCorrections = list.slice(-500);
  return a;
}
/* What a re-analysis must hold fixed, derived from the recorded corrections: the last tempo the user chose, and the total they moved bar 1. */
function forcedOf(a) {
  const list = a.timingCorrections || [], bpms = list.filter(x => x.type === "bpm"), shift = list.filter(x => x.type === "downbeat").reduce((p, x) => p + (x.shift || 0), 0);
  const f = {}; if (bpms.length) f.bpm = bpms[bpms.length - 1].to; if (((shift % 4) + 4) % 4) f.downbeatShift = ((shift % 4) + 4) % 4;
  return f;
}
/* Why what is built on the bar grid (drum pattern, chords, notes, exports) cannot be trusted right now: "tempo" (corrected without the audio
   to recompute from), "meter" (the user says it is not 4/4, which the analyzer cannot read). Empty means consistent. */
function staleReasons(a) { const r = []; if (a.bpmFixed) r.push("tempo"); if (a.notFourFour) r.push("meter"); return r; }
function applyKey(a, keyName) {
  const was = a.key, root = NAMES.indexOf(keyName.split(" ")[0]), mi = /minor/.test(keyName);
  a.key = NAMES[root] + (mi ? " minor" : " major"); a.camelot = (mi ? CAM_MIN : CAM_MAJ)[root];
  a.relKey = NAMES[mi ? (root + 3) % 12 : (root + 9) % 12] + (mi ? " major" : " minor"); a.keyFixed = true;
  recordCorrection(a, { type: "key", from: was, to: a.key });
}
/* Tempo correction WITHOUT the audio (a saved teardown): the bar grid changes but nothing built on it can be recomputed, so it is marked stale.
   With the audio the app re-runs the analysis instead (forcedOf + engine.analyzeDecoded) and never calls this. */
function applyTempo(a, nb) {
  nb = Math.round(nb * 10) / 10; if (!(nb >= 50 && nb <= 220)) return false;
  TimingStore.ensure(a); // keep what the tracker measured (its beats and original tempo) before the correction changes the tempo
  const before = a.bpm;
  a.bpm = nb; a.barSec = +(240 / nb).toFixed(3); a.nBars = Math.max(1, Math.floor(a.duration / a.barSec)); a.bpmFixed = true;
  recordCorrection(a, { type: "bpm", from: before, to: nb });
  // The corrected tempo invalidates every time derived from the tracked bars: sections drop their "tracked" times and are recomputed from
  // the corrected bars (as before the tracked-section change), so the section table, timeline, loops and ruler stay consistent.
  a.sections.forEach(s => { s.startBar = Math.round(s.start / a.barSec); s.bars = Math.max(1, Math.round((s.end - s.start) / a.barSec)); delete s.timing; });
  return true;
}
/* "This isn't in 4/4": the analyzer reads every track as 4/4 and cannot detect anything else, so everything built on its bars is unreliable. */
function applyMeter(a, notFour) { if (!!a.notFourFour === !!notFour) return false; a.notFourFour = !!notFour || undefined; if (!notFour) delete a.notFourFour; recordCorrection(a, { type: "meter", from: notFour ? "4/4" : "not 4/4", to: notFour ? "not 4/4" : "4/4" }); return true; }
const pcOf = k => NAMES.indexOf(String(k).split(" ")[0]);
function camRel(a, b) {
  const na = parseInt(a, 10), nb = parseInt(b, 10), la = a.slice(-1), lb = b.slice(-1), d = Math.min((na - nb + 12) % 12, (nb - na + 12) % 12);
  if (a === b) return { ok: 2, text: "Same key" };
  if (na === nb) return { ok: 2, text: "Relative key (same notes, different mood)" };
  if (la === lb && d === 1) return { ok: 1, text: "Neighbor key on the Camelot wheel" };
  return { ok: 0, text: "Different key" };
}
function compare(ref, me) {
  const fixes = [], rows = [];
  let score = 100;
  // tempo
  const pct = 100 * (me.bpm - ref.bpm) / ref.bpm;
  const halfDouble = Math.abs(me.bpm * 2 - ref.bpm) / ref.bpm < 0.02 || Math.abs(me.bpm / 2 - ref.bpm) / ref.bpm < 0.02;
  if (Math.abs(pct) > 1.5 && !halfDouble) { score -= 15; fixes.push({ area: "Tempo", gap: `${me.bpm} vs ${ref.bpm} BPM`, fix: `Set FL Studio's tempo (top bar) to ${ref.bpm}.` }); }
  rows.push(["Tempo", ref.bpm + " BPM", me.bpm + " BPM", halfDouble ? "Half/double time (fine)" : Math.abs(pct) <= 1.5 ? "Match" : (pct > 0 ? "+" : "") + pct.toFixed(1) + "%"]);
  // key
  const kr = camRel(me.camelot, ref.camelot);
  if (kr.ok === 0) {
    let semis = ((pcOf(ref.key) - pcOf(me.key)) % 12 + 12) % 12; if (semis > 6) semis -= 12;
    score -= 15;
    fixes.push({ area: "Key", gap: `${me.key} (${me.camelot}) vs ${ref.key} (${ref.camelot})`, fix: `In the Piano Roll, select all notes (Ctrl+A) and move them ${semis > 0 ? "up" : "down"} ${Math.abs(semis)} semitone${Math.abs(semis) === 1 ? "" : "s"}, then turn on scale lock for ${ref.key}. If the key read was low confidence, check by ear first.` });
  }
  rows.push(["Key", ref.camelot + " · " + ref.key, me.camelot + " · " + me.key, kr.text]);
  // balance
  const bandFix = [
    ["Fruity Parametric EQ 2 on the sub/808: boost a low shelf around 50 Hz, or turn up the sub channel.", "Cut a low shelf below 60 Hz on the bass, and high-pass anything else that has sub."],
    ["Turn up the bass channel, or boost 80–150 Hz on the bass with Parametric EQ 2.", "Cut 100–200 Hz on the bass or pads; check the kick and bass aren't stacking (sidechain)."],
    ["Your low mids are thin: boost 300–500 Hz a little on chords or pads.", "Muddy: cut 2–4 dB around 300 Hz on pads, chords and vocals."],
    ["Bring up the lead or chords, or boost 1–2 kHz on them.", "Too much mid: cut 1–2 kHz on pads so the lead stands out."],
    ["Add presence: boost 3–5 kHz on the lead, snare and vocals.", "Harsh: cut 3–5 kHz a little on the brightest synth."],
    ["Add air: a high shelf (+2–3 dB from 8 kHz) on hats and synths.", "Too bright: low-pass pads around 8–10 kHz, use darker hats."]
  ];
  const bandRows = [];
  ref.balance.forEach((rv, i) => {
    const mv = me.balance[i], d = 10 * Math.log10((mv + 0.05) / (rv + 0.05));
    bandRows.push([BANDS[i], rv + "%", mv + "%", (d > 0 ? "+" : "") + d.toFixed(1) + " dB"]);
    if (Math.abs(d) >= 3) { score -= Math.min(8, Math.abs(d)); fixes.push({ area: BANDS[i], gap: `${d > 0 ? "+" : ""}${d.toFixed(1)} dB vs the reference`, fix: d < 0 ? bandFix[i][0] : bandFix[i][1] }); }
  });
  // loudness and punch
  const ld = me.loudRms - ref.loudRms;
  rows.push(["Loudness (loud parts)", ref.loudRms + " dBFS", me.loudRms + " dBFS", (ld > 0 ? "+" : "") + ld.toFixed(1) + " dB"]);
  if (ld < -3) { score -= 8; fixes.push({ area: "Loudness", gap: `${Math.abs(ld).toFixed(1)} dB quieter`, fix: "Normal before mastering. When the mix is done, put Fruity Limiter on the master, raise Gain slowly until you're within 1–2 dB of the reference, and keep the ceiling at −0.3 dB." }); }
  if (ld > 2) { score -= 5; fixes.push({ area: "Loudness", gap: `${ld.toFixed(1)} dB louder`, fix: "You're pushing harder than the reference. Lower the master limiter's gain so drums keep their punch." }); }
  const cd = me.crest - ref.crest;
  rows.push(["Punch (crest)", ref.crest + " dB", me.crest + " dB", Math.abs(cd) < 3 ? "Similar" : cd > 0 ? "More dynamic" : "More squashed"]);
  if (cd > 4) fixes.push({ area: "Punch", gap: `${cd.toFixed(1)} dB more dynamic`, fix: "The reference is more compressed. Try Fruity Compressor on the drum bus (ratio 4:1, a few dB of reduction), then the master limiter." });
  const wd = me.width - ref.width;
  rows.push(["Stereo width", String(ref.width), String(me.width), Math.abs(wd) < 0.1 ? "Similar" : wd > 0 ? "Wider" : "Narrower"]);
  if (wd < -0.12) fixes.push({ area: "Width", gap: "Narrower than the reference", fix: "Widen pads and leads with Fruity Stereo Shaper or a chorus. Keep kick, bass and sub centered." });
  if (wd > 0.15) fixes.push({ area: "Width", gap: "Wider than the reference", fix: "Bring a few wide parts toward the center, and make sure the bass is mono." });
  // drums
  const lanes = [["Kick", "kick"], ["Snare / clap", "snare"], ["Hi-hats", "hats"]], drumRows = [];
  lanes.forEach(([name, k]) => {
    const r = ref.pattern[k], m = me.pattern[k];
    const missing = r.map((v, i) => v && !m[i] ? posOf(i) : 0).filter(Boolean), extra = r.map((v, i) => !v && m[i] ? posOf(i) : 0).filter(Boolean);
    drumRows.push({ name, r, m });
    if (missing.length || extra.length) {
      score -= Math.min(10, (missing.length + extra.length) * 2);
      fixes.push({ area: name, gap: [missing.length ? "missing at beats " + missing.join(", ") : "", extra.length ? "extra hits at beats " + extra.join(", ") : ""].filter(Boolean).join("; "), fix: `In the ${name.toLowerCase()}'s Piano roll (Snap 1/4 beat): ${missing.length ? "draw notes at " + missing.join(", ") : ""}${missing.length && extra.length ? ", and " : ""}${extra.length ? "delete the notes at " + extra.join(", ") : ""}.` });
    }
  });
  // arrangement
  const fd = x => (x.sections.find(s => s.label === "Drop") || {}).startBar;
  const rD = fd(ref), mD = fd(me);
  if (rD != null) {
    rows.push(["First drop", "bar " + (rD + 1), mD != null ? "bar " + (mD + 1) : "not found", mD == null ? "Add a drop" : mD === rD ? "Match" : (mD - rD > 0 ? "+" : "") + (mD - rD) + " bars"]);
    if (mD == null) { score -= 8; fixes.push({ area: "Arrangement", gap: "No clear drop found in your version", fix: "Make one section clearly the loudest and fullest: bring in full drums, bass and the hook together, after a 4–8 bar build." }); }
    else if (Math.abs(mD - rD) >= 8) { score -= 5; fixes.push({ area: "Arrangement", gap: `Your first drop lands ${Math.abs(mD - rD)} bars ${mD > rD ? "later" : "earlier"}`, fix: `Move your build and drop in the Playlist so the drop starts at bar ${rD + 1}.` }); }
  }
  score = Math.max(0, Math.round(score));
  const summary = { closeness_score: score, top_fixes: fixes.slice(0, 6).map(f => `${f.area}: ${f.gap}`), my_bpm: me.bpm, my_key: me.key, my_balance: me.balance, my_loud_rms: me.loudRms };
  return { score, fixes, rows, bandRows, drumRows, summary };
}
function coachData(a, ctx) {
  const IDEAS = ctx.ideas, lastCompare = ctx.lastCompare;
  return { song: a.title || "unnamed track", style_guess: GENRES[genreOf(a)].name, bpm: a.bpm, key: a.key, camelot: a.camelot, key_confidence: a.keyConf, relative_key: a.relKey,
    drum_steps_1_to_16: { kick: stepsText(a.pattern.kick), snare_clap: stepsText(a.pattern.snare), hats: stepsText(a.pattern.hats), ghost_notes: a.pattern.ghost ? { snare: stepsText(a.pattern.ghost.snare), hats: stepsText(a.pattern.ghost.hats) } : "none", edited_by_user: !!a.patternEdited },
    key_set_by_user_by_ear: !!a.keyFixed, bass_note_heard_most: a.bassNote || "?", chord_loop: a.chords && a.chords.loop ? a.chords.loop.join(" - ") : "unclear", rhythm: a.rhythm,
    arrangement: a.sections.map(s => `${s.label}: bars ${s.startBar + 1}-${s.startBar + s.bars} (${fmtT(s.start)})`), energy_balance_percent: Object.fromEntries(BANDS.map((b, i) => [b, a.balance[i]])),
    stereo_width: a.width, crest_db: a.crest, loud_part_rms_dbfs: a.loudRms,
    my_version_compared_to_this_song: lastCompare && lastCompare.ref === a ? lastCompare.summary : "not uploaded yet",
    ideas_on_screen: IDEAS.id === tdId(a) ? { drums: IDEAS.drums.label, bass: IDEAS.bass.label, chords: IDEAS.chords.chords.map(c => c.name).join(" - ") + " (" + IDEAS.chords.rhythm.label + ")", melody: IDEAS.melody.label + ": " + IDEAS.melody.notes.slice(0, 12).map(n => flNote(n.midi)).join(" "), vocal_chop: IDEAS.chop.label } : "none yet" };
}
const COACH_SETUP = `You are a friendly music-production coach teaching a beginner who uses FL Studio 2026 Signature Bundle and learns by doing.

THEIR SETUP (only recommend these, plus the free synth Vital if truly needed):
- Instruments: FLEX, Sytrus, 3x Osc, FL Keys, BooBass, FPC, Harmless, DirectWave, Sampler channels, Slicex, Edison. NOT Harmor or Transistor Bass.
- Effects: Fruity Parametric EQ 2, Fruity Limiter (also for sidechain), Fruity Compressor, Fruity Soft Clipper, Fruity Fast Dist, Fruity Blood Overdrive, Fruity Reeverb 2, Fruity Delay 3, Fruity Filter, Fruity Stereo Shaper, Maximus, Gross Beat, Low Lifter, Pitcher, NewTone, Vintage Chorus, Vintage Phaser, Fruity Granulizer, Wave Candy.
- Sample library folders: samples → Drums (Kicks, Snares & Claps, Hats & Cymbals, Percussion, Loops), 808s & Bass, Melodic, Vocals, FX & Transitions, Atmospheres & Textures. Includes the NEWGEN drum kit.
FL FACTS (use these exact paths, don't invent shortcuts):
- F6 Channel Rack, F7 Piano roll, F5 Playlist, F9 Mixer. Ctrl+L routes selected channels to mixer tracks.
- Tempo: right-click the tempo box → Type in value.
- The user works in the Piano roll and Playlist only; never tell them to click Channel Rack steps. Give drum positions as beat.square with Snap at 1/4 beat (1.1 = start of beat 1, 2.3 = beat 2 third square), drawn on the C5 row.
- One pattern per instrument (F4 new pattern), one Playlist track per instrument. Paint tool (B) drags clips along a track; Draw tool (P).
- Import MIDI into a Piano roll: small arrow top-left → File → Import MIDI file.
- Swing in the Piano roll: select off-beat notes, hold Alt and drag slightly right.
- Velocity: in the Piano roll's velocity lane at the bottom (drag bars).
- Hat rolls: Piano roll Snap (magnet) to 1/2 or 1/4 step, then draw notes.
- 808 glide: channel settings → Miscellaneous (wrench) tab → Polyphony → Mono + Porta, then overlap notes.
- 808 root note: channel settings → right-click the matching key on the keyboard at the bottom.
- Scale highlighting: Piano roll arrow menu → View → Helpers → Scale highlighting.
- Export MP3: FILE → Export → MP3 file (Ctrl+Shift+R).
- FL names middle C as C5 (MIDI note 60).
If you're not sure of an FL menu path, say "look for" instead of inventing one.
Answer in plain words, in numbered steps, naming the exact plugin and the main knobs or values. Keep it under 250 words unless they ask for more. End with one small thing to try in the next 10 minutes. Don't use markdown headings or bold markers.`;
const STYPES = ["Kick", "Snare / Clap", "Hi-hat", "Percussion", "808 / Bass", "Melodic one-shot", "Vocal", "Drum loop", "Melodic loop", "FX / Texture"];
const SFOLDER = { "Kick": "Drums\\Kicks", "Snare / Clap": "Drums\\Snares & Claps", "Hi-hat": "Drums\\Hats & Cymbals", "Percussion": "Drums\\Percussion", "808 / Bass": "808s & Bass", "Melodic one-shot": "Melodic", "Vocal": "Vocals\\Chops & One-shots", "Drum loop": "Drums\\Loops", "Melodic loop": "Melodic", "FX / Texture": "FX & Transitions" };
const STIP = {
  "Kick": "Drag it into the Channel Rack as a new channel, then draw its notes in the Piano roll. With an 808, sidechain the 808 to the kick or shorten the 808's start so they don't clash.",
  "Snare / Clap": "Classic spot: steps 5 and 13. Layer a snare and a clap on the same steps for a fuller hit.",
  "Hi-hat": "Program 8ths, then make rolls: in the Piano Roll select a note and use Tools → Chop at 1/32. Vary velocity.",
  "Percussion": "Use it for fills and off-beat accents. Pan it a little left or right so it doesn't crowd the kick.",
  "808 / Bass": "Tune it: open the channel, right-click its root key on the channel's keyboard → Set root note (use the note shown). Then the Piano Roll plays it in tune.",
  "Melodic one-shot": "Load it into a channel and play it from the Piano Roll. The note shown is its root, so set that as the root note like an 808.",
  "Vocal": "Chop it: drop it in the Playlist, slice with C, and rearrange. Pitch it with Pitcher or the channel pitch knob.",
  "Drum loop": "Set your project to the loop's BPM, then drag it into the Playlist. Or load it in Slicex to chop and rearrange the hits.",
  "Melodic loop": "Match tempo and key, then drag it into the Playlist. Build drums and bass around it.",
  "FX / Texture": "Put risers 1–2 bars before a drop, impacts on the first beat of a drop, textures low in the mix under everything."
};
const SCALES = { major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10] };
function yin(x, SR, start, W, fmin, fmax) {
  const maxTau = Math.floor(SR / fmin), minTau = Math.max(2, Math.floor(SR / fmax));
  if (start + W + maxTau > x.length) start = x.length - W - maxTau;
  if (start < 0) return null;
  const d = new Float32Array(maxTau + 1);
  for (let tau = 1; tau <= maxTau; tau++) { let s = 0; for (let i = 0; i < W; i++) { const df = x[start + i] - x[start + i + tau]; s += df * df; } d[tau] = s; }
  const c = new Float32Array(maxTau + 1); c[0] = 1; let run = 0;
  for (let tau = 1; tau <= maxTau; tau++) { run += d[tau]; c[tau] = run ? d[tau] * tau / run : 1; }
  let tau = -1;
  for (let t = minTau; t < maxTau; t++) if (c[t] < 0.15 && c[t] <= c[t + 1]) { tau = t; break; }
  if (tau < 0) { let m = 1; for (let t = minTau; t < maxTau; t++) if (c[t] < m) { m = c[t]; tau = t; } if (m > 0.35) return null; }
  const a = c[tau - 1], b = c[tau], e = c[tau + 1] ?? b, den = a - 2 * b + e, shift = den ? 0.5 * (a - e) / den : 0;
  return { f: SR / (tau + shift), conf: +(1 - b).toFixed(2) };
}
function noteOf(f) { const m = 69 + 12 * Math.log2(f / 440), r = Math.round(m); return { midi: r, name: NAMES[((r % 12) + 12) % 12] + (Math.floor(r / 12) - 1), cents: Math.round((m - r) * 100) }; }
async function analyzeSample(file) {
  const ctx = new OfflineAudioContext(1, 22050, 22050), SR = 22050;
  const ab = await ctx.decodeAudioData(await file.arrayBuffer());
  const x = ab.getChannelData(0), n = x.length, dur = ab.duration;
  let pk = 0, pi = 0, ss = 0; for (let i = 0; i < n; i++) { const v = Math.abs(x[i]); if (v > pk) { pk = v; pi = i; } ss += x[i] * x[i]; }
  let last = 0; for (let i = n - 1; i >= 0; i--) if (Math.abs(x[i]) > pk * 0.01) { last = i; break; }
  const env = []; for (let i = 0; i < n; i += 256) { let m = 0; for (let j = i; j < Math.min(n, i + 256); j++) m = Math.max(m, Math.abs(x[j])); env.push(m); }
  // spectrum over the body of the sound
  const N = 2048, mg = new Float32Array(N / 2), acc = new Float64Array(N / 2); let fr = 0;
  for (let off = Math.max(0, pi - 256); off + N <= Math.min(n, pi + SR * 1.5) && fr < 24; off += 1024, fr++) { mag(x, off, N, mg); for (let i = 0; i < N / 2; i++) acc[i] += mg[i]; }
  if (!fr) { mag(x, 0, N, mg); for (let i = 0; i < N / 2; i++) acc[i] += mg[i]; fr = 1; }
  let tot = 0, cen = 0, low = 0, lg = 0, cnt = 0;
  for (let i = 1; i < N / 2; i++) { const v = acc[i] / fr, f = i * SR / N; tot += v; cen += v * f; if (f < 150) low += v; if (f > 60 && f < 8000) { lg += Math.log(v + 1e-9); cnt++; } }
  const am = (() => { let s = 0, c = 0; for (let i = 1; i < N / 2; i++) { const f = i * SR / N; if (f > 60 && f < 8000) { s += acc[i] / fr; c++; } } return s / (c || 1); })();
  const centroid = tot ? cen / tot : 0, lowShare = tot ? low / tot : 0, flat = Math.exp(lg / (cnt || 1)) / (am || 1);
  // pitch on the sustained part
  const W = 2048, p = dur > 0.12 ? yin(x, SR, Math.min(n - 1, pi + Math.round(SR * 0.04)), W, 30, 1200) : null;
  const tonal = !!(p && p.conf > 0.8 && flat < 0.25);
  // loop / tempo
  let bpm = null, onsets = 0;
  if (dur >= 1.6) {
    const nn = 1024, hop = 256, fps = SR / hop, cur = new Float32Array(nn / 2), prev = new Float32Array(nn / 2), e = [];
    for (let off = 0; off + nn <= Math.min(n, SR * 30); off += hop) { mag(x, off, nn, cur); let f = 0; for (let i = 1; i < nn / 2; i++) { const v = Math.log1p(100 * cur[i]), d = v - prev[i]; if (d > 0) f += d; prev[i] = v; } e.push(f); }
    e[0] = 0; const de = detrend(e, Math.round(fps * 0.4)); const mean = de.reduce((a, b) => a + b, 0) / de.length;
    for (let i = 1; i < de.length - 1; i++) if (de[i] > mean * 3 && de[i] >= de[i - 1] && de[i] > de[i + 1]) onsets++;
    const maxLag = Math.min(de.length - 1, Math.round(fps * 4)); const A = acfAt(de, maxLag);
    let best = 0, bs = -1, sum = 0, k = 0;
    for (let b = 70; b <= 180; b += 0.25) { const L = fps * 60 / b; let sc = 0; for (let q = 1; q <= 4; q++) if (q * L <= maxLag) sc += A(q * L) / q; sc *= Math.exp(-0.5 * Math.pow(Math.log2(b / 125) / 0.9, 2)); sum += sc; k++; if (sc > bs) { bs = sc; best = b; } }
    const conf = bs / ((sum / k) || 1);
    if (onsets >= 4 && conf > 2.2) {
      bpm = best;
      for (const bars of [1, 2, 4, 8, 16]) { const fit = 240 * bars / dur; if (Math.abs(fit - best) / best < 0.04) { bpm = fit; break; } if (Math.abs(fit * 2 - best) / best < 0.04) { bpm = fit * 2; break; } }
      bpm = Math.round(bpm * 10) / 10;
    }
  }
  const tail = (last - pi) / SR, attack = pi / SR;
  let type;
  if (bpm) type = tonal || (flat < 0.2 && centroid < 3000) ? "Melodic loop" : "Drum loop";
  else if (tonal && lowShare > 0.45 && p.f < 160) type = "808 / Bass";
  else if (lowShare > 0.35 && dur < 1.2 && attack < 0.03 && centroid < 2500) type = "Kick";
  else if (centroid > 5500 && dur < 2.5) type = "Hi-hat";
  else if (!tonal && centroid > 1200 && centroid <= 5500 && dur < 1.5 && attack < 0.04) type = "Snare / Clap";
  else if (tonal && dur < 4) type = "Melodic one-shot";
  else if (dur >= 1.2) type = "FX / Texture";
  else type = "Percussion";
  const note = tonal || type === "808 / Bass" || type === "Melodic one-shot" ? (p ? noteOf(p.f) : null) : null;
  return { name: file.name, size: file.size, dur: +dur.toFixed(2), peakDb: +(20 * Math.log10(pk + 1e-9)).toFixed(1), rmsDb: +(20 * Math.log10(Math.sqrt(ss / n) + 1e-9)).toFixed(1), tail: +tail.toFixed(2), centroid: Math.round(centroid), lowShare: +lowShare.toFixed(2), flat: +flat.toFixed(2), tonal, note, bpm, type, env };
}
function cleanBase(n) { return n.replace(/\.[^.]+$/, "").replace(/^NEWGEN - /, "").replace(/[_]+/g, " ").replace(/\s+/g, " ").trim(); }
function suggestName(it) {
  const short = { "Snare / Clap": "Snare-Clap", "808 / Bass": "808", "Melodic one-shot": "Melodic", "FX / Texture": "FX", "Drum loop": "Loop", "Melodic loop": "Loop" }[it.type] || it.type;
  const parts = [];
  if (it.bpm) parts.push(Math.round(it.bpm) + " BPM");
  if (it.note && (it.type === "808 / Bass" || it.type === "Melodic one-shot" || it.type === "Melodic loop")) parts.push(it.note.name);
  parts.push(short);
  return parts.join(" - ") + " - " + cleanBase(it.name) + (it.name.match(/\.[^.]+$/) || [".wav"])[0];
}
function keyFit(it, labKey) {
  if (!labKey || !it.note) return null;
  const [root, mode] = labKey.split(" "), r = NAMES.indexOf(root), pc = ((it.note.midi % 12) + 12) % 12;
  const sc = SCALES[mode].map(d => (d + r) % 12);
  if (sc.includes(pc)) return { ok: true, text: `In ${labKey}` };
  const up = sc.includes((pc + 1) % 12), down = sc.includes((pc + 11) % 12);
  return { ok: false, text: `Not in ${labKey}: pitch ${up ? "+1" : down ? "−1" : "±2"} semitone` };
}
function shelfId(it) { return "sm-" + cleanBase(it.name).toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 50) + "-" + it.size; }
const K = s => s.split("+").map(k => `<kbd>${k}</kbd>`).join("+");
const CAMPAIGN = [
  { ch: "Chapter 1 · Find your way around", missions: [
    { id: "m1", t: "Tour the five windows", goal: "Know where everything lives.", steps: [
      `Open FL Studio and start a new empty project: ${K("Ctrl+N")}.`,
      `Press ${K("F5")} for the <b>Playlist</b>: your song's timeline, where patterns get arranged.`,
      `Press ${K("F6")} for the <b>Channel Rack</b>: the list of your instruments. You only use it to add sounds.`,
      `Press ${K("F7")} for the <b>Piano Roll</b>: where you draw melodies and chords.`,
      `Press ${K("F9")} for the <b>Mixer</b>: volume, EQ and effects. ${K("F8")} opens the <b>Browser</b> with sounds and plugins.`
    ], done: "You can open each window without the mouse.", tip: "Press the same key again to close a window. Tab cycles between open windows." },
    { id: "m2", t: "Play, tempo and saving", goal: "Control playback and never lose work.", steps: [
      `${K("Space")} plays and stops. ${K("L")} switches between Pattern mode and Song mode (the PAT/SONG switch on the toolbar).`,
      `Set the tempo: click the BPM number on the top bar and drag up or down, or right-click it to type a value. Try 125.`,
      `Save now: ${K("Ctrl+S")}. Name it with the date, like 2026-11-13 first beat.`,
      `Undo is ${K("Ctrl+Z")}. To go back several steps, use ${K("Ctrl+Alt+Z")}.`
    ], done: "Your project is saved at 125 BPM and plays with Space.", tip: "Save every 10 minutes. FL also autosaves backups, but don't rely on it." }
  ]},
  { ch: "Chapter 2 · Drums", missions: [
    { id: "m3", t: "Four-on-the-floor kick", goal: "Your first drum loop.", steps: [
      `Open the Channel Rack (${K("F6")}). A new project has Kick, Clap, Hat and Snare channels. Click the Kick channel's name once to select it.`,
      `Press ${K("F7")} for its Piano roll. Click the magnet icon (Snap) → 1/4 beat, so each beat shows 4 squares.`,
      `On the C5 row, left-click to draw a kick at the start of each beat: 1.1, 2.1, 3.1, 4.1. Press ${K("Space")}. That's the house and techno kick.`,
      `Right-click a note to delete it. ${K("Ctrl+A")} then ${K("Ctrl+B")} copies the bar to make it longer.`
    ], done: "A kick plays on every beat.", tip: "Swap the sound: open the Browser (F8) → Packs → Drums, and drag a kick onto the Kick channel." },
    { id: "m4", t: "Clap, hats and feel", goal: "Make the loop groove.", steps: [
      `Select the Clap channel, ${K("F7")}, and draw claps at 2.1 and 4.1 (beats 2 and 4) on the C5 row.`,
      `Select the Hat channel, ${K("F7")}, and draw hats at 1.3, 2.3, 3.3 and 4.3 (between the kicks). That's the offbeat dance hat.`,
      `Make it human: in the Hat's Piano roll, drag some bars down in the velocity lane at the bottom.`,
      `For swing: select the in-between notes, hold Alt (snap off) and drag them slightly right. Listen as you go.`
    ], done: "Kick, clap and hats loop together and don't sound robotic.", tip: "Use Teardown on a song you love, then copy its drum positions (like 2.1, 4.1) into each Piano roll." }
  ]},
  { ch: "Chapter 3 · Melody, chords and bass", missions: [
    { id: "m5", t: "Chords in key", goal: "4 chords that sound good together.", steps: [
      `Add an instrument: click + at the bottom of the Channel Rack → choose FLEX or Sytrus, then pick a pad preset.`,
      `Open it in the Piano Roll (${K("F7")}). Turn on scale highlighting: arrow menu top-left → View → Helpers → Scale highlighting. Pick a key, like A minor.`,
      `Piano Roll tools: ${K("P")} pencil to draw, ${K("D")} delete, ${K("E")} select, ${K("C")} slice. Draw 3-note chords on the bright rows only, one chord per bar.`,
      `Select all with ${K("Ctrl+A")}, then duplicate with ${K("Ctrl+B")} to repeat the 4 bars.`
    ], done: "Four chords loop under your drums and nothing sounds sour.", tip: "Chord stamps can place full chords for you: look for Stamp in the Piano Roll toolbar." },
    { id: "m6", t: "Bassline", goal: "Low end that locks with the kick.", steps: [
      `Add 3x Osc (or Sytrus) as a bass. Start with a sine or saw sound.`,
      `In the Piano Roll, play the lowest note of each chord, one octave down.`,
      `Place bass notes between the kicks (offbeats) for a rolling house bass, or on the kicks for a heavier feel.`,
      `Keep notes short so the bass bounces.`
    ], done: "The bass follows your chords and grooves with the kick.", tip: "If the bass and kick muddy each other, that's what sidechain (Mission 9) fixes." },
    { id: "m7", t: "A hook", goal: "The part people hum.", steps: [
      `Add a lead synth (Sytrus, FLEX or Vital, which is free).`,
      `Write a 2-bar phrase using notes from your chords. Short and repeated is better than long.`,
      `Copy it, then change only the last 2 notes for an "answer" phrase.`,
      `Add Fruity Delay 3 to the lead's mixer track (Mission 9 shows routing). Turn your speakers down first. Set Time to 1/8 or 3/16, Feedback low (around 30%) and Wet low (around 20–30%). If it screeches or keeps getting louder, Feedback is too high: turn it down.`
    ], done: "You have a hook you can hum after hearing it twice.", tip: "Steal like an artist: copy the rhythm of a hook you love, then change the notes." }
  ]},
  { ch: "Chapter 4 · Arrange and mix", missions: [
    { id: "m8", t: "Arrange a song", goal: "Turn loops into intro → build → drop.", steps: [
      `Make separate patterns for drums, chords, bass and hook. The pattern selector is on the toolbar; ${K("F4")} creates the next empty pattern.`,
      `Switch to Song mode (${K("L")}) and open the Playlist (${K("F5")}). Paint patterns in with the brush (${K("B")}).`,
      `Intro: 8 bars of chords and hats. Build: 8 bars adding drums. Drop: 16 bars with everything.`,
      `Cut the kick in the last bar before the drop. That moment of space makes the drop hit.`
    ], done: "A 32-bar song structure plays from start to finish.", tip: "Use Teardown's arrangement map from a real song as your template." },
    { id: "m9", t: "Mixer basics", goal: "Clean, balanced levels.", steps: [
      `Route each channel to its own mixer track: select the channel, then set the number in the box ("Track") on the left of the Channel Rack.`,
      `In the Mixer (${K("F9")}), click an empty effect slot → Fruity Parametric EQ 2. High-pass everything except kick and bass at about 100–150 Hz.`,
      `Simple sidechain: put Fruity Limiter on the bass track, switch it to COMP mode, and route the kick's mixer track to the bass track as a sidechain (right-click the arrow at the bottom of the bass track → Sidechain to this track).`,
      `Balance by ear: kick and bass loudest, then the hook, then pads.`
    ], done: "Nothing clips red on the master, and you can hear every part.", tip: "Mix at low volume. If it sounds good quiet, it'll sound good loud." }
  ]},
  { ch: "Chapter 5 · Learn from songs you love", missions: [
    { id: "m10", t: "Export and share", goal: "Finish something.", steps: [
      `Export MP3: ${K("Ctrl+Shift+R")}. Export WAV: ${K("Ctrl+R")}.`,
      `Name it with the date and a version number, like loop-2026-11-13-v1.`,
      `Send it to your mentor and ask for one fix.`
    ], done: "An MP3 of your track exists outside FL Studio.", tip: "Finishing beats perfect. Export something every week." },
    { id: "m11", t: "Teardown and rebuild", goal: "Learn a real producer's choices.", steps: [
      `Go to the <a href="#teardown">Teardown</a> tab and upload a song you love.`,
      `Set FL to its BPM and key, then copy its drum pattern and arrangement.`,
      `Rebuild 8 bars of its drop. Get the feel, then change one thing to make it yours.`
    ], done: "8 bars that remind you of the original.", tip: "Ask the coach for a step-by-step lesson on the part you're stuck on." },
    { id: "m12", t: "Compare and level up", goal: "See exactly what to fix.", steps: [
      `Export your rebuild and upload it in Teardown's Compare my version.`,
      `Fix the top 3 items on the list, then export and compare again.`,
      `Write down your closeness score each round. Watching it go up is your progress log.`
    ], done: "Your closeness score went up between two versions.", tip: "After 5 songs, you'll start hearing these things without the app." }
  ]}
];
const SHORTCUTS = [
  ["Windows", [["F5", "Playlist"], ["F6", "Channel Rack"], ["F7", "Piano Roll"], ["F8", "Browser"], ["F9", "Mixer"], ["Tab", "Cycle open windows"]]],
  ["Transport and files", [["Space", "Play / stop"], ["L", "Pattern / Song mode"], ["Ctrl+N", "New project"], ["Ctrl+S", "Save"], ["Ctrl+R", "Export WAV"], ["Ctrl+Shift+R", "Export MP3"], ["Ctrl+Z", "Undo (toggle)"], ["Ctrl+Alt+Z", "Undo more steps"]]],
  ["Piano Roll and Playlist", [["P", "Pencil (draw)"], ["B", "Brush (paint)"], ["D", "Delete tool"], ["E", "Select tool"], ["C", "Slice tool"], ["T", "Mute tool"], ["Ctrl+A", "Select all"], ["Ctrl+B", "Duplicate selection"], ["Ctrl+Q", "Quick quantize"], ["F4", "Next empty pattern"]]]
];
function dayStr(d) { return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
function logStats(log) {
  const days = new Set(log.map(x => x.date)); let streak = 0; const d = new Date();
  if (!days.has(dayStr(d))) d.setDate(d.getDate() - 1);
  while (days.has(dayStr(d))) { streak++; d.setDate(d.getDate() - 1); }
  const minutes = log.reduce((s, x) => s + (Number(x.minutes) || 0), 0);
  const scores = log.filter(x => x.score != null && x.score !== "").map(x => Number(x.score));
  return { streak, minutes, sessions: log.length, best: scores.length ? Math.max(...scores) : null };
}
function tdId(a) { return "td-" + String(a.title || "untitled").toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40) + "-" + Math.round(a.duration || 0); }
const EXAMPLE = {
  title: "Example: 125 BPM dance track", duration: 228, bpm: 125, bpmConf: 5.1, key: "B major", camelot: "1B", keyConf: 0.15, relKey: "G# minor",
  pattern: { kick: [1,0,0,0,1,0,0,0,1,0,0,0,1,0,0,0].map(Boolean), snare: [0,0,0,0,1,0,0,0,0,0,0,0,1,0,0,0].map(Boolean), hats: [0,0,1,0,0,0,1,0,0,0,1,0,0,0,1,1].map(Boolean) },
  rhythm: { fourFloor: true, kickPerBar: 4, hatDiv: 8, lowPulse: 0.6, busy: 140 },
  sections: [{ label: "Intro", startBar: 0, bars: 16 }, { label: "Build", startBar: 16, bars: 8 }, { label: "Drop", startBar: 24, bars: 32 }, { label: "Breakdown", startBar: 56, bars: 16 }, { label: "Build", startBar: 72, bars: 8 }, { label: "Drop", startBar: 80, bars: 24 }, { label: "Outro", startBar: 104, bars: 15 }].map(s => Object.assign(s, { start: +(s.startBar * 1.92).toFixed(1), end: +((s.startBar + s.bars) * 1.92).toFixed(1) })),
  barSec: 1.92, nBars: 119, balance: [17, 33, 19, 15, 10, 6], width: 0.31, loudRms: -8.9, crest: 8.2, peakDb: -0.3
};
return Object.freeze({ transcriptionFromNotes, chordSpans, transcribedSteps, partMidi, midiModes, allPartsMidi, smfFile, refTempo, chordNamesText, noDrumsFound, exportGate, recordCorrection, forcedOf, staleReasons, applyMeter, chance, BANDS, REF, genreOf, GENRES, COLORS, MIX_EX, MIX_SHEET, mixNotes, hatFeel, posOf, posList, stepsText, fmtT, fixSectionTimes, rnd, flNote, B16, idxOf, keyInfo, is808, chordFromDegree, genChords, genDrums, SNARE_EX, genBass, genMelody, genChop, genArrangement, drumBar, midiBytes, zipStore, ideaMidiFiles, noteList, IDEAS, STYLES, wText, KIT, KIT_SLOTS, KIND_NAME, makeIdeas, alignedWav, songMidiFiles, PART_NAMES, partScores, recomputeLoop, loudestIdx, swingText, shareData, LIB, sampleList, SECTION_HOW, moodTags, chordNotes, keyChords, compress, applyKey, applyTempo, compare, coachData, COACH_SETUP, STYPES, SFOLDER, STIP, suggestName, keyFit, shelfId, K, SHORTCUTS, dayStr, logStats, tdId, EXAMPLE, songNotes, buildPlan, CAMPAIGN, analyzeSample, reviewHtml });
});
