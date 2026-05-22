const STORAGE_KEY     = 'billetera_transacciones';
const STORAGE_KEY_USD = 'billetera_ahorro_usd';

let transacciones = JSON.parse(localStorage.getItem(STORAGE_KEY))     || [];
let comprasUSD    = JSON.parse(localStorage.getItem(STORAGE_KEY_USD)) || [];
let filtroActual  = 'todos';
let graficoUSD    = null;

const hoy      = new Date();
const mesActual = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`;

// Elementos — inicio
const elBalance   = document.getElementById('balance');
const elIngresos  = document.getElementById('total-ingresos');
const elGastos    = document.getElementById('total-gastos');
const elLista     = document.getElementById('lista-transacciones');
const elFecha     = document.getElementById('fecha');
const elHeaderMes = document.getElementById('header-mes');

// Elementos — ahorro
const elTotalUSD      = document.getElementById('total-usd');
const elTotalARS      = document.getElementById('total-ars-invertido');
const elCotizProm     = document.getElementById('cotiz-promedio');
const elCantCompras   = document.getElementById('cant-compras');
const elListaUSD      = document.getElementById('lista-usd');
const elChartEmpty    = document.getElementById('chart-empty');

// Elementos — historial
const elHistorial = document.getElementById('historial-contenido');

// Defaults
elFecha.value = hoy.toISOString().split('T')[0];
document.getElementById('usd-fecha').value = hoy.toISOString().split('T')[0];
elHeaderMes.textContent = hoy.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });

// ── Navegación ──
document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const viewId = 'view-' + btn.dataset.view;
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(viewId).classList.add('active');
    btn.classList.add('active');
    if (btn.dataset.view === 'historial') renderHistorial();
    if (btn.dataset.view === 'ahorro')    renderAhorro();
  });
});

// ── Filtros inicio ──
document.querySelectorAll('.filtro').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelector('.filtro.activo').classList.remove('activo');
    btn.classList.add('activo');
    filtroActual = btn.dataset.filtro;
    renderLista();
  });
});

// ── Agregar transacción ──
document.getElementById('btn-agregar').addEventListener('click', agregarTransaccion);

function agregarTransaccion() {
  const desc  = document.getElementById('descripcion').value.trim();
  const monto = parseFloat(document.getElementById('monto').value);
  const tipo  = document.getElementById('tipo').value;
  const fecha = document.getElementById('fecha').value;

  if (!desc || isNaN(monto) || monto <= 0 || !fecha) {
    alert('Completá todos los campos correctamente.');
    return;
  }

  transacciones.unshift({ id: Date.now(), desc, monto, tipo, fecha });
  localStorage.setItem(STORAGE_KEY, JSON.stringify(transacciones));
  render();

  document.getElementById('descripcion').value = '';
  document.getElementById('monto').value = '';
  elFecha.value = hoy.toISOString().split('T')[0];
}

function eliminarTransaccion(id) {
  transacciones = transacciones.filter(t => t.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(transacciones));
  render();
}

// ── Agregar compra USD ──
document.getElementById('btn-comprar-usd').addEventListener('click', agregarCompraUSD);

function agregarCompraUSD() {
  const cantidad   = parseFloat(document.getElementById('usd-cantidad').value);
  const cotizacion = parseFloat(document.getElementById('usd-cotizacion').value);
  const fecha      = document.getElementById('usd-fecha').value;

  if (isNaN(cantidad) || cantidad <= 0 || isNaN(cotizacion) || cotizacion <= 0 || !fecha) {
    alert('Completá todos los campos correctamente.');
    return;
  }

  comprasUSD.unshift({ id: Date.now(), cantidad, cotizacion, fecha });
  localStorage.setItem(STORAGE_KEY_USD, JSON.stringify(comprasUSD));
  renderAhorro();

  document.getElementById('usd-cantidad').value   = '';
  document.getElementById('usd-cotizacion').value = '';
  document.getElementById('usd-fecha').value = hoy.toISOString().split('T')[0];
}

function eliminarCompraUSD(id) {
  comprasUSD = comprasUSD.filter(c => c.id !== id);
  localStorage.setItem(STORAGE_KEY_USD, JSON.stringify(comprasUSD));
  renderAhorro();
}

// ── Render inicio ──
function render() {
  const delMes   = transacciones.filter(t => t.fecha.startsWith(mesActual));
  const ingresos = sumar(delMes, 'ingreso');
  const gastos   = sumar(delMes, 'gasto');
  const balance  = ingresos - gastos;

  elBalance.textContent  = fmt(balance);
  elBalance.className    = 'balance-amount' + (balance < 0 ? ' negativo' : '');
  elIngresos.textContent = fmt(ingresos);
  elGastos.textContent   = fmt(gastos);
  renderLista();
}

function renderLista() {
  const delMes   = transacciones.filter(t => t.fecha.startsWith(mesActual));
  const filtradas = filtroActual === 'todos' ? delMes : delMes.filter(t => t.tipo === filtroActual);

  if (filtradas.length === 0) {
    elLista.innerHTML = '<p class="empty-msg"><span>🪙</span>No hay transacciones este mes.<br>Agregá tu primer movimiento.</p>';
    return;
  }

  elLista.innerHTML = filtradas.map(t => `
    <li class="transaccion ${t.tipo}">
      <div class="transaccion-izquierda">
        <div class="transaccion-emoji">${t.tipo === 'ingreso' ? '💰' : '💸'}</div>
        <div class="transaccion-info">
          <span class="transaccion-desc">${escHtml(t.desc)}</span>
          <span class="transaccion-fecha">${formatFecha(t.fecha)}</span>
        </div>
      </div>
      <div class="transaccion-derecha">
        <span class="transaccion-monto">${t.tipo === 'gasto' ? '-' : '+'}${fmt(t.monto)}</span>
        <button class="btn-eliminar" onclick="eliminarTransaccion(${t.id})">✕</button>
      </div>
    </li>
  `).join('');
}

// ── Render ahorro USD ──
function renderAhorro() {
  const totalUSD = comprasUSD.reduce((s, c) => s + c.cantidad, 0);
  const totalARS = comprasUSD.reduce((s, c) => s + c.cantidad * c.cotizacion, 0);
  const promedio = totalUSD > 0 ? totalARS / totalUSD : 0;

  elTotalUSD.textContent    = 'U$S ' + fmtUSD(totalUSD);
  elTotalARS.textContent    = totalARS > 0 ? `${fmt(totalARS)} invertidos` : '';
  elCotizProm.textContent   = promedio > 0 ? '$' + Math.round(promedio).toLocaleString('es-AR') : '—';
  elCantCompras.textContent = comprasUSD.length;

  renderGrafico();
  renderListaUSD();
}

function renderGrafico() {
  const canvas = document.getElementById('grafico-usd');

  if (comprasUSD.length === 0) {
    elChartEmpty.style.display = 'block';
    canvas.style.display = 'none';
    if (graficoUSD) { graficoUSD.destroy(); graficoUSD = null; }
    return;
  }

  elChartEmpty.style.display = 'none';
  canvas.style.display = 'block';

  // Construir puntos acumulativos ordenados por fecha
  const ordenadas = [...comprasUSD].sort((a, b) => a.fecha.localeCompare(b.fecha));
  let acum = 0;
  const labels = [];
  const datos  = [];

  ordenadas.forEach(c => {
    acum += c.cantidad;
    labels.push(formatFecha(c.fecha));
    datos.push(parseFloat(acum.toFixed(2)));
  });

  if (graficoUSD) graficoUSD.destroy();

  const ctx = canvas.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 0, 180);
  grad.addColorStop(0, 'rgba(0,230,118,0.3)');
  grad.addColorStop(1, 'rgba(0,230,118,0)');

  graficoUSD = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        data: datos,
        borderColor: '#00e676',
        borderWidth: 2.5,
        backgroundColor: grad,
        fill: true,
        tension: 0.35,
        pointBackgroundColor: '#00e676',
        pointRadius: datos.length === 1 ? 5 : 3,
        pointHoverRadius: 6,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#1a1a24',
          borderColor: 'rgba(0,230,118,0.3)',
          borderWidth: 1,
          titleColor: '#9999b0',
          bodyColor: '#f0f0f8',
          bodyFont: { family: 'Inter', weight: '700', size: 14 },
          callbacks: {
            label: ctx => ` U$S ${fmtUSD(ctx.parsed.y)}`,
          }
        }
      },
      scales: {
        x: {
          grid: { color: 'rgba(255,255,255,0.04)' },
          ticks: { color: '#6b6b80', font: { family: 'Inter', size: 10 }, maxRotation: 0 },
          border: { display: false },
        },
        y: {
          grid: { color: 'rgba(255,255,255,0.04)' },
          ticks: {
            color: '#6b6b80',
            font: { family: 'Inter', size: 10 },
            callback: v => 'U$S ' + fmtUSD(v),
          },
          border: { display: false },
        }
      }
    }
  });
}

function renderListaUSD() {
  if (comprasUSD.length === 0) {
    elListaUSD.innerHTML = '<p class="empty-msg"><span>💵</span>No registraste compras aún.</p>';
    return;
  }

  elListaUSD.innerHTML = comprasUSD.map(c => `
    <li class="compra-usd">
      <div class="compra-izquierda">
        <div class="compra-emoji">💵</div>
        <div class="compra-info">
          <span class="compra-desc">@ $${Math.round(c.cotizacion).toLocaleString('es-AR')}/USD</span>
          <span class="compra-fecha">${formatFecha(c.fecha)}</span>
        </div>
      </div>
      <div class="compra-derecha">
        <div class="compra-montos">
          <span class="compra-usd-monto">+U$S ${fmtUSD(c.cantidad)}</span>
          <span class="compra-ars-monto">${fmt(c.cantidad * c.cotizacion)}</span>
        </div>
        <button class="btn-eliminar" onclick="eliminarCompraUSD(${c.id})">✕</button>
      </div>
    </li>
  `).join('');
}

// ── Render historial ──
function renderHistorial() {
  const porMes = {};
  transacciones.forEach(t => {
    const mes = t.fecha.slice(0, 7);
    if (!porMes[mes]) porMes[mes] = [];
    porMes[mes].push(t);
  });

  const meses = Object.keys(porMes).sort((a, b) => b.localeCompare(a));

  if (meses.length === 0) {
    elHistorial.innerHTML = '<div class="historial-vacio"><span>📭</span>Aún no hay historial.<br>Aparecerá aquí cuando tengas transacciones.</div>';
    return;
  }

  elHistorial.innerHTML = meses.map(mes => {
    const items    = porMes[mes];
    const ingresos = sumar(items, 'ingreso');
    const gastos   = sumar(items, 'gasto');
    const balance  = ingresos - gastos;
    const esActual = mes === mesActual;
    const nombre   = nombreMes(mes) + (esActual ? ' (actual)' : '');

    const itemsHtml = items.map(t => `
      <div class="mes-item ${t.tipo}">
        <div class="mes-item-izq">
          <div class="mes-item-emoji">${t.tipo === 'ingreso' ? '💰' : '💸'}</div>
          <div>
            <div class="mes-item-desc">${escHtml(t.desc)}</div>
            <div class="mes-item-fecha">${formatFecha(t.fecha)}</div>
          </div>
        </div>
        <span class="mes-item-monto">${t.tipo === 'gasto' ? '-' : '+'}${fmt(t.monto)}</span>
      </div>
    `).join('');

    return `
      <div class="mes-card" id="mes-${mes}">
        <div class="mes-header" onclick="toggleMes('${mes}')">
          <div class="mes-titulo-row">
            <span class="mes-nombre">${nombre}</span>
            <span class="mes-toggle">▼</span>
          </div>
          <div class="mes-stats">
            <div class="mes-stat">
              <div class="mes-stat-label">Ingresos</div>
              <div class="mes-stat-valor ingreso">${fmt(ingresos)}</div>
            </div>
            <div class="mes-stat">
              <div class="mes-stat-label">Gastos</div>
              <div class="mes-stat-valor gasto">${fmt(gastos)}</div>
            </div>
            <div class="mes-stat">
              <div class="mes-stat-label">Balance</div>
              <div class="mes-stat-valor ${balance >= 0 ? 'balance-pos' : 'balance-neg'}">${fmt(balance)}</div>
            </div>
          </div>
        </div>
        <div class="mes-lista">${itemsHtml}</div>
      </div>
    `;
  }).join('');
}

function toggleMes(mes) {
  document.getElementById('mes-' + mes).classList.toggle('abierto');
}

// ── Helpers ──
function sumar(arr, tipo) {
  return arr.filter(t => t.tipo === tipo).reduce((s, t) => s + t.monto, 0);
}

function fmt(n) {
  return '$' + n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function fmtUSD(n) {
  return n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function formatFecha(str) {
  const [y, m, d] = str.split('-');
  return `${d}/${m}/${y}`;
}

function nombreMes(str) {
  const [y, m] = str.split('-');
  return new Date(y, m - 1, 1).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
}

function escHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

render();
