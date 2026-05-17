/* AusClear Slider Puzzle CAPTCHA - drop-in widget
 *
 * Usage in any form:
 *   <script src="https://ausclear-captcha.vercel.app/widget.js"></script>
 *   <div id="captcha"></div>
 *   <script>
 *     AusclearCaptcha.mount('#captcha', {
 *       onSuccess: (token) => { window.captchaToken = token; submitBtn.disabled = false; },
 *       onFail:    ()      => { window.captchaToken = null;  submitBtn.disabled = true;  }
 *     });
 *   </script>
 *
 * On form submit:
 *   fetch('https://ausclear-captcha.vercel.app/api/validate-token', {
 *     method: 'POST', headers: {'Content-Type':'application/json'},
 *     body: JSON.stringify({ token: window.captchaToken })
 *   }).then(r => r.json()).then(result => { if (result.success) form.submit(); });
 */

(function () {
  const API_BASE = 'https://ausclear-captcha.vercel.app';

  const STYLES = `
    .ac-captcha { font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif; max-width: 320px; margin: 0 auto; user-select: none; -webkit-user-select: none; }
    .ac-captcha-canvas { position: relative; width: 320px; height: 180px; background: #0d0d12; border: 1px solid rgba(201,168,76,0.32); border-radius: 10px; overflow: hidden; }
    .ac-captcha-bg { position: absolute; inset: 0; }
    .ac-captcha-gap { position: absolute; border: 1px dashed rgba(201,168,76,0.6); background: rgba(7,7,10,0.7); box-shadow: inset 0 0 8px rgba(0,0,0,0.5); border-radius: 8px; }
    .ac-captcha-piece { position: absolute; cursor: grab; touch-action: none; transition: box-shadow 0.15s; }
    .ac-captcha-piece.dragging { cursor: grabbing; box-shadow: 0 6px 20px rgba(201,168,76,0.5); }
    .ac-captcha-piece svg { display: block; filter: drop-shadow(0 2px 6px rgba(0,0,0,0.6)); }
    .ac-captcha-track { position: relative; margin-top: 14px; height: 44px; background: #14141a; border: 1px solid rgba(201,168,76,0.16); border-radius: 22px; overflow: hidden; }
    .ac-captcha-track-fill { position: absolute; top: 0; left: 0; bottom: 0; width: 0; background: linear-gradient(90deg, rgba(201,168,76,0.3), rgba(201,168,76,0.55)); transition: width 0.15s, background 0.3s; }
    .ac-captcha-track-text { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 500; color: #a8a8b4; pointer-events: none; letter-spacing: 0.02em; }
    .ac-captcha-handle { position: absolute; top: 2px; left: 2px; width: 40px; height: 40px; background: linear-gradient(180deg, #d9bf6f, #c9a84c 50%, #a4862c); border-radius: 50%; box-shadow: inset 0 1px 0 rgba(255,255,255,0.3), 0 4px 12px rgba(201,168,76,0.4); cursor: grab; display: grid; place-items: center; color: #07070a; font-size: 14px; touch-action: none; }
    .ac-captcha-handle.dragging { cursor: grabbing; }
    .ac-captcha-track.success { background: rgba(110,201,138,0.15); border-color: rgba(110,201,138,0.5); }
    .ac-captcha-track.success .ac-captcha-track-fill { background: linear-gradient(90deg, rgba(110,201,138,0.4), rgba(110,201,138,0.7)); }
    .ac-captcha-track.success .ac-captcha-track-text { color: #6ec98a; }
    .ac-captcha-track.fail { background: rgba(217,100,88,0.15); border-color: rgba(217,100,88,0.5); }
    .ac-captcha-track.fail .ac-captcha-track-fill { background: linear-gradient(90deg, rgba(217,100,88,0.4), rgba(217,100,88,0.7)); }
    .ac-captcha-track.fail .ac-captcha-track-text { color: #d96458; }
    .ac-captcha-refresh { position: absolute; top: 6px; right: 6px; width: 26px; height: 26px; border: none; background: rgba(7,7,10,0.7); color: #c9a84c; border-radius: 6px; cursor: pointer; display: grid; place-items: center; font-size: 14px; transition: background 0.2s; z-index: 3; }
    .ac-captcha-refresh:hover { background: rgba(201,168,76,0.2); }
    .ac-captcha-error { margin-top: 8px; padding: 6px 12px; background: rgba(217,100,88,0.1); border: 1px solid rgba(217,100,88,0.3); border-radius: 6px; color: #d96458; font-size: 12px; text-align: center; }
    .ac-captcha-loading { display: grid; place-items: center; height: 100%; color: #8a8a96; font-size: 13px; }
  `;

  function injectStyles() {
    if (document.getElementById('ac-captcha-styles')) return;
    const style = document.createElement('style');
    style.id = 'ac-captcha-styles';
    style.textContent = STYLES;
    document.head.appendChild(style);
  }

  function piecePath(size) {
    // Standard jigsaw piece - rectangle with a knob on the right
    const s = size;
    const k = size / 4;  // knob radius
    return `M 0 0 L ${s-k} 0 A ${k} ${k} 0 0 1 ${s-k} ${2*k} L ${s} ${2*k} L ${s} ${s} L 0 ${s} Z`;
  }

  function piecePathFull(size) {
    // The full puzzle piece SVG with the same shape
    const s = size;
    const k = 10;  // knob protrusion size
    // Rectangle with a knob bump on the right side
    return `M 4 4 L ${s-k-4} 4 Q ${s-k-4} ${s/2 - k} ${s/2} ${s/2 - k} Q ${s-4} ${s/2 - k} ${s-4} ${s/2} Q ${s-4} ${s/2 + k} ${s/2} ${s/2 + k} Q ${s-k-4} ${s/2 + k} ${s-k-4} ${s-4} L 4 ${s-4} Z`;
  }

  async function fetchChallenge() {
    const r = await fetch(API_BASE + '/api/challenge', { credentials: 'omit' });
    if (!r.ok) throw new Error('Failed to load challenge');
    return r.json();
  }

  async function submitVerify(body) {
    const r = await fetch(API_BASE + '/api/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'omit',
      body: JSON.stringify(body),
    });
    return r.json();
  }

  function buildPieceSVG(size, bgUrl, gapX, gapY) {
    // The piece is a clipped version of the background at (gapX, gapY).
    // We use clipPath with the puzzle shape so the piece visually matches
    // what was cut from the background.
    const id = 'clip-' + Math.random().toString(36).slice(2, 8);
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      <defs>
        <clipPath id="${id}">
          <path d="${piecePathFull(size)}"/>
        </clipPath>
      </defs>
      <g clip-path="url(#${id})">
        <image href="${API_BASE}${bgUrl}" x="${-gapX}" y="${-gapY}" width="320" height="180"/>
      </g>
      <path d="${piecePathFull(size)}" fill="none" stroke="rgba(201,168,76,0.7)" stroke-width="1.5"/>
    </svg>`;
  }

  function buildGapSVG(size) {
    // The gap shown on the background image - a darkened version of the piece shape
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" style="pointer-events:none">
      <path d="${piecePathFull(size)}" fill="rgba(7,7,10,0.75)" stroke="rgba(201,168,76,0.5)" stroke-width="1" stroke-dasharray="3 2"/>
    </svg>`;
  }

  const widgets = new Map();

  function mount(selector, opts = {}) {
    injectStyles();
    const root = typeof selector === 'string' ? document.querySelector(selector) : selector;
    if (!root) throw new Error('Element not found: ' + selector);

    const instance = { root, opts, state: null, currentToken: null };
    widgets.set(root, instance);

    render(instance);
    return {
      reset: () => render(instance),
      getToken: () => instance.currentToken,
    };
  }

  async function render(instance) {
    const { root, opts } = instance;
    instance.currentToken = null;

    root.innerHTML = `
      <div class="ac-captcha">
        <div class="ac-captcha-canvas">
          <div class="ac-captcha-loading">Loading…</div>
        </div>
        <div class="ac-captcha-track">
          <div class="ac-captcha-track-fill"></div>
          <div class="ac-captcha-track-text">Drag the piece to fit the puzzle</div>
          <div class="ac-captcha-handle" style="display:none">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M9 6l6 6-6 6"/></svg>
          </div>
        </div>
      </div>
    `;

    let challenge;
    try {
      challenge = await fetchChallenge();
    } catch (e) {
      root.querySelector('.ac-captcha-canvas').innerHTML = '<div class="ac-captcha-loading">Failed to load. Refresh and retry.</div>';
      return;
    }
    instance.state = { challenge, dragging: false, pieceX: 0, trajectory: [] };

    const canvas = root.querySelector('.ac-captcha-canvas');
    const { background, width, height, pieceSize, gapX, gapY } = challenge;

    // Build the canvas: background image, gap overlay, piece, refresh button
    canvas.innerHTML = `
      <img class="ac-captcha-bg" src="${API_BASE}${background}" width="${width}" height="${height}" alt="puzzle background" draggable="false"/>
      <div class="ac-captcha-gap" style="left:${gapX}px;top:${gapY}px;width:${pieceSize}px;height:${pieceSize}px">${buildGapSVG(pieceSize)}</div>
      <div class="ac-captcha-piece" style="left:0;top:${gapY}px;width:${pieceSize}px;height:${pieceSize}px">${buildPieceSVG(pieceSize, background, gapX, gapY)}</div>
      <button type="button" class="ac-captcha-refresh" aria-label="Refresh challenge">↻</button>
    `;

    const piece = canvas.querySelector('.ac-captcha-piece');
    const handle = root.querySelector('.ac-captcha-handle');
    const track = root.querySelector('.ac-captcha-track');
    const trackFill = root.querySelector('.ac-captcha-track-fill');
    const trackText = root.querySelector('.ac-captcha-track-text');
    const refreshBtn = canvas.querySelector('.ac-captcha-refresh');

    handle.style.display = 'grid';

    // Drag state
    let startX = 0;
    let startTime = 0;
    const maxX = width - pieceSize;
    const trackMaxX = root.querySelector('.ac-captcha-track').offsetWidth - 44 - 4;

    function startDrag(clientX) {
      if (instance.currentToken) return;
      instance.state.dragging = true;
      instance.state.trajectory = [];
      startX = clientX;
      startTime = Date.now();
      piece.classList.add('dragging');
      handle.classList.add('dragging');
      track.classList.remove('fail', 'success');
      trackText.textContent = 'Slide to match';
    }

    function onMove(clientX) {
      if (!instance.state.dragging) return;
      const delta = clientX - startX;
      const t = Date.now() - startTime;
      const pieceX = Math.max(0, Math.min(maxX, delta));
      const handleX = Math.max(0, Math.min(trackMaxX, (delta / maxX) * trackMaxX));

      instance.state.pieceX = pieceX;
      piece.style.left = pieceX + 'px';
      handle.style.left = (2 + handleX) + 'px';
      trackFill.style.width = (handleX + 42) + 'px';
      instance.state.trajectory.push([t, pieceX]);
    }

    async function endDrag() {
      if (!instance.state.dragging) return;
      instance.state.dragging = false;
      piece.classList.remove('dragging');
      handle.classList.remove('dragging');

      const { challengeId, gapX, gapY, issuedAt, signature } = challenge;
      trackText.textContent = 'Verifying…';

      try {
        const result = await submitVerify({
          challengeId, gapX, gapY, issuedAt, signature,
          droppedX: instance.state.pieceX,
          trajectory: instance.state.trajectory,
        });

        if (result.success) {
          track.classList.add('success');
          trackText.textContent = '✓ Verified';
          piece.style.pointerEvents = 'none';
          handle.style.pointerEvents = 'none';
          instance.currentToken = result.token;
          if (opts.onSuccess) opts.onSuccess(result.token);
        } else {
          track.classList.add('fail');
          trackText.textContent = result.message || 'Try again';
          // Snap back and let user retry
          setTimeout(() => {
            piece.style.left = '0px';
            handle.style.left = '2px';
            trackFill.style.width = '0px';
            track.classList.remove('fail');
            trackText.textContent = 'Drag the piece to fit the puzzle';
          }, 1200);
          if (opts.onFail) opts.onFail(result.message);
        }
      } catch (e) {
        track.classList.add('fail');
        trackText.textContent = 'Verification error';
        if (opts.onFail) opts.onFail('network');
      }
    }

    // Mouse events on handle
    handle.addEventListener('mousedown', (e) => { e.preventDefault(); startDrag(e.clientX); });
    document.addEventListener('mousemove', (e) => { if (instance.state.dragging) onMove(e.clientX); });
    document.addEventListener('mouseup', () => { if (instance.state.dragging) endDrag(); });

    // Touch events
    handle.addEventListener('touchstart', (e) => { e.preventDefault(); startDrag(e.touches[0].clientX); }, { passive: false });
    document.addEventListener('touchmove', (e) => { if (instance.state.dragging) { e.preventDefault(); onMove(e.touches[0].clientX); } }, { passive: false });
    document.addEventListener('touchend', () => { if (instance.state.dragging) endDrag(); });

    // Also allow dragging the piece itself directly
    piece.addEventListener('mousedown', (e) => { e.preventDefault(); startDrag(e.clientX - instance.state.pieceX); });
    piece.addEventListener('touchstart', (e) => { e.preventDefault(); startDrag(e.touches[0].clientX - instance.state.pieceX); }, { passive: false });

    // Refresh
    refreshBtn.addEventListener('click', () => render(instance));
  }

  window.AusclearCaptcha = { mount };
})();
