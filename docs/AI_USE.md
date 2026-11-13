# Use of AI in this project

**Tool:** Anthropic Claude, used as a coding assistant.

**What it helped with:** writing and debugging parts of the web interface, and drafting
documentation and the video script. The team decided what to build, reviewed every change
and tested it in the running app.

**What it did not do:** no AI model produces or influences any score. Ranking and
validation are deterministic code in `src/compute`, written and checked by the team.

**Data the AI worked on:** our own source code and the public documentation of the open
datasets we use (NASA POWER, NASA GIBS / MODIS, MERRA-2, AWS Terrain Tiles, GLiM).
No private or personal data.

## Core prompts (examples)

1. "Redesign the Validation tab so judges can see why the ranking can be trusted:
   a ROC curve, known analogs vs non-analogs, and a leave-one-dataset-out check."
2. "Add an interactive Learn page for Mars and the Moon: a day/dust slider, missions
   tested on Earth, and a short quiz for newcomers."
3. "For each site, show the Earth processes behind the match using NASA dust and snow
   data, and say clearly what Earth cannot reproduce."
4. "Make the God's Eye side panel collapsible and add a rover that drives the planned route."
5. "Make the guided tour demonstrate God's Eye by itself: play a day, raise the relief,
   drive the rover."
6. "Review the README against the final app and fix anything outdated."

**Reasoning:** we used AI to move faster on interface and documentation work during the
hackathon, so the team could spend its time on the science, the data and the validation.
