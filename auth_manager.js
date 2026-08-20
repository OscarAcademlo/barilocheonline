/**
 * ==============================================================================
 * AUTH MANAGER - BARILOCHE.ONLINE & BARIRUTA
 * Sistema Centralizado de Autenticación Supabase y Permisos Exclusivos de Admin
 * ==============================================================================
 */

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
                userBar.innerHTML = `
                    <div class="auth-logged-pill" style="${isAdmin ? 'border:1px solid #e74c3c; background:rgba(231, 76, 60, 0.12);' : ''}">
                        <i class="fas ${isAdmin ? 'fa-user-shield' : 'fa-user-circle'}" style="${isAdmin ? 'color:#e74c3c;' : 'color:var(--primary);'} font-size:1.1rem;"></i>
                        <span style="font-weight:700; max-width:140px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${this.currentUser.email}</span>
                        ${isAdmin ? '<span class="badge-admin">ADMIN</span>' : ''}
                        ${isAdmin ? '<a href="admin.html" class="btn-admin-pill" style="text-decoration:none; display:inline-flex; align-items:center; gap:4px;"><i class="fas fa-shield-alt"></i> Panel Admin</a>' : ''}
                        <button onclick="window.authManager.logout()" class="btn-logout-mini" title="Cerrar sesión" style="margin-left:4px;">
                            <i class="fas fa-sign-out-alt"></i>
                        </button>
                    </div>
                `;
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
                            <input type="email" id="globalLoginEmail" name="user_email" placeholder="tu-email@ejemplo.com" autocomplete="email" spellcheck="false" required style="width:100% !important; height:48px !important; padding:12px 16px !important; border-radius:14px !important; border:1px solid #334155 !important; background:#0f172a !important; color:#ffffff !important; font-size:0.95rem !important; box-sizing:border-box !important; outline:none !important; display:block !important;">
                        </div>
                        <div class="input-group-custom" style="margin-bottom:16px;">
                            <label style="display:block; font-size:0.85rem; font-weight:700; margin-bottom:8px; color:#e2e8f0;"><i class="fas fa-lock"></i> Contraseña</label>
                            <div class="pass-input-box" style="position:relative !important; width:100% !important; display:flex !important; align-items:center !important; margin:0 !important; padding:0 !important;">
                                <input type="password" id="globalLoginPass" name="user_password" placeholder="••••••••" autocomplete="current-password" required style="width:100% !important; height:48px !important; padding:12px 45px 12px 16px !important; border-radius:14px !important; border:1px solid #334155 !important; background:#0f172a !important; color:#ffffff !important; font-size:0.95rem !important; box-sizing:border-box !important; outline:none !important; display:block !important;">
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
                            <input type="email" id="globalSignupEmail" name="signup_email" placeholder="tu-email@ejemplo.com" autocomplete="email" spellcheck="false" required style="width:100% !important; height:48px !important; padding:12px 16px !important; border-radius:14px !important; border:1px solid #334155 !important; background:#0f172a !important; color:#ffffff !important; font-size:0.95rem !important; box-sizing:border-box !important; outline:none !important; display:block !important;">
                        </div>
                        <div class="input-group-custom" style="margin-bottom:16px;">
                            <label style="display:block; font-size:0.85rem; font-weight:700; margin-bottom:8px; color:#e2e8f0;"><i class="fas fa-lock"></i> Crear Contraseña</label>
                            <div class="pass-input-box" style="position:relative !important; width:100% !important; display:flex !important; align-items:center !important; margin:0 !important; padding:0 !important;">
                                <input type="password" id="globalSignupPass" name="signup_password" placeholder="Mínimo 6 caracteres" minlength="6" autocomplete="new-password" required style="width:100% !important; height:48px !important; padding:12px 45px 12px 16px !important; border-radius:14px !important; border:1px solid #334155 !important; background:#0f172a !important; color:#ffffff !important; font-size:0.95rem !important; box-sizing:border-box !important; outline:none !important; display:block !important;">
                                <button type="button" class="btn-toggle-pass" onclick="window.togglePasswordVisibility('globalSignupPass', this)" style="position:absolute !important; right:12px !important; top:50% !important; transform:translateY(-50%) !important; background:transparent !important; border:none !important; cursor:pointer !important; color:#94a3b8 !important; font-size:1.15rem !important; padding:6px !important; z-index:10 !important; display:flex !important; align-items:center !important; justify-content:center !important; line-height:1 !important;">
                                    <i class="fas fa-eye"></i>
                                </button>
                            </div>
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
        if (!loginForm || !signupForm) return;
        if (mode === 'signup') {
            loginForm.style.display = 'none';
            signupForm.style.display = 'block';
        } else {
            loginForm.style.display = 'block';
            signupForm.style.display = 'none';
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
            alert('🎉 ¡Cuenta creada con éxito! Si tienes la verificación activa, revisa tu correo.');
            this.closeModal();
        } catch (err) {
            if (errorEl) errorEl.textContent = err.message || 'Error al registrarte';
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = 'Registrarme';
            }
        }
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

// Instancia global
window.authManager = new AuthManager();
