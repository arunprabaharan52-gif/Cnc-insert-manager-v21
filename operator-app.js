(function () {
  'use strict';
  const C = globalThis.CNCV37;
  const state = { db: null, storage: null, user: null, profile: null, inserts: {}, inventory: {}, machineState: {}, issues: {}, reports: {}, reportRequests: {}, issueRequests: {}, returnRequests: {}, ocrRequests: {}, notices: {}, batches: {}, batchRequests: {}, assignmentsLoaded: false, speechRecognition: null };
  const $ = id => document.getElementById(id);
  const values = value => C.objectValues(value);
  const setStatus = (element, message, kind = '') => { element.textContent = message; element.className = `notice${kind ? ` ${kind}` : ''}`; };
  const stamp12 = value => value ? new Date(C.number(value)).toLocaleString('en-IN', { dateStyle: 'medium', hour: '2-digit', minute: '2-digit', hour12: true }) : '—';
  const setClockFromTimestamp = (jobNumber, kind, value) => { if (!value) return; const date = new Date(C.number(value)); let hour = date.getHours(); const period = hour >= 12 ? 'PM' : 'AM'; hour = hour % 12 || 12; $(`job${jobNumber}${kind}Time`).value = `${String(hour).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`; $(`job${jobNumber}${kind}Period`).value = period; };
  const stamp = value => {
    if (!value) return '—'; const date = new Date(typeof value === 'number' ? value : String(value));
    return Number.isNaN(date.getTime()) ? C.escapeHtml(String(value)) : date.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
  };
  const emptyRow = (columns, message) => `<tr><td colspan="${columns}" class="empty">${C.escapeHtml(message)}</td></tr>`;
  const badge = status => {
    const clean = String(status || 'UNKNOWN').toUpperCase();
    const kind = /APPROVED|ACTIVE|CLOSED|DISPENSED|PROCESSED|SUBMITTED|PROFIT|GOOD|CONTINUE|COMPLETE|DISPATCH READY|BETTER|ON TARGET/.test(clean) ? 'ok' : /PENDING|QUEUED|PROCESSING|OPEN|AWAITING|LATE|BORDERLINE|NOT SET|RUNNING|REVIEW|WATCH|NOT RECORDED/.test(clean) ? 'warn' : /REJECTED|FAILED|CANCELLED|NOT SUITABLE|POOR|LOSS|HOLD|IMPROVEMENT REQUIRED/.test(clean) ? 'bad' : 'info';
    return `<span class="status ${kind}">${C.escapeHtml(clean)}</span>`;
  };
  const insertFor = sku => state.inserts[C.safeKey(String(sku || '').toUpperCase())] || values(state.inserts).find(row => row.sku === sku);
  const openIssues = () => values(state.issues).filter(row => row.status === 'OPEN');

  function showPage(pageId) {
    document.querySelectorAll('.page').forEach(page => page.classList.toggle('active', page.id === pageId));
    document.querySelectorAll('nav.tabs button').forEach(button => button.classList.toggle('active', button.dataset.page === pageId));
    if (pageId === 'history') renderHistory();
    if (pageId === 'production') renderProductionBatches();
  }

  function setupNavigation() {
    document.querySelectorAll('nav.tabs button').forEach(button => button.addEventListener('click', () => showPage(button.dataset.page)));
    $('logoutBtn').addEventListener('click', () => CNCAuth.logout());
    $('accountReset').addEventListener('click', async () => {
      try { const email = await CNCAuth.sendPasswordReset(); alert(`Password reset email sent to ${email}`); }
      catch (error) { alert(error.message); }
    });
  }

  function assignedMachineLoad() { return C.operatorMachineLoad(state.batches, state.user?.uid || ''); }

  function machineOptions(selected = '', lockAware = false, assignedOnly = false) {
    const allowed = new Set(assignedMachineLoad().machineCodes); const rows = assignedOnly && state.assignmentsLoaded ? C.MACHINES.filter(row => allowed.has(row.code)) : C.MACHINES;
    return '<option value="">Select machine</option>' + rows.map(row => {
      const locked = lockAware && state.machineState[C.safeKey(row.code)]?.state === 'LOCKED';
      return `<option value="${row.code}"${selected === row.code ? ' selected' : ''}${locked ? ' disabled' : ''}>${row.name}${locked ? ' — LOCKED' : ''}</option>`;
    }).join('');
  }

  function renderOperatorMachineLoad() {
    const load = assignedMachineLoad(); const element = $('operatorMachineLoadSummary'); if (!element) return;
    if (!load.machineCount) { element.innerHTML = '<b>Active machine assignment இல்லை.</b> Admin batch ஒதுக்கிய பிறகு மட்டுமே machine வேலை தொடங்கவும்.'; element.className = 'notice warn'; return; }
    const detail = load.machines.map(row => `<span><b>${C.escapeHtml(row.machine)}</b> · ${C.escapeHtml(row.jobs.join(' / '))}${row.running ? ' · RUNNING' : ' · NEXT'}</span>`).join(''); element.innerHTML = `<div class="page-title"><div><b>எனக்கு ஒதுக்கப்பட்ட மிஷின்கள்: ${load.machineCount}/${C.MAX_OPERATOR_MACHINES}</b><p class="muted">ஒரே நேரத்தில் அதிகபட்சம் இரண்டு மிஷின்கள் மட்டுமே Start செய்யலாம்.</p></div>${badge(load.status)}</div><div class="summary-strip">${detail}</div>`; element.className = `notice ${load.machineCount > C.MAX_OPERATOR_MACHINES ? 'error' : 'ok'}`;
  }

  function refreshJobBatchOptions() {
    document.querySelectorAll('.job-batch-select').forEach(select => {
      const selected = select.value || select.dataset.selectedBatch || ''; const rows = Object.entries(state.batches || {}).map(([key, value]) => ({ _key: key, ...(value || {}) })).filter(row => row.active !== false && C.productionBatchStatus(row) !== 'DISPATCH READY').sort((a, b) => C.number(b.createdAt) - C.number(a.createdAt));
      select.innerHTML = '<option value="">Select assigned production batch</option>' + rows.map(row => `<option value="${C.escapeHtml(row._key)}">${C.escapeHtml(row.companyName)} · ${C.escapeHtml(row.jobName)} · ${C.escapeHtml(row.partNo)} · ${C.escapeHtml(row.poNumber || row._key)}</option>`).join('');
      if ([...select.options].some(option => option.value === selected)) select.value = selected; select.dataset.selectedBatch = '';
    });
  }

  function applyBatchToDaily(jobNumber) {
    const batchId = $(`job${jobNumber}Batch`).value; const batch = C.normalizeProductionBatch(state.batches[batchId]); if (!batch.batchId) return;
    $(`job${jobNumber}Name`).value = batch.jobName; const operations = batch.operations;
    for (let part = 1; part <= 4; part += 1) {
      const operation = operations[part - 1]; const enabled = Boolean(operation); $(`job${jobNumber}Part${part}Enabled`).checked = enabled || part === 1;
      if (!operation) continue; $(`job${jobNumber}Part${part}No`).value = batch.partNo; $(`job${jobNumber}Part${part}Machine`).value = operation.machine || ''; $(`job${jobNumber}Part${part}Side`).value = `SIDE-${part}`; $(`job${jobNumber}Part${part}Cycle`).dataset.estimatedCycle = C.number(operation.cycleMinutes); $(`job${jobNumber}Part${part}Cycle`).value = C.number(operation.actualCycleMinutes) || C.number(operation.cycleMinutes) || ''; $(`job${jobNumber}Part${part}Rpm`).value = C.number(operation.rpm) || ''; $(`job${jobNumber}Part${part}Program`).value = operation.programNo || ''; $(`job${jobNumber}Part${part}Rate`).value = '0'; const route = String(operation.machine || '').startsWith('VMC') ? 'VMC' : String(operation.machine || '').startsWith('VTL') ? 'VTL' : 'CNC'; $(`job${jobNumber}Side${part}Route`).value = route; $(`job${jobNumber}Side${part}Complete`).checked = batch.operations[part - 1]?.state === 'COMPLETE';
    }
    const started = batch.operations.map(operation => C.number(operation.startedAt)).filter(Boolean); const completed = batch.operations.map(operation => C.number(operation.completedAt)).filter(Boolean); if (started.length) setClockFromTimestamp(jobNumber, 'In', Math.min(...started)); if (completed.length) setClockFromTimestamp(jobNumber, 'Out', Math.max(...completed));
    const running = batch.operations.find(operation => operation.state === 'RUNNING') || batch.operations.find(operation => operation.state === 'PENDING') || batch.operations[0]; if (running?.machine) { $('reportMachine').value = running.machine; $(`job${jobNumber}WorkMachine`).value = running.machine; }
    updateJobControls(); updateReportTotals(); setStatus($('reportStatus'), `${batch.companyName} · ${batch.jobName} · ${batch.partNo} batch daily report-க்கு நிரப்பப்பட்டது. Cycle/RPM/quantity/time சரிபார்க்கவும்.`, 'ok');
  }

  async function openBatchDrawing(storagePath) {
    if (!storagePath) return alert('Drawing file linked இல்லை.'); const popup = window.open('', '_blank');
    try { const url = await state.storage.ref(storagePath).getDownloadURL(); if (popup) popup.location.href = url; else location.href = url; }
    catch (error) { popup?.close(); setStatus($('batchRequestStatus'), `Drawing open failed: ${error.message}`, 'error'); }
  }

  function renderProductionBatches() {
    renderOperatorMachineLoad(); const rows = Object.entries(state.batches || {}).map(([key, value]) => ({ _key: key, ...(value || {}) })).filter(row => row.active !== false).sort((a, b) => String(C.activeBatchOperation(a)?.machine || '').localeCompare(String(C.activeBatchOperation(b)?.machine || '')) || C.number(b.createdAt) - C.number(a.createdAt));
    $('operatorBatchCards').innerHTML = rows.map(raw => {
      const batch = C.normalizeProductionBatch(raw); const status = C.productionBatchStatus(batch); const running = batch.operations.some(operation => operation.state === 'RUNNING'); const operations = batch.operations.map((operation, index) => {
        const priorComplete = batch.operations.slice(0, index).every(row => row.state === 'COMPLETE'); const canStart = !batch.hold && operation.state === 'PENDING' && priorComplete && !running; const canComplete = !batch.hold && operation.state === 'RUNNING' && (!operation.operatorUid || operation.operatorUid === state.user.uid); const performance = C.cyclePerformance(operation.cycleMinutes, operation.actualCycleMinutes); const performanceText = performance.status === 'NOT RECORDED' ? 'Actual cycle not recorded' : `Actual ${performance.actualCycleMinutes.toFixed(3)} min · ${performance.varianceMinutes >= 0 ? '+' : ''}${performance.varianceMinutes.toFixed(3)} min (${performance.variancePercent >= 0 ? '+' : ''}${performance.variancePercent.toFixed(1)}%) · ${performance.status}`;
        let action = ''; if (canStart) action = `<button class="batch-stage good" data-batch="${C.escapeHtml(batch.batchId)}" data-operation="${operation.number}" data-action="START">Start</button>`; else if (canComplete) action = `<div class="batch-complete-fields"><label>Completed qty<input class="batch-completed-qty" data-batch="${C.escapeHtml(batch.batchId)}" data-operation="${operation.number}" type="number" min="1" step="1" value="${batch.targetQty || ''}"></label><label>Actual cycle min<input class="batch-actual-cycle" data-batch="${C.escapeHtml(batch.batchId)}" data-operation="${operation.number}" type="number" min="0.001" step="0.001" placeholder="Machine screen"></label><button class="batch-stage primary" data-batch="${C.escapeHtml(batch.batchId)}" data-operation="${operation.number}" data-action="COMPLETE">Complete</button></div>`;
        return `<div class="production-operation"><div><b>${operation.number}. ${C.escapeHtml(operation.name)}</b><br>${C.escapeHtml(operation.machine)} · Target ${C.number(operation.cycleMinutes).toFixed(3)} min · ${Math.trunc(C.number(operation.rpm))} RPM<br>In: ${C.escapeHtml(stamp12(operation.startedAt))} · Out: ${C.escapeHtml(stamp12(operation.completedAt))}<br><span class="${performance.improvementRequired ? 'badtxt' : ''}">${C.escapeHtml(performanceText)}</span>${performance.improvementRequired ? '<br><b class="badtxt">Cycle time reduce / cause investigate செய்யவும்.</b>' : ''}</div><div>${badge(operation.state)} ${action}</div></div>`;
      }).join('');
      const activeOperation = C.activeBatchOperation(batch); return `<article class="card production-batch-card"><div class="page-title"><div><h3>${C.escapeHtml(batch.companyName)} · ${C.escapeHtml(batch.jobName)}</h3><p class="muted">${C.escapeHtml(batch.partNo)} · Batch ${C.escapeHtml(batch.batchId)} · PO ${C.escapeHtml(batch.poNumber || '—')} · Qty ${batch.targetQty}</p></div>${badge(status)}</div>${activeOperation ? `<div class="notice info"><b>Current machine slot: ${C.escapeHtml(activeOperation.machine)}</b> · ${C.escapeHtml(activeOperation.name)}</div>` : ''}<div class="production-operation-list">${operations}</div><div class="summary-strip"><span>PO: <b>${C.escapeHtml(batch.poNumber || '—')}</b></span><span>Drawing: <b>${C.escapeHtml(batch.drawingNo || 'Not linked')}</b></span><span>Final: <b>${batch.inspectionComplete ? 'Inspection ✓' : 'Inspection pending'} · ${batch.oilingComplete ? 'Oiling ✓' : 'Oiling pending'} · ${batch.packingComplete ? 'Packing ✓' : 'Packing pending'}</b></span></div>${batch.drawingStoragePath ? `<div class="actions"><button class="open-batch-drawing" data-path="${C.escapeHtml(batch.drawingStoragePath)}">Open drawing</button></div>` : ''}</article>`;
    }).join('') || '<div class="card empty">உங்களுக்கு ஒதுக்கப்பட்ட active production batch இல்லை.</div>';
    document.querySelectorAll('.batch-stage').forEach(button => button.addEventListener('click', () => submitBatchStage(button.dataset.batch, Number(button.dataset.operation), button.dataset.action)));
    document.querySelectorAll('.open-batch-drawing').forEach(button => button.addEventListener('click', () => openBatchDrawing(button.dataset.path)));
    refreshJobBatchOptions();
  }

  async function submitBatchStage(batchId, operationNumber, action) {
    const batch = C.normalizeProductionBatch(state.batches[batchId]); const operation = batch.operations[operationNumber - 1]; if (!operation) return; const request = { batchId, operationNumber, action, ownerUid: state.user.uid, operatorCode: state.profile.operatorCode };
    if (action === 'START') { const concurrent = C.validateOperatorConcurrentStart(state.batches, batchId, operationNumber, state.user.uid); if (!concurrent.ok) return alert(concurrent.errors.join(' ')); }
    if (action === 'COMPLETE') { const selector = suffix => document.querySelector(`.${suffix}[data-batch="${CSS.escape(batchId)}"][data-operation="${operationNumber}"]`); request.completedQty = Number(selector('batch-completed-qty')?.value); request.actualCycleMinutes = Number(selector('batch-actual-cycle')?.value); if (!Number.isInteger(request.completedQty) || request.completedQty < 1 || !(request.actualCycleMinutes > 0)) return alert('Completed quantity மற்றும் machine screen actual cycle minutes தேவை.'); }
    if (!confirm(`${batch.jobName} · ${operation.name}: ${action}${action === 'COMPLETE' ? ` · Qty ${request.completedQty} · Actual ${request.actualCycleMinutes} min` : ''}?`)) return; const requestId = C.safeKey(C.newId('BATCH-STAGE'));
    try { await state.db.ref(`cncManager/batchUpdateRequests/${state.user.uid}/${requestId}`).set({ ...request, requestId, status: 'PENDING', requestedAt: firebase.database.ServerValue.TIMESTAMP, clientVersion: C.VERSION }); setStatus($('batchRequestStatus'), `${operation.name} ${action} request backend verification-க்கு அனுப்பப்பட்டது.`, 'warn'); }
    catch (error) { setStatus($('batchRequestStatus'), error.message, 'error'); }
  }

  function renderBatchRequests() {
    const latest = values(state.batchRequests).sort((a, b) => C.number(b.requestedAt) - C.number(a.requestedAt))[0]; if (!latest) return setStatus($('batchRequestStatus'), 'Batch select செய்து Head/Side Start செய்யலாம்.', ''); setStatus($('batchRequestStatus'), `Latest stage: ${latest.status}${latest.batchStatus ? ` · ${latest.batchStatus}` : ''}${latest.error ? ` — ${latest.error}` : ''}`, latest.status === 'PROCESSED' ? 'ok' : /PENDING|PROCESSING/.test(latest.status) ? 'warn' : 'error');
  }

  function renderIssueMachines() {
    const selected = $('issueMachine').value; $('issueMachine').innerHTML = machineOptions(selected, true, true);
    const option = [...$('issueMachine').options].find(row => row.value === selected); if (!option || option.disabled) $('issueMachine').value = '';
  }

  function renderMasters() {
    const issueSelected = $('issueSku').value;
    const active = values(state.inserts).filter(row => row.active && row.rackId && !String(row.rackId).startsWith('UNASSIGNED')).sort((a, b) => String(a.sku).localeCompare(String(b.sku)));
    $('issueSku').innerHTML = '<option value="">Select complete SKU</option>' + active.map(row => {
      const available = C.availableStock(state.inventory, null, row.sku); return `<option value="${C.escapeHtml(row.sku)}">${C.escapeHtml(row.sku)} — ${C.escapeHtml(row.name)} — Stock ${available}</option>`;
    }).join('');
    if ([...$('issueSku').options].some(option => option.value === issueSelected)) $('issueSku').value = issueSelected;
    updateIssueSku();
  }

  function updateIssueSku() {
    const insert = insertFor($('issueSku').value);
    if (!insert) { $('issueRack').value = ''; $('issueQtyHint').textContent = ''; return; }
    $('issueRack').value = `${insert.rackId} / ${insert.channelId}`;
    const onePiece = insert.issueMode === 'ONE_PIECE';
    $('issueQty').disabled = onePiece; if (onePiece) $('issueQty').value = '1';
    else $('issueQty').max = String(insert.packSize || 1);
    $('issueQtyHint').textContent = onePiece ? 'Exactly one insert will be queued.' : `Whole quantity, maximum ${insert.packSize || 1}. Unused balance can return to stock.`;
  }

  function renderOpenIssues() {
    const selected = $('returnIssue').value;
    const rows = openIssues().sort((a, b) => C.number(b.issuedAt) - C.number(a.issuedAt));
    const locked = C.MACHINES.filter(machine => state.machineState[C.safeKey(machine.code)]?.state === 'LOCKED').map(machine => machine.name);
    $('returnIssue').innerHTML = '<option value="">Select dispensed open issue</option>' + rows.filter(row => row.dispenseStatus === 'DISPENSED').map(row => `<option value="${C.escapeHtml(row.issueId)}">${C.escapeHtml(row.machine)} — ${C.escapeHtml(row.sku)} — ${C.escapeHtml(row.job)}</option>`).join('');
    if ([...$('returnIssue').options].some(option => option.value === selected)) $('returnIssue').value = selected;
    $('openIssueSummary').innerHTML = rows.length
      ? `<b>${rows.length} unresolved insert(s).</b> ${rows.map(row => `${C.escapeHtml(row.machine)}: ${C.escapeHtml(row.sku)} ${badge(row.status)}`).join(' &nbsp; ')}`
      : `<b>No unresolved insert on this account.</b> ${locked.length ? `Globally locked: ${C.escapeHtml(locked.join(', '))}.` : 'Available machines can accept a full-SKU request.'}`;
    renderHistory(); updateLifePreview();
  }

  async function submitIssue(event) {
    event.preventDefault();
    const insert = insertFor($('issueSku').value); const requestId = C.newId('ISSUE');
    const request = { requestId, sku: $('issueSku').value, machine: $('issueMachine').value, job: $('issueJob').value, partNo: $('issuePartNo').value, quantity: $('issueQty').value, exceptionCode: $('issueException').value, exceptionNote: $('issueExceptionNote').value };
    const checked = C.validateIssueRequest(request, insert, { available: C.availableStock(state.inventory, null, request.sku), hasOpenIssue: openIssues().some(row => row.machine === request.machine) || state.machineState[C.safeKey(request.machine)]?.state === 'LOCKED' });
    if (!checked.ok) return setStatus($('issueStatus'), checked.errors.join(' '), 'error');
    if (insert.issueMode === 'MULTI_PIECE' && checked.value.quantity > C.number(insert.packSize, 1)) return setStatus($('issueStatus'), `Maximum issue quantity is ${insert.packSize}.`, 'error');
    const button = $('issueForm').querySelector('button[type=submit]'); button.disabled = true;
    try {
      await state.db.ref(`cncManager/issueRequests/${state.user.uid}/${C.safeKey(requestId)}`).set({
        ...checked.value, ownerUid: state.user.uid, operatorCode: state.profile.operatorCode, status: 'PENDING', requestedAt: firebase.database.ServerValue.TIMESTAMP, clientVersion: C.VERSION
      });
      $('issueJob').value = ''; $('issuePartNo').value = ''; $('issueException').value = ''; $('issueExceptionNote').value = '';
      setStatus($('issueStatus'), `Request ${requestId} submitted. Backend is checking prior return, stock and rack mapping.`, 'ok');
    } catch (error) { setStatus($('issueStatus'), error.message, 'error'); }
    finally { button.disabled = false; }
  }

  function selectedOpenIssue() { return state.issues[$('returnIssue').value] || values(state.issues).find(row => row.issueId === $('returnIssue').value); }

  function updateReturnFields() {
    const action = $('returnAction').value; const index = action === 'INDEX';
    $('returnPhysical').disabled = index; $('returnUnused').disabled = index; $('returnException').disabled = index; $('returnNote').disabled = index;
    $('returnEdges').readOnly = index;
    if (index) { $('returnPhysical').value = 'false'; $('returnUnused').value = '0'; $('returnEdges').value = '1'; $('returnException').value = ''; $('returnNote').value = ''; }
    updateLifePreview();
  }

  function returnPayload() {
    return {
      requestId: C.newId('RETURN'), issueId: $('returnIssue').value, action: $('returnAction').value,
      physicalReturnConfirmed: $('returnPhysical').value === 'true', unusedQty: $('returnUnused').value,
      goodParts: $('returnGood').value, rejectedParts: $('returnReject').value, cuttingMinutes: $('returnMinutes').value,
      edgesUsed: $('returnEdges').value, exceptionCode: $('returnException').value, exceptionNote: $('returnNote').value
    };
  }

  function updateLifePreview() {
    const issue = selectedOpenIssue() || {}; const prior = issue.metrics || {};
    const unused = C.number($('returnUnused').value); const quantity = issue.quantity || 1;
    const metrics = C.lifeMetrics({ goodParts: C.number(prior.goodParts) + C.number($('returnGood').value), rejectedParts: C.number(prior.rejectedParts) + C.number($('returnReject').value), cuttingMinutes: C.number(prior.cuttingMinutes) + C.number($('returnMinutes').value), edgesUsed: C.number(prior.edgesUsed) + C.number($('returnEdges').value, 1), quantity, consumedQuantity: Math.max(0, quantity - unused), unitValue: issue.unitValue || 0 });
    const master = insertFor(issue.sku) || {}; const expected = C.number(issue.expectedPartsPerEdge != null ? issue.expectedPartsPerEdge : master.expectedPartsPerEdge); const entryEdges = Math.max(1, C.number($('returnEdges').value, 1)); const entryGood = C.number($('returnGood').value) / entryEdges; const edgeResult = expected > 0 ? (entryGood >= expected ? 'GOOD' : 'POOR') : 'TARGET NOT SET';
    $('lifePreview').innerHTML = `<span>Current entry: <b class="${edgeResult === 'POOR' ? 'badtxt' : ''}">${entryGood.toFixed(1)} / edge · ${edgeResult}</b>${expected > 0 ? ` (target ${expected})` : ''}</span><span>Life Good / edge: <b>${metrics.goodPartsPerEdge.toFixed(1)}</b></span><span>Cut min / edge: <b>${metrics.cuttingMinutesPerEdge.toFixed(1)}</b></span><span>Parts / insert: <b>${metrics.totalPartsPerInsert.toFixed(1)}</b></span><span>Cost / good: <b>${metrics.costPerGoodComponent == null ? '—' : C.money(metrics.costPerGoodComponent)}</b></span>`;
  }

  async function submitReturn(event) {
    event.preventDefault(); const issue = selectedOpenIssue(); if (!issue) return setStatus($('returnStatus'), 'Select an open issue.', 'error');
    const raw = returnPayload(); const checked = C.validateReturnRequest(raw, issue);
    if (!checked.ok) return setStatus($('returnStatus'), checked.errors.join(' '), 'error');
    const button = $('returnForm').querySelector('button[type=submit]'); button.disabled = true;
    try {
      await state.db.ref(`cncManager/returnRequests/${state.user.uid}/${C.safeKey(raw.requestId)}`).set({ ...checked.value, ownerUid: state.user.uid, operatorCode: state.profile.operatorCode, status: 'PENDING', requestedAt: firebase.database.ServerValue.TIMESTAMP, clientVersion: C.VERSION });
      const message = checked.needsApproval ? 'Exception sent for supervisor approval.' : raw.action === 'INDEX' ? 'INDEX request sent; the same insert remains open.' : 'Return submitted. Chute sensor/supervisor verification is required before closure.';
      setStatus($('returnStatus'), message, 'ok');
    } catch (error) { setStatus($('returnStatus'), error.message, 'error'); }
    finally { button.disabled = false; }
  }

  function partEditor(job, part) {
    const optional = part > 1; const machines = machineOptions(); const sideNames = { 'SIDE-1': 'SIDE 1 — First side', 'SIDE-2': 'SIDE 2 — Second side', 'SIDE-3': 'SIDE 3 — Third side', 'SIDE-4': 'SIDE 4 — Fourth side' }; const sides = C.PART_SIDES.map(side => `<option value="${side}">${sideNames[side]}</option>`).join('');
    return `<div class="part-operation" id="job${job}Part${part}Card">
      <div class="part-heading"><strong>Part / Operation ${part}</strong>${optional ? `<label class="check-label"><input id="job${job}Part${part}Enabled" type="checkbox"> இந்த Part உள்ளது</label>` : `<input id="job${job}Part${part}Enabled" type="checkbox" checked hidden>`}</div>
      <div class="form-grid three part-fields">
        <div class="field"><label for="job${job}Part${part}No">Part number</label><input id="job${job}Part${part}No" maxlength="100"></div>
        <div class="field"><label for="job${job}Part${part}Machine">Machine</label><select id="job${job}Part${part}Machine">${machines}</select></div>
        <div class="field"><label for="job${job}Part${part}Side">Side</label><select id="job${job}Part${part}Side">${sides}</select></div>
        <div class="field"><label for="job${job}Part${part}Cycle">Actual cycle minutes</label><input id="job${job}Part${part}Cycle" type="number" min="0.001" step="0.001" data-estimated-cycle=""><small class="hint">Assigned target உடன் தானாக ஒப்பிடப்படும்.</small></div>
        <div class="field"><label for="job${job}Part${part}Rpm">RPM</label><input id="job${job}Part${part}Rpm" type="number" min="1" max="100000" step="1"></div>
        <input id="job${job}Part${part}Rate" type="hidden" value="0">
        <div class="field"><label for="job${job}Part${part}Program">Program number</label><input id="job${job}Part${part}Program" maxlength="80"></div>
      </div>
      <div id="job${job}Part${part}RatePreview" class="rate-preview notice">Assigned target மற்றும் actual cycle இங்கே ஒப்பிடப்படும்.</div>
      <div class="screen-capture-row"><label class="camera-button" for="job${job}Part${part}Screen">📷 Machine screen photo</label><input class="screen-file" id="job${job}Part${part}Screen" type="file" accept="image/jpeg,image/png,image/webp" capture="environment"><label class="check-label"><input id="job${job}Part${part}OcrConfirmed" type="checkbox"> OCR Cycle/RPM பார்த்து உறுதி செய்தேன்</label></div>
      <div id="job${job}Part${part}OcrStatus" class="notice ocr-status" data-capture-id="" data-storage-path="" data-status="">Photo optional. எடுத்தால் OCR முடிந்ததும் values சரிபார்க்கவும்.</div><div id="job${job}Part${part}Preview" class="screen-preview"></div>
    </div>`;
  }

  function insertEditor(job) {
    return `<div class="insert-usage"><div class="field"><label for="job${job}InsertUsed">இந்த Job-ல் insert பயன்படுத்தினீர்களா?</label><select id="job${job}InsertUsed"><option value="false">இல்லை — No insert used</option><option value="true">ஆம் — Link issued insert</option></select></div><div id="job${job}InsertSlots" class="insert-slot-grid">${[1, 2, 3, 4, 5, 6].map(slot => `<div class="field"><label for="job${job}Insert${slot}Issue">Insert slot ${slot}</label><select id="job${job}Insert${slot}Issue" class="job-insert-issue" data-job="${job}" data-slot="${slot}"><option value="">Not used</option></select></div>`).join('')}</div></div>`;
  }

  function createJobEditors() {
    const routes = C.ROUTES.map(route => `<option value="${route}">${C.escapeHtml(C.routeLabel(route))}</option>`).join('');
    const clock = (index, kind, label) => `<div class="field"><label class="required" for="job${index}${kind}Time">${label}</label><div class="time-pair"><input id="job${index}${kind}Time" inputmode="numeric" maxlength="5" pattern="(0[1-9]|1[0-2]):[0-5][0-9]" placeholder="08:30"><select id="job${index}${kind}Period" aria-label="${label} AM or PM"><option>AM</option><option>PM</option></select></div></div>`;
    const sides = index => `<div class="side-process-grid">${[1, 2, 3, 4].map(side => `<div class="side-process"><strong>Side ${side}</strong><select id="job${index}Side${side}Route" aria-label="Job ${index} Side ${side} route">${routes}</select><label class="check-label"><input id="job${index}Side${side}Complete" type="checkbox"> Route complete</label></div>`).join('')}</div>`;
    $('jobEditors').innerHTML = [1, 2, 3].map(index => `<div class="job-editor" id="job${index}Card"><div class="job-heading"><h4>Job ${index}</h4><span id="job${index}Status" class="status warn">WORK RUNNING</span></div><div class="form-grid three">
      <div class="field"><label class="required" for="job${index}Batch">Assigned production batch</label><select id="job${index}Batch" class="job-batch-select" data-job="${index}"><option value="">Select assigned production batch</option></select></div><div class="field"><label for="job${index}Name">Job / Component</label><input id="job${index}Name" maxlength="120" readonly></div><div class="field"><label class="required" for="job${index}WorkMachine">இந்த Job-ல் இன்று இயக்கிய machine</label><select id="job${index}WorkMachine">${machineOptions()}</select></div>${clock(index, 'In', 'Job In — 12 hour')}${clock(index, 'Out', 'Job Out — 12 hour')}
      <div class="field"><label for="job${index}Actual">Actual finished parts</label><input id="job${index}Actual" type="number" min="0" step="1"></div><div class="field"><label for="job${index}Good">Good parts</label><input id="job${index}Good" type="number" min="0" step="1"></div><div class="field"><label for="job${index}Reject">Rejected parts</label><input id="job${index}Reject" type="number" min="0" step="1"></div><div class="field"><label for="job${index}Coolant">Coolant count</label><input id="job${index}Coolant" type="number" min="0" step="1" value="0"></div><div class="field"><label for="job${index}Oil">Oil count</label><input id="job${index}Oil" type="number" min="0" step="1" value="0"></div>
    </div><h5>Part / Side machine operations & cycle comparison</h5><div class="part-operation-list">${[1, 2, 3, 4].map(part => partEditor(index, part)).join('')}</div><div id="job${index}RateSummary" class="summary-strip job-rate-summary hidden"></div>${insertEditor(index)}<p class="muted process-help">தேவையான Side route-கள் அனைத்தும் முடிந்ததும் மட்டும் complete குறிக்கவும்.</p>${sides(index)}</div>`).join('');
    $('jobEditors').querySelectorAll('input:not(.screen-file),select').forEach(input => input.addEventListener('input', updateReportTotals));
    $('jobEditors').querySelectorAll('select,input[type=checkbox]').forEach(input => input.addEventListener('change', () => { updateJobControls(); updateReportTotals(); }));
    $('jobEditors').querySelectorAll('.screen-file').forEach(input => input.addEventListener('change', async () => { const file = input.files[0]; if (file) await captureMachineScreen(Number(input.id.match(/^job([1-3])/)[1]), Number(input.id.match(/Part([1-4])/)[1]), file); input.value = ''; }));
    $('jobEditors').querySelectorAll('.job-batch-select').forEach(select => select.addEventListener('change', () => applyBatchToDaily(Number(select.dataset.job))));
    updateJobControls(); refreshJobInsertOptions(); refreshJobBatchOptions();
  }

  function refreshJobInsertOptions() {
    const issues = values(state.issues).sort((a, b) => C.number(b.issuedAt) - C.number(a.issuedAt)).slice(0, 200);
    document.querySelectorAll('.job-insert-issue').forEach(select => {
      const selected = select.value || select.dataset.selectedIssue || '';
      select.innerHTML = '<option value="">Not used</option>' + issues.map(issue => `<option value="${C.escapeHtml(issue.issueId)}">${C.escapeHtml(issue.sku)} · ${C.escapeHtml(issue.machine)} · ${C.escapeHtml(issue.job)} · ${issue.status}</option>`).join('');
      if ([...select.options].some(option => option.value === selected)) { select.value = selected; select.dataset.selectedIssue = ''; }
    });
  }

  function updateJobControls() {
    for (let job = 1; job <= 3; job += 1) {
      for (let part = 2; part <= 4; part += 1) {
        const enabled = $(`job${job}Part${part}Enabled`).checked;
        $(`job${job}Part${part}Card`).classList.toggle('disabled-card', !enabled);
        $(`job${job}Part${part}Card`).querySelectorAll('.part-fields input,.part-fields select,.screen-file').forEach(input => { input.disabled = !enabled; });
        $(`job${job}Part${part}OcrConfirmed`).disabled = !enabled;
      }
      const insertUsed = $(`job${job}InsertUsed`).value === 'true'; $(`job${job}InsertSlots`).classList.toggle('disabled-card', !insertUsed);
      $(`job${job}InsertSlots`).querySelectorAll('select').forEach(select => { select.disabled = !insertUsed; });
    }
  }

  function partScreenCapture(job, part) {
    const status = $(`job${job}Part${part}OcrStatus`); if (!status.dataset.captureId) return null;
    return { captureId: status.dataset.captureId, storagePath: status.dataset.storagePath, status: status.dataset.status, confirmed: $(`job${job}Part${part}OcrConfirmed`).checked, extractedCycleMinutes: C.number(status.dataset.cycleMinutes), extractedRpm: C.number(status.dataset.rpm) };
  }

  function collectJobs() {
    return [1, 2, 3].map(index => {
      const parts = [1, 2, 3, 4].filter(part => part === 1 || $(`job${index}Part${part}Enabled`).checked).map(part => ({ number: part, partNo: $(`job${index}Part${part}No`).value, machine: $(`job${index}Part${part}Machine`).value, side: $(`job${index}Part${part}Side`).value, cycleMinutes: $(`job${index}Part${part}Cycle`).value, estimatedCycleMinutes: $(`job${index}Part${part}Cycle`).dataset.estimatedCycle, rpm: $(`job${index}Part${part}Rpm`).value, sideRate: $(`job${index}Part${part}Rate`).value, programNo: $(`job${index}Part${part}Program`).value, screenCapture: partScreenCapture(index, part) }));
      const insertUsed = $(`job${index}InsertUsed`).value === 'true'; const insertUsages = insertUsed ? [1, 2, 3, 4, 5, 6].map(slot => { const issueId = $(`job${index}Insert${slot}Issue`).value; const issue = state.issues[issueId] || {}; return { slot, issueId, sku: issue.sku || '' }; }).filter(row => row.issueId) : [];
      const batchId = $(`job${index}Batch`).value; const batch = state.batches[batchId] || {}; const job = { number: index, batchId, companyId: batch.companyId || '', companyName: batch.companyName || '', jobMasterId: batch.jobMasterId || '', name: $(`job${index}Name`).value, partNo: parts[0]?.partNo || '', workMachine: $(`job${index}WorkMachine`).value, inTime: $(`job${index}InTime`).value, inPeriod: $(`job${index}InPeriod`).value, outTime: $(`job${index}OutTime`).value, outPeriod: $(`job${index}OutPeriod`).value, cycleMinutes: parts[0]?.cycleMinutes || 0, actual: $(`job${index}Actual`).value, good: $(`job${index}Good`).value, rejected: $(`job${index}Reject`).value, coolantCount: $(`job${index}Coolant`).value, oilCount: $(`job${index}Oil`).value, parts, insertUsed, insertUsages };
      [1, 2, 3, 4].forEach(side => { job[`side${side}Route`] = $(`job${index}Side${side}Route`).value; job[`side${side}Complete`] = $(`job${index}Side${side}Complete`).checked; }); return job;
    }).filter(job => [job.name, job.inTime, job.outTime, job.actual, job.parts[0]?.partNo].some(value => String(value || '').trim()));
  }

  function durationLabel(minutes) {
    const total = Math.max(0, Math.round(C.number(minutes))); const hours = Math.floor(total / 60); const mins = total % 60;
    return `${hours}h ${String(mins).padStart(2, '0')}m`;
  }

  function updateReportTotals() {
    const jobs = collectJobs(); const totals = C.reportTotals({ jobs, machine: $('reportMachine')?.value }); const percent = totals.target > 0 ? totals.actual / totals.target * 100 : 0; const cycleAlerts = jobs.flatMap(job => job.parts || []).filter(part => C.cyclePerformance(part.estimatedCycleMinutes, part.cycleMinutes).improvementRequired).length;
    const reportMachines = [...new Set(jobs.map(job => job.workMachine).filter(Boolean))]; $('reportTotals').innerHTML = `<span>Machines: <b>${C.escapeHtml(reportMachines.join(' + ') || '—')} (${reportMachines.length}/${C.MAX_OPERATOR_MACHINES})</b></span><span>Presence: <b>${durationLabel(totals.presenceMinutes)}</b></span><span>Actual break: <b>${durationLabel(totals.breakMinutes)}</b></span><span>Operator net active: <b>${durationLabel(totals.netActiveMinutes)}</b></span><span>Machine run total: <b>${durationLabel(totals.machineActiveMinutes)}</b></span><span>Part operations: <b>${totals.partOperations}</b></span><span>Linked inserts: <b>${totals.linkedInserts}</b></span><span>Target output: <b>${totals.target.toFixed(1)}</b></span><span>Actual: <b>${totals.actual}</b></span><span>Good / Reject: <b>${totals.good} / ${totals.rejected}</b></span><span>Performance: <b>${percent.toFixed(1)}%</b></span><span>Cycle improvement alerts: <b class="${cycleAlerts ? 'badtxt' : ''}">${cycleAlerts}</b></span>`;
    for (let index = 1; index <= 3; index += 1) {
      const job = jobs.find(row => row.number === index) || {}; const element = $(`job${index}Status`); const status = C.jobProcessStatus(job);
      if (job.batchId && [...$(`job${index}Batch`).options].some(option => option.value === job.batchId)) $(`job${index}Batch`).value = job.batchId;
      element.textContent = status; element.className = `status ${status === 'JOB COMPLETE' ? 'ok' : 'warn'}`;
      for (let part = 1; part <= 4; part += 1) {
        const preview = $(`job${index}Part${part}RatePreview`); if (!preview) continue;
        const target = C.number($(`job${index}Part${part}Cycle`).dataset.estimatedCycle); const actual = C.number($(`job${index}Part${part}Cycle`).value); const performance = C.cyclePerformance(target, actual); const detail = performance.status === 'NOT RECORDED' ? 'Assigned batch மற்றும் actual cycle தேவை.' : `Target ${target.toFixed(3)} min · Actual ${actual.toFixed(3)} min · Difference ${performance.varianceMinutes >= 0 ? '+' : ''}${performance.varianceMinutes.toFixed(3)} min (${performance.variancePercent >= 0 ? '+' : ''}${performance.variancePercent.toFixed(1)}%) · ${performance.status}${performance.improvementRequired ? ' — Cycle time reduce / cause investigate செய்யவும்.' : ''}`;
        setStatus(preview, `${$(`job${index}Part${part}Side`).value}: ${detail}`, performance.improvementRequired ? 'error' : performance.status === 'WATCH' || performance.status === 'NOT RECORDED' ? 'warn' : 'ok');
      }
      [1, 2, 3, 4].forEach(side => {
        const route = $(`job${index}Side${side}Route`); const complete = $(`job${index}Side${side}Complete`);
        complete.disabled = route.value === 'NONE'; if (complete.disabled) complete.checked = false;
      });
    }
  }

  function clearReportJobs() {
    for (let index = 1; index <= 3; index += 1) {
      ['Name', 'WorkMachine', 'InTime', 'OutTime', 'Actual', 'Good', 'Reject'].forEach(field => { $(`job${index}${field}`).value = ''; });
      ['InPeriod', 'OutPeriod'].forEach(field => { $(`job${index}${field}`).value = 'AM'; });
      ['Coolant', 'Oil'].forEach(field => { $(`job${index}${field}`).value = '0'; });
      for (let part = 1; part <= 4; part += 1) {
        $(`job${index}Part${part}Enabled`).checked = part === 1; $(`job${index}Part${part}No`).value = ''; $(`job${index}Part${part}Machine`).value = ''; $(`job${index}Part${part}Side`).value = `SIDE-${part}`; $(`job${index}Part${part}Cycle`).value = ''; $(`job${index}Part${part}Cycle`).dataset.estimatedCycle = ''; $(`job${index}Part${part}Rpm`).value = ''; $(`job${index}Part${part}Rate`).value = '0'; $(`job${index}Part${part}Program`).value = ''; $(`job${index}Part${part}OcrConfirmed`).checked = false;
        const ocr = $(`job${index}Part${part}OcrStatus`); ocr.dataset.captureId = ''; ocr.dataset.storagePath = ''; ocr.dataset.status = ''; ocr.dataset.cycleMinutes = ''; ocr.dataset.rpm = ''; ocr.dataset.appliedAt = ''; ocr.dataset.requestedAt = ''; setStatus(ocr, 'Photo optional. எடுத்தால் OCR முடிந்ததும் values சரிபார்க்கவும்.', ''); $(`job${index}Part${part}Preview`).innerHTML = '';
      }
      $(`job${index}InsertUsed`).value = 'false'; for (let slot = 1; slot <= 6; slot += 1) { const select = $(`job${index}Insert${slot}Issue`); select.value = ''; select.dataset.selectedIssue = ''; }
      [1, 2, 3, 4].forEach(side => { $(`job${index}Side${side}Route`).value = 'NONE'; $(`job${index}Side${side}Complete`).checked = false; });
      $(`job${index}Status`).textContent = 'WORK RUNNING'; $(`job${index}Status`).className = 'status warn';
    }
    $('reportNote').value = ''; updateJobControls(); updateReportTotals();
  }

  function loadReport(date) {
    const report = state.reports[date]; clearReportJobs();
    if (!report) { setStatus($('reportStatus'), 'No report yet for this date. Saving creates the single daily record.', ''); return; }
    $('reportMachine').value = report.machine || ''; $('reportShift').value = report.shift || state.profile.shift || 'A'; $('reportNote').value = report.note || '';
    C.asArray(report.jobs).slice(0, 3).forEach((raw, offset) => {
      const job = C.normalizeJob(raw, offset); const index = [1, 2, 3].includes(job.number) ? job.number : offset + 1;
      $(`job${index}Batch`).dataset.selectedBatch = job.batchId || '';
      $(`job${index}Name`).value = job.name || '';
      $(`job${index}WorkMachine`).value = job.workMachine || job.parts[0]?.machine || '';
      $(`job${index}InTime`).value = job.inTime || ''; $(`job${index}InPeriod`).value = job.inPeriod || 'AM';
      $(`job${index}OutTime`).value = job.outTime || ''; $(`job${index}OutPeriod`).value = job.outPeriod || 'AM';
      $(`job${index}Actual`).value = job.actual || ''; $(`job${index}Good`).value = job.good || ''; $(`job${index}Reject`).value = job.rejected || '';
      $(`job${index}Coolant`).value = job.coolantCount || '0'; $(`job${index}Oil`).value = job.oilCount || '0';
      job.parts.slice(0, 4).forEach((part, partOffset) => { const partIndex = [1, 2, 3, 4].includes(part.number) ? part.number : partOffset + 1; $(`job${index}Part${partIndex}Enabled`).checked = true; $(`job${index}Part${partIndex}No`).value = part.partNo || ''; $(`job${index}Part${partIndex}Machine`).value = part.machine || ''; $(`job${index}Part${partIndex}Side`).value = part.side || `SIDE-${partIndex}`; $(`job${index}Part${partIndex}Cycle`).value = part.cycleMinutes || ''; $(`job${index}Part${partIndex}Cycle`).dataset.estimatedCycle = part.estimatedCycleMinutes || ''; $(`job${index}Part${partIndex}Rpm`).value = part.rpm || ''; $(`job${index}Part${partIndex}Rate`).value = part.sideRate || '0'; $(`job${index}Part${partIndex}Program`).value = part.programNo || ''; if (part.screenCapture) { const ocr = $(`job${index}Part${partIndex}OcrStatus`); ocr.dataset.captureId = part.screenCapture.captureId || ''; ocr.dataset.storagePath = part.screenCapture.storagePath || ''; ocr.dataset.status = part.screenCapture.status || ''; ocr.dataset.cycleMinutes = part.screenCapture.extractedCycleMinutes || ''; ocr.dataset.rpm = part.screenCapture.extractedRpm || ''; ocr.dataset.appliedAt = String(part.screenCapture.processedAt || 'saved'); $(`job${index}Part${partIndex}OcrConfirmed`).checked = part.screenCapture.confirmed === true; setStatus(ocr, `Saved screen OCR: ${part.screenCapture.status}. Values were confirmed.`, 'ok'); showStoredScreen(index, partIndex, part.screenCapture.storagePath); } });
      $(`job${index}InsertUsed`).value = String(job.insertUsed === true); job.insertUsages.slice(0, 6).forEach((usage, usageIndex) => { const select = $(`job${index}Insert${usageIndex + 1}Issue`); select.dataset.selectedIssue = usage.issueId; });
      [1, 2, 3, 4].forEach(side => { $(`job${index}Side${side}Route`).value = job[`side${side}Route`] || 'NONE'; $(`job${index}Side${side}Complete`).checked = job[`side${side}Complete`] === true; });
    });
    refreshJobInsertOptions(); refreshJobBatchOptions(); updateJobControls(); updateReportTotals(); setStatus($('reportStatus'), `Existing ${date} report loaded. Saving will update this record, not create a duplicate.`, 'warn');
  }

  async function saveReport(event) {
    event.preventDefault();
    const checked = C.validateDailyReport({ date: $('reportDate').value, operatorCode: state.profile.operatorCode, machine: $('reportMachine').value, shift: $('reportShift').value, jobs: collectJobs(), dailySalary: state.profile.dailySalary || 0, note: $('reportNote').value });
    if (!checked.ok) return setStatus($('reportStatus'), checked.errors.join(' '), 'error');
    if (checked.value.jobs.some(job => !job.batchId || !state.batches[job.batchId])) return setStatus($('reportStatus'), 'ஒவ்வொரு Job-க்கும் உங்களுக்கு ஒதுக்கப்பட்ட production batch தேர்வு செய்ய வேண்டும்.', 'error');
    const record = { ...checked.value, requestId: C.newId('REPORT'), ownerUid: state.user.uid, operatorName: state.profile.displayName || state.user.displayName || '', status: 'PENDING', requestedAt: firebase.database.ServerValue.TIMESTAMP, clientVersion: C.VERSION };
    const button = $('reportForm').querySelector('button[type=submit]'); button.disabled = true;
    try { await state.db.ref(`cncManager/reportRequests/${state.user.uid}/${checked.value.date}`).set(record); setStatus($('reportStatus'), `${checked.value.date} report submitted. Backend is verifying Part 1–4, OCR confirmation, insert links, clock gaps and totals.`, 'warn'); }
    catch (error) { setStatus($('reportStatus'), error.message, 'error'); }
    finally { button.disabled = false; }
  }

  async function captureMachineScreen(job, part, file) {
    const status = $(`job${job}Part${part}OcrStatus`); const type = String(file.type || '').toLowerCase();
    if (!/^image\/(jpeg|png|webp)$/.test(type) || file.size > 10 * 1024 * 1024) return setStatus(status, 'JPG/PNG/WebP photo மட்டும்; அதிகபட்சம் 10 MB.', 'error');
    const captureId = C.safeKey(C.newId('SCREEN')); const safeName = String(file.name || `screen-${Date.now()}.jpg`).replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 120); const storagePath = `cncManager/jobScreens/${state.user.uid}/${captureId}/${safeName}`; const ref = state.storage.ref(storagePath);
    setStatus(status, 'Photo upload ஆகிறது…', 'warn');
    try {
      const previewUrl = URL.createObjectURL(file); $(`job${job}Part${part}Preview`).innerHTML = `<img src="${previewUrl}" alt="Machine screen preview">`; $(`job${job}Part${part}Preview`).querySelector('img').addEventListener('load', () => URL.revokeObjectURL(previewUrl), { once: true });
      await ref.put(file, { contentType: type, customMetadata: { ownerUid: state.user.uid, captureId, uploadedBy: state.user.uid, jobNumber: String(job), partNumber: String(part) } });
      status.dataset.captureId = captureId; status.dataset.storagePath = storagePath; status.dataset.status = 'PENDING'; status.dataset.appliedAt = ''; status.dataset.requestedAt = String(Date.now()); $(`job${job}Part${part}OcrConfirmed`).checked = false;
      await state.db.ref(`cncManager/screenOcrRequests/${state.user.uid}/${captureId}`).set({ captureId, ownerUid: state.user.uid, storagePath, reportDate: $('reportDate').value, jobNumber: job, partNumber: part, status: 'PENDING', requestedAt: firebase.database.ServerValue.TIMESTAMP, clientVersion: C.VERSION }); setStatus(status, 'OCR queued. Cycle Time மற்றும் RPM வந்ததும் இங்கே நிரம்பும்.', 'warn');
    } catch (error) { await ref.delete().catch(() => {}); setStatus(status, `Screen OCR request failed: ${error.message}`, 'error'); }
  }

  async function showStoredScreen(job, part, storagePath) {
    if (!storagePath) return;
    try { const url = await state.storage.ref(storagePath).getDownloadURL(); $(`job${job}Part${part}Preview`).innerHTML = `<img src="${C.escapeHtml(url)}" alt="Saved machine screen">`; }
    catch (error) { console.warn('Stored machine screen preview unavailable', error); }
  }

  function renderOcrRequests() {
    values(state.ocrRequests).sort((a, b) => C.number(a.requestedAt) - C.number(b.requestedAt)).forEach(request => {
      if (request.reportDate !== $('reportDate')?.value) return;
      const job = Number(request.jobNumber); const part = Number(request.partNumber); const status = $(`job${job}Part${part}OcrStatus`); if (!status) return;
      if (!status.dataset.captureId || C.number(request.requestedAt) > C.number(status.dataset.requestedAt)) { status.dataset.captureId = request.captureId; status.dataset.storagePath = request.storagePath; status.dataset.requestedAt = request.requestedAt; status.dataset.appliedAt = ''; $(`job${job}Part${part}Enabled`).checked = true; showStoredScreen(job, part, request.storagePath); updateJobControls(); }
      if (status.dataset.captureId !== request.captureId) return;
      status.dataset.status = request.status || ''; status.dataset.cycleMinutes = request.cycleMinutes ?? ''; status.dataset.rpm = request.rpm ?? '';
      if (['COMPLETE', 'NEEDS_REVIEW'].includes(request.status) && status.dataset.appliedAt !== String(request.processedAt || 'done')) {
        if (request.cycleMinutes != null) $(`job${job}Part${part}Cycle`).value = request.cycleMinutes;
        if (request.rpm != null) $(`job${job}Part${part}Rpm`).value = request.rpm;
        status.dataset.appliedAt = String(request.processedAt || 'done'); $(`job${job}Part${part}OcrConfirmed`).checked = false; updateReportTotals();
      }
      const complete = request.status === 'COMPLETE'; setStatus(status, `${request.status}: ${request.cycleMinutes != null ? `Cycle ${request.cycleMinutes} min` : 'Cycle not read'} · ${request.rpm != null ? `RPM ${request.rpm}` : 'RPM not read'}. ${request.error || 'Values பார்த்து confirm செய்யவும்.'}`, complete ? 'ok' : /PENDING|PROCESSING/.test(request.status) ? 'warn' : 'error');
    });
  }

  function applyVoiceCommand() {
    const parsed = C.parseVoiceCommand($('voiceTranscript').value); if (!parsed.ok) return setStatus($('voiceEntryStatus'), parsed.error, 'error');
    const { jobNumber: job, partNumber: part } = parsed.fields; if (part > 1) $(`job${job}Part${part}Enabled`).checked = true;
    const mappings = [['machine', 'Machine'], ['side', 'Side'], ['cycleMinutes', 'Cycle'], ['rpm', 'Rpm'], ['sideRate', 'Rate'], ['programNo', 'Program'], ['partNo', 'No']]; const changed = [];
    mappings.forEach(([key, suffix]) => { const value = parsed.fields[key]; if (value !== '' && value != null) { $(`job${job}Part${part}${suffix}`).value = value; changed.push(`${key}: ${value}`); } });
    updateJobControls(); updateReportTotals(); $(`job${job}Part${part}Card`).scrollIntoView({ behavior: 'smooth', block: 'center' }); setStatus($('voiceEntryStatus'), `Job ${job} Part ${part}-ல் ${changed.join(', ')} நிரப்பப்பட்டது. Save முன் சரிபார்க்கவும்.`, 'ok');
  }

  function startVoiceEntry() {
    const Recognition = globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition;
    if (!Recognition) return setStatus($('voiceEntryStatus'), 'இந்த browser-ல் voice recognition இல்லை. அதே command-ஐ type செய்து Apply command அழுத்தவும்.', 'error');
    if (state.speechRecognition) state.speechRecognition.abort(); const recognition = new Recognition(); state.speechRecognition = recognition; recognition.lang = $('voiceLanguage').value; recognition.continuous = false; recognition.interimResults = false; recognition.maxAlternatives = 1;
    recognition.addEventListener('start', () => setStatus($('voiceEntryStatus'), 'Listening… Job, Part/Side, Machine, Cycle, RPM சொல்லவும்.', 'warn'));
    recognition.addEventListener('result', event => { const transcript = event.results[0][0].transcript; $('voiceTranscript').value = transcript; applyVoiceCommand(); });
    recognition.addEventListener('error', event => setStatus($('voiceEntryStatus'), `Voice error: ${event.error}. Command-ஐ type செய்து Apply செய்யலாம்.`, 'error'));
    recognition.addEventListener('end', () => { state.speechRecognition = null; }); recognition.start();
  }

  function renderRequests() {
    const latestIssue = values(state.issueRequests).sort((a, b) => C.number(b.requestedAt) - C.number(a.requestedAt))[0];
    if (latestIssue && latestIssue.status !== 'PENDING') setStatus($('issueStatus'), `Latest issue: ${latestIssue.status}${latestIssue.error ? ` — ${latestIssue.error}` : ''}`, /APPROVED|DISPENSED|PROCESSED/.test(latestIssue.status) ? 'ok' : /PENDING|AWAITING|PROCESSING/.test(latestIssue.status) ? 'warn' : 'error');
    const latestReturn = values(state.returnRequests).sort((a, b) => C.number(b.requestedAt) - C.number(a.requestedAt))[0];
    if (latestReturn && latestReturn.status !== 'PENDING') setStatus($('returnStatus'), `Latest return: ${latestReturn.status}${latestReturn.error ? ` — ${latestReturn.error}` : ''}`, /APPROVED|CLOSED|INDEXED|PROCESSED/.test(latestReturn.status) ? 'ok' : /AWAITING|PENDING/.test(latestReturn.status) ? 'warn' : 'error');
    const date = $('reportDate')?.value; const report = date ? state.reportRequests[date] : null;
    if (report) setStatus($('reportStatus'), `Report ${date}: ${report.status}${report.error ? ` — ${report.error}` : report.submittedLate ? ' — submitted after configured deadline' : ''}`, report.status === 'PROCESSED' ? 'ok' : /PENDING|PROCESSING/.test(report.status) ? 'warn' : 'error');
  }

  function renderHistory() {
    const issues = values(state.issues).sort((a, b) => C.number(b.issuedAt) - C.number(a.issuedAt));
    $('issueHistoryRows').innerHTML = issues.map(row => { const metrics = row.lifeMetrics || C.lifeMetrics({ ...(row.metrics || {}), quantity: row.quantity, consumedQuantity: row.consumedQuantity, unitValue: row.unitValue }); return `<tr><td data-label="Date">${stamp(row.issuedAt)}</td><td data-label="Machine">${C.escapeHtml(row.machine)}</td><td data-label="SKU"><b>${C.escapeHtml(row.sku)}</b></td><td data-label="Qty">${C.number(row.quantity)}</td><td data-label="Status">${badge(row.status)} ${C.escapeHtml(row.returnAction || '')}</td><td data-label="Life">${metrics.goodPartsPerEdge.toFixed(1)} good/edge · ${metrics.cuttingMinutesPerEdge.toFixed(1)} min/edge</td></tr>`; }).join('') || emptyRow(6, 'No issue history.');
    const reports = Object.entries(state.reports || {}).map(([key, row]) => ({ _key: key, ...(row || {}) })).sort((a, b) => String(b.date).localeCompare(String(a.date)));
    $('myReportRows').innerHTML = reports.map(row => { const totals = C.reportTotals(row); const normalized = C.asArray(row.jobs).map((raw, index) => C.normalizeJob(raw, index)); const machines = [...new Set(normalized.map(job => job.workMachine).filter(Boolean))]; const jobs = normalized.map(job => { const parts = job.parts.map(part => { const performance = C.cyclePerformance(part.estimatedCycleMinutes, part.cycleMinutes); return `S${part.number} ${part.machine}: Target ${part.estimatedCycleMinutes || '—'} / Actual ${part.cycleMinutes || '—'} min · ${performance.status}`; }).join(' | '); return `${job.name}: ${parts} · Insert ${job.insertUsed ? job.insertUsages.map(usage => usage.sku).join(', ') : 'NOT USED'} · ${job.status || C.jobProcessStatus(job)}`; }).join(' / '); return `<tr><td data-label="Date">${C.escapeHtml(row.date)}</td><td data-label="Machine">${C.escapeHtml(machines.join(' + ') || row.machine)}</td><td data-label="Jobs / Status" class="wrap">${C.escapeHtml(jobs)}</td><td data-label="Presence / Break / Net">${durationLabel(totals.presenceMinutes)} / ${durationLabel(totals.breakMinutes)} / ${durationLabel(totals.netActiveMinutes)}</td><td data-label="Good / Rejected">${totals.good} / ${totals.rejected}</td><td data-label="Action"><button class="edit-report" data-date="${row.date}">Edit</button></td></tr>`; }).join('') || emptyRow(6, 'No daily reports.');
    document.querySelectorAll('.edit-report').forEach(button => button.addEventListener('click', () => { $('reportDate').value = button.dataset.date; loadReport(button.dataset.date); showPage('daily'); }));
  }

  function renderNotices() {
    $('operatorNotices').innerHTML = Object.entries(state.notices || {}).map(([key, row]) => ({ _key: key, ...(row || {}) })).sort((a, b) => C.number(b.createdAt) - C.number(a.createdAt)).map(row => {
      const url = /^https:\/\//.test(String(row.attachment?.downloadUrl || '')) ? row.attachment.downloadUrl : '';
      const media = url && String(row.attachment?.contentType || '').startsWith('image/') ? `<img class="notice-image" src="${C.escapeHtml(url)}" alt="Factory notice attachment" loading="lazy">` : url && String(row.attachment?.contentType || '').startsWith('audio/') ? `<audio controls preload="none" src="${C.escapeHtml(url)}"></audio>` : '';
      return `<article class="card"><small class="muted">${stamp(row.createdAt)}</small><p>${C.escapeHtml(row.text)}</p>${media}<div class="actions"><button class="share-notice" data-id="${C.escapeHtml(row._key)}">Share / Copy</button><button class="sms-notice" data-id="${C.escapeHtml(row._key)}">SMS</button></div></article>`;
    }).join('') || '<div class="card empty">No notices.</div>';
    document.querySelectorAll('.share-notice').forEach(button => button.addEventListener('click', () => shareNotice(button.dataset.id, false)));
    document.querySelectorAll('.sms-notice').forEach(button => button.addEventListener('click', () => shareNotice(button.dataset.id, true)));
  }

  async function shareNotice(key, sms) {
    const row = state.notices[key]; if (!row) return; const url = /^https:\/\//.test(String(row.attachment?.downloadUrl || '')) ? row.attachment.downloadUrl : '';
    const message = `${row.text || ''}${url ? `\n${url}` : ''}`;
    if (sms) { location.href = `sms:?&body=${encodeURIComponent(message)}`; return; }
    try {
      if (navigator.share) await navigator.share({ title: 'CNC Factory Notice', text: row.text || '', url: url || undefined });
      else { await navigator.clipboard.writeText(message); alert('Notice copied to clipboard.'); }
    } catch (error) { if (error.name !== 'AbortError') alert(`Share failed: ${error.message}`); }
  }

  function listen(path, target, render) {
    state.db.ref(path).on('value', snapshot => { state[target] = snapshot.val() || {}; render?.(); }, error => setStatus($('globalStatus'), error.message, 'error'));
  }

  function setupListeners() {
    const base = 'cncManager'; const uid = state.user.uid;
    listen(`${base}/publicMaster/inserts`, 'inserts', renderMasters); listen(`${base}/publicInventory`, 'inventory', renderMasters);
    state.db.ref(`${base}/operatorAssignments/${uid}`).on('value', snapshot => { state.batches = snapshot.val() || {}; state.assignmentsLoaded = true; renderProductionBatches(); renderIssueMachines(); }, error => setStatus($('globalStatus'), error.message, 'error')); listen(`${base}/batchUpdateRequests/${uid}`, 'batchRequests', renderBatchRequests);
    listen(`${base}/operatorData/${uid}/issues`, 'issues', () => { renderOpenIssues(); refreshJobInsertOptions(); }); listen(`${base}/operatorReportViews/${uid}`, 'reports', () => { renderHistory(); loadReport($('reportDate').value); });
    listen(`${base}/publicMachineState`, 'machineState', () => { renderIssueMachines(); renderOpenIssues(); });
    listen(`${base}/reportRequests/${uid}`, 'reportRequests', renderRequests);
    listen(`${base}/screenOcrRequests/${uid}`, 'ocrRequests', renderOcrRequests);
    listen(`${base}/issueRequests/${uid}`, 'issueRequests', renderRequests); listen(`${base}/returnRequests/${uid}`, 'returnRequests', renderRequests);
    listen(`${base}/publicNotices`, 'notices', renderNotices);
    setStatus($('globalStatus'), 'Firebase V37 live sync connected. அதிகபட்சம் 2 active machines மட்டும் அனுமதி.', 'ok'); $('appLoading').remove();
  }

  function setupForms() {
    $('issueMachine').innerHTML = machineOptions('', true); $('reportMachine').innerHTML = machineOptions(); $('reportDate').value = C.today(); $('reportShift').value = state.profile.shift || 'A'; $('reportShift').disabled = true; $('reportSalary').value = String(C.number(state.profile.dailySalary));
    createJobEditors(); updateReportTotals();
    $('issueSku').addEventListener('change', updateIssueSku); $('issueForm').addEventListener('submit', submitIssue);
    $('returnAction').addEventListener('change', updateReturnFields); $('returnIssue').addEventListener('change', updateLifePreview);
    ['returnGood', 'returnReject', 'returnMinutes', 'returnEdges', 'returnUnused'].forEach(id => $(id).addEventListener('input', updateLifePreview));
    $('returnForm').addEventListener('submit', submitReturn); $('reportForm').addEventListener('submit', saveReport); $('reportDate').addEventListener('change', () => { loadReport($('reportDate').value); renderRequests(); renderOcrRequests(); }); $('reportMachine').addEventListener('change', updateReportTotals);
    $('startVoiceEntry').addEventListener('click', startVoiceEntry); $('applyVoiceEntry').addEventListener('click', applyVoiceCommand);
    updateReturnFields();
  }

  async function start(context) {
    state.db = context.db; state.storage = firebase.storage(); state.user = context.user; state.profile = context.profile;
    setupNavigation();
    if (!context.profile.operatorCode) { setStatus($('globalStatus'), 'இந்த account-க்கு Operator Code mapping இல்லை. Admin-ஐ தொடர்பு கொள்ளவும்.', 'error'); document.querySelectorAll('form button[type=submit]').forEach(button => { button.disabled = true; }); return; }
    $('operatorIdentity').textContent = context.profile.displayName || context.user.displayName || context.user.email; $('operatorCodeLabel').textContent = `${context.profile.operatorCode} · Shift ${context.profile.shift || 'A'}`;
    setupForms(); setupListeners();
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('./service-worker.js?v=37.2', { updateViaCache: 'none' }).then(registration => registration.update()).catch(console.warn);
  }

  if (!C || !globalThis.CNCAuth) throw new Error('V37 core/auth scripts failed to load.');
  CNCAuth.requireRole('operator', start).catch(error => console.error('Operator bootstrap failed', error));
})();
