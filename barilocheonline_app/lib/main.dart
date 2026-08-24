import 'dart:async';
import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:geolocator/geolocator.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:url_launcher/url_launcher.dart';

// CREDENCIALES SUPABASE REALES Y 100% AUTOMÁTICAS (INVISIBLE PARA EL CHOFER)
const String kSupabaseUrl = 'https://pwrlbwplpgzirlcrwepi.supabase.co';
const String kSupabaseAnonKey =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB3cmxid3BscGd6aXJsY3J3ZXBpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzMzc0NzAsImV4cCI6MjA4NjkxMzQ3MH0.HxEfbABTObu4khKxVhtBaBuCt2RDBm34urnSEJCfJUU';

const String kApiBaseUrl = 'https://bariloche.online/save_alojamiento.php';

final FlutterLocalNotificationsPlugin _localNotifications = FlutterLocalNotificationsPlugin();

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
      home: const DriverRootScreen(),
    );
  }
}

class DriverRootScreen extends StatefulWidget {
  const DriverRootScreen({super.key});

  @override
  State<DriverRootScreen> createState() => _DriverRootScreenState();
}

class _DriverRootScreenState extends State<DriverRootScreen> {
  bool _checkingSession = true;
  Map<String, dynamic>? _driverProfile;

  // Controllers de Login
  final _usernameCtrl = TextEditingController();
  final _passwordCtrl = TextEditingController();
  bool _obscurePassword = true;
  bool _loggingIn = false;
  String? _loginError;

  // Controllers de Transmisión Activa y Butacas
  final _excursionNameCtrl = TextEditingController();
  int _availableSeats = 15; // Butacas libres dinámicas

  bool _isStreaming = false;
  StreamSubscription<Position>? _positionStreamSub;
  Timer? _activePulseTimer;
  Position? _currentPosition;
  int _packetsSent = 0;
  String _lastSentTime = '--:--:--';
  String _statusMessage = 'Listo para iniciar transmisión';
  DateTime? _lastSentAt;

  List<Map<String, dynamic>> _touristsWaiting = [];
  RealtimeChannel? _touristChannel;
  RealtimeChannel? _trackingBroadcastChannel;
  Timer? _pickupPollTimer;

  @override
  void initState() {
    super.initState();
    _initNotifications();
    _checkSavedSession();
  }

  Future<void> _initNotifications() async {
    try {
      const AndroidInitializationSettings initializationSettingsAndroid =
          AndroidInitializationSettings('@mipmap/ic_launcher');
      const InitializationSettings initializationSettings =
          InitializationSettings(android: initializationSettingsAndroid);
      await _localNotifications.initialize(settings: initializationSettings);

      const AndroidNotificationChannel channel = AndroidNotificationChannel(
        'bariruta_pickups_channel',
        'Alertas de Pasajeros BariRuta',
        description: 'Notificaciones de nuevos pasajeros en la combi en tiempo real',
        importance: Importance.max,
        playSound: true,
        enableVibration: true,
      );

      final androidPlugin = _localNotifications.resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>();
      await androidPlugin?.createNotificationChannel(channel);
      await androidPlugin?.requestNotificationsPermission();
    } catch (e) {
      debugPrint('Error init notifications: $e');
    }
  }

  Future<void> _showSystemNotification(String name, String address, int passengers) async {
    try {
      const AndroidNotificationDetails androidDetails = AndroidNotificationDetails(
        'bariruta_pickups_channel',
        'Alertas de Pasajeros BariRuta',
        channelDescription: 'Notificaciones de nuevos pasajeros en tiempo real',
        importance: Importance.max,
        priority: Priority.high,
        showWhen: true,
        enableVibration: true,
        playSound: true,
      );

      const NotificationDetails platformDetails = NotificationDetails(android: androidDetails);

      await _localNotifications.show(
        id: DateTime.now().millisecondsSinceEpoch ~/ 1000,
        title: '🔔 ¡NUEVO PASAJERO: $name!',
        body: '📍 $address ($passengers persona${passengers > 1 ? "s" : ""})',
        notificationDetails: platformDetails,
      );
    } catch (e) {
      debugPrint('Error showing push notification: $e');
    }
  }

  @override
  void dispose() {
    _positionStreamSub?.cancel();
    _activePulseTimer?.cancel();
    _touristChannel?.unsubscribe();
    _trackingBroadcastChannel?.unsubscribe();
    _usernameCtrl.dispose();
    _passwordCtrl.dispose();
    _excursionNameCtrl.dispose();
    super.dispose();
  }

  Future<void> _checkSavedSession() async {
    final prefs = await SharedPreferences.getInstance();
    final savedUser = prefs.getString('saved_driver_user');
    final savedPass = prefs.getString('saved_driver_pass');

    if (savedUser != null && savedPass != null && savedUser.isNotEmpty && savedPass.isNotEmpty) {
      final cachedProfile = prefs.getString('saved_driver_profile');
      if (cachedProfile != null) {
        try {
          final profile = jsonDecode(cachedProfile);
          setState(() {
            _driverProfile = Map<String, dynamic>.from(profile);
            _checkingSession = false;
          });
          _listenTouristPickups();
          return;
        } catch (_) {}
      }
      await _performLogin(savedUser, savedPass, silent: true);
    } else {
      setState(() => _checkingSession = false);
    }
  }

  Future<void> _performLogin(String username, String password, {bool silent = false}) async {
    if (!silent) {
      setState(() {
        _loggingIn = true;
        _loginError = null;
      });
    }

    try {
      final res = await http.post(
        Uri.parse('$kApiBaseUrl?action=driver_login'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({
          'usuario': username.trim(),
          'password': password.trim(),
        }),
      );

      final data = jsonDecode(res.body);

      if (res.statusCode == 200 && data['status'] == 'success') {
        final prefs = await SharedPreferences.getInstance();
        await prefs.setString('saved_driver_user', username.trim());
        await prefs.setString('saved_driver_pass', password.trim());
        await prefs.setString('saved_driver_profile', jsonEncode(data));

        if (mounted) {
          setState(() {
            _driverProfile = Map<String, dynamic>.from(data);
            _loggingIn = false;
            _checkingSession = false;
            _loginError = null;
          });
          _listenTouristPickups();
        }
      } else {
        if (mounted) {
          setState(() {
            _loginError = data['message'] ?? 'Usuario o contraseña incorrectos.';
            _loggingIn = false;
            _checkingSession = false;
          });
        }
      }
    } catch (e) {
      debugPrint('Error en login chofer: $e');
      if (mounted) {
        setState(() {
          _loginError = 'Error de conexión con el servidor.';
          _loggingIn = false;
          _checkingSession = false;
        });
      }
    }
  }

  Future<void> _logout() async {
    if (_isStreaming) {
      await _stopGpsTransmission();
    }
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove('saved_driver_user');
    await prefs.remove('saved_driver_pass');
    await prefs.remove('saved_driver_profile');

    setState(() {
      _driverProfile = null;
      _touristsWaiting = [];
      _usernameCtrl.clear();
      _passwordCtrl.clear();
    });
  }

  Future<void> _startGpsTransmission() async {
    if (_driverProfile == null) return;

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
        'El permiso de GPS está bloqueado en Ajustes de la App.',
        isError: true,
      );
      return;
    }

    setState(() {
      _isStreaming = true;
      _packetsSent = 0;
      _statusMessage = 'Conectando con GPS y transmitiendo...';
    });

    try {
      _trackingBroadcastChannel = Supabase.instance.client.channel('tracking');
      _trackingBroadcastChannel?.subscribe();
    } catch (e) {
      debugPrint('Error conectando canal broadcast: $e');
    }

    late final LocationSettings locationSettings;
    if (defaultTargetPlatform == TargetPlatform.android) {
      locationSettings = AndroidSettings(
        accuracy: LocationAccuracy.bestForNavigation,
        distanceFilter: 0,
        forceLocationManager: true,
        intervalDuration: const Duration(seconds: 1),
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

    try {
      final initialPos = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(accuracy: LocationAccuracy.bestForNavigation),
      );
      _currentPosition = initialPos;
      await _sendTelemetryToSupabase(initialPos);
    } catch (e) {
      debugPrint('Error posición inicial: $e');
    }

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
      },
      cancelOnError: false,
    );

    _activePulseTimer?.cancel();
    _activePulseTimer = Timer.periodic(const Duration(milliseconds: 1500), (timer) async {
      if (!_isStreaming || !mounted) {
        timer.cancel();
        return;
      }
      final pos = _currentPosition;
      if (pos != null && _isStreaming && mounted) {
        await _sendTelemetryToSupabase(pos);
      }
    });

    _listenTouristPickups();
    _showSnackBar('🛰️ Tu combi ya se está mostrando en vivo en el mapa web.');
  }

  Future<void> _stopGpsTransmission() async {
    await _positionStreamSub?.cancel();
    _positionStreamSub = null;
    _activePulseTimer?.cancel();
    _activePulseTimer = null;

    final company = _driverProfile?['company_name'] ?? '';
    final vehicle = _driverProfile?['vehicle_code'] ?? '';

    try {
      await _trackingBroadcastChannel?.sendBroadcastMessage(
        event: 'status',
        payload: {'company_name': company, 'vehicle_code': vehicle, 'active': false},
      );
    } catch (e) {
      debugPrint('Broadcast stop error: $e');
    } finally {
      _trackingBroadcastChannel?.unsubscribe();
      _trackingBroadcastChannel = null;
    }

    if (mounted) {
      setState(() {
        _isStreaming = false;
        _statusMessage = 'Transmisión detenida. Combi retirada del mapa.';
      });
    }

    _showSnackBar('🔴 Transmisión finalizada. Combi retirada del mapa.');
    await _deleteVehicleFromDB(company, vehicle);
  }

  Future<void> _deleteVehicleFromDB(String company, String vehicle) async {
    try {
      final supabase = Supabase.instance.client;
      await supabase.from('vehicles').delete().match({
        'company_name': company,
        'vehicle_code': vehicle,
      });
    } catch (_) {}

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
    } catch (_) {}
  }

  Future<void> _sendTelemetryToSupabase(Position pos) async {
    if (_driverProfile == null) return;

    final company   = _driverProfile!['company_name'] ?? '';
    final vehicle   = _driverProfile!['vehicle_code'] ?? '';
    final driver    = _driverProfile!['driver_name'] ?? '';
    final excursion = _excursionNameCtrl.text.trim();
    final speedKmH  = pos.speed > 0 ? pos.speed * 3.6 : 0.0;
    final now       = DateTime.now();

    _lastSentAt = now;

    final payload = {
      'company_name': company,
      'vehicle_code': vehicle,
      'driver_name': driver,
      'lat': pos.latitude,
      'lng': pos.longitude,
      'speed': speedKmH.roundToDouble(),
      'heading': pos.heading.roundToDouble(),
      'available_seats': _availableSeats,
      'status': 'en_camino',
      'updated_at': now.toUtc().toIso8601String(),
    };

    try {
      await _trackingBroadcastChannel?.sendBroadcastMessage(
        event: 'location',
        payload: payload,
      );
    } catch (_) {}

    try {
      final supabase = Supabase.instance.client;
      await supabase.from('vehicles').upsert(payload, onConflict: 'company_name,vehicle_code');
    } catch (_) {
      try {
        final uri = Uri.parse('$kSupabaseUrl/rest/v1/vehicles?on_conflict=company_name,vehicle_code');
        await http.post(
          uri,
          headers: {
            'apikey': kSupabaseAnonKey,
            'Authorization': 'Bearer $kSupabaseAnonKey',
            'Content-Type': 'application/json',
            'Prefer': 'resolution=merge-duplicates',
          },
          body: jsonEncode(payload),
        );
      } catch (_) {}
    }

    if (mounted) {
      setState(() {
        _packetsSent++;
        _statusMessage = 'Emitiendo coordenadas en vivo 🛰️';
        _lastSentTime =
            '${now.hour.toString().padLeft(2, '0')}:${now.minute.toString().padLeft(2, '0')}:${now.second.toString().padLeft(2, '0')}';
      });
    }
  }

  Future<void> _listenTouristPickups() async {
    final company = _driverProfile?['company_name'] ?? '';
    if (company.isEmpty) return;

    await _fetchDriverPickups();

    _pickupPollTimer?.cancel();
    _pickupPollTimer = Timer.periodic(const Duration(seconds: 3), (timer) {
      if (!mounted || !_isStreaming) {
        return;
      }
      _fetchDriverPickups();
    });
  }

  Future<void> _fetchDriverPickups() async {
    final company = _driverProfile?['company_name'] ?? '';
    if (company.isEmpty) return;

    try {
      final uri = Uri.parse(
        'https://bariloche.online/save_alojamiento.php?action=get_driver_pickups&company=${Uri.encodeComponent(company)}&t=${DateTime.now().millisecondsSinceEpoch}',
      );
      final res = await http.get(uri);
      if (res.statusCode == 200) {
        final data = jsonDecode(res.body);
        if (data['status'] == 'success' && data['pickups'] != null) {
          final List<Map<String, dynamic>> newPickups = List<Map<String, dynamic>>.from(data['pickups']);
          if (!mounted) return;

          final oldIds = _touristsWaiting.map((e) => (e['ticket_id'] ?? e['id'] ?? '').toString()).toSet();
          for (final p in newPickups) {
            final pid = (p['ticket_id'] ?? p['id'] ?? '').toString();
            if (!oldIds.contains(pid) && (p['status'] == 'pagado' || p['status'] == null)) {
              _notifyNewPassenger(p);
              break;
            }
          }

          setState(() {
            _touristsWaiting = newPickups;
          });
        }
      }
    } catch (e) {
      debugPrint('Error obteniendo pickups: $e');
    }
  }

  void _notifyNewPassenger(Map<String, dynamic> p) {
    final name = p['tourist_name'] ?? 'Nuevo Pasajero';
    final address = p['address'] ?? p['pickup_address'] ?? 'Punto de recogida';
    final count = p['passengers'] is int ? p['passengers'] as int : int.tryParse('${p['passengers']}') ?? 1;

    // Disparar Notificación Push / Tray del Sistema Android
    _showSystemNotification(name, address, count);

    // Ajustar butacas disponibles dinámicamente
    if (_availableSeats >= count) {
      setState(() {
        _availableSeats -= count;
      });
      if (_currentPosition != null && _isStreaming) {
        _sendTelemetryToSupabase(_currentPosition!);
      }
    }

    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (ctx) => AlertDialog(
        backgroundColor: const Color(0xFF1E293B),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        title: const Row(
          children: [
            Icon(Icons.notifications_active_rounded, color: Color(0xFF00B894), size: 28),
            SizedBox(width: 10),
            Expanded(
              child: Text(
                '¡NUEVO PASAJERO ASIGNADO!',
                style: TextStyle(fontWeight: FontWeight.w900, fontSize: 16, color: Color(0xFF00B894)),
              ),
            ),
          ],
        ),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('👤 Pasajero: $name', style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 15)),
            const SizedBox(height: 6),
            Text('📍 Recogida: $address', style: const TextStyle(color: Colors.white70, fontSize: 14)),
            const SizedBox(height: 6),
            Text('👥 Personas: $count ticket(s)', style: const TextStyle(color: Color(0xFF0084FF), fontWeight: FontWeight.w700)),
            const SizedBox(height: 10),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
              decoration: BoxDecoration(
                color: const Color(0xFF00B894).withValues(alpha: 0.2),
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: const Color(0xFF00B894)),
              ),
              child: const Text('💳 TICKET PAGADO / CONFIRMADO', style: TextStyle(color: Color(0xFF00B894), fontWeight: FontWeight.w900, fontSize: 12)),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Entendido', style: TextStyle(color: Colors.white70)),
          ),
          ElevatedButton.icon(
            icon: const Icon(Icons.navigation_rounded, size: 18),
            label: const Text('IR A BUSCAR (MAPA)'),
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFF0084FF),
              foregroundColor: Colors.white,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
            ),
            onPressed: () {
              Navigator.pop(ctx);
              final lat = (p['lat'] ?? p['pickup_lat'] as num?)?.toDouble();
              final lng = (p['lng'] ?? p['pickup_lng'] as num?)?.toDouble();
              if (lat != null && lng != null) {
                _launchNavigation(lat, lng);
              }
            },
          ),
        ],
      ),
    );
  }

  Future<void> _launchNavigation(double lat, double lng) async {
    final uri = Uri.parse('https://www.google.com/maps/dir/?api=1&destination=$lat,$lng');
    try {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    } catch (e) {
      _showSnackBar('No se pudo abrir el mapa: $e', isError: true);
    }
  }

  Future<void> _launchWhatsApp(String phone, String passengerName) async {
    String clean = phone.replaceAll(RegExp(r'\D'), '');
    if (clean.length == 10 && clean.startsWith('294')) {
      clean = '549$clean';
    } else if (!clean.startsWith('54') && clean.length >= 8) {
      clean = '549$clean';
    }
    final text = '¡Hola $passengerName! 👋 Te contactamos de la combi de Bariloche.Online. Ya estamos en camino a tu punto de recogida.';
    final uri = Uri.parse('https://wa.me/$clean?text=${Uri.encodeComponent(text)}');
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    }
  }

  Future<void> _markPassengerBoarded(dynamic item) async {
    final ticketId = (item is Map) ? (item['ticket_id'] ?? item['id'] ?? '') : item.toString();
    try {
      await http.post(
        Uri.parse('https://bariloche.online/save_alojamiento.php?action=complete_ticket_pickup'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({'ticket_id': ticketId}),
      );
    } catch (_) {}

    setState(() {
      _touristsWaiting.removeWhere((t) => (t['ticket_id'] ?? t['id'] ?? '') == ticketId);
    });

    _showSnackBar('✅ Pasajero marcado como a bordo');
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
    if (_checkingSession) {
      return const Scaffold(
        body: Center(
          child: CircularProgressIndicator(color: Color(0xFF0084FF)),
        ),
      );
    }

    if (_driverProfile == null) {
      return _buildLoginView();
    }

    return _buildDashboardView();
  }

  Widget _buildLoginView() {
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 20),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Container(
                  width: 80,
                  height: 80,
                  decoration: BoxDecoration(
                    color: const Color(0xFF0084FF).withValues(alpha: 0.15),
                    shape: BoxShape.circle,
                    border: Border.all(color: const Color(0xFF0084FF), width: 2),
                  ),
                  child: const Center(
                    child: Icon(Icons.directions_bus_rounded, color: Color(0xFF0084FF), size: 40),
                  ),
                ),
                const SizedBox(height: 20),
                const Text(
                  'BariRuta Chofer',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    fontSize: 26,
                    fontWeight: FontWeight.w900,
                    letterSpacing: 0.5,
                  ),
                ),
                const SizedBox(height: 6),
                const Text(
                  'Ingresá con el usuario y contraseña asignados por tu empresa de excursiones en Bariloche.Online.',
                  textAlign: TextAlign.center,
                  style: TextStyle(fontSize: 13, color: Colors.white70),
                ),
                const SizedBox(height: 32),

                if (_loginError != null) ...[
                  Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: const Color(0xFFE74C3C).withValues(alpha: 0.15),
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: const Color(0xFFE74C3C)),
                    ),
                    child: Row(
                      children: [
                        const Icon(Icons.error_outline_rounded, color: Color(0xFFE74C3C), size: 20),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Text(
                            _loginError!,
                            style: const TextStyle(color: Color(0xFFFF7675), fontSize: 13, fontWeight: FontWeight.w600),
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 18),
                ],

                Container(
                  padding: const EdgeInsets.all(22),
                  decoration: BoxDecoration(
                    color: const Color(0xFF1E293B),
                    borderRadius: BorderRadius.circular(22),
                    border: Border.all(color: Colors.white12),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      TextFormField(
                        controller: _usernameCtrl,
                        decoration: InputDecoration(
                          labelText: 'Usuario del Chofer',
                          hintText: 'Ej. chofer1',
                          filled: true,
                          fillColor: const Color(0xFF0F172A),
                          prefixIcon: const Icon(Icons.person_rounded, color: Color(0xFF0084FF)),
                          border: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: BorderSide.none),
                        ),
                      ),
                      const SizedBox(height: 14),
                      TextFormField(
                        controller: _passwordCtrl,
                        obscureText: _obscurePassword,
                        decoration: InputDecoration(
                          labelText: 'Contraseña / PIN',
                          hintText: '••••',
                          filled: true,
                          fillColor: const Color(0xFF0F172A),
                          prefixIcon: const Icon(Icons.lock_rounded, color: Color(0xFF0084FF)),
                          suffixIcon: IconButton(
                            icon: Icon(
                              _obscurePassword ? Icons.visibility_off_rounded : Icons.visibility_rounded,
                              color: Colors.white54,
                            ),
                            onPressed: () => setState(() => _obscurePassword = !_obscurePassword),
                          ),
                          border: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: BorderSide.none),
                        ),
                      ),
                      const SizedBox(height: 22),
                      ElevatedButton(
                        onPressed: _loggingIn
                            ? null
                            : () {
                                if (_usernameCtrl.text.trim().isEmpty || _passwordCtrl.text.trim().isEmpty) {
                                  setState(() => _loginError = 'Completá usuario y contraseña.');
                                  return;
                                }
                                _performLogin(_usernameCtrl.text, _passwordCtrl.text);
                              },
                        style: ElevatedButton.styleFrom(
                          backgroundColor: const Color(0xFF0084FF),
                          padding: const EdgeInsets.symmetric(vertical: 16),
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                          elevation: 4,
                        ),
                        child: _loggingIn
                            ? const SizedBox(
                                height: 22,
                                width: 22,
                                child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2.5),
                              )
                            : const Text(
                                'INGRESAR COMO CHOFER',
                                style: TextStyle(
                                  fontSize: 15,
                                  fontWeight: FontWeight.w900,
                                  color: Colors.white,
                                  letterSpacing: 0.5,
                                ),
                              ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 20),
                const Text(
                  'Si aún no tienes usuario, pídeselo al administrador de tu empresa de excursiones.',
                  textAlign: TextAlign.center,
                  style: TextStyle(fontSize: 11, color: Colors.white54),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildDashboardView() {
    final company = _driverProfile?['company_name'] ?? 'Empresa';
    final driver  = _driverProfile?['driver_name'] ?? 'Chofer';
    final brand   = _driverProfile?['vehicle_brand'] ?? 'Combi';
    final plate   = _driverProfile?['vehicle_plate'] ?? '---';

    return Scaffold(
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
        actions: [
          IconButton(
            icon: const Icon(Icons.logout_rounded, color: Colors.white70),
            tooltip: 'Cerrar Sesión',
            onPressed: () {
              showDialog(
                context: context,
                builder: (ctx) => AlertDialog(
                  backgroundColor: const Color(0xFF1E293B),
                  title: const Text('¿Cerrar Sesión?'),
                  content: const Text('Se detendrá la transmisión GPS y saldrás de tu cuenta de chofer.'),
                  actions: [
                    TextButton(
                      onPressed: () => Navigator.pop(ctx),
                      child: const Text('Cancelar', style: TextStyle(color: Colors.white70)),
                    ),
                    ElevatedButton(
                      style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFFE74C3C)),
                      onPressed: () {
                        Navigator.pop(ctx);
                        _logout();
                      },
                      child: const Text('Salir', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
                    ),
                  ],
                ),
              );
            },
          ),
        ],
        backgroundColor: const Color(0xFF1E293B),
        elevation: 0,
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Container(
                padding: const EdgeInsets.all(18),
                decoration: BoxDecoration(
                  color: const Color(0xFF1E293B),
                  borderRadius: BorderRadius.circular(20),
                  border: Border.all(color: const Color(0xFF0084FF).withValues(alpha: 0.4), width: 1.5),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Container(
                          padding: const EdgeInsets.all(8),
                          decoration: BoxDecoration(
                            color: const Color(0xFF0084FF).withValues(alpha: 0.15),
                            borderRadius: BorderRadius.circular(10),
                          ),
                          child: const Icon(Icons.verified_user_rounded, color: Color(0xFF0084FF), size: 20),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                company,
                                style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 16, color: Colors.white),
                              ),
                              const Text(
                                'Empresa Habilitada en Bariloche.Online',
                                style: TextStyle(fontSize: 11, color: Color(0xFF00B894), fontWeight: FontWeight.w700),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                    const Divider(color: Colors.white12, height: 24),
                    Row(
                      children: [
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              const Text('CHOFER', style: TextStyle(fontSize: 10, color: Colors.white54, fontWeight: FontWeight.w700)),
                              const SizedBox(height: 2),
                              Text(driver, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.bold)),
                            ],
                          ),
                        ),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              const Text('VEHÍCULO / UNIDAD', style: TextStyle(fontSize: 10, color: Colors.white54, fontWeight: FontWeight.w700)),
                              const SizedBox(height: 2),
                              Text('$brand (***$plate)', style: const TextStyle(fontSize: 14, fontWeight: FontWeight.bold)),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),

              const SizedBox(height: 18),

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

              const SizedBox(height: 18),

              // SELECTOR DINÁMICO DE BUTACAS / ASIENTOS LIBRES
              Container(
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: const Color(0xFF1E293B),
                  borderRadius: BorderRadius.circular(18),
                  border: Border.all(color: const Color(0xFF0084FF).withValues(alpha: 0.35)),
                ),
                child: Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.all(10),
                      decoration: BoxDecoration(
                        color: const Color(0xFF0084FF).withValues(alpha: 0.15),
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: const Icon(Icons.event_seat_rounded, color: Color(0xFF0084FF), size: 26),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text('Butacas Disponibles', style: TextStyle(color: Colors.white70, fontSize: 12, fontWeight: FontWeight.w600)),
                          Text(
                            _availableSeats > 0 ? '$_availableSeats libres en la combi' : '🔴 Combi Completa',
                            style: TextStyle(
                              fontWeight: FontWeight.w900,
                              fontSize: 15,
                              color: _availableSeats > 0 ? const Color(0xFF00B894) : const Color(0xFFE74C3C),
                            ),
                          ),
                        ],
                      ),
                    ),
                    IconButton(
                      icon: const Icon(Icons.remove_circle_rounded, color: Colors.white70, size: 30),
                      tooltip: 'Restar butaca libre',
                      onPressed: () {
                        if (_availableSeats > 0) {
                          setState(() => _availableSeats--);
                          if (_currentPosition != null && _isStreaming) {
                            _sendTelemetryToSupabase(_currentPosition!);
                          }
                        }
                      },
                    ),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
                      decoration: BoxDecoration(
                        color: const Color(0xFF0F172A),
                        borderRadius: BorderRadius.circular(10),
                        border: Border.all(color: const Color(0xFF0084FF)),
                      ),
                      child: Text(
                        '$_availableSeats',
                        style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 18, color: Color(0xFF0084FF)),
                      ),
                    ),
                    IconButton(
                      icon: const Icon(Icons.add_circle_rounded, color: Color(0xFF0084FF), size: 30),
                      tooltip: 'Sumar butaca libre',
                      onPressed: () {
                        setState(() => _availableSeats++);
                        if (_currentPosition != null && _isStreaming) {
                          _sendTelemetryToSupabase(_currentPosition!);
                        }
                      },
                    ),
                  ],
                ),
              ),

              const SizedBox(height: 14),

              TextFormField(
                controller: _excursionNameCtrl,
                enabled: !_isStreaming,
                style: const TextStyle(fontWeight: FontWeight.w600),
                decoration: InputDecoration(
                  labelText: 'Excursión / Recorrido Actual (Opcional)',
                  hintText: 'Ej. Circuito Chico, Cerro Catedral',
                  filled: true,
                  fillColor: const Color(0xFF1E293B),
                  prefixIcon: const Icon(Icons.map_rounded, color: Color(0xFF0084FF)),
                  border: OutlineInputBorder(borderRadius: BorderRadius.circular(16), borderSide: BorderSide.none),
                ),
              ),

              const SizedBox(height: 20),

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

              const SizedBox(height: 26),

              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Row(
                    children: [
                      const Icon(Icons.person_pin_circle_rounded, color: Color(0xFFFF7675), size: 22),
                      const SizedBox(width: 8),
                      Text(
                        'Pasajeros & Hoja de Ruta (${_touristsWaiting.length})',
                        style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800),
                      ),
                    ],
                  ),
                  IconButton(
                    icon: const Icon(Icons.refresh_rounded, color: Colors.white70),
                    onPressed: _listenTouristPickups,
                    tooltip: 'Actualizar lista',
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
                    child: Column(
                      children: [
                        Icon(Icons.check_circle_outline_rounded, color: Color(0xFF00B894), size: 36),
                        SizedBox(height: 8),
                        Text(
                          'No hay pasajeros pendientes de recogida en este momento.',
                          textAlign: TextAlign.center,
                          style: TextStyle(color: Colors.white70, fontSize: 13, fontWeight: FontWeight.w600),
                        ),
                      ],
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
                    final tId = t['id'];
                    final tName = t['tourist_name'] ?? 'Pasajero';
                    final tPhone = t['tourist_phone'] ?? '';
                    final tAddress = t['address'] ?? t['pickup_address'] ?? t['hotel_notes'] ?? 'Punto de recogida';
                    final tPassengers = t['passengers'] ?? 1;
                    final tLat = (t['lat'] ?? t['pickup_lat'] as num?)?.toDouble();
                    final tLng = (t['lng'] ?? t['pickup_lng'] as num?)?.toDouble();

                    String distanceText = '';
                    if (_currentPosition != null && tLat != null && tLng != null) {
                      final meters = Geolocator.distanceBetween(
                        _currentPosition!.latitude,
                        _currentPosition!.longitude,
                        tLat,
                        tLng,
                      );
                      if (meters >= 1000) {
                        distanceText = ' • A ${(meters / 1000).toStringAsFixed(1)} km';
                      } else {
                        distanceText = ' • A ${meters.round()} m';
                      }
                    }

                    return Container(
                      margin: const EdgeInsets.only(bottom: 16),
                      padding: const EdgeInsets.all(16),
                      decoration: BoxDecoration(
                        color: const Color(0xFF1E293B),
                        borderRadius: BorderRadius.circular(20),
                        border: Border.all(color: const Color(0xFF0084FF).withValues(alpha: 0.5), width: 1.5),
                        boxShadow: [
                          BoxShadow(
                            color: Colors.black.withValues(alpha: 0.3),
                            blurRadius: 10,
                            offset: const Offset(0, 4),
                          ),
                        ],
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              Container(
                                width: 44,
                                height: 44,
                                decoration: BoxDecoration(
                                  shape: BoxShape.circle,
                                  color: const Color(0xFF00B894).withValues(alpha: 0.2),
                                ),
                                child: const Icon(Icons.person_pin_circle_rounded, color: Color(0xFF00B894), size: 26),
                              ),
                              const SizedBox(width: 12),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      tName,
                                      style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 16, color: Colors.white),
                                    ),
                                    Text(
                                      '$tPassengers pasajero(s)$distanceText',
                                      style: const TextStyle(color: Color(0xFF0084FF), fontSize: 12, fontWeight: FontWeight.w700),
                                    ),
                                  ],
                                ),
                              ),
                              Container(
                                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                                decoration: BoxDecoration(
                                  color: const Color(0xFF00B894).withValues(alpha: 0.2),
                                  borderRadius: BorderRadius.circular(8),
                                  border: Border.all(color: const Color(0xFF00B894)),
                                ),
                                child: const Text(
                                  'PAGADO',
                                  style: TextStyle(color: Color(0xFF00B894), fontWeight: FontWeight.w900, fontSize: 11),
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 12),
                          Container(
                            padding: const EdgeInsets.all(12),
                            decoration: BoxDecoration(
                              color: const Color(0xFF0F172A),
                              borderRadius: BorderRadius.circular(12),
                              border: Border.all(color: Colors.white10),
                            ),
                            child: Row(
                              children: [
                                const Icon(Icons.location_on_rounded, color: Color(0xFFFF7675), size: 20),
                                const SizedBox(width: 8),
                                Expanded(
                                  child: Text(
                                    tAddress,
                                    style: const TextStyle(color: Colors.white, fontSize: 13, fontWeight: FontWeight.w600),
                                  ),
                                ),
                              ],
                            ),
                          ),
                          const SizedBox(height: 14),

                          // BOTÓN 1: ABRIR GOOGLE MAPS Y CÓMO LLEGAR
                          SizedBox(
                            width: double.infinity,
                            child: ElevatedButton.icon(
                              icon: const Icon(Icons.navigation_rounded, size: 20),
                              label: const Text(
                                '📍 CÓMO LLEGAR (ABRIR GOOGLE MAPS)',
                                style: TextStyle(fontWeight: FontWeight.w900, fontSize: 13),
                              ),
                              style: ElevatedButton.styleFrom(
                                backgroundColor: const Color(0xFF0084FF),
                                foregroundColor: Colors.white,
                                padding: const EdgeInsets.symmetric(vertical: 14),
                                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                                elevation: 3,
                              ),
                              onPressed: () {
                                if (tLat != null && tLng != null) {
                                  _launchNavigation(tLat, tLng);
                                } else {
                                  _showSnackBar('Coordenadas GPS no disponibles para este pasajero.', isError: true);
                                }
                              },
                            ),
                          ),

                          const SizedBox(height: 10),

                          // BOTONES 2 Y 3: WHATSAPP Y CONFIRMACIÓN DE ABORDAJE
                          Row(
                            children: [
                              Expanded(
                                child: ElevatedButton.icon(
                                  icon: const Icon(Icons.chat_bubble_rounded, size: 18),
                                  label: const Text('💬 Avisar por WhatsApp', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 12), textAlign: TextAlign.center),
                                  style: ElevatedButton.styleFrom(
                                    backgroundColor: const Color(0xFF25D366),
                                    foregroundColor: Colors.white,
                                    padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 4),
                                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                                  ),
                                  onPressed: () {
                                    if (tPhone.isNotEmpty) {
                                      _launchWhatsApp(tPhone, tName);
                                    } else {
                                      _showSnackBar('Teléfono no registrado para este pasajero.', isError: true);
                                    }
                                  },
                                ),
                              ),
                              const SizedBox(width: 8),
                              Expanded(
                                child: ElevatedButton.icon(
                                  icon: const Icon(Icons.check_circle_rounded, size: 18),
                                  label: const Text('✅ ¡Ya subió a la combi!', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 12), textAlign: TextAlign.center),
                                  style: ElevatedButton.styleFrom(
                                    backgroundColor: const Color(0xFF00B894),
                                    foregroundColor: Colors.white,
                                    padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 4),
                                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                                  ),
                                  onPressed: () {
                                    _markPassengerBoarded(t);
                                  },
                                ),
                              ),
                            ],
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
