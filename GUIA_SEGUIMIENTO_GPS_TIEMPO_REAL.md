# 🛰️ Guía Maestra: Arquitectura Definitiva de Seguimiento GPS en Tiempo Real
> **Bariloche.Online & BariRuta** — Estándar y referencia técnica obligatoria para implementar rastreo de combis/vehículos en tiempo real con Supabase, Flutter Android y Leaflet Web.

---

## 🏛️ 1. Arquitectura de Triple Capa (0ms Latencia + 100% Estabilidad)

Para lograr un rastreo GPS fluido, sin latencia y que **no se congele cuando el vehículo se mueve o la pantalla se apaga**, el sistema combina tres mecanismos sincronizados:

```
┌─────────────────────────────────────────────────────────────┐
│                    App Móvil Chofer                         │
│                    (Flutter / Nativo)                       │
└──────────────┬───────────────────────────────┬──────────────┘
               │                               │
 1. Broadcast (WebSockets - 0ms)  2. HTTP Upsert / DB
               │                               │
               ▼                               ▼
┌─────────────────────────────────────────────────────────────┐
│                     Supabase Cloud                          │
│        - Canal Realtime Broadcast ('tracking')              │
│        - Tabla 'vehicles' (Persistencia y Postgres Changes) │
└──────────────┬───────────────────────────────┬──────────────┘
               │                               │
               ▼                               ▼
┌─────────────────────────────────────────────────────────────┐
│                   Mapa Web del Turista                      │
│                 (Leaflet / MapLibre JS)                     │
│  - Marcador Combi Blanca con rumbo (heading) y pulso        │
│  - Trazado de ruta en vivo (Polyline continua)              │
│  - Local timestamp (_lastSeen) anti-parpadeo               │
└─────────────────────────────────────────────────────────────┘
```

---

## 📱 2. Capa Móvil (Flutter / Android)

### A. Permisos y Foreground Service en `AndroidManifest.xml` (Android 14+)
En `android/app/src/main/AndroidManifest.xml`:
```xml
<uses-permission android:name="android.permission.INTERNET"/>
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION"/>
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION"/>
<uses-permission android:name="android.permission.ACCESS_BACKGROUND_LOCATION"/>
<uses-permission android:name="android.permission.FOREGROUND_SERVICE"/>
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_LOCATION"/>
<uses-permission android:name="android.permission.POST_NOTIFICATIONS"/>
<uses-permission android:name="android.permission.WAKE_LOCK"/>

<application ...>
    <!-- Declaración explícita del servicio de ubicación en primer plano con WakeLock -->
    <service
        android:name="com.baseflow.geolocator.GeolocatorLocationService"
        android:enabled="true"
        android:exported="false"
        android:foregroundServiceType="location" />
</application>
```

### B. Emisión Dual en Flutter (`lib/main.dart`)
1. **Canal Broadcast Efímero:**
   ```dart
   final trackingChannel = Supabase.instance.client.channel('tracking');
   await trackingChannel.subscribe();
   ```

2. **Configuración de Hardware GPS:**
   ```dart
   final locationSettings = AndroidSettings(
     accuracy: LocationAccuracy.bestForNavigation,
     distanceFilter: 0, // No descartar ningún metro
     forceLocationManager: true, // Forzar chip GPS directo
     intervalDuration: const Duration(seconds: 2),
     foregroundNotificationConfig: const ForegroundNotificationConfig(
       notificationText: "Transmitiendo ubicación GPS en tiempo real",
       notificationTitle: "BariRuta Chofer en Servicio",
       enableWakeLock: true,
     ),
   );
   ```

3. **Doble Mecanismo de Disparo (Stream + Timer Guardián):**
   - **Stream continuo:** Emite cada vez que el GPS reporta una nueva posición.
   - **Timer guardián (3s):** Si el auto está detenido en un semáforo y el stream no emite por 3 segundos, envía la última posición conocida como heartbeat para que la web sepa que sigue activo.

4. **Payload de Telemetría:**
   ```dart
   final payload = {
     'company_name': company,
     'vehicle_code': vehicle,
     'driver_name': driver,
     'excursion_name': excursion,
     'lat': pos.latitude,
     'lng': pos.longitude,
     'speed': pos.speed * 3.6, // km/h
     'heading': pos.heading,    // Rumbo 0° a 360°
     'status': 'en_camino',
     'updated_at': DateTime.now().toUtc().toIso8601String(),
   };

   // 1. Envío instantáneo por Broadcast (0ms)
   trackingChannel.sendBroadcastMessage(event: 'location', payload: payload);

   // 2. Persistencia en Base de Datos
   supabase.from('vehicles').upsert(payload, onConflict: 'company_name,vehicle_code');
   ```

5. **Desconexión Limpia Inmediata ("Dejar de mostrar"):**
   ```dart
   // Enviar evento de estado inactivo antes de cerrar
   await trackingChannel.sendBroadcastMessage(
     event: 'status',
     payload: {'company_name': company, 'vehicle_code': vehicle, 'active': false},
   );
   await Future.delayed(const Duration(milliseconds: 300));
   await trackingChannel.unsubscribe();
   unawaited(supabase.from('vehicles').delete().match({'company_name': company, 'vehicle_code': vehicle}));
   ```

---

## 🌐 3. Capa Web (Mapa de Turistas / Pasajeros)

### A. Cliente Realtime Anti-Parpadeo (`supabase_client.js`)
Para evitar que el vehículo "aparezca y desaparezca" en los primeros segundos de transmisión:
- **Timestamp Local (`_lastSeen`):** Cada paquete recibido (por Broadcast o DB) guarda `_lastSeen = Date.now()`.
- **Nunca borrar durante el polling:** El polling de base de datos (`fetchVehicles()`) cada 1.5s **solo actualiza e inserta**, jamás borra vehículos activos que hayan transmitido en los últimos 45 segundos.
- **Borrado reactivo instantáneo:** Solo se elimina cuando llega el evento `status: { active: false }` o el evento `DELETE` de Postgres Changes.

```javascript
// 1. Canal Broadcast (Ultrarrápido 0ms)
this.trackingBroadcastChannel = this.supabase.channel('tracking');
this.trackingBroadcastChannel
    .on('broadcast', { event: 'location' }, ({ payload }) => {
        payload._lastSeen = Date.now();
        const idx = this.vehicles.findIndex(v => this._vehicleKey(v) === this._vehicleKey(payload));
        if (idx >= 0) {
            this.vehicles[idx] = { ...this.vehicles[idx], ...payload, _lastSeen: Date.now() };
        } else {
            this.vehicles.unshift(payload);
        }
        this.filterAndNotifyVehicles();
    })
    .on('broadcast', { event: 'status' }, ({ payload }) => {
        if (payload && payload.active === false) {
            this.vehicles = this.vehicles.filter(v => this._vehicleKey(v) !== this._vehicleKey(payload));
            this.filterAndNotifyVehicles();
        }
    })
    .subscribe();

// 2. Base de datos (Postgres Changes)
this.supabase
    .channel('realtime_vehicles_channel')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'vehicles' }, payload => {
        if (payload.eventType === 'DELETE' && payload.old) {
            this.vehicles = this.vehicles.filter(v => this._vehicleKey(v) !== this._vehicleKey(payload.old));
        } else if (payload.new) {
            payload.new._lastSeen = Date.now();
            const idx = this.vehicles.findIndex(v => this._vehicleKey(v) === this._vehicleKey(payload.new));
            if (idx >= 0) this.vehicles[idx] = { ...this.vehicles[idx], ...payload.new, _lastSeen: Date.now() };
            else this.vehicles.unshift(payload.new);
        }
        this.filterAndNotifyVehicles();
    })
    .subscribe();
```

---

## 🚐 4. Diseño del Marcador Combi Blanca (`mapa.js` y `styles.css`)

### A. Marcador SVG Blanco de Alta Visibilidad
```html
<div class="combi-live-marker ${isMoving ? 'is-moving' : ''}">
    <div class="combi-pulse-wave"></div>
    <div class="combi-body-card" style="${heading > 0 ? `transform: rotate(${heading}deg);` : ''}">
        <div class="combi-icon-graphic">
            <svg viewBox="0 0 64 64" width="40" height="40" fill="none" xmlns="http://www.w3.org/2000/svg">
                <!-- Carrocería Combi BLANCA brillante -->
                <rect x="8" y="10" width="48" height="38" rx="9" fill="#ffffff" stroke="#cbd5e1" stroke-width="1.5"/>
                <path d="M8 23H56V38C56 43.5 51.5 48 46 48H18C12.5 48 8 43.5 8 38V23Z" fill="#f8fafc"/>
                <!-- Techo / Franja de contraste azul Bariloche -->
                <path d="M8 18H56V23H8V18Z" fill="#0084ff"/>
                <!-- Parabrisas frontal y ventanillas oscuras -->
                <rect x="12" y="13" width="18" height="9" rx="2.5" fill="#1e293b"/>
                <rect x="34" y="13" width="18" height="9" rx="2.5" fill="#1e293b"/>
                <!-- Luces delanteras potentes amarillas -->
                <circle cx="14" cy="41" r="4" fill="#facc15" stroke="#eab308" stroke-width="1"/>
                <circle cx="50" cy="41" r="4" fill="#facc15" stroke="#eab308" stroke-width="1"/>
                <!-- Parrilla y paragolpes delantero -->
                <rect x="22" y="39" width="20" height="4.5" rx="2" fill="#334155"/>
                <rect x="24" y="40.5" width="16" height="1.5" rx="0.5" fill="#94a3b8"/>
                <!-- Ruedas -->
                <rect x="13" y="47" width="9" height="5" rx="2" fill="#0f172a"/>
                <rect x="42" y="47" width="9" height="5" rx="2" fill="#0f172a"/>
            </svg>
        </div>
    </div>
    <div class="combi-badge-pill">
        <b>${veh.vehicle_code || 'Combi'}</b>
        <span class="combi-speed-pill">${speedText}</span>
    </div>
</div>
```

### B. Estilos CSS del Marcador y Pulso (`styles.css`)
```css
.combi-live-marker {
    position: relative;
    width: 60px;
    height: 60px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    cursor: pointer;
}

.combi-pulse-wave {
    position: absolute;
    width: 48px;
    height: 48px;
    border-radius: 50%;
    background: rgba(0, 132, 255, 0.2);
    border: 2px solid #0084ff;
    animation: combiPulse 2s infinite ease-out;
    z-index: 1;
}

@keyframes combiPulse {
    0% { transform: scale(0.6); opacity: 0.9; }
    100% { transform: scale(1.6); opacity: 0; }
}

.combi-body-card {
    position: relative;
    z-index: 2;
    background: #ffffff;
    border: 2px solid #0084ff;
    border-radius: 12px;
    padding: 3px;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 4px 18px rgba(0, 132, 255, 0.55), 0 2px 8px rgba(0,0,0,0.25);
    transition: transform 0.3s ease;
}

.combi-live-marker:hover .combi-body-card {
    transform: scale(1.15);
}

.combi-badge-pill {
    position: absolute;
    bottom: -16px;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(15, 23, 42, 0.95);
    border: 1px solid rgba(255, 255, 255, 0.2);
    color: #ffffff;
    padding: 2px 7px;
    border-radius: 7px;
    font-size: 0.65rem;
    font-weight: 800;
    white-space: nowrap;
    display: flex;
    align-items: center;
    gap: 4px;
    box-shadow: 0 3px 10px rgba(0,0,0,0.5);
    z-index: 3;
}

.combi-speed-pill {
    color: #00cec9;
    font-weight: 700;
}
```

---

## 📋 5. Checklist para Replicar en la Próxima App
- [ ] **Android:** ¿Tiene `foregroundServiceType="location"`, `POST_NOTIFICATIONS` y `WAKE_LOCK` en el Manifest?
- [ ] **GPS Settings:** ¿`distanceFilter: 0`, `intervalDuration: 2s` y `accuracy: bestForNavigation`?
- [ ] **Doble canal:** ¿Se transmite por Broadcast efímero (`channel('tracking')`) + DB (`vehicles`)?
- [ ] **Anti-parpadeo:** ¿El cliente web usa `_lastSeen = Date.now()` local y evita borrar en polling?
- [ ] **Desconexión:** ¿Al detener transmisión envía `status: { active: false }` con 300ms de gracia?
- [ ] **Visual:** ¿El SVG del vehículo es blanco brillante de alto contraste con polilínea de recorrido (`L.polyline`) y rotación por `heading`?
