'use strict';

const $ = id => document.getElementById(id);
const config = window.DERTDAS_FIREBASE;
const base = 'https://firestore.googleapis.com/v1/projects/' + config.projectId + '/databases/(default)/documents';
const authUrl = 'https://identitytoolkit.googleapis.com/v1/accounts:';
const keyParam = '?key=' + encodeURIComponent(config.apiKey);
const termsVersion = '2026-11';
const sessionKey = 'dertdas-session';
const externalDeletion = new URLSearchParams(location.search).get('hesap') === 'sil';
const topics = new Map([
  ['Genel', 'chat'], ['Aşk ve İlişkiler', 'heart'], ['Aile', 'home'],
  ['Kumar Sorunları', 'shield'], ['Dertleşme', 'spark'], ['Yalnızlık', 'heart'], ['Okul ve İş', 'work']
]);
const topicLabels = new Map([
  ['Aşk ve İlişkiler', 'İlişkiler'], ['Kumar Sorunları', 'Kumar Desteği']
]);
const screens = ['feed', 'communities', 'room', 'journal', 'profile', 'moderation', 'deletion'];
const labels = { post: 'Gönderi', comment: 'Yorum', message: 'Mesaj', user: 'Kullanıcı' };

let session = null;
let refreshFlight = null;
let currentTab = 'feed';
let selectedTopic = '';
let posts = [];
let feedRevision = 0;
let feedbackTarget = null;
let postConfirmationTimer;
let blocked = new Map();
let names = new Map();

function node(tag, text = '', className = '') {
  const item = document.createElement(tag);
  item.textContent = text;
  item.className = className;
  return item;
}

function icon(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  const use = document.createElementNS(svg.namespaceURI, 'use');
  use.setAttribute('href', '#i-' + name);
  svg.setAttribute('class', 'icon');
  svg.setAttribute('aria-hidden', 'true');
  svg.append(use);
  return svg;
}

function postTime(doc) {
  const minutes = Math.floor((Date.now() - new Date(doc.createTime)) / 60000);
  if (minutes < 1) return 'Şimdi';
  if (minutes < 60) return minutes + ' dk';
  if (minutes < 1440) return Math.floor(minutes / 60) + ' sa';
  return asDate(doc);
}

const str = stringValue => ({ stringValue });
const memberArray = users => ({ arrayValue: { values: users.map(str) } });
const value = (doc, key) => doc.fields?.[key]?.stringValue || '';
const docId = doc => doc.name.split('/').pop();
const pathPart = encodeURIComponent;
const asDate = d => new Date(d.createTime).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' });
const setStatus = (id, text) => { $(id).textContent = text; };

function message(error) {
  const code = (error.code || error.message || '').split(' : ')[0];
  return ({
    INVALID_EMAIL: 'E-posta adresini kontrol et.',
    EMAIL_EXISTS: 'Bu adres kayıtlı. Giriş yapmayı dene.',
    INVALID_LOGIN_CREDENTIALS: 'E-posta veya şifre yanlış.',
    USER_DISABLED: 'Bu hesabın erişimi durduruldu.',
    PERMISSION_DENIED: 'Bu işlem için izin yok. Hesap durumunu veya bağlantıyı kontrol et.',
    RESOURCE_EXHAUSTED: 'Çok fazla işlem yapıldı. Biraz sonra tekrar dene.',
    TOO_MANY_ATTEMPTS_TRY_LATER: 'Çok fazla deneme yapıldı. Biraz sonra tekrar dene.'
  })[code] || (error.code ? 'İşlem tamamlanamadı. Tekrar dene.' : error.message);
}

async function request(url, { body, method = body ? 'POST' : 'GET', token } = {}) {
  const headers = {};
  const options = { method, headers, signal: AbortSignal.timeout ? AbortSignal.timeout(15000) : undefined };
  if (token) headers.Authorization = 'Bearer ' + token;
  if (body) {
    const form = body instanceof URLSearchParams;
    headers['Content-Type'] = form ? 'application/x-www-form-urlencoded' : 'application/json';
    options.body = form ? body : JSON.stringify(body);
  }
  let response;
  try {
    response = await fetch(url, options);
  } catch {
    throw Error('Bağlantı kurulamadı. İnternet bağlantını kontrol et.');
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = Error(data.error?.message || 'İşlem tamamlanamadı.');
    error.code = data.error?.status || data.error?.message || String(response.status);
    error.httpStatus = response.status;
    throw error;
  }
  return data;
}

function saveSession() {
  sessionStorage.setItem(sessionKey, JSON.stringify(session));
}

async function token(force = false) {
  if (!session) throw Error('Önce giriş yap.');
  if (!force && Date.now() < session.exp - 60000) return session.idToken;
  if (refreshFlight) return refreshFlight;
  const previousSession = session;
  const pending = request('https://securetoken.googleapis.com/v1/token' + keyParam, {
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: session.refreshToken })
  }).then(data => {
    if (session !== previousSession) throw Error('Oturum değişti.');
    session = { ...session, idToken: data.id_token, refreshToken: data.refresh_token,
      exp: Date.now() + Number(data.expires_in) * 1000 };
    saveSession();
    return session.idToken;
  });
  refreshFlight = pending;
  try {
    return await pending;
  } finally {
    if (refreshFlight === pending) refreshFlight = null;
  }
}

async function db(path, options = {}) {
  return request(base + '/' + path, { ...options, token: await token() });
}

async function get(path) {
  try {
    return await db(path);
  } catch (error) {
    if (error.httpStatus === 404) return null;
    throw error;
  }
}

function put(path, fields) {
  return db(path, { method: 'PATCH', body: { fields } });
}

function create(path, fields) {
  return db(path, { body: { fields } });
}

function remove(path) {
  return db(path, { method: 'DELETE' });
}

async function list(path, limit = 100) {
  const documents = [];
  let pageToken = '';
  do {
    const params = new URLSearchParams({ pageSize: String(Math.min(limit - documents.length, 100)) });
    if (pageToken) params.set('pageToken', pageToken);
    const page = await db(path + '?' + params);
    documents.push(...(page.documents || []));
    pageToken = page.nextPageToken;
  } while (pageToken && documents.length < limit);
  return documents;
}

function query(collection, { parent = '', where, orderBy, limit }) {
  return token().then(idToken => request(base + parent + ':runQuery', {
    token: idToken, body: { structuredQuery: { from: [{ collectionId: collection }], where, orderBy, limit } }
  })).then(rows => rows.flatMap(row => row.document ? [row.document] : []));
}

const newestFirst = [{ field: { fieldPath: 'createdAt' }, direction: 'DESCENDING' }];

function createdFields(fields) {
  return { ...fields, createdAt: { timestampValue: new Date().toISOString() } };
}

async function history(path, collection, limit) {
  const [recent, older] = await Promise.all([
    query(collection, { parent: path ? '/' + path : '', orderBy: newestFirst, limit }),
    list(path ? path + '/' + collection : collection, limit)
  ]);
  const unique = new Map([...recent, ...older].map(doc => [doc.name, doc]));
  return [...unique.values()].sort((a, b) => b.createTime.localeCompare(a.createTime)).slice(0, limit);
}

function button(label, handler, className = 'quiet') {
  const item = node('button', label, className);
  item.type = 'button';
  item.addEventListener('click', () => perform(item, handler));
  return item;
}

function confirmDertdas({ title, info = '', details = [], action = 'Onayla', kind = 'general' }) {
  const sheet = $('decisionSheet');
  if (sheet.open) return Promise.resolve(false);
  const room = $('room');
  if (currentTab === 'room' && room.dataset.room) sheet.dataset.room = room.dataset.room;
  else delete sheet.dataset.room;
  sheet.dataset.kind = kind;
  setStatus('decisionMark', ({ written: '✎', purchase: '₺' })[kind] || '✓');
  setStatus('decisionTitle', title);
  setStatus('decisionInfo', info);
  $('decisionInfo').hidden = !info;
  const list = $('decisionDetails');
  list.hidden = !details.length;
  list.replaceChildren(...details.map(detail => node('li', detail)));
  setStatus('decisionConfirm', action);
  sheet.returnValue = 'cancel';
  return new Promise(resolve => {
    sheet.addEventListener('close', () => resolve(sheet.returnValue === 'confirm'), { once: true });
    sheet.showModal();
  });
}

async function perform(control, operation, statusId = 'status') {
  if (control?.disabled) return;
  if (control) control.disabled = true;
  setStatus(statusId, '');
  try {
    await operation();
  } catch (error) {
    setStatus(statusId, message(error));
  } finally {
    if (control) control.disabled = false;
  }
}

function logout(text = 'Çıkış yapıldı.') {
  if (typeof stopWritten === 'function') stopWritten();
  $('verifyEmail').hidden = true;
  for (const id of ['decisionSheet', 'walletDialog', 'activityDialog', 'privacyDialog']) if ($(id)?.open) $(id).close('cancel');
  session = null;
  clearTimeout(postConfirmationTimer);
  setStatus('postConfirmation', '');
  setStatus('profileNameStatus', '');
  setStatus('profileHandleStatus', '');
  setSearchOpen(false);
  roomTopic = '';
  refreshFlight = null;
  sessionStorage.removeItem(sessionKey);
  resetJournal();
  $('journalEntries').replaceChildren();
  feedbackTarget = null;
  posts = [];
  selectedTopic = '';
  feedRevision++;
  blocked.clear();
  names.clear();
  for (const id of ['posts', 'reportList', 'blockedList']) $(id).replaceChildren();
  for (const id of ['postForm', 'feedbackForm', 'profileForm', 'handleForm', 'authForm']) $(id).reset();
  $('search').value = '';
  document.querySelectorAll('dialog[open]').forEach(dialog => dialog.close());
  $('app').hidden = true;
  $('auth').hidden = false;
  setStatus('authStatus', text);
}

async function acceptTerms() {
  await put('consents/' + pathPart(session.localId), { version: str(termsVersion) });
}

async function signIn(mode) {
  const email = $('email').value.trim();
  const password = $('password').value;
  if (!email || !password) throw Error('E-posta adresini ve şifreni gir.');
  if (mode !== 'login' && !$('acceptTerms').checked) throw Error('Devam etmek için topluluk kurallarını kabul et.');
  if (mode === 'register' && password.length < 6) throw Error('Şifren en az 6 karakter olmalı.');
  const payload = { returnSecureToken: true, email, password };
  $('authForm').querySelectorAll('button').forEach(item => { item.disabled = true; });
  try {
    session = await request(authUrl + (mode === 'login' ? 'signInWithPassword' : 'signUp') + keyParam, { body: payload });
    session.exp = Date.now() + Number(session.expiresIn) * 1000;
    saveSession();
    $('password').value = '';
    if (mode === 'register') {
      await acceptTerms();
      try {
        await sendVerificationEmail();
      } catch {
        setStatus('authStatus', 'Hesap açıldı. Doğrulama bağlantısını tekrar gönderebilirsin.');
      }
    }
    await openSession();
  } catch (error) {
    if (session) logout('');
    throw error;
  } finally {
    $('authForm').querySelectorAll('button').forEach(item => { item.disabled = false; });
  }
}

function sessionClaims() {
  try {
    const encoded = session.idToken.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(encoded));
  } catch { return {}; }
}
function isModerator() { return sessionClaims().admin === true; }

async function sendVerificationEmail() {
  await request(authUrl + 'sendOobCode' + keyParam, {
    body: { requestType: 'VERIFY_EMAIL', idToken: await token() }
  });
  setStatus('authStatus', 'Doğrulama bağlantısı e-posta adresine gönderildi.');
}

async function openSession() {
  const uid = pathPart(session.localId);
  const deletion = await get('deletionRequests/' + uid);
  if (deletion) {
    logout('Hesap silme talebin alındı.');
    return;
  }
  if (!externalDeletion) {
    const claims = sessionClaims();
    if (claims.firebase?.sign_in_provider !== 'password') {
      logout('Devam etmek için e-posta ve şifre ile giriş yap.');
      return;
    }
    if (!claims.email_verified) {
      $('verifyEmail').hidden = false;
      return;
    }
    $('verifyEmail').hidden = true;
  }
  if (!externalDeletion) {
    const suspension = await get('suspensions/' + uid);
    if (suspension) {
      logout('Bu hesabın erişimi durduruldu. Hesap silmek için web sayfasındaki silme formunu kullanabilirsin.');
      return;
    }
    const consent = await get('consents/' + uid);
    if (value(consent || {}, 'version') !== termsVersion) {
      setStatus('termsStatus', '');
      if (!$('termsGate').open) $('termsGate').showModal();
      return;
    }
    await loadBlocks();
  }
  $('auth').hidden = true;
  $('app').hidden = false;
  $('nav').hidden = externalDeletion;
  $('toggleSearch').hidden = externalDeletion;
  $('refresh').hidden = externalDeletion;
  $('cancelDelete').textContent = externalDeletion ? 'Çıkış yap' : 'Geri dön';
  $('moderate').hidden = !isModerator();
  renderProfile();
  if (!externalDeletion) void initializeCommerce().catch(() => {});
  if (externalDeletion) {
    show('deletion');
    return;
  }
  show('feed');
  await perform(null, loadFeed);
  openLinkedRoom();
}

function show(tab) {
  if (!session || $('app').hidden) return;
  if (currentTab === 'room' && tab !== 'room') {
    $('roomTool').replaceChildren();
    if (typeof cancelWrittenSearch === 'function') cancelWrittenSearch();
  }
  currentTab = tab;
  $('app').classList.toggle('in-room', tab === 'room');
  $('toggleSearch').hidden = externalDeletion || tab !== 'feed';
  $('headerWallet').hidden = externalDeletion;
  setStatus('status', '');
  screens.forEach(screen => { $(screen).hidden = screen !== tab; });
  document.querySelectorAll('[data-tab]').forEach(item => {
    if (item.dataset.tab === tab) item.setAttribute('aria-current', 'page');
    else item.removeAttribute('aria-current');
  });
  $('main').scrollTop = 0;
  if (tab === 'journal') void perform(null, renderJournal, 'journalStatus');
  if (tab === 'moderation') void perform(null, loadReports);
}

function choose(topic) {
  if (rooms.has(topic)) { openRoom(topic); return; }
  selectedTopic = topic;
  show('feed');
  renderFeed();
}

function matches(post) {
  const author = value(post, 'author');
  const topic = value(post, 'category') || 'Genel';
  const search = $('search').value.trim().toLocaleLowerCase('tr-TR');
  return !blocked.has(value(post, 'uid')) && (!selectedTopic || topic === selectedTopic)
    && (!search || [author, topic, value(post, 'text')].some(text => text.toLocaleLowerCase('tr-TR').includes(search)));
}

async function loadFeed() {
  const revision = ++feedRevision;
  const rows = await history('', 'posts', 100);
  if (revision !== feedRevision) return;
  posts = rows;
  renderFeed();
}

function renderFeed() {
  $('chips').querySelectorAll('button').forEach(item => {
    item.setAttribute('aria-pressed', String(item.dataset.topic === selectedTopic));
  });
  const visible = orderPreferredPosts(posts.filter(matches));
  const empty = $('search').value.trim() ? 'Aramanla eşleşen paylaşım bulunamadı.' : 'Burada henüz paylaşım yok.';
  $('posts').replaceChildren(...(visible.length ? visible.map(renderPost) : [node('p', empty, 'empty')]));
  renderRoomPosts();
  if (unansweredOnly) void renderUnanswered(visible);
}

function renderPost(doc) {
  const uid = value(doc, 'uid');
  const name = value(doc, 'author') || 'Anonim kullanıcı';
  const path = 'posts/' + pathPart(docId(doc));
  if (uid) names.set(uid, name);
  const article = node('article', '', 'card post-card');
  const byline = node('div', '', 'who');
  const details = node('div');
  const category = value(doc, 'category') || 'Genel';
  const metadata = node('small', '', 'post-meta');
  metadata.append(node('span', category, 'post-topic'), document.createTextNode(' · ' + postTime(doc)));
  details.append(node('strong', name), metadata);
  byline.append(node('span', name[0].toLocaleUpperCase('tr-TR'), 'avatar'), details);
  const panel = node('div');
  panel.hidden = true;
  const actions = node('div', '', 'actions');
  const like = button('♡ Beğen', async () => {
    const likePath = path + '/likes/' + pathPart(session.localId);
    if (await get(likePath)) {
      await remove(likePath);
      like.textContent = '♡ Beğen';
      like.setAttribute('aria-pressed', 'false');
    } else {
      await put(likePath, { uid: str(session.localId) });
      like.textContent = '♥ Beğenildi';
      like.setAttribute('aria-pressed', 'true');
    }
  });
  like.setAttribute('aria-pressed', 'false');
  const comments = button('Yorumlar', async () => {
    panel.hidden = !panel.hidden;
    comments.setAttribute('aria-expanded', String(!panel.hidden));
    if (!panel.hidden) await loadComments(panel, path);
  });
  comments.setAttribute('aria-expanded', 'false');
  actions.append(like, comments);
  if (uid) {
    const menu = node('details', '', 'post-menu');
    const toggle = node('summary', '⋯');
    toggle.setAttribute('aria-label', 'Gönderi seçenekleri');
    const options = node('div', '', 'post-menu-options');
    if (uid === session.localId) {
      options.append(button('Gönderiyi sil', () => {
        menu.open = false;
        openFeedback('remove', path, uid);
      }, 'quiet danger'));
    } else {
      for (const [caption, kind, target] of [
        ['Kullanıcıyı engelle', 'block', ''], ['Gönderiyi bildir', 'post', path], ['Kullanıcıyı bildir', 'user', '']
      ]) {
        options.append(button(caption, () => {
          menu.open = false;
          openFeedback(kind, target, uid);
        }));
      }
    }
    menu.append(toggle, options);
    byline.append(menu);
  }
  article.append(byline, node('p', value(doc, 'text'), 'post-text'));
  article.append(actions, panel);
  return article;
}

async function loadComments(panel, path) {
  const rows = await history(path, 'comments', 50);
  if (!panel.isConnected) return;
  const items = rows.reverse().filter(doc => !blocked.has(value(doc, 'uid'))).map(doc => {
    const uid = value(doc, 'uid');
    const target = path + '/comments/' + pathPart(docId(doc));
    const comment = node('div', '', 'comment');
    comment.append(node('strong', value(doc, 'author') || 'Anonim kullanıcı'), node('p', value(doc, 'text')));
    if (uid && uid !== session.localId) {
      names.set(uid, value(doc, 'author') || 'Anonim kullanıcı');
      comment.append(button('Bildir', () => openFeedback('comment', target, uid)),
        button('Engelle', () => openFeedback('block', '', uid)));
    } else if (uid) {
      comment.append(button('Sil', () => openFeedback('remove', target, uid), 'quiet danger'));
    }
    return comment;
  });
  const form = node('form', '', 'row');
  const input = node('input');
  input.maxLength = 500;
  input.required = true;
  input.placeholder = 'Yorum yaz';
  input.setAttribute('aria-label', 'Yorum');
  const send = node('button', 'Gönder', 'primary');
  form.append(input, send);
  form.onsubmit = event => {
    event.preventDefault();
    void perform(send, async () => {
      const text = input.value.trim();
      if (!text) throw Error('Önce bir yorum yaz.');
      await create(path + '/comments', createdFields({ uid: str(session.localId), author: str(displayName()), text: str(text) }));
      input.value = '';
      await loadComments(panel, path);
    });
  };
  panel.replaceChildren(...items, form);
}

function displayName() {
  return session.displayName || 'Anonim kullanıcı';
}

function renderProfile() {
  $('nick').value = session.displayName || '';
  $('profileName').textContent = displayName();
  $('profileAvatar').textContent = displayName()[0].toLocaleUpperCase('tr-TR');
  const rows = [...blocked].map(([uid, name]) => {
    const row = node('div', '', 'split');
    row.append(node('span', name), button('Engeli kaldır', async () => {
      await remove('users/' + pathPart(session.localId) + '/blocks/' + pathPart(uid));
      blocked.delete(uid);
      renderProfile();
      renderFeed();
    }));
    return row;
  });
  $('blockedList').replaceChildren(...(rows.length ? rows : [node('p', 'Engellenen kullanıcı yok.', 'muted')]));
}

async function loadBlocks() {
  const uid = pathPart(session.localId);
  const path = 'users/' + uid + '/blocks';
  const rows = await list(path, 1000);
  blocked = new Map(rows.map(doc => [docId(doc), value(doc, 'name') || 'Kullanıcı']));
  const legacyKey = 'blocks-' + session.localId;
  let legacy = [];
  try {
    const stored = JSON.parse(localStorage.getItem(legacyKey) || '[]');
    if (Array.isArray(stored)) legacy = stored;
  } catch { /* The previous version stored only a local list. */ }
  for (const olderUid of legacy.filter(id => typeof id === 'string' && id !== session.localId && !blocked.has(id))) {
    await put(path + '/' + pathPart(olderUid), { name: str('Kullanıcı'), targetUid: str(olderUid) });
    blocked.set(olderUid, 'Kullanıcı');
  }
  localStorage.removeItem(legacyKey);
}

function openFeedback(kind, path, uid) {
  feedbackTarget = { kind, path, uid };
  const report = !!labels[kind];
  $('feedbackTitle').textContent = report ? labels[kind] + ' bildir' : (kind === 'block' ? 'Kullanıcıyı engelle' : 'İçeriği sil');
  $('feedbackText').textContent = report ? 'Bildirimin moderasyon ekibine gönderilir.'
    : (kind === 'block' ? 'Bu kişiyle yazılı eşleşmen durur. Paylaşımları ve yorumları akışında gizlenir.' : 'Bu içerik silinecek.');
  $('reason').hidden = $('reasonLabel').hidden = !report;
  $('reason').required = report;
  $('reason').value = '';
  setStatus('feedbackStatus', '');
  $('feedback').showModal();
}

async function submitFeedback() {
  const { kind, path, uid } = feedbackTarget;
  if (kind === 'block') {
    const name = names.get(uid) || 'Kullanıcı';
    await put('users/' + pathPart(session.localId) + '/blocks/' + pathPart(uid), { name: str(name), targetUid: str(uid) });
    blocked.set(uid, name);
    if (typeof writtenConversation !== 'undefined' && writtenConversation?.other === uid) endWrittenConversation();
    renderFeed();
    renderProfile();
    setStatus('status', 'Kullanıcı engellendi.');
  } else if (kind === 'remove') {
    await remove(path);
    if (path.includes('/comments/')) renderFeed();
    else {
      posts = posts.filter(doc => docId(doc) !== decodeURIComponent(path.split('/').pop()));
      renderFeed();
    }
    setStatus('status', 'İçerik silindi.');
  } else {
    const reason = $('reason').value.trim();
    if (!reason) throw Error('Bildirme nedenini yaz.');
    await create('reports', createdFields({ uid: str(session.localId), targetUid: str(uid),
      kind: str(kind), target: str(decodeURIComponent(path)), reason: str(reason), status: str('pending') }));
    setStatus('status', 'Bildirimin alındı.');
  }
  $('feedback').close();
}

async function loadReports() {
  const moderator = session.localId;
  const [reports, suspensions] = await Promise.all([history('', 'reports', 100), list('suspensions', 100)]);
  if (session?.localId !== moderator || !isModerator()) return;
  const root = $('reportList');
  const items = reports.filter(doc => !value(doc, 'status') || value(doc, 'status') === 'pending').map(doc => {
    const kind = value(doc, 'kind') || 'post';
    const target = value(doc, 'target') || ('posts/' + value(doc, 'postId'));
    const uid = value(doc, 'targetUid');
    const card = node('article', '', 'card');
    const preview = node('p', '', 'muted');
    const actions = node('div', '', 'actions');
    card.append(node('h2', (labels[kind] || 'İçerik') + ' bildirimi'), node('small', asDate(doc)),
      node('p', value(doc, 'reason')), preview, actions);
    if (kind !== 'user' && target) {
      actions.append(button('İçeriği gör', async () => {
        const original = await get(target.split('/').map(pathPart).join('/'));
        preview.textContent = original ? value(original, 'text') : 'İçerik kaldırılmış.';
      }), button('İçeriği kaldır', async () => {
        if (!await confirmDertdas({ title: 'İçerik kaldırılsın mı?', action: 'Kaldır' })) return;
        await remove(target.split('/').map(pathPart).join('/'));
        preview.textContent = 'İçerik kaldırıldı.';
        await resolveReport(doc);
      }, 'quiet danger'));
    }
    if (uid && uid !== moderator) {
      actions.append(button('Hesabı askıya al', async () => {
        if (!await confirmDertdas({ title: 'Hesap askıya alınsın mı?', action: 'Askıya al' })) return;
        await put('suspensions/' + pathPart(uid), { reportId: str(docId(doc)) });
        await resolveReport(doc);
      }, 'quiet danger'));
    }
    actions.append(button('Bildirimi kapat', () => resolveReport(doc)));
    return card;
  });
  const heading = node('h2', 'Askıya alınan hesaplar');
  const accounts = suspensions.map(doc => {
    const uid = docId(doc);
    const row = node('div', '', 'card');
    row.append(node('p', uid), button('Erişimi aç', async () => {
      await remove('suspensions/' + pathPart(uid));
      await loadReports();
    }));
    return row;
  });
  root.replaceChildren(...(items.length ? items : [node('p', 'İncelenecek bildirim yok.', 'empty')]), heading,
    ...(accounts.length ? accounts : [node('p', 'Askıya alınan hesap yok.', 'empty')]));
}

async function resolveReport(doc) {
  await db('reports/' + pathPart(docId(doc)) + '?updateMask.fieldPaths=status', {
    method: 'PATCH', body: { fields: { status: str('resolved') } }
  });
  await loadReports();
}

function bindForm(id, operation, statusId) {
  $(id).addEventListener('submit', event => {
    event.preventDefault();
    const submit = event.submitter || $(id).querySelector('button:not([type="button"])');
    void perform(submit, () => operation(event), statusId);
  });
}

function bindClick(id, operation, statusId) {
  $(id).addEventListener('click', event => { void perform(event.currentTarget, operation, statusId); });
}

bindForm('authForm', event => signIn(event.submitter?.id === 'register' ? 'register' : 'login'), 'authStatus');
bindClick('resetPassword', async () => {
  const emailInput = $('email');
  if (!emailInput.reportValidity()) return;
  try {
    await request(authUrl + 'sendOobCode' + keyParam, {
      body: { requestType: 'PASSWORD_RESET', email: emailInput.value.trim() }
    });
  } catch (error) {
    if (error.code !== 'EMAIL_NOT_FOUND' && error.code !== 'USER_NOT_FOUND') throw error;
  }
  setStatus('authStatus', 'Bu e-posta kayıtlıysa şifre yenileme bağlantısı gönderildi.');
}, 'authStatus');
bindClick('resendEmail', sendVerificationEmail, 'authStatus');
bindClick('confirmEmail', async () => {
  await token(true);
  if (!sessionClaims().email_verified) throw Error('E-posta henüz doğrulanmamış.');
  await openSession();
}, 'authStatus');
$('logout').onclick = () => logout();
$('termsExit').onclick = () => logout();
$('termsGate').addEventListener('cancel', event => { event.preventDefault(); logout(); });
bindClick('termsAccept', async () => {
  await acceptTerms();
  await openSession();
  $('termsGate').close();
}, 'termsStatus');
document.querySelectorAll('.rules-button').forEach(item => { item.onclick = () => $('rules').showModal(); });
document.querySelectorAll('[data-tab]').forEach(item => { item.onclick = () => show(item.dataset.tab); });
document.addEventListener('click', event => {
  for (const menu of document.querySelectorAll('.post-menu[open]')) {
    if (!menu.contains(event.target)) menu.open = false;
  }
});
document.querySelectorAll('[data-close]').forEach(item => { item.onclick = () => $(item.dataset.close).close(); });
for (const topic of ['', ...topics.keys()]) {
  const choice = button('', () => choose(topic), '');
  choice.dataset.topic = topic;
  const badge = node('span', '', 'topic-icon');
  badge.append(icon(topics.get(topic) || 'community'));
  badge.setAttribute('aria-hidden', 'true');
  choice.setAttribute('aria-label', topic || 'Tümü');
  choice.append(badge, node('span', topicLabels.get(topic) || topic || 'Tümü'));
  $('chips').append(choice);
  if (!topic) continue;
  $('category').append(node('option', topic));
  const card = button('', () => choose(topic), '');
  const mark = node('b');
  mark.append(icon(topics.get(topic)));
  card.append(mark, node('span', topic));
  $('communityList').append(card);
}

function setSearchOpen(open) {
  $('searchPanel').hidden = !open;
  $('toggleSearch').setAttribute('aria-expanded', String(open));
  if (open) {
    $('main').scrollTop = 0;
    $('search').focus();
  } else {
    $('search').blur();
    $('search').value = '';
  }
}

$('toggleSearch').onclick = () => {
  setSearchOpen($('searchPanel').hidden);
  renderFeed();
};
$('search').addEventListener('input', renderFeed);
bindClick('refresh', async () => {
  await loadBlocks();
  if (currentTab === 'moderation') await loadReports();
  else if (currentTab === 'profile') renderProfile();
  else if (currentTab === 'feed' || currentTab === 'room') await loadFeed();
});
function openComposer() {
  if (!session || $('app').hidden) return;
  clearTimeout(postConfirmationTimer);
  setStatus('postConfirmation', '');
  $('postForm').reset();
  $('category').value = (currentTab === 'room' ? roomTopic : selectedTopic) || 'Genel';
  setStatus('composeStatus', '');
  $('composer').showModal();
}
$('compose').onclick = $('heroCompose').onclick = openComposer;
$('composer').addEventListener('cancel', event => {
  if ($('composeCancel').disabled) event.preventDefault();
});
bindForm('postForm', async () => {
  const text = $('postText').value.trim();
  if (!text) throw Error('Önce bir şey yaz.');
  const category = $('category').value;
  const account = session.localId;
  const cancelButton = $('composeCancel');
  cancelButton.disabled = true;
  try {
    const post = await create('posts', createdFields({
      uid: str(account), author: str(displayName()), text: str(text), category: str(category)
    }));
    if (session?.localId !== account || !$('composer').open) return;
    feedRevision++;
    posts = [post, ...posts.filter(doc => doc.name !== post.name)].slice(0, 100);
    $('composer').close();
    setStatus('postConfirmation', 'Paylaşıldı · ' + category);
    postConfirmationTimer = setTimeout(() => setStatus('postConfirmation', ''), 4000);
    renderFeed();
  } finally {
    cancelButton.disabled = false;
  }
}, 'composeStatus');
bindForm('feedbackForm', submitFeedback, 'feedbackStatus');
bindForm('profileForm', async () => {
  const name = $('nick').value.trim();
  if (name.length < 2) throw Error('Görünen ad en az 2 karakter olmalı.');
  const idToken = await token();
  const prior = session;
  const updated = await request(authUrl + 'update' + keyParam, { body: { idToken, displayName: name, returnSecureToken: true } });
  if (session !== prior) return;
  session = { ...session, ...updated, displayName: name,
    exp: Date.now() + Number(updated.expiresIn || 3600) * 1000 };
  saveSession();
  renderProfile();
  setStatus('profileNameStatus', 'Görünen ad kaydedildi.');
}, 'profileNameStatus');
$('moderate').onclick = () => { if (isModerator()) show('moderation'); };
$('requestDelete').onclick = () => show('deletion');
$('cancelDelete').onclick = () => externalDeletion ? logout() : show('profile');
bindClick('confirmDelete', async () => {
  if (!await confirmDertdas({ title: 'Hesap silme talebi', info: 'Talebini gönderdiğinde bu oturum kapanır.', action: 'Talep gönder' })) return;
  await put('deletionRequests/' + pathPart(session.localId), createdFields({ status: str('pending') }));
  logout('Hesap silme talebin alındı.');
});
function goToSignIn(text = '') {
  logout(text);
  window.scrollTo(0, 0);
}

if (externalDeletion) {
  $('authTitle').textContent = 'Hesap silme talebi';
  $('authIntro').textContent = 'Talep göndermek için Dertdaş hesabına giriş yap. Önceki anonim hesabın için Dertdaş destek ekibiyle iletişime geç.';
  for (const id of ['register', 'termsChoice']) $(id).hidden = true;
}

window.handleAndroidBack = function () {
  const openDialogs = [...document.querySelectorAll('dialog[open]')];
  if (openDialogs.length) {
    const top = document.activeElement.closest('dialog[open]') || openDialogs.at(-1);
    if (top.id === 'termsGate') logout();
    else if (top.id !== 'composer' || !$('composeCancel').disabled) top.close('cancel');
    return true;
  }
  const menu = document.querySelector('section:not([hidden]) .post-menu[open]');
  if (menu) { menu.open = false; return true; }
  if (currentTab === 'feed' && !$('searchPanel').hidden && !$('app').hidden) {
    setSearchOpen(false);
    renderFeed();
    return true;
  }
  if (externalDeletion && !$('app').hidden) { logout(''); return true; }
  if (!$('app').hidden && currentTab !== 'feed') { show('feed'); return true; }
  return false;
};

window.addEventListener('DOMContentLoaded', async function restore() {
  try {
    session = JSON.parse(sessionStorage.getItem(sessionKey));
    if (session) await openSession();
  } catch (error) {
    logout(message(error));
  }
});
