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
        descripcion: "Recorrido troncal costero. Conecta la Terminal de Ómnibus con el Centro Cívico y los 24 kilómetros de Av. Bustillo hasta el Hotel Llao Llao y Puerto Pañuelo.",
        puntos: [
            [-41.1342, -71.2891], // Terminal
            [-41.1338, -71.2980], // Capraro y Elordi
            [-41.1335, -71.3102], // Centro Cívico / San Martín
            [-41.1325, -71.3250], // Bustillo Km 1 (Monolito)
            [-41.1320, -71.3400], // Bustillo Km 4 (Teleférico Otto)
            [-41.1290, -71.3650], // Bustillo Km 6 (Rancho Grande)
            [-41.1275, -71.3920], // Bustillo Km 8 (Playa Bonita)
            [-41.1210, -71.4150], // Bustillo Km 10.5 (El Faldeo)
            [-41.1150, -71.4350], // Bustillo Km 13 (Bahía Serena)
            [-41.0990, -71.4650], // Bustillo Km 15.5 (Don Orione)
            [-41.0850, -71.4920], // Bustillo Km 18 (Cruce Circuito Chico)
            [-41.0700, -71.5100], // Bustillo Km 20 (Puerto Moreno / El Trébol)
            [-41.0538, -71.5332]  // Puerto Pañuelo / Llao Llao
        ],
        paradas: [
            { id: "p20_1", coord: [-41.1342, -71.2891], nombre: "Cabecera Terminal de Ómnibus", detalle: "12 de Octubre y Diagonal Capraro", esCabecera: true },
            { id: "p20_2", coord: [-41.1338, -71.2980], nombre: "Diagonal Capraro y Elordi", detalle: "Entrada al centro este" },
            { id: "p20_3", coord: [-41.1335, -71.3102], nombre: "Centro Cívico / Av. San Martín", detalle: "Centro comercial e institucional de Bariloche", esCabecera: true },
            { id: "p20_4", coord: [-41.1325, -71.3250], nombre: "Bustillo Km 1 - Monolito", detalle: "Inicio de Av. Bustillo y costanera" },
            { id: "p20_5", coord: [-41.1320, -71.3400], nombre: "Bustillo Km 4 - Teleférico Cerro Otto", detalle: "Playa Melipal y acceso a base del Teleférico" },
            { id: "p20_6", coord: [-41.1290, -71.3650], nombre: "Bustillo Km 6 - Barrio Rancho Grande", detalle: "Zona residencial y comercios" },
            { id: "p20_7", coord: [-41.1275, -71.3920], nombre: "Bustillo Km 8 - Playa Bonita", detalle: "Balneario tradicional e islote Huemul" },
            { id: "p20_8", coord: [-41.1210, -71.4150], nombre: "Bustillo Km 10.5 - El Faldeo / Coirón", detalle: "Acceso a barrios de montaña" },
            { id: "p20_9", coord: [-41.1150, -71.4350], nombre: "Bustillo Km 13 - Bahía Serena", detalle: "Playa de arena fina y deportes náuticos" },
            { id: "p20_10", coord: [-41.0990, -71.4650], nombre: "Bustillo Km 15.5 - Parroquia Don Orione", detalle: "Mirador del Lago Nahuel Huapi" },
            { id: "p20_11", coord: [-41.0850, -71.4920], nombre: "Bustillo Km 18 - Cruce Circuito Chico", detalle: "Empalme a Cerro Catedral y Lago Escondido" },
            { id: "p20_12", coord: [-41.0700, -71.5100], nombre: "Bustillo Km 20 - Puerto Moreno / Laguna Trébol", detalle: "Entrada a reserva urbana El Trébol" },
            { id: "p20_13", coord: [-41.0538, -71.5332], nombre: "Cabecera Llao Llao / Puerto Pañuelo", detalle: "Hotel Llao Llao y excursiones lacustres a Isla Victoria", esCabecera: true }
        ]
    },
    "50": {
        numero: "50",
        nombre: "Línea 50: Centro ⇄ Los Coihues (Por Av. Pioneros)",
        color: "#15803d",
        frecuencia: "Cada 30 min",
        descripcion: "Conecta el área céntrica bordeando la falda del Cerro Otto por Av. Los Pioneros hasta Villa Los Coihues y el Lago Gutiérrez.",
        puntos: [
            [-41.1340, -71.3080], // Moreno y Villegas
            [-41.1370, -71.3200], // Pioneros Km 1 (Cruce Belgrano)
            [-41.1410, -71.3400], // Pioneros Km 4 (Teleférico)
            [-41.1480, -71.3650], // Pioneros Km 6 (Escuela)
            [-41.1550, -71.3850], // Pioneros Km 8 (Virgen de las Nieves)
            [-41.1620, -71.3980], // Ruta 82 (Entrada Los Coihues)
            [-41.1680, -71.4120]  // Villa Los Coihues / Lago Gutiérrez
        ],
        paradas: [
            { id: "p50_1", coord: [-41.1340, -71.3080], nombre: "Parada Centro (Moreno y Villegas)", detalle: "Punto céntrico de transbordo", esCabecera: true },
            { id: "p50_2", coord: [-41.1370, -71.3200], nombre: "Pioneros Km 1 - Barrio Belgrano", detalle: "Falda norte del Cerro Otto" },
            { id: "p50_3", coord: [-41.1410, -71.3400], nombre: "Pioneros Km 4 - Acceso Teleférico", detalle: "Estación inferior Teleférico Cerro Otto" },
            { id: "p50_4", coord: [-41.1480, -71.3650], nombre: "Pioneros Km 6 - Barrio San Ceferino", detalle: "Escuelas y zona residencial" },
            { id: "p50_5", coord: [-41.1550, -71.3850], nombre: "Pioneros Km 8 - Virgen de las Nieves", detalle: "Santuario y empalme a Cerro Catedral" },
            { id: "p50_6", coord: [-41.1620, -71.3980], nombre: "Ruta 82 - Entrada a Los Coihues", detalle: "Cruce sobre río Gutiérrez" },
            { id: "p50_7", coord: [-41.1680, -71.4120], nombre: "Cabecera Villa Los Coihues / Lago Gutiérrez", detalle: "Acceso a playa pública y Cascada de los Duendes", esCabecera: true }
        ]
    },
    "72": {
        numero: "72",
        nombre: "Línea 72: Terminal ⇄ Aeropuerto Bariloche (BRC)",
        color: "#1d4ed8",
        frecuencia: "Coincide con vuelos principales",
        descripcion: "Servicio directo que une la Terminal de Ómnibus y el Centro Cívico con el Aeropuerto Internacional Teniente Luis Candelaria.",
        puntos: [
            [-41.1335, -71.3102], // Centro Cívico
            [-41.1342, -71.2891], // Terminal
            [-41.1380, -71.2450], // Ruta 40 / Las Marías
            [-41.1450, -71.2000], // Caminera Policial
            [-41.1512, -71.1578]  // Aeropuerto BRC
        ],
        paradas: [
            { id: "p72_1", coord: [-41.1335, -71.3102], nombre: "Parada Centro Cívico / San Martín", detalle: "Salida céntrica hacia el aeropuerto", esCabecera: true },
            { id: "p72_2", coord: [-41.1342, -71.2891], nombre: "Terminal de Ómnibus Bariloche", detalle: "Conexión con micros de larga distancia", esCabecera: true },
            { id: "p72_3", coord: [-41.1380, -71.2450], nombre: "Ruta 40 Este - Barrio Las Marías", detalle: "Sector comercial este" },
            { id: "p72_4", coord: [-41.1450, -71.2000], nombre: "Ruta 40 - Caminera Policial", detalle: "Control acceso este a la ciudad" },
            { id: "p72_5", coord: [-41.1512, -71.1578], nombre: "Cabecera Aeropuerto Internacional (BRC)", detalle: "Hall principal de arribos y salidas", esCabecera: true }
        ]
    },
    "10": {
        numero: "10",
        nombre: "Línea 10: Centro ⇄ Colonia Suiza / Península San Pedro",
        color: "#9333ea",
        frecuencia: "Cada 60 min",
        descripcion: "Recorre Av. Bustillo y se adentra en Península San Pedro hasta finalizar en la histórica aldea de Colonia Suiza.",
        puntos: [
            [-41.1335, -71.3102], // Centro
            [-41.1275, -71.3920], // Bustillo Km 8
            [-41.0850, -71.4920], // Bustillo Km 18
            [-41.0650, -71.4820], // Península San Pedro
            [-41.0960, -71.5120]  // Colonia Suiza
        ],
        paradas: [
            { id: "p10_1", coord: [-41.1335, -71.3102], nombre: "Centro Cívico / Moreno", detalle: "Cabecera céntrica", esCabecera: true },
            { id: "p10_2", coord: [-41.1275, -71.3920], nombre: "Bustillo Km 8 - Playa Bonita", detalle: "Parada intermedia" },
            { id: "p10_3", coord: [-41.0850, -71.4920], nombre: "Bustillo Km 18 - Empalme Península", detalle: "Ingreso a Península San Pedro" },
            { id: "p10_4", coord: [-41.0650, -71.4820], nombre: "Península San Pedro - Mirador", detalle: "Vista panorámica al Lago Moreno" },
            { id: "p10_5", coord: [-41.0960, -71.5120], nombre: "Cabecera Colonia Suiza", detalle: "Feria artesanal, gastronomía y curanto", esCabecera: true }
        ]
    },
    "55": {
        numero: "55",
        nombre: "Línea 55: Centro ⇄ Cerro Catedral (Por Av. Bustillo / Pintos)",
        color: "#0284c7",
        frecuencia: "Cada 30 min (Temporada Nieve/Verano)",
        descripcion: "Servicio especial que une el Centro Cívico con la base del centro de esquí más grande de Sudamérica (Cerro Catedral).",
        puntos: [
            [-41.1335, -71.3102], // Centro
            [-41.1320, -71.3400], // Bustillo Km 4
            [-41.1275, -71.3920], // Bustillo Km 8
            [-41.1550, -71.3850], // Virgen de las Nieves
            [-41.1710, -71.4390]  // Base Cerro Catedral
        ],
        paradas: [
            { id: "p55_1", coord: [-41.1335, -71.3102], nombre: "Centro Cívico / Moreno", detalle: "Cabecera salida hacia la montaña", esCabecera: true },
            { id: "p55_2", coord: [-41.1320, -71.3400], nombre: "Bustillo Km 4 - Teleférico Otto", detalle: "Acceso cerro Otto" },
            { id: "p55_3", coord: [-41.1275, -71.3920], nombre: "Bustillo Km 8 - Playa Bonita", detalle: "Parada intermedia" },
            { id: "p55_4", coord: [-41.1550, -71.3850], nombre: "Virgen de las Nieves - Ruta 82", detalle: "Acceso al valle de Catedral" },
            { id: "p55_5", coord: [-41.1710, -71.4390], nombre: "Cabecera Base Cerro Catedral", detalle: "Plaza Amancay y medios de elevación", esCabecera: true }
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
        const isCabecera = !!parada.esCabecera;

        // Leaflet Icono personalizado
        const busIcon = L.divIcon({
            className: 'bus-leaflet-marker-wrap',
            iconSize: null,
            html: `
                <div class="bus-marker-pin" style="border-color:${data.color}; color:${data.color}; ${isCabecera ? 'background:' + data.color + '; color:#fff; transform:scale(1.15);' : ''}">
                    <i class="fas ${isCabecera ? 'fa-bus' : 'fa-location-dot'}"></i>
                </div>
            `
        });

        const popupContent = `
            <div style="font-family:sans-serif; min-width:190px; padding:4px;">
                <span style="background:${data.color}; color:white; font-size:0.7rem; font-weight:800; padding:2px 8px; border-radius:10px; display:inline-block; margin-bottom:4px;">
                    ${isCabecera ? '🚏 Cabecera Principal' : 'Parada #' + (index + 1)} • Línea ${data.numero}
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
            <div class="stop-item-card ${isCabecera ? 'cabecera-card' : ''}" onclick="focusStopOnMap('${parada.id}', ${parada.coord[0]}, ${parada.coord[1]})" style="${isCabecera ? 'border-left:4px solid ' + data.color + ';' : ''}">
                <div class="stop-number-badge" style="background:${data.color};">
                    ${isCabecera ? '<i class="fas fa-bus" style="font-size:0.75rem;"></i>' : (index + 1)}
                </div>
                <div style="flex:1;">
                    <div style="font-size:0.88rem; font-weight:800; color:var(--text-primary); line-height:1.2;">
                        ${parada.nombre} ${isCabecera ? '<span style="font-size:0.68rem; background:rgba(0,132,255,0.15); color:var(--primary); padding:2px 6px; border-radius:6px; margin-left:4px;">Cabecera</span>' : ''}
                    </div>
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
