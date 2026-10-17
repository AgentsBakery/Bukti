// Borrower-facing copy. Plain, warm words; Tamil in Tamil script.
// Placeholders: {h} Indonesian honorific (Ibu / Bapak / Anda), {name}, {rail}, {n}, ...
import type { Lang } from '../api/types'

const S = {
  appTagline: { id: 'Bukti usaha, jadi pinjaman', ta: 'உங்கள் சான்றே உங்கள் கடன்', en: 'Your proof, your loan' },
  stepFoto: { id: 'Foto', ta: 'புகைப்படம்', en: 'Photo' },
  stepCerita: { id: 'Cerita', ta: 'கதை', en: 'Story' },
  stepHasil: { id: 'Hasil', ta: 'முடிவு', en: 'Result' },
  stepOf: { id: 'Langkah {n} dari 3', ta: '3-இல் படி {n}', en: 'Step {n} of 3' },
  readAloud: { id: 'Bacakan petunjuk', ta: 'வழிமுறையை வாசித்துக் காட்டு', en: 'Read the instructions aloud' },
  stopReading: { id: 'Berhenti membaca', ta: 'வாசிப்பதை நிறுத்து', en: 'Stop reading' },
  settings: { id: 'Pengaturan', ta: 'அமைப்புகள்', en: 'Settings' },
  language: { id: 'Bahasa', ta: 'மொழி', en: 'Language' },
  highContrast: { id: 'Kontras tinggi', ta: 'அதிக வேறுபாடு', en: 'High contrast' },
  highContrastHint: { id: 'Lebih jelas di bawah matahari', ta: 'வெயிலில் தெளிவாகப் பார்க்க', en: 'Easier to read in bright sun' },
  continue: { id: 'Lanjut', ta: 'தொடரவும்', en: 'Continue' },
  retry: { id: 'Coba lagi', ta: 'மீண்டும் முயலுங்கள்', en: 'Try again' },
  errorGeneric: { id: 'Ada gangguan sebentar. Coba lagi ya.', ta: 'ஏதோ சிறு சிக்கல். மீண்டும் முயலுங்கள்.', en: 'Something went wrong. Please try again.' },
  loadingApp: { id: 'Membuka kotak bukti…', ta: 'சான்றுப் பெட்டியைத் திறக்கிறோம்…', en: 'Opening your evidence box…' },
  notFound: { id: 'Pengajuan ini tidak ditemukan.', ta: 'இந்த விண்ணப்பம் கிடைக்கவில்லை.', en: 'We couldn’t find this application.' },
  backHome: { id: 'Kembali ke awal', ta: 'முதல் பக்கத்துக்குத் திரும்பு', en: 'Back to start' },

  // Language picker
  pickTitle: { id: 'Pilih bahasa', ta: 'மொழியைத் தேர்ந்தெடுக்கவும்', en: 'Choose your language' },
  pickLead: { id: 'Kami akan bicara dengan bahasa ini.', ta: 'இந்த மொழியில் உங்களுடன் பேசுவோம்.', en: 'We’ll talk with you in this language.' },

  // Foto
  fotoTitle: { id: 'Kotak bukti {h}', ta: 'உங்கள் சான்றுப் பெட்டி', en: 'Your evidence box' },
  fotoLead: {
    id: 'Buku kas dan laporan {rail} {h} sudah ada di sini. Kami akan membacanya baris demi baris.',
    ta: 'உங்கள் கணக்குப் புத்தகமும் {rail} அறிக்கையும் இங்கே உள்ளன. வரி வரியாகப் படிப்போம்.',
    en: 'Your notebook and {rail} statement are here. We’ll read them line by line.',
  },
  fotoSpeak: {
    id: 'Ini kotak bukti {h}. Buku kas dan laporan {rail} sudah ada. Tekan tombol biru di bawah, dan kami akan membaca buku {h}.',
    ta: 'இது உங்கள் சான்றுப் பெட்டி. உங்கள் கணக்குப் புத்தகமும் {rail} அறிக்கையும் இங்கே உள்ளன. கீழே உள்ள நீல பொத்தானை அழுத்துங்கள்; நாங்கள் உங்கள் புத்தகத்தைப் படிப்போம்.',
    en: 'This is your evidence box. Your notebook and {rail} statement are here. Press the blue button below and we will read your book.',
  },
  trayEmpty: { id: 'Belum ada foto. Mulai dengan foto halaman buku kas.', ta: 'இன்னும் புகைப்படம் இல்லை. கணக்குப் புத்தகப் பக்கத்திலிருந்து தொடங்குங்கள்.', en: 'No photos yet. Start with a page of your notebook.' },
  trayReady: { id: '{n} bukti siap dibaca', ta: '{n} சான்றுகள் தயார்', en: '{n} pieces of proof, ready' },
  privacy: { id: 'Foto {h} hanya dipakai untuk pengajuan ini.', ta: 'உங்கள் புகைப்படங்கள் இந்த விண்ணப்பத்துக்கு மட்டுமே.', en: 'Your photos are used only for this application.' },
  addPhoto: { id: 'Tambah foto', ta: 'புகைப்படம் சேர்', en: 'Add a photo' },
  readMyBook: { id: 'Baca buku saya', ta: 'என் புத்தகத்தைப் படியுங்கள்', en: 'Read my book' },
  readingBook: { id: 'Sedang membaca buku {h}…', ta: 'உங்கள் புத்தகத்தைப் படிக்கிறோம்…', en: 'Reading your book…' },
  readingPage: { id: 'Membaca halaman {n}…', ta: 'பக்கம் {n} படிக்கிறோம்…', en: 'Reading page {n}…' },
  readingStatement: { id: 'Mencocokkan dengan {rail}…', ta: '{rail} உடன் ஒப்பிடுகிறோம்…', en: 'Matching with {rail}…' },
  readingOther: { id: 'Melihat foto lainnya…', ta: 'மற்ற புகைப்படங்களைப் பார்க்கிறோம்…', en: 'Looking at your other photos…' },
  linesSoFar: { id: '{n} baris terbaca', ta: '{n} வரிகள் படித்தோம்', en: '{n} lines read' },
  readDone: { id: 'Kami membaca {lines} baris dari {pages} halaman', ta: '{pages} பக்கங்களில் {lines} வரிகளைப் படித்தோம்', en: 'We read {lines} lines from {pages} pages' },
  matchedSummary: { id: '{n} dari {d} hari cocok dengan {rail}', ta: '{d} நாட்களில் {n} நாட்கள் {rail} உடன் ஒத்துப்போகின்றன', en: '{n} of {d} days match your {rail}' },
  mismatchSummary: {
    id: 'Beberapa hari belum cocok dengan {rail}. Kami jelaskan di hasil nanti.',
    ta: 'சில நாட்கள் {rail} உடன் இன்னும் ஒத்துப்போகவில்லை. முடிவில் விளக்குவோம்.',
    en: 'Some days don’t match your {rail} yet. We’ll explain in your result.',
  },
  everyNumber: { id: 'Setiap angka tetap terhubung ke foto aslinya.', ta: 'ஒவ்வொரு எண்ணும் அதன் புகைப்படத்துடன் இணைந்தே இருக்கும்.', en: 'Every number stays linked to its photo.' },
  tapLine: { id: 'Ketuk baris untuk melihat fotonya', ta: 'வரியைத் தொட்டால் புகைப்படத்தில் காட்டும்', en: 'Tap a line to see it on the photo' },
  matched: { id: 'cocok', ta: 'பொருந்தியது', en: 'matched' },
  noRail: { id: 'tanpa {rail}', ta: '{rail} இல்லை', en: 'no {rail}' },
  gap: { id: 'selisih', ta: 'வேறுபாடு', en: 'gap' },
  colIn: { id: 'Masuk', ta: 'வரவு', en: 'In' },
  colOut: { id: 'Keluar', ta: 'செலவு', en: 'Out' },
  pageShort: { id: 'hal. {n}', ta: 'பக். {n}', en: 'p. {n}' },
  evLedger: { id: 'Buku kas', ta: 'கணக்குப் புத்தகம்', en: 'Notebook' },
  evStatement: { id: 'Laporan {rail}', ta: '{rail} அறிக்கை', en: '{rail} statement' },
  evReceipt: { id: 'Struk', ta: 'ரசீது', en: 'Receipt' },
  evShop: { id: 'Foto warung', ta: 'கடைப் படம்', en: 'Shop photo' },

  // Capture
  captureTitle: { id: 'Tambah foto bukti', ta: 'சான்றுப் புகைப்படம் சேர்க்கவும்', en: 'Add a photo of your proof' },
  captureHint: {
    id: 'Letakkan seluruh halaman di dalam bingkai. Cari tempat yang terang, dan tahan HP agar tidak goyang.',
    ta: 'பக்கம் முழுவதும் சட்டத்துக்குள் வரட்டும். வெளிச்சமான இடத்தில், கைபேசியை அசையாமல் பிடியுங்கள்.',
    en: 'Fit the whole page inside the frame. Find good light and hold the phone steady.',
  },
  fitPage: { id: 'Pas-kan halaman di sini', ta: 'பக்கத்தை இங்கே பொருத்துங்கள்', en: 'Fit the page here' },
  openCamera: { id: 'Buka kamera', ta: 'கேமராவைத் திற', en: 'Open camera' },
  fromGallery: { id: 'Pilih dari galeri', ta: 'கேலரியிலிருந்து தேர்வு செய்', en: 'Choose from gallery' },
  whatIsIt: { id: 'Ini foto apa?', ta: 'இது என்ன புகைப்படம்?', en: 'What is this photo?' },
  checking: { id: 'Memeriksa foto…', ta: 'புகைப்படத்தைச் சரிபார்க்கிறோம்…', en: 'Checking the photo…' },
  tooDark: { id: 'Fotonya agak gelap. Coba dekat jendela atau nyalakan lampu.', ta: 'புகைப்படம் கொஞ்சம் இருட்டாக உள்ளது. ஜன்னல் அருகே அல்லது விளக்கு வெளிச்சத்தில் எடுங்கள்.', en: 'This photo is a bit dark. Try near a window or switch on a light.' },
  tooBright: { id: 'Fotonya terlalu silau. Hindari cahaya langsung di halaman.', ta: 'புகைப்படத்தில் அதிக வெளிச்சம். பக்கத்தின் மேல் நேரடி ஒளி விழாமல் எடுங்கள்.', en: 'Too much glare. Keep direct light off the page.' },
  tooBlurry: { id: 'Fotonya agak buram. Pegang HP dengan dua tangan, lalu foto lagi.', ta: 'புகைப்படம் கொஞ்சம் மங்கலாக உள்ளது. கைபேசியை இரு கைகளாலும் பிடித்து மீண்டும் எடுங்கள்.', en: 'This photo is a little blurry. Hold the phone with both hands and try again.' },
  looksGood: { id: 'Fotonya jelas. Bagus!', ta: 'புகைப்படம் தெளிவாக உள்ளது. நன்று!', en: 'Nice and clear!' },
  retake: { id: 'Foto ulang', ta: 'மீண்டும் எடு', en: 'Retake' },
  useAnyway: { id: 'Pakai saja', ta: 'இதையே பயன்படுத்து', en: 'Use it anyway' },
  usePhoto: { id: 'Pakai foto ini', ta: 'இந்தப் புகைப்படத்தைப் பயன்படுத்து', en: 'Use this photo' },
  saving: { id: 'Menyimpan…', ta: 'சேமிக்கிறோம்…', en: 'Saving…' },
  close: { id: 'Tutup', ta: 'மூடு', en: 'Close' },

  // Cerita
  ceritaTitle: { id: 'Ceritakan warung {h}', ta: 'உங்கள் கடையைப் பற்றிச் சொல்லுங்கள்', en: 'Tell us about your shop' },
  ceritaLead: {
    id: 'Bukti akan bertanya 3–4 hal singkat. Jawab saja dengan kata-kata {h} sendiri — tidak ada jawaban yang salah.',
    ta: 'புக்தி 3–4 சிறிய கேள்விகள் கேட்கும். உங்கள் சொந்த வார்த்தைகளில் பதில் சொல்லுங்கள் — தவறான பதில் என்று எதுவும் இல்லை.',
    en: 'Bukti will ask 3–4 short questions. Just answer in your own words — there are no wrong answers.',
  },
  ceritaSpeak: {
    id: 'Sekarang kita ngobrol sebentar. Tekan tombol mikrofon, lalu jawab pertanyaan Bukti dengan kata-kata {h} sendiri.',
    ta: 'இப்போது கொஞ்சம் பேசலாம். மைக் பொத்தானை அழுத்தி, புக்தியின் கேள்விகளுக்கு உங்கள் சொந்த வார்த்தைகளில் பதில் சொல்லுங்கள்.',
    en: 'Now let’s talk for a moment. Press the microphone button and answer Bukti’s questions in your own words.',
  },
  topicsLead: { id: 'Bukti akan bertanya soal:', ta: 'புக்தி கேட்பது:', en: 'Bukti will ask about:' },
  topicSales: { id: 'Jualan sehari', ta: 'தினசரி விற்பனை', en: 'Daily sales' },
  topicDays: { id: 'Hari ramai & sepi', ta: 'பரபரப்பான & மந்தமான நாட்கள்', en: 'Busy & quiet days' },
  topicPlan: { id: 'Rencana pinjaman', ta: 'கடன் திட்டம்', en: 'Your loan plan' },
  startTalking: { id: 'Mulai bicara', ta: 'பேசத் தொடங்குங்கள்', en: 'Start talking' },
  allowMic: { id: 'Izinkan mikrofon di layar, ya', ta: 'திரையில் மைக் அனுமதியை அளியுங்கள்', en: 'Please allow the microphone' },
  connecting: { id: 'Menyambungkan…', ta: 'இணைக்கிறோம்…', en: 'Connecting…' },
  listening: { id: 'Bukti mendengarkan…', ta: 'புக்தி கேட்கிறது…', en: 'Bukti is listening…' },
  agentSpeaking: { id: 'Bukti sedang bicara…', ta: 'புக்தி பேசுகிறது…', en: 'Bukti is speaking…' },
  youSpeaking: { id: '{h} sedang bicara…', ta: 'நீங்கள் பேசுகிறீர்கள்…', en: 'You’re speaking…' },
  youLabel: { id: '{h}', ta: 'நீங்கள்', en: 'You' },
  micOff: { id: 'Mikrofon mati', ta: 'மைக் அணைக்கப்பட்டது', en: 'Mic is off' },
  mute: { id: 'Matikan mikrofon', ta: 'மைக்கை அணை', en: 'Mute microphone' },
  unmute: { id: 'Nyalakan mikrofon', ta: 'மைக்கை இயக்கு', en: 'Unmute microphone' },
  finish: { id: 'Selesai', ta: 'முடிந்தது', en: 'Finish' },
  skipInterview: { id: 'Lewati wawancara', ta: 'நேர்காணலைத் தவிர்', en: 'Skip the interview' },
  micDenied: {
    id: 'Mikrofon tidak bisa dipakai. Tidak apa-apa — {h} bisa lewati wawancara, atau izinkan mikrofon lalu coba lagi.',
    ta: 'மைக்கைப் பயன்படுத்த முடியவில்லை. பரவாயில்லை — நேர்காணலைத் தவிர்க்கலாம், அல்லது மைக் அனுமதி கொடுத்து மீண்டும் முயலலாம்.',
    en: 'We can’t use the microphone. That’s okay — you can skip the interview, or allow the mic and try again.',
  },
  connectionLost: { id: 'Sambungan terputus. Cerita yang sudah ada tetap tersimpan.', ta: 'இணைப்பு துண்டிக்கப்பட்டது. இதுவரை சொன்னது சேமிக்கப்பட்டுள்ளது.', en: 'The connection dropped. What you’ve said so far is saved.' },
  factsHeading: { id: 'Yang kami catat', ta: 'நாங்கள் குறித்தவை', en: 'What we noted' },
  interviewDone: { id: 'Terima kasih! Cerita {h} sudah kami catat.', ta: 'நன்றி! உங்கள் கதையைக் குறித்துக்கொண்டோம்.', en: 'Thank you! We’ve noted your story.' },
  seeResult: { id: 'Lihat hasil', ta: 'முடிவைப் பாருங்கள்', en: 'See my result' },
  idleHint: { id: 'Tekan untuk mulai', ta: 'தொடங்க அழுத்துங்கள்', en: 'Tap to begin' },

  // fact labels
  f_daily_sales: { id: 'Jualan/hari', ta: 'தினசரி விற்பனை', en: 'Sales a day' },
  f_busy_days: { id: 'Hari ramai', ta: 'பரபரப்பான நாட்கள்', en: 'Busy days' },
  f_slow_period_reason: { id: 'Kenapa sepi', ta: 'மந்தத்துக்குக் காரணம்', en: 'Why it’s quiet' },
  f_loan_purpose: { id: 'Untuk apa', ta: 'எதற்காக', en: 'Loan for' },
  f_years_in_business: { id: 'Lama usaha', ta: 'வியாபார ஆண்டுகள்', en: 'Years running' },
  f_days_open: { id: 'Hari buka', ta: 'திறந்திருக்கும் நாட்கள்', en: 'Days open' },

  // Hasil
  hasilTitle: { id: 'Hasil untuk {h}', ta: 'உங்கள் முடிவு', en: 'Your result' },
  assessing: { id: 'Sebentar ya. Kami sedang menghitung dengan teliti.', ta: 'கொஞ்சம் பொறுங்கள். கவனமாகக் கணக்கிடுகிறோம்.', en: 'One moment. We’re working it out carefully.' },
  a_reconciler: { id: 'Mencocokkan buku dengan {rail}', ta: 'புத்தகத்தை {rail} உடன் ஒப்பிடுகிறோம்', en: 'Matching your book with {rail}' },
  a_integrity: { id: 'Memeriksa catatan dengan teliti', ta: 'பதிவுகளைக் கவனமாகச் சரிபார்க்கிறோம்', en: 'Checking the notes carefully' },
  a_benchmark: { id: 'Membandingkan dengan usaha serupa', ta: 'இதே போன்ற கடைகளுடன் ஒப்பிடுகிறோம்', en: 'Comparing with similar shops' },
  a_policy: { id: 'Menghitung cicilan yang pas', ta: 'உங்களுக்கு ஏற்ற தவணையைக் கணக்கிடுகிறோம்', en: 'Working out a comfortable installment' },
  a_memo: { id: 'Menulis hasil untuk {h}', ta: 'உங்களுக்கான முடிவை எழுதுகிறோம்', en: 'Writing up your result' },
  memoWait: { id: 'Penjelasannya sedang ditulis dalam bahasa {h}. Ini butuh beberapa detik.', ta: 'உங்கள் மொழியில் விளக்கத்தை எழுதுகிறோம். சில விநாடிகள் ஆகும்.', en: 'Your explanation is being written. This takes a few seconds.' },
  canBorrow: { id: '{name}, {h} bisa meminjam', ta: '{name}, நீங்கள் கடன் பெறலாம்', en: '{name}, you can borrow' },
  canStart: { id: '{name}, {h} bisa mulai dengan', ta: '{name}, நீங்கள் இதனுடன் தொடங்கலாம்', en: '{name}, you can start with' },
  pathTitle: { id: '{name}, ini jalan menuju pinjaman {h}', ta: '{name}, உங்கள் கடனுக்கான வழி இதோ', en: '{name}, here’s your path to a loan' },
  termLine: { id: 'selama {weeks} minggu · cicilan {range} per minggu', ta: '{weeks} வாரங்கள் · வாரத் தவணை {range}', en: 'over {weeks} weeks · {range} a week' },
  fromYourProof: { id: 'dihitung dari bukti {h} sendiri', ta: 'உங்கள் சொந்தச் சான்றிலிருந்து', en: 'worked out from your own proof' },
  whyTitle: { id: 'Kenapa?', ta: 'ஏன்?', en: 'Why?' },
  scheduleTitle: { id: 'Jadwal cicilan', ta: 'தவணை நாட்காட்டி', en: 'Your repayment calendar' },
  scheduleLead: { id: 'Koin besar di minggu ramai, koin kecil di minggu sepi.', ta: 'வியாபாரம் அதிகமான வாரங்களில் பெரிய நாணயம், மந்தமான வாரங்களில் சிறிய நாணயம்.', en: 'Bigger coins in busy weeks, smaller coins in quiet weeks.' },
  coinHint: { id: 'Ketuk koin untuk melihat tanggal dan jumlahnya', ta: 'தேதி, தொகையைப் பார்க்க நாணயத்தைத் தொடுங்கள்', en: 'Tap a coin to see its date and amount' },
  coinDetail: { id: 'Minggu ke-{n} · {date} · {amount}', ta: 'வாரம் {n} · {date} · {amount}', en: 'Week {n} · {date} · {amount}' },
  totalRepay: { id: 'Total dibayar {amount}', ta: 'மொத்தம் செலுத்த வேண்டியது {amount}', en: 'Total to repay {amount}' },
  coachingTitle: { id: 'Supaya lain kali bisa lebih besar', ta: 'அடுத்த முறை அதிகம் பெற', en: 'How to get more next time' },
  listenResult: { id: 'Dengarkan hasilnya', ta: 'முடிவைக் கேளுங்கள்', en: 'Listen to my result' },
  stop: { id: 'Berhenti', ta: 'நிறுத்து', en: 'Stop' },
  officerPending: { id: 'Petugas pinjaman sedang memeriksa', ta: 'கடன் அலுவலர் சரிபார்க்கிறார்', en: 'Your loan officer is reviewing it' },
  officerPendingSub: { id: 'Biasanya selesai hari ini. Kami kabari lewat HP.', ta: 'பொதுவாக இன்றே முடியும். கைபேசியில் தெரிவிப்போம்.', en: 'Usually done today. We’ll let you know on your phone.' },
  officerApproved: { id: 'Disetujui oleh petugas pinjaman {h}', ta: 'உங்கள் கடன் அலுவலர் ஒப்புதல் அளித்தார்', en: 'Approved by your loan officer' },
  officerAdjusted: { id: 'Petugas menyetujui {amount}', ta: 'அலுவலர் {amount} ஒப்புதல் அளித்தார்', en: 'Your officer approved {amount}' },
  officerDeclined: {
    id: 'Petugas belum bisa menyetujui sekarang. Ini bukan akhir — ikuti langkah di bawah, lalu ajukan lagi.',
    ta: 'அலுவலர் இப்போது ஒப்புதல் அளிக்கவில்லை. இது முடிவல்ல — கீழே உள்ள படிகளைப் பின்பற்றி மீண்டும் விண்ணப்பியுங்கள்.',
    en: 'Your officer couldn’t approve it right now. This isn’t the end — follow the steps below and apply again.',
  },
  officerNote: { id: 'Catatan petugas', ta: 'அலுவலர் குறிப்பு', en: 'Officer’s note' },
  stampApproved: { id: 'DISETUJUI', ta: 'ஒப்புதல்', en: 'APPROVED' },
  stampReview: { id: 'DIPERIKSA', ta: 'பரிசீலனை', en: 'IN REVIEW' },
  step1Visit: { id: 'Petugas kami datang ke warung {h} minggu ini', ta: 'எங்கள் அலுவலர் இந்த வாரம் உங்கள் கடைக்கு வருவார்', en: 'Our officer visits your shop this week' },
  step2Rail: { id: 'Terima pembayaran lewat {rail} setiap hari', ta: 'தினமும் {rail} மூலம் பணம் பெறுங்கள்', en: 'Take {rail} payments every day' },
  step3Start: { id: 'Mulai dengan pinjaman pertama sampai {amount}', ta: '{amount} வரை முதல் கடனுடன் தொடங்குங்கள்', en: 'Start with a first loan of up to {amount}' },
  r_match: { id: 'Buku kas {h} cocok dengan pembayaran {rail}.', ta: 'உங்கள் புத்தகம் {rail} பரிவர்த்தனைகளுடன் ஒத்துப்போகிறது.', en: 'Your notebook matches your {rail} payments.' },
  r_steady: { id: 'Jualan {h} teratur — paling ramai di awal dan akhir bulan.', ta: 'உங்கள் விற்பனை சீராக உள்ளது — மாதத் தொடக்கத்திலும் இறுதியிலும் அதிகம்.', en: 'Your sales are steady — busiest at the start and end of the month.' },
  r_afford: { id: 'Setiap cicilan paling banyak {pct} dari uang bersih minggu itu.', ta: 'ஒவ்வொரு தவணையும் அந்த வார நிகர வருமானத்தில் அதிகபட்சம் {pct} மட்டுமே.', en: 'Each installment is at most {pct} of that week’s cash.' },
  r_years: { id: '{h} sudah berusaha {years}.', ta: 'நீங்கள் {years} வியாபாரம் செய்கிறீர்கள்.', en: 'You’ve run your shop for {years}.' },
  r_railBased: { id: 'Jumlah ini dihitung dari pembayaran {rail} {h} yang tercatat.', ta: 'இந்தத் தொகை உங்கள் {rail} பரிவர்த்தனைகளை வைத்துக் கணக்கிடப்பட்டது.', en: 'This amount comes from your recorded {rail} payments.' },
  r_real: { id: 'Usaha {h} nyata dan berjalan setiap hari.', ta: 'உங்கள் வியாபாரம் உண்மையானது; தினமும் நடக்கிறது.', en: 'Your business is real and runs every day.' },
  r_notYet: { id: 'Catatan buku belum cocok dengan {rail}, jadi kami ingin melihatnya bersama {h}.', ta: 'புத்தகப் பதிவுகள் {rail} உடன் இன்னும் ஒத்துப்போகவில்லை; அதனால் உங்களுடன் சேர்ந்து பார்க்க விரும்புகிறோம்.', en: 'Your notebook doesn’t line up with {rail} yet, so we’d like to look at it together.' },
  r_small: { id: 'Mulai kecil itu wajar — pinjaman akan tumbuh bersama bukti {h}.', ta: 'சிறியதாகத் தொடங்குவது இயல்பு — உங்கள் சான்று வளர வளர கடனும் வளரும்.', en: 'Starting small is normal — your loan grows as your proof grows.' },
  weekShort: { id: 'Mg', ta: 'வா', en: 'Wk' },
  biggest: { id: 'terbesar', ta: 'அதிகம்', en: 'biggest' },
  smallest: { id: 'terkecil', ta: 'குறைவு', en: 'smallest' },
} as const

export type StringKey = keyof typeof S

export function translate(lang: Lang, key: StringKey, vars: Record<string, string | number> = {}): string {
  const entry = S[key] as Record<Lang, string>
  let s = entry[lang] ?? entry.en
  for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v))
  return s.replace(/\s{2,}/g, ' ').trim()
}

export function hasKey(key: string): key is StringKey {
  return key in S
}

export const LANG_LABEL: Record<Lang, { native: string; english: string; speech: string }> = {
  id: { native: 'Bahasa Indonesia', english: 'Indonesian', speech: 'id-ID' },
  ta: { native: 'தமிழ்', english: 'Tamil', speech: 'ta-IN' },
  en: { native: 'English', english: 'English', speech: 'en-IN' },
}
