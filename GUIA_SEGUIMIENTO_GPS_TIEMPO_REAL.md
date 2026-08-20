# 🛰️ Guía Maestra: Arquitectura de Seguimiento GPS en Tiempo Real
> **Bariloche.Online & BariRuta** — Documento técnico de referencia obligatoria para aplicaciones con rastreo continuo calle por calle.

---

## 🏛️ 1. Arquitectura de Tres Capas

Para lograr un rastreo GPS fluido, sin latencia y que **no se congele cuando el vehículo se mueve o la pantalla se apaga**, el sistema debe combinar tres mecanismos:

```
┌─────────────────────────┐
│   App Móvil Chofer      │
│  (Flutter / Nativo)     │
└────────────┬────────────┘
             │ 1. Broadcast (WebSockets - 0ms latencia)
             │ 2. Postgres DB (Persistencia / Carga inicial)
             ▼
┌─────────────────────────┐
│     Supabase Cloud      │
│  (Realtime & Database)  │
└────────────┬────────────┘
             │
             │ WebSockets / Postgres Changes
             ▼
┌─────────────────────────┐
│     Mapa del Turista    │
│ (Leaflet / MapLibre JS) │
│ - Marcador que rota     │
│ - Trazado Polilínea     │
└─────────────────────────┘
```

---

## 📱 2. Capa Móvil (Flutter / Android)

### A. Permisos y Foreground Service en `AndroidManifest.xml` (Obligatorio Android 14+)
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
    <!-- Declaración explícita del servicio de ubicación en primer plano -->
    <service
        android:name="com.baseflow.geolocator.GeolocatorLocationService"
        android:enabled="true"
        android:exported="false"
        android:foregroundServiceType="location" />
    ...
</application>
```

### B. Configuración de GPS y Emisión Dual en Flutter (`lib/main.dart`)
1. **Canal Broadcast Efímero (Método CCV Lite):**
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
       notificationTitle: "Chofer en Servicio",
       enableWakeLock: true,
     ),
   );
   ```

3. **Doble Mecanismo de Disparo (Stream + Timer de Pulso Activo):**
   - **Stream:** Emite instantáneamente al haber movimiento detectado.
   - **Timer (cada 2 seg):** Si el auto está detenido en un semáforo o rueda lento, consulta la última posición conocida y refresca el timestamp para que el mapa web sepa que la combi sigue online y activa.

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

---

## 🌐 3. Capa Web (Turistas / Pasajeros)

### A. Recepción de Coordenadas (`supabase_client.js`)
El cliente web debe escuchar **ambas vías**:
```javascript
// 1. Escucha Broadcast (Instantánea)
this.supabase.channel('tracking')
  .on('broadcast', { event: 'location' }, ({ payload }) => {
      this.updateVehicle(payload);
  })
  .on('broadcast', { event: 'status' }, ({ payload }) => {
      if (payload.active === false) this.removeVehicle(payload);
  })
  .subscribe();

// 2. Escucha Base de Datos (Postgres Changes)
this.supabase.channel('realtime_vehicles_channel')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'vehicles' }, payload => {
      this.syncFromDb(payload);
  })
  .subscribe();
```

### B. Renderizado en Mapa con Polilínea y Rumbo (`mapa.js`)
1. **Polilínea (Recorrido calle por calle):**
   - Cada nueva coordenada se agrega a un array `vehicleTracks[id]`.
   - Se actualiza la capa `L.polyline(track, { color: '#0084FF', weight: 5 })`.
2. **Rotación del Marcador:**
   - Se aplica `style="transform: rotate(${heading}deg);"` con CSS `transition: transform 0.4s ease;` para que el icono del móvil gire suavemente en la dirección de la calle por la que transita.
3. **Tarjeta de Información (Minicard):**
   - Muestra velocidad en vivo, chofer, botón de compra de ticket y enlace directo a WhatsApp.

---

## 📋 4. Checklist para Nuevos Proyectos
- [ ] ¿`AndroidManifest.xml` tiene `POST_NOTIFICATIONS`, `WAKE_LOCK` y `GeolocatorLocationService` con `foregroundServiceType="location"`?
- [ ] ¿El canal de Supabase usa **Broadcast** (`channel('tracking')`) además de la tabla `vehicles`?
- [ ] ¿El `distanceFilter` está en `0` y la precisión en `bestForNavigation`?
- [ ] ¿La web tiene implementada la polilínea continua (`L.polyline`) y la rotación por `heading`?
