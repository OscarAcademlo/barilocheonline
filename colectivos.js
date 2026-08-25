// colectivos.js - Bariloche.Online Líneas y Recorridos de Colectivos (Mi Bus)

document.addEventListener('DOMContentLoaded', function () {
    initColectivosMap();
});

let mapColectivos = null;
let activeRouteGroup = null;
let currentMarkers = [];

const LINEAS_DATA = {
    "20": {
        numero: "20",
        nombre: "Línea 20: Terminal ⇄ Llao Llao (Por Av. Bustillo)",
        color: "#e65100",
        frecuencia: "Cada 20 min (Hora Pico)",
        descripcion: "Conecta la Terminal de Ómnibus con el Centro Cívico y toda la traza de Av. Bustillo hasta el Hotel Llao Llao y Puerto Pañuelo (Circuito Chico).",
        puntos: [
            [-41.1342, -71.2891], // Terminal
            [-41.1335, -71.3102], // Centro Cívico / San Martín
            [-41.1320, -71.3400], // Bustillo Km 4 (Teleférico)
            [-41.1275, -71.3920], // Bustillo Km 8 (Playa Bonita)
            [-41.1150, -71.4350], // Bustillo Km 13 (Bahía Serena)
            [-41.0850, -71.4920], // Bustillo Km 18 (Cruce Circuito Chico)
            [-41.0538, -71.5332]  // Puerto Pañuelo / Llao Llao
        ],
        paradas: [
            { id: "p20_1", coord: [-41.1342, -71.2891], nombre: "Cabecera Terminal de Ómnibus", detalle: "12 de Octubre y Diagonal Capraro" },
            { id: "p20_2", coord: [-41.1335, -71.3102], nombre: "Centro Cívico / Av. San Martín", detalle: "Centro comercial e institucional de Bariloche" },
            { id: "p20_3", coord: [-41.1320, -71.3400], nombre: "Bustillo Km 4 - Teleférico Otto", detalle: "Acceso a la base del Teleférico Cerro Otto" },
            { id: "p20_4", coord: [-41.1275, -71.3920], nombre: "Bustillo Km 8 - Playa Bonita", detalle: "Balneario tradicional de verano" },
            { id: "p20_5", coord: [-41.1150, -71.4350], nombre: "Bustillo Km 13 - Bahía Serena", detalle: "Playa de arena fina y deportes náuticos" },
            { id: "p20_6", coord: [-41.0850, -71.4920], nombre: "Bustillo Km 18 - Cruce Circuito Chico", detalle: "Empalme a Cerro Catedral y Lago Escondido" },
            { id: "p20_7", coord: [-41.0538, -71.5332], nombre: "Cabecera Llao Llao / Puerto Pañuelo", detalle: "Zarpadas de excursiones lacustres a Isla Victoria" }
        ]
    },
    "50": {
        numero: "50",
        nombre: "Línea 50: Centro ⇄ Los Coihues (Por Av. Pioneros)",
        color: "#15803d",
        frecuencia: "Cada 30 min",
        descripcion: "Une el centro cívico bordeando Av. Los Pioneros hasta Villa Los Coihues y la cabecera norte del Lago Gutiérrez.",
        puntos: [
            [-41.1340, -71.3080], // Moreno y Villegas
            [-41.1410, -71.3400], // Pioneros Km 4
            [-41.1550, -71.3850], // Pioneros Km 8 (Virgen de las Nieves)
            [-41.1680, -71.4120]  // Villa Los Coihues / Lago Gutiérrez
        ],
        paradas: [
            { id: "p50_1", coord: [-41.1340, -71.3080], nombre: "Parada Centro (Moreno y Villegas)", detalle: "Punto céntrico de transbordo" },
            { id: "p50_2", coord: [-41.1410, -71.3400], nombre: "Pioneros Km 4 - Acceso Teleférico", detalle: "Cruce hacia Cerro Otto" },
            { id: "p50_3", coord: [-41.1550, -71.3850], nombre: "Pioneros Km 8 - Virgen de las Nieves", detalle: "Gruta y acceso a Catedral" },
            { id: "p50_4", coord: [-41.1680, -71.4120], nombre: "Cabecera Los Coihues / Lago Gutiérrez", detalle: "Entrada a senderos Cascada de los Duendes" }
        ]
    },
    "72": {
        numero: "72",
        nombre: "Línea 72: Terminal ⇄ Aeropuerto Bariloche (BRC)",
        color: "#1d4ed8",
        frecuencia: "Coincide con vuelos principales",
        descripcion: "Conecta la Terminal de Ómnibus y el Centro Cívico con el Aeropuerto Internacional Teniente Luis Candelaria.",
        puntos: [
            [-41.1342, -71.2891], // Terminal
            [-41.1335, -71.3102], // Centro Cívico
            [-41.1380, -71.2450], // Ruta 40 Este
            [-41.1512, -71.1578]  // Aeropuerto BRC
        ],
        paradas: [
            { id: "p72_1", coord: [-41.1335, -71.3102], nombre: "Parada Centro Cívico", detalle: "Salida hacia el aeropuerto" },
            { id: "p72_2", coord: [-41.1342, -71.2891], nombre: "Terminal de Ómnibus Bariloche", detalle: "Conexión con micros de larga distancia" },
            { id: "p72_3", coord: [-41.1380, -71.2450], nombre: "Ruta 40 Este - Barrio Las Marías", detalle: "Sector comercial este" },
            { id: "p72_4", coord: [-41.1512, -71.1578], nombre: "Cabecera Aeropuerto Internacional (BRC)", detalle: "Hall principal de arribos y salidas" }
        ]
    },
    "10": {
        numero: "10",
        nombre: "Línea 10: Centro ⇄ Colonia Suiza / Península San Pedro",
        color: "#9333ea",
        frecuencia: "Cada 60 min",
        descripcion: "Pasa por Bustillo y Península San Pedro hasta llegar a la histórica aldea de Colonia Suiza.",
        puntos: [
            [-41.1335, -71.3102], // Centro
            [-41.0850, -71.4920], // Bustillo Km 18
            [-41.0650, -71.4820], // Península San Pedro
            [-41.0960, -71.5120]  // Colonia Suiza
        ],
        paradas: [
            { id: "p10_1", coord: [-41.1335, -71.3102], nombre: "Centro Cívico / Moreno", detalle: "Salida este hacia Colonia Suiza" },
            { id: "p10_2", coord: [-41.0850, -71.4920], nombre: "Bustillo Km 18", detalle: "Empalme a Península" },
            { id: "p10_3", coord: [-41.0650, -71.4820], nombre: "Península San Pedro", detalle: "Miradores y mirador del Lago Moreno" },
            { id: "p10_4", coord: [-41.0960, -71.5120], nombre: "Cabecera Colonia Suiza", detalle: "Feria artesanal y curanto tradicional" }
        ]
    },
    "55": {
        numero: "55",
        nombre: "Línea 55: Centro ⇄ Cerro Catedral (Por Av. Bustillo / Pintos)",
        color: "#0284c7",
        frecuencia: "Cada 30 min (Temporada Nieve/Verano)",
        descripcion: "Servicio directo entre la ciudad y la base del centro de esquí Cerro Catedral.",
        puntos: [
            [-41.1335, -71.3102], // Centro
            [-41.1275, -71.3920], // Bustillo Km 8
            [-41.1550, -71.3850], // Virgen de las Nieves
            [-41.1710, -71.4390]  // Base Cerro Catedral
        ],
        paradas: [
            { id: "p55_1", coord: [-41.1335, -71.3102], nombre: "Centro Cívico", detalle: "Cabecera centro" },
            { id: "p55_2", coord: [-41.1275, -71.3920], nombre: "Bustillo Km 8", detalle: "Cruce hacia la montaña" },
            { id: "p55_3", coord: [-41.1550, -71.3850], nombre: "Virgen de las Nieves", detalle: "Acceso al valle del Gutiérrez" },
            { id: "p55_4", coord: [-41.1710, -71.4390], nombre: "Cabecera Base Cerro Catedral", detalle: "Plaza Amancay y medios de elevación" }
        ]
    }
};

function initColectivosMap() {
    const mapContainer = document.getElementById('map');
    if (!mapContainer) return;

    mapColectivos = L.map('map', { zoomControl: false }).setView([-41.1335, -71.3102], 12);
    L.control.zoom({ position: 'bottomright' }).addTo(mapColectivos);

    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; OpenStreetMap &copy; CARTO',
        maxZoom: 19
    }).addTo(mapColectivos);

    activeRouteGroup = L.layerGroup().addTo(mapColectivos);

    // Event listener del select
    const select = document.getElementById('lineaSelect');
    if (select) {
        select.addEventListener('change', function (e) {
            selectBusLine(e.target.value);
        });
    }

    // Cargar Línea 20 por defecto
    selectBusLine('20');
}

function selectBusLine(key) {
    const select = document.getElementById('lineaSelect');
    if (select && select.value !== key) {
        select.value = key;
    }

    // Actualizar chips activos
    const chips = document.querySelectorAll('#busChipsContainer .gasto-filter-chip');
    chips.forEach(chip => {
        const isTarget = chip.getAttribute('onclick') && chip.getAttribute('onclick').includes(`'${key}'`);
        if (isTarget) {
            const data = LINEAS_DATA[key];
            chip.classList.add('active');
            chip.style.background = data ? data.color : 'var(--primary)';
            chip.style.color = 'white';
        } else {
            chip.classList.remove('active');
            chip.style.background = 'var(--bg-secondary)';
            chip.style.color = 'var(--text-primary)';
        }
    });

    // Limpiar capa anterior
    if (activeRouteGroup) {
        activeRouteGroup.clearLayers();
    }
    currentMarkers = [];

    const banner = document.getElementById('busActiveInfoBanner');
    const stopsList = document.getElementById('busStopsListContainer');

    if (!key || !LINEAS_DATA[key]) {
        if (banner) banner.style.display = 'none';
        if (stopsList) {
            stopsList.innerHTML = `<div style="padding:20px; text-align:center; color:var(--text-secondary); font-size:0.9rem;">Elegí una línea de colectivo arriba para ver su recorrido.</div>`;
        }
        return;
    }

    const data = LINEAS_DATA[key];

    // Banner informativo
    if (banner) {
        document.getElementById('busLineTitle').textContent = data.nombre;
        document.getElementById('busLineDesc').textContent = data.descripcion;
        document.getElementById('busLineFreq').textContent = data.frecuencia;
        const lineBadge = document.getElementById('busLineBadge');
        if (lineBadge) {
            lineBadge.style.background = data.color;
            lineBadge.textContent = `Línea ${data.numero}`;
        }
        banner.style.display = 'block';
    }

    // 1. Dibujar traza de ruta
    const polyline = L.polyline(data.puntos, {
        color: data.color,
        weight: 6,
        opacity: 0.88,
        lineCap: 'round',
        lineJoin: 'round'
    }).addTo(activeRouteGroup);

    // Sombra de la ruta para estética premium
    L.polyline(data.puntos, {
        color: '#000000',
        weight: 10,
        opacity: 0.15
    }).addTo(activeRouteGroup);

    // 2. Renderizar paradas en el mapa y en la lista lateral
    let stopsHTML = '';

    data.paradas.forEach((parada, index) => {
        const isTerminal = index === 0 || index === data.paradas.length - 1;

        // Leaflet Icono personalizado
        const busIcon = L.divIcon({
            className: 'bus-leaflet-marker-wrap',
            iconSize: null,
            html: `
                <div class="bus-marker-pin" style="border-color:${data.color}; color:${data.color}; ${isTerminal ? 'background:' + data.color + '; color:#fff;' : ''}">
                    <i class="fas ${isTerminal ? 'fa-bus' : 'fa-location-dot'}"></i>
                </div>
            `
        });

        const popupContent = `
            <div style="font-family:sans-serif; min-width:180px; padding:4px;">
                <span style="background:${data.color}; color:white; font-size:0.7rem; font-weight:800; padding:2px 8px; border-radius:10px; display:inline-block; margin-bottom:4px;">
                    Parada #${index + 1} • Línea ${data.numero}
                </span>
                <h4 style="font-size:0.95rem; font-weight:800; color:#0f172a; margin:4px 0 2px 0;">${parada.nombre}</h4>
                <p style="font-size:0.8rem; color:#475569; margin:0;">${parada.detalle}</p>
            </div>
        `;

        const marker = L.marker(parada.coord, { icon: busIcon })
            .bindPopup(popupContent)
            .addTo(activeRouteGroup);

        marker.stopId = parada.id;
        currentMarkers.push(marker);

        // Generar HTML para lista lateral
        stopsHTML += `
            <div class="stop-item-card" onclick="focusStopOnMap('${parada.id}', ${parada.coord[0]}, ${parada.coord[1]})">
                <div class="stop-number-badge" style="background:${data.color};">
                    ${index + 1}
                </div>
                <div style="flex:1;">
                    <div style="font-size:0.88rem; font-weight:800; color:var(--text-primary); line-height:1.2;">${parada.nombre}</div>
                    <small style="font-size:0.78rem; color:var(--text-secondary);">${parada.detalle}</small>
                </div>
                <i class="fas fa-chevron-right" style="color:var(--text-secondary); font-size:0.8rem;"></i>
            </div>
        `;
    });

    if (stopsList) {
        stopsList.innerHTML = stopsHTML;
    }

    // 3. Ajustar mapa al recorrido completo
    mapColectivos.fitBounds(polyline.getBounds(), { padding: [40, 40] });
}

function focusStopOnMap(stopId, lat, lng) {
    if (!mapColectivos) return;

    mapColectivos.flyTo([lat, lng], 15, {
        duration: 1.2
    });

    const marker = currentMarkers.find(m => m.stopId === stopId);
    if (marker) {
        setTimeout(() => {
            marker.openPopup();
        }, 1200);
    }
}
