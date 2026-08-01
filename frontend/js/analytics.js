const token = localStorage.getItem("token");
if (!token) window.location.href = "login.html";

async function fetchAnalytics() {
  const res = await fetch("/api/users/me/analytics", {
    headers: { "Authorization": `Bearer ${token}` }
  });
  if (res.ok) {
    const data = await res.json();
    document.getElementById("rateVal").innerText = `${data.completion_rate}%`;

    const ctx = document.getElementById('splitChart').getContext('2d');
    new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: ['Completed', 'Pending', 'Overdue'],
        datasets: [{
          data: [data.completed_tasks, data.total_tasks - data.completed_tasks - data.overdue_tasks, data.overdue_tasks],
          backgroundColor: ['#10b981', '#6366f1', '#ef4444'],
          borderColor: '#0f172a',
          borderWidth: 2
        }]
      },
      options: {
        responsive: true,
        plugins: {
          legend: { labels: { color: '#94a3b8' } }
        }
      }
    });
  }
}

fetchAnalytics();