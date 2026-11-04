// @ts-check
/* ==========================================================================
   PCLA "Together We Glow" full-screen takeover.
   --------------------------------------------------------------------------
   One classic script, drop-in for pcla.org footer code (or jsDelivr, pinned).
   Builds its own DOM, loads three.js lazily on idle, draws floating orbs,
   light ribbons and a film strip of PCLA photos, and shows the lockup with
   "Donate Today" and "Not Right Now".

   Config: edit CONFIG below, or set window.TWG_TAKEOVER_CONFIG before this
   script loads to override any key (the review mockup does this to switch
   mockup mode on and to hand in photo data URIs).

   Mockup mode: shows 800ms after load, ignores storage and the date window,
   and honors these query keys for testing:
     ?trigger=delay|scroll|exit|idle|none   arm one trigger only (none: no auto-open)
     ?delayMs=3000  ?idleMs=5000            override those two numbers
     ?motion=reduce                          behave as if prefers-reduced-motion is set
     ?photos=placeholder                     ignore the photo list, draw placeholders
     ?webgl=off                              force the CSS fallback
   ========================================================================== */
(function () {
  'use strict';

  /** @typedef {{ src: string, alt?: string, event?: string, series?: string, people?: string[] }} TwgPhoto  event: cap key; series and people: never back to back */
  /** @typedef {{ photos: number, orbs: number, bokeh: number, ribbons: number }} TwgCounts */
  /**
   * @typedef {Object} TwgConfig
   * @property {boolean} disabled         Off switch: true stops the script before it builds or loads anything
   * @property {string} campaign          Campaign id, used in class hooks and analytics
   * @property {string} storageKey        localStorage key, also the cookie name
   * @property {number} startUtc          First instant the takeover may show (ms since epoch)
   * @property {number} endUtc            First instant after the campaign (ms since epoch)
   * @property {RegExp[]} skipPaths       Paths that never show it
   * @property {string} giveUrl           Donate link, opens in a new tab
   * @property {string} threeUrl          Pinned three.js module build
   * @property {TwgPhoto[]} photos        Film strip photos. Empty list: placeholders
   * @property {number} maxPerEvent       Most photos from one event in the ring
   * @property {number} convergeStartRadius  The ring's inner edge as a fraction of the ring itself. Inside it the photos begin to drift in and the glow begins to grow
   * @property {number} convergeCurve     Strength of the exponential easing from the ring edge (0) to the button (1); higher is slower near the edge, faster near the button
   * @property {number} stackMarginPx     The button's path: the pill plus this margin. Inside it the photos stack
   * @property {number} swellSeconds      A held hover on the button: seconds for the pink bloom to take over the viewport
   * @property {number} swellReleaseSeconds  Seconds for it to recede after the pointer leaves
   * @property {number} ambientCycleMs    Touch devices: the photos gather behind the button once per cycle
   * @property {number} delayMs           Trigger: time after the script starts
   * @property {number} scrollFraction    Trigger: fraction of the page scrolled
   * @property {number} idleMs            Trigger: time with no scroll, touch, key or pointer move
   * @property {number} exitScrollPxPerMs Trigger (phone): upward scroll speed that counts as leaving
   * @property {number} dismissHours      "Not Right Now", "Close", Escape: hide for this long
   * @property {boolean} mockup           Review mode: storage and date window ignored
   * @property {number} mockupDelayMs     Review mode delay
   * @property {number} maxPixelRatio     Renderer devicePixelRatio cap
   * @property {{ desktop: TwgCounts, phone: TwgCounts }} counts
   */

  /** @type {TwgConfig} */
  var CONFIG = {
    disabled: false,
    campaign: 'twg-2026',
    storageKey: 'pcla_twg26_takeover',
    startUtc: Date.UTC(2026, 10, 1, 7, 0, 0),   // Sunday, November 1, 2026, 12:00 AM Pacific (PDT)
    endUtc: Date.UTC(2027, 0, 1, 8, 0, 0),      // Friday, January 1, 2027, 12:00 AM Pacific (PST); the window closes Thursday, December 31, 11:59 PM
    skipPaths: [/^\/(?:es\/|ko\/)?give\/?$/],   // /give and its Weglot translations
    giveUrl: 'https://givebutter.com/pcla-together-we-glow-2026',
    threeUrl: 'https://cdnjs.cloudflare.com/ajax/libs/three.js/0.160.0/three.module.min.js',
    photos: [],
    maxPerEvent: 2,
    convergeStartRadius: 0.85,
    convergeCurve: 4,
    stackMarginPx: 40,
    swellSeconds: 10,
    swellReleaseSeconds: 6,
    ambientCycleMs: 20000,
    delayMs: 3000,
    scrollFraction: 0.5,
    idleMs: 45000,
    exitScrollPxPerMs: 1.4,
    dismissHours: 24,
    mockup: false,
    mockupDelayMs: 800,
    maxPixelRatio: 1.5,
    counts: {
      desktop: { photos: 15, orbs: 170, bokeh: 9, ribbons: 4 },
      phone: { photos: 10, orbs: 70, bokeh: 4, ribbons: 2 }
    }
  };

  // ---------- Config overrides and query flags ----------
  var override = /** @type {Partial<TwgConfig> | undefined} */ (/** @type {any} */ (window).TWG_TAKEOVER_CONFIG);
  if (override) { Object.keys(override).forEach(function (k) { /** @type {any} */ (CONFIG)[k] = /** @type {any} */ (override)[k]; }); }

  /** @type {Record<string, string>} */
  var query = {};
  if (CONFIG.mockup && window.location.search) {
    window.location.search.slice(1).split('&').forEach(function (pair) {
      var i = pair.indexOf('=');
      var k = decodeURIComponent(i < 0 ? pair : pair.slice(0, i));
      query[k] = decodeURIComponent(i < 0 ? '' : pair.slice(i + 1));
    });
    if (query.delayMs) { CONFIG.delayMs = Number(query.delayMs); }
    if (query.idleMs) { CONFIG.idleMs = Number(query.idleMs); }
    if (query.photos === 'placeholder') { CONFIG.photos = []; }
  }

  var reduceMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  /** @returns {boolean} */
  function reducedMotion() { return reduceMotionQuery.matches || query.motion === 'reduce'; }
  /** @returns {boolean} */
  function isPhone() { return window.matchMedia('(max-width: 767px)').matches || (window.matchMedia('(pointer: coarse)').matches && window.innerWidth < 1024); }

  // ---------- Guards: off switch, path, date window, storage ----------
  if (CONFIG.disabled) { return; }
  if (CONFIG.skipPaths.some(function (re) { return re.test(window.location.pathname); })) { return; }
  var now = Date.now();
  if (!CONFIG.mockup && (now < CONFIG.startUtc || now >= CONFIG.endUtc)) { return; }
  if (!CONFIG.mockup && hiddenUntil() > now) { return; }
  if (document.querySelector('.twg-takeover')) { return; }

  /** @returns {number} ms timestamp until which the takeover stays hidden, 0 if not set */
  function hiddenUntil() {
    var until = 0;
    try {
      var raw = window.localStorage.getItem(CONFIG.storageKey);
      if (raw) { var o = JSON.parse(raw); if (o && typeof o.until === 'number') { until = o.until; } }
    } catch (e) { /* storage blocked: fall through to the cookie */ }
    if (!until) {
      var m = document.cookie.match(new RegExp('(?:^|; )' + CONFIG.storageKey + '=([^;]*)'));
      if (m) { until = Number(decodeURIComponent(m[1])) || 0; }
    }
    return until;
  }
  /** @param {number} until @param {'dismiss' | 'give'} reason */
  function hide(until, reason) {
    if (CONFIG.mockup) { return; }
    try { window.localStorage.setItem(CONFIG.storageKey, JSON.stringify({ until: until, reason: reason })); } catch (e) { /* cookie below */ }
    document.cookie = CONFIG.storageKey + '=' + until + '; expires=' + new Date(until).toUTCString() + '; path=/; SameSite=Lax' + (window.location.protocol === 'https:' ? '; Secure' : '');
  }
  /** @param {string} name @param {Record<string, string>} params */
  function track(name, params) {
    var g = /** @type {any} */ (window).gtag;
    if (typeof g === 'function') { g('event', name, params); }
  }

  // ---------- three.js: prefetch on idle after load, so first paint is untouched ----------
  /** @type {Promise<any> | null} */
  var threePromise = null;
  function loadThree() {
    if (!threePromise) {
      threePromise = (query.webgl === 'off')
        ? Promise.reject(new Error('webgl off by query'))
        : new Function('u', 'return import(u)')(CONFIG.threeUrl);  // dynamic import from a classic script
    }
    return threePromise;
  }
  function prefetchOnIdle() {
    var idle = /** @type {any} */ (window).requestIdleCallback;
    var start = function () { loadThree().catch(function () { /* fallback handles it */ }); };
    if (typeof idle === 'function') { idle(start, { timeout: 2500 }); } else { window.setTimeout(start, 1200); }
  }
  if (query.trigger !== 'none') {
    if (document.readyState === 'complete') { prefetchOnIdle(); } else { window.addEventListener('load', prefetchOnIdle, { once: true }); }
  }

  // ---------- Triggers: whichever comes first ----------
  /** @param {(trigger: string) => void} fire */
  function armTriggers(fire) {
    var forced = CONFIG.mockup ? (query.trigger || '') : '';
    if (forced === 'none') { return; }
    /** @param {string} name */
    function want(name) { return forced ? forced === name : true; }
    var done = false;
    /** @type {(() => void)[]} */
    var cleanups = [];
    /** @param {string} name */
    function go(name) { if (done) { return; } done = true; cleanups.forEach(function (f) { f(); }); fire(name); }
    /** @param {EventTarget} t @param {string} type @param {(e: any) => void} fn @param {any} [opts] */
    function on(t, type, fn, opts) { t.addEventListener(type, fn, opts); cleanups.push(function () { t.removeEventListener(type, fn, opts); }); }

    // 1. Time after load
    if (want('delay')) {
      var ms = (CONFIG.mockup && !forced) ? CONFIG.mockupDelayMs : CONFIG.delayMs;
      var timer = window.setTimeout(function () { go('delay'); }, ms);
      cleanups.push(function () { window.clearTimeout(timer); });
    }
    // 2. Half the page scrolled
    if (want('scroll')) {
      on(window, 'scroll', function () {
        var max = document.documentElement.scrollHeight - window.innerHeight;
        if (max > 0 && window.scrollY / max >= CONFIG.scrollFraction) { go('scroll'); }
      }, { passive: true });
    }
    // 3. Exit intent: desktop pointer leaves through the top; phone, a fast scroll back toward the top
    if (want('exit')) {
      on(document, 'mouseout', function (/** @type {MouseEvent} */ e) {
        if (!e.relatedTarget && e.clientY <= 0 && window.matchMedia('(pointer: fine)').matches) { go('exit'); }
      });
      var lastY = window.scrollY, lastT = performance.now(), deepest = 0;
      on(window, 'scroll', function () {
        var y = window.scrollY, t = performance.now();
        deepest = Math.max(deepest, y);
        var dt = t - lastT;
        if (dt > 0 && dt < 400 && lastY - y > 0 && deepest > window.innerHeight * 0.6) {
          if ((lastY - y) / dt >= CONFIG.exitScrollPxPerMs && window.matchMedia('(pointer: coarse)').matches) { go('exit'); }
        }
        lastY = y; lastT = t;
      }, { passive: true });
    }
    // 4. Dormant: no scroll, touch, key or pointer move
    if (want('idle')) {
      var idleTimer = 0;
      var reset = function () { window.clearTimeout(idleTimer); idleTimer = window.setTimeout(function () { go('idle'); }, CONFIG.idleMs); };
      ['scroll', 'touchstart', 'keydown', 'pointermove', 'mousemove'].forEach(function (type) { on(window, type, reset, { passive: true }); });
      reset();
      cleanups.push(function () { window.clearTimeout(idleTimer); });
    }
  }

  // ---------- Photo order: cap per event, seeded shuffle, no event or person back to back ----------
  /** @param {number} seed @returns {() => number} */
  function seededRandom(seed) {
    var st = (seed >>> 0) || 1;
    return function () { st = (st + 0x6D2B79F5) >>> 0; var t = st; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  /** @template T @param {T[]} a @param {() => number} rnd */
  function shuffle(a, rnd) { for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(rnd() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  /** @param {TwgPhoto} a @param {TwgPhoto} b */
  function adjacent(a, b) {
    var sa = a.series || a.event, sb = b.series || b.event;
    if (sa && sa === sb) { return true; }
    var pa = a.people || [], pb = b.people || [];
    return pa.some(function (p) { return pb.indexOf(p) >= 0; });
  }
  /** @param {TwgPhoto[]} list @param {number} count @param {number} seed @returns {TwgPhoto[]} */
  function pickPhotos(list, count, seed) {
    var rnd = seededRandom(seed);
    /** @type {Record<string, number>} */ var perEvent = {};
    var capped = shuffle(list.slice(), rnd).filter(function (p) { var k = p.event || p.src; perEvent[k] = (perEvent[k] || 0) + 1; return perEvent[k] <= CONFIG.maxPerEvent; });
    /** @type {TwgPhoto[]} */ var best = []; var bestScore = Infinity;
    for (var attempt = 0; attempt < 400 && bestScore > 0; attempt++) {
      var order = shuffle(capped.slice(), rnd).slice(0, count);
      var score = 0;
      for (var i = 0; i < order.length; i++) { if (adjacent(order[i], order[(i + 1) % order.length])) { score++; } }
      if (score < bestScore) { best = order; bestScore = score; }
    }
    return best;
  }

  // ---------- DOM ----------
  var LOGO_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 555.01 162.99" fill="currentColor" focusable="false" aria-hidden="true">'
    + '<path d="M64.69,3.5H0v156.16h43.5v-54.21c8.03,6.02,20.3,9.59,32.35,9.59,35.92,0,53.99-21.64,53.99-55.55S107.08,3.5,64.69,3.5ZM62.91,91.4c-7.36,0-14.05-2.9-19.41-6.02v-48.85h14.5c16.73,0,27.66,9.15,27.66,27.89,0,17.62-10.26,26.99-22.75,26.99Z"/>'
    + '<polygon points="335.51 3.5 292 3.5 292 159.66 390.38 159.66 390.38 120.84 335.51 120.84 335.51 3.5"/>'
    + '<path d="M510.62,3.5h-60.46l-44.62,156.16h42.39l7.58-29h46.4l7.14,29h45.95L510.62,3.5ZM460.2,112.14l18.96-73.39,18.07,73.39h-37.03Z"/>'
    + '<path d="M233.08,68.6l14.28-3.44,28.2-6.12c-.1-6.7-1.27-13.35-3.46-19.64l-41.99,14.86c1.49,4.15,2.39,10.43,2.97,14.34Z"/>'
    + '<path d="M214.33,36.87c2.88.39,5.42,1.75,7.62,3.79l19.48-34.85c-7.5-3.38-16.19-5.46-26.05-5.8l-1.05,36.87Z"/>'
    + '<path d="M202.39,40.21c2.48-1.87,5.27-3,8.28-3.35L205.67.27c-9.41.94-17.99,3.84-25.55,8.42l22.26,31.52Z"/>'
    + '<path d="M228.48,50.26l39.93-19.26c-4.14-7.76-10.05-14.65-17.69-19.95l-26.94,31.55c1.83,2.17,3.39,4.81,4.7,7.66Z"/>'
    + '<path d="M272.37,110.79c-.17.07-.34.15-.52.22-.11.05-.24.1-.36.15-.18.08-.37.15-.57.23-.13.05-.28.11-.42.17-.2.08-.41.16-.62.25-.15.06-.32.12-.48.19-.22.08-.44.17-.67.26-.18.07-.36.14-.55.2-.23.09-.46.17-.71.26-.19.07-.4.15-.6.22-.25.09-.49.18-.75.27-.21.08-.43.15-.65.23-.26.09-.52.18-.79.28-.23.08-.46.16-.69.24-.28.1-.56.19-.84.29-.24.08-.48.16-.72.25-.29.1-.58.19-.87.29-.04.01-.08.02-.11.04l9.27,27.19,2.61-31.66c-.2.09-.43.2-.68.31-.09.04-.19.08-.28.12Z"/>'
    + '<path d="M193.67,52.73c1.58-4.06,3.58-7.41,5.94-9.98l-27.54-28.22c-6.1,5.25-11.3,11.78-15.45,19.39l37.05,18.8Z"/>'
    + '<path d="M189.68,77.79c0-.67.01-1.33.02-1.98l-43.94-3.93c-.32,3.59-.48,7.27-.48,11.04s.18,7.54.52,11.16l44.48-4.73c-.4-3.55-.61-7.4-.61-11.57Z"/>'
    + '<path d="M189.94,70.65c.37-4.92,1.12-9.37,2.21-13.32l-39.31-15.47c-2.75,6.64-4.79,13.93-6.05,21.76l43.15,7.02Z"/>'
    + '<path d="M235.13,121.67c-.17.03-.34.06-.51.09-.39.07-.77.13-1.15.2-.3.05-.6.09-.9.14-.37.06-.75.12-1.12.17-.3.04-.6.08-.9.13-.37.05-.73.1-1.09.14-.3.04-.6.07-.9.11-.36.04-.71.08-1.06.12-.3.03-.6.06-.9.09-.35.03-.69.06-1.04.09-.3.02-.59.04-.88.06-.34.02-.68.04-1.01.06-.29.02-.57.03-.86.04-.33.01-.66.02-.99.03-.28,0-.56.01-.83.01-.06,0-.11,0-.17,0l-1.88,39.73c8.1-.29,15-1.08,21.27-2.28l-5.07-38.93Z"/>'
    + '<path d="M201.5,116.33c-2.06-1.9-3.87-4.22-5.42-6.97l-37.56,24.23c5.09,8.08,11.54,14.76,19.12,19.69l23.86-36.95Z"/>'
    + '<path d="M255.77,116.62c-.09.03-.18.05-.27.08-.33.1-.67.2-1,.3-.29.09-.58.17-.87.26-.34.1-.69.2-1.04.3-.29.08-.58.17-.88.25-.36.1-.73.2-1.09.3-.29.08-.57.16-.86.24-.38.1-.77.21-1.16.31-.28.07-.55.15-.83.22-.42.11-.84.22-1.27.32-.25.06-.5.13-.75.19-.54.13-1.07.26-1.61.39-.14.03-.28.07-.42.1-.68.16-1.36.32-2.04.47-.2.04-.4.09-.59.13-.13.03-.25.05-.38.08l7,38.33c6.52-1.72,12.54-3.92,18.85-6.51l-10.78-35.77Z"/>'
    + '<path d="M210.38,162.99l5.4-40.14c-4.17-.57-7.92-1.91-11.19-4.09l-18.25,39.19c7.26,3.14,15.32,4.89,24.04,5.04Z"/>'
    + '<path d="M194.34,105.82c-1.44-3.34-2.56-7.2-3.35-11.59l-44.05,8.27c1.44,8.21,3.81,15.82,7,22.67l40.4-19.34Z"/>'
    + '<path d="M543.52,3.5c5.43,0,8.71,3.1,8.71,8.27s-3.28,7.94-8.71,7.94-8.63-3.02-8.63-7.94c0-5.17,3.28-8.27,8.63-8.27ZM543.52,17.6c4.59,0,6.56-1.86,6.56-5.83,0-4.26-2-6.16-6.56-6.16s-6.52,1.89-6.52,6.16c0,3.97,1.97,5.83,6.52,5.83ZM540.5,7.18h3.61c2.08,0,3.35,1.09,3.35,2.66,0,1.42-.95,2.44-2.62,2.48.58.87,1.28,1.31,2.4,1.31h.55l-.18,2.11c-.25.07-.66.11-.87.11-1.89,0-3.17-1.68-3.86-3.42v3.24h-2.37V7.18ZM543.92,11.37c.73,0,1.17-.51,1.17-1.2s-.47-1.17-1.42-1.17h-.8v2c.29.18.66.36,1.06.36Z"/>'
    + '</svg>';
  // The site's own close icon, from modal1_close-button
  var CLOSE_SVG = '<svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" focusable="false" aria-hidden="true"><path d="M24.056 23.5004L23.5004 24.056C23.1935 24.3628 22.696 24.3628 22.3892 24.056L16 17.6668L9.61078 24.056C9.30394 24.3628 8.80645 24.3628 8.49961 24.056L7.94403 23.5004C7.63719 23.1936 7.63719 22.6961 7.94403 22.3892L14.3332 16L7.94403 9.61081C7.63719 9.30397 7.63719 8.80648 7.94403 8.49964L8.49961 7.94406C8.80645 7.63721 9.30394 7.63721 9.61078 7.94406L16 14.3333L22.3892 7.94404C22.6961 7.6372 23.1935 7.6372 23.5004 7.94404L24.056 8.49963C24.3628 8.80647 24.3628 9.30395 24.056 9.61079L17.6667 16L24.056 22.3892C24.3628 22.6961 24.3628 23.1936 24.056 23.5004Z" fill="currentColor"/></svg>';
  var PAUSE_SVG = '<svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" focusable="false" aria-hidden="true" class="is-pause"><rect x="3" y="2" width="3.5" height="12" rx="1" fill="currentColor"/><rect x="9.5" y="2" width="3.5" height="12" rx="1" fill="currentColor"/></svg>';
  var PLAY_SVG = '<svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" focusable="false" aria-hidden="true" class="is-play"><path d="M4 2.5v11a1 1 0 0 0 1.5.86l9-5.5a1 1 0 0 0 0-1.72l-9-5.5A1 1 0 0 0 4 2.5Z" fill="currentColor"/></svg>';

  /** @returns {HTMLElement} */
  function buildDom() {
    // The root is the dialog (role, name, focus), so the controls can sit on their own layer outside the scroll container
    // and still be inside the modal for assistive tech. The scroll container holds an inner block with margin auto: centered
    // when there is room, scrollable from the top when there is not (short viewports)
    var root = document.createElement('div');
    root.className = 'twg-takeover';
    root.setAttribute('data-twg-takeover', CONFIG.campaign);
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-labelledby', 'twg-takeover-title');
    root.setAttribute('aria-describedby', 'twg-takeover-belief');
    root.setAttribute('tabindex', '-1');
    root.innerHTML = ''
      + '<div class="twg-takeover_backdrop" aria-hidden="true"></div>'
      + '<div class="twg-takeover_scene" aria-hidden="true"></div>'
      + '<div class="twg-takeover_veil" aria-hidden="true"></div>'
      + '<div class="twg-takeover_glow" aria-hidden="true"></div>'
      + '<div class="twg-takeover_swell" aria-hidden="true"></div>'
      + '<div class="twg-takeover_dialog">'
      +   '<div class="twg-takeover_inner">'
      +     '<div class="twg-takeover_logo twg-takeover_stagger" role="img" aria-label="PCLA" style="--twg-delay:80ms">' + LOGO_SVG + '</div>'
      +     '<h2 id="twg-takeover-title" class="twg-takeover_title twg-takeover_stagger" style="--twg-delay:160ms">'
      +       '<span class="is-line-1">Together</span>'
      +       '<span class="is-line-2">We Glow<span class="twg-takeover_light" aria-hidden="true">We Glow</span></span>'   /* a real copy of the word, so Weglot translates both and assistive tech ignores the second */
      +       '<span class="is-line-3">Fundraiser</span>'
      +     '</h2>'
      +     '<p id="twg-takeover-belief" class="twg-takeover_belief twg-takeover_stagger" style="--twg-delay:240ms">We believe that when we bring our light together, we glow brighter. We\u2019re celebrating 10 years of helping people impacted by Parkinson\u2019s live their absolute best lives.</p>'
      +     '<h3 class="twg-takeover_headline twg-takeover_stagger" style="--twg-delay:320ms">Give Today, Change Lives Forever</h3>'
      +     '<div class="twg-takeover_actions twg-takeover_stagger" style="--twg-delay:400ms">'
      +       '<a class="twg-takeover_button" href="' + CONFIG.giveUrl + '" target="_blank" rel="noopener" data-twg-give>Donate Today<span class="twg-takeover_sr">, opens in a new tab</span></a>'
      +       '<button type="button" class="twg-takeover_secondary" data-twg-dismiss="not-right-now">Not Right Now</button>'
      +     '</div>'
      +   '</div>'
      + '</div>'
      + '<div class="twg-takeover_controls">'
      +   '<button type="button" class="twg-takeover_motion twg-takeover_stagger" data-twg-motion style="--twg-delay:80ms">'
      +     '<span class="twg-takeover_icon">' + PAUSE_SVG + PLAY_SVG + '</span><span class="twg-takeover_motion-label">Pause motion</span>'
      +   '</button>'
      +   '<button type="button" class="twg-takeover_close twg-takeover_stagger" data-twg-dismiss="close" style="--twg-delay:80ms">'
      +     '<span class="twg-takeover_icon">' + CLOSE_SVG + '</span><span>Close</span>'
      +   '</button>'
      + '</div>'
      + '<p class="twg-takeover_sr" role="status" aria-live="polite" data-twg-status></p>';
    return root;
  }

  // ---------- Open, close, focus ----------
  /** @type {HTMLElement | null} */
  var root = null;
  /** @type {HTMLElement | null} */
  var dialog = null;
  /** @type {Element | null} */
  var returnFocus = null;
  /** @type {HTMLElement[]} */
  var inerted = [];
  /** @type {ReturnType<typeof createScene> | null} */
  var scene = null;
  var isOpen = false;

  /** @type {number} */
  var lockedScrollY = 0;
  /** @returns {HTMLElement[]} Donate, Not Right Now, Pause motion, Close, in that order */
  function focusables() {
    if (!root) { return []; }
    return Array.prototype.slice.call(root.querySelectorAll('a[href], button:not([disabled])'));
  }
  /** @param {KeyboardEvent} e */
  function onKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); close('escape'); return; }
    if (e.key !== 'Tab') { return; }
    var list = focusables();
    if (!list.length) { return; }
    var first = list[0], last = list[list.length - 1];
    var active = document.activeElement;
    if (e.shiftKey && (active === first || active === dialog)) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && (active === last || active === dialog)) {
      if (active === last) { e.preventDefault(); first.focus(); }
    }
  }

  /** @param {string} trigger */
  function open(trigger) {
    if (isOpen) { return; }
    isOpen = true;
    returnFocus = document.activeElement;
    root = buildDom();
    dialog = root;   // the root carries the dialog role and takes focus

    // Page behind: inert and scroll-locked
    inerted = Array.prototype.filter.call(document.body.children, function (/** @type {Element} */ el) {
      return el !== root && !/^(script|style|link)$/i.test(el.tagName) && !el.hasAttribute('inert');
    });
    document.body.appendChild(root);
    inerted.forEach(function (el) { el.setAttribute('inert', ''); });
    // Scroll lock that iOS Safari honors: the body is fixed at its current scroll offset and restored on close
    lockedScrollY = window.scrollY || window.pageYOffset || 0;
    document.documentElement.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.top = (-lockedScrollY) + 'px';
    document.body.style.left = '0';
    document.body.style.right = '0';
    document.body.style.width = '100%';

    root.classList.add('is-open');
    root.classList.toggle('is-still', reducedMotion());
    root.style.setProperty('--twg-energy', '0');
    root.style.setProperty('--twg-swell', '0');
    root.style.setProperty('--twg-text-mix', '0');
    root.style.setProperty('--twg-swell-opacity', '0');
    dialog.focus();
    document.addEventListener('keydown', onKey);

    // Controls
    Array.prototype.forEach.call(root.querySelectorAll('[data-twg-dismiss]'), function (/** @type {HTMLElement} */ el) {
      el.addEventListener('click', function () { close(el.getAttribute('data-twg-dismiss') || 'close'); });
    });
    /** @type {HTMLElement} */ (root.querySelector('[data-twg-give]')).addEventListener('click', function () {
      hide(CONFIG.endUtc, 'give');
      track('twg_takeover_give', { campaign: CONFIG.campaign });
      close('give', true);
    });
    var motionButton = /** @type {HTMLButtonElement} */ (root.querySelector('[data-twg-motion]'));
    var motionLabel = /** @type {HTMLElement} */ (motionButton.querySelector('.twg-takeover_motion-label'));
    var status = /** @type {HTMLElement} */ (root.querySelector('[data-twg-status]'));
    // The label carries the state ("Pause motion" / "Play motion"); no aria-pressed, so a screen reader never hears
    // "Play motion, pressed". The status line announces changes made by a click only, not the initial state
    /** @param {boolean} paused @param {boolean} announce */
    function setMotionUi(paused, announce) {
      motionButton.classList.toggle('is-paused', paused);
      motionLabel.textContent = paused ? 'Play motion' : 'Pause motion';
      if (announce) { status.textContent = paused ? 'Motion paused' : 'Motion playing'; }
    }
    var startPaused = reducedMotion();
    setMotionUi(startPaused, false);
    motionButton.addEventListener('click', function () {
      var paused = !motionButton.classList.contains('is-paused');
      setMotionUi(paused, true);
      if (root) { root.classList.toggle('is-still', paused); }
      if (scene) { scene.setPaused(paused); }
    });

    // Seen the moment it opens: hidden for 24 hours. A gift extends that to the campaign end
    hide(Date.now() + CONFIG.dismissHours * 3600000, 'open');
    track('twg_takeover_open', { campaign: CONFIG.campaign, trigger: trigger });

    // Scene: three.js if it loads, the CSS backdrop otherwise
    var mount = /** @type {HTMLElement} */ (root.querySelector('.twg-takeover_scene'));
    loadThree().then(function (THREE) {
      if (!isOpen || !root) { return; }
      try {
        scene = createScene(THREE, mount, {
          root: /** @type {HTMLElement} */ (root),
          button: /** @type {HTMLElement} */ (root.querySelector('[data-twg-give]')),
          counts: isPhone() ? CONFIG.counts.phone : CONFIG.counts.desktop,
          photos: CONFIG.photos,
          maxPixelRatio: CONFIG.maxPixelRatio,
          paused: motionButton.classList.contains('is-paused'),
          staticComposition: reducedMotion()
        });
        if (scene) { mount.classList.add('is-ready'); }
        if (scene && CONFIG.mockup) { /** @type {any} */ (window).__twgScene = scene; }
      } catch (err) {
        /* WebGL missing or blocked: the CSS backdrop stays */
        if (CONFIG.mockup && window.console) { window.console.warn('[twg] scene fallback:', err); }
      }
    }).catch(function (err) {
      if (CONFIG.mockup && window.console) { window.console.warn('[twg] three.js did not load, CSS fallback shown:', err && err.message); }
    });
  }

  /**
   * @param {string} method  not-right-now | close | escape | give
   * @param {boolean} [skipHide]
   */
  function close(method, skipHide) {
    if (!isOpen || !root) { return; }
    isOpen = false;
    if (!skipHide) {
      hide(Date.now() + CONFIG.dismissHours * 3600000, 'dismiss');
      track('twg_takeover_dismiss', { campaign: CONFIG.campaign, method: method });
    }
    document.removeEventListener('keydown', onKey);
    var el = root;
    var animated = !reducedMotion();
    el.classList.add('is-closing');
    window.setTimeout(function () {
      if (scene) { scene.dispose(); scene = null; }
      if (el.parentNode) { el.parentNode.removeChild(el); }
      inerted.forEach(function (n) { n.removeAttribute('inert'); });
      inerted = [];
      document.documentElement.style.overflow = '';
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.left = '';
      document.body.style.right = '';
      document.body.style.width = '';
      window.scrollTo(0, lockedScrollY);
      if (returnFocus instanceof HTMLElement) { returnFocus.focus(); }
      root = null; dialog = null;
    }, animated ? 200 : 0);
  }

  armTriggers(open);

  // ======================================================================
  // Scene: orbs, light ribbons, film strip
  // Every element is placed in screen space (x and y in -1..1, plus a depth)
  // and unprojected through the camera, so the composition holds at every
  // aspect ratio: ribbons hug the edges, the strip circles the lockup, and
  // the orb field fills the view on a phone as well as a wide screen.
  // ======================================================================
  /**
   * @param {any} THREE
   * @param {HTMLElement} mount
   * @param {{ root: HTMLElement, button: HTMLElement, counts: TwgCounts, photos: TwgPhoto[], maxPixelRatio: number, paused: boolean, staticComposition: boolean }} opts
   */
  function createScene(THREE, mount, opts) {
    var canvas = document.createElement('canvas');
    var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: false, alpha: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, opts.maxPixelRatio));
    renderer.setClearColor(0x000000, 0);
    mount.appendChild(canvas);

    var sceneObj = new THREE.Scene();
    var camera = new THREE.PerspectiveCamera(55, 1, 0.1, 80);
    var world = new THREE.Group();   // everything, so parallax is one rotation
    sceneObj.add(world);
    var needsRender = true;
    var raf = 0;

    // Brand colors as scene uniforms (the same Variables the CSS uses; the literals are a last resort if the Variables are missing)
    var css = getComputedStyle(mount.parentElement || document.documentElement);
    /** @param {string} name @param {string} fallback */
    function brand(name, fallback) { var v = css.getPropertyValue(name).trim(); return new THREE.Color(v || fallback); }
    var C = {
      navy: brand('--_primitives---brand--navy', '#022342'),
      blue: brand('--_primitives---brand--blue', '#2186ff'),
      blueLight: brand('--_primitives---brand--blue-light', '#8cbbf7'),
      blueDark: brand('--_primitives---brand--blue-dark', '#114380'),
      white: brand('--_primitives---colors--white', '#ffffff')
    };
    var phone = isPhone();
    var time = 0, last = performance.now();
    var paused = opts.paused;
    var staticComposition = opts.staticComposition;
    var shared = { uTime: { value: 0 }, uAspect: { value: 1 }, uScale: { value: 1 }, uOpacity: { value: 0 }, uEnergy: { value: 0 } };

    // ---- Camera and the screen-space helper ----
    var ray = new THREE.Vector3();
    /** @param {number} sx @param {number} sy @param {number} z @param {any} out */
    function place(sx, sy, z, out) {
      ray.set(sx, sy, 0.5).unproject(camera);          // a point on the ray through that screen position
      return out.copy(ray).multiplyScalar(z / ray.z);   // slid to the wanted depth (the camera sits at the origin)
    }
    var builtAspect = 0;
    function sizeCamera() {
      var w = mount.clientWidth || window.innerWidth, h = mount.clientHeight || window.innerHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.fov = camera.aspect < 0.8 ? 70 : (camera.aspect < 1.2 ? 62 : 55);
      camera.updateProjectionMatrix();
      camera.updateMatrixWorld();
      shared.uAspect.value = camera.aspect;
      shared.uScale.value = (h * renderer.getPixelRatio()) / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
    }
    sizeCamera();
    /** @param {number} a @param {number} b */
    function rand(a, b) { return a + Math.random() * (b - a); }

    // ---- Orbs: a point cloud with a soft additive glow ----
    var orbCount = opts.counts.orbs;
    var orbPos = new Float32Array(orbCount * 3), orbSize = new Float32Array(orbCount), orbPhase = new Float32Array(orbCount), orbSpeed = new Float32Array(orbCount), orbMix = new Float32Array(orbCount);
    var orbGeo = new THREE.BufferGeometry();
    var tmpV = new THREE.Vector3();
    function placeOrbs() {
      for (var i = 0; i < orbCount; i++) {
        place(rand(-1.3, 1.3), rand(-1.25, 1.25), -2.5 - Math.random() * 24, tmpV);
        orbPos[i * 3] = tmpV.x; orbPos[i * 3 + 1] = tmpV.y; orbPos[i * 3 + 2] = tmpV.z;
        orbSize[i] = 0.08 + Math.pow(Math.random(), 2.2) * 0.9;
        orbPhase[i] = Math.random() * Math.PI * 2;
        orbSpeed[i] = 0.15 + Math.random() * 0.35;
        orbMix[i] = Math.random() < 0.3 ? 1 : Math.random() * 0.6;
      }
      orbGeo.setAttribute('position', new THREE.BufferAttribute(orbPos, 3));
      orbGeo.setAttribute('aSize', new THREE.BufferAttribute(orbSize, 1));
      orbGeo.setAttribute('aPhase', new THREE.BufferAttribute(orbPhase, 1));
      orbGeo.setAttribute('aSpeed', new THREE.BufferAttribute(orbSpeed, 1));
      orbGeo.setAttribute('aMix', new THREE.BufferAttribute(orbMix, 1));
    }
    placeOrbs();
    var orbMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
      uniforms: { uTime: shared.uTime, uScale: shared.uScale, uOpacity: shared.uOpacity, uBlue: { value: C.blue }, uBlueLight: { value: C.blueLight }, uWhite: { value: C.white } },
      vertexShader: [
        'attribute float aSize, aPhase, aSpeed, aMix;',
        'uniform float uTime, uScale;',
        'varying float vMix, vTwinkle;',
        'void main(){',
        '  vec3 p = position;',
        '  p.x += sin(uTime * aSpeed + aPhase) * 0.7;',
        '  p.y += cos(uTime * aSpeed * 0.8 + aPhase * 1.3) * 0.55 + sin(uTime * 0.07 + aPhase) * 0.4;',
        '  p.z += sin(uTime * aSpeed * 0.5 + aPhase * 0.7) * 0.5;',
        '  vec4 mv = modelViewMatrix * vec4(p, 1.0);',
        '  gl_PointSize = clamp(aSize * uScale / -mv.z, 1.5, 180.0);',
        '  gl_Position = projectionMatrix * mv;',
        '  vMix = aMix;',
        '  vTwinkle = 0.8 + 0.2 * sin(uTime * (0.6 + aSpeed) + aPhase * 2.0);',
        '}'
      ].join('\n'),
      fragmentShader: [
        'precision mediump float;',
        'uniform vec3 uBlue, uBlueLight, uWhite; uniform float uOpacity;',
        'varying float vMix, vTwinkle;',
        'void main(){',
        '  vec2 c = gl_PointCoord - 0.5; float d = length(c) * 2.0;',
        '  if (d > 1.0) discard;',
        '  float glow = pow(1.0 - d, 2.4);',
        '  float core = smoothstep(0.42, 0.0, d);',
        '  vec3 col = mix(mix(uBlue, uBlueLight, vMix), uWhite, core * 0.8);',
        '  float a = (glow * 0.4 + core * 0.7) * vTwinkle * uOpacity;',
        '  gl_FragColor = vec4(col * a, a);',
        '}'
      ].join('\n')
    });
    world.add(new THREE.Points(orbGeo, orbMat));

    // ---- Bokeh: a few large, dim spheres of light on camera-facing planes ----
    var bokehGeo = new THREE.PlaneGeometry(1, 1);
    var bokehMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
      uniforms: { uBlue: { value: C.blue }, uBlueLight: { value: C.blueLight }, uWhite: { value: C.white }, uOpacity: shared.uOpacity },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: [
        'precision mediump float; varying vec2 vUv; uniform vec3 uBlue, uBlueLight, uWhite; uniform float uOpacity;',
        'void main(){ float d = length(vUv - 0.5) * 2.0; if (d > 1.0) discard;',
        '  float glow = pow(1.0 - d, 3.0); float rim = smoothstep(0.55, 0.9, d) * smoothstep(1.0, 0.92, d) * 0.35;',
        '  vec3 col = mix(uBlue, uBlueLight, glow); col = mix(col, uWhite, glow * 0.25);',
        '  float a = (glow * 0.16 + rim * 0.35) * uOpacity; gl_FragColor = vec4(col * a, a); }'
      ].join('\n')
    });
    /** @type {{ mesh: any, base: any, phase: number, speed: number }[]} */
    var bokeh = [];
    for (var b = 0; b < opts.counts.bokeh; b++) {
      var m = new THREE.Mesh(bokehGeo, bokehMat);
      var s = 2.5 + Math.random() * 5;
      m.scale.set(s, s, 1);
      var base = place(rand(-1.15, 1.15), rand(-1.05, 1.05), -8 - Math.random() * 14, new THREE.Vector3());
      m.position.copy(base);
      world.add(m);
      bokeh.push({ mesh: m, base: base, phase: Math.random() * 6.28, speed: 0.08 + Math.random() * 0.12 });
    }

    // ---- Light ribbons: flat additive streaks on curves at the edges, echoing the reference ----
    var ribbonGroup = new THREE.Group();
    world.add(ribbonGroup);
    /** @param {number} seed @param {number} strength @param {number[]} st  strand row: whiteCore, blueness, halo, core at indexes 3 to 6 */
    function ribbonMaterial(seed, strength, st) {
      return new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
        uniforms: { uTime: shared.uTime, uOpacity: shared.uOpacity, uSeed: { value: seed }, uStrength: { value: strength }, uWhiteCore: { value: st[3] }, uBlueness: { value: st[4] }, uHalo: { value: st[5] }, uCore: { value: st[6] }, uBlue: { value: C.blue }, uBlueLight: { value: C.blueLight }, uWhite: { value: C.white } },
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: [
          'precision mediump float; varying vec2 vUv;',
          'uniform float uTime, uOpacity, uSeed, uStrength, uWhiteCore, uBlueness, uHalo, uCore; uniform vec3 uBlue, uBlueLight, uWhite;',
          'void main(){',
          '  float across = 1.0 - abs(vUv.y * 2.0 - 1.0);',
          '  float core = pow(across, 3.0); float halo = pow(across, 1.0);',
          '  float flow = 0.65 + 0.35 * sin(vUv.x * 9.0 - uTime * 0.7 + uSeed);',
          '  float flow2 = 0.75 + 0.25 * sin(vUv.x * 21.0 + uTime * 1.3 + uSeed * 2.0);',
          '  float ends = smoothstep(0.0, 0.16, vUv.x) * smoothstep(0.0, 0.16, 1.0 - vUv.x);',
          '  vec3 col = mix(uBlue, uBlueLight, halo * uBlueness); col = mix(col, uWhite, core * uWhiteCore);',
          '  float a = (halo * uHalo + core * uCore) * flow * flow2 * ends * uStrength * uOpacity;',
          '  gl_FragColor = vec4(col * a, a);',
          '}'
        ].join('\n')
      });
    }
    /** @typedef {{ pts: number[][], width: number, seed: number, strength: number }} RibbonDef */
    /** @type {RibbonDef[]} */
    var ribbonDefs = [
      // left edge, top to bottom, the reference's big sweep
      { pts: [[-1.35, 1.3, -15], [-1.0, 0.62, -11], [-0.86, -0.05, -9.5], [-1.0, -0.72, -9.5], [-1.4, -1.3, -12]], width: 3.4, seed: 1.0, strength: 0.95 },
      // right edge, a tall S
      { pts: [[1.4, 1.2, -16], [1.04, 0.55, -12], [0.9, -0.12, -11], [1.06, -0.75, -11], [1.42, -1.3, -14]], width: 3.1, seed: 2.7, strength: 0.85 },
      // top right swoosh
      { pts: [[0.45, 1.35, -13], [0.76, 0.92, -11], [1.02, 0.64, -10], [1.35, 0.46, -11]], width: 2.1, seed: 4.1, strength: 0.7 },
      // low arc behind everything
      { pts: [[1.3, -1.25, -20], [0.45, -1.0, -17], [-0.4, -1.04, -16], [-1.3, -0.86, -19]], width: 2.6, seed: 5.3, strength: 0.55 }
    ].slice(0, opts.counts.ribbons);
    // Strand rows: lateral offset, width factor, seed offset, white core, blueness, halo weight, core weight, strength factor.
    // A white-hot spine, two saturated electric-blue threads, one thin white filament, and a wide soft blue body.
    var strands = [
      [0, 1, 0, 0.65, 0.35, 0.45, 0.85, 1.0],
      [-0.7, 0.4, 1.9, 0.12, 0.15, 0.6, 1.15, 0.95],
      [0.75, 0.34, 3.7, 0.12, 0.15, 0.6, 1.15, 0.95],
      [-0.3, 0.14, 7.3, 0.85, 0.3, 0.3, 1.0, 0.7],
      [0.1, 1.9, 5.1, 0.0, 0.1, 0.6, 0.3, 0.5]
    ];
    function buildRibbons() {
      while (ribbonGroup.children.length) {
        var old = ribbonGroup.children[0];
        ribbonGroup.remove(old); old.geometry.dispose(); old.material.dispose();
      }
      ribbonDefs.forEach(function (def) {
        var curve = new THREE.CatmullRomCurve3(def.pts.map(function (p) { return place(p[0], p[1], p[2], new THREE.Vector3()); }), false, 'centripetal');
        var segs = 120;
        var points = curve.getSpacedPoints(segs);
        var tangent = new THREE.Vector3(), toCam = new THREE.Vector3(), side = new THREE.Vector3();
        strands.forEach(function (st) {
          var pos = new Float32Array((segs + 1) * 6), uv = new Float32Array((segs + 1) * 4);
          /** @type {number[]} */ var idx = [];
          for (var k = 0; k <= segs; k++) {
            var t = k / segs;
            curve.getTangentAt(t, tangent);
            toCam.copy(points[k]).negate().normalize();             // camera at the origin
            side.crossVectors(tangent, toCam).normalize();           // ribbon lies flat to the camera
            var w = def.width * st[1] * (0.3 + 0.7 * Math.sin(Math.PI * t)) * (0.85 + 0.15 * Math.sin(t * 7.0 + def.seed));
            var off = def.width * st[0] * (0.6 + 0.4 * Math.sin(t * 5.0 + st[2]));
            var cx = points[k].x + side.x * off, cy = points[k].y + side.y * off, cz = points[k].z + side.z * off;
            pos[k * 6] = cx + side.x * w; pos[k * 6 + 1] = cy + side.y * w; pos[k * 6 + 2] = cz + side.z * w;
            pos[k * 6 + 3] = cx - side.x * w; pos[k * 6 + 4] = cy - side.y * w; pos[k * 6 + 5] = cz - side.z * w;
            uv[k * 4] = t; uv[k * 4 + 1] = 0; uv[k * 4 + 2] = t; uv[k * 4 + 3] = 1;
            if (k < segs) { idx.push(k * 2, k * 2 + 1, k * 2 + 2, k * 2 + 1, k * 2 + 3, k * 2 + 2); }
          }
          var g = new THREE.BufferGeometry();
          g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
          g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
          g.setIndex(idx);
          ribbonGroup.add(new THREE.Mesh(g, ribbonMaterial(def.seed + st[2], def.strength * st[7], st)));
        });
      });
      builtAspect = camera.aspect;
    }
    buildRibbons();

    // ---- Film strip: photo planes on a ring around the lockup, weaving through depth ----
    var chosen = opts.photos.length ? pickPhotos(opts.photos, opts.counts.photos, Date.now()) : [];
    var photoCount = chosen.length || opts.counts.photos;
    opts.root.setAttribute('data-twg-order', chosen.map(function (p) { return (p.src.indexOf('data:') === 0 ? (p.alt || '') : p.src).replace(/^.*\//, ''); }).join(' '));
    var photoGeo = new THREE.PlaneGeometry(2.2, 1.4667);
    var ringX = phone ? 1.06 : 0.86;    // ring half-width in screen space: the sides of a phone, the flanks of a wide screen
    var ringY = phone ? 0.84 : 0.9;   // ring half-height: above the logo, below "Not Right Now"
    /** @param {number} t @param {any} out */
    function pathAt(t, out) {
      var ang = t * Math.PI * 2;
      var z = -12 + 3.0 * Math.sin(ang + 0.6) + 1.6 * Math.sin(3 * ang + 1.0);   // the weave: in and out of depth
      return place(ringX * Math.cos(ang), ringY * Math.sin(ang), z, out);
    }
    var photoFrag = [
      'precision mediump float; varying vec2 vUv; varying float vDepth; varying vec2 vScreen;',
      'uniform sampler2D uMap; uniform float uTime, uSeed, uFade, uOpacity, uAspect, uEnergy; uniform vec3 uFog;',
      'void main(){',
      '  vec4 c = texture2D(uMap, vUv);',
      '  vec2 e = smoothstep(0.0, 0.07, vUv) * smoothstep(0.0, 0.07, 1.0 - vUv);',
      '  float edge = e.x * e.y;',
      '  float vig = 1.0 - 0.6 * dot(vUv - 0.5, vUv - 0.5);',
      '  float band = pow(0.5 + 0.5 * sin((vUv.x * 0.7 + vUv.y * 0.3) * 6.0 - uTime * 0.6 + uSeed), 6.0);',
      '  vec3 col = c.rgb * vig * (0.95 + 0.4 * band) * (1.0 + 0.12 * uEnergy);',
      '  col = mix(col, uFog, vDepth * 0.6 * (1.0 - uEnergy));',
      '  float center = smoothstep(0.12, 0.42, length(vec2(vScreen.x * uAspect, vScreen.y * 1.25)));',
      '  float clear = mix(mix(0.35, 1.0, center), 1.0, uEnergy);',
      '  float a = edge * uFade * uOpacity * (1.0 - vDepth * 0.5) * clear;',
      '  gl_FragColor = vec4(col * a, a);',
      '}'
    ].join('\n');
    var photoVert = [
      'varying vec2 vUv; varying float vDepth; varying vec2 vScreen;',
      'void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(position, 1.0); vDepth = smoothstep(6.0, 22.0, -mv.z);',
      '  vec4 clip = projectionMatrix * mv; vScreen = clip.xy / clip.w; gl_Position = clip; }'
    ].join('\n');
    /** @type {{ mesh: any, mat: any, offset: number, roll: number, tex: any, aspect: number, sx: number, sy: number, jx: number, jy: number, jr: number, lag: number, pull: number, stack: number, limit: number, k: number }[]} */
    var photos = [];
    var loader = new THREE.TextureLoader();
    loader.setCrossOrigin('anonymous');
    /** @param {number} n */
    function placeholderTexture(n) {
      var cv = document.createElement('canvas'); cv.width = 480; cv.height = 320;
      var ctx = /** @type {CanvasRenderingContext2D} */ (cv.getContext('2d'));
      var g = ctx.createLinearGradient(0, 0, 480, 320);
      g.addColorStop(0, '#' + C.blueDark.getHexString()); g.addColorStop(1, '#' + C.navy.getHexString());
      ctx.fillStyle = g; ctx.fillRect(0, 0, 480, 320);
      var r = ctx.createRadialGradient(140 + (n * 53) % 200, 110 + (n * 37) % 120, 10, 240, 160, 300);
      var bl = Math.round(C.blueLight.r * 255) + ', ' + Math.round(C.blueLight.g * 255) + ', ' + Math.round(C.blueLight.b * 255);
      r.addColorStop(0, 'rgba(' + bl + ', 0.55)'); r.addColorStop(1, 'rgba(' + bl + ', 0)');
      ctx.fillStyle = r; ctx.fillRect(0, 0, 480, 320);
      ctx.fillStyle = '#' + C.white.getHexString() + '80';
      ctx.font = '700 120px ' + (css.getPropertyValue('--_typography---font-styles--heading').trim() || 'sans-serif');
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(String(n + 1), 240, 170);
      var tex = new THREE.CanvasTexture(cv);
      tex.colorSpace = THREE.SRGBColorSpace;
      return tex;
    }
    var blank = new THREE.DataTexture(new Uint8Array([Math.round(C.navy.r * 255), Math.round(C.navy.g * 255), Math.round(C.navy.b * 255), 255]), 1, 1);
    blank.needsUpdate = true;
    for (var p = 0; p < photoCount; p++) {
      (function (index) {
        var mat = new THREE.ShaderMaterial({
          transparent: true, depthWrite: false, depthTest: false,
          uniforms: { uMap: { value: blank }, uTime: shared.uTime, uAspect: shared.uAspect, uOpacity: shared.uOpacity, uEnergy: shared.uEnergy, uSeed: { value: index * 1.37 }, uFade: { value: 0 }, uFog: { value: C.navy } },
          vertexShader: photoVert, fragmentShader: photoFrag
        });
        var mesh = new THREE.Mesh(photoGeo, mat);
        world.add(mesh);
        var entry = { mesh: mesh, mat: mat, offset: index / photoCount, roll: (Math.random() * 2 - 1) * 0.08, tex: null, aspect: 1.5, sx: 1, sy: 1,
          jx: (Math.random() * 2 - 1) * 100, jy: (Math.random() * 2 - 1) * 12, jr: (Math.random() * 2 - 1) * 0.3,   // stack jitter in px and radians
          lag: 0.7 + Math.random() * 0.6,                                                              // each plane eases at its own pace
          pull: 0, stack: 0, limit: 1, k: 0 };                                                         // limit: the eased keep-out, 1 is no limit; k: the blend applied
        photos.push(entry);
        var photo = chosen.length ? chosen[index % chosen.length] : null;
        var usePlaceholder = function () { entry.tex = placeholderTexture(index); mat.uniforms.uMap.value = entry.tex; requestRender(); };
        if (photo) {
          loader.load(photo.src, function (/** @type {any} */ tex) {
            tex.colorSpace = THREE.SRGBColorSpace;
            tex.minFilter = THREE.LinearMipmapLinearFilter;
            tex.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
            var img = tex.image;
            var w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
            if (w && h) {
              entry.aspect = w / h;
              var portrait = entry.aspect < 1;
              var fit = Math.min(entry.aspect, 1.7);                       // a very wide photo keeps its aspect but not its width
              entry.sx = fit / 1.5 * (portrait ? 1.15 : 1); entry.sy = (fit / entry.aspect) * (portrait ? 1.15 : 1);   // the plane is 3:2; portraits ride a little taller
            }
            entry.tex = tex; mat.uniforms.uMap.value = tex; requestRender();
          }, undefined, usePlaceholder);
        } else { usePlaceholder(); }
      })(p);
    }

    // ---- Pointer: the ring holds its place while the pointer is outside it; inside, the photos drift in on a curve that is slow at the
    //      edge and fast near the button; on the button they stack. The glow behind the button follows the same curve ----
    var energy = 0, targetEnergy = 0, hold = false;
    var pointer = { px: 0, py: 0, active: false };   // pixels
    var prox = 0, proxRaw = 0, stackMode = false, stackAmt = 0, stackRaw = 0, wantPull = 0, pulling = false;
    var pointerOnButton = false;   // the pointer itself inside the pill's path (with the hysteresis), apart from any hold
    var swell = 0, swelling = false;   // a held hover on the button: the pink bloom takes over the viewport
    var textMix = 0;                   // 0 to 1: the text has crossed to navy-dark
    var ambient = !window.matchMedia('(pointer: fine)').matches;   // no pointer to approach with: run a gentle cycle instead
    var ambientT = -8;                                               // first gathering 8 seconds after open
    var ambientPeriod = CONFIG.ambientCycleMs / 1000;
    /** @type {DOMRect | null} */ var btnRect = null;
    var rectAge = 0;
    // The text block (logo to headline) in screen space: the partial drift stays outside it; only the stack may cross it
    var keep = { x: 0.45, top: 0.7, bottom: -0.32 };
    function readButton() {
      btnRect = opts.button.getBoundingClientRect(); rectAge = 0;
      var lg = opts.root.querySelector(".twg-takeover_logo"), hl = opts.root.querySelector(".twg-takeover_headline"), tt = opts.root.querySelector(".twg-takeover_title");
      if (lg && hl && tt) {
        var lr = lg.getBoundingClientRect(), hr = hl.getBoundingClientRect(), tr = tt.getBoundingClientRect();
        keep.x = (Math.max(hr.width, tr.width) / 2 + 20) * 2 / window.innerWidth;
        keep.top = 1 - (lr.top - 20) * 2 / window.innerHeight;
        keep.bottom = 1 - (hr.bottom + 12) * 2 / window.innerHeight;
      }
      opts.root.style.setProperty('--twg-glow-x', ((btnRect.left + btnRect.right) / 2).toFixed(1) + 'px');
      opts.root.style.setProperty('--twg-glow-y', ((btnRect.top + btnRect.bottom) / 2).toFixed(1) + 'px');
    }
    readButton();
    /**
     * Normalized closeness, 0 at the ring's inner edge (and outside it), 1 at the button's center, measured along the ray
     * from the button through the pointer, against the ring ellipse scaled by convergeStartRadius
     * @param {number} x @param {number} y  pixels
     */
    function closeness(x, y) {
      if (!btnRect) { return 0; }
      var W = window.innerWidth, H = window.innerHeight;
      var ax = ringX * CONFIG.convergeStartRadius * W / 2, ay = ringY * CONFIG.convergeStartRadius * H / 2;   // the inner ring, in pixels, about the screen center
      var bx = (btnRect.left + btnRect.right) / 2 - W / 2, by = (btnRect.top + btnRect.bottom) / 2 - H / 2;
      var vx = (x - W / 2) - bx, vy = (y - H / 2) - by;
      var len = Math.sqrt(vx * vx + vy * vy);
      if (len < 1) { return 1; }
      // solve ((bx + t vx) / ax)^2 + ((by + t vy) / ay)^2 = 1 for t > 0: where the ray meets the inner ring
      var A = (vx * vx) / (ax * ax) + (vy * vy) / (ay * ay);
      var B = 2 * ((bx * vx) / (ax * ax) + (by * vy) / (ay * ay));
      var Cc = (bx * bx) / (ax * ax) + (by * by) / (ay * ay) - 1;
      var disc = B * B - 4 * A * Cc;
      if (disc <= 0) { return 0; }
      var t = (-B + Math.sqrt(disc)) / (2 * A);
      if (t <= 0) { return 0; }
      var edge = t * len;                               // distance from the button center to the ring edge along this ray
      var inner = Math.min(edge - 1, (btnRect.bottom - btnRect.top) / 2);
      return Math.max(0, Math.min(1, (edge - len) / (edge - inner)));
    }
    /** @param {number} u  0 to 1 @returns {number} exponential easing, slow at 0, fast at 1 */
    function curve(u) { var k = CONFIG.convergeCurve; return (Math.exp(k * u) - 1) / (Math.exp(k) - 1); }
    /** @param {number} x @param {number} y  pixels; distance from the button's edge */
    function distanceToButton(x, y) {
      if (!btnRect) { return 1e9; }
      var dx = Math.max(btnRect.left - x, 0, x - btnRect.right), dy = Math.max(btnRect.top - y, 0, y - btnRect.bottom);
      return Math.sqrt(dx * dx + dy * dy);
    }
    function onLeave(/** @type {MouseEvent} */ e) { if (!e.relatedTarget) { pointer.active = false; requestRender(); } }
    var holdAt = 0, holdByTouch = false;
    function onHold(/** @type {Event} */ e) { hold = true; holdAt = performance.now(); holdByTouch = !!(e && e.type === 'touchstart'); requestRender(); }
    function onRelease() { hold = false; holdByTouch = false; requestRender(); }
    document.addEventListener('mouseout', onLeave);
    opts.button.addEventListener('focus', onHold);
    opts.button.addEventListener('blur', onRelease);
    opts.button.addEventListener('touchstart', onHold, { passive: true });
    opts.button.addEventListener('touchend', onRelease);
    opts.button.addEventListener('touchcancel', onRelease);
    // The farthest text point from the button (the logo's top corners), for the swell's text crossing
    var farText = 0;
    function readFar() {
      var lg = opts.root.querySelector('.twg-takeover_logo');
      if (!lg || !btnRect) { return; }
      var r = lg.getBoundingClientRect(), cx = (btnRect.left + btnRect.right) / 2, cy = (btnRect.top + btnRect.bottom) / 2;
      farText = Math.max(Math.hypot(r.left - cx, r.top - cy), Math.hypot(r.right - cx, r.top - cy));
    }
    readFar();

    // ---- Parallax: pointer or device tilt, eased ----
    var target = { x: 0, y: 0 }, current = { x: 0, y: 0 };
    /** @param {PointerEvent} e */
    function onPointer(e) {
      if (staticComposition) { return; }
      target.x = (e.clientX / window.innerWidth) * 2 - 1;
      target.y = (e.clientY / window.innerHeight) * 2 - 1;
      if (!ambient) { pointer.px = e.clientX; pointer.py = e.clientY; pointer.active = true; }
      requestRender();
    }
    /** @param {DeviceOrientationEvent} e */
    function onTilt(e) {
      if (staticComposition || e.gamma == null || e.beta == null) { return; }
      target.x = Math.max(-1, Math.min(1, e.gamma / 30));
      target.y = Math.max(-1, Math.min(1, (e.beta - 45) / 30));
      requestRender();
    }
    window.addEventListener('pointermove', onPointer, { passive: true });
    window.addEventListener('deviceorientation', onTilt, { passive: true });

    // ---- Size ----
    function resize() {
      sizeCamera();
      readButton();
      if (Math.abs(camera.aspect - builtAspect) / builtAspect > 0.12) { placeOrbs(); buildRibbons(); }
      requestRender();
    }
    window.addEventListener('resize', resize);

    // ---- Frame ----
    var fadeIn = 0;
    var tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3(), tmp3 = new THREE.Vector3();
    var helper = new THREE.Object3D(), qRing = new THREE.Quaternion();
    var sRing = new THREE.Vector3(), sStack = new THREE.Vector3();
    /**
     * Where the segment from a (outside the text box) toward b first enters the box, as a parameter 0 to 1, or 1 if it
     * never does before reaching b. The slab method: the entry is the latest of the per-axis entries, valid only if it
     * comes before the earliest exit. Exact, so the limit moves continuously as the ring weaves
     * @param {any} a @param {any} b  screen-space points
     */
    function entryIntoKeep(a, b) {
      var dx = b.x - a.x, dy = b.y - a.y;
      var tx0, tx1, ty0, ty1;
      if (Math.abs(dx) < 1e-6) { if (Math.abs(a.x) >= keep.x) { return 1; } tx0 = -Infinity; tx1 = Infinity; }
      else { var t1 = (-keep.x - a.x) / dx, t2 = (keep.x - a.x) / dx; tx0 = Math.min(t1, t2); tx1 = Math.max(t1, t2); }
      if (Math.abs(dy) < 1e-6) { if (a.y <= keep.bottom || a.y >= keep.top) { return 1; } ty0 = -Infinity; ty1 = Infinity; }
      else { var t3 = (keep.bottom - a.y) / dy, t4 = (keep.top - a.y) / dy; ty0 = Math.min(t3, t4); ty1 = Math.max(t3, t4); }
      var enter = Math.max(tx0, ty0), exit = Math.min(tx1, ty1);
      if (enter > exit || exit < 0 || enter > 1) { return 1; }
      return Math.max(0, enter);
    }
    var loopSeconds = 100;   // one full pass of the strip
    /** @param {number} dt */
    function update(dt) {
      fadeIn = Math.min(1, fadeIn + dt * 0.8);
      shared.uOpacity.value = fadeIn;
      shared.uTime.value = time;
      // Pointer state: prox (0 at the ring's edge, 1 at the button, on the exponential curve), stackMode (inside the button's path), wantPull (the photos), energy (the glow)
      if ((rectAge += dt) > 1) { readButton(); }
      if (staticComposition || paused) {
        proxRaw = 0; stackMode = false; stackAmt = 0; targetEnergy = 0; wantPull = 0;
      } else if (ambient) {
        if (hold) { targetEnergy = 1; }
        else {
          ambientT += dt;
          var c = ((ambientT % ambientPeriod) + ambientPeriod) % ambientPeriod;
          targetEnergy = ambientT < 0 ? 0 : (c < 2.5 ? c / 2.5 : (c < 4.5 ? 1 : (c < 7 ? 1 - (c - 4.5) / 2.5 : 0)));
        }
        proxRaw = targetEnergy;
        var sa = Math.max(0, Math.min(1, (targetEnergy - 0.8) / 0.2));
        stackRaw = sa * sa * (3 - 2 * sa);
        stackMode = hold || targetEnergy > 0.97;
        wantPull = Math.max(targetEnergy * 0.8, stackAmt);
      } else {
        var d = pointer.active ? distanceToButton(pointer.px, pointer.py) : 1e9;
        // The stack as a continuous amount over a 60px band outside the pill's margin, and the boolean with hysteresis
        // (enter at the margin, leave 30px further out), so hovering at the edge never flips a target back and forth
        var band = CONFIG.stackMarginPx + 60;
        var sb = pointer.active ? Math.max(0, Math.min(1, (band - d) / 60)) : 0;
        stackRaw = hold ? 1 : sb * sb * (3 - 2 * sb);
        pointerOnButton = pointer.active && d <= CONFIG.stackMarginPx + (pointerOnButton ? 30 : 0);
        if (stackMode) { stackMode = hold || (pointer.active && d <= CONFIG.stackMarginPx + 30); }
        else { stackMode = hold || (pointer.active && d <= CONFIG.stackMarginPx); }
        // Outside the ring: nothing. Inside: the same exponential curve drives the drift and the glow, slow near the
        // ring's edge and fast near the button; on the button, the stack
        proxRaw = pointer.active ? curve(closeness(pointer.px, pointer.py)) : 0;
        targetEnergy = Math.max(prox, stackAmt);
        wantPull = Math.max(prox * 0.85, stackAmt);
      }
      prox += (proxRaw - prox) * Math.min(1, dt * 8);                 // the measured closeness, smoothed before it drives anything
      if (prox < 0.0005) { prox = 0; }
      stackAmt += (stackRaw - stackAmt) * Math.min(1, dt * (stackRaw > stackAmt ? 10 : 4));   // the stack amount too: a pointer that crosses the band in four frames still gets a smooth onset, and a calmer release
      if (stackAmt < 0.0005) { stackAmt = 0; }
      if (stackMode || ambient) { targetEnergy = Math.max(targetEnergy, stackAmt); wantPull = Math.max(wantPull, stackAmt); }
      else { targetEnergy = Math.max(prox, stackAmt); wantPull = Math.max(prox * 0.85, stackAmt); }
      energy += (targetEnergy - energy) * Math.min(1, dt * 3);
      if (energy < 0.001) { energy = 0; }
      shared.uEnergy.value = energy;
      opts.root.style.setProperty('--twg-energy', energy.toFixed(3));
      // The swell: while the pointer rests on the button (or the stack is held by focus or a finger), a long, even rise;
      // a calmer fall after. The ambient cycle on touch devices never swells on its own
      var holdSwells = hold && (holdByTouch || performance.now() - holdAt > 2000);   // a keyboard focus rests 2 seconds before the page fills
      var holding = stackMode && !staticComposition && !paused && (holdSwells || (!ambient && pointerOnButton));   // a pointer that merely moved earlier does not swell a keyboard hold
      swell = Math.max(0, Math.min(1, swell + (holding ? dt / CONFIG.swellSeconds : -dt / CONFIG.swellReleaseSeconds)));
      var se = swell * swell * (3 - 2 * swell);                        // eased: pressure building, then easing into full
      opts.root.style.setProperty('--twg-swell', se.toFixed(3));
      // The text crosses to navy-dark only once the solid pink has reached the farthest text point, so it never darkens over navy
      // The crossing. The resting inks (white, off-white, the blue WE GLOW) clear their contrast on the swell only while the
      // layer is at or under 0.38 opacity (the blue is the limit: 3:1 on large text); navy-dark clears it only from 0.85
      // up. No opacity satisfies both, so the layer holds at 0.38 until the solid pink has reached the farthest text point,
      // then the opacity and the ink flip in the same frame (0.38 to 0.85, resting inks to navy-dark) and the opacity rises
      // to 0.94 with the swell. No frame is ever drawn with a half-mixed ink or an ink on a pink it cannot clear. The flip
      // back on the recede uses a lower threshold so it cannot chatter. Measured in tools/swell-contrast-timeline.json
      var discR = 1.5 * Math.max(window.innerWidth, window.innerHeight) * (0.04 + 0.96 * se);
      var solidR = 0.62 * discR;
      if (rectAge === 0) { readFar(); }
      var covered = farText > 0 && solidR >= farText + 8 && se >= (textMix > 0.5 ? 0.33 : 0.36);
      textMix = covered ? 1 : 0;
      var swellOpacity = covered ? Math.max(0.85, Math.min(0.94, se * 2.5 * 0.94)) : Math.min(0.38, se * 2.5 * 0.94);
      opts.root.style.setProperty('--twg-text-mix', textMix.toFixed(3));
      opts.root.style.setProperty('--twg-swell-opacity', swellOpacity.toFixed(3));
      swelling = holding ? swell < 1 : swell > 0;
      var bcx = btnRect ? (btnRect.left + btnRect.right) / window.innerWidth - 1 : 0;
      var bcy = btnRect ? 1 - (btnRect.top + btnRect.bottom) / window.innerHeight : -0.4;
      pulling = false;
      current.x += (target.x - current.x) * Math.min(1, dt * 3);
      current.y += (target.y - current.y) * Math.min(1, dt * 3);
      world.rotation.y = current.x * 0.045;
      world.rotation.x = -current.y * 0.03;
      world.position.x = current.x * 0.35;
      world.position.y = -current.y * 0.25;
      for (var i = 0; i < photos.length; i++) {
        var ph = photos[i];
        var t = (ph.offset + time / loopSeconds) % 1;
        pathAt(t, tmp);
        pathAt((t + 0.004) % 1, tmp2);
        ph.mesh.position.copy(tmp);
        ph.mesh.lookAt(0, 0, 0);
        var yaw = Math.atan2(tmp2.x - tmp.x, tmp2.z - tmp.z);
        ph.mesh.rotation.y += Math.sin(yaw) * 0.3;
        ph.mesh.rotation.x += -Math.sin(t * Math.PI * 2) * 0.22;      // top of the ring tilts down, bottom tilts up, like a strip arcing over
        ph.mesh.rotation.z += ph.roll + Math.sin(time * 0.3 + i) * 0.03;
        ph.mesh.scale.set(ph.sx, ph.sy, 1);
        // Eased toward the wanted pull, each plane at its own pace: no snapping in or out
        ph.pull += (wantPull - ph.pull) * Math.min(1, dt * (wantPull > ph.pull ? 2.2 + 1.8 * stackAmt : 1.4) * ph.lag);   // a calmer release than approach
        ph.stack += (stackAmt - ph.stack) * Math.min(1, dt * 3 * ph.lag);
        if (ph.pull < 0.002) { ph.pull = 0; ph.stack = 0; ph.limit = 1; }
        if (ph.pull > 0) {
          pulling = true;
          place(bcx + ph.jx * 2 / window.innerWidth, bcy + ph.jy * 2 / window.innerHeight, -9 - i * 0.12, tmp3);   // this plane's spot in the stack
          var k = ph.pull;
          // The text-block keep-out: the plane's blend may not pass the point where its path enters the box. The limit is
          // computed exactly and then eased, so a path that starts or stops grazing a corner slides rather than snaps.
          // The stack phase blends the limit away
          sRing.copy(tmp).project(camera); sStack.copy(tmp3).project(camera);
          var limitTarget = entryIntoKeep(sRing, sStack);
          var limitStep = (limitTarget - ph.limit) * Math.min(1, dt * 5);
          ph.limit += Math.max(-0.02, Math.min(0.02, limitStep));             // at most 2% of the path per frame, whatever the frame length
          var kLim = Math.min(k, ph.limit);
          var stackFree = ph.stack * ph.stack * (3 - 2 * ph.stack);           // a stacking plane is free of the limit well before it arrives
          k = kLim + (k - kLim) * Math.max(stackFree, Math.min(1, ph.stack * 1.25));
          ph.k = k;
          qRing.copy(ph.mesh.quaternion);
          helper.position.copy(tmp3); helper.lookAt(0, 0, 0); helper.rotateZ(ph.jr * (0.4 + 0.6 * ph.stack));
          ph.mesh.position.lerpVectors(tmp, tmp3, k);
          ph.mesh.quaternion.slerpQuaternions(qRing, helper.quaternion, k);
          var sh = 1 - 0.18 * ph.stack;
          ph.mesh.scale.set(ph.sx * sh, ph.sy * sh, 1);
        }
        ph.mat.uniforms.uFade.value = Math.min(1, ph.mat.uniforms.uFade.value + (ph.tex ? dt * 0.6 : 0));
      }
      for (var k = 0; k < bokeh.length; k++) {
        var bk = bokeh[k];
        bk.mesh.position.set(bk.base.x + Math.sin(time * bk.speed + bk.phase) * 1.2, bk.base.y + Math.cos(time * bk.speed * 0.7 + bk.phase) * 0.9, bk.base.z);
        bk.mesh.lookAt(0, 0, 0);
      }
    }
    function frame() {
      raf = 0;
      var nowT = performance.now();
      var dt = Math.min(0.05, (nowT - last) / 1000);
      last = nowT;
      if (!paused) { time += dt; }
      var settling = fadeIn < 1 || Math.abs(target.x - current.x) + Math.abs(target.y - current.y) > 0.002 || Math.abs(targetEnergy - energy) > 0.002 || pulling || wantPull > 0 || swelling || photos.some(function (ph) { return ph.tex && ph.mat.uniforms.uFade.value < 1; });
      if (!paused || settling || needsRender) {
        update(dt);
        renderer.render(sceneObj, camera);
        needsRender = false;
      }
      // Paused and settled: no more frames until something asks (pointer, resize, a texture, Play)
      if (!paused || settling) { schedule(); }
    }
    function schedule() { if (!raf && document.visibilityState === 'visible') { raf = window.requestAnimationFrame(frame); } }
    function requestRender() { needsRender = true; schedule(); }
    function onVisibility() { if (document.visibilityState === 'visible') { last = performance.now(); schedule(); } }
    document.addEventListener('visibilitychange', onVisibility);

    if (staticComposition) { time = 23.0; }   // a composed moment with photos spread around the ring
    schedule();

    return {
      /** @param {boolean} p */
      setPaused: function (p) { paused = p; if (!p) { staticComposition = false; } last = performance.now(); requestRender(); },
      /** Mockup only: plane positions and the pointer state, for the glitch probe in tools/ */
      debug: CONFIG.mockup ? function () {
        return { positions: photos.map(function (ph) { return [ph.mesh.position.x, ph.mesh.position.y, ph.mesh.position.z]; }), pulls: photos.map(function (ph) { return ph.pull; }), limits: photos.map(function (ph) { return ph.limit; }), stacks: photos.map(function (ph) { return ph.stack; }), ks: photos.map(function (ph) { return ph.k; }), stackMode: stackMode, stackAmt: stackAmt, wantPull: wantPull, prox: prox };
      } : null,
      dispose: function () {
        if (raf) { window.cancelAnimationFrame(raf); }
        window.removeEventListener('pointermove', onPointer);
        document.removeEventListener('mouseout', onLeave);
        opts.button.removeEventListener('focus', onHold);
        opts.button.removeEventListener('blur', onRelease);
        opts.button.removeEventListener('touchstart', onHold);
        opts.button.removeEventListener('touchend', onRelease);
        opts.button.removeEventListener('touchcancel', onRelease);
        window.removeEventListener('deviceorientation', onTilt);
        window.removeEventListener('resize', resize);
        document.removeEventListener('visibilitychange', onVisibility);
        photos.forEach(function (ph) { if (ph.tex) { ph.tex.dispose(); } ph.mat.dispose(); });
        ribbonGroup.children.forEach(function (/** @type {any} */ r) { r.geometry.dispose(); r.material.dispose(); });
        photoGeo.dispose(); orbGeo.dispose(); orbMat.dispose(); bokehGeo.dispose(); bokehMat.dispose(); blank.dispose();
        renderer.dispose();
        if (canvas.parentNode) { canvas.parentNode.removeChild(canvas); }
      }
    };
  }
})();
