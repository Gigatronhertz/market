/* Naija Market Day: shared interactions. Kept quiet on purpose. */
(function () {
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Header: a hairline appears once the page scrolls; mobile menu toggle
  var header = document.querySelector('.site-header');
  if (header) {
    var onScroll = function () { header.classList.toggle('scrolled', window.scrollY > 8); };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    var btn = header.querySelector('.menu-btn');
    if (btn) btn.addEventListener('click', function () {
      var open = header.classList.toggle('open');
      btn.setAttribute('aria-expanded', String(open));
    });
  }

  // Gentle fade-in for sections as they arrive
  var targets = document.querySelectorAll('main section, main .work, main .person, main .shop > a');
  targets.forEach(function (el) { el.classList.add('reveal'); });
  if ('IntersectionObserver' in window && !reduce) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
    }, { threshold: 0.1 });
    targets.forEach(function (el) { io.observe(el); });
  } else {
    targets.forEach(function (el) { el.classList.add('in'); });
  }

  // Videos: play only while on screen, to save bandwidth
  if ('IntersectionObserver' in window) {
    var vio = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        var v = e.target;
        if (e.isIntersecting) { var p = v.play(); if (p && p.catch) p.catch(function () {}); }
        else { v.pause(); }
      });
    }, { threshold: 0.25 });
    document.querySelectorAll('video[data-autoplay]').forEach(function (v) { vio.observe(v); });
  }

  // Toast message
  var toast = document.createElement('div');
  toast.className = 'toast';
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  document.body.appendChild(toast);
  var tid;
  window.nmdToast = function (msg) {
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(tid);
    tid = setTimeout(function () { toast.classList.remove('show'); }, 2600);
  };

  // Forms confirm instead of doing nothing
  document.querySelectorAll('form').forEach(function (f) {
    if (f.hasAttribute('data-api')) return;
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      window.nmdToast(f.getAttribute('data-toast') || 'Thanks, we have got it.');
    });
  });

  // Save toggles on product images
  document.querySelectorAll('.saved').forEach(function (b) {
    b.setAttribute('aria-pressed', 'false');
    b.setAttribute('aria-label', 'Save this item');
    b.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 21s-7-4.4-9.3-8.6C1 9.2 2.8 5.5 6.4 5.5c2 0 3.4 1.2 4.1 2.4.7-1.2 2.1-2.4 4.1-2.4 3.6 0 5.4 3.7 3.7 6.9C19 16.6 12 21 12 21z"/></svg>';
    b.addEventListener('click', function (e) {
      e.preventDefault(); e.stopPropagation();
      var on = b.getAttribute('aria-pressed') !== 'true';
      b.setAttribute('aria-pressed', String(on));
      window.nmdToast(on ? 'Saved to your list' : 'Removed from your list');
    });
  });

  // Elements with data-toast show a message on click (e.g. Chat)
  document.querySelectorAll('[data-toast]').forEach(function (el) {
    if (el.tagName === 'FORM') return;
    el.addEventListener('click', function (e) {
      if (el.tagName === 'A' && el.getAttribute('href') === '#') e.preventDefault();
      window.nmdToast(el.getAttribute('data-toast'));
    });
  });
})();
