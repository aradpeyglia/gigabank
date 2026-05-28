/* =========================================================================
   AHOURA'S MEGAGANKYBANK — main.js
   -------------------------------------------------------------------------
   Shared client-side behavior used on every page:
     • Sticky-header shadow on scroll
     • Mobile hamburger toggle
     • Active nav link highlighting
     • Reveal-on-scroll animations (IntersectionObserver)
     • Animated number counters
     • Carousels / sliders (testimonials + hero slideshow)
     • Accordions (FAQ)
     • Tabs
     • Modal open/close
     • Toast notifications (window.toast(...))
     • Button "ripple" effect for tactile feedback
     • Newsletter form fake submit
   This file uses NO frameworks — vanilla JS so it runs on GitHub Pages
   without any build step.
   ========================================================================= */


/* =========================================================================
   Wait for the DOM to be fully parsed before wiring anything up.
   This avoids "element is null" errors when the script runs in <head>
   though we still attach scripts at end-of-body to be safe.
   ========================================================================= */
document.addEventListener('DOMContentLoaded', () => {
  initHeader();
  initAuthNav();           // ← run BEFORE initMobileNav so swapped buttons get the ripple/etc.
  initMobileNav();
  initActiveNavLink();
  initRevealOnScroll();
  initCounters();
  initCarousels();
  initSlideshows();
  initAccordions();
  initTabs();
  initModals();
  initRipples();
  initNewsletter();
  initTickerDuplication();
});


/* =========================================================================
   AUTH NAV: when a user is signed in (session in localStorage via auth.js),
   swap the default "Sign in / Open Account" header buttons for a personal
   greeting + sign-out. Auth.js exposes window.MGBAuth.
   ========================================================================= */
function initAuthNav() {
  // Bail silently if auth.js wasn't loaded on this page or no session exists
  const user = window.MGBAuth?.getSession?.();
  if (!user) return;

  const navCta = document.querySelector('.nav-cta');
  if (!navCta) return;

  // The dashboard page builds its own custom nav (notifications, settings,
  // logout) and identifies itself with #logout-btn. Don't clobber it.
  if (document.getElementById('logout-btn')) return;

  // Preserve the existing mobile hamburger toggle button (if present) so we
  // can re-attach it after rebuilding the rest of the nav-cta contents.
  const toggle = navCta.querySelector('.nav-toggle');

  // First name + initial for a friendly chip + circular avatar
  const firstName = user.name.split(' ')[0];
  const initial = firstName.charAt(0).toUpperCase();

  // Rebuild the buttons. We keep two slots to match the default nav-cta
  // visually (chip + action button), so the header layout doesn't jump.
  navCta.innerHTML = `
    <a href="dashboard.html" class="btn btn--ghost btn--sm" title="Go to dashboard"
       style="display:inline-flex; align-items:center; gap:8px;">
      <span aria-hidden="true"
            style="width:24px; height:24px; border-radius:50%;
                   background: linear-gradient(135deg, var(--color-tan), var(--color-brown));
                   color:#fff; display:inline-grid; place-items:center;
                   font-weight:700; font-size:0.72rem;">${initial}</span>
      Hi, ${firstName}
    </a>
    <button type="button" id="nav-signout" class="btn btn--secondary btn--sm">Sign out</button>
  `;

  // Re-append the hamburger toggle if it existed before we wiped innerHTML
  if (toggle) navCta.appendChild(toggle);

  // Wire up the sign-out: clear session, toast, then reload so all nav state
  // (here AND on hidden subpages already-rendered links) refreshes cleanly.
  navCta.querySelector('#nav-signout')?.addEventListener('click', () => {
    window.MGBAuth.clearSession();
    window.toast(`Signed out. See you soon, ${firstName}!`, '');
    setTimeout(() => window.location.reload(), 700);
  });
}


/* =========================================================================
   HEADER: Add `.scrolled` class when user scrolls past 20px to drop a shadow
   ========================================================================= */
function initHeader() {
  const header = document.querySelector('.site-header');
  if (!header) return;

  const handleScroll = () => {
    if (window.scrollY > 20) {
      header.classList.add('scrolled');
    } else {
      header.classList.remove('scrolled');
    }
  };

  window.addEventListener('scroll', handleScroll, { passive: true });
  handleScroll();   // run once on load so refresh-mid-page works
}


/* =========================================================================
   MOBILE NAV: hamburger toggle opens/closes the nav-links list
   ========================================================================= */
function initMobileNav() {
  const toggle = document.querySelector('.nav-toggle');
  const links = document.querySelector('.nav-links');
  if (!toggle || !links) return;

  toggle.addEventListener('click', () => {
    links.classList.toggle('open');
  });

  // Auto-close after clicking any link inside the mobile menu
  links.querySelectorAll('a').forEach((a) => {
    a.addEventListener('click', () => links.classList.remove('open'));
  });
}


/* =========================================================================
   ACTIVE NAV LINK: highlight the link matching the current page's filename
   ========================================================================= */
function initActiveNavLink() {
  // Derive the current page filename (e.g., "about.html"); fall back to index
  const path = window.location.pathname.split('/').pop() || 'index.html';

  document.querySelectorAll('.nav-links a').forEach((a) => {
    const href = a.getAttribute('href');
    if (!href) return;
    // Active if href matches current page exactly
    if (href === path || (path === '' && href === 'index.html')) {
      a.classList.add('active');
    }
  });
}


/* =========================================================================
   REVEAL ON SCROLL: any element with .reveal fades in when it enters view.
   Uses IntersectionObserver for performance.
   ========================================================================= */
function initRevealOnScroll() {
  const reveals = document.querySelectorAll('.reveal');
  if (reveals.length === 0) return;

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        // Only animate IN — once it's visible, stop observing to save CPU
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          observer.unobserve(entry.target);
        }
      });
    },
    {
      threshold: 0.15,           // 15% of the element must be visible
      rootMargin: '0px 0px -40px 0px',
    }
  );

  reveals.forEach((el) => observer.observe(el));
}


/* =========================================================================
   ANIMATED COUNTERS: elements with [data-counter="123"] tick up from 0
   to the target number when scrolled into view.
   ========================================================================= */
function initCounters() {
  const counters = document.querySelectorAll('[data-counter]');
  if (counters.length === 0) return;

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      const el = entry.target;
      const target = parseFloat(el.dataset.counter);
      const prefix = el.dataset.prefix || '';
      const suffix = el.dataset.suffix || '';
      const decimals = parseInt(el.dataset.decimals || '0', 10);
      const duration = 1800;     // ms
      const start = performance.now();

      // requestAnimationFrame loop — smoother than setInterval
      const tick = (now) => {
        const elapsed = now - start;
        const progress = Math.min(elapsed / duration, 1);
        // Ease-out cubic for a nice deceleration
        const eased = 1 - Math.pow(1 - progress, 3);
        const value = target * eased;
        el.textContent = prefix + value.toFixed(decimals).replace(/\B(?=(\d{3})+(?!\d))/g, ',') + suffix;
        if (progress < 1) requestAnimationFrame(tick);
      };

      requestAnimationFrame(tick);
      observer.unobserve(el);
    });
  }, { threshold: 0.4 });

  counters.forEach((c) => observer.observe(c));
}


/* =========================================================================
   CAROUSEL: testimonial-style slider with prev/next buttons + dots.
   Markup expected:
     <div class="carousel" data-autoplay="5000">
       <div class="carousel-track">
         <div class="carousel-slide">...</div>
         <div class="carousel-slide">...</div>
       </div>
       <div class="carousel-controls">
         <button class="carousel-btn prev">‹</button>
         <div class="carousel-dots"></div>
         <button class="carousel-btn next">›</button>
       </div>
     </div>
   ========================================================================= */
function initCarousels() {
  document.querySelectorAll('.carousel').forEach((carousel) => {
    const track = carousel.querySelector('.carousel-track');
    const slides = carousel.querySelectorAll('.carousel-slide');
    const prev = carousel.querySelector('.prev');
    const next = carousel.querySelector('.next');
    const dotsContainer = carousel.querySelector('.carousel-dots');
    const autoplay = parseInt(carousel.dataset.autoplay || '0', 10);
    let index = 0;

    if (slides.length === 0) return;

    // Generate dot indicators dynamically — one per slide
    if (dotsContainer) {
      slides.forEach((_, i) => {
        const dot = document.createElement('button');
        dot.className = 'carousel-dot' + (i === 0 ? ' active' : '');
        dot.setAttribute('aria-label', `Go to slide ${i + 1}`);
        dot.addEventListener('click', () => goTo(i));
        dotsContainer.appendChild(dot);
      });
    }

    // Move the track using transform; cleaner than animating left/right
    const goTo = (i) => {
      index = (i + slides.length) % slides.length;
      track.style.transform = `translateX(-${index * 100}%)`;
      dotsContainer?.querySelectorAll('.carousel-dot').forEach((d, di) => {
        d.classList.toggle('active', di === index);
      });
    };

    prev?.addEventListener('click', () => goTo(index - 1));
    next?.addEventListener('click', () => goTo(index + 1));

    // Optional autoplay timer; resets after user clicks
    if (autoplay > 0) {
      let timer = setInterval(() => goTo(index + 1), autoplay);
      carousel.addEventListener('mouseenter', () => clearInterval(timer));
      carousel.addEventListener('mouseleave', () => {
        timer = setInterval(() => goTo(index + 1), autoplay);
      });
    }
  });
}


/* =========================================================================
   SLIDESHOW: fade-style image rotator for the hero. Picks .slideshow-slide
   children and cycles through them.
   ========================================================================= */
function initSlideshows() {
  document.querySelectorAll('.slideshow').forEach((slideshow) => {
    const slides = slideshow.querySelectorAll('.slideshow-slide');
    if (slides.length < 2) return;
    let i = 0;

    setInterval(() => {
      slides[i].classList.remove('active');
      i = (i + 1) % slides.length;
      slides[i].classList.add('active');
    }, 4000);
  });
}


/* =========================================================================
   ACCORDIONS: classic open/close behavior for FAQ-style content.
   Markup:
     <div class="accordion">
       <div class="accordion-item">
         <button class="accordion-header">Question
           <span class="accordion-icon">+</span>
         </button>
         <div class="accordion-body">Answer text.</div>
       </div>
     </div>
   ========================================================================= */
function initAccordions() {
  document.querySelectorAll('.accordion-header').forEach((header) => {
    header.addEventListener('click', () => {
      const item = header.parentElement;
      const accordion = item.parentElement;

      // Optional: data-single="true" on .accordion closes others when opening
      if (accordion.dataset.single === 'true') {
        accordion.querySelectorAll('.accordion-item').forEach((sibling) => {
          if (sibling !== item) sibling.classList.remove('open');
        });
      }

      item.classList.toggle('open');
    });
  });
}


/* =========================================================================
   TABS: switch between panels.
   Markup:
     <div class="tabs">
       <button class="tab active" data-tab="one">One</button>
       <button class="tab" data-tab="two">Two</button>
     </div>
     <div class="tab-panel active" data-panel="one">...</div>
     <div class="tab-panel" data-panel="two">...</div>
   ========================================================================= */
function initTabs() {
  document.querySelectorAll('.tabs').forEach((tabsContainer) => {
    const tabs = tabsContainer.querySelectorAll('.tab');
    // The panels live as siblings *after* the .tabs element
    const scope = tabsContainer.parentElement;

    tabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        const target = tab.dataset.tab;

        // Deactivate everything within this tab-group's scope
        tabs.forEach((t) => t.classList.remove('active'));
        scope.querySelectorAll('.tab-panel').forEach((p) => p.classList.remove('active'));

        // Activate clicked tab + matching panel
        tab.classList.add('active');
        scope.querySelector(`.tab-panel[data-panel="${target}"]`)?.classList.add('active');
      });
    });
  });
}


/* =========================================================================
   MODALS: open via button [data-modal-open="modal-id"], close via
   .modal-close, clicking backdrop, or pressing Esc.
   ========================================================================= */
function initModals() {
  document.querySelectorAll('[data-modal-open]').forEach((trigger) => {
    trigger.addEventListener('click', (e) => {
      e.preventDefault();
      const id = trigger.dataset.modalOpen;
      const modal = document.getElementById(id);
      modal?.classList.add('open');
    });
  });

  document.querySelectorAll('.modal-backdrop').forEach((backdrop) => {
    // Click on backdrop (but NOT bubbled from modal content) closes the modal
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) backdrop.classList.remove('open');
    });

    backdrop.querySelectorAll('.modal-close, [data-modal-close]').forEach((btn) => {
      btn.addEventListener('click', () => backdrop.classList.remove('open'));
    });
  });

  // Esc key closes any open modal
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      document.querySelectorAll('.modal-backdrop.open').forEach((m) => m.classList.remove('open'));
    }
  });
}


/* =========================================================================
   TOASTS: window.toast('message', 'success' | 'error' | 'warning' | '')
   Creates the container on first call so pages don't need to add markup.
   ========================================================================= */
window.toast = function (message, type = '') {
  let container = document.querySelector('.toast-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = 'toast ' + type;
  toast.textContent = message;
  container.appendChild(toast);

  // Auto-dismiss after 4s with a fade-out
  setTimeout(() => {
    toast.style.transition = 'opacity 0.4s, transform 0.4s';
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(20px)';
    setTimeout(() => toast.remove(), 400);
  }, 4000);
};


/* =========================================================================
   BUTTON RIPPLE: visual feedback on click. Adds a temporary expanding
   circle at click coordinates inside the button.
   ========================================================================= */
function initRipples() {
  document.querySelectorAll('.btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const rect = btn.getBoundingClientRect();
      const size = Math.max(rect.width, rect.height);
      const ripple = document.createElement('span');
      ripple.className = 'ripple';
      ripple.style.width = ripple.style.height = size + 'px';
      ripple.style.left = e.clientX - rect.left - size / 2 + 'px';
      ripple.style.top  = e.clientY - rect.top  - size / 2 + 'px';
      btn.appendChild(ripple);
      setTimeout(() => ripple.remove(), 600);
    });
  });
}


/* =========================================================================
   NEWSLETTER FAKE SUBMIT: catches submit, shows a toast, clears input.
   ========================================================================= */
function initNewsletter() {
  document.querySelectorAll('.newsletter-form, .footer-newsletter form').forEach((form) => {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const email = form.querySelector('input[type="email"]')?.value || '';
      if (!email) {
        window.toast('Please enter your email address.', 'warning');
        return;
      }
      window.toast(`Thanks! We'll send updates to ${email}`, 'success');
      form.reset();
    });
  });
}


/* =========================================================================
   TICKER DUPLICATION: to create a seamless infinite scrolling marquee
   we duplicate the contents of the .ticker-track so the CSS animation
   (translateX -50%) loops without a visible jump.
   ========================================================================= */
function initTickerDuplication() {
  document.querySelectorAll('.ticker-track').forEach((track) => {
    track.innerHTML += track.innerHTML;
  });
}
