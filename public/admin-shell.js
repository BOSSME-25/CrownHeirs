/* Shared shell for every /admin page: one sign-in, one nav.
   Pages put <div id="nav"></div> where the bar goes and call
   AdminShell.requireAuth().then(start). The password is checked against the
   server on every page load, so a changed password signs everyone out. */
(function () {
  const KEY = sessionStorage.getItem('chKey') || '';
  const here = location.pathname.replace(/\/$/, '') || '/admin';
  const LINKS = [
    ['/admin', 'Home'],
    ['/admin/desk', 'Front Desk'],
    ['/admin/desk?tab=team', 'Team'],
    ['/admin/tv', 'TV Display'],
    ['/admin/settings', 'Settings']
  ];

  const css = `
    .adm-nav { display:flex; align-items:center; gap:10px; flex-wrap:wrap; padding:12px 0 16px; border-bottom:1px solid var(--border, rgba(26,24,22,.12)); margin-bottom:16px; }
    .adm-brand { display:flex; align-items:center; gap:10px; text-decoration:none; color:inherit; margin-right:auto; }
    .adm-brand img { height:38px; }
    .adm-brand span { font-family:'Cinzel', serif; font-size:13px; letter-spacing:.2em; text-transform:uppercase; }
    .adm-links { display:flex; gap:4px; flex-wrap:wrap; }
    .adm-links a { text-decoration:none; color:var(--ink-mid, #4a4540); font-size:14px; padding:7px 12px; border-radius:100px; border:1px solid transparent; }
    .adm-links a.on { background:var(--ink, #1a1816); color:#fff; }
    .adm-links a.out { color:var(--ink-dim, #8a837a); }
    @media (max-width: 520px) { .adm-brand span { display:none; } .adm-links a { padding:7px 10px; font-size:13px; } }`;

  function nav() {
    const el = document.getElementById('nav');
    if (!el) return;
    if (!document.getElementById('adm-css')) {
      const st = document.createElement('style'); st.id = 'adm-css'; st.textContent = css; document.head.appendChild(st);
    }
    const isOn = (href) => {
      const [p, q] = href.split('?');
      if (p !== here) return false;
      const want = q ? new URLSearchParams(q).get('tab') : null;
      return (new URLSearchParams(location.search).get('tab') || null) === want;
    };
    el.innerHTML = `<nav class="adm-nav">
      <a class="adm-brand" href="/admin"><img src="/images/logo-1.png" alt=""><span>Crown Heirs Admin</span></a>
      <div class="adm-links">${LINKS.map(([h, t]) => `<a href="${h}" class="${isOn(h) ? 'on' : ''}">${t}</a>`).join('')}
        <a href="#" class="out" id="adm-signout">Sign out</a></div></nav>`;
    document.getElementById('adm-signout').onclick = (e) => { e.preventDefault(); signOut(); };
  }

  function toLogin() {
    location.replace('/admin?next=' + encodeURIComponent(location.pathname + location.search));
    return new Promise(() => {});          // never resolves — the page is leaving
  }

  async function requireAuth() {
    if (!KEY) return toLogin();
    const r = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: KEY }) });
    if (!r.ok) { sessionStorage.removeItem('chKey'); return toLogin(); }
    nav();
    return KEY;
  }

  function signOut() { sessionStorage.removeItem('chKey'); location.href = '/admin'; }

  window.AdminShell = { KEY, requireAuth, nav, signOut };
})();
