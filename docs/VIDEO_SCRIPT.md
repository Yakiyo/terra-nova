# 240-second prescreening video. Due 1 Oct 2026, 11:59 pm

**What the form asks for:** team name, **every member by name**, the problem, the
challenge statement, and the solution approach *as a concept*.

**Rules:** English. Nothing longer than 240 s. No person under 18 visible or named.
Name NASA datasets out loud. **Only show numbers the code actually produced.**
The MD's "PSI 91.8%" figures are invented; never use them.

Target about 480 spoken words (≈ 130 wpm). Fill in every `[ ]` before recording.

**Numbers used below, all produced by the current code** (re-check with
`OFFLINE=1 python -m scripts.check_controls` before recording): 78,247 scored land
cells; lunar south pole top results in the Kumtag Desert, Turpan-Hami Basin and Gobi (NW
China); Jezero top results in the Kharan Desert and Dasht-e Lut region and the Sahara;
ROC-AUC 1.00 for both targets (5 Mars and 3 Moon analog sites vs 8 vegetated or humid
reference points).

| Time | Visual | Narration |
|---|---|---|
| **0:00–0:20** Hook | LRO/LROC image of the lunar south pole, cut to the Atacama Desert (NASA Earth Observatory). | "Before astronauts build a base on the Moon or Mars, every drill, rover and habitat is tested somewhere on Earth. But which places on Earth really behave like the Moon or Mars? Today, most of those sites were chosen by experience, not measured." |
| **0:20–0:45** Team | One card per member (name + role). Adults only on camera. | "We are **[TEAM NAME]** from **[university/city]**, Bangladesh. I'm [Name 1], our lead. With me are [Name 2] on lunar data, [Name 3] on Mars data, [Name 4] on Earth data, [Name 5] on scoring and validation, and [Name 6] on the interface." |
| **0:45–1:10** Challenge | The challenge title on screen, verbatim. | "Our challenge is **'Identify Earth Locations that Analog the Permanent Moon Base Locations and Mars.'** It asks us to use open NASA and partner data to find and characterise new Earth analogs across deserts, polar regions, volcanic terrain and caves." |
| **1:10–1:40** Problem | Three icons: topography, climate, geology. | "The difficulty is that 'Moon-like' is not one number. A good analog for a sunlit lunar ridge is very different from one for a permanently shadowed ice crater or Jezero's ancient river delta. And some conditions, like minus 240 degrees Celsius in lunar shadow, simply do not exist on Earth. So we match the **engineering challenge**, not the raw number." |
| **1:40–2:30** Approach | Simple 3-box diagram: *Target signature → Earth screening → Ranked, explained sites*. | "Our approach has three steps. First, we build a signature for each target from NASA data: LOLA elevation and slope maps of Artemis candidate sites from NASA's Planetary Geodesy archive, and HiRISE and CRISM data for Mars. Second, we screen the whole Earth. We remove vegetated land using MODIS NDVI, then compare terrain from NASA SRTM and ESA's Copernicus DEM, and day-to-night surface temperature swing from MODIS. Third, a transparent, deterministic scoring model ranks every location. There is no AI guessing: you can see each criterion's contribution and change its weight yourself." |
| **2:30–3:05** Prototype (screen recording of the real app) | Open `/#target=lunar_south_pole`, let the globe turn to China, click site #1; then switch to Jezero and open the Validation tab. | "We already have a working prototype. It scores all seventy-eight thousand land cells on Earth. For the lunar south pole, its top candidates are the Kumtag and Gobi deserts in north-west China, far from every analog site in our catalogue, so they are flagged as new candidates to investigate. For Jezero, it points to the deserts of Iran, Pakistan and the Sahara. And we test it: known analog sites like Haughton Crater and the Atacama beat every rainforest and farmland reference point we give it." |
| **3:05–3:30** What's next | Bullet list animating in. | "By the hackathon we will add target archetypes like sunlit ridges, cold traps, clay deltas and lava-tube pits. We will also add a novelty flag for sites nobody has tested yet, and a field-feasibility score for road access and protected land. Each result will link to NASA Moon Trek and Mars Trek so anyone can verify it." |
| **3:30–3:55** Impact + close | Globe with highlighted regions, then the team name and repo URL. | "Better analogs mean cheaper, safer testing before we fly. Everything is open source and built on open NASA data. We are **[TEAM NAME]**. Thank you." |

## Production checklist
- [ ] **By 29 Sep night:** fill in the names and roles, and lock the team and product name.
- [ ] **30 Sep:** record the narration with one voice and a quiet room; capture the app screen at 1080p.
- [ ] Download the images from NASA sources and write their credits in the README's "NASA and partner data sources" section.
- [ ] Edit (CapCut / DaVinci Resolve / Clipchamp), add English subtitles, and **check it runs ≤ 4:00**.
- [ ] **1 Oct, before 20:00:** upload, then test the link in a private window.
