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

    // Cargar empresas habilitadas desde el backend PHP (pagaron o tienen código gratis)
    // Esto garantiza que aparezcan en el select aunque no haya vehículos transmitiendo aún
    loadExcursionCompaniesFromBackend();

    // Escuchar estado de conexión
    window.bariRuta.onStatusChange(msg => {
        if (statusText) statusText.textContent = msg;
    });

    // Escuchar cambios de empresas en Supabase (vehículos activos)
    window.bariRuta.onCompaniesChange(companies => {
        mergeAndRenderCompanies(companies);
    });

    // Escuchar vehículos en tiempo real (transmitidos desde la app Android)
    window.bariRuta.onVehiclesChange(vehicles => {
        renderLiveVehicles(vehicles);
    });
}

// Empresas registradas (del backend), se combinan con las de Supabase
let _backendCompanies = [];

async function loadExcursionCompaniesFromBackend() {
    try {
        const res = await fetch('save_alojamiento.php?action=get_excursion_companies&t=' + Date.now());
        const companies = await res.json();
        _backendCompanies = companies || [];
        mergeAndRenderCompanies(window.bariRuta.companies || []);
    } catch (e) {
        console.warn('No se pudieron cargar empresas del backend:', e);
    }
}

function mergeAndRenderCompanies(supabaseCompanies) {
    // Unir: backend + Supabase, sin duplicados (por nombre)
    const merged = [..._backendCompanies];
    (supabaseCompanies || []).forEach(sc => {
        const exists = merged.some(b => b.name.toLowerCase().trim() === (sc.name || '').toLowerCase().trim());
        if (!exists) merged.push(sc);
    });
    renderCompanySelect(merged);
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

const COMPANY_PALETTE = [
    '#0084FF', // Azul Bariloche
    '#6C5CE7', // Violeta Real
    '#00B894', // Verde Esmeralda
    '#E17055', // Naranja Terracota
    '#E84393', // Rosa Intenso
    '#F39C12', // Amarillo Oro
    '#00CEC9', // Turquesa
    '#D63031', // Rojo Rubí
    '#0984E3', // Azul Cielo
    '#10B981'  // Verde Menta
];

function getCompanyColor(companyName) {
    if (!companyName) return '#0084FF';
    let hash = 0;
    const str = companyName.toLowerCase().trim();
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash) % COMPANY_PALETTE.length;
    return COMPANY_PALETTE[index];
}

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
        const compColor = getCompanyColor(veh.company_name);

        // --- ACTUALIZAR TRAZADO DEL RECORRIDO EN TIEMPO REAL ---
        if (!vehicleTracks[key]) {
            vehicleTracks[key] = [latLng];
        }
        
        const track = vehicleTracks[key];
        const lastPoint = track.length > 0 ? track[track.length - 1] : null;
        
        if (lastPoint) {
            // Calcular distancia en metros desde el último punto
            const distMeters = map.distance(lastPoint, latLng);
            
            // Si hubo un salto brusco mayor a 500 metros (reinicio de GPS o punto de prueba anterior), reiniciar traza
            if (distMeters > 500) {
                vehicleTracks[key] = [latLng];
                if (vehiclePolylines[key]) {
                    vehiclePolylines[key].setLatLngs([latLng]);
                }
            } else if (distMeters >= 12 && (veh.speed || 0) > 2) {
                // Solo registrar nuevo punto si el vehículo REALMENTE se desplazó más de 12 metros y está en movimiento
                track.push(latLng);
                if (track.length > 500) track.shift();
                
                if (vehiclePolylines[key]) {
                    vehiclePolylines[key].setLatLngs(track);
                } else {
                    vehiclePolylines[key] = L.polyline(track, {
                        color: compColor,
                        weight: 4,
                        opacity: 0.8,
                        lineCap: 'round',
                        lineJoin: 'round'
                    }).addTo(map);
                }
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
            c => (c.name || '').toLowerCase().trim() === (veh.company_name || '').toLowerCase().trim()
        );
        const companyPhone = currentCompany?.phone || '+5492944674774';
        const matchedMovil = currentCompany?.moviles?.find(
            m => (m.codigo || '').toLowerCase().trim() === (veh.vehicle_code || '').toLowerCase().trim() ||
                 (m.chofer_nombre || '').toLowerCase().trim() === (veh.driver_name || '').toLowerCase().trim()
        );
        const vehicleBrand = matchedMovil?.marca || veh.vehicle_brand || 'Mercedes-Benz Sprinter';
        const vehiclePlate = matchedMovil?.patente_ultimos3 || veh.vehicle_plate || '789';

        // Marcador combi con COLOR PERSONALIZADO DE EMPRESA, CHOFER Y NOMBRE
        const iconHtml = `
            <div class="combi-live-marker ${isMoving ? 'is-moving' : ''}" style="--comp-color: ${compColor};">
                <div class="combi-pulse-wave" style="border-color: ${compColor};"></div>
                <div class="combi-body-card" style="${heading > 0 ? `transform: rotate(${heading}deg);` : ''} border-color: ${compColor};">
                    <div class="combi-icon-graphic">
                        <svg viewBox="0 0 64 64" width="40" height="40" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <!-- Carrocería Combi BLANCA brillante con borde del color de empresa -->
                            <rect x="8" y="10" width="48" height="38" rx="9" fill="#ffffff" stroke="${compColor}" stroke-width="1.8"/>
                            <path d="M8 23H56V38C56 43.5 51.5 48 46 48H18C12.5 48 8 43.5 8 38V23Z" fill="#f8fafc"/>
                            <!-- Techo / Franja de color distintivo de la empresa -->
                            <path d="M8 18H56V23H8V18Z" fill="${compColor}"/>
                            <!-- Parabrisas frontal y ventanillas oscuras -->
                            <rect x="12" y="13" width="18" height="9" rx="2.5" fill="#1e293b"/>
                            <rect x="34" y="13" width="18" height="9" rx="2.5" fill="#1e293b"/>
                            <!-- Luces delanteras amarillas -->
                            <circle cx="14" cy="41" r="4" fill="#facc15" stroke="#eab308" stroke-width="1"/>
                            <circle cx="50" cy="41" r="4" fill="#facc15" stroke="#eab308" stroke-width="1"/>
                            <!-- Parrilla -->
                            <rect x="22" y="39" width="20" height="4.5" rx="2" fill="#334155"/>
                            <rect x="24" y="40.5" width="16" height="1.5" rx="0.5" fill="#94a3b8"/>
                            <!-- Ruedas -->
                            <rect x="13" y="47" width="9" height="5" rx="2" fill="#0f172a"/>
                            <rect x="42" y="47" width="9" height="5" rx="2" fill="#0f172a"/>
                        </svg>
                    </div>
                </div>
                <div class="combi-badge-pill" style="border-color: ${compColor};">
                    <div class="combi-company-tag" style="background: ${compColor};">${companyName}</div>
                    <div class="combi-driver-tag"><i class="fas fa-user-tie"></i> ${driverName}</div>
                    <div class="combi-info-subrow">
                        <b>${veh.vehicle_code || 'Combi'}</b>
                        <span class="combi-speed-pill">${speedText}</span>
                    </div>
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
                <div class="uber-card-header" style="border-bottom: 2px solid ${compColor}; padding-bottom: 8px;">
                    <div class="uber-vehicle-badge" style="background: ${compColor}18; color: ${compColor}; font-weight:800;">
                        <i class="fas fa-van-shuttle"></i>
                        <span>${veh.vehicle_code || 'Combi Oficial'}</span>
                    </div>
                    <div class="uber-live-badge">
                        <span class="live-dot-pulse"></span> EN VIVO
                    </div>
                </div>

                <!-- CUERPO DE LA TARJETA -->
                <div class="uber-card-body">
                    <div style="font-size:0.75rem; font-weight:900; color:${compColor}; text-transform:uppercase; margin-top:8px; margin-bottom:2px; letter-spacing:0.3px;">
                        <i class="fas fa-building"></i> ${companyName}
                    </div>
                    <h3 class="uber-excursion-title" style="margin:2px 0 10px 0;">${excursionName}</h3>
                    
                    <!-- DATOS DEL VEHÍCULO Y PATENTE -->
                    <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:7px 10px; margin-bottom:10px; display:flex; justify-content:space-between; align-items:center; font-size:0.78rem;">
                        <span><i class="fas fa-truck-pickup" style="color:#64748b; margin-right:4px;"></i> <b>${vehicleBrand}</b></span>
                        ${vehiclePlate ? `<span style="background:#0f172a; color:#fff; font-weight:800; font-size:0.72rem; padding:2px 6px; border-radius:5px; letter-spacing:0.5px;">PATENTE ***${vehiclePlate}</span>` : ''}
                    </div>

                    <!-- INFO DE CHOFER -->
                    <div class="uber-driver-row">
                        <div class="uber-driver-avatar" style="background: ${compColor};">
                            <i class="fas fa-user-tie"></i>
                        </div>
                        <div class="uber-driver-info">
                            <div class="uber-driver-name">${driverName}</div>
                            <div class="uber-company-name">Chofer Oficial • ${companyName}</div>
                        </div>
                        <div class="uber-rating-badge">
                            <i class="fas fa-star"></i> 5.0
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
                                ${isMoving ? 'En recorrido' : 'En parada'}
                            </span>
                        </div>
                    </div>
                </div>

                <!-- BOTONES DE ACCIÓN: COMPRAR TICKET + WHATSAPP -->
                <div class="uber-card-actions">
                    <a href="ticket.html?empresa=${encodeURIComponent(companyName)}&excursion=${encodeURIComponent(excursionName)}&combi=${encodeURIComponent(veh.vehicle_code || '')}&chofer=${encodeURIComponent(driverName)}" class="uber-btn-primary" style="background:${compColor};">
                        <i class="fas fa-ticket-alt"></i> Comprar Ticket
                    </a>
                    <a href="https://wa.me/${companyPhone.replace(/\D/g, '')}?text=${encodeURIComponent(`¡Hola! Estoy viendo en vivo la combi ${veh.vehicle_code || ''} (${vehicleBrand} ***${vehiclePlate}) de ${companyName} con chofer ${driverName} en Bariloche.Online y quiero consultar por la excursión ${excursionName}.`)}" target="_blank" class="uber-btn-whatsapp" title="Consultar por WhatsApp">
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
