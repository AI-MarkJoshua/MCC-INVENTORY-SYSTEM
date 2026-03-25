// ── SUPABASE SETUP ────────────────────────────────────────
const supabaseUrl = "https://kpppfqzktafjuchssiqa.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtwcHBmcXprdGFmanVjaHNzaXFhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQyMTg2MzgsImV4cCI6MjA4OTc5NDYzOH0.E_q4bktMrbigfn8piTj56dcc7mLihiCN_lmB-NBzsDc";
const supabaseClient = supabase.createClient(supabaseUrl, supabaseKey);

let currentUser     = null;
let currentRole     = null;
let currentName     = null;
let allItems        = [];
let allAccounts     = [];
let activeCategory  = '';
let deleteTargetId  = null;
let currentPage     = 1;
let itemsPerPage    = 10;
let filteredItems   = [];
let categoryChart   = null;
let accountFilter   = 'all';
let resetTargetEmail = null;

// ── HELPERS ───────────────────────────────────────────────
const $ = id => document.getElementById(id);

const showScreen = id => {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    $(id).classList.add('active');
};

const setMsg = (id, text, isError = false) => {
    const el = $(id);
    if (!el) return;
    el.textContent = text;
    if (id === 'action-msg') el.className = 'action-msg' + (isError ? ' error' : '');
    if (text) setTimeout(() => { if (el.textContent === text) el.textContent = ''; }, 4000);
};

const setLoading = (btnId, loading) => {
    const btn = $(btnId);
    if (!btn) return;
    const t = btn.querySelector('.btn-text');
    const l = btn.querySelector('.btn-loader');
    if (t) t.style.display = loading ? 'none' : '';
    if (l) l.style.display = loading ? '' : 'none';
    btn.disabled = loading;
};

const escHtml = s => String(s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');

const fmtDate = iso => iso
    ? new Date(iso).toLocaleDateString('en-PH', { year:'numeric', month:'short', day:'numeric' })
    : '—';

const fmtDateTime = iso => {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleDateString('en-PH', { year:'numeric', month:'2-digit', day:'2-digit' })
        + ' ' + d.toLocaleTimeString('en-PH', { hour:'2-digit', minute:'2-digit', hour12: true });
};

// ── AUTH SCREENS ──────────────────────────────────────────
function showForgotPassword() {
    $('forgot-email').value = $('login-email').value || '';
    setMsg('forgot-error',''); setMsg('forgot-success','');
    showScreen('forgot-screen');
}
function showLogin() { showScreen('login-screen'); }

async function sendResetEmail() {
    const email = $('forgot-email').value.trim();
    setMsg('forgot-error',''); setMsg('forgot-success','');
    if (!email) return setMsg('forgot-error','Please enter your email address.');
    setLoading('forgot-btn', true);
    const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + window.location.pathname
    });
    setLoading('forgot-btn', false);
    if (error) return setMsg('forgot-error', error.message);
    setMsg('forgot-success', '✓ Reset link sent! Check your email inbox.');
}

// ── CATEGORY HELPERS ──────────────────────────────────────
function handleCategoryChange(selectEl, wrapId) {
    const wrap = $(wrapId);
    if (!wrap) return;
    wrap.style.display = selectEl.value === '__custom__' ? 'block' : 'none';
}
function getCategoryValue(selectId, customId) {
    const sel = $(selectId);
    if (!sel) return '';
    if (sel.value === '__custom__') return $(customId)?.value.trim() || '';
    return sel.value;
}

// ── VIEW SWITCHING ────────────────────────────────────────
function switchView(view) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
    $(`view-${view}`).classList.add('active');
    $(`tab-${view}`).classList.add('active');
    if (view === 'accounts')  loadAccounts();
    if (view === 'dashboard') loadDashboard();
    if (view === 'inventory') loadItems();
    if (view === 'reports')   initReportDefaults();
}

// ── LOGIN ─────────────────────────────────────────────────
async function login() {
    const email = $('login-email').value.trim();
    const pass  = $('login-password').value;
    setMsg('login-error','');
    if (!email || !pass) return setMsg('login-error','Please enter your email and password.');
    setLoading('login-btn', true);
    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password: pass });
    setLoading('login-btn', false);
    if (error) return setMsg('login-error','Invalid email or password.');

    // Check if account is active
    const { data: profile } = await supabaseClient
        .from('profiles').select('is_active, role, full_name').eq('id', data.user.id).single();

    if (profile && profile.is_active === false) {
        await supabaseClient.auth.signOut();
        return setMsg('login-error','Your account has been deactivated. Please contact your administrator.');
    }

    await initApp(data.user);
}

// ── LOGOUT ────────────────────────────────────────────────
async function logout() {
    await supabaseClient.auth.signOut();
    currentUser = null; currentRole = null; currentName = null; allItems = [];
    $('login-email').value = ''; $('login-password').value = '';
    setMsg('login-error','');
    showScreen('login-screen');
}

// ── INIT APP ──────────────────────────────────────────────
async function initApp(user) {
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
    showScreen('app-screen');
    switchView('dashboard');
    await updateCategoryDropdowns();
    loadItems();
    clearStockInputs();
}

// ── SESSION CHECK ─────────────────────────────────────────
(async () => {
    showScreen('login-screen');
    const { data } = await supabaseClient.auth.getSession();
    if (data.session) {
        // Check active status before auto-login
        const { data: profile } = await supabaseClient
            .from('profiles').select('is_active').eq('id', data.session.user.id).single();
        if (profile && profile.is_active === false) {
            await supabaseClient.auth.signOut();
            showScreen('login-screen');
        } else {
            await initApp(data.session.user);
        }
    }
    supabaseClient.auth.onAuthStateChange(async (_event, session) => {
        if (session && !currentUser) await initApp(session.user);
        else if (!session) showScreen('login-screen');
    });
})();

// ── CUSTOM CATEGORIES ─────────────────────────────────────
async function saveCustomCategory(name) {
    if (!name) return;
    try {
        const { data: existing } = await supabaseClient
            .from('custom_categories').select('*').eq('name', name).single();
        if (existing) return;
        await supabaseClient.from('custom_categories').insert([{ name }]);
    } catch(e) {}
}
async function loadCustomCategories() {
    try {
        const { data } = await supabaseClient
            .from('custom_categories').select('*').order('name', { ascending: true });
        return data || [];
    } catch(e) { return []; }
}
async function updateCategoryDropdowns() {
    const customCats = await loadCustomCategories();
    ['item-category','edit-category'].forEach(selId => {
        const sel = $(selId);
        if (!sel) return;
        const cv = sel.value;
        const defaults = ['Chain','Seat / Saddle','Wheels','Brakes','Pedals','Handlebars','Frame','Tires','Gears / Derailleur','Lights','Other'];
        Array.from(sel.options).forEach(opt => {
            if (opt.value && opt.value !== '__custom__' && !defaults.includes(opt.text)) sel.remove(opt.index);
        });
        const addOpt = Array.from(sel.options).find(o => o.value === '__custom__');
        customCats.forEach(cat => {
            const o = document.createElement('option');
            o.value = cat.name; o.textContent = cat.name;
            sel.insertBefore(o, addOpt);
        });
        if (cv) sel.value = cv;
    });
}

// ── CREATE ACCOUNT ────────────────────────────────────────
async function createAccount() {
    if (currentRole !== 'admin') return;
    const name  = $('new-name').value.trim();
    const email = $('new-email').value.trim();
    const role  = $('new-role').value;
    const pass  = $('new-password').value;
    setMsg('create-error',''); setMsg('create-success','');
    if (!name || !email || !pass) return setMsg('create-error','Please fill in all fields.');
    if (pass.length < 6) return setMsg('create-error','Password must be at least 6 characters.');
    setLoading('create-btn', true);
    const { data, error } = await supabaseClient.auth.signUp({
        email, password: pass, options: { data: { full_name: name } }
    });
    if (error) { setLoading('create-btn', false); return setMsg('create-error', error.message); }
    if (data.user) {
        const { error: pe } = await supabaseClient.from('profiles')
            .upsert({ id: data.user.id, full_name: name, email, role, is_active: true });
        if (pe) { setLoading('create-btn', false); return setMsg('create-error','Account created but role could not be saved: ' + pe.message); }
    }
    setLoading('create-btn', false);
    setMsg('create-success', `✓ Account created for ${name} (${role})`);
    ['new-name','new-email','new-password'].forEach(id => $(id).value = '');
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
    if (error) { container.innerHTML = `<div class="empty-row" style="color:var(--red)">Error: ${error.message}</div>`; return; }
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
    let filtered = allAccounts;
    if (accountFilter === 'active')   filtered = allAccounts.filter(a => a.is_active !== false);
    if (accountFilter === 'inactive') filtered = allAccounts.filter(a => a.is_active === false);

    if (!filtered.length) {
        container.innerHTML = `<div class="empty-row">No accounts found.</div>`;
        return;
    }

    container.innerHTML = filtered.map(p => {
        const isActive = p.is_active !== false;
        const isSelf   = p.id === currentUser?.id;
        return `
        <div class="account-card ${isActive ? '' : 'account-inactive'}">
            <div class="account-card-left">
                <div class="account-avatar ${p.role}">${(p.full_name||'?').charAt(0).toUpperCase()}</div>
                <div class="account-info">
                    <div class="account-name">
                        ${escHtml(p.full_name||'—')}
                        ${isSelf ? '<span class="you-badge">You</span>' : ''}
                    </div>
                    <div class="account-email">${escHtml(p.email||'—')}</div>
                    <div class="account-meta">
                        <span class="badge badge-${p.role}">${(p.role||'staff').toUpperCase()}</span>
                        <span class="status-dot ${isActive ? 'active' : 'inactive'}">
                            ${isActive ? '● Active' : '● Inactive'}
                        </span>
                        <span class="account-date">Joined ${fmtDate(p.created_at)}</span>
                    </div>
                </div>
            </div>
            <div class="account-card-actions">
                <button class="acc-btn acc-edit" onclick="openEditAccountModal('${p.id}')">✏️ Edit</button>
                <button class="acc-btn acc-reset" onclick="openResetModal('${escHtml(p.email||'')}')">🔑 Reset PW</button>
                ${!isSelf ? `
                <button class="acc-btn ${isActive ? 'acc-deactivate' : 'acc-activate'}"
                    onclick="toggleAccountStatus('${p.id}', ${isActive})">
                    ${isActive ? '🚫 Deactivate' : '✅ Activate'}
                </button>` : ''}
            </div>
        </div>`;
    }).join('');
}

// ── TOGGLE ACTIVE STATUS ──────────────────────────────────
async function toggleAccountStatus(profileId, currentlyActive) {
    const newStatus = !currentlyActive;
    const { error } = await supabaseClient
        .from('profiles').update({ is_active: newStatus }).eq('id', profileId);
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
    setMsg('edit-account-error','');
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
    setMsg('edit-account-error','');
    if (!name) return setMsg('edit-account-error','Full name is required.');
    if (pass && pass.length < 6) return setMsg('edit-account-error','New password must be at least 6 characters.');

    setLoading('edit-account-btn', true);
    const { error } = await supabaseClient.from('profiles').update({ full_name: name, role }).eq('id', id);
    if (error) { setLoading('edit-account-btn', false); return setMsg('edit-account-error', error.message); }

    // If updating own name, refresh header
    if (id === currentUser?.id) {
        currentName = name;
        $('user-label').textContent = name;
    }

    setLoading('edit-account-btn', false);
    $('edit-account-modal').classList.remove('active');
    document.body.style.overflow = '';
    loadAccounts();
}

// ── RESET PASSWORD MODAL ──────────────────────────────────
function openResetModal(email) {
    resetTargetEmail = email;
    $('reset-user-email').textContent = email;
    setMsg('reset-error',''); setMsg('reset-success','');
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
    setMsg('reset-error',''); setMsg('reset-success','');
    setLoading('reset-confirm-btn', true);
    const { error } = await supabaseClient.auth.resetPasswordForEmail(resetTargetEmail, {
        redirectTo: window.location.origin + window.location.pathname
    });
    setLoading('reset-confirm-btn', false);
    if (error) return setMsg('reset-error', error.message);
    setMsg('reset-success', `✓ Reset link sent to ${resetTargetEmail}`);
    setTimeout(() => { closeResetModal(); }, 2000);
}

// ── LOG TRANSACTION ───────────────────────────────────────
async function logTransaction(itemId, itemName, category, qty, type) {
    try {
        await supabaseClient.from('transactions').insert([{
            item_id:   itemId,
            item_name: itemName,
            category:  category || 'Other',
            quantity:  qty,
            type,
            user_id:   currentUser?.id || null,
            user_name: currentName || 'Unknown',
            user_role: currentRole || 'staff'
        }]);
    } catch(e) { console.error('Failed to log transaction:', e); }
}

// ── STOCK IN ──────────────────────────────────────────────
async function addStock() {
    const name     = $('item-name').value.trim();
    const catSel   = $('item-category');
    const category = getCategoryValue('item-category', 'custom-category');
    const qty      = parseInt($('item-qty').value);
    setMsg('action-msg','');
    if (!name)            return setMsg('action-msg','Please enter an item name.', true);
    if (!qty || qty <= 0) return setMsg('action-msg','Enter a valid quantity.', true);
    if (catSel.value === '__custom__' && category) {
        await saveCustomCategory(category); await updateCategoryDropdowns();
    }
    const { data: existing } = await supabaseClient.from('items').select('*').ilike('name', name);
    let itemId;
    if (existing && existing.length > 0) {
        const item = existing[0];
        const newQty = item.quantity + qty;
        const { error } = await supabaseClient.from('items')
            .update({ quantity: newQty, category: category || item.category }).eq('id', item.id);
        if (error) return setMsg('action-msg', error.message, true);
        itemId = item.id;
        setMsg('action-msg', `✓ "${name}" already exists — quantity updated to ${newQty}`);
    } else {
        const { data: inserted, error } = await supabaseClient.from('items')
            .insert([{ name, quantity: qty, category: category || 'Other' }]).select().single();
        if (error) return setMsg('action-msg', error.message, true);
        itemId = inserted?.id;
        setMsg('action-msg', `✓ Added ${qty} unit(s) of "${name}"`);
    }
    await logTransaction(itemId, name, category || 'Other', qty, 'stock_in');
    clearStockInputs(); loadItems();
}

// ── STOCK OUT ─────────────────────────────────────────────
async function removeStock() {
    const name = $('item-name').value.trim();
    const qty  = parseInt($('item-qty').value);
    setMsg('action-msg','');
    if (!name)            return setMsg('action-msg','Please enter an item name.', true);
    if (!qty || qty <= 0) return setMsg('action-msg','Enter a valid quantity.', true);
    const { data, error } = await supabaseClient.from('items').select('*').ilike('name', name);
    if (error) return setMsg('action-msg', error.message, true);
    if (!data || !data.length) return setMsg('action-msg', `"${name}" not found in inventory.`, true);
    const item   = data[0];
    const newQty = item.quantity - qty;
    if (newQty < 0) return setMsg('action-msg', `Not enough stock! Available: ${item.quantity} unit(s).`, true);
    const { error: upErr } = await supabaseClient.from('items').update({ quantity: newQty }).eq('id', item.id);
    if (upErr) return setMsg('action-msg', upErr.message, true);
    await logTransaction(item.id, item.name, item.category, qty, 'stock_out');
    setMsg('action-msg', `✓ Removed ${qty} unit(s) of "${name}" — ${newQty} remaining`);
    clearStockInputs(); loadItems();
}

// ── LOAD ITEMS ────────────────────────────────────────────
async function loadItems() {
    const tbody = $('items-body');
    tbody.innerHTML = `<tr><td colspan="5" class="empty-row">Loading...</td></tr>`;
    const { data, error } = await supabaseClient.from('items').select('*').order('name', { ascending: true });
    if (error) { tbody.innerHTML = `<tr><td colspan="5" class="empty-row" style="color:var(--red)">Error: ${error.message}</td></tr>`; return; }
    allItems = data || [];
    updateDatalist(allItems); updateStats(allItems); updateFilterButtons(allItems);
    applyFilters(); setupItemNameAutoComplete();
}

function updateFilterButtons(items) {
    const cats = [...new Set(items.map(i => i.category).filter(Boolean))].sort();
    const row = $('filter-row');
    row.innerHTML = `<button class="filter-btn ${activeCategory===''?'active':''}" onclick="filterByCategory('',this)">All</button>`;
    cats.forEach(cat => {
        const label = cat.length > 14 ? cat.substring(0,14)+'…' : cat;
        row.innerHTML += `<button class="filter-btn ${activeCategory===cat?'active':''}" title="${escHtml(cat)}" onclick="filterByCategory('${escHtml(cat)}',this)">${escHtml(label)}</button>`;
    });
}

function applyFilters() {
    const q = ($('search')?.value||'').toLowerCase();
    let f = allItems;
    if (activeCategory) f = f.filter(i => i.category === activeCategory);
    if (q) f = f.filter(i => i.name.toLowerCase().includes(q));
    filteredItems = f; currentPage = 1; renderItems();
}

function renderItems() {
    const tbody = $('items-body');
    if (!filteredItems.length) { tbody.innerHTML = `<tr><td colspan="5" class="empty-row">No items found.</td></tr>`; updatePagination(); return; }
    const start = (currentPage-1)*itemsPerPage, end = start+itemsPerPage;
    tbody.innerHTML = filteredItems.slice(start, end).map(item => {
        const badge = item.quantity===0
            ? `<span class="badge badge-out">Out of Stock</span>`
            : item.quantity<=5
            ? `<span class="badge badge-low">Low Stock</span>`
            : `<span class="badge badge-ok">In Stock</span>`;
        const actions = currentRole==='admin'
            ? `<button class="btn-action btn-edit" onclick="openEditModal(${item.id})">✏️ Edit</button>
               <button class="btn-action btn-del"  onclick="openDeleteModal(${item.id},'${escHtml(item.name)}')">🗑️ Delete</button>`
            : `<span style="color:var(--muted);font-size:12px">—</span>`;
        return `<tr>
            <td><strong>${escHtml(item.name)}</strong></td>
            <td><span class="cat-tag">${escHtml(item.category||'—')}</span></td>
            <td style="font-size:16px;font-weight:700">${item.quantity}</td>
            <td>${badge}</td>
            <td class="actions-cell">${actions}</td>
        </tr>`;
    }).join('');
    updatePagination();
}

function updateStats(items) {
    $('stat-total').textContent = items.length;
    $('stat-qty').textContent   = items.reduce((s,i)=>s+i.quantity,0);
    $('stat-low').textContent   = items.filter(i=>i.quantity>0&&i.quantity<=5).length;
    $('stat-out').textContent   = items.filter(i=>i.quantity===0).length;
}

function updateDatalist(items) {
    const dd = $('items-dropdown'); if (!dd) return;
    dd.innerHTML = '';
    if (!items.length) { dd.innerHTML = '<div class="dropdown-item">No items found</div>'; return; }
    items.forEach(item => {
        const div = document.createElement('div');
        div.className = 'dropdown-item'; div.textContent = item.name;
        div.onclick = () => selectItem(item.name, item.category);
        dd.appendChild(div);
    });
}

function selectItem(name, category) {
    const input=$('item-name'), catSel=$('item-category'), dd=$('items-dropdown'), wrap=document.querySelector('.custom-dropdown');
    input.value = name;
    if (category) {
        const opts = Array.from(catSel.options).map(o=>o.value);
        if (opts.includes(category)) { catSel.value=category; $('custom-category-wrap').style.display='none'; }
        else { catSel.value='__custom__'; $('custom-category-wrap').style.display='block'; if($('custom-category'))$('custom-category').value=category; }
    }
    dd.classList.remove('active'); wrap.classList.remove('active');
    input.dispatchEvent(new Event('input'));
}

function filterItems() { applyFilters(); }
function filterByCategory(cat, btn) {
    activeCategory = cat;
    document.querySelectorAll('.filter-btn').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active'); applyFilters();
}

// ── EDIT ITEM MODAL ───────────────────────────────────────
function openEditModal(id) {
    const item = allItems.find(i=>i.id===id); if (!item) return;
    $('edit-id').value=item.id; $('edit-name').value=item.name; $('edit-qty').value=item.quantity;
    setMsg('edit-error','');
    const sel=$('edit-category'), opts=Array.from(sel.options).map(o=>o.value);
    if (opts.includes(item.category)) { sel.value=item.category; $('edit-custom-wrap').style.display='none'; }
    else if (item.category) { sel.value='__custom__'; $('edit-custom-wrap').style.display='block'; $('edit-custom-category').value=item.category; }
    else { sel.value=''; $('edit-custom-wrap').style.display='none'; }
    $('edit-modal').classList.add('active'); document.body.style.overflow='hidden';
}
function closeEditModal(e) {
    if (e && e.target !== $('edit-modal')) return;
    $('edit-modal').classList.remove('active'); document.body.style.overflow='';
}
async function saveEdit() {
    const id=parseInt($('edit-id').value), name=$('edit-name').value.trim();
    const catSel=$('edit-category'), category=getCategoryValue('edit-category','edit-custom-category');
    const qty=parseInt($('edit-qty').value);
    setMsg('edit-error','');
    if (!name) return setMsg('edit-error','Item name is required.');
    if (isNaN(qty)||qty<0) return setMsg('edit-error','Quantity must be 0 or more.');
    const dup=allItems.find(i=>i.name.toLowerCase()===name.toLowerCase()&&i.id!==id);
    if (dup) return setMsg('edit-error',`"${name}" already exists. Use Stock In to add quantity instead.`);
    if (catSel.value==='__custom__'&&category) { await saveCustomCategory(category); await updateCategoryDropdowns(); }
    const btn=document.querySelector('#edit-modal .btn-primary');
    const t=btn.querySelector('.btn-text'), l=btn.querySelector('.btn-loader');
    t.style.display='none'; l.style.display=''; btn.disabled=true;
    const { error }=await supabaseClient.from('items').update({ name, category:category||'Other', quantity:qty }).eq('id',id);
    t.style.display=''; l.style.display='none'; btn.disabled=false;
    if (error) return setMsg('edit-error', error.message);
    $('edit-modal').classList.remove('active'); document.body.style.overflow=''; loadItems();
}

// ── DELETE ITEM MODAL ─────────────────────────────────────
function openDeleteModal(id, name) {
    deleteTargetId=id; $('delete-item-name').textContent=name;
    $('delete-modal').classList.add('active'); document.body.style.overflow='hidden';
}
function closeDeleteModal(e) {
    if (e && e.target !== $('delete-modal')) return;
    $('delete-modal').classList.remove('active'); document.body.style.overflow=''; deleteTargetId=null;
}
async function confirmDelete() {
    if (!deleteTargetId) return;
    const { error }=await supabaseClient.from('items').delete().eq('id',deleteTargetId);
    if (error) { alert('Error deleting item: '+error.message); return; }
    $('delete-modal').classList.remove('active'); document.body.style.overflow=''; deleteTargetId=null; loadItems();
}

// ── UTILS ─────────────────────────────────────────────────
function clearStockInputs() {
    $('item-name').value=''; $('item-qty').value=''; $('item-category').value='';
    $('custom-category-wrap').style.display='none';
    if($('custom-category'))$('custom-category').value='';
}

// ── PAGINATION ────────────────────────────────────────────
function updatePagination() {
    const total=filteredItems.length, totalPages=Math.ceil(total/itemsPerPage);
    const info=$('pagination-info-text'), ctrl=$('pagination-controls');
    if (!info||!ctrl) return;
    const s=total===0?0:(currentPage-1)*itemsPerPage+1, e=Math.min(currentPage*itemsPerPage,total);
    info.textContent=`Showing ${s}–${e} of ${total} items`;
    ctrl.innerHTML='';
    if (totalPages<=1) return;
    const prev=document.createElement('button');
    prev.className='pagination-btn'; prev.textContent='‹'; prev.disabled=currentPage===1;
    prev.onclick=()=>goToPage(currentPage-1); ctrl.appendChild(prev);
    for (let i=1;i<=totalPages;i++) {
        if (i===1||i===totalPages||Math.abs(i-currentPage)<=1) {
            const b=document.createElement('button');
            b.className='pagination-btn'+(i===currentPage?' active':'');
            b.textContent=i; b.onclick=()=>goToPage(i); ctrl.appendChild(b);
        } else if (Math.abs(i-currentPage)===2) {
            const sp=document.createElement('span'); sp.className='pagination-ellipsis'; sp.textContent='…'; ctrl.appendChild(sp);
        }
    }
    const next=document.createElement('button');
    next.className='pagination-btn'; next.textContent='›'; next.disabled=currentPage===totalPages;
    next.onclick=()=>goToPage(currentPage+1); ctrl.appendChild(next);
}
function goToPage(page) {
    const total=Math.ceil(filteredItems.length/itemsPerPage);
    if(page<1||page>total) return;
    currentPage=page; renderItems();
}

// ── AUTOCOMPLETE ──────────────────────────────────────────
function setupItemNameAutoComplete() {
    const input=$('item-name'), dd=$('items-dropdown'), wrap=document.querySelector('.custom-dropdown');
    if (!input||!dd||!wrap) return;
    input.addEventListener('input', function() {
        const v=this.value.trim();
        const f=v?allItems.filter(i=>i.name.toLowerCase().includes(v.toLowerCase())):allItems;
        updateDatalist(f);
        if (v) { dd.classList.add('active'); wrap.classList.add('active'); }
        else   { dd.classList.remove('active'); wrap.classList.remove('active'); }
        const match=allItems.find(i=>i.name.toLowerCase()===v.toLowerCase());
        if (match?.category) {
            const sel=$('item-category'), opts=Array.from(sel.options).map(o=>o.value);
            if (opts.includes(match.category)) { sel.value=match.category; $('custom-category-wrap').style.display='none'; }
            else { sel.value='__custom__'; $('custom-category-wrap').style.display='block'; if($('custom-category'))$('custom-category').value=match.category; }
        }
    });
    input.addEventListener('focus', function() {
        const v=this.value.trim();
        updateDatalist(v?allItems.filter(i=>i.name.toLowerCase().includes(v.toLowerCase())):allItems);
        dd.classList.add('active'); wrap.classList.add('active');
    });
    const arrow=document.querySelector('.dropdown-arrow');
    if (arrow) arrow.addEventListener('click', e=>{
        e.stopPropagation();
        const open=dd.classList.contains('active');
        if (open) { dd.classList.remove('active'); wrap.classList.remove('active'); }
        else { updateDatalist(allItems); dd.classList.add('active'); wrap.classList.add('active'); }
    });
    document.addEventListener('click', e=>{ if(!wrap.contains(e.target)){dd.classList.remove('active');wrap.classList.remove('active');} });
}

document.addEventListener('keydown', e => {
    if (e.key==='Escape') { closeEditModal(); closeDeleteModal(); closeEditAccountModal(); closeResetModal(); }
});

// ── DASHBOARD ─────────────────────────────────────────────
async function loadDashboard() {
    if (!allItems.length) await loadItems();
    updateStats(allItems); updateCategoryChart();
}
function updateCategoryChart() {
    const canvas=$('categoryChart'); if (!canvas) return;
    const sorted=[...allItems].sort((a,b)=>b.quantity-a.quantity).slice(0,15);
    if (categoryChart) categoryChart.destroy();
    categoryChart = new Chart(canvas.getContext('2d'), {
        type:'bar',
        data:{
            labels: sorted.map(i=>i.name),
            datasets:[{ label:'Stock Level', data:sorted.map(i=>i.quantity),
                backgroundColor:sorted.map(i=>i.quantity===0?'#dc2626':i.quantity<=5?'#d97706':'#16a34a'),
                borderColor:sorted.map(i=>i.quantity===0?'#991b1b':i.quantity<=5?'#92400e':'#14532d'),
                borderWidth:1, borderRadius:4 }]
        },
        options:{ responsive:true, maintainAspectRatio:false,
            plugins:{ legend:{display:false}, tooltip:{ callbacks:{ label:ctx=>{ const q=ctx.parsed.y; return [`Quantity: ${q}`,`Status: ${q===0?'Out of Stock':q<=5?'Low Stock':'In Stock'}`]; } }} },
            scales:{ y:{beginAtZero:true,grid:{color:'rgba(107,114,128,0.1)'},ticks:{color:'#6b7280'}}, x:{grid:{display:false},ticks:{color:'#374151',maxRotation:45,autoSkip:true}} }
        }
    });
}

// ── REPORTS ───────────────────────────────────────────────
function initReportDefaults() {
    // Leave dates blank — user picks their own range
    $('report-results').style.display = 'none';
    setMsg('report-error','');
}

async function generateReport() {
    const type      = $('report-type').value;
    const startDate = $('report-start').value;
    const endDate   = $('report-end').value;
    setMsg('report-error','');
    if (!startDate || !endDate) return setMsg('report-error','Please select both a start date and an end date.');
    if (startDate > endDate)    return setMsg('report-error','Start date cannot be after end date.');

    const btn = $('report-generate-btn');
    const t=btn.querySelector('.btn-text'), l=btn.querySelector('.btn-loader');
    t.style.display='none'; l.style.display=''; btn.disabled=true;

    const endInclusive = new Date(endDate);
    endInclusive.setDate(endInclusive.getDate()+1);
    const endStr = endInclusive.toISOString().split('T')[0];

    let query = supabaseClient.from('transactions').select('*')
        .gte('created_at', startDate+'T00:00:00')
        .lt('created_at',  endStr+'T00:00:00')
        .order('created_at', { ascending: true });
    if (type !== 'both') query = query.eq('type', type);

    const { data, error } = await query;
    t.style.display=''; l.style.display='none'; btn.disabled=false;
    if (error) return setMsg('report-error','Error fetching report: '+error.message);
    renderReport(data||[], type, startDate, endDate);
}

function renderReport(transactions, type, startDate, endDate) {
    const results=$('report-results');
    results.style.display='block';
    results.scrollIntoView({ behavior:'smooth', block:'start' });
    const typeLabel=type==='both'?'Stock In & Out':type==='stock_in'?'Stock In Only':'Stock Out Only';
    const fmt=d=>new Date(d+'T00:00:00').toLocaleDateString('en-PH',{year:'numeric',month:'long',day:'numeric'});
    $('report-subtitle').textContent=`${typeLabel} · ${fmt(startDate)} — ${fmt(endDate)}`;
    const totalIn=transactions.filter(t=>t.type==='stock_in').reduce((s,t)=>s+t.quantity,0);
    const totalOut=transactions.filter(t=>t.type==='stock_out').reduce((s,t)=>s+t.quantity,0);
    $('report-summary').innerHTML=`
        <div class="summary-badge summary-total">📄 ${transactions.length} Transaction${transactions.length!==1?'s':''}</div>
        ${type!=='stock_out'?`<div class="summary-badge summary-in">▲ ${totalIn} unit${totalIn!==1?'s':''} stocked in</div>`:''}
        ${type!=='stock_in'?`<div class="summary-badge summary-out">▼ ${totalOut} unit${totalOut!==1?'s':''} stocked out</div>`:''}`;
    const tbody=$('report-body');
    if (!transactions.length) {
        tbody.innerHTML=`<tr><td colspan="6" class="empty-row">No transactions found for this period.</td></tr>`;
        $('report-count').textContent=''; return;
    }
    tbody.innerHTML=transactions.map(tx=>{
        const rb=tx.type==='stock_in'
            ?`<span class="badge badge-in-remark">▲ Stock In</span>`
            :`<span class="badge badge-out-remark">▼ Stock Out</span>`;
        return `<tr>
            <td style="white-space:nowrap;font-size:13px">${fmtDateTime(tx.created_at)}</td>
            <td><strong>${escHtml(tx.user_name||'—')}</strong><span class="role-chip">${escHtml(tx.user_role||'—')}</span></td>
            <td><strong>${escHtml(tx.item_name||'—')}</strong></td>
            <td><span class="cat-tag">${escHtml(tx.category||'—')}</span></td>
            <td style="font-weight:700;font-size:15px">${tx.quantity}</td>
            <td>${rb}</td>
        </tr>`;
    }).join('');
    $('report-count').textContent=`Total: ${transactions.length} record${transactions.length!==1?'s':''}`;
}

// ── PRINT REPORT ──────────────────────────────────────────
function printReport() {
    const subtitle=$('report-subtitle')?.textContent||'';
    const summary=$('report-summary')?.innerHTML||'';
    const tableHTML=$('report-table')?.outerHTML||'';
    const today=new Date().toLocaleDateString('en-PH',{year:'numeric',month:'long',day:'numeric'});
    const printContent=`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>MCC Inventory Report</title>
    <style>
        *{box-sizing:border-box;margin:0;padding:0}
        body{font-family:Arial,sans-serif;font-size:13px;color:#1a1d23;padding:32px}
        .print-header{display:flex;align-items:center;gap:16px;margin-bottom:8px;border-bottom:3px solid #e07b00;padding-bottom:16px}
        .print-logo{width:60px;height:60px;object-fit:contain}
        .print-org h1{font-size:22px;font-weight:800;letter-spacing:2px;text-transform:uppercase}
        .print-org h1 span{color:#e07b00}
        .print-org p{font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:1px;margin-top:2px}
        .print-title{margin:16px 0 4px}.print-title h2{font-size:16px;font-weight:700;text-transform:uppercase;letter-spacing:1px}
        .print-title p{font-size:12px;color:#6b7280;margin-top:2px}
        .print-meta{font-size:11px;color:#9ca3af;margin-bottom:16px}
        .summary-row{display:flex;gap:12px;margin-bottom:16px;flex-wrap:wrap}
        .summary-badge{font-size:11px;font-weight:700;padding:4px 12px;border-radius:20px}
        .summary-total{background:#f1f5f9;color:#374151;border:1px solid #e2e6ed}
        .summary-in{background:#f0fdf4;color:#16a34a;border:1px solid #bbf7d0}
        .summary-out{background:#fef2f2;color:#dc2626;border:1px solid #fecaca}
        table{width:100%;border-collapse:collapse;font-size:12px}
        thead th{background:#f8f9fb;text-align:left;padding:8px 10px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:#6b7280;border-bottom:2px solid #e2e6ed;border-top:1px solid #e2e6ed}
        tbody tr{border-bottom:1px solid #f0f2f5}tbody tr:last-child{border-bottom:none}
        tbody td{padding:8px 10px;vertical-align:middle}
        .cat-tag{background:#f1f5f9;color:#6b7280;border:1px solid #e2e6ed;border-radius:4px;font-size:10px;font-weight:600;padding:2px 6px;text-transform:uppercase}
        .badge{display:inline-block;padding:2px 8px;border-radius:20px;font-size:10px;font-weight:700;text-transform:uppercase}
        .badge-in-remark{background:#f0fdf4;color:#16a34a;border:1px solid #bbf7d0}
        .badge-out-remark{background:#fef2f2;color:#dc2626;border:1px solid #fecaca}
        .role-chip{font-size:10px;background:#f1f5f9;color:#6b7280;border-radius:4px;padding:1px 6px;margin-left:4px;text-transform:uppercase}
        .print-footer{margin-top:24px;padding-top:12px;border-top:1px solid #e2e6ed;display:flex;justify-content:space-between;font-size:11px;color:#9ca3af}
        @media print{body{padding:16px}@page{margin:1cm}}
    </style></head><body>
    <div class="print-header">
        <img src="image/mcclogo.png" alt="MCC Logo" class="print-logo" onerror="this.style.display='none'">
        <div class="print-org"><h1>MCC<span>Inventory</span></h1><p>Bike Parts &amp; Supplies System</p></div>
    </div>
    <div class="print-title"><h2>Transaction Report</h2><p>${escHtml(subtitle)}</p></div>
    <p class="print-meta">Generated on ${today} by ${escHtml(currentName||'—')} (${escHtml(currentRole||'—')})</p>
    <div class="summary-row">${summary}</div>
    ${tableHTML}
    <div class="print-footer"><span>MCC Bike Inventory System</span><span>Printed: ${today}</span></div>
    </body></html>`;
    const win=window.open('','_blank','width=900,height=700');
    win.document.write(printContent); win.document.close();
    win.onload=()=>{ win.focus(); win.print(); };
}