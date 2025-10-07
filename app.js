const MS_PER_DAY = 86_400_000;
const MAX_RENDERED_ROWS = 500;
const WINDOW_LABELS = {
  '30': 'reported in the last 30 days',
  '90': 'reported in the last 90 days',
  '365': 'reported in the last 12 months',
  all: 'across all available disclosures',
};

const ICON_192_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAMAAAADACAIAAADdvvtQAAAB6klEQVR4nO3SQQkAIADAQItYyfzGsYN7iHBwAfbYmGvDtfG8gK8ZiMRAJAYiMRCJgUgMRGIgEgORGIjEQCQGIjEQiYFIDERiIBIDkRiIxEAkBiIxEImBSAxEYiASA5EYiMRAJAYiMRCJgUgMRGIgEgORGIjEQCQGIjEQiYFIDERiIBIDkRiIxEAkBiIxEImBSAxEYiASA5EYiMRAJAYiMRCJgUgMRGIgEgORGIjEQCQGIjEQiYFIDERiIBIDkRiIxEAkBiIxEImBSAxEYiASA5EYiMRAJAYiMRCJgUgMRGIgEgORGIjEQCQGIjEQiYFIDERiIBIDkRiIxEAkBiIxEImBSAxEYiASA5EYiMRAJAYiMRCJgUgMRGIgEgORGIjEQCQGIjEQiYFIDERiIBIDkRiIxEAkBiIxEImBSAxEcgB7JrqcciodXwAAAABJRU5ErkJggg=='
;

const statusEl = document.getElementById('status');
const tableContainer = document.querySelector('.table-container');
const resultsBody = document.getElementById('resultsBody');
const rowTemplate = document.getElementById('rowTemplate');
const summaryEl = document.getElementById('summary');
const summaryCountEl = summaryEl.querySelector('[data-count]');
const summaryWindowEl = summaryEl.querySelector('[data-window]');
const summarySourcesEl = summaryEl.querySelector('[data-sources]');
const summaryUpdatedEl = summaryEl.querySelector('[data-updated]');
const summaryNoteEl = summaryEl.querySelector('[data-note]');
const searchInput = document.getElementById('searchInput');
const typeFilter = document.getElementById('typeFilter');
const chamberFilter = document.getElementById('chamberFilter');
const windowFilter = document.getElementById('windowFilter');
const installButton = document.getElementById('installButton');
const notificationButton = document.getElementById('notificationButton');
const notificationStatusEl = document.getElementById('notificationStatus');

const NOTIFICATION_PREF_KEY = 'politician-tracker-notifications';
const AUTO_REFRESH_MS = 15 * 60 * 1000;

let transactions = [];
let filteredTransactions = [];
let loadedSources = [];
let latestDisclosureMs = 0;
let deferredInstallPrompt = null;
let notificationsEnabled = false;
let latestAlertNote = '';
let latestAlertTimeoutId = null;
let autoRefreshTimer = null;
let isInitialLoad = true;
let isLoadingTransactions = false;
let offlineMessageVisible = false;

const currentYear = new Date().getFullYear();
const senateYears = [currentYear, currentYear - 1];

const SOURCES = [
  {
    id: 'senate',
    chamber: 'senate',
    chamberLabel: 'Senate',
    label: 'U.S. Senate periodic transaction reports',
    urls: senateYears.map(
      (year) =>
        `https://senate-stock-watcher-data.s3-us-west-2.amazonaws.com/transaction_report_for_${year}.json`
    ),
    normalize: (entry, source) => {
      if (!entry) return null;

      const name = [entry.first_name, entry.last_name]
        .filter(Boolean)
        .map((part) => String(part).trim())
        .filter(Boolean)
        .join(' ');

      const { code: transaction, label: transactionLabel } = getTransactionKind(
        entry.type || entry.transaction || entry.transaction_type
      );

      const ticker = (entry.ticker || entry.symbol || '').trim();
      const assetName = (entry.asset_name || entry.asset_description || '').trim();
      const amountRaw = entry.amount || entry.amount_range || entry.capital_gains || '';
      const tradeDate = parseDate(entry.transaction_date || entry.transactionDate);
      const disclosureDate = parseDate(
        entry.filing_date || entry.disclosure_date || entry.reported_date
      );

      const uniqueKey =
        entry.ptr_link ||
        `${name || 'unknown'}-${ticker || 'na'}-${entry.transaction_date || ''}-$${
          entry.amount || ''
        }-${transactionLabel}`;

      return {
        id: `${source.id}-${uniqueKey}`,
        uniqueKey,
        representative: name || 'Unknown',
        state: entry.state || entry.state_cd || '',
        party: entry.party || '',
        owner: entry.owner || '',
        chamber: source.chamber,
        chamberLabel: source.chamberLabel,
        transaction,
        transactionLabel,
        ticker,
        assetName,
        amountDisplay: formatAmount(amountRaw),
        tradeDate,
        tradeDateMs: tradeDate ? tradeDate.getTime() : null,
        tradeDateDisplay: formatDate(tradeDate),
        disclosureDate,
        disclosureDateMs: disclosureDate ? disclosureDate.getTime() : null,
        disclosureDateDisplay: formatDate(disclosureDate),
        sourceLabel: source.label,
        sourceUrl: entry.ptr_link || entry.source_url || '',
        searchText: buildSearchText({
          representative: name,
          ticker,
          assetName,
          state: entry.state,
          party: entry.party,
          owner: entry.owner,
        }),
      };
    },
  },
  {
    id: 'house',
    chamber: 'house',
    chamberLabel: 'House',
    label: 'U.S. House periodic transaction reports',
    urls: [
      'https://house-stock-watcher-data.s3-us-west-2.amazonaws.com/data/all_transactions.json',
    ],
    normalize: (entry, source) => {
      if (!entry) return null;

      const name = entry.representative ||
        [entry.first_name, entry.last_name].filter(Boolean).join(' ');

      const { code: transaction, label: transactionLabel } = getTransactionKind(
        entry.transaction || entry.transaction_type || entry.type
      );

      const ticker = (entry.ticker || entry.symbol || '').trim();
      const assetName =
        (entry.asset_description || entry.asset_name || entry.company || '').trim();
      const amountRaw =
        entry.amount || entry.amount_range || entry.capital_gains || entry.amount_description;
      const tradeDate = parseDate(
        entry.transaction_date || entry.transactionDate || entry.date_of_transaction
      );
      const disclosureDate = parseDate(
        entry.disclosure_date || entry.report_date || entry.reported_date || entry.date_filed
      );

      const uniqueKey =
        entry.tx_id ||
        entry.report_id ||
        `${name || 'unknown'}-${entry.district || entry.state || ''}-${
          ticker || assetName
        }-${tradeDate ? tradeDate.toISOString() : ''}-${transactionLabel}`;

      return {
        id: `${source.id}-${uniqueKey}`,
        uniqueKey,
        representative: (name || 'Unknown').trim(),
        state: entry.state || entry.district || '',
        party: entry.party || '',
        owner: entry.owner || '',
        chamber: source.chamber,
        chamberLabel: source.chamberLabel,
        transaction,
        transactionLabel,
        ticker,
        assetName,
        amountDisplay: formatAmount(amountRaw),
        tradeDate,
        tradeDateMs: tradeDate ? tradeDate.getTime() : null,
        tradeDateDisplay: formatDate(tradeDate),
        disclosureDate,
        disclosureDateMs: disclosureDate ? disclosureDate.getTime() : null,
        disclosureDateDisplay: formatDate(disclosureDate),
        sourceLabel: source.label,
        sourceUrl:
          entry.ptr_link || entry.report_link || entry.disclosure_url || entry.source_url || '',
        searchText: buildSearchText({
          representative: name,
          ticker,
          assetName,
          state: entry.state || entry.district,
          party: entry.party,
          owner: entry.owner,
        }),
      };
    },
  },
];

const debounce = (fn, wait = 200) => {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn.apply(null, args), wait);
  };
};

function parseDate(rawValue) {
  if (!rawValue) return null;

  if (rawValue instanceof Date) {
    return Number.isNaN(rawValue.getTime()) ? null : rawValue;
  }

  if (typeof rawValue === 'number') {
    const date = new Date(rawValue);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const value = String(rawValue).trim();
  if (!value) return null;

  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed;
  }

  const slashMatch = value.match(/^(\d{1,2})[\/](\d{1,2})[\/](\d{2,4})$/);
  if (slashMatch) {
    let [, month, day, year] = slashMatch;
    if (year.length === 2) {
      year = `20${year}`;
    }
    const isoCandidate = `${year.padStart(4, '0')}-${month.padStart(2, '0')}-${day.padStart(
      2,
      '0'
    )}`;
    const isoDate = new Date(isoCandidate);
    if (!Number.isNaN(isoDate.getTime())) {
      return isoDate;
    }
  }

  const dashMatch = value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (dashMatch) {
    const [, year, month, day] = dashMatch;
    const isoDate = new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`);
    if (!Number.isNaN(isoDate.getTime())) {
      return isoDate;
    }
  }

  return null;
}

function formatDate(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return '—';
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}

function formatAmount(rawAmount) {
  if (rawAmount === null || rawAmount === undefined) {
    return 'Unknown';
  }

  const normalized = String(rawAmount).replace(/[$,]/g, '').trim();
  if (!normalized) {
    return 'Unknown';
  }

  if (/less than/i.test(rawAmount)) {
    return rawAmount;
  }

  const rangeMatch = normalized.match(/(\d+)\s*-\s*(\d+)/);
  if (rangeMatch) {
    const [, minRaw, maxRaw] = rangeMatch;
    const min = Number.parseInt(minRaw, 10);
    const max = Number.parseInt(maxRaw, 10);
    if (Number.isFinite(min) && Number.isFinite(max)) {
      const formatter = new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        maximumFractionDigits: 0,
      });
      return `${formatter.format(min)} – ${formatter.format(max)}`;
    }
  }

  const value = Number.parseInt(normalized, 10);
  if (Number.isFinite(value)) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    }).format(value);
  }

  return String(rawAmount).trim();
}

function getTransactionKind(rawValue) {
  const label = (rawValue && String(rawValue).trim()) || 'Other';
  const lower = label.toLowerCase();

  if (lower.includes('purchase') || lower.includes('buy')) {
    return { code: 'purchase', label };
  }

  if (lower.includes('sale')) {
    return { code: 'sale', label };
  }

  return { code: 'other', label };
}

function buildSearchText(parts = {}) {
  return Object.values(parts)
    .filter(Boolean)
    .map((value) => String(value).toLowerCase())
    .join(' ');
}

function showAlertNote(message, timeoutMs = 20000) {
  latestAlertNote = message;
  updateSummary(filteredTransactions);

  if (latestAlertTimeoutId) {
    clearTimeout(latestAlertTimeoutId);
  }

  if (Number.isFinite(timeoutMs) && timeoutMs > 0) {
    latestAlertTimeoutId = window.setTimeout(() => {
      latestAlertNote = '';
      updateSummary(filteredTransactions);
    }, timeoutMs);
  }
}

function setStatus(
  message,
  { isError = false, isWarning = false, hidden = false, loading = false } = {}
) {
  statusEl.querySelector('.status-text').textContent = message;
  statusEl.classList.toggle('status--error', isError);
  statusEl.classList.toggle('status--warning', isWarning);
  statusEl.classList.toggle('status--hidden', hidden);
  statusEl.classList.toggle('status--loading', loading);
}

function formatRelativeTime(dateMs) {
  if (!dateMs) return 'recently';
  const diffMs = Date.now() - dateMs;
  if (diffMs <= 0) return 'today';

  const diffDays = Math.round(diffMs / MS_PER_DAY);
  if (diffDays <= 0) return 'today';
  if (diffDays === 1) return '1 day ago';
  if (diffDays < 7) return `${diffDays} days ago`;

  const diffWeeks = Math.round(diffDays / 7);
  if (diffWeeks < 8) {
    return `${diffWeeks} week${diffWeeks === 1 ? '' : 's'} ago`;
  }

  const diffMonths = Math.round(diffDays / 30);
  return `${diffMonths} month${diffMonths === 1 ? '' : 's'} ago`;
}

function renderRows(data) {
  if (!Array.isArray(data) || data.length === 0) {
    resultsBody.replaceChildren();
    return;
  }

  const fragment = document.createDocumentFragment();

  data.forEach((entry) => {
    const clone = rowTemplate.content.firstElementChild.cloneNode(true);

    const nameEl = clone.querySelector('.politician-name');
    const metaEl = clone.querySelector('.politician-meta');
    const chamberEl = clone.querySelector('.chamber');
    const transactionEl = clone.querySelector('.transaction');
    const tickerEl = clone.querySelector('.asset .ticker');
    const assetNameEl = clone.querySelector('.asset .asset-name');
    const amountEl = clone.querySelector('.amount');
    const tradeDateEl = clone.querySelector('.trade-date');
    const filedDateEl = clone.querySelector('.filed-date');
    const linkEl = clone.querySelector('.filed-link');

    nameEl.textContent = entry.representative;

    const metaParts = [];
    if (entry.state) {
      metaParts.push(String(entry.state).toUpperCase());
    }
    if (entry.party) {
      metaParts.push(String(entry.party).toUpperCase());
    }
    if (entry.owner) {
      const ownerText = String(entry.owner)
        .toLowerCase()
        .replace(/\b\w/g, (match) => match.toUpperCase());
      metaParts.push(ownerText);
    }
    metaEl.textContent = metaParts.join(' • ');

    chamberEl.textContent = entry.chamberLabel;
    transactionEl.textContent = entry.transactionLabel;
    transactionEl.classList.toggle('transaction--sale', entry.transaction === 'sale');

    tickerEl.textContent = entry.ticker || '—';
    assetNameEl.textContent = entry.assetName || '—';
    amountEl.textContent = entry.amountDisplay || 'Unknown';
    tradeDateEl.textContent = entry.tradeDateDisplay;
    filedDateEl.textContent = entry.disclosureDateDisplay;

    if (entry.sourceUrl) {
      linkEl.href = entry.sourceUrl;
      linkEl.hidden = false;
    } else {
      linkEl.hidden = true;
    }

    fragment.appendChild(clone);
  });

  resultsBody.replaceChildren(fragment);
}

function updateSummary(data) {
  if (!transactions.length) {
    summaryEl.hidden = true;
    return;
  }

  summaryEl.hidden = false;
  summaryCountEl.textContent = (data.length || 0).toLocaleString('en-US');
  summaryWindowEl.textContent = WINDOW_LABELS[windowFilter.value] || 'reported recently';
  summarySourcesEl.textContent = loadedSources.length
    ? loadedSources.join(', ')
    : 'No data sources available';
  summaryUpdatedEl.textContent = formatRelativeTime(latestDisclosureMs);

  const notes = [];
  if (latestAlertNote) {
    notes.push(latestAlertNote);
  }

  if (data.length > MAX_RENDERED_ROWS) {
    notes.push(
      `Showing first ${MAX_RENDERED_ROWS.toLocaleString('en-US')} of ${data
        .length.toLocaleString('en-US')} matches.`
    );
  }

  if (notes.length) {
    summaryNoteEl.hidden = false;
    summaryNoteEl.textContent = notes.join(' • ');
  } else {
    summaryNoteEl.hidden = true;
    summaryNoteEl.textContent = '';
  }
}

function applyFilters() {
  if (!transactions.length) {
    return [];
  }

  const searchTerm = searchInput.value.trim().toLowerCase();
  const selectedType = typeFilter.value;
  const selectedChamber = chamberFilter.value;
  const windowValue = windowFilter.value;
  const nowMs = Date.now();

  filteredTransactions = transactions.filter((entry) => {
    const matchesSearch = !searchTerm || entry.searchText.includes(searchTerm);
    const matchesType =
      selectedType === 'all' ? true : entry.transaction === selectedType;
    const matchesChamber =
      selectedChamber === 'all' ? true : entry.chamber === selectedChamber;

    let matchesWindow = true;
    if (windowValue !== 'all') {
      const limitDays = Number.parseInt(windowValue, 10);
      if (Number.isFinite(limitDays)) {
        const reference = entry.tradeDateMs ?? entry.disclosureDateMs;
        if (!reference) {
          matchesWindow = false;
        } else {
          const diffDays = (nowMs - reference) / MS_PER_DAY;
          matchesWindow = diffDays <= limitDays;
        }
      }
    }

    return matchesSearch && matchesType && matchesChamber && matchesWindow;
  });

  return filteredTransactions;
}

function filterTransactions({ preserveStatus = false } = {}) {
  if (!transactions.length) {
    if (!preserveStatus) {
      setStatus('Loading transactions...', { loading: true });
    }
    summaryEl.hidden = true;
    tableContainer.hidden = true;
    return;
  }

  const results = applyFilters();
  updateSummary(results);

  if (results.length === 0) {
    tableContainer.hidden = true;
    renderRows([]);
    setStatus('No transactions matched your filters.', { isError: true });
    return;
  }

  const rowsToRender = results.slice(0, MAX_RENDERED_ROWS);

  tableContainer.hidden = false;
  if (!preserveStatus) {
    setStatus('', { hidden: true });
  }
  renderRows(rowsToRender);
}

async function fetchSource(source) {
  const entries = [];
  const successfulUrls = [];

  await Promise.all(
    source.urls.map(async (url) => {
      try {
        const response = await fetch(url, {
          cache: 'no-store',
        });

        if (!response.ok) {
          throw new Error(`Failed to download ${url} (${response.status})`);
        }

        const data = await response.json();
        if (!Array.isArray(data)) {
          return;
        }

        data.forEach((item) => {
          const normalized = source.normalize(item, source);
          if (normalized) {
            entries.push(normalized);
          }
        });

        successfulUrls.push(url);
      } catch (error) {
        console.warn(`[${source.id}]`, error);
      }
    })
  );

  return {
    id: source.id,
    label: source.label,
    entries,
    successfulUrls,
  };
}

async function loadTransactions({ silent = false } = {}) {
  if (isLoadingTransactions) {
    return;
  }

  isLoadingTransactions = true;

  if (!silent) {
    setStatus('Loading transactions from official disclosures...', { loading: true });
    summaryEl.hidden = true;
    tableContainer.hidden = true;
  } else if (!transactions.length) {
    setStatus('Loading transactions...', { loading: true });
  }

  loadedSources = [];

  const previousTransactions = transactions.slice();

  try {
    const results = await Promise.all(SOURCES.map((source) => fetchSource(source)));
    const combined = [];
    const seenKeys = new Set();

    results.forEach((result, index) => {
      if (result.entries.length > 0) {
        loadedSources.push(SOURCES[index].label);
      }

      result.entries.forEach((entry) => {
        const key = entry.uniqueKey || entry.id;
        if (key && seenKeys.has(key)) {
          return;
        }
        if (key) {
          seenKeys.add(key);
        }
        combined.push(entry);
      });
    });

    transactions = combined.filter((entry) =>
      entry.transaction === 'purchase' || entry.transaction === 'sale'
    );

    if (!transactions.length) {
      throw new Error('No transactions were loaded from the disclosure feeds.');
    }

    transactions.sort((a, b) => {
      const dateA = a.tradeDateMs ?? a.disclosureDateMs ?? 0;
      const dateB = b.tradeDateMs ?? b.disclosureDateMs ?? 0;
      return dateB - dateA;
    });

    const MAX_TRACKED = 1500;
    if (transactions.length > MAX_TRACKED) {
      transactions = transactions.slice(0, MAX_TRACKED);
    }

    latestDisclosureMs = transactions.reduce((latest, entry) => {
      const candidate = entry.disclosureDateMs ?? entry.tradeDateMs ?? 0;
      return candidate > latest ? candidate : latest;
    }, 0);

    loadedSources = Array.from(new Set(loadedSources));

    const previousIds = new Set(previousTransactions.map((entry) => entry.id));
    const newEntries = previousTransactions.length
      ? transactions.filter((entry) => !previousIds.has(entry.id))
      : [];

    filterTransactions({ preserveStatus: silent || offlineMessageVisible });

    if (previousTransactions.length && newEntries.length) {
      handleNewTransactions(newEntries);
    }

    if (!autoRefreshTimer) {
      autoRefreshTimer = window.setInterval(() => {
        loadTransactions({ silent: true });
      }, AUTO_REFRESH_MS);
    }

    if (isInitialLoad) {
      isInitialLoad = false;
    }
  } catch (error) {
    console.error(error);
    const hasExistingData = previousTransactions.length > 0;
    if (hasExistingData) {
      transactions = previousTransactions;
      filterTransactions({ preserveStatus: true });
    }

    if (!navigator.onLine) {
      offlineMessageVisible = true;
      setStatus('You appear to be offline. Showing the most recently cached disclosures.', {
        isWarning: true,
      });
    } else {
      setStatus(
        'Unable to load the latest disclosures right now. Please refresh or try again later.',
        { isError: true }
      );
    }
  } finally {
    isLoadingTransactions = false;
  }
}

function handleNewTransactions(newEntries) {
  if (!Array.isArray(newEntries) || newEntries.length === 0) {
    return;
  }

  const latest = newEntries[0];
  const assetLabel = latest.ticker || latest.assetName || 'an asset';
  const message =
    newEntries.length === 1
      ? `${latest.representative} reported a ${latest.transactionLabel.toLowerCase()} involving ${assetLabel}.`
      : `${newEntries.length} new disclosures since your last refresh. Latest: ${latest.representative} ${latest.transactionLabel.toLowerCase()} ${assetLabel}.`;

  showAlertNote(message, 20000);
  sendNotificationForTransactions(newEntries);
}

async function sendNotificationForTransactions(newEntries) {
  if (!notificationsEnabled) {
    return;
  }

  if (!('Notification' in window) || Notification.permission !== 'granted') {
    return;
  }

  if (!('serviceWorker' in navigator)) {
    return;
  }

  if (document.visibilityState === 'visible') {
    return;
  }

  try {
    const registration = await navigator.serviceWorker.getRegistration();
    if (!registration) {
      return;
    }

    const latest = newEntries[0];
    const assetLabel = latest.ticker || latest.assetName || 'an asset';
    const title =
      newEntries.length === 1
        ? `${latest.representative} reported a ${latest.transactionLabel.toLowerCase()}`
        : `${newEntries.length} new politician trades reported`;

    const body =
      newEntries.length === 1
        ? `${assetLabel} • ${latest.tradeDateDisplay || 'Filed recently'}`
        : `Latest: ${latest.representative} ${latest.transactionLabel.toLowerCase()} ${assetLabel}`;

    await registration.showNotification(title, {
      body,
      icon: ICON_192_DATA_URL,
      badge: ICON_192_DATA_URL,
      tag: 'politician-tracker-update',
      data: { url: './' },
    });
  } catch (error) {
    console.error('Failed to deliver notification', error);
  }
}

function loadNotificationPreference() {
  try {
    notificationsEnabled = localStorage.getItem(NOTIFICATION_PREF_KEY) === 'enabled';
  } catch (error) {
    notificationsEnabled = false;
  }
}

function storeNotificationPreference(enabled) {
  notificationsEnabled = enabled;
  try {
    localStorage.setItem(NOTIFICATION_PREF_KEY, enabled ? 'enabled' : 'disabled');
  } catch (error) {
    console.warn('Unable to persist notification preference', error);
  }
}

function updateNotificationControls() {
  if (!notificationButton || !notificationStatusEl) {
    return;
  }

  if (!('Notification' in window) || !('serviceWorker' in navigator)) {
    notificationButton.hidden = true;
    notificationStatusEl.textContent =
      'Notifications require a modern browser with service worker support. Install the app in Chrome, Edge, or Firefox to enable alerts.';
    storeNotificationPreference(false);
    return;
  }

  const enableText = notificationButton.querySelector('[data-enable-text]');
  const disableText = notificationButton.querySelector('[data-disable-text]');
  const permission = Notification.permission;

  if (permission === 'denied') {
    notificationButton.hidden = true;
    notificationStatusEl.textContent =
      'Notifications are blocked in your browser settings. Update the permission to enable alerts.';
    storeNotificationPreference(false);
    return;
  }

  notificationsEnabled = notificationsEnabled && permission === 'granted';

  notificationButton.hidden = false;
  notificationButton.disabled = false;

  if (enableText && disableText) {
    enableText.hidden = notificationsEnabled;
    disableText.hidden = !notificationsEnabled;
  }

  if (notificationsEnabled) {
    notificationStatusEl.textContent =
      'Alerts enabled. Keep the app open or installed to get notified about new disclosures.';
  } else {
    notificationStatusEl.textContent =
      'Enable alerts to be notified about new disclosures while the app remains open.';
  }
}

function setupNotificationControls() {
  if (!notificationButton || !notificationStatusEl) {
    return;
  }

  loadNotificationPreference();
  updateNotificationControls();

  notificationButton.addEventListener('click', async () => {
    if (!('Notification' in window) || !('serviceWorker' in navigator)) {
      return;
    }

    if (!notificationsEnabled) {
      notificationButton.disabled = true;
      try {
        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
          storeNotificationPreference(true);
          updateNotificationControls();
          showAlertNote('Alerts enabled. We will notify you about new filings while the app is open.', 15000);
        } else {
          storeNotificationPreference(false);
          updateNotificationControls();
          notificationStatusEl.textContent =
            'Notifications stayed off. You can try again with the Enable alerts button.';
        }
      } finally {
        notificationButton.disabled = false;
      }
    } else {
      storeNotificationPreference(false);
      updateNotificationControls();
      notificationStatusEl.textContent = 'Alerts paused. Re-enable them whenever you need updates.';
    }
  });
}

function setupInstallPrompt() {
  if (!installButton) {
    return;
  }

  if (window.matchMedia('(display-mode: standalone)').matches) {
    installButton.hidden = true;
  }

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    installButton.hidden = false;
  });

  installButton.addEventListener('click', async () => {
    if (!deferredInstallPrompt) {
      installButton.hidden = true;
      return;
    }

    installButton.disabled = true;
    try {
      deferredInstallPrompt.prompt();
      await deferredInstallPrompt.userChoice;
      installButton.hidden = true;
    } catch (error) {
      console.error('Install prompt failed', error);
    } finally {
      installButton.disabled = false;
      deferredInstallPrompt = null;
    }
  });

  window.addEventListener('appinstalled', () => {
    installButton.hidden = true;
    deferredInstallPrompt = null;
    showAlertNote('App installed. Find it on your home screen for one-tap access.', 15000);
  });
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) {
    return;
  }

  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('service-worker.js')
      .then(() => {
        updateNotificationControls();
      })
      .catch((error) => {
        console.error('Service worker registration failed', error);
      });
  });
}

function updateConnectionStatus() {
  if (!navigator.onLine) {
    offlineMessageVisible = true;
    setStatus('You appear to be offline. Showing the most recently cached disclosures.', {
      isWarning: true,
    });
    return;
  }

  if (offlineMessageVisible) {
    offlineMessageVisible = false;
    if (!isLoadingTransactions && transactions.length) {
      setStatus('', { hidden: true });
    } else if (!isLoadingTransactions) {
      setStatus('Loading transactions...', { loading: true });
    }
  }
}

function monitorConnection() {
  window.addEventListener('online', () => {
    updateConnectionStatus();
    loadTransactions({ silent: true });
  });
  window.addEventListener('offline', updateConnectionStatus);
  updateConnectionStatus();
}

searchInput.addEventListener(
  'input',
  debounce(() => filterTransactions({ preserveStatus: offlineMessageVisible }), 150)
);
typeFilter.addEventListener('change', () =>
  filterTransactions({ preserveStatus: offlineMessageVisible })
);
chamberFilter.addEventListener('change', () =>
  filterTransactions({ preserveStatus: offlineMessageVisible })
);
windowFilter.addEventListener('change', () =>
  filterTransactions({ preserveStatus: offlineMessageVisible })
);

registerServiceWorker();
setupInstallPrompt();
setupNotificationControls();
monitorConnection();
loadTransactions();
