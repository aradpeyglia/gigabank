/* =========================================================================
   AHOURA'S MEGAGANKYBANK — dashboard.js
   -------------------------------------------------------------------------
   Runs only on dashboard.html. Responsibilities:
     • Guard the page — if not logged in, kick back to login.html
     • Greet the user by name (from localStorage)
     • Render dummy charts via Chart.js (loaded from a CDN)
     • Render fake transactions, notifications, budgets
     • Wire up logout button + quick-action toasts
   ========================================================================= */


document.addEventListener('DOMContentLoaded', () => {
  // ---------- 1) GUARD: require a logged-in session ----------------------
  const user = window.MGBAuth?.getSession();
  if (!user) {
    // Send them to the login page; preserve a hint in the URL if needed
    window.location.replace('login.html');
    return;
  }

  // ---------- 2) Greet the user --------------------------------------------
  // Use classes (not IDs) so we can update ALL matching elements at once —
  // greeting appears in both the sidebar profile chip AND the page header.
  const firstName = user.name.split(' ')[0];
  document.querySelectorAll('.greet-name').forEach((el) => {
    el.textContent = firstName;
  });

  document.querySelectorAll('.acct-id').forEach((el) => {
    el.textContent = user.accountId;
  });

  const formattedBalance = '$' + user.balance.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  document.querySelectorAll('.acct-balance').forEach((el) => {
    el.textContent = formattedBalance;
  });

  // ---------- 3) LOGOUT button ---------------------------------------------
  document.getElementById('logout-btn')?.addEventListener('click', () => {
    window.MGBAuth.clearSession();
    window.toast('Logged out. See you soon!', '');
    setTimeout(() => (window.location.href = 'index.html'), 600);
  });

  // ---------- 4) CHARTS (Chart.js) -----------------------------------------
  renderSpendingChart();
  renderIncomeChart();
  renderPortfolioChart();

  // ---------- 5) Transactions, notifications, budgets ----------------------
  renderTransactions();
  renderNotifications();
  renderBudgets();
  renderInvestments();

  // ---------- 6) Quick action buttons → just show a toast ------------------
  document.querySelectorAll('[data-quick-action]').forEach((btn) => {
    btn.addEventListener('click', () => {
      window.toast(`"${btn.dataset.quickAction}" would open here in the real app.`, '');
    });
  });

  // ---------- 7) Sidebar nav links → scroll to anchor ----------------------
  document.querySelectorAll('.sidebar-nav a').forEach((a) => {
    a.addEventListener('click', (e) => {
      const href = a.getAttribute('href');
      if (href?.startsWith('#')) {
        e.preventDefault();
        document.querySelector(href)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        document.querySelectorAll('.sidebar-nav a').forEach((x) => x.classList.remove('active'));
        a.classList.add('active');
      }
    });
  });
});


/* =========================================================================
   CHART: Spending breakdown — doughnut
   ========================================================================= */
function renderSpendingChart() {
  const ctx = document.getElementById('spending-chart');
  if (!ctx || typeof Chart === 'undefined') return;

  new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Groceries', 'Rent', 'Dining', 'Transport', 'Entertainment', 'Other'],
      datasets: [{
        data: [620, 1850, 410, 215, 180, 295],
        backgroundColor: [
          '#8B6B43', '#B89464', '#D6B884', '#EFE3CC', '#C8923A', '#7A6A55',
        ],
        borderColor: '#FFFFFF',
        borderWidth: 3,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'right',
          labels: { font: { family: 'Inter', size: 12 }, color: '#3B2C1A' },
        },
      },
      cutout: '65%',
    },
  });
}


/* =========================================================================
   CHART: Income vs Expense — bar chart over 6 months
   ========================================================================= */
function renderIncomeChart() {
  const ctx = document.getElementById('income-chart');
  if (!ctx || typeof Chart === 'undefined') return;

  new Chart(ctx, {
    type: 'bar',
    data: {
      labels: ['Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May'],
      datasets: [
        {
          label: 'Income',
          data: [4200, 4350, 4100, 4500, 4750, 4900],
          backgroundColor: '#8B6B43',
          borderRadius: 6,
        },
        {
          label: 'Expenses',
          data: [3100, 3380, 2950, 3220, 3470, 3570],
          backgroundColor: '#D6B884',
          borderRadius: 6,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: 'top', labels: { color: '#3B2C1A' } } },
      scales: {
        y: { ticks: { color: '#7A6A55' }, grid: { color: '#E0D2B7' } },
        x: { ticks: { color: '#7A6A55' }, grid: { display: false } },
      },
    },
  });
}


/* =========================================================================
   CHART: Investment portfolio over time — area / line chart
   ========================================================================= */
function renderPortfolioChart() {
  const ctx = document.getElementById('portfolio-chart');
  if (!ctx || typeof Chart === 'undefined') return;

  // Generate a plausible random walk of monthly portfolio values
  const values = [12500];
  for (let i = 1; i < 12; i++) {
    const drift = (Math.random() - 0.4) * 600;     // slight upward bias
    values.push(Math.max(8000, values[i - 1] + drift));
  }

  new Chart(ctx, {
    type: 'line',
    data: {
      labels: ['Jun','Jul','Aug','Sep','Oct','Nov','Dec','Jan','Feb','Mar','Apr','May'],
      datasets: [{
        label: 'Portfolio Value',
        data: values,
        borderColor: '#8B6B43',
        backgroundColor: 'rgba(139, 107, 67, 0.15)',
        fill: true,
        tension: 0.4,         // smooth curve
        pointRadius: 0,
        borderWidth: 3,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        y: { ticks: { color: '#7A6A55', callback: (v) => '$' + v }, grid: { color: '#E0D2B7' } },
        x: { ticks: { color: '#7A6A55' }, grid: { display: false } },
      },
    },
  });
}


/* =========================================================================
   TRANSACTIONS: render a fake list of recent transactions
   ========================================================================= */
function renderTransactions() {
  const container = document.getElementById('tx-list');
  if (!container) return;

  // Hard-coded array — easy to expand
  const txs = [
    { name: 'Trader Joes',         meta: 'Today · Groceries',       amount: -68.42,  icon: '🛒' },
    { name: 'Direct Deposit',      meta: 'Today · Salary',          amount: 2300.00, icon: '💰' },
    { name: 'Spotify Premium',     meta: 'Yesterday · Subscription',amount: -10.99,  icon: '🎵' },
    { name: 'Shell Gas Station',   meta: 'Yesterday · Transport',   amount: -54.10,  icon: '⛽' },
    { name: 'Apple App Store',     meta: '2 days ago · Software',   amount: -3.99,   icon: '📱' },
    { name: 'Venmo from M. Chen',  meta: '2 days ago · Transfer',   amount: 80.00,   icon: '💸' },
    { name: 'Pacific Bell',        meta: '3 days ago · Utilities',  amount: -119.50, icon: '📞' },
    { name: 'Sweetgreen',          meta: '4 days ago · Dining',     amount: -16.75,  icon: '🥗' },
  ];

  container.innerHTML = txs.map((tx) => `
    <div class="tx-row">
      <div class="tx-icon">${tx.icon}</div>
      <div>
        <div class="tx-name">${tx.name}</div>
        <div class="tx-meta">${tx.meta}</div>
      </div>
      <div class="tx-amount ${tx.amount > 0 ? 'positive' : 'negative'}">
        ${tx.amount > 0 ? '+' : '−'}$${Math.abs(tx.amount).toFixed(2)}
      </div>
      <button class="btn btn--ghost btn--sm" onclick="window.toast('Transaction details would open here.','')">View</button>
    </div>
  `).join('');
}


/* =========================================================================
   NOTIFICATIONS: a sidebar list of fake alerts
   ========================================================================= */
function renderNotifications() {
  const container = document.getElementById('notif-list');
  if (!container) return;

  const notifs = [
    { text: 'Your credit score increased by 12 points to 782.',     time: '2 hours ago',  unread: true  },
    { text: 'Large transaction alert: $1,850 to Sunrise Property.', time: '6 hours ago',  unread: true  },
    { text: 'Statement for May is now available.',                  time: 'Yesterday',    unread: false },
    { text: 'New device signed in from San Francisco, CA.',         time: '2 days ago',   unread: false },
    { text: 'You unlocked a 4.5% APY on your savings account!',     time: '3 days ago',   unread: false },
    { text: 'Reminder: Bill of $119.50 due in 3 days.',             time: '4 days ago',   unread: false },
  ];

  container.innerHTML = notifs.map((n) => `
    <li class="notif-item">
      <span class="notif-dot ${n.unread ? 'unread' : ''}"></span>
      <div style="flex:1">
        <div>${n.text}</div>
        <div class="notif-time">${n.time}</div>
      </div>
    </li>
  `).join('');
}


/* =========================================================================
   BUDGETS: progress bars showing how much of each budget is used
   ========================================================================= */
function renderBudgets() {
  const container = document.getElementById('budget-list');
  if (!container) return;

  const budgets = [
    { label: 'Groceries',     used: 620,  cap: 800 },
    { label: 'Dining out',    used: 410,  cap: 350 },   // intentionally over
    { label: 'Entertainment', used: 180,  cap: 250 },
    { label: 'Transport',     used: 215,  cap: 400 },
    { label: 'Subscriptions', used: 92,   cap: 100 },
  ];

  container.innerHTML = budgets.map((b) => {
    const pct = Math.min((b.used / b.cap) * 100, 100);
    const over = b.used > b.cap;
    return `
      <div style="margin-bottom: 16px;">
        <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
          <span style="font-weight:600;">${b.label}</span>
          <span style="font-size:0.85rem; color:${over ? 'var(--color-danger)' : 'var(--color-text-muted)'};">
            $${b.used} / $${b.cap}
            ${over ? '<span class="badge badge--danger" style="margin-left:6px;">Over</span>' : ''}
          </span>
        </div>
        <div class="progress">
          <div class="progress-bar" style="width:0%; background:${
            over ? 'linear-gradient(90deg, var(--color-danger), #d77878)'
                 : 'linear-gradient(90deg, var(--color-tan), var(--color-brown))'
          };" data-target-width="${pct}"></div>
        </div>
      </div>
    `;
  }).join('');

  // Animate the bars from 0 → target width on next tick
  requestAnimationFrame(() => {
    container.querySelectorAll('.progress-bar').forEach((bar) => {
      bar.style.width = bar.dataset.targetWidth + '%';
    });
  });
}


/* =========================================================================
   INVESTMENTS: render a small holdings table
   ========================================================================= */
function renderInvestments() {
  const tbody = document.getElementById('holdings-tbody');
  if (!tbody) return;

  const holdings = [
    { symbol: 'AAPL', name: 'Apple Inc.',          shares: 18,  price: 224.18,  change: +1.42 },
    { symbol: 'MSFT', name: 'Microsoft Corp.',     shares: 9,   price: 419.05,  change: -0.84 },
    { symbol: 'VTI',  name: 'Vanguard Total Stock',shares: 32,  price: 268.40,  change: +0.21 },
    { symbol: 'TSLA', name: 'Tesla Inc.',          shares: 6,   price: 173.59,  change: -2.18 },
    { symbol: 'BTC',  name: 'Bitcoin',             shares: 0.15,price: 68214.50,change: +3.42 },
  ];

  tbody.innerHTML = holdings.map((h) => `
    <tr>
      <td><strong>${h.symbol}</strong><div style="font-size:0.8rem; color:var(--color-text-muted);">${h.name}</div></td>
      <td>${h.shares}</td>
      <td>$${h.price.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
      <td>
        <span class="badge ${h.change > 0 ? 'badge--success' : 'badge--danger'}">
          ${h.change > 0 ? '▲' : '▼'} ${Math.abs(h.change).toFixed(2)}%
        </span>
      </td>
      <td>$${(h.shares * h.price).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
    </tr>
  `).join('');
}
