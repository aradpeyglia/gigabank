/* =========================================================================
   MEGAGANKY LAB — AUTHENTICATED WORKSPACE
   -------------------------------------------------------------------------
   Renders fictional activity after auth.js confirms a test session. No
   transaction, payment, account, or production-customer data is represented.
   ========================================================================= */

document.addEventListener('DOMContentLoaded', () => {
  const user = window.MGBAuth?.getSession?.();

  /* Direct visits without a test session return to the clearly labeled
     demo-login page instead of showing an uninitialized workspace. */
  if (!user) {
    window.location.href = 'login.html';
    return;
  }

  const firstName = String(user.name || 'Demo User').split(' ')[0];
  document.querySelectorAll('.greet-name').forEach((element) => {
    element.textContent = firstName;
  });

  /* Logout clears both the fictional profile and Glia identity token. */
  document.getElementById('logout-btn')?.addEventListener('click', () => {
    window.toast('Ending the fictional test session…', '');
    setTimeout(() => window.MGBAuth.logout(), 500);
  });

  /* Populate an activity feed with explicit sample labels. */
  const activities = [
    { icon: '🔐', title: 'Demo login completed', detail: 'Fictional identity loaded into local session state.' },
    { icon: '🪪', title: 'Direct ID token issued', detail: 'Short-lived test token is available to the Glia integration.' },
    { icon: '🧭', title: 'Workspace route opened', detail: 'Responsive authenticated layout rendered successfully.' },
    { icon: '🧪', title: 'Sample activity generated', detail: 'No real user action or production data is represented.' },
  ];
  const list = document.getElementById('activity-list');
  if (list) {
    list.innerHTML = activities.map((item) => `
      <div style="display:flex;gap:12px;align-items:flex-start;padding:12px;background:var(--color-bg-alt);border-radius:var(--radius-md);">
        <span aria-hidden="true" style="font-size:1.25rem;">${item.icon}</span>
        <div><strong>${item.title}</strong><p class="text-muted" style="font-size:0.88rem;margin-top:2px;">${item.detail}</p></div>
      </div>
    `).join('');
  }

  /* Report only coarse viewport state, useful for responsive UI testing. */
  const viewportStatus = document.getElementById('viewport-status');
  const updateViewport = () => {
    if (!viewportStatus) return;
    viewportStatus.textContent = window.innerWidth < 700 ? 'Compact layout' : 'Expanded layout';
  };
  updateViewport();
  window.addEventListener('resize', updateViewport);

  /* Quick actions intentionally produce local toasts and no network writes. */
  document.querySelectorAll('.demo-action').forEach((button) => {
    button.addEventListener('click', () => {
      window.toast(button.dataset.message || 'Demo action completed.', 'success');
    });
  });
});
