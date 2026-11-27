'use strict';

const storefront = [25, 35, 50, 100];
const shopVip = [
  { sku: 'vip_sari', name: 'VIP Sarı', color: 'yellow', written: 5 },
  { sku: 'vip_mavi', name: 'VIP Mavi', color: 'blue', written: 10 },
  { sku: 'vip_mor', name: 'VIP Mor', color: 'purple', written: 20 }
];
let walletRequest = 0;

async function initializeCommerce() {
  const uid = session.localId;
  const profile = await get('users/' + pathPart(uid));
  if (session?.localId !== uid) return;
  $('handle').value = value(profile || {}, 'handle');
  $('replyNotices').checked = profile?.fields?.replyNotices?.booleanValue !== false;
  renderTopicPreferences();
  renderFeed();
}

async function openWallet() {
  const dialog = $('walletDialog');
  if (!dialog.open) dialog.showModal();
  await loadWallet();
}

async function loadWallet() {
  const revision = ++walletRequest;
  const account = session?.localId;
  setStatus('walletBalance', '—');
  $('walletUnit').hidden = true;
  $('walletVipSummary').hidden = true;
  setStatus('walletBalanceStatus', account ? 'Bakiyen yükleniyor…' : 'Bakiyeni görmek için giriş yap.');
  $('walletActivity').hidden = true;
  $('shopSignIn').hidden = !!account;
  $('syncPlay').hidden = !account;
  if (!account) {
    setStatus('paymentStatus', 'Bakiyeni ve görüşme haklarını görmek için giriş yap.');
    return;
  }
  setStatus('paymentStatus', 'Web ödemeleri henüz açılmadı.');
  try {
    const wallet = await matchCall('wallet');
    if (revision !== walletRequest || session?.localId !== account) return;
    renderWallet(wallet);
  } catch (error) {
    if (revision !== walletRequest || session?.localId !== account) return;
    setStatus('walletBalanceStatus', commerceError(error, 'Bakiye alınamadı. Cüzdanı yenileyebilirsin.'));
  }
}
function renderWallet(wallet) {
  const selected = shopVip.find(plan => plan.sku === wallet.vipPlan);
  const passes = selected && wallet.passes
    ? selected.name + ' · ' + wallet.passes.written + ' yazılı görüşme hakkı'
    : '';
  if (Number.isSafeInteger(wallet.tokens) && wallet.tokens >= 0) {
    setStatus('walletBalance', wallet.tokens.toLocaleString('tr-TR'));
    setStatus('walletBalanceStatus', '');
    $('walletUnit').hidden = false;
  } else {
    setStatus('walletBalance', '—');
    setStatus('walletBalanceStatus', 'Bakiye alınamadı. Cüzdanı yenileyebilirsin.');
    $('walletUnit').hidden = true;
  }
  setStatus('walletVipSummary', passes);
  $('walletVipSummary').hidden = !passes;
  const movements = wallet.history.map(item => node('p', (item.amount > 0 ? '+' : '') + item.amount + ' · ' + item.reason + ' · ' + new Date(item.date).toLocaleDateString('tr-TR')));
  $('walletHistory').replaceChildren(...(movements.length ? movements : [node('p', 'Henüz işlem yok.')]));
  $('walletActivity').hidden = false;
}

function commerceError(error, fallback) {
  const setupErrors = ['Sunucu yetkisi henüz yapılandırılmadı.', 'Sunucunun Google hizmet hesabı eksik.'];
  if (setupErrors.includes(error.message)) return 'Dertdaş sunucusunun ödeme bağlantısı henüz kurulmadı.';
  if (error.code === 'UNAUTHENTICATED' || error.code === 'PERMISSION_DENIED') return error.message;
  return fallback;
}

for (const quantity of storefront) {
  const card = node('article', '', 'shop-pack');
  card.append(node('strong', quantity + ' jeton'));
  $('walletProducts').append(card);
}

$('vipPlans').append(...shopVip.map(plan => {
  const card = node('article', '', 'vip-card vip-' + plan.color);
  const title = node('div', '', 'split');
  title.append(node('h3', plan.name));
  const benefits = node('ul');
  benefits.append(node('li', plan.written + ' yazılı görüşme'), node('li', 'VIP oda rehberleri'));
  card.append(title, benefits);
  return card;
}));

for (const id of ['openWallet', 'headerWallet', 'roomVipShop', 'writtenWallet']) bindClick(id, openWallet, 'paymentStatus');
$('closeWallet').onclick = () => $('walletDialog').close();
$('shopSignIn').onclick = () => goToSignIn('Bakiyeni görmek için giriş yap.');
bindClick('syncPlay', loadWallet, 'paymentStatus');

bindForm('handleForm', async () => {
  const updated = await matchCall('message', { data: { action: 'setHandle', handle: $('handle').value.trim() } });
  $('handle').value = updated.handle;
  setStatus('profileHandleStatus', 'Kullanıcı adı kaydedildi.');
}, 'profileHandleStatus');

const preferenceKey = () => 'dertdas-topics-' + session?.localId;
let unansweredOnly = false;
let unansweredRevision = 0;

function preferredTopics() {
  try { return new Set(JSON.parse(localStorage.getItem(preferenceKey()) || '[]')); }
  catch { return new Set(); }
}

function renderTopicPreferences() {
  const selected = preferredTopics();
  $('topicPreferences').replaceChildren(...[...topics].map(([topic, iconName]) => {
    const toggle = button('', () => {
      if (selected.has(topic)) selected.delete(topic);
      else selected.add(topic);
      localStorage.setItem(preferenceKey(), JSON.stringify([...selected]));
      toggle.setAttribute('aria-pressed', String(selected.has(topic)));
      renderFeed();
    });
    const mark = node('span', '', 'profile-topic-check');
    mark.setAttribute('aria-hidden', 'true');
    toggle.append(icon(iconName), node('span', topic), mark);
    toggle.setAttribute('aria-pressed', String(selected.has(topic)));
    return toggle;
  }));
}

function orderPreferredPosts(rows) {
  const selected = preferredTopics();
  return rows.sort((a, b) => Number(selected.has(value(b, 'category'))) - Number(selected.has(value(a, 'category'))));
}

$('unanswered').onclick = () => {
  if (!session) return goToSignIn('Cevap bekleyen gönderileri görmek için giriş yap.');
  unansweredOnly = !unansweredOnly;
  unansweredRevision++;
  $('unanswered').setAttribute('aria-pressed', String(unansweredOnly));
  renderFeed();
};

async function renderUnanswered(visible) {
  const owner = session?.localId;
  const revision = ++unansweredRevision;
  if (!owner) return;
  $('posts').replaceChildren(node('p', 'Son gönderiler kontrol ediliyor…', 'empty'));
  try {
    const rows = await Promise.all(visible.slice(0, 20).map(async post => {
      const comments = await list('posts/' + pathPart(docId(post)) + '/comments', 1);
      return comments.length ? null : post;
    }));
    if (revision !== unansweredRevision || !unansweredOnly || session?.localId !== owner) return;
    const waiting = rows.filter(Boolean);
    $('posts').replaceChildren(...(waiting.length ? waiting.map(renderPost) : [node('p', 'Son gönderiler arasında cevap bekleyen yok.', 'empty')]));
  } catch {
    if (revision === unansweredRevision) $('posts').replaceChildren(node('p', 'Cevap bekleyen gönderiler alınamadı.', 'empty'));
  }
}

$('replyNotices').onchange = async () => {
  try {
    await db('users/' + pathPart(session.localId) + '?updateMask.fieldPaths=replyNotices', {
      method: 'PATCH', body: { fields: { replyNotices: { booleanValue: $('replyNotices').checked } } }
    });
  } catch (error) { setStatus('status', message(error)); }
};

bindClick('openActivity', async () => {
  if (!$('activityDialog').open) $('activityDialog').showModal();
  $('activityRows').replaceChildren();
  await loadActivity();
}, 'activityStatus');
$('closeActivity').onclick = () => $('activityDialog').close();

async function loadActivity() {
  const activity = await query('activity', { parent: '/users/' + pathPart(session.localId), orderBy: newestFirst, limit: 30 });
  $('activityRows').replaceChildren(...(activity.length ? activity.map(item => {
    const row = node('div', '', 'card');
    row.append(node('p', 'Gönderine yeni bir yorum geldi.'), button('Gönderiye bak', async () => {
      const post = await get('posts/' + pathPart(value(item, 'postId')));
      await remove('users/' + pathPart(session.localId) + '/activity/' + pathPart(docId(item)));
      $('activityDialog').close();
      if (!post) return setStatus('status', 'Gönderi artık görüntülenemiyor.');
      show('feed');
      $('posts').replaceChildren(renderPost(post));
    }), button('Kaldır', async () => {
      await remove('users/' + pathPart(session.localId) + '/activity/' + pathPart(docId(item)));
      await loadActivity();
    }));
    return row;
  }) : [node('p', 'Henüz bildirim yok.')]));
}

bindClick('openPrivacy', async () => {
  const policy = await fetch('privacy.html');
  if (!policy.ok) throw Error('Gizlilik politikası açılamadı.');
  const source = new DOMParser().parseFromString(await policy.text(), 'text/html');
  const section = source.querySelector('main');
  if (!section) throw Error('Gizlilik politikası açılamadı.');
  $('privacyText').replaceChildren(...Array.from(section.querySelectorAll('p'), paragraph => node('p', paragraph.textContent)));
  $('privacyDialog').showModal();
});
$('closePrivacy').onclick = () => $('privacyDialog').close();

let linkedRoomOpened = false;
function openLinkedRoom() {
  if (linkedRoomOpened || externalDeletion) return;
  const roomId = new URLSearchParams(location.search).get('oda');
  if (!roomId) return;
  const topic = [...rooms].find(([, room]) => room.id === roomId)?.[0];
  if (topic) {
    linkedRoomOpened = true;
    openRoom(topic);
  }
}

bindClick('shareRoom', async () => {
  if (!config.publicSite || !rooms.has(roomTopic)) return;
  const url = new URL('/', config.publicSite);
  url.searchParams.set('oda', rooms.get(roomTopic).id);
  if (window.DertdasShare) window.DertdasShare.share(url.toString());
  else if (navigator.share) await navigator.share({ url: url.toString() });
  else {
    await navigator.clipboard.writeText(url.toString());
    setStatus('status', 'Oda bağlantısı kopyalandı.');
  }
}, 'status');
