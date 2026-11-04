# PCLA Together We Glow takeover

The full-screen year-end fundraiser takeover for [pcla.org](https://www.pcla.org): floating orbs, ribbons of light, a film strip of PCLA photos circling the "Together We Glow" lockup, and the Donate Today button that leads to the Givebutter page. It runs from Sunday, November 1, 2026 to Thursday, December 31, 2026 and does nothing outside that window.

Built by Shai Creates for Parkinson's Community Los Angeles. One classic script, one stylesheet and the 23 photos, all served from this repository through jsDelivr, with one block pasted into the pcla.org site footer. three.js loads from cdnjs after the page is idle.

## Files

| File | What it is |
|---|---|
| `twg-takeover.js` | The source. The config object is at the top, with a comment per key |
| `twg-takeover.css` | The source stylesheet. Every color, radius and type family is an existing pcla.org Webflow Variable |
| `twg-takeover.min.js`, `twg-takeover.min.css` | The builds the site loads, made with esbuild 0.27.0 (`--minify`). Rebuild both after any source change |
| `embed/webflow-footer.html` | The complete footer paste for Webflow |
| `photos/twg-NN.jpg`, `photos/photos.json` | The 23 pool photos at 800px longest edge, served through jsDelivr like the script, and their tags. The embed carries the same file names and tags |
| `CHANGELOG.md`, `LICENSE-NOTE.md` | Version history and ownership |

## How to release

1. Make the change in `twg-takeover.js` or `twg-takeover.css`, rebuild the two `.min` files, and add a line to `CHANGELOG.md`
2. Commit, then tag the commit. Tags are `vMAJOR.MINOR.PATCH`, for example `v1.0.0`, `v1.0.1`
3. Push the commit and the tag: `git push && git push --tags`
4. jsDelivr serves the tag at once, no account and no setup:
   - `https://cdn.jsdelivr.net/gh/shaimoom/pcla-together-we-glow@v1.0.0/twg-takeover.min.js`
   - `https://cdn.jsdelivr.net/gh/shaimoom/pcla-together-we-glow@v1.0.0/twg-takeover.min.css`
5. Open both URLs in a browser and confirm the first line carries the new version banner
6. Change the tag in the footer embed, publish to webflow.io, check, then Shai publishes pcla.org. The tag appears three times in the embed: the stylesheet link, the `base` constant for the photos, and the script tag. Change all three together

Photos are part of the release: a new tag serves `photos/` at that tag too, so adding or swapping a photo is a commit, a tag, and a file name change in the embed's list.

This first release is pinned by commit SHA (`@2ab04ae92490e23bc81d1d6efa48d506fa31cca5` in the three embed URLs) because the `v1.0.0` tag was not cut through the release UI; jsDelivr treats a commit SHA as immutable, exactly like a tag. A `v1.0.0` tag may be added to that commit at any time and the three URLs switched to `@v1.0.0` when convenient; both forms stay valid forever on jsDelivr.

Purge note: a tagged jsDelivr URL is cached for a year and treated as permanent. Never move a tag to a new commit; cut a new tag instead. If a file must be refreshed under the same tag anyway, purge it at `https://purge.jsdelivr.net/gh/shaimoom/pcla-together-we-glow@v1.0.0/twg-takeover.min.js` (and the `.css`), then wait a few minutes. Browsers may hold their own copy until it expires.

## How to roll back

Change the tag in all three places in the footer embed back to the last good one (for example `@v1.0.1` to `@v1.0.0`), publish to webflow.io, check, then Shai publishes pcla.org. Nothing in the repository needs to change.

## How to turn it off early

Two ways, both in the footer embed, no repository change:

- **Off switch.** Set `disabled: true` in `window.TWG_TAKEOVER_CONFIG` and publish. The embed turns that into an empty date window, so the script stops before it loads three.js or any photo
- **Date window.** Set `endUtc` to an earlier instant, for example `Date.UTC(2026, 11, 16, 8, 0, 0)` for Wednesday, December 16, 2026, 12:00 AM Pacific, and publish. The window is checked when the page loads

Deleting the whole footer block also works. After Thursday, December 31, 2026 the script does nothing on its own, so leftover code in January is harmless.

## Webflow steps

1. **Footer code.** Open Site settings, Custom code, Footer code. Paste the whole content of `embed/webflow-footer.html`. It is one stylesheet link, one config script and one script tag; the photos are listed by file name and load from this repository through jsDelivr, so there is nothing to upload and nothing to fill in. It goes in the footer box because the registered-script path has a 2,000-character limit and this block is about 3,150 characters, inside the box's 10,000 limit. Do not use an app-owned or registered script
2. **Publish to webflow.io first.** Open the staging site, wait 3 seconds, and check: the takeover opens, the photos show, Donate Today opens the Givebutter page in a new tab, Not Right Now closes it and it stays closed on reload for 24 hours (clear site data to see it again), Escape closes it, Pause motion holds the scene, and nothing shows on `/give`
3. **Shai publishes pcla.org.** The team publishes webflow.io only
4. **GA4.** No setup. The script uses the site's existing `gtag` when present and sends `twg_takeover_open` (with `trigger`), `twg_takeover_dismiss` (with `method`) and `twg_takeover_give`, each with `campaign: twg-2026`. Look for them in GA4 Realtime after the staging check

Photo cross-origin note: WebGL needs the photo host to answer with `Access-Control-Allow-Origin`. jsDelivr sends `Access-Control-Allow-Origin: *` on every file, which is why the photos ship from here. Alternative, if the photos ever need to move: upload the 23 files to the pcla.org Webflow Assets panel, keep the file names, and replace `base + p[0]` in the embed with each Asset URL. The Webflow Assets CDN also answers with the header; confirm on staging, since numbered placeholder tiles in place of photos mean the images were refused.

## Mailchimp pop-up

The site's Mailchimp pop-up must be turned off before go-live so the two never stack. Shai turns it off in Mailchimp, then it is back on after Thursday, December 31, 2026.

## Config

Every key in `window.TWG_TAKEOVER_CONFIG` overrides the default of the same name at the top of `twg-takeover.js`; the embed sets only what production needs. The keys most likely to change: `giveUrl`, `startUtc` and `endUtc`, `photos`, `delayMs` (3000), `dismissHours` (24). Photo tags: `event` caps how many photos from one event sit in the ring (`maxPerEvent`, 2), `series` and `people` keep the same event series and the same person off two consecutive planes.

## Testing a change locally

The review mockup and the headless Chrome checks live in the Shai Creates deliverable folder, not in this repository. Set `mockup: true` in the config on a local page to replay the takeover on every load without storage or the date window.
