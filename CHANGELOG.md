# Changelog

## v1.0.0, Tuesday, November 3, 2026

First production package of the PCLA Together We Glow full-screen takeover, built and reviewed in seven design rounds on one day:

- Round 1: the piece. A full-viewport takeover over pcla.org with floating orbs, four ribbons of light, a film strip of PCLA photos on a ring around the "Together We Glow" lockup, Donate Today and Not Right Now. Four triggers (3-second delay, half-page scroll, exit intent, 45-second idle), a 24-hour storage record with a cookie fallback, a date window from Sunday, November 1 to Thursday, December 31, 2026, GA4 events, a focus-trapped dialog with inert and scroll lock, a CSS fallback when three.js or WebGL is missing, and full reduced-motion support with a Pause motion control. Every color, radius and type family is an existing pcla.org Webflow Variable
- Round 2: seen on open, ribbons at full strength with electric-blue threads, a 15-photo ring with a per-event cap and a seeded shuffle that keeps the same event series and the same person off consecutive planes, Pause motion beside Close
- Round 3: one shared living light for WE GLOW and the button, the pointer model (trail, pull, stack), name-tag and duplicate-person photos out of the pool, the two-sentence belief line
- Round 4: the ring holds its place until the pointer nears the button, WE GLOW in the brand's electric blue, a keep-out so drifting photos never cross the lockup, four more photos
- Round 5: restraint. A 32-second lava-lamp light, one soft radial glow instead of rays, convergence keyed to the ring's inner edge on an exponential curve, every glow and halo turned down
- Round 6: a held hover swells a pink bloom to the whole viewport with the text crossing to navy-dark once the pink reaches it; the convergence snap found with a scripted-pointer probe and fixed at the cause
- Round 7: Donate Today, Close and Pause motion cross to blue-light with navy-dark labels at full pink; the drinks photo out, the comedian photo in; pool of 23 for 15 planes. Design locked by Shai
- Fix round, after Vera's gate (same version, nothing had shipped):
  - Short viewports: the root is the dialog, the content scrolls from its top in an inner block with margin auto, Close and Pause motion sit on their own layer and never scroll away, the compact rule applies at every width under 720px tall
  - The swell's text crossing: the pink holds at 0.38 opacity until it has covered the lockup, then the ink and the opacity flip in the same frame; every text element measured at or above its contrast floor through the whole swell
  - Weglot: the WE GLOW light is a real aria-hidden inner span, translated with the word; the dialog's accessible name no longer repeats WE GLOW
  - Donate Today keeps its navy-dark keyline on hover at full pink; the focus ring crosses to navy-dark with the text
  - Pause motion uses its label for state, no aria-pressed; the status line announces only on a click
  - iOS scroll lock: the body is fixed at its scroll offset while open and restored on close
  - color-mix() fallback: the stylesheet keeps every surface and label with the Variables alone, and everything needing color-mix() sits in one @supports block
  - Convergence: a stacking plane is freed from the text keep-out early, the keep-out limit moves at most 2% of the path per frame, and the stack amount is eased both ways; the scripted-pointer probe shows no flagged frames at the pill margin
  - A visually hidden "opens in a new tab" on Donate Today; keyboard focus starts the swell only after resting 2 seconds; `disabled` is a config key in the source
  - After re-inspection (PASS WITH NOTES): a keyboard hold swells only on its own 2-second rest, an earlier pointer move no longer counts; without color-mix() the swell is capped at 0.38 so the resting inks keep their contrast; the swell contrast timeline is on disk under tools
