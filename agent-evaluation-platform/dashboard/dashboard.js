const LEVEL_ORDER = Array.from({length:13}, (_, index) => `L${index + 1}`);
const STORAGE_KEY = 'agent-evaluation-platform:dashboard:v1';
const preferences = loadPreferences();
const state = { runs:[], run:null, manifest:{ candidates:[], tests:[] }, selectedRun:null, candidateDetails:null, view:preferences.view === 'ranking' ? 'ranking' : 'results', shuttingDown:false };
const params = new URLSearchParams(location.search);
const candidateId = params.get('candidate');
const candidatePage = location.pathname === '/candidate' || Boolean(candidateId);

function loadPreferences() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}'); }
  catch { return {}; }
}

function savePreferences() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ selectedRun:state.selectedRun, view:state.view })); }
  catch { /* Local storage can be disabled; live updates still work. */ }
}

const esc = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[character]));
const dash = value => value === null || value === undefined || value === '' ? '—' : value;
const metric = (value, suffix = '', decimals = 2) => value === null || value === undefined || value === '' ? '—' : `${Number(value).toLocaleString(undefined,{ maximumFractionDigits:decimals })}${suffix}`;
const testLabel = test => test?.name ? `${test.test} — ${test.name}` : String(test?.test ?? '');
const passResult = result => ['pass','pass_with_discrepancy'].includes(result);
const resultLabel = result => !result || ['skipped','not_tested'].includes(result) ? 'Not Tested' : String(result).replaceAll('_',' ').toUpperCase();
const resultClass = result => !result || result === 'skipped' ? 'not_tested' : result;

async function json(path, options) {
  const response = await fetch(path, { cache:'no-store', ...options });
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

function allCandidates(run = state.run) {
  const merged = new Map();
  const configured = run?.options?.targets?.length ? run.options.targets : state.manifest.candidates;
  for (const candidate of configured ?? []) merged.set(candidate.model, { ...candidate });
  for (const model of run?.models ?? []) merged.set(model.model ?? 'offline', { ...(merged.get(model.model) ?? {}), ...model, model:model.model ?? 'offline' });
  return [...merged.values()].map(candidate => ({ ...candidate, name:candidate.name ?? candidate.model ?? 'Offline response' }));
}

function allTests(run = state.run) {
  const merged = new Map((state.manifest.tests ?? []).map(test => [test.test, test]));
  for (const model of run?.models ?? []) for (const result of model.qualificationResults ?? []) merged.set(result.test, { test:result.test, level:result.level });
  return [...merged.values()].sort((left,right) => LEVEL_ORDER.indexOf(String(left.level)) - LEVEL_ORDER.indexOf(String(right.level)) || String(left.test).localeCompare(String(right.test),undefined,{numeric:true}));
}

function testCode(test, tests = allTests()) {
  return String(test.testId ?? test.test ?? test.level);
}

function rowsFor(candidate, run = state.run) {
  const report = run?.models?.find(model => (model.model ?? 'offline') === candidate.model);
  const byTest = new Map((report?.qualificationResults ?? []).map(result => [result.test,result]));
  return allTests(run).map(test => {
    const result = byTest.get(test.test);
    const active = report?.activeTest?.test === test.test;
    return { ...test, ...(result ?? {}), result:active ? 'running' : (result?.result ?? 'not_tested') };
  });
}

function candidateUrl(model) {
  const query = new URLSearchParams({ candidate:model });
  if (state.selectedRun) query.set('run',state.selectedRun);
  return `/candidate?${query}`;
}

function updateRunSelect() {
  const select = document.getElementById('runSelect');
  if (!state.selectedRun) state.selectedRun = params.get('run') || preferences.selectedRun || state.runs[0]?.runId || null;
  if (state.selectedRun && !state.runs.some(run => run.runId === state.selectedRun)) state.selectedRun = state.runs[0]?.runId ?? null;
  select.disabled = !state.runs.length;
  select.innerHTML = state.runs.length
    ? state.runs.map(run => `<option value="${esc(run.runId)}" ${run.runId===state.selectedRun?'selected':''}>${esc(run.runId)} · ${esc(run.status)}</option>`).join('')
    : '<option>No runs yet</option>';
  select.onchange = async () => {
    state.selectedRun = select.value;
    savePreferences();
    const query = new URLSearchParams(location.search);
    query.set('run',state.selectedRun);
    history.replaceState(null,'',`${location.pathname}?${query}`);
    state.run = await json(`/api/runs/${encodeURIComponent(state.selectedRun)}`);
    await refreshCandidateDetails(true);
    render();
  };
}

function runSummary() {
  const candidates = allCandidates();
  const results = candidates.flatMap(candidate => rowsFor(candidate));
  const completed = results.filter(result => !['skipped','not_tested','running','invalid_environment','blocked_by_prerequisite','execution_incomplete'].includes(result.result));
  const scores = state.run?.weighted?.candidates?.map(candidate => candidate.score).filter(Number.isFinite) ?? [];
  return { candidates:candidates.length, tests:completed.length, pass:completed.filter(result => passResult(result.result)).length, fail:completed.filter(result => result.result === 'fail').length, score:scores.length ? Math.max(...scores) : null };
}

function renderHeader() {
  const run = state.run;
  setText('runMeta',run ? `Run ${run.runId} · ${run.status ?? 'running'} · ${new Date(run.generatedAt).toLocaleString()}` : 'No qualification run yet · showing configured candidates');
  const summary = runSummary();
  const stats=document.getElementById('stats');
  stats.hidden=!candidatePage;
  const values=[['candidates','Candidates',summary.candidates],['tests','Tests completed',summary.tests],['pass','Pass',summary.pass],['fail','Fail',summary.fail],['score','Top provisional score',summary.score]];
  if (!stats.children.length) stats.innerHTML=values.map(([key,label,value]) => `<div class="stat"><span class="muted">${label}</span><strong data-stat="${key}">${esc(dash(value))}</strong></div>`).join('');
  else for (const [key,,value] of values) { const node=stats.querySelector(`[data-stat="${key}"]`); if (node) node.textContent=dash(value); }
}

function renderMain() {
  const content = document.getElementById('content');
  if (!allCandidates().length || !allTests().length) {
    content.innerHTML = '<div class="empty">No configured candidates or qualification tests were found.</div>';
    return;
  }
  content.innerHTML = `<section class="panel"><div class="panel-head"><div><div class="eyebrow">Candidate comparison</div><h2>${state.view === 'results' ? 'Qualification matrix' : 'Candidate ranking'}</h2></div><div class="panel-actions"><button id="viewToggle" class="button" type="button">${state.view === 'results' ? 'View ranking' : 'View test results'}</button></div></div>${state.view === 'results' ? resultsTable() : rankingTable()}</section>`;
  document.getElementById('viewToggle').onclick = () => { state.view = state.view === 'results' ? 'ranking' : 'results'; savePreferences(); renderMain(); };
}

function resultsTable() {
  const tests=allTests();
  const headers=tests.map(test => `<th title="${esc(testLabel(test.test))}">${esc(testCode(test,tests))}</th>`).join('');
  const body=allCandidates().map(candidate => {
    const results=new Map(rowsFor(candidate).map(result => [result.test,result]));
    const cells=tests.map(test => { const result=results.get(test.test); return `<td title="${esc(testLabel(test.test))}" data-result-cell data-model="${esc(candidate.model)}" data-test="${esc(test.test)}"><span class="badge ${esc(resultClass(result?.result))}">${esc(resultLabel(result?.result))}</span></td>`; }).join('');
    return `<tr><th scope="row"><a class="candidate-link" title="${esc(candidate.model)}" href="${candidateUrl(candidate.model)}">${esc(candidate.name)}</a></th>${cells}</tr>`;
  }).join('');
  return `<div class="table-wrap matrix-wrap"><table class="matrix"><thead><tr><th>Model</th>${headers}</tr></thead><tbody>${body}</tbody></table></div>`;
}

function rankingTable() {
  const body = rankings().map((candidate,index) => `<tr><td>${index+1}</td><td><a class="candidate-link" href="${candidateUrl(candidate.model)}">${esc(candidate.name)}</a><div class="muted">${esc(candidate.model)}</div></td><td>${esc(candidate.highestLabel)}</td><td>${metric(candidate.provisionalScore,'',0)}</td><td>${metric(candidate.scoredCoveragePercent,'%',0)}</td><td>${metric(candidate.averagePromptTokens,'',0)}</td><td>${metric(candidate.averageOutputTokens,'',0)}</td><td>${metric(candidate.averageTotalTokens,'',0)}</td><td>${metric(candidate.averageTokensPerSecond)}</td><td>${metric(candidate.averageTtftMs,' ms')}</td><td>${esc(candidate.status)}</td></tr>`).join('');
  return `<div class="table-wrap"><table><thead><tr><th>Rank</th><th>Candidate</th><th>Highest test passed</th><th>Provisional score</th><th>Scored coverage</th><th>Avg prompt tokens</th><th>Avg output tokens</th><th>Avg total tokens</th><th>Avg tok/s</th><th>Avg TTFT</th><th>Status / failure</th></tr></thead><tbody>${body}</tbody></table></div>`;
}

function rankings() {
  return allCandidates().map(candidate => {
    const rows = rowsFor(candidate);
    const completed = rows.filter(row => !['skipped','not_tested','running'].includes(row.result));
    const levels = new Map();
    for (const row of completed) { const group=levels.get(String(row.level))??[]; group.push(row); levels.set(String(row.level),group); }
    const passed = LEVEL_ORDER.filter(level => levels.get(level)?.length && levels.get(level).every(row => passResult(row.result)));
    const highest = passed.at(-1) ?? null;
    const failed = completed.find(row => row.result === 'fail');
    const report = state.run?.models?.find(model => model.model === candidate.model);
    const weighted = state.run?.weighted?.candidates?.find(item => item.candidate === candidate.model);
    const performance = completed.map(row => row.performance).filter(Boolean);
    return { ...candidate, highestIndex:highest ? LEVEL_ORDER.indexOf(highest) : -1, highestLabel:highest ? `Level ${highest} ✓` : 'None', provisionalScore:weighted?.provisionalScore??weighted?.score??null,scoredCoveragePercent:weighted?.scoredCoveragePercent??null, averagePromptTokens:average(performance,'promptTokens'), averageOutputTokens:average(performance,'outputTokens'), averageTotalTokens:average(performance,'totalTokens'), averageTokensPerSecond:average(performance,'tokensPerSecond'), averageTtftMs:average(performance,'timeToFirstVisibleTokenMs'), status:failed ? `L${failed.level}: ${discrepancyText(failed) || 'qualification failure'}` : (report?.status ? String(report.status).replaceAll('_',' ') : 'Not Tested') };
  }).sort((left,right) => right.highestIndex-left.highestIndex || nullLast(left.averageTtftMs,right.averageTtftMs) || descendingNullLast(left.averageOutputTokens,right.averageOutputTokens) || left.name.localeCompare(right.name));
}

function average(rows, field) { const values=rows.map(row=>row?.[field]).filter(value=>value!==null&&value!==undefined&&value!=='').map(Number).filter(Number.isFinite); return values.length ? values.reduce((sum,value)=>sum+value,0)/values.length : null; }
function nullLast(left,right) { if(left===null&&right===null)return 0;if(left===null)return 1;if(right===null)return -1;return left-right; }
function descendingNullLast(left,right) { if(left===null&&right===null)return 0;if(left===null)return 1;if(right===null)return -1;return right-left; }
function discrepancyText(result) { return (result.discrepancies ?? []).map(discrepancy => `${discrepancy.question ? `Q${discrepancy.question} ` : ''}${discrepancy.classification ?? discrepancy.type ?? 'discrepancy'}`).join('; '); }

async function refreshCandidateDetails(force = false) {
  if (!candidatePage || !candidateId || !state.selectedRun) { state.candidateDetails=null; return; }
  if (!force && state.candidateDetails?.run?.updatedAt === state.run?.updatedAt) return;
  try { state.candidateDetails=await json(`/api/runs/${encodeURIComponent(state.selectedRun)}/candidates/${encodeURIComponent(candidateId)}`); }
  catch { state.candidateDetails=null; }
}

function renderCandidate() {
  const candidate = allCandidates().find(item => item.model === candidateId) ?? { model:candidateId, name:candidateId };
  const details = state.candidateDetails?.candidate;
  const rows = details?.qualificationResults ?? rowsFor(candidate);
  const status = details?.status ?? 'not_tested';
  const backQuery = state.selectedRun ? `?run=${encodeURIComponent(state.selectedRun)}` : '';
  const live = state.run?.liveProgress?.model === candidate.model ? state.run.liveProgress : details?.liveProgress;
  document.getElementById('content').innerHTML = `<a class="back" href="/${backQuery}">← All candidates</a><section class="candidate-card"><div class="candidate-head"><div><div class="eyebrow">Candidate</div><h2>${esc(candidate.name)}</h2><div class="muted">${esc(candidate.model)}</div></div><span class="badge ${esc(resultClass(status))}">${esc(resultLabel(status))}</span></div>${details?.activeTest ? `<div class="active">Running ${esc(testCode(details.activeTest,rows))} — ${esc(testLabel(details.activeTest.test))}</div>` : ''}${live ? streamPanel(live) : ''}<div class="table-wrap">${candidateTable(rows)}</div>${outputCards(rows)}</section>`;
  bindLiveOutput();
}

function candidateTable(rows) {
  const body = rows.map(result => `<tr><td><strong>${esc(testCode(result,rows))}</strong></td><td>${esc(testLabel(result.test))}</td><td><span class="badge ${esc(resultClass(result.result))}">${esc(resultLabel(result.result))}</span></td><td>${esc(discrepancyText(result) || '—')}</td><td>${metric(result.performance?.promptTokens,'',0)}</td><td>${metric(result.performance?.outputTokens,'',0)}</td><td>${metric(result.performance?.tokensPerSecond)}</td><td>${metric(result.performance?.timeToFirstVisibleTokenMs,' ms')}</td><td>${metric(result.performance?.totalTimeMs,' ms')}</td></tr>`).join('');
  return `<table><thead><tr><th>Test</th><th>Description</th><th>Result</th><th>Discrepancies</th><th>Prompt</th><th>Output</th><th>tok/s</th><th>Visible TTFT</th><th>Total time</th></tr></thead><tbody>${body}</tbody></table>`;
}

function streamPanel(progress) {
  return `<section id="liveStream" class="stream"><div class="stream-grid"><strong>Live output · <span data-live-stage>${esc(progress.stage ?? 'streaming')}</span></strong><span>Visible: <span data-live-visible>${metric(progress.visibleCharacters ?? 0,' chars',0)}</span></span><span>Reasoning: <span data-live-reasoning>${metric(progress.reasoningCharacters ?? 0,' chars',0)}</span></span><span>Elapsed: <span data-live-elapsed>${metric(progress.elapsedMs,' ms')}</span></span></div><pre id="liveOutput" class="output live-output" tabindex="0" aria-label="Live model output">${esc(liveOutputText(progress))}</pre></section>`;
}

function liveOutputText(progress) {
  const visible=progress.visibleOutput || progress.visiblePreview || '';
  const reasoning=progress.reasoningOutput || progress.reasoningPreview || '';
  if (visible && reasoning) return `Reasoning\n${reasoning}\n\nVisible response\n${visible}`;
  return visible || reasoning || 'Waiting for generated content…';
}

function bindLiveOutput() {
  const output=document.getElementById('liveOutput');
  if (!output) return;
  output.dataset.autoFollow='true';
  output.addEventListener('scroll',() => { output.dataset.autoFollow=String(isNearBottom(output)); },{ passive:true });
  requestAnimationFrame(() => { output.scrollTop=output.scrollHeight; });
}

function updateLiveProgress(progress) {
  const panel=document.getElementById('liveStream');
  if (!progress) { panel?.remove(); return; }
  if (!panel) { renderCandidate(); return; }
  const output=document.getElementById('liveOutput');
  const follow=output?.dataset.autoFollow !== 'false';
  panel.querySelector('[data-live-stage]').textContent=progress.stage ?? 'streaming';
  panel.querySelector('[data-live-visible]').textContent=metric(progress.visibleCharacters ?? 0,' chars',0);
  panel.querySelector('[data-live-reasoning]').textContent=metric(progress.reasoningCharacters ?? 0,' chars',0);
  panel.querySelector('[data-live-elapsed]').textContent=metric(progress.elapsedMs,' ms');
  if (output) {
    const scrollTop=output.scrollTop;
    output.textContent=liveOutputText(progress);
    if (follow) requestAnimationFrame(() => { output.scrollTop=output.scrollHeight; });
    else output.scrollTop=scrollTop;
  }
}

function isNearBottom(element) { return element.scrollHeight-element.scrollTop-element.clientHeight < 32; }

function outputCards(rows) {
  const evidence = rows.filter(row => row.evidencePayload || row.visibleResponse || row.rawOutputStream);
  if (!evidence.length) return '<div class="empty">Complete model output will appear here as tests finish.</div>';
  return `<div class="output-list"><div><div class="eyebrow">Saved evidence</div><h2>Complete output streams</h2></div>${evidence.map(row => { const payload=row.evidencePayload??row; return `<details class="output-card"><summary>${esc(testCode(row,rows))} · ${esc(testLabel(row.test))} · ${esc(resultLabel(row.result))}</summary>${outputSection('Visible response',payload.visibleResponse)}${outputSection('Reasoning response',payload.reasoningResponse)}${outputSection('Raw backend stream',payload.rawOutputStream)}${outputSection('Test prompt',payload.extractedTestPrompt)}</details>`; }).join('')}</div>`;
}
function outputSection(label,value) { return value === null || value === undefined || value === '' ? '' : `<div class="output-section"><h3>${esc(label)}</h3><pre class="output">${esc(value)}</pre></div>`; }

function render() { updateRunSelect(); renderHeader(); candidatePage ? renderCandidate() : renderMain(); }

function setText(id,value) { const node=document.getElementById(id); if (node && node.textContent !== String(value)) node.textContent=String(value); }

function resultSignature(run) {
  return JSON.stringify((run?.models ?? []).map(model => [model.model,model.status,(model.qualificationResults ?? []).map(result => [result.test,result.result,result.discrepancies?.length ?? 0])]));
}

function matrixStructureSignature(run = state.run) {
  return JSON.stringify([allCandidates(run).map(candidate=>candidate.model),allTests(run).map(test=>test.test)]);
}

function patchResultsMatrix() {
  if (candidatePage || state.view !== 'results' || !document.querySelector('.matrix')) return false;
  const cells=[...document.querySelectorAll('[data-result-cell]')];
  for (const candidate of allCandidates()) for (const result of rowsFor(candidate)) {
    const cell=cells.find(node=>node.dataset.model===candidate.model&&node.dataset.test===result.test);
    const badge=cell?.querySelector('.badge');
    if (!badge) return false;
    badge.className=`badge ${resultClass(result.result)}`;
    badge.textContent=resultLabel(result.result);
  }
  return true;
}

function preserveCandidateUi(renderAction) {
  const output=document.getElementById('liveOutput');
  const streamState=output ? { top:output.scrollTop, follow:output.dataset.autoFollow } : null;
  const open=[...document.querySelectorAll('.output-card[open] summary')].map(node=>node.textContent);
  renderAction();
  const next=document.getElementById('liveOutput');
  if (next && streamState) { next.scrollTop=streamState.top; next.dataset.autoFollow=streamState.follow ?? 'true'; }
  for (const details of document.querySelectorAll('.output-card')) if (open.includes(details.querySelector('summary')?.textContent)) details.open=true;
}

async function initial() {
  try {
    const snapshot = await json('/api/bootstrap');
    state.runs=snapshot.runs??[]; state.manifest=snapshot.manifest??state.manifest;
    state.selectedRun=params.get('run')||preferences.selectedRun||state.runs[0]?.runId||null;
    if (!state.runs.some(run=>run.runId===state.selectedRun)) state.selectedRun=state.runs[0]?.runId??null;
    savePreferences();
    state.run=state.selectedRun ? (snapshot.run?.runId===state.selectedRun ? snapshot.run : await json(`/api/runs/${encodeURIComponent(state.selectedRun)}`)) : null;
    await refreshCandidateDetails(true);
  } catch (error) { document.getElementById('content').innerHTML=`<div class="empty">Dashboard data is unavailable: ${esc(error.message)}</div>`; }
  render(); connect();
}

function connect() {
  if (state.shuttingDown) return;
  const protocol=location.protocol==='https:'?'wss:':'ws:';
  const socket=new WebSocket(`${protocol}//${location.host}/live`);
  socket.onopen=()=>{document.getElementById('liveDot').classList.add('live');document.getElementById('connection').textContent='Live updates connected'};
  socket.onmessage=async event=>{
    const message=JSON.parse(event.data);
    if(message.type==='server_shutdown'){showShutdown();return}
    if(message.type!=='snapshot')return;
    const previousRun=state.run;
    const previousStructure=matrixStructureSignature(previousRun);
    const previousResults=resultSignature(previousRun);
    state.runs=message.runs??[];
    state.manifest=message.manifest??state.manifest;
    if(!state.selectedRun)state.selectedRun=preferences.selectedRun||(state.runs[0]?.runId??null);
    if(message.run?.runId===state.selectedRun)state.run=message.run;
    savePreferences();
    updateRunSelect();
    renderHeader();
    const progress=state.run?.liveProgress?.model===candidateId?state.run.liveProgress:null;
    if(candidatePage){
      updateLiveProgress(progress);
      if(previousResults!==resultSignature(state.run)){ await refreshCandidateDetails(true); preserveCandidateUi(renderCandidate); }
      return;
    }
    if(previousStructure!==matrixStructureSignature(state.run)){renderMain();return}
    if(previousResults!==resultSignature(state.run) && (state.view==='ranking'||!patchResultsMatrix())) renderMain();
  };
  socket.onclose=()=>{document.getElementById('liveDot').classList.remove('live');document.getElementById('connection').textContent=state.shuttingDown?'Dashboard stopped':'Reconnecting';if(!state.shuttingDown)setTimeout(connect,1000)};
  socket.onerror=()=>socket.close();
}

async function shutdown() {
  if (!confirm('Shut down the local evaluation dashboard? Active model tests will continue, but live browser updates will stop.')) return;
  state.shuttingDown=true;
  try { await json('/api/shutdown',{ method:'POST' }); } catch {}
  showShutdown();
}
function showShutdown() { state.shuttingDown=true;if(!document.querySelector('.shutdown-message'))document.body.insertAdjacentHTML('beforeend','<div class="shutdown-message">Dashboard shut down safely. You may close this tab.</div>'); }
document.getElementById('shutdownButton').onclick=shutdown;
initial();
