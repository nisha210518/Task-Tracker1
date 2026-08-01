const token = localStorage.getItem("token");
if (!token) {
  window.location.href = "login.html";
}

async function renderCalendar() {
  const res = await fetch(`/api/tasks?_=${new Date().getTime()}`, {
    headers: { "Authorization": `Bearer ${token}` }
  });
  if (!res.ok) return;
  const tasks = await res.json();

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  
  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  document.getElementById("currentMonthYear").innerText = `${monthNames[month]} ${year}`;

  const firstDayIndex = new Date(year, month, 1).getDay();
  const totalDays = new Date(year, month + 1, 0).getDate();

  const grid = document.getElementById("calendarGrid");
  if (!grid) return;
  grid.innerHTML = "";

  // Append empty offsets for preceding month
  for (let i = 0; i < firstDayIndex; i++) {
    const cell = document.createElement("div");
    cell.className = "h-24 bg-slate-950/20 rounded-lg border border-slate-900/10";
    grid.appendChild(cell);
  }

  // Populate active month days
  for (let day = 1; day <= totalDays; day++) {
    const cell = document.createElement("div");
    cell.className = "h-24 p-2 bg-slate-800 border border-slate-700 rounded-lg flex flex-col justify-between overflow-y-auto";
    
    const dayLabel = document.createElement("span");
    dayLabel.className = "text-xs font-bold text-slate-400";
    dayLabel.innerText = day;
    cell.appendChild(dayLabel);

    // Locate matching deadlines
    const matchingTasks = tasks.filter(t => {
      if (!t.due_date) return false;
      const d = new Date(t.due_date);
      
      // If it is a one-time task, it must match the exact day, month, and year
      if (t.recurrence_interval === 'once' || !t.is_recurring) {
        return d.getDate() === day && d.getMonth() === month && d.getFullYear() === year;
      }
      
      // If it is a daily recurring task, it should show up on every day on or after its start date
      const startZero = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      const cellZero = new Date(year, month, day);
      
      return cellZero >= startZero;
    });

    matchingTasks.forEach(t => {
      const el = document.createElement("div");
      el.className = "text-[9px] bg-indigo-950 text-indigo-300 border border-indigo-900 px-1 rounded mt-1 truncate";
      el.innerText = t.title;
      cell.appendChild(el);
    });

    grid.appendChild(cell);
  } // <-- Added to close the 'for' loop of days
} // <-- Added to close the 'renderCalendar' function

renderCalendar();

  // venv\Scripts\python -m uvicorn main:app --reload --port 8000

  