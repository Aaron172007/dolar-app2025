// VARIABLES GLOBALES
let currentRates = {
    official: 3.72,
    purchase: 3.68,  // Tasa a la que compré
    buy: 3.70,       // Mi tasa de compra (lo que pago al cliente)
    sell: 3.75       // Mi tasa de venta (lo que cobro al cliente)
};

let operations = [];
let trashedOperations = [];
let charts = {};
let currentFilter = 'all';
let editingOperationKey = null;
let autoPrintEnabled = false; // 🖨️ Control de impresión automática

// FUNCIONES DE UTILIDAD
function toggleMobileMenu() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    sidebar.classList.toggle('mobile-open');
    overlay.classList.toggle('active');
}

function validatePin() {
    const pin = document.getElementById('pinInput').value;
    const error = document.getElementById('pinError');

    if (pin === '1156') {
        document.getElementById('pinContainer').style.display = 'none';
        document.getElementById('dashboardWrapper').classList.add('active');
        document.getElementById('mobileMenuBtn').style.display = 'block';
        initializeDashboard();
    } else {
        error.classList.add('show');
        document.getElementById('pinInput').value = '';
        setTimeout(() => error.classList.remove('show'), 3000);
    }
}

document.getElementById('pinInput')?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') validatePin();
});

// INICIALIZACIÓN
async function initializeDashboard() {
    // Cargar preferencia de impresión automática
    const savedAutoPrint = localStorage.getItem('autoPrintEnabled');
    if (savedAutoPrint === 'true') {
        autoPrintEnabled = true;
        setTimeout(() => {
            const btn = document.getElementById('autoPrintBtn');
            const icon = document.getElementById('autoPrintIcon');
            if (btn) {
                btn.classList.add('active');
                btn.style.background = 'linear-gradient(135deg, #10b981 0%, #059669 100%)';
                icon.style.fill = 'white';
            }
        }, 100);
    }
    
    await loadRatesFromFirebase();
    await loadOperationsFromFirebase();
    await loadTrashFromFirebase();
    await cleanExpiredTrash();
    fetchOfficialRate();
    updateDashboard();
    updateDollarsAvailable();
    initializeCharts();
    
    // Real-time listeners
    if (window.db) {
        window.dbOnValue(window.dbRef(window.db, 'operations'), (snapshot) => {
            if (snapshot.exists()) {
                const data = snapshot.val();
                operations = Object.keys(data).map(key => ({
                    ...data[key],
                    firebaseKey: key
                }));
                
                updateDashboard();
                updateDollarsAvailable();
                loadHistory();
                updateStatsSection();
            } else {
                operations = [];
                updateDashboard();
                updateDollarsAvailable();
                loadHistory();
                updateStatsSection();
            }
        });

        window.dbOnValue(window.dbRef(window.db, 'rates'), (snapshot) => {
            if (snapshot.exists()) {
                currentRates = snapshot.val();
                loadRates();
                updateAllRatesDisplay();
                calculateProfit();
            }
        });

        window.dbOnValue(window.dbRef(window.db, 'trash'), (snapshot) => {
            if (snapshot.exists()) {
                const data = snapshot.val();
                trashedOperations = Object.keys(data).map(key => ({
                    ...data[key],
                    firebaseKey: key
                }));
            } else {
                trashedOperations = [];
            }
            loadTrash();
        });
    }
    
    // Actualizar tasa oficial cada 30 minutos
    setInterval(fetchOfficialRate, 30 * 60 * 1000);
    
    // Limpiar papelera cada hora
    setInterval(cleanExpiredTrash, 60 * 60 * 1000);
}

// FIREBASE - RATES
async function loadRatesFromFirebase() {
    try {
        const snapshot = await window.dbGet(window.dbRef(window.db, 'rates'));
        if (snapshot.exists()) {
            currentRates = snapshot.val();
        } else {
            await saveRatesToFirebase();
        }
        loadRates();
    } catch (error) {
        console.error('Error loading rates from Firebase:', error);
        loadRates();
    }
}

async function saveRatesToFirebase() {
    try {
        await window.dbSet(window.dbRef(window.db, 'rates'), currentRates);
    } catch (error) {
        console.error('Error saving rates to Firebase:', error);
    }
}

// FIREBASE - OPERATIONS
async function loadOperationsFromFirebase() {
    try {
        const snapshot = await window.dbGet(window.dbRef(window.db, 'operations'));
        if (snapshot.exists()) {
            const data = snapshot.val();
            operations = Object.keys(data).map(key => ({
                ...data[key],
                firebaseKey: key
            }));
        }
    } catch (error) {
        console.error('Error loading operations from Firebase:', error);
    }
}

async function saveOperationToFirebase(operation) {
    try {
        const newOpRef = window.dbPush(window.dbRef(window.db, 'operations'));
        await window.dbSet(newOpRef, operation);
        return newOpRef.key;
    } catch (error) {
        console.error('Error saving operation to Firebase:', error);
        return null;
    }
}

async function updateOperationInFirebase(firebaseKey, operation) {
    try {
        await window.dbUpdate(window.dbRef(window.db, `operations/${firebaseKey}`), operation);
        return true;
    } catch (error) {
        console.error('Error updating operation in Firebase:', error);
        return false;
    }
}

async function deleteOperationFromFirebase(firebaseKey) {
    try {
        await window.dbRemove(window.dbRef(window.db, `operations/${firebaseKey}`));
    } catch (error) {
        console.error('Error deleting operation from Firebase:', error);
    }
}

// FIREBASE - TRASH
async function loadTrashFromFirebase() {
    try {
        const snapshot = await window.dbGet(window.dbRef(window.db, 'trash'));
        if (snapshot.exists()) {
            const data = snapshot.val();
            trashedOperations = Object.keys(data).map(key => ({
                ...data[key],
                firebaseKey: key
            }));
        }
    } catch (error) {
        console.error('Error loading trash from Firebase:', error);
    }
}

async function moveToTrash(operation) {
    try {
        const trashedOp = {
            ...operation,
            deletedAt: new Date().toISOString()
        };
        const newTrashRef = window.dbPush(window.dbRef(window.db, 'trash'));
        await window.dbSet(newTrashRef, trashedOp);
        return newTrashRef.key;
    } catch (error) {
        console.error('Error moving to trash:', error);
        return null;
    }
}

async function restoreFromTrash(firebaseKey) {
    try {
        const operation = trashedOperations.find(op => op.firebaseKey === firebaseKey);
        if (!operation) return false;

        // Eliminar deletedAt y firebaseKey antes de restaurar
        const { deletedAt, firebaseKey: oldKey, ...cleanOperation } = operation;
        
        // Guardar en operations
        const newOpRef = window.dbPush(window.dbRef(window.db, 'operations'));
        await window.dbSet(newOpRef, cleanOperation);
        
        // Eliminar de trash
        await window.dbRemove(window.dbRef(window.db, `trash/${firebaseKey}`));
        
        return true;
    } catch (error) {
        console.error('Error restoring from trash:', error);
        return false;
    }
}

async function deleteFromTrash(firebaseKey) {
    try {
        await window.dbRemove(window.dbRef(window.db, `trash/${firebaseKey}`));
    } catch (error) {
        console.error('Error deleting from trash:', error);
    }
}

async function emptyTrash() {
    if (!confirm('¿Estás seguro de que quieres vaciar completamente la papelera? Esta acción no se puede deshacer.')) {
        return;
    }

    try {
        await window.dbSet(window.dbRef(window.db, 'trash'), null);
        trashedOperations = [];
        loadTrash();
        alert('✅ Papelera vaciada exitosamente');
    } catch (error) {
        console.error('Error emptying trash:', error);
        alert('❌ Error al vaciar la papelera');
    }
}

async function cleanExpiredTrash() {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    
    try {
        const snapshot = await window.dbGet(window.dbRef(window.db, 'trash'));
        if (!snapshot.exists()) return;
        
        const data = snapshot.val();
        let hasDeleted = false;
        
        for (const key in data) {
            const deletedAt = new Date(data[key].deletedAt);
            if (deletedAt < thirtyDaysAgo) {
                await window.dbRemove(window.dbRef(window.db, `trash/${key}`));
                hasDeleted = true;
            }
        }
        
        if (hasDeleted) {
            await loadTrashFromFirebase();
            loadTrash();
        }
    } catch (error) {
        console.error('Error cleaning expired trash:', error);
    }
}

// NAVEGACIÓN
function showSection(section) {
    document.querySelectorAll('.content-section').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
    
    const sectionElement = document.getElementById(`${section}-section`);
    if (sectionElement) {
        sectionElement.classList.add('active');
    }
    
    event.target.closest('.nav-item').classList.add('active');
    
    const titles = {
        dashboard: 'Dashboard',
        exchange: 'Realizar Cambio',
        history: 'Historial de Operaciones',
        trash: 'Papelera de Reciclaje',
        stats: 'Estadísticas'
    };
    
    document.getElementById('pageTitle').textContent = titles[section] || 'Dashboard';
    
    if (section === 'stats') updateStatsSection();
    if (section === 'trash') loadTrash();

    if (window.innerWidth <= 768) {
        toggleMobileMenu();
    }
}

// TASAS DE CAMBIO
async function fetchOfficialRate() {
    try {
        const response = await fetch('https://v6.exchangerate-api.com/v6/2c0b819a71250fe45a0e679f/latest/USD');
        const data = await response.json();
        
        if (data.rates && data.rates.PEN) {
            currentRates.official = parseFloat(data.rates.PEN.toFixed(2));
            document.getElementById('officialRateInput').value = currentRates.official.toFixed(2);
            
            updateAllRatesDisplay();
            calculateProfit();
            
            await saveRatesToFirebase();
        }
    } catch (error) {
        console.error('Error fetching rate:', error);
    }
}

async function saveRates() {
    const purchaseRate = parseFloat(document.getElementById('purchaseRateInput').value);
    const buyRate = parseFloat(document.getElementById('buyRateInput').value);
    const sellRate = parseFloat(document.getElementById('sellRateInput').value);
    
    if (purchaseRate && buyRate && sellRate) {
        currentRates.purchase = parseFloat(purchaseRate.toFixed(2));
        currentRates.buy = parseFloat(buyRate.toFixed(2));
        currentRates.sell = parseFloat(sellRate.toFixed(2));
        await saveRatesToFirebase();
        
        updateAllRatesDisplay();
        updateDashboard();
        calculateProfit();
        
        alert('✅ Tasas guardadas correctamente');
    } else {
        alert('⚠️ Por favor completa todos los campos de tasas');
    }
}

function updateAllRatesDisplay() {
    document.getElementById('buyRate').textContent = `S/ ${currentRates.buy.toFixed(2)}`;
    document.getElementById('sellRate').textContent = `S/ ${currentRates.sell.toFixed(2)}`;
    document.getElementById('officialRate').textContent = `S/ ${currentRates.official.toFixed(2)}`;
    
    const calcPENBuy = parseFloat(document.getElementById('calcPENBuy').value);
    const calcPENSell = parseFloat(document.getElementById('calcPENSell').value);
    
    if (calcPENBuy > 0) {
        convertPENtoUSDCompra();
    }
    if (calcPENSell > 0) {
        convertPENtoUSDVenta();
    }
}

function loadRates() {
    document.getElementById('officialRateInput').value = currentRates.official.toFixed(2);
    document.getElementById('purchaseRateInput').value = (currentRates.purchase || 3.68).toFixed(2);
    document.getElementById('buyRateInput').value = currentRates.buy.toFixed(2);
    document.getElementById('sellRateInput').value = currentRates.sell.toFixed(2);
    
    document.getElementById('buyRate').textContent = `S/ ${currentRates.buy.toFixed(2)}`;
    document.getElementById('sellRate').textContent = `S/ ${currentRates.sell.toFixed(2)}`;
    document.getElementById('officialRate').textContent = `S/ ${currentRates.official.toFixed(2)}`;
}

// OPERACIONES
function updateOperationForm() {
    calculateProfit();
}

function calculateProfit() {
    const type = document.getElementById('operationType').value;
    const usd = parseFloat(document.getElementById('amountUSD').value) || 0;
    
    let pen = 0;
    let profit = 0;
    
    if (type === 'compra') {
        // Compro dólares al cliente (pago en soles usando mi tasa de compra)
        pen = usd * currentRates.buy;
        // NO HAY GANANCIA en compra (solo inversión de capital)
        profit = 0;
    } else {
        // Vendo dólares al cliente (recibo soles usando mi tasa de venta)
        pen = usd * currentRates.sell;
        // Mi ganancia: diferencia entre mi tasa de venta y la tasa a la que compré
        profit = usd * (currentRates.sell - (currentRates.purchase || 3.68));
    }
    
    document.getElementById('amountPEN').value = pen.toFixed(2);
    document.getElementById('profitAmount').value = type === 'compra' ? '-' : profit.toFixed(2);
}

async function registerOperation() {
    const type = document.getElementById('operationType').value;
    const usd = parseFloat(document.getElementById('amountUSD').value);
    const pen = parseFloat(document.getElementById('amountPEN').value);
    
    if (!usd || usd <= 0) {
        alert('⚠️ Ingresa un monto válido en USD');
        return;
    }
    
    // Calcular ganancia: 0 para compra, diferencia para venta
    let profit = 0;
    if (type === 'venta') {
        profit = usd * (currentRates.sell - (currentRates.purchase || 3.68));
    }
    
    const operation = {
        id: Date.now(),
        date: new Date().toISOString(),
        type,
        usd: parseFloat(usd.toFixed(2)),
        pen: parseFloat(pen.toFixed(2)),
        rate: type === 'compra' ? currentRates.buy : currentRates.sell,
        purchaseRate: currentRates.purchase || 3.68,
        profit: parseFloat(profit.toFixed(2))
    };
    
    // ✅ SOLO GUARDAR EN FIREBASE - El listener en tiempo real actualiza automáticamente
    const firebaseKey = await saveOperationToFirebase(operation);
    
    // Limpiar formulario
    document.getElementById('amountUSD').value = '';
    document.getElementById('amountPEN').value = '';
    document.getElementById('profitAmount').value = '';
    
    alert('✅ Operación registrada exitosamente');
    
    // ✅ IMPRIMIR AUTOMÁTICAMENTE SI ESTÁ ACTIVADO
    if (autoPrintEnabled && firebaseKey) {
        // Guardar temporalmente la operación con su key
        const tempOperation = { ...operation, firebaseKey };
        printReceiptDirect(tempOperation);
    }
    
    showSection('history');
}

// DÓLARES DISPONIBLES
function updateDollarsAvailable() {
    let totalUSD = 0;
    
    operations.forEach(op => {
        if (op.type === 'compra') {
            totalUSD += op.usd;
        } else {
            totalUSD -= op.usd;
        }
    });
    
    document.getElementById('dollarsAvailable').textContent = `$${totalUSD.toFixed(2)}`;
}

// FILTROS
function filterOperations(filter) {
    currentFilter = filter;
    
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    event.target.classList.add('active');
    
    updateFilteredOperations();
}

function updateFilteredOperations() {
    const now = new Date();
    const filterDate = document.getElementById('filterDate').value;
    
    let filtered = operations;
    
    if (filterDate) {
        const selectedDate = new Date(filterDate);
        filtered = operations.filter(op => {
            const opDate = new Date(op.date);
            return opDate.toDateString() === selectedDate.toDateString();
        });
    } else if (currentFilter === 'day') {
        const today = now.toDateString();
        filtered = operations.filter(op => new Date(op.date).toDateString() === today);
    } else if (currentFilter === 'week') {
        const weekStart = getWeekStart(now);
        filtered = operations.filter(op => new Date(op.date) >= weekStart);
    } else if (currentFilter === 'month') {
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        filtered = operations.filter(op => new Date(op.date) >= monthStart);
    } else if (currentFilter === 'year') {
        const yearStart = new Date(now.getFullYear(), 0, 1);
        filtered = operations.filter(op => new Date(op.date) >= yearStart);
    }
    
    const tbody = document.querySelector('#recentOperationsTable tbody');
    tbody.innerHTML = filtered.slice().reverse().map(op => `
        <tr>
            <td>${new Date(op.date).toLocaleString()}</td>
            <td><span class="badge badge-${op.type}">${op.type === 'compra' ? 'Compra' : 'Venta'}</span></td>
            <td>$${op.usd.toFixed(2)}</td>
            <td>S/ ${op.pen.toFixed(2)}</td>
            <td>S/ ${op.rate.toFixed(2)}</td>
            <td>${op.type === 'compra' ? '-' : 'S/ ' + (op.purchaseRate || 3.68).toFixed(2)}</td>
            <td style="${op.type === 'venta' ? 'color: var(--success); font-weight: 600;' : 'color: var(--text-gray);'}">${op.type === 'compra' ? '-' : '+S/ ' + op.profit.toFixed(2)}</td>
        </tr>
    `).join('') || '<tr><td colspan="7" style="text-align: center;">No hay operaciones para mostrar</td></tr>';
}

document.getElementById('filterDate')?.addEventListener('change', updateFilteredOperations);

// HISTORIAL
function loadHistory() {
    const tbody = document.getElementById('historyTableBody');
    tbody.innerHTML = operations.slice().reverse().map(op => `
        <tr>
            <td>${new Date(op.date).toLocaleString()}</td>
            <td><span class="badge badge-${op.type}">${op.type === 'compra' ? 'Compra' : 'Venta'}</span></td>
            <td>$${op.usd.toFixed(2)}</td>
            <td>S/ ${op.pen.toFixed(2)}</td>
            <td>S/ ${op.rate.toFixed(2)}</td>
            <td>${op.type === 'compra' ? '-' : 'S/ ' + (op.purchaseRate || 3.68).toFixed(2)}</td>
            <td style="${op.type === 'venta' ? 'color: var(--success); font-weight: 600;' : 'color: var(--text-gray);'}">${op.type === 'compra' ? '-' : '+S/ ' + op.profit.toFixed(2)}</td>
            <td>
                <div class="action-buttons">
                    <button class="btn btn-small btn-info" onclick="printReceipt('${op.firebaseKey || op.id}')" title="Imprimir Boleta">
                        <svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2">
                            <polyline points="6 9 6 2 18 2 18 9"/>
                            <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
                            <rect x="6" y="14" width="12" height="8"/>
                        </svg>
                    </button>
                    <button class="btn btn-small btn-warning" onclick="openEditModal('${op.firebaseKey || op.id}')">
                        <svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                        </svg>
                    </button>
                    <button class="btn btn-small btn-danger" onclick="deleteOperation('${op.firebaseKey || op.id}')">
                        <svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2">
                            <polyline points="3 6 5 6 21 6"/>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                        </svg>
                    </button>
                </div>
            </td>
        </tr>
    `).join('');
}

// PAPELERA
function loadTrash() {
    const tbody = document.getElementById('trashTableBody');
    
    if (trashedOperations.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align: center;">La papelera está vacía</td></tr>';
        return;
    }
    
    tbody.innerHTML = trashedOperations.slice().reverse().map(op => {
        const deletedAt = new Date(op.deletedAt);
        const expiresAt = new Date(deletedAt.getTime() + 30 * 24 * 60 * 60 * 1000);
        const daysLeft = Math.ceil((expiresAt - new Date()) / (1000 * 60 * 60 * 24));
        
        return `
        <tr>
            <td>${deletedAt.toLocaleString()} <br><small style="color: var(--danger);">(${daysLeft} días restantes)</small></td>
            <td>${new Date(op.date).toLocaleString()}</td>
            <td><span class="badge badge-${op.type}">${op.type === 'compra' ? 'Compra' : 'Venta'}</span></td>
            <td>$${op.usd.toFixed(2)}</td>
            <td>S/ ${op.pen.toFixed(2)}</td>
            <td>S/ ${op.rate.toFixed(2)}</td>
            <td style="${op.type === 'venta' ? 'color: var(--success); font-weight: 600;' : 'color: var(--text-gray);'}">${op.type === 'compra' ? '-' : '+S/ ' + op.profit.toFixed(2)}</td>
            <td>
                <div class="action-buttons">
                    <button class="btn btn-small btn-success" onclick="restoreOperation('${op.firebaseKey}')" title="Restaurar">
                        <svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2">
                            <polyline points="1 4 1 10 7 10"/>
                            <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>
                        </svg>
                    </button>
                    <button class="btn btn-small btn-danger" onclick="permanentDelete('${op.firebaseKey}')" title="Eliminar permanentemente">
                        <svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2">
                            <line x1="18" y1="6" x2="6" y2="18"/>
                            <line x1="6" y1="6" x2="18" y2="18"/>
                        </svg>
                    </button>
                </div>
            </td>
        </tr>
    `;
    }).join('');
}

async function restoreOperation(firebaseKey) {
    if (confirm('¿Restaurar esta operación?')) {
        const success = await restoreFromTrash(firebaseKey);
        if (success) {
            alert('✅ Operación restaurada exitosamente');
        } else {
            alert('❌ Error al restaurar la operación');
        }
    }
}

async function permanentDelete(firebaseKey) {
    if (confirm('¿Eliminar permanentemente esta operación? Esta acción no se puede deshacer.')) {
        await deleteFromTrash(firebaseKey);
        alert('✅ Operación eliminada permanentemente');
    }
}

// IMPRIMIR BOLETA
function printReceipt(key) {
    const operation = operations.find(op => (op.firebaseKey || op.id) === key);
    if (!operation) return;
    
    printReceiptDirect(operation);
}

function printReceiptDirect(operation) {
    const date = new Date(operation.date);
    const dateStr = date.toLocaleDateString('es-PE');
    const timeStr = date.toLocaleTimeString('es-PE');
    
    const operationType = operation.type === 'compra' ? 'Compra de dólares' : 'Venta de dólares';
    
    // Crear contenido de la boleta
    const receiptContent = `
===================================
    BOLETA DE CAMBIO DE DÓLAR
===================================
Fecha: ${dateStr} ${timeStr}
-----------------------------------
Operación: ${operationType}
Monto USD: $${operation.usd.toFixed(2)}
Tipo de cambio: S/. ${operation.rate.toFixed(2)}
-----------------------------------
TOTAL:  S/. ${operation.pen.toFixed(2)}
===================================
   Gracias por su preferencia
===================================
    `;
    
    // Calcular posición centrada
    const width = 400;
    const height = 600;
    const left = (screen.width / 2) - (width / 2);
    const top = (screen.height / 2) - (height / 2);
    
    // Crear ventana de impresión centrada
    const printWindow = window.open('', '', `width=${width},height=${height},left=${left},top=${top}`);
    printWindow.document.write(`
        <html>
        <head>
            <title>Boleta de Cambio</title>
            <style>
                body {
                    font-family: 'Courier New', monospace;
                    font-size: 14px;
                    padding: 20px;
                    margin: 0;
                }
                pre {
                    white-space: pre;
                    margin: 0;
                    line-height: 1.5;
                }
                @media print {
                    body {
                        padding: 0;
                    }
                }
            </style>
        </head>
        <body>
            <pre>${receiptContent}</pre>
        </body>
        </html>
    `);
    
    printWindow.document.close();
    
    // Imprimir automáticamente
    setTimeout(() => {
        printWindow.print();
        printWindow.close();
    }, 250);
}

// 🖨️ TOGGLE DE IMPRESIÓN AUTOMÁTICA
function toggleAutoPrint() {
    autoPrintEnabled = !autoPrintEnabled;
    const btn = document.getElementById('autoPrintBtn');
    const icon = document.getElementById('autoPrintIcon');
    
    if (autoPrintEnabled) {
        btn.classList.add('active');
        btn.style.background = 'linear-gradient(135deg, #10b981 0%, #059669 100%)';
        icon.style.fill = 'white';
    } else {
        btn.classList.remove('active');
        btn.style.background = 'linear-gradient(135deg, var(--primary-blue) 0%, var(--dark-blue) 100%)';
        icon.style.fill = 'none';
    }
    
    // Guardar preferencia en localStorage
    localStorage.setItem('autoPrintEnabled', autoPrintEnabled);
}

// EDITAR OPERACIÓN
function openEditModal(key) {
    const operation = operations.find(op => (op.firebaseKey || op.id) === key);
    if (!operation) return;
    
    editingOperationKey = key;
    
    const date = new Date(operation.date);
    const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    
    document.getElementById('editDate').value = localDate;
    document.getElementById('editType').value = operation.type;
    document.getElementById('editUSD').value = operation.usd.toFixed(2);
    document.getElementById('editPEN').value = operation.pen.toFixed(2);
    document.getElementById('editRate').value = operation.rate.toFixed(2);
    document.getElementById('editPurchaseRate').value = (operation.purchaseRate || 3.68).toFixed(2);
    
    calculateEditProfit();
    
    document.getElementById('editModal').classList.add('active');
}

function closeEditModal() {
    document.getElementById('editModal').classList.remove('active');
    editingOperationKey = null;
}

function calculateEditProfit() {
    const type = document.getElementById('editType').value;
    const usd = parseFloat(document.getElementById('editUSD').value) || 0;
    const rate = parseFloat(document.getElementById('editRate').value) || 0;
    const purchaseRate = parseFloat(document.getElementById('editPurchaseRate').value) || 0;
    
    let profit = 0;
    
    if (type === 'venta') {
        // Solo hay ganancia en ventas
        profit = usd * (rate - purchaseRate);
    }
    // Si es compra, profit se queda en 0
    
    document.getElementById('editProfit').value = type === 'compra' ? '-' : profit.toFixed(2);
}

document.getElementById('editType')?.addEventListener('change', calculateEditProfit);
document.getElementById('editUSD')?.addEventListener('input', calculateEditProfit);
document.getElementById('editRate')?.addEventListener('input', calculateEditProfit);
document.getElementById('editPurchaseRate')?.addEventListener('input', calculateEditProfit);

async function saveEdit() {
    if (!editingOperationKey) return;
    
    const date = new Date(document.getElementById('editDate').value);
    const type = document.getElementById('editType').value;
    const usd = parseFloat(document.getElementById('editUSD').value);
    const pen = parseFloat(document.getElementById('editPEN').value);
    const rate = parseFloat(document.getElementById('editRate').value);
    const purchaseRate = parseFloat(document.getElementById('editPurchaseRate').value);
    
    if (!usd || !pen || !rate || !purchaseRate) {
        alert('⚠️ Completa todos los campos');
        return;
    }
    
    // Calcular ganancia: 0 para compra, diferencia para venta
    let profit = 0;
    if (type === 'venta') {
        profit = usd * (rate - purchaseRate);
    }
    
    const updatedOperation = {
        date: date.toISOString(),
        type,
        usd: parseFloat(usd.toFixed(2)),
        pen: parseFloat(pen.toFixed(2)),
        rate: parseFloat(rate.toFixed(2)),
        purchaseRate: parseFloat(purchaseRate.toFixed(2)),
        profit: parseFloat(profit.toFixed(2))
    };
    
    const success = await updateOperationInFirebase(editingOperationKey, updatedOperation);
    
    if (success) {
        const index = operations.findIndex(op => (op.firebaseKey || op.id) === editingOperationKey);
        if (index !== -1) {
            operations[index] = {
                ...operations[index],
                ...updatedOperation
            };
        }
        
        updateDashboard();
        updateDollarsAvailable();
        loadHistory();
        updateStatsSection();
        
        closeEditModal();
        alert('✅ Operación actualizada exitosamente');
    } else {
        alert('❌ Error al actualizar la operación');
    }
}

async function deleteOperation(key) {
    if (confirm('¿Mover esta operación a la papelera?')) {
        const operation = operations.find(o => (o.firebaseKey || o.id) === key);
        if (!operation) return;
        
        // Mover a la papelera
        await moveToTrash(operation);
        
        // Eliminar de operations
        await deleteOperationFromFirebase(operation.firebaseKey || key);
        
        operations = operations.filter(o => (o.firebaseKey || o.id) !== key);
        
        updateDashboard();
        updateDollarsAvailable();
        loadHistory();
        updateStatsSection();
        
        alert('✅ Operación movida a la papelera. Se eliminará automáticamente en 30 días.');
    }
}

// DASHBOARD
function updateDashboard() {
    const now = new Date();
    const today = now.toDateString();
    const thisWeek = getWeekStart(now);
    const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    
    let totalToday = 0;
    let totalWeek = 0;
    let totalMonth = 0;
    
    operations.forEach(op => {
        const opDate = new Date(op.date);
        // Solo sumar ganancias de ventas
        if (op.type === 'venta') {
            if (opDate.toDateString() === today) totalToday += op.profit;
            if (opDate >= thisWeek) totalWeek += op.profit;
            if (opDate >= thisMonth) totalMonth += op.profit;
        }
    });
    
    document.getElementById('totalToday').textContent = `S/ ${totalToday.toFixed(2)}`;
    document.getElementById('totalWeek').textContent = `S/ ${totalWeek.toFixed(2)}`;
    document.getElementById('totalMonth').textContent = `S/ ${totalMonth.toFixed(2)}`;
    document.getElementById('totalOperations').textContent = operations.length;
    
    updateFilteredOperations();
}

function getWeekStart(date) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    return new Date(d.setDate(diff));
}

// ESTADÍSTICAS
function initializeCharts() {
    updateStatsSection();
}

function updateStatsSection() {
    // Solo contar ganancias de ventas
    const totalProfit = operations.reduce((sum, op) => {
        return sum + (op.type === 'venta' ? op.profit : 0);
    }, 0);
    
    const buyOps = operations.filter(op => op.type === 'compra').length;
    const sellOps = operations.filter(op => op.type === 'venta').length;
    
    // Promedio solo de operaciones de venta
    const avgProfit = sellOps > 0 ? totalProfit / sellOps : 0;
    
    document.getElementById('statsProfit').textContent = `S/ ${totalProfit.toFixed(2)}`;
    document.getElementById('statsBuyOps').textContent = buyOps;
    document.getElementById('statsSellOps').textContent = sellOps;
    document.getElementById('statsAvgProfit').textContent = `S/ ${avgProfit.toFixed(2)}`;
    
    const opCtx = document.getElementById('operationsChart').getContext('2d');
    if (charts.operations) charts.operations.destroy();
    charts.operations = new Chart(opCtx, {
        type: 'doughnut',
        data: {
            labels: ['Compra', 'Venta'],
            datasets: [{
                data: [buyOps, sellOps],
                backgroundColor: ['#10b981', '#2563eb']
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false
        }
    });
    
    const weekCtx = document.getElementById('weeklyChart').getContext('2d');
    if (charts.weekly) charts.weekly.destroy();
    
    const weekLabels = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
    const weekData = new Array(7).fill(0);
    
    operations.forEach(op => {
        // Solo contar ganancias de ventas
        if (op.type === 'venta') {
            const day = new Date(op.date).getDay();
            const index = day === 0 ? 6 : day - 1;
            weekData[index] += op.profit;
        }
    });
    
    charts.weekly = new Chart(weekCtx, {
        type: 'bar',
        data: {
            labels: weekLabels,
            datasets: [{
                label: 'Ganancia (S/)',
                data: weekData,
                backgroundColor: '#2563eb'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: true
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: function(value) {
                            return 'S/ ' + value.toFixed(2);
                        }
                    }
                }
            }
        },
        plugins: [{
            afterDatasetsDraw: function(chart) {
                const ctx = chart.ctx;
                chart.data.datasets.forEach((dataset, i) => {
                    const meta = chart.getDatasetMeta(i);
                    meta.data.forEach((bar, index) => {
                        const data = dataset.data[index];
                        if (data > 0) {
                            ctx.fillStyle = '#1e293b';
                            ctx.font = 'bold 12px sans-serif';
                            ctx.textAlign = 'center';
                            ctx.fillText('S/ ' + data.toFixed(2), bar.x, bar.y - 5);
                        }
                    });
                });
            }
        }]
    });
}

// CALCULADORA
function toggleCalculator() {
    const calculatorSection = document.getElementById('calculatorSection');
    calculatorSection.classList.toggle('collapsed');
}

function convertPENtoUSDCompra() {
    const pen = parseFloat(document.getElementById('calcPENBuy').value) || 0;
    const usd = pen / currentRates.buy;
    document.getElementById('resultUSDBuy').textContent = `$${usd.toFixed(2)} USD`;
}

function convertPENtoUSDVenta() {
    const pen = parseFloat(document.getElementById('calcPENSell').value) || 0;
    const usd = pen / currentRates.sell;
    document.getElementById('resultUSDSell').textContent = `$${usd.toFixed(2)} USD`;
}

// LOGOUT
function logout() {
    if (confirm('¿Cerrar sesión?')) {
        document.getElementById('dashboardWrapper').classList.remove('active');
        document.getElementById('pinContainer').style.display = 'block';
        document.getElementById('pinInput').value = '';
        document.getElementById('mobileMenuBtn').style.display = 'none';
    }
}