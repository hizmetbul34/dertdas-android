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

function renderWritten(conversation, state) {
  conversation.other = state.other;
  if (state.closed) {
    stopWritten();
    setStatus('writtenSearchStatus', 'Yazılı görüşme sona erdi.');
    return;
  }
  const endsAt = state.endsAt || state.startBy;
  conversation.deadline = performance.now() + endsAt - state.now;
  conversation.isActive = Boolean(state.endsAt);
  $('writtenForm').hidden = !conversation.isActive;
  setStatus('writtenStatus', conversation.isActive ? '' : 'Karşı tarafın katılması bekleniyor…');
  const rows = state.messages || [];
  const fingerprint = rows.map(item => item.id).join(' ');
  if (fingerprint === conversation.fingerprint) return;
  conversation.fingerprint = fingerprint;
  const history = $('writtenItems');
  history.replaceChildren(...rows.map(item => node('p', item.text, 'bubble' + (item.uid === session.localId ? ' mine' : ''))));
  history.scrollTop = history.scrollHeight;
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
  const state = await writtenCall('open', { callId: id });
  if (writtenSearch !== search) return;
  cancelWrittenSearch(false);
  if (state.closed) throw Error('Eşleşme sona erdi.');
  const conversation = { id };
  writtenConversation = conversation;
  $('writtenItems').replaceChildren();
  $('writtenText').value = '';
  setStatus('writtenClock', '');
  $('writtenDialog').showModal();
  renderWritten(conversation, state);
  conversation.timer = setInterval(() => {
    if (writtenConversation !== conversation) return;
    const seconds = Math.max(0, Math.ceil((conversation.deadline - performance.now()) / 1000));
    if (!seconds) {
      stopWritten();
      setStatus('writtenSearchStatus', 'Yazılı görüşmenin süresi doldu.');
      return;
    }
    setStatus('writtenClock', conversation.isActive ? Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0') : '');
    void refreshWritten(conversation);
  }, 2000);
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
$('writtenEnd').onclick = endWrittenConversation;
$('writtenReport').onclick = () => { if (writtenConversation?.other) openFeedback('user', '', writtenConversation.other); };
$('writtenBlock').onclick = () => { if (writtenConversation?.other) openFeedback('block', '', writtenConversation.other); };
