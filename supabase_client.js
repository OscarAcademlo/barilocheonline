/**
 * ==============================================================================
 * BARIRUTA - CLIENTE SUPABASE REALTIME (PRODUCCIÓN & TIEMPO REAL)
 * Bariloche.Online - Conexión Automática con Supabase para Mapa de Turistas y Admin
 * ==============================================================================
 */

const DEFAULT_SB_URL = 'https://pwrlbwplpgzirlcrwepi.supabase.co';
const DEFAULT_SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB3cmxid3BscGd6aXJsY3J3ZXBpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzMzc0NzAsImV4cCI6MjA4NjkxMzQ3MH0.HxEfbABTObu4khKxVhtBaBuCt2RDBm34urnSEJCfJUU';

class BariRutaSupabaseClient {
    constructor() {
        this.supabase = null;
        this.isConnected = false;
        this.selectedCompany = ''; // Vacío = mostrar TODAS las empresas
        this.vehicleListeners = [];
        this.companyListeners = [];
        this.statusListeners = [];

        // Estado local en memoria
        this.vehicles = [];
        this.companies = [];

        this.init();
    }

    sanitizeUrl(url) {
        if (!url) return '';
        let clean = url.trim();
        clean = clean.replace(/\/rest\/v1\/?$/i, '');
        clean = clean.replace(/\/+$/, '');
        return clean;
    }

    init() {
        // Limpiar keys viejas o inválidas guardadas en localStorage
        let savedKey = localStorage.getItem('bariruta_sb_key');
        if (savedKey && (!savedKey.startsWith('eyJ') || savedKey.includes('publishable'))) {
            console.warn('[BariRuta] Limpiando key obsoleta de localStorage');
            localStorage.removeItem('bariruta_sb_key');
            savedKey = null;
        }

        let url = this.sanitizeUrl(localStorage.getItem('bariruta_sb_url') || DEFAULT_SB_URL);
        const key = (savedKey || DEFAULT_SB_KEY).trim();

        if (window.supabase && url && key) {
            try {
                this.supabase = window.supabase.createClient(url, key);
                this.isConnected = true;
                this.notifyStatus('🟢 Conectado en Tiempo Real');
                console.log('[BariRuta] Supabase inicializado con éxito');
                this.fetchData();
                this.setupRealtime();

                // Polling automático cada 4 segundos como respaldo infalible
                if (this.pollingInterval) clearInterval(this.pollingInterval);
                this.pollingInterval = setInterval(() => {
                    this.fetchVehicles();
                }, 4000);
            } catch (e) {
                console.error('[BariRuta] Error al inicializar Supabase:', e);
                this.isConnected = false;
                this.notifyStatus('🔴 Error de conexión');
            }
        } else {
            this.isConnected = false;
            this.notifyStatus('⚙️ Conectando con Supabase...');
        }
    }

    setCredentials(url, key) {
        const cleanUrl = this.sanitizeUrl(url);
        localStorage.setItem('bariruta_sb_url', cleanUrl);
        localStorage.setItem('bariruta_sb_key', key.trim());
        this.init();
    }

    getCredentials() {
        return {
            url: this.sanitizeUrl(localStorage.getItem('bariruta_sb_url') || DEFAULT_SB_URL),
            key: localStorage.getItem('bariruta_sb_key') || DEFAULT_SB_KEY
        };
    }

    setCompany(name) {
        this.selectedCompany = name;
        this.filterAndNotifyVehicles();
    }

    async fetchData() {
        await this.fetchCompanies();
        await this.fetchVehicles();
    }

    async fetchCompanies() {
        if (!this.isConnected || !this.supabase) return;

        try {
            const { data, error } = await this.supabase
                .from('companies')
                .select('*')
                .eq('is_active', true)
                .order('created_at', { ascending: true });

            if (!error && data && data.length > 0) {
                this.companies = data;
            } else if (this.companies.length === 0) {
                this.companies = [{ id: '1', name: 'Empresa Oscar', phone: '+5492944123456', category: 'combi' }];
            }
            this.notifyCompanies(this.companies);
        } catch (e) {
            console.error('Error al consultar companies en Supabase:', e);
        }
    }

    async fetchVehicles() {
        if (!this.isConnected || !this.supabase) return;

        try {
            const { data, error } = await this.supabase
                .from('vehicles')
                .select('*')
                .order('updated_at', { ascending: false });

            if (!error && data) {
                // MERGE en lugar de reemplazar:
                // Si el broadcast llegó antes que la DB confirme el upsert,
                // this.vehicles tiene el dato y la DB devuelve array vacío.
                // Reemplazar todo borra el vehículo recién recibido.
                const dbKeys = new Set(data.map(v => this._vehicleKey(v)));

                // 1. Actualizar/agregar los que vinieron de DB
                data.forEach(dbVehicle => {
                    const idx = this.vehicles.findIndex(
                        v => this._vehicleKey(v) === this._vehicleKey(dbVehicle)
                    );
                    if (idx >= 0) {
                        // Quedarse con el más reciente entre broadcast y DB
                        const existingAt = new Date(this.vehicles[idx].updated_at || 0).getTime();
                        const dbAt = new Date(dbVehicle.updated_at || 0).getTime();
                        if (dbAt >= existingAt) {
                            this.vehicles[idx] = dbVehicle;
                        }
                    } else {
                        this.vehicles.push(dbVehicle);
                    }
                });

                // 2. Limpiar solo los que NO están en DB Y son más viejos de 30 seg
                //    (broadcast reciente se mantiene aunque la DB no lo confirmó aún)
                this.vehicles = this.vehicles.filter(v => {
                    if (dbKeys.has(this._vehicleKey(v))) return true;
                    const updatedAt = new Date(v.updated_at || 0).getTime();
                    return (Date.now() - updatedAt) < 30000; // 30 seg de gracia
                });

                this.syncCompaniesFromVehicles(data);
                this.filterAndNotifyVehicles();
            }
        } catch (e) {
            console.error('Error al consultar vehicles en Supabase:', e);
        }
    }

    syncCompaniesFromVehicles(vehicleList) {
        let changed = false;
        vehicleList.forEach(v => {
            if (!v.company_name) return;
            const exists = this.companies.some(
                c => c.name.toLowerCase().trim() === v.company_name.toLowerCase().trim()
            );
            if (!exists) {
                this.companies.push({
                    id: 'auto-' + v.company_name,
                    name: v.company_name,
                    phone: '+5492944123456',
                    category: 'combi'
                });
                changed = true;
            }
        });

        if (changed) {
            this.notifyCompanies(this.companies);
        }
    }

    filterAndNotifyVehicles() {
        if (!this.vehicles || this.vehicles.length === 0) {
            this.notifyVehicles([]);
            return;
        }

        const now = Date.now();
        const MAX_STALE_MINUTES = 3; // Ocultar si no transmite hace más de 3 minutos

        // 1. Descartar vehículos inactivos o viejos
        const liveVehicles = this.vehicles.filter(v => {
            if (!v.updated_at) return true;
            const updatedTime = new Date(v.updated_at).getTime();
            const diffMinutes = (now - updatedTime) / (1000 * 60);
            return diffMinutes <= MAX_STALE_MINUTES;
        });

        const target = (this.selectedCompany || '').toLowerCase().trim();

        // 2. Si no hay empresa seleccionada o es "todas", mostrar todos los activos
        if (!target || target === 'todas') {
            this.notifyVehicles(liveVehicles);
            return;
        }

        // 3. Filtrado por empresa seleccionada
        const filtered = liveVehicles.filter(v => {
            const vComp = (v.company_name || '').toLowerCase().trim();
            return vComp === target || 
                   vComp.includes(target) || 
                   target.includes(vComp);
        });

        this.notifyVehicles(filtered);
    }

    setupRealtime() {
        if (!this.supabase) return;

        // 0. CANAL BROADCAST EFÍMERO DE ULTRABAJA LATENCIA (MÉTODO CCVLITE)
        this.trackingBroadcastChannel = this.supabase.channel('tracking');
        this.trackingBroadcastChannel
            .on('broadcast', { event: 'location' }, ({ payload }) => {
                if (!payload || !payload.lat || !payload.lng) return;
                // Usar clave compuesta estable (igual que la DB) para evitar duplicados
                const idx = this.vehicles.findIndex(
                    v => this._vehicleKey(v) === this._vehicleKey(payload)
                );
                if (idx >= 0) {
                    this.vehicles[idx] = { ...this.vehicles[idx], ...payload };
                } else {
                    this.vehicles.unshift(payload);
                }
                this.syncCompaniesFromVehicles([payload]);
                this.filterAndNotifyVehicles();
            })
            .on('broadcast', { event: 'status' }, ({ payload }) => {
                if (payload && payload.active === false) {
                    this.vehicles = this.vehicles.filter(
                        v => this._vehicleKey(v) !== this._vehicleKey(payload)
                    );
                    this.filterAndNotifyVehicles();
                }
            })
            .subscribe();

        // 1. Suscripción en tiempo real a los vehículos en la base de datos (Postgres Changes)
        this.supabase
            .channel('realtime_vehicles_channel')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'vehicles' }, payload => {
                const eventType = payload.eventType;
                const newItem = payload.new;
                const oldItem = payload.old;

                if (eventType === 'DELETE') {
                    if (oldItem) {
                        this.vehicles = this.vehicles.filter(
                            v => this._vehicleKey(v) !== this._vehicleKey(oldItem)
                        );
                    }
                } else if (newItem) {
                    const idx = this.vehicles.findIndex(
                        v => this._vehicleKey(v) === this._vehicleKey(newItem)
                    );
                    if (idx >= 0) {
                        this.vehicles[idx] = newItem;
                    } else {
                        this.vehicles.unshift(newItem);
                    }

                    // Auto-descubrir empresa si es nueva
                this.syncCompaniesFromVehicles([newItem]);
                }

                this.filterAndNotifyVehicles();
            })
            .subscribe();

        // 2. Suscripción en tiempo real a cambios de empresas
        this.supabase
            .channel('realtime_companies_channel')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'companies' }, () => {
                this.fetchCompanies();
            })
            .subscribe();
    }

    // Clave única estable por vehículo (company_name + vehicle_code, case-insensitive)
    _vehicleKey(v) {
        return `${(v.company_name || '').trim().toLowerCase()}|${(v.vehicle_code || '').trim().toLowerCase()}`;
    }

    // MÉTODOS DE ADMINISTRACIÓN (PARA admin.html)
    async addCompany(companyData) {
        if (this.isConnected && this.supabase) {
            const { data, error } = await this.supabase
                .from('companies')
                .insert([companyData])
                .select();
            if (error) throw error;
            await this.fetchCompanies();
            return data;
        } else {
            const newComp = { id: 'local-' + Date.now(), ...companyData };
            this.companies.push(newComp);
            this.notifyCompanies(this.companies);
            return [newComp];
        }
    }

    async deleteCompany(companyId) {
        if (this.isConnected && this.supabase) {
            const { error } = await this.supabase
                .from('companies')
                .delete()
                .eq('id', companyId);
            if (error) throw error;
            await this.fetchCompanies();
        } else {
            this.companies = this.companies.filter(c => c.id !== companyId);
            this.notifyCompanies(this.companies);
        }
    }

    // SUSCRIPTORES / LISTENERS
    onVehiclesChange(callback) {
        this.vehicleListeners.push(callback);
        if (this.vehicles.length > 0) {
            this.filterAndNotifyVehicles();
        }
    }

    onCompaniesChange(callback) {
        this.companyListeners.push(callback);
        if (this.companies.length > 0) {
            callback(this.companies);
        }
    }

    onStatusChange(callback) {
        this.statusListeners.push(callback);
        if (this.isConnected) {
            callback('🟢 Conectado en Tiempo Real');
        }
    }

    notifyVehicles(vehicles) {
        this.vehicleListeners.forEach(cb => cb(vehicles));
    }

    notifyCompanies(companies) {
        this.companyListeners.forEach(cb => cb(companies));
    }

    notifyStatus(msg) {
        this.statusListeners.forEach(cb => cb(msg));
    }
}

// Instancia global única
window.bariRuta = new BariRutaSupabaseClient();
