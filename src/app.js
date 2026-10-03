/* ============================================================
   XIKS COLLECTION — app.js
   Vanilla JS. 3D tilt engine, real 3D carousels, cart, motion.
   ============================================================ */
(() => {
  'use strict';
  const $  = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => [...c.querySelectorAll(s)];
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const lerp = (a, b, t) => a + (b - a) * t;
  const money = n => 'Rs ' + Number(n).toLocaleString('en-US');

  /* ---- boutique settings: edit these two lines when you have them ---- */
  const WHATSAPP = '923554822878';                       // Pakistan country code, no + or spaces
  const FACEBOOK = '';                                   // e.g. 'https://www.facebook.com/your.page'
  const INSTAGRAM = 'https://www.instagram.com/xiks.collection';

  /* ---------------- catalog ---------------- */
  const CATALOG = [
    { id:'p1', name:'Xiks Track Pant — Black',      cat:'Track Pants', price:2800, was:null,  badge:'Bestseller',
      img:'p1', note:'Unisex fit, contrast side stripe — comfort meets street style', rating:4.9, colors:['#1B1B1B','#F2F2F2','#9AA0A6'] },
    { id:'p2', name:'GLNZ Track Set',               cat:'Tracksuits',  price:4900, was:null,  badge:'New',
      img:'p2', note:'Full set — zip jacket + trouser, everyday street fit', rating:4.8, colors:['#171717','#EDEDED','#8E8E8E'] },
    { id:'p3', name:'Track Pant — Three Colours',   cat:'Track Pants', price:2800, was:null,  badge:'',
      img:'p3', note:'Red, white or black — brushed inner, zip pockets', rating:4.8, colors:['#C0392B','#F5F5F5','#1B1B1B'] },
    { id:'p4', name:'2-in-1 Jacket — Grey',         cat:'Jackets',     price:7500, was:null,  badge:'Winter Ready',
      img:'p4', note:'Two layers: waterproof shell + inner — wear together or alone', rating:4.9, colors:['#6B7280','#2F3B4C'] },
    { id:'p5', name:'2-Piece Jacket Set',           cat:'Sets',        price:8900, was:null,  badge:'',
      img:'p5', note:'Jacket + trouser set, water-resistant, built for the outdoors', rating:4.9, colors:['#4B5563','#3B6EA5'] },
    { id:'p6', name:"Men's Winter Sweater",         cat:'Sweaters',    price:3600, was:null,  badge:'Bestseller',
      img:'p6', note:'Blue, black or grey — warm enough for a Hunza winter', rating:4.9, colors:['#2E4A7D','#1B1B1B','#8D8D8D'] },
    { id:'p7', name:'Xiks 2-in-1 Jacket — Black',   cat:'Jackets',     price:7500, was:null,  badge:'',
      img:'p7', note:'Hooded shell, sleeve pocket, windproof — our flagship', rating:5.0, colors:['#141414','#2F3B4C'] },
    { id:'p8', name:'Winter Jacket — 3 Colours',    cat:'Jackets',     price:6900, was:8200,  badge:'Sale',
      img:'p8', note:'Black, cream or beige — padded, lightweight, everyday warm', rating:4.8, colors:['#1B1B1B','#E8DFCB','#D9C7A0'] },
    { id:'p9', name:'Heavy 2-in-1 Jacket',          cat:'Jackets',     price:8200, was:null,  badge:'Winter Ready',
      img:'p9', note:'Two layers, fully waterproof — summer shell, winter coat', rating:5.0, colors:['#1B1B1B','#232F45','#7A7A7A'] }
  ];

  const path = n => `assets/images/${n}.webp`;

  /* ---------------------------------------------------------------
     Live data — when the site is served by the store server the
     catalogue, settings and orders come from the API, so anything
     changed in /admin appears here immediately. Opened as a plain
     file (or on a static host) it falls back to the values baked
     into this file.
     --------------------------------------------------------------- */
  const API = (() => { try { return new URL('api/', location.href).href; } catch { return null; } })();
  let LIVE = false;
  let SETTINGS = { whatsapp:'', facebook:'', instagram:INSTAGRAM,
                   deliveryNote:'Courier across Pakistan in 3–5 days · cash on delivery',
                   freeOver:0 };
  const imgSrc = p => {
    const s = (p && p.img) || '';
    return /^(https?:|assets\/|uploads\/)/.test(s) ? s : path(s);
  };
  async function loadLive() {
    if (!API) return;
    try {
      const r = await fetch(API + 'products', { headers: { Accept: 'application/json' } });
      if (!r.ok) return;
      const data = await r.json();
      if (!Array.isArray(data.products) || !data.products.length) return;
      CATALOG.length = 0;
      data.products.forEach(p => CATALOG.push({
        id: p.id, name: p.name, cat: p.cat, price: Number(p.price) || 0,
        was: p.was || null, badge: p.badge || '', note: p.note || '',
        rating: Number(p.rating) || 5, colors: p.colors || [], img: p.image,
      }));
      if (data.settings) SETTINGS = Object.assign(SETTINGS, data.settings);
      LIVE = true;
    } catch { /* offline / static — keep the built-in catalogue */ }
  }

  /* ---------------- toast ---------------- */
  const toastEl = $('#toast');
  let toastTimer;
  const toast = msg => {
    toastEl.textContent = msg;
    toastEl.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('on'), 2400);
  };

  /* ---------------- cart ---------------- */
  const CART_KEY = 'xiks.cart.v1';
  let cart = [];
  try { cart = JSON.parse(localStorage.getItem(CART_KEY)) || []; } catch (e) { cart = []; }
  const saveCart = () => { try { localStorage.setItem(CART_KEY, JSON.stringify(cart)); } catch (e) {} };

  const countEl = $('#bagCount');
  const bodyEl  = $('#drawerBody');
  const subEl   = $('#subtotal');

  function renderCart() {
    const qty = cart.reduce((s, i) => s + i.qty, 0);
    countEl.textContent = qty;
    countEl.classList.toggle('on', qty > 0);
    const sub = cart.reduce((s, i) => s + i.price * i.qty, 0);

    if (!cart.length) {
      bodyEl.innerHTML = `<p class="empty">Your bag is empty.<br><span style="font-size:14px;font-family:var(--sans);color:var(--ink-soft)">Add a piece from the collection.</span></p>`;
    } else {
      bodyEl.innerHTML = cart.map((i, ix) => `
        <div class="ci">
          <img src="${imgSrc(i)}" alt="${i.name}">
          <div>
            <div class="n">${i.name}</div>
            <div class="m">${i.cat}${i.size ? ' · Size ' + i.size : ''} · ${money(i.price)}</div>
            <div class="qty">
              <button data-q="-1" data-i="${ix}" aria-label="Decrease quantity">−</button>
              <span>${i.qty}</span>
              <button data-q="1" data-i="${ix}" aria-label="Increase quantity">+</button>
            </div>
          </div>
          <button class="rm" data-rm="${ix}">Remove</button>
        </div>`).join('');
    }
    subEl.innerHTML = `<b>${money(sub)}</b>`;
    saveCart();
  }

  function addToCart(id, size, qty = 1) {
    const p = CATALOG.find(x => x.id === id);
    const key = id + (size || '');
    const found = cart.find(i => i.id + (i.size || '') === key);
    if (found) found.img = imgSrc(p);          // refresh path in case the photo changed
    if (found) found.qty += qty;
    else cart.push({ id: p.id, name: p.name, cat: p.cat, price: p.price, img: imgSrc(p), size: size || null, qty });
    renderCart();
    openDrawer();
    toast(`${p.name} added`);
  }

  bodyEl.addEventListener('click', e => {
    const q = e.target.closest('[data-q]');
    const r = e.target.closest('[data-rm]');
    if (q) {
      const i = +q.dataset.i, d = +q.dataset.q;
      cart[i].qty += d;
      if (cart[i].qty < 1) cart.splice(i, 1);
      renderCart();
    }
    if (r) { cart.splice(+r.dataset.rm, 1); renderCart(); }
  });

  /* ---------------- drawer ---------------- */
  const drawer = $('#drawer'), scrim = $('#scrim');
  const openDrawer  = () => { drawer.classList.add('on'); scrim.classList.add('on'); document.body.classList.add('locked'); };
  const closeDrawer = () => { drawer.classList.remove('on'); scrim.classList.remove('on'); document.body.classList.remove('locked'); };
  $('#bagBtn').addEventListener('click', openDrawer);
  $('#drawerClose').addEventListener('click', closeDrawer);
  scrim.addEventListener('click', closeDrawer);
  const orderText = () => {
    const lines = cart.map(i => `• ${i.name}${i.size ? ' (' + i.size + ')' : ''} × ${i.qty}`).join('\n');
    const total = money(cart.reduce((s, i) => s + i.price * i.qty, 0));
    return `Assalam-o-Alaikum! I'd like to order from Xiks Collection:\n${lines}\n\nTotal: ${total}`;
  };

  /* ---------- checkout modal ---------- */
  const coScrim = $('#coScrim');
  const coSummary = () => {
    const sub = cart.reduce((s, i) => s + i.price * i.qty, 0);
    const freeOver = Number(SETTINGS.freeOver || 0);
    const del = freeOver > 0 && sub >= freeOver ? 0 : 0;
    $('#coSummary').innerHTML =
      cart.map(i => `<div class="r"><span>${i.name}${i.size ? ' · ' + i.size : ''} × ${i.qty}</span><span>${money(i.price * i.qty)}</span></div>`).join('') +
      `<div class="r"><span>Delivery</span><span>${del ? money(del) : (freeOver && sub >= freeOver ? 'Free' : 'Confirmed on contact')}</span></div>
       <div class="r tot"><span>Total</span><b>${money(sub + del)}</b></div>`;
    return { sub, del };
  };
  function openCheckout() {
    if (!cart.length) return toast('Your bag is empty');
    closeDrawer();
    $('#coDone').classList.add('hide');
    $('.co-form').classList.remove('hide');
    $('#coMsg').textContent = '';
    coSummary();
    coScrim.classList.add('on');
    document.body.classList.add('locked');
    $('#co_name').focus();
  }
  const closeCheckout = () => { coScrim.classList.remove('on'); document.body.classList.remove('locked'); };
  $('#checkoutGo').addEventListener('click', openCheckout);
  $('#coCancel').addEventListener('click', closeCheckout);
  coScrim.addEventListener('click', e => { if (e.target === coScrim) closeCheckout(); });

  async function submitOrder() {
    const name = $('#co_name').value.trim(), phone = $('#co_phone').value.trim();
    const city = $('#co_city').value.trim(), address = $('#co_address').value.trim();
    if (!name || !phone || !city || !address) { $('#coMsg').textContent = 'Please fill in name, phone, city and address.'; return; }
    if (phone.replace(/\D/g, '').length < 10) { $('#coMsg').textContent = 'That phone number looks too short.'; return; }

    const { sub, del } = coSummary();
    const payload = {
      items: cart.map(i => ({ id: i.id, size: i.size, qty: i.qty })),
      customer: { name, phone, city, address, notes: $('#co_notes').value.trim() },
      delivery: del, channel: 'website',
    };
    const btn = $('#coSubmit'); const label = btn.querySelector('span').textContent;
    btn.querySelector('span').textContent = 'Placing order…'; btn.disabled = true;

    const res = await placeOrder(payload);
    btn.querySelector('span').textContent = label; btn.disabled = false;

    if (res.ok) {
      cart = []; renderCart(); saveCart();
      showConfirmation(res);
    } else if (res.offline) {
      /* opened as a plain file / static host — fall back to DM + WhatsApp with the details written out */
      const txt = orderText() + `\n\nName: ${name}\nPhone: ${phone}\nCity: ${city}\nAddress: ${address}` +
                  ($('#co_notes').value.trim() ? `\nNote: ${$('#co_notes').value.trim()}` : '');
      navigator.clipboard?.writeText(txt);
      const wa = SETTINGS.whatsapp || '';
      window.open(wa ? `https://wa.me/${wa}?text=${encodeURIComponent(txt)}` : SETTINGS.instagram, '_blank', 'noopener');
      $('#coMsg').textContent = 'This copy of the site is not connected to the order system — your details are copied, just paste them in the chat.';
    } else {
      $('#coMsg').textContent = res.error || 'Could not place the order.';
    }
  }
  /* sandboxed preview panes block form submits — the button drives it directly */
  $('#coSubmit').addEventListener('click', () => submitOrder());
  $('#coForm').addEventListener('submit', e => { e.preventDefault(); submitOrder(); });

  function showConfirmation(o) {
    $('.co-form').classList.add('hide');
    const note = SETTINGS.deliveryNote || 'Courier across Pakistan in 3–5 days · cash on delivery available';
    $('#coDone').innerHTML = `
      <div class="tick">✓</div>
      <div class="p-cat">Order placed</div>
      <div class="co-ref" id="coRef">${o.ref}</div>
      <p>Your order number is <b>${o.ref}</b>. Save it — you can check progress any time on the tracking page.
         We'll confirm on WhatsApp before dispatch. Total <b>${money(o.total)}</b>.</p>
      <p style="font-size:13px">${note}</p>
      <div class="acts">
        <a class="btn" href="track.html?ref=${encodeURIComponent(o.ref)}"><span>Track this order</span>
          <svg viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6"/></svg></a>
        <button class="btn ghost" id="coCopy"><span>Copy order number</span></button>
        <button class="btn ghost" id="coClose"><span>Done</span></button>
      </div>`;
    $('#coDone').classList.remove('hide');
    $('#coCopy').onclick = () => navigator.clipboard?.writeText(o.ref).then(() => toast('Order number copied'));
    $('#coClose').onclick = closeCheckout;
  }

  /* ------------------------------------------------ send the order in */
  async function placeOrder(payload) {
    if (!API) return { ok: false, offline: true };
    try {
      const r = await fetch(API + 'orders', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await r.json().catch(() => ({}));
      if (r.ok) return { ok: true, ...data };
      return { ok: false, error: data.error || 'Could not place the order' };
    } catch { return { ok: false, offline: true }; }
  }

  function configureSocialLinks() {
    $$('[data-social]').forEach(a => {
      const kind = a.dataset.social;
      const wa = SETTINGS.whatsapp || WHATSAPP, fb = SETTINGS.facebook || FACEBOOK;
      const url = kind === 'whatsapp' ? (wa ? `https://wa.me/${wa}` : '') :
        kind === 'facebook' ? fb : INSTAGRAM;
      if (url) {
        a.href = url;
        a.target = '_blank';
        a.rel = 'noopener';
        a.onclick = null;
      } else {
        a.href = '#';
        a.removeAttribute('target');
        a.removeAttribute('rel');
        a.onclick = event => {
          event.preventDefault();
          toast(kind === 'whatsapp'
            ? 'Add a WhatsApp number in Admin → Settings.'
            : 'Add this link in src/app.js');
        };
      }
    });
  }
  configureSocialLinks();

  /* ---------------- product grid ---------------- */
  const grid = $('#grid');
  const CATS = ['All', 'Jackets', 'Track Pants', 'Tracksuits', 'Sweaters', 'Sets'];
  const filterBar = $('#filters');

  function stars(r) { const full = Math.round(r); return '★'.repeat(full) + '☆'.repeat(5 - full); }

  function cardHTML(p, ix) {
    return `
      <article class="p-card" data-cat="${p.cat}" data-product="${p.id}" tabindex="0" role="group" aria-label="View details for ${p.name}" style="animation-delay:${(ix % 8) * 60}ms">
        <div class="p-media tilt">
          ${p.badge ? `<span class="p-badge ${p.was ? 'sale' : ''}">${p.badge}</span>` : ''}
          <img src="${imgSrc(p)}" alt="${p.name}" loading="lazy" decoding="async">
          <div class="p-actions">
            <button class="mini" data-add="${p.id}">Add to bag</button>
            <button class="mini" data-view="${p.id}">Quick view</button>
          </div>
        </div>
        <div class="p-body">
          <div class="p-cat">${p.cat}</div>
          <h3 class="p-name">${p.name}</h3>
          <div class="p-foot">
            <div class="p-price">${p.was ? `<s>${money(p.was)}</s>` : ''}${money(p.price)}</div>
            <div class="dots">${p.colors.map(c => `<i class="dot" style="background:${c}"></i>`).join('')}</div>
          </div>
          <div class="stars" title="${p.rating} out of 5">${stars(p.rating)} <span style="color:var(--taupe-deep);font-family:var(--sans);font-size:10.5px;letter-spacing:.1em">${p.rating.toFixed(1)}</span></div>
        </div>
      </article>`;
  }
  const renderGrid = () => { grid.innerHTML = CATALOG.map(cardHTML).join(''); };

  function buildFilters() {
    const cats = [...new Set(CATALOG.map(p => p.cat))];
    filterBar.innerHTML = ['All', ...cats]
      .map((c, i) => `<button class="chip${i === 0 ? ' on' : ''}" data-f="${c}">${c}</button>`).join('');
  }

  /* ---------- popular categories: one circle per category ----------
     The circles are drawn from the catalogue itself, so a category an owner adds in
     the admin panel appears here on its own, wearing the photo of its first piece.
     Tapping one filters the collection exactly like the chips do. */
  const catRow = $('#catRow');
  function buildCategories() {
    if (!catRow) return;
    const seen = new Map();
    CATALOG.forEach(p => { if (p.cat && !seen.has(p.cat)) seen.set(p.cat, p); });
    catRow.innerHTML = [...seen.entries()].slice(0, 8).map(([cat, first]) => `
      <button class="cat" data-cat="${cat}" role="listitem" aria-label="Show ${cat}">
        <span class="cat-pic"><img src="${imgSrc(first)}" alt="${cat}" loading="lazy" decoding="async"></span>
        <span class="cat-label">${cat}</span>
      </button>`).join('');
  }
  catRow?.addEventListener('click', e => {
    const b = e.target.closest('[data-cat]'); if (!b) return;
    applyFilter(b.dataset.cat, true);
  });

  /* the one place that decides what the grid shows — chips, circles and the
     "shop the winter drop" button all come through here */
  function applyFilter(f, scroll) {
    $$('.chip', filterBar).forEach(c => c.classList.toggle('on', c.dataset.f === f));
    $$('.p-card').forEach((card, i) => {
      const show = f === 'All' || card.dataset.cat === f;
      card.classList.toggle('hide', !show);
      if (show) { card.style.animation = 'none'; void card.offsetWidth; card.style.animation = `cardIn .7s var(--ease-out) ${i * 45}ms backwards`; }
    });
    if (!scroll) return;
    const target = $('#collection');
    if (target) target.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
  }
  filterBar.addEventListener('click', e => {
    const b = e.target.closest('[data-f]'); if (!b) return;
    applyFilter(b.dataset.f, false);
  });

  grid.addEventListener('click', e => {
    const a = e.target.closest('[data-add]');
    const v = e.target.closest('[data-view]');
    if (a) { addToCart(a.dataset.add, null); return; }
    if (v) { openModal(v.dataset.view); return; }
    if (e.target.closest('button, a, input, select, textarea')) return;
    const card = e.target.closest('.p-card');
    if (card) openModal(card.dataset.product);
  });
  grid.addEventListener('keydown', e => {
    const card = e.target.closest('.p-card');
    if (!card || e.target !== card || (e.key !== 'Enter' && e.key !== ' ')) return;
    e.preventDefault();
    openModal(card.dataset.product);
  });

  /* ---------------- quick view modal ---------------- */
  const mScrim = $('#modalScrim'), modal = $('#modal');
  let mSize = null;

  function openModal(id) {
    const p = CATALOG.find(x => x.id === id);
    mSize = null;
    modal.innerHTML = `
      <button class="close-x" aria-label="Close" id="mClose">
        <svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>
      </button>
      <div class="modal-img"><img src="${imgSrc(p)}" alt="${p.name}"></div>
      <div class="modal-info">
        <div class="p-cat">${p.cat} ${p.badge ? '· ' + p.badge : ''}</div>
        <h3 style="font-size:clamp(26px,3.4vw,38px)">${p.name}</h3>
        <div class="stars">${stars(p.rating)} <span style="color:var(--taupe-deep);font-family:var(--sans);font-size:11px;letter-spacing:.1em">${p.rating.toFixed(1)} · 27 reviews</span></div>
        <p style="color:var(--ink-soft);font-size:14.5px">${p.note}. Checked by hand in Hussaini before it ships — courier across Pakistan in 3–5 days, cash on delivery available.</p>
        <div class="p-price" style="font-size:26px">${p.was ? `<s>${money(p.was)}</s>` : ''}${money(p.price)}</div>
        <div>
          <div class="p-cat" style="margin-bottom:10px">Size</div>
          <div class="sizes" id="sizeBox">
            ${['XS','S','M','L','XL','Custom'].map(s => `<button data-s="${s}">${s}</button>`).join('')}
          </div>
        </div>
        <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:6px">
          <button class="btn" id="mAdd"><span>Add to bag</span></button>
          <a class="btn ghost" href="https://www.instagram.com/xiks.collection" target="_blank" rel="noopener"><span>Ask on Instagram</span></a>
        </div>
        <div style="border-top:1px solid var(--line);padding-top:16px;display:grid;gap:9px;font-size:13px;color:var(--ink-soft)">
          <div>✓ Courier across Pakistan in 3–5 days</div>
          <div>✓ Cash on delivery available</div>
          <div>✓ DM us for sizing help — we reply same day</div>
        </div>
      </div>`;
    mScrim.classList.add('on');
    document.body.classList.add('locked');
    $('#mClose').onclick = closeModal;
    $('#sizeBox').addEventListener('click', e => {
      const b = e.target.closest('[data-s]'); if (!b) return;
      mSize = b.dataset.s;
      $$('#sizeBox button').forEach(x => x.classList.toggle('on', x === b));
    });
    $('#mAdd').onclick = () => { addToCart(p.id, mSize); closeModal(); };
  }
  const closeModal = () => { mScrim.classList.remove('on'); document.body.classList.remove('locked'); };
  mScrim.addEventListener('click', e => { if (e.target === mScrim) closeModal(); });
  addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    closeModal(); closeDrawer();
    $('#sheet').classList.remove('on'); document.body.classList.remove('locked');
  });

  /* ---------------- 3D tilt engine (single rAF loop) ---------------- */
  const pointers = new Map();
  let heroTarget = { x: 0, y: 0 }, heroNow = { x: 0, y: 0 };
  const heroStage = $('#stageIn');

  document.addEventListener('pointermove', e => {
    const el = e.target.closest?.('.tilt, .ig-grid a, .map-card');
    if (el) {
      const r = el.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
      el.style.setProperty('--mx', (px * 100).toFixed(1) + '%');
      el.style.setProperty('--my', (py * 100).toFixed(1) + '%');
      if (!reduced) el.style.transform =
        `perspective(900px) rotateY(${(px - .5) * 13}deg) rotateX(${-(py - .5) * 13}deg) translateZ(18px)`;
      el.style.transition = 'transform .12s linear';
    }
    // hero camera
    const hw = innerWidth, hh = innerHeight;
    heroTarget.x = (e.clientX / hw - .5);
    heroTarget.y = (e.clientY / hh - .5);
  }, { passive: true });

  document.addEventListener('pointerout', e => {
    const el = e.target.closest?.('.tilt, .ig-grid a, .map-card');
    if (el && !el.contains(e.relatedTarget)) {
      el.style.transition = 'transform .7s var(--ease)';
      el.style.transform = '';
    }
  }, { passive: true });

  let scrollY = 0, scrollNow = 0;
  addEventListener('scroll', () => { scrollY = window.scrollY; }, { passive: true });

  const progress = $('#progress'), totop = $('#totop'), header = $('#hdr');

  function frame() {
    heroNow.x = lerp(heroNow.x, heroTarget.x, .06);
    heroNow.y = lerp(heroNow.y, heroTarget.y, .06);
    scrollNow = lerp(scrollNow, scrollY, .1);

    if (heroStage && !reduced) {
      const ry = heroNow.x * 22;
      const rx = -heroNow.y * 16;
      // scroll = camera pulls back into depth
      const sp = Math.min(scrollNow / 700, 1);
      const z = -sp * 320, sc = 1 - sp * .12, ty = sp * 90, rz = sp * -7;
      heroStage.style.transform =
        `rotateY(${ry + rz}deg) rotateX(${rx + sp * 6}deg) translate3d(${heroNow.x * -22}px, ${heroNow.y * -14 + ty}px, ${z}px) scale(${sc})`;
      heroStage.style.opacity = String(1 - sp * .75);
    }
    // parallax satellites / floating text depth
    const winH = innerHeight;
    $$('[data-depth]').forEach(el => {
      const r = el.getBoundingClientRect();
      if (r.bottom < -200 || r.top > winH + 200) return;
      const mid = r.top + r.height / 2 - winH / 2;
      const d = parseFloat(el.dataset.depth);
      el.style.transform = `translate3d(${heroNow.x * d * -46}px, ${(-mid * d * .045) + heroNow.y * d * -22}px, 0)`;
    });

    // ui state
    if (progress) progress.style.width = (scrollY / Math.max(1, document.body.scrollHeight - winH) * 100).toFixed(2) + '%';
    header?.classList.toggle('scrolled', scrollY > 40);
    totop?.classList.toggle('on', scrollY > 800);

    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  totop?.addEventListener('click', () => scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' }));

  /* ---------------- reveal on scroll ---------------- */
  const io = new IntersectionObserver(entries => {
    entries.forEach(en => {
      if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); }
    });
  }, { threshold: .16, rootMargin: '0px 0px -8% 0px' });
  $$('.reveal, .kinetic, .count').forEach(el => io.observe(el));

  // split kinetic headings into 3D words (keeps <em> italics)
  $$('.kinetic').forEach(el => {
    const raw = el.innerHTML.trim().replace(/<em[^>]*>/g, '\u0001').replace(/<\/em>/g, '\u0002');
    el.innerHTML = raw.split(/\s+/).map((w, i) => {
      const isEm = w.indexOf('\u0001') > -1;
      const clean = w.replace(/[\u0001\u0002]/g, '');
      return `<span class="kw" style="--d:${i * 90}ms">${isEm ? '<em>' + clean + '</em>' : clean}</span>`;
    }).join(' ');
  });

  /* ---------------- counters ---------------- */
  const cio = new IntersectionObserver(es => {
    es.forEach(e => {
      if (!e.isIntersecting) return;
      const el = e.target, to = parseFloat(el.dataset.to), dec = el.dataset.dec ? +el.dataset.dec : 0;
      let t0 = null;
      const step = ts => {
        if (!t0) t0 = ts;
        const k = Math.min((ts - t0) / 1400, 1);
        const e2 = 1 - Math.pow(1 - k, 3);
        el.textContent = (to * e2).toFixed(dec);
        if (k < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
      cio.unobserve(el);
    });
  }, { threshold: .6 });
  $$('.count').forEach(el => cio.observe(el));

  /* ---------------- lookbook 3D ring ---------------- */
  const LOOKS = [
    { img:'hero', cap:'Xiks 2-in-1 Jacket' },
    { img:'p4',   cap:'Two layers, one jacket' },
    { img:'p1',   cap:'Track Pant — Black' },
    { img:'p6',   cap:"Men's Winter Sweater" },
    { img:'p2',   cap:'GLNZ Track Set' },
    { img:'p8',   cap:'Winter Jacket · 3 colours' },
    { img:'p5',   cap:'2-Piece Jacket Set' },
    { img:'p9',   cap:'Heavy 2-in-1 — waterproof' }
  ];
  const ring = $('#ring');
  const N = LOOKS.length;
  let step = 360 / N, radius = 420, angle = 0, autoT;

  function sizeRing() {
    const w = ring.parentElement.getBoundingClientRect().width;
    const itemW = Math.min(Math.max(w * .17, 150), 232);
    radius = Math.max(itemW * 1.75, w * .34);
    step = 360 / N;
    $$('.ring-item', ring).forEach((el, i) => {
      el.style.width = itemW + 'px';
      el.style.transform = `translate(-50%,-50%) rotateY(${i * step}deg) translateZ(${radius}px)`;
    });
  }
  ring.innerHTML = LOOKS.map((l, i) => `
    <figure class="ring-item" data-i="${i}" style="transition-delay:${i * 20}ms">
      <img src="${path(l.img)}" alt="${l.cap}" loading="lazy">
      <figcaption class="cap">${l.cap}</figcaption>
    </figure>`).join('');

  function spinRing(dir) {
    angle += dir * step;
    ring.style.transition = reduced ? 'none' : 'transform 1s cubic-bezier(.22,.61,.36,1)';
    ring.style.transform = `translateZ(-${radius}px) rotateY(${angle}deg)`;
    updateActive();
    restartAuto();
  }
  function updateActive() {
    const idx = ((Math.round(-angle / step) % N) + N) % N;
    $$('.ring-item', ring).forEach((el, i) => el.classList.toggle('active', i === idx));
    $('#lookCaption') && ($('#lookCaption').textContent = LOOKS[idx].cap);
  }
  const restartAuto = () => {
    clearInterval(autoT);
    if (!reduced) autoT = setInterval(() => { angle += step; ring.style.transition = 'transform 1s cubic-bezier(.22,.61,.36,1)'; ring.style.transform = `translateZ(-${radius}px) rotateY(${angle}deg)`; updateActive(); }, 4200);
  };
  $('#prevLook')?.addEventListener('click', () => spinRing(1));
  $('#nextLook')?.addEventListener('click', () => spinRing(-1));

  // drag to spin
  let dragging = false, startX = 0, startAngle = 0;
  const wrap = ring.parentElement;
  wrap.addEventListener('pointerdown', e => { dragging = true; startX = e.clientX; startAngle = angle; clearInterval(autoT); });
  addEventListener('pointermove', e => {
    if (!dragging) return;
    const dx = e.clientX - startX;
    ring.style.transition = 'none';
    angle = startAngle + dx * .32;
    ring.style.transform = `translateZ(-${radius}px) rotateY(${angle}deg)`;
    updateActive();
  });
  addEventListener('pointerup', () => {
    if (!dragging) return;
    dragging = false;
    angle = Math.round(angle / step) * step;
    ring.style.transition = 'transform .7s cubic-bezier(.22,.61,.36,1)';
    ring.style.transform = `translateZ(-${radius}px) rotateY(${angle}deg)`;
    restartAuto();
  });
  addEventListener('resize', () => { sizeRing(); ring.style.transition = 'none'; ring.style.transform = `translateZ(-${radius}px) rotateY(${angle}deg)`; });
  sizeRing(); updateActive(); restartAuto();

  /* ---------------- testimonial 3D ring ---------------- */
  const QUOTES = [
    { q:'Took the 2-in-1 jacket to Khunjerab in January — windproof, warm, and it still looks new.', w:'Bilal A. · Gilgit' },
    { q:'Ordered on DM at night, the courier dropped it in Islamabad in three days. Cash on delivery, no fuss.', w:'Hamza R. · Islamabad' },
    { q:'The track pants are the best I have bought — thick fabric, proper stitching, real quality.', w:'Adeel K. · Lahore' },
    { q:'Bought the winter sweater for my brother in Hunza. He says it is the warmest thing he owns.', w:'Sana · Karimabad' }
  ];
  const tRing = $('#tRing');
  let tAngle = 0;
  tRing.innerHTML = QUOTES.map((t, i) => `
    <article class="t-card" data-i="${i}" style="transform:translate(-50%,-50%) rotateY(${i * 90}deg) translateZ(430px)">
      <div class="t-who"><i></i> Xiks · verified client</div>
      <p style="margin-top:14px">“${t.q}”</p>
      <div class="t-who"><i></i> ${t.w}</div>
    </article>`).join('');
  $('#tDots').innerHTML = QUOTES.map((_, i) => `<button data-t="${i}" class="${i === 0 ? 'on' : ''}" aria-label="Review ${i + 1}"></button>`).join('');
  const tCards = $$('.t-card', tRing);
  function setT(i) {
    tAngle = -i * 90;
    tRing.style.transform = `translateZ(-430px) rotateY(${tAngle}deg)`;
    $$('#tDots button').forEach((b, k) => b.classList.toggle('on', k === i));
    tCards.forEach((c, k) => { c.style.opacity = k === i ? '1' : '.35'; });
  }
  $('#tDots').addEventListener('click', e => {
    const b = e.target.closest('[data-t]'); if (b) setT(+b.dataset.t);
  });
  setT(0);
  if (!reduced) setInterval(() => { const cur = ((-tAngle / 90) % 4 + 4) % 4; setT((cur + 1) % 4); }, 6000);

  /* ---------------- marquee duplicate ---------------- */
  const mq = $('#mqTrack');
  if (mq) mq.innerHTML += mq.innerHTML;

  /* ---------------- newsletter ---------------- */
  function joinList() {
    const v = $('#newsEmail').value.trim();
    $('#newsEmail').value = '';
    toast(v ? 'Welcome to the list ✧' : 'Enter your email');
  }
  $('#newsGo')?.addEventListener('click', joinList);
  $('#newsForm')?.addEventListener('submit', e => { e.preventDefault(); joinList(); });

  /* ---------------- hero poster: tap to read it full size ---------------- */
  const zoom = $('#posterZoom');
  function openZoom() { zoom.classList.add('on'); zoom.setAttribute('aria-hidden', 'false'); document.body.classList.add('locked'); }
  function closeZoom() { zoom.classList.remove('on'); zoom.setAttribute('aria-hidden', 'true'); document.body.classList.remove('locked'); }
  const heroCard = $('#heroCard');
  if (heroCard && zoom) {
    heroCard.addEventListener('click', openZoom);
    heroCard.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openZoom(); } });
    zoom.addEventListener('click', closeZoom);
    addEventListener('keydown', e => { if (e.key === 'Escape' && zoom.classList.contains('on')) closeZoom(); });
  }

  /* ---------------- mobile sheet ---------------- */
  const sheet = $('#sheet');
  $('#burger').addEventListener('click', () => {
    const on = sheet.classList.toggle('on');
    document.body.classList.toggle('locked', on);
  });
  sheet.addEventListener('click', e => {
    if (e.target.tagName === 'A') { sheet.classList.remove('on'); document.body.classList.remove('locked'); }
  });

  /* ---------------- cursor ---------------- */
  if (matchMedia('(hover:hover)').matches && innerWidth > 900 && !reduced) {
    const dot = $('#cursor'), ringC = $('#cursorRing');
    let mx = innerWidth / 2, my = innerHeight / 2, rx = mx, ry = my;
    addEventListener('pointermove', e => {
      mx = e.clientX; my = e.clientY;
      dot.style.transform = `translate3d(${mx}px,${my}px,0)`;
      const hit = e.target.closest('a,button,.ring-item,.p-media,.chip');
      ringC.classList.toggle('grow', !!hit);
    }, { passive: true });
    (function loop() {
      rx = lerp(rx, mx, .16); ry = lerp(ry, my, .16);
      ringC.style.transform = `translate3d(${rx}px,${ry}px,0)`;
      requestAnimationFrame(loop);
    })();
  }

  /* ---------------- admin entry button ---------------- */
  (async () => {
    const label = $('#adminLinkText');
    try {
      const r = await fetch(API + 'admin/session', { headers: { Accept: 'application/json' } });
      if (!r.ok) return;                       // static copy / server offline
      const s = await r.json().catch(() => ({}));
      if (s && s.user) {                        // only relabel when actually signed in
        if (label) label.textContent = 'Admin dashboard';
        $('#adminLink')?.classList.add('on');
        $('#adminBtn')?.setAttribute('title', 'Signed in as ' + s.user);
      }
    } catch { /* not signed in / static copy — leave as "Admin sign in" */ }
  })();

  /* ---------------- init ---------------- */
  loadLive().then(() => {
    configureSocialLinks();
    renderGrid();
    buildFilters();
    buildCategories();
    if (SETTINGS.deliveryNote) { const d = $('#deliveryLine'); if (d) d.textContent = SETTINGS.deliveryNote; }
    /* live lookbook images follow the catalogue */
    const byId = id => CATALOG.find(p => p.id === id);
    $$('.ring-item img').forEach((im, i) => {
      const look = LOOKS[i % LOOKS.length]; if (!look) return;
      const src = /^(https?:|assets\/|uploads\/)/.test(look.img) ? look.img : imgSrc(byId(look.img) || { img: look.img });
      im.src = src;
    });
  });
  renderCart();
  addEventListener('load', () => {
    setTimeout(() => $('#loader').classList.add('done'), reduced ? 100 : 1350);
  });
  setTimeout(() => $('#loader').classList.add('done'), 3200); // safety
  document.documentElement.style.setProperty('--year', new Date().getFullYear());
  $$('[data-year]').forEach(el => el.textContent = new Date().getFullYear());
})();
