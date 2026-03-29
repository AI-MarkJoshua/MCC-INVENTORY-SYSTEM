// ── REPORTS MODULE ────────────────────────────────────────

function initReportDefaults() {
    $('report-results').style.display = 'none';
    setMsg('report-error', '');
}

async function generateReport() {
    const type      = $('report-type').value;
    const startDate = $('report-start').value;
    const endDate   = $('report-end').value;
    setMsg('report-error', '');
    if (!startDate || !endDate) return setMsg('report-error', 'Please select both a start date and an end date.');
    if (startDate > endDate)    return setMsg('report-error', 'Start date cannot be after end date.');

    const btn = $('report-generate-btn');
    const t   = btn.querySelector('.btn-text');
    const l   = btn.querySelector('.btn-loader');
    t.style.display = 'none'; l.style.display = ''; btn.disabled = true;

    const endInclusive = new Date(endDate);
    endInclusive.setDate(endInclusive.getDate() + 1);
    const endStr = endInclusive.toISOString().split('T')[0];

    let query = supabaseClient.from('transactions').select('*')
        .gte('created_at', startDate + 'T00:00:00')
        .lt('created_at',  endStr + 'T00:00:00')
        .order('created_at', { ascending: true });
    if (type !== 'both') query = query.eq('type', type);

    const { data, error } = await query;
    t.style.display = ''; l.style.display = 'none'; btn.disabled = false;
    if (error) return setMsg('report-error', 'Error fetching report: ' + error.message);
    renderReport(data || [], type, startDate, endDate);
}

function renderReport(transactions, type, startDate, endDate) {
    const results = $('report-results');
    results.style.display = 'block';
    results.scrollIntoView({ behavior: 'smooth', block: 'start' });

    const typeLabel = type === 'both' ? 'Stock In & Out' : type === 'stock_in' ? 'Stock In Only' : 'Stock Out Only';
    const fmt       = d => new Date(d + 'T00:00:00').toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' });
    $('report-subtitle').textContent = `${typeLabel} · ${fmt(startDate)} — ${fmt(endDate)}`;

    const totalIn  = transactions.filter(t => t.type === 'stock_in').reduce((s, t) => s + t.quantity, 0);
    const totalOut = transactions.filter(t => t.type === 'stock_out').reduce((s, t) => s + t.quantity, 0);
    $('report-summary').innerHTML = `
        <div class="summary-badge summary-total">📄 ${transactions.length} Transaction${transactions.length !== 1 ? 's' : ''}</div>
        ${type !== 'stock_out' ? `<div class="summary-badge summary-in">▲ ${totalIn} unit${totalIn !== 1 ? 's' : ''} stocked in</div>` : ''}
        ${type !== 'stock_in'  ? `<div class="summary-badge summary-out">▼ ${totalOut} unit${totalOut !== 1 ? 's' : ''} stocked out</div>` : ''}`;

    const tbody = $('report-body');
    if (!transactions.length) {
        tbody.innerHTML = `<tr><td colspan="6" class="empty-row">No transactions found for this period.</td></tr>`;
        $('report-count').textContent = '';
        return;
    }
    tbody.innerHTML = transactions.map(tx => {
        const rb = tx.type === 'stock_in'
            ? `<span class="badge badge-in-remark">▲ Stock In</span>`
            : `<span class="badge badge-out-remark">▼ Stock Out</span>`;
        return `<tr>
            <td style="white-space:nowrap;font-size:13px">${fmtDateTime(tx.created_at)}</td>
            <td><strong>${escHtml(tx.user_name || '—')}</strong><span class="role-chip">${escHtml(tx.user_role || '—')}</span></td>
            <td><strong>${escHtml(tx.item_name || '—')}</strong></td>
            <td><span class="cat-tag">${escHtml(tx.category || '—')}</span></td>
            <td style="font-weight:700;font-size:15px">${tx.quantity}</td>
            <td>${rb}</td>
        </tr>`;
    }).join('');
    $('report-count').textContent = `Total: ${transactions.length} record${transactions.length !== 1 ? 's' : ''}`;
}

function printReport() {
    const subtitle  = $('report-subtitle')?.textContent || '';
    const summary   = $('report-summary')?.innerHTML || '';
    const tableHTML = $('report-table')?.outerHTML || '';
    const today     = new Date().toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' });

    const printContent = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>MCC Inventory Report</title>
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
    <p class="print-meta">Generated on ${today} by ${escHtml(currentName || '—')} (${escHtml(currentRole || '—')})</p>
    <div class="summary-row">${summary}</div>
    ${tableHTML}
    <div class="print-footer"><span>MCC Bike Inventory System</span><span>Printed: ${today}</span></div>
    </body></html>`;

    const win = window.open('', '_blank', 'width=900,height=700');
    win.document.write(printContent);
    win.document.close();
    win.onload = () => { win.focus(); win.print(); };
}