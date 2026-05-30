const DATA_JSON = 'data/food-enforcement-001-of-001.json';
const YEAR_MIN = 2012;
const YEAR_MAX = 2025;
const CLASSES = ['Class I', 'Class II', 'Class III'];
const STACK_CLASSES = ['Class III', 'Class II', 'Class I'];
const CLASS_COLORS = {
  'Class I': '#f2a7a0',
  'Class II': '#a9c9ee',
  'Class III': '#d8d1c7c7',
};
const CAUSE_COLORS = {
  'Listeria': '#111111',
  'Undeclared allergens': '#444444',
  'Salmonella': '#666666',
  'Labeling errors': '#888888',
  'Foreign material': '#aaaaaa',
  'E. coli': '#cccccc',
};
const EXAMPLE_RECALL = {
  firm: 'Taylor Fresh Foods Inc.',
  cause: 'Listeria',
  classification: 'Class I',
  year: 2024,
  durationDays: 364,
};

const parseFDADate = d3.timeParse('%Y%m%d');
const formatNumber = d3.format(',');
const formatPercent = d3.format('.1%');

const causeRules = [
  { name: 'Listeria', test: /listeria/i },
  { name: 'Undeclared allergens', test: /undeclared|allergen/i },
  { name: 'Salmonella', test: /salmonella/i },
  { name: 'Labeling errors', test: /label|mislabel|mislabeled/i },
  { name: 'Foreign material', test: /foreign material|extraneous/i },
  { name: 'E. coli', test: /e[. ]?coli/i },
];

let records = [];
let resizeTimer;

function normalizeRecord(record) {
  const initiationDate = parseFDADate(record.recall_initiation_date || '');
  const terminationDate = parseFDADate(record.termination_date || '');
  const reportDate = parseFDADate(record.report_date || '');
  const year = initiationDate ? initiationDate.getFullYear() : reportDate?.getFullYear();
  const durationDays = initiationDate && terminationDate
    ? Math.round((terminationDate - initiationDate) / 86400000)
    : null;

  return {
    ...record,
    classification: record.classification || 'Unknown',
    initiationDate,
    terminationDate,
    reportDate,
    year,
    durationDays,
  };
}

function getResults(json) {
  if (Array.isArray(json)) return json;
  if (Array.isArray(json.results)) return json.results;
  return [];
}

async function loadData() {
  const res = await fetch(DATA_JSON);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  const json = await res.json();
  records = getResults(json)
    .map(normalizeRecord)
    .filter(d => d.year >= YEAR_MIN && d.year <= YEAR_MAX && CLASSES.includes(d.classification));
}

function setupTooltip() {
  let tooltip = document.querySelector('.tooltip');
  if (!tooltip) {
    tooltip = document.createElement('div');
    tooltip.className = 'tooltip';
    document.body.appendChild(tooltip);
  }
  return tooltip;
}

function showTooltip(event, html) {
  const tooltip = setupTooltip();
  tooltip.innerHTML = html;
  tooltip.style.opacity = '1';
  tooltip.style.transform = `translate(${event.clientX + 14}px, ${event.clientY + 14}px)`;
}

function hideTooltip() {
  const tooltip = document.querySelector('.tooltip');
  if (tooltip) tooltip.style.opacity = '0';
}

function clearChart(selector) {
  d3.select(selector).selectAll('*').remove();
}

function chartSize(selector, fallbackHeight = 330) {
  const node = document.querySelector(selector);
  return {
    width: Math.max(320, node.getBoundingClientRect().width),
    height: fallbackHeight,
  };
}

function addTitle(svg, title, subtitle) {
  svg.append('text')
    .attr('class', 'chart-title')
    .attr('x', 0)
    .attr('y', 0)
    .text(title);

  svg.append('text')
    .attr('class', 'chart-subtitle')
    .attr('x', 0)
    .attr('y', 18)
    .text(subtitle);
}

function addExampleDot(group, x, y, labelX = x + 10, labelY = y - 10, vertical = false, label = 'Example') {
  const lines = Array.isArray(label) ? label : [label];
  const lineHeight = 11;

  group.append('circle')
    .attr('class', 'example-dot')
    .attr('cx', x)
    .attr('cy', y)
    .attr('r', 4);

  group.append('line')
    .attr('class', 'example-callout')
    .attr('x1', vertical ? x : x + 5)
    .attr('y1', vertical ? y - 6 : y - 5)
    .attr('x2', vertical ? x : labelX - 3)
    .attr('y2', vertical ? labelY + (lines.length - 1) * lineHeight + 4 : labelY + 3);

  const textEl = group.append('text')
    .attr('class', 'example-label')
    .attr('x', labelX)
    .attr('y', labelY)
    .attr('text-anchor', vertical ? 'middle' : 'start');

  lines.forEach((line, i) => {
    textEl.append('tspan')
      .attr('x', labelX)
      .attr('dy', i === 0 ? 0 : lineHeight)
      .text(line);
  });
}

function drawCauseChart() {
  const selector = '#cause-chart';
  clearChart(selector);

  const data = causeRules.map(rule => ({
    name: rule.name,
    count: records.filter(d => rule.test.test(d.reason_for_recall || '')).length,
  }));

  const { width, height } = chartSize(selector, 260);
  const margin = { top: 68, right: 26, bottom: 10, left: 26 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;
  const radius = Math.min(innerWidth, innerHeight) / 2;
  const cx = margin.left + innerWidth / 2;
  const cy = margin.top + innerHeight / 2 + 40;

  const svg = d3.select(selector).append('svg')
    .attr('viewBox', `0 0 ${width} ${height + 90}`)
    .attr('role', 'img')
    .attr('aria-label', 'Pie chart of leading causes of FDA food recalls');

  const titleGroup = svg.append('g').attr('transform', `translate(${margin.left},28)`);
  addTitle(titleGroup, `Leading causes of FDA food recalls (${YEAR_MIN}-${YEAR_MAX})`, 'Categories are counted from recall reason text and are not mutually exclusive');

  const total = d3.sum(data, d => d.count) || 1;
  const pie = d3.pie().value(d => d.count).sort(null);
  const arc = d3.arc().innerRadius(0).outerRadius(radius);
  const labelArc = d3.arc().innerRadius(radius * 0.65).outerRadius(radius * 0.65);

  const g = svg.append('g').attr('transform', `translate(${cx},${cy})`);

  g.selectAll('path')
    .data(pie(data))
    .join('path')
    .attr('d', arc)
    .attr('fill', d => CAUSE_COLORS[d.data.name])
    .attr('stroke', '#ffffff')
    .attr('stroke-width', 1.5)
    .attr('opacity', 0.97)
    .on('mousemove', (event, d) => {
      showTooltip(event, `<strong>${d.data.name}</strong><br>${formatNumber(d.data.count)} recall records (${formatPercent(d.data.count / total)})`);
    })
    .on('mouseleave', hideTooltip);

  // Percentage labels inside slices
  g.selectAll('text.slice-label')
    .data(pie(data).filter(d => (d.endAngle - d.startAngle) > 0.25))
    .join('text')
    .attr('class', 'slice-label')
    .attr('transform', d => `translate(${labelArc.centroid(d)})`)
    .attr('text-anchor', 'middle')
    .attr('dominant-baseline', 'middle')
    .style('font-size', '11px')
    .style('fill', '#fff')
    .style('pointer-events', 'none')
    .text(d => formatPercent(d.data.count / total));

  // Slices that get elbow arrows (only Foreign Material)
  const useElbow = new Set(['Foreign material']);
  // Slices that show percentage beside outside label
  const showPctOutside = new Set(['Foreign material', 'E. coli']);

  const slices = pie(data);
  const minSpacing = 16;

  const labelData = slices.map(d => {
    const mid = (d.startAngle + d.endAngle) / 2;
    // Force E. coli label to right side
    const onRight = d.data.name === 'E. coli' ? true : Math.sin(mid) >= 0;
    const outerR = radius * 1.18;
    const x = Math.sin(mid) * outerR;
    const y = -Math.cos(mid) * outerR;
    return { d, mid, onRight, x, y, labelY: y };
  });

  ['left', 'right'].forEach(side => {
    const group = labelData
      .filter(l => side === 'right' ? l.onRight : !l.onRight)
      .sort((a, b) => a.y - b.y);

    for (let i = 1; i < group.length; i++) {
      if (group[i].labelY - group[i - 1].labelY < minSpacing) {
        group[i].labelY = group[i - 1].labelY + minSpacing;
      }
    }

    const maxY = innerHeight / 2 - 8;
    for (let i = group.length - 1; i >= 0; i--) {
      if (group[i].labelY > maxY) {
        group[i].labelY = maxY;
        if (i > 0 && group[i].labelY - group[i - 1].labelY < minSpacing) {
          group[i - 1].labelY = group[i].labelY - minSpacing;
        }
      }
    }
  });

  const pieExamples = {
    'Listeria': ['e.g. Dole American Blend', "Taylor's Fresh Foods Inc."],
    'Undeclared allergens': ["e.g. Trader Joe's Hot Honey Mustard Dressing"],
  };

  labelData.forEach(l => {
    const name = l.d.data.name;
    const mid = (l.d.startAngle + l.d.endAngle) / 2;
    const edgeR = radius * 1.03;
    const elbowR = radius * 1.12;
    const centroid = arc.centroid(l.d);
    const centroidAngle = Math.atan2(centroid[0], -centroid[1]);
    const x0 = Math.sin(centroidAngle) * edgeR;
    const y0 = -Math.cos(centroidAngle) * edgeR;
    const x1 = Math.sin(centroidAngle) * elbowR;
    const y1 = -Math.cos(centroidAngle) * elbowR;
    const x2 = l.onRight ? x1 + 8 : x1 - 8;
    const x3 = l.onRight ? x2 + 10 : x2 - 10;

    const labelText = showPctOutside.has(name)
      ? `${name} (${formatPercent(l.d.data.count / total)})`
      : name;

    if (useElbow.has(name)) {
      // Full elbow polyline
      g.append('polyline')
        .attr('points', `${x0},${y0} ${x1},${y1} ${x2},${l.labelY} ${x3},${l.labelY}`)
        .attr('fill', 'none')
        .attr('stroke', '#aaa')
        .attr('stroke-width', 1)
        .style('pointer-events', 'none');

      g.append('text')
        .attr('x', l.onRight ? x3 + 4 : x3 - 4)
        .attr('y', l.labelY)
        .attr('dominant-baseline', 'middle')
        .attr('text-anchor', l.onRight ? 'start' : 'end')
        .style('font-size', '11px')
        .style('fill', '#333')
        .style('pointer-events', 'none')
        .text(labelText);

    } else {
      // Simple straight line from slice edge outward, no elbow
      const labelR = radius * 1.22;
      const lx = Math.sin(mid) * labelR;
      const ly = -Math.cos(mid) * labelR;

      // For E. coli: nudge the line start and label position to the right
      const nudge = name === 'E. coli' ? radius * -0.0099 : 0;

      g.append('line')
        .attr('x1', x0 + nudge)
        .attr('y1', y0)
        .attr('x2', lx + nudge)
        .attr('y2', ly)
        .attr('stroke', '#aaa')
        .attr('stroke-width', 1)
        .style('pointer-events', 'none');

      g.append('text')
        .attr('x', (l.onRight ? lx + nudge + 4 : lx + nudge - 4))
        .attr('y', ly)
        .attr('dominant-baseline', 'middle')
        .attr('text-anchor', l.onRight ? 'start' : 'end')
        .style('font-size', '11px')
        .style('fill', '#333')
        .style('pointer-events', 'none')
        .text(labelText);

      const exampleLines = pieExamples[name];
      if (exampleLines) {
        exampleLines.forEach((line, i) => {
          const yOffset = 13 + i * 11;
          g.append('text')
            .attr('x', (l.onRight ? lx + nudge + 4 : lx + nudge - 4))
            .attr('y', ly + yOffset)
            .attr('dominant-baseline', 'middle')
            .attr('text-anchor', l.onRight ? 'start' : 'end')
            .style('font-size', '9px')
            .style('fill', '#666')
            .style('font-style', 'italic')
            .style('pointer-events', 'none')
            .text(line);
        });
      }
    }
  });
}

function drawSeverityChart() {
  const selector = '#severity-chart';
  clearChart(selector);

  const years = d3.range(YEAR_MIN, YEAR_MAX + 1);
  const data = years.map(year => {
    const row = { year };
    CLASSES.forEach(classification => {
      row[classification] = records.filter(d => d.year === year && d.classification === classification).length;
    });
    return row;
  });

  const stacked = d3.stack().keys(STACK_CLASSES)(data);
  const { width, height } = chartSize(selector, 350);
  const margin = { top: 68, right: 88, bottom: 42, left: 58 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  const svg = d3.select(selector).append('svg')
    .attr('viewBox', `0 0 ${width} ${height}`)
    .attr('role', 'img')
    .attr('aria-label', 'Stacked bar chart of FDA food recalls by year and severity classification');

  const titleGroup = svg.append('g').attr('transform', `translate(${margin.left},28)`);
  addTitle(titleGroup, 'FDA food recalls by year and severity classification', 'High-severity Class I recalls remain consistently present across years');

  const x = d3.scaleBand()
    .domain(years)
    .range([0, innerWidth])
    .padding(0.22);

  const y = d3.scaleLinear()
    .domain([0, d3.max(data, d => CLASSES.reduce((sum, key) => sum + d[key], 0)) || 1])
    .nice()
    .range([innerHeight, 0]);

  const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

  g.append('g')
    .attr('class', 'grid')
    .call(d3.axisLeft(y).ticks(4).tickSize(-innerWidth).tickFormat(''));

  g.selectAll('g.stack')
    .data(stacked)
    .join('g')
    .attr('class', 'stack')
    .attr('fill', d => CLASS_COLORS[d.key])
    .selectAll('rect')
    .data(d => d.map(item => ({ ...item, key: d.key })))
    .join('rect')
    .attr('x', d => x(d.data.year))
    .attr('y', d => y(d[1]))
    .attr('height', d => y(d[0]) - y(d[1]))
    .attr('width', x.bandwidth())
    .attr('stroke', '#ffffff')
    .attr('stroke-width', 0.7)
    .on('mousemove', (event, d) => {
      const count = d.data[d.key];
      showTooltip(event, `<strong>${d.data.year} ${d.key}</strong><br>${formatNumber(count)} recalls`);
    })
    .on('mouseleave', hideTooltip);

  const barAnnotations = [
    { year: 2012, classification: 'Class I',  label: ['Dole', 'American', 'Blend'],        yOffset: -95 },
    { year: 2023, classification: 'Class I',  label: ['Kirkland', 'Strawberries'],    yOffset: -95 },
    { year: 2024, classification: 'Class I',  label: ['Taylor', 'Fresh', 'Foods Inc.'],  yOffset: -80 },
    { year: 2025, classification: 'Class II', label: ['Nestle', 'Toll House'],        yOffset: -95 },
  ];

  barAnnotations.forEach(({ year, classification, label, yOffset }) => {
    const exampleYear = data.find(d => d.year === year);
    if (!exampleYear) return;
    const lowerBound = STACK_CLASSES
      .slice(0, STACK_CLASSES.indexOf(classification))
      .reduce((sum, key) => sum + exampleYear[key], 0);
    const upperBound = lowerBound + exampleYear[classification];
    const markerX = x(year) + x.bandwidth() / 2;
    const markerY = y((lowerBound + upperBound) / 2);
    addExampleDot(g, markerX, markerY, markerX, markerY + yOffset, true, label);
  });

  g.append('g')
    .attr('class', 'axis')
    .attr('transform', `translate(0,${innerHeight})`)
    .call(d3.axisBottom(x).tickValues(years.filter(y => y % 2 === 0 || y === YEAR_MAX)));

  g.append('g')
    .attr('class', 'axis')
    .call(d3.axisLeft(y).ticks(4).tickFormat(formatNumber));

  svg.append('text')
    .attr('class', 'axis-label')
    .attr('transform', `translate(15,${margin.top + innerHeight / 2}) rotate(-90)`)
    .attr('text-anchor', 'middle')
    .text('Number of recall records');

  const legend = svg.append('g').attr('transform', `translate(${width - margin.right + 12},${margin.top + 108})`);
  legend.append('text').attr('class', 'legend-title').attr('x', 0).attr('y', -12).text('classification');
  CLASSES.forEach((classification, i) => {
    const row = legend.append('g').attr('transform', `translate(0,${i * 22})`);
    row.append('rect').attr('width', 13).attr('height', 13).attr('fill', CLASS_COLORS[classification]);
    row.append('text').attr('x', 18).attr('y', 10).attr('class', 'legend-label').text(classification);
  });
}

function drawDurationChart() {
  const selector = '#duration-chart';
  clearChart(selector);

  const durationRecords = records.filter(d => (
    CLASSES.includes(d.classification)
    && Number.isFinite(d.durationDays)
    && d.durationDays >= 0
    && d.durationDays <= 365
  ));

  const { width, height } = chartSize(selector, 350);
  const margin = { top: 90, right: 26, bottom: 42, left: 58 }; 
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  const svg = d3.select(selector).append('svg')
    .attr('viewBox', `0 0 ${width} ${height}`)
    .attr('role', 'img')
    .attr('aria-label', 'Overlapping frequency curves showing days between recall initiation and termination');

  const titleGroup = svg.append('g').attr('transform', `translate(${margin.left},28)`);
  addTitle(titleGroup, 'How long food recalls remain active', 'Comparing the volume and resolution timelines by severity class');

  const legendSpacing = 110;
  const legendTotalWidth = (CLASSES.length - 1) * legendSpacing + 88;
  const legendGroup = titleGroup.append('g')
    .attr('transform', `translate(${innerWidth - legendTotalWidth}, 32)`);

  let currentX = 0;

  CLASSES.forEach((classification) => {
    const isGrey = classification === "Class III";
    const itemGroup = legendGroup.append('g')
      .attr('transform', `translate(${currentX}, 0)`);

    itemGroup.append('rect')
      .attr('width', 22)
      .attr('height', 12)
      .attr('rx', 2) 
      .style('fill', CLASS_COLORS[classification])
      .style('opacity', isGrey ? 0.65 : 0.45)
      .style('stroke-width', isGrey ? '1.5px' : '0px');

    itemGroup.append('text')
      .attr('x', 28)
      .attr('y', 10)
      .style('font-size', '12px')
      .style('font-weight', '500')
      .style('fill', '#333333')
      .text(classification);

    currentX += legendSpacing;
  });

  const x = d3.scaleLinear()
    .domain([0, 365])
    .range([0, innerWidth]);

  function kernelDensityEstimator(kernel, X) {
    return function(V) {
      return X.map(x => [x, d3.mean(V, v => kernel(x - v))]);
    };
  }
  function kernelEpanechnikov(bandwidth) {
    return function(v) {
      return Math.abs(v /= bandwidth) <= 1 ? 0.75 * (1 - v * v) / bandwidth : 0;
    };
  }

  const xTicks = x.ticks(100); 
  const kde = kernelDensityEstimator(kernelEpanechnikov(25), xTicks);

  const frequencies = CLASSES.map(classification => {
    const classValues = durationRecords
      .filter(d => d.classification === classification)
      .map(d => d.durationDays);
    
    const totalCount = classValues.length;
    const rawKde = kde(classValues);
    const scaledData = rawKde.map(p => [p[0], p[1] * totalCount * 3.65]);

    return {
      classification: classification,
      count: totalCount,
      chartData: scaledData
    };
  });

  const maxCount = d3.max(frequencies, f => d3.max(f.chartData, p => p[1])) || 10;

  const y = d3.scaleLinear()
    .domain([0, maxCount])
    .nice()
    .range([innerHeight, 0]);

  const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

  g.append('g')
    .attr('class', 'grid')
    .call(d3.axisLeft(y).ticks(5).tickSize(-innerWidth).tickFormat(''));

  const areaGenerator = d3.area()
    .curve(d3.curveBasis)
    .x(d => x(d[0]))
    .y0(innerHeight)
    .y1(d => y(d[1]));

  const lineGenerator = d3.line()
    .curve(d3.curveBasis)
    .x(d => x(d[0]))
    .y(d => y(d[1]));

  frequencies.forEach((f) => {
    const isGrey = f.classification === "Class III";

    g.append('path')
      .datum(f.chartData)
      .attr('class', 'frequency-area')
      .attr('d', areaGenerator)
      .attr('fill', CLASS_COLORS[f.classification])
      .attr('opacity', isGrey ? 0.65 : 0.45) 
      .on('mousemove', (event) => {
        showTooltip(event, `<strong>${f.classification}</strong><br>Total Group Size: ${formatNumber(f.count)} recalls`);
      })
      .on('mouseleave', hideTooltip);
  });

  frequencies.forEach((f) => {
    const isGrey = f.classification === "Class III";
    const strokeColor = isGrey ? '#949191' : CLASS_COLORS[f.classification];
    const strokeWidth = '2px';

    g.append('path')
      .datum(f.chartData)
      .attr('d', lineGenerator)
      .style('fill', 'none')
      .style('stroke', strokeColor)
      .style('stroke-width', strokeWidth)
      .style('opacity', '1')
      .style('pointer-events', 'none');
  });

  const durationAnnotations = [
    { classification: 'Class II', durationDays: 48,  label: ['Fresh Express', 'Spring Mix'],  xOffset: 0,  yOffset: -24 },
    { classification: 'Class I',  durationDays: 70,  label: ['Kirkland', 'Organic Eggs'],     xOffset: 20, yOffset: -30 },
    { classification: 'Class I',  durationDays: 261, label: ['Sysco', 'Salsa Cup'],           xOffset: 0,  yOffset: -50 },
    { classification: 'Class I',  durationDays: 364, label: ['Taylor', 'Fresh', 'Foods Inc.'],   xOffset: 0,  yOffset: -60 },
  ];

  durationAnnotations.forEach(({ classification, durationDays, label, xOffset, yOffset }) => {
    const freq = frequencies.find(f => f.classification === classification);
    if (!freq) return;
    const nearest = d3.least(freq.chartData, d => Math.abs(d[0] - durationDays));
    if (!nearest) return;
    const dotX = x(nearest[0]);
    const dotY = y(nearest[1]);
    addExampleDot(g, dotX, dotY, dotX + xOffset, dotY + yOffset, xOffset === 0, label);
  });

  g.append('g')
    .attr('class', 'axis')
    .attr('transform', `translate(0,${innerHeight})`)
    .call(d3.axisBottom(x).tickValues([0, 60, 120, 180, 240, 300, 360]));

  g.append('g')
    .attr('class', 'axis')
    .call(d3.axisLeft(y).ticks(5).tickFormat(formatNumber));

  svg.append('text')
    .attr('class', 'axis-label')
    .attr('x', margin.left + innerWidth / 2)
    .attr('y', height - 6)
    .attr('text-anchor', 'middle')
    .text('Days between recall initiation and termination');

  svg.append('text')
    .attr('class', 'axis-label')
    .attr('transform', `translate(15,${margin.top + innerHeight / 2}) rotate(-90)`)
    .attr('text-anchor', 'middle')
    .text('Estimated volume (Frequency)');
}

function updateShares() {
  const total = records.length || 1;
  const counts = d3.rollup(records, v => v.length, d => d.classification);
  document.getElementById('class-i-share').textContent = formatPercent((counts.get('Class I') || 0) / total);
  document.getElementById('class-ii-share').textContent = formatPercent((counts.get('Class II') || 0) / total);
  document.getElementById('class-iii-share').textContent = formatPercent((counts.get('Class III') || 0) / total);
}

function renderCharts() {
  drawCauseChart();
  drawSeverityChart();
  drawDurationChart();
  updateShares();
}

async function init() {
  try {
    await loadData();
    renderCharts();
  } catch (err) {
    document.querySelectorAll('.viz').forEach(el => {
      el.innerHTML = `<p class="error">Could not load chart data: ${err.message}</p>`;
    });
  }
}

window.addEventListener('resize', () => {
  window.clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(() => {
    if (records.length) renderCharts();
  }, 150);
});

document.addEventListener('DOMContentLoaded', init);
