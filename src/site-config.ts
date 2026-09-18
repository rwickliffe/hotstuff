// What a template consumer replaces, in one list:
//   src/site-config.ts
//   src/domain/
//   src/pages/*.astro
//   src/layouts/Base.astro
//   public/site.js        (ask / filter / theme)
//   public/styles.css
//   wrangler.jsonc        (bindings and IDs)
//
// Strings, timezone, and caps — no Worker bindings. Pages and the Worker
// import from here; do not nest this under worker/.
//
// Everything that identifies this client: their names, the copy that mentions
// them, the palette. The generic-looking strings — error titles, button
// labels — would serve another business, but read them before reusing this:
// they carry a voice.

export const SITE = {
  name: "Hot Stuff",                            // page titles
  masthead: "Paula and Crazy John's Hot Stuff", // top of the newsletter
  list: "The list",                             // what a subscriber joined

  copy: {
    contactSubject: "Hot Stuff note from {name}",
    confirmSubject: "Confirm you're on The list",
    confirmLead: "Click to join Paula and Crazy John's list:",
    confirmWait:
      "It may be a while before you hear from us. We write when there is " +
      "something to say, and the first letter waits until we have a PO box " +
      "we can print.",
    confirmIgnore: "If you did not ask for this, ignore it.",
    joinedTitle: "You're on the list",
    joinedBody:
      "We'll write when there is something to say. It may be a while — " +
      "the first letter waits on a PO box we can print.",
  },

  // The Worker serves two thin pages of its own (confirm, compose) plus the
  // newsletter wrapper. They cannot share the site's stylesheet, so the few
  // values that keep them recognisable are repeated here.
  theme: {
    paper: "#E5DCC9", ink: "#14100C", inkFaint: "#8A7C68",
    chile: "#8E1409", flame: "#B4551D", card: "#F1EADB", quiet: "#574C3E",
    display: "'Special Elite',Courier New,monospace",
    body: "Barlow,system-ui,sans-serif",
    fonts: "https://fonts.googleapis.com/css2?family=Special+Elite" +
           "&family=Barlow:wght@400;600&display=swap",
  },
};

export const MARKET_TZ = "America/Chicago";
export const FEATURED_MAX = 6;
export const CACHEABLE_PATHS = ["/", "/products"];
export const DEBUG_PARAM = "debug";
