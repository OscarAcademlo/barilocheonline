// ALOJAMIENTOS FICTICIOS
const ACCOMMODATIONS = [
    {
        id: 1,
        name: "Cabaña Vista al Nahuel",
        location: "Villa Llao Llao",
        price: 125000,
        rating: 4.98,
        lat: -41.053,
        lng: -71.537,
        image: "https://images.unsplash.com/photo-1518780664697-55e3ad937233?auto=format&fit=crop&q=80&w=800",
        description: "Hermosa cabaña con vista panorámica al Lago Nahuel Huapi. 3 dormitorios, cocina equipada, parrilla y deck con vista al lago.",
        amenities: ["Wi-Fi", "Parrilla", "Deck", "Vista al lago", "Calefacción"],
        phone: "5492944123456"
    },
    {
        id: 2,
        name: "Loft Premium Centro",
        location: "Centro",
        price: 82000,
        rating: 4.78,
        lat: -41.134,
        lng: -71.310,
        image: "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&q=80&w=800",
        description: "Moderno loft en pleno centro de Bariloche. A pasos de restaurantes, tiendas y transporte público. Ideal para parejas.",
        amenities: ["Wi-Fi", "Smart TV", "Cocina", "Calefacción", "Ubicación central"],
        phone: "5492944234567"
    },
    {
        id: 3,
        name: "Casa Cerro Catedral",
        location: "Cerro Catedral",
        price: 150000,
        rating: 4.92,
        lat: -41.171,
        lng: -71.395,
        image: "https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&q=80&w=800",
        description: "A minutos del centro de ski Cerro Catedral. Casa completa con 4 dormitorios, chimenea y jacuzzi. Perfecta para familias.",
        amenities: ["Wi-Fi", "Jacuzzi", "Chimenea", "Parrilla", "4 dormitorios"],
        phone: "5492944345678"
    },
    {
        id: 4,
        name: "Depto Vista al Lago",
        location: "Av. Bustillo",
        price: 95000,
        rating: 4.85,
        lat: -41.082,
        lng: -71.447,
        image: "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?auto=format&fit=crop&q=80&w=800",
        description: "Departamento luminoso sobre Av. Bustillo con vista directa al lago. 2 dormitorios, balcón amplio y todas las comodidades.",
        amenities: ["Wi-Fi", "Balcón", "Vista al lago", "Cocina completa", "Estacionamiento"],
        phone: "5492944456789"
    },
    {
        id: 5,
        name: "Cabaña Bosque Arrayanes",
        location: "Circuito Chico",
        price: 110000,
        rating: 4.89,
        lat: -41.075,
        lng: -71.511,
        image: "https://images.unsplash.com/photo-1449158743715-0a90ebb6d2d8?auto=format&fit=crop&q=80&w=800",
        description: "Inmersa en el bosque del Circuito Chico. Tranquilidad absoluta, contacto con la naturaleza. 2 dormitorios y hogar a leña.",
        amenities: ["Hogar a leña", "Bosque", "Tranquilidad", "Parrilla", "Wi-Fi"],
        phone: "5492944567890"
    }
];

let map = null;
let markers = [];

// Inicializar mapa
function initMap() {
    // Centro de Bariloche
    map = L.map('map').setView([-41.1335, -71.3103], 12);

    // Usar OpenStreetMap (gratis)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 18
    }).addTo(map);

    // Agregar markers personalizados estilo Airbnb
    ACCOMMODATIONS.forEach(acc => {
        // Crear marker personalizado con precio
        const priceIcon = L.divIcon({
            className: 'custom-price-marker',
            html: `<div class="price-marker-content">$${Math.floor(acc.price / 1000)}k</div>`,
            iconSize: [60, 32],
            iconAnchor: [30, 16]
        });

        const marker = L.marker([acc.lat, acc.lng], { icon: priceIcon })
            .bindPopup(`
                <div style="text-align:center; min-width:140px;">
                    <b style="font-size:0.95rem;">${acc.name}</b><br>
                    <small style="color:#666;">${acc.location}</small><br>
                    <b style="color:#3b82f6; font-size:1rem;">$${acc.price.toLocaleString('es-AR')}/noche</b>
                </div>
            `)
            .addTo(map);

        marker.on('click', () => showAccommodationDetails(acc.id));
        markers.push(marker);
    });
}

// Renderizar lista de alojamientos - ESTILO AIRBNB
function renderAccommodations() {
    const list = document.getElementById('accommodationsList');
    const count = document.getElementById('accommodation-count');

    if (!list) return;

    count.textContent = `${ACCOMMODATIONS.length} alojamientos disponibles`;

    list.innerHTML = ACCOMMODATIONS.map(acc => `
        <div class="accommodation-card-airbnb" onclick="showAccommodationDetails(${acc.id})">
            <div class="accommodation-img-wrapper">
                <img src="${acc.image}" alt="${acc.name}" onerror="this.src='https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&q=80&w=800'">
                <div class="accommodation-price-badge">$${Math.floor(acc.price / 1000)}k/noche</div>
            </div>
            <div class="accommodation-info-airbnb">
                <div class="accommodation-header-row">
                    <h3 class="accommodation-name">${acc.name}</h3>
                    <span class="accommodation-rating-star"><i class="fas fa-star"></i> ${acc.rating}</span>
                </div>
                <p class="accommodation-location-text"><i class="fas fa-map-marker-alt"></i> ${acc.location}</p>
            </div>
        </div>
    `).join('');
}

// Mostrar detalles de alojamiento en modal
function showAccommodationDetails(id) {
    const acc = ACCOMMODATIONS.find(a => a.id === id);
    if (!acc) return;

    const modal = document.getElementById('accommodationModal');
    const content = document.getElementById('modalContent');

    const whatsappMsg = encodeURIComponent(`Hola! Me interesa ${acc.name} en ${acc.location}. ¿Está disponible?`);
    const whatsappLink = `https://wa.me/${acc.phone}?text=${whatsappMsg}`;

    content.innerHTML = `
        <div class="modal-accommodation-header">
            <img src="${acc.image}" alt="${acc.name}">
        </div>
        <div class="modal-accommodation-body">
            <div class="modal-accommodation-title">
                <h2>${acc.name}</h2>
                <span class="accommodation-rating-large"><i class="fas fa-star"></i> ${acc.rating}</span>
            </div>
            <p class="modal-location"><i class="fas fa-map-marker-alt"></i> ${acc.location}, Bariloche</p>
            
            <div class="modal-section">
                <h3>Descripción</h3>
                <p>${acc.description}</p>
            </div>
            
            <div class="modal-section">
                <h3>Comodidades</h3>
                <div class="amenities-grid">
                    ${acc.amenities.map(a => `<span class="amenity-tag"><i class="fas fa-check"></i> ${a}</span>`).join('')}
                </div>
            </div>
            
            <div class="modal-price-section">
                <div class="modal-price">
                    <span class="price-label">Precio por noche</span>
                    <span class="price-amount">$${acc.price.toLocaleString('es-AR')}</span>
                </div>
                <a href="${whatsappLink}" target="_blank" class="btn-whatsapp">
                    <i class="fab fa-whatsapp"></i> Consultar por WhatsApp
                </a>
            </div>
        </div>
    `;

    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
}

// Cerrar modal
function closeAccommodationModal() {
    const modal = document.getElementById('accommodationModal');
    modal.style.display = 'none';
    document.body.style.overflow = 'auto';
}

// Inicializar cuando cargue la página
if (document.querySelector('.page-accommodations')) {
    document.addEventListener('DOMContentLoaded', () => {
        renderAccommodations();
        initMap();
    });
}
