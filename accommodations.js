/**
 * ==============================================================================
 * BARILOCHIE.ONLINE - DÓNDE DORMIR (SISTEMA DINÁMICO DE ALOJAMIENTO)
 * Almacenamiento JSON + Supabase Auth + Mercado Pago + Códigos Promo + WhatsApp
 * ==============================================================================
 */

const SB_URL = 'https://pwrlbwplpgzirlcrwepi.supabase.co';
const SB_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB3cmxid3BscGd6aXJsY3J3ZXBpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzMzc0NzAsImV4cCI6MjA4NjkxMzQ3MH0.HxEfbABTObu4khKxVhtBaBuCt2RDBm34urnSEJCfJUU';
const ADMIN_EMAIL = 'oscarns@gmail.com';

let sbClient = null;
let currentUser = null;
let currentSubscription = null;
let accommodations = [];
let map = null;
let markers = [];
let pickerMap = null;
let pickerMarker = null;

// Inicialización
document.addEventListener('DOMContentLoaded', () => {
    initSupabase();
    initMap();
    fetchAccommodations();
    checkUrlPaymentParams();
});

function initSupabase() {
    if (window.supabase) {
        sbClient = window.supabase.createClient(SB_URL, SB_ANON_KEY);
        sbClient.auth.onAuthStateChange(async (event, session) => {
            currentUser = session ? session.user : null;
            updateUserBar();
            if (currentUser) {
                await checkUserSubscription();
            } else {
                currentSubscription = null;
            }
        });
    }
}

// 1. CARGA DE ALOJAMIENTOS DESDE JSON
async function fetchAccommodations() {
    try {
        const res = await fetch('save_alojamiento.php?action=get_alojamientos&t=' + Date.now());
        if (res.ok) {
            accommodations = await res.json();
        } else {
            const fallback = await fetch('alojamientos.json?t=' + Date.now());
            accommodations = await fallback.json();
        }
    } catch (e) {
        console.warn('Cargando alojamientos locales:', e);
    }
    renderAccommodations(accommodations);
    renderMapMarkers(accommodations);
}

// 2. INICIALIZAR MAPA PRINCIPAL
function initMap() {
    const mapEl = document.getElementById('map');
    if (!mapEl) return;

    map = L.map('map', { zoomControl: false }).setView([-41.1335, -71.3103], 12);
    L.control.zoom({ position: 'bottomright' }).addTo(map);

    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        attribution: '© OpenStreetMap © CARTO',
        maxZoom: 18
    }).addTo(map);
}

function renderMapMarkers(list) {
    if (!map) return;
    markers.forEach(m => map.removeLayer(m));
    markers = [];

    list.forEach(acc => {
        if (!acc.lat || !acc.lng) return;

        const priceText = acc.price ? `$${Math.floor(acc.price / 1000)}k` : 'Consultar';
        const priceIcon = L.divIcon({
            className: 'custom-price-marker',
            html: `<div class="price-marker-content">${priceText}</div>`,
            iconSize: [65, 32],
            iconAnchor: [32, 16]
        });

        const marker = L.marker([acc.lat, acc.lng], { icon: priceIcon })
            .bindPopup(`
                <div class="map-popup-mini">
                    <img src="${(acc.images && acc.images[0]) || 'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=400'}" style="width:100%; height:90px; object-fit:cover; border-radius:8px; margin-bottom:6px;">
                    <b style="font-size:0.95rem; display:block;">${acc.name}</b>
                    <small style="color:#64748b;"><i class="fas fa-map-marker-alt"></i> ${acc.location}</small><br>
                    <b style="color:#0084ff; font-size:1rem;">$${Number(acc.price).toLocaleString('es-AR')}/noche</b><br>
                    <button onclick="showAccommodationDetails('${acc.id}')" style="margin-top:6px; background:#0084ff; color:white; border:none; border-radius:6px; padding:4px 10px; font-weight:bold; cursor:pointer; width:100%;">Ver Detalles</button>
                </div>
            `, { maxWidth: 220 })
            .addTo(map);

        marker.on('click', () => showAccommodationDetails(acc.id));
        markers.push(marker);
    });
}

// 3. RENDERIZAR LISTA AIRBNB
function renderAccommodations(list) {
    const container = document.getElementById('accommodationsList');
    const countEl = document.getElementById('accommodation-count');
    if (!container) return;

    if (countEl) countEl.textContent = `${list.length} alojamientos disponibles en Bariloche`;

    if (list.length === 0) {
        container.innerHTML = `
            <div style="text-align:center; padding:40px 20px; color:var(--text-secondary);">
                <i class="fas fa-bed" style="font-size:2.5rem; margin-bottom:12px; opacity:0.5;"></i>
                <p>No hay alojamientos publicados aún.</p>
                <button onclick="handlePublishClick()" class="btn-publish-main" style="margin-top:10px;">¡Sé el primero en publicar!</button>
            </div>
        `;
        return;
    }

    container.innerHTML = list.map(acc => {
        const coverImg = (acc.images && acc.images[0]) ? acc.images[0] : 'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=800';
        const isOwnerOrAdmin = currentUser && (currentUser.email === acc.owner_email || currentUser.email === ADMIN_EMAIL);

        return `
            <div class="accommodation-card-airbnb" onclick="showAccommodationDetails('${acc.id}')">
                <div class="accommodation-img-wrapper">
                    <img src="${coverImg}" alt="${acc.name}" onerror="this.src='https://images.unsplash.com/photo-1566073771259-6a8506099945?w=800'">
                    <div class="accommodation-price-badge">$${Number(acc.price).toLocaleString('es-AR')}/noche</div>
                    <div class="accommodation-type-tag">${acc.type || 'Cabaña'}</div>
                </div>
                <div class="accommodation-info-airbnb">
                    <div class="accommodation-header-row">
                        <h3 class="accommodation-name">${acc.name}</h3>
                        <span class="accommodation-rating-star"><i class="fas fa-star"></i> ${acc.rating || 4.9}</span>
                    </div>
                    <p class="accommodation-location-text"><i class="fas fa-map-marker-alt"></i> ${acc.location}</p>
                    <div class="card-amenities-pills">
                        ${(acc.amenities || []).slice(0, 3).map(am => `<span>${am}</span>`).join('')}
                        ${(acc.amenities || []).length > 3 ? `<span>+${acc.amenities.length - 3}</span>` : ''}
                    </div>
                    ${isOwnerOrAdmin ? `
                        <div class="owner-card-actions" onclick="event.stopPropagation()">
                            <button onclick="openEditAccommodation('${acc.id}')" class="btn-owner-edit"><i class="fas fa-edit"></i> Editar</button>
                            <button onclick="deleteAccommodation('${acc.id}')" class="btn-owner-del"><i class="fas fa-trash"></i></button>
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
    }).join('');
}

// 4. MODAL DETALLES DEL ALOJAMIENTO + WHATSAPP DIRECTO
function showAccommodationDetails(id) {
    const acc = accommodations.find(a => String(a.id) === String(id));
    if (!acc) return;

    const modal = document.getElementById('accommodationModal');
    const content = document.getElementById('modalContent');
    if (!modal || !content) return;

    const cleanPhone = (acc.phone || '5492944123456').replace(/\D/g, '');
    const waText = encodeURIComponent(`¡Hola! Vi tu alojamiento "${acc.name}" en Bariloche.Online y quiero consultar disponibilidad.`);
    const waUrl = `https://wa.me/${cleanPhone}?text=${waText}`;

    const imgs = (acc.images && acc.images.length > 0) ? acc.images : ['https://images.unsplash.com/photo-1566073771259-6a8506099945?w=800'];

    content.innerHTML = `
        <div class="modal-accommodation-header">
            <div class="modal-gallery-carousel" id="modalGallery">
                <img id="mainGalleryImg" src="${imgs[0]}" alt="${acc.name}">
            </div>
            ${imgs.length > 1 ? `
                <div class="gallery-thumbs-row">
                    ${imgs.map((img, i) => `
                        <img src="${img}" class="thumb-mini ${i === 0 ? 'active' : ''}" onclick="changeGalleryImage('${img}', this)">
                    `).join('')}
                </div>
            ` : ''}
        </div>
        <div class="modal-accommodation-body">
            <div class="modal-accommodation-title">
                <div>
                    <span class="type-pill-header">${acc.type || 'Alojamiento'}</span>
                    <h2>${acc.name}</h2>
                </div>
                <span class="accommodation-rating-large"><i class="fas fa-star"></i> ${acc.rating || 4.9}</span>
            </div>
            <p class="modal-location"><i class="fas fa-map-marker-alt"></i> ${acc.location}, San Carlos de Bariloche</p>
            
            <div class="modal-section">
                <h3>Descripción</h3>
                <p>${acc.description || 'Disfrutá de una estadía inolvidable en Bariloche con todas las comodidades.'}</p>
            </div>
            
            <div class="modal-section">
                <h3>Comodidades y Servicios</h3>
                <div class="amenities-grid">
                    ${(acc.amenities || ['Wi-Fi', 'Calefacción', 'Parrilla']).map(a => `<span class="amenity-tag"><i class="fas fa-check"></i> ${a}</span>`).join('')}
                </div>
            </div>
            
            <div class="modal-price-section">
                <div class="modal-price">
                    <span class="price-label">Tarifa por noche</span>
                    <span class="price-amount">$${Number(acc.price).toLocaleString('es-AR')}</span>
                </div>
                <a href="${waUrl}" target="_blank" class="btn-whatsapp-direct">
                    <i class="fab fa-whatsapp"></i> Contactar al Dueño por WhatsApp
                </a>
            </div>
        </div>
    `;

    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
}

function changeGalleryImage(src, thumbEl) {
    const mainImg = document.getElementById('mainGalleryImg');
    if (mainImg) mainImg.src = src;
    document.querySelectorAll('.thumb-mini').forEach(t => t.classList.remove('active'));
    if (thumbEl) thumbEl.classList.add('active');
}

function closeAccommodationModal() {
    const modal = document.getElementById('accommodationModal');
    if (modal) modal.style.display = 'none';
    document.body.style.overflow = 'auto';
}

function updateUserBar() {
    const userBar = document.getElementById('userAuthStatus');
    const isAdmin = !!(currentUser && currentUser.email && currentUser.email.toLowerCase().trim() === ADMIN_EMAIL);

    if (userBar) {
        if (currentUser) {
            userBar.innerHTML = `
                <div class="auth-logged-pill" style="${isAdmin ? 'border:1px solid #e74c3c; background:rgba(231, 76, 60, 0.12);' : ''}">
                    <i class="fas ${isAdmin ? 'fa-user-shield' : 'fa-user-circle'}" style="${isAdmin ? 'color:#e74c3c;' : 'color:var(--primary);'} font-size:1.1rem;"></i>
                    <span style="font-weight:700; max-width:140px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${currentUser.email}</span>
                    ${isAdmin ? '<span class="badge-admin">ADMIN</span>' : ''}
                    ${isAdmin ? '<a href="admin.html" class="btn-admin-pill" style="text-decoration:none; display:inline-flex; align-items:center; gap:4px;"><i class="fas fa-shield-alt"></i> Panel Admin</a>' : ''}
                    ${isAdmin ? '<button onclick="openAdminPanel()" class="btn-admin-pill"><i class="fas fa-key"></i> Códigos</button>' : ''}
                    <button onclick="handleLogout()" class="btn-logout-mini" title="Cerrar sesión" style="margin-left:4px;"><i class="fas fa-sign-out-alt"></i></button>
                </div>
            `;
        } else {
            userBar.innerHTML = `
                <button onclick="openAuthModal()" class="btn-login-header">
                    <i class="fas fa-user"></i> Ingresar / Registrarse
                </button>
            `;
        }
    }

    // Acceso exclusivo ADMIN en la navegación desktop y mobile
    const desktopNav = document.querySelector('.nav-desktop');
    if (desktopNav) {
        let adminDesktopLink = document.getElementById('nav-admin-link-desktop');
        if (isAdmin) {
            if (!adminDesktopLink) {
                adminDesktopLink = document.createElement('a');
                adminDesktopLink.id = 'nav-admin-link-desktop';
                adminDesktopLink.href = 'admin.html';
                adminDesktopLink.className = 'nav-link';
                adminDesktopLink.style.cssText = 'color:#e74c3c !important; font-weight:800; display:inline-flex; align-items:center; gap:6px; background:rgba(231,76,60,0.1); border-radius:10px; padding:6px 12px;';
                adminDesktopLink.innerHTML = '<i class="fas fa-shield-alt"></i> ADMIN';
                desktopNav.appendChild(adminDesktopLink);
            }
        } else if (adminDesktopLink) {
            adminDesktopLink.remove();
        }
    }

    const mobileNav = document.querySelector('.mobile-nav');
    if (mobileNav) {
        let adminMobileLink = document.getElementById('nav-admin-link-mobile');
        if (isAdmin) {
            if (!adminMobileLink) {
                adminMobileLink = document.createElement('a');
                adminMobileLink.id = 'nav-admin-link-mobile';
                adminMobileLink.href = 'admin.html';
                adminMobileLink.className = 'mobile-nav-item';
                adminMobileLink.style.cssText = 'color:#e74c3c !important; font-weight:800;';
                adminMobileLink.innerHTML = '<i class="fas fa-shield-alt"></i><span>Admin</span>';
                mobileNav.appendChild(adminMobileLink);
            }
        } else if (adminMobileLink) {
            adminMobileLink.remove();
        }
    }
}

async function checkUserSubscription() {
    if (!currentUser) return;
    try {
        const res = await fetch(`save_alojamiento.php?action=check_subscription&email=${encodeURIComponent(currentUser.email)}`);
        const data = await res.json();
        currentSubscription = data;
    } catch (e) {
        console.warn('Error checking subscription:', e);
    }
}

// 6. BOTÓN "PUBLICAR MI ALOJAMIENTO"
async function handlePublishClick() {
    if (!currentUser) {
        openAuthModal('Para publicar tu alojamiento, por favor inicia sesión o crea tu cuenta gratuita.');
        return;
    }

    await checkUserSubscription();

    const isAdmin = (currentUser.email === ADMIN_EMAIL);
    const hasActiveSub = currentSubscription && currentSubscription.active;

    if (isAdmin || hasActiveSub) {
        openPublisherModal();
    } else {
        openSubscriptionModal();
    }
}

// 7. MODALES DE AUTENTICACIÓN (SUPABASE AUTH)
function openAuthModal(msg = '') {
    const modal = document.getElementById('authModal');
    const notice = document.getElementById('authNoticeMsg');
    if (notice) notice.textContent = msg;
    if (modal) modal.style.display = 'flex';
}

function closeAuthModal() {
    const modal = document.getElementById('authModal');
    if (modal) modal.style.display = 'none';
}

function toggleAuthMode(mode) {
    const loginForm = document.getElementById('loginFormContainer');
    const signupForm = document.getElementById('signupFormContainer');
    if (mode === 'signup') {
        loginForm.style.display = 'none';
        signupForm.style.display = 'block';
    } else {
        loginForm.style.display = 'block';
        signupForm.style.display = 'none';
    }
}

async function handleLoginSubmit(e) {
    e.preventDefault();
    const email = document.getElementById('loginEmail').value.trim();
    const pass = document.getElementById('loginPass').value;
    const btn = document.getElementById('btnLoginSubmit');
    const errorEl = document.getElementById('loginError');

    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Ingresando...';
    errorEl.textContent = '';

    try {
        const { data, error } = await sbClient.auth.signInWithPassword({ email, password: pass });
        if (error) throw error;
        closeAuthModal();
        handlePublishClick();
    } catch (err) {
        errorEl.textContent = err.message || 'Error al iniciar sesión';
    } finally {
        btn.disabled = false;
        btn.innerHTML = 'Ingresar';
    }
}

window.togglePasswordVisibility = function(inputId, btnEl) {
    const input = document.getElementById(inputId);
    if (!input) return;
    const icon = btnEl.querySelector('i');
    if (input.type === 'password') {
        input.type = 'text';
        if (icon) {
            icon.className = 'fas fa-eye-slash';
        }
    } else {
        input.type = 'password';
        if (icon) {
            icon.className = 'fas fa-eye';
        }
    }
};

async function handleSignupSubmit(e) {
    e.preventDefault();
    const email = document.getElementById('signupEmail').value.trim();
    const pass = document.getElementById('signupPass').value;
    const btn = document.getElementById('btnSignupSubmit');
    const errorEl = document.getElementById('signupError');

    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Registrando...';
    errorEl.textContent = '';

    try {
        const { data, error } = await sbClient.auth.signUp({
            email,
            password: pass,
            options: {
                emailRedirectTo: 'https://bariloche.online/alojamiento.html'
            }
        });
        if (error) throw error;
        alert('🎉 ¡Cuenta creada con éxito! Te enviamos un correo de verificación. Revisa tu bandeja de entrada o spam.');
        closeAuthModal();
    } catch (err) {
        errorEl.textContent = err.message || 'Error al registrarte';
    } finally {
        btn.disabled = false;
        btn.innerHTML = 'Registrarme';
    }
}

async function handleLogout() {
    if (sbClient) await sbClient.auth.signOut();
    currentUser = null;
    currentSubscription = null;
    updateUserBar();
    renderAccommodations(accommodations);
}

// 8. MODAL DE PAGO / SUSCRIPCIÓN ($10.000 MP O CÓDIGO PROMO)
function openSubscriptionModal() {
    const modal = document.getElementById('subscriptionModal');
    if (modal) modal.style.display = 'flex';
}

function closeSubscriptionModal() {
    const modal = document.getElementById('subscriptionModal');
    if (modal) modal.style.display = 'none';
}

async function payWithMercadoPago() {
    if (!currentUser) return;
    const btn = document.getElementById('btnPayMP');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Conectando con Mercado Pago...';

    try {
        const res = await fetch('save_alojamiento.php?action=create_mp_preference', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: currentUser.email })
        });
        const data = await res.json();
        if (data.status === 'success' && data.init_point) {
            window.location.href = data.init_point;
        } else {
            alert('Error al generar link de pago: ' + (data.message || 'Intente nuevamente'));
        }
    } catch (e) {
        alert('Error de conexión con Mercado Pago');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-credit-card"></i> Pagar $10.000 con Mercado Pago';
    }
}

async function redeemPromoCode() {
    if (!currentUser) return;
    const codeInput = document.getElementById('promoCodeInput');
    const code = codeInput.value.trim().toUpperCase();
    const resultEl = document.getElementById('promoCodeResult');

    if (!code) {
        resultEl.textContent = 'Ingresa un código válido';
        resultEl.style.color = '#ef4444';
        return;
    }

    resultEl.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Validando código...';
    resultEl.style.color = '#0084ff';

    try {
        const res = await fetch('save_alojamiento.php?action=redeem_code', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: currentUser.email, code: code })
        });
        const data = await res.json();
        if (data.status === 'success') {
            resultEl.innerHTML = `✅ ${data.message}`;
            resultEl.style.color = '#10b981';
            await checkUserSubscription();
            setTimeout(() => {
                closeSubscriptionModal();
                openPublisherModal();
            }, 1200);
        } else {
            resultEl.textContent = '❌ ' + (data.message || 'Código inválido o expirado');
            resultEl.style.color = '#ef4444';
        }
    } catch (e) {
        resultEl.textContent = 'Error al validar el código';
        resultEl.style.color = '#ef4444';
    }
}

async function checkUrlPaymentParams() {
    const params = new URLSearchParams(window.location.search);
    if (params.get('payment') === 'success') {
        const email = params.get('email');
        if (email) {
            await fetch(`save_alojamiento.php?action=confirm_payment&email=${encodeURIComponent(email)}`);
            alert('🎉 ¡Pago confirmado con éxito! Ya puedes publicar tu alojamiento.');
            window.history.replaceState({}, document.title, window.location.pathname);
            handlePublishClick();
        }
    }
}

// 9. FORMULARIO DE PUBLICACIÓN Y SELECTOR DE MAPA GPS
function openPublisherModal(editData = null) {
    const modal = document.getElementById('publisherModal');
    const title = document.getElementById('publisherModalTitle');
    const form = document.getElementById('publisherForm');
    form.reset();

    document.getElementById('editAccId').value = editData ? editData.id : '';
    document.getElementById('existingImagesInput').value = editData ? JSON.stringify(editData.images || []) : '[]';

    if (editData) {
        title.textContent = 'Editar Alojamiento';
        document.getElementById('accName').value = editData.name || '';
        document.getElementById('accType').value = editData.type || 'Cabaña';
        document.getElementById('accLocation').value = editData.location || '';
        document.getElementById('accPrice').value = editData.price || '';
        document.getElementById('accPhone').value = editData.phone || '';
        document.getElementById('accDescription').value = editData.description || '';
        document.getElementById('accLat').value = editData.lat || -41.1335;
        document.getElementById('accLng').value = editData.lng || -71.3103;

        // Comodidades
        const ams = editData.amenities || [];
        document.querySelectorAll('.amenity-checkbox').forEach(cb => {
            cb.checked = ams.includes(cb.value);
        });
    } else {
        title.textContent = 'Publicar Nuevo Alojamiento';
        document.getElementById('accLat').value = '-41.1335';
        document.getElementById('accLng').value = '-71.3103';
    }

    modal.style.display = 'flex';
    initPickerMap(editData ? [editData.lat, editData.lng] : [-41.1335, -71.3103]);
}

function closePublisherModal() {
    const modal = document.getElementById('publisherModal');
    if (modal) modal.style.display = 'none';
}

function initPickerMap(initialCoords) {
    setTimeout(() => {
        if (!pickerMap) {
            pickerMap = L.map('pickerMapContainer', { zoomControl: false }).setView(initialCoords, 13);
            L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
                maxZoom: 18
            }).addTo(pickerMap);

            pickerMarker = L.marker(initialCoords, { draggable: true }).addTo(pickerMap);

            pickerMarker.on('dragend', function (e) {
                const pos = e.target.getLatLng();
                document.getElementById('accLat').value = pos.lat.toFixed(6);
                document.getElementById('accLng').value = pos.lng.toFixed(6);
            });

            pickerMap.on('click', function (e) {
                pickerMarker.setLatLng(e.latlng);
                document.getElementById('accLat').value = e.latlng.lat.toFixed(6);
                document.getElementById('accLng').value = e.latlng.lng.toFixed(6);
            });
        } else {
            pickerMap.invalidateSize();
            pickerMap.setView(initialCoords, 13);
            pickerMarker.setLatLng(initialCoords);
        }
    }, 200);
}

function openEditAccommodation(id) {
    const acc = accommodations.find(a => String(a.id) === String(id));
    if (acc) openPublisherModal(acc);
}

async function deleteAccommodation(id) {
    if (!confirm('¿Seguro que deseas eliminar esta publicación?')) return;
    try {
        const res = await fetch('save_alojamiento.php?action=delete_alojamiento', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: id, email: currentUser.email })
        });
        const data = await res.json();
        if (data.status === 'success') {
            alert('Alojamiento eliminado');
            fetchAccommodations();
        } else {
            alert(data.message || 'Error al eliminar');
        }
    } catch (e) {
        alert('Error al conectar con el servidor');
    }
}

async function handlePublisherFormSubmit(e) {
    e.preventDefault();
    if (!currentUser) return;

    const btn = document.getElementById('btnSubmitPublisher');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando y subiendo fotos...';

    const formData = new FormData(document.getElementById('publisherForm'));
    formData.append('owner_email', currentUser.email);

    // Amenities seleccionados
    const amenities = [];
    document.querySelectorAll('.amenity-checkbox:checked').forEach(cb => amenities.push(cb.value));
    formData.append('amenities', JSON.stringify(amenities));

    try {
        const res = await fetch('save_alojamiento.php?action=save_alojamiento', {
            method: 'POST',
            body: formData
        });
        const data = await res.json();
        if (data.status === 'success') {
            alert('🎉 ¡Alojamiento guardado exitosamente!');
            closePublisherModal();
            fetchAccommodations();
        } else {
            alert('❌ ' + (data.message || 'Error al guardar'));
        }
    } catch (err) {
        alert('Error al subir los datos');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-check"></i> Guardar y Publicar en el Mapa';
    }
}

// 10. PANEL DE ADMINISTRADOR PARA oscarns@gmail.com
function openAdminPanel() {
    const modal = document.getElementById('adminModal');
    if (modal) {
        modal.style.display = 'flex';
        loadAdminPromoCodes();
    }
}

function closeAdminPanel() {
    const modal = document.getElementById('adminModal');
    if (modal) modal.style.display = 'none';
}

async function loadAdminPromoCodes() {
    const listEl = document.getElementById('adminCodesList');
    if (!listEl) return;
    listEl.innerHTML = '<p><i class="fas fa-spinner fa-spin"></i> Cargando códigos...</p>';

    try {
        const res = await fetch(`save_alojamiento.php?action=get_promo_codes&admin_email=${encodeURIComponent(ADMIN_EMAIL)}`);
        const codes = await res.json();
        listEl.innerHTML = `
            <table class="admin-table">
                <thead>
                    <tr>
                        <th>Código</th>
                        <th>Meses Gratis</th>
                        <th>Usos</th>
                        <th>Estado</th>
                    </tr>
                </thead>
                <tbody>
                    ${codes.map(c => `
                        <tr>
                            <td><b>${c.code}</b></td>
                            <td>${c.months} Meses</td>
                            <td>${c.used_count || 0} / ${c.max_uses || '∞'}</td>
                            <td><span class="status-active-badge">Activo</span></td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    } catch (e) {
        listEl.innerHTML = '<p style="color:red;">Error al cargar códigos</p>';
    }
}

async function handleCreatePromoCode(e) {
    e.preventDefault();
    const code = document.getElementById('newPromoCode').value.trim().toUpperCase();
    const months = document.getElementById('newPromoMonths').value;
    const maxUses = document.getElementById('newPromoMaxUses').value;

    try {
        const res = await fetch('save_alojamiento.php?action=create_promo_code', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ admin_email: ADMIN_EMAIL, code, months, max_uses: maxUses })
        });
        const data = await res.json();
        if (data.status === 'success') {
            alert(`✅ Código "${code}" creado con éxito para ${months} meses.`);
            document.getElementById('newPromoCode').value = '';
            loadAdminPromoCodes();
        } else {
            alert('❌ ' + data.message);
        }
    } catch (e) {
        alert('Error al crear código');
    }
}
