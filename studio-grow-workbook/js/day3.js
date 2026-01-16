// Day 3: Map Out Your Marketing

class Day3Manager {
  constructor() {
    this.revealedSections = new Set();
    this.init();
  }

  init() {
    this.setupScriptEditor();
    this.setupRevealMechanisms();
    this.setupHexagonNotes();
    this.loadSavedData();
  }

  setupScriptEditor() {
    const scriptEditor = document.getElementById('script-editor');
    if (scriptEditor) {
      scriptEditor.addEventListener('input', () => {
        this.saveScript(scriptEditor.value);
        this.updateWordCount();
      });
    }

    // Export button
    const exportBtn = document.getElementById('export-script');
    if (exportBtn) {
      exportBtn.addEventListener('click', () => {
        this.exportScript();
      });
    }

    // Print button
    const printBtn = document.getElementById('print-script');
    if (printBtn) {
      printBtn.addEventListener('click', () => {
        this.printScript();
      });
    }
  }

  setupRevealMechanisms() {
    // Handle category point reveals (similar to Day 1)
    const revealButtons = document.querySelectorAll('.category-point-reveal');
    revealButtons.forEach(button => {
      button.addEventListener('click', (e) => {
        e.preventDefault();
        const targetId = button.getAttribute('data-target');
        this.toggleReveal(targetId, button);
      });
    });
  }

  setupHexagonNotes() {
    const hexagonNotes = document.getElementById('objection-hexagon-notes');
    if (hexagonNotes) {
      hexagonNotes.addEventListener('input', () => {
        localStorage.setItem('day3_hexagon_notes', hexagonNotes.value);
      });
    }
  }

  toggleReveal(targetId, button) {
    const content = document.getElementById(targetId);
    if (!content) return;

    const isCurrentlyVisible = content.style.display !== 'none';
    
    if (isCurrentlyVisible) {
      content.style.display = 'none';
      button.textContent = button.textContent.replace('Hide', 'Reveal');
      this.revealedSections.delete(targetId);
    } else {
      content.style.display = 'block';
      button.textContent = button.textContent.replace('Reveal', 'Hide');
      this.revealedSections.add(targetId);
    }

    this.saveRevealedSections();
  }

  updateWordCount() {
    const scriptEditor = document.getElementById('script-editor');
    const wordCountDisplay = document.getElementById('word-count');
    
    if (scriptEditor && wordCountDisplay) {
      const text = scriptEditor.value.trim();
      const wordCount = text.length > 0 ? text.split(/\s+/).length : 0;
      wordCountDisplay.textContent = `${wordCount} words`;
    }
  }

  saveScript(content) {
    localStorage.setItem('day3_script', content);
  }

  saveRevealedSections() {
    localStorage.setItem('day3_revealedSections', JSON.stringify(Array.from(this.revealedSections)));
  }

  exportScript() {
    const scriptEditor = document.getElementById('script-editor');
    if (!scriptEditor || !scriptEditor.value.trim()) {
      alert('Your script is empty. Please write something before exporting.');
      return;
    }

    const content = scriptEditor.value;
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'my-sales-script.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  printScript() {
    const scriptEditor = document.getElementById('script-editor');
    if (!scriptEditor || !scriptEditor.value.trim()) {
      alert('Your script is empty. Please write something before printing.');
      return;
    }

    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
      <html>
        <head>
          <title>My Sales Script</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 40px; line-height: 1.6; }
            h1 { margin-bottom: 20px; }
            pre { white-space: pre-wrap; font-family: inherit; }
          </style>
        </head>
        <body>
          <h1>My Sales Script</h1>
          <pre>${scriptEditor.value}</pre>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.print();
  }

  loadSavedData() {
    // Load script
    const savedScript = localStorage.getItem('day3_script');
    if (savedScript) {
      const scriptEditor = document.getElementById('script-editor');
      if (scriptEditor) {
        scriptEditor.value = savedScript;
        this.updateWordCount();
      }
    }

    // Load revealed sections
    const savedRevealed = localStorage.getItem('day3_revealedSections');
    if (savedRevealed) {
      this.revealedSections = new Set(JSON.parse(savedRevealed));
      this.revealedSections.forEach(sectionId => {
        const content = document.getElementById(sectionId);
        const button = document.querySelector(`[data-target="${sectionId}"]`);
        if (content && button) {
          content.style.display = 'block';
          button.textContent = button.textContent.replace('Reveal', 'Hide');
        }
      });
    }

    // Load hexagon notes
    const savedHexagonNotes = localStorage.getItem('day3_hexagon_notes');
    if (savedHexagonNotes) {
      const hexagonNotes = document.getElementById('objection-hexagon-notes');
      if (hexagonNotes) {
        hexagonNotes.value = savedHexagonNotes;
      }
    }
  }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  window.day3Manager = new Day3Manager();
});
