// ── NAVIGATION MODULE ─────────────────────────────────────

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