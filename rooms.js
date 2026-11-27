'use strict';

const rooms = new Map([
  ['Genel', {
    id: 'general', title: 'Genel Dertleşme', headline: 'Bugün neler oldu?',
    intro: 'Konusunu seçemediğin ya da sadece paylaşmak istediğin her şey.',
    prompt: 'Bugün içimde kalan…', guides: []
  }],
  ['Yalnızlık', {
    id: 'loneliness', title: 'Yalnızlık', headline: 'Biraz konuşalım mı?',
    intro: 'Yalnız hissettiğin anları ve yeni bağlar kurmayı konuşmak için.',
    prompt: 'Bugün birinin bana sormasını istediğim soru…', guides: []
  }],
  ['Kumar Sorunları', {
    id: 'recovery', title: 'Kumar Desteği', headline: 'Bugün bir adım daha.',
    intro: 'Dürtüler, yeniden başlamak ve kumarsız günler üzerine konuş.',
    prompt: 'Bugün oynamamak için ne yapabilirim?',
    guides: [
      ['Dürtü geldiğinde', 'Bir karar vermeden önce birkaç dakika ara ver. Varsa açık bahis sayfasını kapat ve güvendiğin birine yaz.'],
      ['Bir kayıptan sonra', 'Kaybı hemen telafi etmeye çalışmak yerine bugün atabileceğin küçük bir adım seç. Yeniden başlamak için yarını beklemek zorunda değilsin.'],
      ['Birine nasıl anlatırım?', 'Yaşadığın durumu ve ne tür bir desteğe ihtiyacın olduğunu tek cümleyle söyleyerek başla.']
    ]
  }],
  ['Aile', {
    id: 'family', title: 'Aile Odası', headline: 'Evde konuşamadıkların.',
    intro: 'Aile içi iletişim, sınırlar ve zor konuşmalar için bir alan.',
    prompt: 'Aileme söylemek isteyip de söyleyemediğim…',
    vipGuide: 'VIP · Zor konuşmaya hazırlık',
    tool: ['Konuşma provası', 'Zor bir cümleyi burada dene. Yazdıkların bu ekran için kullanılır ve gönderilmez.',
      'Bu konu açıldığında … hissediyorum. Bundan sonra … istiyorum.', 'Provayı temizle'],
    guides: [
      ['Konuşmaya nereden başlamalı?', 'Konunun tamamını bir anda çözmeye çalışmadan, yaşadığın bir olayı ve sende bıraktığı hissi söyle.'],
      ['Kendi sınırımı nasıl söylerim?', 'Seni rahatsız eden davranışı ve bundan sonra neye ihtiyacın olduğunu açıkça ifade et.']
    ]
  }],
  ['Aşk ve İlişkiler', {
    id: 'relationships', title: 'İlişkiler Odası', headline: 'Kalbinde ne var?',
    intro: 'Tanışmalar, ayrılıklar, güven ve söylenemeyenler.',
    prompt: 'Bu ilişkide en çok ihtiyacım olan şey…',
    boost: true,
    vipGuide: 'VIP · İlişki konuşması için soru seti',
    tool: ['Mesaj taslağı', 'Göndermeden önce ne söylemek istediğini toparla.',
      'Sana bunu yazıyorum çünkü…', 'Taslağı temizle'],
    guides: [['Bir mesaj atmadan önce', 'Bu mesajı atınca neyin değişmesini istiyorum? Yazdığını göndermeden önce bir kez bu soruyla oku.'],
      ['İhtiyacını adlandır', 'Anlaşılmak, güven, yakınlık veya mesafe. Şu an sana en çok ne iyi gelirdi?']]
  }],
  ['Dertleşme', {
    id: 'talk', title: 'Gece Odası', headline: 'Bu gece içinden ne geçiyor?',
    intro: 'Gece aklında kalanları yaz veya dinleyecek birini ara.',
    prompt: 'Bugün beni en çok yoran şey…',
    vipGuide: 'VIP · Gece yazma rehberi',
    tool: ['Kendime yaz', 'Bu alandaki yazı yalnızca burada görünür. Odadan ayrılınca temizlenir.',
      'Bu gece içimde kalan…', 'Yazıyı temizle'],
    guides: [['Beni nasıl dinlersin?', 'Dertleşmeye başlarken tavsiye mi yoksa sadece dinlenmek mi istediğini söyleyebilirsin.']]
  }],
  ['Okul ve İş', {
    id: 'work', title: 'İş, Para ve Kariyer', headline: 'Bir sonraki adımın ne?',
    intro: 'CV, iş stresi, okul, bütçe ve kariyer kararları.',
    prompt: 'Bu hafta çözmek istediğim bir şey…',
    boost: true,
    vipGuide: 'VIP · Mülakat hazırlık listesi',
    tool: ['Karar listem', 'Seçeneklerini yaz ve bugün atabileceğin ilk adımı belirle.',
      'Seçeneklerim…\nBenim için önemli olan…\nBugün atacağım adım…', 'Listeyi temizle'],
    guides: [['Küçük bir sonraki adım', 'İşin tamamını düşünmek yerine bugün yapabileceğin tek bir adım belirle.'],
      ['CV için deneyimini yaz', 'Görevini, ne yaptığını ve ölçebildiğin sonucu tek cümlede birleştir.']]
  }]
]);

const recoveryKey = 'dertdas-recovery-since';
let roomTopic = '';
let roomBoosts = [];
let roomBoostRevision = 0;

function openRoom(topic) {
  const room = rooms.get(topic);
  if (roomTopic !== topic) {
    cancelWrittenSearch();
  }
  roomTopic = topic;
  $('room').dataset.room = room.id;
  $('shareRoom').hidden = !config.publicSite;
  $('roomMark').replaceChildren(icon(topics.get(topic)));
  setStatus('roomName', room.title);
  setStatus('roomTitle', room.headline);
  setStatus('roomIntro', room.intro);
  setStatus('roomPrompt', room.prompt);
  $('roomTool').hidden = !room.tool;
  $('vipRoomGuide').hidden = !room.vipGuide;
  $('vipRoomGuide').open = false;
  $('vipRoomGuideSteps').hidden = true;
  $('vipRoomGuideSteps').replaceChildren();
  setStatus('vipRoomGuideTitle', room.vipGuide || '');
  setStatus('vipRoomGuideStatus', '');
  $('roomVipShop').hidden = true;
  $('roomTool').replaceChildren();
  if (room.tool) {
    const [title, description, placeholder, clearLabel] = room.tool;
    const draft = node('textarea');
    draft.rows = 3;
    draft.maxLength = 2000;
    draft.placeholder = placeholder;
    draft.setAttribute('aria-label', title);
    const clear = node('button', clearLabel);
    clear.type = 'button';
    clear.onclick = () => { draft.value = ''; draft.focus(); };
    $('roomTool').append(node('h2', title), node('p', description), draft, clear);
  }
  $('recoveryCounter').hidden = room.id !== 'recovery';
  $('roomGuides').replaceChildren(...room.guides.map(([title, description]) => {
    const entry = node('details', '', 'room-guide');
    entry.append(node('summary', title), node('p', description));
    return entry;
  }));
  show('room');
  roomBoosts = [];
  setStatus('roomPostStatus', '');
  renderRoomPosts();
  void refreshRoomBoosts();
  renderRecoveryCounter();
}

$('vipRoomGuide').ontoggle = async () => {
  if (!$('vipRoomGuide').open) return;
  const topic = roomTopic;
  if (!session) {
    setStatus('vipRoomGuideStatus', 'Bu rehber VIP üyeliğine dahil.');
    $('roomVipShop').hidden = false;
    return;
  }
  setStatus('vipRoomGuideStatus', 'Rehber açılıyor…');
  try {
    const result = await matchCall('vipGuide', { room: rooms.get(topic).id });
    if (topic !== roomTopic || !$('vipRoomGuide').open || currentTab !== 'room') return;
    setStatus('vipRoomGuideStatus', result.active ? '' : 'Bu rehber VIP üyeliğine dahil.');
    $('roomVipShop').hidden = result.active;
    $('vipRoomGuideSteps').replaceChildren(...(result.steps || []).map(step => node('li', step)));
    $('vipRoomGuideSteps').hidden = !result.active;
  } catch {
    if (topic === roomTopic && $('vipRoomGuide').open && currentTab === 'room') {
      setStatus('vipRoomGuideStatus', 'VIP üyelik durumu şu anda kontrol edilemiyor.');
      $('roomVipShop').hidden = false;
    }
  }
};

function renderRoomPosts() {
  if (!roomTopic || currentTab !== 'room') return;
  const boosts = roomBoosts.filter(doc => !blocked.has(value(doc, 'uid'))
    && Date.parse(doc.fields?.boostedUntil?.timestampValue) > Date.now());
  const visible = posts.filter(doc => value(doc, 'category') === roomTopic && !blocked.has(value(doc, 'uid')));
  const entries = [...new Map([...boosts, ...visible].map(doc => [docId(doc), doc])).values()];
  const featured = new Set(boosts.map(docId));
  $('roomPosts').replaceChildren(...(entries.length ? entries.map(doc => {
    const card = renderPost(doc);
    if (featured.has(docId(doc))) {
      card.classList.add('room-boosted');
      card.prepend(node('span', 'Öne çıkarıldı', 'room-boost-label'));
    } else if (rooms.get(roomTopic).boost && value(doc, 'uid') === session?.localId) {
      const boost = node('button', '24 saat öne çıkar · 1 jeton', 'quiet');
      boost.type = 'button';
      boost.onclick = async () => {
        if (!await confirmDertdas({ title: 'Gönderiyi öne çıkar', info: 'Gönderin 24 saat öne çıkar. 1 jeton kullanılır.', action: 'Öne çıkar' })) return;
        const topic = roomTopic;
        void perform(boost, async () => {
          await matchCall('boost', { postId: docId(doc) });
          if (roomTopic !== topic || currentTab !== 'room') return;
          await refreshRoomBoosts();
          if (roomTopic === topic && currentTab === 'room') setStatus('roomPostStatus', 'Gönderin öne çıkarıldı.');
        }, 'roomPostStatus');
      };
      card.append(boost);
    }
    return card;
  }) : [
    node('p', 'Bu odada henüz paylaşım görünmüyor. İlk yazıyı sen paylaşabilirsin.', 'empty')
  ]));
}

async function refreshRoomBoosts() {
  const revision = ++roomBoostRevision;
  if (!session || !rooms.get(roomTopic)?.boost) return;
  try {
    const rows = await query('posts', {
      where: { compositeFilter: { op: 'AND', filters: [
        { fieldFilter: { field: { fieldPath: 'category' }, op: 'EQUAL', value: str(roomTopic) } },
        { fieldFilter: { field: { fieldPath: 'boostedUntil' }, op: 'GREATER_THAN',
          value: { timestampValue: new Date().toISOString() } } }
      ] } },
      orderBy: [{ field: { fieldPath: 'boostedUntil' }, direction: 'DESCENDING' }],
      limit: 8
    });
    if (revision === roomBoostRevision) {
      roomBoosts = rows;
      renderRoomPosts();
    }
  } catch {
    // The regular room feed stays available while the boost index is coming online.
  }
}

function recoveryStart() {
  const number = Number(localStorage.getItem(recoveryKey));
  return Number.isFinite(number) && number > 0 ? number : null;
}

function renderRecoveryCounter() {
  const start = recoveryStart();
  const hours = start ? Math.max(0, Math.floor((Date.now() - start) / 3600000)) : 0;
  setStatus('recoveryDays', String(Math.floor(hours / 24)));
  setStatus('recoveryHours', String(hours % 24));
  setStatus('recoveryEdit', start ? 'Başlangıcı düzenle' : 'Sayacı başlat');
  $('recoveryClear').hidden = !start;
  $('recoveryStartDate').hidden = !start;
  setStatus('recoveryStartDate', start ? 'Başlangıç · ' + new Date(start).toLocaleString('tr-TR', {
    dateStyle: 'medium', timeStyle: 'short'
  }) : '');
}

function localDateTime(timestamp) {
  const date = new Date(timestamp);
  return new Date(timestamp - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

$('recoveryEdit').onclick = () => {
  $('recoveryDate').max = localDateTime(Date.now());
  $('recoveryDate').value = localDateTime(recoveryStart() || Date.now());
  setStatus('recoveryError', '');
  $('recoveryDialog').showModal();
};

$('recoveryForm').onsubmit = event => {
  event.preventDefault();
  const date = new Date($('recoveryDate').value).getTime();
  if (!Number.isFinite(date) || date < 1 || date > Date.now()) {
    setStatus('recoveryError', 'Geçerli bir başlangıç tarihi seç.');
    return;
  }
  localStorage.setItem(recoveryKey, String(date));
  $('recoveryDialog').close();
  renderRecoveryCounter();
};

$('recoveryClear').onclick = async () => {
  if (!await confirmDertdas({ title: 'Sayaç sıfırlansın mı?', info: 'Kayıtlı başlangıç tarihi bu cihazdan silinir.', action: 'Sıfırla' })) return;
  localStorage.removeItem(recoveryKey);
  renderRecoveryCounter();
};

$('roomBack').onclick = () => { selectedTopic = ''; show('feed'); renderFeed(); };
$('roomCompose').onclick = () => openComposer();
$('roomPrompt').onclick = () => {
  openComposer();
  if ($('composer').open && !$('postText').value) {
    $('postText').value = rooms.get(roomTopic).prompt;
    $('postText').focus();
    $('postText').setSelectionRange($('postText').value.length, $('postText').value.length);
  }
};

async function matchCall(action, fields = {}) {
  const endpoint = config.workerEndpoint || 'https://europe-west1-' + config.projectId + '.cloudfunctions.net/roomMatch';
  try {
    return (await request(endpoint, {
      token: await token(), body: { data: { action, ...fields, protocolVersion: 23 } }
    })).result;
  } catch (error) {
    if (error.code === 'FAILED_PRECONDITION') throw Error(error.message);
    if (action === 'boost' && (!error.code || error.httpStatus === 404 || error.httpStatus >= 500)) {
      throw Error('Öne çıkarma sunucusuna ulaşılamadı.');
    }
    throw error;
  }
}

setInterval(() => {
  if (currentTab === 'room' && roomTopic === 'Kumar Sorunları') renderRecoveryCounter();
}, 60000);
