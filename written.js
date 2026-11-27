'use strict';

let writtenSearch = null;
let writtenConversation = null;
const writtenCall = (action, data) => matchCall('written', { data: { action, ...data } });

function cancelWrittenSearch(notifyServer = true) {
  const search = writtenSearch;
  writtenSearch = null;
  clearInterval(search?.timer);
  $('writtenStart').hidden = false;
  $('writtenCancel').hidden = true;
  $('writtenJoin').hidden = true;
  $('writtenWallet').hidden = true;
  setStatus('writtenSearchStatus', '');
  if (search && notifyServer) void writtenCall('leave', search.fields).catch(() => {});
}

function stopWritten() {
  cancelWrittenSearch(false);
  clearInterval(writtenConversation?.timer);
  clearInterval(writtenConversation?.poll);
  writtenConversation = null;
  if ($('writtenDialog').open) $('writtenDialog').close();
}

function endWrittenConversation() {
  const conversation = writtenConversation;
  stopWritten();
  if (conversation) void writtenCall('end', { callId: conversation.id }).catch(() => {});
}

async function findWritten(search, action) {
  if (search.busy || writtenSearch !== search) return;
  search.busy = true;
  try {
    const result = await writtenCall(action, search.fields);
    if (writtenSearch !== search) return;
    if (result.callId) {
      search.callId = result.callId;
      clearInterval(search.timer);
      $('writtenCancel').hidden = true;
      $('writtenJoin').hidden = false;
      setStatus('writtenSearchStatus', 'Eşleşme bulundu.');
    } else if (!result.waiting) {
      cancelWrittenSearch(false);
      $('writtenWallet').hidden = !result.funds;
      setStatus('writtenSearchStatus', result.funds ? 'Bu görüşme için 25 jeton gerekiyor.' : 'Şu an eşleşecek kimse bulunamadı.');
    }
  } catch {
    if (writtenSearch !== search) return;
    cancelWrittenSearch(false);
    setStatus('writtenSearchStatus', 'Yazılı eşleşme servisine şu anda ulaşılamıyor.');
  } finally {
    search.busy = false;
  }
}

const writtenTime = new Intl.DateTimeFormat('tr-TR', { hour: '2-digit', minute: '2-digit' });

function renderWrittenClock(conversation) {
  const clock = $('writtenClock');
  const seconds = Math.max(0, Math.ceil((conversation.deadline - performance.now()) / 1000));
  clock.hidden = !conversation.isActive;
  clock.dataset.urgent = String(seconds <= 60);
  if (conversation.isActive) clock.textContent = Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0');
}

function closeWrittenGifts() {
  $('writtenGifts').hidden = true;
  $('writtenGift').setAttribute('aria-expanded', 'false');
}

function renderWrittenTools(conversation) {
  const tools = conversation.tools;
  const offer = tools?.extension.offer;
  const ownOffer = offer?.from === session?.localId;
  $('writtenActions').hidden = !conversation.isActive || !tools;
  $('writtenExtend').disabled = Boolean(offer) || !tools?.extension.remaining;
  $('writtenFavorite').setAttribute('aria-pressed', String(conversation.favorite));
  $('writtenFavorite').querySelector('span').textContent = conversation.favorite ? '★' : '☆';
  $('writtenOffer').hidden = !offer;
  $('writtenOfferActions').hidden = !offer || ownOffer;
  setStatus('writtenOfferText', offer
    ? (ownOffer ? 'Uzatma teklifin yanıt bekliyor.' : 'Sohbet arkadaşın ' + tools.extension.minutes + ' dakika daha konuşmak istiyor.')
    : '');
}

function writtenMessage(item, conversation) {
  if (item.kind === 'extension') return node('p', item.text, 'chat-system');
  const gift = conversation.tools?.gifts.find(value => value.id === item.gift);
  const bubble = node('article', '', 'bubble' + (item.uid === session.localId ? ' mine' : '') + (gift ? ' chat-gift-message' : ''));
  if (gift) bubble.append(node('span', gift.symbol, 'chat-symbol'));
  bubble.append(node('p', item.text));
  if (Number.isFinite(item.ts)) {
    const time = node('time', writtenTime.format(item.ts));
    time.dateTime = new Date(item.ts).toISOString();
    bubble.append(time);
  }
  return bubble;
}

function renderWritten(conversation, state) {
  if (state.now < (conversation.serverNow || 0)) return;
  conversation.serverNow = state.now;
  conversation.other = state.other;
  if (state.closed) {
    stopWritten();
    setStatus('writtenSearchStatus', 'Yazılı görüşme sona erdi.');
    return;
  }
  const wasActive = conversation.isActive;
  conversation.deadline = performance.now() + (state.endsAt || state.startBy) - state.now;
  conversation.isActive = Boolean(state.endsAt);
  conversation.tools = state.chatTools || conversation.tools;
  if (state.identity) conversation.favorite = state.identity.favorite;
  if (typeof state.favorite === 'boolean') conversation.favorite = state.favorite;
  $('writtenForm').hidden = !conversation.isActive;
  if (!conversation.isActive) setStatus('writtenStatus', 'Karşı tarafın katılması bekleniyor…');
  else if (!wasActive || $('writtenStatus').textContent === 'Yazılı görüşmeye yeniden bağlanıyor…') setStatus('writtenStatus', '');
  renderWrittenClock(conversation);
  renderWrittenTools(conversation);

  const rows = state.messages;
  if (!rows) return;
  const fingerprint = rows.map(item => item.id).join(' ');
  if (fingerprint === conversation.fingerprint) return;
  conversation.fingerprint = fingerprint;
  const history = $('writtenItems');
  const nearBottom = history.scrollHeight - history.clientHeight - history.scrollTop < 65;
  const savedTop = history.scrollTop;
  history.replaceChildren(...(rows.length ? rows.map(item => writtenMessage(item, conversation))
    : [node('p', 'İlk mesajı sen yaz.', 'chat-empty')]));
  history.scrollTop = nearBottom || rows.at(-1)?.uid === session.localId ? history.scrollHeight : savedTop;
}

async function refreshWritten(conversation) {
  if (conversation.reading || writtenConversation !== conversation) return;
  conversation.reading = true;
  try {
    const state = await writtenCall('read', { callId: conversation.id });
    if (writtenConversation === conversation) renderWritten(conversation, state);
  } catch (error) {
    if (writtenConversation !== conversation) return;
    if (error.code === 'PERMISSION_DENIED' || error.message.includes('iletişim kurulamıyor')) {
      stopWritten();
      setStatus('writtenSearchStatus', 'Yazılı görüşme sona erdi.');
    } else setStatus('writtenStatus', 'Yazılı görüşmeye yeniden bağlanıyor…');
  } finally {
    conversation.reading = false;
  }
}

bindClick('homeWritten', () => {
  openRoom('Genel');
  $('writtenStart').click();
}, 'status');

bindClick('writtenStart', async () => {
  if (!session) return goToSignIn('Yazılı eşleşme için doğrulanmış e-posta ile giriş yap.');
  if (writtenSearch || writtenConversation) return;
  const account = session.localId;
  const topic = roomTopic;
  if (!await confirmDertdas({
    title: 'Yazılı sohbet', kind: 'written', action: 'Eşleşme ara',
    info: '15 dakikalık bire bir görüşme.',
    details: ['Günün ilk görüşmesi ücretsiz.', 'Sonraki görüşmelerde önce VIP hakkın kullanılır.', 'Hak kalmadıysa görüşme başladığında 25 jeton düşer.']
  })) return;
  if (session?.localId !== account || currentTab !== 'room' || roomTopic !== topic) return;
  const search = { fields: { room: rooms.get(topic).id, requestId: crypto.randomUUID() } };
  writtenSearch = search;
  $('writtenStart').hidden = true;
  $('writtenCancel').hidden = false;
  $('writtenWallet').hidden = true;
  setStatus('writtenSearchStatus', 'Yazılı sohbet için eşleşme aranıyor…');
  search.timer = setInterval(() => { void findWritten(search, 'search'); }, 5000);
  await findWritten(search, 'join');
}, 'writtenSearchStatus');

$('writtenCancel').onclick = () => cancelWrittenSearch();
bindClick('writtenJoin', async () => {
  const search = writtenSearch;
  if (!search?.callId) return;
  const id = search.callId;
  const state = await writtenCall('open', { callId: id, chatTools: true });
  if (writtenSearch !== search) return;
  cancelWrittenSearch(false);
  if (state.closed) throw Error('Eşleşme sona erdi.');
  const conversation = { id, favorite: Boolean(state.identity?.favorite) };
  writtenConversation = conversation;
  $('writtenItems').replaceChildren();
  $('writtenText').value = '';
  const name = state.identity?.name || 'Sohbet arkadaşı';
  setStatus('writtenTitle', name);
  setStatus('writtenAvatar', name.replace(/^@/, '').charAt(0).toLocaleUpperCase('tr-TR'));
  setStatus('writtenRoom', roomTopic || 'Yazılı sohbet');
  $('writtenMenu').open = false;
  closeWrittenGifts();
  setStatus('writtenStatus', '');
  $('writtenDialog').showModal();
  renderWritten(conversation, state);
  void refreshWritten(conversation);
  conversation.timer = setInterval(() => renderWrittenClock(conversation), 1000);
  conversation.poll = setInterval(() => { void refreshWritten(conversation); }, 2300);
}, 'writtenSearchStatus');

bindForm('writtenForm', async () => {
  const conversation = writtenConversation;
  const text = $('writtenText').value.trim();
  if (!conversation || !text) return;
  if (conversation.outbox?.text !== text) conversation.outbox = { text, id: crypto.randomUUID() };
  const state = await writtenCall('send', { callId: conversation.id, text, messageId: conversation.outbox.id });
  if (writtenConversation !== conversation) return;
  if (state.closed) return renderWritten(conversation, state);
  conversation.outbox = null;
  $('writtenText').value = '';
  await refreshWritten(conversation);
}, 'writtenStatus');

$('writtenDialog').addEventListener('cancel', event => { event.preventDefault(); endWrittenConversation(); });
$('writtenDialog').addEventListener('close', () => {
  if (writtenConversation && !$('writtenDialog').open) endWrittenConversation();
});
function writtenFeedback(kind) {
  $('writtenMenu').open = false;
  if (writtenConversation?.other) openFeedback(kind, '', writtenConversation.other);
}

$('writtenEnd').onclick = endWrittenConversation;
$('writtenReport').onclick = () => writtenFeedback('user');
$('writtenBlock').onclick = () => writtenFeedback('block');
$('writtenGiftsClose').onclick = closeWrittenGifts;

bindClick('writtenFavorite', async () => {
  const conversation = writtenConversation;
  if (!conversation?.isActive) return;
  const result = await writtenCall('favorite', { callId: conversation.id, enabled: !conversation.favorite });
  if (writtenConversation !== conversation) return;
  if (result.closed) return renderWritten(conversation, result);
  conversation.favorite = result.favorite;
  renderWrittenTools(conversation);
  setStatus('writtenStatus', result.favorite ? 'Favorilere eklendi.' : 'Favorilerden kaldırıldı.');
}, 'writtenStatus');

function writtenPerkId(conversation, key) {
  conversation.perkIds ??= new Map();
  if (!conversation.perkIds.has(key)) conversation.perkIds.set(key, crypto.randomUUID());
  return conversation.perkIds.get(key);
}

bindClick('writtenExtend', async () => {
  const conversation = writtenConversation;
  const extension = conversation?.tools?.extension;
  if (!conversation?.isActive || !extension?.remaining || extension.offer) return;
  if (!await confirmDertdas({
    title: 'Sohbeti uzat', kind: 'written', action: 'Teklif gönder',
    info: '+' + extension.minutes + ' dakika · ' + extension.cost + ' jeton',
    details: ['Jetonlar yalnızca sohbet arkadaşın kabul ederse senden düşer.']
  }) || writtenConversation !== conversation) return;
  const requestId = writtenPerkId(conversation, 'extend');
  const result = await writtenCall('extendOffer', { callId: conversation.id, requestId });
  conversation.perkIds.delete('extend');
  if (writtenConversation === conversation) renderWritten(conversation, result);
}, 'writtenStatus');

async function answerWrittenExtension(action) {
  const conversation = writtenConversation;
  const offer = conversation?.tools?.extension.offer;
  if (!offer || offer.from === session?.localId) return;
  const result = await writtenCall(action, { callId: conversation.id, requestId: offer.id });
  if (writtenConversation === conversation) {
    renderWritten(conversation, result);
    await refreshWritten(conversation);
  }
}
bindClick('writtenAccept', () => answerWrittenExtension('extendAccept'), 'writtenStatus');
bindClick('writtenDecline', () => answerWrittenExtension('extendDecline'), 'writtenStatus');

$('writtenGift').onclick = () => {
  const conversation = writtenConversation;
  if (!conversation?.isActive || !conversation.tools) return;
  if (!$('writtenGifts').hidden) return closeWrittenGifts();
  const giftButtons = conversation.tools.gifts.map(gift => {
    const button = node('button');
    const symbol = node('span', gift.symbol);
    symbol.setAttribute('aria-hidden', 'true');
    button.append(symbol, document.createTextNode(gift.label), node('small', gift.cost + ' jeton'));
    button.onclick = () => void perform(button, async () => {
      if (!await confirmDertdas({
        title: gift.label + ' gönder', kind: 'written', action: 'Hediye gönder',
        info: gift.cost + ' jeton · Sohbet içinde görünür'
      }) || writtenConversation !== conversation) return;
      const key = 'gift:' + gift.id;
      const requestId = writtenPerkId(conversation, key);
      const result = await writtenCall('gift', { callId: conversation.id, gift: gift.id, requestId });
      conversation.perkIds.delete(key);
      if (writtenConversation === conversation) {
        closeWrittenGifts();
        renderWritten(conversation, result);
        await refreshWritten(conversation);
      }
    }, 'writtenStatus');
    return button;
  });
  $('writtenGiftList').replaceChildren(...giftButtons);
  $('writtenGifts').hidden = false;
  $('writtenGift').setAttribute('aria-expanded', 'true');
};

async function loadWrittenFavorites() {
  const account = session?.localId;
  const result = await writtenCall('favorites');
  if (session?.localId !== account || !$('writtenFavoritesDialog').open) return;
  const items = result.favorites.map(favorite => {
    const info = node('div');
    const topic = [...rooms].find(([, value]) => value.id === favorite.room)?.[0];
    info.append(node('strong', favorite.name), node('p', topic || 'Yazılı sohbet'));
    const remove = node('button', 'Kaldır', 'quiet');
    remove.onclick = () => void perform(remove, async () => {
      await writtenCall('removeFavorite', { other: favorite.id });
      await loadWrittenFavorites();
    }, 'writtenFavoritesStatus');
    const row = node('article');
    row.append(info, remove);
    return row;
  });
  $('writtenFavoritesList').replaceChildren(...(items.length ? items : [node('p', 'Henüz favori sohbet arkadaşın yok.')]));
}

bindClick('writtenFavorites', async () => {
  $('writtenFavoritesList').replaceChildren();
  $('writtenFavoritesDialog').showModal();
  await loadWrittenFavorites();
}, 'writtenFavoritesStatus');
$('writtenFavoritesClose').onclick = () => $('writtenFavoritesDialog').close();
