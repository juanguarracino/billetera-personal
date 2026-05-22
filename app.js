const STORAGE_KEY = 'billetera_transacciones';

let transacciones = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
let filtroActual = 'todos';

const elBalance = document.getElementById('balance');
const elIngresos = document.getElementById('total-ingresos');
const elGastos = document.getElementById('total-gastos');
const elLista = document.getElementById('lista-transacciones');
const elFecha = document.getElementById('fecha');

elFecha.value = new Date().toISOString().split('T')[0];

document.getElementById('btn-agregar').addEventListener('click', agregarTransaccion);

document.querySelectorAll('.filtro').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelector('.filtro.activo').classList.remove('activo');
    btn.classList.add('activo');
    filtroActual = btn.dataset.filtro;
    renderLista();
  });
});

function agregarTransaccion() {
  const desc = document.getElementById('descripcion').value.trim();
  const monto = parseFloat(document.getElementById('monto').value);
  const tipo = document.getElementById('tipo').value;
  const fecha = document.getElementById('fecha').value;

  if (!desc || isNaN(monto) || monto <= 0 || !fecha) {
    alert('Completa todos los campos correctamente.');
    return;
  }

  transacciones.unshift({ id: Date.now(), desc, monto, tipo, fecha });
  guardar();
  render();

  document.getElementById('descripcion').value = '';
  document.getElementById('monto').value = '';
  elFecha.value = new Date().toISOString().split('T')[0];
}

function eliminarTransaccion(id) {
  transacciones = transacciones.filter(t => t.id !== id);
  guardar();
  render();
}

function guardar() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(transacciones));
}

function render() {
  const ingresos = transacciones.filter(t => t.tipo === 'ingreso').reduce((s, t) => s + t.monto, 0);
  const gastos = transacciones.filter(t => t.tipo === 'gasto').reduce((s, t) => s + t.monto, 0);
  const balance = ingresos - gastos;

  elBalance.textContent = fmt(balance);
  elBalance.className = 'balance-amount ' + (balance < 0 ? 'negativo' : 'positivo');
  elIngresos.textContent = fmt(ingresos);
  elGastos.textContent = fmt(gastos);

  renderLista();
}

function renderLista() {
  const filtradas = filtroActual === 'todos'
    ? transacciones
    : transacciones.filter(t => t.tipo === filtroActual);

  if (filtradas.length === 0) {
    elLista.innerHTML = '<p class="empty-msg"><span>🪙</span>No hay transacciones aún.<br>Agregá tu primer movimiento.</p>';
    return;
  }

  const iconos = {
    ingreso: '💰',
    gasto: '💸',
  };

  elLista.innerHTML = filtradas.map(t => `
    <li class="transaccion ${t.tipo}">
      <div class="transaccion-izquierda">
        <div class="transaccion-emoji">${iconos[t.tipo]}</div>
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

function fmt(n) {
  return '$' + n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function formatFecha(str) {
  const [y, m, d] = str.split('-');
  return `${d}/${m}/${y}`;
}

function escHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

render();
