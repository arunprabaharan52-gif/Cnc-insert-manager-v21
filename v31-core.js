(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.CNCV37 = api; root.CNCV36 = api; root.CNCV35 = api; root.CNCV34 = api; root.CNCV33 = api; root.CNCV32 = api; root.CNCV31 = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const VERSION = '37.2';
  const ISSUE_MODES = Object.freeze(['ONE_PIECE', 'MULTI_PIECE']);
  const RETURN_ACTIONS = Object.freeze(['INDEX', 'REPLACE', 'PART_USED_RETURN', 'SCRAP_RETURN']);
  const EXCEPTION_CODES = Object.freeze(['FIRST_SETUP', 'BROKEN_PIECES', 'LOST', 'WRONG_ISSUE', 'TRIAL']);
  const ROUTES = Object.freeze(['NONE', 'CNC', 'VMC', 'VTL', 'CNC_VMC', 'CNC_VTL', 'VMC_VTL', 'CNC_VMC_VTL']);
  const JOB_STATUSES = Object.freeze(['WORK RUNNING', 'JOB COMPLETE']);
  const PART_SIDES = Object.freeze(['SIDE-1', 'SIDE-2', 'SIDE-3', 'SIDE-4']);
  const MACHINES = Object.freeze([
    { code: 'CNC-1', name: 'CNC 1', type: 'CNC' },
    { code: 'CNC-2', name: 'CNC 2', type: 'CNC' },
    { code: 'CNC-3', name: 'CNC 3', type: 'CNC' },
    { code: 'CNC-4', name: 'CNC 4', type: 'CNC' },
    { code: 'CNC-5', name: 'CNC 5', type: 'CNC' },
    { code: 'VMC-1', name: 'VMC 1', type: 'VMC' },
    { code: 'VTL-1', name: 'VTL 1', type: 'VTL' }
  ]);
  const DEFAULT_MACHINE_RATES = Object.freeze({
    'CNC-1': Object.freeze({ machine: 'CNC-1', minPerMinute: 6.6, maxPerMinute: 7.5 }),
    'CNC-2': Object.freeze({ machine: 'CNC-2', minPerMinute: 8, maxPerMinute: 9 }),
    'CNC-3': Object.freeze({ machine: 'CNC-3', minPerMinute: 5.5, maxPerMinute: 6.6 }),
    'CNC-4': Object.freeze({ machine: 'CNC-4', minPerMinute: 6.6, maxPerMinute: 7.5 }),
    'CNC-5': Object.freeze({ machine: 'CNC-5', minPerMinute: 6.6, maxPerMinute: 7.5 }),
    'VMC-1': Object.freeze({ machine: 'VMC-1', minPerMinute: 11.1, maxPerMinute: 13.3 }),
    'VTL-1': Object.freeze({ machine: 'VTL-1', minPerMinute: 13.3, maxPerMinute: 15.5 })
  });
  const OPERATION_STATES = Object.freeze(['PENDING', 'RUNNING', 'COMPLETE']);
  const MAX_OPERATOR_MACHINES = 2;

  function asArray(value) {
    return Array.isArray(value) ? value.filter(Boolean) : Object.values(value || {}).filter(Boolean);
  }

  function objectValues(value) {
    return value && typeof value === 'object' ? Object.values(value).filter(Boolean) : [];
  }

  function text(value, max = 160) {
    return String(value == null ? '' : value).trim().slice(0, max);
  }

  function number(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function whole(value) {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed >= 0;
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function today(date = new Date()) {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
    const value = Object.fromEntries(parts.map(part => [part.type, part.value]));
    return `${value.year}-${value.month}-${value.day}`;
  }

  function validIsoDate(value) {
    const raw = text(value, 10); if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return false;
    const [year, month, day] = raw.split('-').map(Number); const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  }

  function newId(prefix = 'EVT') {
    const random = globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function'
      ? globalThis.crypto.randomUUID().replace(/-/g, '').slice(0, 16)
      : Math.random().toString(36).slice(2, 12) + Date.now().toString(36);
    return `${prefix}-${Date.now()}-${random}`;
  }

  function safeKey(value) {
    return text(value, 180).replace(/[.#$\/\[\]]/g, '_');
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, char => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[char]);
  }

  function money(value) {
    return `₹${number(value).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  function normalizeMachineRate(raw = {}, machine = '') {
    return {
      machine: text(raw.machine || machine, 40).toUpperCase(),
      minPerMinute: Math.max(0, number(raw.minPerMinute)),
      maxPerMinute: Math.max(0, number(raw.maxPerMinute)),
      updatedAt: raw.updatedAt || ''
    };
  }

  function machineRateFor(rates = {}, machine = '') {
    const code = text(machine, 40).toUpperCase(); const fallback = DEFAULT_MACHINE_RATES[code] || { machine: code, minPerMinute: 0, maxPerMinute: 0 };
    const configured = rates?.[safeKey(code)] || rates?.[code];
    return normalizeMachineRate(configured || fallback, code);
  }

  function validateMachineRates(rawRates = {}) {
    const value = {}; const errors = [];
    MACHINES.forEach(machine => {
      const explicit = rawRates?.[safeKey(machine.code)] || rawRates?.[machine.code];
      const rate = machineRateFor(rawRates, machine.code); const label = machine.name;
      if (explicit && (!Number.isFinite(Number(explicit.minPerMinute)) || !Number.isFinite(Number(explicit.maxPerMinute)))) errors.push(`${label}: valid per-minute rates are required.`);
      if (explicit && (Number(explicit.minPerMinute) < 0 || Number(explicit.maxPerMinute) < 0)) errors.push(`${label}: rates cannot be negative.`);
      if ((rate.minPerMinute === 0) !== (rate.maxPerMinute === 0)) errors.push(`${label}: set both minimum and maximum, or keep both zero.`);
      if (rate.maxPerMinute > 0 && rate.maxPerMinute < rate.minPerMinute) errors.push(`${label}: maximum rate cannot be below minimum rate.`);
      value[safeKey(machine.code)] = rate;
    });
    return { ok: errors.length === 0, errors, value };
  }

  function partRateAnalysis(raw = {}, machineRates) {
    const machine = text(raw.machine, 40).toUpperCase(); const cycleMinutes = Math.max(0, number(raw.cycleMinutes)); const sideRate = Math.max(0, number(raw.sideRate));
    const snapshotAvailable = machineRates == null && (text(raw.rateCalculatedBy, 20).toUpperCase() === 'SERVER' || number(raw.machineRateMin) > 0 || number(raw.machineRateMax) > 0);
    const rate = snapshotAvailable ? normalizeMachineRate({ machine, minPerMinute: raw.machineRateMin, maxPerMinute: raw.machineRateMax }, machine) : machineRateFor(machineRates || {}, machine);
    const configured = rate.minPerMinute > 0 && rate.maxPerMinute >= rate.minPerMinute;
    const estimatedCostMin = configured ? cycleMinutes * rate.minPerMinute : 0; const estimatedCostMax = configured ? cycleMinutes * rate.maxPerMinute : 0;
    let rateStatus = 'RATE NOT SET';
    if (configured && cycleMinutes <= 0) rateStatus = 'CYCLE NOT SET';
    else if (configured && sideRate <= 0) rateStatus = 'QUOTE NOT SET';
    else if (configured && sideRate >= estimatedCostMax) rateStatus = 'PROFIT';
    else if (configured && sideRate >= estimatedCostMin) rateStatus = 'BORDERLINE';
    else if (configured) rateStatus = 'NOT SUITABLE';
    return { sideRate, machineRateMin: rate.minPerMinute, machineRateMax: rate.maxPerMinute, estimatedCostMin, estimatedCostMax, estimatedProfitMin: sideRate - estimatedCostMax, estimatedProfitMax: sideRate - estimatedCostMin, rateStatus };
  }

  function cyclePerformance(estimatedValue, actualValue) {
    const estimatedCycleMinutes = Math.max(0, number(estimatedValue)); const actualCycleMinutes = Math.max(0, number(actualValue));
    if (!(estimatedCycleMinutes > 0) || !(actualCycleMinutes > 0)) return { estimatedCycleMinutes, actualCycleMinutes, varianceMinutes: 0, variancePercent: 0, status: 'NOT RECORDED', improvementRequired: false };
    const varianceMinutes = actualCycleMinutes - estimatedCycleMinutes; const variancePercent = varianceMinutes / estimatedCycleMinutes * 100;
    const status = variancePercent <= 0 ? 'BETTER' : variancePercent <= 5 ? 'ON TARGET' : variancePercent <= 15 ? 'WATCH' : 'IMPROVEMENT REQUIRED';
    return { estimatedCycleMinutes, actualCycleMinutes, varianceMinutes, variancePercent, status, improvementRequired: status === 'IMPROVEMENT REQUIRED' };
  }

  function jobPlanningEstimate(raw = {}, machineRates = {}, inserts = {}) {
    const quantity = Math.max(0, Math.trunc(number(raw.quantity))); const availableMinutesPerDay = Math.max(1, number(raw.availableMinutesPerDay, 480)); const efficiencyPercent = Math.min(100, Math.max(1, number(raw.efficiencyPercent, 85))); const efficiency = efficiencyPercent / 100;
    const missing = []; const findInsert = sku => inserts?.[safeKey(sku)] || inserts?.[sku] || objectValues(inserts).find(row => text(row?.sku, 80).toUpperCase() === sku);
    if (!(quantity > 0)) missing.push('Quantity');
    const operations = asArray(raw.operations).slice(0, 4).map((source, index) => {
      const operation = normalizeOperation(source, index); const setupMinutes = Math.max(0, number(source.setupMinutes)); const runMinutes = quantity * operation.cycleMinutes; const elapsedMinutes = setupMinutes + (runMinutes / efficiency); const plannedDays = elapsedMinutes / availableMinutesPerDay; const rate = machineRateFor(machineRates, operation.machine); const rateReady = rate.minPerMinute > 0 && rate.maxPerMinute >= rate.minPerMinute;
      const machineCostMin = rateReady ? (setupMinutes + runMinutes) * rate.minPerMinute : 0; const machineCostMax = rateReady ? (setupMinutes + runMinutes) * rate.maxPerMinute : 0;
      const insertSku = text(source.insertSku, 80).toUpperCase(); const insert = insertSku ? findInsert(insertSku) : null; const edgesPerInsert = insert ? Math.max(0, Math.trunc(number(insert.edgesPerInsert))) : 0; const expectedPartsPerEdge = insert ? Math.max(0, Math.trunc(number(insert.expectedPartsPerEdge))) : 0; const partsPerInsert = edgesPerInsert * expectedPartsPerEdge; const requiredInserts = insertSku && partsPerInsert > 0 ? Math.ceil(quantity / partsPerInsert) : 0; const insertCost = requiredInserts * Math.max(0, number(insert?.unitValue));
      const toolName = text(source.toolName, 120); const holderName = text(source.holderName, 120); const toolQuantity = Math.max(0, Math.trunc(number(source.toolQuantity))); const toolUnitCost = Math.max(0, number(source.toolUnitCost)); const toolCost = toolQuantity * toolUnitCost; const quoteValue = quantity * operation.customerRate; const rowMissing = [];
      if (!operation.machine) rowMissing.push('Machine'); if (!(operation.cycleMinutes > 0)) rowMissing.push('Cycle'); if (!rateReady) rowMissing.push('Machine rate'); if (insertSku && !insert) rowMissing.push('Insert master'); if (insertSku && insert && !(partsPerInsert > 0)) rowMissing.push('Insert edge-life target'); if (toolName && !(toolQuantity > 0)) rowMissing.push('Tool quantity'); if (toolQuantity > 0 && !toolName) rowMissing.push('Tool name'); if (toolQuantity > 0 && !(toolUnitCost > 0)) rowMissing.push('Tool cost'); if (!(operation.customerRate > 0)) rowMissing.push('Customer rate');
      rowMissing.forEach(label => missing.push(`Side ${operation.number}: ${label}`));
      return { ...operation, setupMinutes, toolName, holderName, toolQuantity, toolUnitCost, insertSku, insertName: text(insert?.name, 120), edgesPerInsert, expectedPartsPerEdge, partsPerInsert, requiredInserts, insertCost, runMinutes, elapsedMinutes, plannedDays, machineRateMin: rate.minPerMinute, machineRateMax: rate.maxPerMinute, machineCostMin, machineCostMax, toolCost, quoteValue, totalCostMin: machineCostMin + insertCost + toolCost, totalCostMax: machineCostMax + insertCost + toolCost, missing: rowMissing };
    });
    if (!operations.length) missing.push('At least one Side / operation');
    const totals = operations.reduce((sum, row) => { sum.setupMinutes += row.setupMinutes; sum.runMinutes += row.runMinutes; sum.elapsedMinutes += row.elapsedMinutes; sum.plannedDays += row.plannedDays; sum.machineCostMin += row.machineCostMin; sum.machineCostMax += row.machineCostMax; sum.insertCost += row.insertCost; sum.toolCost += row.toolCost; sum.quoteValue += row.quoteValue; return sum; }, { setupMinutes: 0, runMinutes: 0, elapsedMinutes: 0, plannedDays: 0, machineCostMin: 0, machineCostMax: 0, insertCost: 0, toolCost: 0, quoteValue: 0 });
    totals.totalCostMin = totals.machineCostMin + totals.insertCost + totals.toolCost; totals.totalCostMax = totals.machineCostMax + totals.insertCost + totals.toolCost; totals.marginMin = totals.quoteValue - totals.totalCostMax; totals.marginMax = totals.quoteValue - totals.totalCostMin;
    const uniqueMissing = [...new Set(missing)]; const decision = uniqueMissing.length ? 'NEEDS DATA' : totals.quoteValue >= totals.totalCostMax ? 'PROFIT' : totals.quoteValue >= totals.totalCostMin ? 'BORDERLINE' : 'NOT SUITABLE';
    return { quantity, availableMinutesPerDay, efficiencyPercent, operations, totals, missing: uniqueMissing, ready: uniqueMissing.length === 0, decision };
  }

  function normalizeOperation(raw = {}, index = 0) {
    const state = text(raw.state, 20).toUpperCase();
    const performance = cyclePerformance(raw.cycleMinutes, raw.actualCycleMinutes);
    return { number: Number(raw.number) || index + 1, name: text(raw.name || `HEAD / SIDE ${index + 1}`, 80), machine: text(raw.machine, 40).toUpperCase(), cycleMinutes: Math.max(0, number(raw.cycleMinutes)), setupMinutes: Math.max(0, number(raw.setupMinutes)), rpm: Math.max(0, Math.trunc(number(raw.rpm))), programNo: text(raw.programNo, 80).toUpperCase(), customerRate: Math.max(0, number(raw.customerRate)), toolName: text(raw.toolName, 120), holderName: text(raw.holderName, 120), toolQuantity: Math.max(0, Math.trunc(number(raw.toolQuantity))), toolUnitCost: Math.max(0, number(raw.toolUnitCost)), insertSku: text(raw.insertSku, 80).toUpperCase(), state: OPERATION_STATES.includes(state) ? state : 'PENDING', operatorCode: text(raw.operatorCode, 80).toUpperCase(), operatorUid: text(raw.operatorUid, 180), startedAt: Math.max(0, number(raw.startedAt)), completedAt: Math.max(0, number(raw.completedAt)), completedQty: Math.max(0, Math.trunc(number(raw.completedQty))), actualCycleMinutes: performance.actualCycleMinutes, cycleVarianceMinutes: number(raw.cycleVarianceMinutes, performance.varianceMinutes), cycleVariancePercent: number(raw.cycleVariancePercent, performance.variancePercent), cycleStatus: text(raw.cycleStatus || performance.status, 40).toUpperCase() };
  }

  function normalizeProductionBatch(raw = {}) {
    const operationCount = Math.min(4, Math.max(1, Math.trunc(number(raw.operationCount, asArray(raw.operations).length || 1)))); const source = asArray(raw.operations); const operations = Array.from({ length: operationCount }, (_, index) => normalizeOperation(source[index] || { number: index + 1 }, index));
    return { batchId: text(raw.batchId, 180), estimateId: text(raw.estimateId, 180), companyId: text(raw.companyId, 180), companyName: text(raw.companyName, 120), jobMasterId: text(raw.jobMasterId, 180), jobName: text(raw.jobName, 120), partNo: text(raw.partNo, 100).toUpperCase(), poNumber: text(raw.poNumber, 100).toUpperCase(), drawingId: text(raw.drawingId, 180), drawingNo: text(raw.drawingNo, 100).toUpperCase(), drawingRevision: text(raw.drawingRevision, 40).toUpperCase(), drawingStoragePath: text(raw.drawingStoragePath, 500), assignedOperatorUid: text(raw.assignedOperatorUid, 180), assignedOperatorCode: text(raw.assignedOperatorCode, 80).toUpperCase(), assignedOperatorName: text(raw.assignedOperatorName, 120), targetQty: Math.max(0, Math.trunc(number(raw.targetQty))), dueDate: text(raw.dueDate, 10), operationCount, operations, requireActualCycle: raw.requireActualCycle === true, inspectionComplete: raw.inspectionComplete === true, oilingComplete: raw.oilingComplete === true, packingComplete: raw.packingComplete === true, dispatchReady: raw.dispatchReady === true, hold: raw.hold === true, active: raw.active !== false, createdAt: raw.createdAt || '', updatedAt: raw.updatedAt || '' };
  }

  function productionBatchStatus(raw = {}) {
    const batch = normalizeProductionBatch(raw); const operations = batch.operations;
    if (batch.hold) return 'ON HOLD';
    if (batch.dispatchReady && operations.every(row => row.state === 'COMPLETE') && batch.inspectionComplete && batch.oilingComplete && batch.packingComplete) return 'DISPATCH READY';
    if (operations.every(row => row.state === 'COMPLETE')) return batch.inspectionComplete && batch.oilingComplete && batch.packingComplete ? 'FINAL PROCESS COMPLETE' : 'MACHINING COMPLETE';
    const running = operations.find(row => row.state === 'RUNNING'); if (running) return `HEAD ${running.number} RUNNING`;
    const completed = operations.filter(row => row.state === 'COMPLETE'); return completed.length ? `HEAD ${completed.at(-1).number} COMPLETE · HEAD ${completed.length + 1} PENDING` : 'PENDING';
  }

  function activeBatchOperation(raw = {}) {
    const batch = normalizeProductionBatch(raw);
    if (!batch.batchId || batch.active === false || batch.dispatchReady) return null;
    return batch.operations.find(operation => operation.state === 'RUNNING') || batch.operations.find(operation => operation.state === 'PENDING') || null;
  }

  function operatorMachineLoad(rawBatches = {}, operatorUid = '') {
    const uid = text(operatorUid, 180); const groups = new Map();
    asArray(rawBatches).map(normalizeProductionBatch).filter(batch => batch.active !== false && !batch.dispatchReady && (!uid || batch.assignedOperatorUid === uid)).forEach(batch => {
      const operation = activeBatchOperation(batch); if (!operation?.machine) return;
      const current = groups.get(operation.machine) || { machine: operation.machine, batchIds: [], jobs: [], targetCycles: [], running: false };
      current.batchIds.push(batch.batchId); current.jobs.push(`${batch.jobName || batch.partNo} · ${operation.name}`); current.targetCycles.push(operation.cycleMinutes); current.running = current.running || operation.state === 'RUNNING'; groups.set(operation.machine, current);
    });
    const machines = [...groups.values()].sort((a, b) => a.machine.localeCompare(b.machine)); const machineCodes = machines.map(row => row.machine); const machineCount = machineCodes.length;
    return { operatorUid: uid, machineCount, machineCodes, machines, maxMachines: MAX_OPERATOR_MACHINES, status: machineCount > MAX_OPERATOR_MACHINES ? 'OVERLOAD' : machineCount === 2 ? '2 MACHINES' : machineCount === 1 ? '1 MACHINE' : 'NO ACTIVE MACHINE' };
  }

  function validateOperatorMachineAssignment(rawBatches = {}, rawCandidate = {}, operatorUid = '') {
    const uid = text(operatorUid || rawCandidate.assignedOperatorUid, 180); const candidate = normalizeProductionBatch({ ...rawCandidate, assignedOperatorUid: uid });
    const existing = asArray(rawBatches).map(normalizeProductionBatch).filter(batch => batch.batchId !== candidate.batchId); const load = operatorMachineLoad([...existing, candidate], uid); const errors = [];
    if (!uid) errors.push('Operator is required.'); if (load.machineCount > MAX_OPERATOR_MACHINES) errors.push(`ஒரு operator-க்கு ஒரே நேரத்தில் அதிகபட்சம் ${MAX_OPERATOR_MACHINES} active machines மட்டும்.`);
    return { ok: errors.length === 0, errors, load };
  }

  function validateOperatorConcurrentStart(rawBatches = {}, batchIdValue = '', operationNumberValue = 0, operatorUid = '') {
    const uid = text(operatorUid, 180); const batchId = text(batchIdValue, 180); const operationNumber = Number(operationNumberValue); const batches = asArray(rawBatches).map(normalizeProductionBatch); const candidateBatch = batches.find(batch => batch.batchId === batchId); const candidate = candidateBatch?.operations?.[operationNumber - 1]; const errors = [];
    if (!candidateBatch || candidateBatch.assignedOperatorUid !== uid || !candidate) errors.push('Assigned batch / operation is invalid.');
    const running = [];
    batches.filter(batch => batch.active !== false && batch.assignedOperatorUid === uid).forEach(batch => batch.operations.filter(operation => operation.state === 'RUNNING').forEach(operation => running.push({ batchId: batch.batchId, operationNumber: operation.number, machine: operation.machine })));
    if (candidate && running.some(row => row.machine === candidate.machine && (row.batchId !== batchId || row.operationNumber !== operationNumber))) errors.push(`${candidate.machine} ஏற்கனவே இந்த operator-க்கு RUNNING நிலையில் உள்ளது.`);
    const machineCodes = [...new Set(running.map(row => row.machine).concat(candidate?.machine || '').filter(Boolean))]; if (machineCodes.length > MAX_OPERATOR_MACHINES) errors.push(`மூன்றாவது machine Start செய்ய முடியாது. அதிகபட்சம் ${MAX_OPERATOR_MACHINES} machines மட்டும்.`);
    return { ok: errors.length === 0, errors, machineCodes, machineCount: machineCodes.length, maxMachines: MAX_OPERATOR_MACHINES };
  }

  function transitionProductionBatch(raw, actionValue, operationNumberValue, actor = {}, at = Date.now()) {
    const batch = normalizeProductionBatch(raw); const action = text(actionValue, 20).toUpperCase(); const operationNumber = Number(operationNumberValue); const error = message => ({ ok: false, error: message, value: null });
    if (!batch.batchId || batch.active === false) return error('Production batch is missing or inactive'); if (batch.assignedOperatorUid && batch.assignedOperatorUid !== text(actor.uid, 180)) return error('This production batch is assigned to another operator'); if (batch.hold) return error('Batch is on hold'); if (!['START', 'COMPLETE'].includes(action) || !Number.isInteger(operationNumber)) return error('Batch action or Head / Side number is invalid');
    const index = operationNumber - 1; const operation = batch.operations[index]; if (!operation) return error('Head / Side number is invalid');
    if (action === 'START') {
      if (operation.state !== 'PENDING') return error(`Head ${operationNumber} is not pending`); if (!batch.operations.slice(0, index).every(row => row.state === 'COMPLETE')) return error('Previous Head / Side must be complete first'); if (batch.operations.some(row => row.state === 'RUNNING')) return error('Another Head / Side is already running'); operation.state = 'RUNNING'; operation.operatorCode = text(actor.operatorCode, 80).toUpperCase(); operation.operatorUid = text(actor.uid, 180); operation.startedAt = number(at);
    } else {
      const completedQty = Number(actor.completedQty); const actualCycleMinutes = number(actor.actualCycleMinutes); if (operation.state !== 'RUNNING') return error(`Head ${operationNumber} is not running`); if (operation.operatorUid && operation.operatorUid !== text(actor.uid, 180)) return error('Only the operator who started this Head / Side can complete it'); if (batch.requireActualCycle && (!Number.isInteger(completedQty) || completedQty < 1 || !(actualCycleMinutes > 0))) return error('Completed quantity and actual cycle minutes are required'); operation.state = 'COMPLETE'; operation.operatorCode = text(actor.operatorCode, 80).toUpperCase(); operation.operatorUid = text(actor.uid, 180); operation.completedAt = number(at); if (Number.isInteger(completedQty) && completedQty > 0) operation.completedQty = completedQty; if (actualCycleMinutes > 0) { const performance = cyclePerformance(operation.cycleMinutes, actualCycleMinutes); operation.actualCycleMinutes = performance.actualCycleMinutes; operation.cycleVarianceMinutes = performance.varianceMinutes; operation.cycleVariancePercent = performance.variancePercent; operation.cycleStatus = performance.status; }
    }
    const value = { ...(raw || {}), operations: batch.operations, operationCount: batch.operationCount, updatedAt: number(at), lastOperatorCode: text(actor.operatorCode, 80).toUpperCase(), lastOperatorUid: text(actor.uid, 180) }; value.status = productionBatchStatus(value); return { ok: true, error: '', value, operation: value.operations[index] };
  }

  function drawingSuggestions(textValue = '') {
    const source = text(textValue, 12000).replace(/\r/g, ''); const upper = source.toUpperCase();
    const operationNumbers = [...upper.matchAll(/(?:OP(?:ERATION)?|SETUP|SIDE|HEAD)\s*[-:#]?\s*([1-4])\b/g)].map(match => Number(match[1]));
    const ordinalHits = [/(?:FIRST|1ST)\s+(?:OP|OPERATION|SETUP|SIDE|HEAD)/, /(?:SECOND|2ND)\s+(?:OP|OPERATION|SETUP|SIDE|HEAD)/, /(?:THIRD|3RD)\s+(?:OP|OPERATION|SETUP|SIDE|HEAD)/, /(?:FOURTH|4TH)\s+(?:OP|OPERATION|SETUP|SIDE|HEAD)/].map((pattern, index) => pattern.test(upper) ? index + 1 : 0).filter(Boolean);
    const suggestedOperationCount = Math.min(4, Math.max(1, ...operationNumbers, ...ordinalHits)); const dimensions = []; const seen = new Set();
    const patterns = [/(?:Ø|⌀|DIA\.?\s*)\s*([0-9]+(?:\.[0-9]+)?)\s*(?:±|\+\/-)\s*([0-9]+(?:\.[0-9]+)?)/gi, /\b([0-9]+(?:\.[0-9]+)?)\s*(?:±|\+\/-)\s*([0-9]+(?:\.[0-9]+)?)/gi, /\b([0-9]+(?:\.[0-9]+)?)\s*\+\s*([0-9]+(?:\.[0-9]+)?)\s*\/\s*-\s*([0-9]+(?:\.[0-9]+)?)/gi];
    patterns.forEach((pattern, patternIndex) => { for (const match of upper.matchAll(pattern)) { const callout = match[0].replace(/\s+/g, ' '); const nominal = number(match[1]); const plus = number(match[2]); const minus = patternIndex === 2 ? number(match[3]) : plus; const key = `${nominal}|${plus}|${minus}`; if (seen.has(key) || dimensions.length >= 100) continue; seen.add(key); dimensions.push({ number: dimensions.length + 1, callout, nominal, upperTolerance: plus, lowerTolerance: -minus, source: 'OCR_SUGGESTION' }); } });
    const drawingNo = upper.match(/(?:DRAWING|DRG)\s*(?:NO|NUMBER|#)?\s*[:.-]?\s*([A-Z0-9][A-Z0-9._/-]{2,})/)?.[1] || ''; const revision = upper.match(/(?:REV(?:ISION)?)\s*[:.-]?\s*([A-Z0-9]{1,10})/)?.[1] || '';
    return { suggestedOperationCount, operationConfidence: operationNumbers.length || ordinalHits.length ? 'MEDIUM' : 'LOW', drawingNo, revision, dimensions, rawText: source };
  }

  function normalizeInsert(raw = {}) {
    const mode = ISSUE_MODES.includes(raw.issueMode) ? raw.issueMode : 'ONE_PIECE';
    return {
      sku: text(raw.sku || raw.code, 80).toUpperCase(),
      name: text(raw.name, 120),
      brand: text(raw.brand, 80),
      grade: text(raw.grade, 80),
      rackId: text(raw.rackId, 40).toUpperCase(),
      channelId: text(raw.channelId, 40).toUpperCase(),
      issueMode: mode,
      packSize: mode === 'ONE_PIECE' ? 1 : Math.max(1, number(raw.packSize, 1)),
      edgesPerInsert: Math.max(1, number(raw.edgesPerInsert, 1)),
      expectedPartsPerEdge: Math.max(0, number(raw.expectedPartsPerEdge != null ? raw.expectedPartsPerEdge : raw.expectedJobsPerEdge)),
      unitValue: Math.max(0, number(raw.unitValue != null ? raw.unitValue : raw.value)),
      reorderLevel: Math.max(0, number(raw.reorderLevel != null ? raw.reorderLevel : raw.min)),
      active: raw.active !== false,
      updatedAt: raw.updatedAt || nowIso()
    };
  }

  function validateInsert(raw) {
    const insert = normalizeInsert(raw);
    const errors = [];
    if (!insert.sku) errors.push('Full SKU / insert code is required.');
    if (!insert.name) errors.push('Insert name is required.');
    if (!insert.rackId) errors.push('Rack ID is required.');
    if (!insert.channelId) errors.push('Channel ID is required.');
    if (!ISSUE_MODES.includes(insert.issueMode)) errors.push('Issue mode is invalid.');
    if (!Number.isInteger(insert.packSize) || insert.packSize < 1) errors.push('Pack size must be a whole number.');
    if (!Number.isInteger(insert.edgesPerInsert) || insert.edgesPerInsert < 1) errors.push('Edges per insert must be a whole number.');
    if (!Number.isInteger(insert.expectedPartsPerEdge) || insert.expectedPartsPerEdge < 0) errors.push('Expected good parts per edge must be a whole number.');
    if (!Number.isInteger(insert.reorderLevel) || insert.reorderLevel < 0) errors.push('Reorder level must be a whole number.');
    return { ok: errors.length === 0, errors, value: insert };
  }

  function ledgerDeltaAt(ledger, sku, asOfDate = '9999-12-31') {
    const target = text(sku, 80).toUpperCase();
    return objectValues(ledger).reduce((total, row) => {
      if (!row || text(row.sku, 80).toUpperCase() !== target || row.status === 'VOID') return total;
      const effectiveDate = text(row.effectiveDate || row.date || String(row.createdAt || '').slice(0, 10), 10);
      if (effectiveDate && effectiveDate <= asOfDate) return total + number(row.delta);
      return total;
    }, 0);
  }

  function availableStock(inventory, ledger, sku, asOfDate) {
    const key = safeKey(text(sku, 80).toUpperCase());
    if (asOfDate) return ledgerDeltaAt(ledger, sku, asOfDate);
    return Math.max(0, number((inventory || {})[key]?.available));
  }

  function validMonthKey(value) {
    return /^\d{4}-(0[1-9]|1[0-2])$/.test(text(value, 7));
  }

  function monthKey(value = new Date()) {
    if (typeof value === 'string' && validMonthKey(value.slice(0, 7))) return value.slice(0, 7);
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return monthKey(new Date());
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
  }

  function monthKeysEnding(endValue, countValue = 12) {
    const end = validMonthKey(String(endValue || '').slice(0, 7)) ? String(endValue).slice(0, 7) : monthKey();
    const count = Math.min(60, Math.max(1, Math.trunc(number(countValue, 12)))); const [year, month] = end.split('-').map(Number);
    return Array.from({ length: count }, (_, index) => {
      const date = new Date(Date.UTC(year, month - count + index, 1));
      return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
    });
  }

  function normalizeCompanyProfile(raw = {}) {
    return {
      companyName: text(raw.companyName, 120), legalName: text(raw.legalName, 160), gstin: text(raw.gstin, 20).toUpperCase(),
      contactPerson: text(raw.contactPerson, 120), phone: text(raw.phone, 30), email: text(raw.email, 160).toLowerCase(), address: text(raw.address, 500),
      establishedDate: validIsoDate(raw.establishedDate) ? text(raw.establishedDate, 10) : '', monthlyTargetRevenue: Math.max(0, number(raw.monthlyTargetRevenue)), updatedAt: raw.updatedAt || ''
    };
  }

  function normalizeMonthlyTurnover(raw = {}, key = '') {
    const month = validMonthKey(raw.month) ? text(raw.month, 7) : validMonthKey(key) ? text(key, 7) : '';
    return { month, turnover: Math.max(0, number(raw.turnover)), target: Math.max(0, number(raw.target)), note: text(raw.note, 200), updatedAt: raw.updatedAt || '' };
  }

  function issueBusinessDate(raw = {}) {
    const explicit = text(raw.issuedDate || raw.issuedAtIso, 30).slice(0, 10); if (validIsoDate(explicit)) return explicit;
    const stamp = number(raw.issuedAt); return stamp > 0 ? today(new Date(stamp)) : '';
  }

  function consumedIssueQuantity(raw = {}) {
    const issued = Math.max(0, number(raw.quantity));
    if (text(raw.status, 20).toUpperCase() === 'CLOSED' && raw.consumedQuantity != null) return Math.min(issued, Math.max(0, number(raw.consumedQuantity)));
    return issued;
  }

  function dashboardBusinessMetrics(raw = {}) {
    const date = validIsoDate(raw.date) ? text(raw.date, 10) : today(); const inserts = objectValues(raw.inserts); const allReports = asArray(raw.reports); const reports = allReports.filter(row => text(row.date, 10) === date); const issues = objectValues(raw.issues).filter(row => issueBusinessDate(row) === date); const operators = objectValues(raw.operators).filter(row => row.active !== false);
    let totalInsertQuantity = 0; let totalInsertValue = 0;
    inserts.forEach(insert => { const quantity = Math.max(0, availableStock(raw.inventory, raw.ledger, insert.sku, date)); totalInsertQuantity += quantity; totalInsertValue += quantity * Math.max(0, number(insert.unitValue)); });
    const usedInsertQuantity = issues.reduce((sum, row) => sum + consumedIssueQuantity(row), 0); const usedInsertValue = issues.reduce((sum, row) => sum + consumedIssueQuantity(row) * Math.max(0, number(row.unitValue)), 0);
    const production = reports.reduce((sum, report) => { const totals = reportTotals(report); sum.good += totals.good; sum.actual += totals.actual; sum.target += totals.target; sum.revenue += totals.todayRevenue; sum.costMax += totals.todayCostMax; sum.profitableJobs += totals.profitableJobs; sum.borderlineJobs += totals.borderlineJobs; sum.notSuitableJobs += totals.notSuitableJobs; sum.rateIncompleteJobs += totals.rateIncompleteJobs; return sum; }, { good: 0, actual: 0, target: 0, revenue: 0, costMax: 0, profitableJobs: 0, borderlineJobs: 0, notSuitableJobs: 0, rateIncompleteJobs: 0 });
    const shiftPerformance = Object.fromEntries(['A', 'B'].map(shift => {
      const rows = reports.filter(row => text(row.shift, 1).toUpperCase() === shift); const totals = rows.reduce((sum, report) => { const value = reportTotals(report); sum.target += value.target; sum.actual += value.actual; return sum; }, { target: 0, actual: 0 });
      const activeOperators = operators.filter(row => text(row.shift, 1).toUpperCase() === shift).length; return [shift, { shift, activeOperators, reports: rows.length, target: totals.target, actual: totals.actual, percentage: totals.target > 0 ? totals.actual / totals.target * 100 : 0 }];
    }));
    const operatorGroups = new Map();
    operators.forEach(row => { const code = text(row.code || row.operatorCode, 80).toUpperCase(); if (code) operatorGroups.set(code, { code, name: text(row.name || row.displayName, 120), shift: text(row.shift, 1).toUpperCase(), active: true, target: 0, actual: 0, insertQuantity: 0, insertValue: 0 }); });
    reports.forEach(report => { const code = text(report.operatorCode, 80).toUpperCase(); if (!code) return; const current = operatorGroups.get(code) || { code, name: text(report.operatorName, 120), shift: text(report.shift, 1).toUpperCase(), active: false, target: 0, actual: 0, insertQuantity: 0, insertValue: 0 }; const totals = reportTotals(report); current.target += totals.target; current.actual += totals.actual; if (!current.name) current.name = text(report.operatorName, 120); if (!current.shift) current.shift = text(report.shift, 1).toUpperCase(); operatorGroups.set(code, current); });
    issues.forEach(issue => { const code = text(issue.operatorCode, 80).toUpperCase(); if (!code) return; const current = operatorGroups.get(code) || { code, name: '', shift: '', active: false, target: 0, actual: 0, insertQuantity: 0, insertValue: 0 }; const quantity = consumedIssueQuantity(issue); current.insertQuantity += quantity; current.insertValue += quantity * Math.max(0, number(issue.unitValue)); operatorGroups.set(code, current); });
    const operatorPerformance = [...operatorGroups.values()].map(row => ({ ...row, percentage: row.target > 0 ? row.actual / row.target * 100 : 0 })).sort((a, b) => b.percentage - a.percentage || a.code.localeCompare(b.code));
    const totalRevenue = allReports.reduce((sum, report) => sum + reportTotals(report).todayRevenue, 0);
    return { date, totalInsertQuantity, totalInsertValue, usedInsertQuantity, usedInsertValue, totalRevenue, activeOperatorCount: operators.length, reportCount: reports.length, production, shiftPerformance, operatorPerformance };
  }

  function monthlyBusinessPerformance(rawReports = [], rawTurnover = {}, endValue = '', countValue = 12, fallbackTargetValue = 0) {
    const months = monthKeysEnding(endValue, countValue); const reports = asArray(rawReports); const fallbackTarget = Math.max(0, number(fallbackTargetValue));
    const manualByMonth = new Map(Object.entries(rawTurnover || {}).map(([key, row]) => { const normalized = normalizeMonthlyTurnover(row, key); return [normalized.month, { normalized, confirmed: Boolean(normalized.month && row && row.turnover !== '' && row.turnover != null) }]; }).filter(([key]) => key));
    const productionByMonth = new Map(); reports.forEach(report => { const key = text(report.date, 10).slice(0, 7); if (!validMonthKey(key)) return; productionByMonth.set(key, number(productionByMonth.get(key)) + reportTotals(report).todayRevenue); });
    const rows = months.map(key => { const manual = manualByMonth.get(key); const productionRevenue = Math.max(0, number(productionByMonth.get(key))); const confirmedTurnover = manual?.confirmed ? manual.normalized.turnover : null; const turnover = confirmedTurnover == null ? productionRevenue : confirmedTurnover; const target = manual?.normalized.target > 0 ? manual.normalized.target : fallbackTarget; const [year, month] = key.split('-').map(Number); const label = new Intl.DateTimeFormat('en-IN', { month: 'short', year: '2-digit', timeZone: 'UTC' }).format(new Date(Date.UTC(year, month - 1, 1))); return { month: key, label, productionRevenue, confirmedTurnover, turnover, target, note: manual?.normalized.note || '', source: confirmedTurnover == null ? 'PRODUCTION' : 'CONFIRMED', targetPercent: target > 0 ? turnover / target * 100 : 0, growthPercent: null }; });
    rows.forEach((row, index) => { if (!index) return; const previous = rows[index - 1].turnover; row.growthPercent = previous > 0 ? (row.turnover - previous) / previous * 100 : row.turnover > 0 ? null : 0; });
    const current = rows.at(-1) || null; const previous = rows.at(-2) || null; const lastSix = rows.slice(-6); const total = list => list.reduce((sum, row) => sum + row.turnover, 0);
    return { rows, current, previous, currentGrowthPercent: current?.growthPercent ?? null, sixMonthTotal: total(lastSix), sixMonthAverage: lastSix.length ? total(lastSix) / lastSix.length : 0, periodTotal: total(rows), periodAverage: rows.length ? total(rows) / rows.length : 0 };
  }

  function normalizeIssueRequest(raw = {}) {
    return {
      requestId: text(raw.requestId, 180),
      sku: text(raw.sku, 80).toUpperCase(),
      machine: text(raw.machine, 40).toUpperCase(),
      job: text(raw.job, 120),
      partNo: text(raw.partNo, 100),
      quantity: number(raw.quantity),
      exceptionCode: text(raw.exceptionCode, 40).toUpperCase(),
      exceptionNote: text(raw.exceptionNote, 300),
      requestedAt: raw.requestedAt || nowIso()
    };
  }

  function validateIssueRequest(raw, insert, options = {}) {
    const request = normalizeIssueRequest(raw);
    const item = insert ? normalizeInsert(insert) : null;
    const errors = [];
    if (!request.requestId) errors.push('Request ID is missing.');
    if (!item || !item.active) errors.push('Selected full SKU is missing or inactive.');
    if (!request.machine || !MACHINES.some(row => row.code === request.machine)) errors.push('Valid machine is required.');
    if (!request.job) errors.push('Job / component is required.');
    if (!request.partNo) errors.push('Part number is required.');
    if (!Number.isInteger(request.quantity) || request.quantity < 1) errors.push('Issue quantity must be a positive whole number.');
    if (item && item.issueMode === 'ONE_PIECE' && request.quantity !== 1) errors.push('One-piece SKU must dispense exactly one insert.');
    if (item && item.issueMode === 'MULTI_PIECE' && request.quantity > item.packSize) errors.push('Issue quantity exceeds the configured maximum.');
    if (request.exceptionCode && request.exceptionCode !== 'FIRST_SETUP') errors.push('Only FIRST SETUP is valid on a new issue request.');
    if (request.exceptionCode && !request.exceptionNote) errors.push('First setup note is required.');
    if (options.hasOpenIssue) errors.push('Previous insert must be resolved before a new issue.');
    if (item && Number.isFinite(options.available) && request.quantity > options.available) errors.push('Insufficient available stock.');
    return { ok: errors.length === 0, errors, value: request };
  }

  function normalizeReturnRequest(raw = {}) {
    return {
      requestId: text(raw.requestId, 180),
      issueId: text(raw.issueId, 180),
      action: text(raw.action, 40).toUpperCase(),
      physicalReturnConfirmed: raw.physicalReturnConfirmed === true,
      exceptionCode: text(raw.exceptionCode, 40).toUpperCase(),
      exceptionNote: text(raw.exceptionNote, 300),
      unusedQty: number(raw.unusedQty),
      goodParts: number(raw.goodParts),
      rejectedParts: number(raw.rejectedParts),
      cuttingMinutes: number(raw.cuttingMinutes),
      edgesUsed: number(raw.edgesUsed, 1),
      requestedAt: raw.requestedAt || nowIso()
    };
  }

  function validateReturnRequest(raw, issue = {}) {
    const request = normalizeReturnRequest(raw);
    const errors = [];
    const issueQty = Math.max(1, Math.trunc(number(issue.quantity, 1)));
    const mode = ISSUE_MODES.includes(issue.issueMode) ? issue.issueMode : 'ONE_PIECE';
    if (!request.requestId || !request.issueId) errors.push('Return request and issue ID are required.');
    if (!RETURN_ACTIONS.includes(request.action)) errors.push('Return action is invalid.');
    if (!whole(request.goodParts) || !whole(request.rejectedParts)) errors.push('Part counts must be whole numbers.');
    if (!Number.isFinite(request.cuttingMinutes) || request.cuttingMinutes < 0) errors.push('Cutting minutes must be zero or higher.');
    if (!Number.isInteger(request.edgesUsed) || request.edgesUsed < 1) errors.push('Edges used must be a positive whole number.');
    if (request.action === 'INDEX' && request.edgesUsed !== 1) errors.push('INDEX must record exactly one completed edge.');
    if (!Number.isInteger(request.unusedQty) || request.unusedQty < 0 || request.unusedQty > issueQty) errors.push('Unused quantity cannot exceed issued quantity.');
    if (mode === 'ONE_PIECE' && request.unusedQty !== 0) errors.push('One-piece SKU cannot return usable stock.');
    if (request.action !== 'PART_USED_RETURN' && request.unusedQty !== 0) errors.push('Unused stock is allowed only for PART-USED RETURN.');
    if (request.unusedQty === issueQty && request.goodParts + request.rejectedParts > 0) errors.push('All issued pieces cannot be unused when produced parts are recorded.');
    if (request.action === 'INDEX' && (request.physicalReturnConfirmed || request.unusedQty > 0)) errors.push('INDEX keeps the same insert in the machine; do not record a physical/unused return.');
    if (request.action === 'INDEX' && request.exceptionCode) errors.push('INDEX cannot use a return exception; keep the same insert and select the next edge.');
    const needsPhysical = request.action !== 'INDEX';
    if (needsPhysical && !request.physicalReturnConfirmed && !request.exceptionCode) errors.push('Physical old insert return or an approved exception is required.');
    if (request.exceptionCode && !EXCEPTION_CODES.includes(request.exceptionCode)) errors.push('Exception reason is invalid.');
    if (request.exceptionCode && !request.exceptionNote) errors.push('Exception note is required.');
    return {
      ok: errors.length === 0,
      errors,
      value: request,
      needsApproval: Boolean(request.exceptionCode)
    };
  }

  function lifeMetrics(raw = {}) {
    const good = Math.max(0, number(raw.goodParts));
    const rejected = Math.max(0, number(raw.rejectedParts));
    const minutes = Math.max(0, number(raw.cuttingMinutes));
    const edges = Math.max(1, number(raw.edgesUsed, 1));
    const quantity = Math.max(1, number(raw.quantity, 1));
    const consumedQuantity = Math.max(0, number(raw.consumedQuantity != null ? raw.consumedQuantity : quantity, quantity));
    const unitValue = Math.max(0, number(raw.unitValue));
    return {
      goodPartsPerEdge: good / edges,
      cuttingMinutesPerEdge: minutes / edges,
      totalPartsPerInsert: consumedQuantity > 0 ? (good + rejected) / consumedQuantity : 0,
      costPerGoodComponent: good > 0 && consumedQuantity > 0 ? (unitValue * consumedQuantity) / good : null
    };
  }

  function parse12HourTime(timeValue, periodValue) {
    const match = text(timeValue, 5).match(/^(0[1-9]|1[0-2]):([0-5][0-9])$/);
    const period = text(periodValue, 2).toUpperCase();
    if (!match || !['AM', 'PM'].includes(period)) return null;
    const hour = Number(match[1]) % 12 + (period === 'PM' ? 12 : 0);
    return hour * 60 + Number(match[2]);
  }

  function format12HourTime(timeValue, periodValue) {
    return parse12HourTime(timeValue, periodValue) == null ? '—' : `${text(timeValue, 5)} ${text(periodValue, 2).toUpperCase()}`;
  }

  function routeLabel(value) {
    const route = ROUTES.includes(value) ? value : 'NONE';
    return route === 'NONE' ? 'Not required' : route.replaceAll('_', ' → ');
  }

  function sideFields(raw = {}) {
    return [1, 2, 3, 4].map(side => {
      const route = text(raw[`side${side}Route`], 20).toUpperCase();
      return { side, route: ROUTES.includes(route) ? route : 'NONE', complete: raw[`side${side}Complete`] === true };
    });
  }

  function jobProcessStatus(raw = {}) {
    const required = sideFields(raw).filter(side => side.route !== 'NONE');
    return required.length > 0 && required.every(side => side.complete) ? 'JOB COMPLETE' : 'WORK RUNNING';
  }

  function jobSideSummary(raw = {}) {
    const configured = sideFields(raw).filter(side => side.route !== 'NONE');
    return configured.map(side => `S${side.side}: ${routeLabel(side.route)} ${side.complete ? '✓' : '…'}`).join(' | ') || 'No side routing';
  }

  function normalizePart(raw = {}, index = 0) {
    const side = text(raw.side, 12).toUpperCase();
    const capture = raw.screenCapture && typeof raw.screenCapture === 'object' ? raw.screenCapture : null;
    return {
      number: Number(raw.number) || index + 1,
      partNo: text(raw.partNo, 100).toUpperCase(),
      machine: text(raw.machine, 40).toUpperCase(),
      side: PART_SIDES.includes(side) ? side : `SIDE-${Math.min(4, index + 1)}`,
      cycleMinutes: number(raw.cycleMinutes),
      estimatedCycleMinutes: Math.max(0, number(raw.estimatedCycleMinutes)),
      rpm: number(raw.rpm),
      programNo: text(raw.programNo, 80).toUpperCase(),
      sideRate: Math.max(0, number(raw.sideRate)),
      machineRateMin: Math.max(0, number(raw.machineRateMin)),
      machineRateMax: Math.max(0, number(raw.machineRateMax)),
      estimatedCostMin: Math.max(0, number(raw.estimatedCostMin)),
      estimatedCostMax: Math.max(0, number(raw.estimatedCostMax)),
      rateStatus: text(raw.rateStatus, 30).toUpperCase(),
      rateCalculatedBy: text(raw.rateCalculatedBy, 20).toUpperCase(),
      cycleVarianceMinutes: number(raw.cycleVarianceMinutes),
      cycleVariancePercent: number(raw.cycleVariancePercent),
      cycleStatus: text(raw.cycleStatus, 40).toUpperCase(),
      screenCapture: capture?.captureId ? {
        captureId: text(capture.captureId, 180),
        storagePath: text(capture.storagePath, 500),
        status: text(capture.status, 30).toUpperCase(),
        confirmed: capture.confirmed === true,
        extractedCycleMinutes: number(capture.extractedCycleMinutes),
        extractedRpm: number(capture.extractedRpm)
      } : null
    };
  }

  function normalizeInsertUsage(raw = {}, index = 0) {
    return {
      slot: Number(raw.slot) || index + 1,
      issueId: text(raw.issueId, 180),
      sku: text(raw.sku, 80).toUpperCase(),
      insertName: text(raw.insertName, 120),
      machine: text(raw.machine, 40).toUpperCase(),
      job: text(raw.job, 120),
      partNo: text(raw.partNo, 100).toUpperCase(),
      status: text(raw.status, 30).toUpperCase(),
      issuedAt: number(raw.issuedAt)
    };
  }

  function jobMachineCycle(raw = {}, machine = '') {
    const job = normalizeJob(raw);
    const matching = job.parts.filter(part => !machine || part.machine === machine);
    const cycle = matching.reduce((sum, part) => sum + Math.max(0, number(part.cycleMinutes)), 0);
    return cycle > 0 ? cycle : Math.max(0, number(job.cycleMinutes));
  }

  function jobPartSummary(raw = {}, machineRates) {
    const job = normalizeJob(raw);
    return job.parts.map(part => { const rate = partRateAnalysis(part, machineRates); return `P${part.number}: ${part.partNo || '—'} · ${part.machine || '—'} · ${part.side} · ${number(part.cycleMinutes).toFixed(2)}m · ${Math.trunc(number(part.rpm))} RPM · Quote ${money(part.sideRate)} · Cost ${money(rate.estimatedCostMin)}–${money(rate.estimatedCostMax)} · ${rate.rateStatus}`; }).join(' | ') || `${job.partNo || '—'} · legacy part`;
  }

  function jobRateAnalysis(raw = {}, machineRates) {
    const job = normalizeJob(raw); const parts = job.parts.map(part => ({ ...part, ...partRateAnalysis(part, machineRates) }));
    const totals = parts.reduce((sum, part) => { sum.sideRate += part.sideRate; sum.estimatedCostMin += part.estimatedCostMin; sum.estimatedCostMax += part.estimatedCostMax; return sum; }, { sideRate: 0, estimatedCostMin: 0, estimatedCostMax: 0 });
    const statuses = parts.map(part => part.rateStatus); let rateStatus = 'PROFIT';
    if (statuses.includes('NOT SUITABLE')) rateStatus = 'NOT SUITABLE';
    else if (!parts.length || statuses.includes('RATE NOT SET')) rateStatus = 'RATE NOT SET';
    else if (statuses.includes('CYCLE NOT SET')) rateStatus = 'CYCLE NOT SET';
    else if (statuses.includes('QUOTE NOT SET')) rateStatus = 'QUOTE NOT SET';
    else if (statuses.includes('BORDERLINE')) rateStatus = 'BORDERLINE';
    return { ...totals, estimatedProfitMin: totals.sideRate - totals.estimatedCostMax, estimatedProfitMax: totals.sideRate - totals.estimatedCostMin, rateStatus, actual: job.actual, todayRevenue: job.actual * totals.sideRate, todayCostMin: job.actual * totals.estimatedCostMin, todayCostMax: job.actual * totals.estimatedCostMax };
  }

  function normalizeJob(raw = {}, index = 0) {
    const normalized = {
      number: Number(raw.number) || index + 1,
      batchId: text(raw.batchId, 180),
      companyId: text(raw.companyId, 180),
      companyName: text(raw.companyName, 120),
      jobMasterId: text(raw.jobMasterId, 180),
      name: text(raw.name || raw.job, 120),
      partNo: text(raw.partNo, 100),
      workMachine: text(raw.workMachine, 40).toUpperCase(),
      inTime: text(raw.inTime, 5),
      inPeriod: text(raw.inPeriod, 2).toUpperCase(),
      outTime: text(raw.outTime, 5),
      outPeriod: text(raw.outPeriod, 2).toUpperCase(),
      cycleMinutes: number(raw.cycleMinutes != null ? raw.cycleMinutes : raw.cycle),
      actual: number(raw.actual),
      good: number(raw.good),
      rejected: number(raw.rejected),
      coolantCount: number(raw.coolantCount),
      oilCount: number(raw.oilCount),
      activeMinutes: number(raw.activeMinutes != null ? raw.activeMinutes : number(raw.hours) * 60)
    };
    normalized.parts = asArray(raw.parts).map(normalizePart);
    if (!normalized.parts.length && normalized.partNo) normalized.parts = [normalizePart({ number: 1, partNo: normalized.partNo, machine: raw.machine, side: 'SIDE-1', cycleMinutes: normalized.cycleMinutes, rpm: raw.rpm, programNo: raw.programNo }, 0)];
    if (normalized.parts.length) {
      normalized.partNo = normalized.parts[0].partNo;
      normalized.cycleMinutes = normalized.parts[0].cycleMinutes;
      if (!normalized.workMachine) normalized.workMachine = normalized.parts[0].machine;
    }
    const rawInsertUsages = asArray(raw.insertUsages).map(normalizeInsertUsage).filter(row => row.issueId || row.sku);
    normalized.insertUsed = typeof raw.insertUsed === 'boolean' ? raw.insertUsed : rawInsertUsages.length > 0;
    normalized.insertUsages = rawInsertUsages;
    sideFields(raw).forEach(side => {
      normalized[`side${side.side}Route`] = side.route;
      normalized[`side${side.side}Complete`] = side.complete;
    });
    const start = parse12HourTime(normalized.inTime, normalized.inPeriod);
    const rawEnd = parse12HourTime(normalized.outTime, normalized.outPeriod);
    if (start != null && rawEnd != null && start !== rawEnd) {
      let end = rawEnd;
      while (end <= start) end += 1440;
      if (end - start < 1440) normalized.activeMinutes = end - start;
    }
    normalized.status = jobProcessStatus(normalized);
    return normalized;
  }

  function workTimeline(rawJobs = []) {
    const jobs = asArray(rawJobs).map(normalizeJob);
    const intervals = [];
    const errors = [];
    let previousStart = null;
    jobs.forEach((job, index) => {
      const label = `Job ${job.number || index + 1}`;
      const startValue = parse12HourTime(job.inTime, job.inPeriod);
      const endValue = parse12HourTime(job.outTime, job.outPeriod);
      if (startValue == null || endValue == null) {
        errors.push(`${label}: valid 12-hour In and Out times are required.`);
        return;
      }
      if (startValue === endValue) {
        errors.push(`${label}: In and Out cannot be the same time.`);
        return;
      }
      let start = startValue;
      while (previousStart != null && start < previousStart) start += 1440;
      let end = endValue;
      while (end <= start) end += 1440;
      const duration = end - start;
      if (!(duration > 0 && duration < 1440)) {
        errors.push(`${label}: work interval must be less than 24 hours.`);
        return;
      }
      intervals.push({ number: job.number, start, end, duration });
      previousStart = start;
    });
    for (let left = 0; left < intervals.length; left += 1) for (let right = left + 1; right < intervals.length; right += 1) {
      const a = intervals[left]; const b = intervals[right]; if (Math.max(a.start, b.start) >= Math.min(a.end, b.end)) continue;
      const machineA = jobs[left]?.workMachine || jobs[left]?.parts?.[0]?.machine || ''; const machineB = jobs[right]?.workMachine || jobs[right]?.parts?.[0]?.machine || '';
      if (machineA && machineA === machineB) errors.push(`Job ${a.number} மற்றும் Job ${b.number}: ${machineA} நேரம் overlap ஆகிறது.`);
    }
    const points = [...new Set(intervals.flatMap(row => [row.start, row.end]))].sort((a, b) => a - b); for (let index = 0; index < points.length - 1; index += 1) { const start = points[index]; const end = points[index + 1]; if (end <= start) continue; const activeMachines = new Set(intervals.map((row, rowIndex) => row.start < end && row.end > start ? (jobs[rowIndex]?.workMachine || jobs[rowIndex]?.parts?.[0]?.machine || '') : '').filter(Boolean)); if (activeMachines.size > MAX_OPERATOR_MACHINES) errors.push(`ஒரே நேரத்தில் ${activeMachines.size} machines overlap ஆகிறது; அதிகபட்சம் ${MAX_OPERATOR_MACHINES} மட்டும்.`); }
    const merged = intervals.slice().sort((a, b) => a.start - b.start).reduce((list, row) => { const last = list.at(-1); if (!last || row.start > last.end) list.push({ start: row.start, end: row.end }); else last.end = Math.max(last.end, row.end); return list; }, []); const activeMinutes = merged.reduce((sum, row) => sum + row.end - row.start, 0); const breakMinutes = merged.slice(1).reduce((sum, row, index) => sum + row.start - merged[index].end, 0); const presenceMinutes = merged.length ? merged.at(-1).end - merged[0].start : 0;
    if (presenceMinutes > 1440) errors.push('Daily presence cannot exceed 24 hours; check Job order and AM/PM.');
    return {
      ok: errors.length === 0 && intervals.length === jobs.length && jobs.length > 0,
      errors,
      intervals,
      presenceMinutes,
      breakMinutes,
      netActiveMinutes: activeMinutes
    };
  }

  function validateDailyReport(raw = {}) {
    const report = {
      date: text(raw.date, 10),
      operatorCode: text(raw.operatorCode, 80).toUpperCase(),
      machine: text(raw.machine, 40).toUpperCase(),
      shift: text(raw.shift, 1).toUpperCase(),
      jobs: asArray(raw.jobs).map(normalizeJob).filter(job => job.name || job.partNo || job.actual || job.activeMinutes),
      dailySalary: number(raw.dailySalary),
      note: text(raw.note, 500)
    };
    const errors = [];
    if (!validIsoDate(report.date)) errors.push('Valid report date is required.');
    if (!report.operatorCode) errors.push('Operator mapping is missing.');
    if (!MACHINES.some(row => row.code === report.machine)) errors.push('Valid machine is required.');
    if (!['A', 'B'].includes(report.shift)) errors.push('Shift must be A or B.');
    if (!report.jobs.length || report.jobs.length > 3) errors.push('One to three jobs are required.');
    if (new Set(report.jobs.map(job => job.number)).size !== report.jobs.length || report.jobs.some(job => ![1, 2, 3].includes(job.number))) errors.push('Job numbers must be unique 1–3.');
    if (!Number.isFinite(report.dailySalary) || report.dailySalary < 0) errors.push('Daily salary must be zero or higher.');
    report.jobs.forEach((job, index) => {
      const label = `Job ${job.number || index + 1}`;
      if (!job.name) errors.push(`${label}: name is required.`);
      if (!job.parts.length || job.parts.length > 4) errors.push(`${label}: one to four Part / Operation rows are required.`);
      if (new Set(job.parts.map(part => part.number)).size !== job.parts.length || job.parts.some(part => ![1, 2, 3, 4].includes(part.number))) errors.push(`${label}: Part numbers must be unique 1–4.`);
      job.parts.forEach(part => {
        const partLabel = `${label} Part ${part.number}`;
        if (!part.partNo) errors.push(`${partLabel}: part number is required.`);
        if (!MACHINES.some(machine => machine.code === part.machine)) errors.push(`${partLabel}: CNC/VMC/VTL machine is required.`);
        if (!PART_SIDES.includes(part.side)) errors.push(`${partLabel}: Side 1–4 is required.`);
        if (!(part.cycleMinutes > 0)) errors.push(`${partLabel}: cycle time must be greater than zero.`);
        if (!Number.isInteger(part.rpm) || part.rpm < 1 || part.rpm > 100000) errors.push(`${partLabel}: RPM must be a whole number from 1 to 100000.`);
        if (!Number.isFinite(part.sideRate) || part.sideRate < 0) errors.push(`${partLabel}: customer side rate must be zero or higher.`);
        if (part.screenCapture && (!part.screenCapture.storagePath || !part.screenCapture.confirmed || !['COMPLETE', 'NEEDS_REVIEW'].includes(part.screenCapture.status))) errors.push(`${partLabel}: screen OCR values must be reviewed and confirmed.`);
      });
      if (!MACHINES.some(machine => machine.code === job.workMachine)) errors.push(`${label}: இன்று இயக்கிய primary machine தேவை.`);
      if (job.workMachine && !job.parts.some(part => part.machine === job.workMachine)) errors.push(`${label}: primary machine இந்த Job Part / Side-ல் இருக்க வேண்டும்.`);
      if (!whole(job.actual) || !whole(job.good) || !whole(job.rejected)) errors.push(`Job ${index + 1}: quantities must be whole numbers.`);
      if (!(job.activeMinutes > 0)) errors.push(`Job ${index + 1}: active minutes must be greater than zero.`);
      if (job.good + job.rejected !== job.actual) errors.push(`Job ${index + 1}: good + rejected must equal actual quantity.`);
      if (!whole(job.coolantCount) || !whole(job.oilCount)) errors.push(`Job ${index + 1}: coolant and oil counts must be whole numbers.`);
      if (!sideFields(job).some(side => side.route !== 'NONE')) errors.push(`Job ${index + 1}: configure at least one Side 1–4 routing process.`);
      if (job.insertUsed && (!job.insertUsages.length || job.insertUsages.length > 6)) errors.push(`${label}: select one to six issued inserts, or choose No insert used.`);
      if (!job.insertUsed && job.insertUsages.length) errors.push(`${label}: insert links are not allowed when No insert used is selected.`);
      if (job.insertUsages.some(row => !row.issueId)) errors.push(`${label}: every insert slot must link to an actual issue record.`);
      if (new Set(job.insertUsages.map(row => row.issueId)).size !== job.insertUsages.length) errors.push(`${label}: the same issued insert cannot be selected twice.`);
      if (job.insertUsages.some(row => !Number.isInteger(row.slot) || row.slot < 1 || row.slot > 6) || new Set(job.insertUsages.map(row => row.slot)).size !== job.insertUsages.length) errors.push(`${label}: insert slot numbers must be unique 1–6.`);
    });
    const timeline = workTimeline(report.jobs);
    if (!timeline.ok) errors.push(...timeline.errors);
    return { ok: errors.length === 0, errors, value: report };
  }

  function reportTotals(report = {}) {
    const jobs = asArray(report.jobs).map(normalizeJob);
    const timeline = workTimeline(jobs);
    const totals = jobs.reduce((sum, job) => {
      const machineCycle = jobMachineCycle(job, job.workMachine || text(report.machine, 40).toUpperCase());
      const target = machineCycle > 0 ? job.activeMinutes / machineCycle : 0;
      sum.target += target;
      sum.actual += job.actual;
      sum.good += job.good;
      sum.rejected += job.rejected;
      sum.machineActiveMinutes += job.activeMinutes;
      sum.coolantCount += job.coolantCount;
      sum.oilCount += job.oilCount;
      sum.completedJobs += job.status === 'JOB COMPLETE' ? 1 : 0;
      sum.partOperations += job.parts.length;
      sum.linkedInserts += job.insertUsages.length;
      const rate = jobRateAnalysis(job, report.machineRates); sum.todayRevenue += rate.todayRevenue; sum.todayCostMin += rate.todayCostMin; sum.todayCostMax += rate.todayCostMax; sum.profitableJobs += rate.rateStatus === 'PROFIT' ? 1 : 0; sum.borderlineJobs += rate.rateStatus === 'BORDERLINE' ? 1 : 0; sum.notSuitableJobs += rate.rateStatus === 'NOT SUITABLE' ? 1 : 0; sum.rateIncompleteJobs += ['RATE NOT SET', 'CYCLE NOT SET', 'QUOTE NOT SET'].includes(rate.rateStatus) ? 1 : 0;
      return sum;
    }, { target: 0, actual: 0, good: 0, rejected: 0, netActiveMinutes: 0, machineActiveMinutes: 0, coolantCount: 0, oilCount: 0, completedJobs: 0, partOperations: 0, linkedInserts: 0, todayRevenue: 0, todayCostMin: 0, todayCostMax: 0, profitableJobs: 0, borderlineJobs: 0, notSuitableJobs: 0, rateIncompleteJobs: 0 });
    totals.netActiveMinutes = timeline.ok ? timeline.netActiveMinutes : totals.machineActiveMinutes;
    totals.activeMinutes = totals.netActiveMinutes;
    totals.presenceMinutes = timeline.ok ? timeline.presenceMinutes : totals.netActiveMinutes;
    totals.breakMinutes = timeline.ok ? timeline.breakMinutes : 0;
    totals.runningJobs = Math.max(0, jobs.length - totals.completedJobs);
    totals.dailySalary = Math.max(0, number(report.dailySalary));
    totals.labourCostPerGood = totals.good > 0 ? totals.dailySalary / totals.good : null;
    totals.estimatedMarginMin = totals.todayRevenue - totals.todayCostMax; totals.estimatedMarginMax = totals.todayRevenue - totals.todayCostMin;
    return totals;
  }

  function parseVoiceCommand(transcript) {
    const replacements = [
      [/(^|[^\p{L}\p{N}])(one|ஒன்று|ஒன்னு|ஒன்)(?=$|[^\p{L}\p{N}])/giu, '1'],
      [/(^|[^\p{L}\p{N}])(two|இரண்டு|ரெண்டு|டூ)(?=$|[^\p{L}\p{N}])/giu, '2'],
      [/(^|[^\p{L}\p{N}])(three|மூன்று|மூணு|த்ரீ)(?=$|[^\p{L}\p{N}])/giu, '3'],
      [/(^|[^\p{L}\p{N}])(four|நான்கு|நாலு|ஃபோர்)(?=$|[^\p{L}\p{N}])/giu, '4'],
      [/(^|[^\p{L}\p{N}])(five|ஐந்து|அஞ்சு|ஃபைவ்)(?=$|[^\p{L}\p{N}])/giu, '5'],
      [/(^|[^\p{L}\p{N}])(six|ஆறு|சிக்ஸ்)(?=$|[^\p{L}\p{N}])/giu, '6']
    ];
    let source = text(transcript, 500).toLowerCase();
    replacements.forEach(([pattern, value]) => { source = source.replace(pattern, (_, prefix) => `${prefix}${value}`); });
    source = source.replace(/[,;]/g, ' ').replace(/\s+/g, ' ').trim();
    const numberAfter = pattern => { const match = source.match(pattern); return match ? Number(match[1]) : null; };
    const jobNumber = numberAfter(/(?:job|ஜாப்|வேலை)\s*[-:]?\s*([1-3])/iu);
    let partNumber = numberAfter(/(?:part|பார்ட்)\s*[-:]?\s*([1-4])/iu);
    let sideNumber = numberAfter(/(?:side|சைடு)\s*[-:]?\s*([1-4])/iu);
    if (sideNumber == null) {
      if (/(?:first|ஃபர்ஸ்ட்|முதல்)\s*(?:side|சைடு)/iu.test(source)) sideNumber = 1;
      else if (/(?:second|செகண்ட்|இரண்டாவது|ரெண்டாவது)\s*(?:side|சைடு)/iu.test(source)) sideNumber = 2;
      else if (/(?:third|தேர்ட்|மூன்றாவது)\s*(?:side|சைடு)/iu.test(source)) sideNumber = 3;
      else if (/(?:fourth|ஃபோர்த்|நான்காவது)\s*(?:side|சைடு)/iu.test(source)) sideNumber = 4;
    }
    if (partNumber == null && sideNumber != null) partNumber = sideNumber;
    let machine = '';
    const cnc = source.match(/(?:cnc|சிஎன்சி|சி\s*என்\s*சி)\s*[-:]?\s*([1-5])/iu);
    if (cnc) machine = `CNC-${cnc[1]}`;
    else if (/(?:vmc|விஎம்சி|வி\s*எம்\s*சி)/iu.test(source)) machine = 'VMC-1';
    else if (/(?:vtl|விடிஎல்|விடிஎல்|விடிஎல்|வி\s*டி\s*எல்)/iu.test(source)) machine = 'VTL-1';
    const cycleMinutes = numberAfter(/(?:cycle(?:\s*time)?|சைக்கிள்(?:\s*டைம்)?)\s*[-:=]?\s*([0-9]+(?:\.[0-9]+)?)/iu);
    const rpm = numberAfter(/(?:rpm|ஆர்பிஎம்|ஆர்\s*பி\s*எம்)\s*[-:=]?\s*([0-9]{1,6})/iu);
    const sideRate = numberAfter(/(?:rate|ரேட்|ரேட்டு)\s*[-:=]?\s*(?:₹|rs\.?|ரூபாய்)?\s*([0-9]+(?:\.[0-9]+)?)/iu);
    const program = source.match(/(?:program(?:\s*(?:no|number))?|ப்ரோகிராம்(?:\s*நம்பர்)?)\s*[-:=]?\s*([a-z0-9._/-]+)/iu);
    const partNoMatch = source.match(/(?:part\s*(?:no|number)|பார்ட்\s*நம்பர்)\s*[-:=]?\s*([a-z0-9._/-]+)/iu);
    const fields = { jobNumber, partNumber: partNumber || 1, side: sideNumber ? `SIDE-${sideNumber}` : '', machine, cycleMinutes, rpm, sideRate, programNo: program?.[1]?.toUpperCase() || '', partNo: partNoMatch?.[1]?.toUpperCase() || '' };
    const changes = Object.entries(fields).filter(([key, value]) => !['jobNumber', 'partNumber'].includes(key) && value !== '' && value != null);
    return { ok: Boolean(jobNumber && changes.length), transcript: source, fields, error: !jobNumber ? 'Say Job 1, Job 2 or Job 3.' : !changes.length ? 'Say a machine, side, cycle time, RPM, rate, program or part number.' : '' };
  }

  function edgePerformanceRecords(issues = {}, inserts = {}) {
    const masterFor = sku => inserts[safeKey(text(sku, 80).toUpperCase())] || objectValues(inserts).find(row => row.sku === sku) || {};
    const records = [];
    objectValues(issues).forEach(issue => {
      const master = masterFor(issue.sku); const expected = Math.max(0, number(issue.expectedPartsPerEdge != null ? issue.expectedPartsPerEdge : master.expectedPartsPerEdge));
      objectValues(issue.lifeEvents).forEach((event, index) => {
        const metrics = event.metrics || event; const edges = Math.max(1, Math.trunc(number(metrics.edgesUsed, 1))); const good = Math.max(0, number(metrics.goodParts)); const goodPerEdge = good / edges;
        records.push({ issueId: issue.issueId || '', sku: issue.sku || '', insertName: issue.insertName || master.name || '', brand: issue.brand || master.brand || '', grade: issue.grade || master.grade || '', operatorCode: issue.operatorCode || '', machine: issue.machine || '', job: issue.job || '', partNo: issue.partNo || '', action: event.action || '', edgeFrom: number(event.edgeFrom, index + 1), edgeTo: number(event.edgeTo, number(event.edgeFrom, index + 1) + edges - 1), edgesUsed: edges, goodParts: good, rejectedParts: Math.max(0, number(metrics.rejectedParts)), cuttingMinutes: Math.max(0, number(metrics.cuttingMinutes)), goodPerEdge, expectedPartsPerEdge: expected, quality: expected <= 0 ? 'NOT SET' : goodPerEdge >= expected ? 'GOOD' : 'POOR', createdAt: event.createdAt || issue.closedAt || issue.updatedAt || 0 });
      });
    });
    return records;
  }

  function edgePerformanceSummary(records = []) {
    const groups = new Map();
    asArray(records).forEach(row => {
      const expected = Math.max(0, number(row.expectedPartsPerEdge));
      const key = [row.sku, row.machine, row.job, row.partNo, expected].map(value => String(value || '')).join('\u001f');
      const current = groups.get(key) || { sku: row.sku || '', insertName: row.insertName || '', brand: row.brand || '', grade: row.grade || '', machine: row.machine || '', job: row.job || '', partNo: row.partNo || '', expectedPartsPerEdge: expected, samples: 0, edges: 0, goodParts: 0, rejectedParts: 0, cuttingMinutes: 0, goodSamples: 0, poorSamples: 0, latestAt: 0 };
      current.samples += 1; current.edges += Math.max(1, number(row.edgesUsed, 1)); current.goodParts += Math.max(0, number(row.goodParts)); current.rejectedParts += Math.max(0, number(row.rejectedParts)); current.cuttingMinutes += Math.max(0, number(row.cuttingMinutes)); current.goodSamples += row.quality === 'GOOD' ? 1 : 0; current.poorSamples += row.quality === 'POOR' ? 1 : 0; current.latestAt = Math.max(current.latestAt, number(row.createdAt)); groups.set(key, current);
    });
    return [...groups.values()].map(row => {
      const averageGoodPerEdge = row.edges > 0 ? row.goodParts / row.edges : 0;
      const quality = row.expectedPartsPerEdge <= 0 ? 'NOT SET' : averageGoodPerEdge >= row.expectedPartsPerEdge ? 'GOOD' : 'POOR';
      return { ...row, averageGoodPerEdge, goodRate: row.samples > 0 ? row.goodSamples / row.samples * 100 : 0, quality, purchaseAction: quality === 'GOOD' ? 'CONTINUE' : quality === 'POOR' ? 'REVIEW' : 'SET TARGET' };
    });
  }

  function csvCell(value) {
    const string = String(value == null ? '' : value);
    const protectedValue = /^[=+\-@]/.test(string) ? `'${string}` : string;
    return `"${protectedValue.replace(/"/g, '""')}"`;
  }

  return Object.freeze({
    VERSION, ISSUE_MODES, RETURN_ACTIONS, EXCEPTION_CODES, ROUTES, JOB_STATUSES, PART_SIDES, MACHINES, DEFAULT_MACHINE_RATES, OPERATION_STATES, MAX_OPERATOR_MACHINES,
    asArray, objectValues, text, number, whole, nowIso, today, validIsoDate, newId, safeKey,
    escapeHtml, money, normalizeMachineRate, machineRateFor, validateMachineRates, partRateAnalysis, cyclePerformance, jobPlanningEstimate, normalizeOperation, normalizeProductionBatch, productionBatchStatus, activeBatchOperation, operatorMachineLoad, validateOperatorMachineAssignment, validateOperatorConcurrentStart, transitionProductionBatch, drawingSuggestions, normalizeInsert, validateInsert, ledgerDeltaAt, availableStock, validMonthKey, monthKey, monthKeysEnding, normalizeCompanyProfile, normalizeMonthlyTurnover, issueBusinessDate, consumedIssueQuantity, dashboardBusinessMetrics, monthlyBusinessPerformance,
    normalizeIssueRequest, validateIssueRequest, normalizeReturnRequest,
    validateReturnRequest, lifeMetrics, parse12HourTime, format12HourTime, routeLabel,
    sideFields, jobProcessStatus, jobSideSummary, normalizePart, normalizeInsertUsage,
    normalizeJob, jobMachineCycle, jobPartSummary, jobRateAnalysis, workTimeline, validateDailyReport,
    reportTotals, parseVoiceCommand, edgePerformanceRecords, edgePerformanceSummary, csvCell
  });
});
