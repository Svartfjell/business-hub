const state = {
  industries: [], industry: "__ALL__", summary: null,
  companiesPage: 1, companiesPageSize: 50, companiesTotalPages: 1,
  firmsPage: 1, firmsTotalPages: 1, crmMode: "", selectedFirm: "", currentView: "dashboard",
};

const $ = (s) => document.querySelector(s);
const e = {
  industrySearch: $("#industry-search"),
  industryDescription: $("#industry-description"), companySearch: $("#company-search"),
  firmFilter: $("#firm-filter"), municipalityFilter: $("#municipality-filter"),
  employeesFilter: $("#employees-filter"), organisationFormFilter: $("#organisation-form-filter"),
  prospectStatusFilter: $("#prospect-status-filter"),
  applyFilters: $("#apply-filters"),
  resetFilters: $("#reset-filters"),
  batchComment: $("#batch-comment"), exportXlsx: $("#export-xlsx"), exportCsv: $("#export-csv"),
  totalCompanies: $("#total-companies"), notContactedCount: $("#not-contacted-count"),
  contactedCount: $("#contacted-count"),
  activeCount: $("#active-count"), firmCount: $("#firm-count"),
  firmSearch: $("#firm-search"), firmsBody: $("#firms-body"),
  firmsPrev: $("#firms-prev"), firmsNext: $("#firms-next"), firmsPage: $("#firms-page"),
  marketSection: $("#market-section"),
  companySort: $("#company-sort"), companyPageSize: $("#company-page-size"),
  companiesBody: $("#companies-body"), companiesPrev: $("#companies-prev"),
  companiesNext: $("#companies-next"), companiesPage: $("#companies-page"),
  companyCount: $("#company-count"), companiesHeading: $("#companies-heading"),
  companiesSection: $("#companies-section"), status: $("#status"),
  themeToggle: $("#theme-toggle"), companyDialog: $("#company-dialog"),
  closeCompany: $("#close-company"), companyTitle: $("#company-title"),
  companyDetails: $("#company-details"), brregContacts: $("#brreg-contacts"),
  companyStatusBadge: $("#company-status-badge"),
  actualContacts: $("#actual-contacts"), companyHistory: $("#company-history"),
  companyOrgnr: $("#company-orgnr"), companyStatus: $("#company-status"),
  companyResponsible: $("#company-responsible"), companyNextContact: $("#company-next-contact"),
  companyNote: $("#company-note"), companyActiveAgreement: $("#company-active-agreement"),
  companyAgreementType: $("#company-agreement-type"),
  companyAgreementStart: $("#company-agreement-start"),
  companyAgreementEnd: $("#company-agreement-end"),
  saveCompany: $("#save-company"), contactName: $("#contact-name"),
  contactRole: $("#contact-role"), contactEmail: $("#contact-email"),
  contactPhone: $("#contact-phone"), addContact: $("#add-contact"),
  batchDialog: $("#batch-dialog"),
  batchScope: $("#batch-scope"),
  batchCount: $("#batch-count"),
  batchFilterSummary: $("#batch-filter-summary"),
  batchAction: $("#batch-action"),
  batchSentDate: $("#batch-sent-date"),
  batchStatus: $("#batch-status"),
  batchStatusGroup: $("#batch-status-group"),
  batchNextContact: $("#batch-next-contact"),
  batchNextContactGroup: $("#batch-next-contact-group"),
  batchAgreementGroup: $("#batch-agreement-group"),
  batchAgreementStatus: $("#batch-agreement-status"),
  batchCommentText: $("#batch-comment-text"),
  batchResponsible: $("#batch-responsible"),
  batchOnlyUncontacted: $("#batch-only-uncontacted"),
  batchOnlyWithoutResponsible: $("#batch-only-without-responsible"),
  batchOnlyWithoutHistory: $("#batch-only-without-history"),
  previewBatch: $("#preview-batch"),
  cancelBatch: $("#cancel-batch"), saveBatch: $("#save-batch"),
  dashboardSection: $("#dashboard-section"), filtersSection: $("#filters-section"),
  kpiSection: $("#kpi-section"), statusLegend: $("#status-legend"),
  dashboardOpenTasks: $("#dashboard-open-tasks"),
  dashboardOverdueTasks: $("#dashboard-overdue-tasks"),
  dashboardDueToday: $("#dashboard-due-today"),
  dashboardFollowups: $("#dashboard-followups"),
  dashboardPipeline: $("#dashboard-pipeline"), dashboardTasks: $("#dashboard-tasks"),
  dashboardFollowupList: $("#dashboard-followup-list"), dashboardActivity: $("#dashboard-activity"),
  newGlobalTask: $("#new-global-task"), taskDialog: $("#task-dialog"),
  closeTaskDialog: $("#close-task-dialog"), saveGlobalTask: $("#save-global-task"),
  globalTaskTitle: $("#global-task-title"), globalTaskOrgnr: $("#global-task-orgnr"),
  globalTaskDue: $("#global-task-due"), globalTaskResponsible: $("#global-task-responsible"),
  globalTaskPriority: $("#global-task-priority"), globalTaskDescription: $("#global-task-description"),
  companyTasks: $("#company-tasks"), companyIntegrations: $("#company-integrations"),
  taskTitle: $("#task-title"), taskDueDate: $("#task-due-date"),
  taskPriority: $("#task-priority"), addTask: $("#add-task"),
};

const fmt = (v) => new Intl.NumberFormat("nb-NO").format(Number(v ?? 0));
const pct = (v, t) => new Intl.NumberFormat("nb-NO", {
  style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1,
}).format(t ? Number(v) / Number(t) : 0);

function formatDate(value) {
  if (!value) return "–";
  const parts = String(value).slice(0, 10).split("-");
  return parts.length === 3
    ? `${parts[2]}.${parts[1]}.${parts[0]}`
    : String(value);
}

function showDialog(dialog) {
  if (!dialog) return;
  document.body.classList.add("modal-open");
  if (!dialog.open) dialog.showModal();
}

function hideDialog(dialog) {
  if (dialog?.open) dialog.close();
  document.body.classList.remove("modal-open");
}

function clickedOutsideDialog(event, dialog) {
  if (!dialog || event.target !== dialog) return false;
  const rect = dialog.getBoundingClientRect();
  return (
    event.clientX < rect.left ||
    event.clientX > rect.right ||
    event.clientY < rect.top ||
    event.clientY > rect.bottom
  );
}

function esc(v) {
  const node = document.createElement("div");
  node.textContent = String(v ?? "");
  return node.innerHTML;
}

async function api(url, options) {
  const response = await fetch(url, options);

  if (!response.ok) {
    const contentType = response.headers.get("content-type") ?? "";

    if (contentType.includes("application/json")) {
      const body = await response.json();
      throw new Error(body.error ?? JSON.stringify(body));
    }

    throw new Error(await response.text());
  }

  return response.json();
}

function resolveIndustry() {
  return e.industrySearch.value || "__ALL__";
}

function selectedIndustry() {
  return state.industries.find((item) => item.code === state.industry);
}

function activeScopeText() {
  const parts = [];

  if (state.industry === "__ALL__") {
    parts.push("alle importerte næringskoder");
  } else {
    const industry = selectedIndustry();
    parts.push(
      industry
        ? `${industry.code} – ${industry.description}`
        : state.industry,
    );
  }

  if (e.firmFilter.value === "__WITHOUT__") {
    parts.push("uten registrert regnskapsforetak");
  } else if (e.firmFilter.value) {
    parts.push(`regnskapsforetak: ${e.firmFilter.value}`);
  }

  if (e.municipalityFilter.value) {
    parts.push(`kommune: ${e.municipalityFilter.value}`);
  }

  if (e.employeesFilter.value) {
    parts.push(`ansatte: ${e.employeesFilter.options[e.employeesFilter.selectedIndex].text}`);
  }

  if (e.organisationFormFilter.value) {
    parts.push(`organisasjonsform: ${e.organisationFormFilter.value}`);
  }

  if (e.companySearch.value.trim()) {
    parts.push(`søk: «${e.companySearch.value.trim()}»`);
  }

  return parts.join(" · ");
}

function updatePotentialExplanation() {}


function updateIndustry() {
  state.industry = resolveIndustry();
  const selected = selectedIndustry();

  if (state.industry === "__ALL__") {
    const total = state.industries.reduce(
      (sum, item) => sum + Number(item.importedCount || 0),
      0,
    );
    e.industryDescription.textContent =
      `Alle importerte næringskoder. Segmenttall summerer til ${fmt(total)}; samme selskap kan finnes i flere segmenter.`;
  } else {
    e.industryDescription.textContent = selected
      ? `${fmt(selected.importedCount)} importerte selskaper`
      : state.industry;
  }

  updatePotentialExplanation();
}

async function loadIndustries() {
  state.industries = await api("/api/industries");

  e.industrySearch.innerHTML =
    '<option value="__ALL__">Alle næringskoder</option>';

  for (const item of state.industries) {
    const option = document.createElement("option");
    option.value = item.code;
    option.textContent =
      `(${fmt(item.importedCount)}) ${item.code} – ${item.description}`;
    option.title = option.textContent;
    e.industrySearch.append(option);
  }

  e.industrySearch.value = state.industry;
  updateIndustry();
}

function params() {
  const [sort, direction] = e.companySort.value.split(":");
  return new URLSearchParams({
    industry: state.industry, q: e.companySearch.value.trim(),
    firm: e.firmFilter.value, municipality: e.municipalityFilter.value,
    employees: e.employeesFilter.value,
    organisationForm: e.organisationFormFilter.value,
    prospectStatus: e.prospectStatusFilter.value,
    crmMode: state.crmMode, page: String(state.companiesPage),
    pageSize: String(state.companiesPageSize), sort, direction,
  });
}

async function loadSummary() {
  const data = await api(`/api/summary?industry=${encodeURIComponent(state.industry)}`);
  state.summary = data;
  e.totalCompanies.textContent = fmt(data.totalCompanies);
  e.notContactedCount.textContent = fmt(data.notContacted);
  e.contactedCount.textContent = fmt(data.contacted);
  e.activeCount.textContent = fmt(data.activeAgreements);
  e.firmCount.textContent = fmt(data.registeredAccountingFirms);
}

async function loadOptions() {
  const selectedFirm = e.firmFilter.value;
  const selectedMunicipality = e.municipalityFilter.value;
  const selectedOrganisationForm = e.organisationFormFilter.value;

  const data = await api(`/api/options?industry=${encodeURIComponent(state.industry)}`);

  e.firmFilter.innerHTML =
    '<option value="">Alle regnskapsforetak</option>' +
    '<option value="__WITHOUT__">Uten registrert regnskapsforetak</option>';
  for (const item of data.firms) {
    const option = document.createElement("option");
    option.value = item.value;
    option.textContent = `${item.value} (${fmt(item.count)})`;
    e.firmFilter.append(option);
  }

  e.municipalityFilter.innerHTML = '<option value="">Alle kommuner</option>';
  for (const item of data.municipalities) {
    const option = document.createElement("option");
    option.value = item.value;
    option.textContent = `${item.value} (${fmt(item.count)})`;
    e.municipalityFilter.append(option);
  }

  e.organisationFormFilter.innerHTML =
    '<option value="">Alle organisasjonsformer</option>';
  for (const item of data.organisationForms) {
    const option = document.createElement("option");
    option.value = item.value;
    option.textContent = `${item.value} (${fmt(item.count)})`;
    e.organisationFormFilter.append(option);
  }

  if ([...e.firmFilter.options].some((option) => option.value === selectedFirm)) {
    e.firmFilter.value = selectedFirm;
  }

  if (
    [...e.municipalityFilter.options]
      .some((option) => option.value === selectedMunicipality)
  ) {
    e.municipalityFilter.value = selectedMunicipality;
  }

  if (
    [...e.organisationFormFilter.options]
      .some((option) => option.value === selectedOrganisationForm)
  ) {
    e.organisationFormFilter.value = selectedOrganisationForm;
  }
}

async function loadCompanies() {
  const data = await api(`/api/companies?${params()}`);
  state.companiesTotalPages = data.totalPages;
  e.companiesBody.innerHTML = "";

  for (const company of data.items) {
    const row = document.createElement("tr");
    row.classList.add("company-row");
    row.tabIndex = 0;
    row.setAttribute("role", "button");
    row.setAttribute("aria-label", `Åpne kundekort for ${company.name}`);
    row.innerHTML = `
      <td>${esc(company.organisationNumber)}</td>
      <td><strong>${esc(company.name)}</strong><small>${esc(company.organisationForm ?? "")}</small></td>
      <td>
        <button
          type="button"
          class="table-link industry-link"
          data-industry="${esc(company.industryCode ?? "")}"
          title="Filtrer på denne næringskoden"
        >
          <strong>${esc(company.industryCode ?? "–")}</strong>
          <small>${esc(company.industryDescription ?? "")}</small>
        </button>
      </td>
      <td><span class="badge status-${String(company.prospectStatus ?? "Ny").toLowerCase().replaceAll(" ", "-")}">${esc(company.prospectStatus)}</span></td>
      <td>${esc(formatDate(company.lastContact))}</td>
      <td>${esc(formatDate(company.nextContact))}</td>
      <td>${esc(company.responsible ?? "–")}</td>`;

    row.addEventListener("click", () =>
      openCompany(company.organisationNumber)
    );

    row.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openCompany(company.organisationNumber);
      }
    });

    row.querySelector(".industry-link")?.addEventListener("click", async (event) => {
      event.stopPropagation();
      const code = event.currentTarget.dataset.industry;
      const industry = state.industries.find((item) => item.code === code);

      if (!industry) return;

      state.industry = industry.code;
      e.industrySearch.value = industry.code;
      state.companiesPage = 1;
      await refresh();
      e.companiesSection.scrollIntoView({ behavior: "smooth", block: "start" });
    });

    e.companiesBody.append(row);
  }

  e.companyCount.textContent = `${fmt(data.total)} selskaper passer med valgte filtre.`;
  e.companiesPage.textContent = `Side ${data.page} av ${data.totalPages}`;
  e.companiesPrev.disabled = data.page <= 1;
  e.companiesNext.disabled = data.page >= data.totalPages;
}

async function loadFirms() {
  const p = new URLSearchParams({
    industry: state.industry, q: e.firmSearch.value.trim(),
    page: String(state.firmsPage), pageSize: "50",
  });
  const data = await api(`/api/firms?${p}`);
  state.firmsTotalPages = data.totalPages;
  e.firmsBody.innerHTML = "";

  for (const firm of data.items) {
    const row = document.createElement("tr");
    row.className = "selectable firm-row";
    row.tabIndex = 0;
    row.setAttribute("role", "button");
    row.setAttribute("aria-label", `Filtrer på ${firm.accountingFirmName}`);
    row.innerHTML = `
      <td><strong>${esc(firm.accountingFirmName)}</strong></td>
      <td>${esc(firm.accountingFirmOrganisationNumber ?? "–")}</td>
      <td>${fmt(firm.companyCount)}</td>
      <td>${pct(firm.companyCount, state.summary?.totalCompanies)}</td>
      <td>${fmt(firm.municipalityCount)}</td>`;

    row.addEventListener("click", async () => {
      const filterValue =
        firm.accountingFirmName === "Ikke registrert regnskapsforetak"
          ? "__WITHOUT__"
          : firm.accountingFirmName;
      e.firmFilter.value = filterValue;
      state.selectedFirm = filterValue === "__WITHOUT__" ? "" : filterValue;
      state.companiesPage = 1;
      e.companiesHeading.textContent = firm.accountingFirmName;
      state.currentView = "analysis";
      state.crmMode = "";
      document.querySelectorAll(".tab").forEach((tab) => {
        tab.classList.toggle("active", tab.dataset.view === "analysis");
      });
      e.marketSection.hidden = true;
      e.companiesSection.hidden = false;
      e.companiesHeading.textContent = firm.accountingFirmName;
      await loadCompanies();
      e.companiesSection.scrollIntoView({ behavior: "smooth", block: "start" });
    });

    row.addEventListener("keydown", async (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      row.click();
    });

    e.firmsBody.append(row);
  }

  e.firmsPage.textContent = `Side ${data.page} av ${data.totalPages} – ${fmt(data.total)} grupper`;
}

async function openCompany(orgnr) {
  const data = await api(`/api/companies/${orgnr}`);
  const c = data.company;
  e.companyOrgnr.value = orgnr;
  e.companyTitle.textContent = c.name;
  e.companyStatus.value = c.prospect_status || "Ny";
  const statusValue = c.prospect_status || "Ny";
  e.companyStatusBadge.textContent = statusValue;
  e.companyStatusBadge.className =
    `badge status-${statusValue.toLowerCase().replaceAll(" ", "-")}`;
  e.companyResponsible.value = c.responsible || "";
  e.companyNextContact.value = c.next_contact || "";
  e.companyNote.value = c.prospect_note || "";
  e.companyActiveAgreement.checked = Boolean(c.active_agreement);
  e.companyAgreementType.value = c.agreement_type || "";
  e.companyAgreementStart.value = c.agreement_start || "";
  e.companyAgreementEnd.value = c.agreement_end || "";

  e.companyDetails.innerHTML = `
    <dl>
      <dt>Organisasjonsnummer</dt><dd>${esc(c.organisation_number)}</dd>
      <dt>Adresse</dt><dd>${esc(c.address ?? "–")}, ${esc(c.postal_code ?? "")} ${esc(c.postal_place ?? "")}</dd>
      <dt>Kommune</dt><dd>${esc(c.municipality ?? "–")}</dd>
      <dt>Bransje</dt><dd>${esc(c.industry_code ?? "")} – ${esc(c.industry_description ?? "")}</dd>
      <dt>Ansatte</dt><dd>${c.number_of_employees ?? "–"}</dd>
      <dt>Regnskapsforetak</dt><dd>${esc(c.accounting_firm_name ?? "Ikke registrert")}</dd>
    </dl>`;

  e.brregContacts.innerHTML = data.brregContacts.length
    ? data.brregContacts.map((x) =>
        `<p><strong>${esc(x.name)}</strong><br><small>${esc(x.role)}</small></p>`
      ).join("")
    : "<p>Ingen personroller funnet i lagrede Brreg-data.</p>";

  e.actualContacts.innerHTML = data.contacts.length
    ? data.contacts.map((x) => `
        <div class="contact-card">
          <strong>${esc(x.name)}</strong><span>${esc(x.role ?? "")}</span>
          <a href="mailto:${esc(x.email ?? "")}">${esc(x.email ?? "")}</a>
          <span>${esc(x.phone ?? "")}</span>
        </div>`).join("")
    : "<p>Ingen faktiske kontaktpersoner registrert.</p>";

  e.companyTasks.innerHTML = data.tasks.length
    ? data.tasks.map((x) => `<div class="task-card"><div><strong>${esc(x.title)}</strong><small>${formatDate(x.dueDate)} · ${esc(x.priority)} · ${esc(x.responsible || "")}</small></div><button class="complete-task" data-task-id="${x.id}" ${x.status === "Ferdig" ? "disabled" : ""}>${x.status === "Ferdig" ? "Ferdig" : "Fullfør"}</button></div>`).join("")
    : "<p>Ingen oppgaver registrert.</p>";
  e.companyIntegrations.innerHTML = data.integrations.length
    ? data.integrations.map((x) => `<div class="integration-card"><strong>${esc(x.productName || x.productCode)}</strong><span class="badge integration-${statusClass(x.status)}">${esc(x.status)}</span><small>Siste synk: ${formatDate(x.lastSyncAt)}${x.lastError ? ` · Feil: ${esc(x.lastError)}` : ""}</small></div>`).join("")
    : "<p>Ingen produkter eller integrasjoner registrert.</p>";
  e.companyHistory.innerHTML = data.history.length
    ? data.history.map((x) => `
        <div class="history-item">
          <strong>
            ${esc(x.activityDate)}
            <span class="badge activity-badge">${esc(x.activityType)}</span>
          </strong>
          <p>${esc(x.comment ?? "")}</p><small>${esc(x.responsible ?? "")}</small>
        </div>`).join("")
    : "<p>Ingen historikk registrert.</p>";

  showDialog(e.companyDialog);
  document.querySelectorAll(".complete-task").forEach((button) => button.addEventListener("click", async () => { await api(`/api/tasks/${button.dataset.taskId}`, {method:"PATCH", headers:{"Content-Type":"application/json"}, body:JSON.stringify({status:"Ferdig"})}); await openCompany(orgnr); await loadDashboard(); }));
}


function statusClass(value) {
  return String(value || "Ny").toLowerCase().replaceAll(" ", "-");
}

async function loadDashboard() {
  const data = await api("/api/dashboard");
  e.dashboardOpenTasks.textContent = fmt(data.tasks.open);
  e.dashboardOverdueTasks.textContent = fmt(data.tasks.overdue);
  e.dashboardDueToday.textContent = fmt(data.tasks.dueToday);
  e.dashboardFollowups.textContent = fmt(data.followUps.length);
  e.dashboardPipeline.innerHTML = data.pipeline.length
    ? data.pipeline.map((item) => `<div class="pipeline-row"><span class="badge status-${statusClass(item.status)}">${esc(item.status)}</span><strong>${fmt(item.count)}</strong></div>`).join("")
    : "<p>Ingen CRM-statistikk ennå.</p>";
  e.dashboardTasks.innerHTML = data.tasks.items.length
    ? data.tasks.items.map((item) => `<button class="dashboard-list-item task-item" data-task-id="${item.id}" data-orgnr="${esc(item.organisationNumber || "")}"><span><strong>${esc(item.title)}</strong><small>${esc(item.companyName || "Generell oppgave")} · ${formatDate(item.dueDate)} · ${esc(item.responsible || "Ikke tildelt")}</small></span><span class="badge priority-${String(item.priority).toLowerCase()}">${esc(item.priority)}</span></button>`).join("")
    : "<p>Ingen åpne oppgaver.</p>";
  e.dashboardFollowupList.innerHTML = data.followUps.length
    ? data.followUps.map((item) => `<button class="dashboard-list-item company-link" data-orgnr="${item.organisationNumber}"><span><strong>${esc(item.name)}</strong><small>${formatDate(item.nextContact)} · ${esc(item.responsible || "Ikke tildelt")}</small></span><span class="badge status-${statusClass(item.status)}">${esc(item.status)}</span></button>`).join("")
    : "<p>Ingen forfalte oppfølginger.</p>";
  e.dashboardActivity.innerHTML = data.recentActivity.length
    ? data.recentActivity.map((item) => `<button class="dashboard-list-item company-link" data-orgnr="${item.organisationNumber}"><span><strong>${esc(item.companyName || item.organisationNumber)}</strong><small>${formatDate(item.activityDate)} · ${esc(item.activityType)} · ${esc(item.responsible || "")}</small></span></button>`).join("")
    : "<p>Ingen aktivitet registrert.</p>";
  document.querySelectorAll(".company-link").forEach((button) => button.addEventListener("click", () => openCompany(button.dataset.orgnr)));
  document.querySelectorAll(".task-item").forEach((button) => button.addEventListener("click", async () => {
    if (button.dataset.orgnr) openCompany(button.dataset.orgnr);
    else if (confirm("Marker oppgaven som ferdig?")) { await api(`/api/tasks/${button.dataset.taskId}`, {method:"PATCH", headers:{"Content-Type":"application/json"}, body:JSON.stringify({status:"Ferdig"})}); await loadDashboard(); }
  }));
}

async function refresh() {
  e.status.textContent = "Laster …";
  updateIndustry();
  state.companiesPage = 1;
  state.firmsPage = 1;
  await loadSummary();
  await Promise.all([loadOptions(), loadCompanies()]);
  updatePotentialExplanation();
  e.status.textContent = "Dataene er oppdatert.";
}

document.querySelectorAll(".tab").forEach((button) => {
  button.addEventListener("click", async () => {
    document.querySelectorAll(".tab").forEach((x) => x.classList.remove("active"));
    button.classList.add("active");
    state.currentView = button.dataset.view;
    const dashboardView = state.currentView === "dashboard";
    const marketView = state.currentView === "market";
    e.dashboardSection.hidden = !dashboardView;
    e.filtersSection.hidden = dashboardView;
    e.kpiSection.hidden = dashboardView;
    e.marketSection.hidden = !marketView;
    e.companiesSection.hidden = dashboardView || marketView;
    e.statusLegend.hidden = dashboardView || marketView;
    if (dashboardView) { await loadDashboard(); return; }
    if (marketView) { state.firmsPage = 1; await loadFirms(); return; }
    state.crmMode = state.currentView === "analysis" ? "" : state.currentView;
    e.companiesHeading.textContent = button.textContent;
    state.companiesPage = 1;
    await Promise.all([loadSummary(), loadCompanies()]);
  });
});

e.industrySearch.addEventListener("change", async () => {
  updateIndustry();
  await loadOptions();
  e.status.textContent =
    "Næringssegmentet er endret. Velg øvrige filtre og trykk «Oppdater og vis resultat».";
});
e.firmFilter.addEventListener("change", () => {
  state.selectedFirm =
    e.firmFilter.value && e.firmFilter.value !== "__WITHOUT__"
      ? e.firmFilter.value
      : "";
  e.status.textContent =
    "Filteret er endret. Trykk «Oppdater og vis resultat».";
});
[
  e.municipalityFilter,
  e.employeesFilter,
  e.organisationFormFilter,
  e.prospectStatusFilter,
].forEach((element) => {
  element.addEventListener("change", () => {
    e.status.textContent =
      "Filteret er endret. Trykk «Oppdater og vis resultat».";
  });
});

e.applyFilters.addEventListener("click", async () => {
  e.applyFilters.disabled = true;
  e.applyFilters.textContent = "Oppdaterer …";

  try {
    updateIndustry();
    state.companiesPage = 1;
    state.firmsPage = 1;

    await loadSummary();

    if (state.currentView === "market") {
      await loadFirms();
      e.marketSection.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    } else {
      await loadCompanies();
      e.companiesSection.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }

    updatePotentialExplanation();
    e.status.textContent = "Resultatet er oppdatert.";
  } catch (error) {
    e.status.textContent =
      error instanceof Error ? error.message : String(error);
  } finally {
    e.applyFilters.disabled = false;
    e.applyFilters.textContent = "Oppdater og vis resultat";
  }
});

e.resetFilters.addEventListener("click", () => {
  e.companySearch.value = "";
  e.firmFilter.value = "";
  e.municipalityFilter.value = "";
  e.employeesFilter.value = "";
  e.organisationFormFilter.value = "";
  e.prospectStatusFilter.value = "";
  state.crmMode = "";
  state.selectedFirm = "";
  e.companiesHeading.textContent = "Selskaper";
  e.potentialExplanation.hidden = true;
  refresh();
});

function batchFilters() {
  return {
    industry: state.industry,
    q: e.companySearch.value.trim(),
    firm: e.firmFilter.value,
    municipality: e.municipalityFilter.value,
    employees: e.employeesFilter.value,
    organisationForm: e.organisationFormFilter.value,
    prospectStatus: e.prospectStatusFilter.value,
    crmMode: state.crmMode,
  };
}

function batchRequestPayload() {
  return {
    filters: batchFilters(),
    action: e.batchAction.value,
    activityDate: e.batchSentDate.value,
    status: e.batchStatus.value,
    nextContact: e.batchNextContact.value,
    agreementStatus: e.batchAgreementStatus.value,
    responsible: e.batchResponsible.value,
    comment: e.batchCommentText.value,
    onlyUncontacted: e.batchOnlyUncontacted.checked,
    onlyWithoutResponsible: e.batchOnlyWithoutResponsible.checked,
    onlyWithoutHistory: e.batchOnlyWithoutHistory.checked,
  };
}

function updateBatchFields() {
  e.batchStatusGroup.hidden = e.batchAction.value !== "status";
  e.batchNextContactGroup.hidden = e.batchAction.value !== "nextContact";
  e.batchAgreementGroup.hidden = e.batchAction.value !== "agreement";
}

async function previewBatchCount() {
  e.batchCount.textContent = "Beregner utvalg …";

  const result = await api("/api/batch/preview", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(batchRequestPayload()),
  });

  e.batchCount.textContent =
    `${fmt(result.count)} selskaper vil bli oppdatert`;
  e.saveBatch.textContent =
    `Bruk på ${fmt(result.count)} selskaper`;
  e.saveBatch.disabled = result.count === 0;
  return result.count;
}

e.batchComment.onclick = async () => {
  e.batchSentDate.value = new Date().toISOString().slice(0, 10);
  e.batchScope.textContent = "Aktive filtre og valgt fane brukes som utvalg.";
  e.batchFilterSummary.textContent = activeScopeText();
  updateBatchFields();
  showDialog(e.batchDialog);

  try {
    await previewBatchCount();
  } catch (error) {
    e.batchCount.textContent =
      error instanceof Error ? error.message : String(error);
  }
};

function closeBatchDialog() {
  hideDialog(e.batchDialog);
}

e.cancelBatch.onclick = closeBatchDialog;
e.batchDialog.addEventListener("cancel", closeBatchDialog);
e.batchDialog.addEventListener("close", () => {
  document.body.classList.remove("modal-open");
});
e.batchDialog.addEventListener("click", (event) => {
  if (clickedOutsideDialog(event, e.batchDialog)) {
    closeBatchDialog();
  }
});

e.batchAction.addEventListener("change", updateBatchFields);
e.previewBatch.addEventListener("click", previewBatchCount);
[
  e.batchOnlyUncontacted,
  e.batchOnlyWithoutResponsible,
  e.batchOnlyWithoutHistory,
].forEach((element) => {
  element.addEventListener("change", previewBatchCount);
});

e.saveBatch.addEventListener("click", async () => {
  e.saveBatch.disabled = true;
  const originalText = e.saveBatch.textContent;
  e.saveBatch.textContent = "Oppdaterer …";

  try {
    let payload = batchRequestPayload();

    let response = await fetch("/api/batch/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (response.status === 409) {
      const warning = await response.json();
      const confirmed = window.confirm(
        `${warning.count.toLocaleString("nb-NO")} selskaper vil bli oppdatert. Fortsette?`,
      );

      if (!confirmed) return;

      payload.confirmedLargeSelection = true;
      response = await fetch("/api/batch/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    }

    if (!response.ok) {
      const body = await response.json().catch(() => null);
      throw new Error(body?.error ?? await response.text());
    }

    const result = await response.json();
    closeBatchDialog();
    e.batchCommentText.value = "";
    e.status.textContent = result.message;
    await Promise.all([loadCompanies(), loadSummary()]);
  } catch (error) {
    e.status.textContent =
      error instanceof Error ? error.message : String(error);
  } finally {
    e.saveBatch.disabled = false;
    e.saveBatch.textContent = originalText;
  }
});

function closeCompanyDialog() {
  hideDialog(e.companyDialog);
}

e.closeCompany.onclick = closeCompanyDialog;
e.companyDialog.addEventListener("cancel", closeCompanyDialog);
e.companyDialog.addEventListener("close", () => {
  document.body.classList.remove("modal-open");
});
e.companyDialog.addEventListener("click", (event) => {
  if (clickedOutsideDialog(event, e.companyDialog)) {
    closeCompanyDialog();
  }
});

e.saveCompany.addEventListener("click", async () => {
  await api(`/api/prospects/${e.companyOrgnr.value}`, {
    method: "PUT", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      status: e.companyStatus.value, responsible: e.companyResponsible.value,
      nextContact: e.companyNextContact.value, note: e.companyNote.value,
      activeAgreement: e.companyActiveAgreement.checked,
      agreementType: e.companyAgreementType.value,
      agreementStart: e.companyAgreementStart.value,
      agreementEnd: e.companyAgreementEnd.value,
    }),
  });
  await openCompany(e.companyOrgnr.value);
  await Promise.all([loadCompanies(), loadSummary()]);
});
e.addContact.addEventListener("click", async () => {
  await api(`/api/contacts/${e.companyOrgnr.value}`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: e.contactName.value, role: e.contactRole.value,
      email: e.contactEmail.value, phone: e.contactPhone.value,
    }),
  });
  e.contactName.value = e.contactRole.value =
    e.contactEmail.value = e.contactPhone.value = "";
  await openCompany(e.companyOrgnr.value);
});


e.newGlobalTask.addEventListener("click", () => showDialog(e.taskDialog));
e.closeTaskDialog.addEventListener("click", () => hideDialog(e.taskDialog));
e.taskDialog.addEventListener("click", (event) => { if (clickedOutsideDialog(event, e.taskDialog)) hideDialog(e.taskDialog); });
e.saveGlobalTask.addEventListener("click", async () => {
  await api("/api/tasks", {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({title:e.globalTaskTitle.value, organisationNumber:e.globalTaskOrgnr.value, dueDate:e.globalTaskDue.value, responsible:e.globalTaskResponsible.value, priority:e.globalTaskPriority.value, description:e.globalTaskDescription.value})});
  e.globalTaskTitle.value=e.globalTaskOrgnr.value=e.globalTaskDue.value=e.globalTaskResponsible.value=e.globalTaskDescription.value="";
  hideDialog(e.taskDialog); await loadDashboard();
});
e.addTask.addEventListener("click", async () => {
  await api("/api/tasks", {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({organisationNumber:e.companyOrgnr.value, title:e.taskTitle.value, dueDate:e.taskDueDate.value, priority:e.taskPriority.value, responsible:e.companyResponsible.value})});
  e.taskTitle.value=e.taskDueDate.value=""; await openCompany(e.companyOrgnr.value); await loadDashboard();
});

function debounce(element, callback) {
  element.addEventListener("input", () => {
    clearTimeout(element.timer);
    element.timer = setTimeout(callback, 250);
  });
}
debounce(e.companySearch, () => {
  e.status.textContent =
    "Søket er endret. Trykk «Oppdater og vis resultat».";
});
debounce(e.firmSearch, () => { state.firmsPage = 1; loadFirms(); });

e.companySort.addEventListener("change", () => {
  state.companiesPage = 1;
  loadCompanies();
});
e.companyPageSize.addEventListener("change", () => {
  state.companiesPageSize = Number(e.companyPageSize.value);
  state.companiesPage = 1;
  loadCompanies();
});
e.firmsPrev.addEventListener("click", () => {
  if (state.firmsPage > 1) { state.firmsPage -= 1; loadFirms(); }
});
e.firmsNext.addEventListener("click", () => {
  if (state.firmsPage < state.firmsTotalPages) { state.firmsPage += 1; loadFirms(); }
});
e.companiesPrev.addEventListener("click", () => {
  if (state.companiesPage > 1) { state.companiesPage -= 1; loadCompanies(); }
});
e.companiesNext.addEventListener("click", () => {
  if (state.companiesPage < state.companiesTotalPages) {
    state.companiesPage += 1; loadCompanies();
  }
});

function exportUrl(extension) {
  const p = params();
  p.delete("page"); p.delete("pageSize"); p.delete("sort"); p.delete("direction");
  return `/api/export/companies.${extension}?${p}`;
}
e.exportXlsx.addEventListener("click", () => location.assign(exportUrl("xlsx")));
e.exportCsv.addEventListener("click", () => location.assign(exportUrl("csv")));

e.themeToggle.addEventListener("click", () => {
  const dark = document.documentElement.classList.toggle("dark");
  localStorage.setItem("theme", dark ? "dark" : "light");
  e.themeToggle.textContent = dark ? "Lys modus" : "Mørk modus";
});
if (localStorage.getItem("theme") === "dark") {
  document.documentElement.classList.add("dark");
  e.themeToggle.textContent = "Lys modus";
}

(async () => {
  try {
    await loadIndustries();
    await loadOptions();
    await loadDashboard();
  } catch (error) {
    e.status.textContent = error instanceof Error ? error.message : String(error);
    console.error(error);
  }
})();
