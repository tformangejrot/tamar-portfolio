// Day 1: Drafting Your Studio Blueprints

class Day1Manager {
  constructor() {
    this.studioSizes = {
      private: {
        name: 'Private Studio',
        spots: '1 spot',
        membersRange: { min: 5, max: 15, default: 10 },
        color: 'green',
        colorClass: 'private'
      },
      small: {
        name: 'Small Group Studio',
        spots: '2-9 spots',
        membersRange: { min: 10, max: 30, default: 20 },
        color: 'yellow',
        colorClass: 'small'
      },
      mid: {
        name: 'Mid-Size Studio',
        spots: '10-20 spots',
        membersRange: { min: 20, max: 60, default: 40 },
        color: 'teal',
        colorClass: 'mid'
      },
      large: {
        name: 'Large Studio',
        spots: '21+ spots',
        membersRange: { min: 60, max: 225, default: 142 },
        color: 'orange',
        colorClass: 'large'
      }
    };

    this.selectedSize = null;
    this.init();
  }

  init() {
    this.setupStudioSizeSelector();
    this.setupRevealMechanisms();
    this.setupGapCircles();
    this.setupImplementationTables();
    this.loadSavedData();
  }

  setupStudioSizeSelector() {
    const cards = document.querySelectorAll('.studio-size-card');
    cards.forEach(card => {
      card.addEventListener('click', () => {
        const sizeKey = card.dataset.size;
        this.selectStudioSize(sizeKey);
      });
    });
  }

  selectStudioSize(sizeKey) {
    // Remove previous selection
    document.querySelectorAll('.studio-size-card').forEach(card => {
      card.classList.remove('selected');
    });

    // Add selection to clicked card
    const card = document.querySelector(`[data-size="${sizeKey}"]`);
    if (card) {
      card.classList.add('selected');
    }

    this.selectedSize = this.studioSizes[sizeKey];
    this.calculateAndDisplayNumbers(sizeKey);
    this.saveStudioSize(sizeKey);
  }

  calculateAndDisplayNumbers(sizeKey) {
    const size = this.studioSizes[sizeKey];
    if (!size) {
      console.error('Invalid size key:', sizeKey);
      return;
    }
    
    const membersMin = size.membersRange.min;
    const membersMax = size.membersRange.max;
    const introsMin = membersMin * 2;
    const introsMax = membersMax * 2;
    const leadsMin = Math.round(introsMin * 2.22);
    const leadsMax = Math.round(introsMax * 2.22);

    // Update hexagon display
    const hexDisplay = document.getElementById('hex-numbers-display');
    if (hexDisplay) {
      const leadsEl = document.getElementById('hex-leads');
      const introsEl = document.getElementById('hex-intros');
      const membersEl = document.getElementById('hex-members');
      
      if (leadsEl) leadsEl.textContent = `${leadsMin}-${leadsMax}`;
      if (introsEl) introsEl.textContent = `${introsMin}-${introsMax}`;
      if (membersEl) membersEl.textContent = `${membersMin}-${membersMax}`;
      
      hexDisplay.style.display = 'flex';
    }
  }

  setupRevealMechanisms() {
    // General reveal triggers (for other sections)
    const revealTriggers = document.querySelectorAll('.reveal-trigger');
    revealTriggers.forEach(trigger => {
      trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        const targetId = trigger.dataset.target;
        const content = document.getElementById(targetId);
        if (content) {
          const isHidden = content.style.display === 'none' || !content.classList.contains('revealed');
          
          if (isHidden) {
            content.style.display = 'block';
            content.classList.add('revealed');
            trigger.textContent = trigger.textContent.replace('Reveal', 'Hide');
          } else {
            content.style.display = 'none';
            content.classList.remove('revealed');
            trigger.textContent = trigger.textContent.replace('Hide', 'Reveal');
          }
        }
      });
    });

    // Category point reveals (individual bullet points)
    const categoryPointReveals = document.querySelectorAll('.category-point-reveal');
    categoryPointReveals.forEach(button => {
      button.addEventListener('click', (e) => {
        e.stopPropagation();
        const targetId = button.dataset.target;
        const content = document.getElementById(targetId);
        if (content) {
          const isHidden = content.style.display === 'none' || !content.classList.contains('revealed');
          
          if (isHidden) {
            content.style.display = 'block';
            content.classList.add('revealed');
            button.textContent = 'Hide';
            button.classList.add('revealed');
          } else {
            content.style.display = 'none';
            content.classList.remove('revealed');
            button.textContent = 'Reveal';
            button.classList.remove('revealed');
          }
        }
      });
    });
  }

  setupGapCircles() {
    // Gap circles are now just visual elements - individual reveals are handled by category-point-reveal buttons
    // No action needed here as the reveal mechanism is already set up in setupRevealMechanisms
  }

  setupImplementationTables() {
    // Implementation #1 - Auto-save on input
    const impl1Inputs = document.querySelectorAll('#implementation1-table-body input');
    impl1Inputs.forEach(input => {
      input.addEventListener('input', () => {
        this.saveImplementation1();
      });
    });

    // Implementation #2 - Auto-save on input
    const impl2Inputs = document.querySelectorAll('#implementation2-table-body input, #implementation2-table-body textarea');
    impl2Inputs.forEach(input => {
      input.addEventListener('input', () => {
        this.saveImplementation2();
      });
    });

    // Add row buttons
    const addRow1 = document.getElementById('add-implementation1-row');
    if (addRow1) {
      addRow1.addEventListener('click', () => {
        this.addImplementation1Row();
      });
    }

    const addRow2 = document.getElementById('add-implementation2-row');
    if (addRow2) {
      addRow2.addEventListener('click', () => {
        this.addImplementation2Row();
      });
    }
  }

  addImplementation1Row() {
    const tbody = document.getElementById('implementation1-table-body');
    if (!tbody) return;

    const rowCount = tbody.children.length;
    const newRow = document.createElement('tr');
    newRow.innerHTML = `
      <td><input type="text" value="" class="day-input" data-row="${rowCount}"></td>
      <td><input type="text" value="" class="type-input" data-row="${rowCount}"></td>
      <td><input type="text" value="" class="content-input" data-row="${rowCount}"></td>
      <td><input type="text" value="" class="cta-input" data-row="${rowCount}"></td>
    `;
    
    tbody.appendChild(newRow);
    
    // Add event listeners to new inputs
    const inputs = newRow.querySelectorAll('input');
    inputs.forEach(input => {
      input.addEventListener('input', () => {
        this.saveImplementation1();
      });
    });
    
    this.saveImplementation1();
  }

  addImplementation2Row() {
    const tbody = document.getElementById('implementation2-table-body');
    if (!tbody) return;

    const rowCount = tbody.children.length;
    const newRow = document.createElement('tr');
    newRow.innerHTML = `
      <td style="text-align: center;">
        <div style="width: 40px; height: 40px; border: 3px solid #FF6B35; border: 3px solid var(--color-bg-orange, #FF6B35); transform: rotate(45deg); margin: 0 auto; display: flex; align-items: center; justify-content: center;">
          <span style="transform: rotate(-45deg); font-weight: 700; color: #FF6B35; color: var(--color-bg-orange, #FF6B35);">${rowCount + 1}</span>
        </div>
      </td>
      <td><input type="text" value="" class="when-input" data-row="${rowCount}"></td>
      <td><input type="text" value="" class="how-input" data-row="${rowCount}"></td>
      <td><textarea class="what-input" data-row="${rowCount}" style="min-height: 60px; resize: vertical;"></textarea></td>
    `;
    
    tbody.appendChild(newRow);
    
    // Add event listeners to new inputs
    const inputs = newRow.querySelectorAll('input, textarea');
    inputs.forEach(input => {
      input.addEventListener('input', () => {
        this.saveImplementation2();
      });
    });
    
    this.saveImplementation2();
  }

  saveStudioSize(sizeKey) {
    localStorage.setItem('day1_studioSize', sizeKey);
  }

  saveImplementation1() {
    const tbody = document.getElementById('implementation1-table-body');
    if (!tbody) return;

    const rows = Array.from(tbody.children);
    const data = rows.map(row => {
      const inputs = row.querySelectorAll('input');
      return {
        day: inputs[0]?.value || '',
        type: inputs[1]?.value || '',
        content: inputs[2]?.value || '',
        cta: inputs[3]?.value || ''
      };
    });

    localStorage.setItem('day1_implementation1', JSON.stringify(data));
  }

  saveImplementation2() {
    const tbody = document.getElementById('implementation2-table-body');
    if (!tbody) return;

    const rows = Array.from(tbody.children);
    const data = rows.map(row => {
      const inputs = row.querySelectorAll('input, textarea');
      return {
        when: inputs[0]?.value || '',
        how: inputs[1]?.value || '',
        what: inputs[2]?.value || ''
      };
    });

    localStorage.setItem('day1_implementation2', JSON.stringify(data));
  }

  loadSavedData() {
    // Load studio size
    const savedSize = localStorage.getItem('day1_studioSize');
    if (savedSize && this.studioSizes[savedSize]) {
      this.selectStudioSize(savedSize);
    }

    // Load Implementation #1
    const savedImpl1 = localStorage.getItem('day1_implementation1');
    if (savedImpl1) {
      try {
        const data = JSON.parse(savedImpl1);
        const tbody = document.getElementById('implementation1-table-body');
        if (tbody && data.length > 0) {
          // Only restore if we have saved data and it matches the structure
          data.forEach((rowData, index) => {
            const row = tbody.children[index];
            if (row) {
              const inputs = row.querySelectorAll('input');
              if (inputs[0]) inputs[0].value = rowData.day || '';
              if (inputs[1]) inputs[1].value = rowData.type || '';
              if (inputs[2]) inputs[2].value = rowData.content || '';
              if (inputs[3]) inputs[3].value = rowData.cta || '';
            }
          });
        }
      } catch (e) {
        console.error('Error loading Implementation #1:', e);
      }
    }

    // Load Implementation #2
    const savedImpl2 = localStorage.getItem('day1_implementation2');
    if (savedImpl2) {
      try {
        const data = JSON.parse(savedImpl2);
        const tbody = document.getElementById('implementation2-table-body');
        if (tbody && data.length > 0) {
          data.forEach((rowData, index) => {
            const row = tbody.children[index];
            if (row) {
              const inputs = row.querySelectorAll('input, textarea');
              if (inputs[0]) inputs[0].value = rowData.when || '';
              if (inputs[1]) inputs[1].value = rowData.how || '';
              if (inputs[2]) inputs[2].value = rowData.what || '';
            }
          });
        }
      } catch (e) {
        console.error('Error loading Implementation #2:', e);
      }
    }
  }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  window.day1Manager = new Day1Manager();
});
