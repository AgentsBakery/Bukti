# Bukti pitch kit: 3-minute video + deck

Rubric reminders: Technical merit & GenAI 40% · Problem alignment & impact 25% · Innovation 25% · UX 10%.
Screeners decide in the first 20 seconds of the video. Open on the human, not the tech.

Record everything from the deployed URL in **Demo mode** (`/demo/<app id>`, phone + officer console side by side),
1920×1080, browser zoom 100%, no bookmarks bar, notifications off. Record the voice interview with a real person
speaking Bahasa (and 10 s of Tamil), not synthetic audio.

---

## Video script (≤ 3:00)

| Time | Picture | Narration (calm, warm; say it slower than feels natural) |
|---|---|---|
| 0:00–0:12 | Close-up: a hand turning pages of a real handwritten buku kas. Then text on screen: **"US$235 billion"** | "Ibu Sari has kept the books for her warung for twelve years. In a notebook. In Indonesia alone, small businesses like hers are short of about two hundred and thirty-five billion dollars in credit." |
| 0:12–0:22 | The notebook beside a rejected-looking bank form | "Banks want financial statements. She has the next best thing — proof. Nobody can read it at scale. Until now." |
| 0:22–0:28 | Bukti landing page, logo | "This is Bukti. Credit from the evidence small shops actually keep." |
| 0:28–0:55 | Demo mode: tap "Be Ibu Sari". Foto step: notebook photos stamp into the shoebox, tap **Baca buku saya**. Ink scan line; numbers **lift off the page** into the digital ledger; QRIS days tick in; "matched" stamps | "She photographs her notebook and her QRIS history. Gemini reads her handwriting — every number keeps a link back to exactly where it was written — and checks it against what the payment rail independently recorded." |
| 0:55–1:25 | Cerita: the ink orb. Real Bahasa conversation; captions + English line; fact chips stamp in | "Then a two-minute interview, in her language. The interviewer has already read her notebook, so it asks about *her* numbers — why sales dip mid-month. Every answer becomes a fact, with her own words as the quote." |
| 1:25–1:50 | Officer console: agent graph lighting up; proof-chain stamps; click a reason → highlight jumps to the photo | "Agents built with Google's Agent Development Kit verify the evidence in parallel, apply the lender's policy, and Gemini 4 Argon writes the memo. Click any number, and you see the ink it came from." |
| 1:50–2:05 | Hasil on the phone: "Ibu Sari, you can borrow Rp 2.700.000", coin calendar with smaller coins mid-month | "Her repayments are shaped to her month: more after payday, less in the quiet weeks." |
| 2:05–2:25 | Landing → "Watch a fake ledger get caught". Rina's console: red stamps, decoupled chart, **Model Armor** stamp | "And when a notebook is invented — round numbers, sales on days the shop was idle, even a hidden note telling the AI to approve — Bukti catches it and hands it to a human. It never accuses; it refers." |
| 2:25–2:45 | Architecture slide (5 s), then eval table | "Gemini 3.8 Flash, Live and TTS, Gemini 4 Argon, ADK, BigQuery, Firestore and Model Armor, on one Cloud Run service. On our handwritten test set: [X]% of lines read exactly, [Y] of 8 decisions correct, under a minute from photo to decision." |
| 2:45–3:00 | Murugan in Tamil (3 s), then the notebook closing. Logo + URL | "Indonesia today, Tamil Nadu tomorrow — any lender in Asia can plug it in. Bukti: because a notebook kept for twelve years is proof." |

Fill [X] and [Y] from `eval/results/results.md`. Never round up.

---

## Deck (export to PDF; 10–12 slides, Ink & Paper look)

Palette: paper `#F6F0E4`, indigo `#1E2A5A`, turmeric `#E8A317`, green `#2F7D4F`, chili `#C2412D`.
Fonts: Fraunces (titles), Atkinson Hyperlegible (body).

1. **Title.** Bukti — credit from the evidence small shops actually keep. Theme: BFSI. Team names. Live URL + GitHub.
2. **The person.** Ibu Sari's notebook photo. "12 years of records. Zero bank loans." One line each on why banks say no
   (no statements, no bureau file, cost of a field visit > the loan's margin).
3. **The gap (with sources).**
   - SEA MSME credit shortfall ≈ US$430B; Indonesia ≈ US$235B (≈76% of MSME financing need).
   - >80% of Philippine microenterprises are informal and lack financial statements.
   - 1.3B adults unbanked (World Bank Global Findex 2025).
   - Informal firms that keep records mostly use notebooks (Wharton/ILO 2025).
   *(Mark industry estimates as estimates; check each source before submitting.)*
4. **Insight.** Informal businesses don't lack evidence — they lack evidence a lender can *read and trust*.
   QRIS/UPI now gives an independent witness to every shop's day.
5. **The product (3 steps).** Foto → Cerita → Hasil, screenshots of each.
6. **Signature: proof you can audit.** Console screenshot with a reason linked to a highlighted number on the photo.
7. **How it decides.** "Gemini reads and explains · rules decide · a human approves." The 9 checks as stamps
   (notebook vs payments, daily rhythm, idle-day sales, round numbers, regularity, reused photos, Model Armor,
   peers, affordability). Cash-flow-shaped repayment chart.
8. **Architecture.** The README mermaid diagram as a clean graphic; list Google services and *why* each is there.
9. **Results.** Eval table (extraction accuracy, decision accuracy, time to decision), genuine vs inflated vs
   fabricated outcomes. Latency per stage. Cost per application (estimate from token usage).
10. **Responsible AI.** Human decides; no protected attributes; Model Armor on borrower text; dignity-first messaging;
    30% weekly affordability cap (stricter than RBI's 50% household cap); data stays in asia-southeast1.
11. **Feasibility & scale.** One Cloud Run service today; lender SDK/API tomorrow; Gemma on-device for offline field
    agents; languages via Gemini Live; plugs into existing loan origination systems. Business model: per-decision
    fee to lenders (rural banks/BPRs, MFIs, NBFCs, fintech lenders).
12. **Ask / close.** "A notebook kept for twelve years is proof." URL + QR code to the live demo.
