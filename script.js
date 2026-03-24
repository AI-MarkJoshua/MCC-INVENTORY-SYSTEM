// ── SUPABASE SETUP ────────────────────────────────────────
const supabaseUrl = "https://kpppfqzktafjuchssiqa.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtwcHBmcXprdGFmanVjaHNzaXFhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQyMTg2MzgsImV4cCI6MjA4OTc5NDYzOH0.E_q4bktMrbigfn8piTj56dcc7mLihiCN_lmB-NBzsDc";
const supabaseClient = supabase.createClient(supabaseUrl, supabaseKey);

let currentUser = null;
let currentRole = null;
let allItems    = [];
let activeCategory = '';

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

// ── VIEW SWITCHING ────────────────────────────────────────
function switchView(view) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
    $(`view-${view}`).classList.add('active');
    $(`tab-${view}`).classList.add('active');
    if (view === 'accounts') loadAccounts();
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

    await initApp(data.user);
}

// ── LOGOUT ────────────────────────────────────────────────
async function logout() {
    await supabaseClient.auth.signOut();
    currentUser = null;
    currentRole = null;
    allItems    = [];
    $('login-email').value    = '';
    $('login-password').value = '';
    setMsg('login-error', '');
    showScreen('login-screen');
}

// ── INIT APP ──────────────────────────────────────────────
async function initApp(user) {
    currentUser = user;

    // Fetch role from profiles table
    const { data: profile } = await supabaseClient
        .from('profiles')
        .select('role, full_name')
        .eq('id', user.id)
        .single();

    currentRole = profile?.role || 'staff';
    const displayName = profile?.full_name || user.email;

    // Set header info
    $('user-label').textContent = displayName;
    const badge = $('role-badge');
    badge.textContent = currentRole.toUpperCase();
    badge.className   = `role-badge ${currentRole}`;

    // Show Accounts tab only for admin
    $('tab-accounts').style.display = currentRole === 'admin' ? '' : 'none';

    showScreen('app-screen');
    switchView('inventory');
    loadItems();
}

// ── SESSION CHECK ─────────────────────────────────────────
(async () => {
    const { data } = await supabaseClient.auth.getSession();
    if (data.session) {
        await initApp(data.session.user);
    } else {
        showScreen('login-screen');
    }

    supabaseClient.auth.onAuthStateChange(async (_event, session) => {
        if (session && !currentUser) await initApp(session.user);
        else if (!session) showScreen('login-screen');
    });
})();

// ── CREATE ACCOUNT (admin only) ───────────────────────────
async function createAccount() {
    if (currentRole !== 'admin') return;

    const name  = $('new-name').value.trim();
    const email = $('new-email').value.trim();
    const role  = $('new-role').value;
    const pass  = $('new-password').value;

    setMsg('create-error', '');
    setMsg('create-success', '');

    if (!name || !email || !pass) return setMsg('create-error', 'Please fill in all fields.');
    if (pass.length < 6) return setMsg('create-error', 'Password must be at least 6 characters.');

    setLoading('create-btn', true);

    // Sign up the new user
    const { data, error } = await supabaseClient.auth.signUp({
        email,
        password: pass,
        options: { data: { full_name: name } }
    });

    if (error) {
        setLoading('create-btn', false);
        return setMsg('create-error', error.message);
    }

    // Insert into profiles table
    if (data.user) {
        const { error: profileError } = await supabaseClient
            .from('profiles')
            .upsert({ id: data.user.id, full_name: name, email, role });

        if (profileError) {
            setLoading('create-btn', false);
            return setMsg('create-error', 'Account created but role could not be saved: ' + profileError.message);
        }
    }

    setLoading('create-btn', false);
    setMsg('create-success', `✓ Account created for ${name} (${role})`);

    // Clear fields
    ['new-name','new-email','new-password'].forEach(id => $(id).value = '');
    $('new-role').value = 'staff';

    loadAccounts();
}

// ── LOAD ACCOUNTS (admin only) ────────────────────────────
async function loadAccounts() {
    if (currentRole !== 'admin') return;

    const tbody = $('accounts-body');
    tbody.innerHTML = `<tr><td colspan="4" class="empty-row">Loading...</td></tr>`;

    const { data, error } = await supabaseClient
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) {
        tbody.innerHTML = `<tr><td colspan="4" class="empty-row" style="color:var(--red)">Error: ${error.message}</td></tr>`;
        return;
    }

    if (!data.length) {
        tbody.innerHTML = `<tr><td colspan="4" class="empty-row">No accounts found.</td></tr>`;
        return;
    }

    tbody.innerHTML = data.map(p => `
        <tr>
            <td><strong>${escHtml(p.full_name || '—')}</strong></td>
            <td style="color:var(--muted)">${escHtml(p.email || '—')}</td>
            <td><span class="badge badge-${p.role}">${(p.role || 'staff').toUpperCase()}</span></td>
            <td style="color:var(--muted); font-size:13px">${fmtDate(p.created_at)}</td>
        </tr>
    `).join('');
}

// ── STOCK IN ──────────────────────────────────────────────
async function addStock() {
    const name     = $('item-name').value.trim();
    const category = $('item-category').value;
    const qty      = parseInt($('item-qty').value);

    setMsg('action-msg', '');
    if (!name)        return setMsg('action-msg', 'Please enter an item name.', true);
    if (!qty || qty <= 0) return setMsg('action-msg', 'Enter a valid quantity.', true);

    const { data: existing } = await supabaseClient
        .from('items').select('*').ilike('name', name);

    if (existing && existing.length > 0) {
        const item   = existing[0];
        const newQty = item.quantity + qty;
        const { error } = await supabaseClient
            .from('items').update({ quantity: newQty, category: category || item.category })
            .eq('id', item.id);
        if (error) return setMsg('action-msg', error.message, true);
    } else {
        const { error } = await supabaseClient
            .from('items').insert([{ name, quantity: qty, category: category || 'Other' }]);
        if (error) return setMsg('action-msg', error.message, true);
    }

    setMsg('action-msg', `✓ Added ${qty} unit(s) of "${name}"`);
    clearStockInputs();
    loadItems();
}

// ── STOCK OUT ─────────────────────────────────────────────
async function removeStock() {
    const name = $('item-name').value.trim();
    const qty  = parseInt($('item-qty').value);

    setMsg('action-msg', '');
    if (!name)        return setMsg('action-msg', 'Please enter an item name.', true);
    if (!qty || qty <= 0) return setMsg('action-msg', 'Enter a valid quantity.', true);

    const { data, error } = await supabaseClient
        .from('items').select('*').ilike('name', name);

    if (error) return setMsg('action-msg', error.message, true);
    if (!data || data.length === 0) return setMsg('action-msg', `"${name}" not found in inventory.`, true);

    const item   = data[0];
    const newQty = item.quantity - qty;

    if (newQty < 0) return setMsg('action-msg', `Not enough stock! Available: ${item.quantity} unit(s).`, true);

    const { error: upErr } = await supabaseClient
        .from('items').update({ quantity: newQty }).eq('id', item.id);

    if (upErr) return setMsg('action-msg', upErr.message, true);

    setMsg('action-msg', `✓ Removed ${qty} unit(s) of "${name}" — ${newQty} remaining`);
    clearStockInputs();
    loadItems();
}

// ── LOAD ITEMS ────────────────────────────────────────────
async function loadItems() {
    const tbody = $('items-body');
    tbody.innerHTML = `<tr><td colspan="4" class="empty-row">Loading...</td></tr>`;

    const { data, error } = await supabaseClient
        .from('items').select('*').order('name', { ascending: true });

    if (error) {
        tbody.innerHTML = `<tr><td colspan="4" class="empty-row" style="color:var(--red)">Error: ${error.message}</td></tr>`;
        return;
    }

    allItems = data || [];
    updateDatalist(allItems);
    updateStats(allItems);
    applyFilters();
}

function applyFilters() {
    const q = ($('search')?.value || '').toLowerCase();
    let filtered = allItems;
    if (activeCategory) filtered = filtered.filter(i => i.category === activeCategory);
    if (q) filtered = filtered.filter(i => i.name.toLowerCase().includes(q));
    renderItems(filtered);
}

function renderItems(items) {
    const tbody = $('items-body');
    if (!items.length) {
        tbody.innerHTML = `<tr><td colspan="4" class="empty-row">No items found.</td></tr>`;
        return;
    }
    tbody.innerHTML = items.map(item => {
        const badge = item.quantity === 0
            ? `<span class="badge badge-out">Out of Stock</span>`
            : item.quantity <= 5
            ? `<span class="badge badge-low">Low Stock</span>`
            : `<span class="badge badge-ok">In Stock</span>`;
        return `<tr>
            <td><strong>${escHtml(item.name)}</strong></td>
            <td style="color:var(--muted);font-size:13px">${escHtml(item.category || '—')}</td>
            <td style="font-size:16px;font-weight:700">${item.quantity}</td>
            <td>${badge}</td>
        </tr>`;
    }).join('');
}

function updateStats(items) {
    $('stat-total').textContent = items.length;
    $('stat-qty').textContent   = items.reduce((s, i) => s + i.quantity, 0);
    $('stat-low').textContent   = items.filter(i => i.quantity > 0 && i.quantity <= 5).length;
    $('stat-out').textContent   = items.filter(i => i.quantity === 0).length;
}

function updateDatalist(items) {
    const dl = $('items-datalist');
    if (!dl) return;
    dl.innerHTML = items.map(i => `<option value="${escHtml(i.name)}">`).join('');
}

// ── SEARCH & FILTER ───────────────────────────────────────
function filterItems() { applyFilters(); }

function filterByCategory(cat, btn) {
    activeCategory = cat;
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    applyFilters();
}

// ── UTILS ─────────────────────────────────────────────────
function clearStockInputs() {
    $('item-name').value = '';
    $('item-qty').value  = '';
    $('item-category').value = '';
}