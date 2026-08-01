const token = localStorage.getItem("token");
if (!token) window.location.href = "login.html";

async function loadProfile() {
  const res = await fetch("/api/users/me", {
    headers: { "Authorization": `Bearer ${token}` }
  });
  if (res.ok) {
    const data = await res.json();
    document.getElementById("profileUsername").innerText = data.username;
    document.getElementById("profileEmail").innerText = data.email;
    document.getElementById("profileLevel").innerText = data.level;
    document.getElementById("profileRep").innerText = data.reputation_score;
    document.getElementById("profileInitials").innerText = data.username.substring(0, 2).toUpperCase();
  }
}

loadProfile();