const token = localStorage.getItem("token");
if (!token) {
  window.location.href = "login.html";
}

let currentGroupId = null;
let currentGroupOwnerId = null;
let currentUserId = null;
let chartInstance = null;
let activeChartType = 'burndown';
let wsConn = null; // Global tracker for active WebSocket connection

// Load user profile
async function fetchMe() {
  try {
    const res = await fetch(`/api/users/me?_=${new Date().getTime()}`, {
      headers: { "Authorization": `Bearer ${token}` }
    });
    if (res.ok) {
      const data = await res.json();
      currentUserId = data.id;
      await loadGroups();
      setupWebSocket(); // Launch WebSockets on script boot
    } else {
      logout();
    }
  } catch (err) {
    console.error("Error verifying authentication profile:", err);
  }
}

function logout() {
  localStorage.removeItem("token");
  window.location.href = "login.html";
}

// =========================================================================
// REAL-TIME WEBSOCKET NOTIFICATION TOAST ENGINE
// =========================================================================
function setupWebSocket() {
  const wsUrl = `ws://${window.location.host}/ws/updates`;
  wsConn = new WebSocket(wsUrl);
  
  wsConn.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      console.log("WebSocket Broadcast Event Received:", data);
      
      if (data.event === "TASK_COMPLETED") {
        showToast(`🏆 **${data.user}** completed: "${data.task}"!`);
      } else if (data.event === "ROLLOVER_COMPLETE") {
        showToast(`⏰ **Smart Rollover finished:** Shifted ${data.burnout_archives} tasks.`);
      }
    } catch (err) {
      console.error("Error processing WebSocket payload:", err);
    }
  };
  
  wsConn.onclose = () => {
    console.warn("WebSocket disconnected. Attempting reconnect in 5s...");
    setTimeout(setupWebSocket, 5000);
  };
}

// Render dynamic, animated sliding toast notices
function showToast(message) {
  const container = document.getElementById("toastContainer");
  if (!container) return;
  
  const toast = document.createElement("div");
  toast.className = "bg-slate-900 border border-emerald-500 text-emerald-200 text-xs px-4 py-3 rounded-xl shadow-2xl flex items-center gap-2 transform translate-y-10 opacity-0 transition-all duration-300 pointer-events-auto max-w-sm";
  toast.innerHTML = `<span>🔔</span> <span>${message}</span>`;
  
  container.appendChild(toast);
  
  // Trigger slide-in transition
  setTimeout(() => {
    toast.classList.remove("translate-y-10", "opacity-0");
  }, 100);
  
  // Slide-out and delete element automatically after 5s
  setTimeout(() => {
    toast.classList.add("translate-y-10", "opacity-0");
    setTimeout(() => toast.remove(), 300);
  }, 5000);
}

// Fetch and list groups
async function loadGroups() {
  try {
    const res = await fetch(`/api/groups?_=${new Date().getTime()}`, {
      headers: { "Authorization": `Bearer ${token}` }
    });
    
    if (res.ok) {
      const data = await res.json();
      const list = document.getElementById("groupsList");
      if (!list) return;

      if (!Array.isArray(data)) {
        list.innerHTML = `<p class="text-xs text-red-400 p-4">Error loading groups.</p>`;
        return;
      }

      list.innerHTML = data.map(g => {
        const escapedName = g.name.replace(/'/g, "\\'");
        
        // TYPE-SAFE CHECK: Ensures the delete button shows for the creator [2.5]
        const isOwner = (Number(currentUserId) === Number(g.owner_id));
        
        return `
          <div class="relative group w-full mb-2">
            <!-- Group Selection Button -->
            <button onclick="selectGroup(${g.id}, '${escapedName}', '${g.invite_code}', ${g.owner_id}, '${g.webhook_url || ''}')" 
                    class="w-full text-left p-4 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-2xl transition-all duration-200 pr-20 shadow-sm">
              <div class="flex items-center gap-3">
                <div class="h-8 w-8 rounded-full bg-indigo-600/20 text-indigo-400 flex items-center justify-center font-bold text-xs">
                  ${g.name.substring(0, 1).toUpperCase()}
                </div>
                <h4 class="font-bold text-sm text-slate-200 truncate">${g.name}</h4>
              </div>
            </button>
            
            <!-- THE DELETE BUTTON: Shows only for the Group Admin (Owner) -->
            ${isOwner ? `
              <button onclick="event.stopPropagation(); deleteGroupDirect(${g.id})" 
                      class="absolute right-3 top-1/2 -translate-y-1/2 bg-red-950/30 hover:bg-red-600 text-red-500 hover:text-white p-2 rounded-xl transition duration-200 border border-red-900/20">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-4 h-4">
                  <path stroke-linecap="round" stroke-linejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                </svg>
              </button>
            ` : ""}
          </div>
        `;
      }).join("") || `<p class="text-xs text-slate-500 py-8 text-center uppercase tracking-widest font-bold opacity-50">No groups found</p>`;
    }
  } catch (err) {
    console.error("Error loading groups list:", err);
  }
}

// Create a new group
async function createGroup() {
  const name = document.getElementById("grpName").value;
  if (!name.trim()) return;
  
  try {
    const res = await fetch("/api/groups", {
      method: "POST",
      headers: { 
        "Content-Type": "application/json", 
        "Authorization": `Bearer ${token}` 
      },
      body: JSON.stringify({ name })
    });
    
    if (res.ok) {
      document.getElementById("grpName").value = "";
      await loadGroups();
    }
  } catch (err) {
    console.error("Error creating group:", err);
  }
}

// Delete Entire Group Workspace (Admin only)
async function deleteGroup() {
  if (!confirm("Are you sure you want to permanently delete this entire group workspace?")) return;
  
  try {
    const res = await fetch(`/api/groups/${currentGroupId}`, {
      method: "DELETE",
      headers: { "Authorization": `Bearer ${token}` }
    });
    if (res.ok) {
      const workspace = document.getElementById("activeWorkspace");
      if (workspace) workspace.classList.add("hidden");
      currentGroupId = null;
      await loadGroups();
    }
  } catch (err) {
    console.error("Error deleting active group:", err);
  }
}

// Delete targeted group directly from the sidebar (Admin only)
async function deleteGroupDirect(groupId) {
  // 1. Ask for confirmation [1]
  const confirmed = confirm("⚠️ Are you sure? This will permanently delete the group and all its tasks for everyone.");
  if (!confirmed) return;
  
  try {
    const res = await fetch(`/api/groups/${groupId}`, {
      method: "DELETE",
      headers: { "Authorization": `Bearer ${token}` }
    });
    
    if (res.ok) {
      // 2. If the deleted group was the one we were looking at, hide the workspace panel
      if (Number(currentGroupId) === Number(groupId)) {
        document.getElementById("activeWorkspace").classList.add("hidden");
        currentGroupId = null;
      }
      
      // 3. Refresh the sidebar list [3]
      await loadGroups();
      
      // 4. Show a success toast
      if (typeof showToast === "function") showToast("Group deleted successfully.");
    } else {
      const data = await res.json();
      alert("Error: " + (data.detail || "Could not delete group."));
    }
  } catch (err) {
    console.error("Delete request failed:", err);
    alert("Network error: Could not reach server.");
  }
}

// Ensure these are accessible to the HTML onclick buttons [1]
window.deleteGroupDirect = deleteGroupDirect;
window.deleteGroup = deleteGroup;

// Save Discord Webhook URL (Admin only)
async function saveWebhookUrl() {
  const url = document.getElementById("webhookInput").value.trim();
  try {
    const res = await fetch(`/api/groups/${currentGroupId}/webhook`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify({ webhook_url: url })
    });
    if (res.ok) {
      showToast("Discord Webhook saved successfully!");
      await loadGroups();
    }
  } catch (err) {
    console.error("Error saving webhook:", err);
  }
}

// Select active Group Workspace
async function selectGroup(id, name, code, ownerId, webhookUrl) {
  console.log("selectGroup clicked:", id, name, code, ownerId);
  currentGroupId = id;
  currentGroupOwnerId = ownerId;
  
  const workspace = document.getElementById("activeWorkspace");
  if (workspace) workspace.classList.remove("hidden");
  
  const nameEl = document.getElementById("activeGroupName");
  if (nameEl) nameEl.innerText = name;
  
  const codeEl = document.getElementById("activeInviteCode");
  if (codeEl) codeEl.innerText = code;
  
  // Show / Hide Admin integration options based on owner status
  const delGroupBtn = document.getElementById("deleteGroupBtn");
  const webhookPanel = document.getElementById("webhookAdminPanel");
  const webhookInput = document.getElementById("webhookInput");
  
  const isAdmin = (Number(currentUserId) == Number(ownerId));
  
  if (delGroupBtn) delGroupBtn.classList.toggle("hidden", !isAdmin);
  if (webhookPanel) webhookPanel.classList.toggle("hidden", !isAdmin);
  if (webhookInput) webhookInput.value = webhookUrl || "";
  
  try { await loadMembers(); } catch (err) {}
  try { await loadGroupTasks(); } catch (err) {}
  
  try {
    if (activeChartType === 'burndown') {
      await loadBurndownChart();
    } else {
      await loadGanttChart();
    }
  } catch (err) {
    console.error("Error displaying chart:", err);
  }
}

// Load group members
async function loadMembers() {
  const res = await fetch(`/api/groups/${currentGroupId}/members?_=${new Date().getTime()}`, {
    headers: { "Authorization": `Bearer ${token}` }
  });
  if (res.ok) {
    const members = await res.json();
    const membersList = document.getElementById("membersList");
    const isAdmin = (Number(currentUserId) == Number(currentGroupOwnerId));
    
    if (membersList) {
      membersList.innerHTML = members.map(m => {
        const canRemove = isAdmin && (m.id !== currentUserId);
        return `
          <div class="flex items-center gap-1.5 bg-slate-800 text-slate-300 border border-slate-700 px-3 py-1 rounded-full text-[10px] font-bold">
            <span>@${m.username}</span>
            ${canRemove ? `<button onclick="removeMember(${m.id})" class="text-red-400 hover:text-red-500 font-extrabold ml-1.5 focus:outline-none">×</button>` : ""}
          </div>
        `;
      }).join("");
    }
    
    const select = document.getElementById("assigneeSelect");
    if (select) {
      select.innerHTML = '<option value="">Assign to Me</option>' + members.map(m => `
        <option value="${m.username}">@${m.username}</option>
      `).join("");
    }
  }
}

// Remove member (Admin only)
async function removeMember(userId) {
  if (!confirm("Are you sure you want to remove this member?")) return;
  
  try {
    const res = await fetch(`/api/groups/${currentGroupId}/members/${userId}`, {
      method: "DELETE",
      headers: { "Authorization": `Bearer ${token}` }
    });
    if (res.ok) {
      await loadMembers();
      await loadGroupTasks();
      
      if (activeChartType === 'burndown') {
        await loadBurndownChart();
      } else {
        await loadGanttChart();
      }
    }
  } catch (err) {
    console.error("Error removing member:", err);
  }
}

// Invite Member
async function addMember() {
  const username = document.getElementById("searchUsername").value.trim();
  const errBox = document.getElementById("addError");
  if (errBox) errBox.classList.add("hidden");
  
  if (!username) return;
  
  try {
    const res = await fetch(`/api/groups/${currentGroupId}/add-member`, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json", 
        "Authorization": `Bearer ${token}` 
      },
      body: JSON.stringify({ username })
    });
    
    const data = await res.json();
    if (res.ok) {
      document.getElementById("searchUsername").value = "";
      await loadMembers();
    } else {
      if (errBox) {
        errBox.innerText = data.detail || "Error adding user.";
        errBox.classList.remove("hidden");
      }
    }
  } catch (err) {
    console.error("Error adding member:", err);
  }
}

// Submit group task (using preventer)
async function submitGroupTask(e) {
  e.preventDefault();
  const title = document.getElementById("taskTitle").value;
  const username = document.getElementById("assigneeSelect").value;
  const startDay = parseInt(document.getElementById("taskStartDay").value || "1");
  const endDay = parseInt(document.getElementById("taskEndDay").value || "3");
  
  try {
    const res = await fetch(`/api/groups/${currentGroupId}/tasks`, { 
      method: "POST",
      headers: { 
        "Content-Type": "application/json", 
        "Authorization": `Bearer ${token}` 
      },
      body: JSON.stringify({ 
        title, 
        assigned_username: username,
        start_day: startDay,
        end_day: endDay
      })
    });
    
    if (res.ok) {
      document.getElementById("taskTitle").value = "";
      document.getElementById("taskStartDay").value = "1";
      document.getElementById("taskEndDay").value = "3";
      
      await loadGroupTasks();
      
      if (activeChartType === 'burndown') {
        await loadBurndownChart();
      } else {
        await loadGanttChart();
      }
    }
  } catch (err) {
    console.error("Error assigning task:", err);
  }
}

// Reassign task (Admin only)
async function reassignTask(taskId, targetUsername) {
  if (!targetUsername) return;
  try {
    const res = await fetch(`/api/groups/${currentGroupId}/tasks/${taskId}/reassign`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify({ username: targetUsername })
    });
    if (res.ok) {
      await loadGroupTasks();
    }
  } catch (err) {
    console.error("Error reassigning task:", err);
  }
}

// Delete group task (Admin only)
async function deleteGroupTask(taskId) {
  if (!confirm("Are you sure you want to delete this task?")) return;
  try {
    const res = await fetch(`/api/groups/${currentGroupId}/tasks/${taskId}`, {
      method: "DELETE",
      headers: { "Authorization": `Bearer ${token}` }
    });
    if (res.ok) {
      await loadGroupTasks();
      
      if (activeChartType === 'burndown') {
        await loadBurndownChart();
      } else {
        await loadGanttChart();
      }
    }
  } catch (err) {
    console.error("Error deleting group task:", err);
  }
}

// Load list of group tasks
async function loadGroupTasks() {
  const res = await fetch(`/api/groups/${currentGroupId}/tasks?_=${new Date().getTime()}`, {
    headers: { "Authorization": `Bearer ${token}` }
  });
  if (res.ok) {
    const tasks = await res.json();
    
    const membersRes = await fetch(`/api/groups/${currentGroupId}/members?_=${new Date().getTime()}`, {
      headers: { "Authorization": `Bearer ${token}` }
    });
    const members = membersRes.ok ? await membersRes.json() : [];
    
    const list = document.getElementById("groupTaskList");
    const isAdmin = (Number(currentUserId) == Number(currentGroupOwnerId));
    
    if (list) {
      list.innerHTML = tasks.map(t => {
        const isCompleted = t.status === 'completed';
        const assignee = members.find(m => m.id === t.owner_id);
        const assigneeName = assignee ? assignee.username : "Unassigned";
        
        const reassignSelect = isAdmin ? `
          <select onchange="reassignTask(${t.id}, this.value)" class="bg-slate-900 text-[10px] text-slate-400 border border-slate-700 rounded px-1 py-0.5 focus:outline-none">
            <option value="">Reassign...</option>
            ${members.map(m => `<option value="${m.username}" ${m.id === t.owner_id ? 'selected' : ''}>@${m.username}</option>`).join("")}
          </select>
        ` : "";
        
        const deleteButton = isAdmin ? `
          <button onclick="deleteGroupTask(${t.id})" class="text-[9px] text-red-400 hover:text-red-500 font-bold bg-red-950/20 border border-red-900/30 px-1.5 py-0.5 rounded transition">Delete</button>
        ` : "";
        
        return `
          <div class="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-2 text-xs">
            <div class="flex justify-between items-center">
              <span class="${isCompleted ? 'line-through text-slate-500 font-normal' : 'text-slate-200 font-semibold'}">${t.title}</span>
              <span class="text-[9px] font-bold ${isCompleted ? 'text-emerald-400' : 'text-amber-400'}">${t.status}</span>
            </div>
            
            <div class="flex justify-between items-center text-[10px] text-slate-400 pt-1.5 border-t border-slate-900">
              <span>Assigned to: <strong class="text-indigo-400">@${assigneeName}</strong></span>
              <div class="flex items-center gap-1.5">
                ${reassignSelect}
                ${deleteButton}
              </div>
            </div>
          </div>
        `;
      }).join("") || `<p class="text-xs text-slate-500 py-2 text-center">No tasks inside group workspace.</p>`;
    }
  }
}

// =========================================================================
// 6. ANALYTICS (BURNDOWN & DYNAMIC GANTT CHART VISUALIZATIONS)
// =========================================================================
async function switchChart(type) {
  activeChartType = type;
  const btnBurndown = document.getElementById("btnBurndown");
  const btnGantt = document.getElementById("btnGantt");
  const chartTitle = document.getElementById("chartTitle");
  
  if (!btnBurndown || !btnGantt || !chartTitle) return;

  if (type === 'burndown') {
    chartTitle.innerText = "Team Burn-down Performance";
    btnBurndown.classList.add("text-emerald-400", "bg-slate-900", "border", "border-slate-800");
    btnBurndown.classList.remove("text-slate-400");
    btnGantt.classList.remove("text-emerald-400", "bg-slate-900", "border", "border-slate-800");
    btnGantt.classList.add("text-slate-400");
    await loadBurndownChart();
  } else {
    chartTitle.innerText = "Project Gantt Timeline";
    btnGantt.classList.add("text-emerald-400", "bg-slate-900", "border", "border-slate-800");
    btnGantt.classList.remove("text-slate-400");
    btnBurndown.classList.remove("text-emerald-400", "bg-slate-900", "border", "border-slate-800");
    btnBurndown.classList.add("text-slate-400");
    await loadGanttChart();
  }
}

async function loadBurndownChart() {
  const res = await fetch(`/api/groups/${currentGroupId}/burndown?_=${new Date().getTime()}`, {
    headers: { "Authorization": `Bearer ${token}` }
  });
  if (res.ok) {
    const data = await res.json();
    const canvas = document.getElementById('burndownChart');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (chartInstance) chartInstance.destroy();
    
    chartInstance = new Chart(ctx, {
      type: 'line',
      data: {
        labels: data.labels,
        datasets: [
          {
            label: 'Ideal Progression (Remaining)',
            data: data.ideal_burn,
            borderColor: '#94a3b8',
            borderDash: [5, 5],
            fill: false
          },
          {
            label: 'Actual Progression (Remaining)',
            data: data.actual_burn,
            borderColor: '#10b981',
            fill: false,
            tension: 0.1
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: { ticks: { color: '#94a3b8' }, grid: { color: '#1e293b' } },
          x: { ticks: { color: '#94a3b8' }, grid: { color: '#1e293b' } }
        },
        plugins: {
          legend: { labels: { color: '#94a3b8' } }
        }
      }
    });
  }
}

async function loadGanttChart() {
  const res = await fetch(`/api/groups/${currentGroupId}/tasks?_=${new Date().getTime()}`, {
    headers: { "Authorization": `Bearer ${token}` }
  });
  if (res.ok) {
    const tasks = await res.json();
    
    const membersRes = await fetch(`/api/groups/${currentGroupId}/members?_=${new Date().getTime()}`, {
      headers: { "Authorization": `Bearer ${token}` }
    });
    const members = membersRes.ok ? await membersRes.json() : [];
    
    const canvas = document.getElementById('burndownChart');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (chartInstance) chartInstance.destroy();
    
    if (tasks.length === 0) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#94a3b8";
      ctx.font = "14px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("No tasks created to plot Gantt Timeline.", canvas.width / 2, canvas.height / 2);
      return;
    }

    const labels = tasks.map(t => {
      const assignee = members.find(m => m.id === t.owner_id);
      const assigneeName = assignee ? assignee.username : "Unassigned";
      return `${t.title} (@${assigneeName})`;
    });
    
    const dataRanges = tasks.map(t => {
      let start = t.start_day || 1;
      let end = t.end_day || 3;
      if (start > end) {
        let temp = start;
        start = end;
        end = temp;
      }
      return [start, end];
    });

    const barColors = tasks.map(t => t.status === "completed" ? '#10b981' : '#6366f1');

    chartInstance = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          label: 'Task Timeline Schedule (Days)',
          data: dataRanges,
          backgroundColor: barColors,
          borderWidth: 1,
          borderRadius: 4,
          borderSkipped: false
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            min: 1,
            max: 6,
            title: { display: true, text: 'Project Timeline (Days 1 to 6)', color: '#94a3b8' },
            ticks: { color: '#94a3b8', stepSize: 1 },
            grid: { color: '#1e293b' }
          },
          y: {
            ticks: { color: '#94a3b8' },
            grid: { display: false }
          }
        },
        plugins: {
          legend: { display: false }
        }
      }
    });
  }
}

// =========================================================================
// 7. EXPLICIT SCOPING FOR HTML ACCESS
// =========================================================================
window.selectGroup = selectGroup;
window.createGroup = createGroup;
window.deleteGroup = deleteGroup;
window.deleteGroupDirect = deleteGroupDirect;
window.addMember = addMember;
window.removeMember = removeMember;
window.reassignTask = reassignTask;
window.deleteGroupTask = deleteGroupTask;
window.switchChart = switchChart;
window.loadBurndownChart = loadBurndownChart;
window.loadGanttChart = loadGanttChart;
window.submitGroupTask = submitGroupTask;
window.saveWebhookUrl = saveWebhookUrl;

// Start checking session and load groups on script boot
fetchMe();