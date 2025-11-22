// --- CONFIGURACIÓN ---
const AppConfig = {
    // Asegúrate de que esta URL sea la correcta del despliegue de tu Apps Script
    // Nota: Se usa una URL diferente para las transacciones múltiples de ADMIN
    API_URL: 'https://script.google.com/macros/s/AKfycbyhPHZuRmC7_t9z20W4h-VPqVFk0z6qKFG_W-YXMgnth4BMRgi8ibAfjeOtIeR5OrFPXw/exec',
    TRANSACCION_API_URL: 'https://script.google.com/macros/s/AKfycbyhPHZuRmC7_t9z20W4h-VPqVFk0z6qKFG_W-YXMgnth4BMRgi8ibAfjeOtIeR5OrFPXw/exec', // Usar URL correcta para Admin
    CLAVE_MAESTRA: 'PinceladasM25-26',
    SPREADSHEET_URL: 'https://docs.google.com/spreadsheets/d/1GArB7I19uGum6awiRN6qK8HtmTWGcaPGWhOzGCdhbcs/edit?usp=sharing',
    INITIAL_RETRY_DELAY: 1000,
    MAX_RETRY_DELAY: 30000,
    MAX_RETRIES: 5,
    CACHE_DURATION: 300000,
    
    APP_STATUS: 'RC', 
    APP_VERSION: 'v32.4', 
    
    IMPUESTO_P2P_TASA: 0.01,        
    IMPUESTO_DEPOSITO_TASA: 0.0,    
    IMPUESTO_DEPOSITO_ADMIN: 0.05,
    TASA_ITBIS: 0.18,               
    
    PRESTAMO_TASA_BASE: 0.015,       
    PRESTAMO_BONUS_POR_DIA: 0.0003,  
    PRESTAMO_MIN_MONTO: 10000,
    PRESTAMO_MAX_MONTO: 150000,
    PRESTAMO_MIN_PLAZO_DIAS: 3,
    PRESTAMO_MAX_PLAZO_DIAS: 21,
    
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
    
    // ===================================================================
    // FIX: Variables de estado para preservar la selección de Transacción Múltiple
    // ===================================================================
    transaccionSelectedGroups: new Set(), // Almacena nombres de grupos seleccionados
    transaccionSelectedUsers: new Set(),  // Almacena nombres de usuarios seleccionados
    transaccionSelectAll: {},             // Almacena el estado del botón "Todos/Ninguno" por grupo
    // ===================================================================
    
    lastKnownGroupsHash: '',
    
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
    
    heroSlideIndex: 0,
    heroSlideCount: 6, 
};

// --- AUTENTICACIÓN ---
const AppAuth = {
    verificarClave: function() {
        const claveInput = document.getElementById('clave-input');
        
        // CORRECCIÓN: Eliminar las clases de error/shake previas
        claveInput.classList.remove('shake', 'border-red-500');

        if (claveInput.value === AppConfig.CLAVE_MAESTRA) {
            AppUI.hideModal('gestion-modal');
            AppUI.showTransaccionModal('transaccion'); 
            claveInput.value = '';
            
        } else {
            // APLICAR NUEVA CLASE: .shake ahora aplica solo el efecto visual de color
            claveInput.classList.add('shake'); 
            // CLASE ELIMINADA: Ya no se añade border-red-500 para dejar que .shake (dorado) haga el trabajo
            
            claveInput.focus();
            setTimeout(() => {
                // Eliminar el efecto visual después de un breve periodo
                claveInput.classList.remove('shake');
            }, 1000); // 1 segundo de duración del efecto visual
        }
    }
};

// --- NÚMEROS Y FORMATO ---
const AppFormat = {
    formatNumber: (num) => new Intl.NumberFormat('es-DO', { maximumFractionDigits: 0 }).format(Math.round(num)),
    toLocalISOString: (date) => {
        const pad = (num) => String(num).padStart(2, '0');
        const d = new Date(date);
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    },
    formatDateSimple: (date) => {
        if (!date) return 'N/A';
        const d = new Date(date);
        const pad = (num) => String(num).padStart(2, '0');
        return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
    },
    calculateLoanRate: (days) => Math.min(AppConfig.PRESTAMO_TASA_BASE + (days * AppConfig.PRESTAMO_BONUS_POR_DIA), 1.0),
    calculateDepositRate: (days) => Math.min(AppConfig.DEPOSITO_TASA_BASE + (days * AppConfig.DEPOSITO_BONUS_POR_DIA), 1.0)
};

// --- MANEJO DE DATOS ---
const AppData = {
    
    isCacheValid: () => AppState.cachedData && AppState.lastCacheTime && (Date.now() - AppState.lastCacheTime < AppConfig.CACHE_DURATION),

    cargarDatos: async function(isRetry = false) {
        if (AppState.actualizacionEnProceso && !isRetry) return;
        AppState.actualizacionEnProceso = true;

        if (!isRetry) {
            AppState.retryCount = 0;
            AppState.retryDelay = AppConfig.INITIAL_RETRY_DELAY;
        }

        // Se mantiene el indicador de estado si la carga no es la inicial
        if (!AppState.datosActuales) {
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
                
                const url = `${AppConfig.API_URL}?action=getDatosBase&cacheBuster=${new Date().getTime()}`;
                
                // BLINDAJE 1: Usar función segura que maneja errores de Fetch/HTML
                const data = await AppTransacciones.fetchWithExponentialBackoff(url, { method: 'GET', cache: 'no-cache' });
                
                // CORRECCIÓN: Si data.success es falso O data.message no existe, lanza un error claro.
                if (!data || data.error || data.success === false) {
                    const errorMessage = data && data.message ? data.message : 'El servidor no devolvió un mensaje de error específico. (Backend no implementado o error interno)';
                    throw new Error(`Error de API: ${errorMessage}`);
                }
                
                AppData.procesarYMostrarDatos(data);
                AppState.cachedData = data;
                AppState.lastCacheTime = Date.now();
                AppState.retryCount = 0;
                AppUI.setConnectionStatus('ok', 'Conectado');
            }

        } catch (error) {
            console.error("Error al cargar datos:", error.message);
            AppUI.setConnectionStatus('error', `Error de conexión: ${error.message}`);
            
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
            // Se llama a hideLoading siempre en finally para asegurar la transición de UI
            AppUI.hideLoading(); 
        }
    },

    detectarCambios: function(nuevosDatos) {
        // Lógica de detección de cambios (mantenida simple)
    },
    
    procesarYMostrarDatos: function(data) {
        // 1. Datos Base
        AppState.datosAdicionales.saldoTesoreria = data.saldoTesoreria || 0;
        AppState.datosAdicionales.prestamosActivos = data.prestamosActivos || [];
        AppState.datosAdicionales.depositosActivos = data.depositosActivos || [];
        
        // 2. Datos Unificados de Bonos y Tienda
        AppState.bonos.disponibles = data.bonosDisponibles || []; 
        AppState.tienda.items = data.tiendaStock || {};
        AppState.tienda.storeManualStatus = data.storeManualStatus || 'auto';
        
        // 3. Procesar Usuarios y Grupos
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

        AppState.datosActuales = activeGroups; // Almacenar antes de renderizar
        
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
        
        // 4. Actualización de Modales
        const isBonoModalOpen = document.getElementById('bonos-modal').classList.contains('opacity-0') === false;
        const isTiendaModalOpen = document.getElementById('tienda-modal').classList.contains('opacity-0') === false;
        const isTransaccionesCombinadasOpen = document.getElementById('transacciones-combinadas-modal').classList.contains('opacity-0') === false;
        const isAdminModalOpen = document.getElementById('transaccion-modal').classList.contains('opacity-0') === false;

        // Se usa una bandera para saber si el reporte de éxito está visible, lo cual no debe regenerar los formularios
        const isReportVisible = document.getElementById('transacciones-combinadas-report-container')?.classList.contains('hidden') === false ||
                                document.getElementById('bono-report-container')?.classList.contains('hidden') === false ||
                                document.getElementById('tienda-report-container')?.classList.contains('hidden') === false ||
                                document.getElementById('transaccion-admin-report-container')?.classList.contains('hidden') === false;
        
        // Si los modales están abiertos y el reporte NO está visible, forzar el renderizado de la lista
        if (isBonoModalOpen && !isReportVisible) AppUI.populateBonoList();
        if (isTiendaModalOpen && !isReportVisible) AppUI.renderTiendaItems();
        
        if (isTransaccionesCombinadasOpen) {
             AppUI.updatePrestamoCalculadora();
             AppUI.updateDepositoCalculadora();
             AppUI.updateP2PCalculoImpuesto();
        }
        
        // Actualización de Modales de Admin
        if (isAdminModalOpen && !isReportVisible) {
            const activeTab = document.querySelector('#transaccion-modal .tab-btn.active-tab');
            const tabId = activeTab ? activeTab.dataset.tab : '';
            
            if (tabId === 'transaccion') {
                 // FIX: Esto es CRÍTICO, llama a las funciones de renderizado que PRESERVAN el estado
                 AppUI.populateGruposTransaccion();
                 AppUI.populateUsuariosTransaccion();
            } else if (tabId === 'bonos_admin') {
                AppUI.populateBonoAdminList();
            } else if (tabId === 'tienda_gestion' || tabId === 'tienda_inventario') {
                AppUI.populateTiendaAdminList();
                AppUI.updateTiendaAdminStatusLabel();
            } 
        }

    }
};

// --- MANEJO DE LA INTERFAZ (UI) ---
const AppUI = {
    
    init: function() {
        // Listeners Modales de Gestión (Clave)
        document.getElementById('gestion-btn').addEventListener('click', () => AppUI.showModal('gestion-modal'));
        document.getElementById('modal-submit').addEventListener('click', AppAuth.verificarClave);
        
        // LISTENERS: MODAL COMBINADO DE TRANSACCIONES
        document.getElementById('transacciones-btn').addEventListener('click', () => AppUI.showTransaccionesCombinadasModal('p2p_transfer'));
        document.getElementById('transacciones-combinadas-modal-close').addEventListener('click', () => AppUI.hideModal('transacciones-combinadas-modal'));

        document.querySelectorAll('#transacciones-combinadas-modal .tab-btn').forEach(button => {
            button.addEventListener('click', (e) => {
                AppUI.changeTransaccionesCombinadasTab(e.target.dataset.tab);
            });
        });
        
        // Listeners para Hero Carousel
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

        // Listeners P2P/Bonos/Tienda
        document.getElementById('modal-cancel').addEventListener('click', () => AppUI.hideModal('gestion-modal'));
        document.getElementById('transaccion-modal-close-btn').addEventListener('click', () => AppUI.hideModal('transaccion-modal'));
        
        const bonosBtn = document.getElementById('bonos-btn');
        if (bonosBtn) {
            bonosBtn.addEventListener('click', () => AppUI.showBonoModal());
        }
        
        document.getElementById('bonos-modal-close').addEventListener('click', () => AppUI.hideModal('bonos-modal'));
        
        const tiendaBtn = document.getElementById('tienda-btn');
        if (tiendaBtn) {
            tiendaBtn.addEventListener('click', () => AppUI.showTiendaModal());
        }
        
        document.getElementById('tienda-modal-close').addEventListener('click', () => AppUI.hideModal('tienda-modal'));
        
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
        
        // Lógica para cerrar la sidebar en móvil
        document.getElementById('sidebar-overlay').addEventListener('click', AppUI.toggleSidebar);
        document.getElementById('close-sidebar-btn').addEventListener('click', AppUI.toggleSidebar);
        
        // Inicia la carga de datos
        AppData.cargarDatos(false);
        setInterval(() => AppData.cargarDatos(false), 30000); 
        AppUI.updateCountdown();
        setInterval(AppUI.updateCountdown, 1000);
    },
    
    // MODIFICADA: Implementación de la corrección del "salto" de carga.
    hideLoading: function() {
        const loadingOverlay = document.getElementById('loading-overlay');
        const appContainer = document.getElementById('app-container');

        if (loadingOverlay.classList.contains('opacity-0')) {
             // Ya está oculto, solo asegurarse de que el contenedor principal sea visible
             appContainer.classList.remove('hidden', 'opacity-0');
             return;
        }

        // 1. Iniciar transición (fade-out del overlay)
        loadingOverlay.classList.add('opacity-0');
        
        // 2. Mostrar contenedor principal (fade-in)
        appContainer.classList.remove('hidden');
        // Usar setTimeout para aplicar opacity-100 después de que la clase 'hidden' se haya eliminado, 
        // permitiendo que la transición CSS de opacity-0 a opacity-100 funcione.
        setTimeout(() => {
            appContainer.classList.remove('opacity-0');
        }, 10); 


        // 3. Ocultar físicamente el overlay después de la transición (500ms)
        setTimeout(() => {
            loadingOverlay.style.display = 'none';
            loadingOverlay.classList.add('pointer-events-none');
        }, 500); 
    },

    // --- Tarjeta de Alumno Rediseñada (Estilo Bancario Compacto) ---
    showStudentModal: function(nombreGrupo, nombreUsuario, rank) {
        const student = AppState.datosAdicionales.allStudents.find(u => u.nombre === nombreUsuario);
        
        if (!student) return;

        const modalContent = document.getElementById('student-modal-content');
        const totalPinceles = student.pinceles || 0;
        
        const prestamoActivo = AppState.datosAdicionales.prestamosActivos.find(p => p.alumno === student.nombre);
        const depositoActivo = AppState.datosAdicionales.depositosActivos.find(d => d.alumno === student.nombre);

        // Calcular Capital Invertido
        const totalInvertido = AppState.datosAdicionales.depositosActivos
            .filter(deposito => (deposito.alumno || '').trim() === (student.nombre || '').trim() && deposito.estado.startsWith('Activo'))
            .reduce((sum, deposito) => sum + (Number(deposito.monto) || 0), 0);

        // Generar Iniciales para el Avatar
        const iniciales = student.nombre.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();

        // Badge de Estado de Cuenta
        const isSolvente = totalPinceles >= 0;
        const estadoCuentaBadge = isSolvente 
            ? `<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">Solvente</span>`
            : `<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">En Descubierto</span>`;

        // Generar HTML de productos activos (Préstamos/Depósitos)
        let productsHtml = '';
        if (prestamoActivo) {
             productsHtml += `
                <div class="flex items-center p-3 bg-red-50 rounded-lg border border-red-100 mb-2 shadow-sm">
                    <div class="p-2 bg-white rounded-full text-red-500 mr-3 shadow-sm border border-red-100">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    </div>
                    <div>
                        <p class="text-sm font-bold text-red-700">Préstamo Activo</p>
                        <p class="text-xs text-red-600">Monto pendiente de pago</p>
                    </div>
                </div>`;
        }
        if (depositoActivo) {
            const vencimiento = new Date(depositoActivo.vencimiento);
            const fechaString = AppFormat.formatDateSimple(vencimiento);
            productsHtml += `
                <div class="flex items-center p-3 bg-emerald-50 rounded-lg border border-emerald-100 mb-2 shadow-sm">
                    <div class="p-2 bg-white rounded-full text-emerald-600 mr-3 shadow-sm border border-emerald-100">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>
                    </div>
                    <div>
                        <p class="text-sm font-bold text-emerald-700">Inversión Activa</p>
                        <p class="text-xs text-emerald-600">Vence: ${fechaString}</p>
                    </div>
                </div>`;
        }


        modalContent.innerHTML = `
            <div class="personal-student-card bg-white overflow-hidden relative rounded-xl">
                <!-- Header Decorativo (Background) -->
                <div class="h-24 bg-gradient-to-r from-amber-500 to-amber-600 relative">
                    <button onclick="AppUI.hideModal('student-modal')" class="modal-close-btn absolute top-2 right-2 text-white/80 hover:text-white text-2xl p-1 z-10 transition-colors">&times;</button>
                </div>
                
                <!-- Contenido Principal (Superpuesto) -->
                <div class="px-6 pb-6 -mt-12 relative">
                    <!-- Perfil y Avatar -->
                    <div class="flex flex-col items-center">
                        <div class="w-24 h-24 bg-white p-1 rounded-full shadow-lg">
                            <div class="w-full h-full bg-slate-100 rounded-full flex items-center justify-center text-2xl font-bold text-slate-400 border border-slate-200">
                                ${iniciales}
                            </div>
                        </div>
                        <h2 class="text-xl font-bold text-slate-800 mt-3 text-center leading-tight">${student.nombre}</h2>
                        <div class="mt-2 flex items-center space-x-2">
                            <span class="px-2 py-1 rounded-md bg-slate-100 text-xs font-semibold text-slate-600 uppercase tracking-wide border border-slate-200">${student.grupoNombre}</span>
                            ${estadoCuentaBadge}
                        </div>
                    </div>

                    <!-- Balance Hero -->
                    <div class="mt-6 text-center p-5 bg-slate-50 rounded-2xl border border-slate-200 shadow-inner">
                        <p class="text-xs text-slate-500 uppercase font-bold tracking-wider mb-1">Saldo Disponible</p>
                        <p class="text-4xl font-extrabold color-dorado-main tracking-tight">${AppFormat.formatNumber(totalPinceles)} ℙ</p>
                    </div>

                    <!-- Stats Grid -->
                    <div class="grid grid-cols-2 gap-3 mt-4">
                        <div class="p-3 bg-white border border-slate-200 rounded-xl shadow-sm text-center">
                            <p class="text-xs text-slate-400 uppercase font-bold tracking-wide">Inversiones</p>
                            <p class="text-lg font-bold text-slate-700">${AppFormat.formatNumber(totalInvertido)} ℙ</p>
                        </div>
                        <div class="p-3 bg-white border border-slate-200 rounded-xl shadow-sm text-center">
                            <p class="text-xs text-slate-400 uppercase font-bold tracking-wide">Ranking Global</p>
                            <p class="text-lg font-bold text-slate-700">#${rank}</p>
                        </div>
                    </div>
                    
                    <!-- Productos Activos -->
                    ${productsHtml ? `<div class="mt-4 space-y-2">${productsHtml}</div>` : ''}

                    <!-- Footer Simple (Sin ID) -->
                    <div class="mt-6 text-center border-t border-slate-100 pt-4">
                         <p class="text-xs text-slate-400 font-medium">Banco del Pincel Dorado</p>
                    </div>
                </div>
            </div>
        `;
        AppUI.showModal('student-modal');
    },
    
    // --- FUNCIÓN DE INFORME DE CONFIRMACIÓN (CORREGIDA) ---
    showSuccessSummary: function(modalId, reportData, reportType) {
        const modal = document.getElementById(modalId);
        if (!modal) return;
        
        // CORRECCIÓN: Lógica específica para IDs de contenedores que no siguen el patrón estándar
        let formContainerId, reportContainerId;

        if (modalId === 'bonos-modal') {
            // FIX: bonos-modal (plural) usa contenedores bono- (singular) en el HTML
            formContainerId = 'bono-main-step-container';
            reportContainerId = 'bono-report-container';
        } else if (modalId === 'tienda-modal') {
             formContainerId = 'tienda-main-step-container';
             reportContainerId = 'tienda-report-container';
        } else if (modalId === 'transacciones-combinadas-modal') {
            formContainerId = 'transacciones-combinadas-step-container';
            reportContainerId = 'transacciones-combinadas-report-container';
        } else if (modalId === 'transaccion-modal') {
            formContainerId = 'transaccion-admin-step-container';
            reportContainerId = 'transaccion-admin-report-container';
        } else {
            // Default para otros que sigan la regla: modalId -> prefix
            formContainerId = modalId.replace('-modal', '-main-step-container');
            reportContainerId = modalId.replace('-modal', '-report-container');
        }

        const formContainer = document.getElementById(formContainerId);
        const reportContainer = document.getElementById(reportContainerId);
        
        if (!formContainer || !reportContainer) {
            console.error(`Contenedores no encontrados para ${modalId}: form=${formContainerId}, report=${reportContainerId}`);
            AppUI.hideModal(modalId);
            return;
        }

        formContainer.classList.add('hidden');
        reportContainer.classList.remove('hidden');

        let title, detailsHtml = '';

        const formatValue = (value, unit = 'ℙ', color = 'text-slate-900') => `
            <p class="text-lg font-bold ${color}">${AppFormat.formatNumber(value)} ${unit}</p>
        `;
        
        const detailRow = (label, valueHtml) => `
            <div class="flex justify-between items-center py-2 border-b border-slate-100">
                <span class="text-sm font-medium text-slate-600">${label}</span>
                ${valueHtml}
            </div>
        `;
        
        const primaryStat = (label, valueHtml, colorClass = 'bg-amber-100') => `
            <div class="${colorClass} p-4 rounded-lg text-center shadow-inner">
                <p class="text-xs font-medium text-slate-700 uppercase">${label}</p>
                ${valueHtml}
            </div>
        `;

        switch (reportType) {
            case 'p2p':
                title = 'Transferencia de Fondos Exitosa';
                const totalDebitado = reportData.cantidad_enviada + reportData.impuesto_cobrado;
                detailsHtml = `
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                        ${primaryStat('Remitente', `<p class="text-xl font-bold text-slate-800">${reportData.remitente}</p>`)}
                        ${primaryStat('Destinatario', `<p class="text-xl font-bold color-dorado-main">${reportData.destino}</p>`, 'bg-green-50')}
                    </div>
                    ${detailRow('Monto Enviado (Neto)', formatValue(reportData.cantidad_enviada))}
                    ${detailRow('Comisión P2P', formatValue(reportData.impuesto_cobrado, 'ℙ', 'text-red-500'))}
                    <div class="report-divider"></div>
                    ${detailRow('Total Debitado de tu Cuenta', formatValue(totalDebitado, 'ℙ', 'text-red-600'))}
                    <div class="report-divider"></div>
                    ${primaryStat('Nuevo Saldo Restante', formatValue(reportData.saldo_restante_origen), 'bg-slate-50')}
                `;
                break;
            case 'prestamo':
                 title = 'Préstamo Solicitado y Aprobado';
                 const interesTotalP = reportData.total_a_pagar - reportData.monto_solicitado;
                 
                 detailsHtml = `
                    <div class="grid grid-cols-2 gap-4 mb-4">
                        ${primaryStat('Monto Recibido', formatValue(reportData.monto_solicitado), 'bg-green-50')}
                        ${primaryStat('Plazo (Días)', `<p class="text-2xl font-bold text-slate-800">${reportData.plazo_dias} Días</p>`, 'bg-slate-50')}
                    </div>
                    ${detailRow('Tasa de Interés', `<p class="text-lg font-bold text-slate-900">${reportData.tasa_final}%</p>`)}
                    ${detailRow('Intereses Totales', formatValue(interesTotalP))}
                    ${detailRow('Cuota Diaria (Aproximada)', formatValue(reportData.cuota_diaria))}
                    <div class="report-divider"></div>
                    ${detailRow('Total a Pagar (Capital + Interés)', formatValue(reportData.total_a_pagar, 'ℙ', 'text-red-600'))}
                    <div class="report-divider"></div>
                    ${primaryStat('Nuevo Saldo en Cuenta', formatValue(reportData.saldo_final), 'bg-slate-50')}
                `;
                break;
            case 'deposito':
                 title = 'Inversión Creada con Éxito';
                 const gananciaNeta = reportData.ganancia_neta;
                 detailsHtml = `
                    <div class="grid grid-cols-2 gap-4 mb-4">
                        ${primaryStat('Monto Invertido', formatValue(reportData.monto_depositado), 'bg-red-50')}
                        ${primaryStat('Plazo (Días)', `<p class="text-2xl font-bold text-slate-800">${reportData.plazo_dias} Días</p>`, 'bg-slate-50')}
                    </div>
                    ${detailRow('Tasa de Rendimiento', `<p class="text-lg font-bold text-slate-900">${reportData.tasa_final}%</p>`)}
                    ${detailRow('Ganancia Estimada', formatValue(gananciaNeta))}
                    <div class="report-divider"></div>
                    ${detailRow('Total a Recibir al Vencimiento', formatValue(reportData.total_a_recibir, 'ℙ', 'text-green-600'))}
                    <div class="report-divider"></div>
                    ${primaryStat('Nuevo Saldo en Cuenta', formatValue(reportData.saldo_final), 'bg-slate-50')}
                `;
                break;
            case 'bono':
                title = '¡Bono Canjeado con Éxito!';
                detailsHtml = `
                    ${primaryStat('Bono Canjeado', `<p class="text-xl font-bold text-slate-800">${reportData.bono_clave}</p>`)}
                    <div class="report-divider"></div>
                    ${detailRow('Recompensa Otorgada', formatValue(reportData.recompensa, 'ℙ', 'text-green-600'))}
                    <div class="report-divider"></div>
                    ${primaryStat('Tu Nuevo Saldo', formatValue(reportData.saldo_final), 'bg-slate-50')}
                `;
                break;
            case 'tienda':
                title = 'Compra de Artículo Exitosa';
                const costoBase = reportData.costo_base;
                const itbis = reportData.itbis;
                const costoTotalT = reportData.costo_total;

                detailsHtml = `
                    ${primaryStat('Artículo Comprado', `<p class="text-xl font-bold text-slate-800">${reportData.item_nombre}</p>`)}
                    <div class="report-divider"></div>
                    ${detailRow('Precio Base', formatValue(costoBase))}
                    ${detailRow(`ITBIS (${AppConfig.TASA_ITBIS * 100}%)`, formatValue(itbis, 'ℙ', 'text-red-500'))}
                    <div class="report-divider"></div>
                    ${detailRow('Total Debitado', formatValue(costoTotalT, 'ℙ', 'text-red-600'))}
                    <div class="report-divider"></div>
                    ${primaryStat('Nuevo Saldo Restante', formatValue(reportData.saldo_final), 'bg-slate-50')}
                `;
                break;
            case 'admin_multi':
                title = 'Transacción Múltiple Completada';
                const cantidadPorUser = reportData.cantidad_por_usuario;
                const esDeposito = cantidadPorUser > 0;
                
                let resumenAdmin = `
                    <div class="grid grid-cols-2 gap-4">
                        ${primaryStat('Cantidad por Alumno', formatValue(Math.abs(cantidadPorUser), 'ℙ', esDeposito ? 'text-green-600' : 'text-red-600'))}
                        ${primaryStat('Total Usuarios', `<p class="text-lg font-bold">${reportData.totalUsuariosAfectados} Usuarios</p>`, 'bg-slate-100')}
                    </div>
                    
                    ${detailRow('Transacciones Exitosas', `<p class="text-lg font-bold text-green-600">${reportData.exitos.length}</p>`)}
                    ${reportData.errores.length > 0 ? detailRow('Transacciones Fallidas', `<p class="text-lg font-bold text-red-600">${reportData.errores.length}</p>`) : ''}
                `;

                if (esDeposito) {
                    const costoBruto = reportData.costoTotalBruto;
                    const comision = reportData.comisionTotal;
                    resumenAdmin += `
                        ${detailRow('Costo Bruto a Tesorería', formatValue(costoBruto))}
                        ${detailRow('Comisión Tesorería', formatValue(comision))}
                        <div class="report-divider"></div>
                        ${detailRow('Impacto Neto Tesorería', formatValue(costoBruto - comision, 'ℙ', 'text-red-600'))}
                    `;
                } else {
                    resumenAdmin += detailRow('Ingreso Total a Tesorería', formatValue(reportData.ingresoTotal, 'ℙ', 'text-green-600'));
                }

                detailsHtml = resumenAdmin;
                
                break;

            default:
                title = 'Proceso Completado';
                detailsHtml = `<p class="text-center text-slate-600">La operación se realizó con éxito.</p>`;
        }
        
        // FIX: ID Único para el botón para evitar colisiones de eventos si hay otros modales "activos" pero ocultos
        const confirmBtnId = `report-confirm-btn-${modalId}`;

        reportContainer.innerHTML = `
            <div class="confirmation-report-card">
                <div class="flex justify-center items-center mb-4">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="#10b981" class="w-12 h-12 mr-3">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                    </svg>
                    <h2 class="text-2xl font-bold text-green-600">${title}</h2>
                </div>
                
                <div class="bg-slate-50 p-4 rounded-lg shadow-inner mb-4">
                    ${detailsHtml}
                </div>

                <div class="flex justify-center mt-6">
                    <button id="${confirmBtnId}" class="px-6 py-2 bg-white border border-amber-600 text-amber-600 text-sm font-medium rounded-lg hover:bg-amber-50 transition-colors shadow-sm">
                        Confirmar y Cerrar
                    </button>
                </div>
            </div>
        `;
        
        // FIX: Event Listener adjunto al ID único generado dinámicamente
        const confirmBtn = document.getElementById(confirmBtnId);
        if (confirmBtn) {
            confirmBtn.addEventListener('click', () => {
                 // Ocultar reporte y mostrar el formulario (limpio)
                 reportContainer.classList.add('hidden');
                 formContainer.classList.remove('hidden');
                 AppUI.hideModal(modalId);
                 
                 // Esto asegura que la pestaña activa se limpie completamente
                 if (modalId === 'transacciones-combinadas-modal') {
                     const activeTab = document.querySelector('#transacciones-combinadas-modal .tab-btn.active-tab');
                     if (activeTab) AppUI.changeTransaccionesCombinadasTab(activeTab.dataset.tab);
                 } else if (modalId === 'transaccion-modal') {
                     const activeTab = document.querySelector('#transaccion-modal .tab-btn.active-tab');
                     if (activeTab) AppUI.changeAdminTab(activeTab.dataset.tab);
                 }
            });
        } else {
            console.error("Error fatal: No se pudo adjuntar evento al botón de confirmación.");
        }
    },
    
    // --- FUNCIONES DE MODALES FLEXIBLES (PRESTAMOS Y DEPÓSITOS) ---
    
    showTransaccionesCombinadasModal: function(initialTab = 'p2p_transfer') {
        if (!AppState.datosActuales) return;
        
        document.getElementById('transacciones-combinadas-report-container').classList.add('hidden');
        document.getElementById('transacciones-combinadas-step-container').classList.remove('hidden');

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

        if (tabId === 'p2p_transfer') {
            AppUI.resetSearchInput('p2pOrigen');
            AppUI.resetSearchInput('p2pDestino');
            document.getElementById('p2p-clave').value = "";
            document.getElementById('p2p-cantidad').value = "";
            AppUI.updateP2PCalculoImpuesto();
            
            // CORRECCIÓN: Limpiar el efecto visual de la clave al cambiar de pestaña
            document.getElementById('p2p-clave').classList.remove('shake'); 
            
            document.getElementById('p2p-clave').focus();
        } else if (tabId === 'prestamo_flex') {
            AppUI.resetFlexibleForm('prestamo');
            AppUI.updatePrestamoCalculadora();
        } else if (tabId === 'deposito_flex') {
            AppUI.resetFlexibleForm('deposito');
            AppUI.updateDepositoCalculadora();
        }
        
        document.getElementById('transacciones-combinadas-status-msg').textContent = "";
        document.getElementById('transacciones-combinadas-report-container').classList.add('hidden');
        document.getElementById('transacciones-combinadas-step-container').classList.remove('hidden');
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
        
        if (!montoInput || !plazoInput) return;

        AppUI.updateSliderFill(montoInput);
        AppUI.updateSliderFill(plazoInput);

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
            document.getElementById('prestamo-elegibilidad-msg').textContent = `Monto entre ${AppFormat.formatNumber(minMonto)} ℙ y ${AppFormat.formatNumber(maxMonto)} ℙ.`;
            btn.disabled = true;
            return;
        }

        // 2. Cálculo de la Tasa
        const tasaDecimal = AppFormat.calculateLoanRate(plazo);
        const interesTotal = monto * tasaDecimal;
        const totalAPagar = Math.ceil(monto + interesTotal);
        const cuotaDiaria = Math.ceil(totalAPagar / plazo);
        
        tasaDisplay.textContent = `${(tasaDecimal * 100).toFixed(2)}%`; 
        totalPagarDisplay.textContent = `${AppFormat.formatNumber(totalAPagar)} ℙ`;
        cuotaDiariaDisplay.textContent = `${AppFormat.formatNumber(cuotaDiaria)} ℙ`;
        document.getElementById('prestamo-elegibilidad-msg').textContent = 'Defina los parámetros para evaluar elegibilidad.';
        
        // 3. Validaciones de Elegibilidad (Alumno)
        if (!student) {
            AppTransacciones.setEligibilityState(btn, document.getElementById('prestamo-elegibilidad-msg'), false, 'Busque su nombre para validar elegibilidad.', true);
            return;
        }
        
        const elegibilidad = AppTransacciones.checkLoanEligibility(student, monto);
        AppTransacciones.setEligibilityState(btn, document.getElementById('prestamo-elegibilidad-msg'), elegibilidad.isEligible, elegibilidad.message);
    },

    updateDepositoCalculadora: function() {
        const montoInput = document.getElementById('deposito-monto-input');
        const plazoInput = document.getElementById('deposito-plazo-input');
        const plazoDisplay = document.getElementById('deposito-plazo-display');
        const tasaDisplay = document.getElementById('deposito-tasa-display');
        const gananciaDisplay = document.getElementById('deposito-ganancia-display');
        const totalRecibirDisplay = document.getElementById('deposito-total-recibir-display');
        const btn = document.getElementById('deposito-submit-btn');
        
        if (!montoInput || !plazoInput) return;

        AppUI.updateSliderFill(montoInput);
        AppUI.updateSliderFill(plazoInput);
        
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
            document.getElementById('deposito-elegibilidad-msg').textContent = `Monto mínimo: ${AppFormat.formatNumber(minMonto)} ℙ. Plazo: 7-30 días.`;
            btn.disabled = true;
            return;
        }

        // 2. Cálculo de la Tasa
        const tasaDecimal = AppFormat.calculateDepositRate(plazo);
        const interesBruto = monto * tasaDecimal;
        const totalARecibir = Math.ceil(monto + interesBruto);
        
        tasaDisplay.textContent = `${(tasaDecimal * 100).toFixed(3)}%`; 
        gananciaDisplay.textContent = `${AppFormat.formatNumber(Math.ceil(interesBruto))} ℙ`;
        totalRecibirDisplay.textContent = `${AppFormat.formatNumber(totalARecibir)} ℙ`;
        document.getElementById('deposito-elegibilidad-msg').textContent = 'Defina los parámetros para evaluar elegibilidad.';

        
        // 3. Validaciones de Elegibilidad (Alumno)
        if (!student) {
            AppTransacciones.setEligibilityState(btn, document.getElementById('deposito-elegibilidad-msg'), false, 'Busque su nombre para validar elegibilidad.', true);
            return;
        }

        const elegibilidad = AppTransacciones.checkDepositEligibility(student, monto);
        AppTransacciones.setEligibilityState(btn, document.getElementById('deposito-elegibilidad-msg'), elegibilidad.isEligible, elegibilidad.message);
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
    
    showLoading: function() {
        document.getElementById('loading-overlay').classList.remove('opacity-0', 'pointer-events-none');
    },

    // La lógica de hideLoading se sobrescribió arriba para evitar el salto inicial

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
        
        // FIX: Mostrar overlay de sidebar si la sidebar está abierta en móvil
        if (modalId === 'transaccion-modal' || modalId === 'transacciones-combinadas-modal' || modalId === 'bonos-modal' || modalId === 'tienda-modal') {
             if (AppState.isSidebarOpen) {
                 AppUI.toggleSidebar();
             }
        }
        
        // CORRECCIÓN: Limpiar clase .shake al abrir el modal de gestión para resetear el estado
        if (modalId === 'gestion-modal') {
             document.getElementById('clave-input').classList.remove('shake');
        }
    },

    hideModal: function(modalId) {
        const modal = document.getElementById(modalId);
        if (!modal) return;
        modal.classList.add('opacity-0', 'pointer-events-none');
        modal.querySelector('[class*="transform"]').classList.add('scale-95');

        if (modalId === 'transaccion-modal') {
            document.getElementById('transaccion-admin-report-container').classList.add('hidden');
            document.getElementById('transaccion-admin-step-container').classList.remove('hidden');
            
            document.getElementById('transaccion-lista-grupos-container').innerHTML = '';
            document.getElementById('transaccion-lista-usuarios-container').innerHTML = '';
            document.getElementById('transaccion-cantidad-input').value = "";
            document.getElementById('transaccion-calculo-impuesto').textContent = ""; 
            AppState.transaccionSelectAll = {}; 
            // FIX: Limpiar el nuevo estado de transacciones al cerrar el modal
            AppState.transaccionSelectedGroups.clear();
            AppState.transaccionSelectedUsers.clear();
            
            AppTransacciones.setLoadingState(document.getElementById('transaccion-submit-btn'), document.getElementById('transaccion-btn-text'), false, 'Realizar Transacción');
            AppUI.clearBonoAdminForm();
            document.getElementById('bono-admin-status-msg').textContent = "";
            AppUI.clearTiendaAdminForm();
            document.getElementById('tienda-admin-status-msg').textContent = "";
        }
        
        if (modalId === 'transacciones-combinadas-modal') {
            document.getElementById('transacciones-combinadas-report-container').classList.add('hidden');
            document.getElementById('transacciones-combinadas-step-container').classList.remove('hidden');
            
            AppUI.resetSearchInput('p2pOrigen');
            AppUI.resetSearchInput('p2pDestino');
            document.getElementById('p2p-clave').value = "";
            document.getElementById('p2p-cantidad').value = "";
            document.getElementById('p2p-calculo-impuesto').textContent = "";
            
            // CORRECCIÓN: Limpiar la clase .shake en la clave P2P al cerrar el modal de transacciones
            document.getElementById('p2p-clave').classList.remove('shake'); 
            
            AppTransacciones.setLoadingState(document.getElementById('p2p-submit-btn'), document.getElementById('p2p-btn-text'), false, 'Realizar Transferencia');
            
            AppUI.resetFlexibleForm('prestamo');
            AppUI.resetFlexibleForm('deposito');
            document.getElementById('transacciones-combinadas-status-msg').textContent = "";
        }
        
        if (modalId === 'bonos-modal') {
            // FIX: Resetear estado de Bonos al cerrar, asegurando que el reporte se oculte
            document.getElementById('bono-report-container').classList.add('hidden');
            document.getElementById('bono-main-step-container').classList.remove('hidden');
            AppUI.showBonoStep1();
        }

        if (modalId === 'tienda-modal') {
            document.getElementById('tienda-report-container').classList.add('hidden');
            document.getElementById('tienda-main-step-container').classList.remove('hidden');
            AppUI.showTiendaStep1();
        }
        
        if (modalId === 'gestion-modal') {
             document.getElementById('clave-input').value = "";
             // CORRECCIÓN: Eliminar ambas clases para asegurar que se borre el estilo de alerta
             document.getElementById('clave-input').classList.remove('shake', 'border-red-500');
        }
        
        if (modalId === 'terminos-modal') {
             document.getElementById('terminos-modal-content').innerHTML = '<p class="text-center text-sm text-slate-500">Cargando el contrato de uso...</p>';
             document.getElementById('terminos-modal-title').textContent = 'Términos y Condiciones';
        }
    },
    
    resetFlexibleForm: function(type) {
        AppUI.resetSearchInput(`${type}Alumno`);
        document.getElementById(`${type}-clave-p2p`).value = "";
        
        // CORRECCIÓN: Limpiar la clase .shake de las claves P2P en préstamos/depósitos
        document.getElementById(`${type}-clave-p2p`).classList.remove('shake');

        const montoInput = document.getElementById(`${type}-monto-input`);
        const plazoInput = document.getElementById(`${type}-plazo-input`);
        
        if (montoInput) montoInput.value = type === 'prestamo' ? AppConfig.PRESTAMO_MIN_MONTO : AppConfig.DEPOSITO_MIN_MONTO;
        if (plazoInput) plazoInput.value = type === 'prestamo' ? AppConfig.PRESTAMO_MIN_PLAZO_DIAS : AppConfig.DEPOSITO_MIN_PLAZO_DIAS;

        document.getElementById(`${type}-status-msg`).textContent = "";
        
        const updateFunc = type === 'prestamo' ? AppUI.updatePrestamoCalculadora : AppUI.updateDepositoCalculadora;
        updateFunc(); 

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
        
        document.getElementById('transaccion-admin-report-container').classList.add('hidden');
        document.getElementById('transaccion-admin-step-container').classList.remove('hidden');
        
        if (tabId === 'transaccion') {
            if (AppState.datosActuales) {
                // FIX: Llama al renderizado que preserva el estado
                AppUI.populateGruposTransaccion();
                AppUI.populateUsuariosTransaccion();
            } else {
                document.getElementById('transaccion-lista-grupos-container').innerHTML = '<span class="text-sm text-slate-500 p-2">Cargando datos base...</span>';
                document.getElementById('transaccion-lista-usuarios-container').innerHTML = '<span class="text-sm text-slate-500 p-2">Espere...</span>';
            }
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

        input.dataset.resultsId = resultsId; 
        
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
            
            // CORRECCIÓN: Limpiar clase .shake de campos de búsqueda al escribir
            input.classList.remove('shake');
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
                 // CORRECCIÓN: Limpiar clase .shake de campos de búsqueda al hacer focus
                 input.classList.remove('shake');
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
        
        // La lógica para Cicla ha sido corregida
        const ciclaAllowed = ['p2pDestino', 'prestamoAlumno', 'depositoAlumno', 'bonoAlumno', 'tiendaAlumno']; 
        if (!ciclaAllowed.includes(stateKey)) {
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
                    
                    // CORRECCIÓN: Limpiar clase .shake del input al seleccionar un resultado
                    input.classList.remove('shake');
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
                // CORRECCIÓN: Limpiar clase .shake al resetear el input
                input.classList.remove('shake');
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

    updateP2PCalculoImpuesto: function() {
        const cantidadInput = document.getElementById('p2p-cantidad');
        const calculoMsg = document.getElementById('p2p-calculo-impuesto');
        const cantidad = parseInt(cantidadInput.value, 10);
        
        // CORRECCIÓN: Limpiar clase .shake del input de cantidad al escribir
        cantidadInput.classList.remove('shake');

        if (isNaN(cantidad) || cantidad <= 0) {
            calculoMsg.textContent = "";
            return;
        }

        const impuesto = Math.ceil(cantidad * AppConfig.IMPUESTO_P2P_TASA);
        const total = cantidad + impuesto;
        
        calculoMsg.innerHTML = `<span class="color-dorado-main">Impuesto (${AppConfig.IMPUESTO_P2P_TASA * 100}%): ${AppFormat.formatNumber(impuesto)} ℙ | Total a debitar: ${AppFormat.formatNumber(total)} ℙ</span>`;
    },

    showBonoModal: function() {
        AppUI.showBonoStep1();
        AppUI.showModal('bonos-modal');
        AppUI.populateBonoList(); 

        document.getElementById('bono-report-container').classList.add('hidden');
        document.getElementById('bono-main-step-container').classList.remove('hidden');
    },

    showBonoStep1: function() {
        document.getElementById('bono-step-form-container').classList.add('hidden');
        document.getElementById('bono-step-list-container').classList.remove('hidden');
        AppState.bonos.selectedBono = null;
        document.getElementById('bono-status-msg').textContent = "";
        document.getElementById('bono-step2-status-msg').textContent = "";
        document.getElementById('bono-clave-p2p-step2').value = "";
        
        // CORRECCIÓN: Limpiar clase .shake de la clave P2P de bonos al volver al paso 1
        document.getElementById('bono-clave-p2p-step2').classList.remove('shake');
        
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
        if (!AppState.datosActuales || AppState.bonos.disponibles === null) {
             const container = document.getElementById('bonos-lista-disponible');
             if(container) container.innerHTML = `<p class="text-sm text-slate-500 text-center col-span-4">Cargando bonos...</p>`;
             return;
        }

        if (document.getElementById('bonos-modal').classList.contains('opacity-0')) return;
        
        const container = document.getElementById('bonos-lista-disponible');
        const bonos = AppState.bonos.disponibles;
        
        const student = AppState.currentSearch.bonoAlumno.info || { grupoNombre: AppState.selectedGrupo };
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
            container.innerHTML = `<p class="text-sm text-slate-500 text-center col-span-4">No hay bonos disponibles en este momento.</p>`;
            return;
        }
        
        container.innerHTML = bonosActivos.map(bono => {
            const recompensa = AppFormat.formatNumber(bono.recompensa);
            const usosRestantes = bono.usos_totales === 9999 ? 'Ilimitado' : (bono.usos_totales - bono.usos_actuales);
            
            const isCanjeado = AppState.bonos.canjeados.includes(bono.clave);
            const cardClass = isCanjeado ? 'bg-slate-50 shadow-inner border-slate-200 opacity-60' : 'bg-white shadow-md border-amber-200 hover:shadow-lg transition-all';
            
            const badge = isCanjeado ? 
                `<span class="text-xs font-bold bg-slate-200 text-slate-700 rounded-full px-2 py-0.5">CANJEADO</span>` :
                `<span class="text-xs font-bold bg-green-100 text-green-700 rounded-full px-2 py-0.5">ACTIVO</span>`;

            const claveEscapada = escapeHTML(bono.clave);

            return `
                <div class="rounded-xl shadow-sm p-3 border compact-card ${cardClass}">
                    <div class="flex justify-between items-center mb-2"> 
                        <span class="text-xs font-medium text-slate-500 truncate">${bono.clave}</span>
                        ${badge}
                    </div>
                    <p class="text-sm font-bold text-slate-900 truncate mb-1 title-text">${bono.nombre}</p>
                    
                    <div class="flex justify-between items-baseline mt-2">
                        <span class="text-xs text-slate-500 small-text">Usos restantes: ${usosRestantes}</span>
                        <div class="flex items-center space-x-2">
                            <span class="text-xl font-extrabold color-dorado-main price-text">${recompensa} ℙ</span>
                            <button 
                                    data-bono-clave="${bono.clave}"
                                    onclick="AppTransacciones.iniciarCanje('${claveEscapada}')" 
                                    ${isCanjeado ? 'disabled' : ''}
                                    class="bono-buy-btn px-3 py-1 text-xs font-medium rounded-lg bg-white border border-amber-600 text-amber-600 hover:bg-amber-50 shadow-sm transition-colors buy-btn">Canjear</button>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    },
    
    populateBonoAdminList: function() {
        const tbody = document.getElementById('bonos-admin-lista');
        const bonos = AppState.bonos.disponibles || []; 

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
    
    showTiendaModal: function() {
        AppUI.showModal('tienda-modal'); 
        AppUI.showTiendaStep1();
        AppUI.renderTiendaItems(); 

        document.getElementById('tienda-report-container').classList.add('hidden');
        document.getElementById('tienda-main-step-container').classList.remove('hidden');

        AppUI.updateTiendaAdminStatusLabel();
    },

    showTiendaStep1: function() {
        document.getElementById('tienda-step-form-container').classList.add('hidden');
        document.getElementById('tienda-step-list-container').classList.remove('hidden');
        AppState.tienda.selectedItem = null;
        document.getElementById('tienda-status-msg').textContent = "";
        document.getElementById('tienda-step2-status-msg').textContent = "";
        document.getElementById('tienda-clave-p2p-step2').value = "";
        
        // CORRECCIÓN: Limpiar clase .shake de la clave P2P de tienda al volver al paso 1
        document.getElementById('tienda-clave-p2p-step2').classList.remove('shake');
        
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

        const costoFinal = Math.round(item.PrecioBase * (1 + AppConfig.TASA_ITBIS));
        const costoItbis = costoFinal - item.PrecioBase;

        document.getElementById('tienda-item-name-display').textContent = item.Nombre;
        document.getElementById('tienda-item-price-display').textContent = `Precio Base: ${AppFormat.formatNumber(item.PrecioBase)} ℙ`;
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
        // CORRECCIÓN: Manejar estado nulo o vacío de la tienda de manera segura
        if (!AppState.datosActuales || !AppState.tienda.items || Object.keys(AppState.tienda.items).length === 0) {
             const container = document.getElementById('tienda-items-container');
             if(container) container.innerHTML = `<p class="text-sm text-slate-500 text-center col-span-4">No hay artículos cargados en el inventario.</p>`;
             return;
        }

        if (document.getElementById('tienda-modal').classList.contains('opacity-0')) return;

        const container = document.getElementById('tienda-items-container');
        const items = AppState.tienda.items;
        
        const student = AppState.currentSearch.tiendaAlumno.info || { grupoNombre: AppState.selectedGrupo };
        const studentGroup = student.grupoNombre;
        const now = Date.now();

        const itemKeys = Object.keys(items);
        
        const itemsActivos = itemKeys.filter(itemId => {
            const item = items[itemId];
            if (item.Stock <= 0 && item.ItemID !== 'filantropo') return false;
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
            container.innerHTML = `<p class="text-sm text-slate-500 text-center col-span-4">No hay artículos disponibles para ti en este momento.</p>`;
            return;
        }

        let html = '';
        itemsActivos.sort((a,b) => items[a].PrecioBase - items[b].PrecioBase).forEach(itemId => {
            const item = items[itemId];
            const costoFinal = Math.round(item.PrecioBase * (1 + AppConfig.TASA_ITBIS));
            
            const itemIdEscapado = escapeHTML(item.ItemID);

            const cardClass = 'bg-white shadow-md border-amber-200 hover:shadow-lg transition-all';
            const stockText = item.Stock === 9999 ? 'Ilimitado' : `Stock: ${item.Stock}`;

            html += `
                <div class="rounded-xl shadow-sm p-3 border compact-card ${cardClass}">
                    <div class="flex justify-between items-center mb-2">
                        <span class="text-xs font-medium text-slate-500 truncate small-text">${item.Tipo} | ${stockText}</span>
                        <span class="text-xs font-bold bg-green-100 text-green-700 rounded-full px-2 py-0.5">ACTIVO</span>
                    </div>
                    <p class="text-sm font-bold text-slate-900 truncate title-text mb-1">
                        <span class="tooltip-container">
                            ${item.Nombre}
                            <div class="tooltip-text hidden md:block w-48">${item.Descripcion}</div>
                        </span>
                    </p>
                    
                    <div class="flex justify-between items-baseline mt-2">
                        <span class="text-xs text-slate-500 small-text">Base: ${AppFormat.formatNumber(item.PrecioBase)} ℙ (+ITBIS)</span>
                        
                        <div class="flex items-center space-x-2">
                            <span class="text-xl font-extrabold color-dorado-main price-text">${AppFormat.formatNumber(costoFinal)} ℙ</span>
                            
                            <button id="buy-btn-${itemId}" 
                                    data-item-id="${itemId}"
                                    onclick="AppTransacciones.iniciarCompra('${itemIdEscapado}')"
                                    class="tienda-buy-btn px-3 py-1 text-xs font-medium rounded-lg bg-white border border-amber-600 text-amber-600 hover:bg-amber-50 transition-colors shadow-sm buy-btn">
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

    updateTiendaButtonStates: function() {
         // Lógica para habilitar/deshabilitar botones de compra según el saldo del usuario seleccionado
         const student = AppState.currentSearch.tiendaAlumno.info;
         const buttons = document.querySelectorAll('.tienda-buy-btn');

         buttons.forEach(btn => {
             const itemId = btn.dataset.itemId;
             const item = AppState.tienda.items[itemId];
             if (!item) return;
             
             // Si la tienda no está abierta manualmente, desactivar botones visualmente
             if (!AppState.tienda.isStoreOpen) {
                 btn.disabled = true;
                 btn.classList.add('bg-slate-100', 'text-slate-500', 'border-slate-300', 'cursor-not-allowed');
                 btn.classList.remove('bg-white', 'text-amber-600', 'border-amber-600', 'hover:bg-amber-50');
                 return;
             }

             if (student) {
                  const costoFinal = Math.round(item.PrecioBase * (1 + AppConfig.TASA_ITBIS));
                  if (student.pinceles < costoFinal) {
                       btn.disabled = true;
                       btn.classList.add('opacity-50', 'cursor-not-allowed');
                       btn.title = "Saldo insuficiente";
                  } else {
                       btn.disabled = false;
                       btn.classList.remove('opacity-50', 'cursor-not-allowed');
                       btn.title = "";
                  }
             } else {
                  // Estado neutral si no hay usuario seleccionado (permitir click para iniciar flujo)
                  btn.disabled = false;
                  btn.classList.remove('opacity-50', 'cursor-not-allowed');
             }
         });
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
        const items = AppState.tienda.items || {};
        const itemKeys = Object.keys(items);

        if (itemKeys.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" class="p-4 text-center text-slate-500">No hay artículos configurados.</td></tr>`;
            return;
        }

        let html = '';
        const itemsOrdenados = itemKeys.sort((a,b) => a.localeCompare(b));

        itemsOrdenados.forEach(itemId => {
            const item = items[itemId];
            const precio = AppFormat.formatNumber(item.PrecioBase);
            const stock = item.Stock;
            const rowClass = (stock <= 0 && item.ItemID !== 'filantropo') ? 'opacity-60 bg-slate-50' : 'hover:bg-slate-100';
            
            const itemIdEscapado = escapeHTML(item.ItemID);

            html += `
                <tr id="tienda-item-row-${itemIdEscapado}" class="${rowClass}">
                    <td class="px-4 py-2 text-sm font-semibold text-slate-800">${item.ItemID}</td>
                    <td class="px-4 py-2 text-sm text-slate-700 truncate" title="${item.Nombre}">${item.Nombre}</td>
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
        document.getElementById('tienda-admin-nombre-input').value = item.Nombre;
        document.getElementById('tienda-admin-desc-input').value = item.Descripcion;
        document.getElementById('tienda-admin-tipo-input').value = item.Tipo;
        document.getElementById('tienda-admin-precio-input').value = item.PrecioBase;
        document.getElementById('tienda-admin-stock-input').value = item.Stock;
        
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
    
    updateAdminDepositoCalculo: function() {
        const cantidadInput = document.getElementById('transaccion-cantidad-input');
        const calculoMsg = document.getElementById('transaccion-calculo-impuesto');
        const cantidad = parseInt(cantidadInput.value, 10);

        if (isNaN(cantidad) || cantidad === 0) {
            calculoMsg.textContent = "";
            return;
        }

        if (cantidad > 0) {
            const comision = Math.round(cantidad * AppConfig.IMPUESTO_DEPOSITO_ADMIN);
            const costoNeto = cantidad - comision;

            calculoMsg.innerHTML = `<span class="color-dorado-main">Monto a depositar: ${AppFormat.formatNumber(cantidad)} ℙ | Costo Neto Tesorería: ${AppFormat.formatNumber(costoNeto)} ℙ (Comisión: ${AppFormat.formatNumber(comision)} ℙ)</span>`;
        } else {
            const ingresoTotal = Math.abs(cantidad);
            calculoMsg.innerHTML = `<span class="color-dorado-main">Monto a Multar: ${AppFormat.formatNumber(Math.abs(cantidad))} ℙ | Ingreso Neto Tesorería: ${AppFormat.formatNumber(ingresoTotal)} ℙ</span>`;
        }
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
        
        // --- FIX: Capturar el estado de selección de grupos actual (sobrevive a refrescos) ---
        const currentSelectedGroups = Array.from(grupoContainer.querySelectorAll('input[type="checkbox"]:checked'))
            .map(cb => cb.value);
        AppState.transaccionSelectedGroups = new Set(currentSelectedGroups);
        // --- FIN FIX ---
        
        grupoContainer.innerHTML = ''; 

        // Filtrar grupos activos (excluyendo el Cicla)
        const gruposActivos = AppState.datosActuales.filter(g => g.nombre !== 'Cicla' && g.nombre !== 'Banco');

        gruposActivos.forEach(grupo => {
            if (grupo.usuarios.length === 0) return;

            const div = document.createElement('div');
            div.className = "flex items-center p-1 rounded hover:bg-slate-200";
            
            const input = document.createElement('input');
            input.type = "checkbox";
            input.id = `group-cb-${grupo.nombre}`;
            input.value = grupo.nombre;
            input.className = "h-4 w-4 text-amber-600 border-slate-300 rounded focus:ring-amber-600 bg-white group-checkbox";
            input.addEventListener('change', AppUI.populateUsuariosTransaccion);
            
            // --- FIX: Restaurar la selección de grupos ---
            if (AppState.transaccionSelectedGroups.has(grupo.nombre)) {
                input.checked = true;
            }
            // --- FIN FIX ---

            const label = document.createElement('label');
            label.htmlFor = input.id;
            label.textContent = `${grupo.nombre} (${AppFormat.formatNumber(grupo.total)} ℙ)`;
            label.className = "ml-2 block text-sm text-slate-900 cursor-pointer flex-1";

            div.appendChild(input);
            div.appendChild(label);
            grupoContainer.appendChild(div);
        });

        
        // Lógica para repoblar usuarios inmediatamente si hay grupos seleccionados
        AppUI.populateUsuariosTransaccion();
        
        document.getElementById('tesoreria-saldo-transaccion').textContent = `(Fondos disponibles: ${AppFormat.formatNumber(AppState.datosAdicionales.saldoTesoreria)} ℙ)`;
    },

    populateUsuariosTransaccion: function() {
        const checkedGroups = document.querySelectorAll('#transaccion-lista-grupos-container input[type="checkbox"]:checked');
        const selectedGroupNames = Array.from(checkedGroups).map(cb => cb.value);
        
        const listaContainer = document.getElementById('transaccion-lista-usuarios-container');
        
        // --- FIX: Capturar el estado de selección de usuarios actual ---
        const currentSelectedUsers = Array.from(listaContainer.querySelectorAll('input[type="checkbox"]:checked'))
            .map(cb => cb.value);
        AppState.transaccionSelectedUsers = new Set(currentSelectedUsers);
        // --- FIN FIX ---

        listaContainer.innerHTML = ''; 

        if (selectedGroupNames.length === 0) {
            listaContainer.innerHTML = '<span class="text-sm text-slate-500 p-2">Seleccione un grupo...</span>';
            // Al deseleccionar todos los grupos, limpiar el set de usuarios
            AppState.transaccionSelectedUsers.clear();
            AppState.transaccionSelectAll = {};
            return;
        }
        
        // Usar los datos de AppState.datosActuales (grupos activos + Cicla)
        const allGroups = AppState.datosActuales;

        selectedGroupNames.forEach(grupoNombre => {
            const grupo = allGroups.find(g => g.nombre === grupoNombre);

            if (grupo && grupo.usuarios && grupo.usuarios.length > 0) {
                const headerDiv = document.createElement('div');
                headerDiv.className = "flex justify-between items-center bg-slate-200 p-2 mt-2 sticky top-0 border-b border-slate-300"; 
                headerDiv.innerHTML = `<span class="text-sm font-semibold text-slate-700">${grupo.nombre}</span>`;
                
                const btnSelectAll = document.createElement('button');
                btnSelectAll.textContent = AppState.transaccionSelectAll[grupo.nombre] ? "Ninguno" : "Todos";
                btnSelectAll.dataset.grupo = grupo.nombre; 
                btnSelectAll.className = "text-xs font-medium text-amber-600 hover:text-amber-800 select-all-users-btn";
                
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
                    
                    // --- FIX: Restaurar la selección de usuarios y actualizar Set en vivo ---
                    if (AppState.transaccionSelectedUsers.has(usuario.nombre)) {
                        input.checked = true;
                    }

                    input.addEventListener('change', (e) => {
                         if (e.target.checked) {
                             AppState.transaccionSelectedUsers.add(usuario.nombre);
                         } else {
                             AppState.transaccionSelectedUsers.delete(usuario.nombre);
                             // Si un usuario se desmarca manualmente, desactiva el SelectAll para ese grupo
                             AppState.transaccionSelectAll[grupo.nombre] = false;
                             const selectAllBtn = listaContainer.querySelector(`.select-all-users-btn[data-grupo="${grupo.nombre}"]`);
                             if (selectAllBtn) selectAllBtn.textContent = "Todos";
                         }
                    });
                    // --- FIN FIX ---

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

        // Invertir el estado de selección global del grupo
        AppState.transaccionSelectAll[grupoNombre] = !AppState.transaccionSelectAll[grupoNombre];
        const isChecked = AppState.transaccionSelectAll[grupoNombre];

        const checkboxes = document.querySelectorAll(`#transaccion-lista-usuarios-container input[data-checkbox-grupo="${grupoNombre}"]`);
        
        const grupoData = AppState.datosActuales.find(g => g.nombre === grupoNombre);

        checkboxes.forEach(cb => {
            cb.checked = isChecked;
        });

        // --- FIX: Sincronizar AppState.transaccionSelectedUsers ---
        if (grupoData && grupoData.usuarios) {
            grupoData.usuarios.forEach(usuario => {
                if (isChecked) {
                    AppState.transaccionSelectedUsers.add(usuario.nombre);
                } else {
                    AppState.transaccionSelectedUsers.delete(usuario.nombre);
                }
            });
        }
        // --- FIN FIX ---
        
        btn.textContent = isChecked ? "Ninguno" : "Todos";
    },

    setConnectionStatus: function(status, title) {
        const dot = document.getElementById('status-dot');
        const indicator = document.getElementById('status-indicator');
        if (!dot) return;
        
        indicator.title = title;

        dot.classList.remove('bg-green-600', 'bg-amber-600', 'bg-red-600', 'animate-pulse-dot', 'bg-slate-300', 'animate-pulse');
        dot.className = 'w-3 h-3 rounded-full'; 

        if (status === 'ok') {
            dot.classList.add('bg-amber-500'); 
        } else if (status === 'loading') {
            dot.classList.add('bg-amber-400', 'animate-pulse');
        } else if (status === 'error') {
            dot.classList.add('bg-slate-400'); 
        } else {
            dot.classList.add('bg-slate-300');
        }
    },

    hideSidebar: function() {
        if (AppState.isSidebarOpen) {
            AppUI.toggleSidebar();
        }
    },

    toggleSidebar: function() {
        const sidebar = document.getElementById('sidebar');
        const sidebarOverlay = document.getElementById('sidebar-overlay');
        
        AppState.isSidebarOpen = !AppState.isSidebarOpen; 

        if (AppState.isSidebarOpen) {
            sidebar.classList.remove('-translate-x-full');
            // Mostrar overlay y habilitar interacción solo en móvil
            if (window.innerWidth < 1024) { 
                 sidebarOverlay.classList.remove('hidden', 'opacity-0');
                 sidebarOverlay.classList.add('opacity-100');
            }
        } else {
            sidebar.classList.add('-translate-x-full');
            
            // Ocultar overlay
            sidebarOverlay.classList.remove('opacity-100');
            sidebarOverlay.classList.add('opacity-0');
            setTimeout(() => {
                 sidebarOverlay.classList.add('hidden');
            }, 300); 
        }
        
        AppUI.resetSidebarTimer();
    },


    resetSidebarTimer: function() {
        if (AppState.sidebarTimer) {
            clearTimeout(AppState.sidebarTimer);
        }
        
        // Solo aplicar el timer de cierre automático en desktop (lg)
        if (AppState.isSidebarOpen && window.innerWidth >= 1024) {
            AppState.sidebarTimer = setTimeout(() => {
                if (AppState.isSidebarOpen) {
                    AppUI.toggleSidebar();
                }
            }, 10000);
        }
    },

    actualizarSidebar: function(grupos) {
        const navContainer = document.getElementById('sidebar-nav');
        if (!navContainer) return;

        const gruposFiltrados = grupos.filter(g => g.nombre !== 'Cicla' && g.nombre !== 'Banco');
        const ciclaGroup = grupos.find(g => g.nombre === 'Cicla');

        let html = '';

        html += `
            <a href="#" id="home-nav-btn" data-grupo-nombre="" class="flex items-center p-3 rounded-lg text-sm font-semibold text-slate-700 hover:bg-slate-100 sidebar-nav-item transition-colors mb-2">
                Inicio
            </a>
            <div class="text-xs font-semibold text-slate-500 uppercase px-3 py-2 border-t border-slate-200">Grupos Activos</div>
        `;
        
        gruposFiltrados.forEach(grupo => {
            const totalF = AppFormat.formatNumber(grupo.total);
            const isActive = AppState.selectedGrupo === grupo.nombre;
            const classActive = isActive ? 'bg-amber-50 text-amber-600 font-bold' : 'text-slate-700 hover:bg-slate-100';

            html += `
                <a href="#" data-grupo-nombre="${grupo.nombre}" class="flex items-center justify-between p-3 rounded-lg text-sm sidebar-nav-item ${classActive} transition-colors">
                    <span class="truncate">${grupo.nombre}</span>
                    <span class="text-xs font-semibold">${totalF} ℙ</span>
                </a>
            `;
        });
        
        if (ciclaGroup) {
             const totalF = AppFormat.formatNumber(ciclaGroup.total);
             const isActive = AppState.selectedGrupo === ciclaGroup.nombre;
             const classActive = isActive ? 'bg-amber-50 text-amber-600 font-bold' : 'text-slate-700 hover:bg-slate-100';
             
             html += `
                <div class="text-xs font-semibold text-slate-500 uppercase px-3 py-2 border-t border-slate-200 mt-4">Otros Grupos</div>
                <a href="#" data-grupo-nombre="${ciclaGroup.nombre}" class="flex items-center justify-between p-3 rounded-lg text-sm sidebar-nav-item ${classActive} transition-colors">
                    <span class="truncate">${ciclaGroup.nombre}</span>
                    <span class="text-xs font-semibold">${totalF} ℙ</span>
                </a>
            `;
        }

        navContainer.innerHTML = html;
        
        document.querySelectorAll('.sidebar-nav-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                const grupoNombre = e.currentTarget.dataset.grupoNombre;
                
                AppState.selectedGrupo = grupoNombre; 
                
                if (grupoNombre === '') {
                    AppUI.mostrarPantallaNeutral(grupos);
                } else {
                    const selectedGrupoData = grupos.find(g => g.nombre === grupoNombre);
                    if (selectedGrupoData) {
                        AppUI.mostrarDatosGrupo(selectedGrupoData);
                    }
                }
                
                AppUI.hideSidebar(); 
                AppUI.actualizarSidebarActivo();
            });
        });
    },

    actualizarSidebarActivo: function() {
         document.querySelectorAll('.sidebar-nav-item').forEach(item => {
             const grupoNombre = item.dataset.grupoNombre;
             item.classList.remove('bg-amber-50', 'text-amber-600', 'font-bold');
             item.classList.add('text-slate-700', 'hover:bg-slate-100');
             
             if (grupoNombre === AppState.selectedGrupo) {
                 item.classList.add('bg-amber-50', 'text-amber-600', 'font-bold');
                 item.classList.remove('text-slate-700', 'hover:bg-slate-100');
             } else if (AppState.selectedGrupo === null && grupoNombre === '') {
                 item.classList.add('bg-amber-50', 'text-amber-600', 'font-bold');
                 item.classList.remove('text-slate-700', 'hover:bg-slate-100');
             }
         });
    },
    
    goToHeroSlide: function(index) {
        if (index < 0 || index >= AppState.heroSlideCount) {
             index = Math.max(0, Math.min(index, AppState.heroSlideCount - 1));
             if (index === 0) return; 
        }
        
        AppState.heroSlideIndex = index;
        const track = document.getElementById('hero-carousel');
        const offset = -index * 100;
        
        if (track) {
            track.style.transform = `translateX(${offset}%)`;
        }
    },
    
    mostrarPantallaNeutral: function(grupos) {
        document.getElementById('main-header-title').textContent = "Bienvenido al Banco del Pincel Dorado";
        
        document.getElementById('page-subtitle').innerHTML = ''; 
        document.getElementById('page-subtitle').classList.add('hidden');

        document.getElementById('table-container').innerHTML = '';
        document.getElementById('table-container').classList.add('hidden');

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
            // Solo se cuenta el capital de los depósitos activos
            const totalInvertidoDepositos = depositosActivos
                .filter(deposito => (deposito.alumno || '').trim() === (student.nombre || '').trim() && deposito.estado.startsWith('Activo'))
                .reduce((sum, deposito) => sum + (Number(deposito.monto) || 0), 0);
            
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
        
        document.getElementById('home-modules-grid').classList.remove('hidden');
        
    },

    mostrarDatosGrupo: function(grupo) {
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
                
                const daysEl = document.getElementById('days');
                const hoursEl = document.getElementById('hours');
                const minutesEl = document.getElementById('minutes');
                
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
    
    updateSliderFill: (input) => {
        if (!input || input.type !== 'range') return;
        const min = input.min ? input.min : 0;
        const max = input.max ? input.max : 100;
        const val = input.value;
        const percent = ((val - min) / (max - min)) * 100;
        input.style.background = `linear-gradient(to right, #d97706 0%, #d97706 ${percent}%, #cbd5e1 ${percent}%, #cbd5e1 100%)`;
    },
    
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
    
    checkLoanEligibility: function(student, montoSolicitado) {
        if (student.pinceles < 0) {
            return { isEligible: false, message: 'Saldo negativo no es elegible para préstamos.' };
        }
        const capacity = student.pinceles * 0.50;
        if (montoSolicitado > capacity) {
            return { isEligible: false, message: `Monto excede el 50% de tu saldo. Máx: ${AppFormat.formatNumber(capacity)} ℙ.` };
        }
        if (AppState.datosAdicionales.prestamosActivos.some(p => p.alumno === student.nombre && (p.estado === 'Activo' || p.estado.startsWith('Vencido')))) {
            return { isEligible: false, message: 'Ya tienes un préstamo activo.' };
        }
        if (AppState.datosAdicionales.saldoTesoreria < montoSolicitado) {
            return { isEligible: false, message: 'Tesorería sin fondos suficientes para tu solicitud.' };
        }
        return { isEligible: true, message: '¡Elegible! Confirma la solicitud.' };
    },

    checkDepositEligibility: function(student, montoADepositar) {
        if (AppState.datosAdicionales.prestamosActivos.some(p => p.alumno === student.nombre && (p.estado === 'Activo' || p.estado.startsWith('Vencido')))) {
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
        const claveInput = document.getElementById('prestamo-clave-p2p');

        const alumnoNombre = document.getElementById('prestamo-search-alumno').value.trim();
        const claveP2P = claveInput.value;
        const montoSolicitado = parseInt(document.getElementById('prestamo-monto-input').value);
        const plazoSolicitado = parseInt(document.getElementById('prestamo-plazo-input').value);

        const student = AppState.currentSearch.prestamoAlumno.info;

        let errorValidacion = "";
        
        if (!student || student.nombre !== alumnoNombre) {
            errorValidacion = 'Debe seleccionar su nombre de la lista de búsqueda.';
            document.getElementById('prestamo-search-alumno').classList.add('shake');
        } else if (!claveP2P || claveP2P.length !== 5) {
            errorValidacion = 'La Clave P2P debe tener 5 dígitos.';
            claveInput.classList.add('shake');
        } else if (montoSolicitado <= 0 || plazoSolicitado <= 0) {
            errorValidacion = 'El monto y el plazo deben ser válidos.';
        } else {
            const elegibilidad = AppTransacciones.checkLoanEligibility(student, montoSolicitado);
            if (!elegibilidad.isEligible) errorValidacion = `No elegible: ${elegibilidad.message}`;
        }
        
        // CORRECCIÓN: Si hay error de clave, quitamos el efecto visual después de 1 segundo
        if (claveInput.classList.contains('shake')) {
             setTimeout(() => claveInput.classList.remove('shake'), 1000);
        }
        if (document.getElementById('prestamo-search-alumno').classList.contains('shake')) {
             setTimeout(() => document.getElementById('prestamo-search-alumno').classList.remove('shake'), 1000);
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

            const result = await AppTransacciones.fetchWithExponentialBackoff(AppConfig.API_URL, {
                method: 'POST',
                body: JSON.stringify(payload), 
            });

            if (!result.success) {
                throw new Error(result.message || "Error al otorgar el préstamo.");
            }
            
            AppUI.showSuccessSummary('transacciones-combinadas-modal', {
                ...result,
                monto_solicitado: montoSolicitado,
                plazo_dias: plazoSolicitado,
            }, 'prestamo');
            
            AppData.cargarDatos(false); 

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
        const claveInput = document.getElementById('deposito-clave-p2p');


        const alumnoNombre = document.getElementById('deposito-search-alumno').value.trim();
        const claveP2P = claveInput.value;
        const montoADepositar = parseInt(document.getElementById('deposito-monto-input').value);
        const plazoEnDias = parseInt(document.getElementById('deposito-plazo-input').value);

        const student = AppState.currentSearch.depositoAlumno.info;

        let errorValidacion = "";
        
        if (!student || student.nombre !== alumnoNombre) {
            errorValidacion = 'Debe seleccionar su nombre de la lista de búsqueda.';
            document.getElementById('deposito-search-alumno').classList.add('shake');
        } else if (!claveP2P || claveP2P.length !== 5) {
            errorValidacion = 'La Clave P2P debe tener 5 dígitos.';
            claveInput.classList.add('shake');
        } else if (montoADepositar <= 0 || plazoEnDias <= 0) {
            errorValidacion = 'El monto y el plazo deben ser válidos.';
        } else {
            const elegibilidad = AppTransacciones.checkDepositEligibility(student, montoADepositar);
            if (!elegibilidad.isEligible) errorValidacion = `No elegible: ${elegibilidad.message}`;
        }
        
        // CORRECCIÓN: Si hay error de clave, quitamos el efecto visual después de 1 segundo
        if (claveInput.classList.contains('shake')) {
             setTimeout(() => claveInput.classList.remove('shake'), 1000);
        }
        if (document.getElementById('deposito-search-alumno').classList.contains('shake')) {
             setTimeout(() => document.getElementById('deposito-search-alumno').classList.remove('shake'), 1000);
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

            const result = await AppTransacciones.fetchWithExponentialBackoff(AppConfig.API_URL, {
                method: 'POST',
                body: JSON.stringify(payload), 
            });

            if (!result.success) {
                throw new Error(result.message || "Error al crear el depósito.");
            }
            
            AppUI.showSuccessSummary('transacciones-combinadas-modal', {
                ...result,
                monto_depositado: montoADepositar,
                plazo_dias: plazoEnDias,
            }, 'deposito');
            
            AppData.cargarDatos(false); 

        } catch (error) {
            AppTransacciones.setError(statusMsg, error.message);
        } finally {
            AppTransacciones.setLoadingState(btn, btnText, false, 'Confirmar Inversión');
        }
    },
    
    realizarTransaccionMultiple: async function() {
        const cantidadInput = document.getElementById('transaccion-cantidad-input');
        const statusMsg = document.getElementById('transaccion-status-msg');
        const submitBtn = document.getElementById('transaccion-submit-btn');
        const btnText = document.getElementById('transaccion-btn-text');
        
        const pinceles = parseInt(cantidadInput.value, 10);

        let errorValidacion = "";
        if (isNaN(pinceles) || pinceles === 0) {
            errorValidacion = "La cantidad debe ser un número distinto de cero.";
            cantidadInput.classList.add('shake');
        } else {
             cantidadInput.classList.remove('shake');
        }
        
        setTimeout(() => cantidadInput.classList.remove('shake'), 1000);


        // --- FIX: Obtener usuarios seleccionados desde el estado ---
        const selectedUsersArray = Array.from(AppState.transaccionSelectedUsers);
        const checkedUsersCount = selectedUsersArray.length;
        // --- FIN FIX ---
        
        const groupedSelections = {};
        
        // Re-agrupar los usuarios seleccionados por su grupo
        selectedUsersArray.forEach(nombre => {
            const student = AppState.datosAdicionales.allStudents.find(s => s.nombre === nombre);
            if (student) {
                const grupo = student.grupoNombre;
                if (!groupedSelections[grupo]) {
                    groupedSelections[grupo] = [];
                }
                groupedSelections[grupo].push(nombre);
            }
        });
        
        if (!errorValidacion && checkedUsersCount === 0) {
            errorValidacion = "Debe seleccionar al menos un usuario.";
        }
        
        const transacciones = Object.keys(groupedSelections).map(grupo => {
            return { grupo: grupo, nombres: groupedSelections[grupo] };
        });

        if (errorValidacion) {
            AppTransacciones.setError(statusMsg, errorValidacion);
            return;
        }

        AppTransacciones.setLoadingState(submitBtn, btnText, true, 'Procesando...');
        AppTransacciones.setLoading(statusMsg, `Procesando ${checkedUsersCount} transacción(es)...`);
        
        try {
            const payload = {
                accion: 'transaccion_multiple', 
                clave: AppConfig.CLAVE_MAESTRA, // ADMIN FIX: Clave Maestra enviada
                cantidad: pinceles, 
                transacciones: transacciones 
            };

            const result = await AppTransacciones.fetchWithExponentialBackoff(AppConfig.TRANSACCION_API_URL, {
                method: 'POST',
                body: JSON.stringify(payload), 
            });

            if (!result.success) {
                throw new Error(result.message || "Error desconocido de la API.");
            }
            
            AppUI.showSuccessSummary('transaccion-modal', result.detalles, 'admin_multi');
            
            cantidadInput.value = "";
            document.getElementById('transaccion-calculo-impuesto').textContent = "";
            
            // --- FIX: Limpiar el estado de selección después de una transacción exitosa ---
            AppState.transaccionSelectedGroups.clear();
            AppState.transaccionSelectedUsers.clear();
            AppState.transaccionSelectAll = {};
            // --- FIN FIX ---
            
            AppData.cargarDatos(false); 
            AppUI.populateGruposTransaccion(); 
            AppUI.populateUsuariosTransaccion(); 

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
        
        const origenInput = document.getElementById('p2p-search-origen');
        const claveInput = document.getElementById('p2p-clave');
        const destinoInput = document.getElementById('p2p-search-destino');
        const cantidadInput = document.getElementById('p2p-cantidad');

        const nombreOrigen = AppState.currentSearch.p2pOrigen.selected;
        const nombreDestino = AppState.currentSearch.p2pDestino.selected;
        const claveP2P = claveInput.value;
        const cantidad = parseInt(cantidadInput.value, 10);
        
        const estudianteOrigen = AppState.currentSearch.p2pOrigen.info;

        let errorValidacion = "";
        
        // Limpiar estilos de error previos
        origenInput.classList.remove('shake');
        claveInput.classList.remove('shake');
        destinoInput.classList.remove('shake');
        cantidadInput.classList.remove('shake');
        
        if (!nombreOrigen) {
            errorValidacion = "Debe seleccionar su nombre (Remitente) de la lista.";
            origenInput.classList.add('shake');
        } 
        if (!claveP2P) {
            errorValidacion = "Debe ingresar su Clave P2P.";
            claveInput.classList.add('shake');
        } 
        if (!nombreDestino) {
            errorValidacion = "Debe seleccionar un Destinatario de la lista.";
            destinoInput.classList.add('shake');
        } 
        if (isNaN(cantidad) || cantidad <= 0) {
            errorValidacion = "La cantidad debe ser un número positivo.";
            cantidadInput.classList.add('shake');
        } else if (nombreOrigen === nombreDestino) {
            errorValidacion = "No puedes enviarte pinceles a ti mismo.";
            origenInput.classList.add('shake');
            destinoInput.classList.add('shake');
        }
        
        // CORRECCIÓN: Remover las clases shake después de 1 segundo
        setTimeout(() => {
            origenInput.classList.remove('shake');
            claveInput.classList.remove('shake');
            destinoInput.classList.remove('shake');
            cantidadInput.classList.remove('shake');
        }, 1000);


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

            const result = await AppTransacciones.fetchWithExponentialBackoff(AppConfig.API_URL, {
                method: 'POST',
                body: JSON.stringify(payload), 
            });

            if (!result.success) {
                throw new Error(result.message || "Error desconocido de la API.");
            }
            
            AppUI.showSuccessSummary('transacciones-combinadas-modal', {
                ...result,
                remitente: nombreOrigen,
                destino: nombreDestino
            }, 'p2p');
            
            AppData.cargarDatos(false); 

        } catch (error) {
            AppTransacciones.setError(statusMsg, error.message);
        } finally {
            AppTransacciones.setLoadingState(submitBtn, btnText, false, 'Realizar Transferencia');
        }
    },
    
    iniciarCanje: function(bonoClave) {
        const bono = AppState.bonos.disponibles.find(b => b.clave === bonoClave);
        const statusMsg = document.getElementById('bono-status-msg');
        
        const listContainer = document.getElementById('bonos-lista-disponible');
        const clickedBtn = listContainer.querySelector(`[data-bono-clave="${bonoClave}"]`);
        
        if (clickedBtn) {
            // Se asume que el botón tiene un span.btn-text dentro para el estado de carga
            AppTransacciones.setLoadingState(clickedBtn, clickedBtn.querySelector('.btn-text'), true, 'Cargando...');
        }

        if (!bono) {
            AppTransacciones.setError(statusMsg, "Error interno: Bono no encontrado.");
        } else if (bono.usos_actuales >= bono.usos_totales) {
             AppTransacciones.setError(statusMsg, "Bono agotado, intente más tarde.");
        } else if (bono.expiracion_fecha && new Date(bono.expiracion_fecha).getTime() < Date.now()) {
             AppTransacciones.setError(statusMsg, "Este bono ha expirado.");
        } else {
            AppUI.showBonoStep2(bonoClave);
        }

        if (clickedBtn) {
            // Restablecer el estado de carga del botón después de un breve retraso
            setTimeout(() => {
                AppTransacciones.setLoadingState(clickedBtn, clickedBtn.querySelector('.btn-text'), false, 'Canjear');
                // Si la validación falló después del retraso, el botón debe quedar deshabilitado.
                if (bono.usos_actuales >= bono.usos_totales || (bono.expiracion_fecha && new Date(bono.expiracion_fecha).getTime() < Date.now())) {
                    clickedBtn.disabled = true;
                    clickedBtn.classList.add('bg-slate-100', 'text-slate-600', 'border-slate-300', 'cursor-not-allowed', 'shadow-none');
                }
            }, 50); 
        }
    },

    confirmarCanje: async function() {
        const statusMsg = document.getElementById('bono-step2-status-msg');
        const submitBtn = document.getElementById('bono-submit-step2-btn');
        const btnText = document.getElementById('bono-btn-text-step2');
        const claveInput = document.getElementById('bono-clave-p2p-step2');
        
        AppTransacciones.setLoadingState(submitBtn, btnText, true, 'Canjeando...');

        const alumnoNombre = document.getElementById('bono-search-alumno-step2').value.trim();
        const claveP2P = claveInput.value;
        const claveBono = document.getElementById('bono-clave-input-step2').value.toUpperCase();

        const bono = AppState.bonos.disponibles.find(b => b.clave === claveBono);
        const student = AppState.datosAdicionales.allStudents.find(s => s.nombre === alumnoNombre);


        let errorValidacion = "";
        
        // Limpiar estilos de error previos
        claveInput.classList.remove('shake');
        document.getElementById('bono-search-alumno-step2').classList.remove('shake');

        if (!alumnoNombre || !student || student.nombre !== alumnoNombre) {
            errorValidacion = "Alumno no encontrado. Por favor, seleccione su nombre de la lista.";
            document.getElementById('bono-search-alumno-step2').classList.add('shake');
        } else if (!claveP2P) {
            errorValidacion = "Debe ingresar su Clave P2P.";
            claveInput.classList.add('shake');
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
        
        // CORRECCIÓN: Si hay error de clave/alumno, quitamos el efecto visual después de 1 segundo
        if (claveInput.classList.contains('shake')) {
             setTimeout(() => claveInput.classList.remove('shake'), 1000);
        }
        if (document.getElementById('bono-search-alumno-step2').classList.contains('shake')) {
             setTimeout(() => document.getElementById('bono-search-alumno-step2').classList.remove('shake'), 1000);
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

            const result = await AppTransacciones.fetchWithExponentialBackoff(AppConfig.API_URL, {
                method: 'POST',
                body: JSON.stringify(payload),
            });

            if (!result.success) {
                throw new Error(result.message || "Error desconocido de la API.");
            }
            
            // FIX: Usar 'bonos-modal' para que el nuevo showSuccessSummary maneje la excepción correctamente
            AppUI.showSuccessSummary('bonos-modal', {
                ...result,
                recompensa: bono.recompensa,
                bono_clave: claveBono
            }, 'bono');
            
            AppData.cargarDatos(false); 

        } catch (error) {
            AppTransacciones.setError(statusMsg, error.message);
        } finally {
            AppTransacciones.setLoadingState(submitBtn, btnText, false, 'Confirmar Canje');
        }
    },

    crearActualizarBono: async function() {
        const statusMsg = document.getElementById('bono-admin-status-msg');
        const submitBtn = document.getElementById('bono-admin-submit-btn');
        
        const clave = document.getElementById('bono-admin-clave-input');
        const nombre = document.getElementById('bono-admin-nombre-input');
        const recompensa = document.getElementById('bono-admin-recompensa-input');
        const usos_totales = document.getElementById('bono-admin-usos-input');
        
        const duracionHoras = parseInt(document.getElementById('bono-admin-expiracion-input').value, 10);
        
        const checkedGroups = AppUI.getAdminGroupCheckboxSelection('bono-admin-grupos-checkboxes-container');
        const grupos_permitidos = checkedGroups.join(', ');
        
        let expiracion_fecha = '';
        if (!isNaN(duracionHoras) && duracionHoras > 0) {
            const expiryDate = new Date(Date.now() + duracionHoras * 60 * 60 * 1000);
            expiracion_fecha = AppFormat.toLocalISOString(expiryDate); 
        }

        let errorValidacion = "";
        
        // Limpiar estilos de error previos
        clave.classList.remove('shake');
        nombre.classList.remove('shake');
        recompensa.classList.remove('shake');
        usos_totales.classList.remove('shake');
        
        if (!clave.value) {
            errorValidacion = "La 'Clave' es obligatoria.";
            clave.classList.add('shake');
        } else if (!nombre.value) {
            errorValidacion = "El 'Nombre' es obligatorio.";
            nombre.classList.add('shake');
        } else if (isNaN(parseInt(recompensa.value)) || parseInt(recompensa.value) <= 0) {
            errorValidacion = "La 'Recompensa' debe ser un número positivo.";
            recompensa.classList.add('shake');
        } else if (isNaN(parseInt(usos_totales.value)) || parseInt(usos_totales.value) < 0) {
            errorValidacion = "Los 'Usos Totales' deben ser un número (0 o más).";
            usos_totales.classList.add('shake');
        }
        
        // CORRECCIÓN: Quitar el efecto visual después de 1 segundo
        setTimeout(() => {
            clave.classList.remove('shake');
            nombre.classList.remove('shake');
            recompensa.classList.remove('shake');
            usos_totales.classList.remove('shake');
        }, 1000);


        if (errorValidacion) {
            AppTransacciones.setError(statusMsg, errorValidacion);
            return;
        }

        AppTransacciones.setLoadingState(submitBtn, null, true, 'Guardando...');
        AppTransacciones.setLoading(statusMsg, `Guardando bono ${clave.value}...`);

        try {
            const payload = {
                accion: 'admin_crear_bono',
                clave: AppConfig.CLAVE_MAESTRA, // ADMIN FIX: Clave Maestra enviada
                bono: {
                    clave: clave.value.toUpperCase(),
                    nombre: nombre.value,
                    recompensa: parseInt(recompensa.value, 10),
                    usos_totales: parseInt(usos_totales.value, 10),
                    grupos_permitidos: grupos_permitidos,
                    expiracion_fecha: expiracion_fecha
                }
            };

            const result = await AppTransacciones.fetchWithExponentialBackoff(AppConfig.API_URL, {
                method: 'POST',
                body: JSON.stringify(payload),
            });

            if (!result.success) {
                throw new Error(result.message || "Error al guardar el bono.");
            }
            
            AppTransacciones.setSuccess(statusMsg, result.message || "¡Bono guardado con éxito!");
            AppUI.clearBonoAdminForm();
            await AppData.cargarDatos(false);
            AppUI.populateBonoList(); 

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
                clave: AppConfig.CLAVE_MAESTRA, // ADMIN FIX: Clave Maestra enviada
                claveBono: claveBono
            };

            const result = await AppTransacciones.fetchWithExponentialBackoff(AppConfig.API_URL, {
                method: 'POST',
                body: JSON.stringify(payload),
            });

            if (!result.success) {
                throw new Error(result.message || "Error al eliminar el bono.");
            }
            
            AppTransacciones.setSuccess(statusMsg, result.message || "¡Bono eliminado con éxito!");
            await AppData.cargarDatos(false);
            AppUI.populateBonoList();

        } catch (error) {
            AppTransacciones.setError(statusMsg, error.message);
            document.querySelectorAll('.delete-bono-btn').forEach(btn => btn.disabled = false);
        } 
    },

    iniciarCompra: function(itemId) {
        const item = AppState.tienda.items[itemId];
        const statusMsg = document.getElementById('tienda-status-msg');
        const buyBtn = document.getElementById(`buy-btn-${itemId}`);
        
        if (buyBtn) {
            AppTransacciones.setLoadingState(buyBtn, buyBtn.querySelector('.btn-text'), true, 'Cargando...');
        }
        
        statusMsg.textContent = "";

        if (!item) {
            AppTransacciones.setError(statusMsg, "Error interno: Artículo no encontrado.");
        } else if (item.Stock <= 0 && item.ItemID !== 'filantropo') {
            AppTransacciones.setError(statusMsg, "El artículo está agotado.");
        } else if (item.ExpiracionFecha && new Date(item.ExpiracionFecha).getTime() < Date.now()) {
            AppTransacciones.setError(statusMsg, "Este artículo ha expirado.");
        } else if (!AppState.tienda.isStoreOpen) {
            AppTransacciones.setError(statusMsg, "La tienda está cerrada en este momento.");
        } else {
            AppUI.showTiendaStep2(itemId);
        }
        
        setTimeout(() => {
             if (buyBtn) AppUI.updateTiendaButtonStates(); 
        }, 50);
    },

    confirmarCompra: async function() {
        const statusMsg = document.getElementById('tienda-step2-status-msg'); 
        const submitBtn = document.getElementById('tienda-submit-step2-btn');
        const btnText = document.getElementById('tienda-btn-text-step2');
        const claveInput = document.getElementById('tienda-clave-p2p-step2');
        
        AppTransacciones.setLoadingState(submitBtn, btnText, true, 'Comprando...');

        const itemId = AppState.tienda.selectedItem;
        const alumnoNombre = document.getElementById('tienda-search-alumno-step2').value.trim();
        const claveP2P = claveInput.value;

        const item = AppState.tienda.items[itemId];
        const student = AppState.datosAdicionales.allStudents.find(s => s.nombre === alumnoNombre);

        let errorValidacion = "";
        
        // Limpiar estilos de error previos
        claveInput.classList.remove('shake');
        document.getElementById('tienda-search-alumno-step2').classList.remove('shake');

        if (!itemId || !item) {
            errorValidacion = "Error interno: Artículo no seleccionado.";
        } else if (!alumnoNombre || !student || student.nombre !== alumnoNombre) {
            errorValidacion = "Alumno no encontrado. Por favor, seleccione su nombre de la lista.";
            document.getElementById('tienda-search-alumno-step2').classList.add('shake');
        } else if (!claveP2P) {
            errorValidacion = "Debe ingresar su Clave P2P.";
            claveInput.classList.add('shake');
        } else {
            const costoFinal = Math.round(item.PrecioBase * (1 + AppConfig.TASA_ITBIS));
            if (student.pinceles < costoFinal) {
                errorValidacion = "Saldo insuficiente para completar la compra.";
            } else if (item.Stock <= 0 && item.ItemID !== 'filantropo') {
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
        
        // CORRECCIÓN: Si hay error de clave/alumno, quitamos el efecto visual después de 1 segundo
        if (claveInput.classList.contains('shake')) {
             setTimeout(() => claveInput.classList.remove('shake'), 1000);
        }
        if (document.getElementById('tienda-search-alumno-step2').classList.contains('shake')) {
             setTimeout(() => document.getElementById('tienda-search-alumno-step2').classList.remove('shake'), 1000);
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

            const result = await AppTransacciones.fetchWithExponentialBackoff(AppConfig.API_URL, {
                method: 'POST',
                body: JSON.stringify(payload),
            });

            if (!result.success) {
                throw new Error(result.message || "Error desconocido de la API.");
            }
            
            AppUI.showSuccessSummary('tienda-modal', {
                ...result,
                costo_base: item.PrecioBase,
                itbis: result.costo_total - item.PrecioBase,
            }, 'tienda');
            
            AppData.cargarDatos(false); 

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
        
        const itemIdInput = document.getElementById('tienda-admin-itemid-input');
        const nombreInput = document.getElementById('tienda-admin-nombre-input');
        const precioInput = document.getElementById('tienda-admin-precio-input');
        const stockInput = document.getElementById('tienda-admin-stock-input');
        
        const item = {
            ItemID: itemIdInput.value.trim(),
            Nombre: nombreInput.value.trim(),
            Descripcion: document.getElementById('tienda-admin-desc-input').value.trim(),
            Tipo: document.getElementById('tienda-admin-tipo-input').value.trim(),
            PrecioBase: parseInt(precioInput.value, 10),
            Stock: parseInt(stockInput.value, 10),
            GruposPermitidos: grupos_permitidos, 
            ExpiracionFecha: expiracion_fecha 
        };
        
        let errorValidacion = "";
        
        // Limpiar estilos de error previos
        itemIdInput.classList.remove('shake');
        nombreInput.classList.remove('shake');
        precioInput.classList.remove('shake');
        stockInput.classList.remove('shake');

        if (!item.ItemID) {
            errorValidacion = "El 'ItemID' es obligatorio.";
            itemIdInput.classList.add('shake');
        } else if (!item.Nombre) {
            errorValidacion = "El 'Nombre' es obligatorio.";
            nombreInput.classList.add('shake');
        } else if (isNaN(item.PrecioBase) || item.PrecioBase <= 0) {
            errorValidacion = "El 'Precio Base' debe ser un número positivo.";
            precioInput.classList.add('shake');
        } else if (isNaN(item.Stock) || item.Stock < 0) {
            errorValidacion = "El 'Stock' debe ser un número (0 o más).";
            stockInput.classList.add('shake');
        }
        
        // CORRECCIÓN: Quitar el efecto visual después de 1 segundo
        setTimeout(() => {
            itemIdInput.classList.remove('shake');
            nombreInput.classList.remove('shake');
            precioInput.classList.remove('shake');
            stockInput.classList.remove('shake');
        }, 1000);


        if (errorValidacion) {
            AppTransacciones.setError(statusMsg, errorValidacion);
            return;
        }

        AppTransacciones.setLoadingState(submitBtn, null, true, 'Guardando...');
        AppTransacciones.setLoading(statusMsg, `Guardando artículo ${item.ItemID}...`);

        try {
            const payload = {
                accion: 'admin_crear_item_tienda',
                clave: AppConfig.CLAVE_MAESTRA, // ADMIN FIX: Clave Maestra enviada
                item: item
            };

            const result = await AppTransacciones.fetchWithExponentialBackoff(AppConfig.TRANSACCION_API_URL, {
                method: 'POST',
                body: JSON.stringify(payload),
            });

            if (!result.success) {
                throw new Error(result.message || "Error al guardar el artículo.");
            }
            
            AppTransacciones.setSuccess(statusMsg, result.message || "¡Artículo guardado con éxito!");
            AppUI.clearTiendaAdminForm();
            await AppData.cargarDatos(false);
            AppUI.renderTiendaItems();
            
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
                clave: AppConfig.CLAVE_MAESTRA, // ADMIN FIX: Clave Maestra enviada
                itemId: itemId
            };

            const result = await AppTransacciones.fetchWithExponentialBackoff(AppConfig.TRANSACCION_API_URL, {
                method: 'POST',
                body: JSON.stringify(payload),
            });

            if (!result.success) {
                throw new Error(result.message || "Error al eliminar el artículo.");
            }
            
            AppTransacciones.setSuccess(statusMsg, result.message || "¡Artículo eliminado con éxito!");
            await AppData.cargarDatos(false);
            AppUI.renderTiendaItems();
            
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
                clave: AppConfig.CLAVE_MAESTRA, // ADMIN FIX: Clave Maestra enviada
                status: status
            };

            const result = await AppTransacciones.fetchWithExponentialBackoff(AppConfig.TRANSACCION_API_URL, {
                method: 'POST',
                body: JSON.stringify(payload),
            });

            if (!result.success) {
                throw new Error(result.message || "Error al cambiar estado.");
            }
            
            AppTransacciones.setSuccess(statusMsg, result.message || "¡Estado de la tienda actualizado!");
            AppData.cargarDatos(false);

        } catch (error) {
            AppTransacciones.setError(statusMsg, error.message);
        } finally {
            document.getElementById('tienda-force-open-btn').disabled = false;
            document.getElementById('tienda-force-close-btn').disabled = false;
            document.getElementById('tienda-force-auto-btn').disabled = false;
        }
    },

    // BLINDAJE 2: Función de Fetch que maneja errores de HTML/Fetch
    fetchWithExponentialBackoff: async function(url, options, maxRetries = 5, initialDelay = 1000) {
        for (let attempt = 0; attempt < maxRetries; attempt++) {
            try {
                const response = await fetch(url, options);
                
                // Si la respuesta no es 200/OK, o si es 429, retry
                if (!response.ok || response.status === 429) {
                     // Intenta leer el texto para ver si es un error legible o HTML
                    const text = await response.text();
                    
                    try {
                        const json = JSON.parse(text);
                        // Si es JSON, pero reporta un error (success: false), lo devolvemos para ser manejado.
                        if (json.error || json.success === false) return json;
                        // Si es JSON y está ok, lo devolvemos.
                        if (json.success === true) return json;
                        
                    } catch (e) {
                         // Falló el parseo: Es probable que sea HTML de error.
                         // Lanzamos un error genérico para que intente el reintento o falle graciosamente.
                         console.error("Fetch Error: Respuesta no es JSON y falló la conexión o el backend.", text.substring(0, 100));
                         throw new Error(`Error de comunicación: La API devolvió un formato inesperado.`);
                    }
                    
                } else {
                    // Respuesta 200 OK y no 429
                    const text = await response.text();
                    try {
                        // Si llegó aquí, es casi seguro que es JSON válido
                        return JSON.parse(text);
                    } catch (e) {
                         console.error("Fetch Error: Falló el parseo final de JSON.", text.substring(0, 100));
                         throw new Error(`Error de sintaxis de datos: Contacte al administrador.`);
                    }
                }
            } catch (error) {
                if (attempt === maxRetries - 1) throw error;
            }
            const delay = initialDelay * Math.pow(2, attempt) + Math.random() * 1000;
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
            statusMsgEl.className = "text-sm text-center font-medium color-dorado-main status-msg-fixed-height";
        }
    },

    setSuccess: function(statusMsgEl, message) {
        if (statusMsgEl) {
            statusMsgEl.textContent = message;
            statusMsgEl.className = "text-sm text-center font-medium text-green-600 status-msg-fixed-height";
        }
    },

    setError: function(statusMsgEl, message, colorClass = 'text-red-600') {
        if (statusMsgEl) {
            // Manejar mensajes largos para que el modal no salte
            const displayMessage = message.includes("Backend Error:") ? "Error de comunicación con el Banco. Consulte el detalle en consola." : message;
            statusMsgEl.textContent = `Error: ${displayMessage}`;
            statusMsgEl.className = `text-sm text-center font-medium ${colorClass} status-msg-fixed-height`;
            console.error("Error Transacción:", message);
        }
    }
};

// --- CONTENIDO ESTATICOS (Términos, Privacidad) ---
const AppContent = {
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
    // Escapar comillas simples para ser usado en atributos onclick
    return str.replace(/'/g, "\\'").replace(/"/g, "&quot;");
}

// Exportar funciones a la ventana global para que los eventos onclick en el HTML las encuentren
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
    
    // Configuración de la animación de relleno del slider
    const setupSliderFill = () => {
        const inputs = document.querySelectorAll('input[type="range"]');
        inputs.forEach(input => {
            const update = () => AppUI.updateSliderFill(input);
            update();
            input.addEventListener('input', update);
        });
    };
    
    // Inicializa el carrusel al primer slide
    AppUI.goToHeroSlide(0); 

    setTimeout(() => {
        // Asegurar que los sliders se inicialicen y los listeners de pestañas funcionen después de la carga inicial
        setupSliderFill();
        
        // Listener delegado para el modal combinado (para pestañas y cerrar al hacer clic en fondo)
        document.getElementById('transacciones-combinadas-modal').addEventListener('click', (e) => {
             // 1. Manejo de cambio de pestaña
             if (e.target.classList.contains('tab-btn') && e.target.closest('#transacciones-combinadas-modal')) {
                 AppUI.changeTransaccionesCombinadasTab(e.target.dataset.tab);
             }
             // 2. Manejo de cierre al hacer click en el fondo (ya está en init, pero se mantiene la lógica defensiva)
             if (e.target.id === 'transacciones-combinadas-modal') {
                 AppUI.hideModal('transacciones-combinadas-modal');
             }
        });

        // Vuelve a aplicar el relleno del slider si la pestaña cambia DENTRO del modal combinado
        document.getElementById('transacciones-combinadas-modal').addEventListener('click', (e) => {
            if (e.target.classList.contains('tab-btn')) {
                 setTimeout(setupSliderFill, 10);
            }
        });
        
    }, 500); 
    
    // Inicia la animación shimmer y los puntos modernos al cargar el script
    document.querySelectorAll('.loading-shimmer-text, .loading-dot').forEach(el => {
        // La animación está pausada por CSS, la iniciamos aquí.
        el.style.animationPlayState = 'running';
    });

};
