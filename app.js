const STORAGE_KEY = 'billetera_transacciones';

let transacciones = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
let filtroActual = 'todos';

const hoy = new Date();
const mesActual = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`;

// Elementos
const elBalance   = document.getElementById('balance');
const elIngresos  = document.getElementById('total-ingresos');
const elGastos    = document.getElementById('total-gastos');
const elLista     = document.getElementById('lista-transacciones');
const elFecha     = document.getElementById('fecha');
const elHeaderMes = document.getElementById('header-mes');
const elHistorial = document.getElementById('historial-contenido');

// Fecha por defecto
elFecha.value = hoy.toISOString().split('T')[0];

// Nombre del mes en header
elHeaderMes.textContent = hoy.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });

// ── Navegación entre vistas ──
document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const viewId = 'view-' + btn.dataset.view;
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(viewId).classList.add('active');
    btn.classList.add('active');
    if (btn.dataset.view === 'historial') renderHistorial();
  });
});

// ── Filtros ──
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
  guardar();
  render();

  document.getElementById('descripcion').value = '';
  document.getElementById('monto').value = '';
  elFecha.value = hoy.toISOString().split('T')[0];
}

// ── Eliminar ──
function eliminarTransaccion(id) {
  transacciones = transacciones.filter(t => t.id !== id);
  guardar();
  render();
}

function guardar() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(transacciones));
}

// ── Render principal (mes actual) ──
function render() {
  const delMes = transacciones.filter(t => t.fecha.startsWith(mesActual));
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
  const delMes = transacciones.filter(t => t.fecha.startsWith(mesActual));
  const filtradas = filtroActual === 'todos'
    ? delMes
    : delMes.filter(t => t.tipo === filtroActual);

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
        <button class="btn-eliminar" onclick="eliminarTransaccion(${t.id})" title="Eliminar">✕</button>
      </div>
    </li>
  `).join('');
}

// ── Render historial ──
function renderHistorial() {
  // Agrupar por mes (excluye el mes actual)
  const porMes = {};
  transacciones.forEach(t => {
    const mes = t.fecha.slice(0, 7); // YYYY-MM
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
