'use strict';

const journalKey = uid => 'dertdas-journal-' + uid;
const journalDate = new Intl.DateTimeFormat('tr-TR', { dateStyle: 'long', timeStyle: 'short' });
let journalEditing = null;

function readJournal(uid) {
  try {
    const entries = JSON.parse(localStorage.getItem(journalKey(uid)) ?? '[]');
    if (!Array.isArray(entries)) throw Error('Invalid journal');
    return entries;
  } catch {
    throw Error('Günlük notların okunamadı.');
  }
}

function writeJournal(uid, entries) {
  try {
    localStorage.setItem(journalKey(uid), JSON.stringify(entries));
  } catch {
    throw Error('Bu cihazda günlük kaydedilemedi.');
  }
}

function resetJournal() {
  journalEditing = null;
  $('journalForm').reset();
  setStatus('journalLabel', 'Bugün aklında ne var?');
  setStatus('journalSave', 'Notu kaydet');
  setStatus('journalStatus', '');
  $('journalCancel').hidden = true;
}

function editJournalEntry(entry) {
  journalEditing = entry.id;
  $('journalText').value = entry.text;
  setStatus('journalLabel', 'Notunu düzenle');
  setStatus('journalSave', 'Değişiklikleri kaydet');
  setStatus('journalStatus', '');
  $('journalCancel').hidden = false;
  $('journalText').scrollIntoView({ block: 'center' });
  $('journalText').focus({ preventScroll: true });
}

async function deleteJournalEntry(uid, entry) {
  const confirmed = await confirmDertdas({
    title: 'Günlük notu silinsin mi?',
    info: 'Bu işlem geri alınamaz.',
    action: 'Notu sil'
  });
  if (!confirmed || session?.localId !== uid) return;
  writeJournal(uid, readJournal(uid).filter(item => item.id !== entry.id));
  if (journalEditing === entry.id) resetJournal();
  renderJournal();
  setStatus('journalStatus', 'Not silindi.');
}

function renderJournal() {
  const uid = session.localId;
  const root = $('journalEntries');
  const expanded = new Set([...root.querySelectorAll('details[open]')].map(item => item.dataset.entry));
  root.replaceChildren();
  const entries = readJournal(uid);
  if (!entries.length) {
    root.append(node('p', 'Henüz günlük notun yok.', 'empty'));
    return;
  }

  root.replaceChildren(...entries.map(entry => {
    const card = node('details', '', 'card journal-entry');
    card.dataset.entry = entry.id;
    card.open = expanded.has(entry.id);
    const words = entry.text.replace(/\s+/g, ' ');
    const preview = words.length > 50 ? words.slice(0, 50) + '…' : words;
    const actions = node('div', '', 'journal-actions');
    actions.append(button('Düzenle', () => editJournalEntry(entry)),
      button('Sil', () => perform(null, () => deleteJournalEntry(uid, entry), 'journalStatus'), 'quiet danger'));
    card.append(node('summary', preview), node('p', entry.text),
      node('small', journalDate.format(entry.createdAt)), actions);
    return card;
  }));
}

$('journalCancel').onclick = resetJournal;
bindForm('journalForm', () => {
  const text = $('journalText').value.trim();
  if (!text) throw Error('Önce bir not yaz.');
  const uid = session.localId;
  const entries = readJournal(uid);
  if (journalEditing) {
    const entry = entries.find(item => item.id === journalEditing);
    if (!entry) throw Error('Düzenlemek istediğin not bulunamadı.');
    entry.text = text;
  } else {
    entries.unshift({ id: crypto.randomUUID(), text, createdAt: Date.now() });
  }
  writeJournal(uid, entries);
  resetJournal();
  renderJournal();
  setStatus('journalStatus', 'Not kaydedildi.');
}, 'journalStatus');
