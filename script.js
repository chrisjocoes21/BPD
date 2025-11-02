// --- CONFIGURACIÓN ---
const AppConfig = {
    API_URL: 'https://script.google.com/macros/s/AKfycbzFNGHqiOlKDq5AAGhuDEDweEGgqNoJZFsGrkD3r4aGetrMYLOJtieNK1tVz9iqjvHHNg/exec',
    // NUEVA API PARA TRANSACCIONES
    TRANSACCION_API_URL: 'https://script.google.com/macros/s/AKfycbyhPHZuRmC7_t9z20W4h-VPqVFk0z6qKFG_W-YXMgnth4BMRgi8ibAfjeOtIeR5OrFPXw/exec',
    CLAVE_MAESTRA: 'PinceladasM25-26',
    // URL DE GOOGLE SHEETS (YA NO SE USA EN EL BOTÓN, PERO SE MANTIENE POR SI ACASO)
    SPREADSHEET_URL: 'https://docs.google.com/spreadsheets/d/1GArB7I19uGum6awiRN6qK8HtmTWGcaPGWhOzGCdhbcs/edit',
    INITIAL_RETRY_DELAY: 1000,
    MAX_RETRY_DELAY: 30000,
    MAX_RETRIES: 5,
    CACHE_DURATION: 300000,
};

// --- ESTADO DE LA APLICACIÓN ---
const AppState = {
    datosActuales: null,
    historialUsuarios: {}, 
    actualizacionEnProceso: false,
    retryCount: 0,
    retryDelay: AppConfig.INITIAL_RETRY_DELAY,
    cachedData: null,
    lastCacheTime: null,
    isOffline: false,
    selectedGrupo: null, 
    isSidebarOpen: false, 
};

// --- AUTENTICACIÓN ---
const AppAuth = {
    verificarClave: function() {
        const claveInput = document.getElementById('clave-input');
        if (claveInput.value === AppConfig.CLAVE_MAESTRA) {
            
            // CAMBIO: En lugar de abrir la URL, mostramos el nuevo modal de transacciones
            AppUI.hideModal('gestion-modal');
            AppUI.showTransaccionModal(); // <-- NUEVA FUNCIÓN
            
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

// --- NUEVO: Objeto para manejar transacciones ---
const AppTransacciones = {
    realizarTransaccion: async function() {
        const grupoSelect = document.getElementById('transaccion-grupo-select');
        const usuarioSelect = document.getElementById('transaccion-usuario-select');
        const cantidadInput = document.getElementById('transaccion-cantidad-input');
        const statusMsg = document.getElementById('transaccion-status-msg');
        const submitBtn = document.getElementById('transaccion-submit-btn');

        const grupo = grupoSelect.value;
        const alumno = usuarioSelect.value; // La API probablemente espera "alumno"
        const pinceles = parseInt(cantidadInput.value, 10);

        // Validación
        if (!grupo || !alumno) {
            statusMsg.textContent = "Debe seleccionar un grupo y un usuario.";
            statusMsg.className = "text-sm text-center font-medium text-red-600 h-4";
            return;
        }
        if (isNaN(pinceles) || pinceles === 0) {
            statusMsg.textContent = "La cantidad debe ser un número distinto de cero.";
            statusMsg.className = "text-sm text-center font-medium text-red-600 h-4";
            return;
        }

        // Estado de carga
        statusMsg.textContent = "Procesando...";
        statusMsg.className = "text-sm text-center font-medium text-blue-600 h-4";
        submitBtn.disabled = true;

        try {
            const payload = {
                grupo: grupo,
                alumno: alumno,
                pinceles: pinceles
            };

            const response = await fetch(AppConfig.TRANSACCION_API_URL, {
                method: 'POST',
                // Google Apps Script a veces prefiere 'text/plain' para JSON
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload),
                redirect: 'follow', // Importante para Google Apps Script
            });

            const result = await response.json();

            if (result.status === "success") {
                statusMsg.textContent = "¡Transacción exitosa!";
                statusMsg.className = "text-sm text-center font-medium text-green-600 h-4";
                
                // Limpiar formulario y recargar datos
                grupoSelect.value = "";
                usuarioSelect.innerHTML = '<option value="">Seleccione un usuario...</option>';
                usuarioSelect.disabled = true;
                cantidadInput.value = "";
                
                // Forzar recarga de datos para ver el cambio
                AppData.cargarDatos(false); 

                // Cerrar modal después de un momento
                setTimeout(() => {
                    AppUI.hideModal('transaccion-modal');
                }, 1500);

            } else {
                throw new Error(result.message || "Error desconocido de la API.");
            }

        } catch (error) {
            console.error("Error en la transacción:", error);
            statusMsg.textContent = `Error: ${error.message}`;
            statusMsg.className = "text-sm text-center font-medium text-red-600 h-4";
        } finally {
            submitBtn.disabled = false;
        }
    }
};


// --- Base de Datos de Anuncios (Textos más largos) ---
const AnunciosDB = {
    'AVISO': [
        "La subasta de fin de mes es el último Jueves de cada mes. ¡Preparen sus pinceles!",
        "Revisen sus saldos antes del cierre de mes. No se aceptan saldos negativos en la subasta.",
        "Recuerden: 'Ver Reglas' tiene información importante sobre la participación en la subasta y la 'Cicla'."
    ],
    'NUEVO': [
        "El 'Total en Bóveda' ahora se muestra en la sección de Inicio para una vista global.",
        "Nueva sección 'Alumnos en Riesgo' en la homepage para monitorear a los más cercanos a Cicla.",
        "El Top 3 Alumnos ahora es visible en el resumen. ¡Felicidades a los que están en la cima!",
        "¡Nueva sección 'Estadísticas' en la homepage! Revisa el total de alumnos y el promedio de pinceles."
    ],
    'CONSEJO': [
        "Usa el botón '»' en la esquina superior para abrir y cerrar la barra lateral de grupos.",
        "Haz clic en el nombre de un alumno en la tabla para ver sus estadísticas detalladas.",
        "Mantén un saldo positivo de pinceles para poder participar en las subastas mensuales.",
        "Usa el botón 'Ver Todos' en el tablón de anuncios para no perderte ninguna novedad."
    ],
    'ALERTA': [
        "¡Cuidado! Saldos negativos (incluso -1 ℙ) te mueven automáticamente a Cicla.",
        "Los alumnos que se encuentran en Cicla no pueden participar en la subasta de fin de mes.",
        "Para salir de Cicla se debe completar un desafío de recuperación. Habla con el administrador."
    ]
};

// --- MANEJO DE DATOS ---
const AppData = {
    
    formatNumber: (num) => new Intl.NumberFormat('es-DO').format(num),

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
            // AppUI.setConnectionStatus('loading') se llama dentro de showLoading
        } else {
            // Es una recarga, mostrar spinner de carga
            AppUI.setConnectionStatus('loading');
        }

        try {
            if (!navigator.onLine) {
                AppState.isOffline = true;
                AppUI.setConnectionStatus('error'); // NUEVO: Nube tachada
                if (AppData.isCacheValid()) {
                    await AppData.procesarYMostrarDatos(AppState.cachedData);
                } else {
                    throw new Error("Sin conexión y sin datos en caché.");
                }
            } else {
                AppState.isOffline = false;
                // AppUI.setConnectionStatus('loading'); // Ya se puso arriba
                
                const url = `${AppConfig.API_URL}?cacheBuster=${new Date().getTime()}`;
                const response = await fetch(url, { method: 'GET', cache: 'no-cache', redirect: 'follow' });

                if (!response.ok) {
                    throw new Error(`Error de red: ${response.status} ${response.statusText}`);
                }
                
                const data = await response.json();
                if (data && data.error) {
                    throw new Error(`Error de API: ${data.message}`);
                }
                
                AppState.datosActuales = AppData.procesarYMostrarDatos(data);
                AppState.cachedData = AppState.datosActuales;
                AppState.lastCacheTime = Date.now();
                AppState.retryCount = 0; // Éxito, reiniciar contador
                AppUI.setConnectionStatus('ok'); // NUEVO: Nube OK
            }

        } catch (error) {
            console.error("Error al cargar datos:", error.message);
            AppUI.setConnectionStatus('error'); // NUEVO: Nube tachada
            
            if (AppState.retryCount < AppConfig.MAX_RETRIES) {
                AppState.retryCount++;
                setTimeout(() => AppData.cargarDatos(true), AppState.retryDelay);
                AppState.retryDelay = Math.min(AppState.retryDelay * 2, AppConfig.MAX_RETRY_DELAY);
            } else if (AppData.isCacheValid()) {
                console.warn("Fallaron los reintentos. Mostrando datos de caché.");
                AppState.datosActuales = AppData.procesarYMostrarDatos(AppState.cachedData);
                // Mantenemos la nube tachada porque la conexión falló, aunque tengamos caché.
            } else {
                console.error("Fallaron todos los reintentos y no hay caché.");
            }
        } finally {
            AppState.actualizacionEnProceso = false;
            AppUI.hideLoading();
        }
    },

    // CAMBIO: Simplificada la detección de cambios, ya no rastrea "trending"
    detectarCambios: function(nuevosDatos) {
        if (!AppState.datosActuales) return; 

        nuevosDatos.forEach(grupo => {
            (grupo.usuarios || []).forEach(usuario => {
                const claveUsuario = `${grupo.nombre}-${usuario.nombre}`;
                const historial = AppState.historialUsuarios[claveUsuario] || { pinceles: 0 };

                if (usuario.pinceles !== historial.pinceles) {
                    historial.pinceles = usuario.pinceles;
                }
                AppState.historialUsuarios[claveUsuario] = historial;
            });
        });
    },
    
    procesarYMostrarDatos: function(data) {
        let gruposOrdenados = Object.entries(data).map(([nombre, info]) => ({ nombre, total: info.total || 0, usuarios: info.usuarios || [] }));
        const negativeUsers = [];

        gruposOrdenados.forEach(grupo => {
            grupo.usuarios = (grupo.usuarios || []).filter(usuario => {
                if (usuario.pinceles < 0) {
                    negativeUsers.push({ ...usuario, grupoOriginal: grupo.nombre });
                    return false;
                }
                usuario.grupoNombre = grupo.nombre; 
                return true;
            });
            grupo.total = grupo.usuarios.reduce((sum, user) => sum + user.pinceles, 0);
        });

        if (negativeUsers.length > 0) {
            gruposOrdenados.push({ nombre: "Cicla", total: negativeUsers.reduce((sum, user) => sum + user.pinceles, 0), usuarios: negativeUsers });
        }

        gruposOrdenados = gruposOrdenados.filter(g => g.total !== 0 || (g.nombre === "Cicla" && g.usuarios.length > 0));
        gruposOrdenados.sort((a, b) => b.total - a.total);
        
        // Detectar cambios antes de actualizar el estado
        AppData.detectarCambios(gruposOrdenados);

        // Actualizar UI
        AppUI.actualizarSidebar(gruposOrdenados);
        
        if (AppState.selectedGrupo) {
            const grupoActualizado = gruposOrdenados.find(g => g.nombre === AppState.selectedGrupo);
            if (grupoActualizado) {
                AppUI.mostrarDatosGrupo(grupoActualizado);
            } else {
                AppState.selectedGrupo = null;
                AppUI.mostrarPantallaNeutral(gruposOrdenados);
            }
        } else {
            AppUI.mostrarPantallaNeutral(gruposOrdenados);
        }
        
        AppUI.actualizarSidebarActivo();
        return gruposOrdenados;
    }
};

// --- MANEJO DE LA INTERFAZ (UI) ---
const AppUI = {
    
    // --- CAMBIO: Añadidos console.log para depurar el error de carga ---
    init: function() {
        console.log("AppUI.init() comenzando.");
        
        // Listeners Modales de Gestión (Clave)
        console.log("Buscando 'gestion-btn'...");
        const gestionBtn = document.getElementById('gestion-btn');
        console.log("Buscando 'gestion-btn':", gestionBtn);
        // El error ocurría aquí si gestionBtn era null
        gestionBtn.addEventListener('click', () => AppUI.showModal('gestion-modal'));

        console.log("Buscando 'modal-cancel'...");
        document.getElementById('modal-cancel').addEventListener('click', () => AppUI.hideModal('gestion-modal'));
        console.log("Buscando 'modal-submit'...");
        document.getElementById('modal-submit').addEventListener('click', AppAuth.verificarClave);
        console.log("Buscando 'gestion-modal' (para cierre)...");
        document.getElementById('gestion-modal').addEventListener('click', (e) => {
            if (e.target.id === 'gestion-modal') AppUI.hideModal('gestion-modal');
        });
        console.log("Buscando 'student-modal' (para cierre)...");
        document.getElementById('student-modal').addEventListener('click', (e) => {
            if (e.target.id === 'student-modal') AppUI.hideModal('student-modal');
        });

        // NUEVO: Listeners para Modal de Transacciones
        document.getElementById('transaccion-modal-close').addEventListener('click', () => AppUI.hideModal('transaccion-modal'));
        document.getElementById('transaccion-cancel-btn').addEventListener('click', () => AppUI.hideModal('transaccion-modal'));
        document.getElementById('transaccion-modal').addEventListener('click', (e) => {
            if (e.target.id === 'transaccion-modal') AppUI.hideModal('transaccion-modal');
        });
        // Listener para el <select> de grupos
        document.getElementById('transaccion-grupo-select').addEventListener('change', AppUI.populateUsuariosTransaccion);
        // Listener para el botón de enviar transacción
        document.getElementById('transaccion-submit-btn').addEventListener('click', AppTransacciones.realizarTransaccion);


        // Listeners Modal Reglas
        console.log("Buscando 'reglas-btn'...");
        document.getElementById('reglas-btn').addEventListener('click', () => AppUI.showModal('reglas-modal'));
        console.log("Buscando 'reglas-modal-close'...");
        document.getElementById('reglas-modal-close').addEventListener('click', () => AppUI.hideModal('reglas-modal'));
        console.log("Buscando 'reglas-modal' (para cierre)...");
        document.getElementById('reglas-modal').addEventListener('click', (e) => {
            if (e.target.id === 'reglas-modal') AppUI.hideModal('reglas-modal');
        });

        // NUEVO: Listeners Modal Anuncios
        console.log("Buscando 'anuncios-modal-btn'...");
        document.getElementById('anuncios-modal-btn').addEventListener('click', () => AppUI.showModal('anuncios-modal'));
        console.log("Buscando 'anuncios-modal-close'...");
        document.getElementById('anuncios-modal-close').addEventListener('click', () => AppUI.hideModal('anuncios-modal'));
        console.log("Buscando 'anuncios-modal' (para cierre)...");
        document.getElementById('anuncios-modal').addEventListener('click', (e) => {
            if (e.target.id === 'anuncios-modal') AppUI.hideModal('anuncios-modal');
        });

        // Listener Sidebar
        console.log("Buscando 'toggle-sidebar-btn'...");
        document.getElementById('toggle-sidebar-btn').addEventListener('click', AppUI.toggleSidebar);

        // Carga inicial
        console.log("Llamando a AppData.cargarDatos() y AppUI.updateCountdown()");
        AppData.cargarDatos(false);
        setInterval(() => AppData.cargarDatos(false), 10000); 
        AppUI.updateCountdown();
        setInterval(AppUI.updateCountdown, 1000);
        
        // NUEVO: Poblar el modal de anuncios una vez
        AppUI.poblarModalAnuncios();
        console.log("AppUI.init() completado.");
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

        // NUEVO: Limpiar campos si se cierra el modal de transacciones
        if (modalId === 'transaccion-modal') {
            document.getElementById('transaccion-grupo-select').value = "";
            const usuarioSelect = document.getElementById('transaccion-usuario-select');
            usuarioSelect.innerHTML = '<option value="">Seleccione un usuario...</option>';
            usuarioSelect.disabled = true;
            document.getElementById('transaccion-cantidad-input').value = "";
            document.getElementById('transaccion-status-msg').textContent = "";
            document.getElementById('transaccion-submit-btn').disabled = false;
        }
        
        // NUEVO: Limpiar campo de clave si se cierra el modal de gestión
        if (modalId === 'gestion-modal') {
             document.getElementById('clave-input').value = "";
             document.getElementById('clave-input').classList.remove('shake', 'border-red-500');
        }
    },

    // --- NUEVAS FUNCIONES PARA EL MODAL DE TRANSACCIONES ---
    showTransaccionModal: function() {
        if (!AppState.datosActuales) {
            alert("Los datos de los grupos aún no se han cargado. Intente de nuevo en un momento.");
            return;
        }
        
        const grupoSelect = document.getElementById('transaccion-grupo-select');
        grupoSelect.innerHTML = '<option value="">Seleccione un grupo...</option>'; // Resetear

        // Poblar el dropdown de grupos
        AppState.datosActuales.forEach(grupo => {
            // Permitir transacciones a todos los grupos, incluida Cicla
            const option = document.createElement('option');
            option.value = grupo.nombre;
            option.textContent = grupo.nombre;
            grupoSelect.appendChild(option);
        });

        AppUI.showModal('transaccion-modal');
    },

    populateUsuariosTransaccion: function() {
        const grupoSelect = document.getElementById('transaccion-grupo-select');
        const usuarioSelect = document.getElementById('transaccion-usuario-select');
        const selectedGrupoNombre = grupoSelect.value;

        usuarioSelect.innerHTML = '<option value="">Cargando...</option>'; // Placeholder

        if (!selectedGrupoNombre) {
            usuarioSelect.innerHTML = '<option value="">Seleccione un usuario...</option>';
            usuarioSelect.disabled = true;
            return;
        }

        const grupo = AppState.datosActuales.find(g => g.nombre === selectedGrupoNombre);

        if (grupo && grupo.usuarios) {
            usuarioSelect.innerHTML = '<option value="">Seleccione un usuario...</option>';
            
            // Ordenar usuarios alfabéticamente para facilitar la búsqueda
            const usuariosOrdenados = [...grupo.usuarios].sort((a, b) => a.nombre.localeCompare(b.nombre));

            usuariosOrdenados.forEach(usuario => {
                const option = document.createElement('option');
                option.value = usuario.nombre;
                option.textContent = usuario.nombre;
                usuarioSelect.appendChild(option);
            });
            usuarioSelect.disabled = false;
        } else {
            usuarioSelect.innerHTML = '<option value="">No hay usuarios en este grupo</option>';
            usuarioSelect.disabled = true;
        }
    },
    // --- FIN DE NUEVAS FUNCIONES ---


    showLoading: function() {
        document.getElementById('loading-overlay').classList.remove('opacity-0', 'pointer-events-none');
        AppUI.setConnectionStatus('loading'); // NUEVO: Mostrar spinner
    },

    hideLoading: function() {
        document.getElementById('loading-overlay').classList.add('opacity-0', 'pointer-events-none');
        // No cambiar el estado aquí, dejar que cargarDatos lo decida
    },
    
    // NUEVO: Función para controlar el icono de estado
    setConnectionStatus: function(status) {
        // status puede ser 'ok', 'loading', 'error'
        const statusOk = document.getElementById('status-ok');
        const statusLoading = document.getElementById('status-loading');
        const statusError = document.getElementById('status-error');

        if (!statusOk || !statusLoading || !statusError) return;

        statusOk.classList.toggle('hidden', status !== 'ok');
        statusLoading.classList.toggle('hidden', status !== 'loading');
        statusError.classList.toggle('hidden', status !== 'error');
    },

    // --- INICIO CAMBIO: Nueva función hideSidebar ---
    hideSidebar: function() {
        if (AppState.isSidebarOpen) {
            AppUI.toggleSidebar(); // Llama a toggle para cerrar
        }
    },
    // --- FIN CAMBIO ---

    toggleSidebar: function() {
        const sidebar = document.getElementById('sidebar');
        const btn = document.getElementById('toggle-sidebar-btn');
        
        AppState.isSidebarOpen = !AppState.isSidebarOpen; 

        if (AppState.isSidebarOpen) {
            sidebar.classList.remove('-translate-x-full');
            btn.innerHTML = '<span class="font-bold text-lg">«</span>';
        } else {
            sidebar.classList.add('-translate-x-full');
            btn.innerHTML = '<span class="font-bold text-lg">»</span>';
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
                AppUI.hideSidebar(); // Ocultar aunque ya esté
                return;
            }
            AppState.selectedGrupo = null;
            AppUI.mostrarPantallaNeutral(AppState.datosActuales || []);
            AppUI.actualizarSidebarActivo();
            AppUI.hideSidebar(); // (CAMBIO: Ocultar al hacer clic)
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
                <span class="text-xs font-semibold ${totalColor}">${AppData.formatNumber(grupo.total)} ℙ</span>
            `;
            link.addEventListener('click', (e) => {
                e.preventDefault();
                if (AppState.selectedGrupo === grupo.nombre) {
                    AppUI.hideSidebar(); // Ocultar aunque ya esté
                    return;
                }
                AppState.selectedGrupo = grupo.nombre;
                AppUI.mostrarDatosGrupo(grupo);
                AppUI.actualizarSidebarActivo();
                AppUI.hideSidebar(); // (CAMBIO: Ocultar al hacer clic)
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

        // 1. MOSTRAR RESUMEN COMPACTO (4 TARJETAS)
        const homeStatsContainer = document.getElementById('home-stats-container');
        // CAMBIO: Contenedores separados para Bóveda y Top 3
        const bovedaContainer = document.getElementById('boveda-card-container');
        const top3Grid = document.getElementById('top-3-grid');
        
        let bovedaHtml = '';
        let top3Html = '';

        // Tarjeta de Bóveda
        const totalGeneral = grupos.reduce((acc, g) => acc + g.total, 0);
        bovedaHtml = `
            <div class="bg-white rounded-lg shadow-md p-4">
                <div class="flex items-center justify-between mb-2">
                    <span class="text-sm font-medium text-gray-500 truncate">Total en Bóveda</span>
                    <span class="text-xs font-bold bg-green-100 text-green-700 rounded-full px-2 py-0.5">BANCO</span>
                </div>
                <p class="text-lg font-semibold text-gray-900 truncate">Pinceles Totales</p>
                <p class="text-xl font-bold text-green-600 text-right">${AppData.formatNumber(totalGeneral)} ℙ</p>
            </div>
        `;
        
        // Tarjetas Top 3 Alumnos
        const allStudents = (grupos || []).flatMap(g => g.usuarios);
        const top3 = allStudents.sort((a, b) => b.pinceles - a.pinceles).slice(0, 3);

        if (top3.length > 0) {
            top3Html = top3.map((student, index) => {
                let rankColor = 'bg-blue-100 text-blue-700';
                if (index === 0) rankColor = 'bg-yellow-100 text-yellow-700';
                if (index === 1) rankColor = 'bg-gray-100 text-gray-700';
                if (index === 2) rankColor = 'bg-orange-100 text-orange-700';
                const grupoNombre = student.grupoOriginal || student.grupoNombre || (student.pinceles < 0 ? 'Cicla' : 'N/A');

                return `
                    <div class="bg-white rounded-lg shadow-md p-4">
                        <div class="flex items-center justify-between mb-2">
                            <span class="text-sm font-medium text-gray-500 truncate">${grupoNombre}</span>
                            <span class="text-xs font-bold ${rankColor} rounded-full px-2 py-0.5">${index + 1}º</span>
                        </div>
                        <p class="text-lg font-semibold text-gray-900 truncate">${student.nombre}</p>
                        <p class="text-xl font-bold text-blue-600 text-right">${AppData.formatNumber(student.pinceles)} ℙ</p>
                    </div>
                `;
            }).join('');
        }
        // Placeholders
        for (let i = top3.length; i < 3; i++) {
            top3Html += `
                <div class="bg-white rounded-lg shadow-md p-4 opacity-50">
                    <div class="flex items-center justify-between mb-2"><span class="text-sm font-medium text-gray-400">-</span><span class="text-xs font-bold bg-gray-100 text-gray-400 rounded-full px-2 py-0.5">${i + 1}º</span></div>
                    <p class="text-lg font-semibold text-gray-400 truncate">-</p>
                    <p class="text-xl font-bold text-gray-400 text-right">- ℙ</p>
                </div>
            `;
        }

        // CAMBIO: Inyectar HTML en los contenedores separados
        bovedaContainer.innerHTML = bovedaHtml;
        top3Grid.innerHTML = top3Html;
        
        homeStatsContainer.classList.remove('hidden');
        
        // 2. MOSTRAR MÓDULOS (Idea 1 & 2)
        document.getElementById('home-modules-grid').classList.remove('hidden');
        AppUI.actualizarAlumnosEnRiesgo();
        AppUI.actualizarAnuncios(); // Poblar anuncios dinámicos
        AppUI.actualizarEstadisticasRapidas(grupos); // NUEVO: Llamar a la función
        
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
                <span class="${totalColor}">${AppData.formatNumber(grupo.total)} ℙ</span>
            </h2>
        `;
        
        const tableContainer = document.getElementById('table-container');
        const usuariosOrdenados = [...grupo.usuarios].sort((a, b) => b.pinceles - a.pinceles);

        const filas = usuariosOrdenados.map((usuario, index) => {
            const pos = index + 1;
            // CAMBIO: Eliminada la lógica de "trending" (fuego)
            
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
                        ${AppData.formatNumber(usuario.pinceles)} ℙ
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

    // --- INICIO CAMBIO DE LÓGICA: Función de Alumnos en Riesgo (Ahora es una tabla) ---
    actualizarAlumnosEnRiesgo: function() {
        const lista = document.getElementById('riesgo-lista');
        if (!lista) return;

        const allStudents = (AppState.datosActuales || []).flatMap(g => g.usuarios);
        
        // 1. Filtra estudiantes con pinceles >= 0 (incluye cero, que están en riesgo)
        const possibleRiesgoStudents = allStudents.filter(s => s.pinceles >= 0);
        
        // 2. Ordena ascendente por pinceles (los más cercanos a la cicla primero)
        const enRiesgo = possibleRiesgoStudents.sort((a, b) => a.pinceles - b.pinceles);
        
        // CAMBIO: Mostrar Top 7 en lugar de Top 6
        const top7Riesgo = enRiesgo.slice(0, 7); 

        if (top7Riesgo.length === 0) {
            lista.innerHTML = `<tr><td colspan="3" class="p-4 text-sm text-gray-500 text-center">No hay alumnos en riesgo por el momento.</td></tr>`;
            return;
        }

        lista.innerHTML = top7Riesgo.map((student, index) => {
            const grupoNombre = student.grupoOriginal || student.grupoNombre || 'N/A';
            const pinceles = AppData.formatNumber(student.pinceles);
            // Definir color de pinceles para la tabla
            const pincelesColor = student.pinceles <= 0 ? 'text-red-600' : 'text-gray-900'; // 0 también es riesgo

            // CAMBIO: Añadido whitespace-nowrap a las celdas
            return `
                <tr class="hover:bg-gray-50">
                    <td class="px-4 py-2 text-sm text-gray-700 font-medium truncate">${student.nombre}</td>
                    <td class="px-4 py-2 text-sm text-gray-500 whitespace-nowrap">${grupoNombre}</td>
                    <td class="px-4 py-2 text-sm font-semibold ${pincelesColor} text-right whitespace-nowrap">${pinceles} ℙ</td>
                </tr>
            `;
        }).join('');
    },
    // --- FIN CAMBIO DE LÓGICA ---
    
    // --- NUEVA FUNCIÓN: Módulo de Estadísticas Rápidas (CAMBIO: Añadidas 2 nuevas stats) ---
    actualizarEstadisticasRapidas: function(grupos) {
        const statsList = document.getElementById('quick-stats-list');
        if (!statsList) return;

        const allStudents = (grupos || []).flatMap(g => g.usuarios);
        const ciclaGrupo = (grupos || []).find(g => g.nombre === 'Cicla');
        
        const totalAlumnos = allStudents.length + (ciclaGrupo ? ciclaGrupo.usuarios.length : 0);
        const totalEnCicla = ciclaGrupo ? ciclaGrupo.usuarios.length : 0;
        const totalBoveda = grupos.reduce((acc, g) => acc + g.total, 0);
        const promedioPinceles = totalAlumnos > 0 ? (totalBoveda / totalAlumnos) : 0;

        // NUEVO: Calcular pinceles positivos y negativos
        const pincelesPositivos = allStudents.reduce((sum, user) => sum + user.pinceles, 0);
        const pincelesEnCicla = ciclaGrupo ? ciclaGrupo.total : 0;
        
        const createStat = (label, value, valueClass = 'text-gray-900') => `
            <div class="flex justify-between items-baseline text-sm py-2 border-b border-gray-100">
                <span class="text-gray-600">${label}:</span>
                <span class="font-semibold ${valueClass}">${value}</span>
            </div>
        `;

        statsList.innerHTML = `
            ${createStat('Alumnos Totales', totalAlumnos)}
            ${createStat('Alumnos en Cicla', totalEnCicla, 'text-red-600')}
            ${createStat('Grupos Activos', grupos.length)}
            ${createStat('Pincel Promedio', `${AppData.formatNumber(promedioPinceles.toFixed(0))} ℙ`)}
            ${createStat('Pinceles Positivos', `${AppData.formatNumber(pincelesPositivos)} ℙ`, 'text-green-600')}
            ${createStat('Pinceles en Cicla', `${AppData.formatNumber(pincelesEnCicla)} ℙ`, 'text-red-600')}
        `;
    },

    // --- INICIO CAMBIO: Función para Anuncios Dinámicos (CAMBIO: Muestra 6 anuncios) ---
    actualizarAnuncios: function() {
        const lista = document.getElementById('anuncios-lista');
        
        const getRandomItem = (arr) => arr[Math.floor(Math.random() * arr.length)];
        const getUniqueRandomItems = (arr, num) => {
            const shuffled = [...arr].sort(() => 0.5 - Math.random());
            return shuffled.slice(0, num);
        };

        // CAMBIO: Lógica para mostrar 6 anuncios (2 Aviso, 2 Nuevo, 1 Consejo, 1 Alerta)
        const anuncios = [
            ...getUniqueRandomItems(AnunciosDB['AVISO'], 2).map(texto => ({ tipo: 'AVISO', texto, bg: 'bg-gray-100', text: 'text-gray-700' })),
            ...getUniqueRandomItems(AnunciosDB['NUEVO'], 2).map(texto => ({ tipo: 'NUEVO', texto, bg: 'bg-blue-100', text: 'text-blue-700' })),
            ...getUniqueRandomItems(AnunciosDB['CONSEJO'], 1).map(texto => ({ tipo: 'CONSEJO', texto, bg: 'bg-green-100', text: 'text-green-700' })),
            ...getUniqueRandomItems(AnunciosDB['ALERTA'], 1).map(texto => ({ tipo: 'ALERTA', texto, bg: 'bg-red-100', text: 'text-red-700' }))
        ];

        // Usamos una estructura más clara y compacta para el elemento de lista
        lista.innerHTML = anuncios.map(anuncio => `
            <li class="flex items-start p-2 hover:bg-gray-50 rounded-lg transition-colors"> 
                <span class="text-xs font-bold ${anuncio.bg} ${anuncio.text} rounded-full w-20 text-center py-0.5 mr-3 flex-shrink-0 mt-1">${anuncio.tipo}</span>
                <span class="text-sm text-gray-700 flex-1">${anuncio.texto}</span>
            </li>
        `).join('');
    },
    // --- FIN CAMBIO ---

    // --- NUEVA FUNCIÓN: Poblar el modal de "Todos los Anuncios" ---
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



    // --- MODAL DE ALUMNO ---
    showStudentModal: function(nombreGrupo, nombreUsuario, rank) {
        const grupo = AppState.datosActuales.find(g => g.nombre === nombreGrupo);
        const usuario = (grupo.usuarios || []).find(u => u.nombre === nombreUsuario);
        
        if (!usuario || !grupo) return;

        const modalContent = document.getElementById('student-modal-content');
        const totalPinceles = usuario.pinceles || 0;
        
        const gruposRankeados = AppState.datosActuales.filter(g => g.nombre !== 'Cicla');
        const rankGrupo = gruposRankeados.findIndex(g => g.nombre === nombreGrupo) + 1;

        const createStat = (label, value, valueClass = 'text-gray-900') => `
            <div class="bg-gray-50 p-4 rounded-lg text-center">
                <div class="text-xs font-medium text-gray-500 uppercase tracking-wide">${label}</div>
                <div class="text-2xl font-bold ${valueClass} truncate">${value}</div>
            </div>
        `;
        
        modalContent.innerHTML = `
            <div class="p-6">
                <div class="flex justify-between items-start mb-4">
                    <div>
                        <h2 class="text-xl font-semibold text-gray-900">${usuario.nombre}</h2>
                        <p class="text-sm font-medium text-gray-500">${grupo.nombre}</p>
                    </div>
                    <button onclick="AppUI.hideModal('student-modal')" class="text-gray-400 hover:text-gray-600 text-2xl">&times;</button>
                </div>
                <div class="grid grid-cols-2 gap-4">
                    ${createStat('Rank en Grupo', `${rank}º`, 'text-blue-600')}
                    ${createStat('Rank de Grupo', `${rankGrupo > 0 ? rankGrupo + 'º' : 'N/A'}`, 'text-blue-600')}
                    ${createStat('Total Pinceles', `${AppData.formatNumber(totalPinceles)} ℙ`, totalPinceles < 0 ? 'text-red-600' : 'text-green-600')}
                    ${createStat('Total Grupo', `${AppData.formatNumber(grupo.total)} ℙ`)}
                    ${createStat('% del Grupo', `${grupo.total !== 0 ? ((totalPinceles / grupo.total) * 100).toFixed(1) : 0}%`)}
                    ${createStat('Grupo Original', usuario.grupoOriginal || (usuario.pinceles < 0 ? 'N/A' : grupo.nombre) )}
                </div>
            </div>
        `;
        AppUI.showModal('student-modal');
    },
    
    // --- CONTADOR DE SUBASTA ---
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

// --- INICIALIZACIÓN ---
// Hacer AppUI accesible globalmente para los `onclick` en el HTML
window.AppUI = AppUI;

// FIX: Esperar a que todo el DOM esté cargado antes de inicializar
// Se usa window.onload en lugar de DOMContentLoaded para máxima seguridad, 
// asegurando que todos los assets (estilos, etc.) estén listos.
window.onload = function() {
    console.log("window.onload disparado. El DOM está listo. Iniciando AppUI...");
    AppUI.init();
};
