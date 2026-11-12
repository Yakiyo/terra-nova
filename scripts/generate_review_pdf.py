"""Generate a publication-grade PDF report reviewing TerraNova against the
NASA Space Apps Challenge 2026 criteria and detailing winning feature strategies.

Usage::
    python -m scripts.generate_review_pdf
"""

from __future__ import annotations

from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.pdfgen import canvas
from reportlab.platypus import (
    HRFlowable,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

REPO_ROOT = Path(__file__).resolve().parents[1]
OUTPUT_PDF = REPO_ROOT / "artifacts" / "TerraNova_Project_Review_and_Winning_Strategy.pdf"
SECONDARY_PDF = (
    Path("C:/Users/USER/.gemini/antigravity-cli/brain/79808acf-be97-4704-b00b-d19282686b38")
    / "TerraNova_Project_Review_and_Winning_Strategy.pdf"
)

# Colors aligned with NASA branding and DESIGN.md
C_SPACE_BLACK = colors.HexColor("#0B0C10")
C_NASA_BLUE = colors.HexColor("#0B3D91")
C_NASA_RED = colors.HexColor("#D5092B")
C_DARK_SLATE = colors.HexColor("#1F2833")
C_LIGHT_BG = colors.HexColor("#F8F9FA")
C_CARD_BG = colors.HexColor("#EEF4FB")
C_CARD_BORDER = colors.HexColor("#0B3D91")
C_ALT_ROW = colors.HexColor("#F4F6F9")
C_BORDER_GRAY = colors.HexColor("#D1D5DB")
C_TEXT_MUTED = colors.HexColor("#4B5563")
C_WHITE = colors.HexColor("#FFFFFF")
C_SUCCESS = colors.HexColor("#059669")


class NumberedCanvas(canvas.Canvas):
    """Two-pass canvas to dynamically compute and print 'Page X of Y'."""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._saved_page_states: list[dict] = []

    def showPage(self):
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        num_pages = len(self._saved_page_states)
        for state in self._saved_page_states:
            self.__dict__.update(state)
            self.draw_page_decorations(num_pages)
            canvas.Canvas.showPage(self)
        canvas.Canvas.save(self)

    def draw_page_decorations(self, page_count: int):
        self.saveState()
        self.setFont("Helvetica", 8)
        self.setFillColor(C_TEXT_MUTED)

        # Draw running header on pages > 1
        if self._pageNumber > 1:
            self.drawString(
                40,
                letter[1] - 30,
                "NASA SPACE APPS CHALLENGE 2026 · TERRA NOVA COMPREHENSIVE REVIEW",
            )
            self.drawRightString(
                letter[0] - 40, letter[1] - 30, "TEAM DaRK_MATTER · STRATEGY DOSSIER"
            )
            self.setStrokeColor(C_BORDER_GRAY)
            self.setLineWidth(0.5)
            self.line(40, letter[1] - 34, letter[0] - 40, letter[1] - 34)

        # Draw running footer on all pages
        self.setStrokeColor(C_BORDER_GRAY)
        self.setLineWidth(0.5)
        self.line(40, 38, letter[0] - 40, 38)

        self.drawString(
            40,
            26,
            "Confidential · Prepared for NASA Space Apps Judging & Team DaRK_MATTER",
        )
        self.drawRightString(
            letter[0] - 40, 26, f"Page {self._pageNumber} of {page_count}"
        )
        self.restoreState()


def build_pdf():
    OUTPUT_PDF.parent.mkdir(parents=True, exist_ok=True)

    doc = SimpleDocTemplate(
        str(OUTPUT_PDF),
        pagesize=letter,
        leftMargin=40,
        rightMargin=40,
        topMargin=42,
        bottomMargin=46,
    )

    styles = getSampleStyleSheet()

    # Custom styles
    title_style = ParagraphStyle(
        "CoverTitle",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=22,
        leading=26,
        textColor=C_SPACE_BLACK,
        spaceAfter=4,
    )

    subtitle_style = ParagraphStyle(
        "CoverSubtitle",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=11,
        leading=14,
        textColor=C_NASA_BLUE,
        spaceAfter=12,
    )

    meta_style = ParagraphStyle(
        "MetaText",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=8.5,
        leading=11.5,
        textColor=C_TEXT_MUTED,
    )

    h1_style = ParagraphStyle(
        "Heading1_Custom",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=13,
        leading=16,
        textColor=C_NASA_BLUE,
        spaceBefore=14,
        spaceAfter=6,
        keepWithNext=True,
    )

    h2_style = ParagraphStyle(
        "Heading2_Custom",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=10.5,
        leading=13.5,
        textColor=C_DARK_SLATE,
        spaceBefore=10,
        spaceAfter=4,
        keepWithNext=True,
    )

    body_style = ParagraphStyle(
        "Body_Custom",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=8.5,
        leading=11.5,
        textColor=C_SPACE_BLACK,
        spaceAfter=5,
    )

    bullet_style = ParagraphStyle(
        "Bullet_Custom",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=8.5,
        leading=11.5,
        textColor=C_SPACE_BLACK,
        leftIndent=12,
        firstLineIndent=-8,
        spaceAfter=3,
    )

    callout_text = ParagraphStyle(
        "CalloutText",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=8.5,
        leading=12,
        textColor=C_SPACE_BLACK,
    )

    table_header = ParagraphStyle(
        "TableHeader",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=8,
        leading=10,
        textColor=C_WHITE,
        alignment=1,
    )

    table_cell = ParagraphStyle(
        "TableCell",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=7.5,
        leading=9.5,
        textColor=C_SPACE_BLACK,
    )

    table_cell_bold = ParagraphStyle(
        "TableCellBold",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=7.5,
        leading=9.5,
        textColor=C_SPACE_BLACK,
    )

    table_cell_center = ParagraphStyle(
        "TableCellCenter",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=7.5,
        leading=9.5,
        textColor=C_SPACE_BLACK,
        alignment=1,
    )

    story = []

    # -------------------------------------------------------------------------
    # COVER / HEADER BANNER
    # -------------------------------------------------------------------------
    banner_data = [
        [
            Paragraph("NASA INTERNATIONAL SPACE APPS CHALLENGE 2026 · BANGLADESH", ParagraphStyle(
                "BannerSub", fontName="Helvetica-Bold", fontSize=8, leading=10, textColor=C_NASA_RED
            )),
            Paragraph("OFFICIAL PROJECT EVALUATION", ParagraphStyle(
                "BannerRight", fontName="Helvetica-Bold", fontSize=8, leading=10, textColor=C_TEXT_MUTED, alignment=2
            ))
        ],
        [
            Paragraph("TerraNova: Comprehensive Review & Winning Strategy", title_style),
            ""
        ],
        [
            Paragraph("<b>Challenge:</b> <i>Identify Earth Locations that Analog the Permanent Moon Base Locations and Mars</i>", subtitle_style),
            ""
        ],
        [
            Paragraph("<b>Team:</b> DaRK_MATTER (Khulna) &nbsp;|&nbsp; <b>Platform:</b> Web / FastAPI + Three.js &nbsp;|&nbsp; <b>License:</b> Apache-2.0 &nbsp;|&nbsp; <b>Status:</b> 81/81 Tests Passing (ROC-AUC 1.00)", meta_style),
            ""
        ]
    ]

    t_banner = Table(banner_data, colWidths=[400, 132])
    t_banner.setStyle(TableStyle([
        ("SPAN", (0, 1), (1, 1)),
        ("SPAN", (0, 2), (1, 2)),
        ("SPAN", (0, 3), (1, 3)),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 1),
    ]))
    story.append(t_banner)
    story.append(Spacer(1, 4))
    story.append(HRFlowable(width="100%", thickness=1.5, color=C_NASA_RED, spaceAfter=8, spaceBefore=4))

    # -------------------------------------------------------------------------
    # SECTION 1: EXECUTIVE SUMMARY & OPERATIONAL PROBLEM
    # -------------------------------------------------------------------------
    story.append(Paragraph("1. Executive Summary & Operational Mission Bottleneck", h1_style))
    story.append(Paragraph(
        "As humanity prepares for permanent lunar habitats (Artemis III/Base Camp) and future crewed Mars surface exploration, "
        "mission hardware (rovers, drills, habitats, navigation suites) must undergo extensive terrestrial qualification testing. "
        "Historically, space agencies rely on a handful of celebrated, grandfathered analog sites (e.g., Devon Island, Atacama, Hawaii basalts). "
        "However, <b>no single Earth location matches an extraterrestrial body across all physical dimensions</b>.",
        body_style
    ))
    story.append(Paragraph(
        "<b>TerraNova</b> treats analog discovery as an <b>operational proxy screening problem</b>: deterministically evaluating "
        "78,247 scorable Earth land cells (0.5° grid, ~55 km) against published planetary ground truth from NASA and partner missions "
        "(LRO LOLA, Diviner, Mars 2020 MEDA, MSL REMS). Scoring relies entirely on verifiable arithmetic in <code>src/compute</code>—no "
        "black-box LLMs, no hallucinated numbers, and 100% offline capability.",
        body_style
    ))

    # Highlight Callout Box
    callout_data = [[
        Paragraph(
            "<b>Key Engineering Principle:</b> Physical impossibility (e.g. lunar 120 K diurnal swing vs Earth's ~35 K max) "
            "is handled through <i>effective Earth-envelope clamping</i> ($t'_k = \\text{clip}(t_k, e_{\\text{lo},k}, e_{\\text{hi},k})$). "
            "Scores represent <i>the closest operational proxy Earth can provide</i> for hardware stress survival.",
            callout_text
        )
    ]]
    t_callout = Table(callout_data, colWidths=[532])
    t_callout.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), C_CARD_BG),
        ("BOX", (0, 0), (-1, -1), 1, C_CARD_BORDER),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    story.append(t_callout)
    story.append(Spacer(1, 6))

    # -------------------------------------------------------------------------
    # SECTION 2: OFFICIAL JUDGING CRITERIA (118 POINTS + 5% BONUS)
    # -------------------------------------------------------------------------
    story.append(Paragraph("2. Official NASA Space Apps Challenge Rubric (118 Points + 5% Bonus)", h1_style))
    story.append(Paragraph(
        "Projects are evaluated by local judges, universal judges, and NASA subject matter experts across 11 structured metrics. "
        "Criteria 1-5 carry 100 points, 6-8 carry 15 points, and 9-11 carry 3 points. A 5% women-participation bonus is applied to the aggregate.",
        body_style
    ))

    rubric_data = [
        [Paragraph("Criterion", table_header), Paragraph("Pts", table_header), Paragraph("Evaluation Core", table_header), Paragraph("Anchor Standard for Maximum Points (20/20)", table_header)],
        [
            Paragraph("<b>1. Impact</b>", table_cell_bold),
            Paragraph("1-20", table_cell_center),
            Paragraph("Scale & value of problem; global & planetary exploration reach.", table_cell),
            Paragraph("Addresses major global/interplanetary challenge; scalable path to adopt by agencies/teams.", table_cell)
        ],
        [
            Paragraph("<b>2. Creativity</b>", table_cell_bold),
            Paragraph("1-20", table_cell_center),
            Paragraph("Originality of idea and execution; novel connections.", table_cell),
            Paragraph("Bold, radical spin; unexpected cross-disciplinary connections; sets a new benchmark.", table_cell)
        ],
        [
            Paragraph("<b>3. Validity</b>", table_cell_bold),
            Paragraph("1-20", table_cell_center),
            Paragraph("Scientific soundness, technical feasibility, reproducibility.", table_cell),
            Paragraph("Robust scientific methods, fully validated data, working prototype, zero hallucinated math.", table_cell)
        ],
        [
            Paragraph("<b>4. Relevance</b>", table_cell_bold),
            Paragraph("1-20", table_cell_center),
            Paragraph("Direct alignment to challenge; NASA data at core.", table_cell),
            Paragraph("'NASA-data-first', not just 'NASA-data-added'; deep, transparent, reproducible data integration.", table_cell)
        ],
        [
            Paragraph("<b>5. Presentation</b>", table_cell_bold),
            Paragraph("1-20", table_cell_center),
            Paragraph("Clarity, storytelling, visual polish, 240s/30s video readiness.", table_cell),
            Paragraph("Flawless narrative with beginning/middle/end; compelling visuals; crystal-clear pitch.", table_cell)
        ],
        [
            Paragraph("<b>6. Teamwork</b>", table_cell_bold),
            Paragraph("1-5", table_cell_center),
            Paragraph("Genuine collaboration across the 6 members.", table_cell),
            Paragraph("Distinct roles, balanced git contributions across science, data, frontend, and leads.", table_cell)
        ],
        [
            Paragraph("<b>7. UX / Design</b>", table_cell_bold),
            Paragraph("1-5", table_cell_center),
            Paragraph("Usability, responsiveness, intuitive interaction.", table_cell),
            Paragraph("5 = self-explanatory without instructions, responsive, accessible, offline-functional.", table_cell)
        ],
        [
            Paragraph("<b>8. NASA Data Usage</b>", table_cell_bold),
            Paragraph("1-5", table_cell_center),
            Paragraph("Breadth & citation of open space agency sources.", table_cell),
            Paragraph("5 = NASA open data + partner agency datasets (ESA, USGS, Natural Earth), fully cited.", table_cell)
        ],
        [
            Paragraph("<b>9-11. Mandatory</b>", table_cell_bold),
            Paragraph("3", table_cell_center),
            Paragraph("Challenge ID (1), Public Repo (1), Complete Page (1).", table_cell),
            Paragraph("Explicit challenge category, open GitHub repo with tests, complete project description.", table_cell)
        ],
    ]

    t_rubric = Table(rubric_data, colWidths=[70, 26, 176, 260])
    t_rubric.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), C_NASA_BLUE),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("GRID", (0, 0), (-1, -1), 0.5, C_BORDER_GRAY),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [C_WHITE, C_ALT_ROW]),
    ]))
    story.append(t_rubric)
    story.append(Spacer(1, 8))

    # -------------------------------------------------------------------------
    # SECTION 3: CURRENT ARCHITECTURE & SCIENTIFIC RIGOR
    # -------------------------------------------------------------------------
    story.append(Paragraph("3. System Architecture & Scientific Rigor Audit", h1_style))
    story.append(Paragraph(
        "TerraNova adheres strictly to deterministic science in <code>src/compute</code>. All numbers displayed in the interface "
        "originate from arithmetic calculations against prebuilt predictor arrays, preserving verifiable provenance.",
        body_style
    ))

    arch_data = [
        [Paragraph("Pipeline Layer", table_header), Paragraph("Key Modules", table_header), Paragraph("Input Datasets & Specifications", table_header), Paragraph("Deterministic Function", table_header)],
        [
            Paragraph("<b>1. Planetary Truth</b>", table_cell_bold),
            Paragraph("<code>data/targets.json</code>", table_cell),
            Paragraph("LRO LOLA, Diviner, Chang'E-2, Mars 2020 MEDA, MSL REMS.", table_cell),
            Paragraph("Ground-truth planetary baselines with citations and error tolerances.", table_cell)
        ],
        [
            Paragraph("<b>2. Earth Data Stack</b>", table_cell_bold),
            Paragraph("<code>cache/predictors.zarr</code>", table_cell),
            Paragraph("NASA POWER (precipitation, T2M), GIBS MODIS NDVI, Zenodo LST, AWS Terrarium DEM.", table_cell),
            Paragraph("360x720 global grid (0.5° resolution) over 78,247 land cells.", table_cell)
        ],
        [
            Paragraph("<b>3. Scoring Engine</b>", table_cell_bold),
            Paragraph("<code>src/compute/similarity.py</code>", table_cell),
            Paragraph("Normalization bounds, Earth quantiles, user weights.", table_cell),
            Paragraph("Weighted geometric mean; single criterion failure ($s_k = 0$) vetoes the cell.", table_cell)
        ],
        [
            Paragraph("<b>4. Validation</b>", table_cell_bold),
            Paragraph("<code>src/compute/validation.py</code>", table_cell),
            Paragraph("12 catalogued analogs (USGS, Apollo) + 8 negative controls.", table_cell),
            Paragraph("ROC-AUC metric computation via Mann-Whitney U rank statistics.", table_cell)
        ],
        [
            Paragraph("<b>5. God's Eye 3D</b>", table_cell_bold),
            Paragraph("<code>src/compute/terrain.py</code><br/><code>web/godseye.js</code>", table_cell),
            Paragraph("Zoom-10 AWS Terrarium DEM (~150 m), EOx Sentinel-2 imagery.", table_cell),
            Paragraph("Local DEM mesh, slope gradient, lunar polar grazing sun (1.5°).", table_cell)
        ],
    ]

    t_arch = Table(arch_data, colWidths=[90, 110, 172, 160])
    t_arch.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), C_DARK_SLATE),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("GRID", (0, 0), (-1, -1), 0.5, C_BORDER_GRAY),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [C_WHITE, C_ALT_ROW]),
    ]))
    story.append(t_arch)
    story.append(Spacer(1, 6))

    # Mathematical Formulation
    story.append(Paragraph(
        "<b>Scoring Formulation:</b> For cell value $x_k$, target $t_k$, and Earth bounds $[e_{\\text{lo},k}, e_{\\text{hi},k}]$:<br/>"
        "&nbsp;&nbsp;&nbsp;&nbsp;• Effective Target: $t'_k = \\text{clip}(t_k, e_{\\text{lo},k}, e_{\\text{hi},k})$<br/>"
        "&nbsp;&nbsp;&nbsp;&nbsp;• Criterion Similarity: $s_k(x) = \\text{clip}(1 - |x_k - t'_k| / (\\text{hi}_k - \\text{lo}_k), 0, 1)$<br/>"
        "&nbsp;&nbsp;&nbsp;&nbsp;• Composite Score: $\\text{score}(x) = \\prod_k s_k(x)^{w_k / \\sum w_j}$ (Zero-veto prevents false positive matches)",
        body_style
    ))
    story.append(Spacer(1, 4))

    # -------------------------------------------------------------------------
    # SECTION 4: VALIDATION BENCHMARKS & VERIFIED BASELINE
    # -------------------------------------------------------------------------
    story.append(Paragraph("4. Validation Benchmarks & Codebase Health", h1_style))
    story.append(Paragraph(
        "Automated regression testing confirms high discriminative validity. Running <code>scripts/check_controls.py</code> "
        "confirms an ROC-AUC of <b>1.00</b> across all five built-in targets, successfully separating arid/polar/volcanic analogs "
        "from rainforests and humid cropland. The automated pytest suite passes <b>81 out of 81 tests</b> in ~24s.",
        body_style
    ))

    val_data = [
        [Paragraph("Target Profile", table_header), Paragraph("Celestial Body", table_header), Paragraph("ROC-AUC", table_header), Paragraph("Top-Ranked Analog Example", table_header), Paragraph("Humid Negative Control Score", table_header)],
        [
            Paragraph("<b>Shackleton Rim</b>", table_cell_bold),
            Paragraph("Moon (South Pole)", table_cell),
            Paragraph("<b>1.00</b>", table_cell_center),
            Paragraph("Meteor Crater, AZ (Score: 0.779, 93.6th percentile)", table_cell),
            Paragraph("Amazon: 0.215 | Congo / Dhaka: 0.000", table_cell)
        ],
        [
            Paragraph("<b>Malapert Massif</b>", table_cell_bold),
            Paragraph("Moon (South Pole)", table_cell),
            Paragraph("<b>1.00</b>", table_cell_center),
            Paragraph("Meteor Crater, AZ (Score: 0.745, 96.5th percentile)", table_cell),
            Paragraph("Amazon: 0.194 | Congo / Dhaka: 0.000", table_cell)
        ],
        [
            Paragraph("<b>Haworth Cold Trap</b>", table_cell_bold),
            Paragraph("Moon (PSR)", table_cell),
            Paragraph("<b>1.00</b>", table_cell_center),
            Paragraph("McMurdo Dry Valleys (Score: 0.806, 81.8th percentile)", table_cell),
            Paragraph("Amazon: 0.185 | Congo / Dhaka: 0.000", table_cell)
        ],
        [
            Paragraph("<b>Jezero Crater</b>", table_cell_bold),
            Paragraph("Mars (Paleolake)", table_cell),
            Paragraph("<b>1.00</b>", table_cell_center),
            Paragraph("MDRS Utah (0.800) / Haughton Crater (0.744)", table_cell),
            Paragraph("Amazon: 0.283 | Congo / Dhaka: 0.000", table_cell)
        ],
        [
            Paragraph("<b>Gale Crater</b>", table_cell_bold),
            Paragraph("Mars (Mound)", table_cell),
            Paragraph("<b>1.00</b>", table_cell_center),
            Paragraph("MDRS Utah (0.841) / Atacama Desert (0.721)", table_cell),
            Paragraph("Amazon: 0.273 | Congo / Dhaka: 0.000", table_cell)
        ],
    ]

    t_val = Table(val_data, colWidths=[90, 85, 45, 172, 140])
    t_val.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), C_NASA_BLUE),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("GRID", (0, 0), (-1, -1), 0.5, C_BORDER_GRAY),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [C_WHITE, C_ALT_ROW]),
    ]))
    story.append(t_val)
    story.append(Spacer(1, 10))

    # Page Break for Feature Roadmap
    story.append(PageBreak())

    # -------------------------------------------------------------------------
    # SECTION 5: IDENTIFIED GAPS & HACKATHON BOTTLENECK ANALYSIS
    # -------------------------------------------------------------------------
    story.append(Paragraph("5. Critical Gap Analysis: What Stands Between Good and Winning?", h1_style))
    story.append(Paragraph(
        "While the current system proves the mathematical validity of global 0.5° screening, five strategic gaps limit its scoring potential "
        "under NASA hackathon evaluation:",
        body_style
    ))

    gaps = [
        ("Gap 1: Missing High-Priority Exploration Archetypes",
         "The app features 5 targets (rims, massifs, craters). However, modern lunar and Martian exploration heavily emphasizes "
         "<b>subsurface lava tubes</b> (for radiation shielding and thermal stability) and <b>cryo-permafrost ice sheets</b> (for In-Situ Resource Utilization - ISRU)."),
        ("Gap 2: Disconnect Between Physical Similarity and Real-World Mission Staging",
         "A site can achieve 0.95 physical similarity, but if it is inaccessible (no roads or airstrips within 500 km), in a severe natural hazard zone, "
         "or inside a strictly restricted nature reserve (WDPA Ia), it is operationally useless. Mission planners need an <b>Operational Feasibility Index ($F_{\\text{ops}}$)</b>."),
        ("Gap 3: Abstract Scores vs Hardware Subsystem Qualification",
         "Judges ask: <i>'What can NASA actually test here?'</i> The current UI outputs a number (e.g. 0.81), but does not qualify which engineering subsystems "
         "(TRIDENT drills, autonomous optical navigation, xEVAS spacesuits, rover mobility) the site is suited to validate."),
        ("Gap 4: Visual Asymmetry in God's Eye 3D",
         "In God's Eye, users view Earth terrain in high resolution (~150 m), but Moon/Mars targets remain static text pins. There is no direct "
         "<b>Side-by-Side Digital Twin</b> comparing Earth topography against actual LOLA / HiRISE DTMs."),
        ("Gap 5: Limited Expedition Workflow Interactivity",
         "The app allows viewing terrain and exporting raw GeoJSON/CSV points, but lacks tools for mission traverse plotting, rover rollover risk mapping (<15°), "
         "and automated flight dossier packaging."),
    ]

    for title, desc in gaps:
        story.append(Paragraph(f"• <b>{title}:</b> {desc}", bullet_style))
    story.append(Spacer(1, 6))

    # -------------------------------------------------------------------------
    # SECTION 6: FIVE WINNING FEATURES FOR HACKATHON VICTORY
    # -------------------------------------------------------------------------
    story.append(Paragraph("6. Five Winning Features Designed for Maximum Rubric Points", h1_style))
    story.append(Paragraph(
        "To elevate TerraNova to the <b>'Absolutely Wow' (20/20)</b> band across Impact, Creativity, Validity, and Presentation, "
        "the following five features are proposed with complete technical specifications:",
        body_style
    ))

    # Feature 1
    story.append(Paragraph("Feature 1: Subsurface Lava Tube Skylights & Cryo-ISRU Permafrost Archetypes", h2_style))
    story.append(Paragraph(
        "<b>Objective:</b> Target the <i>Best Use of Science</i> & <i>Galactic Impact</i> awards.<br/>"
        "<b>Implementation:</b> Ingest two critical new target profiles into <code>data/targets.json</code>:<br/>"
        "&nbsp;&nbsp;&nbsp;&nbsp;1. <b>Lunar Subsurface Habitat (Marius Hills / Mare Tranquillitatis Pit):</b> Modeled after LROC NAC collapse pit catalogs. "
        "Targets basaltic volcanic provinces on Earth exhibiting intact lava tubes and skylights (e.g., Lanzarote, Hawaii, Undara).<br/>"
        "&nbsp;&nbsp;&nbsp;&nbsp;2. <b>Mars Cryo-Permafrost ISRU (Utopia Planitia):</b> Modeled after SHARAD subsurface ice discoveries, emphasizing zero summer vegetation, "
        "sub-zero ground temperatures, and permafrost freeze-thaw patterning.<br/>"
        "<b>Value:</b> Expands TerraNova from purely surface terrain into radiation-shielded habitat exploration.",
        body_style
    ))

    # Feature 2
    story.append(Paragraph("Feature 2: $F_{\\text{ops}}$ — Operational Mission Feasibility & Logistics Scoring", h2_style))
    story.append(Paragraph(
        "<b>Objective:</b> Target <i>Validity (20/20)</i> and <i>Best Mission Concept</i>.<br/>"
        "<b>Implementation:</b> Formulate the <b>NASA Expedition Priority Index (NEPI)</b>: $\\text{NEPI} = S_{\\text{phys}} \\times F_{\\text{ops}}$, where:<br/>"
        "&nbsp;&nbsp;&nbsp;&nbsp;• $f_{\\text{logistics}}$: Proximity to airstrips and transportation corridors (from open infrastructure datasets).<br/>"
        "&nbsp;&nbsp;&nbsp;&nbsp;• $f_{\\text{safety}}$: Proportion of local terrain under the 15° rover rollover hazard threshold.<br/>"
        "&nbsp;&nbsp;&nbsp;&nbsp;• $f_{\\text{jurisdiction}}$: Status check against World Database on Protected Areas (WDPA) Category Ia/Ib.<br/>"
        "<b>Value:</b> Bridges planetary science with actual expedition logistics, answering judges' questions on real-world implementation.",
        body_style
    ))

    # Feature 3
    story.append(Paragraph("Feature 3: NASA Hardware Qualification Matrix (TRL Testing Readiness)", h2_style))
    story.append(Paragraph(
        "<b>Objective:</b> Target <i>Best Use of Technology</i> & <i>Creativity (20/20)</i>.<br/>"
        "<b>Implementation:</b> Map site environmental characteristics to NASA Technology Readiness Level (TRL) test criteria:<br/>"
        "&nbsp;&nbsp;&nbsp;&nbsp;• <b>ISRU Cryo-Drill (VIPER / TRIDENT):</b> Requires MAAT < -10°C, zero NDVI, cryogenic regolith proxy.<br/>"
        "&nbsp;&nbsp;&nbsp;&nbsp;• <b>Autonomous Optical Navigation:</b> Requires polar latitude (> 70° N/S) with grazing sun (< 2° elevation) and extreme contrast shadows.<br/>"
        "&nbsp;&nbsp;&nbsp;&nbsp;• <b>xEVAS Spacesuit Mobility:</b> Requires rugged talus slopes, high diurnal thermal swing, and barren basaltic terrain.<br/>"
        "<b>Value:</b> Directly informs hardware engineers which mission subsystems can be certified at each discovered analog.",
        body_style
    ))

    # Feature 4
    story.append(Paragraph("Feature 4: Side-by-Side Planetary Digital Twin 3D View", h2_style))
    story.append(Paragraph(
        "<b>Objective:</b> Target <i>Best Use of Data (5/5)</i> & <i>Presentation (20/20)</i>.<br/>"
        "<b>Implementation:</b> Upgrade God's Eye 3D into a true dual-viewport scene:<br/>"
        "&nbsp;&nbsp;&nbsp;&nbsp;• <b>Left View:</b> Earth candidate elevation mesh (~150 m AWS Terrarium + Sentinel-2 drape).<br/>"
        "&nbsp;&nbsp;&nbsp;&nbsp;• <b>Right View:</b> Target planetary site (LRO LOLA Shackleton DTM or Mars HiRISE Jezero DTM).<br/>"
        "&nbsp;&nbsp;&nbsp;&nbsp;• <b>Synchronized Sun Angle:</b> Dragging the sun elevation slider to 1.5° casts long, dramatic grazing shadows on both terrains simultaneously.<br/>"
        "<b>Value:</b> Delivers immediate, high-impact visual proof of topographic and illumination similarity.",
        body_style
    ))

    # Feature 5
    story.append(Paragraph("Feature 5: Interactive EVA Traverse Route Analyzer & Mission Dossier Export", h2_style))
    story.append(Paragraph(
        "<b>Objective:</b> Target <i>Best Storytelling</i> & <i>UX (5/5)</i>.<br/>"
        "<b>Implementation:</b> Interactive terrain tools in God's Eye 3D:<br/>"
        "&nbsp;&nbsp;&nbsp;&nbsp;• Click-to-plot waypoints (Basecamp $\\rightarrow$ Science Station $\\rightarrow$ Drill Site).<br/>"
        "&nbsp;&nbsp;&nbsp;&nbsp;• Elevation profile plot along path; automatically highlights slopes > 15° in red as rover hazards.<br/>"
        "&nbsp;&nbsp;&nbsp;&nbsp;• One-click export of an <b>'Artemis / Mars Mission Flight Dossier'</b> with maps, telemetry, and full NASA dataset citations.<br/>"
        "<b>Value:</b> Transforms TerraNova from a passive recommendation engine into an active mission rehearsal suite.",
        body_style
    ))
    story.append(Spacer(1, 10))

    # -------------------------------------------------------------------------
    # SECTION 7: VIDEO PRESENTATION SCRIPT BEAT SHEETS
    # -------------------------------------------------------------------------
    story.append(Paragraph("7. Strategic Pitch Video Beat Sheets (Judging Alignment)", h1_style))
    story.append(Paragraph(
        "Per the Participants Guide, Bangladesh teams owe three videos: Video 1 (prescreening, done), Video 2 (240s local judging cut), "
        "and Video 3 (30s global final cut). Both must strictly state NASA data usage out loud on camera.",
        body_style
    ))

    video_data = [
        [Paragraph("Time Slot", table_header), Paragraph("240s Local Judging Cut (4 Minutes)", table_header), Paragraph("30s Global Final Cut (30 Seconds)", table_header)],
        [
            Paragraph("<b>Intro / Hook</b>", table_cell_bold),
            Paragraph("<b>0:00-0:40:</b> 'Artemis is going to the Moon's South Pole. Before we risk lives and billions in flight hardware, where on Earth can we test it?' Name all team members clearly.", table_cell),
            Paragraph("<b>0:00-0:06:</b> 'Before Artemis touches down at the lunar South Pole, where on Earth can we test its rovers and habitats?'", table_cell)
        ],
        [
            Paragraph("<b>The Problem</b>", table_cell_bold),
            Paragraph("<b>0:40-1:20:</b> Highlight the multi-parameter mismatch: slope ≠ regolith ≠ cold trap ≠ thermal swing. No single place matches. Name the challenge statement verbatim.", table_cell),
            Paragraph("<b>0:06-0:12:</b> 'No single site matches. TerraNova screens 78,247 Earth cells against NASA planetary truth.'", table_cell)
        ],
        [
            Paragraph("<b>The Science</b>", table_cell_bold),
            Paragraph("<b>1:20-2:10:</b> Demonstrate deterministic scoring: NASA POWER, GIBS MODIS NDVI, LST, AWS Terrarium. Show ROC-AUC 1.00 proof separating analogs from rainforests.", table_cell),
            Paragraph("<b>0:12-0:18:</b> Fast visual cut of 3D globe heatmap, weight sliders, and ROC-AUC 1.00 validation.", table_cell)
        ],
        [
            Paragraph("<b>The Breakthrough</b>", table_cell_bold),
            Paragraph("<b>2:10-3:15:</b> Live demo: discover new uncatalogued sites, toggle $F_{\\text{ops}}$ logistics feasibility, and show the NASA Hardware Qualification Matrix.", table_cell),
            Paragraph("<b>0:18-0:25:</b> Zoom into God's Eye 3D: lunar polar grazing shadows and rover hazard slope analysis.", table_cell)
        ],
        [
            Paragraph("<b>Conclusion & Ask</b>", table_cell_bold),
            Paragraph("<b>3:15-4:00:</b> God's Eye 3D fly-through, low-sun lunar shadows, traverse route plot. State NASA datasets out loud: 'NASA POWER, MODIS, LOLA, Diviner'. Public GitHub link.", table_cell),
            Paragraph("<b>0:25-0:30:</b> 'Deterministic science. 100% open NASA data. Team DaRK_MATTER.'", table_cell)
        ],
    ]

    t_video = Table(video_data, colWidths=[80, 246, 206])
    t_video.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), C_NASA_RED),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("GRID", (0, 0), (-1, -1), 0.5, C_BORDER_GRAY),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [C_WHITE, C_ALT_ROW]),
    ]))
    story.append(t_video)
    story.append(Spacer(1, 8))

    # -------------------------------------------------------------------------
    # SECTION 8: READINESS & COMPLIANCE CHECKLIST
    # -------------------------------------------------------------------------
    story.append(Paragraph("8. Pre-Submission Verification Checklist", h1_style))
    checklist = [
        "<b>Challenge Categorization:</b> Explicitly named: <i>'Identify Earth Locations that Analog the Permanent Moon Base Locations and Mars'</i>.",
        "<b>Scientific Integrity:</b> Every number and metric is verified; zero stochastic LLM hallucinations in ranking or scoring.",
        "<b>Offline-First Operation:</b> Verified functioning with <code>OFFLINE=1</code> using committed Zarr predictor cubes.",
        "<b>NASA Data Primacy:</b> NASA POWER climatology, GIBS MODIS NDVI, MODIS LST, NASA Blue Marble, Moon/Mars Trek cited with full dataset IDs.",
        "<b>Design System Alignment:</b> Frontier theme fully consistent with <code>DESIGN.md</code> tokens (Space Black, Action Red, Tool Blue, typography).",
        "<b>Repository Health:</b> Public GitHub repository, Apache-2.0 license, clean <code>DEVELOPMENT.md</code>, passing test suite (81/81).",
    ]
    for item in checklist:
        story.append(Paragraph(f"☑ {item}", bullet_style))

    # Build document
    doc.build(story, canvasmaker=NumberedCanvas)
    print(f"PDF successfully generated at: {OUTPUT_PDF}")

    # Also copy to secondary location if requested
    try:
        import shutil
        SECONDARY_PDF.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(OUTPUT_PDF, SECONDARY_PDF)
        print(f"Secondary copy saved at: {SECONDARY_PDF}")
    except Exception as exc:
        print(f"Notice: secondary copy skipped ({exc})")


if __name__ == "__main__":
    build_pdf()
