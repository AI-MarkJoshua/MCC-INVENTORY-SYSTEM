// ── DASHBOARD MODULE ──────────────────────────────────────

let categoryChart = null;

async function loadDashboard() {
    if (!allItems.length) await loadItems();
    updateStats(allItems);
    await updateMonthlySales();
    updateCategoryChart();
}

async function updateStats(items) {
    $('stat-total').textContent = items.length;
    $('stat-qty').textContent   = items.reduce((s, i) => s + i.quantity, 0);
    $('stat-out').textContent   = items.filter(i => i.quantity === 0).length;
}

async function updateMonthlySales() {
    const now = new Date();
    const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59).toISOString();

    const { data, error } = await supabaseClient
        .from('transactions')
        .select('quantity, retail_price, created_at, item_name')
        .eq('type', 'stock_out')
        .gte('created_at', firstOfMonth)
        .lte('created_at', endOfDay);

    const totalRevenue = error ? 0 : (data || []).reduce((s, t) => s + (t.quantity * (t.retail_price || 0)), 0);
    
    const el = $('stat-low');
    if (el) el.textContent = fmtPeso(totalRevenue);
}

function updateCategoryChart() {
    const canvas = $('categoryChart');
    if (!canvas) return;
    const sorted = [...allItems].sort((a, b) => b.quantity - a.quantity).slice(0, 15);
    if (categoryChart) categoryChart.destroy();
    categoryChart = new Chart(canvas.getContext('2d'), {
        type: 'bar',
        data: {
            labels: sorted.map(i => i.name),
            datasets: [{
                label: 'Stock Level',
                data:  sorted.map(i => i.quantity),
                backgroundColor: sorted.map(i =>
                    i.quantity === 0 ? '#dc2626' : i.quantity <= 5 ? '#d97706' : '#16a34a'),
                borderColor: sorted.map(i =>
                    i.quantity === 0 ? '#991b1b' : i.quantity <= 5 ? '#92400e' : '#14532d'),
                borderWidth: 1,
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: ctx => {
                            const q = ctx.parsed.y;
                            return [
                                `Quantity: ${q}`,
                                `Status: ${q === 0 ? 'Out of Stock' : q <= 5 ? 'Low Stock' : 'In Stock'}`
                            ];
                        }
                    }
                }
            },
            scales: {
                y: { beginAtZero: true, grid: { color: 'rgba(107,114,128,0.1)' }, ticks: { color: '#6b7280' } },
                x: { grid: { display: false }, ticks: { color: '#374151', maxRotation: 45, autoSkip: true } }
            }
        }
    });
}