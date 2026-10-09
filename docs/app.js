(function () {
  const cfg = window.VOTE_CONFIG;
  const $ = id => document.getElementById(id);
  const R = window.ruby;
  const RANK_LABELS = ['1位', '2位', '3位'];
  const ZOOM_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5 21 21"/></svg>';
  const medal = place => `<span class="medal m${place}" aria-hidden="true"><b>${place}</b><small>位</small></span>`;
  const T = {
    send: `${R('送', 'おく')}る！`,
    vote: `${R('投票', 'とうひょう')}する！`,
    writeName: `${R('名前', 'なまえ')}を${R('書', 'か')}いてね`,
  };

  const state = { picks: [], deadline: null, confReady: null };

  document.title = cfg.title;

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

  function showDeadline(conf) {
    state.deadline = new Date(conf.deadline);
    $('deadline').textContent = (conf.closed ? 'しめきりました：' : 'しめきり：') + fmtDeadline(state.deadline);
    $('demoNote').hidden = !VoteApi.isDemo();
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
      card.setAttribute('aria-label', `No.${id} を選ぶ`);
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
        b.setAttribute('aria-label', `${label}のNo.${id}を取り消す`);
        b.addEventListener('click', () => toggle(id));
      } else {
        b.setAttribute('aria-label', `${label}はまだ選んでいません`);
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
    if (ready) btn.innerHTML = T.send;
    else if (state.picks.length < 3) btn.textContent = `あと${3 - state.picks.length}つ`;
    else btn.innerHTML = T.writeName;
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
    $('sendBtn').innerHTML = T.vote;
    $('confirmDlg').showModal();
  }

  const ERRORS = {
    already_voted: `この${R('名前', 'なまえ')}は もう${R('投票', 'とうひょう')}しているよ。`,
    closed: `しめきりを すぎたので ${R('投票', 'とうひょう')}できないよ。`,
    demo_mode: `いまは ${R('投票', 'とうひょう')}の じゅんび中だよ。ページを よみこみなおしてね。`,
    bad_name: `${R('名前', 'なまえ')}を 30${R('文字', 'もじ')}までで ${R('書', 'か')}いてね。`,
    bad_ranks: `${R('衣装', 'いしょう')}を3つ ${R('選', 'えら')}びなおしてね。`,
  };

  async function send() {
    $('sendBtn').disabled = true;
    $('sendBtn').innerHTML = `${R('送', 'おく')}っています…`;
    try {
      // デモ／本番がわかるまで送信しない
      const conf = await state.confReady;
      if (!conf || !conf.ok) throw new TypeError('config');
      const res = await VoteApi.vote($('name').value.trim(), state.picks.slice());
      if (!res.ok) throw new Error(ERRORS[res.error] || `うまく${R('送', 'おく')}れなかったよ。すこし${R('待', 'ま')}ってから もう${R('一度', 'いちど')} ためしてね。`);
      VotedStore.set(res.token);
      $('confirmDlg').close();
      window.scrollTo(0, 0);
      await loadResults(res.token, true);
      confetti();
    } catch (err) {
      $('confirmError').innerHTML = err instanceof TypeError
        ? `つうしんエラーだよ。${R('電波', 'でんぱ')}のいいところで もう${R('一度', 'いちど')} ためしてね。`
        : err.message;
      $('confirmError').hidden = false;
      $('sendBtn').disabled = false;
      $('sendBtn').innerHTML = T.vote;
    }
  }

  // ---------- 結果画面 ----------
  function renderResults(res, opts) {
    $('thanks').hidden = !opts.token || opts.admin;
    $('thanksMsg').innerHTML = res.closed
      ? `${R('投票', 'とうひょう')}は${R('終', 'お')}わりました。${R('最後', 'さいご')}の${R('結果', 'けっか')}はこちら！`
      : `しめきり（${fmtDeadline(new Date(res.deadline))}）までは${R('途中', 'とちゅう')}の${R('結果', 'けっか')}だよ。まだ${R('変', 'か')}わるかも！`;
    $('resultTitle').innerHTML = res.closed
      ? `🏆 ${R('結果', 'けっか')}${R('発表', 'はっぴょう')}！`
      : `📊 ${R('今', 'いま')}の${R('順位', 'じゅんい')}`;
    $('resultStatus').innerHTML = `${res.voters}${R('人', 'にん')}が${R('投票', 'とうひょう')}したよ`;

    const max = Math.max(1, ...res.items.map(it => it.points));
    $('rankList').innerHTML = res.items.map(it => `
      <div class="row ${it.rank <= 3 && it.points > 0 ? 'top' + it.rank : ''}">
        ${it.rank <= 3 && it.points > 0 ? medal(it.rank) : `<div class="rnum">${it.rank}<small>位</small></div>`}
        <div class="ph"><img src="${imgSrc(it.id)}" alt="No.${it.id}" loading="lazy"></div>
        <div>
          <div class="pts">${it.points}<small>${R('点', 'てん')}</small></div>
          <div class="cnt"><span>1位 ${it.counts[0]}票</span><span>2位 ${it.counts[1]}票</span><span>3位 ${it.counts[2]}票</span></div>
          <div class="bar"><span style="width:${(it.points / max) * 100}%"></span></div>
        </div>
      </div>`).join('');
    show('resultView');
  }

  async function loadResults(token, justVoted) {
    show('loading');
    let res;
    try { res = await VoteApi.results(token); } catch (e) { res = { ok: false, error: 'network' }; }
    if (!res.ok) {
      if (res.error === 'not_yet') {
        showMessage(`${R('結果', 'けっか')}は まだひみつ`, `${R('結果', 'けっか')}は しめきり（${fmtDeadline(state.deadline)}）の${R('後', 'あと')}に${R('見', 'み')}られるよ。`);
      } else {
        showMessage('よみこめなかったよ', 'ページを よみこみなおしてね。');
      }
      return;
    }
    $('adminPanel').hidden = true;
    renderResults(res, { token, justVoted });
  }

  function showMessage(title, body) {
    $('msgTitle').innerHTML = title;
    $('msgBody').innerHTML = body;
    show('messageView');
  }

  // ---------- 管理者モード ----------
  function toLocalInput(d) {
    const p = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
  }

  function adminError(msg) {
    $('adminError').textContent = msg;
    $('adminError').hidden = !msg;
  }

  async function showAdmin() {
    show('loading');
    $('adminOpen').hidden = true;
    let res;
    try { res = await VoteApi.adminResults(); } catch (e) { res = { ok: false }; }
    if (!res.ok) {
      AdminSession.clear();
      $('adminOpen').hidden = false;
      showMessage('管理者モードを開けませんでした', 'もう一度ログインしてください。');
      return;
    }
    const demo = VoteApi.isDemo();
    $('modeBadge').textContent = demo ? 'デモ' : '本番';
    $('modeBadge').className = 'mode-badge ' + (demo ? 'demo' : 'live');
    $('modeToggle').textContent = demo ? '本番モードにする' : 'デモモードに戻す';
    $('modeHelp').textContent = demo
      ? 'いまは投票が各端末にだけ保存され、集計に入りません。下の結果は、この端末で試したデモの投票です。'
      : 'いまは本番です。投票はスプレッドシートに記録され、下の結果に集計されます。';
    $('deadlineInput').value = toLocalInput(state.deadline);
    adminError('');
    $('adminPanel').hidden = false;
    renderResults(res, { admin: true });
  }

  async function adminAction(op, value, confirmMsg) {
    if (confirmMsg && !window.confirm(confirmMsg)) return;
    adminError('');
    let res;
    try { res = await VoteApi.admin(op, value); } catch (e) { res = { ok: false, error: 'network' }; }
    if (!res.ok) {
      adminError(res.error === 'bad_password' || res.error === 'locked'
        ? 'ログインし直してください。'
        : '保存できませんでした。通信状態を確認して、もう一度お試しください。');
      return false;
    }
    showDeadline(res);
    await showAdmin();
    return true;
  }

  function openAdminLogin() {
    $('adminPw').value = '';
    $('adminLoginError').hidden = true;
    $('adminLogin').disabled = false;
    $('adminDlg').showModal();
  }

  async function adminLogin(e) {
    e.preventDefault();
    const pw = $('adminPw').value.trim();
    if (!pw) return;
    $('adminLogin').disabled = true;
    let res;
    try { res = await VoteApi.admin('login', null, pw); } catch (err) { res = { ok: false, error: 'network' }; }
    $('adminLogin').disabled = false;
    if (!res.ok) {
      $('adminLoginError').textContent = {
        bad_password: 'パスワードが違います。',
        locked: '間違いが続いたため、10分ほど待ってからお試しください。',
        offline: '集計の仕組みにつながっていません。',
      }[res.error] || '通信エラーです。もう一度お試しください。';
      $('adminLoginError').hidden = false;
      return;
    }
    AdminSession.set(pw);
    $('adminDlg').close();
    showDeadline(res);
    window.scrollTo(0, 0);
    showAdmin();
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
    // 集計APIの応答には数秒かかるため、未投票の人には先に投票画面を出しておく
    const confPromise = VoteApi.init();
    state.confReady = confPromise;
    const early = !AdminSession.get() && !VotedStore.get();
    if (early) {
      buildGrid();
      show('voteView');
    }

    let conf;
    try {
      conf = await confPromise;
      if (!conf.ok) throw new Error();
    } catch (e) {
      if (!early) showMessage('よみこめなかったよ', `${R('電波', 'でんぱ')}をたしかめて、ページを よみこみなおしてね。`);
      return;
    }
    showDeadline(conf);

    if (AdminSession.get()) {
      const res = await VoteApi.admin('login').catch(() => ({ ok: false }));
      if (res.ok) return showAdmin();
      AdminSession.clear();
    }

    // モードが分かってから、そのモードの投票済み記録を確認する
    const token = VotedStore.get();
    if (token) return loadResults(token, false);
    if (conf.closed) return loadResults(null, false);

    if (!early) {
      buildGrid();
      show('voteView');
    }
  }

  $('name').addEventListener('input', updateSubmit);
  $('submit').addEventListener('click', openConfirm);
  $('cancelBtn').addEventListener('click', () => $('confirmDlg').close());
  $('sendBtn').addEventListener('click', send);
  $('lbClose').addEventListener('click', () => $('lightbox').close());
  $('lightbox').addEventListener('click', e => { if (e.target === $('lightbox')) $('lightbox').close(); });
  $('demoReset').addEventListener('click', () => { resetDemo(); location.reload(); });

  $('adminOpen').addEventListener('click', openAdminLogin);
  $('adminCancel').addEventListener('click', () => $('adminDlg').close());
  $('adminForm').addEventListener('submit', adminLogin);
  $('adminLogout').addEventListener('click', () => { AdminSession.clear(); location.reload(); });
  $('modeToggle').addEventListener('click', () => {
    const toLive = VoteApi.isDemo();
    adminAction('setMode', toLive ? 'live' : 'demo', toLive
      ? '本番モードにします。ここからの投票はスプレッドシートに記録され、集計されます。よろしいですか？'
      : 'デモモードに戻します。本番の投票は受け付けなくなります（記録済みの票は消えません）。よろしいですか？');
  });
  $('deadlineSave').addEventListener('click', () => {
    const v = $('deadlineInput').value;
    if (!v) return adminError('締切の日時を入力してください。');
    const d = new Date(v);
    adminAction('setDeadline', d.toISOString(), `締切を ${fmtDeadline(d)} に変更します。よろしいですか？`);
  });

  init();
})();
