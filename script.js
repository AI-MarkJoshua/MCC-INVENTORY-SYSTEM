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
let isResettingPassword = false;

// ── POS STATE ─────────────────────────────────────────────
let cart = []; // [{itemId, name, retailPrice, qty, stock}]
let recentSales = [];
let lastReceiptData = null;

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

const fmtPeso = n => '₱' + parseFloat(n || 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

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
    if (view === 'pos')       initPOS();
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
    showScreen('app-screen');
    switchView('dashboard');
    loadItems();
    clearStockInputs();
}

// ── SESSION CHECK ─────────────────────────────────────────
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
    if (!filtered.length) { container.innerHTML = `<div class="empty-row">No accounts found.</div>`; return; }
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

async function toggleAccountStatus(profileId, currentlyActive) {
    const { error } = await supabaseClient
        .from('profiles').update({ is_active: !currentlyActive }).eq('id', profileId);
    if (error) { alert('Error updating status: ' + error.message); return; }
    loadAccounts();
}

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
    if (id === currentUser?.id) { currentName = name; $('user-label').textContent = name; }
    setLoading('edit-account-btn', false);
    $('edit-account-modal').classList.remove('active');
    document.body.style.overflow = '';
    loadAccounts();
}

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
            category:  category || 'Others',
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
    const name      = $('item-name').value.trim();
    const category  = $('item-category').value;
    const supplier  = $('item-supplier').value;
    const qty       = parseInt($('item-qty').value);
    const wholesale = parseFloat($('item-wholesale').value) || 0;
    const retail    = parseFloat($('item-retail').value) || 0;
    setMsg('action-msg','');
    if (!name)            return setMsg('action-msg','Please enter an item name.', true);
    if (!qty || qty <= 0) return setMsg('action-msg','Enter a valid quantity.', true);

    const { data: existing } = await supabaseClient.from('items').select('*').ilike('name', name);
    let itemId;
    if (existing && existing.length > 0) {
        const item   = existing[0];
        const newQty = item.quantity + qty;
        const updates = { quantity: newQty };
        if (category)  updates.category  = category;
        if (supplier)  updates.supplier  = supplier;
        if (wholesale) updates.wholesale_price = wholesale;
        if (retail)    updates.retail_price    = retail;
        const { error } = await supabaseClient.from('items').update(updates).eq('id', item.id);
        if (error) return setMsg('action-msg', error.message, true);
        itemId = item.id;
        setMsg('action-msg', `✓ "${name}" updated — quantity now ${newQty}`);
    } else {
        const { data: inserted, error } = await supabaseClient.from('items')
            .insert([{ name, quantity: qty, category: category || 'Others', supplier: supplier || '', wholesale_price: wholesale, retail_price: retail }])
            .select().single();
        if (error) return setMsg('action-msg', error.message, true);
        itemId = inserted?.id;
        setMsg('action-msg', `✓ Added ${qty} unit(s) of "${name}"`);
    }
    await logTransaction(itemId, name, category || 'Others', qty, 'stock_in');
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
    if (tbody) tbody.innerHTML = `<tr><td colspan="8" class="empty-row">Loading...</td></tr>`;
    const { data, error } = await supabaseClient.from('items').select('*').order('name', { ascending: true });
    if (error) { if (tbody) tbody.innerHTML = `<tr><td colspan="8" class="empty-row" style="color:var(--red)">Error: ${error.message}</td></tr>`; return; }
    allItems = data || [];
    updateDatalist(allItems); updateStats(allItems); updateFilterButtons(allItems);
    applyFilters(); setupItemNameAutoComplete();
}

function updateFilterButtons(items) {
    const cats = [...new Set(items.map(i => i.category).filter(Boolean))].sort();
    const row = $('filter-row');
    if (!row) return;
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
    if (!filteredItems.length) { tbody.innerHTML = `<tr><td colspan="8" class="empty-row">No items found.</td></tr>`; updatePagination(); return; }
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
            <td><span class="supplier-tag">${escHtml(item.supplier||'—')}</span></td>
            <td style="font-size:13px;color:var(--muted)">${item.wholesale_price ? fmtPeso(item.wholesale_price) : '—'}</td>
            <td style="font-size:14px;font-weight:600;color:var(--green)">${item.retail_price ? fmtPeso(item.retail_price) : '—'}</td>
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
        div.onclick = () => selectItem(item.name, item.category, item.supplier, item.wholesale_price, item.retail_price);
        dd.appendChild(div);
    });
}

function selectItem(name, category, supplier, wholesale, retail) {
    const input=$('item-name'), catSel=$('item-category'), dd=$('items-dropdown'), wrap=document.querySelector('.custom-dropdown');
    input.value = name;
    if (category) catSel.value = category;
    if (supplier) $('item-supplier').value = supplier;
    if (wholesale) $('item-wholesale').value = wholesale;
    if (retail) $('item-retail').value = retail;
    dd.classList.remove('active'); wrap.classList.remove('active');
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
    $('edit-id').value         = item.id;
    $('edit-name').value       = item.name;
    $('edit-qty').value        = item.quantity;
    $('edit-wholesale').value  = item.wholesale_price || '';
    $('edit-retail').value     = item.retail_price || '';
    setMsg('edit-error','');
    $('edit-category').value   = item.category || '';
    $('edit-supplier').value   = item.supplier  || '';
    $('edit-modal').classList.add('active'); document.body.style.overflow='hidden';
}
function closeEditModal(e) {
    if (e && e.target !== $('edit-modal')) return;
    $('edit-modal').classList.remove('active'); document.body.style.overflow='';
}
async function saveEdit() {
    const id        = parseInt($('edit-id').value);
    const name      = $('edit-name').value.trim();
    const category  = $('edit-category').value;
    const supplier  = $('edit-supplier').value;
    const wholesale = parseFloat($('edit-wholesale').value) || 0;
    const retail    = parseFloat($('edit-retail').value) || 0;
    const qty       = parseInt($('edit-qty').value);
    setMsg('edit-error','');
    if (!name) return setMsg('edit-error','Item name is required.');
    if (isNaN(qty)||qty<0) return setMsg('edit-error','Quantity must be 0 or more.');
    const dup=allItems.find(i=>i.name.toLowerCase()===name.toLowerCase()&&i.id!==id);
    if (dup) return setMsg('edit-error',`"${name}" already exists.`);
    const btn=document.querySelector('#edit-modal .btn-primary');
    const t=btn.querySelector('.btn-text'), l=btn.querySelector('.btn-loader');
    t.style.display='none'; l.style.display=''; btn.disabled=true;
    const { error }=await supabaseClient.from('items').update({
        name, category: category||'Others', supplier: supplier||'', wholesale_price: wholesale, retail_price: retail, quantity: qty
    }).eq('id',id);
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
    $('item-supplier').value=''; $('item-wholesale').value=''; $('item-retail').value='';
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
        if (match) {
            if (match.category) $('item-category').value = match.category;
            if (match.supplier) $('item-supplier').value = match.supplier;
            if (match.wholesale_price) $('item-wholesale').value = match.wholesale_price;
            if (match.retail_price)    $('item-retail').value    = match.retail_price;
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
    if (e.key==='Escape') { closeEditModal(); closeDeleteModal(); closeEditAccountModal(); closeResetModal(); closeReceiptModal(); }
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
    if (!transactions.length) { tbody.innerHTML=`<tr><td colspan="6" class="empty-row">No transactions found for this period.</td></tr>`; $('report-count').textContent=''; return; }
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

// ════════════════════════════════════════════════════════
// ── POS SYSTEM ──────────────────────────────────────────
// ════════════════════════════════════════════════════════

function initPOS() {
    if (!allItems.length) loadItems().then(() => setupPosSearch());
    else setupPosSearch();
    renderCart();
    renderRecentSales();
}

function setupPosSearch() {
    const input = $('pos-search');
    const dd    = $('pos-dropdown');
    const wrap  = input?.closest('.custom-dropdown');
    if (!input || !dd || !wrap) return;

    // Remove old listeners by replacing element
    const newInput = input.cloneNode(true);
    input.parentNode.replaceChild(newInput, input);

    newInput.addEventListener('input', function() {
        const v = this.value.trim().toLowerCase();
        const f = v ? allItems.filter(i => i.name.toLowerCase().includes(v) && i.quantity > 0) : allItems.filter(i => i.quantity > 0);
        renderPosDropdown(f, dd, wrap);
        dd.classList.toggle('active', true);
        wrap.classList.toggle('active', true);
    });
    newInput.addEventListener('focus', function() {
        const v = this.value.trim().toLowerCase();
        const f = v ? allItems.filter(i => i.name.toLowerCase().includes(v) && i.quantity > 0) : allItems.filter(i => i.quantity > 0);
        renderPosDropdown(f, dd, wrap);
        dd.classList.add('active'); wrap.classList.add('active');
    });

    document.addEventListener('click', e => {
        if (!wrap.contains(e.target)) { dd.classList.remove('active'); wrap.classList.remove('active'); }
    });
}

function filterPosItems() {
    const input = $('pos-search');
    const dd    = $('pos-dropdown');
    const wrap  = input?.closest('.custom-dropdown');
    if (!input || !dd || !wrap) return;
    const v = input.value.trim().toLowerCase();
    const f = v ? allItems.filter(i => i.name.toLowerCase().includes(v) && i.quantity > 0) : allItems.filter(i => i.quantity > 0);
    renderPosDropdown(f, dd, wrap);
    dd.classList.add('active'); wrap.classList.add('active');
}

function renderPosDropdown(items, dd, wrap) {
    if (!items.length) {
        dd.innerHTML = '<div class="dropdown-item" style="color:var(--muted)">No items in stock</div>';
        return;
    }
    dd.innerHTML = items.slice(0, 20).map(item => {
        const price = item.retail_price ? fmtPeso(item.retail_price) : 'No price set';
        return `<div class="dropdown-item pos-item-option" onclick="addToCart(${item.id})">
            <div style="display:flex;justify-content:space-between;align-items:center;gap:12px">
                <div>
                    <div style="font-weight:600;color:var(--text)">${escHtml(item.name)}</div>
                    <div style="font-size:11px;color:var(--muted);margin-top:1px">${escHtml(item.category||'—')} · Stock: ${item.quantity}</div>
                </div>
                <div style="font-weight:700;color:var(--green);font-size:14px;white-space:nowrap">${price}</div>
            </div>
        </div>`;
    }).join('');
}

function addToCart(itemId) {
    const item = allItems.find(i => i.id === itemId);
    if (!item) return;
    if (!item.retail_price || item.retail_price <= 0) {
        if (!confirm(`"${item.name}" has no retail price set. Add anyway with ₱0.00?`)) return;
    }

    const existing = cart.find(c => c.itemId === itemId);
    const availableStock = item.quantity - (existing ? existing.qty : 0);

    if (availableStock <= 0) {
        alert(`No more stock available for "${item.name}".`);
        return;
    }

    if (existing) {
        existing.qty++;
    } else {
        cart.push({ itemId: item.id, name: item.name, retailPrice: item.retail_price || 0, qty: 1, stock: item.quantity, category: item.category });
    }

    // Clear search
    const input = $('pos-search');
    const dd    = $('pos-dropdown');
    const wrap  = input?.closest('.custom-dropdown');
    if (input) input.value = '';
    if (dd)    dd.classList.remove('active');
    if (wrap)  wrap.classList.remove('active');

    renderCart();
}

function removeFromCart(itemId) {
    cart = cart.filter(c => c.itemId !== itemId);
    renderCart();
}

function updateCartQty(itemId, delta) {
    const c = cart.find(c => c.itemId === itemId);
    if (!c) return;
    const item = allItems.find(i => i.id === itemId);
    const maxStock = item ? item.quantity : c.stock;
    c.qty += delta;
    if (c.qty <= 0) { removeFromCart(itemId); return; }
    if (c.qty > maxStock) { c.qty = maxStock; }
    renderCart();
}

function clearCart() {
    if (cart.length === 0) return;
    if (!confirm('Clear all items from cart?')) return;
    cart = [];
    $('pos-customer').value = '';
    $('pos-payment').value  = '';
    renderCart();
}

function renderCart() {
    const empty   = $('cart-empty');
    const tableWr = $('cart-table-wrap');
    const tbody   = $('cart-body');

    if (!cart.length) {
        empty.style.display   = '';
        tableWr.style.display = 'none';
        updateCheckout();
        return;
    }

    empty.style.display   = 'none';
    tableWr.style.display = '';

    tbody.innerHTML = cart.map(c => `
        <tr>
            <td>
                <div style="font-weight:600;color:var(--text)">${escHtml(c.name)}</div>
                <div style="font-size:11px;color:var(--muted)">${escHtml(c.category||'—')}</div>
            </td>
            <td style="color:var(--green);font-weight:600">${fmtPeso(c.retailPrice)}</td>
            <td>
                <div class="qty-control">
                    <button class="qty-btn" onclick="updateCartQty(${c.itemId}, -1)">−</button>
                    <span class="qty-val">${c.qty}</span>
                    <button class="qty-btn" onclick="updateCartQty(${c.itemId}, 1)">+</button>
                </div>
            </td>
            <td style="font-weight:700;color:var(--text)">${fmtPeso(c.retailPrice * c.qty)}</td>
            <td>
                <button class="btn-action btn-del" onclick="removeFromCart(${c.itemId})" style="padding:4px 8px;font-size:11px">✕</button>
            </td>
        </tr>`).join('');

    updateCheckout();
}

function getCartTotal() {
    return cart.reduce((sum, c) => sum + (c.retailPrice * c.qty), 0);
}

function updateCheckout() {
    const total = getCartTotal();
    $('checkout-subtotal').textContent = fmtPeso(total);
    $('checkout-total').textContent    = fmtPeso(total);
    calcChange();
}

function calcChange() {
    const total   = getCartTotal();
    const payment = parseFloat($('pos-payment')?.value) || 0;
    const change  = payment - total;
    const el      = $('change-amount');
    const disp    = $('change-display');
    if (!el || !disp) return;

    if (payment <= 0) {
        el.textContent  = '₱0.00';
        el.style.color  = 'var(--text)';
        disp.classList.remove('change-insufficient');
    } else if (change < 0) {
        el.textContent  = `− ${fmtPeso(Math.abs(change))}`;
        el.style.color  = 'var(--red)';
        disp.classList.add('change-insufficient');
    } else {
        el.textContent  = fmtPeso(change);
        el.style.color  = 'var(--green)';
        disp.classList.remove('change-insufficient');
    }
}

async function processCheckout() {
    if (!cart.length)  return setMsg('pos-msg', 'Cart is empty!', true);
    const total   = getCartTotal();
    const payment = parseFloat($('pos-payment')?.value) || 0;
    if (payment < total) return setMsg('pos-msg', 'Payment amount is less than total.', true);

    const customer = $('pos-customer').value.trim() || 'Walk-in Customer';
    setLoading('checkout-btn', true);

    try {
        // Deduct stock for each cart item
        for (const c of cart) {
            const item = allItems.find(i => i.id === c.itemId);
            if (!item) continue;
            const newQty = item.quantity - c.qty;
            if (newQty < 0) throw new Error(`Insufficient stock for "${c.name}"`);
            await supabaseClient.from('items').update({ quantity: newQty }).eq('id', c.itemId);
            await logTransaction(c.itemId, c.name, c.category, c.qty, 'stock_out');
        }

        // Build receipt data
        const receiptData = {
            customer,
            items:    [...cart],
            total,
            payment,
            change:   payment - total,
            soldBy:   currentName,
            date:     new Date()
        };
        lastReceiptData = receiptData;

        // Show receipt
        showReceipt(receiptData);

        // Add to recent sales
        recentSales.unshift({ ...receiptData, id: Date.now() });
        if (recentSales.length > 10) recentSales.pop();
        renderRecentSales();

        // Reset cart
        cart = [];
        $('pos-customer').value = '';
        $('pos-payment').value  = '';
        renderCart();
        await loadItems(); // Refresh stock

    } catch (err) {
        setMsg('pos-msg', err.message, true);
    }

    setLoading('checkout-btn', false);
}

function showReceipt(data) {
    const content = $('receipt-content');
    const dateStr = data.date.toLocaleDateString('en-PH', { year:'numeric', month:'long', day:'numeric' });
    const timeStr = data.date.toLocaleTimeString('en-PH', { hour:'2-digit', minute:'2-digit', hour12:true });
    content.innerHTML = `
        <div class="receipt-wrap">
            <div class="receipt-header">
                <img src="image/mcclogo.png" alt="MCC" class="receipt-logo" onerror="this.style.display='none'">
                <div class="receipt-org">MCC<span>Inventory</span></div>
                <div class="receipt-sub">Bike Parts &amp; Supplies</div>
                <div class="receipt-date">${dateStr} · ${timeStr}</div>
            </div>
            <div class="receipt-customer">
                <span class="receipt-label">Customer:</span> ${escHtml(data.customer)}
            </div>
            <div class="receipt-divider">- - - - - - - - - - - - - - - - - - - -</div>
            <table class="receipt-items">
                <thead><tr><th>Item</th><th>Qty</th><th>Price</th><th>Sub</th></tr></thead>
                <tbody>
                    ${data.items.map(c=>`<tr>
                        <td>${escHtml(c.name)}</td>
                        <td style="text-align:center">${c.qty}</td>
                        <td style="text-align:right">${fmtPeso(c.retailPrice)}</td>
                        <td style="text-align:right;font-weight:700">${fmtPeso(c.retailPrice*c.qty)}</td>
                    </tr>`).join('')}
                </tbody>
            </table>
            <div class="receipt-divider">- - - - - - - - - - - - - - - - - - - -</div>
            <div class="receipt-totals">
                <div class="receipt-row"><span>TOTAL</span><span class="receipt-total-num">${fmtPeso(data.total)}</span></div>
                <div class="receipt-row"><span>CASH</span><span>${fmtPeso(data.payment)}</span></div>
                <div class="receipt-row receipt-change-row"><span>CHANGE</span><span class="receipt-change-num">${fmtPeso(data.change)}</span></div>
            </div>
            <div class="receipt-divider">- - - - - - - - - - - - - - - - - - - -</div>
            <div class="receipt-footer">
                <p>Served by: ${escHtml(data.soldBy)}</p>
                <p>Thank you for your purchase! 🚲</p>
            </div>
        </div>`;
    $('receipt-modal').classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeReceiptModal(e) {
    if (e && e.target !== $('receipt-modal')) return;
    $('receipt-modal').classList.remove('active');
    document.body.style.overflow = '';
}

function printReceipt() {
    if (!lastReceiptData) return;
    const d = lastReceiptData;
    const dateStr = d.date.toLocaleDateString('en-PH',{year:'numeric',month:'long',day:'numeric'});
    const timeStr = d.date.toLocaleTimeString('en-PH',{hour:'2-digit',minute:'2-digit',hour12:true});
    const win = window.open('','_blank','width=400,height=600');
    win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Receipt</title>
    <style>
        *{box-sizing:border-box;margin:0;padding:0}
        body{font-family:'Courier New',monospace;font-size:12px;padding:20px;max-width:300px;margin:0 auto}
        .logo{width:50px;height:50px;object-fit:contain;display:block;margin:0 auto 6px}
        .org{text-align:center;font-size:18px;font-weight:900;letter-spacing:2px}
        .org span{color:#e07b00}
        .sub{text-align:center;font-size:10px;color:#666;margin-bottom:4px}
        .date{text-align:center;font-size:10px;color:#999;margin-bottom:10px}
        .customer{margin:8px 0;font-size:12px}
        .divider{border:none;border-top:1px dashed #ccc;margin:10px 0}
        table{width:100%;border-collapse:collapse;font-size:11px}
        th{text-align:left;font-weight:700;padding:2px 0;border-bottom:1px solid #ddd}
        th:last-child,td:last-child{text-align:right}
        th:nth-child(2),td:nth-child(2){text-align:center}
        th:nth-child(3),td:nth-child(3){text-align:right}
        td{padding:3px 0}
        .totals{margin-top:8px}
        .tot-row{display:flex;justify-content:space-between;padding:2px 0;font-size:12px}
        .tot-row.total{font-size:16px;font-weight:900;border-top:2px solid #000;margin-top:6px;padding-top:6px}
        .tot-row.change{font-weight:700;color:#16a34a}
        .footer{text-align:center;margin-top:12px;font-size:11px;color:#666}
        @media print{@page{margin:0.5cm}body{padding:10px}}
    </style></head><body>
    <img src="image/mcclogo.png" class="logo" onerror="this.style.display='none'">
    <div class="org">MCC<span>Inventory</span></div>
    <div class="sub">Bike Parts & Supplies</div>
    <div class="date">${dateStr} · ${timeStr}</div>
    <div class="customer"><strong>Customer:</strong> ${escHtml(d.customer)}</div>
    <hr class="divider">
    <table>
        <thead><tr><th>Item</th><th>Qty</th><th>Price</th><th>Sub</th></tr></thead>
        <tbody>${d.items.map(c=>`<tr>
            <td>${escHtml(c.name)}</td>
            <td style="text-align:center">${c.qty}</td>
            <td style="text-align:right">${fmtPeso(c.retailPrice)}</td>
            <td style="text-align:right">${fmtPeso(c.retailPrice*c.qty)}</td>
        </tr>`).join('')}</tbody>
    </table>
    <hr class="divider">
    <div class="totals">
        <div class="tot-row total"><span>TOTAL</span><span>${fmtPeso(d.total)}</span></div>
        <div class="tot-row"><span>CASH</span><span>${fmtPeso(d.payment)}</span></div>
        <div class="tot-row change"><span>CHANGE</span><span>${fmtPeso(d.change)}</span></div>
    </div>
    <hr class="divider">
    <div class="footer"><p>Served by: ${escHtml(d.soldBy)}</p><p>Thank you! 🚲</p></div>
    </body></html>`);
    win.document.close();
    win.onload = () => { win.focus(); win.print(); };
}

function renderRecentSales() {
    const list = $('recent-sales-list');
    if (!list) return;
    if (!recentSales.length) {
        list.innerHTML = '<div style="padding:20px;text-align:center;font-size:13px;color:var(--muted)">No sales yet today.</div>';
        return;
    }
    list.innerHTML = recentSales.map(s => {
        const time = s.date.toLocaleTimeString('en-PH',{hour:'2-digit',minute:'2-digit',hour12:true});
        return `<div class="recent-sale-item" onclick="showReceipt(recentSales.find(x=>x.id===${s.id}))">
            <div class="recent-sale-left">
                <div class="recent-sale-customer">${escHtml(s.customer)}</div>
                <div class="recent-sale-meta">${s.items.length} item${s.items.length!==1?'s':''} · ${time}</div>
            </div>
            <div class="recent-sale-total">${fmtPeso(s.total)}</div>
        </div>`;
    }).join('');
}

// ── HANDLE PASSWORD RESET REDIRECT ────────────────────────
(async () => {
    const hash = window.location.hash;
    if (hash && hash.includes('type=recovery')) {
        const params = new URLSearchParams(hash.substring(1));
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
    const pw1 = $('new-pw-input')?.value || '';
    const pw2 = $('confirm-pw-input')?.value || '';
    const errEl = $('new-pw-error');
    const sucEl = $('new-pw-success');
    if (errEl) errEl.textContent = '';
    if (sucEl) sucEl.textContent = '';
    if (!pw1) { if (errEl) errEl.textContent = 'Please enter a new password.'; return; }
    if (pw1.length < 6) { if (errEl) errEl.textContent = 'Password must be at least 6 characters.'; return; }
    if (pw1 !== pw2) { if (errEl) errEl.textContent = 'Passwords do not match.'; return; }
    setLoading('new-pw-btn', true);
    const { error } = await supabaseClient.auth.updateUser({ password: pw1 });
    setLoading('new-pw-btn', false);
    if (error) { if (errEl) errEl.textContent = error.message; return; }
    if (sucEl) sucEl.textContent = '✓ Password updated! Redirecting to login...';
    await supabaseClient.auth.signOut();
    isResettingPassword = false;
    setTimeout(() => {
        const el = $('new-password-screen');
        if (el) el.remove();
        showScreen('login-screen');
    }, 2000);
}