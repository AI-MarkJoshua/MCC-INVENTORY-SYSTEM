// ── NAVIGATION MODULE ─────────────────────────────────────

function switchView(view) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
    $(`view-${view}`).classList.add('active');
    const tab = $(`tab-${view}`);
    if (tab) tab.classList.add('active');
    if (view === 'accounts')  loadAccounts();
    if (view === 'dashboard') loadDashboard();
    if (view === 'inventory') loadItems();
    if (view === 'reports')   initReportDefaults();
    if (view === 'pos')       initPOS();
}

function toggleReportsDropdown() {
    const menu = $('reports-menu');
    menu.classList.toggle('show');
}

function switchToReport(reportType) {
    // Hide dropdown menu
    $('reports-menu').classList.remove('show');

    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));

    $('view-reports').classList.add('active');
    initReportDefaults();

    // Find correct tab button inside report type tabs
    const tabBtns = document.querySelectorAll('.report-tab-btn');
    if (reportType === 'inventory') {
        switchReportType('inventory', tabBtns[0]);
    } else if (reportType === 'sales') {
        switchReportType('sales', tabBtns[1]);
    }
}

document.addEventListener('click', function (event) {
    const dropdown = $('reports-dropdown');
    const menu = $('reports-menu');
    if (dropdown && menu && !dropdown.contains(event.target)) {
        menu.classList.remove('show');
    }
});