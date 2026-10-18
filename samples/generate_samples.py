"""Generate edge-case sample documents for testing real applications (Apply with your own records).

Every document with numbers is rendered from ground truth here, so the expected result of each set is exact.
Photos that carry no numbers (a shop, an unrelated picture) are made once with Gemini 3.1 Flash Image and kept in
samples/_photos/ so re-running this script is deterministic and free.

    uv run python samples/generate_samples.py            # documents only (uses the photos already in _photos/)
    uv run python samples/generate_samples.py --photos   # also (re)generate the photos with Gemini

Dates are 21 Sep - 16 Oct 2026 so a notebook and its statement overlap.
"""

from __future__ import annotations

import io
import json
import os
import random
import shutil
import sys
import time
import zipfile
from dataclasses import dataclass, field
from datetime import date, timedelta
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent
PHOTOS = ROOT / "_photos"
HAND = "/System/Library/Fonts/Supplemental/Bradley Hand Bold.ttf"
SANS = "/System/Library/Fonts/Supplemental/Arial.ttf"
SANS_BOLD = "/System/Library/Fonts/Supplemental/Arial Bold.ttf"
START, END = date(2026, 9, 21), date(2026, 10, 16)
PAGE_W, PAGE_H = 1240, 1754


def font(path: str, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(path, size)


# ---------------------------------------------------------------- ground truth

@dataclass
class Shop:
    market: str          # "ID" | "IN"
    name: str
    base: int            # typical daily sales
    step: int            # smallest coin/note people write
    digital_share: float
    ticket: int          # typical digital payment
    seed: int
    closed_weekday: int = 6  # Sunday
    expenses: list[tuple[str, int, int]] = field(default_factory=list)


@dataclass
class Day:
    d: date
    sales: int
    digital: int
    payments: list[tuple[str, int]]  # (HH:MM, amount)
    spend: list[tuple[str, int]]


def payday_factor(d: date) -> float:
    # Busy after payday (start and end of month), quiet mid-month.
    return 1.18 if d.day <= 6 or d.day >= 27 else 0.82 if 12 <= d.day <= 19 else 1.0


def build(shop: Shop, start: date = START, end: date = END) -> list[Day]:
    rng = random.Random(shop.seed)
    days = []
    d = start
    while d <= end:
        if d.weekday() == shop.closed_weekday:
            d += timedelta(days=1)
            continue
        raw = shop.base * payday_factor(d) * (1.12 if d.weekday() == 5 else 1.0) * rng.uniform(0.82, 1.18)
        sales = max(shop.step, int(round(raw / shop.step)) * shop.step)
        digital_target = sales * shop.digital_share * rng.uniform(0.9, 1.1)
        payments, total = [], 0
        while total < digital_target * 0.97:
            amt = int(round(shop.ticket * rng.uniform(0.3, 2.6) / shop.step)) * shop.step or shop.step
            payments.append((f"{rng.randint(7, 20):02d}:{rng.randint(0, 59):02d}", amt))
            total += amt
        payments.sort()
        spend = []
        if rng.random() < 0.3 and shop.expenses:
            desc, lo, hi = rng.choice(shop.expenses)
            spend.append((desc, int(round(rng.uniform(lo, hi) / shop.step)) * shop.step))
        days.append(Day(d, sales, total, payments, spend))
        d += timedelta(days=1)
    return days


WARUNG = Shop("ID", "Warung Bu Ani", 520_000, 500, 0.40, 18_000, 21, expenses=[
    ("Kulakan beras", 1_200_000, 1_700_000), ("Kulakan minyak & gula", 800_000, 1_200_000),
    ("Beli gas 3kg", 60_000, 75_000), ("Kulakan telur", 350_000, 480_000)])
TEA_STALL = Shop("IN", "Kumar Tea Stall", 2_400, 10, 0.55, 75, 22, expenses=[
    ("Milk purchase", 900, 1_400), ("Tea powder", 600, 900), ("Gas cylinder", 950, 1_100), ("Sugar", 300, 500)])


def money(market: str, v: int, symbol: bool = True) -> str:
    if market == "ID":
        s = f"{v:,}".replace(",", ".")
        return f"Rp {s}" if symbol else s
    return f"₹{v:,}" if symbol else f"{v:,}"


# ---------------------------------------------------------------- renderers: paper

def ruled_paper(w: int = PAGE_W, h: int = PAGE_H, seed: int = 0) -> Image.Image:
    rng = random.Random(seed)
    img = Image.new("RGB", (w, h), (247, 243, 230))
    px = img.load()
    for _ in range(9000):  # paper fibres
        x, y = rng.randrange(w), rng.randrange(h)
        c = rng.randint(228, 240)
        px[x, y] = (c, c - 3, c - 14)
    d = ImageDraw.Draw(img)
    for y in range(170, h - 40, 58):
        d.line((40, y, w - 40, y), fill=(170, 190, 215), width=2)
    d.line((150, 0, 150, h), fill=(214, 120, 120), width=3)  # margin
    return img


def handwritten_notebook(market: str, lines: list[tuple[str, str, int, int]], title: str, page: int,
                         seed: int) -> Image.Image:
    """lines: (date label, description, money in, money out)."""
    rng = random.Random(seed)
    img = ruled_paper(seed=seed)
    d = ImageDraw.Draw(img)
    ink = (34, 40, 92)
    big, small = font(HAND, 40), font(HAND, 32)
    d.text((170, 70), title, font=big, fill=ink)
    d.text((PAGE_W - 260, 82), ("hal. " if market == "ID" else "page ") + str(page), font=small, fill=ink)
    head_in, head_out = ("Masuk", "Keluar") if market == "ID" else ("In", "Out")
    d.text((700, 125), head_in, font=small, fill=ink)
    d.text((960, 125), head_out, font=small, fill=ink)
    y = 186
    for label, desc, amt_in, amt_out in lines:
        j = rng.randint(-3, 3)
        d.text((48 + rng.randint(0, 6), y + j), label, font=small, fill=ink)
        d.text((172 + rng.randint(0, 10), y + j), desc, font=small, fill=ink)
        if amt_in:
            d.text((690 + rng.randint(-8, 8), y - 4 + j), money(market, amt_in, symbol=False), font=big, fill=ink)
        if amt_out:
            d.text((950 + rng.randint(-8, 8), y - 4 + j), money(market, amt_out, symbol=False), font=big, fill=ink)
        y += 58
    return img


def notebook_pages(shop: Shop, days: list[Day], seed: int, per_page: int = 25) -> tuple[list[Image.Image], list[dict]]:
    rows, truth = [], []
    sales_word = "Jualan" if shop.market == "ID" else "Sales"
    for day in days:
        label = f"{day.d.day}/{day.d.month}"
        rows.append((label, sales_word, day.sales, 0))
        truth.append({"date": day.d.isoformat(), "description": sales_word, "in": day.sales, "out": 0})
        for desc, amt in day.spend:
            rows.append(("", desc, 0, amt))
            truth.append({"date": day.d.isoformat(), "description": desc, "in": 0, "out": amt})
    title = "Buku Kas" if shop.market == "ID" else "Day book"
    pages = [handwritten_notebook(shop.market, rows[i:i + per_page], f"{title} — {shop.name}", i // per_page + 1,
                                  seed + i) for i in range(0, len(rows), per_page)]
    return pages, truth


def monthly_summary_page(seed: int) -> Image.Image:
    rng = random.Random(seed)
    img = ruled_paper(seed=seed)
    d = ImageDraw.Draw(img)
    ink, big, small = (34, 40, 92), font(HAND, 42), font(HAND, 34)
    d.text((170, 70), "Ringkasan penjualan 2025", font=big, fill=ink)
    months = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober",
              "November", "Desember"]
    y, total = 186, 0
    for m in months:
        v = int(round(rng.uniform(12.5e6, 17.5e6) / 50_000)) * 50_000
        total += v
        d.text((180, y), m, font=small, fill=ink)
        d.text((700, y - 4), money("ID", v), font=big, fill=ink)
        y += 58
    d.line((690, y + 4, 1100, y + 4), fill=ink, width=3)
    d.text((180, y + 20), "Total setahun", font=small, fill=ink)
    d.text((700, y + 16), money("ID", total), font=big, fill=ink)
    return img


def printed_item_sheet(days: list[Day], seed: int) -> tuple[Image.Image, list[dict]]:
    """A spreadsheet printout like the user's tea-shop file: per-item quantity / rate / amount columns."""
    rng = random.Random(seed)
    img = Image.new("RGB", (PAGE_W, PAGE_H), "white")
    d = ImageDraw.Draw(img)
    f, fb = font(SANS, 21), font(SANS_BOLD, 21)
    cols = [("Date", 60), ("Tea", 230), ("Rate", 310), ("Amount", 390), ("Coffee", 510), ("Rate", 600),
            ("Amount", 680), ("Snacks", 810), ("Biscuit", 930)]
    d.text((60, 50), "Kumar Tea Stall — daily sales register", font=font(SANS_BOLD, 28), fill="black")
    for name, x in cols:
        d.text((x, 120), name, font=fb, fill="black")
    d.line((50, 150, 1060, 150), fill="black", width=2)
    y, truth = 160, []
    for day in days:
        tea_rate, cof_rate = 12, 20
        snacks = int(round(day.sales * rng.uniform(0.12, 0.22) / 10)) * 10
        biscuit = int(round(day.sales * rng.uniform(0.04, 0.1) / 10)) * 10
        cof_qty = max(0, int((day.sales * rng.uniform(0.22, 0.32)) // cof_rate))
        tea_qty = max(1, (day.sales - snacks - biscuit - cof_qty * cof_rate) // tea_rate)
        tea_amt, cof_amt = tea_qty * tea_rate, cof_qty * cof_rate
        total = tea_amt + cof_amt + snacks + biscuit
        vals = [day.d.strftime("%d-%b-%y"), str(tea_qty), f"{tea_rate:.2f}", f"{tea_amt:.2f}", str(cof_qty),
                f"{cof_rate:.2f}", f"{cof_amt:.2f}", f"{snacks:.2f}", f"{biscuit:.2f}"]
        for (_, x), v in zip(cols, vals, strict=True):
            d.text((x, y), v, font=f, fill="black")
        truth.append({"date": day.d.isoformat(), "in": total, "parts": [tea_amt, cof_amt, snacks, biscuit]})
        y += 33
        d.line((50, y - 4, 1060, y - 4), fill=(200, 200, 200), width=1)
    d.text((60, y + 10), "Grand Total", font=fb, fill="black")
    return img, truth


def receipt(market: str, seed: int) -> Image.Image:
    rng = random.Random(seed)
    img = Image.new("RGB", (620, 1100), (250, 250, 246))
    d = ImageDraw.Draw(img)
    f, fb = font("/System/Library/Fonts/Supplemental/Courier New.ttf", 24), font("/System/Library/Fonts/Supplemental/Courier New Bold.ttf", 26)
    if market == "ID":
        head, items = ["TOKO GROSIR MAKMUR", "Jl. Kaliurang Km 5", "Nota: 4471"], [
            ("Beras 25kg", 2, 312_000), ("Minyak 2L", 6, 34_500), ("Gula 1kg", 10, 16_500), ("Mie instan dus", 3, 112_000)]
    else:
        head, items = ["SRI LAKSHMI TRADERS", "Gandhi Road, Madurai", "Bill: 2219"], [
            ("Tea powder 1kg", 2, 420), ("Sugar 5kg", 1, 240), ("Milk 1L", 12, 52), ("Biscuit box", 3, 180)]
    y = 40
    for h in head:
        d.text((310, y), h, font=fb, fill="black", anchor="mt")
        y += 38
    d.text((40, y), f"Tgl/Date: {date(2026, 10, rng.randint(1, 15)).isoformat()}", font=f, fill="black")
    y += 50
    total = 0
    for name, q, p in items:
        d.text((40, y), f"{name}", font=f, fill="black")
        d.text((40, y + 30), f"  {q} x {money(market, p, symbol=False)}", font=f, fill="black")
        d.text((580, y + 30), money(market, q * p, symbol=False), font=f, fill="black", anchor="ra")
        total += q * p
        y += 72
    d.line((40, y, 580, y), fill="black", width=2)
    d.text((40, y + 16), "TOTAL", font=fb, fill="black")
    d.text((580, y + 16), money(market, total), font=fb, fill="black", anchor="ra")
    d.text((310, y + 90), "Terima kasih" if market == "ID" else "Thank you", font=f, fill="black", anchor="mt")
    return img


# ---------------------------------------------------------------- renderers: digital statements

def statement_pdf(shop: Shop, days: list[Day], out: Path, title: str) -> None:
    lines = []
    for day in days:
        for t, amt in day.payments:
            lines.append((day.d, t, "Pembayaran QRIS masuk" if shop.market == "ID" else "UPI payment received", amt))
        if day.d.weekday() == 5:  # a weekly withdrawal / fee that must NOT count as sales
            lines.append((day.d, "21:10", "Penarikan saldo" if shop.market == "ID" else "Settlement to bank", -day.digital * 3))
            lines.append((day.d, "21:11", "Biaya admin" if shop.market == "ID" else "Service fee", -(2_500 if shop.market == "ID" else 15)))
    f, fb, fh = font(SANS, 18), font(SANS_BOLD, 19), font(SANS_BOLD, 30)
    pages, per = [], 60
    for i in range(0, len(lines), per):
        img = Image.new("RGB", (PAGE_W, PAGE_H), "white")
        d = ImageDraw.Draw(img)
        d.rectangle((0, 0, PAGE_W, 120), fill=(30, 42, 90))
        d.text((60, 30), title, font=fh, fill="white")
        d.text((60, 76), f"{shop.name} · {days[0].d.isoformat()} – {days[-1].d.isoformat()}", font=f, fill=(210, 215, 235))
        y = 150
        for x, h in ((60, "Date" if shop.market == "IN" else "Tanggal"), (260, "Time" if shop.market == "IN" else "Waktu"),
                     (380, "Description" if shop.market == "IN" else "Keterangan"), (920, "Amount" if shop.market == "IN" else "Nominal")):
            d.text((x, y), h, font=fb, fill="black")
        d.line((60, y + 32, 1180, y + 32), fill="black", width=2)
        y += 44
        for dd, t, desc, amt in lines[i:i + per]:
            d.text((60, y), dd.isoformat(), font=f, fill="black")
            d.text((260, y), t, font=f, fill="black")
            d.text((380, y), desc, font=f, fill="black")
            d.text((920, y), ("-" if amt < 0 else "+") + money(shop.market, abs(amt)), font=f, fill=(170, 30, 30) if amt < 0 else "black")
            y += 25
        d.text((60, PAGE_H - 60), f"{'Halaman' if shop.market == 'ID' else 'Page'} {i // per + 1}", font=f, fill=(110, 110, 110))
        pages.append(img)
    pages[0].save(out, format="PDF", save_all=True, append_images=pages[1:], resolution=150)


def statement_screenshots(days: list[Day], shots: int = 3, per_shot: int = 13, overlap: int = 3
                          ) -> tuple[list[Image.Image], dict[str, int]]:
    """Phone screenshots of a generic QRIS merchant app, scrolled like a real person does: each shot repeats the last
    `overlap` payments of the previous one, and days are split across shots. Returns the shots and, per day, the
    total of the payments that are visible on at least one shot (the exact expected statement)."""
    payments = [(day.d, t, amt) for day in days for t, amt in day.payments]
    f, fb, fs = font(SANS, 34), font(SANS_BOLD, 36), font(SANS, 28)
    images, visible = [], set()
    for k in range(shots):
        first = k * (per_shot - overlap)
        window = list(range(first, min(first + per_shot, len(payments))))
        visible.update(window)
        img = Image.new("RGB", (1080, 2340), (245, 246, 250))
        d = ImageDraw.Draw(img)
        d.rectangle((0, 0, 1080, 90), fill=(255, 255, 255))
        d.text((50, 26), "10:24", font=fs, fill="black")
        d.text((930, 26), "87%", font=fs, fill="black")
        d.rectangle((0, 90, 1080, 230), fill=(255, 255, 255))
        d.text((60, 130), "← Riwayat Transaksi QRIS", font=font(SANS_BOLD, 40), fill="black")
        y, shown_day = 250, None
        for i in window:
            day, t, amt = payments[i]
            if day != shown_day:  # a date header above each day's first visible payment (sticky at the top)
                d.text((60, y), day.strftime("%a, %d %b %Y"), font=font(SANS_BOLD, 30), fill=(90, 90, 110))
                y += 52
                shown_day = day
            d.rounded_rectangle((40, y, 1040, y + 118), radius=24, fill="white")
            d.ellipse((70, y + 24, 140, y + 94), fill=(225, 232, 250))
            d.text((105, y + 59), "QR", font=font(SANS_BOLD, 24), fill=(40, 60, 140), anchor="mm")
            d.text((170, y + 20), "Pembayaran diterima", font=fb, fill="black")
            d.text((170, y + 68), f"{t} · QRIS", font=fs, fill=(120, 120, 130))
            d.text((1010, y + 38), "+" + money("ID", amt), font=fb, fill=(30, 130, 70), anchor="ra")
            y += 130
        images.append(img)
    expected: dict[str, int] = {}
    for i in sorted(visible):
        day, _, amt = payments[i]
        expected[day.isoformat()] = expected.get(day.isoformat(), 0) + amt
    return images, expected


# ---------------------------------------------------------------- the phone-photo look

def table_texture(w: int, h: int, seed: int) -> Image.Image:
    rng = random.Random(seed)
    base = Image.new("RGB", (w, h), (118, 84, 54))
    d = ImageDraw.Draw(base)
    for y in range(0, h, 3):
        c = rng.randint(-14, 14)
        d.line((0, y, w, y + rng.randint(-6, 6)), fill=(118 + c, 84 + c, 54 + c // 2), width=3)
    return base.filter(ImageFilter.GaussianBlur(1.2))


def phone_photo(page: Image.Image, seed: int, blur: float = 0.0, tilt: float = 2.5) -> Image.Image:
    """Put a page on a table, tilt it with a little perspective, add shadow, uneven light and JPEG noise."""
    rng = random.Random(seed)
    W, H = 1500, 2000
    canvas = table_texture(W, H, seed)
    scale = min(W * 0.78 / page.width, H * 0.86 / page.height)  # tall pages (receipts) fit the frame too
    pw, ph = int(page.width * scale), int(page.height * scale)
    pg = page.convert("RGB").resize((pw, ph))
    # perspective: the top edge slightly narrower than the bottom, as when a phone is held above the page
    inset = int(pw * rng.uniform(0.025, 0.05))
    quad = (-inset, 0, -inset // 2, ph, pw + inset // 2, ph, pw + inset, 0)
    pg = pg.transform((pw, ph), Image.Transform.QUAD, quad, resample=Image.Resampling.BICUBIC, fillcolor=(118, 84, 54))
    angle = rng.uniform(-tilt, tilt)
    mask = Image.new("L", (pw, ph), 255).rotate(angle, expand=True)
    pg = pg.rotate(angle, expand=True, fillcolor=(0, 0, 0))
    x, y = (W - pg.width) // 2 + rng.randint(-30, 30), (H - pg.height) // 2 + rng.randint(-30, 30)
    shadow = Image.new("L", canvas.size, 0)
    shadow.paste(mask, (x + 18, y + 26))
    canvas = Image.composite(Image.new("RGB", canvas.size, (40, 28, 18)), canvas, shadow.filter(ImageFilter.GaussianBlur(22)).point(lambda v: int(v * 0.55)))
    canvas.paste(pg, (x, y), mask)
    # uneven light: brighter top-left, darker bottom-right
    # Rotate a gradient twice the frame's size and crop the middle, so no hard edge from the rotation shows.
    grad = Image.linear_gradient("L").resize((W * 2, H * 2)).rotate(rng.uniform(25, 55), resample=Image.Resampling.BICUBIC)
    grad = grad.crop((W // 2, H // 2, W // 2 + W, H // 2 + H))
    light = Image.merge("RGB", [grad.point(lambda v: 255 - int(v * 0.22))] * 3)
    canvas = ImageChops.multiply(canvas, light)
    noise = Image.effect_noise((W, H), 18).convert("RGB")
    canvas = Image.blend(canvas, ImageChops.overlay(canvas, noise), 0.18)
    if blur:
        canvas = canvas.filter(ImageFilter.GaussianBlur(blur))
    return canvas


def jpeg(img: Image.Image, path: Path, quality: int = 82) -> None:
    img.convert("RGB").save(path, format="JPEG", quality=quality)


def png(img: Image.Image, path: Path) -> None:
    img.save(path, format="PNG", optimize=True)


# ---------------------------------------------------------------- photos from Gemini (made once, kept in _photos/)

PHOTO_PROMPTS = {
    "shop_id.png": "A realistic smartphone photo of a small Indonesian warung sembako (grocery kiosk) storefront in the "
                   "afternoon: shelves of rice sacks, cooking oil bottles, instant noodle boxes and snacks, a hand-painted "
                   "sign reading 'WARUNG BU ANI', no people, no brand logos.",
    "shop_in.png": "A realistic smartphone photo of a small roadside tea stall in Tamil Nadu, India: a steel tea kettle, "
                   "glass jars of biscuits, a hand-painted sign reading 'KUMAR TEA STALL', no people, no brand logos.",
    "unrelated_beach.png": "A realistic smartphone photo of a quiet beach at sunset with palm trees, no people, no text.",
    "unrelated_food.png": "A realistic smartphone photo of a plate of idli with coconut chutney and sambar on a banana "
                          "leaf, top-down, no text.",
}


def make_photos() -> None:
    import subprocess

    import google.oauth2.credentials
    from google import genai
    from google.genai import types

    account = os.environ.get("BUKTI_GCLOUD_ACCOUNT")  # a gcloud account with access to the bukti-ai project
    tok = subprocess.check_output(["gcloud", "auth", "print-access-token", *(["--account", account] if account else [])]).decode().strip()
    client = genai.Client(enterprise=True, project="bukti-ai", location="global",
                          credentials=google.oauth2.credentials.Credentials(tok, quota_project_id="bukti-ai"))
    PHOTOS.mkdir(exist_ok=True)
    for name, prompt in PHOTO_PROMPTS.items():
        if (PHOTOS / name.replace(".png", ".jpg")).exists():
            continue
        for attempt in range(6):  # the image model's per-minute quota is small: back off and retry
            try:
                r = client.models.generate_content(model="gemini-3.1-flash-image", contents=prompt, config=types.GenerateContentConfig(
                    response_modalities=["IMAGE"], image_config=types.ImageConfig(aspect_ratio="3:4")))
                break
            except Exception as exc:  # noqa: BLE001
                if "429" not in str(exc) or attempt == 5:
                    raise
                time.sleep(20 * (attempt + 1))
        part = next(p for p in r.candidates[0].content.parts if p.inline_data)
        Image.open(io.BytesIO(part.inline_data.data)).convert("RGB").save(PHOTOS / name.replace(".png", ".jpg"), quality=86)
        print("photo", name)


def photo(name: str) -> Image.Image:
    return Image.open(PHOTOS / name.replace(".png", ".jpg"))


# ---------------------------------------------------------------- the sets

def write_set(folder: str, files: dict[str, object], expected: dict) -> None:
    out = ROOT / folder
    if out.exists():
        shutil.rmtree(out)
    out.mkdir(parents=True)
    for name, obj in files.items():
        path = out / name
        if isinstance(obj, Path):
            shutil.copy(obj, path)
        elif name.endswith(".png"):
            png(obj, path)
        else:
            jpeg(obj, path)
    (out / "expected.json").write_text(json.dumps(expected, indent=2, ensure_ascii=False) + "\n")
    with zipfile.ZipFile(ROOT / f"{folder}.zip", "w", zipfile.ZIP_DEFLATED) as z:
        for p in sorted(out.iterdir()):
            z.write(p, f"{folder}/{p.name}")
    print("set", folder, "→", ", ".join(sorted(files)))


def totals(days: list[Day]) -> dict:
    return {"notebook_sales": sum(x.sales for x in days), "statement_received": sum(x.digital for x in days),
            "days": len(days), "first": days[0].d.isoformat(), "last": days[-1].d.isoformat()}


def main() -> None:
    if "--photos" in sys.argv:
        make_photos()
    tmp = ROOT / "_tmp"
    tmp.mkdir(exist_ok=True)

    warung = build(WARUNG)
    tea = build(TEA_STALL)
    w_pages, w_truth = notebook_pages(WARUNG, warung, seed=100)
    t_pages, t_truth = notebook_pages(TEA_STALL, tea, seed=200)
    statement_pdf(WARUNG, warung, tmp / "w_statement.pdf", "QRIS Merchant · Riwayat Transaksi")
    statement_pdf(TEA_STALL, tea, tmp / "t_statement.pdf", "UPI Business · Payment history")

    write_set("01-yearly-summary", {"ringkasan-2025.jpg": phone_photo(monthly_summary_page(1), 11)}, {
        "market": "ID", "upload": "alone",
        "expect": "Labelled a notebook page (or 'not used'). Reading finds no dated daily sales; the phone says the page "
                  "shows monthly or yearly totals and offers 'Back to my documents'. Assessment is refused."})

    write_set("02-irrelevant-photo", {
        "daybook-page1.jpg": phone_photo(t_pages[0], 21), "daybook-page2.jpg": phone_photo(t_pages[1], 22),
        "upi-statement.pdf": tmp / "t_statement.pdf", "IMG_beach.jpg": photo("unrelated_beach.png")}, {
        "market": "IN", **totals(tea), "lines": t_truth,
        "expect": "The beach photo is labelled 'Not used' and left out; the day book and statement are read normally."})

    blurry = phone_photo(w_pages[0], 31, blur=5.5)
    write_set("03-blurry-photo", {"buku-kas-blur.jpg": blurry, "qris-statement.pdf": tmp / "w_statement.pdf"}, {
        "market": "ID", "lines_on_page": [x for x in w_truth][:25],
        "expect": "The phone warns 'May be blurry'. Gemini may still read some lines; anything it can't read is missing, "
                  "so the notebook vs statement checks show the gap."})

    write_set("04-same-page-twice", {
        "daybook-p1.jpg": phone_photo(t_pages[0], 41), "daybook-p1-again.jpg": phone_photo(t_pages[0], 42, tilt=3.5),
        "daybook-p2.jpg": phone_photo(t_pages[1], 43), "upi-statement.pdf": tmp / "t_statement.pdf"}, {
        "market": "IN", **totals(tea),
        "expect": "The 'Re-used photos' check flags page 1 submitted twice; the duplicated lines inflate notebook sales."})

    write_set("05-no-statement", {f"buku-kas-hal{i + 1}.jpg": phone_photo(p, 50 + i) for i, p in enumerate(w_pages)}, {
        "market": "ID", **totals(warung), "lines": w_truth,
        "expect": "Before reading, a tip asks for the QRIS statement. After reading, the three cross-checks show "
                  "'watch' (not checked) and the case goes to a loan officer (policy §2.1)."})

    july = build(TEA_STALL, date(2026, 7, 1), date(2026, 7, 31))
    statement_pdf(TEA_STALL, july, tmp / "t_july.pdf", "UPI Business · Payment history")
    write_set("06-statement-other-dates", {
        "daybook-page1.jpg": phone_photo(t_pages[0], 61), "daybook-page2.jpg": phone_photo(t_pages[1], 62),
        "upi-statement-july.pdf": tmp / "t_july.pdf"}, {
        "market": "IN", **totals(tea), "statement_received": sum(x.digital for x in july),
        "statement_period": "2026-07-01 to 2026-07-31",
        "expect": "The statement covers July, the day book Sep-Oct: the checks say they cover different dates and the "
                  "case goes to a loan officer."})

    sheet, sheet_truth = printed_item_sheet(tea, seed=70)
    statement_pdf(TEA_STALL, tea, tmp / "t_statement_sheet.pdf", "UPI Business · Payment history")
    write_set("07-printed-item-sheet", {"tea-stall-register.png": sheet, "upi-statement.pdf": tmp / "t_statement_sheet.pdf"}, {
        "market": "IN", "days": len(sheet_truth), "notebook_sales": sum(r["in"] for r in sheet_truth),
        "statement_received": sum(x.digital for x in tea), "rows": sheet_truth,
        "expect": "Every row's Tea + Coffee + Snacks + Biscuit amounts are added up (quantities and rates ignored); "
                  "per-day totals match `rows`."})

    shots, visible_days = statement_screenshots(warung)
    write_set("08-overlapping-screenshots", {
        "buku-kas-hal1.jpg": phone_photo(w_pages[0], 81), **{f"Screenshot_qris_{i + 1}.png": s for i, s in enumerate(shots)}}, {
        "market": "ID", "statement_days": visible_days,
        "expect": "Each screenshot repeats the last 3 payments of the previous one, and days are split across shots. "
                  "Repeated payments are counted once, so per-day statement totals match `statement_days` (what the "
                  "screenshots show). They cover only the first days, so most notebook days have no statement to "
                  "compare with."})

    write_set("09-mixed-batch-id", {
        **{f"buku-kas-hal{i + 1}.jpg": phone_photo(p, 90 + i) for i, p in enumerate(w_pages)},
        "qris-statement.pdf": tmp / "w_statement.pdf", "nota-grosir.jpg": phone_photo(receipt("ID", 9), 95, tilt=4),
        "warung.jpg": photo("shop_id.png"), "IMG_makan.jpg": photo("unrelated_food.png")}, {
        "market": "ID", **totals(warung),
        "expect": "Picked together: notebook pages, statement pages, a receipt, a shop photo and an unrelated photo, "
                  "each labelled correctly; the unrelated photo is 'Not used'."})

    write_set("09-mixed-batch-in", {
        **{f"daybook-page{i + 1}.jpg": phone_photo(p, 190 + i) for i, p in enumerate(t_pages)},
        "upi-statement.pdf": tmp / "t_statement.pdf", "supplier-bill.jpg": phone_photo(receipt("IN", 19), 195, tilt=4),
        "stall.jpg": photo("shop_in.png"), "IMG_beach.jpg": photo("unrelated_beach.png")}, {
        "market": "IN", **totals(tea),
        "expect": "As the Indonesian batch, for an Indian tea stall with a UPI statement."})
    shutil.rmtree(tmp)


if __name__ == "__main__":
    main()
