# Interface font sources

Anton and Roboto are sourced from Google Fonts under the SIL Open Font License;
their license texts are bundled as anton-OFL.txt and roboto-OFL.txt.

- https://github.com/google/fonts/tree/main/ofl/anton
- https://github.com/google/fonts/tree/main/ofl/roboto

Panchang is sourced from https://www.fontshare.com/fonts/panchang under the ITF
Free Font License, bundled as panchang-FFL.txt. It permits self-hosting for this
website but excludes redistribution through repositories. Its unchanged local
webfont binaries are gitignored. Each checkout owner should obtain their own copy:

```powershell
./.venv/Scripts/python.exe -m src.acquire.ui_fonts
```

The acquisition uses src.acquire.download and caches original files. Once acquired,
all fonts are served locally with no runtime network dependency. If Panchang has
not been acquired, the feature counters use the locally bundled Roboto fallback.

Typography reference: https://lenis.dev/ (Panchang, Anton and Roboto verified in
computed styles). Native navigation adaptations reference Watermelon Breadcrumb 1
and Continuous Tabs: https://ui.watermelon.sh/components/breadcrumb and
https://ui.watermelon.sh/animated-components/continuous-tabs. The project uses its
own HTML/CSS/JavaScript and existing icons; no React or Motion dependency is added.


Control refinements reference Watermelon Button 12 (rounded button), ButtonGroup 1
(grouped controls), View On Map (circular map-control affordance), and Hero 40
(orb visual inspiration). Their structures are adapted to native controls with
existing icons and scientific map handlers:
- https://ui.watermelon.sh/components/button
- https://ui.watermelon.sh/components/button-group
- https://ui.watermelon.sh/animated-components/view-on-map
- https://ui.watermelon.sh/block/hero-40


Further native control adapters follow these Watermelon sources:
- Dropdown Disclosure: https://ui.watermelon.sh/animated-components/dropdown-disclosure
- Adaptive Slider: https://ui.watermelon.sh/animated-components/adaptive-slider
- Switch Mode: https://ui.watermelon.sh/animated-components/switch-mode

Selectors retain their native select state behind accessible disclosure menus.
The overlay uses its original native range for keyboard and pointer input; the
known-analogs switch keeps its native checkbox state. Dataset source labels use
Anton, another locally hosted face verified on the Lenis reference website.


Known analogs now follows Watermelon's Save Toggle rather than Switch Mode:
https://ui.watermelon.sh/animated-components/save-toggle. The immediate visibility
change is shown as Shown/Hidden with a check-state morph, without simulating a save
request. Offline/AUC, Help and the layer selector follow Dropdown Disclosure's
circular leading icons, close header and selection rows. Planet preview captions
use Anton from the same locally hosted Lenis-reference family.
