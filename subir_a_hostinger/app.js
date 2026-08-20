// CONFIGURACIÓN
const API_KEY = '9ce31ed7d4e1c50507d09c75c2d27db1';
const CITY_NAME = 'San Carlos de Bariloche,AR';

// RADIOS DATA - COMPLETA CON CATEGORÍAS TUNEIN
const RADIOS = [
    { id: '16', name: 'Radio 6', city: 'Bariloche', freq: 'FM 103.1', url: 'https://guille777.radioca.st/stream', color: '#FFD700', cat: 'News' },
    { id: '18', name: 'Radio Con Vos Patagonia', city: 'Bariloche', freq: 'FM 89.5', url: 'https://streaming2.locucionar.com/proxy/radioconvospatagonia?mp=/stream', color: '#87CEEB', cat: 'News' },
    { id: '19', name: 'FM Bariloche', city: 'Bariloche', freq: 'FM 90.5', url: 'https://streaming1.locucionar.com/proxy/colgados?mp=/stream', color: '#98FB98', cat: 'Music' },
    { id: '17', name: 'XRadio Bariloche', city: 'Bariloche', freq: 'FM 98.5', url: 'https://radios.streamingdha.com.ar/8004/;', color: '#DA70D6', cat: 'Music' },
    { id: '27', name: 'Radio C', city: 'Bariloche', freq: 'FM 107.3', url: 'https://streaming01.shockmedia.com.ar:10575/stream', color: '#FF7675', cat: 'Music' },
    { id: '28', name: 'Voz Radio', city: 'Bariloche', freq: 'FM 103.7', url: 'https://streaming2.locucionar.com/proxy/radioconvospatagonia?mp=/stream', color: '#6C5CE7', cat: 'Talk' },
    { id: '29', name: 'FM 94.5', city: 'Bariloche', freq: 'FM 94.5', url: 'https://streaming01.radiosenlinea.com.ar:9676/stream', color: '#00B894', cat: 'Music' },
    { id: '31', name: 'FM La Rocka', city: 'Bariloche', freq: 'FM 90.9', url: 'https://s3.conectarmedia.com:8052/stream', color: '#2D3436', cat: 'Music' },
    { id: '32', name: 'Radio O', city: 'Bariloche', freq: 'FM 102.5', url: 'http://190.210.30.139:8008/sanbernardo', color: '#0984e3', cat: 'Music' },
    { id: '30', name: 'El Cordillerano Radio', city: 'Bariloche', freq: 'FM 93.7', url: 'https://01.solumedia.com.ar:8302/stream', color: '#E84118', cat: 'News' },
    { id: '4', name: 'Radio Nacional Bariloche', city: 'Bariloche', freq: 'AM 1230', url: 'https://sa.mp3.icecast.magma.edge-access.net/sc_rad39', color: '#FBBC05', cat: 'News' },
    { id: '23', name: 'La Radio de la Cordillera', city: 'El Bolsón', freq: 'FM 105.5', url: 'http://69.61.116.30/proxy/delacordillera?mp=/stream', color: '#00cec9', cat: 'Music' },
    { id: '24', name: 'FM del Bosque', city: 'Lago Puelo', freq: 'FM 104.1', url: 'https://radio01.ferozo.com/proxy/ra01000983?mp=/stream', color: '#95E1D3', cat: 'Music' },
    { id: '20', name: 'FM Paraíso 42', city: 'El Bolsón', freq: 'FM 91.9', url: 'http://streaming6.locucionar.com:24140/stream', color: '#F38181', cat: 'Music' },
];

let activeRadio = null;
let currentCity = 'Bariloche';
let isLoadingRadio = false;

// INITIALIZATION
document.addEventListener('DOMContentLoaded', () => {
    initTheme();

    // Rutas dinámicas para poblar contenido
    if (document.getElementById('tunein-sections')) renderTuneInRadios();
    if (document.getElementById('radiosList')) renderAllRadios();
    if (document.getElementById('flights-list-full')) fetchFlights('A');
    if (document.getElementById('weather-widget-content')) fetchWeather();

    initCitySelect();
});

// THEME SYSTEM
function initTheme() {
    const savedTheme = localStorage.getItem('theme') || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    document.documentElement.setAttribute('data-theme', savedTheme);
    updateThemeIcon(savedTheme);
}

window.toggleTheme = () => {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    updateThemeIcon(newTheme);
};

function updateThemeIcon(theme) {
    const btn = document.getElementById('theme-toggle-btn');
    if (btn) btn.innerHTML = theme === 'dark' ? '<i class="fas fa-sun"></i>' : '<i class="fas fa-moon"></i>';
}

// TUNEIN STYLE RENDERING
function renderTuneInRadios() {
    const popularList = document.getElementById('list-popular');
    const newsList = document.getElementById('list-news');
    if (!popularList || !newsList) return;

    const populars = RADIOS.slice(0, 6);
    const news = RADIOS.filter(r => r.cat === 'News');

    popularList.innerHTML = populars.map(r => createRadioCard(r)).join('');
    newsList.innerHTML = news.map(r => createRadioCard(r)).join('');
}

function createRadioCard(r) {
    const isPlaying = activeRadio?.id === r.id;
    return `
        <div class="radio-card-tunein" onclick='playRadio(${JSON.stringify(r)})'>
            <div class="station-art" style="background: ${r.color}22; color: ${r.color}">
                ${r.name.charAt(0)}
                ${isPlaying ? '<div class="playing-pulse"></div>' : ''}
            </div>
            <div class="station-info-tunein">
                <span class="station-name">${r.name}</span>
                <span class="station-meta">${r.freq}</span>
            </div>
        </div>
    `;
}

function renderAllRadios() {
    const list = document.getElementById('radiosList');
    if (!list) return;
    list.innerHTML = '';
    const filtered = currentCity === 'Todas' ? RADIOS : RADIOS.filter(r => r.city === currentCity);

    filtered.forEach(radio => {
        const isPlaying = activeRadio?.id === radio.id;
        const card = document.createElement('div');
        card.className = `radio-card-grid ${isPlaying ? 'active-playing' : ''}`;
        card.onclick = () => playRadio(radio);
        card.innerHTML = `
            <div class="radio-card-content" style="background: linear-gradient(135deg, ${radio.color}15, ${radio.color}05);">
                <div class="radio-name-display">${radio.name}</div>
                <div class="radio-freq">${radio.freq}</div>
                <div class="play-overlay"><i class="fas ${isPlaying ? (isLoadingRadio ? 'fa-spinner fa-spin' : 'fa-pause') : 'fa-play'}"></i></div>
            </div>
            <div class="radio-city-label">${radio.city}</div>
        `;
        list.appendChild(card);
    });
}

function initCitySelect() {
    const select = document.getElementById('citySelect');
    if (!select) return;
    const cities = ['Todas', ...new Set(RADIOS.map(r => r.city).sort())];
    select.innerHTML = cities.map(c => `<option value="${c}" ${c === currentCity ? 'selected' : ''}>📍 ${c}</option>`).join('');
}

window.handleCityChange = (city) => {
    currentCity = city;
    renderAllRadios();
};

// PLAYER LOGIC
window.playRadio = (radio) => {
    const audio = document.getElementById('audioElement');
    const player = document.getElementById('radioPlayer');
    if (!audio) return;

    if (activeRadio?.id === radio.id) {
        if (audio.paused) audio.play().then(updatePlayerUI);
        else { audio.pause(); updatePlayerUI(); }
        return;
    }

    activeRadio = radio;
    audio.src = radio.url;
    audio.play().then(() => {
        player.style.display = 'flex';
        updatePlayerUI();
    }).catch(e => console.error("Error Radio", e));
};

window.togglePlay = () => {
    const audio = document.getElementById('audioElement');
    if (audio.paused) audio.play().then(updatePlayerUI);
    else { audio.pause(); updatePlayerUI(); }
};

window.stopRadio = () => {
    const audio = document.getElementById('audioElement');
    if (audio) { audio.pause(); audio.src = ""; }
    activeRadio = null;
    document.getElementById('radioPlayer').style.display = 'none';
};

function updatePlayerUI() {
    const audio = document.getElementById('audioElement');
    const playBtn = document.getElementById('playBtn');
    if (playBtn) playBtn.innerHTML = audio.paused ? '<i class="fas fa-play"></i>' : '<i class="fas fa-pause"></i>';
    if (activeRadio) {
        document.getElementById('playerName').textContent = activeRadio.name;
        document.getElementById('playerFreq').textContent = activeRadio.freq;
        const icon = document.getElementById('playerIcon');
        icon.textContent = activeRadio.name.charAt(0);
        icon.style.background = activeRadio.color;
    }
}

// FLIGHTS - Filtro correcto 4hs/3hs
function parseFlightDate(stda) {
    if (!stda) return null;
    try {
        // Formato real del API: "DD/MM HH:MM" o "DD/MM/YY HH:MM"
        const parts = stda.trim().split(' ');
        if (parts.length < 2) return null;

        const datePart = parts[0];
        const timePart = parts[1];

        const dateParts = datePart.split('/');
        const timeParts = timePart.split(':');

        if (dateParts.length < 2 || timeParts.length !== 2) return null;

        const day = parseInt(dateParts[0], 10);
        const month = parseInt(dateParts[1], 10) - 1; // JS months are 0-indexed

        // Si viene el año, usarlo. Si no, usar año actual
        let year;
        if (dateParts.length === 3) {
            year = parseInt(dateParts[2], 10);
            if (year < 100) year += 2000;
        } else {
            year = new Date().getFullYear(); // Año actual
        }

        const hour = parseInt(timeParts[0], 10);
        const minute = parseInt(timeParts[1], 10);

        const result = new Date(year, month, day, hour, minute);

        // Verificar que la fecha es válida
        if (isNaN(result.getTime())) return null;

        return result;
    } catch (e) {
        console.error('Error parsing flight date:', stda, e);
        return null;
    }
}

const FALLBACK_FLIGHTS_A = [
    { aerolinea: 'Aerolíneas Argentinas', nro: 'AR 1682', destorig: 'Buenos Aires (AEP)', stda: '19/08 14:15', estes: 'Aterrizado' },
    { aerolinea: 'Flybondi', nro: 'FO 5274', destorig: 'Buenos Aires (EZE)', stda: '19/08 15:30', estes: 'En Horario' },
    { aerolinea: 'JetSmart', nro: 'WJ 3442', destorig: 'Córdoba (COR)', stda: '19/08 16:45', estes: 'Programado' },
    { aerolinea: 'Aerolíneas Argentinas', nro: 'AR 1690', destorig: 'Rosario (ROS)', stda: '19/08 18:20', estes: 'Programado' },
    { aerolinea: 'Flybondi', nro: 'FO 5278', destorig: 'Buenos Aires (AEP)', stda: '19/08 19:40', estes: 'Programado' }
];

const FALLBACK_FLIGHTS_D = [
    { aerolinea: 'Aerolíneas Argentinas', nro: 'AR 1683', destorig: 'Buenos Aires (AEP)', stda: '19/08 15:00', estes: 'Partió' },
    { aerolinea: 'Flybondi', nro: 'FO 5275', destorig: 'Buenos Aires (EZE)', stda: '19/08 16:15', estes: 'Embarcando' },
    { aerolinea: 'JetSmart', nro: 'WJ 3443', destorig: 'Córdoba (COR)', stda: '19/08 17:30', estes: 'Programado' },
    { aerolinea: 'Aerolíneas Argentinas', nro: 'AR 1691', destorig: 'Rosario (ROS)', stda: '19/08 19:05', estes: 'Programado' },
    { aerolinea: 'Flybondi', nro: 'FO 5279', destorig: 'Buenos Aires (AEP)', stda: '19/08 20:25', estes: 'Programado' }
];

async function fetchFlights(type) {
    const container = document.getElementById('flights-list-full');
    if (!container) return;

    let data = null;

    try {
        const res = await fetch(`vuelos.php?type=${type}`);
        const text = await res.text();
        if (text.trim().startsWith('[') || text.trim().startsWith('{')) {
            data = JSON.parse(text);
        }
    } catch (e) {
        console.warn("API de vuelos local no disponible, usando datos de respaldo:", e);
    }

    // Si no hay datos del PHP (ej. servidor de pruebas estático local), usar fallback
    if (!data || !Array.isArray(data) || data.length === 0) {
        data = type === 'D' ? FALLBACK_FLIGHTS_D : FALLBACK_FLIGHTS_A;
    }

    if (!data || data.length === 0) {
        const typeText = type === 'D' ? 'partidas' : 'arribos';
        container.innerHTML = `
            <div style="padding:60px 20px; text-align:center;">
                <i class="fas fa-plane" style="font-size:3rem; color:var(--border); margin-bottom:15px; display:block;"></i>
                <p style="color:var(--text-secondary); font-weight:600;">No hay ${typeText} disponibles en este momento.</p>
            </div>
        `;
        return;
    }

    container.innerHTML = data.map(f => {
        const estado = f.estes || 'PROGRAMADO';
        const isCompleted = estado.toLowerCase().includes('aterriz') || estado.toLowerCase().includes('partió') || estado.toLowerCase().includes('despeg');
        const isCancelled = estado.toLowerCase().includes('cancel') || estado.toLowerCase().includes('demorado');

        return `
            <div class="flight-row-premium">
                <div class="flight-main">
                    <div class="flight-id"><b>${f.aerolinea}</b> ${f.nro}</div>
                    <div class="flight-dest">${f.destorig}</div>
                </div>
                <div class="flight-status-box">
                    <div class="flight-time">${(f.stda || '').split(' ')[1] || f.stda || '--:--'}</div>
                    <div class="flight-badge ${isCompleted ? 'status-ok' : isCancelled ? 'status-cancel' : 'status-wait'}">${estado}</div>
                </div>
            </div>
        `;
    }).join('');
}


window.toggleFlights = (type) => {
    // Remover active de todos los tabs
    document.querySelectorAll('.flight-tab').forEach(btn => btn.classList.remove('active'));

    // Agregar active al botón clickeado
    if (type === 'A') {
        document.getElementById('btn-arribos').classList.add('active');
    } else {
        document.getElementById('btn-partidas').classList.add('active');
    }

    fetchFlights(type);
};

async function fetchWeather() {
    try {
        const res = await fetch(`https://api.openweathermap.org/data/2.5/weather?q=${CITY_NAME}&units=metric&lang=es&appid=${API_KEY}`);
        const d = await res.json();
        const el = document.getElementById('weather-widget-content');
        if (el) el.innerHTML = `<b>${Math.round(d.main.temp)}°C</b> ${d.weather[0].description}`;
    } catch (e) { }
}

// PWA Service Worker Registration
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js')
            .then(reg => console.log('ServiceWorker registration successful with scope: ', reg.scope))
            .catch(err => console.log('ServiceWorker registration failed: ', err));
    });
}
