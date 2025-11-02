// --- CONFIGURACIÓN ---
const AppConfig = {
    API_URL: 'https://script.google.com/macros/s/AKfycbzFNGHqiOlKDq5AAGhuDEDweEGgqNoJZFsGrkD3r4aGetrMYLOJtieNK1tVz9iqjvHHNg/exec',
    CLAVE_MAESTRA: 'PinceladasM25-26',
    SPREADSHEET_URL: 'https://docs.google.com/spreadsheets/d/1GArB7I19uGum6awiRN6qK8HtmTWGcaPGWhOzGCdhbcs/edit',
    RAPID_CHANGE_THRESHOLD: 300000,
    RAPID_CHANGE_COUNT: 3,
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
    selectedGrupo: null, // Para rastrear el grupo seleccionado
    isSidebarOpen: false, // Inicia oculta por defecto
};

// --- AUTENTICACIÓN ---
const AppAuth = {
    verificarClave: function() {
        const claveInput = document.getElementById('clave-input');
        if (claveInput.value === AppConfig.CLAVE_MAESTRA) {
            window.open(AppConfig.SPREADSHEET_URL, '_blank');
            AppUI.hideModal('gestion-modal');
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

// --- CAMBIO: Base de Datos de Anuncios (Textos más largos) ---
const AnunciosDB = {
    'AVISO': [
        "La gran subasta de fin de mes se celebrará, como siempre, el último Jueves. ¡Preparen sus pinceles!",
        "Revisen sus saldos con anticipación antes del cierre de mes para evitar sorpresas de último minuto.",
        "Recuerden que la sección 'Ver Reglas' contiene toda la información importante sobre la Cicla y las subastas."
    ],
    'NUEVO': [
        "El 'Total en Bóveda' ahora se muestra en la pantalla de Inicio para una mayor transparencia de los fondos del banco.",
        "¡Nueva sección 'Alumnos en Riesgo' en la página principal! Revisa quiénes están cerca de la Cicla.",
        "El Top 3 Alumnos con más pinceles ahora es visible en el resumen general de la página de Inicio."
    ],
    'CONSEJO': [
        "Puedes usar el botón '»' en la esquina superior para abrir y cerrar la barra lateral de grupos fácilmente.",
        "Haz clic en el nombre de cualquier alumno en la tabla para ver sus estadísticas y detalles de grupo.",
        "Es fundamental mantener un saldo positivo de pinceles para poder participar en las subastas mensuales."
    ],
    'ALERTA': [
        "¡Mucho cuidado! Acumular saldos negativos (menos de 0 ℙ) te moverá automáticamente a la Cicla.",
        "Los alumnos que se encuentran actualmente en Cicla no tienen permitido participar en la subasta activa.",
        "Para poder salir de la Cicla, cada alumno debe completar exitosamente un desafío de recuperación asignado."
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
        }

        try {
            if (!navigator.onLine) {
                AppState.isOffline = true;
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
                
                AppState.datosActuales = AppData.procesarYMostrarDatos(data);
                AppState.cachedData = AppState.datosActuales;
                AppState.lastCacheTime = Date.now();
                AppState.retryCount = 0; // Éxito, reiniciar contador
            }

        } catch (error) {
            console.error("Error al cargar datos:", error.message);
            if (AppState.retryCount < AppConfig.MAX_RETRIES) {
                AppState.retryCount++;
                setTimeout(() => AppData.cargarDatos(true), AppState.retryDelay);
                AppState.retryDelay = Math.min(AppState.retryDelay * 2, AppConfig.MAX_RETRY_DELAY);
            } else if (AppData.isCacheValid()) {
                console.warn("Fallaron los reintentos. Mostrando datos de caché.");
                AppState.datosActuales = AppData.procesarYMostrarDatos(AppState.cachedData);
            } else {
                console.error("Fallaron todos los reintentos y no hay caché.");
            }
        } finally {
            AppState.actualizacionEnProceso = false;
            AppUI.hideLoading();
        }
    },

    detectarCambios: function(nuevosDatos) {
        if (!AppState.datosActuales) return; 

        const ahora = Date.now();
        nuevosDatos.forEach(grupo => {
            (grupo.usuarios || []).forEach(usuario => {
                const claveUsuario = `${grupo.nombre}-${usuario.nombre}`;
                const historial = AppState.historialUsuarios[claveUsuario] || { pinceles: 0, cambiosRecientes: [] };

                if (usuario.pinceles !== historial.pinceles) {
                    const cambio = { tiempo: ahora, anterior: historial.pinceles, nuevo: usuario.pinceles };
                    historial.pinceles = usuario.pinceles;
                    
                    historial.cambiosRecientes.push(cambio);
                    historial.cambiosRecientes = historial.cambiosRecientes.filter(c => ahora - c.tiempo <= AppConfig.RAPID_CHANGE_THRESHOLD);

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
    
    init: function() {
        console.log("AppUI.init() llamado."); // Log de inicio

        // Listeners Modales
        const gestionBtn = document.getElementById('gestion-btn');
        console.log("Buscando 'gestion-btn':", gestionBtn); // Log de diagnóstico
        gestionBtn.addEventListener('click', () => AppUI.showModal('gestion-modal'));
        
        const modalCancel = document.getElementById('modal-cancel');
        console.log("Buscando 'modal-cancel':", modalCancel); // Log de diagnóstico
        modalCancel.addEventListener('click', () => AppUI.hideModal('gestion-modal'));
        
        const modalSubmit = document.getElementById('modal-submit');
        console.log("Buscando 'modal-submit':", modalSubmit); // Log de diagnóstico
        modalSubmit.addEventListener('click', AppAuth.verificarClave);
        
        document.getElementById('gestion-modal').addEventListener('click', (e) => {
            if (e.target.id === 'gestion-modal') AppUI.hideModal('gestion-modal');
        });
        document.getElementById('student-modal').addEventListener('click', (e) => {
            if (e.target.id === 'student-modal') AppUI.hideModal('student-modal');
        });

        // Listeners Modal Reglas
        const reglasBtn = document.getElementById('reglas-btn');
        console.log("Buscando 'reglas-btn':", reglasBtn); // Log de diagnóstico
        reglasBtn.addEventListener('click', () => AppUI.showModal('reglas-modal'));
        
        const reglasModalClose = document.getElementById('reglas-modal-close');
        console.log("Buscando 'reglas-modal-close':", reglasModalClose); // Log de diagnóstico
        reglasModalClose.addEventListener('click', () => AppUI.hideModal('reglas-modal'));
        
        document.getElementById('reglas-modal').addEventListener('click', (e) => {
            if (e.target.id === 'reglas-modal') AppUI.hideModal('reglas-modal');
        });

        // Listener Sidebar
        const toggleSidebarBtn = document.getElementById('toggle-sidebar-btn');
        console.log("Buscando 'toggle-sidebar-btn':", toggleSidebarBtn); // Log de diagnóstico
        toggleSidebarBtn.addEventListener('click', AppUI.toggleSidebar);

        // Carga inicial
        AppData.cargarDatos(false);
        setInterval(() => AppData.cargarDatos(false), 10000); 
        AppUI.updateCountdown();
        setInterval(AppUI.updateCountdown, 1000);
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
    },

    showLoading: function() {
        document.getElementById('loading-overlay').classList.remove('opacity-0', 'pointer-events-none');
    },

    hideLoading: function() {
        document.getElementById('loading-overlay').classList.add('opacity-0', 'pointer-events-none');
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
        const homeStatsGrid = document.getElementById('home-stats-grid');
        let cardsHtml = '';

        // Tarjeta de Bóveda
        const totalGeneral = grupos.reduce((acc, g) => acc + g.total, 0);
        cardsHtml += `
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
            cardsHtml += top3.map((student, index) => {
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
            cardsHtml += `
                <div class="bg-white rounded-lg shadow-md p-4 opacity-50">
                    <div class="flex items-center justify-between mb-2"><span class="text-sm font-medium text-gray-400">-</span><span class="text-xs font-bold bg-gray-100 text-gray-400 rounded-full px-2 py-0.5">${i + 1}º</span></div>
                    <p class="text-lg font-semibold text-gray-400 truncate">-</p>
                    <p class="text-xl font-bold text-gray-400 text-right">- ℙ</p>
                </div>
            `;
        }

        homeStatsGrid.innerHTML = cardsHtml;
        homeStatsContainer.classList.remove('hidden');
        
        // 2. MOSTRAR MÓDULOS (Idea 1 & 2)
        document.getElementById('home-modules-grid').classList.remove('hidden');
        AppUI.actualizarAlumnosEnRiesgo(); // (CAMBIO) Llamar a la nueva función
        AppUI.actualizarAnuncios(); // Poblar anuncios dinámicos
        
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
            const isTrending = (AppState.historialUsuarios[`${grupo.nombre}-${usuario.nombre}`]?.cambiosRecientes.length || 0) >= 2;
            
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
                        ${usuario.nombre} ${isTrending ? '🔥' : ''}
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

    // --- INICIO CAMBIO DE LÓGICA: Función de Alumnos en Riesgo (Ahora muestra Top 6) ---
    actualizarAlumnosEnRiesgo: function() {
        const lista = document.getElementById('riesgo-lista');
        if (!lista) return;

        const allStudents = (AppState.datosActuales || []).flatMap(g => g.usuarios);
        
        // 1. Filtra estudiantes con pinceles >= 0 (incluye cero, que están en riesgo)
        const possibleRiesgoStudents = allStudents.filter(s => s.pinceles >= 0);
        
        // 2. Ordena ascendente por pinceles (los más cercanos a la cicla primero)
        const enRiesgo = possibleRiesgoStudents.sort((a, b) => a.pinceles - b.pinceles);
        
        // 3. Muestra los top 6 alumnos en riesgo (CAMBIO AQUÍ: antes 4, ahora 6)
        const top6Riesgo = enRiesgo.slice(0, 6); 

        if (top6Riesgo.length === 0) {
            lista.innerHTML = `<li class="p-4 text-sm text-gray-500 text-center">No hay alumnos en riesgo por el momento.</li>`;
            return;
        }

        lista.innerHTML = top6Riesgo.map((student, index) => {
            const grupoNombre = student.grupoOriginal || student.grupoNombre || 'N/A';
            return `
                <li class="flex items-start">
                    <span class="text-xs font-bold bg-red-100 text-red-700 rounded-full w-20 text-center py-0.5 mr-3 mt-1 flex-shrink-0">RIESGO ${index + 1}</span>
                    <span class="text-sm text-gray-700">
                        ${student.nombre} (${grupoNombre}) - <strong class="font-semibold">${AppData.formatNumber(student.pinceles)} ℙ</strong>
                    </span>
                </li>
            `;
        }).join('');
    },
    // --- FIN CAMBIO DE LÓGICA ---
    
    // --- INICIO CAMBIO: Función para Anuncios Dinámicos (Padding aumentado a p-3) ---
    actualizarAnuncios: function() {
        const lista = document.getElementById('anuncios-lista');
        
        const getRandomItem = (arr) => arr[Math.floor(Math.random() * arr.length)];

        // Nota: Mantenemos 4 elementos en la lista (AVISO, NUEVO, CONSEJO, ALERTA)
        const anuncios = [
            { tipo: 'AVISO', texto: getRandomItem(AnunciosDB['AVISO']), bg: 'bg-gray-100', text: 'text-gray-700' },
            { tipo: 'NUEVO', texto: getRandomItem(AnunciosDB['NUEVO']), bg: 'bg-blue-100', text: 'text-blue-700' },
            { tipo: 'CONSEJO', texto: getRandomItem(AnunciosDB['CONSEJO']), bg: 'bg-green-100', text: 'text-green-700' },
            { tipo: 'ALERTA', texto: getRandomItem(AnunciosDB['ALERTA']), bg: 'bg-red-100', text: 'text-red-700' }
        ];

        // Usamos una estructura más clara y compacta para el elemento de lista
        lista.innerHTML = anuncios.map(anuncio => `
            <li class="flex items-start p-3 hover:bg-gray-50 rounded-lg transition-colors"> 
                <span class="text-xs font-bold ${anuncio.bg} ${anuncio.text} rounded-full w-20 text-center py-0.5 mr-3 flex-shrink-0 mt-1">${anuncio.tipo}</span>
                <span class="text-sm text-gray-700 flex-1">${anuncio.texto}</span>
            </li>
        `).join('');
    },
    // --- FIN CAMBIO ---

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
// Esperar a que TODA la ventana (incluyendo DOM) esté cargada
window.onload = () => {
    console.log("window.onload disparado. Iniciando AppUI.init()..."); // Log de diagnóstico
    AppUI.init();
};

