# Bukti sample lender policy (v1, illustrative)

This is a sample credit policy written for the Bukti prototype. It shows how a lender licensing Bukti
would encode its rules. It is not a real lender's policy and not legal advice.

## 1. Who this policy serves

1.1 Informal micro-businesses (warung, kirana, kios, tiffin stalls) that keep their own records but have no
audited financial statements, payslips or bureau history.

1.2 Evidence accepted: handwritten cash notebooks, digital payment statements (QRIS in Indonesia, UPI in
India), supplier receipts, photos of the shop, and a short interview with the owner.

## 2. Verifying sales

2.1 Notebook sales are the starting point. They are verified against the digital payment statement for the
same period.

2.2 The share of notebook sales that also appears as digital payments must fall within the band observed for
similar shops in the same market (peer benchmark). In this prototype the band comes from BigQuery.

2.3 Busy and slow days in the notebook should move with the payment records. A weak daily correlation is a
warning; no correlation is a failure.

2.4 When notebook sales are not supported by payment records, size the loan on the statement-implied sales
(statement total divided by the peer digital share), not on the notebook.

## 3. Affordability

3.1 Weekly installments may not exceed 30% of verified weekly net cash flow. When repayments are shaped to the
shop's monthly cycle, the 30% limit applies to each week's expected net cash.

3.2 Net cash flow is verified sales multiplied by the gross margin implied by the notebook's stock purchases,
bounded between 10% and 30%. Where purchases are not recorded, the market default margin applies.

3.3 First loans: tenor 16 weeks. Maximum Rp 10.000.000 (Indonesia) or ₹50,000 (India). Minimum
Rp 1.000.000 or ₹5,000; below the minimum the application is declined with coaching.

3.4 Pricing (illustrative): flat 1.5% per month (Indonesia), 2% per month (India).

## 4. Repayment shaped to cash flow

4.1 Installments follow the shop's own monthly pattern measured from the payment records: larger in strong
weeks (around paydays), smaller in weak weeks. The total repaid is unchanged.

## 5. Integrity and human review

5.1 Integrity tests: round-number test, too-regular entries, sales on idle days, and re-used photos.

5.2 Two or more integrity failures require human review before any offer is made. The system recommends
"refer"; only a loan officer can decline.

5.3 No decision may use gender, religion, ethnicity, marital status or age. The interview never asks about them.

## 6. Regulatory references (summaries; check the source text)

6.1 India: under the Reserve Bank of India's Master Direction on microfinance loans (2022), a household's
monthly loan repayment obligations may not exceed 50% of monthly household income.

6.2 Indonesia: lenders are supervised by OJK. This sample policy applies stricter affordability (30%) than the
India cap and requires a human decision on flagged cases.
