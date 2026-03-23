// ── SUPABASE SETUP ───────────────────────────────────────
const supabaseUrl = "https://kpppfqzktafjuchssiqa.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtwcHBmcXprdGFmanVjaHNzaXFhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQyMTg2MzgsImV4cCI6MjA4OTc5NDYzOH0.E_q4bktMrbigfn8piTj56dcc7mLihiCN_lmB-NBzsDc";
const supabaseClient = supabase.createClient(supabaseUrl, supabaseKey);

// ── HELPERS ──────────────────────────────────────────────
const showScreen = (id) => {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(id).classList.add('active');
};

const setMsg = (id, text, isError = false) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = text;
    if (id === 'action-msg') {
        el.className = 'action-msg' + (isError ? ' error' : '');
    }
    if (text) setTimeout(() => { if (el.textContent === text) el.textContent = ''; }, 3500);
};

const setLoading = (btnEl, loading) => {
    const text   = btnEl.querySelector('.btn-text');
    const loader = btnEl.querySelector('.btn-loader');
    if (!text || !loader) return;
    text.style.display   = loading ? 'none' : '';
    loader.style.display = loading ? '' : 'none';
    btnEl.disabled = loading;
};

// ── TAB SWITCH ───────────────────────────────────────────
function switchTab(tab) {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
    document.querySelector(`.tab[onclick="switchTab('${tab}')"]`).classList.add('active');
    document.getElementById(`${tab}-form`).classList.add('active');
}

// ── REGISTER ─────────────────────────────────────────────
async function register() {
    const name  = document.getElementById('reg-name').value.trim();
    const email = document.getElementById('reg-email').value.trim();
    const pass  = document.getElementById('reg-password').value;
    const btn   = document.querySelector('#register-form .btn-primary');

    setMsg('reg-error', '');
    setMsg('reg-success', '');

    if (!name || !email || !pass) {
        return setMsg('reg-error', 'Please fill in all fields.');
    }
    if (pass.length < 6) {
        return setMsg('reg-error', 'Password must be at least 6 characters.');
    }

    setLoading(btn, true);

    const { data, error } = await supabaseClient.auth.signUp({
        email,
        password: pass,
        options: { data: { full_name: name } }
    });

    setLoading(btn, false);

    if (error) return setMsg('reg-error', error.message);

    // If email confirmation is disabled in Supabase, session is returned immediately
    if (data.session) {
        initApp(data.session.user);
    } else {
        setMsg('reg-success', '✓ Account created! Check your email to confirm, then sign in.');
    }
}

// ── LOGIN ────────────────────────────────────────────────
async function login() {
    const email = document.getElementById('login-email').value.trim();
    const pass  = document.getElementById('login-password').value;
    const btn   = document.querySelector('#login-form .btn-primary');

    setMsg('login-error', '');

    if (!email || !pass) {
        return setMsg('login-error', 'Please enter your email and password.');
    }

    setLoading(btn, true);

    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password: pass });

    setLoading(btn, false);

    if (error) return setMsg('login-error', error.message);

    initApp(data.user);
}

// ── LOGOUT ───────────────────────────────────────────────
async function logout() {
    await supabaseClient.auth.signOut();
    showScreen('auth-screen');
    // Clear inputs
    ['login-email','login-password','reg-name','reg-email','reg-password'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    setMsg('login-error', '');
    switchTab('login');
}

// ── INIT APP ─────────────────────────────────────────────
function initApp(user) {
    const label = document.getElementById('user-label');
    const name  = user.user_metadata?.full_name || user.email;
    label.textContent = name;
    showScreen('app-screen');
    loadItems();
}

// ── SESSION CHECK ON LOAD ─────────────────────────────────
(async () => {
    const { data } = await supabaseClient.auth.getSession();
    if (data.session) {
        initApp(data.session.user);
    } else {
        showScreen('auth-screen');
    }

    // Listen for auth changes (e.g. email confirm in another tab)
    supabaseClient.auth.onAuthStateChange((_event, session) => {
        if (session) {
            initApp(session.user);
        } else {
            showScreen('auth-screen');
        }
    });
})();

// ── STOCK IN ─────────────────────────────────────────────
async function addStock() {
    const name = document.getElementById('name').value.trim();
    const qty  = parseInt(document.getElementById('qty').value);

    setMsg('action-msg', '');

    if (!name)      return setMsg('action-msg', 'Please enter an item name.', true);
    if (!qty || qty <= 0) return setMsg('action-msg', 'Enter a valid quantity.', true);

    // Check if item already exists
    const { data: existing } = await supabaseClient
        .from('items').select('*').eq('name', name);

    if (existing && existing.length > 0) {
        // Update existing
        const newQty = existing[0].quantity + qty;
        const { error } = await supabaseClient
            .from('items').update({ quantity: newQty }).eq('id', existing[0].id);
        if (error) return setMsg('action-msg', error.message, true);
    } else {
        // Insert new
        const { error } = await supabaseClient
            .from('items').insert([{ name, quantity: qty }]);
        if (error) return setMsg('action-msg', error.message, true);
    }

    setMsg('action-msg', `✓ Added ${qty} unit(s) of "${name}"`);
    clearInputs();
    loadItems();
}

// ── STOCK OUT ────────────────────────────────────────────
async function removeStock() {
    const name = document.getElementById('name').value.trim();
    const qty  = parseInt(document.getElementById('qty').value);

    setMsg('action-msg', '');

    if (!name)      return setMsg('action-msg', 'Please enter an item name.', true);
    if (!qty || qty <= 0) return setMsg('action-msg', 'Enter a valid quantity.', true);

    const { data, error } = await supabaseClient
        .from('items').select('*').eq('name', name);

    if (error) return setMsg('action-msg', error.message, true);
    if (!data || data.length === 0) return setMsg('action-msg', `"${name}" not found.`, true);

    const item   = data[0];
    const newQty = item.quantity - qty;

    if (newQty < 0) return setMsg('action-msg', `Not enough stock! Available: ${item.quantity}`, true);

    const { error: updateError } = await supabaseClient
        .from('items').update({ quantity: newQty }).eq('id', item.id);

    if (updateError) return setMsg('action-msg', updateError.message, true);

    setMsg('action-msg', `✓ Removed ${qty} unit(s) of "${name}"`);
    clearInputs();
    loadItems();
}

// ── LOAD ITEMS ───────────────────────────────────────────
let allItems = [];

async function loadItems() {
    const tbody = document.getElementById('items-body');
    tbody.innerHTML = `<tr><td colspan="3" class="empty-row">Loading...</td></tr>`;

    const { data, error } = await supabaseClient
        .from('items').select('*').order('name', { ascending: true });

    if (error) {
        tbody.innerHTML = `<tr><td colspan="3" class="empty-row" style="color:#ff6b6b">Error: ${error.message}</td></tr>`;
        return;
    }

    allItems = data || [];
    renderItems(allItems);
    updateStats(allItems);
}

function renderItems(items) {
    const tbody = document.getElementById('items-body');

    if (!items.length) {
        tbody.innerHTML = `<tr><td colspan="3" class="empty-row">No items yet. Add some stock!</td></tr>`;
        return;
    }

    tbody.innerHTML = items.map(item => {
        const badge = item.quantity === 0
            ? `<span class="badge badge-out">Out of Stock</span>`
            : item.quantity <= 5
            ? `<span class="badge badge-low">Low Stock</span>`
            : `<span class="badge badge-ok">In Stock</span>`;

        return `<tr>
            <td><strong>${escapeHtml(item.name)}</strong></td>
            <td style="font-family: var(--mono); font-size:15px;">${item.quantity}</td>
            <td>${badge}</td>
        </tr>`;
    }).join('');
}

function updateStats(items) {
    const totalItems = items.length;
    const totalQty   = items.reduce((sum, i) => sum + i.quantity, 0);
    const lowStock   = items.filter(i => i.quantity > 0 && i.quantity <= 5).length;

    document.getElementById('stat-total').textContent = totalItems;
    document.getElementById('stat-qty').textContent   = totalQty;
    document.getElementById('stat-low').textContent   = lowStock;
}

// ── SEARCH / FILTER ──────────────────────────────────────
function filterItems() {
    const q = document.getElementById('search').value.toLowerCase();
    const filtered = allItems.filter(i => i.name.toLowerCase().includes(q));
    renderItems(filtered);
}

// ── UTILS ────────────────────────────────────────────────
function clearInputs() {
    document.getElementById('name').value = '';
    document.getElementById('qty').value  = '';
}

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}