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
                id: 1,
                name: "Cervecería Patagonia",
                type: "Cervecería Artesanal",
                location: "Circuito Chico Km 24.7",
                price_level: "$$$",
                rating: 4.8,
                lat: -41.0777,
                lng: -71.5422,
                image: "https://images.unsplash.com/photo-1574096079513-a82f09919cf7?auto=format&fit=crop&q=80&w=800",
                description: "El refugio icónico de Cerveza Patagonia. Imperdible vista al lago Nahuel Huapi, cervezas tiradas exclusivas y un menú que combina carnes ahumadas y pizzas.",
                specialty: "Cerveza, Carnes Ahumadas, Entradas",
                promo: "Happy Hour 17hs a 19hs - 2x1 en Pintas",
                features: ["Vista increíble", "Cerveza Artesanal", "Estacionamiento", "Opciones Veganas"],
                phone: "5492944123456"
            },
            {
                id: 2,
                name: "El Boliche de Alberto",
                type: "Parrilla Argentina",
                location: "Villegas 347, Centro",
                price_level: "$$$",
                rating: 4.9,
                lat: -41.133,
                lng: -71.309,
                image: "https://images.unsplash.com/photo-1544025162-8e6ff05b38ed?auto=format&fit=crop&q=80&w=800",
                description: "La parrilla más clásica de Bariloche. Cortes de carne de primera calidad, porciones súper abundantes y las mejores papas fritas de la ciudad. Sin reservas, llegar temprano.",
                specialty: "Ojo de bife, Parrillada, Papas fritas",
                promo: "Sugerencia: ¡Pedí el Bife de Chorizo mariposa para compartir!",
                features: ["Parrilla a la vista", "Muy Abundante", "Ubicación céntrica", "Vinos Premium"],
                phone: "5492944234567"
            },
            {
                id: 3,
                name: "Chocolatería Rapa Nui",
                type: "Chocolatería y Heladería",
                location: "Mitre 202, Centro",
                price_level: "$$",
                rating: 4.9,
                lat: -41.134,
                lng: -71.311,
                image: "https://images.unsplash.com/photo-1621510456681-2330135e5871?auto=format&fit=crop&q=80&w=800",
                description: "El paraíso dulce. Degustá chocolates artesanales, sus famosos 'Franui' y helados únicos en el local tradicional. Ideal para pasar la tarde.",
                specialty: "Chocolates, Franui, Pista de Hielo",
                promo: "Promoción: Llevá 1kg de chocolate y elegí un Franui de regalo",
                features: ["Heladería", "Pista de Hielo", "Cafetería", "Ideal Familias"],
                phone: "5492944345678"
            }
        ];
    }

    renderGastronomy();
    initMapGasto();
}

// Inicializar mapa
function initMapGasto() {
    const mapEl = document.getElementById('map');
    if (!mapEl) return;

    if (!mapGasto) {
        mapGasto = L.map('map', { zoomControl: false }).setView([-41.1335, -71.3103], 12);
        L.control.zoom({ position: 'bottomright' }).addTo(mapGasto);
        L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
            attribution: '© OpenStreetMap © CARTO',
            maxZoom: 18
        }).addTo(mapGasto);
    }

    markersGasto.forEach(m => mapGasto.removeLayer(m));
    markersGasto = [];

    GASTRONOMY.forEach(rest => {
        if (!rest.lat || !rest.lng) return;

        let emoji = '🍽️';
        if ((rest.type || '').includes('Cervecería')) emoji = '🍺';
        if ((rest.type || '').includes('Parrilla')) emoji = '🥩';
        if ((rest.type || '').includes('Chocolatería')) emoji = '🍫';

        const priceIcon = L.divIcon({
            className: 'custom-price-marker',
            html: `<div class="price-marker-content" style="background:#e67e22; color:white; border-color:white; padding: 4px 8px; font-weight:bold;">${emoji} ${rest.price_level || '$$'}</div>`,
            iconSize: [60, 32],
            iconAnchor: [30, 16]
        });

        const marker = L.marker([rest.lat, rest.lng], { icon: priceIcon })
            .bindPopup(`
                <div class="map-popup-mini">
                    <img src="${rest.image || 'https://images.unsplash.com/photo-1574096079513-a82f09919cf7?auto=format&fit=crop&q=80&w=400'}" style="width:100%; height:90px; object-fit:cover; border-radius:8px; margin-bottom:6px;">
                    <b style="font-size:0.95rem; display:block;">${rest.name}</b>
                    <small style="color:#64748b;"><i class="fas fa-utensils"></i> ${rest.type || 'Gastronomía'}</small><br>
                    <b style="color:#e67e22; font-size:1rem;">${rest.price_level || '$$'}</b><br>
                    <button onclick="showGastronomyDetails('${rest.id}')" style="margin-top:6px; background:#e67e22; color:white; border:none; border-radius:6px; padding:6px 12px; font-weight:bold; cursor:pointer; width:100%;">Ver Detalles</button>
                </div>
            `, { maxWidth: 220 })
            .addTo(mapGasto);
        markersGasto.push(marker);
    });
}

function renderGastronomy() {
    const list = document.getElementById('gastronomyList');
    const count = document.getElementById('gastronomy-count');

    if (!list) return;
    if (count) count.textContent = `${GASTRONOMY.length} opciones gastronómicas en Bariloche`;

    list.innerHTML = GASTRONOMY.map(rest => `
        <div class="accommodation-card-airbnb" onclick="showGastronomyDetails('${rest.id}')">
            <div class="accommodation-img-wrapper">
                <img src="${rest.image || 'https://images.unsplash.com/photo-1574096079513-a82f09919cf7?auto=format&fit=crop&q=80&w=800'}" alt="${rest.name}">
                <div class="accommodation-price-badge" style="background:#e67e22; border-radius: 10px;">${rest.price_level || '$$'}</div>
            </div>
            <div class="accommodation-info-airbnb">
                <div class="accommodation-header-row">
                    <h3 class="accommodation-name" style="font-size: 1.05rem;">${rest.name}</h3>
                    <span class="accommodation-rating-star"><i class="fas fa-star"></i> ${rest.rating || 4.8}</span>
                </div>
                <p class="accommodation-location-text" style="color: var(--primary); font-weight:600; font-size: 0.8rem; margin-top:2px; margin-bottom:5px;">${rest.type || 'Gastronomía'}</p>
                <p class="accommodation-location-text"><i class="fas fa-map-marker-alt"></i> ${rest.location}</p>
            </div>
        </div>
    `).join('');
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
    const whatsappMsg = encodeURIComponent(`Hola ${rest.name}! Vi su local en Bariloche.Online y quería hacer una consulta / reserva.`);
    const whatsappLink = `https://wa.me/${cleanPhone}?text=${whatsappMsg}`;

    const features = rest.features || ['Excelente atención', 'Opciones ricas', 'Ambiente cálido'];

    content.innerHTML = `
        <div class="modal-accommodation-header">
            <img src="${rest.image || 'https://images.unsplash.com/photo-1574096079513-a82f09919cf7?auto=format&fit=crop&q=80&w=800'}" alt="${rest.name}" style="width:100%; height:260px; object-fit:cover; border-radius:18px 18px 0 0;">
        </div>
        <div class="modal-accommodation-body">
            <div class="modal-accommodation-title">
                <h2>${rest.name}</h2>
                <span class="accommodation-rating-large"><i class="fas fa-star"></i> ${rest.rating || 4.8}</span>
            </div>
            <p class="modal-location"><i class="fas fa-utensils"></i> ${rest.type || 'Gastronomía'} &bull; ${rest.location}</p>
            
            ${rest.promo ? `
                <div class="modal-section" style="background:rgba(230, 126, 34, 0.1); padding:15px; border-radius:14px; margin-top:10px; border: 1px solid rgba(230, 126, 34, 0.25);">
                    <h3 style="color:#e67e22; margin-bottom:5px; font-size:0.95rem;"><i class="fas fa-gift" style="color:#e67e22;"></i> Beneficio / Promoción</h3>
                    <p style="margin:0; font-weight:700; color:#d35400;">${rest.promo}</p>
                </div>
            ` : ''}

            <div class="modal-section">
                <h3>Descripción</h3>
                <p>${rest.description || 'Disfrutá de la mejor gastronomía de montaña en Bariloche.'}</p>
            </div>
            
            ${rest.specialty ? `
                <div class="modal-section">
                    <h3>Especialidad de la Casa</h3>
                    <p style="font-weight:700; color:var(--text-primary);">${rest.specialty}</p>
                </div>
            ` : ''}

            <div class="modal-section">
                <h3>Detalles y Servicios</h3>
                <div class="amenities-grid">
                    ${features.map(f => `<span class="amenity-tag"><i class="fas fa-check"></i> ${f}</span>`).join('')}
                </div>
            </div>
            
            <div class="modal-price-section">
                <div class="modal-price">
                    <span class="price-label">Rango de Precios</span>
                    <span class="price-amount" style="color:#e67e22;">${rest.price_level || '$$'}</span>
                </div>
                <a href="${whatsappLink}" target="_blank" class="btn-whatsapp-direct" style="background:#25D366;">
                    <i class="fab fa-whatsapp"></i> Reservar / Contactar por WhatsApp
                </a>
            </div>
        </div>
    `;

    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
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
