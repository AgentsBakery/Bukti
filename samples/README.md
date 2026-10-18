# Sample documents for testing real applications

Edge cases for **Apply with your own records**: each folder is one upload, with a `.zip` of the same files beside it.
Indonesian sets use a warung's *buku kas* and a QRIS history; Indian sets use a tea stall's day book and a UPI
statement. Dates run 21 Sep – 16 Oct 2026 unless a set says otherwise.

Everything with numbers is rendered from ground truth by `generate_samples.py`, so `expected.json` in each folder
holds the exact totals. The shop photos and the unrelated photos (no numbers) were made once with Gemini 3.1 Flash
Image and are kept in `_photos/`. All names, shops and amounts are fictional.

## How to use

- **By hand:** open the app, choose *Apply with your own records*, sign in, then pick every file of one folder at
  once on the Foto step.
- **Automatically:** `uv run python samples/check_samples.py <bukti url> [set ...]` uploads each set into a fresh
  demo case (no sign-in needed), lets Gemini label the files, reads and assesses the case, compares what was read
  with `expected.json`, and writes `results.json`.
- **Regenerate:** `uv run python samples/generate_samples.py` (add `--photos` to remake the Gemini photos).

No interview is run by the checker, so every case also shows *Loan purpose not stated*; that is expected.

## The sets and what happened

Observed on the staging revision on 18 Oct 2026 (Gemini 3.8 Flash reading, Gemini 4 Argon memo).

| Set | What's in it | What it tests | Observed |
|---|---|---|---|
| `01-yearly-summary` | a handwritten page of monthly totals for 2025 | a page with no daily records | Labelled a notebook page; reader reports *monthly sales summary for 2025 rather than daily records*. The phone shows "This page shows monthly or yearly totals, not daily sales" and *Back to my documents*; assessment is refused. |
| `02-irrelevant-photo` | 2 day-book photos, a 6-page UPI PDF, a beach photo | an unrelated photo in the batch | Beach photo → *Not used*. Day book ₹56,870 and statement ₹31,540 read **exactly**. Approve ₹10,500. |
| `03-blurry-photo` | a badly blurred notebook photo, a 4-page QRIS PDF | a page too blurry to read | Stays a notebook page; reader reports it unreadable. The phone shows "too blurry or dark to read — please take the photo again"; assessment is refused until it is replaced. |
| `04-same-page-twice` | page 1 photographed twice, page 2, UPI PDF | a re-used page | *Re-used photos* **fails** ("same page submitted more than once"). The repeated lines double-count sales (₹1,04,380 read vs ₹56,870 real), so *notebook vs payments* also fails → approve reduced ₹10,000. |
| `05-no-statement` | 2 notebook photos only | no payment statement | Before reading, a tip asks for the QRIS statement. Notebook Rp 12,729,000 read **exactly**; the three cross-checks show *watch*; referred to a loan officer (policy §2.1). |
| `06-statement-other-dates` | day book (Sep–Oct) + a UPI statement for **July** | records that don't overlap | Both read exactly (₹56,870; July ₹37,280); *covers different dates from the notebook* → referred to a loan officer. |
| `07-printed-item-sheet` | a printed register with Tea / Coffee qty-rate-amount, Snacks, Biscuit columns + UPI PDF | per-item rows (like a spreadsheet printout) | **23 of 23 rows exact** (each row's money columns added up, quantities and rates ignored); statement exact. Approve ₹10,500. |
| `08-overlapping-screenshots` | 1 notebook photo + 3 scrolled screenshots of a QRIS app, each repeating the last 3 payments | overlapping screenshots, days split across shots | All three labelled statements; repeated payments counted once: **4 of 4 statement days exact**. The screenshots cover only 4 days, so the checks compare just those days (see note below). Approve Rp 2,900,000. |
| `09-mixed-batch-id` | 2 notebook photos, 4-page QRIS PDF, supplier receipt, shop photo, food photo | everything in one pick | Each labelled correctly (notebook, statement, receipt, shop; food → *Not used*). Notebook and statement **exact**. Approve Rp 2,700,000. |
| `09-mixed-batch-in` | the same for the tea stall, with a UPI PDF | everything in one pick | Each labelled correctly (beach → *Not used*). Day book and statement **exact**. Approve ₹10,500. |

### Notes

- **Re-used pages are judged by content.** Two different pages photographed on one table look alike as photos, so
  a notebook page counts as re-used only when the lines read from it largely repeat another page's; other files only
  when they are byte-identical.
- **Short statement coverage.** In `08` the screenshots cover 4 days of a 26-day notebook; the loan is sized on those
  4 days. Whether to require a minimum overlap (for example 14 days) before trusting a statement is a policy choice.
- **Long PDFs.** A PDF may have at most 10 pages and an application 20 photos and pages; longer statements are
  refused with a clear message.
