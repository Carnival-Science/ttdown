// A shared horizontal viewport for timeline views: which stretch of a time axis (in seconds) is visible. Several views (rulers, lanes, an
// overview) read one viewport so they scroll and zoom together. Generic: it knows nothing about music; the app supplies the time mapping.
// `follow` is the "page along with playback" flag: a manual move (pan, zoom) turns it off, a programmatic `jump` leaves it alone.
export class TimeViewport {
  /** First visible time, and how much time is visible, in seconds. */
  start = $state(0);
  span = $state(10);
  /** The whole axis. */
  min = $state(0);
  max = $state(10);
  /** The smallest span the view may zoom in to. */
  minSpan = 1;
  follow = $state(true);

  get end() { return this.start + this.span; }
  configure(min: number, max: number, minSpan = 1) { this.min = min; this.max = Math.max(min + minSpan, max); this.minSpan = minSpan; this.jump(this.start, this.span); }
  /** Pixel position of a time in a view `width` px wide, and back. */
  xOf(t: number, width: number) { return ((t - this.start) / this.span) * width; }
  tOf(x: number, width: number) { return this.start + (x / width) * this.span; }
  /** Move or resize the view programmatically (does not touch `follow`). */
  jump(start: number, span = this.span) {
    const full = this.max - this.min, s = Math.min(Math.max(span, this.minSpan), full);
    this.span = s; this.start = Math.min(Math.max(start, this.min), this.max - s);
  }
  /** Bring a time into view, with the view starting a little before it (`lead` is a fraction of the span). */
  reveal(t: number, lead = 0.1) { this.stopGlide(); this.jump(t - this.span * lead); }
  /** Move there smoothly (about 0.3 s, easing out) instead of jumping: for deliberate moves such as picking a section. Any other move
   *  (playback following, a pan, a zoom) takes over at once. Jumps immediately under prefers-reduced-motion. */
  glide(start: number, span = this.span, ms = 320) {
    this.stopGlide();
    const reduce = typeof window === "undefined" || !window.requestAnimationFrame || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) { this.jump(start, span); return; }
    const s0 = this.start, p0 = this.span, t0 = performance.now(), id = ++this.glideId, ease = (x: number) => 1 - Math.pow(1 - x, 3);
    const step = (now: number) => { if (id !== this.glideId) return; const k = Math.min(1, (now - t0) / ms), e = ease(k); this.jump(s0 + (start - s0) * e, p0 + (span - p0) * e); if (k < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  }
  /** Glide so a time comes into view the way `reveal` places it. */
  glideTo(t: number, lead = 0.1) { this.glide(t - this.span * lead); }
  private glideId = 0;
  private stopGlide() { this.glideId++; }
  contains(t: number, margin = 0) { return t >= this.start + this.span * margin && t <= this.end - this.span * margin; }
  /** A manual move: the person scrolled or zoomed, so the view stops following playback. */
  pan(dt: number) { this.stopGlide(); this.follow = false; this.jump(this.start + dt); }
  zoom(factor: number, anchor = this.start + this.span / 2) {
    this.stopGlide(); this.follow = false;
    const s = Math.min(Math.max(this.span * factor, this.minSpan), this.max - this.min), k = (anchor - this.start) / this.span;
    this.jump(anchor - k * s, s);
  }
  fit() { this.stopGlide(); this.follow = false; this.jump(this.min, this.max - this.min); }
}
