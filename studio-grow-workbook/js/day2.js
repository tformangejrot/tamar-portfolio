// Day 2: Conversion Funnel & Monthly Targets

class Day2Manager {
  constructor() {
    this.funnelSteps = [
      { id: 'discovery', label: 'Discovery', description: 'Potential client first learns about your studio', color: '#FF6B35' },
      { id: 'investigation', label: 'Investigation', description: 'They research and explore your offerings', color: '#F5A623' },
      { id: 'lead-phase', label: 'Lead Phase', description: 'They inquire or show interest in joining', color: '#04CBC2' },
      { id: 'intro-package', label: 'Intro Package', description: 'They purchase your introductory offer', color: '#3498db' },
      { id: 'pre-session', label: 'Pre Session', description: 'Before their first class - preparation and communication', color: '#9b59b6' },
      { id: 'during-session', label: 'During Session', description: 'Their actual class experience', color: '#e74c3c' },
      { id: 'post-session', label: 'Post Session', description: 'Follow-up after their first class', color: '#27ae60' },
      { id: 'new-member', label: 'New Member', description: 'They convert to a full membership', color: '#2c3e50' }
    ];
    
    this.funnelProgress = {
      discovery: false,
      investigation: false,
      'lead-phase': false,
      'intro-package': false,
      'pre-session': false,
      'during-session': false,
      'post-session': false,
      'new-member': false
    };

    this.conversionFields = {
      'lead-phase-traditional': false,
      'lead-phase-studio-grow': false,
      'post-session-traditional': false,
      'post-session-studio-grow': false
    };

    this.monthlyTargets = {
      highMonths: [],
      lowMonths: [],
      averageMembers: null,
      leadToIntroRate: 45,
      introToMemberRate: 50
    };

    this.init();
  }

  init() {
    this.setupFunnelBuilder();
    this.setupConversionFields();
    this.setupMonthlyTargetsCalculator();
    this.loadSavedData();
    this.loadFunnelReveals();
  }

  setupFunnelBuilder() {
    // Set up reveal buttons for timeline-style steps
    const revealButtons = document.querySelectorAll('.reveal-btn');
    revealButtons.forEach(button => {
      button.addEventListener('click', (e) => {
        e.stopPropagation();
        const step = button.dataset.step;
        const type = button.dataset.type;
        this.revealFunnelContent(step, type);
      });
    });
  }

  revealFunnelContent(step, type) {
    const contentContainer = document.querySelector(`.funnel-revealed-content[data-step="${step}"]`);
    if (!contentContainer) return;

    const targetElement = contentContainer.querySelector(`.revealed-${type}`);
    if (!targetElement) return;

    const isVisible = targetElement.style.display !== 'none' && targetElement.style.display !== '';
    
    if (isVisible) {
      targetElement.style.display = 'none';
    } else {
      targetElement.style.display = 'block';
    }

    // Update button text
    const button = document.querySelector(`.reveal-btn[data-step="${step}"][data-type="${type}"]`);
    if (button) {
      button.textContent = isVisible ? `Reveal ${type.charAt(0).toUpperCase() + type.slice(1)}` : `Hide ${type.charAt(0).toUpperCase() + type.slice(1)}`;
    }

    // Save state
    const stateKey = `day2_funnel_${step}_${type}`;
    localStorage.setItem(stateKey, !isVisible);
  }

  setupConversionFields() {
    const fields = document.querySelectorAll('.conversion-field');
    fields.forEach(field => {
      field.addEventListener('click', () => {
        const location = field.dataset.location;
        const type = field.dataset.type;
        this.revealConversionField(location, type);
      });
    });
  }

  revealConversionField(location, type) {
    const field = document.querySelector(`.conversion-field[data-location="${location}"][data-type="${type}"]`);
    if (!field) return;

    const cover = field.querySelector('.conversion-field-cover');
    const content = field.querySelector('.conversion-field-content');
    const fieldKey = `${location}-${type}`;

    if (cover && content) {
      const isRevealed = cover.style.display === 'none' || cover.classList.contains('revealed');

      if (isRevealed) {
        // Hide it
        cover.style.display = 'flex';
        cover.classList.remove('revealed');
        content.style.display = 'none';
        this.conversionFields[fieldKey] = false;
      } else {
        // Reveal it
        cover.style.display = 'none';
        cover.classList.add('revealed');
        content.style.display = 'block';
        this.conversionFields[fieldKey] = true;
      }

      this.saveConversionFields();
    }
  }

  loadFunnelReveals() {
    // Load saved reveal states for timeline-style steps
    const revealButtons = document.querySelectorAll('.reveal-btn');
    revealButtons.forEach(button => {
      const step = button.dataset.step;
      const type = button.dataset.type;
      const stateKey = `day2_funnel_${step}_${type}`;
      const isRevealed = localStorage.getItem(stateKey) === 'true';
      
      if (isRevealed) {
        const contentContainer = document.querySelector(`.funnel-revealed-content[data-step="${step}"]`);
        if (contentContainer) {
          const targetElement = contentContainer.querySelector(`.revealed-${type}`);
          if (targetElement) {
            targetElement.style.display = 'block';
            button.textContent = `Hide ${type.charAt(0).toUpperCase() + type.slice(1)}`;
          }
        }
      }
    });
  }

  updateFunnelPath() {
    // Update connecting lines between revealed steps
    const stepOrder = ['discovery', 'investigation', 'lead-phase', 'intro-package', 'pre-session', 'during-session', 'post-session', 'new-member'];
    
    stepOrder.forEach((step, index) => {
      if (index < stepOrder.length - 1) {
        const nextStep = stepOrder[index + 1];
        const isCurrentRevealed = this.funnelProgress[step];
        const isNextRevealed = this.funnelProgress[nextStep];
        
        // Find the connecting line after this step
        const tile = document.querySelector(`.funnel-step-tile[data-step="${step}"]`);
        if (tile && tile.parentElement) {
          const connector = tile.parentElement.querySelector('div[style*="width: 30px"]');
          if (connector) {
            const stepInfo = this.funnelSteps.find(s => s.id === step);
            if (isCurrentRevealed && isNextRevealed && stepInfo) {
              connector.style.background = stepInfo.color;
            } else {
              connector.style.background = '#e0e0e0';
            }
          }
        }
      }
    });
  }

  updateFunnelOptions() {
    // No longer needed - tiles are always visible and clickable
  }

  getCurrentFunnelStep() {
    const stepOrder = ['discovery', 'investigation', 'lead-phase', 'intro-package', 'pre-session', 'during-session', 'post-session', 'new-member'];
    for (let i = 0; i < stepOrder.length; i++) {
      if (!this.funnelProgress[stepOrder[i]]) {
        return i > 0 ? stepOrder[i - 1] : null;
      }
    }
    return 'new-member';
  }

  getCorrectNextStep(currentStep) {
    const stepOrder = ['discovery', 'investigation', 'lead-phase', 'intro-package', 'pre-session', 'during-session', 'post-session', 'new-member'];
    if (!currentStep) return 'discovery';
    const currentIndex = stepOrder.indexOf(currentStep);
    if (currentIndex < stepOrder.length - 1) {
      return stepOrder[currentIndex + 1];
    }
    return null;
  }

  revealFunnelStep(step) {
    // Handled by setupFunnelBuilder click handler
  }

  updateFunnelVisualization() {
    // Visualization is now static in HTML - no updates needed
  }

  setupMonthlyTargetsCalculator() {
    // Month selection
    const monthCheckboxes = document.querySelectorAll('.month-checkbox');
    monthCheckboxes.forEach(checkbox => {
      checkbox.addEventListener('change', () => {
        this.updateMonthSelection();
        this.calculateMonthlyTargets();
      });
    });

    // Average members input
    const avgMembersInput = document.getElementById('average-members');
    if (avgMembersInput) {
      avgMembersInput.addEventListener('input', () => {
        this.monthlyTargets.averageMembers = parseInt(avgMembersInput.value) || 0;
        this.calculateMonthlyTargets();
        this.saveMonthlyTargets();
      });
    }

    // Conversion rate sliders
    const leadToIntroSlider = document.getElementById('lead-to-intro-rate');
    if (leadToIntroSlider) {
      leadToIntroSlider.addEventListener('input', () => {
        this.monthlyTargets.leadToIntroRate = parseFloat(leadToIntroSlider.value);
        document.getElementById('lead-to-intro-display').textContent = `${this.monthlyTargets.leadToIntroRate}%`;
        this.calculateMonthlyTargets();
        this.saveMonthlyTargets();
      });
    }

    const introToMemberSlider = document.getElementById('intro-to-member-rate');
    if (introToMemberSlider) {
      introToMemberSlider.addEventListener('input', () => {
        this.monthlyTargets.introToMemberRate = parseFloat(introToMemberSlider.value);
        document.getElementById('intro-to-member-display').textContent = `${this.monthlyTargets.introToMemberRate}%`;
        this.calculateMonthlyTargets();
        this.saveMonthlyTargets();
      });
    }
  }

  updateMonthSelection() {
    const checkboxes = document.querySelectorAll('.month-checkbox');
    const highMonths = [];
    const lowMonths = [];

    // Collect all currently checked months
    checkboxes.forEach(checkbox => {
      if (checkbox.checked) {
        const month = checkbox.dataset.month;
        const type = checkbox.dataset.type;
        if (type === 'high') {
          highMonths.push({ month, checkbox });
        } else if (type === 'low') {
          lowMonths.push({ month, checkbox });
        }
      }
    });

    // Enforce limit of 2 high months - uncheck extras (keep first 2)
    if (highMonths.length > 2) {
      highMonths.slice(2).forEach(({ checkbox }) => {
        checkbox.checked = false;
      });
    }

    // Enforce limit of 2 low months - uncheck extras (keep first 2)
    if (lowMonths.length > 2) {
      lowMonths.slice(2).forEach(({ checkbox }) => {
        checkbox.checked = false;
      });
    }

    // Update stored values with currently checked months (max 2 each)
    this.monthlyTargets.highMonths = highMonths.slice(0, 2).map(({ month }) => month);
    this.monthlyTargets.lowMonths = lowMonths.slice(0, 2).map(({ month }) => month);
  }

  calculateMonthlyTargets() {
    const tbody = document.getElementById('calendar-table-body');
    if (!tbody) return;

    // Clear table if conditions not met
    if (!this.monthlyTargets.averageMembers || 
        this.monthlyTargets.highMonths.length !== 2 || 
        this.monthlyTargets.lowMonths.length !== 2) {
      tbody.innerHTML = '<tr><td colspan="13" style="padding: 20px; text-align: center; color: var(--color-text-light);">Please enter average monthly members and select 2 high months and 2 low months</td></tr>';
      return;
    }

    const avgMembers = this.monthlyTargets.averageMembers;
    const leadToIntro = this.monthlyTargets.leadToIntroRate / 100;
    const introToMember = this.monthlyTargets.introToMemberRate / 100;

    // Calculate total for the year
    const yearlyTotalMembers = avgMembers * 12;
    
    // High months: 25% of total, split between 2 months
    const highMembersTotal = yearlyTotalMembers * 0.25;
    const highMembersPerMonth = highMembersTotal / 2;
    
    // Low months: 5% of total, split between 2 months
    const lowMembersTotal = yearlyTotalMembers * 0.05;
    const lowMembersPerMonth = lowMembersTotal / 2;
    
    // Regular months: remaining 70%, split between 8 months
    const regularMembersTotal = yearlyTotalMembers * 0.70;
    const regularMembersPerMonth = regularMembersTotal / 8;

    // Month order: January through December
    const monthOrder = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
    const monthLabels = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUNE', 'JULY', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    
    const calendarData = [];
    let totalLeads = 0;
    let totalIntros = 0;
    let totalMembersSum = 0;
    let totalReferrals = 0;

    monthOrder.forEach((month, index) => {
      let members;
      if (this.monthlyTargets.highMonths.includes(month)) {
        members = highMembersPerMonth;
      } else if (this.monthlyTargets.lowMonths.includes(month)) {
        members = lowMembersPerMonth;
      } else {
        members = regularMembersPerMonth;
      }

      const intros = Math.ceil(members / introToMember);
      const leads = Math.ceil(intros / leadToIntro);
      const referrals = Math.round(members * 3); // 3x members based on example

      totalLeads += leads;
      totalIntros += intros;
      totalMembersSum += members;
      totalReferrals += referrals;

      calendarData.push({
        month: monthLabels[index],
        leads: leads,
        intros: intros,
        members: Math.round(members * 10) / 10, // Round to 1 decimal
        referrals: referrals
      });
    });

    // Display calendar table
    this.displayCalendarTable(calendarData, {
      totalLeads: totalLeads,
      totalIntros: totalIntros,
      totalMembers: Math.round(totalMembersSum * 10) / 10,
      totalReferrals: totalReferrals
    });
  }

  displayCalendarTable(calendarData, totals) {
    const tbody = document.getElementById('calendar-table-body');
    if (!tbody) return;

    const leadToIntro = this.monthlyTargets.leadToIntroRate / 100;
    const introToMember = this.monthlyTargets.introToMemberRate / 100;

    tbody.innerHTML = `
      <tr>
        <td style="background: #04CBC2; background: var(--color-accent-teal, #04CBC2); color: white; padding: 12px; font-weight: 600; border: 1px solid #04CBC2;">Lead</td>
        ${calendarData.map(d => `<td style="padding: 12px; text-align: center; border: 1px solid #BDBDBD;">${d.leads}</td>`).join('')}
        <td style="background: #04CBC2; background: var(--color-accent-teal, #04CBC2); color: white; padding: 12px; text-align: center; font-weight: 600; border: 1px solid #04CBC2;">${totals.totalLeads}</td>
      </tr>
      <tr>
        <td style="background: #04CBC2; background: var(--color-accent-teal, #04CBC2); color: white; padding: 12px; font-weight: 600; border: 1px solid #04CBC2;">Intro</td>
        ${calendarData.map(d => `<td style="padding: 12px; text-align: center; border: 1px solid #BDBDBD;">${d.intros}</td>`).join('')}
        <td style="background: #04CBC2; background: var(--color-accent-teal, #04CBC2); color: white; padding: 12px; text-align: center; font-weight: 600; border: 1px solid #04CBC2;">${totals.totalIntros}</td>
      </tr>
      <tr>
        <td style="background: #04CBC2; background: var(--color-accent-teal, #04CBC2); color: white; padding: 12px; font-weight: 600; border: 1px solid #04CBC2;">Membe</td>
        ${calendarData.map(d => `<td style="padding: 12px; text-align: center; border: 1px solid #BDBDBD;">${d.members}</td>`).join('')}
        <td style="background: #04CBC2; background: var(--color-accent-teal, #04CBC2); color: white; padding: 12px; text-align: center; font-weight: 600; border: 1px solid #04CBC2;">${totals.totalMembers}</td>
      </tr>
      <tr>
        <td style="background: #04CBC2; background: var(--color-accent-teal, #04CBC2); color: white; padding: 12px; font-weight: 600; border: 1px solid #04CBC2;">Referra</td>
        ${calendarData.map(d => `<td style="padding: 12px; text-align: center; border: 1px solid #BDBDBD;">${d.referrals}</td>`).join('')}
        <td style="background: #04CBC2; background: var(--color-accent-teal, #04CBC2); color: white; padding: 12px; text-align: center; font-weight: 600; border: 1px solid #04CBC2;">${totals.totalReferrals}</td>
      </tr>
    `;
  }

  updateMonthlyTargetsChart(results) {
    const canvas = document.getElementById('monthly-targets-chart');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    
    // Simple bar chart using canvas
    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);

    const scenarios = ['High', 'Average', 'Low'];
    const data = [results.high.members, results.average.members, results.low.members];
    const colors = ['#e67e22', '#3498db', '#04CBC2'];
    
    const barWidth = width / 3 - 20;
    const maxValue = Math.max(...data);
    const scale = (height - 60) / maxValue;

    scenarios.forEach((scenario, index) => {
      const barHeight = data[index] * scale;
      const x = index * (width / 3) + 10;
      const y = height - barHeight - 30;

      ctx.fillStyle = colors[index];
      ctx.fillRect(x, y, barWidth, barHeight);

      ctx.fillStyle = '#2c3e50';
      ctx.font = '14px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(scenario, x + barWidth / 2, height - 10);
      ctx.fillText(data[index].toString(), x + barWidth / 2, y - 5);
    });
  }

  saveFunnelProgress() {
    localStorage.setItem('day2_funnelProgress', JSON.stringify(this.funnelProgress));
  }

  saveConversionFields() {
    localStorage.setItem('day2_conversionFields', JSON.stringify(this.conversionFields));
  }

  saveMonthlyTargets() {
    localStorage.setItem('day2_monthlyTargets', JSON.stringify(this.monthlyTargets));
  }

  loadSavedData() {
    // Load funnel progress
    const savedProgress = localStorage.getItem('day2_funnelProgress');
    if (savedProgress) {
      try {
        const loaded = JSON.parse(savedProgress);
        // Merge with current progress to handle new steps
        Object.keys(loaded).forEach(step => {
          if (this.funnelProgress.hasOwnProperty(step)) {
            this.funnelProgress[step] = loaded[step];
          }
        });
        Object.keys(this.funnelProgress).forEach(step => {
          if (this.funnelProgress[step]) {
            // Restore the revealed state
            const box = document.querySelector(`.funnel-step-box[data-step="${step}"]`);
            if (box) {
              const cover = box.querySelector('.funnel-box-cover');
              const content = box.querySelector('.funnel-box-content');
              const detailSection = document.getElementById(`funnel-detail-${step}`);
              
              if (cover) {
                cover.style.display = 'none';
                cover.classList.add('revealed');
              }
              if (content) {
                content.style.display = 'block';
              }
              if (detailSection) {
                detailSection.style.display = 'block';
              }
            }
          }
        });
      } catch (e) {
        console.error('Error loading funnel progress:', e);
      }
    }

    // Load conversion fields
    const savedConversionFields = localStorage.getItem('day2_conversionFields');
    if (savedConversionFields) {
      try {
        const loaded = JSON.parse(savedConversionFields);
        Object.keys(loaded).forEach(fieldKey => {
          if (this.conversionFields.hasOwnProperty(fieldKey)) {
            this.conversionFields[fieldKey] = loaded[fieldKey];
          }
        });
        Object.keys(this.conversionFields).forEach(fieldKey => {
          if (this.conversionFields[fieldKey]) {
            // Parse fieldKey: "lead-phase-traditional" or "lead-phase-studio-grow"
            // Format is always: "{location}-{type}"
            const match = fieldKey.match(/^(.+?)-(traditional|studio-grow)$/);
            if (match) {
              const location = match[1];
              const type = match[2];
              const field = document.querySelector(`.conversion-field[data-location="${location}"][data-type="${type}"]`);
              if (field) {
                const cover = field.querySelector('.conversion-field-cover');
                const content = field.querySelector('.conversion-field-content');
                if (cover) {
                  cover.style.display = 'none';
                  cover.classList.add('revealed');
                }
                if (content) {
                  content.style.display = 'block';
                }
              }
            }
          }
        });
      } catch (e) {
        console.error('Error loading conversion fields:', e);
      }
    }

    // Load monthly targets
    const savedTargets = localStorage.getItem('day2_monthlyTargets');
    if (savedTargets) {
      this.monthlyTargets = JSON.parse(savedTargets);
      
      // Restore UI state
      const avgMembersInput = document.getElementById('average-members');
      if (avgMembersInput && this.monthlyTargets.averageMembers) {
        avgMembersInput.value = this.monthlyTargets.averageMembers;
      }

      const leadToIntroSlider = document.getElementById('lead-to-intro-rate');
      if (leadToIntroSlider) {
        leadToIntroSlider.value = this.monthlyTargets.leadToIntroRate;
        document.getElementById('lead-to-intro-display').textContent = `${this.monthlyTargets.leadToIntroRate}%`;
      }

      const introToMemberSlider = document.getElementById('intro-to-member-rate');
      if (introToMemberSlider) {
        introToMemberSlider.value = this.monthlyTargets.introToMemberRate;
        document.getElementById('intro-to-member-display').textContent = `${this.monthlyTargets.introToMemberRate}%`;
      }

      // Restore month selections
      document.querySelectorAll('.month-checkbox').forEach(checkbox => {
        const month = checkbox.dataset.month;
        const type = checkbox.dataset.type;
        if (type === 'high' && this.monthlyTargets.highMonths.includes(month)) {
          checkbox.checked = true;
        } else if (type === 'low' && this.monthlyTargets.lowMonths.includes(month)) {
          checkbox.checked = true;
        }
      });

      this.calculateMonthlyTargets();
    }
  }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  window.day2Manager = new Day2Manager();
});
