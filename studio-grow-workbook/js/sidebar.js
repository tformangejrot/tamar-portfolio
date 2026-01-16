// Sidebar functionality for "Make It Happen Moments" notes

class Sidebar {
  constructor() {
    this.sidebar = document.getElementById('sidebar');
    this.toggleBtn = document.getElementById('sidebar-toggle');
    this.closeBtn = document.getElementById('sidebar-close');
    this.textarea = document.getElementById('sidebar-notes');
    this.mainContent = document.querySelector('.main-content');
    
    this.init();
  }

  init() {
    // Load saved notes
    this.loadNotes();
    
    // Event listeners
    if (this.toggleBtn) {
      this.toggleBtn.addEventListener('click', () => this.toggle());
    }
    
    if (this.closeBtn) {
      this.closeBtn.addEventListener('click', () => this.close());
    }
    
    if (this.textarea) {
      // Auto-save on input
      this.textarea.addEventListener('input', () => this.saveNotes());
      
      // Save on blur as well
      this.textarea.addEventListener('blur', () => this.saveNotes());
    }
    
    // Close sidebar when clicking outside (optional)
    document.addEventListener('click', (e) => {
      if (this.isOpen() && 
          !this.sidebar.contains(e.target) && 
          !this.toggleBtn.contains(e.target)) {
        // Don't auto-close on mobile, only desktop
        if (window.innerWidth > 768) {
          // Optional: uncomment to enable click-outside-to-close
          // this.close();
        }
      }
    });
  }

  toggle() {
    if (this.isOpen()) {
      this.close();
    } else {
      this.open();
    }
  }

  open() {
    if (this.sidebar) {
      this.sidebar.classList.add('open');
      if (this.toggleBtn) {
        this.toggleBtn.classList.add('open');
        this.toggleBtn.textContent = 'Close Notes';
      }
      if (this.mainContent) {
        this.mainContent.classList.add('sidebar-open');
      }
    }
  }

  close() {
    if (this.sidebar) {
      this.sidebar.classList.remove('open');
      if (this.toggleBtn) {
        this.toggleBtn.classList.remove('open');
        this.toggleBtn.textContent = 'Make It Happen Moments';
      }
      if (this.mainContent) {
        this.mainContent.classList.remove('sidebar-open');
      }
    }
  }

  isOpen() {
    return this.sidebar && this.sidebar.classList.contains('open');
  }

  saveNotes() {
    if (this.textarea) {
      const notes = this.textarea.value;
      localStorage.setItem('studioGrowNotes', notes);
    }
  }

  loadNotes() {
    if (this.textarea) {
      const savedNotes = localStorage.getItem('studioGrowNotes');
      if (savedNotes) {
        this.textarea.value = savedNotes;
      }
    }
  }

  getNotes() {
    return this.textarea ? this.textarea.value : '';
  }

  clearNotes() {
    if (this.textarea) {
      this.textarea.value = '';
      this.saveNotes();
    }
  }
}

// Initialize sidebar when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  window.sidebar = new Sidebar();
});
