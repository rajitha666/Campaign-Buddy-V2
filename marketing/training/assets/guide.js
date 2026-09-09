/* Campaign Buddy training guides — shared behaviour */
(function () {
  'use strict';

  // ---- scroll progress bar ----
  var bar = document.querySelector('.progress > i');
  function onScroll() {
    if (bar) {
      var h = document.documentElement;
      var max = h.scrollHeight - h.clientHeight;
      bar.style.width = max > 0 ? (h.scrollTop / max) * 100 + '%' : '0%';
    }
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // ---- TOC scroll-spy ----
  var tasks = [].slice.call(document.querySelectorAll('.task[id]'));
  var tocLinks = {};
  document.querySelectorAll('.toc a[href^="#"]').forEach(function (a) {
    tocLinks[a.getAttribute('href').slice(1)] = a;
  });
  if (tasks.length && 'IntersectionObserver' in window) {
    var current = null;
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) current = e.target.id;
      });
      Object.keys(tocLinks).forEach(function (id) {
        tocLinks[id].classList.toggle('active', id === current);
      });
    }, { rootMargin: '-20% 0px -70% 0px', threshold: 0 });
    tasks.forEach(function (t) { io.observe(t); });
  }

  // ---- keep collapsed tasks reachable from the TOC ----
  document.querySelectorAll('.toc a[href^="#"]').forEach(function (a) {
    a.addEventListener('click', function () {
      var t = document.getElementById(a.getAttribute('href').slice(1));
      if (t && t.tagName === 'DETAILS') t.open = true;
      closeDrawer();
    });
  });

  // ---- lightbox ----
  var lb = document.createElement('div');
  lb.className = 'lightbox';
  lb.innerHTML = '<button class="lb-close" aria-label="Close">×</button><img alt="">';
  document.body.appendChild(lb);
  var lbImg = lb.querySelector('img');
  function openLB(src, alt) { lbImg.src = src; lbImg.alt = alt || ''; lb.classList.add('open'); }
  function closeLB() { lb.classList.remove('open'); lbImg.src = ''; }
  lb.addEventListener('click', closeLB);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeLB(); });
  document.querySelectorAll('figure img').forEach(function (img) {
    img.addEventListener('click', function () { openLB(img.currentSrc || img.src, img.alt); });
  });

  // ---- mobile TOC drawer ----
  var toc = document.querySelector('.toc');
  var toggle = document.querySelector('.tb-toc-toggle');
  var scrim = document.createElement('div');
  scrim.className = 'toc-scrim';
  document.body.appendChild(scrim);
  function closeDrawer() { toc && toc.classList.remove('open'); scrim.classList.remove('open'); }
  if (toggle && toc) {
    toggle.addEventListener('click', function () {
      var open = !toc.classList.contains('open');
      toc.classList.toggle('open', open);
      scrim.classList.toggle('open', open);
    });
    scrim.addEventListener('click', closeDrawer);
  }
})();
