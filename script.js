// Subtrack — plain JavaScript, organized so calculations can be understood
// independently from the code that reads or changes the page.

const STORAGE_KEY = 'subtrack-subscriptions-v1';
const THEME_KEY = 'subtrack-theme-v1';
const DAY_IN_MS = 24 * 60 * 60 * 1000;
const CURRENCY = 'INR'; // change to 'INR' etc.; the form's currency symbol follows automatically
const CATEGORY_COLORS = {
  Entertainment: ['#efe9fa', '#7655a8'], Work: ['#e4eefb', '#4f79ab'],
  Music: ['#fce8ed', '#aa5470'], 'Cloud storage': ['#e4f0ee', '#4d8175'],
  Fitness: ['#f9eee1', '#ad7544'], Learning: ['#f8f1d9', '#917b31'], Other: ['#edf0eb', '#65715f']
};

// These small pure functions only use their inputs and return a result.
// Keeping them separate makes the billing rules easy to inspect and reuse.
function monthlyCost(amount, cycle) {
  const perMonth = { weekly: amount * 52 / 12, monthly: amount, yearly: amount / 12 };
  return perMonth[cycle] ?? amount;
}

function daysSince(dateString, now = new Date()) {
  const usedDate = new Date(`${dateString}T00:00:00`);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((today - usedDate) / DAY_IN_MS); // round, not floor: DST days are 23/25 hours long
}

function isUnused(subscription, now = new Date()) {
  return daysSince(subscription.lastUsed, now) >= 30;
}

function currency(value) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: CURRENCY }).format(value);
}

function localDateInputValue(date = new Date()) {
  // ISO formatting is UTC; build the input value from local date parts instead.
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function totals(subscriptions) {
  const monthly = subscriptions.reduce((sum, item) => sum + monthlyCost(item.amount, item.cycle), 0);
  return { monthly, yearly: monthly * 12 };
}

function categoryInsights(subscriptions) {
  const spend = subscriptions.reduce((groups, item) => {
    groups[item.category] = (groups[item.category] || 0) + monthlyCost(item.amount, item.cycle);
    return groups;
  }, {});
  return Object.entries(spend).sort((a, b) => b[1] - a[1]);
}

function findOverlaps(subscriptions) {
  const groups = subscriptions.reduce((map, item) => {
    if (item.category === 'Other') return map; // "Other" isn't a real category to overlap in
    map[item.category] = (map[item.category] || 0) + 1;
    return map;
  }, {});
  return Object.entries(groups).filter(([, count]) => count > 1).sort((a, b) => b[1] - a[1]);
}

// DOM references are collected once; the rest of the app uses these names.
const form = document.querySelector('#subscription-form');
const list = document.querySelector('#subscription-list');
const emptyState = document.querySelector('#empty-state');
const alerts = document.querySelector('#alerts');
const insights = document.querySelector('#insights');
const formError = document.querySelector('#form-error');
const themeButton = document.querySelector('#theme-toggle');
let sortByCost = false;

// Keep the form's currency symbol in sync with the formatter.
document.querySelector('.money-input span').textContent =
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: CURRENCY }).formatToParts(0).find(p => p.type === 'currency').value;

function loadSubscriptions() {
  // localStorage stores text, so JSON.parse turns the saved text back into data.
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}

let subscriptions = loadSubscriptions();

function saveSubscriptions() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(subscriptions));
  } catch {
    // Storage can be blocked or full; keep the app working for this session.
  }
}

function render() {
  const ordered = [...subscriptions];
  if (sortByCost) ordered.sort((a, b) => monthlyCost(b.amount, b.cycle) - monthlyCost(a.amount, a.cycle));

  const { monthly, yearly } = totals(subscriptions);
  document.querySelector('#monthly-total').textContent = currency(monthly);
  document.querySelector('#yearly-total').textContent = currency(yearly);
  document.querySelector('#service-count').textContent = subscriptions.length;
  document.querySelector('#list-count').textContent = subscriptions.length;
  list.replaceChildren(...ordered.map(makeSubscriptionRow));
  emptyState.classList.toggle('visible', subscriptions.length === 0);
  renderAlerts();
  renderInsights();
}

function makeSubscriptionRow(item) {
  const row = document.createElement('article');
  row.className = 'subscription-row';
  const service = document.createElement('div');
  service.className = 'service';
  const icon = document.createElement('span');
  icon.className = 'service-icon';
  const [bg, fg] = CATEGORY_COLORS[item.category] || CATEGORY_COLORS.Other;
  icon.style.setProperty('--icon-bg', bg);
  icon.style.setProperty('--icon-color', fg);
  icon.textContent = item.name.trim().slice(0, 1).toUpperCase();
  icon.setAttribute('aria-hidden', 'true');
  const nameWrap = document.createElement('div');
  const name = document.createElement('div');
  name.className = 'service-name';
  name.textContent = item.name;
  const category = document.createElement('div');
  category.className = 'service-category';
  category.textContent = item.category;
  nameWrap.append(name, category);
  service.append(icon, nameWrap);

  const price = document.createElement('div');
  price.className = 'price';
  const priceMain = document.createElement('div');
  priceMain.className = 'price-main';
  priceMain.textContent = currency(item.amount);
  const priceSub = document.createElement('div');
  priceSub.className = 'price-sub';
  priceSub.textContent = `${item.cycle} · ${currency(monthlyCost(item.amount, item.cycle))}/mo`;
  price.append(priceMain, priceSub);

  const usage = document.createElement('span');
  const unused = isUnused(item);
  usage.className = `usage-pill${unused ? ' unused' : ''}`;
  usage.textContent = unused ? `${daysSince(item.lastUsed)}d unused` : `Used ${daysSince(item.lastUsed)}d ago`;

  const remove = document.createElement('button');
  remove.className = 'delete-button';
  remove.type = 'button';
  remove.textContent = '×';
  remove.setAttribute('aria-label', `Delete ${item.name}`);
  remove.addEventListener('click', () => {
    subscriptions = subscriptions.filter(subscription => subscription.id !== item.id);
    saveSubscriptions();
    render();
  });
  row.append(service, price, usage, remove);
  return row;
}

function renderAlerts() {
  const neglected = subscriptions.filter(isUnused);
  alerts.replaceChildren();
  if (!neglected.length) return;
  const banner = document.createElement('div');
  banner.className = 'alert-banner';
  const names = neglected.map(item => item.name).join(', ');
  banner.textContent = `◷  ${neglected.length} ${neglected.length === 1 ? 'subscription has' : 'subscriptions have'} gone unused for 30+ days: ${names}.`;
  alerts.append(banner);
}

function renderInsights() {
  insights.replaceChildren();
  if (!subscriptions.length) {
    const message = document.createElement('p');
    message.className = 'muted';
    message.textContent = 'Add subscriptions to uncover patterns in your spending.';
    insights.append(message);
    return;
  }
  const categories = categoryInsights(subscriptions);
  const overlaps = findOverlaps(subscriptions);
  if (categories.length) {
    const biggest = categories[0];
    addInsight(`Your biggest category is ${biggest[0]}.`, currency(biggest[1]) + '/mo');
  }
  if (overlaps.length) {
    const [category, count] = overlaps[0];
    addInsight(`${count} subscriptions in ${category}. Could there be overlap?`, `${count} services`);
  } else {
    addInsight('No repeated categories yet. Your spending is spread out.');
  }
  const neglected = subscriptions.filter(isUnused);
  if (neglected.length) addInsight(`${neglected.length} ${neglected.length === 1 ? 'service has' : 'services have'} not been used in 30+ days.`, 'Worth a look');
}

function addInsight(message, value = '') {
  const item = document.createElement('div');
  item.className = 'insight-item';
  const text = document.createElement('strong');
  text.textContent = message;
  item.append(text);
  if (value) {
    const amount = document.createElement('span');
    amount.className = 'insight-value';
    amount.textContent = value;
    item.append(amount);
  }
  insights.append(item);
}

form.addEventListener('submit', event => {
  event.preventDefault(); // Prevent the browser's default page reload on form submission.
  formError.textContent = '';
  const data = new FormData(form);
  const name = String(data.get('name')).trim();
  const amount = Number(data.get('amount'));
  const lastUsed = String(data.get('lastUsed'));
  if (!name || !Number.isFinite(amount) || amount <= 0 || !lastUsed || Number.isNaN(daysSince(lastUsed))) {
    formError.textContent = 'Enter a service name, a positive amount, and a last-used date.';
    return;
  }
  if (daysSince(lastUsed) < 0) {
    formError.textContent = 'The last-used date can’t be in the future.';
    return;
  }
  subscriptions.push({
    id: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    name, amount, cycle: String(data.get('cycle')), category: String(data.get('category')), lastUsed
  });
  saveSubscriptions();
  form.reset();
  document.querySelector('#last-used').value = localDateInputValue();
  document.querySelector('#name').focus();
  render();
});

document.querySelector('#sort-button').addEventListener('click', event => {
  sortByCost = !sortByCost;
  event.currentTarget.innerHTML = sortByCost ? 'Cost: high to low <span aria-hidden="true">↓</span>' : 'Sort by cost <span aria-hidden="true">↕</span>';
  render();
});

function setTheme(theme) {
  const dark = theme === 'dark';
  document.body.classList.toggle('dark', dark);
  themeButton.setAttribute('aria-label', `Switch to ${dark ? 'light' : 'dark'} theme`);
  themeButton.innerHTML = `<span aria-hidden="true" class="theme-icon">${dark ? '☀' : '☾'}</span><span class="theme-label">${dark ? 'Light mode' : 'Dark mode'}</span>`;
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light'; // scrollbars/form controls follow the theme
  try { localStorage.setItem(THEME_KEY, theme); } catch { /* storage unavailable */ }
}

themeButton.addEventListener('click', () => setTheme(document.body.classList.contains('dark') ? 'light' : 'dark'));
let savedTheme = null;
try { savedTheme = localStorage.getItem(THEME_KEY); } catch { /* storage unavailable */ }
if (savedTheme === 'dark') setTheme('dark');
document.querySelector('#last-used').value = localDateInputValue();
render();
