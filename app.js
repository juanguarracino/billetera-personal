// ── PIN / Lock ──────────────────────────────────────────────────────────────
let pinBuffer  = '';
let pinMode    = 'setup';
let pinSetup1  = '';

const lockScreen   = document.getElementById('lock-screen');
const lockSubtitle = document.getElementById('lock-subtitle');
const lockLoading  = document.getElementById('lock-loading');
const pinError     = document.getElementById('pin-error');
const pinDots      = document.getElementById('pin-dots');
const pinPad       = document.getElementById('pin-pad');

async function hashPIN(pin) {
  const data   = new TextEncoder().encode('billetera_v1_' + pin);
  const buf    = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function updateDots() {
  document.querySelectorAll('.dot').forEach((dot, i) => {
    dot.classList.toggle('filled', i < pinBuffer.length);
  });
}

function setLockSubtitle(text) { lockSubtitle.textContent = text; }
function setLockError(text)    { pinError.textContent = text; }

function shakeDots() {
  pinDots.classList.remove('shake');
  void pinDots.offsetWidth;
  pinDots.classList.add('shake');
  setTimeout(() => pinDots.classList.remove('shake'), 420);
}

const FAIL_KEY    = 'billetera_fail_count';
const MAX_INTENTOS = 5;

function getFailCount() { return parseInt(localStorage.getItem(FAIL_KEY) || '0'); }
function incFailCount() { localStorage.setItem(FAIL_KEY, getFailCount() + 1); }
function resetFailCount() { localStorage.removeItem(FAIL_KEY); }

// pinHash se carga desde Firestore al iniciar
let pinHashActual = null;

function wipeAll() {
  localStorage.clear();
  sessionStorage.clear();
  // Borrar datos y PIN de Firestore
  configRef.delete().catch(() => {});
  docRef.delete().catch(() => {});
}

function showWipedScreen() {
  lockSubtitle.textContent = '';
  pinError.textContent = '';
  pinDots.style.display = 'none';
  pinPad.style.display  = 'none';

  const msg = document.createElement('div');
  msg.className = 'wipe-msg';
  msg.innerHTML = `
    <div class="wipe-icon">⚠️</div>
    <p class="wipe-title">Acceso bloqueado</p>
    <p class="wipe-text">Se superaron ${MAX_INTENTOS} intentos fallidos.<br>Todos los datos fueron eliminados por seguridad.</p>
    <button class="wipe-btn" onclick="location.reload()">Configurar nuevo PIN</button>
  `;
  document.querySelector('.lock-container').appendChild(msg);
}

function mostrarPinUI() {
  lockLoading.style.display = 'none';
  pinDots.style.display     = 'flex';
  pinPad.style.display      = 'grid';
}

async function handlePinComplete() {
  const pin = pinBuffer;
  pinBuffer  = '';
  updateDots();

  if (pinMode === 'setup') {
    if (!pinSetup1) {
      pinSetup1 = pin;
      setLockSubtitle('Repetí el PIN para confirmar');
      setLockError('');
    } else {
      if (pin === pinSetup1) {
        const hash = await hashPIN(pin);
        // Guardar PIN en Firestore (compartido entre dispositivos)
        await configRef.set({ pinHash: hash });
        pinHashActual = hash;
        resetFailCount();
        unlockApp();
      } else {
        pinSetup1 = '';
        setLockSubtitle('Creá tu PIN de 4 dígitos');
        setLockError('Los PINs no coinciden, intentá de nuevo');
        shakeDots();
      }
    }
  } else {
    const attempt = await hashPIN(pin);
    if (attempt === pinHashActual) {
      resetFailCount();
      unlockApp();
    } else {
      incFailCount();
      const restantes = MAX_INTENTOS - getFailCount();
      if (restantes <= 0) {
        wipeAll();
        showWipedScreen();
      } else {
        setLockError(`PIN incorrecto. Intentos restantes: ${restantes}`);
        shakeDots();
      }
    }
  }
}

function unlockApp() {
  sessionStorage.setItem('unlocked', '1');
  lockScreen.classList.add('fade-out');
  setTimeout(() => lockScreen.classList.add('hidden'), 350);
  startInactivityTimer();
}

function lockApp() {
  if (!localStorage.getItem(PIN_KEY)) return;
  sessionStorage.removeItem('unlocked');
  pinBuffer = '';
  pinSetup1 = '';
  pinMode   = 'enter';
  updateDots();
  setLockSubtitle('Ingresá tu PIN');
  setLockError('');
  lockScreen.classList.remove('hidden', 'fade-out');
}

// ── Inactividad: bloqueo a los 5 minutos ──
const INACTIVITY_MS = 5 * 60 * 1000;
let inactivityTimer = null;

function resetInactivityTimer() {
  clearTimeout(inactivityTimer);
  inactivityTimer = setTimeout(lockApp, INACTIVITY_MS);
}

function startInactivityTimer() {
  const eventos = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'click'];
  eventos.forEach(ev => document.addEventListener(ev, resetInactivityTimer, { passive: true }));
  resetInactivityTimer();
}

// Inicializar lock screen — leer PIN desde Firestore
if (sessionStorage.getItem('unlocked')) {
  lockScreen.classList.add('hidden');
  // Cargar PIN en background por si cambió en otro dispositivo
  configRef.get().then(snap => {
    pinHashActual = snap.exists ? (snap.data().pinHash || null) : null;
  });
  startInactivityTimer();
} else {
  // Mostrar spinner mientras carga el PIN desde Firestore
  configRef.get().then(snap => {
    pinHashActual = snap.exists ? (snap.data().pinHash || null) : null;
    pinMode = pinHashActual ? 'enter' : 'setup';
    setLockSubtitle(pinMode === 'setup' ? 'Creá tu PIN de 4 dígitos' : 'Ingresá tu PIN');
    mostrarPinUI();
  }).catch(() => {
    // Sin conexión: intentar con caché local
    setLockSubtitle('Sin conexión');
    setLockError('Necesitás internet para ingresar.');
  });
}

// Teclado numérico
document.querySelectorAll('.pin-key[data-n]').forEach(btn => {
  btn.addEventListener('click', () => {
    if (pinBuffer.length >= 4) return;
    setLockError('');
    pinBuffer += btn.dataset.n;
    updateDots();
    if (pinBuffer.length === 4) handlePinComplete();
  });
});

document.getElementById('pin-del').addEventListener('click', () => {
  pinBuffer = pinBuffer.slice(0, -1);
  setLockError('');
  updateDots();
});

// Soporte teclado físico en el lock screen
document.addEventListener('keydown', e => {
  if (lockScreen.classList.contains('hidden')) return;
  if (/^[0-9]$/.test(e.key) && pinBuffer.length < 4) {
    setLockError('');
    pinBuffer += e.key;
    updateDots();
    if (pinBuffer.length === 4) handlePinComplete();
  }
  if (e.key === 'Backspace') {
    pinBuffer = pinBuffer.slice(0, -1);
    setLockError('');
    updateDots();
  }
});
// ────────────────────────────────────────────────────────────────────────────

// ── Firebase ─────────────────────────────────────────────────────────────────
firebase.initializeApp({
  apiKey:            "AIzaSyBjcOaztfG893I9lkHXsAnskM10ktPa1jQ",
  authDomain:        "billetera-personal-8af80.firebaseapp.com",
  projectId:         "billetera-personal-8af80",
  storageBucket:     "billetera-personal-8af80.firebasestorage.app",
  messagingSenderId: "344737606582",
  appId:             "1:344737606582:web:1807e85335b54671cc6f17"
});

const db        = firebase.firestore();
const docRef    = db.collection('billetera').doc('datos');
const configRef = db.collection('billetera').doc('config');
const syncBadge = document.getElementById('sync-badge');

function setSyncing() {
  syncBadge.textContent = '⟳';
  syncBadge.className = 'sync-badge syncing';
}

function setSynced() {
  syncBadge.textContent = '✓';
  syncBadge.className = 'sync-badge ok';
  setTimeout(() => { syncBadge.className = 'sync-badge'; }, 2000);
}

function guardar() {
  setSyncing();
  docRef.set({ transacciones, comprasUSD })
    .then(setSynced)
    .catch(console.error);
}

// Escuchar cambios en tiempo real (sincroniza entre dispositivos)
docRef.onSnapshot(snap => {
  const data = snap.exists ? snap.data() : {};
  transacciones = data.transacciones || [];
  comprasUSD    = data.comprasUSD    || [];
  render();
  if (document.getElementById('view-ahorro').classList.contains('active'))    renderAhorro();
  if (document.getElementById('view-historial').classList.contains('active')) renderHistorial();
});
// ─────────────────────────────────────────────────────────────────────────────

let transacciones = [];
let comprasUSD    = [];
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
  guardar();
  render();

  document.getElementById('descripcion').value = '';
  document.getElementById('monto').value = '';
  elFecha.value = hoy.toISOString().split('T')[0];
}

function eliminarTransaccion(id) {
  transacciones = transacciones.filter(t => t.id !== id);
  guardar();
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
  guardar();
  renderAhorro();

  document.getElementById('usd-cantidad').value   = '';
  document.getElementById('usd-cotizacion').value = '';
  document.getElementById('usd-fecha').value = hoy.toISOString().split('T')[0];
}

function eliminarCompraUSD(id) {
  comprasUSD = comprasUSD.filter(c => c.id !== id);
  guardar();
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
