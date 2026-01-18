// ==================== VARIABLES GLOBALES ====================
let currentUser = null;
let currentRates = {
    official: 3.72,
    buy: 3.70,
    sell: 3.75,
    lastUpdate: null
};
let operations = [];
let dollarBlocks = [];
let trashedOperations = [];
let charts = {};
let currentFilter = 'all';
let editingOperationKey = null;
let autoPrintEnabled = false;
let verificationCode = null;
let pendingPasswordChange = null;
let originalRates = {};
let selectedOperationType = 'compra';
let selectedEditType = 'compra';
let originalUserData = {};
let hasUnsavedSettings = false;
let lastCodeSentTime = 0; // Timestamp del último código enviado

// ==================== UTILIDAD ENTER KEY ====================
function handleEnter(event, action) {
    if (event.key === 'Enter') {
        event.preventDefault();
        switch (action) {
            case 'login':
                handleLogin();
                break;
            case 'register':
                handleRegister();
                break;
            case 'forgot':
                handleForgotPassword();
                break;
            case 'verify':
                handleVerifyCode();
                break;
            case 'deleteAccount':
                confirmAccountDeletion();
                break;
        }
    }
}

// Paginación
let currentPage = 0;
const ITEMS_PER_PAGE = 60;
let isLoadingMore = false;

// Configuración de EmailJS
const EMAILJS_SERVICE_ID = 'service_51922oo';
const EMAILJS_TEMPLATE_VERIFICATION = 'template_verification';

const LOADING_MESSAGES = [
    'Preparando tu espacio de trabajo...',
    'Cargando tipos de cambio...',
    'Sincronizando operaciones...',
    'Actualizando estadísticas...',
    'Casi listo...'
];

// ==================== INICIO DE APLICACIÓN ====================
document.addEventListener('DOMContentLoaded', async () => {
    console.log('App iniciada');

    // Verificar sesión existente
    const savedSession = localStorage.getItem('casaDeCambioSession');
    if (savedSession) {
        try {
            const session = JSON.parse(savedSession);
            if (session.userId && session.timestamp) {
                const daysSinceLogin = (Date.now() - session.timestamp) / (1000 * 60 * 60 * 24);
                if (daysSinceLogin < 7) {
                    currentUser = session;
                    await loadUserData();
                    return;
                }
            }
        } catch (error) {
            console.error('Error cargando sesión:', error);
        }
    }

    document.getElementById('authContainer').style.display = 'flex';
    document.getElementById('loadingScreen').classList.add('hidden');

    // Cargar tema guardado
    const savedTheme = localStorage.getItem('appTheme') || 'light';
    applyTheme(savedTheme);
});

// ==================== LOADING SCREEN ====================
async function showLoadingScreen(username) {
    const loadingScreen = document.getElementById('loadingScreen');
    const greeting = document.getElementById('loadingGreeting');
    const message = document.getElementById('loadingMessage');
    const bar = document.getElementById('loadingBar');

    loadingScreen.classList.remove('hidden');
    greeting.textContent = `¡Hola ${username.toUpperCase()}!`;

    let messageIndex = 0;
    let progress = 0;

    const updateMessage = () => {
        message.textContent = LOADING_MESSAGES[messageIndex];
        messageIndex = (messageIndex + 1) % LOADING_MESSAGES.length;
    };

    updateMessage();
    const messageInterval = setInterval(updateMessage, 1000);

    const progressInterval = setInterval(() => {
        progress += Math.random() * 15;
        if (progress > 100) progress = 100;
        bar.style.width = `${progress}%`;
    }, 300);

    await new Promise(resolve => setTimeout(resolve, 2000));

    clearInterval(messageInterval);
    clearInterval(progressInterval);
    bar.style.width = '100%';

    await new Promise(resolve => setTimeout(resolve, 500));

    loadingScreen.classList.add('hidden');
    document.getElementById('authContainer').style.display = 'none';
    document.getElementById('dashboardWrapper').classList.add('active');

    // Mostrar botón hamburguesa solo en móvil
    updateMobileMenuVisibility();
}

function updateMobileMenuVisibility() {
    const mobileBtn = document.getElementById('mobileMenuBtn');
    if (window.innerWidth <= 768) {
        mobileBtn.style.display = 'block';
    } else {
        mobileBtn.style.display = 'none';
    }
}

window.addEventListener('resize', updateMobileMenuVisibility);

async function loadUserData() {
    await showLoadingScreen(currentUser.username);
    await initializeDashboard();
}

// ==================== AUTENTICACIÓN ====================
function showLogin() {
    hideAllAuthForms();
    document.getElementById('loginForm').classList.add('active');
}

function showRegister() {
    hideAllAuthForms();
    document.getElementById('registerForm').classList.add('active');
}

function showForgotPassword() {
    hideAllAuthForms();
    document.getElementById('forgotForm').classList.add('active');
}

function showVerifyCode() {
    hideAllAuthForms();
    document.getElementById('verifyForm').classList.add('active');

    // Iniciar contador de reenvío
    startResendCountdown('verifyResend', 60);
}

function hideAllAuthForms() {
    document.querySelectorAll('.auth-form').forEach(form => {
        form.classList.remove('active');
    });
}

async function handleLogin() {
    const userInput = document.getElementById('loginUser').value.trim();
    const password = document.getElementById('loginPassword').value;
    const errorDiv = document.getElementById('loginError');

    if (!userInput || !password) {
        showError(errorDiv, 'Por favor completa todos los campos');
        return;
    }

    try {
        const usersSnapshot = await window.dbGet(
            window.dbRef(window.db, 'users')
        );

        if (!usersSnapshot.exists()) {
            showError(errorDiv, 'No hay usuarios registrados');
            return;
        }

        const users = usersSnapshot.val();
        let foundUser = null;

        for (const userId in users) {
            const user = users[userId];
            if (
                user.username.toLowerCase() === userInput.toLowerCase() ||
                user.email.toLowerCase() === userInput.toLowerCase()
            ) {
                if (user.password === password) {
                    foundUser = { userId, ...user };
                    break;
                }
            }
        }

        if (!foundUser) {
            showError(errorDiv, 'Usuario o contraseña incorrectos');
            return;
        }

        if (foundUser.status === 'inactive') {
            showError(
                errorDiv,
                'Esta cuenta ha sido desactivada. Contacta con soporte para reactivarla.'
            );
            return;
        }

        currentUser = {
            userId: foundUser.userId,
            username: foundUser.username,
            email: foundUser.email,
            timestamp: Date.now()
        };

        localStorage.setItem(
            'casaDeCambioSession',
            JSON.stringify(currentUser)
        );

        await loadUserData();

    } catch (error) {
        console.error('Error en login:', error);
        showError(errorDiv, 'Error al iniciar sesión');
    }
}


async function handleRegister() {
    const username = document.getElementById('registerUser').value.trim();
    const email = document.getElementById('registerEmail').value.trim();
    const password = document.getElementById('registerPassword').value;
    const confirm = document.getElementById('registerConfirm').value;
    const errorDiv = document.getElementById('registerError');

    if (!username || !email || !password || !confirm) {
        showError(errorDiv, 'Por favor completa todos los campos');
        return;
    }

    // ✅ VALIDAR EMAIL
    if (!isValidEmail(email)) {
        showError(errorDiv, 'Por favor ingresa un correo electrónico válido');
        return;
    }

    if (password !== confirm) {
        showError(errorDiv, 'Las contraseñas no coinciden');
        return;
    }

    if (password.length < 4) {
        showError(errorDiv, 'La contraseña debe tener al menos 4 caracteres');
        return;
    }

    try {
        const usersSnapshot = await window.dbGet(window.dbRef(window.db, 'users'));

        if (usersSnapshot.exists()) {
            const users = usersSnapshot.val();

            for (const userId in users) {
                const user = users[userId];
                if (user.username.toLowerCase() === username.toLowerCase()) {
                    showError(errorDiv, 'El nombre de usuario ya está en uso');
                    return;
                }
                if (user.email.toLowerCase() === email.toLowerCase()) {
                    showError(errorDiv, 'El correo electrónico ya está registrado');
                    return;
                }
            }
        }

        const userId = username.toLowerCase().replace(/\s+/g, '_');
        const newUser = {
            username: username,
            email: email,
            password: password,
            createdAt: new Date().toISOString()
        };

        await window.dbSet(window.dbRef(window.db, `users/${userId}`), newUser);

        showModal('¡Registro Exitoso!', 'Tu cuenta ha sido creada correctamente.', [
            {
                text: 'Iniciar Sesión', primary: true, action: () => {
                    closeModal();
                    showLogin();
                }
            }
        ]);

    } catch (error) {
        console.error('Error en registro:', error);
        showError(errorDiv, 'Error al crear la cuenta');
    }
}

async function handleForgotPassword(button) {
    if (!button) return;

    // 🔒 Deshabilitar botón por 5 segundos (PASE LO QUE PASE)
    button.disabled = true;
    button.classList.add('disabled');

    setTimeout(() => {
        button.disabled = false;
        button.classList.remove('disabled');
    }, 5000);

    const email = document.getElementById('forgotEmail').value.trim();
    const errorDiv = document.getElementById('forgotError');

    if (!email) {
        showError(errorDiv, 'Por favor ingresa tu correo electrónico');
        return;
    }

    // ✅ VALIDAR EMAIL
    if (!isValidEmail(email)) {
        showError(errorDiv, 'Por favor ingresa un correo electrónico válido');
        return;
    }

    // ⏱️ Verificar límite de 1 minuto
    const now = Date.now();
    const timeSinceLastCode = now - lastCodeSentTime;
    const oneMinute = 60000;

    if (timeSinceLastCode < oneMinute) {
        const secondsLeft = Math.ceil((oneMinute - timeSinceLastCode) / 1000);
        showError(
            errorDiv,
            `Por favor espera ${secondsLeft} segundos antes de solicitar otro código`
        );
        return;
    }

    try {
        const usersSnapshot = await window.dbGet(
            window.dbRef(window.db, 'users')
        );

        if (!usersSnapshot.exists()) {
            showError(errorDiv, 'No se encontró ningún usuario con ese correo');
            return;
        }

        const users = usersSnapshot.val();
        let foundUser = null;

        for (const userId in users) {
            const user = users[userId];
            if (user.email.toLowerCase() === email.toLowerCase()) {
                if (user.status === 'inactive') {
                    showError(errorDiv, 'Esta cuenta ha sido desactivada');
                    return;
                }
                foundUser = { userId, ...user };
                break;
            }
        }

        if (!foundUser) {
            showError(errorDiv, 'No se encontró ningún usuario con ese correo');
            return;
        }

        // 🔐 Generar código de verificación
        verificationCode = Math.floor(100000 + Math.random() * 900000).toString();

        pendingPasswordChange = {
            ...foundUser
        };

        // 📧 Enviar correo
        await sendVerificationEmail(
            email,
            verificationCode,
            'Has solicitado recuperar tu contraseña. Usa el siguiente código de verificación para continuar:'
        );

        // 🕒 Guardar timestamp
        lastCodeSentTime = Date.now();

        showModal(
            'Código Enviado',
            'Hemos enviado un código de verificación a tu correo electrónico.',
            [
                {
                    text: 'Continuar',
                    primary: true,
                    action: () => {
                        closeModal();
                        showVerifyCode();
                    }
                }
            ]
        );

    } catch (error) {
        console.error('Error en recuperación:', error);
        showError(errorDiv, 'Error al enviar el código de verificación');
    }
}

async function handleVerifyCode() {
    const code = document.getElementById('verifyCode').value.trim();
    const newPassword = document.getElementById('newPassword').value;
    const confirmPassword = document.getElementById('confirmNewPassword').value;
    const errorDiv = document.getElementById('verifyError');

    if (!code || !newPassword || !confirmPassword) {
        showError(errorDiv, 'Por favor completa todos los campos');
        return;
    }

    if (code !== verificationCode) {
        showError(errorDiv, 'El código de verificación es incorrecto');
        return;
    }

    if (newPassword !== confirmPassword) {
        showError(errorDiv, 'Las contraseñas no coinciden');
        return;
    }

    if (newPassword.length < 4) {
        showError(errorDiv, 'La contraseña debe tener al menos 4 caracteres');
        return;
    }

    try {
        await window.dbUpdate(
            window.dbRef(window.db, `users/${pendingPasswordChange.userId}`),
            { password: newPassword }
        );


        showModal('¡Contraseña Actualizada!', 'Tu contraseña ha sido cambiada exitosamente. Te recomendamos mantenerla segura.', [
            {
                text: 'Iniciar Sesión', primary: true, action: () => {
                    closeModal();
                    showLogin();
                    verificationCode = null;
                    pendingPasswordChange = null;
                }
            }
        ]);

    } catch (error) {
        console.error('Error al cambiar contraseña:', error);
        showError(errorDiv, 'Error al actualizar la contraseña');
    }
}

function showError(element, message) {
    element.textContent = message;
    element.classList.add('show');
    setTimeout(() => element.classList.remove('show'), 5000);
}

function logout() {
    showModal('Cerrar Sesión', '¿Estás seguro de que deseas cerrar sesión?', [
        { text: 'Cancelar', primary: false, action: closeModal },
        {
            text: 'Cerrar Sesión', primary: true, action: () => {
                localStorage.removeItem('casaDeCambioSession');
                location.reload();
            }
        }
    ]);
}

async function sendVerificationEmail(email, code, message = 'Has solicitado un código de verificación. Usa el siguiente código para continuar:') {
    try {
        const templateParams = {
            to_email: email,
            verification_code: code,
            message: message,
            current_year: new Date().getFullYear()
        };

        const response = await emailjs.send(
            EMAILJS_SERVICE_ID,
            EMAILJS_TEMPLATE_VERIFICATION,
            templateParams
        );

        console.log('Email enviado exitosamente:', response);
        return true;
    } catch (error) {
        console.error('Error en EmailJS:', error);
        throw error;
    }
}

// ==================== EXCHANGE RATE API ====================
async function fetchOfficialRate() {
    const now = new Date();
    const hour = now.getHours();

    if (hour < 8 || hour >= 20) {
        console.log('Fuera del horario de actualización (8AM-8PM)');
        return;
    }

    try {
        const response = await fetch(`https://open.er-api.com/v6/latest/USD`);
        const data = await response.json();

        if (data.rates && data.rates.PEN) {
            const newRate = parseFloat(data.rates.PEN.toFixed(2));
            currentRates.official = newRate;
            currentRates.lastUpdate = new Date().toISOString();

            document.getElementById('officialRateInput').value = newRate.toFixed(2);
            document.getElementById('officialRate').textContent = `S/ ${newRate.toFixed(2)}`;

            updateLastUpdateText();

            await window.dbUpdate(window.dbRef(window.db, `rates/${currentUser.userId}`), {
                official: newRate,
                lastUpdate: currentRates.lastUpdate
            });
        }
    } catch (error) {
        console.error('Error al obtener tasa oficial:', error);
    }
}

function updateLastUpdateText() {
    const lastUpdateEl = document.getElementById('lastUpdate');
    if (!lastUpdateEl || !currentRates.lastUpdate) return;

    const lastUpdate = new Date(currentRates.lastUpdate);
    const now = new Date();
    const diffMinutes = Math.floor((now - lastUpdate) / (1000 * 60));

    if (diffMinutes < 1) {
        lastUpdateEl.textContent = 'Actualizado hace unos momentos';
    } else if (diffMinutes < 60) {
        lastUpdateEl.textContent = `Actualizado hace ${diffMinutes} minuto${diffMinutes > 1 ? 's' : ''}`;
    } else {
        const diffHours = Math.floor(diffMinutes / 60);
        lastUpdateEl.textContent = `Actualizado hace ${diffHours} hora${diffHours > 1 ? 's' : ''}`;
    }
}

function openDollarLink() {
    window.open('https://www.google.com/search?q=precio+del+dolar', '_blank');
}

// ==================== INICIALIZACIÓN DEL DASHBOARD ====================
async function initializeDashboard() {
    document.getElementById('sidebarUsername').textContent = currentUser.username.toUpperCase();

    const settingsUsername = document.getElementById('settingsUsername');
    const settingsEmail = document.getElementById('settingsEmail');
    if (settingsUsername) settingsUsername.value = currentUser.username;
    if (settingsEmail) settingsEmail.value = currentUser.email;

    originalUserData = {
        username: currentUser.username,
        email: currentUser.email
    };

    // Cargar configuraciones del usuario
    await loadUserSettings();

    await loadRatesFromFirebase();
    await loadOperationsFromFirebase();
    await loadDollarBlocksFromFirebase();
    await loadTrashFromFirebase();

    fetchOfficialRate();
    setInterval(() => fetchOfficialRate(), 4 * 60 * 60 * 1000);

    updateDashboard();
    updateDollarsAvailable();
    updateDollarBlocksDisplay();
    initializeCharts();

    setupRealtimeListeners();

    setInterval(cleanExpiredTrash, 60 * 60 * 1000);
    cleanExpiredTrash();

    document.getElementById('filterDate')?.addEventListener('change', updateFilteredOperations);
}

async function loadUserSettings() {
    try {
        const snapshot = await window.dbGet(window.dbRef(window.db, `settings/${currentUser.userId}`));
        if (snapshot.exists()) {
            const settings = snapshot.val();

            // Aplicar tema
            if (settings.theme) {
                applyTheme(settings.theme);
            }

            // Aplicar auto-print
            if (settings.autoPrint !== undefined) {
                autoPrintEnabled = settings.autoPrint;
                updateAutoPrintButton();
            }
        } else {
            // Configuración por defecto
            await saveUserSettings({
                theme: 'light',
                autoPrint: false
            });
        }
    } catch (error) {
        console.error('Error cargando configuraciones:', error);
    }
}

async function saveUserSettings(settings) {
    try {
        await window.dbUpdate(
            window.dbRef(window.db, `settings/${currentUser.userId}`),
            settings
        );
    } catch (error) {
        console.error('Error guardando configuraciones:', error);
    }
}

function updateAutoPrintButton() {
    const btn = document.getElementById('autoPrintBtn');
    const icon = document.getElementById('autoPrintIcon');
    if (btn && icon) {
        if (autoPrintEnabled) {
            btn.classList.add('active');
            icon.style.fill = 'white';
        } else {
            btn.classList.remove('active');
            icon.style.fill = 'none';
        }
    }
}

function setupRealtimeListeners() {
    if (!window.db || !currentUser) return;

    window.dbOnValue(window.dbRef(window.db, `operations/${currentUser.userId}`), (snapshot) => {
        if (snapshot.exists()) {
            const data = snapshot.val();
            operations = Object.keys(data).map(key => ({
                ...data[key],
                firebaseKey: key
            })).sort((a, b) => new Date(b.date) - new Date(a.date));
        } else {
            operations = [];
        }

        currentPage = 0;
        recalculateDollarBlocks();
        updateDashboard();
        updateDollarsAvailable();
        loadHistory();
        updateStatsSection();
    });

    window.dbOnValue(window.dbRef(window.db, `rates/${currentUser.userId}`), (snapshot) => {
        if (snapshot.exists()) {
            currentRates = { ...currentRates, ...snapshot.val() };
            loadRates();
            updateAllRatesDisplay();
            calculateProfit();
        }
    });

    window.dbOnValue(window.dbRef(window.db, `trash/${currentUser.userId}`), (snapshot) => {
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

// ==================== FIREBASE - RATES ====================
async function loadRatesFromFirebase() {
    try {
        const snapshot = await window.dbGet(window.dbRef(window.db, `rates/${currentUser.userId}`));
        if (snapshot.exists()) {
            currentRates = { ...currentRates, ...snapshot.val() };
        } else {
            await window.dbSet(window.dbRef(window.db, `rates/${currentUser.userId}`), currentRates);
        }
        loadRates();
        originalRates = { ...currentRates };
    } catch (error) {
        console.error('Error cargando tasas:', error);
        loadRates();
    }
}

async function saveRates() {
    const buyRate = parseFloat(document.getElementById('buyRateInput').value);
    const sellRate = parseFloat(document.getElementById('sellRateInput').value);

    if (!buyRate || !sellRate) {
        showModal('Error', 'Por favor completa todos los campos de tasas', [
            { text: 'Entendido', primary: true, action: closeModal }
        ]);
        return;
    }

    if (buyRate <= 0 || sellRate <= 0) {
        showModal('Error', 'Las tasas deben ser mayores a cero', [
            { text: 'Entendido', primary: true, action: closeModal }
        ]);
        return;
    }

    currentRates.buy = parseFloat(buyRate.toFixed(2));
    currentRates.sell = parseFloat(sellRate.toFixed(2));

    try {
        await window.dbUpdate(window.dbRef(window.db, `rates/${currentUser.userId}`), {
            buy: currentRates.buy,
            sell: currentRates.sell
        });

        originalRates = { ...currentRates };
        document.getElementById('unsavedRatesBadge').style.display = 'none';

        updateAllRatesDisplay();
        calculateProfit();

        showToast('Tasas Guardadas', 'Las tasas de cambio han sido actualizadas correctamente');

    } catch (error) {
        console.error('Error guardando tasas:', error);
        showModal('Error', 'No se pudieron guardar las tasas', [
            { text: 'Entendido', primary: true, action: closeModal }
        ]);
    }
}

function loadRates() {
    document.getElementById('officialRateInput').value = currentRates.official.toFixed(2);
    document.getElementById('buyRateInput').value = currentRates.buy.toFixed(2);
    document.getElementById('sellRateInput').value = currentRates.sell.toFixed(2);

    updateAllRatesDisplay();
}

function updateAllRatesDisplay() {
    document.getElementById('buyRate').textContent = `S/ ${currentRates.buy.toFixed(2)}`;
    document.getElementById('sellRate').textContent = `S/ ${currentRates.sell.toFixed(2)}`;
    document.getElementById('officialRate').textContent = `S/ ${currentRates.official.toFixed(2)}`;

    updateLastUpdateText();
}

function markRatesUnsaved() {
    const buyRate = parseFloat(document.getElementById('buyRateInput').value);
    const sellRate = parseFloat(document.getElementById('sellRateInput').value);

    const hasChanges = buyRate !== originalRates.buy || sellRate !== originalRates.sell;

    document.getElementById('unsavedRatesBadge').style.display = hasChanges ? 'flex' : 'none';
}

// ==================== FIREBASE - OPERATIONS ====================
async function loadOperationsFromFirebase() {
    if (!currentUser) return;

    try {
        const snapshot = await window.dbGet(window.dbRef(window.db, `operations/${currentUser.userId}`));
        if (snapshot.exists()) {
            const data = snapshot.val();
            operations = Object.keys(data).map(key => ({
                ...data[key],
                firebaseKey: key
            })).sort((a, b) => new Date(b.date) - new Date(a.date));
        }
    } catch (error) {
        console.error('Error cargando operaciones:', error);
    }
}

async function saveOperationToFirebase(operation) {
    if (!currentUser) return null;

    try {
        const newOpRef = window.dbPush(window.dbRef(window.db, `operations/${currentUser.userId}`));
        await window.dbSet(newOpRef, operation);
        return newOpRef.key;
    } catch (error) {
        console.error('Error guardando operación:', error);
        return null;
    }
}

async function updateOperationInFirebase(firebaseKey, operation) {
    if (!currentUser) return false;

    try {
        await window.dbUpdate(
            window.dbRef(window.db, `operations/${currentUser.userId}/${firebaseKey}`),
            operation
        );
        return true;
    } catch (error) {
        console.error('Error actualizando operación:', error);
        return false;
    }
}

async function deleteOperationFromFirebase(firebaseKey) {
    if (!currentUser) return;

    try {
        await window.dbRemove(window.dbRef(window.db, `operations/${currentUser.userId}/${firebaseKey}`));
    } catch (error) {
        console.error('Error eliminando operación:', error);
    }
}

// ==================== FIREBASE - DOLLAR BLOCKS ====================
async function loadDollarBlocksFromFirebase() {
    if (!currentUser) return;

    try {
        const snapshot = await window.dbGet(window.dbRef(window.db, `dollarBlocks/${currentUser.userId}`));
        if (snapshot.exists()) {
            const data = snapshot.val();
            dollarBlocks = Object.keys(data).map(key => ({
                ...data[key],
                firebaseKey: key
            }));
        }
    } catch (error) {
        console.error('Error cargando bloques:', error);
    }
}

async function saveDollarBlocksToFirebase() {
    if (!currentUser) return;

    try {
        const blocksData = {};
        dollarBlocks.forEach((block, index) => {
            const key = block.firebaseKey || `block_${Date.now()}_${index}`;
            blocksData[key] = {
                amount: block.amount,
                rate: block.rate,
                createdAt: block.createdAt || new Date().toISOString()
            };
        });

        await window.dbSet(window.dbRef(window.db, `dollarBlocks/${currentUser.userId}`), blocksData);
    } catch (error) {
        console.error('Error guardando bloques:', error);
    }
}

// ==================== SISTEMA DE BLOQUES FIFO ====================
function addDollarBlock(amount, rate) {
    const existingBlock = dollarBlocks.find(block =>
        Math.abs(block.rate - rate) < 0.01
    );

    if (existingBlock) {
        existingBlock.amount += amount;
    } else {
        dollarBlocks.push({
            amount: parseFloat(amount.toFixed(2)),
            rate: parseFloat(rate.toFixed(2)),
            createdAt: new Date().toISOString()
        });
    }

    dollarBlocks.sort((a, b) => a.rate - b.rate);
    saveDollarBlocksToFirebase();
}

function useDollarBlocks(amount) {
    const usedBlocks = [];
    let remainingAmount = amount;

    dollarBlocks.sort((a, b) => a.rate - b.rate);

    for (let i = 0; i < dollarBlocks.length && remainingAmount > 0; i++) {
        const block = dollarBlocks[i];
        const usedFromBlock = Math.min(block.amount, remainingAmount);

        usedBlocks.push({
            rate: block.rate,
            amount: usedFromBlock
        });

        block.amount -= usedFromBlock;
        remainingAmount -= usedFromBlock;
    }

    dollarBlocks = dollarBlocks.filter(block => block.amount > 0.01);

    saveDollarBlocksToFirebase();

    return usedBlocks;
}

function recalculateDollarBlocks() {
    dollarBlocks = [];

    operations
        .sort((a, b) => new Date(a.date) - new Date(b.date))
        .forEach(op => {
            if (op.type === 'compra') {
                addDollarBlock(op.usd, op.rate);
            } else {
                useDollarBlocks(op.usd);
            }
        });

    saveDollarBlocksToFirebase();
}

function updateDollarBlocksDisplay() {
    const blocksList = document.getElementById('dollarBlocksList');
    if (!blocksList) return;

    if (dollarBlocks.length === 0) {
        blocksList.innerHTML = '<div class="empty-blocks">No hay bloques de dólares</div>';
        return;
    }

    const consolidatedBlocks = {};
    dollarBlocks.forEach(block => {
        const rateKey = block.rate.toFixed(2);
        if (consolidatedBlocks[rateKey]) {
            consolidatedBlocks[rateKey] += block.amount;
        } else {
            consolidatedBlocks[rateKey] = block.amount;
        }
    });

    blocksList.innerHTML = Object.entries(consolidatedBlocks)
        .map(([rate, amount]) => `
            <div class="dollar-block-item">
                <div class="block-info">
                    <div class="block-amount">$${amount.toFixed(2)}</div>
                    <div class="block-rate">Tasa: S/ ${parseFloat(rate).toFixed(2)}</div>
                </div>
            </div>
        `).join('');
}

function toggleDollarBlocks() {
    const dropdown = document.getElementById('dollarBlocksDropdown');
    const button = document.querySelector('.dollars-available');

    dropdown.classList.toggle('active');
    button.classList.toggle('active');

    if (dropdown.classList.contains('active')) {
        updateDollarBlocksDisplay();
    }
}

// ==================== FIREBASE - TRASH ====================
async function loadTrashFromFirebase() {
    if (!currentUser) return;

    try {
        const snapshot = await window.dbGet(window.dbRef(window.db, `trash/${currentUser.userId}`));
        if (snapshot.exists()) {
            const data = snapshot.val();
            trashedOperations = Object.keys(data).map(key => ({
                ...data[key],
                firebaseKey: key
            }));
        }
    } catch (error) {
        console.error('Error cargando papelera:', error);
    }
}

async function moveToTrash(operation) {
    if (!currentUser) return null;

    try {
        const trashedOp = {
            ...operation,
            deletedAt: new Date().toISOString()
        };
        const newTrashRef = window.dbPush(window.dbRef(window.db, `trash/${currentUser.userId}`));
        await window.dbSet(newTrashRef, trashedOp);
        return newTrashRef.key;
    } catch (error) {
        console.error('Error moviendo a papelera:', error);
        return null;
    }
}

async function restoreFromTrash(firebaseKey) {
    if (!currentUser) return false;

    try {
        const operation = trashedOperations.find(op => op.firebaseKey === firebaseKey);
        if (!operation) return false;

        const { deletedAt, firebaseKey: oldKey, ...cleanOperation } = operation;

        const newOpRef = window.dbPush(window.dbRef(window.db, `operations/${currentUser.userId}`));
        await window.dbSet(newOpRef, cleanOperation);

        await window.dbRemove(window.dbRef(window.db, `trash/${currentUser.userId}/${firebaseKey}`));

        return true;
    } catch (error) {
        console.error('Error restaurando:', error);
        return false;
    }
}

async function deleteFromTrash(firebaseKey) {
    if (!currentUser) return;

    try {
        await window.dbRemove(window.dbRef(window.db, `trash/${currentUser.userId}/${firebaseKey}`));
    } catch (error) {
        console.error('Error eliminando de papelera:', error);
    }
}

async function confirmEmptyTrash() {
    showModal('Vaciar Papelera', '¿Estás seguro de que quieres vaciar completamente la papelera? Esta acción no se puede deshacer.', [
        { text: 'Cancelar', primary: false, action: closeModal },
        {
            text: 'Vaciar Papelera', primary: true, action: async () => {
                closeModal();
                await emptyTrash();
            }
        }
    ]);
}

async function emptyTrash() {
    if (!currentUser) return;

    try {
        await window.dbSet(window.dbRef(window.db, `trash/${currentUser.userId}`), null);
        trashedOperations = [];
        loadTrash();

        showToast('Papelera Vaciada', 'La papelera ha sido vaciada exitosamente');
    } catch (error) {
        console.error('Error vaciando papelera:', error);
        showModal('Error', 'No se pudo vaciar la papelera', [
            { text: 'Entendido', primary: true, action: closeModal }
        ]);
    }
}

async function cleanExpiredTrash() {
    if (!currentUser) return;

    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    try {
        const snapshot = await window.dbGet(window.dbRef(window.db, `trash/${currentUser.userId}`));
        if (!snapshot.exists()) return;

        const data = snapshot.val();
        let hasDeleted = false;

        for (const key in data) {
            const deletedAt = new Date(data[key].deletedAt);
            if (deletedAt < thirtyDaysAgo) {
                await window.dbRemove(window.dbRef(window.db, `trash/${currentUser.userId}/${key}`));
                hasDeleted = true;
            }
        }

        if (hasDeleted) {
            await loadTrashFromFirebase();
            loadTrash();
        }
    } catch (error) {
        console.error('Error limpiando papelera:', error);
    }
}

// ==================== NAVEGACIÓN ====================
function showSection(section) {
    // Verificar cambios no guardados en configuración
    if (hasUnsavedSettings && currentSection === 'settings' && section !== 'settings') {
        showModal('Cambios sin guardar', '¿Estás seguro de que quieres salir? Tienes cambios sin guardar.', [
            { text: 'Cancelar', primary: false, action: closeModal },
            {
                text: 'Salir sin guardar', primary: true, action: () => {
                    closeModal();
                    hasUnsavedSettings = false;
                    document.getElementById('unsavedSettingsBadge').style.display = 'none';
                    resetSettingsForm();
                    proceedToSection(section);
                }
            }
        ]);
        return;
    }

    proceedToSection(section);
}

let currentSection = 'dashboard';

function proceedToSection(section) {
    window.scrollTo(0, 0);

    currentSection = section;

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
        stats: 'Estadísticas',
        settings: 'Configuración'
    };

    document.getElementById('pageTitle').textContent = titles[section] || 'Dashboard';

    if (section === 'stats') updateStatsSection();
    if (section === 'trash') loadTrash();
    if (section === 'history') loadHistory();

    if (window.innerWidth <= 768) {
        toggleMobileMenu();
    }
}

function toggleMobileMenu() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    sidebar.classList.toggle('mobile-open');
    overlay.classList.toggle('active');
}

// ==================== OPERACIONES ====================
function selectOperationType(type) {
    selectedOperationType = type;

    document.getElementById('btnCompra').classList.remove('active');
    document.getElementById('btnVenta').classList.remove('active');

    if (type === 'compra') {
        document.getElementById('btnCompra').classList.add('active');
        // Desactivar impresión automática en compra
        if (autoPrintEnabled) {
            autoPrintEnabled = false;
            localStorage.setItem('autoPrintEnabled', false);
            updateAutoPrintButton();
        }
    } else {
        document.getElementById('btnVenta').classList.add('active');
        // Activar impresión automática en venta
        if (!autoPrintEnabled) {
            autoPrintEnabled = true;
            localStorage.setItem('autoPrintEnabled', true);
            updateAutoPrintButton();
        }
    }

    calculateProfit();
}

function calculateProfit() {
    const usd = parseFloat(document.getElementById('amountUSD').value) || 0;

    let pen = 0;
    let profit = 0;

    if (selectedOperationType === 'compra') {
        pen = usd * currentRates.buy;
        profit = 0;
    } else {
        pen = usd * currentRates.sell;

        if (dollarBlocks.length > 0) {
            let remainingUSD = usd;
            let totalCost = 0;

            const sortedBlocks = [...dollarBlocks].sort((a, b) => a.rate - b.rate);

            for (const block of sortedBlocks) {
                if (remainingUSD <= 0) break;

                const usedAmount = Math.min(block.amount, remainingUSD);
                totalCost += usedAmount * block.rate;
                remainingUSD -= usedAmount;
            }

            profit = pen - totalCost;
        }
    }

    document.getElementById('amountPEN').value = pen.toFixed(2);
    document.getElementById('profitAmount').value = selectedOperationType === 'compra' ? '-' : profit.toFixed(2);
}

async function registerOperation() {
    const usd = parseFloat(document.getElementById('amountUSD').value);
    const pen = parseFloat(document.getElementById('amountPEN').value);

    if (!usd || usd <= 0) {
        showModal('Error', 'Por favor ingresa un monto válido en USD', [
            { text: 'Entendido', primary: true, action: closeModal }
        ]);
        return;
    }

    let profit = 0;
    let blocksUsed = [];

    if (selectedOperationType === 'venta') {
        if (getTotalDollars() < usd) {
            showModal('Error', 'No tienes suficientes dólares disponibles para esta venta', [
                { text: 'Entendido', primary: true, action: closeModal }
            ]);
            return;
        }

        blocksUsed = useDollarBlocks(usd);

        const totalCost = blocksUsed.reduce((sum, b) => sum + (b.amount * b.rate), 0);
        profit = pen - totalCost;
    }

    const operation = {
        id: Date.now(),
        date: new Date().toISOString(),
        type: selectedOperationType,
        usd: parseFloat(usd.toFixed(2)),
        pen: parseFloat(pen.toFixed(2)),
        rate: selectedOperationType === 'compra' ? currentRates.buy : currentRates.sell,
        profit: parseFloat(profit.toFixed(2)),
        blocksUsed: selectedOperationType === 'venta' ? blocksUsed : []
    };

    if (selectedOperationType === 'compra') {
        addDollarBlock(usd, currentRates.buy);
    }

    const firebaseKey = await saveOperationToFirebase(operation);

    document.getElementById('amountUSD').value = '';
    document.getElementById('amountPEN').value = '';
    document.getElementById('profitAmount').value = '';

    const tempOperation = { ...operation, firebaseKey };

    if (autoPrintEnabled && firebaseKey) {
        printReceiptDirect(tempOperation);
    }

    showToast(
        'Operación Registrada',
        `La ${selectedOperationType} ha sido registrada exitosamente`
    );
}

function getTotalDollars() {
    return dollarBlocks.reduce((sum, block) => sum + block.amount, 0);
}

function updateDollarsAvailable() {
    const total = getTotalDollars();
    document.getElementById('dollarsAvailable').textContent = `$${total.toFixed(2)}`;
}

// ==================== FILTROS ====================
function filterOperations(filter) {
    currentFilter = filter;

    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    event.target.classList.add('active');

    document.getElementById('filterDate').value = '';

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
    if (!tbody) return;

    tbody.innerHTML = filtered.slice(0, 10).map(op => {
        // Calcular la tasa de adquisición promedio
        let purchaseRate = '-';
        if (op.type === 'venta' && op.blocksUsed && op.blocksUsed.length > 0) {
            const totalAmount = op.blocksUsed.reduce((sum, b) => sum + b.amount, 0);
            const weightedSum = op.blocksUsed.reduce((sum, b) => sum + (b.amount * b.rate), 0);
            purchaseRate = `S/ ${(weightedSum / totalAmount).toFixed(2)}`;
        }

        return `
        <tr>
            <td>${formatDateTime(op.date)}</td>
            <td><span class="badge badge-${op.type}">${op.type === 'compra' ? 'Compra' : 'Venta'}</span></td>
            <td>$${op.usd.toFixed(2)}</td>
            <td>S/ ${op.pen.toFixed(2)}</td>
            <td>S/ ${op.rate.toFixed(2)}</td>
            <td style="text-align: left;">${purchaseRate}</td>
            <td style="${op.type === 'venta' && op.profit > 0 ? 'color: var(--success); font-weight: 600;' : 'color: var(--text-gray);'}">${op.type === 'compra' ? '-' : '+S/ ' + op.profit.toFixed(2)}</td>
        </tr>
    `;
    }).join('') || '<tr><td colspan="7" style="text-align: center;">No hay operaciones para mostrar</td></tr>';
}

// ==================== HISTORIAL CON PAGINACIÓN ====================
function loadHistory() {
    const historyContainer = document.getElementById('historyByMonth');
    if (!historyContainer) return;

    const groupedByMonth = {};

    // Todas las operaciones para agrupar por mes
    operations.forEach(op => {
        const date = new Date(op.date);
        const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

        if (!groupedByMonth[monthKey]) {
            groupedByMonth[monthKey] = [];
        }
        groupedByMonth[monthKey].push(op);
    });

    const sortedMonths = Object.keys(groupedByMonth).sort().reverse();

    if (sortedMonths.length === 0) {
        historyContainer.innerHTML = '<div style="text-align: center; padding: 2rem; color: var(--text-gray);">No hay operaciones registradas</div>';
        return;
    }

    historyContainer.innerHTML = sortedMonths.map(monthKey => {
        const [year, month] = monthKey.split('-');
        const monthName = new Date(year, parseInt(month) - 1, 1).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
        const monthOps = groupedByMonth[monthKey].sort((a, b) => new Date(b.date) - new Date(a.date));

        // Solo mostrar las primeras 60
        const displayedOps = monthOps.slice(0, ITEMS_PER_PAGE);
        const hasMore = monthOps.length > ITEMS_PER_PAGE;

        return `
            <div class="month-group" id="month-${monthKey}">
                <div class="month-header" onclick="toggleMonthGroup('${monthKey}')">
                    ${monthName.charAt(0).toUpperCase() + monthName.slice(1)}
                    <svg class="toggle-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="6 9 12 15 18 9"/>
                    </svg>
                </div>
                <div class="month-operations" id="operations-${monthKey}">
                    <div class="table-responsive">
                        <table>
                            <thead>
                                <tr>
                                    <th>Fecha</th>
                                    <th>Tipo</th>
                                    <th>USD</th>
                                    <th>PEN</th>
                                    <th>Tasa</th>
                                    <th>Tasa Comprada</th>
                                    <th>Ganancia</th>
                                    <th>Acciones</th>
                                </tr>
                            </thead>
                            <tbody id="tbody-${monthKey}">
                                ${renderOperationsRows(displayedOps)}
                            </tbody>
                        </table>
                    </div>
                    ${hasMore ? `
                        <div style="text-align: center; padding: 1rem;">
                            <button class="btn btn-secondary" onclick="loadMoreOperations('${monthKey}', ${ITEMS_PER_PAGE})">
                                Cargar más operaciones
                            </button>
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
    }).join('');

    // Configurar scroll infinito
    setupInfiniteScroll();
}

function renderOperationsRows(ops) {
    return ops.map(op => {
        // Calcular la tasa de adquisición promedio
        let purchaseRate = '-';
        if (op.type === 'venta' && op.blocksUsed && op.blocksUsed.length > 0) {
            const totalAmount = op.blocksUsed.reduce((sum, b) => sum + b.amount, 0);
            const weightedSum = op.blocksUsed.reduce((sum, b) => sum + (b.amount * b.rate), 0);
            purchaseRate = `S/ ${(weightedSum / totalAmount).toFixed(2)}`;
        }

        return `
        <tr>
            <td>${formatDateTime(op.date)}</td>
            <td><span class="badge badge-${op.type}">${op.type === 'compra' ? 'Compra' : 'Venta'}</span></td>
            <td>$${op.usd.toFixed(2)}</td>
            <td>S/ ${op.pen.toFixed(2)}</td>
            <td>S/ ${op.rate.toFixed(2)}</td>
            <td style="text-align: left;">${purchaseRate}</td>
            <td style="${op.type === 'venta' && op.profit > 0 ? 'color: var(--success); font-weight: 600;' : 'color: var(--text-gray);'}">${op.type === 'compra' ? '-' : '+S/ ' + op.profit.toFixed(2)}</td>
            <td>
                <div class="action-buttons">
                    <button class="btn btn-sm btn-info" onclick="printReceipt('${op.firebaseKey || op.id}')" title="Imprimir">
                        <svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2">
                            <polyline points="6 9 6 2 18 2 18 9"/>
                            <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
                            <rect x="6" y="14" width="12" height="8"/>
                        </svg>
                    </button>
                    <button class="btn btn-sm btn-warning" onclick="openEditModal('${op.firebaseKey || op.id}')">
                        <svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                        </svg>
                    </button>
                    <button class="btn btn-sm btn-danger" onclick="deleteOperation('${op.firebaseKey || op.id}')">
                        <svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2">
                            <polyline points="3 6 5 6 21 6"/>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                        </svg>
                    </button>
                </div>
            </td>
        </tr>
    `;
    }).join('');
}

function loadMoreOperations(monthKey, currentCount) {
    if (isLoadingMore) return;
    isLoadingMore = true;

    const [year, month] = monthKey.split('-');
    const monthOps = operations.filter(op => {
        const date = new Date(op.date);
        const opMonthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        return opMonthKey === monthKey;
    }).sort((a, b) => new Date(b.date) - new Date(a.date));

    const newCount = currentCount + ITEMS_PER_PAGE;
    const newOps = monthOps.slice(currentCount, newCount);

    const tbody = document.getElementById(`tbody-${monthKey}`);
    if (tbody) {
        tbody.innerHTML += renderOperationsRows(newOps);
    }

    // Actualizar o eliminar botón
    const hasMore = monthOps.length > newCount;
    const container = document.getElementById(`operations-${monthKey}`);
    const loadMoreBtn = container.querySelector('button');

    if (loadMoreBtn) {
        if (hasMore) {
            loadMoreBtn.setAttribute('onclick', `loadMoreOperations('${monthKey}', ${newCount})`);
        } else {
            loadMoreBtn.parentElement.remove();
        }
    }

    isLoadingMore = false;
}

function setupInfiniteScroll() {
    const historySection = document.getElementById('history-section');
    if (!historySection) return;

    let scrollTimeout;
    historySection.addEventListener('scroll', () => {
        clearTimeout(scrollTimeout);
        scrollTimeout = setTimeout(() => {
            const scrollTop = historySection.scrollTop;
            const scrollHeight = historySection.scrollHeight;
            const clientHeight = historySection.clientHeight;

            if (scrollTop + clientHeight >= scrollHeight - 100) {
                // Cerca del final, cargar más si hay botones disponibles
                const loadMoreBtns = historySection.querySelectorAll('button.btn-secondary');
                if (loadMoreBtns.length > 0 && !isLoadingMore) {
                    loadMoreBtns[0].click();
                }
            }
        }, 100);
    });
}

function toggleMonthGroup(monthKey) {
    const group = document.getElementById(`month-${monthKey}`);
    if (group) {
        group.classList.toggle('collapsed');
    }
}

// ==================== PAPELERA ====================
function loadTrash() {
    const tbody = document.getElementById('trashTableBody');
    if (!tbody) return;

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
            <td>${formatDateTime(op.deletedAt)} <br><small style="color: var(--danger);">(${daysLeft} días restantes)</small></td>
            <td>${formatDateTime(op.date)}</td>
            <td><span class="badge badge-${op.type}">${op.type === 'compra' ? 'Compra' : 'Venta'}</span></td>
            <td>$${op.usd.toFixed(2)}</td>
            <td>S/ ${op.pen.toFixed(2)}</td>
            <td>S/ ${op.rate.toFixed(2)}</td>
            <td style="${op.type === 'venta' && op.profit > 0 ? 'color: var(--success); font-weight: 600;' : 'color: var(--text-gray);'}">${op.type === 'compra' ? '-' : '+S/ ' + op.profit.toFixed(2)}</td>
            <td>
                <div class="action-buttons">
                    <button class="btn btn-sm btn-success" onclick="restoreOperation('${op.firebaseKey}')" title="Restaurar">
                        <svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2">
                            <polyline points="1 4 1 10 7 10"/>
                            <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>
                        </svg>
                    </button>
                    <button class="btn btn-sm btn-danger" onclick="permanentDelete('${op.firebaseKey}')" title="Eliminar permanentemente">
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
    showModal('Restaurar Operación', '¿Estás seguro de que deseas restaurar esta operación?', [
        { text: 'Cancelar', primary: false, action: closeModal },
        {
            text: 'Restaurar', primary: true, action: async () => {
                closeModal();
                const success = await restoreFromTrash(firebaseKey);
                if (success) {
                    showToast('Operación Restaurada', 'La operación ha sido restaurada exitosamente');
                } else {
                    showModal('Error', 'No se pudo restaurar la operación', [
                        { text: 'Entendido', primary: true, action: closeModal }
                    ]);
                }
            }
        }
    ]);
}

async function permanentDelete(firebaseKey) {
    showModal('Eliminar Permanentemente', '¿Estás seguro? Esta acción no se puede deshacer.', [
        { text: 'Cancelar', primary: false, action: closeModal },
        {
            text: 'Eliminar', primary: true, action: async () => {
                closeModal();
                await deleteFromTrash(firebaseKey);
                showToast('Operación Eliminada', 'La operación ha sido eliminada permanentemente');
            }
        }
    ]);
}

// ==================== IMPRIMIR BOLETA ====================
function printReceipt(key) {
    const operation = operations.find(op => (op.firebaseKey || op.id) === key);
    if (!operation) return;

    printReceiptDirect(operation);
}

function printReceiptDirect(operation) {
    const date = new Date(operation.date);
    const dateStr = date.toLocaleDateString('es-PE');
    const timeStr = date.toLocaleTimeString('es-PE', { hour12: false });

    const operationType = operation.type === 'compra' ? 'Compra de dólares' : 'Venta de dólares';

    const receiptContent = `
===================================
    BOLETA DE CAMBIO DE DÓLAR
===================================
Fecha: ${dateStr} ${timeStr}
-----------------------------------
Operación: ${operationType}
Monto USD: $${operation.usd.toFixed(2)}
Tipo de cambio: S/ ${operation.rate.toFixed(2)}
-----------------------------------
TOTAL:  S/ ${operation.pen.toFixed(2)}
===================================
   Gracias por su preferencia
===================================
    `;

    const width = 400;
    const height = 600;
    const left = (screen.width / 2) - (width / 2);
    const top = (screen.height / 2) - (height / 2);

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

    setTimeout(() => {
        printWindow.print();
        printWindow.close();
    }, 250);
}

async function toggleAutoPrint() {
    autoPrintEnabled = !autoPrintEnabled;
    updateAutoPrintButton();

    const snapshot = await window.dbGet(window.dbRef(window.db, `settings/${currentUser.userId}`));
    const currentSettings = snapshot.exists() ? snapshot.val() : {};

    await saveUserSettings({
        ...currentSettings,
        autoPrint: autoPrintEnabled
    });
}

// ==================== EDITAR OPERACIÓN ====================
function openEditModal(key) {
    const operation = operations.find(op => (op.firebaseKey || op.id) === key);
    if (!operation) return;

    editingOperationKey = key;
    selectedEditType = operation.type;

    const date = new Date(operation.date);
    const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

    document.getElementById('editDate').value = localDate;
    document.getElementById('editUSD').value = operation.usd.toFixed(2);
    document.getElementById('editRate').value = operation.rate.toFixed(2);

    selectEditType(operation.type);
    calculateEditProfit();

    document.getElementById('editModal').classList.add('active');
}

function selectEditType(type) {
    selectedEditType = type;

    document.getElementById('editBtnCompra').classList.remove('active');
    document.getElementById('editBtnVenta').classList.remove('active');

    if (type === 'compra') {
        document.getElementById('editBtnCompra').classList.add('active');
    } else {
        document.getElementById('editBtnVenta').classList.add('active');
    }

    calculateEditProfit();
}

function calculateEditProfit() {
    const usd = parseFloat(document.getElementById('editUSD').value) || 0;
    const rate = parseFloat(document.getElementById('editRate').value) || 0;

    const pen = usd * rate;
    document.getElementById('editPEN').value = pen.toFixed(2);

    if (selectedEditType === 'compra') {
        document.getElementById('editProfit').value = '-';
    } else {
        const avgCost = dollarBlocks.length > 0
            ? dollarBlocks.reduce((sum, b) => sum + (b.amount * b.rate), 0) / dollarBlocks.reduce((sum, b) => sum + b.amount, 0)
            : rate;

        const profit = usd * (rate - avgCost);
        document.getElementById('editProfit').value = profit.toFixed(2);
    }
}

function closeEditModal() {
    document.getElementById('editModal').classList.remove('active');
    editingOperationKey = null;
}

async function saveEdit() {
    if (!editingOperationKey) return;

    const date = new Date(document.getElementById('editDate').value);
    const usd = parseFloat(document.getElementById('editUSD').value);
    const rate = parseFloat(document.getElementById('editRate').value);

    if (!usd || !rate) {
        showModal('Error', 'Por favor completa todos los campos', [
            { text: 'Entendido', primary: true, action: closeModal }
        ]);
        return;
    }

    const pen = usd * rate;

    let profit = 0;
    if (selectedEditType === 'venta') {
        const avgCost = dollarBlocks.length > 0
            ? dollarBlocks.reduce((sum, b) => sum + (b.amount * b.rate), 0) / dollarBlocks.reduce((sum, b) => sum + b.amount, 0)
            : rate;
        profit = usd * (rate - avgCost);
    }

    const updatedOperation = {
        date: date.toISOString(),
        type: selectedEditType,
        usd: parseFloat(usd.toFixed(2)),
        pen: parseFloat(pen.toFixed(2)),
        rate: parseFloat(rate.toFixed(2)),
        profit: parseFloat(profit.toFixed(2))
    };

    const success = await updateOperationInFirebase(editingOperationKey, updatedOperation);

    if (success) {
        closeEditModal();
        showToast('Operación Actualizada', 'La operación ha sido actualizada exitosamente');
    } else {
        showModal('Error', 'No se pudo actualizar la operación', [
            { text: 'Entendido', primary: true, action: closeModal }
        ]);
    }
}

async function deleteOperation(key) {
    showModal('Eliminar Operación', '¿Mover esta operación a la papelera?', [
        { text: 'Cancelar', primary: false, action: closeModal },
        {
            text: 'Eliminar', primary: true, action: async () => {
                closeModal();
                const operation = operations.find(o => (o.firebaseKey || o.id) === key);
                if (!operation) return;

                await moveToTrash(operation);
                await deleteOperationFromFirebase(operation.firebaseKey || key);

                showToast('Operación Eliminada', 'La operación ha sido movida a la papelera. Se eliminará automáticamente en 30 días');
            }
        }
    ]);
}

// ==================== DASHBOARD ====================
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
        if (op.type === 'venta' && op.profit > 0) {
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

// ==================== ESTADÍSTICAS ====================
function initializeCharts() {
    updateStatsSection();
}

function updateStatsSection() {
    const totalProfit = operations.reduce((sum, op) => {
        return sum + (op.type === 'venta' && op.profit > 0 ? op.profit : 0);
    }, 0);

    const buyOps = operations.filter(op => op.type === 'compra').length;
    const sellOps = operations.filter(op => op.type === 'venta').length;

    const avgProfit = sellOps > 0 ? totalProfit / sellOps : 0;

    document.getElementById('statsProfit').textContent = `S/ ${totalProfit.toFixed(2)}`;
    document.getElementById('statsBuyOps').textContent = buyOps;
    document.getElementById('statsSellOps').textContent = sellOps;
    document.getElementById('statsAvgProfit').textContent = `S/ ${avgProfit.toFixed(2)}`;

    const opCtx = document.getElementById('operationsChart');
    if (!opCtx) return;

    const opContext = opCtx.getContext('2d');
    if (charts.operations) charts.operations.destroy();

    charts.operations = new Chart(opContext, {
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
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom'
                }
            }
        }
    });

    const weekCtx = document.getElementById('weeklyChart');
    if (!weekCtx) return;

    const weekContext = weekCtx.getContext('2d');
    if (charts.weekly) charts.weekly.destroy();

    const weekLabels = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
    const weekData = new Array(7).fill(0);

    operations.forEach(op => {
        if (op.type === 'venta' && op.profit > 0) {
            const day = new Date(op.date).getDay();
            const index = day === 0 ? 6 : day - 1;
            weekData[index] += op.profit;
        }
    });

    charts.weekly = new Chart(weekContext, {
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
                    display: false
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: function (value) {
                            return 'S/ ' + value.toFixed(2);
                        }
                    }
                }
            }
        }
    });
}

// ==================== CONFIGURACIÓN ====================
async function changeTheme(theme) {
    applyTheme(theme);
    await saveUserSettings({ theme: theme, autoPrint: autoPrintEnabled });
}

function applyTheme(theme) {
    document.body.classList.remove('dark-mode', 'ocean-mode', 'sunset-mode');

    if (theme === 'dark') {
        document.body.classList.add('dark-mode');
    } else if (theme === 'ocean') {
        document.body.classList.add('ocean-mode');
    } else if (theme === 'sunset') {
        document.body.classList.add('sunset-mode');
    }
}

function markSettingsUnsaved() {
    const currentUsername = document.getElementById('settingsUsername').value.trim();
    const currentEmail = document.getElementById('settingsEmail').value.trim();

    hasUnsavedSettings = (currentUsername !== originalUserData.username || currentEmail !== originalUserData.email);

    document.getElementById('unsavedSettingsBadge').style.display = hasUnsavedSettings ? 'flex' : 'none';
}

function resetSettingsForm() {
    document.getElementById('settingsUsername').value = originalUserData.username;
    document.getElementById('settingsEmail').value = originalUserData.email;
    hasUnsavedSettings = false;
    document.getElementById('unsavedSettingsBadge').style.display = 'none';
}

async function updateUserInfo() {
    const newUsername = document.getElementById('settingsUsername').value.trim();
    const newEmail = document.getElementById('settingsEmail').value.trim();

    if (!newUsername || !newEmail) {
        showModal('Error', 'Por favor completa todos los campos', [
            { text: 'Entendido', primary: true, action: closeModal }
        ]);
        return;
    }

    // ✅ VALIDAR EMAIL
    if (!isValidEmail(newEmail)) {
        showModal('Error', 'Por favor ingresa un correo electrónico válido', [
            { text: 'Entendido', primary: true, action: closeModal }
        ]);
        return;
    }

    try {
        await window.dbUpdate(
            window.dbRef(window.db, `users/${currentUser.userId}`),
            {
                username: newUsername,
                email: newEmail
            }
        );

        currentUser.username = newUsername;
        currentUser.email = newEmail;

        localStorage.setItem('casaDeCambioSession', JSON.stringify(currentUser));

        document.getElementById('sidebarUsername').textContent = newUsername.toUpperCase();

        originalUserData = {
            username: newUsername,
            email: newEmail
        };

        hasUnsavedSettings = false;
        document.getElementById('unsavedSettingsBadge').style.display = 'none';

        showToast('Información Actualizada', 'Tu información ha sido actualizada correctamente');

    } catch (error) {
        console.error('Error actualizando información:', error);
        showModal('Error', 'No se pudo actualizar la información', [
            { text: 'Entendido', primary: true, action: closeModal }
        ]);
    }
}

async function openChangePassword() {
    const changePasswordBtn = event.target.closest('.btn');

    try {
        // Deshabilitar botón por 3 segundos
        if (changePasswordBtn) {
            changePasswordBtn.disabled = true;
            changePasswordBtn.style.opacity = '0.6';
            changePasswordBtn.style.cursor = 'not-allowed';

            setTimeout(() => {
                changePasswordBtn.disabled = false;
                changePasswordBtn.style.opacity = '1';
                changePasswordBtn.style.cursor = 'pointer';
            }, 3000);
        }

        // Verificar límite de 1 minuto
        const now = Date.now();
        const timeSinceLastCode = now - lastCodeSentTime;
        const oneMinute = 60000;

        if (timeSinceLastCode < oneMinute) {
            const secondsLeft = Math.ceil((oneMinute - timeSinceLastCode) / 1000);
            showModal('Espera un momento', `Por favor espera ${secondsLeft} segundos antes de solicitar otro código`, [
                { text: 'Entendido', primary: true, action: closeModal }
            ]);
            return;
        }

        // Generar código de verificación
        verificationCode = Math.floor(100000 + Math.random() * 900000).toString();

        // Enviar código al correo
        await sendVerificationEmail(
            currentUser.email,
            verificationCode,
            'Has solicitado cambiar tu contraseña. Usa el siguiente código de verificación para continuar:'
        );

        // Actualizar timestamp del último código enviado
        lastCodeSentTime = Date.now();

        showToast('Código Enviado', 'Hemos enviado un código de verificación a tu correo');

        // Abrir modal después de enviar código
        document.getElementById('changePasswordModal').classList.add('active');

        // Iniciar contador de reenvío
        startResendCountdown('changePasswordResend', 60);

    } catch (error) {
        console.error('Error enviando código:', error);
        showModal('Error', 'No se pudo enviar el código de verificación', [
            { text: 'Entendido', primary: true, action: closeModal }
        ]);
    }
}

function closeChangePasswordModal() {
    document.getElementById('changePasswordModal').classList.remove('active');
    document.getElementById('verifyCodeChange').value = '';
    document.getElementById('newPasswordChange').value = '';
    document.getElementById('confirmPasswordChange').value = '';
    document.getElementById('changePasswordError').classList.remove('show');
    verificationCode = null;

    // Limpiar contador si existe
    if (window.changePasswordCountdownInterval) {
        clearInterval(window.changePasswordCountdownInterval);
    }
}

// Función para contador de reenvío
function startResendCountdown(buttonId, seconds) {
    const button = document.getElementById(buttonId);
    if (!button) return;

    let timeLeft = seconds;
    button.disabled = true;
    button.textContent = `Reenviar (${timeLeft}s)`;

    const interval = setInterval(() => {
        timeLeft--;
        if (timeLeft > 0) {
            button.textContent = `Reenviar (${timeLeft}s)`;
        } else {
            clearInterval(interval);
            button.disabled = false;
            button.textContent = 'Reenviar código';
        }
    }, 1000);

    // Guardar referencia según el botón
    if (buttonId === 'deleteAccountResend') {
        window.deleteAccountCountdownInterval = interval;
    } else if (buttonId === 'changePasswordResend') {
        window.changePasswordCountdownInterval = interval;
    } else if (buttonId === 'verifyResend') {
        window.verifyResendCountdownInterval = interval;
    }
}

// Función para reenviar código en cambio de contraseña
async function resendCodeChangePassword() {
    const button = document.getElementById('changePasswordResend');

    try {
        // Deshabilitar botón temporalmente
        button.disabled = true;

        // Generar nuevo código
        verificationCode = Math.floor(100000 + Math.random() * 900000).toString();

        // Enviar código
        await sendVerificationEmail(
            currentUser.email,
            verificationCode,
            'Has solicitado cambiar tu contraseña. Usa el siguiente código de verificación para continuar:'
        );

        // Actualizar timestamp
        lastCodeSentTime = Date.now();

        showToast('Código Reenviado', 'Se ha enviado un nuevo código a tu correo');

        // Reiniciar contador
        startResendCountdown('changePasswordResend', 60);

    } catch (error) {
        console.error('Error reenviando código:', error);
        showToast('Error', 'No se pudo reenviar el código');
        button.disabled = false;
    }
}

// Función para reenviar código en verificación (recuperar contraseña)
async function resendCodeVerify() {
    const button = document.getElementById('verifyResend');

    try {
        button.disabled = true;

        if (!pendingPasswordChange) {
            showToast('Error', 'No hay solicitud de recuperación pendiente');
            button.disabled = false;
            return;
        }

        // Generar nuevo código
        verificationCode = Math.floor(100000 + Math.random() * 900000).toString();

        // Enviar código
        await sendVerificationEmail(
            pendingPasswordChange.email,
            verificationCode,
            'Has solicitado recuperar tu contraseña. Usa el siguiente código de verificación para continuar:'
        );

        // Actualizar timestamp
        lastCodeSentTime = Date.now();

        showToast('Código Reenviado', 'Se ha enviado un nuevo código a tu correo');

        // Reiniciar contador
        startResendCountdown('verifyResend', 60);

    } catch (error) {
        console.error('Error reenviando código:', error);
        showToast('Error', 'No se pudo reenviar el código');
        button.disabled = false;
    }
}

// Función para reenviar código en eliminación de cuenta
async function resendCodeDeleteAccount() {
    const button = document.getElementById('deleteAccountResend');

    try {
        button.disabled = true;

        // Generar nuevo código
        verificationCode = Math.floor(100000 + Math.random() * 900000).toString();

        // Enviar código
        await sendVerificationEmail(
            currentUser.email,
            verificationCode,
            '⚠️ ADVERTENCIA: Has solicitado eliminar tu cuenta de Casa de Cambio Pro. Esta acción desactivará tu cuenta permanentemente. Usa el siguiente código para continuar:'
        );

        // Actualizar timestamp
        lastCodeSentTime = Date.now();

        showToast('Código Reenviado', 'Se ha enviado un nuevo código a tu correo');

        // Reiniciar contador
        startResendCountdown('deleteAccountResend', 60);

    } catch (error) {
        console.error('Error reenviando código:', error);
        showToast('Error', 'No se pudo reenviar el código');
        button.disabled = false;
    }
}

async function savePasswordChange() {
    const verifyCode = document.getElementById('verifyCodeChange').value;
    const newPassword = document.getElementById('newPasswordChange').value;
    const confirmPassword = document.getElementById('confirmPasswordChange').value;
    const errorDiv = document.getElementById('changePasswordError');

    if (!verifyCode || !newPassword || !confirmPassword) {
        showError(errorDiv, 'Por favor completa todos los campos');
        return;
    }

    if (verifyCode !== verificationCode) {
        showError(errorDiv, 'El código de verificación es incorrecto');
        return;
    }

    if (newPassword !== confirmPassword) {
        showError(errorDiv, 'Las contraseñas no coinciden');
        return;
    }

    if (newPassword.length < 4) {
        showError(errorDiv, 'La contraseña debe tener al menos 4 caracteres');
        return;
    }

    try {
        await window.dbUpdate(
            window.dbRef(window.db, `users/${currentUser.userId}`),
            { password: newPassword }
        );

        verificationCode = null;
        closeChangePasswordModal();
        showToast('Contraseña Actualizada', 'Tu contraseña ha sido cambiada exitosamente');

    } catch (error) {
        console.error('Error cambiando contraseña:', error);
        showError(errorDiv, 'Error al cambiar la contraseña');
    }
}

// ==================== TOAST NOTIFICATION ====================
function showToast(title, message, onClose = null) {
    const toast = document.getElementById('toastNotification');
    const toastTitle = document.getElementById('toastTitle');
    const toastMessage = document.getElementById('toastMessage');

    toastTitle.textContent = title;
    toastMessage.textContent = message;

    toast.classList.add('show');

    const timeoutId = setTimeout(() => {
        closeToast();
        if (onClose) onClose();
    }, 4000);

    toast.dataset.timeoutId = timeoutId;
    toast.dataset.onClose = onClose ? onClose.toString() : '';
}

function closeToast() {
    const toast = document.getElementById('toastNotification');
    toast.classList.remove('show');

    if (toast.dataset.timeoutId) {
        clearTimeout(parseInt(toast.dataset.timeoutId));
    }

    if (toast.dataset.onClose && toast.dataset.onClose !== '') {
        const onClose = new Function(toast.dataset.onClose);
        setTimeout(onClose, 300);
    }
}

// ==================== MODALES ====================
function showModal(title, message, buttons) {
    const modal = document.getElementById('genericModal');
    const modalTitle = document.getElementById('modalTitle');
    const modalBody = document.getElementById('modalBody');
    const modalFooter = document.getElementById('modalFooter');

    modalTitle.textContent = title;
    modalBody.innerHTML = `<p style="margin: 0; color: var(--text-dark); font-size: 0.9rem;">${message}</p>`;

    modalFooter.innerHTML = buttons.map(btn => `
        <button class="btn ${btn.primary ? 'btn-primary' : 'btn-secondary'}" onclick="this.clickAction()">
            ${btn.text}
        </button>
    `).join('');

    modalFooter.querySelectorAll('button').forEach((btnEl, index) => {
        btnEl.clickAction = buttons[index].action;
    });

    modal.classList.add('active');
}

function closeModal() {
    document.getElementById('genericModal').classList.remove('active');
}

// ==================== ELIMINAR CUENTA ====================
async function requestAccountDeletion() {
    showModal('Eliminar Cuenta', '¿Estás seguro de que deseas eliminar tu cuenta? Se enviará un código de verificación a tu correo.', [
        { text: 'Cancelar', primary: false, action: closeModal },
        {
            text: 'Continuar', primary: true, action: async () => {
                closeModal();
                await sendAccountDeletionCode();
            }
        }
    ]);
}

async function sendAccountDeletionCode() {
    try {
        // Verificar límite de 1 minuto
        const now = Date.now();
        const timeSinceLastCode = now - lastCodeSentTime;
        const oneMinute = 60000;

        if (timeSinceLastCode < oneMinute) {
            const secondsLeft = Math.ceil((oneMinute - timeSinceLastCode) / 1000);
            showModal('Espera un momento', `Por favor espera ${secondsLeft} segundos antes de solicitar otro código`, [
                { text: 'Entendido', primary: true, action: closeModal }
            ]);
            return;
        }

        verificationCode = Math.floor(100000 + Math.random() * 900000).toString();

        const templateParams = {
            to_email: currentUser.email,
            verification_code: verificationCode,
            current_year: new Date().getFullYear()
        };

        await sendVerificationEmail(
            currentUser.email,
            verificationCode,
            '⚠️ ADVERTENCIA: Has solicitado eliminar tu cuenta de Casa de Cambio Pro. Esta acción desactivará tu cuenta permanentemente. Usa el siguiente código para continuar:'
        );

        // Actualizar timestamp del último código enviado
        lastCodeSentTime = Date.now();

        document.getElementById('deleteAccountModal').classList.add('active');
        startResendCountdown('deleteAccountResend', 60);

    } catch (error) {
        console.error('Error enviando código:', error);
        showModal('Error', 'No se pudo enviar el código de verificación', [
            { text: 'Entendido', primary: true, action: closeModal }
        ]);
    }
}

function closeDeleteAccountModal() {
    document.getElementById('deleteAccountModal').classList.remove('active');
    document.getElementById('deleteAccountCode').value = '';
    document.getElementById('deleteAccountError').classList.remove('show');

    // Limpiar contador si existe
    if (window.deleteAccountCountdownInterval) {
        clearInterval(window.deleteAccountCountdownInterval);
    }
}

async function confirmAccountDeletion() {
    const code = document.getElementById('deleteAccountCode').value.trim();
    const errorDiv = document.getElementById('deleteAccountError');

    if (!code) {
        showError(errorDiv, 'Por favor ingresa el código de verificación');
        return;
    }

    if (code !== verificationCode) {
        showError(errorDiv, 'El código de verificación es incorrecto');
        return;
    }

    try {
        // Marcar cuenta como inactiva
        await window.dbUpdate(
            window.dbRef(window.db, `users/${currentUser.userId}`),
            { status: 'inactive' }
        );

        // Enviar confirmación de eliminación
        await sendVerificationEmail(
            currentUser.email,
            'CONFIRMADO',
            'Tu cuenta de Casa de Cambio Pro ha sido desactivada exitosamente. Si esto fue un error, contacta con soporte.'
        );

        closeDeleteAccountModal();

        showModal('Cuenta Eliminada', 'Tu cuenta ha sido desactivada. Serás redirigido al inicio de sesión.', [
            {
                text: 'Entendido', primary: true, action: () => {
                    localStorage.removeItem('casaDeCambioSession');
                    location.reload();
                }
            }
        ]);

    } catch (error) {
        console.error('Error eliminando cuenta:', error);
        showError(errorDiv, 'Error al eliminar la cuenta');
    }
}

// ==================== VALIDACIÓN Y UTILIDADES DE FORMULARIO ====================

// Función para mostrar/ocultar contraseña
function togglePassword(inputId) {
    const input = document.getElementById(inputId);
    input.type = input.type === 'password' ? 'text' : 'password';
}

// Función para validar email
function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

// ==================== UTILIDADES ====================
function formatDateTime(dateString) {
    const date = new Date(dateString);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');

    return `${day}/${month}/${year} ${hours}:${minutes}`;
}
