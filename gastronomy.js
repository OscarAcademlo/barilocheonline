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
            GASTRONOMY = await res.json();
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

    GASTRONOMY.forEach(rest => {
        if (!rest.lat || !rest.lng) return;

        let emoji = '🍽️';
        if ((rest.type || '').includes('Cervecería')) emoji = '🍺';
        if ((rest.type || '').includes('Parrilla') || (rest.type || '').includes('Bodegón')) emoji = '🥩';
        if ((rest.type || '').includes('Chocolatería') || (rest.type || '').includes('Helad')) emoji = '🍫';
        if ((rest.type || '').includes('Pizza') || (rest.type || '').includes('Pastas')) emoji = '🍕';

        // Pin con el Nombre del Local y Emoji
        const nameIcon = L.divIcon({
            className: 'gasto-map-marker-wrap',
            html: `<div class="gasto-map-badge" onclick="showGastronomyDetails('${rest.id}')" style="background:#e67e22; color:white; border:2px solid #ffffff; padding:4px 10px; font-weight:800; white-space:nowrap; font-size:0.8rem; border-radius:14px; box-shadow:0 3px 12px rgba(0,0,0,0.35); display:inline-flex; align-items:center; gap:5px; cursor:pointer; transform:translate(-50%, -50%);">${emoji} ${rest.name}</div>`,
            iconSize: [0, 0],
            iconAnchor: [0, 0]
        });

        const marker = L.marker([rest.lat, rest.lng], { icon: nameIcon })
            .on('click', () => {
                showGastronomyDetails(rest.id);
            })
            .addTo(mapGasto);

        marker.gastoId = rest.id;
        markersGasto.push(marker);
        bounds.push([rest.lat, rest.lng]);
    });

    if (bounds.length > 0) {
        mapGasto.fitBounds(bounds, { padding: [60, 60], maxZoom: 14 });
    }
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
            <div class="accommodation-card-airbnb" onclick="showGastronomyDetails('${rest.id}')" onmouseenter="highlightMapMarker('${rest.id}')" style="margin-bottom:20px;">
                <div class="accommodation-img-wrapper" style="height:210px; background:#0f172a;">
                    <img src="${coverImg}" alt="${rest.name}" loading="lazy" referrerpolicy="no-referrer" onerror="this.onerror=null; this.src='img/gastronomia/patagonia.jpg';" style="width:100%; height:100%; object-fit:cover; display:block;">
                    <div class="accommodation-price-badge" style="background:#e67e22; border-radius:10px; font-size:0.75rem; font-weight:800;">${rest.type || 'Gastronomía'}</div>
                </div>
                <div class="accommodation-info-airbnb">
                    <div class="accommodation-header-row">
                        <h3 class="accommodation-name" style="font-size:1.05rem;">${rest.name}</h3>
                        <span class="accommodation-rating-star"><i class="fas fa-star" style="color:#f59e0b;"></i> ${rest.rating || 4.8}</span>
                    </div>
                    <p class="accommodation-location-text" style="color:#e67e22; font-weight:700; font-size:0.84rem; margin-top:2px; margin-bottom:4px;">${rest.specialty || 'Especialidades de montaña'}</p>
                    <p class="accommodation-location-text"><i class="fas fa-map-marker-alt"></i> ${rest.location}</p>
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
            <p class="modal-location"><i class="fas fa-map-marker-alt"></i> ${rest.location}, San Carlos de Bariloche</p>
            
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

if (document.getElementById('gastronomyList')) {
    document.addEventListener('DOMContentLoaded', () => {
        fetchGastronomy();
    });
}
