/* =========================================================================
   AHOURA'S MEGAGANKYBANK — contact.js
   -------------------------------------------------------------------------
   Validates and "submits" the contact form on contact.html.
   Pure demo — no real network call is made; we just show a toast.
   ========================================================================= */

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('contact-form');
  if (!form) return;

  form.addEventListener('submit', (e) => {
    e.preventDefault();

    // Pull values from the form's named fields
    const data = {
      name:    form.name.value.trim(),
      email:   form.email.value.trim(),
      topic:   form.topic.value,
      message: form.message.value.trim(),
    };

    // Inline-validate each field with a friendly error message
    const errors = [];
    if (!data.name)    errors.push('Name is required.');
    if (!data.email || !/^\S+@\S+\.\S+$/.test(data.email)) errors.push('Valid email is required.');
    if (!data.topic)   errors.push('Pick a topic.');
    if (data.message.length < 10) errors.push('Message should be at least 10 characters.');

    const errorBox = form.querySelector('.form-error');
    if (errors.length > 0) {
      errorBox.textContent = errors.join(' ');
      errorBox.classList.add('show');
      return;
    }
    errorBox.classList.remove('show');

    // Pretend to send and clear the form on success
    window.toast(`Thanks ${data.name}! We'll get back to you within 24 hours.`, 'success');
    form.reset();
  });
});
