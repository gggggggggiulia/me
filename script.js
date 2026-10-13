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

// ---------- Caroselli dei progetti (infiniti) ----------
// Trucco: una copia dell'ultima foto va all'inizio e una della prima alla fine.
// Quando arrivi su una copia, il carosello salta senza animazione sulla foto vera: il giro sembra continuo.
document.querySelectorAll('.carousel').forEach((carousel) => {
  const track = carousel.querySelector('.track');
  const counter = carousel.querySelector('.counter');
  const real = [...track.children];
  const total = real.length;
  const loop = total > 1;

  if (loop) {
    const clone = (el) => {
      const c = el.cloneNode(true);
      c.classList.add('clone');
      c.setAttribute('aria-hidden', 'true');
      c.removeAttribute('loading');
      return c;
    };
    track.prepend(clone(real[total - 1]));
    track.append(clone(real[0]));
  }
  const slides = [...track.children];
  const offset = loop ? 1 : 0;   // la prima foto vera è in posizione 1
  const width = () => track.clientWidth;
  const raw = () => Math.round(track.scrollLeft / width());
  const jump = (i) => { track.style.scrollSnapType = 'none'; track.scrollLeft = i * width(); track.style.scrollSnapType = ''; };

  const update = () => {
    const i = raw();
    if (counter) counter.textContent = loop ? `${((i - offset + total) % total) + 1} / ${total}` : '';
    // l'altezza del carosello segue quella della foto visibile
    const h = slides[Math.min(i, slides.length - 1)].getBoundingClientRect().height;
    if (h) track.style.height = h + 'px';
  };
  // se sei su una copia, salta alla foto vera corrispondente
  const wrap = () => {
    if (!loop || track.classList.contains('is-dragging')) return;
    const i = raw();
    if (i <= 0) jump(total);
    else if (i >= total + 1) jump(1);
  };

  let settle;
  track.addEventListener('scroll', () => {
    update();
    clearTimeout(settle);
    settle = setTimeout(wrap, 120);   // aspetta che lo scorrimento si fermi
  }, { passive: true });

  slides.forEach((el) => el.addEventListener(el.tagName === 'VIDEO' ? 'loadedmetadata' : 'load', update));
  window.addEventListener('resize', () => { jump(raw()); update(); });

  let startScroll = 0;
  dragToScroll(track, {
    onStart: () => { startScroll = track.scrollLeft; },
    onMove: (dx) => { track.scrollLeft = startScroll - dx; },
    onEnd: (v) => {
      // la velocità proietta il gesto in avanti: un trascinamento veloce salta più foto
      const projected = track.scrollLeft - v * 260;
      const target = Math.max(0, Math.min(slides.length - 1, Math.round(projected / width())));
      track.scrollTo({ left: target * width(), behavior: 'smooth' });
      setTimeout(() => { track.classList.remove('is-dragging'); wrap(); }, 450);
    },
  });

  // posizione iniziale sulla prima foto vera (ripetuta quando la pagina ha finito di caricare)
  const start = () => { if (raw() === 0) jump(offset); update(); };
  start();
  requestAnimationFrame(start);
  window.addEventListener('load', start);
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

  const show = (i) => {
    index = (i + group.length) % group.length;
    const el = group[index];
    const isVideo = el.tagName === 'VIDEO';
    big.hidden = isVideo;
    bigVideo.hidden = !isVideo;
    if (isVideo) { bigVideo.src = el.currentSrc || el.src; bigVideo.play(); }
    else { bigVideo.pause(); big.src = el.dataset.full || el.currentSrc || el.src; big.alt = el.alt; }
  };
  const open = (imgs, i) => {
    group = imgs;
    lb.classList.toggle('single', imgs.length < 2);
    show(i);
    lb.classList.add('is-open');
    document.documentElement.classList.add('lb-lock');
  };
  const close = () => {
    bigVideo.pause();
    lb.classList.remove('is-open');
    document.documentElement.classList.remove('lb-lock');
  };

  lb.querySelector('.lb-close').addEventListener('click', close);
  lb.querySelector('.lb-prev').addEventListener('click', () => show(index - 1));
  lb.querySelector('.lb-next').addEventListener('click', () => show(index + 1));
  lb.addEventListener('click', (e) => { if (e.target === lb) close(); });
  document.addEventListener('keydown', (e) => {
    if (!lb.classList.contains('is-open')) return;
    if (e.key === 'Escape') close();
    if (e.key === 'ArrowLeft') show(index - 1);
    if (e.key === 'ArrowRight') show(index + 1);
  });

  // swipe sul telefono
  let touchX = null;
  lb.addEventListener('touchstart', (e) => { touchX = e.touches[0].clientX; }, { passive: true });
  lb.addEventListener('touchend', (e) => {
    if (touchX === null) return;
    const dx = e.changedTouches[0].clientX - touchX;
    if (Math.abs(dx) > 50) show(index + (dx < 0 ? 1 : -1));
    touchX = null;
  });

  // collage e libreria: si apre l'immagine cliccata
  document.querySelectorAll('.collage, .shelf').forEach((container) => {
    const imgs = [...container.querySelectorAll('img')];
    imgs.forEach((img, i) => img.addEventListener('click', () => open(imgs, i)));
  });

  // caroselli: si apre la foto (o il video) visibile (un trascinamento non conta come click)
  document.querySelectorAll('.carousel .track').forEach((track) => {
    const items = [...track.children].filter((el) => !el.classList.contains('clone'));
    const offset = items.length > 1 ? 1 : 0;
    track.addEventListener('click', () => {
      const i = Math.round(track.scrollLeft / track.clientWidth) - offset;
      open(items, (i + items.length) % items.length);
    });
  });
})();