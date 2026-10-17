# Bukti evaluation

- Packs: 8 (0 with real handwritten photos)
- Line-level extraction accuracy (date + direction + amount exact): 290/290 = 100.0%
- Decision accuracy (genuine→approve, inflated→reduced, fabricated→refer): 8/8
- Median time from evidence to decision: 34.9s

| Pack | Type | Market | Real photos | Lines exact | Decision | Correct | Seconds |
|---|---|---|---|---|---|---|---|
| sari | genuine | ID | placeholder | 38/38 | approve | ✓ | 36.9 |
| murugan | genuine | IN | placeholder | 38/38 | approve | ✓ | 70.9 |
| rina | fabricated | ID | placeholder | 31/31 | refer | ✓ | 15.3 |
| joko | genuine | ID | placeholder | 38/38 | approve | ✓ | 52.7 |
| lakshmi | genuine | IN | placeholder | 38/38 | approve | ✓ | 28.2 |
| dewi | inflated | ID | placeholder | 38/38 | approve_reduced | ✓ | 33.8 |
| selvam | inflated | IN | placeholder | 38/38 | approve_reduced | ✓ | 31.7 |
| karthik | fabricated | IN | placeholder | 31/31 | refer | ✓ | 34.9 |
