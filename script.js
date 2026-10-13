const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------- Trascinamento col mouse ----------
// Su telefono e trackpad lo scorrimento è già nativo; questo aggiunge il "tieni premuto e trascina" col mouse.
// onMove/onEnd ricevono lo spostamento e la velocità (px/ms) del gesto.
function dragToScroll(el, { onStart, onMove, onEnd }) {
  let startX, lastX, lastT, velocity, moved = false, active = false;

  el.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    active = true; moved = false;
    startX = lastX = e.clientX; lastT = e.timeStamp; velocity = 0;
    onStart?.();
    e.preventDefault();
  });
  window.addEventListener('pointermove', (e) => {
    if (!active) return;
    const dx = e.clientX - startX;
    if (!moved && Math.abs(dx) > 4) { moved = true; el.classList.add('is-dragging'); }
    const dt = Math.max(1, e.timeStamp - lastT);
    velocity = 0.8 * ((e.clientX - lastX) / dt) + 0.2 * velocity;
    lastX = e.clientX; lastT = e.timeStamp;
    if (moved) onMove(dx);
  });
  window.addEventListener('pointerup', (e) => {
    if (!active) return;
    active = false;
    if (e.timeStamp - lastT > 80) velocity = 0;  // se ti eri fermata prima di lasciare, niente spinta
    if (moved) onEnd?.(velocity); else el.classList.remove('is-dragging');
  });
  // dopo un trascinamento il click non deve aprire link o immagini
  el.addEventListener('click', (e) => { if (moved) { e.preventDefault(); e.stopPropagation(); moved = false; } }, true);
}

// ---------- Caroselli dei progetti (infiniti, a scorrimento libero) ----------
// Trucco: le foto vengono ripetute (una serie di copie prima, due dopo).
// Quando ti avvicini a un bordo, il carosello salta di una serie intera: il salto non si vede e il giro sembra continuo.
document.querySelectorAll('.carousel').forEach((carousel) => {
  const track = carousel.querySelector('.track');
  const real = [...track.children];
  const n = real.length;
  real.forEach((el, i) => { el.dataset.i = i; });   // serve al lightbox per sapere quale foto è

  const clone = (el) => {
    const c = el.cloneNode(true);
    c.classList.add('clone');
    c.setAttribute('aria-hidden', 'true');
    c.removeAttribute('loading');
    return c;
  };
  track.prepend(...real.map(clone));
  track.append(...real.map(clone), ...real.map(clone));

  // larghezza di una serie di foto (si misura ogni volta: cambia mentre le immagini caricano)
  const setWidth = () => track.children[n].offsetLeft - track.children[0].offsetLeft;
  const wrapped = (x) => {
    const w = setWidth();
    if (!w) return x;
    if (x < w * 0.5) return x + w;
    if (x > w * 1.5) return x - w;
    return x;
  };
  const wrap = () => {
    const x = wrapped(track.scrollLeft);
    if (x !== track.scrollLeft) track.scrollLeft = x;
  };
  track.addEventListener('scroll', wrap, { passive: true });

  // posizione iniziale: la prima foto vera, finché l'utente non tocca il carosello
  let touched = false;
  const start = () => { if (!touched) track.scrollLeft = setWidth(); };
  ['pointerdown', 'wheel', 'touchstart'].forEach((ev) => track.addEventListener(ev, () => { touched = true; }, { passive: true }));
  start();
  [...track.children].forEach((el) => el.addEventListener(el.tagName === 'VIDEO' ? 'loadedmetadata' : 'load', start));
  window.addEventListener('load', start);
  window.addEventListener('resize', () => (touched ? wrap() : start()));

  // trascinamento col mouse; quando lasci continua per inerzia e rallenta piano
  let lastDx = 0, glide;
  dragToScroll(track, {
    onStart: () => { cancelAnimationFrame(glide); lastDx = 0; },
    onMove: (dx) => { track.scrollLeft -= dx - lastDx; lastDx = dx; },
    onEnd: (v) => {
      setTimeout(() => track.classList.remove('is-dragging'), 0);
      if (reduceMotion) return;
      let pos = track.scrollLeft, last = performance.now();
      const step = (now) => {
        const dt = Math.min(64, now - last); last = now;
        pos = wrapped(pos - v * dt);
        v *= Math.exp(-dt / 325);   // più alto = scivola più a lungo
        track.scrollLeft = pos;
        if (Math.abs(v) > 0.02) glide = requestAnimationFrame(step);
      };
      glide = requestAnimationFrame(step);
    },
  });
});

// ---------- Nastro artisti (CD player) ----------
// Scorre da solo e rallenta dolcemente all'hover. Si può trascinare: quando lasci continua per inerzia
// e poi torna piano alla velocità automatica. Infinito in entrambe le direzioni.
document.querySelectorAll('.marquee').forEach((marquee) => {
  const track = marquee.querySelector('.marquee-track');
  // ripete gli artisti finché riempiono il riquadro, poi duplica tutto: così il giro è continuo
  const original = track.innerHTML;
  while (track.scrollWidth < marquee.clientWidth * 1.5) track.innerHTML += original;
  track.innerHTML += track.innerHTML;

  const SPEED = 0.08;   // velocità automatica (px al millisecondo)
  const EASE = 200;     // morbidezza in ms: più alto = scivola più a lungo dopo che lasci
  const MAX = 4;        // velocità massima della spinta

  let pos = 1, vel = reduceMotion ? 0 : SPEED;
  let hovering = false, dragging = false, last = performance.now();
  const half = () => track.scrollWidth / 2;
  const wrap = (x) => { const h = half(); return ((x % h) + h) % h || 0.01; };

  marquee.addEventListener('mouseenter', () => { hovering = true; });
  marquee.addEventListener('mouseleave', () => { hovering = false; });

  let startPos = 0;
  dragToScroll(marquee, {
    onStart: () => { dragging = true; startPos = pos; vel = 0; },
    onMove: (dx) => { pos = wrap(startPos - dx); marquee.scrollLeft = pos; },
    onEnd: (v) => {
      dragging = false;
      vel = Math.max(-MAX, Math.min(MAX, -v));   // la spinta del gesto
      setTimeout(() => marquee.classList.remove('is-dragging'), 0);
    },
  });

  function tick(now) {
    const dt = Math.min(64, now - last); last = now;
    // se l'utente ha scrollato col trackpad, riparti da lì
    if (Math.abs(marquee.scrollLeft - pos) > 2) pos = marquee.scrollLeft;
    if (!dragging) {
      // la velocità si avvicina piano al suo obiettivo: ferma all'hover, SPEED altrimenti
      const target = hovering || reduceMotion ? 0 : SPEED;
      vel += (target - vel) * (1 - Math.exp(-dt / EASE));
      pos += vel * dt;
    }
    pos = wrap(pos);
    marquee.scrollLeft = pos;
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
});

// ---------- Lightbox: ogni immagine cliccata si apre a schermo intero ----------
// Le frecce scorrono le immagini dello stesso gruppo (collage, singolo carosello, libreria).
// Per mostrare una versione più grande nel lightbox: <img src="piccola.jpg" data-full="grande.jpg">
(() => {
  const icon = (d) => `<svg viewBox="0 0 16 16"><path d="${d}"/></svg>`;
  const lb = document.createElement('div');
  lb.className = 'lightbox';
  lb.innerHTML = `
    <img alt="">
    <video muted autoplay loop playsinline hidden></video>
    <button class="lb-btn lb-close" aria-label="Chiudi">${icon('M3 3l10 10M13 3L3 13')}</button>
    <button class="lb-btn lb-prev" aria-label="Precedente">${icon('M10 3L5 8l5 5')}</button>
    <button class="lb-btn lb-next" aria-label="Successiva">${icon('M6 3l5 5-5 5')}</button>`;
  document.body.appendChild(lb);
  const big = lb.querySelector('img');
  const bigVideo = lb.querySelector('video');
  let group = [], index = 0;

  // la foto aperta "vola" da dov'era nella pagina fino al centro dello schermo, e torna indietro quando chiudi
  const FLY = { duration: 450, easing: 'cubic-bezier(.2, .7, .2, 1)' };
  const media = () => (big.hidden ? bigVideo : big);
  const ready = (el) => (el.tagName === 'VIDEO'
    ? (el.readyState >= 1 ? Promise.resolve() : new Promise((r) => el.addEventListener('loadedmetadata', r, { once: true })))
    : el.decode().catch(() => {}));
  // movimento dalla posizione "from" (la foto piccola) a quella grande
  const flight = (el, from) => {
    const to = el.getBoundingClientRect();
    const dx = from.left + from.width / 2 - (to.left + to.width / 2);
    const dy = from.top + from.height / 2 - (to.top + to.height / 2);
    return [{ transform: `translate(${dx}px, ${dy}px) scale(${from.width / to.width})` }, { transform: 'none' }];
  };
  // la foto piccola è visibile? (nei caroselli può essere fuori dal riquadro)
  const onScreen = (el) => {
    const r = el.getBoundingClientRect();
    const box = el.closest('.track')?.getBoundingClientRect() || { left: 0, right: innerWidth };
    const x = r.left + r.width / 2;
    return r.width > 0 && r.bottom > 0 && r.top < innerHeight && x > box.left && x < box.right;
  };

  let shown = 0;
  const show = async (i) => {
    index = (i + group.length) % group.length;
    const el = group[index];
    const isVideo = el.tagName === 'VIDEO';
    const n = ++shown;
    big.hidden = isVideo;
    bigVideo.hidden = !isVideo;
    if (isVideo) { bigVideo.src = el.currentSrc || el.src; bigVideo.play(); }
    else { bigVideo.pause(); big.src = el.dataset.full || el.currentSrc || el.src; big.alt = el.alt; }
    const m = media();
    m.style.visibility = 'hidden';
    await ready(m);
    if (n !== shown) return false;   // nel frattempo hai già cliccato un'altra freccia
    const w = m.naturalWidth || m.videoWidth, h = m.naturalHeight || m.videoHeight;
    if (w && h) m.style.setProperty('--r', w / h);   // proporzioni della foto, usate dal CSS
    m.style.visibility = '';
    return true;
  };
  const open = async (imgs, i, from = imgs[i]) => {
    group = imgs;
    lb.classList.toggle('single', imgs.length < 2);
    lb.classList.add('is-visible', 'is-open');
    document.documentElement.classList.add('lb-lock');
    const start = from.getBoundingClientRect();
    if (await show(i) && !reduceMotion) media().animate(flight(media(), start), FLY);
  };
  const close = async () => {
    if (!lb.classList.contains('is-open')) return;
    lb.classList.remove('is-open');   // lo sfocato sparisce piano
    follow(0);
    const m = media(), el = group[index];
    const anim = !reduceMotion && onScreen(el)
      ? m.animate(flight(m, el.getBoundingClientRect()).reverse(), FLY)
      : m.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200 });
    await anim.finished;
    if (lb.classList.contains('is-open')) return;   // riaperta nel frattempo
    bigVideo.pause();
    lb.classList.remove('is-visible');
    document.documentElement.classList.remove('lb-lock');
  };

  // ---- cambiare foto: le foto stanno ferme, una si dissolve sfocandosi e l'altra compare allo stesso modo ----
  const FADE = [{ opacity: 1, filter: 'blur(0px)' }, { opacity: 0, filter: 'blur(12px)' }];   // 12px = quanto si sfoca
  let offset = 0;   // quanto è lungo il gesto in corso (la foto non si muove)
  const follow = (x) => { offset = x; };
  const snapBack = () => { offset = 0; };
  // dir = 1 foto successiva, -1 precedente.
  // Finché la nuova foto non ha finito di comparire, ogni altro comando viene ignorato.
  let busy = false;
  const slide = async (dir) => {
    offset = 0;
    if (busy || group.length < 2 || !lb.classList.contains('is-open')) return;
    busy = true;
    try {
      if (!reduceMotion) await media().animate(FADE, { duration: 250, easing: 'ease-in', fill: 'forwards' }).finished;
      big.getAnimations().forEach((a) => a.cancel());
      bigVideo.getAnimations().forEach((a) => a.cancel());
      if (await show(index + dir) && !reduceMotion) {
        await media().animate([...FADE].reverse(), { duration: 250, easing: 'ease-out' }).finished;
      }
    } catch {
      // animazione interrotta (per esempio hai chiuso la foto): niente da fare
    } finally {
      busy = false;
    }
  };

  lb.querySelector('.lb-close').addEventListener('click', close);
  lb.querySelector('.lb-prev').addEventListener('click', () => slide(-1));
  lb.querySelector('.lb-next').addEventListener('click', () => slide(1));
  let dragged = false;   // dopo un trascinamento il click non chiude
  lb.addEventListener('click', (e) => {
    if (dragged) { dragged = false; return; }
    if (e.target === lb) close();
  });
  document.addEventListener('keydown', (e) => {
    if (!lb.classList.contains('is-open')) return;
    if (e.key === 'Escape') close();
    if (e.key === 'ArrowLeft') slide(-1);
    if (e.key === 'ArrowRight') slide(1);
  });

  // gesto con dito o mouse (verso sinistra = foto successiva)
  let startX = null, lastX = 0, lastT = 0, speed = 0;
  lb.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.lb-btn') || !lb.classList.contains('is-open')) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    startX = lastX = e.clientX; lastT = e.timeStamp; speed = 0; dragged = false;
    if (e.pointerType === 'mouse') e.preventDefault();
  });
  window.addEventListener('pointermove', (e) => {
    if (startX === null) return;
    const dx = e.clientX - startX;
    if (Math.abs(dx) > 6) dragged = true;
    speed = (e.clientX - lastX) / Math.max(1, e.timeStamp - lastT);   // px al millisecondo
    lastX = e.clientX; lastT = e.timeStamp;
    if (dragged) follow(dx);
  });
  const release = () => {
    if (startX === null) return;
    startX = null;
    if (!dragged) return;
    // gesto abbastanza lungo, o veloce: cambia foto
    if (Math.abs(offset) > 60 || Math.abs(speed) > 0.5) slide(offset < 0 ? 1 : -1);   // 60 = px di trascinamento per cambiare foto
    else snapBack();
  };
  window.addEventListener('pointerup', release);
  window.addEventListener('pointercancel', release);

  // trackpad: scorrimento orizzontale con due dita. Ogni gesto cambia una sola foto.
  // Dopo un cambio foto il trackpad continua a mandare il resto del gesto e la sua inerzia: tutto ignorato.
  // Un gesto nuovo si riconosce così: il movimento è prima calato (dita ferme o staccate) e poi riparte,
  // oppure va nel verso opposto.
  let wheelEnd, wheelLocked = false, lockDir = 0, peak = 0, minDelta = 0, lockedAt = 0;
  lb.addEventListener('wheel', (e) => {
    e.preventDefault();   // la pagina sotto non deve scorrere
    if (!lb.classList.contains('is-open')) return;
    const d = e.deltaX, a = Math.abs(d);
    if (a < Math.abs(e.deltaY)) return;
    clearTimeout(wheelEnd);
    wheelEnd = setTimeout(() => { wheelLocked = false; snapBack(); }, 150);   // pausa: il gesto è finito
    if (wheelLocked) {
      peak = Math.max(peak, a);
      minDelta = Math.min(minDelta, a);
      const restarted = minDelta <= peak / 3 && a > minDelta + 3;
      const reversed = Math.sign(d) !== lockDir;
      if (!(restarted || reversed) || e.timeStamp - lockedAt < 150) return;
      wheelLocked = false;
      snapBack();
    }
    if (busy) return;   // la foto sta ancora cambiando
    follow(offset - d);
    if (Math.abs(offset) > 80) {   // 80 = lunghezza del gesto sul trackpad
      wheelLocked = true; lockDir = Math.sign(d); peak = minDelta = a; lockedAt = e.timeStamp;
      slide(offset < 0 ? 1 : -1);
    }
  }, { passive: false });

  // collage e libreria: si apre l'immagine cliccata
  document.querySelectorAll('.collage, .shelf').forEach((container) => {
    const imgs = [...container.querySelectorAll('img')];
    imgs.forEach((img, i) => img.addEventListener('click', () => open(imgs, i)));
  });

  // caroselli: si apre la foto (o il video) cliccata (un trascinamento non conta come click)
  document.querySelectorAll('.carousel .track').forEach((track) => {
    const items = [...track.children].filter((el) => !el.classList.contains('clone'));
    track.addEventListener('click', (e) => {
      const el = e.target.closest('img, video');
      if (el && track.contains(el)) open(items, Number(el.dataset.i), el);
    });
  });
})();
