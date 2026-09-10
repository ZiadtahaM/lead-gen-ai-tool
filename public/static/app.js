// Lead Engine PRO MAX — Dashboard Frontend
// Single-page vanilla JS app. No frameworks. Talks only to /api/* (D1-backed, real data).

const state = {
  market: 'usa',
  leads: [],
  queue: [],
  stats: null,
  queueSummary: null,
  filterCategory: 'all',
  searchTerm: '',
  loading: false,
  scrapeJob: null,      // { id, status, ... } — active GitHub Actions real-scrape job
  scrapePollTimer: null,
  scrapeStartedAt: null
}

const MARKET_META = {
  ksa: { flag: '🇸🇦', label: 'KSA (Riyadh)' },
  egypt: { flag: '🇪🇬', label: 'Egypt (Cairo)' },
  usa: { flag: '🇺🇸', label: 'USA (Miami)' },
  morocco: { flag: '🇲🇦', label: 'Morocco (Casablanca)' }
}

function $(sel) { return document.querySelector(sel) }
function el(html) {
  const t = document.createElement('template')
  t.innerHTML = html.trim()
  return t.content.firstChild
}

function toast(msg, type = 'info') {
  const colors = { info: 'bg-slate-700', success: 'bg-emerald-600', error: 'bg-red-600', warn: 'bg-amber-600' }
  const node = el(`<div class="${colors[type]} text-white px-4 py-3 rounded-lg shadow-lg mb-2 text-sm max-w-sm">${msg}</div>`)
  let container = $('#toast-container')
  if (!container) {
    container = el('<div id="toast-container" class="fixed top-4 left-4 z-50 flex flex-col"></div>')
    document.body.appendChild(container)
  }
  container.appendChild(node)
  setTimeout(() => node.remove(), 6000)
}

async function api(path, opts = {}) {
  const resp = await axios({
    url: `/api${path}`,
    method: opts.method || 'GET',
    data: opts.data,
    params: opts.params
  })
  return resp.data
}

function render() {
  $('#app').innerHTML = `
    <div class="max-w-7xl mx-auto p-4 md:p-6" dir="rtl">
      ${renderHeader()}
      ${renderIgnitionPanel()}
      ${renderAuditPanel()}
      ${renderStatsCards()}
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
        <section class="lg:col-span-2">${renderLeadsPanel()}</section>
        <section>${renderQueuePanel()}</section>
      </div>
    </div>
  `
  wireEvents()
}

function renderHeader() {
  return `
    <header id="main-header" class="flex flex-wrap items-center justify-between gap-3 mb-6">
      <div>
        <h1 class="text-2xl md:text-3xl font-extrabold text-cyan-400">
          <i class="fas fa-motorcycle ml-2"></i> Lead Engine PRO MAX
        </h1>
        <p class="text-slate-400 text-sm">مولّد عملاء B2B حي + فاحص مواقع فورينزيك — بيانات حقيقية 100%، من غير تكرار</p>
      </div>
      <div class="flex gap-2 items-center">
        <span class="text-xs bg-emerald-700/40 text-emerald-300 px-3 py-1 rounded-full">
          <i class="fas fa-circle text-[8px] ml-1"></i> محرك: نشط
        </span>
        <a href="/api/leads?limit=5000" target="_blank"
           class="text-xs bg-slate-700 hover:bg-slate-600 px-3 py-2 rounded-lg transition">
          <i class="fas fa-file-export ml-1"></i> تصدير JSON
        </a>
      </div>
    </header>
  `
}

function renderIgnitionPanel() {
  const marketButtons = Object.entries(MARKET_META).map(([key, m]) => `
    <button data-market="${key}" class="market-btn ${state.market === key ? 'active' : ''} glass rounded-xl p-3 text-center hover:bg-slate-700/60 transition">
      <div class="text-2xl">${m.flag}</div>
      <div class="text-xs mt-1">${m.label}</div>
    </button>
  `).join('')

  return `
    <section id="ignition-panel" class="glass rounded-2xl p-5 mb-6">
      <h2 class="font-bold text-lg mb-3"><i class="fas fa-bolt text-amber-400 ml-2"></i> لوحة التشغيل — إشعال بحث حي</h2>
      <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4" id="market-grid">
        ${marketButtons}
      </div>
      <div class="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
        <div>
          <label class="text-xs text-slate-400">المهنة / التصنيف</label>
          <input id="input-keyword" type="text" placeholder="مثال: صيانة مكيفات"
            class="w-full mt-1 bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm" />
        </div>
        <div>
          <label class="text-xs text-slate-400">المدينة / المنطقة</label>
          <input id="input-location" type="text" placeholder="مثال: Riyadh, Saudi Arabia"
            class="w-full mt-1 bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm" />
        </div>
        <div>
          <label class="text-xs text-slate-400">عدد النتائج (حد أقصى)</label>
          <input id="input-maxresults" type="number" value="12" min="4" max="40"
            class="w-full mt-1 bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm" />
        </div>
      </div>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
        <button id="btn-ignite" class="w-full bg-slate-700 hover:bg-slate-600 text-white font-bold py-3 rounded-xl transition">
          <i class="fas fa-map-location-dot ml-2"></i> بحث سريع (OpenStreetMap)
        </button>
        <button id="btn-real-scrape" class="w-full bg-gradient-to-l from-cyan-500 to-emerald-500 hover:opacity-90 text-slate-900 font-bold py-3 rounded-xl transition" ${state.scrapeJob && state.scrapeJob.status === 'RUNNING' ? 'disabled' : ''}>
          <i class="fas fa-fire ml-2"></i> ${state.scrapeJob && state.scrapeJob.status === 'RUNNING' ? 'جاري السحب من Google Maps الحي...' : 'IGNITE REAL — جوجل مابس حقيقي (GitHub Actions)'}
        </button>
      </div>
      <p class="text-[11px] text-slate-500 mt-1">
        <i class="fas fa-circle-info ml-1"></i>
        "بحث سريع" فوري بس بيانات OpenStreetMap محدودة للمهن المحلية · "IGNITE REAL" بيشغّل متصفح حقيقي فاضي (كروميوم) على GitHub Actions يسحب من جوجل مابس فعليًا — بياخد 1-3 دقايق لكنه أدق بكتير.
      </p>
      <p id="ignite-status" class="text-xs text-slate-400 mt-2"></p>
      ${renderScrapeJobStatus()}
    </section>
  `
}

function renderScrapeJobStatus() {
  const job = state.scrapeJob
  if (!job) return ''

  const statusMap = {
    PENDING: { label: 'قيد الانتظار...', cls: 'text-slate-400', icon: 'fa-hourglass-half' },
    RUNNING: { label: 'جاري التشغيل — متصفح حقيقي شغال على GitHub Actions...', cls: 'text-cyan-300', icon: 'fa-spinner fa-spin' },
    DONE: { label: 'تم بنجاح ✅', cls: 'text-emerald-400', icon: 'fa-circle-check' },
    FAILED: { label: 'فشلت المهمة ❌', cls: 'text-red-400', icon: 'fa-circle-xmark' }
  }
  const s = statusMap[job.status] || statusMap.PENDING

  let detail = ''
  if (job.status === 'DONE') {
    detail = `<div class="text-xs mt-1 text-slate-300">
      عملاء جدد: <b class="text-emerald-400">${job.new_leads_count ?? 0}</b> ·
      مكرر تم تجاهله: <b>${job.duplicates_skipped ?? 0}</b> ·
      تم فحصهم فورينزيك: <b>${job.audited_count ?? 0}</b>
    </div>`
  } else if (job.status === 'FAILED') {
    detail = `<div class="text-xs mt-1 text-red-300">${job.error_message || 'خطأ غير معروف'}</div>`
  } else if (job.status === 'RUNNING' || job.status === 'PENDING') {
    detail = `<div class="text-xs mt-1 text-slate-400">${job.keyword || ''} · ${job.location || ''} — بياخد عادة 1-3 دقايق، الصفحة بتحدّث نفسها لوحدها.</div>`
  }

  return `
    <div id="scrape-job-box" class="mt-3 bg-slate-800/70 rounded-lg p-3 border border-slate-700">
      <div class="flex items-center justify-between">
        <span class="text-sm font-semibold ${s.cls}"><i class="fas ${s.icon} ml-1"></i> ${s.label}</span>
        <span class="text-[10px] text-slate-500">Job: ${job.id}</span>
      </div>
      ${detail}
    </div>
  `
}

function renderAuditPanel() {
  return `
    <section id="audit-panel" class="glass rounded-2xl p-5 mb-6">
      <h2 class="font-bold text-lg mb-2"><i class="fas fa-magnifying-glass-chart text-fuchsia-400 ml-2"></i> فحص فورينزيك لموقع واحد فوراً</h2>
      <p class="text-xs text-slate-400 mb-3">فحص أي موقع: SSL، سرعة، توافق موبايل، وجود زر واتساب/تليفون، أخطاء SEO</p>
      <div class="flex flex-col md:flex-row gap-2">
        <input id="input-audit-url" type="text" placeholder="https://example.com"
          class="flex-1 bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm" />
        <button id="btn-audit" class="bg-fuchsia-600 hover:bg-fuchsia-500 text-white px-5 py-2 rounded-lg font-semibold transition">
          <i class="fas fa-satellite-dish ml-1"></i> فحص الموقع
        </button>
      </div>
      <div id="audit-result" class="mt-3 text-sm"></div>
    </section>
  `
}

function renderStatsCards() {
  const s = state.stats || { total: 0, noWebsite: 0, socialOnly: 0, realWebsite: 0, whatsappReady: 0, avgWeakness: 0 }
  const cards = [
    { label: 'إجمالي العملاء المحصّلين', value: s.total, icon: 'fa-database', color: 'text-cyan-400' },
    { label: '🚨 بدون موقع (فرصة ساخنة)', value: s.noWebsite, icon: 'fa-triangle-exclamation', color: 'text-red-400' },
    { label: '📱 سوشيال ميديا فقط', value: s.socialOnly, icon: 'fa-hashtag', color: 'text-amber-400' },
    { label: '💬 جاهز واتساب بضغطة', value: s.whatsappReady, icon: 'fa-comment-dots', color: 'text-emerald-400' }
  ]
  return `
    <section id="stats-cards" class="grid grid-cols-2 md:grid-cols-4 gap-3">
      ${cards.map(c => `
        <div class="glass rounded-xl p-4 text-center">
          <i class="fas ${c.icon} ${c.color} text-xl mb-1"></i>
          <div class="text-2xl font-bold">${c.value}</div>
          <div class="text-[11px] text-slate-400 mt-1">${c.label}</div>
        </div>
      `).join('')}
    </section>
  `
}

function renderLeadsPanel() {
  const cats = [
    { key: 'all', label: 'الكل' },
    { key: 'NO_WEBSITE', label: '🚨 بدون موقع' },
    { key: 'SOCIAL_MEDIA_ONLY', label: '📱 سوشيال فقط' },
    { key: 'REAL_WEBSITE', label: '🌐 مواقع مفحوصة' }
  ]

  const filtered = state.leads.filter(l => {
    if (state.filterCategory !== 'all' && l.website_category !== state.filterCategory) return false
    if (state.searchTerm) {
      const s = state.searchTerm.toLowerCase()
      return (l.business_name || '').toLowerCase().includes(s) ||
             (l.phone_normalized || '').includes(s) ||
             (l.city || '').toLowerCase().includes(s)
    }
    return true
  })

  return `
    <div class="glass rounded-2xl p-5">
      <div class="flex items-center justify-between mb-3 flex-wrap gap-2">
        <h2 class="font-bold text-lg"><i class="fas fa-users text-cyan-400 ml-2"></i> قاعدة العملاء (${filtered.length})</h2>
        <button id="btn-enqueue-all" class="text-xs bg-cyan-700 hover:bg-cyan-600 px-3 py-2 rounded-lg transition">
          <i class="fas fa-inbox ml-1"></i> إضافة المعروض لطابور التواصل
        </button>
      </div>
      <div class="flex flex-wrap gap-2 mb-3">
        ${cats.map(c => `<button data-cat="${c.key}" class="tab-btn ${state.filterCategory === c.key ? 'active' : ''} text-xs px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700">${c.label}</button>`).join('')}
      </div>
      <input id="input-search" type="text" placeholder="بحث بالاسم، الهاتف، المدينة..." value="${state.searchTerm}"
        class="w-full mb-3 bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm" />
      <div id="leads-list" class="space-y-2 max-h-[560px] overflow-y-auto scrollbar-thin pr-1">
        ${filtered.length ? filtered.map(renderLeadCard).join('') : renderEmptyLeads()}
      </div>
    </div>
  `
}

function renderEmptyLeads() {
  return `
    <div class="text-center py-10 text-slate-500">
      <i class="fas fa-inbox text-3xl mb-2"></i>
      <p class="text-sm">لا يوجد عملاء بعد. اختر منطقة واضغط IGNITE RUN لجلب عملاء حقيقيين الآن.</p>
    </div>
  `
}

function categoryBadge(cat) {
  const map = {
    NO_WEBSITE: { label: 'بدون موقع', cls: 'badge-no-website' },
    SOCIAL_MEDIA_ONLY: { label: 'سوشيال فقط', cls: 'badge-social' },
    REAL_WEBSITE: { label: 'موقع حقيقي', cls: 'badge-real' }
  }
  const m = map[cat] || map.NO_WEBSITE
  return `<span class="${m.cls} text-white text-[10px] px-2 py-0.5 rounded-full">${m.label}</span>`
}

function renderLeadCard(l) {
  const pitch = l.pitch_script || {}
  const wa = l.whatsapp_url
  return `
    <div class="bg-slate-800/70 rounded-xl p-3 flex flex-col gap-2" data-lead-id="${l.id}">
      <div class="flex items-start justify-between gap-2">
        <div class="flex items-start gap-2">
          <input type="checkbox" class="lead-checkbox mt-1" data-id="${l.id}" />
          <div>
            <div class="font-semibold text-sm">${l.business_name}</div>
            <div class="text-[11px] text-slate-400">${l.city || ''} · ${l.category || ''} · Score: ${l.weakness_score}/100</div>
          </div>
        </div>
        ${categoryBadge(l.website_category)}
      </div>
      ${pitch.callHook ? `<div class="text-[11px] text-slate-300 bg-slate-900/60 rounded-lg p-2 line-clamp-3">${pitch.callHook}</div>` : ''}
      <div class="flex gap-2 flex-wrap">
        ${wa ? `<a href="${wa}" target="_blank" class="text-xs bg-emerald-600 hover:bg-emerald-500 px-3 py-1.5 rounded-lg"><i class="fab fa-whatsapp ml-1"></i>واتساب</a>` : '<span class="text-[10px] text-slate-500">لا يوجد هاتف</span>'}
        ${l.tel_url ? `<a href="${l.tel_url}" class="text-xs bg-slate-700 hover:bg-slate-600 px-3 py-1.5 rounded-lg"><i class="fas fa-phone ml-1"></i>اتصال</a>` : ''}
        <button class="btn-enqueue-single text-xs bg-cyan-700 hover:bg-cyan-600 px-3 py-1.5 rounded-lg" data-id="${l.id}">
          <i class="fas fa-plus ml-1"></i>طابور
        </button>
      </div>
    </div>
  `
}

function renderQueuePanel() {
  const qs = state.queueSummary?.breakdown || { QUEUED: 0, DISPATCHED: 0, REPLIED: 0, CONVERTED: 0, BOUNCED: 0 }
  return `
    <div class="glass rounded-2xl p-5">
      <h2 class="font-bold text-lg mb-3"><i class="fas fa-paper-plane text-emerald-400 ml-2"></i> طابور التواصل</h2>
      <div class="grid grid-cols-3 gap-2 mb-3 text-center text-xs">
        <div class="bg-slate-800 rounded-lg p-2"><div class="font-bold status-QUEUED">${qs.QUEUED}</div>بالطابور</div>
        <div class="bg-slate-800 rounded-lg p-2"><div class="font-bold status-DISPATCHED">${qs.DISPATCHED}</div>تم إرسال</div>
        <div class="bg-slate-800 rounded-lg p-2"><div class="font-bold status-REPLIED">${qs.REPLIED}</div>رد</div>
      </div>
      <div class="flex gap-2 mb-3">
        <button id="btn-dispatch-next" class="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white text-sm py-2 rounded-lg">
          <i class="fas fa-forward ml-1"></i> التالي بالطابور
        </button>
        <button id="btn-clear-queue" class="bg-red-700/70 hover:bg-red-600 text-white text-sm px-3 py-2 rounded-lg">
          <i class="fas fa-trash"></i>
        </button>
      </div>
      <div id="queue-list" class="space-y-2 max-h-[440px] overflow-y-auto scrollbar-thin pr-1">
        ${state.queue.length ? state.queue.map(renderQueueItem).join('') : '<p class="text-xs text-slate-500 text-center py-6">الطابور فاضي. أضف عملاء من القائمة اليسار.</p>'}
      </div>
    </div>
  `
}

function renderQueueItem(q) {
  const pitch = q.pitch_script || {}
  const wa = q.phone ? `https://wa.me/${q.phone.replace(/\D/g, '')}?text=${encodeURIComponent(pitch.whatsappMessage || '')}` : ''
  return `
    <div class="bg-slate-800/70 rounded-lg p-2.5 text-xs">
      <div class="flex justify-between items-center mb-1">
        <span class="font-semibold status-${q.status}">${q.status}</span>
        <span class="text-slate-400">${q.city || ''}</span>
      </div>
      <div class="font-medium mb-1">${q.business_name}</div>
      <div class="flex gap-1.5 flex-wrap">
        ${wa ? `<a href="${wa}" target="_blank" class="bg-emerald-700 hover:bg-emerald-600 px-2 py-1 rounded">واتساب</a>` : ''}
        <button class="btn-mark-replied bg-slate-700 hover:bg-slate-600 px-2 py-1 rounded" data-id="${q.id}">تم الرد</button>
      </div>
    </div>
  `
}

async function refreshAll() {
  try {
    const [leadsRes, statsRes, queueRes, summaryRes] = await Promise.all([
      api('/leads', { params: { limit: 500 } }),
      api('/stats'),
      api('/outreach/queue'),
      api('/outreach/summary')
    ])
    state.leads = leadsRes.leads
    state.stats = statsRes.stats
    state.queue = queueRes.queue
    state.queueSummary = summaryRes.summary
    render()
  } catch (err) {
    console.error(err)
    toast('فشل تحميل البيانات من الخادم', 'error')
  }
}

function wireEvents() {
  document.querySelectorAll('.market-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      state.market = btn.dataset.market
      render()
    })
  })

  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      state.filterCategory = btn.dataset.cat
      render()
    })
  })

  const searchInput = $('#input-search')
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      state.searchTerm = e.target.value
      const list = $('#leads-list')
      const filtered = state.leads.filter(l => {
        if (state.filterCategory !== 'all' && l.website_category !== state.filterCategory) return false
        const s = state.searchTerm.toLowerCase()
        if (!s) return true
        return (l.business_name || '').toLowerCase().includes(s) ||
               (l.phone_normalized || '').includes(s) ||
               (l.city || '').toLowerCase().includes(s)
      })
      list.innerHTML = filtered.length ? filtered.map(renderLeadCard).join('') : renderEmptyLeads()
    })
  }

  $('#btn-ignite')?.addEventListener('click', onIgnite)
  $('#btn-real-scrape')?.addEventListener('click', onRealScrape)
  $('#btn-audit')?.addEventListener('click', onAuditSingle)
  $('#btn-dispatch-next')?.addEventListener('click', onDispatchNext)
  $('#btn-clear-queue')?.addEventListener('click', onClearQueue)
  $('#btn-enqueue-all')?.addEventListener('click', () => onEnqueue(null))

  document.querySelectorAll('.btn-enqueue-single').forEach(btn => {
    btn.addEventListener('click', () => onEnqueue([btn.dataset.id]))
  })

  document.querySelectorAll('.btn-mark-replied').forEach(btn => {
    btn.addEventListener('click', () => onMarkReplied(btn.dataset.id))
  })
}

async function onIgnite() {
  const btn = $('#btn-ignite')
  const statusEl = $('#ignite-status')
  const keyword = $('#input-keyword').value.trim()
  const location = $('#input-location').value.trim()
  const maxResults = parseInt($('#input-maxresults').value, 10) || 12

  btn.disabled = true
  btn.innerHTML = '<i class="fas fa-spinner fa-spin ml-2"></i> جاري البحث الحي والفحص...'
  statusEl.textContent = 'يتم الآن التواصل مع OpenStreetMap وفحص المواقع فورينزيك — قد يستغرق 10-30 ثانية...'

  try {
    const res = await api('/ignite', { method: 'POST', data: { market: state.market, keyword, location, maxResults } })
    if (res.success) {
      toast(res.message, res.newLeadsCount > 0 ? 'success' : 'warn')
      statusEl.textContent = `✅ ${res.message} (منطقة: ${res.geocodedAs || location})`
      await refreshAll()
    } else {
      toast(res.message, 'error')
      statusEl.textContent = `❌ ${res.message}`
    }
  } catch (err) {
    toast('حدث خطأ في الاتصال بالمحرك', 'error')
    statusEl.textContent = 'خطأ في التنفيذ.'
  } finally {
    btn.disabled = false
    btn.innerHTML = '<i class="fas fa-fire ml-2"></i> IGNITE RUN — جلب عملاء جدد حقيقيين الآن'
  }
}

async function onRealScrape() {
  const keyword = $('#input-keyword').value.trim()
  const location = $('#input-location').value.trim()
  const maxResults = parseInt($('#input-maxresults').value, 10) || 12
  const statusEl = $('#ignite-status')

  if (state.scrapeJob && (state.scrapeJob.status === 'RUNNING' || state.scrapeJob.status === 'PENDING')) {
    toast('في مهمة سحب حقيقي شغالة فعلاً — استنى تخلص', 'warn')
    return
  }

  try {
    const res = await api('/scrape/dispatch', {
      method: 'POST',
      data: { market: state.market, keyword, location, maxResults }
    })

    if (!res.success) {
      // Most common case: GitHub not connected yet (501)
      toast(res.message, 'error')
      statusEl.textContent = `❌ ${res.message}`
      return
    }

    toast(res.message, 'success')
    state.scrapeJob = { id: res.jobId, status: 'RUNNING', keyword, location }
    state.scrapeStartedAt = Date.now()
    render()
    startScrapePolling(res.jobId)
  } catch (err) {
    toast('فشل الاتصال بمحرك السحب الحقيقي', 'error')
  }
}

function startScrapePolling(jobId) {
  if (state.scrapePollTimer) clearInterval(state.scrapePollTimer)

  state.scrapePollTimer = setInterval(async () => {
    try {
      const res = await api(`/scrape/status/${jobId}`)
      if (!res.success) return

      state.scrapeJob = res.job

      // Only re-render the job status box in place to avoid disrupting other UI state
      const box = $('#scrape-job-box')
      if (box) {
        box.outerHTML = renderScrapeJobStatus()
      }

      if (res.job.status === 'DONE') {
        clearInterval(state.scrapePollTimer)
        state.scrapePollTimer = null
        toast(`✅ السحب الحقيقي خلص! عملاء جدد: ${res.job.new_leads_count ?? 0}`, 'success')
        await refreshAll()
      } else if (res.job.status === 'FAILED') {
        clearInterval(state.scrapePollTimer)
        state.scrapePollTimer = null
        toast(`❌ فشلت مهمة السحب: ${res.job.error_message || ''}`, 'error')
        render()
      } else {
        // Safety timeout: if running for more than 6 minutes, stop polling
        if (state.scrapeStartedAt && Date.now() - state.scrapeStartedAt > 6 * 60 * 1000) {
          clearInterval(state.scrapePollTimer)
          state.scrapePollTimer = null
          toast('المهمة طولت أكتر من المتوقع — تحقق من GitHub Actions يدويًا', 'warn')
        }
      }
    } catch (err) {
      console.error('poll error', err)
    }
  }, 4000)
}

async function onAuditSingle() {
  const url = $('#input-audit-url').value.trim()
  const resultEl = $('#audit-result')
  if (!url) { toast('اكتب رابط الموقع أولاً', 'warn'); return }

  resultEl.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري الفحص...'
  try {
    const res = await api('/audit-single', { method: 'POST', data: { url, market: state.market } })
    if (res.success) {
      const r = res.report
      resultEl.innerHTML = `
        <div class="bg-slate-800/70 rounded-lg p-3">
          <div class="flex justify-between mb-2">
            <span>${r.isOnline ? '🟢 متصل' : '🔴 غير متصل'} — HTTP ${r.httpStatusCode}</span>
            <span>سرعة: ${r.responseTimeMs}ms</span>
          </div>
          <div class="mb-2">نقاط الضعف: <b class="text-red-400">${r.weaknessScore}/100</b></div>
          <ul class="text-xs list-disc pr-4 space-y-1 mb-2">
            ${r.diagnosisBulletPoints.map(d => `<li>${d}</li>`).join('')}
          </ul>
          <p class="text-xs italic text-cyan-300">"${r.pitchHookText}"</p>
        </div>
      `
    } else {
      resultEl.innerHTML = `<p class="text-red-400 text-xs">${res.message}</p>`
    }
  } catch (err) {
    resultEl.innerHTML = `<p class="text-red-400 text-xs">فشل الفحص</p>`
  }
}

async function onEnqueue(ids) {
  let leadIds = ids
  if (!leadIds) {
    leadIds = Array.from(document.querySelectorAll('.lead-checkbox:checked')).map(cb => cb.dataset.id)
    if (!leadIds.length) leadIds = state.leads.map(l => l.id) // enqueue all visible if none checked
  }
  try {
    const res = await api('/outreach/enqueue', { method: 'POST', data: { leadIds } })
    toast(`تمت إضافة ${res.added} عميل لطابور التواصل`, 'success')
    await refreshAll()
  } catch (err) {
    toast('فشل الإضافة للطابور', 'error')
  }
}

async function onDispatchNext() {
  try {
    const res = await api('/outreach/dispatch-next', { method: 'POST' })
    if (res.success) {
      toast(`تم إرسال: ${res.item.business_name}`, 'success')
    } else {
      toast(res.message || 'الطابور فاضي', 'warn')
    }
    await refreshAll()
  } catch (err) {
    toast('فشل التنفيذ', 'error')
  }
}

async function onClearQueue() {
  if (!confirm('مسح كل الطابور؟')) return
  await api('/outreach/clear', { method: 'POST' })
  toast('تم مسح الطابور', 'success')
  await refreshAll()
}

async function onMarkReplied(id) {
  await api('/outreach/status', { method: 'POST', data: { id, status: 'REPLIED' } })
  toast('تم التحديث لـ "رد العميل"', 'success')
  await refreshAll()
}

async function resumeActiveScrapeJobIfAny() {
  try {
    const res = await api('/scrape/recent')
    const jobs = res.jobs || []
    const active = jobs.find(j => j.status === 'RUNNING' || j.status === 'PENDING')
    if (active) {
      state.scrapeJob = active
      state.scrapeStartedAt = Date.now()
      render()
      startScrapePolling(active.id)
    }
  } catch (err) {
    // /api/scrape/recent may not exist yet or GitHub not configured — ignore silently
  }
}

// Initial boot
render()
refreshAll()
resumeActiveScrapeJobIfAny()
