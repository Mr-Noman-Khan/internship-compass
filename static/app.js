const $ = (s) => document.querySelector(s);
const STATUSES = ["Saved", "Applied", "Assessment", "Interview", "Offer", "Rejected"];
let applications = [];
let activeStatus = "";
let debounceTimer;

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}
function localDate(value) {
  if (!value) return "";
  const [y,m,d] = value.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {day:"numeric",month:"short",year:"numeric"});
}
function dayDifference(value) {
  if (!value) return null;
  const target = new Date(`${value}T00:00:00`);
  const today = new Date(); today.setHours(0,0,0,0);
  return Math.round((target - today) / 86400000);
}
function statusClass(status) { return `pill-${status}`; }

async function api(url, options = {}) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.detail || "Something went wrong. Please try again.");
  return data;
}
function toastError(error) { window.alert(error.message || String(error)); }

async function refresh() {
  try {
    const [stats, data] = await Promise.all([
      api("/api/stats"),
      api(`/api/applications?q=${encodeURIComponent($("#searchInput").value)}&status=${encodeURIComponent(activeStatus)}`)
    ]);
    applications = data.applications;
    $("#totalMetric").textContent = stats.total;
    $("#activeMetric").textContent = stats.active;
    $("#interviewMetric").textContent = stats.interviews;
    $("#offerMetric").textContent = stats.offers;
    $("#deadlineMetric").textContent = stats.upcoming_deadlines;
    $("#navCount").textContent = stats.total;
    $("#deadlineText").textContent = stats.upcoming_deadlines
      ? `${stats.upcoming_deadlines} deadline${stats.upcoming_deadlines === 1 ? "" : "s"} in the next 7 days. Check the list below and plan your next step.`
      : "No deadlines in the next 7 days. Add dates to keep important opportunities on your radar.";
    renderStatusNav(stats.by_status);
    renderApplications();
  } catch (error) { toastError(error); }
}
function renderStatusNav(counts) {
  $("#statusNav").innerHTML = STATUSES.map(status => `
    <button type="button" data-status="${status}" class="${activeStatus === status ? "selected" : ""}">
      <span class="status-dot" style="background:${({"Saved":"#aab5ad","Applied":"#6894ca","Assessment":"#d7a45f","Interview":"#a38bc7","Offer":"#64a77a","Rejected":"#cc8179"})[status]}"></span>
      ${status}<span class="stage-count">${counts[status] || 0}</span>
    </button>`).join("");
  $("#statusNav").querySelectorAll("button").forEach(button => button.addEventListener("click", () => {
    activeStatus = button.dataset.status;
    $("#filterStatus").value = activeStatus;
    refresh();
  }));
  $("#allNav").classList.toggle("selected", !activeStatus);
}
function renderApplications() {
  const sort = $("#sortSelect").value;
  const list = [...applications].sort((a,b) => {
    if (sort === "company") return a.company.localeCompare(b.company);
    if (sort === "updated") return b.updated_at.localeCompare(a.updated_at);
    if (!a.deadline && !b.deadline) return b.updated_at.localeCompare(a.updated_at);
    if (!a.deadline) return 1;
    if (!b.deadline) return -1;
    return a.deadline.localeCompare(b.deadline);
  });
  $("#applicationsBody").innerHTML = list.map(item => {
    const days = dayDifference(item.deadline);
    const deadlineClass = days !== null && days < 0 ? "overdue" : days !== null && days <= 7 ? "soon" : "";
    let deadlineLabel = item.deadline ? localDate(item.deadline) : "Not set";
    if (days !== null && days < 0) deadlineLabel += " · overdue";
    else if (days === 0) deadlineLabel += " · today";
    else if (days === 1) deadlineLabel += " · tomorrow";
    return `<tr>
      <td class="company-cell"><strong>${escapeHtml(item.company)}</strong><span>${escapeHtml(item.role)}</span></td>
      <td><span class="status-pill ${statusClass(item.status)}">${escapeHtml(item.status)}</span></td>
      <td>${escapeHtml(item.location || "—")}<br><span style="color:#9aa39c;font-size:9px">${escapeHtml(item.work_mode)}</span></td>
      <td><span class="deadline ${deadlineClass}">${escapeHtml(deadlineLabel)}</span></td>
      <td><div class="actions"><button class="icon-button edit-button" data-id="${item.id}" title="Edit application" aria-label="Edit ${escapeHtml(item.company)}">↗</button><button class="icon-button delete-button" data-id="${item.id}" title="Delete application" aria-label="Delete ${escapeHtml(item.company)}">×</button></div></td>
    </tr>`;
  }).join("");
  const noResults = list.length === 0;
  $("#emptyState").classList.toggle("hidden", !noResults);
  if (noResults) {
    $("#emptyState h3").textContent = $("#searchInput").value || activeStatus ? "No matching applications." : "Your next chapter starts here.";
    $("#emptyState p").textContent = $("#searchInput").value || activeStatus ? "Try another search or clear the status filter." : "Add an internship or job opportunity to start building your pipeline.";
    $("#emptyAddButton").classList.toggle("hidden", Boolean($("#searchInput").value || activeStatus));
  }
  $("#applicationsBody").querySelectorAll(".edit-button").forEach(button => button.addEventListener("click", () => openEdit(Number(button.dataset.id))));
  $("#applicationsBody").querySelectorAll(".delete-button").forEach(button => button.addEventListener("click", () => deleteApplication(Number(button.dataset.id))));
}
function openModal() {
  $("#applicationForm").reset();
  $("#applicationId").value = "";
  $("#modalTitle").textContent = "Add application";
  $("#saveButton").textContent = "Save application";
  $("#formError").classList.add("hidden");
  $("#modalBackdrop").classList.remove("hidden");
  $("#company").focus();
}
function closeModal() { $("#modalBackdrop").classList.add("hidden"); }
function fillField(id, value) { $(`#${id}`).value = value || ""; }
async function openEdit(id) {
  try {
    const item = await api(`/api/applications/${id}`);
    openModal();
    $("#modalTitle").textContent = "Edit application";
    $("#saveButton").textContent = "Save changes";
    $("#applicationId").value = item.id;
    for (const [key, field] of Object.entries({company:"company",role:"role",location:"location",work_mode:"workMode",status:"status",deadline:"deadline",applied_date:"appliedDate",salary:"salary",url:"url",contact:"contact",notes:"notes"})) fillField(field, item[key]);
  } catch (error) { toastError(error); }
}
async function deleteApplication(id) {
  const item = applications.find(a => a.id === id);
  if (!confirm(`Delete the application for ${item?.company || "this company"}? This cannot be undone.`)) return;
  try { await api(`/api/applications/${id}`, {method:"DELETE"}); await refresh(); }
  catch (error) { toastError(error); }
}
function formPayload() {
  return {
    company: $("#company").value.trim(), role: $("#role").value.trim(),
    location: $("#location").value.trim(), work_mode: $("#workMode").value,
    status: $("#status").value, deadline: $("#deadline").value,
    applied_date: $("#appliedDate").value, salary: $("#salary").value.trim(),
    url: $("#url").value.trim(), contact: $("#contact").value.trim(),
    notes: $("#notes").value.trim()
  };
}

$("#addButton").addEventListener("click", openModal);
$("#emptyAddButton").addEventListener("click", openModal);
$("#closeModal").addEventListener("click", closeModal);
$("#cancelModal").addEventListener("click", closeModal);
$("#modalBackdrop").addEventListener("click", event => { if (event.target === $("#modalBackdrop")) closeModal(); });
document.addEventListener("keydown", event => { if (event.key === "Escape") closeModal(); });
$("#allNav").addEventListener("click", () => { activeStatus = ""; $("#filterStatus").value = ""; refresh(); });
$("#filterStatus").addEventListener("change", () => { activeStatus = $("#filterStatus").value; refresh(); });
$("#sortSelect").addEventListener("change", renderApplications);
$("#searchInput").addEventListener("input", () => {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(refresh, 220);
});
$("#applicationForm").addEventListener("submit", async event => {
  event.preventDefault();
  $("#formError").classList.add("hidden");
  const id = $("#applicationId").value;
  const button = $("#saveButton");
  button.disabled = true;
  try {
    await api(id ? `/api/applications/${id}` : "/api/applications", {
      method: id ? "PUT" : "POST",
      headers: {"Content-Type":"application/json"},
      body: JSON.stringify(formPayload())
    });
    closeModal();
    activeStatus = "";
    $("#filterStatus").value = "";
    await refresh();
  } catch (error) {
    $("#formError").textContent = error.message;
    $("#formError").classList.remove("hidden");
  } finally { button.disabled = false; }
});

$("#todayLabel").textContent = new Date().toLocaleDateString(undefined, {weekday:"long",month:"long",day:"numeric"}).toUpperCase();
refresh();
