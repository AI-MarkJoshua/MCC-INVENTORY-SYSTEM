// ── POS MODULE ────────────────────────────────────────────

let cart          = []; // [{itemId, name, wholesalePrice, retailPrice, qty, stock, category}]
let recentSales   = [];
let lastReceiptData = null;

// ── INIT ──────────────────────────────────────────────────
function initPOS() {
    if (!allItems.length) loadItems().then(() => setupPosSearch());
    else setupPosSearch();
    renderCart();
    // renderRecentSales(); // Removed from POS - will be moved to dashboard
}

// ── SEARCH DROPDOWN ───────────────────────────────────────
function setupPosSearch() {
    const input = $('pos-search');
    const dd    = $('pos-dropdown');
    const wrap  = input?.closest('.custom-dropdown');
    if (!input || !dd || !wrap) return;

    // Replace element to remove stale listeners
    const newInput = input.cloneNode(true);
    input.parentNode.replaceChild(newInput, input);

    newInput.addEventListener('input', function () {
        const v = this.value.trim().toLowerCase();
        const f = v
            ? allItems.filter(i => i.name.toLowerCase().includes(v) && i.quantity > 0)
            : allItems.filter(i => i.quantity > 0);
        renderPosDropdown(f, dd, wrap);
        dd.classList.add('active'); wrap.classList.add('active');
    });
    newInput.addEventListener('focus', function () {
        const v = this.value.trim().toLowerCase();
        const f = v
            ? allItems.filter(i => i.name.toLowerCase().includes(v) && i.quantity > 0)
            : allItems.filter(i => i.quantity > 0);
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
    const f = v
        ? allItems.filter(i => i.name.toLowerCase().includes(v) && i.quantity > 0)
        : allItems.filter(i => i.quantity > 0);
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
                    <div style="font-size:11px;color:var(--muted);margin-top:1px">${escHtml(item.category || '—')} · Stock: ${item.quantity}</div>
                </div>
                <div style="font-weight:700;color:var(--green);font-size:14px;white-space:nowrap">${price}</div>
            </div>
        </div>`;
    }).join('');
}

// ── CART MANAGEMENT ───────────────────────────────────────
function addToCart(itemId) {
    const item = allItems.find(i => i.id === itemId);
    if (!item) return;
    if (!item.retail_price || item.retail_price <= 0) {
        if (!confirm(`"${item.name}" has no retail price set. Add anyway with ₱0.00?`)) return;
    }

    const existing       = cart.find(c => c.itemId === itemId);
    const availableStock = item.quantity - (existing ? existing.qty : 0);

    if (availableStock <= 0) {
        alert(`No more stock available for "${item.name}".`);
        return;
    }

    if (existing) { existing.qty++; }
    else {
        cart.push({
            itemId:        item.id,
            name:          item.name,
            wholesalePrice: item.wholesale_price || 0,
            retailPrice:   item.retail_price || 0,
            qty:           1,
            stock:         item.quantity,
            category:      item.category
        });
    }

    // Clear search input & close dropdown
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
    const c    = cart.find(c => c.itemId === itemId);
    if (!c) return;
    const item = allItems.find(i => i.id === itemId);
    const maxStock = item ? item.quantity : c.stock;
    c.qty += delta;
    if (c.qty <= 0)       { removeFromCart(itemId); return; }
    if (c.qty > maxStock) { c.qty = maxStock; }
    renderCart();
}

function clearCart() {
    if (!cart.length) return;
    if (!confirm('Clear all items from cart?')) return;
    cart = [];
    $('pos-customer').value = '';
    $('pos-payment').value  = '';
    $('pos-labour').value   = '';
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
                <div style="font-size:11px;color:var(--muted)">${escHtml(c.category || '—')}</div>
            </td>
            <td style="color:var(--muted);font-weight:600">${fmtPeso(c.wholesalePrice)}</td>
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

// ── CHECKOUT ──────────────────────────────────────────────
function getCartTotal() {
    return cart.reduce((sum, c) => sum + (c.retailPrice * c.qty), 0);
}

function getLabourAmount() {
    return parseFloat($('pos-labour')?.value) || 0;
}

function getGrandTotal() {
    return getCartTotal() + getLabourAmount();
}

function updateCheckout() {
    const subtotal = getCartTotal();
    const labour   = getLabourAmount();
    const total    = getGrandTotal();
    
    $('checkout-subtotal').textContent = fmtPeso(subtotal);
    $('checkout-total').textContent    = fmtPeso(total);
    calcChange();
}

function calcChange() {
    const total   = getGrandTotal();
    const payment = parseFloat($('pos-payment')?.value) || 0;
    const change  = payment - total;
    const el      = $('change-amount');
    const disp    = $('change-display');
    if (!el || !disp) return;

    if (payment <= 0) {
        el.textContent = '₱0.00';
        el.style.color = 'var(--text)';
        disp.classList.remove('change-insufficient');
    } else if (change < 0) {
        el.textContent = `− ${fmtPeso(Math.abs(change))}`;
        el.style.color = 'var(--red)';
        disp.classList.add('change-insufficient');
    } else {
        el.textContent = fmtPeso(change);
        el.style.color = 'var(--green)';
        disp.classList.remove('change-insufficient');
    }
}

async function processCheckout() {
    if (!cart.length)  return setMsg('pos-msg', 'Cart is empty!', true);
    const subtotal   = getCartTotal();
    const labour     = getLabourAmount();
    const total      = getGrandTotal();
    const payment    = parseFloat($('pos-payment')?.value) || 0;
    if (payment < total) return setMsg('pos-msg', 'Payment amount is less than total.', true);

    const customer = $('pos-customer').value.trim() || 'Walk-in Customer';
    setLoading('checkout-btn', true);

    try {
        for (const c of cart) {
            const item = allItems.find(i => i.id === c.itemId);
            if (!item) continue;
            const newQty = item.quantity - c.qty;
            if (newQty < 0) throw new Error(`Insufficient stock for "${c.name}"`);
            await supabaseClient.from('items').update({ quantity: newQty }).eq('id', c.itemId);
            await logTransaction(c.itemId, c.name, c.category, c.qty, 'stock_out');
        }

        const receiptData = {
            customer,
            items:   [...cart],
            subtotal,
            labour,
            total,
            payment,
            change:  payment - total,
            soldBy:  currentName,
            date:    new Date()
        };
        lastReceiptData = receiptData;
        showReceipt(receiptData);

        recentSales.unshift({ ...receiptData, id: Date.now() });
        if (recentSales.length > 10) recentSales.pop();
        // renderRecentSales(); // Removed from POS - will be moved to dashboard

        cart = [];
        $('pos-customer').value = '';
        $('pos-payment').value  = '';
        $('pos-labour').value   = '';
        renderCart();
        await loadItems();

    } catch (err) {
        setMsg('pos-msg', err.message, true);
    }

    setLoading('checkout-btn', false);
}

// ── RECEIPT ───────────────────────────────────────────────
function showReceipt(data) {
    const content = $('receipt-content');
    const dateStr = data.date.toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' });
    const timeStr = data.date.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', hour12: true });
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
                    ${data.items.map(c => `<tr>
                        <td>${escHtml(c.name)}</td>
                        <td style="text-align:center">${c.qty}</td>
                        <td style="text-align:right">${fmtPeso(c.retailPrice)}</td>
                        <td style="text-align:right;font-weight:700">${fmtPeso(c.retailPrice * c.qty)}</td>
                    </tr>`).join('')}
                </tbody>
            </table>
            ${data.labour > 0 ? `
                <div class="receipt-divider">- - - - - - - - - - - - - - - - - - - -</div>
                <div class="receipt-row"><span>Labour Charges</span><span>${fmtPeso(data.labour)}</span></div>
            ` : ''}
            <div class="receipt-divider">- - - - - - - - - - - - - - - - - - - -</div>
            <div class="receipt-totals">
                ${data.labour > 0 ? `<div class="receipt-row"><span>Items Total</span><span>${fmtPeso(data.subtotal)}</span></div>` : ''}
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
    const d       = lastReceiptData;
    const dateStr = d.date.toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' });
    const timeStr = d.date.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', hour12: true });
    const win     = window.open('', '_blank', 'width=400,height=600');
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
        <tbody>${d.items.map(c => `<tr>
            <td>${escHtml(c.name)}</td>
            <td style="text-align:center">${c.qty}</td>
            <td style="text-align:right">${fmtPeso(c.retailPrice)}</td>
            <td style="text-align:right">${fmtPeso(c.retailPrice * c.qty)}</td>
        </tr>`).join('')}</tbody>
    </table>
    ${d.labour > 0 ? `
        <hr class="divider">
        <div class="tot-row"><span>Labour Charges</span><span>${fmtPeso(d.labour)}</span></div>
    ` : ''}
    <hr class="divider">
    <div class="totals">
        ${d.labour > 0 ? `<div class="tot-row"><span>Items Total</span><span>${fmtPeso(d.subtotal)}</span></div>` : ''}
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

// ── RECENT SALES ──────────────────────────────────────────
function renderRecentSales() {
    const list = $('recent-sales-list');
    if (!list) return;
    if (!recentSales.length) {
        list.innerHTML = '<div style="padding:20px;text-align:center;font-size:13px;color:var(--muted)">No sales yet today.</div>';
        return;
    }
    list.innerHTML = recentSales.map(s => {
        const time = s.date.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', hour12: true });
        return `<div class="recent-sale-item" onclick="showReceipt(recentSales.find(x=>x.id===${s.id}))">
            <div class="recent-sale-left">
                <div class="recent-sale-customer">${escHtml(s.customer)}</div>
                <div class="recent-sale-meta">${s.items.length} item${s.items.length !== 1 ? 's' : ''} · ${time}</div>
            </div>
            <div class="recent-sale-total">${fmtPeso(s.total)}</div>
        </div>`;
    }).join('');
}