const token = localStorage.getItem("token");
if (!token) window.location.href = "login.html";

let activeTasks = [];
const alarmAudio = new Audio("https://bigsoundbank.com/UPLOAD/mp3/1464.mp3");
alarmAudio.loop = true; 

let ringingTaskId = null;
let triggeredAlarms = new Set();

// Request notification permission
if (typeof Notification !== "undefined" && Notification.permission !== "granted" && Notification.permission !== "denied") {
  Notification.requestPermission();
}

// Fetch AI Coaching tip from backend
async function loadAICoaching() {
  const el = document.getElementById("aiCoachingText");
  if (!el) return;
  try {
    const res = await fetch(`/api/tasks/ai-coaching?_=${new Date().getTime()}`, {
      headers: { "Authorization": `Bearer ${token}` }
    });
    if (res.ok) {
      const data = await res.json();
      el.innerText = data.coaching_tip;
    }
  } catch (err) {
    console.error("Error loading AI coaching tip:", err);
  }
}

// Fetch active tasks from PostgreSQL
async function loadTasks() {
  const res = await fetch(`/api/tasks?_=${new Date().getTime()}`, {
    headers: { "Authorization": `Bearer ${token}` }
  });
  if (res.ok) {
    const data = await res.json();
    activeTasks = data.filter(t => t.status !== "completed" && t.status !== "overdue");
    
    const now = new Date();
    const hasOverdue = activeTasks.some(t => t.due_date && new Date(t.due_date) < now);
    
    document.getElementById("rolloverBanner").classList.toggle("hidden", !hasOverdue);
    
    const list = document.getElementById("taskList");
    list.innerHTML = activeTasks.map(t => {
      const isOverdue = t.due_date && new Date(t.due_date) < now;
      const priorityBadge = `<span class="text-[9px] uppercase font-bold text-slate-300 bg-slate-700 px-2 py-0.5 rounded">${t.priority}</span>`;
      
      const warningBadge = isOverdue ? `
        <span class="text-[9px] uppercase font-bold text-red-300 bg-red-950 border border-red-800 px-2 py-0.5 rounded animate-pulse">
          ⚠️ DELAYED (WARNING)
        </span>
      ` : `
        <span class="text-[9px] uppercase font-bold text-sky-300 bg-sky-950 border border-sky-900 px-2 py-0.5 rounded font-mono">
          In Progress
        </span>
      `;
      
      let alertLabel = "No alarm set";
      if (t.due_date) {
        const formattedDate = new Date(t.due_date).toLocaleString();
        if (t.alert_type === "notification") {
          alertLabel = `🔔 Notification scheduled for: ${formattedDate}`;
        } else {
          alertLabel = `⏰ Alarm set for: ${formattedDate}`;
        }
      }

      return `
        <div class="p-4 bg-slate-800 border ${isOverdue ? 'border-red-900/80 bg-red-950/10 shadow-lg shadow-red-950/20' : 'border-slate-700'} rounded-xl flex justify-between items-center transition-all duration-300">
          <div>
            <div class="flex items-center gap-1.5">
              ${priorityBadge}
              ${warningBadge}
            </div>
            <h4 class="font-semibold ${isOverdue ? 'text-red-200' : 'text-slate-100'} mt-1.5">${t.title}</h4>
            <p class="text-xs text-slate-400">${t.description || ""}</p>
            <p class="text-[10px] ${isOverdue ? 'text-red-400 font-bold' : 'text-indigo-400'} font-mono mt-1">${alertLabel}</p>
          </div>
          <div class="flex items-center gap-1.5">
            <button onclick="complete(${t.id})" class="bg-emerald-600 hover:bg-emerald-700 px-3 py-1.5 rounded-lg text-xs font-bold transition">Complete</button>
            <button onclick="deleteTask(${t.id})" class="bg-red-950/40 hover:bg-red-600 border border-red-900/40 text-red-400 hover:text-white px-3 py-1.5 rounded-lg text-xs font-bold transition">Delete</button>
          </div>
        </div>
      `;
    }).join("") || `<p class="text-sm text-slate-500 py-4 text-center">No active tasks. Create one above!</p>`;
  }
}

// Form Submission
document.getElementById("taskForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const title = document.getElementById("title").value;
  const description = document.getElementById("desc").value;
  const priority = document.getElementById("priority").value;
  const alarmDate = document.getElementById("taskDueDate").value;
  const recurrence = document.getElementById("taskRecurrence").value;
  const isRecurring = recurrence === "daily";
  const alertType = document.getElementById("taskAlertType").value;
  
  await fetch("/api/tasks", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
    body: JSON.stringify({ 
      title, 
      description, 
      priority,
      due_date: new Date(alarmDate).toISOString(),
      is_recurring: isRecurring,
      recurrence_interval: recurrence,
      alert_type: alertType
    })
  });
  
  document.getElementById("title").value = "";
  document.getElementById("desc").value = "";
  document.getElementById("taskDueDate").value = "";
  document.getElementById("taskRecurrence").value = "once";
  document.getElementById("taskAlertType").value = "alarm";
  
  await loadTasks();
  await loadAICoaching();

  // AUTOMATIC REDIRECTION: If on mobile, slide back to Dashboard immediately [1]
  if (window.innerWidth < 768) {
    switchMobileTab('dashboard');
  }
});

// Complete Task
async function complete(id) {
  if (ringingTaskId === id) {
    dismissAlarm();
  }
  await fetch(`/api/tasks/${id}/complete`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${token}` }
  });
  await loadTasks();
  await loadAICoaching();
}

// Delete Task
async function deleteTask(id) {
  if (!confirm("Are you sure you want to delete this task?")) return;
  if (ringingTaskId === id) {
    dismissAlarm();
  }
  
  try {
    const res = await fetch(`/api/tasks/${id}`, {
      method: "DELETE",
      headers: { "Authorization": `Bearer ${token}` }
    });
    
    if (res.ok) {
      await loadTasks();
      await loadAICoaching();
    } else {
      const errData = await res.json();
      alert("Failed to delete task: " + (errData.detail || "Unknown error"));
    }
  } catch (err) {
    alert("Network error: Could not reach backend server.");
  }
}

// Run Rollover logic
async function runRollover() {
  await fetch("/api/tasks/rollover", {
    method: "POST",
    headers: { "Authorization": `Bearer ${token}` }
  });
  await loadTasks();
  await loadAICoaching();
}

// =========================================================================
// MOBILE SCREEN WORKSPACE TAB SWITCHER (Only active under 768px width) [1]
// =========================================================================
function switchMobileTab(tab) {
  const formCont = document.getElementById("formContainer");
  const dashCont = document.getElementById("dashboardContainer");
  const tabDash = document.getElementById("tabDashboard");
  const tabForm = document.getElementById("tabForm");
  
  if (!formCont || !dashCont || !tabDash || !tabForm) return;

  if (tab === 'dashboard') {
    dashCont.classList.remove("hidden");
    formCont.classList.add("hidden");
    formCont.classList.remove("block");
    
    tabDash.classList.add("text-indigo-400", "bg-slate-950", "border", "border-slate-800");
    tabDash.classList.remove("text-slate-400");
    tabForm.classList.remove("text-indigo-400", "bg-slate-950", "border", "border-slate-800");
    tabForm.classList.add("text-slate-400");
  } else {
    formCont.classList.remove("hidden");
    formCont.classList.add("block");
    dashCont.classList.add("hidden");
    
    tabForm.classList.add("text-indigo-400", "bg-slate-950", "border", "border-slate-800");
    tabForm.classList.remove("text-slate-400");
    tabDash.classList.remove("text-indigo-400", "bg-slate-950", "border", "border-slate-800");
    tabDash.classList.add("text-slate-400");
  }
}

// =========================================================================
// ALARM TRACKING LOOP (RUNS ONCE PER SECOND)
// =========================================================================
setInterval(() => {
  const now = new Date();
  activeTasks.forEach(task => {
    if (task.due_date) {
      const alarmTime = new Date(task.due_date);
      if (alarmTime <= now && !triggeredAlarms.has(task.id)) {
        triggerActiveAlarm(task);
      }
    }
  });
}, 1000);

function triggerActiveAlarm(task) {
  ringingTaskId = task.id;
  triggeredAlarms.add(task.id);
  
  if (task.alert_type === "notification") {
    console.log("Triggering silent notification for:", task.title);
    if (typeof Notification !== "undefined" && Notification.permission === "granted") {
      new Notification(`TaskFlow Alert!`, {
        body: `Time to start: ${task.title}`
      });
    }
    ringingTaskId = null;
    return;
  }
  
  alarmAudio.play().catch(() => {
    console.log("Audio play blocked until the user interacts with the page.");
  });
  
  const modal = document.getElementById("alarmModal");
  const title = document.getElementById("alarmTaskTitle");
  if (modal && title) {
    title.innerText = task.title;
    modal.classList.remove("hidden");
  }
  
  if (typeof Notification !== "undefined" && Notification.permission === "granted") {
    new Notification(`TaskFlow Alarm Active!`, {
      body: `Time to complete: ${task.title}`,
      requireInteraction: true
    });
  }
}

function dismissAlarm() {
  alarmAudio.pause();
  alarmAudio.currentTime = 0;
  const modal = document.getElementById("alarmModal");
  if (modal) modal.classList.add("hidden");
  ringingTaskId = null;
}

async function snoozeAlarm() {
  if (!ringingTaskId) return;
  const taskToSnooze = activeTasks.find(t => t.id === ringingTaskId);
  if (!taskToSnooze) return;
  
  dismissAlarm();
  const newSnoozeTime = new Date(new Date().getTime() + 5 * 60 * 1000).toISOString();
  
  await fetch(`/api/tasks/${taskToSnooze.id}`, {
    method: "DELETE",
    headers: { "Authorization": `Bearer ${token}` }
  });
  
  await fetch("/api/tasks", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
    body: JSON.stringify({ 
      title: taskToSnooze.title, 
      description: taskToSnooze.description, 
      priority: taskToSnooze.priority,
      due_date: newSnoozeTime,
      is_recurring: taskToSnooze.is_recurring,
      recurrence_interval: taskToSnooze.recurrence_interval,
      alert_type: taskToSnooze.alert_type
    })
  });
  
  await loadTasks();
  await loadAICoaching();
}

window.complete = complete;
window.deleteTask = deleteTask;
window.runRollover = runRollover;
window.dismissAlarm = dismissAlarm;
window.snoozeAlarm = snoozeAlarm;
window.switchMobileTab = switchMobileTab; // Expose globally for mobile buttons [1]

loadTasks();
loadAICoaching();