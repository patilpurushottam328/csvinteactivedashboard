(function(){
  const dropzone = document.getElementById('dropzone');
  const fileInput = document.getElementById('fileInput');
  const errBox = document.getElementById('err');
  const dash = document.getElementById('dash');
  const statusLine = document.getElementById('statusLine');
  const fbName = document.getElementById('fbName');
  const sampleBtn = document.getElementById('sampleBtn');
  const clearBtn = document.getElementById('clearBtn');

  let rawRows = [];      // array of objects
  let columns = [];      // column names
  let numericCols = [];  // column names detected numeric
  let sortState = {col:null, dir:1};
  let filterText = '';
  let page = 0;
  const PAGE_SIZE = 12;
  let chart = null;
  let chartType = 'bar';

  // ---------- CSV parsing (handles quoted fields & commas) ----------
  function parseCSV(text){
    const rows = [];
    let row = [], field = '', inQuotes = false;
    for(let i=0;i<text.length;i++){
      const c = text[i];
      if(inQuotes){
        if(c === '"'){
          if(text[i+1] === '"'){ field += '"'; i++; }
          else inQuotes = false;
        } else field += c;
      } else {
        if(c === '"') inQuotes = true;
        else if(c === ','){ row.push(field); field=''; }
        else if(c === '\n'){ row.push(field); rows.push(row); row=[]; field=''; }
        else if(c === '\r'){ /* skip */ }
        else field += c;
      }
    }
    if(field.length || row.length){ row.push(field); rows.push(row); }
    return rows.filter(r => r.length > 1 || (r.length===1 && r[0].trim()!==''));
  }

  function loadCSVText(text, name){
    try{
      const table = parseCSV(text);
      if(table.length < 2) throw new Error('need a header row and at least one data row');
      const headers = table[0].map(h => h.trim());
      const dataRows = table.slice(1);
      rawRows = dataRows.map(r => {
        const obj = {};
        headers.forEach((h,idx) => obj[h] = (r[idx] !== undefined ? r[idx].trim() : ''));
        return obj;
      });
      columns = headers;
      detectNumeric();
      renderDashboard(name);
      errBox.style.display = 'none';
    } catch(e){
      showError('Could not read that file — ' + e.message);
    }
  }

  function showError(msg){
    errBox.textContent = msg;
    errBox.style.display = 'block';
  }

  function detectNumeric(){
    numericCols = columns.filter(col => {
      let numCount = 0, total = 0;
      for(const r of rawRows){
        const v = r[col];
        if(v === '') continue;
        total++;
        if(!isNaN(parseFloat(v)) && isFinite(v)) numCount++;
      }
      return total > 0 && numCount / total > 0.8;
    });
  }

  // ---------- Upload handlers ----------
  dropzone.addEventListener('click', () => fileInput.click());
  dropzone.addEventListener('dragover', e => { e.preventDefault(); dropzone.classList.add('drag'); });
  dropzone.addEventListener('dragleave', () => dropzone.classList.remove('drag'));
  dropzone.addEventListener('drop', e => {
    e.preventDefault(); dropzone.classList.remove('drag');
    const f = e.dataTransfer.files[0];
    if(f) handleFile(f);
  });
  fileInput.addEventListener('change', e => {
    const f = e.target.files[0];
    if(f) handleFile(f);
  });
  clearBtn.addEventListener('click', () => {
    dash.classList.remove('show');
    fileInput.value = '';
    statusLine.textContent = 'no file loaded';
    window.scrollTo({top:0, behavior:'smooth'});
  });

  function handleFile(f){
    if(!f.name.toLowerCase().endsWith('.csv') && f.type !== 'text/csv'){
      showError('That doesn\'t look like a .csv file — try exporting your sheet as CSV first.');
      return;
    }
    const reader = new FileReader();
    reader.onload = ev => loadCSVText(ev.target.result, f.name);
    reader.onerror = () => showError('The file couldn\'t be read.');
    reader.readAsText(f);
  }

  sampleBtn.addEventListener('click', () => {
    const sample = buildSampleCSV();
    loadCSVText(sample, 'sample_sales_data.csv');
  });

  function buildSampleCSV(){
    const regions = ['North','South','East','West','Central'];
    const products = ['Notebook','Backpack','Pen Set','Water Bottle','Desk Lamp','Headphones'];
    let rows = ['region,product,month,units_sold,revenue'];
    const months = ['Jan','Feb','Mar','Apr','May','Jun'];
    for(let i=0;i<60;i++){
      const region = regions[i % regions.length];
      const product = products[Math.floor(Math.random()*products.length)];
      const month = months[Math.floor(Math.random()*months.length)];
      const units = Math.floor(20 + Math.random()*180);
      const revenue = (units * (8 + Math.random()*40)).toFixed(2);
      rows.push([region, product, month, units, revenue].join(','));
    }
    return rows.join('\n');
  }

  // ---------- Dashboard render ----------
  function renderDashboard(name){
    fbName.textContent = name;
    statusLine.innerHTML = '<b>' + rawRows.length + ' rows</b> loaded';
    document.getElementById('colInfo').textContent = columns.length + ' columns · ' + numericCols.length + ' numeric';

    renderStats();
    populateColumnSelects();
    renderTableHead();
    sortState = {col:null, dir:1};
    filterText = '';
    document.getElementById('search').value = '';
    page = 0;
    renderTableBody();
    renderChart();

    dash.classList.add('show');
  }

  function renderStats(){
    const statsRow = document.getElementById('statsRow');
    let cells = [
      {label:'total records', value: rawRows.length},
      {label:'total columns', value: columns.length},
    ];
    if(numericCols.length){
      const col = numericCols[0];
      const vals = rawRows.map(r => parseFloat(r[col])).filter(v => !isNaN(v));
      const max = Math.max(...vals), min = Math.min(...vals);
      const avg = vals.reduce((a,b)=>a+b,0) / vals.length;
      cells.push({label:'max ' + col, value: fmt(max)});
      cells.push({label:'min ' + col, value: fmt(min)});
      cells.push({label:'avg ' + col, value: fmt(avg)});
    }
    statsRow.innerHTML = cells.map(c =>
      '<div class="stat-cell"><div class="label">'+escapeHTML(c.label)+'</div><div class="value">'+escapeHTML(String(c.value))+'</div></div>'
    ).join('');
  }

  function fmt(n){
    if(Math.abs(n) >= 1000) return n.toLocaleString(undefined, {maximumFractionDigits:1});
    return Math.round(n*100)/100;
  }

  function populateColumnSelects(){
    const colX = document.getElementById('colX');
    const colY = document.getElementById('colY');
    colX.innerHTML = columns.map(c => '<option value="'+escapeAttr(c)+'">'+escapeHTML(c)+'</option>').join('');
    colY.innerHTML = (numericCols.length ? numericCols : columns).map(c => '<option value="'+escapeAttr(c)+'">'+escapeHTML(c)+'</option>').join('');
    // sensible defaults: first non-numeric as X, first numeric as Y
    const firstCat = columns.find(c => !numericCols.includes(c)) || columns[0];
    colX.value = firstCat;
    if(numericCols.length) colY.value = numericCols[0];
    colX.addEventListener('change', renderChart);
    colY.addEventListener('change', renderChart);
  }

  document.getElementById('chartTabs').addEventListener('click', e => {
    const btn = e.target.closest('button[data-type]');
    if(!btn) return;
    document.querySelectorAll('#chartTabs button').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    chartType = btn.dataset.type;
    renderChart();
  });

  function renderChart(){
    const colX = document.getElementById('colX').value;
    const colY = document.getElementById('colY').value;
    const emptyMsg = document.getElementById('chartEmpty');
    const canvas = document.getElementById('chartCanvas');
    if(!colX || !colY){ emptyMsg.style.display='block'; canvas.style.display='none'; return; }

    // aggregate: sum colY grouped by colX (or count if colY not numeric)
    const isNumericY = numericCols.includes(colY);
    const agg = {};
    rawRows.forEach(r => {
      const key = r[colX] === '' ? '(blank)' : r[colX];
      const v = isNumericY ? parseFloat(r[colY]) : 1;
      if(isNaN(v)) return;
      agg[key] = (agg[key] || 0) + v;
    });
    let entries = Object.entries(agg).sort((a,b) => b[1]-a[1]);
    if(entries.length > 12) entries = entries.slice(0,12);
    const labels = entries.map(e => e[0]);
    const data = entries.map(e => e[1]);

    if(!labels.length){ emptyMsg.style.display='block'; canvas.style.display='none'; return; }
    emptyMsg.style.display='none'; canvas.style.display='block';

    const palette = ['#2F6F5E','#C9622B','#4A5FBF','#8A7B45','#7A4A6B','#3E8471','#B0562A','#5C6FCC','#6E8A3E','#A6663F'];

    if(chart) chart.destroy();
    const ctx = canvas.getContext('2d');
    chart = new Chart(ctx, {
      type: chartType,
      data: {
        labels: labels,
        datasets: [{
          label: colY + (isNumericY ? '' : ' (count)'),
          data: data,
          backgroundColor: chartType === 'line' ? 'rgba(47,111,94,0.15)' : labels.map((_,i)=>palette[i % palette.length]),
          borderColor: chartType === 'line' ? '#2F6F5E' : labels.map((_,i)=>palette[i % palette.length]),
          borderWidth: chartType === 'line' ? 2 : 1,
          fill: chartType === 'line',
          tension: 0.25,
        }]
      },
      options: {
        responsive:true, maintainAspectRatio:false,
        plugins:{
          legend:{display: chartType==='pie', labels:{font:{family:"'IBM Plex Mono', monospace", size:11}, color:'#1B1F1D'}},
          tooltip:{titleFont:{family:"'IBM Plex Mono', monospace"}, bodyFont:{family:"'IBM Plex Mono', monospace"}}
        },
        scales: chartType === 'pie' ? {} : {
          x:{ticks:{font:{family:"'IBM Plex Mono', monospace", size:10}, color:'#5B6058'}, grid:{color:'#D8D3C4'}},
          y:{ticks:{font:{family:"'IBM Plex Mono', monospace", size:10}, color:'#5B6058'}, grid:{color:'#D8D3C4'}}
        }
      }
    });
  }

  // ---------- Table ----------
  function renderTableHead(){
    const theadRow = document.getElementById('theadRow');
    theadRow.innerHTML = columns.map(c =>
      '<th data-col="'+escapeAttr(c)+'">'+escapeHTML(c)+'<span class="arrow" data-arrow="'+escapeAttr(c)+'"></span></th>'
    ).join('');
    theadRow.querySelectorAll('th').forEach(th => {
      th.addEventListener('click', () => {
        const col = th.dataset.col;
        if(sortState.col === col) sortState.dir *= -1;
        else { sortState.col = col; sortState.dir = 1; }
        page = 0;
        renderTableBody();
      });
    });
  }

  function getFilteredSorted(){
    let rows = rawRows;
    if(filterText){
      const ft = filterText.toLowerCase();
      rows = rows.filter(r => columns.some(c => String(r[c]).toLowerCase().includes(ft)));
    }
    if(sortState.col){
      const col = sortState.col;
      const numeric = numericCols.includes(col);
      rows = [...rows].sort((a,b) => {
        let va = a[col], vb = b[col];
        if(numeric){ va = parseFloat(va)||0; vb = parseFloat(vb)||0; return (va-vb)*sortState.dir; }
        return String(va).localeCompare(String(vb)) * sortState.dir;
      });
    }
    return rows;
  }

  function renderTableBody(){
    const rows = getFilteredSorted();
    const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
    if(page >= totalPages) page = totalPages - 1;
    const pageRows = rows.slice(page*PAGE_SIZE, page*PAGE_SIZE + PAGE_SIZE);

    document.getElementById('tbody').innerHTML = pageRows.map(r =>
      '<tr>' + columns.map(c => '<td>'+escapeHTML(String(r[c]))+'</td>').join('') + '</tr>'
    ).join('') || '<tr><td style="padding:20px; color:var(--ink-soft);" colspan="'+columns.length+'">no matching rows</td></tr>';

    document.getElementById('rowcount').textContent = rows.length + ' of ' + rawRows.length + ' rows';
    document.getElementById('pageInfo').textContent = 'page ' + (page+1) + ' of ' + totalPages;
    document.getElementById('prevPage').disabled = page === 0;
    document.getElementById('nextPage').disabled = page >= totalPages - 1;

    // arrows
    document.querySelectorAll('[data-arrow]').forEach(a => {
      a.textContent = a.dataset.arrow === sortState.col ? (sortState.dir === 1 ? '↑' : '↓') : '';
    });
  }

  document.getElementById('search').addEventListener('input', e => {
    filterText = e.target.value;
    page = 0;
    renderTableBody();
  });
  document.getElementById('prevPage').addEventListener('click', () => { if(page>0){ page--; renderTableBody(); } });
  document.getElementById('nextPage').addEventListener('click', () => { page++; renderTableBody(); });

  function escapeHTML(s){
    return s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }
  function escapeAttr(s){ return escapeHTML(s); }

})();
