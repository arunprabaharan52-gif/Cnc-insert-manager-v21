(function () {
  'use strict';
  const C = globalThis.CNCV37;
  const state = {
    db: null, storage: null, user: null, profile: null,
    inserts: {}, operators: {}, inventory: {}, ledger: {}, operatorData: {},
    issues: {}, approvals: {}, returnRequests: {}, reportRequests: {}, queue: {}, users: {}, roleRequests: {}, notices: {},
    legacyReports: {}, settings: {}, stockRequests: {}, meta: {}, companies: {}, jobMasters: {}, drawings: {}, drawingRequests: {}, estimates: {}, batches: {}, legacyPreview: null,
    restorePreview: null, lastStockRequestId: '', noticeMediaBlob: null, noticeMediaName: '', noticeMediaType: '', noticePreviewUrl: '', voiceRecorder: null, voiceStream: null, voiceTimer: null, discardVoice: false
  };
  const $ = id => document.getElementById(id);
  const values = value => C.objectValues(value);
  const stamp = value => {
    if (!value) return '—';
    const date = new Date(typeof value === 'number' ? value : String(value));
    return Number.isNaN(date.getTime()) ? C.escapeHtml(String(value)) : date.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
  };
  const setStatus = (element, message, kind = '') => {
    element.textContent = message;
    element.className = `notice${kind ? ` ${kind}` : ''}`;
  };
  const emptyRow = (columns, message) => `<tr><td colspan="${columns}" class="empty">${C.escapeHtml(message)}</td></tr>`;
  const durationLabel = minutes => { const total = Math.max(0, Math.round(C.number(minutes))); return `${Math.floor(total / 60)}h ${String(total % 60).padStart(2, '0')}m`; };
  const badge = status => {
    const clean = String(status || 'UNKNOWN').toUpperCase();
    const kind = /APPROVED|ACTIVE|CLOSED|DISPENSED|POSTED|PROCESSED|SUBMITTED|PROFIT|GOOD|CONTINUE|READY|BETTER|ON TARGET/.test(clean) ? 'ok'
      : /PENDING|QUEUED|PROCESSING|OPEN|RESERVING|LATE|BORDERLINE|NOT SET|NEEDS DATA|WATCH|NOT RECORDED/.test(clean) ? 'warn'
        : /REJECTED|FAILED|INACTIVE|CANCELLED|NOT SUITABLE|POOR|LOSS|IMPROVEMENT REQUIRED/.test(clean) ? 'bad' : 'info';
    return `<span class="status ${kind}">${C.escapeHtml(clean)}</span>`;
  };
  const keyedValues = object => Object.entries(object || {}).map(([key, value]) => ({ _key: key, ...(value || {}) }));
  const insertFor = sku => state.inserts[C.safeKey(String(sku || '').toUpperCase())] || values(state.inserts).find(row => row.sku === sku);
  const operatorFor = code => state.operators[C.safeKey(String(code || '').toUpperCase())] || values(state.operators).find(row => row.code === code);
  const userFor = uid => state.users[uid] || {};
  const allReports = () => {
    const current = [];
    Object.entries(state.operatorData || {}).forEach(([uid, data]) => {
      Object.entries(data?.reports || {}).forEach(([key, report]) => current.push({ _key: key, ownerUid: uid, ...(report || {}) }));
    });
    return current.concat(keyedValues(state.legacyReports).map(row => ({ ...row, legacy: true })));
  };
  const allReturnRequests = () => {
    const rows = [];
    Object.entries(state.returnRequests || {}).forEach(([uid, group]) => Object.entries(group || {}).forEach(([key, value]) => rows.push({ _key: key, ownerUid: uid, ...(value || {}) })));
    return rows;
  };
  const allReportRequests = () => {
    const rows = [];
    Object.entries(state.reportRequests || {}).forEach(([uid, group]) => Object.entries(group || {}).forEach(([date, value]) => rows.push({ _dateKey: date, ownerUid: uid, ...(value || {}) })));
    return rows;
  };
  const hasRateSnapshot = report => C.asArray(report?.jobs).some(job => C.asArray(job?.parts).some(part => String(part?.rateCalculatedBy || '').toUpperCase() === 'SERVER'));
  const reportForRateMath = report => hasRateSnapshot(report) ? report : { ...report, machineRates: state.settings?.machineRates || {} };
  const jobRateFor = (job, report) => C.jobRateAnalysis(job, hasRateSnapshot(report) ? undefined : (state.settings?.machineRates || {}));

  function audit(action, details = {}) {
    const id = C.newId('AUD');
    return state.db.ref(`cncManager/audit/${C.safeKey(id)}`).set({
      id, action, details, actorUid: state.user.uid, actorEmail: state.user.email || '', createdAt: firebase.database.ServerValue.TIMESTAMP
    });
  }

  function showPage(pageId) {
    document.querySelectorAll('.page').forEach(page => page.classList.toggle('active', page.id === pageId));
    document.querySelectorAll('nav.tabs button').forEach(button => button.classList.toggle('active', button.dataset.page === pageId));
    if (pageId === 'dashboard') renderDashboard();
    if (pageId === 'production') renderProduction();
    if (pageId === 'reports') renderReports();
  }

  function setupNavigation() {
    document.querySelectorAll('nav.tabs button').forEach(button => button.addEventListener('click', () => showPage(button.dataset.page)));
    $('logoutBtn').addEventListener('click', () => CNCAuth.logout());
    $('accountReset').addEventListener('click', async () => {
      try { const email = await CNCAuth.sendPasswordReset(); alert(`Password reset email sent to ${email}`); }
      catch (error) { alert(error.message); }
    });
    $('printDashboard').addEventListener('click', () => window.print());
  }

  function machineOptions(selected = '') {
    return '<option value="">Select machine</option>' + C.MACHINES.map(row => `<option value="${row.code}"${row.code === selected ? ' selected' : ''}>${row.name}</option>`).join('');
  }

  const companyFor = id => state.companies[id] || {};
  const drawingFor = id => state.drawings[id] || {};
  const jobMasterFor = id => state.jobMasters[id] || {};
  const estimateFor = id => state.estimates[id] || {};

  function operatorOptions(selected = '') {
    const rows = values(state.operators).filter(row => row.active !== false && row.uid).sort((a, b) => String(a.name || a.code).localeCompare(String(b.name || b.code)));
    return '<option value="">Select operator</option>' + rows.map(row => { const load = C.operatorMachineLoad(state.batches, row.uid); const machines = load.machineCodes.join(' + ') || 'No active machine'; return `<option value="${C.escapeHtml(row.uid)}"${row.uid === selected ? ' selected' : ''}>${C.escapeHtml(row.name || row.code)} · ${C.escapeHtml(row.code)} · ${C.escapeHtml(machines)} (${load.machineCount}/${C.MAX_OPERATOR_MACHINES})</option>`; }).join('');
  }

  function insertOptions(selected = '') {
    return '<option value="">No insert required</option>' + values(state.inserts).filter(row => row.active !== false).sort((a, b) => String(a.sku).localeCompare(String(b.sku))).map(row => `<option value="${C.escapeHtml(row.sku)}"${row.sku === selected ? ' selected' : ''}>${C.escapeHtml(row.sku)} · ${C.escapeHtml(row.name)}</option>`).join('');
  }

  function companyOptions(selected = '') {
    return '<option value="">Select company</option>' + keyedValues(state.companies).filter(row => row.active !== false || row._key === selected).sort((a, b) => String(a.name).localeCompare(String(b.name))).map(row => `<option value="${C.escapeHtml(row._key)}"${row._key === selected ? ' selected' : ''}>${C.escapeHtml(row.code)} — ${C.escapeHtml(row.name)}</option>`).join('');
  }

  function refreshProductionSelects() {
    const companySelects = ['drawingCompany', 'jobCompany', 'estimateCompany', 'batchCompany'];
    companySelects.forEach(id => { const selected = $(id).value; $(id).innerHTML = companyOptions(selected); });
    const drawingCompany = $('jobCompany').value; const selectedDrawing = $('jobDrawing').value;
    const drawingRows = keyedValues(state.drawings).filter(row => !drawingCompany || row.companyId === drawingCompany).sort((a, b) => String(a.drawingNo || a.originalName).localeCompare(String(b.drawingNo || b.originalName)));
    $('jobDrawing').innerHTML = '<option value="">No drawing linked</option>' + drawingRows.map(row => `<option value="${C.escapeHtml(row._key)}"${row._key === selectedDrawing ? ' selected' : ''}>${C.escapeHtml(row.drawingNo || row.originalName)}${row.drawingRevision ? ` · Rev ${C.escapeHtml(row.drawingRevision)}` : ''}${row.confirmed ? ' · confirmed' : ' · review'}</option>`).join('');
    const batchCompany = $('batchCompany').value; const selectedJob = $('batchJob').value;
    const jobs = keyedValues(state.jobMasters).filter(row => row.active !== false && (!batchCompany || row.companyId === batchCompany)).sort((a, b) => String(a.name).localeCompare(String(b.name)));
    $('batchJob').innerHTML = '<option value="">Select job</option>' + jobs.map(row => `<option value="${C.escapeHtml(row._key)}"${row._key === selectedJob ? ' selected' : ''}>${C.escapeHtml(row.name)} — ${C.escapeHtml(row.partNo)}</option>`).join('');
    const estimateCompany = $('estimateCompany').value; const selectedEstimateJob = $('estimateJob').value; const estimateJobs = keyedValues(state.jobMasters).filter(row => row.active !== false && (!estimateCompany || row.companyId === estimateCompany)).sort((a, b) => String(a.name).localeCompare(String(b.name)));
    $('estimateJob').innerHTML = '<option value="">Select job / drawing</option>' + estimateJobs.map(row => `<option value="${C.escapeHtml(row._key)}"${row._key === selectedEstimateJob ? ' selected' : ''}>${C.escapeHtml(row.name)} · ${C.escapeHtml(row.partNo)} · ${C.escapeHtml(row.drawingNo || 'No drawing')}</option>`).join('');
    const selectedEstimate = $('batchEstimate').value; $('batchEstimate').innerHTML = '<option value="">Create without saved estimate</option>' + keyedValues(state.estimates).sort((a, b) => C.number(b.createdAt) - C.number(a.createdAt)).map(row => `<option value="${C.escapeHtml(row._key)}"${row._key === selectedEstimate ? ' selected' : ''}>${C.escapeHtml(row.estimateId || row._key)} · ${C.escapeHtml(row.poNumber)} · ${C.escapeHtml(row.jobName)}</option>`).join('');
    const selectedOperator = $('batchOperator').value; $('batchOperator').innerHTML = operatorOptions(selectedOperator);
    for (let number = 1; number <= 4; number += 1) { const select = $(`jobOp${number}Insert`); const selected = select.value; select.innerHTML = insertOptions(selected); }
  }

  function updateJobOperationRows() {
    const count = Math.min(4, Math.max(1, Number($('jobOperationCount').value) || 1));
    document.querySelectorAll('#jobOperationRows tr').forEach(row => {
      const enabled = Number(row.dataset.operation) <= count; row.classList.toggle('disabled-card', !enabled);
      row.querySelectorAll('input,select').forEach(input => { input.disabled = !enabled; });
    });
  }

  function renderCompanies() {
    $('companyRows').innerHTML = keyedValues(state.companies).sort((a, b) => String(a.name).localeCompare(String(b.name))).map(row => `<tr><td><b>${C.escapeHtml(row.code)}</b></td><td>${C.escapeHtml(row.name)}</td><td>${badge(row.active !== false ? 'ACTIVE' : 'INACTIVE')}</td><td><button class="edit-company" data-id="${C.escapeHtml(row._key)}">Edit</button></td></tr>`).join('') || emptyRow(4, 'No company master.');
    document.querySelectorAll('.edit-company').forEach(button => button.addEventListener('click', () => editCompany(button.dataset.id)));
  }

  function resetCompanyForm() {
    $('companyForm').reset(); $('editingCompanyId').value = ''; $('companyActive').value = 'true'; $('companyStatus').className = 'notice hidden';
  }

  function editCompany(id) {
    const row = companyFor(id); if (!row.name) return;
    $('editingCompanyId').value = id; $('companyCode').value = row.code || ''; $('companyName').value = row.name || ''; $('companyActive').value = String(row.active !== false); $('companyForm').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function saveCompany(event) {
    event.preventDefault(); const code = String($('companyCode').value || '').trim().toUpperCase(); const name = String($('companyName').value || '').trim();
    if (!/^[A-Z0-9_-]{2,30}$/.test(code) || !name) return setStatus($('companyStatus'), 'Company code 2–30 letters/numbers/_/- மற்றும் company name தேவை.', 'error');
    const editing = $('editingCompanyId').value; const collision = keyedValues(state.companies).find(row => row.code === code && row._key !== editing); if (collision) return setStatus($('companyStatus'), `${code} already exists.`, 'error');
    const companyId = editing || C.safeKey(`COMP-${code}`); const row = { companyId, code, name: name.slice(0, 120), active: $('companyActive').value === 'true', updatedBy: state.user.uid, updatedAt: firebase.database.ServerValue.TIMESTAMP };
    try { await state.db.ref(`cncManager/publicMaster/companies/${companyId}`).set(row); await audit('COMPANY_SAVE', { companyId, code, active: row.active }); resetCompanyForm(); setStatus($('globalStatus'), `${name} company saved.`, 'ok'); }
    catch (error) { setStatus($('companyStatus'), error.message, 'error'); }
  }

  function renderDrawings() {
    $('drawingRows').innerHTML = keyedValues(state.drawings).sort((a, b) => C.number(b.uploadedAt) - C.number(a.uploadedAt)).map(row => {
      const request = state.drawingRequests[row._key] || {}; const analysisStatus = request.status || row.analysisStatus || 'UPLOADED'; const operations = row.confirmedOperationCount || row.suggestedOperationCount || 1; const dimensions = C.asArray(row.confirmedDimensions || row.dimensionSuggestions).length;
      return `<tr><td>${C.escapeHtml(row.companyName || companyFor(row.companyId).name)}</td><td><b>${C.escapeHtml(row.drawingNo || row.originalName)}</b><br>${C.escapeHtml(row.drawingRevision ? `Rev ${row.drawingRevision}` : '')}</td><td>${badge(analysisStatus)}${request.error ? `<br><small class="badtxt">${C.escapeHtml(request.error)}</small>` : ''}</td><td>${operations} ${row.confirmed ? badge('CONFIRMED') : badge('REVIEW')}</td><td>${dimensions} suggested</td><td><div class="actions"><button class="open-drawing" data-id="${C.escapeHtml(row._key)}">Open</button><button class="confirm-drawing good" data-id="${C.escapeHtml(row._key)}">Confirm sides</button><button class="dimension-template" data-id="${C.escapeHtml(row._key)}">Dimension CSV</button></div></td></tr>`;
    }).join('') || emptyRow(6, 'No drawing uploaded.');
    document.querySelectorAll('.open-drawing').forEach(button => button.addEventListener('click', () => openDrawing(button.dataset.id)));
    document.querySelectorAll('.confirm-drawing').forEach(button => button.addEventListener('click', () => confirmDrawing(button.dataset.id)));
    document.querySelectorAll('.dimension-template').forEach(button => button.addEventListener('click', () => exportDimensionTemplate(button.dataset.id)));
  }

  async function saveDrawing(event) {
    event.preventDefault(); const companyId = $('drawingCompany').value; const company = companyFor(companyId); const file = $('drawingFile').files[0]; const contentType = String(file?.type || '').toLowerCase();
    if (!company.name) return setStatus($('drawingStatus'), 'Company தேர்ந்தெடுக்கவும்.', 'error');
    if (!file || !/^(application\/pdf|image\/(jpeg|png|webp))$/.test(contentType) || file.size > 25 * 1024 * 1024) return setStatus($('drawingStatus'), 'PDF/JPG/PNG/WebP file மட்டும்; அதிகபட்சம் 25 MB.', 'error');
    const drawingId = C.safeKey(C.newId('DRW')); const safeName = String(file.name || 'drawing').replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 140); const storagePath = `cncManager/drawings/${drawingId}/${safeName}`; const storageRef = state.storage.ref(storagePath); const button = $('drawingForm').querySelector('button[type=submit]'); button.disabled = true;
    setStatus($('drawingStatus'), 'Drawing upload ஆகிறது…', 'warn');
    try {
      await storageRef.put(file, { contentType, customMetadata: { drawingId, companyId, uploadedBy: state.user.uid } });
      const metadata = { drawingId, companyId, companyName: company.name, drawingNo: String($('drawingNo').value || '').trim().toUpperCase().slice(0, 100), drawingRevision: String($('drawingRevision').value || '').trim().toUpperCase().slice(0, 40), originalName: file.name.slice(0, 180), contentType, size: file.size, storagePath, analysisStatus: 'PENDING', confirmed: false, uploadedBy: state.user.uid, uploadedAt: firebase.database.ServerValue.TIMESTAMP };
      const request = { drawingId, companyId, ownerUid: state.user.uid, storagePath, contentType, originalName: metadata.originalName, status: 'PENDING', requestedAt: firebase.database.ServerValue.TIMESTAMP, clientVersion: C.VERSION };
      await state.db.ref().update({ [`cncManager/drawings/${drawingId}`]: metadata, [`cncManager/drawingAnalysisRequests/${drawingId}`]: request });
      $('drawingForm').reset(); setStatus($('drawingStatus'), 'Upload முடிந்தது. OCR suggestion வந்ததும் Admin sides மற்றும் dimensions review செய்ய வேண்டும்.', 'ok'); await audit('DRAWING_UPLOAD', { drawingId, companyId, storagePath });
    } catch (error) { await storageRef.delete().catch(() => {}); setStatus($('drawingStatus'), error.message, 'error'); }
    finally { button.disabled = false; }
  }

  async function openDrawing(id) {
    const row = drawingFor(id); if (!row.storagePath) return;
    const popup = window.open('', '_blank'); try { const url = await state.storage.ref(row.storagePath).getDownloadURL(); if (popup) popup.location.href = url; else location.href = url; }
    catch (error) { popup?.close(); setStatus($('globalStatus'), `Drawing open failed: ${error.message}`, 'error'); }
  }

  async function confirmDrawing(id) {
    const row = drawingFor(id); if (!row.storagePath) return; const suggested = Number(row.confirmedOperationCount || row.suggestedOperationCount || 1); const answer = prompt('இந்த drawing-க்கு எத்தனை Head / Side / Operation? 1 முதல் 4 வரை.', String(suggested)); if (answer == null) return; const count = Number(answer);
    if (!Number.isInteger(count) || count < 1 || count > 4) return alert('1 முதல் 4 வரை முழு எண் கொடுக்கவும்.');
    const drawingNo = String(prompt('Drawing number சரிபார்த்து உறுதிப்படுத்தவும்.', row.drawingNo || row.suggestedDrawingNo || '') ?? '').trim().toUpperCase().slice(0, 100); const drawingRevision = String(prompt('Revision சரிபார்த்து உறுதிப்படுத்தவும்.', row.drawingRevision || row.suggestedRevision || '') ?? '').trim().toUpperCase().slice(0, 40);
    try { await state.db.ref(`cncManager/drawings/${id}`).update({ drawingNo, drawingRevision, confirmedOperationCount: count, confirmedDimensions: row.dimensionSuggestions || [], confirmed: true, reviewedBy: state.user.uid, reviewedAt: firebase.database.ServerValue.TIMESTAMP, analysisStatus: 'CONFIRMED' }); await audit('DRAWING_CONFIRM', { drawingId: id, operationCount: count, dimensionCount: C.asArray(row.dimensionSuggestions).length }); setStatus($('globalStatus'), `${drawingNo || row.originalName}: ${count} operation(s) confirmed.`, 'ok'); }
    catch (error) { setStatus($('globalStatus'), error.message, 'error'); }
  }

  function exportDimensionTemplate(id) {
    const row = drawingFor(id); if (!row.storagePath) return; const dimensions = C.asArray(row.confirmedDimensions || row.dimensionSuggestions); const headings = ['Report No', 'Date', 'Company', 'PO/SO', 'Job / Part Name', 'Part No', 'Drawing No', 'Revision', 'WO / Job Card', 'Machine', 'Operation', 'Batch / Lot', 'Sample Size', 'Inspector', 'Sl.No', 'Characteristic / Balloon / Zone', 'Description', 'Nominal', 'Upper Tolerance', 'Lower Tolerance', 'Measuring Instrument', 'Instrument ID', 'Actual 1', 'Actual 2', 'Actual 3', 'Actual 4', 'Actual 5', 'Mean', 'Deviation', 'Min', 'Max', 'OK / NG', 'Remarks'];
    const company = row.companyName || companyFor(row.companyId).name || ''; const lines = [headings];
    (dimensions.length ? dimensions : [{ number: 1, callout: '', nominal: '', upperTolerance: '', lowerTolerance: '' }]).forEach((dimension, index) => lines.push(['', '', company, '', '', '', row.drawingNo || '', row.drawingRevision || '', '', '', '', '', '', '', dimension.number || index + 1, dimension.callout || '', '', dimension.nominal ?? '', dimension.upperTolerance ?? '', dimension.lowerTolerance ?? '', '', '', '', '', '', '', '', '', '', '', '', '', '']));
    download(`dimension-template-${C.safeKey(row.drawingNo || id)}.csv`, '\uFEFF' + lines.map(line => line.map(C.csvCell).join(',')).join('\n'), 'text/csv;charset=utf-8');
  }

  function resetJobMasterForm() {
    $('jobMasterForm').reset(); $('editingJobMasterId').value = ''; $('jobOperationCount').value = '1'; $('jobMasterActive').value = 'true'; ['FIRST SIDE', 'SECOND SIDE', 'THIRD SIDE', 'FOURTH SIDE'].forEach((name, index) => { const number = index + 1; $(`jobOp${number}Name`).value = name; $(`jobOp${number}Cycle`).value = ''; $(`jobOp${number}Setup`).value = '0'; $(`jobOp${number}Rpm`).value = ''; $(`jobOp${number}Tool`).value = ''; $(`jobOp${number}Holder`).value = ''; $(`jobOp${number}ToolQty`).value = '0'; $(`jobOp${number}ToolCost`).value = '0'; $(`jobOp${number}Insert`).value = ''; $(`jobOp${number}Rate`).value = '0'; }); updateJobOperationRows(); $('jobMasterStatus').className = 'notice hidden'; refreshProductionSelects();
  }

  async function saveJobMaster(event) {
    event.preventDefault(); const companyId = $('jobCompany').value; const company = companyFor(companyId); const name = String($('jobMasterName').value || '').trim(); const partNo = String($('jobMasterPartNo').value || '').trim().toUpperCase(); const operationCount = Number($('jobOperationCount').value); const drawingId = $('jobDrawing').value; const drawing = drawingFor(drawingId); const errors = [];
    if (!company.name) errors.push('Company தேவை.'); if (!name) errors.push('Job name தேவை.'); if (!partNo) errors.push('Part number தேவை.'); if (!Number.isInteger(operationCount) || operationCount < 1 || operationCount > 4) errors.push('1–4 Head/Side மட்டும்.'); if (drawingId && drawing.companyId !== companyId) errors.push('Drawing வேறு company-க்கு சேர்ந்தது.');
    const operations = Array.from({ length: operationCount }, (_, index) => { const number = index + 1; return { number, name: String($(`jobOp${number}Name`).value || `SIDE ${number}`).trim().slice(0, 80), machine: $(`jobOp${number}Machine`).value, cycleMinutes: Number($(`jobOp${number}Cycle`).value), setupMinutes: Math.max(0, Number($(`jobOp${number}Setup`).value) || 0), rpm: Number($(`jobOp${number}Rpm`).value), toolName: String($(`jobOp${number}Tool`).value || '').trim().slice(0, 120), holderName: String($(`jobOp${number}Holder`).value || '').trim().slice(0, 120), toolQuantity: Math.max(0, Math.trunc(Number($(`jobOp${number}ToolQty`).value) || 0)), toolUnitCost: Math.max(0, Number($(`jobOp${number}ToolCost`).value) || 0), insertSku: $(`jobOp${number}Insert`).value, customerRate: Math.max(0, Number($(`jobOp${number}Rate`).value) || 0) }; });
    operations.forEach((row, index) => { if (!C.MACHINES.some(machine => machine.code === row.machine)) errors.push(`Side ${index + 1}: machine தேவை.`); if (!(row.cycleMinutes > 0)) errors.push(`Side ${index + 1}: standard cycle minutes தேவை.`); if (!Number.isInteger(row.rpm) || row.rpm < 1 || row.rpm > 100000) errors.push(`Side ${index + 1}: standard RPM 1–100000 தேவை.`); if (row.toolQuantity > 0 && !row.toolName) errors.push(`Side ${index + 1}: tool name தேவை.`); }); if (errors.length) return setStatus($('jobMasterStatus'), errors.join(' '), 'error');
    const editing = $('editingJobMasterId').value; const jobMasterId = editing || C.safeKey(C.newId('JOB')); const row = { jobMasterId, companyId, companyName: company.name, name: name.slice(0, 120), partNo: partNo.slice(0, 100), drawingId, drawingNo: drawing.drawingNo || '', drawingRevision: drawing.drawingRevision || '', operationCount, operations, totalCustomerRate: operations.reduce((sum, op) => sum + op.customerRate, 0), active: $('jobMasterActive').value === 'true', updatedBy: state.user.uid, updatedAt: firebase.database.ServerValue.TIMESTAMP };
    try { await state.db.ref(`cncManager/publicMaster/jobs/${jobMasterId}`).set(row); await audit('JOB_MASTER_SAVE', { jobMasterId, companyId, operationCount }); resetJobMasterForm(); setStatus($('globalStatus'), `${name} job master saved.`, 'ok'); }
    catch (error) { setStatus($('jobMasterStatus'), error.message, 'error'); }
  }

  function renderJobMasters() {
    $('jobMasterRows').innerHTML = keyedValues(state.jobMasters).sort((a, b) => String(a.companyName).localeCompare(String(b.companyName)) || String(a.name).localeCompare(String(b.name))).map(row => { const operations = C.asArray(row.operations).map(op => { const rate = C.partRateAnalysis({ machine: op.machine, cycleMinutes: op.cycleMinutes, sideRate: op.customerRate }, state.settings?.machineRates || {}); const resources = [op.toolName, op.holderName, op.insertSku].filter(Boolean).join(' / ') || 'No tool/insert entered'; return `${op.number}. ${op.name} · ${op.machine} · ${C.number(op.cycleMinutes).toFixed(3)} min + Setup ${C.number(op.setupMinutes).toFixed(1)} min · ${Math.trunc(C.number(op.rpm))} RPM · ${resources} · Quote ${C.money(op.customerRate)} · Cost ${C.money(rate.estimatedCostMin)}–${C.money(rate.estimatedCostMax)} · ${rate.rateStatus}`; }).join('\n'); return `<tr><td>${C.escapeHtml(row.companyName || companyFor(row.companyId).name)}</td><td><b>${C.escapeHtml(row.name)}</b><br>${C.escapeHtml(row.partNo)}</td><td>${C.escapeHtml(row.drawingNo || '—')}${row.drawingRevision ? `<br>Rev ${C.escapeHtml(row.drawingRevision)}` : ''}</td><td class="wrap preline">${C.escapeHtml(operations)}</td><td>${badge(row.active !== false ? 'ACTIVE' : 'INACTIVE')}</td><td><button class="edit-job-master" data-id="${C.escapeHtml(row._key)}">Edit</button></td></tr>`; }).join('') || emptyRow(6, 'No job master.');
    document.querySelectorAll('.edit-job-master').forEach(button => button.addEventListener('click', () => editJobMaster(button.dataset.id)));
  }

  function editJobMaster(id) {
    const row = jobMasterFor(id); if (!row.name) return; $('editingJobMasterId').value = id; $('jobCompany').value = row.companyId || ''; refreshProductionSelects(); $('jobMasterName').value = row.name || ''; $('jobMasterPartNo').value = row.partNo || ''; $('jobDrawing').value = row.drawingId || ''; $('jobOperationCount').value = String(row.operationCount || 1); $('jobMasterActive').value = String(row.active !== false);
    C.asArray(row.operations).forEach((op, index) => { const n = index + 1; $(`jobOp${n}Name`).value = op.name || `SIDE ${n}`; $(`jobOp${n}Machine`).value = op.machine || ''; $(`jobOp${n}Cycle`).value = C.number(op.cycleMinutes) || ''; $(`jobOp${n}Setup`).value = C.number(op.setupMinutes); $(`jobOp${n}Rpm`).value = C.number(op.rpm) || ''; $(`jobOp${n}Tool`).value = op.toolName || ''; $(`jobOp${n}Holder`).value = op.holderName || ''; $(`jobOp${n}ToolQty`).value = C.number(op.toolQuantity); $(`jobOp${n}ToolCost`).value = C.number(op.toolUnitCost); $(`jobOp${n}Insert`).value = op.insertSku || ''; $(`jobOp${n}Rate`).value = C.number(op.customerRate); }); updateJobOperationRows(); $('jobMasterForm').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function estimateEndDate(startDate, plannedDays) {
    if (!C.validIsoDate(startDate) || !(plannedDays > 0)) return '';
    const date = new Date(`${startDate}T00:00:00Z`); date.setUTCDate(date.getUTCDate() + Math.max(0, Math.ceil(plannedDays) - 1)); return date.toISOString().slice(0, 10);
  }

  function calculateEstimatePreview() {
    const job = jobMasterFor($('estimateJob').value); const quantity = Number($('estimateQty').value); const calculation = C.jobPlanningEstimate({ quantity, availableMinutesPerDay: $('estimateMinutesPerDay').value, efficiencyPercent: $('estimateEfficiency').value, operations: job.operations || [] }, state.settings?.machineRates || {}, state.inserts);
    const completionDate = estimateEndDate($('estimateStartDate').value, calculation.totals.plannedDays);
    $('estimateOperationRows').innerHTML = calculation.operations.map(row => `<tr><td><b>${row.number}. ${C.escapeHtml(row.name)}</b><br>${C.escapeHtml(row.machine)}</td><td>${row.cycleMinutes.toFixed(3)} min × ${calculation.quantity}<br>Setup ${row.setupMinutes.toFixed(1)} min</td><td>${C.escapeHtml(row.toolName || 'Not required')}${row.holderName ? `<br>${C.escapeHtml(row.holderName)}` : ''}${row.toolQuantity ? `<br>${row.toolQuantity} × ${C.money(row.toolUnitCost)}` : ''}</td><td>${row.insertSku ? `<b>${C.escapeHtml(row.insertSku)}</b><br>${row.partsPerInsert ? `${row.partsPerInsert} parts/insert · Need ${row.requiredInserts}` : 'Edge-life target missing'}` : 'No insert required'}</td><td>${durationLabel(row.elapsedMinutes)}<br>${row.plannedDays.toFixed(2)} day</td><td>${C.money(row.totalCostMin)}–${C.money(row.totalCostMax)}</td><td>${C.money(row.quoteValue)}</td><td>${row.missing.length ? badge('NEEDS DATA') + `<br><small>${C.escapeHtml(row.missing.join(', '))}</small>` : badge('READY')}</td></tr>`).join('') || emptyRow(8, 'Job மற்றும் quantity தேர்வு செய்யவும்.');
    const totals = calculation.totals; $('estimateSummary').innerHTML = `<span>Planned production: <b>${totals.plannedDays.toFixed(2)} days</b></span><span>Estimated completion: <b>${C.escapeHtml(completionDate || '—')}</b></span><span>Quote: <b>${C.money(totals.quoteValue)}</b></span><span>Total cost: <b>${C.money(totals.totalCostMin)}–${C.money(totals.totalCostMax)}</b></span><span>Margin: <b class="${totals.marginMin < 0 ? 'badtxt' : ''}">${C.money(totals.marginMin)}–${C.money(totals.marginMax)}</b></span><span>Decision: ${badge(calculation.decision)}</span>`;
    if (calculation.missing.length) setStatus($('estimateStatus'), `Reliable estimate-க்கு இன்னும் தேவை: ${calculation.missing.join('; ')}`, 'warn'); else setStatus($('estimateStatus'), 'Calculation READY — machine rate, cycle, tool and insert targets are available.', 'ok');
    return { job, calculation, completionDate };
  }

  async function saveEstimate(event) {
    event.preventDefault(); const companyId = $('estimateCompany').value; const company = companyFor(companyId); const jobMasterId = $('estimateJob').value; const { job, calculation, completionDate } = calculateEstimatePreview(); const poNumber = String($('estimatePo').value || '').trim().toUpperCase(); const plannedStartDate = $('estimateStartDate').value; const errors = [];
    if (!company.name || !job.name || job.companyId !== companyId) errors.push('Company மற்றும் அதற்கான Job தேவை.'); if (!poNumber) errors.push('PO / Work order தேவை.'); if (!(calculation.quantity > 0)) errors.push('Positive quantity தேவை.'); if (!C.validIsoDate(plannedStartDate)) errors.push('Planned start date தேவை.'); if (errors.length) return setStatus($('estimateStatus'), errors.join(' '), 'error');
    const estimateId = C.safeKey(C.newId('EST')); const row = { estimateId, companyId, companyName: company.name, jobMasterId, jobName: job.name, partNo: job.partNo, drawingId: job.drawingId || '', drawingNo: job.drawingNo || '', drawingRevision: job.drawingRevision || '', poNumber, quantity: calculation.quantity, plannedStartDate, estimatedCompletionDate: completionDate, availableMinutesPerDay: calculation.availableMinutesPerDay, efficiencyPercent: calculation.efficiencyPercent, operations: calculation.operations, totals: calculation.totals, missing: calculation.missing, ready: calculation.ready, decision: calculation.decision, notes: String($('estimateNotes').value || '').trim().slice(0, 300), createdBy: state.user.uid, createdAt: firebase.database.ServerValue.TIMESTAMP, updatedAt: firebase.database.ServerValue.TIMESTAMP };
    try { await state.db.ref(`cncManager/jobEstimates/${estimateId}`).set(row); await audit('JOB_ESTIMATE_SAVE', { estimateId, jobMasterId, poNumber, quantity: calculation.quantity, decision: calculation.decision }); setStatus($('estimateStatus'), `${estimateId} saved — ${calculation.decision}.`, calculation.ready ? 'ok' : 'warn'); }
    catch (error) { setStatus($('estimateStatus'), error.message, 'error'); }
  }

  function renderEstimates() {
    $('estimateRows').innerHTML = keyedValues(state.estimates).sort((a, b) => C.number(b.createdAt) - C.number(a.createdAt)).map(row => { const totals = row.totals || {}; return `<tr><td><b>${C.escapeHtml(row.estimateId || row._key)}</b><br>${C.escapeHtml(row.poNumber)}</td><td>${C.escapeHtml(`${row.companyName} · ${row.jobName} · ${row.partNo}`)}<br>${C.escapeHtml(row.drawingNo || 'No drawing')}</td><td>${C.number(row.quantity)} pcs<br>${C.number(totals.plannedDays).toFixed(2)} days · ${C.escapeHtml(row.estimatedCompletionDate || '—')}</td><td>Quote ${C.money(totals.quoteValue)}<br>Cost ${C.money(totals.totalCostMin)}–${C.money(totals.totalCostMax)}<br>Margin ${C.money(totals.marginMin)}–${C.money(totals.marginMax)}</td><td>${badge(row.decision || 'NEEDS DATA')}${C.asArray(row.missing).length ? `<br><small>${C.escapeHtml(C.asArray(row.missing).join('; '))}</small>` : ''}</td></tr>`; }).join('') || emptyRow(5, 'No saved estimates.');
  }

  function applyEstimateToBatch() {
    const estimate = estimateFor($('batchEstimate').value); if (!estimate.estimateId) return;
    $('batchCompany').value = estimate.companyId || ''; refreshProductionSelects(); $('batchJob').value = estimate.jobMasterId || ''; $('batchPo').value = estimate.poNumber || ''; $('batchTargetQty').value = C.number(estimate.quantity) || ''; $('batchDueDate').value = estimate.estimatedCompletionDate || '';
  }

  function renderBatches() {
    $('batchRows').innerHTML = keyedValues(state.batches).sort((a, b) => C.number(b.createdAt) - C.number(a.createdAt)).map(raw => { const row = C.normalizeProductionBatch(raw); const status = C.productionBatchStatus(row); const load = C.operatorMachineLoad(state.batches, row.assignedOperatorUid); const machineLabel = load.machineCodes.join(' + ') || 'No active machine'; const progress = row.operations.map(op => { const cycle = op.actualCycleMinutes > 0 ? ` · Target ${op.cycleMinutes.toFixed(3)} / Actual ${op.actualCycleMinutes.toFixed(3)} min · ${op.cycleStatus}` : ''; return `${op.number}. ${op.name} · ${op.machine} · ${op.state}${cycle}`; }).join('\n'); return `<tr><td><b>${C.escapeHtml(row.batchId)}</b><br>${C.escapeHtml(row.poNumber || 'No PO')}</td><td>${C.escapeHtml(`${row.companyName} · ${row.jobName} · ${row.partNo}`)}<br>Qty ${row.targetQty}${row.dueDate ? ` · Due ${C.escapeHtml(row.dueDate)}` : ''}</td><td><select class="batch-operator" data-id="${C.escapeHtml(row.batchId)}">${operatorOptions(row.assignedOperatorUid)}</select><br><small><b>Active:</b> ${C.escapeHtml(machineLabel)} · ${load.machineCount}/${C.MAX_OPERATOR_MACHINES}</small><br><button class="save-batch-operator" data-id="${C.escapeHtml(row.batchId)}">Save assignment</button></td><td class="wrap preline">${C.escapeHtml(progress)}</td><td><label class="check-label"><input class="batch-inspection" data-id="${C.escapeHtml(row.batchId)}" type="checkbox"${row.inspectionComplete ? ' checked' : ''}> Inspection</label><label class="check-label"><input class="batch-oiling" data-id="${C.escapeHtml(row.batchId)}" type="checkbox"${row.oilingComplete ? ' checked' : ''}> Oiling</label><label class="check-label"><input class="batch-packing" data-id="${C.escapeHtml(row.batchId)}" type="checkbox"${row.packingComplete ? ' checked' : ''}> Packing</label><label class="check-label"><input class="batch-dispatch" data-id="${C.escapeHtml(row.batchId)}" type="checkbox"${row.dispatchReady ? ' checked' : ''}> Dispatch ready</label><label class="check-label"><input class="batch-hold" data-id="${C.escapeHtml(row.batchId)}" type="checkbox"${row.hold ? ' checked' : ''}> Hold</label></td><td>${badge(status)}</td><td><button class="save-batch-final" data-id="${C.escapeHtml(row.batchId)}">Save final stage</button></td></tr>`; }).join('') || emptyRow(7, 'No production batch.');
    document.querySelectorAll('.save-batch-final').forEach(button => button.addEventListener('click', () => saveBatchFinal(button.dataset.id)));
    document.querySelectorAll('.save-batch-operator').forEach(button => button.addEventListener('click', () => saveBatchAssignment(button.dataset.id)));
  }

  async function saveBatch(event) {
    event.preventDefault(); const companyId = $('batchCompany').value; const jobMasterId = $('batchJob').value; const company = companyFor(companyId); const job = jobMasterFor(jobMasterId); const targetQty = Number($('batchTargetQty').value); const dueDate = $('batchDueDate').value; const assignedOperatorUid = $('batchOperator').value; const operator = values(state.operators).find(row => row.uid === assignedOperatorUid && row.active !== false); const drawing = drawingFor(job.drawingId); const errors = [];
    if (!company.name || !job.name || job.companyId !== companyId) errors.push('Company மற்றும் அதற்கான Job தேவை.'); if (!Number.isInteger(targetQty) || targetQty < 1) errors.push('Target quantity ஒரு positive whole number ஆக வேண்டும்.'); if (dueDate && !C.validIsoDate(dueDate)) errors.push('Due date தவறு.'); if (!operator) errors.push('Active operator assignment தேவை.'); if (errors.length) return setStatus($('batchStatus'), errors.join(' '), 'error');
    const batchId = C.safeKey(C.newId('BATCH')); const operations = C.asArray(job.operations).slice(0, job.operationCount || 1).map((op, index) => ({ ...C.normalizeOperation(op, index), state: 'PENDING', operatorCode: '', operatorUid: '', startedAt: 0, completedAt: 0, completedQty: 0, actualCycleMinutes: 0, cycleVarianceMinutes: 0, cycleVariancePercent: 0, cycleStatus: 'NOT RECORDED' }));
    const row = C.normalizeProductionBatch({ batchId, estimateId: $('batchEstimate').value, companyId, companyName: company.name, jobMasterId, jobName: job.name, partNo: job.partNo, poNumber: $('batchPo').value, drawingId: job.drawingId, drawingNo: job.drawingNo, drawingRevision: job.drawingRevision, drawingStoragePath: drawing.storagePath || '', assignedOperatorUid, assignedOperatorCode: operator.code, assignedOperatorName: operator.name, targetQty, dueDate, operationCount: operations.length, operations, requireActualCycle: true }); row.status = 'PENDING'; row.createdBy = state.user.uid; row.createdAt = firebase.database.ServerValue.TIMESTAMP; row.updatedAt = firebase.database.ServerValue.TIMESTAMP;
    const assignment = C.validateOperatorMachineAssignment(state.batches, row, assignedOperatorUid); if (!assignment.ok) return setStatus($('batchStatus'), `${assignment.errors.join(' ')} தற்போது: ${assignment.load.machineCodes.join(' + ')}.`, 'error'); row.assignmentMachineCount = assignment.load.machineCount; row.assignedMachineCodes = assignment.load.machineCodes;
    try { await state.db.ref(`cncManager/productionBatches/${batchId}`).set(row); await audit('BATCH_CREATE', { batchId, companyId, jobMasterId, targetQty, assignedOperatorUid }); $('batchForm').reset(); refreshProductionSelects(); setStatus($('batchStatus'), `${batchId} created and assigned to ${operator.name || operator.code}.`, 'ok'); }
    catch (error) { setStatus($('batchStatus'), error.message, 'error'); }
  }

  async function saveBatchAssignment(id) {
    const select = document.querySelector(`.batch-operator[data-id="${CSS.escape(id)}"]`); const uid = select?.value; const operator = values(state.operators).find(row => row.uid === uid && row.active !== false); const batch = C.normalizeProductionBatch(state.batches[id]); if (!operator) return alert('Active operator தேர்வு செய்யவும்.'); if (uid !== batch.assignedOperatorUid && batch.operations.some(operation => operation.state === 'RUNNING')) return alert('Side RUNNING நிலையில் operator assignment மாற்ற முடியாது. முதலில் அந்த Side-ஐ complete செய்யவும்.');
    const candidate = { ...batch, assignedOperatorUid: uid, assignedOperatorCode: operator.code, assignedOperatorName: operator.name }; const assignment = C.validateOperatorMachineAssignment(state.batches, candidate, uid); if (!assignment.ok) return alert(`${assignment.errors.join(' ')} தற்போது: ${assignment.load.machineCodes.join(' + ')}.`);
    try { await state.db.ref(`cncManager/productionBatches/${id}`).update({ assignedOperatorUid: uid, assignedOperatorCode: operator.code, assignedOperatorName: operator.name, assignmentMachineCount: assignment.load.machineCount, assignedMachineCodes: assignment.load.machineCodes, updatedAt: firebase.database.ServerValue.TIMESTAMP }); await audit('BATCH_ASSIGNMENT', { batchId: id, assignedOperatorUid: uid, machines: assignment.load.machineCodes }); setStatus($('globalStatus'), `${id} assigned to ${operator.name || operator.code}: ${assignment.load.machineCodes.join(' + ')} (${assignment.load.machineCount}/${C.MAX_OPERATOR_MACHINES}).`, 'ok'); }
    catch (error) { setStatus($('globalStatus'), error.message, 'error'); }
  }

  async function saveBatchFinal(id) {
    const selector = (name) => document.querySelector(`.${name}[data-id="${CSS.escape(id)}"]`); const batch = C.normalizeProductionBatch(state.batches[id]); const patch = { inspectionComplete: selector('batch-inspection').checked, oilingComplete: selector('batch-oiling').checked, packingComplete: selector('batch-packing').checked, dispatchReady: selector('batch-dispatch').checked, hold: selector('batch-hold').checked };
    const machiningComplete = batch.operations.every(op => op.state === 'COMPLETE'); if (patch.dispatchReady && (!machiningComplete || !patch.inspectionComplete || !patch.oilingComplete || !patch.packingComplete)) return alert('All Head/Side COMPLETE + Inspection + Oiling + Packing முடிந்த பிறகே Dispatch Ready செய்யலாம்.');
    const next = { ...batch, ...patch }; patch.status = C.productionBatchStatus(next); patch.finalUpdatedBy = state.user.uid; patch.updatedAt = firebase.database.ServerValue.TIMESTAMP;
    try { await state.db.ref(`cncManager/productionBatches/${id}`).update(patch); await audit('BATCH_FINAL_STAGE', { batchId: id, status: patch.status }); setStatus($('globalStatus'), `${id}: ${patch.status}`, 'ok'); }
    catch (error) { setStatus($('globalStatus'), error.message, 'error'); }
  }

  function renderProduction() {
    refreshProductionSelects(); renderCompanies(); renderDrawings(); renderJobMasters(); renderEstimates(); renderBatches(); updateJobOperationRows();
  }

  function renderSelects() {
    const currentStock = $('stockSku').value;
    const inserts = values(state.inserts).sort((a, b) => String(a.sku).localeCompare(String(b.sku)));
    $('stockSku').innerHTML = '<option value="">Select full SKU</option>' + inserts.map(row => `<option value="${C.escapeHtml(row.sku)}">${C.escapeHtml(row.sku)} — ${C.escapeHtml(row.name)}</option>`).join('');
    if ([...$('stockSku').options].some(option => option.value === currentStock)) $('stockSku').value = currentStock;
  }

  function renderInventory() {
    const rows = values(state.inserts).sort((a, b) => String(a.sku).localeCompare(String(b.sku)));
    $('inventoryRows').innerHTML = rows.map(row => {
      const available = C.availableStock(state.inventory, state.ledger, row.sku);
      const low = available <= C.number(row.reorderLevel);
      return `<tr>
        <td data-label="Full SKU"><b>${C.escapeHtml(row.sku)}</b></td><td data-label="Name">${C.escapeHtml(row.name)}</td>
        <td data-label="Mode">${C.escapeHtml(row.issueMode)}</td><td data-label="Expected / edge">${C.number(row.expectedPartsPerEdge)}</td><td data-label="Rack">${C.escapeHtml(row.rackId)} / ${C.escapeHtml(row.channelId)}</td>
        <td data-label="Available" class="${low ? 'badtxt' : ''}"><b>${available}</b></td><td data-label="Reorder">${C.number(row.reorderLevel)}</td>
        <td data-label="Value">${C.money(available * C.number(row.unitValue))}</td><td data-label="Status">${badge(row.active ? 'ACTIVE' : 'INACTIVE')}</td>
        <td data-label="Action"><button class="edit-insert" data-sku="${C.escapeHtml(row.sku)}">Edit</button></td></tr>`;
    }).join('') || emptyRow(10, 'No insert SKU configured.');
    document.querySelectorAll('.edit-insert').forEach(button => button.addEventListener('click', () => editInsert(button.dataset.sku)));
    renderSelects();
  }

  function editInsert(sku) {
    const row = insertFor(sku); if (!row) return;
    $('editingSku').value = row.sku; $('insertSku').value = row.sku; $('insertSku').readOnly = true;
    $('insertName').value = row.name || ''; $('insertBrand').value = row.brand || ''; $('insertGrade').value = row.grade || '';
    $('insertRack').value = row.rackId || ''; $('insertChannel').value = row.channelId || ''; $('insertMode').value = row.issueMode || 'ONE_PIECE';
    $('insertPackSize').value = row.packSize || 1; $('insertEdges').value = row.edgesPerInsert || 1; $('insertExpectedEdge').value = C.number(row.expectedPartsPerEdge); $('insertValue').value = C.number(row.unitValue);
    $('insertReorder').value = C.number(row.reorderLevel); $('insertActive').value = String(row.active !== false);
    $('insertForm').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function resetInsertForm() {
    $('insertForm').reset(); $('editingSku').value = ''; $('insertSku').readOnly = false;
    $('insertMode').value = 'ONE_PIECE'; $('insertPackSize').value = '1'; $('insertEdges').value = '1'; $('insertExpectedEdge').value = '0'; $('insertValue').value = '0'; $('insertReorder').value = '0'; $('insertActive').value = 'true';
    $('insertFormStatus').className = 'notice hidden';
  }

  async function saveInsert(event) {
    event.preventDefault();
    const checked = C.validateInsert({
      sku: $('insertSku').value, name: $('insertName').value, brand: $('insertBrand').value, grade: $('insertGrade').value,
      rackId: $('insertRack').value, channelId: $('insertChannel').value, issueMode: $('insertMode').value,
      packSize: $('insertPackSize').value, edgesPerInsert: $('insertEdges').value, expectedPartsPerEdge: $('insertExpectedEdge').value, unitValue: $('insertValue').value,
      reorderLevel: $('insertReorder').value, active: $('insertActive').value === 'true'
    });
    if (!checked.ok) return setStatus($('insertFormStatus'), checked.errors.join(' '), 'error');
    const row = checked.value;
    const duplicate = values(state.inserts).find(item => item.sku !== row.sku && item.active !== false && row.active && item.rackId === row.rackId && item.channelId === row.channelId);
    if (duplicate) return setStatus($('insertFormStatus'), `Rack ${row.rackId} / channel ${row.channelId} is already assigned to ${duplicate.sku}.`, 'error');
    try {
      row.updatedBy = state.user.uid;
      await state.db.ref(`cncManager/publicMaster/inserts/${C.safeKey(row.sku)}`).set(row);
      await audit('INSERT_MASTER_SAVE', { sku: row.sku, active: row.active, rackId: row.rackId, channelId: row.channelId });
      resetInsertForm();
      setStatus($('globalStatus'), `${row.sku} master saved.`, 'ok');
    } catch (error) { setStatus($('insertFormStatus'), error.message, 'error'); }
  }

  async function submitStock(event) {
    event.preventDefault();
    const sku = $('stockSku').value;
    const type = $('stockType').value;
    const qty = Number($('stockQty').value);
    const date = $('stockDate').value;
    const reason = $('stockReason').value.trim();
    const errors = [];
    if (!insertFor(sku)) errors.push('Full SKU is required.');
    if (!Number.isInteger(qty) || qty === 0) errors.push('Quantity must be a non-zero whole number.');
    if (type === 'RECEIPT' && qty < 1) errors.push('Receipt quantity must be positive.');
    if (!C.validIsoDate(date)) errors.push('Valid effective date is required.');
    else if (date > C.today()) errors.push('Future-dated stock posting is not allowed.');
    if (!reason) errors.push('GRN / reason is required.');
    if (errors.length) return setStatus($('stockFormStatus'), errors.join(' '), 'error');
    const requestId = C.newId('STOCK');
    try {
      await state.db.ref(`cncManager/stockRequests/${C.safeKey(requestId)}`).set({
        requestId, sku, type, delta: qty, effectiveDate: date, reason: reason.slice(0, 200), status: 'PENDING',
        requestedBy: state.user.uid, requestedByEmail: state.user.email || '', requestedAt: firebase.database.ServerValue.TIMESTAMP
      });
      state.lastStockRequestId = C.safeKey(requestId);
      $('stockQty').value = ''; $('stockReason').value = '';
      setStatus($('stockFormStatus'), `Stock request ${requestId} submitted. Backend validation will post it atomically.`, 'ok');
    } catch (error) { setStatus($('stockFormStatus'), error.message, 'error'); }
  }

  function renderStockRequestStatus() {
    const rows = keyedValues(state.stockRequests).sort((a, b) => C.number(b.requestedAt) - C.number(a.requestedAt));
    const row = (state.lastStockRequestId && state.stockRequests[state.lastStockRequestId]) || rows[0]; if (!row) return;
    const message = `Stock request ${row.requestId || row._key}: ${row.status}${row.error ? ` — ${row.error}` : ''}`;
    setStatus($('stockFormStatus'), message, row.status === 'POSTED' ? 'ok' : /PENDING|PROCESSING/.test(row.status) ? 'warn' : 'error');
  }

  function compactMoney(value) {
    const amount = Math.max(0, C.number(value));
    if (amount >= 10000000) return `₹${(amount / 10000000).toFixed(amount >= 100000000 ? 0 : 1)}Cr`;
    if (amount >= 100000) return `₹${(amount / 100000).toFixed(amount >= 1000000 ? 0 : 1)}L`;
    if (amount >= 1000) return `₹${(amount / 1000).toFixed(amount >= 10000 ? 0 : 1)}K`;
    return C.money(amount);
  }

  function percentageLabel(value) { return `${C.number(value).toFixed(1)}%`; }

  function turnoverChartSvg(rows) {
    if (!rows.length) return '<div class="empty">Turnover data இல்லை.</div>';
    const width = Math.max(700, rows.length * 82); const height = 320; const left = 64; const right = 24; const top = 32; const bottom = 58; const plotHeight = height - top - bottom; const plotWidth = width - left - right;
    const maximum = Math.max(1, ...rows.flatMap(row => [row.turnover, row.target])); const y = value => top + plotHeight - (Math.max(0, C.number(value)) / maximum * plotHeight); const step = plotWidth / rows.length; const barWidth = Math.min(42, step * 0.56);
    const grid = Array.from({ length: 5 }, (_, index) => { const value = maximum * (4 - index) / 4; const position = top + plotHeight * index / 4; return `<line class="chart-grid-line" x1="${left}" y1="${position}" x2="${width - right}" y2="${position}"></line><text class="chart-axis-label" x="${left - 9}" y="${position + 4}" text-anchor="end">${C.escapeHtml(compactMoney(value))}</text>`; }).join('');
    const columns = rows.map((row, index) => { const x = left + step * index + (step - barWidth) / 2; const topY = y(row.turnover); const barHeight = Math.max(0, top + plotHeight - topY); const growth = row.growthPercent == null ? '' : `${row.growthPercent >= 0 ? '+' : ''}${row.growthPercent.toFixed(1)}%`; return `<g><rect class="turnover-bar ${row.source === 'CONFIRMED' ? 'confirmed' : 'production'}" x="${x}" y="${topY}" width="${barWidth}" height="${barHeight}" rx="6"><title>${C.escapeHtml(`${row.label}: ${C.money(row.turnover)} · ${row.source}`)}</title></rect><text class="chart-value-label" x="${x + barWidth / 2}" y="${Math.max(15, topY - 8)}" text-anchor="middle">${C.escapeHtml(compactMoney(row.turnover))}</text><text class="chart-month-label" x="${x + barWidth / 2}" y="${height - 32}" text-anchor="middle">${C.escapeHtml(row.label)}</text><text class="chart-growth-label ${row.growthPercent != null && row.growthPercent < 0 ? 'down' : ''}" x="${x + barWidth / 2}" y="${height - 13}" text-anchor="middle">${C.escapeHtml(growth)}</text></g>`; }).join('');
    const target = rows.map((row, index) => {
      if (!(row.target > 0)) return '';
      const x = left + step * index + step / 2; const previous = rows[index - 1]; const line = previous?.target > 0 ? `<line class="target-line" x1="${left + step * (index - 1) + step / 2}" y1="${y(previous.target)}" x2="${x}" y2="${y(row.target)}"></line>` : '';
      return `${line}<circle class="target-point" cx="${x}" cy="${y(row.target)}" r="3"><title>${C.escapeHtml(`Target ${C.money(row.target)}`)}</title></circle>`;
    }).join('');
    return `<svg viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" aria-hidden="true" focusable="false">${grid}<line class="chart-axis-line" x1="${left}" y1="${top + plotHeight}" x2="${width - right}" y2="${top + plotHeight}"></line>${columns}${target}</svg>`;
  }

  function renderDashboard() {
    const date = $('dashDate').value || C.today();
    const profile = C.normalizeCompanyProfile(state.settings?.companyProfile || {}); const all = allReports(); const ratedReports = all.map(reportForRateMath); const reports = all.filter(row => row.date === date);
    const metrics = C.dashboardBusinessMetrics({ date, inserts: state.inserts, inventory: state.inventory, ledger: state.ledger, issues: state.issues, reports: ratedReports, operators: state.operators });
    const month = date.slice(0, 7); const turnover = C.monthlyBusinessPerformance(ratedReports, state.settings?.monthlyTurnover || {}, month, 12, profile.monthlyTargetRevenue); const range = Number($('turnoverRange')?.value || 12); const chartRows = turnover.rows.slice(-range);
    $('printDateLabel').textContent = `${profile.companyName || 'Company'} · Report date: ${date}`;
    const profileMeta = [profile.legalName && profile.legalName !== profile.companyName ? profile.legalName : '', profile.gstin ? `GSTIN ${profile.gstin}` : '', profile.establishedDate ? `Started ${profile.establishedDate}` : '', profile.contactPerson || '', profile.phone || '', profile.email || ''].filter(Boolean);
    $('companyProfileSummary').innerHTML = profile.companyName ? `<div><small>COMPANY PROFILE</small><h2>${C.escapeHtml(profile.companyName)}</h2><p>${C.escapeHtml(profileMeta.join(' · ') || 'Profile contact details can be added below.')}</p></div><div><small>DEFAULT MONTHLY TARGET</small><strong>${C.money(profile.monthlyTargetRevenue)}</strong></div>` : '<div><small>COMPANY PROFILE</small><h2>Company profile இன்னும் அமைக்கப்படவில்லை</h2><p>கீழே உள்ள form-ல் company name மற்றும் விவரங்களைச் சேர்க்கவும்.</p></div>';
    const shiftA = metrics.shiftPerformance.A; const shiftB = metrics.shiftPerformance.B; const currentTurnover = turnover.current?.turnover || 0;
    $('dashboardKpis').innerHTML = [
      ['Total Insert', Math.round(metrics.totalInsertQuantity).toLocaleString('en-IN'), 'stock'], ['Insert Stock Value', C.money(metrics.totalInsertValue), 'stock-value'], ['Used Insert', Math.round(metrics.usedInsertQuantity).toLocaleString('en-IN'), 'used'], ['Used Insert Value', C.money(metrics.usedInsertValue), 'used-value'],
      ['Total Revenue', C.money(metrics.totalRevenue), 'revenue'], ['Selected-date Revenue', C.money(metrics.production.revenue), 'daily-revenue'], ['Selected Month Turnover', C.money(currentTurnover), 'turnover'], ['Active Operators', metrics.activeOperatorCount, 'operator'], ['Shift A Performance', percentageLabel(shiftA.percentage), 'shift-a'], ['Shift B Performance', percentageLabel(shiftB.percentage), 'shift-b']
    ].map(([label, value, tone]) => `<div class="card kpi priority-kpi ${tone}"><small>${label}</small><strong>${value}</strong></div>`).join('');
    const growth = turnover.currentGrowthPercent; const growthText = growth == null ? 'Previous month data தேவை' : `${growth >= 0 ? '+' : ''}${growth.toFixed(1)}%`;
    $('turnoverSummary').innerHTML = `<span>Current: <b>${C.money(currentTurnover)}</b></span><span>Growth: <b class="${growth != null && growth < 0 ? 'badtxt' : 'goodtxt'}">${C.escapeHtml(growthText)}</b></span><span>6M total: <b>${C.money(turnover.sixMonthTotal)}</b></span><span>12M total: <b>${C.money(turnover.periodTotal)}</b></span><span>Source: ${badge(turnover.current?.source || 'PRODUCTION')}</span>`;
    $('turnoverChart').innerHTML = turnoverChartSvg(chartRows);
    $('shiftPerformance').innerHTML = [shiftA, shiftB].map(row => `<div class="shift-performance-row"><div class="shift-performance-heading"><b>Shift ${row.shift}</b><span>${percentageLabel(row.percentage)}</span></div><div class="performance-track"><i style="width:${Math.min(100, Math.max(0, row.percentage))}%"></i></div><small>Target ${row.target.toFixed(1)} · Actual ${row.actual} · ${row.activeOperators} active operator(s) · ${row.reports} report(s)</small></div>`).join('');
    $('operatorPerformanceRows').innerHTML = metrics.operatorPerformance.map(row => `<tr><td>${C.escapeHtml(row.name || '—')}</td><td><b>${C.escapeHtml(row.code)}</b></td><td>${C.escapeHtml(row.shift || '—')}</td><td>${row.target.toFixed(1)}</td><td>${row.actual}</td><td><b class="${row.percentage >= 100 ? 'goodtxt' : row.percentage > 0 ? '' : 'muted'}">${percentageLabel(row.percentage)}</b></td><td>${row.insertQuantity}</td><td>${C.money(row.insertValue)}</td></tr>`).join('') || emptyRow(8, 'Active operator/report data இல்லை.');
    $('turnoverRows').innerHTML = turnover.rows.slice().reverse().map(row => `<tr><td><b>${C.escapeHtml(row.label)}</b></td><td>${C.money(row.productionRevenue)}</td><td>${row.confirmedTurnover == null ? '—' : C.money(row.confirmedTurnover)}</td><td>${row.target > 0 ? C.money(row.target) : '—'}</td><td class="${row.growthPercent != null && row.growthPercent < 0 ? 'badtxt' : 'goodtxt'}">${row.growthPercent == null ? '—' : `${row.growthPercent >= 0 ? '+' : ''}${row.growthPercent.toFixed(1)}%`}</td><td>${badge(row.source)}</td><td><button class="edit-turnover" data-month="${row.month}">Edit</button></td></tr>`).join('');
    document.querySelectorAll('.edit-turnover').forEach(button => button.addEventListener('click', () => editMonthlyTurnover(button.dataset.month)));
    const issues = values(state.issues);
    const pending = values(state.approvals).filter(row => row.status === 'PENDING').length;
    $('dashboardSecondaryKpis').innerHTML = [
      ['Reports', metrics.reportCount, ''], ['Good parts', metrics.production.good, 'good'], ['Worst-case margin', C.money(metrics.production.revenue - metrics.production.costMax), metrics.production.revenue - metrics.production.costMax < 0 ? 'bad' : 'good'], ['Profit jobs', metrics.production.profitableJobs, 'good'], ['Borderline jobs', metrics.production.borderlineJobs, metrics.production.borderlineJobs ? 'warn' : ''], ['Not suitable jobs', metrics.production.notSuitableJobs, metrics.production.notSuitableJobs ? 'bad' : 'good'], ['Rate incomplete', metrics.production.rateIncompleteJobs, metrics.production.rateIncompleteJobs ? 'warn' : 'good'], ['Pending approvals', pending, pending ? 'warn' : 'good']
    ].map(([label, value, kind]) => `<div class="card kpi ${kind}"><small>${label}</small><strong>${value}</strong></div>`).join('');

    $('dashStockRows').innerHTML = values(state.inserts).sort((a, b) => String(a.sku).localeCompare(String(b.sku))).map(insert => {
      const stock = C.availableStock(state.inventory, state.ledger, insert.sku, date);
      return `<tr><td><b>${C.escapeHtml(insert.sku)}</b></td><td>${C.escapeHtml(insert.rackId)} / ${C.escapeHtml(insert.channelId)}</td><td>${stock}</td><td>${C.money(stock * C.number(insert.unitValue))}</td><td>${badge(stock <= C.number(insert.reorderLevel) ? 'REORDER' : 'OK')}</td></tr>`;
    }).join('') || emptyRow(5, 'No insert data.');

    $('dashIssueRows').innerHTML = issues.filter(row => row.status === 'OPEN').sort((a, b) => C.number(b.issuedAt) - C.number(a.issuedAt)).slice(0, 20).map(row => {
      const user = userFor(row.ownerUid); return `<tr><td>${C.escapeHtml(user.displayName || row.operatorCode || row.ownerUid)}</td><td>${C.escapeHtml(row.machine)}</td><td>${C.escapeHtml(row.sku)}</td><td>${badge(row.status)}</td><td>${stamp(row.issuedAt)}</td></tr>`;
    }).join('') || emptyRow(5, 'No open issues.');
    $('dashReportRows').innerHTML = reportTableRows(reports, true);
  }

  function reportTableRows(reports, compact = false) {
    return reports.sort((a, b) => String(b.date).localeCompare(String(a.date))).map(report => {
      const totals = C.reportTotals(reportForRateMath(report)); const percent = totals.target > 0 ? totals.actual / totals.target * 100 : 0;
      const operator = operatorFor(report.operatorCode);
      const normalizedJobs = C.asArray(report.jobs).map(C.normalizeJob); const reportMachines = [...new Set(normalizedJobs.map(job => job.workMachine).filter(Boolean))]; const rateContext = hasRateSnapshot(report) ? undefined : (state.settings?.machineRates || {}); const jobs = normalizedJobs.map(job => { const cycle = job.parts.map(part => { const performance = C.cyclePerformance(part.estimatedCycleMinutes, part.cycleMinutes); return performance.status === 'NOT RECORDED' ? `S${part.number}: cycle target missing` : `S${part.number}: Target ${performance.estimatedCycleMinutes.toFixed(3)} / Actual ${performance.actualCycleMinutes.toFixed(3)} min · ${performance.variancePercent >= 0 ? '+' : ''}${performance.variancePercent.toFixed(1)}% · ${performance.status}`; }).join(' | '); return `${job.name || ''} · Work machine ${job.workMachine || '—'} · ${C.format12HourTime(job.inTime, job.inPeriod)}–${C.format12HourTime(job.outTime, job.outPeriod)}\n${C.jobPartSummary(job, rateContext)}\n${cycle}\nInsert: ${job.insertUsed ? job.insertUsages.map(row => `${row.sku}${row.insertName ? ` (${row.insertName})` : ''}`).join(', ') : 'NOT USED'} · ${C.jobSideSummary(job)} · ${job.status || C.jobProcessStatus(job)}`; }).join('\n');
      const rateDetails = normalizedJobs.map(job => { const rate = jobRateFor(job, report); return `Job ${job.number}: Quote ${C.money(rate.sideRate)} · Cost ${C.money(rate.estimatedCostMin)}–${C.money(rate.estimatedCostMax)} · Profit ${C.money(rate.estimatedProfitMin)}–${C.money(rate.estimatedProfitMax)} · ${rate.rateStatus}`; }).join('\n') + `\nToday: Quote ${C.money(totals.todayRevenue)} · Cost ${C.money(totals.todayCostMin)}–${C.money(totals.todayCostMax)} · Margin ${C.money(totals.estimatedMarginMin)}–${C.money(totals.estimatedMarginMax)}`;
      const captures = normalizedJobs.flatMap(job => job.parts.filter(part => part.screenCapture?.storagePath).map(part => ({ job: job.number, part: part.number, path: part.screenCapture.storagePath })));
      const captureButtons = compact ? '' : captures.map(row => `<button class="view-job-screen" data-path="${C.escapeHtml(row.path)}">Screen J${row.job}/P${row.part}</button>`).join(' ');
      const common = `<td>${C.escapeHtml(report.date)}</td><td>${C.escapeHtml(operator?.name || report.operatorName || report.operatorCode)}</td><td>${C.escapeHtml(report.shift)}</td><td>${C.escapeHtml(reportMachines.join(' + ') || report.machine)}<br><small>${reportMachines.length}/${C.MAX_OPERATOR_MACHINES} machines</small></td><td class="wrap preline">${C.escapeHtml(jobs)}${captureButtons ? `<div class="actions no-print">${captureButtons}</div>` : ''}</td><td class="wrap preline">${C.escapeHtml(rateDetails)}</td>`;
      if (compact) return `<tr>${common}<td>${durationLabel(totals.presenceMinutes)} / ${durationLabel(totals.breakMinutes)} / ${durationLabel(totals.netActiveMinutes)}</td><td>${totals.target.toFixed(1)}</td><td>${totals.actual}</td><td>${totals.good} / ${totals.rejected}</td><td>${percent.toFixed(1)}%</td></tr>`;
      return `<tr>${common}<td>${durationLabel(totals.presenceMinutes)}</td><td>${durationLabel(totals.breakMinutes)}</td><td>${durationLabel(totals.netActiveMinutes)}</td><td>${durationLabel(totals.machineActiveMinutes)}</td><td>${totals.target.toFixed(1)}</td><td>${totals.actual}</td><td>${totals.good}</td><td>${totals.rejected}</td><td>${totals.coolantCount}</td><td>${totals.oilCount}</td><td>${C.money(totals.dailySalary)} / ${totals.labourCostPerGood == null ? '—' : C.money(totals.labourCostPerGood)}</td><td>${stamp(report.updatedAt || report.submittedAt)} ${report.lastUpdateLate ? badge('LATE') : ''}</td></tr>`;
    }).join('') || emptyRow(compact ? 11 : 18, 'No reports for this date range.');
  }

  function renderReports() {
    const from = $('reportFrom').value || '0000-01-01'; const to = $('reportTo').value || '9999-12-31';
    $('reportRows').innerHTML = reportTableRows(allReports().filter(row => row.date >= from && row.date <= to));
    $('reportRequestRows').innerHTML = allReportRequests().filter(row => row.status !== 'PROCESSED').sort((a, b) => C.number(b.requestedAt) - C.number(a.requestedAt)).slice(0, 100).map(row => { const user = userFor(row.ownerUid); return `<tr><td>${stamp(row.requestedAt)}</td><td>${C.escapeHtml(row.date || row._dateKey)}</td><td>${C.escapeHtml(user.displayName || row.operatorName || row.operatorCode)}</td><td>${badge(row.status)}</td><td class="wrap">${C.escapeHtml(row.error || (row.submittedLate ? 'Late submission' : '—'))}</td></tr>`; }).join('') || emptyRow(5, 'No pending or rejected report requests.');
    const edgeRows = C.edgePerformanceRecords(state.issues, state.inserts).filter(row => { const date = row.createdAt ? C.today(new Date(row.createdAt)) : ''; return date >= from && date <= to; }).sort((a, b) => C.number(b.createdAt) - C.number(a.createdAt));
    const edgeSummary = C.edgePerformanceSummary(edgeRows).sort((a, b) => a.quality === b.quality ? String(a.sku).localeCompare(String(b.sku)) : a.quality === 'POOR' ? -1 : 1);
    $('edgeSummaryRows').innerHTML = edgeSummary.map(row => `<tr><td><b>${C.escapeHtml(row.sku)}</b><br>${C.escapeHtml([row.brand, row.grade].filter(Boolean).join(' / ') || row.insertName)}</td><td>${C.escapeHtml(`${row.machine} · ${row.job} · ${row.partNo}`)}</td><td>${row.samples} / ${row.edges}</td><td><b>${row.averageGoodPerEdge.toFixed(1)}</b></td><td>${row.expectedPartsPerEdge || 'Not set'}</td><td>${row.goodSamples} / ${row.poorSamples} (${row.goodRate.toFixed(1)}% GOOD)</td><td>${badge(row.quality)} · ${C.escapeHtml(row.purchaseAction)}</td></tr>`).join('') || emptyRow(7, 'No edge samples in this date range.');
    $('edgePerformanceRows').innerHTML = edgeRows.map(row => `<tr><td>${stamp(row.createdAt)}</td><td><b>${C.escapeHtml(row.sku)}</b><br>${C.escapeHtml([row.brand, row.grade].filter(Boolean).join(' / ') || row.insertName)}</td><td>${C.escapeHtml(`${row.machine} · ${row.job} · ${row.partNo}`)}</td><td>${row.edgeFrom === row.edgeTo ? row.edgeFrom : `${row.edgeFrom}–${row.edgeTo}`}</td><td><b>${row.goodParts}</b> (${row.goodPerEdge.toFixed(1)}/edge)</td><td>${row.rejectedParts}</td><td>${row.cuttingMinutes.toFixed(1)}</td><td>${row.expectedPartsPerEdge || 'Not set'}</td><td>${badge(row.quality)}</td></tr>`).join('') || emptyRow(9, 'No per-edge insert entries in this date range.');
    document.querySelectorAll('.view-job-screen').forEach(button => button.addEventListener('click', () => viewJobScreen(button.dataset.path)));
  }

  async function viewJobScreen(storagePath) {
    const popup = window.open('', '_blank');
    try { const url = await state.storage.ref(storagePath).getDownloadURL(); if (popup) popup.location.href = url; else location.href = url; }
    catch (error) { popup?.close(); setStatus($('globalStatus'), `Screen photo open failed: ${error.message}`, 'error'); }
  }

  function renderControl() {
    const pending = keyedValues(state.approvals).filter(row => row.status === 'PENDING').sort((a, b) => C.number(a.requestedAt) - C.number(b.requestedAt));
    $('approvalRows').innerHTML = pending.map(row => {
      const issue = state.issues[row.issueId] || {}; const user = userFor(row.ownerUid); const firstSetup = row.approvalType === 'ISSUE_FIRST_SETUP'; const req = firstSetup ? (row.issueRequest || {}) : (row.returnRequest || {});
      return `<tr><td>${stamp(row.requestedAt)}</td><td>${C.escapeHtml(user.displayName || issue.operatorCode || row.ownerUid)}</td><td>${C.escapeHtml(issue.machine || req.machine)}</td><td>${C.escapeHtml(issue.sku || req.sku)}</td><td>${C.escapeHtml(firstSetup ? 'NEW ISSUE' : req.action)}</td><td class="wrap"><b>${C.escapeHtml(req.exceptionCode)}</b><br>${C.escapeHtml(req.exceptionNote)}</td><td>${firstSetup ? `${C.number(req.quantity)} requested` : `${C.number(req.goodParts)} good / ${C.number(req.cuttingMinutes)} min`}</td><td><button class="good approve" data-id="${row._key}">Approve</button> <button class="danger reject" data-id="${row._key}">Reject</button></td></tr>`;
    }).join('') || emptyRow(8, 'No pending exceptions.');
    document.querySelectorAll('.approve').forEach(button => button.addEventListener('click', () => decideApproval(button.dataset.id, 'APPROVED')));
    document.querySelectorAll('.reject').forEach(button => button.addEventListener('click', () => decideApproval(button.dataset.id, 'REJECTED')));

    const waitingReturns = allReturnRequests().filter(row => row.status === 'AWAITING_RETURN_VERIFICATION').sort((a, b) => C.number(a.requestedAt) - C.number(b.requestedAt));
    $('returnVerificationRows').innerHTML = waitingReturns.map(row => {
      const issue = state.issues[row.issueId] || {}; const user = userFor(row.ownerUid);
      return `<tr><td>${stamp(row.requestedAt)}</td><td>${C.escapeHtml(user.displayName || row.operatorCode)}</td><td>${C.escapeHtml(issue.machine)}</td><td>${C.escapeHtml(issue.sku)}</td><td>${C.escapeHtml(row.action)}</td><td>${row.physicalReturnConfirmed ? badge('DEPOSIT CLAIMED') : badge('NOT CLAIMED')}</td><td><button class="good verify-return" data-uid="${row.ownerUid}" data-key="${row._key}" data-issue="${row.issueId}">Physically verify</button></td></tr>`;
    }).join('') || emptyRow(7, 'No returns waiting for chute verification.');
    document.querySelectorAll('.verify-return').forEach(button => button.addEventListener('click', () => verifyPhysicalReturn(button.dataset.uid, button.dataset.key, button.dataset.issue)));

    const issues = values(state.issues);
    $('openIssueRows').innerHTML = issues.filter(row => row.status === 'OPEN').sort((a, b) => C.number(b.issuedAt) - C.number(a.issuedAt)).map(row => {
      const user = userFor(row.ownerUid); const metrics = C.lifeMetrics({ ...(row.metrics || {}), quantity: row.quantity, unitValue: row.unitValue });
      return `<tr><td>${stamp(row.issuedAt)}</td><td>${C.escapeHtml(user.displayName || row.operatorCode)}</td><td>${C.escapeHtml(row.machine)}</td><td>${C.escapeHtml(row.sku)}</td><td>${C.number(row.quantity)}</td><td class="wrap">${C.escapeHtml(row.job)} / ${C.escapeHtml(row.partNo)}</td><td>${badge(row.dispenseStatus || 'QUEUED')}</td><td>${metrics.goodPartsPerEdge.toFixed(1)} good/edge</td></tr>`;
    }).join('') || emptyRow(8, 'No open issues.');

    $('queueRows').innerHTML = keyedValues(state.queue).sort((a, b) => C.number(b.createdAt) - C.number(a.createdAt)).slice(0, 50).map(row => `<tr><td>${stamp(row.createdAt)}</td><td>${C.escapeHtml(row.queueId || row._key)}</td><td>${C.escapeHtml(row.rackId)} / ${C.escapeHtml(row.channelId)}</td><td>${C.escapeHtml(row.sku)}</td><td>${C.number(row.quantity)}</td><td>${badge(row.status)}</td><td>${row.status === 'QUEUED' ? `<button class="good queue-action" data-id="${row._key}" data-status="DISPENSED">Mark dispensed</button> <button class="danger queue-action" data-id="${row._key}" data-status="FAILED">Fault</button>` : '—'}</td></tr>`).join('') || emptyRow(7, 'Queue empty.');
    document.querySelectorAll('.queue-action').forEach(button => button.addEventListener('click', () => updateQueue(button.dataset.id, button.dataset.status)));

    $('lifeRows').innerHTML = issues.filter(row => row.status === 'CLOSED').sort((a, b) => C.number(b.closedAt) - C.number(a.closedAt)).slice(0, 50).map(row => {
      const user = userFor(row.ownerUid); const m = row.lifeMetrics || C.lifeMetrics({ ...(row.metrics || {}), quantity: row.quantity, consumedQuantity: row.consumedQuantity, unitValue: row.unitValue });
      return `<tr><td>${stamp(row.closedAt)}</td><td>${C.escapeHtml(row.sku)}</td><td>${C.escapeHtml(user.displayName || row.operatorCode)}</td><td>${C.escapeHtml(row.returnAction)}</td><td>${C.number(m.goodPartsPerEdge).toFixed(1)}</td><td>${C.number(m.cuttingMinutesPerEdge).toFixed(1)}</td><td>${C.number(m.totalPartsPerInsert).toFixed(1)}</td><td>${m.costPerGoodComponent == null ? '—' : C.money(m.costPerGoodComponent)}</td></tr>`;
    }).join('') || emptyRow(8, 'No closed insert life records.');
  }

  async function decideApproval(id, status) {
    const reason = status === 'REJECTED' ? prompt('Rejection reason (required):') : 'Supervisor verified';
    if (status === 'REJECTED' && !String(reason || '').trim()) return;
    if (!confirm(`${status} this exception request?`)) return;
    await state.db.ref(`cncManager/approvals/${id}`).update({ status, supervisorUid: state.user.uid, supervisorEmail: state.user.email || '', decisionNote: String(reason || '').slice(0, 300), decidedAt: firebase.database.ServerValue.TIMESTAMP });
    await audit('SUPERVISOR_DECISION', { approvalId: id, status });
  }

  async function updateQueue(id, status) {
    if (!confirm(`${status} queue ${id}? Use only after checking the physical rack.`)) return;
    await state.db.ref(`cncManager/dispenseQueue/${id}`).update({ status, deviceId: 'ADMIN-MANUAL', acknowledgedBy: state.user.uid, acknowledgedAt: firebase.database.ServerValue.TIMESTAMP });
    await audit('DISPENSER_MANUAL_STATUS', { queueId: id, status });
  }

  async function verifyPhysicalReturn(uid, returnRequestKey, issueId) {
    if (!confirm('Old insert / scrap is physically present in the return chute. Create a trusted verification event?')) return;
    await state.db.ref(`cncManager/returnSensorEvents/${issueId}/${returnRequestKey}`).set({ verified: true, ownerUid: uid, returnRequestKey, issueId, deviceId: 'ADMIN-MANUAL', verifiedBy: state.user.uid, verifiedAt: firebase.database.ServerValue.TIMESTAMP });
    await audit('MANUAL_RETURN_VERIFICATION', { uid, returnRequestKey, issueId });
  }

  function renderUsers() {
    const pending = keyedValues(state.roleRequests).filter(row => row.status === 'PENDING');
    $('roleRequestRows').innerHTML = pending.map(row => `<tr><td><b>${C.escapeHtml(row.displayName)}</b><br>${C.escapeHtml(row.email)}</td><td>${stamp(row.requestedAt)}</td><td><input class="approval-code" data-id="${row._key}" maxlength="30" placeholder="OP-001"></td><td><select class="approval-shift" data-id="${row._key}"><option>A</option><option>B</option></select></td><td><input class="approval-salary" data-id="${row._key}" type="number" min="0" step="0.01" value="0"></td><td><button class="good user-approve" data-id="${row._key}">Approve operator</button> <button class="danger user-reject" data-id="${row._key}">Reject</button></td></tr>`).join('') || emptyRow(6, 'No pending account requests.');
    document.querySelectorAll('.user-approve').forEach(button => button.addEventListener('click', () => approveUser(button.dataset.id)));
    document.querySelectorAll('.user-reject').forEach(button => button.addEventListener('click', () => rejectUser(button.dataset.id)));
    $('userRows').innerHTML = keyedValues(state.users).sort((a, b) => String(a.displayName).localeCompare(String(b.displayName))).map(row => { const load = row.role === 'operator' ? C.operatorMachineLoad(state.batches, row._key) : null; const machineText = load ? `<br><small>${C.escapeHtml(load.machineCodes.join(' + ') || 'No active machine')} · ${load.machineCount}/${C.MAX_OPERATOR_MACHINES}</small>` : ''; return `<tr><td>${C.escapeHtml(row.displayName)}</td><td>${C.escapeHtml(row.email)}</td><td>${C.escapeHtml(row.role)}</td><td>${C.escapeHtml(row.operatorCode || '—')}${machineText}</td><td>${C.escapeHtml(row.shift || '—')}</td><td>${row.role === 'operator' ? C.money(row.dailySalary) : '—'}</td><td>${badge(row.active ? 'ACTIVE' : 'INACTIVE')}</td><td>${row.role === 'operator' ? `<button class="edit-user" data-id="${row._key}">Edit shift / salary</button> ` : ''}${row._key === state.user.uid ? 'Current user' : `<button class="${row.active ? 'danger' : 'good'} user-toggle" data-id="${row._key}" data-active="${!row.active}">${row.active ? 'Deactivate' : 'Activate'}</button>`}</td></tr>`; }).join('') || emptyRow(8, 'No users.');
    document.querySelectorAll('.edit-user').forEach(button => button.addEventListener('click', () => editUser(button.dataset.id)));
    document.querySelectorAll('.user-toggle').forEach(button => button.addEventListener('click', () => toggleUser(button.dataset.id, button.dataset.active === 'true')));
  }

  async function approveUser(uid) {
    const request = state.roleRequests[uid]; if (!request) return;
    const codeInput = document.querySelector(`.approval-code[data-id="${CSS.escape(uid)}"]`);
    const shiftInput = document.querySelector(`.approval-shift[data-id="${CSS.escape(uid)}"]`);
    const salaryInput = document.querySelector(`.approval-salary[data-id="${CSS.escape(uid)}"]`);
    const operatorCode = String(codeInput?.value || '').trim().toUpperCase(); const shift = shiftInput?.value || 'A'; const dailySalary = Number(salaryInput?.value);
    if (!/^[A-Z0-9_-]{2,30}$/.test(operatorCode)) return alert('Operator code: 2–30 letters/numbers/_/-.');
    if (!Number.isFinite(dailySalary) || dailySalary < 0) return alert('Daily salary must be zero or higher.');
    const collision = values(state.operators).find(row => row.code === operatorCode && row.uid !== uid);
    if (collision) return alert(`Operator code ${operatorCode} is already assigned.`);
    if (!confirm(`Approve ${request.email} as operator ${operatorCode}?`)) return;
    const operator = { code: operatorCode, name: request.displayName || request.email, shift, dailySalary, uid, active: true, updatedAt: firebase.database.ServerValue.TIMESTAMP };
    const user = { uid, email: request.email || '', displayName: request.displayName || request.email, role: 'operator', operatorCode, shift, dailySalary, active: true, approvedBy: state.user.uid, approvedAt: firebase.database.ServerValue.TIMESTAMP };
    const updates = {};
    updates[`cncManager/users/${uid}`] = user;
    updates[`cncManager/publicMaster/operators/${C.safeKey(operatorCode)}`] = operator;
    updates[`cncManager/roleRequests/${uid}/status`] = 'APPROVED';
    updates[`cncManager/roleRequests/${uid}/decidedAt`] = firebase.database.ServerValue.TIMESTAMP;
    updates[`cncManager/roleRequests/${uid}/decidedBy`] = state.user.uid;
    await state.db.ref().update(updates); await audit('USER_APPROVED', { uid, operatorCode });
  }

  async function editUser(uid) {
    const user = state.users[uid]; if (!user || user.role !== 'operator') return;
    const shift = String(prompt('Shift A or B:', user.shift || 'A') || '').trim().toUpperCase(); if (!['A', 'B'].includes(shift)) return alert('Shift must be A or B.');
    const salaryText = prompt('Employee daily salary ₹:', String(C.number(user.dailySalary))); if (salaryText == null) return;
    const dailySalary = Number(salaryText); if (!Number.isFinite(dailySalary) || dailySalary < 0) return alert('Daily salary must be zero or higher.');
    if (!confirm(`Update ${user.displayName} to Shift ${shift}, daily salary ${C.money(dailySalary)}?`)) return;
    const updates = {}; updates[`cncManager/users/${uid}/shift`] = shift; updates[`cncManager/users/${uid}/dailySalary`] = dailySalary; updates[`cncManager/users/${uid}/updatedAt`] = firebase.database.ServerValue.TIMESTAMP;
    if (user.operatorCode) { const key = C.safeKey(user.operatorCode); updates[`cncManager/publicMaster/operators/${key}/shift`] = shift; updates[`cncManager/publicMaster/operators/${key}/dailySalary`] = dailySalary; updates[`cncManager/publicMaster/operators/${key}/updatedAt`] = firebase.database.ServerValue.TIMESTAMP; }
    await state.db.ref().update(updates); await audit('USER_PROFILE_UPDATED', { uid, shift, dailySalary });
  }

  async function rejectUser(uid) {
    const reason = prompt('Rejection reason:'); if (!String(reason || '').trim()) return;
    await state.db.ref(`cncManager/roleRequests/${uid}`).update({ status: 'REJECTED', decisionNote: reason.slice(0, 300), decidedBy: state.user.uid, decidedAt: firebase.database.ServerValue.TIMESTAMP });
    await audit('USER_REJECTED', { uid });
  }

  async function toggleUser(uid, active) {
    if (!confirm(`${active ? 'Activate' : 'Deactivate'} this account?`)) return;
    const updates = {}; updates[`cncManager/users/${uid}/active`] = active;
    const code = state.users[uid]?.operatorCode; if (code) updates[`cncManager/publicMaster/operators/${C.safeKey(code)}/active`] = active;
    await state.db.ref().update(updates); await audit('USER_STATUS', { uid, active });
  }

  function renderNotices() {
    $('noticeRows').innerHTML = keyedValues(state.notices).sort((a, b) => C.number(b.createdAt) - C.number(a.createdAt)).map(row => {
      const url = /^https:\/\//.test(String(row.attachment?.downloadUrl || '')) ? row.attachment.downloadUrl : '';
      const media = url && String(row.attachment?.contentType || '').startsWith('image/') ? `<img class="notice-image" src="${C.escapeHtml(url)}" alt="Notice attachment" loading="lazy">` : url && String(row.attachment?.contentType || '').startsWith('audio/') ? `<audio controls preload="none" src="${C.escapeHtml(url)}"></audio>` : '';
      return `<div class="notice"><b>${stamp(row.createdAt)}</b><p>${C.escapeHtml(row.text)}</p>${media}<button class="danger delete-notice" data-id="${row._key}">Remove</button></div>`;
    }).join('') || '<div class="empty">No notices.</div>';
    document.querySelectorAll('.delete-notice').forEach(button => button.addEventListener('click', async () => {
      if (!confirm('Remove this notice and its uploaded media?')) return;
      const notice = state.notices[button.dataset.id] || {}; if (notice.attachment?.storagePath) await state.storage.ref(notice.attachment.storagePath).delete().catch(error => console.warn('Storage cleanup skipped', error));
      await state.db.ref(`cncManager/publicNotices/${button.dataset.id}`).remove(); await audit('NOTICE_REMOVED', { id: button.dataset.id, storagePath: notice.attachment?.storagePath || '' });
    }));
  }

  function clearNoticeMedia() {
    if (state.voiceRecorder?.state === 'recording') { state.discardVoice = true; state.voiceRecorder.stop(); }
    if (state.voiceTimer) clearTimeout(state.voiceTimer); state.voiceTimer = null;
    state.voiceStream?.getTracks().forEach(track => track.stop()); state.voiceStream = null; state.voiceRecorder = null;
    state.noticeMediaBlob = null; state.noticeMediaName = ''; state.noticeMediaType = ''; $('noticeFile').value = '';
    if (state.noticePreviewUrl) URL.revokeObjectURL(state.noticePreviewUrl); state.noticePreviewUrl = ''; $('noticeMediaPreview').innerHTML = '';
    $('recordVoice').textContent = 'Record voice (max 60 sec)'; setStatus($('noticeMediaStatus'), 'No media selected.', '');
  }

  function previewNoticeMedia(blob, name = '') {
    if (state.noticePreviewUrl) URL.revokeObjectURL(state.noticePreviewUrl); state.noticePreviewUrl = URL.createObjectURL(blob);
    state.noticeMediaBlob = blob; state.noticeMediaName = String(name || 'voice-note.webm').slice(0, 120); state.noticeMediaType = blob.type || 'application/octet-stream';
    $('noticeMediaPreview').innerHTML = state.noticeMediaType.startsWith('image/') ? `<img class="notice-image" src="${state.noticePreviewUrl}" alt="Selected notice preview">` : state.noticeMediaType.startsWith('audio/') ? `<audio controls src="${state.noticePreviewUrl}"></audio>` : '';
    setStatus($('noticeMediaStatus'), `${state.noticeMediaName} — ${(blob.size / 1024 / 1024).toFixed(2)} MB ready.`, 'ok');
  }

  async function toggleVoiceRecording() {
    if (state.voiceRecorder?.state === 'recording') { state.voiceRecorder.stop(); return; }
    if (!navigator.mediaDevices?.getUserMedia || !globalThis.MediaRecorder) return setStatus($('noticeMediaStatus'), 'Voice recording is not supported in this browser.', 'error');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true }); const chunks = [];
      const preferred = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : '';
      const recorder = preferred ? new MediaRecorder(stream, { mimeType: preferred }) : new MediaRecorder(stream);
      state.discardVoice = false; state.voiceStream = stream; state.voiceRecorder = recorder; recorder.addEventListener('dataavailable', event => { if (event.data.size) chunks.push(event.data); });
      recorder.addEventListener('stop', () => { if (state.voiceTimer) clearTimeout(state.voiceTimer); state.voiceTimer = null; stream.getTracks().forEach(track => track.stop()); state.voiceStream = null; state.voiceRecorder = null; $('recordVoice').textContent = 'Record voice (max 60 sec)'; if (state.discardVoice) { state.discardVoice = false; return; } const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' }); if (blob.size) previewNoticeMedia(blob, `voice-${Date.now()}.webm`); });
      recorder.start(); $('recordVoice').textContent = 'Stop recording'; setStatus($('noticeMediaStatus'), 'Recording… it will stop automatically at 60 seconds.', 'warn'); state.voiceTimer = setTimeout(() => { if (recorder.state === 'recording') recorder.stop(); }, 60000);
    } catch (error) { setStatus($('noticeMediaStatus'), `Microphone error: ${error.message}`, 'error'); }
  }

  async function publishNotice(event) {
    event.preventDefault(); const text = $('noticeText').value.trim(); if (!text) return;
    if (state.voiceRecorder?.state === 'recording') return setStatus($('noticeMediaStatus'), 'Stop the voice recording before publishing.', 'error');
    const selected = state.noticeMediaBlob || $('noticeFile').files[0] || null; const id = C.newId('NOTICE'); const key = C.safeKey(id); let attachment = null; let uploadedRef = null; const contentType = String(selected?.type || '').split(';')[0].toLowerCase();
    if (selected && (!/^(image\/(jpeg|png|webp)|audio\/(webm|mpeg|mp4))$/.test(contentType) || selected.size > 10 * 1024 * 1024)) return setStatus($('noticeMediaStatus'), 'Only JPG/PNG/WebP or WebM/MP3/MP4 up to 10 MB is allowed.', 'error');
    const button = $('noticeForm').querySelector('button[type=submit]'); button.disabled = true;
    try {
      if (selected) {
        const originalName = state.noticeMediaName || selected.name || `attachment-${Date.now()}`; const safeName = originalName.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 120); const storagePath = `cncManager/notices/${key}/${safeName}`;
        uploadedRef = state.storage.ref(storagePath); const snapshot = await uploadedRef.put(selected, { contentType, customMetadata: { noticeId: id, uploadedBy: state.user.uid } }); const downloadUrl = await snapshot.ref.getDownloadURL();
        attachment = { storagePath, downloadUrl, contentType, originalName: originalName.slice(0, 120), size: selected.size };
      }
      await state.db.ref(`cncManager/publicNotices/${key}`).set({ id, text: text.slice(0, 1000), attachment, createdBy: state.user.uid, createdAt: firebase.database.ServerValue.TIMESTAMP });
      $('noticeText').value = ''; clearNoticeMedia(); await audit('NOTICE_PUBLISHED', { id, storagePath: attachment?.storagePath || '' });
    } catch (error) { if (uploadedRef) await uploadedRef.delete().catch(() => {}); setStatus($('noticeMediaStatus'), `Publish failed: ${error.message}. Sign out/in once if Storage role claims were just created.`, 'error'); }
    finally { button.disabled = false; }
  }

  function exportReportsCsv() {
    const from = $('reportFrom').value || '0000-01-01'; const to = $('reportTo').value || '9999-12-31';
    const rows = [['Date', 'Operator Code', 'Operator', 'Shift', 'Main Machine', 'Machine Type', 'Daily Salary', 'Presence Minutes', 'Actual Break Minutes', 'Operator Net Active Minutes', 'Machine Run Total Minutes', 'Job No', 'Job', 'Job Work Machine', 'Part Operation', 'Part No', 'Part Machine', 'Part Side', 'Actual Cycle Minutes', 'Target Cycle Minutes', 'Cycle Variance Minutes', 'Cycle Variance %', 'Cycle Status', 'RPM', 'Customer Side Rate ₹/Component', 'Machine Rate Min ₹/Minute', 'Machine Rate Max ₹/Minute', 'Running Cost Min ₹/Component', 'Running Cost Max ₹/Component', 'Profit Min ₹/Component', 'Profit Max ₹/Component', 'Rate Decision', 'Job Total Quote ₹/Component', 'Job Cost Min ₹/Component', 'Job Cost Max ₹/Component', 'Job Decision', 'Today Quoted Value ₹', 'Today Cost Min ₹', 'Today Cost Max ₹', 'Program No', 'Screen OCR', 'In', 'Out', 'Side Routing', 'Job Status', 'Insert Used', 'Linked Insert SKUs', 'Linked Insert Names', 'Job Active Minutes', 'Machine Job Target', 'Actual', 'Good', 'Rejected', 'Coolant Count', 'Oil Count', 'Report Performance %', 'Labour Cost / Good', 'Late Update']];
    allReports().filter(row => row.date >= from && row.date <= to).sort((a, b) => String(a.date).localeCompare(String(b.date))).forEach(report => {
      const totals = C.reportTotals(reportForRateMath(report)); const operator = operatorFor(report.operatorCode); const jobs = C.asArray(report.jobs);
      (jobs.length ? jobs : [{}]).forEach(raw => {
        const job = C.normalizeJob(raw); const parts = job.parts.length ? job.parts : [{}]; const machineCycle = C.jobMachineCycle(job, job.workMachine || report.machine); const jobRate = jobRateFor(job, report); const rateContext = hasRateSnapshot(report) ? undefined : (state.settings?.machineRates || {});
        parts.forEach(part => {
          const partRate = C.partRateAnalysis(part, rateContext);
          rows.push([report.date, report.operatorCode, operator?.name || report.operatorName || '', report.shift, report.machine, report.machineType || '', totals.dailySalary, totals.presenceMinutes, totals.breakMinutes, totals.netActiveMinutes, totals.machineActiveMinutes, jobs.length ? job.number : '', job.name || report.job || '', job.workMachine || '', part.number || '', part.partNo || job.partNo || report.partNo || '', part.machine || report.machine || '', part.side || '', part.cycleMinutes || job.cycleMinutes, part.estimatedCycleMinutes || '', C.number(part.cycleVarianceMinutes).toFixed(3), C.number(part.cycleVariancePercent).toFixed(2), part.cycleStatus || 'NOT RECORDED', part.rpm || '', partRate.sideRate, partRate.machineRateMin, partRate.machineRateMax, partRate.estimatedCostMin.toFixed(2), partRate.estimatedCostMax.toFixed(2), partRate.estimatedProfitMin.toFixed(2), partRate.estimatedProfitMax.toFixed(2), partRate.rateStatus, jobRate.sideRate.toFixed(2), jobRate.estimatedCostMin.toFixed(2), jobRate.estimatedCostMax.toFixed(2), jobRate.rateStatus, jobRate.todayRevenue.toFixed(2), jobRate.todayCostMin.toFixed(2), jobRate.todayCostMax.toFixed(2), part.programNo || '', part.screenCapture?.status || 'NO PHOTO', C.format12HourTime(job.inTime, job.inPeriod), C.format12HourTime(job.outTime, job.outPeriod), jobs.length ? C.jobSideSummary(job) : 'Legacy record', jobs.length ? job.status : 'LEGACY', job.insertUsed ? 'YES' : 'NO', job.insertUsages.map(row => row.sku).join(' | '), job.insertUsages.map(row => row.insertName).filter(Boolean).join(' | '), job.activeMinutes, machineCycle > 0 ? (job.activeMinutes / machineCycle).toFixed(2) : '0', jobs.length ? job.actual : totals.actual, jobs.length ? job.good : totals.good, jobs.length ? job.rejected : totals.rejected, job.coolantCount, job.oilCount, totals.target ? (totals.actual / totals.target * 100).toFixed(2) : '0', totals.labourCostPerGood == null ? '' : totals.labourCostPerGood.toFixed(2), report.lastUpdateLate ? 'YES' : 'NO']);
        });
      });
    });
    download(`cnc-reports-${from}-${to}.csv`, '\uFEFF' + rows.map(row => row.map(C.csvCell).join(',')).join('\n'), 'text/csv;charset=utf-8');
  }

  function exportEdgePerformanceCsv() {
    const from = $('reportFrom').value || '0000-01-01'; const to = $('reportTo').value || '9999-12-31';
    const rows = [['Date', 'Issue ID', 'SKU', 'Insert Name', 'Brand', 'Grade', 'Operator', 'Machine', 'Job', 'Part No', 'Action', 'Edge From', 'Edge To', 'Edges', 'Good Parts', 'Rejected Parts', 'Good Per Edge', 'Cutting Minutes', 'Expected Per Edge', 'Result']];
    C.edgePerformanceRecords(state.issues, state.inserts).filter(row => { const date = row.createdAt ? C.today(new Date(row.createdAt)) : ''; return date >= from && date <= to; }).sort((a, b) => C.number(a.createdAt) - C.number(b.createdAt)).forEach(row => rows.push([row.createdAt ? C.today(new Date(row.createdAt)) : '', row.issueId, row.sku, row.insertName, row.brand, row.grade, row.operatorCode, row.machine, row.job, row.partNo, row.action, row.edgeFrom, row.edgeTo, row.edgesUsed, row.goodParts, row.rejectedParts, row.goodPerEdge.toFixed(2), row.cuttingMinutes, row.expectedPartsPerEdge, row.quality]));
    download(`cnc-edge-performance-${from}-${to}.csv`, '\uFEFF' + rows.map(row => row.map(C.csvCell).join(',')).join('\n'), 'text/csv;charset=utf-8');
  }

  function download(name, content, type) {
    const url = URL.createObjectURL(new Blob([content], { type })); const link = document.createElement('a'); link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function backupObject() {
    const nodes = ['publicMaster', 'inventory', 'publicInventory', 'publicMachineState', 'stockLedger', 'operatorData', 'issues', 'issueRequests', 'returnRequests', 'reportRequests', 'screenOcrRequests', 'approvals', 'dispenseQueue', 'returnSensorEvents', 'stockRequests', 'openIssueSlots', 'machineHistory', 'publicNotices', 'legacyReports', 'settings', 'drawings', 'drawingAnalysisRequests', 'jobEstimates', 'productionBatches', 'batchUpdateRequests', 'productionBatchEvents', 'meta', 'users', 'roleRequests', 'audit'];
    const snapshots = await Promise.all(nodes.map(node => state.db.ref(`cncManager/${node}`).once('value'))); const data = {};
    nodes.forEach((node, index) => { data[node] = snapshots[index].val() || {}; });
    return { format: 'CNC_INSERT_MANAGER_V37', version: C.VERSION, exportedAt: C.nowIso(), exportedBy: state.user.uid, data };
  }

  async function downloadBackup() {
    try { const backup = await backupObject(); download(`cnc-v37-backup-${C.today()}.json`, JSON.stringify(backup, null, 2), 'application/json'); await audit('BACKUP_DOWNLOAD', { exportedAt: backup.exportedAt }); }
    catch (error) { setStatus($('restoreStatus'), `Backup failed: ${error.message}`, 'error'); }
  }

  async function previewRestore() {
    const file = $('restoreFile').files[0]; if (!file) return setStatus($('restoreStatus'), 'Select a JSON backup.', 'error');
    try {
      const parsed = JSON.parse(await file.text());
      if (!['CNC_INSERT_MANAGER_V31', 'CNC_INSERT_MANAGER_V32', 'CNC_INSERT_MANAGER_V33', 'CNC_INSERT_MANAGER_V34', 'CNC_INSERT_MANAGER_V35', 'CNC_INSERT_MANAGER_V36', 'CNC_INSERT_MANAGER_V37'].includes(parsed.format) || !parsed.data || typeof parsed.data !== 'object') throw new Error('Not a V31–V37 backup.');
      state.restorePreview = parsed;
      const d = parsed.data;
      setStatus($('restoreStatus'), `Preview only — ${values(d.publicMaster?.inserts).length} SKUs, ${values(d.publicMaster?.jobs).length} jobs, ${values(d.jobEstimates).length} estimates, ${values(d.productionBatches).length} batches, ${values(d.issues).length} issues, ${Object.values(d.operatorData || {}).reduce((n, x) => n + values(x?.reports).length, 0)} reports. Type RESTORE V37 only after review.`, 'warn');
      if (prompt('Preview complete. To overwrite V37 operational nodes, type RESTORE V37. Cancel to keep data unchanged.') !== 'RESTORE V37') return;
      const allowed = ['publicMaster', 'inventory', 'publicInventory', 'publicMachineState', 'stockLedger', 'operatorData', 'issues', 'openIssueSlots', 'machineHistory', 'publicNotices', 'legacyReports', 'settings', 'drawings', 'drawingAnalysisRequests', 'jobEstimates', 'productionBatches', 'productionBatchEvents', 'meta'];
      const updates = {}; allowed.forEach(key => { if (Object.prototype.hasOwnProperty.call(d, key)) updates[`cncManager/${key}`] = d[key]; });
      await state.db.ref().update(updates); await audit('BACKUP_RESTORE', { exportedAt: parsed.exportedAt || '', nodes: Object.keys(updates) });
      const sourceVersion = parsed.format.slice(-3);
      setStatus($('restoreStatus'), `${sourceVersion} backup restored into V37. User roles were intentionally not overwritten.`, 'ok');
    } catch (error) { setStatus($('restoreStatus'), error.message, 'error'); }
  }

  async function previewLegacy() {
    try {
      const [snapshot, reportsSnapshot, submissionsSnapshot] = await Promise.all([state.db.ref('cncManager/db').once('value'), state.db.ref('cncManager/operatorReports').once('value'), state.db.ref('cncManager/operatorSubmissions').once('value')]);
      if (!snapshot.exists() && !reportsSnapshot.exists() && !submissionsSnapshot.exists()) { state.legacyPreview = null; $('runMigration').disabled = true; return setStatus($('migrationStatus'), 'No legacy V30 data found.', 'warn'); }
      const legacy = snapshot.val() || {}; const merged = new Map();
      [C.asArray(legacy.entries), C.asArray(reportsSnapshot.val()), C.asArray(submissionsSnapshot.val())].flat().forEach((entry, index) => { if (!entry || typeof entry !== 'object') return; const identity = String(entry.sourceId || entry.id || `LEGACY-${index}`); merged.set(identity, { ...(merged.get(identity) || {}), ...entry }); });
      legacy.entries = [...merged.values()]; state.legacyPreview = legacy;
      const summary = `${C.asArray(legacy.operators).length} operators, ${C.asArray(legacy.inserts).length} inserts, ${C.asArray(legacy.stockIn).length} stock receipts, ${C.asArray(legacy.entries).length} reports`;
      $('runMigration').disabled = Boolean(state.meta?.migrations?.v30CompletedAt);
      setStatus($('migrationStatus'), `${summary}. ${$('runMigration').disabled ? 'V30 migration is already marked complete.' : 'Review complete; migration button enabled.'}`, $('runMigration').disabled ? 'warn' : 'ok');
    } catch (error) { setStatus($('migrationStatus'), error.message, 'error'); }
  }

  function legacyEntryItems(entry) {
    const list = C.asArray(entry?.inserts).filter(row => row?.code);
    return list.length ? list : (entry?.insertCode ? [{ code: entry.insertCode, qty: entry.qty }] : []);
  }

  async function runLegacyMigration() {
    if (!state.legacyPreview || state.meta?.migrations?.v30CompletedAt) return;
    if (prompt('This creates V37 records without deleting V30 data. Type MIGRATE V30 to continue.') !== 'MIGRATE V30') return;
    const legacy = state.legacyPreview; const inserts = C.asArray(legacy.inserts); const operators = C.asArray(legacy.operators); const stockIn = C.asArray(legacy.stockIn); const entries = C.asArray(legacy.entries); const updates = {};
    const balances = {}; const knownSkus = new Set();
    inserts.forEach((raw, index) => {
      const sku = String(raw.code || raw.sku || `LEGACY-${index + 1}`).trim().toUpperCase(); const key = C.safeKey(sku);
      knownSkus.add(sku);
      balances[sku] = C.number(raw.opening);
      updates[`cncManager/publicMaster/inserts/${key}`] = C.normalizeInsert({ sku, name: raw.name || sku, brand: raw.brand || '', grade: raw.grade || '', rackId: 'UNASSIGNED', channelId: `LEGACY-${index + 1}`, issueMode: 'ONE_PIECE', packSize: 1, edgesPerInsert: 1, unitValue: raw.value, reorderLevel: raw.min, active: false });
      updates[`cncManager/stockLedger/${C.safeKey(`MIG-OPEN-${key}`)}`] = { id: `MIG-OPEN-${key}`, sku, delta: C.number(raw.opening), type: 'LEGACY_OPENING', effectiveDate: '2000-01-01', status: 'POSTED', migrated: true };
    });
    stockIn.forEach((row, index) => {
      const sku = String(row.code || '').trim().toUpperCase(); if (!sku) return; const delta = C.number(row.qty); balances[sku] = C.number(balances[sku]) + delta;
      updates[`cncManager/stockLedger/${C.safeKey(`MIG-IN-${index}`)}`] = { id: `MIG-IN-${index}`, sku, delta, type: 'LEGACY_RECEIPT', effectiveDate: String(row.date || '2000-01-01').slice(0, 10), status: 'POSTED', migrated: true };
    });
    entries.forEach((entry, index) => {
      const reportId = C.safeKey(String(entry.sourceId || entry.id || `MIG-REPORT-${index}`)); updates[`cncManager/legacyReports/${reportId}`] = { ...entry, migrated: true };
      legacyEntryItems(entry).forEach((item, itemIndex) => {
        const sku = String(item.code || '').trim().toUpperCase(); if (!sku) return; const delta = -Math.abs(C.number(item.qty)); balances[sku] = C.number(balances[sku]) + delta;
        updates[`cncManager/stockLedger/${C.safeKey(`MIG-USE-${index}-${itemIndex}`)}`] = { id: `MIG-USE-${index}-${itemIndex}`, sku, delta, type: 'LEGACY_USAGE', effectiveDate: String(entry.date || '2000-01-01').slice(0, 10), status: 'POSTED', migrated: true };
      });
    });
    operators.forEach((row, index) => {
      const code = String(row.code || `LEGACY-OP-${index + 1}`).trim().toUpperCase(); updates[`cncManager/publicMaster/operators/${C.safeKey(code)}`] = { code, name: String(row.name || code), shift: ['A', 'B'].includes(row.shift) ? row.shift : 'A', active: true, legacy: true };
    });
    Object.entries(balances).forEach(([sku, available], index) => { const key = C.safeKey(sku); if (!knownSkus.has(sku)) updates[`cncManager/publicMaster/inserts/${key}`] = C.normalizeInsert({ sku, name: `Legacy SKU ${sku}`, rackId: 'UNASSIGNED', channelId: `LEGACY-UNKNOWN-${index + 1}`, issueMode: 'ONE_PIECE', active: false }); const safeAvailable = Math.max(0, Math.trunc(available)); updates[`cncManager/inventory/${key}`] = { available: safeAvailable, updatedAt: firebase.database.ServerValue.TIMESTAMP, migrated: true }; updates[`cncManager/publicInventory/${key}`] = { sku, available: safeAvailable, updatedAt: firebase.database.ServerValue.TIMESTAMP }; });
    const migrationSummary = { operators: operators.length, inserts: inserts.length, stockIn: stockIn.length, reports: entries.length };
    try {
      const paths = Object.entries(updates); for (let offset = 0; offset < paths.length; offset += 400) await state.db.ref().update(Object.fromEntries(paths.slice(offset, offset + 400)));
      await state.db.ref('cncManager/meta/migrations').set({ v30CompletedAt: firebase.database.ServerValue.TIMESTAMP, v30Summary: migrationSummary });
      await audit('V30_MIGRATION', migrationSummary); $('runMigration').disabled = true; setStatus($('migrationStatus'), 'V30 migration completed. Verify each legacy SKU rack/channel, then activate it.', 'ok');
    }
    catch (error) { setStatus($('migrationStatus'), error.message, 'error'); }
  }

  function renderCompanyProfileForm() {
    const profile = C.normalizeCompanyProfile(state.settings?.companyProfile || {});
    $('profileCompanyName').value = profile.companyName;
    $('profileLegalName').value = profile.legalName;
    $('profileGstin').value = profile.gstin;
    $('profileEstablishedDate').value = profile.establishedDate;
    $('profileContactPerson').value = profile.contactPerson;
    $('profilePhone').value = profile.phone;
    $('profileEmail').value = profile.email;
    $('profileAddress').value = profile.address;
    $('profileMonthlyTarget').value = profile.monthlyTargetRevenue;
  }

  async function saveCompanyProfile(event) {
    event.preventDefault();
    const companyName = String($('profileCompanyName').value || '').trim();
    const establishedDate = String($('profileEstablishedDate').value || '').trim();
    const rawTarget = String($('profileMonthlyTarget').value || '').trim();
    const email = String($('profileEmail').value || '').trim().toLowerCase();
    const errors = [];
    if (!companyName) errors.push('Display company name தேவை.');
    if (establishedDate && (!C.validIsoDate(establishedDate) || establishedDate > C.today())) errors.push('Company started date சரியான கடந்த/இன்றைய தேதியாக இருக்க வேண்டும்.');
    if (rawTarget && (!Number.isFinite(Number(rawTarget)) || Number(rawTarget) < 0)) errors.push('Default monthly target 0 அல்லது positive amount ஆக இருக்க வேண்டும்.');
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push('Email format சரியில்லை.');
    if (errors.length) return setStatus($('companyProfileStatus'), errors.join(' '), 'error');
    const profile = C.normalizeCompanyProfile({
      companyName, legalName: $('profileLegalName').value, gstin: $('profileGstin').value,
      establishedDate, contactPerson: $('profileContactPerson').value, phone: $('profilePhone').value,
      email, address: $('profileAddress').value, monthlyTargetRevenue: rawTarget || 0
    });
    const button = $('companyProfileForm').querySelector('button[type=submit]'); button.disabled = true;
    try {
      await state.db.ref('cncManager/settings/companyProfile').set({ ...profile, updatedBy: state.user.uid, updatedAt: firebase.database.ServerValue.TIMESTAMP });
      await audit('COMPANY_PROFILE_SAVE', { companyName: profile.companyName, establishedDate: profile.establishedDate, monthlyTargetRevenue: profile.monthlyTargetRevenue });
      setStatus($('companyProfileStatus'), 'Company profile saved. Dashboard உடனடியாக update ஆகும்.', 'ok');
    } catch (error) { setStatus($('companyProfileStatus'), error.message, 'error'); }
    finally { button.disabled = false; }
  }

  function editMonthlyTurnover(month) {
    if (!C.validMonthKey(month)) return;
    const row = C.normalizeMonthlyTurnover(state.settings?.monthlyTurnover?.[month] || {}, month);
    const profile = C.normalizeCompanyProfile(state.settings?.companyProfile || {});
    $('turnoverMonth').value = month;
    $('turnoverAmount').value = state.settings?.monthlyTurnover?.[month]?.turnover ?? '';
    $('turnoverTarget').value = row.target || profile.monthlyTargetRevenue || 0;
    $('turnoverNote').value = row.note;
    setStatus($('turnoverStatus'), `${month} entry edit செய்யப்படுகிறது. Save செய்தால் அந்த மாத chart update ஆகும்.`, 'warn');
    $('turnoverForm').scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  async function saveMonthlyTurnover(event) {
    event.preventDefault();
    const month = String($('turnoverMonth').value || '').trim();
    const rawAmount = String($('turnoverAmount').value || '').trim();
    const rawTarget = String($('turnoverTarget').value || '').trim();
    const errors = [];
    if (!C.validMonthKey(month)) errors.push('சரியான month தேர்வு செய்யவும்.');
    if (!rawAmount || !Number.isFinite(Number(rawAmount)) || Number(rawAmount) < 0) errors.push('Confirmed turnover 0 அல்லது positive amount ஆக தேவை.');
    if (rawTarget && (!Number.isFinite(Number(rawTarget)) || Number(rawTarget) < 0)) errors.push('Month target 0 அல்லது positive amount ஆக இருக்க வேண்டும்.');
    if (errors.length) return setStatus($('turnoverStatus'), errors.join(' '), 'error');
    const row = C.normalizeMonthlyTurnover({ month, turnover: rawAmount, target: rawTarget || 0, note: $('turnoverNote').value }, month);
    const button = $('turnoverForm').querySelector('button[type=submit]'); button.disabled = true;
    try {
      await state.db.ref(`cncManager/settings/monthlyTurnover/${month}`).set({ ...row, updatedBy: state.user.uid, updatedAt: firebase.database.ServerValue.TIMESTAMP });
      await audit('MONTHLY_TURNOVER_SAVE', { month, turnover: row.turnover, target: row.target });
      setStatus($('turnoverStatus'), `${month} confirmed turnover ${C.money(row.turnover)} saved.`, 'ok');
    } catch (error) { setStatus($('turnoverStatus'), error.message, 'error'); }
    finally { button.disabled = false; }
  }

  function renderSettings() {
    const setDeadline = (shift, fallbackTime, fallbackPeriod) => {
      const value = state.settings?.reportDeadlines?.[shift]; let time = fallbackTime; let period = fallbackPeriod;
      if (typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value)) { const [hour, minute] = value.split(':').map(Number); time = `${String(hour % 12 || 12).padStart(2, '0')}:${String(minute).padStart(2, '0')}`; period = hour >= 12 ? 'PM' : 'AM'; }
      else if (value && typeof value === 'object') { time = value.time || time; period = value.period || period; }
      $(`deadline${shift}Time`).value = time; $(`deadline${shift}Period`).value = period;
    };
    setDeadline('A', '06:00', 'PM'); setDeadline('B', '06:00', 'AM');
    renderMachineRates(); renderCompanyProfileForm();
  }

  function renderMachineRates() {
    const saved = state.settings?.machineRates || {};
    $('machineRateRows').innerHTML = C.MACHINES.map(machine => {
      const explicit = saved[C.safeKey(machine.code)] || saved[machine.code];
      const rate = C.machineRateFor(saved, machine.code);
      const source = explicit ? 'SAVED' : 'PHOTO DEFAULT';
      return `<tr>
        <td data-label="Machine"><b>${C.escapeHtml(machine.name)}</b></td>
        <td data-label="Minimum ₹ / min"><input class="machine-rate-min" data-machine="${C.escapeHtml(machine.code)}" type="number" min="0" step="0.01" value="${rate.minPerMinute}" aria-label="${C.escapeHtml(machine.name)} minimum rupees per minute"></td>
        <td data-label="Maximum ₹ / min"><input class="machine-rate-max" data-machine="${C.escapeHtml(machine.code)}" type="number" min="0" step="0.01" value="${rate.maxPerMinute}" aria-label="${C.escapeHtml(machine.name)} maximum rupees per minute"></td>
        <td data-label="Current source">${badge(source)}</td>
      </tr>`;
    }).join('');
  }

  async function saveMachineRates(event) {
    event.preventDefault();
    const raw = {};
    document.querySelectorAll('.machine-rate-min').forEach(input => {
      const machine = input.dataset.machine;
      const maximum = [...document.querySelectorAll('.machine-rate-max')].find(row => row.dataset.machine === machine);
      raw[C.safeKey(machine)] = { machine, minPerMinute: input.value, maxPerMinute: maximum?.value };
    });
    const checked = C.validateMachineRates(raw);
    if (!checked.ok) return setStatus($('machineRateStatus'), checked.errors.join(' '), 'error');
    const stored = {};
    Object.entries(checked.value).forEach(([key, rate]) => {
      stored[key] = { machine: rate.machine, minPerMinute: rate.minPerMinute, maxPerMinute: rate.maxPerMinute, updatedBy: state.user.uid, updatedAt: firebase.database.ServerValue.TIMESTAMP };
    });
    const button = $('machineRateForm').querySelector('button[type=submit]'); button.disabled = true;
    try {
      await state.db.ref('cncManager/settings/machineRates').set(stored);
      await audit('SETTINGS_SAVE', { section: 'machineRates', rates: Object.fromEntries(Object.entries(stored).map(([key, rate]) => [key, { minPerMinute: rate.minPerMinute, maxPerMinute: rate.maxPerMinute }])) });
      setStatus($('machineRateStatus'), 'Machine ₹/minute ranges saved. New reports will store this rate snapshot with every Part / Side.', 'ok');
    } catch (error) { setStatus($('machineRateStatus'), error.message, 'error'); }
    finally { button.disabled = false; }
  }

  async function saveSettings(event) {
    event.preventDefault();
    const A = { time: $('deadlineATime').value, period: $('deadlineAPeriod').value }; const B = { time: $('deadlineBTime').value, period: $('deadlineBPeriod').value };
    if (C.parse12HourTime(A.time, A.period) == null || C.parse12HourTime(B.time, B.period) == null) return setStatus($('globalStatus'), 'Deadline must use HH:MM with AM/PM.', 'error');
    await state.db.ref('cncManager/settings/reportDeadlines').set({ A, B, BNextDay: true, updatedBy: state.user.uid, updatedAt: firebase.database.ServerValue.TIMESTAMP }); await audit('SETTINGS_SAVE', { section: 'reportDeadlines' }); setStatus($('globalStatus'), '12-hour deadline settings saved.', 'ok');
  }

  function renderAll() {
    renderInventory(); renderDashboard(); renderProduction(); renderControl(); renderReports(); renderUsers(); renderNotices(); renderSettings();
  }

  function listen(path, target, render) {
    state.db.ref(`cncManager/${path}`).on('value', snapshot => {
      state[target] = snapshot.val() || {}; render?.();
    }, error => setStatus($('globalStatus'), `${path}: ${error.message}`, 'error'));
  }

  function setupListeners() {
    listen('publicMaster/inserts', 'inserts', () => { renderInventory(); renderDashboard(); renderReports(); renderProduction(); });
    listen('publicMaster/operators', 'operators', () => { renderUsers(); renderDashboard(); renderReports(); renderProduction(); });
    listen('publicMaster/companies', 'companies', renderProduction);
    listen('publicMaster/jobs', 'jobMasters', renderProduction);
    listen('drawings', 'drawings', renderProduction);
    listen('drawingAnalysisRequests', 'drawingRequests', renderProduction);
    listen('jobEstimates', 'estimates', renderProduction);
    listen('productionBatches', 'batches', () => { renderProduction(); renderUsers(); renderDashboard(); });
    listen('inventory', 'inventory', () => { renderInventory(); renderDashboard(); });
    listen('stockLedger', 'ledger', renderDashboard);
    listen('operatorData', 'operatorData', () => { renderDashboard(); renderReports(); });
    listen('legacyReports', 'legacyReports', () => { renderDashboard(); renderReports(); });
    listen('issues', 'issues', () => { renderDashboard(); renderControl(); renderReports(); });
    listen('approvals', 'approvals', renderControl);
    listen('returnRequests', 'returnRequests', renderControl);
    listen('reportRequests', 'reportRequests', renderReports);
    listen('dispenseQueue', 'queue', renderControl);
    listen('users', 'users', () => { renderUsers(); renderControl(); renderDashboard(); });
    listen('roleRequests', 'roleRequests', renderUsers);
    listen('publicNotices', 'notices', renderNotices);
    listen('settings', 'settings', () => { renderSettings(); renderDashboard(); renderProduction(); renderReports(); });
    listen('stockRequests', 'stockRequests', renderStockRequestStatus);
    listen('meta', 'meta');
    setStatus($('globalStatus'), 'Firebase V37 live sync connected · operator maximum 2 active machines.', 'ok'); $('appLoading').remove();
  }

  function setupForms() {
    $('dashDate').value = C.today(); $('stockDate').value = C.today(); $('reportTo').value = C.today(); $('estimateStartDate').value = C.today(); $('turnoverMonth').value = C.monthKey(C.today());
    const monthAgo = new Date(); monthAgo.setDate(monthAgo.getDate() - 30); $('reportFrom').value = C.today(monthAgo);
    $('dashDate').addEventListener('change', renderDashboard); $('turnoverRange').addEventListener('change', renderDashboard); $('reportFrom').addEventListener('change', renderReports); $('reportTo').addEventListener('change', renderReports);
    [1, 2, 3, 4].forEach(index => { $(`jobOp${index}Machine`).innerHTML = machineOptions(); }); updateJobOperationRows();
    $('companyForm').addEventListener('submit', saveCompany); $('cancelCompanyEdit').addEventListener('click', resetCompanyForm);
    $('drawingForm').addEventListener('submit', saveDrawing);
    $('jobMasterForm').addEventListener('submit', saveJobMaster); $('cancelJobMasterEdit').addEventListener('click', resetJobMasterForm); $('jobCompany').addEventListener('change', refreshProductionSelects); $('jobOperationCount').addEventListener('change', updateJobOperationRows); $('jobDrawing').addEventListener('change', () => { const drawing = drawingFor($('jobDrawing').value); if (drawing.confirmedOperationCount || drawing.suggestedOperationCount) { $('jobOperationCount').value = String(drawing.confirmedOperationCount || drawing.suggestedOperationCount); updateJobOperationRows(); } });
    $('estimateForm').addEventListener('submit', saveEstimate); $('calculateEstimate').addEventListener('click', calculateEstimatePreview); $('estimateCompany').addEventListener('change', () => { refreshProductionSelects(); calculateEstimatePreview(); }); ['estimateJob', 'estimateQty', 'estimateStartDate', 'estimateMinutesPerDay', 'estimateEfficiency'].forEach(id => $(id).addEventListener('change', calculateEstimatePreview));
    $('batchForm').addEventListener('submit', saveBatch); $('batchCompany').addEventListener('change', refreshProductionSelects); $('batchEstimate').addEventListener('change', applyEstimateToBatch);
    $('insertForm').addEventListener('submit', saveInsert); $('cancelInsertEdit').addEventListener('click', resetInsertForm); $('insertMode').addEventListener('change', () => { if ($('insertMode').value === 'ONE_PIECE') { $('insertPackSize').value = '1'; $('insertPackSize').disabled = true; } else $('insertPackSize').disabled = false; });
    $('stockForm').addEventListener('submit', submitStock); $('noticeForm').addEventListener('submit', publishNotice); $('settingsForm').addEventListener('submit', saveSettings); $('machineRateForm').addEventListener('submit', saveMachineRates); $('companyProfileForm').addEventListener('submit', saveCompanyProfile); $('turnoverForm').addEventListener('submit', saveMonthlyTurnover);
    $('noticeFile').addEventListener('change', () => { const file = $('noticeFile').files[0]; if (file) previewNoticeMedia(file, file.name); else clearNoticeMedia(); }); $('recordVoice').addEventListener('click', toggleVoiceRecording); $('clearNoticeMedia').addEventListener('click', clearNoticeMedia);
    $('exportReports').addEventListener('click', exportReportsCsv); $('exportEdgePerformance').addEventListener('click', exportEdgePerformanceCsv); $('downloadBackup').addEventListener('click', downloadBackup);
    $('previewRestore').addEventListener('click', previewRestore); $('previewMigration').addEventListener('click', previewLegacy); $('runMigration').addEventListener('click', runLegacyMigration);
  }

  async function start(context) {
    state.db = context.db; state.storage = firebase.storage(); state.user = context.user; state.profile = context.profile;
    $('signedUser').textContent = `${context.profile.displayName || context.user.email} · Admin`;
    setupNavigation(); setupForms(); setupListeners();
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('./service-worker.js?v=37.1', { updateViaCache: 'none' }).then(registration => registration.update()).catch(console.warn);
  }

  if (!C || !globalThis.CNCAuth) throw new Error('V37 core/auth scripts failed to load.');
  CNCAuth.requireRole('admin', start).catch(error => console.error('Admin bootstrap failed', error));
})();
