// Multi-Regional Market Configuration & Psychographic Outreach Engine
// Ported 1:1 from the original Python core/enricher.py — same dialects, same psychology.

export type Market = 'ksa' | 'egypt' | 'usa' | 'morocco'
export type WebsiteCategory = 'NO_WEBSITE' | 'SOCIAL_MEDIA_ONLY' | 'REAL_WEBSITE'

export interface MarketConfig {
  country: string
  currency: string
  phoneCode: string
  defaultCities: string[]
  primaryChannel: string
  flag: string
  label: string
  defaultKeyword: string
  defaultLocation: string
  nominatimLang: string
}

export const MARKET_CONFIGS: Record<Market, MarketConfig> = {
  ksa: {
    country: 'Saudi Arabia',
    currency: 'SAR',
    phoneCode: '+966',
    defaultCities: ['Riyadh', 'Jeddah', 'Dammam', 'Khobar'],
    primaryChannel: 'WhatsApp & Call',
    flag: '🇸🇦',
    label: 'KSA (Riyadh)',
    defaultKeyword: 'صيانة مكيفات',
    defaultLocation: 'Riyadh, Saudi Arabia',
    nominatimLang: 'ar'
  },
  egypt: {
    country: 'Egypt',
    currency: 'EGP',
    phoneCode: '+20',
    defaultCities: ['Cairo', 'Giza', 'Alexandria', 'Mansoura'],
    primaryChannel: 'Direct Call & WhatsApp',
    flag: '🇪🇬',
    label: 'Egypt (Cairo)',
    defaultKeyword: 'صيانة أجهزة منزلية',
    defaultLocation: 'Cairo, Egypt',
    nominatimLang: 'ar'
  },
  usa: {
    country: 'USA',
    currency: 'USD',
    phoneCode: '+1',
    defaultCities: ['Miami', 'Houston', 'Dallas', 'Phoenix', 'Atlanta'],
    primaryChannel: 'Cold Email, SMS & Call',
    flag: '🇺🇸',
    label: 'USA (Miami)',
    defaultKeyword: 'Plumber',
    defaultLocation: 'Miami, FL, USA',
    nominatimLang: 'en'
  },
  morocco: {
    country: 'Morocco',
    currency: 'MAD',
    phoneCode: '+212',
    defaultCities: ['Casablanca', 'Rabat', 'Marrakech', 'Tanger'],
    primaryChannel: 'WhatsApp & Direct Call',
    flag: '🇲🇦',
    label: 'Morocco (Casablanca)',
    defaultKeyword: 'Plombier',
    defaultLocation: 'Casablanca, Morocco',
    nominatimLang: 'fr'
  }
}

export function detectMarket(location: string, country = ''): Market {
  const loc = ` ${location} ${country} `.toLowerCase()
  if (['usa', 'united states', 'america', 'miami', 'florida', 'texas', 'california', 'new york', 'houston', 'dallas'].some(c => loc.includes(c))) return 'usa'
  if (['egypt', 'cairo', 'giza', 'alexandria', 'mansoura', 'nasr city', 'tagamoa', 'masr', 'مصر', 'القاهرة'].some(c => loc.includes(c))) return 'egypt'
  if (['ksa', 'saudi', 'riyadh', 'jeddah', 'dammam', 'khobar', 'mecca', 'medina', 'السعودية', 'الرياض'].some(c => loc.includes(c))) return 'ksa'
  if (['morocco', 'maroc', 'casablanca', 'rabat', 'marrakech', 'tanger', 'fes', 'agadir', 'casa', 'المغرب'].some(c => loc.includes(c))) return 'morocco'
  return 'morocco'
}

// Strict phone normalizer -> E.164 for KSA, Egypt, USA, Morocco
export function normalizePhone(phoneRaw: string, market: Market = 'morocco'): string {
  if (!phoneRaw) return ''
  const cleaned = phoneRaw.trim().replace(/[^\d+]/g, '')
  if (!cleaned) return ''

  if (market === 'ksa') {
    if (cleaned.startsWith('05') && cleaned.length === 10) return `+966${cleaned.slice(1)}`
    if (cleaned.startsWith('5') && cleaned.length === 9) return `+966${cleaned}`
    if (cleaned.startsWith('966') && !cleaned.startsWith('+')) return `+${cleaned}`
    if (cleaned.startsWith('+966')) return cleaned
  } else if (market === 'egypt') {
    if (cleaned.startsWith('01') && cleaned.length === 11) return `+20${cleaned.slice(1)}`
    if (cleaned.startsWith('1') && cleaned.length === 10) return `+20${cleaned}`
    if (cleaned.startsWith('20') && !cleaned.startsWith('+')) return `+${cleaned}`
    if (cleaned.startsWith('+20')) return cleaned
  } else if (market === 'usa') {
    const digits = cleaned.replace(/\D/g, '')
    if (digits.length === 10) return `+1${digits}`
    if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`
    if (cleaned.startsWith('+1')) return cleaned
  } else if (market === 'morocco') {
    if (cleaned.startsWith('0') && cleaned.length === 10) return `+212${cleaned.slice(1)}`
    if (cleaned.startsWith('212') && !cleaned.startsWith('+')) return `+${cleaned}`
    if (!cleaned.startsWith('+') && cleaned.length === 9 && ['6', '7', '5'].includes(cleaned[0])) return `+212${cleaned}`
    if (cleaned.startsWith('+212')) return cleaned
  }

  if (!cleaned.startsWith('+')) return `+${cleaned}`
  return cleaned
}

export interface AuditReportLike {
  responseTimeMs?: number
  diagnosisBulletPoints?: string[]
  pitchHookText?: string
}

export interface PitchScript {
  whatsappMessage: string
  callHook: string
  emailSubject: string
  emailBody: string
  offerSummary: string
  market: Market
}

// Generates deeply psychological, culturally-calibrated outreach scripts.
// Applies Value Equation + Loss Aversion + Zero-Risk Framing per market dialect.
export function generatePitches(
  businessName: string,
  category: string,
  city: string,
  websiteCategory: WebsiteCategory,
  auditReport: AuditReportLike | null,
  market: Market = 'morocco'
): PitchScript {
  const audit = auditReport || {}
  const issues = audit.diagnosisBulletPoints || []
  const issuesSummary = issues.length ? ' • ' + issues.slice(0, 2).join('\n • ') : ''
  const respTime = audit.responseTimeMs ? `${(audit.responseTimeMs / 1000).toFixed(1)}s` : '4.2s'

  const name = businessName.trim()
  const cat = category.trim()
  const ct = city.trim()

  let waMsg = '', callHook = '', offerDetail = ''

  if (market === 'ksa') {
    if (websiteCategory === 'NO_WEBSITE') {
      waMsg = `حياك الله يا غالي في ${name} 🇸🇦\nمعك م. عادل، باحث في تسويق الخدمات المحلية في ${ct}.\nلاحظت عندكم تقييمات ممتازة على قوقل ماب، ولكن للأسف ما عندكم رابط موقع رسمي أو صفحة هبوط موثقة.\n\n📌 النتيجة: الزبون السعودي حالياً يبحث عن مصداقية وحجز فوري في ثواني، وأغلب الطلبات الكبيرة تروح للمنافسين اللي عندهم صفحات مرتبة برابط واتساب سريع.\n\n🎁 سويت لكم نموذج عملي وتصميم أولي خاص بـ ${name} مع زر حجز فوري بالواتساب.\nهل يناسبك أرسل لك رابط المعاينة السريع الآن تشوفه بنفسك؟ (بدون أي التزام)`
      callHook = `يا هلا والله فيك أخوي، معك م. عادل بخصوص نشاط ${name} في ${ct}. شفت ملفكم في قوقل ماب ما شاء الله، بس لاحظت إن ما عندكم موقع يربط مع الواتساب، وهذا يضيع عليكم يومياً عملاء يبحثون عن ${cat}. سويت لكم تصميم جاهز كهدية تجريبية، دقيقة واحدة من وقتك أرسل لك رابطه بالواتساب؟`
      offerDetail = 'تصميم صفحة هبوط سريعة متوافقة مع جوالات آيفون + حجز واتساب فوري + ربط إحصائيات قوقل.'
    } else if (websiteCategory === 'SOCIAL_MEDIA_ONLY') {
      waMsg = `أهلاً وسهلاً ${name}، تبارك الرحمن على حسابكم.\nلاحظت في قوقل ماب إنكم حاطين رابط إنستقرام/تيك توك بدل الموقع الإلكتروني الرسمي.\n\n💡 الدراسات تثبت إن 68% من العملاء في السعودية إذا دخلوا من قوقل ماب وفتح لهم إنستقرام يتشتتون ويطلعون قبل ما يطلبون الخدمة.\nجهزت لكم فكرة صفحة هبوط فخمة وسريعة تجمع خدماتكم مع زر طلب مباشر بضغطة زر.\nتحب أرسل لك البروفايل التجريبي تشوفه؟`
      callHook = `مرحبا أخوي بخصوص ${name}، شفت إن رابطكم بقوقل ماب يفتح سوشيال ميديا. هذا يضيع عليكم اتصالات مباشرة من عملاء محتاجين ${cat} الآن في ${ct}. سويت لكم فكرة حل فوري.`
      offerDetail = 'تحويل زوار قوقل ماب إلى عملاء متصلين مباشرة بدلاً من تشتيتهم بالسوشيال ميديا.'
    } else {
      waMsg = `السلام عليكم إدارة ${name}، تحياتي لكم.\nدخلت على موقعكم الرسمي عبر قوقل ماب في ${ct} وسويت له فحص فني سريع، وبان لي 3 نقاط حرجة تسبب هبوط المبيعات:\n${issuesSummary || ` • الموقع بطيء يستغرق ${respTime} ويفتقر للتجاوب مع شاشات الجوال`}\n\n🛑 أكثر من 50% من الزوار يغلقون الموقع قبل ما يشوفون رقم الاتصال بسبب هذي المشاكل.\nأعددت لكم تقرير فني مجاني مع فيديو دقيقتين يوضح كيف نصلح هذي الثغرات ونضاعف الاتصالات.\nهل أرسله لكم هنا؟`
      callHook = `السلام عليكم، أكلم المسؤول عن ${name}؟ معك مستشار تسريع وتطوير مواقع. فحصنا موقعكم ولقينا بطء كبير يعطل طلبات العملاء في ${ct}. معنا تقرير فني جاهز حابب أشاركه معكم.`
      offerDetail = 'إصلاح سرعة التحميل + إضافة زر واتساب عائم + تصحيح أخطاء العرض على أجهزة الجوال.'
    }
  } else if (market === 'egypt') {
    if (websiteCategory === 'NO_WEBSITE') {
      waMsg = `مساء الخير يا باشا، معاك بخصوص شغل ${name} كـ ${cat} في ${ct}.\nأنا شفت بروفايلكم على جوجل ماب ولقيت شغلكم ممتاز، بس في مشكلة واضحة بتخسركوا زباين كل يوم:\n⚠️ مفيش أي موقع رسمي أو صفحة حجز مربوطة بالبروفايل، وأغلب الناس اللي بتدور على جوجل بتدخل على المنافس اللي عامل صفحة احترافية.\n\nأنا مش بايع كلام وخلاص.. أنا جهزتلك نموذج عملي (Maquette) مجاني تماماً لصفحة سريعة باسمك عليها زرار اتصال وواتساب فوري بضغطة واحدة.\nمش هتدفع مليم إلا لما تشوفه وتجربه ويعجبك ويجيبلك شغل. أبعتلك اللينك تتفرج عليه؟`
      callHook = `ألو السلام عليكم يا باشا، بتكلم مع صاحب ${name}؟ شفت تقييماتكم الحلوة على جوجل ماب، بس زعلت إن مفيش موقع للمكان يخلي الزبون يحجز معاك فوري بدل ما يروح لغيرك في ${ct}. أنا صممتلك نموذج تجريبي فري جاهز، فاضي دقيقتين أبعتهولك على الواتساب؟`
      offerDetail = 'صفحة هبوط بضغطة زر للاتصال والواتساب مع ربط بجوجل ماب لزيادة المكالمات بدون أي تكلفة مقدمة.'
    } else if (websiteCategory === 'SOCIAL_MEDIA_ONLY') {
      waMsg = `السلام عليكم يا فندم، تحياتي لفريق ${name}.\nشفت إنكم حاطين صفحة الفيسبوك على جوجل ماب.. المشكلة إن الزبون المستعجل اللي عايز ${cat} دلوقتي مش هيقعد يدور في بوستات الفيسبوك، بيقفل ويدور على حد يتصل بيه دايماً.\n\nعملنالك صفحة هبوط سريعة جداً وخفيفة على الباقة، بتعرض خدماتكم ورقم التليفون وزرار الواتساب فوراً.\nأبعتلك المعاينة المجانية تشوفها يا باشا؟`
      callHook = `يا فندم الزبون اللي جاي من جوجل ماب بيدور على سرعة ورقم يكلمه فوراً، رابط الفيسبوك بيضيع منك 60% من الشغل. عملنالك صفحة مخصصة سريعة جداً.`
      offerDetail = 'تحويل زوار البحث المستعجلين لمكالمات مباشرة بدل الاعتماد على الفيسبوك فقط.'
    } else {
      waMsg = `مساء الخير يا فندم بخصوص موقع ${name} على جوجل ماب في ${ct}.\nعملت فحص فني سريع لموقعكم، وللأسف في عيوب بتخلي جوجل ينزل ترتيبكم والزباين تقفل:\n${issuesSummary || ` • الموقع بطيء جداً (${respTime}) ومش مظبوط على الموبايل`}\n\nكل ثانية تأخير بتخسرك 20% من المتصلين. جهزتلك حل لإصلاح المشاكل دي وتزويد اتصالات الشغل.\nأبعت لحضرتك التقرير المجاني تشوفه؟`
      callHook = `السلام عليكم، موقعكم فيه مشكلة بطء وعرض على الموبايل بتخلي الناس تخرج وتتصل بالمنافس. متاح دقيقة أبعتلك تقرير الفحص المجاني؟`
      offerDetail = 'تسريع تحميل الموقع + إصلاح العرض على الموبايل + زرار اتصال عائم لزيادة الحجوزات اليومية.'
    }
  } else if (market === 'usa') {
    if (websiteCategory === 'NO_WEBSITE') {
      waMsg = `Hey ${name} team,\nCame across your Google Business Profile for ${cat} in ${ct}.\nYou have great customer reviews, but I noticed you don't have an official website linked.\n\n📉 The Problem: Over 76% of high-ticket homeowners in ${ct} skip listings without a dedicated site and book with competitors who offer instant booking.\n\n🛠️ What I did: I built a fast, mobile-first landing page demo specifically for ${name} with 1-click call and SMS booking.\nZero obligation—can I text/email you the 15-second preview link?`
      callHook = `Hi ${name}, quick call regarding your Google Maps listing in ${ct}. You're ranking well, but without a dedicated site, you're bleeding high-margin emergency jobs to competitors. I already put together a mobile preview for your company—do you have 60 seconds to take a look?`
      offerDetail = 'High-converting 1-page mobile funnel with direct Click-to-Call, SMS dispatcher, and local SEO schema.'
    } else if (websiteCategory === 'SOCIAL_MEDIA_ONLY') {
      waMsg = `Hey ${name},\nSaw your Google Business profile directs visitors to a social media page rather than a dedicated site.\n\nData shows driving Google search traffic to Facebook/Instagram drops conversion by over 55% because desktop/mobile users get hit with login prompts instead of a phone number.\n\nWe created a clean 1-page conversion funnel that turns those map clicks directly into inbound calls.\nWould you be open to a 2-minute preview link?`
      callHook = `Hi ${name}, did you know linking Facebook on your Google profile causes users to bounce when prompted to log in? We built a fast landing page that captures those calls instantly.`
      offerDetail = 'Eliminating social media login walls by deploying an instant mobile booking page.'
    } else {
      waMsg = `Hi ${name},\nI pulled up your website via your Google Maps listing in ${ct} and ran a Core Web Vitals audit.\nIdentified 3 revenue-leaking bottlenecks:\n${issuesSummary || ` • Page load latency of ${respTime} and missing tap-to-call mobile buttons`}\n\nGoogle penalizes these exact defects, pushing your listing below local competitors.\nI recorded a quick 90-second video breakdown showing exactly how to patch this. Want me to send it over?`
      callHook = `Hi ${name}, I'm calling because your website is taking over ${respTime} to load on smartphones, causing up to 40% of paid and organic clicks to bounce before dialing your number. Can I send you the audit?`
      offerDetail = 'Core Web Vitals speed optimization + Click-to-Call sticky bar + Google Local Schema repair.'
    }
  } else {
    // Morocco
    if (websiteCategory === 'NO_WEBSITE') {
      waMsg = `السلام عليكم سي ${name}، تبارك الله على الخدمة والتقييمات ديالكم في ${ct} 🇲🇦.\nلقيت البروفيل ديالكم في Google Maps، ولاحظت بلي ما عندكمش سيت ويب (Site Web) رسمي ديال المحل/الشركة.\n\nدابا أغلب الكليان فاش كيبغي ${cat} في ${ct} كيدخل لقوقل، وكيختار اللي عندو سيت فيه التصاور والأثمنة ورقم الواتساب باينين.\n\nباش نسهل عليك، قاديت ليك نموذج أولي (Maquette) بالاسم ديال ${name} فيه كلشي واجد مع زر واتساب مباشر.\nواش ممكن نصيفط ليك الرابط تشوفو بعينيك؟ (فابور وبلا حتى التزام من عندك)`
      callHook = `ألو السلام عليكم سي ${name}، معاك حمزة، كنت شفت الخدمة ديالكم في Google Maps فـ ${ct}. عيطت ليك حيت شفت بلي كاع المعلمين اللي عندهم سيت كيديو الكليان الكبار ديال الفيلات والشركات. قاديت ليك ماكيت تجريبية ناضية، واش نصيفطها ليك فـ الواتساب دابا تشوفها؟`
      offerDetail = 'موقع هبوط خفيف وسريع مخصص للمغرب مع زر واتساب مباشر وخريطة قوقل وبلا تعقيدات.'
    } else if (websiteCategory === 'SOCIAL_MEDIA_ONLY') {
      waMsg = `السلام عليكم ${name}، تبارك الله على صفحتكم في السوشيال ميديا.\nشفت بلي في Google Maps حاطين رابط الفيسبوك/انستغرام.. ولكن راه الكليان فاش كيدخل من التيليفون وكيطلع ليه فيسبوك كيطلب ليه المودباص وكيخرج وكيضيع عليك الكليان.\n\nقادينا لاندينغ بيج عصرية وسريعة كتربط حساباتكم مع حجز مباشر فـ الواتساب فـ ثانية واحدة.\nبغيتي نصيفط ليك نموذج تشوفو دابا؟`
      callHook = `السلام عليكم سي ${name}، راه رابط الفيسبوك فـ قوقل ماب كيضيع عليك نص الكليان اللي ماكيبغيوش يدخلو للانستغرام. عندنا حل كيحولهم لاتصالات مباشرة.`
      offerDetail = 'لاندينغ بيج سريعة تحول زوار قوقل إلى اتصالات واتساب مباشرة.'
    } else {
      waMsg = `السلام عليكم إدارة ${name}، تحياتي.\nدخلت للسيت ويب ديالكم بعدما لقيتكم في Google Maps فـ ${ct}.\nدرت ليه فحص تقني سريع ولقيت فيه نقط حابسين عليكم زبناء:\n${issuesSummary || ` • السيت كيتعطل فـ الفتح (${respTime}) ومافيهش زر واتساب فوري`}\n\nهادشي كينقص منكم أكثر من 40% ديال الاتصالات اليومية.\nقاديت ليك تقرير مختصر فيه كيفاش نصلحو هادشي فـ 24 ساعة.\nواش مناسب نصيفطو ليك هنا؟`
      callHook = `ألو السلام عليكم، كنهضر مع المسؤول على ${name}؟ موقعكم فـ قوقل ماب كياخد أكثر من ${respTime} باش يتحل فـ التيليفون والكليان كيخرج قبل ما يعيط. بغيت نوريك الحل فـ دقيقة واحدة.`
      offerDetail = 'إصلاح سرعة السيت + زر واتساب عائم مباشر + تسوية العرض فـ الهواتف الذكية.'
    }
  }

  return {
    whatsappMessage: waMsg,
    callHook,
    emailSubject: `Question regarding ${name} visibility & inquiries in ${ct}`,
    emailBody: waMsg,
    offerSummary: offerDetail,
    market
  }
}
