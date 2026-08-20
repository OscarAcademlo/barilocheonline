import 'dart:async';
import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:url_launcher/url_launcher.dart';

// CREDENCIALES SUPABASE REALES Y 100% AUTOMÁTICAS (INVISIBLE PARA EL CHOFER)
const String kSupabaseUrl = 'https://pwrlbwplpgzirlcrwepi.supabase.co';
const String kSupabaseAnonKey =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB3cmxid3BscGd6aXJsY3J3ZXBpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzMzc0NzAsImV4cCI6MjA4NjkxMzQ3MH0.HxEfbABTObu4khKxVhtBaBuCt2RDBm34urnSEJCfJUU';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  try {
    await Supabase.initialize(
      url: kSupabaseUrl,
      // ignore: deprecated_member_use
      anonKey: kSupabaseAnonKey,
    );
  } catch (e) {
    debugPrint('Supabase init: $e');
  }

  runApp(const BariRutaChoferApp());
}

class BariRutaChoferApp extends StatelessWidget {
  const BariRutaChoferApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'BariRuta Chofer',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        useMaterial3: true,
        brightness: Brightness.dark,
        scaffoldBackgroundColor: const Color(0xFF0F172A),
        colorScheme: const ColorScheme.dark(
          primary: Color(0xFF0084FF),
          secondary: Color(0xFF00B894),
          surface: Color(0xFF1E293B),
        ),
      ),
      home: const DriverHomeScreen(),
    );
  }
}

class DriverHomeScreen extends StatefulWidget {
  const DriverHomeScreen({super.key});

  @override
  State<DriverHomeScreen> createState() => _DriverHomeScreenState();
}

class _DriverHomeScreenState extends State<DriverHomeScreen> {
  final _formKey = GlobalKey<FormState>();

  // CAMPOS COMPLETAMENTE EN BLANCO PARA EL CHOFER
  final _companyNameCtrl = TextEditingController();
  final _vehicleCodeCtrl = TextEditingController();
  final _driverNameCtrl = TextEditingController();
  final _excursionNameCtrl = TextEditingController();

  bool _isStreaming = false;
  StreamSubscription<Position>? _positionStreamSub;
  Timer? _activePulseTimer;
  Position? _currentPosition;
  int _packetsSent = 0;
  String _lastSentTime = '--:--:--';
  String _statusMessage = 'Listo para iniciar transmisión';
  // Timestamp del último envío — evita duplicados entre stream y timer
  DateTime? _lastSentAt;

  List<Map<String, dynamic>> _touristsWaiting = [];
  RealtimeChannel? _touristChannel;
  RealtimeChannel? _trackingBroadcastChannel;

  @override
  void initState() {
    super.initState();
    _loadSavedPreferences();
  }

  @override
  void dispose() {
    _positionStreamSub?.cancel();
    _activePulseTimer?.cancel();
    _touristChannel?.unsubscribe();
    _trackingBroadcastChannel?.unsubscribe();
    _companyNameCtrl.dispose();
    _vehicleCodeCtrl.dispose();
    _driverNameCtrl.dispose();
    _excursionNameCtrl.dispose();
    super.dispose();
  }

  Future<void> _loadSavedPreferences() async {
    final prefs = await SharedPreferences.getInstance();
    setState(() {
      _companyNameCtrl.text = prefs.getString('saved_company_name') ?? '';
      _vehicleCodeCtrl.text = prefs.getString('saved_vehicle_code') ?? '';
      _driverNameCtrl.text = prefs.getString('saved_driver_name') ?? '';
      _excursionNameCtrl.text = prefs.getString('saved_excursion_name') ?? '';
    });

    if (_companyNameCtrl.text.isNotEmpty) {
      _listenTouristPickups();
    }
  }

  Future<void> _savePreferences() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('saved_company_name', _companyNameCtrl.text.trim());
    await prefs.setString('saved_vehicle_code', _vehicleCodeCtrl.text.trim());
    await prefs.setString('saved_driver_name', _driverNameCtrl.text.trim());
    await prefs.setString('saved_excursion_name', _excursionNameCtrl.text.trim());
  }

  // 1. INICIAR TRANSMISIÓN GPS EN TIEMPO REAL ("MOSTRAR EN EL MAPA")
  Future<void> _startGpsTransmission() async {
    if (!_formKey.currentState!.validate()) return;
    await _savePreferences();

    // Solicitar permisos de ubicación
    bool serviceEnabled = await Geolocator.isLocationServiceEnabled();
    if (!serviceEnabled) {
      _showSnackBar('Por favor activá el GPS de tu celular.', isError: true);
      return;
    }

    LocationPermission permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied) {
      permission = await Geolocator.requestPermission();
      if (permission == LocationPermission.denied) {
        _showSnackBar('Permiso de GPS denegado.', isError: true);
        return;
      }
    }

    if (permission == LocationPermission.deniedForever) {
      _showSnackBar(
        'El permiso de ubicación está bloqueado. Habilitalo en los Ajustes de la App en tu celular.',
        isError: true,
      );
      return;
    }

    setState(() {
      _isStreaming = true;
      _packetsSent = 0;
      _statusMessage = 'Conectando con GPS y transmitiendo...';
    });

    // Conectar canal broadcast efímero de ultrabaja latencia (Método CCV Lite)
    try {
      _trackingBroadcastChannel = Supabase.instance.client.channel('tracking');
      _trackingBroadcastChannel?.subscribe();
    } catch (e) {
      debugPrint('Error conectando canal broadcast: $e');
    }

    // Configuración de emisión con soporte para segundo plano y pantalla apagada
    late final LocationSettings locationSettings;

    if (defaultTargetPlatform == TargetPlatform.android) {
      locationSettings = AndroidSettings(
        accuracy: LocationAccuracy.bestForNavigation,
        distanceFilter: 0,
        forceLocationManager: true,
        intervalDuration: const Duration(seconds: 2),
        foregroundNotificationConfig: const ForegroundNotificationConfig(
          notificationText: "BariRuta transmitiendo ubicación GPS en tiempo real",
          notificationTitle: "BariRuta Chofer en Servicio",
          enableWakeLock: true,
        ),
      );
    } else {
      locationSettings = const LocationSettings(
        accuracy: LocationAccuracy.bestForNavigation,
        distanceFilter: 0,
      );
    }

    // Obtener posición inicial inmediata
    try {
      final initialPos = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(accuracy: LocationAccuracy.bestForNavigation),
      );
      _currentPosition = initialPos;
      await _sendTelemetryToSupabase(initialPos);
    } catch (e) {
      debugPrint('Error obteniendo posición inicial: $e');
    }

    // 1. Escucha continua por Stream (fuente principal de datos GPS)
    _positionStreamSub = Geolocator.getPositionStream(locationSettings: locationSettings).listen(
      (Position position) async {
        if (!mounted) return;
        setState(() {
          _currentPosition = position;
        });
        await _sendTelemetryToSupabase(position);
      },
      onError: (err) {
        debugPrint('GPS Stream error: $err');
        if (mounted) {
          setState(() {
            _statusMessage = 'Error de GPS: $err';
          });
        }
      },
      cancelOnError: false, // No cancelar ante errores transitorios
    );

    // 2. Timer guardián: dispara SOLO si el stream estuvo más de 3 seg sin enviar
    //    (cubre cortes de GPS o suspensión del stream por el OS)
    _activePulseTimer?.cancel();
    _activePulseTimer = Timer.periodic(const Duration(seconds: 3), (timer) async {
      if (!_isStreaming || !mounted) {
        timer.cancel();
        return;
      }

      // Solo actúa si el stream no envió en los últimos 3 segundos
      final now = DateTime.now();
      final lastSent = _lastSentAt;
      if (lastSent != null && now.difference(lastSent).inSeconds < 3) {
        return; // El stream está activo, no duplicar
      }

      // Stream inactivo — usar la última posición conocida como heartbeat
      final pos = _currentPosition;
      if (pos != null && _isStreaming && mounted) {
        debugPrint('⚡ Timer guardián: stream inactivo, usando última posición conocida');
        await _sendTelemetryToSupabase(pos);
      }
    });

    _listenTouristPickups();
    _showSnackBar('🛰️ Tu combi ya se está mostrando en vivo en el mapa web.');
  }

  // 2. DETENER TRANSMISIÓN ("DEJAR DE MOSTRAR EN EL MAPA")
  Future<void> _stopGpsTransmission() async {
    await _positionStreamSub?.cancel();
    _positionStreamSub = null;
    _activePulseTimer?.cancel();
    _activePulseTimer = null;

    final company = _companyNameCtrl.text.trim();
    final vehicle = _vehicleCodeCtrl.text.trim();

    // Notificar estado inactivo por Broadcast
    try {
      _trackingBroadcastChannel?.sendBroadcastMessage(
        event: 'status',
        payload: {'company_name': company, 'vehicle_code': vehicle, 'active': false},
      );
      _trackingBroadcastChannel?.unsubscribe();
      _trackingBroadcastChannel = null;
    } catch (_) {}

    // 1. Borrado inmediato por HTTP Direct REST
    try {
      final uri = Uri.parse(
        '$kSupabaseUrl/rest/v1/vehicles?company_name=eq.${Uri.encodeComponent(company)}&vehicle_code=eq.${Uri.encodeComponent(vehicle)}',
      );
      await http.delete(
        uri,
        headers: {
          'apikey': kSupabaseAnonKey,
          'Authorization': 'Bearer $kSupabaseAnonKey',
        },
      );
    } catch (e) {
      debugPrint('Error al remover por HTTP: $e');
    }

    // 2. Borrado por SDK Supabase
    try {
      final supabase = Supabase.instance.client;
      await supabase
          .from('vehicles')
          .delete()
          .match({'company_name': company, 'vehicle_code': vehicle});
    } catch (e) {
      debugPrint('Error al remover por SDK: $e');
    }

    setState(() {
      _isStreaming = false;
      _statusMessage = 'Transmisión detenida. Combi retirada del mapa.';
    });

    _showSnackBar('🔴 Transmisión finalizada. La combi se retiró del mapa.');
  }

  // ENVÍO DE COORDENADAS A SUPABASE
  Future<void> _sendTelemetryToSupabase(Position pos) async {
    final company = _companyNameCtrl.text.trim();
    final vehicle = _vehicleCodeCtrl.text.trim();
    if (company.isEmpty || vehicle.isEmpty) return;

    final driver = _driverNameCtrl.text.trim();
    final excursion = _excursionNameCtrl.text.trim();
    final speedKmH = pos.speed > 0 ? pos.speed * 3.6 : 0.0;
    final now = DateTime.now();

    // Registrar timestamp de envío ANTES de cualquier operación async
    // para que el timer guardián no se active innecesariamente
    _lastSentAt = now;

    final payload = {
      'company_name': company,
      'vehicle_code': vehicle,
      'driver_name': driver,
      'excursion_name': excursion.isNotEmpty ? excursion : 'Circuito Chico',
      'lat': pos.latitude,
      'lng': pos.longitude,
      'speed': speedKmH.roundToDouble(),
      'heading': pos.heading.roundToDouble(),
      'status': 'en_camino',
      'updated_at': now.toUtc().toIso8601String(),
    };

    // 0. Broadcast ultra-rápido (baja latencia, para mapa en tiempo real)
    try {
      await _trackingBroadcastChannel?.sendBroadcastMessage(
        event: 'location',
        payload: payload,
      );
    } catch (e) {
      debugPrint('Broadcast send error: $e');
    }

    // 1. Persistencia en Supabase DB (para recarga de página y estado inicial)
    bool sent = false;
    try {
      final supabase = Supabase.instance.client;
      await supabase.from('vehicles').upsert(payload, onConflict: 'company_name,vehicle_code');
      sent = true;
    } catch (_) {}

    // 2. Fallback HTTP directo si el SDK falla
    if (!sent) {
      try {
        final uri = Uri.parse('$kSupabaseUrl/rest/v1/vehicles?on_conflict=company_name,vehicle_code');
        final res = await http.post(
          uri,
          headers: {
            'apikey': kSupabaseAnonKey,
            'Authorization': 'Bearer $kSupabaseAnonKey',
            'Content-Type': 'application/json',
            'Prefer': 'resolution=merge-duplicates',
          },
          body: jsonEncode(payload),
        );
        if (res.statusCode >= 200 && res.statusCode < 300) {
          sent = true;
        } else {
          debugPrint('HTTP fallback status: ${res.statusCode} — ${res.body}');
        }
      } catch (e) {
        debugPrint('Error HTTP PostgREST: $e');
      }
    }

    if (mounted) {
      setState(() {
        _packetsSent++;
        _statusMessage = sent ? 'Emitiendo coordenadas en vivo 🛰️' : '⚠️ Broadcast activo, DB sin confirmar';
        _lastSentTime =
            '${now.hour.toString().padLeft(2, '0')}:${now.minute.toString().padLeft(2, '0')}:${now.second.toString().padLeft(2, '0')}';
      });
    }
  }

  // 3. VER TURISTAS EN TIEMPO REAL
  Future<void> _listenTouristPickups() async {
    final company = _companyNameCtrl.text.trim();
    if (company.isEmpty) return;

    try {
      final supabase = Supabase.instance.client;

      final data = await supabase
          .from('tourist_locations')
          .select()
          .eq('company_name', company)
          .order('updated_at', ascending: false);

      if (mounted) {
        setState(() {
          _touristsWaiting = List<Map<String, dynamic>>.from(data);
        });
      }

      _touristChannel?.unsubscribe();
      _touristChannel = supabase.channel('realtime_driver_tourists').onPostgresChanges(
            event: PostgresChangeEvent.all,
            schema: 'public',
            table: 'tourist_locations',
            callback: (payload) async {
              final refresh = await supabase
                  .from('tourist_locations')
                  .select()
                  .eq('company_name', company)
                  .order('updated_at', ascending: false);
              if (mounted) {
                setState(() {
                  _touristsWaiting = List<Map<String, dynamic>>.from(refresh);
                });
              }
            },
          )..subscribe();
    } catch (e) {
      debugPrint('Error al conectar turistas: $e');
    }
  }

  void _showSnackBar(String msg, {bool isError = false}) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(msg, style: const TextStyle(fontWeight: FontWeight.bold)),
        backgroundColor: isError ? const Color(0xFFE74C3C) : const Color(0xFF00B894),
        behavior: SnackBarBehavior.floating,
        margin: const EdgeInsets.all(16),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      resizeToAvoidBottomInset: true,
      appBar: AppBar(
        title: const Row(
          children: [
            Icon(Icons.directions_bus_rounded, color: Color(0xFF0084FF)),
            SizedBox(width: 10),
            Text(
              'BariRuta Chofer',
              style: TextStyle(fontWeight: FontWeight.w900, letterSpacing: 0.5),
            ),
          ],
        ),
        backgroundColor: const Color(0xFF1E293B),
        elevation: 0,
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
          child: Form(
            key: _formKey,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                // CARD DE ESTADO GPS
                Container(
                  padding: const EdgeInsets.all(20),
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      colors: _isStreaming
                          ? [const Color(0xFF0F392B), const Color(0xFF1B4D3E)]
                          : [const Color(0xFF1E293B), const Color(0xFF0F172A)],
                      begin: Alignment.topLeft,
                      end: Alignment.bottomRight,
                    ),
                    borderRadius: BorderRadius.circular(22),
                    border: Border.all(
                      color: _isStreaming ? const Color(0xFF00B894) : Colors.white12,
                      width: 1.5,
                    ),
                    boxShadow: [
                      BoxShadow(
                        color: _isStreaming
                            ? const Color(0xFF00B894).withValues(alpha: 0.25)
                            : Colors.black26,
                        blurRadius: 15,
                        offset: const Offset(0, 6),
                      ),
                    ],
                  ),
                  child: Column(
                    children: [
                      Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Container(
                            width: 12,
                            height: 12,
                            decoration: BoxDecoration(
                              shape: BoxShape.circle,
                              color: _isStreaming ? const Color(0xFF00B894) : const Color(0xFFE74C3C),
                              boxShadow: [
                                BoxShadow(
                                  color: (_isStreaming ? const Color(0xFF00B894) : const Color(0xFFE74C3C))
                                      .withValues(alpha: 0.6),
                                  blurRadius: 8,
                                  spreadRadius: 2,
                                ),
                              ],
                            ),
                          ),
                          const SizedBox(width: 10),
                          Text(
                            _isStreaming ? 'TRANSMITIENDO EN VIVO' : 'TRANSMISIÓN INACTIVA',
                            style: TextStyle(
                              fontWeight: FontWeight.w900,
                              fontSize: 14,
                              color: _isStreaming ? const Color(0xFF00B894) : const Color(0xFFE74C3C),
                              letterSpacing: 0.8,
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 10),
                      Text(
                        _statusMessage,
                        textAlign: TextAlign.center,
                        style: const TextStyle(fontSize: 12, color: Colors.white70),
                      ),
                      if (_isStreaming && _currentPosition != null) ...[
                        const SizedBox(height: 16),
                        const Divider(color: Colors.white12),
                        const SizedBox(height: 12),
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceAround,
                          children: [
                            _buildStatBadge(
                              icon: Icons.speed_rounded,
                              label: 'Velocidad',
                              value: '${(_currentPosition!.speed * 3.6).round()} km/h',
                              color: const Color(0xFF0084FF),
                            ),
                            _buildStatBadge(
                              icon: Icons.cloud_upload_rounded,
                              label: 'Enviados',
                              value: '$_packetsSent pts',
                              color: const Color(0xFF00B894),
                            ),
                            _buildStatBadge(
                              icon: Icons.access_time_rounded,
                              label: 'Último envío',
                              value: _lastSentTime,
                              color: const Color(0xFFA29BFE),
                            ),
                          ],
                        ),
                      ],
                    ],
                  ),
                ),

                const SizedBox(height: 22),

                // FORMULARIO DE ENTRADA (COMPLETAMENTE LIMPIO Y EN BLANCO)
                Container(
                  padding: const EdgeInsets.all(20),
                  decoration: BoxDecoration(
                    color: const Color(0xFF1E293B),
                    borderRadius: BorderRadius.circular(22),
                    border: Border.all(color: Colors.white12),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Row(
                        children: [
                          Icon(Icons.badge_rounded, color: Color(0xFF0084FF), size: 20),
                          SizedBox(width: 8),
                          Text(
                            'Datos de la Unidad y Chofer',
                            style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800),
                          ),
                        ],
                      ),
                      const SizedBox(height: 16),
                      TextFormField(
                        controller: _companyNameCtrl,
                        enabled: !_isStreaming,
                        style: const TextStyle(fontWeight: FontWeight.w600),
                        decoration: InputDecoration(
                          labelText: 'Empresa',
                          hintText: 'Ej. oscar',
                          filled: true,
                          fillColor: const Color(0xFF0F172A),
                          prefixIcon: const Icon(Icons.business_rounded, color: Color(0xFF0084FF)),
                          border: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: BorderSide.none),
                        ),
                        validator: (v) => v!.trim().isEmpty ? 'Por favor ingresá el nombre de la empresa' : null,
                      ),
                      const SizedBox(height: 12),
                      TextFormField(
                        controller: _vehicleCodeCtrl,
                        enabled: !_isStreaming,
                        style: const TextStyle(fontWeight: FontWeight.w600),
                        decoration: InputDecoration(
                          labelText: 'Código / Nombre de la Unidad',
                          hintText: 'Ej. Combi 1',
                          filled: true,
                          fillColor: const Color(0xFF0F172A),
                          prefixIcon: const Icon(Icons.directions_bus_filled_rounded, color: Color(0xFF0084FF)),
                          border: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: BorderSide.none),
                        ),
                        validator: (v) => v!.trim().isEmpty ? 'Por favor ingresá el nombre o código de la combi' : null,
                      ),
                      const SizedBox(height: 12),
                      TextFormField(
                        controller: _driverNameCtrl,
                        enabled: !_isStreaming,
                        style: const TextStyle(fontWeight: FontWeight.w600),
                        decoration: InputDecoration(
                          labelText: 'Nombre del Chofer',
                          hintText: 'Ej. osky',
                          filled: true,
                          fillColor: const Color(0xFF0F172A),
                          prefixIcon: const Icon(Icons.person_rounded, color: Color(0xFF0084FF)),
                          border: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: BorderSide.none),
                        ),
                        validator: (v) => v!.trim().isEmpty ? 'Por favor ingresá tu nombre' : null,
                      ),
                      const SizedBox(height: 12),
                      TextFormField(
                        controller: _excursionNameCtrl,
                        enabled: !_isStreaming,
                        style: const TextStyle(fontWeight: FontWeight.w600),
                        decoration: InputDecoration(
                          labelText: 'Excursión Actual (Opcional)',
                          hintText: 'Ej. Circuito chico',
                          filled: true,
                          fillColor: const Color(0xFF0F172A),
                          prefixIcon: const Icon(Icons.map_rounded, color: Color(0xFF0084FF)),
                          border: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: BorderSide.none),
                        ),
                      ),
                    ],
                  ),
                ),

                const SizedBox(height: 22),

                // BOTONES DE ACCIÓN PRINCIPALES
                if (!_isStreaming)
                  ElevatedButton.icon(
                    onPressed: _startGpsTransmission,
                    icon: const Icon(Icons.satellite_alt_rounded, color: Colors.white, size: 24),
                    label: const Text(
                      'MOSTRAR EN EL MAPA',
                      style: TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.w900,
                        color: Colors.white,
                        letterSpacing: 0.5,
                      ),
                    ),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: const Color(0xFF00B894),
                      padding: const EdgeInsets.symmetric(vertical: 18),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
                      elevation: 4,
                      shadowColor: const Color(0xFF00B894).withValues(alpha: 0.4),
                    ),
                  )
                else
                  ElevatedButton.icon(
                    onPressed: _stopGpsTransmission,
                    icon: const Icon(Icons.stop_circle_rounded, color: Colors.white, size: 24),
                    label: const Text(
                      'DEJAR DE MOSTRAR EN EL MAPA',
                      style: TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.w900,
                        color: Colors.white,
                        letterSpacing: 0.5,
                      ),
                    ),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: const Color(0xFFE74C3C),
                      padding: const EdgeInsets.symmetric(vertical: 18),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
                      elevation: 4,
                      shadowColor: const Color(0xFFE74C3C).withValues(alpha: 0.4),
                    ),
                  ),

                const SizedBox(height: 28),

                // SECCIÓN: TURISTAS ESPERANDO PARADA
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    const Row(
                      children: [
                        Icon(Icons.person_pin_circle_rounded, color: Color(0xFFFF7675), size: 22),
                        SizedBox(width: 8),
                        Text(
                          'Turistas Esperando Parada',
                          style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800),
                        ),
                      ],
                    ),
                    IconButton(
                      icon: const Icon(Icons.refresh_rounded, color: Colors.white70),
                      onPressed: _listenTouristPickups,
                      tooltip: 'Actualizar',
                    ),
                  ],
                ),
                const SizedBox(height: 10),

                if (_touristsWaiting.isEmpty)
                  Container(
                    padding: const EdgeInsets.all(24),
                    decoration: BoxDecoration(
                      color: const Color(0xFF1E293B),
                      borderRadius: BorderRadius.circular(18),
                      border: Border.all(color: Colors.white12),
                    ),
                    child: const Center(
                      child: Text(
                        'No hay turistas esperando parada en este momento.',
                        style: TextStyle(color: Colors.white54, fontSize: 13, fontWeight: FontWeight.w600),
                      ),
                    ),
                  )
                else
                  ListView.builder(
                    shrinkWrap: true,
                    physics: const NeverScrollableScrollPhysics(),
                    itemCount: _touristsWaiting.length,
                    itemBuilder: (ctx, index) {
                      final t = _touristsWaiting[index];
                      final tName = t['tourist_name'] ?? 'Turista';
                      final tNotes = t['hotel_notes'] ?? 'Esperando combi';
                      final tLat = (t['lat'] as num?)?.toDouble();
                      final tLng = (t['lng'] as num?)?.toDouble();

                      return Container(
                        margin: const EdgeInsets.only(bottom: 12),
                        padding: const EdgeInsets.all(14),
                        decoration: BoxDecoration(
                          color: const Color(0xFF1E293B),
                          borderRadius: BorderRadius.circular(16),
                          border: Border.all(color: Colors.white12),
                        ),
                        child: Row(
                          children: [
                            Container(
                              width: 44,
                              height: 44,
                              decoration: BoxDecoration(
                                shape: BoxShape.circle,
                                color: const Color(0xFFFF7675).withValues(alpha: 0.2),
                              ),
                              child: const Icon(Icons.person_pin_circle, color: Color(0xFFFF7675)),
                            ),
                            const SizedBox(width: 14),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(tName, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 15)),
                                  const SizedBox(height: 2),
                                  Text(tNotes, style: const TextStyle(color: Colors.white70, fontSize: 13)),
                                ],
                              ),
                            ),
                            if (tLat != null && tLng != null)
                              IconButton(
                                icon: const Icon(Icons.directions_rounded, color: Color(0xFF0084FF), size: 28),
                                tooltip: 'Abrir en Google Maps',
                                onPressed: () async {
                                  final uri = Uri.parse(
                                    'https://www.google.com/maps/dir/?api=1&destination=$tLat,$tLng',
                                  );
                                  if (await canLaunchUrl(uri)) {
                                    await launchUrl(uri, mode: LaunchMode.externalApplication);
                                  }
                                },
                              ),
                          ],
                        ),
                      );
                    },
                  ),
                const SizedBox(height: 20),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildStatBadge({
    required IconData icon,
    required String label,
    required String value,
    required Color color,
  }) {
    return Column(
      children: [
        Icon(icon, color: color, size: 22),
        const SizedBox(height: 4),
        Text(
          value,
          style: TextStyle(fontSize: 16, fontWeight: FontWeight.w900, color: color),
        ),
        Text(
          label,
          style: const TextStyle(fontSize: 11, color: Colors.white60, fontWeight: FontWeight.w600),
        ),
      ],
    );
  }
}
