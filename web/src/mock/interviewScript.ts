// Scripted interviews for mock mode. Each turn exists in all three languages so a judge
// can switch language and still get a natural conversation; the English line doubles as
// the caption gloss shown under non-English captions.
import type { Application, Lang } from '../api/types'
import { money, shortName } from '../lib/format'

type L3 = Record<Lang, string>

export interface ScriptFact {
  field: string
  label: string
  value: L3
}

export interface ScriptTurn {
  role: 'agent' | 'user'
  text: L3
  facts?: ScriptFact[]
}

const same = (v: string): L3 => ({ id: v, ta: v, en: v })

const SARI: ScriptTurn[] = [
  {
    role: 'agent',
    text: {
      id: 'Selamat siang, Ibu Sari. Saya Bukti. Saya sudah membaca buku kas Ibu. Boleh saya tanya sedikit tentang warung Ibu?',
      ta: 'வணக்கம் சாரி அம்மா. நான் புக்தி. உங்கள் கணக்குப் புத்தகத்தைப் படித்துவிட்டேன். உங்கள் கடையைப் பற்றி சில கேள்விகள் கேட்கலாமா?',
      en: "Good afternoon, Ibu Sari. I'm Bukti. I've read your cash book. May I ask a little about your warung?",
    },
  },
  { role: 'user', text: { id: 'Boleh, silakan.', ta: 'சரி, கேளுங்கள்.', en: 'Yes, go ahead.' } },
  {
    role: 'agent',
    text: { id: 'Kira-kira berapa jualan Ibu dalam sehari?', ta: 'ஒரு நாளில் சுமாராக எவ்வளவு விற்பனை ஆகும்?', en: 'Roughly how much do you sell in a day?' },
  },
  {
    role: 'user',
    text: {
      id: 'Biasanya sekitar empat ratus lima puluh ribu. Kalau awal bulan bisa sampai enam ratus ribu.',
      ta: 'வழக்கமா நாலு லட்சத்து ஐம்பதாயிரம் ரூபியா. மாசத் தொடக்கத்துல ஆறு லட்சம் வரைக்கும் போகும்.',
      en: 'Usually about four hundred and fifty thousand. At the start of the month it can reach six hundred thousand.',
    },
    facts: [
      { field: 'daily_sales', label: 'Daily sales', value: same('Rp 450.000') },
      { field: 'busy_days', label: 'Busy days', value: { id: 'Awal bulan', ta: 'மாதத் தொடக்கம்', en: 'Start of the month' } },
    ],
  },
  {
    role: 'agent',
    text: {
      id: 'Di buku, jualan turun di pertengahan bulan. Kenapa ya, Bu?',
      ta: 'புத்தகத்தில், மாதத்தின் நடுவில் விற்பனை குறைகிறது. ஏன் அப்படி?',
      en: 'In your book, sales drop in the middle of the month. Why is that?',
    },
  },
  {
    role: 'user',
    text: {
      id: 'Iya, tanggal sepuluh sampai dua puluh orang belum gajian, jadi sepi.',
      ta: 'ஆமா, பத்தாம் தேதியிலிருந்து இருபதாம் தேதி வரைக்கும் மக்களுக்குச் சம்பளம் வந்திருக்காது. அதனால கடை மந்தமா இருக்கும்.',
      en: "Yes, from the tenth to the twentieth people haven't been paid yet, so it's quiet.",
    },
    facts: [
      { field: 'slow_period_reason', label: 'Why sales dip', value: { id: 'Sebelum gajian (tgl 10–20)', ta: 'சம்பளத்துக்கு முன் (10–20 தேதி)', en: 'Before payday (10th–20th)' } },
    ],
  },
  {
    role: 'agent',
    text: {
      id: 'Sudah berapa lama warungnya buka? Dan pinjamannya mau dipakai untuk apa?',
      ta: 'கடையை எத்தனை வருடமாக நடத்துகிறீர்கள்? கடனை எதற்குப் பயன்படுத்துவீர்கள்?',
      en: 'How long has the warung been open? And what will you use the loan for?',
    },
  },
  {
    role: 'user',
    text: {
      id: 'Sudah dua belas tahun. Mau beli kulkas, supaya bisa jual minuman dingin dan telur lebih banyak.',
      ta: 'பன்னிரண்டு வருஷமா நடத்துறேன். ஒரு ஃப்ரிட்ஜ் வாங்கணும்; குளிர்பானமும் முட்டையும் அதிகமா விக்கலாம்.',
      en: 'Twelve years now. I want to buy a fridge so I can sell cold drinks and more eggs.',
    },
    facts: [
      { field: 'years_in_business', label: 'Years in business', value: { id: '12 tahun', ta: '12 ஆண்டுகள்', en: '12 years' } },
      { field: 'loan_purpose', label: 'Loan purpose', value: { id: 'Kulkas untuk minuman dingin & telur', ta: 'குளிர்பானம், முட்டைக்கு ஃப்ரிட்ஜ்', en: 'Fridge for cold drinks & eggs' } },
    ],
  },
  {
    role: 'agent',
    text: {
      id: 'Terima kasih, Ibu Sari. Ceritanya sudah cukup. Sekarang saya hitung hasilnya untuk Ibu.',
      ta: 'நன்றி சாரி அம்மா. இது போதும். இப்போது உங்களுக்கான முடிவைக் கணக்கிடுகிறேன்.',
      en: "Thank you, Ibu Sari. That's all I need. Now I'll work out your result.",
    },
  },
]

const MURUGAN: ScriptTurn[] = [
  {
    role: 'agent',
    text: {
      ta: 'வணக்கம் முருகன். நான் புக்தி. உங்கள் கணக்குப் புத்தகத்தைப் படித்துவிட்டேன். உங்கள் கடையைப் பற்றி சில கேள்விகள் கேட்கலாமா?',
      id: 'Halo, Pak Murugan. Saya Bukti. Saya sudah membaca buku kas Bapak. Boleh saya tanya sedikit tentang toko Bapak?',
      en: "Vanakkam, Murugan. I'm Bukti. I've read your account book. May I ask a few questions about your shop?",
    },
  },
  { role: 'user', text: { ta: 'சரி, கேளுங்க.', id: 'Boleh, silakan.', en: 'Sure, ask.' } },
  {
    role: 'agent',
    text: { ta: 'ஒரு நாளில் சுமாராக எவ்வளவு விற்பனை ஆகும்?', id: 'Kira-kira berapa jualan Bapak dalam sehari?', en: 'Roughly how much do you sell in a day?' },
  },
  {
    role: 'user',
    text: {
      ta: 'சாதாரணமா ஐயாயிரம் ரூபாய். மாசத் தொடக்கத்துல ஆறாயிரம் வரைக்கும் போகும்.',
      id: 'Biasanya lima ribu rupee. Awal bulan bisa sampai enam ribu.',
      en: 'Usually five thousand rupees. At the start of the month it goes up to six thousand.',
    },
    facts: [
      { field: 'daily_sales', label: 'Daily sales', value: same('₹5,000') },
      { field: 'busy_days', label: 'Busy days', value: { ta: 'மாதத் தொடக்கம்', id: 'Awal bulan', en: 'Start of the month' } },
    ],
  },
  {
    role: 'agent',
    text: { ta: 'மாதத்தின் நடுவில் விற்பனை குறைகிறது. ஏன்?', id: 'Di pertengahan bulan jualan turun. Kenapa, Pak?', en: 'Sales drop in the middle of the month. Why?' },
  },
  {
    role: 'user',
    text: {
      ta: 'சம்பளம் வர்றதுக்கு முன்னாடி நிறைய பேர் கடன்ல வாங்குவாங்க. அதனால கையில காசு குறைவா வரும்.',
      id: 'Sebelum gajian banyak yang ngutang dulu, jadi uang tunai yang masuk sedikit.',
      en: 'Before payday a lot of people buy on credit, so less cash comes in.',
    },
    facts: [
      { field: 'slow_period_reason', label: 'Why sales dip', value: { ta: 'சம்பளத்துக்கு முன் கடன் விற்பனை', id: 'Pembeli ngutang sebelum gajian', en: 'Customers buy on credit before payday' } },
    ],
  },
  {
    role: 'agent',
    text: {
      ta: 'கடையை எத்தனை வருடமாக நடத்துகிறீர்கள்? கடனை எதற்குப் பயன்படுத்துவீர்கள்?',
      id: 'Sudah berapa lama tokonya buka? Pinjamannya untuk apa?',
      en: 'How many years have you run the shop? What will you use the loan for?',
    },
  },
  {
    role: 'user',
    text: {
      ta: 'எட்டு வருஷமா. அரிசியும் பருப்பும் மொத்தமா வாங்கினா விலை குறைவா கிடைக்கும்.',
      id: 'Delapan tahun. Kalau beli beras dan dal dalam jumlah besar, harganya lebih murah.',
      en: 'Eight years. If I buy rice and dal in bulk, I get a better price.',
    },
    facts: [
      { field: 'years_in_business', label: 'Years in business', value: { ta: '8 ஆண்டுகள்', id: '8 tahun', en: '8 years' } },
      { field: 'loan_purpose', label: 'Loan purpose', value: { ta: 'அரிசி, பருப்பு மொத்தக் கொள்முதல்', id: 'Stok beras & dal grosir', en: 'Bulk rice & dal stock' } },
    ],
  },
  {
    role: 'agent',
    text: {
      ta: 'நன்றி முருகன். இது போதும். இப்போது உங்களுக்கான முடிவைக் கணக்கிடுகிறேன்.',
      id: 'Terima kasih, Pak Murugan. Sudah cukup. Sekarang saya hitung hasilnya.',
      en: "Thank you, Murugan. That's all I need. Now I'll work out your result.",
    },
  },
]

const RINA: ScriptTurn[] = [
  {
    role: 'agent',
    text: {
      id: 'Selamat siang, Ibu Rina. Saya Bukti. Saya sudah membaca buku kas Ibu. Boleh saya tanya sedikit?',
      ta: 'வணக்கம் ரீனா அம்மா. நான் புக்தி. உங்கள் கணக்குப் புத்தகத்தைப் படித்துவிட்டேன். சில கேள்விகள் கேட்கலாமா?',
      en: "Good afternoon, Ibu Rina. I'm Bukti. I've read your cash book. May I ask a few questions?",
    },
  },
  { role: 'user', text: { id: 'Iya, boleh.', ta: 'சரி.', en: 'Yes, okay.' } },
  {
    role: 'agent',
    text: { id: 'Kira-kira berapa jualan Ibu dalam sehari?', ta: 'ஒரு நாளில் சுமாராக எவ்வளவு விற்பனை ஆகும்?', en: 'Roughly how much do you sell in a day?' },
  },
  {
    role: 'user',
    text: { id: 'Sehari bisa satu juta, Bu. Ramai terus.', ta: 'ஒரு நாளைக்கு பத்து லட்சம் ரூபியா வரும். எப்பவும் கூட்டம்தான்.', en: "About one million a day. It's always busy." },
    facts: [{ field: 'daily_sales', label: 'Daily sales', value: same('Rp 1.000.000') }],
  },
  {
    role: 'agent',
    text: {
      id: 'Apakah ada hari warungnya tutup? Misalnya hari Minggu?',
      ta: 'கடை மூடியிருக்கும் நாட்கள் உண்டா? உதாரணமாக ஞாயிற்றுக்கிழமை?',
      en: 'Are there days the warung is closed? Sundays, for example?',
    },
  },
  {
    role: 'user',
    text: { id: 'Tidak pernah tutup. Setiap hari buka.', ta: 'ஒருநாளும் மூடுறதில்லை. தினமும் திறந்திருக்கும்.', en: 'Never closed. Open every day.' },
    facts: [{ field: 'days_open', label: 'Days open', value: { id: 'Buka setiap hari', ta: 'தினமும் திறந்திருக்கும்', en: 'Open every day' } }],
  },
  {
    role: 'agent',
    text: { id: 'Pinjamannya mau dipakai untuk apa, Bu?', ta: 'கடனை எதற்குப் பயன்படுத்துவீர்கள்?', en: 'What will you use the loan for?' },
  },
  {
    role: 'user',
    text: { id: 'Untuk tambah modal saja.', ta: 'முதலீட்டைக் கூட்டத்தான்.', en: 'Just to add capital.' },
    facts: [{ field: 'loan_purpose', label: 'Loan purpose', value: { id: 'Tambah modal', ta: 'முதலீடு', en: 'Working capital' } }],
  },
  {
    role: 'agent',
    text: {
      id: 'Terima kasih, Ibu Rina. Sudah cukup. Sekarang saya hitung hasilnya.',
      ta: 'நன்றி ரீனா அம்மா. இது போதும். இப்போது முடிவைக் கணக்கிடுகிறேன்.',
      en: "Thank you, Ibu Rina. That's all I need. Now I'll work out your result.",
    },
  },
]

function generic(app: Application, avgDaily: number, fabricated: boolean): ScriptTurn[] {
  const name = shortName(app.persona)
  const m = app.market
  const step = m === 'ID' ? (fabricated ? 100_000 : 10_000) : fabricated ? 1000 : 100
  const claim = Math.round((avgDaily * (fabricated ? 1.6 : 1)) / step) * step
  const c = money(claim, m)
  const h = /^ibu/i.test(app.persona.name) ? 'Ibu' : /^pak/i.test(app.persona.name) ? 'Bapak' : 'Anda'
  const years = fabricated ? 2 : 6
  const turns: ScriptTurn[] = [
    {
      role: 'agent',
      text: {
        id: `Selamat siang, ${name}. Saya Bukti. Saya sudah membaca buku kas ${h}. Boleh saya tanya sedikit?`,
        ta: `வணக்கம் ${name}. நான் புக்தி. உங்கள் கணக்குப் புத்தகத்தைப் படித்துவிட்டேன். சில கேள்விகள் கேட்கலாமா?`,
        en: `Hello, ${name}. I'm Bukti. I've read your notebook. May I ask a few questions?`,
      },
    },
    { role: 'user', text: { id: 'Boleh.', ta: 'சரி.', en: 'Sure.' } },
    {
      role: 'agent',
      text: { id: `Kira-kira berapa jualan ${h} dalam sehari?`, ta: 'ஒரு நாளில் சுமாராக எவ்வளவு விற்பனை ஆகும்?', en: 'Roughly how much do you sell in a day?' },
    },
    {
      role: 'user',
      text: { id: `Sekitar ${c} sehari.`, ta: `சுமார் ${c} வரும்.`, en: `About ${c} a day.` },
      facts: [{ field: 'daily_sales', label: 'Daily sales', value: same(c) }],
    },
  ]
  if (fabricated) {
    turns.push(
      {
        role: 'agent',
        text: { id: 'Apakah ada hari tokonya tutup?', ta: 'கடை மூடியிருக்கும் நாட்கள் உண்டா?', en: 'Are there days the shop is closed?' },
      },
      {
        role: 'user',
        text: { id: 'Tidak pernah, setiap hari buka.', ta: 'இல்லை, தினமும் திறந்திருக்கும்.', en: 'Never, it is open every day.' },
        facts: [{ field: 'days_open', label: 'Days open', value: { id: 'Buka setiap hari', ta: 'தினமும் திறந்திருக்கும்', en: 'Open every day' } }],
      },
    )
  }
  turns.push(
    {
      role: 'agent',
      text: {
        id: 'Sudah berapa lama usahanya? Pinjamannya untuk apa?',
        ta: 'எத்தனை வருடமாக வியாபாரம் செய்கிறீர்கள்? கடனை எதற்குப் பயன்படுத்துவீர்கள்?',
        en: 'How long have you run the business? What is the loan for?',
      },
    },
    {
      role: 'user',
      text: {
        id: `Sudah ${years} tahun. Untuk tambah stok barang.`,
        ta: `${years} வருஷமா நடத்துறேன். சரக்கு அதிகமா வாங்கத்தான்.`,
        en: `${years} years. To buy more stock.`,
      },
      facts: [
        { field: 'years_in_business', label: 'Years in business', value: { id: `${years} tahun`, ta: `${years} ஆண்டுகள்`, en: `${years} years` } },
        { field: 'loan_purpose', label: 'Loan purpose', value: { id: 'Tambah stok', ta: 'சரக்கு கொள்முதல்', en: 'More stock' } },
      ],
    },
    {
      role: 'agent',
      text: {
        id: `Terima kasih, ${name}. Sekarang saya hitung hasilnya.`,
        ta: `நன்றி ${name}. இப்போது முடிவைக் கணக்கிடுகிறேன்.`,
        en: `Thank you, ${name}. Now I'll work out your result.`,
      },
    },
  )
  return turns
}

export function scriptFor(app: Application, avgDaily: number, fabricated: boolean): ScriptTurn[] {
  if (app.pack_id === 'sari') return SARI
  if (app.pack_id === 'murugan') return MURUGAN
  if (app.pack_id === 'rina') return RINA
  return generic(app, avgDaily, fabricated)
}
