async function loadComponent(id, path, vars = {}) {
  try {
    const response = await fetch(path);
    if (!response.ok) throw new Error('Error cargando ' + path);
    let html = await response.text();
    for (const [key, value] of Object.entries(vars)) {
      html = html.split(`{{${key}}}`).join(value);
    }
    const target = document.getElementById(id);
    if (target) {
      target.innerHTML = html;
      document.dispatchEvent(new CustomEvent('matichoc:componente', { detail: { id } }));
    }
  } catch (error) {
    console.error(error);
  }
}

// Menú mobile del header (components/header.html). Delegado en `document`
// porque el header se inyecta de forma async vía loadComponent — así no
// importa si el botón todavía no existe cuando corre este script.
document.addEventListener('click', (event) => {
  const toggle = event.target.closest('.nav-toggle');
  if (toggle) {
    const nav = document.getElementById(toggle.getAttribute('aria-controls'));
    if (!nav) return;
    const isOpen = nav.classList.toggle('is-open');
    toggle.setAttribute('aria-expanded', String(isOpen));
    return;
  }
  // Cerrar el menú al elegir un link (mobile).
  const navLink = event.target.closest('.site-nav a');
  if (navLink) {
    const nav = navLink.closest('.site-nav');
    const header = navLink.closest('.site-header');
    const navToggle = header && header.querySelector('.nav-toggle');
    if (nav && nav.classList.contains('is-open')) {
      nav.classList.remove('is-open');
      if (navToggle) navToggle.setAttribute('aria-expanded', 'false');
    }
  }
});

// Alto real del encabezado fijo (cambia al abrir el menú en celular) para que las barras
// pegadas debajo (Historia, Tienda) y los saltos a anclas no queden tapados.
(function () {
  const cab = document.getElementById('header');
  if (!cab || !('ResizeObserver' in window)) return;
  new ResizeObserver(() => {
    document.documentElement.style.setProperty('--header-h', cab.offsetHeight + 'px');
  }).observe(cab);
})();

// Carro compartido entre páginas: se recuerda solo mientras la pestaña está abierta (sessionStorage), para poder
// añadir productos desde la portada y seguir en la Tienda. Guarda únicamente ids y cantidades: los precios salen
// siempre de js/catalogo.js. Cada cambio avisa con el evento `matichoc:carro` (lo escucha el botón del encabezado).
window.MatiCarro = (function () {
  const CLAVE = 'matichoc-carro';
  function leer() {
    try {
      const datos = JSON.parse(sessionStorage.getItem(CLAVE) || '[]');
      return new Map(datos.filter((d) => Array.isArray(d) && typeof d[0] === 'string' && Number.isInteger(d[1]) && d[1] > 0 && d[1] <= 99));
    } catch (e) { return new Map(); }
  }
  function unidades(mapa) {
    let n = 0;
    (mapa || leer()).forEach((cant) => { n += cant; });
    return n;
  }
  function guardar(mapa) {
    try { sessionStorage.setItem(CLAVE, JSON.stringify([...mapa])); } catch (e) { /* sin almacenamiento: el carro vive solo en esta página */ }
    document.dispatchEvent(new CustomEvent('matichoc:carro', { detail: { unidades: unidades(mapa) } }));
  }
  return { leer, guardar, unidades };
})();

// "Tienda" del encabezado (components/header.html): el botón del celular (.carro-btn) y el enlace del menú
// (.nav-tienda) muestran cuántos productos lleva el pedido y, si hay alguno, abren directo el pedido en la Tienda.
(function () {
  function pintar(n) {
    document.querySelectorAll('.carro-btn, .nav-tienda').forEach((enlace) => {
      const cant = enlace.querySelector('[data-carro-cant]');
      cant.textContent = n;
      cant.hidden = n === 0;
      enlace.setAttribute('href', enlace.dataset.tienda + (n > 0 ? '#pedido' : ''));
      enlace.setAttribute('aria-label', n > 0 ? `Ver mi pedido: ${n} ${n === 1 ? 'producto' : 'productos'}` : 'Ir a la tienda');
    });
  }
  document.addEventListener('matichoc:componente', (ev) => { if (ev.detail && ev.detail.id === 'header') pintar(MatiCarro.unidades()); });
  document.addEventListener('matichoc:carro', (ev) => pintar(ev.detail.unidades));
})();
