// Preview data comes from docs-site/previews.js, which docs-site/generate.mjs
// regenerates from the real built @celestial packages. The terminal panes are
// actual framework renders; the snippets are the typechecked files in
// docs-site/snippets/. Nothing here is hand-drawn markup.
const PREVIEWS = window.CELESTIAL_PREVIEWS ?? {};

let currentKey = 'tool-call';

function selectComponent(key) {
  currentKey = key;
  const preview = PREVIEWS[key];

  // Update Nav
  document.querySelectorAll('.nav-item').forEach((btn) => {
    btn.classList.remove('active');
    if (btn.getAttribute('onclick')?.includes(`'${key}'`)) {
      btn.classList.add('active');
    }
  });

  const screen = document.getElementById('terminal-screen');
  if (!preview) {
    screen.textContent = 'Previews not generated yet — run `node docs-site/generate.mjs` from the repo root to build them from the real packages.';
    document.getElementById('code-snippet').textContent = '';
    document.getElementById('code-filename').textContent = 'docs-site/snippets/';
    document.getElementById('terminal-title').textContent = 'celestial preview';
    return;
  }

  // Update Terminal Output (real rendered cells) and snippet (verbatim source)
  screen.innerHTML = preview.html;
  document.getElementById('code-snippet').textContent = preview.code;
  document.getElementById('code-filename').textContent = preview.filename;
  document.getElementById('terminal-title').textContent = preview.terminal;
}

function copyCode() {
  const preview = PREVIEWS[currentKey];
  if (preview) {
    navigator.clipboard.writeText(preview.code);
    const btn = document.querySelector('.code-header .copy-btn');
    const orig = btn.textContent;
    btn.textContent = 'Copied!';
    setTimeout(() => {
      btn.textContent = orig;
    }, 1500);
  }
}

function copyCommand(text) {
  navigator.clipboard.writeText(text);
  const btn = document.querySelector('.code-pill .copy-btn');
  const orig = btn.textContent;
  btn.textContent = 'Copied!';
  setTimeout(() => {
    btn.textContent = orig;
  }, 1500);
}

// Initialize on load
document.addEventListener('DOMContentLoaded', () => {
  selectComponent('tool-call');
});

// Inline handlers in index.html call these through the global scope.
window.selectComponent = selectComponent;
window.copyCode = copyCode;
window.copyCommand = copyCommand;
