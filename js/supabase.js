// ── SUPABASE CLIENT ───────────────────────────────────────
const supabaseUrl = "https://kpppfqzktafjuchssiqa.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtwcHBmcXprdGFmanVjaHNzaXFhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQyMTg2MzgsImV4cCI6MjA4OTc5NDYzOH0.E_q4bktMrbigfn8piTj56dcc7mLihiCN_lmB-NBzsDc";
const supabaseClient = supabase.createClient(supabaseUrl, supabaseKey);

// ── SHARED STATE ──────────────────────────────────────────
let currentUser    = null;
let currentRole    = null;
let currentName    = null;
let allItems       = [];
let isResettingPassword = false;

// ── SHARED HELPERS ────────────────────────────────────────
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
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const fmtDate = iso => iso
    ? new Date(iso).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })
    : '—';

const fmtDateTime = iso => {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleDateString('en-PH', { year: 'numeric', month: '2-digit', day: '2-digit' })
        + ' ' + d.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', hour12: true });
};

const fmtPeso = n => '₱' + parseFloat(n || 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

// ── LOG TRANSACTION ───────────────────────────────────────
async function logTransaction(itemId, itemName, category, qty, type) {
    try {
        await supabaseClient.from('transactions').insert([{
            item_id:   itemId,
            item_name: itemName,
            category:  category || 'Others',
            quantity:  qty,
            type,
            user_id:   currentUser?.id || null,
            user_name: currentName || 'Unknown',
            user_role: currentRole || 'staff'
        }]);
    } catch (e) { console.error('Failed to log transaction:', e); }
}