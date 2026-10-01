/* =========================================================================
   AHOURA'S MEGAGANKYBANK — loans.js
   -------------------------------------------------------------------------
   Powers the interactive loan/mortgage calculator on loans.html.
   Standard amortization formula:
       M = P * (r(1+r)^n) / ((1+r)^n - 1)
   where:
       M = monthly payment
       P = principal (loan amount)
       r = monthly interest rate (annual / 12 / 100)
       n = number of months (years * 12)
   ========================================================================= */

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('loan-calc');
  if (!form) return;

  const amountInput = form.querySelector('[name="amount"]');
  const ratePicker  = form.querySelector('[name="rate"]');
  const termPicker  = form.querySelector('[name="term"]');
  const amountOut   = document.getElementById('calc-amount-out');
  const rateOut     = document.getElementById('calc-rate-out');
  const termOut     = document.getElementById('calc-term-out');
  const monthlyOut  = document.getElementById('calc-monthly');
  const totalOut    = document.getElementById('calc-total');
  const interestOut = document.getElementById('calc-interest');

  // Recompute on any input change so the result updates live
  function recompute() {
    const P = parseFloat(amountInput.value) || 0;
    const annualRate = parseFloat(ratePicker.value) || 0;
    const years = parseFloat(termPicker.value) || 0;
    const r = annualRate / 100 / 12;
    const n = years * 12;

    // Mirror the slider values into the readouts beside the labels
    amountOut.textContent = '$' + P.toLocaleString();
    rateOut.textContent = annualRate.toFixed(2) + '%';
    termOut.textContent = years + ' yrs';

    // Handle zero-rate edge case (otherwise we'd divide by zero)
    let monthly;
    if (r === 0) {
      monthly = P / n;
    } else {
      monthly = (P * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
    }

    const total = monthly * n;
    const interest = total - P;

    // Pretty-format the outputs as USD
    const fmt = (v) => '$' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    monthlyOut.textContent  = fmt(monthly || 0);
    totalOut.textContent    = fmt(total || 0);
    interestOut.textContent = fmt(interest || 0);
  }

  // Wire up live updates: 'input' fires as the slider drags
  [amountInput, ratePicker, termPicker].forEach((el) => {
    el.addEventListener('input', recompute);
  });

  // Run once on load to populate initial values
  recompute();

  // "Apply Now" intercept — pop a toast since this is a demo
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    window.toast('Your application would be submitted here. (Demo only)', 'success');
  });
});
