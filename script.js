const DATA_JSON = 'data/food-enforcement-001-of-001.json';
const YEAR_MIN = 2012;
const YEAR_MAX = 2024;
const CLASSES = ['Class I', 'Class II', 'Class III'];
const STACK_CLASSES = ['Class III', 'Class II', 'Class I'];
const CLASS_COLORS = {
  'Class I': '#f2a7a0',
  'Class II': '#a9c9ee',
  'Class III': '#d8d1c7c7',
};
const CAUSE_COLORS = {
  'Listeria': '#e63946',
  'Undeclared allergens': '#2a9d8f',
  'Salmonella': '#e9c46a',
  'Labeling errors': '#457b9d',
  'Foreign material': '#f4a261',
  'E. coli': '#6a4c93',
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

function addExampleDot(group, x, y, labelX = x + 10, labelY = y - 10, vertical = false) {
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
    .attr('y2', vertical ? labelY + 4 : labelY + 3);

  group.append('text')
    .attr('class', 'example-label')
    .attr('x', labelX)
    .attr('y', labelY)
    .attr('text-anchor', vertical ? 'middle' : 'start')
    .text('Example');
}

function drawCauseChart() {
  const selector = '#cause-chart';
  clearChart(selector);

  const data = causeRules.map(rule => ({
    name: rule.name,
    count: records.filter(d => rule.test.test(d.reason_for_recall || '')).length,
  }));

  const { width, height } = chartSize(selector, 350);
  const margin = { top: 68, right: 26, bottom: 26, left: 26 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;
  const radius = Math.min(innerWidth, innerHeight) / 2;
  const cx = margin.left + innerWidth / 2;
  const cy = margin.top + innerHeight / 2;

  const svg = d3.select(selector).append('svg')
    .attr('viewBox', `0 0 ${width} ${height}`)
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

  const legendX = cx + radius + 16;
  const legendStartY = cy - (data.length * 22) / 2;
  const legend = svg.append('g').attr('transform', `translate(${legendX},${legendStartY})`);
  data.forEach((d, i) => {
    const row = legend.append('g').attr('transform', `translate(0,${i * 22})`);
    row.append('rect').attr('width', 13).attr('height', 13).attr('fill', CAUSE_COLORS[d.name]).attr('rx', 2);
    row.append('text').attr('x', 18).attr('y', 10).attr('class', 'legend-label').text(d.name);
  });

  const exampleSlice = pie(data).find(d => d.data.name === EXAMPLE_RECALL.cause);
  if (exampleSlice) {
    const [dotX, dotY] = d3.arc()
      .innerRadius(radius * 0.78)
      .outerRadius(radius * 0.78)
      .centroid(exampleSlice);
    addExampleDot(g, dotX + 8, dotY - 24, dotX + 32, dotY - 42);
  }
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

  const exampleYear = data.find(d => d.year === EXAMPLE_RECALL.year);
  if (exampleYear) {
    const lowerBound = STACK_CLASSES
      .slice(0, STACK_CLASSES.indexOf(EXAMPLE_RECALL.classification))
      .reduce((sum, key) => sum + exampleYear[key], 0);
    const upperBound = lowerBound + exampleYear[EXAMPLE_RECALL.classification];
    const markerX = x(EXAMPLE_RECALL.year) + x.bandwidth() / 2;
    const markerY = y((lowerBound + upperBound) / 2);
    addExampleDot(g, markerX, markerY, markerX, markerY - 24, true);
  }

  g.append('g')
    .attr('class', 'axis')
    .attr('transform', `translate(0,${innerHeight})`)
    .call(d3.axisBottom(x).tickValues(years.filter(y => y % 2 === 0)));

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

  const legendGroup = titleGroup.append('g')
    .attr('transform', 'translate(0, 32)'); 

  let currentX = 0;
  const legendSpacing = 110; 

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

  const exampleFrequency = frequencies.find(f => f.classification === EXAMPLE_RECALL.classification);
  if (exampleFrequency) {
    const nearest = d3.least(exampleFrequency.chartData, d => Math.abs(d[0] - EXAMPLE_RECALL.durationDays));
    if (nearest) {
      const dotX = x(nearest[0]);
      const dotY = y(nearest[1]);
      addExampleDot(g, dotX, dotY, dotX, dotY - 24, true);
    }
  }

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
