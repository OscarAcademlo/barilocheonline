# 🌐 Bariloche Online - PWA

## 🎯 ¿Qué es esto?

**PWA (Progressive Web App)** de bariloche.online con:
- ✅ 48 radios de la Patagonia en vivo
- ✅ Diseño moderno y responsive
- ✅ Instalable como app (Android/iOS/Desktop)
- ✅ Funciona OFFLINE
- ✅ Espacios para AdSense
- ✅ Servicios locales (farmacias, clima, dólar)

---

## 📂 Estructura

```
appweb/
├── index.html      → HTML principal
├── styles.css      → CSS moderno con glassmorphism
├── app.js          → Lógica de radios y funcionalidades
├── manifest.json   → Configuración PWA
├── sw.js           → Service Worker (offline)
└── README.md       → Este archivo
```

---

## �� Características

### 🎨 Diseño Premium
- **Glassmorphism** (efectos de vidrio)
- **Animaciones suaves**
- **Gradientes modernos**
- **Responsive** (mobile + tablet + desktop)
- **Dark mode friendly**

### 📻 Funcionalidades
- **48 radios** de Argentina y Chile
- **Filtro por ciudad**
- **Reproductor flotante**
- **Controles de media** (pantalla bloqueada)
- **PWA instalable**

### 📱 PWA Features
- ✅ Instalable en home screen
- ✅ Funciona sin internet (caché)
- ✅ Splash screen
- ✅ Standalone mode (sin barra del navegador)

---

## 🚀 Cómo Usar

### Opción 1: Local (Testing)

1. **Abrir con navegador:**
   ```bash
   # Abrir index.html directamente
   open appweb/index.html
   ```

2. **O con servidor local:**
   ```bash
   cd appweb
   python3 -m http.server 8000
   ```
   
   Luego ir a: http://localhost:8000

### Opción 2: Deploy a Vercel (Producción)

1. **Instalar Vercel CLI:**
   ```bash
   npm install -g vercel
   ```

2. **Deploy:**
   ```bash
   cd appweb
   vercel
   ```

3. **Conectar dominio:**
   - Ve a Vercel Dashboard
   - Settings → Domains
   - Agregar: `bariloche.online`
   - Configurar DNS según instrucciones

### Opción 3: Netlify (Alternativa)

1. **Drag & Drop:**
   - Ve a: https://app.netlify.com/drop
   - Arrastrá la carpeta `appweb/`
   - ¡Listo!

2. **Conectar dominio:**
   - Domain settings
   - Add custom domain: `bariloche.online`

---

## 💰 Monetización con AdSense

### Paso 1: Crear cuenta AdSense
1. Ve a: https://www.google.com/adsense/start/
2. Agregar sitio: `bariloche.online`
3. Copiar código de verificación

### Paso 2: Agregar código
En `index.html`, dentro del `<head>`:

```html
<!-- Google AdSense -->
<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-XXXXXXXX"
     crossorigin="anonymous"></script>
```

### Paso 3: Crear unidades publicitarias

Ya hay **3 espacios listos** en la web:

1. **Sidebar Top** (300x250 - Medium Rectangle)
2. **Sidebar Bottom** (300x250 - Medium Rectangle)
3. **Bottom Banner** (728x90 - Leaderboard)

Reemplazar los `.ad-placeholder` con código de AdSense.

---

## 🎨 Personalización

### Cambiar Colores

En `styles.css`:

```css
:root {
    --primary: #2c5f7c;        /* Azul principal */
    --secondary: #f39c12;      /* Naranja/amarillo */
    --bg: #f5f7fa;             /* Fondo */
}
```

### Agregar/Quitar Radios

En `app.js`, modificar array `RADIOS`:

```javascript
const RADIOS = [
    { 
        id: '99', 
        name: 'Mi Radio', 
        city: 'Mi Ciudad', 
        freq: 'FM 100.1', 
        url: 'https://stream.url',
        genre: 'Rock',
        color: '#FF6B6B'
    },
    // ... más radios
];
```

### Modificar Servicios

En `index.html`, sección `services-section`:

```html
<div class="service-card">
    <h4>🏥 Nuevo Servicio</h4>
    <p>Contenido aquí</p>
</div>
```

---

## 📱 PWA: Cómo Instalar

### Android/iOS:
1. Abrir en Chrome/Safari
2. Menú → "Agregar a pantalla de inicio"
3. Listo! Funciona como app nativa

### Desktop:
1. Abrir en Chrome
2. Icono ➕ en barra de direcciones
3. "Instalar Bariloche Online"

---

## 🔧 Troubleshooting

### Las radios no suenan
- Verificar URLs en `app.js`
- Algunas radios requieren HTTPS
- Probar en navegador actualizado

### PWA no se instala
- Verificar que estés en HTTPS
- Revisar `manifest.json`
- Comprobar que `sw.js` esté registrado

### AdSense no muestra publicidad
- Esperar aprobación (1-3 días)
- Verificar código correctamente insertado
- Ads pueden tardar 24-48hs en aparecer

---

## 📊 Next Steps

1. ✅ **Deploy a Vercel** → Subir producción
2. ✅ **Configurar DNS** → Apuntar bariloche.online
3. ✅ **Activar AdSense** → Monetizar
4. ✅ **Promover** → Redes sociales
5. ✅ **Analizar** → Google Analytics

---

## 🎯 Características Próximas (v2.0)

- [ ] Favoritos (localStorage)
- [ ] Historial de reproducción
- [ ] Compartir en redes sociales
- [ ] Modo oscuro manual
- [ ] Noticias dinámicas (API)
- [ ] Clima en tiempo real (API)
- [ ] Comentarios por radio

---

## 💻 Tecnologías Usadas

- **HTML5** - Estructura
- **CSS3** - Estilos modernos
- **JavaScript ES6+** - Lógica
- **Service Worker** - PWA/Offline
- **Web Audio API** - Reproducción
- **Media Session API** - Controles

---

## 📞 Soporte

Si necesitás ayuda o querés agregar features, avisame!

**¡Disfrutá tu PWA!** 🚀🎵
