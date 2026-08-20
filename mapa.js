/**
 * ==============================================================================
 * BARIRUTA - CONTROLADOR DE MAPA EN VIVO PARA TURISTAS (100% REALTIME)
 * Bariloche.Online - Visualización directa de las combis y su recorrido en tiempo real
 * ==============================================================================
 */

let map = null;
let vehicleMarkers = {};
let vehicleTracks = {};      // Historial de coordenadas del recorrido en tiempo real
let vehiclePolylines = {};   // Capas Polyline dibujadas en el mapa Leaflet
let vehicleIconCache = {};   // Caché del último estado visual renderizado (evita parpadeo)

document.addEventListener('DOMContentLoaded', () => {
    initTouristMap();
    setupRealtimeTracking();
});

/**
 * 1. INICIALIZACIÓN DEL MAPA LEAFLET
 */
function initTouristMap() {
    map = L.map('liveMap', {
        zoomControl: false,
        attributionControl: false
    }).setView([-41.1335, -71.3103], 13);

    // Cartografía moderna y limpia
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        maxZoom: 19,
        subdomains: 'abcd'
    }).addTo(map);

    L.control.zoom({ position: 'bottomright' }).addTo(map);
}

/**
 * 2. CONFIGURACIÓN DE ESCUCHA REALTIME CON SUPABASE
 */
function setupRealtimeTracking() {
    const statusText = document.getElementById('realtimeStatusText');

    // Escuchar estado de conexión
    window.bariRuta.onStatusChange(msg => {
        if (statusText) statusText.textContent = msg;
    });

    // Escuchar cambios de empresas en Supabase
    window.bariRuta.onCompaniesChange(companies => {
        renderCompanySelect(companies);
    });

    // Escuchar vehículos en tiempo real (transmitidos desde la app Android)
    window.bariRuta.onVehiclesChange(vehicles => {
        renderLiveVehicles(vehicles);
    });
}

function renderCompanySelect(companies) {
    const select = document.getElementById('companySelect');
    if (!select) return;

    select.innerHTML = `<option value="">🏢 Todas las Empresas</option>` + companies.map(c => `
        <option value="${c.name}" ${c.name === window.bariRuta.selectedCompany ? 'selected' : ''}>🏢 ${c.name}</option>
    `).join('');
}

window.handleCompanyChange = (companyName) => {
    window.bariRuta.setCompany(companyName);

    // Limpiar marcadores y polilíneas de la empresa anterior
    Object.values(vehicleMarkers).forEach(m => map.removeLayer(m));
    vehicleMarkers = {};
    Object.values(vehiclePolylines).forEach(p => map.removeLayer(p));
    vehiclePolylines = {};
    vehicleTracks = {};
};

/**
 * 3. RENDERIZAR Y ANIMAR VEHÍCULOS Y SU RECORRIDO EN TIEMPO REAL
 */
function renderLiveVehicles(vehicles) {
    // Si no hay vehículos transmitiendo, limpiar todos los marcadores y recorridos
    if (!vehicles || vehicles.length === 0) {
        Object.values(vehicleMarkers).forEach(m => map.removeLayer(m));
        vehicleMarkers = {};
        Object.values(vehiclePolylines).forEach(p => map.removeLayer(p));
        vehiclePolylines = {};
        vehicleTracks = {};
        return;
    }

    // 1. ELIMINAR MARCADORES Y RECORRIDOS QUE YA NO TRANSMITEN O FUERON RETIRADOS ("Dejar de mostrar")
    const activeKeys = new Set();
    vehicles.forEach(v => {
        if (v.lat && v.lng) {
            // Clave estable company|vehicle_code (misma que en supabase_client.js)
            activeKeys.add(`${(v.company_name || '').trim().toLowerCase()}|${(v.vehicle_code || '').trim().toLowerCase()}`);
        }
    });

    Object.keys(vehicleMarkers).forEach(key => {
        if (!activeKeys.has(key)) {
            if (vehicleMarkers[key]) map.removeLayer(vehicleMarkers[key]);
            delete vehicleMarkers[key];
            if (vehiclePolylines[key]) map.removeLayer(vehiclePolylines[key]);
            delete vehiclePolylines[key];
            delete vehicleTracks[key];
            delete vehicleIconCache[key]; // Limpiar caché del ícono
        }
    });

    // 2. RENDERIZAR O ACTUALIZAR MARCADORES Y RECORRIDOS ACTIVOS
    vehicles.forEach(veh => {
        if (!veh.lat || !veh.lng) return;

        // Clave estable que coincide con _vehicleKey() en supabase_client.js
        // Evita duplicados entre datos de Broadcast (sin id) y datos de DB (con id)
        const key = `${(veh.company_name || '').trim().toLowerCase()}|${(veh.vehicle_code || '').trim().toLowerCase()}`;
        const latLng = [veh.lat, veh.lng];

        // --- ACTUALIZAR TRAZADO DEL RECORRIDO EN TIEMPO REAL ---
        if (!vehicleTracks[key]) {
            vehicleTracks[key] = [];
        }
        
        const track = vehicleTracks[key];
        const lastPoint = track.length > 0 ? track[track.length - 1] : null;
        
        // Agregar punto si es nuevo o se ha movido
        if (!lastPoint || (Math.abs(lastPoint[0] - veh.lat) > 0.00002 || Math.abs(lastPoint[1] - veh.lng) > 0.00002)) {
            track.push(latLng);
            // Limitar longitud máxima de la traza para rendimiento óptimo
            if (track.length > 1000) track.shift();
        }

        // Dibujar o actualizar polilínea del recorrido
        if (track.length > 1) {
            if (vehiclePolylines[key]) {
                vehiclePolylines[key].setLatLngs(track);
            } else {
                vehiclePolylines[key] = L.polyline(track, {
                    color: '#0084FF',
                    weight: 5,
                    opacity: 0.85,
                    lineCap: 'round',
                    lineJoin: 'round',
                    dashArray: null
                }).addTo(map);
            }
        }

        // --- RENDERIZAR MARCADOR Y FICHA DEL VEHÍCULO ---
        const companyName = veh.company_name || 'Empresa Local';
        const excursionName = veh.excursion_name || 'Circuito Turístico Bariloche';
        const driverName = veh.driver_name || 'Chofer Asignado';
        const speed = Math.round(veh.speed || 0);
        const heading = Math.round(veh.heading || 0);
        const speedText = speed > 0 ? `${speed} km/h` : 'En parada';
        const isMoving = speed > 0;

        const currentCompany = window.bariRuta?.companies?.find(
            c => (c.name || '').toLowerCase() === (veh.company_name || '').toLowerCase()
        );
        const companyPhone = currentCompany?.phone || '+5492944123456';

        // Marcador combi BLANCA con animación de pulso y orientación
        const iconHtml = `
            <div class="combi-live-marker ${isMoving ? 'is-moving' : ''}">
                <div class="combi-pulse-wave"></div>
                <div class="combi-body-card" style="${heading > 0 ? `transform: rotate(${heading}deg);` : ''}">
                    <div class="combi-icon-graphic">
                        <svg viewBox="0 0 64 64" width="40" height="40" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <!-- Carrocería Combi BLANCA brillante -->
                            <rect x="8" y="10" width="48" height="38" rx="9" fill="#ffffff" stroke="#cbd5e1" stroke-width="1.5"/>
                            <path d="M8 23H56V38C56 43.5 51.5 48 46 48H18C12.5 48 8 43.5 8 38V23Z" fill="#f8fafc"/>
                            <!-- Techo / Franja de contraste azul Bariloche -->
                            <path d="M8 18H56V23H8V18Z" fill="#0084ff"/>
                            <!-- Parabrisas frontal y ventanillas oscuras -->
                            <rect x="12" y="13" width="18" height="9" rx="2.5" fill="#1e293b"/>
                            <rect x="34" y="13" width="18" height="9" rx="2.5" fill="#1e293b"/>
                            <!-- Luces delanteras potentes amarillas -->
                            <circle cx="14" cy="41" r="4" fill="#facc15" stroke="#eab308" stroke-width="1"/>
                            <circle cx="50" cy="41" r="4" fill="#facc15" stroke="#eab308" stroke-width="1"/>
                            <!-- Parrilla y paragolpes delantero -->
                            <rect x="22" y="39" width="20" height="4.5" rx="2" fill="#334155"/>
                            <rect x="24" y="40.5" width="16" height="1.5" rx="0.5" fill="#94a3b8"/>
                            <!-- Ruedas -->
                            <rect x="13" y="47" width="9" height="5" rx="2" fill="#0f172a"/>
                            <rect x="42" y="47" width="9" height="5" rx="2" fill="#0f172a"/>
                        </svg>
                    </div>
                </div>
                <div class="combi-badge-pill">
                    <b>${veh.vehicle_code || 'Combi'}</b>
                    <span class="combi-speed-pill">${speedText}</span>
                </div>
            </div>
        `;

        const customIcon = L.divIcon({
            className: 'custom-leaflet-marker',
            html: iconHtml,
            iconSize: [60, 60],
            iconAnchor: [30, 30],
            popupAnchor: [0, -30]
        });

        // MINICARD ESTILO UBER / CABIFY PREMIUM
        const popupContent = `
            <div class="uber-mini-card">
                <!-- CABECERA: TIPO DE UNIDAD + ESTADO EN VIVO -->
                <div class="uber-card-header">
                    <div class="uber-vehicle-badge">
                        <i class="fas fa-van-shuttle"></i>
                        <span>${veh.vehicle_code || 'Combi Oficial'}</span>
                    </div>
                    <div class="uber-live-badge">
                        <span class="live-dot-pulse"></span> EN VIVO
                    </div>
                </div>

                <!-- TÍTULO DE LA EXCURSIÓN -->
                <div class="uber-card-body">
                    <h3 class="uber-excursion-title">${excursionName}</h3>
                    
                    <!-- INFO DE EMPRESA Y CHOFER -->
                    <div class="uber-driver-row">
                        <div class="uber-driver-avatar">
                            <i class="fas fa-user-tie"></i>
                        </div>
                        <div class="uber-driver-info">
                            <div class="uber-driver-name">${driverName}</div>
                            <div class="uber-company-name"><i class="fas fa-building"></i> ${companyName}</div>
                        </div>
                        <div class="uber-rating-badge">
                            <i class="fas fa-star"></i> 4.9
                        </div>
                    </div>

                    <!-- TELEMETRÍA: VELOCIDAD Y ESTADO -->
                    <div class="uber-telemetry-grid">
                        <div class="uber-telemetry-item">
                            <span class="uber-tel-label">Velocidad</span>
                            <span class="uber-tel-val"><i class="fas fa-gauge-high"></i> ${speedText}</span>
                        </div>
                        <div class="uber-telemetry-item">
                            <span class="uber-tel-label">Estado</span>
                            <span class="uber-tel-val ${isMoving ? 'en-viaje' : 'en-espera'}">
                                ${isMoving ? 'En viaje' : 'Disponible'}
                            </span>
                        </div>
                    </div>
                </div>

                <!-- BOTONES DE ACCIÓN: COMPRAR TICKET + WHATSAPP -->
                <div class="uber-card-actions">
                    <a href="ticket.html?empresa=${encodeURIComponent(companyName)}&excursion=${encodeURIComponent(excursionName)}&combi=${encodeURIComponent(veh.vehicle_code || '')}&chofer=${encodeURIComponent(driverName)}" class="uber-btn-primary">
                        <i class="fas fa-ticket-alt"></i> Comprar Ticket
                    </a>
                    <a href="https://wa.me/${companyPhone.replace(/\D/g, '')}?text=${encodeURIComponent(`¡Hola! Estoy viendo en vivo la combi ${veh.vehicle_code || ''} de ${companyName} (${excursionName}) en Bariloche.Online y quiero consultar por tickets.`)}" target="_blank" class="uber-btn-whatsapp" title="Consultar por WhatsApp">
                        <i class="fab fa-whatsapp"></i>
                    </a>
                </div>
            </div>
        `;

        if (vehicleMarkers[key]) {
            // Siempre actualizar posición (movimiento suave)
            vehicleMarkers[key].setLatLng(latLng);

            // Solo actualizar el ícono si cambió algo visual (heading o speed)
            // Evita el parpadeo por recrear el divIcon en cada broadcast
            const cached = vehicleIconCache[key];
            const visualChanged = !cached ||
                cached.heading !== heading ||
                cached.isMoving !== isMoving;

            if (visualChanged) {
                vehicleMarkers[key].setIcon(customIcon);
                vehicleIconCache[key] = { heading, isMoving };
            }

            vehicleMarkers[key].setPopupContent(popupContent);
        } else {
            const marker = L.marker(latLng, { icon: customIcon }).addTo(map);
            marker.bindPopup(popupContent, {
                maxWidth: 290,
                className: 'uber-popup-container'
            });
            vehicleMarkers[key] = marker;
            vehicleIconCache[key] = { heading, isMoving };
        }
    });
}
