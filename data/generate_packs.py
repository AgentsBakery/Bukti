"""Generate the Bukti evidence packs: ledger ground truth, digital-payment statements,
and a printable handwriting kit for the team.

Each pack is one applicant. Ledger pages are handwritten by teammates from the
ground truth in this script, photographed, and dropped into data/packs/<id>/photos/.
The digital statement (QRIS for Indonesia, UPI for India) is rendered here as a PNG,
so the reconciliation between notebook and statement is known exactly.

Run:  uv run --python 3.12 --with pillow python data/generate_packs.py
"""

from __future__ import annotations

import csv
import json
import random
from dataclasses import asdict, dataclass, field
from datetime import date, timedelta
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent
PACKS_DIR = ROOT / "packs"
PERIOD_START = date(2026, 9, 1)
DAYS = 28
DAYS_PER_PAGE = 14

FONT_REG = "/System/Library/Fonts/Supplemental/Arial.ttf"
FONT_BOLD = "/System/Library/Fonts/Supplemental/Arial Bold.ttf"


@dataclass
class Market:
    code: str
    language: str
    currency: str
    rail: str
    base_sales: int
    rounding: int
    digital_share: float
    expenses: list[tuple[str, int, int]]  # (description, min, max)
    sales_label: str
    closed_label: str


ID = Market(
    code="ID",
    language="Bahasa Indonesia",
    currency="Rp",
    rail="QRIS",
    base_sales=480_000,
    rounding=500,
    digital_share=0.38,
    expenses=[
        ("Kulakan beras", 1_200_000, 1_800_000),
        ("Kulakan gula & minyak", 800_000, 1_300_000),
        ("Kulakan mie instan", 600_000, 900_000),
        ("Beli gas 3kg", 60_000, 80_000),
        ("Kulakan telur", 350_000, 500_000),
        ("Bayar listrik", 150_000, 220_000),
    ],
    sales_label="Jualan",
    closed_label="Tutup",
)

IN = Market(
    code="IN",
    language="Tamil",
    currency="₹",
    rail="UPI",
    base_sales=5_200,
    rounding=10,
    digital_share=0.58,
    expenses=[
        ("அரிசி கொள்முதல் (rice stock)", 9_000, 14_000),
        ("எண்ணெய் வாங்கியது (oil)", 4_000, 6_500),
        ("பருப்பு கொள்முதல் (dal stock)", 5_000, 8_000),
        ("பால் பாக்கெட் (milk)", 1_200, 1_800),
        ("கேஸ் சிலிண்டர் (gas)", 900, 1_100),
        ("மின் கட்டணம் (electricity)", 700, 1_200),
    ],
    sales_label="விற்பனை (sales)",
    closed_label="விடுமுறை (closed)",
)


@dataclass
class PackSpec:
    id: str
    label: str  # genuine | inflated | fabricated
    market: Market
    persona: str
    business: str
    city: str
    seed: int
    hero: bool = False
    note: str = ""


PACKS = [
    PackSpec("sari", "genuine", ID, "Ibu Sari Wulandari", "Warung sembako", "Yogyakarta", 11, hero=True,
             note="Hero demo. Sales dip mid-month (payday cycle)."),
    PackSpec("murugan", "genuine", IN, "Murugan Selvaraj", "Kirana store", "Madurai", 12, hero=True,
             note="Second-market hero. UPI-heavy."),
    PackSpec("joko", "genuine", ID, "Pak Joko Santoso", "Kios kelontong", "Klaten", 13),
    PackSpec("lakshmi", "genuine", IN, "Lakshmi Narayanan", "Tiffin & provisions", "Coimbatore", 14),
    PackSpec("dewi", "inflated", ID, "Ibu Dewi Lestari", "Warung makan", "Sleman", 15,
             note="Owner exaggerates: notebook sales are about 2.4x the real business."),
    PackSpec("selvam", "inflated", IN, "Selvam Pandian", "Provision store", "Tiruchirappalli", 16,
             note="Owner exaggerates: notebook sales are about 2.2x the real business."),
    PackSpec("rina", "fabricated", ID, "Ibu Rina Kartika", "Warung (claimed)", "Bantul", 17,
             note="Fake ledger written in one sitting: round, too-regular numbers, sales on days QRIS shows the shop closed."),
    PackSpec("karthik", "fabricated", IN, "Karthik Raman", "Store (claimed)", "Salem", 18,
             note="Fake ledger: round, too-regular numbers, sales on days UPI shows no activity."),
]


@dataclass
class Line:
    page: int
    line: int
    date: str
    description: str
    amount_in: int = 0
    amount_out: int = 0


@dataclass
class StatementDay:
    date: str
    transactions: int
    total: int


@dataclass
class Pack:
    spec: PackSpec
    lines: list[Line] = field(default_factory=list)
    statement: list[StatementDay] = field(default_factory=list)


def day_of_month_factor(d: date) -> float:
    """Payday cycle: strong at the start and end of the month, weak mid-month."""
    if d.day <= 7:
        return 1.15
    if d.day <= 16:
        return 0.74
    if d.day <= 24:
        return 1.0
    return 1.2


def round_to(value: float, step: int) -> int:
    return int(round(value / step) * step)


def build_pack(spec: PackSpec) -> Pack:
    rng = random.Random(spec.seed)
    m = spec.market
    pack = Pack(spec)

    closed_days = {6, 13, 20, 27} if spec.label == "fabricated" else set()
    true_sales: dict[date, int] = {}
    ledger_sales: dict[date, int] = {}

    for i in range(DAYS):
        d = PERIOD_START + timedelta(days=i)
        weekend = 1.1 if d.weekday() >= 5 else 1.0
        real = m.base_sales * day_of_month_factor(d) * weekend * rng.uniform(0.86, 1.14)
        if spec.label == "fabricated":
            real *= 0.35  # the real business is small
            if i in closed_days:
                real = 0
        true_sales[d] = round_to(real, m.rounding)

        if spec.label == "genuine":
            ledger_sales[d] = true_sales[d]
        elif spec.label == "inflated":
            factor = 2.4 if m.code == "ID" else 2.2
            ledger_sales[d] = round_to(true_sales[d] * factor * rng.uniform(0.95, 1.05), m.rounding)
        else:  # fabricated: invented, round, regular, ignores the real pattern
            step = 50_000 if m.code == "ID" else 500
            choices = [m.base_sales * 1.1, m.base_sales * 1.2, m.base_sales * 1.15]
            ledger_sales[d] = round_to(rng.choice(choices), step)

    line_no = {1: 0, 2: 0}
    for i in range(DAYS):
        d = PERIOD_START + timedelta(days=i)
        page = 1 if i < DAYS_PER_PAGE else 2
        line_no[page] += 1
        pack.lines.append(Line(page, line_no[page], d.isoformat(), m.sales_label, amount_in=ledger_sales[d]))
        # Restocking every ~3 days; electricity once a month. Fabricated ledgers barely bother.
        restock_every = 9 if spec.label == "fabricated" else 3
        if i % restock_every == 1:
            desc, lo, hi = rng.choice(m.expenses[:5])
            line_no[page] += 1
            pack.lines.append(Line(page, line_no[page], d.isoformat(), desc,
                                   amount_out=round_to(rng.uniform(lo, hi), m.rounding * 10)))
        if d.day == 5 and spec.label != "fabricated":
            desc, lo, hi = m.expenses[5]
            line_no[page] += 1
            pack.lines.append(Line(page, line_no[page], d.isoformat(), desc,
                                   amount_out=round_to(rng.uniform(lo, hi), m.rounding * 10)))

    avg_ticket = 18_000 if m.code == "ID" else 140
    for i in range(DAYS):
        d = PERIOD_START + timedelta(days=i)
        share = max(0.05, rng.gauss(m.digital_share, 0.06))
        total = round_to(true_sales[d] * share, 100 if m.code == "ID" else 1)
        count = max(0, int(total / avg_ticket * rng.uniform(0.85, 1.15))) if total else 0
        pack.statement.append(StatementDay(d.isoformat(), count, total))

    return pack


def fmt_amount(m: Market, v: int) -> str:
    if m.code == "ID":
        return f"Rp {v:,.0f}".replace(",", ".")
    return f"₹{v:,.0f}"


def render_statement(pack: Pack, out: Path) -> None:
    """Render a plain, unbranded monthly merchant statement as a PNG."""
    m = pack.spec.market
    W, H = 1240, 1754
    img = Image.new("RGB", (W, H), "white")
    draw = ImageDraw.Draw(img)
    f_title = ImageFont.truetype(FONT_BOLD, 40)
    f_head = ImageFont.truetype(FONT_BOLD, 24)
    f_body = ImageFont.truetype(FONT_REG, 24)
    f_small = ImageFont.truetype(FONT_REG, 20)

    draw.rectangle([0, 0, W, 150], fill="#20304f")
    draw.text((60, 40), f"{m.rail} Merchant Statement", font=f_title, fill="white")
    draw.text((60, 100), "Sample statement generated for the Bukti prototype (synthetic data)",
              font=f_small, fill="#c9d3e6")

    y = 190
    for label, value in [
        ("Merchant", f"{pack.spec.persona} — {pack.spec.business}"),
        ("Location", pack.spec.city),
        ("Period", f"{PERIOD_START.isoformat()} to {(PERIOD_START + timedelta(days=DAYS - 1)).isoformat()}"),
        ("Merchant ID", f"BKT-{pack.spec.market.code}-{1000 + pack.spec.seed:04d}"),
    ]:
        draw.text((60, y), label, font=f_head, fill="#20304f")
        draw.text((300, y), value, font=f_body, fill="#222")
        y += 40

    y += 20
    cols = [60, 420, 760]
    draw.rectangle([40, y - 8, W - 40, y + 36], fill="#eef1f7")
    for x, h in zip(cols, ["Date", "Transactions", f"Total received ({m.currency})"]):
        draw.text((x, y), h, font=f_head, fill="#20304f")
    y += 50
    for row in pack.statement:
        draw.text((cols[0], y), row.date, font=f_body, fill="#222")
        draw.text((cols[1], y), str(row.transactions), font=f_body, fill="#222")
        draw.text((cols[2], y), fmt_amount(m, row.total), font=f_body, fill="#222")
        y += 40
        draw.line([40, y - 6, W - 40, y - 6], fill="#e3e6ec", width=1)

    total = sum(r.total for r in pack.statement)
    count = sum(r.transactions for r in pack.statement)
    y += 10
    draw.text((cols[0], y), "TOTAL", font=f_head, fill="#20304f")
    draw.text((cols[1], y), str(count), font=f_head, fill="#20304f")
    draw.text((cols[2], y), fmt_amount(m, total), font=f_head, fill="#20304f")
    img.save(out, optimize=True)


FONT_HAND = "/System/Library/Fonts/Supplemental/Bradley Hand Bold.ttf"


def short_amount(m: Market, v: int) -> str:
    """How a shop owner would write it: 463.500 / 4,250."""
    if m.code == "ID":
        return f"{v:,.0f}".replace(",", ".")
    return f"{v:,.0f}"


def render_placeholder_pages(pack: Pack, out_dir: Path) -> None:
    """Notebook-style placeholder pages, used until the real handwritten photos arrive."""
    m = pack.spec.market
    rng = random.Random(pack.spec.seed * 7)
    W, H = 1200, 1600
    hand = ImageFont.truetype(FONT_HAND, 38)
    hand_small = ImageFont.truetype(FONT_HAND, 30)
    ink = (30, 42, 90)
    for page in (1, 2):
        img = Image.new("RGB", (W, H), (247, 243, 232))
        draw = ImageDraw.Draw(img)
        for y in range(160, H - 40, 64):
            draw.line([40, y, W - 40, y], fill=(170, 196, 222), width=2)
        draw.line([150, 60, 150, H - 40], fill=(214, 120, 120), width=3)
        title = "Buku Kas" if m.code == "ID" else "Kanakku book"
        draw.text((180, 70), title, font=hand, fill=ink)
        draw.text((W - 330, 82), f"hal. {page}" if m.code == "ID" else f"page {page}", font=hand_small, fill=ink)
        y = 120
        for line in [x for x in pack.lines if x.page == page]:
            y += 64
            jitter = rng.randint(-4, 4)
            dd = date.fromisoformat(line.date)
            draw.text((52, y - 46 + jitter), f"{dd.day}/{dd.month}", font=hand_small, fill=ink)
            # Pillow here has no complex-script shaping, so Tamil placeholders use the English gloss.
            # The teammates' real handwritten photos carry the Tamil script.
            desc = line.description.split(" (")[1].rstrip(")") if " (" in line.description else line.description
            draw.text((175 + rng.randint(0, 8), y - 46 + jitter), desc, font=hand_small, fill=ink)
            if line.amount_in:
                draw.text((720 + rng.randint(-6, 6), y - 50 + jitter), short_amount(m, line.amount_in), font=hand, fill=ink)
            if line.amount_out:
                draw.text((960 + rng.randint(-6, 6), y - 50 + jitter), short_amount(m, line.amount_out), font=hand, fill=ink)
        img = img.rotate(rng.uniform(-1.2, 1.2), expand=False, fillcolor=(90, 80, 70))
        img.save(out_dir / f"page{page}.jpg", quality=86)


def write_pack(pack: Pack) -> None:
    d = PACKS_DIR / pack.spec.id
    (d / "photos").mkdir(parents=True, exist_ok=True)
    with open(d / "ground_truth.csv", "w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=list(asdict(pack.lines[0]).keys()))
        w.writeheader()
        for line in pack.lines:
            w.writerow(asdict(line))
    with open(d / "statement.csv", "w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=["date", "transactions", "total"])
        w.writeheader()
        for row in pack.statement:
            w.writerow(asdict(row))
    render_statement(pack, d / "statement.png")
    (d / "placeholder").mkdir(exist_ok=True)
    render_placeholder_pages(pack, d / "placeholder")
    s = pack.spec
    meta = {
        "id": s.id, "label": s.label, "persona": s.persona, "business": s.business, "city": s.city,
        "market": s.market.code, "language": s.market.language, "currency": s.market.currency,
        "rail": s.market.rail, "hero": s.hero, "note": s.note,
        "period_start": PERIOD_START.isoformat(), "days": DAYS,
    }
    (d / "meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")


HANDWRITING_RULES = {
    "genuine": "Write it like a real shop owner over time: switch between two pens, let the writing drift a bit, "
               "cross out and rewrite ONE amount somewhere. Abbreviations are fine (450rb, 4.2k).",
    "inflated": "Write it naturally, exactly like a genuine pack (two pens, one correction). The lie is in the numbers, "
                "not the handwriting.",
    "fabricated": "Write the whole pack in ONE sitting with ONE pen, neatly, no corrections. That is how fake ledgers "
                  "usually look.",
}


def kit_html(packs: list[Pack]) -> str:
    parts = ["""<!doctype html><html><head><meta charset="utf-8"><title>Bukti handwriting kit</title>
<style>
body{font-family:Georgia,serif;margin:32px;color:#222;max-width:900px}
h1{font-size:28px} h2{margin-top:48px;border-top:3px solid #1E2A5A;padding-top:16px}
h3{margin-bottom:4px} table{border-collapse:collapse;width:100%;margin:8px 0 24px}
td,th{border:1px solid #bbb;padding:5px 8px;font-size:15px;text-align:left}
th{background:#f3eee2} .amt{text-align:right;font-family:Menlo,monospace}
.box{background:#fff7df;border-left:5px solid #E8A317;padding:10px 14px;margin:10px 0}
@media print{h2{page-break-before:always}}
</style></head><body>
<h1>Bukti handwriting kit</h1>
<div class="box"><b>What this is.</b> Each section below is one loan applicant. Copy each page into a real paper
notebook (school exercise book is perfect), then photograph it. The numbers must match exactly; the descriptions can
be reworded naturally in the same language. Dates can be written short (1/9, 2/9...).</div>
<div class="box"><b>Photos.</b> One photo per page, daylight or a bright room, whole page in frame, a slight tilt is
fine (it makes the demo more real). Save as <code>data/packs/&lt;id&gt;/photos/page1.jpg</code> and
<code>page2.jpg</code>. Hero packs (sari, murugan) also need: 1 photo of a small shop shelf or kitchen shelf
(<code>shop.jpg</code>) and 1-2 handwritten supplier receipts for any two expense lines (<code>receipt1.jpg</code>).</div>
<div class="box"><b>Notebook columns.</b> Date | Description | In (money received) | Out (money spent).</div>
"""]
    for p in packs:
        s = p.spec
        m = s.market
        parts.append(f"<h2>Pack <code>{s.id}</code> — {s.persona} ({s.business}, {s.city})</h2>")
        parts.append(f"<p><b>Language:</b> {m.language} &nbsp; <b>Type:</b> {s.label}"
                     f"{' &nbsp; <b>HERO DEMO PACK</b>' if s.hero else ''}</p>")
        parts.append(f"<div class='box'><b>How to write it:</b> {HANDWRITING_RULES[s.label]}</div>")
        for page in (1, 2):
            parts.append(f"<h3>Page {page}</h3><table><tr><th>Date</th><th>Description</th>"
                         f"<th class='amt'>In</th><th class='amt'>Out</th></tr>")
            for line in [x for x in p.lines if x.page == page]:
                dd = date.fromisoformat(line.date)
                parts.append(
                    f"<tr><td>{dd.day}/{dd.month}</td><td>{line.description}</td>"
                    f"<td class='amt'>{fmt_amount(m, line.amount_in) if line.amount_in else ''}</td>"
                    f"<td class='amt'>{fmt_amount(m, line.amount_out) if line.amount_out else ''}</td></tr>")
            parts.append("</table>")
    parts.append("</body></html>")
    return "\n".join(parts)


def main() -> None:
    PACKS_DIR.mkdir(parents=True, exist_ok=True)
    packs = [build_pack(s) for s in PACKS]
    for p in packs:
        write_pack(p)
        ledger = sum(x.amount_in for x in p.lines)
        digital = sum(x.total for x in p.statement)
        print(f"{p.spec.id:9s} {p.spec.label:10s} lines={len(p.lines):3d} "
              f"ledger_in={ledger:>12,} digital={digital:>11,} share={digital / ledger:.2f}")
    (ROOT / "handwriting_kit.html").write_text(kit_html(packs), encoding="utf-8")
    print(f"kit: {ROOT / 'handwriting_kit.html'}")


if __name__ == "__main__":
    main()
