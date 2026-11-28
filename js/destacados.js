// Portada: "Los más pedidos". Muestra los productos de DESTACADOS (js/catalogo.js) con su botón Añadir y los
// guarda en el carro compartido (MatiCarro, js/base.js). El pedido se revisa y se envía en la Tienda, con el mismo
// panel de siempre: aquí no hay pago ni formulario. Precios y fotos salen SIEMPRE de CATALOGO.
(function () {
  const grid = document.getElementById('destGrid');
  const barra = document.getElementById('destBarra');
  if (!grid || typeof CATALOGO === 'undefined' || typeof DESTACADOS === 'undefined') return;

  const TIENDA = 'pages/tienda.html';
  const porId = new Map(CATALOGO.map((p) => [p.id, p]));
  const productos = DESTACADOS.map((id) => porId.get(id)).filter(Boolean);
  // Solo productos que sigan existiendo en el catálogo.
  const carrito = new Map([...(window.MatiCarro ? MatiCarro.leer() : [])].filter(([id]) => porId.has(id)));
  const clp = (n) => n.toLocaleString('es-CL');
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const reducir = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function tarjeta(p) {
    return `
      <article class="t-card" data-id="${p.id}">
        ${p.badge ? `<span class="t-badge">⭐ ${esc(p.badge)}</span>` : ''}
        <img src="${esc(p.img)}" alt="${esc(p.nombre)}" width="400" height="400" decoding="async">
        <div class="t-card-cuerpo">
          <h3>${esc(p.nombre)}</h3>
          <div class="t-pie">
            <span class="t-precio">$${clp(p.precio)}</span>
            <div class="t-ctrl">
              <button type="button" class="t-add" data-accion="sumar" data-id="${p.id}" aria-label="Añadir ${esc(p.nombre)} al pedido">Añadir</button>
              <div class="t-step" hidden>
                <button type="button" data-accion="restar" data-id="${p.id}" aria-label="Quitar uno de ${esc(p.nombre)}">−</button>
                <output aria-live="polite" aria-label="Cantidad de ${esc(p.nombre)}">0</output>
                <button type="button" data-accion="sumar" data-id="${p.id}" aria-label="Agregar uno más de ${esc(p.nombre)}">+</button>
              </div>
            </div>
          </div>
        </div>
      </article>`;
  }

  function acceso(a) {
    return `
      <a class="t-card t-card--acceso" href="${TIENDA}${esc(a.destino)}">
        <img src="${esc(a.img)}" alt="" width="400" height="400" loading="lazy" decoding="async">
        <div class="t-card-cuerpo">
          <h3>${esc(a.titulo)}</h3>
          <p class="t-desc abierto">${esc(a.texto)}</p>
          <span class="t-acceso-btn">${esc(a.boton)} →</span>
        </div>
      </a>`;
  }

  function pintar(animar) {
    let unidades = 0, total = 0;
    carrito.forEach((cant, id) => { unidades += cant; total += cant * porId.get(id).precio; });
    grid.querySelectorAll('.t-card[data-id]').forEach((card) => {
      const cant = carrito.get(card.dataset.id) || 0;
      card.querySelector('.t-add').hidden = cant > 0;
      const paso = card.querySelector('.t-step');
      paso.hidden = cant === 0;
      paso.querySelector('output').textContent = cant;
    });
    barra.hidden = unidades === 0;
    document.body.classList.toggle('t-con-barra', unidades > 0);
    document.getElementById('destBarraCant').textContent = unidades;
    document.getElementById('destBarraEtq').textContent = unidades === 1 ? 'producto' : 'productos';
    document.getElementById('destBarraTotal').textContent = clp(total);
    if (animar && !reducir && unidades > 0) {
      barra.classList.remove('bump');
      void barra.offsetWidth;
      barra.classList.add('bump');
    }
  }

  grid.innerHTML = productos.map(tarjeta).join('') +
    (typeof DESTACADOS_ACCESOS === 'undefined' ? [] : DESTACADOS_ACCESOS).map(acceso).join('');

  grid.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-accion]');
    if (!btn) return;
    const id = btn.dataset.id;
    const suma = btn.dataset.accion === 'sumar';
    const nueva = Math.min((carrito.get(id) || 0) + (suma ? 1 : -1), 99);
    if (nueva > 0) carrito.set(id, nueva); else carrito.delete(id);
    if (window.MatiCarro) MatiCarro.guardar(carrito);
    if (suma && window.matiEvento) matiEvento('carro-anadir');
    pintar(true);
  });

  pintar(false);
})();
