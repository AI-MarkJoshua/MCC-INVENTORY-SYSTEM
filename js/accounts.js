// ── ACCOUNTS MODULE ───────────────────────────────────────

let allAccounts   = [];
let accountFilter = 'all';
let resetTargetEmail = null;

// ── CREATE ACCOUNT ────────────────────────────────────────
async function createAccount() {
    if (currentRole !== 'admin') return;
    const name  = $('new-name').value.trim();
    const email = $('new-email').value.trim();
    const role  = $('new-role').value;
    const pass  = $('new-password').value;
    setMsg('create-error', ''); setMsg('create-success', '');
    if (!name || !email || !pass) return setMsg('create-error', 'Please fill in all fields.');
    if (pass.length < 6)         return setMsg('create-error', 'Password must be at least 6 characters.');
    setLoading('create-btn', true);

    const { data, error } = await supabaseClient.auth.signUp({
        email, password: pass, options: { data: { full_name: name } }
    });
    if (error) { setLoading('create-btn', false); return setMsg('create-error', error.message); }

    if (data.user) {
        const { error: pe } = await supabaseClient.from('profiles')
            .upsert({ id: data.user.id, full_name: name, email, role, is_active: true });
        if (pe) { setLoading('create-btn', false); return setMsg('create-error', 'Account created but role could not be saved: ' + pe.message); }
    }

    setLoading('create-btn', false);
    setMsg('create-success', `✓ Account created for ${name} (${role})`);
    ['new-name', 'new-email', 'new-password'].forEach(id => $(id).value = '');
    $('new-role').value = 'staff';
    loadAccounts();
}

// ── LOAD ACCOUNTS ─────────────────────────────────────────
async function loadAccounts() {
    if (currentRole !== 'admin') return;
    const container = $('accounts-list');
    container.innerHTML = `<div class="empty-row">Loading...</div>`;
    const { data, error } = await supabaseClient
        .from('profiles').select('*').order('created_at', { ascending: false });
    if (error) {
        container.innerHTML = `<div class="empty-row" style="color:var(--red)">Error: ${error.message}</div>`;
        return;
    }
    allAccounts = data || [];
    renderAccounts();
}

function filterAccounts(filter, btn) {
    accountFilter = filter;
    document.querySelectorAll('.accounts-filter-row .filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    renderAccounts();
}

function renderAccounts() {
    const container = $('accounts-list');
    let filtered    = allAccounts;
    if (accountFilter === 'active')   filtered = allAccounts.filter(a => a.is_active !== false);
    if (accountFilter === 'inactive') filtered = allAccounts.filter(a => a.is_active === false);
    if (!filtered.length) { container.innerHTML = `<div class="empty-row">No accounts found.</div>`; return; }

    container.innerHTML = filtered.map(p => {
        const isActive = p.is_active !== false;
        const isSelf   = p.id === currentUser?.id;
        return `
        <div class="account-card ${isActive ? '' : 'account-inactive'}">
            <div class="account-card-left">
                <div class="account-avatar ${p.role}">${(p.full_name || '?').charAt(0).toUpperCase()}</div>
                <div class="account-info">
                    <div class="account-name">
                        ${escHtml(p.full_name || '—')}
                        ${isSelf ? '<span class="you-badge">You</span>' : ''}
                    </div>
                    <div class="account-email">${escHtml(p.email || '—')}</div>
                    <div class="account-meta">
                        <span class="badge badge-${p.role}">${(p.role || 'staff').toUpperCase()}</span>
                        <span class="status-dot ${isActive ? 'active' : 'inactive'}">
                            ${isActive ? '● Active' : '● Inactive'}
                        </span>
                        <span class="account-date">Joined ${fmtDate(p.created_at)}</span>
                    </div>
                </div>
            </div>
            <div class="account-card-actions">
                <button class="acc-btn acc-edit"  onclick="openEditAccountModal('${p.id}')">✏️ Edit</button>
                <button class="acc-btn acc-reset" onclick="openResetModal('${escHtml(p.email || '')}')">🔑 Reset PW</button>
                ${!isSelf ? `
                <button class="acc-btn ${isActive ? 'acc-deactivate' : 'acc-activate'}"
                    onclick="toggleAccountStatus('${p.id}', ${isActive})">
                    ${isActive ? '🚫 Deactivate' : '✅ Activate'}
                </button>` : ''}
            </div>
        </div>`;
    }).join('');
}

async function toggleAccountStatus(profileId, currentlyActive) {
    const { error } = await supabaseClient
        .from('profiles').update({ is_active: !currentlyActive }).eq('id', profileId);
    if (error) { alert('Error updating status: ' + error.message); return; }
    loadAccounts();
}

// ── EDIT ACCOUNT MODAL ────────────────────────────────────
function openEditAccountModal(profileId) {
    const profile = allAccounts.find(a => a.id === profileId);
    if (!profile) return;
    $('edit-account-id').value       = profile.id;
    $('edit-account-name').value     = profile.full_name || '';
    $('edit-account-email').value    = profile.email || '';
    $('edit-account-role').value     = profile.role || 'staff';
    $('edit-account-password').value = '';
    setMsg('edit-account-error', '');
    $('edit-account-modal').classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeEditAccountModal(e) {
    if (e && e.target !== $('edit-account-modal')) return;
    $('edit-account-modal').classList.remove('active');
    document.body.style.overflow = '';
}

async function saveAccountEdit() {
    const id   = $('edit-account-id').value;
    const name = $('edit-account-name').value.trim();
    const role = $('edit-account-role').value;
    const pass = $('edit-account-password').value;
    setMsg('edit-account-error', '');
    if (!name) return setMsg('edit-account-error', 'Full name is required.');
    if (pass && pass.length < 6) return setMsg('edit-account-error', 'New password must be at least 6 characters.');
    setLoading('edit-account-btn', true);

    const { error } = await supabaseClient.from('profiles').update({ full_name: name, role }).eq('id', id);
    if (error) { setLoading('edit-account-btn', false); return setMsg('edit-account-error', error.message); }
    if (id === currentUser?.id) { currentName = name; $('user-label').textContent = name; }

    setLoading('edit-account-btn', false);
    $('edit-account-modal').classList.remove('active');
    document.body.style.overflow = '';
    loadAccounts();
}

// ── RESET PASSWORD MODAL ──────────────────────────────────
function openResetModal(email) {
    resetTargetEmail = email;
    $('reset-user-email').textContent = email;
    setMsg('reset-error', ''); setMsg('reset-success', '');
    $('reset-modal').classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeResetModal(e) {
    if (e && e.target !== $('reset-modal')) return;
    $('reset-modal').classList.remove('active');
    document.body.style.overflow = '';
    resetTargetEmail = null;
}

async function confirmResetPassword() {
    if (!resetTargetEmail) return;
    setMsg('reset-error', ''); setMsg('reset-success', '');
    setLoading('reset-confirm-btn', true);
    const { error } = await supabaseClient.auth.resetPasswordForEmail(resetTargetEmail, {
        redirectTo: window.location.origin + window.location.pathname
    });
    setLoading('reset-confirm-btn', false);
    if (error) return setMsg('reset-error', error.message);
    setMsg('reset-success', `✓ Reset link sent to ${resetTargetEmail}`);
    setTimeout(() => { closeResetModal(); }, 2000);
}