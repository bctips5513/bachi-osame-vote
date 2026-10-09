(function () {
  const cfg = window.VOTE_CONFIG;
  const $ = id => document.getElementById(id);
  const RANK_LABELS = ['1位', '2位', '3位'];
  const ZOOM_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5 21 21"/></svg>';
  const medal = place => `<span class="medal m${place}" aria-hidden="true"><b>${place}</b><small>位</small></span>`;

  const state = { picks: [], closed: false, deadline: null };

  document.title = cfg.title;
  if (VoteApi.isMock) {
    $('demoNote').hidden = false;
    $('demoReset').addEventListener('click', () => {
      resetDemo();
      location.reload();
    });
  }

  function show(id) {
    ['loading', 'voteView', 'resultView', 'messageView'].forEach(s => { $(s).hidden = s !== id; });
    $('tray').hidden = id !== 'voteView';
  }

  function fmtDeadline(d) {
    const w = '日月火水木金土'[d.getDay()];
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${d.getMonth() + 1}月${d.getDate()}日(${w}) ${hh}:${mm}`;
  }

  // 表示順は人ごとにランダム（位置による偏りを防ぐ）。同じ端末では毎回同じ順
  function itemOrder() {
    let seed;
    try { seed = Number(localStorage.getItem('bachi_seed')); } catch (e) { /* noop */ }
    if (!seed) {
      seed = Math.floor(Math.random() * 2 ** 31) + 1;
      try { localStorage.setItem('bachi_seed', String(seed)); } catch (e) { /* noop */ }
    }
    const ids = Array.from({ length: cfg.itemCount }, (_, i) => i + 1);
    for (let i = ids.length - 1; i > 0; i--) {
      seed = (seed * 48271) % 2147483647;
      const j = seed % (i + 1);
      [ids[i], ids[j]] = [ids[j], ids[i]];
    }
    return ids;
  }

  // ---------- 投票画面 ----------
  function buildGrid() {
    const grid = $('grid');
    grid.innerHTML = '';
    itemOrder().forEach(id => {
      const card = document.createElement('div');
      card.className = 'card';
      card.dataset.id = id;
      card.setAttribute('role', 'button');
      card.setAttribute('tabindex', '0');
      card.setAttribute('aria-label', `No.${id} をえらぶ`);
      card.innerHTML = `
        <div class="ph"><img src="${imgSrc(id)}" alt="No.${id}" loading="lazy"></div>
        <span class="no">No.${id}</span>
        <button class="zoom" type="button" aria-label="No.${id} を大きく見る">${ZOOM_ICON}</button>`;
      card.addEventListener('click', e => {
        if (e.target.closest('.zoom')) return openLightbox(id);
        toggle(id);
      });
      card.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(id); }
      });
      grid.appendChild(card);
    });
    renderPicks();
  }

  function toggle(id) {
    const i = state.picks.indexOf(id);
    if (i >= 0) state.picks.splice(i, 1);
    else if (state.picks.length < 3) state.picks.push(id);
    else return flashTray();
    renderPicks(i < 0 ? id : null);
  }

  function flashTray() {
    $('slots').animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-7px)' }, { transform: 'translateX(7px)' }, { transform: 'translateX(0)' }], { duration: 260 });
  }

  function renderPicks(justPicked) {
    document.querySelectorAll('.card').forEach(card => {
      const id = Number(card.dataset.id);
      const i = state.picks.indexOf(id);
      card.classList.remove('selected', 'p1', 'p2', 'p3');
      card.setAttribute('aria-pressed', i >= 0 ? 'true' : 'false');
      const old = card.querySelector('.medal');
      if (i >= 0) {
        card.classList.add('selected', 'p' + (i + 1));
        // 順位が変わったときだけメダルを付け直してアニメーションさせる
        if (!old || old.className.indexOf('m' + (i + 1)) < 0) {
          if (old) old.remove();
          card.insertAdjacentHTML('beforeend', medal(i + 1));
        }
      } else if (old) old.remove();
      if (id === justPicked) {
        card.classList.remove('pop');
        void card.offsetWidth;
        card.classList.add('pop');
      }
    });

    const slots = $('slots');
    slots.innerHTML = '';
    RANK_LABELS.forEach((label, i) => {
      const id = state.picks[i];
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'slot' + (id ? ` filled s${i + 1}` : '');
      b.innerHTML = medal(i + 1) + (id ? `<img src="${imgSrc(id)}" alt="${label}: No.${id}">` : 'まだ');
      if (id) {
        b.setAttribute('aria-label', `${label}のNo.${id}をとりけす`);
        b.addEventListener('click', () => toggle(id));
      } else {
        b.setAttribute('aria-label', `${label}はまだえらんでいません`);
      }
      slots.appendChild(b);
    });
    updateSubmit();
  }

  function updateSubmit() {
    const hasName = !!$('name').value.trim();
    const ready = hasName && state.picks.length === 3;
    const btn = $('submit');
    btn.disabled = !ready;
    btn.classList.toggle('ready', ready);
    if (ready) btn.textContent = 'おくる！';
    else if (state.picks.length < 3) btn.textContent = `あと${3 - state.picks.length}つ`;
    else btn.textContent = 'なまえを書いてね';
  }

  function openLightbox(id) {
    $('lbImg').src = imgSrc(id);
    $('lbImg').alt = `No.${id}`;
    $('lightbox').showModal();
  }

  function openConfirm() {
    $('confirmName').textContent = $('name').value.trim();
    $('confirmList').innerHTML = state.picks.map((id, i) =>
      `<figure>${medal(i + 1)}<div class="ph"><img src="${imgSrc(id)}" alt="${RANK_LABELS[i]}: No.${id}"></div></figure>`).join('');
    $('confirmError').hidden = true;
    $('sendBtn').disabled = false;
    $('sendBtn').textContent = '投票する！';
    $('confirmDlg').showModal();
  }

  const ERRORS = {
    already_voted: 'このなまえは もう投票しているよ。',
    closed: 'しめきりを すぎたので 投票できないよ。',
    bad_name: 'なまえを 30文字までで 書いてね。',
    bad_ranks: '衣装を3つ えらびなおしてね。',
  };

  async function send() {
    $('sendBtn').disabled = true;
    $('sendBtn').textContent = 'おくっています…';
    try {
      const res = await VoteApi.vote($('name').value.trim(), state.picks.slice());
      if (!res.ok) throw new Error(ERRORS[res.error] || 'うまくおくれなかったよ。すこし待ってから もういちど ためしてね。');
      VotedStore.set(res.token);
      $('confirmDlg').close();
      window.scrollTo(0, 0);
      await loadResults(res.token, true);
      confetti();
    } catch (err) {
      $('confirmError').textContent = err.message || 'つうしんエラーだよ。電波のいいところで もういちど ためしてね。';
      $('confirmError').hidden = false;
      $('sendBtn').disabled = false;
      $('sendBtn').textContent = '投票する！';
    }
  }

  // ---------- 結果画面 ----------
  async function loadResults(token, justVoted) {
    show('loading');
    let res;
    try { res = await VoteApi.results(token); } catch (e) { res = { ok: false, error: 'network' }; }
    if (!res.ok) {
      if (res.error === 'not_yet') {
        showMessage('けっかは まだひみつ', `けっかは しめきり（${fmtDeadline(state.deadline)}）のあとに 見られるよ。`);
      } else {
        showMessage('よみこめなかったよ', 'ページを よみこみなおしてね。');
      }
      return;
    }
    $('thanks').hidden = !token;
    $('thanksMsg').textContent = res.closed
      ? '投票は おわりました。さいごの けっかは こちら！'
      : `しめきり（${fmtDeadline(new Date(res.deadline))}）までは とちゅうの けっかだよ。まだ かわるかも！`;
    $('resultTitle').textContent = res.closed ? '🏆 けっか発表！' : '📊 いまの じゅんい';
    $('resultStatus').textContent = `${res.voters}人が投票したよ`;
    $('printLink').href = 'print.html' + (token ? '?t=' + encodeURIComponent(token) : '');

    const max = Math.max(1, ...res.items.map(it => it.points));
    $('rankList').innerHTML = res.items.map(it => `
      <div class="row ${it.rank <= 3 && it.points > 0 ? 'top' + it.rank : ''}">
        ${it.rank <= 3 && it.points > 0 ? medal(it.rank) : `<div class="rnum">${it.rank}<small>位</small></div>`}
        <div class="ph"><img src="${imgSrc(it.id)}" alt="No.${it.id}" loading="lazy"></div>
        <div>
          <div class="pts">${it.points}<small>てん</small></div>
          <div class="cnt"><span>1位 ${it.counts[0]}票</span><span>2位 ${it.counts[1]}票</span><span>3位 ${it.counts[2]}票</span></div>
          <div class="bar"><span style="width:${(it.points / max) * 100}%"></span></div>
        </div>
      </div>`).join('');
    show('resultView');
  }

  function showMessage(title, body) {
    $('msgTitle').textContent = title;
    $('msgBody').textContent = body;
    show('messageView');
  }

  // ---------- 紙ふぶき ----------
  function confetti() {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const c = document.createElement('canvas');
    c.className = 'confetti';
    const dpr = window.devicePixelRatio || 1;
    c.width = innerWidth * dpr;
    c.height = innerHeight * dpr;
    document.body.appendChild(c);
    const ctx = c.getContext('2d');
    ctx.scale(dpr, dpr);
    const colors = ['#e5432f', '#ffc83d', '#2c3e8f', '#4cb782', '#ff8fb1', '#ffffff'];
    const ps = Array.from({ length: 140 }, () => ({
      x: innerWidth / 2 + (Math.random() - .5) * 80,
      y: innerHeight * .25,
      vx: (Math.random() - .5) * 14,
      vy: -Math.random() * 12 - 4,
      w: 6 + Math.random() * 6,
      h: 8 + Math.random() * 8,
      r: Math.random() * Math.PI,
      vr: (Math.random() - .5) * .4,
      color: colors[Math.floor(Math.random() * colors.length)],
    }));
    const start = performance.now();
    (function frame(t) {
      ctx.clearRect(0, 0, innerWidth, innerHeight);
      ps.forEach(p => {
        p.vy += .32; p.vx *= .99; p.x += p.vx; p.y += p.vy; p.r += p.vr;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.r);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.cos(p.r * 2));
        ctx.restore();
      });
      if (t - start < 3200) requestAnimationFrame(frame);
      else c.remove();
    })(start);
  }

  // ---------- 起動 ----------
  async function init() {
    let conf;
    try {
      conf = await VoteApi.config();
    } catch (e) {
      showMessage('よみこめなかったよ', '電波をたしかめて、ページを よみこみなおしてね。');
      return;
    }
    state.deadline = new Date(conf.deadline);
    state.closed = conf.closed;
    $('deadline').textContent = (conf.closed ? 'しめきりました：' : 'しめきり：') + fmtDeadline(state.deadline);

    const token = VotedStore.get();
    if (token) return loadResults(token, false);
    if (conf.closed) return loadResults(null, false);

    buildGrid();
    show('voteView');
  }

  $('name').addEventListener('input', updateSubmit);
  $('submit').addEventListener('click', openConfirm);
  $('cancelBtn').addEventListener('click', () => $('confirmDlg').close());
  $('sendBtn').addEventListener('click', send);
  $('lbClose').addEventListener('click', () => $('lightbox').close());
  $('lightbox').addEventListener('click', e => { if (e.target === $('lightbox')) $('lightbox').close(); });

  init();
})();
