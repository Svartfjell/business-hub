(() => {
  const firmFilter = document.querySelector('#firm-filter');
  const companiesSection = document.querySelector('#companies-section');
  const companyDetails = document.querySelector('#company-details');

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
      panel.querySelector('#firm-industry-subtitle').textContent = `${Number(data.total).toLocaleString('nb-NO')} selskaper fordelt på ${data.industries.length.toLocaleString('nb-NO')} næringskoder.`;
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
        button.addEventListener('click', async () => {
          const code = button.dataset.industry;
          const industrySearch = document.querySelector('#industry-search');
          if (!industrySearch || !code) return;
          const option = [...industrySearch.options].find((item) => item.value === code);
          if (!option) return;
          industrySearch.value = code;
          industrySearch.dispatchEvent(new Event('change', { bubbles: true }));
          document.querySelector('#apply-filters')?.click();
        });
      });
    } catch (error) {
      panel.hidden = false;
      panel.querySelector('#firm-industry-title').textContent = 'Næringsfordeling';
      panel.querySelector('#firm-industry-subtitle').textContent = 'Kunne ikke laste næringsfordelingen.';
    }
  }

  async function renderCompanyRisk(orgnr) {
    if (!companyDetails || !orgnr) return;
    companyDetails.querySelector('.brreg-risk-warning')?.remove();
    try {
      const response = await fetch(`/api/insights/company/${encodeURIComponent(orgnr)}/status`);
      if (!response.ok) return;
      const data = await response.json();
      if (!data.hasWarning) return;

      const dl = companyDetails.querySelector('dl');
      if (!dl) return;
      const warning = document.createElement('div');
      warning.className = 'brreg-risk-warning';
      const details = [...data.warnings];
      if (data.bankruptcyDate) details.push(`Konkursdato: ${data.bankruptcyDate}`);
      if (data.deletedDate) details.push(`Slettedato: ${data.deletedDate}`);
      warning.innerHTML = `<strong>Brreg-advarsel</strong><span>${details.map(escHtml).join(' · ')}</span>`;
      dl.insertAdjacentElement('afterend', warning);
    } catch {
      // Kundekortet skal fortsatt fungere selv om statusoppslaget feiler.
    }
  }

  const originalOpenCompany = window.openCompany;
  if (typeof originalOpenCompany === 'function') {
    window.openCompany = async function (...args) {
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
  document.querySelectorAll('.tab').forEach((tab) => tab.addEventListener('click', () => setTimeout(renderFirmInsights, 0)));
  setTimeout(renderFirmInsights, 0);
})();
