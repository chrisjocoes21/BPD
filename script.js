// --- CONFIGURACIÓN ---
const AppConfig = {
    API_URL: 'https://script.google.com/macros/s/AKfycbyhPHZuRmC7_t9z20W4h-VPqVFk0z6qKFG_W-YXMgnth4BMRgi8ibAfjeOtIeR5OrFPXw/exec',
    TRANSACCION_API_URL: 'https://script.google.com/macros/s/AKfycbyhPHZuRmC7_t9z20W4h-VPqVFk0z6qKFG_W-YXMgnth4BMRgi8ibAfjeOtIeR5OrFPXw/exec',
    CLAVE_MAESTRA: 'PinceladasM25-26',
    SPREADSHEET_URL: 'https://docs.google.com/spreadsheets/d/1GArB7I19uGum6awiRN6qK8HtmTWGcaPGWhOzGCdhbcs/edit?usp=sharing',
    INITIAL_RETRY_DELAY: 1000,
    MAX_RETRY_DELAY: 30000,
    MAX_RETRIES: 5,
    CACHE_DURATION: 300000,
    
    APP_STATUS: 'RC', 
    APP_VERSION: 'v29.7', 
    
    // --- REGLAS DE ECONOMÍA REBALANCEADA Y FLEXIBLE (AJUSTE) ---
    IMPUESTO_P2P_TASA: 0.01,        // 1.0%
    IMPUESTO_DEPOSITO_TASA: 0.0,    
    IMPUESTO_DEPOSITO_ADMIN: 0.05,
    TASA_ITBIS: 0.18,               // 18.0%
    
    // REGLAS DE PRÉSTAMOS FLEXIBLES (AJUSTE 2.4)
    PRESTAMO_TASA_BASE: 0.015,       
    PRESTAMO_BONUS_POR_DIA: 0.0003,  
    PRESTAMO_MIN_MONTO: 10000,
    PRESTAMO_MAX_MONTO: 150000,
    PRESTAMO_MIN_PLAZO_DIAS: 3,
    PRESTAMO_MAX_PLAZO_DIAS: 21,
    
    // REGLAS DE DEPÓSITOS FLEXIBLES (AJUSTE 2.3)
    DEPOSITO_TASA_BASE: 0.005,       
    DEPOSITO_BONUS_POR_DIA: 0.000075, 
    DEPOSITO_MIN_MONTO: 50000,
    DEPOSITO_MIN_PLAZO_DIAS: 7,
    DEPOSITO_MAX_PLAZO_DIAS: 30,
};

// --- ESTADO DE LA APLICACIÓN ---
const AppState = {
    datosActuales: null,
    datosAdicionales: { 
        saldoTesoreria: 0,
        prestamosActivos: [],
        depositosActivos: [],
        allStudents: [], 
        allGroups: [] 
    },
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
    lastKnownGroupsHash: '',
    
    // Estado para Modales de Autoservicio
    currentSearch: {
        p2pOrigen: { query: '', selected: null, info: null },
        p2pDestino: { query: '', selected: null, info: null },
        bonoAlumno: { query: '', selected: null, info: null },
        tiendaAlumno: { query: '', selected: null, info: null },
        prestamoAlumno: { query: '', selected: null, info: null }, 
        depositoAlumno: { query: '', selected: null, info: null } 
    },
    
    bonos: {
        disponibles: [],
        canjeados: [],
        selectedBono: null,
    },

    tienda: {
        items: {},
        isStoreOpen: false,
        storeManualStatus: 'auto',
        selectedItem: null,
    },
    
    // AJUSTE 4.2: Hero ahora tiene 6 slides (0-5)
    heroSlideIndex: 0,
    heroSlideCount: 6, 
};

// --- AUTENTICACIÓN ---
const AppAuth = {
    verificarClave: function() {
        const claveInput = document.getElementById('clave-input');
        if (claveInput.value === AppConfig.CLAVE_MAESTRA) {
            
            AppUI.hideModal('gestion-modal');
            AppUI.showTransaccionModal('transaccion'); // Abre el modal de administración
            
            claveInput.value = '';
            claveInput.classList.remove('shake', 'border-red-500');
        } else {
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
    formatNumber: (num) => new Intl.NumberFormat('es-DO', { maximumFractionDigits: 0 }).format(num),
    toLocalISOString: (date) => {
        const pad = (num) => String(num).padStart(2, '0');
        
        const year = date.getFullYear();
        const month = pad(date.getMonth() + 1);
        const day = pad(date.getDate());
        const hours = pad(date.getHours());
        const minutes = pad(date.getMinutes());

        return `${year}-${month}-${day}T${hours}:${minutes}`;
    },
    // NUEVO: Calculadora de Tasa de Interés de Préstamo
    calculateLoanRate: (days) => {
        const rate = AppConfig.PRESTAMO_TASA_BASE + (days * AppConfig.PRESTAMO_BONUS_POR_DIA);
        return Math.min(rate, 1.0); // No debería pasar del 100%
    },
    // NUEVO: Calculadora de Tasa de Interés de Depósito
    calculateDepositRate: (days) => {
        const rate = AppConfig.DEPOSITO_TASA_BASE + (days * AppConfig.DEPOSITO_BONUS_POR_DIA);
        return Math.min(rate, 1.0); // No debería pasar del 100%
    }
};

// --- MANEJO de datos ---
const AppData = {
    
    isCacheValid: () => AppState.cachedData && AppState.lastCacheTime && (Date.now() - AppState.lastCacheTime < AppConfig.CACHE_DURATION),

    cargarDatos: async function(isRetry = false) {
        if (AppState.actualizacionEnProceso && !isRetry) return;
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
                
                AppData.procesarYMostrarDatos(data);
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
    },
    
    procesarYMostrarDatos: function(data) {
        AppState.datosAdicionales.saldoTesoreria = data.saldoTesoreria || 0;
        AppState.datosAdicionales.prestamosActivos = data.prestamosActivos || [];
        AppState.datosAdicionales.depositosActivos = data.depositosActivos || [];
        AppState.bonos.disponibles = data.bonosDisponibles || [];
        AppState.tienda.items = data.tiendaStock || {};
        AppState.tienda.storeManualStatus = data.storeManualStatus || 'auto';

        const allGroups = data.gruposData;
        
        let gruposOrdenados = Object.entries(allGroups).map(([nombre, info]) => ({ nombre, total: info.total || 0, usuarios: info.usuarios || [] }));
        
        const ciclaGroup = gruposOrdenados.find(g => g.nombre === 'Cicla');
        const activeGroups = gruposOrdenados.filter(g => g.nombre !== 'Cicla' && g.nombre !== 'Banco');

        AppState.datosAdicionales.allStudents = activeGroups.flatMap(g => g.usuarios).concat(ciclaGroup ? ciclaGroup.usuarios : []);
        
        activeGroups.forEach(g => {
            g.usuarios.forEach(u => u.grupoNombre = g.nombre);
        });
        if (ciclaGroup) {
            ciclaGroup.usuarios.forEach(u => u.grupoNombre = 'Cicla');
        }
        
        AppState.datosAdicionales.allGroups = gruposOrdenados.map(g => g.nombre).filter(n => n !== 'Banco');

        const currentGroupsHash = AppState.datosAdicionales.allGroups.join('|');
        const groupsChanged = currentGroupsHash !== AppState.lastKnownGroupsHash;
        
        if (groupsChanged) {
            AppUI.populateAdminGroupCheckboxes('bono-admin-grupos-checkboxes-container', 'bonos');
            AppUI.populateAdminGroupCheckboxes('tienda-admin-grupos-checkboxes-container', 'tienda');
            AppState.lastKnownGroupsHash = currentGroupsHash;
        }

        AppData.detectarCambios(activeGroups);

        activeGroups.sort((a, b) => b.total - a.total);
        if (ciclaGroup) {
            activeGroups.push(ciclaGroup);
        }

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
        
        // Actualización de Modales de Usuario
        const isBonoModalOpen = document.getElementById('bonos-modal').classList.contains('opacity-0') === false;
        const isTiendaModalOpen = document.getElementById('tienda-modal').classList.contains('opacity-0') === false;
        const isTransaccionesCombinadasOpen = document.getElementById('transacciones-combinadas-modal').classList.contains('opacity-0') === false;
        
        // Si los modales están abiertos, forzar el renderizado de la lista
        if (isBonoModalOpen) AppUI.populateBonoList();
        if (isTiendaModalOpen) AppUI.renderTiendaItems();
        
        if (isBonoModalOpen || isTiendaModalOpen) {
            // Si el paso 2 de Bonos/Tienda está visible, actualizar el estado de carga
            const activeModal = isBonoModalOpen ? 'bono' : 'tienda';
            const submitBtn = document.getElementById(`${activeModal}-submit-step2-btn`);
            const btnText = document.getElementById(`${activeModal}-btn-text-step2`);
            if (submitBtn && !document.getElementById(`${activeModal}-step-form-container`).classList.contains('hidden')) {
                 AppTransacciones.setLoadingState(submitBtn, btnText, false, activeModal === 'bono' ? 'Confirmar Canje' : 'Confirmar Compra');
            }
        }
        
        if (isTransaccionesCombinadasOpen) {
             // Si el modal combinado está abierto, forzar recálculos
             AppUI.updatePrestamoCalculadora();
             AppUI.updateDepositoCalculadora();
             AppUI.updateP2PCalculoImpuesto();
        }
        
        // Actualización de Modales de Admin
        if (document.getElementById('transaccion-modal').classList.contains('opacity-0') === false) {
            const activeTab = document.querySelector('#transaccion-modal .tab-btn.active-tab');
            const tabId = activeTab ? activeTab.dataset.tab : '';
            
            if (tabId === 'bonos_admin') {
                AppUI.populateBonoAdminList();
            } else if (tabId === 'tienda_gestion' || tabId === 'tienda_inventario') {
                AppUI.populateTiendaAdminList();
                AppUI.updateTiendaAdminStatusLabel();
            }
        }

        AppState.datosActuales = activeGroups;
    }
};

// --- MANEJO DE LA INTERFAZ (UI) ---
const AppUI = {
    
    init: function() {
        // Listeners Modales de Gestión (Clave)
        document.getElementById('gestion-btn').addEventListener('click', () => AppUI.showModal('gestion-modal'));
        document.getElementById('modal-submit').addEventListener('click', AppAuth.verificarClave);
        
        // LISTENERS NUEVOS: MODAL COMBINADO DE TRANSACCIONES
        document.getElementById('transacciones-btn').addEventListener('click', () => AppUI.showTransaccionesCombinadasModal('p2p_transfer'));
        document.getElementById('transacciones-combinadas-modal-close').addEventListener('click', () => AppUI.hideModal('transacciones-combinadas-modal'));

        document.querySelectorAll('#transacciones-combinadas-modal .tab-btn').forEach(button => {
            button.addEventListener('click', (e) => {
                AppUI.changeTransaccionesCombinadasTab(e.target.dataset.tab);
            });
        });
        
        // Listeners para Hero Carousel
        // Se establecen los listeners para los botones de navegación del carrusel
        // AJUSTE 4.2: Actualización de listeners (el botón "Conoce Más" ha sido eliminado del HTML)
        document.getElementById('hero-slide-0-next')?.addEventListener('click', () => AppUI.goToHeroSlide(1));

        document.querySelectorAll('.slide-next-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const nextIndex = parseInt(e.target.dataset.nextIndex, 10);
                if (!isNaN(nextIndex)) AppUI.goToHeroSlide(nextIndex);
            });
        });
        document.querySelectorAll('.slide-prev-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const prevIndex = parseInt(e.target.dataset.prevIndex, 10);
                if (!isNaN(prevIndex)) AppUI.goToHeroSlide(prevIndex);
            });
        });
        
        // Listeners para Calculadoras Flexibles (Ahora en el modal combinado)
        AppUI.setupFlexibleInputListeners('prestamo');
        AppUI.setupFlexibleInputListeners('deposito');
        document.getElementById('prestamo-submit-btn').addEventListener('click', AppTransacciones.solicitarPrestamoFlexible);
        document.getElementById('deposito-submit-btn').addEventListener('click', AppTransacciones.crearDepositoFlexible);

        // Listeners P2P/Bonos/Tienda/Reglas
        document.getElementById('modal-cancel').addEventListener('click', () => AppUI.hideModal('gestion-modal'));
        document.getElementById('transaccion-modal-close-btn').addEventListener('click', () => AppUI.hideModal('transaccion-modal'));
        document.getElementById('bonos-btn').addEventListener('click', () => AppUI.showBonoModal());
        document.getElementById('bonos-modal-close').addEventListener('click', () => AppUI.hideModal('bonos-modal'));
        document.getElementById('tienda-btn').addEventListener('click', () => AppUI.showTiendaModal());
        document.getElementById('tienda-modal-close').addEventListener('click', () => AppUI.hideModal('tienda-modal'));
        // Reglas modal ELIMINADO
        
        // Listeners P2P (Ahora en el modal combinado)
        document.getElementById('p2p-submit-btn').addEventListener('click', AppTransacciones.realizarTransferenciaP2P);
        document.getElementById('p2p-cantidad').addEventListener('input', AppUI.updateP2PCalculoImpuesto);

        // Listeners Modales (Close on backdrop click)
        document.getElementById('gestion-modal').addEventListener('click', (e) => { if (e.target.id === 'gestion-modal') AppUI.hideModal('gestion-modal'); });
        document.getElementById('student-modal').addEventListener('click', (e) => { if (e.target.id === 'student-modal') AppUI.hideModal('student-modal'); });
        document.getElementById('transaccion-modal').addEventListener('click', (e) => { if (e.target.id === 'transaccion-modal') AppUI.hideModal('transaccion-modal'); });
        document.getElementById('bonos-modal').addEventListener('click', (e) => { if (e.target.id === 'bonos-modal') AppUI.hideModal('bonos-modal'); });
        document.getElementById('tienda-modal').addEventListener('click', (e) => { if (e.target.id === 'tienda-modal') AppUI.hideModal('tienda-modal'); });
        document.getElementById('transacciones-combinadas-modal').addEventListener('click', (e) => { if (e.target.id === 'transacciones-combinadas-modal') AppUI.hideModal('transacciones-combinadas-modal'); });
        document.getElementById('terminos-modal').addEventListener('click', (e) => { if (e.target.id === 'terminos-modal') AppUI.hideModal('terminos-modal'); });
        
        // Listeners para Modales Legales
        document.getElementById('terminos-btn').addEventListener('click', () => AppUI.showLegalModal('terminos'));
        document.getElementById('privacidad-btn').addEventListener('click', () => AppUI.showLegalModal('privacidad'));


        // Listeners Bonos/Tienda/Transaccion Admin
        document.getElementById('bono-step-back-btn').addEventListener('click', AppUI.showBonoStep1);
        document.getElementById('bono-submit-step2-btn').addEventListener('click', AppTransacciones.confirmarCanje);
        document.getElementById('tienda-step-back-btn').addEventListener('click', AppUI.showTiendaStep1);
        document.getElementById('tienda-submit-step2-btn').addEventListener('click', AppTransacciones.confirmarCompra);
        document.getElementById('transaccion-submit-btn').addEventListener('click', AppTransacciones.realizarTransaccionMultiple);
        document.getElementById('transaccion-cantidad-input').addEventListener('input', AppUI.updateAdminDepositoCalculo);
        document.getElementById('bono-admin-form').addEventListener('submit', (e) => { e.preventDefault(); AppTransacciones.crearActualizarBono(); });
        document.getElementById('bono-admin-clear-btn').addEventListener('click', AppUI.clearBonoAdminForm);
        document.getElementById('tienda-admin-form').addEventListener('submit', (e) => { e.preventDefault(); AppTransacciones.crearActualizarItem(); });
        document.getElementById('tienda-admin-clear-btn').addEventListener('click', AppUI.clearTiendaAdminForm);

        document.getElementById('db-link-btn').href = AppConfig.SPREADSHEET_URL;
        document.getElementById('toggle-sidebar-btn').addEventListener('click', AppUI.toggleSidebar);
        
        const sidebar = document.getElementById('sidebar');
        sidebar.addEventListener('mouseenter', () => { if (AppState.sidebarTimer) clearTimeout(AppState.sidebarTimer); });
        sidebar.addEventListener('mouseleave', () => AppUI.resetSidebarTimer());
        
        document.querySelectorAll('#transaccion-modal .tab-btn').forEach(button => {
            button.addEventListener('click', (e) => {
                AppUI.changeAdminTab(e.target.dataset.tab);
            });
        });

        // Setup Autocomplete
        AppUI.setupSearchInput('p2p-search-origen', 'p2p-origen-results', 'p2pOrigen', AppUI.selectP2PStudent);
        AppUI.setupSearchInput('p2p-search-destino', 'p2p-destino-results', 'p2pDestino', AppUI.selectP2PStudent);
        AppUI.setupSearchInput('bono-search-alumno-step2', 'bono-origen-results-step2', 'bonoAlumno', AppUI.selectBonoStudent);
        AppUI.setupSearchInput('tienda-search-alumno-step2', 'tienda-origen-results-step2', 'tiendaAlumno', AppUI.selectTiendaStudent);
        AppUI.setupSearchInput('prestamo-search-alumno', 'prestamo-origen-results', 'prestamoAlumno', AppUI.selectFlexibleStudent);
        AppUI.setupSearchInput('deposito-search-alumno', 'deposito-origen-results', 'depositoAlumno', AppUI.selectFlexibleStudent);

        AppUI.mostrarVersionApp();
        
        AppData.cargarDatos(false);
        // AJUSTE 4.3: Reducir la frecuencia de recarga de datos de 10s a 30s
        setInterval(() => AppData.cargarDatos(false), 30000); 
        AppUI.updateCountdown();
        setInterval(AppUI.updateCountdown, 1000);
    },
    
    // --- NUEVAS FUNCIONES DE MODALES FLEXIBLES (PRESTAMOS Y DEPÓSITOS) ---
    
    showTransaccionesCombinadasModal: function(initialTab = 'p2p_transfer') {
        if (!AppState.datosActuales) return;
        AppUI.changeTransaccionesCombinadasTab(initialTab);
        AppUI.showModal('transacciones-combinadas-modal');
    },
    
    changeTransaccionesCombinadasTab: function(tabId) {
        document.querySelectorAll('#transacciones-combinadas-modal .tab-btn').forEach(btn => {
            btn.classList.remove('active-tab', 'border-amber-600', 'text-amber-600');
            btn.classList.add('border-transparent', 'text-slate-700', 'hover:bg-slate-100');
        });

        document.querySelectorAll('#transacciones-combinadas-modal .tab-content').forEach(content => {
            content.classList.add('hidden');
        });

        document.querySelector(`#transacciones-combinadas-modal [data-tab="${tabId}"]`).classList.add('active-tab', 'border-amber-600', 'text-amber-600');
        document.querySelector(`#transacciones-combinadas-modal [data-tab="${tabId}"]`).classList.remove('border-transparent', 'text-slate-700', 'hover:bg-slate-100');
        document.getElementById(`tab-${tabId}`).classList.remove('hidden');

        // Forzar recalculo y reset visual al cambiar de pestaña
        if (tabId === 'p2p_transfer') {
            AppUI.updateP2PCalculoImpuesto();
            document.getElementById('p2p-clave').focus();
        } else if (tabId === 'prestamo_flex') {
            AppUI.resetFlexibleForm('prestamo');
            AppUI.updatePrestamoCalculadora();
        } else if (tabId === 'deposito_flex') {
            AppUI.resetFlexibleForm('deposito');
            AppUI.updateDepositoCalculadora();
        }
        
        document.getElementById('transacciones-combinadas-status-msg').textContent = "";
    },

    setupFlexibleInputListeners: function(type) {
        const montoInput = document.getElementById(`${type}-monto-input`);
        const plazoInput = document.getElementById(`${type}-plazo-input`);
        const updateFunc = type === 'prestamo' ? AppUI.updatePrestamoCalculadora : AppUI.updateDepositoCalculadora;

        if (montoInput) montoInput.addEventListener('input', updateFunc);
        if (plazoInput) plazoInput.addEventListener('input', updateFunc);
    },
    
    updatePrestamoCalculadora: function() {
        const montoInput = document.getElementById('prestamo-monto-input');
        const plazoInput = document.getElementById('prestamo-plazo-input');
        const plazoDisplay = document.getElementById('prestamo-plazo-display');
        const tasaDisplay = document.getElementById('prestamo-tasa-display');
        const totalPagarDisplay = document.getElementById('prestamo-total-pagar-display');
        const cuotaDiariaDisplay = document.getElementById('prestamo-cuota-diaria-display');
        const btn = document.getElementById('prestamo-submit-btn');
        const statusMsg = document.getElementById('prestamo-elegibilidad-msg');
        
        if (!montoInput || !plazoInput) return;

        const monto = parseInt(montoInput.value) || 0;
        const plazo = parseInt(plazoInput.value) || 0;
        const student = AppState.currentSearch.prestamoAlumno.info;
        
        plazoDisplay.textContent = `${plazo} Días`;
        
        const minMonto = AppConfig.PRESTAMO_MIN_MONTO;
        const maxMonto = AppConfig.PRESTAMO_MAX_MONTO;
        
        // 1. Validaciones Básicas
        if (monto < minMonto || monto > maxMonto || plazo < AppConfig.PRESTAMO_MIN_PLAZO_DIAS || plazo > AppConfig.PRESTAMO_MAX_PLAZO_DIAS) {
            tasaDisplay.textContent = '-';
            totalPagarDisplay.textContent = 'Monto/Plazo Inválido';
            cuotaDiariaDisplay.textContent = '-';
            AppTransacciones.setEligibilityState(btn, statusMsg, false, `Monto entre ${AppFormat.formatNumber(minMonto)} ℙ y ${AppFormat.formatNumber(maxMonto)} ℙ.`, true);
            return;
        }

        // 2. Cálculo de la Tasa
        const tasaDecimal = AppFormat.calculateLoanRate(plazo);
        const interesTotal = monto * tasaDecimal;
        const totalAPagar = Math.ceil(monto + interesTotal);
        const cuotaDiaria = Math.ceil(totalAPagar / plazo);
        
        tasaDisplay.textContent = `${(tasaDecimal * 100).toFixed(2)}%`; // Mostrar más decimales para las tasas bajas
        totalPagarDisplay.textContent = `${AppFormat.formatNumber(totalAPagar)} ℙ`;
        cuotaDiariaDisplay.textContent = `${AppFormat.formatNumber(cuotaDiaria)} ℙ`;

        // 3. Validaciones de Elegibilidad (Alumno)
        if (!student) {
            AppTransacciones.setEligibilityState(btn, statusMsg, false, 'Busque su nombre para validar elegibilidad.', true);
            return;
        }
        
        const elegibilidad = AppTransacciones.checkLoanEligibility(student, monto);
        AppTransacciones.setEligibilityState(btn, statusMsg, elegibilidad.isEligible, elegibilidad.message);
    },

    updateDepositoCalculadora: function() {
        const montoInput = document.getElementById('deposito-monto-input');
        const plazoInput = document.getElementById('deposito-plazo-input');
        const plazoDisplay = document.getElementById('deposito-plazo-display');
        const tasaDisplay = document.getElementById('deposito-tasa-display');
        const gananciaDisplay = document.getElementById('deposito-ganancia-display');
        const totalRecibirDisplay = document.getElementById('deposito-total-recibir-display');
        const btn = document.getElementById('deposito-submit-btn');
        const statusMsg = document.getElementById('deposito-elegibilidad-msg');

        if (!montoInput || !plazoInput) return;

        const monto = parseInt(montoInput.value) || 0;
        const plazo = parseInt(plazoInput.value) || 0;
        const student = AppState.currentSearch.depositoAlumno.info;
        
        plazoDisplay.textContent = `${plazo} Días`;
        
        const minMonto = AppConfig.DEPOSITO_MIN_MONTO;

        // 1. Validaciones Básicas
        if (monto < minMonto || plazo < AppConfig.DEPOSITO_MIN_PLAZO_DIAS || plazo > AppConfig.DEPOSITO_MAX_PLAZO_DIAS) {
            tasaDisplay.textContent = '-';
            gananciaDisplay.textContent = 'Monto/Plazo Inválido';
            totalRecibirDisplay.textContent = '0 ℙ';
            AppTransacciones.setEligibilityState(btn, statusMsg, false, `Monto mínimo: ${AppFormat.formatNumber(minMonto)} ℙ. Plazo: 7-30 días.`, true);
            return;
        }

        // 2. Cálculo de la Tasa
        const tasaDecimal = AppFormat.calculateDepositRate(plazo);
        const interesBruto = monto * tasaDecimal;
        const totalARecibir = Math.ceil(monto + interesBruto);
        
        tasaDisplay.textContent = `${(tasaDecimal * 100).toFixed(3)}%`; // Mostrar más decimales para las tasas bajas
        gananciaDisplay.textContent = `${AppFormat.formatNumber(Math.ceil(interesBruto))} ℙ`;
        totalRecibirDisplay.textContent = `${AppFormat.formatNumber(totalARecibir)} ℙ`;
        
        // 3. Validaciones de Elegibilidad (Alumno)
        if (!student) {
            AppTransacciones.setEligibilityState(btn, statusMsg, false, 'Busque su nombre para validar elegibilidad.', true);
            return;
        }

        const elegibilidad = AppTransacciones.checkDepositEligibility(student, monto);
        AppTransacciones.setEligibilityState(btn, statusMsg, elegibilidad.isEligible, elegibilidad.message);
    },
    
    selectFlexibleStudent: function(student) {
        const modal = document.getElementById('transacciones-combinadas-modal');
        if (modal.classList.contains('opacity-0') === false) {
             const activeTab = document.querySelector('#transacciones-combinadas-modal .tab-btn.active-tab');
             const tabId = activeTab ? activeTab.dataset.tab : '';
             
             if (tabId === 'prestamo_flex') {
                  AppUI.updatePrestamoCalculadora();
             } else if (tabId === 'deposito_flex') {
                  AppUI.updateDepositoCalculadora();
             }
        }
    },
    
    // --- FIN NUEVAS FUNCIONES DE MODALES FLEXIBLES ---
    
    showLoading: function() {
        document.getElementById('loading-overlay').classList.remove('opacity-0', 'pointer-events-none');
    },

    hideLoading: function() {
        document.getElementById('loading-overlay').classList.add('opacity-0', 'pointer-events-none');
    },

    mostrarVersionApp: function() {
        const versionContainer = document.getElementById('app-version-container');
        versionContainer.classList.add('text-slate-400'); 
        versionContainer.innerHTML = `Estado: ${AppConfig.APP_STATUS} | ${AppConfig.APP_VERSION}`;
    },

    showModal: function(modalId) {
        const modal = document.getElementById(modalId);
        if (!modal) return;
        modal.classList.remove('opacity-0', 'pointer-events-none');
        modal.querySelector('[class*="transform"]').classList.remove('scale-95');
    },

    hideModal: function(modalId) {
        const modal = document.getElementById(modalId);
        if (!modal) return;
        modal.classList.add('opacity-0', 'pointer-events-none');
        modal.querySelector('[class*="transform"]').classList.add('scale-95');

        if (modalId === 'transaccion-modal') {
            document.getElementById('transaccion-lista-grupos-container').innerHTML = '';
            document.getElementById('transaccion-lista-usuarios-container').innerHTML = '';
            document.getElementById('transaccion-cantidad-input').value = "";
            document.getElementById('transaccion-calculo-impuesto').textContent = ""; 
            AppState.transaccionSelectAll = {}; 
            AppTransacciones.setLoadingState(document.getElementById('transaccion-submit-btn'), document.getElementById('transaccion-btn-text'), false, 'Realizar Transacción');
            AppUI.clearBonoAdminForm();
            document.getElementById('bono-admin-status-msg').textContent = "";
            AppUI.clearTiendaAdminForm();
            document.getElementById('tienda-admin-status-msg').textContent = "";
        }
        
        if (modalId === 'transacciones-combinadas-modal') {
            // Resetear todos los formularios combinados
            AppUI.resetSearchInput('p2pOrigen');
            AppUI.resetSearchInput('p2pDestino');
            document.getElementById('p2p-clave').value = "";
            document.getElementById('p2p-cantidad').value = "";
            document.getElementById('p2p-calculo-impuesto').textContent = "";
            document.getElementById('p2p-status-msg').textContent = "";
            AppTransacciones.setLoadingState(document.getElementById('p2p-submit-btn'), document.getElementById('p2p-btn-text'), false, 'Realizar Transferencia');
            
            AppUI.resetFlexibleForm('prestamo');
            AppUI.resetFlexibleForm('deposito');
        }
        
        if (modalId === 'bonos-modal') {
            AppUI.showBonoStep1();
            document.getElementById('bono-clave-p2p-step2').value = "";
            document.getElementById('bono-status-msg').textContent = ""; 
            document.getElementById('bono-step2-status-msg').textContent = "";
            AppUI.resetSearchInput('bonoAlumno');
        }

        if (modalId === 'tienda-modal') {
            AppUI.showTiendaStep1();
            document.getElementById('tienda-clave-p2p-step2').value = "";
            document.getElementById('tienda-status-msg').textContent = "";
            document.getElementById('tienda-step2-status-msg').textContent = "";
            AppUI.resetSearchInput('tiendaAlumno');
        }
        
        if (modalId === 'gestion-modal') {
             document.getElementById('clave-input').value = "";
             document.getElementById('clave-input').classList.remove('shake', 'border-red-500');
        }
        
        if (modalId === 'terminos-modal') {
             // Limpiar contenido al cerrar
             document.getElementById('terminos-modal-content').innerHTML = '<p class="text-center text-sm text-slate-500">Cargando el contrato de uso...</p>';
             document.getElementById('terminos-modal-title').textContent = 'Términos y Condiciones';
        }
    },
    
    resetFlexibleForm: function(type) {
        AppUI.resetSearchInput(`${type}Alumno`);
        document.getElementById(`${type}-clave-p2p`).value = "";
        
        const montoInput = document.getElementById(`${type}-monto-input`);
        const plazoInput = document.getElementById(`${type}-plazo-input`);
        
        if (montoInput) montoInput.value = type === 'prestamo' ? AppConfig.PRESTAMO_MIN_MONTO : AppConfig.DEPOSITO_MIN_MONTO;
        if (plazoInput) plazoInput.value = type === 'prestamo' ? AppConfig.PRESTAMO_MIN_PLAZO_DIAS : AppConfig.DEPOSITO_MIN_PLAZO_DIAS;

        document.getElementById(`${type}-status-msg`).textContent = "";
        
        // Forzar el recálculo y actualización de slider fill
        const updateFunc = type === 'prestamo' ? AppUI.updatePrestamoCalculadora : AppUI.updateDepositoCalculadora;
        updateFunc(); 
        AppUI.updateSliderFill(montoInput);
        AppUI.updateSliderFill(plazoInput);

        // Resetear estado del botón (deshabilitado por defecto)
        document.getElementById(`${type}-submit-btn`).disabled = true;
    },

    changeAdminTab: function(tabId) {
        document.querySelectorAll('#transaccion-modal .tab-btn').forEach(btn => {
            btn.classList.remove('active-tab', 'border-amber-600', 'text-amber-600');
            btn.classList.add('border-transparent', 'text-slate-700', 'hover:bg-slate-100');
        });

        document.querySelectorAll('#transaccion-modal .tab-content').forEach(content => {
            content.classList.add('hidden');
        });

        document.querySelector(`#transaccion-modal [data-tab="${tabId}"]`).classList.add('active-tab', 'border-amber-600', 'text-amber-600');
        document.querySelector(`#transaccion-modal [data-tab="${tabId}"]`).classList.remove('border-transparent', 'text-slate-700', 'hover:bg-slate-100');
        document.getElementById(`tab-${tabId}`).classList.remove('hidden');
        
        if (tabId === 'transaccion') {
            AppUI.populateGruposTransaccion();
        } else if (tabId === 'bonos_admin') { 
            if (AppState.lastKnownGroupsHash === '') {
                AppUI.populateAdminGroupCheckboxes('bono-admin-grupos-checkboxes-container', 'bonos');
            }
            AppUI.populateBonoAdminList();
            AppUI.clearBonoAdminForm(); 
        } else if (tabId === 'tienda_gestion') { 
            if (AppState.lastKnownGroupsHash === '') {
                AppUI.populateAdminGroupCheckboxes('tienda-admin-grupos-checkboxes-container', 'tienda');
            }
            AppUI.updateTiendaAdminStatusLabel();
            AppUI.clearTiendaAdminForm(); 
        } else if (tabId === 'tienda_inventario') { 
            AppUI.populateTiendaAdminList();
        }
        
        document.getElementById('transaccion-status-msg').textContent = "";
    },

    setupSearchInput: function(inputId, resultsId, stateKey, onSelectCallback) {
        const input = document.getElementById(inputId);
        const results = document.getElementById(resultsId);

        if (!input) return;

        input.addEventListener('input', (e) => {
            const query = e.target.value;
            AppState.currentSearch[stateKey].query = query;
            AppState.currentSearch[stateKey].selected = null; 
            AppState.currentSearch[stateKey].info = null;
            
            if (query === '') {
                onSelectCallback(null);
            }
            
            if (results) {
                 AppUI.handleStudentSearch(query, inputId, resultsId, stateKey, onSelectCallback);
            }
        });
        
        if (results) {
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
        }
    },
    
    handleStudentSearch: function(query, inputId, resultsId, stateKey, onSelectCallback) {
        const resultsContainer = document.getElementById(resultsId);
        
        if (!resultsContainer || query.length < 1) {
            if (resultsContainer) resultsContainer.classList.add('hidden');
            return;
        }

        const lowerQuery = query.toLowerCase();
        let studentList = AppState.datosAdicionales.allStudents;
        
        const ciclaAllowed = ['p2pDestino', 'prestamoAlumno', 'depositoAlumno']; // Permitir Cicla en Destino, Préstamos y Depósitos.
        if (!ciclaAllowed.includes(stateKey) && stateKey !== 'bonoAlumno' && stateKey !== 'tiendaAlumno') {
            studentList = studentList.filter(s => s.grupoNombre !== 'Cicla');
        }
        
        const filteredStudents = studentList
            .filter(s => s.nombre.toLowerCase().includes(lowerQuery))
            .sort((a, b) => a.nombre.localeCompare(b.nombre))
            .slice(0, 10);

        resultsContainer.innerHTML = '';
        if (filteredStudents.length === 0) {
            resultsContainer.innerHTML = `<div class="p-2 text-sm text-slate-500">No se encontraron alumnos.</div>`;
        } else {
            filteredStudents.forEach(student => {
                const div = document.createElement('div');
                div.className = 'p-2 hover:bg-slate-100 cursor-pointer text-sm text-slate-900';
                div.textContent = `${student.nombre} (${student.grupoNombre})`;
                div.onclick = () => {
                    const input = document.getElementById(inputId);
                    input.value = student.nombre;
                    AppState.currentSearch[stateKey].query = student.nombre;
                    AppState.currentSearch[stateKey].selected = student.nombre;
                    AppState.currentSearch[stateKey].info = student;
                    resultsContainer.classList.add('hidden');
                    onSelectCallback(student);
                };
                resultsContainer.appendChild(div);
            });
        }
        resultsContainer.classList.remove('hidden');
    },

    resetSearchInput: function(stateKey) {
        let inputIds = [];
        
        if (stateKey === 'prestamoAlumno' || stateKey === 'depositoAlumno') {
             inputIds.push(`${stateKey.replace('Alumno', '-search-alumno')}`);
        } else if (stateKey.includes('p2p')) {
             inputIds.push(`${stateKey.replace('p2p', 'p2p-search-')}`);
        } else if (stateKey === 'bonoAlumno') {
             inputIds.push('bono-search-alumno-step2');
        } else if (stateKey === 'tiendaAlumno') {
             inputIds.push('tienda-search-alumno-step2');
        } else {
            return;
        }
        
        inputIds.forEach(inputId => {
            const input = document.getElementById(inputId);
            if (input) {
                input.value = "";
                const resultsId = input.dataset.resultsId;
                const results = document.getElementById(resultsId || `${inputId}-results`);
                if (results) results.classList.add('hidden');
            }
        });
        
        AppState.currentSearch[stateKey].query = "";
        AppState.currentSearch[stateKey].selected = null;
        AppState.currentSearch[stateKey].info = null;
        
        if (stateKey === 'tiendaAlumno') {
            AppUI.updateTiendaButtonStates();
        }
    },
    
    selectP2PStudent: function(student) {
        // No action needed other than search state update
    },
    
    selectBonoStudent: function(student) {
        // No action needed other than search state update
    },

    selectTiendaStudent: function(student) {
        AppUI.updateTiendaButtonStates();
    },

    // --- FUNCIONES ADMIN AVANZADAS ---
    
    populateAdminGroupCheckboxes: function(containerId, entityType) {
        const container = document.getElementById(containerId);
        if (!container) return;

        const allGroups = AppState.datosAdicionales.allGroups || [];
        
        if (allGroups.length === 0) {
            container.innerHTML = `<p class="text-xs text-slate-500">No hay grupos cargados.</p>`;
            return;
        }

        const currentSelection = AppUI.getAdminGroupCheckboxSelection(containerId);

        container.innerHTML = '';

        allGroups.forEach(grupoNombre => {
            const safeName = grupoNombre.replace(/\s/g, '-');
            const checkboxId = `${entityType}-group-cb-${safeName}`;
            
            const div = document.createElement('div');
            div.className = "flex items-center space-x-2"; 
            
            const input = document.createElement('input');
            input.type = "checkbox";
            input.id = checkboxId;
            input.value = grupoNombre;
            input.className = "h-4 w-4 text-amber-600 border-slate-300 rounded focus:ring-amber-600 bg-white group-admin-checkbox";
            
            if (currentSelection.includes(grupoNombre)) {
                 input.checked = true;
            }

            const label = document.createElement('label');
            label.htmlFor = checkboxId;
            label.textContent = grupoNombre;
            label.className = "ml-2 block text-sm text-slate-900 cursor-pointer flex-1";

            div.appendChild(input);
            div.appendChild(label);
            container.appendChild(div);
        });
    },
    
    getAdminGroupCheckboxSelection: function(containerId) {
        const container = document.getElementById(containerId);
        if (!container) return [];
        
        return Array.from(container.querySelectorAll('.group-admin-checkbox:checked')).map(cb => cb.value);
    },

    selectAdminGroupCheckboxes: function(containerId, allowedGroupsString) {
        const container = document.getElementById(containerId);
        if (!container) return;

        container.querySelectorAll('.group-admin-checkbox').forEach(cb => {
            cb.checked = false;
        });

        if (!allowedGroupsString) return;

        const allowedGroups = allowedGroupsString.split(',').map(g => g.trim());

        allowedGroups.forEach(groupName => {
            const safeName = groupName.replace(/\s/g, '-');
            const checkboxId = `${containerId.split('-')[0]}-group-cb-${safeName}`;
            const checkbox = document.getElementById(checkboxId);
            if (checkbox) {
                checkbox.checked = true;
            }
        });
    },

    // --- FUNCIONES P2P (Ahora en Modal Combinado) ---
    
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
        
        calculoMsg.innerHTML = `<span class="color-dorado-main">Impuesto (${AppConfig.IMPUESTO_P2P_TASA * 100}%): ${AppFormat.formatNumber(impuesto)} ℙ | Total a debitar: ${AppFormat.formatNumber(total)} ℙ</span>`;
    },

    // --- FUNCIONES DE BONOS (FLUJO DE 2 PASOS) ---
    
    showBonoModal: function() {
        // AJUSTE 1: Eliminamos el chequeo de AppState.datosActuales para no bloquear el modal si está cargando.
        AppUI.showBonoStep1();
        AppUI.showModal('bonos-modal');

        const container = document.getElementById('bonos-lista-disponible');

        if (!AppState.datosActuales) {
            // Mostrar estado de carga si los datos aún no están
            if(container) container.innerHTML = `<p class="text-sm text-slate-500 text-center col-span-3">Cargando bonos...</p>`;
        } else {
            // Si los datos ya existen, proceder con la lógica normal
            AppUI.populateBonoList();
        }
    },

    showBonoStep1: function() {
        document.getElementById('bono-step-form-container').classList.add('hidden');
        document.getElementById('bono-step-list-container').classList.remove('hidden');
        AppState.bonos.selectedBono = null;
        document.getElementById('bono-status-msg').textContent = "";
        document.getElementById('bono-step2-status-msg').textContent = "";
        document.getElementById('bono-clave-p2p-step2').value = "";
        AppUI.resetSearchInput('bonoAlumno');
        AppTransacciones.setLoadingState(document.getElementById('bono-submit-step2-btn'), document.getElementById('bono-btn-text-step2'), false, 'Confirmar Canje');
    },

    showBonoStep2: function(bonoClave) {
        const bono = AppState.bonos.disponibles.find(b => b.clave === bonoClave);
        if (!bono) return;

        AppState.bonos.selectedBono = bonoClave;
        document.getElementById('bono-step-list-container').classList.add('hidden');
        document.getElementById('bono-step-form-container').classList.remove('hidden');

        document.getElementById('bono-item-name-display').textContent = bono.nombre;
        document.getElementById('bono-item-reward-display').textContent = `Recompensa: ${AppFormat.formatNumber(bono.recompensa)} ℙ`;
        document.getElementById('bono-clave-input-step2').value = bonoClave;
        document.getElementById('bono-step2-status-msg').textContent = "";
        
        document.getElementById('bono-search-alumno-step2').value = AppState.currentSearch.bonoAlumno.info?.nombre || '';
        
        document.getElementById('bono-clave-p2p-step2').focus();
    },

    populateBonoList: function() {
        if (document.getElementById('bonos-modal').classList.contains('opacity-0')) return;
        
        const container = document.getElementById('bonos-lista-disponible');
        const bonos = AppState.bonos.disponibles;
        
        const student = AppState.currentSearch.bonoAlumno.info || { grupoNombre: null };
        const studentGroup = student.grupoNombre;
        const now = Date.now();

        const bonosActivos = bonos.filter(bono => {
            if (bono.usos_actuales >= bono.usos_totales) return false;
            if (bono.expiracion_fecha && new Date(bono.expiracion_fecha).getTime() < now) return false;

            const allowedGroups = (bono.grupos_permitidos || '').split(',').map(g => g.trim()).filter(g => g.length > 0);
            const hasRestrictions = allowedGroups.length > 0;
            
            if (hasRestrictions && studentGroup) {
                if (!allowedGroups.includes(studentGroup)) {
                    return false;
                }
            }
            return true;
        });


        if (bonosActivos.length === 0) {
            // AJUSTE 2: Usar col-span-3 para centrar correctamente el mensaje
            container.innerHTML = `<p class="text-sm text-slate-500 text-center col-span-3">No hay bonos disponibles en este momento.</p>`;
            return;
        }
        
        container.innerHTML = bonosActivos.map(bono => {
            const recompensa = AppFormat.formatNumber(bono.recompensa);
            const usosRestantes = bono.usos_totales - bono.usos_actuales;
            
            const isCanjeado = AppState.bonos.canjeados.includes(bono.clave);
            const cardClass = isCanjeado ? 'bg-slate-50 shadow-inner border-slate-200 opacity-60' : 'bg-white shadow-md border-slate-200';
            
            const badge = isCanjeado ? 
                `<span class="text-xs font-bold bg-slate-200 text-slate-700 rounded-full px-2 py-0.5">CANJEADO</span>` :
                `<span class="text-xs font-bold bg-amber-100 text-amber-700 rounded-full px-2 py-0.5">DISPONIBLE</span>`;

            const claveEscapada = escapeHTML(bono.clave);

            return `
                <div class="rounded-lg shadow-sm p-4 border transition-all ${cardClass}">
                    <div class="flex justify-between items-center mb-2">
                        <span class="text-sm font-medium text-slate-500 truncate">${bono.clave}</span>
                        ${badge}
                    </div>
                    <p class="text-base font-semibold text-slate-900 truncate">${bono.nombre}</p>
                    <div class="flex justify-between items-baseline mt-3">
                        <span class="text-xs text-slate-500">Quedan ${usosRestantes}</span>
                        <div class="flex items-center space-x-3">
                            <span class="text-xl font-bold color-dorado-main">${recompensa} ℙ</span>
                            <button id="bono-btn-${bono.clave}" 
                                    data-bono-clave="${bono.clave}"
                                    onclick="AppTransacciones.iniciarCanje('${claveEscapada}')" 
                                    class="bono-buy-btn px-3 py-1 text-xs font-medium rounded-lg bg-white border border-amber-600 text-amber-600 hover:bg-amber-50 shadow-sm">Canjear</button>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    },
    
    populateBonoAdminList: function() {
        const tbody = document.getElementById('bonos-admin-lista');
        const bonos = AppState.bonos.disponibles;

        if (bonos.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" class="p-4 text-center text-slate-500">No hay bonos configurados.</td></tr>`;
            return;
        }

        let html = '';
        const bonosOrdenados = [...bonos].sort((a, b) => a.clave.localeCompare(b.clave));

        bonosOrdenados.forEach(bono => {
            const recompensa = AppFormat.formatNumber(bono.recompensa);
            const usos = `${bono.usos_actuales} / ${bono.usos_totales}`;
            const isAgotado = bono.usos_actuales >= bono.usos_totales;
            const rowClass = isAgotado ? 'opacity-60 bg-slate-50' : 'hover:bg-slate-100';
            
            const claveEscapada = escapeHTML(bono.clave);

            html += `
                <tr class="${rowClass}">
                    <td class="px-4 py-2 text-sm font-semibold text-slate-800">${bono.clave}</td>
                    <td class="px-4 py-2 text-sm text-slate-700">${bono.nombre}</td>
                    <td class="px-4 py-2 text-sm text-slate-800 text-right">${recompensa} ℙ</td>
                    <td class="px-4 py-2 text-sm text-slate-700 text-right">${usos}</td>
                    <td class="px-4 py-2 text-right text-sm">
                        <button onclick="AppUI.handleEditBono('${claveEscapada}')" class="font-medium text-amber-600 hover:text-amber-800 edit-bono-btn">Editar</button>
                        <button onclick="AppTransacciones.eliminarBono('${claveEscapada}')" class="ml-2 font-medium text-slate-600 hover:text-slate-800 delete-bono-btn">Eliminar</button>
                    </td>
                </tr>
            `;
        });
        tbody.innerHTML = html;
    },
    
    handleEditBono: function(clave) {
        const bono = AppState.bonos.disponibles.find(b => b.clave === clave);
        if (!bono) return;
        
        document.getElementById('bono-admin-clave-input').value = bono.clave;
        document.getElementById('bono-admin-nombre-input').value = bono.nombre;
        document.getElementById('bono-admin-recompensa-input').value = bono.recompensa;
        document.getElementById('bono-admin-usos-input').value = bono.usos_totales;
        
        const expiracionInput = document.getElementById('bono-admin-expiracion-input');
        if (bono.expiracion_fecha) {
            const expiryTime = new Date(bono.expiracion_fecha).getTime();
            const now = Date.now();
            const hoursRemaining = Math.ceil((expiryTime - now) / (1000 * 60 * 60));
            expiracionInput.value = hoursRemaining > 1 ? hoursRemaining : 24; 
        } else {
            expiracionInput.value = '';
        }
        
        AppUI.selectAdminGroupCheckboxes('bono-admin-grupos-checkboxes-container', bono.grupos_permitidos);
        
        document.getElementById('bono-admin-clave-input').disabled = true;
        document.getElementById('bono-admin-clave-input').classList.add('disabled:bg-slate-100', 'disabled:opacity-70');
        document.getElementById('bono-admin-submit-btn').textContent = 'Guardar Cambios';

        document.getElementById('bono-admin-form-container').scrollIntoView({ behavior: 'smooth' });
    },
    
    clearBonoAdminForm: function() {
        document.getElementById('bono-admin-form').reset();
        document.getElementById('bono-admin-clave-input').disabled = false;
        document.getElementById('bono-admin-submit-btn').textContent = 'Crear / Actualizar Bono';
        document.getElementById('bono-admin-status-msg').textContent = "";
        
        document.getElementById('bono-admin-clave-input').classList.remove('disabled:bg-slate-100', 'disabled:opacity-70');
        AppUI.selectAdminGroupCheckboxes('bono-admin-grupos-checkboxes-container', '');
    },
    
    // --- FUNCIONES DE TIENDA ---

    // CORRECCIÓN 1.1: Se elimina la restricción inicial para abrir el modal (Fix Botón Tienda)
    showTiendaModal: function() {
        AppUI.showModal('tienda-modal'); // Abrir modal siempre
        AppUI.showTiendaStep1();
        
        const container = document.getElementById('tienda-items-container');
        
        if (!AppState.datosActuales) {
            // Mostrar estado de carga si los datos aún no están
            if(container) container.innerHTML = `<p class="text-sm text-slate-500 text-center col-span-3">Cargando artículos...</p>`;
        } else {
            // Si los datos ya existen, proceder con la lógica normal
            AppUI.renderTiendaItems();
        }
        
        AppUI.updateTiendaAdminStatusLabel();
    },

    showTiendaStep1: function() {
        document.getElementById('tienda-step-form-container').classList.add('hidden');
        document.getElementById('tienda-step-list-container').classList.remove('hidden');
        AppState.tienda.selectedItem = null;
        document.getElementById('tienda-status-msg').textContent = "";
        document.getElementById('tienda-step2-status-msg').textContent = "";
        document.getElementById('tienda-clave-p2p-step2').value = "";
        document.getElementById('tienda-search-alumno-step2').value = AppState.currentSearch.tiendaAlumno.info?.nombre || '';
        AppTransacciones.setLoadingState(document.getElementById('tienda-submit-step2-btn'), document.getElementById('tienda-btn-text-step2'), false, 'Confirmar Compra');
        
        AppUI.updateTiendaButtonStates();
    },

    showTiendaStep2: function(itemId) {
        const item = AppState.tienda.items[itemId];
        if (!item) return;

        AppState.tienda.selectedItem = itemId;
        document.getElementById('tienda-step-list-container').classList.add('hidden');
        document.getElementById('tienda-step-form-container').classList.remove('hidden');

        const costoFinal = Math.round(item.precio * (1 + AppConfig.TASA_ITBIS));
        const costoItbis = costoFinal - item.precio;

        document.getElementById('tienda-item-name-display').textContent = item.nombre;
        document.getElementById('tienda-item-price-display').textContent = `Precio Base: ${AppFormat.formatNumber(item.precio)} ℙ`;
        document.getElementById('tienda-item-cost-display').innerHTML = `
            Costo Final (incl. ${AppConfig.TASA_ITBIS * 100}% ITBIS): 
            <span class="font-bold text-slate-800">${AppFormat.formatNumber(costoFinal)} ℙ</span>
            <span class="text-xs text-slate-500 block">(ITBIS: ${AppFormat.formatNumber(costoItbis)} ℙ)</span>
        `;
        document.getElementById('tienda-step2-status-msg').textContent = "";
        
        document.getElementById('tienda-search-alumno-step2').value = AppState.currentSearch.tiendaAlumno.info?.nombre || '';

        document.getElementById('tienda-clave-p2p-step2').focus();
    },

    renderTiendaItems: function() {
        if (document.getElementById('tienda-modal').classList.contains('opacity-0')) return;

        // Seguridad: Si aún no hay datos, muestra carga.
        if (!AppState.datosActuales) {
             const container = document.getElementById('tienda-items-container');
             // Ya usa col-span-3 y text-center
             if(container) container.innerHTML = `<p class="text-sm text-slate-500 text-center col-span-3">Cargando artículos...</p>`;
             return;
        }

        const container = document.getElementById('tienda-items-container');
        const items = AppState.tienda.items;
        
        const student = AppState.currentSearch.tiendaAlumno.info || { grupoNombre: null };
        const studentGroup = student.grupoNombre;
        const now = Date.now();

        const itemKeys = Object.keys(items);
        
        const itemsActivos = itemKeys.filter(itemId => {
            const item = items[itemId];
            if (item.stock <= 0 && item.ItemID !== 'filantropo') return false;
            if (item.ExpiracionFecha && new Date(item.ExpiracionFecha).getTime() < now) return false;

            const allowedGroups = (item.GruposPermitidos || '').split(',').map(g => g.trim()).filter(g => g.length > 0);
            const hasRestrictions = allowedGroups.length > 0;
            
            if (hasRestrictions && studentGroup) {
                if (!allowedGroups.includes(studentGroup)) {
                    return false;
                }
            }
            return true;
        });


        if (itemsActivos.length === 0) {
            // Ya usa col-span-3 y text-center
            container.innerHTML = `<p class="text-sm text-slate-500 text-center col-span-3">No hay artículos disponibles para ti en este momento.</p>`;
            return;
        }

        let html = '';
        itemsActivos.sort((a,b) => items[a].precio - items[b].precio).forEach(itemId => {
            const item = items[itemId];
            const costoFinal = Math.round(item.precio * (1 + AppConfig.TASA_ITBIS));
            
            const itemIdEscapado = escapeHTML(item.ItemID);

            const cardClass = 'bg-white shadow-md border-slate-200';
            const stockText = item.stock === 9999 ? 'Ilimitado' : `Stock: ${item.stock}`;

            html += `
                <div class="rounded-lg shadow-sm p-4 border transition-all ${cardClass}">
                    <div class="flex justify-between items-center mb-2">
                        <span class="text-xs font-medium text-slate-500 truncate">${item.Tipo} | ${stockText}</span>
                        <span class="text-xs font-bold bg-amber-100 text-amber-700 rounded-full px-2 py-0.5">DISPONIBLE</span>
                    </div>
                    <p class="text-base font-semibold text-slate-900 truncate">
                        <span class="tooltip-container">
                            ${item.nombre}
                            <div class="tooltip-text hidden md:block w-48">${item.descripcion}</div>
                        </span>
                    </p>
                    <div class="flex justify-between items-baseline mt-3">
                        <span class="text-xs text-slate-500">Base: ${AppFormat.formatNumber(item.precio)} ℙ (+ITBIS)</span>
                        
                        <div class="flex items-center space-x-3">
                            <span class="text-xl font-bold color-dorado-main">${AppFormat.formatNumber(costoFinal)} ℙ</span>
                            
                            <button id="buy-btn-${itemId}" 
                                    data-item-id="${itemId}"
                                    onclick="AppTransacciones.iniciarCompra('${itemIdEscapado}')"
                                    class="tienda-buy-btn px-3 py-1 text-xs font-medium rounded-lg transition-colors shadow-sm">
                                <span class="btn-text">Comprar</span>
                            </button>
                        </div>
                    </div>
                </div>
            `;
        });
        
        container.innerHTML = html;
        AppUI.updateTiendaButtonStates();
    },

    updateTiendaAdminStatusLabel: function() {
        const label = document.getElementById('tienda-admin-status-label');
        const container = label ? label.closest('div') : null;
        if (!label || !container) return;
        
        const status = AppState.tienda.storeManualStatus;
        
        label.classList.remove('text-amber-600', 'text-green-600', 'text-red-600', 'text-slate-600', 'text-slate-800');
        container.classList.remove('bg-amber-100', 'bg-slate-200');
        
        container.classList.add('bg-slate-50');

        if (status === 'auto') {
            label.textContent = "Automático (por Temporizador)";
            label.classList.add('text-amber-600');
        } else if (status === 'open') {
            label.textContent = "Forzado Abierto";
            label.classList.add('text-slate-800');
            container.classList.add('bg-amber-100');
        } else if (status === 'closed') {
            label.textContent = "Forzado Cerrado";
            label.classList.add('text-slate-800');
            container.classList.add('bg-slate-200');
        } else {
            label.textContent = "Desconocido";
            label.classList.add('text-slate-600');
        }
    },

    handleDeleteConfirmation: function(itemId) {
        const row = document.getElementById(`tienda-item-row-${itemId}`);
        if (!row) return;

        const actionCell = row.cells[4];
        
        const itemIdEscapado = escapeHTML(itemId);

        actionCell.innerHTML = `
            <button onclick="AppTransacciones.eliminarItem('${itemIdEscapado}')" class="font-medium text-amber-600 hover:text-amber-800 confirm-delete-btn">Confirmar</button>
            <button onclick="AppUI.cancelDeleteConfirmation('${itemIdEscapado}')" class="ml-2 font-medium text-slate-600 hover:text-slate-800">Cancelar</button>
        `;
    },

    cancelDeleteConfirmation: function(itemId) {
        const item = AppState.tienda.items[itemId];
        if (!item) return;

        const row = document.getElementById(`tienda-item-row-${itemId}`);
        if (!row) return;

        const actionCell = row.cells[4];
        
        const itemIdEscapado = escapeHTML(item.ItemID); 

        actionCell.innerHTML = `
            <button onclick="AppUI.handleEditItem('${itemIdEscapado}')" class="font-medium text-amber-600 hover:text-amber-800 edit-item-btn">Editar</button>
            <button onclick="AppUI.handleDeleteConfirmation('${itemIdEscapado}')" class="ml-2 font-medium text-slate-600 hover:text-slate-800 delete-item-btn">Eliminar</button>
        `;
    },

    populateTiendaAdminList: function() {
        const tbody = document.getElementById('tienda-admin-lista');
        const items = AppState.tienda.items;
        const itemKeys = Object.keys(items);

        if (itemKeys.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" class="p-4 text-center text-slate-500">No hay artículos configurados.</td></tr>`;
            return;
        }

        let html = '';
        const itemsOrdenados = itemKeys.sort((a,b) => a.localeCompare(b));

        itemsOrdenados.forEach(itemId => {
            const item = items[itemId];
            const precio = AppFormat.formatNumber(item.precio);
            const stock = item.stock;
            const rowClass = (stock <= 0 && item.ItemID !== 'filantropo') ? 'opacity-60 bg-slate-50' : 'hover:bg-slate-100';
            
            const itemIdEscapado = escapeHTML(item.ItemID);

            html += `
                <tr id="tienda-item-row-${itemIdEscapado}" class="${rowClass}">
                    <td class="px-4 py-2 text-sm font-semibold text-slate-800">${item.ItemID}</td>
                    <td class="px-4 py-2 text-sm text-slate-700 truncate" title="${item.nombre}">${item.nombre}</td>
                    <td class="px-4 py-2 text-sm text-slate-800 text-right">${precio} ℙ</td>
                    <td class="px-4 py-2 text-sm text-slate-700 text-right">${stock}</td>
                    <td class="px-4 py-2 text-right text-sm">
                        <button onclick="AppUI.handleEditItem('${itemIdEscapado}')" class="font-medium text-amber-600 hover:text-amber-800 edit-item-btn">Editar</button>
                        <button onclick="AppUI.handleDeleteConfirmation('${itemIdEscapado}')" class="ml-2 font-medium text-slate-600 hover:text-slate-800 delete-item-btn">Eliminar</button>
                    </td>
                </tr>
            `;
        });
        tbody.innerHTML = html;
    },
    
    handleEditItem: function(itemId) {
        const item = AppState.tienda.items[itemId];
        if (!item) return;

        document.getElementById('tienda-admin-itemid-input').value = item.ItemID;
        document.getElementById('tienda-admin-nombre-input').value = item.nombre;
        document.getElementById('tienda-admin-desc-input').value = item.descripcion;
        document.getElementById('tienda-admin-tipo-input').value = item.tipo;
        document.getElementById('tienda-admin-precio-input').value = item.precio;
        document.getElementById('tienda-admin-stock-input').value = item.stock;
        
        const expiracionInput = document.getElementById('tienda-admin-expiracion-input');
        if (item.ExpiracionFecha) {
            const expiryTime = new Date(item.ExpiracionFecha).getTime();
            const now = Date.now();
            const hoursRemaining = Math.ceil((expiryTime - now) / (1000 * 60 * 60));
            expiracionInput.value = hoursRemaining > 1 ? hoursRemaining : 48; 
        } else {
            expiracionInput.value = '';
        }
        
        AppUI.selectAdminGroupCheckboxes('tienda-admin-grupos-checkboxes-container', item.GruposPermitidos);

        document.getElementById('tienda-admin-itemid-input').disabled = true;
        document.getElementById('tienda-admin-submit-btn').textContent = 'Guardar Cambios';
        
        document.getElementById('tienda-admin-itemid-input').classList.add('disabled:bg-slate-100', 'disabled:opacity-70');

        document.getElementById('tienda-admin-form-container').scrollIntoView({ behavior: 'smooth' });
    },
    
    clearTiendaAdminForm: function() {
        document.getElementById('tienda-admin-form').reset();
        document.getElementById('tienda-admin-itemid-input').disabled = false;
        document.getElementById('tienda-admin-submit-btn').textContent = 'Crear / Actualizar';
        document.getElementById('tienda-admin-status-msg').textContent = "";
        
        document.getElementById('tienda-admin-itemid-input').classList.remove('disabled:bg-slate-100', 'disabled:opacity-70');
        AppUI.selectAdminGroupCheckboxes('tienda-admin-grupos-checkboxes-container', '');
    },
    
    // --- FIN FUNCIONES DE TIENDA ---
    
    updateAdminDepositoCalculo: function() {
        const cantidadInput = document.getElementById('transaccion-cantidad-input');
        const calculoMsg = document.getElementById('transaccion-calculo-impuesto');
        const cantidad = parseInt(cantidadInput.value, 10);

        if (isNaN(cantidad) || cantidad <= 0) {
            calculoMsg.textContent = "";
            return;
        }

        const comision = Math.round(cantidad * AppConfig.IMPUESTO_DEPOSITO_ADMIN);
        const costoNeto = cantidad - comision;

        calculoMsg.innerHTML = `<span class="color-dorado-main">Monto a depositar: ${AppFormat.formatNumber(cantidad)} ℙ | Costo Neto Tesorería: ${AppFormat.formatNumber(costoNeto)} ℙ (Comisión: ${AppFormat.formatNumber(comision)} ℙ)</span>`;
    },

    showTransaccionModal: function(tab) {
        if (!AppState.datosActuales) {
            return;
        }
        
        AppUI.changeAdminTab(tab); 
        
        AppUI.showModal('transaccion-modal');
    },

    populateGruposTransaccion: function() {
        const grupoContainer = document.getElementById('transaccion-lista-grupos-container');
        grupoContainer.innerHTML = ''; 

        AppState.datosActuales.forEach(grupo => {
            // SOLUCIÓN 3.2: Permitir que "Cicla" aparezca en el panel de Admin, siempre y cuando no sea un grupo vacío (a menos que sea Cicla).
            // (Se deja el grupo.nombre !== 'Banco' fuera de este filtro, ya que 'Banco' nunca tiene usuarios).
            if (grupo.total === 0 && grupo.nombre !== 'Cicla') return;

            const div = document.createElement('div');
            div.className = "flex items-center p-1 rounded hover:bg-slate-200";
            
            const input = document.createElement('input');
            input.type = "checkbox";
            input.id = `group-cb-${grupo.nombre}`;
            input.value = grupo.nombre;
            input.className = "h-4 w-4 text-amber-600 border-slate-300 rounded focus:ring-amber-600 bg-white group-checkbox";
            input.addEventListener('change', AppUI.populateUsuariosTransaccion);

            const label = document.createElement('label');
            label.htmlFor = input.id;
            label.textContent = `${grupo.nombre} (${AppFormat.formatNumber(grupo.total)} ℙ)`;
            label.className = "ml-2 block text-sm text-slate-900 cursor-pointer flex-1";

            div.appendChild(input);
            div.appendChild(label);
            grupoContainer.appendChild(div);
        });

        document.getElementById('transaccion-lista-usuarios-container').innerHTML = '<span class="text-sm text-slate-500 p-2">Seleccione un grupo...</span>';
        AppState.transaccionSelectAll = {}; 
        
        document.getElementById('tesoreria-saldo-transaccion').textContent = `(Fondos disponibles: ${AppFormat.formatNumber(AppState.datosAdicionales.saldoTesoreria)} ℙ)`;
    },

    populateUsuariosTransaccion: function() {
        const checkedGroups = document.querySelectorAll('#transaccion-lista-grupos-container input[type="checkbox"]:checked');
        const selectedGroupNames = Array.from(checkedGroups).map(cb => cb.value);
        
        const listaContainer = document.getElementById('transaccion-lista-usuarios-container');
        listaContainer.innerHTML = ''; 

        if (selectedGroupNames.length === 0) {
            listaContainer.innerHTML = '<span class="text-sm text-slate-500 p-2">Seleccione un grupo...</span>';
            return;
        }

        selectedGroupNames.forEach(grupoNombre => {
            const grupo = AppState.datosActuales.find(g => g.nombre === grupoNombre);

            if (grupo && grupo.usuarios && grupo.usuarios.length > 0) {
                const headerDiv = document.createElement('div');
                headerDiv.className = "flex justify-between items-center bg-slate-200 p-2 mt-2 sticky top-0 border-b border-slate-300"; 
                headerDiv.innerHTML = `<span class="text-sm font-semibold text-slate-700">${grupo.nombre}</span>`;
                
                const btnSelectAll = document.createElement('button');
                btnSelectAll.textContent = "Todos";
                btnSelectAll.dataset.grupo = grupo.nombre; 
                btnSelectAll.className = "text-xs font-medium text-amber-600 hover:text-amber-800 select-all-users-btn";
                AppState.transaccionSelectAll[grupo.nombre] = false; 
                btnSelectAll.addEventListener('click', AppUI.toggleSelectAllUsuarios);
                
                headerDiv.appendChild(btnSelectAll);
                listaContainer.appendChild(headerDiv);

                const usuariosOrdenados = [...grupo.usuarios].sort((a, b) => a.nombre.localeCompare(b.nombre));

                usuariosOrdenados.forEach(usuario => {
                    const div = document.createElement('div');
                    div.className = "flex items-center p-1 rounded hover:bg-slate-200 ml-2"; 
                    
                    const input = document.createElement('input');
                    input.type = "checkbox";
                    input.id = `user-cb-${grupo.nombre}-${usuario.nombre.replace(/\s/g, '-')}`; 
                    input.value = usuario.nombre;
                    input.dataset.grupo = grupo.nombre; 
                    input.className = "h-4 w-4 text-amber-600 border-slate-300 rounded focus:ring-amber-600 bg-white user-checkbox";
                    input.dataset.checkboxGrupo = grupo.nombre; 

                    const label = document.createElement('label');
                    label.htmlFor = input.id;
                    label.textContent = usuario.nombre;
                    label.className = "ml-2 block text-sm text-slate-900 cursor-pointer flex-1";

                    div.appendChild(input);
                    div.appendChild(label);
                    listaContainer.appendChild(div);
                });
            }
        });
        
        if (listaContainer.innerHTML === '') {
             listaContainer.innerHTML = '<span class="text-sm text-slate-500 p-2">Los grupos seleccionados no tienen usuarios.</span>';
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

    // --- Utilidades UI ---
    
    setConnectionStatus: function(status, title) {
        const dot = document.getElementById('status-dot');
        const indicator = document.getElementById('status-indicator');
        if (!dot) return;
        
        indicator.title = title;

        dot.classList.remove('bg-green-600', 'bg-amber-600', 'bg-red-600', 'animate-pulse-dot', 'bg-slate-300');

        switch (status) {
            case 'ok':
            case 'loading':
                dot.classList.add('bg-amber-600', 'animate-pulse-dot');
                break;
            case 'error':
                dot.classList.add('bg-red-600'); 
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
        
        AppState.isSidebarOpen = !AppState.isSidebarOpen; 

        if (AppState.isSidebarOpen) {
            sidebar.classList.remove('-translate-x-full');
        } else {
            sidebar.classList.add('-translate-x-full');
        }
        
        AppUI.resetSidebarTimer();
    },


    resetSidebarTimer: function() {
        if (AppState.sidebarTimer) {
            clearTimeout(AppState.sidebarTimer);
        }
        
        if (AppState.isSidebarOpen) {
            AppState.sidebarTimer = setTimeout(() => {
                if (AppState.isSidebarOpen) {
                    AppUI.toggleSidebar();
                }
            }, 10000);
        }
    },

    actualizarSidebar: function(grupos) {
        const nav = document.getElementById('sidebar-nav');
        nav.innerHTML = ''; 
        
        const homeLink = document.createElement('button');
        homeLink.dataset.groupName = "home"; 
        homeLink.className = "flex items-center justify-center w-full px-3 py-2 border border-amber-600 text-amber-600 text-sm font-medium rounded-lg hover:bg-amber-50 transition-colors shadow-sm mb-1 nav-link";
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
            const link = document.createElement('button');
            link.dataset.groupName = grupo.nombre;
            link.className = "flex items-center justify-center w-full px-3 py-2 border border-amber-600 text-amber-600 text-sm font-medium rounded-lg hover:bg-amber-50 transition-colors shadow-sm mb-1 nav-link";
            
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

            link.classList.remove('bg-amber-50', 'text-amber-700', 'font-semibold', 'bg-white', 'text-amber-600', 'border-amber-600', 'hover:bg-amber-50', 'shadow-sm');

            if (isActive) {
                link.classList.add('bg-amber-50', 'text-amber-700', 'font-semibold', 'border-amber-600');
            } else {
                link.classList.add('bg-white', 'border', 'border-amber-600', 'text-amber-600', 'hover:bg-amber-50', 'shadow-sm');
            }
        });
    },
    
    // --- Lógica del Carrusel Hero ---
    
    // AJUSTE 4.2: Lógica de navegación ajustada para 6 slides y sin dots
    goToHeroSlide: function(index) {
        // Validación de límites del carrusel (Ahora 0 a 5)
        if (index < 0 || index >= AppState.heroSlideCount) {
             // Si intenta ir más allá, regresa al inicio o permanece en el límite
             index = Math.max(0, Math.min(index, AppState.heroSlideCount - 1));
             if (index === 0) return; // Si ya estaba en 0 y intenta ir a -1
        }
        
        AppState.heroSlideIndex = index;
        const track = document.getElementById('hero-carousel');
        const offset = -index * 100;
        
        if (track) {
            track.style.transform = `translateX(${offset}%)`;
        }
    },
    
    // Se elimina populateReglasContent() ya que el contenido se mueve al HTML (index.html)
    
    // --- Fin Lógica del Carrusel Hero ---

    mostrarPantallaNeutral: function(grupos) {
        document.getElementById('main-header-title').textContent = "Bienvenido al Banco del Pincel Dorado";
        
        // CORRECCIÓN 2: Ocultar el subtítulo que genera el espacio vacío en el Home
        document.getElementById('page-subtitle').innerHTML = ''; 
        document.getElementById('page-subtitle').classList.add('hidden');

        document.getElementById('table-container').innerHTML = '';
        document.getElementById('table-container').classList.add('hidden');

        // 1. MOSTRAR RESUMEN COMPACTO
        const homeStatsContainer = document.getElementById('home-stats-container');
        const bovedaContainer = document.getElementById('boveda-card-container');
        const tesoreriaContainer = document.getElementById('tesoreria-card-container');
        const top3Grid = document.getElementById('top-3-grid');
        
        let bovedaHtml = '';
        let tesoreriaHtml = ''; 
        let top3Html = '';

        const allStudents = AppState.datosAdicionales.allStudents;
        
        const totalGeneral = allStudents
            .filter(s => s.pinceles > 0)
            .reduce((sum, user) => sum + user.pinceles, 0);
        
        const tesoreriaSaldo = AppState.datosAdicionales.saldoTesoreria;
        
        bovedaHtml = `
            <div class="bg-gradient-to-r from-amber-500 to-amber-600 rounded-xl shadow-xl p-4 h-full flex flex-col justify-between text-white">
                <div>
                    <div class="flex items-center justify-between">
                        <span class="text-sm font-medium opacity-80 truncate">Total en Cuentas</span>
                        <span class="text-xs font-bold bg-white/20 text-white rounded-full px-2 py-0.5 w-20 text-center flex-shrink-0">BÓVEDA</span>
                    </div>
                    <div class="flex justify-between items-baseline mt-3">
                        <p class="text-lg font-semibold truncate">Pinceles Totales</p>
                        <p class="text-3xl font-bold">${AppFormat.formatNumber(totalGeneral)} ℙ</p>
                    </div>
                </div>
            </div>
        `;
        
        tesoreriaHtml = `
            <div class="bg-gradient-to-l from-amber-500 to-amber-600 rounded-xl shadow-xl p-4 h-full flex flex-col justify-between text-white">
                <div>
                    <div class="flex items-center justify-between">
                        <span class="text-sm font-medium opacity-80 truncate">Capital Operativo</span>
                        <span class="text-xs font-bold bg-white/20 text-white rounded-full px-2 py-0.5 w-20 text-center flex-shrink-0">TESORERÍA</span>
                    </div>
                    <div class="flex justify-between items-baseline mt-3">
                        <p class="text-lg font-semibold truncate">Fondo del Banco</p>
                        <p class="text-3xl font-bold">${AppFormat.formatNumber(tesoreriaSaldo)} ℙ</p>
                    </div>
                </div>
            </div>
        `;
        
        const depositosActivos = AppState.datosAdicionales.depositosActivos;
        
        const studentsWithCapital = allStudents.map(student => {
            const totalInvertidoDepositos = depositosActivos
                .filter(deposito => (deposito.alumno || '').trim() === (student.nombre || '').trim())
                .reduce((sum, deposito) => {
                    const montoNumerico = Number(deposito.monto) || 0;
                    return sum + montoNumerico;
                }, 0);
            
            const capitalTotal = student.pinceles + totalInvertidoDepositos;

            return {
                ...student, 
                totalInvertidoDepositos: totalInvertidoDepositos,
                capitalTotal: capitalTotal
            };
        });

        const topN = studentsWithCapital.sort((a, b) => b.capitalTotal - a.capitalTotal).slice(0, 3);

        if (topN.length > 0) {
            top3Html = topN.map((student, index) => {
                let cardClass = 'bg-white border border-slate-200 rounded-xl shadow-lg shadow-dorado-soft/10'; 
                let rankText = 'color-dorado-main';
                
                const grupoNombre = student.grupoNombre || 'N/A';
                
                const pincelesLiquidosF = AppFormat.formatNumber(student.pinceles);
                const totalInvertidoF = AppFormat.formatNumber(student.totalInvertidoDepositos);

                return `
                    <div class="${cardClass} p-3 h-full flex flex-col justify-between transition-all hover:shadow-xl">
                        <div>
                            <div class="flex items-center justify-between mb-1">
                                <span class="text-sm font-medium text-slate-500 truncate">${grupoNombre}</span>
                                <span class="text-lg font-extrabold ${rankText}">${index + 1}º</span>
                            </div>
                            <p class="text-base font-semibold text-slate-900 truncate">${student.nombre}</p>
                        </div>
                        
                        <div class="text-right mt-2">
                            <div class="tooltip-container relative inline-block">
                                <p class="text-xl font-bold ${rankText}">
                                    ${AppFormat.formatNumber(student.capitalTotal)} ℙ
                                </p>
                                <div class="tooltip-text hidden md:block w-48">
                                    <span class="font-bold">Capital Total</span>
                                    <div class="flex justify-between mt-1 text-xs"><span>Capital Líquido:</span> <span>${pincelesLiquidosF} ℙ</span></div>
                                    <div class="flex justify-between text-xs"><span>Capital Invertido:</span> <span>${totalInvertidoF} ℙ</span></div>
                                    <svg class="absolute text-gray-800 h-2 w-full left-0 bottom-full" x="0px" y="0px" viewBox="0 0 255 255" xml:space="preserve"><polygon class="fill-current" points="0,255 127.5,127.5 255,255"/></svg>
                                </div>
                            </div>
                        </div>
                    </div>
                `;
            }).join('');
        }
        
        for (let i = topN.length; i < 3; i++) {
            top3Html += `
                <div class="bg-white rounded-xl shadow-lg shadow-dorado-soft/10 p-3 opacity-50 h-full flex flex-col justify-between border border-slate-200">
                    <div>
                        <div class="flex items-center justify-between mb-1">
                            <span class="text-sm font-medium text-slate-400">-</span>
                            <span class="text-lg font-extrabold text-slate-400">${i + 1}º</span>
                        </div>
                        <p class="text-base font-semibold text-slate-400 truncate">-</p>
                    </div>
                    <div class="text-right mt-2">
                         <p class="text-xl font-bold text-slate-400">- ℙ</p>
                    </div>
                </div>
            `;
        }
        
        bovedaContainer.innerHTML = bovedaHtml;
        tesoreriaContainer.innerHTML = tesoreriaHtml;
        top3Grid.innerHTML = top3Html;
        
        homeStatsContainer.classList.remove('hidden');
        
        // 2. MOSTRAR MÓDULOS (AHORA SOLO EL HERO SECTION)
        document.getElementById('home-modules-grid').classList.remove('hidden');
        
    },

    mostrarDatosGrupo: function(grupo) {
        // CORRECCIÓN 2: Mostrar el subtítulo cuando se ven los datos de un grupo
        document.getElementById('page-subtitle').classList.remove('hidden');

        document.getElementById('main-header-title').textContent = grupo.nombre;
        
        let totalColor = "text-amber-700"; 
        
        document.getElementById('page-subtitle').innerHTML = `
            <h2 class="text-xl font-semibold text-slate-900">Total del Grupo: 
                <span class="${totalColor}">${AppFormat.formatNumber(grupo.total)} ℙ</span>
            </h2>
        `;
        
        const listContainer = document.getElementById('table-container');
        listContainer.classList.remove('overflow-hidden', 'p-4', 'space-y-0'); 

        const usuariosOrdenados = [...grupo.usuarios].sort((a, b) => b.pinceles - a.pinceles);

        const listBody = document.createElement('div');
        listBody.className = "divide-y divide-amber-100"; 

        usuariosOrdenados.forEach((usuario, index) => {
            const pos = index + 1;
            
            const rankTextClass = 'color-dorado-main';
            const pincelesColor = 'color-dorado-main';

            const grupoNombreEscapado = escapeHTML(grupo.nombre);
            const usuarioNombreEscapado = escapeHTML(usuario.nombre);

            const itemDiv = document.createElement('div');
            itemDiv.className = `grid grid-cols-12 px-6 py-3 hover:bg-slate-100 cursor-pointer transition-colors`;

            itemDiv.setAttribute('onclick', `AppUI.showStudentModal('${grupoNombreEscapado}', '${usuarioNombreEscapado}', ${pos})`);

            itemDiv.innerHTML = `
                <div class="col-span-1 text-center font-extrabold ${rankTextClass} text-lg">
                    ${pos}
                </div>
                <div class="col-span-8 text-left text-sm font-medium text-slate-900 truncate">
                    ${usuario.nombre}
                </div>
                <div class="col-span-3 text-right text-sm font-semibold ${pincelesColor}">
                    ${AppFormat.formatNumber(usuario.pinceles)} ℙ
                </div>
            `;
            
            listBody.appendChild(itemDiv);
        });

        listContainer.innerHTML = '';

        const headerHtml = `
            <div class="grid grid-cols-12 px-6 py-3">
                <div class="col-span-1 text-center text-xs font-medium text-slate-700 uppercase tracking-wider">Rank</div>
                <div class="col-span-8 text-left text-xs font-medium text-slate-700 uppercase tracking-wider">Nombre</div>
                <div class="col-span-3 text-right text-xs font-medium text-slate-700 uppercase tracking-wider">Pinceles</div>
            </div>
        `;

        listContainer.innerHTML = headerHtml;
        listContainer.appendChild(listBody);
        
        if (usuariosOrdenados.length === 0) {
            listContainer.innerHTML += `<div class="text-center p-6 text-slate-500">No hay alumnos en este grupo.</div>`;
        }

        listContainer.classList.remove('hidden');

        document.getElementById('home-stats-container').classList.add('hidden');
        document.getElementById('home-modules-grid').classList.add('hidden');
    },

    showStudentModal: function(nombreGrupo, nombreUsuario, rank) {
        const student = AppState.datosAdicionales.allStudents.find(u => u.nombre === nombreUsuario);
        const grupo = AppState.datosActuales.find(g => g.nombre === nombreGrupo);
        
        if (!student || !grupo) return;

        const modalContent = document.getElementById('student-modal-content');
        const totalPinceles = student.pinceles || 0;
        
        const gruposRankeados = AppState.datosActuales.filter(g => g.nombre !== 'Cicla');
        const rankGrupo = gruposRankeados.findIndex(g => g.nombre === nombreGrupo) + 1;
        
        const prestamoActivo = AppState.datosAdicionales.prestamosActivos.find(p => p.alumno === student.nombre);
        const depositoActivo = AppState.datosAdicionales.depositosActivos.find(d => d.alumno === student.nombre);

        const createStat = (label, value, valueClass = 'text-slate-900') => `
            <div class="bg-slate-50 p-4 rounded-lg text-center border border-slate-200">
                <div class="text-xs font-medium text-slate-500 uppercase tracking-wide">${label}</div>
                <div class="2xl font-bold ${valueClass} truncate">${value}</div>
            </div>
        `;

        let extraHtml = '';
        if (prestamoActivo) {
            extraHtml += `<p class="text-sm font-bold text-slate-800 text-center mt-3 p-2 bg-slate-200 rounded-lg border border-slate-300">⚠️ Préstamo Activo</p>`;
        }
        if (depositoActivo) {
            const vencimiento = new Date(depositoActivo.vencimiento);
            const fechaString = `${vencimiento.getDate()}/${vencimiento.getMonth() + 1}`;
            extraHtml += `<p class="text-sm font-bold text-amber-700 text-center mt-3 p-2 bg-amber-100 rounded-lg border border-amber-200">🏦 Depósito Activo (Vence: ${fechaString})</p>`;
        }
        
        modalContent.innerHTML = `
            <div class="p-6 relative">
                <div class="flex justify-between items-start mb-4 pr-12">
                    <div>
                        <h2 class="xl font-semibold color-dorado-main">${student.nombre}</h2>
                        <p class="text-sm font-medium text-slate-500">${grupo.nombre}</p>
                    </div>
                </div>
                <div class="grid grid-cols-2 gap-4">
                    ${createStat('Rank en Grupo', `${rank}º`, 'color-dorado-main')}
                    ${createStat('Rank de Grupo', `${rankGrupo > 0 ? rankGrupo + 'º' : 'N/A'}`, 'color-dorado-main')}
                    ${createStat('Total Pinceles', `${AppFormat.formatNumber(totalPinceles)} ℙ`, 'text-slate-800')}
                    ${createStat('Total Grupo', `${AppFormat.formatNumber(grupo.total)} ℙ`, 'text-slate-800')}
                    ${createStat('% del Grupo', `${grupo.total !== 0 ? ((totalPinceles / grupo.total) * 100).toFixed(1) : 0}%`, 'text-slate-800')}
                    ${createStat('Grupo Original', student.grupoNombre || 'N/A', 'text-slate-800')}
                </div>
                ${extraHtml}
                <button onclick="AppUI.hideModal('student-modal')" class="modal-close-btn absolute top-2 right-2 text-slate-400 hover:color-dorado-main text-2xl p-1">&times;</button>
            </div>
        `;
        AppUI.showModal('student-modal');
    },
    
    // Función para actualizar el contador (sin segundos)
    updateCountdown: function() {
        const getLastThursday = (year, month) => {
            const lastDayOfMonth = new Date(year, month + 1, 0);
            let lastThursday = new Date(lastDayOfMonth);
            lastThursday.setDate(lastThursday.getDate() - (lastThursday.getDay() + 3) % 7);
            return lastThursday;
        };

        const now = new Date();
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth();
        let storeDay = getLastThursday(currentYear, currentMonth); 

        const storeOpen = new Date(storeDay.getFullYear(), storeDay.getMonth(), storeDay.getDate(), 0, 0, 0); 
        const storeClose = new Date(storeDay.getFullYear(), storeDay.getMonth(), storeDay.getDate(), 23, 59, 59); 

        const timerEl = document.getElementById('countdown-timer');
        const messageEl = document.getElementById('store-message'); 
        
        const f = (val) => String(val).padStart(2, '0');

        const manualStatus = AppState.tienda.storeManualStatus;
        
        
        if (manualStatus === 'open') {
            timerEl.classList.add('hidden');
            messageEl.classList.remove('hidden');
            messageEl.textContent = "Tienda Abierta"; 
            AppState.tienda.isStoreOpen = true;

        } else if (manualStatus === 'closed') {
            timerEl.classList.add('hidden');
            messageEl.classList.remove('hidden');
            messageEl.textContent = "Tienda Cerrada"; 
            AppState.tienda.isStoreOpen = false;

        } else {
            if (now >= storeOpen && now <= storeClose) { 
                timerEl.classList.add('hidden');
                messageEl.classList.remove('hidden');
                messageEl.textContent = "Tienda Abierta"; 
                AppState.tienda.isStoreOpen = true;
            } else {
                timerEl.classList.remove('hidden');
                messageEl.classList.add('hidden'); 

                let targetDate = storeOpen; 
                if (now > storeClose) { 
                    targetDate = getLastThursday(currentYear, currentMonth + 1);
                    targetDate.setHours(0, 0, 0, 0); 
                }

                const distance = targetDate - now;
                
                const days = f(Math.floor(distance / (1000 * 60 * 60 * 24)));
                const hours = f(Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)));
                const minutes = f(Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60)));
                // Segundos eliminados
                
                const daysEl = document.getElementById('days');
                const hoursEl = document.getElementById('hours');
                const minutesEl = document.getElementById('minutes');
                
                // Estos elementos son inyectados como texto plano y sus clases CSS controlan el tamaño/estilo/espaciado
                if(daysEl) daysEl.textContent = days;
                if(hoursEl) hoursEl.textContent = hours;
                if(minutesEl) minutesEl.textContent = minutes;


                AppState.tienda.isStoreOpen = false;
            }
        }

        if (document.getElementById('tienda-modal').classList.contains('opacity-0') === false) {
            AppUI.updateTiendaButtonStates();
            AppUI.updateTiendaAdminStatusLabel();
        }
    },
    
    // Utilidad para forzar el relleno del input range
    updateSliderFill: (input) => {
        if (!input || input.type !== 'range') return;
        const min = input.min ? input.min : 0;
        const max = input.max ? input.max : 100;
        const val = input.value;
        const percent = ((val - min) / (max - min)) * 100;
        input.style.background = `linear-gradient(to right, #d97706 0%, #d97706 ${percent}%, #cbd5e1 ${percent}%, #cbd5e1 100%)`;
    },
    
    // Función para mostrar modales legales y cargar contenido
    showLegalModal: function(type) {
        const titleEl = document.getElementById('terminos-modal-title');
        const contentEl = document.getElementById('terminos-modal-content');
        
        let title, contentHTML;

        if (type === 'terminos') {
            title = "Términos y Condiciones";
            contentHTML = AppContent.terminosYCondiciones;
        } else if (type === 'privacidad') {
            title = "Acuerdo de Privacidad";
            contentHTML = AppContent.acuerdoDePrivacidad;
        } else {
            return;
        }

        titleEl.textContent = title;
        contentEl.innerHTML = contentHTML;
        
        AppUI.showModal('terminos-modal');
    }
};

// --- OBJETO TRANSACCIONES (Préstamos, Depósitos, P2P, Bonos, Tienda) ---
const AppTransacciones = {
    
    // --- NUEVAS FUNCIONES DE BANCA FLEXIBLE ---

    checkLoanEligibility: function(student, montoSolicitado) {
        if (student.pinceles < 0) {
            return { isEligible: false, message: 'Saldo negativo no es elegible para préstamos.' };
        }
        const capacity = student.pinceles * 0.50;
        if (montoSolicitado > capacity) {
            return { isEligible: false, message: `Monto excede el 50% de tu saldo. Máx: ${AppFormat.formatNumber(capacity)} ℙ.` };
        }
        if (AppState.datosAdicionales.prestamosActivos.some(p => p.alumno === student.nombre)) {
            return { isEligible: false, message: 'Ya tienes un préstamo activo.' };
        }
        if (AppState.datosAdicionales.saldoTesoreria < montoSolicitado) {
            return { isEligible: false, message: 'Tesorería sin fondos suficientes para tu solicitud.' };
        }
        return { isEligible: true, message: '¡Elegible! Confirma la solicitud.' };
    },

    checkDepositEligibility: function(student, montoADepositar) {
        if (AppState.datosAdicionales.prestamosActivos.some(p => p.alumno === student.nombre)) {
            return { isEligible: false, message: 'No puedes invertir con un préstamo activo.' };
        }
        if (student.pinceles < montoADepositar) {
            return { isEligible: false, message: 'Fondos insuficientes en tu cuenta.' };
        }
        return { isEligible: true, message: '¡Elegible! Confirma la inversión.' };
    },

    setEligibilityState: function(btn, msgEl, isEligible, message, isBasicValidation = false) {
        if (isEligible) {
            AppTransacciones.setSuccess(msgEl, message);
            btn.disabled = false;
        } else {
            AppTransacciones.setError(msgEl, message, isBasicValidation ? 'text-slate-600' : 'text-red-600');
            btn.disabled = true;
        }
    },
    
    solicitarPrestamoFlexible: async function() {
        const btn = document.getElementById('prestamo-submit-btn');
        const statusMsg = document.getElementById('prestamo-status-msg');
        const btnText = document.getElementById('prestamo-btn-text');

        const alumnoNombre = document.getElementById('prestamo-search-alumno').value.trim();
        const claveP2P = document.getElementById('prestamo-clave-p2p').value;
        const montoSolicitado = parseInt(document.getElementById('prestamo-monto-input').value);
        const plazoSolicitado = parseInt(document.getElementById('prestamo-plazo-input').value);

        const student = AppState.currentSearch.prestamoAlumno.info;

        let errorValidacion = "";
        if (!student || student.nombre !== alumnoNombre) {
            errorValidacion = "Alumno no encontrado. Seleccione de la lista.";
        } else if (!claveP2P) {
            errorValidacion = "Clave P2P requerida.";
        } else {
            const elegibilidad = AppTransacciones.checkLoanEligibility(student, montoSolicitado);
            if (!elegibilidad.isEligible) errorValidacion = `No elegible: ${elegibilidad.message}`;
        }

        if (errorValidacion) {
            AppTransacciones.setError(statusMsg, errorValidacion);
            return;
        }

        AppTransacciones.setLoadingState(btn, btnText, true, 'Procesando...');
        AppTransacciones.setLoading(statusMsg, 'Enviando solicitud al Banco...');

        try {
            const payload = {
                accion: 'solicitar_prestamo_flexible', 
                alumnoNombre: alumnoNombre,
                claveP2P: claveP2P,
                montoSolicitado: montoSolicitado,
                plazoSolicitado: plazoSolicitado
            };

            const response = await AppTransacciones.fetchWithExponentialBackoff(AppConfig.API_URL, {
                method: 'POST',
                body: JSON.stringify(payload), 
            });

            const result = await response.json();

            if (result.success === true) {
                AppTransacciones.setSuccess(statusMsg, result.message || "¡Préstamo otorgado con éxito!");
                AppUI.resetFlexibleForm('prestamo');
                AppData.cargarDatos(false); 
            } else {
                throw new Error(result.message || "Error al otorgar el préstamo.");
            }
        } catch (error) {
            AppTransacciones.setError(statusMsg, error.message);
        } finally {
            AppTransacciones.setLoadingState(btn, btnText, false, 'Confirmar Solicitud');
        }
    },

    crearDepositoFlexible: async function() {
        const btn = document.getElementById('deposito-submit-btn');
        const statusMsg = document.getElementById('deposito-status-msg');
        const btnText = document.getElementById('deposito-btn-text');

        const alumnoNombre = document.getElementById('deposito-search-alumno').value.trim();
        const claveP2P = document.getElementById('deposito-clave-p2p').value;
        const montoADepositar = parseInt(document.getElementById('deposito-monto-input').value);
        const plazoEnDias = parseInt(document.getElementById('deposito-plazo-input').value);

        const student = AppState.currentSearch.depositoAlumno.info;

        let errorValidacion = "";
        if (!student || student.nombre !== alumnoNombre) {
            errorValidacion = "Alumno no encontrado. Seleccione de la lista.";
        } else if (!claveP2P) {
            errorValidacion = "Clave P2P requerida.";
        } else {
            const elegibilidad = AppTransacciones.checkDepositEligibility(student, montoADepositar);
            if (!elegibilidad.isEligible) errorValidacion = `No elegible: ${elegibilidad.message}`;
        }

        if (errorValidacion) {
            AppTransacciones.setError(statusMsg, errorValidacion);
            return;
        }

        AppTransacciones.setLoadingState(btn, btnText, true, 'Procesando...');
        AppTransacciones.setLoading(statusMsg, 'Creando depósito en el Banco...');

        try {
            const payload = {
                accion: 'crear_deposito_flexible',
                alumnoNombre: alumnoNombre,
                claveP2P: claveP2P,
                montoADepositar: montoADepositar,
                plazoEnDias: plazoEnDias
            };

            const response = await AppTransacciones.fetchWithExponentialBackoff(AppConfig.API_URL, {
                method: 'POST',
                body: JSON.stringify(payload), 
            });

            const result = await response.json();

            if (result.success === true) {
                AppTransacciones.setSuccess(statusMsg, result.message || "¡Depósito creado con éxito!");
                AppUI.resetFlexibleForm('deposito');
                AppData.cargarDatos(false); 
            } else {
                throw new Error(result.message || "Error al crear el depósito.");
            }
        } catch (error) {
            AppTransacciones.setError(statusMsg, error.message);
        } finally {
            AppTransacciones.setLoadingState(btn, btnText, false, 'Confirmar Inversión');
        }
    },
    
    // --- FIN NUEVAS FUNCIONES DE BANCA FLEXIBLE ---

    realizarTransaccionMultiple: async function() {
        const cantidadInput = document.getElementById('transaccion-cantidad-input');
        const statusMsg = document.getElementById('transaccion-status-msg');
        const submitBtn = document.getElementById('transaccion-submit-btn');
        const btnText = document.getElementById('transaccion-btn-text');
        
        const pinceles = parseInt(cantidadInput.value, 10);

        let errorValidacion = "";
        if (isNaN(pinceles) || pinceles === 0) {
            errorValidacion = "La cantidad debe ser un número distinto de cero.";
        }

        const groupedSelections = {};
        const checkedUsers = document.querySelectorAll('#transaccion-lista-usuarios-container input[type="checkbox"]:checked');
        
        if (!errorValidacion && checkedUsers.length === 0) {
            errorValidacion = "Debe seleccionar al menos un usuario.";
        } else {
             checkedUsers.forEach(cb => {
                const nombre = cb.value;
                const grupo = cb.dataset.grupo; 
                if (!groupedSelections[grupo]) {
                    groupedSelections[grupo] = [];
                }
                groupedSelections[grupo].push(nombre);
            });
        }
        
        const transacciones = Object.keys(groupedSelections).map(grupo => {
            return { grupo: grupo, nombres: groupedSelections[grupo] };
        });

        if (errorValidacion) {
            AppTransacciones.setError(statusMsg, errorValidacion);
            return;
        }

        AppTransacciones.setLoadingState(submitBtn, btnText, true, 'Procesando...');
        AppTransacciones.setLoading(statusMsg, `Procesando ${checkedUsers.length} transacción(es)...`);
        
        try {
            const payload = {
                accion: 'transaccion_multiple', 
                clave: AppConfig.CLAVE_MAESTRA,
                cantidad: pinceles, 
                transacciones: transacciones 
            };

            const response = await AppTransacciones.fetchWithExponentialBackoff(AppConfig.TRANSACCION_API_URL, {
                method: 'POST',
                body: JSON.stringify(payload), 
            });

            const result = await response.json();

            if (result.success === true) {
                const successMsg = result.message || "¡Transacción(es) exitosa(s)!";
                AppTransacciones.setSuccess(statusMsg, successMsg);
                
                cantidadInput.value = "";
                document.getElementById('transaccion-calculo-impuesto').textContent = "";
                AppData.cargarDatos(false); 
                AppUI.populateGruposTransaccion(); 
                AppUI.populateUsuariosTransaccion(); 

            } else {
                throw new Error(result.message || "Error desconocido de la API.");
            }

        } catch (error) {
            AppTransacciones.setError(statusMsg, error.message);
        } finally {
            AppTransacciones.setLoadingState(submitBtn, btnText, false, 'Realizar Transacción');
        }
    },
    
    realizarTransferenciaP2P: async function() {
        const statusMsg = document.getElementById('p2p-status-msg');
        const submitBtn = document.getElementById('p2p-submit-btn');
        const btnText = document.getElementById('p2p-btn-text');
        
        const nombreOrigen = AppState.currentSearch.p2pOrigen.selected;
        const nombreDestino = AppState.currentSearch.p2pDestino.selected;
        const claveP2P = document.getElementById('p2p-clave').value;
        const cantidad = parseInt(document.getElementById('p2p-cantidad').value, 10);
        
        let errorValidacion = "";
        if (!nombreOrigen) {
            errorValidacion = "Debe seleccionar su nombre (Remitente) de la lista.";
        } else if (!claveP2P) {
            errorValidacion = "Debe ingresar su Clave P2P.";
        } else if (!nombreDestino) {
            errorValidacion = "Debe seleccionar un Destinatario de la lista.";
        } else if (isNaN(cantidad) || cantidad <= 0) {
            errorValidacion = "La cantidad debe ser un número positivo.";
        } else if (nombreOrigen === nombreDestino) {
            errorValidacion = "No puedes enviarte pinceles a ti mismo.";
        }
        
        if (errorValidacion) {
            AppTransacciones.setError(statusMsg, errorValidacion);
            return;
        }

        AppTransacciones.setLoadingState(submitBtn, btnText, true, 'Procesando...');
        AppTransacciones.setLoading(statusMsg, `Transfiriendo ${AppFormat.formatNumber(cantidad)} ℙ a ${nombreDestino}...`);
        
        try {
            const payload = {
                accion: 'transferir_p2p',
                nombre_origen: nombreOrigen,
                clave_p2p_origen: claveP2P,
                nombre_destino: nombreDestino,
                cantidad: cantidad
            };

            const response = await AppTransacciones.fetchWithExponentialBackoff(AppConfig.API_URL, {
                method: 'POST',
                body: JSON.stringify(payload), 
            });

            const result = await response.json();

            if (result.success === true) {
                AppTransacciones.setSuccess(statusMsg, result.message || "¡Transferencia exitosa!");
                
                AppUI.resetSearchInput('p2pDestino');
                document.getElementById('p2p-clave').value = "";
                document.getElementById('p2p-cantidad').value = "";
                document.getElementById('p2p-calculo-impuesto').textContent = "";
                
                AppData.cargarDatos(false); 

            } else {
                throw new Error(result.message || "Error desconocido de la API.");
            }

        } catch (error) {
            AppTransacciones.setError(statusMsg, error.message);
        } finally {
            AppTransacciones.setLoadingState(submitBtn, btnText, false, 'Realizar Transferencia');
        }
    },
    
    // --- LÓGICA DE BONOS (FLUJO DE 2 PASOS) ---
    iniciarCanje: function(bonoClave) {
        const bono = AppState.bonos.disponibles.find(b => b.clave === bonoClave);
        const statusMsg = document.getElementById('bono-status-msg');
        
        const listContainer = document.getElementById('bonos-lista-disponible');
        const clickedBtn = listContainer.querySelector(`#bono-btn-${bonoClave}`);
        if (clickedBtn) {
            clickedBtn.classList.remove('bg-white', 'hover:bg-amber-50', 'text-amber-600', 'border-amber-600');
            clickedBtn.classList.add('bg-slate-100', 'text-slate-600', 'border-slate-300', 'cursor-not-allowed', 'shadow-none');
            clickedBtn.disabled = true;
            clickedBtn.textContent = "Cargando...";
        }

        if (bono.usos_actuales >= bono.usos_totales) {
             AppTransacciones.setError(statusMsg, "Bono agotado, intente más tarde.");
             if (clickedBtn) {
                clickedBtn.textContent = "Canjear";
                clickedBtn.classList.remove('bg-slate-100', 'text-slate-600', 'border-slate-300', 'cursor-not-allowed', 'shadow-none');
                clickedBtn.classList.add('bg-white', 'hover:bg-amber-50', 'text-amber-600', 'border-amber-600');
                clickedBtn.disabled = false;
             }
             return;
        }
        
        AppUI.showBonoStep2(bonoClave);

        setTimeout(() => {
            if (clickedBtn) {
                clickedBtn.textContent = "Canjear";
                clickedBtn.classList.remove('bg-slate-100', 'text-slate-600', 'border-slate-300', 'cursor-not-allowed', 'shadow-none');
                clickedBtn.classList.add('bg-white', 'hover:bg-amber-50', 'text-amber-600', 'border-amber-600');
                clickedBtn.disabled = false;
            }
        }, 500);
    },

    confirmarCanje: async function() {
        const statusMsg = document.getElementById('bono-step2-status-msg');
        const submitBtn = document.getElementById('bono-submit-step2-btn');
        const btnText = document.getElementById('bono-btn-text-step2');
        
        AppTransacciones.setLoadingState(submitBtn, btnText, true, 'Canjeando...');

        const alumnoNombre = document.getElementById('bono-search-alumno-step2').value.trim();
        const claveP2P = document.getElementById('bono-clave-p2p-step2').value;
        const claveBono = document.getElementById('bono-clave-input-step2').value.toUpperCase();

        const bono = AppState.bonos.disponibles.find(b => b.clave === claveBono);
        const student = AppState.datosAdicionales.allStudents.find(s => s.nombre === alumnoNombre);


        let errorValidacion = "";
        if (!alumnoNombre || !student) {
            errorValidacion = "Alumno no encontrado. Por favor, seleccione su nombre de la lista.";
        } else if (!claveP2P) {
            errorValidacion = "Debe ingresar su Clave P2P.";
        } else if (!claveBono || !bono) {
            errorValidacion = "Error interno: Bono no seleccionado.";
        } else {
            if (bono.grupos_permitidos) {
                const allowedGroups = (bono.grupos_permitidos || '').split(',').map(g => g.trim());
                if (!allowedGroups.includes(student.grupoNombre)) {
                    errorValidacion = `Tu grupo (${student.grupoNombre}) no está autorizado para este bono.`;
                }
            }
            if (bono.expiracion_fecha && new Date(bono.expiracion_fecha).getTime() < Date.now()) {
                 errorValidacion = "Este bono ha expirado.";
            }
        }
        
        if (errorValidacion) {
            AppTransacciones.setError(statusMsg, errorValidacion);
            AppTransacciones.setLoadingState(submitBtn, btnText, false, 'Confirmar Canje');
            return;
        }

        AppTransacciones.setLoading(statusMsg, `Procesando bono ${claveBono}...`);
        
        try {
            const payload = {
                accion: 'canjear_bono',
                alumnoNombre: alumnoNombre, 
                claveP2P: claveP2P,  
                claveBono: claveBono
            };

            const response = await AppTransacciones.fetchWithExponentialBackoff(AppConfig.API_URL, {
                method: 'POST',
                body: JSON.stringify(payload),
            });

            const result = await response.json();

            if (result.success === true) {
                AppTransacciones.setSuccess(statusMsg, result.message || "¡Bono canjeado con éxito!");
                
                document.getElementById('bono-clave-p2p-step2').value = "";
                AppUI.showBonoStep1(); 
                
                AppData.cargarDatos(false); 

            } else {
                throw new Error(result.message || "Error desconocido de la API.");
            }

        } catch (error) {
            AppTransacciones.setError(statusMsg, error.message);
        } finally {
            AppTransacciones.setLoadingState(submitBtn, btnText, false, 'Confirmar Canje');
        }
    },

    crearActualizarBono: async function() {
        const statusMsg = document.getElementById('bono-admin-status-msg');
        const submitBtn = document.getElementById('bono-admin-submit-btn');
        
        const clave = document.getElementById('bono-admin-clave-input').value.toUpperCase();
        const nombre = document.getElementById('bono-admin-nombre-input').value;
        const recompensa = parseInt(document.getElementById('bono-admin-recompensa-input').value, 10);
        const usos_totales = parseInt(document.getElementById('bono-admin-usos-input').value, 10);
        
        const duracionHoras = parseInt(document.getElementById('bono-admin-expiracion-input').value, 10);
        
        const checkedGroups = AppUI.getAdminGroupCheckboxSelection('bono-admin-grupos-checkboxes-container');
        const grupos_permitidos = checkedGroups.join(', ');
        
        let expiracion_fecha = '';
        if (!isNaN(duracionHoras) && duracionHoras > 0) {
            const expiryDate = new Date(Date.now() + duracionHoras * 60 * 60 * 1000);
            expiracion_fecha = AppFormat.toLocalISOString(expiryDate); 
        }

        let errorValidacion = "";
        if (!clave) {
            errorValidacion = "La 'Clave' es obligatoria.";
        } else if (!nombre) {
            errorValidacion = "El 'Nombre' es obligatorio.";
        } else if (isNaN(recompensa) || recompensa <= 0) {
            errorValidacion = "La 'Recompensa' debe ser un número positivo.";
        } else if (isNaN(usos_totales) || usos_totales < 0) {
            errorValidacion = "Los 'Usos Totales' deben ser un número (0 o más).";
        }
        
        if (errorValidacion) {
            AppTransacciones.setError(statusMsg, errorValidacion);
            return;
        }

        AppTransacciones.setLoadingState(submitBtn, null, true, 'Guardando...');
        AppTransacciones.setLoading(statusMsg, `Guardando bono ${clave}...`);

        try {
            const payload = {
                accion: 'admin_crear_bono',
                clave: AppConfig.CLAVE_MAESTRA,
                bono: {
                    clave: clave,
                    nombre: nombre,
                    recompensa: recompensa,
                    usos_totales: usos_totales,
                    grupos_permitidos: grupos_permitidos,
                    expiracion_fecha: expiracion_fecha
                }
            };

            const response = await AppTransacciones.fetchWithExponentialBackoff(AppConfig.API_URL, {
                method: 'POST',
                body: JSON.stringify(payload),
            });

            const result = await response.json();

            if (result.success === true) {
                AppTransacciones.setSuccess(statusMsg, result.message || "¡Bono guardado con éxito!");
                AppUI.clearBonoAdminForm();
                await AppData.cargarDatos(false);
                AppUI.populateBonoList(); 
                
            } else {
                throw new Error(result.message || "Error al guardar el bono.");
            }

        } catch (error) {
            AppTransacciones.setError(statusMsg, error.message);
        } finally {
            AppTransacciones.setLoadingState(submitBtn, null, false, 'Crear / Actualizar Bono');
        }
    },
    
    eliminarBono: async function(claveBono) {
        const statusMsg = document.getElementById('bono-admin-status-msg');
        AppTransacciones.setLoading(statusMsg, `Eliminando bono ${claveBono}...`);
        
        document.querySelectorAll('.delete-bono-btn').forEach(btn => btn.disabled = true);

        try {
            const payload = {
                accion: 'admin_eliminar_bono',
                clave: AppConfig.CLAVE_MAESTRA,
                claveBono: claveBono
            };

            const response = await AppTransacciones.fetchWithExponentialBackoff(AppConfig.API_URL, {
                method: 'POST',
                body: JSON.stringify(payload),
            });

            const result = await response.json();

            if (result.success === true) {
                AppTransacciones.setSuccess(statusMsg, result.message || "¡Bono eliminado con éxito!");
                await AppData.cargarDatos(false);
                AppUI.populateBonoList();
                
            } else {
                throw new Error(result.message || "Error al eliminar el bono.");
            }

        } catch (error) {
            AppTransacciones.setError(statusMsg, error.message);
            document.querySelectorAll('.delete-bono-btn').forEach(btn => btn.disabled = false);
        } 
    },

    // --- LÓGICA DE TIENDA (FLUJO DE 2 PASOS) ---
    iniciarCompra: function(itemId) {
        const item = AppState.tienda.items[itemId];
        const statusMsg = document.getElementById('tienda-status-msg');
        const buyBtn = document.getElementById(`buy-btn-${itemId}`);
        
        if (buyBtn) {
            buyBtn.classList.remove('bg-white', 'hover:bg-amber-50', 'text-amber-600', 'border-amber-600');
            buyBtn.classList.add('bg-slate-100', 'text-slate-600', 'border-slate-300', 'cursor-not-allowed', 'shadow-none');
            buyBtn.disabled = true;
            buyBtn.querySelector('.btn-text').textContent = "Cargando...";
        }
        
        statusMsg.textContent = "";

        if (!item) {
            AppTransacciones.setError(statusMsg, "Error interno: Artículo no encontrado.");
            if (buyBtn) AppUI.updateTiendaButtonStates();
            return;
        }

        AppUI.showTiendaStep2(itemId);
        
        setTimeout(() => {
            if (buyBtn) AppUI.updateTiendaButtonStates();
        }, 500);
    },

    confirmarCompra: async function() {
        const statusMsg = document.getElementById('tienda-step2-status-msg'); 
        const submitBtn = document.getElementById('tienda-submit-step2-btn');
        const btnText = document.getElementById('tienda-btn-text-step2');
        
        AppTransacciones.setLoadingState(submitBtn, btnText, true, 'Comprando...');

        const itemId = AppState.tienda.selectedItem;
        const alumnoNombre = document.getElementById('tienda-search-alumno-step2').value.trim();
        const claveP2P = document.getElementById('tienda-clave-p2p-step2').value;

        const item = AppState.tienda.items[itemId];
        const student = AppState.datosAdicionales.allStudents.find(s => s.nombre === alumnoNombre);

        let errorValidacion = "";
        if (!itemId || !item) {
            errorValidacion = "Error interno: Artículo no seleccionado.";
        } else if (!alumnoNombre || !student) {
            errorValidacion = "Alumno no encontrado. Por favor, seleccione su nombre de la lista.";
        } else if (!claveP2P) {
            errorValidacion = "Debe ingresar su Clave P2P.";
        } else {
            const costoFinal = Math.round(item.precio * (1 + AppConfig.TASA_ITBIS));
            if (student.pinceles < costoFinal) {
                errorValidacion = "Saldo insuficiente para completar la compra.";
            } else if (item.stock <= 0 && item.ItemID !== 'filantropo') {
                errorValidacion = "El artículo está agotado.";
            } else {
                if (item.GruposPermitidos) {
                    const allowedGroups = (item.GruposPermitidos || '').split(',').map(g => g.trim());
                    if (!allowedGroups.includes(student.grupoNombre)) {
                        errorValidacion = `Tu grupo (${student.grupoNombre}) no está autorizado para esta compra.`;
                    }
                }
                if (item.ExpiracionFecha && new Date(item.ExpiracionFecha).getTime() < Date.now()) {
                    errorValidacion = "Este artículo ha expirado.";
                }
            }
        }
        
        if (errorValidacion) {
            AppTransacciones.setError(statusMsg, errorValidacion);
            AppTransacciones.setLoadingState(submitBtn, btnText, false, 'Confirmar Compra');
            return;
        }

        AppTransacciones.setLoading(statusMsg, `Procesando compra de ${itemId}...`);
        
        try {
            const payload = {
                accion: 'comprar_item_tienda',
                alumnoNombre: alumnoNombre,
                claveP2P: claveP2P,
                itemId: itemId
            };

            const response = await AppTransacciones.fetchWithExponentialBackoff(AppConfig.API_URL, {
                method: 'POST',
                body: JSON.stringify(payload),
            });

            const result = await response.json();

            if (result.success === true) {
                AppTransacciones.setSuccess(statusMsg, result.message || "¡Compra exitosa!");
                
                document.getElementById('tienda-clave-p2p-step2').value = "";
                AppUI.showTiendaStep1();
                
                AppData.cargarDatos(false); 

            } else {
                throw new Error(result.message || "Error desconocido de la API.");
            }

        } catch (error) {
            AppTransacciones.setError(statusMsg, error.message);
        } finally {
            AppTransacciones.setLoadingState(submitBtn, btnText, false, 'Confirmar Compra');
        }
    },

    crearActualizarItem: async function() {
        const statusMsg = document.getElementById('tienda-admin-status-msg');
        const submitBtn = document.getElementById('tienda-admin-submit-btn');
        
        const duracionHoras = parseInt(document.getElementById('tienda-admin-expiracion-input').value, 10);
        
        const checkedGroups = AppUI.getAdminGroupCheckboxSelection('tienda-admin-grupos-checkboxes-container');
        const grupos_permitidos = checkedGroups.join(', ');

        let expiracion_fecha = '';
        if (!isNaN(duracionHoras) && duracionHoras > 0) {
            const expiryDate = new Date(Date.now() + duracionHoras * 60 * 60 * 1000);
            expiracion_fecha = AppFormat.toLocalISOString(expiryDate);
        }

        const item = {
            ItemID: document.getElementById('tienda-admin-itemid-input').value.trim(),
            Nombre: document.getElementById('tienda-admin-nombre-input').value.trim(),
            Descripcion: document.getElementById('tienda-admin-desc-input').value.trim(),
            Tipo: document.getElementById('tienda-admin-tipo-input').value.trim(),
            PrecioBase: parseInt(document.getElementById('tienda-admin-precio-input').value, 10),
            Stock: parseInt(document.getElementById('tienda-admin-stock-input').value, 10),
            GruposPermitidos: grupos_permitidos, 
            ExpiracionFecha: expiracion_fecha 
        };
        
        let errorValidacion = "";
        if (!item.ItemID) {
            errorValidacion = "El 'ItemID' es obligatorio.";
        } else if (!item.Nombre) {
            errorValidacion = "El 'Nombre' es obligatorio.";
        } else if (isNaN(item.PrecioBase) || item.PrecioBase <= 0) {
            errorValidacion = "El 'Precio Base' debe ser un número positivo.";
        } else if (isNaN(item.Stock) || item.Stock < 0) {
            errorValidacion = "El 'Stock' debe ser un número (0 o más).";
        }
        
        if (errorValidacion) {
            AppTransacciones.setError(statusMsg, errorValidacion);
            return;
        }

        AppTransacciones.setLoadingState(submitBtn, null, true, 'Guardando...');
        AppTransacciones.setLoading(statusMsg, `Guardando artículo ${item.ItemID}...`);

        try {
            const payload = {
                accion: 'admin_crear_item_tienda',
                clave: AppConfig.CLAVE_MAESTRA,
                item: item
            };

            const response = await AppTransacciones.fetchWithExponentialBackoff(AppConfig.TRANSACCION_API_URL, {
                method: 'POST',
                body: JSON.stringify(payload),
            });

            const result = await response.json();

            if (result.success === true) {
                AppTransacciones.setSuccess(statusMsg, result.message || "¡Artículo guardado con éxito!");
                AppUI.clearTiendaAdminForm();
                await AppData.cargarDatos(false);
                AppUI.renderTiendaItems();
                
            } else {
                throw new Error(result.message || "Error al guardar el artículo.");
            }

        } catch (error) {
            AppTransacciones.setError(statusMsg, error.message);
        } finally {
            AppTransacciones.setLoadingState(submitBtn, null, false, 'Crear / Actualizar');
        }
    },
    
    eliminarItem: async function(itemId) {
        const statusMsg = document.getElementById('tienda-admin-status-msg'); 
        AppTransacciones.setLoading(statusMsg, `Eliminando artículo ${itemId}...`);
        
        const row = document.getElementById(`tienda-item-row-${itemId}`);
        if (row) row.querySelectorAll('button').forEach(btn => btn.disabled = true);

        try {
            const payload = {
                accion: 'admin_eliminar_item_tienda',
                clave: AppConfig.CLAVE_MAESTRA,
                itemId: itemId
            };

            const response = await AppTransacciones.fetchWithExponentialBackoff(AppConfig.TRANSACCION_API_URL, {
                method: 'POST',
                body: JSON.stringify(payload),
            });

            const result = await response.json();

            if (result.success === true) {
                AppTransacciones.setSuccess(statusMsg, result.message || "¡Artículo eliminado con éxito!");
                await AppData.cargarDatos(false);
                AppUI.renderTiendaItems();
                
            } else {
                throw new Error(result.message || "Error al eliminar el artículo.");
            }

        } catch (error) {
            AppTransacciones.setError(statusMsg, error.message);
            AppData.cargarDatos(false); 
        } 
    },
    
    toggleStoreManual: async function(status) {
        const statusMsg = document.getElementById('tienda-admin-status-msg'); 
        AppTransacciones.setLoading(statusMsg, `Cambiando estado a: ${status}...`);
        
        document.getElementById('tienda-force-open-btn').disabled = true;
        document.getElementById('tienda-force-close-btn').disabled = true;
        document.getElementById('tienda-force-auto-btn').disabled = true;

        try {
            const payload = {
                accion: 'admin_toggle_store',
                clave: AppConfig.CLAVE_MAESTRA,
                status: status
            };

            const response = await AppTransacciones.fetchWithExponentialBackoff(AppConfig.TRANSACCION_API_URL, {
                method: 'POST',
                body: JSON.stringify(payload),
            });

            const result = await response.json();

            if (result.success === true) {
                AppTransacciones.setSuccess(statusMsg, result.message || "¡Estado de la tienda actualizado!");
                AppData.cargarDatos(false);
            } else {
                throw new Error(result.message || "Error al cambiar estado.");
            }

        } catch (error) {
            AppTransacciones.setError(statusMsg, error.message);
        } finally {
            document.getElementById('tienda-force-open-btn').disabled = false;
            document.getElementById('tienda-force-close-btn').disabled = false;
            document.getElementById('tienda-force-auto-btn').disabled = false;
        }
    },

    // --- Utilidades de Fetch y Estado ---

    fetchWithExponentialBackoff: async function(url, options, maxRetries = 5, initialDelay = 1000) {
        for (let attempt = 0; attempt < maxRetries; attempt++) {
            try {
                const response = await fetch(url, options);
                if (response.status !== 429) {
                    return response;
                }
            } catch (error) {
                if (attempt === maxRetries - 1) throw error;
            }
            const delay = initialDelay * Math.pow(2, attempt) + Math.random() * 1000;
            // No loguear retries
            await new Promise(resolve => setTimeout(resolve, delay));
        }
        throw new Error('Failed to fetch after multiple retries.');
    },

    setLoadingState: function(btn, btnTextEl, isLoading, defaultText) {
        if (isLoading) {
            if (btnTextEl) btnTextEl.textContent = '...';
            if (btn) btn.disabled = true;
            if (btn) {
                btn.classList.remove('bg-white', 'hover:bg-amber-50', 'text-amber-600', 'border-amber-600');
                btn.classList.add('bg-slate-100', 'text-slate-600', 'border-slate-300', 'cursor-not-allowed', 'shadow-none');
            }
        } else {
            if (btnTextEl && defaultText) btnTextEl.textContent = defaultText;
            if (btn) btn.disabled = false;
            if (btn) {
                btn.classList.remove('bg-slate-100', 'text-slate-600', 'border-slate-300', 'cursor-not-allowed', 'shadow-none');
                btn.classList.add('bg-white', 'hover:bg-amber-50', 'text-amber-600', 'border-amber-600');
            }
        }
    },
    
    setLoading: function(statusMsgEl, message) {
        if (statusMsgEl) {
            statusMsgEl.textContent = message;
            statusMsgEl.className = "text-sm text-center font-medium color-dorado-main h-auto min-h-[1rem]";
        }
    },

    setSuccess: function(statusMsgEl, message) {
        if (statusMsgEl) {
            statusMsgEl.textContent = message;
            statusMsgEl.className = "text-sm text-center font-medium color-dorado-main h-auto min-h-[1rem]";
        }
    },

    setError: function(statusMsgEl, message, colorClass = 'text-red-600') {
        if (statusMsgEl) {
            statusMsgEl.textContent = `Error: ${message}`;
            statusMsgEl.className = `text-sm text-center font-medium ${colorClass} h-auto min-h-[1em]`;
        }
    }
};

// --- CONTENIDO ESTATICOS (Términos, Privacidad) ---
// CORRECCIÓN: Eliminación de la clase mt-6 del primer subtítulo en ambos contenidos.

const AppContent = {
    // Contenido actualizado y profesional para Términos y Condiciones
    terminosYCondiciones: `
        
        <strong class="text-lg font-semibold text-slate-800 mb-2 block">I. Alcance y Principios</strong>
        <p>Los presentes Términos y Condiciones rigen el uso de todos los servicios de banca virtual proporcionados por el Banco del Pincel Dorado (BPD). La utilización de cualquiera de estos servicios implica la aceptación total de estas disposiciones y del Reglamento General.</p>
        <ul class="list-disc list-inside ml-4 space-y-1 text-sm">
            <li><strong>Usuario:</strong> Cualquier alumno activo dentro del ecosistema.</li>
            <li><strong>Pinceles (ℙ):</strong> Unidad monetaria virtual de uso exclusivo en el ámbito académico.</li>
            <li><strong>Clave P2P:</strong> Código personal e intransferible necesario para autorizar transacciones.</li>
            <li><strong>Tesorería:</strong> Fondo operativo central del BPD destinado a asegurar la liquidez y sostenibilidad del sistema.</li>
        </ul>

        <strong class="text-lg font-semibold text-slate-800 mt-6 mb-2 block">II. Normativa de Transferencias (P2P)</strong>
        <p>Este servicio facilita el intercambio de valor entre cuentas de Usuarios.</p>
        <ul class="list-disc list-inside ml-4 space-y-1 text-sm">
            <li><strong>Irrevocabilidad:</strong> Toda Transferencia confirmada es definitiva e irreversible.</li>
            <li><strong>Costo Operacional:</strong> Se aplicará una comisión del <strong>${AppConfig.IMPUESTO_P2P_TASA * 100}%</strong> sobre el monto enviado, la cual será debitada de la cuenta del Usuario Remitente.</li>
            <li><strong>Seguridad:</strong> El Usuario es responsable de la protección de su Clave P2P.</li>
        </ul>

        <strong class="text-lg font-semibold text-slate-800 mt-6 mb-2 block">III. Normativa de Préstamos Flexibles</strong>
        <p>Líneas de financiamiento sujetas a condiciones de cumplimiento y liquidez.</p>
        <ul class="list-disc list-inside ml-4 space-y-1 text-sm">
            <li><strong>Cálculo de Intereses:</strong> Interés determinado por una Tasa Base (${AppConfig.PRESTAMO_TASA_BASE * 100}% base) más un factor diario (${AppConfig.PRESTAMO_BONUS_POR_DIA * 100}% por día) según el plazo (3 a 21 días).</li>
            <li><strong>Compromiso de Reembolso:</strong> El Usuario prestatario está obligado a devolver el capital más intereses en cuotas diarias. El incumplimiento resulta en la aplicación de cargos moratorios.</li>
            <li><strong>Elegibilidad:</strong> La aprobación se basa en la evaluación de saldo y capacidad de pago.</li>
        </ul>

        <strong class="text-lg font-semibold text-slate-800 mt-6 mb-2 block">IV. Condiciones para Depósitos Flexibles (Inversiones)</strong>
        <p>Servicio para incentivar el ahorro y la planificación financiera a medio plazo.</p>
        <ul class="list-disc list-inside ml-4 space-y-1 text-sm">
            <li><strong>Rendimiento:</strong> La ganancia se determina por una Tasa Base (${AppConfig.DEPOSITO_TASA_BASE * 100}% base) más un factor de rendimiento diario (${AppConfig.DEPOSITO_BONUS_POR_DIA * 100}% por día).</li>
            <li><strong>Retención de Capital:</strong> El capital invertido y los rendimientos generados permanecerán inmovilizados hasta la fecha de vencimiento.</li>
        </ul>

        <strong class="text-lg font-semibold text-slate-800 mt-6 mb-2 block">V. Sanciones por Incumplimiento</strong>
        <p>Se prohíbe estrictamente el uso de cualquier componente del BPD (incluyendo Transferencias y otros servicios) para realizar actividades que violen las Normas de Convivencia o el Reglamento Académico.</p>
        <p>La violación de esta normativa resultará en medidas disciplinarias determinadas por el BPD, que pueden incluir la congelación temporal o permanente de la cuenta, y la reversión de transacciones.</p>
    `,
    
    // Contenido actualizado y profesional para Acuerdo de Privacidad
    acuerdoDePrivacidad: `
        
        <strong class="text-lg font-semibold text-slate-800 mb-2 block">I. Compromiso de la Entidad</strong>
        <p>El Banco del Pincel Dorado (BPD) declara su firme compromiso con la máxima confidencialidad en el manejo de los datos operativos de sus Usuarios. La información es utilizada estrictamente para garantizar la funcionalidad, seguridad y estabilidad de este ecosistema académico-financiero.</p>

        <strong class="text-lg font-semibold text-slate-800 mt-6 mb-2 block">II. Datos Recopilados</strong>
        <p>El BPD únicamente registra y procesa la siguiente información operativa, esencial para el funcionamiento del sistema:</p>
        <ul class="list-disc list-inside ml-4 space-y-1 text-sm">
            <li><strong>Identificación:</strong> Nombre de Usuario y designación de Grupo Académico.</li>
            <li><strong>Datos Financieros:</strong> Saldo actual de Pinceles (ℙ), el historial completo de Transacciones y la Clave P2P (gestionada de forma segura).</li>
            <li><strong>Metadatos:</strong> Registros automáticos de la fecha, hora y tipo de cada operación.</li>
        </ul>
        <p class="mt-2 font-semibold">El BPD garantiza que no recopila ni almacena, bajo ninguna circunstancia, datos personales sensibles externos.</p>

        <strong class="text-lg font-semibold text-slate-800 mt-6 mb-2 block">III. Propósito de la Información</strong>
        <p>El procesamiento de la información tiene por objeto exclusivo:</p>
        <ul class="list-disc list-inside ml-4 space-y-1 text-sm">
            <li>Asegurar la correcta y segura ejecución de todas las operaciones financieras.</li>
            <li>Realizar los cálculos precisos de saldos, rendimientos de inversión e intereses crediticios.</li>
            <li>Mantener el monitoreo continuo de la estabilidad económica y la detección preventiva de cualquier patrón de actividad anómala.</li>
            <li>Garantizar el cumplimiento de las normativas internas del BPD.</li>
        </ul>

        <strong class="text-lg font-semibold text-slate-800 mt-6 mb-2 block">IV. Confidencialidad y Uso</strong>
        <p>El Usuario, al interactuar con el BPD, otorga su consentimiento para el procesamiento de sus datos de transacción. La información es de acceso altamente restringido y el BPD garantiza que no compartirá, venderá ni distribuirá datos de Usuarios a ninguna entidad ajena al entorno académico.</p>
    `
};

function escapeHTML(str) {
    if (typeof str !== 'string') return str;
    return str.replace(/'/g, "\\'").replace(/"/g, "&quot;");
}

window.AppUI = AppUI;
window.AppFormat = AppFormat;
window.AppTransacciones = AppTransacciones;
window.AppContent = AppContent;

window.AppUI.handleEditBono = AppUI.handleEditBono;
window.AppTransacciones.eliminarBono = AppTransacciones.eliminarBono;
window.AppUI.handleEditItem = AppUI.handleEditItem;
window.AppUI.handleDeleteConfirmation = AppUI.handleDeleteConfirmation;
window.AppUI.cancelDeleteConfirmation = AppUI.cancelDeleteConfirmation;
window.AppTransacciones.eliminarItem = AppTransacciones.eliminarItem;
window.AppTransacciones.toggleStoreManual = AppTransacciones.toggleStoreManual;
window.AppTransacciones.iniciarCompra = AppTransacciones.iniciarCompra;
window.AppTransacciones.iniciarCanje = AppTransacciones.iniciarCanje;
window.AppUI.showLegalModal = AppUI.showLegalModal; 

window.onload = function() {
    AppUI.init();
    
    // Inyección de estilos de slider (para cross-browser progress fill)
    const setupSliderFill = () => {
        const inputs = document.querySelectorAll('input[type="range"]');
        inputs.forEach(input => {
            const update = () => AppUI.updateSliderFill(input);
            update();
            input.addEventListener('input', update);
        });
    };
    
    // Inicializar carrusel hero
    AppUI.goToHeroSlide(0); 

    // Inicializar listeners del carrusel después de un breve retraso para asegurar que JS y HTML estén listos
    setTimeout(() => {
        setupSliderFill();
        document.getElementById('transacciones-combinadas-modal').addEventListener('click', (e) => {
             // Listener para tabs dentro del modal combinado
             if (e.target.classList.contains('tab-btn') && e.target.closest('#transacciones-combinadas-modal')) {
                 AppUI.changeTransaccionesCombinadasTab(e.target.dataset.tab);
             }
             // Listener para cerrar en backdrop
             if (e.target.id === 'transacciones-combinadas-modal') {
                 AppUI.hideModal('transacciones-combinadas-modal');
             }
        });

        // Asegurar que el relleno de los sliders se aplica al abrir el modal
        document.getElementById('transacciones-combinadas-modal').addEventListener('click', (e) => {
            if (e.target.classList.contains('tab-btn')) {
                 setTimeout(setupSliderFill, 10);
            }
        });
        
    }, 500); 

};
