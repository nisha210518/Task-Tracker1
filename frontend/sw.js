// frontend/sw.js
// This script runs in the background of the operating system [2]

self.addEventListener('push', function(event) {
  try {
    const data = event.data ? event.data.json() : { title: "TaskFlow Alert", body: "Time's up!" };
    
    const options = {
      body: data.body,
      icon: 'https://img.icons8.com/color/192/calendar--v1.png',
      badge: 'https://img.icons8.com/color/192/calendar--v1.png',
      vibrate: [200, 100, 200, 100, 200],
      requireInteraction: true // Keeps notification visible until clicked
    };

    event.waitUntil(
      self.registration.showNotification(data.title, options)
    );
  } catch (err) {
    console.error("Error displaying push notification:", err);
  }
});

// Handle clicking on the background notification
self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then(function(clientList) {
      for (var i = 0; i < clientList.length; i++) {
        var client = clientList[i];
        if (client.url.includes('solo.html') && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow('solo.html');
      }
    })
  );
});