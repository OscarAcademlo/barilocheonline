/**
 * ==============================================================================
 * BARILOCHE.ONLINE - DÓNDE COMER (GASTRONOMÍA DINÁMICA)
 * ==============================================================================
 */

let GASTRONOMY = [];
let mapGasto = null;
let markersGasto = [];

async function fetchGastronomy() {
    try {
        const res = await fetch('save_alojamiento.php?action=get_gastronomia&t=' + Date.now());
        if (res.ok) {
            const data = await res.json();
            GASTRONOMY = (data || []).filter(g => g.is_active !== false);
        }
    } catch (e) {
        console.warn('Cargando gastronomía local:', e);
    }

    if (!GASTRONOMY || GASTRONOMY.length === 0) {
        GASTRONOMY = [
            {
                id: "gasto_1",
                name: "Cervecería Patagonia",
                type: "Cervecería Artesanal",
                location: "Circuito Chico Km 24.7",
                rating: 4.8,
                lat: -41.0777,
                lng: -71.5422,
                images: ["img/gastronomia/patagonia.jpg"],
                description: "El refugio icónico de Cerveza Patagonia. Imperdible vista al lago Nahuel Huapi, cervezas tiradas exclusivas y un menú que combina carnes ahumadas y pizzas.",
                specialty: "Cerveza Patagonia, Carnes Ahumadas, Entradas",
                promo: "Happy Hour 17hs a 19hs - 2x1 en Pintas",
                features: ["Vista increíble", "Cerveza Artesanal", "Estacionamiento", "Opciones Veganas", "Pet friendly"],
                phone: "5492944123456"
            },
            {
                id: "gasto_2",
                name: "El Boliche de Alberto",
                type: "Parrilla Argentina",
                location: "Villegas 347, Centro",
                rating: 4.9,
                lat: -41.1345,
                lng: -71.3092,
                images: ["img/gastronomia/alberto.jpg"],
                description: "La parrilla más clásica de Bariloche. Cortes de carne de primera calidad, porciones súper abundantes y las mejores papas fritas provenzal.",
                specialty: "Ojo de bife, Bife de Chorizo, Papas fritas",
                promo: "Sugerencia: ¡Pedí el Bife de Chorizo mariposa para compartir!",
                features: ["Parrilla a la vista", "Muy Abundante", "Ubicación céntrica", "Vinos Premium"],
                phone: "5492944234567"
            },
            {
                id: "gasto_3",
                name: "Chocolatería Rapa Nui",
                type: "Chocolatería y Heladería",
                location: "Mitre 202, Centro",
                rating: 4.9,
                lat: -41.1338,
                lng: -71.3115,
                images: ["img/gastronomia/rapanui.jpg"],
                description: "El paraíso dulce. Degustá chocolates artesanales, sus famosos 'Franui' y helados únicos en el local tradicional con pista de hielo.",
                specialty: "Chocolates Artesanales, Franui, Pista de Hielo",
                promo: "Promoción: Llevá 1kg de chocolate y elegí un Franui de regalo",
                features: ["Heladería", "Pista de Hielo", "Cafetería", "Ideal Familias", "Pet friendly"],
                phone: "5492944345678"
            },
            {
                id: "gasto_4",
                name: "Jauja Bariloche",
                type: "Restaurante y Heladería",
                location: "Moreno y Quaglia, Centro",
                rating: 4.6,
                lat: -41.1355,
                lng: -71.3075,
                images: ["img/gastronomia/jauja.jpg"],
                description: "Un clásico con opciones para todos los gustos: pizzas a la piedra, pastas caseras, trucha patagónica y los helados más originales.",
                specialty: "Trucha patagónica, Pastas caseras, Helados",
                promo: "Menú Turístico: Principal + Bebida + Helado artesanal",
                features: ["Menú infantil", "Pastas Caseras", "Opciones sin TACC", "Vegetariano"],
                phone: "5492944456789"
            },
            {
                id: "gasto_5",
                name: "Fonda del Tío",
                type: "Bodegón Tradicional",
                location: "Mitre 1130, Bariloche",
                rating: 4.8,
                lat: -41.1310,
                lng: -71.2980,
                images: ["img/gastronomia/fonda.jpg"],
                description: "El bodegón más famoso de Bariloche por sus milanesas gigantes a la napolitana. Platos tradicionales, caseros y súper abundantes.",
                specialty: "Milanesa Napolitana Gigante, Pastas, Papas",
                promo: "¡La milanesa para 3 personas rinde para 4!",
                features: ["Bodegón clásico", "Porciones Gigantes", "Familiar", "Precios Populares"],
                phone: "5492944567890"
            }
        ];
    }

    renderGastronomy();
    initMapGasto();
}

// Inicializar mapa con marcadores no superpuestos y zoom dinámico
function initMapGasto() {
    const mapEl = document.getElementById('map');
    if (!mapEl) return;

    if (!mapGasto) {
        mapGasto = L.map('map', { zoomControl: false }).setView([-41.1335, -71.3103], 13);
        L.control.zoom({ position: 'bottomright' }).addTo(mapGasto);
        L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
            attribution: '© OpenStreetMap © CARTO',
            maxZoom: 18
        }).addTo(mapGasto);
    }

    markersGasto.forEach(m => mapGasto.removeLayer(m));
    markersGasto = [];

    const bounds = [];
    const validLocales = GASTRONOMY.filter(r => r.lat && r.lng).map(r => ({
        ...r,
        latNum: parseFloat(r.lat),
        lngNum: parseFloat(r.lng)
    }));

    // Distribuir carteles en abanico amplio alrededor del centro para que NUNCA se encimen
    const downtownOffsets = [
        { latOffset: 0.0140, lngOffset: -0.028 }, // 1. Arriba Izquierda (sobre el lago Nahuel Huapi)
        { latOffset: 0.0200, lngOffset: 0.002 },  // 2. Arriba Centro (bien arriba en el agua)
        { latOffset: 0.0140, lngOffset: 0.030 },  // 3. Arriba Derecha (costa este)
        { latOffset: -0.0140, lngOffset: -0.026 },// 4. Abajo Izquierda (sudoeste)
        { latOffset: -0.0160, lngOffset: 0.028 }, // 5. Abajo Derecha (sudeste)
        { latOffset: 0.0020, lngOffset: -0.034 }, // 6. Centro Izquierda (oeste)
        { latOffset: 0.0020, lngOffset: 0.035 }   // 7. Centro Derecha (este)
    ];

    let dtIndex = 0;

    validLocales.forEach((rest) => {
        let emoji = '🍽️';
        if ((rest.type || '').includes('Cervecería')) emoji = '🍺';
        if ((rest.type || '').includes('Parrilla') || (rest.type || '').includes('Bodegón')) emoji = '🥩';
        if ((rest.type || '').includes('Chocolatería') || (rest.type || '').includes('Helad')) emoji = '🍫';
        if ((rest.type || '').includes('Pizza') || (rest.type || '').includes('Pastas')) emoji = '🍕';

        let cardLat = rest.latNum;
        let cardLng = rest.lngNum;

        // Si es zona céntrica (cercana a -41.134, -71.309), asignar posición en abanico despejado
        const isDowntown = Math.abs(rest.latNum - (-41.1345)) < 0.04 && Math.abs(rest.lngNum - (-71.3092)) < 0.04;
        if (isDowntown) {
            const offset = downtownOffsets[dtIndex % downtownOffsets.length];
            cardLat = rest.latNum + offset.latOffset;
            cardLng = rest.lngNum + offset.lngOffset;
            dtIndex++;
        } else {
            // Fuera del centro (ej. Cervecería Patagonia Km 24)
            cardLat = rest.latNum + 0.005;
        }

        // 1. Puntito naranja en la ubicación GPS real del local
        const dotIcon = L.divIcon({
            className: 'gasto-mockup-card-wrap',
            html: `<div id="dot_gasto_${rest.id}" style="width:12px; height:12px; background:#e67e22; border:2px solid #ffffff; border-radius:50%; box-shadow:0 0 8px rgba(230,126,34,0.8), 0 2px 6px rgba(0,0,0,0.6); transform:translate(-50%, -50%);"></div>`,
            iconSize: [0, 0],
            iconAnchor: [0, 0]
        });
        const dotMarker = L.marker([rest.latNum, rest.lngNum], { icon: dotIcon }).addTo(mapGasto);
        markersGasto.push(dotMarker);

        // 2. Línea fina estética uniendo el punto GPS con el cartel flotante
        const line = L.polyline([[rest.latNum, rest.lngNum], [cardLat, cardLng]], {
            color: '#475569',
            weight: 1.8,
            opacity: 0.9,
            dashArray: '3, 3'
        }).addTo(mapGasto);
        line.gastoId = rest.id;
        markersGasto.push(line);

        // 3. Cartel flotante (Mockup Card estilo Imagen 1) con estilos inline 100% garantizados
        const cardIcon = L.divIcon({
            className: 'gasto-mockup-card-wrap',
            html: `
                <div class="gasto-mockup-card" id="pin_gasto_${rest.id}" onclick="showGastronomyDetails('${rest.id}')" style="background:rgba(15,23,42,0.96); backdrop-filter:blur(10px); -webkit-backdrop-filter:blur(10px); border:1.5px solid #334155; border-radius:16px; padding:8px 14px; box-shadow:0 12px 28px rgba(0,0,0,0.7), 0 0 15px rgba(230,126,34,0.25); display:flex; align-items:center; gap:10px; color:#ffffff; cursor:pointer; user-select:none; white-space:nowrap; width:max-content; min-width:190px; font-family:'Outfit', sans-serif;">
                    <div style="width:38px; height:38px; background:rgba(230,126,34,0.18); border:1px solid rgba(230,126,34,0.35); border-radius:12px; display:flex; align-items:center; justify-content:center; font-size:1.3rem; flex-shrink:0;">${emoji}</div>
                    <div style="display:flex; flex-direction:column; overflow:hidden;">
                        <div style="font-weight:800; font-size:0.82rem; color:#ffffff; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:140px;">${rest.name}</div>
                        <div style="font-size:0.72rem; color:#94a3b8; font-weight:600; margin-top:1px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:140px;">- ${rest.type || 'Gastronomía'}</div>
                        <div style="color:#f59e0b; font-size:0.7rem; margin-top:2px; letter-spacing:1px;">★★★★★</div>
                    </div>
                </div>
            `,
            iconSize: null,
            iconAnchor: [95, 25]
        });

        const cardMarker = L.marker([cardLat, cardLng], { icon: cardIcon })
            .on('click', () => showGastronomyDetails(rest.id))
            .addTo(mapGasto);

        cardMarker.gastoId = rest.id;
        cardMarker.lineRef = line;
        markersGasto.push(cardMarker);

        bounds.push([rest.latNum, rest.lngNum]);
        bounds.push([cardLat, cardLng]);
    });

    if (bounds.length > 0) {
        mapGasto.fitBounds(bounds, { padding: [50, 50], maxZoom: 14 });
    }
}

function highlightMapMarker(id) {
    const el = document.getElementById('pin_gasto_' + id);
    if (el) {
        el.classList.add('highlighted');
    }
    markersGasto.forEach(m => {
        if (m.gastoId && String(m.gastoId) === String(id)) {
            if (m.setStyle) {
                m.setStyle({ color: '#e67e22', weight: 2.5, opacity: 1, dashArray: null });
            }
            if (m.setZIndexOffset) {
                m.setZIndexOffset(999999);
            }
        }
    });
}

function unhighlightMapMarker(id) {
    const el = document.getElementById('pin_gasto_' + id);
    if (el) {
        el.classList.remove('highlighted');
    }
    markersGasto.forEach(m => {
        if (m.gastoId && String(m.gastoId) === String(id)) {
            if (m.setStyle) {
                m.setStyle({ color: '#64748b', weight: 1.5, opacity: 0.85, dashArray: '3, 3' });
            }
            if (m.setZIndexOffset) {
                m.setZIndexOffset(0);
            }
        }
    });
}

function renderGastronomy() {
    renderFilteredGastronomy(GASTRONOMY);
}

function filterGastronomyByType(type, chipEl) {
    document.querySelectorAll('.gasto-filter-chip').forEach(c => {
        c.style.background = 'var(--bg-secondary)';
        c.style.color = 'var(--text-primary)';
        c.classList.remove('active');
    });
    if (chipEl) {
        chipEl.style.background = 'var(--primary)';
        chipEl.style.color = 'white';
        chipEl.classList.add('active');
    }

    let filtered = GASTRONOMY;
    if (type !== 'all') {
        filtered = GASTRONOMY.filter(g => (g.type || '').toLowerCase().includes(type.toLowerCase()));
    }

    renderFilteredGastronomy(filtered);
}

function renderFilteredGastronomy(listToRender) {
    const list = document.getElementById('gastronomyList');
    const count = document.getElementById('gastronomy-count');
    if (!list) return;

    if (count) count.textContent = `${listToRender.length} opciones gastronómicas en Bariloche`;

    if (listToRender.length === 0) {
        list.innerHTML = `<div style="padding:40px 20px; text-align:center; color:var(--text-secondary);">No se encontraron locales en esta categoría.</div>`;
        return;
    }

    list.innerHTML = listToRender.map(rest => {
        const coverImg = (rest.images && rest.images.length > 0 && rest.images[0]) ? rest.images[0] : (rest.image || 'img/gastronomia/patagonia.jpg');

        return `
            <div class="accommodation-card-airbnb" onclick="showGastronomyDetails('${rest.id}')" onmouseenter="highlightMapMarker('${rest.id}')" style="margin-bottom:14px; border-radius:16px; overflow:hidden;">
                <div class="accommodation-img-wrapper" style="height:165px; min-height:165px; background:#0f172a; position:relative;">
                    <img src="${coverImg}" alt="${rest.name}" loading="lazy" referrerpolicy="no-referrer" onerror="this.onerror=null; this.src='img/gastronomia/patagonia.jpg';" style="width:100%; height:100%; object-fit:cover; display:block;">
                    <div class="accommodation-price-badge" style="background:#e67e22; border-radius:8px; font-size:0.75rem; font-weight:800; padding:4px 10px; bottom:10px; right:10px;">${rest.type || 'Gastronomía'}</div>
                </div>
                <div class="accommodation-info-airbnb" style="padding:12px 14px;">
                    <div class="accommodation-header-row" style="display:flex; justify-content:space-between; align-items:flex-start; gap:8px; margin-bottom:4px;">
                        <h3 class="accommodation-name" style="font-size:1.02rem; font-weight:800; line-height:1.3; color:var(--text-primary); margin:0; word-break:break-word; overflow:visible; text-overflow:clip; white-space:normal;">${rest.name}</h3>
                        <span class="accommodation-rating-star" style="font-size:0.82rem; font-weight:700; background:rgba(245,158,11,0.12); color:#d97706; padding:3px 7px; border-radius:6px; flex-shrink:0; display:inline-flex; align-items:center; gap:4px;">
                            <i class="fas fa-star" style="color:#f59e0b;"></i> ${rest.rating || 4.8}
                        </span>
                    </div>
                    ${rest.specialty ? `<p style="color:#e67e22; font-weight:700; font-size:0.82rem; margin:2px 0 4px 0; line-height:1.2; white-space:normal;">${rest.specialty}</p>` : ''}
                    <p class="accommodation-location-text" style="font-size:0.82rem; color:var(--text-secondary); margin:0; display:flex; align-items:center; gap:5px;"><i class="fas fa-map-marker-alt" style="color:var(--text-secondary);"></i> ${rest.location}</p>
                </div>
            </div>
        `;
    }).join('');
}

function highlightMapMarker(id) {
    const marker = markersGasto.find(m => String(m.gastoId) === String(id));
    if (marker) {
        marker.setZIndexOffset(1000);
    }
}

function showGastronomyDetails(id) {
    if (mapGasto) {
        mapGasto.closePopup();
    }
    const rest = GASTRONOMY.find(a => String(a.id) === String(id));
    if (!rest) return;

    const modal = document.getElementById('gastronomyModal');
    const content = document.getElementById('modalContent');
    if (!modal || !content) return;
    
    const cleanPhone = (rest.phone || '5492944123456').replace(/\D/g, '');
    const whatsappMsg = encodeURIComponent(`Hola ${rest.name}! Vi su local en Bariloche.Online y quería hacer una reserva / consulta.`);
    const whatsappLink = `https://wa.me/${cleanPhone}?text=${whatsappMsg}`;

    const imgs = (rest.images && rest.images.length > 0) ? rest.images : [
        rest.image || 'img/gastronomia/patagonia.jpg',
        'img/gastronomia/alberto.jpg',
        'img/gastronomia/fonda.jpg'
    ];

    const features = rest.features || ['Excelente atención', 'Opciones ricas', 'Ambiente cálido', 'Pet friendly'];

    content.innerHTML = `
        <div class="modal-accommodation-header">
            <div class="modal-gallery-carousel" id="modalGalleryGasto">
                <img id="mainGalleryGastoImg" src="${imgs[0]}" alt="${rest.name}" onerror="this.onerror=null; this.src='img/gastronomia/patagonia.jpg';">
            </div>
            ${imgs.length > 1 ? `
                <div class="gallery-thumbs-row">
                    ${imgs.map((img, i) => `
                        <img src="${img}" class="thumb-mini ${i === 0 ? 'active' : ''}" onclick="changeGalleryGastoImage('${img}', this)" onerror="this.onerror=null; this.src='img/gastronomia/patagonia.jpg';">
                    `).join('')}
                </div>
            ` : ''}
        </div>
        <div class="modal-accommodation-body">
            <div class="modal-accommodation-title">
                <div>
                    <span class="type-pill-header" style="background:rgba(230, 126, 34, 0.15); color:#e67e22;">${rest.type || 'Gastronomía'}</span>
                    <h2>${rest.name}</h2>
                </div>
                <span class="accommodation-rating-large"><i class="fas fa-star" style="color:#f59e0b;"></i> ${rest.rating || 4.8}</span>
            </div>
            <p class="modal-location"><i class="fas fa-map-marker-alt" style="color:#e67e22;"></i> ${rest.location}, San Carlos de Bariloche</p>
            
            <!-- GOOGLE MAPS STYLE HORARIOS Y DÍAS DE ATENCIÓN -->
            <div class="google-maps-hours-box" style="background:rgba(15, 23, 42, 0.75); backdrop-filter:blur(8px); border:1px solid rgba(255,255,255,0.12); padding:16px 20px; border-radius:18px; margin:14px 0; display:flex; flex-direction:column; gap:10px; box-shadow:0 8px 24px rgba(0,0,0,0.3);">
                <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:8px;">
                    <div style="display:flex; align-items:center; gap:10px;">
                        <span style="background:rgba(34, 197, 94, 0.18); color:#22c55e; font-weight:800; font-size:0.82rem; padding:5px 14px; border-radius:20px; border:1px solid rgba(34, 197, 94, 0.4); display:inline-flex; align-items:center; gap:7px;">
                            <span style="width:9px; height:9px; background:#22c55e; border-radius:50%; display:inline-block; box-shadow:0 0 10px #22c55e;"></span>
                            Abierto ahora
                        </span>
                        <span style="font-weight:700; color:var(--text-primary); font-size:0.95rem;">
                            <i class="far fa-clock" style="color:#e67e22; margin-right:5px;"></i> ${rest.open_hours || '12:00 a 00:00 hs'}
                        </span>
                    </div>
                    <span style="font-size:0.82rem; color:#94a3b8; font-weight:600;"><i class="fas fa-check-circle" style="color:#22c55e;"></i> Horarios confirmados</span>
                </div>
                <div style="font-size:0.9rem; color:var(--text-secondary); display:flex; align-items:center; gap:8px; margin-top:2px;">
                    <i class="far fa-calendar-alt" style="color:#e67e22;"></i>
                    <span><strong>Días de atención:</strong> ${rest.open_days || 'Lunes a Domingos'}</span>
                </div>
            </div>
            
            ${rest.promo ? `
                <div class="modal-section" style="background:rgba(230, 126, 34, 0.1); padding:16px; border-radius:14px; margin-top:10px; border: 1px solid rgba(230, 126, 34, 0.25);">
                    <h3 style="color:#e67e22; margin-bottom:5px; font-size:0.95rem;"><i class="fas fa-gift" style="color:#e67e22;"></i> Beneficio / Promoción</h3>
                    <p style="margin:0; font-weight:700; color:#d35400;">${rest.promo}</p>
                </div>
            ` : ''}

            <div class="modal-section">
                <h3>Descripción</h3>
                <p>${rest.description || 'Disfrutá de la mejor gastronomía de montaña en Bariloche con productos frescos de la Patagonia.'}</p>
            </div>
            
            ${rest.specialty ? `
                <div class="modal-section">
                    <h3>Especialidad de la Casa</h3>
                    <p style="font-weight:700; color:var(--text-primary); font-size:1rem;">${rest.specialty}</p>
                </div>
            ` : ''}

            <div class="modal-section">
                <h3>Comodidades y Servicios</h3>
                <div class="amenities-grid">
                    ${features.map(f => `<span class="amenity-tag"><i class="fas fa-check"></i> ${f}</span>`).join('')}
                </div>
            </div>
            
            <div class="modal-price-section">
                <div class="modal-price">
                    <span class="price-label">Especialidad Recomendada</span>
                    <span class="price-amount" style="color:#e67e22; font-size:1.2rem; font-weight:800;">${rest.specialty ? rest.specialty.split(',')[0] : rest.name}</span>
                </div>
                <a href="${whatsappLink}" target="_blank" class="btn-whatsapp-direct" style="background:#25D366; text-decoration:none;">
                    <i class="fab fa-whatsapp"></i> Reservar Mesa / Contactar por WhatsApp
                </a>
            </div>
        </div>
    `;

    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
}

function changeGalleryGastoImage(src, thumbEl) {
    const mainImg = document.getElementById('mainGalleryGastoImg');
    if (mainImg) mainImg.src = src;
    document.querySelectorAll('#modalContent .thumb-mini').forEach(t => t.classList.remove('active'));
    if (thumbEl) thumbEl.classList.add('active');
}

function closeGastronomyModal() {
    const modal = document.getElementById('gastronomyModal');
    if (modal) modal.style.display = 'none';
    document.body.style.overflow = 'auto';
}

function handlePublishGastoClick() {
    const user = (window.authManager && window.authManager.currentUser) || null;
    if (!user) {
        if (window.authManager && window.authManager.openAuthModal) {
            window.authManager.openAuthModal('Para publicar tu local gastronómico, por favor inicia sesión o crea tu cuenta gratuita.');
        } else {
            alert('Para publicar tu local gastronómico, por favor inicia sesión o crea tu cuenta gratuita.');
        }
        return;
    }
    const msg = encodeURIComponent(`¡Hola! Soy el usuario ${user.email} y quisiera publicar mi local gastronómico en Bariloche.Online.`);
    window.open(`https://wa.me/542944674774?text=${msg}`, '_blank');
}

if (document.getElementById('gastronomyList')) {
    document.addEventListener('DOMContentLoaded', () => {
        fetchGastronomy();
    });
}
