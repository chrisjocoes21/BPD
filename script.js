// --- CONFIGURACIÓN ---
const AppConfig = {
    // CAMBIO V0.3.0: URL de tu API actualizada (con P2P)
    API_URL: 'https://script.google.com/macros/s/AKfycbyhPHZuRmC7_t9z20W4h-VPqVFk0z6qKFG_W-YXMgnth4BMRgi8ibAfjeOtIeR5OrFPXw/exec',
    TRANSACCION_API_URL: 'https://script.google.com/macros/s/AKfycbyhPHZuRmC7_t9z20W4h-VPqVFk0z6qKFG_W-YXMgnth4BMRgi8ibAfjeOtIeR5OrFPXw/exec',
    CLAVE_MAESTRA: 'PinceladasM25-26',
    SPREADSHEET_URL: 'https://docs.google.com/spreadsheets/d/1GArB7I19uGum6awiRN6qK8HtmTWGcaPGWhOzGCdhbcs/edit?usp=sharing',
    INITIAL_RETRY_DELAY: 1000,
    MAX_RETRY_DELAY: 30000,
    MAX_RETRIES: 5,
    CACHE_DURATION: 300000,
    
    // CAMBIO v16.1: Actualización de versión
    APP_STATUS: 'Beta', 
    APP_VERSION: 'v19.0 (Neón)', // ACTUALIZADO A v19.0 (Neón)
    
    // CAMBIO v0.3.0: Impuesto P2P (debe coincidir con el Backend)
    IMPUESTO_P2P_TASA: 0.10, // 10%
    
    // CAMBIO v0.3.9: Nueva tasa de impuesto sobre intereses de depósitos
    IMPUESTO_DEPOSITO_TASA: 0.05, // 5%
    
    // NUEVO v0.4.2: Comisión sobre depósitos de admin
    IMPUESTO_DEPOSITO_ADMIN: 0.05, // 5%

    // NUEVO v16.0: Tasa de ITBIS de la tienda (debe coincidir con el Backend)
    TASA_ITBIS: 0.18, // 18%
};

// --- CORRECCIÓN BUG ONCLICK: Función de utilidad para escapar comillas ---
function escapeHTML(str) {
    if (typeof str !== 'string') return str;
    // Escapa comillas simples y dobles para ser seguras en atributos HTML
    return str.replace(/'/g, "\\'").replace(/"/g, "&quot;");
}

// --- ESTADO DE LA APLICACIÓN ---
const AppState = {
    datosActuales: null, // Grupos y alumnos (limpios, sin Cicla/Banco)
    datosAdicionales: { // Objeto para Tesorería, préstamos, etc.
        saldoTesoreria: 0,
        prestamosActivos: [],
        depositosActivos: [],
        allStudents: [] // Lista plana de todos los alumnos
    },
    historialUsuarios: {}, 
    actualizacionEnProceso: false,
    retryCount: 0,
    retryDelay: AppConfig.INITIAL_RETRY_DELAY,
    cachedData: null,
    lastCacheTime: null,
    isOffline: false,
    selectedGrupo: null, 
    isSidebarOpen: false, 
    sidebarTimer: null, 
    transaccionSelectAll: {}, 
    
    // CAMBIO v16.0: 'info' almacena el objeto completo del alumno
    currentSearch: {
        prestamo: { query: '', selected: null, info: null },
        deposito: { query: '', selected: null, info: null },
        p2pOrigen: { query: '', selected: null, info: null },
        p2pDestino: { query: '', selected: null, info: null },
        bonoAlumno: { query: '', selected: null, info: null }, // v0.5.0
        tiendaAlumno: { query: '', selected: null, info: null } // NUEVO v16.0
    },
    
    // NUEVO v0.5.0: Estado de Bonos
    bonos: {
        disponibles: [], // Bonos que aún tienen usos
        canjeados: [], // Bonos que el usuario actual (hipotético) ha canjeado
        adminPanelUnlocked: false // Para el panel de admin
    },

    // CAMBIO v17.0: Simplificación de Tienda
    tienda: {
        items: {}, // Almacenará los artículos de la API
        adminPanelUnlocked: false,
        isStoreOpen: false, // Controlado por updateCountdown
        storeManualStatus: 'auto', // NUEVO v16.1 (Problema 3): Control manual (auto, open, closed)
        // currentItemToConfirm: null ELIMINADO V17.0
    }
};

// --- AUTENTICACIÓN ---
const AppAuth = {
    verificarClave: function() {
        const claveInput = document.getElementById('clave-input');
        if (claveInput.value === AppConfig.CLAVE_MAESTRA) {
            
            AppUI.hideModal('gestion-modal');
            AppUI.showTransaccionModal('transaccion'); // Abrir en la pestaña 'transaccion'
            
            claveInput.value = '';
            claveInput.classList.remove('shake', 'border-red-500');
        } else {
            // CAMBIO vNeón: Clase de borde oscuro para el error
            claveInput.classList.add('shake', 'border-red-500'); 
            claveInput.focus();
            setTimeout(() => {
                claveInput.classList.remove('shake');
            }, 500);
        }
    }
};

// --- NÚMEROS Y FORMATO ---
const AppFormat = {
    // CAMBIO v0.4.4: Formato de Pinceles sin decimales
    formatNumber: (num) => new Intl.NumberFormat('es-DO', { maximumFractionDigits: 0 }).format(num),
    // formatNumber: (num) => new Intl.NumberFormat('es-DO').format(num), // <-- ORIGINAL
    // NUEVO v0.4.0: Formateo de Pinceles (2 decimales) - REEMPLAZADO por formatNumber
    formatPincel: (num) => new Intl.NumberFormat('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(num)
};

// --- BASE DE DATOS DE ANUNCIOS ---
const AnunciosDB = {
    'AVISO': [
        "La tienda de fin de mes abre el último Jueves de cada mes.", 
        "Revisen sus saldos antes del cierre de mes. No se aceptan saldos negativos.",
        "Recuerden: 'Ver Reglas' tiene información importante sobre la tienda." 
    ],
    'NUEVO': [
        // NUEVO v16.0: Actualizado anuncio de Tienda
        "¡Nueva Tienda del Mes! Revisa los artículos. Se desbloquea el último jueves.",
        "¡Nuevo Portal de Bonos! Canjea códigos por Pinceles ℙ.",
        "¡Nuevo Sistema Económico! Depósitos de admin limitados por la Tesorería.",
        "¡Nuevo Portal P2P! Transfiere pinceles a tus compañeros (con 10% de comisión).",
        "La Tesorería cobra un 0.5% diario de impuesto a saldos altos."
    ],
    'CONSEJO': [
        "Usa el botón '»' en la esquina para abrir y cerrar la barra lateral.",
        "Haz clic en el nombre de un alumno en la tabla para ver sus estadísticas.",
        "¡Invierte! Usa los Depósitos a Plazo para obtener retornos fijos (Admin)."
    ],
    'ALERTA': [
        // CAMBIO v0.5.5: Actualizado por Auto-Cicla
        "¡Cuidado! Saldos negativos te moverán automáticamente a Cicla.",
        "Alumnos en Cicla pueden solicitar préstamos de rescate (Admin).",
        "Si tienes un préstamo activo, NO puedes crear un Depósito a Plazo."
    ]
};

// --- MANEJO de datos ---
const AppData = {
    
    isCacheValid: () => AppState.cachedData && AppState.lastCacheTime && (Date.now() - AppState.lastCacheTime < AppConfig.CACHE_DURATION),

    cargarDatos: async function(isRetry = false) {
        if (AppState.actualizacionEnProceso) return;
        AppState.actualizacionEnProceso = true;

        if (!isRetry) {
            AppState.retryCount = 0;
            AppState.retryDelay = AppConfig.INITIAL_RETRY_DELAY;
        }

        if (!AppState.datosActuales) {
            AppUI.showLoading(); 
        } else {
            AppUI.setConnectionStatus('loading', 'Cargando...');
        }

        try {
            if (!navigator.onLine) {
                AppState.isOffline = true;
                AppUI.setConnectionStatus('error', 'Sin conexión, mostrando caché.');
                if (AppData.isCacheValid()) {
                    await AppData.procesarYMostrarDatos(AppState.cachedData);
                } else {
                    throw new Error("Sin conexión y sin datos en caché.");
                }
            } else {
                AppState.isOffline = false;
                
                const url = `${AppConfig.API_URL}?cacheBuster=${new Date().getTime()}`;
                const response = await fetch(url, { method: 'GET', cache: 'no-cache', redirect: 'follow' });

                if (!response.ok) {
                    throw new Error(`Error de red: ${response.status} ${response.statusText}`);
                }
                
                const data = await response.json();
                
                if (data && data.error) {
                    throw new Error(`Error de API: ${data.message}`);
                }
                
                // CAMBIO v16.0: Procesa también la tienda
                AppData.procesarYMostrarDatos(data); // Modifica AppState.datosActuales
                AppState.cachedData = data;
                AppState.lastCacheTime = Date.now();
                AppState.retryCount = 0;
                AppUI.setConnectionStatus('ok', 'Conectado');
            }

        } catch (error) {
            console.error("Error al cargar datos:", error.message);
            AppUI.setConnectionStatus('error', 'Error de conexión.');
            
            if (AppState.retryCount < AppConfig.MAX_RETRIES) {
                AppState.retryCount++;
                setTimeout(() => AppData.cargarDatos(true), AppState.retryDelay);
                AppState.retryDelay = Math.min(AppState.retryDelay * 2, AppConfig.MAX_RETRY_DELAY);
            } else if (AppData.isCacheValid()) {
                console.warn("Fallaron los reintentos. Mostrando datos de caché.");
                AppData.procesarYMostrarDatos(AppState.cachedData);
            } else {
                console.error("Fallaron todos los reintentos y no hay caché.");
            }
        } finally {
            AppState.actualizacionEnProceso = false;
            AppUI.hideLoading(); 
        }
    },

    detectarCambios: function(nuevosDatos) {
        // Lógica de detección de cambios (mantenida simple)
        if (!AppState.datosActuales) return; 

        // ... (Tu lógica de detección de cambios si aplica)
    },
    
    // CAMBIO v16.0: Modificado para aceptar Tienda
    procesarYMostrarDatos: function(data) {
        // 1. Separar Tesorería y Datos Adicionales
        AppState.datosAdicionales.saldoTesoreria = data.saldoTesoreria || 0;
        AppState.datosAdicionales.prestamosActivos = data.prestamosActivos || [];
        AppState.datosAdicionales.depositosActivos = data.depositosActivos || [];

        // 2. NUEVO v0.5.0: Procesar Bonos
        AppState.bonos.disponibles = data.bonosDisponibles || [];
        AppState.bonos.canjeados = data.bonosCanjeadosUsuario || []; // (Actualmente vacío, pero listo para el futuro)
        
        // 3. NUEVO v16.0: Procesar Artículos de Tienda
        AppState.tienda.items = data.tiendaStock || {};
        // NUEVO v16.1 (Problema 3): Procesar estado manual de la tienda
        AppState.tienda.storeManualStatus = data.storeManualStatus || 'auto';

        const allGroups = data.gruposData;
        
        let gruposOrdenados = Object.entries(allGroups).map(([nombre, info]) => ({ nombre, total: info.total || 0, usuarios: info.usuarios || [] }));
        
        // 4. Separar Cicla (que viene en el array)
        const ciclaGroup = gruposOrdenados.find(g => g.nombre === 'Cicla');
        const activeGroups = gruposOrdenados.filter(g => g.nombre !== 'Cicla' && g.nombre !== 'Banco');

        // 5. Crear lista plana de todos los alumnos
        AppState.datosAdicionales.allStudents = activeGroups.flatMap(g => g.usuarios).concat(ciclaGroup ? ciclaGroup.usuarios : []);
        
        // Asignar el nombre del grupo a cada alumno para fácil búsqueda
        activeGroups.forEach(g => {
            g.usuarios.forEach(u => u.grupoNombre = g.nombre);
        });
        if (ciclaGroup) {
            ciclaGroup.usuarios.forEach(u => u.grupoNombre = 'Cicla');
        }

        // 6. Ordenar y filtrar
        activeGroups.sort((a, b) => b.total - a.total);
        if (ciclaGroup) {
            activeGroups.push(ciclaGroup);
        }
        
        // 7. Detectar cambios antes de actualizar el estado
        AppData.detectarCambios(activeGroups);

        // 8. Actualizar UI
        AppUI.actualizarSidebar(activeGroups);
        
        if (AppState.selectedGrupo) {
            const grupoActualizado = activeGroups.find(g => g.nombre === AppState.selectedGrupo);
            if (grupoActualizado) {
                AppUI.mostrarDatosGrupo(grupoActualizado);
            } else {
                AppState.selectedGrupo = null;
                AppUI.mostrarPantallaNeutral(activeGroups);
            }
        } else {
            AppUI.mostrarPantallaNeutral(activeGroups);
        }
        
        AppUI.actualizarSidebarActivo();
        
        // 9. NUEVO v0.5.0: Actualizar UI de Bonos (si está abierta)
        if (document.getElementById('bonos-modal').classList.contains('opacity-0') === false) {
            AppUI.populateBonoList();
            AppUI.populateBonoAdminList();
        }

        // 10. NUEVO v16.0: Actualizar UI de Tienda (si está abierta)
        if (document.getElementById('tienda-modal').classList.contains('opacity-0') === false) {
            // CORRECCIÓN v16.1 (Problema 1 - Sincronización):
            // Forzar el re-renderizado de la lista de estudiantes Y admin
            // para reflejar cambios (ej: crear item) en tiempo real.
            AppUI.renderTiendaItems(); 
            AppUI.populateTiendaAdminList();
            AppUI.updateTiendaAdminStatusLabel(); // v16.1
            // AppUI.updateTiendaButtonStates(); // renderTiendaItems() ya llama a esto.
        }

        AppState.datosActuales = activeGroups; // Actualizar el estado al final
    }
};

// --- MANEJO DE LA INTERFAZ (UI) ---
const AppUI = {
    
    init: function() {
        console.log("AppUI.init() comenzando.");
        
        // Listeners Modales de Gestión (Clave)
        document.getElementById('gestion-btn').addEventListener('click', () => AppUI.showModal('gestion-modal'));
        document.getElementById('modal-cancel').addEventListener('click', () => AppUI.hideModal('gestion-modal'));
        document.getElementById('modal-submit').addEventListener('click', AppAuth.verificarClave);
        document.getElementById('gestion-modal').addEventListener('click', (e) => {
            if (e.target.id === 'gestion-modal') AppUI.hideModal('gestion-modal');
        });
        document.getElementById('student-modal').addEventListener('click', (e) => {
            if (e.target.id === 'student-modal') AppUI.hideModal('student-modal');
        });

        // Listeners Modal de Administración (Tabs)
        document.getElementById('transaccion-modal-close-btn').addEventListener('click', () => AppUI.hideModal('transaccion-modal'));
        document.getElementById('transaccion-cancel-btn').addEventListener('click', () => AppUI.hideModal('transaccion-modal'));
        document.getElementById('transaccion-modal').addEventListener('click', (e) => {
            if (e.target.id === 'transaccion-modal') AppUI.hideModal('transaccion-modal');
        });
        
        // Listener para el botón de enviar transacción
        document.getElementById('transaccion-submit-btn').addEventListener('click', AppTransacciones.realizarTransaccionMultiple);
        
        // NUEVO v0.4.2: Listener para el cálculo de comisión de admin
        document.getElementById('transaccion-cantidad-input').addEventListener('input', AppUI.updateAdminDepositoCalculo);
        
        // Listener para el link de DB
        document.getElementById('db-link-btn').href = AppConfig.SPREADSHEET_URL;
        
        // Listeners Modal P2P
        document.getElementById('p2p-portal-btn').addEventListener('click', () => AppUI.showP2PModal());
        document.getElementById('p2p-modal-close-btn').addEventListener('click', () => AppUI.hideModal('p2p-transfer-modal'));
        document.getElementById('p2p-cancel-btn').addEventListener('click', () => AppUI.hideModal('p2p-transfer-modal'));
        document.getElementById('p2p-transfer-modal').addEventListener('click', (e) => {
            if (e.target.id === 'p2p-transfer-modal') AppUI.hideModal('p2p-transfer-modal');
        });
        document.getElementById('p2p-submit-btn').addEventListener('click', AppTransacciones.realizarTransferenciaP2P);
        document.getElementById('p2p-cantidad').addEventListener('input', AppUI.updateP2PCalculoImpuesto);

        // NUEVO v0.5.0: Listeners Modal Bonos
        document.getElementById('bonos-btn').addEventListener('click', () => AppUI.showBonoModal());
        document.getElementById('bonos-modal-close').addEventListener('click', () => AppUI.hideModal('bonos-modal'));
        document.getElementById('bonos-cancel-btn').addEventListener('click', () => AppUI.hideModal('bonos-modal'));
        document.getElementById('bonos-modal').addEventListener('click', (e) => {
            if (e.target.id === 'bonos-modal') AppUI.hideModal('bonos-modal');
        });
        // Listeners Pestañas de Bonos
        document.querySelectorAll('#bonos-modal .bono-tab-btn').forEach(button => {
            button.addEventListener('click', (e) => {
                const tabId = e.target.dataset.tab;
                AppUI.changeBonoTab(tabId);
            });
        });
        // Listeners Canje de Bono (Usuario)
        document.getElementById('bono-submit-btn').addEventListener('click', AppTransacciones.canjearBono);
        // Listeners Admin de Bonos
        document.getElementById('bono-admin-unlock-btn').addEventListener('click', AppUI.toggleBonoAdminPanel);
        document.getElementById('bono-admin-form').addEventListener('submit', (e) => {
            e.preventDefault();
            AppTransacciones.crearActualizarBono();
        });
        document.getElementById('bono-admin-clear-btn').addEventListener('click', AppUI.clearBonoAdminForm);

        // --- NUEVO v16.0: Listeners Modal Tienda ---
        document.getElementById('tienda-btn').addEventListener('click', () => AppUI.showTiendaModal());
        document.getElementById('tienda-modal-close').addEventListener('click', () => AppUI.hideModal('tienda-modal'));
        document.getElementById('tienda-cancel-btn').addEventListener('click', () => AppUI.hideModal('tienda-modal'));
        document.getElementById('tienda-modal').addEventListener('click', (e) => {
            if (e.target.id === 'tienda-modal') AppUI.hideModal('tienda-modal');
        });
        // Listeners Pestañas de Tienda
        document.querySelectorAll('#tienda-modal .tienda-tab-btn').forEach(button => {
            button.addEventListener('click', (e) => {
                const tabId = e.target.dataset.tab;
                AppUI.changeTiendaTab(tabId);
            });
        });
        // Listeners Admin de Tienda
        document.getElementById('tienda-admin-unlock-btn').addEventListener('click', AppUI.toggleTiendaAdminPanel);
        document.getElementById('tienda-admin-form').addEventListener('submit', (e) => {
            e.preventDefault();
            AppTransacciones.crearActualizarItem();
        });
        document.getElementById('tienda-admin-clear-btn').addEventListener('click', AppUI.clearTiendaAdminForm);
        
        // NUEVO v16.1: Listeners para Control Manual de Tienda
        // Los listeners ya están en el HTML con onclick="AppTransacciones.toggleStoreManual('status')"

        // --- ELIMINADO v17.0: Listeners para Modal Confirmación de Compra ---


        // Listeners Modal Reglas
        document.getElementById('reglas-btn').addEventListener('click', () => AppUI.showModal('reglas-modal'));
        document.getElementById('reglas-modal-close').addEventListener('click', () => AppUI.hideModal('reglas-modal'));
        document.getElementById('reglas-modal').addEventListener('click', (e) => {
            if (e.target.id === 'reglas-modal') AppUI.hideModal('reglas-modal');
        });

        // Listeners Modal Anuncios
        document.getElementById('anuncios-modal-btn').addEventListener('click', () => AppUI.showModal('anuncios-modal'));
        document.getElementById('anuncios-modal-close').addEventListener('click', () => AppUI.hideModal('anuncios-modal'));
        document.getElementById('anuncios-modal').addEventListener('click', (e) => {
            if (e.target.id === 'anuncios-modal') AppUI.hideModal('anuncios-modal');
        });

        // Listener Sidebar
        document.getElementById('toggle-sidebar-btn').addEventListener('click', AppUI.toggleSidebar);
        
        // Listeners para auto-cerrar sidebar
        const sidebar = document.getElementById('sidebar');
        sidebar.addEventListener('mouseenter', () => {
            if (AppState.sidebarTimer) clearTimeout(AppState.sidebarTimer);
        });
        sidebar.addEventListener('mouseleave', () => AppUI.resetSidebarTimer());
        

        // Listeners de cambio de Pestaña (Admin)
        document.querySelectorAll('#transaccion-modal .tab-btn').forEach(button => {
            button.addEventListener('click', (e) => {
                const tabId = e.target.dataset.tab;
                AppUI.changeAdminTab(tabId);
            });
        });

        // Mostrar versión de la App
        AppUI.mostrarVersionApp();
        
        // Listeners para los buscadores (autocomplete)
        AppUI.setupSearchInput('prestamo-alumno-search', 'prestamo-search-results', 'prestamo', (student) => AppUI.loadPrestamoPaquetes(student ? student.nombre : null));
        AppUI.setupSearchInput('deposito-alumno-search', 'deposito-search-results', 'deposito', (student) => AppUI.loadDepositoPaquetes(student ? student.nombre : null));
        AppUI.setupSearchInput('p2p-search-origen', 'p2p-origen-results', 'p2pOrigen', AppUI.selectP2PStudent);
        AppUI.setupSearchInput('p2p-search-destino', 'p2p-destino-results', 'p2pDestino', AppUI.selectP2PStudent);
        AppUI.setupSearchInput('bono-search-alumno', 'bono-search-results', 'bonoAlumno', AppUI.selectBonoStudent); // NUEVO v0.5.0
        AppUI.setupSearchInput('tienda-search-alumno', 'tienda-search-results', 'tiendaAlumno', AppUI.selectTiendaStudent); // NUEVO v16.0


        // Carga inicial
        AppData.cargarDatos(false);
        setInterval(() => AppData.cargarDatos(false), 10000); 
        AppUI.updateCountdown();
        setInterval(AppUI.updateCountdown, 1000);
        
        AppUI.poblarModalAnuncios();
    },

    showLoading: function() {
        const overlay = document.getElementById('loading-overlay');
        if (!overlay) return;
        overlay.classList.remove('opacity-0', 'pointer-events-none');
    },

    hideLoading: function() {
        const overlay = document.getElementById('loading-overlay');
        if (!overlay) return;
        overlay.classList.add('opacity-0', 'pointer-events-none');
    },

    mostrarVersionApp: function() {
        const versionContainer = document.getElementById('app-version-container');
        // CAMBIO vNeón: Texto claro
        versionContainer.classList.add('text-gray-500'); 
        versionContainer.innerHTML = `Estado: ${AppConfig.APP_STATUS} | ${AppConfig.APP_VERSION}`;
    },

    showModal: function(modalId) {
        const modal = document.getElementById(modalId);
        if (!modal) return;
        modal.classList.remove('opacity-0', 'pointer-events-none');
        modal.querySelector('[class*="transform"]').classList.remove('scale-95');
    },

    // CAMBIO v16.0: Añadida limpieza de modal de tienda y confirmación
    hideModal: function(modalId) {
        const modal = document.getElementById(modalId);
        if (!modal) return;
        modal.classList.add('opacity-0', 'pointer-events-none');
        modal.querySelector('[class*="transform"]').classList.add('scale-95');

        // Limpiar campos si se cierra el modal de transacciones
        if (modalId === 'transaccion-modal') {
            document.getElementById('transaccion-lista-grupos-container').innerHTML = '';
            document.getElementById('transaccion-lista-usuarios-container').innerHTML = '';
            document.getElementById('transaccion-cantidad-input').value = "";
            document.getElementById('transaccion-calculo-impuesto').textContent = ""; // NUEVO v0.4.2
            document.getElementById('transaccion-status-msg').textContent = "";
            AppUI.resetSearchInput('prestamo');
            AppUI.resetSearchInput('deposito');
            // CAMBIO vNeón: Placeholder oscuro
            document.getElementById('prestamo-paquetes-container').innerHTML = '<div class="text-sm text-gray-400">Seleccione un alumno para ver las opciones de préstamo.</div>';
            document.getElementById('deposito-paquetes-container').innerHTML = '<div class="text-sm text-gray-400">Seleccione un alumno para ver las opciones de depósito.</div>';
            AppState.transaccionSelectAll = {}; 
            AppTransacciones.setLoadingState(document.getElementById('transaccion-submit-btn'), document.getElementById('transaccion-btn-text'), false, 'Realizar Transacción');
        }
        
        // Limpiar campos de P2P
        if (modalId === 'p2p-transfer-modal') {
            AppUI.resetSearchInput('p2pOrigen');
            AppUI.resetSearchInput('p2pDestino');
            document.getElementById('p2p-clave').value = "";
            document.getElementById('p2p-cantidad').value = "";
            document.getElementById('p2p-calculo-impuesto').textContent = "";
            document.getElementById('p2p-status-msg').textContent = "";
            AppTransacciones.setLoadingState(document.getElementById('p2p-submit-btn'), document.getElementById('p2p-btn-text'), false, 'Realizar Transferencia');
        }
        
        // NUEVO v0.5.0: Limpiar campos de Bonos
        if (modalId === 'bonos-modal') {
            // Pestaña Canjear
            AppUI.resetSearchInput('bonoAlumno');
            document.getElementById('bono-clave-p2p').value = "";
            document.getElementById('bono-clave-input').value = "";
            document.getElementById('bono-status-msg').textContent = "";
            AppTransacciones.setLoadingState(document.getElementById('bono-submit-btn'), document.getElementById('bono-btn-text'), false, 'Canjear Bono');
            
            // Pestaña Admin
            document.getElementById('bono-admin-clave').value = "";
            AppUI.clearBonoAdminForm();
            document.getElementById('bono-admin-status-msg').textContent = "";
            
            // Ocultar panel de admin y resetear estado
            document.getElementById('bono-admin-gate').classList.remove('hidden');
            document.getElementById('bono-admin-panel').classList.add('hidden');
            AppState.bonos.adminPanelUnlocked = false;
        }

        // NUEVO v16.0: Limpiar campos de Tienda
        if (modalId === 'tienda-modal') {
            // Pestaña Comprar
            AppUI.resetSearchInput('tiendaAlumno');
            document.getElementById('tienda-clave-p2p').value = "";
            
            // CORRECCIÓN BUG "Cargando...": Resetear al estado inicial para forzar recarga
            // CAMBIO vNeón: Placeholder oscuro
            document.getElementById('tienda-items-container').innerHTML = '<p class="text-sm text-gray-400 text-center col-span-2">Cargando artículos...</p>';
            
            document.getElementById('tienda-status-msg').textContent = "";
            
            // Pestaña Admin
            document.getElementById('tienda-admin-clave').value = "";
            AppUI.clearTiendaAdminForm();
            document.getElementById('tienda-admin-status-msg').textContent = "";
            
            // Ocultar panel de admin
            document.getElementById('tienda-admin-gate').classList.remove('hidden');
            document.getElementById('tienda-admin-panel').classList.add('hidden');
            AppState.tienda.adminPanelUnlocked = false;
        }
        
        // --- ELIMINADO v17.0: Limpieza de modal de confirmación ---
        
        if (modalId === 'gestion-modal') {
             document.getElementById('clave-input').value = "";
             document.getElementById('clave-input').classList.remove('shake', 'border-red-500');
        }
    },
    
    // Función para cambiar entre pestañas del modal de administración
    changeAdminTab: function(tabId) {
        document.querySelectorAll('#transaccion-modal .tab-btn').forEach(btn => {
            // CAMBIO vNeón: Clases inactivas oscuras
            btn.classList.remove('active-tab', 'border-cyan-500', 'text-cyan-500');
            btn.classList.add('border-transparent', 'text-gray-400', 'hover:bg-slate-600');
        });

        document.querySelectorAll('#transaccion-modal .tab-content').forEach(content => {
            content.classList.add('hidden');
        });

        // CAMBIO vNeón: Clases activas cian
        document.querySelector(`#transaccion-modal [data-tab="${tabId}"]`).classList.add('active-tab', 'border-cyan-500', 'text-cyan-500');
        document.querySelector(`#transaccion-modal [data-tab="${tabId}"]`).classList.remove('border-transparent', 'text-gray-400', 'hover:bg-slate-600');
        document.getElementById(`tab-${tabId}`).classList.remove('hidden');
        
        if (tabId === 'transaccion') {
            AppUI.populateGruposTransaccion();
        } else if (tabId === 'prestamos') {
            AppUI.loadPrestamoPaquetes(null);
        } else if (tabId === 'depositos') {
            AppUI.loadDepositoPaquetes(null);
        }
        
        document.getElementById('transaccion-status-msg').textContent = "";
    },


    // --- FUNCIONES DE BÚSQUEDA (AUTOCOMPLETE) ---
    
    // CAMBIO v16.0: onSelectCallback ahora recibe el objeto student completo
    setupSearchInput: function(inputId, resultsId, stateKey, onSelectCallback) {
        const input = document.getElementById(inputId);
        const results = document.getElementById(resultsId);

        input.addEventListener('input', (e) => {
            const query = e.target.value;
            AppState.currentSearch[stateKey].query = query;
            AppState.currentSearch[stateKey].selected = null; 
            AppState.currentSearch[stateKey].info = null; // NUEVO v16.0
            
            if (query === '') {
                onSelectCallback(null);
            }
            
            AppUI.handleStudentSearch(query, inputId, resultsId, stateKey, onSelectCallback);
        });
        
        document.addEventListener('click', (e) => {
            if (!input.contains(e.target) && !results.contains(e.target)) {
                results.classList.add('hidden');
            }
        });
        
        input.addEventListener('focus', () => {
             if (input.value) {
                 AppUI.handleStudentSearch(input.value, inputId, resultsId, stateKey, onSelectCallback);
             }
        });
    },
    
    handleStudentSearch: function(query, inputId, resultsId, stateKey, onSelectCallback) {
        const resultsContainer = document.getElementById(resultsId);
        
        if (query.length < 1) {
            resultsContainer.classList.add('hidden');
            return;
        }

        const lowerQuery = query.toLowerCase();
        // CAMBIO v0.5.0: Filtrar alumnos de Cicla de los buscadores
        let studentList = AppState.datosAdicionales.allStudents;
        
        // Excepciones donde SÍ se permite a Cicla
        const ciclaAllowed = ['p2pDestino', 'prestamo'];
        if (!ciclaAllowed.includes(stateKey)) {
            studentList = studentList.filter(s => s.grupoNombre !== 'Cicla');
        }
        
        const filteredStudents = studentList
            .filter(s => s.nombre.toLowerCase().includes(lowerQuery))
            .sort((a, b) => a.nombre.localeCompare(b.nombre))
            .slice(0, 10); // Limitar a 10 resultados

        resultsContainer.innerHTML = '';
        if (filteredStudents.length === 0) {
            // CAMBIO vNeón: Texto oscuro
            resultsContainer.innerHTML = `<div class="p-2 text-sm text-gray-400">No se encontraron alumnos.</div>`;
        } else {
            filteredStudents.forEach(student => {
                const div = document.createElement('div');
                // CAMBIO vNeón: Fondo y texto oscuro
                div.className = 'p-2 hover:bg-slate-600 cursor-pointer text-sm text-white';
                div.textContent = `${student.nombre} (${student.grupoNombre})`;
                div.onclick = () => {
                    const input = document.getElementById(inputId);
                    input.value = student.nombre;
                    AppState.currentSearch[stateKey].query = student.nombre;
                    AppState.currentSearch[stateKey].selected = student.nombre;
                    AppState.currentSearch[stateKey].info = student; // NUEVO v16.0: Almacenar info completa
                    resultsContainer.classList.add('hidden');
                    onSelectCallback(student); // CAMBIO v16.0: Llamar al callback con el objeto student
                };
                resultsContainer.appendChild(div);
            });
        }
        resultsContainer.classList.remove('hidden');
    },

    // CAMBIO v16.0: Añadido 'tienda'
    resetSearchInput: function(stateKey) {
        let inputId = '';
        if (stateKey.includes('p2p')) {
             inputId = `${stateKey.replace('p2p', 'p2p-search-')}`;
        } else if (stateKey.includes('bono')) {
             inputId = 'bono-search-alumno';
        } else if (stateKey.includes('tienda')) { // NUEVO v16.0
             inputId = 'tienda-search-alumno';
        } else {
            inputId = `${stateKey}-alumno-search`;
        }
            
        const input = document.getElementById(inputId);
        if (input) {
            input.value = "";
        }
        AppState.currentSearch[stateKey].query = "";
        AppState.currentSearch[stateKey].selected = null;
        AppState.currentSearch[stateKey].info = null; // NUEVO v16.0
    },
    
    // --- FIN FUNCIONES DE BÚSQUEDA ---
    
    // --- FUNCIONES P2P (v0.3.0) ---
    
    showP2PModal: function() {
        if (!AppState.datosActuales) return;
        
        AppUI.resetSearchInput('p2pOrigen');
        AppUI.resetSearchInput('p2pDestino');
        document.getElementById('p2p-clave').value = "";
        document.getElementById('p2p-cantidad').value = "";
        document.getElementById('p2p-calculo-impuesto').textContent = "";
        document.getElementById('p2p-status-msg').textContent = "";
        
        AppUI.showModal('p2p-transfer-modal');
    },
    
    // CAMBIO v16.0: La firma de la función cambió (recibe objeto)
    selectP2PStudent: function(student) {
        // Callback para P2P (no hace nada extra)
    },
    
    updateP2PCalculoImpuesto: function() {
        const cantidadInput = document.getElementById('p2p-cantidad');
        const calculoMsg = document.getElementById('p2p-calculo-impuesto');
        const cantidad = parseInt(cantidadInput.value, 10);

        if (isNaN(cantidad) || cantidad <= 0) {
            calculoMsg.textContent = "";
            return;
        }

        const impuesto = Math.ceil(cantidad * AppConfig.IMPUESTO_P2P_TASA);
        const total = cantidad + impuesto;
        
        // CAMBIO vNeón: Acento lima neón
        calculoMsg.innerHTML = `<span class="text-lime-400">Impuesto (10%): ${AppFormat.formatNumber(impuesto)} ℙ | Total a debitar: ${AppFormat.formatNumber(total)} ℙ</span>`;
    },

    // --- FIN FUNCIONES P2P ---

    // --- NUEVO v0.5.0: FUNCIONES DE BONOS ---
    
    showBonoModal: function() {
        if (!AppState.datosActuales) return;
        
        // Resetear pestaña de canje
        AppUI.resetSearchInput('bonoAlumno');
        document.getElementById('bono-clave-p2p').value = "";
        document.getElementById('bono-clave-input').value = "";
        document.getElementById('bono-status-msg').textContent = "";
        AppTransacciones.setLoadingState(document.getElementById('bono-submit-btn'), document.getElementById('bono-btn-text'), false, 'Canjear Bono');

        // Resetear pestaña de admin
        document.getElementById('bono-admin-clave').value = "";
        AppUI.clearBonoAdminForm();
        document.getElementById('bono-admin-status-msg').textContent = "";
        document.getElementById('bono-admin-gate').classList.remove('hidden');
        document.getElementById('bono-admin-panel').classList.add('hidden');
        AppState.bonos.adminPanelUnlocked = false;
        
        // Resetear a la pestaña 1
        AppUI.changeBonoTab('canjear');

        // Poblar listas
        AppUI.populateBonoList();
        AppUI.populateBonoAdminList();
        
        AppUI.showModal('bonos-modal');
    },

    // Cambia entre pestañas en el modal de Bonos
    changeBonoTab: function(tabId) {
        document.querySelectorAll('#bonos-modal .bono-tab-btn').forEach(btn => {
            // CAMBIO vNeón: Clases inactivas oscuras
            btn.classList.remove('active-tab', 'border-cyan-500', 'text-cyan-500');
            btn.classList.add('border-transparent', 'text-gray-400', 'hover:bg-slate-600');
        });

        document.querySelectorAll('#bonos-modal .bono-tab-content').forEach(content => {
            content.classList.add('hidden');
        });

        // CAMBIO vNeón: Clases activas cian
        const activeBtn = document.querySelector(`#bonos-modal [data-tab="${tabId}"]`);
        activeBtn.classList.add('active-tab', 'border-cyan-500', 'text-cyan-500');
        activeBtn.classList.remove('border-transparent', 'text-gray-400', 'hover:bg-slate-600');
        document.getElementById(`bono-tab-${tabId}`).classList.remove('hidden');

        // CAMBIO v0.5.4: Ocultar/mostrar el botón de canje
        const bonoSubmitBtn = document.getElementById('bono-submit-btn');
        if (tabId === 'canjear') {
            bonoSubmitBtn.classList.remove('hidden');
        } else {
            bonoSubmitBtn.classList.add('hidden');
        }

        // Limpiar mensajes
        document.getElementById('bono-status-msg').textContent = "";
        document.getElementById('bono-admin-status-msg').textContent = "";
    },
    
    // CAMBIO v16.0: La firma de la función cambió (recibe objeto)
    selectBonoStudent: function(student) {
        // No se necesita acción extra, solo seleccionar
    },

    // Puebla la lista de bonos disponibles (Vista de Usuario)
    populateBonoList: function() {
        const container = document.getElementById('bonos-lista-disponible');
        const bonos = AppState.bonos.disponibles;
        
        // CAMBIO v0.5.4: Filtrar bonos agotados de la vista de usuario
        const bonosActivos = bonos.filter(b => b.usos_actuales < b.usos_totales);

        if (bonosActivos.length === 0) {
            // CAMBIO vNeón: Placeholder oscuro
            container.innerHTML = `<p class="text-sm text-gray-400 text-center col-span-1 md:col-span-2">No hay bonos disponibles en este momento.</p>`;
            return;
        }

        container.innerHTML = bonosActivos.map(bono => {
            const recompensa = AppFormat.formatNumber(bono.recompensa);
            const usosRestantes = bono.usos_totales - bono.usos_actuales;
            
            // Lógica de "canjeado" (a futuro, si la API lo soporta)
            const isCanjeado = AppState.bonos.canjeados.includes(bono.clave);
            // CAMBIO vNeón: Estilo de tarjeta oscuro
            const cardClass = isCanjeado ? 'bg-slate-900 shadow-inner border-slate-700 opacity-60' : 'bg-slate-800 shadow-xl border-slate-700';
            
            // CAMBIO vNeón: Estilos de Badge y Color de Texto
            const badge = isCanjeado ? 
                `<span class="text-xs font-bold bg-green-900/50 text-green-400 rounded-full px-2 py-0.5">CANJEADO</span>` :
                `<span class="text-xs font-bold bg-pink-900/50 text-pink-400 rounded-full px-2 py-0.5">DISPONIBLE</span>`;

            return `
                <div class="rounded-lg shadow-md p-4 border transition-all ${cardClass}">
                    <div class="flex justify-between items-center mb-2">
                        <!-- CAMBIO vNeón: Texto claro -->
                        <span class="text-sm font-medium text-gray-400 truncate">${bono.clave}</span>
                        ${badge}
                    </div>
                    <!-- CAMBIO vNeón: Texto claro -->
                    <p class="text-base font-semibold text-gray-100 truncate">${bono.nombre}</p>
                    <div class="flex justify-between items-baseline mt-3">
                        <!-- CAMBIO vNeón: Texto claro -->
                        <span class="text-xs text-gray-400">Quedan ${usosRestantes}</span>
                        <!-- CAMBIO vNeón: Acento Rosa Neón -->
                        <span class="text-xl font-bold text-pink-400">${recompensa} ℙ</span>
                    </div>
                </div>
            `;
        }).join('');
    },
    
    // --- Funciones del Panel de Admin de Bonos ---
    
    toggleBonoAdminPanel: function() {
        const claveInput = document.getElementById('bono-admin-clave');
        const gate = document.getElementById('bono-admin-gate');
        const panel = document.getElementById('bono-admin-panel');
        
        if (claveInput.value === AppConfig.CLAVE_MAESTRA) {
            AppState.bonos.adminPanelUnlocked = true;
            gate.classList.add('hidden');
            panel.classList.remove('hidden');
            claveInput.value = ""; // Limpiar
            // CAMBIO vNeón: Clase de borde oscuro para el error
            claveInput.classList.remove('shake', 'border-red-500');
        } else {
            claveInput.classList.add('shake', 'border-red-500');
            claveInput.focus();
            setTimeout(() => {
                claveInput.classList.remove('shake');
            }, 500);
        }
    },
    
    // Puebla la tabla de bonos configurados (Vista de Admin)
    populateBonoAdminList: function() {
        const tbody = document.getElementById('bonos-admin-lista');
        const bonos = AppState.bonos.disponibles; // La API (v13.6) envía todos (activos y agotados)

        if (bonos.length === 0) {
            // CAMBIO vNeón: Placeholder oscuro
            tbody.innerHTML = `<tr><td colspan="5" class="p-4 text-center text-gray-400">No hay bonos configurados.</td></tr>`;
            return;
        }

        let html = '';
        // CAMBIO v16.0: Ordenar por clave alfabéticamente
        const bonosOrdenados = [...bonos].sort((a, b) => a.clave.localeCompare(b.clave));

        bonosOrdenados.forEach(bono => {
            const recompensa = AppFormat.formatNumber(bono.recompensa);
            const usos = `${bono.usos_actuales} / ${bono.usos_totales}`;
            const isAgotado = bono.usos_actuales >= bono.usos_totales;
            // CAMBIO vNeón: Filas oscuras
            const rowClass = isAgotado ? 'opacity-60 bg-slate-900/50' : 'hover:bg-slate-700';
            
            // CORRECCIÓN BUG ONCLICK: Escapar comillas
            const nombreEscapado = escapeHTML(bono.nombre);
            const claveEscapada = escapeHTML(bono.clave);

            html += `
                <tr class="${rowClass}">
                    <!-- CAMBIO vNeón: Texto claro -->
                    <td class="px-4 py-2 text-sm font-semibold text-gray-100">${bono.clave}</td>
                    <td class="px-4 py-2 text-sm text-gray-300">${bono.nombre}</td>
                    <td class="px-4 py-2 text-sm text-gray-100 text-right">${recompensa} ℙ</td>
                    <td class="px-4 py-2 text-sm text-gray-300 text-right">${usos}</td>
                    <td class="px-4 py-2 text-right text-sm">
                        <!-- CAMBIO vNeón: Botón Cian -->
                        <button onclick="AppUI.handleEditBono('${claveEscapada}', '${nombreEscapado}', ${bono.recompensa}, ${bono.usos_totales})" class="font-medium text-cyan-400 hover:text-cyan-300 edit-bono-btn">Editar</button>
                        <!-- NUEVO v0.5.4: Botón Eliminar (Rojo) -->
                        <button onclick="AppTransacciones.eliminarBono('${claveEscapada}')" class="ml-2 font-medium text-red-500 hover:text-red-400 delete-bono-btn">Eliminar</button>
                    </td>
                </tr>
            `;
        });
        tbody.innerHTML = html;
    },
    
    // Carga los datos de un bono en el formulario de admin
    handleEditBono: function(clave, nombre, recompensa, usosTotales) {
        document.getElementById('bono-admin-clave-input').value = clave;
        document.getElementById('bono-admin-nombre-input').value = nombre;
        document.getElementById('bono-admin-recompensa-input').value = recompensa;
        document.getElementById('bono-admin-usos-input').value = usosTotales;
        
        // Hacer scroll al formulario
        document.getElementById('bono-admin-form-container').scrollIntoView({ behavior: 'smooth' });
    },
    
    // Limpia el formulario de admin de bonos
    clearBonoAdminForm: function() {
        document.getElementById('bono-admin-form').reset();
        document.getElementById('bono-admin-clave-input').disabled = false;
        document.getElementById('bono-admin-status-msg').textContent = "";
    },
    
    // --- FIN FUNCIONES DE BONOS ---

    // --- INICIO FUNCIONES DE TIENDA (NUEVO v16.0) ---

    showTiendaModal: function() {
        if (!AppState.datosActuales) return;
        
        // Resetear pestaña de compra
        AppUI.resetSearchInput('tiendaAlumno');
        document.getElementById('tienda-clave-p2p').value = "";
        document.getElementById('tienda-status-msg').textContent = "";
        
        // Resetear pestaña de admin
        document.getElementById('tienda-admin-clave').value = "";
        AppUI.clearTiendaAdminForm();
        document.getElementById('tienda-admin-status-msg').textContent = "";
        document.getElementById('tienda-admin-gate').classList.remove('hidden');
        document.getElementById('tienda-admin-panel').classList.add('hidden');
        AppState.tienda.adminPanelUnlocked = false;
        
        // Resetear a la pestaña 1
        AppUI.changeTiendaTab('comprar');

        // Poblar listas
        const container = document.getElementById('tienda-items-container');
        // CORRECCIÓN BUG "Cargando...": Revisar si el contenedor solo tiene el placeholder
        const isLoading = container.innerHTML.includes('Cargando artículos...');
        
        // Si está "cargando" (o vacío), renderizar. Si no, solo actualizar botones.
        if (isLoading || container.innerHTML.trim() === '') {
            AppUI.renderTiendaItems();
        } else {
            AppUI.updateTiendaButtonStates();
        }
        
        // Poblar la lista de admin
        AppUI.populateTiendaAdminList();
        // v16.1: Actualizar etiqueta de estado manual
        AppUI.updateTiendaAdminStatusLabel();
        
        AppUI.showModal('tienda-modal');
    },

    // Cambia entre pestañas en el modal de Tienda
    changeTiendaTab: function(tabId) {
        document.querySelectorAll('#tienda-modal .tienda-tab-btn').forEach(btn => {
            // CAMBIO vNeón: Clases inactivas oscuras
            btn.classList.remove('active-tab', 'border-cyan-500', 'text-cyan-500');
            btn.classList.add('border-transparent', 'text-gray-400', 'hover:bg-slate-600');
        });

        document.querySelectorAll('#tienda-modal .tienda-tab-content').forEach(content => {
            content.classList.add('hidden');
        });

        // CAMBIO vNeón: Clases activas cian
        const activeBtn = document.querySelector(`#tienda-modal [data-tab="${tabId}"]`);
        activeBtn.classList.add('active-tab', 'border-cyan-500', 'text-cyan-500');
        activeBtn.classList.remove('border-transparent', 'text-gray-400', 'hover:bg-slate-600');
        document.getElementById(`tienda-tab-${tabId}`).classList.remove('hidden');

        // Limpiar mensajes
        document.getElementById('tienda-status-msg').textContent = "";
        document.getElementById('tienda-admin-status-msg').textContent = "";
    },

    // Callback para el buscador de alumno en la tienda
    // Optimización v16.0: Llama a la función que solo actualiza botones
    selectTiendaStudent: function(student) {
        AppUI.updateTiendaButtonStates();
    },

    // Renderiza las tarjetas de la tienda
    renderTiendaItems: function() {
        const container = document.getElementById('tienda-items-container');
        const items = AppState.tienda.items;
        
        const itemKeys = Object.keys(items);

        if (itemKeys.length === 0) {
            // CAMBIO vNeón: Placeholder oscuro
            container.innerHTML = `<p class="text-sm text-gray-400 text-center col-span-1 md:col-span-2">No hay artículos configurados en la tienda en este momento.</p>`;
            return;
        }

        let html = '';
        itemKeys.sort((a,b) => items[a].precio - items[b].precio).forEach(itemId => {
            const item = items[itemId];
            const costoFinal = Math.round(item.precio * (1 + AppConfig.TASA_ITBIS));
            
            // CORRECCIÓN BUG ONCLICK: Escapar descripción y ID
            const itemIdEscapado = escapeHTML(item.ItemID); // Usar ItemID real

            html += `
                <!-- CAMBIO vNeón: Estilo de tarjeta oscuro -->
                <div class="bg-slate-800 rounded-lg shadow-xl border border-slate-700 transition-all flex flex-col p-4">
                    <!-- Header de la Tarjeta (Tipo, Stock) -->
                    <div class="flex justify-between items-center mb-2">
                        <!-- CAMBIO vNeón: Estilo de badge cian -->
                        <span class="text-xs font-bold bg-cyan-900/50 text-cyan-400 rounded-full px-2 py-0.5">${item.tipo}</span>
                        <!-- CAMBIO vNeón: Texto claro -->
                        <span id="stock-${itemIdEscapado}" class="text-xs font-medium text-gray-400">Stock: ${item.stock}</span>
                    </div>

                    <!-- CAMBIO v17.1: Se elimina el contenedor de tooltip -->
                    <!-- CAMBIO vNeón: Texto claro -->
                    <h4 class="text-lg font-bold text-gray-100 truncate mb-3" title="${escapeHTML(item.descripcion)}">
                        ${item.nombre}
                    </h4>
                    
                    <!-- Footer (Precio y Botón) -->
                    <div class="flex justify-between items-center mt-auto pt-4">
                        <!-- CAMBIO vNeón: Acento cian -->
                        <span class="text-xl font-bold text-cyan-400">${AppFormat.formatNumber(costoFinal)} ℙ</span>
                        
                        <!-- CORRECCIÓN v17.1: Se asegura que se usa el itemId correcto para el ID del botón -->
                        <!-- CAMBIO v17.0: Botón de compra simplificado -->
                        <button id="buy-btn-${itemId}" 
                                data-item-id="${itemId}"
                                onclick="AppTransacciones.comprarItem('${itemId}', this)"
                                class="tienda-buy-btn bg-cyan-400 text-cyan-900 hover:bg-cyan-500 w-auto min-w-[90px] text-center shadow-md shadow-cyan-400/10">
                            <span class="btn-text">Comprar</span>
                        </button>
                    </div>
                </div>
            `;
        });
        
        container.innerHTML = html;
        
        // Llamada inicial para establecer el estado de los botones
        AppUI.updateTiendaButtonStates();
    },

    // Optimización v16.0: Solo actualiza el estado de los botones
    // CAMBIO v17.0: Actualiza el .btn-text interno
    // CORRECCIÓN v17.1: Asegura que la búsqueda usa el ItemID como clave
    updateTiendaButtonStates: function() {
        const items = AppState.tienda.items;
        const student = AppState.currentSearch.tiendaAlumno.info;
        const isStoreOpen = AppState.tienda.isStoreOpen;

        Object.keys(items).forEach(itemId => { // itemId es la clave del objeto, que es item.ItemID
            const item = items[itemId];
            const btn = document.getElementById(`buy-btn-${itemId}`); // Se busca por itemId (la clave)
            if (!btn) return;
            
            const btnText = btn.querySelector('.btn-text');
            if (!btnText) return; 

            const costoFinal = Math.round(item.precio * (1 + AppConfig.TASA_ITBIS));
            
            // Reset clases
            // CAMBIO vNeón: Clases de reset oscuras
            btn.classList.remove('disabled-gray', 'sin-fondos-btn', 'agotado-btn', 'bg-cyan-400', 'hover:bg-cyan-500', 'text-cyan-900', 'shadow-md', 'shadow-cyan-400/10', 'bg-slate-700', 'text-gray-500', 'line-through', 'bg-red-900/50', 'text-red-400', 'border', 'border-red-500/50');
            btn.disabled = false;
            btnText.textContent = "Comprar";

            if (item.stock <= 0 && item.ItemID !== 'filantropo') { // Usar ItemID real
                // CAMBIO vNeón: Botón agotado oscuro y tachado
                btn.classList.add('agotado-btn', 'bg-slate-700', 'text-gray-500', 'line-through');
                btnText.textContent = "Agotado";
                btn.disabled = true;
            } else if (!isStoreOpen) {
                // CAMBIO vNeón: Botón cerrado oscuro
                btn.classList.add('disabled-gray', 'bg-slate-700', 'text-gray-500');
                btnText.textContent = "Cerrada"; // Cambiar a "Cerrada" para más claridad
                btn.disabled = true;
            } else if (!student) {
                // CAMBIO vNeón: Botón gris para forzar selección de usuario
                btn.classList.add('disabled-gray', 'bg-slate-700', 'text-gray-500');
                btnText.textContent = "Comprar";
                btn.disabled = true;
            } else if (student && student.pinceles < costoFinal) { // Añadir chequeo de 'student'
                // CAMBIO vNeón: Botón sin fondos (rojo neón)
                btn.classList.add('sin-fondos-btn', 'bg-red-900/50', 'text-red-400', 'border', 'border-red-500/50');
                btnText.textContent = "Comprar"; // No mostrar "Sin Fondos" para no exponer
                btn.disabled = true;
            } else {
                // Estado por defecto (Habilitado - Cian Neón)
                btn.classList.add('bg-cyan-400', 'text-cyan-900', 'hover:bg-cyan-500', 'shadow-md', 'shadow-cyan-400/10');
                btnText.textContent = "Comprar";
            }
        });
    },

    // --- ELIMINADO v17.0: showTiendaConfirmModal ---

    // --- Funciones del Panel de Admin de Tienda ---
    
    toggleTiendaAdminPanel: function() {
        const claveInput = document.getElementById('tienda-admin-clave');
        const gate = document.getElementById('tienda-admin-gate');
        const panel = document.getElementById('tienda-admin-panel');
        
        if (claveInput.value === AppConfig.CLAVE_MAESTRA) {
            AppState.tienda.adminPanelUnlocked = true;
            gate.classList.add('hidden');
            panel.classList.remove('hidden');
            claveInput.value = ""; // Limpiar
            // CAMBIO vNeón: Clase de borde oscuro para el error
            claveInput.classList.remove('shake', 'border-red-500');
        } else {
            claveInput.classList.add('shake', 'border-red-500');
            claveInput.focus();
            setTimeout(() => {
                claveInput.classList.remove('shake');
            }, 500);
        }
    },
    
    // NUEVO v16.1 (Problema 3): Actualiza la etiqueta de estado en el panel de admin
    // CAMBIO v17.1: Se eliminan las etiquetas "(Control Manual)"
    updateTiendaAdminStatusLabel: function() {
        const label = document.getElementById('tienda-admin-status-label');
        const container = label ? label.closest('div') : null;
        if (!label || !container) return;
        
        const status = AppState.tienda.storeManualStatus;
        
        // CAMBIO vNeón: Clases de color para dark mode
        label.classList.remove('text-cyan-400', 'text-lime-400', 'text-red-400', 'text-gray-400');
        container.classList.remove('bg-cyan-900/20', 'bg-lime-900/20', 'bg-red-900/20');
        container.classList.add('bg-slate-700'); // Base oscura

        if (status === 'auto') {
            label.textContent = "Automático (por Temporizador)";
            label.classList.add('text-cyan-400');
        } else if (status === 'open') {
            label.textContent = "Forzado Abierto";
            label.classList.add('text-lime-400');
            container.classList.add('bg-lime-900/20');
        } else if (status === 'closed') {
            label.textContent = "Forzado Cerrado";
            label.classList.add('text-red-400');
            container.classList.add('bg-red-900/20');
        } else {
            label.textContent = "Desconocido";
            label.classList.add('text-gray-400');
        }
    },

    // --- NUEVAS FUNCIONES DE CONFIRMACIÓN DE BORRADO (v17.0) ---
    handleDeleteConfirmation: function(itemId) {
        const row = document.getElementById(`tienda-item-row-${itemId}`);
        if (!row) return;

        const actionCell = row.cells[4];
        
        // CORRECCIÓN BUG ONCLICK: Escapar ID para el onclick
        const itemIdEscapado = escapeHTML(itemId);

        actionCell.innerHTML = `
            <!-- CAMBIO vNeón: Botones de confirmación oscuros/rojo -->
            <button onclick="AppTransacciones.eliminarItem('${itemIdEscapado}')" class="font-medium text-red-500 hover:text-red-400 confirm-delete-btn">Confirmar</button>
            <button onclick="AppUI.cancelDeleteConfirmation('${itemIdEscapado}')" class="ml-2 font-medium text-gray-400 hover:text-gray-300">Cancelar</button>
        `;
    },

    cancelDeleteConfirmation: function(itemId) {
        const item = AppState.tienda.items[itemId];
        if (!item) return;

        const row = document.getElementById(`tienda-item-row-${itemId}`);
        if (!row) return;

        const actionCell = row.cells[4];
        
        // Revertir a los botones originales
        const nombreEscapado = escapeHTML(item.nombre);
        const descEscapada = escapeHTML(item.descripcion);
        const tipoEscapado = escapeHTML(item.tipo);
        const itemIdEscapado = escapeHTML(item.ItemID); 

        actionCell.innerHTML = `
            <!-- CAMBIO vNeón: Botones de acción cian/rojo -->
            <button onclick="AppUI.handleEditItem('${itemIdEscapado}', '${nombreEscapado}', '${descEscapada}', '${tipoEscapado}', ${item.precio}, ${item.stock})" class="font-medium text-cyan-400 hover:text-cyan-300 edit-item-btn">Editar</button>
            <button onclick="AppUI.handleDeleteConfirmation('${itemIdEscapado}')" class="ml-2 font-medium text-red-500 hover:text-red-400 delete-item-btn">Eliminar</button>
        `;
    },
    // --- FIN FUNCIONES DE CONFIRMACIÓN ---


    populateTiendaAdminList: function() {
        const tbody = document.getElementById('tienda-admin-lista');
        const items = AppState.tienda.items;
        const itemKeys = Object.keys(items);

        if (itemKeys.length === 0) {
            // CAMBIO vNeón: Placeholder oscuro
            tbody.innerHTML = `<tr><td colspan="5" class="p-4 text-center text-gray-400">No hay artículos configurados.</td></tr>`;
            return;
        }

        let html = '';
        const itemsOrdenados = itemKeys.sort((a,b) => a.localeCompare(b));

        itemsOrdenados.forEach(itemId => {
            const item = items[itemId];
            const precio = AppFormat.formatNumber(item.precio);
            const stock = item.stock;
            // CAMBIO vNeón: Filas oscuras
            const rowClass = (stock <= 0 && item.ItemID !== 'filantropo') ? 'opacity-60 bg-slate-900/50' : 'hover:bg-slate-700';
            
            // CORRECCIÓN BUG ONCLICK: Escapar datos para los botones
            const itemIdEscapado = escapeHTML(item.ItemID); // Usar ItemID real
            const nombreEscapado = escapeHTML(item.nombre);
            const descEscapada = escapeHTML(item.descripcion);
            const tipoEscapado = escapeHTML(item.tipo);

            html += `
                <tr id="tienda-item-row-${itemIdEscapado}" class="${rowClass}">
                    <!-- CAMBIO vNeón: Texto claro -->
                    <td class="px-4 py-2 text-sm font-semibold text-gray-100">${item.ItemID}</td>
                    <td class="px-4 py-2 text-sm text-gray-300 truncate" title="${item.nombre}">${item.nombre}</td>
                    <td class="px-4 py-2 text-sm text-gray-100 text-right">${precio} ℙ</td>
                    <td class="px-4 py-2 text-sm text-gray-300 text-right">${stock}</td>
                    <td class="px-4 py-2 text-right text-sm">
                        <!-- CAMBIO vNeón: Botones de acción cian/rojo -->
                        <button onclick="AppUI.handleEditItem('${itemIdEscapado}', '${nombreEscapado}', '${descEscapada}', '${tipoEscapado}', ${item.precio}, ${item.stock})" class="font-medium text-cyan-400 hover:text-cyan-300 edit-item-btn">Editar</button>
                        <button onclick="AppUI.handleDeleteConfirmation('${itemIdEscapado}')" class="ml-2 font-medium text-red-500 hover:text-red-400 delete-item-btn">Eliminar</button>
                    </td>
                </tr>
            `;
        });
        tbody.innerHTML = html;
    },
    
    // CAMBIO v17.0: Deshabilita ItemID al editar y cambia texto del botón.
    handleEditItem: function(itemId, nombre, descripcion, tipo, precio, stock) {
        document.getElementById('tienda-admin-itemid-input').value = itemId;
        document.getElementById('tienda-admin-nombre-input').value = nombre;
        document.getElementById('tienda-admin-desc-input').value = descripcion;
        document.getElementById('tienda-admin-tipo-input').value = tipo;
        document.getElementById('tienda-admin-precio-input').value = precio;
        document.getElementById('tienda-admin-stock-input').value = stock;
        
        // OPTIMIZACIÓN ADMIN 1: Deshabilitar ItemID al editar
        document.getElementById('tienda-admin-itemid-input').disabled = true;
        document.getElementById('tienda-admin-submit-btn').textContent = 'Guardar Cambios';
        
        // CAMBIO vNeón: Deshabilitar Input oscuro
        document.getElementById('tienda-admin-itemid-input').classList.add('disabled:bg-slate-700', 'disabled:opacity-70');


        // Hacer scroll al formulario
        document.getElementById('tienda-admin-form-container').scrollIntoView({ behavior: 'smooth' });
    },
    
    // CAMBIO v17.0: Habilita ItemID y resetea texto del botón.
    clearTiendaAdminForm: function() {
        document.getElementById('tienda-admin-form').reset();
        // OPTIMIZACIÓN ADMIN 1: Habilitar ItemID y resetear botón al limpiar
        document.getElementById('tienda-admin-itemid-input').disabled = false;
        document.getElementById('tienda-admin-submit-btn').textContent = 'Crear / Actualizar';
        document.getElementById('tienda-admin-status-msg').textContent = "";
        
        // CAMBIO vNeón: Habilitar Input oscuro
        document.getElementById('tienda-admin-itemid-input').classList.remove('disabled:bg-slate-700', 'disabled:opacity-70');
    },
    
    // --- FIN FUNCIONES DE TIENDA ---
    
    // --- NUEVO v0.4.2: Cálculo de Comisión Admin ---
    updateAdminDepositoCalculo: function() {
        const cantidadInput = document.getElementById('transaccion-cantidad-input');
        const calculoMsg = document.getElementById('transaccion-calculo-impuesto');
        const cantidad = parseInt(cantidadInput.value, 10);

        if (isNaN(cantidad) || cantidad <= 0) {
            calculoMsg.textContent = ""; // Limpiar si es 0, negativo o vacío
            return;
        }

        const comision = Math.round(cantidad * AppConfig.IMPUESTO_DEPOSITO_ADMIN);
        const costoNeto = cantidad - comision;

        // CAMBIO vNeón: Acento cian neón
        calculoMsg.innerHTML = `<span class="text-cyan-400">Monto a depositar: ${AppFormat.formatNumber(cantidad)} ℙ | Costo Neto Tesorería: ${AppFormat.formatNumber(costoNeto)} ℙ (Comisión: ${AppFormat.formatNumber(comision)} ℙ)</span>`;
    },


    // --- ELIMINADO v0.4.1: FUNCIONES FONDO DE INVERSIÓN ---

    // --- FIN FUNCIONES FONDO DE INVERSIÓN ---


    // --- FUNCIÓN CENTRAL: Mostrar Modal de Administración y pestaña inicial ---
    showTransaccionModal: function(tab) {
        if (!AppState.datosActuales) {
            return;
        }
        
        AppUI.changeAdminTab(tab); 
        
        AppUI.showModal('transaccion-modal');
    },

    // V0.2.2: Función para poblar GRUPOS de la pestaña Transacción
    populateGruposTransaccion: function() {
        const grupoContainer = document.getElementById('transaccion-lista-grupos-container');
        grupoContainer.innerHTML = ''; 

        AppState.datosActuales.forEach(grupo => {
            if (grupo.nombre === 'Cicla' || grupo.total === 0) return;

            // CAMBIO vNeón: Hover oscuro
            const div = document.createElement('div');
            div.className = "flex items-center p-1 rounded hover:bg-slate-600";
            
            const input = document.createElement('input');
            input.type = "checkbox";
            input.id = `group-cb-${grupo.nombre}`;
            input.value = grupo.nombre;
            // CAMBIO vNeón: Checkbox cian
            input.className = "h-4 w-4 text-cyan-400 border-slate-600 rounded focus:ring-cyan-500 bg-slate-700 group-checkbox";
            input.addEventListener('change', AppUI.populateUsuariosTransaccion);

            const label = document.createElement('label');
            label.htmlFor = input.id;
            // CAMBIO vNeón: Texto claro
            label.textContent = `${grupo.nombre} (${AppFormat.formatNumber(grupo.total)} ℙ)`;
            label.className = "ml-2 block text-sm text-gray-300 cursor-pointer flex-1";

            div.appendChild(input);
            div.appendChild(label);
            grupoContainer.appendChild(div);
        });

        // CAMBIO vNeón: Placeholder oscuro
        document.getElementById('transaccion-lista-usuarios-container').innerHTML = '<span class="text-sm text-gray-400 p-2">Seleccione un grupo...</span>';
        AppState.transaccionSelectAll = {}; 
        
        // CAMBIO vNeón: Acento cian neón
        document.getElementById('tesoreria-saldo-transaccion').textContent = `(Fondos disponibles: ${AppFormat.formatNumber(AppState.datosAdicionales.saldoTesoreria)} ℙ)`;
    },

    // V0.2.2: Función para poblar USUARIOS de la pestaña Transacción
    populateUsuariosTransaccion: function() {
        const checkedGroups = document.querySelectorAll('#transaccion-lista-grupos-container input[type="checkbox"]:checked');
        const selectedGroupNames = Array.from(checkedGroups).map(cb => cb.value);
        
        const listaContainer = document.getElementById('transaccion-lista-usuarios-container');
        listaContainer.innerHTML = ''; 

        if (selectedGroupNames.length === 0) {
            // CAMBIO vNeón: Placeholder oscuro
            listaContainer.innerHTML = '<span class="text-sm text-gray-400 p-2">Seleccione un grupo...</span>';
            return;
        }

        selectedGroupNames.forEach(grupoNombre => {
            const grupo = AppState.datosActuales.find(g => g.nombre === grupoNombre);

            if (grupo && grupo.usuarios && grupo.usuarios.length > 0) {
                // CAMBIO vNeón: Encabezado oscuro
                const headerDiv = document.createElement('div');
                headerDiv.className = "flex justify-between items-center bg-slate-700 p-2 mt-2 sticky top-0 border-b border-slate-600"; 
                // CAMBIO vNeón: Texto claro
                headerDiv.innerHTML = `<span class="text-sm font-semibold text-gray-300">${grupo.nombre}</span>`;
                
                const btnSelectAll = document.createElement('button');
                btnSelectAll.textContent = "Todos";
                btnSelectAll.dataset.grupo = grupo.nombre; 
                // CAMBIO vNeón: Botón Cian neón
                btnSelectAll.className = "text-xs font-medium text-cyan-400 hover:text-cyan-300 select-all-users-btn";
                AppState.transaccionSelectAll[grupo.nombre] = false; 
                btnSelectAll.addEventListener('click', AppUI.toggleSelectAllUsuarios);
                
                headerDiv.appendChild(btnSelectAll);
                listaContainer.appendChild(headerDiv);

                const usuariosOrdenados = [...grupo.usuarios].sort((a, b) => a.nombre.localeCompare(b.nombre));

                usuariosOrdenados.forEach(usuario => {
                    // CAMBIO vNeón: Hover oscuro
                    const div = document.createElement('div');
                    div.className = "flex items-center p-1 rounded hover:bg-slate-600 ml-2"; 
                    
                    const input = document.createElement('input');
                    input.type = "checkbox";
                    input.id = `user-cb-${grupo.nombre}-${usuario.nombre.replace(/\s/g, '-')}`; 
                    input.value = usuario.nombre;
                    input.dataset.grupo = grupo.nombre; 
                    // CAMBIO vNeón: Checkbox cian
                    input.className = "h-4 w-4 text-cyan-400 border-slate-600 rounded focus:ring-cyan-500 bg-slate-700 user-checkbox";
                    input.dataset.checkboxGrupo = grupo.nombre; 

                    const label = document.createElement('label');
                    label.htmlFor = input.id;
                    // CAMBIO vNeón: Texto claro
                    label.textContent = usuario.nombre;
                    label.className = "ml-2 block text-sm text-gray-300 cursor-pointer flex-1";

                    div.appendChild(input);
                    div.appendChild(label);
                    listaContainer.appendChild(div);
                });
            }
        });
        
        if (listaContainer.innerHTML === '') {
             // CAMBIO vNeón: Placeholder oscuro
             listaContainer.innerHTML = '<span class="text-sm text-gray-400 p-2">Los grupos seleccionados no tienen usuarios.</span>';
        }
    },
    
    toggleSelectAllUsuarios: function(event) {
        event.preventDefault();
        const btn = event.target;
        const grupoNombre = btn.dataset.grupo;
        if (!grupoNombre) return;

        AppState.transaccionSelectAll[grupoNombre] = !AppState.transaccionSelectAll[grupoNombre];
        const isChecked = AppState.transaccionSelectAll[grupoNombre];

        const checkboxes = document.querySelectorAll(`#transaccion-lista-usuarios-container input[data-checkbox-grupo="${grupoNombre}"]`);
        
        checkboxes.forEach(cb => {
            cb.checked = isChecked;
        });

        btn.textContent = isChecked ? "Ninguno" : "Todos";
    },

    // --- FUNCIONES DE PRÉSTAMOS (PESTAÑA 2) ---
    loadPrestamoPaquetes: function(selectedStudentName) {
        const container = document.getElementById('prestamo-paquetes-container');
        const saldoSpan = document.getElementById('prestamo-alumno-saldo');
        
        // CAMBIO vNeón: Acento cian
        document.getElementById('tesoreria-saldo-prestamo').textContent = `(Tesorería: ${AppFormat.formatNumber(AppState.datosAdicionales.saldoTesoreria)} ℙ)`;

        if (!selectedStudentName) {
            // CAMBIO vNeón: Placeholder oscuro
            container.innerHTML = '<div class="text-sm text-gray-400">Busque y seleccione un alumno para ver las opciones.</div>';
            saldoSpan.textContent = '';
            return;
        }

        const student = AppState.datosAdicionales.allStudents.find(s => s.nombre === selectedStudentName);
        if (!student) return;
        
        // CAMBIO vNeón: Texto claro
        saldoSpan.textContent = `(Saldo actual: ${AppFormat.formatNumber(student.pinceles)} ℙ)`;

        const paquetes = {
            'rescate': { monto: 15000, interes: 25, plazoDias: 7, label: "Rescate" },
            'estandar': { monto: 50000, interes: 25, plazoDias: 14, label: "Estándar" },
            'inversion': { monto: 120000, interes: 25, plazoDias: 21, label: "Inversión" }
        };
        
        let html = '';
        let hasActiveLoan = AppState.datosAdicionales.prestamosActivos.some(p => p.alumno === selectedStudentName);

        if (hasActiveLoan) {
             // CAMBIO vNeón: Alerta oscura
             container.innerHTML = `<div class="p-3 text-sm font-semibold text-red-400 bg-red-900/30 rounded-lg border border-red-500/50">🚫 El alumno ya tiene un préstamo activo.</div>`;
             return;
        }

        Object.keys(paquetes).forEach(tipo => {
            const pkg = paquetes[tipo];
            
            const totalAPagar = Math.ceil(pkg.monto * (1 + pkg.interes / 100));
            const cuotaDiaria = Math.ceil(totalAPagar / pkg.plazoDias);
            
            let isEligible = true;
            let eligibilityMessage = '';

            if (AppState.datosAdicionales.saldoTesoreria < pkg.monto) {
                isEligible = false;
                eligibilityMessage = `(Tesorería sin fondos)`;
            }

            if (isEligible && tipo !== 'rescate') {
                if (student.pinceles >= 0) { 
                    const capacidad = student.pinceles * 0.50;
                    if (pkg.monto > capacidad) {
                        isEligible = false;
                        eligibilityMessage = `(Máx: ${AppFormat.formatNumber(capacidad.toFixed(0))} ℙ)`;
                    }
                } else { 
                    isEligible = false;
                    eligibilityMessage = `(Solo Rescate)`;
                }
            } else if (isEligible && tipo === 'rescate') {
                 if (student.pinceles < 0 && Math.abs(student.pinceles) >= pkg.monto) {
                     isEligible = false;
                     eligibilityMessage = `(Deuda muy alta: ${AppFormat.formatNumber(student.pinceles)} ℙ)`;
                 }
            }


            // CAMBIO vNeón: Estilos de botón y borde oscuros
            const buttonClass = isEligible ? 'bg-cyan-500 text-cyan-900 hover:bg-cyan-600 shadow-sm shadow-cyan-400/10' : 'bg-slate-700 text-gray-500 cursor-not-allowed';
            const buttonDisabled = !isEligible ? 'disabled' : '';
            
            // CORRECCIÓN BUG ONCLICK: Escapar nombres
            const studentNameEscapado = escapeHTML(selectedStudentName);
            const tipoEscapado = escapeHTML(tipo);
            const action = isEligible ? `AppTransacciones.realizarPrestamo('${studentNameEscapado}', '${tipoEscapado}')` : '';
            
            // CAMBIO vNeón: Fondo y texto claros
            html += `
                <div class="flex justify-between items-center p-3 border-b border-cyan-800/50">
                    <div>
                        <span class="font-semibold text-gray-100">${pkg.label} (${AppFormat.formatNumber(pkg.monto)} ℙ)</span>
                        <span class="text-xs text-gray-400 block">Cuota: <strong>${AppFormat.formatNumber(cuotaDiaria)} ℙ</strong> (x${pkg.plazoDias} días). Total: ${AppFormat.formatNumber(totalAPagar)} ℙ.</span>
                    </div>
                    <button onclick="${action}" class="px-3 py-1 text-xs font-medium rounded-lg transition-colors ${buttonClass}" ${buttonDisabled}>
                        Otorgar ${isEligible ? '' : eligibilityMessage}
                    </button>
                </div>
            `;
        });
        
        container.innerHTML = html;
    },
    
    // --- FUNCIONES DE DEPÓSITOS (PESTAÑA 3) ---
    loadDepositoPaquetes: function(selectedStudentName) {
        const container = document.getElementById('deposito-paquetes-container');
        const saldoSpan = document.getElementById('deposito-alumno-saldo');
        
        // CAMBIO vNeón: Acento lima neón
        document.getElementById('deposito-info-tesoreria').textContent = `(Tesorería: ${AppFormat.formatNumber(AppState.datosAdicionales.saldoTesoreria)} ℙ)`;

        if (!selectedStudentName) {
            // CAMBIO vNeón: Placeholder oscuro
            container.innerHTML = '<div class="text-sm text-gray-400">Busque y seleccione un alumno para ver las opciones.</div>';
            saldoSpan.textContent = '';
            return;
        }

        const student = AppState.datosAdicionales.allStudents.find(s => s.nombre === selectedStudentName);
        if (!student) return;

        // CAMBIO vNeón: Texto claro
        saldoSpan.textContent = `(Saldo actual: ${AppFormat.formatNumber(student.pinceles)} ℙ)`;

        const paquetes = {
            'ahorro_express': { monto: 50000, interes: 8, plazo: 7, label: "Ahorro Express" },
            'fondo_fiduciario': { monto: 150000, interes: 15, plazo: 14, label: "Fondo Fiduciario" },
            'capital_estrategico': { monto: 300000, interes: 22, plazo: 21, label: "Capital Estratégico" }
        };

        let html = '';
        let hasActiveLoan = AppState.datosAdicionales.prestamosActivos.some(p => p.alumno === selectedStudentName);

        if (hasActiveLoan) {
             // CAMBIO vNeón: Alerta oscura
             container.innerHTML = `<div class="p-3 text-sm font-semibold text-red-400 bg-red-900/30 rounded-lg border border-red-500/50">🚫 El alumno tiene un préstamo activo. Debe saldarlo para invertir.</div>`;
             return;
        }
        
        Object.keys(paquetes).forEach(tipo => {
            const pkg = paquetes[tipo];
            
            const interesBruto = pkg.monto * (pkg.interes / 100);
            const impuesto = Math.ceil(interesBruto * AppConfig.IMPUESTO_DEPOSITO_TASA); // 5%
            const interesNeto = interesBruto - impuesto;
            const totalARecibirNeto = pkg.monto + interesNeto;

            
            let isEligible = student.pinceles >= pkg.monto;
            let eligibilityMessage = '';

            if (!isEligible) {
                eligibilityMessage = `(Faltan ${AppFormat.formatNumber(pkg.monto - student.pinceles)} ℙ)`;
            }

            // CAMBIO vNeón: Estilos de botón y borde oscuros (Lima)
            const buttonClass = isEligible ? 'bg-lime-500 text-lime-900 hover:bg-lime-600 shadow-sm shadow-lime-500/10' : 'bg-slate-700 text-gray-500 cursor-not-allowed';
            const buttonDisabled = !isEligible ? 'disabled' : '';
            
            // CORRECCIÓN BUG ONCLICK: Escapar nombres
            const studentNameEscapado = escapeHTML(selectedStudentName);
            const tipoEscapado = escapeHTML(tipo);
            const action = isEligible ? `AppTransacciones.realizarDeposito('${studentNameEscapado}', '${tipoEscapado}')` : '';

            // CAMBIO vNeón: Fondo y texto claros
            html += `
                <div class="flex justify-between items-center p-3 border-b border-lime-800/50">
                    <div>
                        <span class="font-semibold text-gray-100">${pkg.label} (${AppFormat.formatNumber(pkg.monto)} ℙ)</span>
                        <span class="text-xs text-gray-400 block">
                            Recibe: <strong>${AppFormat.formatNumber(totalARecibirNeto)} ℙ</strong> 
                            (Tasa ${pkg.interes}% - Imp. ${AppFormat.formatNumber(impuesto)} ℙ)
                        </span>
                    </div>
                    <button onclick="${action}" class="px-3 py-1 text-xs font-medium text-white rounded-lg transition-colors ${buttonClass}" ${buttonDisabled}>
                        Depositar ${isEligible ? '' : eligibilityMessage}
                    </button>
                </div>
            `;
        });
        
        container.innerHTML = html;
    },


    // --- Utilidades UI ---
    setConnectionStatus: function(status, title) {
        const dot = document.getElementById('status-dot');
        const indicator = document.getElementById('status-indicator');
        if (!dot) return;
        
        indicator.title = title;

        // CAMBIO vNeón: Colores neón
        dot.classList.remove('bg-lime-500', 'bg-cyan-400', 'bg-red-500', 'animate-pulse-dot');

        switch (status) {
            case 'ok':
                // CAMBIO vNeón: Lima
                dot.classList.add('bg-lime-500', 'animate-pulse-dot');
                break;
            case 'loading':
                // CAMBIO vNeón: Cian
                dot.classList.add('bg-cyan-400', 'animate-pulse-dot');
                break;
            case 'error':
                // CAMBIO vNeón: Rojo
                dot.classList.add('bg-red-500');
                break;
        }
    },

    hideSidebar: function() {
        if (AppState.isSidebarOpen) {
            AppUI.toggleSidebar();
        }
    },

    toggleSidebar: function() {
        const sidebar = document.getElementById('sidebar');
        const btn = document.getElementById('toggle-sidebar-btn');
        
        AppState.isSidebarOpen = !AppState.isSidebarOpen; 

        if (AppState.isSidebarOpen) {
            sidebar.classList.remove('-translate-x-full');
            btn.innerHTML = '«'; // Flecha de cerrar
        } else {
            sidebar.classList.add('-translate-x-full');
            btn.innerHTML = '»'; // Flecha de abrir
        }
        
        AppUI.resetSidebarTimer(); // Iniciar o limpiar el timer
    },


    resetSidebarTimer: function() {
        if (AppState.sidebarTimer) {
            clearTimeout(AppState.sidebarTimer);
        }
        
        if (AppState.isSidebarOpen) {
            AppState.sidebarTimer = setTimeout(() => {
                if (AppState.isSidebarOpen) { // Doble chequeo por si acaso
                    AppUI.toggleSidebar();
                }
            }, 10000); // 10 segundos
        }
    },


    actualizarSidebar: function(grupos) {
        const nav = document.getElementById('sidebar-nav');
        nav.innerHTML = ''; 
        
        const homeLink = document.createElement('a');
        homeLink.href = '#';
        homeLink.dataset.groupName = "home"; 
        // CAMBIO vNeón: Clases base oscuras
        homeLink.className = "flex items-center px-3 py-2 rounded-lg text-sm font-medium transition-colors nav-link text-gray-400 hover:bg-slate-800";
        homeLink.innerHTML = `<span class="truncate">Inicio</span>`;
        homeLink.addEventListener('click', (e) => {
            e.preventDefault();
            if (AppState.selectedGrupo === null) {
                AppUI.hideSidebar();
                return;
            }
            AppState.selectedGrupo = null;
            AppUI.mostrarPantallaNeutral(AppState.datosActuales || []);
            AppUI.actualizarSidebarActivo();
            AppUI.hideSidebar();
        });
        nav.appendChild(homeLink);

        (grupos || []).forEach(grupo => {
            const link = document.createElement('a');
            link.href = '#';
            link.dataset.groupName = grupo.nombre;
            // CAMBIO vNeón: Clases base oscuras
            link.className = "flex items-center px-3 py-2 rounded-lg text-sm font-medium transition-colors nav-link text-gray-400 hover:bg-slate-800";
            
            link.innerHTML = `
                <span class="truncate">${grupo.nombre}</span>
            `;
            link.addEventListener('click', (e) => {
                e.preventDefault();
                if (AppState.selectedGrupo === grupo.nombre) {
                    AppUI.hideSidebar();
                    return;
                }
                AppState.selectedGrupo = grupo.nombre;
                AppUI.mostrarDatosGrupo(grupo);
                AppUI.actualizarSidebarActivo();
                AppUI.hideSidebar();
            });
            nav.appendChild(link);
        });
    },

    actualizarSidebarActivo: function() {
        const links = document.querySelectorAll('#sidebar-nav .nav-link');
        links.forEach(link => {
            const groupName = link.dataset.groupName;
            const isActive = (AppState.selectedGrupo === null && groupName === 'home') || (AppState.selectedGrupo === groupName);

            if (isActive) {
                // CAMBIO vNeón: Estilo activo (cian y borde izquierdo)
                link.classList.add('bg-slate-800', 'text-cyan-400', 'border-l-4', 'border-cyan-400');
                link.classList.remove('text-gray-400', 'hover:bg-slate-800', 'hover:bg-gray-100', 'bg-blue-50', 'text-blue-600', 'border-l-0');
            } else {
                // CAMBIO vNeón: Estilo inactivo (oscuro)
                link.classList.remove('bg-slate-800', 'text-cyan-400', 'border-l-4', 'border-cyan-400');
                link.classList.add('text-gray-400', 'hover:bg-slate-800');
            }
        });
    },

    /**
     * Muestra la vista de "Inicio"
     */
    mostrarPantallaNeutral: function(grupos) {
        // CAMBIO vNeón: Texto claro
        document.getElementById('main-header-title').textContent = "Bienvenido al Banco del Pincel Dorado";
        document.getElementById('page-subtitle').innerHTML = ''; 

        const tableContainer = document.getElementById('table-container');
        tableContainer.innerHTML = '';
        tableContainer.classList.add('hidden');

        // 1. MOSTRAR RESUMEN COMPACTO
        const homeStatsContainer = document.getElementById('home-stats-container');
        const bovedaContainer = document.getElementById('boveda-card-container');
        const tesoreriaContainer = document.getElementById('tesoreria-card-container');
        const top3Grid = document.getElementById('top-3-grid');
        
        let bovedaHtml = '';
        let tesoreriaHtml = ''; 
        let top3Html = '';

        // ===================================================================
        // CORRECCIÓN 1: BÓVEDA (Total en Cuentas)
        // ===================================================================
        const allStudents = AppState.datosAdicionales.allStudents;
        
        // Tarjeta de Bóveda (AHORA CALCULA EL BRUTO POSITIVO)
        const totalGeneral = allStudents
            .filter(s => s.pinceles > 0)
            .reduce((sum, user) => sum + user.pinceles, 0);
        
        // Tarjeta de Tesorería
        const tesoreriaSaldo = AppState.datosAdicionales.saldoTesoreria;
        
        // CAMBIO vNeón: Card Oscura con sombra cian (Bóveda)
        bovedaHtml = `
            <div class="bg-slate-800 rounded-lg shadow-xl shadow-cyan-900/50 p-4 h-full flex flex-col justify-between">
                <div>
                    <!-- Fila 1: Título y Badge -->
                    <div class="flex items-center justify-between">
                        <!-- CAMBIO vNeón: Texto claro -->
                        <span class="text-sm font-medium text-gray-400 truncate">Total en Cuentas</span>
                        <!-- CAMBIO vNeón: Badge Lima Neón -->
                        <span class="text-xs font-bold bg-lime-900/50 text-lime-400 rounded-full px-2 py-0.5">BÓVEDA</span>
                    </div>
                    <!-- Fila 2: Subtítulo y Monto (Distribución Horizontal) -->
                    <div class="flex justify-between items-baseline mt-3">
                        <!-- CAMBIO vNeón: Texto claro -->
                        <p class="text-lg font-semibold text-gray-100 truncate">Pinceles Totales</p>
                        <!-- CAMBIO vNeón: Monto Cian Neón -->
                        <p class="text-3xl font-bold text-cyan-400">${AppFormat.formatNumber(totalGeneral)} ℙ</p>
                    </div>
                </div>
            </div>
        `;
        
        // CAMBIO vNeón: Card Oscura con sombra rosa (Tesorería)
        tesoreriaHtml = `
            <div class="bg-slate-800 rounded-lg shadow-xl shadow-pink-900/50 p-4 h-full flex flex-col justify-between">
                <div>
                    <!-- Fila 1: Título y Badge -->
                    <div class="flex items-center justify-between">
                        <!-- CAMBIO vNeón: Texto claro -->
                        <span class="text-sm font-medium text-gray-400 truncate">Capital Operativo</span>
                        <!-- CAMBIO vNeón: Badge Rosa Neón -->
                        <span class="text-xs font-bold bg-pink-900/50 text-pink-400 rounded-full px-2 py-0.5">TESORERÍA</span>
                    </div>
                    <!-- Fila 2: Subtítulo y Monto (Distribución Horizontal) -->
                    <div class="flex justify-between items-baseline mt-3">
                        <!-- CAMBIO vNeón: Texto claro -->
                        <p class="text-lg font-semibold text-gray-100 truncate">Fondo del Banco</p>
                        <!-- CAMBIO vNeón: Monto Rosa Neón -->
                        <p class="text-3xl font-bold text-pink-400">${AppFormat.formatNumber(tesoreriaSaldo)} ℙ</p>
                    </div>
                </div>
            </div>
        `;
        
        // ===================================================================
        // Lógica "Alumnos Destacados"
        // ===================================================================
        
        const depositosActivos = AppState.datosAdicionales.depositosActivos;
        
        const studentsWithCapital = allStudents.map(student => {
