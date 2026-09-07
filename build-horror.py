#!/usr/bin/env python3
"""Generate horror.html from index.html.

The two pages share all their behaviour. Rather than maintain a second copy,
this rewrites the palette, the type stacks, the scale labels and the wording,
and leaves the script untouched apart from the band labels. Run it after any
change to index.html:

    ./build-horror.py

If a substitution stops matching it is reported and the build fails, so an
edit to index.html cannot silently leave the horror cut half updated.
"""
import re
import sys
import urllib.parse

SRC, DST = "index.html", "horror.html"

# The rating box and billing block are finished but held back. Flip to True
# and rerun to put them at the foot of the page.
SHOW_ONE_SHEET = False

# How the hero photograph is screened.
#   "canvas" keeps the photograph's colour: each cell is drawn in its own
#           sampled hue, so the dots build tone without going monochrome.
#   "css"   thresholds the whole group with contrast(), which is a truer
#           press halftone but costs the colour and is much harsher.
#   "none"  leaves the photograph alone.
HERO_HALFTONE = "none"

# Sun-bleached one-sheet: dirty bone, oxblood, rust.
LIGHT = {
    "--paper:": "#E5DCC9", "--paper-sunk:": "#D8CDB6", "--card:": "#F1EADB",
    "--ink:": "#14100C", "--ink-mid:": "#574C3E", "--ink-faint:": "#8A7C68",
    "--chile:": "#8E1409", "--chile-deep:": "#5C0B04", "--flame:": "#B4551D",
    "--char:": "#0B0907", "--char-soft:": "#14100C", "--bone:": "#E5DCC9",
    "--rule:": "#C9BCA2", "--rule-firm:": "#A8987A", "--pip-off:": "#B6A88C",
    "--h1:": "#6E7A38", "--h2:": "#8E1409", "--h3:": "#A82F0F", "--h4:": "#BF5A16",
    "--h5:": "#CE8A22", "--h6:": "#E4CE8E", "--h6-edge:": "#9C7A22",
    "--name-color:": "#8E1409",
}
DARK = {
    "--paper:": "#0C0A08", "--paper-sunk:": "#120E0B", "--card:": "#17120E",
    "--ink:": "#E2D7C3", "--ink-mid:": "#9A8C77", "--ink-faint:": "#7A6D5C",
    "--chile:": "#C62A18", "--chile-deep:": "#E0503A", "--flame:": "#D2822F",
    "--char:": "#060504", "--char-soft:": "#100D0A", "--bone:": "#E2D7C3",
    "--rule:": "#2A211A", "--rule-firm:": "#3E3226", "--pip-off:": "#362B21",
    "--h1:": "#8A9A48", "--h2:": "#C62A18", "--h3:": "#D8451C", "--h4:": "#E4721F",
    "--h5:": "#EFA033", "--h6:": "#F2E0A8", "--h6-edge:": "#A8862E",
    "--name-color:": "#E0503A",
}

FONT_LINK = (
    '<link rel="stylesheet" href="https://fonts.googleapis.com/css2'
    "?family=Special+Elite"
    "&family=Comic+Neue:ital,wght@0,400;0,700;1,400;1,700"
    "&family=Barlow:ital,wght@0,400;0,500;0,600;1,400"
    "&family=Barlow+Condensed:wght@500;600;700"
    '&display=swap">'
)

WIRE_SVG = (
    # Traced from the wire in their logo: two strands twisted together read
    # as a chain of lenses that bulge and pinch, not a straight line. The
    # knot is a coil built from overlapping lobes offset left and right, so
    # its outline is lumpy rather than a smooth lozenge. Barbs are steep and
    # project well clear of the strand rather than splaying sideways.
    "<svg xmlns='http://www.w3.org/2000/svg' width='72' height='14'>"
    "<path fill='#000' d='M0 6.6 Q9 2.6 18 6.6 Q27 2.6 36 6.6 Q45 2.6 54 6.6"
    " Q63 2.6 72 6.6 L72 7.4 Q63 11.4 54 7.4 Q45 11.4 36 7.4 Q27 11.4 18 7.4"
    " Q9 11.4 0 7.4 Z'/>"
    "<g fill='#000'>"
    "<ellipse cx='36' cy='7' rx='3.4' ry='4'/>"
    "<circle cx='34.5' cy='3.5' r='2.1'/>"
    "<circle cx='37.7' cy='5.3' r='2.3'/>"
    "<circle cx='34.3' cy='8.8' r='2.3'/>"
    "<circle cx='37.5' cy='10.7' r='2'/>"
    "</g>"
    "<g fill='none' stroke='#000' stroke-width='1.8' stroke-linecap='round'>"
    "<path d='M34.4 5.4 L32.2 0.6'/>"
    "<path d='M37.6 5.4 L39.8 0.6'/>"
    "<path d='M34.4 8.6 L32.2 13.4'/>"
    "</g></svg>"
)

GRAIN_SVG = (
    "<svg xmlns='http://www.w3.org/2000/svg' width='260' height='260'>"
    "<filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.82' "
    "numOctaves='4' stitchTiles='stitch'/></filter>"
    "<rect width='100%' height='100%' filter='url(#n)'/></svg>"
)

HALFTONE_CSS = """  /* True halftone. Soft-edged dots are blended into the photograph with
     hard-light, then the whole group is thresholded with contrast(). Each
     dot's dark core grows where the image is dark and shrinks where it is
     light, which is what makes it read as reproduction instead of a texture
     laid on top. A fixed-size dot grid can never do that however it is tuned.

     Thresholding costs the photograph its colour, so a little sepia goes back
     in afterwards to keep it in the palette. */
  .hero-media {
    isolation: isolate;
    filter: grayscale(1) brightness(1.5) contrast(9) sepia(0.45) brightness(1.08);
  }

  .hero-media img { filter: none; }

  .hero-media::before {
    content: ""; position: absolute; inset: -40%%; z-index: 1;
    background-image: radial-gradient(circle, #000 0%%, #fff 74%%);
    background-size: 7px 7px;
    transform: rotate(45deg);
    mix-blend-mode: hard-light;
    pointer-events: none;
  }

  /* The darkening wash has to sit outside the thresholded group, or contrast()
     crushes it to a hard band. Moved up to .hero, between the photo and the
     text, which is why .hero-inner needs a layer of its own. */
  .hero-media::after { display: none; }

  .hero::before {
    content: ""; position: absolute; inset: 0; z-index: 1; pointer-events: none;
    background:
      linear-gradient(to bottom, rgba(14,10,8,0.80) 0%%, rgba(14,10,8,0.34) 28%%,
                                 rgba(14,10,8,0.62) 52%%, rgba(14,10,8,0.88) 100%%),
      radial-gradient(ellipse at 22%% 40%%, rgba(196,36,27,0.26), transparent 62%%);
  }

  .hero-inner { z-index: 2; }

  /* Sits over the lightest part of the screen, so it needs the same lift
     the headline and standfirst already have. */
  .hero-place { text-shadow: 0 1px 3px rgba(0,0,0,0.9), 0 0 14px rgba(0,0,0,0.7); }"""

HALFTONE_NONE = """
  /* The plain header: sun-faded stock, no screen. */
  .hero-media img { filter: sepia(0.30) saturate(0.78) contrast(1.20); }
  .hero-place { text-shadow: 0 1px 3px rgba(0,0,0,0.9), 0 0 14px rgba(0,0,0,0.7); }
"""

HALFTONE_CANVAS = """
  /* The canvas replaces the photograph in place; keep the wash and the text
     layering identical to the CSS variant so the two are swappable. */
  .hero-media { isolation: isolate; }
  .hero-media img { filter: sepia(0.18) saturate(0.9) contrast(1.06); }
  .hero-media canvas {
    position: absolute; inset: 0; width: 100%; height: 100%;
    display: block; z-index: 1;
  }
  .hero-media::after { z-index: 2; }
  .hero-place { text-shadow: 0 1px 3px rgba(0,0,0,0.9), 0 0 14px rgba(0,0,0,0.7); }
"""

OVERRIDES = """
  /* ================= horror cut =================
     Everything below is the only styling difference from index.html.
     Generated by build-horror.py, do not hand edit. */

  /* Print grain and a vignette, so the page reads like a sun-bleached
     one-sheet rather than a clean web page. Both are inert overlays. */
  body::after {
    content: ""; position: fixed; inset: 0; z-index: 60; pointer-events: none;
    background-image: url("__GRAIN__");
    background-size: 260px 260px;
    opacity: 0.30; mix-blend-mode: multiply;
  }

  body::before {
    content: ""; position: fixed; inset: 0; z-index: 59; pointer-events: none;
    background: radial-gradient(ellipse at 50% 42%, transparent 42%, rgba(6,5,4,0.42) 100%);
  }

  :root[data-theme="dark"] body::after { mix-blend-mode: screen; opacity: 0.16; }

  /* Special Elite is a light face. Give the big type some weight and air. */
  .hero h1 {
    letter-spacing: -0.005em; line-height: 1.02;
    text-shadow: 0 3px 0 rgba(0,0,0,0.30), 0 2px 26px rgba(0,0,0,0.62);
  }

  h2 { line-height: 1.06; }

  /* Typewriter for the small print, like a case file. The two maker names
     carry .eyebrow as well, but they are set like product names, so they are
     excluded here: this block sits after .maker at the same specificity and
     would otherwise win. */
  .eyebrow:not(.maker), .stub, .heat-word, .cal-when, .draft {
    font-family: "Special Elite", "Courier New", monospace;
    letter-spacing: 0.05em;
  }

  .eyebrow:not(.maker) { font-size: 14px; }
  .heat-word { font-size: 11.5px; }

  /* Squared off, heavier rules. Nothing here is soft. */
  .btn, .prod, .deal, .cal-stub, .split img, .scale-key, .filters button { border-radius: 0; }
  .prod { border-color: var(--rule-firm); }
  .prod::before { width: 4px; }

  .hero-logo {
    background: rgba(232,224,205,0.92);
    box-shadow: 0 6px 34px rgba(0,0,0,0.75);
    filter: saturate(0.88) contrast(1.05);
  }

  /* Barbed wire runs along the top band and both edges of the story block,
     picking up the wire in the logo. Masked rather than drawn in a fixed
     colour so it follows the theme. Section headings keep a plain rule: wire
     under every one of them was too much of a good thing. */
  .strip, .story { position: relative; }

  .strip::before, .strip::after,
  .story::before, .story::after {
    content: ""; position: absolute; left: 0; right: 0; height: 14px;
    background-color: var(--chile);
    opacity: 0.85;
    -webkit-mask-image: url("__WIRE__"); mask-image: url("__WIRE__");
    -webkit-mask-repeat: repeat-x; mask-repeat: repeat-x;
    -webkit-mask-size: 72px 14px; mask-size: 72px 14px;
    -webkit-mask-position: left center; mask-position: left center;
    pointer-events: none; z-index: 2;
  }

  /* The wire graphic runs through the middle of its 14px tile, so the strip
     is pulled out by half its height to put the wire itself exactly on the
     boundary rather than 7px inside it. */
  .strip::before, .story::before { top: -7px; }
  .strip::after,  .story::after  { bottom: -7px; }

  /* --- flourishes. All decorative, all aria-hidden, none affect layout. --- */

  .flourish { display: inline-block; vertical-align: middle; flex: none; }

  /* Scythe and cleaver sit at the end of a line of body copy, so they take
     their colour from it and stay legible in both themes. */
  /* A tall glyph inside a paragraph stretches the line box it lands on, which
     knocked the leading out. These sit beside the whole block instead. */
  .lede-row { display: flex; align-items: center; gap: 20px; }
  .lede-row .lede { margin-top: 0; }

  @media (max-width: 620px) {
    .lede-row { flex-direction: column; align-items: flex-start; gap: 6px; }
  }

  /* A small torn print at the head of each maker's section, same treatment as
     the booth photo. The heading block keeps the left column; the print spans
     all three rows on the right. Laid out by explicit row/column so the print
     can simply be appended after the lede rather than wrapping the heading. */
  #jars .sec-head, #sauces .sec-head {
    display: grid;
    /* A fraction, not auto, so the print scales with the column the way the
       booth photo does rather than sitting at one fixed size. */
    grid-template-columns: minmax(0, 1fr) minmax(168px, 27%);
    column-gap: 30px;
    align-items: start;
  }

  #jars .sec-head > .eyebrow,  #sauces .sec-head > .eyebrow  { grid-column: 1; grid-row: 1; }
  #jars .sec-head > h2,        #sauces .sec-head > h2        { grid-column: 1; grid-row: 2; }
  #jars .sec-head > .lede-row, #sauces .sec-head > .lede-row { grid-column: 1; grid-row: 3; }

  #jars .sec-head > .snapshot, #sauces .sec-head > .snapshot {
    grid-column: 2; grid-row: 1 / span 3; align-self: center;
  }

  .snapshot-sm { width: 100%; }
  .snapshot-sm .snapshot-paper { padding: 5px 5px 9px; }

  /* Each print tears differently. Reusing one mask made them read as three
     copies of the same sheet. */
  #jars .snapshot-sm .snapshot-paper {
    -webkit-mask-image: url("__TORN_P__"); mask-image: url("__TORN_P__");
  }
  #sauces .snapshot-sm .snapshot-paper {
    -webkit-mask-image: url("__TORN_J__"); mask-image: url("__TORN_J__");
  }
  #jars .snapshot-sm   { transform: rotate(-1.7deg); }
  #sauces .snapshot-sm { transform: rotate(2.0deg); }

  /* The batch photo in the story, pinned under the pull quote. */
  .story .snapshot-story {
    width: min(100%, 330px); margin-top: 30px;
    transform: rotate(-2.8deg);
  }

  .snapshot-story .snapshot-paper {
    padding: 6px 6px 11px;
    -webkit-mask-image: url("__TORN_S__"); mask-image: url("__TORN_S__");
  }

  @media (max-width: 800px) {
    .story .snapshot-story { width: min(100%, 420px); transform: rotate(-2.2deg); }
  }

  @media (max-width: 820px) {
    #jars .sec-head, #sauces .sec-head { grid-template-columns: minmax(0, 1fr); }
    #jars .sec-head > .snapshot, #sauces .sec-head > .snapshot {
      grid-column: 1; grid-row: 4; margin-top: 24px; justify-self: start;
    }
    /* Stacked, it has the whole width to itself, so it grows. */
    .snapshot-sm { width: min(100%, 460px); }
    .snapshot-sm .snapshot-paper { padding: 7px 7px 12px; }
  }

  .flourish-blade {
    width: 84px; height: 56px;
    color: var(--chile); opacity: 0.85;
  }

  .flourish-blade .edge { fill: currentColor; }
  .flourish-blade .haft { stroke: currentColor; stroke-width: 3.6; stroke-linecap: round; fill: none; }
  .flourish-blade .grip { stroke: currentColor; stroke-width: 7; stroke-linecap: round; fill: none; }
  .flourish-blade .hole { fill: var(--paper); }

  /* The footer is dark in both themes, so the holes can be a fixed near-black
     punched through it, with a chipped rim catching the light. */
  .flourish-holes { width: 118px; height: 52px; margin-left: 18px; }

  .flourish-spatter { width: 58px; height: 24px; margin-left: 12px; color: var(--chile); }
  .flourish-spatter .drop { fill: currentColor; }
  .flourish-holes .hole { fill: #050403; }
  .flourish-holes .rim { fill: none; stroke: rgba(236,222,200,0.38); stroke-width: 1.3; }
  .flourish-holes .crack { stroke: rgba(236,222,200,0.30); stroke-width: 1.3; stroke-linecap: round; }

  .foot-top h2 { display: flex; align-items: center; flex-wrap: wrap; }

  /* ---- 1977 one-sheet: tagline, misregistration, sun-faded stock,
         rating box and billing block. ---- */


  /* Cheap offset printing never quite lined the plates up. A red ghost a
     hair off the black sells the period more than any texture does. */
  h2 { text-shadow: 1.6px 1.2px 0 color-mix(in srgb, var(--chile) 30%, transparent); }
  :root[data-theme="dark"] h2 { text-shadow: 1.6px 1.2px 0 color-mix(in srgb, var(--chile) 42%, transparent); }

  .hero h1 {
    text-shadow: 2px -1.5px 0 color-mix(in srgb, var(--chile) 55%, transparent),
                 0 3px 0 rgba(0,0,0,0.30), 0 2px 26px rgba(0,0,0,0.62);
  }

  /* Photographs read as printed stock rather than digital: sun-faded,
     pushed contrast, then a dot screen over the top. The palette is left
     alone, the dots are neutral ink. */
__HALFTONE__
  .split img { filter: sepia(0.26) saturate(0.76) contrast(1.16); }

  /* The booth photo is treated as a physical print torn out and laid on the
     page: bone print border, torn bottom edge, knocked off square. The mask
     clips a filter, so the shadow lives on the outer element where it can
     follow the torn alpha instead of being cut off by it. */
  .snapshot {
    display: block;
    transform: rotate(2.4deg);
    /* Tight and dark: a print lying on paper casts a hard little shadow,
       not the soft halo of something floating. */
    filter: drop-shadow(1px 2px 1px rgba(0,0,0,0.6));
  }

  .snapshot-paper {
    display: block; position: relative;
    background: #FBF8F1;
    padding: 7px 7px 14px;
    -webkit-mask-image: url("__TORN__"); mask-image: url("__TORN__");
    -webkit-mask-size: 100% 100%; mask-size: 100% 100%;
    -webkit-mask-repeat: no-repeat; mask-repeat: no-repeat;
  }

  .snapshot img {
    display: block; width: 100%; border: 0; border-radius: 0;
    filter: sepia(0.26) saturate(0.76) contrast(1.16);
  }

  /* Age and handling. The blotches themselves are generated per print, so no
     two sheets carry the same marks. Inside the mask, so the dirt tears with
     the edge. */
  .snapshot-paper::after {
    content: ""; position: absolute; inset: 0; pointer-events: none;
    mix-blend-mode: multiply;
  }

__STAINS__

  @media (max-width: 800px) { .snapshot { transform: rotate(1.4deg); } }

  /* The bottom of a one-sheet: rating box on the left, credits beneath. */
  .one-sheet {
    margin-top: 34px; padding-top: 26px;
    border-top: 1px solid rgba(226,215,195,0.16);
    display: flex; flex-direction: column; gap: 20px; align-items: center;
  }

  .rating {
    display: flex; align-items: stretch; align-self: flex-start;
    border: 2px solid rgba(226,215,195,0.72);
    background: #060504;
  }

  .rating-mark {
    font-family: var(--display);
    font-size: 30px; line-height: 1;
    color: #E8DEC9;
    padding: 7px 13px 5px;
    border-right: 2px solid rgba(226,215,195,0.72);
    display: flex; align-items: center;
  }

  .rating-text {
    font-family: var(--cond);
    font-size: 12px; font-weight: 600;
    letter-spacing: 0.16em; text-transform: uppercase;
    color: #E8DEC9;
    padding: 7px 14px; display: flex; flex-direction: column; justify-content: center; gap: 2px;
  }

  .rating-text small {
    font-size: 10.5px; font-weight: 500;
    letter-spacing: 0.1em; color: #A2957F;
  }

  /* Billing block. Tiny, condensed, centred, run together: the credit slab
     along the bottom of every poster of the era. */
  .billing {
    font-family: var(--cond);
    font-size: 10.5px; font-weight: 500;
    line-height: 1.55; letter-spacing: 0.05em;
    text-transform: uppercase;
    color: rgba(226,215,195,0.42);
    text-align: center; text-wrap: balance;
    /* In px, not ch: at 10.5px a ch is about 4.7px, so a ch-based cap made
       this a narrow column instead of the wide shallow slab it should be. */
    max-width: 660px; margin: 0;
  }

  .billing b { font-weight: 600; color: rgba(226,215,195,0.62); }
"""

SCYTHE = ('<svg class="flourish flourish-blade" viewBox="0 0 84 56" aria-hidden="true" focusable="false"><path class="edge" d="M53 8 C38 6 18 12 6 26 C20 18 38 16 52 18 Z"/><path class="haft" d="M52 12 L60 52"/><path class="haft" d="M56 34 L68 29"/></svg>')

CLEAVER = ('<svg class="flourish flourish-blade" viewBox="0 0 84 56" aria-hidden="true" focusable="false"><path class="edge" d="M8 9 H48 V37 C35 45 21 45 8 37 Z"/><circle class="hole" cx="15" cy="17" r="3"/><path class="grip" d="M52 25 H76"/></svg>')

HOLES = ('<svg class="flourish flourish-holes" viewBox="0 0 118 52" aria-hidden="true" focusable="false"><g class="crack"><path d="M22 24 L6 12"/><path d="M22 24 L38 13"/><path d="M22 24 L18 44"/><path d="M22 24 L37 37"/><path d="M63 17 L51 5"/><path d="M63 17 L77 10"/><path d="M63 17 L60 32"/><path d="M95 34 L110 26"/><path d="M95 34 L86 47"/><path d="M95 34 L106 45"/></g><circle class="hole" cx="22" cy="24" r="8.5"/><circle class="rim" cx="22" cy="24" r="10"/><circle class="hole" cx="63" cy="17" r="6"/><circle class="rim" cx="63" cy="17" r="7.4"/><circle class="hole" cx="95" cy="34" r="7"/><circle class="rim" cx="95" cy="34" r="8.5"/></svg>')

HALFTONE_JS = """
<script>
// Colour halftone over the hero photograph. Each cell is sampled from the
// image and drawn as a dot sized by that cell's darkness but filled with its
// own colour, so tone comes from dot area while the hue survives. The CSS
// variant thresholds the whole group instead: a truer press halftone, but
// monochrome and much harsher.
(function () {
  "use strict";
  var PITCH = 3, ANGLE = Math.PI / 4, MAXR = 1.34, MINR = 0.05;
  var GROUND = "#E8DFCB";   // the paper the ink sits on

  var media = document.querySelector(".hero-media");
  var img = media && media.querySelector("img");
  if (!media || !img) return;

  var canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  var ctx = canvas.getContext("2d");
  var scratch = document.createElement("canvas");
  var sctx = scratch.getContext("2d", { willReadFrequently: true });

  function render() {
    var w = media.clientWidth, h = media.clientHeight;
    if (!w || !h || !img.naturalWidth) return;

    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // emulate object-fit: cover with object-position: center 62%
    var scale = Math.max(w / img.naturalWidth, h / img.naturalHeight);
    var sw = w / scale, sh = h / scale;
    var sx = (img.naturalWidth - sw) / 2;
    var sy = (img.naturalHeight - sh) * 0.62;

    scratch.width = Math.max(1, Math.ceil(w / PITCH) + 2);
    scratch.height = Math.max(1, Math.ceil(h / PITCH) + 2);
    var data;
    try {
      sctx.drawImage(img, sx, sy, sw, sh, 0, 0, scratch.width, scratch.height);
      data = sctx.getImageData(0, 0, scratch.width, scratch.height).data;
    } catch (e) {
      return;   // not decoded yet, or a cross-origin source
    }

    // Ink on paper: a light ground with the dots as ink. Using the image's own
    // average instead leaves the dots barely separated from it, which is what
    // the first attempt looked like. MAXR passes 1 so dots overlap in the
    // shadows and read as solid rather than a lattice of gaps.
    ctx.fillStyle = GROUND;
    ctx.fillRect(0, 0, w, h);

    var cos = Math.cos(ANGLE), sin = Math.sin(ANGLE);

    // Lattice indices for the four corners of the viewport, so the sweep covers
    // only cells that can land on screen. Brute-forcing the bounding square is
    // millions of wasted iterations once the pitch gets this fine.
    var loX = Infinity, hiX = -Infinity, loY = Infinity, hiY = -Infinity;
    [[0, 0], [w, 0], [0, h], [w, h]].forEach(function (c) {
      var u = (c[0] - w / 2) / PITCH, v = (c[1] - h / 2) / PITCH;
      var ix = u * cos + v * sin, iy = -u * sin + v * cos;
      loX = Math.min(loX, ix); hiX = Math.max(hiX, ix);
      loY = Math.min(loY, iy); hiY = Math.max(hiY, iy);
    });
    loX = Math.floor(loX) - 1; hiX = Math.ceil(hiX) + 1;
    loY = Math.floor(loY) - 1; hiY = Math.ceil(hiY) + 1;

    for (var iy = loY; iy <= hiY; iy++) {
      for (var ix = loX; ix <= hiX; ix++) {
        var cx = (ix * cos - iy * sin) * PITCH + w / 2;
        var cy = (ix * sin + iy * cos) * PITCH + h / 2;
        if (cx < -PITCH || cy < -PITCH || cx > w + PITCH || cy > h + PITCH) continue;

        var gx = Math.min(scratch.width - 1, Math.max(0, Math.round(cx / PITCH)));
        var gy = Math.min(scratch.height - 1, Math.max(0, Math.round(cy / PITCH)));
        var o = (gy * scratch.width + gx) * 4;
        var r = data[o], g = data[o+1], b = data[o+2];
        var lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
        var rad = (MINR + (MAXR - MINR) * (1 - lum)) * PITCH / 2;

        ctx.fillStyle = "rgb(" + r + "," + g + "," + b + ")";
        ctx.beginPath();
        ctx.arc(cx, cy, rad, 0, 6.2832);
        ctx.fill();
      }
    }
    if (!canvas.parentNode) media.appendChild(canvas);
  }

  if (img.complete && img.naturalWidth) { render(); }
  else { img.addEventListener("load", render, { once: true }); }

  var t;
  window.addEventListener("resize", function () { clearTimeout(t); t = setTimeout(render, 150); });
})();
</script>
"""


def _stains(seed, blotches=(5, 8), scuffs=(0, 2)):
    """A random scatter of blotches and scuffs, as a CSS background stack."""
    import random
    rnd = random.Random(seed)
    parts = []
    for _ in range(rnd.randint(*blotches)):
        parts.append(
            "radial-gradient(ellipse %d%% %d%% at %d%% %d%%, "
            "rgba(%d,%d,%d,%.2f), transparent %d%%)" % (
                rnd.randint(14, 50), rnd.randint(12, 44),
                rnd.randint(-6, 106), rnd.randint(-6, 106),
                rnd.randint(42, 92), rnd.randint(30, 64), rnd.randint(16, 40),
                # multiplied over an already dark, desaturated print, anything
                # under about 0.3 simply does not show
                rnd.uniform(0.34, 0.62), rnd.randint(58, 74)))
    for _ in range(rnd.randint(*scuffs)):
        at = rnd.uniform(18, 82)
        # Faint and soft-edged. A hard band at high opacity reads as a drawn
        # line rather than a crease in the paper.
        parts.append(
            "linear-gradient(%ddeg, transparent %.1f%%, rgba(66,48,30,%.2f) %.1f%%, "
            "transparent %.1f%%)" % (rnd.randint(64, 132), at - 4.0,
                                     rnd.uniform(0.07, 0.15), at, at + 4.0))
    return ",\n      ".join(parts)


def _stain_rules():
    """One background stack per print, so the marks never repeat."""
    return "\n\n".join(
        "  %s::after {\n    background:\n      %s;\n  }" % (sel, _stains(seed))
        for sel, seed in [
            ("#find .snapshot-paper", 4102),
            ("#jars .snapshot-sm .snapshot-paper", 7734),
            ("#sauces .snapshot-sm .snapshot-paper", 2915),
            (".story .snapshot-story .snapshot-paper", 6608),
        ])


def _print(src, w, h, alt):
    """A small torn print. Intrinsic size is declared so the browser reserves
    the box before the image loads, and it defers: all of these sit well below
    the fold."""
    return ('<span class="snapshot snapshot-sm"><span class="snapshot-paper">'
            '<img src="%s" width="%d" height="%d" loading="lazy" decoding="async" '
            'alt="%s"></span></span>' % (src, w, h, alt))


PRINT_PAULA = _print("images/paula-pickles.jpg", 520, 309,
                     "Jars of Paula's dill pickles fresh from the kitchen, "
                     "cucumber, onion, dill and a red pepper in the brine")
PRINT_STORY = ('<span class="snapshot snapshot-story"><span class="snapshot-paper">'
               '<img src="images/pepper-mash.jpg" width="520" height="339" '
               'loading="lazy" decoding="async" alt="Minced red peppers and '
               'seeds, part way through a batch of hot sauce"></span></span>')
PRINT_JOHN = _print("images/john-bottles.jpg", 520, 296,
                    "Bottles of Crazy John's ultra insanity sauces on the "
                    "market table")

SPATTER = ('<svg class="flourish flourish-spatter" viewBox="0 0 58 24" aria-hidden="true" focusable="false"><g class="drop"><path d="M20 5 C26 2 33 4 34 9 C35 15 30 19 24 18 C17 17 13 12 15 8 C16 6 18 5 20 5 Z"/><path d="M38 6 C41 5 44 7 43 10 C42 13 38 13 37 10 C36 8 37 6 38 6 Z"/><circle cx="9" cy="4" r="2.1"/><circle cx="6" cy="14" r="1.5"/><circle cx="12" cy="20" r="1.2"/><circle cx="30" cy="21" r="1.6"/><circle cx="47" cy="16" r="2.3"/><circle cx="52" cy="7" r="1.4"/><circle cx="56" cy="19" r="1"/><circle cx="42" cy="2" r="1.1"/></g></svg>')

ONE_SHEET_ENTRY = (
    '    <button class="theme-toggle" id="theme-toggle" type="button">Lights on</button>',
    '    <div class="one-sheet"><div class="rating" aria-hidden="true"><span class="rating-mark">H</span><span class="rating-text">Restricted<small>Not suitable for the mild</small></span></div><p class="billing"><b>Paula and Crazy John\'s Hot Stuff</b> presents a home kitchen production &middot; <b>&ldquo;No Survivors&rdquo;</b> &middot; salsa, pickles and cowboy candy by Paula &middot; hot sauce by Crazy John &middot; peppers grown out back &middot; jarred and labelled by hand &middot; filmed on location in Elgin, Texas &middot; sold face to face at markets across Central Texas &middot; no animals were harmed &middot; some peppers were</p></div>\n\n    <button class="theme-toggle" id="theme-toggle" type="button">Lights on</button>',
)

# (find, replace). Every one must match or the build fails.
COPY = [
    ('--display: "Alfa Slab One", Georgia, serif;',
     '--display: "Special Elite", "Courier New", monospace;'),
    ('--body:    "IBM Plex Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;',
     '--body:    "Barlow", -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;'),

    # the scale keeps its shape, only the words change
    ('{ key: "mild",   range: [1, 1], label: "Mild" },',
     '{ key: "mild",   range: [1, 1], label: "Harmless" },'),
    ('{ key: "medium", range: [2, 3], label: "Medium" },',
     '{ key: "medium", range: [2, 3], label: "Uneasy" },'),
    ('{ key: "hot",    range: [4, 5], label: "Hot" },',
     '{ key: "hot",    range: [4, 5], label: "Regrettable" },'),
    ('{ key: "beyond", range: [6, 6], label: "Beyond" }',
     '{ key: "beyond", range: [6, 6], label: "No survivors" }'),

    ("Draft preview. Product list, prices and heat ratings still need Paula &amp; Crazy John to confirm.",
     "Draft preview, horror cut. Product list, prices and heat ratings still need Paula &amp; Crazy John to confirm."),
    ("<h1>Home grown, <em>hand jarred, seriously hot.</em></h1>",
     "<h1>Home grown. <em>Hand jarred. No survivors.</em></h1>"),
    ("Small-batch salsa, hot sauce, cowboy candy, pickles and chow chow, made from ingredients we grow ourselves, in a kitchen that smells like it.",
     "Small-batch salsa, hot sauce, cowboy candy, pickles and chow chow. Everything grown out back, everything put up by hand, in a kitchen you would not want to walk into unannounced."),
    (">Find Our Booth<", ">Find The Booth<"),
    ("<span>Mild to ghostly and beyond</span>", "<span>Mild to unholy</span>"),
    ("<span>Lots of them</span>", "<span>More than is wise</span>"),
    ("<span>Ask at the booth</span>", "<span>Ask, if you're brave</span>"),
    ('<p class="lede">Crazy John builds these one small batch at a time, and they climb from friendly to genuinely reckless. The rating is his own, it goes past the reaper, and he does not grade on a curve.</p>',
     '<div class="lede-row"><p class="lede">Crazy John builds these one small batch at a time, out in the shed, and they climb from friendly to genuinely reckless. The rating is his own, it goes well past the reaper, and he does not grade on a curve.</p>'
     + SCYTHE + "</div>" + PRINT_JOHN),

    ('<p class="lede">Paula\'s side of the table. Same garden, gentler intentions. Mostly.</p>',
     '<div class="lede-row"><p class="lede">Paula\'s side of the table. Same garden, gentler intentions. Mostly.</p>'
     + CLEAVER + "</div>" + PRINT_PAULA),

    ("<h2>Come get some.</h2>", "<h2>Come get some." + HOLES + "</h2>"),

    ('<p class="eyebrow">What it costs</p>',
     '<p class="eyebrow">What it costs' + SPATTER + "</p>"),
    ('<p class="story-quote">Most of what goes in the jar came out of our own garden.</p>',
     '<p class="story-quote">Most of what goes in the jar came out of our own garden.</p>'
     + PRINT_STORY),

    ("We're at markets and community events around Elgin and Central Texas most weekends. This list keeps itself up to date.",
     "Lurking at markets and community events around Elgin and Central Texas most weekends. You'll know the booth when you see it."),

    # an img cannot carry a mask plus a shadow that follows it, so it is wrapped
    ('<img src="images/booth.jpg" width="1400" height="1050" loading="lazy" decoding="async" alt="The Paula and Crazy John\'s booth set up under a canopy with red tables full of jars">',
     '<span class="snapshot"><span class="snapshot-paper">' + '<img src="images/booth.jpg" width="1400" height="1050" loading="lazy" decoding="async" alt="The Paula and Crazy John\'s booth set up under a canopy with red tables full of jars">' + '</span></span>'),
]


def _wander(rnd, span, amp, notch, deep, step=(2.0, 5.5), base=0.0):
    """Offsets along an edge: slow drift plus fine jitter, rare deeper bites."""
    pts, t, drift = [], 0.0, 0.0
    while t < span:
        drift = max(-amp, min(amp, drift + rnd.uniform(-0.45, 0.45)))
        off = abs(drift * 0.55 + rnd.uniform(0, amp * 0.5))
        if rnd.random() < notch:
            off += amp * rnd.uniform(*deep)
        pts.append((round(t, 1), round(base + off, 1)))
        t += rnd.uniform(*step)
    pts.append((float(span), pts[-1][1]))
    return pts


def _rip(rnd, p0, p1, amp, bow=0.0, notch=0.12, deep=(0.8, 1.8)):
    """A ragged tear from p0 to p1.

    The baseline is a bowed curve, not a chord: a straight run with fuzz on it
    still reads as a cut. `bow` displaces the curve along the normal, positive
    meaning into the photo. The wander then rides on top of that.
    """
    (x0, y0), (x1, y1) = p0, p1
    dx, dy = x1 - x0, y1 - y0
    length = (dx * dx + dy * dy) ** 0.5
    nx, ny = -dy / length, dx / length
    if nx < 0:
        nx, ny = -nx, -ny
    cx, cy = (x0 + x1) / 2 + nx * bow, (y0 + y1) / 2 + ny * bow
    out, t, drift = [], 0.0, 0.0
    while t < length:
        drift = max(-amp, min(amp, drift + rnd.uniform(-0.7, 0.7)))
        off = abs(drift * 0.7 + rnd.uniform(0, amp * 0.6))
        if rnd.random() < notch:
            off += amp * rnd.uniform(*deep)
        f = t / length
        bx = (1 - f) ** 2 * x0 + 2 * (1 - f) * f * cx + f * f * x1
        by = (1 - f) ** 2 * y0 + 2 * (1 - f) * f * cy + f * f * y1
        out.append((round(bx + nx * off, 1), round(by + ny * off, 1)))
        t += rnd.uniform(1.4, 3.6)
    out.append((round(x1, 1), round(y1, 1)))
    return out


W, H = 400, 300
CUT_X, CORNER_Y = 50.0, 264.0            # where the paper rip meets each edge
PAPER_BOW = -16.0                        # the corner rip bows out, convex
BOTTOM_INSET = 7.5                       # baseline depth of the bottom rip


def _svg(d):
    return ("<svg xmlns='http://www.w3.org/2000/svg' width='%d' height='%d' "
            "viewBox='0 0 %d %d' preserveAspectRatio='none'>"
            "<path fill='#000' d='%s Z'/></svg>" % (W, H, W, H, " ".join(d)))


EDGES = ["top", "right", "bottom", "left"]
CORNER_BETWEEN = {"tr": ("top", "right"), "br": ("right", "bottom"),
                  "bl": ("bottom", "left"), "tl": ("left", "top")}


def _at(name, t, o=0.0):
    """A point on one edge: t along it clockwise, o pushed inward."""
    if name == "top":
        return (t, o)
    if name == "right":
        return (W - o, t)
    if name == "bottom":
        return (W - t, H - o)
    return (o, H - t)


def _span(name):
    return W if name in ("top", "bottom") else H


def _edge(rnd, name, torn, amp, notch, deep, base=0.0):
    """Points along one edge, walked clockwise, offsets pushed inward.

    Clockwise throughout: top left-to-right, right top-to-bottom, bottom
    right-to-left, left bottom-to-top. Walking one backwards makes the polygon
    cross itself, which shows as a slash across the image, not an edge.
    """
    span = _span(name)
    at = lambda t, o: _at(name, t, o)
    if not torn:
        return [(0.0, at(0.0, 0.0)), (span, at(span, 0.0))]
    return [(t, at(t, o)) for t, o in _wander(rnd, span, amp, notch, deep, base=base)]


def torn_edge_svg(seed=20260906, torn=("right", "bottom"), corner="bl",
                  cut=(50.0, 36.0), bow=-16.0):
    """Outline for a torn print.

    `torn` picks which edges are ragged; the rest are clean cuts. `corner` rips
    that corner away along a bowed diagonal, or None leaves every corner square.
    `cut` is how far back along each adjoining edge the rip starts.
    """
    import random
    rnd = random.Random(seed)

    pts = {}
    for name in EDGES:
        base = BOTTOM_INSET if name == "bottom" else 0.0
        # 9.0 on the bottom: the wander has to span the print margin, or the
        # rip sits wholly inside or wholly outside the photo's edge.
        amp = 9.0 if name == "bottom" else 2.4
        pts[name] = _edge(rnd, name, name in torn, amp,
                          0.018 if name == "bottom" else 0.05,
                          (0.3, 0.55) if name == "bottom" else (1.0, 1.8), base)

    rip = []
    if corner:
        before, after = CORNER_BETWEEN[corner]
        span_b = W if before in ("top", "bottom") else H
        keep_b = [p for p in pts[before] if p[0] <= span_b - cut[0]]
        keep_a = [p for p in pts[after] if p[0] >= cut[1]]
        assert keep_b and keep_a, "corner cut longer than the edges it joins"
        pts[before], pts[after] = keep_b, keep_a

        # A clean edge carries only its two endpoints, so truncation leaves the
        # far corner rather than a point at `cut`. Taking that as the rip's end
        # runs it right across the print. Compute both ends from the edge
        # parametrisation, and only prefer an actual point on a torn edge, so
        # the rip meets the tear it continues from.
        start = keep_b[-1][1] if len(keep_b) > 2 else _at(before, span_b - cut[0])
        end = keep_a[0][1] if len(keep_a) > 2 else _at(after, cut[1])
        assert min(end) >= -1 and end[0] <= W + 1 and end[1] <= H + 1, "rip end off-canvas"
        rip = _rip(rnd, start, end, 3.6, bow=bow, notch=0.05, deep=(0.4, 0.9))

    d, seen_rip = [], False
    for name in EDGES:
        for _, xy in pts[name]:
            d.append("L%s %s" % (round(xy[0], 1), round(xy[1], 1)))
        if corner and name == CORNER_BETWEEN[corner][0]:
            d += ["L%s %s" % (x, y) for x, y in rip]
            seen_rip = True
    assert not corner or seen_rip, "corner rip was never emitted"
    d[0] = "M" + d[0][1:]
    return _svg(d)




def repaint(css, table):
    for token, value in table.items():
        css = re.sub(r"(" + re.escape(token) + r"\s*)#[0-9A-Fa-f]{6}",
                     lambda m: m.group(1) + value, css)
    return css


def main():
    s = open(SRC, encoding="utf-8").read()

    s = re.sub(r'<link rel="stylesheet" href="https://fonts\.googleapis\.com/css2[^"]*">',
               FONT_LINK.replace("\\", "\\\\"), s)

    blocks = list(re.finditer(
        r'(:root \{|:root\[data-theme="dark"\] \{)(.*?)\n  \}',
        s, re.S))
    if len(blocks) != 2:
        sys.exit("FAIL: expected 2 token blocks, found %d" % len(blocks))

    out, last = [], 0
    for i, m in enumerate(blocks):
        out.append(s[last:m.start()])
        out.append(m.group(1) + repaint(m.group(2), LIGHT if i == 0 else DARK) + "\n  }")
        last = m.end()
    out.append(s[last:])
    s = "".join(out)

    copy = list(COPY)
    if SHOW_ONE_SHEET:
        copy.append(ONE_SHEET_ENTRY)

    missing = [a for a, _ in copy if a not in s]
    if missing:
        sys.exit("FAIL: these no longer match index.html:\n  " + "\n  ".join(missing))
    for a, b in copy:
        s = s.replace(a, b)

    grain = "data:image/svg+xml," + urllib.parse.quote(GRAIN_SVG, safe="")
    wire = "data:image/svg+xml," + urllib.parse.quote(WIRE_SVG, safe="")
    def _tearing(**kw):
        return "data:image/svg+xml," + urllib.parse.quote(torn_edge_svg(**kw), safe="")

    # Different edges, different corners, different counts: three sheets torn
    # by three different people, not one tear reused.
    torn = _tearing()
    torn_p = _tearing(seed=8812, torn=("top", "right"), corner="tr",
                      cut=(64.0, 44.0), bow=-13.0)
    torn_j = _tearing(seed=3390, torn=("right", "bottom", "left"), corner="br",
                      cut=(38.0, 58.0), bow=-21.0)
    torn_s = _tearing(seed=5521, torn=("bottom", "left"), corner="tl",
                      cut=(54.0, 62.0), bow=-14.0)
    anchor = "  @media (prefers-reduced-motion: reduce) {"
    if anchor not in s:
        sys.exit("FAIL: could not find the reduced-motion block to insert before")
    halftone = {"css": HALFTONE_CSS, "canvas": HALFTONE_CANVAS,
                "none": HALFTONE_NONE}[HERO_HALFTONE]
    css = (OVERRIDES.replace("__GRAIN__", grain).replace("__WIRE__", wire)
                    .replace("__TORN__", torn).replace("__TORN_P__", torn_p)
                    .replace("__TORN_J__", torn_j).replace("__TORN_S__", torn_s).replace("__STAINS__", _stain_rules())
                    .replace("__HALFTONE__", halftone))
    s = s.replace(anchor, css + "\n" + anchor, 1)

    if HERO_HALFTONE == "canvas":
        assert "\n</body>" in s, "no closing body tag for the canvas script"
        s = s.replace("\n</body>", "\n" + HALFTONE_JS + "\n</body>", 1)

    # the type picker belongs to the other design
    s = re.sub(r'\n  <span class="draft-fonts">.*?</span>\n', "\n", s, flags=re.S)

    open(DST, "w", encoding="utf-8").write(s)
    print("wrote %s from %s" % (DST, SRC))


if __name__ == "__main__":
    main()
