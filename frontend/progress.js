'use strict';
// Reading progress panel shown inside the book details dialog.
// Uses helpers from app.js: $, api, escape, toast, load and detail.

async function renderProgress(bookId, book) {
  const panel = $('#progress-panel');
  if (!panel) return;

  // Rule shown to the reader: progress starts only after the book is started.
  if (book.status === 'to-read') {
    panel.innerHTML = `<h2>Reading progress</h2>
      <p class="hint">Set this book to <strong>Reading</strong> to start tracking your pages.</p>`;
    return;
  }

  const progress = await api(`/api/books/${bookId}/progress`);
  const percentage = progress.percentage || 0;

  // A finished book is shown as complete; progress changes only after setting it back to Reading.
  if (book.status === 'finished') {
    panel.innerHTML = `<h2>Reading progress</h2>
      <div class="progress-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="100"><i style="width:100%"></i></div>
      <p class="progress-label"><strong>100%</strong> · finished${progress.pageCount ? ` · ${escape(progress.pageCount)} pages` : ''}</p>
      <p class="hint">To change progress, edit the book and set its status back to Reading.</p>`;
    return;
  }

  panel.innerHTML = `<h2>Reading progress</h2>
    <div class="progress-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percentage}">
      <i style="width:${percentage}%"></i>
    </div>
    <p class="progress-label"><strong>${percentage}%</strong>
      ${progress.pageCount ? `· page ${escape(progress.currentPage)} of ${escape(progress.pageCount)}` : '· no pages recorded yet'}</p>
    <form id="progress-form" class="progress-form">
      <label>Current page<input type="number" name="currentPage" min="0" max="100000" required value="${escape(progress.currentPage ?? 0)}"></label>
      <label>Total pages<input type="number" name="pageCount" min="1" max="100000" required value="${escape(progress.pageCount ?? '')}"></label>
      <button>Update progress</button>
    </form>
    <button type="button" id="lookup-pages" class="text-button">Get page count from Open Library</button>
    <p id="progress-error" role="alert"></p>`;

  // External API: ask the backend to search Open Library for this book's page count.
  $('#lookup-pages').onclick = async () => {
    const button = $('#lookup-pages');
    button.disabled = true;
    $('#progress-error').textContent = '';
    try {
      const results = await api('/api/catalog?q=' + encodeURIComponent(`${book.title} ${book.author}`.slice(0, 120)));
      const match = results.find(result => result.pages);
      if (match) {
        $('#progress-form').elements.pageCount.value = match.pages;
        toast(`Open Library: ${match.pages} pages. Check it, then click Update progress.`);
      } else {
        $('#progress-error').textContent = 'Open Library has no page count for this book. Please enter it manually.';
      }
    } catch (error) {
      $('#progress-error').textContent = error.message;
    } finally {
      button.disabled = false;
    }
  };

  $('#progress-form').onsubmit = async event => {
    event.preventDefault();
    const form = event.target;
    const button = form.querySelector('button');
    button.disabled = true;
    try {
      const result = await api(`/api/books/${bookId}/progress`, {
        method: 'PUT',
        body: JSON.stringify({
          currentPage: Number(form.elements.currentPage.value),
          pageCount: Number(form.elements.pageCount.value)
        })
      });
      if (result.bookStatus === 'finished' && book.status !== 'finished') {
        toast('Last page reached. The book is now marked as finished.');
        await load();            // refresh shelf and statistics
      } else {
        toast(`Progress saved: ${result.percentage}%`);
      }
      await detail(bookId);      // redraw the dialog with the new values
    } catch (error) {
      $('#progress-error').textContent = error.message;
      button.disabled = false;
    }
  };
}
