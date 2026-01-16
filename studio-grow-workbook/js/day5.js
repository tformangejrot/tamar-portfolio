// Day 5: Iconic Retention

class Day5Manager {
  constructor() {
    this.init();
  }

  init() {
    this.setupEmailEditor();
    this.setupRevealMechanisms();
    this.loadSavedData();
  }

  setupRevealMechanisms() {
    // Handle reveal buttons (same pattern as other days)
    const revealButtons = document.querySelectorAll('.category-point-reveal');
    revealButtons.forEach(button => {
      button.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const targetId = button.getAttribute('data-target');
        this.toggleReveal(targetId, button);
      });
    });
  }

  toggleReveal(targetId, button) {
    const content = document.getElementById(targetId);
    if (!content) return;

    const isCurrentlyVisible = content.style.display !== 'none';
    
    if (isCurrentlyVisible) {
      content.style.display = 'none';
      button.textContent = 'Reveal';
      button.classList.remove('revealed');
    } else {
      content.style.display = 'block';
      button.textContent = 'Hide';
      button.classList.add('revealed');
    }

    // Save state
    this.saveRevealState(targetId, !isCurrentlyVisible);
  }

  saveRevealState(targetId, isRevealed) {
    const state = JSON.parse(localStorage.getItem('day5_reveal_states') || '{}');
    state[targetId] = isRevealed;
    localStorage.setItem('day5_reveal_states', JSON.stringify(state));
  }

  setupEmailEditor() {
    const subjectInput = document.getElementById('email-subject');
    const bodyInput = document.getElementById('email-body');

    // Auto-save on input
    if (subjectInput) {
      subjectInput.addEventListener('input', () => {
        this.saveEmail();
      });
    }

    if (bodyInput) {
      bodyInput.addEventListener('input', () => {
        this.saveEmail();
        this.updateCharacterCount();
      });
    }

    // Export button
    const exportBtn = document.getElementById('export-email');
    if (exportBtn) {
      exportBtn.addEventListener('click', () => {
        this.exportEmail();
      });
    }

    // Copy button
    const copyBtn = document.getElementById('copy-email');
    if (copyBtn) {
      copyBtn.addEventListener('click', () => {
        this.copyEmail();
      });
    }
  }

  updateCharacterCount() {
    const body = document.getElementById('email-body')?.value || '';
    const count = body.length;
    const countDisplay = document.getElementById('character-count');
    
    if (countDisplay) {
      countDisplay.textContent = `${count} characters`;
      
      // Visual feedback for length
      if (count > 200) {
        countDisplay.style.color = '#FF6B35';
      } else if (count > 100) {
        countDisplay.style.color = '#F5A623';
      } else {
        countDisplay.style.color = 'var(--color-text-light)';
      }
    }
  }

  saveEmail() {
    const emailData = {
      subject: document.getElementById('email-subject')?.value || '',
      body: document.getElementById('email-body')?.value || ''
    };
    localStorage.setItem('day5_email', JSON.stringify(emailData));
  }

  exportEmail() {
    const subject = document.getElementById('email-subject')?.value || '';
    const body = document.getElementById('email-body')?.value || '';

    if (!subject && !body) {
      alert('Your email is empty. Please write something before exporting.');
      return;
    }

    const fullEmail = `Subject: ${subject}\n\n${body}`;
    
    const blob = new Blob([fullEmail], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'outreach-email.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  copyEmail() {
    const subject = document.getElementById('email-subject')?.value || '';
    const body = document.getElementById('email-body')?.value || '';

    if (!subject && !body) {
      alert('Your email is empty. Please write something before copying.');
      return;
    }

    const fullEmail = `Subject: ${subject}\n\n${body}`;
    
    navigator.clipboard.writeText(fullEmail).then(() => {
      const copyBtn = document.getElementById('copy-email');
      const originalText = copyBtn.textContent;
      copyBtn.textContent = 'Copied!';
      copyBtn.style.background = '#27ae60';
      setTimeout(() => {
        copyBtn.textContent = originalText;
        copyBtn.style.background = '#FF6B35';
      }, 2000);
    }).catch(err => {
      alert('Failed to copy email. Please select and copy manually.');
    });
  }

  loadSavedData() {
    const savedEmail = localStorage.getItem('day5_email');
    if (savedEmail) {
      try {
        const emailData = JSON.parse(savedEmail);
        if (emailData.subject) {
          const subjectInput = document.getElementById('email-subject');
          if (subjectInput) subjectInput.value = emailData.subject;
        }
        if (emailData.body) {
          const bodyInput = document.getElementById('email-body');
          if (bodyInput) {
            bodyInput.value = emailData.body;
            this.updateCharacterCount();
          }
        }
      } catch (e) {
        console.error('Error loading saved email:', e);
      }
    }

    // Load reveal states
    const savedStates = localStorage.getItem('day5_reveal_states');
    if (savedStates) {
      try {
        const states = JSON.parse(savedStates);
        Object.keys(states).forEach(targetId => {
          const content = document.getElementById(targetId);
          const button = document.querySelector(`[data-target="${targetId}"]`);
          if (content && button && states[targetId]) {
            content.style.display = 'block';
            button.textContent = 'Hide';
            button.classList.add('revealed');
          }
        });
      } catch (e) {
        console.error('Error loading reveal states:', e);
      }
    }
  }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  window.day5Manager = new Day5Manager();
});
