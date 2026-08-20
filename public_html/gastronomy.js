// RESTAURANTES FICTICIOS
const GASTRONOMY = [
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
        features: ["Vista increíbe", "Cerveza Artesanal", "Estacionamiento", "Opciones Veganas"],
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
    },
    {
        id: 4,
        name: "Jauja Bariloche",
        type: "Restaurante y Pizzería",
        location: "Moreno y Quaglia",
        price_level: "$$",
        rating: 4.6,
        lat: -41.135,
        lng: -71.308,
        image: "https://images.unsplash.com/photo-1590947132387-155cc02f3212?auto=format&fit=crop&q=80&w=800",
        description: "Un clásico con opciones para todos los gustos. Desde pizzas a la piedra, pastas caseras, trucha y platos veganos. Ambiente familiar de estilo montaña.",
        specialty: "Pizza, Trucha patagónica, Pastas",
        promo: "Menú Turístico: Principal + Bebida + Postre $15.000",
        features: ["Menú infantil", "Pastas Caseras", "Opciones sin TACC"],
        phone: "5492944456789"
    },
    {
        id: 5,
        name: "Fonda de Cruz",
        type: "Gourmet Patagónico",
        location: "Av. Bustillo Km 4.5",
        price_level: "$$$$",
        rating: 4.7,
        lat: -41.120,
        lng: -71.365,
        image: "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&q=80&w=800",
        description: "Alta gastronomía a orillas del lago. Platos elaborados con ingredientes de pequeños productores locales, ciervo, cordero y hongos de pino.",
        specialty: "Cazuela de Cordero, Mariscos, Risottos",
        promo: "Cena Romántica: Reservá y te regalamos 2 copas de vino.",
        features: ["Alta Cocina", "Vista al lago", "Terraza climatizada", "Carta de Vinos"],
        phone: "5492944567890"
    }
];

let mapGasto = null;
let markersGasto = [];

// Inicializar mapa
function initMapGasto() {
    // Centro de Bariloche
    mapGasto = L.map('map').setView([-41.1335, -71.3103], 12);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 18
    }).addTo(mapGasto);

    GASTRONOMY.forEach(rest => {
        let emoji = '🍽️';
        if(rest.type.includes('Cervecería')) emoji = '🍺';
        if(rest.type.includes('Parrilla')) emoji = '🥩';
        if(rest.type.includes('Chocolatería')) emoji = '🍫';

        const priceIcon = L.divIcon({
            className: 'custom-price-marker',
            html: `<div class="price-marker-content" style="background:var(--primary); color:white; border-color:white; padding: 4px 8px; font-weight:bold;">${emoji} ${rest.price_level}</div>`,
            iconSize: [60, 32],
            iconAnchor: [30, 16]
        });

        const marker = L.marker([rest.lat, rest.lng], { icon: priceIcon })
            .bindPopup(`
                <div style="text-align:center; min-width:140px;">
                    <b style="font-size:0.95rem;">${rest.name}</b><br>
                    <small style="color:#666;">${rest.type}</small><br>
                    <b style="color:#e67e22; font-size:1rem;">${rest.promo}</b>
                </div>
            `)
            .addTo(mapGasto);

        marker.on('click', () => showGastronomyDetails(rest.id));
        markersGasto.push(marker);
    });
}

function renderGastronomy() {
    const list = document.getElementById('gastronomyList');
    const count = document.getElementById('gastronomy-count');

    if (!list) return;

    count.textContent = `${GASTRONOMY.length} opciones recomendadas`;

    list.innerHTML = GASTRONOMY.map(rest => `
        <div class="accommodation-card-airbnb" onclick="showGastronomyDetails(${rest.id})">
            <div class="accommodation-img-wrapper">
                <img src="${rest.image}" alt="${rest.name}">
                <div class="accommodation-price-badge" style="background:#e67e22; border-radius: 10px;">${rest.price_level}</div>
            </div>
            <div class="accommodation-info-airbnb">
                <div class="accommodation-header-row">
                    <h3 class="accommodation-name" style="font-size: 1.05rem;">${rest.name}</h3>
                    <span class="accommodation-rating-star"><i class="fas fa-star"></i> ${rest.rating}</span>
                </div>
                <p class="accommodation-location-text" style="color: var(--primary); font-weight:600; font-size: 0.8rem; margin-top:2px; margin-bottom:5px;">${rest.type}</p>
                <p class="accommodation-location-text"><i class="fas fa-map-marker-alt"></i> ${rest.location}</p>
            </div>
        </div>
    `).join('');
}

function showGastronomyDetails(id) {
    const rest = GASTRONOMY.find(a => a.id === id);
    if (!rest) return;

    const modal = document.getElementById('gastronomyModal');
    const content = document.getElementById('modalContent');
    
    const whatsappMsg = encodeURIComponent(`Hola ${rest.name}! Quería hacer una consulta y vi que tienen una promo en Bariloche.Online.`);
    const whatsappLink = `https://wa.me/${rest.phone}?text=${whatsappMsg}`;

    content.innerHTML = `
        <div class="modal-accommodation-header">
            <img src="${rest.image}" alt="${rest.name}">
        </div>
        <div class="modal-accommodation-body">
            <div class="modal-accommodation-title">
                <h2>${rest.name}</h2>
                <span class="accommodation-rating-large"><i class="fas fa-star"></i> ${rest.rating}</span>
            </div>
            <p class="modal-location"><i class="fas fa-utensils"></i> ${rest.type} &bull; ${rest.location}</p>
            
            <div class="modal-section" style="background:#fff3e0; padding:15px; border-radius:12px; margin-top:10px; border: 1px solid #ffe0b2;">
                <h3 style="color:#e65100; margin-bottom:5px; font-size:1rem;"><i class="fas fa-star" style="color:#ffa000;"></i> Beneficio o Promoción</h3>
                <p style="margin:0; font-weight:600; color:#ef6c00;">${rest.promo}</p>
            </div>

            <div class="modal-section">
                <h3>Reseña</h3>
                <p>${rest.description}</p>
            </div>
            
            <div class="modal-section">
                <h3>Especialidad de la Casa</h3>
                <p style="font-weight:600; color:var(--text-secondary);">${rest.specialty}</p>
            </div>

            <div class="modal-section">
                <h3>Detalles</h3>
                <div class="amenities-grid">
                    ${rest.features.map(f => `<span class="amenity-tag"><i class="fas fa-check"></i> ${f}</span>`).join('')}
                </div>
            </div>
            
            <div class="modal-price-section">
                <div class="modal-price">
                    <span class="price-label">Rango de Precios</span>
                    <span class="price-amount" style="color:#e67e22;">${rest.price_level}</span>
                </div>
                <a href="${whatsappLink}" target="_blank" class="btn-whatsapp" style="background:#e67e22;">
                    <i class="fab fa-whatsapp"></i> Reservar / Consultar
                </a>
            </div>
        </div>
    `;

    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
}

function closeGastronomyModal() {
    const modal = document.getElementById('gastronomyModal');
    modal.style.display = 'none';
    document.body.style.overflow = 'auto';
}

if (document.getElementById('gastronomyList')) {
    document.addEventListener('DOMContentLoaded', () => {
        renderGastronomy();
        initMapGasto();
    });
}
