// ── AUTH MODULE ───────────────────────────────────────────

// ── FORGOT / RESET SCREENS ────────────────────────────────
function showForgotPassword() {
    $('forgot-email').value = $('login-email').value || '';
    setMsg('forgot-error', '');
    setMsg('forgot-success', '');
    showScreen('forgot-screen');
}

function showLogin() { showScreen('login-screen'); }

async function sendResetEmail() {
    const email = $('forgot-email').value.trim();
    setMsg('forgot-error', '');
    setMsg('forgot-success', '');
    if (!email) return setMsg('forgot-error', 'Please enter your email address.');
    setLoading('forgot-btn', true);
    const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + window.location.pathname
    });
    setLoading('forgot-btn', false);
    if (error) return setMsg('forgot-error', error.message);
    setMsg('forgot-success', 'Reset link sent! Check your email inbox.');
}

// ── LOGIN ─────────────────────────────────────────────────
async function login() {
    const email = $('login-email').value.trim();
    const pass  = $('login-password').value;
    setMsg('login-error', '');
    if (!email || !pass) return setMsg('login-error', 'Please enter your email and password.');
    setLoading('login-btn', true);
    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password: pass });
    setLoading('login-btn', false);
    if (error) return setMsg('login-error', 'Invalid email or password.');

    const { data: profile } = await supabaseClient
        .from('profiles').select('is_active, role, full_name').eq('id', data.user.id).single();

    if (profile && profile.is_active === false) {
        await supabaseClient.auth.signOut();
        return setMsg('login-error', 'Your account has been deactivated. Please contact your administrator.');
    }

    await initApp(data.user);
}

// ── LOGOUT ────────────────────────────────────────────────
async function logout() {
    await supabaseClient.auth.signOut();
    currentUser = null; currentRole = null; currentName = null; allItems = [];
    $('login-email').value = ''; $('login-password').value = '';
    setMsg('login-error', '');
    showScreen('login-screen');
}

// ── INIT APP ──────────────────────────────────────────────
async function initApp(user) {
    if (isResettingPassword) return;
    currentUser = user;
    const { data: profile } = await supabaseClient
        .from('profiles').select('role, full_name').eq('id', user.id).single();
    currentRole = profile?.role || 'staff';
    currentName = profile?.full_name || user.email;
    $('user-label').textContent = currentName;
    const badge = $('role-badge');
    badge.textContent = currentRole.toUpperCase();
    badge.className   = `role-badge ${currentRole}`;
    $('tab-accounts').style.display = currentRole === 'admin' ? '' : 'none';
    
    // Hide POS and Reports from staff
    if (currentRole !== 'admin') {
        $('tab-pos').style.display = 'none';
        $('reports-hierarchy').style.display = 'none';
    } else {
        $('tab-pos').style.display = '';
        $('reports-hierarchy').style.display = '';
    }
    
    showScreen('app-screen');
    switchView('dashboard');
    loadItems();
    clearStockInputs();
}

// ── SESSION CHECK (runs on page load) ────────────────────
(async () => {
    showScreen('login-screen');
    const { data } = await supabaseClient.auth.getSession();
    if (data.session && !isResettingPassword) {
        const { data: profile } = await supabaseClient
            .from('profiles').select('is_active').eq('id', data.session.user.id).single();
        if (profile && profile.is_active === false) {
            await supabaseClient.auth.signOut();
            showScreen('login-screen');
        } else {
            await initApp(data.session.user);
        }
    }

    let authListenerSetup = false;
    const setupAuthListener = () => {
        if (authListenerSetup) return;
        authListenerSetup = true;
        supabaseClient.auth.onAuthStateChange(async (_event, session) => {
            if (isResettingPassword) return;
            if (session && !currentUser) await initApp(session.user);
            else if (!session) showScreen('login-screen');
        });
    };
    setupAuthListener();
})();

// ── HANDLE PASSWORD RESET REDIRECT ────────────────────────
(async () => {
    const hash = window.location.hash;
    if (hash && hash.includes('type=recovery')) {
        const params       = new URLSearchParams(hash.substring(1));
        const accessToken  = params.get('access_token');
        const refreshToken = params.get('refresh_token');
        if (accessToken) {
            isResettingPassword = true;
            const { error: sessionError } = await supabaseClient.auth.setSession({
                access_token:  accessToken,
                refresh_token: refreshToken || ''
            });
            if (sessionError) {
                alert('Invalid or expired reset link. Please request a new password reset.');
                isResettingPassword = false;
                showScreen('login-screen');
                return;
            }
            history.replaceState(null, '', window.location.pathname);
            showNewPasswordScreen();
            setTimeout(() => {
                if (isResettingPassword && $('new-password-screen')) {
                    document.querySelectorAll('.screen:not(#new-password-screen)').forEach(s => s.classList.remove('active'));
                    $('new-password-screen').classList.add('active');
                }
            }, 100);
        }
    }
})();

// ── NEW PASSWORD SCREEN ───────────────────────────────────
function showNewPasswordScreen() {
    if (!$('new-password-screen')) {
        const screen = document.createElement('div');
        screen.id = 'new-password-screen';
        screen.className = 'screen active';
        screen.innerHTML = `
            <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;
                background:radial-gradient(ellipse 80% 50% at 50% -10%,rgba(224,123,0,.12) 0%,transparent 70%),
                linear-gradient(180deg,#fff7ed 0%,#f0f2f5 100%);">
                <div style="width:100%;max-width:420px;display:flex;flex-direction:column;gap:28px;">
                    <div style="text-align:center">
                        <img src="image/mcclogo.png" alt="MCC Logo" class="brand-logo-img">
                        <h1 style="font-family:var(--display);font-size:40px;font-weight:800;letter-spacing:2px;text-transform:uppercase;color:var(--text);line-height:1">
                            MCC<span style="color:var(--accent);display:block;font-size:26px;font-weight:600;letter-spacing:6px">Inventory</span>
                        </h1>
                    </div>
                    <div class="login-card">
                        <h2>Set New Password</h2>
                        <p class="login-sub">Enter and confirm your new password below.</p>
                        <div class="field">
                            <label>New Password</label>
                            <input type="password" id="new-pw-input" placeholder="Min. 6 characters">
                        </div>
                        <div class="field">
                            <label>Confirm Password</label>
                            <input type="password" id="confirm-pw-input" placeholder="Re-enter password"
                                onkeydown="if(event.key==='Enter') submitNewPassword()">
                        </div>
                        <button class="btn-primary full" id="new-pw-btn" onclick="submitNewPassword()">
                            <span class="btn-text">Update Password</span>
                            <span class="btn-loader" style="display:none">Updating...</span>
                        </button>
                        <p id="new-pw-error"   class="form-error"></p>
                        <p id="new-pw-success" class="form-success"></p>
                    </div>
                </div>
            </div>`;
        document.body.appendChild(screen);
        document.querySelectorAll('.screen:not(#new-password-screen)').forEach(s => s.classList.remove('active'));
    } else {
        showScreen('new-password-screen');
    }
}

async function submitNewPassword() {
    const pw1   = $('new-pw-input')?.value || '';
    const pw2   = $('confirm-pw-input')?.value || '';
    const errEl = $('new-pw-error');
    const sucEl = $('new-pw-success');
    if (errEl) errEl.textContent = '';
    if (sucEl) sucEl.textContent = '';
    if (!pw1)           { if (errEl) errEl.textContent = 'Please enter a new password.'; return; }
    if (pw1.length < 6) { if (errEl) errEl.textContent = 'Password must be at least 6 characters.'; return; }
    if (pw1 !== pw2)    { if (errEl) errEl.textContent = 'Passwords do not match.'; return; }
    setLoading('new-pw-btn', true);
    const { error } = await supabaseClient.auth.updateUser({ password: pw1 });
    setLoading('new-pw-btn', false);
    if (error) { if (errEl) errEl.textContent = error.message; return; }
    if (sucEl) sucEl.textContent = 'Password updated! Redirecting to login...';
    await supabaseClient.auth.signOut();
    isResettingPassword = false;
    setTimeout(() => {
        const el = $('new-password-screen');
        if (el) el.remove();
        showScreen('login-screen');
    }, 2000);
}

// ── GLOBAL ESCAPE KEY ─────────────────────────────────────
document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
        closeEditModal();
        closeDeleteModal();
        closeEditAccountModal();
        closeResetModal();
        closeReceiptModal();
    }
});