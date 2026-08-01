const token = localStorage.getItem("token");

if (!token) {
  window.location.href = "login.html";
}

// Global state arrays
let activeTasks = [];
let archivedTasks = [];

async function getTasks() {
  try {
    const res = await fetch("/api/tasks", {
      headers: { "Authorization": `Bearer ${token}` }
    });
    if (res.ok) {
      const data = await res.json();
      activeTasks = data.filter(t => t.status !== "completed" && t.status !== "overdue");
      archivedTasks = data.filter(t => t.status === "overdue");
      renderBoards();
    } else if (res.status === 401) {
      logout();
    }
  } catch (err) {
    console.error("Error retrieving tasks:", err);
  }
}

function renderBoards() {
  const activeBox = document.getElementById("activeList");
  const archiveBox = document.getElementById("archiveList");

  // Render Active Tasks
  if (activeTasks.length === 0) {
    activeBox.innerHTML = `<p class="text-sm text-slate-500 py-4 text-center">No active tasks found.</p>`;
  } else {
    activeBox.innerHTML = activeTasks.map(t => `
      <div class="p-4 bg-slate-800/80 border border-slate-700 rounded-xl flex justify-between items-center">
        <div>
          <div class="flex items-center gap-2">
            <span class="text-[10px] uppercase font-bold tracking-widest px-2 py-0.5 rounded bg-slate-700 text-slate-300">${t.priority}</span>
            ${t.rollover_count > 0 ? `<span class="text-[10px] bg-amber-950/40 border border-amber-900 text-amber-300 px-1.5 rounded">Rollovers: ${t.rollover_count}</span>` : ""}
          </div>
          <h4 class="font-semibold text-slate-100 mt-1">${t.title}</h4>
          <p class="text-xs text-slate-400">${t.description || ""}</p>
        </div>
        <div class="flex items-center gap-2">
          <button onclick="completeTask(${t.id})" class="text-xs bg-emerald-600 hover:bg-emerald-700 px-2.5 py-1.5 rounded-lg transition font-medium">Done</button>
        </div>
      </div>
    `).join("");
  }

  // Render Archived Tasks
  if (archivedTasks.length === 0) {
    archiveBox.innerHTML = `<p class="text-xs text-slate-600 py-2 text-center">Backlog is currently empty.</p>`;
  } else {
    archiveBox.innerHTML = archivedTasks.map(t => `
      <div class="p-4 bg-slate-950/60 border border-red-950 rounded-xl flex justify-between items-center">
        <div>
          <span class="text-[9px] uppercase tracking-wider bg-red-950/40 text-red-400 border border-red-900 px-2 py-0.5 rounded font-black">Fatigue Shielded</span>
          <h4 class="font-semibold text-slate-200 mt-1.5">${t.title}</h4>
          <p class="text-xs text-slate-500">${t.description || ""}</p>
        </div>
        <button onclick="completeTask(${t.id})" class="text-xs bg-slate-800 hover:bg-slate-700 text-emerald-400 px-2.5 py-1.5 rounded-lg transition">Resolve</button>
      </div>
    `).join("");
  }
}

// Add new Task
document.getElementById("taskForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const title = document.getElementById("taskTitle").value;
  const description = document.getElementById("taskDesc").value;
  const priority = document.getElementById("taskPriority").value;

  try {
    const res = await fetch("/api/tasks", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify({ title, description, priority })
    });
    if (res.ok) {
      document.getElementById("taskTitle").value = "";
      document.getElementById("taskDesc").value = "";
      getTasks();
    }
  } catch (err) {
    console.error(err);
  }
});

async function completeTask(id) {
  try {
    const res = await fetch(`/api/tasks/${id}/complete`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${token}` }
    });
    if (res.ok) getTasks();
  } catch (err) {
    console.error(err);
  }
}

async function triggerRollover() {
  try {
    const res = await fetch("/api/tasks/rollover", {
      method: "POST",
      headers: { "Authorization": `Bearer ${token}` }
    });
    if (res.ok) getTasks();
  } catch (err) {
    console.error(err);
  }
}

function logout() {
  localStorage.removeItem("token");
  window.location.href = "login.html";
}

// Connect WebSocket updates
const ws = new WebSocket(`ws://${window.location.host}/ws/updates`);
ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  const feed = document.getElementById("liveFeed");
  const logMessage = document.createElement("p");
  
  if (data.event === "TASK_COMPLETED") {
    logMessage.innerText = `[Task Completed] User ${data.user} finished: "${data.task}"`;
  } else if (data.event === "ROLLOVER_COMPLETE") {
    logMessage.innerText = `[Engine Alert] Smart Rollover execution finished. (Postponed: ${data.processed}, Shielded: ${data.burnout_archives})`;
  }
  
  feed.appendChild(logMessage);
  feed.scrollTop = feed.scrollHeight;
};

// Initial task lookup
getTasks();