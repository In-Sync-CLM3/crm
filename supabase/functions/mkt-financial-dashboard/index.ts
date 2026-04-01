const DASHBOARD_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>In-Sync Revenue Engine — Financial Intelligence</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1"><\/script>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  :root {
    --primary: #3b82f6; --success: #22c55e; --warning: #f59e0b; --danger: #ef4444;
    --bg: #f9fafb; --card-bg: #ffffff; --text-body: #374151; --text-heading: #111827;
    --text-muted: #6b7280; --border: #e5e7eb; --radius: 10px;
  }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background: var(--bg); color: var(--text-body); line-height: 1.5; min-height: 100vh; }
  #breakpoint-banner { display: none; }
  #breakpoint-banner.active { display: block; }
  .breakpoint-alert { background: var(--danger); color: #fff; padding: 10px 20px; font-size: 14px; display: flex; align-items: center; gap: 10px; border-bottom: 1px solid rgba(0,0,0,.1); }
  .breakpoint-alert strong { font-weight: 700; }
  .breakpoint-alert .bp-icon { font-size: 18px; flex-shrink: 0; }
  .breakpoint-alert .bp-meta { color: rgba(255,255,255,.85); margin-left: auto; font-size: 12px; white-space: nowrap; }
  .header { background: var(--card-bg); border-bottom: 1px solid var(--border); padding: 16px 24px; display: flex; flex-wrap: wrap; align-items: center; gap: 12px 24px; }
  .header h1 { font-size: 18px; font-weight: 700; color: var(--text-heading); white-space: nowrap; }
  .header-controls { display: flex; align-items: center; gap: 10px; margin-left: auto; flex-wrap: wrap; }
  .header-controls select, .header-controls button { font-size: 13px; padding: 6px 12px; border: 1px solid var(--border); border-radius: 6px; background: var(--card-bg); color: var(--text-body); cursor: pointer; outline: none; }
  .header-controls select:focus, .header-controls button:focus { border-color: var(--primary); box-shadow: 0 0 0 2px rgba(59,130,246,.15); }
  .btn-refresh { background: var(--primary) !important; color: #fff !important; border-color: var(--primary) !important; font-weight: 600; display: inline-flex; align-items: center; gap: 5px; }
  .btn-refresh:hover { opacity: .9; }
  .last-refresh { font-size: 11px; color: var(--text-muted); white-space: nowrap; }
  .container { max-width: 1360px; margin: 0 auto; padding: 20px 16px; }
  .metric-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 20px; }
  .panel-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; margin-bottom: 20px; }
  .trend-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; margin-bottom: 20px; }
  .full-width { grid-column: 1 / -1; }
  @media (max-width: 767px) {
    .metric-grid { grid-template-columns: repeat(2, 1fr); }
    .panel-grid { grid-template-columns: 1fr; }
    .trend-grid { grid-template-columns: 1fr; }
    .header { padding: 12px 16px; }
    .header h1 { font-size: 15px; }
    .header-controls { margin-left: 0; width: 100%; }
  }
  .card { background: var(--card-bg); border: 1px solid var(--border); border-radius: var(--radius); padding: 20px; position: relative; }
  .card-title { font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: .5px; color: var(--text-muted); margin-bottom: 8px; }
  .card-value { font-size: 28px; font-weight: 800; color: var(--text-heading); line-height: 1.1; }
  .pill { display: inline-block; font-size: 11px; font-weight: 700; padding: 2px 10px; border-radius: 100px; text-transform: uppercase; letter-spacing: .3px; margin-top: 6px; }
  .pill-green { background: #dcfce7; color: #166534; }
  .pill-amber { background: #fef3c7; color: #92400e; }
  .pill-red { background: #fee2e2; color: #991b1b; }
  .panel-header { font-size: 15px; font-weight: 700; color: var(--text-heading); margin-bottom: 16px; padding-bottom: 10px; border-bottom: 1px solid var(--border); }
  .data-table { width: 100%; border-collapse: collapse; font-size: 13px; }
  .data-table th { text-align: left; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: .4px; color: var(--text-muted); padding: 8px 10px; border-bottom: 2px solid var(--border); }
  .data-table td { padding: 10px 10px; border-bottom: 1px solid var(--border); color: var(--text-body); white-space: nowrap; }
  .data-table tbody tr:last-child td { border-bottom: none; }
  .chart-wrap { position: relative; width: 100%; min-height: 240px; }
  .chart-wrap canvas { width: 100% !important; }
  .empty-state { display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 200px; color: var(--text-muted); font-size: 14px; gap: 8px; }
  .empty-state .empty-icon { font-size: 32px; opacity: .4; }
  .loading-overlay { position: fixed; inset: 0; background: rgba(249,250,251,.85); display: flex; align-items: center; justify-content: center; z-index: 9999; transition: opacity .3s; }
  .loading-overlay.hidden { opacity: 0; pointer-events: none; }
  .spinner { width: 36px; height: 36px; border: 3px solid var(--border); border-top-color: var(--primary); border-radius: 50%; animation: spin .7s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
  .table-scroll { overflow-x: auto; }
</style>
</head>
<body>
<div class="loading-overlay" id="loading"><div class="spinner"></div></div>
<div id="breakpoint-banner"></div>
<header class="header">
  <h1>In-Sync Revenue Engine &mdash; Financial Intelligence</h1>
  <div class="header-controls">
    <select id="period-select" title="Period">
      <option value="3">3 Months</option>
      <option value="6">6 Months</option>
      <option value="9">9 Months</option>
      <option value="12" selected>12 Months</option>
      <option value="24">24 Months</option>
    </select>
    <select id="segment-select" title="Segment">
      <option value="all">All Segments</option>
      <option value="india">India</option>
      <option value="international">International</option>
    </select>
    <button class="btn-refresh" id="btn-refresh" title="Refresh data">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
      Refresh
    </button>
    <span class="last-refresh" id="last-refresh">&mdash;</span>
  </div>
</header>
<div class="container">
  <div class="metric-grid" id="metric-grid">
    <div class="card"><div class="card-title">Monthly Recurring Revenue</div><div class="card-value" id="val-mrr">&mdash;</div><div id="pill-mrr"></div></div>
    <div class="card"><div class="card-title">Gross Margin</div><div class="card-value" id="val-gm">&mdash;</div><div id="pill-gm"></div></div>
    <div class="card"><div class="card-title">Blended CAC</div><div class="card-value" id="val-cac">&mdash;</div><div id="pill-cac"></div></div>
    <div class="card"><div class="card-title">LTV : CAC Ratio</div><div class="card-value" id="val-ltvcac">&mdash;</div><div id="pill-ltvcac"></div></div>
  </div>
  <div class="panel-grid">
    <div class="card"><div class="panel-header">CAC by Channel</div><div class="chart-wrap" id="wrap-cac-channel"><canvas id="chart-cac-channel"></canvas></div></div>
    <div class="card"><div class="panel-header">Payback Period by Channel</div><div class="chart-wrap" id="wrap-payback"><canvas id="chart-payback"></canvas></div></div>
  </div>
  <div class="panel-grid">
    <div class="card full-width"><div class="panel-header">LTV by Segment</div><div class="table-scroll"><table class="data-table" id="table-ltv"><thead><tr><th>Segment</th><th>LTV (Best-case)</th><th>LTV (Risk-adj.)</th><th>CAC</th><th>LTV:CAC</th><th>Payback</th><th>Health</th></tr></thead><tbody id="tbody-ltv"></tbody></table></div></div>
  </div>
  <div class="panel-grid">
    <div class="card full-width"><div class="panel-header">MRR Cost Waterfall</div><div class="chart-wrap" id="wrap-waterfall"><canvas id="chart-waterfall"></canvas></div></div>
  </div>
  <div class="panel-header" style="margin-top:8px;">12-Week Trend Lines</div>
  <div class="trend-grid" style="margin-top:12px;">
    <div class="card"><div class="card-title">MRR Growth Rate</div><div class="chart-wrap"><canvas id="chart-trend-mrr"></canvas></div></div>
    <div class="card"><div class="card-title">Blended CAC</div><div class="chart-wrap"><canvas id="chart-trend-cac"></canvas></div></div>
    <div class="card"><div class="card-title">LTV : CAC Ratio</div><div class="chart-wrap"><canvas id="chart-trend-ltvcac"></canvas></div></div>
    <div class="card"><div class="card-title">Gross Margin</div><div class="chart-wrap"><canvas id="chart-trend-gm"></canvas></div></div>
  </div>
</div>
<script>
const CONFIG={SUPABASE_URL:'https://knuewnenaswscgaldjej.supabase.co',SUPABASE_ANON_KEY:'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtudWV3bmVuYXN3c2NnYWxkamVqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI2NjQ5MDcsImV4cCI6MjA4ODI0MDkwN30.g3i9sLO72xrmFwhZ8cnw_v7J8HVbpLF5C5MbqdPzyps'};
function formatCurrency(p){var r=Math.round(p/100);if(Math.abs(r)>=100000)return'\\u20B9'+(r/100000).toFixed(2)+'L';return'\\u20B9'+r.toLocaleString('en-IN')}
function formatCurrencyRupees(r){r=Math.round(r);if(Math.abs(r)>=100000)return'\\u20B9'+(r/100000).toFixed(2)+'L';return'\\u20B9'+r.toLocaleString('en-IN')}
function formatPercent(d){return(d*100).toFixed(1)+'%'}
function formatRatio(n){return n.toFixed(1)+':1'}
function pillHTML(l,t){var c=l==='green'?'pill-green':l==='amber'?'pill-amber':'pill-red';return'<span class="pill '+c+'">'+(t||l)+'</span>'}
function emptyStateHTML(m){return'<div class="empty-state"><div class="empty-icon">&#x1F4CA;</div><div>'+(m||'No data available yet')+'</div></div>'}
async function sbFetch(path){var url=CONFIG.SUPABASE_URL+'/rest/v1/'+path;var res=await fetch(url,{headers:{'apikey':CONFIG.SUPABASE_ANON_KEY,'Authorization':'Bearer '+CONFIG.SUPABASE_ANON_KEY,'Accept':'application/json'}});if(!res.ok)throw new Error('Fetch failed: '+res.status);return res.json()}
var metricsData=[],breakpointsData=[],chartInstances={};
async function loadData(){var period=document.getElementById('period-select').value;var segment=document.getElementById('segment-select').value;var mq='mkt_engine_metrics?period_type=eq.weekly&order=period_end.desc&limit='+(parseInt(period)*4);var bq='mkt_engine_logs?log_type=eq.breakpoint&resolved_at=is.null&order=created_at.desc';try{var[m,b]=await Promise.all([sbFetch(mq),sbFetch(bq)]);metricsData=m||[];breakpointsData=b||[]}catch(e){console.warn('Data fetch error:',e);metricsData=[];breakpointsData=[]}}
function renderBreakpoints(){var el=document.getElementById('breakpoint-banner');if(!breakpointsData.length){el.className='';el.innerHTML='';return}el.className='active';el.innerHTML=breakpointsData.map(function(bp){var name=bp.action||bp.function_name||'Breakpoint';var detail='';try{var d=typeof bp.details==='string'?JSON.parse(bp.details):bp.details;detail=d&&d.trigger?d.trigger:''}catch(e){}var paused='';try{paused=bp.paused_component||''}catch(e){}return'<div class="breakpoint-alert"><span class="bp-icon">&#x26A0;</span><span><strong>'+name+'</strong>'+(detail?' &mdash; '+detail:'')+(paused?' | Paused: '+paused:'')+'</span><span class="bp-meta">'+new Date(bp.created_at).toLocaleDateString()+'</span></div>'}).join('')}
function renderHeadlineMetrics(){var latest=metricsData.length?metricsData[0]:null;if(!latest){document.getElementById('val-mrr').textContent='\\u2014';document.getElementById('val-gm').textContent='\\u2014';document.getElementById('val-cac').textContent='\\u2014';document.getElementById('val-ltvcac').textContent='\\u2014';['pill-mrr','pill-gm','pill-cac','pill-ltvcac'].forEach(function(id){document.getElementById(id).innerHTML=''});return}var mrr=latest.mrr_total?latest.mrr_total/100:0;var mrrTarget=latest.target_mrr?latest.target_mrr/100:mrr;var mrrRatio=mrrTarget>0?mrr/mrrTarget:1;document.getElementById('val-mrr').textContent=formatCurrencyRupees(mrr);var mh='green';if(mrrRatio<0.7)mh='red';else if(mrrRatio<0.9)mh='amber';document.getElementById('pill-mrr').innerHTML=pillHTML(mh,mh==='green'?'On Target':mh==='amber'?'Below Target':'Critical');var gm=latest.gross_margin_pct?latest.gross_margin_pct/100:0;document.getElementById('val-gm').textContent=formatPercent(gm);var gmh='green';if(gm<0.5)gmh='red';else if(gm<0.65)gmh='amber';document.getElementById('pill-gm').innerHTML=pillHTML(gmh,gmh==='green'?'Healthy':gmh==='amber'?'Watch':'Critical');var cac=latest.cac_blended?latest.cac_blended/100:0;document.getElementById('val-cac').textContent=formatCurrencyRupees(cac);var ch='green';if(cac>8000)ch='red';else if(cac>5000)ch='amber';document.getElementById('pill-cac').innerHTML=pillHTML(ch,ch==='green'?'Efficient':ch==='amber'?'High':'Critical');var ltvCac=latest.ltv_cac_ratio||0;document.getElementById('val-ltvcac').textContent=formatRatio(ltvCac);var lh='green';if(ltvCac<8)lh='red';else if(ltvCac<12)lh='amber';document.getElementById('pill-ltvcac').innerHTML=pillHTML(lh,lh==='green'?'Strong':lh==='amber'?'Moderate':'Weak')}
function renderCACByChannel(){var latest=metricsData.length?metricsData[0]:null;var wrap=document.getElementById('wrap-cac-channel');if(!latest){wrap.innerHTML=emptyStateHTML('No channel CAC data available yet');return}var organic=latest.cac_organic?latest.cac_organic/100:0;var paid=latest.cac_paid?latest.cac_paid/100:0;var labels=['Organic','Paid Ads'];var values=[organic,paid];var colors=values.map(function(v){if(v>12000)return'#ef4444';if(v>8000)return'#f59e0b';return'#22c55e'});if(!wrap.querySelector('canvas'))wrap.innerHTML='<canvas id="chart-cac-channel"></canvas>';if(chartInstances.cacChannel)chartInstances.cacChannel.destroy();chartInstances.cacChannel=new Chart(document.getElementById('chart-cac-channel'),{type:'bar',data:{labels:labels,datasets:[{data:values,backgroundColor:colors,borderRadius:6,maxBarThickness:60}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{callbacks:{label:function(ctx){return'CAC: '+formatCurrencyRupees(values[ctx.dataIndex])}}}},scales:{y:{beginAtZero:true,ticks:{callback:function(v){return'\\u20B9'+(v/1000).toFixed(0)+'K'},color:'#6b7280',font:{size:11}},grid:{color:'#f3f4f6'}},x:{ticks:{color:'#6b7280',font:{size:12}},grid:{display:false}}}},plugins:[{id:'refLines',afterDraw:function(chart){var ctx=chart.ctx;var yS=chart.scales.y;var xS=chart.chartArea.left;var xE=chart.chartArea.right;ctx.save();ctx.setLineDash([6,4]);ctx.lineWidth=1.5;var y8=yS.getPixelForValue(8000);ctx.strokeStyle='#f59e0b';ctx.beginPath();ctx.moveTo(xS,y8);ctx.lineTo(xE,y8);ctx.stroke();ctx.fillStyle='#f59e0b';ctx.font='10px sans-serif';ctx.fillText('Max \\u20B98K',xE-56,y8-4);var y12=yS.getPixelForValue(12000);ctx.strokeStyle='#ef4444';ctx.beginPath();ctx.moveTo(xS,y12);ctx.lineTo(xE,y12);ctx.stroke();ctx.fillStyle='#ef4444';ctx.fillText('Break \\u20B912K',xE-65,y12-4);ctx.restore()}}]})}
function renderPayback(){var latest=metricsData.length?metricsData[0]:null;var wrap=document.getElementById('wrap-payback');if(!latest){wrap.innerHTML=emptyStateHTML('No payback data available yet');return}var orgPb=latest.payback_organic_months||0;var paidPb=latest.payback_paid_months||0;if(!wrap.querySelector('canvas'))wrap.innerHTML='<canvas id="chart-payback"></canvas>';if(chartInstances.payback)chartInstances.payback.destroy();var labels=['Organic','Paid'];var best=[orgPb,paidPb];var risk=[orgPb*1.3,paidPb*1.3];var bColors=best.map(function(v){return v>12?'#ef4444':v>9?'#f59e0b':'#22c55e'});chartInstances.payback=new Chart(document.getElementById('chart-payback'),{type:'bar',data:{labels:labels,datasets:[{label:'Best-case',data:best,backgroundColor:bColors,borderRadius:6,maxBarThickness:40},{label:'Risk-adjusted',data:risk,backgroundColor:bColors.map(function(c){return c+'99'}),borderRadius:6,maxBarThickness:40}]},options:{indexAxis:'y',responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'bottom',labels:{font:{size:11},color:'#6b7280',usePointStyle:true,pointStyleWidth:12}},tooltip:{callbacks:{label:function(ctx){return ctx.dataset.label+': '+ctx.raw.toFixed(1)+' months'}}}},scales:{x:{beginAtZero:true,ticks:{callback:function(v){return v+'mo'},color:'#6b7280',font:{size:11}},grid:{color:'#f3f4f6'}},y:{ticks:{color:'#6b7280',font:{size:12}},grid:{display:false}}}},plugins:[{id:'payRef',afterDraw:function(chart){var ctx=chart.ctx;var xS=chart.scales.x;var yT=chart.chartArea.top;var yB=chart.chartArea.bottom;ctx.save();ctx.setLineDash([6,4]);ctx.lineWidth=1.5;var x5=xS.getPixelForValue(5);ctx.strokeStyle='#22c55e';ctx.beginPath();ctx.moveTo(x5,yT);ctx.lineTo(x5,yB);ctx.stroke();ctx.fillStyle='#22c55e';ctx.font='10px sans-serif';ctx.fillText('5mo',x5+3,yT+10);var x9=xS.getPixelForValue(9);ctx.strokeStyle='#f59e0b';ctx.beginPath();ctx.moveTo(x9,yT);ctx.lineTo(x9,yB);ctx.stroke();ctx.fillStyle='#f59e0b';ctx.fillText('9mo',x9+3,yT+10);var x12=xS.getPixelForValue(12);ctx.strokeStyle='#ef4444';ctx.beginPath();ctx.moveTo(x12,yT);ctx.lineTo(x12,yB);ctx.stroke();ctx.fillStyle='#ef4444';ctx.fillText('12mo',x12+3,yT+10);ctx.restore()}}]})}
function renderLTVTable(){var latest=metricsData.length?metricsData[0]:null;var tbody=document.getElementById('tbody-ltv');if(!latest){tbody.innerHTML='<tr><td colspan="7">'+emptyStateHTML('No LTV segment data yet')+'</td></tr>';return}var segs=[{key:'india_single',label:'India \\u2014 Single Product',ltv:latest.ltv_india_single,cac:latest.cac_organic},{key:'india_cross',label:'India \\u2014 Cross-sold',ltv:latest.ltv_india_cross,cac:latest.cac_organic},{key:'intl_single',label:'International \\u2014 Single',ltv:latest.ltv_intl_single,cac:latest.cac_paid},{key:'intl_cross',label:'International \\u2014 Cross-sold',ltv:latest.ltv_intl_cross,cac:latest.cac_paid}];var html='';segs.forEach(function(s){var ltv=s.ltv?s.ltv/100:0;var ltvRisk=ltv*0.85;var cac=s.cac?s.cac/100:0;var ratio=cac>0?ltvRisk/cac:0;var pb=cac>0&&ltv>0?cac/(ltv/18):0;var h='green';if(ratio<8)h='red';else if(ratio<12)h='amber';html+='<tr><td style="font-weight:600">'+s.label+'</td><td>'+formatCurrencyRupees(ltv)+'</td><td>'+formatCurrencyRupees(ltvRisk)+'</td><td>'+formatCurrencyRupees(cac)+'</td><td>'+formatRatio(ratio)+'</td><td>'+pb.toFixed(1)+' mo</td><td>'+pillHTML(h,h==='green'?'Healthy':h==='amber'?'Watch':'Critical')+'</td></tr>'});tbody.innerHTML=html||'<tr><td colspan="7">'+emptyStateHTML('No LTV data yet')+'</td></tr>'}
function renderWaterfall(){var latest=metricsData.length?metricsData[0]:null;var wrap=document.getElementById('wrap-waterfall');if(!latest){wrap.innerHTML=emptyStateHTML('No cost data available yet');return}if(!wrap.querySelector('canvas'))wrap.innerHTML='<canvas id="chart-waterfall"></canvas>';var mrr=latest.mrr_total?latest.mrr_total/100:1;var infra=latest.cost_infrastructure?latest.cost_infrastructure/100:0;var variable=latest.cost_variable?latest.cost_variable/100:0;var ads=latest.cost_ads?latest.cost_ads/100:0;var net=mrr-infra-variable-ads;var labels=['Infrastructure','Variable Costs','Google Ads','Net Margin'];var values=[infra,variable,ads,net];var pcts=values.map(function(v){return((v/mrr)*100).toFixed(1)+'%'});var bgColors=['#3b82f6','#6366f1','#f59e0b',net>=0?'#22c55e':'#ef4444'];if(chartInstances.waterfall)chartInstances.waterfall.destroy();chartInstances.waterfall=new Chart(document.getElementById('chart-waterfall'),{type:'bar',data:{labels:labels,datasets:[{data:values,backgroundColor:bgColors,borderRadius:6,maxBarThickness:50}]},options:{indexAxis:'y',responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{callbacks:{label:function(ctx){return formatCurrencyRupees(ctx.raw)+' ('+pcts[ctx.dataIndex]+' of MRR)'}}}},scales:{x:{ticks:{callback:function(v){if(Math.abs(v)>=100000)return'\\u20B9'+(v/100000).toFixed(1)+'L';return'\\u20B9'+(v/1000).toFixed(0)+'K'},color:'#6b7280',font:{size:11}},grid:{color:'#f3f4f6'}},y:{ticks:{color:'#6b7280',font:{size:12}},grid:{display:false}}}}})}
function renderTrendLines(){var sorted=metricsData.slice().sort(function(a,b){return new Date(a.period_end)-new Date(b.period_end)}).slice(-12);if(sorted.length<2){['chart-trend-mrr','chart-trend-cac','chart-trend-ltvcac','chart-trend-gm'].forEach(function(id){var c=document.getElementById(id);if(c)c.parentElement.innerHTML=emptyStateHTML('Not enough trend data yet')});return}var labels=sorted.map(function(d){return new Date(d.period_end).toLocaleDateString('en-IN',{day:'numeric',month:'short'})});function createTrendChart(cid,data,tv,bv,lf,inv){var canvas=document.getElementById(cid);if(!canvas)return;var last=data[data.length-1];var lc;if(inv)lc=last<=tv?'#22c55e':last<=bv?'#f59e0b':'#ef4444';else lc=last>=tv?'#22c55e':last>=bv?'#f59e0b':'#ef4444';if(chartInstances[cid])chartInstances[cid].destroy();chartInstances[cid]=new Chart(canvas,{type:'line',data:{labels:labels,datasets:[{data:data,borderColor:lc,backgroundColor:lc+'18',fill:true,tension:0.3,pointRadius:3,pointHoverRadius:5,borderWidth:2.5}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{callbacks:{label:function(ctx){return lf(ctx.raw)}}}},scales:{x:{ticks:{color:'#6b7280',font:{size:10},maxRotation:45},grid:{display:false}},y:{ticks:{callback:function(v){return lf(v)},color:'#6b7280',font:{size:10}},grid:{color:'#f3f4f6'}}}},plugins:[{id:'tR_'+cid,afterDraw:function(chart){var ctx=chart.ctx;var yS=chart.scales.y;var xS=chart.chartArea.left;var xE=chart.chartArea.right;ctx.save();ctx.setLineDash([5,5]);ctx.lineWidth=1.5;var yt=yS.getPixelForValue(tv);if(yt>=chart.chartArea.top&&yt<=chart.chartArea.bottom){ctx.strokeStyle='#22c55eaa';ctx.beginPath();ctx.moveTo(xS,yt);ctx.lineTo(xE,yt);ctx.stroke()}if(bv!==null&&bv!==undefined){var yb=yS.getPixelForValue(bv);if(yb>=chart.chartArea.top&&yb<=chart.chartArea.bottom){ctx.strokeStyle='#ef4444aa';ctx.beginPath();ctx.moveTo(xS,yb);ctx.lineTo(xE,yb);ctx.stroke()}}ctx.restore()}}]})}var mrrG=sorted.map(function(d){var i=sorted.indexOf(d);if(i===0)return 0;var prev=sorted[i-1].mrr_total||1;return((d.mrr_total||0)-prev)/prev});createTrendChart('chart-trend-mrr',mrrG,0.05,0,function(v){return formatPercent(v)},false);var cacT=sorted.map(function(d){return d.cac_blended?d.cac_blended/100:0});createTrendChart('chart-trend-cac',cacT,5000,12000,function(v){return formatCurrencyRupees(v)},true);var lcT=sorted.map(function(d){return d.ltv_cac_ratio||0});createTrendChart('chart-trend-ltvcac',lcT,12,8,function(v){return formatRatio(v)},false);var gmT=sorted.map(function(d){return d.gross_margin_pct?d.gross_margin_pct/100:0});createTrendChart('chart-trend-gm',gmT,0.65,0.5,function(v){return formatPercent(v)},false)}
function renderAll(){renderBreakpoints();renderHeadlineMetrics();renderCACByChannel();renderPayback();renderLTVTable();renderWaterfall();renderTrendLines();document.getElementById('last-refresh').textContent='Updated '+new Date().toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'})}
async function refresh(){var l=document.getElementById('loading');l.classList.remove('hidden');await loadData();renderAll();l.classList.add('hidden')}
refresh();setInterval(refresh,60000);
document.getElementById('btn-refresh').addEventListener('click',function(){refresh()});
document.getElementById('period-select').addEventListener('change',function(){refresh()});
document.getElementById('segment-select').addEventListener('change',function(){refresh()});
<\/script>
</body>
</html>`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    });
  }

  return new Response(DASHBOARD_HTML, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-cache',
    },
  });
});
