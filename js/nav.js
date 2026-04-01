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

// Toggle reports hierarchy
function toggleReportsHierarchy() {
    const hierarchy = document.getElementById('reports-items');
    if (!hierarchy) {
        console.error('reports-items element not found');
        return;
    }
    
    // Simple toggle - show/hide
    const isVisible = hierarchy.style.display !== 'block';
    hierarchy.style.display = isVisible ? 'block' : 'none';
    
    // If showing, position it correctly
    if (isVisible) {
        const reportsTab = document.getElementById('tab-reports');
        if (reportsTab) {
            const rect = reportsTab.getBoundingClientRect();
            hierarchy.style.top = (rect.bottom + 8) + 'px';
            hierarchy.style.left = rect.left + 'px';
        }
    }
    
    // Update main reports tab active state
    const reportsTab = document.getElementById('tab-reports');
    if (reportsTab) {
        if (isVisible) {
            reportsTab.classList.add('active');
        } else {
            reportsTab.classList.remove('active');
        }
    }
}

// Switch to specific report type
function switchToReport(reportType) {
    // Hide hierarchy
    const hierarchy = document.getElementById('reports-items');
    if (hierarchy) hierarchy.style.display = 'none';
    
    // Remove all active states from navigation
    document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
    
    // Show reports view
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    const reportsView = document.getElementById('view-reports');
    if (reportsView) reportsView.classList.add('active');
    
    // Initialize reports
    initReportDefaults();
    
    // Update title based on report type
    const reportTitle = document.getElementById('report-title');
    if (reportTitle) {
        if (reportType === 'inventory') {
            reportTitle.innerHTML = '<i class="fas fa-box"></i> Inventory Report';
        } else if (reportType === 'sales') {
            reportTitle.innerHTML = '<i class="fas fa-dollar-sign"></i> Sales Report';
        }
    }
    
    // Set the correct report type and activate the right tab
    const reportTabs = document.querySelectorAll('.report-tab-btn');
    reportTabs.forEach(tab => tab.classList.remove('active'));
    
    // Show/hide the correct filters
    const inventoryFilters = document.getElementById('inventory-filters');
    const salesFilters = document.getElementById('sales-filters');
    const reportResults = document.getElementById('report-results');
    
    if (reportType === 'inventory') {
        if (reportTabs[0]) reportTabs[0].classList.add('active');
        if (inventoryFilters) inventoryFilters.style.display = 'flex';
        if (salesFilters) salesFilters.style.display = 'none';
        if (reportResults) reportResults.style.display = 'none';
    } else if (reportType === 'sales') {
        if (reportTabs[1]) reportTabs[1].classList.add('active');
        if (inventoryFilters) inventoryFilters.style.display = 'none';
        if (salesFilters) salesFilters.style.display = 'flex';
        if (reportResults) reportResults.style.display = 'none';
        
        // Load users for sales report if not already loaded
        if (!allUsers.length) loadUsersForSalesReport();
    }
    
    // Set active state for navigation sub-items
    const subItems = document.querySelectorAll('.sub-item');
    subItems.forEach(item => item.classList.remove('active'));
    
    if (reportType === 'inventory' && subItems[0]) {
        subItems[0].classList.add('active');
    } else if (reportType === 'sales' && subItems[1]) {
        subItems[1].classList.add('active');
    }
}

document.addEventListener('click', function (event) {
    const hierarchyContainer = document.getElementById('reports-hierarchy');
    const hierarchy = document.getElementById('reports-items');
    if (hierarchyContainer && hierarchy && !hierarchyContainer.contains(event.target)) {
        hierarchy.style.display = 'none';
        // Don't remove active state from reports tab if we're in reports view
        const reportsView = document.getElementById('view-reports');
        if (!reportsView || !reportsView.classList.contains('active')) {
            const reportsTab = document.getElementById('tab-reports');
            if (reportsTab) reportsTab.classList.remove('active');
        }
    }
});