function clearLocalSession() {
  localStorage.removeItem("token");
  window.location.href = "login.html";
}