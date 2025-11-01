const API_URL = 'https://script.google.com/macros/s/AKfycbzFNGHqiOlKDq5AAGhuDEDweEGgqNoJZFsGrkD3r4aGetrMYLOJtieNK1tVz9iqjvHHNg/exec';
const CLAVE_MAESTRA = 'PinceladasM25-26';
const SPREADSHEET_URL = 'https://docs.google.com/spreadsheets/d/1GArB7I19uGum6awiRN6qK8HtmTWGcaPGWhOzGCdhbcs/edit';
const ALERT_THRESHOLD = 1800000;
const MIN_CHANGES_FOR_ALERT = 5;
const MAX_ALERT_DURATION = 30000;
const RAPID_CHANGE_THRESHOLD = 300000;
const RAPID_CHANGE_COUNT = 3;
const CHANGE_NOTIFICATION_DURATION = 8000;
const INITIAL_RETRY_DELAY = 1000;
const MAX_RETRY_DELAY = 30000;
const MAX_RETRIES = 5;
const CACHE_DURATION = 300000;

let datosActuales = null;
let historialUsuarios = {};
let cambiosPersistentes = {};
let cambiosRapidos = {};
let actualizacionEnProceso = false;
let retryCount = 0;
let retryDelay = INITIAL_RETRY_DELAY;
let cachedData = null;
let lastCacheTime = null;
let isOffline = false;
let notificationCounter = 0;

function formatNumber(num) {
    return new Intl.NumberFormat('es-DO').format(num);
}

function calculateNextRetryDelay() {
    retryDelay = Math.min(retryDelay * 2, MAX_RETRY_DELAY);
    return retryDelay;
}

function isCacheValid() {
    return cachedData && lastCacheTime && (Date.now() - lastCacheTime < CACHE_DURATION);
}

function updateConnectionStatus(status, message = '', isOffline = false) {
    console.log('Estado del sistema:', status, message);
}

async function cargarDatos() {
    if (actualizacionEnProceso) return;
    actualizacionEnProceso = true;

    try {
        if (!navigator.onLine) {
            isOffline = true;
            if (isCacheValid()) {
                updateConnectionStatus('error', '', true);
                await mostrarDatos(cachedData);
            } else {
                updateConnectionStatus('error', 'Sin conexión a internet. Sin datos disponibles.');
            }
            actualizacionEnProceso = false;
            return;
        }

        updateConnectionStatus('updating', 'Actualizando datos...');
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 60000);
        let response;
        try {
            const urlWithCacheBuster = `${API_URL}?v=${new Date().getTime()}`;
            response = await fetch(urlWithCacheBuster, { method: 'GET', cache: 'no-cache', redirect: 'follow', signal: controller.signal });
        } finally {
            clearTimeout(timeoutId);
        }

        if (!response.ok) {
            const errorText = await response.text().catch(() => 'No se pudo leer la respuesta de error.');
            throw new Error(`Error de red: ${response.status}. Respuesta: ${errorText}`);
        }
        const data = await response.json().catch(() => { throw new Error('La respuesta de la API no es un JSON válido.'); });
        if (data && data.error) throw new Error(data.message || 'Error en la API');

        let gruposOrdenados = Object.entries(data).map(([nombre, info]) => ({ nombre, total: info.total || 0, usuarios: info.usuarios || [] }));
        cachedData = gruposOrdenados;
        lastCacheTime = Date.now();
        isOffline = false;

        const negativeUsers = [];
        gruposOrdenados.forEach(grupo => {
            grupo.usuarios = grupo.usuarios.filter(usuario => {
                if (usuario.pinceles < 0) {
                    negativeUsers.push({ ...usuario, grupoOriginal: grupo.nombre });
                    return false;
                }
                return true;
            });
            grupo.total = grupo.usuarios.reduce((sum, user) => sum + user.pinceles, 0);
        });
        if (negativeUsers.length > 0) {
            gruposOrdenados.push({ nombre: "Cicla", total: negativeUsers.reduce((sum, user) => sum + user.pinceles, 0), usuarios: negativeUsers });
        }

        detectarCambiosPersistentes(gruposOrdenados);

        const datosNuevos = JSON.stringify(gruposOrdenados);
        if (datosNuevos !== JSON.stringify(datosActuales)) {
            datosActuales = gruposOrdenados;
            // Se elimina la lógica de openGroupName de aquí, se manejará dentro de mostrarDatos
            await mostrarDatos(gruposOrdenados);
            updateConnectionStatus('online', 'Datos actualizados');
        } else {
            updateConnectionStatus('online', 'Datos sin cambios');
        }
        retryCount = 0;
        retryDelay = INITIAL_RETRY_DELAY;
    } catch (error) {
        if (error.name === 'AbortError') {
            console.error('La solicitud fue cancelada por timeout (60s).');
            updateConnectionStatus('error', 'El servidor tardó demasiado en responder.');
        } else {
            console.error('Error al cargar los datos:', error);
            updateConnectionStatus('error', `Error: ${error.message}`, !navigator.onLine);
        }
        if (retryCount < MAX_RETRIES && navigator.onLine) {
            retryCount++;
            const nextDelay = calculateNextRetryDelay();
            updateConnectionStatus('updating', `Reintentando en ${nextDelay/1000}s...`);
            setTimeout(cargarDatos, nextDelay);
        } else if (isCacheValid()) {
            updateConnectionStatus('error', 'Mostrando datos en caché.', true);
            // Aseguramos que los datos en caché se muestren con la nueva lógica si es necesario
            if (!datosActuales) {
                await mostrarDatos(cachedData);
            }
        } else {
            updateConnectionStatus('error', 'Sin datos disponibles.');
        }
    } finally {
        actualizacionEnProceso = false;
    }
}

/**
 * Crea un elemento HTML para un usuario.
 * @param {object} usuario - El objeto de usuario.
 * @param {number} uIndex - El índice de ranking del usuario.
 * @param {object} grupo - El objeto del grupo al que pertenece.
 * @param {number} posGrupo - El índice de ranking del grupo.
 * @returns {HTMLElement} El elemento HTML del item de usuario.
 */
function crearUsuarioItem(usuario, uIndex, grupo, posGrupo) {
    const usuarioItem = document.createElement('div');
    const isCiclaSpecial = grupo.nombre === "Cicla" && usuario.pinceles < -5000;
    usuarioItem.className = `usuario-item${isCiclaSpecial ? ' cicla-special-condition' : ''}`;
    // Usamos el nombre como identificador único
    usuarioItem.dataset.userName = usuario.nombre; 
    usuarioItem.style.order = uIndex;

    const trendingIcon = usuario.trending ? `<span class="trending-icon" title="En racha">🔥</span>` : '';
    const isCiclaHighlight = grupo.nombre === "Cicla" && usuario.pinceles > 5000;
    const pincelesClasses = `pinceles-count${usuario.pinceles < 0 ? ' negative' : ''}${isCiclaHighlight ? ' cicla-highlight' : ''}`;
    
    usuarioItem.innerHTML = `
        ${getRankIndicator(uIndex + 1, usuario.pinceles < 0)}
        <span class="usuario-nombre" data-usuario='${JSON.stringify(usuario)}' data-grupo='${JSON.stringify(grupo)}' data-posicion-grupo='${posGrupo}' data-posicion-individual='${uIndex + 1}'>
            ${usuario.nombre}${trendingIcon}
        </span>
        <span class="${pincelesClasses}">${formatNumber(usuario.pinceles)}</span>`;
    
    return usuarioItem;
}

/**
 * Actualiza un elemento HTML de usuario existente.
 * @param {HTMLElement} usuarioItem - El elemento a actualizar.
 * @param {object} usuario - El nuevo objeto de usuario.
 * @param {number} uIndex - El nuevo índice de ranking.
 * @param {object} grupo - El objeto del grupo.
 * @param {number} posGrupo - El nuevo índice de ranking del grupo.
 */
function actualizarUsuarioItem(usuarioItem, usuario, uIndex, grupo, posGrupo) {
    usuarioItem.style.order = uIndex;
    
    // Actualizar clases de condición especial
    const isCiclaSpecial = grupo.nombre === "Cicla" && usuario.pinceles < -5000;
    usuarioItem.classList.toggle('cicla-special-condition', isCiclaSpecial);

    const trendingIcon = usuario.trending ? `<span class="trending-icon" title="En racha">🔥</span>` : '';
    const isCiclaHighlight = grupo.nombre === "Cicla" && usuario.pinceles > 5000;
    const pincelesClasses = `pinceles-count${usuario.pinceles < 0 ? ' negative' : ''}${isCiclaHighlight ? ' cicla-highlight' : ''}`;

    // Actualizar solo las partes que cambian
    const rankIndicator = usuarioItem.querySelector('.rank-indicator');
    if (rankIndicator) {
        rankIndicator.outerHTML = getRankIndicator(uIndex + 1, usuario.pinceles < 0);
    }

    const nombreSpan = usuarioItem.querySelector('.usuario-nombre');
    if (nombreSpan) {
        nombreSpan.innerHTML = `${usuario.nombre}${trendingIcon}`;
        // Actualizar los datasets para el modal
        nombreSpan.dataset.usuario = JSON.stringify(usuario);
        nombreSpan.dataset.grupo = JSON.stringify(grupo);
        nombreSpan.dataset.posicionGrupo = posGrupo;
        nombreSpan.dataset.posicionIndividual = uIndex + 1;
    }

    const pincelesSpan = usuarioItem.querySelector('.pinceles-count');
    if (pincelesSpan) {
        pincelesSpan.className = pincelesClasses;
        pincelesSpan.textContent = formatNumber(usuario.pinceles);
    }
}

/**
 * Reconcilia la lista de usuarios dentro de un grupo.
 * @param {HTMLElement} usuariosListaEl - El elemento <ul> o <div> que contiene a los usuarios.
 * @param {Array<object>} usuariosNuevos - La nueva lista de usuarios.
 * @param {object} grupo - El objeto del grupo padre.
 * @param {number} posGrupo - El ranking del grupo padre.
 */
function actualizarUsuariosLista(usuariosListaEl, usuariosNuevos, grupo, posGrupo) {
    // 1. Ordenar nuevos usuarios
    const usuariosOrdenados = [...usuariosNuevos].sort((a, b) => b.pinceles - a.pinceles);
    
    // 2. Crear mapa de usuarios existentes
    const existingUsersMap = new Map();
    usuariosListaEl.querySelectorAll('.usuario-item').forEach(item => {
        existingUsersMap.set(item.dataset.userName, item);
    });

    const newUsersSet = new Set(usuariosOrdenados.map(u => u.nombre));

    // 3. Eliminar usuarios antiguos
    for (const [userName, item] of existingUsersMap.entries()) {
        if (!newUsersSet.has(userName)) {
            item.remove();
            existingUsersMap.delete(userName);
        }
    }

    // 4. Actualizar/Añadir usuarios
    usuariosOrdenados.forEach((usuario, uIndex) => {
        const existingItem = existingUsersMap.get(usuario.nombre);
        if (existingItem) {
            // Actualizar
            actualizarUsuarioItem(existingItem, usuario, uIndex, grupo, posGrupo);
        } else {
            // Añadir
            const newItem = crearUsuarioItem(usuario, uIndex, grupo, posGrupo);
            usuariosListaEl.appendChild(newItem);
        }
    });

    // 5. Manejar lista vacía
    if (usuariosOrdenados.length === 0 && usuariosListaEl.children.length === 0) {
        usuariosListaEl.innerHTML = `<div class="usuario-item"><span class="usuario-nombre">Sin registros</span></div>`;
    } else if (usuariosOrdenados.length > 0) {
        // Quitar el mensaje "Sin registros" si existe
        const noRegistros = usuariosListaEl.querySelector('.usuario-item:only-child .usuario-nombre');
        if (noRegistros && noRegistros.textContent === 'Sin registros') {
            noRegistros.parentElement.remove();
        }
    }
}

/**
 * Crea un elemento de grupo completo.
 * @param {object} grupo - El objeto de grupo.
 * @param {number} index - El índice de ranking del grupo.
 * @returns {HTMLElement} El elemento HTML del grupo.
 */
function crearGrupoElement(grupo, index) {
    const isNegativeGroup = grupo.nombre === "Cicla";
    let topClass = !isNegativeGroup && index < 6 ? ` top-${index + 1}` : '';
    
    const grupoElement = document.createElement('div');
    grupoElement.className = `grupo-container${topClass}${isNegativeGroup ? ' negative' : ''}`;
    grupoElement.dataset.groupName = grupo.nombre;
    grupoElement.style.order = index;

    const grupoHeader = document.createElement('div');
    grupoHeader.className = 'grupo-header';
    grupoHeader.innerHTML = `
        <div class="grupo-nombre">
            <span>${grupo.nombre}</span>
            ${getRankIndicator(index + 1, isNegativeGroup)}
        </div>
        <div class="grupo-total">
            ${formatNumber(grupo.total)}<span>pinceles</span>
        </div>`;

    const usuariosLista = document.createElement('div');
    usuariosLista.className = 'usuarios-lista';

    // Llenar la lista de usuarios
    actualizarUsuariosLista(usuariosLista, grupo.usuarios || [], grupo, index + 1);

    grupoElement.appendChild(grupoHeader);
    grupoElement.appendChild(usuariosLista);
    grupoHeader.addEventListener('click', () => toggleGrupo(grupoElement));
    
    return grupoElement;
}

/**
 * Actualiza el encabezado de un grupo existente.
 * @param {HTMLElement} grupoElement - El elemento del grupo a actualizar.
 * @param {object} grupo - El nuevo objeto de grupo.
 * @param {number} index - El nuevo índice de ranking.
 */
function actualizarGrupoHeader(grupoElement, grupo, index) {
    const isNegativeGroup = grupo.nombre === "Cicla";
    
    // 1. Actualizar clases de ranking
    let topClass = !isNegativeGroup && index < 6 ? ` top-${index + 1}` : '';
    grupoElement.className = `grupo-container${topClass}${isNegativeGroup ? ' negative' : ''}`;
    
    // 2. Actualizar orden visual
    grupoElement.style.order = index;

    // 3. Actualizar contenido del header
    const nombreEl = grupoElement.querySelector('.grupo-nombre');
    if (nombreEl) {
        nombreEl.innerHTML = `<span>${grupo.nombre}</span>${getRankIndicator(index + 1, isNegativeGroup)}`;
    }
    
    const totalEl = grupoElement.querySelector('.grupo-total');
    if (totalEl) {
        totalEl.innerHTML = `${formatNumber(grupo.total)}<span>pinceles</span>`;
    }
}

/**
 * Muestra y reconcilia los datos de los grupos en el DOM.
 * @param {Array<object>} gruposOrdenados - La lista completa de grupos.
 */
async function mostrarDatos(gruposOrdenados) {
    const container = document.getElementById('grupos-container');

    // --- Lógica de filtrado y ordenamiento ---
    const ciclaIndex = gruposOrdenados.findIndex(g => g.nombre === "Cicla");
    let ciclaGroup = ciclaIndex !== -1 ? gruposOrdenados.splice(ciclaIndex, 1)[0] : null;
    
    const setInicial = ['Cuarto', 'Quinto', 'Sexto', 'Primero', 'Segundo', 'Tercero'];
    setInicial.forEach(nombre => {
        if (!gruposOrdenados.some(g => g.nombre.trim().toLowerCase() === nombre.toLowerCase())) {
            gruposOrdenados.push({ nombre, total: 0, usuarios: [] });
        }
    });
    
    const principales = gruposOrdenados.filter(g => setInicial.some(n => n.toLowerCase() === g.nombre.trim().toLowerCase()));
    const extras = gruposOrdenados.filter(g => !setInicial.some(n => n.toLowerCase() === g.nombre.trim().toLowerCase()));
    
    let principalesOrdenados = principales.some(g => g.total > 0) 
        ? [...principales].sort((a, b) => b.total - a.total) 
        : setInicial.map(nombre => principales.find(g => g.nombre.trim().toLowerCase() === nombre.toLowerCase()));
    
    extras.sort((a, b) => b.total - a.total);
    
    const gruposParaMostrar = [...principalesOrdenados, ...extras];
    if (ciclaGroup && ciclaGroup.usuarios && ciclaGroup.usuarios.length > 0) {
        gruposParaMostrar.push(ciclaGroup);
    }

    const gruposActivos = gruposParaMostrar.filter(g => g.total !== 0 || g.nombre === "Cicla" || setInicial.includes(g.nombre));
    // --- Fin lógica de filtrado ---

    // --- Lógica de Reconciliación ---

    // 1. Guardar el estado de expansión
    const openCardEl = container.querySelector('.grupo-container.expandido .grupo-nombre span');
    const openGroupName = openCardEl ? openCardEl.textContent.trim() : null;

    // 2. Crear mapa de grupos existentes en el DOM
    const existingGroupsMap = new Map();
    container.querySelectorAll('.grupo-container').forEach(el => {
        existingGroupsMap.set(el.dataset.groupName, el);
    });

    const newGroupsSet = new Set(gruposActivos.map(g => g.nombre));

    // 3. Eliminar grupos que ya no existen
    for (const [groupName, element] of existingGroupsMap.entries()) {
        if (!newGroupsSet.has(groupName)) {
            element.remove();
            existingGroupsMap.delete(groupName);
        }
    }

    // 4. Actualizar y añadir grupos
    gruposActivos.forEach((grupo, index) => {
        if (grupo.nombre === "Cicla" && (!grupo.usuarios || grupo.usuarios.length === 0)) {
            // Si el grupo Cicla existe pero está vacío, eliminarlo
            const ciclaEl = existingGroupsMap.get("Cicla");
            if (ciclaEl) {
                ciclaEl.remove();
            }
            return; // No mostrar grupo Cicla vacío
        }

        const existingElement = existingGroupsMap.get(grupo.nombre);

        if (existingElement) {
            // --- Actualizar Grupo Existente ---
            actualizarGrupoHeader(existingElement, grupo, index);
            const usuariosListaEl = existingElement.querySelector('.usuarios-lista');
            if (usuariosListaEl) {
                // Actualizar la lista de usuarios
                actualizarUsuariosLista(usuariosListaEl, grupo.usuarios || [], grupo, index + 1);
            }
        } else {
            // --- Añadir Nuevo Grupo ---
            const newGrupoElement = crearGrupoElement(grupo, index);
            container.appendChild(newGrupoElement);
        }
    });

    // 5. Restaurar el estado de expansión si es necesario
    if (openGroupName) {
        const groupToReopen = Array.from(container.querySelectorAll('.grupo-container')).find(g => g.dataset.groupName === openGroupName);
        if (groupToReopen && !groupToReopen.classList.contains('expandido')) {
            // Usamos forceOpen=true para asegurar que se abra
            toggleGrupo(groupToReopen, true); 
        } else if (!groupToReopen) {
            // El grupo que estaba abierto ya no existe, cerrar el overlay
            closeExpandedGroup();
        }
    }
}

function toggleGrupo(grupoElement, forceOpen = false) {
    const usuariosLista = grupoElement.querySelector('.usuarios-lista');
    const isExpanded = usuariosLista.classList.contains('show');
    const pageOverlay = document.getElementById('page-overlay');
    
    document.querySelectorAll('.grupo-container').forEach(g => {
        g.classList.remove('expandido', 'oculto');
        g.querySelector('.usuarios-lista').classList.remove('show');
    });

    if (!isExpanded || forceOpen) {
        document.querySelectorAll('.grupo-container').forEach(g => {
            if (g !== grupoElement) g.classList.add('oculto');
        });
        grupoElement.classList.add('expandido');
        usuariosLista.classList.add('show');
        pageOverlay.classList.add('active');
    } else {
        pageOverlay.classList.remove('active');
    }
}

function closeExpandedGroup() {
    const expandedGroup = document.querySelector('.grupo-container.expandido');
    if (expandedGroup) {
        toggleGrupo(expandedGroup); 
    }
}


function showChangeNotification(usuario, grupo, cambios, tipo = 'normal') {
    const container = document.getElementById('notifications-container');
    const existing = container.querySelectorAll('.change-notification');
    if (existing.length >= 4) {
        existing[0].classList.remove('show');
        setTimeout(() => existing[0].remove(), 300);
    }
    const notification = document.createElement('div');
    notification.className = `change-notification ${tipo}`;
    let iconClass, title, message;
    if (tipo === 'rapid') { iconClass = 'fas fa-bolt'; title = 'CAMBIOS RÁPIDOS'; message = `${usuario} (${grupo}) tuvo ${cambios} cambios en 5 min.`; }
    else if (tipo === 'persistent') { iconClass = 'fas fa-exclamation-triangle'; title = 'CAMBIOS PERSISTENTES'; message = `${usuario} (${grupo}) tuvo ${cambios} cambios en 30 min.`; }
    else { iconClass = 'fas fa-sync-alt'; title = 'CAMBIO DETECTADO'; message = `${usuario} (${grupo}) actualizó sus pinceles.`; }
    notification.innerHTML = `<i class="${iconClass} change-notification-icon"></i><div class="change-notification-content"><div class="change-notification-title">${title}</div><div class="change-notification-message">${message}</div></div>`;
    container.appendChild(notification);
    setTimeout(() => notification.classList.add('show'), 100);
    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => notification.remove(), 600);
    }, CHANGE_NOTIFICATION_DURATION);
}

function detectarCambiosPersistentes(nuevosDatos) {
    const ahora = Date.now();
    nuevosDatos.forEach(grupo => {
        grupo.usuarios.forEach(usuario => {
            const claveUsuario = `${grupo.nombre}-${usuario.nombre}`;
            if (!historialUsuarios[claveUsuario]) {
                historialUsuarios[claveUsuario] = { pinceles: usuario.pinceles, cambiosRecientes: [] };
                return;
            }
            if (usuario.pinceles !== historialUsuarios[claveUsuario].pinceles) {
                const cambio = { tiempo: ahora, anterior: historialUsuarios[claveUsuario].pinceles, nuevo: usuario.pinceles };
                historialUsuarios[claveUsuario].pinceles = usuario.pinceles;
                historialUsuarios[claveUsuario].cambiosRecientes.push(cambio);

                historialUsuarios[claveUsuario].cambiosRecientes = historialUsuarios[claveUsuario].cambiosRecientes.filter(c => ahora - c.tiempo <= RAPID_CHANGE_THRESHOLD);
                
                const positiveChanges = historialUsuarios[claveUsuario].cambiosRecientes.filter(c => c.nuevo > c.anterior).length;
                if(positiveChanges >= 2){
                    usuario.trending = true;
                }

                if (historialUsuarios[claveUsuario].cambiosRecientes.length >= RAPID_CHANGE_COUNT) {
                    showChangeNotification(usuario.nombre, grupo.nombre, historialUsuarios[claveUsuario].cambiosRecientes.length, 'rapid');
                } else {
                    showChangeNotification(usuario.nombre, grupo.nombre, 1, 'normal');
                }
            }
        });
    });
}

function getRankIndicator(posicion, isNegative = false) {
    if (isNegative) return `<div class="rank-indicator rank-negative">-</div>`;
    return `<div class="rank-indicator rank-${posicion}">${posicion}</div>`;
}

function setupModals() {
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.classList.remove('active');
        });
    });
    document.querySelector('#gestion-titulo').addEventListener('click', () => document.getElementById('gestion-modal').classList.add('active'));
    document.querySelector('#modal-cancel').addEventListener('click', () => document.getElementById('gestion-modal').classList.remove('active'));
    document.querySelector('#modal-submit').addEventListener('click', verificarClave);
    document.querySelector('#clave-input').addEventListener('keypress', (e) => e.key === 'Enter' && verificarClave());
    
    document.querySelector('.close-student-modal').addEventListener('click', () => document.getElementById('student-modal').classList.remove('active'));
    
    document.getElementById('page-overlay').addEventListener('click', closeExpandedGroup);
}

function verificarClave() {
    if (document.getElementById('clave-input').value === CLAVE_MAESTRA) {
        window.open(SPREADSHEET_URL, '_blank');
        document.getElementById('gestion-modal').classList.remove('active');
    } else { 
        const input = document.getElementById('clave-input');
        input.style.borderColor = 'red';
        input.style.animation = 'shake 0.5s';
        setTimeout(() => {
            input.style.animation = '';
        }, 500);
     }
}

document.addEventListener('click', (e) => {
    if (e.target.classList.contains('usuario-nombre')) {
        const usuario = JSON.parse(e.target.dataset.usuario);
        const grupo = JSON.parse(e.target.dataset.grupo);
        showStudentInfo(usuario, grupo, e.target.dataset.posicionGrupo, e.target.dataset.posicionIndividual);
    }
});

function showStudentInfo(usuario, grupo, posGrupo, posInd) {
    const modal = document.getElementById('student-modal');
    const infoGrid = document.getElementById('student-info-grid');
    const totalPinceles = usuario.pinceles || 0;
    const posIndClass = posInd >= 1 && posInd <= 6 ? `position-${posInd}` : 'accent';
    const posGrupoClass = posGrupo >= 1 && posGrupo <= 6 ? `position-${posGrupo}` : 'accent';

    infoGrid.innerHTML = `
        <div class="student-info-card"><div class="student-info-label">Grupo</div><div class="student-info-value accent">${grupo.nombre}</div></div>
        <div class="student-info-card"><div class="student-info-label">Posición en Grupo</div><div class="student-info-value ${posIndClass}">${posInd}°</div></div>
        <div class="student-info-card"><div class="student-info-label">Posición del Grupo</div><div class="student-info-value ${posGrupoClass}">${posGrupo}°</div></div>
        <div class="student-info-card"><div class="student-info-label">Total Pinceles</div><div class="student-info-value ${totalPinceles >= 0 ? 'positive' : 'negative'}">${formatNumber(totalPinceles)}</div></div>
        <div class="student-info-card"><div class="student-info-label">Total Grupo</div><div class="student-info-value accent">${formatNumber(grupo.total)}</div></div>
        <div class="student-info-card"><div class="student-info-label">% del Grupo</div><div class="student-info-value accent">${grupo.total !== 0 ? ((totalPinceles / grupo.total) * 100).toFixed(1) : 0}%</div></div>`;
    modal.classList.add('active');
}

function hideWelcomeScreen() {
    const welcomeScreen = document.getElementById('welcome-screen');
    if (welcomeScreen) {
        welcomeScreen.classList.add('hidden');
        setTimeout(() => welcomeScreen.remove(), 1000);
    }
}

function showWelcomeScreen() {
    if (!sessionStorage.getItem('welcomeShown')) {
        sessionStorage.setItem('welcomeShown', 'true');
        const container = document.querySelector('.welcome-container');
        const redirectMessage = document.getElementById('welcome-redirect-message');
        setTimeout(() => {
            if (container) container.style.opacity = '0';
            if (redirectMessage) redirectMessage.style.opacity = '1';
        }, 4000);
        setTimeout(hideWelcomeScreen, 6000);
    } else {
        hideWelcomeScreen();
    }
}

function updateCountdown() {
    const container = document.querySelector('.countdown-container');
    if (!container) return;

    function getLastThursday(year, month) {
        const lastDayOfMonth = new Date(year, month + 1, 0);
        let lastThursday = new Date(lastDayOfMonth);
        lastThursday.setDate(lastThursday.getDate() - (lastThursday.getDay() + 3) % 7);
        return lastThursday;
    }

    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();

    let auctionDay = getLastThursday(currentYear, currentMonth);
    const auctionStart = new Date(auctionDay.getFullYear(), auctionDay.getMonth(), auctionDay.getDate(), 0, 0, 0, 0);
    const auctionEnd = new Date(auctionDay.getFullYear(), auctionDay.getMonth(), auctionDay.getDate(), 23, 59, 59, 999);

    if (now >= auctionStart && now <= auctionEnd) {
        container.classList.add('auction-day');
    } else {
        container.classList.remove('auction-day');

        let targetDate = auctionStart;

        if (now > auctionEnd) {
            targetDate = getLastThursday(currentYear, currentMonth + 1);
            targetDate.setHours(0, 0, 0, 0); 
        }

        const distance = targetDate - now;

        const days = Math.floor(distance / (1000 * 60 * 60 * 24));
        const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((distance % (1000 * 60)) / 1000);

        const daysEl = document.getElementById('days');
        const hoursEl = document.getElementById('hours');
        const minutesEl = document.getElementById('minutes');
        const secondsEl = document.getElementById('seconds');

        if(daysEl) daysEl.innerText = String(days).padStart(2, '0');
        if(hoursEl) hoursEl.innerText = String(hours).padStart(2, '0');
        if(minutesEl) minutesEl.innerText = String(minutes).padStart(2, '0');
        if(secondsEl) secondsEl.innerText = String(seconds).padStart(2, '0');
    }
}


function initializeApp() {
    showWelcomeScreen();
    setupModals();
    cargarDatos();
    setInterval(cargarDatos, 10000);
    updateCountdown();
    setInterval(updateCountdown, 1000);
}

document.addEventListener('DOMContentLoaded', initializeApp);

