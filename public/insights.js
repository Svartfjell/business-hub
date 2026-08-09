(() => {
  const firmFilter = document.querySelector('#firm-filter');
  const companiesSection = document.querySelector('#companies-section');
  const companyDetails = document.querySelector('#company-details');

  const style = document.createElement('style');
  style.textContent = `
    .firm-industry-insights { margin: 0 0 18px; overflow: hidden; }
    .firm-industry-grid { display:grid; grid-template-columns:minmax(260px, .8fr) minmax(360px, 1.2fr); gap:28px; padding:24px; align-items:center; }
    .donut-wrap { display:flex; justify-content:center; align-items:center; min-height:320px; }
    .industry-donut { width:min(300px, 76vw); aspect-ratio:1; border-radius:50%; position:relative; display:grid; place-items:center; box-shadow:inset 0 0 0 1px var(--border); }
    .industry-donut::after { content:''; position:absolute; width:58%; height:58%; border-radius:50%; background:var(--surface); box-shadow:0 0 0 1px var(--border); }
    .industry-donut > span { position:relative; z-index:1; display:flex; flex-direction:column; align-items:center; gap:2px; text-align:center; }
    .industry-donut strong { font-size:30px; }
    .industry-donut small { color:var(--muted); }
    .industry-list { display:grid; gap:7px; max-height:420px; overflow:auto; }
    .industry-insight-row { display:grid; grid-template-columns:14px minmax(0,1fr) auto 72px; align-items:center; gap:10px; width:100%; min-height:52px; padding:8px 10px; background:transparent; border:1px solid transparent; text-align:left; }
    .industry-insight-row:hover:not(:disabled), .industry-insight-row:focus-visible { background:var(--soft); border-color:var(--border); outline:none; }
    .industry-insight-row i { width:12px; height:12px; border-radius:999px; }
    .industry-insight-row span { min-width:0; }
    .industry-insight-row span strong, .industry-insight-row span small { display:block; }
    .industry-insight-row span small { margin-top:2px; color:var(--muted); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .industry-insight-row b { font-variant-numeric:tabular-nums; }
    .industry-insight-row em { font-style:normal; color:var(--muted); text-align:right; font-variant-numeric:tabular-nums; }
    .brreg-risk-label { color:#b42318 !important; font-weight:800; }
    .brreg-risk-warning { display:flex; flex-direction:column; gap:3px; padding:9px 11px; border:1px solid #ef4444; border-radius:9px; background:#fef2f2; color:#991b1b; }
    :root.dark .brreg-risk-warning { background:color-mix(in srgb, #991b1b 18%, var(--surface)); color:#fecaca; border-color:#ef4444; }
    @media (max-width:850px) { .firm-industry-grid { grid-template-columns:1fr; } .donut-wrap { min-height:260px; } .industry-donut { width:min(260px, 72vw); } }
    @media (max-width:560px) { .industry-insight-row { grid-template-columns:12px minmax(0,1fr) auto; } .industry-insight-row em { grid-column:2 / 4; text-align:left; } }
  `;
  document.head.append(style);

  const escHtml = (value) => {
    const node = document.createElement('div');
    node.textContent = String(value ?? '');
    return node.innerHTML;
  };

  function ensureFirmInsightsPanel() {
    let panel = document.querySelector('#firm-industry-insights');
    if (panel) return panel;
    panel = document.createElement('section');
    panel.id = 'firm-industry-insights';
    panel.className = 'card firm-industry-insights';
    panel.hidden = true;
    panel.innerHTML = `
      <div class="section-header">
        <div>
          <p class="eyebrow">Næringsfordeling</p>
          <h2 id="firm-industry-title">Valgt regnskapsforetak</h2>
          <p id="firm-industry-subtitle"></p>
        </div>
      </div>
      <div class="firm-industry-grid">
        <div class="donut-wrap"><div id="firm-industry-donut" class="industry-donut" aria-label="Sektordiagram for næringsfordeling"></div></div>
        <div id="firm-industry-list" class="industry-list"></div>
      </div>`;
    companiesSection?.parentNode?.insertBefore(panel, companiesSection);
    return panel;
  }

  function groupIndustries(items, total) {
    const major = [];
    let otherCount = 0;
    for (const item of items) {
      const share = total ? item.companyCount / total : 0;
      if (major.length < 9 && share >= 0.025) major.push(item);
      else otherCount += item.companyCount;
    }
    if (otherCount > 0) {
      major.push({ industryCode: '__OTHER__', industryDescription: 'Andre næringer', companyCount: otherCount, share: total ? otherCount / total : 0 });
    }
    return major;
  }

  async function renderFirmInsights() {
    const panel = ensureFirmInsightsPanel();
    const firm = firmFilter?.value || '';
    if (!firm || firm === '__WITHOUT__') {
      panel.hidden = true;
      return;
    }

    try {
      const response = await fetch(`/api/insights/accounting-firm-industries?firm=${encodeURIComponent(firm)}`);
      if (!response.ok) throw new Error(await response.text());
      const data = await response.json();
      const groups = groupIndustries(data.industries, data.total);
      const colors = ['#2563eb','#16a34a','#7c3aed','#ea580c','#0891b2','#ca8a04','#db2777','#4f46e5','#059669','#64748b'];
      let cursor = 0;
      const stops = groups.map((item, index) => {
        const start = cursor;
        cursor += item.share * 100;
        return `${colors[index % colors.length]} ${start.toFixed(2)}% ${cursor.toFixed(2)}%`;
      });

      panel.hidden = false;
      panel.querySelector('#firm-industry-title').textContent = firm;
      panel.querySelector('#firm-industry-subtitle').textContent = `${Number(data.total).toLocaleString('nb-NO')} selskaper fordelt på ${data.industries.length.toLocaleString('nb-NO')} næringskoder. Klikk på en næring for å filtrere selskapslisten.`;
      const donut = panel.querySelector('#firm-industry-donut');
      donut.style.background = data.total ? `conic-gradient(${stops.join(',')})` : '#e5e7eb';
      donut.innerHTML = `<span><strong>${Number(data.total).toLocaleString('nb-NO')}</strong><small>selskaper</small></span>`;

      const list = panel.querySelector('#firm-industry-list');
      list.innerHTML = groups.map((item, index) => `
        <button class="industry-insight-row" data-industry="${escHtml(item.industryCode)}" ${item.industryCode === '__OTHER__' ? 'disabled' : ''}>
          <i style="background:${colors[index % colors.length]}"></i>
          <span><strong>${escHtml(item.industryCode === '__OTHER__' ? 'Andre' : item.industryCode)}</strong><small>${escHtml(item.industryDescription)}</small></span>
          <b>${Number(item.companyCount).toLocaleString('nb-NO')}</b>
          <em>${(item.share * 100).toFixed(1).replace('.', ',')} %</em>
        </button>`).join('');

      list.querySelectorAll('.industry-insight-row:not([disabled])').forEach((button) => {
        button.addEventListener('click', () => {
          const code = button.dataset.industry;
          const industrySearch = document.querySelector('#industry-search');
          if (!industrySearch || !code) return;
          const option = [...industrySearch.options].find((item) => item.value === code);
          if (!option) return;
          industrySearch.value = code;
          industrySearch.dispatchEvent(new Event('change', { bubbles: true }));
          setTimeout(() => document.querySelector('#apply-filters')?.click(), 0);
        });
      });
    } catch {
      panel.hidden = false;
      panel.querySelector('#firm-industry-title').textContent = 'Næringsfordeling';
      panel.querySelector('#firm-industry-subtitle').textContent = 'Kunne ikke laste næringsfordelingen.';
    }
  }

  function clearCompanyRisk() {
    companyDetails?.querySelectorAll('.brreg-risk-label, .brreg-risk-warning').forEach((node) => node.remove());
  }

  async function renderCompanyRisk(orgnr) {
    if (!companyDetails || !orgnr) return;
    clearCompanyRisk();
    try {
      const response = await fetch(`/api/insights/company/${encodeURIComponent(orgnr)}/status`);
      if (!response.ok) return;
      const data = await response.json();
      if (!data.hasWarning) return;

      const dl = companyDetails.querySelector('dl');
      if (!dl) return;
      const terms = [...dl.querySelectorAll('dt')];
      const accountingTerm = terms.find((node) => node.textContent?.trim() === 'Regnskapsforetak');
      const accountingValue = accountingTerm?.nextElementSibling;

      const label = document.createElement('dt');
      label.className = 'brreg-risk-label';
      label.textContent = 'Brreg-status';

      const warning = document.createElement('dd');
      warning.className = 'brreg-risk-warning';
      const details = [...data.warnings];
      if (data.bankruptcyDate) details.push(`Konkursdato: ${data.bankruptcyDate}`);
      if (data.deletedDate) details.push(`Slettedato: ${data.deletedDate}`);
      warning.innerHTML = `<strong>${escHtml(data.warnings.join(' · '))}</strong><span>${details.slice(data.warnings.length).map(escHtml).join(' · ')}</span>`;

      if (accountingValue) {
        accountingValue.insertAdjacentElement('afterend', warning);
        warning.insertAdjacentElement('beforebegin', label);
      } else {
        dl.append(label, warning);
      }
    } catch {
      // Kundekortet skal fortsatt fungere selv om statusoppslaget feiler.
    }
  }

  const originalOpenCompany = window.openCompany;
  if (typeof originalOpenCompany === 'function') {
    window.openCompany = async function (...args) {
      clearCompanyRisk();
      const result = await originalOpenCompany.apply(this, args);
      await renderCompanyRisk(args[0]);
      return result;
    };
  }

  const originalLoadCompanies = window.loadCompanies;
  if (typeof originalLoadCompanies === 'function') {
    window.loadCompanies = async function (...args) {
      const result = await originalLoadCompanies.apply(this, args);
      await renderFirmInsights();
      return result;
    };
  }

  firmFilter?.addEventListener('change', renderFirmInsights);
  document.querySelector('#apply-filters')?.addEventListener('click', () => setTimeout(renderFirmInsights, 50));
  document.querySelectorAll('.tab').forEach((tab) => tab.addEventListener('click', () => setTimeout(renderFirmInsights, 0)));
  setTimeout(renderFirmInsights, 0);
})();
