// ── SUPABASE SETUP ────────────────────────────────────────
const supabaseUrl = "https://kpppfqzktafjuchssiqa.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtwcHBmcXprdGFmanVjaHNzaXFhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQyMTg2MzgsImV4cCI6MjA4OTc5NDYzOH0.E_q4bktMrbigfn8piTj56dcc7mLihiCN_lmB-NBzsDc";
const supabaseClient = supabase.createClient(supabaseUrl, supabaseKey);

let currentUser     = null;
let currentRole     = null;
let allItems        = [];
let activeCategory  = '';
let deleteTargetId  = null;

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

// ── CUSTOM CATEGORY TOGGLE ────────────────────────────────
function handleCategoryChange(selectEl, wrapId) {
    const wrap = $(wrapId);
    if (!wrap) return;
    wrap.style.display = selectEl.value === '__custom__' ? 'block' : 'none';
}

// Get the actual category value from a select + custom input pair
function getCategoryValue(selectId, customId) {
    const sel = $(selectId);
    if (!sel) return '';
    if (sel.value === '__custom__') {
        return $(customId)?.value.trim() || '';
    }
    return sel.value;
}

// ── VIEW SWITCHING ────────────────────────────────────────
function switchView(view) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
    $(`view-${view}`).classList.add('active');
    $(`tab-${view}`).classList.add('active');
    if (view === 'accounts') loadAccounts();
    if (view === 'dashboard') loadDashboard();
    if (view === 'inventory') loadItems();
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

    const { data: profile } = await supabaseClient
        .from('profiles')
        .select('role, full_name')
        .eq('id', user.id)
        .single();

    currentRole = profile?.role || 'staff';
    const displayName = profile?.full_name || user.email;

    $('user-label').textContent = displayName;
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
    if (data.session) await initApp(data.session.user);

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

    const { data, error } = await supabaseClient.auth.signUp({
        email, password: pass,
        options: { data: { full_name: name } }
    });

    if (error) {
        setLoading('create-btn', false);
        return setMsg('create-error', error.message);
    }

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
    ['new-name','new-email','new-password'].forEach(id => $(id).value = '');
    $('new-role').value = 'staff';
    loadAccounts();
}

// ── LOAD ACCOUNTS ─────────────────────────────────────────
async function loadAccounts() {
    if (currentRole !== 'admin') return;
    const tbody = $('accounts-body');
    tbody.innerHTML = `<tr><td colspan="4" class="empty-row">Loading...</td></tr>`;

    const { data, error } = await supabaseClient
        .from('profiles').select('*').order('created_at', { ascending: false });

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
            <td><span class="badge badge-${p.role}">${(p.role||'staff').toUpperCase()}</span></td>
            <td style="color:var(--muted);font-size:13px">${fmtDate(p.created_at)}</td>
        </tr>
    `).join('');
}

// ── STOCK IN ──────────────────────────────────────────────
async function addStock() {
    const name     = $('item-name').value.trim();
    const category = getCategoryValue('item-category', 'custom-category');
    const qty      = parseInt($('item-qty').value);

    setMsg('action-msg', '');
    if (!name)           return setMsg('action-msg', 'Please enter an item name.', true);
    if (!qty || qty <= 0) return setMsg('action-msg', 'Enter a valid quantity.', true);

    // Check for existing item (case-insensitive)
    const { data: existing } = await supabaseClient
        .from('items').select('*').ilike('name', name);

    if (existing && existing.length > 0) {
        // Merge into existing — no duplicate created
        const item   = existing[0];
        const newQty = item.quantity + qty;
        const { error } = await supabaseClient
            .from('items')
            .update({ quantity: newQty, category: category || item.category })
            .eq('id', item.id);
        if (error) return setMsg('action-msg', error.message, true);
        setMsg('action-msg', `✓ "${name}" already exists — quantity updated to ${newQty}`);
    } else {
        const { error } = await supabaseClient
            .from('items').insert([{ name, quantity: qty, category: category || 'Other' }]);
        if (error) return setMsg('action-msg', error.message, true);
        setMsg('action-msg', `✓ Added ${qty} unit(s) of "${name}"`);
    }

    clearStockInputs();
    loadItems();
}

// ── STOCK OUT ─────────────────────────────────────────────
async function removeStock() {
    const name = $('item-name').value.trim();
    const qty  = parseInt($('item-qty').value);

    setMsg('action-msg', '');
    if (!name)           return setMsg('action-msg', 'Please enter an item name.', true);
    if (!qty || qty <= 0) return setMsg('action-msg', 'Enter a valid quantity.', true);

    const { data, error } = await supabaseClient
        .from('items').select('*').ilike('name', name);

    if (error) return setMsg('action-msg', error.message, true);
    if (!data || data.length === 0) return setMsg('action-msg', `"${name}" not found in inventory.`, true);

    const item = data[0];
    const selectedCategory = getCategoryValue('item-category', 'custom-category');
    
    // Validate category matches existing item category
    if (selectedCategory && selectedCategory !== item.category) {
        return setMsg('action-msg', `Category mismatch! "${name}" is in category "${item.category}" but you selected "${selectedCategory}". Please select the correct category.`, true);
    }

    const newQty = item.quantity - qty;

    if (newQty < 0) return setMsg('action-msg', `Not enough stock! Available: ${item.quantity} unit(s).`, true);

    // Update quantity only - do not update category to prevent category replacement
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
    tbody.innerHTML = `<tr><td colspan="5" class="empty-row">Loading...</td></tr>`;

    const { data, error } = await supabaseClient
        .from('items').select('*').order('name', { ascending: true });

    if (error) {
        tbody.innerHTML = `<tr><td colspan="5" class="empty-row" style="color:var(--red)">Error: ${error.message}</td></tr>`;
        return;
    }

    allItems = data || [];
    updateDatalist(allItems);
    updateStats(allItems);
    updateFilterButtons(allItems);
    applyFilters();
    setupItemNameAutoComplete();
}

// ── DYNAMIC FILTER BUTTONS ────────────────────────────────
function updateFilterButtons(items) {
    // Collect unique categories
    const cats = [...new Set(items.map(i => i.category).filter(Boolean))].sort();
    const defaultCats = ['Chain','Seat / Saddle','Wheels','Brakes','Tires','Other'];

    const row = $('filter-row');
    // Keep All button, rebuild rest
    row.innerHTML = `<button class="filter-btn ${activeCategory === '' ? 'active' : ''}" onclick="filterByCategory('', this)">All</button>`;

    // Merge default + any custom categories from DB
    const allCats = [...new Set([...defaultCats, ...cats])];
    allCats.forEach(cat => {
        const isActive = activeCategory === cat;
        const label = cat.length > 12 ? cat.substring(0, 12) + '…' : cat;
        row.innerHTML += `<button class="filter-btn ${isActive ? 'active' : ''}" title="${escHtml(cat)}" onclick="filterByCategory('${escHtml(cat)}', this)">${escHtml(label)}</button>`;
    });
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
        tbody.innerHTML = `<tr><td colspan="5" class="empty-row">No items found.</td></tr>`;
        return;
    }
    tbody.innerHTML = items.map(item => {
        const badge = item.quantity === 0
            ? `<span class="badge badge-out">Out of Stock</span>`
            : item.quantity <= 5
            ? `<span class="badge badge-low">Low Stock</span>`
            : `<span class="badge badge-ok">In Stock</span>`;

        const actions = currentRole === 'admin'
            ? `<button class="btn-action btn-edit" onclick="openEditModal(${item.id})">✏️ Edit</button>
               <button class="btn-action btn-del"  onclick="openDeleteModal(${item.id}, '${escHtml(item.name)}')">🗑️ Delete</button>`
            : `<span style="color:var(--muted);font-size:12px">—</span>`;

        return `<tr>
            <td><strong>${escHtml(item.name)}</strong></td>
            <td><span class="cat-tag">${escHtml(item.category || '—')}</span></td>
            <td style="font-size:16px;font-weight:700">${item.quantity}</td>
            <td>${badge}</td>
            <td class="actions-cell">${actions}</td>
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

// ── EDIT MODAL ────────────────────────────────────────────
function openEditModal(id) {
    const item = allItems.find(i => i.id === id);
    if (!item) return;

    $('edit-id').value  = item.id;
    $('edit-name').value = item.name;
    $('edit-qty').value  = item.quantity;
    setMsg('edit-error', '');

    // Set category dropdown
    const sel = $('edit-category');
    const existingOpts = Array.from(sel.options).map(o => o.value);
    if (existingOpts.includes(item.category)) {
        sel.value = item.category;
        $('edit-custom-wrap').style.display = 'none';
    } else if (item.category) {
        // Custom category — show custom input
        sel.value = '__custom__';
        $('edit-custom-wrap').style.display = 'block';
        $('edit-custom-category').value = item.category;
    } else {
        sel.value = '';
        $('edit-custom-wrap').style.display = 'none';
    }

    $('edit-modal').classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeEditModal(e) {
    if (e && e.target !== $('edit-modal')) return;
    $('edit-modal').classList.remove('active');
    document.body.style.overflow = '';
}

async function saveEdit() {
    const id       = parseInt($('edit-id').value);
    const name     = $('edit-name').value.trim();
    const category = getCategoryValue('edit-category', 'edit-custom-category');
    const qty      = parseInt($('edit-qty').value);

    setMsg('edit-error', '');
    if (!name)           return setMsg('edit-error', 'Item name is required.');
    if (isNaN(qty) || qty < 0) return setMsg('edit-error', 'Quantity must be 0 or more.');

    // Check if another item already has this name (duplicate check)
    const duplicate = allItems.find(i => i.name.toLowerCase() === name.toLowerCase() && i.id !== id);
    if (duplicate) return setMsg('edit-error', `"${name}" already exists in inventory. Use Stock In to add quantity instead.`);

    const saveBtn = document.querySelector('#edit-modal .btn-primary');
    const t = saveBtn.querySelector('.btn-text');
    const l = saveBtn.querySelector('.btn-loader');
    t.style.display = 'none'; l.style.display = '';
    saveBtn.disabled = true;

    const { error } = await supabaseClient
        .from('items')
        .update({ name, category: category || 'Other', quantity: qty })
        .eq('id', id);

    t.style.display = ''; l.style.display = 'none';
    saveBtn.disabled = false;

    if (error) return setMsg('edit-error', error.message);

    $('edit-modal').classList.remove('active');
    document.body.style.overflow = '';
    loadItems();
}

// ── DELETE MODAL ──────────────────────────────────────────
function openDeleteModal(id, name) {
    deleteTargetId = id;
    $('delete-item-name').textContent = name;
    $('delete-modal').classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeDeleteModal(e) {
    if (e && e.target !== $('delete-modal')) return;
    $('delete-modal').classList.remove('active');
    document.body.style.overflow = '';
    deleteTargetId = null;
}

async function confirmDelete() {
    if (!deleteTargetId) return;

    const { error } = await supabaseClient
        .from('items').delete().eq('id', deleteTargetId);

    if (error) { alert('Error deleting item: ' + error.message); return; }

    $('delete-modal').classList.remove('active');
    document.body.style.overflow = '';
    deleteTargetId = null;
    loadItems();
}

// ── UTILS ─────────────────────────────────────────────────
function clearStockInputs() {
    $('item-name').value     = '';
    $('item-qty').value      = '';
    $('item-category').value = '';
    $('custom-category-wrap').style.display = 'none';
    if ($('custom-category')) $('custom-category').value = '';
}

// ── AUTO-POPULATE CATEGORY ON ITEM SELECTION ─────────────────────────────────────────────────
function setupItemNameAutoComplete() {
    const itemNameInput = $('item-name');
    if (!itemNameInput) return;

    itemNameInput.addEventListener('input', function() {
        const enteredName = this.value.trim();
        if (!enteredName) return;

        // Find matching item in inventory
        const matchingItem = allItems.find(item => 
            item.name.toLowerCase() === enteredName.toLowerCase()
        );

        if (matchingItem && matchingItem.category) {
            // Auto-populate category
            const categorySelect = $('item-category');
            const existingOpts = Array.from(categorySelect.options).map(o => o.value);
            
            if (existingOpts.includes(matchingItem.category)) {
                categorySelect.value = matchingItem.category;
                $('custom-category-wrap').style.display = 'none';
            } else {
                // Set to custom category if it's not in the dropdown
                categorySelect.value = '__custom__';
                $('custom-category-wrap').style.display = 'block';
                if ($('custom-category')) {
                    $('custom-category').value = matchingItem.category;
                }
            }
        }
    });
}

// Close modals on Escape key
document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
        closeEditModal();
        closeDeleteModal();
    }
});

// ── DASHBOARD FUNCTIONS ───────────────────────────────────────
let categoryChart = null;

async function loadDashboard() {
    if (!allItems.length) {
        await loadItems();
    }
    
    updateDashboardStats();
    updateCategoryChart();
}

function updateDashboardStats() {
    updateStats(allItems);
}

function updateCategoryChart() {
    const canvas = $('categoryChart');
    if (!canvas) return;

    // Sort items by quantity for better visualization
    const sortedItems = [...allItems].sort((a, b) => b.quantity - a.quantity);
    
    // Take top 15 items to avoid overcrowding
    const topItems = sortedItems.slice(0, 15);
    
    const labels = topItems.map(item => item.name);
    const data = topItems.map(item => item.quantity);

    // Destroy existing chart if it exists
    if (categoryChart) {
        categoryChart.destroy();
    }

    // Create new bar chart
    const ctx = canvas.getContext('2d');
    categoryChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Stock Level',
                data: data,
                backgroundColor: data.map(qty => {
                    // Color based on stock level
                    if (qty === 0) return '#dc2626';      // Red for out of stock
                    if (qty <= 5) return '#d97706';     // Yellow for low stock
                    return '#16a34a';                   // Green for in stock
                }),
                borderColor: data.map(qty => {
                    if (qty === 0) return '#991b1b';
                    if (qty <= 5) return '#92400e';
                    return '#14532d';
                }),
                borderWidth: 1,
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    backgroundColor: 'rgba(0, 0, 0, 0.8)',
                    titleColor: '#fff',
                    bodyColor: '#fff',
                    borderColor: '#fff',
                    borderWidth: 1,
                    padding: 12,
                    displayColors: false,
                    callbacks: {
                        title: function(context) {
                            return context[0].label;
                        },
                        label: function(context) {
                            const quantity = context.parsed.y;
                            const status = quantity === 0 ? 'Out of Stock' : 
                                          quantity <= 5 ? 'Low Stock' : 'In Stock';
                            return [
                                `Quantity: ${quantity} units`,
                                `Status: ${status}`
                            ];
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'Quantity',
                        color: '#6b7280',
                        font: {
                            size: 12,
                            weight: '600'
                        }
                    },
                    grid: {
                        color: 'rgba(107, 114, 128, 0.1)',
                        drawBorder: false
                    },
                    ticks: {
                        color: '#6b7280',
                        font: {
                            size: 11
                        }
                    }
                },
                x: {
                    grid: {
                        display: false,
                        drawBorder: false
                    },
                    ticks: {
                        color: '#374151',
                        font: {
                            size: 11,
                            weight: '500'
                        },
                        // Auto-hide some labels if too many items
                        autoSkip: true,
                        maxRotation: 45,
                        minRotation: 45
                    }
                }
            }
        }
    });
}