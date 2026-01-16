// Day 4: Profit Projections

class Day4Manager {
  constructor() {
    this.revenueStreams = [
      { name: 'Memberships (privates, groups)', revenue: 0, practitionerCost: 0, costType: 'cogs' },
      { name: 'Drop ins (pvt, grp)', revenue: 0, practitionerCost: 0, costType: 'percentage', percentage: 30 },
      { name: 'Packages (pvt, grp)', revenue: 0, practitionerCost: 0, costType: 'cogs' },
      { name: '', revenue: 0, practitionerCost: 0, costType: 'cogs', isBlank: true },
      { name: '', revenue: 0, practitionerCost: 0, costType: 'cogs', isBlank: true },
      { name: '', revenue: 0, practitionerCost: 0, costType: 'cogs', isBlank: true }
    ];
    this.pieChart = null;
    this.visibleLabels = new Set();
    this.init();
  }

  init() {
    this.renderRevenueTable();
    this.setupAddRowButton();
    this.setupRevealMechanisms();
    this.setupPieChart();
    this.loadSavedData();
  }

  renderRevenueTable() {
    const tableBody = document.getElementById('revenue-table-body');
    if (!tableBody) return;

    tableBody.innerHTML = '';

    this.revenueStreams.forEach((stream, index) => {
      const row = document.createElement('tr');

      row.innerHTML = `
        <td style="padding: 15px; font-weight: 500; color: var(--color-text); border-bottom: 1px solid #e0e0e0;">
          ${stream.isBlank ? `<input type="text" class="service-name-input" data-index="${index}" placeholder="Revenue streams" style="width: 100%; border: 1px solid #e0e0e0; border-radius: 6px; padding: 10px; font-size: 14px; transition: border-color 0.2s;">` : stream.name}
        </td>
        <td style="padding: 15px; border-bottom: 1px solid #e0e0e0;">
          <input type="number" class="revenue-input" data-index="${index}" value="${stream.revenue}" min="0" step="0.01" placeholder="Total monthly revenue" style="width: 100%; border: 1px solid #e0e0e0; border-radius: 6px; padding: 10px; text-align: left; font-size: 14px; transition: border-color 0.2s;">
        </td>
        <td style="padding: 15px; border-bottom: 1px solid #e0e0e0;">
          <input type="number" class="practitioner-cost-input" data-index="${index}" value="${stream.practitionerCost}" min="0" step="0.01" placeholder="Practitioner" style="width: 100%; border: 1px solid #e0e0e0; border-radius: 6px; padding: 10px; text-align: left; font-size: 14px; transition: border-color 0.2s;">
        </td>
        <td class="profit-cell" data-index="${index}" style="padding: 15px; text-align: center; font-weight: 600; color: #D4AF37; border-bottom: 1px solid #e0e0e0;">
          $0.00
        </td>
        <td class="margin-cell" data-index="${index}" style="padding: 15px; text-align: center; font-weight: 600; color: #D4AF37; border-bottom: 1px solid #e0e0e0;">
          0.0%
        </td>
      `;
      tableBody.appendChild(row);
    });

    // Add event listeners
    this.attachTableEventListeners();
    this.updateAllCalculations();
  }

  attachTableEventListeners() {
    // Service name inputs (for blank rows)
    document.querySelectorAll('.service-name-input').forEach(input => {
      input.addEventListener('input', (e) => {
        const index = parseInt(e.target.dataset.index);
        this.revenueStreams[index].name = e.target.value;
        if (e.target.value.trim()) {
          this.revenueStreams[index].isBlank = false;
        }
        this.saveRevenueStreams();
      });
      
      input.addEventListener('focus', (e) => {
        e.target.style.borderColor = '#D4AF37';
        e.target.style.outline = 'none';
      });
      
      input.addEventListener('blur', (e) => {
        e.target.style.borderColor = '#e0e0e0';
      });
    });

    // Revenue inputs
    document.querySelectorAll('.revenue-input').forEach(input => {
      input.addEventListener('input', (e) => {
        const index = parseInt(e.target.dataset.index);
        const value = parseFloat(e.target.value) || 0;
        this.revenueStreams[index].revenue = value;
        
        // Auto-calculate practitioner cost if it's a percentage type
        if (this.revenueStreams[index].costType === 'percentage') {
          this.revenueStreams[index].practitionerCost = value * (this.revenueStreams[index].percentage / 100);
          const costInput = document.querySelector(`.practitioner-cost-input[data-index="${index}"]`);
          if (costInput) {
            costInput.value = this.revenueStreams[index].practitionerCost.toFixed(2);
          }
        }
        
        this.updateRowCalculations(index);
        this.saveRevenueStreams();
      });
      
      // Add focus styles
      input.addEventListener('focus', (e) => {
        e.target.style.borderColor = '#D4AF37';
        e.target.style.outline = 'none';
      });
      
      input.addEventListener('blur', (e) => {
        e.target.style.borderColor = '#e0e0e0';
      });
    });

    // Practitioner cost inputs
    document.querySelectorAll('.practitioner-cost-input').forEach(input => {
      input.addEventListener('input', (e) => {
        const index = parseInt(e.target.dataset.index);
        const value = parseFloat(e.target.value) || 0;
        this.revenueStreams[index].practitionerCost = value;
        this.updateRowCalculations(index);
        this.saveRevenueStreams();
      });
      
      // Add focus styles
      input.addEventListener('focus', (e) => {
        e.target.style.borderColor = '#D4AF37';
        e.target.style.outline = 'none';
      });
      
      input.addEventListener('blur', (e) => {
        e.target.style.borderColor = '#e0e0e0';
      });
    });
  }

  updateRowCalculations(index) {
    const stream = this.revenueStreams[index];
    const profit = this.calculateProfit(stream.revenue, stream.practitionerCost);
    const margin = this.calculateMargin(stream.revenue, stream.practitionerCost);

    const profitCell = document.querySelector(`.profit-cell[data-index="${index}"]`);
    const marginCell = document.querySelector(`.margin-cell[data-index="${index}"]`);

    if (profitCell) {
      profitCell.textContent = profit.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
      profitCell.style.color = profit >= 0 ? '#D4AF37' : '#F5A623';
    }

    if (marginCell) {
      marginCell.textContent = `${margin.toFixed(1)}%`;
      marginCell.style.color = margin >= 20 ? '#D4AF37' : margin >= 10 ? '#F5A623' : '#F5A623';
    }
  }

  updateAllCalculations() {
    this.revenueStreams.forEach((stream, index) => {
      this.updateRowCalculations(index);
    });
  }

  calculateProfit(revenue, cost) {
    return revenue - cost;
  }

  calculateMargin(revenue, cost) {
    if (revenue === 0) return 0;
    return ((revenue - cost) / revenue) * 100;
  }

  saveRevenueStreams() {
    localStorage.setItem('day4_revenueStreams', JSON.stringify(this.revenueStreams));
  }

  setupAddRowButton() {
    const addRowBtn = document.getElementById('add-revenue-row');
    if (addRowBtn) {
      addRowBtn.addEventListener('click', () => {
        this.addRevenueRow();
      });
    }
  }

  addRevenueRow() {
    this.revenueStreams.push({
      name: '',
      revenue: 0,
      practitionerCost: 0,
      costType: 'cogs',
      isBlank: true
    });
    this.renderRevenueTable();
    this.saveRevenueStreams();
    
    // Focus on the new row's name input
    const newIndex = this.revenueStreams.length - 1;
    const newNameInput = document.querySelector(`.service-name-input[data-index="${newIndex}"]`);
    if (newNameInput) {
      newNameInput.focus();
    }
  }

  setupRevealMechanisms() {
    // Overhead expense reveals
    const overheadReveals = document.querySelectorAll('.overhead-expense-item .category-point-reveal');
    overheadReveals.forEach(button => {
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
          
          // Save state
          this.saveRevealState(targetId, !isHidden);
        }
      });
    });
  }

  saveRevealState(targetId, isRevealed) {
    const state = JSON.parse(localStorage.getItem('day4_reveal_states') || '{}');
    state[targetId] = isRevealed;
    localStorage.setItem('day4_reveal_states', JSON.stringify(state));
  }

  loadSavedData() {
    const savedStreams = localStorage.getItem('day4_revenueStreams');
    if (savedStreams) {
      try {
        const parsed = JSON.parse(savedStreams);
        // If we have saved data, use it (user may have added rows)
        if (parsed.length > 0) {
          this.revenueStreams = parsed;
        }
        this.renderRevenueTable();
      } catch (e) {
        console.error('Error loading saved revenue streams:', e);
      }
    }

    // Load reveal states
    const savedStates = localStorage.getItem('day4_reveal_states');
    if (savedStates) {
      try {
        const states = JSON.parse(savedStates);
        Object.keys(states).forEach(targetId => {
          const content = document.getElementById(targetId);
          const button = document.querySelector(`[data-target="${targetId}"]`);
          if (content && button && states[targetId]) {
            content.style.display = 'block';
            content.classList.add('revealed');
            button.textContent = 'Hide';
            button.classList.add('revealed');
          }
        });
      } catch (e) {
        console.error('Error loading reveal states:', e);
      }
    }
  }

  setupPieChart() {
    const canvas = document.getElementById('profit-pie-chart');
    if (!canvas) {
      console.error('Canvas element not found');
      return;
    }

    // Wait for Chart.js to be available
    if (typeof Chart === 'undefined') {
      console.error('Chart.js is not loaded');
      // Try again after a short delay
      setTimeout(() => this.setupPieChart(), 100);
      return;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      console.error('Could not get canvas context');
      return;
    }

    try {
      // Define the custom plugin as an inline plugin (not registered globally)
      const percentageLabelsPlugin = {
        id: 'percentageLabels',
        afterDraw: (chart) => {
          // visibleLabels tracks which segments should show category names
          const visibleLabels = chart.config.visibleLabels || new Set();
          
          const chartCtx = chart.ctx;
          const chartArea = chart.chartArea;
          if (!chartArea) return; // Chart not fully initialized
          
          const centerX = (chartArea.left + chartArea.right) / 2;
          const centerY = (chartArea.top + chartArea.bottom) / 2;
          const radius = Math.min(chartArea.right - chartArea.left, chartArea.bottom - chartArea.top) / 2 - 25;

          chart.data.datasets.forEach((dataset, i) => {
            const meta = chart.getDatasetMeta(i);
            if (!meta || !meta.data) return;
            
            meta.data.forEach((element, index) => {
              const model = element;
              if (!model) return;
              
              const value = dataset.data[index];
              const label = chart.data.labels[index];
              
              // Calculate position on the arc
              const angle = model.startAngle + (model.endAngle - model.startAngle) / 2;
              const x = centerX + Math.cos(angle) * (radius * 0.65);
              const y = centerY + Math.sin(angle) * (radius * 0.65);

              // Always draw percentage label
              chartCtx.save();
              chartCtx.font = 'bold 18px Arial';
              chartCtx.fillStyle = '#ffffff';
              chartCtx.strokeStyle = '#D4AF37';
              chartCtx.lineWidth = 2;
              chartCtx.textAlign = 'center';
              chartCtx.textBaseline = 'middle';
              chartCtx.strokeText(value + '%', x, y);
              chartCtx.fillText(value + '%', x, y);
              chartCtx.restore();

              // Only draw category name if this segment is in visibleLabels
              if (visibleLabels.has(index)) {
                chartCtx.save();
                chartCtx.font = 'bold 14px Arial';
                chartCtx.fillStyle = '#ffffff';
                chartCtx.strokeStyle = '#D4AF37';
                chartCtx.lineWidth = 1.5;
                chartCtx.textAlign = 'center';
                chartCtx.textBaseline = 'middle';
                // Position category name below the percentage
                const categoryY = y + 25;
                chartCtx.strokeText(label, x, categoryY);
                chartCtx.fillText(label, x, categoryY);
                chartCtx.restore();
              }
            });
          });
        }
      };

      const chartConfig = {
        type: 'pie',
        data: {
          labels: ['Practitioner', 'Overhead', 'Profits', 'Lagniappe'],
          datasets: [{
            data: [30, 30, 30, 10],
            backgroundColor: [
              '#D4AF37', // Gold for Practitioner
              '#F5A623', // Yellow-orange for Overhead
              '#FFD700', // Bright gold for Profits
              '#FFA500'  // Orange for Lagniappe
            ],
            borderColor: '#ffffff',
            borderWidth: 4,
            hoverBorderWidth: 6
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              display: false
            },
            tooltip: {
              enabled: false
            }
          },
          onClick: (event, elements) => {
            if (elements && elements.length > 0) {
              const clickedIndex = elements[0].index;
              
              // Toggle visibility of label for this segment
              if (this.visibleLabels.has(clickedIndex)) {
                this.visibleLabels.delete(clickedIndex);
              } else {
                this.visibleLabels.add(clickedIndex);
              }
              
              // Store visibleLabels in chart config for plugin access
              if (this.pieChart) {
                this.pieChart.config.visibleLabels = this.visibleLabels;
                // Update chart to redraw with new labels
                this.pieChart.update();
              }
            }
          }
        },
        plugins: [percentageLabelsPlugin]
      };
      
      this.pieChart = new Chart(canvas, chartConfig);
      
      // Store visibleLabels in chart config for plugin access
      this.pieChart.config.visibleLabels = this.visibleLabels;
      
      console.log('Pie chart created successfully', this.pieChart);
    } catch (error) {
      console.error('Error creating pie chart:', error);
    }
  }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  window.day4Manager = new Day4Manager();
});
