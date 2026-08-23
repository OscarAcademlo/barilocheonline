/**
 * ==============================================================================
 * AUTH MANAGER - BARILOCHE.ONLINE & BARIRUTA
 * Sistema Centralizado de Autenticación Supabase y Permisos Exclusivos de Admin
 * ==============================================================================
 */

(function () {
    const ADMIN_EMAIL = 'oscarns@gmail.com';
    const SB_URL = 'https://pwrlbwplpgzirlcrwepi.supabase.co';
    const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB3cmxid3BscGd6aXJsY3J3ZXBpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzMzc0NzAsImV4cCI6MjA4NjkxMzQ3MH0.HxEfbABTObu4khKxVhtBaBuCt2RDBm34urnSEJCfJUU';

class AuthManager {
    constructor() {
        this.supabase = null;
        this.currentUser = null;
        this.listeners = [];
        this.init();
    }

    init() {
        if (window.supabase) {
            try {
                this.supabase = window.supabase.createClient(SB_URL, SB_KEY);
                this.checkSession();
                this.supabase.auth.onAuthStateChange((event, session) => {
                    this.currentUser = session?.user || null;
                    this.updateUI();
                    this.notifyListeners();
                });
            } catch (e) {
                console.error('[AuthManager] Error inicializando Supabase Auth:', e);
            }
        }
        
        // Escuchar carga del DOM para inyectar elementos si faltan
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                this.ensureAuthModalInDOM();
                this.updateUI();
            });
        } else {
            this.ensureAuthModalInDOM();
            this.updateUI();
        }
    }

    async checkSession() {
        if (!this.supabase) return;
        try {
            const { data } = await this.supabase.auth.getSession();
            this.currentUser = data?.session?.user || null;
            this.updateUI();
            this.notifyListeners();
        } catch (e) {
            console.warn('[AuthManager] Error verificando sesión:', e);
        }
    }

    isAdmin() {
        return !!(this.currentUser && this.currentUser.email && this.currentUser.email.toLowerCase().trim() === ADMIN_EMAIL);
    }

    onAuthChange(callback) {
        this.listeners.push(callback);
        callback(this.currentUser, this.isAdmin());
    }

    notifyListeners() {
        this.listeners.forEach(cb => {
            try { cb(this.currentUser, this.isAdmin()); } catch (e) { console.error(e); }
        });
    }

    updateUI() {
        const userBar = document.getElementById('userAuthStatus');
        const isAdmin = this.isAdmin();

        // 1. Barra de usuario en el Header (si existe el contenedor #userAuthStatus)
        if (userBar) {
            if (this.currentUser) {
                const emailClean = this.currentUser.email.toLowerCase().trim();
                let shortEmail = emailClean.split('@')[0];
                if (shortEmail.length > 12) shortEmail = shortEmail.substring(0, 10) + '…';

                userBar.innerHTML = `
                    <div class="auth-logged-pill" style="${isAdmin ? 'border:1px solid #e74c3c; background:rgba(231, 76, 60, 0.12);' : 'background:var(--bg-main); border:1px solid var(--border);'} display:inline-flex; align-items:center; gap:8px; padding:4px 10px; border-radius:20px; flex-shrink:0;">
                        <a href="perfil.html" style="text-decoration:none; color:inherit; display:flex; align-items:center; gap:6px; font-weight:700; font-size:0.85rem;" title="${this.currentUser.email}">
                            <i class="fas ${isAdmin ? 'fa-user-shield' : 'fa-user-circle'}" style="${isAdmin ? 'color:#e74c3c;' : 'color:var(--primary);'} font-size:1.15rem;"></i>
                            <span style="max-width:110px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${shortEmail}</span>
                        </a>
                        <a href="perfil.html" class="btn-owner-edit" style="text-decoration:none; font-size:0.75rem; padding:4px 10px; font-weight:700; display:inline-flex; align-items:center; gap:5px; border-radius:12px; background:rgba(0,132,255,0.15); color:var(--primary);">
                            <i class="fas fa-sliders"></i> Mi Panel
                        </a>
                        ${isAdmin ? '<a href="admin.html" class="btn-admin-pill" style="text-decoration:none; display:inline-flex; align-items:center; gap:4px; font-size:0.75rem; padding:4px 8px; border-radius:10px; background:#e74c3c; color:white; font-weight:800;"><i class="fas fa-shield-alt"></i> Admin</a>' : ''}
                        <button onclick="window.authManager.logout()" class="btn-logout-mini" title="Cerrar sesión" style="background:transparent; border:none; color:var(--text-secondary); cursor:pointer; font-size:0.95rem; padding:4px; display:flex; align-items:center;">
                            <i class="fas fa-sign-out-alt"></i>
                        </button>
                    </div>
                `;

                if (!isAdmin && !subBadge) {
                    fetch(`save_alojamiento.php?action=check_subscription&email=${encodeURIComponent(emailClean)}&_t=${Date.now()}`)
                        .then(r => r.json())
                        .then(d => {
                            if (d && (d.active || d.is_admin)) {
                                try { localStorage.setItem('bari_sub_' + emailClean, JSON.stringify(d)); } catch (e) {}
                                this.updateUI();
                            }
                        }).catch(() => {});
                }
            } else {
                userBar.innerHTML = `
                    <button onclick="window.authManager.openModal()" class="btn-login-header">
                        <i class="fas fa-user"></i> Ingresar
                    </button>
                `;
            }
        }

        // 2. Acceso ADMIN en la barra de navegación Desktop (SOLO para oscarns@gmail.com)
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

        // 3. Acceso ADMIN en la barra de navegación Mobile (SOLO para oscarns@gmail.com)
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

    ensureAuthModalInDOM() {
        if (document.getElementById('globalAuthModal')) return;

        const modalHtml = `
        <div id="globalAuthModal" class="modal-overlay" style="display:none; position:fixed; top:0; left:0; width:100vw; height:100vh; background:rgba(0,0,0,0.65); backdrop-filter:blur(6px); z-index:99999; justify-content:center; align-items:center; padding:15px;" onclick="window.authManager.closeModal()">
            <div class="modal-content auth-modal-box" style="max-width:420px; width:100%; background:var(--bg-secondary, #1e272e); border:1px solid var(--border, rgba(255,255,255,0.1)); border-radius:24px; padding:30px; position:relative; box-shadow:0 20px 50px rgba(0,0,0,0.5); color:var(--text-primary, #fff);" onclick="event.stopPropagation()">
                <button class="modal-close" style="position:absolute; top:18px; right:18px; background:none; border:none; color:var(--text-secondary, #94a3b8); font-size:1.2rem; cursor:pointer;" onclick="window.authManager.closeModal()"><i class="fas fa-times"></i></button>
                
                <div class="auth-header-title" style="text-align:center; margin-bottom:20px;">
                    <i class="fas fa-user-circle" style="color:var(--primary, #0084ff); font-size:2.5rem; margin-bottom:10px;"></i>
                    <h2 style="margin:0 0 6px; font-family:'Outfit', sans-serif; font-size:1.4rem;">Iniciar Sesión</h2>
                    <p id="globalAuthNotice" style="margin:0; font-size:0.85rem; color:var(--text-secondary, #94a3b8);">Accede a tu cuenta de Bariloche.Online</p>
                </div>

                <!-- LOGIN -->
                <div id="globalLoginFormContainer">
                    <form onsubmit="window.authManager.handleLoginSubmit(event)">
                        <div class="input-group-custom" style="margin-bottom:16px;">
                            <label style="display:block; font-size:0.85rem; font-weight:700; margin-bottom:8px; color:#e2e8f0;"><i class="fas fa-envelope"></i> Email</label>
                            <input type="email" id="globalLoginEmail" name="login_user_email" placeholder="tu-email@gmail.com" autocomplete="off" data-lpignore="true" spellcheck="false" required style="width:100% !important; height:48px !important; padding:12px 16px !important; border-radius:14px !important; border:1px solid #334155 !important; background:#0f172a !important; background-repeat:no-repeat !important; color:#ffffff !important; font-size:0.95rem !important; box-sizing:border-box !important; outline:none !important; display:block !important;">
                        </div>
                        <div class="input-group-custom" style="margin-bottom:16px;">
                            <label style="display:block; font-size:0.85rem; font-weight:700; margin-bottom:8px; color:#e2e8f0;"><i class="fas fa-lock"></i> Contraseña</label>
                            <div class="pass-input-box" style="position:relative !important; width:100% !important; display:flex !important; align-items:center !important; margin:0 !important; padding:0 !important;">
                                <input type="password" id="globalLoginPass" name="login_user_password" placeholder="••••••••" autocomplete="off" data-lpignore="true" required style="width:100% !important; height:48px !important; padding:12px 45px 12px 16px !important; border-radius:14px !important; border:1px solid #334155 !important; background:#0f172a !important; color:#ffffff !important; font-size:0.95rem !important; box-sizing:border-box !important; outline:none !important; display:block !important;">
                                <button type="button" class="btn-toggle-pass" onclick="window.togglePasswordVisibility('globalLoginPass', this)" style="position:absolute !important; right:12px !important; top:50% !important; transform:translateY(-50%) !important; background:transparent !important; border:none !important; cursor:pointer !important; color:#94a3b8 !important; font-size:1.15rem !important; padding:6px !important; z-index:10 !important; display:flex !important; align-items:center !important; justify-content:center !important; line-height:1 !important;">
                                    <i class="fas fa-eye"></i>
                                </button>
                            </div>
                        </div>
                        <div id="globalLoginError" class="auth-error-msg" style="color:#ef4444; font-size:0.85rem; margin-bottom:12px; text-align:center; font-weight:600;"></div>
                        <button type="submit" id="btnGlobalLoginSubmit" class="btn-auth-primary" style="width:100%; background:var(--primary, #0084ff); color:white; border:none; padding:14px; border-radius:14px; font-weight:800; font-size:0.95rem; cursor:pointer; margin-top:6px;">Ingresar</button>
                    </form>
                    <div class="auth-switch-row" style="margin-top:18px; text-align:center; font-size:0.85rem; color:#94a3b8;">
                        <span>¿No tienes cuenta aún?</span>
                        <a href="javascript:void(0)" onclick="window.authManager.toggleMode('signup')" style="color:var(--primary, #0084ff); font-weight:700; text-decoration:none; margin-left:4px;">Crear cuenta gratis</a>
                    </div>
                </div>

                <!-- SIGNUP -->
                <div id="globalSignupFormContainer" style="display:none;">
                    <form onsubmit="window.authManager.handleSignupSubmit(event)">
                        <div class="input-group-custom" style="margin-bottom:16px;">
                            <label style="display:block; font-size:0.85rem; font-weight:700; margin-bottom:8px; color:#e2e8f0;"><i class="fas fa-envelope"></i> Tu Email</label>
                            <input type="email" id="globalSignupEmail" name="reg_user_email" placeholder="tu-email@gmail.com" autocomplete="off" data-lpignore="true" spellcheck="false" required style="width:100% !important; height:48px !important; padding:12px 16px !important; border-radius:14px !important; border:1px solid #334155 !important; background:#0f172a !important; background-repeat:no-repeat !important; color:#ffffff !important; font-size:0.95rem !important; box-sizing:border-box !important; outline:none !important; display:block !important;">
                        </div>
                        <div class="input-group-custom" style="margin-bottom:16px;">
                            <label style="display:block; font-size:0.85rem; font-weight:700; margin-bottom:8px; color:#e2e8f0;"><i class="fas fa-lock"></i> Crear Contraseña</label>
                            <div class="pass-input-box" style="position:relative !important; width:100% !important; display:flex !important; align-items:center !important; margin:0 !important; padding:0 !important;">
                                <input type="password" id="globalSignupPass" name="reg_user_password" placeholder="Mínimo 6 caracteres" minlength="6" autocomplete="off" data-lpignore="true" required style="width:100% !important; height:48px !important; padding:12px 45px 12px 16px !important; border-radius:14px !important; border:1px solid #334155 !important; background:#0f172a !important; color:#ffffff !important; font-size:0.95rem !important; box-sizing:border-box !important; outline:none !important; display:block !important;">
                                <button type="button" class="btn-toggle-pass" onclick="window.togglePasswordVisibility('globalSignupPass', this)" style="position:absolute !important; right:12px !important; top:50% !important; transform:translateY(-50%) !important; background:transparent !important; border:none !important; cursor:pointer !important; color:#94a3b8 !important; font-size:1.15rem !important; padding:6px !important; z-index:10 !important; display:flex !important; align-items:center !important; justify-content:center !important; line-height:1 !important;">
                                    <i class="fas fa-eye"></i>
                                </button>
                            </div>
                        </div>
                        <div class="input-group-custom" style="margin-bottom:16px;">
                            <label style="display:block; font-size:0.85rem; font-weight:700; margin-bottom:8px; color:#e2e8f0;"><i class="fas fa-layer-group"></i> Servicio Principal a Registrar</label>
                            <select id="globalSignupServiceSelect" style="width:100% !important; height:48px !important; border-radius:14px !important; border:1px solid #334155 !important; background:#0f172a !important; color:#ffffff !important; font-size:0.95rem !important; padding:0 14px !important; font-weight:700 !important;">
                                <option value="alojamiento" selected>🏡 Alojamiento (Dónde Dormir)</option>
                                <option value="excursiones">🚐 Excursiones / Combis (BariRuta GPS en vivo)</option>
                                <option value="gastronomia">🍽️ Gastronomía (Dónde Comer)</option>
                                <option value="todos">🌟 Todos los Servicios (Combo Completo)</option>
                            </select>
                        </div>
                        <div id="globalSignupError" class="auth-error-msg" style="color:#ef4444; font-size:0.85rem; margin-bottom:12px; text-align:center; font-weight:600;"></div>
                        <button type="submit" id="btnGlobalSignupSubmit" class="btn-auth-primary" style="width:100%; background:var(--primary, #0084ff); color:white; border:none; padding:14px; border-radius:14px; font-weight:800; font-size:0.95rem; cursor:pointer; margin-top:6px;">Registrarme</button>
                    </form>
                    <div class="auth-switch-row" style="margin-top:18px; text-align:center; font-size:0.85rem; color:#94a3b8;">
                        <span>¿Ya tienes cuenta?</span>
                        <a href="javascript:void(0)" onclick="window.authManager.toggleMode('login')" style="color:var(--primary, #0084ff); font-weight:700; text-decoration:none; margin-left:4px;">Iniciar sesión</a>
                    </div>
                </div>
            </div>
        </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
    }

    openModal(msg = '') {
        const modal = document.getElementById('authModal') || document.getElementById('globalAuthModal');
        const notice = document.getElementById('authNoticeMsg') || document.getElementById('globalAuthNotice');
        if (notice && msg) notice.textContent = msg;
        if (modal) modal.style.display = 'flex';
    }

    closeModal() {
        const modal = document.getElementById('authModal') || document.getElementById('globalAuthModal');
        if (modal) modal.style.display = 'none';
    }

    toggleMode(mode) {
        const loginForm = document.getElementById('loginFormContainer') || document.getElementById('globalLoginFormContainer');
        const signupForm = document.getElementById('signupFormContainer') || document.getElementById('globalSignupFormContainer');
        const titleEl = document.querySelector('#authModal .auth-header-title h2') || document.querySelector('#globalAuthModal .auth-header-title h2');
        const noticeEl = document.getElementById('authNoticeMsg') || document.getElementById('globalAuthNotice');
        const iconEl = document.querySelector('#authModal .auth-header-title i') || document.querySelector('#globalAuthModal .auth-header-title i');

        if (!loginForm || !signupForm) return;

        if (mode === 'signup') {
            loginForm.style.display = 'none';
            signupForm.style.display = 'block';
            if (titleEl) titleEl.textContent = 'Crear Cuenta de Prestador';
            if (noticeEl) noticeEl.textContent = 'Registrate y elegí tus servicios para empezar a publicar en Bariloche.Online';
            if (iconEl) iconEl.className = 'fas fa-user-plus';
        } else {
            loginForm.style.display = 'block';
            signupForm.style.display = 'none';
            if (titleEl) titleEl.textContent = 'Iniciar Sesión';
            if (noticeEl) noticeEl.textContent = 'Accede a tu cuenta para administrar tus publicaciones y servicios';
            if (iconEl) iconEl.className = 'fas fa-user-circle';
        }
    }

    async handleLoginSubmit(e) {
        e.preventDefault();
        const emailInput = document.getElementById('loginEmail') || document.getElementById('globalLoginEmail');
        const passInput = document.getElementById('loginPass') || document.getElementById('globalLoginPass');
        const btn = document.getElementById('btnLoginSubmit') || document.getElementById('btnGlobalLoginSubmit');
        const errorEl = document.getElementById('loginError') || document.getElementById('globalLoginError');

        const email = emailInput ? emailInput.value.trim() : '';
        const pass = passInput ? passInput.value : '';

        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Ingresando...';
        }
        if (errorEl) errorEl.textContent = '';

        try {
            if (!this.supabase) throw new Error('Servicio de autenticación no inicializado');
            const { data, error } = await this.supabase.auth.signInWithPassword({ email, password: pass });
            if (error) throw error;
            this.currentUser = data.user;
            this.closeModal();
            this.updateUI();
            this.notifyListeners();
        } catch (err) {
            if (errorEl) errorEl.textContent = err.message || 'Error al iniciar sesión';
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = 'Ingresar';
            }
        }
    }

    async handleSignupSubmit(e) {
        e.preventDefault();
        const emailInput = document.getElementById('signupEmail') || document.getElementById('globalSignupEmail');
        const passInput = document.getElementById('signupPass') || document.getElementById('globalSignupPass');
        const btn = document.getElementById('btnSignupSubmit') || document.getElementById('btnGlobalSignupSubmit');
        const errorEl = document.getElementById('signupError') || document.getElementById('globalSignupError');

        const email = emailInput ? emailInput.value.trim() : '';
        const pass = passInput ? passInput.value : '';

        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Registrando...';
        }
        if (errorEl) errorEl.textContent = '';

        try {
            if (!this.supabase) throw new Error('Servicio de autenticación no inicializado');
            const { data, error } = await this.supabase.auth.signUp({
                email,
                password: pass,
                options: {
                    emailRedirectTo: window.location.origin + window.location.pathname
                }
            });
            if (error) throw error;

            // Guardar servicio elegido en el perfil de prestador
            const srvSelect = document.getElementById('signupServiceSelect') || document.getElementById('globalSignupServiceSelect');
            const chosenSrv = srvSelect ? srvSelect.value : 'alojamiento';
            const servicesArray = chosenSrv === 'todos' ? ['excursiones', 'alojamiento', 'gastronomia'] : [chosenSrv];

            try {
                await fetch('save_alojamiento.php?action=save_multiservice_provider', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        email: email,
                        services: servicesArray,
                        business_name: '',
                        phone: '',
                        moviles: []
                    })
                });
            } catch (e) {}

            this.closeModal();
            this.showVerificationSuccessModal(email);
        } catch (err) {
            if (errorEl) errorEl.textContent = err.message || 'Error al registrarte';
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = 'Registrarme';
            }
        }
    }

    showVerificationSuccessModal(email) {
        let modal = document.getElementById('emailVerificationModal');
        if (!modal) {
            const modalHtml = `
            <div id="emailVerificationModal" class="modal-overlay" style="display:none; z-index:1000000;">
                <div class="modal-content" style="max-width:480px; background:#1e293b; color:#ffffff; border-radius:24px; padding:32px 24px; text-align:center; box-shadow:0 25px 60px rgba(0,0,0,0.8); border:1px solid rgba(255,255,255,0.15); position:relative;">
                    <div style="width:76px; height:76px; border-radius:50%; background:linear-gradient(135deg, rgba(0,132,255,0.2), rgba(0,206,201,0.2)); color:#00cec9; font-size:2.4rem; display:flex; align-items:center; justify-content:center; margin:0 auto 18px; border:2px solid rgba(0,206,201,0.4); box-shadow:0 0 25px rgba(0,206,201,0.3);">
                        <i class="fas fa-envelope-open-text"></i>
                    </div>
                    <h2 style="font-family:'Outfit'; font-size:1.65rem; margin:0 0 8px; color:#ffffff;">¡Activá tu Cuenta!</h2>
                    <p style="color:#94a3b8; font-size:0.95rem; margin:0 0 16px;">Te enviamos un correo con el enlace de confirmación a:</p>
                    
                    <div style="background:#0f172a; border:1px solid #334155; border-radius:14px; padding:12px 16px; font-weight:800; color:#38bdf8; font-size:1rem; margin-bottom:20px; word-break:break-all;">
                        <i class="fas fa-envelope" style="margin-right:6px;"></i> <span id="verifyModalTargetEmail">${email}</span>
                    </div>

                    <div style="text-align:left; background:rgba(255,255,255,0.04); border-radius:16px; padding:16px; margin-bottom:24px; font-size:0.88rem; color:#cbd5e1; display:flex; flex-direction:column; gap:10px;">
                        <div style="display:flex; align-items:flex-start; gap:10px;">
                            <span style="background:var(--primary); color:white; width:22px; height:22px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:0.75rem; font-weight:800; flex-shrink:0;">1</span>
                            <span>Revisá tu <b>Bandeja de Entrada</b> (o la carpeta de <i>Spam / Correo no deseado</i>).</span>
                        </div>
                        <div style="display:flex; align-items:flex-start; gap:10px;">
                            <span style="background:var(--primary); color:white; width:22px; height:22px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:0.75rem; font-weight:800; flex-shrink:0;">2</span>
                            <span>Hacé clic en el botón o enlace <b>"Confirm your mail"</b> para validar tu cuenta.</span>
                        </div>
                        <div style="display:flex; align-items:flex-start; gap:10px;">
                            <span style="background:var(--primary); color:white; width:22px; height:22px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:0.75rem; font-weight:800; flex-shrink:0;">3</span>
                            <span>Regresá a Bariloche.Online e <b>iniciá sesión</b> para gestionar tu panel.</span>
                        </div>
                    </div>

                    <button onclick="window.authManager.closeVerificationSuccessModal()" class="btn-auth-primary" style="width:100%; background:linear-gradient(135deg, #0084ff, #00cec9); color:white; border:none; padding:15px; border-radius:14px; font-weight:800; font-size:1rem; cursor:pointer; box-shadow:0 8px 25px rgba(0,132,255,0.4);">
                        <i class="fas fa-check"></i> Entendido, ir a Iniciar Sesión
                    </button>
                </div>
            </div>
            `;
            document.body.insertAdjacentHTML('beforeend', modalHtml);
            modal = document.getElementById('emailVerificationModal');
        } else {
            const emailSpan = document.getElementById('verifyModalTargetEmail');
            if (emailSpan) emailSpan.textContent = email;
        }

        modal.style.display = 'flex';
    }

    closeVerificationSuccessModal() {
        const modal = document.getElementById('emailVerificationModal');
        if (modal) modal.style.display = 'none';
        this.openModal();
        this.toggleMode('login');
    }

    async logout() {
        if (this.supabase) {
            await this.supabase.auth.signOut();
        }
        this.currentUser = null;
        this.updateUI();
        this.notifyListeners();
        // Si estaba en admin.html y desloguea, recargar para bloquear
        if (window.location.pathname.endsWith('admin.html')) {
            window.location.reload();
        }
    }
}

// Helper para visibilidad de contraseña
window.togglePasswordVisibility = function(inputId, btnEl) {
    const input = document.getElementById(inputId);
    if (!input) return;
    const icon = btnEl.querySelector('i');
    if (input.type === 'password') {
        input.type = 'text';
        if (icon) icon.className = 'fas fa-eye-slash';
    } else {
        input.type = 'password';
        if (icon) icon.className = 'fas fa-eye';
    }
};

// MODO NOCHE GLOBAL (FUNCIONA EN TODAS LAS PÁGINAS)
window.initTheme = function() {
    const saved = localStorage.getItem('theme') || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    document.documentElement.setAttribute('data-theme', saved);
    const btn = document.getElementById('theme-toggle-btn');
    if (btn) btn.innerHTML = saved === 'dark' ? '<i class="fas fa-sun"></i>' : '<i class="fas fa-moon"></i>';
};

window.toggleTheme = function() {
    const current = document.documentElement.getAttribute('data-theme') || 'light';
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);
    const btn = document.getElementById('theme-toggle-btn');
    if (btn) btn.innerHTML = next === 'dark' ? '<i class="fas fa-sun"></i>' : '<i class="fas fa-moon"></i>';
};

window.initTheme();
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', window.initTheme);
}

// Instancia global
window.authManager = new AuthManager();
})();
