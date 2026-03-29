// ── INVENTORY MODULE ──────────────────────────────────────

let activeCategory = '';
let deleteTargetId = null;
let currentPage    = 1;
let itemsPerPage   = 10;
let filteredItems  = [];

// ── LOAD ITEMS ────────────────────────────────────────────
async function loadItems() {
    const tbody = $('items-body');
    if (tbody) tbody.innerHTML = `<tr><td colspan="8" class="empty-row">Loading...</td></tr>`;
    const { data, error } = await supabaseClient.from('items').select('*').order('name', { ascending: true });
    if (error) {
        if (tbody) tbody.innerHTML = `<tr><td colspan="8" class="empty-row" style="color:var(--red)">Error: ${error.message}</td></tr>`;
        return;
    }
    allItems = data || [];
    updateDatalist(allItems);
    updateStats(allItems);
    updateFilterButtons(allItems);
    applyFilters();
    setupItemNameAutoComplete();
}

// ── STOCK IN ──────────────────────────────────────────────
async function addStock() {
    const name      = $('item-name').value.trim();
    const category  = $('item-category').value;
    const supplier  = $('item-supplier').value;
    const qty       = parseInt($('item-qty').value);
    const wholesale = parseFloat($('item-wholesale').value) || 0;
    const retail    = parseFloat($('item-retail').value) || 0;
    setMsg('action-msg', '');
    if (!name)            return setMsg('action-msg', 'Please enter an item name.', true);
    if (!qty || qty <= 0) return setMsg('action-msg', 'Enter a valid quantity.', true);

    const { data: existing } = await supabaseClient.from('items').select('*').ilike('name', name);
    let itemId;
    if (existing && existing.length > 0) {
        const item    = existing[0];
        const newQty  = item.quantity + qty;
        const updates = { quantity: newQty };
        if (category)  updates.category        = category;
        if (supplier)  updates.supplier         = supplier;
        if (wholesale) updates.wholesale_price  = wholesale;
        if (retail)    updates.retail_price     = retail;
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
    clearStockInputs();
    loadItems();
}

// ── STOCK OUT ─────────────────────────────────────────────
async function removeStock() {
    const name = $('item-name').value.trim();
    const qty  = parseInt($('item-qty').value);
    setMsg('action-msg', '');
    if (!name)            return setMsg('action-msg', 'Please enter an item name.', true);
    if (!qty || qty <= 0) return setMsg('action-msg', 'Enter a valid quantity.', true);
    const { data, error } = await supabaseClient.from('items').select('*').ilike('name', name);
    if (error)             return setMsg('action-msg', error.message, true);
    if (!data || !data.length) return setMsg('action-msg', `"${name}" not found in inventory.`, true);
    const item   = data[0];
    const newQty = item.quantity - qty;
    if (newQty < 0) return setMsg('action-msg', `Not enough stock! Available: ${item.quantity} unit(s).`, true);
    const { error: upErr } = await supabaseClient.from('items').update({ quantity: newQty }).eq('id', item.id);
    if (upErr) return setMsg('action-msg', upErr.message, true);
    await logTransaction(item.id, item.name, item.category, qty, 'stock_out');
    setMsg('action-msg', `✓ Removed ${qty} unit(s) of "${name}" — ${newQty} remaining`);
    clearStockInputs();
    loadItems();
}

// ── FILTER & RENDER ───────────────────────────────────────
function updateFilterButtons(items) {
    const cats = [...new Set(items.map(i => i.category).filter(Boolean))].sort();
    const row  = $('filter-row');
    if (!row) return;
    row.innerHTML = `<button class="filter-btn ${activeCategory === '' ? 'active' : ''}" onclick="filterByCategory('',this)">All</button>`;
    cats.forEach(cat => {
        const label = cat.length > 14 ? cat.substring(0, 14) + '…' : cat;
        row.innerHTML += `<button class="filter-btn ${activeCategory === cat ? 'active' : ''}" title="${escHtml(cat)}" onclick="filterByCategory('${escHtml(cat)}',this)">${escHtml(label)}</button>`;
    });
}

function applyFilters() {
    const q = ($('search')?.value || '').toLowerCase();
    let f = allItems;
    if (activeCategory) f = f.filter(i => i.category === activeCategory);
    if (q) f = f.filter(i => i.name.toLowerCase().includes(q));
    filteredItems = f;
    currentPage   = 1;
    renderItems();
}

function renderItems() {
    const tbody = $('items-body');
    if (!filteredItems.length) {
        tbody.innerHTML = `<tr><td colspan="8" class="empty-row">No items found.</td></tr>`;
        updatePagination();
        return;
    }
    const start = (currentPage - 1) * itemsPerPage;
    const end   = start + itemsPerPage;
    tbody.innerHTML = filteredItems.slice(start, end).map(item => {
        const badge = item.quantity === 0
            ? `<span class="badge badge-out">Out of Stock</span>`
            : item.quantity <= 5
            ? `<span class="badge badge-low">Low Stock</span>`
            : `<span class="badge badge-ok">In Stock</span>`;
        const actions = currentRole === 'admin'
            ? `<button class="btn-action btn-edit" onclick="openEditModal(${item.id})">✏️ Edit</button>
               <button class="btn-action btn-del"  onclick="openDeleteModal(${item.id},'${escHtml(item.name)}')">🗑️ Delete</button>`
            : `<span style="color:var(--muted);font-size:12px">—</span>`;
        return `<tr>
            <td><strong>${escHtml(item.name)}</strong></td>
            <td><span class="cat-tag">${escHtml(item.category || '—')}</span></td>
            <td><span class="supplier-tag">${escHtml(item.supplier || '—')}</span></td>
            <td style="font-size:13px;color:var(--muted)">${item.wholesale_price ? fmtPeso(item.wholesale_price) : '—'}</td>
            <td style="font-size:14px;font-weight:600;color:var(--green)">${item.retail_price ? fmtPeso(item.retail_price) : '—'}</td>
            <td style="font-size:16px;font-weight:700">${item.quantity}</td>
            <td>${badge}</td>
            <td class="actions-cell">${actions}</td>
        </tr>`;
    }).join('');
    updatePagination();
}

function filterItems()            { applyFilters(); }
function filterByCategory(cat, btn) {
    activeCategory = cat;
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    applyFilters();
}

// ── PAGINATION ────────────────────────────────────────────
function updatePagination() {
    const total      = filteredItems.length;
    const totalPages = Math.ceil(total / itemsPerPage);
    const info       = $('pagination-info-text');
    const ctrl       = $('pagination-controls');
    if (!info || !ctrl) return;
    const s = total === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1;
    const e = Math.min(currentPage * itemsPerPage, total);
    info.textContent = `Showing ${s}–${e} of ${total} items`;
    ctrl.innerHTML   = '';
    if (totalPages <= 1) return;

    const prev = document.createElement('button');
    prev.className = 'pagination-btn'; prev.textContent = '‹'; prev.disabled = currentPage === 1;
    prev.onclick = () => goToPage(currentPage - 1);
    ctrl.appendChild(prev);

    for (let i = 1; i <= totalPages; i++) {
        if (i === 1 || i === totalPages || Math.abs(i - currentPage) <= 1) {
            const b = document.createElement('button');
            b.className = 'pagination-btn' + (i === currentPage ? ' active' : '');
            b.textContent = i; b.onclick = () => goToPage(i);
            ctrl.appendChild(b);
        } else if (Math.abs(i - currentPage) === 2) {
            const sp = document.createElement('span');
            sp.className = 'pagination-ellipsis'; sp.textContent = '…';
            ctrl.appendChild(sp);
        }
    }

    const next = document.createElement('button');
    next.className = 'pagination-btn'; next.textContent = '›'; next.disabled = currentPage === totalPages;
    next.onclick = () => goToPage(currentPage + 1);
    ctrl.appendChild(next);
}

function goToPage(page) {
    const total = Math.ceil(filteredItems.length / itemsPerPage);
    if (page < 1 || page > total) return;
    currentPage = page;
    renderItems();
}

// ── AUTOCOMPLETE ──────────────────────────────────────────
function updateDatalist(items) {
    const dd = $('items-dropdown');
    if (!dd) return;
    dd.innerHTML = '';
    if (!items.length) { dd.innerHTML = '<div class="dropdown-item">No items found</div>'; return; }
    items.forEach(item => {
        const div = document.createElement('div');
        div.className   = 'dropdown-item';
        div.textContent = item.name;
        div.onclick = () => selectItem(item.name, item.category, item.supplier, item.wholesale_price, item.retail_price);
        dd.appendChild(div);
    });
}

function selectItem(name, category, supplier, wholesale, retail) {
    const input  = $('item-name');
    const catSel = $('item-category');
    const dd     = $('items-dropdown');
    const wrap   = document.querySelector('.custom-dropdown');
    input.value = name;
    if (category)  catSel.value               = category;
    if (supplier)  $('item-supplier').value   = supplier;
    if (wholesale) $('item-wholesale').value  = wholesale;
    if (retail)    $('item-retail').value     = retail;
    dd.classList.remove('active');
    wrap.classList.remove('active');
}

function setupItemNameAutoComplete() {
    const input = $('item-name');
    const dd    = $('items-dropdown');
    const wrap  = document.querySelector('.custom-dropdown');
    if (!input || !dd || !wrap) return;

    input.addEventListener('input', function () {
        const v = this.value.trim();
        const f = v ? allItems.filter(i => i.name.toLowerCase().includes(v.toLowerCase())) : allItems;
        updateDatalist(f);
        if (v) { dd.classList.add('active'); wrap.classList.add('active'); }
        else   { dd.classList.remove('active'); wrap.classList.remove('active'); }
        const match = allItems.find(i => i.name.toLowerCase() === v.toLowerCase());
        if (match) {
            if (match.category)        $('item-category').value  = match.category;
            if (match.supplier)        $('item-supplier').value  = match.supplier;
            if (match.wholesale_price) $('item-wholesale').value = match.wholesale_price;
            if (match.retail_price)    $('item-retail').value    = match.retail_price;
        }
    });
    input.addEventListener('focus', function () {
        const v = this.value.trim();
        updateDatalist(v ? allItems.filter(i => i.name.toLowerCase().includes(v.toLowerCase())) : allItems);
        dd.classList.add('active'); wrap.classList.add('active');
    });

    const arrow = document.querySelector('.dropdown-arrow');
    if (arrow) arrow.addEventListener('click', e => {
        e.stopPropagation();
        const open = dd.classList.contains('active');
        if (open) { dd.classList.remove('active'); wrap.classList.remove('active'); }
        else       { updateDatalist(allItems); dd.classList.add('active'); wrap.classList.add('active'); }
    });

    document.addEventListener('click', e => {
        if (!wrap.contains(e.target)) { dd.classList.remove('active'); wrap.classList.remove('active'); }
    });
}

// ── EDIT MODAL ────────────────────────────────────────────
function openEditModal(id) {
    const item = allItems.find(i => i.id === id);
    if (!item) return;
    $('edit-id').value        = item.id;
    $('edit-name').value      = item.name;
    $('edit-qty').value       = item.quantity;
    $('edit-wholesale').value = item.wholesale_price || '';
    $('edit-retail').value    = item.retail_price || '';
    $('edit-category').value  = item.category || '';
    $('edit-supplier').value  = item.supplier  || '';
    setMsg('edit-error', '');
    $('edit-modal').classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeEditModal(e) {
    if (e && e.target !== $('edit-modal')) return;
    $('edit-modal').classList.remove('active');
    document.body.style.overflow = '';
}

async function saveEdit() {
    const id        = parseInt($('edit-id').value);
    const name      = $('edit-name').value.trim();
    const category  = $('edit-category').value;
    const supplier  = $('edit-supplier').value;
    const wholesale = parseFloat($('edit-wholesale').value) || 0;
    const retail    = parseFloat($('edit-retail').value) || 0;
    const qty       = parseInt($('edit-qty').value);
    setMsg('edit-error', '');
    if (!name)                return setMsg('edit-error', 'Item name is required.');
    if (isNaN(qty) || qty < 0) return setMsg('edit-error', 'Quantity must be 0 or more.');
    const dup = allItems.find(i => i.name.toLowerCase() === name.toLowerCase() && i.id !== id);
    if (dup) return setMsg('edit-error', `"${name}" already exists.`);

    const btn = document.querySelector('#edit-modal .btn-primary');
    const t = btn.querySelector('.btn-text'), l = btn.querySelector('.btn-loader');
    t.style.display = 'none'; l.style.display = ''; btn.disabled = true;

    const { error } = await supabaseClient.from('items').update({
        name, category: category || 'Others', supplier: supplier || '',
        wholesale_price: wholesale, retail_price: retail, quantity: qty
    }).eq('id', id);

    t.style.display = ''; l.style.display = 'none'; btn.disabled = false;
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
    const { error } = await supabaseClient.from('items').delete().eq('id', deleteTargetId);
    if (error) { alert('Error deleting item: ' + error.message); return; }
    $('delete-modal').classList.remove('active');
    document.body.style.overflow = '';
    deleteTargetId = null;
    loadItems();
}

// ── CLEAR INPUTS ──────────────────────────────────────────
function clearStockInputs() {
    $('item-name').value     = '';
    $('item-qty').value      = '';
    $('item-category').value = '';
    $('item-supplier').value = '';
    $('item-wholesale').value = '';
    $('item-retail').value   = '';
}