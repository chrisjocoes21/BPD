// --- CONFIGURACIÓN ---
const AppConfig = {
    // CAMBIO V0.2.2: URL de tu nueva API unificada (implementada con Tesorería/Préstamos/Depósitos)
    API_URL: 'https://script.google.com/macros/s/AKfycbyhPHZuRmC7_t9z20W4h-VPqVFk0z6qKFG_W-YXMgnth4BMRgi8ibAfjeOtIeR5OrFPXw/exec',
    TRANSACCION_API_URL: 'https://script.google.com/macros/s/AKfycbyhPHZuRmC7_t9z20W4h-VPqVFk0z6qKFG_W-YXMgnth4BMRgi8ibAfjeOtIeR5OrFPXw/exec',
    CLAVE_MAESTRA: 'PinceladasM25-26',
    SPREADSHEET_URL: 'https://docs.google.com/spreadsheets/d/1GArB7I19uGum6awiRN6qK8HtmTWGcaPGWhOzGCdhbcs/edit?usp=sharing',
    INITIAL_RETRY_DELAY: 1000,
    MAX_RETRY_DELAY: 30000,
    MAX_RETRIES: 5,
    CACHE_DURATION: 300000,
    
    // CAMBIO V0.2.2: Versión y Estado de la Aplicación
    APP_STATUS: 'Pre-Alfa', 
    APP_VERSION: 'v0.2.2', 
};

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
    transaccionSelectAll: {}, 
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
    formatNumber: (num) => new Intl.NumberFormat('es-DO').format(num)
};

// --- BASE DE DATOS DE ANUNCIOS ---
const AnunciosDB = {
    'AVISO': [
        "La subasta de fin de mes es el último Jueves de cada mes. ¡Preparen sus pinceles!",
        "Revisen sus saldos antes del cierre de mes. No se aceptan saldos negativos en la subasta.",
        "Recuerden: 'Ver Reglas' tiene información importante sobre la participación en la subasta y la 'Cicla'."
    ],
    'NUEVO': [
        // CAMBIO V0.2.2: Avisos sobre el nuevo sistema económico
        "¡Nuevo Sistema Económico Bancario! Los depósitos de admin están limitados por la Tesorería.",
        "Nueva sección 'Préstamos' y 'Depósitos' en el Panel de Administración (botón verde).",
        "La Tesorería del Banco cobra un 0.05% diario de impuesto a saldos altos y ofrece un Ingreso Pasivo Diario."
    ],
    'CONSEJO': [
        "Usa el botón '»' en la esquina superior para abrir y cerrar la barra lateral de grupos.",
        "Haz clic en el nombre de un alumno en la tabla para ver sus estadísticas detalladas.",
        "Usa el botón 'Ver Todos' en el tablón de anuncios para no perderte ninguna novedad.",
        "¡Invierte! Usa los Depósitos a Plazo para obtener retornos fijos y seguros en 7, 14 o 21 días."
    ],
    'ALERTA': [
        "¡Cuidado! Saldos negativos (incluso -1 ℙ) te mueven automáticamente a Cicla.",
        "Los alumnos en Cicla pueden solicitar préstamos de rescate, pero están limitados por el tamaño de su deuda.",
        "Si tienes un préstamo activo, NO puedes crear un Depósito a Plazo. ¡Suelda tu deuda primero!"
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
                
                // CAMBIO V0.2.2: La API devuelve un objeto { gruposData, saldoTesoreria, prestamosActivos, depositosActivos }
                AppState.datosActuales = AppData.procesarYMostrarDatos(data);
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
    
    procesarYMostrarDatos: function(data) {
        // 1. Separar Tesorería y Datos Adicionales
        AppState.datosAdicionales.saldoTesoreria = data.saldoTesoreria || 0;
        AppState.datosAdicionales.prestamosActivos = data.prestamosActivos || [];
        AppState.datosAdicionales.depositosActivos = data.depositosActivos || [];
        
        const allGroups = data.gruposData;
        
        let gruposOrdenados = Object.entries(allGroups).map(([nombre, info]) => ({ nombre, total: info.total || 0, usuarios: info.usuarios || [] }));
        
        // 2. Separar Cicla (que viene en el array)
        const ciclaGroup = gruposOrdenados.find(g => g.nombre === 'Cicla');
        const activeGroups = gruposOrdenados.filter(g => g.nombre !== 'Cicla' && g.nombre !== 'Banco');

        // 3. Crear lista plana de todos los alumnos
        AppState.datosAdicionales.allStudents = activeGroups.flatMap(g => g.usuarios).concat(ciclaGroup ? ciclaGroup.usuarios : []);
        
        // Asignar el nombre del grupo a cada alumno para fácil búsqueda
        activeGroups.forEach(g => {
            g.usuarios.forEach(u => u.grupoNombre = g.nombre);
        });
        if (ciclaGroup) {
            ciclaGroup.usuarios.forEach(u => u.grupoNombre = 'Cicla');
        }


        // 4. Ordenar y filtrar
        activeGroups.sort((a, b) => b.total - a.total);
        if (ciclaGroup) {
            activeGroups.push(ciclaGroup);
        }
        
        // 5. Detectar cambios antes de actualizar el estado
        AppData.detectarCambios(activeGroups);

        // 6. Actualizar UI
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
        return activeGroups; // Devuelve solo los grupos limpios y ordenados (con Cicla al final)
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

        // V0.2.2: Listeners para el nuevo Modal de Administración (Tabs)
        document.getElementById('transaccion-modal-close-btn').addEventListener('click', () => AppUI.hideModal('transaccion-modal'));
        document.getElementById('transaccion-cancel-btn').addEventListener('click', () => AppUI.hideModal('transaccion-modal'));
        document.getElementById('transaccion-modal').addEventListener('click', (e) => {
            if (e.target.id === 'transaccion-modal') AppUI.hideModal('transaccion-modal');
        });
        
        // Listener para el botón de enviar transacción
        document.getElementById('transaccion-submit-btn').addEventListener('click', AppTransacciones.realizarTransaccionMultiple);
        
        // Listener para el link de DB
        document.getElementById('db-link-btn').href = AppConfig.SPREADSHEET_URL;

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

        // V0.2.2: Listeners de cambio de Pestaña
        document.querySelectorAll('.tab-btn').forEach(button => {
            button.addEventListener('click', (e) => {
                const tabId = e.target.dataset.tab;
                AppUI.changeAdminTab(tabId);
            });
        });

        // V0.2.2: Mostrar versión de la App
        AppUI.mostrarVersionApp();

        // Carga inicial
        AppData.cargarDatos(false);
        setInterval(() => AppData.cargarDatos(false), 10000); 
        AppUI.updateCountdown();
        setInterval(AppUI.updateCountdown, 1000);
        
        AppUI.poblarModalAnuncios();
    },

    // V0.2.2: Nueva función para mostrar la versión de la App
    mostrarVersionApp: function() {
        const versionContainer = document.getElementById('app-version-container');
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

        // Limpiar campos si se cierra el modal de transacciones
        if (modalId === 'transaccion-modal') {
            document.getElementById('transaccion-lista-grupos-container').innerHTML = '';
            document.getElementById('transaccion-lista-usuarios-container').innerHTML = '';
            document.getElementById('transaccion-cantidad-input').value = "";
            document.getElementById('transaccion-status-msg').textContent = "";
            
            // Limpiar select de Préstamos/Depósitos
            document.getElementById('prestamo-alumno-select').value = "";
            document.getElementById('deposito-alumno-select').value = "";
            document.getElementById('prestamo-paquetes-container').innerHTML = '<div class="text-sm text-gray-500">Seleccione un alumno para ver las opciones de préstamo.</div>';
            document.getElementById('deposito-paquetes-container').innerHTML = '<div class="text-sm text-gray-500">Seleccione un alumno para ver las opciones de depósito.</div>';
            
            AppState.transaccionSelectAll = {}; 
            
            document.getElementById('transaccion-submit-btn').disabled = false;
            document.getElementById('transaccion-btn-text').textContent = 'Realizar Transacción'; 
        }
        
        if (modalId === 'gestion-modal') {
             document.getElementById('clave-input').value = "";
             document.getElementById('clave-input').classList.remove('shake', 'border-red-500');
        }
    },
    
    // V0.2.2: Función para cambiar entre pestañas del modal de administración
    changeAdminTab: function(tabId) {
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.remove('active-tab', 'border-blue-600', 'text-blue-600');
            btn.classList.add('border-transparent', 'text-gray-600');
        });

        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.add('hidden');
        });

        document.querySelector(`[data-tab="${tabId}"]`).classList.add('active-tab', 'border-blue-600', 'text-blue-600');
        document.querySelector(`[data-tab="${tabId}"]`).classList.remove('border-transparent', 'text-gray-600');
        document.getElementById(`tab-${tabId}`).classList.remove('hidden');
        
        // Recargar contenido específico para la pestaña
        if (tabId === 'transaccion') {
            AppUI.populateGruposTransaccion();
        } else if (tabId === 'prestamos') {
            AppUI.populateAlumnosSelect('prestamo-alumno-select', AppUI.loadPrestamoPaquetes);
            AppUI.loadPrestamoPaquetes(null); // Inicializar sin alumno
        } else if (tabId === 'depositos') {
            AppUI.populateAlumnosSelect('deposito-alumno-select', AppUI.loadDepositoPaquetes);
            AppUI.loadDepositoPaquetes(null); // Inicializar sin alumno
        }
        
        // Limpiar el mensaje de estado general
        document.getElementById('transaccion-status-msg').textContent = "";
    },


    // V0.2.2: Funciones para poblar Selects (Préstamos/Depósitos)
    populateAlumnosSelect: function(selectId, changeListener) {
        const select = document.getElementById(selectId);
        select.innerHTML = '<option value="" disabled selected>Seleccione un alumno...</option>';
        select.removeEventListener('change', changeListener); // Limpiar listener viejo

        const sortedStudents = [...AppState.datosAdicionales.allStudents].sort((a, b) => a.nombre.localeCompare(b.nombre));

        sortedStudents.forEach(student => {
            const option = document.createElement('option');
            option.value = student.nombre;
            option.textContent = `${student.nombre} (${student.grupoNombre})`;
            option.dataset.saldo = student.pinceles;
            select.appendChild(option);
        });

        select.addEventListener('change', (e) => {
            changeListener(e.target.value);
        });
    },

    // --- FUNCIÓN CENTRAL: Mostrar Modal de Administración y pestaña inicial ---
    showTransaccionModal: function(tab) {
        if (!AppState.datosActuales) {
            // No alert(), usar el mensaje de estado si existiera, pero para esto es mejor un modal simple.
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
            if (grupo.nombre === 'Cicla') return; // No mostrar 'Cicla' para transacciones múltiples

            const div = document.createElement('div');
            div.className = "flex items-center p-1 rounded hover:bg-gray-200";
            
            const input = document.createElement('input');
            input.type = "checkbox";
            input.id = `group-cb-${grupo.nombre}`;
            input.value = grupo.nombre;
            input.className = "h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 group-checkbox";
            input.addEventListener('change', AppUI.populateUsuariosTransaccion);

            const label = document.createElement('label');
            label.htmlFor = input.id;
            label.textContent = grupo.nombre;
            label.className = "ml-2 block text-sm text-gray-900 cursor-pointer flex-1";

            div.appendChild(input);
            div.appendChild(label);
            grupoContainer.appendChild(div);
        });

        document.getElementById('transaccion-lista-usuarios-container').innerHTML = '<span class="text-sm text-gray-500 p-2">Seleccione un grupo...</span>';
        AppState.transaccionSelectAll = {}; 
        
        // V0.2.2: Mostrar el saldo de Tesorería en la pestaña Transacción
        document.getElementById('tesoreria-saldo-transaccion').textContent = `(Fondos disponibles: ${AppFormat.formatNumber(AppState.datosAdicionales.saldoTesoreria)} ℙ)`;
    },

    // V0.2.2: Función para poblar USUARIOS de la pestaña Transacción
    populateUsuariosTransaccion: function() {
        const checkedGroups = document.querySelectorAll('#transaccion-lista-grupos-container input[type="checkbox"]:checked');
        const selectedGroupNames = Array.from(checkedGroups).map(cb => cb.value);
        
        const listaContainer = document.getElementById('transaccion-lista-usuarios-container');
        listaContainer.innerHTML = ''; 

        if (selectedGroupNames.length === 0) {
            listaContainer.innerHTML = '<span class="text-sm text-gray-500 p-2">Seleccione un grupo...</span>';
            return;
        }

        selectedGroupNames.forEach(grupoNombre => {
            const grupo = AppState.datosActuales.find(g => g.nombre === grupoNombre);

            if (grupo && grupo.usuarios && grupo.usuarios.length > 0) {
                const headerDiv = document.createElement('div');
                headerDiv.className = "flex justify-between items-center bg-gray-200 p-2 mt-2 sticky top-0"; 
                headerDiv.innerHTML = `<span class="text-sm font-semibold text-gray-700">${grupo.nombre}</span>`;
                
                const btnSelectAll = document.createElement('button');
                btnSelectAll.textContent = "Todos";
                btnSelectAll.dataset.grupo = grupo.nombre; 
                btnSelectAll.className = "text-xs font-medium text-blue-600 hover:text-blue-800 select-all-users-btn";
                AppState.transaccionSelectAll[grupo.nombre] = false; 
                btnSelectAll.addEventListener('click', AppUI.toggleSelectAllUsuarios);
                
                headerDiv.appendChild(btnSelectAll);
                listaContainer.appendChild(headerDiv);

                const usuariosOrdenados = [...grupo.usuarios].sort((a, b) => a.nombre.localeCompare(b.nombre));

                usuariosOrdenados.forEach(usuario => {
                    const div = document.createElement('div');
                    div.className = "flex items-center p-1 rounded hover:bg-gray-200 ml-2"; 
                    
                    const input = document.createElement('input');
                    input.type = "checkbox";
                    input.id = `user-cb-${grupo.nombre}-${usuario.nombre.replace(/\s/g, '-')}`; 
                    input.value = usuario.nombre;
                    input.dataset.grupo = grupo.nombre; 
                    input.className = "h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 user-checkbox";
                    input.dataset.checkboxGrupo = grupo.nombre; 

                    const label = document.createElement('label');
                    label.htmlFor = input.id;
                    label.textContent = usuario.nombre;
                    label.className = "ml-2 block text-sm text-gray-900 cursor-pointer flex-1";

                    div.appendChild(input);
                    div.appendChild(label);
                    listaContainer.appendChild(div);
                });
            }
        });
        
        if (listaContainer.innerHTML === '') {
             listaContainer.innerHTML = '<span class="text-sm text-gray-500 p-2">Los grupos seleccionados no tienen usuarios.</span>';
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
        const select = document.getElementById('prestamo-alumno-select');
        const saldoSpan = document.getElementById('prestamo-alumno-saldo');
        
        // V0.2.2: Mostrar el saldo de Tesorería en la pestaña Préstamos
        document.getElementById('tesoreria-saldo-prestamo').textContent = `(Tesorería: ${AppFormat.formatNumber(AppState.datosAdicionales.saldoTesoreria)} ℙ)`;

        if (!selectedStudentName) {
            container.innerHTML = '<div class="text-sm text-gray-500">Seleccione un alumno para ver las opciones de préstamo.</div>';
            saldoSpan.textContent = '';
            return;
        }

        const student = AppState.datosAdicionales.allStudents.find(s => s.nombre === selectedStudentName);
        if (!student) return;
        
        saldoSpan.textContent = `(Saldo actual: ${AppFormat.formatNumber(student.pinceles)} ℙ)`;

        // Mapeo de paquetes (debería coincidir con el backend)
        const paquetes = {
            'rescate': { monto: 15000, interes: 25, label: "Rescate" },
            'estandar': { monto: 50000, interes: 20, label: "Estándar" },
            'inversion': { monto: 120000, interes: 15, label: "Inversión" }
        };
        
        let html = '';
        let hasActiveLoan = AppState.datosAdicionales.prestamosActivos.some(p => p.alumno === selectedStudentName);

        if (hasActiveLoan) {
             container.innerHTML = `<div class="p-3 text-sm font-semibold text-red-700 bg-red-100 rounded-lg">🚫 El alumno ya tiene un préstamo activo.</div>`;
             return;
        }

        Object.keys(paquetes).forEach(tipo => {
            const pkg = paquetes[tipo];
            const totalAPagar = pkg.monto * (1 + pkg.interes / 100);
            
            // Lógica de elegibilidad del frontend
            let isEligible = true;
            let eligibilityMessage = '';

            if (student.pinceles >= 0) { // RUTA A: Positivo o Cero
                const capacidad = student.pinceles * 0.50;
                if (pkg.monto > capacidad) {
                    isEligible = false;
                    eligibilityMessage = `(Máx: ${AppFormat.formatNumber(capacidad.toFixed(0))} ℙ)`;
                }
            } else { // RUTA B: Cicla
                if (tipo !== 'rescate') {
                    isEligible = false;
                    eligibilityMessage = `(Solo Rescate)`;
                } else if (Math.abs(student.pinceles) >= pkg.monto) {
                    isEligible = false;
                    eligibilityMessage = `(Deuda muy alta: ${AppFormat.formatNumber(Math.abs(student.pinceles))} ℙ)`;
                }
            }
            
            // V0.2.2: Verificar si la Tesorería tiene fondos para este préstamo
            if (isEligible && AppState.datosAdicionales.saldoTesoreria < pkg.monto) {
                isEligible = false;
                eligibilityMessage = `(Tesorería sin fondos)`;
            }


            const buttonClass = isEligible ? 'bg-blue-600 hover:bg-blue-700' : 'bg-gray-400 cursor-not-allowed';
            const buttonDisabled = !isEligible ? 'disabled' : '';
            const action = isEligible ? `AppTransacciones.realizarPrestamo('${selectedStudentName}', '${tipo}')` : '';

            html += `
                <div class="flex justify-between items-center p-3 border-b border-blue-100">
                    <div>
                        <span class="font-semibold text-gray-800">${pkg.label} (${AppFormat.formatNumber(pkg.monto)} ℙ)</span>
                        <span class="text-xs text-gray-500 block">Tasa: ${pkg.interes}% (7 días). Total: ${AppFormat.formatNumber(totalAPagar)} ℙ.</span>
                    </div>
                    <button onclick="${action}" class="px-3 py-1 text-xs font-medium text-white rounded-lg transition-colors ${buttonClass}" ${buttonDisabled}>
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
        const select = document.getElementById('deposito-alumno-select');
        const saldoSpan = document.getElementById('deposito-alumno-saldo');
        
        // V0.2.2: Mostrar info de Tesorería en Depósitos
        document.getElementById('deposito-info-tesoreria').textContent = `(Tesorería: ${AppFormat.formatNumber(AppState.datosAdicionales.saldoTesoreria)} ℙ)`;

        if (!selectedStudentName) {
            container.innerHTML = '<div class="text-sm text-gray-500">Seleccione un alumno para ver las opciones de depósito.</div>';
            saldoSpan.textContent = '';
            return;
        }

        const student = AppState.datosAdicionales.allStudents.find(s => s.nombre === selectedStudentName);
        if (!student) return;

        saldoSpan.textContent = `(Saldo actual: ${AppFormat.formatNumber(student.pinceles)} ℙ)`;

        // Mapeo de paquetes (debería coincidir con el backend)
        const paquetes = {
            'ahorro_express': { monto: 50000, interes: 8, plazo: 7, label: "Ahorro Express" },
            'fondo_fiduciario': { monto: 150000, interes: 15, plazo: 14, label: "Fondo Fiduciario" },
            'capital_estrategico': { monto: 300000, interes: 22, plazo: 21, label: "Capital Estratégico" }
        };

        let html = '';
        let hasActiveLoan = AppState.datosAdicionales.prestamosActivos.some(p => p.alumno === selectedStudentName);

        if (hasActiveLoan) {
             container.innerHTML = `<div class="p-3 text-sm font-semibold text-red-700 bg-red-100 rounded-lg">🚫 El alumno tiene un préstamo activo. Debe saldarlo para invertir.</div>`;
             return;
        }
        
        Object.keys(paquetes).forEach(tipo => {
            const pkg = paquetes[tipo];
            const totalARecibir = pkg.monto * (1 + pkg.interes / 100);
            
            // Lógica de elegibilidad del frontend
            let isEligible = student.pinceles >= pkg.monto;
            let eligibilityMessage = '';

            if (!isEligible) {
                eligibilityMessage = `(Faltan ${AppFormat.formatNumber(pkg.monto - student.pinceles)} ℙ)`;
            }

            const buttonClass = isEligible ? 'bg-green-600 hover:bg-green-700' : 'bg-gray-400 cursor-not-allowed';
            const buttonDisabled = !isEligible ? 'disabled' : '';
            const action = isEligible ? `AppTransacciones.realizarDeposito('${selectedStudentName}', '${tipo}')` : '';

            html += `
                <div class="flex justify-between items-center p-3 border-b border-green-100">
                    <div>
                        <span class="font-semibold text-gray-800">${pkg.label} (${AppFormat.formatNumber(pkg.monto)} ℙ)</span>
                        <span class="text-xs text-gray-500 block">Tasa: ${pkg.interes}% (${pkg.plazo} días). Recibe: ${AppFormat.formatNumber(totalARecibir)} ℙ.</span>
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

        dot.classList.remove('bg-green-600', 'bg-blue-600', 'bg-red-600', 'animate-pulse-dot');

        switch (status) {
            case 'ok':
                dot.classList.add('bg-green-600', 'animate-pulse-dot');
                break;
            case 'loading':
                dot.classList.add('bg-blue-600', 'animate-pulse-dot');
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
        const btn = document.getElementById('toggle-sidebar-btn');
        
        AppState.isSidebarOpen = !AppState.isSidebarOpen; 

        if (AppState.isSidebarOpen) {
            sidebar.classList.remove('-translate-x-full');
            btn.innerHTML = '«'; // Flecha de cerrar
        } else {
            sidebar.classList.add('-translate-x-full');
            btn.innerHTML = '»'; // Flecha de abrir
        }
    },

    actualizarSidebar: function(grupos) {
        const nav = document.getElementById('sidebar-nav');
        nav.innerHTML = ''; 
        
        const homeLink = document.createElement('a');
        homeLink.href = '#';
        homeLink.dataset.groupName = "home"; 
        homeLink.className = "flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium transition-colors nav-link";
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
            link.className = "flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium transition-colors nav-link";
            
            let totalColor = "text-gray-600";
            if (grupo.total < 0) totalColor = "text-red-600";
            if (grupo.total > 0) totalColor = "text-green-600";

            link.innerHTML = `
                <span class="truncate">${grupo.nombre}</span>
                <span class="text-xs font-semibold ${totalColor}">${AppFormat.formatNumber(grupo.total)} ℙ</span>
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
                link.classList.add('bg-blue-50', 'text-blue-600');
                link.classList.remove('text-gray-700', 'hover:bg-gray-100');
            } else {
                link.classList.remove('bg-blue-50', 'text-blue-600');
                link.classList.add('text-gray-700', 'hover:bg-gray-100');
            }
        });
    },

    /**
     * Muestra la vista de "Inicio"
     */
    mostrarPantallaNeutral: function(grupos) {
        document.getElementById('main-header-title').textContent = "Bienvenido al Banco del Pincel Dorado";
        document.getElementById('page-subtitle').innerHTML = ''; 

        const tableContainer = document.getElementById('table-container');
        tableContainer.innerHTML = '';
        tableContainer.classList.add('hidden');

        // 1. MOSTRAR RESUMEN COMPACTO
        const homeStatsContainer = document.getElementById('home-stats-container');
        const bovedaContainer = document.getElementById('boveda-card-container');
        const top3Grid = document.getElementById('top-3-grid');
        
        let bovedaHtml = '';
        let top3Html = '';

        // Tarjeta de Bóveda
        const totalGeneral = grupos.reduce((acc, g) => acc + g.total, 0);
        
        // CAMBIO V0.2.2: Tarjeta de Tesorería (NUEVA)
        const tesoreriaSaldo = AppState.datosAdicionales.saldoTesoreria;
        
        bovedaHtml = `
            <div class="bg-white rounded-lg shadow-md p-4">
                <div class="flex items-center justify-between mb-2">
                    <span class="text-sm font-medium text-gray-500 truncate">Total en Cuentas</span>
                    <span class="text-xs font-bold bg-green-100 text-green-700 rounded-full px-2 py-0.5">BÓVEDA</span>
                </div>
                <p class="text-lg font-semibold text-gray-900 truncate">Pinceles Totales</p>
                <p class="text-xl font-bold text-green-600 text-right">${AppFormat.formatNumber(totalGeneral)} ℙ</p>
            </div>
            
            <div class="bg-white rounded-lg shadow-md p-4">
                <div class="flex items-center justify-between mb-2">
                    <span class="text-sm font-medium text-gray-500 truncate">Capital Operativo</span>
                    <span class="text-xs font-bold bg-blue-100 text-blue-700 rounded-full px-2 py-0.5">TESORERÍA</span>
                </div>
                <p class="text-lg font-semibold text-gray-900 truncate">Fondo del Banco</p>
                <p class="text-xl font-bold text-blue-600 text-right">${AppFormat.formatNumber(tesoreriaSaldo)} ℙ</p>
            </div>
        `;
        
        // Tarjetas Top 3 Alumnos
        const top3 = AppState.datosAdicionales.allStudents.sort((a, b) => b.pinceles - a.pinceles).slice(0, 3);

        if (top3.length > 0) {
            top3Html = top3.map((student, index) => {
                let rankColor = 'bg-blue-100 text-blue-700';
                if (index === 0) rankColor = 'bg-yellow-100 text-yellow-700';
                if (index === 1) rankColor = 'bg-gray-100 text-gray-700';
                if (index === 2) rankColor = 'bg-orange-100 text-orange-700';
                const grupoNombre = student.grupoNombre || 'N/A';

                return `
                    <div class="bg-white rounded-lg shadow-md p-4">
                        <div class="flex items-center justify-between mb-2">
                            <span class="text-sm font-medium text-gray-500 truncate">${grupoNombre}</span>
                            <span class="text-xs font-bold ${rankColor} rounded-full px-2 py-0.5">${index + 1}º</span>
                        </div>
                        <p class="text-lg font-semibold text-gray-900 truncate">${student.nombre}</p>
                        <p class="text-xl font-bold text-blue-600 text-right">${AppFormat.formatNumber(student.pinceles)} ℙ</p>
                    </div>
                `;
            }).join('');
        }
        for (let i = top3.length; i < 3; i++) {
            top3Html += `
                <div class="bg-white rounded-lg shadow-md p-4 opacity-50">
                    <div class="flex items-center justify-between mb-2"><span class="text-sm font-medium text-gray-400">-</span><span class="text-xs font-bold bg-gray-100 text-gray-400 rounded-full px-2 py-0.5">${i + 1}º</span></div>
                    <p class="text-lg font-semibold text-gray-400 truncate">-</p>
                    <p class="text-xl font-bold text-gray-400 text-right">- ℙ</p>
                </div>
            `;
        }

        bovedaContainer.innerHTML = bovedaHtml;
        top3Grid.innerHTML = top3Html;
        
        homeStatsContainer.classList.remove('hidden');
        
        // 2. MOSTRAR MÓDULOS (Idea 1 & 2)
        document.getElementById('home-modules-grid').classList.remove('hidden');
        AppUI.actualizarAlumnosEnRiesgo();
        AppUI.actualizarAnuncios(); 
        AppUI.actualizarEstadisticasRapidas(grupos);
        
        // 3. MOSTRAR ACCESO RÁPIDO (Idea 3)
        document.getElementById('acceso-rapido-container').classList.remove('hidden');
    },

    /**
     * Muestra la tabla de un grupo específico
     */
    mostrarDatosGrupo: function(grupo) {
        document.getElementById('main-header-title').textContent = grupo.nombre;
        
        let totalColor = "text-gray-700";
        if (grupo.total < 0) totalColor = "text-red-600";
        if (grupo.total > 0) totalColor = "text-green-600";
        
        document.getElementById('page-subtitle').innerHTML = `
            <h2 class="text-xl font-semibold text-gray-800">Total del Grupo: 
                <span class="${totalColor}">${AppFormat.formatNumber(grupo.total)} ℙ</span>
            </h2>
        `;
        
        const tableContainer = document.getElementById('table-container');
        const usuariosOrdenados = [...grupo.usuarios].sort((a, b) => b.pinceles - a.pinceles);

        const filas = usuariosOrdenados.map((usuario, index) => {
            const pos = index + 1;
            
            let rankBg = 'bg-gray-100 text-gray-600';
            if (pos === 1) rankBg = 'bg-yellow-100 text-yellow-600';
            if (pos === 2) rankBg = 'bg-gray-200 text-gray-700';
            if (pos === 3) rankBg = 'bg-orange-100 text-orange-600';
            if (grupo.nombre === "Cicla") rankBg = 'bg-red-100 text-red-600';

            return `
                <tr class="hover:bg-gray-50 cursor-pointer" onclick="AppUI.showStudentModal('${grupo.nombre}', '${usuario.nombre}', ${pos})">
                    <td class="px-4 py-3 text-center">
                        <span class="inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${rankBg}">
                            ${pos}
                        </span>
                    </td>
                    <td class="px-6 py-3 text-sm font-medium text-gray-900 truncate">
                        ${usuario.nombre}
                    </td>
                    <td class="px-6 py-3 text-sm font-semibold ${usuario.pinceles < 0 ? 'text-red-600' : 'text-gray-800'} text-right">
                        ${AppFormat.formatNumber(usuario.pinceles)} ℙ
                    </td>
                </tr>
            `;
        }).join('');

        tableContainer.innerHTML = `
            <div class="overflow-x-auto">
                <table class="min-w-full divide-y divide-gray-200">
                    <thead class="bg-gray-50">
                        <tr>
                            <th class="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-16">Rank</th>
                            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nombre</th>
                            <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Pinceles</th>
                        </tr>
                    </thead>
                    <tbody class="bg-white divide-y divide-gray-200">
                        ${filas.length > 0 ? filas : '<tr><td colspan="3" class="text-center p-6 text-gray-500">No hay alumnos en este grupo.</td></tr>'}
                    </tbody>
                </table>
            </div>
        `;
        
        tableContainer.classList.remove('hidden');

        // 4. OCULTAR MÓDULOS DE HOME
        document.getElementById('home-stats-container').classList.add('hidden');
        document.getElementById('home-modules-grid').classList.add('hidden');
        document.getElementById('acceso-rapido-container').classList.add('hidden');
    },

    actualizarAlumnosEnRiesgo: function() {
        const lista = document.getElementById('riesgo-lista');
        if (!lista) return;

        // V0.2.2: Usar la lista plana de estudiantes
        const allStudents = AppState.datosAdicionales.allStudents.filter(s => s.grupoNombre !== 'Cicla');
        
        const possibleRiesgoStudents = allStudents.filter(s => s.pinceles >= 0);
        
        const enRiesgo = possibleRiesgoStudents.sort((a, b) => a.pinceles - b.pinceles);
        
        const top7Riesgo = enRiesgo.slice(0, 7); 

        if (top7Riesgo.length === 0) {
            lista.innerHTML = `<tr><td colspan="3" class="p-4 text-sm text-gray-500 text-center">No hay alumnos en riesgo por el momento.</td></tr>`;
            return;
        }

        lista.innerHTML = top7Riesgo.map((student, index) => {
            const grupoNombre = student.grupoNombre || 'N/A';
            const pinceles = AppFormat.formatNumber(student.pinceles);
            const pincelesColor = student.pinceles <= 0 ? 'text-red-600' : 'text-gray-900';

            return `
                <tr class="hover:bg-gray-50">
                    <td class="px-4 py-2 text-sm text-gray-700 font-medium truncate">${student.nombre}</td>
                    <td class="px-4 py-2 text-sm text-gray-500 whitespace-nowrap">${grupoNombre}</td>
                    <td class="px-4 py-2 text-sm font-semibold ${pincelesColor} text-right whitespace-nowrap">${pinceles} ℙ</td>
                </tr>
            `;
        }).join('');
    },
    
    actualizarEstadisticasRapidas: function(grupos) {
        const statsList = document.getElementById('quick-stats-list');
        if (!statsList) return;

        const allStudents = AppState.datosAdicionales.allStudents;
        const ciclaGrupo = grupos.find(g => g.nombre === 'Cicla');
        
        const totalAlumnos = allStudents.length;
        const totalEnCicla = ciclaGrupo ? ciclaGrupo.usuarios.length : 0;
        const totalBoveda = grupos.reduce((acc, g) => acc + g.total, 0);
        const promedioPinceles = totalAlumnos > 0 ? (totalBoveda / totalAlumnos) : 0;
        
        const pincelesPositivos = allStudents.filter(s => s.pinceles > 0).reduce((sum, user) => sum + user.pinceles, 0);
        const pincelesNegativos = allStudents.filter(s => s.pinceles < 0).reduce((sum, user) => sum + user.pinceles, 0);
        
        const createStat = (label, value, valueClass = 'text-gray-900') => `
            <div class="flex justify-between items-baseline text-sm py-2 border-b border-gray-100">
                <span class="text-gray-600">${label}:</span>
                <span class="font-semibold ${valueClass}">${value}</span>
            </div>
        `;

        statsList.innerHTML = `
            ${createStat('Alumnos Totales', totalAlumnos)}
            ${createStat('Alumnos en Cicla', totalEnCicla, 'text-red-600')}
            ${createStat('Grupos Activos', grupos.filter(g => g.nombre !== 'Cicla').length)}
            ${createStat('Pincel Promedio', `${AppFormat.formatNumber(promedioPinceles.toFixed(0))} ℙ`)}
            ${createStat('Pinceles Positivos', `${AppFormat.formatNumber(pincelesPositivos)} ℙ`, 'text-green-600')}
            ${createStat('Pinceles Negativos', `${AppFormat.formatNumber(pincelesNegativos)} ℙ`, 'text-red-600')}
        `;
    },

    actualizarAnuncios: function() {
        const lista = document.getElementById('anuncios-lista');
        
        const getRandomItem = (arr) => arr[Math.floor(Math.random() * arr.length)];
        const getUniqueRandomItems = (arr, num) => {
            const shuffled = [...arr].sort(() => 0.5 - Math.random());
            return shuffled.slice(0, num);
        };

        const anuncios = [
            ...getUniqueRandomItems(AnunciosDB['AVISO'], 2).map(texto => ({ tipo: 'AVISO', texto, bg: 'bg-gray-100', text: 'text-gray-700' })),
            ...getUniqueRandomItems(AnunciosDB['NUEVO'], 2).map(texto => ({ tipo: 'NUEVO', texto, bg: 'bg-blue-100', text: 'text-blue-700' })),
            ...getUniqueRandomItems(AnunciosDB['CONSEJO'], 1).map(texto => ({ tipo: 'CONSEJO', texto, bg: 'bg-green-100', text: 'text-green-700' })),
            ...getUniqueRandomItems(AnunciosDB['ALERTA'], 1).map(texto => ({ tipo: 'ALERTA', texto, bg: 'bg-red-100', text: 'text-red-700' }))
        ];

        lista.innerHTML = anuncios.map(anuncio => `
            <li class="flex items-start p-2 hover:bg-gray-50 rounded-lg transition-colors"> 
                <span class="text-xs font-bold ${anuncio.bg} ${anuncio.text} rounded-full w-20 text-center py-0.5 mr-3 flex-shrink-0 mt-1">${anuncio.tipo}</span>
                <span class="text-sm text-gray-700 flex-1">${anuncio.texto}</span>
            </li>
        `).join('');
    },

    poblarModalAnuncios: function() {
        const listaModal = document.getElementById('anuncios-modal-lista');
        if (!listaModal) return;

        let html = '';
        const tipos = [
            { id: 'AVISO', titulo: 'Avisos', bg: 'bg-gray-100', text: 'text-gray-700' },
            { id: 'NUEVO', titulo: 'Novedades', bg: 'bg-blue-100', text: 'text-blue-700' },
            { id: 'CONSEJO', titulo: 'Consejos', bg: 'bg-green-100', text: 'text-green-700' },
            { id: 'ALERTA', titulo: 'Alertas', bg: 'bg-red-100', text: 'text-red-700' }
        ];

        tipos.forEach(tipo => {
            const anuncios = AnunciosDB[tipo.id];
            if (anuncios && anuncios.length > 0) {
                html += `
                    <div>
                        <h4 class="text-sm font-semibold ${tipo.text} mb-2">${tipo.titulo}</h4>
                        <ul class="space-y-2">
                            ${anuncios.map(texto => `
                                <li class="flex items-start p-2 bg-gray-50 rounded-lg">
                                    <span class="text-xs font-bold ${tipo.bg} ${tipo.text} rounded-full w-20 text-center py-0.5 mr-3 flex-shrink-0 mt-1">${tipo.id}</span>
                                    <span class="text-sm text-gray-700 flex-1">${texto}</span>
                                </li>
                            `).join('')}
                        </ul>
                    </div>
                `;
            }
        });

        listaModal.innerHTML = html;
    },

    showStudentModal: function(nombreGrupo, nombreUsuario, rank) {
        const student = AppState.datosAdicionales.allStudents.find(u => u.nombre === nombreUsuario);
        const grupo = AppState.datosActuales.find(g => g.nombre === nombreGrupo);
        
        if (!student || !grupo) return;

        const modalContent = document.getElementById('student-modal-content');
        const totalPinceles = student.pinceles || 0;
        
        const gruposRankeados = AppState.datosActuales.filter(g => g.nombre !== 'Cicla');
        const rankGrupo = gruposRankeados.findIndex(g => g.nombre === nombreGrupo) + 1;
        
        // V0.2.2: Buscar si tiene préstamo o depósito activo
        const prestamoActivo = AppState.datosAdicionales.prestamosActivos.find(p => p.alumno === student.nombre);
        const depositoActivo = AppState.datosAdicionales.depositosActivos.find(d => d.alumno === student.nombre);

        const createStat = (label, value, valueClass = 'text-gray-900') => `
            <div class="bg-gray-50 p-4 rounded-lg text-center">
                <div class="text-xs font-medium text-gray-500 uppercase tracking-wide">${label}</div>
                <div class="text-2xl font-bold ${valueClass} truncate">${value}</div>
            </div>
        `;

        let extraHtml = '';
        if (prestamoActivo) {
            extraHtml = `<p class="text-sm font-bold text-red-600 text-center mt-3 p-2 bg-red-50 rounded-lg">⚠️ Préstamo Activo</p>`;
        }
        if (depositoActivo) {
            const vencimiento = new Date(depositoActivo.vencimiento);
            const fechaString = `${vencimiento.getDate()}/${vencimiento.getMonth() + 1}`;
            extraHtml = `<p class="text-sm font-bold text-green-600 text-center mt-3 p-2 bg-green-50 rounded-lg">🏦 Depósito Activo (Vence: ${fechaString})</p>`;
        }
        
        modalContent.innerHTML = `
            <div class="p-6">
                <div class="flex justify-between items-start mb-4">
                    <div>
                        <h2 class="text-xl font-semibold text-gray-900">${student.nombre}</h2>
                        <p class="text-sm font-medium text-gray-500">${grupo.nombre}</p>
                    </div>
                    <button onclick="AppUI.hideModal('student-modal')" class="text-gray-400 hover:text-gray-600 text-2xl">&times;</button>
                </div>
                <div class="grid grid-cols-2 gap-4">
                    ${createStat('Rank en Grupo', `${rank}º`, 'text-blue-600')}
                    ${createStat('Rank de Grupo', `${rankGrupo > 0 ? rankGrupo + 'º' : 'N/A'}`, 'text-blue-600')}
                    ${createStat('Total Pinceles', `${AppFormat.formatNumber(totalPinceles)} ℙ`, totalPinceles < 0 ? 'text-red-600' : 'text-green-600')}
                    ${createStat('Total Grupo', `${AppFormat.formatNumber(grupo.total)} ℙ`)}
                    ${createStat('% del Grupo', `${grupo.total !== 0 ? ((totalPinceles / grupo.total) * 100).toFixed(1) : 0}%`)}
                    ${createStat('Grupo Original', student.grupoNombre || 'N/A' )}
                </div>
                ${extraHtml}
            </div>
        `;
        AppUI.showModal('student-modal');
    },
    
    updateCountdown: function() {
        // Lógica de Subastas (mantenida)
        const getLastThursday = (year, month) => {
            const lastDayOfMonth = new Date(year, month + 1, 0);
            let lastThursday = new Date(lastDayOfMonth);
            lastThursday.setDate(lastThursday.getDate() - (lastThursday.getDay() + 3) % 7);
            return lastThursday;
        };

        const now = new Date();
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth();
        let auctionDay = getLastThursday(currentYear, currentMonth);

        const auctionStart = new Date(auctionDay.getFullYear(), auctionDay.getMonth(), auctionDay.getDate(), 0, 0, 0);
        const auctionEnd = new Date(auctionDay.getFullYear(), auctionDay.getMonth(), auctionDay.getDate(), 23, 59, 59);

        const timerEl = document.getElementById('countdown-timer');
        const messageEl = document.getElementById('auction-message');

        if (now >= auctionStart && now <= auctionEnd) {
            timerEl.classList.add('hidden');
            messageEl.classList.remove('hidden');
        } else {
            timerEl.classList.remove('hidden');
            messageEl.classList.add('hidden');

            let targetDate = auctionStart;
            if (now > auctionEnd) {
                targetDate = getLastThursday(currentYear, currentMonth + 1);
                targetDate.setHours(0, 0, 0, 0); 
            }

            const distance = targetDate - now;
            const f = (val) => String(val).padStart(2, '0');
            
            document.getElementById('days').textContent = f(Math.floor(distance / (1000 * 60 * 60 * 24)));
            document.getElementById('hours').textContent = f(Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)));
            document.getElementById('minutes').textContent = f(Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60)));
            document.getElementById('seconds').textContent = f(Math.floor((distance % (1000 * 60)) / 1000));
        }
    }
};

// --- OBJETO TRANSACCIONES (Préstamos y Depósitos) ---
const AppTransacciones = {

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
            statusMsg.textContent = errorValidacion;
            statusMsg.className = "text-sm text-center font-medium text-red-600 h-auto min-h-[1rem]";
            return;
        }

        // --- Pasa validación, iniciar transacción ---
        AppTransacciones.setLoadingState(submitBtn, btnText, true, statusMsg, `Procesando ${checkedUsers.length} transacción(es)...`);
        
        try {
            const payload = {
                accion: 'transaccion_multiple', // NUEVA ACCIÓN
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
                AppData.cargarDatos(false); 

                setTimeout(() => {
                    AppUI.hideModal('transaccion-modal');
                }, 2000); 

            } else {
                throw new Error(result.message || "Error desconocido de la API.");
            }

        } catch (error) {
            AppTransacciones.setError(statusMsg, error.message);
        } finally {
            AppTransacciones.setLoadingState(submitBtn, btnText, false);
        }
    },
    
    realizarPrestamo: async function(alumnoNombre, tipoPrestamo) {
        const modalDialog = document.getElementById('transaccion-modal-dialog');
        const submitBtn = modalDialog.querySelector(`button[onclick*="realizarPrestamo('${alumnoNombre}', '${tipoPrestamo}')"]`);
        const statusMsg = document.getElementById('transaccion-status-msg');
        
        AppTransacciones.setLoadingState(submitBtn, null, true, statusMsg, `Otorgando préstamo ${tipoPrestamo}...`);
        
        try {
            const payload = {
                accion: 'otorgar_prestamo', // NUEVA ACCIÓN
                clave: AppConfig.CLAVE_MAESTRA,
                alumnoNombre: alumnoNombre,
                tipoPrestamo: tipoPrestamo 
            };

            const response = await AppTransacciones.fetchWithExponentialBackoff(AppConfig.TRANSACCION_API_URL, {
                method: 'POST',
                body: JSON.stringify(payload), 
            });

            const result = await response.json();

            if (result.success === true) {
                AppTransacciones.setSuccess(statusMsg, result.message || "¡Préstamo otorgado con éxito!");
                AppData.cargarDatos(false); 

                setTimeout(() => {
                    AppUI.hideModal('transaccion-modal');
                }, 2000); 

            } else {
                throw new Error(result.message || "Error al otorgar el préstamo.");
            }

        } catch (error) {
            AppTransacciones.setError(statusMsg, error.message);
        } finally {
            AppTransacciones.setLoadingState(submitBtn, null, false);
        }
    },
    
    realizarDeposito: async function(alumnoNombre, tipoDeposito) {
        const modalDialog = document.getElementById('transaccion-modal-dialog');
        const submitBtn = modalDialog.querySelector(`button[onclick*="realizarDeposito('${alumnoNombre}', '${tipoDeposito}')"]`);
        const statusMsg = document.getElementById('transaccion-status-msg');
        
        AppTransacciones.setLoadingState(submitBtn, null, true, statusMsg, `Creando depósito ${tipoDeposito}...`);
        
        try {
            const payload = {
                accion: 'crear_deposito', // NUEVA ACCIÓN
                clave: AppConfig.CLAVE_MAESTRA,
                alumnoNombre: alumnoNombre,
                tipoDeposito: tipoDeposito 
            };

            const response = await AppTransacciones.fetchWithExponentialBackoff(AppConfig.TRANSACCION_API_URL, {
                method: 'POST',
                body: JSON.stringify(payload), 
            });

            const result = await response.json();

            if (result.success === true) {
                AppTransacciones.setSuccess(statusMsg, result.message || "¡Depósito creado con éxito!");
                AppData.cargarDatos(false); 

                setTimeout(() => {
                    AppUI.hideModal('transaccion-modal');
                }, 2000); 

            } else {
                throw new Error(result.message || "Error al crear el depósito.");
            }

        } catch (error) {
            AppTransacciones.setError(statusMsg, error.message);
        } finally {
            AppTransacciones.setLoadingState(submitBtn, null, false);
        }
    },
    
    // --- Utilidades de Fetch y Estado ---

    fetchWithExponentialBackoff: async function(url, options, maxRetries = 5, initialDelay = 1000) {
        for (let attempt = 0; attempt < maxRetries; attempt++) {
            try {
                const response = await fetch(url, options);
                // Si la respuesta no es 429 (Too Many Requests), devuélvela
                if (response.status !== 429) {
                    return response;
                }
                // Es 429, loggear y reintentar
                console.warn(`Attempt ${attempt + 1}: Rate limit exceeded (429). Retrying...`);
            } catch (error) {
                // Para errores de red, reintentar (a menos que sea el último intento)
                if (attempt === maxRetries - 1) throw error;
            }
            // Espera exponencial
            const delay = initialDelay * Math.pow(2, attempt) + Math.random() * 1000;
            await new Promise(resolve => setTimeout(resolve, delay));
        }
        throw new Error('Failed to fetch after multiple retries.');
    },

    setLoadingState: function(btn, btnTextEl, isLoading, statusMsgEl, message) {
        if (isLoading) {
            if (btnTextEl) btnTextEl.textContent = 'Procesando...';
            if (btn) btn.disabled = true;
            if (statusMsgEl) {
                statusMsgEl.textContent = message;
                statusMsgEl.className = "text-sm text-center font-medium text-blue-600 h-auto min-h-[1rem]";
            }
        } else {
            if (btnTextEl) btnTextEl.textContent = 'Realizar Transacción';
            if (btn) btn.disabled = false;
        }
    },

    setSuccess: function(statusMsgEl, message) {
        if (statusMsgEl) {
            statusMsgEl.textContent = message;
            statusMsgEl.className = "text-sm text-center font-medium text-green-600 h-auto min-h-[1rem]";
        }
    },

    setError: function(statusMsgEl, message) {
        if (statusMsgEl) {
            statusMsgEl.textContent = `Error: ${message}`;
            statusMsgEl.className = "text-sm text-center font-medium text-red-600 h-auto min-h-[1em]";
        }
    }
};


// --- INICIALIZACIÓN ---
window.AppUI = AppUI;
window.AppFormat = AppFormat;
window.AppTransacciones = AppTransacciones;

window.onload = function() {
    console.log("window.onload disparado. Iniciando AppUI...");
    AppUI.init();
};
